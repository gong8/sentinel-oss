/**
 * Advanced Condition Service
 *
 * Provides parsing, type checking, and evaluation of SQL-like
 * advanced policy conditions expressions.
 */

import {
  advancedConditions,
  type ASTNode,
  type ConditionError,
  type ExpressionType,
  type StoredAdvancedCondition,
} from '@sentinel/shared';

import { prisma } from '@sentinel/db';
import { isPlainObject } from '../lib/isPlainObject.js';

// Current schema version for stored expressions
const EXPRESSION_SCHEMA_VERSION = 1;

/**
 * Parse result with type information
 */
export interface AdvancedConditionParseResult {
  success: boolean;
  ast: ASTNode | null;
  errors: ConditionError[];
  typeMap?: Map<number, ExpressionType>;
}

/**
 * Autocomplete suggestion
 */
export interface AutocompleteSuggestion {
  label: string;
  kind: 'field' | 'function' | 'keyword' | 'variable';
  detail?: string;
  insertText: string;
  documentation?: string;
}

/**
 * Hover information for a symbol
 */
export interface HoverInfo {
  /** The full name/label (e.g., "COMPANY.startTime") */
  label: string;
  /** Description of the symbol */
  description: string;
  /** Type information (e.g., "number", "string") */
  type?: string;
  kind: 'function' | 'field' | 'keyword' | 'variable' | 'namespace';
}

/**
 * Parse and type check an advanced condition expression
 */
export function parseAdvancedCondition(
  expression: string,
  typeEnv?: advancedConditions.TypeEnvironment,
): AdvancedConditionParseResult {
  // Parse the expression
  const parseResult = advancedConditions.parse(expression);

  if (!parseResult.success || !parseResult.ast) {
    return {
      success: false,
      ast: parseResult.ast,
      errors: parseResult.errors,
    };
  }

  // Type check
  const typeResult = advancedConditions.typeCheck(parseResult.ast, typeEnv);

  return {
    success: typeResult.success,
    ast: parseResult.ast,
    errors: [...parseResult.errors, ...typeResult.errors],
    typeMap: typeResult.typeMap,
  };
}

/**
 * Create stored format for a validated expression
 */
export function createStoredExpression(expression: string, ast: ASTNode): StoredAdvancedCondition {
  return {
    expression,
    ast,
    version: EXPRESSION_SCHEMA_VERSION,
  };
}

/**
 * Validate a stored expression (for migrations/upgrades)
 */
export function validateStoredExpression(stored: unknown): stored is StoredAdvancedCondition {
  if (typeof stored !== 'object' || stored === null) return false;

  const obj = stored as Record<string, unknown>;
  return (
    typeof obj.expression === 'string' &&
    typeof obj.ast === 'object' &&
    obj.ast !== null &&
    typeof obj.version === 'number'
  );
}

/**
 * Evaluate an advanced condition expression against context
 */
