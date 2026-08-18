/**
 * Agent Memory Service
 * Manages persistent memory for the agent across conversations
 */

import { AgentMemoryType, prisma } from '@sentinel/db';
import { logger } from '../lib/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryEntry {
  id: string;
  memoryType: AgentMemoryType;
  category: string;
  key: string;
  content: unknown;
  summary: string | null;
  importance: number;
  accessCount: number;
  lastAccessedAt: Date;
  createdAt: Date;
}

export interface StoreMemoryParams {
  organizationId: string;
  userId?: string;
  memoryType: AgentMemoryType;
  category: string;
  key: string;
  content: unknown;
  summary?: string;
  importance?: number;
  expiresAt?: Date;
  sourceConversationId?: string;
}

export interface SearchMemoriesParams {
  organizationId: string;
  userId?: string;
  memoryType?: AgentMemoryType;
  category?: string;
  limit?: number;
  minImportance?: number;
}

export interface RecordToolUsageParams {
  organizationId: string;
  userId?: string;
  toolName: string;
  contextKeywords: string[];
  success: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_MEMORIES_PER_USER: 500,
  DECAY_RATE: 0.95, // Importance decays by 5% per day
  MIN_IMPORTANCE: 0.1, // Memories below this are pruned
  MAX_RELEVANT_MEMORIES: 10, // Max memories to inject into context
  SUMMARY_MAX_LENGTH: 200,
};

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Store a memory entry (upserts if same org/user/category/key exists)
 */
export async function storeMemory(params: StoreMemoryParams): Promise<string> {
  const {
    organizationId,
    userId,
    memoryType,
    category,
    key,
    content,
    summary,
    importance = 0.5,
    expiresAt,
    sourceConversationId,
  } = params;

  const memory = await prisma.agentMemory.upsert({
    where: {
      organizationId_userId_category_key: {
        organizationId,
        userId: userId ?? '',
        category,
        key,
      },
    },
    create: {
      organizationId,
      userId: userId || null,
      memoryType,
      category,
      key,
      content: content as object,
      summary: summary?.slice(0, CONFIG.SUMMARY_MAX_LENGTH),
      importance,
      expiresAt,
      sourceConversationId,
    },
    update: {
      content: content as object,
      summary: summary?.slice(0, CONFIG.SUMMARY_MAX_LENGTH),
      importance: { increment: 0.1 }, // Boost importance on update
      accessCount: { increment: 1 },
      lastAccessedAt: new Date(),
    },
  });

  logger.debug('Stored agent memory', {
    memoryId: memory.id,
    memoryType,
    category,
    key,
  });

  return memory.id;
}

/**
 * Search memories by various criteria
 */
