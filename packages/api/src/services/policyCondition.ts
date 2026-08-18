/**
 * Policy Condition Service
 * Deterministic condition evaluation for policy decisions
 *
 * This service implements the conditions engine per POLICY-ARCHITECTURE.md,
 * providing modular operators and category-based field evaluation.
 */

import type {
  BooleanNode,
  ConditionNode,
  EvaluationNode,
  JsonValueNullable,
} from '@sentinel/shared';
import { z } from 'zod';
import { logger } from '../lib/logger.js';

/**
 * Converts an unknown value to a JsonValueNullable for condition evaluation results.
 * Unlike lib/jsonValue.toJsonValue, this coerces undefined/null to null
 * and never throws - designed for safe serialization of evaluation context.
 */
function coerceToJsonValue(value: unknown): JsonValueNullable {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(coerceToJsonValue);
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValueNullable> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = coerceToJsonValue(v);
    }
    return result;
  }
  return String(value);
}

// ============================================================================
// TYPES
// ============================================================================

/** Supported condition operators */
export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'lessThan'
  | 'greaterThan'
  | 'between'
  | 'in'
  | 'notIn'
  | 'containsAny'
  | 'containsNone'
  | 'exists'
  | 'notExists'
  | 'inCidr'
  | 'notInCidr';

/** Condition categories for UI organization and operator filtering */
export type ConditionCategory = 'time' | 'network' | 'parameters' | 'extracted';

/** A single condition to evaluate */
export interface PolicyCondition {
  field: string; // e.g., "time.hourOfDay", "params.query", "sql.operation"
  operator: ConditionOperator;
  value?: unknown; // Static value - type depends on operator
  valueRef?: string; // Global variable reference "NAMESPACE.fieldName"
}

/**
 * Policy conditions - array of conditions with AND logic (all must pass)
 * Note: Previously wrapped in PolicyConditionGroup { conditions: [...] }
 * Now stored directly as an array for cleaner structure
 */
export type PolicyConditions = PolicyCondition[];

// ============================================================================
// TREE-BASED CONDITION TYPES (Phase 3: Chip Builder)
// ============================================================================

/** Unique identifier for condition nodes */
export type ConditionNodeId = string;

/** Logical operators for grouping conditions */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Leaf node representing a single condition in the tree
 */
export interface ConditionLeafNode {
  type: 'condition';
  id: ConditionNodeId;
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  valueRef?: string;
}

/**
 * Group node containing multiple conditions or nested groups
 */
export interface ConditionGroupNode {
  type: 'group';
  id: ConditionNodeId;
  logic: LogicalOperator;
  children: ConditionTreeNode[];
}

/**
 * Union type for all tree node types
 */
export type ConditionTreeNode = ConditionLeafNode | ConditionGroupNode;

/**
 * Type guards for tree nodes
 */
export function isConditionLeafNode(node: ConditionTreeNode): node is ConditionLeafNode {
  return node.type === 'condition';
}

export function isConditionGroupNode(node: ConditionTreeNode): node is ConditionGroupNode {
  return node.type === 'group';
}

/** Context available during condition evaluation */
export interface ConditionEvaluationContext {
  // Request context
  params: Record<string, unknown>;
  time: {
    timestamp: Date;
    hourOfDay: number; // 0-23
    dayOfWeek: number; // 0-6 (Sunday = 0)
    timezone?: string;
  };
  network: {
    sourceIp?: string;
  };
  // Extracted context (populated by toolContext service)
  sql?: {
    operation?: string;
    tables?: string[];
    hasSqlComment?: boolean;
  };
  github?: {
    repository?: string;
    branch?: string;
    owner?: string;
    isProtectedBranch?: boolean;
  };
  file?: {
    path?: string;
    extension?: string;
    isSensitivePath?: boolean;
  };
  // Allow additional extracted contexts
  [key: string]: unknown;
}

/** Result of evaluating a single condition */
export interface ConditionEvaluationResultSingle {
  passed: boolean;
  field: string;
  operator: ConditionOperator;
  expectedValue: JsonValueNullable;
  actualValue: JsonValueNullable;
  reason?: string;
}

/** Result of evaluating all conditions */
export interface ConditionEvaluationResult {
  passed: boolean;
  failedConditions: ConditionEvaluationResultSingle[];
  evaluationTimeMs: number;
}

