/**
 * Orchestrator Core - Shared Agent Logic
 *
 * Contains the core logic shared between streaming and non-streaming orchestration.
 * This class is composed into UnifiedOrchestrator (not inherited) to provide:
 *
 * - **Message preparation**: LLM client creation, tool selection, system prompts
 * - **Plan generation**: Multi-step request detection and plan creation
 * - **Tool execution**: Mode-aware execution with permission/confirmation handling
 * - **Usage logging**: Token usage and tool usage pattern recording
 *
 * Architecture:
 * ```
 * UnifiedOrchestrator
 *   └── composes OrchestratorCore
 *         ├── uses OrchestratorServices (dependency injection)
 *         │     ├── IPlanningService
 *         │     ├── IToolService
 *         │     ├── ILLMService
 *         │     └── IAnalyticsService
 *         └── uses UnifiedToolRouter (tool execution)
 * ```
 *
 * The core handles shared concerns while the UnifiedOrchestrator manages
 * the streaming/non-streaming flow control and event emission.
 *
 * @see UnifiedOrchestrator - The main orchestrator that composes this class
 * @see OrchestratorServices - Injectable dependencies for testing
 * @see UnifiedToolRouter - Mode-aware tool routing
 *
 * @module orchestrator-core
 */

import { logger } from '../lib/logger.js';
import type { LLMClient, LLMUsageStats } from './llm/index.js';
import {
  createOrchestratorServices,
  type IAnalyticsService,
  type ILLMService,
  type IPlanningService,
  type IToolService,
  type OrchestratorServices,
} from './orchestrator-services.js';
import type {
  ConfirmationInfo,
  MessagePrepareResult,
  PlanGenerationResult,
  ToolResultFull,
  ToolResultProcessed,
} from './result-types.js';
import { createUnifiedToolRouter, type UnifiedToolRouter } from './unified-tool-router.js';
import type { UnifiedAgentContext, UnifiedOrchestratorConfig } from './unified-types.js';
import {
  createPermissionDeniedData,
  getRequestTypeForMode,
  getStreamingRequestTypeForMode,
  whenAdmin,
  whenWorkspace,
} from './utils/index.js';

// Re-export types for backward compatibility
export type {
  ConfirmationInfo as ConfirmationData,
  ToolResultProcessed as ExtendedToolExecutionResult,
  PlanGenerationResult as PlanResult,
  MessagePrepareResult as PrepareResult,
} from './result-types.js';

// ============================================================================
// ORCHESTRATOR CORE
// ============================================================================

/**
 * OrchestratorCore contains shared logic for both streaming and non-streaming orchestrators.
 * Both orchestrators compose this class rather than inheriting from it.
 *
 * Responsibilities:
 * - Tool router and services management
 * - Prepare for message (client, tools, system prompt)
 * - Plan detection and generation
 * - Tool execution with mode-specific handling
 * - Usage logging
 */
export class OrchestratorCore {
  readonly toolRouter: UnifiedToolRouter;
  readonly maxToolRounds: number;

  private readonly _services: OrchestratorServices;

  constructor(config: UnifiedOrchestratorConfig = {}) {
    this.toolRouter =
      config.toolRouter ??
      createUnifiedToolRouter({
        includeWriteTools: config.includeWriteTools ?? true,
      });
    this.maxToolRounds = config.maxToolRounds ?? 10;
    this._services = createOrchestratorServices(config.services);
  }

  /**
   * Get the combined services object (for backward compatibility)
   */
  get services(): OrchestratorServices {
    return this._services;
  }

  /**
   * Get the planning service interface
   */
  get planning(): IPlanningService {
    return this._services;
  }

  /**
   * Get the tool service interface
   */
  get tool(): IToolService {
    return this._services;
  }

  /**
   * Get the LLM service interface
   */
  get llm(): ILLMService {
    return this._services;
  }

  /**
   * Get the analytics service interface
   */
  get analytics(): IAnalyticsService {
    return this._services;
  }

  /**
   * Prepare for message processing
   * Returns LLM client, system prompt, and available tools
   */
  async prepareForMessage(
    context: UnifiedAgentContext,
    userMessage: string,
  ): Promise<MessagePrepareResult> {
    const { allTools, selectedTools } = await this.tool.getAndSelectTools(
      this.toolRouter,
      context,
      userMessage,
    );

    logger.info('Orchestrator preparing message', {
      mode: context.mode,
      userMessage: userMessage.slice(0, 100),
      totalToolCount: allTools.length,
      selectedToolCount: selectedTools.length,
      toolNames: selectedTools.map((t) => t.name),
    });

    const client = await this.llm.createLLMClient(context);
    const systemPrompt = await this.llm.prepareSystemPrompt(context, userMessage);

    return {
      client,
      systemPrompt,
      availableTools: selectedTools,
      allTools,
    };
  }

