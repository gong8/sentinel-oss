/**
 * Global Variables Service
 * Manages global variables organized by namespaces for policy condition evaluation
 */

import { GlobalVariableFieldType, Prisma, prisma } from '@sentinel/db';
import { logger } from '../lib/logger.js';

// ============================================================================
// TYPES
// ============================================================================

/** Global variable value types */
export type GlobalVariableValue = string | number | boolean | Date | string[] | number[];

/** A field within a namespace */
export interface GlobalVariableFieldData {
  name: string;
  value: GlobalVariableValue;
  type: GlobalVariableFieldType;
  description?: string;
}

/** A namespace with all its fields */
export interface GlobalVariableNamespaceData {
  name: string;
  description?: string;
  fields: Record<string, GlobalVariableValue>;
}

/** Map of all global variables for an organization */
export type GlobalVariablesMap = Record<string, Record<string, GlobalVariableValue>>;

// ============================================================================
// RESERVED NAMES
// ============================================================================

/**
 * Reserved namespace names that cannot be used
 * These conflict with built-in context categories
 */
const RESERVED_NAMESPACE_NAMES = ['context', 'params', 'sql', 'github', 'file'];

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a namespace name
 * - Must be uppercase alphanumeric with underscores
 * - Cannot be a reserved name
 * - Must start with a letter
 */
export function validateNamespaceName(name: string): { valid: boolean; error?: string } {
  // Check for reserved names (case-insensitive)
  if (RESERVED_NAMESPACE_NAMES.includes(name.toLowerCase())) {
    return {
      valid: false,
      error: `'${name}' is a reserved namespace name. Reserved names: ${RESERVED_NAMESPACE_NAMES.join(', ')}`,
    };
  }

  // Must be uppercase alphanumeric with underscores
  const namespacePattern = /^[A-Z][A-Z0-9_]*$/;
  if (!namespacePattern.test(name)) {
    return {
      valid: false,
      error:
        'Namespace name must be uppercase, start with a letter, and contain only letters, numbers, and underscores',
    };
  }

  // Length check
  if (name.length > 50) {
    return { valid: false, error: 'Namespace name must be 50 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate a field name
 * - Must be camelCase or snake_case alphanumeric
 * - Must start with a letter
 */
export function validateFieldName(name: string): { valid: boolean; error?: string } {
  // Must start with a letter and contain only alphanumeric and underscores
  const fieldPattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
  if (!fieldPattern.test(name)) {
    return {
      valid: false,
      error:
        'Field name must start with a letter and contain only letters, numbers, and underscores',
    };
  }

  // Length check
  if (name.length > 50) {
    return { valid: false, error: 'Field name must be 50 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate a field value against its declared type
 */
export function validateFieldValue(
  value: unknown,
  type: GlobalVariableFieldType,
): { valid: boolean; error?: string; normalizedValue?: GlobalVariableValue } {
  switch (type) {
    case 'STRING':
      if (typeof value !== 'string') {
        return { valid: false, error: 'Value must be a string' };
      }
      return { valid: true, normalizedValue: value };

    case 'NUMBER':
      if (typeof value === 'number' && !isNaN(value)) {
        return { valid: true, normalizedValue: value };
      }
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          return { valid: true, normalizedValue: parsed };
        }
      }
      return { valid: false, error: 'Value must be a number' };

    case 'BOOLEAN':
      if (typeof value === 'boolean') {
        return { valid: true, normalizedValue: value };
      }
      if (value === 'true') return { valid: true, normalizedValue: true };
      if (value === 'false') return { valid: true, normalizedValue: false };
      return { valid: false, error: 'Value must be a boolean (true/false)' };

    case 'DATE':
      if (value instanceof Date && !isNaN(value.getTime())) {
        return { valid: true, normalizedValue: value };
      }
      if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return { valid: true, normalizedValue: parsed };
        }
      }
      return { valid: false, error: 'Value must be a valid date (ISO 8601 format)' };

    case 'STRING_ARRAY':
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Value must be an array of strings' };
      }
      if (!value.every((v) => typeof v === 'string')) {
        return { valid: false, error: 'All array elements must be strings' };
      }
      return { valid: true, normalizedValue: value };

    case 'NUMBER_ARRAY': {
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Value must be an array of numbers' };
      }
      const numbers: number[] = [];
      for (const v of value) {
        if (typeof v === 'number' && !isNaN(v)) {
          numbers.push(v);
        } else if (typeof v === 'string') {
          const parsed = parseFloat(v);
          if (isNaN(parsed)) {
            return { valid: false, error: 'All array elements must be numbers' };
          }
          numbers.push(parsed);
        } else {
          return { valid: false, error: 'All array elements must be numbers' };
        }
      }
      return { valid: true, normalizedValue: numbers };
    }

    default:
      return { valid: false, error: `Unknown field type: ${type}` };
  }
}

