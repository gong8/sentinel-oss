/**
 * Admin Ownership Transfer Router
 * Handles ownership transfer workflow
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwBadRequest, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { isUserOrgOwner } from '../../services/orgOwner.js';
import {
  acceptOwnershipTransfer,
  cancelOwnershipTransfer,
  declineOwnershipTransfer,
  getOwnershipTransfer,
  getPendingTransfersForUser,
  getPendingTransfersFromUser,
  initiateOwnershipTransfer,
} from '../../services/ownershipTransfer.js';
import { adminProcedure, orgOwnerProcedure, router } from '../init.js';

export const adminOwnershipTransferRouter = router({
  /**
   * Initiate an ownership transfer (org owners only)
   */
  initiate: orgOwnerProcedure
    .input(
      z.object({
        toUserId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Cannot transfer to yourself
      if (input.toUserId === ctx.auth.user.id) {
        throwBadRequest('Cannot transfer ownership to yourself');
      }

      // Verify target user exists and is in the same organization
      const toUser = await prisma.user.findFirst({
        where: {
          id: input.toUserId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!toUser) {
        throwNotFound('User not found');
      }

      // Check if target is already an owner
      const isOwner = await isUserOrgOwner(ctx.auth.organizationId, input.toUserId);
      if (isOwner) {
        throwBadRequest('User is already an organization owner');
      }

      // Check for existing pending transfer to same user
      const existingPending = await getPendingTransfersFromUser(
        ctx.auth.organizationId,
        ctx.auth.user.id,
      );
      const hasExisting = existingPending.some((t) => t.toUserId === input.toUserId);
      if (hasExisting) {
        throwBadRequest('A pending transfer to this user already exists');
      }

      const transfer = await initiateOwnershipTransfer(
        ctx.auth.organizationId,
        ctx.auth.user.id,
        input.toUserId,
      );

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OWNERSHIP_TRANSFER_INITIATE,
        resourceType: AdminResourceType.OWNERSHIP_TRANSFER,
        resourceId: transfer.id,
        resourceName: `Transfer to ${toUser.email}`,
        actionDetails: {
          toUserId: input.toUserId,
          toUserEmail: toUser.email,
          expiresAt: transfer.expiresAt.toISOString(),
        },
        afterSnapshot: {
          id: transfer.id,
          organizationId: transfer.organizationId,
          fromUserId: transfer.fromUserId,
          toUserId: transfer.toUserId,
          status: transfer.status,
          expiresAt: transfer.expiresAt.toISOString(),
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return transfer;
    }),

  /**
   * Accept a pending ownership transfer
   */
  accept: adminProcedure
    .input(
      z.object({
        transferId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const transfer = await getOwnershipTransfer(input.transferId);

      if (!transfer) {
        throwNotFound('Transfer not found');
      }

      if (transfer.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Transfer not found');
      }

      // Must be the recipient
      if (transfer.toUserId !== ctx.auth.user.id) {
        throwBadRequest('You are not the recipient of this transfer');
      }

      if (transfer.status !== 'PENDING') {
        throwBadRequest('This transfer is no longer pending');
      }

      if (new Date() > transfer.expiresAt) {
        throwBadRequest('This transfer has expired');
      }

      const updated = await acceptOwnershipTransfer(input.transferId, ctx.auth.user.id);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OWNERSHIP_TRANSFER_ACCEPT,
        resourceType: AdminResourceType.OWNERSHIP_TRANSFER,
        resourceId: transfer.id,
        resourceName: `Transfer from ${transfer.fromUser?.email}`,
        actionDetails: {
          fromUserId: transfer.fromUserId,
          fromUserEmail: transfer.fromUser?.email,
        },
        beforeSnapshot: {
          id: transfer.id,
          status: transfer.status,
        },
        afterSnapshot: {
          id: updated.id,
          status: updated.status,
          resolvedAt: updated.resolvedAt?.toISOString(),
          resolvedBy: updated.resolvedBy,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Decline a pending ownership transfer
   */
  decline: adminProcedure
    .input(
      z.object({
        transferId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const transfer = await getOwnershipTransfer(input.transferId);

      if (!transfer) {
        throwNotFound('Transfer not found');
      }

      if (transfer.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Transfer not found');
      }

      // Must be the recipient
      if (transfer.toUserId !== ctx.auth.user.id) {
        throwBadRequest('You are not the recipient of this transfer');
      }

      if (transfer.status !== 'PENDING') {
        throwBadRequest('This transfer is no longer pending');
      }

      const updated = await declineOwnershipTransfer(input.transferId, ctx.auth.user.id);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OWNERSHIP_TRANSFER_DECLINE,
        resourceType: AdminResourceType.OWNERSHIP_TRANSFER,
        resourceId: transfer.id,
        resourceName: `Transfer from ${transfer.fromUser?.email}`,
        actionDetails: {
          fromUserId: transfer.fromUserId,
          fromUserEmail: transfer.fromUser?.email,
        },
        beforeSnapshot: {
          id: transfer.id,
          status: transfer.status,
        },
        afterSnapshot: {
          id: updated.id,
          status: updated.status,
          resolvedAt: updated.resolvedAt?.toISOString(),
          resolvedBy: updated.resolvedBy,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Cancel a pending ownership transfer (initiator only)
   */
  cancel: orgOwnerProcedure
    .input(
      z.object({
        transferId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const transfer = await getOwnershipTransfer(input.transferId);

      if (!transfer) {
        throwNotFound('Transfer not found');
      }

      if (transfer.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Transfer not found');
      }

      // Must be the initiator
      if (transfer.fromUserId !== ctx.auth.user.id) {
        throwBadRequest('You are not the initiator of this transfer');
      }

      if (transfer.status !== 'PENDING') {
        throwBadRequest('This transfer is no longer pending');
      }

      const updated = await cancelOwnershipTransfer(input.transferId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OWNERSHIP_TRANSFER_CANCEL,
        resourceType: AdminResourceType.OWNERSHIP_TRANSFER,
        resourceId: transfer.id,
        resourceName: `Transfer to ${transfer.toUser?.email}`,
        actionDetails: {
          toUserId: transfer.toUserId,
          toUserEmail: transfer.toUser?.email,
        },
        beforeSnapshot: {
          id: transfer.id,
          status: transfer.status,
        },
        afterSnapshot: {
          id: updated.id,
          status: updated.status,
          resolvedAt: updated.resolvedAt?.toISOString(),
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Get pending transfers for the current user (as recipient)
   */
  getPendingIncoming: adminProcedure.query(async ({ ctx }) => {
    return getPendingTransfersForUser(ctx.auth.organizationId, ctx.auth.user.id);
  }),

  /**
   * Get pending transfers initiated by the current user
   */
  getPendingOutgoing: orgOwnerProcedure.query(async ({ ctx }) => {
    return getPendingTransfersFromUser(ctx.auth.organizationId, ctx.auth.user.id);
  }),
});