/** Extended result with full evaluation tree for audit visualization */
export interface ConditionEvaluationResultWithTree extends ConditionEvaluationResult {
  /** ALL condition evaluations, not just failed ones */
  allConditions: ConditionEvaluationResultSingle[];
  /** Tree structure for visualization (root is always a boolean operator node) */
  evaluationTree: BooleanNode;
}

/** Result of validating conditions */
export interface ConditionValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const conditionOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'matches',
  'lessThan',
  'greaterThan',
  'between',
  'in',
  'notIn',
  'containsAny',
  'containsNone',
  'exists',
  'notExists',
  'inCidr',
  'notInCidr',
]);

export const policyConditionSchema = z.object({
  field: z.string().min(1),
  operator: conditionOperatorSchema,
  value: z.unknown().optional(),
  valueRef: z.string().optional(),
});

/** Schema for policy conditions (array of conditions) */
export const policyConditionsSchema = z.array(policyConditionSchema);

/** Schema for logical operators */
export const logicalOperatorSchema = z.enum(['AND', 'OR']);

/** Schema for condition leaf node */
export const conditionLeafNodeSchema = z.object({
  type: z.literal('condition'),
  id: z.string(),
  field: z.string().min(1),
  operator: conditionOperatorSchema,
  value: z.unknown().optional(),
  valueRef: z.string().optional(),
});

/** Schema for condition tree node (recursive) */
export const conditionTreeNodeSchema: z.ZodType<ConditionTreeNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    conditionLeafNodeSchema,
    z.object({
      type: z.literal('group'),
      id: z.string(),
      logic: logicalOperatorSchema,
      children: z.array(conditionTreeNodeSchema),
    }),
  ]),
);

/** Schema for condition group node (root) */
export const conditionGroupNodeSchema: z.ZodType<ConditionGroupNode> = z.object({
  type: z.literal('group'),
  id: z.string(),
  logic: logicalOperatorSchema,
  children: z.array(conditionTreeNodeSchema),
});

// ============================================================================
// OPERATOR REGISTRY
// ============================================================================

type OperatorHandler = (actual: unknown, expected: unknown) => boolean;

const operatorRegistry = new Map<ConditionOperator, OperatorHandler>();

// Equality operators
operatorRegistry.set('equals', (actual, expected) => {
  if (actual === expected) return true;
  // Handle case-insensitive string comparison
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.toLowerCase() === expected.toLowerCase();
  }
  // Handle array equality
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  }
  return false;
});

operatorRegistry.set('notEquals', (actual, expected) => {
  return !operatorRegistry.get('equals')!(actual, expected);
});

// String operators
operatorRegistry.set('contains', (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  return actual.toLowerCase().includes(expected.toLowerCase());
});

operatorRegistry.set('notContains', (actual, expected) => {
  if (typeof actual !== 'string') return true;
  if (typeof expected !== 'string') return true;
  return !actual.toLowerCase().includes(expected.toLowerCase());
});

operatorRegistry.set('startsWith', (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  return actual.toLowerCase().startsWith(expected.toLowerCase());
});

operatorRegistry.set('endsWith', (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  return actual.toLowerCase().endsWith(expected.toLowerCase());
});

operatorRegistry.set('matches', (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  try {
    const regex = new RegExp(expected, 'i');
    return regex.test(actual);
  } catch {
    logger.warn('Invalid regex in condition', { pattern: expected });
    return false;
  }
});

// Numeric operators
operatorRegistry.set('lessThan', (actual, expected) => {
  const actualNum = typeof actual === 'number' ? actual : parseFloat(String(actual));
  const expectedNum = typeof expected === 'number' ? expected : parseFloat(String(expected));
  if (isNaN(actualNum) || isNaN(expectedNum)) return false;
  return actualNum < expectedNum;
});

operatorRegistry.set('greaterThan', (actual, expected) => {
  const actualNum = typeof actual === 'number' ? actual : parseFloat(String(actual));
  const expectedNum = typeof expected === 'number' ? expected : parseFloat(String(expected));
  if (isNaN(actualNum) || isNaN(expectedNum)) return false;
  return actualNum > expectedNum;
});

