/**
 * Types for the ConditionBuilder component
 */

export type ConditionOperator =
  // Comparison
  | 'equals'
  | 'notEquals'
  | 'lessThan'
  | 'greaterThan'
  | 'between'
  // String matching
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  // Collection
  | 'in'
  | 'notIn'
  | 'containsAny'
  | 'containsNone'
  // Existence
  | 'exists'
  | 'notExists'
  // Network (kept for backward compatibility, not shown in UI)
  | 'inCidr'
  | 'notInCidr';

export interface PolicyCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  valueRef?: string;
}

/** Mode for value input - static value or global variable reference */
export type ValueMode = 'static' | 'variable';

/**
 * Policy conditions - flat array of conditions with AND logic
 * Note: Previously wrapped in PolicyConditionGroup { conditions: [...] }
 * Now stored directly as an array for cleaner structure
 */
export type PolicyConditions = PolicyCondition[];

export interface FieldOption {
  name: string;
  label: string;
  /** Field type - common values: 'string', 'number', 'boolean', 'array', 'dynamic' */
  type: string;
  enum?: string[];
  description?: string;
}

export interface CategoryOption {
  name: string;
  label: string;
  fields: FieldOption[];
}

/**
 * Nested field schema for hierarchical JSON Schema display
 * Used by the ConditionsModal tree view
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
 * Utility function to find a field by path in nested categories
 */
export function findNestedField(
  categories: NestedCategoryOption[],
  path: string,
): NestedFieldSchema | undefined {
  for (const category of categories) {
    const found = findFieldInSchema(category.fields, path);
    if (found) return found;
  }
  return undefined;
}

function findFieldInSchema(
  fields: NestedFieldSchema[],
  path: string,
): NestedFieldSchema | undefined {
  for (const field of fields) {
    if (field.name === path) return field;
    if (field.children) {
      const found = findFieldInSchema(field.children, path);
      if (found) return found;
    }
    if (field.items) {
      if (field.items.name === path) return field.items;
      if (field.items.children) {
        const found = findFieldInSchema(field.items.children, path);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/**
 * Check if a field type is a leaf (selectable for conditions)
 * Unknown types are also selectable since they could be primitives
 */
export function isLeafFieldType(
  type: NestedFieldSchema['type'],
): type is 'string' | 'number' | 'boolean' | 'unknown' {
  return type === 'string' || type === 'number' || type === 'boolean' || type === 'unknown';
}

/**
 * Get display label for a field type
 */
export function getFieldTypeLabel(type: NestedFieldSchema['type']): string {
  switch (type) {
    case 'string':
      return 'str';
    case 'number':
      return 'num';
    case 'boolean':
      return 'bool';
    case 'object':
      return 'obj';
    case 'array':
      return 'arr';
    case 'unknown':
      return 'any';
    default:
      return '?';
  }
}

export interface OperatorOption {
  name: ConditionOperator;
  label: string;
  types: string[];
}

export interface OperatorGroups {
  comparison: OperatorOption[];
  string: OperatorOption[];
  collection: OperatorOption[];
  existence: OperatorOption[];
  network: OperatorOption[];
}

export interface ParamSuggestion {
  value: string;
  /** Human-readable label for the value (e.g., "Q1 Planning" for page_abc123) */
  label?: string | null;
  count: number;
}

/** Mode for the condition builder UI */
export type ConditionBuilderMode = 'visual' | 'json';

// Re-export tree types from ChipBuilder for convenience
export type {
  ConditionGroupNode,
  ConditionLeafNode,
  ConditionTreeNode,
  LogicalOperator,
} from './ChipBuilder/types';