  /**
   * Check for multi-step request and generate plan if detected
   * Returns null if not a multi-step request or plan generation fails
   */
  async checkPlanGeneration(
    userMessage: string,
    context: UnifiedAgentContext,
  ): Promise<PlanGenerationResult | null> {
    if (!this.planning.detectMultiStepRequest(userMessage)) {
      return null;
    }

    logger.info('Multi-step request detected, generating plan', {
      userMessage: userMessage.slice(0, 100),
      organizationId: context.organizationId,
      mode: context.mode,
    });

    const client = await this.llm.createLLMClient(context);
    const result = await this.planning.generateAndCreatePlan(userMessage, context, client);

    if (!result) {
      logger.warn('Plan generation failed, falling back to direct execution');
      return null;
    }

    return result;
  }

  /**
   * Execute a single tool and handle mode-specific behavior
   * Handles permission denied (workspace) and confirmation (admin)
   *
   * Uses mode handlers for cleaner conditional logic:
   * - whenWorkspace: Checks for policy denial and returns permissionDenied data
   * - whenAdmin: Checks for confirmation requirement and returns confirmation data
   */
  async executeTool(
    toolName: string,
    toolInput: unknown,
    toolId: string,
    context: UnifiedAgentContext,
    keywords: string[],
  ): Promise<ToolResultProcessed> {
    const result = await this.toolRouter.executeTool(toolName, toolInput, context, toolId);

    logger.info('Orchestrator tool execution result', {
      toolName,
      toolId,
      success: !result.error && result.decision !== 'DENIED',
      hasConfirmationId: !!result.confirmationId,
      decision: result.decision,
      mode: context.mode,
    });

    // Record tool usage for pattern learning (fire and forget)
    this.analytics.recordToolUsage(
      context.organizationId,
      context.userId,
      toolName,
      keywords,
      result.decision !== 'DENIED' && !result.error,
    );

    // Process mode-specific results using mode handlers
    return this.processToolResult(context, result, toolName);
  }

  /**
   * Process tool result with mode-specific handling
   * Uses mode handlers for clean conditional logic
   */
  private processToolResult(
    context: UnifiedAgentContext,
    result: ToolResultFull,
    toolName: string,
  ): ToolResultProcessed {
    // Workspace mode: check for permission denied
    const permissionDenied = whenWorkspace(context, () => {
      if (result.decision === 'DENIED') {
        return createPermissionDeniedData(
          toolName,
          result.deniedReason,
          result.serverDomain,
          result.blockingPolicyId,
        );
      }
      return undefined;
    });

    if (permissionDenied) {
      return { ...result, permissionDenied };
    }

    // Admin mode: check for confirmation required
    const confirmation = whenAdmin(context, (): ConfirmationInfo | undefined => {
      if (result.confirmationId) {
        return {
          confirmationId: result.confirmationId,
          toolName,
          description: this.toolRouter.getToolResultDescription(result),
        };
      }
      return undefined;
    });

    if (confirmation) {
      return { ...result, confirmation };
    }

    return result;
  }

  /**
   * Extract keywords from user message
   */
  extractKeywords(userMessage: string): string[] {
    return this.analytics.extractKeywords(userMessage);
  }

  /**
   * Log LLM usage (fire and forget)
   */
  logUsage(
    context: UnifiedAgentContext,
    client: LLMClient,
    usage: LLMUsageStats | undefined,
    streaming: boolean,
  ): void {
    const requestType = streaming
      ? getStreamingRequestTypeForMode(context)
      : getRequestTypeForMode(context);
    this.analytics.logLlmUsage(
      context,
      client.getProvider(),
      client.getModel(),
      usage,
      requestType,
    );
  }

  /**
   * Get tool result description using the tool router
   */
  getToolResultDescription(result: ToolResultFull): string {
    return this.toolRouter.getToolResultDescription(result);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an OrchestratorCore instance
 */
export function createOrchestratorCore(config: UnifiedOrchestratorConfig = {}): OrchestratorCore {
  return new OrchestratorCore(config);
}
