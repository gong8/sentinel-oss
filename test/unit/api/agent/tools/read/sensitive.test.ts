/**
 * Sensitive Read Tools Unit Tests
 * Tests for sensitive flags and permission request query tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockSensitiveToolFlagFindMany, mockPermissionRequestFindMany } = vi.hoisted(() => ({
  mockSensitiveToolFlagFindMany: vi.fn(),
  mockPermissionRequestFindMany: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    sensitiveToolFlag: {
      findMany: mockSensitiveToolFlagFindMany,
    },
    permissionRequest: {
      findMany: mockPermissionRequestFindMany,
    },
  },
}));

// Import after mocking
import { executeReadTool } from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Sensitive Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list_sensitive_flags', () => {
    test('should list sensitive flags for organization', async () => {
      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'github::*',
          behaviors: ['LOG', 'REQUIRE_APPROVAL'],
          description: 'GitHub tool restrictions',
          enabled: true,
          createdAt: new Date('2024-01-10'),
        },
        {
          id: 'flag-2',
          toolPattern: 'slack::*',
          behaviors: ['LOG'],
          description: null,
          enabled: false,
          createdAt: new Date('2024-01-05'),
        },
      ];

      mockSensitiveToolFlagFindMany.mockResolvedValueOnce(mockFlags);

      const result = await executeReadTool('list_sensitive_flags', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        flags: [
          {
            id: 'flag-1',
            toolPattern: 'github::*',
            behaviors: ['LOG', 'REQUIRE_APPROVAL'],
            description: 'GitHub tool restrictions',
            enabled: true,
            createdAt: '2024-01-10T00:00:00.000Z',
          },
          {
            id: 'flag-2',
            toolPattern: 'slack::*',
            behaviors: ['LOG'],
            description: null,
            enabled: false,
            createdAt: '2024-01-05T00:00:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockSensitiveToolFlagFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_sensitive_flags', {}, context);

      expect(mockSensitiveToolFlagFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should handle empty results', async () => {
      mockSensitiveToolFlagFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_sensitive_flags', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        flags: [],
      });
    });
  });

  describe('list_permission_requests', () => {
    test('should list permission requests for organization', async () => {
      const mockRequests = [
        {
          id: 'perm-1',
          type: 'TOOL_ACCESS',
          status: 'PENDING',
          reason: 'Need access to deploy tools',
          toolNames: ['deploy::production', 'deploy::staging'],
          reviewedAt: null,
          createdAt: new Date('2024-01-15'),
          user: { id: 'user-1', email: 'dev@example.com' },
        },
        {
          id: 'perm-2',
          type: 'MCP_SERVER',
          status: 'APPROVED',
          reason: 'Need MCP server access',
          toolNames: [],
          reviewedAt: new Date('2024-01-12'),
          createdAt: new Date('2024-01-10'),
          user: { id: 'user-2', email: 'ops@example.com' },
        },
      ];

      mockPermissionRequestFindMany.mockResolvedValueOnce(mockRequests);

      const result = await executeReadTool('list_permission_requests', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        requests: [
          {
            id: 'perm-1',
            status: 'PENDING',
            type: 'TOOL_ACCESS',
            toolNames: ['deploy::production', 'deploy::staging'],
            reason: 'Need access to deploy tools',
            user: { id: 'user-1', email: 'dev@example.com' },
            createdAt: '2024-01-15T00:00:00.000Z',
            reviewedAt: null,
          },
          {
            id: 'perm-2',
            status: 'APPROVED',
            type: 'MCP_SERVER',
            toolNames: [],
            reason: 'Need MCP server access',
            user: { id: 'user-2', email: 'ops@example.com' },
            createdAt: '2024-01-10T00:00:00.000Z',
            reviewedAt: '2024-01-12T00:00:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId via user relation', async () => {
      mockPermissionRequestFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_permission_requests', {}, context);

      expect(mockPermissionRequestFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: {
              organizationId: 'org-1',
            },
          }),
        }),
      );
    });

    test('should filter by status', async () => {
      mockPermissionRequestFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_permission_requests', { status: 'APPROVED' }, context);

      expect(mockPermissionRequestFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APPROVED',
          }),
        }),
      );
    });

    test('should order by createdAt desc', async () => {
      mockPermissionRequestFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_permission_requests', {}, context);

      expect(mockPermissionRequestFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    test('should use default limit of 50', async () => {
      mockPermissionRequestFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_permission_requests', {}, context);

      expect(mockPermissionRequestFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    test('should handle empty results', async () => {
      mockPermissionRequestFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_permission_requests', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        requests: [],
      });
    });

    test('should handle request with null user', async () => {
      const mockRequests = [
        {
          id: 'perm-no-user',
          type: 'MCP_SERVER',
          status: 'PENDING',
          reason: 'Need server access',
          toolNames: [],
          reviewedAt: null,
          createdAt: new Date('2024-01-15'),
          user: null,
        },
      ];

      mockPermissionRequestFindMany.mockResolvedValueOnce(mockRequests);

      const result = await executeReadTool('list_permission_requests', {}, context);

      expect(result.success).toBe(true);
      const data = result.data as { requests: Array<{ user: null }> };
      expect(data.requests[0]?.user).toBeNull();
    });
  });
});