export function evaluateAdvancedCondition(
  storedExpr: StoredAdvancedCondition,
  params: Record<string, unknown>,
  context: {
    sourceIp?: string;
    timestamp?: Date | string;
    hourOfDay?: number;
    dayOfWeek?: number;
    timezone?: string;
  },
  globals?: Record<string, Record<string, unknown>>,
): { passed: boolean; error?: string } {
  try {
    const evalContext = advancedConditions.createEvaluationContext(params, context, globals);
    const result = advancedConditions.evaluate(storedExpr.ast, evalContext);

    return {
      passed: result.success && Boolean(result.value),
      error: result.error,
    };
  } catch (e) {
    return {
      passed: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Get autocomplete suggestions for a position in the expression
 */
export async function getAutocompleteSuggestions(
  expression: string,
  cursorOffset: number,
  organizationId: string,
  toolPatterns: string[],
): Promise<AutocompleteSuggestion[]> {
  const suggestions: AutocompleteSuggestion[] = [];

  // Get context around cursor to determine what to suggest
  const beforeCursor = expression.slice(0, cursorOffset);
  const lastWord = getLastWord(beforeCursor);
  const lastChar = beforeCursor.slice(-1);

  // Check if we're in the middle of typing a field name after a namespace
  const memberContext = getMemberAccessContext(beforeCursor);

  // After a dot OR typing after a dot - suggest member access
  if (lastChar === '.' || memberContext) {
    const identifierBeforeDot = memberContext?.namespace ?? getIdentifierBeforeDot(beforeCursor);
    const filterPrefix = memberContext?.partial?.toLowerCase() ?? '';

    // Helper to add a field suggestion with filtering
    const addFieldSuggestion = (
      label: string,
      detail: string,
      kind: 'field' | 'variable' = 'field',
      documentation?: string,
    ) => {
      if (!filterPrefix || label.toLowerCase().startsWith(filterPrefix)) {
        suggestions.push({ label, kind, detail, insertText: label, documentation });
      }
    };

    if (identifierBeforeDot?.toUpperCase() === 'PARAMS') {
      // Suggest tool parameters
      const params = await getToolParamFields(organizationId, toolPatterns);
      for (const param of params) {
        addFieldSuggestion(param.name, param.type, 'field', param.description);
      }
    } else if (
      identifierBeforeDot?.toUpperCase().startsWith('PARAMS.') ||
      identifierBeforeDot?.toUpperCase().startsWith('PARAMS[')
    ) {
      // Nested path like params.pages[0]. - resolve the type at this path
      const nestedFields = await resolveNestedParamFields(
        organizationId,
        toolPatterns,
        identifierBeforeDot,
      );
      for (const field of nestedFields) {
        addFieldSuggestion(field.name, field.type, 'field', field.description);
      }
    } else if (identifierBeforeDot?.toUpperCase() === 'CONTEXT') {
      // Suggest context fields (legacy)
      addFieldSuggestion('hourOfDay', 'number');
      addFieldSuggestion('dayOfWeek', 'number');
      addFieldSuggestion('timestamp', 'string');
      addFieldSuggestion('sourceIp', 'string');
    } else if (identifierBeforeDot?.toUpperCase() === 'TIME') {
      // Suggest TIME namespace fields
      addFieldSuggestion('hourOfDay', 'number (0-23)');
      addFieldSuggestion('dayOfWeek', 'number (0-6, Sunday=0)');
      addFieldSuggestion('timestamp', 'string (ISO 8601)');
    } else if (identifierBeforeDot?.toUpperCase() === 'NETWORK') {
      // Suggest NETWORK namespace fields
      addFieldSuggestion('sourceIp', 'string');
    } else {
      // Check if it's a global variable namespace
      const globals = await getGlobalVariableNamespaces(organizationId);
      const namespace = globals.find(
        (g) => g.name.toUpperCase() === identifierBeforeDot?.toUpperCase(),
      );
      if (namespace) {
        for (const field of namespace.fields) {
          addFieldSuggestion(field.name, field.type, 'variable', field.description);
        }
      }
    }
  } else {
    // Suggest functions, keywords, and namespaces
    const prefix = lastWord.toLowerCase();

    // Functions
    const funcDocs = advancedConditions.getFunctionDocs();
    for (const func of funcDocs) {
      if (func.name.toLowerCase().startsWith(prefix)) {
        suggestions.push({
          label: func.name,
          kind: 'function',
          detail: `${func.signature} → ${func.returnType}`,
          insertText: `${func.name}($0)`,
          documentation: func.description,
        });
      }
    }

    // Keywords
    const keywords = [
      'AND',
      'OR',
      'NOT',
      'WHERE',
      'LIKE',
      'MATCHES',
      'IN',
      'EXISTS',
      'TRUE',
      'FALSE',
      'NULL',
    ];
    for (const kw of keywords) {
      if (kw.toLowerCase().startsWith(prefix)) {
        suggestions.push({
          label: kw,
          kind: 'keyword',
          insertText: kw,
        });
      }
    }

    // Namespaces
    if ('params'.startsWith(prefix)) {
      suggestions.push({
        label: 'params',
        kind: 'field',
        detail: 'Tool parameters',
        insertText: 'params',
      });
    }
    if ('context'.startsWith(prefix)) {
      suggestions.push({
        label: 'context',
        kind: 'field',
        detail: 'Request context (legacy)',
        insertText: 'context',
      });
    }
    if ('time'.startsWith(prefix)) {
      suggestions.push({
        label: 'time',
        kind: 'field',
        detail: 'Time context (hourOfDay, dayOfWeek, month, year, etc.)',
        insertText: 'time',
      });
    }
    if ('network'.startsWith(prefix)) {
      suggestions.push({
        label: 'network',
        kind: 'field',
        detail: 'Network context (sourceIp, userAgent, origin)',
        insertText: 'network',
      });
    }

    // Global variable namespaces
    const globals = await getGlobalVariableNamespaces(organizationId);
    for (const ns of globals) {
      if (ns.name.toLowerCase().startsWith(prefix)) {
        suggestions.push({
          label: ns.name,
          kind: 'variable',
          detail: 'Namespace',
          insertText: ns.name,
          documentation: ns.description,
        });
      }
    }
  }

  return suggestions;
}

/**
 * Convert simple conditions to advanced expression
 */
export function convertSimpleToAdvanced(
  conditions: Array<{
    field: string;
    operator: string;
    value?: unknown;
    valueRef?: string;
  }>,
): string {
  if (conditions.length === 0) {
    return 'true';
  }

  const parts = conditions.map((c) => conditionToExpression(c));

  if (parts.length === 1) {
    return parts[0];
  }

  // Wrap each part in parentheses and join with AND
  return parts.map((p) => `(${p})`).join(' AND ');
}

/**
 * Convert a single simple condition to expression string
 */
function conditionToExpression(condition: {
  field: string;
  operator: string;
  value?: unknown;
  valueRef?: string;
}): string {
  const { field, operator, value, valueRef } = condition;

  // Get the value to compare against
  const compareValue = valueRef ?? formatValue(value);

  switch (operator) {
    case 'equals':
      return `${field} = ${compareValue}`;
    case 'notEquals':
      return `${field} != ${compareValue}`;
    case 'lessThan':
      return `${field} < ${compareValue}`;
    case 'greaterThan':
      return `${field} > ${compareValue}`;
    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        return `(${field} >= ${formatValue(value[0])} AND ${field} <= ${formatValue(value[1])})`;
      }
      return `${field} = ${compareValue}`;
    case 'contains':
      return `${field} LIKE '%${escapeForLike(String(value))}%'`;
    case 'notContains':
      return `NOT (${field} LIKE '%${escapeForLike(String(value))}%')`;
    case 'startsWith':
      return `${field} LIKE '${escapeForLike(String(value))}%'`;
    case 'endsWith':
      return `${field} LIKE '%${escapeForLike(String(value))}'`;
    case 'matches':
      return `${field} MATCHES ${formatValue(value)}`;
    case 'in':
      return `${field} IN ${formatValue(value)}`;
    case 'notIn':
      return `NOT (${field} IN ${formatValue(value)})`;
    case 'containsAny':
      if (Array.isArray(value)) {
        const orParts = value.map((v) => `CONTAINS(${field}, ${formatValue(v)})`);
        return `(${orParts.join(' OR ')})`;
      }
      return `CONTAINS(${field}, ${compareValue})`;
    case 'containsNone':
      if (Array.isArray(value)) {
        const andParts = value.map((v) => `NOT CONTAINS(${field}, ${formatValue(v)})`);
        return `(${andParts.join(' AND ')})`;
      }
      return `NOT CONTAINS(${field}, ${compareValue})`;
    case 'exists':
      return `EXISTS(${field})`;
    case 'notExists':
      return `NOT EXISTS(${field})`;
    default:
      return `${field} = ${compareValue}`;
  }
}

/**
 * Format a value for expression syntax
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    // Escape single quotes
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v)).join(', ')}]`;
  }
  return String(value);
}

/**
 * Escape special characters for LIKE pattern
 */
function escapeForLike(str: string): string {
  return str.replace(/[%_]/g, '\\$&');
}

/**
 * Get the last word before cursor
 */
function getLastWord(text: string): string {
  const match = text.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
  return match ? match[0] : '';
}

/**
 * Get the full path before a dot (handles nested paths and array access)
 * Examples:
 *   "params." -> "params"
 *   "params.parent." -> "params.parent"
 *   "params.pages[0]." -> "params.pages[0]"
 *   "params.parent.child." -> "params.parent.child"
 */
function getIdentifierBeforeDot(text: string): string | null {
  // Remove trailing dot
  const beforeDot = text.slice(0, -1);

  // Match full path that is either at start of string or preceded by a non-path character
  // This ensures we get "params.parent" not just "parent"
  const pathMatch = beforeDot.match(
    /(?:^|[^a-zA-Z0-9_.[\]])([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\])*)$/,
  );
  if (pathMatch) {
    return pathMatch[1];
  }

  return null;
}

/**
 * Check if cursor is in a member access context (typing after a dot)
 * Returns { namespace, partial } if in member access, null otherwise
 * Examples:
 *   "params.na" -> { namespace: "params", partial: "na" }
 *   "params.parent.chi" -> { namespace: "params.parent", partial: "chi" }
 *   "params.pages[0].tit" -> { namespace: "params.pages[0]", partial: "tit" }
 */
function getMemberAccessContext(text: string): { namespace: string; partial: string } | null {
  // Match full path followed by .partial, where path is either at start or preceded by non-path char
  // This ensures we get "params.parent" not just "parent"
  const match = text.match(
    /(?:^|[^a-zA-Z0-9_.[\]])([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\])*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/,
  );
  if (match) {
    return { namespace: match[1], partial: match[2] };
  }
  return null;
}

/**
 * Parse a path like "params.pages[0]" into segments
 */
function parseAccessPath(
  path: string,
): Array<{ type: 'field'; name: string } | { type: 'index'; index: number }> {
  const segments: Array<{ type: 'field'; name: string } | { type: 'index'; index: number }> = [];
  let remaining = path;

  while (remaining.length > 0) {
    // Check for array index
    const indexMatch = remaining.match(/^\[(\d+)\]/);
    if (indexMatch) {
      segments.push({ type: 'index', index: parseInt(indexMatch[1], 10) });
      remaining = remaining.slice(indexMatch[0].length);
      if (remaining.startsWith('.')) {
        remaining = remaining.slice(1);
      }
      continue;
    }

    // Check for field name
    const fieldMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (fieldMatch) {
      segments.push({ type: 'field', name: fieldMatch[1] });
      remaining = remaining.slice(fieldMatch[0].length);
      if (remaining.startsWith('.')) {
        remaining = remaining.slice(1);
      }
      continue;
    }

    // Unknown pattern, bail out
    break;
  }

  return segments;
}

/**
 * Resolve a $ref path in a schema
 * Handles paths like "#/definitions/SomeType" or "#/$defs/SomeType"
 */
function resolveRef(
  rootSchema: Record<string, unknown>,
  refPath: string,
  visited: Set<string> = new Set(),
): Record<string, unknown> | undefined {
  // Prevent circular references
  if (visited.has(refPath)) {
    return undefined;
  }
  visited.add(refPath);

  // Only handle internal references (starting with #)
  if (!refPath.startsWith('#/')) {
    return undefined;
  }

  // Parse the path: "#/definitions/SomeType" -> ["definitions", "SomeType"]
  const parts = refPath.slice(2).split('/');

  // Navigate through the root schema
  let current: unknown = rootSchema;
  for (const part of parts) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[part];
  }

  if (!isPlainObject(current)) {
    return undefined;
  }

  // If the resolved schema also has a $ref, resolve it recursively
  if (typeof current.$ref === 'string') {
    return resolveRef(rootSchema, current.$ref, visited);
  }

  return current;
}

