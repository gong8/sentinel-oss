/**
 * Tests for Auth Service
 * Tests all functions for authentication and authorization
 */

import { OrgRole } from '@sentinel/db';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks to avoid initialization order issues
const { mockFindFirst, mockUpdate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@sentinel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentinel/db')>();
  return {
    ...actual,
    prisma: {
      user: {
        findFirst: mockFindFirst,
        update: mockUpdate,
      },
    },
  };
});

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { logger } from '../../../../packages/api/src/lib/logger.js';
import {
  hasRole,
  isAdmin,
  refreshAccessToken,
  validateAccessToken,
  type AuthContext,
} from '../../../../packages/api/src/services/auth.js';

const mockLogger = vi.mocked(logger);

beforeAll(() => {
  console.log('🧪 Auth service test suite starting...');
});

afterAll(() => {
  console.log('✅ Auth service test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth', () => {
  describe('validateAccessToken', () => {
    const mockUserWithRoles = {
      id: 'user-123',
      email: 'user@example.com',
      organizationId: 'org-456',
      accessToken: 'valid-token-abc',
      orgRole: OrgRole.MEMBER,
      orgOwnership: [],
      workspaceMemberships: [],
      userRoles: [
        {
          id: 'ur-1',
          userId: 'user-123',
          roleId: 'role-1',
          role: {
            id: 'role-1',
            name: 'User',
            isAdmin: false,
          },
        },
      ],
    };

    const mockAdminUserWithRoles = {
      id: 'admin-123',
      email: 'admin@example.com',
      organizationId: 'org-456',
      accessToken: 'admin-token-xyz',
      orgRole: OrgRole.OWNER,
      orgOwnership: [],
      workspaceMemberships: [],
      userRoles: [
        {
          id: 'ur-2',
          userId: 'admin-123',
          roleId: 'role-2',
          role: {
            id: 'role-2',
            name: 'Admin',
            isAdmin: true,
          },
        },
        {
          id: 'ur-3',
          userId: 'admin-123',
          roleId: 'role-1',
          role: {
            id: 'role-1',
            name: 'User',
            isAdmin: false,
          },
        },
      ],
    };

    test('should return null for empty access token', async () => {
      const result = await validateAccessToken('');

      expect(result).toBeNull();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    test('should return null for whitespace-only access token', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await validateAccessToken('   ');

      expect(result).toBeNull();
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { accessToken: '   ', deletedAt: null },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
          workspaceMemberships: {
            include: {
              workspace: true,
            },
          },
          orgOwnership: true,
        },
      });
    });

    test('should return null when user not found', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await validateAccessToken('invalid-token');

      expect(result).toBeNull();
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { accessToken: 'invalid-token', deletedAt: null },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
          workspaceMemberships: {
            include: {
              workspace: true,
            },
          },
          orgOwnership: true,
        },
      });
    });

    test('should return auth context for valid regular user', async () => {
      mockFindFirst.mockResolvedValue(mockUserWithRoles);

      const result = await validateAccessToken('valid-token-abc');

      expect(result).toEqual({
        user: mockUserWithRoles,
        organizationId: 'org-456',
        roles: ['User'],
        isAdmin: false,
        isOrgOwner: false,
        workspaceIds: [],
        adminWorkspaceIds: [],
      });
    });

    test('should return auth context for valid admin user', async () => {
      mockFindFirst.mockResolvedValue(mockAdminUserWithRoles);

      const result = await validateAccessToken('admin-token-xyz');

      expect(result).toEqual({
        user: mockAdminUserWithRoles,
        organizationId: 'org-456',
        roles: ['Admin', 'User'],
        isAdmin: true,
        isOrgOwner: true, // User has orgRole: OWNER
        workspaceIds: [],
        adminWorkspaceIds: [],
      });
    });

    test('should set isAdmin true if any role has isAdmin flag', async () => {
      mockFindFirst.mockResolvedValue(mockAdminUserWithRoles);

      const result = await validateAccessToken('admin-token-xyz');

      expect(result?.isAdmin).toBe(true);
    });

    test('should set isAdmin false if no role has isAdmin flag', async () => {
      mockFindFirst.mockResolvedValue(mockUserWithRoles);

      const result = await validateAccessToken('valid-token-abc');

      expect(result?.isAdmin).toBe(false);
    });

    test('should extract all role names correctly', async () => {
      const userWithMultipleRoles = {
        ...mockUserWithRoles,
        orgRole: OrgRole.MEMBER,
        userRoles: [
          {
            id: 'ur-1',
            userId: 'user-123',
            roleId: 'role-1',
            role: { id: 'role-1', name: 'Developer', isAdmin: false },
          },
          {
            id: 'ur-2',
            userId: 'user-123',
            roleId: 'role-2',
            role: { id: 'role-2', name: 'Reviewer', isAdmin: false },
          },
          {
            id: 'ur-3',
            userId: 'user-123',
            roleId: 'role-3',
            role: { id: 'role-3', name: 'Tester', isAdmin: false },
          },
        ],
      };
      mockFindFirst.mockResolvedValue(userWithMultipleRoles);

      const result = await validateAccessToken('valid-token');

      expect(result?.roles).toEqual(['Developer', 'Reviewer', 'Tester']);
    });

    test('should return null and log error on database failure', async () => {
      const dbError = new Error('Database connection failed');
      mockFindFirst.mockRejectedValue(dbError);

      const result = await validateAccessToken('some-token');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Error validating access token:', dbError);
    });

    test('should handle user with empty roles array', async () => {
      const userWithNoRoles = {
        ...mockUserWithRoles,
        orgRole: OrgRole.MEMBER,
        userRoles: [],
      };
      mockFindFirst.mockResolvedValue(userWithNoRoles);

      const result = await validateAccessToken('valid-token');

      expect(result).toEqual({
        user: userWithNoRoles,
        organizationId: 'org-456',
        roles: [],
        isAdmin: false,
        isOrgOwner: false,
        workspaceIds: [],
        adminWorkspaceIds: [],
      });
    });
  });

  describe('refreshAccessToken', () => {
    test('should update user and return new access token', async () => {
      const newToken = 'new-generated-token-xyz';
      mockUpdate.mockResolvedValue({
        id: 'user-123',
        accessToken: newToken,
      });

      const result = await refreshAccessToken('user-123');

      expect(result).toBe(newToken);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          accessToken: expect.any(String),
          updatedAt: expect.any(Date),
        },
      });
    });

    test('should call update with correct userId', async () => {
      mockUpdate.mockResolvedValue({
        id: 'specific-user',
        accessToken: 'token',
      });

      await refreshAccessToken('specific-user');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'specific-user' },
        }),
      );
    });

    test('should set updatedAt to current time', async () => {
      const beforeCall = new Date();
      mockUpdate.mockResolvedValue({
        id: 'user-123',
        accessToken: 'token',
      });

      await refreshAccessToken('user-123');
      const afterCall = new Date();

      const calledData = mockUpdate.mock.calls[0][0].data;
      expect(calledData.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(calledData.updatedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    test('should propagate database errors', async () => {
      const dbError = new Error('User not found');
      mockUpdate.mockRejectedValue(dbError);

      await expect(refreshAccessToken('nonexistent-user')).rejects.toThrow('User not found');
    });
  });

  describe('hasRole', () => {
    const mockContext: AuthContext = {
      user: {
        id: 'user-123',
        email: 'user@example.com',
        organizationId: 'org-456',
        accessToken: 'token',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        lastActivityAt: null,
        orgRole: OrgRole.MEMBER,
        userRoles: [],
      },
      organizationId: 'org-456',
      roles: ['Admin', 'Developer', 'Reviewer'],
      isAdmin: true,
      isOrgOwner: false,
      workspaceIds: [],
      adminWorkspaceIds: [],
    };

    test('should return true when user has the role', () => {
      expect(hasRole(mockContext, 'Admin')).toBe(true);
      expect(hasRole(mockContext, 'Developer')).toBe(true);
      expect(hasRole(mockContext, 'Reviewer')).toBe(true);
    });

    test('should return false when user does not have the role', () => {
      expect(hasRole(mockContext, 'Manager')).toBe(false);
      expect(hasRole(mockContext, 'Guest')).toBe(false);
    });

    test('should be case-sensitive', () => {
      expect(hasRole(mockContext, 'admin')).toBe(false);
      expect(hasRole(mockContext, 'ADMIN')).toBe(false);
    });

    test('should handle empty roles array', () => {
      const contextWithNoRoles: AuthContext = {
        ...mockContext,
        roles: [],
      };

      expect(hasRole(contextWithNoRoles, 'Admin')).toBe(false);
    });

    test('should handle empty string role name', () => {
      expect(hasRole(mockContext, '')).toBe(false);
    });
  });

  describe('isAdmin', () => {
    test('should return true when context has isAdmin true', () => {
      const adminContext: AuthContext = {
        user: {
          id: 'admin-123',
          email: 'admin@example.com',
          organizationId: 'org-456',
          accessToken: 'token',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
          lastActivityAt: null,
          orgRole: OrgRole.OWNER,
          userRoles: [],
        },
        organizationId: 'org-456',
        roles: ['Admin'],
        isAdmin: true,
        isOrgOwner: false,
        workspaceIds: [],
        adminWorkspaceIds: [],
      };

      expect(isAdmin(adminContext)).toBe(true);
    });

    test('should return false when context has isAdmin false', () => {
      const userContext: AuthContext = {
        user: {
          id: 'user-123',
          email: 'user@example.com',
          organizationId: 'org-456',
          accessToken: 'token',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
          lastActivityAt: null,
          orgRole: OrgRole.MEMBER,
          userRoles: [],
        },
        organizationId: 'org-456',
        roles: ['User'],
        isAdmin: false,
        isOrgOwner: false,
        workspaceIds: [],
        adminWorkspaceIds: [],
      };

      expect(isAdmin(userContext)).toBe(false);
    });

    test('should not be affected by role names', () => {
      // Having "Admin" role name doesn't make isAdmin true
      const userWithAdminRoleName: AuthContext = {
        user: {
          id: 'user-123',
          email: 'user@example.com',
          organizationId: 'org-456',
          accessToken: 'token',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
          lastActivityAt: null,
          orgRole: OrgRole.MEMBER,
          userRoles: [],
        },
        organizationId: 'org-456',
        roles: ['Admin'], // Has Admin role name
        isAdmin: false, // But isAdmin flag is false
        isOrgOwner: false,
        workspaceIds: [],
        adminWorkspaceIds: [],
      };

      expect(isAdmin(userWithAdminRoleName)).toBe(false);
    });
  });
});
