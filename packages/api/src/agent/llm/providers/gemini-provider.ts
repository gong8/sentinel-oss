/**
 * Gemini (Google) Provider
 * LLM provider implementation for Google's Gemini models
 */

import { logger } from '../../../lib/logger.js';
import { BaseLLMProvider } from '../provider-interface.js';
import { cleanSchemaForGemini } from '../schema-utils.js';
import {
  GEMINI_STOP_REASON_MAP,
  GeminiResponseSchema,
  type GeminiResponse,
  type GeminiTool,
} from '../schemas.js';
import type {
  ContentBlock,
  LLMClientConfig,
  LLMMessage,
  LLMResponse,
  SendMessageParams,
  StreamEvent,
  StreamMessageParams,
  ToolDefinition,
} from '../types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || '';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// ============================================================================
// GEMINI CONTENT TYPES
// ============================================================================

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{
    text?: string;
    functionCall?: { name: string; args: unknown };
    functionResponse?: { name: string; response: unknown };
  }>;
}

// ============================================================================
// GEMINI PROVIDER
// ============================================================================

/**
 * Gemini provider implementation
 * Uses REST API with fetch for compatibility
 */
export class GeminiProvider extends BaseLLMProvider {
  private apiKey: string;

  constructor(config: LLMClientConfig) {
    const apiKey = config.apiKey || GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for Gemini provider');
    }

