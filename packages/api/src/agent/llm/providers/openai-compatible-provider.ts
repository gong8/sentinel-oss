/**
 * OpenAI-Compatible Provider
 * LLM provider implementation for OpenAI-compatible APIs (LM Studio, custom endpoints)
 */

import { z } from 'zod';

import { logger } from '../../../lib/logger.js';
import { requiresMaxCompletionTokens } from '../../config/index.js';
import { BaseLLMProvider } from '../provider-interface.js';
import { cleanSchemaForOpenAI, sanitizeToolNameForOpenAI } from '../schema-utils.js';
import { OPENAI_STOP_REASON_MAP } from '../schemas.js';
import type {
  ContentBlock,
  LLMClientConfig,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMUsageStats,
  SendMessageParams,
  StreamEvent,
  StreamMessageParams,
  TextContent,
  ToolDefinition,
  ToolInputSchema,
  ToolResultContent,
  ToolUseContent,
} from '../types.js';

/**
 * Convert ToolInputSchema to a plain object for SDK compatibility
 * This avoids type assertions by explicitly copying properties
 * Also cleans the schema for OpenAI compatibility (Draft 4 -> Draft 6+ conversion)
 */
function toFunctionParameters(schema: ToolInputSchema): Record<string, unknown> {
  // Clean the schema for OpenAI compatibility before copying
  const cleanedSchema = cleanSchemaForOpenAI(schema);
  // If cleaning produced an object, copy its entries; otherwise return empty
  if (cleanedSchema && typeof cleanedSchema === 'object' && !Array.isArray(cleanedSchema)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cleanedSchema)) {
      result[key] = value;
    }
    return result;
  }
  // Fallback: return the original schema properties as-is
  return { type: 'object', properties: schema.properties };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_LMSTUDIO_BASE_URL = 'http://localhost:1234/v1';
const DEFAULT_MODEL = 'local-model';

// ============================================================================
// TYPE GUARDS
// ============================================================================

function isTextContent(block: ContentBlock | ToolResultContent): block is TextContent {
  return block.type === 'text';
}

function isToolUseContent(block: ContentBlock | ToolResultContent): block is ToolUseContent {
  return block.type === 'tool_use';
}

function isToolResultContent(block: ContentBlock | ToolResultContent): block is ToolResultContent {
  return block.type === 'tool_result';
}

