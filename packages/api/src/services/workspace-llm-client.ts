/**
 * Workspace LLM Client Service
 * Resolves LLM credentials with priority: User > Workspace > Org > Env vars
 */

import { LLMProvider as PrismaLLMProvider, prisma } from '@sentinel/db';

import { isLocalProvider, type LLMProviderType } from '../agent/llm-providers.js';
import { LLMClient, LLMClientConfig, LLMProvider } from '../agent/llm/index.js';
import { decryptString } from '../lib/crypto.js';

/** Deployment mode: 'managed' (cloud only) or 'self-hosted' (allows local providers) */
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'self-hosted';

export interface ResolvedLLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  source: 'user' | 'workspace' | 'org' | 'env';
}

/**
 * Map Prisma LLMProvider enum to llm-client LLMProvider type
 */
function mapPrismaProvider(provider: PrismaLLMProvider): LLMProvider {
  switch (provider) {
    case 'CLAUDE':
      return 'claude';
    case 'OPENAI':
      return 'openai';
    case 'GEMINI':
      return 'gemini';
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unknown provider: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Map org settings string provider to LLMProvider type
 */
function mapOrgProvider(provider: string): LLMProvider | null {
  const validProviders: LLMProvider[] = [
    'gemini',
    'claude',
    'openai',
    'ollama',
    'lmstudio',
    'custom',
  ];
  if (validProviders.includes(provider as LLMProvider)) {
    return provider as LLMProvider;
  }
  return null;
}

/**
 * Get provider from environment variable name
 */
function getProviderFromEnvKey(envKey: string): LLMProvider | null {
  if (envKey === 'ANTHROPIC_API_KEY') return 'claude';
  if (envKey === 'OPENAI_API_KEY') return 'openai';
  if (envKey === 'GEMINI_API_KEY') return 'gemini';
  return null;
}

/**
 * Get the default model for a provider
 */
function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case 'claude':
      return 'claude-sonnet-4-5-20250514';
    case 'openai':
      return 'gpt-5.2';
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'ollama':
      return 'llama3.3';
    case 'lmstudio':
    case 'custom':
      return 'local-model';
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unknown provider: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Resolve LLM configuration with priority:
 * 1. User's personal LLM config for the workspace (decrypted apiKey)
 * 2. Workspace chat settings (defaultLlmProvider/defaultLlmModel) + env vars
 * 3. Organization settings (llmProvider/llmModel/llmApiKey)
 * 4. Environment variables: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
 */
export async function resolveConfig(
  workspaceId: string,
  userId: string,
): Promise<ResolvedLLMConfig> {
  // Get workspace to find organizationId
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { organizationId: true },
  });

  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  // Priority 1: Check user's personal LLM config for this workspace
  const userConfig = await prisma.userLLMConfig.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
  });

  if (userConfig) {
    const decryptedApiKey = decryptString(userConfig.apiKey);
    return {
      provider: mapPrismaProvider(userConfig.provider),
      apiKey: decryptedApiKey,
      model: userConfig.model ?? getDefaultModel(mapPrismaProvider(userConfig.provider)),
      source: 'user',
    };
  }

  // Priority 2: Check workspace chat settings for default provider/model
  const workspaceSettings = await prisma.workspaceChatSettings.findUnique({
    where: { workspaceId },
  });

  if (workspaceSettings?.defaultLlmProvider) {
    const provider = mapPrismaProvider(workspaceSettings.defaultLlmProvider);
    const apiKey = getEnvApiKey(provider);

    if (apiKey) {
      return {
        provider,
        apiKey,
        model: workspaceSettings.defaultLlmModel ?? getDefaultModel(provider),
        source: 'workspace',
      };
    }
  }

  // Priority 3: Check organization settings
  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId: workspace.organizationId },
  });

  if (orgSettings && orgSettings.llmProvider !== 'auto') {
    const provider = mapOrgProvider(orgSettings.llmProvider);
    if (provider) {
      // Validate deployment mode for local providers
      if (DEPLOYMENT_MODE === 'managed' && isLocalProvider(provider as LLMProviderType)) {
        throw new Error(
          `Local provider '${provider}' is not allowed in managed deployment mode. ` +
            'Only cloud providers (OpenAI, Claude, Gemini) are available.',
        );
      }

      // Get API key: org setting (decrypted) or env var
      let apiKey: string | undefined;
      if (orgSettings.llmApiKey) {
        apiKey = decryptString(orgSettings.llmApiKey);
      } else {
        apiKey = getEnvApiKey(provider) ?? undefined;
      }

      // For local providers, API key is optional
      const requiresApiKey = !isLocalProvider(provider as LLMProviderType);
      if (requiresApiKey && !apiKey) {
        // Fall through to env vars
      } else {
        return {
          provider,
          apiKey,
          model: orgSettings.llmModel ?? getDefaultModel(provider),
          baseUrl: orgSettings.llmBaseUrl ?? undefined,
          maxTokens: orgSettings.llmMaxTokens,
          temperature: orgSettings.llmTemperature,
          source: 'org',
        };
      }
    }
  }

  // Priority 4: Fall back to environment variables
  const envConfig = getEnvConfig();
  if (envConfig) {
    return {
      ...envConfig,
      source: 'env',
    };
  }

  throw new Error(
    'No LLM configuration available. Configure user API key, workspace settings, organization settings, or set environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY).',
  );
}

/**
 * Get API key from environment for a specific provider
 */
function getEnvApiKey(provider: LLMProvider): string | null {
  switch (provider) {
    case 'claude':
      return process.env.ANTHROPIC_API_KEY || null;
    case 'openai':
      return process.env.OPENAI_API_KEY || null;
    case 'gemini':
      return process.env.GEMINI_API_KEY || null;
    case 'ollama':
    case 'lmstudio':
    case 'custom':
      // Local providers don't need API keys from env
      return null;
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unknown provider: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Get LLM config from environment variables
 * Priority: ANTHROPIC_API_KEY > OPENAI_API_KEY > GEMINI_API_KEY
 */
function getEnvConfig(): { provider: LLMProvider; apiKey: string; model: string } | null {
  const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'] as const;

  for (const envKey of envKeys) {
    const apiKey = process.env[envKey];
    if (apiKey) {
      const provider = getProviderFromEnvKey(envKey);
      if (provider) {
        return {
          provider,
          apiKey,
          model: getDefaultModel(provider),
        };
      }
    }
  }

  return null;
}

/**
 * Create an LLMClient with resolved configuration
 */
export async function createClient(workspaceId: string, userId: string): Promise<LLMClient> {
  const config = await resolveConfig(workspaceId, userId);

  const clientConfig: LLMClientConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };

  return new LLMClient(clientConfig);
}
