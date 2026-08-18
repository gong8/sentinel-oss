/**
 * Agent Confirmation Service Unit Tests
 * Tests for the confirmation service (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockCreate, mockFindFirst, mockFindMany, mockUpdate, mockUpdateMany, mockTransaction } =
  vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockFindFirst: vi.fn(),
    mockFindMany: vi.fn(),
    mockUpdate: vi.fn(),
    mockUpdateMany: vi.fn(),
    mockTransaction: vi.fn(),
  }));

vi.mock('@sentinel/db', () => {
  // Create a transaction context object that mirrors the prisma client structure
  const txContext = {
    agentConfirmation: {
      create: mockCreate,
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
  };

  return {
    prisma: {
      agentConfirmation: {
        create: mockCreate,
        findFirst: mockFindFirst,
        findMany: mockFindMany,
        update: mockUpdate,
        updateMany: mockUpdateMany,
      },
      // Transaction executes the callback with the transaction context
      $transaction: mockTransaction.mockImplementation(async (callback: unknown) => {
        if (typeof callback === 'function') {
          return callback(txContext);
        }
        return callback;
      }),
    },
    AgentConfirmationStatus: {
      PENDING: 'PENDING',
      CONFIRMED: 'CONFIRMED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
    },
    Prisma: {
      JsonNull: Symbol('JsonNull'),
    },
  };
});

// Import after mocking
import {
  cancelAction,
  confirmAction,
  createConfirmation,
  generateActionDescription,
  getConfirmation,
  getPendingConfirmations,
  markExecuted,
} from '../../../../packages/api/src/agent/confirmation.js';
import { isFailure, isSuccess } from '../../../../packages/api/src/agent/errors.js';

describe('Confirmation Service', () => {
  // Transaction context for mocking prisma.$transaction callback
  const txContext = {
    agentConfirmation: {
      create: mockCreate,
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Re-establish transaction mock after clearing
    mockTransaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === 'function') {
        return callback(txContext);
      }
      return callback;
    });
  });

  describe('createConfirmation', () => {
    test('should create a pending confirmation', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const mockConfirmation = {
        id: 'conf-123',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: { effect: 'ALLOW', matchers: ['role:Admin'] },
        description: 'Create ALLOW policy',
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        status: 'PENDING',
        createdAt: now,
      };

      // findOrCreate first checks for existing, then creates if not found
      mockFindFirst.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValueOnce(mockConfirmation);

      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: { matchers: ['role:Admin'], effect: 'ALLOW' },
        description: 'Create ALLOW policy',
      });

      expect(result).toEqual({
        confirmationId: 'conf-123',
        toolName: 'create_policy',
        toolInput: { effect: 'ALLOW', matchers: ['role:Admin'] },
        description: 'Create ALLOW policy',
        expiresAt: mockConfirmation.expiresAt.toISOString(),
      });

      // Verify transaction was used for atomic find-or-create
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockFindFirst).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalled();
    });

    test('should create confirmation without conversationId', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const mockConfirmation = {
        id: 'conf-456',
        organizationId: 'org-1',
        toolName: 'delete_policy',
        toolInput: { policyId: 'policy-1' },
        description: 'Delete policy',
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        status: 'PENDING',
        createdAt: now,
      };

      // findOrCreate first checks for existing, then creates if not found
      mockFindFirst.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValueOnce(mockConfirmation);

      const result = await createConfirmation({
        organizationId: 'org-1',
        toolName: 'delete_policy',
        toolInput: { policyId: 'policy-1' },
        description: 'Delete policy',
      });

      expect(result.confirmationId).toBe('conf-456');
      expect(mockCreate).toHaveBeenCalled();
    });

    test('should set expiration 5 minutes from creation', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const mockConfirmation = {
        id: 'conf-789',
        organizationId: 'org-1',
        toolName: 'update_policy',
        toolInput: {},
        description: 'Update policy',
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        status: 'PENDING',
        createdAt: now,
      };

      // findOrCreate first checks for existing, then creates if not found
      mockFindFirst.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValueOnce(mockConfirmation);

      await createConfirmation({
        organizationId: 'org-1',
        toolName: 'update_policy',
        toolInput: {},
        description: 'Update policy',
      });

      const createCall = mockCreate.mock.calls[0]?.[0];
      const expiresAt = createCall?.data?.expiresAt as Date;
      expect(expiresAt.getTime() - now.getTime()).toBe(5 * 60 * 1000);
    });
  });

  describe('getConfirmation', () => {
    test('should get confirmation by id and organizationId', async () => {
      const mockConfirmation = {
        id: 'conf-123',
        organizationId: 'org-1',
        toolName: 'create_policy',
        status: 'PENDING',
      };

      mockFindFirst.mockResolvedValueOnce(mockConfirmation);

      const result = await getConfirmation('conf-123', 'org-1');

      expect(result).toEqual(mockConfirmation);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conf-123',
          organizationId: 'org-1',
        },
      });
    });

    test('should return null for non-existent confirmation', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await getConfirmation('nonexistent', 'org-1');

      expect(result).toBeNull();
    });

    test('should scope query to organizationId', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await getConfirmation('conf-123', 'org-different');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conf-123',
          organizationId: 'org-different',
        },
      });
    });
  });

  describe('getPendingConfirmations', () => {
    test('should expire old confirmations before fetching', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      mockUpdateMany.mockResolvedValueOnce({ count: 2 });
      mockFindMany.mockResolvedValueOnce([]);

      await getPendingConfirmations('conv-1', 'org-1');

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'PENDING',
          expiresAt: { lt: expect.any(Date) },
        },
        data: { status: 'EXPIRED' },
      });
    });

    test('should return pending confirmations ordered by createdAt desc', async () => {
      const mockConfirmations = [
        { id: 'conf-2', createdAt: new Date('2024-01-15T10:05:00Z') },
        { id: 'conf-1', createdAt: new Date('2024-01-15T10:00:00Z') },
      ];

      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockFindMany.mockResolvedValueOnce(mockConfirmations);

      const result = await getPendingConfirmations('conv-1', 'org-1');

      expect(result).toEqual(mockConfirmations);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          organizationId: 'org-1',
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('confirmAction', () => {
    test('should confirm a pending action', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const pendingConfirmation = {
        id: 'conf-123',
        organizationId: 'org-1',
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + 60000), // Not expired
      };

      const confirmedConfirmation = {
        ...pendingConfirmation,
        status: 'CONFIRMED',
        confirmedAt: now,
        confirmedBy: 'user-1',
      };

      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockFindFirst.mockResolvedValueOnce(pendingConfirmation);
      mockUpdate.mockResolvedValueOnce(confirmedConfirmation);

      const result = await confirmAction('conf-123', 'org-1', 'user-1');

      expect(isSuccess(result)).toBe(true);
      expect(isSuccess(result) && result.data.confirmation).toEqual(confirmedConfirmation);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: {
          status: 'CONFIRMED',
          confirmedAt: expect.any(Date),
          confirmedBy: 'user-1',
        },
      });
    });

    test('should return error for non-existent confirmation', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await confirmAction('nonexistent', 'org-1', 'user-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation not found or already processed');
    });

    test('should expire and return error for expired confirmation', async () => {
      const now = new Date('2024-01-15T10:10:00Z');
      vi.setSystemTime(now);

      const expiredConfirmation = {
        id: 'conf-123',
        organizationId: 'org-1',
        status: 'PENDING',
        expiresAt: new Date('2024-01-15T10:05:00Z'), // Already expired
      };

      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockFindFirst.mockResolvedValueOnce(expiredConfirmation);
      mockUpdate.mockResolvedValueOnce({ ...expiredConfirmation, status: 'EXPIRED' });

      const result = await confirmAction('conf-123', 'org-1', 'user-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation has expired');
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: { status: 'EXPIRED' },
      });
    });

    test('should expire old confirmations before processing', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      mockUpdateMany.mockResolvedValueOnce({ count: 3 });
      mockFindFirst.mockResolvedValueOnce(null);

      await confirmAction('conf-123', 'org-1', 'user-1');

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'PENDING',
          expiresAt: { lt: expect.any(Date) },
        },
        data: { status: 'EXPIRED' },
      });
    });
  });

  describe('cancelAction', () => {
    test('should cancel a pending confirmation', async () => {
      const pendingConfirmation = {
        id: 'conf-123',
        organizationId: 'org-1',
        status: 'PENDING',
      };

      mockFindFirst.mockResolvedValueOnce(pendingConfirmation);
      mockUpdate.mockResolvedValueOnce({ ...pendingConfirmation, status: 'CANCELLED' });

      const result = await cancelAction('conf-123', 'org-1');

      expect(isSuccess(result)).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: { status: 'CANCELLED' },
      });
    });

    test('should return error for non-existent confirmation', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await cancelAction('nonexistent', 'org-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation not found or already processed');
    });

    test('should not cancel already processed confirmation', async () => {
      // findFirst with PENDING status will return null for already processed
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await cancelAction('conf-already-confirmed', 'org-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation not found or already processed');
    });
  });

  describe('markExecuted', () => {
    test('should mark confirmation as executed with result', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      mockUpdate.mockResolvedValueOnce({
        id: 'conf-123',
        executedAt: now,
        result: { policyId: 'policy-new' },
      });

      await markExecuted('conf-123', { policyId: 'policy-new' });

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: {
          executedAt: expect.any(Date),
          result: { policyId: 'policy-new' },
          error: undefined,
        },
      });
    });

    test('should mark confirmation as executed with error', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      mockUpdate.mockResolvedValueOnce({
        id: 'conf-123',
        executedAt: now,
        error: 'Policy creation failed',
      });

      await markExecuted('conf-123', null, 'Policy creation failed');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: {
          executedAt: expect.any(Date),
          result: expect.any(Symbol), // Prisma.JsonNull
          error: 'Policy creation failed',
        },
      });
    });

    test('should store complex result objects', async () => {
      const complexResult = {
        policy: { id: 'policy-1', slug: 'test-policy' },
        affectedUsers: ['user-1', 'user-2'],
        timestamp: '2024-01-15T10:00:00Z',
      };

      mockUpdate.mockResolvedValueOnce({
        id: 'conf-123',
        result: complexResult,
      });

      await markExecuted('conf-123', complexResult);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: expect.objectContaining({
          result: complexResult,
        }),
      });
    });
  });

  describe('generateActionDescription', () => {
    test('should generate description for create_policy', () => {
      const input = {
        matchers: ['role:Admin', 'role:User'],
        toolPatterns: ['github::*'],
        effect: 'ALLOW',
      };

      const description = generateActionDescription('create_policy', input);

      expect(description).toBe('Create ALLOW policy for role:Admin, role:User on github::*');
    });

    test('should generate description for update_policy with policyId', () => {
      const input = { policyId: 'policy-123' };

      const description = generateActionDescription('update_policy', input);

      expect(description).toBe('Update policy policy-123');
    });

    test('should generate description for update_policy with slug', () => {
      const input = { slug: 'admin-access' };

      const description = generateActionDescription('update_policy', input);

      expect(description).toBe('Update policy admin-access');
    });

    test('should generate description for delete_policy with policyId', () => {
      const input = { policyId: 'policy-456' };

      const description = generateActionDescription('delete_policy', input);

      expect(description).toBe('Delete policy policy-456');
    });

    test('should generate description for delete_policy with slug fallback', () => {
      const input = { slug: 'delete-me-policy' };

      const description = generateActionDescription('delete_policy', input);

      expect(description).toBe('Delete policy delete-me-policy');
    });

    test('should generate description for enable_policy with slug', () => {
      const input = { slug: 'security-policy' };

      const description = generateActionDescription('enable_policy', input);

      expect(description).toBe('Enable policy security-policy');
    });

    test('should generate description for enable_policy with policyId', () => {
      const input = { policyId: 'policy-enable-123' };

      const description = generateActionDescription('enable_policy', input);

      expect(description).toBe('Enable policy policy-enable-123');
    });

    test('should generate description for disable_policy with policyId', () => {
      const input = { policyId: 'policy-789' };

      const description = generateActionDescription('disable_policy', input);

      expect(description).toBe('Disable policy policy-789');
    });

    test('should generate description for disable_policy with slug fallback', () => {
      const input = { slug: 'disabled-policy-slug' };

      const description = generateActionDescription('disable_policy', input);

      expect(description).toBe('Disable policy disabled-policy-slug');
    });

    test('should generate fallback description for unknown tool', () => {
      const input = { someField: 'value' };

      const description = generateActionDescription('custom_action', input);

      expect(description).toBe('Execute custom_action');
    });

    test('should handle empty matchers array', () => {
      const input = {
        matchers: [],
        toolPatterns: ['*'],
        effect: 'DENY',
      };

      const description = generateActionDescription('create_policy', input);

      expect(description).toBe('Create DENY policy for  on *');
    });

    test('should generate description for create_mcp_server', () => {
      const input = { name: 'GitHub MCP', url: 'https://github.example.com/mcp' };

      const description = generateActionDescription('create_mcp_server', input);

      expect(description).toBe('Create MCP server "GitHub MCP" (https://github.example.com/mcp)');
    });

    test('should generate description for update_mcp_server with currentName', () => {
      const input = { currentName: 'Old Server Name', name: 'New Server Name' };

      const description = generateActionDescription('update_mcp_server', input);

      expect(description).toBe('Update MCP server Old Server Name');
    });

    test('should generate description for update_mcp_server with serverId', () => {
      const input = { serverId: 'server-123', url: 'https://new-url.com' };

      const description = generateActionDescription('update_mcp_server', input);

      expect(description).toBe('Update MCP server server-123');
    });

    test('should generate description for update_mcp_server with name only', () => {
      const input = { name: 'Server Name' };

      const description = generateActionDescription('update_mcp_server', input);

      expect(description).toBe('Update MCP server Server Name');
    });

    test('should generate description for create_webhook with type', () => {
      const input = {
        name: 'Slack Notifier',
        type: 'SLACK',
        events: ['policy.created', 'policy.deleted'],
      };

      const description = generateActionDescription('create_webhook', input);

      expect(description).toBe(
        'Create SLACK webhook "Slack Notifier" for events: policy.created, policy.deleted',
      );
    });

    test('should generate description for create_webhook without type', () => {
      const input = {
        name: 'Custom Webhook',
        events: ['tool.executed'],
      };

      const description = generateActionDescription('create_webhook', input);

      expect(description).toBe('Create CUSTOM webhook "Custom Webhook" for events: tool.executed');
    });

    test('should generate description for create_role', () => {
      const input = { name: 'Developer' };

      const description = generateActionDescription('create_role', input);

      expect(description).toBe('Create role "Developer"');
    });

    test('should generate description for update_role with currentName', () => {
      const input = { currentName: 'OldRole', name: 'NewRole' };

      const description = generateActionDescription('update_role', input);

      expect(description).toBe('Update role OldRole');
    });

    test('should generate description for update_role with roleId', () => {
      const input = { roleId: 'role-456' };

      const description = generateActionDescription('update_role', input);

      expect(description).toBe('Update role role-456');
    });

    test('should generate description for update_role with name only', () => {
      const input = { name: 'SomeName' };

      const description = generateActionDescription('update_role', input);

      expect(description).toBe('Update role SomeName');
    });

    test('should generate description for delete_role', () => {
      const input = { name: 'ObsoleteRole' };

      const description = generateActionDescription('delete_role', input);

      expect(description).toBe('Delete role "ObsoleteRole"');
    });

    test('should generate description for assign_role with roleNames array', () => {
      const input = { roleNames: ['Admin', 'Developer'], email: 'user@example.com' };

      const description = generateActionDescription('assign_role', input);

      expect(description).toBe('Assign roles Admin, Developer to user user@example.com');
    });

    test('should generate description for assign_role without roleNames', () => {
      const input = { email: 'user@example.com' };

      const description = generateActionDescription('assign_role', input);

      expect(description).toBe('Assign roles specified to user user@example.com');
    });

    test('should generate description for revoke_role', () => {
      const input = { roleName: 'Admin', email: 'user@example.com' };

      const description = generateActionDescription('revoke_role', input);

      expect(description).toBe('Revoke role "Admin" from user user@example.com');
    });
  });

  describe('createConfirmation deduplication', () => {
    test('should return existing confirmation when identical pending exists', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const existingConfirmation = {
        id: 'existing-conf-123',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: { effect: 'ALLOW', matchers: ['role:Admin'], toolPatterns: ['github::*'] },
        description: 'Create ALLOW policy',
        expiresAt: new Date(now.getTime() + 3 * 60 * 1000), // 3 minutes left
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 2 * 60 * 1000),
      };

      // findFirst finds the existing pending confirmation
      mockFindFirst.mockResolvedValueOnce(existingConfirmation);

      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: { effect: 'ALLOW', matchers: ['role:Admin'], toolPatterns: ['github::*'] },
        description: 'Create ALLOW policy',
      });

      // Should return existing confirmation, not create new one
      expect(result.confirmationId).toBe('existing-conf-123');
      expect(result.toolName).toBe('create_policy');
      expect(result.toolInput).toEqual({
        effect: 'ALLOW',
        matchers: ['role:Admin'],
        toolPatterns: ['github::*'],
      });
      expect(result.expiresAt).toBe(existingConfirmation.expiresAt.toISOString());

      // mockCreate should NOT be called due to deduplication
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should return existing confirmation when input has different key order', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      // Existing confirmation stored with one key order
      const existingConfirmation = {
        id: 'existing-conf-456',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        // Stored with different key order
        toolInput: { matchers: ['role:User'], effect: 'DENY', toolPatterns: ['slack::*'] },
        description: 'Create DENY policy',
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 1 * 60 * 1000),
      };

      mockFindFirst.mockResolvedValueOnce(existingConfirmation);

      // Create with same data but different key order
      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        // Different key order should still match after normalization
        toolInput: { toolPatterns: ['slack::*'], matchers: ['role:User'], effect: 'DENY' },
        description: 'Create DENY policy',
      });

      // Should return existing confirmation
      expect(result.confirmationId).toBe('existing-conf-456');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should create new confirmation when input differs', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const existingConfirmation = {
        id: 'existing-conf-789',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: { effect: 'ALLOW', matchers: ['role:Admin'], toolPatterns: ['github::*'] },
        description: 'Create ALLOW policy',
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 1 * 60 * 1000),
      };

      const newConfirmation = {
        id: 'new-conf-999',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: { effect: 'DENY', matchers: ['role:User'], toolPatterns: ['slack::*'] },
        description: 'Create DENY policy',
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        status: 'PENDING',
        createdAt: now,
      };

      mockFindFirst.mockResolvedValueOnce(existingConfirmation);
      mockCreate.mockResolvedValueOnce(newConfirmation);

      // Create with different input
      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: { effect: 'DENY', matchers: ['role:User'], toolPatterns: ['slack::*'] },
        description: 'Create DENY policy',
      });

      // Should create new confirmation
      expect(result.confirmationId).toBe('new-conf-999');
      expect(mockCreate).toHaveBeenCalled();
    });

    test('should create new confirmation when no pending exists', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const newConfirmation = {
        id: 'new-conf-111',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'delete_policy',
        toolInput: { policyId: 'policy-to-delete' },
        description: 'Delete policy',
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        status: 'PENDING',
        createdAt: now,
      };

      // No existing confirmation found
      mockFindFirst.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValueOnce(newConfirmation);

      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'delete_policy',
        toolInput: { policyId: 'policy-to-delete' },
        description: 'Delete policy',
      });

      expect(result.confirmationId).toBe('new-conf-111');
      expect(mockCreate).toHaveBeenCalled();
    });

    test('should handle nested objects in deduplication', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const existingConfirmation = {
        id: 'existing-nested',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: {
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          conditions: [{ field: 'time', operator: 'gt', value: '09:00' }],
        },
        description: 'Create policy with conditions',
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 1 * 60 * 1000),
      };

      mockFindFirst.mockResolvedValueOnce(existingConfirmation);

      // Same data with nested objects in different order
      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: {
          conditions: [{ operator: 'gt', field: 'time', value: '09:00' }],
          matchers: ['role:Admin'],
          effect: 'ALLOW',
        },
        description: 'Create policy with conditions',
      });

      expect(result.confirmationId).toBe('existing-nested');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should handle null and undefined values in deduplication', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const existingConfirmation = {
        id: 'existing-nulls',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'update_policy',
        toolInput: { policyId: 'policy-1', description: null },
        description: 'Update policy',
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 1 * 60 * 1000),
      };

      mockFindFirst.mockResolvedValueOnce(existingConfirmation);

      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'update_policy',
        toolInput: { policyId: 'policy-1', description: null },
        description: 'Update policy',
      });

      expect(result.confirmationId).toBe('existing-nulls');
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('Security: Confirmation bypass prevention', () => {
    test('should not confirm action from different organization', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      // findFirst scopes to organizationId, returns null for wrong org
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await confirmAction('conf-123', 'different-org', 'user-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation not found or already processed');

      // Verify organizationId was scoped in query
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conf-123',
          organizationId: 'different-org',
          status: 'PENDING',
        },
      });
    });

    test('should not allow confirming already confirmed action', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      // Already confirmed - findFirst with PENDING status returns null
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await confirmAction('conf-already-confirmed', 'org-1', 'user-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation not found or already processed');
    });

    test('should not allow confirming cancelled action', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      // Already cancelled - findFirst with PENDING status returns null
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await confirmAction('conf-cancelled', 'org-1', 'user-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation not found or already processed');
    });

    test('should not allow cancelling already confirmed action', async () => {
      // Already confirmed - findFirst with PENDING status returns null
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await cancelAction('conf-already-confirmed', 'org-1');

      expect(isFailure(result)).toBe(true);
      expect(isFailure(result) && result.error).toBe('Confirmation not found or already processed');
    });

    test('should reject confirmations with tampered organizationId', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockFindFirst.mockResolvedValueOnce(null);

      // Attempt to confirm with manipulated org ID
      const result = await confirmAction('conf-123', 'malicious-org-id', 'attacker-user');

      expect(isFailure(result)).toBe(true);

      // Confirm the query was scoped correctly
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'malicious-org-id',
          }),
        }),
      );
    });

    test('should always check PENDING status when confirming', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockFindFirst.mockResolvedValueOnce(null);

      await confirmAction('conf-123', 'org-1', 'user-1');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conf-123',
          organizationId: 'org-1',
          status: 'PENDING',
        },
      });
    });

    test('should always check PENDING status when cancelling', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await cancelAction('conf-123', 'org-1');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'conf-123',
          organizationId: 'org-1',
          status: 'PENDING',
        },
      });
    });
  });

  describe('markExecuted edge cases', () => {
    test('should handle undefined result', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      mockUpdate.mockResolvedValueOnce({
        id: 'conf-123',
        executedAt: now,
        result: null,
      });

      await markExecuted('conf-123', undefined);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: {
          executedAt: expect.any(Date),
          result: expect.any(Symbol), // Prisma.JsonNull
          error: undefined,
        },
      });
    });

    test('should handle array result', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const arrayResult = [{ id: '1' }, { id: '2' }];

      mockUpdate.mockResolvedValueOnce({
        id: 'conf-123',
        executedAt: now,
        result: arrayResult,
      });

      await markExecuted('conf-123', arrayResult);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: {
          executedAt: expect.any(Date),
          result: arrayResult,
          error: undefined,
        },
      });
    });

    test('should handle primitive result values', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      mockUpdate.mockResolvedValueOnce({
        id: 'conf-123',
        executedAt: now,
        result: 'success',
      });

      await markExecuted('conf-123', 'success');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'conf-123' },
        data: {
          executedAt: expect.any(Date),
          result: 'success',
          error: undefined,
        },
      });
    });
  });

  describe('normalizeForComparison', () => {
    test('should handle deeply nested policy structures', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const existingConfirmation = {
        id: 'deep-nested-conf',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: {
          slug: 'complex-policy',
          name: 'Complex Policy',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          toolPatterns: ['github::*'],
          description: 'A complex policy',
          conditions: [
            { field: 'time', operator: 'between', value: ['09:00', '17:00'] },
            { field: 'ip', operator: 'in', value: ['10.0.0.0/8'] },
          ],
          enabled: true,
        },
        description: 'Create complex policy',
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 1 * 60 * 1000),
      };

      mockFindFirst.mockResolvedValueOnce(existingConfirmation);

      // Same structure with keys in random order
      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: {
          enabled: true,
          conditions: [
            { value: ['09:00', '17:00'], field: 'time', operator: 'between' },
            { operator: 'in', value: ['10.0.0.0/8'], field: 'ip' },
          ],
          description: 'A complex policy',
          toolPatterns: ['github::*'],
          matchers: ['role:Admin'],
          effect: 'ALLOW',
          name: 'Complex Policy',
          slug: 'complex-policy',
        },
        description: 'Create complex policy',
      });

      expect(result.confirmationId).toBe('deep-nested-conf');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should handle array of conditions normalization', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const existingConfirmation = {
        id: 'array-cond-conf',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: {
          effect: 'DENY',
          conditions: [
            { field: 'method', operator: 'eq', value: 'DELETE' },
            { field: 'resource', operator: 'contains', value: 'sensitive' },
          ],
        },
        description: 'Create policy with array conditions',
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 1 * 60 * 1000),
      };

      mockFindFirst.mockResolvedValueOnce(existingConfirmation);

      // Same conditions, different key order in each condition object
      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_policy',
        toolInput: {
          conditions: [
            { operator: 'eq', value: 'DELETE', field: 'method' },
            { value: 'sensitive', operator: 'contains', field: 'resource' },
          ],
          effect: 'DENY',
        },
        description: 'Create policy with array conditions',
      });

      expect(result.confirmationId).toBe('array-cond-conf');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should handle non-policy objects with alphabetical key sorting', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const existingConfirmation = {
        id: 'generic-conf',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_mcp_server',
        toolInput: { name: 'MyServer', url: 'https://example.com', version: '1.0' },
        description: 'Create MCP server',
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 1 * 60 * 1000),
      };

      mockFindFirst.mockResolvedValueOnce(existingConfirmation);

      // Same data, different key order (not a policy, so alphabetical)
      const result = await createConfirmation({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        toolName: 'create_mcp_server',
        toolInput: { version: '1.0', name: 'MyServer', url: 'https://example.com' },
        description: 'Create MCP server',
      });

      expect(result.confirmationId).toBe('generic-conf');
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
