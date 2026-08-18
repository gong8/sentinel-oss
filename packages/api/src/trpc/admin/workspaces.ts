/**
 * Admin Workspaces Router
 * Handles workspace management operations
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwBadRequest, throwConflict, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { analyzeWorkspaceDeletion } from '../../services/deletionImpact.js';
import {
  createWorkspace,
  deleteWorkspace,
  generateSlug,
  getWorkspace,
  getWorkspaceBySlug,
  getWorkspaceWithCounts,
  isReservedSlug,
  isWorkspaceNameAvailable,
  restoreWorkspace,
  updateWorkspace,
} from '../../services/workspace.js';
import { adminProcedure, orgOwnerProcedure, router } from '../init.js';

export const adminWorkspacesRouter = router({
  /**
   * List all workspaces in the organization
   * Org owners see all workspaces, others see workspaces they're members of
   */
  list: adminProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { isOrgOwner, workspaceIds } = ctx.auth;

      if (isOrgOwner) {
        // Org owners see all workspaces
        return prisma.workspace.findMany({
          where: {
            organizationId: ctx.auth.organizationId,
            ...(input?.includeDeleted ? {} : { deletedAt: null }),
          },
          include: {
            _count: {
              select: {
                members: true,
                policies: { where: { deletedAt: null } },
                mcpServers: { where: { deletedAt: null } },
                agents: { where: { deletedAt: null } },
              },
            },
          },
          orderBy: { name: 'asc' },
        });
      }

      // Regular admins see workspaces they're members of
      return prisma.workspace.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          id: { in: workspaceIds },
          deletedAt: null,
        },
        include: {
          _count: {
            select: {
              members: true,
              policies: { where: { deletedAt: null } },
              mcpServers: { where: { deletedAt: null } },
              agents: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }),

  /**
   * Get a specific workspace
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const workspace = await getWorkspaceWithCounts(ctx.auth.organizationId, input.id);

    if (!workspace) {
      throwNotFound('Workspace not found');
    }

    // Check access (org owners can see all, others need to be members)
    if (!ctx.auth.isOrgOwner && !ctx.auth.workspaceIds.includes(input.id)) {
      throwNotFound('Workspace not found');
    }

    return workspace;
  }),

  /**
   * Resolve a workspace slug to workspace data
   * Used by frontend to validate workspace access from URL
   */
  getBySlug: adminProcedure
    .input(z.object({ slug: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const workspace = await getWorkspaceBySlug(ctx.auth.organizationId, input.slug);

      if (!workspace) {
        throwNotFound('Workspace not found');
      }

      // Check access (org owners can see all, others need to be members)
      if (!ctx.auth.isOrgOwner && !ctx.auth.workspaceIds.includes(workspace.id)) {
        throwNotFound('Workspace not found');
      }

      return workspace;
    }),

  /**
   * Create a new workspace (org owners only)
   */
  create: orgOwnerProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if the resulting slug would be reserved
      const potentialSlug = generateSlug(input.name);
      if (isReservedSlug(potentialSlug)) {
        throwBadRequest(
          `The name "${input.name}" would create a reserved slug "${potentialSlug}" that conflicts with system routes. Please choose a different name.`,
        );
      }

      // Check name availability
      const isAvailable = await isWorkspaceNameAvailable(ctx.auth.organizationId, input.name);
      if (!isAvailable) {
        throwConflict('Workspace with this name already exists');
      }

      const workspace = await createWorkspace({
        organizationId: ctx.auth.organizationId,
        name: input.name,
        description: input.description,
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_CREATE,
        resourceType: AdminResourceType.WORKSPACE,
        resourceId: workspace.id,
        resourceName: workspace.name,
        actionDetails: {
          name: workspace.name,
          description: workspace.description,
        },
        afterSnapshot: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          organizationId: workspace.organizationId,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return workspace;
    }),

  /**
   * Update a workspace (org owners only)
   */
  update: orgOwnerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getWorkspace(ctx.auth.organizationId, input.id);

      if (!workspace) {
        throwNotFound('Workspace not found');
      }

      // Check name conflict if changing name
      if (input.name && input.name !== workspace.name) {
        // Check if the new name would create a reserved slug
        const potentialSlug = generateSlug(input.name);
        if (isReservedSlug(potentialSlug)) {
          throwBadRequest(
            `The name "${input.name}" would create a reserved slug "${potentialSlug}" that conflicts with system routes. Please choose a different name.`,
          );
        }

        const isAvailable = await isWorkspaceNameAvailable(
          ctx.auth.organizationId,
          input.name,
          input.id,
        );
        if (!isAvailable) {
          throwConflict('Workspace with this name already exists');
        }
      }

      const beforeSnapshot = {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        organizationId: workspace.organizationId,
      };

      const updated = await updateWorkspace(ctx.auth.organizationId, input.id, {
        name: input.name,
        description: input.description,
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_UPDATE,
        resourceType: AdminResourceType.WORKSPACE,
        resourceId: updated.id,
        resourceName: updated.name,
        actionDetails: {
          previousName: workspace.name,
          newName: updated.name,
          previousDescription: workspace.description,
          newDescription: updated.description,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          organizationId: updated.organizationId,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Delete a workspace (soft delete, org owners only)
   */
  delete: orgOwnerProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await getWorkspace(ctx.auth.organizationId, input.id);

      if (!workspace) {
        throwNotFound('Workspace not found');
      }

      // Analyze deletion impact
      const impact = await analyzeWorkspaceDeletion(ctx.auth.organizationId, input.id);

      if (!impact.canDelete) {
        const blockerMessages = impact.blockers.map((b) => b.details).join('; ');
        throwBadRequest(`Cannot delete: ${blockerMessages}`);
      }

      const beforeSnapshot = {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        organizationId: workspace.organizationId,
      };

      // Delete workspace members first
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: input.id },
      });

      // Soft delete the workspace
      await deleteWorkspace(ctx.auth.organizationId, input.id, ctx.auth.user.id);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_DELETE,
        resourceType: AdminResourceType.WORKSPACE,
        resourceId: workspace.id,
        resourceName: workspace.name,
        actionDetails: {
          name: workspace.name,
          impact: impact.warnings,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true, impact };
    }),

  /**
   * Restore a soft-deleted workspace (org owners only)
   */
  restore: orgOwnerProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: { not: null },
        },
      });

      if (!workspace) {
        throwNotFound('Workspace not found or not deleted');
      }

      // Check name availability (in case another workspace with same name was created)
      const isAvailable = await isWorkspaceNameAvailable(
        ctx.auth.organizationId,
        workspace.name,
        input.id,
      );
      if (!isAvailable) {
        throwConflict('Another workspace with this name exists. Rename it before restoring.');
      }

      const beforeSnapshot = {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        deletedAt: workspace.deletedAt,
        deletedBy: workspace.deletedBy,
      };

      await restoreWorkspace(ctx.auth.organizationId, input.id);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_RESTORE,
        resourceType: AdminResourceType.WORKSPACE,
        resourceId: workspace.id,
        resourceName: workspace.name,
        actionDetails: {
          action: 'restore',
          name: workspace.name,
          previousDeletedAt: workspace.deletedAt?.toISOString(),
          previousDeletedBy: workspace.deletedBy,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          deletedAt: null,
          deletedBy: null,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Get deletion impact preview for a workspace
   */
  getDeletionImpact: orgOwnerProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const workspace = await getWorkspace(ctx.auth.organizationId, input.id);

      if (!workspace) {
        throwNotFound('Workspace not found');
      }

      return analyzeWorkspaceDeletion(ctx.auth.organizationId, input.id);
    }),
});
