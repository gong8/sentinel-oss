/**
 * Orchestrator Helpers
 *
 * Core orchestration utilities for tool selection, plan generation, and data transformation.
 *
 * Error Handling Strategy:
 * - Plan generation: Returns null for recoverable failures
 * - Fire-and-forget operations: Use safeFireAndForget() wrapper
 */

import { logger } from '../../lib/logger.js';
import { createPlan, generatePlanPrompt, parsePlanFromLLM } from '../../services/agentPlan.js';
import { logLlmUsage } from '../../services/llmUsage.js';
import { selectTools } from '../../services/toolSelection.js';
import { AgentErrorCodes, isAgentError, isTransientError } from '../errors.js';
import { LLMClient, type ToolDefinition } from '../llm/index.js';
import type { PermissionDeniedInfo, PlanGenerationResult } from '../result-types.js';
import type { UnifiedToolRouter } from '../unified-tool-router.js';
import type { UnifiedAgentContext } from '../unified-types.js';
import { getValueForMode } from './mode-handlers.js';
import { getSessionIdForMode } from './mode-helpers.js';

// Re-export types for backward compatibility
export type {
  PlanGenerationResult as GeneratedPlanResult,
  PermissionDeniedInfo as PermissionDeniedData,
} from '../result-types.js';

// Re-export functions from new modules for backward compatibility
export { logLlmUsageForResponse, recordToolUsageAsync } from './analytics.js';
export { prepareSystemPromptWithMemory } from './prompt-builder.js';

// ============================================================================
// FIRE-AND-FORGET HELPER
// ============================================================================

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
    // Determine error category for better observability
    const errorCategory = isTransientError(error)
      ? 'transient'
      : isAgentError(error) && error.code === AgentErrorCodes.DATABASE_ERROR
        ? 'database'
        : 'permanent';

    // Determine error code - preserve AgentError codes, otherwise use INTERNAL_ERROR
    const errorCode = isAgentError(error) ? error.code : AgentErrorCodes.INTERNAL_ERROR;

    // Use appropriate log level based on error type
    const logFn = errorCategory === 'transient' ? logger.warn : logger.error;

    logFn(errorMessage, {
      error,
      code: errorCode,
      errorCategory,
      ...(isAgentError(error) && error.context ? { agentErrorContext: error.context } : {}),
      ...errorContext,
    });
  });
}

// ============================================================================
// TOOL SELECTION
// ============================================================================

/**
 * Get and select available tools for context
 */
export async function getAndSelectTools(
  toolRouter: UnifiedToolRouter,
  context: UnifiedAgentContext,
  userMessage: string,
): Promise<{ allTools: ToolDefinition[]; selectedTools: ToolDefinition[] }> {
  const allTools = await toolRouter.getAvailableTools(context);
  const selectedTools = await selectTools({
    organizationId: context.organizationId,
    userId: context.userId,
    userMessage,
    allTools,
  });
  return { allTools, selectedTools };
}

// ============================================================================
// PLAN GENERATION
// ============================================================================

/**
 * Generate and create a plan from user message.
 *
 * Returns null for recoverable failures (empty response, parse failure).
 * The caller should fall back to direct execution when null is returned.
 */
export async function generateAndCreatePlanFromMessage(
  userMessage: string,
  context: UnifiedAgentContext,
  client: LLMClient,
): Promise<PlanGenerationResult | null> {
  // Generate plan using LLM
  const planPrompt = generatePlanPrompt(userMessage);
  const response = await client.sendMessage({
    system: 'You are a planning assistant that breaks down complex requests into discrete steps.',
    messages: [{ role: 'user', content: planPrompt }],
  });

  // Log LLM usage (fire and forget)
  if (response.usage) {
    safeFireAndForget(
      logLlmUsage({
        organizationId: context.organizationId,
        sessionId: getSessionIdForMode(context),
        provider: client.getProvider(),
        model: client.getModel(),
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        requestType: getValueForMode(context, {
          admin: 'plan_generation',
          workspace: 'workspace_plan_generation',
        }),
      }),
      'Failed to log LLM usage for plan generation',
      { organizationId: context.organizationId },
    );
  }

  // Extract text from response
  const responseText = LLMClient.extractText(response.content);
  if (!responseText) {
    logger.warn('LLM returned empty response for plan generation', {
      code: AgentErrorCodes.LLM_RESPONSE_EMPTY,
      organizationId: context.organizationId,
    });
    return null;
  }

  // Parse the plan from LLM response
  const parsedPlan = parsePlanFromLLM(responseText);
  if (!parsedPlan) {
    logger.warn('Failed to parse plan from LLM response', {
      code: AgentErrorCodes.PLAN_PARSE_FAILED,
      organizationId: context.organizationId,
    });
    return null;
  }

  // Create the plan in database
  const planId = await createPlan({
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    userId: context.userId,
    name: parsedPlan.name,
    description: parsedPlan.description,
    steps: parsedPlan.steps,
  });

  logger.info('Created plan from multi-step request', {
    planId,
    planName: parsedPlan.name,
    stepCount: parsedPlan.steps.length,
    mode: context.mode,
  });

  return {
    planId,
    planName: parsedPlan.name,
    planDescription: parsedPlan.description,
    stepCount: parsedPlan.steps.length,
    model: client.getModel(),
  };
}

// ============================================================================
// PARSING UTILITIES
// ============================================================================

/**
 * Parse tool input JSON safely.
 * Returns empty object if parsing fails.
 *
 * This is a recoverable operation - invalid JSON defaults to empty object
 * to allow tool execution to continue (the tool itself will validate input).
 */
export function parseToolInput(inputJson: string | undefined): unknown {
  if (!inputJson) {
    return {};
  }
  try {
    return JSON.parse(inputJson) as unknown;
  } catch {
    logger.debug('Failed to parse tool input JSON, using empty object', {
      inputLength: inputJson.length,
    });
    return {};
  }
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Create permission denied data from tool execution result
 */
export function createPermissionDeniedData(
  toolName: string,
  deniedReason: string | undefined,
  serverDomain: string | undefined,
  blockingPolicyId: string | undefined,
): PermissionDeniedInfo {
  return {
    toolName,
    reason: deniedReason ?? 'Access denied by policy',
    serverDomain,
    blockingPolicyId,
  };
}
