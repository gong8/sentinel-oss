/**
 * Description extraction utilities
 */

/**
 * Type guard for objects with a description property
 */
export function hasDescription(data: unknown): data is { description: string } {
  return (
    data !== null &&
    typeof data === 'object' &&
    'description' in data &&
    typeof data.description === 'string'
  );
}

/**
 * Extract description from tool result data safely
 */
export function extractDescription(data: unknown, fallback: string): string {
  return hasDescription(data) ? data.description : fallback;
}
