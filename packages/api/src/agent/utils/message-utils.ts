/**
 * Message conversion utilities
 */

import type { ContentBlock, LLMMessage } from '../llm/index.js';
import {
  createToolResultContent,
  toToolUseContent,
  type ToolCallForSerialization,
} from './serialization.js';

/**
 * Conversation message interface for converting to LLM format
 */
export interface ConversationMessageForConversion {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallForSerialization[];
}

/**
 * Convert conversation messages to LLM message format
 */
export function toClaudeMessages(messages: ConversationMessageForConversion[]): LLMMessage[] {
  const llmMessages: LLMMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      llmMessages.push({ role: 'user', content: msg.content });
      continue;
    }

    // Assistant message without tool calls
    if (!msg.toolCalls || msg.toolCalls.length === 0) {
      llmMessages.push({ role: 'assistant', content: msg.content });
      continue;
    }

    // Assistant message with tool calls
    const content: ContentBlock[] = [];
    if (msg.content) {
      content.push({ type: 'text', text: msg.content });
    }
    content.push(...msg.toolCalls.map(toToolUseContent));

    llmMessages.push({ role: 'assistant', content });
    llmMessages.push({ role: 'user', content: msg.toolCalls.map(createToolResultContent) });
  }

  return llmMessages;
}
