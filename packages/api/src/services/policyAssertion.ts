/**
 * Policy Assertion Service
 * Implements the logic for running and managing policy assertions
 */

import type { Agent, Policy, PolicyAssertion } from '@sentinel/db';
import { ConditionMode, PolicyEffect, prisma, Prisma } from '@sentinel/db';
import { toJsonValue } from '../lib/jsonValue.js';
import { logger } from '../lib/logger.js';
import { getServerKeyFromUrl } from '../lib/serverUtils.js';
import type { UserWithRoles } from '../types/role.js';
import { evaluatePolicy, toolPatternsOverlap } from './policy.js';
import type { ContextOverridesInput, ExtractedContextInput } from './toolContext.js';

type Decision = 'ALLOWED' | 'DENIED';

/**
 * Validate and return a decision type from a string
 * Falls back to 'DENIED' if the value is invalid
 */
function asDecision(value: string): Decision {
  return value === 'ALLOWED' ? 'ALLOWED' : 'DENIED';
}

/**
 * Map PolicyEvaluationResult decision to assertion Decision
 * PENDING_APPROVAL is treated as DENIED for assertion purposes
 * (the policy didn't fully allow the action)
 */
function toAssertionDecision(decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL'): Decision {
  return decision === 'ALLOWED' ? 'ALLOWED' : 'DENIED';
}

/**
 * Proposed policy for preview - matches the shape needed for evaluation
 */
export interface ProposedPolicy {
  matchers: string[];
  toolPatterns: string[];
  effect: PolicyEffect;
}

export interface AssertionSubResult {
  context: string; // e.g., "user:alice@example.com" or "tool:github.com::createPR"
  decision: 'ALLOWED' | 'DENIED';
  passed: boolean;
  justification: string | null;
}

export interface AssertionRunResult {
  assertionId: string;
  assertionName: string;
  passed: boolean;
  actualDecision: 'ALLOWED' | 'DENIED';
  expectedDecision: 'ALLOWED' | 'DENIED';
  justification: string | null;
  matchedPolicyIds: string[];
  subResults?: AssertionSubResult[];
}

export interface AssertionSummary {
  total: number;
  enabled: number;
  passed: number;
  failed: number;
  neverRun: number;
  lastRunAt: Date | null;
}

/**
 * Create a failed assertion result from an error
 */
function createErrorResult(assertion: PolicyAssertion, error: unknown): AssertionRunResult {
  return {
    assertionId: assertion.id,
    assertionName: assertion.name,
    passed: false,
    actualDecision: 'DENIED',
    expectedDecision: asDecision(assertion.expectedDecision),
    justification: error instanceof Error ? error.message : 'Unknown error',
    matchedPolicyIds: [],
  };
}

/**
 * Update assertion record with run result
 */
async function updateAssertionWithResult(
  assertion: PolicyAssertion,
  result: AssertionRunResult,
): Promise<void> {
  await prisma.policyAssertion.update({
    where: { id: assertion.id },
    data: {
      lastRunAt: new Date(),
      lastRunPassed: result.passed,
      lastRunDecision: result.actualDecision,
      lastRunJustification: result.justification,
      lastRunPolicyIds: result.matchedPolicyIds,
      lastRunSubResults: result.subResults ? toJsonValue(result.subResults) : Prisma.JsonNull,
      // Cap failureCount to prevent integer overflow (LOW-001)
      failureCount: result.passed
        ? assertion.failureCount
        : Math.min(assertion.failureCount + 1, 1_000_000),
    },
  });
}

/**
 * Check if policy matchers could affect an assertion based on its context type
 */
function matchersCouldAffectAssertion(
  policyMatchers: string[],
  assertion: PolicyAssertion,
): boolean {
  switch (assertion.contextType) {
    case 'WILDCARD':
      return true;
    case 'USER':
      return policyMatchers.some((m) => m === '*' || (m.startsWith('user:') && assertion.userId));
    case 'AGENT':
      return policyMatchers.some((m) => m === '*' || (m.startsWith('agent:') && assertion.agentId));
    case 'ROLE':
      return policyMatchers.some(
        (m) =>
          m === '*' ||
          m === 'role:*' ||
          (m.startsWith('role:') && m.split(':')[1] === assertion.roleName),
      );
    default:
      return true;
  }
}

/**
 * Fetch all MCP servers with their tools for an organization
 */
async function fetchServersWithTools(organizationId: string) {
  return prisma.mcpServer.findMany({
    where: { organizationId, deletedAt: null },
    include: { tools: { select: { name: true } } },
  });
}

/**
 * Resolve a wildcard tool pattern to actual tool names from MCP servers
 */
