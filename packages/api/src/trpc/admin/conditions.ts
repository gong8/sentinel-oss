/**
 * Admin Conditions Router
 * Handles policy condition-related API endpoints for the condition builder UI
 */

import { Prisma, prisma } from '@sentinel/db';
import { z } from 'zod';
import { isPlainObject } from '../../lib/isPlainObject.js';
import { isIdParameter } from '../../services/labelExtraction.js';
import { checkToolPattern } from '../../services/policy.js';
import { validateConditions } from '../../services/policyCondition.js';
import { getAvailableContextFields } from '../../services/toolContext.js';
import {
  getParamHistory,
  getParamKeys,
  searchParamValues,
} from '../../services/toolParamHistory.js';
import { adminProcedure, router } from '../init.js';

/**
 * Nested field schema for recursive JSON Schema extraction
 */
export interface NestedFieldSchema {
  name: string; // Full path: "params.data.content"
  label: string; // Display name: "content"
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';
  description?: string;
  enum?: string[];
  children?: NestedFieldSchema[]; // For objects
  items?: NestedFieldSchema; // For array element schema
}

/**
 * Category with nested field support
 */
export interface NestedCategoryOption {
  name: string;
  label: string;
  fields: NestedFieldSchema[];
}

/**
 * Infer the field type from a JSON Schema definition
 */
function inferFieldType(propDef: Record<string, unknown>): NestedFieldSchema['type'] {
  // Handle explicit type
  let effectiveType: string | undefined;
  if (typeof propDef.type === 'string') {
    effectiveType = propDef.type;
  } else if (Array.isArray(propDef.type)) {
    // Handle type arrays like ["string", "null"] - pick the first non-null type
    const types = propDef.type as string[];
    effectiveType = types.find((t) => t !== 'null') ?? types[0];
  }

  if (effectiveType === 'string') return 'string';
  if (effectiveType === 'number' || effectiveType === 'integer') return 'number';
  if (effectiveType === 'boolean') return 'boolean';
  if (effectiveType === 'object') return 'object';
  if (effectiveType === 'array') return 'array';

  // Infer type from structure when type is not explicit
  if (isPlainObject(propDef.properties)) return 'object';
  if (propDef.additionalProperties !== undefined && propDef.additionalProperties !== false)
    return 'object';
  if (Array.isArray(propDef.allOf)) return 'object';
  if (isPlainObject(propDef.items) || Array.isArray(propDef.items)) return 'array';
  if (typeof propDef.$ref === 'string') return 'object';

  // Check anyOf/oneOf for type hints
  if (Array.isArray(propDef.anyOf) || Array.isArray(propDef.oneOf)) {
    const variants = (propDef.anyOf ?? propDef.oneOf) as unknown[];
    for (const variant of variants) {
      if (isPlainObject(variant)) {
        const variantType = inferFieldType(variant as Record<string, unknown>);
        if (variantType !== 'unknown') return variantType;
      }
    }
  }

  return 'unknown';
}

/**
 * Extract children from a complex object schema (handles allOf, anyOf, properties)
 */
