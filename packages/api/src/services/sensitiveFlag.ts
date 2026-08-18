/**
 * Sensitive Flag Service
 * Handles evaluation and enforcement of sensitive tool flags after policy passes
 */

import {
  ApprovalRequestStatus,
  ApprovalType,
  prisma,
  Prisma,
  SensitiveFlagBehavior,
  WebhookEvent,
} from '@sentinel/db';
import { getToolFriendlyNames } from '../lib/adminActionLabels.js';
import { isPlainObject, toJsonValue } from '../lib/jsonValue.js';
import { logger } from '../lib/logger.js';
import { checkToolPattern } from './policy.js';
import { sendWebhook } from './webhook.js';

// Zod schemas for config validation
import { z } from 'zod';

export const rateLimitConfigSchema = z.object({
  maxPerSession: z.number().positive(),
  windowMinutes: z.number().positive(),
});

export const approvalConfigSchema = z.object({
  allowedApprovers: z.array(z.enum(['session_owner', 'admin'])),
  timeoutSeconds: z.number().positive().default(300),
});

export const alertConfigSchema = z.object({
  webhookEndpointIds: z.array(z.string()),
});

export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;
export type ApprovalConfig = z.infer<typeof approvalConfigSchema>;
export type AlertConfig = z.infer<typeof alertConfigSchema>;

export interface SensitiveFlagEvaluationContext {
  organizationId: string;
  workspaceId?: string | null;
  sessionId: string;
  userId: string;
  agentId?: string | null;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface ApprovalDetails {
  approvalRequired: boolean;
  approvalRequestId?: string;
  approvalStatus?: string; // APPROVED, DENIED, EXPIRED, CANCELLED
  approvalDecidedBy?: string; // User ID
  approvalDecidedByEmail?: string; // Email for display
  approvalDecidedAt?: Date;
}

export interface SensitiveFlagEvaluationResult {
  proceed: boolean;
  blockReason?: string;
  approvalRequestId?: string;
  enhancedAuditData?: Record<string, unknown>;
  matchedFlagIds?: string[];
  alertsSent?: string[];
  // Approval details for audit logging
  approvalDetails?: ApprovalDetails;
  // Polling support for robust approval flow
  /** Whether agent should poll for approval status (true when approval is PENDING) */
  shouldPoll?: boolean;
  /** When the approval request expires (ISO string) */
  approvalExpiresAt?: string;
  /** Remaining time in ms before approval expires */
  approvalRemainingMs?: number;
}

/**
 * Poll approval status result - more detailed than ApprovalWaitResult
 * Includes PENDING status for agents to continue polling
 */
export interface ApprovalPollResult {
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED' | 'NOT_FOUND';
  approved: boolean;
  shouldPoll: boolean;
  remainingMs?: number;
  expiresAt?: string;
  details?: {
    decidedBy?: string;
    decidedByEmail?: string;
    decidedAt?: string;
  };
}

interface ResolvedFlag {
  id: string;
  toolPattern: string;
  behaviors: SensitiveFlagBehavior[];
  rateLimitConfig: RateLimitConfig | null;
  approvalConfig: ApprovalConfig | null;
  alertConfig: AlertConfig | null;
  description: string | null;
  createdAt: Date;
}

/**
 * Check if a flag has a specific behavior enabled
 */
function hasBehavior(flag: ResolvedFlag, behavior: SensitiveFlagBehavior): boolean {
  return flag.behaviors.includes(behavior);
}

/**
 * Check if a flag should send alerts (has ALERT behavior with valid config)
 */
function shouldSendAlert(flag: ResolvedFlag): boolean {
  return hasBehavior(flag, 'ALERT') && flag.alertConfig !== null;
}

/**
 * Build common webhook payload for sensitive flag events
 */
function buildWebhookPayload(
  ctx: SensitiveFlagEvaluationContext,
  flag: ResolvedFlag,
  toolFriendlyName: string | null,
): {
  flagId: string;
  toolPattern: string;
  toolName: string;
  toolFriendlyName: string | null;
  userId: string;
  agentId: string | null | undefined;
  sessionId: string;
} {
  return {
    flagId: flag.id,
    toolPattern: flag.toolPattern,
    toolName: ctx.toolName,
    toolFriendlyName,
    userId: ctx.userId,
    agentId: ctx.agentId,
    sessionId: ctx.sessionId,
  };
}

/**
 * Build approval details from a poll result
 */
function buildApprovalDetails(requestId: string, pollResult: ApprovalPollResult): ApprovalDetails {
  return {
    approvalRequired: true,
    approvalRequestId: requestId,
    approvalStatus: pollResult.status,
    approvalDecidedBy: pollResult.details?.decidedBy,
    approvalDecidedByEmail: pollResult.details?.decidedByEmail,
    approvalDecidedAt: pollResult.details?.decidedAt
      ? new Date(pollResult.details.decidedAt)
      : undefined,
  };
}

/**
 * Main entry point: Evaluate sensitive flags for a tool invocation
 * Called AFTER policy evaluation passes
 */
export async function evaluateSensitiveFlags(
  ctx: SensitiveFlagEvaluationContext,
): Promise<SensitiveFlagEvaluationResult> {
  try {
    // 1. Get all matching flags with agent overrides applied
    const matchingFlags = await getMatchingFlags(
      ctx.organizationId,
      ctx.toolName,
      ctx.agentId,
      ctx.workspaceId,
    );

    if (matchingFlags.length === 0) {
      return { proceed: true };
    }

    const result: SensitiveFlagEvaluationResult = {
      proceed: true,
      matchedFlagIds: matchingFlags.map((f) => f.id),
    };

    // Get friendly tool names for webhook display
    const servers = await prisma.mcpServer.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { name: true, url: true },
    });
    const { toolFriendlyName } = getToolFriendlyNames(ctx.toolName, servers);

