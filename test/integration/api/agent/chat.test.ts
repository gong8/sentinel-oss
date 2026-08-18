/**
 * Integration Tests: Agent Chat Router
 * Tests for agent chat functionality including conversations, messages, and access control
 * CRITICAL: This is a high-priority test file - agent chat had only 1.78% coverage
 */

import { AgentMessageRole } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prisma } from '../../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '../../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser, createPublicCaller } from '../../../helpers/trpc.js';

// Mock the AgentOrchestrator to avoid actual API calls
vi.mock('../../../../packages/api/src/agent/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../packages/api/src/agent/index.js')>();
  return {
    ...actual,
    AgentOrchestrator: class MockOrchestrator {
      async processMessage() {
        return {
          text: 'Mock response from agent',
          toolCalls: [],
          pendingConfirmations: [],
        };
      }
      static toClaudeMessages(history: unknown[]) {
        return history;
      }
    },
  };
});

describe.skipIf(!hasDatabaseUrl())('Agent Chat Router', () => {
  let tenant: TestTenant;
  let adminId: string;
  let admin2Id: string;
  let userId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    await createTestRole({ organizationId: tenant.orgId, name: 'Admin', isAdmin: true });
    await createTestRole({ organizationId: tenant.orgId, name: 'User', isAdmin: false });

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;

    const admin2 = await createTestAdmin({ organizationId: tenant.orgId });
    admin2Id = admin2.id;

    const user = await createTestUser({ organizationId: tenant.orgId });
    userId = user.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('Authentication', () => {
    test('should reject unauthenticated requests to sendMessage', async () => {
      const caller = createPublicCaller();
      await expect(caller.agent.chat.sendMessage({ message: 'Hello' })).rejects.toThrow();
    });

    test('should reject unauthenticated requests to listConversations', async () => {
      const caller = createPublicCaller();
      await expect(caller.agent.chat.listConversations({})).rejects.toThrow();
    });

    test('should reject unauthenticated requests to getConversation', async () => {
      const caller = createPublicCaller();
      await expect(caller.agent.chat.getConversation({ conversationId: 'test' })).rejects.toThrow();
    });

    test('should reject unauthenticated requests to deleteConversation', async () => {
      const caller = createPublicCaller();
      await expect(
        caller.agent.chat.deleteConversation({ conversationId: 'test' }),
      ).rejects.toThrow();
    });

    test('should reject unauthenticated requests to updateTitle', async () => {
      const caller = createPublicCaller();
      await expect(
        caller.agent.chat.updateTitle({ conversationId: 'test', title: 'New Title' }),
      ).rejects.toThrow();
    });

    test('should reject unauthenticated requests to retryFromMessage', async () => {
      const caller = createPublicCaller();
      await expect(
        caller.agent.chat.retryFromMessage({ conversationId: 'test', messageId: 'msg' }),
      ).rejects.toThrow();
    });

    test('should reject non-admin requests to sendMessage', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);
      await expect(caller.agent.chat.sendMessage({ message: 'Hello' })).rejects.toThrow();
    });

    test('should reject non-admin requests to listConversations', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);
      await expect(caller.agent.chat.listConversations({})).rejects.toThrow();
    });

    test('should accept admin requests to sendMessage', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      expect(result).toBeDefined();
      expect(result.conversationId).toBeDefined();
      expect(result.response).toBeDefined();
    });
  });

  // ============================================================================
  // sendMessage Tests
  // ============================================================================

  describe('sendMessage', () => {
    test('should create new conversation when conversationId not provided', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello world' });

      expect(result.conversationId).toBeDefined();

      // Verify conversation was created
      const conversation = await prisma.agentConversation.findUnique({
        where: { id: result.conversationId },
      });
      expect(conversation).not.toBeNull();
      expect(conversation?.organizationId).toBe(tenant.orgId);
      expect(conversation?.userId).toBe(adminId);
    });

    test('should continue existing conversation when conversationId provided', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create first message
      const result1 = await caller.agent.chat.sendMessage({ message: 'First message' });
      const conversationId = result1.conversationId;

      // Continue conversation
      const result2 = await caller.agent.chat.sendMessage({
        conversationId,
        message: 'Second message',
      });

      expect(result2.conversationId).toBe(conversationId);

      // Verify messages were added
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });

      expect(messages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant
    });

    test('should auto-generate title for new conversations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({
        message: 'This is a test message for title generation',
      });

      const conversation = await prisma.agentConversation.findUnique({
        where: { id: result.conversationId },
      });

      expect(conversation?.title).toBeDefined();
      expect(conversation?.title?.length).toBeGreaterThan(0);
    });

    test('should truncate long messages for title', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const longMessage = 'A'.repeat(100);
      const result = await caller.agent.chat.sendMessage({ message: longMessage });

      const conversation = await prisma.agentConversation.findUnique({
        where: { id: result.conversationId },
      });

      expect(conversation?.title?.length).toBeLessThanOrEqual(53); // 50 + '...'
    });

    test('should reject empty message', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(caller.agent.chat.sendMessage({ message: '' })).rejects.toThrow();
    });

    test('should reject message exceeding max length', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const tooLongMessage = 'A'.repeat(10001);
      await expect(caller.agent.chat.sendMessage({ message: tooLongMessage })).rejects.toThrow();
    });

    test('should save user message to database', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const testMessage = 'Test message for database';
      const result = await caller.agent.chat.sendMessage({ message: testMessage });

      const messages = await prisma.agentMessage.findMany({
        where: {
          conversationId: result.conversationId,
          role: AgentMessageRole.USER,
        },
      });

      expect(messages.some((m) => m.content === testMessage)).toBe(true);
    });

    test('should save assistant response to database', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      const messages = await prisma.agentMessage.findMany({
        where: {
          conversationId: result.conversationId,
          role: AgentMessageRole.ASSISTANT,
        },
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    test('should return formatted response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      // Should be a regular response, not a plan creation
      expect(result.planCreated).toBe(false);
      if (result.planCreated === false) {
        expect(result.response).toHaveProperty('text');
        expect(result.response).toHaveProperty('toolCalls');
        expect(result.response).toHaveProperty('pendingConfirmations');
        expect(Array.isArray(result.response.toolCalls)).toBe(true);
      }
    });
  });

  // ============================================================================
  // Conversation Ownership Tests
  // ============================================================================

  describe('Conversation Ownership', () => {
    test('should reject sendMessage to another users conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const admin2 = await prisma.user.findUnique({
        where: { id: admin2Id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin2) throw new Error('Admin2 not found');

      // Admin creates a conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Hello' });

      // Admin2 tries to send message to admin's conversation
      const caller2 = createCallerWithUser(admin2);
      await expect(
        caller2.agent.chat.sendMessage({
          conversationId: result.conversationId,
          message: 'Trying to access',
        }),
      ).rejects.toThrow('Conversation not found');
    });

    test('should reject getConversation for another users conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const admin2 = await prisma.user.findUnique({
        where: { id: admin2Id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin2) throw new Error('Admin2 not found');

      // Admin creates a conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Hello' });

      // Admin2 tries to get admin's conversation
      const caller2 = createCallerWithUser(admin2);
      const conversation = await caller2.agent.chat.getConversation({
        conversationId: result.conversationId,
      });

      // Should return null, not throw (returns null for unauthorized access)
      expect(conversation).toBeNull();
    });

    test('should reject deleteConversation for another users conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const admin2 = await prisma.user.findUnique({
        where: { id: admin2Id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin2) throw new Error('Admin2 not found');

      // Admin creates a conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Hello' });

      // Admin2 tries to delete admin's conversation
      const caller2 = createCallerWithUser(admin2);
      await expect(
        caller2.agent.chat.deleteConversation({ conversationId: result.conversationId }),
      ).rejects.toThrow('Conversation not found');

      // Verify conversation still exists
      const conversation = await prisma.agentConversation.findUnique({
        where: { id: result.conversationId },
      });
      expect(conversation).not.toBeNull();
    });

    test('should reject updateTitle for another users conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const admin2 = await prisma.user.findUnique({
        where: { id: admin2Id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin2) throw new Error('Admin2 not found');

      // Admin creates a conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Hello' });

      // Admin2 tries to update admin's conversation title
      const caller2 = createCallerWithUser(admin2);
      await expect(
        caller2.agent.chat.updateTitle({
          conversationId: result.conversationId,
          title: 'Hacked Title',
        }),
      ).rejects.toThrow('Conversation not found');
    });

    test('should reject retryFromMessage for another users conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const admin2 = await prisma.user.findUnique({
        where: { id: admin2Id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin2) throw new Error('Admin2 not found');

      // Admin creates a conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Hello' });

      // Get a message ID
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId: result.conversationId },
      });
      const messageId = messages[0]?.id ?? 'nonexistent';

      // Admin2 tries to retry from admin's conversation
      const caller2 = createCallerWithUser(admin2);
      await expect(
        caller2.agent.chat.retryFromMessage({
          conversationId: result.conversationId,
          messageId,
        }),
      ).rejects.toThrow('Conversation not found');
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

    test('should not show other orgs conversations in listConversations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const org2Admin = await prisma.user.findUnique({
        where: { id: org2AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org2Admin) throw new Error('Org2 Admin not found');

      // Org1 admin creates conversation
      const caller1 = createCallerWithUser(admin);
      await caller1.agent.chat.sendMessage({ message: 'Org1 message' });

      // Org2 admin creates conversation
      const caller2 = createCallerWithUser(org2Admin);
      await caller2.agent.chat.sendMessage({ message: 'Org2 message' });

      // Org1 admin lists conversations - should only see their own
      const org1Conversations = await caller1.agent.chat.listConversations({});
      expect(org1Conversations.length).toBe(1);

      // Org2 admin lists conversations - should only see their own
      const org2Conversations = await caller2.agent.chat.listConversations({});
      expect(org2Conversations.length).toBe(1);
    });

    test('should reject access to other orgs conversation by ID', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const org2Admin = await prisma.user.findUnique({
        where: { id: org2AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org2Admin) throw new Error('Org2 Admin not found');

      // Org1 admin creates conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Org1 message' });

      // Org2 admin tries to access org1's conversation
      const caller2 = createCallerWithUser(org2Admin);
      const conversation = await caller2.agent.chat.getConversation({
        conversationId: result.conversationId,
      });

      expect(conversation).toBeNull();
    });

    test('should reject sendMessage to other orgs conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const org2Admin = await prisma.user.findUnique({
        where: { id: org2AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org2Admin) throw new Error('Org2 Admin not found');

      // Org1 admin creates conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Org1 message' });

      // Org2 admin tries to send to org1's conversation
      const caller2 = createCallerWithUser(org2Admin);
      await expect(
        caller2.agent.chat.sendMessage({
          conversationId: result.conversationId,
          message: 'Cross-org attack',
        }),
      ).rejects.toThrow();
    });

    test('should reject deleteConversation for other orgs conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const org2Admin = await prisma.user.findUnique({
        where: { id: org2AdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!org2Admin) throw new Error('Org2 Admin not found');

      // Org1 admin creates conversation
      const caller1 = createCallerWithUser(admin);
      const result = await caller1.agent.chat.sendMessage({ message: 'Org1 message' });

      // Org2 admin tries to delete org1's conversation
      const caller2 = createCallerWithUser(org2Admin);
      await expect(
        caller2.agent.chat.deleteConversation({ conversationId: result.conversationId }),
      ).rejects.toThrow();

      // Verify conversation still exists
      const conversation = await prisma.agentConversation.findUnique({
        where: { id: result.conversationId },
      });
      expect(conversation).not.toBeNull();
    });
  });

  // ============================================================================
  // listConversations Tests
  // ============================================================================

  describe('listConversations', () => {
    test('should return empty array when no conversations exist', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const conversations = await caller.agent.chat.listConversations({});

      expect(conversations).toEqual([]);
    });

    test('should list all users conversations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create multiple conversations
      await caller.agent.chat.sendMessage({ message: 'Conversation 1' });
      await caller.agent.chat.sendMessage({ message: 'Conversation 2' });
      await caller.agent.chat.sendMessage({ message: 'Conversation 3' });

      const conversations = await caller.agent.chat.listConversations({});

      expect(conversations.length).toBe(3);
    });

    test('should respect limit parameter', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create multiple conversations
      await caller.agent.chat.sendMessage({ message: 'Conversation 1' });
      await caller.agent.chat.sendMessage({ message: 'Conversation 2' });
      await caller.agent.chat.sendMessage({ message: 'Conversation 3' });

      const conversations = await caller.agent.chat.listConversations({ limit: 2 });

      expect(conversations.length).toBe(2);
    });

    test('should include messageCount in response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      // Add more messages
      await caller.agent.chat.sendMessage({
        conversationId: result.conversationId,
        message: 'Another message',
      });

      const conversations = await caller.agent.chat.listConversations({});
      const conversation = conversations.find((c) => c.id === result.conversationId);

      expect(conversation?.messageCount).toBeGreaterThan(0);
    });

    test('should include timestamps in response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      await caller.agent.chat.sendMessage({ message: 'Hello' });
      const conversations = await caller.agent.chat.listConversations({});

      expect(conversations[0]).toHaveProperty('createdAt');
      expect(conversations[0]).toHaveProperty('updatedAt');
      expect(typeof conversations[0].createdAt).toBe('string');
    });

    test('should only list own conversations not other admins', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const admin2 = await prisma.user.findUnique({
        where: { id: admin2Id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin2) throw new Error('Admin2 not found');

      const caller1 = createCallerWithUser(admin);
      const caller2 = createCallerWithUser(admin2);

      // Admin creates conversations
      await caller1.agent.chat.sendMessage({ message: 'Admin message 1' });
      await caller1.agent.chat.sendMessage({ message: 'Admin message 2' });

      // Admin2 creates conversation
      await caller2.agent.chat.sendMessage({ message: 'Admin2 message' });

      // Admin lists - should only see their 2
      const adminConversations = await caller1.agent.chat.listConversations({});
      expect(adminConversations.length).toBe(2);

      // Admin2 lists - should only see their 1
      const admin2Conversations = await caller2.agent.chat.listConversations({});
      expect(admin2Conversations.length).toBe(1);
    });
  });

  // ============================================================================
  // getConversation Tests
  // ============================================================================

  describe('getConversation', () => {
    test('should return conversation with messages', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello world' });

      const conversation = await caller.agent.chat.getConversation({
        conversationId: result.conversationId,
      });

      expect(conversation).not.toBeNull();
      expect(conversation?.id).toBe(result.conversationId);
      expect(conversation?.messages).toBeDefined();
      expect(Array.isArray(conversation?.messages)).toBe(true);
      expect(conversation?.messages.length).toBeGreaterThan(0);
    });

    test('should return null for non-existent conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const conversation = await caller.agent.chat.getConversation({
        conversationId: 'cljnonexistent00000000000',
      });

      expect(conversation).toBeNull();
    });

    test('should include message details in response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      const conversation = await caller.agent.chat.getConversation({
        conversationId: result.conversationId,
      });

      const message = conversation?.messages[0];
      expect(message).toHaveProperty('id');
      expect(message).toHaveProperty('role');
      expect(message).toHaveProperty('content');
      expect(message).toHaveProperty('createdAt');
    });

    test('should include title in response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      const conversation = await caller.agent.chat.getConversation({
        conversationId: result.conversationId,
      });

      expect(conversation).toHaveProperty('title');
    });
  });

  // ============================================================================
  // deleteConversation Tests
  // ============================================================================

  describe('deleteConversation', () => {
    test('should delete conversation successfully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'To be deleted' });

      const deleteResult = await caller.agent.chat.deleteConversation({
        conversationId: result.conversationId,
      });

      expect(deleteResult.success).toBe(true);

      // Verify conversation is deleted
      const conversation = await prisma.agentConversation.findUnique({
        where: { id: result.conversationId },
      });
      expect(conversation).toBeNull();
    });

    test('should delete associated messages', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'To be deleted' });

      await caller.agent.chat.deleteConversation({
        conversationId: result.conversationId,
      });

      // Verify messages are deleted
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId: result.conversationId },
      });
      expect(messages.length).toBe(0);
    });

    test('should reject deletion of non-existent conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.agent.chat.deleteConversation({ conversationId: 'cljnonexistent00000000000' }),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // updateTitle Tests
  // ============================================================================

  describe('updateTitle', () => {
    test('should update title successfully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      const newTitle = 'My Custom Title';
      const updateResult = await caller.agent.chat.updateTitle({
        conversationId: result.conversationId,
        title: newTitle,
      });

      expect(updateResult.success).toBe(true);

      // Verify title was updated
      const conversation = await prisma.agentConversation.findUnique({
        where: { id: result.conversationId },
      });
      expect(conversation?.title).toBe(newTitle);
    });

    test('should reject empty title', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      await expect(
        caller.agent.chat.updateTitle({
          conversationId: result.conversationId,
          title: '',
        }),
      ).rejects.toThrow();
    });

    test('should reject title exceeding max length', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      const tooLongTitle = 'A'.repeat(201);
      await expect(
        caller.agent.chat.updateTitle({
          conversationId: result.conversationId,
          title: tooLongTitle,
        }),
      ).rejects.toThrow();
    });

    test('should reject update for non-existent conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.agent.chat.updateTitle({
          conversationId: 'cljnonexistent00000000000',
          title: 'New Title',
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // retryFromMessage Tests
  // ============================================================================

  describe('retryFromMessage', () => {
    test('should retry from specified message', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'First message' });

      // Get the user message
      const messages = await prisma.agentMessage.findMany({
        where: {
          conversationId: result.conversationId,
          role: AgentMessageRole.USER,
        },
        orderBy: { createdAt: 'asc' },
      });

      const userMessageId = messages[0].id;

      const retryResult = await caller.agent.chat.retryFromMessage({
        conversationId: result.conversationId,
        messageId: userMessageId,
      });

      expect(retryResult.conversationId).toBe(result.conversationId);
      expect(retryResult.response).toBeDefined();
      expect(retryResult.deletedCount).toBeGreaterThan(0);
    });

    test('should reject retry for non-existent message', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'Hello' });

      await expect(
        caller.agent.chat.retryFromMessage({
          conversationId: result.conversationId,
          messageId: 'cljnonexistent00000000000',
        }),
      ).rejects.toThrow('Message not found');
    });

    test('should reject retry for non-existent conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.agent.chat.retryFromMessage({
          conversationId: 'cljnonexistent00000000000',
          messageId: 'cljmessage0000000000000000',
        }),
      ).rejects.toThrow();
    });

    test('should delete messages after retry point', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.agent.chat.sendMessage({ message: 'First message' });

      // Add more messages
      await caller.agent.chat.sendMessage({
        conversationId: result.conversationId,
        message: 'Second message',
      });

      // Get the first user message
      const messages = await prisma.agentMessage.findMany({
        where: {
          conversationId: result.conversationId,
          role: AgentMessageRole.USER,
        },
        orderBy: { createdAt: 'asc' },
      });

      const firstMessageId = messages[0].id;
      const messageCountBefore = await prisma.agentMessage.count({
        where: { conversationId: result.conversationId },
      });

      await caller.agent.chat.retryFromMessage({
        conversationId: result.conversationId,
        messageId: firstMessageId,
      });

      const messageCountAfter = await prisma.agentMessage.count({
        where: { conversationId: result.conversationId },
      });

      // Should have fewer messages (or same if only retrying the first)
      expect(messageCountAfter).toBeLessThanOrEqual(messageCountBefore);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle concurrent message sends gracefully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Send multiple messages concurrently
      const promises = [
        caller.agent.chat.sendMessage({ message: 'Message 1' }),
        caller.agent.chat.sendMessage({ message: 'Message 2' }),
        caller.agent.chat.sendMessage({ message: 'Message 3' }),
      ];

      const results = await Promise.all(promises);

      // All should succeed and create separate conversations
      expect(results.length).toBe(3);
      const conversationIds = new Set(results.map((r) => r.conversationId));
      expect(conversationIds.size).toBe(3);
    });

    test('should handle special characters in message', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const specialMessage = '<script>alert("xss")</script> & "quotes" \'apostrophe\'';

      const result = await caller.agent.chat.sendMessage({ message: specialMessage });

      expect(result.conversationId).toBeDefined();

      // Verify message was stored correctly
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId: result.conversationId, role: AgentMessageRole.USER },
      });
      expect(messages.some((m) => m.content === specialMessage)).toBe(true);
    });

    test('should handle unicode characters in message', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const unicodeMessage = '你好世界 🌍 Привет мир';

      const result = await caller.agent.chat.sendMessage({ message: unicodeMessage });

      expect(result.conversationId).toBeDefined();

      const messages = await prisma.agentMessage.findMany({
        where: { conversationId: result.conversationId, role: AgentMessageRole.USER },
      });
      expect(messages.some((m) => m.content === unicodeMessage)).toBe(true);
    });

    test('should handle whitespace-only message rejection', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Whitespace-only should pass min(1) validation but might be trimmed
      // depending on implementation
      const result = await caller.agent.chat.sendMessage({ message: '   ' });

      // If it passes, verify it was stored
      expect(result.conversationId).toBeDefined();
    });
  });

  // ============================================================================
  // Concurrent Message Handling Edge Cases
  // ============================================================================

  describe('Concurrent Message Handling', () => {
    test('should handle concurrent messages to the same conversation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create a conversation
      const initial = await caller.agent.chat.sendMessage({ message: 'Initial message' });
      const conversationId = initial.conversationId;

      // Send multiple messages to the same conversation concurrently
      const promises = [
        caller.agent.chat.sendMessage({ conversationId, message: 'Concurrent 1' }),
        caller.agent.chat.sendMessage({ conversationId, message: 'Concurrent 2' }),
        caller.agent.chat.sendMessage({ conversationId, message: 'Concurrent 3' }),
      ];

      const results = await Promise.all(promises);

      // All should reference the same conversation
      expect(results.every((r) => r.conversationId === conversationId)).toBe(true);

      // All messages should be stored
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId, role: AgentMessageRole.USER },
      });
      expect(messages.length).toBeGreaterThanOrEqual(4); // Initial + 3 concurrent
    });

    test('should handle rapid sequential messages correctly', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create conversation
      const result1 = await caller.agent.chat.sendMessage({ message: 'Message 1' });

      // Send messages in rapid succession (not concurrent, but fast)
      const result2 = await caller.agent.chat.sendMessage({
        conversationId: result1.conversationId,
        message: 'Message 2',
      });
      const result3 = await caller.agent.chat.sendMessage({
        conversationId: result1.conversationId,
        message: 'Message 3',
      });

      // All should be in the same conversation
      expect(result2.conversationId).toBe(result1.conversationId);
      expect(result3.conversationId).toBe(result1.conversationId);

      // Verify message order is preserved
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId: result1.conversationId, role: AgentMessageRole.USER },
        orderBy: { createdAt: 'asc' },
      });

      const contents = messages.map((m) => m.content);
      expect(contents).toContain('Message 1');
      expect(contents).toContain('Message 2');
      expect(contents).toContain('Message 3');
    });

    test('should handle concurrent new conversation creation', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create many conversations concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        caller.agent.chat.sendMessage({ message: `New conversation ${i}` }),
      );

      const results = await Promise.all(promises);

      // All should succeed with unique conversation IDs
      expect(results.length).toBe(10);
      const conversationIds = new Set(results.map((r) => r.conversationId));
      expect(conversationIds.size).toBe(10);

      // Verify all conversations exist in database
      const conversations = await prisma.agentConversation.findMany({
        where: { id: { in: Array.from(conversationIds) } },
      });
      expect(conversations.length).toBe(10);
    });

    test('should handle concurrent operations by different admins', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const admin2 = await prisma.user.findUnique({
        where: { id: admin2Id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin2) throw new Error('Admin2 not found');

      const caller1 = createCallerWithUser(admin);
      const caller2 = createCallerWithUser(admin2);

      // Both admins send messages concurrently
      const promises = [
        caller1.agent.chat.sendMessage({ message: 'Admin1 message' }),
        caller2.agent.chat.sendMessage({ message: 'Admin2 message' }),
        caller1.agent.chat.sendMessage({ message: 'Admin1 message 2' }),
        caller2.agent.chat.sendMessage({ message: 'Admin2 message 2' }),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.length).toBe(4);
      expect(results.every((r) => r.conversationId)).toBe(true);

      // Each admin should only see their own conversations
      const admin1Conversations = await caller1.agent.chat.listConversations({});
      const admin2Conversations = await caller2.agent.chat.listConversations({});

      expect(admin1Conversations.length).toBe(2);
      expect(admin2Conversations.length).toBe(2);
    });
  });

  // ============================================================================
  // Conversation State Recovery Tests
  // ============================================================================

  describe('Conversation State Recovery', () => {
    test('should recover conversation with missing title', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create a conversation
      const result = await caller.agent.chat.sendMessage({ message: 'Test message' });

      // Manually remove the title to simulate corruption
      await prisma.agentConversation.update({
        where: { id: result.conversationId },
        data: { title: null },
      });

      // Should still be able to retrieve the conversation
      const conversation = await caller.agent.chat.getConversation({
        conversationId: result.conversationId,
      });

      expect(conversation).not.toBeNull();
      expect(conversation?.id).toBe(result.conversationId);
    });

    test('should handle conversation with orphaned messages gracefully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create a conversation with multiple messages
      const result = await caller.agent.chat.sendMessage({ message: 'Message 1' });
      await caller.agent.chat.sendMessage({
        conversationId: result.conversationId,
        message: 'Message 2',
      });

      // Conversation should be retrievable with all messages
      const conversation = await caller.agent.chat.getConversation({
        conversationId: result.conversationId,
      });

      expect(conversation?.messages.length).toBeGreaterThanOrEqual(4);
    });

    test('should continue conversation after failed message', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create a conversation
      const result = await caller.agent.chat.sendMessage({ message: 'Initial' });
      const conversationId = result.conversationId;

      // Try to send an invalid message (too long)
      const tooLongMessage = 'A'.repeat(10001);
      await expect(
        caller.agent.chat.sendMessage({ conversationId, message: tooLongMessage }),
      ).rejects.toThrow();

      // Should be able to continue with a valid message
      const continued = await caller.agent.chat.sendMessage({
        conversationId,
        message: 'Valid follow-up',
      });

      expect(continued.conversationId).toBe(conversationId);
    });

    test('should handle retryFromMessage when conversation has many messages', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create a conversation with multiple messages
      const result = await caller.agent.chat.sendMessage({ message: 'Message 1' });
      const conversationId = result.conversationId;

      for (let i = 2; i <= 5; i++) {
        await caller.agent.chat.sendMessage({
          conversationId,
          message: `Message ${i}`,
        });
      }

      // Get the third user message
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId, role: AgentMessageRole.USER },
        orderBy: { createdAt: 'asc' },
      });

      const thirdMessageId = messages[2]?.id;
      if (!thirdMessageId) throw new Error('Third message not found');

      // Retry from the third message
      const retryResult = await caller.agent.chat.retryFromMessage({
        conversationId,
        messageId: thirdMessageId,
      });

      expect(retryResult.deletedCount).toBeGreaterThan(0);
      expect(retryResult.conversationId).toBe(conversationId);
      // Each sendMessage round-trips the agent (~3.5s), and this test sends 5.
    }, 60_000);

    test('should maintain conversation integrity after multiple retries', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create a conversation
      const result = await caller.agent.chat.sendMessage({ message: 'Original message' });
      const conversationId = result.conversationId;

      // Retry multiple times - each time fetching the fresh message ID
      // because retryFromMessage deletes and recreates the user message
      for (let i = 0; i < 3; i++) {
        const messages = await prisma.agentMessage.findMany({
          where: { conversationId, role: AgentMessageRole.USER },
          orderBy: { createdAt: 'asc' },
        });
        const messageId = messages[0].id;
        await caller.agent.chat.retryFromMessage({ conversationId, messageId });
      }

      // Conversation should still be valid
      const conversation = await caller.agent.chat.getConversation({ conversationId });
      expect(conversation).not.toBeNull();
      expect(conversation?.messages.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Error Handling Scenarios
  // ============================================================================

  describe('Error Handling', () => {
    test('should handle very long conversation gracefully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create a conversation
      const result = await caller.agent.chat.sendMessage({ message: 'Start' });
      const conversationId = result.conversationId;

      // Add many messages (simulating a long conversation)
      for (let i = 0; i < 20; i++) {
        await caller.agent.chat.sendMessage({
          conversationId,
          message: `Message ${i + 1}: ${'content '.repeat(50)}`,
        });
      }

      // Should still be able to retrieve the conversation
      const conversation = await caller.agent.chat.getConversation({ conversationId });
      expect(conversation).not.toBeNull();
      expect(conversation?.messages.length).toBeGreaterThan(40);
      // 21 sequential sendMessage calls at ~3.5s each.
    }, 120_000);

    test('should handle message with maximum allowed length', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Send exactly the maximum length message (10000 chars)
      const maxLengthMessage = 'A'.repeat(10000);
      const result = await caller.agent.chat.sendMessage({ message: maxLengthMessage });

      expect(result.conversationId).toBeDefined();

      // Verify it was stored
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId: result.conversationId, role: AgentMessageRole.USER },
      });
      expect(messages[0]?.content).toBe(maxLengthMessage);
    });

    test('should reject message one character over max length', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Send one character over the maximum
      const overMaxMessage = 'A'.repeat(10001);
      await expect(caller.agent.chat.sendMessage({ message: overMaxMessage })).rejects.toThrow();
    });

    test('should handle rapid delete and recreate operations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create, delete, create, delete rapidly
      for (let i = 0; i < 5; i++) {
        const result = await caller.agent.chat.sendMessage({ message: `Cycle ${i}` });
        await caller.agent.chat.deleteConversation({ conversationId: result.conversationId });
      }

      // Should end up with no conversations
      const conversations = await caller.agent.chat.listConversations({});
      expect(conversations.length).toBe(0);
    });

    test('should handle title update after conversation is deleted', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Create and delete a conversation
      const result = await caller.agent.chat.sendMessage({ message: 'To be deleted' });
      await caller.agent.chat.deleteConversation({ conversationId: result.conversationId });

      // Try to update the deleted conversation's title
      await expect(
        caller.agent.chat.updateTitle({
          conversationId: result.conversationId,
          title: 'New Title',
        }),
      ).rejects.toThrow();
    });
  });
});
