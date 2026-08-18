/**
 * Tests for Admin Roles Router
 * Tests role management operations
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogAdminAction, mockAnalyzeRoleDeletion } = vi.hoisted(() => ({
  mockPrisma: {
    role: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockLogAdminAction: vi.fn(),
  mockAnalyzeRoleDeletion: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminActionType: {
    ROLE_CREATE: 'ROLE_CREATE',
    ROLE_UPDATE: 'ROLE_UPDATE',
    ROLE_DELETE: 'ROLE_DELETE',
    ROLE_RESTORE: 'ROLE_RESTORE',
  },
  AdminResourceType: {
    ROLE: 'ROLE',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/deletionImpact.js', () => ({
  analyzeRoleDeletion: mockAnalyzeRoleDeletion,
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

import { adminRolesRouter as _adminRolesRouter } from '../../../../../packages/api/src/trpc/admin/roles.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
// Using Record<string, unknown> allows accessing any property on the result
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

const adminRolesRouter = _adminRolesRouter as unknown as {
  create: TestableHandler;
  delete: TestableHandler;
  get: TestableHandler;
  getDeletionImpact: TestableHandler;
  list: TestableHandler;
  restore: TestableHandler;
  update: TestableHandler;
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
): {
  auth: { organizationId: string; user: { id: string } };
  req: { req: { header: ReturnType<typeof vi.fn> } };
} {
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

describe('adminRolesRouter', () => {
  describe('list', () => {
    test('should list all active roles', async () => {
      const mockRoles = [
        { id: 'role-1', name: 'Admin', isAdmin: true, deletedAt: null },
        { id: 'role-2', name: 'User', isAdmin: false, deletedAt: null },
      ];
      mockPrisma.role.findMany.mockResolvedValue(mockRoles);

      const ctx = createMockContext();
      const input = {};

      const result = await adminRolesRouter.list({ ctx, input });

      expect(result).toEqual(mockRoles);
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        orderBy: [{ isAdmin: 'desc' }, { name: 'asc' }],
      });
    });

    test('should include deleted roles when includeDeleted is true', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = { includeDeleted: true };

      await adminRolesRouter.list({ ctx, input });

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
        },
        orderBy: [{ isAdmin: 'desc' }, { name: 'asc' }],
      });
    });

    test('should exclude deleted roles by default', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = { includeDeleted: false };

      await adminRolesRouter.list({ ctx, input });

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        orderBy: expect.any(Array),
      });
    });

    test('should handle undefined input', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = undefined;

      await adminRolesRouter.list({ ctx, input });

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        orderBy: expect.any(Array),
      });
    });
  });

  describe('get', () => {
    test('should get role by id', async () => {
      const mockRole = { id: 'role-1', name: 'Admin', isAdmin: true, organizationId: 'org-123' };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);

      const ctx = createMockContext();
      const input = { id: 'role-1' };

      const result = await adminRolesRouter.get({ ctx, input });

      expect(result).toEqual(mockRole);
      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'role-1',
          organizationId: 'org-123',
        },
      });
    });

    test('should throw NOT_FOUND when role does not exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminRolesRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.get({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Role not found',
      });
    });
  });

  describe('create', () => {
    test('should create a new role', async () => {
      const mockRole = {
        id: 'role-new',
        name: 'Developer',
        isAdmin: false,
        organizationId: 'org-123',
      };
      mockPrisma.role.findFirst.mockResolvedValue(null); // No existing role
      mockPrisma.role.create.mockResolvedValue(mockRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { name: 'Developer' };

      const result = await adminRolesRouter.create({ ctx, input });

      expect(result).toEqual(mockRole);
      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: {
          name: 'Developer',
          description: undefined,
          isAdmin: false,
          organizationId: 'org-123',
        },
      });
    });

    test('should auto-detect admin role by name (case-insensitive)', async () => {
      const mockRole = {
        id: 'role-admin',
        name: 'Admin',
        isAdmin: true,
        organizationId: 'org-123',
      };
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(mockRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { name: 'Admin' };

      await adminRolesRouter.create({ ctx, input });

      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isAdmin: true,
        }),
      });
    });

    test('should auto-detect admin role (lowercase)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue({ id: 'role-1', name: 'admin', isAdmin: true });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { name: 'admin' };

      await adminRolesRouter.create({ ctx, input });

      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isAdmin: true,
        }),
      });
    });

    test('should throw CONFLICT when role name already exists', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'existing', name: 'Developer' });

      const ctx = createMockContext();
      const input = { name: 'Developer' };

      await expect(adminRolesRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Role with this name already exists',
      });
    });

    test('should log admin action on create', async () => {
      const mockRole = {
        id: 'role-new',
        name: 'Editor',
        description: 'Can edit',
        isAdmin: false,
        organizationId: 'org-123',
      };
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(mockRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { name: 'Editor', description: 'Can edit' };

      await adminRolesRouter.create({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'ROLE_CREATE',
        resourceType: 'ROLE',
        resourceId: 'role-new',
        resourceName: 'Editor',
        actionDetails: {
          name: 'Editor',
          description: 'Can edit',
          isAdmin: false,
        },
        afterSnapshot: {
          id: 'role-new',
          name: 'Editor',
          description: 'Can edit',
          isAdmin: false,
          organizationId: 'org-123',
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });
  });

  describe('update', () => {
    test('should update a role', async () => {
      const mockRole = {
        id: 'role-1',
        name: 'Old Name',
        description: 'Old desc',
        isAdmin: false,
        organizationId: 'org-123',
      };
      const updatedRole = { ...mockRole, name: 'New Name', description: 'New desc' };
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(mockRole) // First call: verify role exists
        .mockResolvedValueOnce(null); // Second call: check name conflict
      mockPrisma.role.update.mockResolvedValue(updatedRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'role-1', name: 'New Name', description: 'New desc' };

      const result = await adminRolesRouter.update({ ctx, input });

      expect(result).toEqual(updatedRole);
      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: {
          name: 'New Name',
          description: 'New desc',
          isAdmin: false,
        },
      });
    });

    test('should throw NOT_FOUND when role does not exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent', name: 'New Name' };

      await expect(adminRolesRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Role not found',
      });
    });

    test('should throw CONFLICT when new name already exists', async () => {
      const mockRole = {
        id: 'role-1',
        name: 'Old Name',
        isAdmin: false,
        organizationId: 'org-123',
      };
      mockPrisma.role.findFirst.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          // First call: verify role exists (has id in where clause)
          if (where.id === 'role-1' && !where.name) {
            return Promise.resolve(mockRole);
          }
          // Second call: check name conflict (has name in where clause)
          if (where.name === 'Existing Name') {
            return Promise.resolve({ id: 'role-other', name: 'Existing Name' });
          }
          return Promise.resolve(null);
        },
      );

      const ctx = createMockContext();
      const input = { id: 'role-1', name: 'Existing Name' };

      await expect(adminRolesRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Role with this name already exists',
      });
    });

    test('should auto-update isAdmin when name changes to Admin', async () => {
      const mockRole = { id: 'role-1', name: 'Regular', isAdmin: false, organizationId: 'org-123' };
      mockPrisma.role.findFirst.mockResolvedValueOnce(mockRole).mockResolvedValueOnce(null);
      mockPrisma.role.update.mockResolvedValue({ ...mockRole, name: 'Admin', isAdmin: true });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'role-1', name: 'Admin' };

      await adminRolesRouter.update({ ctx, input });

      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: expect.objectContaining({
          isAdmin: true,
        }),
      });
    });

    test('should keep isAdmin when name is not changed', async () => {
      const mockRole = { id: 'role-1', name: 'Admin', isAdmin: true, organizationId: 'org-123' };
      mockPrisma.role.findFirst.mockResolvedValueOnce(mockRole);
      mockPrisma.role.update.mockResolvedValue({ ...mockRole, description: 'Updated' });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'role-1', description: 'Updated' };

      await adminRolesRouter.update({ ctx, input });

      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: expect.objectContaining({
          isAdmin: true, // Should keep the existing isAdmin value
        }),
      });
    });

    test('should log admin action on update', async () => {
      const mockRole = {
        id: 'role-1',
        name: 'Old',
        description: null,
        isAdmin: false,
        organizationId: 'org-123',
      };
      const updatedRole = { ...mockRole, name: 'New', description: 'Desc' };
      mockPrisma.role.findFirst.mockResolvedValueOnce(mockRole).mockResolvedValueOnce(null);
      mockPrisma.role.update.mockResolvedValue(updatedRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { id: 'role-1', name: 'New', description: 'Desc' };

      await adminRolesRouter.update({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'ROLE_UPDATE',
          actionDetails: expect.objectContaining({
            previousName: 'Old',
            newName: 'New',
          }),
          beforeSnapshot: expect.objectContaining({
            name: 'Old',
          }),
          afterSnapshot: expect.objectContaining({
            name: 'New',
          }),
        }),
      );
    });
  });

  describe('delete', () => {
    test('should soft delete a role', async () => {
      const mockRole = {
        id: 'role-1',
        name: 'Test Role',
        isAdmin: false,
        organizationId: 'org-123',
      };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockAnalyzeRoleDeletion.mockResolvedValue({ canDelete: true, blockers: [], warnings: [] });
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockResolvedValue([]);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'role-1' };

      const result = await adminRolesRouter.delete({ ctx, input });

      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    test('should throw NOT_FOUND when role does not exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminRolesRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Role not found',
      });
    });

    test('should throw BAD_REQUEST when deletion is blocked', async () => {
      const mockRole = { id: 'role-1', name: 'Test Role', organizationId: 'org-123' };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockAnalyzeRoleDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [{ type: 'HAS_USERS', details: 'Role has assigned users' }],
        warnings: [],
      });

      const ctx = createMockContext();
      const input = { id: 'role-1' };

      await expect(adminRolesRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot delete: Role has assigned users',
      });
    });

    test('should return impact analysis in result', async () => {
      const mockRole = { id: 'role-1', name: 'Test', organizationId: 'org-123' };
      const mockImpact = { canDelete: true, blockers: [], warnings: ['Will affect 5 users'] };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockAnalyzeRoleDeletion.mockResolvedValue(mockImpact);
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockResolvedValue([]);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'role-1' };

      const result = await adminRolesRouter.delete({ ctx, input });

      expect(result.impact).toEqual(mockImpact);
    });

    test('should log admin action on delete', async () => {
      const mockRole = {
        id: 'role-1',
        name: 'Test',
        description: 'Desc',
        isAdmin: false,
        organizationId: 'org-123',
      };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockAnalyzeRoleDeletion.mockResolvedValue({ canDelete: true, blockers: [], warnings: [] });
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockResolvedValue([]);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { id: 'role-1' };

      await adminRolesRouter.delete({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'ROLE_DELETE',
        resourceType: 'ROLE',
        resourceId: 'role-1',
        resourceName: 'Test',
        actionDetails: {
          name: 'Test',
          isAdmin: false,
          usersRemovedFromRole: 0,
          removedUserEmails: [],
        },
        beforeSnapshot: {
          id: 'role-1',
          name: 'Test',
          description: 'Desc',
          isAdmin: false,
          organizationId: 'org-123',
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });
  });

  describe('restore', () => {
    test('should restore a soft-deleted role', async () => {
      const deletedDate = new Date('2024-01-01');
      const mockRole = {
        id: 'role-1',
        name: 'Deleted Role',
        description: 'Desc',
        isAdmin: false,
        organizationId: 'org-123',
        deletedAt: deletedDate,
        deletedBy: 'user-old',
      };
      const restoredRole = { ...mockRole, deletedAt: null, deletedBy: null };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue(restoredRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'role-1' };

      const result = await adminRolesRouter.restore({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });
    });

    test('should throw NOT_FOUND when role is not deleted', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'active-role' };

      await expect(adminRolesRouter.restore({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.restore({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Role not found or not deleted',
      });
    });

    test('should log admin action on restore', async () => {
      const deletedDate = new Date('2024-01-01');
      const mockRole = {
        id: 'role-1',
        name: 'Deleted Role',
        description: 'Desc',
        isAdmin: false,
        organizationId: 'org-123',
        deletedAt: deletedDate,
        deletedBy: 'user-old',
      };
      const restoredRole = { ...mockRole, deletedAt: null, deletedBy: null };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue(restoredRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { id: 'role-1' };

      await adminRolesRouter.restore({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'ROLE_RESTORE',
        resourceType: 'ROLE',
        resourceId: 'role-1',
        resourceName: 'Deleted Role',
        actionDetails: {
          action: 'restore',
          name: 'Deleted Role',
          previousDeletedAt: deletedDate.toISOString(),
          previousDeletedBy: 'user-old',
        },
        beforeSnapshot: {
          id: 'role-1',
          name: 'Deleted Role',
          description: 'Desc',
          isAdmin: false,
          organizationId: 'org-123',
          deletedAt: deletedDate,
          deletedBy: 'user-old',
        },
        afterSnapshot: {
          id: 'role-1',
          name: 'Deleted Role',
          description: 'Desc',
          isAdmin: false,
          organizationId: 'org-123',
          deletedAt: null,
          deletedBy: null,
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    test('should query with deletedAt not null', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const input = { id: 'role-1' };

      try {
        await adminRolesRouter.restore({ ctx, input });
      } catch {
        // Expected to throw
      }

      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'role-1',
          organizationId: 'custom-org',
          deletedAt: { not: null },
        },
      });
    });
  });

  describe('getDeletionImpact', () => {
    test('should return deletion impact for role', async () => {
      const mockRole = { id: 'role-1', name: 'Test Role', organizationId: 'org-123' };
      const mockImpact = {
        canDelete: true,
        blockers: [],
        warnings: ['This will affect 10 users'],
      };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockAnalyzeRoleDeletion.mockResolvedValue(mockImpact);

      const ctx = createMockContext();
      const input = { id: 'role-1' };

      const result = await adminRolesRouter.getDeletionImpact({ ctx, input });

      expect(result).toEqual(mockImpact);
      expect(mockAnalyzeRoleDeletion).toHaveBeenCalledWith('org-123', 'role-1');
    });

    test('should throw NOT_FOUND when role does not exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminRolesRouter.getDeletionImpact({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminRolesRouter.getDeletionImpact({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Role not found',
      });
    });

    test('should enforce organization isolation', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'role-from-org-B' };

      await expect(adminRolesRouter.getDeletionImpact({ ctx, input })).rejects.toThrow(TRPCError);

      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'role-from-org-B',
          organizationId: 'org-A',
        },
      });
    });

    test('should return impact with blockers', async () => {
      const mockRole = { id: 'role-1', name: 'Admin', organizationId: 'org-123' };
      const mockImpact = {
        canDelete: false,
        blockers: [{ type: 'IS_ADMIN', details: 'Cannot delete admin role' }],
        warnings: [],
      };
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockAnalyzeRoleDeletion.mockResolvedValue(mockImpact);

      const ctx = createMockContext();
      const input = { id: 'role-1' };

      const result = await adminRolesRouter.getDeletionImpact({ ctx, input });

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toHaveLength(1);
    });
  });

  describe('organization isolation', () => {
    test('list should only return roles from current organization', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'isolated-org' });
      const input = {};

      await adminRolesRouter.list({ ctx, input });

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });

    test('create should assign to current organization', async () => {
      const mockRole = { id: 'role-new', name: 'Test', isAdmin: false, organizationId: 'org-A' };
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(mockRole);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { name: 'Test' };

      await adminRolesRouter.create({ ctx, input });

      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-A',
        }),
      });
    });

    test('get should enforce organization boundary', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'role-from-org-B' };

      await expect(adminRolesRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('update should verify organization ownership', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'role-from-org-B', name: 'New Name' };

      await expect(adminRolesRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('delete should verify organization ownership', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'role-from-org-B' };

      await expect(adminRolesRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
    });
  });
});