operatorRegistry.set('between', (actual, expected) => {
  if (!Array.isArray(expected) || expected.length !== 2) return false;
  const actualNum = typeof actual === 'number' ? actual : parseFloat(String(actual));
  const minNum = typeof expected[0] === 'number' ? expected[0] : parseFloat(String(expected[0]));
  const maxNum = typeof expected[1] === 'number' ? expected[1] : parseFloat(String(expected[1]));
  if (isNaN(actualNum) || isNaN(minNum) || isNaN(maxNum)) return false;
  return actualNum >= minNum && actualNum <= maxNum;
});

// Set operators
operatorRegistry.set('in', (actual, expected) => {
  if (!Array.isArray(expected)) return false;
  // Case-insensitive for strings
  if (typeof actual === 'string') {
    return expected.some((v) => typeof v === 'string' && v.toLowerCase() === actual.toLowerCase());
  }
  return expected.includes(actual);
});

operatorRegistry.set('notIn', (actual, expected) => {
  return !operatorRegistry.get('in')!(actual, expected);
});

operatorRegistry.set('containsAny', (actual, expected) => {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  const actualLower = actual.map((v) => (typeof v === 'string' ? v.toLowerCase() : v));
  return expected.some((v) => {
    const vLower = typeof v === 'string' ? v.toLowerCase() : v;
    return actualLower.includes(vLower);
  });
});

operatorRegistry.set('containsNone', (actual, expected) => {
  return !operatorRegistry.get('containsAny')!(actual, expected);
});

// Existence operators
operatorRegistry.set('exists', (actual) => {
  return actual !== undefined && actual !== null;
});

operatorRegistry.set('notExists', (actual) => {
  return actual === undefined || actual === null;
});

// Network operators
operatorRegistry.set('inCidr', (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  return isIpInCidr(actual, expected);
});

operatorRegistry.set('notInCidr', (actual, expected) => {
  return !operatorRegistry.get('inCidr')!(actual, expected);
});

// ============================================================================
// CIDR HELPER FUNCTIONS
// ============================================================================

/**
 * Convert IPv4 address to numeric value
 */
function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) + num;
  }
  return result >>> 0; // Convert to unsigned
}

/**
 * Check if an IPv4 address is in a CIDR range
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const [cidrIp, prefixStr] = cidr.split('/');
  if (!cidrIp || !prefixStr) return false;

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipNum = ipv4ToNumber(ip);
  const cidrIpNum = ipv4ToNumber(cidrIp);
  if (ipNum === null || cidrIpNum === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (cidrIpNum & mask);
}

// ============================================================================
// CATEGORY REGISTRY
// ============================================================================

interface CategoryDefinition {
  id: ConditionCategory;
  name: string;
  fieldPattern: RegExp;
  operators: ConditionOperator[];
}

const categoryRegistry = new Map<ConditionCategory, CategoryDefinition>();

categoryRegistry.set('time', {
  id: 'time',
  name: 'Time-Based',
  fieldPattern: /^time\.(hourOfDay|dayOfWeek|timestamp)/,
  operators: ['equals', 'notEquals', 'between', 'in', 'notIn', 'lessThan', 'greaterThan'],
});

categoryRegistry.set('network', {
  id: 'network',
  name: 'Network',
  fieldPattern: /^network\.sourceIp/,
  operators: ['equals', 'notEquals', 'in', 'notIn', 'inCidr', 'notInCidr'],
});

categoryRegistry.set('parameters', {
  id: 'parameters',
  name: 'Parameters',
  fieldPattern: /^params\./,
  operators: [
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'matches',
    'lessThan',
    'greaterThan',
    'between',
    'in',
    'notIn',
    'containsAny',
    'containsNone',
    'exists',
    'notExists',
  ],
});

categoryRegistry.set('extracted', {
  id: 'extracted',
  name: 'Extracted Context',
  fieldPattern: /^(sql|github|file)\./,
  operators: [
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'matches',
    'in',
    'notIn',
    'containsAny',
    'containsNone',
    'exists',
    'notExists',
  ],
});

/**
 * Get the category for a field
 */
export function getCategoryForField(field: string): ConditionCategory | null {
  for (const [category, def] of categoryRegistry) {
    if (def.fieldPattern.test(field)) {
      return category;
    }
  }
  return null;
}

