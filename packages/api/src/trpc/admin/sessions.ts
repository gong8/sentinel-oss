/**
 * Admin Sessions Router
 * Handles session management operations (list, terminate)
 */

import { AdminActionType, AdminResourceType, prisma, WebhookEvent } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { canAccessWorkspace } from '../../services/auth.js';
import {
  getActiveSessionCount,
  listActiveSessions,
  terminateSession,
  terminateUserSessions,
} from '../../services/session.js';
import { sendWebhook } from '../../services/webhook.js';
import { adminProcedure, router } from '../init.js';

export const adminSessionsRouter = router({
  /**
   * List all active sessions
   */
  list: adminProcedure
    .input(
      z
        .object({
          workspaceId: z.string().cuid().optional().nullable(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Validate workspace access if specific workspace requested
      if (input?.workspaceId && !canAccessWorkspace(ctx.auth, input.workspaceId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      const sessions = await listActiveSessions(
        ctx.auth.organizationId,
        input?.workspaceId ?? undefined,
        ctx.auth.workspaceIds,
      );

      // Enrich with user info
      const userIds = sessions.map((s) => s.userId).filter((id): id is string => id !== null);
      const users = await prisma.user.findMany({
        where: {
          id: { in: userIds },
          organizationId: ctx.auth.organizationId,
        },
        select: { id: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      return sessions.map((session) => ({
        ...session,
        user: session.userId ? userMap.get(session.userId) : null,
      }));
    }),

  /**
   * Get count of active sessions for a user
   */
  getActiveCount: adminProcedure
    .input(z.object({ userId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const count = await getActiveSessionCount(ctx.auth.organizationId, input.userId);
      return { count };
    }),

  /**
   * Terminate a specific session
   * Validates workspace access: workspace admins can only terminate sessions in their workspaces
   */
  terminate: adminProcedure
    .input(z.object({ sessionId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get session details for audit logging
      const session = await prisma.session.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.auth.organizationId,
        },
        include: {
          organization: { select: { name: true } },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      // Validate workspace access for workspace-scoped sessions
      // Org owners can access all sessions, workspace admins only their workspace sessions
      if (
        session.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(session.workspaceId)
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      if (session.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Session is already ${session.status.toLowerCase()}`,
        });
      }

      const result = await terminateSession(
        ctx.auth.organizationId,
        input.sessionId,
        ctx.auth.user.id,
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to terminate session',
        });
      }

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.AGENT_TERMINATE,
        resourceType: AdminResourceType.AGENT,
        resourceId: input.sessionId,
        resourceName: `Session ${session.externalSessionId}`,
        actionDetails: {
          sessionId: input.sessionId,
          externalSessionId: session.externalSessionId,
          userId: session.userId,
          agentId: session.agentId,
        },
        beforeSnapshot: {
          status: session.status,
          createdAt: session.createdAt.toISOString(),
          lastActivityAt: session.lastActivityAt.toISOString(),
        },
        afterSnapshot: {
          status: 'TERMINATED',
          terminatedAt: new Date().toISOString(),
          terminatedBy: ctx.auth.user.id,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Send webhook notification (fire-and-forget)
      sendWebhook(
        ctx.auth.organizationId,
        WebhookEvent.SESSION_TERMINATED,
        {
          sessionId: input.sessionId,
          externalSessionId: result.externalSessionId,
          userId: session.userId,
          agentId: session.agentId,
          terminatedBy: ctx.auth.user.email,
        },
        session.workspaceId,
        { organizationId: ctx.auth.organizationId },
      ).catch((err) => logger.error('Failed to send webhook:', err));

      return { success: true, externalSessionId: result.externalSessionId };
    }),

  /**
   * Terminate all sessions for a user
   * Validates workspace access: workspace admins can only terminate sessions in their workspaces
   */
  terminateUserSessions: adminProcedure
    .input(
      z.object({
        userId: z.string().cuid(),
        workspaceId: z.string().cuid().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user belongs to organization
      const user = await prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.auth.organizationId,
        },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Validate workspace access if specific workspace requested
      if (input.workspaceId && !canAccessWorkspace(ctx.auth, input.workspaceId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      // Determine which workspaces to scope the termination to
      // Org owners can terminate all sessions; workspace admins only their workspace sessions
      const workspaceScope = ctx.auth.isOrgOwner
        ? (input.workspaceId ?? undefined) // undefined means all workspaces for org owners
        : (input.workspaceId ?? ctx.auth.workspaceIds); // workspace admins limited to their workspaces

      const result = await terminateUserSessions(
        ctx.auth.organizationId,
        input.userId,
        ctx.auth.user.id,
        workspaceScope,
      );

      if (result.count === 0) {
        return { success: true, count: 0, sessionIds: [] };
      }

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.AGENT_TERMINATE,
        resourceType: AdminResourceType.AGENT,
        resourceId: input.userId,
        resourceName: `All sessions for ${user.email}`,
        actionDetails: {
          userId: input.userId,
          userEmail: user.email,
          sessionsTerminated: result.count,
          sessionIds: result.sessionIds,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Send webhook notification (fire-and-forget)
      // For bulk terminations, use the specified workspace or null for org-wide
      sendWebhook(
        ctx.auth.organizationId,
        WebhookEvent.SESSION_TERMINATED,
        {
          userId: input.userId,
          userEmail: user.email,
          sessionsTerminated: result.count,
          sessionIds: result.sessionIds,
          terminatedBy: ctx.auth.user.email,
        },
        input.workspaceId,
        { organizationId: ctx.auth.organizationId },
      ).catch((err) => logger.error('Failed to send webhook:', err));

      return { success: true, count: result.count, sessionIds: result.sessionIds };
    }),
});
