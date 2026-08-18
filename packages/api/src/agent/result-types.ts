/**
 * Agent Result Types - Unified Type Hierarchy
 *
 * This module consolidates all Result-related types used in the agent orchestration.
 * The types form a clear hierarchy based on their usage context:
 *
 * **Base Types (from tool execution):**
 * - `ToolResult` - Raw result from tool execution (success/data/error)
 *
 * **Orchestration Types (with context for LLM conversation):**
 * - `ToolResultWithContext` - Adds tool id, name, input for conversation tracking
 * - `ToolResultWithPolicy` - Adds workspace policy decision fields
 * - `ToolResultWithConfirmation` - Adds admin mode confirmation fields
 * - `ToolResultFull` - Complete result with all mode-specific extensions
 *
 * **Specialized Types:**
 * - `ConfirmedToolResult` - Simplified result for confirmed tool execution response
 * - `PlanGenerationResult` - Result from plan creation
 * - `MessagePrepareResult` - Result from message preparation (client, prompts, tools)
 *
 * @module result-types
 */

import type { LLMClient, ToolDefinition } from './llm/index.js';
import type { RedirectAction } from './tools/types.js';

// Re-export base type for convenience
export type { ToolResult } from './tools/types.js';

// ============================================================================
// ORCHESTRATION RESULT TYPES
// ============================================================================

/**
 * Tool result with context for LLM conversation tracking.
 * Extends the base ToolResult with identification and input information
 * needed to build conversation history.
 *
 * Used by: UnifiedToolRouter when executing tools
 */
export interface ToolResultWithContext {
  /** Unique identifier for this tool call (from LLM) */
  id: string;
  /** Tool name that was executed */
  name: string;
  /** Input parameters passed to the tool */
  input: unknown;
  /** Result data on success */
  result?: unknown;
  /** Error message on failure */
  error?: string;
  /** Optional redirect action for post-execution navigation */
  redirectAction?: RedirectAction;
}

/**
 * Tool result with workspace policy decision fields.
 * Extends ToolResultWithContext with policy evaluation information
 * for workspace mode operations.
 *
 * Used by: Workspace mode tool execution when policies are evaluated
 */
export interface ToolResultWithPolicy extends ToolResultWithContext {
  /** Policy decision (ALLOWED/DENIED) for workspace mode */
  decision?: 'ALLOWED' | 'DENIED';
  /** Reason for denial if decision is DENIED */
  deniedReason?: string;
  /** MCP server domain for the tool (workspace mode) */
  serverDomain?: string;
  /** ID of the policy that blocked execution (if denied) */
  blockingPolicyId?: string;
}

/**
 * Tool result with admin mode confirmation fields.
 * Extends ToolResultWithContext with confirmation ID for write operations
 * that require user approval before execution.
 *
 * Used by: Admin mode write tool execution
 */
export interface ToolResultWithConfirmation extends ToolResultWithContext {
  /** Confirmation ID for write tools requiring approval (admin mode) */
  confirmationId?: string;
}

/**
 * Full tool execution result combining all possible fields.
 * This is the complete result type returned by UnifiedToolRouter.executeTool().
 *
 * In practice:
 * - Admin mode: Uses id, name, input, result, error, confirmationId, redirectAction
 * - Workspace mode: Uses id, name, input, result, error, decision, deniedReason, serverDomain, blockingPolicyId
 *
 * Used by: UnifiedToolRouter.executeTool(), OrchestratorCore.executeTool()
 */
export interface ToolResultFull extends ToolResultWithPolicy, ToolResultWithConfirmation {
  // This interface combines all fields from both ToolResultWithPolicy and ToolResultWithConfirmation
  // No additional fields needed - it's the union of both
}

/**
 * Extended tool result with processed mode-specific data.
 * This adds structured data for permission denied (workspace) and
 * confirmation (admin) scenarios after processing by OrchestratorCore.
 *
 * Used by: OrchestratorCore.executeTool() return value
 */