// ============================================================================
// LOADING
// ============================================================================

/**
 * Load all global variables for an organization, optionally scoped to a workspace
 * Returns a map of namespace -> fields -> values
 *
 * @param organizationId - The organization ID (required)
 * @param workspaceId - Optional workspace ID for workspace-scoped variables
 *   - If provided: returns org-wide (workspaceId: null) + workspace-specific variables
 *   - If null/undefined: returns only org-wide variables (workspaceId: null)
 */
export async function loadGlobalVariablesForOrg(
  organizationId: string,
  workspaceId?: string | null,
): Promise<GlobalVariablesMap> {
  const namespaces = await prisma.globalVariableNamespace.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [
        { workspaceId: null }, // org-wide
        ...(workspaceId ? [{ workspaceId }] : []), // workspace-specific if provided
      ],
    },
    include: {
      fields: true,
    },
  });

  const result: GlobalVariablesMap = {};

  for (const namespace of namespaces) {
    const fields: Record<string, GlobalVariableValue> = {};

    for (const field of namespace.fields) {
      const value = deserializeFieldValue(field.value, field.fieldType);
      if (value !== undefined) {
        fields[field.name] = value;
      }
    }

    result[namespace.name] = fields;
  }

  logger.debug('Loaded global variables for organization', {
    organizationId,
    workspaceId: workspaceId ?? null,
    namespaceCount: namespaces.length,
    namespaces: Object.keys(result),
  });

  return result;
}

/**
 * Deserialize a field value from JSON storage
 */
function deserializeFieldValue(
  jsonValue: unknown,
  type: GlobalVariableFieldType,
): GlobalVariableValue | undefined {
  try {
    switch (type) {
      case 'STRING':
        return typeof jsonValue === 'string' ? jsonValue : String(jsonValue);

      case 'NUMBER':
        return typeof jsonValue === 'number' ? jsonValue : parseFloat(String(jsonValue));

      case 'BOOLEAN':
        return typeof jsonValue === 'boolean' ? jsonValue : jsonValue === 'true';

      case 'DATE':
        if (jsonValue instanceof Date) return jsonValue;
        if (typeof jsonValue === 'string' || typeof jsonValue === 'number') {
          return new Date(jsonValue);
        }
        return undefined;

      case 'STRING_ARRAY':
        if (Array.isArray(jsonValue)) {
          return jsonValue.map((v) => String(v));
        }
        return undefined;

      case 'NUMBER_ARRAY':
        if (Array.isArray(jsonValue)) {
          return jsonValue.map((v) => (typeof v === 'number' ? v : parseFloat(String(v))));
        }
        return undefined;

      default:
        return undefined;
    }
  } catch (error) {
    logger.warn('Failed to deserialize field value', { type, error });
    return undefined;
  }
}

/**
 * Serialize a field value for JSON storage
 */
export function serializeFieldValue(
  value: GlobalVariableValue,
  type: GlobalVariableFieldType,
): Prisma.InputJsonValue {
  switch (type) {
    case 'DATE':
      return value instanceof Date ? value.toISOString() : (value as Prisma.InputJsonValue);
    default:
      return value as Prisma.InputJsonValue;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const GLOBAL_VARIABLE_RESERVED_NAMES = RESERVED_NAMESPACE_NAMES;
