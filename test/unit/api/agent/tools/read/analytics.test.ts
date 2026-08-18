/**
 * Analytics Read Tools Unit Tests
 * Tests for analytics query tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockAuditLogGroupBy, mockUserCount, mockPolicyCount } = vi.hoisted(() => ({
  mockAuditLogGroupBy: vi.fn(),
  mockUserCount: vi.fn(),
  mockPolicyCount: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    auditLogEntry: {
      groupBy: mockAuditLogGroupBy,
    },
    user: {
      count: mockUserCount,
    },
    policy: {
      count: mockPolicyCount,
    },
  },
}));

// Import after mocking
import { executeReadTool } from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Analytics Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get_analytics_summary', () => {
    test('should get analytics summary with default 7 days', async () => {
      const mockAuditStats = [
        { decision: 'ALLOW', _count: { id: 850 } },
        { decision: 'DENIED', _count: { id: 150 } },
      ];

      mockAuditLogGroupBy.mockResolvedValueOnce(mockAuditStats);
      mockUserCount.mockResolvedValueOnce(25);
      mockPolicyCount.mockResolvedValueOnce(10);

      const result = await executeReadTool('get_analytics_summary', {}, context);

      expect(result.success).toBe(true);

      const data = result.data as {
        period: { days: number; startDate: string };
        toolCalls: { total: number; allowed: number; denied: number; denialRate: string };
        users: number;
        policies: number;
      };

      expect(data.period.days).toBe(7);
      expect(data.toolCalls.total).toBe(1000);
      expect(data.toolCalls.allowed).toBe(850);
      expect(data.toolCalls.denied).toBe(150);
      expect(data.toolCalls.denialRate).toBe('15.0%');
      expect(data.users).toBe(25);
      expect(data.policies).toBe(10);
    });

    test('should respect custom days parameter', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([]);
      mockUserCount.mockResolvedValueOnce(0);
      mockPolicyCount.mockResolvedValueOnce(0);

      const result = await executeReadTool('get_analytics_summary', { days: 30 }, context);

      expect(result.success).toBe(true);

      const data = result.data as { period: { days: number } };
      expect(data.period.days).toBe(30);
    });

    test('should scope audit log query to organizationId and time range', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([]);
      mockUserCount.mockResolvedValueOnce(0);
      mockPolicyCount.mockResolvedValueOnce(0);

      await executeReadTool('get_analytics_summary', { days: 7 }, context);

      expect(mockAuditLogGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['decision'],
          where: expect.objectContaining({
            organizationId: 'org-1',
            timestamp: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
          _count: { id: true },
        }),
      );
    });

    test('should scope user count query to organizationId', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([]);
      mockUserCount.mockResolvedValueOnce(0);
      mockPolicyCount.mockResolvedValueOnce(0);

      await executeReadTool('get_analytics_summary', {}, context);

      expect(mockUserCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
        },
      });
    });

    test('should scope policy count query to organizationId', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([]);
      mockUserCount.mockResolvedValueOnce(0);
      mockPolicyCount.mockResolvedValueOnce(0);

      await executeReadTool('get_analytics_summary', {}, context);

      expect(mockPolicyCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
        },
      });
    });

    test('should handle zero tool calls', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([]);
      mockUserCount.mockResolvedValueOnce(5);
      mockPolicyCount.mockResolvedValueOnce(3);

      const result = await executeReadTool('get_analytics_summary', {}, context);

      expect(result.success).toBe(true);

      const data = result.data as {
        toolCalls: { total: number; allowed: number; denied: number; denialRate: string };
      };

      expect(data.toolCalls.total).toBe(0);
      expect(data.toolCalls.allowed).toBe(0);
      expect(data.toolCalls.denied).toBe(0);
      expect(data.toolCalls.denialRate).toBe('0%');
    });

    test('should handle only allowed calls', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([{ decision: 'ALLOW', _count: { id: 100 } }]);
      mockUserCount.mockResolvedValueOnce(10);
      mockPolicyCount.mockResolvedValueOnce(5);

      const result = await executeReadTool('get_analytics_summary', {}, context);

      expect(result.success).toBe(true);

      const data = result.data as {
        toolCalls: { total: number; allowed: number; denied: number; denialRate: string };
      };

      expect(data.toolCalls.total).toBe(100);
      expect(data.toolCalls.allowed).toBe(100);
      expect(data.toolCalls.denied).toBe(0);
      expect(data.toolCalls.denialRate).toBe('0.0%');
    });

    test('should handle only denied calls', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([{ decision: 'DENIED', _count: { id: 50 } }]);
      mockUserCount.mockResolvedValueOnce(3);
      mockPolicyCount.mockResolvedValueOnce(2);

      const result = await executeReadTool('get_analytics_summary', {}, context);

      expect(result.success).toBe(true);

      const data = result.data as {
        toolCalls: { total: number; allowed: number; denied: number; denialRate: string };
      };

      expect(data.toolCalls.total).toBe(50);
      expect(data.toolCalls.allowed).toBe(0);
      expect(data.toolCalls.denied).toBe(50);
      expect(data.toolCalls.denialRate).toBe('100.0%');
    });

    test('should include startDate in period', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([]);
      mockUserCount.mockResolvedValueOnce(0);
      mockPolicyCount.mockResolvedValueOnce(0);

      const result = await executeReadTool('get_analytics_summary', { days: 14 }, context);

      expect(result.success).toBe(true);

      const data = result.data as { period: { startDate: string } };

      // startDate should be a valid ISO string
      expect(data.period.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should handle different organization context', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([]);
      mockUserCount.mockResolvedValueOnce(0);
      mockPolicyCount.mockResolvedValueOnce(0);

      const differentContext: ToolContext = { organizationId: 'org-different' };
      await executeReadTool('get_analytics_summary', {}, differentContext);

      expect(mockAuditLogGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-different',
          }),
        }),
      );

      expect(mockUserCount).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'org-different',
        }),
      });

      expect(mockPolicyCount).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'org-different',
        }),
      });
    });

    test('should calculate denial rate with precision', async () => {
      mockAuditLogGroupBy.mockResolvedValueOnce([
        { decision: 'ALLOW', _count: { id: 667 } },
        { decision: 'DENIED', _count: { id: 333 } },
      ]);
      mockUserCount.mockResolvedValueOnce(10);
      mockPolicyCount.mockResolvedValueOnce(5);

      const result = await executeReadTool('get_analytics_summary', {}, context);

      expect(result.success).toBe(true);

      const data = result.data as { toolCalls: { denialRate: string } };

      // 333 / 1000 = 33.3%
      expect(data.toolCalls.denialRate).toBe('33.3%');
    });
  });
});