function extractObjectChildren(
  propDef: Record<string, unknown>,
  fullPath: string,
  maxDepth: number,
  currentDepth: number,
  visitedRefs: Set<string>,
): NestedFieldSchema[] {
  const children: NestedFieldSchema[] = [];
  const seenPaths = new Set<string>();

  // Helper to add children without duplicates
  const addChildren = (newChildren: NestedFieldSchema[]) => {
    for (const child of newChildren) {
      if (!seenPaths.has(child.name)) {
        seenPaths.add(child.name);
        children.push(child);
      }
    }
  };

  // 1. Direct properties
  if (isPlainObject(propDef.properties)) {
    const directChildren = extractNestedFields(
      propDef as Record<string, unknown>,
      fullPath,
      maxDepth,
      currentDepth + 1,
      visitedRefs,
    );
    addChildren(directChildren);
  }

  // 2. Handle allOf - merge all schemas
  if (Array.isArray(propDef.allOf)) {
    for (const subSchema of propDef.allOf) {
      if (!isPlainObject(subSchema)) continue;
      const subSchemaObj = subSchema as Record<string, unknown>;

      // Extract from direct properties in allOf item
      if (isPlainObject(subSchemaObj.properties)) {
        const allOfChildren = extractNestedFields(
          subSchemaObj,
          fullPath,
          maxDepth,
          currentDepth + 1,
          visitedRefs,
        );
        addChildren(allOfChildren);
      }

      // Recursively handle nested anyOf/oneOf within allOf
      if (Array.isArray(subSchemaObj.anyOf) || Array.isArray(subSchemaObj.oneOf)) {
        const nestedChildren = extractObjectChildren(
          subSchemaObj,
          fullPath,
          maxDepth,
          currentDepth,
          visitedRefs,
        );
        addChildren(nestedChildren);
      }
    }
  }

  // 3. Handle anyOf/oneOf - merge all variant properties
  if (Array.isArray(propDef.anyOf) || Array.isArray(propDef.oneOf)) {
    const variants = (propDef.anyOf ?? propDef.oneOf) as unknown[];
    for (const variant of variants) {
      if (!isPlainObject(variant)) continue;
      const variantObj = variant as Record<string, unknown>;

      // Only process object-type variants
      if (isPlainObject(variantObj.properties)) {
        const variantChildren = extractNestedFields(
          variantObj,
          fullPath,
          maxDepth,
          currentDepth + 1,
          visitedRefs,
        );
        addChildren(variantChildren);
      }
    }
  }

  // 4. Handle additionalProperties as fallback if no children found
  if (
    children.length === 0 &&
    propDef.additionalProperties !== undefined &&
    propDef.additionalProperties !== false
  ) {
    const addPropsDef = propDef.additionalProperties;
    let addPropsType: NestedFieldSchema['type'] = 'unknown';

    if (isPlainObject(addPropsDef)) {
      addPropsType = inferFieldType(addPropsDef as Record<string, unknown>);
    } else if (addPropsDef === true) {
      addPropsType = 'unknown';
    }

    const wildcardChild: NestedFieldSchema = {
      name: `${fullPath}.*`,
      label: '<any key>',
      type: addPropsType,
      description: 'Dynamic property - enter the specific key name when adding condition',
    };

    // If additionalProperties has nested structure, extract it
    if (addPropsType === 'object' && isPlainObject(addPropsDef)) {
      const nestedChildren = extractObjectChildren(
        addPropsDef as Record<string, unknown>,
        `${fullPath}.*`,
        maxDepth,
        currentDepth + 1,
        visitedRefs,
      );
      if (nestedChildren.length > 0) {
        wildcardChild.children = nestedChildren;
      }
    }

    children.push(wildcardChild);
  }

  return children;
}

/**
 * Extract nested fields from a JSON Schema recursively
 *
 * @param schema - JSON Schema object
 * @param prefix - Current path prefix (e.g., "params" or "params.data")
 * @param maxDepth - Maximum recursion depth to prevent infinite loops
 * @param currentDepth - Current recursion depth
 * @param visitedRefs - Set of visited $ref paths to prevent circular references
 * @returns Array of nested field schemas
 */
function extractNestedFields(
  schema: Record<string, unknown>,
  prefix: string,
  maxDepth = 5,
  currentDepth = 0,
  visitedRefs: Set<string> = new Set(),
): NestedFieldSchema[] {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const fields: NestedFieldSchema[] = [];
  const properties = schema.properties;

  if (!isPlainObject(properties)) {
    return fields;
  }

  for (const [propName, propDef] of Object.entries(properties)) {
    if (!isPlainObject(propDef)) continue;

    const fullPath = prefix ? `${prefix}.${propName}` : propName;
    const description = typeof propDef.description === 'string' ? propDef.description : undefined;
    const enumValues = Array.isArray(propDef.enum) ? (propDef.enum as string[]) : undefined;

    // Infer field type using the helper
    const fieldType = inferFieldType(propDef as Record<string, unknown>);

    const field: NestedFieldSchema = {
      name: fullPath,
      label: propName,
      type: fieldType,
      description,
      enum: enumValues,
    };

    // Handle nested objects - use the comprehensive extraction function
    if (fieldType === 'object') {
      const children = extractObjectChildren(
        propDef as Record<string, unknown>,
        fullPath,
        maxDepth,
        currentDepth,
        visitedRefs,
      );
      if (children.length > 0) {
        field.children = children;
      }
    }

    // Handle arrays - extract item schema
    if (fieldType === 'array' && isPlainObject(propDef.items)) {
      const itemsDef = propDef.items as Record<string, unknown>;
      const itemType = inferFieldType(itemsDef);

      // Create item schema
      const itemSchema: NestedFieldSchema = {
        name: `${fullPath}[]`,
        label: 'item',
        type: itemType,
        description:
          typeof itemsDef.description === 'string' ? itemsDef.description : 'Array element',
      };

      // If array items are objects, extract their children
      if (itemType === 'object') {
        const itemChildren = extractObjectChildren(
          itemsDef,
          `${fullPath}[]`,
          maxDepth,
          currentDepth,
          visitedRefs,
        );
        if (itemChildren.length > 0) {
          itemSchema.children = itemChildren;
        }
      }

      field.items = itemSchema;
    }

    fields.push(field);
  }

  return fields;
}

