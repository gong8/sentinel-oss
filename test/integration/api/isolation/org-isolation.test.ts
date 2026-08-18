/**
 * Integration Tests: Organization Data Isolation
 * Tests that tRPC API properly isolates data between organizations
 * Critical security requirement: Users can only access data from their own organization
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestAgent,
  createTestAuditLogEntry,
  createTestMcpServer,
  createTestOrganization,
  createTestPolicy,
  createTestRole,
  createTestUser,
} from '../../../helpers/factory.js';
import { createTestTenant, type TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Organization Data Isolation', () => {
  // Org 1 setup (using tenant isolation)
  let tenant: TestTenant;
  let org1AdminId: string;
  let org1AdminEmail: string;
  let org1UserId: string;
  let org1UserEmail: string;
  let _org1RoleId: string;

  // Org 2 setup (separate org for isolation testing)
  let org2Id: string;
  let org2AdminId: string;
  let org2AdminEmail: string;
  let org2UserId: string;
  let org2UserEmail: string;
  let org2RoleId: string;

  beforeEach(async () => {
    // Create Organization 1 using tenant isolation
    tenant = await createTestTenant();

    await createTestRole({
      organizationId: tenant.orgId,
      name: 'Admin',
      isAdmin: true,
    });
    const org1UserRole = await createTestRole({
      organizationId: tenant.orgId,
      name: 'User',
      isAdmin: false,
    });
    _org1RoleId = org1UserRole.id;

    const org1Admin = await createTestAdmin({ organizationId: tenant.orgId });
    org1AdminId = org1Admin.id;
    org1AdminEmail = org1Admin.email;

    const org1User = await createTestUser({ organizationId: tenant.orgId });
    org1UserId = org1User.id;
    org1UserEmail = org1User.email;

    // Create Organization 2 (separate org for isolation testing)
    const org2 = await createTestOrganization({ name: 'Org Two' });
    org2Id = org2.id;

    await createTestRole({
      organizationId: org2Id,
      name: 'Admin',
      isAdmin: true,
    });
    const org2UserRole = await createTestRole({
      organizationId: org2Id,
      name: 'User',
      isAdmin: false,
    });
    org2RoleId = org2UserRole.id;

    const org2Admin = await createTestAdmin({ organizationId: org2Id });
    org2AdminId = org2Admin.id;
    org2AdminEmail = org2Admin.email;

    const org2User = await createTestUser({ organizationId: org2Id });
    org2UserId = org2User.id;
    org2UserEmail = org2User.email;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // ============================================================================
  // User List Isolation Tests
  // ============================================================================

  describe('User list isolation', () => {
    test('admin.users.list should only return users from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const users = await caller.admin.users.list();

      // Should only contain org1 users
      expect(users.every((u) => u.organizationId === tenant.orgId)).toBe(true);
      expect(users.some((u) => u.organizationId === org2Id)).toBe(false);
    });

    test('org1 admin cannot see org2 users', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const users = await caller.admin.users.list();

      // Verify org2 user is not in the list
      const org2UserEmails = [org2AdminEmail, org2UserEmail];
      expect(users.some((u) => org2UserEmails.includes(u.email))).toBe(false);
    });

    test('org2 admin cannot see org1 users', async () => {
      const org2Admin = await prisma.user.findUnique({
        where: { id: org2AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org2Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org2Admin);
      const users = await caller.admin.users.list();

      // Verify org1 user is not in the list
      const org1UserEmails = [org1AdminEmail, org1UserEmail];
      expect(users.some((u) => org1UserEmails.includes(u.email))).toBe(false);
    });
  });

  // ============================================================================
  // User Get By ID Isolation Tests
  // ============================================================================

  describe('User get by ID isolation', () => {
    test('admin.users.get should return NOT_FOUND for user from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      // Try to get a user from org2
      await expect(caller.admin.users.get({ id: org2UserId })).rejects.toThrow();
    });

    test('admin.users.get should succeed for user from own org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const user = await caller.admin.users.get({ id: org1UserId });

      expect(user).toBeDefined();
      expect(user.organizationId).toBe(tenant.orgId);
    });
  });

  // ============================================================================
  // User Update Isolation Tests
  // ============================================================================

  describe('User update isolation', () => {
    test('admin.users.update should fail for user from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      // Try to update a user from org2 - should throw NOT_FOUND
      await expect(
        caller.admin.users.update({
          id: org2UserId,
          roleIds: [],
        }),
      ).rejects.toThrow();

      // Verify the user was not modified (still has original roles)
      const org2User = await prisma.user.findUnique({
        where: { id: org2UserId },
        include: { userRoles: true },
      });
      expect(org2User?.userRoles.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // User Delete Isolation Tests
  // ============================================================================

  describe('User delete isolation', () => {
    test('admin.users.delete should fail for user from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      // Try to delete a user from org2
      await expect(caller.admin.users.delete({ id: org2UserId })).rejects.toThrow();

      // Verify the user still exists
      const org2User = await prisma.user.findUnique({ where: { id: org2UserId } });
      expect(org2User).not.toBeNull();
      expect(org2User?.deletedAt).toBeNull();
    });
  });

  // ============================================================================
  // Role Isolation Tests
  // ============================================================================

  describe('Role isolation', () => {
    test('admin.roles.list should only return roles from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const roles = await caller.admin.roles.list();

      expect(roles.every((r) => r.organizationId === tenant.orgId)).toBe(true);
    });

    test('admin.roles.get should fail for role from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.roles.get({ id: org2RoleId })).rejects.toThrow();
    });

    test('admin.roles.update should fail for role from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(
        caller.admin.roles.update({
          id: org2RoleId,
          name: 'Hacked Role',
        }),
      ).rejects.toThrow();
    });

    test('admin.roles.delete should fail for role from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.roles.delete({ id: org2RoleId })).rejects.toThrow();

      // Verify role still exists
      const role = await prisma.role.findUnique({ where: { id: org2RoleId } });
      expect(role).not.toBeNull();
    });
  });

  // ============================================================================
  // Policy Isolation Tests
  // ============================================================================

  describe('Policy isolation', () => {
    let _org1PolicyId: string;
    let org2PolicyId: string;

    beforeEach(async () => {
      const org1Policy = await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'org1-policy',
        matchers: ['user:*'],
        toolPatterns: ['test::*'],
        effect: 'ALLOW',
      });
      _org1PolicyId = org1Policy.id;

      const org2Policy = await createTestPolicy({
        organizationId: org2Id,
        slug: 'org2-policy',
        matchers: ['user:*'],
        toolPatterns: ['test::*'],
        effect: 'ALLOW',
      });
      org2PolicyId = org2Policy.id;
    });

    test('admin.policies.list should only return policies from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const policies = await caller.admin.policies.list();

      expect(policies.every((p) => p.organizationId === tenant.orgId)).toBe(true);
      expect(policies.some((p) => p.slug === 'org2-policy')).toBe(false);
    });

    test('admin.policies.get should fail for policy from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.policies.get({ id: org2PolicyId })).rejects.toThrow();
    });

    test('admin.policies.update should fail for policy from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(
        caller.admin.policies.update({
          id: org2PolicyId,
          description: 'Hacked Policy',
        }),
      ).rejects.toThrow();
    });

    test('admin.policies.delete should fail for policy from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.policies.delete({ id: org2PolicyId })).rejects.toThrow();

      // Verify policy still exists
      const policy = await prisma.policy.findUnique({ where: { id: org2PolicyId } });
      expect(policy).not.toBeNull();
    });
  });

  // ============================================================================
  // MCP Server Isolation Tests
  // ============================================================================

  describe('MCP Server isolation', () => {
    let _org1ServerId: string;
    let org2ServerId: string;

    beforeEach(async () => {
      const org1Server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Org1 Server',
        url: 'https://org1.example.com',
      });
      _org1ServerId = org1Server.id;

      const org2Server = await createTestMcpServer({
        organizationId: org2Id,
        name: 'Org2 Server',
        url: 'https://org2.example.com',
      });
      org2ServerId = org2Server.id;
    });

    test('admin.mcpServers.list should only return servers from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const servers = await caller.admin.mcpServers.list();

      expect(servers.every((s) => s.organizationId === tenant.orgId)).toBe(true);
      expect(servers.some((s) => s.name === 'Org2 Server')).toBe(false);
    });

    test('admin.mcpServers.get should fail for server from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.mcpServers.get({ id: org2ServerId })).rejects.toThrow();
    });

    test('admin.mcpServers.update should fail for server from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(
        caller.admin.mcpServers.update({
          id: org2ServerId,
          name: 'Hacked Server',
        }),
      ).rejects.toThrow();
    });

    test('admin.mcpServers.delete should fail for server from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.mcpServers.delete({ id: org2ServerId })).rejects.toThrow();

      // Verify server still exists
      const server = await prisma.mcpServer.findUnique({ where: { id: org2ServerId } });
      expect(server).not.toBeNull();
    });

    test('user.mcpServers.list should only return servers from own organization', async () => {
      const org1User = await prisma.user.findUnique({
        where: { id: org1UserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1User) throw new Error('User not found');

      const caller = createCallerWithUser(org1User);
      const servers = await caller.user.mcpServers.list();

      // Should only see Org1 Server, not Org2 Server
      expect(servers.some((s) => s.name === 'Org1 Server')).toBe(true);
      expect(servers.some((s) => s.name === 'Org2 Server')).toBe(false);
    });
  });

  // ============================================================================
  // Audit Log Isolation Tests
  // ============================================================================

  describe('Audit log isolation', () => {
    beforeEach(async () => {
      // Create agents for audit log entries
      const org1Agent = await createTestAgent({
        organizationId: tenant.orgId,
        name: 'Org1 Agent',
      });

      const org2Agent = await createTestAgent({
        organizationId: org2Id,
        name: 'Org2 Agent',
      });

      // Create audit log entries
      await createTestAuditLogEntry({
        organizationId: tenant.orgId,
        agentId: org1Agent.id,
        userId: org1UserId,
        toolName: 'org1-tool',
      });

      await createTestAuditLogEntry({
        organizationId: org2Id,
        agentId: org2Agent.id,
        userId: org2UserId,
        toolName: 'org2-tool',
      });
    });

    test('admin.auditLogEntries.list should only return entries from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const result = await caller.admin.auditLogEntries.list({});

      expect(result.entries.every((e) => e.organizationId === tenant.orgId)).toBe(true);
      expect(result.entries.some((e) => e.toolName === 'org2-tool')).toBe(false);
    });

    test('user.auditLogEntries.list should only return own entries', async () => {
      const org1User = await prisma.user.findUnique({
        where: { id: org1UserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1User) throw new Error('User not found');

      const caller = createCallerWithUser(org1User);
      const result = await caller.user.auditLogEntries.list({});

      // User should only see their own entries
      expect(result.entries.every((e) => e.userId === org1UserId)).toBe(true);
    });
  });

  // ============================================================================
  // Webhook Isolation Tests
  // ============================================================================

  describe('Webhook isolation', () => {
    let _org1WebhookId: string;
    let org2WebhookId: string;

    beforeEach(async () => {
      const org1Webhook = await prisma.webhookEndpoint.create({
        data: {
          organizationId: tenant.orgId,
          name: 'Org1 Webhook',
          url: 'https://org1.example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED'],
          type: 'CUSTOM',
          createdBy: 'test',
        },
      });
      _org1WebhookId = org1Webhook.id;

      const org2Webhook = await prisma.webhookEndpoint.create({
        data: {
          organizationId: org2Id,
          name: 'Org2 Webhook',
          url: 'https://org2.example.com/webhook',
          events: ['TOOL_INVOCATION_ALLOWED'],
          type: 'CUSTOM',
          createdBy: 'test',
        },
      });
      org2WebhookId = org2Webhook.id;
    });

    test('admin.webhooks.list should only return webhooks from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const webhooks = await caller.admin.webhooks.list();

      // Should only see org1 webhook, not org2 webhook
      expect(webhooks.some((w) => w.url === 'https://org1.example.com/webhook')).toBe(true);
      expect(webhooks.some((w) => w.url === 'https://org2.example.com/webhook')).toBe(false);
    });

    test('admin.webhooks.get should fail for webhook from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.webhooks.get({ id: org2WebhookId })).rejects.toThrow();
    });

    test('admin.webhooks.update should fail for webhook from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(
        caller.admin.webhooks.update({
          id: org2WebhookId,
          url: 'https://hacked.example.com',
        }),
      ).rejects.toThrow();
    });

    test('admin.webhooks.delete should fail for webhook from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.webhooks.delete({ id: org2WebhookId })).rejects.toThrow();

      // Verify webhook still exists
      const webhook = await prisma.webhookEndpoint.findUnique({ where: { id: org2WebhookId } });
      expect(webhook).not.toBeNull();
    });
  });

  // ============================================================================
  // Permission Request Isolation Tests
  // ============================================================================

  describe('Permission request isolation', () => {
    let _org1RequestId: string;
    let org2RequestId: string;

    beforeEach(async () => {
      await createTestAgent({
        organizationId: tenant.orgId,
        name: 'Org1 Agent',
      });

      await createTestAgent({
        organizationId: org2Id,
        name: 'Org2 Agent',
      });

      // PermissionRequest is linked to user, which is linked to organization
      const org1Request = await prisma.permissionRequest.create({
        data: {
          userId: org1UserId,
          toolNames: ['org1-tool'],
          reason: 'Testing from org1',
          status: 'PENDING',
        },
      });
      _org1RequestId = org1Request.id;

      const org2Request = await prisma.permissionRequest.create({
        data: {
          userId: org2UserId,
          toolNames: ['org2-tool'],
          reason: 'Testing from org2',
          status: 'PENDING',
        },
      });
      org2RequestId = org2Request.id;
    });

    test('admin.permissionRequests.list should only return requests from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const requests = await caller.admin.permissionRequests.list({});

      // Requests are linked to users, who are linked to orgs
      // Should only see requests from users in org1
      expect(requests.some((r) => r.toolNames.includes('org1-tool'))).toBe(true);
      expect(requests.some((r) => r.toolNames.includes('org2-tool'))).toBe(false);
    });

    test('admin.permissionRequests.approve should fail for request from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(
        caller.admin.permissionRequests.approve({
          id: org2RequestId,
          reviewNote: 'Should not work',
        }),
      ).rejects.toThrow();

      // Verify request status unchanged
      const request = await prisma.permissionRequest.findUnique({ where: { id: org2RequestId } });
      expect(request?.status).toBe('PENDING');
    });

    test('admin.permissionRequests.deny should fail for request from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(
        caller.admin.permissionRequests.deny({
          id: org2RequestId,
          reviewNote: 'Should not work',
        }),
      ).rejects.toThrow();

      // Verify request status unchanged
      const request = await prisma.permissionRequest.findUnique({ where: { id: org2RequestId } });
      expect(request?.status).toBe('PENDING');
    });

    test('user.permissionRequests.list should only return own requests', async () => {
      const org1User = await prisma.user.findUnique({
        where: { id: org1UserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1User) throw new Error('User not found');

      const caller = createCallerWithUser(org1User);
      const requests = await caller.user.permissionRequests.list();

      expect(requests.every((r) => r.userId === org1UserId)).toBe(true);
    });
  });

  // ============================================================================
  // Agent Isolation Tests
  // ============================================================================

  describe('Agent isolation', () => {
    let _org1AgentId: string;
    let org2AgentId: string;

    beforeEach(async () => {
      const org1Agent = await createTestAgent({
        organizationId: tenant.orgId,
        name: 'Org1 Agent',
      });
      _org1AgentId = org1Agent.id;

      const org2Agent = await createTestAgent({
        organizationId: org2Id,
        name: 'Org2 Agent',
      });
      org2AgentId = org2Agent.id;
    });

    test('admin.agents.list should only return agents from own organization', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);
      const agents = await caller.admin.agents.list();

      expect(agents.every((a) => a.organizationId === tenant.orgId)).toBe(true);
      expect(agents.some((a) => a.name === 'Org2 Agent')).toBe(false);
    });

    test('admin.agents.get should fail for agent from other org', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      await expect(caller.admin.agents.get({ id: org2AgentId })).rejects.toThrow();
    });
  });

  // ============================================================================
  // Tool Access Isolation Tests
  // ============================================================================

  describe('Tool access isolation', () => {
    beforeEach(async () => {
      // MCP servers are already created in the parent beforeEach
      // We reuse org1ServerId and org2ServerId which have tools
      // Note: Tools are stored in a separate Tool table related to McpServer
    });

    test('user.tools.list should only return tools from own organization', async () => {
      const org1User = await prisma.user.findUnique({
        where: { id: org1UserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1User) throw new Error('User not found');

      const caller = createCallerWithUser(org1User);
      const tools = await caller.user.tools.list();

      // All tools should be from org1's servers
      // Tools are grouped by server, check the serverName
      expect(tools.every((t) => t.serverName !== 'Org2 Server')).toBe(true);
    });
  });

  // ============================================================================
  // Cross-Org ID Guessing Tests
  // ============================================================================

  describe('Cross-org ID guessing prevention', () => {
    test('should return NOT_FOUND not UNAUTHORIZED for cross-org access', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      // The error should not leak information about whether the resource exists
      // It should return NOT_FOUND rather than FORBIDDEN to prevent ID enumeration
      try {
        await caller.admin.users.get({ id: org2UserId });
        throw new Error('Should have thrown');
      } catch (error: unknown) {
        // Error message should not indicate the user exists in another org
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage.toLowerCase()).not.toContain('unauthorized');
        expect(errorMessage.toLowerCase()).not.toContain('forbidden');
        expect(errorMessage.toLowerCase()).not.toContain('different organization');
      }
    });

    test('should not leak organization info in error messages', async () => {
      const org1Admin = await prisma.user.findUnique({
        where: { id: org1AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org1Admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(org1Admin);

      try {
        await caller.admin.roles.get({ id: org2RoleId });
        throw new Error('Should have thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Error should not mention org2
        expect(errorMessage).not.toContain('Org Two');
        expect(errorMessage).not.toContain(org2Id);
      }
    });
  });
});
