/**
 * Tests for Admin Sensitive Flags Router
 * Tests sensitive flag and approval management operations
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogAdminAction, mockGetPendingApprovals, mockProcessApprovalDecision } =
  vi.hoisted(() => ({
    mockPrisma: {
      sensitiveToolFlag: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      sensitiveFlagAgentOverride: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      sensitiveFlagApprovalRequest: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      agent: {
        findFirst: vi.fn(),
      },
      mcpServer: {
        findMany: vi.fn(),
      },
    },
    mockLogAdminAction: vi.fn(),
    mockGetPendingApprovals: vi.fn(),
    mockProcessApprovalDecision: vi.fn(),
  }));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: {
    DbNull: Symbol('DbNull'),
  },
  SensitiveFlagBehavior: {
    RATE_LIMIT: 'RATE_LIMIT',
    REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
    ALERT: 'ALERT',
  },
  ApprovalRequestStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    DENIED: 'DENIED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
  },
  ApprovalType: {
    SENSITIVE_FLAG: 'SENSITIVE_FLAG',
  },
  AdminActionType: {
    SENSITIVE_FLAG_CREATE: 'SENSITIVE_FLAG_CREATE',
    SENSITIVE_FLAG_UPDATE: 'SENSITIVE_FLAG_UPDATE',
    SENSITIVE_FLAG_DELETE: 'SENSITIVE_FLAG_DELETE',
    SENSITIVE_OVERRIDE_CREATE: 'SENSITIVE_OVERRIDE_CREATE',
    SENSITIVE_OVERRIDE_UPDATE: 'SENSITIVE_OVERRIDE_UPDATE',
    SENSITIVE_OVERRIDE_DELETE: 'SENSITIVE_OVERRIDE_DELETE',
    SENSITIVE_APPROVAL_GRANTED: 'SENSITIVE_APPROVAL_GRANTED',
    SENSITIVE_APPROVAL_DENIED: 'SENSITIVE_APPROVAL_DENIED',
  },
  AdminResourceType: {
    SENSITIVE_FLAG: 'SENSITIVE_FLAG',
    SENSITIVE_OVERRIDE: 'SENSITIVE_OVERRIDE',
    SENSITIVE_APPROVAL: 'SENSITIVE_APPROVAL',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/sensitiveFlag.js', () => ({
  getPendingApprovals: mockGetPendingApprovals,
  processApprovalDecision: mockProcessApprovalDecision,
  rateLimitConfigSchema: {
    optional: vi.fn().mockReturnValue({ optional: vi.fn() }),
    nullable: vi.fn().mockReturnValue({ optional: vi.fn() }),
  },
  approvalConfigSchema: {
    optional: vi.fn().mockReturnValue({ optional: vi.fn() }),
    nullable: vi.fn().mockReturnValue({ optional: vi.fn() }),
  },
  alertConfigSchema: {
    optional: vi.fn().mockReturnValue({ optional: vi.fn() }),
    nullable: vi.fn().mockReturnValue({ optional: vi.fn() }),
  },
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  validateToolPattern: vi.fn().mockReturnValue(true),
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

import { adminSensitiveFlagsRouter as _adminSensitiveFlagsRouter } from '../../../../../packages/api/src/trpc/admin/sensitiveFlags.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
// Using Record<string, unknown> allows accessing any property on the result
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

const adminSensitiveFlagsRouter = _adminSensitiveFlagsRouter as unknown as {
  approveRequest: TestableHandler;
  create: TestableHandler;
  createOverride: TestableHandler;
  delete: TestableHandler;
  deleteOverride: TestableHandler;
  denyRequest: TestableHandler;
  get: TestableHandler;
  getApproval: TestableHandler;
  list: TestableHandler;
  listApprovals: TestableHandler;
  listOverrides: TestableHandler;
  update: TestableHandler;
  updateOverride: TestableHandler;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
  mockPrisma.mcpServer.findMany.mockResolvedValue([]);
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
) {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
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

describe('adminSensitiveFlagsRouter', () => {
  describe('list', () => {
    test('should list enabled flags by default', async () => {
      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'github.com::*',
          behaviors: ['RATE_LIMIT'],
          enabled: true,
          creator: { email: 'admin@example.com' },
          _count: { agentOverrides: 2 },
        },
      ];
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(mockFlags);

      const ctx = createMockContext();
      const input = {};

      const result = await adminSensitiveFlagsRouter.list({ ctx, input });

      expect(result).toEqual(mockFlags);
      expect(mockPrisma.sensitiveToolFlag.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'org-123',
          enabled: true,
        }),
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should include disabled flags when requested', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = { includeDisabled: true };

      await adminSensitiveFlagsRouter.list({ ctx, input });

      expect(mockPrisma.sensitiveToolFlag.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'org-123',
        }),
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should handle undefined input', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = undefined;

      await adminSensitiveFlagsRouter.list({ ctx, input });

      expect(mockPrisma.sensitiveToolFlag.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'org-123',
          enabled: true,
        }),
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('get', () => {
    test('should get flag by id', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        creator: { email: 'admin@example.com' },
        agentOverrides: [],
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(mockFlag);

      const ctx = createMockContext();
      const input = { id: 'flag-1' };

      const result = await adminSensitiveFlagsRouter.get({ ctx, input });

      expect(result).toEqual(mockFlag);
      expect(mockPrisma.sensitiveToolFlag.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'flag-1',
          organizationId: 'org-123',
        }),
        include: expect.any(Object),
      });
    });

    test('should throw NOT_FOUND when flag does not exist', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminSensitiveFlagsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.get({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Sensitive flag not found',
      });
    });
  });

  describe('create', () => {
    test('should create a new flag', async () => {
      const mockFlag = {
        id: 'flag-new',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);
      mockPrisma.sensitiveToolFlag.create.mockResolvedValue(mockFlag);

      const ctx = createMockContext();
      const input = {
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
      };

      const result = await adminSensitiveFlagsRouter.create({ ctx, input });

      expect(result).toEqual(mockFlag);
      expect(mockPrisma.sensitiveToolFlag.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
          toolPattern: 'github.com::*',
          behaviors: ['RATE_LIMIT'],
          createdBy: 'user-123',
        }),
      });
    });

    test('should throw CONFLICT when pattern already exists', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({ id: 'existing' });

      const ctx = createMockContext();
      const input = {
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
      };

      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    test('should throw BAD_REQUEST when RATE_LIMIT without config', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = {
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
      };

      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Rate limit config is required when RATE_LIMIT behavior is enabled',
      });
    });

    test('should throw BAD_REQUEST when REQUIRE_APPROVAL without config', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = {
        toolPattern: 'github.com::*',
        behaviors: ['REQUIRE_APPROVAL'],
      };

      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Approval config is required when REQUIRE_APPROVAL behavior is enabled',
      });
    });

    test('should throw BAD_REQUEST when ALERT without config', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = {
        toolPattern: 'github.com::*',
        behaviors: ['ALERT'],
      };

      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Alert config is required when ALERT behavior is enabled',
      });
    });

    test('should log admin action on create', async () => {
      const mockFlag = {
        id: 'flag-new',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);
      mockPrisma.sensitiveToolFlag.create.mockResolvedValue(mockFlag);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = {
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
      };

      await adminSensitiveFlagsRouter.create({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'SENSITIVE_FLAG_CREATE',
          resourceType: 'SENSITIVE_FLAG',
          resourceId: 'flag-new',
        }),
      );
    });
  });

  describe('update', () => {
    test('should update a flag', async () => {
      const existingFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        approvalConfig: null,
        alertConfig: null,
      };
      const updatedFlag = {
        ...existingFlag,
        behaviors: ['RATE_LIMIT', 'REQUIRE_APPROVAL'],
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(existingFlag);
      mockPrisma.sensitiveToolFlag.update.mockResolvedValue(updatedFlag);

      const ctx = createMockContext();
      const input = {
        id: 'flag-1',
        behaviors: ['RATE_LIMIT', 'REQUIRE_APPROVAL'],
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
      };

      const result = await adminSensitiveFlagsRouter.update({ ctx, input });

      expect(result).toEqual(updatedFlag);
    });

    test('should throw NOT_FOUND when flag does not exist', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent', behaviors: ['RATE_LIMIT'] };

      await expect(adminSensitiveFlagsRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should validate config requirements on update', async () => {
      const existingFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['ALERT'],
        rateLimitConfig: null,
        approvalConfig: null,
        alertConfig: null,
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(existingFlag);

      const ctx = createMockContext();
      const input = {
        id: 'flag-1',
        behaviors: ['RATE_LIMIT'],
      };

      await expect(adminSensitiveFlagsRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  describe('delete', () => {
    test('should delete a flag', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(mockFlag);
      mockPrisma.sensitiveToolFlag.delete.mockResolvedValue(mockFlag);

      const ctx = createMockContext();
      const input = { id: 'flag-1' };

      const result = await adminSensitiveFlagsRouter.delete({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.sensitiveToolFlag.delete).toHaveBeenCalledWith({
        where: { id: 'flag-1' },
      });
    });

    test('should throw NOT_FOUND when flag does not exist', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminSensitiveFlagsRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminSensitiveFlagsRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should log admin action on delete', async () => {
      const mockFlag = {
        id: 'flag-1',
        toolPattern: 'github.com::*',
        behaviors: ['RATE_LIMIT'],
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(mockFlag);
      mockPrisma.sensitiveToolFlag.delete.mockResolvedValue(mockFlag);

      const ctx = createMockContext();
      const input = { id: 'flag-1' };

      await adminSensitiveFlagsRouter.delete({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'SENSITIVE_FLAG_DELETE',
          resourceType: 'SENSITIVE_FLAG',
          resourceId: 'flag-1',
        }),
      );
    });
  });

  describe('listOverrides', () => {
    test('should list overrides for a flag', async () => {
      const mockOverrides = [
        {
          id: 'override-1',
          agentId: 'agent-1',
          agent: { id: 'agent-1', name: 'Agent 1' },
        },
      ];
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({ id: 'flag-1' });
      mockPrisma.sensitiveFlagAgentOverride.findMany.mockResolvedValue(mockOverrides);

      const ctx = createMockContext();
      const input = { flagId: 'flag-1' };

      const result = await adminSensitiveFlagsRouter.listOverrides({ ctx, input });

      expect(result).toEqual(mockOverrides);
    });

    test('should throw NOT_FOUND when flag does not exist', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { flagId: 'nonexistent' };

      await expect(adminSensitiveFlagsRouter.listOverrides({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSensitiveFlagsRouter.listOverrides({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('createOverride', () => {
    test('should create an agent override', async () => {
      const mockOverride = {
        id: 'override-new',
        agentId: 'agent-1',
        agent: { id: 'agent-1', name: 'Agent 1' },
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({
        id: 'flag-1',
        toolPattern: 'github.com::*',
      });
      mockPrisma.agent.findFirst.mockResolvedValue({ id: 'agent-1', name: 'Agent 1' });
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue(null);
      mockPrisma.sensitiveFlagAgentOverride.create.mockResolvedValue(mockOverride);

      const ctx = createMockContext();
      const input = {
        flagId: 'flag-1',
        agentId: 'agent-1',
        exempted: true,
      };

      const result = await adminSensitiveFlagsRouter.createOverride({ ctx, input });

      expect(result).toEqual(mockOverride);
    });

    test('should throw NOT_FOUND when flag does not exist', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = {
        flagId: 'nonexistent',
        agentId: 'agent-1',
      };

      await expect(adminSensitiveFlagsRouter.createOverride({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSensitiveFlagsRouter.createOverride({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Sensitive flag not found',
      });
    });

    test('should throw NOT_FOUND when agent does not exist', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({ id: 'flag-1' });
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = {
        flagId: 'flag-1',
        agentId: 'nonexistent',
      };

      await expect(adminSensitiveFlagsRouter.createOverride({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSensitiveFlagsRouter.createOverride({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Agent not found',
      });
    });

    test('should throw CONFLICT when override already exists', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({ id: 'flag-1' });
      mockPrisma.agent.findFirst.mockResolvedValue({ id: 'agent-1', name: 'Agent 1' });
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue({ id: 'existing' });

      const ctx = createMockContext();
      const input = {
        flagId: 'flag-1',
        agentId: 'agent-1',
      };

      await expect(adminSensitiveFlagsRouter.createOverride({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSensitiveFlagsRouter.createOverride({ ctx, input })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('updateOverride', () => {
    test('should update an override', async () => {
      const existingOverride = {
        id: 'override-1',
        sensitiveToolFlag: { organizationId: 'org-123', toolPattern: 'github.com::*' },
        agent: { name: 'Agent 1' },
      };
      const updatedOverride = {
        ...existingOverride,
        exempted: true,
        agent: { id: 'agent-1', name: 'Agent 1' },
      };
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue(existingOverride);
      mockPrisma.sensitiveFlagAgentOverride.update.mockResolvedValue(updatedOverride);

      const ctx = createMockContext();
      const input = {
        id: 'override-1',
        exempted: true,
      };

      const result = await adminSensitiveFlagsRouter.updateOverride({ ctx, input });

      expect(result).toEqual(updatedOverride);
    });

    test('should throw NOT_FOUND when override does not exist', async () => {
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminSensitiveFlagsRouter.updateOverride({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSensitiveFlagsRouter.updateOverride({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should throw NOT_FOUND when override belongs to different org', async () => {
      const existingOverride = {
        id: 'override-1',
        sensitiveToolFlag: { organizationId: 'other-org' },
        agent: { name: 'Agent 1' },
      };
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue(existingOverride);

      const ctx = createMockContext();
      const input = { id: 'override-1' };

      await expect(adminSensitiveFlagsRouter.updateOverride({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('deleteOverride', () => {
    test('should delete an override', async () => {
      const existingOverride = {
        id: 'override-1',
        sensitiveToolFlag: { organizationId: 'org-123', toolPattern: 'github.com::*' },
        agent: { name: 'Agent 1' },
      };
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue(existingOverride);
      mockPrisma.sensitiveFlagAgentOverride.delete.mockResolvedValue(existingOverride);

      const ctx = createMockContext();
      const input = { id: 'override-1' };

      const result = await adminSensitiveFlagsRouter.deleteOverride({ ctx, input });

      expect(result).toEqual({ success: true });
    });

    test('should throw NOT_FOUND when override does not exist', async () => {
      mockPrisma.sensitiveFlagAgentOverride.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminSensitiveFlagsRouter.deleteOverride({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('listApprovals', () => {
    test('should list approval requests', async () => {
      const mockApprovals = { total: 5, requests: [] };
      mockGetPendingApprovals.mockResolvedValue(mockApprovals);

      const ctx = createMockContext();
      const input = {};

      const result = await adminSensitiveFlagsRouter.listApprovals({ ctx, input });

      expect(result).toEqual(mockApprovals);
      expect(mockGetPendingApprovals).toHaveBeenCalledWith('org-123', {
        status: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    test('should pass filter options', async () => {
      mockGetPendingApprovals.mockResolvedValue({ total: 0, requests: [] });

      const ctx = createMockContext();
      const input = { status: 'APPROVED', limit: 20, offset: 10 };

      await adminSensitiveFlagsRouter.listApprovals({ ctx, input });

      expect(mockGetPendingApprovals).toHaveBeenCalledWith('org-123', {
        status: 'APPROVED',
        limit: 20,
        offset: 10,
      });
    });
  });

  describe('getApproval', () => {
    test('should get approval request by id', async () => {
      const mockRequest = {
        id: 'request-1',
        toolName: 'github.com::createPR',
        user: { email: 'user@example.com' },
      };
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);

      const ctx = createMockContext();
      const input = { id: 'request-1' };

      const result = await adminSensitiveFlagsRouter.getApproval({ ctx, input });

      expect(result).toEqual(mockRequest);
    });

    test('should throw NOT_FOUND when request does not exist', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminSensitiveFlagsRouter.getApproval({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSensitiveFlagsRouter.getApproval({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('approveRequest', () => {
    test('should approve a request', async () => {
      const mockRequest = {
        id: 'request-1',
        toolName: 'github.com::createPR',
        userId: 'user-1',
        agentId: 'agent-1',
      };
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockProcessApprovalDecision.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-1' });
      const input = { id: 'request-1', reason: 'Approved by admin' };

      const result = await adminSensitiveFlagsRouter.approveRequest({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockProcessApprovalDecision).toHaveBeenCalledWith(
        'org-123',
        'request-1',
        'APPROVED',
        'admin-1',
        'Approved by admin',
      );
    });

    test('should throw NOT_FOUND when request does not exist or not pending', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminSensitiveFlagsRouter.approveRequest({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminSensitiveFlagsRouter.approveRequest({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Pending approval request not found',
      });
    });

    test('should log admin action on approve', async () => {
      const mockRequest = {
        id: 'request-1',
        toolName: 'github.com::createPR',
        userId: 'user-1',
        agentId: 'agent-1',
      };
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockProcessApprovalDecision.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-1' });
      const input = { id: 'request-1' };

      await adminSensitiveFlagsRouter.approveRequest({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'SENSITIVE_APPROVAL_GRANTED',
          resourceType: 'SENSITIVE_APPROVAL',
        }),
      );
    });
  });

  describe('denyRequest', () => {
    test('should deny a request', async () => {
      const mockRequest = {
        id: 'request-1',
        toolName: 'github.com::createPR',
        userId: 'user-1',
        agentId: 'agent-1',
      };
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockProcessApprovalDecision.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-1' });
      const input = { id: 'request-1', reason: 'Policy violation' };

      const result = await adminSensitiveFlagsRouter.denyRequest({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockProcessApprovalDecision).toHaveBeenCalledWith(
        'org-123',
        'request-1',
        'DENIED',
        'admin-1',
        'Policy violation',
      );
    });

    test('should throw NOT_FOUND when request does not exist or not pending', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent', reason: 'Denied' };

      await expect(adminSensitiveFlagsRouter.denyRequest({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });

    test('should log admin action on deny', async () => {
      const mockRequest = {
        id: 'request-1',
        toolName: 'github.com::createPR',
        userId: 'user-1',
        agentId: 'agent-1',
      };
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(mockRequest);
      mockProcessApprovalDecision.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-1' });
      const input = { id: 'request-1', reason: 'Policy violation' };

      await adminSensitiveFlagsRouter.denyRequest({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'SENSITIVE_APPROVAL_DENIED',
          resourceType: 'SENSITIVE_APPROVAL',
        }),
      );
    });
  });

  describe('organization isolation', () => {
    test('list should only return flags from current organization', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'isolated-org' });
      const input = {};

      await adminSensitiveFlagsRouter.list({ ctx, input });

      expect(mockPrisma.sensitiveToolFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });

    test('create should assign to current organization', async () => {
      const mockFlag = {
        id: 'flag-new',
        toolPattern: 'test::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
      };
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);
      mockPrisma.sensitiveToolFlag.create.mockResolvedValue(mockFlag);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = {
        toolPattern: 'test::*',
        behaviors: ['RATE_LIMIT'],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
      };

      await adminSensitiveFlagsRouter.create({ ctx, input });

      expect(mockPrisma.sensitiveToolFlag.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-A',
        }),
      });
    });
  });
});
