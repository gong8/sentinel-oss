/**
 * Admin Action Log Service
 * Handles logging of all administrative actions for audit and accountability
 */

import {
  AdminActionSource,
  AdminActionType,
  AdminResourceType,
  prisma,
  type Prisma,
} from '@sentinel/db';
import { logger } from '../lib/logger.js';

// Types for change diff
export interface FieldChange {
  before: unknown;
  after: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

export interface ChangeDiff {
  [field: string]: FieldChange;
}

export interface RelatedResource {
  type: AdminResourceType;
  id: string;
  name?: string;
}

export interface AdminActionLogData {
  organizationId: string;
  adminUserId: string;
  actionType: AdminActionType;
  resourceType: AdminResourceType;
  resourceId?: string | null;
  resourceName?: string | null;
  actionDetails: Prisma.InputJsonValue; // Type-safe JSON value
  beforeSnapshot?: Prisma.InputJsonValue | null; // Snapshot before action
  afterSnapshot?: Prisma.InputJsonValue | null; // Snapshot after action
  ipAddress?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  // MCP Source Identification
  source?: AdminActionSource;
  mcpSessionId?: string | null;
  mcpToolName?: string | null;
  confirmationId?: string | null;
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  // Workspace scoping
  workspaceId?: string | null;
  // Enhanced fields
  requestHeaders?: Record<string, string> | null;
  referrer?: string | null;
  sessionFingerprint?: string | null;
  requestPath?: string | null;
  relatedResources?: RelatedResource[] | null;
  actionStage?: string | null;
  correlationId?: string | null;
}

/**
 * Compute a field-by-field diff between two objects
 * Returns the diff and a human-readable summary
 */
export function computeChangeDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { diff: ChangeDiff; summary: string } {
  const diff: ChangeDiff = {};
  const changes: string[] = [];

  // Fields to ignore in diff (internal/system fields)
  const ignoreFields = new Set([
    'id',
    'createdAt',
    'updatedAt',
    'organizationId',
    'deletedAt',
    'deletedBy',
  ]);

  // Friendly field names for summary
  const fieldLabels: Record<string, string> = {
    effect: 'effect',
    enabled: 'enabled status',
    matchers: 'matchers',
    toolPatterns: 'tool patterns',
    description: 'description',
    conditions: 'conditions',
    conditionMode: 'condition mode',
    conditionExpression: 'condition expression',
    name: 'name',
    email: 'email',
    isAdmin: 'admin status',
    url: 'URL',
    authType: 'auth type',
    trusted: 'trusted status',
    behaviors: 'behaviors',
    toolPattern: 'tool pattern',
    rateLimitConfig: 'rate limit config',
    approvalConfig: 'approval config',
    alertConfig: 'alert config',
  };

  if (!before && !after) {
    return { diff, summary: 'No changes' };
  }

  if (!before && after) {
    // New resource created
    for (const [key, value] of Object.entries(after)) {
      if (ignoreFields.has(key) || value === null || value === undefined) continue;
      diff[key] = { before: undefined, after: value, changeType: 'added' };
    }
    return { diff, summary: 'Created new resource' };
  }

  if (before && !after) {
    // Resource deleted
    for (const [key, value] of Object.entries(before)) {
      if (ignoreFields.has(key) || value === null || value === undefined) continue;
      diff[key] = { before: value, after: undefined, changeType: 'removed' };
    }
    return { diff, summary: 'Deleted resource' };
  }

  // Both exist - compare fields
  const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of allKeys) {
    if (ignoreFields.has(key)) continue;

    const beforeValue = before?.[key];
    const afterValue = after?.[key];

    // Deep compare for objects/arrays
    const beforeStr = JSON.stringify(beforeValue);
    const afterStr = JSON.stringify(afterValue);

    if (beforeStr !== afterStr) {
      if (beforeValue === undefined || beforeValue === null) {
        diff[key] = { before: undefined, after: afterValue, changeType: 'added' };
        const label = fieldLabels[key] || key;
        changes.push(`added ${label}`);
      } else if (afterValue === undefined || afterValue === null) {
        diff[key] = { before: beforeValue, after: undefined, changeType: 'removed' };
        const label = fieldLabels[key] || key;
        changes.push(`removed ${label}`);
      } else {
        diff[key] = { before: beforeValue, after: afterValue, changeType: 'modified' };
        const label = fieldLabels[key] || key;

        // Generate more descriptive change message for known fields
        if (key === 'effect' && typeof beforeValue === 'string' && typeof afterValue === 'string') {
          changes.push(`changed ${label} from ${beforeValue} to ${afterValue}`);
        } else if (key === 'enabled' && typeof afterValue === 'boolean') {
          changes.push(afterValue ? 'enabled' : 'disabled');
        } else if (key === 'isAdmin' && typeof afterValue === 'boolean') {
          changes.push(afterValue ? 'granted admin status' : 'removed admin status');
        } else if (key === 'trusted' && typeof afterValue === 'boolean') {
          changes.push(afterValue ? 'marked as trusted' : 'marked as untrusted');
        } else {
          changes.push(`updated ${label}`);
        }
      }
    }
  }