    // Process each behavior type across all matching flags
    for (const flag of matchingFlags) {
      const basePayload = buildWebhookPayload(ctx, flag, toolFriendlyName);

      // RATE_LIMIT behavior
      if (hasBehavior(flag, 'RATE_LIMIT') && flag.rateLimitConfig) {
        const rateCheck = await checkRateLimit(ctx.organizationId, ctx.sessionId, flag);

        if (!rateCheck.allowed) {
          if (shouldSendAlert(flag)) {
            await sendWebhook(
              ctx.organizationId,
              WebhookEvent.SENSITIVE_RATE_LIMITED,
              {
                ...basePayload,
                remaining: rateCheck.remaining,
                resetAt: rateCheck.resetAt.toISOString(),
              },
              ctx.workspaceId,
              {
                organizationId: ctx.organizationId,
                sensitiveFlag: toVerboseSensitiveFlag(flag),
                rateLimitUsage: toVerboseRateLimitUsage(rateCheck, flag.rateLimitConfig),
              },
            );
          }

          return {
            proceed: false,
            blockReason: `Rate limit exceeded for tool pattern "${flag.toolPattern}". Remaining: ${rateCheck.remaining}. Resets at: ${rateCheck.resetAt.toISOString()}`,
            matchedFlagIds: result.matchedFlagIds,
          };
        }
      }

      // REQUIRE_APPROVAL behavior
      if (hasBehavior(flag, 'REQUIRE_APPROVAL') && flag.approvalConfig) {
        const { requestId, expiresAt } = await createApprovalRequest(ctx, flag);

        if (shouldSendAlert(flag)) {
          await sendWebhook(
            ctx.organizationId,
            WebhookEvent.SENSITIVE_APPROVAL_NEEDED,
            {
              ...basePayload,
              requestId,
              expiresAt: expiresAt.toISOString(),
            },
            ctx.workspaceId,
            {
              organizationId: ctx.organizationId,
              sensitiveFlag: toVerboseSensitiveFlag(flag),
            },
          );
        }

        // Wait for approval with shorter initial timeout (30s) to avoid HTTP connection timeouts
        // If still pending after initial wait, return with shouldPoll=true for agent to continue polling
        const INITIAL_POLL_TIMEOUT_MS = 30000;
        const approvalResult = await pollApprovalStatus(
          ctx.organizationId,
          requestId,
          INITIAL_POLL_TIMEOUT_MS,
        );

        const approvalDetails = buildApprovalDetails(requestId, approvalResult);

        if (approvalResult.status === 'PENDING') {
          return {
            proceed: false,
            blockReason: `Approval pending for tool pattern "${flag.toolPattern}". Use pollApprovalStatus to continue waiting.`,
            approvalRequestId: requestId,
            matchedFlagIds: result.matchedFlagIds,
            approvalDetails,
            shouldPoll: approvalResult.shouldPoll,
            approvalExpiresAt: approvalResult.expiresAt,
            approvalRemainingMs: approvalResult.remainingMs,
          };
        }

        if (!approvalResult.approved) {
          return {
            proceed: false,
            blockReason: `Approval required but ${approvalResult.status}: ${flag.toolPattern}`,
            approvalRequestId: requestId,
            matchedFlagIds: result.matchedFlagIds,
            approvalDetails,
            shouldPoll: false,
          };
        }

        result.approvalDetails = approvalDetails;
      }

      // Always collect enhanced audit data for matched flags
      // (Enhanced audit is now always-on for all sensitive flags)
      result.enhancedAuditData = {
        ...result.enhancedAuditData,
        sensitiveFlag: {
          id: flag.id,
          toolPattern: flag.toolPattern,
          description: flag.description,
        },
        fullParameters: ctx.parameters,
      };

      // ALERT behavior (for successful invocations)
      if (shouldSendAlert(flag)) {
        const alertIds = await sendWebhook(
          ctx.organizationId,
          WebhookEvent.SENSITIVE_TOOL_INVOKED,
          {
            ...basePayload,
            parameters: sanitizeParameters(ctx.parameters),
          },
          ctx.workspaceId,
          {
            organizationId: ctx.organizationId,
            sensitiveFlag: toVerboseSensitiveFlag(flag),
          },
        );
        result.alertsSent = [...(result.alertsSent || []), ...alertIds];
      }
    }

