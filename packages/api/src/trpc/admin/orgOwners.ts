/**
 * Admin Organization Owners Router
 * Handles org owner management operations
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwBadRequest, throwConflict, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  addOrgOwner,
  countOrgOwners,
  getOrgOwner,
  isUserOrgOwner,
  listOrgOwners,
  removeOrgOwner,
} from '../../services/orgOwner.js';
import { orgOwnerProcedure, router } from '../init.js';

export const adminOrgOwnersRouter = router({
  /**
   * List all organization owners
   */
  list: orgOwnerProcedure.query(async ({ ctx }) => {
    return listOrgOwners(ctx.auth.organizationId);
  }),

  /**
   * Add a user as an organization owner
   */
  add: orgOwnerProcedure
    .input(
      z.object({
        userId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user exists and is in the same organization
      const user = await prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!user) {
        throwNotFound('User not found');
      }

      // Check if already an owner
      const isOwner = await isUserOrgOwner(ctx.auth.organizationId, input.userId);
      if (isOwner) {
        throwConflict('User is already an organization owner');
      }

      const owner = await addOrgOwner(ctx.auth.organizationId, input.userId, ctx.auth.user.id);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ORG_OWNER_ADD,
        resourceType: AdminResourceType.ORG_OWNER,
        resourceId: owner.id,
        resourceName: user.email,
        actionDetails: {
          userId: input.userId,
          userEmail: user.email,
        },
        afterSnapshot: {
          id: owner.id,
          organizationId: owner.organizationId,
          userId: owner.userId,
          addedAt: owner.addedAt.toISOString(),
          addedBy: owner.addedBy,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return owner;
    }),

  /**
   * Remove a user from organization owners
   */
  remove: orgOwnerProcedure
    .input(
      z.object({
        userId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Cannot remove yourself
      if (input.userId === ctx.auth.user.id) {
        throwBadRequest('You cannot remove yourself as an owner');
      }

      const owner = await getOrgOwner(ctx.auth.organizationId, input.userId);
      if (!owner) {
        throwNotFound('User is not an organization owner');
      }

      // Must have at least one owner
      const ownerCount = await countOrgOwners(ctx.auth.organizationId);
      if (ownerCount <= 1) {
        throwBadRequest('Cannot remove the last organization owner');
      }

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });

      await removeOrgOwner(ctx.auth.organizationId, input.userId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ORG_OWNER_REMOVE,
        resourceType: AdminResourceType.ORG_OWNER,
        resourceId: owner.id,
        resourceName: user?.email ?? input.userId,
        actionDetails: {
          userId: input.userId,
          userEmail: user?.email,
        },
        beforeSnapshot: {
          id: owner.id,
          organizationId: owner.organizationId,
          userId: owner.userId,
          addedAt: owner.addedAt.toISOString(),
          addedBy: owner.addedBy,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),
});
