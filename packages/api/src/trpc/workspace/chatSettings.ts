/**
 * Workspace Chat Settings Router
 * Admin-only endpoints for managing workspace chat configuration
 */

import { AdminActionType, AdminResourceType, LLMProvider, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { getUsageStats } from '../../services/workspace-chat-usage.js';
import { router, workspaceAdminProcedure } from '../init.js';

// ============================================================================
// Schemas
// ============================================================================

const workspaceIdInputSchema = z.object({
  workspaceId: z.string().cuid(),
});

const updateSettingsInputSchema = z.object({
  workspaceId: z.string().cuid(),
  enabled: z.boolean().optional(),
  defaultLlmProvider: z.nativeEnum(LLMProvider).optional().nullable(),
  defaultLlmModel: z.string().max(100).optional().nullable(),
  systemPrompt: z.string().max(10000).optional().nullable(),
  monthlyMessageQuota: z.number().int().min(0).optional().nullable(),
  monthlyTokenQuota: z.number().int().min(0).optional().nullable(),
  adminChatVisibility: z.boolean().optional(),
});

const getUsageStatsInputSchema = z.object({
  workspaceId: z.string().cuid(),
  month: z.string().optional(), // ISO date string for month (e.g., "2024-01-01")
});

const listConversationsInputSchema = z.object({
  workspaceId: z.string().cuid(),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: z.string().cuid().optional(),
  userId: z.string().cuid().optional(), // Filter by user
});

// ============================================================================
// Router Definition
// ============================================================================

export const workspaceChatSettingsRouter = router({
  /**
   * Get chat settings for a workspace
   */
  get: workspaceAdminProcedure.input(workspaceIdInputSchema).query(async ({ input }) => {
    const { workspaceId } = input;

    // Get or create settings
    let settings = await prisma.workspaceChatSettings.findUnique({
      where: { workspaceId },
    });

    if (!settings) {
      // Return default settings (not persisted until explicitly updated)
      return {
        workspaceId,
        enabled: true,
        defaultLlmProvider: null,
        defaultLlmModel: null,
        systemPrompt: null,
        monthlyMessageQuota: null,
        monthlyTokenQuota: null,
        adminChatVisibility: false,
      };
    }

    return settings;
  }),

  /**
   * Update chat settings for a workspace
   */
  update: workspaceAdminProcedure
    .input(updateSettingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, ...updates } = input;

      // Get current settings for before snapshot
      const beforeSettings = await prisma.workspaceChatSettings.findUnique({
        where: { workspaceId },
      });

      const beforeSnapshot = beforeSettings
        ? {
            enabled: beforeSettings.enabled,
            defaultLlmProvider: beforeSettings.defaultLlmProvider,
            defaultLlmModel: beforeSettings.defaultLlmModel,
            systemPrompt: beforeSettings.systemPrompt,
            monthlyMessageQuota: beforeSettings.monthlyMessageQuota,
            monthlyTokenQuota: beforeSettings.monthlyTokenQuota,
            adminChatVisibility: beforeSettings.adminChatVisibility,
          }
        : null;

      // Upsert settings
      const settings = await prisma.workspaceChatSettings.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          enabled: updates.enabled ?? true,
          defaultLlmProvider: updates.defaultLlmProvider,
          defaultLlmModel: updates.defaultLlmModel,
          systemPrompt: updates.systemPrompt,
          monthlyMessageQuota: updates.monthlyMessageQuota,
          monthlyTokenQuota: updates.monthlyTokenQuota,
          adminChatVisibility: updates.adminChatVisibility ?? false,
        },
        update: updates,
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: beforeSettings
          ? AdminActionType.WORKSPACE_CHAT_SETTINGS_UPDATE
          : AdminActionType.WORKSPACE_CHAT_SETTINGS_CREATE,
        resourceType: AdminResourceType.WORKSPACE,
        resourceId: workspaceId,
        resourceName: `Workspace Chat Settings`,
        actionDetails: {
          changes: Object.keys(updates),
        },
        beforeSnapshot,
        afterSnapshot: {
          enabled: settings.enabled,
          defaultLlmProvider: settings.defaultLlmProvider,
          defaultLlmModel: settings.defaultLlmModel,
          systemPrompt: settings.systemPrompt,
          monthlyMessageQuota: settings.monthlyMessageQuota,
          monthlyTokenQuota: settings.monthlyTokenQuota,
          adminChatVisibility: settings.adminChatVisibility,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return settings;
    }),

  /**
   * Get usage statistics for the workspace
   */
  getUsageStats: workspaceAdminProcedure
    .input(getUsageStatsInputSchema)
    .query(async ({ input }) => {
      const { workspaceId, month } = input;

      const monthDate = month ? new Date(month) : undefined;
      const stats = await getUsageStats(workspaceId, monthDate);

      return stats;
    }),

  /**
   * List all conversations in the workspace (admin visibility)
   * Only available if adminChatVisibility is enabled
   */
  listAllConversations: workspaceAdminProcedure
    .input(listConversationsInputSchema)
    .query(async ({ input }) => {
      const { workspaceId, limit, cursor, userId } = input;

      // Check if admin visibility is enabled
      const settings = await prisma.workspaceChatSettings.findUnique({
        where: { workspaceId },
      });

      if (!settings?.adminChatVisibility) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin chat visibility is not enabled for this workspace',
        });
      }

      const conversations = await prisma.workspaceChatConversation.findMany({
        where: {
          workspaceId,
          ...(userId && { userId }),
        },
        orderBy: { updatedAt: 'desc' },
        take: limit + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
      });

      const hasMore = conversations.length > limit;
      const items = hasMore ? conversations.slice(0, -1) : conversations;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return {
        items: items.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          userId: c.userId,
          user: c.user,
          messageCount: c._count.messages,
        })),
        nextCursor,
      };
    }),

  /**
   * Get a specific conversation as admin (if visibility is enabled)
   */
  getConversation: workspaceAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        conversationId: z.string().cuid(),
      }),
    )
    .query(async ({ input }) => {
      const { workspaceId, conversationId } = input;

      // Check if admin visibility is enabled
      const settings = await prisma.workspaceChatSettings.findUnique({
        where: { workspaceId },
      });

      if (!settings?.adminChatVisibility) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin chat visibility is not enabled for this workspace',
        });
      }

      const conversation = await prisma.workspaceChatConversation.findFirst({
        where: {
          id: conversationId,
          workspaceId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              role: true,
              content: true,
              toolName: true,
              toolInput: true,
              toolResult: true,
              permissionRequestId: true,
              createdAt: true,
            },
          },
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      return conversation;
    }),

  /**
   * Get workspace members for the chat user filter
   */
  getMembers: workspaceAdminProcedure.input(workspaceIdInputSchema).query(async ({ input }) => {
    const { workspaceId } = input;

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return members.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      role: m.role,
    }));
  }),
});
