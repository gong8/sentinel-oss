/**
 * Mode-specific helper functions
 *
 * Simple value mappings for mode-specific behavior.
 * Uses the mode-handlers pattern for cleaner implementation.
 */

import { AGENT_SYSTEM_PROMPT, WORKSPACE_SYSTEM_PROMPT } from '../prompts/index.js';
import type { UnifiedAgentContext } from '../unified-types.js';
import { getValueForMode, handleByMode } from './mode-handlers.js';

/**
 * Get the appropriate system prompt for the context mode
 */
export function getSystemPromptForMode(context: UnifiedAgentContext): string {
  return getValueForMode(context, {
    admin: AGENT_SYSTEM_PROMPT,
    workspace: WORKSPACE_SYSTEM_PROMPT,
  });
}

/**
 * Get the appropriate request type for LLM usage logging (non-streaming)
 */
export function getRequestTypeForMode(context: UnifiedAgentContext): string {
  return getValueForMode(context, {
    admin: 'agent',
    workspace: 'workspace_agent',
  });
}

/**
 * Get the appropriate request type for LLM usage logging (streaming)
 */
export function getStreamingRequestTypeForMode(context: UnifiedAgentContext): string {
  return getValueForMode(context, {
    admin: 'agent_stream',
    workspace: 'workspace_agent_stream',
  });
}

/**
 * Get session ID for usage logging
 */
export function getSessionIdForMode(context: UnifiedAgentContext): string | undefined {
  return handleByMode(context, {
    admin: (ctx) => ctx.sessionId,
    workspace: (ctx) => ctx.conversationId,
  });
}
