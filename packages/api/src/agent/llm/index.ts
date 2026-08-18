/**
 * LLM Module
 * Unified LLM client with support for multiple providers
 */

// ============================================================================
// MAIN CLIENT
// ============================================================================

export { LLMClient, createLLMClient } from './client.js';

// ============================================================================
// TYPES
// ============================================================================

export type {
  ContentBlock,
  JsonSchemaProperty,
  LLMClientConfig,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMUsageStats,
  SendMessageParams,
  StreamEvent,
  StreamMessageParams,
  TextContent,
  ToolDefinition,
  ToolInputSchema,
  ToolResultContent,
  ToolUseContent,
} from './types.js';

export {
  extractText,
  extractToolUses,
  isContentBlock,
  isTextBlock,
  isToolResultContent,
  isToolUse,
} from './types.js';

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export { BaseLLMProvider, createProviderRegistry } from './provider-interface.js';
export type { ILLMProvider, ProviderFactory, ProviderRegistry } from './provider-interface.js';

// ============================================================================
// PROVIDERS
// ============================================================================

export {
  ClaudeProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  OpenAIProvider,
  createClaudeProvider,
  createGeminiProvider,
  createLMStudioProvider,
  createOllamaProvider,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
  createProvider,
  getDefaultProvider,
  getEffectiveApiKey,
  hasProvider,
  registerProvider,
} from './providers/index.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export {
  GEMINI_STOP_REASON_MAP,
  GeminiCandidateSchema,
  GeminiContentSchema,
  GeminiErrorSchema,
  GeminiFunctionCallSchema,
  GeminiFunctionDeclarationSchema,
  GeminiMessageContentSchema,
  GeminiMessagePartSchema,
  GeminiPartSchema,
  GeminiResponseSchema,
  GeminiRoleSchema,
  GeminiToolSchema,
  GeminiUsageMetadataSchema,
  OPENAI_STOP_REASON_MAP,
  getGeminiUsageStats,
  hasGeminiError,
  parseGeminiResponse,
} from './schemas.js';

export type { GeminiResponse, GeminiTool, GeminiUsageMetadata } from './schemas.js';

// ============================================================================
// SCHEMA UTILITIES
// ============================================================================

export {
  cleanSchemaForGemini,
  cleanSchemaForOpenAI,
  cloneSchema,
  getSchemaRequired,
  hasSchemaProperties,
  restoreToolNameFromOpenAI,
  sanitizeToolNameForOpenAI,
} from './schema-utils.js';