    // Increment rate limits for all flags that passed
    for (const flag of matchingFlags) {
      if (hasBehavior(flag, 'RATE_LIMIT') && flag.rateLimitConfig) {
        await incrementRateLimit(ctx.organizationId, ctx.sessionId, flag);
      }
    }

    return result;
  } catch (error) {
    logger.error('Error evaluating sensitive flags:', error);
    // Fail closed on evaluation errors - consistent with policy engine security model
    return { proceed: false, blockReason: 'Error evaluating sensitive flags' };
  }
}

/**
 * Get all matching flags with agent overrides applied
 * Filters by workspace: returns org-wide flags (workspaceId: null) + workspace-specific flags
 */
export async function getMatchingFlags(
  organizationId: string,
  toolName: string,
  agentId?: string | null,
  workspaceId?: string | null,
): Promise<ResolvedFlag[]> {
  // Get all enabled flags for the organization, filtered by workspace
  // Returns org-wide flags (workspaceId: null) + workspace-specific flags for the given workspace
  const flags = await prisma.sensitiveToolFlag.findMany({
    where: {
      organizationId,
      enabled: true,
      OR: [
        { workspaceId: null }, // org-wide flags
        ...(workspaceId ? [{ workspaceId }] : []), // workspace-specific if provided
      ],
    },
    include: {
      agentOverrides: agentId
        ? {
            where: { agentId },
          }
        : false,
    },
  });

  const matchingFlags: ResolvedFlag[] = [];

  for (const flag of flags) {
    // Check if tool pattern matches
    if (!checkToolPattern(flag.toolPattern, toolName)) {
      continue;
    }

    // Apply agent override if present
    const override = flag.agentOverrides?.[0];

    // If agent is exempted from this flag, skip it
    if (override?.exempted) {
      continue;
    }

    // Resolve behaviors (override takes precedence if non-empty)
    const behaviors =
      override?.behaviors && override.behaviors.length > 0 ? override.behaviors : flag.behaviors;

    // Parse and validate configs
    const rateLimitConfig = parseConfig(
      override?.rateLimitConfig ?? flag.rateLimitConfig,
      rateLimitConfigSchema,
    );
    const approvalConfig = parseConfig(
      override?.approvalConfig ?? flag.approvalConfig,
      approvalConfigSchema,
    );
    const alertConfig = parseConfig(flag.alertConfig, alertConfigSchema);

    matchingFlags.push({
      id: flag.id,
      toolPattern: flag.toolPattern,
      behaviors,
      rateLimitConfig,
      approvalConfig,
      alertConfig,
      description: flag.description,
      createdAt: flag.createdAt,
    });
  }

  return matchingFlags;
}

/**
 * Safely parse JSON config with Zod schema
 */
