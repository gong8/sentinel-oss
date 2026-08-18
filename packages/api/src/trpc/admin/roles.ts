/**
 * Admin Roles Router
 * Handles role management operations
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwBadRequest, throwConflict, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { analyzeRoleDeletion } from '../../services/deletionImpact.js';
import { adminProcedure, router } from '../init.js';

export const adminRolesRouter = router({
  /**
   * List all roles in the organization
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
      const roles = await prisma.role.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDeleted ? {} : { deletedAt: null }),
        },
        orderBy: [
          { isAdmin: 'desc' }, // Admin roles first
          { name: 'asc' },
        ],
      });

      return roles;
    }),

  /**
   * Get a specific role
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const role = await prisma.role.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
    });

    if (!role) {
      throwNotFound('Role not found');
    }

    return role;
  }),

  /**
   * Create a new role
   * Admin roles are automatically detected by name (case-insensitive "Admin")
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if role name already exists in organization
      const existing = await prisma.role.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          name: input.name,
          deletedAt: null,
        },
      });

      if (existing) {
        throwConflict('Role with this name already exists');
      }

      // Auto-detect admin role by name (case-insensitive)
      const isAdmin = input.name.toLowerCase() === 'admin';

      const role = await prisma.role.create({
        data: {
          name: input.name,
          description: input.description,
          isAdmin,
          organizationId: ctx.auth.organizationId,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ROLE_CREATE,
        resourceType: AdminResourceType.ROLE,
        resourceId: role.id,
        resourceName: role.name,
        actionDetails: {
          name: role.name,
          description: role.description,
          isAdmin: role.isAdmin,
        },
        afterSnapshot: {
          id: role.id,
          name: role.name,
          description: role.description,
          isAdmin: role.isAdmin,
          organizationId: role.organizationId,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return role;
    }),

  /**
   * Update a role
   * Note: Cannot change isAdmin flag - admin status is special
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify role belongs to organization
      const role = await prisma.role.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
        },
      });

      if (!role) {
        throwNotFound('Role not found');
      }

      // If changing name, check for conflicts
      if (input.name && input.name !== role.name) {
        const existing = await prisma.role.findFirst({
          where: {
            organizationId: ctx.auth.organizationId,
            name: input.name,
            id: { not: input.id },
            deletedAt: null,
          },
        });

        if (existing) {
          throwConflict('Role with this name already exists');
        }
      }

      // Auto-detect admin role by name (case-insensitive)
      const isAdmin = input.name ? input.name.toLowerCase() === 'admin' : role.isAdmin;

      // Capture before snapshot
      const beforeSnapshot = {
        id: role.id,
        name: role.name,
        description: role.description,
        isAdmin: role.isAdmin,
        organizationId: role.organizationId,
      };

      const updated = await prisma.role.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          isAdmin,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ROLE_UPDATE,
        resourceType: AdminResourceType.ROLE,
        resourceId: updated.id,
        resourceName: updated.name,
        actionDetails: {
          previousName: role.name,
          newName: updated.name,
          previousDescription: role.description,
          newDescription: updated.description,
          previousIsAdmin: role.isAdmin,
          newIsAdmin: updated.isAdmin,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          isAdmin: updated.isAdmin,
          organizationId: updated.organizationId,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Delete a role (soft delete)
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify role belongs to organization
      const role = await prisma.role.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
        },
      });

      if (!role) {
        throwNotFound('Role not found');
      }

      // Analyze deletion impact
      const impact = await analyzeRoleDeletion(ctx.auth.organizationId, input.id);

      if (!impact.canDelete) {
        const blockerMessages = impact.blockers.map((b) => b.details).join('; ');
        throwBadRequest(`Cannot delete: ${blockerMessages}`);
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: role.id,
        name: role.name,
        description: role.description,
        isAdmin: role.isAdmin,
        organizationId: role.organizationId,
      };

      // Get users who will lose this role (those with other roles - users with only this role block deletion)
      const usersLosingRole = await prisma.userRole.findMany({
        where: {
          roleId: input.id,
          user: {
            userRoles: {
              some: {
                roleId: { not: input.id },
              },
            },
          },
        },
        select: {
          userId: true,
          user: { select: { email: true } },
        },
      });

      // Soft delete role and remove UserRole associations in a transaction
      // This ensures users don't appear to have a deleted role
      await prisma.$transaction([
        // Remove UserRole records for users who have other roles
        prisma.userRole.deleteMany({
          where: {
            roleId: input.id,
            userId: { in: usersLosingRole.map((ur) => ur.userId) },
          },
        }),
        // Soft delete the role
        prisma.role.update({
          where: { id: input.id },
          data: {
            deletedAt: new Date(),
            deletedBy: ctx.auth.user.id,
          },
        }),
      ]);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ROLE_DELETE,
        resourceType: AdminResourceType.ROLE,
        resourceId: role.id,
        resourceName: role.name,
        actionDetails: {
          name: role.name,
          isAdmin: role.isAdmin,
          usersRemovedFromRole: usersLosingRole.length,
          removedUserEmails: usersLosingRole.map((ur) => ur.user.email),
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true, impact, usersRemovedFromRole: usersLosingRole.length };
    }),

  /**
   * Restore a soft-deleted role
   */
  restore: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify role exists and is deleted
      const role = await prisma.role.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: { not: null },
        },
      });

      if (!role) {
        throwNotFound('Role not found or not deleted');
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: role.id,
        name: role.name,
        description: role.description,
        isAdmin: role.isAdmin,
        organizationId: role.organizationId,
        deletedAt: role.deletedAt,
        deletedBy: role.deletedBy,
      };

      // Restore: Clear deletedAt and deletedBy
      const restored = await prisma.role.update({
        where: { id: input.id },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ROLE_RESTORE,
        resourceType: AdminResourceType.ROLE,
        resourceId: restored.id,
        resourceName: restored.name,
        actionDetails: {
          action: 'restore',
          name: restored.name,
          previousDeletedAt: role.deletedAt?.toISOString(),
          previousDeletedBy: role.deletedBy,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: restored.id,
          name: restored.name,
          description: restored.description,
          isAdmin: restored.isAdmin,
          organizationId: restored.organizationId,
          deletedAt: null,
          deletedBy: null,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Get deletion impact preview for a role
   */
  getDeletionImpact: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const role = await prisma.role.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
        },
      });

      if (!role) {
        throwNotFound('Role not found');
      }

      return await analyzeRoleDeletion(ctx.auth.organizationId, input.id);
    }),
});
