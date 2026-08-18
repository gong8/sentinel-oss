/**
 * Tests for Audit Service
 * Tests all functions for logging and retrieving tool invocation audit logs
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks to avoid initialization order issues
const { mockCreate, mockCount, mockFindMany, mockApprovalFindMany, mockApprovalUpdateMany } =
  vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockCount: vi.fn(),
    mockFindMany: vi.fn(),
    mockApprovalFindMany: vi.fn(),
    mockApprovalUpdateMany: vi.fn(),
  }));

vi.mock('@sentinel/db', () => ({
  prisma: {
    auditLogEntry: {
      create: mockCreate,
      count: mockCount,
      findMany: mockFindMany,
    },
    sensitiveFlagApprovalRequest: {
      findMany: mockApprovalFindMany,
      updateMany: mockApprovalUpdateMany,
    },
  },
  AuditDecision: {
    ALLOWED: 'ALLOWED',
    DENIED: 'DENIED',
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

import { AuditDecision } from '@sentinel/db';
import { logger } from '../../../../packages/api/src/lib/logger.js';
import { getAuditLogs, logToolInvocation } from '../../../../packages/api/src/services/audit.js';

const mockLogger = vi.mocked(logger);

beforeAll(() => {
  console.log('🧪 Audit service test suite starting...');
});

afterAll(() => {
  console.log('✅ Audit service test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('audit', () => {
  describe('logToolInvocation', () => {
    const baseLogData = {
      organizationId: 'org-123',
      userId: 'user-456',
      agentId: 'agent-789',
      toolName: 'github.com::createPR',
      parameters: { repo: 'test/repo', title: 'Test PR' },
      decision: AuditDecision.ALLOWED,
      policyIds: ['policy-1', 'policy-2'],
    };

    test('should create audit log entry with required fields', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation(baseLogData);

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          userId: 'user-456',
          agentId: 'agent-789',
          toolName: 'github.com::createPR',
          parameters: { repo: 'test/repo', title: 'Test PR' },
          decision: 'ALLOWED',
          justification: undefined,
          policyIds: ['policy-1', 'policy-2'],
          matchedPolicyIds: ['policy-1', 'policy-2'],
          policySnapshot: undefined,
          userEmail: undefined,
          userRoles: [],
          agentName: undefined,
          mcpServerName: undefined,
          toolNameDisplay: undefined,
          // New pipeline fields
          evaluationTree: undefined,
          flagBehaviors: [],
          flagCheckPassed: undefined,
          interruptedAt: undefined,
          interruptionReason: undefined,
          matchedFlagIds: [],
          pipelineStage: undefined,
          policyCheckPassed: undefined,
          rateLimitHit: undefined,
          serverTrusted: undefined,
          trustCheckPassed: undefined,
          // Live approval tracking fields
          approvalRequired: false,
          approvalRequestId: undefined,
          approvalStatus: undefined,
          approvalDecidedBy: undefined,
          approvalDecidedByEmail: undefined,
          approvalDecidedAt: undefined,
        },
      });
    });

    test('should create audit log entry with all optional fields', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const fullData = {
        ...baseLogData,
        justification: 'Matched admin policy',
        matchedPolicyIds: ['policy-1'],
        policySnapshot: [{ id: 'policy-1', effect: 'ALLOW' }],
        userEmail: 'user@example.com',
        userRoles: ['Admin', 'Developer'],
        agentName: 'Test Agent',
        mcpServerName: 'GitHub MCP',
        toolNameDisplay: 'Create Pull Request',
      };

      await logToolInvocation(fullData);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          justification: 'Matched admin policy',
          matchedPolicyIds: ['policy-1'],
          policySnapshot: [{ id: 'policy-1', effect: 'ALLOW' }],
          userEmail: 'user@example.com',
          userRoles: ['Admin', 'Developer'],
          agentName: 'Test Agent',
          mcpServerName: 'GitHub MCP',
          toolNameDisplay: 'Create Pull Request',
        }),
      });
    });

    test('should not throw when database error occurs', async () => {
      mockCreate.mockRejectedValue(new Error('Database connection failed'));

      // Should not throw - audit logging should never block operations
      await expect(logToolInvocation(baseLogData)).resolves.toBeUndefined();
    });

    test('should log error when database error occurs', async () => {
      const dbError = new Error('Database connection failed');
      mockCreate.mockRejectedValue(dbError);

      await logToolInvocation(baseLogData);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create audit log entry:', dbError);
    });

    test('should handle null userId', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        userId: null,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
        }),
      });
    });

    test('should handle null agentId', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        agentId: null,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: null,
        }),
      });
    });

    test('should handle null justification', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        justification: null,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          justification: null,
        }),
      });
    });

    test('should use policyIds as default for matchedPolicyIds when not provided', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        matchedPolicyIds: undefined,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          policyIds: ['policy-1', 'policy-2'],
          matchedPolicyIds: ['policy-1', 'policy-2'],
        }),
      });
    });

    test('should use explicit matchedPolicyIds when provided', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        matchedPolicyIds: ['policy-1'],
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          policyIds: ['policy-1', 'policy-2'],
          matchedPolicyIds: ['policy-1'],
        }),
      });
    });

    test('should handle null policySnapshot', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        policySnapshot: null,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          policySnapshot: undefined,
        }),
      });
    });

    test('should default userRoles to empty array when not provided', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        userRoles: undefined,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userRoles: [],
        }),
      });
    });

    test('should handle complex parameters JSON', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const complexParams = {
        files: [
          { path: 'src/index.ts', content: 'console.log("test")' },
          { path: 'package.json', content: '{}' },
        ],
        metadata: {
          branch: 'feature/test',
          commit: 'abc123',
          reviewers: ['user1', 'user2'],
        },
      };

      await logToolInvocation({
        ...baseLogData,
        parameters: complexParams,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parameters: complexParams,
        }),
      });
    });

    test('should handle all decision types', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const decisions = [AuditDecision.ALLOWED, AuditDecision.DENIED];

      for (const decision of decisions) {
        await logToolInvocation({ ...baseLogData, decision });
      }

      expect(mockCreate).toHaveBeenCalledTimes(decisions.length);
    });

    test('should handle empty policyIds array', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        policyIds: [],
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          policyIds: [],
          matchedPolicyIds: [],
        }),
      });
    });
  });

  describe('getAuditLogs', () => {
    const baseFilters = {
      organizationId: 'org-123',
    };

    const mockLogEntry = {
      id: 'log-1',
      organizationId: 'org-123',
      userId: 'user-456',
      agentId: 'agent-789',
      toolName: 'github.com::createPR',
      parameters: { repo: 'test/repo' },
      decision: 'ALLOWED',
      justification: null,
      policyIds: ['policy-1'],
      timestamp: new Date('2024-01-15'),
      user: {
        email: 'user@example.com',
      },
      agent: {
        name: 'Test Agent',
      },
    };

    test('should fetch logs with organization filter only', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const result = await getAuditLogs(baseFilters);

      expect(mockCount).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
      });
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        orderBy: { timestamp: 'desc' },
        take: 50,
        skip: 0,
        include: {
          user: {
            select: {
              email: true,
            },
          },
          agent: {
            select: {
              name: true,
            },
          },
        },
      });
      expect(result).toEqual({
        total: 1,
        entries: [mockLogEntry],
      });
    });

    test('should filter by userId', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        userId: 'user-456',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          userId: 'user-456',
        },
      });
    });

    test('should filter by userEmail when userId not provided', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        userEmail: 'user@example.com',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          userEmail: { contains: 'user@example.com', mode: 'insensitive' },
        },
      });
    });

    test('should prefer userId over userEmail when both provided', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        userId: 'user-456',
        userEmail: 'user@example.com',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          userId: 'user-456',
        },
      });
    });

    test('should filter by agentId', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        agentId: 'agent-789',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          agentId: 'agent-789',
        },
      });
    });

    test('should filter by agentName when agentId not provided', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        agentName: 'Test Agent',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          agentName: { contains: 'Test Agent', mode: 'insensitive' },
        },
      });
    });

    test('should prefer agentId over agentName when both provided', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        agentId: 'agent-789',
        agentName: 'Test Agent',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          agentId: 'agent-789',
        },
      });
    });

    test('should filter by toolName with contains', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        toolName: 'createPR',
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          toolName: { contains: 'createPR' },
        },
      });
    });

    test('should filter by decision', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs({
        ...baseFilters,
        decision: AuditDecision.DENIED,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          decision: 'DENIED',
        },
      });
    });

    test('should filter by startDate only', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const startDate = new Date('2024-01-01');
      await getAuditLogs({
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
      await getAuditLogs({
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
      await getAuditLogs({
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

      await getAuditLogs({
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

      await getAuditLogs({
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

      await getAuditLogs(baseFilters);

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
      await getAuditLogs({
        organizationId: 'org-123',
        userId: 'user-456',
        agentId: 'agent-789',
        toolName: 'createPR',
        decision: AuditDecision.ALLOWED,
        startDate,
        endDate,
        limit: 10,
        offset: 5,
      });

      expect(mockCount).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          userId: 'user-456',
          agentId: 'agent-789',
          toolName: { contains: 'createPR' },
          decision: 'ALLOWED',
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

      const result = await getAuditLogs(baseFilters);

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

      const result = await getAuditLogs(baseFilters);

      expect(result.total).toBe(3);
      expect(result.entries).toHaveLength(3);
    });

    test('should include user in results', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const result = await getAuditLogs(baseFilters);

      expect(result.entries[0].user).toEqual({
        email: 'user@example.com',
      });
    });

    test('should include agent in results', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      const result = await getAuditLogs(baseFilters);

      expect(result.entries[0].agent).toEqual({
        name: 'Test Agent',
      });
    });

    test('should order by timestamp descending', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([mockLogEntry]);

      await getAuditLogs(baseFilters);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
        }),
      );
    });

    test('should handle null user relation', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([{ ...mockLogEntry, user: null }]);

      const result = await getAuditLogs(baseFilters);

      expect(result.entries[0].user).toBeNull();
    });

    test('should handle null agent relation', async () => {
      mockCount.mockResolvedValue(1);
      mockFindMany.mockResolvedValue([{ ...mockLogEntry, agent: null }]);

      const result = await getAuditLogs(baseFilters);

      expect(result.entries[0].agent).toBeNull();
    });

    describe('approval status handling', () => {
      const mockLogEntryWithApproval = {
        ...mockLogEntry,
        approvalRequired: true,
        approvalRequestId: 'approval-123',
        approvalStatus: 'PENDING',
      };

      test('should not fetch approval statuses when no pending approvals exist', async () => {
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([
          { ...mockLogEntry, approvalRequestId: null, approvalStatus: null },
        ]);

        await getAuditLogs(baseFilters);

        expect(mockApprovalFindMany).not.toHaveBeenCalled();
      });

      test('should not fetch approval statuses when approvals are not pending', async () => {
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([
          { ...mockLogEntry, approvalRequestId: 'approval-123', approvalStatus: 'APPROVED' },
        ]);

        await getAuditLogs(baseFilters);

        expect(mockApprovalFindMany).not.toHaveBeenCalled();
      });

      test('should fetch and update approval statuses for pending requests', async () => {
        const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([mockLogEntryWithApproval]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-123', status: 'APPROVED', expiresAt: futureDate },
        ]);

        const result = await getAuditLogs(baseFilters);

        expect(mockApprovalFindMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-123'] }, organizationId: 'org-123' },
          select: { id: true, status: true, expiresAt: true },
        });
        expect(result.entries[0].approvalStatus).toBe('APPROVED');
      });

      test('should mark expired pending requests as EXPIRED in database', async () => {
        const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([mockLogEntryWithApproval]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-123', status: 'PENDING', expiresAt: pastDate },
        ]);
        mockApprovalUpdateMany.mockResolvedValue({ count: 1 });

        const result = await getAuditLogs(baseFilters);

        expect(mockApprovalUpdateMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-123'] }, organizationId: 'org-123' },
          data: { status: 'EXPIRED' },
        });
        expect(result.entries[0].approvalStatus).toBe('EXPIRED');
      });

      test('should not update database when no expired requests exist', async () => {
        const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([mockLogEntryWithApproval]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-123', status: 'PENDING', expiresAt: futureDate },
        ]);

        await getAuditLogs(baseFilters);

        // organizationId is included in the query even though no update happens
        expect(mockApprovalFindMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-123'] }, organizationId: 'org-123' },
          select: { id: true, status: true, expiresAt: true },
        });
        expect(mockApprovalUpdateMany).not.toHaveBeenCalled();
      });

      test('should handle multiple pending approval requests', async () => {
        const futureDate = new Date(Date.now() + 3600000);
        const pastDate = new Date(Date.now() - 3600000);
        mockCount.mockResolvedValue(3);
        mockFindMany.mockResolvedValue([
          {
            ...mockLogEntry,
            id: 'log-1',
            approvalRequestId: 'approval-1',
            approvalStatus: 'PENDING',
          },
          {
            ...mockLogEntry,
            id: 'log-2',
            approvalRequestId: 'approval-2',
            approvalStatus: 'PENDING',
          },
          {
            ...mockLogEntry,
            id: 'log-3',
            approvalRequestId: 'approval-3',
            approvalStatus: 'PENDING',
          },
        ]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-1', status: 'APPROVED', expiresAt: futureDate },
          { id: 'approval-2', status: 'PENDING', expiresAt: pastDate }, // expired
          { id: 'approval-3', status: 'DENIED', expiresAt: futureDate },
        ]);
        mockApprovalUpdateMany.mockResolvedValue({ count: 1 });

        const result = await getAuditLogs(baseFilters);

        expect(mockApprovalFindMany).toHaveBeenCalledWith({
          where: {
            id: { in: ['approval-1', 'approval-2', 'approval-3'] },
            organizationId: 'org-123',
          },
          select: { id: true, status: true, expiresAt: true },
        });
        expect(mockApprovalUpdateMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-2'] }, organizationId: 'org-123' },
          data: { status: 'EXPIRED' },
        });
        expect(result.entries[0].approvalStatus).toBe('APPROVED');
        expect(result.entries[1].approvalStatus).toBe('EXPIRED');
        expect(result.entries[2].approvalStatus).toBe('DENIED');
      });

      test('should preserve original status for entries without approvalRequestId', async () => {
        mockCount.mockResolvedValue(2);
        mockFindMany.mockResolvedValue([
          { ...mockLogEntry, id: 'log-1', approvalRequestId: null, approvalStatus: null },
          {
            ...mockLogEntry,
            id: 'log-2',
            approvalRequestId: 'approval-1',
            approvalStatus: 'PENDING',
          },
        ]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-1', status: 'APPROVED', expiresAt: new Date(Date.now() + 3600000) },
        ]);

        const result = await getAuditLogs(baseFilters);

        expect(mockApprovalFindMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-1'] }, organizationId: 'org-123' },
          select: { id: true, status: true, expiresAt: true },
        });
        expect(result.entries[0].approvalStatus).toBeNull();
        expect(result.entries[1].approvalStatus).toBe('APPROVED');
      });

      test('should handle mix of pending and non-pending entries', async () => {
        mockCount.mockResolvedValue(3);
        mockFindMany.mockResolvedValue([
          {
            ...mockLogEntry,
            id: 'log-1',
            approvalRequestId: 'approval-1',
            approvalStatus: 'APPROVED',
          },
          {
            ...mockLogEntry,
            id: 'log-2',
            approvalRequestId: 'approval-2',
            approvalStatus: 'PENDING',
          },
          {
            ...mockLogEntry,
            id: 'log-3',
            approvalRequestId: 'approval-3',
            approvalStatus: 'DENIED',
          },
        ]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-2', status: 'APPROVED', expiresAt: new Date(Date.now() + 3600000) },
        ]);

        const result = await getAuditLogs(baseFilters);

        // Only approval-2 was pending, so only it should be fetched
        expect(mockApprovalFindMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-2'] }, organizationId: 'org-123' },
          select: { id: true, status: true, expiresAt: true },
        });
        // Non-pending entries should keep their original status
        expect(result.entries[0].approvalStatus).toBe('APPROVED');
        expect(result.entries[1].approvalStatus).toBe('APPROVED');
        expect(result.entries[2].approvalStatus).toBe('DENIED');
      });

      test('should handle entry where approval request is not found', async () => {
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([mockLogEntryWithApproval]);
        mockApprovalFindMany.mockResolvedValue([]); // No matching approval request found

        const result = await getAuditLogs(baseFilters);

        expect(mockApprovalFindMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-123'] }, organizationId: 'org-123' },
          select: { id: true, status: true, expiresAt: true },
        });
        // When approval request not found, status should remain as original (PENDING)
        expect(result.entries[0].approvalStatus).toBe('PENDING');
      });

      test('should filter out null approvalRequestIds when collecting pending requests', async () => {
        mockCount.mockResolvedValue(2);
        mockFindMany.mockResolvedValue([
          { ...mockLogEntry, id: 'log-1', approvalRequestId: null, approvalStatus: 'PENDING' },
          {
            ...mockLogEntry,
            id: 'log-2',
            approvalRequestId: 'approval-1',
            approvalStatus: 'PENDING',
          },
        ]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-1', status: 'APPROVED', expiresAt: new Date(Date.now() + 3600000) },
        ]);

        const result = await getAuditLogs(baseFilters);

        // Should only query for approval-1, not include null
        expect(mockApprovalFindMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-1'] }, organizationId: 'org-123' },
          select: { id: true, status: true, expiresAt: true },
        });
        expect(result.entries[0].approvalStatus).toBe('PENDING'); // No update for null approvalRequestId
        expect(result.entries[1].approvalStatus).toBe('APPROVED');
      });

      test('should handle multiple expired requests in single update', async () => {
        const pastDate = new Date(Date.now() - 3600000);
        mockCount.mockResolvedValue(2);
        mockFindMany.mockResolvedValue([
          {
            ...mockLogEntry,
            id: 'log-1',
            approvalRequestId: 'approval-1',
            approvalStatus: 'PENDING',
          },
          {
            ...mockLogEntry,
            id: 'log-2',
            approvalRequestId: 'approval-2',
            approvalStatus: 'PENDING',
          },
        ]);
        mockApprovalFindMany.mockResolvedValue([
          { id: 'approval-1', status: 'PENDING', expiresAt: pastDate },
          { id: 'approval-2', status: 'PENDING', expiresAt: pastDate },
        ]);
        mockApprovalUpdateMany.mockResolvedValue({ count: 2 });

        const result = await getAuditLogs(baseFilters);

        expect(mockApprovalUpdateMany).toHaveBeenCalledWith({
          where: { id: { in: ['approval-1', 'approval-2'] }, organizationId: 'org-123' },
          data: { status: 'EXPIRED' },
        });
        expect(result.entries[0].approvalStatus).toBe('EXPIRED');
        expect(result.entries[1].approvalStatus).toBe('EXPIRED');
      });
    });
  });

  describe('logToolInvocation with approval tracking fields', () => {
    const baseLogData = {
      organizationId: 'org-123',
      userId: 'user-456',
      agentId: 'agent-789',
      toolName: 'github.com::createPR',
      parameters: { repo: 'test/repo', title: 'Test PR' },
      decision: AuditDecision.ALLOWED,
      policyIds: ['policy-1'],
    };

    test('should create audit log entry with approval tracking fields', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      const approvalDecidedAt = new Date('2024-01-15T10:00:00Z');
      await logToolInvocation({
        ...baseLogData,
        approvalRequired: true,
        approvalRequestId: 'approval-123',
        approvalStatus: 'APPROVED',
        approvalDecidedBy: 'admin-user-456',
        approvalDecidedByEmail: 'admin@example.com',
        approvalDecidedAt,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          approvalRequired: true,
          approvalRequestId: 'approval-123',
          approvalStatus: 'APPROVED',
          approvalDecidedBy: 'admin-user-456',
          approvalDecidedByEmail: 'admin@example.com',
          approvalDecidedAt,
        }),
      });
    });

    test('should default approvalRequired to false when not provided', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation(baseLogData);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          approvalRequired: false,
        }),
      });
    });

    test('should handle explicit false for approvalRequired', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        approvalRequired: false,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          approvalRequired: false,
        }),
      });
    });

    test('should handle null approval decision fields', async () => {
      mockCreate.mockResolvedValue({ id: 'log-1' });

      await logToolInvocation({
        ...baseLogData,
        approvalRequired: true,
        approvalRequestId: 'approval-123',
        approvalStatus: 'PENDING',
        approvalDecidedBy: null,
        approvalDecidedByEmail: null,
        approvalDecidedAt: null,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          approvalRequired: true,
          approvalRequestId: 'approval-123',
          approvalStatus: 'PENDING',
          approvalDecidedBy: null,
          approvalDecidedByEmail: null,
          approvalDecidedAt: null,
        }),
      });
    });
  });
});