    super(config, 'gemini', LLM_MODEL || DEFAULT_GEMINI_MODEL);
    this.apiKey = apiKey;
  }

  /**
   * Gemini uses fallback streaming (REST API doesn't have native streaming in this implementation)
   */
  override supportsStreaming(): boolean {
    return false;
  }

  /**
   * Safely get a value from an unknown object by key
   * Uses Object.entries to avoid type assertions
   */
  private getObjectValue(obj: unknown, key: string): unknown {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return undefined;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) {
        return v;
      }
    }
    return undefined;
  }

  /**
   * Extract properties from cleaned schema safely
   */
  private extractSchemaProperties(
    cleanedSchema: unknown,
  ): { properties: Record<string, unknown>; required: string[] | undefined } | null {
    if (!cleanedSchema || typeof cleanedSchema !== 'object' || Array.isArray(cleanedSchema)) {
      return null;
    }
    const props = this.getObjectValue(cleanedSchema, 'properties');
    const req = this.getObjectValue(cleanedSchema, 'required');

    // Build properties object by copying entries
    const properties: Record<string, unknown> = {};
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      for (const [key, value] of Object.entries(props)) {
        properties[key] = value;
      }
    }

    // Validate and extract required array
    let required: string[] | undefined;
    if (Array.isArray(req)) {
      const validRequired: string[] = [];
      for (const r of req) {
        if (typeof r === 'string') {
          validRequired.push(r);
        }
      }
      if (validRequired.length > 0) {
        required = validRequired;
      }
    }

    return { properties, required };
  }

  /**
   * Extract usage metadata from raw response
   */
  private extractUsageMetadata(
    rawData: unknown,
  ): { promptTokenCount?: unknown; totalTokenCount?: unknown } | undefined {
    const usageMetadata = this.getObjectValue(rawData, 'usageMetadata');
    if (!usageMetadata || typeof usageMetadata !== 'object') {
      return undefined;
    }
    return {
      promptTokenCount: this.getObjectValue(usageMetadata, 'promptTokenCount'),
      totalTokenCount: this.getObjectValue(usageMetadata, 'totalTokenCount'),
    };
  }

  /**
   * Extract error info from raw response if present
   */
  private extractErrorInfo(
    rawData: unknown,
  ): { code?: unknown; message?: unknown; status?: unknown } | null {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return null;
    }
    const error = this.getObjectValue(rawData, 'error');
    if (!error || typeof error !== 'object') {
      return null;
    }
    return {
      code: this.getObjectValue(error, 'code'),
      message: this.getObjectValue(error, 'message'),
      status: this.getObjectValue(error, 'status'),
    };
  }

  /**
   * Convert our tool format to Gemini format
   */
  private toGeminiTools(tools: ToolDefinition[]): GeminiTool[] {
    if (tools.length === 0) return [];
    return [
      {
        functionDeclarations: tools.map((tool) => {
          // Clean the entire schema for Gemini compatibility
          const cleanedSchema = cleanSchemaForGemini(tool.input_schema);
          const extracted = this.extractSchemaProperties(cleanedSchema);
          const properties = extracted?.properties ?? {};
          const hasProperties = Object.keys(properties).length > 0;
          const required = extracted?.required;

          return {
            name: tool.name,
            description: tool.description,
            parameters: hasProperties
              ? {
                  type: 'object',
                  properties,
                  ...(required && required.length > 0 ? { required } : {}),
                }
              : {
                  type: 'object',
                  properties: {},
                },
          };
        }),
      },
    ];
  }

  /**
   * Convert our message format to Gemini format
   */
  private toGeminiContents(messages: LLMMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = [];
    // Track tool_use_id -> function name mapping from previous messages
    const toolIdToName: Map<string, string> = new Map();

    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';

      if (typeof msg.content === 'string') {
        contents.push({
          role,
          parts: [{ text: msg.content }],
        });
      } else if (Array.isArray(msg.content)) {
        const parts: GeminiContent['parts'] = [];

        for (const block of msg.content) {
          if ('type' in block) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'tool_use') {
              // Track tool ID to name mapping
              toolIdToName.set(block.id, block.name);
              parts.push({
                functionCall: {
                  name: block.name,
                  args: block.input,
                },
              });
            } else if (block.type === 'tool_result') {
              // Look up the actual function name from our mapping
              const functionName = toolIdToName.get(block.tool_use_id) || block.tool_use_id;
              parts.push({
                functionResponse: {
                  name: functionName,
                  response: JSON.parse(block.content),
                },
              });
            }
          }
        }

        if (parts.length > 0) {
          contents.push({ role, parts });
        }
      }
    }

    return contents;
  }

  /**
   * Parse Gemini response to our format
   */
  private parseResponse(response: GeminiResponse): LLMResponse {
    const content: ContentBlock[] = [];
    const candidate = response.candidates?.[0];

    if (!candidate?.content?.parts) {
      logger.error('Gemini response missing content', {
        hasCandidate: !!candidate,
        hasContent: !!candidate?.content,
        hasParts: !!candidate?.content?.parts,
        finishReason: candidate?.finishReason,
        fullResponse: JSON.stringify(response).slice(0, 500),
      });
      return { content: [], stopReason: 'error' };
    }

    for (const part of candidate.content.parts) {
      if (part.text) {
        content.push({ type: 'text', text: part.text });
      } else if (part.functionCall) {
        content.push({
          type: 'tool_use',
          id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: part.functionCall.name,
          input: part.functionCall.args,
        });
      }
    }

    const finishReason = candidate.finishReason || null;
    const stopReason = finishReason ? (GEMINI_STOP_REASON_MAP[finishReason] ?? finishReason) : null;

    return { content, stopReason };
  }

  /**
   * Send a message (non-streaming)
   */
  async sendMessage(params: SendMessageParams): Promise<LLMResponse> {
    const contents = this.toGeminiContents(params.messages);
    const tools = params.tools ? this.toGeminiTools(params.tools) : [];

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: this.maxTokens,
      },
    };

    // Use system_instruction for system prompt (modern Gemini API)
    if (params.system) {
      body.system_instruction = {
        parts: [{ text: params.system }],
      };
    }

    if (tools.length > 0) {
      body.tools = tools;
      // Check if conversation has tool results (meaning we're in a follow-up turn)
      const hasToolResults = contents.some(
        (c) => c.parts && c.parts.some((p) => 'functionResponse' in p),
      );
      // Use ANY mode for first turn to force function calling (Gemini 2.5 Flash fix)
      // Use AUTO for follow-up turns so model can respond with text
      body.tool_config = {
        function_calling_config: {
          mode: hasToolResults ? 'AUTO' : 'ANY',
        },
      };
    }

    logger.info('Gemini request', {
      model: this.model,
      contentCount: contents.length,
      toolCount: tools.length > 0 ? tools[0].functionDeclarations.length : 0,
      hasSystemInstruction: !!params.system,
      systemPromptLength: params.system?.length || 0,
    });

    // Retry logic for empty responses (Gemini sometimes returns empty content)
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Gemini API error', { status: response.status, error: errorText });
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const rawData: unknown = await response.json();

      // Log raw response for debugging - use helper to safely extract metadata
      const usageMetadata = this.extractUsageMetadata(rawData);
      logger.info('Gemini raw response', {
        responsePreview: JSON.stringify(rawData).slice(0, 1500),
        promptTokens: usageMetadata?.promptTokenCount,
        totalTokens: usageMetadata?.totalTokenCount,
      });

      // Check for Gemini API error response format
      const errorInfo = this.extractErrorInfo(rawData);
      if (errorInfo) {
        logger.error('Gemini API returned error object', {
          code: errorInfo.code,
          message: errorInfo.message,
          status: errorInfo.status,
        });
        throw new Error(`Gemini API error: ${errorInfo.message || 'Unknown error'}`);
      }

      const parseResult = GeminiResponseSchema.safeParse(rawData);
      if (!parseResult.success) {
        logger.error('Gemini response validation failed', {
          issues: parseResult.error.issues,
          rawData: JSON.stringify(rawData).slice(0, 500),
        });
        throw new Error('Invalid Gemini API response format');
      }

      const parsed = this.parseResponse(parseResult.data);

      // Check for empty response and retry with exponential backoff
      if (parsed.stopReason === 'error' && parsed.content.length === 0 && attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn('Gemini returned empty response, retrying with backoff', {
          attempt: attempt + 1,
          delayMs: delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // If still empty after retries, return a helpful message instead of empty
      if (parsed.content.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: "I apologize, but I wasn't able to generate a response. Please try rephrasing your question or try again.",
            },
          ],
          stopReason: 'end_turn',
        };
      }

      return parsed;
    }

    // Fallback (shouldn't reach here due to return in loop)
    return {
      content: [
        {
          type: 'text',
          text: "I apologize, but I wasn't able to generate a response. Please try again.",
        },
      ],
      stopReason: 'end_turn',
    };
  }

  /**
   * Stream a message response (uses fallback implementation)
   */
  override async *streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
    yield* this.fallbackStreamMessage(params);
  }
}

/**
 * Factory function for Gemini provider
 */
export function createGeminiProvider(config: LLMClientConfig): GeminiProvider {
  return new GeminiProvider(config);
}
