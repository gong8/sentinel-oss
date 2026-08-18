/**
 * Integration tests for Workspace Chat Router
 * Tests chat settings, conversation management, and permission request linking
 */

import { prisma, WorkspaceMemberRole } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestRole, createTestUser, createTestWorkspace } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithAuth } from '../../helpers/trpc.js';

/**
 * Helper to load user with all relations needed for auth context
 */
async function loadUserForAuth(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: true } },
      workspaceMemberships: {
        where: { workspace: { deletedAt: null } },
        select: { workspaceId: true, role: true },
      },
      orgOwnership: true,
    },
  });
}

/**
 * Creates auth context from a loaded user
 */
function createAuthContextFromUser(user: NonNullable<Awaited<ReturnType<typeof loadUserForAuth>>>) {
  const isAdmin = user.userRoles.some((ur) => ur.role.isAdmin);
  const isOrgOwner = user.orgOwnership.length > 0;
  const workspaceIds = user.workspaceMemberships.map((wm) => wm.workspaceId);
  const adminWorkspaceIds = user.workspaceMemberships
    .filter((wm) => wm.role === WorkspaceMemberRole.ADMIN)
    .map((wm) => wm.workspaceId);

  return {
    user,
    organizationId: user.organizationId,
    roles: user.userRoles.map((ur) => ur.role.name),
    isAdmin,
    isOrgOwner,
    workspaceIds,
    adminWorkspaceIds,
  };
}

