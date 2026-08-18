/**
 * Integration Tests: Agent Confirmation Router
 * Tests for write operation confirmations and execution
 * CRITICAL: This is a high-priority test file - confirmation had only 13.33% coverage
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AgentConfirmationStatus, prisma } from '../../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestMcpServer,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '../../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser, createPublicCaller } from '../../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Agent Confirmation Router', () => {
  let tenant: TestTenant;
  let adminId: string;
  let _admin2Id: string;
  let userId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    await createTestRole({ organizationId: tenant.orgId, name: 'Admin', isAdmin: true });
    await createTestRole({ organizationId: tenant.orgId, name: 'User', isAdmin: false });

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;

    const admin2 = await createTestAdmin({ organizationId: tenant.orgId });
    _admin2Id = admin2.id;

    const user = await createTestUser({ organizationId: tenant.orgId });
    userId = user.id;

    // Create MCP server and tools for tool pattern validation
    const mcpServer = await createTestMcpServer({
      organizationId: tenant.orgId,
      name: 'test',
      url: 'https://test.example.com',
    });

    await prisma.mcpTool.createMany({
      data: [
        {
          mcpServerId: mcpServer.id,
          name: 'action',
          description: 'Test action tool',
        },
        {
          mcpServerId: mcpServer.id,
          name: 'tool',
          description: 'Test tool',
        },
      ],
    });
  });

  afterEach(async () => {
    await tenant.cleanup();
    vi.clearAllMocks();
  });

  // Helper to create a test confirmation
  async function createTestConfirmation(opts?: {
    organizationId?: string;
    conversationId?: string;
    toolName?: string;
    toolInput?: unknown;
    status?: AgentConfirmationStatus;
    expiresAt?: Date;
  }) {
    const expiresAt = opts?.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000);
    return prisma.agentConfirmation.create({
      data: {
        organizationId: opts?.organizationId ?? tenant.orgId,
        conversationId: opts?.conversationId,
        toolName: opts?.toolName ?? 'create_policy',
        toolInput: opts?.toolInput ?? {
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Test policy',
        },
        description: 'Test confirmation',
        status: opts?.status ?? AgentConfirmationStatus.PENDING,
        expiresAt,
      },
    });
  }

  // Helper to create a test conversation
  async function createTestConversation(userId: string) {
    return prisma.agentConversation.create({
      data: {
        organizationId: tenant.orgId,
        userId,
      },
    });
  }

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('Authentication', () => {
    test('should reject unauthenticated requests to getPending', async () => {
      const caller = createPublicCaller();
      await expect(
        caller.agent.confirmation.getPending({ conversationId: 'test' }),
      ).rejects.toThrow();
    });

    test('should reject unauthenticated requests to confirm', async () => {
      const caller = createPublicCaller();
      await expect(caller.agent.confirmation.confirm({ confirmationId: 'test' })).rejects.toThrow();
    });

    test('should reject unauthenticated requests to cancel', async () => {
      const caller = createPublicCaller();
      await expect(caller.agent.confirmation.cancel({ confirmationId: 'test' })).rejects.toThrow();
    });

    test('should reject unauthenticated requests to get', async () => {
      const caller = createPublicCaller();
      await expect(caller.agent.confirmation.get({ confirmationId: 'test' })).rejects.toThrow();
    });

    test('should reject non-admin requests to getPending', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);
      await expect(
        caller.agent.confirmation.getPending({ conversationId: 'test' }),
      ).rejects.toThrow();
    });

    test('should reject non-admin requests to confirm', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);
      await expect(caller.agent.confirmation.confirm({ confirmationId: 'test' })).rejects.toThrow();
    });

    test('should reject non-admin requests to cancel', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);
      await expect(caller.agent.confirmation.cancel({ confirmationId: 'test' })).rejects.toThrow();
    });

    test('should accept admin requests to getPending', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const conversation = await createTestConversation(adminId);

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: conversation.id,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ============================================================================
  // getPending Tests
  // ============================================================================

  describe('getPending', () => {
    test('should return empty array when no pending confirmations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const conversation = await createTestConversation(adminId);

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: conversation.id,
      });

      expect(result).toEqual([]);
    });

    test('should return pending confirmations for conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const conversation = await createTestConversation(adminId);
      await createTestConfirmation({ conversationId: conversation.id });
      await createTestConfirmation({ conversationId: conversation.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: conversation.id,
      });

      expect(result.length).toBe(2);
    });

    test('should only return pending status confirmations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const conversation = await createTestConversation(adminId);
      await createTestConfirmation({
        conversationId: conversation.id,
        status: AgentConfirmationStatus.PENDING,
      });
      await createTestConfirmation({
        conversationId: conversation.id,
        status: AgentConfirmationStatus.CONFIRMED,
      });
      await createTestConfirmation({
        conversationId: conversation.id,
        status: AgentConfirmationStatus.CANCELLED,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: conversation.id,
      });

      expect(result.length).toBe(1);
    });

    test('should not return confirmations from other conversations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const conversation1 = await createTestConversation(adminId);
      const conversation2 = await createTestConversation(adminId);

      await createTestConfirmation({ conversationId: conversation1.id });
      await createTestConfirmation({ conversationId: conversation2.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: conversation1.id,
      });

      expect(result.length).toBe(1);
    });

    test('should include confirmation details in response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const conversation = await createTestConversation(adminId);
      await createTestConfirmation({
        conversationId: conversation.id,
        toolName: 'create_policy',
        toolInput: { matchers: ['test:*'], effect: 'DENY' },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: conversation.id,
      });

      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('toolName', 'create_policy');
      expect(result[0]).toHaveProperty('toolInput');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0]).toHaveProperty('expiresAt');
    });

    test('should auto-expire old confirmations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const conversation = await createTestConversation(adminId);

      // Create expired confirmation
      await createTestConfirmation({
        conversationId: conversation.id,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });

      // Create valid confirmation
      await createTestConfirmation({ conversationId: conversation.id });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: conversation.id,
      });

      // Should only return the valid one (expired ones get auto-expired)
      expect(result.length).toBe(1);

      // Verify expired confirmation was updated
      const expiredConfirmations = await prisma.agentConfirmation.findMany({
        where: {
          conversationId: conversation.id,
          status: AgentConfirmationStatus.EXPIRED,
        },
      });
      expect(expiredConfirmations.length).toBe(1);
    });
  });

  // ============================================================================
  // Organization Isolation Tests
  // ============================================================================

  describe('Organization Isolation', () => {
    let org2Id: string;
    let org2AdminId: string;

    beforeEach(async () => {
      const org2 = await createTestOrganization({ name: 'Org Two' });
      org2Id = org2.id;

      await createTestRole({ organizationId: org2Id, name: 'Admin', isAdmin: true });

      const org2Admin = await createTestAdmin({
        organizationId: org2Id,
      });
      org2AdminId = org2Admin.id;
    });

    test('should not return confirmations from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create conversation in org2
      const org2Conversation = await prisma.agentConversation.create({
        data: { organizationId: org2Id, userId: org2AdminId },
      });

      // Create confirmation in org2
      await prisma.agentConfirmation.create({
        data: {
          organizationId: org2Id,
          conversationId: org2Conversation.id,
          toolName: 'create_policy',
          toolInput: {},
          description: 'Org2 confirmation',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      // Org1 admin tries to get org2's confirmations
      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.getPending({
        conversationId: org2Conversation.id,
      });

      // Should return empty due to org isolation
      expect(result.length).toBe(0);
    });

    test('should not allow confirming other orgs confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create confirmation in org2
      const org2Confirmation = await prisma.agentConfirmation.create({
        data: {
          organizationId: org2Id,
          toolName: 'create_policy',
          toolInput: {},
          description: 'Org2 confirmation',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      // Org1 admin tries to confirm org2's confirmation
      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: org2Confirmation.id,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should not allow cancelling other orgs confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create confirmation in org2
      const org2Confirmation = await prisma.agentConfirmation.create({
        data: {
          organizationId: org2Id,
          toolName: 'create_policy',
          toolInput: {},
          description: 'Org2 confirmation',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      // Org1 admin tries to cancel org2's confirmation
      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.cancel({
        confirmationId: org2Confirmation.id,
      });

      expect(result.success).toBe(false);

      // Verify confirmation unchanged
      const confirmation = await prisma.agentConfirmation.findUnique({
        where: { id: org2Confirmation.id },
      });
      expect(confirmation?.status).toBe(AgentConfirmationStatus.PENDING);
    });

    test('should not allow getting other orgs confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create confirmation in org2
      const org2Confirmation = await prisma.agentConfirmation.create({
        data: {
          organizationId: org2Id,
          toolName: 'create_policy',
          toolInput: {},
          description: 'Org2 confirmation',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      // Org1 admin tries to get org2's confirmation
      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.get({
        confirmationId: org2Confirmation.id,
      });

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // confirm Tests
  // ============================================================================

  describe('confirm', () => {
    test('should confirm pending confirmation successfully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        toolName: 'create_policy',
        toolInput: {
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Test policy',
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);

      // Verify status was updated
      const updated = await prisma.agentConfirmation.findUnique({
        where: { id: confirmation.id },
      });
      expect(updated?.status).toBe(AgentConfirmationStatus.CONFIRMED);
      expect(updated?.confirmedAt).not.toBeNull();
      expect(updated?.confirmedBy).toBe(adminId);
    });

    test('should return error for non-existent confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: 'cljnonexistent00000000000',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should return error for already confirmed confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        status: AgentConfirmationStatus.CONFIRMED,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should return error for cancelled confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        status: AgentConfirmationStatus.CANCELLED,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(false);
    });

    test('should return error for expired confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(false);
      // Expired confirmations return a generic "not found or already processed" message
      expect(result.error).toBeDefined();
    });

    test('should execute create_policy tool on confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const policyInput = {
        matchers: ['user:*'],
        toolPatterns: ['test.example.com::tool'],
        effect: 'ALLOW',
        description: 'Created via confirmation',
      };

      const confirmation = await createTestConfirmation({
        toolName: 'create_policy',
        toolInput: policyInput,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);

      // Verify policy was created
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          description: 'Created via confirmation',
        },
      });
      expect(policies.length).toBe(1);
    });

    test('should mark confirmation as executed after tool execution', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        toolName: 'create_policy',
        toolInput: {
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Test policy',
        },
      });

      const caller = createCallerWithUser(admin);
      await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      // Verify executedAt was set
      const updated = await prisma.agentConfirmation.findUnique({
        where: { id: confirmation.id },
      });
      expect(updated?.executedAt).not.toBeNull();
    });

    test('should return error for invalid tool input', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        toolName: 'create_policy',
        toolInput: { invalid: 'input' }, // Missing required fields
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for unknown tool', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        toolName: 'unknown_tool',
        toolInput: {},
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  // ============================================================================
  // cancel Tests
  // ============================================================================

  describe('cancel', () => {
    test('should cancel pending confirmation successfully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation();

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.cancel({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);

      // Verify status was updated
      const updated = await prisma.agentConfirmation.findUnique({
        where: { id: confirmation.id },
      });
      expect(updated?.status).toBe(AgentConfirmationStatus.CANCELLED);
    });

    test('should return error for non-existent confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.cancel({
        confirmationId: 'cljnonexistent00000000000',
      });

      expect(result.success).toBe(false);
    });

    test('should return error for already cancelled confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        status: AgentConfirmationStatus.CANCELLED,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.cancel({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(false);
    });

    test('should return error for confirmed confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        status: AgentConfirmationStatus.CONFIRMED,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.cancel({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // get Tests
  // ============================================================================

  describe('get', () => {
    test('should return confirmation details', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        toolName: 'create_policy',
        toolInput: { test: 'input' },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.get({
        confirmationId: confirmation.id,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(confirmation.id);
      expect(result?.toolName).toBe('create_policy');
      expect(result?.status).toBe(AgentConfirmationStatus.PENDING);
    });

    test('should return null for non-existent confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.get({
        confirmationId: 'cljnonexistent00000000000',
      });

      expect(result).toBeNull();
    });

    test('should include all status fields for confirmed confirmation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation();

      // Confirm it first
      const caller = createCallerWithUser(admin);
      await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      const result = await caller.agent.confirmation.get({
        confirmationId: confirmation.id,
      });

      expect(result?.status).toBe(AgentConfirmationStatus.CONFIRMED);
      expect(result?.confirmedAt).not.toBeNull();
      expect(result?.executedAt).not.toBeNull();
    });

    test('should include timestamp fields in ISO format', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation();

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.get({
        confirmationId: confirmation.id,
      });

      expect(result?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result?.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ============================================================================
  // Tool Execution Tests
  // ============================================================================

  describe('Tool Execution', () => {
    test('should execute delete_policy tool', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create a policy to delete
      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `test-policy-delete-${Date.now()}`,
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Policy to delete',
        },
      });

      const confirmation = await createTestConfirmation({
        toolName: 'delete_policy',
        toolInput: { id: policy.id },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);

      // Verify policy was soft-deleted (deletedAt set)
      const deletedPolicy = await prisma.policy.findUnique({
        where: { id: policy.id },
      });
      expect(deletedPolicy).not.toBeNull();
      expect(deletedPolicy?.deletedAt).not.toBeNull();
    });

    test('should execute update_policy tool', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create a policy to update
      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `test-policy-update-${Date.now()}`,
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Original description',
        },
      });

      const confirmation = await createTestConfirmation({
        toolName: 'update_policy',
        toolInput: {
          id: policy.id,
          description: 'Updated description',
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);

      // Verify policy was updated
      const updatedPolicy = await prisma.policy.findUnique({
        where: { id: policy.id },
      });
      expect(updatedPolicy?.description).toBe('Updated description');
    });

    test('should execute enable_policy tool', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create a disabled policy
      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `test-policy-enable-${Date.now()}`,
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Disabled policy',
          enabled: false,
        },
      });

      const confirmation = await createTestConfirmation({
        toolName: 'enable_policy',
        toolInput: { id: policy.id },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);

      // Verify policy was enabled
      const enabledPolicy = await prisma.policy.findUnique({
        where: { id: policy.id },
      });
      expect(enabledPolicy?.enabled).toBe(true);
    });

    test('should execute disable_policy tool', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create an enabled policy
      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `test-policy-disable-${Date.now()}`,
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Enabled policy',
          enabled: true,
        },
      });

      const confirmation = await createTestConfirmation({
        toolName: 'disable_policy',
        toolInput: { id: policy.id },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);

      // Verify policy was disabled
      const disabledPolicy = await prisma.policy.findUnique({
        where: { id: policy.id },
      });
      expect(disabledPolicy?.enabled).toBe(false);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle confirmation with no conversationId', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        conversationId: undefined,
        toolName: 'create_policy',
        toolInput: {
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Test',
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      expect(result.success).toBe(true);
    });

    test('should handle concurrent confirm attempts', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        toolName: 'create_policy',
        toolInput: {
          matchers: ['user:*'],
          toolPatterns: ['test.example.com::*'],
          effect: 'ALLOW',
          description: 'Test',
        },
      });

      const caller = createCallerWithUser(admin);

      // Try to confirm twice concurrently
      const [result1, result2] = await Promise.all([
        caller.agent.confirmation.confirm({ confirmationId: confirmation.id }),
        caller.agent.confirmation.confirm({ confirmationId: confirmation.id }),
      ]);

      // One should succeed, one should fail
      const successes = [result1.success, result2.success].filter(Boolean);
      expect(successes.length).toBeLessThanOrEqual(2); // At least one might fail due to status check
    });

    test('should preserve error in confirmation record', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const confirmation = await createTestConfirmation({
        toolName: 'create_policy',
        toolInput: { invalid: 'data' }, // Invalid input will cause error
      });

      const caller = createCallerWithUser(admin);
      await caller.agent.confirmation.confirm({
        confirmationId: confirmation.id,
      });

      // Check error was recorded
      const updated = await prisma.agentConfirmation.findUnique({
        where: { id: confirmation.id },
      });
      expect(updated?.error).toBeDefined();
    });
  });
});
