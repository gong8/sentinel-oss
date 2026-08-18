/**
 * Policy Service
 * Implements the policy evaluation engine for tool access control
 */

import { ConditionMode, type Agent, type Policy } from '@sentinel/db';
import type {
  PipelineStage,
  PipelineStageResult,
  PolicyEvaluationTree,
  PolicyNode,
} from '@sentinel/shared';

// Re-export pattern utilities from shared for backward compatibility
export {
  checkToolPattern,
  matcherArraysOverlap,
  matchersOverlap,
  toolPatternArraysOverlap,
  toolPatternsOverlap,
  validateMatcher,
  validateMatchers,
  validateToolPattern,
  validateToolPatterns,
} from '@sentinel/shared';

// Import for local use in this module
import { checkToolPattern } from '@sentinel/shared';
import { logger } from '../lib/logger.js';
import type { UserWithRoles } from '../types/role.js';
import { evaluateAdvancedCondition, validateStoredExpression } from './advancedCondition.js';
import type { ConditionEvaluationContext } from './policyCondition.js';
import {
  evaluatePolicyConditions,
  evaluatePolicyConditionsWithTree,
  parsePolicyConditions,
} from './policyCondition.js';
import {
  buildEvaluationContextWithGlobalVars,
  buildEvaluationContextWithOverridesAndGlobalVars,
  type ContextOverridesInput,
  type ExtractedContextInput,
} from './toolContext.js';

export interface PolicyEvaluationResult {
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  justification: string | null;
  policyIds: string[];
  /** Present when decision is PENDING_APPROVAL */
  approvalRequestId?: string;
}

/** Creates a denied result */
function denied(justification: string, policyIds: string[] = []): PolicyEvaluationResult {
  return { decision: 'DENIED', justification, policyIds };
}

/** Creates an allowed result */
function allowed(policyIds: string[]): PolicyEvaluationResult {
  return { decision: 'ALLOWED', justification: null, policyIds };
}

export interface PolicyContext {
  user: UserWithRoles;
  agent?: Agent | null;
  /** User the agent is acting on behalf of (for delegation) */
  delegatedUser?: UserWithRoles;
  toolName: string;
  /** Tool parameters for condition evaluation */
  parameters?: Record<string, unknown>;
  /** Source IP address for network-based conditions */
  sourceIp?: string;
  /** Optional: Context overrides for testing (playground) */
  contextOverrides?: ContextOverridesInput;
  /** Optional: Extracted context overrides for testing */
  extractedContext?: ExtractedContextInput;
  /** Optional: Extracted mode ('auto' or 'manual') */
  extractedMode?: 'auto' | 'manual';
  /** Optional: Pre-built evaluation context (for testing) */
  evaluationContext?: ConditionEvaluationContext;
}

/**
 * Evaluates whether a user/agent can invoke a specific tool
 * Based on the policy evaluation algorithm in the spec (section 5.2)
 *
 * Rules:
 * 1. DENY always wins - any matching DENY policy blocks the action
 * 2. At least one ALLOW required - must have at least one matching ALLOW
 * 3. Fail closed - no matching ALLOW policy = DENIED
 * 4. Only active (non-deleted) policies are evaluated
 * 5. ALLOW policies with conditions must have those conditions pass
 *
 * A policy matches if ANY of its matchers match AND ANY of its tool patterns match
 * AND (for ALLOW policies) any conditions pass.
 *
 * Delegation (when delegatedUser is present):
 * - Both the agent AND the delegated user must have permission (AND logic)
 * - The agent must match via agent matchers
 * - The delegated user must match via user/role matchers
 */
export async function evaluatePolicy(
  context: PolicyContext,
  policies: Policy[],
): Promise<PolicyEvaluationResult> {
  const {
    user,
    agent,
    delegatedUser,
    toolName,
    parameters,
    sourceIp,
    contextOverrides,
    extractedContext,
    extractedMode,
  } = context;

  // Filter to enabled and non-deleted policies only
  const activePolicies = policies.filter((p) => p.enabled && !p.deletedAt);

  // When delegation is active, we need to check both:
  // 1. Agent has permission (agent matcher)
  // 2. Delegated user has permission (user/role matcher)
  if (delegatedUser && agent) {
    return evaluateDelegatedPolicy(activePolicies, agent, delegatedUser, toolName, context);
  }

  // Standard evaluation (no delegation)
  // A policy matches if ANY matcher matches AND ANY tool pattern matches
  const matchingPolicies = activePolicies.filter(
    (policy) =>
      policy.matchers.some((m) => checkMatcher(m, user, agent)) &&
      policy.toolPatterns.some((tp) => checkToolPattern(tp, toolName)),
  );

  // Filter ALLOW policies that have conditions to evaluate
  const policiesAfterConditions = await filterPoliciesWithConditions(
    matchingPolicies,
    toolName,
    parameters,
    sourceIp,
    contextOverrides,
    extractedContext,
    extractedMode,
  );

  return evaluateMatchingPolicies(policiesAfterConditions);
}

