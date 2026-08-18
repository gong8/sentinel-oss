/**
 * Tests for Admin Agents Router
 * Tests agent management operations
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogAdminAction, mockAnalyzeAgentDeletion, mockSendWebhook } = vi.hoisted(
  () => ({
    mockPrisma: {
      agent: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
    mockLogAdminAction: vi.fn(),
    mockAnalyzeAgentDeletion: vi.fn(),
    mockSendWebhook: vi.fn(),
  }),
);

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminActionType: {
    AGENT_CREATE: 'AGENT_CREATE',
    AGENT_DELETE: 'AGENT_DELETE',
    AGENT_RESTORE: 'AGENT_RESTORE',
  },
  AdminResourceType: {
    AGENT: 'AGENT',
  },
  WebhookEvent: {
    AGENT_CREATED: 'AGENT_CREATED',
    AGENT_DELETED: 'AGENT_DELETED',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/deletionImpact.js', () => ({
  analyzeAgentDeletion: mockAnalyzeAgentDeletion,
}));

vi.mock('../../../../../packages/api/src/services/webhook.js', () => ({
  sendWebhook: mockSendWebhook,
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

import { adminAgentsRouter as _adminAgentsRouter } from '../../../../../packages/api/src/trpc/admin/agents.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
// Using Record<string, unknown> allows accessing any property on the result
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

const adminAgentsRouter = _adminAgentsRouter as unknown as {
  create: TestableHandler;
  delete: TestableHandler;
  get: TestableHandler;
  getDeletionImpact: TestableHandler;
  list: TestableHandler;
  restore: TestableHandler;
};

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
  // Mock sendWebhook to return a resolved promise (fire-and-forget pattern)
  mockSendWebhook.mockResolvedValue(undefined);
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
    isOrgOwner?: boolean;
  } = {},
): {
  auth: { organizationId: string; user: { id: string }; isOrgOwner: boolean };
  req: { req: { header: ReturnType<typeof vi.fn> } };
} {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
      isOrgOwner: overrides.isOrgOwner ?? true,
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

describe('adminAgentsRouter', () => {
  describe('list', () => {
    test('should list all active agents', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', organizationId: 'org-123', deletedAt: null },
        { id: 'agent-2', name: 'Agent 2', organizationId: 'org-123', deletedAt: null },
      ];
      mockPrisma.agent.findMany.mockResolvedValue(mockAgents);

      const ctx = createMockContext();
      const input = {};

      const _result = await adminAgentsRouter.list({ ctx, input });

      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            deletedAt: null,
          }),
          orderBy: {
            createdAt: 'desc',
          },
        }),
      );
    });

    test('should include deleted agents when includeDeleted is true', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', deletedAt: null },
        { id: 'agent-2', name: 'Agent 2', deletedAt: new Date() },
      ];
      mockPrisma.agent.findMany.mockResolvedValue(mockAgents);

      const ctx = createMockContext();
      const input = { includeDeleted: true };

      const result = await adminAgentsRouter.list({ ctx, input });

      expect(result).toEqual(mockAgents);
      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
          }),
          orderBy: {
            createdAt: 'desc',
          },
        }),
      );
    });

    test('should exclude deleted agents by default', async () => {
      mockPrisma.agent.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = { includeDeleted: false };

      await adminAgentsRouter.list({ ctx, input });

      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            deletedAt: null,
          }),
          orderBy: {
            createdAt: 'desc',
          },
        }),
      );
    });

    test('should handle undefined input', async () => {
      mockPrisma.agent.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = undefined;

      await adminAgentsRouter.list({ ctx, input });

      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            deletedAt: null,
          }),
          orderBy: {
            createdAt: 'desc',
          },
        }),
      );
    });

    test('should use organization from context', async () => {
      mockPrisma.agent.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const input = {};

      await adminAgentsRouter.list({ ctx, input });

      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'custom-org',
          }),
        }),
      );
    });
  });

  describe('get', () => {
    test('should get agent by id', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      const result = await adminAgentsRouter.get({ ctx, input });

      expect(result).toEqual(mockAgent);
      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'agent-1',
          organizationId: 'org-123',
          deletedAt: null,
        },
      });
    });

    test('should throw NOT_FOUND when agent does not exist', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminAgentsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminAgentsRouter.get({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Agent not found',
      });
    });

    test('should enforce organization isolation', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'agent-from-org-B' };

      await expect(adminAgentsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'agent-from-org-B',
          organizationId: 'org-A',
          deletedAt: null,
        },
      });
    });
  });

  describe('create', () => {
    test('should create a new agent', async () => {
      const mockAgent = { id: 'agent-new', name: 'New Agent', organizationId: 'org-123' };
      mockPrisma.agent.create.mockResolvedValue(mockAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { name: 'New Agent' };

      const result = await adminAgentsRouter.create({ ctx, input });

      expect(result).toEqual(mockAgent);
      expect(mockPrisma.agent.create).toHaveBeenCalledWith({
        data: {
          name: 'New Agent',
          organizationId: 'org-123',
          publicKeyUrl: null,
          workspaceId: null,
        },
      });
    });

    test('should log admin action on create', async () => {
      const mockAgent = { id: 'agent-new', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.create.mockResolvedValue(mockAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { name: 'Test Agent' };

      await adminAgentsRouter.create({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'AGENT_CREATE',
        resourceType: 'AGENT',
        resourceId: 'agent-new',
        resourceName: 'Test Agent',
        actionDetails: {
          name: 'Test Agent',
        },
        afterSnapshot: {
          id: 'agent-new',
          name: 'Test Agent',
          organizationId: 'org-123',
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    test('should capture IP address from x-forwarded-for header', async () => {
      const mockAgent = { id: 'agent-new', name: 'Test', organizationId: 'org-123' };
      mockPrisma.agent.create.mockResolvedValue(mockAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      ctx.req.req.header = vi.fn((name: string) => {
        if (name === 'x-forwarded-for') return '10.0.0.1';
        return null;
      });

      const input = { name: 'Test' };

      await adminAgentsRouter.create({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1',
        }),
      );
    });

    test('should handle null IP address', async () => {
      const mockAgent = { id: 'agent-new', name: 'Test', organizationId: 'org-123' };
      mockPrisma.agent.create.mockResolvedValue(mockAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      ctx.req.req.header = vi.fn(() => null);

      const input = { name: 'Test' };

      await adminAgentsRouter.create({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: null,
          userAgent: null,
        }),
      );
    });

    test('should send AGENT_CREATED webhook on create', async () => {
      const mockAgent = { id: 'agent-new', name: 'New Agent', organizationId: 'org-123' };
      mockPrisma.agent.create.mockResolvedValue(mockAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      // Add email to the user for webhook payload
      (ctx.auth.user as { id: string; email?: string }).email = 'admin@example.com';
      const input = { name: 'New Agent' };

      await adminAgentsRouter.create({ ctx, input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'AGENT_CREATED',
        {
          agentId: 'agent-new',
          agentName: 'New Agent',
          createdBy: 'admin@example.com',
        },
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should not block on webhook failure during create', async () => {
      const mockAgent = { id: 'agent-new', name: 'New Agent', organizationId: 'org-123' };
      mockPrisma.agent.create.mockResolvedValue(mockAgent);
      mockLogAdminAction.mockResolvedValue(undefined);
      // Simulate webhook failure
      mockSendWebhook.mockRejectedValue(new Error('Webhook failed'));

      const ctx = createMockContext();
      (ctx.auth.user as { id: string; email?: string }).email = 'admin@example.com';
      const input = { name: 'New Agent' };

      // Should not throw even if webhook fails
      const result = await adminAgentsRouter.create({ ctx, input });
      expect(result).toEqual(mockAgent);
    });
  });

  describe('delete', () => {
    test('should soft delete an agent', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue({ canDelete: true, blockers: [], warnings: [] });
      mockPrisma.agent.update.mockResolvedValue({ ...mockAgent, deletedAt: new Date() });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      const result = await adminAgentsRouter.delete({ ctx, input });

      expect(result.success).toBe(true);
      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: {
          deletedAt: expect.any(Date),
          deletedBy: 'user-123',
        },
      });
    });

    test('should throw NOT_FOUND when agent does not exist', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminAgentsRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminAgentsRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Agent not found',
      });
    });

    test('should throw BAD_REQUEST when deletion is blocked', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [{ type: 'ACTIVE_SESSIONS', details: 'Agent has active sessions' }],
        warnings: [],
      });

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      await expect(adminAgentsRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminAgentsRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot delete: Agent has active sessions',
      });
    });

    test('should log admin action on delete', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue({ canDelete: true, blockers: [], warnings: [] });
      mockPrisma.agent.update.mockResolvedValue({ ...mockAgent, deletedAt: new Date() });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { id: 'agent-1' };

      await adminAgentsRouter.delete({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'AGENT_DELETE',
        resourceType: 'AGENT',
        resourceId: 'agent-1',
        resourceName: 'Test Agent',
        actionDetails: {
          name: 'Test Agent',
        },
        beforeSnapshot: {
          id: 'agent-1',
          name: 'Test Agent',
          organizationId: 'org-123',
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    test('should return impact analysis in result', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      const mockImpact = { canDelete: true, blockers: [], warnings: ['Some warning'] };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue(mockImpact);
      mockPrisma.agent.update.mockResolvedValue({ ...mockAgent, deletedAt: new Date() });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      const result = await adminAgentsRouter.delete({ ctx, input });

      expect(result.impact).toEqual(mockImpact);
    });

    test('should send AGENT_DELETED webhook on delete', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue({ canDelete: true, blockers: [], warnings: [] });
      mockPrisma.agent.update.mockResolvedValue({ ...mockAgent, deletedAt: new Date() });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      // Add email to the user for webhook payload
      (ctx.auth.user as { id: string; email?: string }).email = 'admin@example.com';
      const input = { id: 'agent-1' };

      await adminAgentsRouter.delete({ ctx, input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'AGENT_DELETED',
        {
          agentId: 'agent-1',
          agentName: 'Test Agent',
          deletedBy: 'admin@example.com',
        },
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should not block on webhook failure during delete', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue({ canDelete: true, blockers: [], warnings: [] });
      mockPrisma.agent.update.mockResolvedValue({ ...mockAgent, deletedAt: new Date() });
      mockLogAdminAction.mockResolvedValue(undefined);
      // Simulate webhook failure
      mockSendWebhook.mockRejectedValue(new Error('Webhook failed'));

      const ctx = createMockContext();
      (ctx.auth.user as { id: string; email?: string }).email = 'admin@example.com';
      const input = { id: 'agent-1' };

      // Should not throw even if webhook fails
      const result = await adminAgentsRouter.delete({ ctx, input });
      expect(result.success).toBe(true);
    });

    test('should combine multiple blocker messages', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [
          { type: 'BLOCKER_1', details: 'First blocker' },
          { type: 'BLOCKER_2', details: 'Second blocker' },
        ],
        warnings: [],
      });

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      await expect(adminAgentsRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot delete: First blocker; Second blocker',
      });
    });
  });

  describe('restore', () => {
    test('should restore a soft-deleted agent', async () => {
      const deletedDate = new Date('2024-01-01');
      const mockAgent = {
        id: 'agent-1',
        name: 'Deleted Agent',
        organizationId: 'org-123',
        deletedAt: deletedDate,
        deletedBy: 'user-old',
      };
      const restoredAgent = { ...mockAgent, deletedAt: null, deletedBy: null };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockPrisma.agent.update.mockResolvedValue(restoredAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      const result = await adminAgentsRouter.restore({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });
    });

    test('should throw NOT_FOUND when agent is not deleted', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'active-agent' };

      await expect(adminAgentsRouter.restore({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminAgentsRouter.restore({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Agent not found or not deleted',
      });
    });

    test('should log admin action on restore', async () => {
      const deletedDate = new Date('2024-01-01');
      const mockAgent = {
        id: 'agent-1',
        name: 'Deleted Agent',
        organizationId: 'org-123',
        deletedAt: deletedDate,
        deletedBy: 'user-old',
      };
      const restoredAgent = { ...mockAgent, deletedAt: null, deletedBy: null };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockPrisma.agent.update.mockResolvedValue(restoredAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { id: 'agent-1' };

      await adminAgentsRouter.restore({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'AGENT_RESTORE',
        resourceType: 'AGENT',
        resourceId: 'agent-1',
        resourceName: 'Deleted Agent',
        actionDetails: {
          action: 'restore',
          name: 'Deleted Agent',
          previousDeletedAt: deletedDate.toISOString(),
          previousDeletedBy: 'user-old',
        },
        beforeSnapshot: {
          id: 'agent-1',
          name: 'Deleted Agent',
          organizationId: 'org-123',
          deletedAt: deletedDate,
          deletedBy: 'user-old',
        },
        afterSnapshot: {
          id: 'agent-1',
          name: 'Deleted Agent',
          organizationId: 'org-123',
          deletedAt: null,
          deletedBy: null,
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    test('should query with deletedAt not null', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const input = { id: 'agent-1' };

      try {
        await adminAgentsRouter.restore({ ctx, input });
      } catch {
        // Expected to throw
      }

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'agent-1',
          organizationId: 'custom-org',
          deletedAt: { not: null },
        },
      });
    });
  });

  describe('getDeletionImpact', () => {
    test('should return deletion impact for agent', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      const mockImpact = {
        canDelete: true,
        blockers: [],
        warnings: ['This will affect 5 scheduled tasks'],
      };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue(mockImpact);

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      const result = await adminAgentsRouter.getDeletionImpact({ ctx, input });

      expect(result).toEqual(mockImpact);
      expect(mockAnalyzeAgentDeletion).toHaveBeenCalledWith('org-123', 'agent-1');
    });

    test('should throw NOT_FOUND when agent does not exist', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminAgentsRouter.getDeletionImpact({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminAgentsRouter.getDeletionImpact({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Agent not found',
      });
    });

    test('should enforce organization isolation', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'agent-from-org-B' };

      await expect(adminAgentsRouter.getDeletionImpact({ ctx, input })).rejects.toThrow(TRPCError);

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'agent-from-org-B',
          organizationId: 'org-A',
          deletedAt: null,
        },
      });
    });

    test('should return impact with blockers', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      const mockImpact = {
        canDelete: false,
        blockers: [{ type: 'CRITICAL', details: 'Cannot delete this agent' }],
        warnings: [],
      };
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
      mockAnalyzeAgentDeletion.mockResolvedValue(mockImpact);

      const ctx = createMockContext();
      const input = { id: 'agent-1' };

      const result = await adminAgentsRouter.getDeletionImpact({ ctx, input });

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toHaveLength(1);
    });
  });

  describe('organization isolation', () => {
    test('list should only return agents from current organization', async () => {
      mockPrisma.agent.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'isolated-org' });
      const input = {};

      await adminAgentsRouter.list({ ctx, input });

      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });

    test('create should assign to current organization', async () => {
      const mockAgent = { id: 'agent-new', name: 'Test', organizationId: 'org-A' };
      mockPrisma.agent.create.mockResolvedValue(mockAgent);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { name: 'Test' };

      await adminAgentsRouter.create({ ctx, input });

      expect(mockPrisma.agent.create).toHaveBeenCalledWith({
        data: {
          name: 'Test',
          organizationId: 'org-A',
          publicKeyUrl: null,
          workspaceId: null,
        },
      });
    });

    test('delete should verify organization ownership', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'agent-from-org-B' };

      await expect(adminAgentsRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('restore should verify organization ownership', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'agent-from-org-B' };

      await expect(adminAgentsRouter.restore({ ctx, input })).rejects.toThrow(TRPCError);
    });
  });
});
