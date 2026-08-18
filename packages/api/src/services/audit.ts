/**
 * Audit Service
 * Handles logging of all tool invocation attempts
 */

import { AuditDecision, prisma, type Prisma } from '@sentinel/db';
import { z } from 'zod';
import { jsonValueNullableSchema, jsonValueSchema } from '../lib/jsonValue.js';
import { logger } from '../lib/logger.js';

/**
 * Zod schema for audit log input validation
 * Validates all fields before creating an audit log entry
 */
export const auditLogDataSchema = z.object({
  // Required fields
  organizationId: z.string().min(1, 'organizationId is required'),
  toolName: z.string().min(1, 'toolName is required'),
  parameters: jsonValueSchema,
  decision: z.nativeEnum(AuditDecision),
  policyIds: z.array(z.string()),

  // Optional identity fields
  userId: z.string().nullish(),
  agentId: z.string().nullish(),
  workspaceId: z.string().cuid().nullish(), // Workspace context for filtering (null = org-wide)
  userEmail: z.string().nullish(),
  userRoles: z.array(z.string()).optional(),
  agentName: z.string().nullish(),

  // Optional policy context
  justification: z.string().nullish(),
  matchedPolicyIds: z.array(z.string()).optional(),
  policySnapshot: z.union([jsonValueNullableSchema, z.null()]).optional(),

  // MCP server context (for display after server deletion)
  mcpServerName: z.string().nullish(),
  toolNameDisplay: z.string().nullish(),

  // Live approval tracking (for sensitive flags with REQUIRE_APPROVAL)
  approvalRequired: z.boolean().optional(),
  approvalRequestId: z.string().nullish(),
  approvalStatus: z.string().nullish(), // APPROVED, DENIED, EXPIRED, CANCELLED
  approvalDecidedBy: z.string().nullish(),
  approvalDecidedByEmail: z.string().nullish(),
  approvalDecidedAt: z.date().nullish(),

  // Pipeline and Evaluation Tree (for audit visualization)
  pipelineStage: z.string().nullish(),
  interruptedAt: z.string().nullish(),
  interruptionReason: z.string().nullish(),
  trustCheckPassed: z.boolean().nullish(),
  serverTrusted: z.boolean().nullish(),
  policyCheckPassed: z.boolean().nullish(),
  flagCheckPassed: z.boolean().nullish(),
  matchedFlagIds: z.array(z.string()).optional(),
  flagBehaviors: z.array(z.string()).optional(),
  rateLimitHit: z.boolean().nullish(),
  evaluationTree: z.union([jsonValueNullableSchema, z.null()]).optional(),
});

export type AuditLogData = z.infer<typeof auditLogDataSchema>;

/**
 * Creates an audit log entry
 * This should never throw - audit logging failures should be logged but not block operations
 */
export async function logToolInvocation(input: unknown): Promise<void> {
  try {
    // Validate input at the start - fail fast with clear error messages
    const parseResult = auditLogDataSchema.safeParse(input);
    if (!parseResult.success) {
      logger.error('Invalid audit log data:', {
        issues: parseResult.error.issues,
        input: typeof input === 'object' ? JSON.stringify(input) : input,
      });
      return;
    }

    const data = parseResult.data;

    await prisma.auditLogEntry.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        agentId: data.agentId,
        workspaceId: data.workspaceId,
        toolName: data.toolName,
        parameters: data.parameters,
        decision: data.decision,
        justification: data.justification,
        policyIds: data.policyIds,
        matchedPolicyIds: data.matchedPolicyIds ?? data.policyIds,
        policySnapshot: data.policySnapshot ?? undefined,
        userEmail: data.userEmail,
        userRoles: data.userRoles ?? [],
        agentName: data.agentName,
        mcpServerName: data.mcpServerName,
        toolNameDisplay: data.toolNameDisplay,
        // Live approval tracking
        approvalRequired: data.approvalRequired ?? false,
        approvalRequestId: data.approvalRequestId,
        approvalStatus: data.approvalStatus,
        approvalDecidedBy: data.approvalDecidedBy,
        approvalDecidedByEmail: data.approvalDecidedByEmail,
        approvalDecidedAt: data.approvalDecidedAt,
        // Pipeline and Evaluation Tree
        pipelineStage: data.pipelineStage,
        interruptedAt: data.interruptedAt,
        interruptionReason: data.interruptionReason,
        trustCheckPassed: data.trustCheckPassed,
        serverTrusted: data.serverTrusted,
        policyCheckPassed: data.policyCheckPassed,
        flagCheckPassed: data.flagCheckPassed,
        matchedFlagIds: data.matchedFlagIds ?? [],
        flagBehaviors: data.flagBehaviors ?? [],
        rateLimitHit: data.rateLimitHit,
        evaluationTree: data.evaluationTree ?? undefined,
      },
    });
  } catch (error) {
    // Never throw - just log the error
    logger.error('Failed to create audit log entry:', error);
  }
}

