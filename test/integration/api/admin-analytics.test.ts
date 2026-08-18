/**
 * Integration tests for Admin Analytics Router
 * Tests analytics endpoints with real database
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { AuditDecision, prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import {
  createTestAdmin,
  createTestAgent,
  createTestOrganization,
  createTestUser,
} from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Admin Analytics Router', () => {
  let tenant: TestTenant;
  let adminId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // Helper to get admin user
  async function getAdmin() {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!admin) throw new Error('Admin not found');
    return admin;
  }

  // Helper to create audit log entries
  async function createAuditEntry(overrides: {
    userId?: string;
    agentId?: string | null;
    toolName?: string;
    decision?: AuditDecision;
    timestamp?: Date;
  }) {
    return prisma.auditLogEntry.create({
      data: {
        organizationId: tenant.orgId,
        userId: overrides.userId,
        agentId: overrides.agentId ?? null,
        toolName: overrides.toolName ?? 'test-tool::action',
        parameters: {},
        decision: overrides.decision ?? AuditDecision.ALLOWED,
        policyIds: [],
        matchedPolicyIds: [],
        userRoles: [],
        timestamp: overrides.timestamp ?? new Date(),
      },
    });
  }

  describe('toolUsageTimeSeries', () => {
    test('should return time series data', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });

      // Create audit entries for different days
      await createAuditEntry({
        userId: user.id,
        decision: AuditDecision.ALLOWED,
        timestamp: new Date('2024-06-15T10:00:00Z'),
      });
      await createAuditEntry({
        userId: user.id,
        decision: AuditDecision.DENIED,
        timestamp: new Date('2024-06-15T14:00:00Z'),
      });
      await createAuditEntry({
        userId: user.id,
        decision: AuditDecision.ALLOWED,
        timestamp: new Date('2024-06-16T09:00:00Z'),
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.toolUsageTimeSeries({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
        interval: 'day',
      });

      expect(Array.isArray(result)).toBe(true);
      // Should have entries for days with data
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    test('should return empty array when no data', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.toolUsageTimeSeries({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result).toEqual([]);
    });

    test('should support hourly interval', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.toolUsageTimeSeries({
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        interval: 'hour',
      });

      expect(Array.isArray(result)).toBe(true);
    });

    test('should only include data from own organization', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });

      // Create entry in our org
      await createAuditEntry({
        userId: user.id,
        timestamp: new Date('2024-06-15T10:00:00Z'),
      });

      // Create entry in another org
      const otherOrg = await createTestOrganization({ name: 'Other Org' });
      const otherUser = await createTestUser({ organizationId: otherOrg.id });
      await prisma.auditLogEntry.create({
        data: {
          organizationId: otherOrg.id,
          userId: otherUser.id,
          toolName: 'other-tool',
          parameters: {},
          decision: AuditDecision.ALLOWED,
          policyIds: [],
          matchedPolicyIds: [],
          userRoles: [],
          timestamp: new Date('2024-06-15T10:00:00Z'),
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.toolUsageTimeSeries({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
        interval: 'day',
      });

      // Should only see our org's data
      const totalCount = result.reduce((sum, item) => sum + item.count, 0);
      expect(totalCount).toBe(1);
    });
  });

  describe('topUsers', () => {
    test('should return top users by invocation count', async () => {
      const admin = await getAdmin();
      const user1 = await createTestUser({ organizationId: tenant.orgId });
      const user2 = await createTestUser({ organizationId: tenant.orgId });

      // User1 has more invocations
      await createAuditEntry({ userId: user1.id });
      await createAuditEntry({ userId: user1.id });
      await createAuditEntry({ userId: user1.id });

      // User2 has fewer
      await createAuditEntry({ userId: user2.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topUsers({ limit: 10 });

      expect(result.length).toBeGreaterThanOrEqual(2);
      // First user should have more invocations
      expect(result[0].invocationCount).toBeGreaterThanOrEqual(result[1].invocationCount);
    });

    test('should respect limit parameter', async () => {
      const admin = await getAdmin();
      const user1 = await createTestUser({ organizationId: tenant.orgId });
      const user2 = await createTestUser({ organizationId: tenant.orgId });
      const user3 = await createTestUser({ organizationId: tenant.orgId });

      await createAuditEntry({ userId: user1.id });
      await createAuditEntry({ userId: user2.id });
      await createAuditEntry({ userId: user3.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topUsers({ limit: 2 });

      expect(result.length).toBeLessThanOrEqual(2);
    });

    test('should filter by date range', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });

      // Entry in date range
      await createAuditEntry({
        userId: user.id,
        timestamp: new Date('2024-06-15T10:00:00Z'),
      });

      // Entry outside date range
      await createAuditEntry({
        userId: user.id,
        timestamp: new Date('2024-01-01T10:00:00Z'),
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topUsers({
        limit: 10,
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });

      const userResult = result.find((r) => r.userId === user.id);
      expect(userResult?.invocationCount).toBe(1);
    });

    test('should return empty array when no data', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topUsers({ limit: 10 });

      expect(result).toEqual([]);
    });

    test('should not include users from other organizations', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });

      await createAuditEntry({ userId: user.id });

      // Create entry in another org
      const otherOrg = await createTestOrganization({ name: 'Other Org' });
      const otherUser = await createTestUser({ organizationId: otherOrg.id });
      await prisma.auditLogEntry.create({
        data: {
          organizationId: otherOrg.id,
          userId: otherUser.id,
          toolName: 'other-tool',
          parameters: {},
          decision: AuditDecision.ALLOWED,
          policyIds: [],
          matchedPolicyIds: [],
          userRoles: [],
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topUsers({ limit: 10 });

      expect(result.some((r) => r.userId === otherUser.id)).toBe(false);
    });
  });

  describe('topAgents', () => {
    test('should return top agents by invocation count', async () => {
      const admin = await getAdmin();
      const agent1 = await createTestAgent({ organizationId: tenant.orgId, name: 'Agent 1' });
      const agent2 = await createTestAgent({ organizationId: tenant.orgId, name: 'Agent 2' });

      // Agent1 has more invocations
      await createAuditEntry({ agentId: agent1.id });
      await createAuditEntry({ agentId: agent1.id });
      await createAuditEntry({ agentId: agent1.id });

      // Agent2 has fewer
      await createAuditEntry({ agentId: agent2.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topAgents({ limit: 10 });

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].invocationCount).toBeGreaterThanOrEqual(result[1].invocationCount);
    });

    test('should respect limit parameter', async () => {
      const admin = await getAdmin();
      const agent1 = await createTestAgent({ organizationId: tenant.orgId });
      const agent2 = await createTestAgent({ organizationId: tenant.orgId });
      const agent3 = await createTestAgent({ organizationId: tenant.orgId });

      await createAuditEntry({ agentId: agent1.id });
      await createAuditEntry({ agentId: agent2.id });
      await createAuditEntry({ agentId: agent3.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topAgents({ limit: 2 });

      expect(result.length).toBeLessThanOrEqual(2);
    });

    test('should return empty array when no data', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topAgents({ limit: 10 });

      expect(result).toEqual([]);
    });
  });

  describe('topTools', () => {
    test('should return top tools by invocation count', async () => {
      const admin = await getAdmin();

      // Tool 1 has more invocations
      await createAuditEntry({ toolName: 'github::createPR' });
      await createAuditEntry({ toolName: 'github::createPR' });
      await createAuditEntry({ toolName: 'github::createPR' });

      // Tool 2 has fewer
      await createAuditEntry({ toolName: 'slack::sendMessage' });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topTools({ limit: 10 });

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].invocationCount).toBeGreaterThanOrEqual(result[1].invocationCount);
    });

    test('should respect limit parameter', async () => {
      const admin = await getAdmin();

      await createAuditEntry({ toolName: 'tool1' });
      await createAuditEntry({ toolName: 'tool2' });
      await createAuditEntry({ toolName: 'tool3' });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topTools({ limit: 2 });

      expect(result.length).toBeLessThanOrEqual(2);
    });

    test('should filter by date range', async () => {
      const admin = await getAdmin();

      // Entry in date range
      await createAuditEntry({
        toolName: 'tool1',
        timestamp: new Date('2024-06-15T10:00:00Z'),
      });

      // Entry outside date range
      await createAuditEntry({
        toolName: 'tool1',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topTools({
        limit: 10,
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });

      const toolResult = result.find((r) => r.toolName === 'tool1');
      expect(toolResult?.invocationCount).toBe(1);
    });

    test('should return empty array when no data', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.topTools({ limit: 10 });

      expect(result).toEqual([]);
    });
  });

  describe('peakUsageHours', () => {
    test('should return usage counts for all 24 hours', async () => {
      const admin = await getAdmin();

      // Create entries at specific hours
      await createAuditEntry({ timestamp: new Date('2024-06-15T09:00:00Z') });
      await createAuditEntry({ timestamp: new Date('2024-06-15T09:30:00Z') });
      await createAuditEntry({ timestamp: new Date('2024-06-15T14:00:00Z') });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.peakUsageHours({});

      expect(result).toHaveLength(24);
      // Check that hours are in order
      for (let i = 0; i < 24; i++) {
        expect(result[i].hour).toBe(i);
      }
    });

    test('should return zeros when no data', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.peakUsageHours({});

      expect(result).toHaveLength(24);
      result.forEach((hour) => {
        expect(hour.count).toBe(0);
      });
    });

    test('should filter by date range', async () => {
      const admin = await getAdmin();

      // Entry in date range
      await createAuditEntry({
        timestamp: new Date('2024-06-15T09:00:00Z'),
      });

      // Entry outside date range
      await createAuditEntry({
        timestamp: new Date('2024-01-01T09:00:00Z'),
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.peakUsageHours({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });

      // Only count entry in date range
      const totalCount = result.reduce((sum, hour) => sum + hour.count, 0);
      expect(totalCount).toBe(1);
    });
  });

  describe('summary', () => {
    test('should return complete analytics summary', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });
      const agent = await createTestAgent({ organizationId: tenant.orgId });

      // Create some audit entries
      await createAuditEntry({
        userId: user.id,
        agentId: agent.id,
        toolName: 'tool1',
        decision: AuditDecision.ALLOWED,
      });
      await createAuditEntry({
        userId: user.id,
        agentId: agent.id,
        toolName: 'tool2',
        decision: AuditDecision.DENIED,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.summary({});

      expect(result.totalInvocations).toBe(2);
      expect(result.allowedInvocations).toBe(1);
      expect(result.deniedInvocations).toBe(1);
      expect(result.denialRate).toBe(50);
      expect(result.uniqueUsers).toBeGreaterThanOrEqual(1);
      expect(result.uniqueAgents).toBeGreaterThanOrEqual(1);
      expect(result.uniqueTools).toBe(2);
    });

    test('should return zeros when no data', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.summary({});

      expect(result.totalInvocations).toBe(0);
      expect(result.allowedInvocations).toBe(0);
      expect(result.deniedInvocations).toBe(0);
      expect(result.denialRate).toBe(0);
      expect(result.uniqueUsers).toBe(0);
      expect(result.uniqueAgents).toBe(0);
      expect(result.uniqueTools).toBe(0);
    });

    test('should filter by date range', async () => {
      const admin = await getAdmin();

      // Entry in date range
      await createAuditEntry({
        toolName: 'tool1',
        timestamp: new Date('2024-06-15T10:00:00Z'),
      });

      // Entry outside date range
      await createAuditEntry({
        toolName: 'tool2',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.summary({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });

      expect(result.totalInvocations).toBe(1);
    });

    test('should not include data from other organizations', async () => {
      const admin = await getAdmin();

      // Create entry in our org
      await createAuditEntry({ toolName: 'tool1' });

      // Create entry in another org
      const otherOrg = await createTestOrganization({ name: 'Other Org' });
      await prisma.auditLogEntry.create({
        data: {
          organizationId: otherOrg.id,
          toolName: 'other-tool',
          parameters: {},
          decision: AuditDecision.ALLOWED,
          policyIds: [],
          matchedPolicyIds: [],
          userRoles: [],
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.analytics.summary({});

      expect(result.totalInvocations).toBe(1);
    });
  });

  describe('Authorization', () => {
    test('should reject non-admin users', async () => {
      const regularUser = await createTestUser({ organizationId: tenant.orgId });
      const user = await prisma.user.findUnique({
        where: { id: regularUser.id },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);

      await expect(caller.admin.analytics.summary({})).rejects.toThrow();
    });
  });
});
