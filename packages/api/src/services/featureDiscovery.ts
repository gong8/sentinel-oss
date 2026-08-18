/**
 * Feature Discovery Service
 * Handles detecting feature usage, resolving settings inheritance, and getting relevant tips
 */

import {
  AdminActionSource,
  AdminActionType,
  DismissType,
  FeatureTipsSetting,
  Prisma,
  prisma,
} from '@sentinel/db';
import { featureDiscovery } from '@sentinel/shared';

const { FEATURE_TIPS } = featureDiscovery;
type FeatureTip = featureDiscovery.FeatureTip;
type FeatureUsageStatus = featureDiscovery.FeatureUsageStatus;

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  data: FeatureUsageStatus;
  expires: number;
}

const featureUsageCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ============================================================================
// CUSTOM CHECK FUNCTIONS
// ============================================================================

/**
 * Check if org has any policy with conditionMode = 'ADVANCED'
 */
async function hasAdvancedConditionPolicy(orgId: string): Promise<boolean> {
  const count = await prisma.policy.count({
    where: {
      organizationId: orgId,
      conditionMode: 'ADVANCED',
      deletedAt: null,
    },
  });
  return count > 0;
}

/**
 * Check if org has a Slack webhook endpoint
 */
async function hasSlackWebhook(orgId: string): Promise<boolean> {
  const count = await prisma.webhookEndpoint.count({
    where: {
      organizationId: orgId,
      type: 'SLACK',
    },
  });
  return count > 0;
}

/**
 * Check if org has an email webhook endpoint
 */
async function hasEmailWebhook(orgId: string): Promise<boolean> {
  const count = await prisma.webhookEndpoint.count({
    where: {
      organizationId: orgId,
      type: 'EMAIL',
    },
  });
  return count > 0;
}

/**
 * Check if org has any policy with time-related condition expressions
 * @param orgId - The organization ID
 * @param userWorkspaceIds - Optional workspace IDs to filter policies (org-wide + user's workspaces)
 */
