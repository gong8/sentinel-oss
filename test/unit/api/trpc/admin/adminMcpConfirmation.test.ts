/**
 * Tests for Admin MCP Confirmation Router
 *
 * Tests the confirmation workflow for admin MCP write operations including
 * listing, confirming, rejecting, and expiring confirmations.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';
import { createAdminContext } from '../../../../helpers/unit-test-mocks.js';

// Hoist mocks for proper initialization
const {
  mockGetConfirmations,
  mockGetConfirmationById,
  mockGetPendingCount,
  mockConfirmAction,
  mockRejectAction,
  mockMarkExecuted,
  mockMarkFailed,
  mockExpireOldConfirmations,
  mockExecuteConfirmedAction,
  mockLogAdminAction,
  mockGetRequestMetaFromTrpc,
  mockGetAdminWorkspaceIds,
} = vi.hoisted(() => ({
  mockGetConfirmations: vi.fn(),
  mockGetConfirmationById: vi.fn(),
  mockGetPendingCount: vi.fn(),
  mockConfirmAction: vi.fn(),
  mockRejectAction: vi.fn(),
  mockMarkExecuted: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockExpireOldConfirmations: vi.fn(),
  mockExecuteConfirmedAction: vi.fn(),
  mockLogAdminAction: vi.fn(),
  mockGetRequestMetaFromTrpc: vi.fn(),
  mockGetAdminWorkspaceIds: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  AdminMcpConfirmationStatus: {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    EXECUTED: 'EXECUTED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
    FAILED: 'FAILED',
  },
  AdminActionType: {
    POLICY_CREATE: 'POLICY_CREATE',
    POLICY_UPDATE: 'POLICY_UPDATE',
    POLICY_DELETE: 'POLICY_DELETE',
    POLICY_ENABLE: 'POLICY_ENABLE',
    POLICY_DISABLE: 'POLICY_DISABLE',
    USER_CREATE: 'USER_CREATE',
    USER_UPDATE: 'USER_UPDATE',
    USER_DELETE: 'USER_DELETE',
    USER_TOKEN_REFRESH: 'USER_TOKEN_REFRESH',
    USER_TOKEN_REVOKE: 'USER_TOKEN_REVOKE',
    ROLE_CREATE: 'ROLE_CREATE',
    ROLE_UPDATE: 'ROLE_UPDATE',
    ROLE_DELETE: 'ROLE_DELETE',
    MCP_SERVER_CREATE: 'MCP_SERVER_CREATE',
    MCP_SERVER_UPDATE: 'MCP_SERVER_UPDATE',
    MCP_SERVER_DELETE: 'MCP_SERVER_DELETE',
    MCP_SERVER_ORG_API_KEY_ADD: 'MCP_SERVER_ORG_API_KEY_ADD',
    OAUTH_CLIENT_REGISTER: 'OAUTH_CLIENT_REGISTER',
    AGENT_CREATE: 'AGENT_CREATE',
    AGENT_DELETE: 'AGENT_DELETE',
    SENSITIVE_FLAG_CREATE: 'SENSITIVE_FLAG_CREATE',
    SENSITIVE_FLAG_UPDATE: 'SENSITIVE_FLAG_UPDATE',
    SENSITIVE_FLAG_DELETE: 'SENSITIVE_FLAG_DELETE',
    SENSITIVE_APPROVAL_GRANTED: 'SENSITIVE_APPROVAL_GRANTED',
    SENSITIVE_APPROVAL_DENIED: 'SENSITIVE_APPROVAL_DENIED',
    WEBHOOK_ENDPOINT_CREATE: 'WEBHOOK_ENDPOINT_CREATE',
    WEBHOOK_ENDPOINT_UPDATE: 'WEBHOOK_ENDPOINT_UPDATE',
    WEBHOOK_ENDPOINT_DELETE: 'WEBHOOK_ENDPOINT_DELETE',
    PERMISSION_REQUEST_APPROVE: 'PERMISSION_REQUEST_APPROVE',
    PERMISSION_REQUEST_DENY: 'PERMISSION_REQUEST_DENY',
    ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
  },
  AdminResourceType: {
    POLICY: 'POLICY',
    USER: 'USER',
    ROLE: 'ROLE',
    MCP_SERVER: 'MCP_SERVER',
    AGENT: 'AGENT',
    SENSITIVE_FLAG: 'SENSITIVE_FLAG',
    WEBHOOK_ENDPOINT: 'WEBHOOK_ENDPOINT',
    PERMISSION_REQUEST: 'PERMISSION_REQUEST',
    ORGANIZATION: 'ORGANIZATION',
  },
  AdminActionSource: {
    MCP_ADMIN: 'MCP_ADMIN',
    DASHBOARD: 'DASHBOARD',
    API: 'API',
  },
  Prisma: { JsonNull: null },
}));

vi.mock('../../../../../packages/api/src/services/adminMcpConfirmation.js', () => ({
  getConfirmations: mockGetConfirmations,
  getConfirmationById: mockGetConfirmationById,
  getPendingCount: mockGetPendingCount,
  confirmAction: mockConfirmAction,
  rejectAction: mockRejectAction,
  markExecuted: mockMarkExecuted,
  markFailed: mockMarkFailed,
  expireOldConfirmations: mockExpireOldConfirmations,
}));

vi.mock('../../../../../packages/api/src/services/adminMcpExecutors.js', () => ({
  executeConfirmedAction: mockExecuteConfirmedAction,
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/lib/requestMeta.js', () => ({
  getRequestMetaFromTrpc: mockGetRequestMetaFromTrpc,
}));

vi.mock('../../../../../packages/api/src/services/workspace.js', () => ({
  getAdminWorkspaceIds: mockGetAdminWorkspaceIds,
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => {
  const createChain = () => ({
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    output: vi.fn(() => createChain()),
    input: vi.fn(() => createChain()),
  });
  return {
    router: vi.fn((routes) => routes),
    adminProcedure: createChain(),
  };
});

import { adminMcpConfirmationRouter as _adminMcpConfirmationRouter } from '../../../../../packages/api/src/trpc/admin/adminMcpConfirmation.js';

// Type the router for testing
const adminMcpConfirmationRouter = _adminMcpConfirmationRouter as unknown as {
  list: TestableHandler<{
    total: number;
    confirmations: unknown[];
    hasMore: boolean;
  }>;
  get: TestableHandler;
  pendingCount: TestableHandler<number>;
  confirm: TestableHandler<{ success: boolean; result: unknown }>;
  reject: TestableHandler<{ success: boolean }>;
  expireOld: TestableHandler<{ expired: number }>;
};

// Test data factory
function createMockConfirmation(
  overrides: Partial<{
    id: string;
    organizationId: string;
    mcpSessionId: string;
    adminUserId: string;
    toolName: string;
    toolInput: unknown;
    description: string;
    riskLevel: string;
    status: string;
    expiresAt: Date;
    confirmedBy: string | null;
    confirmedAt: Date | null;
    rejectedBy: string | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    executedAt: Date | null;
    result: unknown;
    error: string | null;
    adminUser: { id: string; email: string };
    confirmer: { id: string; email: string } | null;
    rejecter: { id: string; email: string } | null;
  }> = {},
) {
  return {
    id: 'confirmation-123',
    organizationId: 'org-123',
    mcpSessionId: 'session-123',
    adminUserId: 'admin-user-123',
    toolName: 'admin_create_policy',
    toolInput: { name: 'test-policy', effect: 'ALLOW' },
    description: 'Create ALLOW policy "test-policy"',
    riskLevel: 'MEDIUM',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 300000),
    confirmedBy: null,
    confirmedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    executedAt: null,
    result: null,
    error: null,
    adminUser: { id: 'admin-user-123', email: 'admin@example.com' },
    confirmer: null,
    rejecter: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRequestMetaFromTrpc.mockReturnValue({
    ipAddress: '192.168.1.1',
    userAgent: 'test-agent',
  });
  // Default: org owner has access to all workspaces (undefined = no filtering)
  mockGetAdminWorkspaceIds.mockResolvedValue(undefined);
  mockLogAdminAction.mockResolvedValue(undefined);
  mockMarkExecuted.mockResolvedValue(undefined);
  mockMarkFailed.mockResolvedValue(undefined);
});

describe('adminMcpConfirmationRouter', () => {
  describe('list', () => {
    test('should return confirmations with pagination', async () => {
      const mockConfirmations = [
        createMockConfirmation({ id: 'conf-1' }),
        createMockConfirmation({ id: 'conf-2' }),
      ];
      mockGetConfirmations.mockResolvedValue({
        total: 10,
        confirmations: mockConfirmations,
      });

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.list({
        ctx,
        input: { limit: 50, offset: 0 },
      });

      expect(result).toEqual({
        total: 10,
        confirmations: mockConfirmations,
        hasMore: true,
      });
      expect(mockGetConfirmations).toHaveBeenCalledWith('org-123', {
        limit: 50,
        offset: 0,
      });
    });

    test('should filter by status when provided', async () => {
      mockGetConfirmations.mockResolvedValue({
        total: 5,
        confirmations: [],
      });

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.list({
        ctx,
        input: { status: 'PENDING', limit: 50, offset: 0 },
      });

      expect(mockGetConfirmations).toHaveBeenCalledWith('org-123', {
        status: 'PENDING',
        limit: 50,
        offset: 0,
      });
    });

    test('should filter by mcpSessionId when provided', async () => {
      mockGetConfirmations.mockResolvedValue({
        total: 3,
        confirmations: [],
      });

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.list({
        ctx,
        input: { mcpSessionId: 'session-456', limit: 50, offset: 0 },
      });

      expect(mockGetConfirmations).toHaveBeenCalledWith('org-123', {
        mcpSessionId: 'session-456',
        limit: 50,
        offset: 0,
      });
    });

    test('should filter by adminUserId when provided', async () => {
      mockGetConfirmations.mockResolvedValue({
        total: 2,
        confirmations: [],
      });

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.list({
        ctx,
        input: { adminUserId: 'user-789', limit: 50, offset: 0 },
      });

      expect(mockGetConfirmations).toHaveBeenCalledWith('org-123', {
        adminUserId: 'user-789',
        limit: 50,
        offset: 0,
      });
    });

    test('should return hasMore=false when at end of results', async () => {
      const mockConfirmations = [createMockConfirmation()];
      mockGetConfirmations.mockResolvedValue({
        total: 1,
        confirmations: mockConfirmations,
      });

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.list({
        ctx,
        input: { limit: 50, offset: 0 },
      });

      expect(result.hasMore).toBe(false);
    });

    test('should respect custom pagination limits', async () => {
      mockGetConfirmations.mockResolvedValue({
        total: 100,
        confirmations: Array(10).fill(createMockConfirmation()),
      });

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.list({
        ctx,
        input: { limit: 10, offset: 20 },
      });

      expect(result.hasMore).toBe(true);
      expect(mockGetConfirmations).toHaveBeenCalledWith('org-123', {
        limit: 10,
        offset: 20,
      });
    });
  });

  describe('get', () => {
    test('should return confirmation by id', async () => {
      const mockConfirmation = createMockConfirmation();
      mockGetConfirmationById.mockResolvedValue(mockConfirmation);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.get({
        ctx,
        input: { id: 'confirmation-123' },
      });

      expect(result).toEqual(mockConfirmation);
      expect(mockGetConfirmationById).toHaveBeenCalledWith('org-123', 'confirmation-123');
    });

    test('should throw NOT_FOUND when confirmation does not exist', async () => {
      mockGetConfirmationById.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminMcpConfirmationRouter.get({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Confirmation not found',
      });
    });
  });

  describe('pendingCount', () => {
    test('should return count of pending confirmations', async () => {
      mockGetPendingCount.mockResolvedValue(5);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.pendingCount({ ctx, input: undefined });

      expect(result).toBe(5);
      expect(mockGetPendingCount).toHaveBeenCalledWith('org-123');
    });

    test('should return 0 when no pending confirmations', async () => {
      mockGetPendingCount.mockResolvedValue(0);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.pendingCount({ ctx, input: undefined });

      expect(result).toBe(0);
    });
  });

  describe('confirm', () => {
    test('should confirm and execute action successfully', async () => {
      const mockConfirmation = createMockConfirmation({
        status: 'CONFIRMED',
        confirmedBy: 'admin-user-123',
        confirmedAt: new Date(),
      });
      const mockResult = { id: 'policy-123', name: 'test-policy' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.confirm({
        ctx,
        input: { id: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: mockResult });
      expect(mockConfirmAction).toHaveBeenCalledWith(
        'org-123',
        'confirmation-123',
        'admin-user-123',
      );
      expect(mockExecuteConfirmedAction).toHaveBeenCalledWith(mockConfirmation, {
        adminWorkspaceIds: undefined,
      });
      expect(mockMarkExecuted).toHaveBeenCalledWith('org-123', 'confirmation-123', mockResult);
      expect(mockLogAdminAction).toHaveBeenCalled();
    });

    test('should throw NOT_FOUND when confirmation not found or already processed', async () => {
      mockConfirmAction.mockResolvedValue({ success: false });

      const ctx = createAdminContext();

      await expect(
        adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Confirmation not found, already processed, or expired',
      });
    });

    test('should throw NOT_FOUND when confirmAction returns no confirmation', async () => {
      mockConfirmAction.mockResolvedValue({ success: true, confirmation: undefined });

      const ctx = createAdminContext();

      await expect(
        adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Confirmation not found, already processed, or expired',
      });
    });

    test('should mark as failed and throw when execution fails', async () => {
      const mockConfirmation = createMockConfirmation({
        status: 'CONFIRMED',
      });
      const executionError = new Error('Database connection failed');

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockRejectedValue(executionError);

      const ctx = createAdminContext();

      await expect(
        adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to execute action: Database connection failed',
      });

      expect(mockMarkFailed).toHaveBeenCalledWith(
        'org-123',
        'confirmation-123',
        'Database connection failed',
      );
    });

    test('should handle non-Error execution failures', async () => {
      const mockConfirmation = createMockConfirmation({
        status: 'CONFIRMED',
      });

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockRejectedValue('String error');

      const ctx = createAdminContext();

      await expect(
        adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to execute action: Unknown error',
      });

      expect(mockMarkFailed).toHaveBeenCalledWith('org-123', 'confirmation-123', 'Unknown error');
    });

    test('should log admin action with correct action type for policy creation', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_create_policy',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'policy-123', name: 'test-policy' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          actionType: 'POLICY_CREATE',
          resourceType: 'POLICY',
          resourceId: 'policy-123',
          resourceName: 'test-policy',
          source: 'MCP_ADMIN',
          mcpSessionId: 'session-123',
          mcpToolName: 'admin_create_policy',
          confirmationId: 'confirmation-123',
          confirmedByUserId: 'admin-user-123',
        }),
      );
    });

    test('should log admin action with correct action type for user deletion', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_delete_user',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'user-456', email: 'deleted@example.com' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'USER_DELETE',
          resourceType: 'USER',
          resourceId: 'user-456',
          resourceName: 'deleted@example.com',
        }),
      );
    });

    test('should log admin action with correct action type for role update', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_update_role',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'role-789', name: 'Admin Role' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'ROLE_UPDATE',
          resourceType: 'ROLE',
        }),
      );
    });

    test('should log admin action with correct action type for MCP server creation', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_create_mcp_server',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'server-123', name: 'Test Server' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'MCP_SERVER_CREATE',
          resourceType: 'MCP_SERVER',
        }),
      );
    });

    test('should log admin action with correct action type for webhook deletion', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_delete_webhook',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'webhook-123' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'WEBHOOK_ENDPOINT_DELETE',
          resourceType: 'WEBHOOK_ENDPOINT',
        }),
      );
    });

    test('should log admin action with correct action type for agent creation', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_create_agent',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'agent-123', name: 'Test Agent' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'AGENT_CREATE',
          resourceType: 'AGENT',
        }),
      );
    });

    test('should log admin action with correct action type for sensitive flag operations', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_approve_sensitive',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'request-123' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'SENSITIVE_APPROVAL_GRANTED',
          resourceType: 'SENSITIVE_FLAG',
        }),
      );
    });

    test('should log admin action with correct action type for permission requests', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_approve_request',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'request-456' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PERMISSION_REQUEST_APPROVE',
          resourceType: 'PERMISSION_REQUEST',
        }),
      );
    });

    test('should use ORGANIZATION_UPDATE for unknown tool names', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_unknown_tool',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'resource-123' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'ORGANIZATION_UPDATE',
          resourceType: 'ORGANIZATION',
        }),
      );
    });

    test('should extract resource name from slug when name is not available', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_create_policy',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'policy-123', slug: 'my-policy-slug' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceName: 'my-policy-slug',
        }),
      );
    });

    test('should use tool name as resource name when no name/slug/email available', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_enable_policy',
        status: 'CONFIRMED',
      });
      const mockResult = { id: 'policy-123' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceName: 'admin_enable_policy',
        }),
      );
    });

    test('should handle result without id field', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_create_policy',
        status: 'CONFIRMED',
      });
      const mockResult = { name: 'test-policy' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: undefined,
        }),
      );
    });

    test('should handle null result', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_delete_policy',
        status: 'CONFIRMED',
      });

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.confirm({
        ctx,
        input: { id: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: null });
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: undefined,
          resourceName: 'admin_delete_policy',
        }),
      );
    });

    test('should include request metadata in admin action log', async () => {
      const mockConfirmation = createMockConfirmation({ status: 'CONFIRMED' });
      const mockResult = { id: 'policy-123' };

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResult);
      mockGetRequestMetaFromTrpc.mockReturnValue({
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });
  });

  describe('reject', () => {
    test('should reject confirmation successfully', async () => {
      mockRejectAction.mockResolvedValue({ success: true });

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.reject({
        ctx,
        input: { id: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true });
      expect(mockRejectAction).toHaveBeenCalledWith(
        'org-123',
        'confirmation-123',
        'admin-user-123',
        undefined,
      );
    });

    test('should reject confirmation with reason', async () => {
      mockRejectAction.mockResolvedValue({ success: true });

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.reject({
        ctx,
        input: { id: 'confirmation-123', reason: 'Not approved by security team' },
      });

      expect(result).toEqual({ success: true });
      expect(mockRejectAction).toHaveBeenCalledWith(
        'org-123',
        'confirmation-123',
        'admin-user-123',
        'Not approved by security team',
      );
    });

    test('should throw NOT_FOUND when confirmation not found or already processed', async () => {
      mockRejectAction.mockResolvedValue({ success: false });

      const ctx = createAdminContext();

      await expect(
        adminMcpConfirmationRouter.reject({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Confirmation not found or already processed',
      });
    });
  });

  describe('expireOld', () => {
    test('should expire old confirmations and return count', async () => {
      mockExpireOldConfirmations.mockResolvedValue(3);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.expireOld({ ctx, input: undefined });

      expect(result).toEqual({ expired: 3 });
      expect(mockExpireOldConfirmations).toHaveBeenCalledWith('org-123');
    });

    test('should return 0 when no confirmations expired', async () => {
      mockExpireOldConfirmations.mockResolvedValue(0);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.expireOld({ ctx, input: undefined });

      expect(result).toEqual({ expired: 0 });
    });
  });

  describe('organization isolation', () => {
    test('list should filter by organization', async () => {
      mockGetConfirmations.mockResolvedValue({ total: 0, confirmations: [] });

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminMcpConfirmationRouter.list({ ctx, input: { limit: 50, offset: 0 } });

      expect(mockGetConfirmations).toHaveBeenCalledWith('custom-org', expect.anything());
    });

    test('get should filter by organization', async () => {
      mockGetConfirmationById.mockResolvedValue(null);

      const ctx = createAdminContext({ organizationId: 'custom-org' });

      try {
        await adminMcpConfirmationRouter.get({ ctx, input: { id: 'confirmation-123' } });
      } catch {
        // Expected
      }

      expect(mockGetConfirmationById).toHaveBeenCalledWith('custom-org', 'confirmation-123');
    });

    test('pendingCount should filter by organization', async () => {
      mockGetPendingCount.mockResolvedValue(0);

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminMcpConfirmationRouter.pendingCount({ ctx, input: undefined });

      expect(mockGetPendingCount).toHaveBeenCalledWith('custom-org');
    });

    test('confirm should filter by organization', async () => {
      mockConfirmAction.mockResolvedValue({ success: false });

      const ctx = createAdminContext({ organizationId: 'custom-org' });

      try {
        await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });
      } catch {
        // Expected
      }

      expect(mockConfirmAction).toHaveBeenCalledWith(
        'custom-org',
        'confirmation-123',
        expect.any(String),
      );
    });

    test('reject should filter by organization', async () => {
      mockRejectAction.mockResolvedValue({ success: false });

      const ctx = createAdminContext({ organizationId: 'custom-org' });

      try {
        await adminMcpConfirmationRouter.reject({ ctx, input: { id: 'confirmation-123' } });
      } catch {
        // Expected
      }

      expect(mockRejectAction).toHaveBeenCalledWith(
        'custom-org',
        'confirmation-123',
        expect.any(String),
        undefined,
      );
    });

    test('expireOld should filter by organization', async () => {
      mockExpireOldConfirmations.mockResolvedValue(0);

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminMcpConfirmationRouter.expireOld({ ctx, input: undefined });

      expect(mockExpireOldConfirmations).toHaveBeenCalledWith('custom-org');
    });
  });

  describe('action type mapping', () => {
    const toolActionTypeTests: Array<{
      toolName: string;
      expectedActionType: string;
      expectedResourceType: string;
    }> = [
      {
        toolName: 'admin_create_policy',
        expectedActionType: 'POLICY_CREATE',
        expectedResourceType: 'POLICY',
      },
      {
        toolName: 'admin_update_policy',
        expectedActionType: 'POLICY_UPDATE',
        expectedResourceType: 'POLICY',
      },
      {
        toolName: 'admin_delete_policy',
        expectedActionType: 'POLICY_DELETE',
        expectedResourceType: 'POLICY',
      },
      {
        toolName: 'admin_enable_policy',
        expectedActionType: 'POLICY_ENABLE',
        expectedResourceType: 'POLICY',
      },
      {
        toolName: 'admin_disable_policy',
        expectedActionType: 'POLICY_DISABLE',
        expectedResourceType: 'POLICY',
      },
      {
        toolName: 'admin_create_user',
        expectedActionType: 'USER_CREATE',
        expectedResourceType: 'USER',
      },
      {
        toolName: 'admin_update_user',
        expectedActionType: 'USER_UPDATE',
        expectedResourceType: 'USER',
      },
      {
        toolName: 'admin_delete_user',
        expectedActionType: 'USER_DELETE',
        expectedResourceType: 'USER',
      },
      {
        toolName: 'admin_refresh_token',
        expectedActionType: 'USER_TOKEN_REFRESH',
        expectedResourceType: 'USER',
      },
      {
        toolName: 'admin_revoke_token',
        expectedActionType: 'USER_TOKEN_REVOKE',
        expectedResourceType: 'USER',
      },
      {
        toolName: 'admin_create_role',
        expectedActionType: 'ROLE_CREATE',
        expectedResourceType: 'ROLE',
      },
      {
        toolName: 'admin_update_role',
        expectedActionType: 'ROLE_UPDATE',
        expectedResourceType: 'ROLE',
      },
      {
        toolName: 'admin_delete_role',
        expectedActionType: 'ROLE_DELETE',
        expectedResourceType: 'ROLE',
      },
      {
        toolName: 'admin_create_mcp_server',
        expectedActionType: 'MCP_SERVER_CREATE',
        expectedResourceType: 'MCP_SERVER',
      },
      {
        toolName: 'admin_update_mcp_server',
        expectedActionType: 'MCP_SERVER_UPDATE',
        expectedResourceType: 'MCP_SERVER',
      },
      {
        toolName: 'admin_delete_mcp_server',
        expectedActionType: 'MCP_SERVER_DELETE',
        expectedResourceType: 'MCP_SERVER',
      },
      // Note: admin_set_org_api_key doesn't contain 'mcp_server' or 'oauth', so it falls through to ORGANIZATION
      {
        toolName: 'admin_set_org_api_key',
        expectedActionType: 'MCP_SERVER_ORG_API_KEY_ADD',
        expectedResourceType: 'ORGANIZATION',
      },
      {
        toolName: 'admin_register_oauth_client',
        expectedActionType: 'OAUTH_CLIENT_REGISTER',
        expectedResourceType: 'MCP_SERVER',
      },
      {
        toolName: 'admin_create_agent',
        expectedActionType: 'AGENT_CREATE',
        expectedResourceType: 'AGENT',
      },
      {
        toolName: 'admin_delete_agent',
        expectedActionType: 'AGENT_DELETE',
        expectedResourceType: 'AGENT',
      },
      {
        toolName: 'admin_create_sensitive_flag',
        expectedActionType: 'SENSITIVE_FLAG_CREATE',
        expectedResourceType: 'SENSITIVE_FLAG',
      },
      {
        toolName: 'admin_update_sensitive_flag',
        expectedActionType: 'SENSITIVE_FLAG_UPDATE',
        expectedResourceType: 'SENSITIVE_FLAG',
      },
      {
        toolName: 'admin_delete_sensitive_flag',
        expectedActionType: 'SENSITIVE_FLAG_DELETE',
        expectedResourceType: 'SENSITIVE_FLAG',
      },
      {
        toolName: 'admin_approve_sensitive',
        expectedActionType: 'SENSITIVE_APPROVAL_GRANTED',
        expectedResourceType: 'SENSITIVE_FLAG',
      },
      {
        toolName: 'admin_deny_sensitive',
        expectedActionType: 'SENSITIVE_APPROVAL_DENIED',
        expectedResourceType: 'SENSITIVE_FLAG',
      },
      {
        toolName: 'admin_create_webhook',
        expectedActionType: 'WEBHOOK_ENDPOINT_CREATE',
        expectedResourceType: 'WEBHOOK_ENDPOINT',
      },
      {
        toolName: 'admin_update_webhook',
        expectedActionType: 'WEBHOOK_ENDPOINT_UPDATE',
        expectedResourceType: 'WEBHOOK_ENDPOINT',
      },
      {
        toolName: 'admin_delete_webhook',
        expectedActionType: 'WEBHOOK_ENDPOINT_DELETE',
        expectedResourceType: 'WEBHOOK_ENDPOINT',
      },
      {
        toolName: 'admin_approve_request',
        expectedActionType: 'PERMISSION_REQUEST_APPROVE',
        expectedResourceType: 'PERMISSION_REQUEST',
      },
      {
        toolName: 'admin_deny_request',
        expectedActionType: 'PERMISSION_REQUEST_DENY',
        expectedResourceType: 'PERMISSION_REQUEST',
      },
    ];

    test.each(toolActionTypeTests)(
      'should map $toolName to $expectedActionType and $expectedResourceType',
      async ({ toolName, expectedActionType, expectedResourceType }) => {
        const mockConfirmation = createMockConfirmation({
          toolName,
          status: 'CONFIRMED',
        });
        const mockResult = { id: 'resource-123' };

        mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
        mockExecuteConfirmedAction.mockResolvedValue(mockResult);

        const ctx = createAdminContext();
        await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

        expect(mockLogAdminAction).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: expectedActionType,
            resourceType: expectedResourceType,
          }),
        );
      },
    );
  });

  describe('edge cases', () => {
    test('should handle empty confirmation list', async () => {
      mockGetConfirmations.mockResolvedValue({
        total: 0,
        confirmations: [],
      });

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.list({
        ctx,
        input: { limit: 50, offset: 0 },
      });

      expect(result).toEqual({
        total: 0,
        confirmations: [],
        hasMore: false,
      });
    });

    test('should handle confirmation with all filters', async () => {
      mockGetConfirmations.mockResolvedValue({
        total: 1,
        confirmations: [createMockConfirmation()],
      });

      const ctx = createAdminContext();
      await adminMcpConfirmationRouter.list({
        ctx,
        input: {
          status: 'PENDING',
          mcpSessionId: 'session-123',
          adminUserId: 'admin-123',
          limit: 10,
          offset: 5,
        },
      });

      expect(mockGetConfirmations).toHaveBeenCalledWith('org-123', {
        status: 'PENDING',
        mcpSessionId: 'session-123',
        adminUserId: 'admin-123',
        limit: 10,
        offset: 5,
      });
    });

    test('should handle result with primitive value', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_some_tool',
        status: 'CONFIRMED',
      });

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue('primitive result');

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.confirm({
        ctx,
        input: { id: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: 'primitive result' });
    });

    test('should handle result array', async () => {
      const mockConfirmation = createMockConfirmation({
        toolName: 'admin_bulk_operation',
        status: 'CONFIRMED',
      });
      const mockResultArray = [{ id: '1' }, { id: '2' }];

      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue(mockResultArray);

      const ctx = createAdminContext();
      const result = await adminMcpConfirmationRouter.confirm({
        ctx,
        input: { id: 'confirmation-123' },
      });

      expect(result).toEqual({ success: true, result: mockResultArray });
    });
  });

  describe('authorization checks', () => {
    test('confirm should use the authenticated user as confirmer', async () => {
      const mockConfirmation = createMockConfirmation({ status: 'CONFIRMED' });
      mockConfirmAction.mockResolvedValue({ success: true, confirmation: mockConfirmation });
      mockExecuteConfirmedAction.mockResolvedValue({ id: 'resource-123' });

      const ctx = createAdminContext({ userId: 'specific-admin-456' });
      await adminMcpConfirmationRouter.confirm({ ctx, input: { id: 'confirmation-123' } });

      expect(mockConfirmAction).toHaveBeenCalledWith(
        'org-123',
        'confirmation-123',
        'specific-admin-456',
      );
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmedByUserId: 'specific-admin-456',
        }),
      );
    });

    test('reject should use the authenticated user as rejecter', async () => {
      mockRejectAction.mockResolvedValue({ success: true });

      const ctx = createAdminContext({ userId: 'specific-admin-789' });
      await adminMcpConfirmationRouter.reject({ ctx, input: { id: 'confirmation-123' } });

      expect(mockRejectAction).toHaveBeenCalledWith(
        'org-123',
        'confirmation-123',
        'specific-admin-789',
        undefined,
      );
    });
  });
});
