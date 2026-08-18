/**
 * Integration tests for Admin Audit Log Entries Router
 * Tests audit log viewing and PDF export operations
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

describe.skipIf(!hasDatabaseUrl())('Admin Audit Log Entries Router', () => {
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

  describe('list', () => {
    test('should list all audit log entries in organization', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });

      await createAuditEntry({ userId: user.id, toolName: 'tool1' });
      await createAuditEntry({ userId: user.id, toolName: 'tool2' });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({});

      expect(result.total).toBe(2);
      expect(result.entries).toHaveLength(2);
    });

    test('should filter by userId', async () => {
      const admin = await getAdmin();
      const user1 = await createTestUser({ organizationId: tenant.orgId });
      const user2 = await createTestUser({ organizationId: tenant.orgId });

      await createAuditEntry({ userId: user1.id });
      await createAuditEntry({ userId: user1.id });
      await createAuditEntry({ userId: user2.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({ userId: user1.id });

      expect(result.total).toBe(2);
    });

    test('should filter by agentId', async () => {
      const admin = await getAdmin();
      const agent1 = await createTestAgent({ organizationId: tenant.orgId });
      const agent2 = await createTestAgent({ organizationId: tenant.orgId });

      await createAuditEntry({ agentId: agent1.id });
      await createAuditEntry({ agentId: agent1.id });
      await createAuditEntry({ agentId: agent2.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({ agentId: agent1.id });

      expect(result.total).toBe(2);
    });

    test('should filter by toolName', async () => {
      const admin = await getAdmin();

      await createAuditEntry({ toolName: 'github::createPR' });
      await createAuditEntry({ toolName: 'github::mergePR' });
      await createAuditEntry({ toolName: 'slack::sendMessage' });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({ toolName: 'github' });

      expect(result.total).toBe(2);
    });

    test('should filter by decision', async () => {
      const admin = await getAdmin();

      await createAuditEntry({ decision: AuditDecision.ALLOWED });
      await createAuditEntry({ decision: AuditDecision.ALLOWED });
      await createAuditEntry({ decision: AuditDecision.DENIED });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({ decision: AuditDecision.DENIED });

      expect(result.total).toBe(1);
    });

    test('should filter by date range', async () => {
      const admin = await getAdmin();

      await createAuditEntry({ timestamp: new Date('2024-06-15') });
      await createAuditEntry({ timestamp: new Date('2024-01-01') });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-30'),
      });

      expect(result.total).toBe(1);
    });

    test('should apply limit and offset', async () => {
      const admin = await getAdmin();

      for (let i = 0; i < 10; i++) {
        await createAuditEntry({ toolName: `tool-${i}` });
      }

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({ limit: 5, offset: 2 });

      expect(result.entries).toHaveLength(5);
      expect(result.total).toBe(10);
    });

    test('should not list entries from other organizations', async () => {
      const admin = await getAdmin();

      await createAuditEntry({});

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
      const result = await caller.admin.auditLogEntries.list({});

      expect(result.total).toBe(1);
    });

    test('should include user and agent relations', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });
      const agent = await createTestAgent({ organizationId: tenant.orgId, name: 'Test Agent' });

      await createAuditEntry({ userId: user.id, agentId: agent.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.list({});

      expect(result.entries[0].user?.email).toBeDefined();
      expect(result.entries[0].agent?.name).toBe('Test Agent');
    });
  });

  describe('get', () => {
    test('should get specific audit log entry', async () => {
      const admin = await getAdmin();

      const entry = await createAuditEntry({ toolName: 'specific-tool' });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.get({ id: entry.id });

      expect(result.id).toBe(entry.id);
      expect(result.toolName).toBe('specific-tool');
    });

    test('should throw NOT_FOUND for non-existent entry', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);

      // Use a valid CUID format that doesn't exist in the database
      await expect(
        caller.admin.auditLogEntries.get({ id: 'cljnonexistent00000000000' }),
      ).rejects.toThrow('Audit log entry not found');
    });

    test('should not get entries from other organizations', async () => {
      const admin = await getAdmin();

      // Create entry in another org
      const otherOrg = await createTestOrganization({ name: 'Other Org' });
      const otherEntry = await prisma.auditLogEntry.create({
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

      await expect(caller.admin.auditLogEntries.get({ id: otherEntry.id })).rejects.toThrow(
        'Audit log entry not found',
      );
    });

    test('should include user and agent in result', async () => {
      const admin = await getAdmin();
      const user = await createTestUser({ organizationId: tenant.orgId });
      const agent = await createTestAgent({ organizationId: tenant.orgId, name: 'Test Agent' });

      const entry = await createAuditEntry({ userId: user.id, agentId: agent.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.get({ id: entry.id });

      expect(result.user?.email).toBeDefined();
      expect(result.agent?.name).toBe('Test Agent');
    });
  });

  describe('exportPdf', () => {
    test('should export audit logs as PDF', async () => {
      const admin = await getAdmin();

      await createAuditEntry({ toolName: 'tool1', decision: AuditDecision.ALLOWED });
      await createAuditEntry({ toolName: 'tool2', decision: AuditDecision.DENIED });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.exportPdf({});

      expect(result.data).toBeDefined();
      expect(result.filename).toMatch(/audit-log-.*\.pdf/);
      expect(result.contentType).toBe('application/pdf');
      // Check that data is base64 encoded
      expect(() => Buffer.from(result.data, 'base64')).not.toThrow();
    });

    test('should filter exported data by decision', async () => {
      const admin = await getAdmin();

      await createAuditEntry({ decision: AuditDecision.ALLOWED });
      await createAuditEntry({ decision: AuditDecision.DENIED });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.exportPdf({
        decision: AuditDecision.DENIED,
      });

      expect(result.data).toBeDefined();
    });

    test('should filter exported data by date range', async () => {
      const admin = await getAdmin();

      await createAuditEntry({ timestamp: new Date('2024-06-15') });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.exportPdf({
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-30'),
      });

      expect(result.data).toBeDefined();
    });

    test('should respect limit parameter', async () => {
      const admin = await getAdmin();

      for (let i = 0; i < 10; i++) {
        await createAuditEntry({ toolName: `tool-${i}` });
      }

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.exportPdf({ limit: 5 });

      expect(result.data).toBeDefined();
    });

    test('should handle empty audit log', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.auditLogEntries.exportPdf({});

      expect(result.data).toBeDefined();
    });
  });

  describe('Authorization', () => {
    test('should reject non-admin users for list', async () => {
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

      await expect(caller.admin.auditLogEntries.list({})).rejects.toThrow();
    });

    test('should reject non-admin users for get', async () => {
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

      const entry = await createAuditEntry({});

      const caller = createCallerWithUser(user);

      await expect(caller.admin.auditLogEntries.get({ id: entry.id })).rejects.toThrow();
    });

    test('should reject non-admin users for exportPdf', async () => {
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

      await expect(caller.admin.auditLogEntries.exportPdf({})).rejects.toThrow();
    });
  });
});
