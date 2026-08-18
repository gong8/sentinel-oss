/**
 * Session Service
 * Manages session lifecycle and context for policy evaluation
 */

import { prisma, SessionStatus } from '@sentinel/db';
import { toJsonValue } from '../lib/jsonValue.js';
import { logger } from '../lib/logger.js';
import {
  SESSION_CONFIG,
  type AddSessionContextParams,
  type GetOrCreateSessionParams,
  type SessionContextForPolicy,
} from '../types/session.js';

/**
 * Gets an existing session or creates a new one
 * Sessions are identified by the combination of organizationId and externalSessionId
 */
export async function getOrCreateSession(
  params: GetOrCreateSessionParams,
  workspaceId?: string | null,
): Promise<{ id: string; isNew: boolean }> {
  const { organizationId, externalSessionId, userId, agentId } = params;

  try {
    // Try to find existing session
    const existingSession = await prisma.session.findUnique({
      where: {
        organizationId_externalSessionId: {
          organizationId,
          externalSessionId,
        },
      },
      select: { id: true, status: true },
    });

    if (existingSession) {
      /**
       * Note: EXPIRED sessions can be reactivated. EXPIRED represents a dormant state,
       * not a terminal state. For permanent termination, use TERMINATED status.
       * When an EXPIRED or TERMINATED session is encountered, we delete it and create
       * a new session with the same externalSessionId.
       */
      if (
        existingSession.status === SessionStatus.EXPIRED ||
        existingSession.status === SessionStatus.TERMINATED
      ) {
        logger.debug(
          `Session ${existingSession.id} is ${existingSession.status}, deleting and creating new session`,
        );

        // Delete the terminal session to allow creating a new one with the same externalSessionId
        await prisma.session.delete({
          where: { id: existingSession.id },
        });

        // Fall through to create new session below
      } else {
        // Update last activity for active sessions
        await prisma.session.update({
          where: { id: existingSession.id },
          data: { lastActivityAt: new Date() },
        });

        return { id: existingSession.id, isNew: false };
      }
    }

    // Create new session
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SESSION_CONFIG.DEFAULT_TTL_HOURS);

    const newSession = await prisma.session.create({
      data: {
        organizationId,
        externalSessionId,
        userId,
        agentId,
        workspaceId,
        expiresAt,
        status: SessionStatus.ACTIVE,
      },
      select: { id: true },
    });

    logger.debug(
      `Created new session: ${newSession.id} for external session: ${externalSessionId}`,
    );
    return { id: newSession.id, isNew: true };
  } catch (error) {
    // Handle race condition where session was created by another request
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      const session = await prisma.session.findUnique({
        where: {
          organizationId_externalSessionId: {
            organizationId,
            externalSessionId,
          },
        },
        select: { id: true },
      });

      if (session) {
        return { id: session.id, isNew: false };
      }
    }

    logger.error('Failed to get or create session:', error);
    throw error;
  }
}

/**
 * Gets session context formatted for policy evaluation
 * Returns the most recent and important context entries
 */
export async function getSessionContextForPolicy(
  organizationId: string,
  externalSessionId: string,
): Promise<SessionContextForPolicy | null> {
  try {
    const session = await prisma.session.findUnique({
      where: {
        organizationId_externalSessionId: {
          organizationId,
          externalSessionId,
        },
      },
      include: {
        contextEntries: {
          orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
          take: SESSION_CONFIG.MAX_RECENT_CONTEXT_FOR_POLICY,
        },
      },
    });

    if (!session) {
      return null;
    }

    // Calculate session age in minutes
    const sessionAge = Math.floor((Date.now() - session.createdAt.getTime()) / (1000 * 60));

    return {
      sessionId: session.id,
      externalSessionId: session.externalSessionId,
      sessionAge,
      toolCallCount: session.toolCallCount,
      contextSummary: session.contextSummary,
      status: session.status,
      recentContext: session.contextEntries.map((entry) => ({
        key: entry.key,
        value: entry.value,
        summary: entry.summary,
        entryType: entry.entryType,
        importance: entry.importance,
        sourceToolName: entry.sourceToolName,
        createdAt: entry.createdAt,
      })),
    };
  } catch (error) {
    logger.error('Failed to get session context for policy:', error);
    return null;
  }
}

/**
 * Adds a context entry to a session
 * Automatically prunes old entries if limit is exceeded
 *
 * Non-blocking by design: errors are logged but not thrown to avoid blocking tool execution.
 * Returns success status so callers can be aware of failures if needed.
 */
