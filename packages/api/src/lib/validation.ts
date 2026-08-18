/**
 * Zod validation helpers for Admin MCP services
 *
 * These helpers reduce boilerplate for Zod schema parsing across services.
 */

import type { z } from 'zod';

/**
 * Discriminated union result type for safe parsing
 */
export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Safely parse input with a Zod schema, returning a discriminated union result.
 *
 * Use this when you want to handle errors gracefully without throwing.
 *
 * @example
 * ```typescript
 * const result = parseInput(mySchema, input);
 * if (!result.success) {
 *   return { success: false, error: result.error };
 * }
 * const data = result.data;
 * ```
 */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

/**
 * Parse input and throw on failure.
 *
 * Use this in contexts where throwing is acceptable, such as tool executors
 * that already have error handling at a higher level.
 *
 * @example
 * ```typescript
 * const data = parseInputOrThrow(mySchema, input);
 * // data is now typed and validated
 * ```
 */
export function parseInputOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errorMessages = result.error.issues.map((e) => e.message).join(', ');
    throw new Error(`Invalid input: ${errorMessages}`);
  }
  return result.data;
}