/**
 * Dereference a schema, resolving $ref if present
 */
function dereferenceSchema(
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  visited: Set<string> = new Set(),
): Record<string, unknown> {
  if (typeof schema.$ref === 'string') {
    const resolved = resolveRef(rootSchema, schema.$ref, visited);
    if (resolved) {
      return resolved;
    }
  }
  return schema;
}

/**
 * Extract properties from a schema, handling anyOf, allOf, oneOf, and $ref
 */
function extractSchemaProperties(
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  visited: Set<string> = new Set(),
): Array<{ name: string; type: string; description?: string }> {
  const fields: Array<{ name: string; type: string; description?: string }> = [];
  const seenNames = new Set<string>();

  // Resolve $ref if present
  const resolvedSchema = dereferenceSchema(schema, rootSchema, new Set(visited));

  const addField = (name: string, prop: Record<string, unknown>) => {
    if (seenNames.has(name)) return;
    seenNames.add(name);
    // Resolve prop too in case it has $ref
    const resolvedProp = dereferenceSchema(prop, rootSchema, new Set(visited));
    fields.push({
      name,
      type: String(resolvedProp.type ?? 'any'),
      description:
        typeof resolvedProp.description === 'string' ? resolvedProp.description : undefined,
    });
  };

  // 1. Direct properties
  if (isPlainObject(resolvedSchema.properties)) {
    for (const [key, prop] of Object.entries(resolvedSchema.properties)) {
      if (isPlainObject(prop)) {
        addField(key, prop);
      }
    }
  }

  // 2. Handle allOf - merge all schemas
  if (Array.isArray(resolvedSchema.allOf)) {
    for (const subSchema of resolvedSchema.allOf) {
      if (isPlainObject(subSchema)) {
        const subFields = extractSchemaProperties(subSchema, rootSchema, visited);
        for (const field of subFields) {
          if (!seenNames.has(field.name)) {
            seenNames.add(field.name);
            fields.push(field);
          }
        }
      }
    }
  }

  // 3. Handle anyOf/oneOf - merge all variant properties
  const variants = resolvedSchema.anyOf ?? resolvedSchema.oneOf;
  if (Array.isArray(variants)) {
    for (const variant of variants) {
      if (isPlainObject(variant)) {
        const variantFields = extractSchemaProperties(variant, rootSchema, visited);
        for (const field of variantFields) {
          if (!seenNames.has(field.name)) {
            seenNames.add(field.name);
            fields.push(field);
          }
        }
      }
    }
  }

  return fields;
}