/**
 * Filter policies based on condition evaluation
 * DENY policies always pass through (conditions don't apply to them)
 * ALLOW policies with conditions must have those conditions pass
 * Supports both SIMPLE (array-based) and ADVANCED (expression-based) conditions
 */
async function filterPoliciesWithConditions(
  policies: Policy[],
  toolName: string,
  parameters?: Record<string, unknown>,
  sourceIp?: string,
  contextOverrides?: ContextOverridesInput,
  extractedContext?: ExtractedContextInput,
  extractedMode?: 'auto' | 'manual',
): Promise<Policy[]> {
  const result: Policy[] = [];

  for (const policy of policies) {
    // DENY policies always apply regardless of conditions
    if (policy.effect === 'DENY') {
      result.push(policy);
      continue;
    }

    // Check if policy has conditions to evaluate
    const hasSimpleConditions = policy.conditions !== null;
    const hasAdvancedConditions =
      policy.conditionMode === ConditionMode.ADVANCED && policy.conditionExpression !== null;

    // ALLOW policies without any conditions pass through
    if (!hasSimpleConditions && !hasAdvancedConditions) {
      result.push(policy);
      continue;
    }

    // Build evaluation context (with overrides if provided for testing)
    // Use async versions that include global variables
    // Pass workspaceId to load both org-wide and workspace-specific global variables
    const evaluationContext =
      contextOverrides || extractedContext || extractedMode
        ? await buildEvaluationContextWithOverridesAndGlobalVars(
            {
              organizationId: policy.organizationId,
              workspaceId: policy.workspaceId,
              toolName,
              parameters: parameters ?? {},
              sourceIp,
              timestamp: new Date(),
            },
            contextOverrides,
            extractedContext,
            extractedMode,
          )
        : await buildEvaluationContextWithGlobalVars({
            organizationId: policy.organizationId,
            workspaceId: policy.workspaceId,
            toolName,
            parameters: parameters ?? {},
            sourceIp,
            timestamp: new Date(),
          });

    // Handle ADVANCED mode conditions
    if (hasAdvancedConditions) {
      const storedExpr = policy.conditionExpression;
      if (!validateStoredExpression(storedExpr)) {
        logger.warn('Invalid advanced condition expression format', {
          policyId: policy.id,
        });
        result.push(policy);
        continue;
      }

      // Get global variables for evaluation
      const globalVars = evaluationContext as Record<string, unknown>;
      const globals: Record<string, Record<string, unknown>> = {};

      // Extract global variable namespaces from evaluation context
      for (const [key, value] of Object.entries(globalVars)) {
        if (key !== 'params' && key !== 'context' && typeof value === 'object' && value !== null) {
          globals[key.toUpperCase()] = value as Record<string, unknown>;
        }
      }

      const advancedResult = evaluateAdvancedCondition(
        storedExpr,
        evaluationContext.params,
        {
          sourceIp: evaluationContext.network.sourceIp,
          timestamp: evaluationContext.time.timestamp,
          hourOfDay: evaluationContext.time.hourOfDay,
          dayOfWeek: evaluationContext.time.dayOfWeek,
          timezone: evaluationContext.time.timezone,
        },
        globals,
      );

      if (advancedResult.passed) {
        result.push(policy);
        logger.debug('Advanced policy conditions passed', {
          policyId: policy.id,
        });
      } else {
        logger.debug('Advanced policy conditions not met, skipping ALLOW policy', {
          policyId: policy.id,
          error: advancedResult.error,
        });
      }
      continue;
    }

    // Handle SIMPLE mode conditions (existing logic)
    const conditions = parsePolicyConditions(policy.conditions);
    if (!conditions) {
      // Invalid conditions format - treat as no conditions and pass through
      logger.warn('Invalid policy conditions format, treating as no conditions', {
        policyId: policy.id,
      });
      result.push(policy);
      continue;
    }

    // Evaluate conditions
    const conditionResult = evaluatePolicyConditions(conditions, evaluationContext);

    if (conditionResult.passed) {
      result.push(policy);
      logger.debug('Policy conditions passed', {
        policyId: policy.id,
        evaluationTimeMs: conditionResult.evaluationTimeMs,
      });
    } else {
      logger.debug('Policy conditions not met, skipping ALLOW policy', {
        policyId: policy.id,
        failedConditions: conditionResult.failedConditions,
      });
    }
  }

  return result;
}

