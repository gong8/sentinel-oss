/**
 * Analytics Service
 * Provides aggregated analytics data for the dashboard
 */

import { prisma, type Prisma } from '@sentinel/db';

export interface TimeSeriesDataPoint {
  timestamp: Date;
  count: number;
  allowed: number;
  denied: number;
}

export interface TopUser {
  userId: string;
  email: string;
  invocationCount: number;
  allowedCount: number;
  deniedCount: number;
}

export interface TopAgent {
  agentId: string;
  name: string;
  invocationCount: number;
  allowedCount: number;
  deniedCount: number;
}

export interface TopTool {
  toolName: string;
  invocationCount: number;
  allowedCount: number;
  deniedCount: number;
}

export interface PeakUsageHour {
  hour: number; // 0-23
  count: number;
}

export interface AnalyticsSummary {
  totalInvocations: number;
  allowedInvocations: number;
  deniedInvocations: number;
  denialRate: number;
  uniqueUsers: number;
  uniqueAgents: number;
  uniqueTools: number;
}

/**
 * Get time-series data for tool usage
 */
export async function getToolUsageTimeSeries(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  interval: 'hour' | 'day' = 'day',
): Promise<TimeSeriesDataPoint[]> {
  // Using raw SQL for better performance with aggregations
  const results = await prisma.$queryRaw<
    Array<{ bucket: Date; total: bigint; allowed: bigint; denied: bigint }>
  >`
    SELECT 
      DATE_TRUNC(${interval}, timestamp) as bucket,
      COUNT(*) as total,
      SUM(CASE WHEN decision = 'ALLOWED' THEN 1 ELSE 0 END) as allowed,
      SUM(CASE WHEN decision = 'DENIED' THEN 1 ELSE 0 END) as denied
    FROM "AuditLogEntry"
    WHERE "organizationId" = ${organizationId}
      AND timestamp >= ${startDate}
      AND timestamp <= ${endDate}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return results.map((r) => ({
    timestamp: r.bucket,
    count: Number(r.total),
    allowed: Number(r.allowed),
    denied: Number(r.denied),
  }));
}

/**
 * Build where clause with optional time range filter
 */
function buildWhereClause(
  organizationId: string,
  startDate?: Date,
  endDate?: Date,
  additionalFilters?: Prisma.AuditLogEntryWhereInput,
): Prisma.AuditLogEntryWhereInput {
  const whereClause: Prisma.AuditLogEntryWhereInput = {
    organizationId,
    ...additionalFilters,
  };
  if (startDate || endDate) {
    whereClause.timestamp = {};
    if (startDate) whereClause.timestamp.gte = startDate;
    if (endDate) whereClause.timestamp.lte = endDate;
  }
  return whereClause;
}

interface DecisionStats {
  total: number;
  allowed: number;
  denied: number;
}

interface GroupByResult {
  decision: string;
  _count: { id: number };
}

/**
 * Aggregate decision counts from grouped query results.
 * Returns a map of entity ID to decision statistics.
 */
function aggregateDecisionCounts<T extends GroupByResult>(
  results: T[],
  getKey: (result: T) => string | null,
): Map<string, DecisionStats> {
  const stats = new Map<string, DecisionStats>();
  for (const r of results) {
    const key = getKey(r);
    if (key === null) continue;
    const current = stats.get(key) ?? { total: 0, allowed: 0, denied: 0 };
    current.total += r._count.id;
    if (r.decision === 'ALLOWED') current.allowed += r._count.id;
    if (r.decision === 'DENIED') current.denied += r._count.id;
    stats.set(key, current);
  }
  return stats;
}

/**
 * Sort stats by total and return top N entries
 */
function getTopEntries(
  stats: Map<string, DecisionStats>,
  limit: number,
): Array<[string, DecisionStats]> {
  return [...stats.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, limit);
}

/**
 * Get top users by invocation count
 */
export async function getTopUsers(
  organizationId: string,
  limit: number = 10,
  startDate?: Date,
  endDate?: Date,
): Promise<TopUser[]> {
  const whereClause = buildWhereClause(organizationId, startDate, endDate, {
    userId: { not: null },
  });

  const results = await prisma.auditLogEntry.groupBy({
    by: ['userId', 'decision'],
    where: whereClause,
    _count: { id: true },
  });

  const userStats = aggregateDecisionCounts(results, (r) => r.userId);
  const topUsers = getTopEntries(userStats, limit);

  if (topUsers.length === 0) return [];

  const userIds = topUsers.map(([id]) => id);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, deletedAt: null },
    select: { id: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.email]));

  return topUsers.map(([userId, stats]) => ({
    userId,
    email: userMap.get(userId) ?? 'Unknown',
    invocationCount: stats.total,
    allowedCount: stats.allowed,
    deniedCount: stats.denied,
  }));
}

/**
 * Get top agents by invocation count
 */
export async function getTopAgents(
  organizationId: string,
  limit: number = 10,
  startDate?: Date,
  endDate?: Date,
): Promise<TopAgent[]> {
  const whereClause = buildWhereClause(organizationId, startDate, endDate, {
    agentId: { not: null },
  });

  const results = await prisma.auditLogEntry.groupBy({
    by: ['agentId', 'decision'],
    where: whereClause,
    _count: { id: true },
  });

  const agentStats = aggregateDecisionCounts(results, (r) => r.agentId);
  const topAgents = getTopEntries(agentStats, limit);

  if (topAgents.length === 0) return [];

  const agentIds = topAgents.map(([id]) => id);
  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds }, deletedAt: null },
    select: { id: true, name: true },
  });
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));

  return topAgents.map(([agentId, stats]) => ({
    agentId,
    name: agentMap.get(agentId) ?? 'Unknown',
    invocationCount: stats.total,
    allowedCount: stats.allowed,
    deniedCount: stats.denied,
  }));
}

/**
 * Get top tools by invocation count
 */
export async function getTopTools(
  organizationId: string,
  limit: number = 10,
  startDate?: Date,
  endDate?: Date,
): Promise<TopTool[]> {
  const whereClause = buildWhereClause(organizationId, startDate, endDate);

  const results = await prisma.auditLogEntry.groupBy({
    by: ['toolName', 'decision'],
    where: whereClause,
    _count: { id: true },
  });

  const toolStats = aggregateDecisionCounts(results, (r) => r.toolName);
  const topTools = getTopEntries(toolStats, limit);

  return topTools.map(([toolName, stats]) => ({
    toolName,
    invocationCount: stats.total,
    allowedCount: stats.allowed,
    deniedCount: stats.denied,
  }));
}

/**
 * Get peak usage hours (heatmap data)
 */
export async function getPeakUsageHours(
  organizationId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<PeakUsageHour[]> {
  const whereClause = buildWhereClause(organizationId, startDate, endDate);

  // Get all entries and extract hours in application code
  const entries = await prisma.auditLogEntry.findMany({
    where: whereClause,
    select: { timestamp: true },
  });

  // Count by hour
  const hourCounts = new Map<number, number>();
  for (const entry of entries) {
    const hour = new Date(entry.timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  // Fill in all 24 hours with counts (0 for missing hours)
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourCounts.get(hour) ?? 0,
  }));
}

/**
 * Get analytics summary
 */
export async function getAnalyticsSummary(
  organizationId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<AnalyticsSummary> {
  const whereClause = buildWhereClause(organizationId, startDate, endDate);

  const [totalCount, decisionCounts, uniqueUsers, uniqueAgents, uniqueTools] = await Promise.all([
    prisma.auditLogEntry.count({ where: whereClause }),
    prisma.auditLogEntry.groupBy({
      by: ['decision'],
      where: whereClause,
      _count: { id: true },
    }),
    prisma.auditLogEntry.findMany({
      where: { ...whereClause, userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.auditLogEntry.findMany({
      where: { ...whereClause, agentId: { not: null } },
      select: { agentId: true },
      distinct: ['agentId'],
    }),
    prisma.auditLogEntry.findMany({
      where: whereClause,
      select: { toolName: true },
      distinct: ['toolName'],
    }),
  ]);

  const allowedCount = decisionCounts.find((d) => d.decision === 'ALLOWED')?._count.id ?? 0;
  const deniedCount = decisionCounts.find((d) => d.decision === 'DENIED')?._count.id ?? 0;

  return {
    totalInvocations: totalCount,
    allowedInvocations: allowedCount,
    deniedInvocations: deniedCount,
    denialRate: totalCount > 0 ? (deniedCount / totalCount) * 100 : 0,
    uniqueUsers: uniqueUsers.length,
    uniqueAgents: uniqueAgents.length,
    uniqueTools: uniqueTools.length,
  };
}