/**
 * Navigate to a property in a schema, handling anyOf, allOf, oneOf, and $ref
 */
function navigateToProperty(
  schema: Record<string, unknown>,
  propertyName: string,
  rootSchema: Record<string, unknown>,
  visited: Set<string> = new Set(),
): Record<string, unknown> | undefined {
  // Resolve $ref if present
  const resolvedSchema = dereferenceSchema(schema, rootSchema, new Set(visited));

  // 1. Check direct properties
  if (isPlainObject(resolvedSchema.properties)) {
    const prop = resolvedSchema.properties[propertyName];
    if (isPlainObject(prop)) {
      return prop;
    }
  }

  // 2. Check allOf
  if (Array.isArray(resolvedSchema.allOf)) {
    for (const subSchema of resolvedSchema.allOf) {
      if (isPlainObject(subSchema)) {
        const result = navigateToProperty(subSchema, propertyName, rootSchema, visited);
        if (result) return result;
      }
    }
  }

  // 3. Check anyOf/oneOf
  const variants = resolvedSchema.anyOf ?? resolvedSchema.oneOf;
  if (Array.isArray(variants)) {
    for (const variant of variants) {
      if (isPlainObject(variant)) {
        const result = navigateToProperty(variant, propertyName, rootSchema, visited);
        if (result) return result;
      }
    }
  }

  return undefined;
}

