/**
 * Tests for User Profile Router
 * Tests retrieval of current user's profile with roles and organization
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  protectedProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { userProfileRouter as _userProfileRouter } from '../../../../../packages/api/src/trpc/user/profile.js';

type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  userRoles: Array<{
    id: string;
    userId: string;
    roleId: string;
    role: {
      id: string;
      name: string;
      description: string | null;
    };
  }>;
  organization: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

const userProfileRouter = _userProfileRouter as unknown as {
  get: TestableHandler<UserProfile | null>;
};

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
  };
}

function createMockUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    organizationId: 'org-123',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    userRoles: [
      {
        id: 'user-role-1',
        userId: 'user-123',
        roleId: 'role-1',
        role: {
          id: 'role-1',
          name: 'Admin',
          description: 'Administrator role',
        },
      },
    ],
    organization: {
      id: 'org-123',
      name: 'Test Organization',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userProfileRouter', () => {
  describe('get', () => {
    test('should return user profile with roles and organization', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const ctx = createMockContext();
      const result = await userProfileRouter.get({ ctx });

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
          organization: true,
        },
      });
    });

    test('should use user ID from context', async () => {
      const mockUser = createMockUser({ id: 'custom-user-id' });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const ctx = createMockContext({ userId: 'custom-user-id' });
      await userProfileRouter.get({ ctx });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'custom-user-id' },
        }),
      );
    });

    test('should return null when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const ctx = createMockContext();
      const result = await userProfileRouter.get({ ctx });

      expect(result).toBeNull();
    });

    test('should include multiple roles', async () => {
      const mockUser = createMockUser({
        userRoles: [
          {
            id: 'user-role-1',
            userId: 'user-123',
            roleId: 'role-1',
            role: {
              id: 'role-1',
              name: 'Admin',
              description: 'Administrator role',
            },
          },
          {
            id: 'user-role-2',
            userId: 'user-123',
            roleId: 'role-2',
            role: {
              id: 'role-2',
              name: 'User',
              description: 'Regular user role',
            },
          },
        ],
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const ctx = createMockContext();
      const result = await userProfileRouter.get({ ctx });

      expect(result?.userRoles).toHaveLength(2);
      expect(result?.userRoles[0].role.name).toBe('Admin');
      expect(result?.userRoles[1].role.name).toBe('User');
    });

    test('should handle user with no roles', async () => {
      const mockUser = createMockUser({ userRoles: [] });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const ctx = createMockContext();
      const result = await userProfileRouter.get({ ctx });

      expect(result?.userRoles).toEqual([]);
    });

    test('should handle user with null name', async () => {
      const mockUser = createMockUser({ name: null });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const ctx = createMockContext();
      const result = await userProfileRouter.get({ ctx });

      expect(result?.name).toBeNull();
    });

    test('should propagate database errors', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const ctx = createMockContext();

      await expect(userProfileRouter.get({ ctx })).rejects.toThrow('Database connection failed');
    });
  });
});
