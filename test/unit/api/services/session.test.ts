/**
 * Session Service Unit Tests
 * Tests for session lifecycle management and context tracking
 */

import { SessionContextEntryType, SessionStatus } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mock Prisma client for vi.mock hoisting to work correctly
const mockPrisma = vi.hoisted(() => ({
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  sessionContextEntry: {
    count: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('@sentinel/db', async () => {
  const actual = await vi.importActual('@sentinel/db');
  return {
    ...actual,
    prisma: mockPrisma,
  };
});

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
let getOrCreateSession: typeof import('../../../../packages/api/src/services/session.js').getOrCreateSession;
let getSessionContextForPolicy: typeof import('../../../../packages/api/src/services/session.js').getSessionContextForPolicy;
let addSessionContext: typeof import('../../../../packages/api/src/services/session.js').addSessionContext;
let updateContextSummary: typeof import('../../../../packages/api/src/services/session.js').updateContextSummary;
let incrementToolCallCount: typeof import('../../../../packages/api/src/services/session.js').incrementToolCallCount;
let markExpiredSessions: typeof import('../../../../packages/api/src/services/session.js').markExpiredSessions;
let cleanupExpiredSessions: typeof import('../../../../packages/api/src/services/session.js').cleanupExpiredSessions;
let cleanupExpiredContextEntries: typeof import('../../../../packages/api/src/services/session.js').cleanupExpiredContextEntries;
let getSessionById: typeof import('../../../../packages/api/src/services/session.js').getSessionById;
let terminateUserSessions: typeof import('../../../../packages/api/src/services/session.js').terminateUserSessions;
let isSessionTerminated: typeof import('../../../../packages/api/src/services/session.js').isSessionTerminated;
let getActiveSessionCount: typeof import('../../../../packages/api/src/services/session.js').getActiveSessionCount;
let listActiveSessions: typeof import('../../../../packages/api/src/services/session.js').listActiveSessions;
let terminateSession: typeof import('../../../../packages/api/src/services/session.js').terminateSession;

describe('Session Service', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    // Re-import module
    const module = await import('../../../../packages/api/src/services/session.js');
    getOrCreateSession = module.getOrCreateSession;
    getSessionContextForPolicy = module.getSessionContextForPolicy;
    addSessionContext = module.addSessionContext;
    updateContextSummary = module.updateContextSummary;
    incrementToolCallCount = module.incrementToolCallCount;
    markExpiredSessions = module.markExpiredSessions;
    cleanupExpiredSessions = module.cleanupExpiredSessions;
    cleanupExpiredContextEntries = module.cleanupExpiredContextEntries;
    getSessionById = module.getSessionById;
    terminateUserSessions = module.terminateUserSessions;
    isSessionTerminated = module.isSessionTerminated;
    getActiveSessionCount = module.getActiveSessionCount;
    listActiveSessions = module.listActiveSessions;
    terminateSession = module.terminateSession;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateSession', () => {
    test('should create new session if none exists', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce(null);
      mockPrisma.session.create.mockResolvedValueOnce({
        id: 'session-123',
      });

      const result = await getOrCreateSession({
        organizationId: 'org-1',
        externalSessionId: 'ext-session-1',
        userId: 'user-1',
        agentId: 'agent-1',
      });

      expect(result.id).toBe('session-123');
      expect(result.isNew).toBe(true);
      expect(mockPrisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            externalSessionId: 'ext-session-1',
            userId: 'user-1',
            agentId: 'agent-1',
            status: SessionStatus.ACTIVE,
          }),
        }),
      );
    });

    test('should return existing active session', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        status: SessionStatus.ACTIVE,
      });
      mockPrisma.session.update.mockResolvedValueOnce({
        id: 'session-123',
      });

      const result = await getOrCreateSession({
        organizationId: 'org-1',
        externalSessionId: 'ext-session-1',
      });

      expect(result.id).toBe('session-123');
      expect(result.isNew).toBe(false);
      expect(mockPrisma.session.create).not.toHaveBeenCalled();
      // Should update lastActivityAt
      expect(mockPrisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-123' },
          data: expect.objectContaining({
            lastActivityAt: expect.any(Date),
          }),
        }),
      );
    });

    test('should delete expired session and create new one (SM-001 fix)', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        status: SessionStatus.EXPIRED,
      });
      mockPrisma.session.delete.mockResolvedValueOnce({
        id: 'session-123',
      });
      mockPrisma.session.create.mockResolvedValueOnce({
        id: 'session-456',
      });

      const result = await getOrCreateSession({
        organizationId: 'org-1',
        externalSessionId: 'ext-session-1',
        userId: 'user-1',
        agentId: 'agent-1',
      });

      // EXPIRED sessions are now terminal - a new session should be created
      expect(result.id).toBe('session-456');
      expect(result.isNew).toBe(true);
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-123' },
      });
      expect(mockPrisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            externalSessionId: 'ext-session-1',
            userId: 'user-1',
            agentId: 'agent-1',
            status: SessionStatus.ACTIVE,
          }),
        }),
      );
    });

    test('should handle race condition (unique constraint failure)', async () => {
      const uniqueError = new Error(
        'Unique constraint failed on the fields: (`organizationId`,`externalSessionId`)',
      );
      mockPrisma.session.findUnique
        .mockResolvedValueOnce(null) // First check returns nothing
        .mockResolvedValueOnce({ id: 'session-123' }); // Second check returns session
      mockPrisma.session.create.mockRejectedValueOnce(uniqueError);

      const result = await getOrCreateSession({
        organizationId: 'org-1',
        externalSessionId: 'ext-session-1',
      });

      expect(result.id).toBe('session-123');
      expect(result.isNew).toBe(false);
    });

    test('should throw non-unique-constraint errors', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce(null);
      mockPrisma.session.create.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        getOrCreateSession({
          organizationId: 'org-1',
          externalSessionId: 'ext-session-1',
        }),
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getSessionContextForPolicy', () => {
    test('should return null if session not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce(null);

      const result = await getSessionContextForPolicy('org-1', 'ext-session-1');

      expect(result).toBeNull();
    });

    test('should return session context with entries', async () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

      mockPrisma.session.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        externalSessionId: 'ext-session-1',
        createdAt,
        contextSummary: 'User is querying database',
        toolCallCount: 5,
        status: SessionStatus.ACTIVE,
        contextEntries: [
          {
            key: 'primary_intent',
            value: 'Data analysis',
            summary: 'Analyzing sales data',
            entryType: SessionContextEntryType.USER_INTENT,
            importance: 0.8,
            sourceToolName: 'database::query',
            createdAt: now,
          },
          {
            key: 'data_sensitivity',
            value: { level: 'confidential' },
            summary: 'Accessed confidential data',
            entryType: SessionContextEntryType.DATA_ACCESSED,
            importance: 0.9,
            sourceToolName: 'database::query',
            createdAt: now,
          },
        ],
      });

      const result = await getSessionContextForPolicy('org-1', 'ext-session-1');

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('session-123');
      expect(result?.externalSessionId).toBe('ext-session-1');
      expect(result?.toolCallCount).toBe(5);
      expect(result?.contextSummary).toBe('User is querying database');
      expect(result?.status).toBe(SessionStatus.ACTIVE);
      expect(result?.sessionAge).toBeGreaterThanOrEqual(10);
      expect(result?.recentContext).toHaveLength(2);
      expect(result?.recentContext[0].key).toBe('primary_intent');
    });

    test('should return null on database error', async () => {
      mockPrisma.session.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const result = await getSessionContextForPolicy('org-1', 'ext-session-1');

      expect(result).toBeNull();
    });
  });

  describe('addSessionContext', () => {
    test('should add context entry when under limit', async () => {
      mockPrisma.sessionContextEntry.count.mockResolvedValueOnce(50);
      mockPrisma.sessionContextEntry.create.mockResolvedValueOnce({
        id: 'entry-1',
      });

      await addSessionContext({
        sessionId: 'session-123',
        entryType: SessionContextEntryType.USER_INTENT,
        key: 'primary_intent',
        value: 'Analyzing data',
        summary: 'User wants to analyze data',
        importance: 0.7,
        sourceToolName: 'database::query',
      });

      expect(mockPrisma.sessionContextEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'session-123',
            entryType: SessionContextEntryType.USER_INTENT,
            key: 'primary_intent',
            value: 'Analyzing data',
            summary: 'User wants to analyze data',
            importance: 0.7,
            sourceToolName: 'database::query',
          }),
        }),
      );
    });

    test('should prune old entries when at limit', async () => {
      mockPrisma.sessionContextEntry.count.mockResolvedValueOnce(100); // At limit
      mockPrisma.sessionContextEntry.findMany.mockResolvedValueOnce([
        { id: 'old-entry-1' },
        { id: 'old-entry-2' },
        { id: 'old-entry-3' },
      ]);
      mockPrisma.sessionContextEntry.deleteMany.mockResolvedValueOnce({ count: 3 });
      mockPrisma.sessionContextEntry.create.mockResolvedValueOnce({ id: 'entry-1' });

      await addSessionContext({
        sessionId: 'session-123',
        entryType: SessionContextEntryType.USER_INTENT,
        key: 'test',
        value: 'test',
      });

      expect(mockPrisma.sessionContextEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'session-123' },
          orderBy: [{ importance: 'asc' }, { createdAt: 'asc' }],
          take: 10, // 10% of 100
        }),
      );
      expect(mockPrisma.sessionContextEntry.deleteMany).toHaveBeenCalled();
    });

    test('should use default importance when not provided', async () => {
      mockPrisma.sessionContextEntry.count.mockResolvedValueOnce(0);
      mockPrisma.sessionContextEntry.create.mockResolvedValueOnce({ id: 'entry-1' });

      await addSessionContext({
        sessionId: 'session-123',
        entryType: SessionContextEntryType.TOOL_OUTCOME,
        key: 'outcome',
        value: { success: true },
      });

      expect(mockPrisma.sessionContextEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            importance: 0.5,
          }),
        }),
      );
    });

    test('should not throw on database error and return failure status (fail-safe)', async () => {
      mockPrisma.sessionContextEntry.count.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw, but should return failure status
      const result = await addSessionContext({
        sessionId: 'session-123',
        entryType: SessionContextEntryType.USER_INTENT,
        key: 'test',
        value: 'test',
      });
      expect(result).toEqual({ success: false });
    });
  });

  describe('updateContextSummary', () => {
    test('should update session context summary with org scoping', async () => {
      mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await updateContextSummary(
        'org-1',
        'session-123',
        'User is performing data analysis on sales metrics',
      );

      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-123', organizationId: 'org-1' },
        data: { contextSummary: 'User is performing data analysis on sales metrics' },
      });
    });

    test('should not throw on database error (fail-safe)', async () => {
      mockPrisma.session.updateMany.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        updateContextSummary('org-1', 'session-123', 'summary'),
      ).resolves.toBeUndefined();
    });

    test('should warn when session not found or wrong org', async () => {
      mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 0 });

      await updateContextSummary('org-1', 'session-123', 'summary');

      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-123', organizationId: 'org-1' },
        data: { contextSummary: 'summary' },
      });
    });
  });

  describe('incrementToolCallCount', () => {
    test('should increment tool call count', async () => {
      mockPrisma.session.update.mockResolvedValueOnce({ id: 'session-123' });

      await incrementToolCallCount('org-1', 'ext-session-1');

      expect(mockPrisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_externalSessionId: {
              organizationId: 'org-1',
              externalSessionId: 'ext-session-1',
            },
          },
          data: expect.objectContaining({
            toolCallCount: { increment: 1 },
            lastActivityAt: expect.any(Date),
          }),
        }),
      );
    });

    test('should not throw on database error (fail-safe)', async () => {
      mockPrisma.session.update.mockRejectedValueOnce(new Error('DB error'));

      await expect(incrementToolCallCount('org-1', 'ext-session-1')).resolves.toBeUndefined();
    });
  });

  describe('markExpiredSessions', () => {
    test('should mark active sessions past expiry as expired', async () => {
      mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 5 });

      const count = await markExpiredSessions();

      expect(count).toBe(5);
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          status: SessionStatus.ACTIVE,
          expiresAt: { lt: expect.any(Date) },
        },
        data: {
          status: SessionStatus.EXPIRED,
        },
      });
    });

    test('should return 0 when no sessions to mark', async () => {
      mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 0 });

      const count = await markExpiredSessions();

      expect(count).toBe(0);
    });

    test('should return 0 on database error', async () => {
      mockPrisma.session.updateMany.mockRejectedValueOnce(new Error('DB error'));

      const count = await markExpiredSessions();

      expect(count).toBe(0);
    });
  });

  describe('cleanupExpiredSessions', () => {
    test('should delete old expired sessions', async () => {
      mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 10 });

      const count = await cleanupExpiredSessions();

      expect(count).toBe(10);
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          status: SessionStatus.EXPIRED,
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });

    test('should return 0 on database error', async () => {
      mockPrisma.session.deleteMany.mockRejectedValueOnce(new Error('DB error'));

      const count = await cleanupExpiredSessions();

      expect(count).toBe(0);
    });
  });

  describe('cleanupExpiredContextEntries', () => {
    test('should delete expired context entries', async () => {
      mockPrisma.sessionContextEntry.deleteMany.mockResolvedValueOnce({ count: 25 });

      const count = await cleanupExpiredContextEntries();

      expect(count).toBe(25);
      expect(mockPrisma.sessionContextEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });

    test('should return 0 on database error', async () => {
      mockPrisma.sessionContextEntry.deleteMany.mockRejectedValueOnce(new Error('DB error'));

      const count = await cleanupExpiredContextEntries();

      expect(count).toBe(0);
    });
  });

  describe('getSessionById', () => {
    test('should return session by ID with organizationId validation', async () => {
      mockPrisma.session.findFirst.mockResolvedValueOnce({
        id: 'session-123',
        organizationId: 'org-1',
        externalSessionId: 'ext-session-1',
      });

      const result = await getSessionById('org-1', 'session-123');

      expect(result).toEqual({
        id: 'session-123',
        organizationId: 'org-1',
        externalSessionId: 'ext-session-1',
      });
      expect(mockPrisma.session.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'session-123',
          organizationId: 'org-1',
        },
        select: {
          id: true,
          organizationId: true,
          externalSessionId: true,
        },
      });
    });

    test('should return null if session not found', async () => {
      mockPrisma.session.findFirst.mockResolvedValueOnce(null);

      const result = await getSessionById('org-1', 'nonexistent');

      expect(result).toBeNull();
    });

    test('should return null if session belongs to different organization', async () => {
      mockPrisma.session.findFirst.mockResolvedValueOnce(null);

      const result = await getSessionById('org-2', 'session-123');

      expect(result).toBeNull();
      expect(mockPrisma.session.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'session-123',
          organizationId: 'org-2',
        },
        select: {
          id: true,
          organizationId: true,
          externalSessionId: true,
        },
      });
    });

    test('should return null on database error', async () => {
      mockPrisma.session.findFirst.mockRejectedValueOnce(new Error('DB error'));

      const result = await getSessionById('org-1', 'session-123');

      expect(result).toBeNull();
    });
  });

  describe('terminateUserSessions', () => {
    test('should terminate all active sessions for a user', async () => {
      mockPrisma.session.findMany.mockResolvedValueOnce([
        { id: 'session-1', externalSessionId: 'ext-1' },
        { id: 'session-2', externalSessionId: 'ext-2' },
      ]);
      mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 2 });

      const result = await terminateUserSessions('org-1', 'user-1', 'admin-1');

      expect(result.count).toBe(2);
      expect(result.sessionIds).toEqual(['ext-1', 'ext-2']);
      expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          userId: 'user-1',
          status: SessionStatus.ACTIVE,
          workspaceId: null,
        },
        select: { id: true, externalSessionId: true },
      });
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['session-1', 'session-2'] },
        },
        data: {
          status: SessionStatus.TERMINATED,
          terminatedAt: expect.any(Date),
          terminatedBy: 'admin-1',
        },
      });
    });

    test('should return empty result when no sessions to terminate', async () => {
      mockPrisma.session.findMany.mockResolvedValueOnce([]);

      const result = await terminateUserSessions('org-1', 'user-1', 'admin-1');

      expect(result.count).toBe(0);
      expect(result.sessionIds).toEqual([]);
      expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
    });

    test('should throw on database error', async () => {
      mockPrisma.session.findMany.mockRejectedValueOnce(new Error('DB error'));

      await expect(terminateUserSessions('org-1', 'user-1', 'admin-1')).rejects.toThrow('DB error');
    });
  });

  describe('isSessionTerminated', () => {
    test('should return true if session is terminated', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        status: SessionStatus.TERMINATED,
      });

      const result = await isSessionTerminated('org-1', 'ext-session-1');

      expect(result).toBe(true);
    });

    test('should return false if session is active', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        status: SessionStatus.ACTIVE,
      });

      const result = await isSessionTerminated('org-1', 'ext-session-1');

      expect(result).toBe(false);
    });

    test('should return false if session not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce(null);

      const result = await isSessionTerminated('org-1', 'ext-session-1');

      expect(result).toBe(false);
    });

    test('should return false on database error (fail open)', async () => {
      mockPrisma.session.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const result = await isSessionTerminated('org-1', 'ext-session-1');

      expect(result).toBe(false);
    });
  });

  describe('getActiveSessionCount', () => {
    test('should return count of active sessions', async () => {
      mockPrisma.session.count.mockResolvedValueOnce(5);

      const result = await getActiveSessionCount('org-1', 'user-1');

      expect(result).toBe(5);
      expect(mockPrisma.session.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          userId: 'user-1',
          status: SessionStatus.ACTIVE,
        },
      });
    });

    test('should return 0 on database error', async () => {
      mockPrisma.session.count.mockRejectedValueOnce(new Error('DB error'));

      const result = await getActiveSessionCount('org-1', 'user-1');

      expect(result).toBe(0);
    });
  });

  describe('listActiveSessions', () => {
    test('should return list of active sessions', async () => {
      const sessions = [
        {
          id: 'session-1',
          externalSessionId: 'ext-1',
          userId: 'user-1',
          agentId: 'agent-1',
          createdAt: new Date(),
          lastActivityAt: new Date(),
          toolCallCount: 10,
        },
      ];
      mockPrisma.session.findMany.mockResolvedValueOnce(sessions);

      const result = await listActiveSessions('org-1');

      expect(result).toEqual(sessions);
      expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: SessionStatus.ACTIVE,
          workspaceId: null,
        },
        select: {
          id: true,
          externalSessionId: true,
          userId: true,
          agentId: true,
          workspaceId: true,
          createdAt: true,
          lastActivityAt: true,
          toolCallCount: true,
        },
        orderBy: { lastActivityAt: 'desc' },
      });
    });

    test('should return empty array on database error', async () => {
      mockPrisma.session.findMany.mockRejectedValueOnce(new Error('DB error'));

      const result = await listActiveSessions('org-1');

      expect(result).toEqual([]);
    });
  });

  describe('terminateSession', () => {
    test('should terminate a specific session', async () => {
      mockPrisma.session.findFirst.mockResolvedValueOnce({
        id: 'session-123',
        externalSessionId: 'ext-1',
      });
      mockPrisma.session.update.mockResolvedValueOnce({ id: 'session-123' });

      const result = await terminateSession('org-1', 'session-123', 'admin-1');

      expect(result.success).toBe(true);
      expect(result.externalSessionId).toBe('ext-1');
      expect(mockPrisma.session.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'session-123',
          organizationId: 'org-1',
          status: SessionStatus.ACTIVE,
        },
        select: { id: true, externalSessionId: true },
      });
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-123' },
        data: {
          status: SessionStatus.TERMINATED,
          terminatedAt: expect.any(Date),
          terminatedBy: 'admin-1',
        },
      });
    });

    test('should return failure if session not found', async () => {
      mockPrisma.session.findFirst.mockResolvedValueOnce(null);

      const result = await terminateSession('org-1', 'session-123', 'admin-1');

      expect(result.success).toBe(false);
      expect(result.externalSessionId).toBeNull();
      expect(mockPrisma.session.update).not.toHaveBeenCalled();
    });

    test('should throw on database error', async () => {
      mockPrisma.session.findFirst.mockRejectedValueOnce(new Error('DB error'));

      await expect(terminateSession('org-1', 'session-123', 'admin-1')).rejects.toThrow('DB error');
    });
  });
});
