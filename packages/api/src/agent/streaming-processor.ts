/**
 * Streaming Message Processor
 *
 * Handles streaming message processing for the agent orchestrator.
 * This class is responsible for the generator-first streaming implementation
 * that yields events in real-time during LLM interaction and tool execution.
 *
 * Key Responsibilities:
 * - Stream LLM responses with text and tool events
 * - Execute accumulated tool calls after streaming completes
 * - Handle multi-round tool execution loops
 * - Emit mode-specific events (confirmations, permission denied)
 *
 * @see UnifiedOrchestrator - Main facade that delegates to this class
 * @see OrchestratorCore - Shared logic for message preparation and tool execution
 *
 * @module streaming-processor
 */

import { logger } from '../lib/logger.js';
import { AgentError, AgentErrorCodes } from './errors.js';
import type { LLMMessage, LLMUsageStats, StreamMessageParams } from './llm/index.js';
import type { ExtendedToolExecutionResult, OrchestratorCore } from './orchestrator-core.js';
import type {
  AccumulatingToolCall,
  UnifiedAgentContext,
  UnifiedStreamingEvent,
} from './unified-types.js';
import {
  buildAssistantContentFromTools,
  buildToolResultContentArray,
  parseToolInput,
  whenAdmin,
  whenWorkspace,
} from './utils/index.js';

/**
 * Maximum size for accumulated tool input JSON (1MB)
 * Prevents memory exhaustion from malicious or malformed streaming responses
 */
const MAX_TOOL_INPUT_LENGTH = 1024 * 1024;

/**
 * Streaming Message Processor
 * Handles the streaming message processing flow with generator-first design
 */
export class StreamingMessageProcessor {
  constructor(private readonly core: OrchestratorCore) {}

  /**
   * Process a message with streaming output
   * This is the primary streaming implementation - yields events in real-time
   */
  async *processMessageStream(
    userMessage: string,
    context: UnifiedAgentContext,
    conversationHistory: LLMMessage[] = [],
  ): AsyncGenerator<UnifiedStreamingEvent> {
    // Check for multi-step request and generate plan if detected
    const planResult = await this.core.checkPlanGeneration(userMessage, context);
    if (planResult) {
      yield {
        type: 'plan_created',
        planId: planResult.planId,
        planName: planResult.planName,
        planDescription: planResult.planDescription,
        stepCount: planResult.stepCount,
      };
      yield { type: 'done', model: planResult.model };
      return;
    }

    // Prepare for message processing
    const { client, systemPrompt, availableTools } = await this.core.prepareForMessage(
      context,
      userMessage,
    );

    const messages: LLMMessage[] = [...conversationHistory, { role: 'user', content: userMessage }];
    let rounds = 0;

    while (rounds < this.core.maxToolRounds) {
      rounds++;

      // Accumulate tool calls during streaming
      const accumulatingTools = new Map<string, AccumulatingToolCall>();
      let hasToolCalls = false;
      let usage: LLMUsageStats | undefined;
      let stopReason: string | null = null;
      let streamError: string | null = null;

      // Stream the LLM response
      const streamParams: StreamMessageParams = {
        system: systemPrompt,
        messages,
        tools: availableTools,
      };

      for await (const event of client.streamMessage(streamParams)) {
        switch (event.type) {
          case 'text':
            yield { type: 'text', text: event.text };
            break;

          case 'tool_start':
            hasToolCalls = true;
            accumulatingTools.set(event.id, {
              id: event.id,
              name: event.name,
              inputJson: '',
            });
            yield { type: 'tool_start', toolId: event.id, toolName: event.name };
            break;

          case 'tool_input': {
            const tool = accumulatingTools.get(event.id);
            if (tool) {
              if (tool.inputJson.length + event.partialInput.length > MAX_TOOL_INPUT_LENGTH) {
                throw new AgentError(
                  AgentErrorCodes.TOOL_INPUT_TOO_LARGE,
                  `Tool input exceeds maximum size of ${MAX_TOOL_INPUT_LENGTH} bytes`,
                  { context: { toolId: event.id, toolName: tool.name } },
                );
              }
              tool.inputJson += event.partialInput;
            }
            break;
          }

          case 'tool_end':
            // Tool input is complete, will be executed after stream ends
            break;

          case 'done':
            usage = event.usage;
            stopReason = event.stopReason;
            break;

          case 'error':
            streamError = event.error;
            break;
        }
      }

      // Handle stream error - clean up any accumulated tool calls
      if (streamError) {
        // Emit error events for any tools that were started but not executed
        for (const tool of accumulatingTools.values()) {
          yield {
            type: 'tool_result',
            toolId: tool.id,
            toolName: tool.name,
            success: false,
            error: `Stream interrupted: ${streamError}`,
            input: parseToolInput(tool.inputJson),
            result: undefined,
          };
        }
        yield { type: 'error', error: streamError };
        return;
      }

      // Log usage (fire and forget)
      this.core.logUsage(context, client, usage, true);

      // If no tool calls, we're done
      if (!hasToolCalls) {
        yield { type: 'done', model: client.getModel() };
        return;
      }

      // Execute accumulated tool calls
      yield* this.executeStreamingToolCalls(accumulatingTools, context, userMessage);

      // Build content blocks for assistant message and add to history
      messages.push({
        role: 'assistant',
        content: buildAssistantContentFromTools(accumulatingTools),
      });

      // Build tool results for history
      const toolResults = Array.from(accumulatingTools.values()).map((tool) => ({
        id: tool.id,
        name: tool.name,
        input: parseToolInput(tool.inputJson),
        result: undefined,
        error: undefined,
      }));

      // Add tool results to history
      messages.push({
        role: 'user',
        content: buildToolResultContentArray(toolResults),
      });

      // Continue to next round
      if (stopReason === 'end_turn') {
        yield { type: 'done', model: client.getModel() };
        return;
      }
    }

    // Max rounds reached
    yield { type: 'done', model: client.getModel() };
  }

