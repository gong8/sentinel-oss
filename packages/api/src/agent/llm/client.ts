/**
 * LLM Client
 * Unified facade for LLM provider access
 */

import { prisma } from '@sentinel/db';
import { z } from 'zod';

import { decryptString } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { calculateCostCents, isLocalProvider } from '../llm-providers.js';
import type { ILLMProvider } from './provider-interface.js';
import { createProvider, getDefaultProvider, getEffectiveApiKey } from './providers/index.js';
import type {
  ContentBlock,
  LLMClientConfig,
  LLMProvider,
  LLMResponse,
  LLMUsageStats,
  SendMessageParams,
  StreamEvent,
  StreamMessageParams,
  TextContent,
  ToolResultContent,
  ToolUseContent,
} from './types.js';
import {
  extractText,
  extractToolUses,
  isContentBlock,
  isTextBlock,
  isToolResultContent,
  isToolUse,
} from './types.js';

// Schema to validate LLM provider values from database
const llmProviderSchema = z.enum(['gemini', 'claude', 'openai', 'ollama', 'lmstudio', 'custom']);

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'self-hosted';

// ============================================================================
// LLM CLIENT
// ============================================================================

/**
 * Unified LLM Client
 * Provides a consistent interface across all LLM providers
 */
export class LLMClient {
  private provider: ILLMProvider;

  constructor(config: LLMClientConfig = {}) {
    this.provider = createProvider(config);
    logger.info('Initialized LLM client', {
      provider: this.provider.getProvider(),
      model: this.provider.getModel(),
    });
  }

  /**
   * Create an LLMClient configured from organization settings
   * Priority: Org settings > Environment variables
   */
  static async forOrganization(organizationId: string): Promise<LLMClient> {
    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!organization) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    // Fetch org settings
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId },
    });

    // Determine provider - validate the stored value against allowed providers
    let provider: LLMProvider;
    if (settings?.llmProvider && settings.llmProvider !== 'auto') {
      const parseResult = llmProviderSchema.safeParse(settings.llmProvider);
      provider = parseResult.success ? parseResult.data : getDefaultProvider();
    } else {
      provider = getDefaultProvider();
    }

    // Resolve API key
    let apiKey: string | undefined;
    if (settings?.llmApiKey) {
      apiKey = decryptString(settings.llmApiKey);
    } else {
      apiKey = getEffectiveApiKey(provider);
    }

    // Validate deployment mode for local providers
    if (DEPLOYMENT_MODE === 'managed' && isLocalProvider(provider)) {
      throw new Error(
        `Local provider '${provider}' is not allowed in managed deployment mode. ` +
          'Only cloud providers (OpenAI, Claude, Gemini) are available.',
      );
    }

    logger.info('Creating LLMClient for organization', {
      organizationId,
      provider,
      model: settings?.llmModel,
      hasOrgApiKey: !!settings?.llmApiKey,
      hasBaseUrl: !!settings?.llmBaseUrl,
    });

    return new LLMClient({
      provider,
      apiKey,
      model: settings?.llmModel ?? undefined,
      baseUrl: settings?.llmBaseUrl ?? undefined,
      maxTokens: settings?.llmMaxTokens ?? undefined,
      temperature: settings?.llmTemperature ?? undefined,
    });
  }

  /**
   * Get the current provider type
   */
  getProvider(): LLMProvider {
    return this.provider.getProvider();
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.provider.getModel();
  }

  /**
   * Check if streaming is supported
   */
  supportsStreaming(): boolean {
    return this.provider.supportsStreaming();
  }

  /**
   * Send a message and get a response (non-streaming)
   */
  async sendMessage(params: SendMessageParams): Promise<LLMResponse> {
    return this.provider.sendMessage(params);
  }

  /**
   * Stream a message response
   * Falls back to non-streaming for providers that don't support it
   */
  async *streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
    yield* this.provider.streamMessage(params);
  }

  /**
   * Calculate cost for a request (in cents)
   * Returns null for local providers or unknown models
   */
  calculateCost(usage: LLMUsageStats): number | null {
    return calculateCostCents(
      this.provider.getProvider(),
      this.provider.getModel(),
      usage.inputTokens,
      usage.outputTokens,
    );
  }

  // ============================================================================
  // STATIC HELPER METHODS
  // ============================================================================

  /**
   * Check if a content block is a tool use
   */
  static isToolUse(block: ContentBlock): block is ToolUseContent {
    return isToolUse(block);
  }

  /**
   * Check if a content block is text
   */
  static isTextBlock(block: ContentBlock): block is TextContent {
    return isTextBlock(block);
  }

  /**
   * Type guard to check if an unknown value is a ContentBlock
   */
  static isContentBlock(block: unknown): block is ContentBlock {
    return isContentBlock(block);
  }

  /**
   * Type guard to check if an unknown value is a ToolResultContent
   */
  static isToolResultContent(block: unknown): block is ToolResultContent {
    return isToolResultContent(block);
  }

  /**
   * Extract text content from blocks
   */
  static extractText(content: ContentBlock[]): string {
    return extractText(content);
  }

  /**
   * Extract tool uses from blocks
   */
  static extractToolUses(content: ContentBlock[]): ToolUseContent[] {
    return extractToolUses(content);
  }
}

/**
 * Create an LLM client with the given configuration
 */
export function createLLMClient(config: LLMClientConfig = {}): LLMClient {
  return new LLMClient(config);
}
