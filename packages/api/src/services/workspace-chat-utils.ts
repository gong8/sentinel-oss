/**
 * Workspace Chat Utilities
 * Helper functions for workspace chat persistence
 */

import { ChatMessageRole, prisma } from '@sentinel/db';

import type { LLMMessage } from '../agent/llm/index.js';

// ============================================================================
// ROLE MAPPING
// ============================================================================

/**
 * Map database chat role to LLM message role
 */
function mapRoleToLLM(role: ChatMessageRole): 'user' | 'assistant' {
  switch (role) {
    case ChatMessageRole.USER:
    case ChatMessageRole.TOOL_RESULT:
    case ChatMessageRole.PERMISSION_REQUEST:
      return 'user';
    case ChatMessageRole.ASSISTANT:
    case ChatMessageRole.TOOL_USE:
      return 'assistant';
  }
}

/**
 * Map LLM message role to database chat role
 */
function mapRoleFromLLM(role: 'user' | 'assistant'): ChatMessageRole {
  return role === 'user' ? ChatMessageRole.USER : ChatMessageRole.ASSISTANT;
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Load conversation history from database
 */
export async function loadConversationHistory(conversationId: string): Promise<LLMMessage[]> {
  const messages = await prisma.workspaceChatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });

  return messages.map((msg) => ({
    role: mapRoleToLLM(msg.role),
    content: msg.content,
  }));
}

/**
 * Save a chat message to the database
 */
export async function saveMessage(params: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
}): Promise<string> {
  const message = await prisma.workspaceChatMessage.create({
    data: {
      conversationId: params.conversationId,
      role: mapRoleFromLLM(params.role),
      content: params.content,
    },
  });

  return message.id;
}
