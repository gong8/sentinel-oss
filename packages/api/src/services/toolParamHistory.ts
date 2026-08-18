/**
 * Tool Parameter History Service
 * Tracks historical parameter values for UI suggestions in condition builder
 */

import { prisma } from '@sentinel/db';
import { isSensitiveKey, SENSITIVE_KEYS } from '@sentinel/shared';
import { logger } from '../lib/logger.js';
import { extractLabelsFromResponse, type LabelMapping } from './labelExtraction.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_SUGGESTION_LIMIT = 10; // Show top 10 most recently used
const MAX_VALUE_LENGTH = 500;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Flatten nested parameters into dot-notation keys
 * e.g., { user: { name: "John" } } -> { "user.name": "John" }
 * e.g., { pages: [{ parent: { page_id: "abc" } }] } -> { "pages[].parent.page_id": "abc" }
 */
function flattenParameters(
  params: Record<string, unknown>,
  prefix = '',
): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];

  for (const [key, value] of Object.entries(params)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    // Skip sensitive keys
    if (isSensitiveKey(key)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      result.push(...flattenParameters(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      // Track each array element
      // Use [] notation to indicate array items (e.g., "pages[].parent.page_id")
      const arrayKey = `${fullKey}[]`;
      for (const item of value) {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          // Primitive array elements - track with the array key
          const stringValue = String(item);
          if (stringValue.length <= MAX_VALUE_LENGTH) {
            result.push({ key: fullKey, value: stringValue });
          }
        } else if (typeof item === 'object' && item !== null) {
          // Nested objects in array - recurse with [] notation
          result.push(...flattenParameters(item as Record<string, unknown>, arrayKey));
        }
      }
    } else {
      // Track primitive values
      const stringValue = String(value);
      if (stringValue.length <= MAX_VALUE_LENGTH) {
        result.push({ key: fullKey, value: stringValue });
      }
    }
  }

  return result;
}

// ============================================================================
// TRACKING
// ============================================================================

export interface TrackParamValuesInput {
  organizationId: string;
  /** MCP server ID - values are shared across all tools on this server */
  serverId: string;
  /** Tool name for reference/auditing (optional) */
  toolName?: string;
  parameters: Record<string, unknown>;
  /** Optional response from the tool - used to extract human-readable labels for ID parameters */
  response?: unknown;
}

/**
 * Track parameter values from a tool invocation
 *
 * Non-blocking by design: errors are logged but not thrown to avoid blocking tool execution.
 * Returns success status so callers can be aware of failures if needed.
 *
 * Values are shared across all tools on the same MCP server by parameter key.
 * Uses upsert to increment occurrence count for existing values.
 * If a response is provided, extracts human-readable labels for ID-like parameters.
 */