// ============================================================================
// OPENAI-COMPATIBLE TYPES
// ============================================================================

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Response schema for OpenAI-compatible /chat/completions endpoint
const openaiCompatibleResponseSchema = z.object({
  id: z.string().optional(),
  object: z.string().optional(),
  created: z.number().optional(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      index: z.number().optional(),
      message: z.object({
        role: z.string(),
        content: z.string().nullable(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .optional(),
      }),
      finish_reason: z.string().nullable().optional(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

type OpenAICompatibleResponse = z.infer<typeof openaiCompatibleResponseSchema>;

// ============================================================================
// OPENAI-COMPATIBLE PROVIDER
// ============================================================================

/**
 * OpenAI-compatible provider implementation
 * Supports LM Studio, custom endpoints, and self-hosted solutions
 */
export class OpenAICompatibleProvider extends BaseLLMProvider {
  private baseUrl: string;
  private apiKey: string | undefined;
  private temperature: number;
  private toolNameMap: Map<string, string> = new Map(); // sanitized -> original

  constructor(config: LLMClientConfig, providerType: LLMProvider = 'custom') {
    const defaultBaseUrl = providerType === 'lmstudio' ? DEFAULT_LMSTUDIO_BASE_URL : config.baseUrl;
    if (!defaultBaseUrl && providerType === 'custom') {
      throw new Error('baseUrl is required for custom OpenAI-compatible provider');
    }

    super(config, providerType, config.model || DEFAULT_MODEL);
    this.baseUrl = config.baseUrl || defaultBaseUrl || DEFAULT_LMSTUDIO_BASE_URL;
    this.apiKey = config.apiKey;
    this.temperature = config.temperature ?? 0.7;
  }

  /**
   * OpenAI-compatible uses fallback streaming (no native streaming in this implementation)
   */
  override supportsStreaming(): boolean {
    return false;
  }

  /**
   * Convert our tool format to OpenAI function calling format
   */
  private toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
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
  ): Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }> {
    const openaiMessages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
    }> = [];

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
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];
        const toolResults: Array<{ tool_call_id: string; content: string }> = [];

        for (const block of msg.content) {
          if (isTextContent(block)) {
            textParts.push(block.text);
          } else if (isToolUseContent(block)) {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          } else if (isToolResultContent(block)) {
            toolResults.push({
              tool_call_id: block.tool_use_id,
              content: block.content ?? JSON.stringify({ result: null }),
            });
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
   * Parse OpenAI-compatible response to our format
   */
  private parseResponse(response: OpenAICompatibleResponse): LLMResponse {
    const content: ContentBlock[] = [];
    const choice = response.choices[0];

    if (!choice) {
      logger.error('OpenAI-compatible response missing choices', {
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
        let input: unknown;
        try {
          input = JSON.parse(toolCall.function.arguments);
        } catch {
          logger.warn('Failed to parse tool call arguments', {
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

    const finishReason = choice.finish_reason ?? null;
    const stopReason = finishReason ? (OPENAI_STOP_REASON_MAP[finishReason] ?? finishReason) : null;

    // Build usage stats if available
    const usage: LLMUsageStats | undefined = response.usage
      ? {
          inputTokens: response.usage.prompt_tokens ?? 0,
          outputTokens: response.usage.completion_tokens ?? 0,
          totalTokens: response.usage.total_tokens ?? 0,
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

    logger.info('OpenAI-compatible request', {
      baseUrl: this.baseUrl,
      model: this.model,
      messageCount: openaiMessages.length,
      toolCount: openaiTools?.length || 0,
    });

    // Use max_completion_tokens for newer OpenAI models, max_tokens for legacy/other models
    const tokenParam = requiresMaxCompletionTokens(this.model)
      ? { max_completion_tokens: this.maxTokens }
      : { max_tokens: this.maxTokens };

    const body: Record<string, unknown> = {
      model: this.model,
      ...tokenParam,
      temperature: this.temperature,
      messages: openaiMessages,
    };

    if (openaiTools && openaiTools.length > 0) {
      body.tools = openaiTools;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authorization header if API key is provided
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenAI-compatible API error', { status: response.status, error: errorText });
      throw new Error(`OpenAI-compatible API error: ${response.status} - ${errorText}`);
    }

    const rawData: unknown = await response.json();

    const parseResult = openaiCompatibleResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      logger.error('OpenAI-compatible response validation failed', {
        issues: parseResult.error.issues,
        rawData: JSON.stringify(rawData).slice(0, 500),
      });
      throw new Error('Invalid OpenAI-compatible API response format');
    }

    logger.info('OpenAI-compatible response', {
      model: parseResult.data.model,
      promptTokens: parseResult.data.usage?.prompt_tokens,
      completionTokens: parseResult.data.usage?.completion_tokens,
      finishReason: parseResult.data.choices[0]?.finish_reason,
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
   * Check if the endpoint is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from the endpoint
   */
  async listModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return [];
      }

      const rawData: unknown = await response.json();
      // Validate the response structure before accessing
      const modelsResponseSchema = z.object({
        data: z.array(z.object({ id: z.string() })).optional(),
      });
      const parseResult = modelsResponseSchema.safeParse(rawData);
      if (!parseResult.success) {
        return [];
      }
      return parseResult.data.data?.map((m) => m.id) ?? [];
    } catch {
      return [];
    }
  }
}

/**
 * Factory function for OpenAI-compatible provider (custom endpoints)
 */
export function createOpenAICompatibleProvider(config: LLMClientConfig): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(config, 'custom');
}

/**
 * Factory function for LM Studio provider
 */
export function createLMStudioProvider(config: LLMClientConfig): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(config, 'lmstudio');
}