export interface AuditLogFilters {
  organizationId: string;
  workspaceId?: string;
  userId?: string;
  agentId?: string;
  userEmail?: string;
  agentName?: string;
  toolName?: string;
  decision?: AuditDecision;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Builds Prisma where clause from audit log filters
 */
function buildWhereClause(filters: AuditLogFilters): Prisma.AuditLogEntryWhereInput {
  const where: Prisma.AuditLogEntryWhereInput = {
    organizationId: filters.organizationId,
  };

  // Workspace filter
  if (filters.workspaceId) {
    where.workspaceId = filters.workspaceId;
  }

  // User filter: prefer userId over userEmail
  if (filters.userId) {
    where.userId = filters.userId;
  } else if (filters.userEmail) {
    where.userEmail = { contains: filters.userEmail, mode: 'insensitive' };
  }

  // Agent filter: prefer agentId over agentName
  if (filters.agentId) {
    where.agentId = filters.agentId;
  } else if (filters.agentName) {
    where.agentName = { contains: filters.agentName, mode: 'insensitive' };
  }

  if (filters.toolName) {
    where.toolName = { contains: filters.toolName };
  }

  if (filters.decision) {
    where.decision = filters.decision;
  }

  if (filters.startDate || filters.endDate) {
    where.timestamp = {
      ...(filters.startDate && { gte: filters.startDate }),
      ...(filters.endDate && { lte: filters.endDate }),
    };
  }

  return where;
}

/**
 * Retrieves audit logs with filtering
 */
export async function getAuditLogs(filters: AuditLogFilters) {
  const where = buildWhereClause(filters);

  const [total, rawEntries] = await Promise.all([
    prisma.auditLogEntry.count({ where }),
    prisma.auditLogEntry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
      include: {
        user: {
          select: {
            email: true,
          },
        },
        agent: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const approvalStatusMap = await fetchApprovalStatuses(filters.organizationId, rawEntries);

  const entries = rawEntries.map((entry) => {
    const updatedStatus = entry.approvalRequestId
      ? approvalStatusMap.get(entry.approvalRequestId)
      : undefined;
    if (updatedStatus) {
      return { ...entry, approvalStatus: updatedStatus };
    }
    return entry;
  });

  return { total, entries };
}

type ApprovalStatusMap = Map<string, string>;

/**
 * Fetches and updates approval statuses for pending requests
 * Marks expired requests in the database and returns a map of request ID to effective status
 */
async function fetchApprovalStatuses(
  organizationId: string,
  entries: Array<{ approvalRequestId: string | null; approvalStatus: string | null }>,
): Promise<ApprovalStatusMap> {
  const pendingRequestIds = entries
    .filter((e) => e.approvalRequestId && e.approvalStatus === 'PENDING')
    .map((e) => e.approvalRequestId)
    .filter((id): id is string => id !== null);

  if (pendingRequestIds.length === 0) {
    return new Map();
  }

  const approvalRequests = await prisma.sensitiveFlagApprovalRequest.findMany({
    where: { id: { in: pendingRequestIds }, organizationId },
    select: { id: true, status: true, expiresAt: true },
  });

  const now = new Date();

  // Mark expired requests in database
  const expiredIds = approvalRequests
    .filter((r) => r.status === 'PENDING' && r.expiresAt < now)
    .map((r) => r.id);

  if (expiredIds.length > 0) {
    await prisma.sensitiveFlagApprovalRequest.updateMany({
      where: { id: { in: expiredIds }, organizationId },
      data: { status: 'EXPIRED' },
    });
  }

  // Build status map with computed effective status
  const statusMap: ApprovalStatusMap = new Map();
  for (const req of approvalRequests) {
    const isExpired = req.status === 'PENDING' && req.expiresAt < now;
    statusMap.set(req.id, isExpired ? 'EXPIRED' : req.status);
  }

  return statusMap;
}
