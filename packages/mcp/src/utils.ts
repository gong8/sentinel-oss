/**
 * Shared utility functions for the MCP package
 */

// Re-export security utilities from shared package
// Import separately for local use
import { isPlainObject, isSensitiveKey, SENSITIVE_KEY_REGEX } from '@sentinel/shared';

export { isPlainObject, isSensitiveKey, SENSITIVE_KEY_REGEX };

/**
 * Create a timeout promise that rejects after the specified duration
 *
 * @param ms - Timeout in milliseconds
 * @param message - Error message for the timeout
 * @returns A promise that rejects after the timeout
 */
export function createTimeoutPromise(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
}

/**
 * Execute a promise with a timeout
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutMessage - Error message if timeout occurs
 * @returns The result of the promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return Promise.race([promise, createTimeoutPromise(timeoutMs, timeoutMessage)]);
}

/**
 * Build standard MCP HTTP headers
 *
 * @param additionalHeaders - Optional additional headers to include
 * @returns Headers object for MCP requests
 */
export function buildMcpHeaders(
  additionalHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...additionalHeaders,
  };
}

/**
 * Convert null/undefined to undefined (useful for API response normalization)
 */
export function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value;
}

/**
 * Deep merges two objects, with source values overriding target values.
 * Arrays are replaced, not merged.
 */
export function mergeDeep<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      output[key] = mergeDeep(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      output[key] = sourceValue as T[keyof T];
    }
  }
  return output;
}
