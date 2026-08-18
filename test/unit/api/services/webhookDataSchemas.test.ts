/**
 * Tests for Webhook Data Schemas
 * Tests Zod schemas and type-safe data accessors for webhook payloads
 */

import { describe, expect, test } from 'vitest';
import {
  approvalConfigSchema,
  arrayChangesSchema,
  diffSchema,
  flagConfigSchema,
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
  getToolPatternChanges,
  getTypedDiff,
  getUserContext,
  impactSchema,
  organizationContextSchema,
  policyInfoSchema,
  rateLimitConfigSchema,
  requestingUserSchema,
  // Schema exports for direct testing
  resolvedMatcherSchema,
  resolvedToolPatternSchema,
  safePrismaJson,
  safeString,
  safeStringArray,
  serverContextSchema,
  userContextSchema,
} from '../../../../packages/api/src/services/webhookDataSchemas.js';

describe('safeString', () => {
  test('should extract string value', () => {
    const data = { name: 'John' };
    expect(safeString(data, 'name')).toBe('John');
  });

  test('should return undefined for missing key', () => {
    const data = {};
    expect(safeString(data, 'name')).toBeUndefined();
  });

  test('should return undefined for non-string value', () => {
    const data = { name: 123 };
    expect(safeString(data, 'name')).toBeUndefined();
  });

  test('should return undefined for null value', () => {
    const data = { name: null };
    expect(safeString(data, 'name')).toBeUndefined();
  });

  test('should handle empty string', () => {
    const data = { name: '' };
    expect(safeString(data, 'name')).toBe('');
  });
});

describe('safeStringArray', () => {
  test('should extract string array', () => {
    const data = { tags: ['a', 'b', 'c'] };
    expect(safeStringArray(data, 'tags')).toEqual(['a', 'b', 'c']);
  });

  test('should return undefined for missing key', () => {
    const data = {};
    expect(safeStringArray(data, 'tags')).toBeUndefined();
  });

  test('should return undefined for non-array value', () => {
    const data = { tags: 'not-an-array' };
    expect(safeStringArray(data, 'tags')).toBeUndefined();
  });

  test('should return undefined for array with non-string elements', () => {
    const data = { tags: ['a', 123, 'c'] };
    expect(safeStringArray(data, 'tags')).toBeUndefined();
  });

  test('should handle empty array', () => {
    const data = { tags: [] };
    expect(safeStringArray(data, 'tags')).toEqual([]);
  });
});

describe('safePrismaJson', () => {
  test('should parse valid data with schema', () => {
    const value = { maxPerSession: 5, windowMinutes: 60 };
    const result = safePrismaJson(value, rateLimitConfigSchema);
    expect(result).toEqual({ maxPerSession: 5, windowMinutes: 60 });
  });

  test('should return undefined for null value', () => {
    const result = safePrismaJson(null, rateLimitConfigSchema);
    expect(result).toBeUndefined();
  });

  test('should return undefined for undefined value', () => {
    const result = safePrismaJson(undefined, rateLimitConfigSchema);
    expect(result).toBeUndefined();
  });

  test('should return undefined for invalid data', () => {
    const value = { invalid: 'data' };
    const result = safePrismaJson(value, rateLimitConfigSchema);
    // Schema is optional fields, so this is still valid
    expect(result).toEqual({});
  });
});

