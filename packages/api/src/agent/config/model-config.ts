/**
 * Model Configuration
 * Configuration for LLM model-specific behaviors and capabilities
 */

/**
 * Model prefixes that require max_completion_tokens instead of max_tokens.
 * Newer OpenAI models use this parameter for token limits.
 */
export const MODELS_REQUIRING_MAX_COMPLETION_TOKENS = [
  'gpt-5',
  'gpt-4o',
  'o1',
  'o3',
  'o4',
] as const;

/**
 * Check if a model requires max_completion_tokens instead of max_tokens
 */
export function requiresMaxCompletionTokens(model: string): boolean {
  const lowerModel = model.toLowerCase();
  return MODELS_REQUIRING_MAX_COMPLETION_TOKENS.some((prefix) => lowerModel.startsWith(prefix));
}
