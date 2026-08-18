/**
 * Webhook Verbose Enrichment Service
 *
 * Enriches webhook payloads with detailed context when endpoints have verbose=true.
 * This service adds full policy details, user roles, diffs, and other context
 * that helps with monitoring and debugging.
 *
 * Security Note: Sensitive data (tool parameters, access tokens, secrets) is NOT included.
 */

import { prisma, WebhookEvent } from '@sentinel/db';
import type { WebhookPayload } from './webhook.js';
import {
  approvalConfigSchema,
  rateLimitConfigSchema,
  safePrismaJson,
  safeString,
  safeStringArray,
} from './webhookDataSchemas.js';

// ============================================================================
// Shared Types
// ============================================================================

type MatcherType = 'user' | 'role' | 'agent' | 'wildcard' | 'unknown';

interface ResolvedMatcher {
  raw: string;
  type: MatcherType;
  targetName: string | null;
  affectedCount: number;
}

interface ResolvedToolPattern {
  raw: string;
  serverName: string | null;
  isWildcard: boolean;
  matchedToolCount: number;
}

interface RateLimitInfo {
  maxPerSession: number;
  windowMinutes: number;
}

interface ApprovalInfo {
  allowedApprovers: string[];
  timeoutSeconds: number;
}

interface FlagConfigOutput {
  id: string;
  toolPattern: string;
  description: string | null;
  behaviors: string[];
  rateLimit?: RateLimitInfo | null;
  approvalConfig?: ApprovalInfo | null;
  createdAt?: Date;
}

/**
 * Context passed for verbose enrichment
 */
export interface VerboseEnrichmentContext {
  organizationId: string;
  /** For POLICY_UPDATED: the before state */
  beforeSnapshot?: Record<string, unknown>;
  /** Full flag object for sensitive events */
  sensitiveFlag?: {
    id: string;
    toolPattern: string;
    description: string | null;
    behaviors: string[];
    rateLimit: { maxPerSession: number; windowMinutes: number } | null;
    approvalConfig: { allowedApprovers: string[]; timeoutSeconds: number } | null;
    createdAt: Date;
  };
  /** Rate limit usage for the current session */
  rateLimitUsage?: {
    currentUsage: number;
    remaining: number;
    resetAt: Date;
    windowStart: Date;
  };
}

// ============================================================================
// Shared Database Query Helpers
// ============================================================================

/**
 * Fetches user with roles for context enrichment.
 * Returns null if user not found or not in the specified organization.
 */
