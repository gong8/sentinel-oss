/**
 * Agent Confirmation Service
 * Manages confirmations for write operations
 *
 * Error Handling Strategy:
 * - confirmAction/cancelAction: Return Result type for recoverable errors
 * - createConfirmation: Returns confirmation data (database errors propagate)
 * - markExecuted: Void return (fire-and-forget style, errors logged at call site)
 */

import { generateActionDescription } from './config/index.js';
import { AgentErrorCodes, failure, success, type Result } from './errors.js';
import {
  prismaConfirmationRepository,
  type ConfirmationEntity,
  type ConfirmationRequest,
  type IConfirmationRepository,
} from './repositories/index.js';

// Re-export for backwards compatibility
export { generateActionDescription };

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Type guard to check if a value is a non-null object (not an array)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Canonical key order for policy tool inputs.
 * This ensures consistent ordering regardless of how LLMs structure their input.
 * Matches the order used by the UI when creating policies.
 */
const POLICY_KEY_ORDER = [
  'slug',
  'name',
  'effect',
  'matchers',
  'toolPatterns',
  'description',
  'conditions',
  'enabled',
  'id', // For updates
];

/**
 * Canonical key order for condition objects within policies
 */
const CONDITION_KEY_ORDER = ['field', 'operator', 'value'];

/**
 * Recursively sort object keys for consistent JSON stringification.
 * Uses canonical ordering for known types (policies, conditions).
 */
function normalizeForComparison(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }

  if (isRecord(value)) {
    const obj = value;
    const keys = Object.keys(obj);

    // Detect if this looks like a policy input
    const isPolicyInput =
      keys.includes('effect') || keys.includes('toolPatterns') || keys.includes('matchers');

    // Detect if this looks like a condition
    const isCondition = keys.includes('field') && keys.includes('operator') && keys.length <= 4;

    let orderedKeys: string[];
    if (isPolicyInput) {
      // Use canonical policy order, then any remaining keys alphabetically
      orderedKeys = [
        ...POLICY_KEY_ORDER.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !POLICY_KEY_ORDER.includes(k)).sort(),
      ];
    } else if (isCondition) {
      // Use canonical condition order
      orderedKeys = [
        ...CONDITION_KEY_ORDER.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !CONDITION_KEY_ORDER.includes(k)).sort(),
      ];
    } else {
      // Default: sort alphabetically
      orderedKeys = keys.sort();
    }

    const normalized: Record<string, unknown> = {};
    for (const key of orderedKeys) {
      normalized[key] = normalizeForComparison(obj[key]);
    }
    return normalized;
  }

  return value;
}

/**
 * Normalize tool input for storage.
 * Uses canonical key ordering for known types (policies, conditions).
 */
function normalizeToolInput(toolInput: unknown): unknown {
  return normalizeForComparison(toolInput);
}

/**
 * Sort keys alphabetically for comparison.
 * Used to create a deterministic string representation for deduplication.
 */
function sortKeysForComparison(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysForComparison);
  }
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysForComparison(value[key]);
    }
    return sorted;
  }
  return value;
}

// ============================================================================
// TYPES
// ============================================================================

// Re-export types from repository
export type { ConfirmationRequest };

/**
 * Result type for confirmAction - includes the confirmation record on success
 */
export type ConfirmActionResult = Result<{ confirmation: ConfirmationEntity }>;

/**
 * Result type for cancelAction - no data on success, just success flag
 */
export type CancelActionResult = Result<void>;

// ============================================================================
// CREATE & READ OPERATIONS
// ============================================================================

/**
 * Create a pending confirmation for a write operation.
 * Deduplicates: if an identical pending confirmation already exists, returns that instead.
 * Normalizes key ordering to ensure consistent comparison and storage.
 * Uses atomic find-or-create to prevent race conditions (TOCTOU).
 */
