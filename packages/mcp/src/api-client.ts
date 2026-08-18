import { z } from 'zod';
import { decryptCredentials, decryptString } from './crypto.js';
import { logger } from './logger.js';
import { trpc } from './trpc-client.js';
import type {
  AuditLogEntry,
  McpServer,
  PolicyResult,
  UserContext,
  UserMcpConfig,
} from './types.js';
import { mergeDeep } from './utils.js';

type AuditDecision = 'ALLOWED' | 'DENIED';

function isAuditDecision(value: string): value is AuditDecision {
  return value === 'ALLOWED' || value === 'DENIED';
}

const auditLogEntrySchema = z.object({
  timestamp: z.union([z.string(), z.date()]),
  toolName: z.string(),
  decision: z.string(),
  justification: z.string().nullable().optional(),
});

const auditLogListSchema = z.object({
  total: z.number(),
  entries: z.array(auditLogEntrySchema),
});

const policySchema = z.object({
  id: z.string(),
  slug: z.string(),
  matchers: z.array(z.string()),
  toolPatterns: z.array(z.string()),
  effect: z.string(),
  description: z.string(),
  enabled: z.boolean(),
});

const policyListSchema = z.array(policySchema);

type UserAuditLogSummary = z.infer<typeof auditLogEntrySchema>;
type PolicyListItem = z.infer<typeof policySchema>;

function decryptCredentialSource(source: {
  apiKey: string | null;
  credentials: string | null;
  // OAuth fields (optional - only present for user credentials)
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
}): Record<string, unknown> | null {
  const decrypted: Record<string, unknown> = {};
  let hasValues = false;

  if (source.credentials) {
    const parsed = decryptCredentials(source.credentials);
    Object.assign(decrypted, parsed);
    hasValues = Object.keys(parsed).length > 0;
  }

  if (source.apiKey) {
    const apiKey = decryptString(source.apiKey);
    if (decrypted.apiKey === undefined) {
      decrypted.apiKey = apiKey;
    }
    hasValues = true;
  }

  // Handle OAuth tokens
  if (source.accessToken) {
    const accessToken = decryptString(source.accessToken);
    decrypted.accessToken = accessToken;
    hasValues = true;
  }

  if (source.refreshToken) {
    const refreshToken = decryptString(source.refreshToken);
    decrypted.refreshToken = refreshToken;
    hasValues = true;
  }

  if (source.tokenExpiresAt) {
    decrypted.tokenExpiresAt = source.tokenExpiresAt;
    hasValues = true;
  }

  if (!hasValues) {
    return null;
  }

  return decrypted;
}

export async function validateAccessToken(accessToken: string): Promise<UserContext | null> {
  try {
    const result = await trpc.auth.validateToken.mutate({ accessToken });

    if (result.valid) {
      return result;
    }

    return null;
  } catch (error) {
    logger.error('Error validating token:', error);
    return null;
  }
}

