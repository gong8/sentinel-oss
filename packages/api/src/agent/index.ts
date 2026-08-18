/**
 * Sentinel Agent
 * AI-powered admin assistant for the Sentinel platform
 */

// Export error types and utilities
export {
  AgentError,
  AgentErrorCodes,
  conversationNotFoundError,
  failure,
  invalidWorkspaceContextError,
  isFailure,
  isSuccess,
  success,
  toolNotFoundError,
  unknownContextModeError,
  unwrapResult,
  type AgentErrorCode,
  type Failure,
  type Result,
  type Success,
} from './errors.js';

// Export conversation management
export {
  addMessage,
  createConversation,
  dbMessagesToConversation,
  deleteConversation,
  deleteMessagesFromId,
  getConversation,
  getMessages,
  listConversations,
  updateConversationTitle,
  updateToolResultByConfirmationId,
} from './conversation.js';

// Export tools (now powered by mcp-admin definitions)
export {
  allTools,
  createToolRegistry,
  executeTool,
  readTools,
  writeTools,
  type AgentTool,
  type ToolContext,
  type ToolRegistry,
  type ToolResult,
} from './tools/index.js';

// Export prompts
export { AGENT_SYSTEM_PROMPT } from './prompts/system.js';

// Export confirmation service
export {
  cancelAction,
  confirmAction,
  createConfirmation,
  generateActionDescription,
  getConfirmation,
  getPendingConfirmations,
  markExecuted,
  type CancelActionResult,
  type ConfirmActionResult,
  type ConfirmationRequest,
} from './confirmation.js';

// Export LLM client (provider-agnostic)
export {
  // Provider classes
  ClaudeProvider,
  GeminiProvider,
  // Main client
  LLMClient,
  OllamaProvider,
  OpenAICompatibleProvider,
  OpenAIProvider,
  // Schema utilities
  cleanSchemaForGemini,
  // Provider factories
  createClaudeProvider,
  createGeminiProvider,
  createLLMClient,
  createLMStudioProvider,
  createOllamaProvider,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
  createProvider,
  // Type guards
  extractText,
  extractToolUses,
  // Provider utilities
  getDefaultProvider,
  getEffectiveApiKey,
  hasProvider,
  isContentBlock,
  isTextBlock,
  isToolResultContent,
  isToolUse,
  registerProvider,
  restoreToolNameFromOpenAI,
  sanitizeToolNameForOpenAI,
  // Types
  type ContentBlock,
  type LLMClientConfig,
  type LLMMessage,
  type LLMProvider,
  type LLMResponse,
  type LLMUsageStats,
  type SendMessageParams,
  type StreamEvent,
  type StreamMessageParams,
  type TextContent,
  type ToolDefinition,
  type ToolResultContent,
  type ToolUseContent,
} from './llm/index.js';

// Export LLM provider types and utilities
export {
  LLM_PROVIDERS,
  calculateCostCents,
  getDefaultModelId,
  getProviderInfo,
  getProviderPricing,
  isLocalProvider,
  isValidProvider,
  listProviders,
  type LLMModelInfo,
  type LLMModelPricing,
  type LLMProviderInfo,
  type LLMProviderType,
} from './llm-providers.js';

// ============================================================================
// Unified Agent Components
// ============================================================================

// Export unified types
export {
  isAdminContext,
  isPlanCreatedResult,
  isWorkspaceContext,
  type AccumulatingToolCall,
  type AdminAgentContext,
  type AgentMode,
  type ToolExecutionResult,
  type UnifiedAgentContext,
  type AgentResponse as UnifiedAgentResponse,
  type UnifiedOrchestratorConfig,
  type UnifiedOrchestratorResponse,
  type PendingConfirmation as UnifiedPendingConfirmation,
  type PlanCreatedResult as UnifiedPlanCreatedResult,
  type UnifiedStreamingEvent,
  type UnifiedStreamingOrchestratorConfig,
  type ToolCall as UnifiedToolCall,
  type WorkspaceAgentContext,
} from './unified-types.js';

// Export unified tool router
export {
  UnifiedToolRouter,
  createUnifiedToolRouter,
  type UnifiedToolRouterConfig,
} from './unified-tool-router.js';

// Export unified LLM client factory
export {
  createLLMClientForContext,
  getLLMConfigForContext,
  supportsStreamingForContext,
} from './unified-llm-client.js';

// Export unified orchestrator (supports both streaming and non-streaming)
export {
  UnifiedOrchestrator,
  createUnifiedOrchestrator,
  type ExecuteConfirmedToolResponse,
  type ToolExecutionResultForConfirmed,
} from './unified-orchestrator.js';

// Export streaming processor (for advanced use cases)
export {
  StreamingMessageProcessor,
  createStreamingMessageProcessor,
} from './streaming-processor.js';

// Export confirmed tool executor (for advanced use cases)
export { ConfirmedToolExecutor, createConfirmedToolExecutor } from './confirmed-tool-executor.js';

// Export orchestrator services (for DI/testing)
export {
  createDefaultAnalyticsService,
  createDefaultLLMService,
  createDefaultOrchestratorServices,
  createDefaultPlanningService,
  createDefaultToolService,
  createOrchestratorServices,
  createOrchestratorServicesFromPartial,
  type IAnalyticsService,
  type ILLMService,
  type IPlanningService,
  type IToolService,
  type OrchestratorServices,
  type PartialOrchestratorServices,
} from './orchestrator-services.js';

// Export orchestrator core (shared logic between streaming and non-streaming)
export {
  OrchestratorCore,
  createOrchestratorCore,
  // Deprecated aliases re-exported from orchestrator-core
  type ConfirmationData,
  type ExtendedToolExecutionResult,
  type PlanResult,
  type PrepareResult,
} from './orchestrator-core.js';

// Export result types (new consolidated hierarchy)
export type {
  // New canonical names
  ConfirmationInfo,
  ConfirmedToolResult,
  // Deprecated aliases (for backward compatibility)
  GeneratedPlanResult,
  MessagePrepareResult,
  PermissionDeniedData,
  PermissionDeniedInfo,
  PlanGenerationResult,
  ToolResultFull,
  ToolResultProcessed,
  ToolResultWithConfirmation,
  ToolResultWithContext,
  ToolResultWithPolicy,
} from './result-types.js';

// Export utility functions
export {
  extractKeywords,
  toClaudeMessages,
  type ConversationMessageForConversion,
} from './utils/index.js';

// Export repositories (for DI/testing)
export {
  // Prisma implementations
  PrismaConfirmationRepository,
  PrismaConversationRepository,
  prismaConfirmationRepository,
  prismaConversationRepository,
  // Repository interface types
  type AddMessageParams,
  type ConfirmationEntity,
  type ConversationEntity,
  type ConversationListItem,
  type CreateConfirmationParams,
  type CreateConversationParams,
  type DeleteMessagesResult,
  type IConfirmationRepository,
  type IConversationRepository,
  type ListConversationsParams,
  type MessageEntity,
} from './repositories/index.js';
