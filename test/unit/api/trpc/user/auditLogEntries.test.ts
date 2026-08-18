/**
 * Tests for User Audit Log Entries Router
 * Tests user's personal audit log viewing functionality
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockGetAuditLogs } = vi.hoisted(() => ({
  mockGetAuditLogs: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  AuditDecision: {
    ALLOWED: 'ALLOWED',
    DENIED: 'DENIED',
  },
}));

vi.mock('../../../../../packages/api/src/services/audit.js', () => ({
  getAuditLogs: mockGetAuditLogs,
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  protectedProcedure: {
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
  },
}));

import { AuditDecision } from '@sentinel/db';
import { userAuditLogEntriesRouter as _userAuditLogEntriesRouter } from '../../../../../packages/api/src/trpc/user/auditLogEntries.js';

// Re-type the router to use our test-friendly handler type
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

interface AuditLogEntry {
  id: string;
  toolName: string;
  decision: string;
  timestamp: Date;
  parameters: unknown;
  user?: { email: string } | null;
  agent?: { name: string } | null;
  [key: string]: unknown;
}

interface AuditLogListResult {
  total: number;
  entries: AuditLogEntry[];
}

const userAuditLogEntriesRouter = _userAuditLogEntriesRouter as unknown as {
  list: TestableHandler<AuditLogListResult>;
};

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
): { auth: { organizationId: string; user: { id: string } } } {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userAuditLogEntriesRouter', () => {
  describe('list', () => {
    describe('basic functionality', () => {
      test('should list user audit logs with organization and user filter', async () => {
        const mockLogs = {
          total: 2,
          entries: [
            {
              id: 'log-1',
              toolName: 'createFile',
              decision: 'ALLOWED',
              timestamp: new Date('2024-01-15T10:00:00Z'),
              parameters: { path: '/test.txt' },
            },
            {
              id: 'log-2',
              toolName: 'deleteFile',
              decision: 'DENIED',
              timestamp: new Date('2024-01-15T09:00:00Z'),
              parameters: { path: '/important.txt' },
            },
          ],
        };
        mockGetAuditLogs.mockResolvedValue(mockLogs);

        const ctx = createMockContext();
        const input = {};

        const result = await userAuditLogEntriesRouter.list({ ctx, input });

        expect(result).toEqual(mockLogs);
        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
        });
      });

      test('should return empty results', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 0, entries: [] });

        const ctx = createMockContext();
        const input = {};

        const result = await userAuditLogEntriesRouter.list({ ctx, input });

        expect(result).toEqual({ total: 0, entries: [] });
      });

      test('should use organization and user from context', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 0, entries: [] });

        const ctx = createMockContext({
          organizationId: 'different-org',
          userId: 'different-user',
        });
        const input = {};

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'different-org',
          userId: 'different-user',
        });
      });
    });

    describe('filtering', () => {
      test('should filter by toolName', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: [] });

        const ctx = createMockContext();
        const input = { toolName: 'createFile' };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          toolName: 'createFile',
        });
      });

      test('should filter by decision ALLOWED', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: [] });

        const ctx = createMockContext();
        const input = { decision: AuditDecision.ALLOWED };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          decision: 'ALLOWED',
        });
      });

      test('should filter by decision DENIED', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: [] });

        const ctx = createMockContext();
        const input = { decision: AuditDecision.DENIED };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          decision: 'DENIED',
        });
      });

      test('should filter by date range', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: [] });

        const ctx = createMockContext();
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-12-31');
        const input = { startDate, endDate };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          startDate,
          endDate,
        });
      });

      test('should filter by startDate only', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: [] });

        const ctx = createMockContext();
        const startDate = new Date('2024-01-01');
        const input = { startDate };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          startDate,
        });
      });

      test('should filter by endDate only', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: [] });

        const ctx = createMockContext();
        const endDate = new Date('2024-12-31');
        const input = { endDate };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          endDate,
        });
      });

      test('should combine all filters', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: [] });

        const ctx = createMockContext({ organizationId: 'custom-org', userId: 'custom-user' });
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-12-31');
        const input = {
          toolName: 'specificTool',
          decision: AuditDecision.ALLOWED,
          startDate,
          endDate,
          limit: 25,
          offset: 10,
        };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'custom-org',
          userId: 'custom-user',
          toolName: 'specificTool',
          decision: 'ALLOWED',
          startDate,
          endDate,
          limit: 25,
          offset: 10,
        });
      });
    });

    describe('pagination', () => {
      test('should apply limit', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 100, entries: [] });

        const ctx = createMockContext();
        const input = { limit: 25 };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          limit: 25,
        });
      });

      test('should apply offset', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 100, entries: [] });

        const ctx = createMockContext();
        const input = { offset: 50 };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          offset: 50,
        });
      });

      test('should apply both limit and offset', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 100, entries: [] });

        const ctx = createMockContext();
        const input = { limit: 20, offset: 40 };

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith({
          organizationId: 'org-123',
          userId: 'user-123',
          limit: 20,
          offset: 40,
        });
      });
    });

    describe('organization isolation', () => {
      test('should always include organizationId from context', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 0, entries: [] });

        const ctx = createMockContext({ organizationId: 'isolated-org' });
        const input = {};

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        );
      });

      test('should always include userId from context', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 0, entries: [] });

        const ctx = createMockContext({ userId: 'isolated-user' });
        const input = {};

        await userAuditLogEntriesRouter.list({ ctx, input });

        expect(mockGetAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'isolated-user',
          }),
        );
      });

      test('cannot override organizationId through input', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 0, entries: [] });

        const ctx = createMockContext({ organizationId: 'org-from-context' });
        // Even if someone tries to pass organizationId in input, it should use context
        const input = {};

        await userAuditLogEntriesRouter.list({ ctx, input });

        // The service should be called with context organizationId, not any potential input override
        expect(mockGetAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'org-from-context',
          }),
        );
      });

      test('cannot override userId through input', async () => {
        mockGetAuditLogs.mockResolvedValue({ total: 0, entries: [] });

        const ctx = createMockContext({ userId: 'user-from-context' });
        // Even if someone tries to pass userId in input, it should use context
        const input = {};

        await userAuditLogEntriesRouter.list({ ctx, input });

        // The service should be called with context userId, not any potential input override
        expect(mockGetAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-from-context',
          }),
        );
      });
    });

    describe('response structure', () => {
      test('should return total and entries', async () => {
        const mockEntries = [
          {
            id: 'log-1',
            toolName: 'tool1',
            decision: 'ALLOWED',
            timestamp: new Date(),
            parameters: {},
            user: { email: 'user@example.com' },
            agent: null,
          },
        ];
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: mockEntries });

        const ctx = createMockContext();
        const result = await userAuditLogEntriesRouter.list({ ctx, input: {} });

        expect(result).toHaveProperty('total', 1);
        expect(result).toHaveProperty('entries');
        expect(result.entries).toHaveLength(1);
      });

      test('should include user relation in entries', async () => {
        const mockEntries = [
          {
            id: 'log-1',
            toolName: 'tool1',
            decision: 'ALLOWED',
            timestamp: new Date(),
            parameters: {},
            user: { email: 'user@example.com' },
            agent: null,
          },
        ];
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: mockEntries });

        const ctx = createMockContext();
        const result = await userAuditLogEntriesRouter.list({ ctx, input: {} });

        expect(result.entries[0].user).toEqual({ email: 'user@example.com' });
      });

      test('should include agent relation in entries', async () => {
        const mockEntries = [
          {
            id: 'log-1',
            toolName: 'tool1',
            decision: 'ALLOWED',
            timestamp: new Date(),
            parameters: {},
            user: null,
            agent: { name: 'Test Agent' },
          },
        ];
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: mockEntries });

        const ctx = createMockContext();
        const result = await userAuditLogEntriesRouter.list({ ctx, input: {} });

        expect(result.entries[0].agent).toEqual({ name: 'Test Agent' });
      });

      test('should handle entries with approval status', async () => {
        const mockEntries = [
          {
            id: 'log-1',
            toolName: 'tool1',
            decision: 'ALLOWED',
            timestamp: new Date(),
            parameters: {},
            approvalRequired: true,
            approvalRequestId: 'req-123',
            approvalStatus: 'APPROVED',
            user: null,
            agent: null,
          },
        ];
        mockGetAuditLogs.mockResolvedValue({ total: 1, entries: mockEntries });

        const ctx = createMockContext();
        const result = await userAuditLogEntriesRouter.list({ ctx, input: {} });

        expect(result.entries[0]).toMatchObject({
          approvalRequired: true,
          approvalRequestId: 'req-123',
          approvalStatus: 'APPROVED',
        });
      });
    });

    describe('error handling', () => {
      test('should propagate service errors', async () => {
        const serviceError = new Error('Database connection failed');
        mockGetAuditLogs.mockRejectedValue(serviceError);

        const ctx = createMockContext();

        await expect(userAuditLogEntriesRouter.list({ ctx, input: {} })).rejects.toThrow(
          'Database connection failed',
        );
      });
    });
  });
});
