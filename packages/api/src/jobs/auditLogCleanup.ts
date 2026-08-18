/**
 * Audit Log Cleanup Job
 * Periodically cleans up old audit log entries based on per-org retention settings
 */

import { prisma } from '@sentinel/db';
import { logger } from '../lib/logger.js';

/**
 * Runs the audit log cleanup for all organizations
 * Respects per-organization retention settings
 */
export async function runAuditLogCleanup(): Promise<{
  organizationsProcessed: number;
  entriesDeleted: number;
}> {
  logger.info('Starting audit log cleanup job');

  // Get all organizations with their retention settings
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: {
          auditLogRetentionDays: true,
        },
      },
    },
  });

  let totalDeleted = 0;
  let orgsProcessed = 0;

  for (const org of organizations) {
    const retentionDays = org.settings?.auditLogRetentionDays ?? 90;

    // Skip if retention is set to 0 (indefinite retention)
    if (retentionDays === 0) {
      continue;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const result = await prisma.auditLogEntry.deleteMany({
        where: {
          organizationId: org.id,
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      if (result.count > 0) {
        logger.info(`Deleted ${result.count} audit log entries for org ${org.id}`, {
          organizationId: org.id,
          organizationName: org.name,
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
          deletedCount: result.count,
        });
      }

      totalDeleted += result.count;
      orgsProcessed++;
    } catch (error) {
      logger.error(`Failed to clean up audit logs for org ${org.id}`, {
        organizationId: org.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Audit log cleanup job completed', {
    organizationsProcessed: orgsProcessed,
    entriesDeleted: totalDeleted,
  });

  return {
    organizationsProcessed: orgsProcessed,
    entriesDeleted: totalDeleted,
  };
}

/**
 * Starts a periodic cleanup interval
 * Default: runs every 24 hours
 */
export function startAuditLogCleanupInterval(intervalMs = 24 * 60 * 60 * 1000): NodeJS.Timeout {
  logger.info(`Starting audit log cleanup interval (every ${intervalMs / 1000 / 60 / 60} hours)`);

  // Run immediately on start
  runAuditLogCleanup().catch((error) => {
    logger.error('Audit log cleanup job failed:', error);
  });

  // Then run on interval
  return setInterval(() => {
    runAuditLogCleanup().catch((error) => {
      logger.error('Audit log cleanup job failed:', error);
    });
  }, intervalMs);
}