export const adminConditionsRouter = router({
  /**
   * Get the input schema for a tool
   * Used to populate parameter fields in the condition builder
   */
  getToolParamSchema: adminProcedure
    .input(
      z.object({
        toolName: z.string(), // Fully qualified: "server::toolName"
      }),
    )
    .query(async ({ ctx, input }) => {
      // Parse tool name to extract server and tool parts
      const parts = input.toolName.split('::');
      if (parts.length !== 2) {
        return { inputSchema: null };
      }

      const [serverKey, toolName] = parts;
      if (!serverKey || !toolName) {
        return { inputSchema: null };
      }

      // Find the MCP server by domain (serverKey)
      const mcpServer = await prisma.mcpServer.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          url: {
            contains: serverKey,
          },
        },
        select: { id: true },
      });

      if (!mcpServer) {
        return { inputSchema: null };
      }

      // Find the tool and get its input schema
      const tool = await prisma.mcpTool.findFirst({
        where: {
          mcpServerId: mcpServer.id,
          name: toolName,
        },
        select: {
          inputSchema: true,
        },
      });

      return {
        inputSchema: tool?.inputSchema ?? null,
      };
    }),

  /**
   * Get parameter suggestions for autocomplete
   * Returns historical values sorted by most recently used
   * Values are shared across all tools on the same MCP server
   *
   * Supports multiple search strategies:
   * 1. Exact parameter key match
   * 2. Fuzzy matching on leaf keys (e.g., "page_id" matches "id")
   * 3. ID-parameter universal matching (any ID-like key matches any other)
   * 4. Label search (prefix matches against displayLabel)
   */
  getParamSuggestions: adminProcedure
    .input(
      z.object({
        toolName: z.string(), // Fully qualified: "server::toolName"
        paramName: z.string(),
        prefix: z.string().optional(),
        limit: z.number().min(1).max(100).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { toolName, paramName, prefix, limit } = input;

      // Extract server domain from tool name (format: "server::toolName" or "server:port::toolName")
      const [domainPart] = toolName.split('::');
      if (!domainPart) {
        return { suggestions: [] };
      }

      // Extract domain and optional port
      const [domain, port] = domainPart.split(':');

      // Look up the server by URL containing the domain
      const server = await prisma.mcpServer.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          url: { contains: port ? `${domain}:${port}` : domain },
        },
        select: { id: true },
      });

      if (!server) {
        return { suggestions: [] };
      }

      const leafKey = paramName.split('.').pop() ?? paramName;
      const isSearchingForId = isIdParameter(leafKey);

      if (prefix && prefix.length > 0) {
        // Search with prefix - search both values and labels
        const suggestions = await searchParamValues(
          ctx.auth.organizationId,
          server.id,
          paramName,
          prefix,
          limit,
        );

        // If we found results with exact key match, return them
        if (suggestions.length > 0) {
          return {
            suggestions: suggestions.map((s) => ({
              value: s.value,
              label: s.displayLabel,
              count: s.occurrenceCount,
              sourceKey: undefined as string | undefined,
            })),
          };
        }

        // No exact match with prefix - search across all ID-like keys if this is an ID param
        if (isSearchingForId) {
          const allIdSuggestions = await prisma.toolParamValue.findMany({
            where: {
              organizationId: ctx.auth.organizationId,
              serverId: server.id,
              OR: [
                {
                  parameterValue: {
                    startsWith: prefix,
                    mode: 'insensitive' as Prisma.QueryMode,
                  },
                },
                {
                  displayLabel: {
                    contains: prefix,
                    mode: 'insensitive' as Prisma.QueryMode,
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
              parameterKey: true,
            },
          });

          // Filter to only ID-like keys
          const idResults = allIdSuggestions.filter((v) => {
            const vLeaf = v.parameterKey.split('.').pop() ?? v.parameterKey;
            return isIdParameter(vLeaf);
          });

          if (idResults.length > 0) {
            return {
              suggestions: idResults.map((v) => ({
                value: v.parameterValue,
                label: v.displayLabel,
                count: v.occurrenceCount,
                sourceKey: v.parameterKey !== paramName ? v.parameterKey : undefined,
              })),
            };
          }
        }

        return { suggestions: [] };
      }

      // No prefix - get all values sorted by most recently used
      const exactSuggestions = await getParamHistory(
        ctx.auth.organizationId,
        server.id,
        paramName,
        limit,
      );

      // If exact match found, return those
      if (exactSuggestions.length > 0) {
        return {
          suggestions: exactSuggestions.map((s) => ({
            value: s.value,
            label: s.displayLabel,
            count: s.occurrenceCount,
            sourceKey: undefined as string | undefined,
          })),
        };
      }

      // No exact match - try fuzzy matching
      // Get all keys for this server and find related ones
      const allKeys = await getParamKeys(ctx.auth.organizationId, server.id);

      // Find keys that match the leaf key or are semantically related
      const relatedKeys = allKeys.filter((key) => {
        const keyLeaf = key.split('.').pop() ?? key;

        // Exact leaf match
        if (keyLeaf === leafKey) return true;

        // Partial matches
        if (keyLeaf.includes(leafKey) || leafKey.includes(keyLeaf)) return true;

        // ID-to-ID matching: any ID-like key matches any other ID-like key
        if (isSearchingForId && isIdParameter(keyLeaf)) return true;

        // Special case: if searching for something like "page_id", also match "id"
        if (leafKey.endsWith('_id') && keyLeaf === 'id') return true;
        if (keyLeaf.endsWith('_id') && leafKey === 'id') return true;

        return false;
      });

      // Fetch suggestions from all related keys
      if (relatedKeys.length > 0) {
        const relatedSuggestions = await prisma.toolParamValue.findMany({
          where: {
            organizationId: ctx.auth.organizationId,
            serverId: server.id,
            parameterKey: { in: relatedKeys },
          },
          orderBy: [{ lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
          take: limit,
          select: {
            parameterValue: true,
            displayLabel: true,
            occurrenceCount: true,
            lastSeenAt: true,
            parameterKey: true,
          },
        });

        return {
          suggestions: relatedSuggestions.map((v) => ({
            value: v.parameterValue,
            label: v.displayLabel,
            count: v.occurrenceCount,
            // Include source key so frontend can show "value (from: id)" for fuzzy matches
            sourceKey: v.parameterKey !== paramName ? v.parameterKey : undefined,
          })),
        };
      }

      return { suggestions: [] };
    }),

  /**
   * Search for parameter values by label text
   * Allows finding IDs by their human-readable names across all tools on a server
   * e.g., "Applications Tracker 2026" -> returns the page ID
   */
  searchByLabel: adminProcedure
    .input(
      z.object({
        serverId: z.string().cuid().optional(), // Optional - search across all servers if not provided
        serverDomain: z.string().optional(), // Alternative to serverId - domain from tool name
        labelQuery: z.string().min(1),
        limit: z.number().min(1).max(100).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverId, serverDomain, labelQuery, limit } = input;

      // Build server filter
      let serverFilter: { serverId?: string; serverId_in?: string[] } | undefined;

      if (serverId) {
        // Explicit server ownership check before using serverId
        const server = await prisma.mcpServer.findFirst({
          where: {
            id: serverId,
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!server) {
          // Server not found or doesn't belong to org - return empty results
          return { results: [] };
        }

        serverFilter = { serverId: server.id };
      } else if (serverDomain) {
        // Look up the server by domain
        const server = await prisma.mcpServer.findFirst({
          where: {
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
            url: { contains: serverDomain },
          },
          select: { id: true },
        });
        if (server) {
          serverFilter = { serverId: server.id };
        }
      }

      // Search for values matching the label
      const results = await prisma.toolParamValue.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...serverFilter,
          displayLabel: {
            contains: labelQuery,
            mode: 'insensitive',
          },
        },
        orderBy: [{ lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
        take: limit,
        select: {
          parameterValue: true,
          displayLabel: true,
          parameterKey: true,
          serverId: true,
          toolName: true,
          occurrenceCount: true,
        },
      });

      return {
        results: results.map((r) => ({
          value: r.parameterValue,
          label: r.displayLabel,
          parameterKey: r.parameterKey,
          serverId: r.serverId,
          toolName: r.toolName,
          count: r.occurrenceCount,
        })),
      };
    }),

  /**
   * Get parameter keys for a server
   * Used to populate parameter dropdown in condition builder
   * Keys are shared across all tools on the same MCP server
   */
  getParamKeys: adminProcedure
    .input(
      z.object({
        toolName: z.string(), // Fully qualified: "server::toolName"
      }),
    )
    .query(async ({ ctx, input }) => {
      // Extract server domain from tool name
      const [domainPart] = input.toolName.split('::');
      if (!domainPart) {
        return { keys: [] };
      }

      const [domain, port] = domainPart.split(':');

      // Look up the server by URL containing the domain
      const server = await prisma.mcpServer.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          url: { contains: port ? `${domain}:${port}` : domain },
        },
        select: { id: true },
      });

      if (!server) {
        return { keys: [] };
      }

      const keys = await getParamKeys(ctx.auth.organizationId, server.id);
      return { keys };
    }),

  /**
   * Get available context fields for tool patterns
   * Used to populate field dropdown in condition builder
   */
  getContextFieldsForTools: adminProcedure
    .input(
      z.object({
        toolPatterns: z.array(z.string()).max(50),
      }),
    )
    .query(({ input }) => {
      const fields = getAvailableContextFields(input.toolPatterns);
      return { fields };
    }),

  /**
   * Validate policy conditions structure
   * Used for client-side validation before saving
   */
  validateConditions: adminProcedure
    .input(
      z.object({
        // Accept array of conditions for validation
        conditions: z
          .array(z.unknown())
          .max(100)
          .refine((val) => JSON.stringify(val).length < 100000, {
            message: 'Conditions payload too large',
          }),
      }),
    )
    .mutation(({ input }) => {
      const result = validateConditions(input.conditions);
      return result;
    }),

  /**
   * Get all available operators grouped by category
   * Used to populate operator dropdown in condition builder
   */
  getOperators: adminProcedure.query(() => {
    return {
      operators: {
        // Comparison operators - for numbers and equality checks
        comparison: [
          { name: 'equals', label: 'Equals', types: ['string', 'number', 'boolean'] },
          { name: 'notEquals', label: 'Not equals', types: ['string', 'number'] },
          { name: 'lessThan', label: 'Less than', types: ['number'] },
          { name: 'greaterThan', label: 'Greater than', types: ['number'] },
          { name: 'between', label: 'Between', types: ['number'] },
        ],
        // String operators - text matching
        string: [
          { name: 'contains', label: 'Contains', types: ['string'] },
          { name: 'notContains', label: 'Does not contain', types: ['string'] },
          { name: 'startsWith', label: 'Starts with', types: ['string'] },
          { name: 'endsWith', label: 'Ends with', types: ['string'] },
          { name: 'matches', label: 'Matches regex', types: ['string'] },
        ],
        // Collection operators - list membership
        collection: [
          { name: 'in', label: 'In list', types: ['string', 'number'] },
          { name: 'notIn', label: 'Not in list', types: ['string', 'number'] },
          { name: 'containsAny', label: 'Contains any of', types: ['array'] },
          { name: 'containsNone', label: 'Contains none of', types: ['array'] },
        ],
        // Existence operators - field presence
        existence: [
          { name: 'exists', label: 'Exists', types: ['any'] },
          { name: 'notExists', label: 'Does not exist', types: ['any'] },
        ],
        // Network operators - removed as too specialized for IP fields only
        network: [],
      },
    };
  }),

  /**
   * Get dynamic categories and fields based on selected tool patterns
   * Returns time/network always, plus tool parameters from schema,
   * plus extracted contexts only for matching tools
   */
  getDynamicCategories: adminProcedure
    .input(
      z.object({
        toolPatterns: z.array(z.string()).max(50), // Fully qualified: "server::toolName"
      }),
    )
    .query(async ({ ctx, input }) => {
      const categories: Array<{
        name: string;
        label: string;
        fields: Array<{
          name: string;
          label: string;
          type: string;
          description?: string;
          enum?: string[];
        }>;
      }> = [];

      // 1. Always include time-based conditions
      categories.push({
        name: 'time',
        label: 'Time-based',
        fields: [
          { name: 'time.hourOfDay', label: 'Hour of day (0-23)', type: 'number' },
          { name: 'time.dayOfWeek', label: 'Day of week (0=Sun, 6=Sat)', type: 'number' },
          { name: 'time.timestamp', label: 'Timestamp (ISO 8601)', type: 'string' },
        ],
      });

      // 2. Always include network conditions
      categories.push({
        name: 'network',
        label: 'Network',
        fields: [{ name: 'network.sourceIp', label: 'Source IP address', type: 'string' }],
      });

      // 3. Fetch tool parameters from schema for each selected tool
      const paramFields: Array<{
        name: string;
        label: string;
        type: string;
        description?: string;
        enum?: string[];
      }> = [];

      for (const toolPattern of input.toolPatterns) {
        // Skip wildcard patterns - can't fetch schema for those
        if (toolPattern.includes('*')) continue;

        const parts = toolPattern.split('::');
        if (parts.length !== 2) continue;

        const [serverKey, toolName] = parts;
        if (!serverKey || !toolName) continue;

        // Find the MCP server by domain (serverKey)
        const mcpServer = await prisma.mcpServer.findFirst({
          where: {
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
            url: { contains: serverKey },
          },
          select: { id: true },
        });

        if (!mcpServer) continue;

        // Find the tool and get its input schema
        const tool = await prisma.mcpTool.findFirst({
          where: {
            mcpServerId: mcpServer.id,
            name: toolName,
          },
          select: { inputSchema: true, name: true },
        });

        if (!tool?.inputSchema) continue;

        // Extract parameter fields from JSON Schema (with type guards)
        const schema = tool.inputSchema;
        if (!isPlainObject(schema)) continue;

        const { properties } = schema;
        if (!isPlainObject(properties)) continue;

        for (const [paramName, paramDef] of Object.entries(properties)) {
          if (!isPlainObject(paramDef)) continue;

          const jsonType = typeof paramDef.type === 'string' ? paramDef.type : undefined;
          const description =
            typeof paramDef.description === 'string' ? paramDef.description : undefined;
          const enumValues = Array.isArray(paramDef.enum) ? (paramDef.enum as string[]) : undefined;

          // Map JSON Schema types to our field types
          let fieldType = 'string';
          if (jsonType === 'number' || jsonType === 'integer') fieldType = 'number';
          else if (jsonType === 'boolean') fieldType = 'boolean';
          else if (jsonType === 'array') fieldType = 'array';

          // Check if we already have this param (avoid duplicates)
          const existingField = paramFields.find((f) => f.name === `params.${paramName}`);
          if (!existingField) {
            paramFields.push({
              name: `params.${paramName}`,
              label: paramName,
              type: fieldType,
              description: description,
              enum: enumValues,
            });
          }
        }
      }

      // Add tool parameters category if we found any
      if (paramFields.length > 0) {
        categories.push({
          name: 'parameters',
          label: 'Tool Parameters',
          fields: paramFields,
        });
      }

      // 4. Add extracted contexts only if tool patterns match
      const toolPatternsLower = input.toolPatterns.map((p) => p.toLowerCase());

      // SQL context - for SQL/database tools
      const hasSqlTools = toolPatternsLower.some(
        (p) =>
          p.includes('sql') ||
          p.includes('database') ||
          p.includes('postgres') ||
          p.includes('mysql') ||
          p.includes('query'),
      );
      if (hasSqlTools) {
        categories.push({
          name: 'extracted.sql',
          label: 'SQL Context',
          fields: [
            {
              name: 'extracted.sql.sqlOperation',
              label: 'SQL operation type',
              type: 'string',
              enum: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE'],
            },
            { name: 'extracted.sql.sqlTables', label: 'Tables accessed', type: 'array' },
            { name: 'extracted.sql.hasSqlComment', label: 'Has SQL comment', type: 'boolean' },
          ],
        });
      }

      // GitHub context - for GitHub/git tools
      const hasGithubTools = toolPatternsLower.some(
        (p) => p.includes('github') || p.includes('git') || p.includes('repo'),
      );
      if (hasGithubTools) {
        categories.push({
          name: 'extracted.github',
          label: 'GitHub Context',
          fields: [
            { name: 'extracted.github.gitRepository', label: 'Repository name', type: 'string' },
            { name: 'extracted.github.gitBranch', label: 'Branch name', type: 'string' },
            { name: 'extracted.github.gitOwner', label: 'Repository owner', type: 'string' },
            {
              name: 'extracted.github.isProtectedBranch',
              label: 'Is protected branch',
              type: 'boolean',
            },
          ],
        });
      }

      // File context - for file/filesystem tools
      const hasFileTools = toolPatternsLower.some(
        (p) =>
          p.includes('file') ||
          p.includes('fs') ||
          p.includes('read') ||
          p.includes('write') ||
          p.includes('path'),
      );
      if (hasFileTools) {
        categories.push({
          name: 'extracted.file',
          label: 'File Context',
          fields: [
            { name: 'extracted.file.filePath', label: 'File path', type: 'string' },
            { name: 'extracted.file.fileExtension', label: 'File extension', type: 'string' },
            { name: 'extracted.file.isSensitivePath', label: 'Is sensitive path', type: 'boolean' },
          ],
        });
      }

      return { categories };
    }),

  /**
   * Get nested categories with hierarchical field structures
   * Returns the same categories as getDynamicCategories but with nested field support
   * for objects and arrays in tool parameter schemas
   */
  getNestedCategories: adminProcedure
    .input(
      z.object({
        toolPatterns: z.array(z.string()).max(50), // Fully qualified: "server::toolName"
      }),
    )
    .query(async ({ ctx, input }) => {
      const categories: NestedCategoryOption[] = [];

      // 1. Always include time-based conditions (flat structure)
      categories.push({
        name: 'time',
        label: 'Time-based',
        fields: [
          { name: 'time.hourOfDay', label: 'Hour of day', type: 'number', description: '0-23' },
          {
            name: 'time.dayOfWeek',
            label: 'Day of week',
            type: 'number',
            description: '0=Sun, 6=Sat',
          },
          {
            name: 'time.timestamp',
            label: 'Timestamp',
            type: 'string',
            description: 'ISO 8601',
          },
        ],
      });

      // 2. Always include network conditions (flat structure)
      categories.push({
        name: 'network',
        label: 'Network',
        fields: [
          {
            name: 'network.sourceIp',
            label: 'Source IP',
            type: 'string',
            description: 'Source IP address',
          },
        ],
      });

      // 3. Fetch tool parameters from schema for each selected tool - with nested extraction
      const paramFields: NestedFieldSchema[] = [];

      for (const toolPattern of input.toolPatterns) {
        // Skip wildcard patterns - can't fetch schema for those
        if (toolPattern.includes('*')) continue;

        const parts = toolPattern.split('::');
        if (parts.length !== 2) continue;

        const [serverKey, toolName] = parts;
        if (!serverKey || !toolName) continue;

        // Find the MCP server by domain (serverKey)
        const mcpServer = await prisma.mcpServer.findFirst({
          where: {
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
            url: { contains: serverKey },
          },
          select: { id: true },
        });

        if (!mcpServer) continue;

        // Find the tool and get its input schema
        const tool = await prisma.mcpTool.findFirst({
          where: {
            mcpServerId: mcpServer.id,
            name: toolName,
          },
          select: { inputSchema: true, name: true },
        });

        if (!tool?.inputSchema) continue;

        // Extract nested parameter fields from JSON Schema
        const schema = tool.inputSchema;
        if (!isPlainObject(schema)) continue;

        const nestedFields = extractNestedFields(schema as Record<string, unknown>, 'params');

        // Merge fields, avoiding duplicates
        for (const field of nestedFields) {
          const existing = paramFields.find((f) => f.name === field.name);
          if (!existing) {
            paramFields.push(field);
          }
        }
      }

      // Add tool parameters category if we found any
      if (paramFields.length > 0) {
        categories.push({
          name: 'parameters',
          label: 'Tool Parameters',
          fields: paramFields,
        });
      }

      // 4. Add extracted contexts only if tool patterns match
      const toolPatternsLower = input.toolPatterns.map((p) => p.toLowerCase());

      // SQL context - for SQL/database tools
      const hasSqlTools = toolPatternsLower.some(
        (p) =>
          p.includes('sql') ||
          p.includes('database') ||
          p.includes('postgres') ||
          p.includes('mysql') ||
          p.includes('query'),
      );
      if (hasSqlTools) {
        categories.push({
          name: 'extracted.sql',
          label: 'SQL Context',
          fields: [
            {
              name: 'extracted.sql.sqlOperation',
              label: 'SQL operation',
              type: 'string',
              description: 'Type of SQL operation',
              enum: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE'],
            },
            {
              name: 'extracted.sql.sqlTables',
              label: 'Tables accessed',
              type: 'array',
              description: 'List of tables',
            },
            {
              name: 'extracted.sql.hasSqlComment',
              label: 'Has SQL comment',
              type: 'boolean',
              description: 'Whether the query contains a comment',
            },
          ],
        });
      }

      // GitHub context - for GitHub/git tools
      const hasGithubTools = toolPatternsLower.some(
        (p) => p.includes('github') || p.includes('git') || p.includes('repo'),
      );
      if (hasGithubTools) {
        categories.push({
          name: 'extracted.github',
          label: 'GitHub Context',
          fields: [
            {
              name: 'extracted.github.gitRepository',
              label: 'Repository',
              type: 'string',
              description: 'Repository name',
            },
            {
              name: 'extracted.github.gitBranch',
              label: 'Branch',
              type: 'string',
              description: 'Branch name',
            },
            {
              name: 'extracted.github.gitOwner',
              label: 'Owner',
              type: 'string',
              description: 'Repository owner',
            },
            {
              name: 'extracted.github.isProtectedBranch',
              label: 'Protected branch',
              type: 'boolean',
              description: 'Is protected branch',
            },
          ],
        });
      }

      // File context - for file/filesystem tools
      const hasFileTools = toolPatternsLower.some(
        (p) =>
          p.includes('file') ||
          p.includes('fs') ||
          p.includes('read') ||
          p.includes('write') ||
          p.includes('path'),
      );
      if (hasFileTools) {
        categories.push({
          name: 'extracted.file',
          label: 'File Context',
          fields: [
            {
              name: 'extracted.file.filePath',
              label: 'File path',
              type: 'string',
              description: 'Full file path',
            },
            {
              name: 'extracted.file.fileExtension',
              label: 'Extension',
              type: 'string',
              description: 'File extension',
            },
            {
              name: 'extracted.file.isSensitivePath',
              label: 'Sensitive path',
              type: 'boolean',
              description: 'Is sensitive path',
            },
          ],
        });
      }

      return { categories };
    }),

  /**
   * @deprecated Use getDynamicCategories instead
   * Get all available context categories and their fields (static)
   */
  getCategories: adminProcedure.query(() => {
    return {
      categories: [
        {
          name: 'time',
          label: 'Time-based',
          fields: [
            { name: 'time.hourOfDay', label: 'Hour of day (0-23)', type: 'number' },
            { name: 'time.dayOfWeek', label: 'Day of week (0=Sun, 6=Sat)', type: 'number' },
            { name: 'time.timestamp', label: 'Timestamp (ISO 8601)', type: 'string' },
          ],
        },
        {
          name: 'network',
          label: 'Network',
          fields: [{ name: 'network.sourceIp', label: 'Source IP address', type: 'string' }],
        },
      ],
    };
  }),

  /**
   * Get condition fields used by policies that match a specific tool
   * Used by playground to highlight relevant fields in the parameter builder
   */
  getConditionFieldsForTool: adminProcedure
    .input(z.object({ toolName: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all policies that have conditions and match this tool
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          enabled: true,
          conditions: { not: Prisma.DbNull },
        },
        select: { conditions: true, toolPatterns: true },
      });

      // Filter to policies that match this tool
      const matchingPolicies = policies.filter((p) =>
        p.toolPatterns.some((tp) => checkToolPattern(tp, input.toolName)),
      );

      // Extract all condition fields
      const fields = new Set<string>();
      for (const policy of matchingPolicies) {
        const conditions = policy.conditions;
        if (Array.isArray(conditions)) {
          for (const condition of conditions) {
            if (
              typeof condition === 'object' &&
              condition !== null &&
              'field' in condition &&
              typeof condition.field === 'string'
            ) {
              fields.add(condition.field);
            }
          }
        }
      }

      return { fields: Array.from(fields) };
    }),
});
