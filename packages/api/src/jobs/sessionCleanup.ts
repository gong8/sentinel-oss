/**
 * Session Cleanup Job
 * Periodic cleanup of expired sessions and context entries
 */

import { logger } from '../lib/logger.js';
import {
  cleanupExpiredContextEntries,
  cleanupExpiredSessions,
  markExpiredSessions,
} from '../services/session.js';

/**
 * Runs the full session cleanup cycle:
 * 1. Mark active sessions that have passed their expiry as EXPIRED
 * 2. Delete sessions that have been expired for more than CLEANUP_EXPIRED_AFTER_DAYS
 * 3. Delete context entries that have passed their expiry
 */
export async function runSessionCleanup(): Promise<{
  markedExpired: number;
  sessionsDeleted: number;
  entriesDeleted: number;
}> {
  logger.info('Starting session cleanup job');

  const markedExpired = await markExpiredSessions();
  const sessionsDeleted = await cleanupExpiredSessions();
  const entriesDeleted = await cleanupExpiredContextEntries();

  logger.info('Session cleanup job completed', {
    markedExpired,
    sessionsDeleted,
    entriesDeleted,
  });

  return {
    markedExpired,
    sessionsDeleted,
    entriesDeleted,
  };
}

/**
 * Starts a periodic cleanup interval
 * Default: runs every hour
 */
export function startSessionCleanupInterval(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  logger.info(`Starting session cleanup interval (every ${intervalMs / 1000 / 60} minutes)`);

  // Run immediately on start
  runSessionCleanup().catch((error) => {
    logger.error('Session cleanup job failed:', error);
  });

  // Then run on interval
  return setInterval(() => {
    runSessionCleanup().catch((error) => {
      logger.error('Session cleanup job failed:', error);
    });
  }, intervalMs);
}
