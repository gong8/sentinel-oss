/**
 * Tool result serialization utilities
 */

import type { ContentBlock, ToolResultContent, ToolUseContent } from '../llm/index.js';
import type { AccumulatingToolCall, ToolExecutionResult } from '../unified-types.js';
import { parseToolInput } from './orchestrator-helpers.js';

/**
 * ToolCall interface for serialization
 */
export interface ToolCallForSerialization {
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
  error?: string;
}

/**
 * Serialize a tool result for the LLM message format
 * Handles undefined results by returning { result: null }
 */
export function serializeToolResult(result: unknown, error: string | undefined): string {
  if (error) {
    return JSON.stringify({ error });
  }
  // JSON.stringify(undefined) returns undefined (not a string), so we need to handle that case
  if (result === undefined) {
    return JSON.stringify({ result: null });
  }
  return JSON.stringify(result);
}

/**
 * Create a tool_result content block
 */
export function createToolResultContent(toolCall: ToolCallForSerialization): ToolResultContent {
  return {
    type: 'tool_result',
    tool_use_id: toolCall.id,
    content: serializeToolResult(toolCall.result, toolCall.error),
  };
}

/**
 * Convert a ToolCall to a tool_use content block
 */
export function toToolUseContent(toolCall: ToolCallForSerialization): ToolUseContent {
  return {
    type: 'tool_use',
    id: toolCall.id,
    name: toolCall.name,
    input: toolCall.input,
  };
}

/**
 * Build assistant content blocks from accumulated tool calls
 * Used by streaming orchestrator to prepare history
 */
export function buildAssistantContentFromTools(
  accumulatingTools: Map<string, AccumulatingToolCall>,
): ContentBlock[] {
  return Array.from(accumulatingTools.values()).map((tool) => ({
    type: 'tool_use' as const,
    id: tool.id,
    name: tool.name,
    input: parseToolInput(tool.inputJson),
  }));
}

/**
 * Build tool result content array for LLM history
 * Used by streaming orchestrator to prepare history
 */
export function buildToolResultContentArray(
  toolResults: ToolExecutionResult[],
): ToolResultContent[] {
  return toolResults.map((result) => ({
    type: 'tool_result' as const,
    tool_use_id: result.id,
    content: serializeToolResult(result.result, result.error),
  }));
}
