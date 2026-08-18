/**
 * Agent utilities barrel export
 */

export { extractDescription } from './description.js';
export { extractKeywords } from './keywords.js';
export { toClaudeMessages, type ConversationMessageForConversion } from './message-utils.js';
export {
  getValueForMode,
  handleByMode,
  handleByModeAsync,
  whenAdmin,
  whenAdminAsync,
  whenWorkspace,
  whenWorkspaceAsync,
  type AsyncModeHandlers,
  type ModeHandlers,
  type UniformAsyncModeHandlers,
  type UniformModeHandlers,
} from './mode-handlers.js';
export {
  getRequestTypeForMode,
  getSessionIdForMode,
  getStreamingRequestTypeForMode,
  getSystemPromptForMode,
} from './mode-helpers.js';
export {
  OPENAI_STOP_REASON_MAP,
  normalizeToolName,
  sanitizeToolNameForOpenAI,
} from './openai-format.js';

// Prompt building utilities
export { prepareSystemPromptWithMemory } from './prompt-builder.js';

// Analytics utilities
export { logLlmUsageForResponse, recordToolUsageAsync } from './analytics.js';

// Orchestrator helpers (re-exports prompt-builder and analytics for backward compatibility)
export {
  createPermissionDeniedData,
  generateAndCreatePlanFromMessage,
  getAndSelectTools,
  parseToolInput,
  type GeneratedPlanResult,
  type PermissionDeniedData,
} from './orchestrator-helpers.js';

// Serialization utilities
export {
  buildAssistantContentFromTools,
  buildToolResultContentArray,
  createToolResultContent,
  serializeToolResult,
  toToolUseContent,
  type ToolCallForSerialization,
} from './serialization.js';

// Re-export from config for backwards compatibility
export { requiresMaxCompletionTokens } from '../config/index.js';

// Re-export prompts for backwards compatibility
export { WORKSPACE_SYSTEM_PROMPT } from '../prompts/index.js';