function parseConfig<T>(
  config: Prisma.JsonValue | null | undefined,
  schema: z.ZodType<T>,
): T | null {
  if (!config) return null;
  try {
    return schema.parse(config);
  } catch {
    return null;
  }
}

/**
 * Check rate limit for a flagged tool in a session
 */
export async function checkRateLimit(
  organizationId: string,
  sessionId: string,
  flag: ResolvedFlag,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  if (!flag.rateLimitConfig) {
    return { allowed: true, remaining: Infinity, resetAt: new Date() };
  }

  const { maxPerSession, windowMinutes } = flag.rateLimitConfig;
  const now = new Date();

  // Find current window usage
  const usage = await prisma.sensitiveFlagRateLimitUsage.findFirst({
    where: {
      organizationId,
      sessionId,
      toolPattern: flag.toolPattern,
      windowEnd: { gte: now },
    },
  });

  if (!usage) {
    // No active window - allowed
    return {
      allowed: true,
      remaining: maxPerSession,
      resetAt: new Date(now.getTime() + windowMinutes * 60 * 1000),
    };
  }

  const remaining = Math.max(0, maxPerSession - usage.invocationCount);
  const allowed = remaining > 0;

  return {
    allowed,
    remaining,
    resetAt: usage.windowEnd,
  };
}

/**
 * Increment rate limit counter after successful invocation
 */
export async function incrementRateLimit(
  organizationId: string,
  sessionId: string,
  flag: ResolvedFlag,
): Promise<void> {
  if (!flag.rateLimitConfig) return;

  const { windowMinutes } = flag.rateLimitConfig;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

  // Find existing active window first
  const existingWindow = await prisma.sensitiveFlagRateLimitUsage.findFirst({
    where: {
      sessionId,
      toolPattern: flag.toolPattern,
      organizationId,
      windowEnd: { gte: now },
    },
    orderBy: { windowStart: 'desc' },
  });

  if (existingWindow) {
    // Update existing window
    await prisma.sensitiveFlagRateLimitUsage.update({
      where: { id: existingWindow.id },
      data: {
        invocationCount: { increment: 1 },
        lastInvocation: now,
      },
    });
  } else {
    // Create new window
    await prisma.sensitiveFlagRateLimitUsage.create({
      data: {
        organizationId,
        sessionId,
        toolPattern: flag.toolPattern,
        windowStart: now,
        windowEnd,
        invocationCount: 1,
        lastInvocation: now,
      },
    });
  }
}

/**
 * Create an approval request and return its ID
 */
export async function createApprovalRequest(
  ctx: SensitiveFlagEvaluationContext,
  flag: ResolvedFlag,
): Promise<{ requestId: string; expiresAt: Date }> {
  const timeoutSeconds = flag.approvalConfig?.timeoutSeconds || 300;
  const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

  const request = await prisma.sensitiveFlagApprovalRequest.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      agentId: ctx.agentId,
      toolName: ctx.toolName,
      parameters: toJsonValue(sanitizeParameters(ctx.parameters)),
      expiresAt,
    },
  });

  return { requestId: request.id, expiresAt };
}

/**
 * Get approval request status
 */
export async function getApprovalStatus(
  organizationId: string,
  requestId: string,
): Promise<ApprovalRequestStatus | null> {
  const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
    where: { id: requestId, organizationId },
    select: { status: true, expiresAt: true },
  });

  if (!request) return null;

  // Check if expired
  if (request.status === 'PENDING' && request.expiresAt < new Date()) {
    await prisma.sensitiveFlagApprovalRequest.updateMany({
      where: { id: requestId, organizationId },
      data: { status: 'EXPIRED' },
    });
    return 'EXPIRED';
  }

  return request.status;
}

/**
 * Process approval decision (approve or deny)
 * Only updates if request is still PENDING to prevent race conditions.
 * Throws if the request has already been processed or does not exist.
 */
export async function processApprovalDecision(
  organizationId: string,
  requestId: string,
  decision: 'APPROVED' | 'DENIED',
  approverId: string,
  reason?: string,
): Promise<void> {
  const result = await prisma.sensitiveFlagApprovalRequest.updateMany({
    where: {
      id: requestId,
      organizationId,
      status: 'PENDING', // Only update if still PENDING
    },
    data: {
      status: decision,
      approvedBy: approverId,
      approvedAt: new Date(),
      deniedReason: decision === 'DENIED' ? reason : undefined,
    },
  });

  // Check if update succeeded
  if (result.count === 0) {
    throw new Error('Request has already been processed or does not exist');
  }
}

