/**
 * Unified Agent Types
 * Shared types for the unified Sentinel Agent that supports both admin and workspace modes
 */

import type { OrchestratorServices } from './orchestrator-services.js';
import type { RedirectAction } from './tools/index.js';
import type { UnifiedToolRouter } from './unified-tool-router.js';

// Re-export result types for backward compatibility
export type {
  // Deprecated aliases (for backward compatibility)
  ConfirmationData,
  // New canonical names
  ConfirmationInfo,
  ConfirmedToolResult,
  ExtendedToolExecutionResult,
  GeneratedPlanResult,
  MessagePrepareResult,
  PermissionDeniedData,
  PermissionDeniedInfo,
  PlanGenerationResult,
  PlanResult,
  PrepareResult,
  ToolExecutionResult,
  ConfirmedToolResult as ToolExecutionResultForConfirmed,
  ToolResultFull,
  ToolResultProcessed,
} from './result-types.js';

// ============================================================================
// AGENT MODE
// ============================================================================

/**
 * Agent mode determines tool access and behavior
 * - admin: Full access to Sentinel admin tools via ToolRegistry
 * - workspace: Access to workspace MCP tools via WorkspaceToolRouter
 */
export type AgentMode = 'admin' | 'workspace';

// ============================================================================
// UNIFIED CONTEXT TYPES
// ============================================================================

/**
 * Base context fields shared by both modes
 */
interface BaseAgentContext {
  organizationId: string;
  userId: string;
  conversationId: string;
}

/**
 * Admin mode context
 * Uses ToolRegistry for Sentinel admin tools
 */
export interface AdminAgentContext extends BaseAgentContext {
  mode: 'admin';
  sessionId?: string;
  workspaceId?: string; // Optional workspace scope for admin operations
}

/**
 * Workspace mode context
 * Uses WorkspaceToolRouter for MCP tools with policy evaluation
 * Note: Workspace agent never asks for confirmation - policy engine decides ALLOW/DENY
 */
export interface WorkspaceAgentContext extends BaseAgentContext {
  mode: 'workspace';
  workspaceId: string;
  userEmail: string;
  userRoles: string[];
  alwaysAllowTools?: string[];
  skipToolConfirmation?: boolean;
}

/**
 * Discriminated union of all context types
 */
export type UnifiedAgentContext = AdminAgentContext | WorkspaceAgentContext;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if context is admin mode
 */
export function isAdminContext(context: UnifiedAgentContext): context is AdminAgentContext {
  return context.mode === 'admin';
}

/**
 * Type guard to check if context is workspace mode
 */
export function isWorkspaceContext(context: UnifiedAgentContext): context is WorkspaceAgentContext {
  return context.mode === 'workspace';
}

// ============================================================================
// STREAMING EVENT TYPES
// ============================================================================

/**
 * Unified streaming response events
 * Includes both common events and mode-specific events
 */
export type UnifiedStreamingEvent =
  // Common events (both modes)
  | { type: 'conversation_created'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; toolId: string; toolName: string }
  | { type: 'tool_executing'; toolId: string; toolName: string }
  | {
      type: 'tool_result';
      toolId: string;
      toolName: string;
      success: boolean;
      error?: string;
      input?: unknown;
      result?: unknown;
      redirectAction?: RedirectAction;
    }
  | {
      type: 'plan_created';
      planId: string;
      planName: string;
      planDescription: string;
      stepCount: number;
    }
  | { type: 'done'; model?: string }
  | { type: 'error'; error: string }
  // Admin-specific: confirmation for write tools
  | {
      type: 'confirmation';
      confirmationId: string;
      toolId: string;
      toolName: string;
      toolInput: unknown;
      description: string;
    }
  // Workspace-specific: policy denied access
  | {
      type: 'permission_denied';
      toolName: string;
      reason: string;
      serverDomain?: string;
      blockingPolicyId?: string;
    };

// ============================================================================
// TOOL EXECUTION RESULT
// ============================================================================

// Note: Tool execution result types are now defined in result-types.ts
// and re-exported above for backward compatibility.
// See ToolResultFull for the primary type used in tool execution.

/**
 * A tool call being accumulated during streaming
 */
export interface AccumulatingToolCall {
  id: string;
  name: string;
  inputJson: string;
}

// ============================================================================
// ORCHESTRATOR CONFIGURATION
// ============================================================================

/**
 * Configuration for the unified orchestrator (streaming and non-streaming)
 */
export interface UnifiedOrchestratorConfig {
  maxToolRounds?: number;
  includeWriteTools?: boolean;
  /** Custom services for dependency injection (primarily for testing) */
  services?: Partial<OrchestratorServices>;
  /** Custom tool router (primarily for testing) */
  toolRouter?: UnifiedToolRouter;
}

/**
 * @deprecated Use UnifiedOrchestratorConfig instead - same config applies to both modes
 */
export type UnifiedStreamingOrchestratorConfig = UnifiedOrchestratorConfig;

// ============================================================================
// ORCHESTRATOR RESPONSE TYPES
// ============================================================================

/**
 * Pending confirmation for admin mode write operations
 */
export interface PendingConfirmation {
  confirmationId: string;
  toolName: string;
  toolInput: unknown;
  description: string;
}

/**
 * Tool call result
 */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
  error?: string;
  confirmationId?: string;
}

/**
 * Plan creation result when a multi-step request is detected
 */
export interface PlanCreatedResult {
  planCreated: true;
  planId: string;
  planName: string;
  planDescription: string;
  stepCount: number;
  model?: string;
}

/**
 * Standard agent response (not a plan)
 */
export interface AgentResponse {
  text: string;
  toolCalls: ToolCall[];
  complete: boolean;
  stopReason: string | null;
  pendingConfirmations: PendingConfirmation[];
  redirectAction?: RedirectAction;
  model?: string;
  planCreated?: false;
  // Workspace mode specific
  permissionDenied?: {
    toolName: string;
    reason: string;
    serverDomain?: string;
    blockingPolicyId?: string;
  };
}

/**
 * Union type for all possible orchestrator responses
 */
export type UnifiedOrchestratorResponse = AgentResponse | PlanCreatedResult;

/**
 * Type guard for plan created result
 */
export function isPlanCreatedResult(
  response: UnifiedOrchestratorResponse,
): response is PlanCreatedResult {
  return 'planCreated' in response && response.planCreated === true;
}