/**
 * Get allowed operators for a category
 */
export function getOperatorsForCategory(category: ConditionCategory): ConditionOperator[] {
  const def = categoryRegistry.get(category);
  return def?.operators ?? [];
}

/**
 * Get all category definitions
 */
export function getAllCategories(): CategoryDefinition[] {
  return Array.from(categoryRegistry.values());
}

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

/**
 * Extract a field value from the evaluation context using dot notation
 * e.g., "params.query", "time.hourOfDay", "network.sourceIp", "sql.operation"
 */
export function extractFieldValue(context: ConditionEvaluationContext, field: string): unknown {
  const parts = field.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================================
// CONDITION EVALUATION
// ============================================================================

/**
 * Evaluate a single condition against the context
 */
export function evaluateCondition(
  condition: PolicyCondition,
  context: ConditionEvaluationContext,
): ConditionEvaluationResultSingle {
  const handler = operatorRegistry.get(condition.operator);
  if (!handler) {
    return {
      passed: false,
      field: condition.field,
      operator: condition.operator,
      expectedValue: coerceToJsonValue(condition.value ?? condition.valueRef),
      actualValue: null,
      reason: `Unknown operator: ${condition.operator}`,
    };
  }

  const actualValue = extractFieldValue(context, condition.field);

  // Resolve the expected value - either static value or from valueRef (global variable)
  let expectedValue: unknown;
  if (condition.valueRef !== undefined) {
    // Resolve global variable reference from context
    expectedValue = extractFieldValue(context, condition.valueRef);
    if (expectedValue === undefined) {
      return {
        passed: false,
        field: condition.field,
        operator: condition.operator,
        expectedValue: condition.valueRef,
        actualValue: coerceToJsonValue(actualValue),
        reason: `Global variable '${condition.valueRef}' not found in context`,
      };
    }
  } else {
    expectedValue = condition.value;
  }

  const passed = handler(actualValue, expectedValue);

  return {
    passed,
    field: condition.field,
    operator: condition.operator,
    expectedValue: coerceToJsonValue(expectedValue),
    actualValue: coerceToJsonValue(actualValue),
    reason: passed
      ? undefined
      : `Field '${condition.field}' with value '${JSON.stringify(actualValue)}' did not satisfy '${condition.operator}' '${JSON.stringify(expectedValue)}'`,
  };
}

/**
 * Evaluate all conditions (AND logic)
 * All conditions must pass for the policy to match
 */
export function evaluatePolicyConditions(
  conditions: PolicyConditions | null | undefined,
  context: ConditionEvaluationContext,
): ConditionEvaluationResult {
  const startTime = performance.now();

  // No conditions means pass (conditions are optional)
  if (!conditions || conditions.length === 0) {
    return {
      passed: true,
      failedConditions: [],
      evaluationTimeMs: performance.now() - startTime,
    };
  }

  const failedConditions: ConditionEvaluationResultSingle[] = [];

  for (const condition of conditions) {
    const result = evaluateCondition(condition, context);
    if (!result.passed) {
      failedConditions.push(result);
    }
  }

  const evaluationTimeMs = performance.now() - startTime;
  const passed = failedConditions.length === 0;

  if (!passed) {
    logger.debug('Policy conditions failed', {
      totalConditions: conditions.length,
      failedCount: failedConditions.length,
      failedFields: failedConditions.map((f) => f.field),
      evaluationTimeMs,
    });
  }

  return {
    passed,
    failedConditions,
    evaluationTimeMs,
  };
}

/**
 * Evaluate all conditions with full tree for audit visualization.
 * Returns ALL condition evaluations (not just failed) and builds tree structure.
 */
export function evaluatePolicyConditionsWithTree(
  conditions: PolicyConditions | null | undefined,
  context: ConditionEvaluationContext,
): ConditionEvaluationResultWithTree {
  const startTime = performance.now();

  // No conditions means pass (conditions are optional)
  if (!conditions || conditions.length === 0) {
    return {
      passed: true,
      failedConditions: [],
      allConditions: [],
      evaluationTree: {
        type: 'AND',
        children: [],
        passed: true,
      },
      evaluationTimeMs: performance.now() - startTime,
    };
  }

  const allConditions: ConditionEvaluationResultSingle[] = [];
  const failedConditions: ConditionEvaluationResultSingle[] = [];

  for (const condition of conditions) {
    const result = evaluateCondition(condition, context);
    allConditions.push(result);
    if (!result.passed) {
      failedConditions.push(result);
    }
  }

  const evaluationTimeMs = performance.now() - startTime;
  const passed = failedConditions.length === 0;

  // Build tree structure for visualization
  const evaluationTree: BooleanNode = {
    type: 'AND',
    children: allConditions.map(
      (c): ConditionNode => ({
        type: 'condition',
        field: c.field,
        operator: c.operator,
        expectedValue: c.expectedValue,
        actualValue: c.actualValue,
        passed: c.passed,
        reason: c.reason,
      }),
    ),
    passed,
  };

  if (!passed) {
    logger.debug('Policy conditions failed', {
      totalConditions: conditions.length,
      failedCount: failedConditions.length,
      passedCount: allConditions.length - failedConditions.length,
      failedFields: failedConditions.map((f) => f.field),
      evaluationTimeMs,
    });
  }

  return {
    passed,
    failedConditions,
    allConditions,
    evaluationTree,
    evaluationTimeMs,
  };
}

// ============================================================================
// CONDITION VALIDATION
// ============================================================================

/**
 * Validate conditions structure and values
 */
export function validateConditions(conditions: unknown): ConditionValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // Null/undefined/empty is valid (no conditions)
  if (conditions === null || conditions === undefined) {
    return { valid: true, errors: [] };
  }

  // Empty array is valid
  if (Array.isArray(conditions) && conditions.length === 0) {
    return { valid: true, errors: [] };
  }

  // Validate against schema
  const parseResult = policyConditionsSchema.safeParse(conditions);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        message: issue.message,
      });
    }
    return { valid: false, errors };
  }

  const conditionsList = parseResult.data;

  // Validate each condition
  for (let i = 0; i < conditionsList.length; i++) {
    const condition = conditionsList[i];
    const conditionPath = `[${i}]`;

    // Validate field format
    if (!condition.field.includes('.')) {
      errors.push({
        field: `${conditionPath}.field`,
        message: `Field must use dot notation (e.g., 'params.query', 'time.hourOfDay')`,
      });
      continue;
    }

    // Validate value/valueRef exclusivity (except for existence operators)
    const isExistenceOperator = ['exists', 'notExists'].includes(condition.operator);
    const hasValue = condition.value !== undefined;
    const hasValueRef = condition.valueRef !== undefined;

    if (!isExistenceOperator) {
      if (hasValue && hasValueRef) {
        errors.push({
          field: `${conditionPath}`,
          message: `Cannot specify both 'value' and 'valueRef'. Use one or the other.`,
        });
        continue;
      }
      if (!hasValue && !hasValueRef) {
        errors.push({
          field: `${conditionPath}`,
          message: `Must specify either 'value' or 'valueRef'.`,
        });
        continue;
      }
    }

    // Validate valueRef format: NAMESPACE.fieldName (two parts separated by dot)
    if (hasValueRef && condition.valueRef) {
      const refParts = condition.valueRef.split('.');
      if (refParts.length !== 2 || !refParts[0] || !refParts[1]) {
        errors.push({
          field: `${conditionPath}.valueRef`,
          message: `valueRef must be in format 'NAMESPACE.fieldName' (e.g., 'LIMITS.maxAmount')`,
        });
        continue;
      }
    }

    // Validate operator is appropriate for category
    const category = getCategoryForField(condition.field);
    if (category) {
      const allowedOperators = getOperatorsForCategory(category);
      if (!allowedOperators.includes(condition.operator)) {
        errors.push({
          field: `${conditionPath}.operator`,
          message: `Operator '${condition.operator}' is not valid for category '${category}'. Allowed: ${allowedOperators.join(', ')}`,
        });
      }
    }

    // Skip value validation when using valueRef (type checking happens at runtime)
    if (hasValueRef) {
      continue;
    }

    // Validate value type for specific operators
    if (['between', 'in', 'notIn', 'containsAny', 'containsNone'].includes(condition.operator)) {
      if (!Array.isArray(condition.value)) {
        errors.push({
          field: `${conditionPath}.value`,
          message: `Operator '${condition.operator}' requires an array value`,
        });
      }
    }

    if (condition.operator === 'between') {
      if (!Array.isArray(condition.value) || condition.value.length !== 2) {
        errors.push({
          field: `${conditionPath}.value`,
          message: `Operator 'between' requires an array with exactly 2 elements [min, max]`,
        });
      }
    }

    if (['inCidr', 'notInCidr'].includes(condition.operator)) {
      if (typeof condition.value !== 'string' || !condition.value.includes('/')) {
        errors.push({
          field: `${conditionPath}.value`,
          message: `Operator '${condition.operator}' requires a CIDR notation value (e.g., '192.168.1.0/24')`,
        });
      }
    }

    if (condition.operator === 'matches') {
      if (typeof condition.value === 'string') {
        try {
          new RegExp(condition.value);
        } catch {
          errors.push({
            field: `${conditionPath}.value`,
            message: `Invalid regular expression: ${condition.value}`,
          });
        }
      } else {
        errors.push({
          field: `${conditionPath}.value`,
          message: `Operator 'matches' requires a string regex pattern`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format failed conditions into a human-readable message
 */
export function formatFailedConditions(
  failedConditions: ConditionEvaluationResultSingle[],
): string {
  if (failedConditions.length === 0) {
    return 'All conditions passed';
  }

  const messages = failedConditions.map((fc) => {
    const actualStr = fc.actualValue === undefined ? 'undefined' : JSON.stringify(fc.actualValue);
    const expectedStr = JSON.stringify(fc.expectedValue);
    return `${fc.field} (${fc.operator}): expected ${expectedStr}, got ${actualStr}`;
  });

  return `Failed conditions: ${messages.join('; ')}`;
}

/**
 * Get available fields for a set of tool patterns
 * Returns fields grouped by category
 */
export function getAvailableFieldsForTools(
  toolPatterns: string[],
): Record<ConditionCategory, string[]> {
  const fields: Record<ConditionCategory, string[]> = {
    time: ['time.hourOfDay', 'time.dayOfWeek', 'time.timestamp'],
    network: ['network.sourceIp'],
    parameters: [], // Dynamically populated from tool inputSchema
    extracted: [],
  };

  // Check if any patterns match SQL-like tools
  const hasSqlTools = toolPatterns.some(
    (p) => p.toLowerCase().includes('sql') || p.toLowerCase().includes('database'),
  );
  if (hasSqlTools) {
    fields.extracted.push('sql.operation', 'sql.tables', 'sql.hasSqlComment');
  }

  // Check if any patterns match GitHub-like tools
  const hasGithubTools = toolPatterns.some(
    (p) => p.toLowerCase().includes('github') || p.toLowerCase().includes('git'),
  );
  if (hasGithubTools) {
    fields.extracted.push(
      'github.repository',
      'github.branch',
      'github.owner',
      'github.isProtectedBranch',
    );
  }

  // Check if any patterns match file-like tools
  const hasFileTools = toolPatterns.some(
    (p) =>
      p.toLowerCase().includes('file') ||
      p.toLowerCase().includes('fs') ||
      p.toLowerCase().includes('read') ||
      p.toLowerCase().includes('write'),
  );
  if (hasFileTools) {
    fields.extracted.push('file.path', 'file.extension', 'file.isSensitivePath');
  }

  return fields;
}

// ============================================================================
// SAFE PARSING
// ============================================================================

/**
 * Safely parse policy conditions from an unknown value (e.g., Prisma JSON field)
 * Returns typed PolicyConditions if valid, null otherwise
 */
export function parsePolicyConditions(value: unknown): PolicyConditions | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parseResult = policyConditionsSchema.safeParse(value);
  if (!parseResult.success) {
    logger.debug('Failed to parse policy conditions', {
      error: parseResult.error.message,
    });
    return null;
  }

  return parseResult.data;
}

/**
 * Safely parse conditions tree from an unknown value (e.g., Prisma JSON field)
 * Returns typed ConditionGroupNode if valid, null otherwise
 */
export function parseConditionsTree(value: unknown): ConditionGroupNode | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parseResult = conditionGroupNodeSchema.safeParse(value);
  if (!parseResult.success) {
    logger.debug('Failed to parse conditions tree', {
      error: parseResult.error.message,
    });
    return null;
  }

  return parseResult.data;
}

// ============================================================================
// TREE-BASED CONDITION EVALUATION
// ============================================================================

/**
 * Evaluate a condition tree node against the context
 * Supports recursive AND/OR logic
 */
export function evaluateConditionTreeNode(
  node: ConditionTreeNode,
  context: ConditionEvaluationContext,
): { passed: boolean; results: ConditionEvaluationResultSingle[] } {
  if (isConditionLeafNode(node)) {
    // Evaluate single condition
    const condition: PolicyCondition = {
      field: node.field,
      operator: node.operator,
      value: node.value,
      valueRef: node.valueRef,
    };
    const result = evaluateCondition(condition, context);
    return {
      passed: result.passed,
      results: [result],
    };
  }

  // Group node - evaluate children with AND/OR logic
  const childResults: ConditionEvaluationResultSingle[] = [];
  let passed: boolean;

  if (node.logic === 'AND') {
    // All children must pass
    passed = true;
    for (const child of node.children) {
      const childResult = evaluateConditionTreeNode(child, context);
      childResults.push(...childResult.results);
      if (!childResult.passed) {
        passed = false;
        // Continue evaluating for complete audit trail
      }
    }
  } else {
    // OR: at least one child must pass
    passed = false;
    for (const child of node.children) {
      const childResult = evaluateConditionTreeNode(child, context);
      childResults.push(...childResult.results);
      if (childResult.passed) {
        passed = true;
        // Continue evaluating for complete audit trail
      }
    }
    // Empty OR group fails
    if (node.children.length === 0) {
      passed = false;
    }
  }

  return { passed, results: childResults };
}

/**
 * Evaluate a conditions tree (root group)
 * Returns full evaluation result with all condition evaluations
 */
export function evaluateConditionsTree(
  tree: ConditionGroupNode | null | undefined,
  context: ConditionEvaluationContext,
): ConditionEvaluationResult {
  const startTime = performance.now();

  // No tree or empty tree means pass
  if (!tree || tree.children.length === 0) {
    return {
      passed: true,
      failedConditions: [],
      evaluationTimeMs: performance.now() - startTime,
    };
  }

  const { passed, results } = evaluateConditionTreeNode(tree, context);
  const failedConditions = results.filter((r) => !r.passed);
  const evaluationTimeMs = performance.now() - startTime;

  if (!passed) {
    logger.debug('Conditions tree failed', {
      totalConditions: results.length,
      failedCount: failedConditions.length,
      failedFields: failedConditions.map((f) => f.field),
      evaluationTimeMs,
    });
  }

  return {
    passed,
    failedConditions,
    evaluationTimeMs,
  };
}

/**
 * Evaluate conditions tree with full tree for audit visualization
 */
export function evaluateConditionsTreeWithTree(
  tree: ConditionGroupNode | null | undefined,
  context: ConditionEvaluationContext,
): ConditionEvaluationResultWithTree {
  const startTime = performance.now();

  // No tree or empty tree means pass
  if (!tree || tree.children.length === 0) {
    return {
      passed: true,
      failedConditions: [],
      allConditions: [],
      evaluationTree: {
        type: 'AND',
        children: [],
        passed: true,
      },
      evaluationTimeMs: performance.now() - startTime,
    };
  }

  const { passed, results } = evaluateConditionTreeNode(tree, context);
  const failedConditions = results.filter((r) => !r.passed);
  const evaluationTimeMs = performance.now() - startTime;

  // Build tree structure for visualization
  const rawTree = buildEvaluationTree(tree, results);
  // Ensure root is always a BooleanNode (wrap single conditions in AND)
  const evaluationTree: BooleanNode =
    rawTree.type === 'condition'
      ? { type: 'AND', children: [rawTree], passed: rawTree.passed }
      : rawTree;

  return {
    passed,
    failedConditions,
    allConditions: results,
    evaluationTree,
    evaluationTimeMs,
  };
}

/**
 * Build an evaluation tree from the condition tree and evaluation results
 */
function buildEvaluationTree(
  node: ConditionTreeNode,
  results: ConditionEvaluationResultSingle[],
): EvaluationNode {
  if (isConditionLeafNode(node)) {
    // Find the result for this condition
    const result = results.find((r) => r.field === node.field);
    return {
      type: 'condition',
      field: node.field,
      operator: node.operator,
      expectedValue: result?.expectedValue ?? null,
      actualValue: result?.actualValue ?? null,
      passed: result?.passed ?? false,
      reason: result?.reason,
    } as ConditionNode;
  }

  // Group node
  const children = node.children.map((child) => buildEvaluationTree(child, results));

  // Calculate group pass status
  let passed: boolean;
  if (node.logic === 'AND') {
    passed = children.every((c) => c.passed);
  } else {
    passed = children.length === 0 ? false : children.some((c) => c.passed);
  }

  return {
    type: node.logic,
    children,
    passed,
  };
}

/**
 * Convert flat PolicyConditions to a tree structure
 * Wraps all conditions in an AND group
 */
export function flatToTree(conditions: PolicyConditions | null): ConditionGroupNode | null {
  if (!conditions || conditions.length === 0) {
    return null;
  }

  return {
    type: 'group',
    id: `root_${Date.now()}`,
    logic: 'AND',
    children: conditions.map((c, i) => ({
      type: 'condition' as const,
      id: `cond_${Date.now()}_${i}`,
      field: c.field,
      operator: c.operator,
      value: c.value,
      valueRef: c.valueRef,
    })),
  };
}

/**
 * Convert tree structure back to flat PolicyConditions
 * Only works for simple AND-only trees without nesting
 * Returns null if tree has OR logic or nested groups
 */
export function treeToFlat(tree: ConditionGroupNode | null): PolicyConditions | null {
  if (!tree || tree.children.length === 0) {
    return null;
  }

  // Can only flatten simple AND groups
  if (tree.logic !== 'AND') {
    return null;
  }

  // Check if all children are leaf nodes (no nested groups)
  for (const child of tree.children) {
    if (!isConditionLeafNode(child)) {
      return null;
    }
  }

  // All children are leaves, safe to flatten
  return tree.children.filter(isConditionLeafNode).map((leaf) => ({
    field: leaf.field,
    operator: leaf.operator,
    value: leaf.value,
    valueRef: leaf.valueRef,
  }));
}

/**
 * Validate conditions tree structure
 */
export function validateConditionsTree(tree: unknown): ConditionValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // Null/undefined is valid (no conditions)
  if (tree === null || tree === undefined) {
    return { valid: true, errors: [] };
  }

  // Validate against schema
  const parseResult = conditionGroupNodeSchema.safeParse(tree);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        message: issue.message,
      });
    }
    return { valid: false, errors };
  }

  // Recursively validate leaf conditions
  const validatedTree = parseResult.data;
  validateTreeNodeConditions(validatedTree, '', errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper to recursively validate conditions in tree
 */
function validateTreeNodeConditions(
  node: ConditionTreeNode,
  path: string,
  errors: Array<{ field: string; message: string }>,
): void {
  if (isConditionLeafNode(node)) {
    // Validate field format
    if (!node.field.includes('.')) {
      errors.push({
        field: `${path}.field`,
        message: `Field must use dot notation (e.g., 'params.query', 'time.hourOfDay')`,
      });
      return;
    }

    // Validate value/valueRef exclusivity
    const isExistenceOperator = ['exists', 'notExists'].includes(node.operator);
    const hasValue = node.value !== undefined;
    const hasValueRef = node.valueRef !== undefined;

    if (!isExistenceOperator) {
      if (hasValue && hasValueRef) {
        errors.push({
          field: path,
          message: `Cannot specify both 'value' and 'valueRef'. Use one or the other.`,
        });
        return;
      }
      if (!hasValue && !hasValueRef) {
        errors.push({
          field: path,
          message: `Must specify either 'value' or 'valueRef'.`,
        });
        return;
      }
    }
  } else {
    // Group node - validate children
    node.children.forEach((child, i) => {
      validateTreeNodeConditions(child, `${path}.children[${i}]`, errors);
    });
  }
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export const _testing = {
  operatorRegistry,
  categoryRegistry,
  ipv4ToNumber,
  isIpInCidr,
};