/**
 * Evaluates a set of matching policies for deny/allow decisions
 * DENY always wins, then requires at least one ALLOW
 */
function evaluateMatchingPolicies(
  matchingPolicies: Policy[],
  denialPrefix = 'Denied by policy',
): PolicyEvaluationResult {
  const denyPolicy = matchingPolicies.find((p) => p.effect === 'DENY');
  if (denyPolicy) {
    return denied(`${denialPrefix}: ${denyPolicy.description}`, [denyPolicy.id]);
  }

  const allowPolicies = matchingPolicies.filter((p) => p.effect === 'ALLOW');
  if (allowPolicies.length === 0) {
    return denied('No matching ALLOW policy');
  }

  return allowed(allowPolicies.map((p) => p.id));
}

/**
 * Finds policies matching a tool and a custom matcher function
 */
function findMatchingPolicies(
  policies: Policy[],
  toolName: string,
  matcherFn: (matcher: string) => boolean,
): Policy[] {
  return policies.filter(
    (policy) =>
      policy.matchers.some(matcherFn) &&
      policy.toolPatterns.some((tp) => checkToolPattern(tp, toolName)),
  );
}

/**
 * Evaluates policy for delegation scenarios where an agent acts on behalf of a user.
 * Both the agent AND the user must have permission (AND logic).
 */
async function evaluateDelegatedPolicy(
  activePolicies: Policy[],
  agent: Agent,
  delegatedUser: UserWithRoles,
  toolName: string,
  context: PolicyContext,
): Promise<PolicyEvaluationResult> {
  const { parameters, sourceIp } = context;

  const agentPolicies = findMatchingPolicies(activePolicies, toolName, (m) =>
    checkAgentMatcher(m, agent),
  );
  const userPolicies = findMatchingPolicies(activePolicies, toolName, (m) =>
    checkUserMatcher(m, delegatedUser),
  );

  // Apply condition filtering to both policy sets
  const agentPoliciesFiltered = await filterPoliciesWithConditions(
    agentPolicies,
    toolName,
    parameters,
    sourceIp,
  );
  const userPoliciesFiltered = await filterPoliciesWithConditions(
    userPolicies,
    toolName,
    parameters,
    sourceIp,
  );

  // Check for DENY policies
  const agentDeny = agentPoliciesFiltered.find((p) => p.effect === 'DENY');
  if (agentDeny) {
    return denied(`Agent denied by policy: ${agentDeny.description}`, [agentDeny.id]);
  }

  const userDeny = userPoliciesFiltered.find((p) => p.effect === 'DENY');
  if (userDeny) {
    return denied(`Delegated user denied by policy: ${userDeny.description}`, [userDeny.id]);
  }

  // Both must have at least one ALLOW policy
  const agentAllows = agentPoliciesFiltered.filter((p) => p.effect === 'ALLOW');
  const userAllows = userPoliciesFiltered.filter((p) => p.effect === 'ALLOW');

  if (agentAllows.length === 0) {
    return denied('No matching ALLOW policy for agent');
  }
  if (userAllows.length === 0) {
    return denied('No matching ALLOW policy for delegated user');
  }

  // Both have permission - deduplicate policy IDs
  const uniqueIds = [...new Set([...agentAllows, ...userAllows].map((p) => p.id))];
  return allowed(uniqueIds);
}

/**
 * Checks if a matcher matches only agent patterns (for delegation)
 * Only matches: agent:* or agent:specificId or * (wildcard)
 */
function checkAgentMatcher(matcher: string, agent: Agent): boolean {
  if (matcher === '*') return true;

  const [type, value] = matcher.split(':');
  if (type !== 'agent') return false;

  return value === '*' || agent.id === value;
}

/**
 * Checks if a matcher matches only user/role patterns (for delegation)
 * Matches: user:*, user:email, role:*, role:name, or * (wildcard)
 */
function checkUserMatcher(matcher: string, user: UserWithRoles): boolean {
  if (matcher === '*') return true;

  const [type, value] = matcher.split(':');

  switch (type) {
    case 'role':
      return value === '*'
        ? user.userRoles.length > 0
        : user.userRoles.some((ur) => ur.role.name === '*' || ur.role.name === value);
    case 'user':
      return value === '*' || user.email === value;
    default:
      return false;
  }
}

/**
 * Extended user type that may include workspace membership info
 */
interface UserWithWorkspaces extends UserWithRoles {
  workspaceMemberships?: Array<{
    workspaceId: string;
    role: string;
  }>;
}