export interface ToolResultProcessed extends ToolResultFull {
  /** Structured permission denied data for workspace mode */
  permissionDenied?: PermissionDeniedInfo;
  /** Structured confirmation data for admin mode */
  confirmation?: ConfirmationInfo;
}

// ============================================================================
// SUPPORTING DATA TYPES
// ============================================================================

/**
 * Permission denied information for workspace mode.
 * Structured data when a tool execution is blocked by policy.
 */
export interface PermissionDeniedInfo {
  /** Tool name that was denied */
  toolName: string;
  /** Reason for the denial */
  reason: string;
  /** MCP server domain (if applicable) */
  serverDomain?: string;
  /** ID of the blocking policy */
  blockingPolicyId?: string;
}

/**
 * Confirmation information for admin mode.
 * Structured data when a write tool requires user confirmation.
 */
export interface ConfirmationInfo {
  /** Unique confirmation ID */
  confirmationId: string;
  /** Tool name requiring confirmation */
  toolName: string;
  /** Human-readable description of the action */
  description: string;
}

// ============================================================================
// SPECIALIZED RESULT TYPES
// ============================================================================

/**
 * Simplified result for confirmed tool execution.
 * Used in the response from executeConfirmedTool() to track
 * which tools were executed and their outcomes.
 *
 * Used by: ConfirmedToolExecutor.executeConfirmedTool() response
 */
export interface ConfirmedToolResult {
  /** Original tool use ID from the LLM request */
  toolUseId: string;
  /** Serialized result string */
  result: string;
  /** Whether execution succeeded */
  success: boolean;
}

/**
 * Result from plan generation.
 * Contains information about the created plan for multi-step operations.
 *
 * Used by: OrchestratorCore.checkPlanGeneration(), generateAndCreatePlanFromMessage()
 */
export interface PlanGenerationResult {
  /** Database ID of the created plan */
  planId: string;
  /** Human-readable plan name */
  planName: string;
  /** Description of what the plan accomplishes */
  planDescription: string;
  /** Number of steps in the plan */
  stepCount: number;
  /** LLM model used for generation (optional) */
  model?: string;
}

/**
 * Result from message preparation.
 * Contains all resources needed to process a user message.
 *
 * Used by: OrchestratorCore.prepareForMessage()
 */
export interface MessagePrepareResult {
  /** Configured LLM client ready to use */
  client: LLMClient;
  /** System prompt with memory context */
  systemPrompt: string;
  /** Tools selected for this message */
  availableTools: ToolDefinition[];
  /** All available tools (before selection) */
  allTools: ToolDefinition[];
}

// ============================================================================
// TYPE ALIASES FOR BACKWARD COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use ToolResultFull instead
 * Alias maintained for backward compatibility
 */
export type ToolExecutionResult = ToolResultFull;

/**
 * @deprecated Use ToolResultProcessed instead
 * Alias maintained for backward compatibility
 */
export type ExtendedToolExecutionResult = ToolResultProcessed;

/**
 * @deprecated Use ConfirmedToolResult instead
 * Alias maintained for backward compatibility
 */
export type ToolExecutionResultForConfirmed = ConfirmedToolResult;

/**
 * @deprecated Use PlanGenerationResult instead
 * Alias maintained for backward compatibility
 */
export type GeneratedPlanResult = PlanGenerationResult;

/**
 * @deprecated Use MessagePrepareResult instead
 * Alias maintained for backward compatibility
 */
export type PrepareResult = MessagePrepareResult;

/**
 * @deprecated Use PlanGenerationResult instead
 * Alias maintained for backward compatibility
 */
export type PlanResult = PlanGenerationResult;

/**
 * @deprecated Use PermissionDeniedInfo instead
 * Alias maintained for backward compatibility
 */
export type PermissionDeniedData = PermissionDeniedInfo;

/**
 * @deprecated Use ConfirmationInfo instead
 * Alias maintained for backward compatibility
 */
export type ConfirmationData = ConfirmationInfo;
