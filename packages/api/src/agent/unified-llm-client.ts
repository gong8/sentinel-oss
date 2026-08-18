/**
 * Unified LLM Client Factory
 * Creates LLM clients with mode-appropriate credential resolution
 *
 * Uses the mode-handlers pattern for cleaner mode-specific logic.
 */

import * as WorkspaceLLMClient from '../services/workspace-llm-client.js';
import { AgentErrorCodes, isAgentError } from './errors.js';
import { LLMClient } from './llm/index.js';
import type { UnifiedAgentContext } from './unified-types.js';
import { handleByModeAsync } from './utils/index.js';

// ============================================================================
// LLM CLIENT FACTORY
// ============================================================================

/**
 * Create an LLM client for the given context
 *
 * Admin mode: Uses organization-level LLM settings
 * Workspace mode: Uses workspace LLM settings with priority User > Workspace > Org > Env
 */
export async function createLLMClientForContext(context: UnifiedAgentContext): Promise<LLMClient> {
  return handleByModeAsync(context, {
    admin: (ctx) => LLMClient.forOrganization(ctx.organizationId),
    workspace: (ctx) => WorkspaceLLMClient.createClient(ctx.workspaceId, ctx.userId),
  });
}

/**
 * Check if the LLM provider for the given context supports streaming
 */
export async function supportsStreamingForContext(
  context: UnifiedAgentContext,
): Promise<{ supportsStreaming: boolean; provider: string | null; error?: string }> {
  try {
    const client = await createLLMClientForContext(context);
    return {
      supportsStreaming: client.supportsStreaming(),
      provider: client.getProvider(),
    };
  } catch (error) {
    // Re-throw database errors - these are infrastructure failures
    if (isAgentError(error) && error.code === AgentErrorCodes.DATABASE_ERROR) {
      throw error;
    }
    // For configuration errors (no LLM configured), return graceful fallback
    return {
      supportsStreaming: false,
      provider: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the resolved LLM configuration for the given context
 */
export async function getLLMConfigForContext(context: UnifiedAgentContext): Promise<{
  provider: string | null;
  model: string | null;
  source: string | null;
  error?: string;
}> {
  try {
    return handleByModeAsync(context, {
      admin: async (ctx) => {
        const client = await LLMClient.forOrganization(ctx.organizationId);
        return {
          provider: client.getProvider(),
          model: client.getModel(),
          source: 'org' as const,
        };
      },
      workspace: async (ctx) => {
        const config = await WorkspaceLLMClient.resolveConfig(ctx.workspaceId, ctx.userId);
        return {
          provider: config.provider,
          model: config.model ?? null,
          source: config.source,
        };
      },
    });
  } catch (error) {
    // Re-throw database errors - these are infrastructure failures
    if (isAgentError(error) && error.code === AgentErrorCodes.DATABASE_ERROR) {
      throw error;
    }
    // For configuration errors (no LLM configured), return graceful fallback
    return {
      provider: null,
      model: null,
      source: null,
      error: error instanceof Error ? error.message : 'No LLM configuration available',
    };
  }
}
