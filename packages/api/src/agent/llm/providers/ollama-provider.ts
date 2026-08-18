/**
 * Ollama Provider
 * LLM provider implementation for Ollama local inference
 */

import { z } from 'zod';

import { logger } from '../../../lib/logger.js';
import { BaseLLMProvider } from '../provider-interface.js';
import {
  isContentBlock,
  isToolResultContent,
  type ContentBlock,
  type LLMClientConfig,
  type LLMMessage,
  type LLMResponse,
  type LLMUsageStats,
  type SendMessageParams,
  type StreamEvent,
  type StreamMessageParams,
  type ToolDefinition,
} from '../types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.3';

// ============================================================================
// OLLAMA TYPES
// ============================================================================

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }>;
}

interface OllamaToolResult {
  role: 'tool';
  content: string;
}

// Response schema for Ollama /api/chat endpoint
const ollamaResponseSchema = z.object({
  model: z.string(),
  created_at: z.string(),
  message: z.object({
    role: z.string(),
    content: z.string(),
    tool_calls: z
      .array(
        z.object({
          function: z.object({
            name: z.string(),
            arguments: z.unknown(),
          }),
        }),
      )
      .optional(),
  }),
  done: z.boolean(),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

type OllamaResponse = z.infer<typeof ollamaResponseSchema>;

// ============================================================================
// OLLAMA PROVIDER
// ============================================================================

/**
 * Ollama provider implementation
 */
export class OllamaProvider extends BaseLLMProvider {
  private baseUrl: string;
  private temperature: number;

  constructor(config: LLMClientConfig) {
    super(config, 'ollama', config.model || DEFAULT_OLLAMA_MODEL);
    this.baseUrl = config.baseUrl || DEFAULT_OLLAMA_BASE_URL;
    this.temperature = config.temperature ?? 0.7;
  }

  /**
   * Ollama uses fallback streaming
   */
  override supportsStreaming(): boolean {
    return false;
  }

  /**
   * Convert our tool format to Ollama format
   */
  private toOllamaTools(tools: ToolDefinition[]): OllamaTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.input_schema.properties,
          required: tool.input_schema.required,
        },
      },
    }));
  }

  /**
   * Convert our message format to Ollama format
   */
  private toOllamaMessages(
    system: string,
    messages: LLMMessage[],
  ): Array<OllamaMessage | OllamaToolResult> {
    const ollamaMessages: Array<OllamaMessage | OllamaToolResult> = [];

    // Add system message first
    if (system) {
      ollamaMessages.push({
        role: 'system',
        content: system,
      });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        ollamaMessages.push({
          role: msg.role,
          content: msg.content,
        });
      } else if (Array.isArray(msg.content)) {
        // Handle content blocks
        const textParts: string[] = [];
        const toolCalls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> =
          [];
        const toolResults: Array<{ tool_use_id: string; content: string }> = [];

        for (const block of msg.content) {
          // Check for tool_result first (separate type)
          if (isToolResultContent(block)) {
            toolResults.push({
              tool_use_id: block.tool_use_id,
              content: block.content,
            });
          } else if (isContentBlock(block)) {
            // ContentBlock is either text or tool_use
            if (block.type === 'text') {
              textParts.push(block.text);
            } else if (block.type === 'tool_use') {
              // Build arguments object by copying properties from input
              const args: Record<string, unknown> = {};
              if (block.input && typeof block.input === 'object' && !Array.isArray(block.input)) {
                for (const [key, value] of Object.entries(block.input)) {
                  args[key] = value;
                }
              }
              toolCalls.push({
                function: {
                  name: block.name,
                  arguments: args,
                },
              });
            }
          }
        }

        // If we have tool calls, this is an assistant message with tool calls
        if (toolCalls.length > 0) {
          ollamaMessages.push({
            role: 'assistant',
            content: textParts.join('') || '',
            tool_calls: toolCalls,
          });
        } else if (toolResults.length > 0) {
          // Tool results are sent as separate tool messages
          for (const result of toolResults) {
            ollamaMessages.push({
              role: 'tool',
              content: result.content,
            });
          }
        } else if (textParts.length > 0) {
          ollamaMessages.push({
            role: msg.role,
            content: textParts.join(''),
          });
        }
      }
    }

    return ollamaMessages;
  }

  /**
   * Parse Ollama response to our format
   */
  private parseResponse(response: OllamaResponse): LLMResponse {
    const content: ContentBlock[] = [];

    // Add text content if present
    if (response.message.content) {
      content.push({ type: 'text', text: response.message.content });
    }

    // Convert tool_calls to our ToolUseContent format
    if (response.message.tool_calls) {
      for (const toolCall of response.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: toolCall.function.name,
          input: toolCall.function.arguments,
        });
      }
    }

    // Map done_reason to our format
    let stopReason: string | null = null;
    if (response.done) {
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        stopReason = 'tool_use';
      } else if (response.done_reason === 'stop') {
        stopReason = 'end_turn';
      } else if (response.done_reason === 'length') {
        stopReason = 'max_tokens';
      } else {
        stopReason = response.done_reason ?? 'end_turn';
      }
    }

    // Build usage stats if available
    const usage: LLMUsageStats | undefined =
      response.prompt_eval_count !== undefined || response.eval_count !== undefined
        ? {
            inputTokens: response.prompt_eval_count ?? 0,
            outputTokens: response.eval_count ?? 0,
            totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
          }
        : undefined;

    return { content, stopReason, usage };
  }

  /**
   * Send a message (non-streaming)
   */
  async sendMessage(params: SendMessageParams): Promise<LLMResponse> {
    const ollamaMessages = this.toOllamaMessages(params.system, params.messages);
    const ollamaTools = params.tools ? this.toOllamaTools(params.tools) : undefined;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: this.temperature,
        num_predict: this.maxTokens,
      },
    };

    if (ollamaTools && ollamaTools.length > 0) {
      body.tools = ollamaTools;
    }

    logger.info('Ollama request', {
      baseUrl: this.baseUrl,
      model: this.model,
      messageCount: ollamaMessages.length,
      toolCount: ollamaTools?.length || 0,
    });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Ollama API error', { status: response.status, error: errorText });
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const rawData: unknown = await response.json();

    const parseResult = ollamaResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      logger.error('Ollama response validation failed', {
        issues: parseResult.error.issues,
        rawData: JSON.stringify(rawData).slice(0, 500),
      });
      throw new Error('Invalid Ollama API response format');
    }

    logger.info('Ollama response', {
      model: parseResult.data.model,
      done: parseResult.data.done,
      doneReason: parseResult.data.done_reason,
      promptTokens: parseResult.data.prompt_eval_count,
      completionTokens: parseResult.data.eval_count,
      hasToolCalls: !!parseResult.data.message.tool_calls?.length,
    });

    return this.parseResponse(parseResult.data);
  }

  /**
   * Stream a message response (uses fallback implementation)
   */
  override async *streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
    yield* this.fallbackStreamMessage(params);
  }

  /**
   * Check if Ollama is available at the configured URL
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return [];
      }

      const data: unknown = await response.json();
      return this.extractModelNames(data);
    } catch {
      return [];
    }
  }

  /**
   * Extract model names from Ollama API response
   */
  private extractModelNames(data: unknown): string[] {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return [];
    }

    // Find the models property
    let modelsValue: unknown;
    for (const [key, value] of Object.entries(data)) {
      if (key === 'models') {
        modelsValue = value;
        break;
      }
    }

    if (!Array.isArray(modelsValue)) {
      return [];
    }

    const names: string[] = [];
    for (const model of modelsValue) {
      if (model && typeof model === 'object' && !Array.isArray(model)) {
        for (const [key, value] of Object.entries(model)) {
          if (key === 'name' && typeof value === 'string') {
            names.push(value);
            break;
          }
        }
      }
    }
    return names;
  }
}

/**
 * Factory function for Ollama provider
 */
export function createOllamaProvider(config: LLMClientConfig): OllamaProvider {
  return new OllamaProvider(config);
}
