/**
 * Agent Error Types
 *
 * Standardized error handling for the agent module. This module provides:
 *
 * - **AgentError**: Base error class for all agent-related errors
 * - **Error codes**: Typed error codes for programmatic handling
 * - **Result type**: Success/error union type for recoverable operations
 *
 * Error Handling Strategy:
 * 1. For recoverable errors: Return Result<T> types (success/error)
 * 2. For unrecoverable errors: Throw AgentError with proper code
 * 3. For fire-and-forget async operations: Use safeAsync() wrapper
 *
 * @module agent/errors
 */

/**
 * Error codes for agent operations.
 * Use this object to reference specific error codes.
 */
export const AgentErrorCodes = {
  // Context errors
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  UNKNOWN_MODE: 'UNKNOWN_MODE',

  // Tool errors
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  TOOL_INPUT_INVALID: 'TOOL_INPUT_INVALID',
  TOOL_INPUT_TOO_LARGE: 'TOOL_INPUT_TOO_LARGE',

  // Conversation errors
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  CONVERSATION_ACCESS_DENIED: 'CONVERSATION_ACCESS_DENIED',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',

  // Confirmation errors
  CONFIRMATION_NOT_FOUND: 'CONFIRMATION_NOT_FOUND',
  CONFIRMATION_EXPIRED: 'CONFIRMATION_EXPIRED',
  CONFIRMATION_ALREADY_PROCESSED: 'CONFIRMATION_ALREADY_PROCESSED',

  // LLM errors
  LLM_REQUEST_FAILED: 'LLM_REQUEST_FAILED',
  LLM_RESPONSE_EMPTY: 'LLM_RESPONSE_EMPTY',
  LLM_PARSE_FAILED: 'LLM_PARSE_FAILED',

  // Plan errors
  PLAN_GENERATION_FAILED: 'PLAN_GENERATION_FAILED',
  PLAN_PARSE_FAILED: 'PLAN_PARSE_FAILED',

  // Memory errors
  MEMORY_RETRIEVAL_FAILED: 'MEMORY_RETRIEVAL_FAILED',

  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',

  // Internal errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Type representing valid agent error codes
 */
export type AgentErrorCode = (typeof AgentErrorCodes)[keyof typeof AgentErrorCodes];

/**
 * Base error class for all agent-related errors.
 *
 * Use this for unrecoverable errors that should halt execution.
 * For recoverable errors, use the Result type instead.
 */
export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly cause?: Error;
  readonly context?: Record<string, unknown>;

  constructor(
    code: AgentErrorCode,
    message: string,
    options?: { cause?: Error; context?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.cause = options?.cause;
    this.context = options?.context;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError);
    }
  }

  /**
   * Create a formatted error message with code and context
   */
  toLogFormat(): { code: AgentErrorCode; message: string; context?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.context && { context: this.context }),
    };
  }
}

// ============================================================================
// RESULT TYPE (for recoverable errors)
// ============================================================================

/**
 * Success result type
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * Error result type
 */
export interface Failure {
  success: false;
  error: string;
  code?: AgentErrorCode;
}

/**
 * Result type for operations that can fail recoverably.
 *
 * Use this instead of throwing errors for operations where:
 * - The caller can meaningfully handle the failure
 * - The failure is expected in normal operation
 * - You want to preserve type safety of error handling
 *
 * @example
 * function parseConfig(input: string): Result<Config> {
 *   try {
 *     return { success: true, data: JSON.parse(input) };
 *   } catch {
 *     return { success: false, error: 'Invalid JSON', code: 'PARSE_FAILED' };
 *   }
 * }
 */
export type Result<T> = Success<T> | Failure;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a success result
 */
export function success<T>(data: T): Success<T> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function failure(error: string, code?: AgentErrorCode): Failure {
  return { success: false, error, code };
}

/**
 * Type guard to check if a result is successful
 */
export function isSuccess<T>(result: Result<T>): result is Success<T> {
  return result.success;
}

/**
 * Type guard to check if a result is a failure
 */
export function isFailure<T>(result: Result<T>): result is Failure {
  return !result.success;
}

/**
 * Unwrap a result, throwing if it's a failure
 */
export function unwrapResult<T>(result: Result<T>): T {
  if (isSuccess(result)) {
    return result.data;
  }
  throw new AgentError(result.code ?? AgentErrorCodes.INTERNAL_ERROR, result.error);
}

// ============================================================================
// SPECIFIC ERROR FACTORIES
// ============================================================================

/**
 * Create an error for conversation not found or access denied
 */
export function conversationNotFoundError(conversationId: string): AgentError {
  return new AgentError(
    AgentErrorCodes.CONVERSATION_ACCESS_DENIED,
    'Conversation not found or access denied',
    { context: { conversationId } },
  );
}

/**
 * Create an error for unknown context mode
 */
export function unknownContextModeError(mode: string): AgentError {
  return new AgentError(AgentErrorCodes.UNKNOWN_MODE, `Unknown context mode: ${mode}`, {
    context: { mode },
  });
}

/**
 * Create an error for tool not found
 */
export function toolNotFoundError(toolName: string): AgentError {
  return new AgentError(AgentErrorCodes.TOOL_NOT_FOUND, `Unknown tool: ${toolName}`, {
    context: { toolName },
  });
}

/**
 * Create an error for invalid workspace context
 */
export function invalidWorkspaceContextError(): AgentError {
  return new AgentError(
    AgentErrorCodes.INVALID_CONTEXT,
    'Expected workspace context for workspace tool execution',
  );
}

/**
 * Create an error for database operation failures
 */
export function databaseError(operation: string, cause?: Error): AgentError {
  return new AgentError(AgentErrorCodes.DATABASE_ERROR, `Database operation failed: ${operation}`, {
    cause,
    context: { operation },
  });
}

/**
 * Check if an error is a transient error that may be retried
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Connection issues, timeouts, and temporary failures
    return (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('temporarily unavailable')
    );
  }
  return false;
}

/**
 * Check if an error is an AgentError
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}
