/**
 * OpenAI Format Utilities
 * Shared utilities for OpenAI and OpenAI-compatible API clients
 */

// Re-export model detection from config
export { requiresMaxCompletionTokens } from '../config/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Mapping of OpenAI finish reasons to our unified format */
export const OPENAI_STOP_REASON_MAP: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'content_filtered',
};

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Sanitize tool name for OpenAI API (only allows ^[a-zA-Z0-9_-]+)
 * Replaces invalid characters with underscores
 */
export function sanitizeToolNameForOpenAI(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Normalize tool name - strip common prefixes LLMs might add
 * LLMs sometimes add "functions." prefix (OpenAI-style) or "admin_" prefix
 */
export function normalizeToolName(name: string): string {
  return name
    .replace(/^functions\./, '') // Strip "functions." prefix (OpenAI-style)
    .replace(/^admin_/, ''); // Strip "admin_" prefix if present
}