/**
 * Checks if a matcher pattern matches the user/agent
 *
 * Matcher formats:
 * - "role:Admin" - matches if user has role with name "Admin" (case-sensitive)
 * - "user:email@example.com" - matches specific user email
 * - "agent:agentId" - matches specific MCP agent
 * - "workspace:workspaceId" - matches members of a specific workspace
 * - "workspace-admin:workspaceId" - matches admins of a specific workspace
 * - "*" - matches everyone
 *
 * Note: A2A agents are TARGETS (not callers) and are matched via tool patterns,
 * not matchers. Use tool patterns like "a2a::agentId::*" to control A2A access.
 */
export function checkMatcher(
  matcher: string,
  user: UserWithWorkspaces,
  agent?: Agent | null,
): boolean {
  if (matcher === '*') {
    return true;
  }

  const [type, value] = matcher.split(':');

  switch (type) {
    case 'role':
      // Wildcard: matches any user with at least one role
      if (value === '*') {
        return user.userRoles.length > 0;
      }
      // Check if user has the specified role (by name)
      // Special case: if user has a '*' role (wildcard test user), match any role matcher
      return user.userRoles.some((ur) => ur.role.name === '*' || ur.role.name === value);

    case 'user':
      // Wildcard: matches any authenticated user
      if (value === '*') {
        return true;
      }
      // Check if user email matches
      return user.email === value;

    case 'agent':
      // Wildcard: matches any agent
      if (value === '*') {
        return agent !== null && agent !== undefined;
      }
      // Check if agent ID matches
      return agent?.id === value;

    case 'workspace':
      // Check workspace membership
      if (!user.workspaceMemberships) {
        return false;
      }
      // Wildcard: matches any user who is a member of any workspace
      if (value === '*') {
        return user.workspaceMemberships.length > 0;
      }
      // Check if user is a member of the specific workspace
      return user.workspaceMemberships.some((wm) => wm.workspaceId === value);

    case 'workspace-admin':
      // Check workspace admin status
      if (!user.workspaceMemberships) {
        return false;
      }
      // Wildcard: matches any user who is an admin of any workspace
      if (value === '*') {
        return user.workspaceMemberships.some((wm) => wm.role === 'ADMIN');
      }
      // Check if user is an admin of the specific workspace
      return user.workspaceMemberships.some(
        (wm) => wm.workspaceId === value && wm.role === 'ADMIN',
      );

    default:
      logger.warn(`Unknown matcher type: ${type}`);
      return false;
  }
}

/**
 * Generates a deterministic slug from policy data
 *
 * The slug is based on:
 * - matchers (first matcher used for slug, e.g., "role:admin" -> "role-admin")
 * - toolPatterns (first pattern used for slug, e.g., "github.com::*" -> "github-com-all")
 * - effect (e.g., "ALLOW" -> "allow")
 *
 * If a collision occurs, appends a number to ensure uniqueness.
 *
 * @param matchers - Policy matchers array
 * @param toolPatterns - Tool patterns array
 * @param effect - Policy effect ("ALLOW" or "DENY")
 * @param existingSlugs - Set of existing slugs in the organization (for collision detection)
 * @returns A unique slug for the policy
 */
