/**
 * Tests for Agent Confirmation Router
 *
 * Tests the confirmation workflow for agent write operations including
 * listing pending confirmations, confirming, canceling, and executing actions.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';

// Hoist mocks for proper initialization
const {
  mockGetPendingConfirmations,
  mockConfirmAction,
  mockCancelAction,
  mockGetConfirmation,
  mockMarkExecuted,
  mockUpdateToolResultByConfirmationId,
  mockToolExecutors,
} = vi.hoisted(() => ({
  mockGetPendingConfirmations: vi.fn(),
  mockConfirmAction: vi.fn(),
  mockCancelAction: vi.fn(),
  mockGetConfirmation: vi.fn(),
  mockMarkExecuted: vi.fn(),
  mockUpdateToolResultByConfirmationId: vi.fn(),
  mockToolExecutors: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

// Mock modules
vi.mock('@sentinel/shared', () => ({
  getAdminToolName: (baseName: string) => `admin_${baseName}`,
}));

vi.mock('../../../../../packages/api/src/agent/index.js', () => ({
  cancelAction: mockCancelAction,
  confirmAction: mockConfirmAction,
  getConfirmation: mockGetConfirmation,
  getPendingConfirmations: mockGetPendingConfirmations,
  markExecuted: mockMarkExecuted,
  updateToolResultByConfirmationId: mockUpdateToolResultByConfirmationId,
  // Result type helpers - must match the actual implementation
  isSuccess: <T>(result: {
    success: boolean;
    data?: T;
    error?: string;
  }): result is { success: true; data: T } => result.success === true,
  isFailure: (result: {
    success: boolean;
    error?: string;
  }): result is { success: false; error: string } => result.success === false,
}));

vi.mock('../../../../../packages/api/src/services/adminMcpExecutors.js', () => ({
  TOOL_EXECUTORS: mockToolExecutors,
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => {
  const createChain = () => ({
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    output: vi.fn(() => createChain()),
    input: vi.fn(() => createChain()),
  });
  return {
    adminProcedure: createChain(),
    router: vi.fn((routes) => routes),
  };
});

import { agentConfirmationRouter as _agentConfirmationRouter } from '../../../../../packages/api/src/trpc/agent/confirmation.js';

// Type the router for testing
const agentConfirmationRouter = _agentConfirmationRouter as unknown as {
  getPending: TestableHandler<
    Array<{
      id: string;
      toolName: string;
      toolInput: unknown;
      description: string;
      createdAt: string;
      expiresAt: string;
    }>
  >;
  confirm: TestableHandler<{ success: boolean; result?: unknown; error?: string }>;
  cancel: TestableHandler<{ success: boolean; error?: string }>;
  confirmWithModifiedInput: TestableHandler<{ success: boolean; result?: unknown; error?: string }>;
  get: TestableHandler<{
    id: string;
    toolName: string;
    toolInput: unknown;
    description: string;
    status: string;
    createdAt: string;
    expiresAt: string;
    confirmedAt: string | undefined;
    executedAt: string | undefined;
    result: unknown;
    error: string | null;
  } | null>;
};

// Test context factory
interface AgentContextOverrides {
  organizationId?: string;
  userId?: string;
  userEmail?: string;
}

interface AgentContext {
  auth: {
    organizationId: string;
    user: { id: string; email: string };
  };
}

function createAgentContext(overrides: AgentContextOverrides = {}): AgentContext {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: {
        id: overrides.userId ?? 'user-123',
        email: overrides.userEmail ?? 'user@example.com',
      },
    },
  };
}

// Test data factory
function createMockConfirmation(
  overrides: Partial<{
    id: string;
    organizationId: string;
    conversationId: string | null;
    toolName: string;
    toolInput: unknown;
    description: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
    confirmedAt: Date | null;
    confirmedBy: string | null;
    executedAt: Date | null;
    result: unknown;
    error: string | null;
  }> = {},
) {
  return {
    id: 'confirmation-123',
    organizationId: 'org-123',
    conversationId: 'conv-123',
    toolName: 'create_policy',
    toolInput: { name: 'test-policy', effect: 'ALLOW' },
    description: 'Create ALLOW policy "test-policy"',
    status: 'PENDING',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 300000),
    confirmedAt: null,
    confirmedBy: null,
    executedAt: null,
    result: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear mock tool executors
  Object.keys(mockToolExecutors).forEach((key) => delete mockToolExecutors[key]);
  // Set default mocks
  mockMarkExecuted.mockResolvedValue(undefined);
  mockUpdateToolResultByConfirmationId.mockResolvedValue(true);
});

describe('agentConfirmationRouter', () => {
  describe('getPending', () => {
    test('should return pending confirmations for a conversation', async () => {
      const mockConfirmations = [
        createMockConfirmation({ id: 'conf-1' }),
        createMockConfirmation({ id: 'conf-2' }),
      ];
      mockGetPendingConfirmations.mockResolvedValue(mockConfirmations);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.getPending({
        ctx,
        input: { conversationId: 'conv-123' },
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conf-1');
      expect(result[1].id).toBe('conf-2');
      expect(mockGetPendingConfirmations).toHaveBeenCalledWith('conv-123', 'org-123');
    });

    test('should return empty array when no pending confirmations', async () => {
      mockGetPendingConfirmations.mockResolvedValue([]);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.getPending({
        ctx,
        input: { conversationId: 'conv-123' },
      });

      expect(result).toEqual([]);
    });

    test('should format dates as ISO strings', async () => {
      const now = new Date();
      const expires = new Date(Date.now() + 300000);
      const mockConfirmations = [createMockConfirmation({ createdAt: now, expiresAt: expires })];
      mockGetPendingConfirmations.mockResolvedValue(mockConfirmations);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.getPending({
        ctx,
        input: { conversationId: 'conv-123' },
      });

      expect(result[0].createdAt).toBe(now.toISOString());
      expect(result[0].expiresAt).toBe(expires.toISOString());
    });
  });

  describe('confirm', () => {
    test('should confirm and execute action successfully', async () => {
      const mockConfirmation = createMockConfirmation({
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy: 'user-123',
        conversationId: 'conv-123',
      });
      const mockResult = { id: 'policy-123', name: 'test-policy' };

      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: mockResult });
      expect(mockConfirmAction).toHaveBeenCalledWith('confirmation-123', 'org-123', 'user-123');
      expect(mockToolExecutors['admin_create_policy']).toHaveBeenCalledWith(
        'org-123',
        'user-123',
        mockConfirmation.toolInput,
        undefined, // workspaceId
      );
      expect(mockMarkExecuted).toHaveBeenCalledWith('confirmation-123', mockResult, undefined);
    });

    test('should return error when confirmation fails', async () => {
      mockConfirmAction.mockResolvedValue({
        success: false,
        error: 'Confirmation not found or expired',
      });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'nonexistent' },
      });

      expect(result).toEqual({
        success: false,
        error: 'Confirmation not found or expired',
      });
    });

    test('should return default error when confirmation is null', async () => {
      mockConfirmAction.mockResolvedValue({ success: false, error: 'Confirmation not found' });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: false, error: 'Confirmation not found' });
    });

    test('should return error when tool executor is not found', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'unknown_tool',
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: false, error: 'Unknown tool: unknown_tool' });
      expect(mockMarkExecuted).toHaveBeenCalledWith(
        'confirmation-123',
        undefined,
        'Unknown tool: unknown_tool',
      );
    });

    test('should handle execution errors', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: false, error: 'Database error' });
      expect(mockMarkExecuted).toHaveBeenCalledWith(
        'confirmation-123',
        undefined,
        'Database error',
      );
    });

    test('should handle non-Error execution failures', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockRejectedValue('String error');

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: false, error: 'Unknown error executing tool' });
    });

    test('should update tool result when conversationId exists (success)', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      const mockResult = { id: 'policy-123' };
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { id: 'policy-123', userDecision: 'accepted' },
      );
    });

    test('should update tool result when conversationId exists (failure)', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi
        .fn()
        .mockRejectedValue(new Error('Execution failed'));

      const ctx = createAgentContext();
      await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { error: 'Execution failed', userDecision: 'accepted' },
      );
    });

    test('should not update tool result when conversationId is null', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: null,
      });
      const mockResult = { id: 'policy-123' };
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockUpdateToolResultByConfirmationId).not.toHaveBeenCalled();
    });

    test('should handle null result from executor', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(null);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: null });
      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { userDecision: 'accepted' },
      );
    });

    test('should handle undefined result from executor', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(undefined);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: undefined });
      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { userDecision: 'accepted' },
      );
    });
  });

  describe('cancel', () => {
    test('should cancel confirmation successfully', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockGetConfirmation.mockResolvedValue(mockConfirmation);
      mockCancelAction.mockResolvedValue({ success: true, data: undefined });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.cancel({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true });
      expect(mockGetConfirmation).toHaveBeenCalledWith('confirmation-123', 'org-123');
      expect(mockCancelAction).toHaveBeenCalledWith('confirmation-123', 'org-123');
    });

    test('should update tool result with rejection when successful', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockGetConfirmation.mockResolvedValue(mockConfirmation);
      mockCancelAction.mockResolvedValue({ success: true, data: undefined });

      const ctx = createAgentContext();
      await agentConfirmationRouter.cancel({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { userDecision: 'rejected' },
      );
    });

    test('should not update tool result when cancel fails', async () => {
      mockGetConfirmation.mockResolvedValue(createMockConfirmation());
      mockCancelAction.mockResolvedValue({ success: false, error: 'Already processed' });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.cancel({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: false, error: 'Already processed' });
      expect(mockUpdateToolResultByConfirmationId).not.toHaveBeenCalled();
    });

    test('should not update tool result when confirmation has no conversationId', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: null,
      });
      mockGetConfirmation.mockResolvedValue(mockConfirmation);
      mockCancelAction.mockResolvedValue({ success: true, data: undefined });

      const ctx = createAgentContext();
      await agentConfirmationRouter.cancel({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockUpdateToolResultByConfirmationId).not.toHaveBeenCalled();
    });

    test('should handle null confirmation from getConfirmation', async () => {
      mockGetConfirmation.mockResolvedValue(null);
      mockCancelAction.mockResolvedValue({ success: true, data: undefined });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.cancel({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true });
      expect(mockUpdateToolResultByConfirmationId).not.toHaveBeenCalled();
    });
  });

  describe('confirmWithModifiedInput', () => {
    test('should confirm and execute with modified input', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
        toolInput: { name: 'original-policy', effect: 'ALLOW' },
      });
      const modifiedInput = { name: 'modified-policy', effect: 'DENY' };
      const mockResult = { id: 'policy-123', name: 'modified-policy', effect: 'DENY' };

      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123', modifiedInput },
      });

      expect(result).toEqual({ success: true, result: mockResult });
      expect(mockToolExecutors['admin_create_policy']).toHaveBeenCalledWith(
        'org-123',
        'user-123',
        modifiedInput,
        undefined, // workspaceId
      );
    });

    test('should use original input when modifiedInput is not provided', async () => {
      const originalInput = { name: 'original-policy', effect: 'ALLOW' };
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
        toolInput: originalInput,
      });
      const mockResult = { id: 'policy-123' };

      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: mockResult });
      expect(mockToolExecutors['admin_create_policy']).toHaveBeenCalledWith(
        'org-123',
        'user-123',
        originalInput,
        undefined, // workspaceId
      );
    });

    test('should return error when confirmation fails', async () => {
      mockConfirmAction.mockResolvedValue({
        success: false,
        error: 'Confirmation expired',
      });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123', modifiedInput: {} },
      });

      expect(result).toEqual({ success: false, error: 'Confirmation expired' });
    });

    test('should return default error when confirmation is null', async () => {
      mockConfirmAction.mockResolvedValue({ success: false, error: 'Confirmation not found' });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: false, error: 'Confirmation not found' });
    });

    test('should update tool result when conversationId exists (success)', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      const mockResult = { id: 'policy-123', name: 'new-policy' };
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123', modifiedInput: { name: 'new-policy' } },
      });

      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { id: 'policy-123', name: 'new-policy', userDecision: 'accepted' },
      );
    });

    test('should update tool result when conversationId exists (failure)', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi
        .fn()
        .mockRejectedValue(new Error('Validation error'));

      const ctx = createAgentContext();
      await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123', modifiedInput: {} },
      });

      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { error: 'Validation error', userDecision: 'accepted' },
      );
    });

    test('should not update tool result when conversationId is null', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: null,
      });
      const mockResult = { id: 'policy-123' };
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockUpdateToolResultByConfirmationId).not.toHaveBeenCalled();
    });

    test('should handle undefined result from executor', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(undefined);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: undefined });
      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { userDecision: 'accepted' },
      );
    });

    test('should handle unknown tool error', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'unknown_tool',
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: false, error: 'Unknown tool: unknown_tool' });
      expect(mockMarkExecuted).toHaveBeenCalledWith(
        'confirmation-123',
        undefined,
        'Unknown tool: unknown_tool',
      );
    });

    test('should handle non-Error execution failures', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockRejectedValue('String error');

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123', modifiedInput: {} },
      });

      expect(result).toEqual({ success: false, error: 'Unknown error executing tool' });
    });
  });

  describe('get', () => {
    test('should return confirmation details', async () => {
      const now = new Date();
      const expires = new Date(Date.now() + 300000);
      const confirmed = new Date();
      const executed = new Date();

      const mockConfirmation = createMockConfirmation({
        createdAt: now,
        expiresAt: expires,
        confirmedAt: confirmed,
        executedAt: executed,
        result: { id: 'policy-123' },
      });
      mockGetConfirmation.mockResolvedValue(mockConfirmation);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.get({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({
        id: 'confirmation-123',
        toolName: 'create_policy',
        toolInput: { name: 'test-policy', effect: 'ALLOW' },
        description: 'Create ALLOW policy "test-policy"',
        status: 'PENDING',
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        confirmedAt: confirmed.toISOString(),
        executedAt: executed.toISOString(),
        result: { id: 'policy-123' },
        error: null,
      });
    });

    test('should return null when confirmation not found', async () => {
      mockGetConfirmation.mockResolvedValue(null);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.get({
        ctx,
        input: { confirmationId: 'nonexistent' },
      });

      expect(result).toBeNull();
    });

    test('should handle null dates in confirmation', async () => {
      const mockConfirmation = createMockConfirmation({
        confirmedAt: null,
        executedAt: null,
      });
      mockGetConfirmation.mockResolvedValue(mockConfirmation);

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.get({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result?.confirmedAt).toBeUndefined();
      expect(result?.executedAt).toBeUndefined();
    });
  });

  describe('organization isolation', () => {
    test('getPending should filter by organization', async () => {
      mockGetPendingConfirmations.mockResolvedValue([]);

      const ctx = createAgentContext({ organizationId: 'custom-org' });
      await agentConfirmationRouter.getPending({
        ctx,
        input: { conversationId: 'conv-123' },
      });

      expect(mockGetPendingConfirmations).toHaveBeenCalledWith('conv-123', 'custom-org');
    });

    test('confirm should filter by organization', async () => {
      mockConfirmAction.mockResolvedValue({ success: false, error: 'Not found' });

      const ctx = createAgentContext({ organizationId: 'custom-org' });
      await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockConfirmAction).toHaveBeenCalledWith(
        'confirmation-123',
        'custom-org',
        expect.any(String),
      );
    });

    test('cancel should filter by organization', async () => {
      mockGetConfirmation.mockResolvedValue(null);
      mockCancelAction.mockResolvedValue({ success: true, data: undefined });

      const ctx = createAgentContext({ organizationId: 'custom-org' });
      await agentConfirmationRouter.cancel({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockGetConfirmation).toHaveBeenCalledWith('confirmation-123', 'custom-org');
      expect(mockCancelAction).toHaveBeenCalledWith('confirmation-123', 'custom-org');
    });

    test('confirmWithModifiedInput should filter by organization', async () => {
      mockConfirmAction.mockResolvedValue({ success: false, error: 'Not found' });

      const ctx = createAgentContext({ organizationId: 'custom-org' });
      await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockConfirmAction).toHaveBeenCalledWith(
        'confirmation-123',
        'custom-org',
        expect.any(String),
      );
    });

    test('get should filter by organization', async () => {
      mockGetConfirmation.mockResolvedValue(null);

      const ctx = createAgentContext({ organizationId: 'custom-org' });
      await agentConfirmationRouter.get({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockGetConfirmation).toHaveBeenCalledWith('confirmation-123', 'custom-org');
    });
  });

  describe('edge cases', () => {
    test('confirm should handle empty object result', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue({});

      const ctx = createAgentContext();
      const result = await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: {} });
      expect(mockUpdateToolResultByConfirmationId).toHaveBeenCalledWith(
        'conv-123',
        'org-123',
        'confirmation-123',
        { userDecision: 'accepted' },
      );
    });

    test('confirmWithModifiedInput should handle undefined modifiedInput', async () => {
      const originalInput = { name: 'policy', effect: 'ALLOW' };
      const mockConfirmation = createMockConfirmation({
        toolInput: originalInput,
        conversationId: 'conv-123',
      });
      const mockResult = { id: 'policy-123' };

      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext();
      await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123', modifiedInput: undefined },
      });

      expect(mockToolExecutors['admin_create_policy']).toHaveBeenCalledWith(
        'org-123',
        'user-123',
        originalInput,
        undefined, // workspaceId
      );
    });

    test('should handle different tool types', async () => {
      const toolTests = [
        { toolName: 'delete_policy', adminToolName: 'admin_delete_policy' },
        { toolName: 'create_user', adminToolName: 'admin_create_user' },
        { toolName: 'update_role', adminToolName: 'admin_update_role' },
      ];

      for (const { toolName, adminToolName } of toolTests) {
        vi.clearAllMocks();
        const mockConfirmation = createMockConfirmation({
          toolName,
          conversationId: 'conv-123',
        });
        const mockResult = { id: 'result-123' };

        mockConfirmAction.mockResolvedValue({
          success: true,
          data: { confirmation: mockConfirmation },
        });
        mockToolExecutors[adminToolName] = vi.fn().mockResolvedValue(mockResult);

        const ctx = createAgentContext();
        const result = await agentConfirmationRouter.confirm({
          ctx,
          input: { confirmationId: 'confirmation-123' },
        });

        expect(result).toEqual({ success: true, result: mockResult });
        expect(mockToolExecutors[adminToolName]).toHaveBeenCalled();
      }
    });
  });

  describe('user context', () => {
    test('confirm should use user ID from context', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      const mockResult = { id: 'policy-123' };

      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext({ userId: 'specific-user-456' });
      await agentConfirmationRouter.confirm({
        ctx,
        input: { confirmationId: 'confirmation-123' },
      });

      expect(mockConfirmAction).toHaveBeenCalledWith(
        'confirmation-123',
        'org-123',
        'specific-user-456',
      );
      expect(mockToolExecutors['admin_create_policy']).toHaveBeenCalledWith(
        'org-123',
        'specific-user-456',
        expect.anything(),
        undefined, // workspaceId
      );
    });

    test('confirmWithModifiedInput should use user ID from context', async () => {
      const mockConfirmation = createMockConfirmation({
        conversationId: 'conv-123',
      });
      const mockResult = { id: 'policy-123' };

      mockConfirmAction.mockResolvedValue({
        success: true,
        data: { confirmation: mockConfirmation },
      });
      mockToolExecutors['admin_create_policy'] = vi.fn().mockResolvedValue(mockResult);

      const ctx = createAgentContext({ userId: 'specific-user-789' });
      await agentConfirmationRouter.confirmWithModifiedInput({
        ctx,
        input: { confirmationId: 'confirmation-123', modifiedInput: { effect: 'DENY' } },
      });

      expect(mockConfirmAction).toHaveBeenCalledWith(
        'confirmation-123',
        'org-123',
        'specific-user-789',
      );
      expect(mockToolExecutors['admin_create_policy']).toHaveBeenCalledWith(
        'org-123',
        'specific-user-789',
        { effect: 'DENY' },
        undefined, // workspaceId
      );
    });
  });
});
