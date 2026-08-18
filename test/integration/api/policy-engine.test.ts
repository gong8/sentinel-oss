/**
 * Integration tests for Policy Engine
 * Tests policy evaluation with real database
 */

import { AuditDecision, PolicyEffect } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { logToolInvocation } from '../../../packages/api/src/services/audit.js';
import {
  evaluatePolicy,
  generatePolicyDescription,
} from '../../../packages/api/src/services/policy.js';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestAgent, createTestPolicy, createTestUser } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';

describe.skipIf(!hasDatabaseUrl())('Policy Engine Integration', () => {
  let tenant: TestTenant;
  let userId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();
    const user = await createTestUser({ organizationId: tenant.orgId });
    userId = user.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('Helper Functions', () => {
    test('should generate human-readable policy description', () => {
      const mcpServerNames = new Map<string, string>([['github.com', 'GitHub']]);
      const description = generatePolicyDescription(
        ['user:bob@example.com'],
        ['github.com::createPR'],
        'ALLOW',
        mcpServerNames,
      );
      expect(description).toBe("Allow user 'bob@example.com' to use tool 'createPR' on 'GitHub'");
    });
  });

  describe('Policy Evaluation with Database', () => {
    test('should evaluate policy with real database policies', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, policies);

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain(policy.id);
    });

    test('should respect disabled policies', async () => {
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
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        enabled: false,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, policies);

      expect(result.decision).toBe('DENIED');
    });

    test('should evaluate with agent context', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const agent = await createTestAgent({ organizationId: tenant.orgId });
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: [`agent:${agent.id}`],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy(
        { user, agent, toolName: 'github.com::getFile' },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain(policy.id);
    });

    test('should handle complex policy scenarios', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Create multiple policies
      const allowPolicy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-github',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const denyPolicy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-create-pr',
        matchers: ['role:User'],
        toolPatterns: ['github.com::createPR'],
        effect: PolicyEffect.DENY,
        description: 'Users cannot create PRs',
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // Test ALLOW for getFile
      const allowResult = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, policies);
      expect(allowResult.decision).toBe('ALLOWED');
      expect(allowResult.policyIds).toContain(allowPolicy.id);

      // Test DENY for createPR (DENY overrides ALLOW)
      const denyResult = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, policies);
      expect(denyResult.decision).toBe('DENIED');
      expect(denyResult.policyIds).toContain(denyPolicy.id);
    });
  });

  describe('A2A Tool Pattern Evaluation', () => {
    test('should allow access with matching A2A tool pattern', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['*'],
        toolPatterns: ['a2a::weather-agent::get-forecast'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy(
        {
          user,
          toolName: 'a2a::weather-agent::get-forecast',
        },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain(policy.id);
    });

    test('should allow access with A2A skill wildcard pattern', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['*'],
        toolPatterns: ['a2a::weather-agent::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy(
        {
          user,
          toolName: 'a2a::weather-agent::get-forecast',
        },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain(policy.id);
    });

    test('should deny access when A2A agent does not match', async () => {
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
        organizationId: tenant.orgId,
        matchers: ['*'],
        toolPatterns: ['a2a::other-agent::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy(
        {
          user,
          toolName: 'a2a::weather-agent::get-forecast',
        },
        policies,
      );

      expect(result.decision).toBe('DENIED');
    });

    test('should deny A2A skill with DENY policy overriding ALLOW', async () => {
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
        organizationId: tenant.orgId,
        slug: 'allow-all-a2a',
        matchers: ['*'],
        toolPatterns: ['a2a::weather-agent::*'],
        effect: PolicyEffect.ALLOW,
      });

      const denyPolicy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-dangerous-skill',
        matchers: ['*'],
        toolPatterns: ['a2a::weather-agent::delete-data'],
        effect: PolicyEffect.DENY,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      const result = await evaluatePolicy(
        {
          user,
          toolName: 'a2a::weather-agent::delete-data',
        },
        policies,
      );

      expect(result.decision).toBe('DENIED');
      expect(result.policyIds).toContain(denyPolicy.id);
    });

    test('should not match A2A patterns for MCP tools', async () => {
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
        organizationId: tenant.orgId,
        matchers: ['*'],
        toolPatterns: ['a2a::*::*'],
        effect: PolicyEffect.ALLOW,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // MCP tool should not match A2A pattern
      const result = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::getFile',
        },
        policies,
      );

      expect(result.decision).toBe('DENIED');
    });
  });

  describe('Audit Logging Integration', () => {
    test('should log tool invocation', async () => {
      await logToolInvocation({
        organizationId: tenant.orgId,
        userId: userId,
        toolName: 'github.com::getFile',
        parameters: { repo: 'test/repo' },
        decision: AuditDecision.ALLOWED,
        justification: null,
        policyIds: ['policy-1'],
      });

      const entries = await prisma.auditLogEntry.findMany({
        where: { organizationId: tenant.orgId },
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].toolName).toBe('github.com::getFile');
      expect(entries[0].decision).toBe(AuditDecision.ALLOWED);
    });

    test('should log denied invocations', async () => {
      await logToolInvocation({
        organizationId: tenant.orgId,
        userId: userId,
        toolName: 'github.com::createPR',
        parameters: { title: 'Test PR' },
        decision: AuditDecision.DENIED,
        justification: 'Denied by policy',
        policyIds: ['policy-2'],
      });

      const entries = await prisma.auditLogEntry.findMany({
        where: {
          organizationId: tenant.orgId,
          decision: AuditDecision.DENIED,
        },
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].justification).toBe('Denied by policy');
    });

    test('should not throw on logging errors', async () => {
      // Try to log with invalid organizationId
      await expect(
        logToolInvocation({
          organizationId: 'invalid-org-id',
          userId: userId,
          toolName: 'test::tool',
          parameters: {},
          decision: AuditDecision.ALLOWED,
          justification: null,
          policyIds: [],
        }),
      ).resolves.not.toThrow();
    });
  });
});