async function resolveToolPattern(organizationId: string, toolPattern: string): Promise<string[]> {
  if (!toolPattern.includes('*')) {
    return [toolPattern];
  }

  const servers = await fetchServersWithTools(organizationId);
  const [patternDomain, patternTool] = toolPattern.split('::');

  const tools: string[] = [];
  for (const server of servers) {
    const domain = getServerKeyFromUrl(server.url);
    const domainMatches =
      patternDomain === '*' || domain.toLowerCase() === patternDomain.toLowerCase();

    if (!domainMatches) {
      continue;
    }

    for (const tool of server.tools) {
      if (patternTool === '*' || tool.name === patternTool) {
        tools.push(`${domain}::${tool.name}`);
      }
    }
  }

  return tools;
}

/**
 * Get a user by ID with roles included
 */
async function getUserWithRoles(
  organizationId: string,
  userId: string,
): Promise<UserWithRoles | null> {
  return prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
      deletedAt: null,
    },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });
}

/**
 * Get all users with a specific role
 */
async function getUsersWithRole(
  organizationId: string,
  roleName: string,
): Promise<UserWithRoles[]> {
  return prisma.user.findMany({
    where: {
      organizationId,
      deletedAt: null,
      userRoles: {
        some: {
          role: {
            name: roleName,
          },
        },
      },
    },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });
}

/**
 * Create a mock user for wildcard context testing
 * This user should match the '*' matcher
 */
function createWildcardUser(): UserWithRoles {
  // Create a user with a special '*' role that signals universal role matching
  // This ensures role-based policies (both role:* and role:X) are properly tested
  return {
    id: 'wildcard-test-user',
    email: 'wildcard@test.local',
    accessToken: 'test',
    organizationId: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActivityAt: null,
    deletedAt: null,
    deletedBy: null,
    orgRole: 'MEMBER',
    userRoles: [
      {
        id: 'wildcard-role-assignment',
        userId: 'wildcard-test-user',
        roleId: 'wildcard-role-id',
        createdAt: new Date(),
        role: {
          id: 'wildcard-role-id',
          name: '*', // Special marker: matches any role in checkMatcher
          organizationId: 'test',
          isAdmin: false,
          description: 'Wildcard test role - matches all role matchers',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
        },
      },
    ],
  };
}

interface TestContext {
  label: string;
  user: UserWithRoles;
  agent: Agent | null;
}

/**
 * Build test contexts based on assertion context type
 */
