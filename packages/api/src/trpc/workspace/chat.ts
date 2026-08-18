/**
 * Workspace Chat Router
 * Handles workspace agent chat operations for workspace members
 */

import { ChatMessageRole, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  createUnifiedOrchestrator,
  type UnifiedStreamingEvent,
  type WorkspaceAgentContext,
} from '../../agent/index.js';
import { logger } from '../../lib/logger.js';
import { checkQuota, recordUsage } from '../../services/workspace-chat-usage.js';
import { loadConversationHistory, saveMessage } from '../../services/workspace-chat-utils.js';
import * as WorkspaceLLMClient from '../../services/workspace-llm-client.js';
import { workspaceToolRouter } from '../../services/workspace-tool-router.js';
import { router, workspaceMemberProcedure } from '../init.js';

// ============================================================================
// Schemas
// ============================================================================

const sendMessageInputSchema = z.object({
  workspaceId: z.string().cuid(),
  conversationId: z.string().cuid().optional(),
  message: z.string().min(1).max(50000),
});

const conversationIdInputSchema = z.object({
  workspaceId: z.string().cuid(),
  conversationId: z.string().cuid(),
});

const executeToolInputSchema = z.object({
  workspaceId: z.string().cuid(),
  conversationId: z.string().cuid(),
  toolUseId: z.string(),
  toolName: z.string(),
  toolInput: z.unknown(),
  alwaysAllow: z.boolean().optional(),
});

const requestToolAccessInputSchema = z.object({
  workspaceId: z.string().cuid(),
  toolName: z.string(),
  reason: z.string().min(1).max(1000),
  conversationId: z.string().cuid().optional(),
});

const requestServerAccessInputSchema = z.object({
  workspaceId: z.string().cuid(),
  serverDomain: z.string(),
  reason: z.string().min(1).max(1000),
  conversationId: z.string().cuid().optional(),
});

const listConversationsInputSchema = z.object({
  workspaceId: z.string().cuid(),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: z.string().cuid().optional(),
});

const retryFromMessageInputSchema = z.object({
  workspaceId: z.string().cuid(),
  conversationId: z.string().cuid(),
  messageId: z.string().cuid(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets user info with roles for chat context
 */
async function getUserWithRoles(userId: string): Promise<{
  email: string;
  roles: string[];
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });

  if (!user) {
    return null;
  }

  return {
    email: user.email,
    roles: user.userRoles.map((ur) => ur.role.name),
  };
}

/**
 * Creates or retrieves a conversation
 */
async function getOrCreateConversation(
  workspaceId: string,
  userId: string,
  conversationId?: string,
): Promise<{ id: string; isNew: boolean }> {
  if (conversationId) {
    const existing = await prisma.workspaceChatConversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
        userId,
      },
    });

    if (existing) {
      return { id: existing.id, isNew: false };
    }
  }

  // Create new conversation
  const conversation = await prisma.workspaceChatConversation.create({
    data: {
      workspaceId,
      userId,
    },
  });

  return { id: conversation.id, isNew: true };
}

/**
 * Gets user's tool confirmation settings from their LLM config
 */
async function getUserToolSettings(
  userId: string,
  workspaceId: string,
): Promise<{ alwaysAllowTools: string[]; skipToolConfirmation: boolean }> {
  const config = await prisma.userLLMConfig.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
  });

  return {
    alwaysAllowTools: config?.alwaysAllowTools ?? [],
    skipToolConfirmation: config?.skipToolConfirmation ?? false,
  };
}

/**
 * Adds a tool to user's always-allow list
 */
async function addToAlwaysAllowTools(
  userId: string,
  workspaceId: string,
  toolName: string,
): Promise<void> {
  await prisma.userLLMConfig.upsert({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    create: {
      userId,
      workspaceId,
      provider: 'CLAUDE',
      apiKey: '',
      alwaysAllowTools: [toolName],
    },
    update: {
      alwaysAllowTools: {
        push: toolName,
      },
    },
  });
}

// ============================================================================
// Router Definition
// ============================================================================

