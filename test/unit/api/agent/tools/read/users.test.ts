/**
 * User Read Tools Unit Tests
 * Tests for user/role query tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockUserFindMany, mockUserFindFirst, mockRoleFindMany, mockRoleFindFirst } = vi.hoisted(
  () => ({
    mockUserFindMany: vi.fn(),
    mockUserFindFirst: vi.fn(),
    mockRoleFindMany: vi.fn(),
    mockRoleFindFirst: vi.fn(),
  }),
);

vi.mock('@sentinel/db', () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
      findFirst: mockUserFindFirst,
    },
    role: {
      findMany: mockRoleFindMany,
      findFirst: mockRoleFindFirst,
    },
  },
}));

// Import after mocking
import { executeReadTool } from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('User Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list_users', () => {
    test('should list users with roles', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'admin@example.com',
          userRoles: [
            { role: { id: 'role-1', name: 'Admin', isAdmin: true } },
            { role: { id: 'role-2', name: 'User', isAdmin: false } },
          ],
          createdAt: new Date('2024-01-10'),
        },
      ];

      mockUserFindMany.mockResolvedValueOnce(mockUsers);

      const result = await executeReadTool('list_users', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 1,
        users: [
          {
            id: 'user-1',
            email: 'admin@example.com',
            roles: [
              { id: 'role-1', name: 'Admin', isAdmin: true },
              { id: 'role-2', name: 'User', isAdmin: false },
            ],
            createdAt: '2024-01-10T00:00:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockUserFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_users', {}, context);

      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should exclude deleted users', async () => {
      mockUserFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_users', {}, context);

      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    test('should respect limit parameter', async () => {
      mockUserFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_users', { limit: 10 }, context);

      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    test('should use default limit of 50', async () => {
      mockUserFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_users', {}, context);

      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });
  });

  describe('get_user', () => {
    test('should get user by id with roles', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        userRoles: [{ role: { id: 'role-1', name: 'Developer', isAdmin: false } }],
        createdAt: new Date('2024-01-15'),
      };

      mockUserFindFirst.mockResolvedValueOnce(mockUser);

      const result = await executeReadTool('get_user', { id: 'user-123' }, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        roles: [{ id: 'role-1', name: 'Developer', isAdmin: false }],
        createdAt: '2024-01-15T00:00:00.000Z',
      });
    });

    test('should scope query to organizationId', async () => {
      mockUserFindFirst.mockResolvedValueOnce(null);

      await executeReadTool('get_user', { id: 'user-123' }, context);

      expect(mockUserFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            id: 'user-123',
          }),
        }),
      );
    });

    test('should return not found error for non-existent user', async () => {
      mockUserFindFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_user', { id: 'nonexistent' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('list_roles', () => {
    test('should list roles with user counts', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'Admin',
          description: 'Administrator role',
          isAdmin: true,
          _count: { userRoles: 3 },
        },
        {
          id: 'role-2',
          name: 'Developer',
          description: 'Developer role',
          isAdmin: false,
          _count: { userRoles: 10 },
        },
      ];

      mockRoleFindMany.mockResolvedValueOnce(mockRoles);

      const result = await executeReadTool('list_roles', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        roles: [
          {
            id: 'role-1',
            name: 'Admin',
            description: 'Administrator role',
            isAdmin: true,
            userCount: 3,
          },
          {
            id: 'role-2',
            name: 'Developer',
            description: 'Developer role',
            isAdmin: false,
            userCount: 10,
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockRoleFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_roles', {}, context);

      expect(mockRoleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should exclude deleted roles', async () => {
      mockRoleFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_roles', {}, context);

      expect(mockRoleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  describe('get_role', () => {
    test('should get role by id with users', async () => {
      const mockRole = {
        id: 'role-123',
        name: 'Support',
        description: 'Support team',
        isAdmin: false,
        userRoles: [
          { user: { id: 'user-1', email: 'user1@example.com' } },
          { user: { id: 'user-2', email: 'user2@example.com' } },
        ],
      };

      mockRoleFindFirst.mockResolvedValueOnce(mockRole);

      const result = await executeReadTool('get_role', { id: 'role-123' }, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'role-123',
        name: 'Support',
        description: 'Support team',
        isAdmin: false,
        users: [
          { id: 'user-1', email: 'user1@example.com' },
          { id: 'user-2', email: 'user2@example.com' },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockRoleFindFirst.mockResolvedValueOnce(null);

      await executeReadTool('get_role', { id: 'role-123' }, context);

      expect(mockRoleFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            id: 'role-123',
          }),
        }),
      );
    });

    test('should return not found error for non-existent role', async () => {
      mockRoleFindFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_role', { id: 'nonexistent' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Role not found');
    });
  });
});