async function buildTestContexts(
  assertion: PolicyAssertion,
  organizationId: string,
): Promise<TestContext[]> {
  switch (assertion.contextType) {
    case 'USER': {
      if (!assertion.userId) {
        throw new Error('USER context requires userId');
      }
      const user = await getUserWithRoles(organizationId, assertion.userId);
      if (!user) {
        throw new Error(`User ${assertion.userId} not found`);
      }
      return [{ label: `user:${user.email}`, user, agent: null }];
    }

    case 'AGENT': {
      if (!assertion.agentId) {
        throw new Error('AGENT context requires agentId');
      }
      const agent = await prisma.agent.findFirst({
        where: { id: assertion.agentId, organizationId, deletedAt: null },
      });
      if (!agent) {
        throw new Error(`Agent ${assertion.agentId} not found`);
      }
      const user = await prisma.user.findFirst({
        where: { organizationId, deletedAt: null },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) {
        throw new Error('No users available for agent context');
      }
      return [{ label: `agent:${agent.name}`, user, agent }];
    }

    case 'ROLE': {
      if (!assertion.roleName) {
        throw new Error('ROLE context requires roleName');
      }
      const users = await getUsersWithRole(organizationId, assertion.roleName);
      if (users.length === 0) {
        throw new Error(`No users found with role ${assertion.roleName}`);
      }
      return users.map((user) => ({ label: `user:${user.email}`, user, agent: null }));
    }

    case 'WILDCARD': {
      return [{ label: 'wildcard:*', user: createWildcardUser(), agent: null }];
    }

    default:
      throw new Error(`Unknown context type: ${assertion.contextType}`);
  }
}

/**
 * Run a single assertion against policies
 * If policies are not provided, fetches enabled policies from the database
 * @param assertion - The assertion to run
 * @param policies - Optional pre-fetched policies to use
 * @param userWorkspaceIds - Optional workspace IDs to filter policies (org-wide + user's workspaces)
 */
export async function runAssertion(
  assertion: PolicyAssertion,
  policies?: Policy[],
  userWorkspaceIds?: string[],
): Promise<AssertionRunResult> {
  const organizationId = assertion.organizationId;

  // Build workspace filter for policy lookup
  const workspaceFilter = userWorkspaceIds
    ? {
        OR: [
          { workspaceId: null }, // Org-wide policies
          { workspaceId: { in: userWorkspaceIds } }, // User's workspace policies
        ],
      }
    : {};

  // Fetch policies from DB if not provided
  const policiesToUse =
    policies ??
    (await prisma.policy.findMany({
      where: { organizationId, enabled: true, deletedAt: null, ...workspaceFilter },
    }));

  // Resolve tool pattern to actual tools
  const toolNames = await resolveToolPattern(organizationId, assertion.toolPattern);

  if (toolNames.length === 0) {
    logger.warn(`No tools found for pattern ${assertion.toolPattern}`);
    return {
      assertionId: assertion.id,
      assertionName: assertion.name,
      passed: assertion.expectedDecision === 'DENIED',
      actualDecision: 'DENIED',
      expectedDecision: asDecision(assertion.expectedDecision),
      justification: 'No tools match the pattern',
      matchedPolicyIds: [],
      subResults: [],
    };
  }

  const contextsToTest = await buildTestContexts(assertion, organizationId);

  // Run evaluations for all context + tool combinations
  const subResults: AssertionSubResult[] = [];
  const allPolicyIds = new Set<string>();
  let allPassed = true;
  let lastDecision: 'ALLOWED' | 'DENIED' = 'DENIED';
  let lastJustification: string | null = null;

  // Extract invocation details from assertion
  const parameters = assertion.toolParameters as Record<string, unknown> | undefined;
  const contextOverrides = assertion.contextOverrides as ContextOverridesInput | undefined;
  const extractedContext = assertion.extractedContext as ExtractedContextInput | undefined;
  const extractedMode = assertion.extractedMode as 'auto' | 'manual' | undefined;

  for (const context of contextsToTest) {
    for (const toolName of toolNames) {
      const result = await evaluatePolicy(
        {
          user: context.user,
          agent: context.agent,
          toolName,
          parameters,
          contextOverrides,
          extractedContext,
          extractedMode,
        },
        policiesToUse,
      );

      const decision = toAssertionDecision(result.decision);
      const passed = decision === assertion.expectedDecision;
      subResults.push({
        context: `${context.label} + ${toolName}`,
        decision,
        passed,
        justification: result.justification,
      });
      result.policyIds.forEach((id) => allPolicyIds.add(id));

      if (!passed) {
        allPassed = false;
      }
      lastDecision = decision;
      lastJustification = result.justification;
    }
  }

  // Compute summary for single vs multiple results
  const isSingleResult = subResults.length === 1;
  const failedCount = subResults.filter((r) => !r.passed).length;

  const actualDecision: Decision = isSingleResult
    ? subResults[0].decision
    : allPassed
      ? asDecision(assertion.expectedDecision)
      : lastDecision;

  const justification = allPassed
    ? null
    : isSingleResult
      ? lastJustification
      : `${failedCount} of ${subResults.length} tests failed`;

  return {
    assertionId: assertion.id,
    assertionName: assertion.name,
    passed: allPassed,
    actualDecision,
    expectedDecision: asDecision(assertion.expectedDecision),
    justification,
    matchedPolicyIds: Array.from(allPolicyIds),
    subResults: isSingleResult ? undefined : subResults,
  };
}

/**
 * Preview assertion impact for a proposed policy change
 * Returns which assertions would fail if the policy is created/updated
 * @param organizationId - The organization to check
 * @param proposedPolicy - The policy being created/updated
 * @param excludePolicyId - For updates: exclude the policy being updated
 * @param userWorkspaceIds - Optional workspace IDs to filter policies (org-wide + user's workspaces)
 */
export async function previewAssertionImpact(
  organizationId: string,
  proposedPolicy: ProposedPolicy,
  excludePolicyId?: string, // For updates: exclude the policy being updated
  userWorkspaceIds?: string[],
): Promise<AssertionRunResult[]> {
  // Build workspace filter for policy lookup
  const workspaceFilter = userWorkspaceIds
    ? {
        OR: [
          { workspaceId: null }, // Org-wide policies
          { workspaceId: { in: userWorkspaceIds } }, // User's workspace policies
        ],
      }
    : {};

  // Get current enabled policies
  const currentPolicies = await prisma.policy.findMany({
    where: {
      organizationId,
      enabled: true,
      deletedAt: null,
      ...workspaceFilter,
      ...(excludePolicyId && { id: { not: excludePolicyId } }),
    },
  });

  // Create a virtual policy that matches the Policy type shape
  const virtualPolicy: Policy = {
    id: 'preview-policy',
    organizationId,
    slug: 'preview-policy',
    matchers: proposedPolicy.matchers,
    toolPatterns: proposedPolicy.toolPatterns,
    effect: proposedPolicy.effect,
    description: 'Preview policy',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    conditions: null,
    conditionsTree: null,
    conditionMode: ConditionMode.SIMPLE,
    conditionExpression: null,
    workspaceId: null,
  };

  // Combine current policies with the proposed one
  const combinedPolicies = [...currentPolicies, virtualPolicy];

  // Get affected assertions
  const affectedAssertions = await getAffectedAssertions(
    organizationId,
    proposedPolicy.toolPatterns,
    proposedPolicy.matchers,
  );

  // Run each affected assertion with the combined policy set and collect failures
  const results: AssertionRunResult[] = [];
  for (const assertion of affectedAssertions) {
    try {
      const result = await runAssertion(assertion, combinedPolicies);
      if (!result.passed) {
        results.push(result);
      }
    } catch (error) {
      logger.error(`Failed to preview assertion ${assertion.id}:`, error);
      results.push(createErrorResult(assertion, error));
    }
  }

  return results;
}

/**
 * Run assertions and update their records, collecting results
 * @param assertions - The assertions to run
 * @param userWorkspaceIds - Optional workspace IDs to filter policies (org-wide + user's workspaces)
 */
async function runAndUpdateAssertions(
  assertions: PolicyAssertion[],
  userWorkspaceIds?: string[],
): Promise<AssertionRunResult[]> {
  const results: AssertionRunResult[] = [];

  for (const assertion of assertions) {
    try {
      const result = await runAssertion(assertion, undefined, userWorkspaceIds);
      results.push(result);
      await updateAssertionWithResult(assertion, result);
    } catch (error) {
      logger.error(`Failed to run assertion ${assertion.id}:`, error);
      results.push(createErrorResult(assertion, error));
    }
  }

  return results;
}

/**
 * Run all enabled assertions for an organization
 * @param organizationId - The organization to run assertions for
 * @param userWorkspaceIds - Optional workspace IDs to filter policies (org-wide + user's workspaces)
 */
export async function runAllAssertions(
  organizationId: string,
  userWorkspaceIds?: string[],
): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: AssertionRunResult[];
}> {
  const assertions = await prisma.policyAssertion.findMany({
    where: {
      organizationId,
      enabled: true,
    },
  });

  const results = await runAndUpdateAssertions(assertions, userWorkspaceIds);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  return {
    total: assertions.length,
    passed,
    failed,
    results,
  };
}

