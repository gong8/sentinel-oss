/**
 * Agent Chat Router
 * tRPC endpoints for the agent chat functionality
 */

import { AgentMessageRole, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  addMessage,
  createConversation,
  createUnifiedOrchestrator,
  dbMessagesToConversation,
  deleteConversation,
  deleteMessagesFromId,
  getConversation,
  getMessages,
  isPlanCreatedResult,
  listConversations,
  LLMClient,
  updateConversationTitle,
  type AdminAgentContext,
  type UnifiedToolCall as ToolCall,
  type UnifiedAgentResponse,
  type UnifiedOrchestratorResponse,
  type UnifiedStreamingEvent,
} from '../../agent/index.js';
import { toClaudeMessages } from '../../agent/utils/index.js';
import type { AuthContext } from '../../services/auth.js';
import { adminProcedure, router } from '../init.js';

/**
 * Validate workspace access for agent operations.
 * Ensures the user has admin access to the specified workspace.
 *
 * @param auth - The authenticated user context
 * @param workspaceId - The workspace ID to validate (optional - null means org-wide)
 * @throws TRPCError if workspace access is denied
 */
async function validateWorkspaceAccess(
  auth: AuthContext,
  workspaceId: string | undefined,
): Promise<void> {
  // No workspace specified = org-wide operation (allowed for admins)
  if (!workspaceId) {
    return;
  }

  // Org owners can access any workspace in their organization
  if (auth.isOrgOwner) {
    // Verify the workspace belongs to this organization
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        organizationId: auth.organizationId,
        deletedAt: null,
      },
    });

    if (!workspace) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found or does not belong to this organization',
      });
    }
    return;
  }

  // Non-org-owners must be workspace admins to use the agent in workspace scope
  if (!auth.adminWorkspaceIds.includes(workspaceId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Workspace admin access required to use the agent in this workspace',
    });
  }
}

/**
 * Unified conversation type for listing all conversations
 */
export interface UnifiedConversation {
  id: string;
  type: 'SENTINEL_ADMIN' | 'WORKSPACE_AGENT';
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
  workspaceName?: string;
}

/**
 * Verify the user owns the conversation, throwing if not found or unauthorized
 */
async function verifyConversationOwnership(
  conversationId: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  const conversation = await getConversation(conversationId, organizationId);
  if (!conversation || conversation.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
  }
}

/**
 * Save tool call messages (tool use and result) for a conversation
 */
async function saveToolCallMessages(
  conversationId: string,
  organizationId: string,
  toolCalls: ToolCall[],
): Promise<void> {
  for (const toolCall of toolCalls) {
    await addMessage({
      conversationId,
      organizationId,
      role: AgentMessageRole.TOOL_USE,
      content: `Called ${toolCall.name}`,
      toolName: toolCall.name,
      toolInput: toolCall.input,
    });

    await addMessage({
      conversationId,
      organizationId,
      role: AgentMessageRole.TOOL_RESULT,
      content: toolCall.error ?? 'Success',
      toolName: toolCall.name,
      toolResult: toolCall.result ?? { error: toolCall.error },
    });
  }
}

/**
 * Format agent response for API output
 */
function formatAgentResponse(response: UnifiedAgentResponse): {
  text: string;
  toolCalls: Array<{
    name: string;
    input: unknown;
    result: unknown;
    error: string | undefined;
    confirmationId: string | undefined;
  }>;
  pendingConfirmations: UnifiedAgentResponse['pendingConfirmations'];
  model?: string;
} {
  return {
    text: response.text,
    toolCalls: response.toolCalls.map((tc) => ({
      name: tc.name,
      input: tc.input,
      result: tc.result,
      error: tc.error,
      confirmationId: tc.confirmationId,
    })),
    pendingConfirmations: response.pendingConfirmations,
    model: response.model,
  };
}

/**
 * Process a message with the orchestrator and save results
 */
