/**
 * Policy Read Tools Unit Tests
 * Tests for policy query tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockFindMany, mockFindFirst } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    policy: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
    },
  },
}));

// Import after mocking
import {
  executeReadTool,
  hasReadExecutor,
} from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Policy Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasReadExecutor', () => {
    test('should return true for list_policies', () => {
      expect(hasReadExecutor('list_policies')).toBe(true);
    });

    test('should return true for get_policy', () => {
      expect(hasReadExecutor('get_policy')).toBe(true);
    });

    test('should return false for unknown tool', () => {
      expect(hasReadExecutor('unknown_tool')).toBe(false);
    });
  });

  describe('list_policies', () => {
    test('should list policies for organization', async () => {
      const mockPolicies = [
        {
          id: 'policy-1',
          slug: 'admin-access',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          toolPatterns: ['*'],
          description: 'Admin full access',
          enabled: true,
          createdAt: new Date('2024-01-10'),
          updatedAt: new Date('2024-01-15'),
        },
        {
          id: 'policy-2',
          slug: 'deny-delete',
          effect: 'DENY',
          matchers: ['role:User'],
          toolPatterns: ['*::delete*'],
          description: 'Deny delete operations',
          enabled: true,
          createdAt: new Date('2024-01-05'),
          updatedAt: new Date('2024-01-12'),
        },
      ];

      mockFindMany.mockResolvedValueOnce(mockPolicies);

      const result = await executeReadTool('list_policies', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        policies: [
          {
            id: 'policy-1',
            slug: 'admin-access',
            effect: 'ALLOW',
            matchers: ['role:Admin'],
            toolPatterns: ['*'],
            description: 'Admin full access',
            enabled: true,
            createdAt: '2024-01-10T00:00:00.000Z',
            updatedAt: '2024-01-15T00:00:00.000Z',
          },
          {
            id: 'policy-2',
            slug: 'deny-delete',
            effect: 'DENY',
            matchers: ['role:User'],
            toolPatterns: ['*::delete*'],
            description: 'Deny delete operations',
            enabled: true,
            createdAt: '2024-01-05T00:00:00.000Z',
            updatedAt: '2024-01-12T00:00:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_policies', {}, context);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should exclude deleted policies', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_policies', {}, context);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    test('should respect limit parameter', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_policies', { limit: 10 }, context);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    test('should use default limit of 50', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_policies', {}, context);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    test('should respect offset parameter', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_policies', { offset: 20 }, context);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
        }),
      );
    });

    test('should order by createdAt desc', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_policies', {}, context);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    test('should return empty array when no policies exist', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_policies', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        policies: [],
      });
    });
  });

  describe('get_policy', () => {
    test('should get policy by id', async () => {
      const mockPolicy = {
        id: 'policy-123',
        slug: 'test-policy',
        effect: 'ALLOW',
        matchers: ['role:User'],
        toolPatterns: ['github::*'],
        description: 'Test policy',
        enabled: true,
        conditions: null,
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-15'),
      };

      mockFindFirst.mockResolvedValueOnce(mockPolicy);

      const result = await executeReadTool('get_policy', { id: 'policy-123' }, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'policy-123',
        slug: 'test-policy',
        effect: 'ALLOW',
        matchers: ['role:User'],
        toolPatterns: ['github::*'],
        description: 'Test policy',
        enabled: true,
        conditions: null,
        createdAt: '2024-01-10T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z',
      });
    });

    test('should scope query to organizationId', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      await executeReadTool('get_policy', { id: 'policy-123' }, context);

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          id: 'policy-123',
        },
      });
    });

    test('should return not found error for non-existent policy', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_policy', { id: 'nonexistent' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Policy not found');
    });
  });

  describe('unknown tool', () => {
    test('should return error for unknown tool', async () => {
      const result = await executeReadTool('unknown_policy_tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown read tool');
    });
  });
});
