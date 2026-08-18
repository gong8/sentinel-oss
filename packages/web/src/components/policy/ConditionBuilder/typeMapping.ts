/**
 * Type Mapping Helper
 * Maps field types to compatible GlobalVariableFieldType values
 */

import type { ConditionOperator } from './types';

/** Global variable field types (must match backend enum) */
export type GlobalVariableFieldType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'STRING_ARRAY'
  | 'NUMBER_ARRAY';

/** All available field types */
const ALL_TYPES: GlobalVariableFieldType[] = [
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'STRING_ARRAY',
  'NUMBER_ARRAY',
];

/** Operators that expect array values */
const ARRAY_OPERATORS: ConditionOperator[] = [
  'in',
  'notIn',
  'containsAny',
  'containsNone',
  'between',
];

/**
 * Get compatible GlobalVariableFieldType values for a given field type and operator
 *
 * @param fieldType - The type of the field being compared (string, number, boolean, array, dynamic/unknown)
 * @param operator - The condition operator being used
 * @returns Array of compatible GlobalVariableFieldType values
 */
export function getCompatibleVariableTypes(
  fieldType: string | undefined,
  operator: ConditionOperator,
): GlobalVariableFieldType[] {
  // For array operators, we need array types for the value
  if (ARRAY_OPERATORS.includes(operator)) {
    return ['STRING_ARRAY', 'NUMBER_ARRAY'];
  }

  // Map based on field type
  switch (fieldType) {
    case 'string':
      return ['STRING', 'DATE'];
    case 'number':
      return ['NUMBER'];
    case 'boolean':
      return ['BOOLEAN'];
    case 'array':
      return ['STRING_ARRAY', 'NUMBER_ARRAY'];
    case 'dynamic':
    case 'unknown':
    case undefined:
      // For dynamic/unknown types, allow all types
      return ALL_TYPES;
    default:
      return ALL_TYPES;
  }
}
