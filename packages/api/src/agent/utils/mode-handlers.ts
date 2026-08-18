/**
 * Mode-based Handler Pattern
 *
 * Provides a declarative approach to handle mode-specific logic in the agent system.
 * Instead of scattered if/else blocks checking isAdminContext/isWorkspaceContext,
 * this pattern allows mode-specific logic to be defined as handler objects.
 *
 * Benefits:
 * - TypeScript ensures exhaustive handling of all modes
 * - Mode-specific logic is colocated in handler objects
 * - Cleaner code with less boilerplate
 * - Easier to extend when new modes are added
 *
 * @example
 * // Simple synchronous handler
 * const systemPrompt = handleByMode(context, {
 *   admin: (ctx) => ADMIN_PROMPT,
 *   workspace: (ctx) => WORKSPACE_PROMPT,
 * });
 *
 * @example
 * // Async handler
 * const client = await handleByModeAsync(context, {
 *   admin: async (ctx) => LLMClient.forOrganization(ctx.organizationId),
 *   workspace: async (ctx) => WorkspaceLLMClient.create(ctx.workspaceId, ctx.userId),
 * });
 *
 * @module mode-handlers
 */

import {
  isAdminContext,
  isWorkspaceContext,
  type AdminAgentContext,
  type UnifiedAgentContext,
  type WorkspaceAgentContext,
} from '../unified-types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Handler functions for each agent mode
 * TAdmin and TWorkspace can be different types, allowing mode-specific return types
 */
export interface ModeHandlers<TAdmin, TWorkspace> {
  admin: (context: AdminAgentContext) => TAdmin;
  workspace: (context: WorkspaceAgentContext) => TWorkspace;
}

/**
 * Async handler functions for each agent mode
 */
export interface AsyncModeHandlers<TAdmin, TWorkspace> {
  admin: (context: AdminAgentContext) => Promise<TAdmin>;
  workspace: (context: WorkspaceAgentContext) => Promise<TWorkspace>;
}

/**
 * Handler functions where both modes return the same type
 */
export type UniformModeHandlers<T> = ModeHandlers<T, T>;

/**
 * Async handler functions where both modes return the same type
 */
export type UniformAsyncModeHandlers<T> = AsyncModeHandlers<T, T>;

// ============================================================================
// HANDLER FUNCTIONS
// ============================================================================

/**
 * Execute mode-specific handler based on context type
 *
 * Uses TypeScript's discriminated union narrowing to call the appropriate
 * handler with the correctly typed context.
 *
 * @param context - The unified agent context
 * @param handlers - Object containing admin and workspace handlers
 * @returns The result of the appropriate handler
 *
 * @example
 * const requestType = handleByMode(context, {
 *   admin: () => 'agent',
 *   workspace: () => 'workspace_agent',
 * });
 */
export function handleByMode<TAdmin, TWorkspace>(
  context: UnifiedAgentContext,
  handlers: ModeHandlers<TAdmin, TWorkspace>,
): TAdmin | TWorkspace {
  if (isAdminContext(context)) {
    return handlers.admin(context);
  }

  if (isWorkspaceContext(context)) {
    return handlers.workspace(context);
  }

  // TypeScript exhaustiveness check - this ensures all modes are handled
  const _exhaustiveCheck: never = context;
  throw new Error(`Unknown context mode: ${String(_exhaustiveCheck)}`);
}

/**
 * Execute async mode-specific handler based on context type
 *
 * @param context - The unified agent context
 * @param handlers - Object containing async admin and workspace handlers
 * @returns Promise resolving to the result of the appropriate handler
 *
 * @example
 * const client = await handleByModeAsync(context, {
 *   admin: async (ctx) => LLMClient.forOrganization(ctx.organizationId),
 *   workspace: async (ctx) => createWorkspaceClient(ctx.workspaceId, ctx.userId),
 * });
 */
export async function handleByModeAsync<TAdmin, TWorkspace>(
  context: UnifiedAgentContext,
  handlers: AsyncModeHandlers<TAdmin, TWorkspace>,
): Promise<TAdmin | TWorkspace> {
  if (isAdminContext(context)) {
    return handlers.admin(context);
  }

  if (isWorkspaceContext(context)) {
    return handlers.workspace(context);
  }

  // TypeScript exhaustiveness check
  const _exhaustiveCheck: never = context;
  throw new Error(`Unknown context mode: ${String(_exhaustiveCheck)}`);
}

/**
 * Get a mode-specific value without needing context access
 *
 * Simpler version when you just need to map mode to a value
 * and don't need access to the full context.
 *
 * @param context - The unified agent context
 * @param values - Object containing values for each mode
 * @returns The value for the current mode
 *
 * @example
 * const promptType = getValueForMode(context, {
 *   admin: 'admin_prompt',
 *   workspace: 'workspace_prompt',
 * });
 */
export function getValueForMode<TAdmin, TWorkspace>(
  context: UnifiedAgentContext,
  values: { admin: TAdmin; workspace: TWorkspace },
): TAdmin | TWorkspace {
  if (isAdminContext(context)) {
    return values.admin;
  }

  if (isWorkspaceContext(context)) {
    return values.workspace;
  }

  // TypeScript exhaustiveness check
  const _exhaustiveCheck: never = context;
  throw new Error(`Unknown context mode: ${String(_exhaustiveCheck)}`);
}

// ============================================================================
// MODE-SPECIFIC CONDITIONAL EXECUTION
// ============================================================================

/**
 * Execute a handler only in admin mode
 *
 * @param context - The unified agent context
 * @param handler - Handler to execute if context is admin mode
 * @returns Result of handler or undefined if not admin mode
 *
 * @example
 * const confirmation = whenAdmin(context, (ctx) => ({
 *   confirmationId: result.confirmationId,
 *   sessionId: ctx.sessionId,
 * }));
 */
export function whenAdmin<T>(
  context: UnifiedAgentContext,
  handler: (context: AdminAgentContext) => T,
): T | undefined {
  if (isAdminContext(context)) {
    return handler(context);
  }
  return undefined;
}

/**
 * Execute a handler only in workspace mode
 *
 * @param context - The unified agent context
 * @param handler - Handler to execute if context is workspace mode
 * @returns Result of handler or undefined if not workspace mode
 *
 * @example
 * const denied = whenWorkspace(context, (ctx) => ({
 *   reason: 'Policy denied',
 *   workspaceId: ctx.workspaceId,
 * }));
 */
export function whenWorkspace<T>(
  context: UnifiedAgentContext,
  handler: (context: WorkspaceAgentContext) => T,
): T | undefined {
  if (isWorkspaceContext(context)) {
    return handler(context);
  }
  return undefined;
}

/**
 * Execute async handler only in admin mode
 */
export async function whenAdminAsync<T>(
  context: UnifiedAgentContext,
  handler: (context: AdminAgentContext) => Promise<T>,
): Promise<T | undefined> {
  if (isAdminContext(context)) {
    return handler(context);
  }
  return undefined;
}

/**
 * Execute async handler only in workspace mode
 */
export async function whenWorkspaceAsync<T>(
  context: UnifiedAgentContext,
  handler: (context: WorkspaceAgentContext) => Promise<T>,
): Promise<T | undefined> {
  if (isWorkspaceContext(context)) {
    return handler(context);
  }
  return undefined;
}