export async function searchMemories(params: SearchMemoriesParams): Promise<MemoryEntry[]> {
  const { organizationId, userId, memoryType, category, limit = 50, minImportance = 0 } = params;

  const memories = await prisma.agentMemory.findMany({
    where: {
      organizationId,
      ...(userId !== undefined && { userId }),
      ...(memoryType && { memoryType }),
      ...(category && { category }),
      importance: { gte: minImportance },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ importance: 'desc' }, { lastAccessedAt: 'desc' }],
    take: limit,
  });

  // Update access counts
  if (memories.length > 0) {
    await prisma.agentMemory.updateMany({
      where: { id: { in: memories.map((m) => m.id) } },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }

  return memories.map((m) => ({
    id: m.id,
    memoryType: m.memoryType,
    category: m.category,
    key: m.key,
    content: m.content,
    summary: m.summary,
    importance: m.importance,
    accessCount: m.accessCount,
    lastAccessedAt: m.lastAccessedAt,
    createdAt: m.createdAt,
  }));
}

/**
 * Get relevant context memories for a user message
 * This is the main function used by the orchestrator to inject memory context
 */
export async function getRelevantContext(
  organizationId: string,
  userId: string | undefined,
  message: string,
): Promise<MemoryEntry[]> {
  const messageLower = message.toLowerCase();

  // Get all active memories for this org/user
  const allMemories = await prisma.agentMemory.findMany({
    where: {
      organizationId,
      importance: { gte: CONFIG.MIN_IMPORTANCE },
      AND: [
        // User filter: org-wide or user-specific
        {
          OR: [
            { userId: null }, // Org-wide memories
            { userId: userId ?? undefined }, // User-specific memories
          ],
        },
        // Expiration filter: not expired
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      ],
    },
    orderBy: { importance: 'desc' },
    take: 100, // Pre-filter to top 100 by importance
  });

  // Score memories by relevance to the message
  const scoredMemories = allMemories.map((memory) => {
    let score = memory.importance;

    // Boost if key or category appears in message
    if (messageLower.includes(memory.key.toLowerCase())) {
      score += 0.3;
    }
    if (messageLower.includes(memory.category.toLowerCase())) {
      score += 0.2;
    }

    // Boost if summary contains message keywords
    if (memory.summary) {
      const summaryLower = memory.summary.toLowerCase();
      const words = messageLower.split(/\s+/).filter((w) => w.length > 3);
      const matchCount = words.filter((w) => summaryLower.includes(w)).length;
      score += matchCount * 0.1;
    }

    // Boost recent memories slightly
    const daysSinceAccess = (Date.now() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess < 1) score += 0.1;
    else if (daysSinceAccess < 7) score += 0.05;

    return { memory, score };
  });

  // Sort by score and take top N
  scoredMemories.sort((a, b) => b.score - a.score);
  const topMemories = scoredMemories.slice(0, CONFIG.MAX_RELEVANT_MEMORIES);

  // Update access counts for retrieved memories
  if (topMemories.length > 0) {
    await prisma.agentMemory.updateMany({
      where: { id: { in: topMemories.map((m) => m.memory.id) } },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }

  return topMemories.map((m) => ({
    id: m.memory.id,
    memoryType: m.memory.memoryType,
    category: m.memory.category,
    key: m.memory.key,
    content: m.memory.content,
    summary: m.memory.summary,
    importance: m.memory.importance,
    accessCount: m.memory.accessCount,
    lastAccessedAt: m.memory.lastAccessedAt,
    createdAt: m.memory.createdAt,
  }));
}

/**
 * Record a tool usage for pattern learning
 */
export async function recordToolUsage(params: RecordToolUsageParams): Promise<void> {
  const { organizationId, userId, toolName, contextKeywords, success } = params;

  await prisma.agentToolUsage.create({
    data: {
      organizationId,
      userId: userId || null,
      toolName,
      contextKeywords,
      success,
    },
  });

  // Also update/create a TOOL_USAGE_PATTERN memory
  if (success && contextKeywords.length > 0) {
    const existingMemory = await prisma.agentMemory.findUnique({
      where: {
        organizationId_userId_category_key: {
          organizationId,
          userId: userId ?? '',
          category: 'tool_pattern',
          key: toolName,
        },
      },
    });

    if (existingMemory) {
      // Merge keywords
      const existingContent = existingMemory.content as { keywords: string[]; usageCount: number };
      const mergedKeywords = [...new Set([...existingContent.keywords, ...contextKeywords])];

      await prisma.agentMemory.update({
        where: { id: existingMemory.id },
        data: {
          content: {
            keywords: mergedKeywords.slice(0, 50), // Cap at 50 keywords
            usageCount: existingContent.usageCount + 1,
          },
          importance: Math.min(1.0, existingMemory.importance + 0.05),
          accessCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      });
    } else {
      await prisma.agentMemory.create({
        data: {
          organizationId,
          userId: userId || null,
          memoryType: 'TOOL_USAGE_PATTERN',
          category: 'tool_pattern',
          key: toolName,
          content: {
            keywords: contextKeywords.slice(0, 50),
            usageCount: 1,
          },
          summary: `Tool ${toolName} used with keywords: ${contextKeywords.slice(0, 5).join(', ')}`,
          importance: 0.4,
        },
      });
    }
  }

  logger.debug('Recorded tool usage', { toolName, success, keywordCount: contextKeywords.length });
}

/**
 * Get tool usage patterns for smart tool selection
 */
export async function getToolPatterns(
  organizationId: string,
  userId?: string,
): Promise<Map<string, { keywords: string[]; usageCount: number; importance: number }>> {
  const patterns = await prisma.agentMemory.findMany({
    where: {
      organizationId,
      OR: [{ userId: null }, { userId: userId ?? undefined }],
      memoryType: 'TOOL_USAGE_PATTERN',
      category: 'tool_pattern',
    },
  });

  const result = new Map<string, { keywords: string[]; usageCount: number; importance: number }>();

  for (const pattern of patterns) {
    const content = pattern.content as { keywords: string[]; usageCount: number };
    result.set(pattern.key, {
      keywords: content.keywords,
      usageCount: content.usageCount,
      importance: pattern.importance,
    });
  }

  return result;
}

// ============================================================================
// MAINTENANCE OPERATIONS
// ============================================================================

/**
 * Prune old and low-importance memories
 * Should be run periodically (e.g., daily cron job)
 */
export async function pruneOldMemories(organizationId: string): Promise<number> {
  // Delete expired memories
  const expiredResult = await prisma.agentMemory.deleteMany({
    where: {
      organizationId,
      expiresAt: { lt: new Date() },
    },
  });

  // Delete low-importance memories
  const lowImportanceResult = await prisma.agentMemory.deleteMany({
    where: {
      organizationId,
      importance: { lt: CONFIG.MIN_IMPORTANCE },
    },
  });

  // Enforce per-user limit
  const users = await prisma.agentMemory.groupBy({
    by: ['userId'],
    where: { organizationId },
    _count: true,
  });

  let userPrunedCount = 0;
  for (const user of users) {
    if (user._count > CONFIG.MAX_MEMORIES_PER_USER) {
      // Find memories to delete (lowest importance, oldest)
      const toDelete = await prisma.agentMemory.findMany({
        where: {
          organizationId,
          userId: user.userId,
        },
        orderBy: [{ importance: 'asc' }, { lastAccessedAt: 'asc' }],
        skip: CONFIG.MAX_MEMORIES_PER_USER,
        select: { id: true },
      });

      if (toDelete.length > 0) {
        const deleteResult = await prisma.agentMemory.deleteMany({
          where: { id: { in: toDelete.map((m) => m.id) } },
        });
        userPrunedCount += deleteResult.count;
      }
    }
  }

  const totalPruned = expiredResult.count + lowImportanceResult.count + userPrunedCount;

  logger.info('Pruned agent memories', {
    organizationId,
    expired: expiredResult.count,
    lowImportance: lowImportanceResult.count,
    userLimit: userPrunedCount,
    total: totalPruned,
  });

  return totalPruned;
}

/**
 * Decay memory importance over time
 * Should be run periodically (e.g., daily cron job)
 */
export async function decayMemoryImportance(organizationId: string): Promise<void> {
  // Decay all memories that haven't been accessed in the last day
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  await prisma.$executeRaw`
    UPDATE "AgentMemory"
    SET importance = importance * ${CONFIG.DECAY_RATE}
    WHERE "organizationId" = ${organizationId}
    AND "lastAccessedAt" < ${oneDayAgo}
    AND importance > ${CONFIG.MIN_IMPORTANCE}
  `;

  logger.debug('Decayed memory importance', { organizationId, decayRate: CONFIG.DECAY_RATE });
}

/**
 * Summarize a conversation and store as memory
 */
export async function summarizeConversation(
  conversationId: string,
  organizationId: string,
  userId: string,
  summary: string,
): Promise<string> {
  return storeMemory({
    organizationId,
    userId,
    memoryType: 'CONVERSATION_SUMMARY',
    category: 'conversation',
    key: conversationId,
    content: { conversationId, summarizedAt: new Date().toISOString() },
    summary,
    importance: 0.6,
    sourceConversationId: conversationId,
  });
}

/**
 * Store a user preference/correction
 */
export async function storeUserPreference(
  organizationId: string,
  userId: string,
  preferenceKey: string,
  content: unknown,
  summary: string,
): Promise<string> {
  return storeMemory({
    organizationId,
    userId,
    memoryType: 'USER_PREFERENCE',
    category: 'preference',
    key: preferenceKey,
    content,
    summary,
    importance: 0.7, // Preferences are high importance
  });
}

/**
 * Store an entity reference (policy, server, user mentioned)
 */
export async function storeEntityReference(
  organizationId: string,
  userId: string | undefined,
  entityType: string,
  entityId: string,
  content: unknown,
  summary: string,
): Promise<string> {
  return storeMemory({
    organizationId,
    userId,
    memoryType: 'ENTITY_REFERENCE',
    category: `entity:${entityType}`,
    key: entityId,
    content,
    summary,
    importance: 0.5,
  });
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format memories for injection into the system prompt
 */
export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return '';

  const sections: string[] = [];

  // Group by type
  const byType = new Map<AgentMemoryType, MemoryEntry[]>();
  for (const memory of memories) {
    const existing = byType.get(memory.memoryType) ?? [];
    existing.push(memory);
    byType.set(memory.memoryType, existing);
  }

  // Format each type
  if (byType.has('CONVERSATION_SUMMARY')) {
    const summaries = byType.get('CONVERSATION_SUMMARY')!;
    sections.push(
      '## Previous Conversation Context\n' + summaries.map((m) => `- ${m.summary}`).join('\n'),
    );
  }

  if (byType.has('USER_PREFERENCE')) {
    const prefs = byType.get('USER_PREFERENCE')!;
    sections.push(
      '## User Preferences\n' + prefs.map((m) => `- ${m.key}: ${m.summary}`).join('\n'),
    );
  }

  if (byType.has('ENTITY_REFERENCE')) {
    const entities = byType.get('ENTITY_REFERENCE')!;
    sections.push(
      '## Recently Referenced Entities\n' +
        entities.map((m) => `- ${m.category.replace('entity:', '')}: ${m.summary}`).join('\n'),
    );
  }

  if (byType.has('TOOL_USAGE_PATTERN')) {
    const patterns = byType.get('TOOL_USAGE_PATTERN')!;
    sections.push(
      '## Learned Tool Patterns\n' + patterns.map((m) => `- ${m.key}: ${m.summary}`).join('\n'),
    );
  }

  if (byType.has('CORRECTION')) {
    const corrections = byType.get('CORRECTION')!;
    sections.push(
      '## User Corrections (Important)\n' + corrections.map((m) => `- ${m.summary}`).join('\n'),
    );
  }

  return sections.length > 0 ? '\n# Agent Memory Context\n' + sections.join('\n\n') + '\n' : '';
}
