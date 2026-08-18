/**
 * Agent Memory Maintenance Job
 * Runs periodically to decay importance and prune old/low-importance memories
 */

import { prisma } from '@sentinel/db';
import { logger } from '../lib/logger.js';
import { decayMemoryImportance, pruneOldMemories } from '../services/agentMemory.js';

/**
 * Run memory maintenance for all organizations
 * Should be scheduled to run daily
 */
export async function runMemoryMaintenance(): Promise<{
  organizationsProcessed: number;
  totalPruned: number;
}> {
  logger.info('Starting agent memory maintenance job');

  // Get all organizations with agent memories
  const organizations = await prisma.organization.findMany({
    where: {
      agentMemories: {
        some: {},
      },
    },
    select: { id: true, name: true },
  });

  let totalPruned = 0;

  for (const org of organizations) {
    try {
      // Decay importance for memories not accessed recently
      await decayMemoryImportance(org.id);

      // Prune expired and low-importance memories
      const pruned = await pruneOldMemories(org.id);
      totalPruned += pruned;

      logger.debug('Memory maintenance completed for organization', {
        organizationId: org.id,
        organizationName: org.name,
        prunedCount: pruned,
      });
    } catch (error) {
      logger.error('Memory maintenance failed for organization', {
        organizationId: org.id,
        error,
      });
    }
  }

  // Also clean up old tool usage records (older than 90 days)
  const toolUsageCleanupDate = new Date();
  toolUsageCleanupDate.setDate(toolUsageCleanupDate.getDate() - 90);

  const deletedToolUsage = await prisma.agentToolUsage.deleteMany({
    where: {
      createdAt: { lt: toolUsageCleanupDate },
    },
  });

  logger.info('Agent memory maintenance job completed', {
    organizationsProcessed: organizations.length,
    totalPruned,
    toolUsageRecordsDeleted: deletedToolUsage.count,
  });

  return {
    organizationsProcessed: organizations.length,
    totalPruned,
  };
}

/**
 * Run memory maintenance for a specific organization
 * Can be triggered manually or via API
 */
export async function runMemoryMaintenanceForOrg(organizationId: string): Promise<{
  pruned: number;
}> {
  logger.info('Running memory maintenance for organization', { organizationId });

  await decayMemoryImportance(organizationId);
  const pruned = await pruneOldMemories(organizationId);

  logger.info('Memory maintenance completed for organization', {
    organizationId,
    prunedCount: pruned,
  });

  return { pruned };
}