async function fetchUserWithRoles(
  userId: string,
  organizationId: string,
  includeIsAdmin = false,
): Promise<{
  id: string;
  email: string;
  roles: Array<{ id?: string; name: string; isAdmin?: boolean }>;
} | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, deletedAt: null },
    select: {
      id: true,
      email: true,
      userRoles: {
        include: {
          role: {
            select: {
              id: true,
              name: true,
              isAdmin: true,
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  if (includeIsAdmin) {
    return {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        isAdmin: ur.role.isAdmin,
      })),
    };
  }

  return {
    id: user.id,
    email: user.email,
    roles: user.userRoles.map((ur) => ({ name: ur.role.name })),
  };
}

/**
 * Fetches sensitive tool flag by ID and converts to output format.
 * Returns null if flag not found or not in the specified organization.
 */
async function fetchFlagConfig(
  flagId: string,
  organizationId: string,
  options: {
    includeRateLimit?: boolean;
    includeApproval?: boolean;
    includeCreatedAt?: boolean;
  } = {},
): Promise<FlagConfigOutput | null> {
  const { includeRateLimit = false, includeApproval = false, includeCreatedAt = false } = options;

  const flag = await prisma.sensitiveToolFlag.findFirst({
    where: { id: flagId, organizationId },
    select: {
      id: true,
      toolPattern: true,
      description: true,
      behaviors: true,
      rateLimitConfig: includeRateLimit,
      approvalConfig: includeApproval,
      createdAt: includeCreatedAt,
    },
  });

  if (!flag) return null;

  const result: FlagConfigOutput = {
    id: flag.id,
    toolPattern: flag.toolPattern,
    description: flag.description,
    behaviors: flag.behaviors,
  };

  if (includeRateLimit && 'rateLimitConfig' in flag) {
    const rateLimit = safePrismaJson(flag.rateLimitConfig, rateLimitConfigSchema);
    result.rateLimit = rateLimit
      ? { maxPerSession: rateLimit.maxPerSession ?? 0, windowMinutes: rateLimit.windowMinutes ?? 0 }
      : null;
  }

  if (includeApproval && 'approvalConfig' in flag) {
    const approval = safePrismaJson(flag.approvalConfig, approvalConfigSchema);
    result.approvalConfig = approval
      ? {
          allowedApprovers: approval.allowedApprovers ?? [],
          timeoutSeconds: approval.timeoutSeconds ?? 0,
        }
      : null;
  }

  if (includeCreatedAt && 'createdAt' in flag) {
    result.createdAt = flag.createdAt;
  }

  return result;
}

/**
 * Builds flag config from context or fetches from database.
 */
async function getFlagConfigFromContextOrDb(
  flagId: string | undefined,
  organizationId: string,
  context: VerboseEnrichmentContext | undefined,
  options: {
    includeRateLimit?: boolean;
    includeApproval?: boolean;
    includeCreatedAt?: boolean;
  } = {},
): Promise<FlagConfigOutput | null> {
  if (context?.sensitiveFlag) {
    const sf = context.sensitiveFlag;
    const result: FlagConfigOutput = {
      id: sf.id,
      toolPattern: sf.toolPattern,
      description: sf.description,
      behaviors: sf.behaviors,
    };
    if (options.includeRateLimit) result.rateLimit = sf.rateLimit;
    if (options.includeApproval) result.approvalConfig = sf.approvalConfig;
    if (options.includeCreatedAt) result.createdAt = sf.createdAt;
    return result;
  }

  if (flagId) {
    return fetchFlagConfig(flagId, organizationId, options);
  }

  return null;
}

/**
 * Adds user context to data if userId is present.
 */
async function addUserContext(
  data: Record<string, unknown>,
  organizationId: string,
  outputKey: string,
  includeIsAdmin = false,
): Promise<void> {
  const userId = safeString(data, 'userId');
  if (!userId) return;

  const user = await fetchUserWithRoles(userId, organizationId, includeIsAdmin);
  if (user) {
    data[outputKey] = user;
  }
}

/**
 * Adds resolved matchers and tool patterns to data.
 */
async function addResolvedMatchersAndPatterns(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const matchers = safeStringArray(data, 'matchers');
  const toolPatterns = safeStringArray(data, 'toolPatterns');

  if (matchers && matchers.length > 0) {
    data.resolvedMatchers = await resolveMatchers(matchers, organizationId);
  }

  if (toolPatterns && toolPatterns.length > 0) {
    data.resolvedToolPatterns = await resolveToolPatterns(toolPatterns, organizationId);
  }
}

/**
 * Filters policies by whether their matchers include a specific agent.
 */
function filterPoliciesByAgentMatcher<T extends { matchers: unknown }>(
  policies: T[],
  agentName: string,
  exactMatch = false,
): T[] {
  const agentMatcher = `agent:${agentName}`;

  return policies.filter((p) => {
    if (!Array.isArray(p.matchers)) return false;
    const policyMatchers = p.matchers.filter((m): m is string => typeof m === 'string');

    if (exactMatch) {
      return policyMatchers.includes(agentMatcher);
    }

    return policyMatchers.some(
      (m) =>
        m === agentMatcher ||
        m === '*' ||
        (m.startsWith('agent:') && matchesWildcard(agentName, m.substring(6))),
    );
  });
}

/**
 * Computes array diff: added, removed, unchanged items.
 */
function computeArrayChanges(
  before: string[],
  after: string[],
): { added: string[]; removed: string[]; unchanged: string[] } {
  return {
    added: after.filter((item) => !before.includes(item)),
    removed: before.filter((item) => !after.includes(item)),
    unchanged: after.filter((item) => before.includes(item)),
  };
}

/**
 * Main entry point for verbose enrichment.
 * Modifies the payload in-place to add verbose data.
 */
export async function enrichPayloadIfVerbose(
  payload: WebhookPayload,
  verbose: boolean,
  context?: VerboseEnrichmentContext,
): Promise<WebhookPayload> {
  if (!verbose) {
    return payload;
  }

  const enrichedData = { ...payload.data };

  switch (payload.event) {
    case WebhookEvent.TOOL_INVOCATION_ALLOWED:
    case WebhookEvent.TOOL_INVOCATION_DENIED:
      await enrichToolInvocationPayload(enrichedData, payload.organizationId);
      break;

    case WebhookEvent.SENSITIVE_TOOL_INVOKED:
      await enrichSensitiveToolInvokedPayload(enrichedData, payload.organizationId, context);
      break;

    case WebhookEvent.SENSITIVE_APPROVAL_NEEDED:
      await enrichSensitiveApprovalPayload(enrichedData, payload.organizationId, context);
      break;

    case WebhookEvent.SENSITIVE_RATE_LIMITED:
      await enrichSensitiveRateLimitedPayload(enrichedData, payload.organizationId, context);
      break;

    case WebhookEvent.POLICY_CREATED:
      await enrichPolicyCreatedPayload(enrichedData, payload.organizationId);
      break;

    case WebhookEvent.POLICY_UPDATED:
      await enrichPolicyUpdatedPayload(enrichedData, payload.organizationId, context);
      break;

    case WebhookEvent.POLICY_DELETED:
      await enrichPolicyDeletedPayload(enrichedData, payload.organizationId);
      break;

    case WebhookEvent.AGENT_CREATED:
      await enrichAgentCreatedPayload(enrichedData, payload.organizationId);
      break;

    case WebhookEvent.AGENT_DELETED:
      await enrichAgentDeletedPayload(enrichedData, payload.organizationId);
      break;
  }

  return {
    ...payload,
    data: enrichedData,
  };
}

// ============================================================================
// Tool Invocation Enrichment
// ============================================================================

async function enrichToolInvocationPayload(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const policyIds = safeStringArray(data, 'policyIds');

  if (policyIds && policyIds.length > 0) {
    const policies = await prisma.policy.findMany({
      where: { id: { in: policyIds }, organizationId },
      select: {
        id: true,
        slug: true,
        matchers: true,
        toolPatterns: true,
        effect: true,
        description: true,
        enabled: true,
      },
    });
    data.matchedPolicies = policies;
  }

  await addUserContext(data, organizationId, 'userContext', true);
  await addServerContext(data, organizationId);
}

async function addServerContext(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const toolName = safeString(data, 'toolName');
  if (!toolName) return;

  const parts = toolName.split('::');
  if (parts.length < 2) return;

  const serverUrl = parts[0];
  const server = await prisma.mcpServer.findFirst({
    where: { organizationId, url: serverUrl, deletedAt: null },
    select: { id: true, name: true, url: true, trusted: true },
  });

  if (server) {
    data.serverContext = server;
  }
}

// ============================================================================
// Sensitive Flag Enrichment
// ============================================================================

async function enrichSensitiveToolInvokedPayload(
  data: Record<string, unknown>,
  organizationId: string,
  context?: VerboseEnrichmentContext,
): Promise<void> {
  delete data.parameters;

  const flagId = safeString(data, 'flagId');
  const flagConfig = await getFlagConfigFromContextOrDb(flagId, organizationId, context, {
    includeRateLimit: true,
    includeApproval: true,
    includeCreatedAt: true,
  });
  if (flagConfig) {
    data.flagConfig = flagConfig;
  }

  await addUserContext(data, organizationId, 'userContext', false);
  await addAgentOverride(data, flagId);
}

async function addAgentOverride(
  data: Record<string, unknown>,
  flagId: string | undefined,
): Promise<void> {
  const agentId = safeString(data, 'agentId');
  if (!agentId || !flagId) return;

  const override = await prisma.sensitiveFlagAgentOverride.findFirst({
    where: { sensitiveToolFlagId: flagId, agentId },
    select: { exempted: true, behaviors: true, rateLimitConfig: true },
  });

  if (override) {
    data.agentOverride = {
      exempted: override.exempted,
      customBehaviors: override.behaviors,
      customRateLimit: override.rateLimitConfig,
    };
  }
}

async function enrichSensitiveApprovalPayload(
  data: Record<string, unknown>,
  organizationId: string,
  context?: VerboseEnrichmentContext,
): Promise<void> {
  const flagId = safeString(data, 'flagId');

  const flagConfig = await getFlagConfigFromContextOrDb(flagId, organizationId, context, {
    includeApproval: true,
  });
  if (flagConfig) {
    data.flagConfig = flagConfig;
  }

  await addUserContext(data, organizationId, 'requestingUser', true);
}

async function enrichSensitiveRateLimitedPayload(
  data: Record<string, unknown>,
  organizationId: string,
  context?: VerboseEnrichmentContext,
): Promise<void> {
  const flagId = safeString(data, 'flagId');

  const flagConfig = await getFlagConfigFromContextOrDb(flagId, organizationId, context, {
    includeRateLimit: true,
  });
  if (flagConfig) {
    data.flagConfig = flagConfig;
  }

  if (context?.rateLimitUsage) {
    data.rateLimitContext = {
      currentUsage: context.rateLimitUsage.currentUsage,
      remaining: context.rateLimitUsage.remaining,
      resetAt: context.rateLimitUsage.resetAt.toISOString(),
      windowStart: context.rateLimitUsage.windowStart.toISOString(),
    };
  }

  await addBasicUserContext(data, organizationId);
}

async function addBasicUserContext(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const userId = safeString(data, 'userId');
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, deletedAt: null },
    select: { id: true, email: true },
  });

  if (user) {
    data.userContext = { id: user.id, email: user.email };
  }
}