describe.skipIf(!hasDatabaseUrl())('Workspace Chat Router', () => {
  let tenant: TestTenant;
  let workspaceId: string;
  let adminUserId: string;
  let memberUserId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    // Create admin role
    const adminRole = await createTestRole({
      organizationId: tenant.orgId,
      name: 'Admin',
      isAdmin: true,
    });

    // Create workspace
    const workspace = await createTestWorkspace({
      organizationId: tenant.orgId,
      name: 'Test Workspace',
    });
    workspaceId = workspace.id;

    // Create admin user with workspace admin access
    const adminUser = await createTestUser({
      organizationId: tenant.orgId,
      email: 'admin@test.com',
    });
    adminUserId = adminUser.id;

    // Assign admin role to the user
    await prisma.userRole.create({
      data: {
        userId: adminUserId,
        roleId: adminRole.id,
      },
    });

    // Add admin as workspace admin
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: adminUserId,
        role: WorkspaceMemberRole.ADMIN,
      },
    });

    // Create member user
    const memberUser = await createTestUser({
      organizationId: tenant.orgId,
      email: 'member@test.com',
    });
    memberUserId = memberUser.id;

    // Add as workspace member
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: memberUserId,
        role: WorkspaceMemberRole.MEMBER,
      },
    });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('chatSettings', () => {
    describe('get', () => {
      test('workspace admin should get default settings when none exist', async () => {
        const admin = await loadUserForAuth(adminUserId);
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithAuth(createAuthContextFromUser(admin));
        const settings = await caller.workspace.chatSettings.get({ workspaceId });

        expect(settings).toBeDefined();
        expect(settings.enabled).toBe(true);
        expect(settings.adminChatVisibility).toBe(false);
        expect(settings.systemPrompt).toBeNull();
        expect(settings.monthlyMessageQuota).toBeNull();
        expect(settings.monthlyTokenQuota).toBeNull();
      });

      test('non-admin member should not be able to get settings', async () => {
        const member = await loadUserForAuth(memberUserId);
        if (!member) throw new Error('Member not found');

        const caller = createCallerWithAuth(createAuthContextFromUser(member));

        await expect(caller.workspace.chatSettings.get({ workspaceId })).rejects.toThrow();
      });
    });

    describe('update', () => {
      test('workspace admin should update chat settings', async () => {
        const admin = await loadUserForAuth(adminUserId);
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithAuth(createAuthContextFromUser(admin));

        // Update settings
        const updated = await caller.workspace.chatSettings.update({
          workspaceId,
          enabled: false,
          adminChatVisibility: true,
          systemPrompt: 'Custom system prompt',
          monthlyMessageQuota: 1000,
          monthlyTokenQuota: 100000,
        });

        expect(updated.enabled).toBe(false);
        expect(updated.adminChatVisibility).toBe(true);
        expect(updated.systemPrompt).toBe('Custom system prompt');
        expect(updated.monthlyMessageQuota).toBe(1000);
        expect(updated.monthlyTokenQuota).toBe(100000);

        // Verify persistence
        const fetched = await caller.workspace.chatSettings.get({ workspaceId });
        expect(fetched.enabled).toBe(false);
        expect(fetched.adminChatVisibility).toBe(true);
      });

      test('should create admin action log on settings update', async () => {
        const admin = await loadUserForAuth(adminUserId);
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithAuth(createAuthContextFromUser(admin));

        await caller.workspace.chatSettings.update({
          workspaceId,
          enabled: true,
        });

        // Check admin action log was created
        const actionLog = await prisma.adminActionLog.findFirst({
          where: {
            organizationId: tenant.orgId,
            resourceId: workspaceId,
          },
          orderBy: { timestamp: 'desc' },
        });

        expect(actionLog).toBeDefined();
        expect(actionLog?.adminUserId).toBe(adminUserId);
      });
    });

    describe('getUsageStats', () => {
      test('workspace admin should get usage stats', async () => {
        const admin = await loadUserForAuth(adminUserId);
        if (!admin) throw new Error('Admin not found');

        const caller = createCallerWithAuth(createAuthContextFromUser(admin));
        const stats = await caller.workspace.chatSettings.getUsageStats({ workspaceId });

        expect(stats).toBeDefined();
        expect(stats.totalMessages).toBe(0);
        expect(stats.totalInputTokens).toBe(0);
        expect(stats.totalOutputTokens).toBe(0);
      });
    });
  });

  describe('chat conversations', () => {
    describe('listConversations', () => {
      test('member should list their own conversations', async () => {
        const member = await loadUserForAuth(memberUserId);
        if (!member) throw new Error('Member not found');

        // Create a conversation for the member
        await prisma.workspaceChatConversation.create({
          data: {
            workspaceId,
            userId: memberUserId,
            title: 'Test Conversation',
          },
        });

        const caller = createCallerWithAuth(createAuthContextFromUser(member));
        const result = await caller.workspace.chat.listConversations({
          workspaceId,
          limit: 50,
        });

        expect(result.items.length).toBe(1);
        expect(result.items[0].title).toBe('Test Conversation');
      });

      test('member should not see other users conversations', async () => {
        const member = await loadUserForAuth(memberUserId);
        if (!member) throw new Error('Member not found');

        // Create a conversation for admin
        await prisma.workspaceChatConversation.create({
          data: {
            workspaceId,
            userId: adminUserId,
            title: 'Admin Conversation',
          },
        });

        const caller = createCallerWithAuth(createAuthContextFromUser(member));
        const result = await caller.workspace.chat.listConversations({
          workspaceId,
          limit: 50,
        });

        expect(result.items.length).toBe(0);
      });
    });

    describe('deleteConversation', () => {
      test('member should delete their own conversation', async () => {
        const member = await loadUserForAuth(memberUserId);
        if (!member) throw new Error('Member not found');

        // Create a conversation
        const conversation = await prisma.workspaceChatConversation.create({
          data: {
            workspaceId,
            userId: memberUserId,
            title: 'To Delete',
          },
        });

        const caller = createCallerWithAuth(createAuthContextFromUser(member));
        const result = await caller.workspace.chat.deleteConversation({
          workspaceId,
          conversationId: conversation.id,
        });

        expect(result.success).toBe(true);

        // Verify deletion
        const deleted = await prisma.workspaceChatConversation.findUnique({
          where: { id: conversation.id },
        });
        expect(deleted).toBeNull();
      });

      test('member should not delete another users conversation', async () => {
        const member = await loadUserForAuth(memberUserId);
        if (!member) throw new Error('Member not found');

        // Create a conversation for admin
        const conversation = await prisma.workspaceChatConversation.create({
          data: {
            workspaceId,
            userId: adminUserId,
            title: 'Admin Conversation',
          },
        });

        const caller = createCallerWithAuth(createAuthContextFromUser(member));

        await expect(
          caller.workspace.chat.deleteConversation({
            workspaceId,
            conversationId: conversation.id,
          }),
        ).rejects.toThrow('Conversation not found');
      });
    });
  });

  describe('permission request linking', () => {
    test('requestToolAccess should create linked chat message when conversationId provided', async () => {
      const member = await loadUserForAuth(memberUserId);
      if (!member) throw new Error('Member not found');

      // Create a conversation
      const conversation = await prisma.workspaceChatConversation.create({
        data: {
          workspaceId,
          userId: memberUserId,
          title: 'Test Conversation',
        },
      });

      const caller = createCallerWithAuth(createAuthContextFromUser(member));

      // Request tool access with conversationId
      const result = await caller.workspace.chat.requestToolAccess({
        workspaceId,
        toolName: 'github.com::createPR',
        reason: 'Need to create PRs for code reviews',
        conversationId: conversation.id,
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe('PENDING');

      // Verify chat message was created and linked
      const messages = await prisma.workspaceChatMessage.findMany({
        where: { conversationId: conversation.id },
      });

      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('PERMISSION_REQUEST');
      expect(messages[0].permissionRequestId).toBe(result.id);
      expect(messages[0].content).toContain('github.com::createPR');
    });

    test('requestServerAccess should create linked chat message when conversationId provided', async () => {
      const member = await loadUserForAuth(memberUserId);
      if (!member) throw new Error('Member not found');

      // Create a conversation
      const conversation = await prisma.workspaceChatConversation.create({
        data: {
          workspaceId,
          userId: memberUserId,
          title: 'Test Conversation',
        },
      });

      const caller = createCallerWithAuth(createAuthContextFromUser(member));

      // Request server access with conversationId
      const result = await caller.workspace.chat.requestServerAccess({
        workspaceId,
        serverDomain: 'github.com',
        reason: 'Need access to GitHub MCP server',
        conversationId: conversation.id,
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe('PENDING');

      // Verify chat message was created and linked
      const messages = await prisma.workspaceChatMessage.findMany({
        where: { conversationId: conversation.id },
      });

      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('PERMISSION_REQUEST');
      expect(messages[0].permissionRequestId).toBe(result.id);
      expect(messages[0].content).toContain('github.com');
    });
  });

  describe('workspaceAuditLogs', () => {
    test('workspace admin should list audit logs filtered by workspace', async () => {
      const admin = await loadUserForAuth(adminUserId);
      if (!admin) throw new Error('Admin not found');

      // Create an audit log entry for this workspace
      await prisma.auditLogEntry.create({
        data: {
          organizationId: tenant.orgId,
          workspaceId,
          userId: memberUserId,
          userEmail: 'member@test.com',
          toolName: 'test-tool',
          parameters: {},
          decision: 'ALLOWED',
          policyIds: [],
          matchedPolicyIds: [],
          userRoles: [],
        },
      });

      // Create an audit log entry for another workspace (should not appear)
      const otherWorkspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Other Workspace',
      });
      await prisma.auditLogEntry.create({
        data: {
          organizationId: tenant.orgId,
          workspaceId: otherWorkspace.id,
          userId: adminUserId,
          userEmail: 'admin@test.com',
          toolName: 'other-tool',
          parameters: {},
          decision: 'ALLOWED',
          policyIds: [],
          matchedPolicyIds: [],
          userRoles: [],
        },
      });

      const caller = createCallerWithAuth(createAuthContextFromUser(admin));
      const result = await caller.admin.workspaceAuditLogs.list({
        workspaceId,
        limit: 50,
      });

      expect(result.total).toBe(1);
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].toolName).toBe('test-tool');
    });

    test('workspace admin should get audit log stats', async () => {
      const admin = await loadUserForAuth(adminUserId);
      if (!admin) throw new Error('Admin not found');

      // Create audit log entries
      await prisma.auditLogEntry.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            workspaceId,
            userId: memberUserId,
            toolName: 'tool-a',
            parameters: {},
            decision: 'ALLOWED',
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
          {
            organizationId: tenant.orgId,
            workspaceId,
            userId: memberUserId,
            toolName: 'tool-a',
            parameters: {},
            decision: 'DENIED',
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
          {
            organizationId: tenant.orgId,
            workspaceId,
            userId: memberUserId,
            toolName: 'tool-b',
            parameters: {},
            decision: 'ALLOWED',
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
        ],
      });

      const caller = createCallerWithAuth(createAuthContextFromUser(admin));
      const stats = await caller.admin.workspaceAuditLogs.getStats({
        workspaceId,
        days: 30,
      });

      expect(stats.totalCount).toBe(3);
      expect(stats.allowedCount).toBe(2);
      expect(stats.deniedCount).toBe(1);
      expect(stats.topTools.length).toBe(2);
    });
  });
});
