/**
 * Type-safe JSON value utilities
 * Provides helpers for working with Prisma JSON values without unsafe 'as' casts
 */

import type { Prisma } from '@sentinel/db';

// Re-export JSON types from shared package
export type {
  JsonArray,
  JsonArrayNullable,
  JsonObject,
  JsonObjectNullable,
  JsonPrimitive,
  JsonPrimitiveNullable,
  JsonValue,
  JsonValueNullable,
} from '@sentinel/shared';

// Re-export Zod schemas from shared package
export { jsonValueNullableSchema, jsonValueSchema } from '@sentinel/shared';

/**
 * Type guard for plain objects (non-null, non-array objects)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a valid Prisma InputJsonValue
 */
function isInputJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (value === null || value === undefined) return false;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (Array.isArray(value)) return value.every((item) => item === null || isInputJsonValue(item));
  if (type === 'object') {
    return Object.values(value).every((item) => item === null || isInputJsonValue(item));
  }
  return false;
}

/**
 * Safely convert any value to a Prisma-compatible JSON value.
 * Uses JSON round-trip to ensure the value is JSON-serializable,
 * then validates with a type guard to ensure type safety without using 'as' casts.
 *
 * @param value - Any JSON-serializable value (should not be null/undefined)
 * @returns A validated Prisma.InputJsonValue
 * @throws If the value is null/undefined or contains non-JSON-serializable data
 */
export function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  // JSON round-trip ensures the value is JSON-serializable
  // and strips any non-JSON properties (functions, undefined, etc.)
  const serialized = JSON.stringify(value);
  const parsed: unknown = JSON.parse(serialized);

  // Handle null case - caller should use Prisma.JsonNull instead
  if (parsed === null) {
    throw new Error('Cannot convert null to InputJsonValue. Use Prisma.JsonNull instead.');
  }

  // Type guard validates and narrows the type
  if (!isInputJsonValue(parsed)) {
    throw new Error('Value is not a valid InputJsonValue');
  }

  return parsed;
}

/**
 * Exports for testing internal functions
 */
export const _testing = {
  isInputJsonValue,
};
