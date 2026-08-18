/**
 * Conversation Management Unit Tests
 * Tests for the conversation service (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const {
  mockConversationCreate,
  mockConversationFindFirst,
  mockConversationFindMany,
  mockConversationUpdate,
  mockConversationUpdateMany,
  mockConversationDelete,
  mockMessageCreate,
  mockMessageFindMany,
  mockMessageFindFirst,
  mockMessageDeleteMany,
  mockMessageUpdate,
} = vi.hoisted(() => ({
  mockConversationCreate: vi.fn(),
  mockConversationFindFirst: vi.fn(),
  mockConversationFindMany: vi.fn(),
  mockConversationUpdate: vi.fn(),
  mockConversationUpdateMany: vi.fn(),
  mockConversationDelete: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageFindMany: vi.fn(),
  mockMessageFindFirst: vi.fn(),
  mockMessageDeleteMany: vi.fn(),
  mockMessageUpdate: vi.fn(),
}));

// Create a mock $transaction that executes the callback with the prisma mock
const mockTransaction = vi.hoisted(() =>
  vi.fn((callback: (tx: unknown) => Promise<unknown>) => {
    // The callback receives a mock prisma client
    const txMock = {
      agentConversation: {
        create: mockConversationCreate,
        findFirst: mockConversationFindFirst,
        findMany: mockConversationFindMany,
        update: mockConversationUpdate,
        updateMany: mockConversationUpdateMany,
        delete: mockConversationDelete,
      },
      agentMessage: {
        create: mockMessageCreate,
        findMany: mockMessageFindMany,
        findFirst: mockMessageFindFirst,
        deleteMany: mockMessageDeleteMany,
        update: mockMessageUpdate,
      },
    };
    return callback(txMock);
  }),
);

vi.mock('@sentinel/db', () => ({
  prisma: {
    agentConversation: {
      create: mockConversationCreate,
      findFirst: mockConversationFindFirst,
      findMany: mockConversationFindMany,
      update: mockConversationUpdate,
      updateMany: mockConversationUpdateMany,
      delete: mockConversationDelete,
    },
    agentMessage: {
      create: mockMessageCreate,
      findMany: mockMessageFindMany,
      findFirst: mockMessageFindFirst,
      deleteMany: mockMessageDeleteMany,
      update: mockMessageUpdate,
    },
    $transaction: mockTransaction,
  },
  Prisma: {
    DbNull: Symbol('DbNull'),
  },
}));

// Import after mocking
import {
  addMessage,
  createConversation,
  dbMessagesToConversation,
  deleteConversation,
  deleteMessagesFromId,
  getConversation,
  getMessages,
  listConversations,
  updateConversationTitle,
  updateToolResultByConfirmationId,
} from '../../../../packages/api/src/agent/conversation.js';

describe('Conversation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createConversation', () => {
    test('should create a conversation and return its ID', async () => {
      mockConversationCreate.mockResolvedValueOnce({
        id: 'conv-123',
        organizationId: 'org-1',
        userId: 'user-1',
        title: 'Test Conversation',
      });

      const result = await createConversation({
        organizationId: 'org-1',
        userId: 'user-1',
        title: 'Test Conversation',
      });

      expect(result).toBe('conv-123');
      expect(mockConversationCreate).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: 'user-1',
          mcpAgentId: undefined,
          title: 'Test Conversation',
        },
      });
    });

    test('should create conversation with mcpAgentId', async () => {
      mockConversationCreate.mockResolvedValueOnce({
        id: 'conv-456',
        organizationId: 'org-1',
        mcpAgentId: 'agent-1',
      });

      const result = await createConversation({
        organizationId: 'org-1',
        mcpAgentId: 'agent-1',
      });

      expect(result).toBe('conv-456');
      expect(mockConversationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          mcpAgentId: 'agent-1',
        }),
      });
    });

    test('should create conversation with minimal params', async () => {
      mockConversationCreate.mockResolvedValueOnce({
        id: 'conv-789',
        organizationId: 'org-1',
      });

      const result = await createConversation({
        organizationId: 'org-1',
      });

      expect(result).toBe('conv-789');
      expect(mockConversationCreate).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: undefined,
          mcpAgentId: undefined,
          title: undefined,
        },
      });
    });
  });

  describe('getConversation', () => {
    test('should get conversation by ID and organizationId', async () => {
      const mockConversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        userId: 'user-1',
        mcpAgentId: null,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      mockConversationFindFirst.mockResolvedValueOnce(mockConversation);

      const result = await getConversation('conv-123', 'org-1');

      expect(result).toEqual(mockConversation);
      expect(mockConversationFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          organizationId: 'org-1',
        },
        select: {
          id: true,
          title: true,
          userId: true,
          mcpAgentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    test('should return null for non-existent conversation', async () => {
      mockConversationFindFirst.mockResolvedValueOnce(null);

      const result = await getConversation('nonexistent', 'org-1');

      expect(result).toBeNull();
    });

    test('should scope query to organizationId', async () => {
      mockConversationFindFirst.mockResolvedValueOnce(null);

      await getConversation('conv-123', 'org-different');

      expect(mockConversationFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          organizationId: 'org-different',
        },
        select: expect.any(Object),
      });
    });
  });

  describe('listConversations', () => {
    test('should list conversations ordered by updatedAt desc', async () => {
      const mockConversations = [
        {
          id: 'conv-2',
          title: 'Newer',
          createdAt: new Date('2024-01-15T10:00:00Z'),
          updatedAt: new Date('2024-01-15T11:00:00Z'),
          _count: { messages: 5 },
        },
        {
          id: 'conv-1',
          title: 'Older',
          createdAt: new Date('2024-01-15T09:00:00Z'),
          updatedAt: new Date('2024-01-15T09:30:00Z'),
          _count: { messages: 3 },
        },
      ];

      mockConversationFindMany.mockResolvedValueOnce(mockConversations);

      const result = await listConversations({ organizationId: 'org-1' });

      expect(result).toEqual([
        {
          id: 'conv-2',
          title: 'Newer',
          createdAt: new Date('2024-01-15T10:00:00Z'),
          updatedAt: new Date('2024-01-15T11:00:00Z'),
          messageCount: 5,
        },
        {
          id: 'conv-1',
          title: 'Older',
          createdAt: new Date('2024-01-15T09:00:00Z'),
          updatedAt: new Date('2024-01-15T09:30:00Z'),
          messageCount: 3,
        },
      ]);
    });

    test('should filter by userId', async () => {
      mockConversationFindMany.mockResolvedValueOnce([]);

      await listConversations({ organizationId: 'org-1', userId: 'user-1' });

      expect(mockConversationFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          userId: 'user-1',
        },
        select: expect.any(Object),
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
    });

    test('should filter by mcpAgentId', async () => {
      mockConversationFindMany.mockResolvedValueOnce([]);

      await listConversations({ organizationId: 'org-1', mcpAgentId: 'agent-1' });

      expect(mockConversationFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          mcpAgentId: 'agent-1',
        },
        select: expect.any(Object),
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
    });

    test('should respect custom limit', async () => {
      mockConversationFindMany.mockResolvedValueOnce([]);

      await listConversations({ organizationId: 'org-1', limit: 10 });

      expect(mockConversationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    test('should use default limit of 50', async () => {
      mockConversationFindMany.mockResolvedValueOnce([]);

      await listConversations({ organizationId: 'org-1' });

      expect(mockConversationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });
  });

  describe('addMessage', () => {
    test('should add message and update conversation timestamp', async () => {
      // Mock conversation ownership check
      mockConversationFindFirst.mockResolvedValueOnce({ id: 'conv-1' });
      mockMessageCreate.mockResolvedValueOnce({
        id: 'msg-123',
        conversationId: 'conv-1',
        role: 'USER',
        content: 'Hello',
      });
      mockConversationUpdate.mockResolvedValueOnce({});

      const result = await addMessage({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        role: 'USER' as const,
        content: 'Hello',
      });

      expect(result).toBe('msg-123');
      expect(mockConversationFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conv-1',
          organizationId: 'org-1',
        },
        select: { id: true },
      });
      expect(mockMessageCreate).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          role: 'USER',
          content: 'Hello',
          toolName: undefined,
          toolInput: expect.any(Symbol), // toPrismaJson converts undefined to Prisma.DbNull
          toolResult: expect.any(Symbol), // toPrismaJson converts undefined to Prisma.DbNull
        },
      });
      expect(mockConversationUpdate).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { updatedAt: expect.any(Date) },
      });
    });

    test('should add tool use message', async () => {
      // Mock conversation ownership check
      mockConversationFindFirst.mockResolvedValueOnce({ id: 'conv-1' });
      mockMessageCreate.mockResolvedValueOnce({
        id: 'msg-456',
        conversationId: 'conv-1',
        role: 'TOOL_USE',
        content: 'Calling list_policies',
        toolName: 'list_policies',
        toolInput: { limit: 10 },
      });
      mockConversationUpdate.mockResolvedValueOnce({});

      const result = await addMessage({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        role: 'TOOL_USE' as const,
        content: 'Calling list_policies',
        toolName: 'list_policies',
        toolInput: { limit: 10 },
      });

      expect(result).toBe('msg-456');
      expect(mockMessageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          toolName: 'list_policies',
          toolInput: { limit: 10 },
        }),
      });
    });

    test('should add tool result message', async () => {
      // Mock conversation ownership check
      mockConversationFindFirst.mockResolvedValueOnce({ id: 'conv-1' });
      mockMessageCreate.mockResolvedValueOnce({
        id: 'msg-789',
        conversationId: 'conv-1',
        role: 'TOOL_RESULT',
        content: 'Tool result',
        toolName: 'list_policies',
        toolResult: { policies: [] },
      });
      mockConversationUpdate.mockResolvedValueOnce({});

      const result = await addMessage({
        conversationId: 'conv-1',
        organizationId: 'org-1',
        role: 'TOOL_RESULT' as const,
        content: 'Tool result',
        toolName: 'list_policies',
        toolResult: { policies: [] },
      });

      expect(result).toBe('msg-789');
      expect(mockMessageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          toolName: 'list_policies',
          toolResult: { policies: [] },
        }),
      });
    });
  });

  describe('getMessages', () => {
    test('should get messages ordered by createdAt asc', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'USER',
          content: 'Hello',
          toolName: null,
          toolInput: null,
          toolResult: null,
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'msg-2',
          role: 'ASSISTANT',
          content: 'Hi there!',
          toolName: null,
          toolInput: null,
          toolResult: null,
          createdAt: new Date('2024-01-15T10:00:05Z'),
        },
      ];

      mockMessageFindMany.mockResolvedValueOnce(mockMessages);

      const result = await getMessages('conv-1', 'org-1');

      expect(result).toEqual(mockMessages);
      expect(mockMessageFindMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          conversation: { organizationId: 'org-1' },
        },
        orderBy: { createdAt: 'asc' },
        take: undefined,
      });
    });

    test('should respect limit parameter', async () => {
      mockMessageFindMany.mockResolvedValueOnce([]);

      await getMessages('conv-1', 'org-1', 20);

      expect(mockMessageFindMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          conversation: { organizationId: 'org-1' },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
    });

    test('should scope query to organizationId via conversation filter', async () => {
      mockMessageFindMany.mockResolvedValueOnce([]);

      await getMessages('conv-1', 'org-different');

      expect(mockMessageFindMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          conversation: { organizationId: 'org-different' },
        },
        orderBy: { createdAt: 'asc' },
        take: undefined,
      });
    });
  });

  describe('deleteConversation', () => {
    test('should delete existing conversation', async () => {
      mockConversationFindFirst.mockResolvedValueOnce({
        id: 'conv-123',
        organizationId: 'org-1',
      });
      mockConversationDelete.mockResolvedValueOnce({});

      const result = await deleteConversation('conv-123', 'org-1');

      expect(result).toBe(true);
      expect(mockConversationDelete).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
      });
    });

    test('should return false for non-existent conversation', async () => {
      mockConversationFindFirst.mockResolvedValueOnce(null);

      const result = await deleteConversation('nonexistent', 'org-1');

      expect(result).toBe(false);
      expect(mockConversationDelete).not.toHaveBeenCalled();
    });

    test('should scope deletion to organizationId', async () => {
      mockConversationFindFirst.mockResolvedValueOnce(null);

      await deleteConversation('conv-123', 'org-different');

      expect(mockConversationFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          organizationId: 'org-different',
        },
      });
    });
  });

  describe('updateConversationTitle', () => {
    test('should update conversation title', async () => {
      mockConversationUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await updateConversationTitle('conv-123', 'org-1', 'New Title');

      expect(result).toBe(true);
      expect(mockConversationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'conv-123',
          organizationId: 'org-1',
        },
        data: { title: 'New Title' },
      });
    });

    test('should return false when no conversation found', async () => {
      mockConversationUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await updateConversationTitle('nonexistent', 'org-1', 'New Title');

      expect(result).toBe(false);
    });
  });

  describe('deleteMessagesFromId', () => {
    test('should delete message and all subsequent messages', async () => {
      const messageTime = new Date('2024-01-15T10:05:00Z');
      mockMessageFindFirst.mockResolvedValueOnce({
        id: 'msg-3',
        conversationId: 'conv-1',
        content: 'Third message',
        createdAt: messageTime,
      });
      mockMessageDeleteMany.mockResolvedValueOnce({ count: 3 });

      const result = await deleteMessagesFromId('conv-1', 'org-1', 'msg-3');

      expect(result).toEqual({
        deletedCount: 3,
        messageContent: 'Third message',
      });
      expect(mockMessageFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'msg-3',
          conversationId: 'conv-1',
          conversation: { organizationId: 'org-1' },
        },
      });
      expect(mockMessageDeleteMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          conversation: { organizationId: 'org-1' },
          createdAt: { gte: messageTime },
        },
      });
    });

    test('should return zero count for non-existent message', async () => {
      mockMessageFindFirst.mockResolvedValueOnce(null);

      const result = await deleteMessagesFromId('conv-1', 'org-1', 'nonexistent');

      expect(result).toEqual({
        deletedCount: 0,
        messageContent: null,
      });
      expect(mockMessageDeleteMany).not.toHaveBeenCalled();
    });

    test('should scope query to organizationId via conversation filter', async () => {
      mockMessageFindFirst.mockResolvedValueOnce(null);

      await deleteMessagesFromId('conv-1', 'org-different', 'msg-1');

      expect(mockMessageFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'msg-1',
          conversationId: 'conv-1',
          conversation: { organizationId: 'org-different' },
        },
      });
    });
  });

  describe('dbMessagesToConversation', () => {
    test('should convert simple user-assistant exchange', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'Hello',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'ASSISTANT' as const,
          content: 'Hi there!',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
      ];

      const result = dbMessagesToConversation(dbMessages);

      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    test('should convert messages with tool calls', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'List policies',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'ASSISTANT' as const,
          content: 'Let me check',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'TOOL_USE' as const,
          content: '',
          toolName: 'list_policies',
          toolInput: { limit: 10 },
          toolResult: null,
        },
        {
          role: 'TOOL_RESULT' as const,
          content: '',
          toolName: 'list_policies',
          toolInput: null,
          toolResult: { policies: ['p1'] },
        },
      ];

      const result = dbMessagesToConversation(dbMessages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'List policies' });
      expect(result[1]?.role).toBe('assistant');
      expect(result[1]?.content).toBe('Let me check');
      expect(result[1]?.toolCalls).toHaveLength(1);
      expect(result[1]?.toolCalls?.[0]?.name).toBe('list_policies');
      expect(result[1]?.toolCalls?.[0]?.input).toEqual({ limit: 10 });
      expect(result[1]?.toolCalls?.[0]?.result).toEqual({ policies: ['p1'] });
    });

    test('should handle multiple tool calls in one assistant turn', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'Get info',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'ASSISTANT' as const,
          content: 'I will call multiple tools',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'TOOL_USE' as const,
          content: '',
          toolName: 'list_policies',
          toolInput: {},
          toolResult: null,
        },
        {
          role: 'TOOL_RESULT' as const,
          content: '',
          toolName: 'list_policies',
          toolInput: null,
          toolResult: { data: 1 },
        },
        {
          role: 'TOOL_USE' as const,
          content: '',
          toolName: 'list_users',
          toolInput: {},
          toolResult: null,
        },
        {
          role: 'TOOL_RESULT' as const,
          content: '',
          toolName: 'list_users',
          toolInput: null,
          toolResult: { data: 2 },
        },
      ];

      const result = dbMessagesToConversation(dbMessages);

      expect(result).toHaveLength(2);
      expect(result[1]?.toolCalls).toHaveLength(2);
      expect(result[1]?.toolCalls?.[0]?.name).toBe('list_policies');
      expect(result[1]?.toolCalls?.[1]?.name).toBe('list_users');
    });

    test('should handle tool use without prior assistant message', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'Do something',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'TOOL_USE' as const,
          content: '',
          toolName: 'some_tool',
          toolInput: {},
          toolResult: null,
        },
        {
          role: 'TOOL_RESULT' as const,
          content: '',
          toolName: 'some_tool',
          toolInput: null,
          toolResult: {},
        },
      ];

      const result = dbMessagesToConversation(dbMessages);

      expect(result).toHaveLength(2);
      expect(result[1]?.role).toBe('assistant');
      expect(result[1]?.content).toBe('');
      expect(result[1]?.toolCalls).toHaveLength(1);
    });

    test('should handle multiple user-assistant exchanges', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'First question',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'ASSISTANT' as const,
          content: 'First answer',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'USER' as const,
          content: 'Second question',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'ASSISTANT' as const,
          content: 'Second answer',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
      ];

      const result = dbMessagesToConversation(dbMessages);

      expect(result).toEqual([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Second answer' },
      ]);
    });

    test('should handle empty messages array', () => {
      const result = dbMessagesToConversation([]);

      expect(result).toEqual([]);
    });

    test('should handle tool use with unknown tool name', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'Test',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        { role: 'TOOL_USE' as const, content: '', toolName: null, toolInput: {}, toolResult: null },
      ];

      const result = dbMessagesToConversation(dbMessages);

      expect(result[1]?.toolCalls?.[0]?.name).toBe('unknown');
    });

    test('should handle tool result that does not match pending tool', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'Test',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'ASSISTANT' as const,
          content: 'Calling tool',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'TOOL_USE' as const,
          content: '',
          toolName: 'tool_a',
          toolInput: {},
          toolResult: null,
        },
        // Different tool name in result - should not match
        {
          role: 'TOOL_RESULT' as const,
          content: '',
          toolName: 'tool_b',
          toolInput: null,
          toolResult: { data: 'wrong' },
        },
      ];

      const result = dbMessagesToConversation(dbMessages);

      // The tool result won't be attached because tool names don't match
      expect(result[1]?.toolCalls?.[0]?.result).toBeUndefined();
    });

    test('should handle orphan TOOL_RESULT without preceding TOOL_USE', () => {
      const dbMessages = [
        {
          role: 'USER' as const,
          content: 'Test',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        {
          role: 'ASSISTANT' as const,
          content: 'Response',
          toolName: null,
          toolInput: null,
          toolResult: null,
        },
        // TOOL_RESULT without any preceding TOOL_USE
        {
          role: 'TOOL_RESULT' as const,
          content: '',
          toolName: 'orphan_tool',
          toolInput: null,
          toolResult: { orphan: 'data' },
        },
      ];

      const result = dbMessagesToConversation(dbMessages);

      // Should only have user and assistant messages, the orphan tool result is ignored
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Test' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Response' });
    });
  });

  describe('updateToolResultByConfirmationId', () => {
    test('should update tool result when message with matching confirmationId is found', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'TOOL_RESULT',
          content: 'Result 1',
          toolName: 'some_tool',
          toolInput: null,
          toolResult: { confirmationId: 'conf-abc', data: 'old' },
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'msg-2',
          role: 'TOOL_RESULT',
          content: 'Result 2',
          toolName: 'other_tool',
          toolInput: null,
          toolResult: { confirmationId: 'conf-xyz', data: 'other' },
          createdAt: new Date('2024-01-15T10:01:00Z'),
        },
      ];

      mockMessageFindMany.mockResolvedValueOnce(mockMessages);
      mockMessageUpdate.mockResolvedValueOnce({});

      const newResult = { confirmationId: 'conf-abc', data: 'new', executed: true };
      const result = await updateToolResultByConfirmationId(
        'conv-1',
        'org-1',
        'conf-abc',
        newResult,
      );

      expect(result).toBe(true);
      expect(mockMessageFindMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          role: 'TOOL_RESULT',
          conversation: { organizationId: 'org-1' },
        },
      });
      expect(mockMessageUpdate).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { toolResult: newResult },
      });
    });

    test('should return false when no messages exist in conversation', async () => {
      mockMessageFindMany.mockResolvedValueOnce([]);

      const result = await updateToolResultByConfirmationId('conv-1', 'org-1', 'conf-abc', {
        data: 'new',
      });

      expect(result).toBe(false);
      expect(mockMessageUpdate).not.toHaveBeenCalled();
    });

    test('should return false when confirmationId is not found in any message', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'TOOL_RESULT',
          content: 'Result 1',
          toolName: 'some_tool',
          toolInput: null,
          toolResult: { confirmationId: 'conf-different', data: 'some' },
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockMessageFindMany.mockResolvedValueOnce(mockMessages);

      const result = await updateToolResultByConfirmationId('conv-1', 'org-1', 'conf-notfound', {
        data: 'new',
      });

      expect(result).toBe(false);
      expect(mockMessageUpdate).not.toHaveBeenCalled();
    });

    test('should handle message with null toolResult', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'TOOL_RESULT',
          content: 'Result 1',
          toolName: 'some_tool',
          toolInput: null,
          toolResult: null,
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockMessageFindMany.mockResolvedValueOnce(mockMessages);

      const result = await updateToolResultByConfirmationId('conv-1', 'org-1', 'conf-abc', {
        data: 'new',
      });

      expect(result).toBe(false);
      expect(mockMessageUpdate).not.toHaveBeenCalled();
    });

    test('should handle message with toolResult that has no confirmationId property', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'TOOL_RESULT',
          content: 'Result 1',
          toolName: 'some_tool',
          toolInput: null,
          toolResult: { data: 'some', otherField: 'value' },
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockMessageFindMany.mockResolvedValueOnce(mockMessages);

      const result = await updateToolResultByConfirmationId('conv-1', 'org-1', 'conf-abc', {
        data: 'new',
      });

      expect(result).toBe(false);
      expect(mockMessageUpdate).not.toHaveBeenCalled();
    });

    test('should find correct message among multiple TOOL_RESULT messages', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'TOOL_RESULT',
          content: 'Result 1',
          toolName: 'tool_a',
          toolInput: null,
          toolResult: { confirmationId: 'conf-111', data: 'first' },
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'msg-2',
          role: 'TOOL_RESULT',
          content: 'Result 2',
          toolName: 'tool_b',
          toolInput: null,
          toolResult: { confirmationId: 'conf-222', data: 'second' },
          createdAt: new Date('2024-01-15T10:01:00Z'),
        },
        {
          id: 'msg-3',
          role: 'TOOL_RESULT',
          content: 'Result 3',
          toolName: 'tool_c',
          toolInput: null,
          toolResult: { confirmationId: 'conf-333', data: 'third' },
          createdAt: new Date('2024-01-15T10:02:00Z'),
        },
      ];

      mockMessageFindMany.mockResolvedValueOnce(mockMessages);
      mockMessageUpdate.mockResolvedValueOnce({});

      const newResult = { confirmationId: 'conf-222', data: 'updated', executed: true };
      const result = await updateToolResultByConfirmationId(
        'conv-1',
        'org-1',
        'conf-222',
        newResult,
      );

      expect(result).toBe(true);
      expect(mockMessageUpdate).toHaveBeenCalledWith({
        where: { id: 'msg-2' },
        data: { toolResult: newResult },
      });
    });

    test('should scope query to organizationId via conversation filter', async () => {
      mockMessageFindMany.mockResolvedValueOnce([]);

      await updateToolResultByConfirmationId('conv-1', 'org-different', 'conf-abc', {
        data: 'new',
      });

      expect(mockMessageFindMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          role: 'TOOL_RESULT',
          conversation: { organizationId: 'org-different' },
        },
      });
    });
  });

  /**
   * SECURITY TESTS: Organization Boundary Validation
   * These tests verify that cross-organization access is properly prevented
   */
  describe('Security: Organization Boundary Validation', () => {
    describe('getMessages() rejects cross-org access', () => {
      test('should return empty array when organizationId does not match conversation owner', async () => {
        // When organizationId doesn't match, Prisma returns no results due to join filter
        mockMessageFindMany.mockResolvedValueOnce([]);

        const result = await getMessages('conv-owned-by-org-1', 'attacker-org');

        expect(result).toEqual([]);
        // Verify the security filter was applied
        expect(mockMessageFindMany).toHaveBeenCalledWith({
          where: {
            conversationId: 'conv-owned-by-org-1',
            conversation: { organizationId: 'attacker-org' },
          },
          orderBy: { createdAt: 'asc' },
          take: undefined,
        });
      });

      test('should not leak messages from other organizations', async () => {
        // Simulate org-1 has messages, but org-2 tries to access
        // The query should filter via conversation.organizationId
        mockMessageFindMany.mockResolvedValueOnce([]);

        const result = await getMessages('conv-from-org-1', 'org-2');

        expect(result).toEqual([]);
        expect(mockMessageFindMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              conversationId: 'conv-from-org-1',
              conversation: { organizationId: 'org-2' },
            },
          }),
        );
      });

      test('should return messages when organizationId matches', async () => {
        const mockMessages = [
          {
            id: 'msg-1',
            role: 'USER',
            content: 'Hello',
            toolName: null,
            toolInput: null,
            toolResult: null,
            createdAt: new Date('2024-01-15T10:00:00Z'),
          },
        ];
        mockMessageFindMany.mockResolvedValueOnce(mockMessages);

        const result = await getMessages('conv-1', 'correct-org');

        expect(result).toEqual(mockMessages);
      });
    });

    describe('addMessage() rejects cross-org injection', () => {
      test('should throw error when trying to add message to conversation owned by different org', async () => {
        // Conversation ownership check fails - returns null for wrong org
        mockConversationFindFirst.mockResolvedValueOnce(null);

        await expect(
          addMessage({
            conversationId: 'conv-owned-by-org-1',
            organizationId: 'attacker-org',
            role: 'USER' as const,
            content: 'Malicious message injection attempt',
          }),
        ).rejects.toThrow('Conversation not found or access denied');

        // Verify the security check was performed
        expect(mockConversationFindFirst).toHaveBeenCalledWith({
          where: {
            id: 'conv-owned-by-org-1',
            organizationId: 'attacker-org',
          },
          select: { id: true },
        });
        // Message should NOT be created
        expect(mockMessageCreate).not.toHaveBeenCalled();
      });

      test('should throw error when conversation does not exist', async () => {
        mockConversationFindFirst.mockResolvedValueOnce(null);

        await expect(
          addMessage({
            conversationId: 'nonexistent-conv',
            organizationId: 'org-1',
            role: 'USER' as const,
            content: 'Test message',
          }),
        ).rejects.toThrow('Conversation not found or access denied');

        expect(mockMessageCreate).not.toHaveBeenCalled();
      });

      test('should successfully add message when organization matches', async () => {
        mockConversationFindFirst.mockResolvedValueOnce({ id: 'conv-1' });
        mockMessageCreate.mockResolvedValueOnce({
          id: 'msg-new',
          conversationId: 'conv-1',
          role: 'USER',
          content: 'Legitimate message',
        });
        mockConversationUpdate.mockResolvedValueOnce({});

        const result = await addMessage({
          conversationId: 'conv-1',
          organizationId: 'correct-org',
          role: 'USER' as const,
          content: 'Legitimate message',
        });

        expect(result).toBe('msg-new');
        expect(mockMessageCreate).toHaveBeenCalled();
      });

      test('should prevent injecting tool use messages into cross-org conversations', async () => {
        mockConversationFindFirst.mockResolvedValueOnce(null);

        await expect(
          addMessage({
            conversationId: 'conv-owned-by-org-1',
            organizationId: 'attacker-org',
            role: 'TOOL_USE' as const,
            content: 'Malicious tool call',
            toolName: 'delete_all_data',
            toolInput: { target: 'everything' },
          }),
        ).rejects.toThrow('Conversation not found or access denied');

        expect(mockMessageCreate).not.toHaveBeenCalled();
      });
    });

    describe('deleteMessagesFromId() rejects cross-org deletion', () => {
      test('should not delete messages when organizationId does not match', async () => {
        // The join filter returns null because org doesn't match
        mockMessageFindFirst.mockResolvedValueOnce(null);

        const result = await deleteMessagesFromId('conv-owned-by-org-1', 'attacker-org', 'msg-1');

        expect(result).toEqual({
          deletedCount: 0,
          messageContent: null,
        });
        // Verify the security filter was applied
        expect(mockMessageFindFirst).toHaveBeenCalledWith({
          where: {
            id: 'msg-1',
            conversationId: 'conv-owned-by-org-1',
            conversation: { organizationId: 'attacker-org' },
          },
        });
        // Delete should NOT be called
        expect(mockMessageDeleteMany).not.toHaveBeenCalled();
      });

      test('should not delete messages from other organizations', async () => {
        // Even if message exists in org-1, attacker from org-2 cannot delete
        mockMessageFindFirst.mockResolvedValueOnce(null);

        const result = await deleteMessagesFromId('conv-from-org-1', 'org-2', 'sensitive-msg');

        expect(result.deletedCount).toBe(0);
        expect(mockMessageDeleteMany).not.toHaveBeenCalled();
      });

      test('should successfully delete when organization matches', async () => {
        const messageTime = new Date('2024-01-15T10:05:00Z');
        mockMessageFindFirst.mockResolvedValueOnce({
          id: 'msg-to-delete',
          conversationId: 'conv-1',
          content: 'To be deleted',
          createdAt: messageTime,
        });
        mockMessageDeleteMany.mockResolvedValueOnce({ count: 2 });

        const result = await deleteMessagesFromId('conv-1', 'correct-org', 'msg-to-delete');

        expect(result.deletedCount).toBe(2);
        expect(mockMessageDeleteMany).toHaveBeenCalledWith({
          where: {
            conversationId: 'conv-1',
            conversation: { organizationId: 'correct-org' },
            createdAt: { gte: messageTime },
          },
        });
      });
    });

    describe('updateToolResultByConfirmationId() rejects cross-org modification', () => {
      test('should not update messages when organizationId does not match', async () => {
        // The join filter returns empty array because org doesn't match
        mockMessageFindMany.mockResolvedValueOnce([]);

        const result = await updateToolResultByConfirmationId(
          'conv-owned-by-org-1',
          'attacker-org',
          'conf-123',
          { malicious: 'data' },
        );

        expect(result).toBe(false);
        // Verify the security filter was applied
        expect(mockMessageFindMany).toHaveBeenCalledWith({
          where: {
            conversationId: 'conv-owned-by-org-1',
            role: 'TOOL_RESULT',
            conversation: { organizationId: 'attacker-org' },
          },
        });
        // Update should NOT be called
        expect(mockMessageUpdate).not.toHaveBeenCalled();
      });

      test('should not modify tool results from other organizations', async () => {
        // Even if messages exist in org-1, attacker from org-2 cannot modify
        mockMessageFindMany.mockResolvedValueOnce([]);

        const result = await updateToolResultByConfirmationId(
          'conv-from-org-1',
          'org-2',
          'conf-sensitive',
          { tampered: true },
        );

        expect(result).toBe(false);
        expect(mockMessageUpdate).not.toHaveBeenCalled();
      });

      test('should successfully update when organization matches', async () => {
        const mockMessages = [
          {
            id: 'msg-with-confirmation',
            role: 'TOOL_RESULT',
            content: 'Result',
            toolName: 'some_tool',
            toolInput: null,
            toolResult: { confirmationId: 'conf-123', status: 'pending' },
            createdAt: new Date('2024-01-15T10:00:00Z'),
          },
        ];
        mockMessageFindMany.mockResolvedValueOnce(mockMessages);
        mockMessageUpdate.mockResolvedValueOnce({});

        const newResult = { confirmationId: 'conf-123', status: 'executed' };
        const result = await updateToolResultByConfirmationId(
          'conv-1',
          'correct-org',
          'conf-123',
          newResult,
        );

        expect(result).toBe(true);
        expect(mockMessageUpdate).toHaveBeenCalledWith({
          where: { id: 'msg-with-confirmation' },
          data: { toolResult: newResult },
        });
      });

      test('should prevent tampering with confirmation results from other orgs', async () => {
        mockMessageFindMany.mockResolvedValueOnce([]);

        // Attacker tries to mark a confirmation as executed with fake result
        const result = await updateToolResultByConfirmationId(
          'victim-conv',
          'attacker-org',
          'victim-confirmation-id',
          { executed: true, result: { fake: 'data' } },
        );

        expect(result).toBe(false);
        expect(mockMessageUpdate).not.toHaveBeenCalled();
      });
    });

    describe('Cross-org access patterns', () => {
      test('should consistently use conversation.organizationId filter in all message queries', async () => {
        // getMessages
        mockMessageFindMany.mockResolvedValueOnce([]);
        await getMessages('conv-1', 'org-1');
        expect(mockMessageFindMany).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              conversation: { organizationId: 'org-1' },
            }),
          }),
        );

        // deleteMessagesFromId
        mockMessageFindFirst.mockResolvedValueOnce(null);
        await deleteMessagesFromId('conv-1', 'org-2', 'msg-1');
        expect(mockMessageFindFirst).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              conversation: { organizationId: 'org-2' },
            }),
          }),
        );

        // updateToolResultByConfirmationId
        mockMessageFindMany.mockResolvedValueOnce([]);
        await updateToolResultByConfirmationId('conv-1', 'org-3', 'conf-1', {});
        expect(mockMessageFindMany).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              conversation: { organizationId: 'org-3' },
            }),
          }),
        );
      });

      test('should use direct organization check in addMessage', async () => {
        mockConversationFindFirst.mockResolvedValueOnce(null);

        await expect(
          addMessage({
            conversationId: 'conv-1',
            organizationId: 'org-1',
            role: 'USER' as const,
            content: 'Test',
          }),
        ).rejects.toThrow();

        expect(mockConversationFindFirst).toHaveBeenCalledWith({
          where: {
            id: 'conv-1',
            organizationId: 'org-1',
          },
          select: { id: true },
        });
      });
    });
  });
});
