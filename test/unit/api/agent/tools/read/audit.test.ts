/**
 * Audit Read Tools Unit Tests
 * Tests for audit query tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockAuditLogFindMany, mockAdminActionLogFindMany } = vi.hoisted(() => ({
  mockAuditLogFindMany: vi.fn(),
  mockAdminActionLogFindMany: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    auditLogEntry: {
      findMany: mockAuditLogFindMany,
    },
    adminActionLog: {
      findMany: mockAdminActionLogFindMany,
    },
  },
}));

// Import after mocking
import { executeReadTool } from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Audit Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query_audit_log', () => {
    test('should query audit log entries with user and agent info', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          toolName: 'github::createPR',
          decision: 'ALLOW',
          matchedPolicyIds: ['policy-1'],
          user: { id: 'user-1', email: 'dev@example.com' },
          agent: { id: 'agent-1', name: 'Dev Agent' },
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'audit-2',
          toolName: 'slack::sendMessage',
          decision: 'DENY',
          matchedPolicyIds: ['policy-2', 'policy-3'],
          user: { id: 'user-2', email: 'admin@example.com' },
          agent: null,
          timestamp: new Date('2024-01-15T09:30:00Z'),
        },
      ];

      mockAuditLogFindMany.mockResolvedValueOnce(mockEntries);

      const result = await executeReadTool('query_audit_log', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        entries: [
          {
            id: 'audit-1',
            toolName: 'github::createPR',
            decision: 'ALLOW',
            matchedPolicyIds: ['policy-1'],
            user: { id: 'user-1', email: 'dev@example.com' },
            agent: { id: 'agent-1', name: 'Dev Agent' },
            timestamp: '2024-01-15T10:00:00.000Z',
          },
          {
            id: 'audit-2',
            toolName: 'slack::sendMessage',
            decision: 'DENY',
            matchedPolicyIds: ['policy-2', 'policy-3'],
            user: { id: 'user-2', email: 'admin@example.com' },
            agent: null,
            timestamp: '2024-01-15T09:30:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockAuditLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_audit_log', {}, context);

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should respect limit parameter', async () => {
      mockAuditLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_audit_log', { limit: 10 }, context);

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    test('should use default limit of 50', async () => {
      mockAuditLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_audit_log', {}, context);

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    test('should order by timestamp desc', async () => {
      mockAuditLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_audit_log', {}, context);

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        }),
      );
    });

    test('should include user and agent relations', async () => {
      mockAuditLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_audit_log', {}, context);

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            user: { select: { id: true, email: true } },
            agent: { select: { id: true, name: true } },
          },
        }),
      );
    });

    test('should handle entries without user', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          toolName: 'test::tool',
          decision: 'ALLOW',
          matchedPolicyIds: [],
          user: null,
          agent: { id: 'agent-1', name: 'Test Agent' },
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockAuditLogFindMany.mockResolvedValueOnce(mockEntries);

      const result = await executeReadTool('query_audit_log', {}, context);

      expect(result.success).toBe(true);
      expect((result.data as { entries: { user: null }[] }).entries[0].user).toBeNull();
    });

    test('should handle entries without agent', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          toolName: 'test::tool',
          decision: 'ALLOW',
          matchedPolicyIds: [],
          user: { id: 'user-1', email: 'test@example.com' },
          agent: null,
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockAuditLogFindMany.mockResolvedValueOnce(mockEntries);

      const result = await executeReadTool('query_audit_log', {}, context);

      expect(result.success).toBe(true);
      expect((result.data as { entries: { agent: null }[] }).entries[0].agent).toBeNull();
    });

    test('should return empty array when no entries exist', async () => {
      mockAuditLogFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('query_audit_log', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        entries: [],
      });
    });
  });

  describe('query_admin_actions', () => {
    test('should query admin action logs with admin user info', async () => {
      const mockLogs = [
        {
          id: 'action-1',
          actionType: 'CREATE',
          resourceType: 'policy',
          resourceId: 'policy-123',
          resourceName: 'Admin Access Policy',
          adminUser: { id: 'admin-1', email: 'admin@example.com' },
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'action-2',
          actionType: 'UPDATE',
          resourceType: 'role',
          resourceId: 'role-456',
          resourceName: 'Developer Role',
          adminUser: { id: 'admin-2', email: 'superadmin@example.com' },
          timestamp: new Date('2024-01-15T09:30:00Z'),
        },
      ];

      mockAdminActionLogFindMany.mockResolvedValueOnce(mockLogs);

      const result = await executeReadTool('query_admin_actions', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        entries: [
          {
            id: 'action-1',
            actionType: 'CREATE',
            resourceType: 'policy',
            resourceId: 'policy-123',
            resourceName: 'Admin Access Policy',
            admin: { id: 'admin-1', email: 'admin@example.com' },
            timestamp: '2024-01-15T10:00:00.000Z',
          },
          {
            id: 'action-2',
            actionType: 'UPDATE',
            resourceType: 'role',
            resourceId: 'role-456',
            resourceName: 'Developer Role',
            admin: { id: 'admin-2', email: 'superadmin@example.com' },
            timestamp: '2024-01-15T09:30:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockAdminActionLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_admin_actions', {}, context);

      expect(mockAdminActionLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should respect limit parameter', async () => {
      mockAdminActionLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_admin_actions', { limit: 25 }, context);

      expect(mockAdminActionLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    test('should use default limit of 50', async () => {
      mockAdminActionLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_admin_actions', {}, context);

      expect(mockAdminActionLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    test('should order by timestamp desc', async () => {
      mockAdminActionLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_admin_actions', {}, context);

      expect(mockAdminActionLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        }),
      );
    });

    test('should include adminUser relation', async () => {
      mockAdminActionLogFindMany.mockResolvedValueOnce([]);

      await executeReadTool('query_admin_actions', {}, context);

      expect(mockAdminActionLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            adminUser: { select: { id: true, email: true } },
          },
        }),
      );
    });

    test('should handle entries without admin user', async () => {
      const mockLogs = [
        {
          id: 'action-1',
          actionType: 'DELETE',
          resourceType: 'server',
          resourceId: 'server-789',
          resourceName: 'Test Server',
          adminUser: null,
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockAdminActionLogFindMany.mockResolvedValueOnce(mockLogs);

      const result = await executeReadTool('query_admin_actions', {}, context);

      expect(result.success).toBe(true);
      expect((result.data as { entries: { admin: null }[] }).entries[0].admin).toBeNull();
    });

    test('should return empty array when no entries exist', async () => {
      mockAdminActionLogFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('query_admin_actions', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        entries: [],
      });
    });
  });
});