// ============================================================================
// Policy Enrichment
// ============================================================================

async function enrichPolicyCreatedPayload(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  await addResolvedMatchersAndPatterns(data, organizationId);

  const matchers = safeStringArray(data, 'matchers') ?? [];
  data.impact = await calculatePolicyImpact(matchers, organizationId);
}

async function enrichPolicyUpdatedPayload(
  data: Record<string, unknown>,
  organizationId: string,
  context?: VerboseEnrichmentContext,
): Promise<void> {
  if (context?.beforeSnapshot) {
    addPolicyDiff(data, context.beforeSnapshot);
  }

  await addResolvedMatchersAndPatterns(data, organizationId);
}

function addPolicyDiff(data: Record<string, unknown>, before: Record<string, unknown>): void {
  const policyFields = ['slug', 'matchers', 'toolPatterns', 'effect', 'description', 'enabled'];
  const extractFields = (source: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      policyFields.map((f) => [f, source[f === 'slug' ? 'policySlug' : f] ?? source[f]]),
    );

  data.diff = {
    before: extractFields(before),
    after: extractFields(data),
    changedFields:
      typeof data.changes === 'object' && data.changes !== null ? Object.keys(data.changes) : [],
  };

  const beforeMatchers = safeStringArray(before, 'matchers') ?? [];
  const afterMatchers = safeStringArray(data, 'matchers') ?? [];
  data.matcherChanges = computeArrayChanges(beforeMatchers, afterMatchers);

  const beforePatterns = safeStringArray(before, 'toolPatterns') ?? [];
  const afterPatterns = safeStringArray(data, 'toolPatterns') ?? [];
  data.toolPatternChanges = computeArrayChanges(beforePatterns, afterPatterns);
}

