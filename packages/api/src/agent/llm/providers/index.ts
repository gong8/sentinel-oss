/**
 * LLM Providers
 * Factory and registry for LLM provider implementations
 */

import { isLocalProvider } from '../../llm-providers.js';
import type { ILLMProvider, ProviderFactory, ProviderRegistry } from '../provider-interface.js';
import { createProviderRegistry } from '../provider-interface.js';
import type { LLMClientConfig, LLMProvider } from '../types.js';
import { ClaudeProvider, createClaudeProvider } from './claude-provider.js';
import { createGeminiProvider, GeminiProvider } from './gemini-provider.js';
import { createOllamaProvider, OllamaProvider } from './ollama-provider.js';
import {
  createLMStudioProvider,
  createOpenAICompatibleProvider,
  OpenAICompatibleProvider,
} from './openai-compatible-provider.js';
import { createOpenAIProvider, OpenAIProvider } from './openai-provider.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'self-hosted';

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * Default provider registry with all built-in providers
 */
const defaultRegistry: ProviderRegistry = createProviderRegistry();

// Register all providers
defaultRegistry.register('claude', createClaudeProvider);
defaultRegistry.register('openai', createOpenAIProvider);
defaultRegistry.register('gemini', createGeminiProvider);
defaultRegistry.register('ollama', createOllamaProvider);
defaultRegistry.register('lmstudio', createLMStudioProvider);
defaultRegistry.register('custom', createOpenAICompatibleProvider);

/**
 * Get the default provider based on available API keys
 * Priority: OpenAI > Claude > Gemini
 */
export function getDefaultProvider(): LLMProvider {
  if (OPENAI_API_KEY) {
    return 'openai';
  }
  if (ANTHROPIC_API_KEY) {
    return 'claude';
  }
  if (GEMINI_API_KEY) {
    return 'gemini';
  }
  throw new Error(
    'No LLM API key configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in .env',
  );
}

/**
 * Get the effective API key for a provider from environment variables
 */
export function getEffectiveApiKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case 'gemini':
      return GEMINI_API_KEY || undefined;
    case 'claude':
      return ANTHROPIC_API_KEY || undefined;
    case 'openai':
      return OPENAI_API_KEY || undefined;
    case 'ollama':
    case 'lmstudio':
    case 'custom':
      // Local providers may not need API keys
      return undefined;
  }
}

/**
 * Create an LLM provider from configuration
 */
export function createProvider(config: LLMClientConfig): ILLMProvider {
  const provider = config.provider || getDefaultProvider();

  // Validate deployment mode for local providers
  if (DEPLOYMENT_MODE === 'managed' && isLocalProvider(provider)) {
    throw new Error(
      `Local provider '${provider}' is not allowed in managed deployment mode. ` +
        'Only cloud providers (OpenAI, Claude, Gemini) are available.',
    );
  }

  const factory = defaultRegistry.get(provider);
  if (!factory) {
    throw new Error(`Unknown LLM provider: ${provider}`);
  }

  return factory(config);
}

/**
 * Check if a provider is registered
 */
export function hasProvider(provider: LLMProvider): boolean {
  return defaultRegistry.has(provider);
}

/**
 * Register a custom provider factory
 */
export function registerProvider(provider: LLMProvider, factory: ProviderFactory): void {
  defaultRegistry.register(provider, factory);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ClaudeProvider,
  createClaudeProvider,
  createGeminiProvider,
  createLMStudioProvider,
  createOllamaProvider,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  OpenAIProvider,
};
