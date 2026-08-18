/**
 * Admin Policy Exceptions Router
 * Handles policy exception requests from workspace admins
 */

import {
  AdminActionType,
  AdminResourceType,
  PolicyEffect,
  PolicyExceptionStatus,
  prisma,
} from '@sentinel/db';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwForbidden, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  approveRequest,
  countPendingRequests,
  createPolicyProposal,
  createRemovalRequest,
  createWorkspaceException,
  denyRequest,
  getPolicyExceptionRequest,
  listPendingRequests,
  listRequestsForWorkspace,
  withdrawRequest,
} from '../../services/policyException.js';
import { adminProcedure, orgOwnerProcedure, router, workspaceAdminProcedure } from '../init.js';

export const adminPolicyExceptionsRouter = router({
  /**
   * Create a policy proposal
   * Workspace admin proposes a new org-wide policy
   */
  createProposal: workspaceAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        proposedMatchers: z.array(z.string()),
        proposedToolPatterns: z.array(z.string()).min(1),
        proposedEffect: z.nativeEnum(PolicyEffect),
        proposedDescription: z.string().min(1),
        justification: z.string().min(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await createPolicyProposal(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.user.id,
        {
          proposedMatchers: input.proposedMatchers,
          proposedToolPatterns: input.proposedToolPatterns,
          proposedEffect: input.proposedEffect,
          proposedDescription: input.proposedDescription,
          justification: input.justification,
        },
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_EXCEPTION_CREATE,
        resourceType: AdminResourceType.POLICY_EXCEPTION,
        resourceId: result.id,
        resourceName: input.proposedDescription,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_EXCEPTION_CREATE),
          requestType: result.requestType,
          workspaceId: input.workspaceId,
          proposedEffect: input.proposedEffect,
          proposedToolPatterns: input.proposedToolPatterns,
        },
        afterSnapshot: {
          id: result.id,
          type: result.requestType,
          status: result.status,
          justification: input.justification,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Create a removal request
   * Workspace admin requests removal of a blocking global policy
   */
  createRemovalRequest: workspaceAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        policyId: z.string().cuid(),
        justification: z.string().min(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify policy exists and is org-wide
      const policy = await prisma.policy.findFirst({
        where: {
          id: input.policyId,
          organizationId: ctx.auth.organizationId,
          workspaceId: null, // Must be org-wide
          deletedAt: null,
        },
      });

      if (!policy) {
        throwNotFound('Global policy not found');
      }

      const result = await createRemovalRequest(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.user.id,
        {
          policyId: input.policyId,
          justification: input.justification,
        },
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_EXCEPTION_CREATE,
        resourceType: AdminResourceType.POLICY_EXCEPTION,
        resourceId: result.id,
        resourceName: `Removal request for ${policy.slug}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_EXCEPTION_CREATE),
          requestType: result.requestType,
          workspaceId: input.workspaceId,
          targetPolicyId: input.policyId,
          targetPolicySlug: policy.slug,
        },
        afterSnapshot: {
          id: result.id,
          type: result.requestType,
          status: result.status,
          justification: input.justification,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Create a workspace exception request
   * Workspace admin requests an exception to a global policy for their workspace
   */
  createException: workspaceAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        policyId: z.string().cuid(),
        justification: z.string().min(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify policy exists and is org-wide DENY
      const policy = await prisma.policy.findFirst({
        where: {
          id: input.policyId,
          organizationId: ctx.auth.organizationId,
          workspaceId: null, // Must be org-wide
          effect: PolicyEffect.DENY,
          deletedAt: null,
        },
      });

      if (!policy) {
        throwNotFound('Global DENY policy not found');
      }

      const result = await createWorkspaceException(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.user.id,
        {
          policyId: input.policyId,
          justification: input.justification,
        },
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_EXCEPTION_CREATE,
        resourceType: AdminResourceType.POLICY_EXCEPTION,
        resourceId: result.id,
        resourceName: `Exception request for ${policy.slug}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_EXCEPTION_CREATE),
          requestType: result.requestType,
          workspaceId: input.workspaceId,
          targetPolicyId: input.policyId,
          targetPolicySlug: policy.slug,
        },
        afterSnapshot: {
          id: result.id,
          type: result.requestType,
          status: result.status,
          justification: input.justification,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Get a policy exception request by ID
   */
  get: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const request = await getPolicyExceptionRequest(input.id);

      if (!request || request.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Request not found');
      }

      return request;
    }),

  /**
   * List pending requests for org owners
   */
  listPending: orgOwnerProcedure.query(async ({ ctx }) => {
    return listPendingRequests(ctx.auth.organizationId);
  }),

  /**
   * List requests for a workspace
   */
  listForWorkspace: workspaceAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        status: z.nativeEnum(PolicyExceptionStatus).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listRequestsForWorkspace(ctx.auth.organizationId, input.workspaceId, {
        status: input.status,
      });
    }),

  /**
   * Approve a policy exception request (org owners only)
   */
  approve: orgOwnerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reviewNote: z.string().optional(),
        policySlug: z.string().optional(), // For PROPOSAL type
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await getPolicyExceptionRequest(input.id);

      if (!request || request.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Request not found');
      }

      const beforeSnapshot = {
        id: request.id,
        type: request.requestType,
        status: request.status,
      };

      const result = await approveRequest(input.id, ctx.auth.user.id, {
        reviewNote: input.reviewNote,
        policySlug: input.policySlug,
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_EXCEPTION_APPROVE,
        resourceType: AdminResourceType.POLICY_EXCEPTION,
        resourceId: request.id,
        resourceName: `${request.requestType} request`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_EXCEPTION_APPROVE),
          requestType: request.requestType,
          reviewNote: input.reviewNote,
          policySlug: input.policySlug,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: result.id,
          type: result.requestType,
          status: result.status,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Deny a policy exception request (org owners only)
   */
  deny: orgOwnerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reviewNote: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await getPolicyExceptionRequest(input.id);

      if (!request || request.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Request not found');
      }

      const beforeSnapshot = {
        id: request.id,
        type: request.requestType,
        status: request.status,
      };

      const result = await denyRequest(input.id, ctx.auth.user.id, input.reviewNote);

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_EXCEPTION_DENY,
        resourceType: AdminResourceType.POLICY_EXCEPTION,
        resourceId: request.id,
        resourceName: `${request.requestType} request`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_EXCEPTION_DENY),
          requestType: request.requestType,
          reviewNote: input.reviewNote,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: result.id,
          type: result.requestType,
          status: result.status,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Withdraw a policy exception request (own requests only)
   */
  withdraw: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await getPolicyExceptionRequest(input.id);

      if (!request || request.organizationId !== ctx.auth.organizationId) {
        throwNotFound('Request not found');
      }

      if (request.requestedById !== ctx.auth.user.id) {
        throwForbidden('Can only withdraw your own requests');
      }

      const beforeSnapshot = {
        id: request.id,
        type: request.requestType,
        status: request.status,
      };

      const result = await withdrawRequest(input.id, ctx.auth.user.id);

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_EXCEPTION_WITHDRAW,
        resourceType: AdminResourceType.POLICY_EXCEPTION,
        resourceId: request.id,
        resourceName: `${request.requestType} request`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_EXCEPTION_WITHDRAW),
          requestType: request.requestType,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: result.id,
          type: result.requestType,
          status: result.status,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Count pending requests for org owners
   */
  countPending: orgOwnerProcedure.query(async ({ ctx }) => {
    return countPendingRequests(ctx.auth.organizationId);
  }),
});
