/**
 * Shared Security Utilities
 * Common functions for detecting and redacting sensitive data across packages
 */

/**
 * Regex pattern for identifying sensitive credential keys.
 * Matches common patterns like "api_key", "secret", "token", etc.
 */
export const SENSITIVE_KEY_REGEX = /key|secret|token|password|credential|auth/i;

/**
 * Additional sensitive key patterns for more comprehensive detection.
 * Used for substring matching in key names.
 */
export const SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'key',
  'credential',
  'auth',
  'api_key',
  'apiKey',
  'private',
  'bearer',
  'authorization',
  'session',
  'cookie',
];

/**
 * Type guard to check if a value is a plain object
 * (i.e., not an array, null, or other non-object type)
 *
 * A plain object is one that:
 * - Is not null
 * - Has typeof 'object'
 * - Is not an array
 * - Has Object.prototype or null as its prototype (plain objects only)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Check if a key name indicates a sensitive value.
 * Uses both regex pattern matching and substring matching for comprehensive detection.
 */
export function isSensitiveKey(key: string): boolean {
  // First check the regex pattern (fast path for common patterns)
  if (SENSITIVE_KEY_REGEX.test(key)) {
    return true;
  }
  // Then check for substring matches in the extended list
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));
}

/**
 * Recursively sanitize an object by redacting sensitive keys.
 * Preserves the structure of the input, replacing sensitive values with '[REDACTED]'.
 *
 * This function works with unknown input and returns unknown output.
 * Callers should validate the output type if needed.
 */
export function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeObject(entry));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key) ? '[REDACTED]' : sanitizeObject(entry);
  }

  return sanitized;
}

/**
 * Type-safe version for sanitizing Record<string, unknown>.
 * Since sanitizeObject preserves structure, a record input produces a record output.
 */
export function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result = sanitizeObject(record);
  // sanitizeObject preserves structure - a record in means a record out
  if (isPlainObject(result)) {
    return result;
  }
  // Fallback should never happen for record input, but satisfy type checker
  return {};
}
