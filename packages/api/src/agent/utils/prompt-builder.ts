/**
 * Prompt Building Utilities
 *
 * Prepares system prompts with memory context injection for agent conversations.
 */

import { logger } from '../../lib/logger.js';
import { formatMemoriesForPrompt, getRelevantContext } from '../../services/agentMemory.js';
import { AgentErrorCodes } from '../errors.js';
import type { UnifiedAgentContext } from '../unified-types.js';
import { getSystemPromptForMode } from './mode-helpers.js';

/**
 * Prepare system prompt with memory context injection.
 *
 * Memory retrieval is a recoverable operation - if it fails,
 * we continue with the base system prompt and log a warning.
 */
export async function prepareSystemPromptWithMemory(
  context: UnifiedAgentContext,
  userMessage: string,
): Promise<string> {
  const systemPrompt = getSystemPromptForMode(context);

  // Memory retrieval is recoverable - failures should not block conversation
  let memoryContext = '';
  try {
    const memories = await getRelevantContext(context.organizationId, context.userId, userMessage);
    if (memories.length > 0) {
      memoryContext = formatMemoriesForPrompt(memories);
      logger.debug('Injected agent memory context', {
        memoryCount: memories.length,
        mode: context.mode,
      });
    }
  } catch (error) {
    logger.warn('Failed to retrieve agent memory context', {
      error,
      code: AgentErrorCodes.MEMORY_RETRIEVAL_FAILED,
      organizationId: context.organizationId,
      userId: context.userId,
    });
  }

  return systemPrompt + memoryContext;
}
