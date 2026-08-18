/**
 * Tests for Admin Users Router
 * Tests user management operations
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogAdminAction, mockAnalyzeUserDeletion } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
    userRole: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockLogAdminAction: vi.fn(),
  mockAnalyzeUserDeletion: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminActionType: {
    USER_CREATE: 'USER_CREATE',
    USER_ROLES_UPDATE: 'USER_ROLES_UPDATE',
    USER_TOKEN_REFRESH: 'USER_TOKEN_REFRESH',
    USER_TOKEN_REVOKE: 'USER_TOKEN_REVOKE',
    USER_DELETE: 'USER_DELETE',
    USER_RESTORE: 'USER_RESTORE',
  },
  AdminResourceType: {
    USER: 'USER',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/deletionImpact.js', () => ({
  analyzeUserDeletion: mockAnalyzeUserDeletion,
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

import { adminUsersRouter as _adminUsersRouter } from '../../../../../packages/api/src/trpc/admin/users.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

// Type aliases for list operations
type ListHandler = TestableHandler<Record<string, unknown>[]>;

const adminUsersRouter = _adminUsersRouter as unknown as {
  create: TestableHandler;
  delete: TestableHandler;
  get: TestableHandler;
  getDeletionImpact: TestableHandler;
  list: ListHandler;
  refreshToken: TestableHandler<{ accessToken: string; [key: string]: unknown }>;
  restore: TestableHandler;
  revokeToken: TestableHandler;
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
      user: { id: overrides.userId ?? 'admin-123' },
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

describe('adminUsersRouter', () => {
  describe('list', () => {
    test('should list all active users', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'user1@test.com', accessToken: 'token-1', userRoles: [] },
        { id: 'user-2', email: 'user2@test.com', accessToken: 'token-2', userRoles: [] },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const ctx = createMockContext();
      const input = {};

      const result = await adminUsersRouter.list({ ctx, input });

      expect(result).toHaveLength(2);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    test('should include isTokenRevoked computed field for active tokens', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'user1@test.com', accessToken: 'normal-token', userRoles: [] },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const ctx = createMockContext();
      const input = {};

      const result = await adminUsersRouter.list({ ctx, input });

      expect(result[0].isTokenRevoked).toBe(false);
    });

    test('should return isTokenRevoked=true for revoked tokens', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'user1@test.com', accessToken: 'revoked_abc123', userRoles: [] },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const ctx = createMockContext();
      const input = {};

      const result = await adminUsersRouter.list({ ctx, input });

      expect(result[0].isTokenRevoked).toBe(true);
    });

    test('should correctly identify mixed revoked and active tokens', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'active@test.com', accessToken: 'normal-token', userRoles: [] },
        { id: 'user-2', email: 'revoked@test.com', accessToken: 'revoked_xyz789', userRoles: [] },
        {
          id: 'user-3',
          email: 'also-active@test.com',
          accessToken: 'another-token',
          userRoles: [],
        },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const ctx = createMockContext();
      const input = {};

      const result = await adminUsersRouter.list({ ctx, input });

      expect(result[0].isTokenRevoked).toBe(false);
      expect(result[1].isTokenRevoked).toBe(true);
      expect(result[2].isTokenRevoked).toBe(false);
    });

    test('should include deleted users when includeDeleted is true', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = { includeDeleted: true };

      await adminUsersRouter.list({ ctx, input });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
        },
        include: expect.any(Object),
        orderBy: expect.any(Object),
      });
    });

    test('should include lastActivityAt field in response', async () => {
      const lastActivity = new Date('2026-01-05T10:30:00Z');
      const mockUsers = [
        {
          id: 'user-1',
          email: 'active@test.com',
          accessToken: 'token-1',
          lastActivityAt: lastActivity,
          userRoles: [],
        },
        {
          id: 'user-2',
          email: 'inactive@test.com',
          accessToken: 'token-2',
          lastActivityAt: null,
          userRoles: [],
        },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const ctx = createMockContext();
      const input = {};

      const result = await adminUsersRouter.list({ ctx, input });

      expect(result[0].lastActivityAt).toEqual(lastActivity);
      expect(result[1].lastActivityAt).toBeNull();
    });
  });

  describe('get', () => {
    test('should get user by id', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', userRoles: [] };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      const result = await adminUsersRouter.get({ ctx, input });

      expect(result).toEqual(mockUser);
    });

    test('should throw NOT_FOUND when user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminUsersRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.get({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });
  });

  describe('create', () => {
    test('should create a new user', async () => {
      const mockRoles = [{ id: 'role-1', name: 'Developer', isAdmin: false }];
      const mockUser = {
        id: 'user-new',
        email: 'new@test.com',
        organizationId: 'org-123',
        userRoles: [{ role: mockRoles[0], roleId: 'role-1' }],
      };
      mockPrisma.role.findMany.mockResolvedValue(mockRoles);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.user.count.mockResolvedValue(0); // For seat limit check
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { email: 'new@test.com', roleIds: ['role-1'] };

      const result = await adminUsersRouter.create({ ctx, input });

      expect(result).toEqual(mockUser);
    });

    test('should throw BAD_REQUEST when role not found', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0); // For seat limit check

      const ctx = createMockContext();
      const input = { email: 'new@test.com', roleIds: ['nonexistent'] };

      await expect(adminUsersRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'One or more roles not found or do not belong to this organization',
      });
    });

    test('should throw BAD_REQUEST when admin role with other roles', async () => {
      const mockRoles = [
        { id: 'role-admin', name: 'Admin', isAdmin: true },
        { id: 'role-dev', name: 'Developer', isAdmin: false },
      ];
      mockPrisma.role.findMany.mockResolvedValue(mockRoles);
      mockPrisma.user.count.mockResolvedValue(0); // For seat limit check

      const ctx = createMockContext();
      const input = { email: 'new@test.com', roleIds: ['role-admin', 'role-dev'] };

      await expect(adminUsersRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Admin roles are exclusive - users with admin role cannot have other roles',
      });
    });
  });

  describe('update', () => {
    test('should update user roles', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        userRoles: [
          { role: { id: 'role-old', name: 'Old Role', isAdmin: false }, roleId: 'role-old' },
        ],
      };
      const newRoles = [{ id: 'role-new', name: 'New Role', isAdmin: false }];
      const updatedUser = {
        ...mockUser,
        userRoles: [{ role: newRoles[0], roleId: 'role-new' }],
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findMany.mockResolvedValue(newRoles);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.user.findUnique.mockResolvedValue(updatedUser);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1', roleIds: ['role-new'] };

      const result = await adminUsersRouter.update({ ctx, input });

      expect(result).toEqual(updatedUser);
    });

    test('should throw NOT_FOUND when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent', roleIds: ['role-1'] };

      await expect(adminUsersRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    test('should throw FORBIDDEN when removing own admin role', async () => {
      const mockUser = {
        id: 'admin-123', // Same as ctx user
        email: 'admin@test.com',
        userRoles: [
          { role: { id: 'role-admin', name: 'Admin', isAdmin: true }, roleId: 'role-admin' },
        ],
      };
      const newRoles = [{ id: 'role-dev', name: 'Developer', isAdmin: false }];

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findMany.mockResolvedValue(newRoles);

      const ctx = createMockContext({ userId: 'admin-123' });
      const input = { id: 'admin-123', roleIds: ['role-dev'] };

      await expect(adminUsersRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'You cannot remove your own admin role',
      });
    });

    test('should throw BAD_REQUEST when admin role with other roles', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        userRoles: [],
      };
      const newRoles = [
        { id: 'role-admin', name: 'Admin', isAdmin: true },
        { id: 'role-dev', name: 'Developer', isAdmin: false },
      ];

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findMany.mockResolvedValue(newRoles);

      const ctx = createMockContext();
      const input = { id: 'user-1', roleIds: ['role-admin', 'role-dev'] };

      await expect(adminUsersRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Admin roles are exclusive - users with admin role cannot have other roles',
      });
    });
  });

  describe('refreshToken', () => {
    test('should refresh user token', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', accessToken: 'old-token' };
      const updatedUser = { ...mockUser, accessToken: 'new-token-123' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      const result = await adminUsersRouter.refreshToken({ ctx, input });

      expect(result.accessToken).toBe('new-token-123');
    });

    test('should throw NOT_FOUND when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminUsersRouter.refreshToken({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.refreshToken({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    test('should generate a new token string when refreshing', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', accessToken: 'old-token' };
      const updatedUser = { ...mockUser, accessToken: 'new-generated-token' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      await adminUsersRouter.refreshToken({ ctx, input });

      // Verify that a NEW token string is passed to update (not undefined)
      const updateCall = mockPrisma.user.update.mock.calls[0][0];

      expect(updateCall.data.accessToken).toBeDefined();
      expect(typeof updateCall.data.accessToken).toBe('string');
      expect(updateCall.data.accessToken.length).toBeGreaterThan(0);

      // Token should be a base64url string (generated by randomBytes(24).toString('base64url'))
      expect(updateCall.data.accessToken).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('should replace revoked token with fresh token', async () => {
      const revokedToken = 'revoked_abc123def456';
      const mockUser = { id: 'user-1', email: 'test@test.com', accessToken: revokedToken };
      const updatedUser = { ...mockUser, accessToken: 'fresh-new-token' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      const result = await adminUsersRouter.refreshToken({ ctx, input });

      // After refresh, the token should NOT start with 'revoked_'
      expect(result.accessToken).not.toMatch(/^revoked_/);
      expect(result.accessToken).toBe('fresh-new-token');
    });

    test('should log admin action on token refresh', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', accessToken: 'old-token' };
      const updatedUser = { ...mockUser, accessToken: 'new-token' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { id: 'user-1' };

      await adminUsersRouter.refreshToken({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'USER_TOKEN_REFRESH',
          resourceType: 'USER',
          resourceId: 'user-1',
          resourceName: 'test@test.com',
          adminUserId: 'admin-456',
          actionDetails: expect.objectContaining({
            email: 'test@test.com',
          }),
        }),
      );
    });

    test('should not refresh token for user from another organization', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null); // User not found in org

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'user-from-org-B' };

      await expect(adminUsersRouter.refreshToken({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });
  });

  describe('revokeToken', () => {
    test('should revoke user token successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', accessToken: 'old-token' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, accessToken: 'revoked_xyz' });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      const result = await adminUsersRouter.revokeToken({ ctx, input });

      expect(result.success).toBe(true);
    });

    test('should set token to revoked_ prefix format', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', accessToken: 'old-token' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, accessToken: 'revoked_abc' });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      await adminUsersRouter.revokeToken({ ctx, input });

      // Verify update was called with a revoked_ prefixed token
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          accessToken: expect.stringMatching(/^revoked_[a-f0-9]{64}$/),
        },
      });
    });

    test('should throw FORBIDDEN when revoking own token', async () => {
      const ctx = createMockContext({ userId: 'admin-123' });
      const input = { id: 'admin-123' };

      await expect(adminUsersRouter.revokeToken({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.revokeToken({ ctx, input })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'You cannot revoke your own access token',
      });
    });

    test('should throw NOT_FOUND when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminUsersRouter.revokeToken({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.revokeToken({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    test('should not revoke token for user from another organization', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null); // User not found in org

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'user-from-org-B' };

      await expect(adminUsersRouter.revokeToken({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    test('should log admin action on token revocation', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', accessToken: 'old-token' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, accessToken: 'revoked_xyz' });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456', organizationId: 'org-789' });
      const input = { id: 'user-1' };

      await adminUsersRouter.revokeToken({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-789',
          adminUserId: 'admin-456',
          actionType: 'USER_TOKEN_REVOKE',
          resourceType: 'USER',
          resourceId: 'user-1',
          resourceName: 'test@test.com',
          actionDetails: expect.objectContaining({
            email: 'test@test.com',
          }),
        }),
      );
    });

    test('should check for self-revocation before checking if user exists', async () => {
      // This ensures the FORBIDDEN check happens first, even if user doesn't exist
      const ctx = createMockContext({ userId: 'admin-123' });
      const input = { id: 'admin-123' };

      // Should throw FORBIDDEN, NOT "User not found"
      await expect(adminUsersRouter.revokeToken({ ctx, input })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      // Prisma should NOT have been called at all
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    test('should soft delete a user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        organizationId: 'org-123',
        userRoles: [{ role: { id: 'role-1', name: 'Role', isAdmin: false } }],
      };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockAnalyzeUserDeletion.mockResolvedValue({ canDelete: true, blockers: [], warnings: [] });
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, deletedAt: new Date() });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      const result = await adminUsersRouter.delete({ ctx, input });

      expect(result.success).toBe(true);
    });

    test('should throw FORBIDDEN when deleting self', async () => {
      const ctx = createMockContext({ userId: 'admin-123' });
      const input = { id: 'admin-123' };

      await expect(adminUsersRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'You cannot delete your own account',
      });
    });

    test('should throw NOT_FOUND when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminUsersRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    test('should throw BAD_REQUEST when deletion blocked', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', userRoles: [] };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockAnalyzeUserDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [{ type: 'LAST_ADMIN', details: 'Cannot delete last admin' }],
        warnings: [],
      });

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      await expect(adminUsersRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.delete({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot delete: Cannot delete last admin',
      });
    });
  });

  describe('restore', () => {
    test('should restore a soft-deleted user', async () => {
      const deletedDate = new Date('2024-01-01');
      const mockUser = {
        id: 'user-1',
        email: 'deleted@test.com',
        organizationId: 'org-123',
        deletedAt: deletedDate,
        deletedBy: 'admin-old',
        userRoles: [{ role: { id: 'role-1', name: 'Role', isAdmin: false } }],
      };
      const restoredUser = { ...mockUser, deletedAt: null, deletedBy: null };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(restoredUser);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      const result = await adminUsersRouter.restore({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });
    });

    test('should throw NOT_FOUND when user not deleted', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'active-user' };

      await expect(adminUsersRouter.restore({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.restore({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found or not deleted',
      });
    });

    test('should log admin action on restore', async () => {
      const deletedDate = new Date('2024-01-01');
      const mockUser = {
        id: 'user-1',
        email: 'deleted@test.com',
        organizationId: 'org-123',
        deletedAt: deletedDate,
        deletedBy: 'admin-old',
        userRoles: [{ role: { id: 'role-1', name: 'Role', isAdmin: false } }],
      };
      const restoredUser = { ...mockUser, deletedAt: null, deletedBy: null };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(restoredUser);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ userId: 'admin-456' });
      const input = { id: 'user-1' };

      await adminUsersRouter.restore({ ctx, input });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'USER_RESTORE',
          resourceType: 'USER',
          resourceId: 'user-1',
          actionDetails: expect.objectContaining({
            action: 'restore',
            email: 'deleted@test.com',
          }),
        }),
      );
    });
  });

  describe('getDeletionImpact', () => {
    test('should return deletion impact', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com' };
      const mockImpact = {
        canDelete: true,
        blockers: [],
        warnings: ['User has pending requests'],
      };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockAnalyzeUserDeletion.mockResolvedValue(mockImpact);

      const ctx = createMockContext();
      const input = { id: 'user-1' };

      const result = await adminUsersRouter.getDeletionImpact({ ctx, input });

      expect(result).toEqual(mockImpact);
      expect(mockAnalyzeUserDeletion).toHaveBeenCalledWith('org-123', 'user-1', 'admin-123');
    });

    test('should throw NOT_FOUND when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminUsersRouter.getDeletionImpact({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminUsersRouter.getDeletionImpact({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });
  });

  describe('organization isolation', () => {
    test('list should filter by organization', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'isolated-org' });
      const input = {};

      await adminUsersRouter.list({ ctx, input });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });

    test('create should assign to organization', async () => {
      const mockRoles = [{ id: 'role-1', name: 'Role', isAdmin: false }];
      mockPrisma.role.findMany.mockResolvedValue(mockRoles);
      mockPrisma.user.count.mockResolvedValue(0); // For seat limit check
      mockPrisma.user.create.mockResolvedValue({
        id: 'new',
        email: 'test@test.com',
        userRoles: [],
        organizationId: 'org-A',
        accessToken: 'token-123',
      });
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { email: 'test@test.com', roleIds: ['role-1'] };

      await adminUsersRouter.create({ ctx, input });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-A',
        }),
        select: expect.any(Object),
      });
    });
  });
});