export async function addSessionContext(
  params: AddSessionContextParams,
): Promise<{ success: boolean }> {
  const {
    sessionId,
    entryType,
    key,
    value,
    summary,
    importance = 0.5,
    sourceToolName,
    expiresAt,
  } = params;

  try {
    // Count existing entries
    const entryCount = await prisma.sessionContextEntry.count({
      where: { sessionId },
    });

    // Prune oldest low-importance entries if at limit
    if (entryCount >= SESSION_CONFIG.MAX_CONTEXT_ENTRIES_PER_SESSION) {
      const entriesToDelete = await prisma.sessionContextEntry.findMany({
        where: { sessionId },
        orderBy: [{ importance: 'asc' }, { createdAt: 'asc' }],
        take: Math.ceil(SESSION_CONFIG.MAX_CONTEXT_ENTRIES_PER_SESSION * 0.1), // Delete 10%
        select: { id: true },
      });

      await prisma.sessionContextEntry.deleteMany({
        where: {
          id: { in: entriesToDelete.map((e) => e.id) },
        },
      });

      logger.debug(
        `Pruned ${entriesToDelete.length} old context entries from session ${sessionId}`,
      );
    }

    // Validate and convert value to safe JSON before storage
    const validatedValue = toJsonValue(value);

    // Add new entry
    await prisma.sessionContextEntry.create({
      data: {
        sessionId,
        entryType,
        key,
        value: validatedValue,
        summary,
        importance,
        sourceToolName,
        expiresAt,
      },
    });

    return { success: true };
  } catch (error) {
    // Non-blocking: log error but don't throw to avoid blocking tool execution
    logger.error('Failed to add session context:', error);
    return { success: false };
  }
}

/**
 * Updates the rolling context summary for a session
 * Requires organizationId to ensure multi-tenant isolation
 */
export async function updateContextSummary(
  organizationId: string,
  sessionId: string,
  summary: string,
): Promise<void> {
  try {
    // Use updateMany to avoid error if session doesn't exist or doesn't belong to org
    const result = await prisma.session.updateMany({
      where: {
        id: sessionId,
        organizationId, // Enforce multi-tenant isolation
      },
      data: { contextSummary: summary },
    });

    if (result.count === 0) {
      logger.warn(
        'updateContextSummary: No session found or session does not belong to organization',
        {
          sessionId,
          organizationId,
        },
      );
    }
  } catch (error) {
    logger.error('Failed to update context summary:', error);
  }
}

/**
 * Increments the tool call count for a session
 */
