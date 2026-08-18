/**
 * Integration tests for Policy Conditions
 * Tests condition evaluation with real database and context extraction
 */

import { PolicyEffect } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { evaluatePolicy } from '../../../packages/api/src/services/policy.js';
import {
  evaluatePolicyConditions,
  policyConditionsSchema,
} from '../../../packages/api/src/services/policyCondition.js';
import { buildEvaluationContext } from '../../../packages/api/src/services/toolContext.js';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestPolicy, createTestUser } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';

/**
 * Parse policy conditions using Zod schema for type safety.
 * Returns parsed PolicyConditions array or null if parsing fails.
 */
function parseConditions(conditions: unknown) {
  if (conditions === null || conditions === undefined) {
    return null;
  }
  const result = policyConditionsSchema.safeParse(conditions);
  if (!result.success) {
    throw new Error(`Invalid policy conditions: ${result.error.message}`);
  }
  return result.data;
}

describe.skipIf(!hasDatabaseUrl())('Policy Conditions Integration', () => {
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

  describe('Time-based Conditions', () => {
    test('should allow access during business hours', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Create policy with business hours condition (9-16 inclusive using between)
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'time.hourOfDay',
            operator: 'between',
            value: [9, 16], // 9am to 4pm inclusive
          },
        ],
      });

      // Test during business hours (10 AM)
      const businessHourDate = new Date();
      businessHourDate.setHours(10, 0, 0, 0);

      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github.com::getFile',
        parameters: {},
        timestamp: businessHourDate,
      });

      expect(context.time.hourOfDay).toBe(10);

      // Evaluate conditions directly
      const conditionResult = evaluatePolicyConditions(parseConditions(policy.conditions), context);
      expect(conditionResult.passed).toBe(true);
    });

    test('should deny access outside business hours', async () => {
      // Create policy with business hours condition (9-16 inclusive)
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'time.hourOfDay',
            operator: 'between',
            value: [9, 16], // 9am to 4pm inclusive
          },
        ],
      });

      // Test outside business hours (8 PM)
      const afterHoursDate = new Date();
      afterHoursDate.setHours(20, 0, 0, 0);

      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github.com::getFile',
        parameters: {},
        timestamp: afterHoursDate,
      });

      const conditionResult = evaluatePolicyConditions(parseConditions(policy.conditions), context);
      expect(conditionResult.passed).toBe(false);
    });

    test('should check day of week conditions', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'time.dayOfWeek',
            operator: 'in',
            value: [1, 2, 3, 4, 5], // Monday-Friday
          },
        ],
      });

      // Create a Monday date (Jan 15, 2024 is a Monday)
      const monday = new Date('2024-01-15T10:00:00Z');

      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github.com::getFile',
        parameters: {},
        timestamp: monday,
      });

      const conditionResult = evaluatePolicyConditions(parseConditions(policy.conditions), context);
      expect(conditionResult.passed).toBe(true);
    });
  });

  describe('Parameter-based Conditions', () => {
    test('should allow access when parameter matches condition', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Create policy that only allows specific repository
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'params.repository',
            operator: 'equals',
            value: 'allowed-repo',
          },
        ],
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // Evaluate with matching parameter
      const result = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::getFile',
          parameters: { repository: 'allowed-repo' },
        },
        policies,
      );

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain(policy.id);
    });

    test('should deny access when parameter does not match condition', async () => {
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
        conditions: [
          {
            field: 'params.repository',
            operator: 'equals',
            value: 'allowed-repo',
          },
        ],
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // Evaluate with non-matching parameter
      const result = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::getFile',
          parameters: { repository: 'blocked-repo' },
        },
        policies,
      );

      expect(result.decision).toBe('DENIED');
    });

    test('should handle containsAny operator for arrays', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['slack.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'params.channels',
            operator: 'containsAny',
            value: ['general', 'announcements'],
          },
        ],
      });

      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'slack.com::postMessage',
        parameters: { channels: ['general', 'random'] },
      });

      const conditionResult = evaluatePolicyConditions(parseConditions(policy.conditions), context);
      expect(conditionResult.passed).toBe(true);
    });

    test('should handle startsWith operator', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['filesystem::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'params.path',
            operator: 'startsWith',
            value: '/allowed/',
          },
        ],
      });

      // Test matching path
      const context1 = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'filesystem::read',
        parameters: { path: '/allowed/docs/readme.md' },
      });

      const result1 = evaluatePolicyConditions(parseConditions(policy.conditions), context1);
      expect(result1.passed).toBe(true);

      // Test non-matching path
      const context2 = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'filesystem::read',
        parameters: { path: '/private/secrets.txt' },
      });

      const result2 = evaluatePolicyConditions(parseConditions(policy.conditions), context2);
      expect(result2.passed).toBe(false);
    });
  });

  describe('SQL Context Extraction', () => {
    test('should extract SQL operation and tables from query', async () => {
      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'postgres::query',
        parameters: {
          query: 'SELECT * FROM users WHERE id = 1',
        },
      });

      type ExtractedContext = typeof context & {
        sql?: { sqlOperation?: string; sqlTables?: string[]; hasSqlComment?: boolean };
      };

      const typedContext = context as ExtractedContext;
      expect(typedContext.sql?.sqlOperation).toBe('SELECT');
      expect(typedContext.sql?.sqlTables).toContain('users');
    });

    test('should allow only SELECT queries', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['*sql*', '*postgres*', '*database*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'sql.sqlOperation',
            operator: 'equals',
            value: 'SELECT',
          },
        ],
      });

      // SELECT should pass
      const selectContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'postgres::query',
        parameters: { query: 'SELECT * FROM users' },
      });

      const selectResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        selectContext,
      );
      expect(selectResult.passed).toBe(true);

      // DELETE should fail
      const deleteContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'postgres::query',
        parameters: { query: 'DELETE FROM users WHERE id = 1' },
      });

      const deleteResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        deleteContext,
      );
      expect(deleteResult.passed).toBe(false);
    });

    test('should detect SQL comments (potential injection)', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['*sql*', '*postgres*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'sql.hasSqlComment',
            operator: 'equals',
            value: false,
          },
        ],
      });

      // Query without comments should pass
      const safeContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'postgres::query',
        parameters: { query: 'SELECT * FROM users WHERE id = 1' },
      });

      const safeResult = evaluatePolicyConditions(parseConditions(policy.conditions), safeContext);
      expect(safeResult.passed).toBe(true);

      // Query with comments should fail
      const injectionContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'postgres::query',
        parameters: { query: 'SELECT * FROM users WHERE id = 1 -- OR 1=1' },
      });

      const injectionResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        injectionContext,
      );
      expect(injectionResult.passed).toBe(false);
    });
  });

  describe('GitHub Context Extraction', () => {
    test('should extract repository and branch from parameters', async () => {
      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github::createPR',
        parameters: {
          repository: 'org/repo',
          branch: 'feature-branch',
        },
      });

      type ExtractedContext = typeof context & {
        github?: {
          gitRepository?: string;
          gitBranch?: string;
          gitOwner?: string;
          isProtectedBranch?: boolean;
        };
      };

      const typedContext = context as ExtractedContext;
      expect(typedContext.github?.gitOwner).toBe('org');
      expect(typedContext.github?.gitRepository).toBe('repo');
      expect(typedContext.github?.gitBranch).toBe('feature-branch');
      expect(typedContext.github?.isProtectedBranch).toBe(false);
    });

    test('should detect protected branches', async () => {
      const mainContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github::push',
        parameters: {
          branch: 'main',
        },
      });

      type ExtractedContext = typeof mainContext & {
        github?: { isProtectedBranch?: boolean };
      };

      const typedMain = mainContext as ExtractedContext;
      expect(typedMain.github?.isProtectedBranch).toBe(true);

      const featureContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github::push',
        parameters: {
          branch: 'feature/new-thing',
        },
      });

      const typedFeature = featureContext as ExtractedContext;
      expect(typedFeature.github?.isProtectedBranch).toBe(false);
    });

    test('should block pushes to protected branches', async () => {
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
        toolPatterns: ['github.com::push', 'github.com::merge'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'github.isProtectedBranch',
            operator: 'equals',
            value: false,
          },
        ],
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // Push to feature branch should work
      const featureResult = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::push',
          parameters: { branch: 'feature/new-thing' },
        },
        policies,
      );
      expect(featureResult.decision).toBe('ALLOWED');

      // Push to main should be denied
      const mainResult = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::push',
          parameters: { branch: 'main' },
        },
        policies,
      );
      expect(mainResult.decision).toBe('DENIED');
    });
  });

  describe('File Context Extraction', () => {
    test('should extract file path and extension', async () => {
      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'filesystem::read',
        parameters: {
          path: '/home/user/documents/report.pdf',
        },
      });

      type ExtractedContext = typeof context & {
        file?: { filePath?: string; fileExtension?: string; isSensitivePath?: boolean };
      };

      const typedContext = context as ExtractedContext;
      expect(typedContext.file?.filePath).toBe('/home/user/documents/report.pdf');
      expect(typedContext.file?.fileExtension).toBe('pdf');
      expect(typedContext.file?.isSensitivePath).toBe(false);
    });

    test('should detect sensitive paths', async () => {
      const sensitiveContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'filesystem::read',
        parameters: {
          path: '/home/user/.ssh/id_rsa',
        },
      });

      type ExtractedContext = typeof sensitiveContext & {
        file?: { isSensitivePath?: boolean };
      };

      const typedContext = sensitiveContext as ExtractedContext;
      expect(typedContext.file?.isSensitivePath).toBe(true);
    });

    test('should block access to sensitive files', async () => {
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
        toolPatterns: ['filesystem::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'file.isSensitivePath',
            operator: 'equals',
            value: false,
          },
        ],
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // Regular file should work
      const normalResult = await evaluatePolicy(
        {
          user,
          toolName: 'filesystem::read',
          parameters: { path: '/home/user/documents/notes.txt' },
        },
        policies,
      );
      expect(normalResult.decision).toBe('ALLOWED');

      // Sensitive file should be denied
      const sensitiveResult = await evaluatePolicy(
        {
          user,
          toolName: 'filesystem::read',
          parameters: { path: '/home/user/.env' },
        },
        policies,
      );
      expect(sensitiveResult.decision).toBe('DENIED');
    });
  });

  describe('Network Conditions', () => {
    test('should evaluate IP CIDR conditions', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'network.sourceIp',
            operator: 'inCidr',
            value: '192.168.1.0/24',
          },
        ],
      });

      // IP within CIDR should pass
      const allowedContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'any::tool',
        parameters: {},
        sourceIp: '192.168.1.100',
      });

      const allowedResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        allowedContext,
      );
      expect(allowedResult.passed).toBe(true);

      // IP outside CIDR should fail
      const deniedContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'any::tool',
        parameters: {},
        sourceIp: '10.0.0.1',
      });

      const deniedResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        deniedContext,
      );
      expect(deniedResult.passed).toBe(false);
    });
  });

  describe('Condition Logic (AND - all must pass)', () => {
    test('should evaluate AND conditions (all must pass)', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'params.action',
            operator: 'equals',
            value: 'read',
          },
          {
            field: 'params.repository',
            operator: 'startsWith',
            value: 'public-',
          },
        ],
      });

      // Both conditions true
      const bothTrueContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github.com::getFile',
        parameters: { action: 'read', repository: 'public-repo' },
      });

      const bothTrueResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        bothTrueContext,
      );
      expect(bothTrueResult.passed).toBe(true);

      // One condition false
      const oneFailsContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'github.com::getFile',
        parameters: { action: 'read', repository: 'private-repo' },
      });

      const oneFailsResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        oneFailsContext,
      );
      expect(oneFailsResult.passed).toBe(false);
    });

    test('should combine time and parameter conditions', async () => {
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          // Business hours (9-16 inclusive)
          {
            field: 'time.hourOfDay',
            operator: 'between',
            value: [9, 16],
          },
          // Action must be read
          {
            field: 'params.action',
            operator: 'equals',
            value: 'read',
          },
        ],
      });

      // Business hours + read action = allowed
      const businessHours = new Date();
      businessHours.setHours(10, 0, 0, 0);

      const allowedContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'any::tool',
        parameters: { action: 'read' },
        timestamp: businessHours,
      });

      const allowedResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        allowedContext,
      );
      expect(allowedResult.passed).toBe(true);

      // Outside hours + read action = denied
      const afterHours = new Date();
      afterHours.setHours(20, 0, 0, 0);

      const deniedContext = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'any::tool',
        parameters: { action: 'read' },
        timestamp: afterHours,
      });

      const deniedResult = evaluatePolicyConditions(
        parseConditions(policy.conditions),
        deniedContext,
      );
      expect(deniedResult.passed).toBe(false);
    });
  });

  describe('DENY Policies and Conditions', () => {
    test('DENY policies should bypass conditions and always apply', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Create ALLOW policy with no conditions
      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-all-github',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      // Create DENY policy with conditions that would fail
      // But DENY should still apply because conditions are bypassed
      const denyPolicy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-dangerous',
        matchers: ['role:User'],
        toolPatterns: ['github.com::deleteBranch'],
        effect: PolicyEffect.DENY,
        conditions: [
          {
            // This condition would fail (we'll pass 'allowed')
            // But DENY should bypass conditions
            field: 'params.repository',
            operator: 'equals',
            value: 'blocked-repo',
          },
        ],
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // Even though condition doesn't match, DENY should apply
      const result = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::deleteBranch',
          parameters: { repository: 'allowed-repo' },
        },
        policies,
      );

      expect(result.decision).toBe('DENIED');
      expect(result.policyIds).toContain(denyPolicy.id);
    });

    test('DENY takes precedence over ALLOW with matching conditions', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // ALLOW policy for all github tools
      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'allow-github',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          {
            field: 'params.repository',
            operator: 'startsWith',
            value: 'org/',
          },
        ],
      });

      // DENY policy for delete operations
      const denyPolicy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'deny-delete',
        matchers: ['role:User'],
        toolPatterns: ['github.com::deleteRepo'],
        effect: PolicyEffect.DENY,
      });

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
        },
      });

      // Even though ALLOW conditions match, DENY should take precedence
      const result = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::deleteRepo',
          parameters: { repository: 'org/test-repo' },
        },
        policies,
      );

      expect(result.decision).toBe('DENIED');
      expect(result.policyIds).toContain(denyPolicy.id);
    });
  });

  describe('Policy Evaluation with Full Context', () => {
    test('should evaluate policy with SQL and time conditions combined', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Complex policy combining time and SQL conditions
      const policy = await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['postgres::query'],
        effect: PolicyEffect.ALLOW,
        conditions: [
          // Business hours (9-16 inclusive)
          { field: 'time.hourOfDay', operator: 'between', value: [9, 16] },
          // SQL must be SELECT only
          { field: 'sql.sqlOperation', operator: 'equals', value: 'SELECT' },
          // No SQL comments allowed
          { field: 'sql.hasSqlComment', operator: 'equals', value: false },
        ],
      });

      // Create context during business hours with safe SELECT query
      const businessHours = new Date();
      businessHours.setHours(10, 0, 0, 0);

      const context = buildEvaluationContext({
        organizationId: tenant.orgId,
        toolName: 'postgres::query',
        parameters: {
          query: 'SELECT * FROM public_data WHERE category = $1',
        },
        timestamp: businessHours,
      });

      const conditionResult = evaluatePolicyConditions(parseConditions(policy.conditions), context);

      expect(conditionResult.passed).toBe(true);
    });
  });
});
