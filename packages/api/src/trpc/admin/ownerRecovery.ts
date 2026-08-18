/**
 * Admin Owner Recovery Router
 * Handles owner recovery workflow for support-initiated ownership grants
 */

import { AdminActionType, AdminResourceType, OwnerRecoveryStatus } from '@sentinel/db';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  cancelOwnerRecoveryRequest,
  createOwnerRecoveryRequest,
  denyOwnerRecoveryRequest,
  getOwnerRecoveryRequest,
  listOwnerRecoveryRequests,
} from '../../services/ownerRecovery.js';
import { adminProcedure, orgOwnerProcedure, router } from '../init.js';

export const adminOwnerRecoveryRouter = router({
  /**
   * Create an owner recovery request
   * Used by support agents to initiate ownership recovery
   */
  create: adminProcedure
    .input(
      z.object({
        requestedByEmail: z.string().email(),
        requestedByName: z.string().optional(),
        requestedReason: z.string().min(10),
        supportTicketId: z.string().optional(),
        targetUserEmail: z.string().email(),
        targetUserId: z.string().cuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await createOwnerRecoveryRequest(ctx.auth.organizationId, {
        requestedByEmail: input.requestedByEmail,
        requestedByName: input.requestedByName,
        requestedReason: input.requestedReason,
        supportTicketId: input.supportTicketId,
        targetUserEmail: input.targetUserEmail,
        targetUserId: input.targetUserId,
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OWNER_RECOVERY_CREATE,
        resourceType: AdminResourceType.OWNER_RECOVERY,
        resourceId: request.id,
        resourceName: `Recovery for ${input.targetUserEmail}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.OWNER_RECOVERY_CREATE),
          requestedByEmail: input.requestedByEmail,
          targetUserEmail: input.targetUserEmail,
          supportTicketId: input.supportTicketId,
        },
        afterSnapshot: {
          id: request.id,
          status: request.status,
          targetUserEmail: request.targetUserEmail,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return request;
    }),

  /**
   * Get a recovery request by ID
   */
  get: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const request = await getOwnerRecoveryRequest(input.id);

      if (!request || request.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Recovery request not found');
      }

      return request;
    }),

  /**
   * List recovery requests for the organization
   */
  list: adminProcedure
    .input(
      z
        .object({
          status: z.nativeEnum(OwnerRecoveryStatus).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return listOwnerRecoveryRequests(ctx.auth.organizationId, {
        status: input?.status,
      });
    }),

  /**
   * Cancel a pending recovery request
   */
  cancel: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await getOwnerRecoveryRequest(input.id);

      if (!request || request.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Recovery request not found');
      }

      const beforeSnapshot = {
        id: request.id,
        status: request.status,
        targetUserEmail: request.targetUserEmail,
      };

      const result = await cancelOwnerRecoveryRequest(input.id);

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OWNER_RECOVERY_CANCEL,
        resourceType: AdminResourceType.OWNER_RECOVERY,
        resourceId: request.id,
        resourceName: `Recovery for ${request.targetUserEmail}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.OWNER_RECOVERY_CANCEL),
        },
        beforeSnapshot,
        afterSnapshot: {
          id: result.id,
          status: result.status,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Deny a pending recovery request (org owners only)
   */
  deny: orgOwnerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await getOwnerRecoveryRequest(input.id);

      if (!request || request.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Recovery request not found');
      }

      const beforeSnapshot = {
        id: request.id,
        status: request.status,
        targetUserEmail: request.targetUserEmail,
      };

      const result = await denyOwnerRecoveryRequest(input.id, ctx.auth.user.id, input.reason);

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OWNER_RECOVERY_DENY,
        resourceType: AdminResourceType.OWNER_RECOVERY,
        resourceId: request.id,
        resourceName: `Recovery for ${request.targetUserEmail}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.OWNER_RECOVERY_DENY),
          reason: input.reason,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: result.id,
          status: result.status,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),
});