/**
 * Resolve fields at a nested path like "params.pages[0]"
 * Returns the properties of the object at that path
 */
async function resolveNestedParamFields(
  organizationId: string,
  toolPatterns: string[],
  path: string,
): Promise<Array<{ name: string; type: string; description?: string }>> {
  const fields: Array<{ name: string; type: string; description?: string }> = [];

  // Parse the path - skip "params" prefix
  const segments = parseAccessPath(path);
  if (segments.length < 2 || segments[0].type !== 'field') {
    return fields;
  }

  // Skip the "params" segment
  const pathSegments = segments.slice(1);

  for (const pattern of toolPatterns) {
    if (pattern.includes('*')) continue;

    const parts = pattern.split('::');
    if (parts.length !== 2) continue;

    const [serverKey, toolName] = parts;
    if (!serverKey || !toolName) continue;

    const mcpServer = await prisma.mcpServer.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        url: { contains: serverKey },
      },
      select: { id: true },
    });

    if (!mcpServer) continue;

    const tool = await prisma.mcpTool.findFirst({
      where: {
        mcpServerId: mcpServer.id,
        name: toolName,
      },
      select: { inputSchema: true },
    });

    if (!tool?.inputSchema) continue;

    const rootSchema = tool.inputSchema as Record<string, unknown>;

    // Navigate through the schema following the path
    let currentSchema: Record<string, unknown> | undefined = rootSchema;

    for (const segment of pathSegments) {
      if (!currentSchema) break;

      if (segment.type === 'field') {
        // Navigate to a property (handles anyOf, allOf, oneOf, $ref)
        currentSchema = navigateToProperty(currentSchema, segment.name, rootSchema);
      } else if (segment.type === 'index') {
        // Resolve $ref first
        const resolved = dereferenceSchema(currentSchema, rootSchema);
        // Navigate into array items
        if (resolved.type === 'array' && isPlainObject(resolved.items)) {
          currentSchema = resolved.items as Record<string, unknown>;
        } else {
          currentSchema = undefined;
        }
      }
    }

    // If we found a schema at this path, extract its properties
    if (currentSchema) {
      // Resolve $ref first
      let resolved = dereferenceSchema(currentSchema, rootSchema);

      // If it's an array, get the items schema
      if (resolved.type === 'array' && isPlainObject(resolved.items)) {
        resolved = resolved.items as Record<string, unknown>;
      }

      // Extract properties (handles anyOf, allOf, oneOf, $ref)
      const schemaFields = extractSchemaProperties(resolved, rootSchema);
      for (const field of schemaFields) {
        if (!fields.find((f) => f.name === field.name)) {
          fields.push(field);
        }
      }
    }
  }

  return fields;
}