  /**
   * Execute tool calls from streaming accumulation
   */
  private async *executeStreamingToolCalls(
    accumulatingTools: Map<string, AccumulatingToolCall>,
    context: UnifiedAgentContext,
    userMessage: string,
  ): AsyncGenerator<UnifiedStreamingEvent> {
    const keywords = this.core.extractKeywords(userMessage);

    for (const tool of accumulatingTools.values()) {
      // Emit tool_executing event before execution starts
      yield { type: 'tool_executing', toolId: tool.id, toolName: tool.name };

      const input = parseToolInput(tool.inputJson);

      logger.info('Executing tool from unified stream', {
        toolName: tool.name,
        toolId: tool.id,
        mode: context.mode,
      });

      const result = await this.core.executeTool(tool.name, input, tool.id, context, keywords);

      // Yield mode-specific events
      const modeEvents = this.getModeSpecificEvents(context, result, tool, input);
      for (const event of modeEvents) {
        yield event;
        // If permission denied, skip the tool result event
        if (event.type === 'permission_denied') {
          continue;
        }
      }

      // Skip tool result if permission was denied
      if (modeEvents.some((e) => e.type === 'permission_denied')) {
        continue;
      }

      // Yield tool result with full data for persistence
      yield {
        type: 'tool_result',
        toolId: result.id,
        toolName: result.name,
        success: !result.error,
        error: result.error,
        input: result.input,
        result: result.result,
        redirectAction: result.redirectAction,
      };
    }
  }

  /**
   * Get mode-specific events for a tool execution result
   * Uses mode handler pattern for clean conditional logic
   */
  private getModeSpecificEvents(
    context: UnifiedAgentContext,
    result: ExtendedToolExecutionResult,
    tool: AccumulatingToolCall,
    input: unknown,
  ): UnifiedStreamingEvent[] {
    const events: UnifiedStreamingEvent[] = [];

    // Workspace mode: check for permission denied
    const permissionDenied = whenWorkspace(context, () => {
      if (result.permissionDenied) {
        return {
          type: 'permission_denied' as const,
          toolName: result.name,
          reason: result.permissionDenied.reason,
          serverDomain: result.permissionDenied.serverDomain,
          blockingPolicyId: result.permissionDenied.blockingPolicyId,
        };
      }
      return undefined;
    });

    if (permissionDenied) {
      events.push(permissionDenied);
      return events; // Early return - no other events needed
    }

    // Admin mode: check for confirmation required
    const confirmation = whenAdmin(context, () => {
      if (result.confirmation) {
        return {
          type: 'confirmation' as const,
          confirmationId: result.confirmation.confirmationId,
          toolId: tool.id,
          toolName: result.confirmation.toolName,
          toolInput: input,
          description: result.confirmation.description,
        };
      }
      return undefined;
    });

    if (confirmation) {
      events.push(confirmation);
    }

    return events;
  }
}

/**
 * Create a StreamingMessageProcessor instance
 */
export function createStreamingMessageProcessor(core: OrchestratorCore): StreamingMessageProcessor {
  return new StreamingMessageProcessor(core);
}
