/**
 * LLM Provider Interface
 * Defines the contract for LLM provider implementations
 */

import type {
  LLMClientConfig,
  LLMProvider,
  LLMResponse,
  LLMUsageStats,
  SendMessageParams,
  StreamEvent,
  StreamMessageParams,
} from './types.js';

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * Interface for LLM provider implementations
 * Each provider (Claude, OpenAI, Gemini, etc.) implements this interface
 */
export interface ILLMProvider {
  /**
   * Send a message and get a response (non-streaming)
   */
  sendMessage(params: SendMessageParams): Promise<LLMResponse>;

  /**
   * Stream a message response (yields events as they arrive)
   */
  streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent>;

  /**
   * Check if this provider supports native streaming
   */
  supportsStreaming(): boolean;

  /**
   * Get the current model being used
   */
  getModel(): string;

  /**
   * Get the provider type
   */
  getProvider(): LLMProvider;
}

// ============================================================================
// BASE PROVIDER
// ============================================================================

/**
 * Abstract base class for LLM providers
 * Provides common functionality like fallback streaming
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  protected readonly model: string;
  protected readonly maxTokens: number;
  protected readonly providerType: LLMProvider;

  constructor(config: LLMClientConfig, providerType: LLMProvider, defaultModel: string) {
    this.providerType = providerType;
    this.model = config.model || defaultModel;
    this.maxTokens = config.maxTokens || 4096;
  }

  /**
   * Send a message and get a response
   * Must be implemented by each provider
   */
  abstract sendMessage(params: SendMessageParams): Promise<LLMResponse>;

  /**
   * Stream a message response
   * Default implementation falls back to non-streaming
   * Providers with native streaming should override this
   */
  async *streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
    yield* this.fallbackStreamMessage(params);
  }

  /**
   * Check if this provider supports native streaming
   * Default is false - providers with native streaming should override
   */
  supportsStreaming(): boolean {
    return false;
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get the provider type
   */
  getProvider(): LLMProvider {
    return this.providerType;
  }

  /**
   * Fallback streaming for providers that don't support native streaming
   * Sends the full request and emits events after completion
   */
  protected async *fallbackStreamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
    try {
      const response = await this.sendMessage(params);

      // Emit text content
      for (const block of response.content) {
        if (block.type === 'text') {
          yield { type: 'text', text: block.text };
        } else if (block.type === 'tool_use') {
          yield { type: 'tool_start', id: block.id, name: block.name };
          yield { type: 'tool_input', id: block.id, partialInput: JSON.stringify(block.input) };
          yield { type: 'tool_end', id: block.id };
        }
      }

      yield { type: 'done', stopReason: response.stopReason, usage: response.usage };
    } catch (error) {
      yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Calculate cost for a request (in cents)
   * Returns null for local providers or unknown models
   * Subclasses can override for provider-specific pricing
   */
  calculateCost(_usage: LLMUsageStats): number | null {
    return null;
  }
}

// ============================================================================
// PROVIDER FACTORY TYPES
// ============================================================================

/**
 * Factory function type for creating providers
 */
export type ProviderFactory = (config: LLMClientConfig) => ILLMProvider;

/**
 * Registry of provider factories
 */
export interface ProviderRegistry {
  get(provider: LLMProvider): ProviderFactory | undefined;
  register(provider: LLMProvider, factory: ProviderFactory): void;
  has(provider: LLMProvider): boolean;
}

/**
 * Create a simple provider registry
 */
export function createProviderRegistry(): ProviderRegistry {
  const factories = new Map<LLMProvider, ProviderFactory>();

  return {
    get(provider: LLMProvider): ProviderFactory | undefined {
      return factories.get(provider);
    },
    register(provider: LLMProvider, factory: ProviderFactory): void {
      factories.set(provider, factory);
    },
    has(provider: LLMProvider): boolean {
      return factories.has(provider);
    },
  };
}
