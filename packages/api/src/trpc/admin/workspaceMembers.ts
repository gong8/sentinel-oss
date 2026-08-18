/**
 * Admin Workspace Members Router
 * Handles workspace membership management
 */

import { AdminActionType, AdminResourceType, prisma, WorkspaceMemberRole } from '@sentinel/db';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwBadRequest, throwConflict, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { canManageWorkspace } from '../../services/auth.js';
import { getWorkspace } from '../../services/workspace.js';
import {
  addWorkspaceMember,
  countWorkspaceAdmins,
  getWorkspaceMember,
  listWorkspaceMembers,
  removeWorkspaceMember,
} from '../../services/workspaceMember.js';
import { adminProcedure, router } from '../init.js';

export const adminWorkspaceMembersRouter = router({
  /**
   * List members of a workspace
   */
  list: adminProcedure
    .input(z.object({ workspaceId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const workspace = await getWorkspace(ctx.auth.organizationId, input.workspaceId);

      if (!workspace || workspace.deletedAt) {
        throwNotFound('Workspace not found');
      }

      // Check access
      if (!ctx.auth.isOrgOwner && !ctx.auth.workspaceIds.includes(input.workspaceId)) {
        throwNotFound('Workspace not found');
      }

      return listWorkspaceMembers(input.workspaceId);
    }),

  /**
   * Add a member to a workspace
   * Workspace admins and org owners can add members
   * Role is automatically determined by user's org-level admin status
   */
  add: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        userId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getWorkspace(ctx.auth.organizationId, input.workspaceId);

      if (!workspace || workspace.deletedAt) {
        throwNotFound('Workspace not found');
      }

      // Check management permissions
      if (!canManageWorkspace(ctx.auth, input.workspaceId)) {
        throwBadRequest('You do not have permission to manage this workspace');
      }

      // Verify user exists and is in the same organization, include roles
      const user = await prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        throwNotFound('User not found');
      }

      // Check if already a member
      const existing = await getWorkspaceMember(input.workspaceId, input.userId);
      if (existing) {
        throwConflict('User is already a member of this workspace');
      }

      // Determine role based on user's org-level admin status
      const isOrgAdmin = user.userRoles.some((ur) => ur.role.isAdmin);
      const role: WorkspaceMemberRole = isOrgAdmin ? 'ADMIN' : 'MEMBER';

      const member = await addWorkspaceMember(input.workspaceId, input.userId, role);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_MEMBER_ADD,
        resourceType: AdminResourceType.WORKSPACE_MEMBER,
        resourceId: member.id,
        resourceName: `${user.email} in ${workspace.name}`,
        actionDetails: {
          workspaceId: input.workspaceId,
          workspaceName: workspace.name,
          userId: input.userId,
          userEmail: user.email,
          role: role,
          isOrgAdmin: isOrgAdmin,
        },
        afterSnapshot: {
          id: member.id,
          workspaceId: member.workspaceId,
          userId: member.userId,
          role: member.role,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return member;
    }),

  /**
   * Remove a member from a workspace
   * Workspace admins and org owners can remove members
   */
  remove: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        userId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getWorkspace(ctx.auth.organizationId, input.workspaceId);

      if (!workspace || workspace.deletedAt) {
        throwNotFound('Workspace not found');
      }

      // Check management permissions
      if (!canManageWorkspace(ctx.auth, input.workspaceId)) {
        throwBadRequest('You do not have permission to manage this workspace');
      }

      const member = await getWorkspaceMember(input.workspaceId, input.userId);
      if (!member) {
        throwNotFound('Member not found');
      }

      // Prevent removing the last admin
      if (member.role === 'ADMIN') {
        const adminCount = await countWorkspaceAdmins(input.workspaceId);
        if (adminCount <= 1) {
          throwBadRequest('Cannot remove the last workspace admin');
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });

      await removeWorkspaceMember(input.workspaceId, input.userId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_MEMBER_REMOVE,
        resourceType: AdminResourceType.WORKSPACE_MEMBER,
        resourceId: member.id,
        resourceName: `${user?.email ?? input.userId} from ${workspace.name}`,
        actionDetails: {
          workspaceId: input.workspaceId,
          workspaceName: workspace.name,
          userId: input.userId,
          userEmail: user?.email,
          previousRole: member.role,
        },
        beforeSnapshot: {
          id: member.id,
          workspaceId: member.workspaceId,
          userId: member.userId,
          role: member.role,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Update a member's role
   * @deprecated Roles are now automatically determined by org-level admin status.
   * To change a user's workspace role, update their org-level roles instead.
   */
  updateRole: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        userId: z.string().cuid(),
        role: z.nativeEnum(WorkspaceMemberRole),
      }),
    )
    .mutation(async () => {
      throwBadRequest(
        'Workspace roles are automatically determined by org-level admin status. ' +
          "To change a user's workspace role, update their roles in the Users page.",
      );
    }),
});