export function generatePolicySlug(
  matchers: string[],
  toolPatterns: string[],
  effect: 'ALLOW' | 'DENY',
  existingSlugs: Set<string>,
): string {
  // Normalize matcher: convert to lowercase, replace special chars with dashes
  const normalizeMatcher = (m: string): string => {
    if (m === '*') return 'all';
    // Replace colon with dash, lowercase, replace other special chars
    return m
      .toLowerCase()
      .replace(/:/g, '-')
      .replace(/@/g, '-at-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Normalize tool pattern: convert to lowercase, replace special chars
  const normalizeToolPattern = (pattern: string): string => {
    return pattern
      .toLowerCase()
      .replace(/::/g, '-')
      .replace(/:/g, '-')
      .replace(/\./g, '-')
      .replace(/\*/g, 'all')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Normalize effect
  const normalizedEffect = effect.toLowerCase();

  // Use first matcher and first tool pattern for slug base
  // Add count suffix if multiple values
  const firstMatcher = matchers[0] || '*';
  const firstToolPattern = toolPatterns[0] || '*::*';

  const matcherPart = normalizeMatcher(firstMatcher);
  const toolPart = normalizeToolPattern(firstToolPattern);

  // Add multi indicator if there are multiple matchers or tool patterns
  const multiSuffix =
    matchers.length > 1 || toolPatterns.length > 1
      ? `-multi-${matchers.length}m${toolPatterns.length}t`
      : '';

  const baseSlug = `${normalizedEffect}-${matcherPart}-${toolPart}${multiSuffix}`;

  // Truncate base slug to leave room for counter suffix (max 100 chars total)
  // Reserve 10 chars for "-{counter}" suffix
  const maxBaseLength = 90;
  let slug =
    baseSlug.length > maxBaseLength
      ? baseSlug.slice(0, maxBaseLength).replace(/-+$/, '') // Remove trailing dashes
      : baseSlug;

  // Check for collision and append number if needed
  if (existingSlugs.has(slug)) {
    let counter = 2;
    // Calculate available space for counter
    const availableSpace = 100 - slug.length;
    const maxCounter = Math.pow(10, Math.floor(availableSpace / 2)) - 1; // Rough estimate

    let candidate = `${slug}-${counter}`;
    while (existingSlugs.has(candidate) && counter <= maxCounter && candidate.length <= 100) {
      counter++;
      candidate = `${slug}-${counter}`;
    }

    // If we couldn't find a unique slug within length limit, truncate more aggressively
    if (candidate.length > 100 || existingSlugs.has(candidate)) {
      // Truncate slug further to make room
      const truncatedSlug = slug.slice(0, 80).replace(/-+$/, '');
      counter = 2;
      candidate = `${truncatedSlug}-${counter}`;
      while (existingSlugs.has(candidate) && counter < 9999) {
        counter++;
        candidate = `${truncatedSlug}-${counter}`;
      }
    }

    slug = candidate;
  }

  // Final safety check - ensure slug doesn't exceed 100 chars
  return slug.length > 100 ? slug.slice(0, 100) : slug;
}

/**
 * Formats a list of items with commas and 'and' for the last item
 * e.g., ['a'] -> 'a', ['a', 'b'] -> 'a and b', ['a', 'b', 'c'] -> 'a, b, and c'
 */
function formatListWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Formats a single matcher for display
 */
function formatMatcherForDescription(matcher: string): string {
  if (matcher === '*') return 'everyone';

  const [type, value] = matcher.split(':');
  if (type === 'role') {
    return value === '*' ? 'all roles' : `role '${value}'`;
  }
  if (type === 'user') {
    return value === '*' ? 'all users' : `user '${value}'`;
  }
  if (type === 'agent') {
    return value === '*' ? 'all MCP agents' : `MCP agent '${value}'`;
  }
  if (type === 'workspace') {
    return value === '*' ? 'all workspace members' : `workspace '${value}' members`;
  }
  if (type === 'workspace-admin') {
    return value === '*' ? 'all workspace admins' : `workspace '${value}' admins`;
  }
  return matcher;
}

/**
 * Formats a single tool pattern for display
 */
function formatToolPatternForDescription(
  toolPattern: string,
  mcpServerNames?: Map<string, string>,
  a2aAgentNames?: Map<string, string>,
): string {
  if (toolPattern === '*::*') return 'all tools';

  // A2A patterns: a2a::agentId::skillId
  if (toolPattern.startsWith('a2a::')) {
    const parts = toolPattern.split('::');
    if (parts.length !== 3) return toolPattern;

    const [, agentId, skillId] = parts;
    const agentDisplay = a2aAgentNames?.get(agentId) || agentId;

    if (agentId === '*') {
      return skillId === '*' ? 'all A2A agents' : `skill '${skillId}' on all A2A agents`;
    }
    if (skillId === '*') {
      return `all skills on A2A agent '${agentDisplay}'`;
    }
    return `skill '${skillId}' on A2A agent '${agentDisplay}'`;
  }

  // MCP patterns: domain::tool
  const parts = toolPattern.split('::');
  if (parts.length !== 2) return toolPattern;

  const [domain, tool] = parts;
  const serverDisplay = mcpServerNames?.get(domain) || domain;

  if (domain === '*') {
    return tool === '*' ? 'all tools' : `tool '${tool}' on all servers`;
  }
  if (tool === '*') {
    return `all tools on '${serverDisplay}'`;
  }
  return `tool '${tool}' on '${serverDisplay}'`;
}

/**
 * Generates a human-readable description for a policy
 *
 * @param matchers - Policy matchers array
 * @param toolPatterns - Tool patterns array
 * @param effect - Policy effect ("ALLOW" or "DENY")
 * @param mcpServerNames - Optional map of domain -> friendly server name
 * @param a2aAgentNames - Optional map of agentId -> friendly agent name
 * @returns Human-readable description
 */
export function generatePolicyDescription(
  matchers: string[],
  toolPatterns: string[],
  effect: 'ALLOW' | 'DENY',
  mcpServerNames?: Map<string, string>,
  a2aAgentNames?: Map<string, string>,
): string {
  const effectStr = effect === 'ALLOW' ? 'Allow' : 'Deny';
  const matcherDisplay = formatListWithAnd(matchers.map(formatMatcherForDescription));
  const toolDisplay = formatListWithAnd(
    toolPatterns.map((tp) => formatToolPatternForDescription(tp, mcpServerNames, a2aAgentNames)),
  );

  return `${effectStr} ${matcherDisplay} to use ${toolDisplay}`;
}

// ============================================================================
// EVALUATION TREE BUILDING
// ============================================================================

/**
 * Extended policy evaluation result with full evaluation tree for audit visualization
 */
export interface PolicyEvaluationResultWithTree extends PolicyEvaluationResult {
  /** The complete evaluation tree for audit log visualization */
  evaluationTree: PolicyEvaluationTree;
  /** Subset of policyIds that actually matched (for audit display) */
  matchedPolicyIds: string[];
}

/**
 * Context for building the evaluation tree
 */
interface EvaluationTreeContext {
  toolName: string;
  toolNameDisplay?: string;
  evaluationContext: ConditionEvaluationContext;
  serverTrusted?: boolean;
  serverName?: string;
}

/**
 * Creates a pipeline stage result
 */
function createPipelineStage(
  stage: PipelineStage,
  passed: boolean,
  details?: string,
): PipelineStageResult {
  return {
    stage,
    passed,
    timestamp: new Date().toISOString(),
    details,
  };
}

/**
 * Evaluates policies with full tree building for audit visualization.
 * This function captures ALL policy evaluations to build a complete decision tree.
 *
 * @param context - Policy context with user, agent, tool info
 * @param policies - All policies to evaluate
 * @param treeContext - Additional context for tree building
 * @returns Policy evaluation result with complete evaluation tree
 */
export async function evaluatePolicyWithTree(
  context: PolicyContext,
  policies: Policy[],
  treeContext: EvaluationTreeContext,
): Promise<PolicyEvaluationResultWithTree> {
  const { user, agent, delegatedUser, toolName } = context;

  const { evaluationContext, serverTrusted, serverName, toolNameDisplay } = treeContext;

  // Initialize pipeline stages
  const pipelineStages: PipelineStageResult[] = [
    createPipelineStage('REQUEST', true, 'Tool call received'),
    createPipelineStage('SENTINEL_ENTRY', true, 'Entered secure sentinel'),
  ];

  // Trust check stage
  if (serverTrusted !== undefined) {
    pipelineStages.push(
      createPipelineStage(
        'TRUST_CHECK',
        serverTrusted,
        serverTrusted ? `Server '${serverName}' is trusted` : `Server '${serverName}' is untrusted`,
      ),
    );

    // If server is untrusted, return early with DENIED
    if (!serverTrusted) {
      const evaluationTree = buildEvaluationTree({
        toolName,
        toolNameDisplay,
        evaluationContext,
        pipelineStages,
        interruptedAt: 'TRUST_CHECK',
        interruptionReason: `Untrusted server: ${serverName}`,
        policies: [],
        decision: 'DENIED',
        justification: `Untrusted server: ${serverName}`,
        trustCheck: {
          serverTrusted: false,
          serverName: serverName ?? 'unknown',
          reason: 'Server is marked as untrusted',
        },
      });

      return {
        decision: 'DENIED',
        justification: `Untrusted server: ${serverName}`,
        policyIds: [],
        matchedPolicyIds: [],
        evaluationTree,
      };
    }
  }

  // Filter to enabled and non-deleted policies only
  const activePolicies = policies.filter((p) => p.enabled && !p.deletedAt);

  // Evaluate ALL policies and capture results for tree
  const policyNodes: PolicyNode[] = [];
  const matchedPolicies: Policy[] = [];
  let decidingPolicyId: string | undefined;
  let denyPolicy: Policy | undefined;

  // When delegation is active, we evaluate differently
  if (delegatedUser && agent) {
    // For delegation, track both agent and user policy matches
    // This is more complex - for now just run standard evaluation
    // TODO: Enhance delegation tree building
    const basicResult = await evaluatePolicy(context, policies);

    // Build a simplified tree for delegation
    pipelineStages.push(
      createPipelineStage(
        'POLICY_CHECK',
        basicResult.decision === 'ALLOWED',
        basicResult.decision === 'ALLOWED'
          ? 'Delegation policy check passed'
          : (basicResult.justification ?? 'Delegation policy check failed'),
      ),
    );

    const evaluationTree = buildEvaluationTree({
      toolName,
      toolNameDisplay,
      evaluationContext,
      pipelineStages,
      interruptedAt: basicResult.decision === 'DENIED' ? 'POLICY_CHECK' : undefined,
      interruptionReason:
        basicResult.decision === 'DENIED' ? (basicResult.justification ?? undefined) : undefined,
      policies: policyNodes,
      decision: basicResult.decision,
      justification: basicResult.justification ?? 'Delegation evaluation',
      decidingPolicyId: basicResult.policyIds[0],
    });

    return {
      ...basicResult,
      matchedPolicyIds: basicResult.policyIds,
      evaluationTree,
    };
  }

  // Standard evaluation with full tree building
  for (const policy of activePolicies) {
    const policyNode: PolicyNode = {
      type: 'policy',
      policyId: policy.id,
      policySlug: policy.slug ?? policy.id,
      effect: policy.effect as 'ALLOW' | 'DENY',
      matcherMatched: false,
      toolPatternMatched: false,
      matched: false,
      evaluationStatus: 'NOT_MATCHED',
    };

    // Check matchers
    const matchedMatchers: string[] = [];
    for (const m of policy.matchers) {
      if (checkMatcher(m, user, agent)) {
        matchedMatchers.push(m);
      }
    }
    policyNode.matcherMatched = matchedMatchers.length > 0;
    policyNode.matcherDetails = {
      patterns: policy.matchers,
      matched: matchedMatchers,
    };

    // Check tool patterns
    const matchedToolPatterns: string[] = [];
    for (const tp of policy.toolPatterns) {
      if (checkToolPattern(tp, toolName)) {
        matchedToolPatterns.push(tp);
      }
    }
    policyNode.toolPatternMatched = matchedToolPatterns.length > 0;
    if (matchedToolPatterns.length > 0) {
      policyNode.toolPatternDetails = {
        pattern: matchedToolPatterns[0],
        toolName,
      };
    }

    // If matcher or tool pattern didn't match, policy doesn't apply
    if (!policyNode.matcherMatched || !policyNode.toolPatternMatched) {
      policyNodes.push(policyNode);
      continue;
    }

    // DENY policies always apply if matcher and tool pattern match
    if (policy.effect === 'DENY') {
      policyNode.matched = true;
      policyNode.evaluationStatus = 'MATCHED';
      policyNodes.push(policyNode);
      matchedPolicies.push(policy);

      // Track first DENY policy
      if (!denyPolicy) {
        denyPolicy = policy;
        decidingPolicyId = policy.id;
      }
      continue;
    }

    // ALLOW policies need condition evaluation
    if (policy.conditions) {
      const conditions = parsePolicyConditions(policy.conditions);

      if (conditions && conditions.length > 0) {
        // Use the tree-building version for audit visualization
        const conditionResult = evaluatePolicyConditionsWithTree(conditions, evaluationContext);
        policyNode.conditionsResult = conditionResult.evaluationTree;

        if (!conditionResult.passed) {
          policyNode.matched = false;
          policyNode.evaluationStatus = 'CONDITIONS_FAILED';
          policyNodes.push(policyNode);
          continue;
        }
      }
    }

    // ALLOW policy matched and conditions passed
    policyNode.matched = true;
    policyNode.evaluationStatus = 'MATCHED';
    policyNodes.push(policyNode);
    matchedPolicies.push(policy);
  }

  // Determine final decision
  let decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  let justification: string | null;

  if (denyPolicy) {
    decision = 'DENIED';
    justification = `Denied by policy: ${denyPolicy.description}`;
    decidingPolicyId = denyPolicy.id;

    // Mark non-DENY policies as skipped
    for (const node of policyNodes) {
      if (node.effect === 'ALLOW' && node.matched) {
        node.evaluationStatus = 'SKIPPED';
        node.skipReason = 'DENY takes precedence';
        node.matched = false;
      }
    }
  } else {
    const allowPolicies = matchedPolicies.filter((p) => p.effect === 'ALLOW');
    if (allowPolicies.length === 0) {
      decision = 'DENIED';
      justification = 'No matching ALLOW policy';
    } else {
      decision = 'ALLOWED';
      justification = null;
      decidingPolicyId = allowPolicies[0].id;
    }
  }

  // Add policy check stage
  pipelineStages.push(
    createPipelineStage(
      'POLICY_CHECK',
      decision === 'ALLOWED',
      decision === 'ALLOWED'
        ? `Allowed by ${matchedPolicies.filter((p) => p.effect === 'ALLOW').length} policy(ies)`
        : (justification ?? 'Policy check failed'),
    ),
  );

  // Build the evaluation tree
  const evaluationTree = buildEvaluationTree({
    toolName,
    toolNameDisplay,
    evaluationContext,
    pipelineStages,
    interruptedAt: decision === 'DENIED' ? 'POLICY_CHECK' : undefined,
    interruptionReason: decision === 'DENIED' ? (justification ?? undefined) : undefined,
    policies: policyNodes,
    decision,
    justification: justification ?? 'Request allowed',
    decidingPolicyId,
    trustCheck:
      serverTrusted !== undefined
        ? {
            serverTrusted,
            serverName: serverName ?? 'unknown',
          }
        : undefined,
  });

  return {
    decision,
    justification,
    policyIds: matchedPolicies.map((p) => p.id),
    matchedPolicyIds: matchedPolicies
      .filter((p) => {
        const node = policyNodes.find((n) => n.policyId === p.id);
        return node?.matched;
      })
      .map((p) => p.id),
    evaluationTree,
  };
}

/**
 * Builds the complete PolicyEvaluationTree structure
 */
function buildEvaluationTree(params: {
  toolName: string;
  toolNameDisplay?: string;
  evaluationContext: ConditionEvaluationContext;
  pipelineStages: PipelineStageResult[];
  interruptedAt?: PipelineStage;
  interruptionReason?: string;
  policies: PolicyNode[];
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  justification: string;
  decidingPolicyId?: string;
  trustCheck?: {
    serverTrusted: boolean;
    serverName: string;
    reason?: string;
  };
  flagCheck?: {
    passed: boolean;
    matchedFlagIds: string[];
    flagBehaviors: string[];
    rateLimitHit?: boolean;
    approvalRequired?: boolean;
  };
}): PolicyEvaluationTree {
  const {
    toolName,
    toolNameDisplay,
    evaluationContext,
    pipelineStages,
    interruptedAt,
    interruptionReason,
    policies,
    decision,
    justification,
    decidingPolicyId,
    trustCheck,
    flagCheck,
  } = params;

  // Determine final stage reached
  const finalStage =
    pipelineStages.length > 0 ? pipelineStages[pipelineStages.length - 1].stage : 'REQUEST';

  return {
    timestamp: new Date().toISOString(),
    toolName,
    toolNameDisplay,
    pipeline: {
      stages: pipelineStages,
      finalStage,
      interruptedAt,
      interruptionReason,
    },
    evaluationContext: {
      params: evaluationContext.params,
      context: {
        hourOfDay: evaluationContext.time.hourOfDay,
        dayOfWeek: evaluationContext.time.dayOfWeek,
        timestamp: evaluationContext.time.timestamp.toISOString(),
        sourceIp: evaluationContext.network?.sourceIp,
        timezone: evaluationContext.time.timezone,
      },
      sql: evaluationContext.sql,
      github: evaluationContext.github,
      file: evaluationContext.file,
    },
    trustCheck,
    policies,
    flagCheck,
    decision,
    decidingPolicyId,
    justification,
  };
}

/**
 * Adds flag check results to an existing evaluation tree
 */
export function addFlagCheckToTree(
  tree: PolicyEvaluationTree,
  flagResult: {
    passed: boolean;
    matchedFlagIds: string[];
    flagBehaviors: string[];
    rateLimitHit?: boolean;
    approvalRequired?: boolean;
    blockReason?: string;
  },
): PolicyEvaluationTree {
  const newStage = createPipelineStage(
    'FLAG_CHECK',
    flagResult.passed,
    flagResult.passed
      ? `Flag check passed (${flagResult.matchedFlagIds.length} flags evaluated)`
      : (flagResult.blockReason ?? 'Flag check failed'),
  );

  const updatedStages = [...tree.pipeline.stages, newStage];

  return {
    ...tree,
    pipeline: {
      ...tree.pipeline,
      stages: updatedStages,
      finalStage: flagResult.passed ? tree.pipeline.finalStage : 'FLAG_CHECK',
      interruptedAt: flagResult.passed ? tree.pipeline.interruptedAt : 'FLAG_CHECK',
      interruptionReason: flagResult.passed
        ? tree.pipeline.interruptionReason
        : flagResult.blockReason,
    },
    flagCheck: {
      passed: flagResult.passed,
      matchedFlagIds: flagResult.matchedFlagIds,
      flagBehaviors: flagResult.flagBehaviors,
      rateLimitHit: flagResult.rateLimitHit,
      approvalRequired: flagResult.approvalRequired,
    },
    decision: flagResult.passed
      ? tree.decision
      : flagResult.approvalRequired
        ? 'PENDING_APPROVAL'
        : 'DENIED',
    justification: flagResult.passed
      ? tree.justification
      : (flagResult.blockReason ?? tree.justification),
  };
}

/**
 * Adds execution completion stages to an existing evaluation tree
 */
export function completeTreeExecution(tree: PolicyEvaluationTree): PolicyEvaluationTree {
  const executeStage = createPipelineStage('EXECUTE', true, 'Tool executed successfully');
  const exitStage = createPipelineStage('SENTINEL_EXIT', true, 'Exited secure sentinel');
  const logStage = createPipelineStage('LOG', true, 'Audit log recorded');

  return {
    ...tree,
    pipeline: {
      ...tree.pipeline,
      stages: [...tree.pipeline.stages, executeStage, exitStage, logStage],
      finalStage: 'LOG',
    },
  };
}
