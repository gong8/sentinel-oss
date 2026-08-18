/**
 * Integration tests for Session Context Flow
 * Tests the full session context tracking flow
 */

import { prisma, SessionStatus } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addSessionContext,
  cleanupExpiredContextEntries,
  cleanupExpiredSessions,
  getOrCreateSession,
  getSessionContextForPolicy,
  incrementToolCallCount,
  markExpiredSessions,
  updateContextSummary,
} from '../../../packages/api/src/services/session.js';
import { SESSION_CONFIG } from '../../../packages/api/src/types/session.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestAdmin, createTestMcpServer, createTestUser } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Session Context Integration', () => {
  let tenant: TestTenant;
  let userId: string;
  let adminId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;

    const user = await createTestUser({ organizationId: tenant.orgId });
    userId = user.id;

    // Create MCP server and tools
    const mcpServer = await createTestMcpServer({
      organizationId: tenant.orgId,
      name: 'Database',
      url: 'https://database.example.com',
    });

    await prisma.mcpTool.createMany({
      data: [
        { mcpServerId: mcpServer.id, name: 'query', description: 'Execute SQL query' },
        { mcpServerId: mcpServer.id, name: 'execute', description: 'Execute SQL command' },
      ],
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await tenant.cleanup();
  });

  describe('Session Lifecycle', () => {
    test('should create new session', async () => {
      const result = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-1',
        userId,
      });

      expect(result.id).toBeTruthy();
      expect(result.isNew).toBe(true);

      // Verify session in database
      const session = await prisma.session.findUnique({
        where: { id: result.id },
      });

      expect(session).not.toBeNull();
      expect(session?.organizationId).toBe(tenant.orgId);
      expect(session?.externalSessionId).toBe('ext-session-1');
      expect(session?.status).toBe(SessionStatus.ACTIVE);
      expect(session?.toolCallCount).toBe(0);
    });

    test('should reuse existing active session', async () => {
      const result1 = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-2',
        userId,
      });

      const result2 = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-2',
        userId,
      });

      expect(result1.id).toBe(result2.id);
      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(false);
    });

    test('should create new session when previous session is expired (EXPIRED is terminal state)', async () => {
      // Create session
      const result1 = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-3',
        userId,
      });
      const originalSessionId = result1.id;

      // Manually expire it
      await prisma.session.update({
        where: { id: result1.id },
        data: {
          status: SessionStatus.EXPIRED,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      // Get session again - should create new session (EXPIRED is terminal)
      const result2 = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-3',
        userId,
      });

      // Should be a NEW session, not the same one (security: expired sessions cannot be reactivated)
      expect(result2.id).not.toBe(originalSessionId);
      expect(result2.isNew).toBe(true);

      // Verify new session is ACTIVE
      const newSession = await prisma.session.findUnique({
        where: { id: result2.id },
      });
      expect(newSession?.status).toBe(SessionStatus.ACTIVE);

      // Expired session is deleted to allow creating a new one with the same externalSessionId
      const oldSession = await prisma.session.findUnique({
        where: { id: originalSessionId },
      });
      expect(oldSession).toBeNull();
    });

    test('should track tool call count', async () => {
      const result = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-4',
        userId,
      });

      await incrementToolCallCount(tenant.orgId, 'ext-session-4');
      await incrementToolCallCount(tenant.orgId, 'ext-session-4');
      await incrementToolCallCount(tenant.orgId, 'ext-session-4');

      const session = await prisma.session.findUnique({
        where: { id: result.id },
      });

      expect(session?.toolCallCount).toBe(3);
    });
  });

  describe('Context Accumulation', () => {
    test('should add context entries to session', async () => {
      const { id: sessionId } = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-ctx-1',
        userId,
      });

      await addSessionContext({
        sessionId,
        entryType: 'USER_INTENT',
        key: 'fetch_users',
        value: { table: 'users' },
        summary: 'User wants to fetch user data',
        importance: 0.8,
        sourceToolName: 'database.example.com::query',
      });

      await addSessionContext({
        sessionId,
        entryType: 'DATA_ACCESSED',
        key: 'users_table',
        value: { level: 'confidential' },
        summary: 'Accessed user data',
        importance: 0.7,
        sourceToolName: 'database.example.com::query',
      });

      const entries = await prisma.sessionContextEntry.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      });

      expect(entries).toHaveLength(2);
      expect(entries[0].entryType).toBe('USER_INTENT');
      expect(entries[1].entryType).toBe('DATA_ACCESSED');
    });

    test('should update context summary with org scoping', async () => {
      const { id: sessionId } = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-ctx-2',
        userId,
      });

      await updateContextSummary(tenant.orgId, sessionId, 'User is querying sensitive data');

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      expect(session?.contextSummary).toBe('User is querying sensitive data');
    });

    test('should get session context for policy evaluation', async () => {
      const { id: sessionId } = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-ctx-3',
        userId,
      });

      // Add context entries
      await addSessionContext({
        sessionId,
        entryType: 'USER_INTENT',
        key: 'export_data',
        value: {},
        summary: 'Exporting customer data',
        importance: 0.9,
      });

      await addSessionContext({
        sessionId,
        entryType: 'RISK_SIGNAL',
        key: 'bulk_access',
        value: {},
        summary: 'Bulk data access detected',
        importance: 1.0,
      });

      await updateContextSummary(tenant.orgId, sessionId, 'User exporting bulk data');
      await incrementToolCallCount(tenant.orgId, 'ext-session-ctx-3');
      await incrementToolCallCount(tenant.orgId, 'ext-session-ctx-3');

      const context = await getSessionContextForPolicy(tenant.orgId, 'ext-session-ctx-3');

      expect(context).not.toBeNull();
      expect(context?.toolCallCount).toBe(2);
      expect(context?.contextSummary).toBe('User exporting bulk data');
      expect(context?.recentContext).toHaveLength(2);
      expect(context?.recentContext.some((e) => e.key === 'bulk_access')).toBe(true);
    });

    test('should limit context entries per session (prune oldest)', async () => {
      const { id: sessionId } = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-ctx-4',
        userId,
      });

      // Add MAX_CONTEXT_ENTRIES + 5 entries
      const totalEntries = SESSION_CONFIG.MAX_CONTEXT_ENTRIES_PER_SESSION + 5;

      for (let i = 0; i < totalEntries; i++) {
        await addSessionContext({
          sessionId,
          entryType: 'USER_INTENT',
          key: `intent_${i}`,
          value: { index: i },
          importance: 0.5,
        });
      }

      const entries = await prisma.sessionContextEntry.findMany({
        where: { sessionId },
      });

      // Pruning logic deletes 10% when limit is reached, so:
      // - At 100 entries, adding #101 prunes 10, then adds 1 = 91
      // - Entries 102-105 add 4 more = 95 total
      // Should be less than total added and <= MAX_CONTEXT_ENTRIES
      expect(entries.length).toBeLessThan(totalEntries);
      expect(entries.length).toBeLessThanOrEqual(SESSION_CONFIG.MAX_CONTEXT_ENTRIES_PER_SESSION);
    });
  });

  describe('Session Cleanup', () => {
    test('should mark expired sessions', async () => {
      // Create session with past expiry
      const session = await prisma.session.create({
        data: {
          organizationId: tenant.orgId,
          externalSessionId: 'ext-session-cleanup-1',
          userId,
          status: SessionStatus.ACTIVE,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      const markedCount = await markExpiredSessions();

      expect(markedCount).toBeGreaterThanOrEqual(1);

      const updated = await prisma.session.findUnique({
        where: { id: session.id },
      });

      expect(updated?.status).toBe(SessionStatus.EXPIRED);
    });

    test('should cleanup old expired sessions', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - SESSION_CONFIG.CLEANUP_EXPIRED_AFTER_DAYS - 1);

      // Create old expired session
      await prisma.session.create({
        data: {
          organizationId: tenant.orgId,
          externalSessionId: 'ext-session-cleanup-2',
          userId,
          status: SessionStatus.EXPIRED,
          expiresAt: oldDate,
        },
      });

      const deletedCount = await cleanupExpiredSessions();

      expect(deletedCount).toBeGreaterThanOrEqual(1);
    });

    test('should cleanup expired context entries', async () => {
      const { id: sessionId } = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-cleanup-3',
        userId,
      });

      // Create expired context entry
      await prisma.sessionContextEntry.create({
        data: {
          sessionId,
          entryType: 'USER_INTENT',
          key: 'old_intent',
          value: {},
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      });

      const deletedCount = await cleanupExpiredContextEntries();

      expect(deletedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('tRPC Proxy Endpoints', () => {
    // Proxy endpoints require PROXY_API_KEY to be unset in non-production
    // to allow unauthenticated access (for service-to-service calls)
    beforeEach(() => {
      vi.stubEnv('PROXY_API_KEY', '');
    });

    test('should create session via tRPC endpoint', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.proxy.getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-trpc-1',
        userId,
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeTruthy();
      expect(result.isNew).toBe(true);
    });

    test('should increment tool call count via tRPC endpoint', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const { id: sessionId } = await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-trpc-3',
        userId,
      });

      const caller = createCallerWithUser(admin);
      await caller.proxy.incrementToolCallCount({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-trpc-3',
      });

      await caller.proxy.incrementToolCallCount({
        organizationId: tenant.orgId,
        externalSessionId: 'ext-session-trpc-3',
      });

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      expect(session?.toolCallCount).toBe(2);
    });
  });

  describe('Organization Isolation', () => {
    test('should not access session from different organization', async () => {
      // Create session in tenant1
      await getOrCreateSession({
        organizationId: tenant.orgId,
        externalSessionId: 'shared-session-id',
        userId,
      });

      // Create second tenant
      const tenant2 = await createTestTenant();
      try {
        // Try to get session context with same external ID but different org
        const context = await getSessionContextForPolicy(tenant2.orgId, 'shared-session-id');

        // Should not find the session
        expect(context).toBeNull();
      } finally {
        await tenant2.cleanup();
      }
    });
  });
});
