/**
 * Conversation Management
 * Handles persistence and retrieval of agent conversations
 *
 * Error Handling Strategy:
 * - Access denied: Throw AgentError with CONVERSATION_ACCESS_DENIED
 * - Not found: Return null or false (recoverable)
 * - Database errors: Let Prisma errors propagate (unrecoverable)
 */

import type { AgentMessageRole } from '@sentinel/db';
import {
  prismaConversationRepository,
  type IConversationRepository,
} from './repositories/index.js';
import type { ToolCall } from './unified-types.js';
import type { ConversationMessageForConversion } from './utils/index.js';

/**
 * Create a new conversation
 */
export async function createConversation(
  params: {
    organizationId: string;
    userId?: string;
    mcpAgentId?: string;
    title?: string;
  },
  repository: IConversationRepository = prismaConversationRepository,
): Promise<string> {
  return repository.create(params);
}

/**
 * Get a conversation by ID
 */
export async function getConversation(
  conversationId: string,
  organizationId: string,
  repository: IConversationRepository = prismaConversationRepository,
): Promise<{
  id: string;
  title: string | null;
  userId: string | null;
  mcpAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  return repository.findById(conversationId, organizationId);
}

/**
 * List conversations for a user
 */
export async function listConversations(
  params: {
    organizationId: string;
    userId?: string;
    mcpAgentId?: string;
    limit?: number;
  },
  repository: IConversationRepository = prismaConversationRepository,
): Promise<
  Array<{
    id: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
  }>
> {
  return repository.list(params);
}

/**
 * Add a message to a conversation
 * SECURITY: Validates conversation belongs to organization before adding message
 */
export async function addMessage(
  params: {
    conversationId: string;
    organizationId: string;
    role: AgentMessageRole;
    content: string;
    toolName?: string;
    toolInput?: unknown;
    toolResult?: unknown;
  },
  repository: IConversationRepository = prismaConversationRepository,
): Promise<string> {
  return repository.addMessage(params);
}

/**
 * Get messages for a conversation
 * SECURITY: Validates conversation belongs to organization via join filter
 */
export async function getMessages(
  conversationId: string,
  organizationId: string,
  limit?: number,
  repository: IConversationRepository = prismaConversationRepository,
): Promise<
  Array<{
    id: string;
    role: AgentMessageRole;
    content: string;
    toolName: string | null;
    toolInput: unknown;
    toolResult: unknown;
    createdAt: Date;
  }>
> {
  return repository.getMessages(conversationId, organizationId, limit);
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(
  conversationId: string,
  organizationId: string,
  repository: IConversationRepository = prismaConversationRepository,
): Promise<boolean> {
  return repository.delete(conversationId, organizationId);
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  organizationId: string,
  title: string,
  repository: IConversationRepository = prismaConversationRepository,
): Promise<boolean> {
  return repository.updateTitle(conversationId, organizationId, title);
}

/**
 * Delete a message and all messages after it in a conversation
 * SECURITY: Validates conversation belongs to organization via join filter
 */
export async function deleteMessagesFromId(
  conversationId: string,
  organizationId: string,
  messageId: string,
  repository: IConversationRepository = prismaConversationRepository,
): Promise<{ deletedCount: number; messageContent: string | null }> {
  return repository.deleteMessagesFromId(conversationId, organizationId, messageId);
}

/**
 * Update the toolResult of a TOOL_RESULT message that contains a specific confirmationId.
 * Used to update the message after a confirmation is executed.
 * SECURITY: Validates conversation belongs to organization via join filter
 */
export async function updateToolResultByConfirmationId(
  conversationId: string,
  organizationId: string,
  confirmationId: string,
  newToolResult: unknown,
  repository: IConversationRepository = prismaConversationRepository,
): Promise<boolean> {
  return repository.updateToolResultByConfirmationId(
    conversationId,
    organizationId,
    confirmationId,
    newToolResult,
  );
}

/**
 * Convert database messages to conversation format
 */
export function dbMessagesToConversation(
  messages: Array<{
    role: AgentMessageRole;
    content: string;
    toolName: string | null;
    toolInput: unknown;
    toolResult: unknown;
  }>,
): ConversationMessageForConversion[] {
  const result: ConversationMessageForConversion[] = [];
  let currentAssistantMessage: ConversationMessageForConversion | null = null;
  const pendingToolCalls: ToolCall[] = [];

  function flushAssistantMessage(): void {
    if (!currentAssistantMessage) return;
    if (pendingToolCalls.length > 0) {
      currentAssistantMessage.toolCalls = [...pendingToolCalls];
      pendingToolCalls.length = 0;
    }
    result.push(currentAssistantMessage);
    currentAssistantMessage = null;
  }

  for (const msg of messages) {
    if (msg.role === 'USER') {
      flushAssistantMessage();
      result.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'ASSISTANT') {
      flushAssistantMessage();
      currentAssistantMessage = { role: 'assistant', content: msg.content };
    } else if (msg.role === 'TOOL_USE') {
      if (!currentAssistantMessage) {
        currentAssistantMessage = { role: 'assistant', content: '' };
      }
      pendingToolCalls.push({
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: msg.toolName ?? 'unknown',
        input: msg.toolInput,
      });
    } else if (msg.role === 'TOOL_RESULT') {
      const lastPending = pendingToolCalls[pendingToolCalls.length - 1];
      if (lastPending && msg.toolName === lastPending.name) {
        lastPending.result = msg.toolResult;
      }
    }
  }

  flushAssistantMessage();
  return result;
}