async function enrichPolicyDeletedPayload(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  data.deletedPolicySnapshot = {
    slug: data.policySlug,
    matchers: data.matchers,
    toolPatterns: data.toolPatterns,
    effect: data.effect,
    description: data.description,
  };

  await addResolvedMatchersAndPatterns(data, organizationId);

  const matchers = safeStringArray(data, 'matchers') ?? [];
  data.impact = await calculatePolicyImpact(matchers, organizationId);
}

// ============================================================================
// Agent Enrichment
// ============================================================================

async function enrichAgentCreatedPayload(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const agentName = safeString(data, 'agentName');
  if (!agentName) return;

  // Get agent's workspaceId from the payload data for workspace-scoped policy filtering
  const workspaceId = safeString(data, 'workspaceId');

  const policies = await fetchOrgPolicies(organizationId, {
    enabledOnly: true,
    includeToolPatterns: true,
    workspaceId: workspaceId ?? null, // null for org-wide agents
  });
  const applicablePolicies = filterPoliciesByAgentMatcher(policies, agentName, false);

  data.applicablePolicies = applicablePolicies;

  const agentCount = await prisma.agent.count({
    where: { organizationId, deletedAt: null },
  });
  data.organizationContext = { totalAgents: agentCount };
}

async function enrichAgentDeletedPayload(
  data: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const agentName = safeString(data, 'agentName');
  if (!agentName) return;

  // Get agent's workspaceId from the payload data for workspace-scoped policy filtering
  const workspaceId = safeString(data, 'workspaceId');

  const policies = await fetchOrgPolicies(organizationId, {
    enabledOnly: false,
    includeToolPatterns: false,
    workspaceId: workspaceId ?? null, // null for org-wide agents
  });
  const affectedPolicies = filterPoliciesByAgentMatcher(policies, agentName, true);

  const agentMatcher = `agent:${agentName}`;
  data.affectedPolicies = affectedPolicies.map((p) => ({
    id: p.id,
    slug: p.slug,
    effect: p.effect,
    matcherType: agentMatcher,
  }));

  const agentCount = await prisma.agent.count({
    where: { organizationId, deletedAt: null },
  });
  data.organizationContext = { remainingAgents: agentCount };
}

async function fetchOrgPolicies(
  organizationId: string,
  options: { enabledOnly: boolean; includeToolPatterns: boolean; workspaceId?: string | null },
): Promise<
  Array<{ id: string; slug: string; matchers: unknown; effect: string; toolPatterns?: unknown }>