  const summary = changes.length > 0 ? changes.join(', ') : 'No significant changes';
  // Capitalize first letter
  const capitalizedSummary = summary.charAt(0).toUpperCase() + summary.slice(1);

  return { diff, summary: capitalizedSummary };
}

/**
 * Sanitize HTTP headers for logging (remove sensitive data)
 */
export function sanitizeRequestHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  // Headers to include (whitelist approach for security)
  const allowedHeaders = new Set([
    'user-agent',
    'content-type',
    'accept',
    'accept-language',
    'referer',
    'origin',
    'x-forwarded-for',
    'x-real-ip',
    'x-request-id',
  ]);

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (allowedHeaders.has(lowerKey) && value !== undefined) {
      sanitized[lowerKey] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  return sanitized;
}

/**
 * Generate a session fingerprint from user agent and IP
 * Used for grouping actions from the same session
 */
export function generateSessionFingerprint(userAgent: string | null, ip: string | null): string {
  const combined = `${userAgent ?? 'unknown'}:${ip ?? 'unknown'}`;
  // Simple hash - in production you might want a proper hash function
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Creates an admin action log entry
 *
 * Non-blocking by design: errors are logged but not thrown to avoid blocking admin operations.
 * Returns success status so callers can be aware of failures if needed.
 */
export async function logAdminAction(data: AdminActionLogData): Promise<{ success: boolean }> {
  try {
    const { beforeSnapshot, afterSnapshot, requestHeaders, relatedResources, ...rest } = data;

    // Compute change diff if we have before/after snapshots
    let changeDiff: ChangeDiff | undefined;
    let diffSummary: string | undefined;

    if (beforeSnapshot || afterSnapshot) {
      const beforeObj =
        beforeSnapshot && typeof beforeSnapshot === 'object' && !Array.isArray(beforeSnapshot)
          ? (beforeSnapshot as Record<string, unknown>)
          : null;
      const afterObj =
        afterSnapshot && typeof afterSnapshot === 'object' && !Array.isArray(afterSnapshot)
          ? (afterSnapshot as Record<string, unknown>)
          : null;

      const result = computeChangeDiff(beforeObj, afterObj);
      changeDiff = Object.keys(result.diff).length > 0 ? result.diff : undefined;
      diffSummary = result.summary;
    }

    // Generate session fingerprint if we have user agent and IP
    const sessionFingerprint =
      data.userAgent || data.ipAddress
        ? generateSessionFingerprint(data.userAgent ?? null, data.ipAddress ?? null)
        : undefined;

    await prisma.adminActionLog.create({
      data: {
        ...rest,
        beforeSnapshot: beforeSnapshot ?? undefined,
        afterSnapshot: afterSnapshot ?? undefined,
        requestHeaders: requestHeaders ?? undefined,
        relatedResources: relatedResources
          ? (relatedResources as unknown as Prisma.InputJsonValue)
          : undefined,
        changeDiff: changeDiff ? (changeDiff as unknown as Prisma.InputJsonValue) : undefined,
        diffSummary: diffSummary ?? undefined,
        sessionFingerprint: sessionFingerprint ?? undefined,
      },
    });
    return { success: true };
  } catch (error) {
    logger.error('Failed to create admin action log entry:', error);
    return { success: false };
  }
}

function buildDateRangeFilter(startDate?: Date, endDate?: Date): Prisma.DateTimeFilter | undefined {
  if (!startDate && !endDate) return undefined;
  return {
    ...(startDate && { gte: startDate }),
    ...(endDate && { lte: endDate }),
  };
}

export interface AdminActionLogFilters {
  organizationId: string;
  workspaceId?: string | null;
  adminUserId?: string;
  actionType?: AdminActionType;
  resourceType?: AdminResourceType;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Retrieves admin action logs with filtering
 */
export async function getAdminActionLogs(filters: AdminActionLogFilters) {
  const where: Prisma.AdminActionLogWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.adminUserId && { adminUserId: filters.adminUserId }),
    ...(filters.actionType && { actionType: filters.actionType }),
    ...(filters.resourceType && { resourceType: filters.resourceType }),
    ...(filters.resourceId && { resourceId: filters.resourceId }),
    timestamp: buildDateRangeFilter(filters.startDate, filters.endDate),
    // Workspace filtering: if provided, show org-wide + specific workspace entries
    ...(filters.workspaceId !== undefined && {
      OR: [{ workspaceId: null }, { workspaceId: filters.workspaceId }],
    }),
  };

  const [total, entries] = await Promise.all([
    prisma.adminActionLog.count({ where }),
    prisma.adminActionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return { total, entries };
}

/**
 * Get a detailed admin action log entry with related actions
 */
export async function getAdminActionLogDetail(organizationId: string, logId: string) {
  const entry = await prisma.adminActionLog.findFirst({
    where: {
      id: logId,
      organizationId,
    },
    include: {
      adminUser: {
        select: {
          id: true,
          email: true,
        },
      },
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!entry) {
    return null;
  }

  // Get correlated actions if we have a correlationId
  let correlatedActions: Awaited<ReturnType<typeof prisma.adminActionLog.findMany>> = [];
  if (entry.correlationId) {
    correlatedActions = await prisma.adminActionLog.findMany({
      where: {
        organizationId,
        correlationId: entry.correlationId,
        id: { not: logId },
      },
      orderBy: { timestamp: 'asc' },
      take: 20,
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  // Get resource history if we have a resourceId and resourceType
  let resourceHistory: Awaited<ReturnType<typeof prisma.adminActionLog.findMany>> = [];
  if (entry.resourceId && entry.resourceType) {
    resourceHistory = await prisma.adminActionLog.findMany({
      where: {
        organizationId,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        id: { not: logId },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  return {
    entry,
    correlatedActions,
    resourceHistory,
  };
}

/**
 * Get the history of actions for a specific resource
 */
export async function getResourceHistory(
  organizationId: string,
  resourceType: AdminResourceType,
  resourceId: string,
  limit: number = 20,
) {
  return prisma.adminActionLog.findMany({
    where: {
      organizationId,
      resourceType,
      resourceId,
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
    include: {
      adminUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Get actions related by correlation ID
 */
export async function getCorrelatedActions(organizationId: string, correlationId: string) {
  return prisma.adminActionLog.findMany({
    where: {
      organizationId,
      correlationId,
    },
    orderBy: { timestamp: 'asc' },
    include: {
      adminUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}
