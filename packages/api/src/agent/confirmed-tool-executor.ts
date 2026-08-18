/**
 * Confirmed Tool Executor
 *
 * Handles execution of tools that have been confirmed by the user.
 * This is used in workspace mode when a tool requires user confirmation
 * before execution (based on policy decisions).
 *
 * Key Responsibilities:
 * - Execute confirmed tool calls
 * - Handle permission denied scenarios
 * - Continue the LLM conversation with tool results
 *
 * @see UnifiedOrchestrator - Main facade that delegates to this class
 * @see OrchestratorCore - Shared logic for tool execution
 *
 * @module confirmed-tool-executor
 */

import { logger } from '../lib/logger.js';
import type { LLMMessage, ToolUseContent } from './llm/index.js';
import type { OrchestratorCore } from './orchestrator-core.js';
import type { ConfirmedToolResult, PermissionDeniedInfo } from './result-types.js';
import type { StreamingMessageProcessor } from './streaming-processor.js';
import type { WorkspaceAgentContext } from './unified-types.js';

// Re-export type for backward compatibility
export type { ConfirmedToolResult as ToolExecutionResultForConfirmed } from './result-types.js';

/**
 * Response from executeConfirmedTool
 */
export interface ExecuteConfirmedToolResponse {
  text: string;
  toolResults?: ConfirmedToolResult[];
  permissionDenied?: PermissionDeniedInfo;
  model?: string;
}

/**
 * Confirmed Tool Executor
 * Handles execution of user-confirmed tool calls in workspace mode
 */
export class ConfirmedToolExecutor {
  constructor(
    private readonly core: OrchestratorCore,
    private readonly streamingProcessor: StreamingMessageProcessor,
  ) {}

  /**
   * Execute a confirmed tool call and continue the conversation
   * Used when a tool requires confirmation and the user has approved it
   *
   * @param context - Workspace agent context
   * @param toolName - Name of the tool to execute
   * @param toolInput - Input parameters for the tool
   * @param toolUseId - Unique ID for this tool use (from the original LLM response)
   * @param userMessage - Optional user message for keyword extraction (used for pattern learning)
   * @returns Response with tool result and LLM continuation
   */
  async executeConfirmedTool(
    context: WorkspaceAgentContext,
    toolName: string,
    toolInput: unknown,
    toolUseId: string,
    userMessage = '',
  ): Promise<ExecuteConfirmedToolResponse> {
    const keywords = this.core.extractKeywords(userMessage);

    logger.info('Executing confirmed tool', {
      toolName,
      toolUseId,
      workspaceId: context.workspaceId,
      userId: context.userId,
    });

    // Execute the tool
    const result = await this.core.executeTool(toolName, toolInput, toolUseId, context, keywords);

    // If denied, return a denied response
    if (result.decision === 'DENIED' || result.permissionDenied) {
      const deniedReason =
        result.permissionDenied?.reason ?? result.deniedReason ?? 'Access denied by policy';

      return {
        text: `Unable to execute ${toolName}: ${deniedReason}`,
        permissionDenied: {
          toolName,
          reason: deniedReason,
          serverDomain: result.permissionDenied?.serverDomain ?? result.serverDomain,
          blockingPolicyId: result.permissionDenied?.blockingPolicyId ?? result.blockingPolicyId,
        },
      };
    }

    // Format the tool result for the LLM
    const toolResultString = this.formatToolResult(result.result);

    // Build the conversation history with the tool use and result
    const conversationWithToolResult = this.buildToolResultConversation(
      toolUseId,
      toolName,
      toolInput,
      toolResultString,
      result.error,
    );

    // Continue the conversation with the tool result to get the LLM's response
    const { text, model } = await this.continueConversation(context, conversationWithToolResult);

    return {
      text,
      toolResults: [
        {
          toolUseId,
          result: toolResultString,
          success: !result.error,
        },
      ],
      model,
    };
  }

  /**
   * Format the tool result for the LLM
   */
  private formatToolResult(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }
    if (result !== undefined) {
      return JSON.stringify(result);
    }
    return JSON.stringify({ result: null });
  }

  /**
   * Build the conversation history with the tool use and result
   */
  private buildToolResultConversation(
    toolUseId: string,
    toolName: string,
    toolInput: unknown,
    toolResultString: string,
    hasError?: string,
  ): LLMMessage[] {
    const toolUseContent: ToolUseContent = {
      type: 'tool_use',
      id: toolUseId,
      name: toolName,
      input: toolInput,
    };

    // If there was an error, prepend error indicator to the result
    const toolResultContentString = hasError ? `[Error] ${toolResultString}` : toolResultString;

    return [
      {
        role: 'assistant',
        content: [toolUseContent],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: toolResultContentString,
          },
        ],
      },
    ];
  }

  /**
   * Continue the conversation with tool results
   */
  private async continueConversation(
    context: WorkspaceAgentContext,
    conversationHistory: LLMMessage[],
  ): Promise<{ text: string; model: string }> {
    let finalText = '';
    let model = '';

    for await (const event of this.streamingProcessor.processMessageStream(
      '', // Empty user message - we're continuing from tool result
      context,
      conversationHistory,
    )) {
      switch (event.type) {
        case 'text':
          finalText += event.text;
          break;
        case 'done':
          model = event.model ?? '';
          break;
        case 'error':
          logger.error('Error during confirmed tool continuation', { error: event.error });
          break;
      }
    }

    return { text: finalText, model };
  }
}

/**
 * Create a ConfirmedToolExecutor instance
 */
export function createConfirmedToolExecutor(
  core: OrchestratorCore,
  streamingProcessor: StreamingMessageProcessor,
): ConfirmedToolExecutor {
  return new ConfirmedToolExecutor(core, streamingProcessor);
}
