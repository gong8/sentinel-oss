/**
 * Tests for Admin Sessions Router
 * Tests session management operations (list, terminate)
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockListActiveSessions,
  mockGetActiveSessionCount,
  mockTerminateSession,
  mockTerminateUserSessions,
  mockSendWebhook,
  mockLogger,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
    },
  },
  mockLogAdminAction: vi.fn(),
  mockListActiveSessions: vi.fn(),
  mockGetActiveSessionCount: vi.fn(),
  mockTerminateSession: vi.fn(),
  mockTerminateUserSessions: vi.fn(),
  mockSendWebhook: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  SessionStatus: {
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    TERMINATED: 'TERMINATED',
  },
  AdminActionType: {
    AGENT_TERMINATE: 'AGENT_TERMINATE',
  },
  AdminResourceType: {
    AGENT: 'AGENT',
  },
  WebhookEvent: {
    SESSION_TERMINATED: 'SESSION_TERMINATED',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/session.js', () => ({
  listActiveSessions: mockListActiveSessions,
  getActiveSessionCount: mockGetActiveSessionCount,
  terminateSession: mockTerminateSession,
  terminateUserSessions: mockTerminateUserSessions,
}));

vi.mock('../../../../../packages/api/src/services/webhook.js', () => ({
  sendWebhook: mockSendWebhook,
}));

vi.mock('../../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  adminProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { adminSessionsRouter as _adminSessionsRouter } from '../../../../../packages/api/src/trpc/admin/sessions.js';

// Re-type the router to use our test-friendly handler type
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

const adminSessionsRouter = _adminSessionsRouter as unknown as {
  list: TestableHandler<
    Array<{
      id: string;
      externalSessionId: string;
      userId: string | null;
      agentId: string | null;
      createdAt: Date;
      lastActivityAt: Date;
      toolCallCount: number;
      user?: { id: string; email: string; name: string | null } | null;
    }>
  >;
  getActiveCount: TestableHandler<{ count: number }>;
  terminate: TestableHandler<{ success: boolean; externalSessionId: string | null }>;
  terminateUserSessions: TestableHandler<{
    success: boolean;
    count: number;
    sessionIds: string[];
  }>;
};

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default webhook mock to resolve
  mockSendWebhook.mockResolvedValue(undefined);
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
    userEmail?: string;
    isOrgOwner?: boolean;
    workspaceIds?: string[];
  } = {},
): {
  auth: {
    organizationId: string;
    user: { id: string; email: string };
    isOrgOwner: boolean;
    workspaceIds: string[];
  };
  req: { req: { header: ReturnType<typeof vi.fn> } };
} {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: {
        id: overrides.userId ?? 'admin-123',
        email: overrides.userEmail ?? 'admin@test.com',
      },
      isOrgOwner: overrides.isOrgOwner ?? true,
      workspaceIds: overrides.workspaceIds ?? [],
    },
    req: {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.1';
          if (name === 'user-agent') return 'Mozilla/5.0';
          return null;
        }),
      },
    },
  };
}

describe('adminSessionsRouter', () => {
  describe('list', () => {
    test('should list all active sessions with user info', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          externalSessionId: 'ext-1',
          userId: 'user-1',
          agentId: 'agent-1',
          createdAt: new Date(),
          lastActivityAt: new Date(),
          toolCallCount: 5,
        },
        {
          id: 'session-2',
          externalSessionId: 'ext-2',
          userId: 'user-2',
          agentId: null,
          createdAt: new Date(),
          lastActivityAt: new Date(),
          toolCallCount: 10,
        },
      ];

      const mockUsers = [
        { id: 'user-1', email: 'user1@test.com', name: 'User 1' },
        { id: 'user-2', email: 'user2@test.com', name: null },
      ];

      mockListActiveSessions.mockResolvedValue(mockSessions);
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const ctx = createMockContext();
      const result = await adminSessionsRouter.list({ ctx });

      expect(result).toHaveLength(2);
      expect(result[0].user).toEqual(mockUsers[0]);
      expect(result[1].user).toEqual(mockUsers[1]);
      expect(mockListActiveSessions).toHaveBeenCalledWith('org-123', undefined, []);
    });

    test('should handle sessions without users', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          externalSessionId: 'ext-1',
          userId: null,
          agentId: 'agent-1',
          createdAt: new Date(),
          lastActivityAt: new Date(),
          toolCallCount: 3,
        },
      ];

      mockListActiveSessions.mockResolvedValue(mockSessions);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminSessionsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].user).toBeNull();
    });

    test('should return empty array when no sessions', async () => {
      mockListActiveSessions.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminSessionsRouter.list({ ctx });

      expect(result).toHaveLength(0);
    });
  });

  describe('getActiveCount', () => {
    test('should return count of active sessions for a user', async () => {
      mockGetActiveSessionCount.mockResolvedValue(5);

      const ctx = createMockContext();
      const input = { userId: 'user-1' };

      const result = await adminSessionsRouter.getActiveCount({ ctx, input });

      expect(result.count).toBe(5);
      expect(mockGetActiveSessionCount).toHaveBeenCalledWith('org-123', 'user-1');
    });

    test('should return 0 when user has no sessions', async () => {
      mockGetActiveSessionCount.mockResolvedValue(0);

      const ctx = createMockContext();
      const input = { userId: 'user-1' };

      const result = await adminSessionsRouter.getActiveCount({ ctx, input });

      expect(result.count).toBe(0);
    });
  });

  describe('terminate', () => {
    test('should terminate a specific session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        externalSessionId: 'ext-session-1',
        userId: 'user-1',
        agentId: 'agent-1',
        status: 'ACTIVE',
        createdAt: new Date(),
        lastActivityAt: new Date(),
        organization: { name: 'Test Org' },
      };

      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockTerminateSession.mockResolvedValue({
        success: true,
        externalSessionId: 'ext-session-1',
      });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { sessionId: 'session-123' };

      const result = await adminSessionsRouter.terminate({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.externalSessionId).toBe('ext-session-1');
      expect(mockTerminateSession).toHaveBeenCalledWith('org-123', 'session-123', 'admin-123');
      expect(mockLogAdminAction).toHaveBeenCalled();
      expect(mockSendWebhook).toHaveBeenCalled();
    });

    test('should throw NOT_FOUND when session does not exist', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { sessionId: 'nonexistent' };

      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Session not found',
      });
    });

    test('should throw BAD_REQUEST when session already terminated', async () => {
      const mockSession = {
        id: 'session-123',
        externalSessionId: 'ext-session-1',
        status: 'TERMINATED',
      };

      mockPrisma.session.findFirst.mockResolvedValue(mockSession);

      const ctx = createMockContext();
      const input = { sessionId: 'session-123' };

      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Session is already terminated',
      });
    });

    test('should throw BAD_REQUEST when session already expired', async () => {
      const mockSession = {
        id: 'session-123',
        externalSessionId: 'ext-session-1',
        status: 'EXPIRED',
      };

      mockPrisma.session.findFirst.mockResolvedValue(mockSession);

      const ctx = createMockContext();
      const input = { sessionId: 'session-123' };

      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Session is already expired',
      });
    });

    test('should throw INTERNAL_SERVER_ERROR when termination fails', async () => {
      const mockSession = {
        id: 'session-123',
        externalSessionId: 'ext-session-1',
        status: 'ACTIVE',
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };

      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockTerminateSession.mockResolvedValue({ success: false, externalSessionId: null });

      const ctx = createMockContext();
      const input = { sessionId: 'session-123' };

      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to terminate session',
      });
    });
  });

  describe('terminateUserSessions', () => {
    test('should terminate all sessions for a user successfully (org owner)', async () => {
      const mockUser = { id: 'user-1', email: 'user@test.com', name: 'Test User' };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockTerminateUserSessions.mockResolvedValue({
        count: 3,
        sessionIds: ['ext-1', 'ext-2', 'ext-3'],
      });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ isOrgOwner: true });
      const input = { userId: 'user-1' };

      const result = await adminSessionsRouter.terminateUserSessions({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(result.sessionIds).toEqual(['ext-1', 'ext-2', 'ext-3']);
      // Org owners can terminate all sessions (undefined workspaceScope)
      expect(mockTerminateUserSessions).toHaveBeenCalledWith(
        'org-123',
        'user-1',
        'admin-123',
        undefined,
      );
      expect(mockLogAdminAction).toHaveBeenCalled();
      expect(mockSendWebhook).toHaveBeenCalled();
    });

    test('should terminate only workspace sessions for workspace admin', async () => {
      const mockUser = { id: 'user-1', email: 'user@test.com', name: 'Test User' };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockTerminateUserSessions.mockResolvedValue({
        count: 2,
        sessionIds: ['ext-1', 'ext-2'],
      });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({
        isOrgOwner: false,
        workspaceIds: ['workspace-1', 'workspace-2'],
      });
      const input = { userId: 'user-1' };

      const result = await adminSessionsRouter.terminateUserSessions({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      // Workspace admins limited to their workspaces
      expect(mockTerminateUserSessions).toHaveBeenCalledWith('org-123', 'user-1', 'admin-123', [
        'workspace-1',
        'workspace-2',
      ]);
    });

    test('should throw NOT_FOUND when user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { userId: 'nonexistent' };

      await expect(adminSessionsRouter.terminateUserSessions({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSessionsRouter.terminateUserSessions({ ctx, input })).rejects.toMatchObject(
        {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      );
    });

    test('should return success with zero count when user has no sessions', async () => {
      const mockUser = { id: 'user-1', email: 'user@test.com', name: 'Test User' };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockTerminateUserSessions.mockResolvedValue({
        count: 0,
        sessionIds: [],
      });

      const ctx = createMockContext({ isOrgOwner: true });
      const input = { userId: 'user-1' };

      const result = await adminSessionsRouter.terminateUserSessions({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.sessionIds).toEqual([]);
      // Should not log admin action when no sessions terminated
      expect(mockLogAdminAction).not.toHaveBeenCalled();
    });

    test('should terminate sessions in specific workspace when workspaceId provided', async () => {
      const mockUser = { id: 'user-1', email: 'user@test.com', name: 'Test User' };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockTerminateUserSessions.mockResolvedValue({
        count: 1,
        sessionIds: ['ext-1'],
      });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({
        isOrgOwner: true,
      });
      const input = { userId: 'user-1', workspaceId: 'workspace-1' };

      const result = await adminSessionsRouter.terminateUserSessions({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      // Should scope to specific workspace
      expect(mockTerminateUserSessions).toHaveBeenCalledWith(
        'org-123',
        'user-1',
        'admin-123',
        'workspace-1',
      );
    });
  });

  describe('webhook failure handling', () => {
    test('terminate should handle webhook failure gracefully', async () => {
      const mockSession = {
        id: 'session-123',
        externalSessionId: 'ext-session-1',
        userId: 'user-1',
        agentId: 'agent-1',
        status: 'ACTIVE',
        createdAt: new Date(),
        lastActivityAt: new Date(),
        organization: { name: 'Test Org' },
      };

      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockTerminateSession.mockResolvedValue({
        success: true,
        externalSessionId: 'ext-session-1',
      });
      mockLogAdminAction.mockResolvedValue(undefined);
      // Simulate webhook failure
      mockSendWebhook.mockRejectedValue(new Error('Webhook delivery failed'));

      const ctx = createMockContext();
      const input = { sessionId: 'session-123' };

      // Should still succeed despite webhook failure
      const result = await adminSessionsRouter.terminate({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.externalSessionId).toBe('ext-session-1');
      expect(mockSendWebhook).toHaveBeenCalled();
    });

    test('terminate should log error when webhook fails', async () => {
      const mockSession = {
        id: 'session-123',
        externalSessionId: 'ext-session-1',
        userId: 'user-1',
        agentId: 'agent-1',
        status: 'ACTIVE',
        createdAt: new Date(),
        lastActivityAt: new Date(),
        organization: { name: 'Test Org' },
      };
      const webhookError = new Error('Webhook delivery failed');

      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockTerminateSession.mockResolvedValue({
        success: true,
        externalSessionId: 'ext-session-1',
      });
      mockLogAdminAction.mockResolvedValue(undefined);
      mockSendWebhook.mockRejectedValue(webhookError);

      const ctx = createMockContext();
      const input = { sessionId: 'session-123' };

      await adminSessionsRouter.terminate({ ctx, input });

      // Wait for the fire-and-forget promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to send webhook:', webhookError);
    });

    test('terminateUserSessions should handle webhook failure gracefully', async () => {
      const mockUser = { id: 'user-1', email: 'user@test.com', name: 'Test User' };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockTerminateUserSessions.mockResolvedValue({
        count: 3,
        sessionIds: ['ext-1', 'ext-2', 'ext-3'],
      });
      mockLogAdminAction.mockResolvedValue(undefined);
      // Simulate webhook failure
      mockSendWebhook.mockRejectedValue(new Error('Webhook delivery failed'));

      const ctx = createMockContext({ isOrgOwner: true });
      const input = { userId: 'user-1' };

      // Should still succeed despite webhook failure
      const result = await adminSessionsRouter.terminateUserSessions({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(result.sessionIds).toEqual(['ext-1', 'ext-2', 'ext-3']);
      expect(mockSendWebhook).toHaveBeenCalled();
    });

    test('terminateUserSessions should log error when webhook fails', async () => {
      const mockUser = { id: 'user-1', email: 'user@test.com', name: 'Test User' };
      const webhookError = new Error('Webhook delivery failed');

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockTerminateUserSessions.mockResolvedValue({
        count: 3,
        sessionIds: ['ext-1', 'ext-2', 'ext-3'],
      });
      mockLogAdminAction.mockResolvedValue(undefined);
      mockSendWebhook.mockRejectedValue(webhookError);

      const ctx = createMockContext({ isOrgOwner: true });
      const input = { userId: 'user-1' };

      await adminSessionsRouter.terminateUserSessions({ ctx, input });

      // Wait for the fire-and-forget promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to send webhook:', webhookError);
    });
  });

  describe('organization isolation', () => {
    test('list should filter by organization', async () => {
      mockListActiveSessions.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'isolated-org' });
      await adminSessionsRouter.list({ ctx });

      expect(mockListActiveSessions).toHaveBeenCalledWith('isolated-org', undefined, []);
    });

    test('terminate should verify session belongs to organization', async () => {
      // Session not found because it belongs to a different org
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { sessionId: 'session-from-org-B' };

      await expect(adminSessionsRouter.terminate({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Session not found',
      });
    });

    test('terminateUserSessions should verify user belongs to organization', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { userId: 'user-from-org-B' };

      await expect(adminSessionsRouter.terminateUserSessions({ ctx, input })).rejects.toMatchObject(
        {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      );
    });
  });
});