export async function trackParamValues(
  input: TrackParamValuesInput,
): Promise<{ success: boolean }> {
  const { organizationId, serverId, toolName, parameters, response } = input;

  try {
    const flatParams = flattenParameters(parameters);

    if (flatParams.length === 0) {
      return { success: true };
    }

    // Extract labels from response if provided
    let labelMappings: LabelMapping[] = [];
    if (response !== undefined) {
      labelMappings = extractLabelsFromResponse(parameters, response);
    }

    // Create a map for quick label lookup: "key:value" -> label
    const labelMap = new Map<string, string>();
    for (const mapping of labelMappings) {
      labelMap.set(`${mapping.paramKey}:${mapping.paramValue}`, mapping.label);
    }

    const now = new Date();

    // Process in parallel batches
    const upsertPromises = flatParams.map((param) => {
      // Look up label for this parameter
      const displayLabel = labelMap.get(`${param.key}:${param.value}`) ?? null;

      return prisma.toolParamValue.upsert({
        where: {
          organizationId_serverId_parameterKey_parameterValue: {
            organizationId,
            serverId,
            parameterKey: param.key,
            parameterValue: param.value,
          },
        },
        create: {
          organizationId,
          serverId,
          toolName,
          parameterKey: param.key,
          parameterValue: param.value,
          displayLabel,
          occurrenceCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: now,
          // Only update displayLabel if we have a new one
          ...(displayLabel !== null ? { displayLabel } : {}),
          // Update toolName if provided (keep most recent tool that used this value)
          ...(toolName ? { toolName } : {}),
        },
      });
    });

    await Promise.all(upsertPromises);

    logger.debug('Tracked parameter values', {
      organizationId,
      serverId,
      toolName,
      paramCount: flatParams.length,
      labelsExtracted: labelMappings.length,
    });

    return { success: true };
  } catch (error) {
    // Non-blocking: log error but don't throw to avoid blocking tool execution
    logger.error('Failed to track parameter values', {
      organizationId,
      serverId,
      toolName,
      error,
    });
    return { success: false };
  }
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

export interface ParamSuggestion {
  value: string;
  /** Human-readable label for the value (e.g., "Q1 Planning" for page_abc123) */
  displayLabel: string | null;
  occurrenceCount: number;
  lastSeenAt: Date;
}

/**
 * Get historical parameter values for suggestions
 * Returns values sorted by most recently used first
 * Values are shared across all tools on the same MCP server
 */
export async function getParamHistory(
  organizationId: string,
  serverId: string,
  parameterKey: string,
  limit = DEFAULT_SUGGESTION_LIMIT,
): Promise<ParamSuggestion[]> {
  const values = await prisma.toolParamValue.findMany({
    where: {
      organizationId,
      serverId,
      parameterKey,
    },
    orderBy: [{ lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
    take: limit,
    select: {
      parameterValue: true,
      displayLabel: true,
      occurrenceCount: true,
      lastSeenAt: true,
    },
  });

  return values.map((v) => ({
    value: v.parameterValue,
    displayLabel: v.displayLabel,
    occurrenceCount: v.occurrenceCount,
    lastSeenAt: v.lastSeenAt,
  }));
}

/**
 * Search parameter values by prefix
 * Used for autocomplete suggestions
 * Searches both the value and the display label
 * Values are shared across all tools on the same MCP server
 */
export async function searchParamValues(
  organizationId: string,
  serverId: string,
  parameterKey: string,
  prefix: string,
  limit = DEFAULT_SUGGESTION_LIMIT,
): Promise<ParamSuggestion[]> {
  const values = await prisma.toolParamValue.findMany({
    where: {
      organizationId,
      serverId,
      parameterKey,
      // Search both value and label
      OR: [
        {
          parameterValue: {
            startsWith: prefix,
            mode: 'insensitive',
          },
        },
        {
          displayLabel: {
            contains: prefix,
            mode: 'insensitive',
          },
        },
      ],
    },
    orderBy: [{ lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
    take: limit,
    select: {
      parameterValue: true,
      displayLabel: true,
      occurrenceCount: true,
      lastSeenAt: true,
    },
  });

  return values.map((v) => ({
    value: v.parameterValue,
    displayLabel: v.displayLabel,
    occurrenceCount: v.occurrenceCount,
    lastSeenAt: v.lastSeenAt,
  }));
}

/**
 * Get all unique parameter keys for a server
 * Used to populate the parameter dropdown in condition builder
 * Values are shared across all tools on the same MCP server
 */
export async function getParamKeys(organizationId: string, serverId: string): Promise<string[]> {
  const result = await prisma.toolParamValue.findMany({
    where: {
      organizationId,
      serverId,
    },
    distinct: ['parameterKey'],
    select: {
      parameterKey: true,
    },
    orderBy: {
      parameterKey: 'asc',
    },
  });

  return result.map((r) => r.parameterKey);
}

/**
 * Get parameter keys across multiple servers
 * Used when configuring policies that apply to multiple servers
 */
export async function getParamKeysForServers(
  organizationId: string,
  serverIds: string[],
): Promise<Array<{ serverId: string; parameterKey: string }>> {
  const result = await prisma.toolParamValue.findMany({
    where: {
      organizationId,
      serverId: { in: serverIds },
    },
    distinct: ['serverId', 'parameterKey'],
    select: {
      serverId: true,
      parameterKey: true,
    },
    orderBy: [{ serverId: 'asc' }, { parameterKey: 'asc' }],
  });

  return result;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up old parameter values beyond retention period
 * Returns number of deleted records
 */
export async function cleanupOldParamValues(
  organizationId: string,
  retentionDays: number,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.toolParamValue.deleteMany({
    where: {
      organizationId,
      lastSeenAt: {
        lt: cutoffDate,
      },
    },
  });

  logger.info('Cleaned up old parameter values', {
    organizationId,
    retentionDays,
    deletedCount: result.count,
  });

  return result.count;
}

/**
 * Clean up parameter values for all organizations based on their settings
 * Intended to be called from a scheduled job
 */
export async function cleanupAllOrgParamValues(): Promise<{ [orgId: string]: number }> {
  const results: { [orgId: string]: number } = {};

  // Get org settings for retention days
  const orgSettings = await prisma.organizationSettings.findMany({
    select: {
      organizationId: true,
      paramHistoryRetentionDays: true,
    },
  });

  // Also get orgs without explicit settings (use default)
  const orgsWithSettings = new Set(orgSettings.map((s) => s.organizationId));
  const orgsWithoutSettings = await prisma.organization.findMany({
    where: {
      id: {
        notIn: Array.from(orgsWithSettings),
      },
    },
    select: {
      id: true,
    },
  });

  // Process orgs with explicit settings
  for (const setting of orgSettings) {
    const deleted = await cleanupOldParamValues(
      setting.organizationId,
      setting.paramHistoryRetentionDays,
    );
    results[setting.organizationId] = deleted;
  }

  // Process orgs without settings using default retention (90 days)
  const DEFAULT_RETENTION_DAYS = 90;
  for (const org of orgsWithoutSettings) {
    const deleted = await cleanupOldParamValues(org.id, DEFAULT_RETENTION_DAYS);
    results[org.id] = deleted;
  }

  return results;
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export const _testing = {
  isSensitiveKey,
  flattenParameters,
  SENSITIVE_KEYS, // Re-exported from @sentinel/shared
  MAX_VALUE_LENGTH,
  DEFAULT_SUGGESTION_LIMIT,
};
