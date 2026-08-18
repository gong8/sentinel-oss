/**
 * A2A API Client
 * Provides functions to communicate with the Sentinel API for A2A proxy operations
 */

import type { UserContext } from '@sentinel/shared';
import { decryptCredentials } from './crypto.js';
import { logger } from './logger.js';
import {
  evaluatePolicyMutation,
  evaluateSensitiveFlagsMutation,
  getA2AAgentQuery,
  getA2ACredentialsQuery,
  logA2AAuditEntryMutation,
  pollApprovalStatusMutation,
  refreshA2AAgentCardMutation,
  validateToken,
} from './trpc-client.js';
import type { AgentCard, AuthType, SecurityScheme } from './types.js';
import { parseAuthType, tryParseAgentCard } from './validation.js';

// Re-export UserContext from shared for consumers
export type { UserContext } from '@sentinel/shared';

/**
 * Converts null to undefined for cleaner API responses
 */
function nullToUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

// ============================================================================
// TYPES
// ============================================================================

export interface A2AAgent {
  id: string;
  name: string;
  endpointUrl: string | null;
  agentCardCache: AgentCard | null;
  agentCardFetchedAt: Date | null;
  cardSource: 'URL' | 'MANUAL';
  agentCardUrl: string | null;
  workspaceId: string | null;
}

export interface A2ACredentials {
  authType: AuthType;
  credentials: Record<string, unknown>;
  securityScheme?: SecurityScheme;
}

