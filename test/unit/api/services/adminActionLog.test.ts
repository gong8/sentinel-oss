/**
 * Tests for Admin Action Log Service
 * Tests all functions for logging and retrieving admin actions
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks to avoid initialization order issues
const { mockCreate, mockCount, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockCount: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    adminActionLog: {
      create: mockCreate,
      count: mockCount,
      findMany: mockFindMany,
    },
  },
  AdminActionType: {
    USER_CREATE: 'USER_CREATE',
    USER_UPDATE: 'USER_UPDATE',
    USER_DELETE: 'USER_DELETE',
    USER_RESTORE: 'USER_RESTORE',
    USER_ROLES_UPDATE: 'USER_ROLES_UPDATE',
    ROLE_CREATE: 'ROLE_CREATE',
    ROLE_UPDATE: 'ROLE_UPDATE',
    ROLE_DELETE: 'ROLE_DELETE',
    POLICY_CREATE: 'POLICY_CREATE',
    POLICY_UPDATE: 'POLICY_UPDATE',
    POLICY_DELETE: 'POLICY_DELETE',
    POLICY_ENABLE: 'POLICY_ENABLE',
    POLICY_DISABLE: 'POLICY_DISABLE',
    MCP_SERVER_CREATE: 'MCP_SERVER_CREATE',
    MCP_SERVER_UPDATE: 'MCP_SERVER_UPDATE',
    MCP_SERVER_DELETE: 'MCP_SERVER_DELETE',
    AGENT_CREATE: 'AGENT_CREATE',
    AGENT_DELETE: 'AGENT_DELETE',
    PERMISSION_REQUEST_APPROVE: 'PERMISSION_REQUEST_APPROVE',
    PERMISSION_REQUEST_DENY: 'PERMISSION_REQUEST_DENY',
    ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
  },
  AdminResourceType: {
    USER: 'USER',
    ROLE: 'ROLE',
    POLICY: 'POLICY',
    MCP_SERVER: 'MCP_SERVER',
    AGENT: 'AGENT',
    PERMISSION_REQUEST: 'PERMISSION_REQUEST',
    ORGANIZATION: 'ORGANIZATION',
  },
}));

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { AdminActionType, AdminResourceType } from '@sentinel/db';
import { logger } from '../../../../packages/api/src/lib/logger.js';
import {
  getAdminActionLogs,
  logAdminAction,
} from '../../../../packages/api/src/services/adminActionLog.js';

const mockLogger = vi.mocked(logger);

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminActionLog', () => {
  describe('logAdminAction', () => {
    const baseLogData = {
      organizationId: 'org-123',
      adminUserId: 'admin-456',
      actionType: AdminActionType.USER_CREATE,
      resourceType: AdminResourceType.USER,
      actionDetails: { action: 'created user' },
    };

    test('should create admin action log with required fields and return success', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const result = await logAdminAction(baseLogData);

      expect(result).toEqual({ success: true });
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          adminUserId: 'admin-456',
          actionType: 'USER_CREATE',
          resourceType: 'USER',
          resourceId: undefined,
          resourceName: undefined,
          actionDetails: { action: 'created user' },
          beforeSnapshot: undefined,
          afterSnapshot: undefined,
          ipAddress: undefined,
          userAgent: undefined,
          reason: undefined,
        },
      });
    });

    test('should create admin action log with all optional fields', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const fullData = {
        ...baseLogData,
        resourceId: 'resource-789',
        resourceName: 'Test Resource',
        beforeSnapshot: { name: 'Old Name' },
        afterSnapshot: { name: 'New Name' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        reason: 'Updated for compliance',
      };

      await logAdminAction(fullData);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resourceId: 'resource-789',
          resourceName: 'Test Resource',
          beforeSnapshot: { name: 'Old Name' },
          afterSnapshot: { name: 'New Name' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          reason: 'Updated for compliance',
        }),
      });
    });

    test('should not throw when database error occurs and return failure status', async () => {
      mockCreate.mockRejectedValue(new Error('Database connection failed'));

      // Should not throw, but should return failure status
      const result = await logAdminAction(baseLogData);
      expect(result).toEqual({ success: false });
    });

    test('should log error when database error occurs', async () => {
      const dbError = new Error('Database connection failed');
      mockCreate.mockRejectedValue(dbError);

      await logAdminAction(baseLogData);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create admin action log entry:',
        dbError,
      );
    });

    test('should handle null resourceId', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logAdminAction({
        ...baseLogData,
        resourceId: null,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resourceId: null,
        }),
      });
    });

    test('should handle null snapshots', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logAdminAction({
        ...baseLogData,
        beforeSnapshot: null,
        afterSnapshot: null,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          beforeSnapshot: undefined,
          afterSnapshot: undefined,
        }),
      });
    });

    test('should handle complex actionDetails JSON', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const complexDetails = {
        changes: [
          { field: 'email', from: 'old@test.com', to: 'new@test.com' },
          { field: 'name', from: 'Old Name', to: 'New Name' },
        ],
        metadata: {
          source: 'admin-panel',
          version: 2,
          tags: ['important', 'audit'],
        },
      };

      await logAdminAction({
        ...baseLogData,
        actionDetails: complexDetails,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionDetails: complexDetails,
        }),
      });
    });

    test('should handle all action types', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const actionTypes = [
        AdminActionType.USER_CREATE,
        AdminActionType.USER_UPDATE,
        AdminActionType.USER_DELETE,
        AdminActionType.POLICY_ENABLE,
        AdminActionType.POLICY_DISABLE,
        AdminActionType.USER_ROLES_UPDATE,
        AdminActionType.ROLE_CREATE,
      ];

      for (const actionType of actionTypes) {
        await logAdminAction({ ...baseLogData, actionType });
      }

      expect(mockCreate).toHaveBeenCalledTimes(actionTypes.length);
    });

    test('should handle all resource types', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const resourceTypes = [
        AdminResourceType.USER,
        AdminResourceType.ROLE,
        AdminResourceType.POLICY,
        AdminResourceType.MCP_SERVER,
        AdminResourceType.AGENT,
      ];

      for (const resourceType of resourceTypes) {
        await logAdminAction({ ...baseLogData, resourceType });
      }

      expect(mockCreate).toHaveBeenCalledTimes(resourceTypes.length);
    });
  });

  describe('getAdminActionLogs', () => {
    const baseFilters = {
      organizationId: 'org-123',
    };

    const mockLogEntry = {
      id: 'log-1',
      organizationId: 'org-123',
      adminUserId: 'admin-456',
      actionType: 'CREATE',
      resourceType: 'USER',
      resourceId: 'resource-789',
      resourceName: 'Test User',
      actionDetails: {},
      timestamp: new Date('2024-01-01'),
      adminUser: {
        id: 'admin-456',
        email: 'admin@example.com',
      },
    };

    test('should fetch logs with organization filter only', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const result = await getAdminActionLogs(baseFilters);

      expect(mockCount).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
      });
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        orderBy: { timestamp: 'desc' },
        take: 50,
        skip: 0,
        include: {
          adminUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
      expect(result).toEqual({
        total: 1,
        entries: [mockLogEntry],
      });
    });

    test('should filter by adminUserId', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs({
        ...baseFilters,
        adminUserId: 'admin-456',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          adminUserId: 'admin-456',
        },
      });
    });

    test('should filter by actionType', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs({
        ...baseFilters,
        actionType: AdminActionType.USER_DELETE,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          actionType: 'USER_DELETE',
        },
      });
    });

    test('should filter by resourceType', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs({
        ...baseFilters,
        resourceType: AdminResourceType.POLICY,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          resourceType: 'POLICY',
        },
      });
    });

    test('should filter by resourceId', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs({
        ...baseFilters,
        resourceId: 'specific-resource',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          resourceId: 'specific-resource',
        },
      });
    });

    test('should filter by startDate only', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const startDate = new Date('2024-01-01');
      await getAdminActionLogs({
        ...baseFilters,
        startDate,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          timestamp: { gte: startDate },
        },
      });
    });

    test('should filter by endDate only', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const endDate = new Date('2024-12-31');
      await getAdminActionLogs({
        ...baseFilters,
        endDate,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          timestamp: { lte: endDate },
        },
      });
    });

    test('should filter by date range', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      await getAdminActionLogs({
        ...baseFilters,
        startDate,
        endDate,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          timestamp: { gte: startDate, lte: endDate },
        },
      });
    });

    test('should apply custom limit', async () => {
      mockCount.mockResolvedValue(100);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs({
        ...baseFilters,
        limit: 25,
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    test('should apply custom offset', async () => {
      mockCount.mockResolvedValue(100);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs({
        ...baseFilters,
        offset: 50,
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 50,
        }),
      );
    });

    test('should use defaults for limit and offset', async () => {
      mockCount.mockResolvedValue(100);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs(baseFilters);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        }),
      );
    });

    test('should combine multiple filters', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      await getAdminActionLogs({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: AdminActionType.USER_UPDATE,
        resourceType: AdminResourceType.USER,
        resourceId: 'user-789',
        startDate,
        endDate,
        limit: 10,
        offset: 5,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          adminUserId: 'admin-456',
          actionType: 'USER_UPDATE',
          resourceType: 'USER',
          resourceId: 'user-789',
          timestamp: { gte: startDate, lte: endDate },
        },
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 5,
        }),
      );
    });

    test('should return empty results when no logs found', async () => {
      mockCount.mockResolvedValue(0);
      mockFindMany.mockResolvedValue([]);

      const result = await getAdminActionLogs(baseFilters);

      expect(result).toEqual({
        total: 0,
        entries: [],
      });
    });

    test('should return multiple entries', async () => {
      const entries = [
        { ...mockLogEntry, id: 'log-1' },
        { ...mockLogEntry, id: 'log-2' },
        { ...mockLogEntry, id: 'log-3' },
      ];
      mockCount.mockResolvedValue(3);
      mockFindMany.mockResolvedValue(entries);

      const result = await getAdminActionLogs(baseFilters);

      expect(result.total).toBe(3);
      expect(result.entries).toHaveLength(3);
    });

    test('should include adminUser in results', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const result = await getAdminActionLogs(baseFilters);

      expect(result.entries[0].adminUser).toEqual({
        id: 'admin-456',
        email: 'admin@example.com',
      });
    });

    test('should order by timestamp descending', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAdminActionLogs(baseFilters);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        }),
      );
    });
  });
});