/**
 * Get tool parameter fields from schemas
 */
async function getToolParamFields(
  organizationId: string,
  toolPatterns: string[],
): Promise<Array<{ name: string; type: string; description?: string }>> {
  const fields: Array<{ name: string; type: string; description?: string }> = [];

  for (const pattern of toolPatterns) {
    if (pattern.includes('*')) continue;

    const parts = pattern.split('::');
    if (parts.length !== 2) continue;

    const [serverKey, toolName] = parts;
    if (!serverKey || !toolName) continue;

    const mcpServer = await prisma.mcpServer.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        url: { contains: serverKey },
      },
      select: { id: true },
    });

    if (!mcpServer) continue;

    const tool = await prisma.mcpTool.findFirst({
      where: {
        mcpServerId: mcpServer.id,
        name: toolName,
      },
      select: { inputSchema: true },
    });

    if (!tool?.inputSchema) continue;

    const schema = tool.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;

    if (properties) {
      for (const [key, prop] of Object.entries(properties)) {
        if (!fields.find((f) => f.name === key)) {
          fields.push({
            name: key,
            type: String(prop.type ?? 'any'),
            description: prop.description as string | undefined,
          });
        }
      }
    }
  }

  return fields;
}

/**
 * Get global variable namespaces and their fields
 */
async function getGlobalVariableNamespaces(
  organizationId: string,
  workspaceId?: string,
  userWorkspaceIds?: string[],
): Promise<
  Array<{
    name: string;
    description?: string;
    fields: Array<{ name: string; type: string; description?: string }>;
  }>
> {
  // Build workspace filter
  const workspaceFilter = workspaceId
    ? { workspaceId }
    : userWorkspaceIds
      ? {
          OR: [
            { workspaceId: null }, // Org-wide namespaces
            { workspaceId: { in: userWorkspaceIds } }, // User's workspace namespaces
          ],
        }
      : {};

  const namespaces = await prisma.globalVariableNamespace.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...workspaceFilter,
    },
    include: {
      fields: true,
    },
  });

  return namespaces.map((ns) => ({
    name: ns.name,
    description: ns.description ?? undefined,
    fields: ns.fields.map((f) => ({
      name: f.name,
      type: f.fieldType.toLowerCase(),
      description: f.description ?? undefined,
    })),
  }));
}

/**
 * Build type environment from tool patterns and global variables
 */
export async function buildTypeEnvironment(
  organizationId: string,
  toolPatterns: string[],
): Promise<advancedConditions.TypeEnvironment> {
  const params: Record<string, advancedConditions.ExpressionType> = {};
  const globals: Record<string, Record<string, advancedConditions.ExpressionType>> = {};

  // Count specific tool patterns (non-wildcard) to determine if params is allowed
  const specificToolPatterns = toolPatterns.filter(
    (p) => !p.includes('*') && p.split('::').length === 2,
  );
  const hasWildcard = toolPatterns.some((p) => p.includes('*'));

  // Determine if params namespace should be disallowed
  let paramsDisallowedReason: string | undefined;
  if (specificToolPatterns.length === 0 && !hasWildcard) {
    paramsDisallowedReason = 'PARAMS namespace requires a tool to be selected';
  } else if (specificToolPatterns.length > 1 || hasWildcard) {
    paramsDisallowedReason =
      'PARAMS namespace is only available when a single tool is selected. Select exactly one tool to use tool parameters in conditions.';
  }

  // Get tool parameters with full nested structure (only if params is allowed)
  if (!paramsDisallowedReason) {
    for (const pattern of toolPatterns) {
      if (pattern.includes('*')) continue;

      const parts = pattern.split('::');
      if (parts.length !== 2) continue;

      const [serverKey, toolName] = parts;
      if (!serverKey || !toolName) continue;

      const mcpServer = await prisma.mcpServer.findFirst({
        where: {
          organizationId,
          deletedAt: null,
          url: { contains: serverKey },
        },
        select: { id: true },
      });

      if (!mcpServer) continue;

      const tool = await prisma.mcpTool.findFirst({
        where: {
          mcpServerId: mcpServer.id,
          name: toolName,
        },
        select: { inputSchema: true },
      });

      if (!tool?.inputSchema) continue;

      // Use createTypeEnvFromSchema to get proper nested types
      const schema = tool.inputSchema as Record<string, unknown>;
      const typeEnv = advancedConditions.createTypeEnvFromSchema(schema);

      // Merge params (avoid duplicates)
      if (typeEnv.params) {
        for (const [key, type] of Object.entries(typeEnv.params)) {
          if (!params[key]) {
            params[key] = type;
          }
        }
      }
    }
  }

  // Get global variables
  const namespaces = await getGlobalVariableNamespaces(organizationId);
  for (const ns of namespaces) {
    globals[ns.name.toUpperCase()] = {};
    for (const field of ns.fields) {
      globals[ns.name.toUpperCase()][field.name] = mapTypeStringToExpressionType(field.type);
    }
  }

  return { params, globals, paramsDisallowedReason };
}

