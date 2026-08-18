/**
 * Integration tests for miscellaneous Admin Routers
 * Tests for agents, organizations, auditLogEntries, and permissionRequests
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

describe.skipIf(!hasDatabaseUrl())('Admin Miscellaneous Routers', () => {
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

  describe('Agents Router', () => {
    describe('list', () => {
      test('should list all agents in organization', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        await createTestAgent({ organizationId: tenant.orgId, name: 'Agent 1' });
        await createTestAgent({ organizationId: tenant.orgId, name: 'Agent 2' });

        const caller = createCallerWithUser(admin);
        const agents = await caller.admin.agents.list();

        expect(agents.length).toBeGreaterThanOrEqual(2);
        expect(agents.every((a) => a.organizationId === tenant.orgId)).toBe(true);
      });

      test('should not list agents from other organizations', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const org2 = await createTestOrganization({ name: 'Other Org' });
        await createTestAgent({ organizationId: org2.id, name: 'Other Agent' });
        await createTestAgent({ organizationId: tenant.orgId, name: 'My Agent' });

        const caller = createCallerWithUser(admin);
        const agents = await caller.admin.agents.list();

        expect(agents.every((a) => a.organizationId === tenant.orgId)).toBe(true);
        expect(agents.some((a) => a.name === 'Other Agent')).toBe(false);
      });
    });

    describe('get', () => {
      test('should get specific agent by id', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const agent = await createTestAgent({ organizationId: tenant.orgId, name: 'Test Agent' });

        const caller = createCallerWithUser(admin);
        const result = await caller.admin.agents.get({ id: agent.id });

        expect(result.id).toBe(agent.id);
        expect(result.name).toBe('Test Agent');
      });

      test('should throw NOT_FOUND for non-existent agent', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithUser(admin);
        await expect(caller.admin.agents.get({ id: 'cm00000000000nonexistent' })).rejects.toThrow(
          'Agent not found',
        );
      });

      test('should not return agents from other organizations', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const org2 = await createTestOrganization({ name: 'Other Org' });
        const otherAgent = await createTestAgent({ organizationId: org2.id, name: 'Other Agent' });

        const caller = createCallerWithUser(admin);
        await expect(caller.admin.agents.get({ id: otherAgent.id })).rejects.toThrow(
          'Agent not found',
        );
      });
    });

    describe('create', () => {
      test('should create agent with name', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithUser(admin);
        const agent = await caller.admin.agents.create({
          name: 'New Agent',
        });

        expect(agent.name).toBe('New Agent');
        expect(agent.organizationId).toBe(tenant.orgId);
      });
    });

    describe('delete', () => {
      test('should delete agent', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const agent = await createTestAgent({ organizationId: tenant.orgId, name: 'Test Agent' });

        const caller = createCallerWithUser(admin);
        const result = await caller.admin.agents.delete({ id: agent.id });

        expect(result.success).toBe(true);

        const deleted = await prisma.agent.findUnique({ where: { id: agent.id } });
        expect(deleted).not.toBeNull();
        expect(deleted?.deletedAt).not.toBeNull();
        expect(deleted?.deletedBy).toBe(admin.id);
      });

      test('should throw NOT_FOUND for non-existent agent', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithUser(admin);
        await expect(
          caller.admin.agents.delete({ id: 'cm00000000000nonexistent' }),
        ).rejects.toThrow('Agent not found');
      });

      test('should not delete agents from other organizations', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const org2 = await createTestOrganization({ name: 'Other Org' });
        const otherAgent = await createTestAgent({ organizationId: org2.id, name: 'Other Agent' });

        const caller = createCallerWithUser(admin);
        await expect(caller.admin.agents.delete({ id: otherAgent.id })).rejects.toThrow(
          'Agent not found',
        );
      });
    });
  });

  describe('Organizations Router', () => {
    describe('get', () => {
      test('should get current organization', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithUser(admin);
        const org = await caller.admin.organizations.get();

        expect(org?.id).toBe(tenant.orgId);
        expect(org?.name).toBeTruthy();
      });
    });

    describe('update', () => {
      test('should update organization name', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithUser(admin);
        const updated = await caller.admin.organizations.update({
          name: 'Updated Organization Name',
        });

        expect(updated.name).toBe('Updated Organization Name');
        expect(updated.id).toBe(tenant.orgId);
      });
    });
  });

  describe('Audit Log Entries Router', () => {
    describe('list', () => {
      test('should list audit log entries for organization', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        // Create audit log entries
        await prisma.auditLogEntry.createMany({
          data: [
            {
              organizationId: tenant.orgId,
              userId: adminId,
              toolName: 'github.com::getFile',
              parameters: {},
              decision: AuditDecision.ALLOWED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
            {
              organizationId: tenant.orgId,
              userId: adminId,
              toolName: 'github.com::createPR',
              parameters: {},
              decision: AuditDecision.DENIED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
          ],
        });

        const caller = createCallerWithUser(admin);
        const entries = await caller.admin.auditLogEntries.list({});

        expect(entries.entries.length).toBeGreaterThanOrEqual(2);
        expect(entries.entries.every((e) => e.organizationId === tenant.orgId)).toBe(true);
      });

      test('should filter by decision', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        await prisma.auditLogEntry.createMany({
          data: [
            {
              organizationId: tenant.orgId,
              userId: adminId,
              toolName: 'tool1',
              parameters: {},
              decision: AuditDecision.ALLOWED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
            {
              organizationId: tenant.orgId,
              userId: adminId,
              toolName: 'tool2',
              parameters: {},
              decision: AuditDecision.DENIED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
          ],
        });

        const caller = createCallerWithUser(admin);
        const entries = await caller.admin.auditLogEntries.list({
          decision: AuditDecision.DENIED,
        });

        expect(entries.entries.every((e) => e.decision === AuditDecision.DENIED)).toBe(true);
      });

      test('should filter by tool name', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        await prisma.auditLogEntry.createMany({
          data: [
            {
              organizationId: tenant.orgId,
              userId: adminId,
              toolName: 'github.com::getFile',
              parameters: {},
              decision: AuditDecision.ALLOWED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
            {
              organizationId: tenant.orgId,
              userId: adminId,
              toolName: 'Notion::createPage',
              parameters: {},
              decision: AuditDecision.ALLOWED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
          ],
        });

        const caller = createCallerWithUser(admin);
        const entries = await caller.admin.auditLogEntries.list({
          toolName: 'github.com::getFile',
        });

        expect(entries.entries.every((e) => e.toolName === 'github.com::getFile')).toBe(true);
      });

      test('should support pagination', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        // Create 15 entries
        const entries = Array.from({ length: 15 }, (_, i) => ({
          organizationId: tenant.orgId,
          userId: adminId,
          toolName: `tool${i}`,
          parameters: {},
          decision: AuditDecision.ALLOWED,
          policyIds: [] as string[],
          matchedPolicyIds: [] as string[],
          userRoles: [] as string[],
        }));

        await prisma.auditLogEntry.createMany({ data: entries });

        const caller = createCallerWithUser(admin);
        const result = await caller.admin.auditLogEntries.list({
          limit: 10,
        });

        expect(result.entries.length).toBe(10);
        expect(result.total).toBe(15);
      });

      test('should not leak entries from other organizations', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const org2 = await createTestOrganization({ name: 'Other Org' });
        const otherUser = await createTestUser({ organizationId: org2.id });

        await prisma.auditLogEntry.createMany({
          data: [
            {
              organizationId: tenant.orgId,
              userId: adminId,
              toolName: 'my-tool',
              parameters: {},
              decision: AuditDecision.ALLOWED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
            {
              organizationId: org2.id,
              userId: otherUser.id,
              toolName: 'other-tool',
              parameters: {},
              decision: AuditDecision.ALLOWED,
              policyIds: [],
              matchedPolicyIds: [],
              userRoles: [],
            },
          ],
        });

        const caller = createCallerWithUser(admin);
        const entries = await caller.admin.auditLogEntries.list({});

        expect(entries.entries.every((e) => e.organizationId === tenant.orgId)).toBe(true);
        expect(entries.entries.some((e) => e.toolName === 'other-tool')).toBe(false);
      });
    });

    describe('get', () => {
      test('should get specific audit log entry', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const entry = await prisma.auditLogEntry.create({
          data: {
            organizationId: tenant.orgId,
            userId: adminId,
            toolName: 'github.com::getFile',
            parameters: { repo: 'test/repo' },
            decision: AuditDecision.ALLOWED,
            policyIds: ['policy-1'],
            matchedPolicyIds: [],
            userRoles: [],
          },
        });

        const caller = createCallerWithUser(admin);
        const result = await caller.admin.auditLogEntries.get({ id: entry.id });

        expect(result.id).toBe(entry.id);
        expect(result.toolName).toBe('github.com::getFile');
      });

      test('should throw NOT_FOUND for non-existent entry', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithUser(admin);
        // Use valid CUID format that doesn't exist in database
        await expect(
          caller.admin.auditLogEntries.get({ id: 'cljnonexistent00000000000' }),
        ).rejects.toThrow('Audit log entry not found');
      });

      test('should not return entries from other organizations', async () => {
        const admin = await prisma.user.findUnique({
          where: { id: adminId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!admin) throw new Error('Admin not found');

        const org2 = await createTestOrganization({ name: 'Other Org' });
        const otherUser = await createTestUser({ organizationId: org2.id });

        const otherEntry = await prisma.auditLogEntry.create({
          data: {
            organizationId: org2.id,
            userId: otherUser.id,
            toolName: 'tool',
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
    });
  });
});
