/**
 * Webhook Verbose Enrichment Service Unit Tests
 * Tests for verbose webhook payload enrichment
 */

import { WebhookEvent } from '@sentinel/db';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    policy: { findMany: vi.fn() },
    user: { findFirst: vi.fn(), count: vi.fn() },
    agent: { findFirst: vi.fn(), count: vi.fn() },
    mcpServer: { findFirst: vi.fn() },
    sensitiveToolFlag: { findFirst: vi.fn() },
    sensitiveFlagAgentOverride: { findFirst: vi.fn() },
    role: { findFirst: vi.fn() },
    userRole: { count: vi.fn() },
  },
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  WebhookEvent: {
    TOOL_INVOCATION_ALLOWED: 'TOOL_INVOCATION_ALLOWED',
    TOOL_INVOCATION_DENIED: 'TOOL_INVOCATION_DENIED',
    SENSITIVE_TOOL_INVOKED: 'SENSITIVE_TOOL_INVOKED',
    SENSITIVE_RATE_LIMITED: 'SENSITIVE_RATE_LIMITED',
    SENSITIVE_APPROVAL_NEEDED: 'SENSITIVE_APPROVAL_NEEDED',
    POLICY_CREATED: 'POLICY_CREATED',
    POLICY_UPDATED: 'POLICY_UPDATED',
    POLICY_DELETED: 'POLICY_DELETED',
    AGENT_CREATED: 'AGENT_CREATED',
    AGENT_DELETED: 'AGENT_DELETED',
  },
}));

import type { WebhookPayload } from '../../../../packages/api/src/services/webhook.js';
import {
  getAffectedPolicies,
  getAgentOverride,
  getApplicablePolicies,
  getDiff,
  getFlagConfig,
  getImpact,
  getMatchedPolicies,
  getMatcherChanges,
  getOrganizationContext,
  getRateLimitContext,
  getRequestingUser,
  getResolvedMatchers,
  getResolvedToolPatterns,
  getServerContext,
  getUserContext,
} from '../../../../packages/api/src/services/webhookDataSchemas.js';
import { enrichPayloadIfVerbose } from '../../../../packages/api/src/services/webhookVerbose.js';