/**
 * Get assertions that could be affected by changes to a policy
 */
export async function getAffectedAssertions(
  organizationId: string,
  policyToolPatterns: string[],
  policyMatchers: string[],
): Promise<PolicyAssertion[]> {
  const assertions = await prisma.policyAssertion.findMany({
    where: {
      organizationId,
      enabled: true,
    },
  });

  return assertions.filter((assertion) => {
    const toolOverlaps = policyToolPatterns.some((pattern) =>
      toolPatternsOverlap(pattern, assertion.toolPattern),
    );
    return toolOverlaps && matchersCouldAffectAssertion(policyMatchers, assertion);
  });
}

/**
 * Run only assertions affected by a policy change
 * @param organizationId - The organization to run assertions for
 * @param policyToolPatterns - Tool patterns of the changed policy
 * @param policyMatchers - Matchers of the changed policy
 * @param userWorkspaceIds - Optional workspace IDs to filter policies (org-wide + user's workspaces)
 */
export async function runAffectedAssertions(
  organizationId: string,
  policyToolPatterns: string[],
  policyMatchers: string[],
  userWorkspaceIds?: string[],
): Promise<AssertionRunResult[]> {
  const affected = await getAffectedAssertions(organizationId, policyToolPatterns, policyMatchers);
  return runAndUpdateAssertions(affected, userWorkspaceIds);
}

/**
 * Get assertion health summary for dashboard
 */
export async function getAssertionSummary(organizationId: string): Promise<AssertionSummary> {
  const assertions = await prisma.policyAssertion.findMany({
    where: { organizationId },
    select: {
      enabled: true,
      lastRunAt: true,
      lastRunPassed: true,
    },
  });

  const total = assertions.length;
  const enabled = assertions.filter((a) => a.enabled).length;
  const withResults = assertions.filter((a) => a.lastRunPassed !== null);
  const passed = withResults.filter((a) => a.lastRunPassed === true).length;
  const failed = withResults.filter((a) => a.lastRunPassed === false).length;
  const neverRun = assertions.filter((a) => a.lastRunAt === null).length;

  const lastRunDates = assertions.map((a) => a.lastRunAt).filter((d): d is Date => d !== null);
  const lastRunAt =
    lastRunDates.length > 0 ? new Date(Math.max(...lastRunDates.map((d) => d.getTime()))) : null;

  return {
    total,
    enabled,
    passed,
    failed,
    neverRun,
    lastRunAt,
  };
}