interface ApprovalWaitResult {
  approved: boolean;
  reason?: string;
  details?: {
    status: string;
    decidedBy?: string;
    decidedByEmail?: string;
    decidedAt?: Date;
  };
}

// Exponential backoff intervals for polling (in milliseconds)
const POLL_INTERVALS = [500, 1000, 2000, 3000, 5000] as const;

/**
 * Get the next poll interval using exponential backoff
 */
function getPollInterval(pollIndex: number): number {
  return POLL_INTERVALS[Math.min(pollIndex, POLL_INTERVALS.length - 1)];
}

/**
 * Core function to fetch and evaluate approval request status
 * Handles expiration checks and status mapping
 */
async function fetchApprovalRequestStatus(
  organizationId: string,
  requestId: string,
): Promise<ApprovalPollResult> {
  const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
    where: { id: requestId, organizationId },
    select: {
      status: true,
      expiresAt: true,
      approvedBy: true,
      approvedAt: true,
      approver: { select: { email: true } },
    },
  });

  if (!request) {
    return { status: 'NOT_FOUND', approved: false, shouldPoll: false };
  }

  const now = new Date();

  // Check and update expiration for pending requests
  if (request.status === 'PENDING' && request.expiresAt < now) {
    await prisma.sensitiveFlagApprovalRequest.updateMany({
      where: { id: requestId, organizationId },
      data: { status: 'EXPIRED' },
    });
    return { status: 'EXPIRED', approved: false, shouldPoll: false };
  }

  const details = {
    decidedBy: request.approvedBy ?? undefined,
    decidedByEmail: request.approver?.email ?? undefined,
    decidedAt: request.approvedAt?.toISOString(),
  };

  switch (request.status) {
    case 'APPROVED':
      return { status: 'APPROVED', approved: true, shouldPoll: false, details };
    case 'DENIED':
      return { status: 'DENIED', approved: false, shouldPoll: false, details };
    case 'EXPIRED':
    case 'CANCELLED':
      return { status: request.status, approved: false, shouldPoll: false };
    default: {
      // PENDING
      const remainingMs = Math.max(0, request.expiresAt.getTime() - now.getTime());
      return {
        status: 'PENDING',
        approved: false,
        shouldPoll: remainingMs > 0,
        remainingMs,
        expiresAt: request.expiresAt.toISOString(),
      };
    }
  }
}

/**
 * Poll for approval decision with exponential backoff
 * Returns when approved, denied, expired, or cancelled
 */
export async function waitForApproval(
  organizationId: string,
  requestId: string,
  timeoutMs: number = 300000,
): Promise<ApprovalWaitResult> {
  let pollIndex = 0;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await fetchApprovalRequestStatus(organizationId, requestId);

    if (result.status === 'NOT_FOUND') {
      return { approved: false, reason: 'NOT_FOUND' };
    }

    if (result.status !== 'PENDING') {
      return {
        approved: result.approved,
        reason: result.status,
        details: {
          status: result.status,
          decidedBy: result.details?.decidedBy,
          decidedByEmail: result.details?.decidedByEmail,
          decidedAt: result.details?.decidedAt ? new Date(result.details.decidedAt) : undefined,
        },
      };
    }

    await sleep(getPollInterval(pollIndex++));
  }

  // Mark as expired on timeout
  await prisma.sensitiveFlagApprovalRequest.updateMany({
    where: { id: requestId, organizationId },
    data: { status: 'EXPIRED' },
  });

  return { approved: false, reason: 'TIMEOUT', details: { status: 'EXPIRED' } };
}

/**
 * Poll for approval status with a shorter timeout.
 * Unlike waitForApproval, this returns PENDING if still waiting (doesn't mark as expired).
 * Agents should call this repeatedly until status is final.
 */
export async function pollApprovalStatus(
  organizationId: string,
  requestId: string,
  pollTimeoutMs: number = 30000,
): Promise<ApprovalPollResult> {
  let pollIndex = 0;
  const startTime = Date.now();

  while (Date.now() - startTime < pollTimeoutMs) {
    const result = await fetchApprovalRequestStatus(organizationId, requestId);

    if (result.status !== 'PENDING') {
      return result;
    }

    // If very little time left before expiration, do one more quick poll
    if (result.remainingMs !== undefined && result.remainingMs < 1000) {
      await sleep(100);
      continue;
    }

    await sleep(getPollInterval(pollIndex++));
  }

  // Return current status (may still be PENDING if request hasn't expired)
  return fetchApprovalRequestStatus(organizationId, requestId);
}

