/**
 * LLM Provider Registry
 * Defines available providers, their metadata, and pricing information
 */

// ============================================================================
// TYPES
// ============================================================================

export type LLMProviderType =
  | 'auto'
  | 'gemini'
  | 'claude'
  | 'openai'
  | 'ollama'
  | 'lmstudio'
  | 'custom';

export interface LLMModelPricing {
  inputPer1M: number; // $ per 1M input tokens
  outputPer1M: number; // $ per 1M output tokens
}

export interface LLMModelInfo {
  id: string;
  name: string;
  pricing: LLMModelPricing;
}

export interface LLMProviderInfo {
  id: LLMProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  isLocal: boolean;
  defaultModels: LLMModelInfo[];
  defaultBaseUrl?: string;
}

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * Registry of all supported LLM providers with their metadata and pricing
 * Pricing verified as of Jan 2026
 * Sources:
 * - OpenAI: https://platform.openai.com/docs/pricing
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * - Google: https://ai.google.dev/gemini-api/docs/pricing
 */
export const LLM_PROVIDERS: Record<LLMProviderType, LLMProviderInfo> = {
  auto: {
    id: 'auto',
    name: 'Auto',
    description: 'Automatically select provider based on available API keys',
    requiresApiKey: false,
    requiresBaseUrl: false,
    isLocal: false,
    defaultModels: [],
  },

  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google Gemini models via Generative Language API',
    requiresApiKey: true,
    requiresBaseUrl: false,
    isLocal: false,
    defaultModels: [
      {
        id: 'gemini-3-flash',
        name: 'Gemini 3 Flash',
        pricing: { inputPer1M: 0.5, outputPer1M: 3.0 },
      },
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro Preview',
        pricing: { inputPer1M: 2.0, outputPer1M: 12.0 },
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
      {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash-Lite',
        pricing: { inputPer1M: 0.1, outputPer1M: 0.4 },
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        pricing: { inputPer1M: 1.25, outputPer1M: 10.0 },
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash (Deprecated)',
        pricing: { inputPer1M: 0.1, outputPer1M: 0.4 },
      },
    ],
  },

  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    description: 'Anthropic Claude models via Messages API',
    requiresApiKey: true,
    requiresBaseUrl: false,
    isLocal: false,
    defaultModels: [
      {
        id: 'claude-sonnet-4-5-20250514',
        name: 'Claude Sonnet 4.5',
        pricing: { inputPer1M: 3.0, outputPer1M: 15.0 },
      },
      {
        id: 'claude-haiku-4-5-20250514',
        name: 'Claude Haiku 4.5',
        pricing: { inputPer1M: 1.0, outputPer1M: 5.0 },
      },
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        pricing: { inputPer1M: 5.0, outputPer1M: 25.0 },
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        pricing: { inputPer1M: 3.0, outputPer1M: 15.0 },
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        pricing: { inputPer1M: 1.0, outputPer1M: 5.0 },
      },
    ],
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI models via Chat Completions API',
    requiresApiKey: true,
    requiresBaseUrl: false,
    isLocal: false,
    defaultModels: [
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        pricing: { inputPer1M: 1.75, outputPer1M: 14.0 },
      },
      {
        id: 'gpt-5',
        name: 'GPT-5',
        pricing: { inputPer1M: 1.25, outputPer1M: 10.0 },
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        pricing: { inputPer1M: 0.25, outputPer1M: 2.0 },
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        pricing: { inputPer1M: 2.5, outputPer1M: 10.0 },
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
    ],
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models via Ollama native API',
    requiresApiKey: false,
    requiresBaseUrl: true,
    isLocal: true,
    defaultBaseUrl: 'http://localhost:11434',
    defaultModels: [
      {
        id: 'llama3.3',
        name: 'Llama 3.3',
        pricing: { inputPer1M: 0, outputPer1M: 0 },
      },
      {
        id: 'qwen2.5',
        name: 'Qwen 2.5',
        pricing: { inputPer1M: 0, outputPer1M: 0 },
      },
      {
        id: 'mistral',
        name: 'Mistral',
        pricing: { inputPer1M: 0, outputPer1M: 0 },
      },
      {
        id: 'codellama',
        name: 'Code Llama',
        pricing: { inputPer1M: 0, outputPer1M: 0 },
      },
    ],
  },

  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    description: 'Local models via LM Studio OpenAI-compatible API',
    requiresApiKey: false,
    requiresBaseUrl: true,
    isLocal: true,
    defaultBaseUrl: 'http://localhost:1234/v1',
    defaultModels: [
      {
        id: 'local-model',
        name: 'Local Model',
        pricing: { inputPer1M: 0, outputPer1M: 0 },
      },
    ],
  },

  custom: {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    description: 'Any OpenAI-compatible API endpoint',
    requiresApiKey: true,
    requiresBaseUrl: true,
    isLocal: false,
    defaultModels: [],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a provider runs locally (no cloud API calls)
 */
export function isLocalProvider(provider: LLMProviderType): boolean {
  return LLM_PROVIDERS[provider]?.isLocal ?? false;
}

/**
 * Get pricing for a specific provider and model
 * Returns null if model not found or is a local provider
 */
export function getProviderPricing(
  provider: LLMProviderType,
  modelId: string,
): LLMModelPricing | null {
  const providerInfo = LLM_PROVIDERS[provider];
  if (!providerInfo) return null;

  // Local providers have no cost
  if (providerInfo.isLocal) {
    return { inputPer1M: 0, outputPer1M: 0 };
  }

  // Find the model in the provider's default models
  const model = providerInfo.defaultModels.find((m) => m.id === modelId);
  if (model) {
    return model.pricing;
  }

  // For unknown models, return null (caller should handle)
  return null;
}

/**
 * Calculate estimated cost in cents for a request
 */
export function calculateCostCents(
  provider: LLMProviderType,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = getProviderPricing(provider, modelId);
  if (!pricing) return null;

  // Local providers have no cost
  if (pricing.inputPer1M === 0 && pricing.outputPer1M === 0) {
    return 0;
  }

  // Calculate cost: tokens / 1M * $/1M * 100 (to cents)
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M * 100;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M * 100;

  return Math.round(inputCost + outputCost);
}

/**
 * Get the default model ID for a provider
 */
export function getDefaultModelId(provider: LLMProviderType): string | null {
  const providerInfo = LLM_PROVIDERS[provider];
  if (!providerInfo || providerInfo.defaultModels.length === 0) {
    return null;
  }
  return providerInfo.defaultModels[0].id;
}

/**
 * Get provider info by ID
 */
export function getProviderInfo(provider: LLMProviderType): LLMProviderInfo | null {
  return LLM_PROVIDERS[provider] ?? null;
}

/**
 * List all available providers (excluding 'auto')
 */
export function listProviders(): LLMProviderInfo[] {
  return Object.values(LLM_PROVIDERS).filter((p) => p.id !== 'auto');
}

/**
 * Check if a provider type is valid
 */
export function isValidProvider(provider: string): provider is LLMProviderType {
  return provider in LLM_PROVIDERS;
}
