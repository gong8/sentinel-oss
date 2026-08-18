/**
 * OpenAI Provider
 * LLM provider implementation for OpenAI models (GPT-4, etc.)
 */

import OpenAI from 'openai';

import { logger } from '../../../lib/logger.js';
import { requiresMaxCompletionTokens } from '../../config/index.js';
import { BaseLLMProvider } from '../provider-interface.js';
import { cleanSchemaForOpenAI, sanitizeToolNameForOpenAI } from '../schema-utils.js';
import { OPENAI_STOP_REASON_MAP } from '../schemas.js';
import type {
  ContentBlock,
  LLMClientConfig,
  LLMMessage,
  LLMResponse,
  LLMUsageStats,
  SendMessageParams,
  StreamEvent,
  StreamMessageParams,
  ToolDefinition,
  ToolInputSchema,
} from '../types.js';

/**
 * Convert ToolInputSchema to a plain object for SDK compatibility
 * This avoids type assertions by explicitly copying properties
 * Also cleans the schema for OpenAI compatibility (Draft 4 -> Draft 6+ conversion)
 */
function toFunctionParameters(schema: ToolInputSchema): Record<string, unknown> {
  // Clean the schema for OpenAI compatibility before copying
  const cleanedSchema = cleanSchemaForOpenAI(schema);
  // cleanSchemaForOpenAI returns unknown, copy properties to build result
  if (!cleanedSchema || typeof cleanedSchema !== 'object' || Array.isArray(cleanedSchema)) {
    return { type: 'object', properties: {} };
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cleanedSchema)) {
    result[key] = value;
  }
  return result;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || '';