export async function createConfirmation(
  params: {
    organizationId: string;
    conversationId?: string;
    workspaceId?: string;
    toolName: string;
    toolInput: unknown;
    description: string;
  },
  repository: IConfirmationRepository = prismaConfirmationRepository,
): Promise<ConfirmationRequest> {
  // Normalize the input for consistent key ordering (for storage)
  const normalizedInput = normalizeToolInput(params.toolInput);
  // Use alphabetical sorting for comparison (matches repository sorting)
  const normalizedInputStr = JSON.stringify(sortKeysForComparison(normalizedInput));

  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);

  // Use atomic find-or-create to prevent race conditions
  const { confirmation } = await repository.findOrCreate(
    {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      toolName: params.toolName,
      toolInput: normalizedInput,
      description: params.description,
      expiresAt,
    },
    normalizedInputStr,
  );

  return {
    confirmationId: confirmation.id,
    toolName: confirmation.toolName,
    toolInput: confirmation.toolInput,
    description: confirmation.description,
    expiresAt: confirmation.expiresAt.toISOString(),
  };
}

/**
 * Get a pending confirmation
 */
export async function getConfirmation(
  confirmationId: string,
  organizationId: string,
  repository: IConfirmationRepository = prismaConfirmationRepository,
): Promise<ConfirmationEntity | null> {
  return repository.findById(confirmationId, organizationId);
}

/**
 * Get pending confirmations for a conversation
 */
export async function getPendingConfirmations(
  conversationId: string,
  organizationId: string,
  repository: IConfirmationRepository = prismaConfirmationRepository,
): Promise<ConfirmationEntity[]> {
  // First, expire any old confirmations
  await repository.expireOldConfirmations(organizationId);

  return repository.findPendingByConversation(conversationId, organizationId);
}

// ============================================================================
// ACTION OPERATIONS (Return Result type)
// ============================================================================

/**
 * Confirm a pending action.
 *
 * Returns a Result type:
 * - Success: { success: true, data: { confirmation } }
 * - Failure: { success: false, error: string, code: AgentErrorCode }
 */
export async function confirmAction(
  confirmationId: string,
  organizationId: string,
  userId: string,
  repository: IConfirmationRepository = prismaConfirmationRepository,
): Promise<ConfirmActionResult> {
  await repository.expireOldConfirmations(organizationId);

  const confirmation = await repository.findPendingById(confirmationId, organizationId);
  if (!confirmation) {
    return failure(
      'Confirmation not found or already processed',
      AgentErrorCodes.CONFIRMATION_NOT_FOUND,
    );
  }

  if (confirmation.expiresAt < new Date()) {
    await repository.expire(confirmationId);
    return failure('Confirmation has expired', AgentErrorCodes.CONFIRMATION_EXPIRED);
  }

  const updated = await repository.confirm(confirmationId, userId);
  return success({ confirmation: updated });
}

/**
 * Cancel a pending action.
 *
 * Returns a Result type:
 * - Success: { success: true, data: undefined }
 * - Failure: { success: false, error: string, code: AgentErrorCode }
 */
export async function cancelAction(
  confirmationId: string,
  organizationId: string,
  repository: IConfirmationRepository = prismaConfirmationRepository,
): Promise<CancelActionResult> {
  const confirmation = await repository.findPendingById(confirmationId, organizationId);
  if (!confirmation) {
    return failure(
      'Confirmation not found or already processed',
      AgentErrorCodes.CONFIRMATION_NOT_FOUND,
    );
  }

  await repository.cancel(confirmationId);
  return success(undefined);
}

/**
 * Mark a confirmation as executed with result.
 *
 * This is typically called fire-and-forget style.
 * Database errors will propagate to the caller.
 */
export async function markExecuted(
  confirmationId: string,
  result: unknown,
  error?: string,
  repository: IConfirmationRepository = prismaConfirmationRepository,
): Promise<void> {
  await repository.markExecuted(confirmationId, result, error);
}
