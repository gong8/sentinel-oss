/**
 * Analytics Utilities
 *
 * Fire-and-forget operations for LLM usage logging and tool usage recording.
 * Failures are logged but do not affect the main execution flow.
 */

import { logger } from '../../lib/logger.js';
import { recordToolUsage } from '../../services/agentMemory.js';
import { logLlmUsage } from '../../services/llmUsage.js';
import { AgentErrorCodes } from '../errors.js';
import type { UnifiedAgentContext } from '../unified-types.js';
import { getSessionIdForMode } from './mode-helpers.js';

/**
 * Execute a fire-and-forget async operation with proper error logging.
 * Use this for operations where we don't need to wait for the result
 * and failures should not block the main flow.
 *
 * @param operation - The async operation to execute
 * @param errorMessage - Message to log if the operation fails
 * @param errorContext - Additional context for the error log
 */
function safeFireAndForget(
  operation: Promise<unknown>,
  errorMessage: string,
  errorContext?: Record<string, unknown>,
): void {
  operation.catch((error: unknown) => {
    logger.warn(errorMessage, {
      error,
      code: AgentErrorCodes.INTERNAL_ERROR,
      ...errorContext,
    });
  });
}

/**
 * Record tool usage for pattern learning (fire and forget).
 *
 * This operation runs in the background and failures are logged but don't
 * affect the main execution flow.
 */
export function recordToolUsageAsync(
  organizationId: string,
  userId: string,
  toolName: string,
  keywords: string[],
  success: boolean,
): void {
  safeFireAndForget(
    recordToolUsage({
      organizationId,
      userId,
      toolName,
      contextKeywords: keywords,
      success,
    }),
    'Failed to record tool usage',
    { organizationId, toolName },
  );
}

/**
 * Log LLM usage for a response (fire and forget).
 *
 * This operation runs in the background and failures are logged but don't
 * affect the main execution flow.
 */
export function logLlmUsageForResponse(
  context: UnifiedAgentContext,
  provider: string,
  model: string,
  usage: { inputTokens: number; outputTokens: number } | undefined,
  requestType: string,
): void {
  if (!usage) {
    return;
  }

  safeFireAndForget(
    logLlmUsage({
      organizationId: context.organizationId,
      sessionId: getSessionIdForMode(context),
      provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      requestType,
    }),
    'Failed to log LLM usage',
    { organizationId: context.organizationId, requestType },
  );
}