const DEFAULT_OPENAI_MODEL = 'gpt-5.2';

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseLLMProvider {
  private client: OpenAI;
  private toolNameMap: Map<string, string> = new Map(); // sanitized -> original

  constructor(config: LLMClientConfig) {
    const apiKey = config.apiKey || OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    super(config, 'openai', LLM_MODEL || DEFAULT_OPENAI_MODEL);
    this.client = new OpenAI({ apiKey });
  }

  /**
   * OpenAI supports native streaming
   */
  override supportsStreaming(): boolean {
    return true;
  }

  /**
   * Convert our tool format to OpenAI function calling format
   * Also sanitizes tool names and builds a mapping to restore original names
   */
  private toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    // Clear previous mapping
    this.toolNameMap.clear();

    return tools.map((tool) => {
      const sanitizedName = sanitizeToolNameForOpenAI(tool.name);
      // Store mapping from sanitized to original name (lowercase for case-insensitive lookup)
      if (sanitizedName !== tool.name) {
        this.toolNameMap.set(sanitizedName.toLowerCase(), tool.name);
      }
      return {
        type: 'function' as const,
        function: {
          name: sanitizedName,
          description: tool.description,
          parameters: toFunctionParameters(tool.input_schema),
        },
      };
    });
  }

  /**
   * Restore original tool name from sanitized name (case-insensitive lookup)
   */
  private restoreToolName(sanitizedName: string): string {
    return this.toolNameMap.get(sanitizedName.toLowerCase()) || sanitizedName;
  }

  /**
   * Convert our message format to OpenAI format
   */
  private toOpenAIMessages(
    system: string,
    messages: LLMMessage[],
  ): OpenAI.ChatCompletionMessageParam[] {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    // Add system message first
    if (system) {
      openaiMessages.push({
        role: 'system',
        content: system,
      });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        openaiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      } else if (Array.isArray(msg.content)) {
        // Handle content blocks
        const textParts: string[] = [];
        const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
        const toolResults: Array<{ tool_call_id: string; content: string }> = [];

        for (const block of msg.content) {
          if ('type' in block) {
            if (block.type === 'text') {
              textParts.push(block.text);
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                  name: sanitizeToolNameForOpenAI(block.name),
                  arguments: JSON.stringify(block.input),
                },
              });
            } else if (block.type === 'tool_result') {
              toolResults.push({
                tool_call_id: block.tool_use_id,
                // Ensure content is always a string - OpenAI requires this for tool messages
                content: block.content ?? JSON.stringify({ result: null }),
              });
            }
          }
        }

        // If we have tool calls, this is an assistant message with tool calls
        if (toolCalls.length > 0) {
          openaiMessages.push({
            role: 'assistant',
            content: textParts.length > 0 ? textParts.join('') : null,
            tool_calls: toolCalls,
          });
        } else if (toolResults.length > 0) {
          // Tool results are sent as separate tool messages
          for (const result of toolResults) {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: result.tool_call_id,
              content: result.content,
            });
          }
        } else if (textParts.length > 0) {
          openaiMessages.push({
            role: msg.role,
            content: textParts.join(''),
          });
        }
      }
    }

    return openaiMessages;
  }

  /**
   * Parse OpenAI response to our format
   */
  private parseResponse(response: OpenAI.ChatCompletion): LLMResponse {
    const content: ContentBlock[] = [];
    const choice = response.choices[0];

    if (!choice) {
      logger.error('OpenAI response missing choices', {
        fullResponse: JSON.stringify(response).slice(0, 500),
      });
      return { content: [], stopReason: 'error' };
    }

    const message = choice.message;

    // Add text content if present
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }

    // Convert tool_calls to our ToolUseContent format
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          let input: unknown;
          try {
            input = JSON.parse(toolCall.function.arguments);
          } catch {
            logger.warn('Failed to parse OpenAI tool call arguments', {
              toolName: toolCall.function.name,
              arguments: toolCall.function.arguments,
            });
            input = {};
          }

          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: this.restoreToolName(toolCall.function.name),
            input,
          });
        }
      }
    }

    const finishReason = choice.finish_reason || null;
    const stopReason = finishReason ? (OPENAI_STOP_REASON_MAP[finishReason] ?? finishReason) : null;

    // Build usage stats from OpenAI's response
    const usage: LLMUsageStats | undefined = response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined;

    return { content, stopReason, usage };
  }

  /**
   * Send a message (non-streaming)
   */
  async sendMessage(params: SendMessageParams): Promise<LLMResponse> {
    const openaiMessages = this.toOpenAIMessages(params.system, params.messages);
    const openaiTools = params.tools ? this.toOpenAITools(params.tools) : undefined;

    logger.info('OpenAI request', {
      model: this.model,
      messageCount: openaiMessages.length,
      toolCount: openaiTools?.length || 0,
      hasSystemPrompt: !!params.system,
      systemPromptLength: params.system?.length || 0,
    });

    // Use max_completion_tokens for newer OpenAI models, max_tokens for legacy models
    const useNewTokenParam = requiresMaxCompletionTokens(this.model);
    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: openaiMessages,
      ...(useNewTokenParam
        ? { max_completion_tokens: this.maxTokens }
        : { max_tokens: this.maxTokens }),
    };

    if (openaiTools && openaiTools.length > 0) {
      requestParams.tools = openaiTools;
    }

    const response = await this.client.chat.completions.create(requestParams);

    logger.info('OpenAI response', {
      id: response.id,
      model: response.model,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      finishReason: response.choices[0]?.finish_reason,
    });

    return this.parseResponse(response);
  }

  /**
   * Stream a message response
   */
  override async *streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
    const openaiMessages = this.toOpenAIMessages(params.system, params.messages);
    const openaiTools = params.tools ? this.toOpenAITools(params.tools) : undefined;

    const useNewTokenParam = requiresMaxCompletionTokens(this.model);
    const requestParams: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages: openaiMessages,
      stream: true,
      stream_options: { include_usage: true },
      ...(useNewTokenParam
        ? { max_completion_tokens: this.maxTokens }
        : { max_tokens: this.maxTokens }),
    };

    if (openaiTools && openaiTools.length > 0) {
      requestParams.tools = openaiTools;
    }

    const stream = await this.client.chat.completions.create(requestParams);

    // Track tool calls being built
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: LLMUsageStats | undefined;
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      if (choice?.delta?.content) {
        yield { type: 'text', text: choice.delta.content };
      }

      if (choice?.delta?.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          const index = toolCall.index;
          let existing = toolCalls.get(index);

          if (toolCall.id && toolCall.function?.name) {
            // New tool call starting - restore original name from sanitized name
            const originalName = this.restoreToolName(toolCall.function.name);
            existing = { id: toolCall.id, name: originalName, arguments: '' };
            toolCalls.set(index, existing);
            yield { type: 'tool_start', id: toolCall.id, name: originalName };
          }

          if (toolCall.function?.arguments && existing) {
            existing.arguments += toolCall.function.arguments;
            yield {
              type: 'tool_input',
              id: existing.id,
              partialInput: toolCall.function.arguments,
            };
          }
        }
      }

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
        // Emit tool_end for all tracked tools
        for (const tool of toolCalls.values()) {
          yield { type: 'tool_end', id: tool.id };
        }
      }

      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    }

    const stopReason = finishReason ? (OPENAI_STOP_REASON_MAP[finishReason] ?? finishReason) : null;
    yield { type: 'done', stopReason, usage };
  }
}

/**
 * Factory function for OpenAI provider
 */
export function createOpenAIProvider(config: LLMClientConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