export async function evaluatePolicy(
  userId: string,
  agentId: string | undefined,
  toolName: string,
  parameters: Record<string, unknown>,
  sessionId?: string,
  workspaceId?: string,
): Promise<PolicyResult> {
  try {
    const result = await trpc.proxy.evaluatePolicy.mutate({
      userId,
      agentId: agentId || null,
      workspaceId,
      toolName,
      parameters,
      sessionId,
    });

    return {
      decision: result.decision,
      justification: result.justification || undefined,
      policyIds: result.policyIds,
      matchedPolicyIds: 'matchedPolicyIds' in result ? result.matchedPolicyIds : undefined,
      policySnapshot: 'policySnapshot' in result ? result.policySnapshot : undefined,
      userEmail: 'userEmail' in result ? result.userEmail : undefined,
      userRoles: 'userRoles' in result ? result.userRoles : undefined,
      agentName: 'agentName' in result ? result.agentName : undefined,
      approvalRequestId:
        'approvalRequestId' in result && result.approvalRequestId
          ? result.approvalRequestId
          : undefined,
      evaluationTree: 'evaluationTree' in result ? result.evaluationTree : undefined,
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

export async function logAuditEntry(entry: AuditLogEntry): Promise<void> {
  try {
    const decision: AuditDecision = isAuditDecision(entry.decision) ? entry.decision : 'DENIED';
    await trpc.proxy.logAuditEntry.mutate({
      organizationId: entry.organizationId,
      userId: entry.userId || null,
      agentId: entry.agentId || null,
      workspaceId: entry.workspaceId || null,
      toolName: entry.toolName,
      parameters: entry.parameters,
      decision,
      justification: entry.justification || null,
      policyIds: entry.policyIds,
      matchedPolicyIds: entry.matchedPolicyIds,
      policySnapshot: entry.policySnapshot,
      userEmail: entry.userEmail,
      userRoles: entry.userRoles,
      agentName: entry.agentName,
      // Live approval tracking
      approvalRequired: entry.approvalRequired,
      approvalRequestId: entry.approvalRequestId || null,
      approvalStatus: entry.approvalStatus || null,
      approvalDecidedBy: entry.approvalDecidedBy || null,
      approvalDecidedByEmail: entry.approvalDecidedByEmail || null,
      approvalDecidedAt: entry.approvalDecidedAt || null,
      // Evaluation tree for audit visualization
      evaluationTree: entry.evaluationTree || null,
    });
  } catch (error) {
    // Never throw - logging failures should not block operations
    logger.error('Failed to log audit entry:', error);
  }
}

export async function getMcpServer(
  organizationId: string,
  domain: string,
  port?: string,
): Promise<McpServer | null> {
  try {
    const result = await trpc.proxy.getMcpServer.query({
      organizationId,
      domain,
      port: port || null,
    });

    return result;
  } catch (error) {
    logger.error('Error looking up MCP server:', error);
    return null;
  }
}

export async function getUserMcpConfig(
  userId: string,
  mcpServerId: string,
): Promise<UserMcpConfig | null> {
  try {
    const result = await trpc.proxy.getUserCredentials.query({
      userId,
      mcpServerId,
    });

    const orgCredentials = decryptCredentialSource(result.organization);
    // Workspace credentials only have OAuth tokens, need to handle as credential source format
    const workspaceCredentials = result.workspace
      ? decryptCredentialSource({
          apiKey: null,
          credentials: null,
          accessToken: result.workspace.accessToken,
          refreshToken: result.workspace.refreshToken,
          tokenExpiresAt: result.workspace.tokenExpiresAt,
        })
      : null;
    const userCredentials = decryptCredentialSource(result.user);

    if (!orgCredentials && !workspaceCredentials && !userCredentials) {
      return null;
    }

    // Merge in priority order: org < workspace < user (user wins)
    // Chain mergeDeep calls since it only takes 2 arguments
    const orgWithWorkspace = mergeDeep(orgCredentials ?? {}, workspaceCredentials ?? {});
    const merged = mergeDeep(orgWithWorkspace, userCredentials ?? {});
    return { credentials: merged };
  } catch (error) {
    logger.error('Error retrieving user credentials:', error);
    return null;
  }
}

export async function listMcpServers(organizationId: string): Promise<McpServer[]> {
  try {
    const result = await trpc.proxy.listMcpServers.query({
      organizationId,
    });

    return result;
  } catch (error) {
    logger.error('Error listing MCP servers:', error);
    return [];
  }
}

/**
 * Get user's recent audit log entries
 * Used by get_my_audit_log MCP tool
 */
export async function getUserAuditLog(
  _userId: string,
  _organizationId: string,
  options: {
    limit?: number;
    toolName?: string;
  } = {},
): Promise<{ logs: UserAuditLogSummary[]; total: number }> {
  try {
    const result = await trpc.user.auditLogEntries.list.query({
      limit: options.limit || 20,
      toolName: options.toolName,
    });

    // Result has shape { entries: [], total: number }
    const parsed = auditLogListSchema.parse(result);
    return {
      logs: parsed.entries,
      total: parsed.total,
    };
  } catch (error) {
    logger.error('Error fetching user audit log:', error);
    return { logs: [], total: 0 };
  }
}

/**
 * Get policies applicable to the current user
 * Used by get_my_policies MCP tool
 * @param organizationId Organization ID
 * @param workspaceIds Optional array of workspace IDs the user has access to
 */
export async function getUserPolicies(
  organizationId: string,
  workspaceIds?: string[],
): Promise<{
  policies: PolicyListItem[];
  total: number;
}> {
  try {
    // Get policies for the organization, filtered by user's workspace access
    const result = await trpc.proxy.getPolicies.query({
      organizationId,
      workspaceIds: workspaceIds ?? null,
    });

    // Result is an array of policies
    const policies = policyListSchema.parse(result);
    return {
      policies,
      total: policies.length,
    };
  } catch (error) {
    logger.error('Error fetching policies:', error);
    return { policies: [], total: 0 };
  }
}

/**
 * Refresh OAuth token on-demand (called when upstream returns 403)
 * Attempts refresh in order: user -> workspace -> org
 *
 * @returns Object with success status and level (user/workspace/organization)
 * @throws Error if refresh fails or no refresh token available
 */
export async function refreshOAuthToken(
  userId: string,
  mcpServerId: string,
): Promise<{ success: boolean; level: 'user' | 'workspace' | 'organization' }> {
  const result = await trpc.proxy.refreshOAuthToken.mutate({
    userId,
    mcpServerId,
  });

  return result;
}

export interface ApprovalDetails {
  approvalRequired: boolean;
  approvalRequestId?: string;
  approvalStatus?: string;
  approvalDecidedBy?: string;
  approvalDecidedByEmail?: string;
  approvalDecidedAt?: string; // ISO string
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
 * Evaluate sensitive flags for a tool invocation
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
  workspaceId?: string,
): Promise<SensitiveFlagResult> {
  try {
    const result = await trpc.proxy.evaluateSensitiveFlags.mutate({
      organizationId,
      sessionId,
      userId,
      agentId: agentId || null,
      toolName,
      parameters,
      workspaceId: workspaceId ?? null,
    });

    return {
      proceed: result.proceed,
      blockReason: result.blockReason || undefined,
      approvalRequestId: result.approvalRequestId || undefined,
      enhancedAuditData: result.enhancedAuditData || undefined,
      matchedFlagIds: result.matchedFlagIds || undefined,
      alertsSent: result.alertsSent || undefined,
      approvalDetails: result.approvalDetails
        ? {
            approvalRequired: result.approvalDetails.approvalRequired,
            approvalRequestId: result.approvalDetails.approvalRequestId || undefined,
            approvalStatus: result.approvalDetails.approvalStatus || undefined,
            approvalDecidedBy: result.approvalDetails.approvalDecidedBy || undefined,
            approvalDecidedByEmail: result.approvalDetails.approvalDecidedByEmail || undefined,
            approvalDecidedAt: result.approvalDetails.approvalDecidedAt || undefined,
          }
        : undefined,
    };
  } catch (error) {
    logger.error('Error evaluating sensitive flags:', error);
    // Fail closed on evaluation errors - consistent with policy engine security model
    return { proceed: false, blockReason: 'Error evaluating sensitive flags' };
  }
}

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
 * Poll for approval status (works for sensitive flags).
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
    const result = await trpc.proxy.pollApprovalStatus.mutate({
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

/**
 * Poll for approval with configurable timeout.
 * Loops internally until approved, denied, expired, or max timeout reached.
 *
 * @param organizationId - Organization ID
 * @param requestId - Approval request ID
 * @param maxWaitMs - Maximum total wait time (default 5 minutes)
 * @param pollIntervalMs - How long each poll waits (default 30s)
 */
export async function waitForApproval(
  organizationId: string,
  requestId: string,
  maxWaitMs: number = 300000,
  pollIntervalMs: number = 30000,
): Promise<ApprovalPollResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await pollApprovalStatus(organizationId, requestId, pollIntervalMs);

    // If we have a final status, return it
    if (!result.shouldPoll) {
      return result;
    }

    // Still pending - check if we have time for another poll
    const elapsed = Date.now() - startTime;
    const remaining = maxWaitMs - elapsed;

    if (remaining <= 0) {
      // We've exceeded our max wait time
      return {
        status: 'PENDING',
        approved: false,
        shouldPoll: false,
        remainingMs: result.remainingMs,
        expiresAt: result.expiresAt,
      };
    }

    // Brief sleep to avoid tight loop (poll already waited pollIntervalMs)
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Max wait exceeded
  return {
    status: 'PENDING',
    approved: false,
    shouldPoll: false,
  };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export interface SessionResult {
  success: boolean;
  sessionId: string | null;
  isNew: boolean;
}

/**
 * Get or create a session for context tracking
 * Sessions are identified by organizationId + externalSessionId
 * Returns internal session ID for use in context extraction
 */
export async function getOrCreateSessionForTracking(
  organizationId: string,
  externalSessionId: string,
  userId?: string,
  agentId?: string,
  workspaceId?: string,
): Promise<SessionResult> {
  try {
    const result = await trpc.proxy.getOrCreateSession.mutate({
      organizationId,
      externalSessionId,
      userId,
      agentId: agentId || null,
      workspaceId: workspaceId ?? null,
    });

    return {
      success: result.success,
      sessionId: result.sessionId,
      isNew: result.isNew,
    };
  } catch (error) {
    logger.error('Error getting or creating session:', error);
    return {
      success: false,
      sessionId: null,
      isNew: false,
    };
  }
}

/**
 * Extract and store context from a tool invocation
 * Called after successful tool execution (fire-and-forget)
 * Never blocks or throws - failures are logged but don't affect tool execution
 */
/**
 * Increment tool call count for a session
 * Called after each tool invocation for tracking
 * Never blocks or throws - failures are logged but don't affect tool execution
 */
export async function incrementSessionToolCallCount(
  organizationId: string,
  externalSessionId: string,
): Promise<void> {
  try {
    await trpc.proxy.incrementToolCallCount.mutate({
      organizationId,
      externalSessionId,
    });
  } catch (error) {
    // Never throw - tracking should not block tool execution
    logger.error('Error incrementing tool call count:', error);
  }
}

/**
 * Track parameter values for UI suggestions in condition builder
 * Called after successful tool execution (fire-and-forget)
 * Never blocks or throws - failures are logged but don't affect tool execution
 *
 * Values are shared across all tools on the same MCP server by parameter key.
 * This enables suggestions like "page_id" to work across all Notion tools.
 *
 * @param serverId MCP server ID - values are shared across all tools on this server
 * @param toolName Tool name for reference/auditing (optional)
 * @param response Optional response from the tool - used to extract human-readable labels for IDs
 */
export async function trackToolParamValues(
  organizationId: string,
  serverId: string,
  toolName: string,
  parameters: Record<string, unknown>,
  response?: unknown,
): Promise<void> {
  try {
    // Fire-and-forget - don't await
    trpc.proxy.trackParamValues
      .mutate({
        organizationId,
        serverId,
        toolName,
        parameters,
        response,
      })
      .catch((error) => {
        logger.error('Failed to track param values:', error);
      });
  } catch (error) {
    // Never throw - param tracking should not block tool execution
    logger.error('Error initiating param tracking:', error);
  }
}

export interface SessionStatusResult {
  terminated: boolean;
  reason: string | null;
}

/**
 * Check if a session has been terminated by an admin
 * MCP proxy should call this before processing tool requests
 * Returns terminated status - if true, proxy should reject the request
 */
export async function checkSessionStatus(
  organizationId: string,
  externalSessionId: string,
): Promise<SessionStatusResult> {
  try {
    const result = await trpc.proxy.checkSessionStatus.query({
      organizationId,
      externalSessionId,
    });

    return {
      terminated: result.terminated,
      reason: result.reason,
    };
  } catch (error) {
    logger.error('Error checking session status:', error);
    // Fail closed - block requests if we can't verify session status
    return { terminated: true, reason: 'Unable to verify session status' };
  }
}
