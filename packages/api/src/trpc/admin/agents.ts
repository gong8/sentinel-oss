/**
 * Admin Agents Router
 * Handles agent management operations
 */

import { AdminActionType, AdminResourceType, prisma, WebhookEvent } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { canAccessWorkspace, isOrgOwner } from '../../services/auth.js';
import { analyzeAgentDeletion } from '../../services/deletionImpact.js';
import { sendWebhook } from '../../services/webhook.js';
import { adminProcedure, router } from '../init.js';

export const adminAgentsRouter = router({
  /**
   * List all agents
   */
  list: adminProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean().optional(),
          workspaceId: z.string().cuid().nullish(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Build workspace filter based on user access
      // Org owners/admins see all agents, others see org-wide (null workspaceId) + their workspaces
      const hasFullAccess = isOrgOwner(ctx.auth) || ctx.auth.isAdmin;
      const workspaceFilter = hasFullAccess
        ? input?.workspaceId !== undefined
          ? { workspaceId: input.workspaceId }
          : {}
        : {
            OR: [
              { workspaceId: null }, // Org-wide agents
              { workspaceId: { in: ctx.auth.workspaceIds } }, // User's workspace agents
            ],
          };

      const agents = await prisma.agent.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDeleted ? {} : { deletedAt: null }),
          ...workspaceFilter,
        },
        select: {
          id: true,
          name: true,
          organizationId: true,
          workspaceId: true,
          createdAt: true,
          deletedAt: true,
          deletedBy: true,
          // Attestation fields
          signatureVerified: true,
          signatureVerifiedAt: true,
          publicKeyUrl: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return agents;
    }),

  /**
   * Get a specific agent
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
        deletedAt: null,
      },
    });

    if (!agent) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Agent not found',
      });
    }

    // Validate workspace access for workspace-scoped agents
    if (
      agent.workspaceId &&
      !ctx.auth.isOrgOwner &&
      !ctx.auth.isAdmin &&
      !ctx.auth.workspaceIds.includes(agent.workspaceId)
    ) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
    }

    return agent;
  }),

  /**
   * Create a new agent
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        publicKeyUrl: z.string().url().nullish(),
        workspaceId: z.string().cuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate workspace access if workspaceId is provided
      if (input.workspaceId && !canAccessWorkspace(ctx.auth, input.workspaceId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      const agent = await prisma.agent.create({
        data: {
          name: input.name,
          organizationId: ctx.auth.organizationId,
          publicKeyUrl: input.publicKeyUrl ?? null,
          workspaceId: input.workspaceId ?? null,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.AGENT_CREATE,
        resourceType: AdminResourceType.AGENT,
        resourceId: agent.id,
        resourceName: agent.name,
        actionDetails: {
          name: agent.name,
          ...(agent.publicKeyUrl ? { publicKeyUrl: agent.publicKeyUrl } : {}),
          ...(agent.workspaceId ? { workspaceId: agent.workspaceId } : {}),
        },
        afterSnapshot: {
          id: agent.id,
          name: agent.name,
          organizationId: agent.organizationId,
          ...(agent.publicKeyUrl ? { publicKeyUrl: agent.publicKeyUrl } : {}),
          ...(agent.workspaceId ? { workspaceId: agent.workspaceId } : {}),
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Send webhook notification (fire-and-forget)
      sendWebhook(
        ctx.auth.organizationId,
        WebhookEvent.AGENT_CREATED,
        {
          agentId: agent.id,
          agentName: agent.name,
          createdBy: ctx.auth.user.email,
          ...(agent.workspaceId ? { workspaceId: agent.workspaceId } : {}),
        },
        agent.workspaceId,
        { organizationId: ctx.auth.organizationId },
      ).catch((err) => logger.error('Failed to send webhook:', err));

      return agent;
    }),

  /**
   * Delete an agent (soft delete)
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify agent belongs to organization
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found',
        });
      }

      // Validate workspace access for workspace-scoped agents
      if (
        agent.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.isAdmin &&
        !ctx.auth.workspaceIds.includes(agent.workspaceId)
      ) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
      }

      // Analyze deletion impact
      const impact = await analyzeAgentDeletion(ctx.auth.organizationId, input.id);

      if (!impact.canDelete) {
        const blockerMessages = impact.blockers.map((b) => b.details).join('; ');
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete: ${blockerMessages}`,
        });
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: agent.id,
        name: agent.name,
        organizationId: agent.organizationId,
      };

      // Soft delete: Update instead of delete
      await prisma.agent.update({
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
        actionType: AdminActionType.AGENT_DELETE,
        resourceType: AdminResourceType.AGENT,
        resourceId: agent.id,
        resourceName: agent.name,
        actionDetails: {
          name: agent.name,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      // Send webhook notification (fire-and-forget)
      sendWebhook(
        ctx.auth.organizationId,
        WebhookEvent.AGENT_DELETED,
        {
          agentId: agent.id,
          agentName: agent.name,
          deletedBy: ctx.auth.user.email,
        },
        agent.workspaceId,
        { organizationId: ctx.auth.organizationId, beforeSnapshot },
      ).catch((err) => logger.error('Failed to send webhook:', err));

      return { success: true, impact };
    }),

  /**
   * Restore a soft-deleted agent
   */
  restore: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify agent exists and is deleted
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: { not: null },
        },
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found or not deleted',
        });
      }

      // Validate workspace access for workspace-scoped agents
      if (
        agent.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.isAdmin &&
        !ctx.auth.workspaceIds.includes(agent.workspaceId)
      ) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found or not deleted' });
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: agent.id,
        name: agent.name,
        organizationId: agent.organizationId,
        deletedAt: agent.deletedAt,
        deletedBy: agent.deletedBy,
      };

      // Restore: Clear deletedAt and deletedBy
      const restored = await prisma.agent.update({
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
        actionType: AdminActionType.AGENT_RESTORE,
        resourceType: AdminResourceType.AGENT,
        resourceId: restored.id,
        resourceName: restored.name,
        actionDetails: {
          action: 'restore',
          name: restored.name,
          previousDeletedAt: agent.deletedAt?.toISOString(),
          previousDeletedBy: agent.deletedBy,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: restored.id,
          name: restored.name,
          organizationId: restored.organizationId,
          deletedAt: null,
          deletedBy: null,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Get deletion impact preview for an agent
   */
  getDeletionImpact: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found',
        });
      }

      return await analyzeAgentDeletion(ctx.auth.organizationId, input.id);
    }),
});