export async function incrementToolCallCount(
  organizationId: string,
  externalSessionId: string,
): Promise<void> {
  try {
    await prisma.session.update({
      where: {
        organizationId_externalSessionId: {
          organizationId,
          externalSessionId,
        },
      },
      data: {
        toolCallCount: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });
  } catch (error) {
    // Never throw - tracking should not block tool execution
    logger.error('Failed to increment tool call count:', error);
  }
}

/**
 * System-wide maintenance function for marking expired sessions.
 * Should only be called from trusted cron jobs.
 * Returns count of sessions marked as expired.
 */
export async function markExpiredSessions(): Promise<number> {
  try {
    const result = await prisma.session.updateMany({
      where: {
        status: SessionStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
      data: {
        status: SessionStatus.EXPIRED,
      },
    });

    if (result.count > 0) {
      logger.info(`Marked ${result.count} sessions as expired`);
    }

    return result.count;
  } catch (error) {
    logger.error('Failed to mark expired sessions:', error);
    return 0;
  }
}

/**
 * System-wide cleanup function for deleting old expired sessions and their context entries.
 * Should only be called from trusted cron jobs.
 * Returns count of sessions deleted.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SESSION_CONFIG.CLEANUP_EXPIRED_AFTER_DAYS);

    // Delete sessions that have been expired for more than CLEANUP_EXPIRED_AFTER_DAYS
    const result = await prisma.session.deleteMany({
      where: {
        status: SessionStatus.EXPIRED,
        expiresAt: { lt: cutoffDate },
      },
    });

    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} old expired sessions`);
    }

    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup expired sessions:', error);
    return 0;
  }
}

/**
 * System-wide cleanup function for deleting expired context entries from all sessions.
 * Should only be called from trusted cron jobs.
 * Returns count of entries deleted.
 */
export async function cleanupExpiredContextEntries(): Promise<number> {
  try {
    const result = await prisma.sessionContextEntry.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} expired context entries`);
    }

    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup expired context entries:', error);
    return 0;
  }
}

/**
 * Gets session by internal ID
 */
export async function getSessionById(
  organizationId: string,
  sessionId: string,
): Promise<{ id: string; organizationId: string; externalSessionId: string } | null> {
  try {
    return await prisma.session.findFirst({
      where: {
        id: sessionId,
        organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        externalSessionId: true,
      },
    });
  } catch (error) {
    logger.error('Failed to get session by ID:', error);
    return null;
  }
}

/**
 * Terminates all active sessions for a specific user
 * Used by admins to forcefully disconnect a user's sessions
 * @param organizationId - The organization ID
 * @param userId - The user whose sessions should be terminated
 * @param terminatedBy - The admin user ID who initiated the termination
 * @param workspaceScope - Optional workspace scope:
 *   - undefined: terminate all sessions (org-wide)
 *   - string: terminate sessions in that specific workspace only
 *   - string[]: terminate sessions in any of the specified workspaces
 * @returns Number of sessions terminated and their IDs
 */
export async function terminateUserSessions(
  organizationId: string,
  userId: string,
  terminatedBy: string,
  workspaceScope?: string | string[],
): Promise<{ count: number; sessionIds: string[] }> {
  try {
    // Build workspace filter - default to org-wide only when no scope specified
    const workspaceFilter = Array.isArray(workspaceScope)
      ? { workspaceId: { in: workspaceScope } }
      : workspaceScope !== undefined
        ? { workspaceId: workspaceScope }
        : { workspaceId: null };

    // First, get the sessions that will be terminated
    const sessionsToTerminate = await prisma.session.findMany({
      where: {
        organizationId,
        userId,
        status: SessionStatus.ACTIVE,
        ...workspaceFilter,
      },
      select: { id: true, externalSessionId: true },
    });

    if (sessionsToTerminate.length === 0) {
      return { count: 0, sessionIds: [] };
    }

    const sessionIds = sessionsToTerminate.map((s) => s.id);

    // Terminate all active sessions for the user
    await prisma.session.updateMany({
      where: {
        id: { in: sessionIds },
      },
      data: {
        status: SessionStatus.TERMINATED,
        terminatedAt: new Date(),
        terminatedBy,
      },
    });

    logger.info(
      `Terminated ${sessionsToTerminate.length} sessions for user ${userId} in org ${organizationId}`,
    );

    return {
      count: sessionsToTerminate.length,
      sessionIds: sessionsToTerminate.map((s) => s.externalSessionId),
    };
  } catch (error) {
    logger.error('Failed to terminate user sessions:', error);
    throw error;
  }
}

/**
 * Checks if a session is terminated
 * Used by MCP proxy to check if requests should be rejected
 */
export async function isSessionTerminated(
  organizationId: string,
  externalSessionId: string,
): Promise<boolean> {
  try {
    const session = await prisma.session.findUnique({
      where: {
        organizationId_externalSessionId: {
          organizationId,
          externalSessionId,
        },
      },
      select: { status: true },
    });

    return session?.status === SessionStatus.TERMINATED;
  } catch (error) {
    logger.error('Failed to check session termination status:', error);
    // Fail closed - if we can't check, assume not terminated to avoid blocking legitimate requests
    return false;
  }
}

/**
 * Gets the count of active sessions for a user
 */
export async function getActiveSessionCount(
  organizationId: string,
  userId: string,
): Promise<number> {
  try {
    return await prisma.session.count({
      where: {
        organizationId,
        userId,
        status: SessionStatus.ACTIVE,
      },
    });
  } catch (error) {
    logger.error('Failed to get active session count:', error);
    return 0;
  }
}

/**
 * Lists active sessions for an organization
 * Used by admin UI to show active sessions
 */
export async function listActiveSessions(
  organizationId: string,
  workspaceId?: string,
  userWorkspaceIds?: string[],
): Promise<
  Array<{
    id: string;
    externalSessionId: string;
    userId: string | null;
    agentId: string | null;
    workspaceId: string | null;
    createdAt: Date;
    lastActivityAt: Date;
    toolCallCount: number;
  }>
> {
  try {
    // Build workspace filter - default to org-wide only when no scope specified
    const workspaceFilter = workspaceId
      ? { workspaceId }
      : userWorkspaceIds
        ? {
            OR: [
              { workspaceId: null }, // Org-wide sessions
              { workspaceId: { in: userWorkspaceIds } }, // User's workspace sessions
            ],
          }
        : { workspaceId: null }; // Default to org-wide only

    return await prisma.session.findMany({
      where: {
        organizationId,
        status: SessionStatus.ACTIVE,
        ...workspaceFilter,
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
  } catch (error) {
    logger.error('Failed to list active sessions:', error);
    return [];
  }
}

/**
 * Terminates a specific session by ID
 * Used by admins to forcefully disconnect a specific session
 */
export async function terminateSession(
  organizationId: string,
  sessionId: string,
  terminatedBy: string,
): Promise<{ success: boolean; externalSessionId: string | null }> {
  try {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        organizationId,
        status: SessionStatus.ACTIVE,
      },
      select: { id: true, externalSessionId: true },
    });

    if (!session) {
      return { success: false, externalSessionId: null };
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.TERMINATED,
        terminatedAt: new Date(),
        terminatedBy,
      },
    });

    logger.info(`Terminated session ${sessionId} in org ${organizationId}`);

    return { success: true, externalSessionId: session.externalSessionId };
  } catch (error) {
    logger.error('Failed to terminate session:', error);
    throw error;
  }
}
