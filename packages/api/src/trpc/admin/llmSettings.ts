/**
 * Admin LLM Settings Router
 * Handles LLM provider configuration and usage tracking
 */

import { prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  isLocalProvider,
  listProviders,
  LLM_PROVIDERS,
  type LLMProviderType,
} from '../../agent/llm-providers.js';
import {
  LLMClient,
  OllamaProvider,
  OpenAICompatibleProvider,
  type LLMProvider,
} from '../../agent/llm/index.js';
import { decryptString, encryptString } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { getUsageSummary } from '../../services/llmUsage.js';
import { adminProcedure, router } from '../init.js';

// ============================================================================
// HELPERS
// ============================================================================

const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'self-hosted';

/**
 * Mask an API key for display (show last 4 characters)
 */
function maskApiKey(value: string | null | undefined): string | null {
  if (!value || value.length < 8) return null;
  const lastFour = value.slice(-4);
  return `sk-•••${lastFour}`;
}

// ============================================================================
// ROUTER
// ============================================================================

export const adminLlmSettingsRouter = router({
  /**
   * Get available LLM providers
   */
  getProviders: adminProcedure.query(() => {
    const providers = listProviders();

    // Filter out local providers in managed mode
    if (DEPLOYMENT_MODE === 'managed') {
      return providers.filter((p) => !p.isLocal);
    }

    return providers;
  }),

  /**
   * Get current LLM configuration for the organization
   */
  getLlmConfig: adminProcedure.query(async ({ ctx }) => {
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: ctx.auth.organizationId },
      select: {
        llmProvider: true,
        llmModel: true,
        llmApiKey: true,
        llmBaseUrl: true,
        llmMaxTokens: true,
        llmTemperature: true,
      },
    });

    if (!settings) {
      return {
        llmProvider: 'auto',
        llmModel: null,
        llmApiKeyMasked: null,
        llmBaseUrl: null,
        llmMaxTokens: 4096,
        llmTemperature: 0.7,
      };
    }

    // Decrypt and mask API key for display
    let maskedApiKey: string | null = null;
    if (settings.llmApiKey) {
      try {
        const decrypted = decryptString(settings.llmApiKey);
        maskedApiKey = maskApiKey(decrypted);
      } catch (error) {
        logger.warn('Failed to decrypt LLM API key', { error });
      }
    }

    return {
      llmProvider: settings.llmProvider ?? 'auto',
      llmModel: settings.llmModel,
      llmApiKeyMasked: maskedApiKey,
      llmBaseUrl: settings.llmBaseUrl,
      llmMaxTokens: settings.llmMaxTokens ?? 4096,
      llmTemperature: settings.llmTemperature ?? 0.7,
    };
  }),

  /**
   * Update LLM configuration for the organization
   */
  updateLlmConfig: adminProcedure
    .input(
      z.object({
        llmProvider: z.string(),
        llmModel: z.string().nullable(),
        llmApiKey: z.string().nullable(),
        llmBaseUrl: z.string().nullable(),
        llmMaxTokens: z.number().min(1).max(128000),
        llmTemperature: z.number().min(0).max(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate provider in managed mode
      if (DEPLOYMENT_MODE === 'managed' && isLocalProvider(input.llmProvider as LLMProviderType)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Local providers are not available in managed mode',
        });
      }

      // Encrypt API key if provided and not a masked value
      let encryptedApiKey: string | null = null;
      if (input.llmApiKey && !input.llmApiKey.includes('•••')) {
        encryptedApiKey = encryptString(input.llmApiKey);
      } else if (input.llmApiKey?.includes('•••')) {
        // Keep existing API key if user didn't change it (sent masked version)
        const existing = await prisma.organizationSettings.findUnique({
          where: { organizationId: ctx.auth.organizationId },
          select: { llmApiKey: true },
        });
        encryptedApiKey = existing?.llmApiKey ?? null;
      }

      await prisma.organizationSettings.upsert({
        where: { organizationId: ctx.auth.organizationId },
        update: {
          llmProvider: input.llmProvider,
          llmModel: input.llmModel,
          llmApiKey: encryptedApiKey,
          llmBaseUrl: input.llmBaseUrl,
          llmMaxTokens: input.llmMaxTokens,
          llmTemperature: input.llmTemperature,
        },
        create: {
          organizationId: ctx.auth.organizationId,
          llmProvider: input.llmProvider,
          llmModel: input.llmModel,
          llmApiKey: encryptedApiKey,
          llmBaseUrl: input.llmBaseUrl,
          llmMaxTokens: input.llmMaxTokens,
          llmTemperature: input.llmTemperature,
        },
      });

      logger.info('Updated LLM settings', {
        organizationId: ctx.auth.organizationId,
        provider: input.llmProvider,
        model: input.llmModel,
      });

      return { success: true };
    }),

  /**
   * Test connection to an LLM provider
   */
  testConnection: adminProcedure
    .input(
      z.object({
        provider: z.string(),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Ollama - native API
        if (input.provider === 'ollama') {
          const provider = new OllamaProvider({
            baseUrl: input.baseUrl,
            model: input.model,
          });
          const available = await provider.isAvailable();
          if (!available) {
            return { success: false, error: 'Could not connect to Ollama' };
          }
          const models = await provider.listModels();
          return { success: true, models };
        }

        // LM Studio or custom - OpenAI-compatible API
        if (input.provider === 'lmstudio' || input.provider === 'custom') {
          const provider = new OpenAICompatibleProvider({
            baseUrl: input.baseUrl || 'http://localhost:1234/v1',
            apiKey: input.apiKey,
            model: input.model,
          });
          const available = await provider.isAvailable();
          if (!available) {
            return { success: false, error: 'Could not connect to endpoint' };
          }
          const models = await provider.listModels();
          return { success: true, models };
        }

        // Cloud providers - test with a simple message
        const client = new LLMClient({
          provider: input.provider as LLMProvider,
          apiKey: input.apiKey,
          model: input.model,
        });

        // Simple test call
        const response = await client.sendMessage({
          system: 'Respond with exactly "OK" and nothing else.',
          messages: [{ role: 'user', content: 'Test' }],
        });

        // Check if we got a valid response
        const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
        if (textBlock && 'text' in textBlock) {
          return { success: true, response: textBlock.text };
        }

        return { success: true, response: 'Connection successful' };
      } catch (error) {
        logger.warn('LLM connection test failed', { provider: input.provider, error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        };
      }
    }),

  /**
   * List available models for a provider
   */
  listModels: adminProcedure
    .input(
      z.object({
        provider: z.string(),
        baseUrl: z.string().optional(),
        apiKey: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      // Ollama - fetch from server
      if (input.provider === 'ollama') {
        const provider = new OllamaProvider({ baseUrl: input.baseUrl });
        return await provider.listModels();
      }

      // LM Studio or custom - fetch from OpenAI-compatible endpoint
      if (input.provider === 'lmstudio' || input.provider === 'custom') {
        const provider = new OpenAICompatibleProvider({
          baseUrl: input.baseUrl || 'http://localhost:1234/v1',
          apiKey: input.apiKey,
        });
        return await provider.listModels();
      }

      // Cloud providers - return default models from registry
      const providerKey = input.provider as keyof typeof LLM_PROVIDERS;
      const provider = LLM_PROVIDERS[providerKey];
      if (provider) {
        return provider.defaultModels.map((m) => m.id);
      }

      return [];
    }),

  /**
   * Get LLM usage summary for a date range
   */
  getUsageSummary: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await getUsageSummary(
        ctx.auth.organizationId,
        new Date(input.startDate),
        new Date(input.endDate),
      );
    }),
});
