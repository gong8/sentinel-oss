/**
 * User Sensitive Flags Router
 * Handles user-facing sensitive flag approval operations
 */

import type { SensitiveFlagAgentOverride, SensitiveToolFlag } from '@sentinel/db';
import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName, getToolFriendlyNames } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { checkToolPattern } from '../../services/policy.js';
import {
  approvalConfigSchema,
  cancelApprovalRequest,
  processApprovalDecision,
} from '../../services/sensitiveFlag.js';
import { protectedProcedure, router } from '../init.js';

type SensitiveFlagWithOverrides = SensitiveToolFlag & {
  agentOverrides: SensitiveFlagAgentOverride[];
};

/**
 * Determines if self-approval is allowed for a request based on the flag config
 */
function canSelfApproveRequest(
  request: { toolName: string; agentId: string | null },
  flags: SensitiveFlagWithOverrides[],
): boolean {
  const matchingFlag = flags.find((flag) => checkToolPattern(flag.toolPattern, request.toolName));
  if (!matchingFlag) return false;

  const override = request.agentId
    ? matchingFlag.agentOverrides.find((o) => o.agentId === request.agentId)
    : null;

  const rawConfig = override?.approvalConfig ?? matchingFlag.approvalConfig;
  if (!rawConfig) return false;

  const parsed = approvalConfigSchema.safeParse(rawConfig);
  return parsed.success && parsed.data.allowedApprovers.includes('session_owner');
}

export const userSensitiveFlagsRouter = router({
  /**
   * List user's pending approval requests with agent info and self-approval status
   */
  listPendingApprovals: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const requests = await prisma.sensitiveFlagApprovalRequest.findMany({
      where: {
        userId: ctx.auth.user.id,
        status: 'PENDING',
      },
      include: {
        agent: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const expiredRequestIds = requests.filter((r) => r.expiresAt < now).map((r) => r.id);

    if (expiredRequestIds.length > 0) {
      await prisma.sensitiveFlagApprovalRequest.updateMany({
        where: { id: { in: expiredRequestIds } },
        data: { status: 'EXPIRED' },
      });
    }

    const activeRequests = requests.filter((r) => r.expiresAt >= now);

    const sensitiveFlags = await prisma.sensitiveToolFlag.findMany({
      where: {
        organizationId: ctx.auth.organizationId,
        enabled: true,
      },
      include: {
        agentOverrides: true,
      },
    });

    return activeRequests.map((request) => ({
      ...request,
      canSelfApprove: canSelfApproveRequest(request, sensitiveFlags),
    }));
  }),

  /**
   * Get a specific approval request
   */
  getApproval: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
        include: {
          agent: { select: { name: true } },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Approval request not found',
        });
      }

      return request;
    }),

  /**
   * Self-approve a request (if allowed by approval config)
   */
  selfApprove: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
          status: 'PENDING',
        },
      });

      if (!request) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pending approval request not found',
        });
      }

      const sensitiveFlags = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          enabled: true,
        },
        include: {
          agentOverrides: true,
        },
      });

      if (!canSelfApproveRequest(request, sensitiveFlags)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Self-approval is not allowed for this tool',
        });
      }

      await processApprovalDecision(
        ctx.auth.organizationId,
        input.id,
        'APPROVED',
        ctx.auth.user.id,
      );

      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          // Users can only see org-wide servers or servers in their workspaces
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
        select: { name: true, url: true },
      });
      const { serverFriendlyName, toolFriendlyName } = getToolFriendlyNames(
        request.toolName,
        servers,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_APPROVAL_GRANTED,
        resourceType: AdminResourceType.SENSITIVE_APPROVAL,
        resourceId: request.id,
        resourceName: request.toolName,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_APPROVAL_GRANTED),
          toolName: request.toolName,
          serverFriendlyName,
          toolFriendlyName,
          userId: request.userId,
          agentId: request.agentId,
          selfApproval: true,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Cancel an approval request
   */
  cancelRequest: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
          status: 'PENDING',
        },
      });

      if (!request) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pending approval request not found',
        });
      }

      await cancelApprovalRequest(ctx.auth.organizationId, input.id);

      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          // Users can only see org-wide servers or servers in their workspaces
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
        select: { name: true, url: true },
      });
      const { serverFriendlyName, toolFriendlyName } = getToolFriendlyNames(
        request.toolName,
        servers,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_APPROVAL_CANCELLED,
        resourceType: AdminResourceType.SENSITIVE_APPROVAL,
        resourceId: request.id,
        resourceName: request.toolName,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_APPROVAL_CANCELLED),
          toolName: request.toolName,
          serverFriendlyName,
          toolFriendlyName,
          userId: request.userId,
          agentId: request.agentId,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),
});
