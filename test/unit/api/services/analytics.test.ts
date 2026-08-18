/**
 * Unit tests for Analytics Service
 * Tests aggregated analytics data functions
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock Prisma
const mockPrisma = {
  $queryRaw: vi.fn(),
  auditLogEntry: {
    groupBy: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  agent: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
}));

describe('Analytics Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getToolUsageTimeSeries', () => {
    test('should return time series data with daily interval', async () => {
      const { getToolUsageTimeSeries } =
        await import('../../../../packages/api/src/services/analytics.js');

      const mockResults = [
        {
          bucket: new Date('2024-01-01'),
          total: BigInt(10),
          allowed: BigInt(8),
          denied: BigInt(2),
        },
        {
          bucket: new Date('2024-01-02'),
          total: BigInt(15),
          allowed: BigInt(12),
          denied: BigInt(3),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const result = await getToolUsageTimeSeries(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        'day',
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: new Date('2024-01-01'),
        count: 10,
        allowed: 8,
        denied: 2,
      });
      expect(result[1]).toEqual({
        timestamp: new Date('2024-01-02'),
        count: 15,
        allowed: 12,
        denied: 3,
      });
    });

    test('should return time series data with hourly interval', async () => {
      const { getToolUsageTimeSeries } =
        await import('../../../../packages/api/src/services/analytics.js');

      const mockResults = [
        {
          bucket: new Date('2024-01-01T00:00:00'),
          total: BigInt(5),
          allowed: BigInt(4),
          denied: BigInt(1),
        },
        {
          bucket: new Date('2024-01-01T01:00:00'),
          total: BigInt(3),
          allowed: BigInt(3),
          denied: BigInt(0),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const result = await getToolUsageTimeSeries(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-01-02'),
        'hour',
      );

      expect(result).toHaveLength(2);
      expect(result[0].count).toBe(5);
      expect(result[1].count).toBe(3);
    });

    test('should return empty array when no data', async () => {
      const { getToolUsageTimeSeries } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await getToolUsageTimeSeries(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(result).toEqual([]);
    });

    test('should convert BigInt values to numbers', async () => {
      const { getToolUsageTimeSeries } =
        await import('../../../../packages/api/src/services/analytics.js');

      const mockResults = [
        {
          bucket: new Date('2024-01-01'),
          total: BigInt(1000000),
          allowed: BigInt(999999),
          denied: BigInt(1),
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const result = await getToolUsageTimeSeries(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(typeof result[0].count).toBe('number');
      expect(result[0].count).toBe(1000000);
    });
  });

  describe('getTopUsers', () => {
    test('should return top users by invocation count', async () => {
      const { getTopUsers } = await import('../../../../packages/api/src/services/analytics.js');

      // New implementation: single groupBy with [userId, decision]
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { userId: 'user-1', decision: 'ALLOWED', _count: { id: 80 } },
        { userId: 'user-1', decision: 'DENIED', _count: { id: 20 } },
        { userId: 'user-2', decision: 'ALLOWED', _count: { id: 45 } },
        { userId: 'user-2', decision: 'DENIED', _count: { id: 5 } },
      ]);

      // New implementation: batch fetch with findMany
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', email: 'user1@test.com' },
        { id: 'user-2', email: 'user2@test.com' },
      ]);

      const result = await getTopUsers('org-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        userId: 'user-1',
        email: 'user1@test.com',
        invocationCount: 100,
        allowedCount: 80,
        deniedCount: 20,
      });
    });

    test('should respect limit parameter', async () => {
      const { getTopUsers } = await import('../../../../packages/api/src/services/analytics.js');

      // Return 3 users worth of data, but limit to 2
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { userId: 'user-1', decision: 'ALLOWED', _count: { id: 100 } },
        { userId: 'user-2', decision: 'ALLOWED', _count: { id: 50 } },
        { userId: 'user-3', decision: 'ALLOWED', _count: { id: 25 } },
      ]);

      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', email: 'user1@test.com' },
        { id: 'user-2', email: 'user2@test.com' },
      ]);

      const result = await getTopUsers('org-123', 2);

      // Limit is applied in-memory after aggregation
      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user-1');
      expect(result[1].userId).toBe('user-2');
    });

    test('should filter by date range', async () => {
      const { getTopUsers } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await getTopUsers('org-123', 10, startDate, endDate);

      expect(mockPrisma.auditLogEntry.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });

    test('should handle unknown user', async () => {
      const { getTopUsers } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { userId: 'user-deleted', decision: 'ALLOWED', _count: { id: 50 } },
      ]);

      // User not found in batch fetch
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const result = await getTopUsers('org-123');

      expect(result[0].email).toBe('Unknown');
    });

    test('should skip null userIds', async () => {
      const { getTopUsers } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { userId: null, decision: 'ALLOWED', _count: { id: 100 } },
        { userId: 'user-1', decision: 'ALLOWED', _count: { id: 50 } },
      ]);

      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user-1', email: 'user1@test.com' }]);

      const result = await getTopUsers('org-123');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
    });

    test('should handle missing decision counts', async () => {
      const { getTopUsers } = await import('../../../../packages/api/src/services/analytics.js');

      // User with only ALLOWED decisions (no DENIED)
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { userId: 'user-1', decision: 'ALLOWED', _count: { id: 10 } },
      ]);

      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user-1', email: 'user@test.com' }]);

      const result = await getTopUsers('org-123');

      expect(result[0].allowedCount).toBe(10);
      expect(result[0].deniedCount).toBe(0);
    });
  });

  describe('getTopAgents', () => {
    test('should return top agents by invocation count', async () => {
      const { getTopAgents } = await import('../../../../packages/api/src/services/analytics.js');

      // New implementation: single groupBy with [agentId, decision]
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { agentId: 'agent-1', decision: 'ALLOWED', _count: { id: 180 } },
        { agentId: 'agent-1', decision: 'DENIED', _count: { id: 20 } },
        { agentId: 'agent-2', decision: 'ALLOWED', _count: { id: 90 } },
        { agentId: 'agent-2', decision: 'DENIED', _count: { id: 10 } },
      ]);

      // New implementation: batch fetch with findMany
      mockPrisma.agent.findMany.mockResolvedValueOnce([
        { id: 'agent-1', name: 'Agent One' },
        { id: 'agent-2', name: 'Agent Two' },
      ]);

      const result = await getTopAgents('org-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        agentId: 'agent-1',
        name: 'Agent One',
        invocationCount: 200,
        allowedCount: 180,
        deniedCount: 20,
      });
    });

    test('should handle unknown agent', async () => {
      const { getTopAgents } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { agentId: 'agent-deleted', decision: 'ALLOWED', _count: { id: 50 } },
      ]);

      // Agent not found in batch fetch
      mockPrisma.agent.findMany.mockResolvedValueOnce([]);

      const result = await getTopAgents('org-123');

      expect(result[0].name).toBe('Unknown');
    });

    test('should filter by date range', async () => {
      const { getTopAgents } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await getTopAgents('org-123', 10, startDate, endDate);

      expect(mockPrisma.auditLogEntry.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });

    test('should skip null agentIds', async () => {
      const { getTopAgents } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { agentId: null, decision: 'ALLOWED', _count: { id: 100 } },
      ]);

      const result = await getTopAgents('org-123');

      expect(result).toHaveLength(0);
    });
  });

  describe('getTopTools', () => {
    test('should return top tools by invocation count', async () => {
      const { getTopTools } = await import('../../../../packages/api/src/services/analytics.js');

      // New implementation: single groupBy with [toolName, decision]
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { toolName: 'github::createPR', decision: 'ALLOWED', _count: { id: 450 } },
        { toolName: 'github::createPR', decision: 'DENIED', _count: { id: 50 } },
        { toolName: 'slack::sendMessage', decision: 'ALLOWED', _count: { id: 280 } },
        { toolName: 'slack::sendMessage', decision: 'DENIED', _count: { id: 20 } },
      ]);

      const result = await getTopTools('org-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        toolName: 'github::createPR',
        invocationCount: 500,
        allowedCount: 450,
        deniedCount: 50,
      });
    });

    test('should respect limit parameter', async () => {
      const { getTopTools } = await import('../../../../packages/api/src/services/analytics.js');

      // Return 3 tools worth of data, but limit to 2
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { toolName: 'tool1', decision: 'ALLOWED', _count: { id: 100 } },
        { toolName: 'tool2', decision: 'ALLOWED', _count: { id: 50 } },
        { toolName: 'tool3', decision: 'ALLOWED', _count: { id: 25 } },
      ]);

      const result = await getTopTools('org-123', 2);

      // Limit is applied in-memory after aggregation
      expect(result).toHaveLength(2);
      expect(result[0].toolName).toBe('tool1');
      expect(result[1].toolName).toBe('tool2');
    });

    test('should filter by date range', async () => {
      const { getTopTools } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([]);

      const startDate = new Date('2024-01-01');

      await getTopTools('org-123', 10, startDate);

      expect(mockPrisma.auditLogEntry.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: startDate,
            },
          }),
        }),
      );
    });

    test('should return empty array when no tools', async () => {
      const { getTopTools } = await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([]);

      const result = await getTopTools('org-123');

      expect(result).toEqual([]);
    });
  });

  describe('getPeakUsageHours', () => {
    test('should return usage counts for all 24 hours', async () => {
      const { getPeakUsageHours } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.findMany.mockResolvedValue([
        { timestamp: new Date('2024-01-01T09:00:00') },
        { timestamp: new Date('2024-01-01T09:30:00') },
        { timestamp: new Date('2024-01-01T10:00:00') },
        { timestamp: new Date('2024-01-01T14:00:00') },
      ]);

      const result = await getPeakUsageHours('org-123');

      expect(result).toHaveLength(24);
      expect(result[9].count).toBe(2); // Hour 9 has 2 entries
      expect(result[10].count).toBe(1); // Hour 10 has 1 entry
      expect(result[14].count).toBe(1); // Hour 14 has 1 entry
      expect(result[0].count).toBe(0); // Hour 0 has 0 entries
    });

    test('should fill missing hours with zero', async () => {
      const { getPeakUsageHours } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const result = await getPeakUsageHours('org-123');

      expect(result).toHaveLength(24);
      result.forEach((hour) => {
        expect(hour.count).toBe(0);
      });
    });

    test('should filter by date range', async () => {
      const { getPeakUsageHours } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await getPeakUsageHours('org-123', startDate, endDate);

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });

    test('should return hours in order 0-23', async () => {
      const { getPeakUsageHours } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const result = await getPeakUsageHours('org-123');

      for (let i = 0; i < 24; i++) {
        expect(result[i].hour).toBe(i);
      }
    });
  });

  describe('getAnalyticsSummary', () => {
    test('should return complete analytics summary', async () => {
      const { getAnalyticsSummary } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.count.mockResolvedValue(1000);
      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([
        { decision: 'ALLOWED', _count: { id: 800 } },
        { decision: 'DENIED', _count: { id: 200 } },
      ]);
      mockPrisma.auditLogEntry.findMany
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }])
        .mockResolvedValueOnce([{ agentId: 'a1' }, { agentId: 'a2' }])
        .mockResolvedValueOnce([
          { toolName: 'tool1' },
          { toolName: 'tool2' },
          { toolName: 'tool3' },
          { toolName: 'tool4' },
        ]);

      const result = await getAnalyticsSummary('org-123');

      expect(result).toEqual({
        totalInvocations: 1000,
        allowedInvocations: 800,
        deniedInvocations: 200,
        denialRate: 20,
        uniqueUsers: 3,
        uniqueAgents: 2,
        uniqueTools: 4,
      });
    });

    test('should handle zero invocations', async () => {
      const { getAnalyticsSummary } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.count.mockResolvedValue(0);
      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([]);
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const result = await getAnalyticsSummary('org-123');

      expect(result).toEqual({
        totalInvocations: 0,
        allowedInvocations: 0,
        deniedInvocations: 0,
        denialRate: 0,
        uniqueUsers: 0,
        uniqueAgents: 0,
        uniqueTools: 0,
      });
    });

    test('should calculate denial rate correctly', async () => {
      const { getAnalyticsSummary } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.count.mockResolvedValue(400);
      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([
        { decision: 'ALLOWED', _count: { id: 300 } },
        { decision: 'DENIED', _count: { id: 100 } },
      ]);
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const result = await getAnalyticsSummary('org-123');

      expect(result.denialRate).toBe(25); // 100/400 * 100 = 25%
    });

    test('should filter by date range', async () => {
      const { getAnalyticsSummary } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.count.mockResolvedValue(0);
      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([]);
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await getAnalyticsSummary('org-123', startDate, endDate);

      expect(mockPrisma.auditLogEntry.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        }),
      });
    });

    test('should handle only allowed invocations', async () => {
      const { getAnalyticsSummary } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.count.mockResolvedValue(100);
      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([
        { decision: 'ALLOWED', _count: { id: 100 } },
      ]);
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const result = await getAnalyticsSummary('org-123');

      expect(result.allowedInvocations).toBe(100);
      expect(result.deniedInvocations).toBe(0);
      expect(result.denialRate).toBe(0);
    });

    test('should handle only denied invocations', async () => {
      const { getAnalyticsSummary } =
        await import('../../../../packages/api/src/services/analytics.js');

      mockPrisma.auditLogEntry.count.mockResolvedValue(50);
      mockPrisma.auditLogEntry.groupBy.mockResolvedValue([
        { decision: 'DENIED', _count: { id: 50 } },
      ]);
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const result = await getAnalyticsSummary('org-123');

      expect(result.allowedInvocations).toBe(0);
      expect(result.deniedInvocations).toBe(50);
      expect(result.denialRate).toBe(100);
    });
  });
});
