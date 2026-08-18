/**
 * LLM Client Types
 * Shared types for LLM provider abstraction
 */

import type { LLMProviderType } from '../llm-providers.js';

// ============================================================================
// PROVIDER TYPE
// ============================================================================

/**
 * Concrete LLM provider type (excludes 'auto' which is only for configuration)
 */
export type LLMProvider = Exclude<LLMProviderType, 'auto'>;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProperty | JsonSchemaProperty[]; // Single schema or tuple validation
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  format?: string;
  default?: unknown;
  nullable?: boolean;
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  additionalProperties?: boolean | JsonSchemaProperty;
  $ref?: string;
  $defs?: Record<string, JsonSchemaProperty>;
}

/**
 * Tool input schema definition
 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Tool definition in our canonical format
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

// ============================================================================
// CONTENT TYPES
// ============================================================================

/**
 * Text content block
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Tool use (function call) content block
 */
export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

/**
 * Tool result content block
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

/**
 * Union of content block types
 */
export type ContentBlock = TextContent | ToolUseContent;

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/**
 * LLM message in our canonical format
 */
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[] | ToolResultContent[];
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Token usage statistics
 */
export interface LLMUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * LLM response in our canonical format
 */
export interface LLMResponse {
  content: ContentBlock[];
  stopReason: string | null;
  usage?: LLMUsageStats;
}

// ============================================================================
// STREAMING TYPES
// ============================================================================

/**
 * Unified streaming event types across all providers
 */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_input'; id: string; partialInput: string }
  | { type: 'tool_end'; id: string }
  | { type: 'done'; usage?: LLMUsageStats; stopReason: string | null }
  | { type: 'error'; error: string };

/**
 * Parameters for streaming message
 */
export interface StreamMessageParams {
  system: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
}

/**
 * Parameters for non-streaming message
 */
export interface SendMessageParams {
  system: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
}

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

/**
 * LLM client configuration
 */
export interface LLMClientConfig {
  provider?: LLMProvider;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
  temperature?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a content block is a tool use
 */
export function isToolUse(block: ContentBlock): block is ToolUseContent {
  return block.type === 'tool_use';
}

/**
 * Check if a content block is text
 */
export function isTextBlock(block: ContentBlock): block is TextContent {
  return block.type === 'text';
}

/**
 * Type guard to check if an unknown value is a ContentBlock
 */
export function isContentBlock(block: unknown): block is ContentBlock {
  if (!block || typeof block !== 'object') return false;
  const b = block as { type?: unknown };
  if (typeof b.type !== 'string') return false;
  if (b.type === 'text') {
    return typeof (b as { text?: unknown }).text === 'string';
  }
  if (b.type === 'tool_use') {
    const toolUse = b as { id?: unknown; name?: unknown; input?: unknown };
    return (
      typeof toolUse.id === 'string' &&
      typeof toolUse.name === 'string' &&
      toolUse.input !== undefined
    );
  }
  return false;
}

/**
 * Type guard to check if an unknown value is a ToolResultContent
 */
export function isToolResultContent(block: unknown): block is ToolResultContent {
  if (!block || typeof block !== 'object') return false;
  const b = block as { type?: unknown; tool_use_id?: unknown; content?: unknown };
  return (
    b.type === 'tool_result' && typeof b.tool_use_id === 'string' && typeof b.content === 'string'
  );
}

/**
 * Extract text content from blocks
 */
export function extractText(content: ContentBlock[]): string {
  return content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('');
}

/**
 * Extract tool uses from blocks
 */
export function extractToolUses(content: ContentBlock[]): ToolUseContent[] {
  return content.filter(isToolUse);
}
