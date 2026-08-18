/**
 * Shared LLM Utilities
 * Common utilities for preparing data for LLM consumption
 */

import { isPlainObject, isSensitiveKey, SENSITIVE_KEYS } from '@sentinel/shared';

// Re-export for backwards compatibility
export { isSensitiveKey, SENSITIVE_KEYS };

/**
 * Sanitizes parameters for LLM consumption by redacting sensitive values
 */
export function sanitizeForLLM(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (isPlainObject(value)) {
      sanitized[key] = sanitizeForLLM(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extracts JSON from a markdown code block response
 */
export function extractJsonFromResponse(response: string): string {
  const match = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : response.trim();
}