export interface AuditLogEntry {
  organizationId: string;
  agentId: string;
  skillId?: string;
  userId?: string;
  workspaceId?: string | null;
  request: unknown;
  response?: unknown;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Validate user access token
 * Returns user context if valid, null otherwise
 */
export async function validateAccessToken(accessToken: string): Promise<UserContext | null> {
  try {
    const result = await validateToken({ accessToken });

    if (result.valid) {
      return result;
    }

    return null;
  } catch (error) {
    logger.error('Error validating token:', error);
    return null;
  }
}

/**
 * Get A2A agent details for proxying
 * Returns agent with card cache or null if not found
 */
export async function getA2AAgent(
  organizationId: string,
  agentId: string,
): Promise<A2AAgent | null> {
  try {
    const result = await getA2AAgentQuery({
      organizationId,
      agentId,
    });

    if (!result) {
      return null;
    }

    // Validate cardSource is one of the expected values
    const cardSource =
      result.cardSource === 'URL' || result.cardSource === 'MANUAL' ? result.cardSource : 'MANUAL';

    return {
      id: result.id,
      name: result.name,
      endpointUrl: result.endpointUrl,
      agentCardCache: tryParseAgentCard(result.agentCardCache),
      agentCardFetchedAt: result.agentCardFetchedAt ? new Date(result.agentCardFetchedAt) : null,
      cardSource,
      agentCardUrl: result.agentCardUrl,
      workspaceId: result.workspaceId,
    };
  } catch (error) {
    logger.error('Error getting A2A agent:', error);
    return null;
  }
}

/**
 * Get decrypted A2A credentials for an agent
 * Returns credentials ready for auth header building or null if none
 */
export async function getA2ACredentials(
  organizationId: string,
  agentId: string,
  agentCard?: AgentCard | null,
): Promise<A2ACredentials | null> {
  try {
    const result = await getA2ACredentialsQuery({
      organizationId,
      agentId,
    });

    if (!result) {
      return null;
    }

    // Decrypt credentials
    const decrypted = decryptCredentials(result.credentials);

    // Get security scheme from agent card if available
    let securityScheme: SecurityScheme | undefined;
    if (agentCard?.securitySchemes) {
      // Get the first security scheme (most agents have only one)
      const schemes = Object.values(agentCard.securitySchemes);
      if (schemes.length > 0) {
        securityScheme = schemes[0];
      }
    }

    // Validate authType, defaulting to NONE if invalid
    const authType = parseAuthType(result.authType) ?? 'NONE';

    return {
      authType,
      credentials: decrypted,
      securityScheme,
    };
  } catch (error) {
    logger.error('Error getting A2A credentials:', error);
    return null;
  }
}

/**
 * Log an A2A audit entry
 * Never throws - logging failures should not block operations
 */
export async function logA2AAuditEntry(entry: AuditLogEntry): Promise<void> {
  try {
    await logA2AAuditEntryMutation({
      organizationId: entry.organizationId,
      agentId: entry.agentId,
      skillId: entry.skillId,
      userId: entry.userId,
      workspaceId: entry.workspaceId,
      request: entry.request,
      response: entry.response,
      durationMs: entry.durationMs,
      success: entry.success,
      error: entry.error,
    });
  } catch (error) {
    // Never throw - logging failures should not block operations
    logger.error('Failed to log A2A audit entry:', error);
  }
}

/**
 * Refresh A2A agent card if stale
 * Called when card is older than 1 hour
 */
export async function refreshA2AAgentCard(
  organizationId: string,
  agentId: string,
): Promise<{ success: boolean; card?: AgentCard; error?: string }> {
  try {
    const result = await refreshA2AAgentCardMutation({
      organizationId,
      agentId,
    });

    // Handle both success and error cases from the union type
    if (result.card) {
      const parsedCard = tryParseAgentCard(result.card);
      return {
        success: result.success,
        card: parsedCard ?? undefined,
        error: parsedCard ? undefined : 'Invalid card format',
      };
    }

    return {
      success: result.success,
      card: undefined,
      error: result.error,
    };
  } catch (error) {
    logger.error('Error refreshing A2A agent card:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh card',
    };
  }
}

/**
 * Check if agent card cache is stale (> 1 hour)
 */
export function isCardCacheStale(fetchedAt: Date | null): boolean {
  if (!fetchedAt) {
    return true;
  }

  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  return Date.now() - fetchedAt.getTime() > CACHE_TTL_MS;
}

// ============================================================================
// POLICY EVALUATION
// ============================================================================

export interface PolicyResult {
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  justification?: string;
  policyIds: string[];
  matchedPolicyIds?: string[];
  policySnapshot?: unknown;
  userEmail?: string;
  userRoles?: string[];
  agentName?: string;
  /** Present when decision is PENDING_APPROVAL */
  approvalRequestId?: string;
}

export interface ApprovalDetails {
  approvalRequired: boolean;
  approvalRequestId?: string;
  approvalStatus?: string;
  approvalDecidedBy?: string;
  approvalDecidedByEmail?: string;
  approvalDecidedAt?: string;
}

export interface SensitiveFlagResult {
  proceed: boolean;
  blockReason?: string;
  approvalRequestId?: string;
  enhancedAuditData?: Record<string, unknown>;
  matchedFlagIds?: string[];
  alertsSent?: string[];
  approvalDetails?: ApprovalDetails;
}

/**
 * Evaluate policy for an A2A agent invocation
 * Returns ALLOWED or DENIED with justification
 *
 * Delegation: When delegatedUserId is provided, both the agent AND the delegated
 * user must have permission (AND logic).
 */
export async function evaluatePolicy(
  userId: string,
  agentId: string | undefined,
  toolName: string,
  parameters: Record<string, unknown>,
  a2aContext?: {
    a2aAgentId?: string;
    a2aProvider?: string;
    a2aSkillId?: string;
  },
  /** User ID the agent is acting on behalf of (for delegation) */
  delegatedUserId?: string,
  /** Session ID for approval requests */
  sessionId?: string,
  /** Workspace ID for workspace-scoped policy filtering */
  workspaceId?: string | null,
): Promise<PolicyResult> {
  try {
    const result = await evaluatePolicyMutation({
      userId,
      agentId: agentId || null,
      delegatedUserId: delegatedUserId || null,
      workspaceId: workspaceId || null,
      toolName,
      parameters,
      sessionId,
      a2aContext: a2aContext || null,
    });

    return {
      decision: result.decision,
      justification: nullToUndefined(result.justification),
      policyIds: result.policyIds,
      matchedPolicyIds: result.matchedPolicyIds,
      policySnapshot: result.policySnapshot,
      userEmail: result.userEmail,
      userRoles: result.userRoles,
      agentName: nullToUndefined(result.agentName),
      approvalRequestId: nullToUndefined(result.approvalRequestId),
    };
  } catch (error) {
    logger.error('Error evaluating policy:', error);
    // Fail closed - deny on error
    return {
      decision: 'DENIED',
      justification: 'Policy evaluation failed',
      policyIds: [],
    };
  }
}

/**
 * Evaluate sensitive flags for an A2A agent invocation
 * Called AFTER policy evaluation passes
 * Returns whether to proceed or block, with optional approval request ID
 */
export async function evaluateSensitiveFlags(
  organizationId: string,
  sessionId: string,
  userId: string,
  agentId: string | undefined,
  toolName: string,
  parameters: Record<string, unknown>,
  workspaceId?: string | null,
): Promise<SensitiveFlagResult> {
  try {
    const result = await evaluateSensitiveFlagsMutation({
      organizationId,
      sessionId,
      userId,
      agentId: agentId || null,
      workspaceId: workspaceId || null,
      toolName,
      parameters,
    });

    const details = result.approvalDetails;
    return {
      proceed: result.proceed,
      blockReason: nullToUndefined(result.blockReason),
      approvalRequestId: nullToUndefined(result.approvalRequestId),
      enhancedAuditData: result.enhancedAuditData,
      matchedFlagIds: result.matchedFlagIds,
      alertsSent: result.alertsSent,
      approvalDetails: details
        ? {
            approvalRequired: details.approvalRequired,
            approvalRequestId: nullToUndefined(details.approvalRequestId),
            approvalStatus: nullToUndefined(details.approvalStatus),
            approvalDecidedBy: nullToUndefined(details.approvalDecidedBy),
            approvalDecidedByEmail: nullToUndefined(details.approvalDecidedByEmail),
            approvalDecidedAt: nullToUndefined(details.approvalDecidedAt),
          }
        : undefined,
    };
  } catch (error) {
    logger.error('Error evaluating sensitive flags:', error);
    // Fail closed on evaluation errors
    return { proceed: false, blockReason: 'Error evaluating sensitive flags' };
  }
}

// ============================================================================
// APPROVAL POLLING
// ============================================================================

export interface ApprovalPollResult {
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED' | 'NOT_FOUND';
  approved: boolean;
  /** Whether the caller should continue polling */
  shouldPoll: boolean;
  /** Remaining time in ms before expiration (only for PENDING) */
  remainingMs?: number;
  /** When the approval expires */
  expiresAt?: string;
  details?: {
    decidedBy?: string;
    decidedByEmail?: string;
    decidedAt?: string;
  };
}

/**
 * Poll for approval status (works for both sensitive flags and policy deferrals).
 * Waits up to pollTimeoutMs before returning PENDING if still waiting.
 * Caller should loop until shouldPoll=false.
 *
 * @param organizationId - Organization ID
 * @param requestId - Approval request ID
 * @param pollTimeoutMs - Max time to wait before returning PENDING (default 30s)
 */
export async function pollApprovalStatus(
  organizationId: string,
  requestId: string,
  pollTimeoutMs: number = 30000,
): Promise<ApprovalPollResult> {
  try {
    const result = await pollApprovalStatusMutation({
      organizationId,
      requestId,
      pollTimeoutMs,
    });

    return {
      status: result.status,
      approved: result.approved,
      shouldPoll: result.shouldPoll,
      remainingMs: result.remainingMs,
      expiresAt: result.expiresAt,
      details: result.details,
    };
  } catch (error) {
    logger.error('Error polling approval status:', error);
    return {
      status: 'NOT_FOUND',
      approved: false,
      shouldPoll: false,
    };
  }
}