/**
 * Type-safe helpers for test assertions on webhook data.
 * These use type guards to narrow types without 'as' casts.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getDataRecord(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = data[key];
  return isRecord(value) ? value : undefined;
}

function _getDataArray(data: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = data[key];
  return Array.isArray(value) ? value : undefined;
}

function getDataString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

function _getDataNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === 'number' ? value : undefined;
}

function _getDataBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  const value = data[key];
  return typeof value === 'boolean' ? value : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('webhookVerbose', () => {
  describe('enrichPayloadIfVerbose', () => {
    test('should return original payload when verbose=false', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { toolName: 'test-tool' },
      };

      const result = await enrichPayloadIfVerbose(payload, false);

      expect(result).toEqual(payload);
      expect(mockPrisma.policy.findMany).not.toHaveBeenCalled();
    });

    test('should enrich TOOL_INVOCATION_ALLOWED event', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'p1',
          slug: 'test-policy',
          matchers: ['role:Developer'],
          toolPatterns: ['*::*'],
          effect: 'ALLOW',
          description: 'Test policy',
          enabled: true,
        },
      ]);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        userRoles: [{ role: { id: 'r1', name: 'Developer', isAdmin: false } }],
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { policyIds: ['p1'], userId: 'u1' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const matchedPolicies = getMatchedPolicies(result.data);
      const userContext = getUserContext(result.data);
      expect(matchedPolicies).toBeDefined();
      expect(matchedPolicies).toHaveLength(1);
      expect(userContext).toBeDefined();
      expect(userContext?.email).toBe('test@example.com');
    });

    test('should enrich TOOL_INVOCATION_DENIED event', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        userRoles: [],
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_DENIED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { userId: 'u1' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      expect(getUserContext(result.data)).toBeDefined();
    });

    test('should enrich POLICY_CREATED event with impact', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.agent.count.mockResolvedValue(5);
      mockPrisma.role.findFirst.mockResolvedValue({
        name: 'Developer',
        userRoles: [{ id: '1' }, { id: '2' }],
      });
      mockPrisma.userRole.count.mockResolvedValue(2);

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: {
          matchers: ['role:Developer'],
          toolPatterns: ['github.com::*'],
        },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      expect(getResolvedMatchers(result.data)).toBeDefined();
      expect(getImpact(result.data)).toBeDefined();
    });

    test('should enrich POLICY_UPDATED event with diff', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_UPDATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: {
          policySlug: 'test-policy',
          matchers: ['role:Admin'],
          toolPatterns: ['*::*'],
          effect: 'DENY',
          changes: { matchers: ['role:Admin'] },
        },
      };

      const context = {
        organizationId: 'org-1',
        beforeSnapshot: {
          slug: 'test-policy',
          matchers: ['role:Developer'],
          toolPatterns: ['*::*'],
          effect: 'ALLOW',
        },
      };

      const result = await enrichPayloadIfVerbose(payload, true, context);

      const diff = getDiff(result.data);
      const matcherChanges = getMatcherChanges(result.data);
      expect(diff).toBeDefined();
      const beforeRecord = diff?.before;
      expect(beforeRecord).toBeDefined();
      if (beforeRecord && 'matchers' in beforeRecord && Array.isArray(beforeRecord.matchers)) {
        expect(beforeRecord.matchers).toContain('role:Developer');
      }
      expect(matcherChanges).toBeDefined();
      expect(matcherChanges?.added).toContain('role:Admin');
      expect(matcherChanges?.removed).toContain('role:Developer');
    });

    test('should enrich POLICY_DELETED event', async () => {
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.agent.count.mockResolvedValue(2);

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_DELETED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: {
          policySlug: 'deleted-policy',
          matchers: ['*'],
          toolPatterns: ['danger::*'],
          effect: 'DENY',
          description: 'Deleted policy',
        },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const deletedPolicySnapshot = getDataRecord(result.data, 'deletedPolicySnapshot');
      expect(deletedPolicySnapshot).toBeDefined();
      expect(getDataString(deletedPolicySnapshot ?? {}, 'slug')).toBe('deleted-policy');
      expect(getImpact(result.data)).toBeDefined();
    });

    test('should enrich SENSITIVE_TOOL_INVOKED event', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
        id: 'flag-1',
        toolPattern: 'danger::*',
        description: 'Dangerous tools',
        behaviors: ['LOG', 'ALERT'],
        rateLimitConfig: { maxPerSession: 5, windowMinutes: 60 },
        approvalConfig: null,
        createdAt: new Date(),
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        userRoles: [{ role: { name: 'Developer' } }],
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: {
          flagId: 'flag-1',
          userId: 'u1',
          toolName: 'danger::delete_all',
          parameters: { secret: 'should-be-removed' },
        },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const flagConfig = getFlagConfig(result.data);
      expect(flagConfig).toBeDefined();
      expect(flagConfig?.toolPattern).toBe('danger::*');
      expect(getUserContext(result.data)).toBeDefined();
      expect(result.data['parameters']).toBeUndefined(); // Security: parameters removed
    });

    test('should enrich SENSITIVE_TOOL_INVOKED with context.sensitiveFlag', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { flagId: 'flag-1' },
      };

      const context = {
        organizationId: 'org-1',
        sensitiveFlag: {
          id: 'flag-1',
          toolPattern: 'danger::*',
          description: 'Dangerous',
          behaviors: ['LOG'],
          rateLimit: { maxPerSession: 10, windowMinutes: 30 },
          approvalConfig: null,
          createdAt: new Date(),
        },
      };

      const result = await enrichPayloadIfVerbose(payload, true, context);

      const flagConfig = getFlagConfig(result.data);
      expect(flagConfig).toBeDefined();
      expect(getDataString(getDataRecord(result.data, 'flagConfig') ?? {}, 'id')).toBe('flag-1');
      expect(mockPrisma.sensitiveToolFlag.findFirst).not.toHaveBeenCalled();
    });

    test('should enrich SENSITIVE_TOOL_INVOKED with agent override', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
        id: 'flag-1',
        toolPattern: 'danger::*',
        description: 'Test',
        behaviors: ['LOG'],
        rateLimitConfig: null,
        approvalConfig: null,
        createdAt: new Date(),
      });
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue({
        exempted: true,
        behaviors: ['ALERT'],
        rateLimitConfig: { maxPerSession: 100, windowMinutes: 5 },
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { flagId: 'flag-1', agentId: 'agent-1' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const agentOverride = getAgentOverride(result.data);
      expect(agentOverride).toBeDefined();
      expect(agentOverride?.exempted).toBe(true);
      expect(agentOverride?.customBehaviors).toEqual(['ALERT']);
    });

    test('should enrich SENSITIVE_APPROVAL_NEEDED event', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
        id: 'flag-1',
        toolPattern: 'admin::*',
        description: 'Admin tools',
        behaviors: ['APPROVAL'],
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        userRoles: [{ role: { name: 'Developer', isAdmin: false } }],
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.SENSITIVE_APPROVAL_NEEDED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { flagId: 'flag-1', userId: 'u1', requestId: 'req-1' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const flagConfig = getFlagConfig(result.data);
      const requestingUser = getRequestingUser(result.data);
      expect(flagConfig).toBeDefined();
      expect(flagConfig?.approvalConfig).toBeDefined();
      expect(requestingUser).toBeDefined();
      expect(requestingUser?.email).toBe('user@example.com');
    });

    test('should enrich SENSITIVE_RATE_LIMITED event', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
        id: 'flag-1',
        toolPattern: 'api::*',
        description: 'API tools',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.SENSITIVE_RATE_LIMITED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { flagId: 'flag-1', userId: 'u1' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const flagConfig = getFlagConfig(result.data);
      expect(flagConfig).toBeDefined();
      expect(flagConfig?.rateLimit).toBeDefined();
      expect(getUserContext(result.data)).toBeDefined();
    });

    test('should enrich SENSITIVE_RATE_LIMITED with rate limit context', async () => {
      const resetAt = new Date();
      const windowStart = new Date(Date.now() - 30 * 60 * 1000);

      const payload: WebhookPayload = {
        event: WebhookEvent.SENSITIVE_RATE_LIMITED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { flagId: 'flag-1' },
      };

      const context = {
        organizationId: 'org-1',
        sensitiveFlag: {
          id: 'flag-1',
          toolPattern: 'api::*',
          description: 'Test',
          behaviors: ['RATE_LIMIT'],
          rateLimit: { maxPerSession: 10, windowMinutes: 60 },
          approvalConfig: null,
          createdAt: new Date(),
        },
        rateLimitUsage: {
          currentUsage: 10,
          remaining: 0,
          resetAt,
          windowStart,
        },
      };

      const result = await enrichPayloadIfVerbose(payload, true, context);

      const rateLimitContext = getRateLimitContext(result.data);
      expect(rateLimitContext).toBeDefined();
      expect(rateLimitContext?.currentUsage).toBe(10);
      expect(rateLimitContext?.remaining).toBe(0);
    });

    test('should enrich AGENT_CREATED event', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'p1',
          slug: 'agent-policy',
          matchers: ['agent:TestAgent'],
          toolPatterns: ['*::*'],
          effect: 'ALLOW',
        },
        {
          id: 'p2',
          slug: 'all-policy',
          matchers: ['*'],
          toolPatterns: ['github::*'],
          effect: 'ALLOW',
        },
      ]);
      mockPrisma.agent.count.mockResolvedValue(5);

      const payload: WebhookPayload = {
        event: WebhookEvent.AGENT_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { agentId: 'agent-1', agentName: 'TestAgent' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const applicablePolicies = getApplicablePolicies(result.data);
      const organizationContext = getOrganizationContext(result.data);
      expect(applicablePolicies).toBeDefined();
      expect(applicablePolicies?.length).toBeGreaterThan(0);
      expect(organizationContext).toBeDefined();
      expect(organizationContext?.totalAgents).toBe(5);
    });

    test('should enrich AGENT_DELETED event', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'p1',
          slug: 'agent-policy',
          matchers: ['agent:DeletedAgent'],
          effect: 'ALLOW',
        },
        {
          id: 'p2',
          slug: 'other-policy',
          matchers: ['role:Developer'],
          effect: 'ALLOW',
        },
      ]);
      mockPrisma.agent.count.mockResolvedValue(4);

      const payload: WebhookPayload = {
        event: WebhookEvent.AGENT_DELETED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { agentId: 'agent-1', agentName: 'DeletedAgent' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const affectedPolicies = getAffectedPolicies(result.data);
      const organizationContext = getOrganizationContext(result.data);
      expect(affectedPolicies).toBeDefined();
      expect(affectedPolicies).toHaveLength(1);
      expect(affectedPolicies?.[0]?.slug).toBe('agent-policy');
      expect(organizationContext?.remainingAgents).toBe(4);
    });

    test('should handle missing agentName in AGENT_CREATED', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.AGENT_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { agentId: 'agent-1' }, // No agentName
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      expect(getApplicablePolicies(result.data)).toBeUndefined();
      expect(mockPrisma.policy.findMany).not.toHaveBeenCalled();
    });
  });

  describe('tool invocation enrichment', () => {
    test('should add server context from toolName', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'GitHub',
        url: 'github.com',
        trusted: true,
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { toolName: 'github.com::create_issue' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const serverContext = getServerContext(result.data);
      expect(serverContext).toBeDefined();
      expect(serverContext?.name).toBe('GitHub');
      expect(serverContext?.trusted).toBe(true);
    });

    test('should handle toolName without server prefix', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { toolName: 'simple_tool' }, // No :: separator
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      expect(getServerContext(result.data)).toBeUndefined();
      expect(mockPrisma.mcpServer.findFirst).not.toHaveBeenCalled();
    });

    test('should handle missing policyIds', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: {},
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      expect(getMatchedPolicies(result.data)).toBeUndefined();
      expect(mockPrisma.policy.findMany).not.toHaveBeenCalled();
    });

    test('should handle empty policyIds array', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { policyIds: [] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      expect(getMatchedPolicies(result.data)).toBeUndefined();
      expect(mockPrisma.policy.findMany).not.toHaveBeenCalled();
    });

    test('should handle user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const payload: WebhookPayload = {
        event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { userId: 'nonexistent' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      expect(getUserContext(result.data)).toBeUndefined();
    });
  });

  describe('policy enrichment helpers', () => {
    test('should resolve wildcard matcher', async () => {
      mockPrisma.user.count.mockResolvedValue(25);
      mockPrisma.agent.count.mockResolvedValue(10);

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['*'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const resolvedMatchers = getResolvedMatchers(result.data);
      const impact = getImpact(result.data);
      expect(resolvedMatchers?.[0]?.type).toBe('wildcard');
      expect(resolvedMatchers?.[0]?.targetName).toBe('All users');
      expect(impact?.affectedUserCount).toBe(25);
      expect(impact?.affectedAgentCount).toBe(10);
    });

    test('should resolve role matcher', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        name: 'Developer',
        userRoles: [{ id: '1' }, { id: '2' }, { id: '3' }],
      });
      mockPrisma.userRole.count.mockResolvedValue(3);

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['role:Developer'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const resolvedMatchers = getResolvedMatchers(result.data);
      expect(resolvedMatchers?.[0]?.type).toBe('role');
      expect(resolvedMatchers?.[0]?.targetName).toBe('Developer');
      expect(resolvedMatchers?.[0]?.affectedCount).toBe(3);
    });

    test('should resolve agent matcher', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        name: 'TestAgent',
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['agent:TestAgent'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const resolvedMatchers = getResolvedMatchers(result.data);
      expect(resolvedMatchers?.[0]?.type).toBe('agent');
      expect(resolvedMatchers?.[0]?.targetName).toBe('TestAgent');
      expect(resolvedMatchers?.[0]?.affectedCount).toBe(1);
    });

    test('should resolve user matcher', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        email: 'dev@example.com',
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['user:dev@example.com'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const resolvedMatchers = getResolvedMatchers(result.data);
      expect(resolvedMatchers?.[0]?.type).toBe('user');
      expect(resolvedMatchers?.[0]?.targetName).toBe('dev@example.com');
    });

    test('should handle unknown matcher type', async () => {
      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['invalid:matcher'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const resolvedMatchers = getResolvedMatchers(result.data);
      expect(resolvedMatchers?.[0]?.type).toBe('unknown');
      expect(resolvedMatchers?.[0]?.targetName).toBeNull();
    });

    test('should resolve tool patterns with server info', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        name: 'GitHub',
        _count: { tools: 15 },
      });

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { toolPatterns: ['github.com::*'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const resolvedToolPatterns = getResolvedToolPatterns(result.data);
      expect(resolvedToolPatterns?.[0]?.serverName).toBe('GitHub');
      expect(resolvedToolPatterns?.[0]?.isWildcard).toBe(true);
      expect(resolvedToolPatterns?.[0]?.matchedToolCount).toBe(15);
    });

    test('should handle tool pattern without server match', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { toolPatterns: ['unknown.server::tool'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const resolvedToolPatterns = getResolvedToolPatterns(result.data);
      expect(resolvedToolPatterns?.[0]?.serverName).toBeNull();
      expect(resolvedToolPatterns?.[0]?.isWildcard).toBe(false);
      expect(resolvedToolPatterns?.[0]?.matchedToolCount).toBe(1);
    });
  });

  describe('calculatePolicyImpact', () => {
    test('should count affected users from role matcher', async () => {
      mockPrisma.userRole.count.mockResolvedValue(5);

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['role:Admin', 'role:Developer'] },
      };

      // Need to mock both role lookups for resolveMatchers
      mockPrisma.role.findFirst
        .mockResolvedValueOnce({ name: 'Admin', userRoles: [{ id: '1' }] })
        .mockResolvedValueOnce({ name: 'Developer', userRoles: [{ id: '2' }, { id: '3' }] });
      mockPrisma.userRole.count
        .mockResolvedValueOnce(1) // Admin users
        .mockResolvedValueOnce(2); // Developer users

      const result = await enrichPayloadIfVerbose(payload, true);

      const impact = getImpact(result.data);
      expect(impact?.affectedUserCount).toBe(3);
      expect(impact?.affectedAgentCount).toBe(0);
    });

    test('should count agents from agent matcher', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({ name: 'Agent1' });

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['agent:Agent1', 'agent:Agent2'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const impact = getImpact(result.data);
      expect(impact?.affectedAgentCount).toBe(2);
    });

    test('should count users from user matcher', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ email: 'user@example.com' });

      const payload: WebhookPayload = {
        event: WebhookEvent.POLICY_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { matchers: ['user:user1@example.com', 'user:user2@example.com'] },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const impact = getImpact(result.data);
      expect(impact?.affectedUserCount).toBe(2);
    });
  });

  describe('matchesWildcard (via agent enrichment)', () => {
    test('should match agent patterns with wildcard', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'p1',
          slug: 'wildcard-policy',
          matchers: ['agent:Test*'],
          toolPatterns: ['*::*'],
          effect: 'ALLOW',
        },
      ]);
      mockPrisma.agent.count.mockResolvedValue(1);

      const payload: WebhookPayload = {
        event: WebhookEvent.AGENT_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { agentId: 'a1', agentName: 'TestBot' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const applicablePolicies = getApplicablePolicies(result.data);
      expect(applicablePolicies).toBeDefined();
      expect(applicablePolicies?.some((p) => p.slug === 'wildcard-policy')).toBe(true);
    });

    test('should match exact agent name', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'p1',
          slug: 'exact-policy',
          matchers: ['agent:ExactAgent'],
          toolPatterns: ['*::*'],
          effect: 'ALLOW',
        },
      ]);
      mockPrisma.agent.count.mockResolvedValue(1);

      const payload: WebhookPayload = {
        event: WebhookEvent.AGENT_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { agentId: 'a1', agentName: 'ExactAgent' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const applicablePolicies = getApplicablePolicies(result.data);
      expect(applicablePolicies?.some((p) => p.slug === 'exact-policy')).toBe(true);
    });

    test('should not match when pattern does not include wildcard and value differs', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'p1',
          slug: 'exact-policy',
          matchers: ['agent:SpecificAgent'],
          toolPatterns: ['*::*'],
          effect: 'ALLOW',
        },
      ]);
      mockPrisma.agent.count.mockResolvedValue(1);

      const payload: WebhookPayload = {
        event: WebhookEvent.AGENT_CREATED,
        organizationId: 'org-1',
        timestamp: new Date().toISOString(),
        data: { agentId: 'a1', agentName: 'DifferentAgent' },
      };

      const result = await enrichPayloadIfVerbose(payload, true);

      const applicablePolicies = getApplicablePolicies(result.data);
      expect(applicablePolicies).toBeDefined();
      expect(applicablePolicies?.some((p) => p.slug === 'exact-policy')).toBe(false);
    });
  });

  describe('additional branch coverage tests', () => {
    describe('fetchFlagConfig edge cases', () => {
      test('should handle flag not found in database', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'nonexistent-flag' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getFlagConfig(result.data)).toBeUndefined();
      });

      test('should handle rate limit config with null values', async () => {
        // When rateLimitConfig is not valid JSON, safePrismaJson returns null
        // which results in rateLimit being null in the result
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['LOG'],
          rateLimitConfig: null, // Null rate limit config
          approvalConfig: null,
          createdAt: new Date(),
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const flagConfig = getFlagConfig(result.data);
        expect(flagConfig).toBeDefined();
        expect(flagConfig?.rateLimit).toBeNull();
      });

      test('should handle approval config with null values', async () => {
        // When approvalConfig is not valid JSON, safePrismaJson returns null
        // which results in approvalConfig being null in the result
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['APPROVAL'],
          approvalConfig: null, // Null approval config
        });
        mockPrisma.user.findFirst.mockResolvedValue(null); // No user found

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_APPROVAL_NEEDED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const flagConfig = getFlagConfig(result.data);
        expect(flagConfig).toBeDefined();
        expect(flagConfig?.approvalConfig).toBeNull();
      });
    });

    describe('context-based flag config options', () => {
      test('should include rateLimit from context when requested', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        const context = {
          organizationId: 'org-1',
          sensitiveFlag: {
            id: 'flag-1',
            toolPattern: 'test::*',
            description: 'Test',
            behaviors: ['RATE_LIMIT'],
            rateLimit: { maxPerSession: 20, windowMinutes: 45 },
            approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 600 },
            createdAt: new Date(),
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const flagConfig = getFlagConfig(result.data);
        expect(flagConfig?.rateLimit?.maxPerSession).toBe(20);
        expect(flagConfig?.rateLimit?.windowMinutes).toBe(45);
        expect(mockPrisma.sensitiveToolFlag.findFirst).not.toHaveBeenCalled();
      });

      test('should fetch from database when no context and flagId present', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'db::*',
          description: 'From DB',
          behaviors: ['LOG'],
          rateLimitConfig: { maxPerSession: 5, windowMinutes: 30 },
          approvalConfig: null,
          createdAt: new Date(),
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(mockPrisma.sensitiveToolFlag.findFirst).toHaveBeenCalled();
        expect(getFlagConfig(result.data)?.toolPattern).toBe('db::*');
      });
    });

    describe('filterPoliciesByAgentMatcher edge cases', () => {
      test('should handle policies with non-array matchers', async () => {
        mockPrisma.policy.findMany.mockResolvedValue([
          {
            id: 'p1',
            slug: 'bad-policy',
            matchers: 'not-an-array' as unknown, // Invalid matchers type
            effect: 'ALLOW',
          },
          {
            id: 'p2',
            slug: 'good-policy',
            matchers: ['agent:TestAgent'],
            effect: 'ALLOW',
          },
        ]);
        mockPrisma.agent.count.mockResolvedValue(1);

        const payload: WebhookPayload = {
          event: WebhookEvent.AGENT_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { agentId: 'a1', agentName: 'TestAgent' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const applicablePolicies = getApplicablePolicies(result.data);
        expect(applicablePolicies).toBeDefined();
        // Should filter out the policy with non-array matchers
        expect(applicablePolicies?.some((p) => p.slug === 'bad-policy')).toBe(false);
        expect(applicablePolicies?.some((p) => p.slug === 'good-policy')).toBe(true);
      });

      test('should handle policies with mixed matcher types (non-string in array)', async () => {
        mockPrisma.policy.findMany.mockResolvedValue([
          {
            id: 'p1',
            slug: 'mixed-policy',
            matchers: ['agent:TestAgent', 123, null, 'role:Admin'],
            effect: 'ALLOW',
          },
        ]);
        mockPrisma.agent.count.mockResolvedValue(1);

        const payload: WebhookPayload = {
          event: WebhookEvent.AGENT_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { agentId: 'a1', agentName: 'TestAgent' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const applicablePolicies = getApplicablePolicies(result.data);
        // Should still find the policy because valid agent matcher exists
        expect(applicablePolicies?.some((p) => p.slug === 'mixed-policy')).toBe(true);
      });
    });

    describe('addServerContext edge cases', () => {
      test('should not add server context when server not found', async () => {
        mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { toolName: 'unknown-server::some_tool' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getServerContext(result.data)).toBeUndefined();
      });

      test('should not add server context when toolName is missing', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {},
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getServerContext(result.data)).toBeUndefined();
        expect(mockPrisma.mcpServer.findFirst).not.toHaveBeenCalled();
      });
    });

    describe('addAgentOverride edge cases', () => {
      test('should not add agent override when override not found', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['LOG'],
          rateLimitConfig: null,
          approvalConfig: null,
          createdAt: new Date(),
        });
        mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1', agentId: 'agent-1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getAgentOverride(result.data)).toBeUndefined();
      });

      test('should not query for agent override when agentId is missing', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['LOG'],
          rateLimitConfig: null,
          approvalConfig: null,
          createdAt: new Date(),
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' }, // No agentId
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(mockPrisma.sensitiveFlagAgentOverride.findFirst).not.toHaveBeenCalled();
        expect(getAgentOverride(result.data)).toBeUndefined();
      });

      test('should not query for agent override when flagId is missing', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { agentId: 'agent-1' }, // No flagId
        };

        await enrichPayloadIfVerbose(payload, true);

        expect(mockPrisma.sensitiveFlagAgentOverride.findFirst).not.toHaveBeenCalled();
      });
    });

    describe('enrichSensitiveApprovalPayload edge cases', () => {
      test('should handle flag config not found', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);
        mockPrisma.user.findFirst.mockResolvedValue(null); // No user found either

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_APPROVAL_NEEDED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'nonexistent-flag', userId: 'u1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getFlagConfig(result.data)).toBeUndefined();
      });
    });

    describe('enrichSensitiveRateLimitedPayload edge cases', () => {
      test('should handle flag config not found', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_RATE_LIMITED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'nonexistent-flag' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getFlagConfig(result.data)).toBeUndefined();
      });

      test('should not include rate limit context when not provided', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['RATE_LIMIT'],
          rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_RATE_LIMITED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        // No context provided
        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getRateLimitContext(result.data)).toBeUndefined();
      });
    });

    describe('addBasicUserContext edge cases', () => {
      test('should handle user not found', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['RATE_LIMIT'],
          rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        });
        mockPrisma.user.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_RATE_LIMITED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1', userId: 'nonexistent-user' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getUserContext(result.data)).toBeUndefined();
      });

      test('should handle missing userId', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['RATE_LIMIT'],
          rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_RATE_LIMITED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' }, // No userId
        };

        await enrichPayloadIfVerbose(payload, true);

        expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      });
    });

    describe('enrichPolicyUpdatedPayload edge cases', () => {
      test('should handle missing beforeSnapshot', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            effect: 'DENY',
          },
        };

        // No context provided
        const result = await enrichPayloadIfVerbose(payload, true);

        // Should still work but without diff
        expect(getDiff(result.data)).toBeUndefined();
        expect(getMatcherChanges(result.data)).toBeUndefined();
      });

      test('should handle changes being null', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            effect: 'DENY',
            changes: null,
          },
        };

        const context = {
          organizationId: 'org-1',
          beforeSnapshot: {
            slug: 'test-policy',
            matchers: ['role:Developer'],
            toolPatterns: ['*::*'],
            effect: 'ALLOW',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const diff = getDiff(result.data);
        expect(diff).toBeDefined();
        expect(diff?.changedFields).toEqual([]);
      });

      test('should handle changes being a non-object', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            effect: 'DENY',
            changes: 'not-an-object',
          },
        };

        const context = {
          organizationId: 'org-1',
          beforeSnapshot: {
            slug: 'test-policy',
            matchers: ['role:Developer'],
            toolPatterns: ['*::*'],
            effect: 'ALLOW',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const diff = getDiff(result.data);
        expect(diff?.changedFields).toEqual([]);
      });

      test('should handle missing matchers in before snapshot', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            effect: 'DENY',
            changes: { matchers: ['role:Admin'] },
          },
        };

        const context = {
          organizationId: 'org-1',
          beforeSnapshot: {
            slug: 'test-policy',
            // matchers missing
            toolPatterns: ['*::*'],
            effect: 'ALLOW',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const matcherChanges = getMatcherChanges(result.data);
        expect(matcherChanges).toBeDefined();
        expect(matcherChanges?.added).toContain('role:Admin');
      });

      test('should handle missing toolPatterns in before snapshot', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            matchers: ['role:Admin'],
            toolPatterns: ['github::*'],
            effect: 'DENY',
            changes: { toolPatterns: ['github::*'] },
          },
        };

        const context = {
          organizationId: 'org-1',
          beforeSnapshot: {
            slug: 'test-policy',
            matchers: ['role:Admin'],
            // toolPatterns missing
            effect: 'ALLOW',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const toolPatternChanges = result.data['toolPatternChanges'];
        expect(toolPatternChanges).toBeDefined();
      });
    });

    describe('enrichPolicyDeletedPayload edge cases', () => {
      test('should handle empty matchers', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_DELETED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'deleted-policy',
            matchers: [], // Empty matchers
            toolPatterns: ['*::*'],
            effect: 'DENY',
            description: 'Test',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const impact = getImpact(result.data);
        expect(impact).toBeDefined();
        expect(impact?.affectedUserCount).toBe(0);
        expect(impact?.affectedAgentCount).toBe(0);
      });

      test('should handle missing matchers', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_DELETED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'deleted-policy',
            // matchers missing
            toolPatterns: ['*::*'],
            effect: 'DENY',
            description: 'Test',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const impact = getImpact(result.data);
        expect(impact?.affectedUserCount).toBe(0);
      });
    });

    describe('enrichAgentDeletedPayload edge cases', () => {
      test('should handle missing agentName', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.AGENT_DELETED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { agentId: 'agent-1' }, // No agentName
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        expect(getAffectedPolicies(result.data)).toBeUndefined();
        expect(mockPrisma.policy.findMany).not.toHaveBeenCalled();
      });
    });

    describe('resolveSingleMatcher edge cases', () => {
      test('should handle role not found', async () => {
        mockPrisma.role.findFirst.mockResolvedValue(null);
        mockPrisma.userRole.count.mockResolvedValue(0);

        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { matchers: ['role:NonexistentRole'] },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const resolvedMatchers = getResolvedMatchers(result.data);
        expect(resolvedMatchers?.[0]?.type).toBe('role');
        expect(resolvedMatchers?.[0]?.targetName).toBe('NonexistentRole');
        expect(resolvedMatchers?.[0]?.affectedCount).toBe(0);
      });

      test('should handle agent not found', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { matchers: ['agent:NonexistentAgent'] },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const resolvedMatchers = getResolvedMatchers(result.data);
        expect(resolvedMatchers?.[0]?.type).toBe('agent');
        expect(resolvedMatchers?.[0]?.targetName).toBe('NonexistentAgent');
        expect(resolvedMatchers?.[0]?.affectedCount).toBe(0);
      });

      test('should handle user not found', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { matchers: ['user:nonexistent@example.com'] },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const resolvedMatchers = getResolvedMatchers(result.data);
        expect(resolvedMatchers?.[0]?.type).toBe('user');
        expect(resolvedMatchers?.[0]?.targetName).toBe('nonexistent@example.com');
        expect(resolvedMatchers?.[0]?.affectedCount).toBe(0);
      });
    });

    describe('resolveToolPatterns edge cases', () => {
      test('should handle tool pattern without explicit tool part', async () => {
        mockPrisma.mcpServer.findFirst.mockResolvedValue({
          name: 'GitHub',
          _count: { tools: 10 },
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { toolPatterns: ['github.com'] }, // No :: separator, no tool part
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const resolvedToolPatterns = getResolvedToolPatterns(result.data);
        expect(resolvedToolPatterns?.[0]?.isWildcard).toBe(true); // Default tool part is *
      });

      test('should detect wildcard in pattern string', async () => {
        mockPrisma.mcpServer.findFirst.mockResolvedValue({
          name: 'GitHub',
          _count: { tools: 10 },
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { toolPatterns: ['github*::create_issue'] }, // Wildcard in server part
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const resolvedToolPatterns = getResolvedToolPatterns(result.data);
        expect(resolvedToolPatterns?.[0]?.isWildcard).toBe(true);
      });

      test('should handle specific tool without wildcards', async () => {
        mockPrisma.mcpServer.findFirst.mockResolvedValue({
          name: 'GitHub',
          _count: { tools: 10 },
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { toolPatterns: ['github.com::create_issue'] }, // No wildcard
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const resolvedToolPatterns = getResolvedToolPatterns(result.data);
        expect(resolvedToolPatterns?.[0]?.isWildcard).toBe(false);
        expect(resolvedToolPatterns?.[0]?.matchedToolCount).toBe(1);
      });

      test('should handle server not found with wildcard tool', async () => {
        mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { toolPatterns: ['unknown::*'] },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const resolvedToolPatterns = getResolvedToolPatterns(result.data);
        expect(resolvedToolPatterns?.[0]?.serverName).toBeNull();
        expect(resolvedToolPatterns?.[0]?.isWildcard).toBe(true);
        expect(resolvedToolPatterns?.[0]?.matchedToolCount).toBe(0);
      });
    });

    describe('fetchUserWithRoles edge cases', () => {
      test('should include isAdmin when requested for tool invocation', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({
          id: 'u1',
          email: 'admin@example.com',
          userRoles: [{ role: { id: 'r1', name: 'Admin', isAdmin: true } }],
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.TOOL_INVOCATION_ALLOWED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { userId: 'u1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const userContext = getUserContext(result.data);
        expect(userContext).toBeDefined();
        expect(userContext?.roles).toBeDefined();
      });
    });

    describe('computeArrayChanges edge cases', () => {
      test('should correctly identify all unchanged items', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            matchers: ['role:Admin', 'role:Developer'],
            toolPatterns: ['*::*'],
            effect: 'DENY',
            changes: { effect: 'DENY' },
          },
        };

        const context = {
          organizationId: 'org-1',
          beforeSnapshot: {
            slug: 'test-policy',
            matchers: ['role:Admin', 'role:Developer'], // Same matchers
            toolPatterns: ['*::*'],
            effect: 'ALLOW',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const matcherChanges = getMatcherChanges(result.data);
        expect(matcherChanges?.added).toEqual([]);
        expect(matcherChanges?.removed).toEqual([]);
      });
    });

    describe('safePrismaJson null-coalescing paths', () => {
      test('should handle rate limit config with valid JSON but missing fields', async () => {
        // When rateLimitConfig has missing fields, defaults to 0
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['RATE_LIMIT'],
          rateLimitConfig: {}, // Empty object - no maxPerSession or windowMinutes
          approvalConfig: null,
          createdAt: new Date(),
        });

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const flagConfig = getFlagConfig(result.data);
        expect(flagConfig).toBeDefined();
        expect(flagConfig?.rateLimit?.maxPerSession).toBe(0);
        expect(flagConfig?.rateLimit?.windowMinutes).toBe(0);
      });

      test('should handle approval config with valid JSON but missing fields', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
          id: 'flag-1',
          toolPattern: 'test::*',
          description: 'Test',
          behaviors: ['APPROVAL'],
          approvalConfig: {}, // Empty object - no allowedApprovers or timeoutSeconds
        });
        mockPrisma.user.findFirst.mockResolvedValue(null);

        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_APPROVAL_NEEDED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const flagConfig = getFlagConfig(result.data);
        expect(flagConfig).toBeDefined();
        expect(flagConfig?.approvalConfig?.allowedApprovers).toEqual([]);
        expect(flagConfig?.approvalConfig?.timeoutSeconds).toBe(0);
      });
    });

    describe('context flag without optional configs', () => {
      test('should handle context sensitiveFlag without rateLimit when includeRateLimit requested', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_TOOL_INVOKED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1' },
        };

        const context = {
          organizationId: 'org-1',
          sensitiveFlag: {
            id: 'flag-1',
            toolPattern: 'test::*',
            description: 'Test',
            behaviors: ['LOG'],
            rateLimit: null, // No rate limit
            approvalConfig: null,
            createdAt: new Date(),
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const flagConfig = getFlagConfig(result.data);
        expect(flagConfig).toBeDefined();
        expect(flagConfig?.rateLimit).toBeNull();
        expect(mockPrisma.sensitiveToolFlag.findFirst).not.toHaveBeenCalled();
      });
    });

    describe('policy diff with missing arrays in after data', () => {
      test('should handle missing matchers in after data', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            // matchers missing
            toolPatterns: ['*::*'],
            effect: 'DENY',
            changes: { effect: 'DENY' },
          },
        };

        const context = {
          organizationId: 'org-1',
          beforeSnapshot: {
            slug: 'test-policy',
            matchers: ['role:Developer'],
            toolPatterns: ['*::*'],
            effect: 'ALLOW',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const matcherChanges = getMatcherChanges(result.data);
        expect(matcherChanges).toBeDefined();
        expect(matcherChanges?.removed).toContain('role:Developer');
        expect(matcherChanges?.added).toEqual([]);
      });

      test('should handle missing toolPatterns in after data', async () => {
        const payload: WebhookPayload = {
          event: WebhookEvent.POLICY_UPDATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: {
            policySlug: 'test-policy',
            matchers: ['role:Admin'],
            // toolPatterns missing
            effect: 'DENY',
            changes: { effect: 'DENY' },
          },
        };

        const context = {
          organizationId: 'org-1',
          beforeSnapshot: {
            slug: 'test-policy',
            matchers: ['role:Admin'],
            toolPatterns: ['github::*'],
            effect: 'ALLOW',
          },
        };

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const toolPatternChanges = result.data['toolPatternChanges'];
        expect(toolPatternChanges).toBeDefined();
        if (isRecord(toolPatternChanges)) {
          expect(toolPatternChanges['removed']).toContain('github::*');
        }
      });
    });

    describe('matchesWildcard exact match paths', () => {
      test('should match agent with wildcard-only pattern via AGENT_CREATED', async () => {
        // Testing when pattern is exactly '*' in matchesWildcard
        mockPrisma.policy.findMany.mockResolvedValue([
          {
            id: 'p1',
            slug: 'global-policy',
            matchers: ['*'], // This tests the '*' branch in matchesWildcard
            toolPatterns: ['*::*'],
            effect: 'ALLOW',
          },
        ]);
        mockPrisma.agent.count.mockResolvedValue(1);

        const payload: WebhookPayload = {
          event: WebhookEvent.AGENT_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { agentId: 'a1', agentName: 'AnyAgent' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const applicablePolicies = getApplicablePolicies(result.data);
        expect(applicablePolicies).toBeDefined();
        expect(applicablePolicies?.some((p) => p.slug === 'global-policy')).toBe(true);
      });

      test('should match any agent with agent:* pattern', async () => {
        // Testing when pattern is 'agent:*' which makes matchesWildcard receive '*'
        mockPrisma.policy.findMany.mockResolvedValue([
          {
            id: 'p1',
            slug: 'all-agents-policy',
            matchers: ['agent:*'], // This makes matchesWildcard receive '*' as pattern
            toolPatterns: ['*::*'],
            effect: 'ALLOW',
          },
        ]);
        mockPrisma.agent.count.mockResolvedValue(1);

        const payload: WebhookPayload = {
          event: WebhookEvent.AGENT_CREATED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { agentId: 'a1', agentName: 'SomeRandomAgent' },
        };

        const result = await enrichPayloadIfVerbose(payload, true);

        const applicablePolicies = getApplicablePolicies(result.data);
        expect(applicablePolicies).toBeDefined();
        // Should match because agent:* matches any agent name
        expect(applicablePolicies?.some((p) => p.slug === 'all-agents-policy')).toBe(true);
      });
    });

    describe('getFlagConfigFromContextOrDb with includeRateLimit=false', () => {
      test('should not include rateLimit from context when includeRateLimit is false', async () => {
        // SENSITIVE_APPROVAL_NEEDED only requests includeApproval, not includeRateLimit
        const payload: WebhookPayload = {
          event: WebhookEvent.SENSITIVE_APPROVAL_NEEDED,
          organizationId: 'org-1',
          timestamp: new Date().toISOString(),
          data: { flagId: 'flag-1', userId: 'u1' },
        };

        const context = {
          organizationId: 'org-1',
          sensitiveFlag: {
            id: 'flag-1',
            toolPattern: 'test::*',
            description: 'Test',
            behaviors: ['APPROVAL'],
            rateLimit: { maxPerSession: 100, windowMinutes: 60 },
            approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
            createdAt: new Date(),
          },
        };

        mockPrisma.user.findFirst.mockResolvedValue({
          id: 'u1',
          email: 'test@example.com',
          userRoles: [{ role: { id: 'r1', name: 'User', isAdmin: false } }],
        });

        const result = await enrichPayloadIfVerbose(payload, true, context);

        const flagConfig = getFlagConfig(result.data);
        expect(flagConfig).toBeDefined();
        // SENSITIVE_APPROVAL_NEEDED does NOT request includeRateLimit
        // so rateLimit should NOT be included even though it's in context
        expect(flagConfig?.approvalConfig).toBeDefined();
        // rateLimit should be undefined since includeRateLimit=false
        expect(flagConfig?.rateLimit).toBeUndefined();
        expect(mockPrisma.sensitiveToolFlag.findFirst).not.toHaveBeenCalled();
      });
    });
  });
});
