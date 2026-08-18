/**
 * Unified Agent Orchestrator - Main Entry Point
 *
 * A thin facade that coordinates message processing by delegating to
 * specialized classes for streaming and confirmed tool execution.
 *
 * Key Features:
 * - **Generator-first**: Streaming is the native implementation; non-streaming
 *   collects events from the stream for backward compatibility
 * - **Mode-aware**: Handles both admin and workspace contexts with appropriate
 *   tool access, permissions, and confirmation flows
 * - **Focused delegation**: Delegates to StreamingMessageProcessor and
 *   ConfirmedToolExecutor for their respective responsibilities
 *
 * Usage:
 * ```typescript
 * const orchestrator = createUnifiedOrchestrator();
 *
 * // Streaming (recommended for real-time UIs)
 * for await (const event of orchestrator.processMessageStream(message, context)) {
 *   // Handle text, tool_start, tool_result, done events
 * }
 *
 * // Non-streaming (collects all events into final response)
 * const response = await orchestrator.processMessage(message, context);
 * ```
 *
 * @see StreamingMessageProcessor - Streaming message processing
 * @see ConfirmedToolExecutor - Confirmed tool execution
 * @see OrchestratorCore - Shared logic composed into this class
 *
 * @module unified-orchestrator
 */

import { logger } from '../lib/logger.js';
import {
  ConfirmedToolExecutor,
  createConfirmedToolExecutor,
  type ExecuteConfirmedToolResponse,
  type ToolExecutionResultForConfirmed,
} from './confirmed-tool-executor.js';
import type { LLMMessage } from './llm/index.js';
import { OrchestratorCore } from './orchestrator-core.js';
import {
  createStreamingMessageProcessor,
  StreamingMessageProcessor,
} from './streaming-processor.js';
import type { RedirectAction } from './tools/index.js';
import type {
  PendingConfirmation,
  PlanCreatedResult,
  ToolCall,
  UnifiedAgentContext,
  UnifiedOrchestratorConfig,
  UnifiedOrchestratorResponse,
  UnifiedStreamingEvent,
  UnifiedStreamingOrchestratorConfig,
  WorkspaceAgentContext,
} from './unified-types.js';
import { toClaudeMessages } from './utils/index.js';

// Re-export types for backward compatibility
export type { ExecuteConfirmedToolResponse, ToolExecutionResultForConfirmed };

/**
 * Unified Agent Orchestrator
 * A thin facade that delegates to specialized processors for streaming and tool execution
 */
export class UnifiedOrchestrator {
  private readonly core: OrchestratorCore;
  private readonly streamingProcessor: StreamingMessageProcessor;
  private readonly confirmedToolExecutor: ConfirmedToolExecutor;

  constructor(config: UnifiedOrchestratorConfig | UnifiedStreamingOrchestratorConfig = {}) {
    this.core = new OrchestratorCore(config);
    this.streamingProcessor = createStreamingMessageProcessor(this.core);
    this.confirmedToolExecutor = createConfirmedToolExecutor(this.core, this.streamingProcessor);
  }

  /**
   * Process a message with streaming output
   * Delegates to StreamingMessageProcessor
   */
  async *processMessageStream(
    userMessage: string,
    context: UnifiedAgentContext,
    conversationHistory: LLMMessage[] = [],
  ): AsyncGenerator<UnifiedStreamingEvent> {
    yield* this.streamingProcessor.processMessageStream(userMessage, context, conversationHistory);
  }

  /**
   * Process a user message and return the agent's response
   * Collects all events from processMessageStream into a final response
   */
  async processMessage(
    userMessage: string,
    context: UnifiedAgentContext,
    conversationHistory: LLMMessage[] = [],
  ): Promise<UnifiedOrchestratorResponse> {
    const allToolCalls: ToolCall[] = [];
    const pendingConfirmations: PendingConfirmation[] = [];
    // Map toolId -> confirmationId for linking (confirmation events come before tool_result)
    const confirmationByToolId = new Map<string, string>();
    let finalText = '';
    let model = '';
    let finalRedirectAction: RedirectAction | undefined;
    let permissionDenied:
      | { toolName: string; reason: string; serverDomain?: string; blockingPolicyId?: string }
      | undefined;
    let planCreatedResult: PlanCreatedResult | undefined;

    for await (const event of this.processMessageStream(
      userMessage,
      context,
      conversationHistory,
    )) {
      switch (event.type) {
        case 'text':
          finalText += event.text;
          break;

        case 'tool_result': {
          const toolCall: ToolCall = {
            id: event.toolId,
            name: event.toolName,
            input: event.input,
            result: event.result,
            error: event.error,
          };
          // Apply confirmationId if we received confirmation event before this tool_result
          const confirmationId = confirmationByToolId.get(event.toolId);
          if (confirmationId) {
            toolCall.confirmationId = confirmationId;
          }
          allToolCalls.push(toolCall);
          if (event.redirectAction) {
            finalRedirectAction = event.redirectAction;
          }
          break;
        }

        case 'confirmation':
          pendingConfirmations.push({
            confirmationId: event.confirmationId,
            toolName: event.toolName,
            toolInput: event.toolInput,
            description: event.description,
          });
          // Store mapping for when tool_result arrives (it comes after confirmation)
          confirmationByToolId.set(event.toolId, event.confirmationId);
          break;

        case 'permission_denied':
          permissionDenied = {
            toolName: event.toolName,
            reason: event.reason,
            serverDomain: event.serverDomain,
            blockingPolicyId: event.blockingPolicyId,
          };
          break;

        case 'plan_created':
          planCreatedResult = {
            planCreated: true,
            planId: event.planId,
            planName: event.planName,
            planDescription: event.planDescription,
            stepCount: event.stepCount,
            model: '',
          };
          break;

        case 'done':
          model = event.model ?? '';
          if (planCreatedResult) {
            planCreatedResult.model = model;
          }
          break;

        case 'error':
          logger.error('Error in processMessage stream', { error: event.error });
          break;

        case 'tool_start':
        case 'tool_executing':
          break;
      }
    }

    if (planCreatedResult) {
      return planCreatedResult;
    }

    return {
      text: finalText,
      toolCalls: allToolCalls,
      complete: true,
      stopReason: 'end_turn',
      pendingConfirmations,
      redirectAction: finalRedirectAction,
      model,
      planCreated: false,
      permissionDenied,
    };
  }

  /**
   * Execute a confirmed tool call and continue the conversation
   * Delegates to ConfirmedToolExecutor
   */
  async executeConfirmedTool(
    context: WorkspaceAgentContext,
    toolName: string,
    toolInput: unknown,
    toolUseId: string,
    userMessage = '',
  ): Promise<ExecuteConfirmedToolResponse> {
    return this.confirmedToolExecutor.executeConfirmedTool(
      context,
      toolName,
      toolInput,
      toolUseId,
      userMessage,
    );
  }

  /**
   * Convert conversation messages to LLM message format
   * (Static method for backward compatibility)
   */
  static toClaudeMessages(
    messages: { role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[] }[],
  ): LLMMessage[] {
    return toClaudeMessages(messages);
  }
}

/**
 * Create a UnifiedOrchestrator instance
 */
export function createUnifiedOrchestrator(
  config: UnifiedOrchestratorConfig = {},
): UnifiedOrchestrator {
  return new UnifiedOrchestrator(config);
}
