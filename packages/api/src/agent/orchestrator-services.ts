/**
 * Orchestrator Services
 *
 * Defines focused service interfaces for orchestrator operations, following
 * the Interface Segregation Principle. Each interface handles a single concern:
 *
 * - **IPlanningService**: Multi-step request detection and plan generation
 * - **IToolService**: Tool selection and retrieval
 * - **ILLMService**: LLM client creation and prompt preparation
 * - **IAnalyticsService**: Usage logging and pattern learning
 *
 * The combined OrchestratorServices type composes these interfaces for
 * dependency injection into orchestrators.
 *
 * @example
 * // Production usage
 * const services = createDefaultOrchestratorServices();
 *
 * // Test usage with partial mocks
 * const testServices = createOrchestratorServices({
 *   planning: { detectMultiStepRequest: () => false },
 * });
 *
 * @module orchestrator-services
 */

import { detectMultiStepRequest as defaultDetectMultiStep } from '../services/agentPlan.js';
import { LLMClient, type ToolDefinition } from './llm/index.js';
import { createLLMClientForContext as defaultCreateLLMClient } from './unified-llm-client.js';
import type { UnifiedToolRouter } from './unified-tool-router.js';
import type { UnifiedAgentContext } from './unified-types.js';
import {
  extractKeywords as defaultExtractKeywords,
  generateAndCreatePlanFromMessage as defaultGenerateAndCreatePlan,
  getAndSelectTools as defaultGetAndSelectTools,
  logLlmUsageForResponse as defaultLogLlmUsage,
  prepareSystemPromptWithMemory as defaultPrepareSystemPrompt,
  recordToolUsageAsync as defaultRecordToolUsage,
  type GeneratedPlanResult,
} from './utils/index.js';

// ============================================================================
// FOCUSED SERVICE INTERFACES
// ============================================================================

/**
 * Planning service interface
 * Handles multi-step request detection and plan generation
 */
export interface IPlanningService {
  /**
   * Detect if a message is a multi-step request that should generate a plan
   */
  detectMultiStepRequest: (message: string) => boolean;

  /**
   * Generate and create a plan from a user message
   */
  generateAndCreatePlan: (
    userMessage: string,
    context: UnifiedAgentContext,
    client: LLMClient,
  ) => Promise<GeneratedPlanResult | null>;
}

/**
 * Tool service interface
 * Handles tool selection and retrieval
 */
export interface IToolService {
  /**
   * Get and select tools for a context
   */
  getAndSelectTools: (
    toolRouter: UnifiedToolRouter,
    context: UnifiedAgentContext,
    userMessage: string,
  ) => Promise<{ allTools: ToolDefinition[]; selectedTools: ToolDefinition[] }>;
}

/**
 * LLM service interface
 * Handles LLM client creation and prompt preparation
 */
export interface ILLMService {
  /**
   * Create an LLM client for a context
   */
  createLLMClient: (context: UnifiedAgentContext) => Promise<LLMClient>;

  /**
   * Prepare system prompt with memory context
   */
  prepareSystemPrompt: (context: UnifiedAgentContext, userMessage: string) => Promise<string>;
}

/**
 * Analytics service interface
 * Handles usage logging, tool usage recording, and NLP operations
 */
export interface IAnalyticsService {
  /**
   * Log LLM usage (fire and forget)
   */
  logLlmUsage: (
    context: UnifiedAgentContext,
    provider: string,
    model: string,
    usage: { inputTokens: number; outputTokens: number } | undefined,
    requestType: string,
  ) => void;

  /**
   * Record tool usage for pattern learning (fire and forget)
   */
  recordToolUsage: (
    organizationId: string,
    userId: string,
    toolName: string,
    keywords: string[],
    success: boolean,
  ) => void;

  /**
   * Extract keywords from a message
   */
  extractKeywords: (message: string) => string[];
}

// ============================================================================
// COMPOSED SERVICE INTERFACE
// ============================================================================

/**
 * Combined orchestrator services interface
 * Composes all focused service interfaces for dependency injection
 */
export interface OrchestratorServices
  extends IPlanningService, IToolService, ILLMService, IAnalyticsService {}

/**
 * Partial services for factory function overrides
 * Allows overriding individual service methods or entire service groups
 */
export interface PartialOrchestratorServices {
  planning?: Partial<IPlanningService>;
  tool?: Partial<IToolService>;
  llm?: Partial<ILLMService>;
  analytics?: Partial<IAnalyticsService>;
}

// ============================================================================
// DEFAULT IMPLEMENTATIONS
// ============================================================================

/**
 * Create default planning service with production implementations
 */
export function createDefaultPlanningService(): IPlanningService {
  return {
    detectMultiStepRequest: defaultDetectMultiStep,
    generateAndCreatePlan: defaultGenerateAndCreatePlan,
  };
}

/**
 * Create default tool service with production implementations
 */
export function createDefaultToolService(): IToolService {
  return {
    getAndSelectTools: defaultGetAndSelectTools,
  };
}

/**
 * Create default LLM service with production implementations
 */
export function createDefaultLLMService(): ILLMService {
  return {
    createLLMClient: defaultCreateLLMClient,
    prepareSystemPrompt: defaultPrepareSystemPrompt,
  };
}

/**
 * Create default analytics service with production implementations
 */
export function createDefaultAnalyticsService(): IAnalyticsService {
  return {
    logLlmUsage: defaultLogLlmUsage,
    recordToolUsage: defaultRecordToolUsage,
    extractKeywords: defaultExtractKeywords,
  };
}

/**
 * Create default orchestrator services with production implementations
 */
export function createDefaultOrchestratorServices(): OrchestratorServices {
  return {
    ...createDefaultPlanningService(),
    ...createDefaultToolService(),
    ...createDefaultLLMService(),
    ...createDefaultAnalyticsService(),
  };
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create orchestrator services with custom overrides
 * Supports both flat overrides (backward compatible) and grouped overrides
 *
 * @example
 * // Flat overrides (backward compatible)
 * const services = createOrchestratorServices({
 *   detectMultiStepRequest: () => false,
 * });
 *
 * // Grouped overrides (new style)
 * const services = createOrchestratorServicesFromPartial({
 *   planning: { detectMultiStepRequest: () => false },
 *   analytics: { extractKeywords: () => [] },
 * });
 */
export function createOrchestratorServices(
  overrides: Partial<OrchestratorServices> = {},
): OrchestratorServices {
  const defaults = createDefaultOrchestratorServices();
  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Create orchestrator services from partial grouped overrides
 * Allows overriding specific service groups
 */
export function createOrchestratorServicesFromPartial(
  partialOverrides: PartialOrchestratorServices = {},
): OrchestratorServices {
  const planning = {
    ...createDefaultPlanningService(),
    ...partialOverrides.planning,
  };
  const tool = {
    ...createDefaultToolService(),
    ...partialOverrides.tool,
  };
  const llm = {
    ...createDefaultLLMService(),
    ...partialOverrides.llm,
  };
  const analytics = {
    ...createDefaultAnalyticsService(),
    ...partialOverrides.analytics,
  };

  return {
    ...planning,
    ...tool,
    ...llm,
    ...analytics,
  };
}
