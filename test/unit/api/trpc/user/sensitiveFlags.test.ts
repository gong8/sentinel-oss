/**
 * Tests for User Sensitive Flags Router
 * Tests user-facing sensitive flag approval operations
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockGetUserPendingApprovals,
  mockProcessApprovalDecision,
  mockCancelApprovalRequest,
} = vi.hoisted(() => ({
  mockPrisma: {
    sensitiveFlagApprovalRequest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    sensitiveToolFlag: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mcpServer: {
      findMany: vi.fn(),
    },
  },
  mockGetUserPendingApprovals: vi.fn(),
  mockProcessApprovalDecision: vi.fn(),
  mockCancelApprovalRequest: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminActionType: {
    SENSITIVE_APPROVAL_GRANTED: 'SENSITIVE_APPROVAL_GRANTED',
    SENSITIVE_APPROVAL_CANCELLED: 'SENSITIVE_APPROVAL_CANCELLED',
  },
  AdminResourceType: {
    SENSITIVE_APPROVAL: 'SENSITIVE_APPROVAL',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  getActionDisplayName: vi.fn().mockReturnValue('Test Action'),
}));

vi.mock('../../../../../packages/api/src/services/sensitiveFlag.js', async () => {
  const { z } = await import('zod');
  return {
    getUserPendingApprovals: mockGetUserPendingApprovals,
    processApprovalDecision: mockProcessApprovalDecision,
    cancelApprovalRequest: mockCancelApprovalRequest,
    approvalConfigSchema: z.object({
      timeoutSeconds: z.number().optional(),
      allowedApprovers: z.array(z.enum(['session_owner', 'admin', 'manager'])),
      notifySlack: z.boolean().optional(),
      notifyEmail: z.boolean().optional(),
    }),
  };
});

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  protectedProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { userSensitiveFlagsRouter as _userSensitiveFlagsRouter } from '../../../../../packages/api/src/trpc/user/sensitiveFlags.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

/** Expected shape of a pending approval result */
interface PendingApprovalResult {
  id: string;
  canSelfApprove: boolean;
  [key: string]: unknown;
}

const userSensitiveFlagsRouter = _userSensitiveFlagsRouter as unknown as {
  cancelRequest: TestableHandler;
  getApproval: TestableHandler;
  listPendingApprovals: TestableHandler<PendingApprovalResult[]>;
  selfApprove: TestableHandler;
};

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock for mcpServer.findMany used for friendly names
  mockPrisma.mcpServer.findMany.mockResolvedValue([]);
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
): { auth: { organizationId: string; user: { id: string } }; req: unknown } {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: {
        id: overrides.userId ?? 'user-123',
      },
    },
    // This mimics a Hono context structure for getRequestMetaFromTrpc
    // getRequestMetaFromTrpc(ctx) calls getRequestMeta(ctx.req)
    // getRequestMeta(ctx) calls ctx.req.header(name)
    // So ctx.req needs to be a Hono-like context with .req.header()
    req: {
      req: {
        header: () => null,
      },
      raw: {
        headers: new Headers(),
      },
    },
  };
}

// Helper to create future expiration dates for mock data
const getFutureExpiry = () => new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

