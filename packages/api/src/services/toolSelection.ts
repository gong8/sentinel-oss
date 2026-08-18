/**
 * Smart Tool Selection Service
 * Selects relevant tools using semantic similarity, learned patterns, and keyword matching
 */

import { prisma } from '@sentinel/db';
import type { ToolDefinition } from '../agent/llm/index.js';
import { logger } from '../lib/logger.js';
import { getToolPatterns } from './agentMemory.js';
import {
  cosineSimilarity,
  getEmbeddingProvider,
  isEmbeddingAvailable,
  type EmbeddingProvider,
} from './embedding.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolSelectionConfig {
  maxTools: number;
  semanticWeight: number;
  patternWeight: number;
  keywordWeight: number;
  minThreshold: number;
}

export interface SelectToolsParams {
  organizationId: string;
  userId?: string;
  userMessage: string;
  allTools: ToolDefinition[];
  config?: Partial<ToolSelectionConfig>;
}

interface ScoredTool {
  tool: ToolDefinition;
  semanticScore: number;
  patternScore: number;
  keywordScore: number;
  finalScore: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ToolSelectionConfig = {
  maxTools: 25,
  semanticWeight: 0.6,
  patternWeight: 0.3,
  keywordWeight: 0.1,
  minThreshold: 0.2,
};

/**
 * Tool categories for keyword-based fallback
 */
const TOOL_CATEGORIES: Record<string, { tools: string[]; keywords: string[] }> = {
  policy: {
    tools: [
      'list_policies',
      'get_policy',
      'create_policy',
      'update_policy',
      'delete_policy',
      'enable_policy',
      'disable_policy',
    ],
    keywords: ['policy', 'policies', 'allow', 'deny', 'permission', 'access', 'rule', 'rules'],
  },
  user: {
    tools: ['list_users', 'get_user', 'create_user', 'update_user', 'delete_user'],
    keywords: ['user', 'users', 'email', 'member', 'members'],
  },
  role: {
    tools: ['list_roles', 'get_role', 'create_role', 'update_role', 'delete_role'],
    keywords: ['role', 'roles', 'group', 'groups'],
  },
  server: {
    tools: [
      'list_mcp_servers',
      'get_mcp_server',
      'list_mcp_server_tools',
      'create_mcp_server',
      'update_mcp_server',
      'delete_mcp_server',
    ],
    keywords: ['server', 'servers', 'mcp', 'notion', 'github', 'slack', 'integration'],
  },
  agent: {
    tools: ['list_agents', 'get_agent', 'create_agent', 'delete_agent'],
    keywords: ['agent', 'agents', 'bot', 'bots', 'ai'],
  },
  webhook: {
    tools: ['list_webhooks', 'get_webhook', 'create_webhook', 'update_webhook', 'delete_webhook'],
    keywords: ['webhook', 'webhooks', 'notification', 'notifications', 'alert', 'alerts'],
  },
  analytics: {
    tools: ['get_analytics_summary', 'query_audit_log', 'query_admin_actions'],
    keywords: ['analytics', 'audit', 'log', 'logs', 'history', 'activity', 'report'],
  },
  request: {
    tools: ['list_permission_requests', 'approve_request', 'deny_request'],
    keywords: ['request', 'requests', 'pending', 'approve', 'reject', 'review'],
  },
  params: {
    tools: ['search_param_values_by_label', 'get_param_suggestions', 'get_tool_param_fields'],
    keywords: ['param', 'parameter', 'value', 'field', 'suggest'],
  },
  sensitive: {
    tools: ['list_sensitive_flags'],
    keywords: ['sensitive', 'flag', 'flags', 'pii', 'secret'],
  },
};

const BASE_TOOLS = ['list_policies', 'list_mcp_servers', 'list_mcp_server_tools'];

/**
 * Get all admin tool names from categories
 */
function getAllAdminToolNames(): Set<string> {
  const adminTools = new Set<string>();
  for (const config of Object.values(TOOL_CATEGORIES)) {
    for (const tool of config.tools) {
      adminTools.add(tool);
    }
  }
  return adminTools;
}

/**
 * Check if a message is asking for admin/management tasks vs actual work tasks
 * Admin tasks: managing policies, users, servers, etc.
 * Work tasks: using MCP tools to do actual work (update tracker, send message, etc.)
 */
function isAdminTask(message: string): boolean {
  const adminKeywords = [
    'policy',
    'policies',
    'permission',
    'permissions',
    'user',
    'users',
    'role',
    'roles',
    'server',
    'servers',
    'mcp server',
    'webhook',
    'webhooks',
    'agent',
    'agents',
    'audit',
    'analytics',
    'sensitive',
    'flag',
    'approve',
    'deny',
    'request',
  ];
  const messageLower = message.toLowerCase();
  return adminKeywords.some((kw) => messageLower.includes(kw));
}

// ============================================================================
// CACHING
// ============================================================================

// In-memory cache for tool embeddings (refreshed on startup or when tools change)
const toolEmbeddingCache = new Map<string, number[]>();
let messageEmbeddingCache: { message: string; embedding: number[] } | null = null;

// ============================================================================
// MAIN SELECTION FUNCTION
// ============================================================================

/**
 * Select the most relevant tools for a user message
 * Uses a weighted combination of semantic similarity, learned patterns, and keywords
 */
export async function selectTools(params: SelectToolsParams): Promise<ToolDefinition[]> {
  const { organizationId, userId, userMessage, allTools, config: userConfig } = params;
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  // If embeddings not available, fall back to keyword matching
  if (!isEmbeddingAvailable()) {
    logger.debug('Embeddings not available, using keyword fallback');
    return selectToolsByKeywords(allTools, userMessage, config.maxTools);
  }

  try {
    // Get embedding provider
    const embeddingProvider = getEmbeddingProvider();
    if (!embeddingProvider) {
      return selectToolsByKeywords(allTools, userMessage, config.maxTools);
    }

    // Compute scores for each tool
    const scoredTools = await scoreTools(
      allTools,
      userMessage,
      organizationId,
      userId,
      embeddingProvider,
      config,
    );

    // Filter by threshold and sort by score
    const filteredTools = scoredTools
      .filter((st) => st.finalScore >= config.minThreshold)
      .sort((a, b) => b.finalScore - a.finalScore);

    // Get admin tool names to identify MCP tools
    const adminToolNames = getAllAdminToolNames();

    // Identify MCP tools from scored tools
    const mcpScoredTools = scoredTools.filter(
      (st) => !adminToolNames.has(st.tool.name) && !BASE_TOOLS.includes(st.tool.name),
    );

    // Check if this is an admin task
    const isAdmin = isAdminTask(userMessage);

    // For non-admin tasks with MCP tools available, ensure MCP tools are included
    let result: ToolDefinition[];

    if (!isAdmin && mcpScoredTools.length > 0) {
      // Work task: prioritize MCP tools, include base admin tools for discovery
      const sortedMcpTools = mcpScoredTools.sort((a, b) => b.finalScore - a.finalScore);
      const baseToolsToAdd = allTools.filter((t) => BASE_TOOLS.includes(t.name));

      // Take top MCP tools + base tools
      const mcpToolsToTake = Math.min(
        sortedMcpTools.length,
        config.maxTools - baseToolsToAdd.length,
      );
      result = [...sortedMcpTools.slice(0, mcpToolsToTake).map((st) => st.tool), ...baseToolsToAdd];
    } else {
      // Admin task or no MCP tools: use normal selection but ensure MCP tools get a chance
      const selectedToolNames = new Set(
        filteredTools.slice(0, config.maxTools).map((st) => st.tool.name),
      );
      const baseToolsToAdd = allTools.filter(
        (t) => BASE_TOOLS.includes(t.name) && !selectedToolNames.has(t.name),
      );

      // Also add MCP tools that didn't make the cut if there's room
      const selectedCount = Math.min(filteredTools.length, config.maxTools - baseToolsToAdd.length);
      const remainingSlots = config.maxTools - selectedCount - baseToolsToAdd.length;

      const mcpToolsNotSelected = mcpScoredTools
        .filter((st) => !selectedToolNames.has(st.tool.name))
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, Math.max(0, remainingSlots));

      result = [
        ...filteredTools.slice(0, selectedCount).map((st) => st.tool),
        ...baseToolsToAdd,
        ...mcpToolsNotSelected.map((st) => st.tool),
      ];
    }

    logger.debug('Smart tool selection completed', {
      totalTools: allTools.length,
      selectedTools: result.length,
      topScores: filteredTools.slice(0, 5).map((st) => ({
        name: st.tool.name,
        semantic: st.semanticScore.toFixed(3),
        pattern: st.patternScore.toFixed(3),
        keyword: st.keywordScore.toFixed(3),
        final: st.finalScore.toFixed(3),
      })),
    });

    return result;
  } catch (error) {
    logger.warn('Smart tool selection failed, using keyword fallback', { error });
    return selectToolsByKeywords(allTools, userMessage, config.maxTools);
  }
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

async function scoreTools(
  tools: ToolDefinition[],
  userMessage: string,
  organizationId: string,
  userId: string | undefined,
  embeddingProvider: EmbeddingProvider,
  config: ToolSelectionConfig,
): Promise<ScoredTool[]> {
  // Get message embedding (with caching for the same message)
  const messageEmbedding = await getMessageEmbedding(userMessage, embeddingProvider);

  // Get tool embeddings (with caching)
  const toolEmbeddings = await getToolEmbeddings(tools, organizationId, embeddingProvider);

  // Get learned patterns
  const patterns = await getToolPatterns(organizationId, userId);

  // Extract keywords from message for pattern matching
  const messageKeywords = extractKeywords(userMessage);

  // Score each tool
  const scoredTools: ScoredTool[] = tools.map((tool) => {
    // Semantic score from embedding similarity
    const toolEmbedding = toolEmbeddings.get(tool.name);
    const semanticScore = toolEmbedding ? cosineSimilarity(messageEmbedding, toolEmbedding) : 0;

    // Pattern score from learned usage
    const pattern = patterns.get(tool.name);
    let patternScore = 0;
    if (pattern) {
      // Check how many keywords from the message match learned patterns
      const matchingKeywords = messageKeywords.filter((kw) =>
        pattern.keywords.some((pk) => pk.includes(kw) || kw.includes(pk)),
      );
      patternScore = Math.min(
        1,
        (matchingKeywords.length / Math.max(messageKeywords.length, 1)) * pattern.importance,
      );
    }

    // Keyword score from category matching
    const keywordScore = computeKeywordScore(tool.name, userMessage);

    // Weighted final score
    const finalScore =
      config.semanticWeight * semanticScore +
      config.patternWeight * patternScore +
      config.keywordWeight * keywordScore;

    return {
      tool,
      semanticScore,
      patternScore,
      keywordScore,
      finalScore,
    };
  });

  return scoredTools;
}

async function getMessageEmbedding(
  message: string,
  provider: EmbeddingProvider,
): Promise<number[]> {
  // Check cache
  if (messageEmbeddingCache && messageEmbeddingCache.message === message) {
    return messageEmbeddingCache.embedding;
  }

  const embedding = await provider.computeEmbedding(message);
  messageEmbeddingCache = { message, embedding };
  return embedding;
}

async function getToolEmbeddings(
  tools: ToolDefinition[],
  organizationId: string,
  provider: EmbeddingProvider,
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const toolsNeedingEmbedding: ToolDefinition[] = [];

  // Check in-memory cache first
  for (const tool of tools) {
    const cacheKey = `${organizationId}:${tool.name}`;
    const cached = toolEmbeddingCache.get(cacheKey);
    if (cached) {
      result.set(tool.name, cached);
    } else {
      toolsNeedingEmbedding.push(tool);
    }
  }

  if (toolsNeedingEmbedding.length === 0) {
    return result;
  }

  // Check database cache
  const dbCached = await prisma.toolEmbeddingCache.findMany({
    where: {
      OR: [
        { organizationId, toolName: { in: toolsNeedingEmbedding.map((t) => t.name) } },
        { organizationId: null, toolName: { in: toolsNeedingEmbedding.map((t) => t.name) } },
      ],
      embeddingModel: provider.getModelName(),
    },
  });

  const dbCachedNames = new Set<string>();
  for (const cached of dbCached) {
    result.set(cached.toolName, cached.embedding);
    toolEmbeddingCache.set(`${organizationId}:${cached.toolName}`, cached.embedding);
    dbCachedNames.add(cached.toolName);
  }

  // Compute embeddings for tools not in cache
  const toolsToCompute = toolsNeedingEmbedding.filter((t) => !dbCachedNames.has(t.name));

  if (toolsToCompute.length > 0) {
    logger.debug('Computing embeddings for tools', {
      count: toolsToCompute.length,
      tools: toolsToCompute.map((t) => t.name),
    });

    const descriptions = toolsToCompute.map((t) => `${t.name}: ${t.description}`);
    const embeddings = await provider.computeEmbeddings(descriptions);

    // Store in cache
    for (let i = 0; i < toolsToCompute.length; i++) {
      const tool = toolsToCompute[i];
      const embedding = embeddings[i];

      result.set(tool.name, embedding);
      toolEmbeddingCache.set(`${organizationId}:${tool.name}`, embedding);

      // Store in database (fire and forget)
      prisma.toolEmbeddingCache
        .upsert({
          where: {
            organizationId_toolName: {
              organizationId,
              toolName: tool.name,
            },
          },
          create: {
            organizationId,
            toolName: tool.name,
            description: tool.description,
            embedding,
            embeddingModel: provider.getModelName(),
          },
          update: {
            description: tool.description,
            embedding,
            embeddingModel: provider.getModelName(),
          },
        })
        .catch((error) => {
          logger.warn('Failed to cache tool embedding', { tool: tool.name, error });
        });
    }
  }

  return result;
}

function computeKeywordScore(toolName: string, message: string): number {
  const messageLower = message.toLowerCase();

  // Check which categories the tool belongs to and if message matches keywords
  for (const [, config] of Object.entries(TOOL_CATEGORIES)) {
    if (config.tools.includes(toolName)) {
      const matchCount = config.keywords.filter((kw) => messageLower.includes(kw)).length;
      if (matchCount > 0) {
        return Math.min(1, matchCount / config.keywords.length + 0.3);
      }
    }
  }

  // Check if tool name appears in message
  if (messageLower.includes(toolName.replace(/_/g, ' '))) {
    return 0.5;
  }

  return 0;
}

function extractKeywords(message: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'i',
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'he',
    'him',
    'his',
    'she',
    'her',
    'it',
    'its',
    'they',
    'them',
    'their',
    'what',
    'which',
    'who',
    'this',
    'that',
    'these',
    'those',
    'and',
    'but',
    'if',
    'or',
    'because',
    'please',
    'want',
    'like',
    'get',
    'make',
    'show',
    'list',
    'create',
  ]);

  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