/**
 * Map type string to expression type
 */
function mapTypeStringToExpressionType(type: string): advancedConditions.ExpressionType {
  switch (type.toLowerCase()) {
    case 'string':
      return { kind: 'string' };
    case 'number':
    case 'integer':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'boolean' };
    case 'array':
      return { kind: 'array', elementType: { kind: 'any' } };
    case 'string_array':
      return { kind: 'array', elementType: { kind: 'string' } };
    case 'number_array':
      return { kind: 'array', elementType: { kind: 'number' } };
    default:
      return { kind: 'any' };
  }
}

/**
 * Built-in namespace field definitions
 */
const NAMESPACE_FIELDS: Record<
  string,
  Array<{ name: string; type: string; description: string }>
> = {
  TIME: [
    { name: 'hourOfDay', type: 'number', description: 'Current hour (0-23)' },
    { name: 'dayOfWeek', type: 'number', description: 'Day of week (0=Sun, 6=Sat)' },
    { name: 'timestamp', type: 'string', description: 'ISO 8601 timestamp' },
  ],
  NETWORK: [{ name: 'sourceIp', type: 'string', description: 'Source IP address' }],
  CONTEXT: [
    { name: 'hourOfDay', type: 'number', description: 'Current hour (0-23) [legacy]' },
    { name: 'dayOfWeek', type: 'number', description: 'Day of week (0-6) [legacy]' },
    { name: 'timestamp', type: 'string', description: 'ISO timestamp [legacy]' },
    { name: 'sourceIp', type: 'string', description: 'IP address [legacy]' },
  ],
  PARAMS: [{ name: '*', type: 'any', description: 'Tool input parameters' }],
};

/**
 * Keyword descriptions
 */
const KEYWORD_DOCS: Record<string, string> = {
  AND: 'Logical AND - both conditions must be true',
  OR: 'Logical OR - at least one condition must be true',
  NOT: 'Logical NOT - negates the following condition',
  WHERE: 'Filter array elements: array WHERE condition',
  LIKE: 'Pattern matching with % and _ wildcards',
  MATCHES: 'Regular expression matching',
  IN: 'Check if value is in a list',
  EXISTS: 'Check if value is not null/undefined',
  TRUE: 'Boolean true literal',
  FALSE: 'Boolean false literal',
  NULL: 'Null literal',
};

/**
 * Namespace descriptions
 */
const NAMESPACE_DOCS: Record<string, string> = {
  TIME: 'Time-related context fields',
  NETWORK: 'Network-related context fields',
  CONTEXT: 'Request context fields (legacy, use time/network instead)',
  PARAMS: 'Tool input parameters',
};

/**
 * Get hover information for a symbol at the given cursor position
 */
