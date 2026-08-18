/**
 * Tests for Admin Deleted Items Router
 * Tests listing deleted items across all entity types
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
    },
    mcpServer: {
      findMany: vi.fn(),
    },
    policy: {
      findMany: vi.fn(),
    },
  },
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
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

import { adminDeletedItemsRouter as _adminDeletedItemsRouter } from '../../../../../packages/api/src/trpc/admin/deletedItems.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
type TestableHandler<T = unknown> = (opts: { ctx: unknown; input?: unknown }) => Promise<T>;

// Type for deleted items list result
interface DeletedItem {
  id: string;
  type: string;
  name: string;
  deletedAt: Date;
  deletedBy: string | null;
  deletedByEmail: string | null;
}

const adminDeletedItemsRouter = _adminDeletedItemsRouter as unknown as {
  list: TestableHandler<DeletedItem[]>;
};

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
): { auth: { organizationId: string; userId: string } } {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      userId: overrides.userId ?? 'user-123',
    },
  };
}

describe('adminDeletedItemsRouter', () => {
  describe('list', () => {
    const deletedAt = new Date('2024-01-15T10:00:00Z');
    const deletedBy = 'admin-user-1';

    test('should return empty list when no deleted items exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toEqual([]);
    });

    test('should return deleted users', async () => {
      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'user-1', email: 'deleted@example.com', deletedAt, deletedBy },
        ])
        .mockResolvedValueOnce([{ id: deletedBy, email: 'admin@example.com' }]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'user',
        id: 'user-1',
        name: 'deleted@example.com',
        deletedAt,
        deletedBy,
        deletedByEmail: 'admin@example.com',
      });
    });

    test('should return deleted roles', async () => {
      mockPrisma.user.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: deletedBy, email: 'admin@example.com' }]);
      mockPrisma.role.findMany.mockResolvedValue([
        { id: 'role-1', name: 'Deleted Role', deletedAt, deletedBy },
      ]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'role',
        id: 'role-1',
        name: 'Deleted Role',
      });
    });

    test('should return deleted agents', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'Deleted Agent', deletedAt, deletedBy: null },
      ]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'agent',
        id: 'agent-1',
        name: 'Deleted Agent',
        deletedBy: null,
        deletedByEmail: null,
      });
    });

    test('should return deleted MCP servers', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        { id: 'server-1', name: 'Deleted Server', deletedAt, deletedBy: null },
      ]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'mcpServer',
        id: 'server-1',
        name: 'Deleted Server',
      });
    });

    test('should return deleted policies with description as name', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'policy-1',
          slug: 'allow-all',
          description: 'Allow All Policy',
          deletedAt,
          deletedBy: null,
        },
      ]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'policy',
        id: 'policy-1',
        name: 'Allow All Policy',
      });
    });

    test('should use slug as name when description is empty', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([
        { id: 'policy-1', slug: 'allow-all', description: '', deletedAt, deletedBy: null },
      ]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result[0].name).toBe('allow-all');
    });

    test('should use slug as name when description is null', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([
        { id: 'policy-1', slug: 'deny-all', description: null, deletedAt, deletedBy: null },
      ]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result[0].name).toBe('deny-all');
    });

    test('should return items from all entity types combined', async () => {
      const earlier = new Date('2024-01-14T10:00:00Z');
      const later = new Date('2024-01-16T10:00:00Z');

      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'user-1', email: 'user@test.com', deletedAt, deletedBy: null },
        ])
        .mockResolvedValueOnce([]); // No deletedBy users to lookup
      mockPrisma.role.findMany.mockResolvedValue([
        { id: 'role-1', name: 'Role', deletedAt: earlier, deletedBy: null },
      ]);
      mockPrisma.agent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'Agent', deletedAt: later, deletedBy: null },
      ]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        { id: 'server-1', name: 'Server', deletedAt, deletedBy: null },
      ]);
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          id: 'policy-1',
          slug: 'policy',
          description: 'Policy',
          deletedAt: earlier,
          deletedBy: null,
        },
      ]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(5);
      // Should be sorted by deletedAt descending (newest first)
      expect(result[0].type).toBe('agent'); // latest
      expect(result[result.length - 1].deletedAt).toEqual(earlier); // earliest
    });

    test('should sort by deletedAt descending', async () => {
      const date1 = new Date('2024-01-10T10:00:00Z');
      const date2 = new Date('2024-01-15T10:00:00Z');
      const date3 = new Date('2024-01-20T10:00:00Z');

      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'user-1', email: 'first@test.com', deletedAt: date1, deletedBy: null },
          { id: 'user-2', email: 'last@test.com', deletedAt: date3, deletedBy: null },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([
        { id: 'role-1', name: 'Role', deletedAt: date2, deletedBy: null },
      ]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('user-2'); // date3 (newest)
      expect(result[1].id).toBe('role-1'); // date2
      expect(result[2].id).toBe('user-1'); // date1 (oldest)
    });

    test('should resolve deletedBy email from user lookup', async () => {
      const admin1 = 'admin-1';
      const admin2 = 'admin-2';

      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'user-1', email: 'user1@test.com', deletedAt, deletedBy: admin1 },
        ])
        .mockResolvedValueOnce([
          { id: admin1, email: 'admin1@test.com' },
          { id: admin2, email: 'admin2@test.com' },
        ]);
      mockPrisma.role.findMany.mockResolvedValue([
        { id: 'role-1', name: 'Role', deletedAt, deletedBy: admin2 },
      ]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(2);
      const user = result.find((r) => r.type === 'user');
      const role = result.find((r) => r.type === 'role');

      expect(user?.deletedByEmail).toBe('admin1@test.com');
      expect(role?.deletedByEmail).toBe('admin2@test.com');
    });

    test('should handle deletedBy user not found', async () => {
      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'user-1', email: 'user@test.com', deletedAt, deletedBy: 'unknown-admin' },
        ])
        .mockResolvedValueOnce([]); // Admin user not found
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].deletedBy).toBe('unknown-admin');
      expect(result[0].deletedByEmail).toBeNull();
    });

    test('should query with correct organization filter', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'custom-org' });
      await adminDeletedItemsRouter.list({ ctx });

      // Check that all queries use the organization ID
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'custom-org',
          }),
        }),
      );
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'custom-org',
          }),
        }),
      );
      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'custom-org',
          }),
        }),
      );
      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'custom-org',
          }),
        }),
      );
      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'custom-org',
          }),
        }),
      );
    });

    test('should filter only soft-deleted items (deletedAt not null)', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      await adminDeletedItemsRouter.list({ ctx });

      // Check that all queries filter by deletedAt not null
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: { not: null },
          }),
        }),
      );
    });

    test('should handle multiple items with same deletedBy user', async () => {
      const admin = 'admin-user';

      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'user-1', email: 'user1@test.com', deletedAt, deletedBy: admin },
          { id: 'user-2', email: 'user2@test.com', deletedAt, deletedBy: admin },
          { id: 'user-3', email: 'user3@test.com', deletedAt, deletedBy: admin },
        ])
        .mockResolvedValueOnce([{ id: admin, email: 'admin@test.com' }]);
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.agent.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await adminDeletedItemsRouter.list({ ctx });

      expect(result).toHaveLength(3);
      // All should have same deletedByEmail
      result.forEach((item) => {
        expect(item.deletedByEmail).toBe('admin@test.com');
      });
    });

    test('should handle concurrent database queries', async () => {
      // Verify Promise.all is used by checking all queries are made
      let queryCounts = 0;

      mockPrisma.user.findMany.mockImplementation(() => {
        queryCounts++;
        return Promise.resolve([]);
      });
      mockPrisma.role.findMany.mockImplementation(() => {
        queryCounts++;
        return Promise.resolve([]);
      });
      mockPrisma.agent.findMany.mockImplementation(() => {
        queryCounts++;
        return Promise.resolve([]);
      });
      mockPrisma.mcpServer.findMany.mockImplementation(() => {
        queryCounts++;
        return Promise.resolve([]);
      });
      mockPrisma.policy.findMany.mockImplementation(() => {
        queryCounts++;
        return Promise.resolve([]);
      });

      const ctx = createMockContext();
      await adminDeletedItemsRouter.list({ ctx });

      // 5 entity queries + 1 user email lookup query
      expect(queryCounts).toBe(6);
    });
  });
});
