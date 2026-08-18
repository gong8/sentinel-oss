/**
 * Admin Users Router
 * Handles user management operations
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { analyzeUserDeletion } from '../../services/deletionImpact.js';
import { adminProcedure, router } from '../init.js';

export const adminUsersRouter = router({
  /**
   * List all users in the organization
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
      const users = await prisma.user.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDeleted ? {} : { deletedAt: null }),
        },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Add computed isTokenRevoked field
      return users.map((user) => ({
        ...user,
        isTokenRevoked: user.accessToken.startsWith('revoked_'),
      }));
    }),

  /**
   * Get a specific user
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const user = await prisma.user.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
      include: {
        userRoles: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  }),

  /**
   * Create a new user
   */
  create: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        roleIds: z.array(z.string().cuid()).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify all roles belong to the organization
      const roles = await prisma.role.findMany({
        where: {
          id: { in: input.roleIds },
          organizationId: ctx.auth.organizationId,
        },
      });

      if (roles.length !== input.roleIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more roles not found or do not belong to this organization',
        });
      }

      // Enforce admin exclusivity: if any role is admin, user can only have that one role
      const hasAdminRole = roles.some((r) => r.isAdmin);
      if (hasAdminRole && input.roleIds.length > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Admin roles are exclusive - users with admin role cannot have other roles',
        });
      }

      const user = await prisma.user.create({
        data: {
          email: input.email,
          organizationId: ctx.auth.organizationId,
          userRoles: {
            create: input.roleIds.map((roleId) => ({ roleId })),
          },
        },
        select: {
          id: true,
          email: true,
          accessToken: true,
          organizationId: true,
          createdAt: true,
          updatedAt: true,
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.USER_CREATE,
        resourceType: AdminResourceType.USER,
        resourceId: user.id,
        resourceName: user.email,
        actionDetails: {
          email: user.email,
          roleIds: input.roleIds,
          roleNames: roles.map((r) => r.name),
        },
        afterSnapshot: {
          id: user.id,
          email: user.email,
          organizationId: user.organizationId,
          roles: user.userRoles.map((ur) => ({
            roleId: ur.role.id,
            roleName: ur.role.name,
            isAdmin: ur.role.isAdmin,
          })),
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return user;
    }),

  /**
   * Update user roles
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        roleIds: z.array(z.string().cuid()).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user belongs to organization
      const user = await prisma.user.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
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
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent admin from removing their own admin role
      const isSelf = user.id === ctx.auth.user.id;
      const currentlyHasAdminRole = user.userRoles.some((ur) => ur.role.isAdmin);
      const newRoles = await prisma.role.findMany({
        where: {
          id: { in: input.roleIds },
          organizationId: ctx.auth.organizationId,
        },
      });
      const willHaveAdminRole = newRoles.some((r) => r.isAdmin);

      if (isSelf && currentlyHasAdminRole && !willHaveAdminRole) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot remove your own admin role',
        });
      }

      // Verify all roles belong to the organization
      if (newRoles.length !== input.roleIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more roles not found or do not belong to this organization',
        });
      }

      // Enforce admin exclusivity: if any role is admin, user can only have that one role
      const hasAdminRole = newRoles.some((r) => r.isAdmin);
      if (hasAdminRole && input.roleIds.length > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Admin roles are exclusive - users with admin role cannot have other roles',
        });
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ({
          roleId: ur.role.id,
          roleName: ur.role.name,
          isAdmin: ur.role.isAdmin,
        })),
      };

      // Delete existing roles and create new ones
      await prisma.$transaction([
        prisma.userRole.deleteMany({
          where: { userId: input.id },
        }),
        prisma.userRole.createMany({
          data: input.roleIds.map((roleId) => ({
            userId: input.id,
            roleId,
          })),
        }),
      ]);

      const updated = await prisma.user.findUnique({
        where: { id: input.id },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      // Log admin action
      if (updated) {
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: ctx.auth.user.id,
          actionType: AdminActionType.USER_ROLES_UPDATE,
          resourceType: AdminResourceType.USER,
          resourceId: updated.id,
          resourceName: updated.email,
          actionDetails: {
            previousRoleIds: user.userRoles.map((ur) => ur.roleId),
            newRoleIds: input.roleIds,
            previousRoleNames: user.userRoles.map((ur) => ur.role.name),
            newRoleNames: newRoles.map((r) => r.name),
          },
          beforeSnapshot,
          afterSnapshot: {
            id: updated.id,
            email: updated.email,
            roles: updated.userRoles.map((ur) => ({
              roleId: ur.role.id,
              roleName: ur.role.name,
              isAdmin: ur.role.isAdmin,
            })),
          },
          ...getRequestMetaFromTrpc(ctx),
        });
      }

      return updated;
    }),

  /**
   * Refresh user's access token
   */
  refreshToken: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify user belongs to organization
      const user = await prisma.user.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Generate a new secure access token
      // Note: Prisma's @default(cuid()) only works on create, not update
      const { randomBytes } = await import('crypto');
      const newAccessToken = randomBytes(24).toString('base64url');

      const updated = await prisma.user.update({
        where: { id: input.id },
        data: {
          accessToken: newAccessToken,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.USER_TOKEN_REFRESH,
        resourceType: AdminResourceType.USER,
        resourceId: updated.id,
        resourceName: updated.email,
        actionDetails: {
          email: updated.email,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return {
        accessToken: updated.accessToken,
      };
    }),

  /**
   * Revoke user's access token (invalidate without generating new)
   * The user will need their token refreshed by an admin to regain access
   */
  revokeToken: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent admin from revoking their own token
      if (input.id === ctx.auth.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot revoke your own access token',
        });
      }

      // Verify user belongs to organization
      const user = await prisma.user.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Revoke token by setting a new random token
      // Using a crypto-random token that will never match
      const { randomBytes } = await import('crypto');
      const revokedToken = `revoked_${randomBytes(32).toString('hex')}`;

      await prisma.user.update({
        where: { id: input.id },
        data: {
          accessToken: revokedToken,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.USER_TOKEN_REVOKE,
        resourceType: AdminResourceType.USER,
        resourceId: user.id,
        resourceName: user.email,
        actionDetails: {
          email: user.email,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Delete a user (soft delete)
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent admin from deleting themselves
      if (input.id === ctx.auth.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot delete your own account',
        });
      }

      // Verify user belongs to organization
      const user = await prisma.user.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
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
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Analyze deletion impact
      const impact = await analyzeUserDeletion(ctx.auth.organizationId, input.id, ctx.auth.user.id);

      if (!impact.canDelete) {
        const blockerMessages = impact.blockers.map((b) => b.details).join('; ');
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete: ${blockerMessages}`,
        });
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        roles: user.userRoles.map((ur) => ({
          roleId: ur.role.id,
          roleName: ur.role.name,
          isAdmin: ur.role.isAdmin,
        })),
      };

      // Soft delete: Update instead of delete
      await prisma.user.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.auth.user.id,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.USER_DELETE,
        resourceType: AdminResourceType.USER,
        resourceId: user.id,
        resourceName: user.email,
        actionDetails: {
          email: user.email,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true, impact };
    }),

  /**
   * Restore a soft-deleted user
   */
  restore: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify user exists and is deleted
      const user = await prisma.user.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: { not: null },
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
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found or not deleted',
        });
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        deletedAt: user.deletedAt,
        deletedBy: user.deletedBy,
        roles: user.userRoles.map((ur) => ({
          roleId: ur.role.id,
          roleName: ur.role.name,
          isAdmin: ur.role.isAdmin,
        })),
      };

      // Restore: Clear deletedAt and deletedBy
      const restored = await prisma.user.update({
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
        actionType: AdminActionType.USER_RESTORE,
        resourceType: AdminResourceType.USER,
        resourceId: restored.id,
        resourceName: restored.email,
        actionDetails: {
          action: 'restore',
          email: restored.email,
          previousDeletedAt: user.deletedAt?.toISOString(),
          previousDeletedBy: user.deletedBy,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: restored.id,
          email: restored.email,
          organizationId: restored.organizationId,
          deletedAt: null,
          deletedBy: null,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Get deletion impact preview for a user
   */
  getDeletionImpact: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const user = await prisma.user.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return await analyzeUserDeletion(ctx.auth.organizationId, input.id, ctx.auth.user.id);
    }),
});
