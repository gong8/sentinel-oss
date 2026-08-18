/**
 * Integration Tests: Policy Enforcement Edge Cases
 * CRITICAL: These tests verify security-critical policy behavior
 *
 * Focus Areas:
 * - DENY always wins over ALLOW (cannot be bypassed)
 * - Fail-closed behavior (no matching policy = DENIED)
 * - Wildcard pattern matching edge cases
 * - Matcher precedence rules
 * - Policy specificity and matching
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { evaluatePolicy } from '../../../../packages/api/src/services/policy.js';
import { PolicyEffect, prisma } from '../../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAgent,
  createTestPolicy,
  createTestRole,
  createTestUser,
} from '../../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../../helpers/tenant-isolation.js';

describe.skipIf(!hasDatabaseUrl())('Policy Enforcement Edge Cases', () => {
  let tenant: TestTenant;
  let userId: string;

  async function getUser() {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new Error('User not found');
    return user;
  }

  async function getPolicies() {
    return prisma.policy.findMany({
      where: { organizationId: tenant.orgId, enabled: true },
    });
  }

  beforeEach(async () => {
    tenant = await createTestTenant();
    await createTestRole({ organizationId: tenant.orgId, name: 'User', isAdmin: false });
    await createTestRole({ organizationId: tenant.orgId, name: 'Admin', isAdmin: true });
    const user = await createTestUser({ organizationId: tenant.orgId });
    userId = user.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // ============================================================================
  // DENY Always Wins (CRITICAL SECURITY)
  // ============================================================================

  describe('DENY always wins over ALLOW', () => {
    test('should DENY when DENY policy matches even with ALLOW for same tool', async () => {
      const user = await getUser();

      // Create ALLOW first
      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all-tools',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      // Create DENY for specific tool
      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-sensitive-tool',
        matchers: ['*'],
        toolPatterns: ['sensitive::delete'],
        effect: PolicyEffect.DENY,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'sensitive::delete' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should DENY when DENY is created after ALLOW', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      // Later DENY should still win regardless of creation order
      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-critical',
        matchers: ['*'],
        toolPatterns: ['critical::*'],
        effect: PolicyEffect.DENY,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'critical::action' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should DENY when user matches both ALLOW and DENY user matchers', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-user',
        matchers: [`user:${user.email}`],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-everyone',
        matchers: ['*'],
        toolPatterns: ['test::dangerous'],
        effect: PolicyEffect.DENY,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::dangerous' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should DENY when role has ALLOW but also DENY for specific tool', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-role',
        matchers: ['role:User'],
        toolPatterns: ['api::*'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-destructive',
        matchers: ['role:User'],
        toolPatterns: ['api::destroy'],
        effect: PolicyEffect.DENY,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'api::destroy' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should DENY even when ALLOW is more broad', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'broad-allow',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'specific-deny',
        matchers: ['*'],
        toolPatterns: ['nuclear::launch'],
        effect: PolicyEffect.DENY,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'nuclear::launch' }, policies);

      expect(result.decision).toBe('DENIED');
    });
  });

  // ============================================================================
  // Fail-Closed Behavior (CRITICAL SECURITY)
  // ============================================================================

  describe('Fail-closed behavior', () => {
    test('should DENY when no policies exist', async () => {
      const user = await getUser();
      const policies = await getPolicies();

      expect(policies.length).toBe(0);

      const result = await evaluatePolicy({ user, toolName: 'any::tool' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should DENY when policies exist but none match', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'unrelated-policy',
        matchers: ['role:NonExistentRole'],
        toolPatterns: ['other::tool'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should DENY when only disabled policies match', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'disabled-allow',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
        enabled: false,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::tool' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should DENY for unknown server', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-known-servers',
        matchers: ['*'],
        toolPatterns: ['known.server::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'unknown.server::tool' }, policies);

      expect(result.decision).toBe('DENIED');
    });
  });

  // ============================================================================
  // Wildcard Pattern Matching
  // ============================================================================

  describe('Wildcard pattern matching', () => {
    test('should match *::* for any server and tool', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();

      const result1 = await evaluatePolicy({ user, toolName: 'server1::tool1' }, policies);
      const result2 = await evaluatePolicy({ user, toolName: 'server2::tool2' }, policies);

      expect(result1.decision).toBe('ALLOWED');
      expect(result2.decision).toBe('ALLOWED');
    });

    test('should match server::* for any tool on specific server', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-server',
        matchers: ['*'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();

      const result1 = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, policies);
      const result2 = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, policies);
      const result3 = await evaluatePolicy({ user, toolName: 'gitlab.com::getFile' }, policies);

      expect(result1.decision).toBe('ALLOWED');
      expect(result2.decision).toBe('ALLOWED');
      expect(result3.decision).toBe('DENIED');
    });

    test('should match *::tool for specific tool on any server', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-read-tool',
        matchers: ['*'],
        toolPatterns: ['*::read'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();

      const result1 = await evaluatePolicy({ user, toolName: 'db::read' }, policies);
      const result2 = await evaluatePolicy({ user, toolName: 'api::read' }, policies);
      const result3 = await evaluatePolicy({ user, toolName: 'db::write' }, policies);

      expect(result1.decision).toBe('ALLOWED');
      expect(result2.decision).toBe('ALLOWED');
      expect(result3.decision).toBe('DENIED');
    });

    test('should NOT match partial server names', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-github',
        matchers: ['*'],
        toolPatterns: ['github::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'github.com::tool' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should handle special characters in tool names', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-specific',
        matchers: ['*'],
        toolPatterns: ['server::tool-with-dashes_and_underscores'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy(
        { user, toolName: 'server::tool-with-dashes_and_underscores' },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
    });
  });

  // ============================================================================
  // Matcher Precedence
  // ============================================================================

  describe('Matcher precedence', () => {
    test('should match * for any user', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-everyone',
        matchers: ['*'],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match role: for users with matching role', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-users',
        matchers: ['role:User'],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should NOT match role: for users without that role', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-admins',
        matchers: ['role:Admin'],
        toolPatterns: ['admin::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'admin::action' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should match user: for specific email', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-specific-user',
        matchers: [`user:${user.email}`],
        toolPatterns: ['personal::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'personal::data' }, policies);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should NOT match user: for different email', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-other-user',
        matchers: ['user:other@example.com'],
        toolPatterns: ['personal::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'personal::data' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should match agent: for specific agent', async () => {
      const user = await getUser();
      const agent = await createTestAgent({ organizationId: tenant.orgId });

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-agent',
        matchers: [`agent:${agent.id}`],
        toolPatterns: ['agent-only::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy(
        { user, agent, toolName: 'agent-only::action' },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
    });

    test('should require agent matcher when agent context present and matcher is agent-specific', async () => {
      const user = await getUser();
      const agent = await createTestAgent({ organizationId: tenant.orgId });

      // Only match user:*
      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all-users',
        matchers: [`user:${user.email}`],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, agent, toolName: 'test::action' }, policies);

      // Should still match because user matcher matches
      expect(result.decision).toBe('ALLOWED');
    });

    test('should match multiple matchers with OR logic', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-multiple',
        matchers: ['role:Admin', `user:${user.email}`],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);

      // User is not Admin but email matches second matcher
      expect(result.decision).toBe('ALLOWED');
    });
  });

  // ============================================================================
  // Policy Specificity and Matching
  // ============================================================================

  describe('Policy specificity and matching', () => {
    test('should select most specific matching policy', async () => {
      const user = await getUser();

      const specificPolicy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'specific-allow',
        matchers: [`user:${user.email}`],
        toolPatterns: ['test::specific-tool'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'generic-allow',
        matchers: ['*'],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::specific-tool' }, policies);

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain(specificPolicy.id);
    });

    test('should include all matching policies in policyIds', async () => {
      const user = await getUser();

      const policy1 = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-1',
        matchers: ['*'],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policy2 = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-2',
        matchers: ['role:User'],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain(policy1.id);
      expect(result.policyIds).toContain(policy2.id);
    });
  });

  // ============================================================================
  // A2A Tool Pattern Edge Cases
  // ============================================================================

  describe('A2A tool patterns', () => {
    test('should match exact A2A pattern', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-a2a',
        matchers: ['*'],
        toolPatterns: ['a2a::weather-agent::get-forecast'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy(
        { user, toolName: 'a2a::weather-agent::get-forecast' },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match A2A agent wildcard', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all-weather',
        matchers: ['*'],
        toolPatterns: ['a2a::weather-agent::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();

      const result1 = await evaluatePolicy(
        { user, toolName: 'a2a::weather-agent::get-forecast' },
        policies,
      );
      const result2 = await evaluatePolicy(
        { user, toolName: 'a2a::weather-agent::get-history' },
        policies,
      );
      const result3 = await evaluatePolicy(
        { user, toolName: 'a2a::other-agent::action' },
        policies,
      );

      expect(result1.decision).toBe('ALLOWED');
      expect(result2.decision).toBe('ALLOWED');
      expect(result3.decision).toBe('DENIED');
    });

    test('should match all A2A agents with double wildcard', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all-a2a',
        matchers: ['*'],
        toolPatterns: ['a2a::*::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();

      const result1 = await evaluatePolicy({ user, toolName: 'a2a::agent1::skill1' }, policies);
      const result2 = await evaluatePolicy({ user, toolName: 'a2a::agent2::skill2' }, policies);
      const result3 = await evaluatePolicy({ user, toolName: 'mcp::server::tool' }, policies);

      expect(result1.decision).toBe('ALLOWED');
      expect(result2.decision).toBe('ALLOWED');
      expect(result3.decision).toBe('DENIED');
    });

    test('should NOT allow A2A pattern to match MCP tools', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-a2a-only',
        matchers: ['*'],
        toolPatterns: ['a2a::*::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, policies);

      expect(result.decision).toBe('DENIED');
    });
  });

  // ============================================================================
  // Disabled Policies
  // ============================================================================

  describe('Disabled policy handling', () => {
    test('should ignore disabled ALLOW policies', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'disabled-allow',
        matchers: ['*'],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
        enabled: false,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should ignore disabled DENY policies', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'disabled-deny',
        matchers: ['*'],
        toolPatterns: ['test::dangerous'],
        effect: PolicyEffect.DENY,
        enabled: false,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'test::dangerous' }, policies);

      // Should be ALLOWED because the DENY is disabled
      expect(result.decision).toBe('ALLOWED');
    });

    test('should switch from ALLOWED to DENIED when ALLOW is disabled', async () => {
      const user = await getUser();

      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'toggle-allow',
        matchers: ['*'],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.ALLOW,
      });

      // First verify it's ALLOWED
      let policies = await getPolicies();
      let result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);
      expect(result.decision).toBe('ALLOWED');

      // Disable the policy
      await prisma.policy.update({
        where: { id: policy.id },
        data: { enabled: false },
      });

      // Now should be DENIED
      policies = await getPolicies();
      result = await evaluatePolicy({ user, toolName: 'test::action' }, policies);
      expect(result.decision).toBe('DENIED');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge cases', () => {
    test('should handle empty tool name - matches *::* pattern', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: '' }, policies);

      // Current behavior: empty tool name matches *::* wildcard
      expect(result.decision).toBe('ALLOWED');
    });

    test('should handle tool name without separator - matches *::* pattern', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: 'invalid-tool-name' }, policies);

      // Current behavior: *::* is a super-wildcard that matches anything
      expect(result.decision).toBe('ALLOWED');
    });

    test('should handle multiple :: - requires exact match after first segment', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-a2a',
        matchers: ['*'],
        toolPatterns: ['a2a::agent::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy(
        { user, toolName: 'a2a::agent::some::nested::action' },
        policies,
      );

      // Current behavior: pattern matching is strict - extra :: segments don't match wildcard
      expect(result.decision).toBe('DENIED');
    });

    test('should handle very long tool names', async () => {
      const user = await getUser();
      const longToolName = 'server' + '::' + 'a'.repeat(1000);

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-server',
        matchers: ['*'],
        toolPatterns: ['server::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy({ user, toolName: longToolName }, policies);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should handle unicode in tool names', async () => {
      const user = await getUser();

      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-unicode',
        matchers: ['*'],
        toolPatterns: ['server::tool-\u4e2d\u6587'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await getPolicies();
      const result = await evaluatePolicy(
        { user, toolName: 'server::tool-\u4e2d\u6587' },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
    });
  });
});