> {
  // Build workspace filter for policy lookup
  // If workspaceId is provided, filter to org-wide policies + that workspace's policies
  // If workspaceId is null (org-wide agent), include all org-wide policies
  // If workspaceId is undefined, include all policies (backwards compatibility)
  const workspaceFilter =
    options.workspaceId !== undefined
      ? options.workspaceId === null
        ? { workspaceId: null } // Org-wide only
        : {
            OR: [
              { workspaceId: null }, // Org-wide policies
              { workspaceId: options.workspaceId }, // Workspace-scoped policies
            ],
          }
      : {};

  return prisma.policy.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(options.enabledOnly ? { enabled: true } : {}),
      ...workspaceFilter,
    },
    select: {
      id: true,
      slug: true,
      matchers: true,
      effect: true,
      toolPatterns: options.includeToolPatterns,
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function resolveMatchers(
  matchers: string[],
  organizationId: string,
): Promise<ResolvedMatcher[]> {
  const results: ResolvedMatcher[] = [];

  for (const matcher of matchers) {
    results.push(await resolveSingleMatcher(matcher, organizationId));
  }

  return results;
}

async function resolveSingleMatcher(
  matcher: string,
  organizationId: string,
): Promise<ResolvedMatcher> {
  if (matcher === '*') {
    const userCount = await prisma.user.count({ where: { organizationId, deletedAt: null } });
    return { raw: matcher, type: 'wildcard', targetName: 'All users', affectedCount: userCount };
  }

  if (matcher.startsWith('role:')) {
    const roleName = matcher.substring(5);
    const role = await prisma.role.findFirst({
      where: { organizationId, name: roleName, deletedAt: null },
      include: { userRoles: true },
    });
    return {
      raw: matcher,
      type: 'role',
      targetName: role?.name ?? roleName,
      affectedCount: role?.userRoles.length ?? 0,
    };
  }

  if (matcher.startsWith('agent:')) {
    const agentName = matcher.substring(6);
    const agent = await prisma.agent.findFirst({
      where: { organizationId, name: agentName, deletedAt: null },
    });
    return {
      raw: matcher,
      type: 'agent',
      targetName: agent?.name ?? agentName,
      affectedCount: agent ? 1 : 0,
    };
  }

  if (matcher.startsWith('user:')) {
    const userEmail = matcher.substring(5);
    const user = await prisma.user.findFirst({
      where: { organizationId, email: userEmail, deletedAt: null },
    });
    return {
      raw: matcher,
      type: 'user',
      targetName: user?.email ?? userEmail,
      affectedCount: user ? 1 : 0,
    };
  }

  return { raw: matcher, type: 'unknown', targetName: null, affectedCount: 0 };
}

async function resolveToolPatterns(
  patterns: string[],
  organizationId: string,
): Promise<ResolvedToolPattern[]> {
  const results: ResolvedToolPattern[] = [];

  for (const pattern of patterns) {
    const parts = pattern.split('::');
    const serverPart = parts[0];
    const toolPart = parts[1] ?? '*';
    const isWildcard = toolPart === '*' || pattern.includes('*');

    const server = await prisma.mcpServer.findFirst({
      where: { organizationId, deletedAt: null, OR: [{ url: serverPart }, { name: serverPart }] },
      include: { _count: { select: { tools: true } } },
    });

    results.push({
      raw: pattern,
      serverName: server?.name ?? null,
      isWildcard,
      matchedToolCount: isWildcard ? (server?._count.tools ?? 0) : 1,
    });
  }

  return results;
}

async function calculatePolicyImpact(
  matchers: string[],
  organizationId: string,
): Promise<{
  affectedUserCount: number;
  affectedAgentCount: number;
}> {
  let affectedUserCount = 0;
  let affectedAgentCount = 0;

  for (const matcher of matchers) {
    if (matcher === '*') {
      affectedUserCount = await prisma.user.count({
        where: { organizationId, deletedAt: null },
      });
      affectedAgentCount = await prisma.agent.count({
        where: { organizationId, deletedAt: null },
      });
      break; // Wildcard affects everyone
    } else if (matcher.startsWith('role:')) {
      const roleName = matcher.substring(5);
      const count = await prisma.userRole.count({
        where: {
          role: { organizationId, name: roleName, deletedAt: null },
        },
      });
      affectedUserCount += count;
    } else if (matcher.startsWith('agent:')) {
      affectedAgentCount += 1;
    } else if (matcher.startsWith('user:')) {
      affectedUserCount += 1;
    }
  }

  return { affectedUserCount, affectedAgentCount };
}

function matchesWildcard(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return value === pattern;

  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(value);
}