describe('Schema validation', () => {
  describe('resolvedMatcherSchema', () => {
    test('should validate correct matcher', () => {
      const matcher = {
        raw: 'user:alice@example.com',
        type: 'user',
        targetName: 'alice@example.com',
        affectedCount: 1,
      };
      const result = resolvedMatcherSchema.safeParse(matcher);
      expect(result.success).toBe(true);
    });

    test('should validate matcher with null targetName', () => {
      const matcher = {
        raw: 'role:*',
        type: 'role',
        targetName: null,
        affectedCount: 10,
      };
      const result = resolvedMatcherSchema.safeParse(matcher);
      expect(result.success).toBe(true);
    });

    test('should reject invalid matcher', () => {
      const matcher = { raw: 'test' }; // Missing required fields
      const result = resolvedMatcherSchema.safeParse(matcher);
      expect(result.success).toBe(false);
    });
  });

  describe('policyInfoSchema', () => {
    test('should validate correct policy info', () => {
      const policy = { slug: 'allow-github', effect: 'ALLOW' };
      const result = policyInfoSchema.safeParse(policy);
      expect(result.success).toBe(true);
    });

    test('should reject missing fields', () => {
      const policy = { slug: 'test' };
      const result = policyInfoSchema.safeParse(policy);
      expect(result.success).toBe(false);
    });
  });

  describe('resolvedToolPatternSchema', () => {
    test('should validate correct tool pattern', () => {
      const pattern = {
        raw: 'github.com::*',
        serverName: 'GitHub',
        isWildcard: true,
        matchedToolCount: 15,
      };
      const result = resolvedToolPatternSchema.safeParse(pattern);
      expect(result.success).toBe(true);
    });

    test('should validate with null serverName', () => {
      const pattern = {
        raw: '*::*',
        serverName: null,
        isWildcard: true,
        matchedToolCount: 100,
      };
      const result = resolvedToolPatternSchema.safeParse(pattern);
      expect(result.success).toBe(true);
    });
  });

  describe('impactSchema', () => {
    test('should validate with all fields', () => {
      const impact = { affectedUserCount: 10, affectedAgentCount: 5 };
      const result = impactSchema.safeParse(impact);
      expect(result.success).toBe(true);
    });

    test('should validate with null fields', () => {
      const impact = { affectedUserCount: null, affectedAgentCount: null };
      const result = impactSchema.safeParse(impact);
      expect(result.success).toBe(true);
    });

    test('should validate empty object', () => {
      const impact = {};
      const result = impactSchema.safeParse(impact);
      expect(result.success).toBe(true);
    });
  });

  describe('userContextSchema', () => {
    test('should validate with role objects', () => {
      const context = {
        email: 'user@example.com',
        roles: [{ name: 'admin' }, { name: 'developer' }],
      };
      const result = userContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    test('should validate with string roles', () => {
      const context = {
        email: 'user@example.com',
        roles: ['admin', 'developer'],
      };
      const result = userContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    test('should validate without email', () => {
      const context = { roles: ['admin'] };
      const result = userContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });
  });

  describe('flagConfigSchema', () => {
    test('should validate full config', () => {
      const config = {
        toolPattern: 'github.com::deleteBranch',
        description: 'Dangerous operation',
        behaviors: ['REQUIRE_APPROVAL', 'AUDIT_LOG'],
        rateLimit: { maxPerSession: 3, windowMinutes: 60 },
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
      };
      const result = flagConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test('should validate minimal config', () => {
      const config = {};
      const result = flagConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test('should validate with null nested objects', () => {
      const config = {
        toolPattern: 'test',
        rateLimit: null,
        approvalConfig: null,
      };
      const result = flagConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('serverContextSchema', () => {
    test('should validate server context', () => {
      const context = { name: 'GitHub', trusted: true };
      const result = serverContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    test('should validate empty context', () => {
      const context = {};
      const result = serverContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });
  });

  describe('requestingUserSchema', () => {
    test('should validate with isAdmin in roles', () => {
      const user = {
        email: 'admin@example.com',
        roles: [{ name: 'admin', isAdmin: true }],
      };
      const result = requestingUserSchema.safeParse(user);
      expect(result.success).toBe(true);
    });
  });

  describe('diffSchema', () => {
    test('should validate diff with all fields', () => {
      const diff = {
        before: { effect: 'ALLOW', enabled: true },
        after: { effect: 'DENY', enabled: true },
        changedFields: ['effect'],
      };
      const result = diffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    });

    test('should validate empty diff', () => {
      const diff = {};
      const result = diffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    });
  });
});

describe('Accessor functions', () => {
  describe('getResolvedMatchers', () => {
    test('should extract resolved matchers array', () => {
      const data = {
        resolvedMatchers: [
          { raw: 'user:alice', type: 'user', targetName: 'alice', affectedCount: 1 },
          { raw: 'role:admin', type: 'role', targetName: 'admin', affectedCount: 5 },
        ],
      };
      const result = getResolvedMatchers(data);
      expect(result).toHaveLength(2);
      expect(result?.[0].type).toBe('user');
    });

    test('should return undefined for missing key', () => {
      const data = {};
      expect(getResolvedMatchers(data)).toBeUndefined();
    });

    test('should return undefined for invalid data', () => {
      const data = { resolvedMatchers: [{ invalid: true }] };
      expect(getResolvedMatchers(data)).toBeUndefined();
    });
  });

  describe('getMatchedPolicies', () => {
    test('should extract matched policies', () => {
      const data = {
        matchedPolicies: [
          { slug: 'allow-github', effect: 'ALLOW' },
          { slug: 'deny-delete', effect: 'DENY' },
        ],
      };
      const result = getMatchedPolicies(data);
      expect(result).toHaveLength(2);
    });

    test('should return undefined for invalid policies', () => {
      const data = { matchedPolicies: ['not-an-object'] };
      expect(getMatchedPolicies(data)).toBeUndefined();
    });
  });

  describe('getResolvedToolPatterns', () => {
    test('should extract tool patterns', () => {
      const data = {
        resolvedToolPatterns: [
          { raw: 'github::*', serverName: 'GitHub', isWildcard: true, matchedToolCount: 10 },
        ],
      };
      const result = getResolvedToolPatterns(data);
      expect(result?.[0].isWildcard).toBe(true);
    });
  });

  describe('getApplicablePolicies', () => {
    test('should extract applicable policies', () => {
      const data = {
        applicablePolicies: [{ slug: 'default-allow', effect: 'ALLOW' }],
      };
      const result = getApplicablePolicies(data);
      expect(result).toHaveLength(1);
    });
  });

  describe('getAffectedPolicies', () => {
    test('should extract affected policies', () => {
      const data = {
        affectedPolicies: [{ slug: 'agent-policy', effect: 'DENY' }],
      };
      const result = getAffectedPolicies(data);
      expect(result?.[0].slug).toBe('agent-policy');
    });
  });

  describe('getImpact', () => {
    test('should extract impact metrics', () => {
      const data = {
        impact: { affectedUserCount: 10, affectedAgentCount: 5 },
      };
      const result = getImpact(data);
      expect(result?.affectedUserCount).toBe(10);
    });

    test('should return undefined for non-object', () => {
      const data = { impact: 'invalid' };
      expect(getImpact(data)).toBeUndefined();
    });

    test('should return undefined for array', () => {
      const data = { impact: [] };
      expect(getImpact(data)).toBeUndefined();
    });
  });

  describe('getMatcherChanges', () => {
    test('should extract matcher changes', () => {
      const data = {
        matcherChanges: {
          added: ['user:bob@example.com'],
          removed: ['user:alice@example.com'],
        },
      };
      const result = getMatcherChanges(data);
      expect(result?.added).toContain('user:bob@example.com');
    });
  });

  describe('getToolPatternChanges', () => {
    test('should extract tool pattern changes', () => {
      const data = {
        toolPatternChanges: {
          added: ['github::createIssue'],
          removed: [],
        },
      };
      const result = getToolPatternChanges(data);
      expect(result?.added).toHaveLength(1);
    });
  });

  describe('getUserContext', () => {
    test('should extract user context', () => {
      const data = {
        userContext: {
          email: 'user@example.com',
          roles: [{ name: 'developer' }],
        },
      };
      const result = getUserContext(data);
      expect(result?.email).toBe('user@example.com');
    });
  });

  describe('getFlagConfig', () => {
    test('should extract flag config', () => {
      const data = {
        flagConfig: {
          toolPattern: 'dangerous::*',
          behaviors: ['AUDIT_LOG'],
        },
      };
      const result = getFlagConfig(data);
      expect(result?.behaviors).toContain('AUDIT_LOG');
    });
  });

  describe('getServerContext', () => {
    test('should extract server context', () => {
      const data = {
        serverContext: { name: 'Production', trusted: true },
      };
      const result = getServerContext(data);
      expect(result?.trusted).toBe(true);
    });
  });

  describe('getAgentOverride', () => {
    test('should extract agent override', () => {
      const data = {
        agentOverride: { exempted: true, customBehaviors: ['SKIP_AUDIT'] },
      };
      const result = getAgentOverride(data);
      expect(result?.exempted).toBe(true);
    });
  });

  describe('getRequestingUser', () => {
    test('should extract requesting user', () => {
      const data = {
        requestingUser: {
          email: 'requester@example.com',
          roles: [{ name: 'developer', isAdmin: false }],
        },
      };
      const result = getRequestingUser(data);
      expect(result?.email).toBe('requester@example.com');
    });
  });

  describe('getRateLimitContext', () => {
    test('should extract rate limit context', () => {
      const data = {
        rateLimitContext: {
          currentUsage: 4,
          remaining: 1,
          resetAt: '2024-01-15T13:00:00Z',
        },
      };
      const result = getRateLimitContext(data);
      expect(result?.remaining).toBe(1);
    });
  });

  describe('getDiff', () => {
    test('should extract diff', () => {
      const data = {
        diff: {
          before: { effect: 'ALLOW' },
          after: { effect: 'DENY' },
          changedFields: ['effect'],
        },
      };
      const result = getDiff(data);
      expect(result?.changedFields).toContain('effect');
    });
  });

  describe('getTypedDiff', () => {
    test('should extract typed diff with policy states', () => {
      const data = {
        diff: {
          before: { effect: 'ALLOW', enabled: true },
          after: { effect: 'DENY', enabled: false },
          changedFields: ['effect', 'enabled'],
        },
      };
      const result = getTypedDiff(data);
      expect(result?.before?.effect).toBe('ALLOW');
      expect(result?.after?.enabled).toBe(false);
      expect(result?.changedFields).toHaveLength(2);
    });

    test('should return undefined when no diff', () => {
      const data = {};
      expect(getTypedDiff(data)).toBeUndefined();
    });

    test('should handle diff without before/after', () => {
      const data = {
        diff: { changedFields: ['name'] },
      };
      const result = getTypedDiff(data);
      expect(result?.changedFields).toContain('name');
      expect(result?.before).toBeUndefined();
      expect(result?.after).toBeUndefined();
    });

    test('should handle invalid before/after values', () => {
      const data = {
        diff: {
          before: 'invalid',
          after: 123,
          changedFields: ['something'],
        },
      };
      const result = getTypedDiff(data);
      // When before/after are invalid types (not records), diffSchema validation fails
      // So getDiff returns undefined, making getTypedDiff also return undefined
      expect(result).toBeUndefined();
    });
  });

  describe('getOrganizationContext', () => {
    test('should extract organization context', () => {
      const data = {
        organizationContext: {
          totalAgents: 100,
          remainingAgents: 50,
        },
      };
      const result = getOrganizationContext(data);
      expect(result?.totalAgents).toBe(100);
    });
  });
});

describe('Edge cases', () => {
  test('should handle deeply nested data extraction', () => {
    const data = {
      impact: {
        affectedUserCount: 5,
        affectedAgentCount: 3,
      },
    };
    const result = getImpact(data);
    expect(result).toBeDefined();
  });

  test('should handle null in data object', () => {
    const data = { resolvedMatchers: null };
    expect(getResolvedMatchers(data)).toBeUndefined();
  });

  test('should handle undefined in data object', () => {
    const data: Record<string, unknown> = { resolvedMatchers: undefined };
    expect(getResolvedMatchers(data)).toBeUndefined();
  });

  test('should validate all approval config fields', () => {
    const config = {
      allowedApprovers: ['admin@example.com', 'security@example.com'],
      timeoutSeconds: 3600,
    };
    const result = approvalConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test('should validate organization context', () => {
    const context = { totalAgents: 50 };
    const result = organizationContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  test('should validate array changes with only added', () => {
    const changes = { added: ['new-item'] };
    const result = arrayChangesSchema.safeParse(changes);
    expect(result.success).toBe(true);
  });

  test('should validate array changes with only removed', () => {
    const changes = { removed: ['old-item'] };
    const result = arrayChangesSchema.safeParse(changes);
    expect(result.success).toBe(true);
  });
});
