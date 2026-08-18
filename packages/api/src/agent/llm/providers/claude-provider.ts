/**
 * Claude (Anthropic) Provider
 * LLM provider implementation for Anthropic's Claude models
 */

import Anthropic from '@anthropic-ai/sdk';

import { BaseLLMProvider } from '../provider-interface.js';
import type {
  ContentBlock,
  LLMClientConfig,
  LLMResponse,
  LLMUsageStats,
  SendMessageParams,
  StreamEvent,
  StreamMessageParams,
  ToolDefinition,
  ToolInputSchema,
  ToolResultContent,
} from '../types.js';

// ============================================================================
// SCHEMA CONVERSION HELPERS
// ============================================================================

/**
 * Convert ToolInputSchema to Anthropic's input_schema format
 * Builds object explicitly to satisfy SDK type requirements
 *
 * Note: The return type annotation tells TypeScript this function returns the
 * Anthropic-compatible schema type. The implementation builds the correct structure.
 */
function toClaudeInputSchema(schema: ToolInputSchema): Anthropic.Tool['input_schema'] {
  // Build properties object explicitly
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    properties[key] = value;
  }

  // Build the result with all fields Anthropic expects
  // The spread of additionalProperties only if it exists avoids adding undefined
  const hasAdditionalProps =
    'additionalProperties' in schema && schema.additionalProperties !== undefined;
  const hasRequired = schema.required && schema.required.length > 0;

  // Return object matching Anthropic.Tool['input_schema'] structure
  // Using object spread to conditionally include fields
  return {
    type: 'object' as const,
    properties,
    ...(hasRequired ? { required: [...schema.required!] } : {}),
    ...(hasAdditionalProps ? { additionalProperties: schema.additionalProperties } : {}),
  };
}

/**
 * Convert a content block to Claude's ContentBlockParam format
 * Handles both ContentBlock (text/tool_use) and ToolResultContent
 */
function toClaudeContentBlock(
  block: ContentBlock | ToolResultContent,
): Anthropic.ContentBlockParam {
  if (block.type === 'text') {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool_use_id: block.tool_use_id,
      content: block.content,
    };
  }
  // block.type === 'tool_use'
  return {
    type: 'tool_use',
    id: block.id,
    name: block.name,
    input: block.input,
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || '';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250514';

// ============================================================================
// CLAUDE PROVIDER
// ============================================================================

/**
 * Claude provider implementation
 */
export class ClaudeProvider extends BaseLLMProvider {
  private client: Anthropic;

  constructor(config: LLMClientConfig) {
    const apiKey = config.apiKey || ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
    }

    super(config, 'claude', LLM_MODEL || DEFAULT_CLAUDE_MODEL);
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Claude supports native streaming
   */
  override supportsStreaming(): boolean {
    return true;
  }

  /**
   * Convert our tool format to Claude format
   */
  private toClaudeTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: toClaudeInputSchema(tool.input_schema),
    }));
  }

  /**
   * Convert our message format to Claude format
   */
  private toClaudeMessages(messages: SendMessageParams['messages']): Anthropic.MessageParam[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      return { role: msg.role, content: msg.content.map(toClaudeContentBlock) };
    });
  }

  /**
   * Parse Claude response to our format
   */
  private parseResponse(response: Anthropic.Message): LLMResponse {
    const content: ContentBlock[] = response.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      } else if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      // Fallback for unknown block types
      return { type: 'text' as const, text: '' };
    });

    // Build usage stats from Claude's response
    const usage: LLMUsageStats | undefined = response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        }
      : undefined;

    return { content, stopReason: response.stop_reason, usage };
  }

  /**
   * Send a message (non-streaming)
   */
  async sendMessage(params: SendMessageParams): Promise<LLMResponse> {
    const claudeTools = params.tools ? this.toClaudeTools(params.tools) : undefined;
    const claudeMessages = this.toClaudeMessages(params.messages);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: params.system,
      messages: claudeMessages,
      tools: claudeTools,
    });

    return this.parseResponse(response);
  }

  /**
   * Stream a message response
   */
  override async *streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
    const claudeTools = params.tools ? this.toClaudeTools(params.tools) : undefined;
    const claudeMessages = this.toClaudeMessages(params.messages);

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      system: params.system,
      messages: claudeMessages,
      tools: claudeTools,
    });

    // Track current tool being built
    let currentToolId: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | null = null;

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens ?? 0;
      } else if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'tool_use') {
          currentToolId = block.id;
          yield { type: 'tool_start', id: block.id, name: block.name };
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta' && delta.text) {
          yield { type: 'text', text: delta.text };
        } else if (delta.type === 'input_json_delta' && delta.partial_json && currentToolId) {
          yield { type: 'tool_input', id: currentToolId, partialInput: delta.partial_json };
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolId) {
          yield { type: 'tool_end', id: currentToolId };
          currentToolId = null;
        }
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? 0;
        stopReason = event.delta?.stop_reason ?? null;
      }
    }

    yield {
      type: 'done',
      stopReason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }
}

/**
 * Factory function for Claude provider
 */
export function createClaudeProvider(config: LLMClientConfig): ClaudeProvider {
  return new ClaudeProvider(config);
}