// ============================================================================
// KEYWORD FALLBACK
// ============================================================================

/**
 * Fallback tool selection using keyword matching only
 * Used when embeddings are not available
 */
export function selectToolsByKeywords(
  allTools: ToolDefinition[],
  userMessage: string,
  maxTools: number,
): ToolDefinition[] {
  const messageLower = userMessage.toLowerCase();
  const matchedCategories = new Set<string>();

  // Find matching categories
  for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
    for (const keyword of config.keywords) {
      if (messageLower.includes(keyword)) {
        matchedCategories.add(category);
        break;
      }
    }
  }

  // Collect admin tools from matched categories
  const selectedToolNames = new Set(BASE_TOOLS);
  for (const category of matchedCategories) {
    const config = TOOL_CATEGORIES[category];
    if (config) {
      for (const toolName of config.tools) {
        selectedToolNames.add(toolName);
      }
    }
  }

  // Get admin tool names to identify MCP tools
  const adminToolNames = getAllAdminToolNames();

  // Identify MCP tools (tools not in admin categories)
  const mcpTools = allTools.filter(
    (tool) => !adminToolNames.has(tool.name) && !BASE_TOOLS.includes(tool.name),
  );

  // Determine if this is an admin task or a work task
  const isAdmin = isAdminTask(userMessage);

  // For work tasks (non-admin), prioritize MCP tools
  // For admin tasks, prioritize admin tools but still include some MCP tools
  let result: ToolDefinition[];

  if (!isAdmin && mcpTools.length > 0) {
    // Work task: include all MCP tools + base admin tools for discovery
    const baseAdminTools = allTools.filter((tool) => BASE_TOOLS.includes(tool.name));
    result = [...mcpTools, ...baseAdminTools];
  } else if (matchedCategories.size === 0 && mcpTools.length > 0) {
    // No admin category matched but we have MCP tools - include them
    const baseAdminTools = allTools.filter((tool) => BASE_TOOLS.includes(tool.name));
    result = [...mcpTools, ...baseAdminTools];
  } else {
    // Admin task or no MCP tools: use admin tools + include MCP tools if space
    const adminTools = allTools.filter((tool) => selectedToolNames.has(tool.name));
    // Include MCP tools after admin tools if we have room
    const remainingSlots = maxTools - adminTools.length;
    const mcpToolsToInclude = mcpTools.slice(0, Math.max(0, remainingSlots));
    result = [...adminTools, ...mcpToolsToInclude];
  }

  // Limit to maxTools
  if (result.length > maxTools) {
    result = result.slice(0, maxTools);
  }

  return result;
}

/**
 * Clear the in-memory embedding caches
 * Useful when tools are updated
 */
export function clearEmbeddingCaches(): void {
  toolEmbeddingCache.clear();
  messageEmbeddingCache = null;
}