export const workspaceChatRouter = router({
  /**
   * Send a message to the chat
   */
  sendMessage: workspaceMemberProcedure
    .input(sendMessageInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, message, conversationId: inputConversationId } = input;
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.organizationId;

      // Check if chat is enabled for this workspace
      const settings = await prisma.workspaceChatSettings.findUnique({
        where: { workspaceId },
      });

      if (settings && !settings.enabled) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chat is not enabled for this workspace',
        });
      }

      // Check quota
      const quotaCheck = await checkQuota(workspaceId, userId);
      if (!quotaCheck.allowed) {
        const { remaining } = quotaCheck;
        const details: string[] = [];
        if (remaining.messagesLimit !== null) {
          details.push(`Messages: ${remaining.messagesUsed}/${remaining.messagesLimit}`);
        }
        if (remaining.tokensLimit !== null) {
          details.push(`Tokens: ${remaining.tokensUsed}/${remaining.tokensLimit}`);
        }
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Chat quota exceeded. ${details.join(', ')}`,
        });
      }

      // Get or create conversation
      const { id: conversationId, isNew } = await getOrCreateConversation(
        workspaceId,
        userId,
        inputConversationId,
      );

      // Get user info for context
      const userInfo = await getUserWithRoles(userId);
      if (!userInfo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Get user's tool settings
      const { alwaysAllowTools, skipToolConfirmation } = await getUserToolSettings(
        userId,
        workspaceId,
      );

      // Create unified orchestrator with workspace context
      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });

      const workspaceContext: WorkspaceAgentContext = {
        mode: 'workspace',
        organizationId,
        userId,
        conversationId,
        workspaceId,
        userEmail: userInfo.email,
        userRoles: userInfo.roles,
        alwaysAllowTools,
        skipToolConfirmation,
      };

      try {
        // Load conversation history
        const history = await loadConversationHistory(conversationId);

        // Save user message first
        await saveMessage({ conversationId, role: 'user', content: message });

        // Process message with unified orchestrator
        const response = await orchestrator.processMessage(message, workspaceContext, history);

        // Handle plan created result
        if ('planCreated' in response && response.planCreated) {
          return {
            conversationId,
            text: `Created plan: ${response.planName}`,
            planCreated: true,
            planId: response.planId,
          };
        }

        // Save assistant response
        if (response.text) {
          await saveMessage({ conversationId, role: 'assistant', content: response.text });
        }

        // Record usage (estimate tokens for now)
        const inputTokens = Math.ceil(message.length / 4);
        const outputTokens = Math.ceil(response.text.length / 4);
        await recordUsage(workspaceId, userId, { input: inputTokens, output: outputTokens });

        // Update conversation title if new
        if (isNew && response.text) {
          // Use first 50 chars of response as title
          const title = message.substring(0, 100);
          await prisma.workspaceChatConversation.update({
            where: { id: conversationId },
            data: { title },
          });
        }

        return {
          conversationId,
          text: response.text,
          model: response.model,
          permissionDenied: response.permissionDenied,
        };
      } catch (error) {
        logger.error('Chat message processing failed', {
          error,
          workspaceId,
          userId,
          conversationId,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process message',
          cause: error,
        });
      }
    }),

  /**
   * List user's conversations in a workspace
   */
  listConversations: workspaceMemberProcedure
    .input(listConversationsInputSchema)
    .query(async ({ ctx, input }) => {
      const { workspaceId, limit, cursor } = input;
      const userId = ctx.auth.user.id;

      const conversations = await prisma.workspaceChatConversation.findMany({
        where: {
          workspaceId,
          userId,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
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
          messageCount: c._count.messages,
        })),
        nextCursor,
      };
    }),

  /**
   * Get a specific conversation with messages
   */
  getConversation: workspaceMemberProcedure
    .input(conversationIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { workspaceId, conversationId } = input;
      const userId = ctx.auth.user.id;

      const conversation = await prisma.workspaceChatConversation.findFirst({
        where: {
          id: conversationId,
          workspaceId,
          userId,
        },
        include: {
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
   * Delete a conversation
   */
  deleteConversation: workspaceMemberProcedure
    .input(conversationIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, conversationId } = input;
      const userId = ctx.auth.user.id;

      const conversation = await prisma.workspaceChatConversation.findFirst({
        where: {
          id: conversationId,
          workspaceId,
          userId,
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      // Delete messages first (cascade should handle this, but be explicit)
      await prisma.workspaceChatMessage.deleteMany({
        where: { conversationId },
      });

      // Delete conversation
      await prisma.workspaceChatConversation.delete({
        where: { id: conversationId },
      });

      return { success: true };
    }),

  /**
   * Retry from a specific message in the conversation
   * Deletes all messages after (and including the assistant response to) the specified message
   * and regenerates the response
   */
  retryFromMessage: workspaceMemberProcedure
    .input(retryFromMessageInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, conversationId, messageId } = input;
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.organizationId;

      // Verify conversation belongs to user
      const conversation = await prisma.workspaceChatConversation.findFirst({
        where: {
          id: conversationId,
          workspaceId,
          userId,
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      // Find the message to retry from
      const message = await prisma.workspaceChatMessage.findFirst({
        where: {
          id: messageId,
          conversationId,
        },
      });

      if (!message) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Message not found',
        });
      }

      // Delete all messages after this one (keep the user message being retried)
      const deletedMessages = await prisma.workspaceChatMessage.deleteMany({
        where: {
          conversationId,
          createdAt: { gt: message.createdAt },
        },
      });

      // Get user info for context
      const userInfo = await getUserWithRoles(userId);
      if (!userInfo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Get user's tool settings
      const { alwaysAllowTools, skipToolConfirmation } = await getUserToolSettings(
        userId,
        workspaceId,
      );

      // Load conversation history (up to the message being retried)
      const conversationHistory = await loadConversationHistory(conversationId);

      // Build workspace context for unified orchestrator
      const workspaceContext: WorkspaceAgentContext = {
        mode: 'workspace',
        workspaceId,
        conversationId,
        userId,
        userEmail: userInfo.email,
        userRoles: userInfo.roles,
        organizationId,
        alwaysAllowTools,
        skipToolConfirmation,
      };

      try {
        // Re-process the message using unified orchestrator
        const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });
        const response = await orchestrator.processMessage(
          message.content,
          workspaceContext,
          conversationHistory,
        );

        // Handle plan created result
        if ('planCreated' in response && response.planCreated) {
          return {
            conversationId,
            deletedCount: deletedMessages.count,
            text: `Created plan: ${response.planName}`,
            planCreated: true,
            planId: response.planId,
          };
        }

        // Save the assistant response
        const messageId = await saveMessage({
          conversationId,
          role: 'assistant',
          content: response.text,
        });

        // Record usage (estimate tokens)
        const inputTokens = Math.ceil(message.content.length / 4);
        const outputTokens = Math.ceil(response.text.length / 4);
        await recordUsage(workspaceId, userId, { input: inputTokens, output: outputTokens });

        return {
          conversationId,
          deletedCount: deletedMessages.count,
          text: response.text,
          messageId,
          model: response.model,
          permissionDenied: response.permissionDenied,
        };
      } catch (error) {
        logger.error('Retry from message failed', {
          error,
          workspaceId,
          userId,
          conversationId,
          messageId,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retry message',
          cause: error,
        });
      }
    }),

  /**
   * Retry from a specific message with streaming response
   * Deletes all messages after the target message and streams a new response
   */
  retryFromMessageStream: workspaceMemberProcedure
    .input(retryFromMessageInputSchema)
    .mutation(async function* ({ ctx, input }): AsyncGenerator<UnifiedStreamingEvent> {
      const { workspaceId, conversationId, messageId } = input;
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.organizationId;

      // Check if chat is enabled for this workspace
      const settings = await prisma.workspaceChatSettings.findUnique({
        where: { workspaceId },
      });

      if (settings && !settings.enabled) {
        yield { type: 'error', error: 'Chat is not enabled for this workspace' };
        return;
      }

      // Verify conversation belongs to user
      const conversation = await prisma.workspaceChatConversation.findFirst({
        where: {
          id: conversationId,
          workspaceId,
          userId,
        },
      });

      if (!conversation) {
        yield { type: 'error', error: 'Conversation not found' };
        return;
      }

      // Find the message to retry from
      const message = await prisma.workspaceChatMessage.findFirst({
        where: {
          id: messageId,
          conversationId,
        },
      });

      if (!message) {
        yield { type: 'error', error: 'Message not found' };
        return;
      }

      // Delete all messages after this one (keep the user message being retried)
      await prisma.workspaceChatMessage.deleteMany({
        where: {
          conversationId,
          createdAt: { gt: message.createdAt },
        },
      });

      // Get user info for context
      const userInfo = await getUserWithRoles(userId);
      if (!userInfo) {
        yield { type: 'error', error: 'User not found' };
        return;
      }

      // Get user's tool settings
      const { alwaysAllowTools, skipToolConfirmation } = await getUserToolSettings(
        userId,
        workspaceId,
      );

      // Load conversation history
      const history = await loadConversationHistory(conversationId);

      // Create unified streaming orchestrator with workspace context
      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });

      // Build workspace context
      const workspaceContext: WorkspaceAgentContext = {
        mode: 'workspace',
        organizationId,
        userId,
        conversationId,
        workspaceId,
        userEmail: userInfo.email,
        userRoles: userInfo.roles,
        alwaysAllowTools,
        skipToolConfirmation,
      };

      // Accumulate text for saving
      let accumulatedText = '';
      const toolNames: string[] = [];

      try {
        // Stream the response using unified orchestrator
        for await (const event of orchestrator.processMessageStream(
          message.content,
          workspaceContext,
          history,
        )) {
          // Track text for saving
          if (event.type === 'text') {
            accumulatedText += event.text;
          }

          // Track tool names for usage recording
          if (event.type === 'tool_result' && event.success) {
            toolNames.push(event.toolName);
          }

          yield event;
        }

        // Save assistant message after stream completes
        if (accumulatedText) {
          await saveMessage({
            conversationId,
            role: 'assistant',
            content: accumulatedText,
          });
        }

        // Save tool call messages
        for (const toolName of toolNames) {
          await prisma.workspaceChatMessage.create({
            data: {
              conversationId,
              role: ChatMessageRole.TOOL_USE,
              content: `Called ${toolName}`,
              toolName,
            },
          });
        }

        // Record usage (estimate tokens)
        const inputTokens = Math.ceil(message.content.length / 4);
        const outputTokens = Math.ceil(accumulatedText.length / 4);
        await recordUsage(workspaceId, userId, { input: inputTokens, output: outputTokens });
      } catch (error) {
        logger.error('Streaming retry from message failed', {
          error,
          workspaceId,
          userId,
          conversationId,
          messageId,
        });

        yield { type: 'error', error: 'Failed to retry message' };
      }
    }),

  /**
   * Execute a tool after user confirmation
   */
  executeTool: workspaceMemberProcedure
    .input(executeToolInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, conversationId, toolUseId, toolName, toolInput, alwaysAllow } = input;
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.organizationId;

      // Verify conversation belongs to user
      const conversation = await prisma.workspaceChatConversation.findFirst({
        where: {
          id: conversationId,
          workspaceId,
          userId,
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      // If alwaysAllow is true, add to user's always-allow list
      if (alwaysAllow) {
        await addToAlwaysAllowTools(userId, workspaceId, toolName);
      }

      // Get user info for context
      const userInfo = await getUserWithRoles(userId);
      if (!userInfo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Get user's tool settings
      const { alwaysAllowTools, skipToolConfirmation } = await getUserToolSettings(
        userId,
        workspaceId,
      );

      // Build workspace context for unified orchestrator
      const workspaceContext: WorkspaceAgentContext = {
        mode: 'workspace',
        workspaceId,
        conversationId,
        userId,
        userEmail: userInfo.email,
        userRoles: userInfo.roles,
        organizationId,
        alwaysAllowTools,
        skipToolConfirmation,
      };

      try {
        // Execute confirmed tool using unified orchestrator
        const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });
        const response = await orchestrator.executeConfirmedTool(
          workspaceContext,
          toolName,
          toolInput,
          toolUseId,
        );

        // Save the assistant response if there's text
        if (response.text) {
          await saveMessage({
            conversationId,
            role: 'assistant',
            content: response.text,
          });
        }

        return {
          conversationId,
          text: response.text,
          model: response.model,
          permissionDenied: response.permissionDenied,
        };
      } catch (error) {
        logger.error('Tool execution failed', {
          error,
          workspaceId,
          userId,
          toolName,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to execute tool',
          cause: error,
        });
      }
    }),

  /**
   * Request access to a specific tool
   */
  requestToolAccess: workspaceMemberProcedure
    .input(requestToolAccessInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, toolName, reason, conversationId } = input;
      const userId = ctx.auth.user.id;

      // Create permission request
      const permissionRequest = await prisma.permissionRequest.create({
        data: {
          userId,
          type: 'TOOL_ACCESS',
          status: 'PENDING',
          toolNames: [toolName],
          reason,
          data: {
            workspaceId,
            requestedAt: new Date().toISOString(),
          },
        },
      });

      // Link to conversation message if provided
      if (conversationId) {
        await prisma.workspaceChatMessage.create({
          data: {
            conversationId,
            role: 'PERMISSION_REQUEST',
            content: `Requested access to tool: ${toolName}. Reason: ${reason}`,
            permissionRequestId: permissionRequest.id,
          },
        });
      }

      return {
        id: permissionRequest.id,
        status: permissionRequest.status,
      };
    }),

  /**
   * Request access to all tools from an MCP server
   */
  requestServerAccess: workspaceMemberProcedure
    .input(requestServerAccessInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, serverDomain, reason, conversationId } = input;
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.organizationId;

      // Find the server by domain
      const server = await prisma.mcpServer.findFirst({
        where: {
          organizationId,
          url: { contains: serverDomain },
          deletedAt: null,
        },
      });

      // Create permission request for MCP server access
      const permissionRequest = await prisma.permissionRequest.create({
        data: {
          userId,
          type: 'MCP_SERVER',
          status: 'PENDING',
          reason,
          toolNames: [], // Empty for MCP_SERVER type requests
          data: {
            workspaceId,
            serverDomain,
            serverId: server?.id,
            serverName: server?.name,
            requestedAt: new Date().toISOString(),
          },
        },
      });

      // Link to conversation message if provided
      if (conversationId) {
        const serverLabel = server?.name ?? serverDomain;
        await prisma.workspaceChatMessage.create({
          data: {
            conversationId,
            role: 'PERMISSION_REQUEST',
            content: `Requested access to MCP server: ${serverLabel}. Reason: ${reason}`,
            permissionRequestId: permissionRequest.id,
          },
        });
      }

      return {
        id: permissionRequest.id,
        status: permissionRequest.status,
      };
    }),

  /**
   * Get available tools for the workspace
   */
  getAvailableTools: workspaceMemberProcedure
    .input(z.object({ workspaceId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;
      const organizationId = ctx.auth.organizationId;

      const tools = await workspaceToolRouter.getAvailableTools(organizationId, workspaceId);

      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        serverName: tool.serverName,
        serverDomain: tool.serverDomain,
      }));
    }),

  /**
   * Get resolved LLM configuration for current user/workspace
   */
  getLLMConfig: workspaceMemberProcedure
    .input(z.object({ workspaceId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;
      const userId = ctx.auth.user.id;

      try {
        const config = await WorkspaceLLMClient.resolveConfig(workspaceId, userId);
        return {
          provider: config.provider,
          model: config.model,
          source: config.source,
        };
      } catch {
        return {
          provider: null,
          model: null,
          source: null,
          error: 'No LLM configuration available',
        };
      }
    }),

  /**
   * Send a message with streaming response
   * Returns an async iterable of streaming events
   * Uses the unified streaming orchestrator with workspace context
   */
  sendMessageStream: workspaceMemberProcedure
    .input(sendMessageInputSchema)
    .mutation(async function* ({ ctx, input }): AsyncGenerator<UnifiedStreamingEvent> {
      const { workspaceId, message, conversationId: inputConversationId } = input;
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.organizationId;

      // Check if chat is enabled for this workspace
      const settings = await prisma.workspaceChatSettings.findUnique({
        where: { workspaceId },
      });

      if (settings && !settings.enabled) {
        yield { type: 'error', error: 'Chat is not enabled for this workspace' };
        return;
      }

      // Check quota
      const quotaCheck = await checkQuota(workspaceId, userId);
      if (!quotaCheck.allowed) {
        const { remaining } = quotaCheck;
        const details: string[] = [];
        if (remaining.messagesLimit !== null) {
          details.push(`Messages: ${remaining.messagesUsed}/${remaining.messagesLimit}`);
        }
        if (remaining.tokensLimit !== null) {
          details.push(`Tokens: ${remaining.tokensUsed}/${remaining.tokensLimit}`);
        }
        yield { type: 'error', error: `Chat quota exceeded. ${details.join(', ')}` };
        return;
      }

      // Get or create conversation
      const { id: conversationId, isNew } = await getOrCreateConversation(
        workspaceId,
        userId,
        inputConversationId,
      );

      // Emit conversation_created event for new conversations
      if (isNew) {
        yield { type: 'conversation_created', conversationId };
      }

      // Get user info for context
      const userInfo = await getUserWithRoles(userId);
      if (!userInfo) {
        yield { type: 'error', error: 'User not found' };
        return;
      }

      // Get user's tool settings
      const { alwaysAllowTools, skipToolConfirmation } = await getUserToolSettings(
        userId,
        workspaceId,
      );

      // Save user message
      await saveMessage({
        conversationId,
        role: 'user',
        content: message,
      });

      // Load conversation history
      const history = await loadConversationHistory(conversationId);
      // Remove the just-added user message from history (we'll add it in the orchestrator)
      const previousHistory = history.slice(0, -1);

      // Create unified streaming orchestrator with workspace context
      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });

      // Build workspace context
      const workspaceContext: WorkspaceAgentContext = {
        mode: 'workspace',
        organizationId,
        userId,
        conversationId,
        workspaceId,
        userEmail: userInfo.email,
        userRoles: userInfo.roles,
        alwaysAllowTools,
        skipToolConfirmation,
      };

      // Accumulate text for saving
      let accumulatedText = '';
      const toolNames: string[] = [];

      try {
        // Stream the response using unified orchestrator
        for await (const event of orchestrator.processMessageStream(
          message,
          workspaceContext,
          previousHistory,
        )) {
          // Track text for saving
          if (event.type === 'text') {
            accumulatedText += event.text;
          }

          // Track tool names for usage recording
          if (event.type === 'tool_result' && event.success) {
            toolNames.push(event.toolName);
          }

          yield event;
        }

        // Save assistant message after stream completes
        if (accumulatedText) {
          await saveMessage({
            conversationId,
            role: 'assistant',
            content: accumulatedText,
          });
        }

        // Save tool call messages
        for (const toolName of toolNames) {
          await prisma.workspaceChatMessage.create({
            data: {
              conversationId,
              role: ChatMessageRole.TOOL_USE,
              content: `Called ${toolName}`,
              toolName,
            },
          });
        }

        // Record usage (estimate tokens)
        const inputTokens = Math.ceil(message.length / 4);
        const outputTokens = Math.ceil(accumulatedText.length / 4);
        await recordUsage(workspaceId, userId, { input: inputTokens, output: outputTokens });

        // Update conversation title if new
        if (isNew && message.length > 0) {
          const title = message.substring(0, 100);
          await prisma.workspaceChatConversation.update({
            where: { id: conversationId },
            data: { title },
          });
        }
      } catch (error) {
        logger.error('Workspace streaming chat failed', {
          error,
          workspaceId,
          userId,
          conversationId,
        });

        yield { type: 'error', error: 'Failed to process message' };
      }
    }),

  /**
   * Check if streaming is supported for the current workspace LLM configuration
   */
  supportsStreaming: workspaceMemberProcedure
    .input(z.object({ workspaceId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;
      const userId = ctx.auth.user.id;

      try {
        const client = await WorkspaceLLMClient.createClient(workspaceId, userId);
        return {
          supportsStreaming: client.supportsStreaming(),
          provider: client.getProvider(),
        };
      } catch {
        return {
          supportsStreaming: false,
          provider: null,
        };
      }
    }),
});
