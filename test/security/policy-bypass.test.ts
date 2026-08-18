/**
 * Security Tests: Policy Bypass Attempts
 * Ensures policies cannot be bypassed through various attack vectors
 */

import { PolicyEffect } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { evaluatePolicy } from '../../packages/api/src/services/policy.js';
import { prisma } from '../../packages/db/src/index.js';
import { clearDatabase, hasDatabaseUrl } from '../helpers/db.js';
import { createTestOrganization, createTestPolicy, createTestUser } from '../helpers/factory.js';

describe.skipIf(!hasDatabaseUrl())('Policy Bypass Security', () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    await clearDatabase();
    const org = await createTestOrganization();
    orgId = org.id;
    const user = await createTestUser({ organizationId: orgId });
    userId = user.id;
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe('DENY Policy Enforcement', () => {
    test('should not allow bypassing DENY with ALLOW policy', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Create ALLOW policy
      await createTestPolicy({
        organizationId: orgId,
        matchers: ['role:User'],
        toolPatterns: ['GitHub::*'],
        effect: PolicyEffect.ALLOW,
      });

      // Create DENY policy (more specific)
      await createTestPolicy({
        organizationId: orgId,
        matchers: ['role:User'],
        toolPatterns: ['GitHub::createPR'],
        effect: PolicyEffect.DENY,
        description: 'Cannot create PRs',
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy({ user, toolName: 'GitHub::createPR' }, policies);

      // DENY should always win
      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('Cannot create PRs');
    });

    test('should not allow bypassing with disabled policy manipulation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Create disabled ALLOW policy
      await createTestPolicy({
        organizationId: orgId,
        matchers: ['role:User'],
        toolPatterns: ['GitHub::*'],
        effect: PolicyEffect.ALLOW,
        enabled: false,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: orgId,
          enabled: true, // Only enabled policies
        },
      });

      const result = await evaluatePolicy({ user, toolName: 'GitHub::getFile' }, policies);

      // Should be denied because no enabled ALLOW policy
      expect(result.decision).toBe('DENIED');
    });
  });

  describe('Tool Name Manipulation', () => {
    test('should not allow bypassing with case manipulation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      await createTestPolicy({
        organizationId: orgId,
        matchers: ['role:User'],
        toolPatterns: ['GitHub::createPR'],
        effect: PolicyEffect.DENY,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: orgId,
          enabled: true,
        },
      });

      // Try different case variations
      const variations = ['GitHub::CreatePR', 'GitHub::CREATEPR', 'GITHUB::createPR'];

      for (const toolName of variations) {
        const result = await evaluatePolicy({ user, toolName }, policies);

        // Should still be denied (exact match required)
        // Note: Current implementation may not handle case-insensitive matching
        // This test documents expected behavior
        expect(result.decision).toBe('DENIED');
      }
    });

    test('should not allow bypassing with domain manipulation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      await createTestPolicy({
        organizationId: orgId,
        matchers: ['role:User'],
        toolPatterns: ['GitHub::createPR'],
        effect: PolicyEffect.DENY,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: orgId,
          enabled: true,
        },
      });

      // Try server name variations
      const variations = ['GitHubX::createPR', 'GitHub::createPR', 'github-server::createPR'];

      for (const toolName of variations) {
        const result = await evaluatePolicy({ user, toolName }, policies);

        // Should be denied for exact matches, allowed for non-matches
        if (toolName === 'GitHub::createPR') {
          expect(result.decision).toBe('DENIED');
        }
      }
    });
  });

  describe('Matcher Manipulation', () => {
    test('should not allow bypassing with role manipulation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Policy for ADMIN only
      await createTestPolicy({
        organizationId: orgId,
        matchers: ['role:Admin'],
        toolPatterns: ['GitHub::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy({ user, toolName: 'GitHub::getFile' }, policies);

      // User has USER role, not ADMIN, so should be denied
      expect(result.decision).toBe('DENIED');
    });

    test('should not allow bypassing with wildcard abuse', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Policy with wildcard matcher
      await createTestPolicy({
        organizationId: orgId,
        matchers: ['*'],
        toolPatterns: ['GitHub::createPR'],
        effect: PolicyEffect.DENY,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy({ user, toolName: 'GitHub::createPR' }, policies);

      // Should be denied despite wildcard matcher
      expect(result.decision).toBe('DENIED');
    });
  });

  describe('SQL Injection Attempts', () => {
    test('should not allow SQL injection in tool name', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const maliciousToolNames = [
        "GitHub::tool'; DROP TABLE policies; --",
        "GitHub::tool' OR '1'='1",
        "GitHub::tool'; SELECT * FROM users; --",
      ];

      for (const toolName of maliciousToolNames) {
        // Should not throw or cause SQL injection
        const policies = await prisma.policy.findMany({
          where: {
            organizationId: orgId,
            enabled: true,
          },
        });

        const result = await evaluatePolicy({ user, toolName }, policies);

        // Should safely evaluate (likely DENIED due to no match)
        expect(result.decision).toBe('DENIED');
      }
    });

    test('should not allow SQL injection in matcher', async () => {
      // Try to create policy with SQL injection in matcher
      // This should be prevented by validation, but test anyway
      const maliciousMatchers = ["role:User'; DROP TABLE policies; --", "role:User' OR '1'='1"];

      for (const matcher of maliciousMatchers) {
        // Should fail validation or be safely stored
        const policy = await prisma.policy.create({
          data: {
            organizationId: orgId,
            slug: `test-${Date.now()}`,
            matchers: [matcher],
            toolPatterns: ['GitHub::*'],
            effect: PolicyEffect.ALLOW,
            description: 'SQL injection test',
            enabled: true,
          },
        });

        // Policy should be created but matcher should not execute SQL
        expect(policy.matchers[0]).toBe(matcher);

        // Cleanup
        await prisma.policy.delete({ where: { id: policy.id } });
      }
    });
  });
});