/**
 * Get instant approval status without waiting
 * Use this for quick status checks
 */
export async function getApprovalStatusInstant(
  organizationId: string,
  requestId: string,
): Promise<ApprovalPollResult> {
  return fetchApprovalRequestStatus(organizationId, requestId);
}

/**
 * Cancel an approval request
 */
export async function cancelApprovalRequest(
  organizationId: string,
  requestId: string,
): Promise<void> {
  await prisma.sensitiveFlagApprovalRequest.updateMany({
    where: { id: requestId, organizationId },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Get pending approval requests for admin review
 */
export async function getPendingApprovals(
  organizationId: string,
  options?: {
    status?: ApprovalRequestStatus;
    type?: ApprovalType;
    limit?: number;
    offset?: number;
  },
) {
  const now = new Date();
  const filterStatus = options?.status ?? 'PENDING';

  // First, mark any expired PENDING requests as EXPIRED
  if (filterStatus === 'PENDING') {
    await prisma.sensitiveFlagApprovalRequest.updateMany({
      where: {
        organizationId,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });
  }

  const where: Prisma.SensitiveFlagApprovalRequestWhereInput = {
    organizationId,
    status: filterStatus,
    ...(options?.type && { type: options.type }),
  };

  const [total, requests] = await Promise.all([
    prisma.sensitiveFlagApprovalRequest.count({ where }),
    prisma.sensitiveFlagApprovalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        user: {
          select: { email: true },
        },
        agent: {
          select: { name: true },
        },
        approver: {
          select: { email: true },
        },
      },
    }),
  ]);

  return { total, requests };
}

/**
 * Get pending approvals for a specific user's sessions (for self-approval)
 */
export async function getUserPendingApprovals(organizationId: string, userId: string) {
  return prisma.sensitiveFlagApprovalRequest.findMany({
    where: {
      organizationId,
      userId,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * System-wide cleanup function for removing expired rate limit records.
 * Should only be called from trusted cron jobs.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.sensitiveFlagRateLimitUsage.deleteMany({
    where: {
      windowEnd: { lt: new Date() },
    },
  });
  return result.count;
}

/**
 * Sanitize parameters for storage (remove potential secrets)
 */
function sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'secret', 'token', 'key', 'credential', 'auth'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const isSecretKey = sensitiveKeys.some((sk) => key.toLowerCase().includes(sk));
    if (isSecretKey) {
      sanitized[key] = '[REDACTED]';
    } else if (isPlainObject(value)) {
      sanitized[key] = sanitizeParameters(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Transform a ResolvedFlag to the verbose enrichment context shape
 */
function toVerboseSensitiveFlag(flag: ResolvedFlag): {
  id: string;
  toolPattern: string;
  description: string | null;
  behaviors: string[];
  rateLimit: { maxPerSession: number; windowMinutes: number } | null;
  approvalConfig: { allowedApprovers: string[]; timeoutSeconds: number } | null;
  createdAt: Date;
} {
  return {
    id: flag.id,
    toolPattern: flag.toolPattern,
    description: flag.description,
    behaviors: flag.behaviors,
    rateLimit: flag.rateLimitConfig,
    approvalConfig: flag.approvalConfig,
    createdAt: flag.createdAt,
  };
}

/**
 * Create rate limit usage context from rate check result and flag config
 */
function toVerboseRateLimitUsage(
  rateCheck: { allowed: boolean; remaining: number; resetAt: Date },
  rateLimitConfig: RateLimitConfig,
): {
  currentUsage: number;
  remaining: number;
  resetAt: Date;
  windowStart: Date;
} {
  const currentUsage = rateLimitConfig.maxPerSession - rateCheck.remaining;
  const windowStart = new Date(
    rateCheck.resetAt.getTime() - rateLimitConfig.windowMinutes * 60 * 1000,
  );
  return {
    currentUsage,
    remaining: rateCheck.remaining,
    resetAt: rateCheck.resetAt,
    windowStart,
  };
}

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