async function processAndSaveResponse(
  message: string,
  conversationId: string,
  organizationId: string,
  userId: string,
  workspaceId?: string,
): Promise<UnifiedOrchestratorResponse> {
  const dbMessages = await getMessages(conversationId, organizationId);
  const history = dbMessagesToConversation(dbMessages.slice(0, -1));

  const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });
  const adminContext: AdminAgentContext = {
    mode: 'admin',
    organizationId,
    userId,
    conversationId,
    workspaceId,
  };
  const response = await orchestrator.processMessage(
    message,
    adminContext,
    toClaudeMessages(history),
  );

  // Handle plan creation result differently
  if (isPlanCreatedResult(response)) {
    // Save an assistant message indicating a plan was created
    await addMessage({
      conversationId,
      organizationId,
      role: AgentMessageRole.ASSISTANT,
      content: `I've created a plan "${response.planName}" with ${response.stepCount} steps. Please review and approve the plan to proceed.`,
    });
    return response;
  }

  await addMessage({
    conversationId,
    organizationId,
    role: AgentMessageRole.ASSISTANT,
    content: response.text,
  });

  await saveToolCallMessages(conversationId, organizationId, response.toolCalls);

  return response;
}

/**
 * Agent chat router
 */
export const agentChatRouter = router({
  sendMessage: adminProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        message: z.string().min(1).max(10000),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, user } = ctx.auth;
      const userId = user.id;

      // SECURITY: Validate workspace access before allowing agent operations
      await validateWorkspaceAccess(ctx.auth, input.workspaceId);

      // Get or create conversation
      let conversationId = input.conversationId;
      if (conversationId) {
        await verifyConversationOwnership(conversationId, organizationId, userId);
      } else {
        conversationId = await createConversation({ organizationId, userId });
      }

      // Save user message
      await addMessage({
        conversationId,
        organizationId,
        role: AgentMessageRole.USER,
        content: input.message,
      });

      const response = await processAndSaveResponse(
        input.message,
        conversationId,
        organizationId,
        userId,
        input.workspaceId,
      );

      // Auto-generate title for new conversations
      const conversation = await getConversation(conversationId, organizationId);
      if (!conversation?.title && input.message.length > 0) {
        const title = input.message.slice(0, 50) + (input.message.length > 50 ? '...' : '');
        await updateConversationTitle(conversationId, organizationId, title);
      }

      // Handle plan creation response
      if (isPlanCreatedResult(response)) {
        return {
          conversationId,
          planCreated: true as const,
          planId: response.planId,
          planName: response.planName,
          planDescription: response.planDescription,
          stepCount: response.stepCount,
          model: response.model,
        };
      }

      return {
        conversationId,
        planCreated: false as const,
        response: formatAgentResponse(response),
      };
    }),

  getConversation: adminProcedure
    .input(z.object({ conversationId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const { organizationId, user } = ctx.auth;
      const conversation = await getConversation(input.conversationId, organizationId);

      if (!conversation || conversation.userId !== user.id) {
        return null;
      }

      const messages = await getMessages(input.conversationId, organizationId);

      return {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolName: m.toolName,
          toolInput: m.toolInput,
          toolResult: m.toolResult,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }),

  listConversations: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const { organizationId, user } = ctx.auth;
      const conversations = await listConversations({
        organizationId,
        userId: user.id,
        limit: input.limit,
      });

      return conversations.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messageCount,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));
    }),

  /**
   * List all conversations (both SENTINEL_ADMIN and WORKSPACE_AGENT types)
   * Queries both AgentConversation and WorkspaceChatConversation tables
   * Excludes MCP agent-initiated conversations (mcpAgentId present)
   */
  listAllConversations: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }))
    .query(async ({ ctx, input }): Promise<UnifiedConversation[]> => {
      const { organizationId, user } = ctx.auth;
      const limit = input.limit ?? 50;

      // Query both conversation types in parallel
      const [agentConversations, workspaceConversations] = await Promise.all([
        // Sentinel Admin conversations (user-initiated only, exclude mcpAgentId)
        prisma.agentConversation.findMany({
          where: {
            organizationId,
            userId: user.id,
            mcpAgentId: null, // Exclude A2A-initiated conversations
          },
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                messages: {
                  where: {
                    role: { in: ['USER', 'ASSISTANT'] },
                  },
                },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
        // Workspace Agent conversations
        prisma.workspaceChatConversation.findMany({
          where: {
            userId: user.id,
            workspace: {
              organizationId, // Ensure user can only see conversations in their org
            },
          },
          select: {
            id: true,
            title: true,
            workspaceId: true,
            createdAt: true,
            updatedAt: true,
            workspace: {
              select: {
                name: true,
              },
            },
            _count: {
              select: {
                messages: {
                  where: {
                    role: { in: ['USER', 'ASSISTANT'] },
                  },
                },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
      ]);

      // Merge and normalize results
      const unified: UnifiedConversation[] = [
        // Map Sentinel Admin conversations
        ...agentConversations.map((c) => ({
          id: c.id,
          type: 'SENTINEL_ADMIN' as const,
          title: c.title,
          messageCount: c._count.messages,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        // Map Workspace Agent conversations
        ...workspaceConversations.map((c) => ({
          id: c.id,
          type: 'WORKSPACE_AGENT' as const,
          title: c.title,
          messageCount: c._count.messages,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          workspaceId: c.workspaceId,
          workspaceName: c.workspace.name,
        })),
      ];

      // Sort merged results by updatedAt descending and limit
      unified.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return unified.slice(0, limit);
    }),

  deleteConversation: adminProcedure
    .input(z.object({ conversationId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, user } = ctx.auth;
      await verifyConversationOwnership(input.conversationId, organizationId, user.id);
      await deleteConversation(input.conversationId, organizationId);
      return { success: true };
    }),

  updateTitle: adminProcedure
    .input(
      z.object({
        conversationId: z.string().cuid(),
        title: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, user } = ctx.auth;
      await verifyConversationOwnership(input.conversationId, organizationId, user.id);
      await updateConversationTitle(input.conversationId, organizationId, input.title);
      return { success: true };
    }),

  retryFromMessage: adminProcedure
    .input(
      z.object({
        conversationId: z.string().cuid(),
        messageId: z.string().cuid(),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, user } = ctx.auth;
      const userId = user.id;

      // SECURITY: Validate workspace access before allowing agent operations
      await validateWorkspaceAccess(ctx.auth, input.workspaceId);

      await verifyConversationOwnership(input.conversationId, organizationId, userId);

      const { deletedCount, messageContent } = await deleteMessagesFromId(
        input.conversationId,
        organizationId,
        input.messageId,
      );

      if (deletedCount === 0 || !messageContent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' });
      }

      await addMessage({
        conversationId: input.conversationId,
        organizationId,
        role: AgentMessageRole.USER,
        content: messageContent,
      });

      const response = await processAndSaveResponse(
        messageContent,
        input.conversationId,
        organizationId,
        userId,
        input.workspaceId,
      );

      // Handle plan creation response
      if (isPlanCreatedResult(response)) {
        return {
          conversationId: input.conversationId,
          deletedCount,
          planCreated: true as const,
          planId: response.planId,
          planName: response.planName,
          planDescription: response.planDescription,
          stepCount: response.stepCount,
          model: response.model,
        };
      }

      return {
        conversationId: input.conversationId,
        deletedCount,
        planCreated: false as const,
        response: formatAgentResponse(response),
      };
    }),

  /**
   * Retry from a specific message with streaming response
   * Deletes all messages after the target message and streams a new response
   */
  retryFromMessageStream: adminProcedure
    .input(
      z.object({
        conversationId: z.string().cuid(),
        messageId: z.string().cuid(),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async function* ({ ctx, input }): AsyncGenerator<UnifiedStreamingEvent> {
      const { organizationId, user } = ctx.auth;
      const userId = user.id;

      // SECURITY: Validate workspace access before allowing agent operations
      await validateWorkspaceAccess(ctx.auth, input.workspaceId);

      await verifyConversationOwnership(input.conversationId, organizationId, userId);

      const { deletedCount, messageContent } = await deleteMessagesFromId(
        input.conversationId,
        organizationId,
        input.messageId,
      );

      if (deletedCount === 0 || !messageContent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' });
      }

      // Re-add the user message
      await addMessage({
        conversationId: input.conversationId,
        organizationId,
        role: AgentMessageRole.USER,
        content: messageContent,
      });

      // Get conversation history
      const dbMessages = await getMessages(input.conversationId, organizationId);
      const history = dbMessagesToConversation(dbMessages.slice(0, -1));

      // Create unified streaming orchestrator with admin context
      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });

      // Build admin context
      const adminContext: AdminAgentContext = {
        mode: 'admin',
        organizationId,
        userId,
        conversationId: input.conversationId,
        workspaceId: input.workspaceId,
      };

      // Accumulate text for saving
      let accumulatedText = '';
      const toolCalls: ToolCall[] = [];

      // Stream the response using unified orchestrator
      for await (const event of orchestrator.processMessageStream(
        messageContent,
        adminContext,
        toClaudeMessages(history),
      )) {
        // Track text for saving
        if (event.type === 'text') {
          accumulatedText += event.text;
        }

        // Track tool calls for saving
        if (event.type === 'tool_result') {
          toolCalls.push({
            id: event.toolId,
            name: event.toolName,
            input: event.input ?? {},
            result: event.success ? (event.result ?? {}) : undefined,
            error: event.error,
          });
        }

        yield event;
      }

      // Save assistant message after stream completes
      if (accumulatedText) {
        await addMessage({
          conversationId: input.conversationId,
          organizationId,
          role: AgentMessageRole.ASSISTANT,
          content: accumulatedText,
        });
      }

      // Save tool calls
      await saveToolCallMessages(input.conversationId, organizationId, toolCalls);
    }),

  /**
   * Get resolved LLM configuration for admin agent
   */
  getLLMConfig: adminProcedure.query(async ({ ctx }) => {
    const { organizationId } = ctx.auth;

    try {
      const client = await LLMClient.forOrganization(organizationId);
      return {
        provider: client.getProvider(),
        model: client.getModel(),
        source: 'org' as const,
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
   * Uses the unified streaming orchestrator with admin context
   */
  sendMessageStream: adminProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        message: z.string().min(1).max(10000),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async function* ({ ctx, input }): AsyncGenerator<UnifiedStreamingEvent> {
      const { organizationId, user } = ctx.auth;
      const userId = user.id;

      // SECURITY: Validate workspace access before allowing agent operations
      await validateWorkspaceAccess(ctx.auth, input.workspaceId);

      // Get or create conversation
      let conversationId = input.conversationId;
      const isNewConversation = !conversationId;
      if (conversationId) {
        await verifyConversationOwnership(conversationId, organizationId, userId);
      } else {
        conversationId = await createConversation({ organizationId, userId });
      }

      // Emit conversation_created event for new conversations
      if (isNewConversation) {
        yield { type: 'conversation_created', conversationId };
      }

      // Save user message
      await addMessage({
        conversationId,
        organizationId,
        role: AgentMessageRole.USER,
        content: input.message,
      });

      // Get conversation history
      const dbMessages = await getMessages(conversationId, organizationId);
      const history = dbMessagesToConversation(dbMessages.slice(0, -1));

      // Create unified streaming orchestrator with admin context
      const orchestrator = createUnifiedOrchestrator({ includeWriteTools: true });

      // Build admin context
      const adminContext: AdminAgentContext = {
        mode: 'admin',
        organizationId,
        userId,
        conversationId,
        workspaceId: input.workspaceId,
      };

      // Accumulate text for saving
      let accumulatedText = '';
      const toolCalls: ToolCall[] = [];

      // Stream the response using unified orchestrator
      for await (const event of orchestrator.processMessageStream(
        input.message,
        adminContext,
        toClaudeMessages(history),
      )) {
        // Track text for saving
        if (event.type === 'text') {
          accumulatedText += event.text;
        }

        // Track tool calls for saving
        if (event.type === 'tool_result') {
          toolCalls.push({
            id: event.toolId,
            name: event.toolName,
            input: event.input ?? {},
            result: event.success ? (event.result ?? {}) : undefined,
            error: event.error,
          });
        }

        yield event;
      }

      // Save assistant message after stream completes
      if (accumulatedText) {
        await addMessage({
          conversationId,
          organizationId,
          role: AgentMessageRole.ASSISTANT,
          content: accumulatedText,
        });
      }

      // Save tool calls
      await saveToolCallMessages(conversationId, organizationId, toolCalls);

      // Auto-generate title for new conversations
      const conversation = await getConversation(conversationId, organizationId);
      if (!conversation?.title && input.message.length > 0) {
        const title = input.message.slice(0, 50) + (input.message.length > 50 ? '...' : '');
        await updateConversationTitle(conversationId, organizationId, title);
      }
    }),

  /**
   * Check if streaming is supported for the current LLM provider
   */
  supportsStreaming: adminProcedure.query(async ({ ctx }) => {
    const { organizationId } = ctx.auth;

    try {
      const client = await LLMClient.forOrganization(organizationId);
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