describe('userSensitiveFlagsRouter', () => {
  beforeEach(() => {
    // Reset all mocks between tests
    vi.clearAllMocks();
    // Setup updateMany mock to return empty result (no expired requests to update)
    mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('listPendingApprovals', () => {
    test('returns user pending approvals', async () => {
      // Use a future expiration date to ensure requests are not filtered out
      const futureExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'dangerous_tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: futureExpiry,
          agent: null,
          agentId: null,
        },
        {
          id: 'approval-2',
          toolName: 'another_tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: futureExpiry,
          agent: null,
          agentId: null,
        },
      ];

      // Mock the actual Prisma calls
      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(mockPrisma.sensitiveFlagApprovalRequest.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'PENDING',
        },
        include: {
          agent: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      // Results should include canSelfApprove field (expiresAt is included from mock data)
      expect(result).toEqual(mockApprovals.map((a) => ({ ...a, canSelfApprove: false })));
      // No expired requests, so updateMany should not have been called
      expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).not.toHaveBeenCalled();
    });

    test('returns empty array when no pending approvals', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue([]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result).toEqual([]);
    });

    test('matches server::* wildcard pattern for canSelfApprove', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'github.com::create_issue',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null,
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'github.com::*',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['session_owner', 'admin'],
          },
          agentOverrides: [],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].canSelfApprove).toBe(true);
    });

    test('matches exact tool pattern for canSelfApprove', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::dangerous-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null,
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::dangerous-tool',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['session_owner'],
          },
          agentOverrides: [],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result[0].canSelfApprove).toBe(true);
    });

    test('matches * wildcard pattern for canSelfApprove', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'any.server::any_tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null,
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: '*',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['session_owner'],
          },
          agentOverrides: [],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result[0].canSelfApprove).toBe(true);
    });

    test('uses agent override approval config for canSelfApprove', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::dangerous-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: { name: 'Test Agent' },
          agentId: 'agent-1',
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::dangerous-tool',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['admin'], // Base config doesn't allow session_owner
          },
          agentOverrides: [
            {
              agentId: 'agent-1',
              approvalConfig: {
                timeoutSeconds: 600,
                allowedApprovers: ['session_owner'], // Override allows session_owner
              },
            },
          ],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result[0].canSelfApprove).toBe(true);
    });

    test('returns canSelfApprove false when no matching flag', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::unknown-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null,
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::other-tool',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['session_owner'],
          },
          agentOverrides: [],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result[0].canSelfApprove).toBe(false);
    });

    test('returns canSelfApprove false when session_owner not in allowedApprovers', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::dangerous-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null,
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::dangerous-tool',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['admin', 'manager'], // No session_owner
          },
          agentOverrides: [],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result[0].canSelfApprove).toBe(false);
    });

    test('returns canSelfApprove false when approval config is invalid schema', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::dangerous-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null,
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::dangerous-tool',
          approvalConfig: { invalid: 'schema' }, // Invalid config
          agentOverrides: [],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result[0].canSelfApprove).toBe(false);
    });

    test('returns canSelfApprove false when approval config is null', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::dangerous-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null,
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::dangerous-tool',
          approvalConfig: null,
          agentOverrides: [],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      expect(result[0].canSelfApprove).toBe(false);
    });

    test('handles null agentId correctly (uses base config)', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::dangerous-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: null,
          agentId: null, // No agent
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::dangerous-tool',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['session_owner'], // Base allows session_owner
          },
          agentOverrides: [
            {
              agentId: 'agent-1',
              approvalConfig: {
                timeoutSeconds: 600,
                allowedApprovers: ['admin'], // Override doesn't allow session_owner
              },
            },
          ],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      // Should use base config since agentId is null
      expect(result[0].canSelfApprove).toBe(true);
    });

    test('does not match unrelated agent override', async () => {
      const mockApprovals = [
        {
          id: 'approval-1',
          toolName: 'server::dangerous-tool',
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt: getFutureExpiry(),
          agent: { name: 'Agent 2' },
          agentId: 'agent-2', // Different agent
        },
      ];

      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'server::dangerous-tool',
          approvalConfig: {
            timeoutSeconds: 300,
            allowedApprovers: ['admin'], // Base doesn't allow session_owner
          },
          agentOverrides: [
            {
              agentId: 'agent-1', // Override is for different agent
              approvalConfig: {
                timeoutSeconds: 600,
                allowedApprovers: ['session_owner'],
              },
            },
          ],
        },
      ];

      mockPrisma.sensitiveFlagApprovalRequest.findMany.mockResolvedValue(mockApprovals);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.listPendingApprovals({ ctx });

      // Should use base config since override doesn't match
      expect(result[0].canSelfApprove).toBe(false);
    });
  });

  describe('getApproval', () => {
    test('returns approval request by id', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        toolName: 'dangerous_tool',
        status: 'PENDING',
        agent: { name: 'Test Agent' },
        createdAt: new Date(),
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.getApproval({
        ctx,
        input: { id: 'approval-1' },
      });

      expect(mockPrisma.sensitiveFlagApprovalRequest.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'approval-1',
          userId: 'user-123',
        },
        include: {
          agent: { select: { name: true } },
        },
      });
      expect(result).toEqual(mockRequest);
    });

    test('throws NOT_FOUND when approval not found', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.getApproval({
          ctx,
          input: { id: 'nonexistent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        userSensitiveFlagsRouter.getApproval({
          ctx,
          input: { id: 'nonexistent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Approval request not found',
      });
    });

    test('cannot access other user approvals', async () => {
      // The request won't be found because userId filter won't match
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ userId: 'other-user' });

      await expect(
        userSensitiveFlagsRouter.getApproval({
          ctx,
          input: { id: 'approval-1' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('selfApprove', () => {
    test('successfully self-approves when allowed', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        agentId: 'agent-1',
        toolName: 'dangerous_tool',
        status: 'PENDING',
      };

      const mockFlag = {
        id: 'flag-1',
        organizationId: 'org-123',
        toolPattern: '*', // Matches any tool
        enabled: true,
        approvalConfig: {
          timeoutSeconds: 300,
          allowedApprovers: ['session_owner', 'admin'],
        },
        agentOverrides: [],
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockProcessApprovalDecision.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.selfApprove({
        ctx,
        input: { id: 'approval-1' },
      });

      expect(mockProcessApprovalDecision).toHaveBeenCalledWith(
        'org-123',
        'approval-1',
        'APPROVED',
        'user-123',
      );
      expect(result).toEqual({ success: true });
    });

    test('uses agent override approval config when present', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        agentId: 'agent-1',
        toolName: 'dangerous_tool',
        status: 'PENDING',
      };

      const mockFlag = {
        id: 'flag-1',
        organizationId: 'org-123',
        toolPattern: '*', // Matches any tool
        enabled: true,
        approvalConfig: {
          timeoutSeconds: 300,
          allowedApprovers: ['admin'], // Base config doesn't allow session_owner
        },
        agentOverrides: [
          {
            agentId: 'agent-1',
            approvalConfig: {
              timeoutSeconds: 600,
              allowedApprovers: ['session_owner'], // Override allows session_owner
            },
          },
        ],
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockProcessApprovalDecision.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.selfApprove({
        ctx,
        input: { id: 'approval-1' },
      });

      expect(result).toEqual({ success: true });
    });

    test('throws NOT_FOUND when request not found', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.selfApprove({
          ctx,
          input: { id: 'nonexistent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Pending approval request not found',
      });
    });

    test('throws FORBIDDEN when no matching flag found', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        agentId: 'agent-1',
        toolName: 'example.com::testTool',
        status: 'PENDING',
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      // Return empty array - no matching flags
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.selfApprove({
          ctx,
          input: { id: 'approval-1' },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Self-approval is not allowed for this tool',
      });
    });

    test('throws FORBIDDEN when approval config is invalid', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        agentId: null,
        toolName: 'example.com::testTool',
        status: 'PENDING',
      };

      const mockFlag = {
        id: 'flag-1',
        toolPattern: '*',
        organizationId: 'org-123',
        enabled: true,
        approvalConfig: { invalid: 'config' }, // Invalid config
        agentOverrides: [],
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.selfApprove({
          ctx,
          input: { id: 'approval-1' },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Self-approval is not allowed for this tool',
      });
    });

    test('throws FORBIDDEN when session_owner not in allowed approvers', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        agentId: null,
        toolName: 'example.com::testTool',
        status: 'PENDING',
      };

      const mockFlag = {
        id: 'flag-1',
        toolPattern: '*',
        organizationId: 'org-123',
        enabled: true,
        approvalConfig: {
          timeoutSeconds: 300,
          allowedApprovers: ['admin', 'manager'], // session_owner not allowed
        },
        agentOverrides: [],
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.selfApprove({
          ctx,
          input: { id: 'approval-1' },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Self-approval is not allowed for this tool',
      });
    });

    test('handles null approval config', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        agentId: null,
        toolName: 'example.com::testTool',
        status: 'PENDING',
      };

      const mockFlag = {
        id: 'flag-1',
        toolPattern: '*',
        organizationId: 'org-123',
        enabled: true,
        approvalConfig: null,
        agentOverrides: [],
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([mockFlag]);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.selfApprove({
          ctx,
          input: { id: 'approval-1' },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Self-approval is not allowed for this tool',
      });
    });
  });

  describe('cancelRequest', () => {
    test('successfully cancels pending request', async () => {
      const mockRequest = {
        id: 'approval-1',
        userId: 'user-123',
        status: 'PENDING',
        toolName: 'example.com::testTool',
        agentId: 'agent-123',
      };

      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockCancelApprovalRequest.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const result = await userSensitiveFlagsRouter.cancelRequest({
        ctx,
        input: { id: 'approval-1' },
      });

      expect(mockPrisma.sensitiveFlagApprovalRequest.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'approval-1',
          userId: 'user-123',
          status: 'PENDING',
        },
      });
      expect(mockCancelApprovalRequest).toHaveBeenCalledWith('org-123', 'approval-1');
      expect(result).toEqual({ success: true });
    });

    test('throws NOT_FOUND when request not found', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.cancelRequest({
          ctx,
          input: { id: 'nonexistent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Pending approval request not found',
      });
    });

    test('cannot cancel other user requests', async () => {
      // Request won't be found because userId filter won't match
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ userId: 'other-user' });

      await expect(
        userSensitiveFlagsRouter.cancelRequest({
          ctx,
          input: { id: 'approval-1' },
        }),
      ).rejects.toThrow(TRPCError);

      expect(mockCancelApprovalRequest).not.toHaveBeenCalled();
    });

    test('cannot cancel non-pending requests', async () => {
      // Status filter means already processed requests won't be found
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        userSensitiveFlagsRouter.cancelRequest({
          ctx,
          input: { id: 'approved-request' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Pending approval request not found',
      });
    });
  });
});