async function hasTimeCondition(orgId: string, userWorkspaceIds?: string[]): Promise<boolean> {
  // Build workspace filter for policy lookup
  const workspaceFilter = userWorkspaceIds
    ? {
        OR: [
          { workspaceId: null }, // Org-wide policies
          { workspaceId: { in: userWorkspaceIds } }, // User's workspace policies
        ],
      }
    : {};

  // Look for policies with conditionExpression containing time-related functions
  const policies = await prisma.policy.findMany({
    where: {
      organizationId: orgId,
      conditionMode: 'ADVANCED',
      conditionExpression: { not: Prisma.DbNull },
      deletedAt: null,
      ...workspaceFilter,
    },
    select: {
      conditionExpression: true,
    },
  });

  // Check if any policy has time-related expressions
  const timePatterns = ['hour()', 'day_of_week()', 'is_business_hours()', 'time()', 'date('];
  for (const policy of policies) {
    if (policy.conditionExpression && typeof policy.conditionExpression === 'object') {
      const expression = (policy.conditionExpression as { expression?: string }).expression;
      if (
        expression &&
        timePatterns.some((pattern) => expression.toLowerCase().includes(pattern))
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if org has any policy with IP-related condition expressions
 * @param orgId - The organization ID
 * @param userWorkspaceIds - Optional workspace IDs to filter policies (org-wide + user's workspaces)
 */
async function hasIpCondition(orgId: string, userWorkspaceIds?: string[]): Promise<boolean> {
  // Build workspace filter for policy lookup
  const workspaceFilter = userWorkspaceIds
    ? {
        OR: [
          { workspaceId: null }, // Org-wide policies
          { workspaceId: { in: userWorkspaceIds } }, // User's workspace policies
        ],
      }
    : {};

  // Look for policies with conditionExpression containing IP-related functions
  const policies = await prisma.policy.findMany({
    where: {
      organizationId: orgId,
      conditionMode: 'ADVANCED',
      conditionExpression: { not: Prisma.DbNull },
      deletedAt: null,
      ...workspaceFilter,
    },
    select: {
      conditionExpression: true,
    },
  });

  // Check if any policy has IP-related expressions
  const ipPatterns = ['ip_in_cidr(', 'ip_address', 'client_ip', 'source_ip'];
  for (const policy of policies) {
    if (policy.conditionExpression && typeof policy.conditionExpression === 'object') {
      const expression = (policy.conditionExpression as { expression?: string }).expression;
      if (expression && ipPatterns.some((pattern) => expression.toLowerCase().includes(pattern))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if org has any OAuth connection
 */
async function hasOAuthConnection(orgId: string): Promise<boolean> {
  const count = await prisma.orgMcpOAuthToken.count({
    where: {
      organizationId: orgId,
    },
  });
  return count > 0;
}

/**
 * Check if org has admin MCP usage (actions from MCP source)
 */
async function hasAdminMcpUsage(orgId: string): Promise<boolean> {
  const count = await prisma.adminActionLog.count({
    where: {
      organizationId: orgId,
      source: AdminActionSource.MCP_ADMIN,
    },
    take: 1,
  });
  return count > 0;
}

/**
 * Check if org has any sensitive tool flag with approval config
 */
async function hasApprovalWorkflow(orgId: string): Promise<boolean> {
  const count = await prisma.sensitiveToolFlag.count({
    where: {
      organizationId: orgId,
      approvalConfig: { not: Prisma.DbNull },
      enabled: true,
    },
  });
  return count > 0;
}

/**
 * Check if org has any sensitive tool flag with rate limit config
 */
async function hasRateLimitConfig(orgId: string): Promise<boolean> {
  const count = await prisma.sensitiveToolFlag.count({
    where: {
      organizationId: orgId,
      rateLimitConfig: { not: Prisma.DbNull },
      enabled: true,
    },
  });
  return count > 0;
}

/**
 * Check if user has viewed analytics - always returns false
 * (we don't track page views)
 */
async function hasViewedAnalytics(_orgId: string): Promise<boolean> {
  return false;
}

/**
 * Check if org has any policy assertions
 */
async function hasPolicyAssertion(orgId: string): Promise<boolean> {
  const count = await prisma.policyAssertion.count({
    where: {
      organizationId: orgId,
    },
  });
  return count > 0;
}

// Map of custom check function names to implementations
// Functions can optionally accept userWorkspaceIds for workspace-scoped checks
const customCheckFunctions: Record<
  string,
  (orgId: string, userWorkspaceIds?: string[]) => Promise<boolean>
> = {
  hasAdvancedConditionPolicy,
  hasSlackWebhook,
  hasEmailWebhook,
  hasTimeCondition,
  hasIpCondition,
  hasOAuthConnection,
  hasAdminMcpUsage,
  hasApprovalWorkflow,
  hasRateLimitConfig,
  hasViewedAnalytics,
  hasPolicyAssertion,
};

// ============================================================================
// FEATURE DETECTION
// ============================================================================

/**
 * Map action types to feature IDs
 */
const actionTypeToFeatureMap: Partial<Record<AdminActionType, string>> = {
  POLICY_CREATE: 'basic-policy',
  MCP_SERVER_CREATE: 'mcp-server',
  SENSITIVE_FLAG_CREATE: 'sensitive-flags',
  GLOBAL_VAR_NAMESPACE_CREATE: 'global-variables',
  WORKSPACE_CREATE: 'workspaces',
  A2A_CREDENTIAL_SET: 'a2a-protocol',
};

/**
 * Detect which features have been used in an organization
 * @param orgId - The organization ID
 * @param userWorkspaceIds - Optional workspace IDs to filter policy checks (org-wide + user's workspaces)
 */
export async function detectFeatureUsage(
  orgId: string,
  userWorkspaceIds?: string[],
): Promise<FeatureUsageStatus> {
  const status: FeatureUsageStatus = {};

  // Check action-based features
  const actionTypes = Object.keys(actionTypeToFeatureMap) as AdminActionType[];

  const actionCounts = await prisma.adminActionLog.groupBy({
    by: ['actionType'],
    where: {
      organizationId: orgId,
      actionType: { in: actionTypes },
    },
    _count: { id: true },
  });

  // Mark features as used based on action types found
  for (const result of actionCounts) {
    const featureId = actionTypeToFeatureMap[result.actionType];
    if (featureId && result._count.id > 0) {
      status[featureId] = true;
    }
  }

  // Run custom check functions for each tip that uses them
  const customChecks = FEATURE_TIPS.filter((tip) => tip.detectUsage.customCheck);

  await Promise.all(
    customChecks.map(async (tip) => {
      const checkFn = customCheckFunctions[tip.detectUsage.customCheck!];
      if (checkFn) {
        status[tip.id] = await checkFn(orgId, userWorkspaceIds);
      }
    }),
  );

  return status;
}

/**
 * Get cached feature usage status, fetching fresh data on cache miss
 * @param orgId - The organization ID
 * @param userWorkspaceIds - Optional workspace IDs to filter policy checks (org-wide + user's workspaces)
 */
export async function getCachedFeatureUsage(
  orgId: string,
  userWorkspaceIds?: string[],
): Promise<FeatureUsageStatus> {
  // Include workspace IDs in cache key for workspace-scoped caching
  const cacheKey = userWorkspaceIds
    ? `feature-usage:${orgId}:${userWorkspaceIds.sort().join(',')}`
    : `feature-usage:${orgId}`;
  const now = Date.now();

  const cached = featureUsageCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.data;
  }

  const data = await detectFeatureUsage(orgId, userWorkspaceIds);
  featureUsageCache.set(cacheKey, { data, expires: now + CACHE_TTL_MS });

  return data;
}

/**
 * Invalidate cache for an organization (call after feature-related actions)
 */
export function invalidateFeatureUsageCache(orgId: string): void {
  const cacheKey = `feature-usage:${orgId}`;
  featureUsageCache.delete(cacheKey);
}

// ============================================================================
// SETTINGS RESOLUTION
// ============================================================================

/**
 * Resolve whether feature tips are enabled for a user
 * Inheritance chain: org -> workspace -> user
 */
export async function resolveFeatureTipsEnabled(
  orgId: string,
  workspaceId: string | null,
  userId: string,
): Promise<boolean> {
  // 1. Get org settings (root of inheritance chain)
  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { featureTipsEnabled: true },
  });

  // Org default is true if no settings exist
  let effectiveValue = orgSettings?.featureTipsEnabled ?? true;

  // 2. Check workspace settings if workspace is provided
  if (workspaceId) {
    const workspaceSettings = await prisma.workspaceFeatureTipsSettings.findUnique({
      where: { workspaceId },
      select: { setting: true },
    });

    if (workspaceSettings) {
      if (workspaceSettings.setting === FeatureTipsSetting.ON) {
        effectiveValue = true;
      } else if (workspaceSettings.setting === FeatureTipsSetting.OFF) {
        effectiveValue = false;
      }
      // INHERIT keeps parent value
    }

    // 3. Check user settings for this workspace
    const userSettings = await prisma.userFeatureTipsSettings.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
      select: { setting: true },
    });

    if (userSettings) {
      if (userSettings.setting === FeatureTipsSetting.ON) {
        effectiveValue = true;
      } else if (userSettings.setting === FeatureTipsSetting.OFF) {
        effectiveValue = false;
      }
      // INHERIT keeps parent value
    }
  }

  return effectiveValue;
}

// ============================================================================
// TIP RETRIEVAL
// ============================================================================

/**
 * Simple path matching: exact match or wildcard at end
 * e.g., "/admin/policies/*" matches "/admin/policies/123"
 */
export function matchPath(currentPath: string, pattern: string): boolean {
  // Exact match
  if (pattern === currentPath) {
    return true;
  }

  // Wildcard at end
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2); // Remove "/*"
    return currentPath.startsWith(prefix + '/') || currentPath === prefix;
  }

  return false;
}

export interface GetRelevantTipsParams {
  orgId: string;
  workspaceId: string | null;
  userId: string;
  currentPath: string;
  limit?: number;
  userWorkspaceIds?: string[];
}

/**
 * Get relevant tips for a user based on their context
 */
export async function getRelevantTips(params: GetRelevantTipsParams): Promise<FeatureTip[]> {
  const { orgId, workspaceId, userId, currentPath, limit = 3, userWorkspaceIds } = params;

  // Check if tips are enabled for this user
  const tipsEnabled = await resolveFeatureTipsEnabled(orgId, workspaceId, userId);
  if (!tipsEnabled) {
    return [];
  }

  // Get feature usage status (workspace-scoped if userWorkspaceIds provided)
  const usageStatus = await getCachedFeatureUsage(orgId, userWorkspaceIds);

  // Get user dismissals (filter out REMIND_LATER where remindAfter > now)
  const now = new Date();
  const dismissals = await prisma.featureTipDismissal.findMany({
    where: {
      userId,
      organizationId: orgId,
      OR: [
        { dismissType: DismissType.NOT_INTERESTED },
        {
          dismissType: DismissType.REMIND_LATER,
          remindAfter: { gt: now },
        },
      ],
    },
    select: { tipId: true },
  });
  const dismissedTipIds = new Set(dismissals.map((d) => d.tipId));

  // Get org-level disabled tips
  const orgOverrides = await prisma.featureTipOrgOverride.findMany({
    where: {
      organizationId: orgId,
      enabled: false,
    },
    select: { tipId: true },
  });
  const disabledTipIds = new Set(orgOverrides.map((o) => o.tipId));

  // Filter tips
  const eligibleTips = FEATURE_TIPS.filter((tip) => {
    // Skip dismissed tips
    if (dismissedTipIds.has(tip.id)) {
      return false;
    }

    // Skip org-disabled tips
    if (disabledTipIds.has(tip.id)) {
      return false;
    }

    // Skip if feature already used
    if (usageStatus[tip.id]) {
      return false;
    }

    // Check prerequisites are met (all prerequisite features must be used)
    if (tip.prerequisiteFeatures && tip.prerequisiteFeatures.length > 0) {
      const allPrereqsMet = tip.prerequisiteFeatures.every((prereq) => usageStatus[prereq]);
      if (!allPrereqsMet) {
        return false;
      }
    }

    return true;
  });

  // Score tips by page context match
  const scoredTips = eligibleTips.map((tip) => {
    let score = tip.priority;

    // Add bonus for matching current page
    const matchesPage = tip.pageContexts.some((pattern) => matchPath(currentPath, pattern));
    if (matchesPage) {
      score += 50;
    }

    return { tip, score };
  });

  // Sort by score descending and take limit
  scoredTips.sort((a, b) => b.score - a.score);

  return scoredTips.slice(0, limit).map((s) => s.tip);
}

// ============================================================================
// TIP DISMISSAL
// ============================================================================

export interface DismissTipParams {
  userId: string;
  orgId: string;
  tipId: string;
  dismissType: 'NOT_INTERESTED' | 'REMIND_LATER';
}

/**
 * Dismiss a tip for a user
 */
export async function dismissTip(params: DismissTipParams): Promise<void> {
  const { userId, orgId, tipId, dismissType } = params;

  const now = new Date();
  const remindAfter =
    dismissType === 'REMIND_LATER' ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null;

  await prisma.featureTipDismissal.upsert({
    where: {
      userId_organizationId_tipId: { userId, organizationId: orgId, tipId },
    },
    update: {
      dismissType: dismissType as DismissType,
      dismissedAt: now,
      remindAfter,
    },
    create: {
      userId,
      organizationId: orgId,
      tipId,
      dismissType: dismissType as DismissType,
      dismissedAt: now,
      remindAfter,
    },
  });
}