export async function getHoverInfo(
  expression: string,
  cursorOffset: number,
  organizationId: string,
  toolPatterns: string[],
): Promise<HoverInfo | null> {
  // Find the word at cursor position
  const wordInfo = getWordAtPosition(expression, cursorOffset);
  if (!wordInfo) {
    return null;
  }

  const { word, fullPath } = wordInfo;
  const upperWord = word.toUpperCase();

  // Check if it's a function
  const funcDocs = advancedConditions.getFunctionDocs();
  const func = funcDocs.find((f) => f.name === upperWord);
  if (func) {
    return {
      kind: 'function',
      label: func.name,
      description: func.description,
      type: `${func.signature} → ${func.returnType}`,
    };
  }

  // Check if it's a keyword - only show if it provides useful info
  if (KEYWORD_DOCS[upperWord]) {
    return {
      kind: 'keyword',
      label: upperWord,
      description: KEYWORD_DOCS[upperWord],
    };
  }

  // Check global variable namespaces first (for both namespace and namespace.field)
  const globals = await getGlobalVariableNamespaces(organizationId);

  // Skip tooltips for standalone namespace names - user already knows what they typed
  // Only show tooltips when they add value (like for fields with full paths, types, etc.)

  // Check if it's a namespace.field reference
  if (fullPath.includes('.')) {
    const parts = fullPath.split('.');
    const namespace = parts[0].toUpperCase();
    const fieldName = parts[parts.length - 1];

    // If hovering over the namespace part of a path, show namespace info
    if (upperWord === namespace) {
      // Check built-in namespaces
      if (NAMESPACE_DOCS[namespace]) {
        return {
          kind: 'namespace',
          label: parts[0],
          description: NAMESPACE_DOCS[namespace],
          type: 'namespace',
        };
      }
      // Check global variable namespaces
      const globalNs = globals.find((g) => g.name.toUpperCase() === namespace);
      if (globalNs) {
        return {
          kind: 'namespace',
          label: globalNs.name,
          description:
            globalNs.description ?? `Variable namespace with ${globalNs.fields.length} fields`,
          type: 'namespace',
        };
      }
    }

    // Check built-in namespaces for field
    const namespaceFields = NAMESPACE_FIELDS[namespace];
    if (namespaceFields) {
      const field = namespaceFields.find((f) => f.name === fieldName);
      if (field) {
        return {
          kind: 'field',
          label: `${parts[0]}.${field.name}`,
          description: field.description,
          type: field.type,
        };
      }
    }

    // Check global variable namespaces for field
    const globalNs = globals.find((g) => g.name.toUpperCase() === namespace);
    if (globalNs) {
      const field = globalNs.fields.find((f) => f.name === fieldName);
      if (field) {
        return {
          kind: 'variable',
          label: `${globalNs.name}.${field.name}`,
          description: field.description ?? `Variable from ${globalNs.name}`,
          type: field.type,
        };
      }
    }

    // Check params fields
    if (namespace === 'PARAMS') {
      const paramFields = await getToolParamFields(organizationId, toolPatterns);
      const field = paramFields.find((f) => f.name === fieldName);
      if (field) {
        return {
          kind: 'field',
          label: `params.${field.name}`,
          description: field.description ?? 'Tool parameter',
          type: field.type,
        };
      }
    }
  }

  return null;
}

/**
 * Get the word and full path at the given cursor position
 */
function getWordAtPosition(
  text: string,
  cursorOffset: number,
): { word: string; fullPath: string } | null {
  // Only show tooltip if cursor is directly on a word character
  const charAtCursor = text[cursorOffset];
  if (!charAtCursor || !/[a-zA-Z0-9_]/.test(charAtCursor)) {
    return null;
  }

  // Find word boundaries
  let start = cursorOffset;
  let end = cursorOffset;

  // Expand left
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) {
    start--;
  }

  // Expand right
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) {
    end++;
  }

  const word = text.slice(start, end);
  if (!word) {
    return null;
  }

  // Now try to get the full path (including dots and brackets)
  let pathStart = start;
  let pathEnd = end;

  // Expand left to include namespace.field patterns
  while (pathStart > 0) {
    const prev = text[pathStart - 1];
    if (prev === '.') {
      pathStart--;
      // Continue to find the identifier before the dot
      while (pathStart > 0 && /[a-zA-Z0-9_]/.test(text[pathStart - 1])) {
        pathStart--;
      }
    } else if (prev === ']') {
      // Handle array access like [0]
      pathStart--;
      while (pathStart > 0 && text[pathStart - 1] !== '[') {
        pathStart--;
      }
      if (pathStart > 0 && text[pathStart - 1] === '[') {
        pathStart--;
      }
    } else {
      break;
    }
  }

  // Expand right to include full path
  while (pathEnd < text.length) {
    const next = text[pathEnd];
    if (next === '.') {
      pathEnd++;
      // Continue to find the identifier after the dot
      while (pathEnd < text.length && /[a-zA-Z0-9_]/.test(text[pathEnd])) {
        pathEnd++;
      }
    } else if (next === '[') {
      // Handle array access
      pathEnd++;
      while (pathEnd < text.length && text[pathEnd] !== ']') {
        pathEnd++;
      }
      if (pathEnd < text.length && text[pathEnd] === ']') {
        pathEnd++;
      }
    } else {
      break;
    }
  }

  const fullPath = text.slice(pathStart, pathEnd);

  return { word, fullPath };
}
