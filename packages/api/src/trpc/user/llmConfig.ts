/**
 * User LLM Config Router
 * Handles user's personal LLM configuration per workspace
 */

import { LLMProvider, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { LLM_PROVIDERS } from '../../agent/llm-providers.js';
import { encrypt } from '../../lib/crypto.js';
import { protectedProcedure, router, workspaceMemberProcedure } from '../init.js';

// ============================================================================
// Schemas
// ============================================================================

const workspaceIdInputSchema = z.object({
  workspaceId: z.string().cuid(),
});

const setConfigInputSchema = z.object({
  workspaceId: z.string().cuid(),
  provider: z.nativeEnum(LLMProvider),
  apiKey: z.string().min(1).max(500),
  model: z.string().max(100).optional().nullable(),
});

const setAlwaysAllowToolsInputSchema = z.object({
  workspaceId: z.string().cuid(),
  tools: z.array(z.string()).max(1000),
});

const removeToolFromAlwaysAllowInputSchema = z.object({
  workspaceId: z.string().cuid(),
  toolName: z.string(),
});

const addToolToAlwaysAllowInputSchema = z.object({
  workspaceId: z.string().cuid(),
  toolName: z.string().min(1).max(200),
});

const setSkipToolConfirmationInputSchema = z.object({
  workspaceId: z.string().cuid(),
  skipToolConfirmation: z.boolean(),
});

// ============================================================================
// Router Definition
// ============================================================================

export const userLlmConfigRouter = router({
  /**
   * Get available LLM providers and their models
   */
  getProviders: protectedProcedure.query(() => {
    // Filter to only cloud providers that users can configure (CLAUDE, OPENAI, GEMINI)
    const userProviders = ['claude', 'openai', 'gemini'] as const;

    return userProviders.map((providerId) => {
      const provider = LLM_PROVIDERS[providerId];
      return {
        id: provider.id,
        name: provider.name,
        description: provider.description,
        models: provider.defaultModels.map((m) => ({
          id: m.id,
          name: m.name,
        })),
      };
    });
  }),

  /**
   * Get user's LLM config for a workspace
   */
  get: workspaceMemberProcedure.input(workspaceIdInputSchema).query(async ({ ctx, input }) => {
    const { workspaceId } = input;
    const userId = ctx.auth.user.id;

    const config = await prisma.userLLMConfig.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
    });

    if (!config) {
      return null;
    }

    // Don't return the actual API key, just indicate it's set
    return {
      id: config.id,
      provider: config.provider,
      model: config.model,
      hasApiKey: config.apiKey.length > 0,
      alwaysAllowTools: config.alwaysAllowTools,
      skipToolConfirmation: config.skipToolConfirmation,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }),

  /**
   * Set user's LLM config for a workspace
   */
  set: workspaceMemberProcedure.input(setConfigInputSchema).mutation(async ({ ctx, input }) => {
    const { workspaceId, provider, apiKey, model } = input;
    const userId = ctx.auth.user.id;

    // Encrypt the API key before storing
    const encryptedApiKey = encrypt(apiKey);

    const config = await prisma.userLLMConfig.upsert({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
      create: {
        userId,
        workspaceId,
        provider,
        apiKey: encryptedApiKey,
        model,
      },
      update: {
        provider,
        apiKey: encryptedApiKey,
        model,
      },
    });

    return {
      id: config.id,
      provider: config.provider,
      model: config.model,
      hasApiKey: true,
      alwaysAllowTools: config.alwaysAllowTools,
      skipToolConfirmation: config.skipToolConfirmation,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }),

  /**
   * Remove user's LLM config for a workspace
   */
  remove: workspaceMemberProcedure
    .input(workspaceIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId } = input;
      const userId = ctx.auth.user.id;

      const config = await prisma.userLLMConfig.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'LLM config not found',
        });
      }

      await prisma.userLLMConfig.delete({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      return { success: true };
    }),

  /**
   * Get user's always-allow tools for a workspace
   */
  getAlwaysAllowTools: workspaceMemberProcedure
    .input(workspaceIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;
      const userId = ctx.auth.user.id;

      const config = await prisma.userLLMConfig.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
        select: {
          alwaysAllowTools: true,
          skipToolConfirmation: true,
        },
      });

      return {
        tools: config?.alwaysAllowTools ?? [],
        skipToolConfirmation: config?.skipToolConfirmation ?? false,
      };
    }),

  /**
   * Set user's always-allow tools for a workspace
   */
  setAlwaysAllowTools: workspaceMemberProcedure
    .input(setAlwaysAllowToolsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, tools } = input;
      const userId = ctx.auth.user.id;

      // Deduplicate tools
      const uniqueTools = [...new Set(tools)];

      await prisma.userLLMConfig.upsert({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
        create: {
          userId,
          workspaceId,
          provider: 'CLAUDE',
          apiKey: '',
          alwaysAllowTools: uniqueTools,
        },
        update: {
          alwaysAllowTools: uniqueTools,
        },
      });

      return { tools: uniqueTools };
    }),

  /**
   * Remove a tool from the always-allow list
   */
  removeToolFromAlwaysAllow: workspaceMemberProcedure
    .input(removeToolFromAlwaysAllowInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, toolName } = input;
      const userId = ctx.auth.user.id;

      const config = await prisma.userLLMConfig.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'LLM config not found',
        });
      }

      const updatedTools = config.alwaysAllowTools.filter((t) => t !== toolName);

      await prisma.userLLMConfig.update({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
        data: {
          alwaysAllowTools: updatedTools,
        },
      });

      return { tools: updatedTools };
    }),

  /**
   * Add a tool to the always-allow list
   */
  addToolToAlwaysAllow: workspaceMemberProcedure
    .input(addToolToAlwaysAllowInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, toolName } = input;
      const userId = ctx.auth.user.id;

      const config = await prisma.userLLMConfig.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      // If no config exists, create one with this tool
      if (!config) {
        await prisma.userLLMConfig.create({
          data: {
            userId,
            workspaceId,
            provider: 'CLAUDE',
            apiKey: '',
            alwaysAllowTools: [toolName],
          },
        });
        return { tools: [toolName] };
      }

      // Check if tool already exists
      if (config.alwaysAllowTools.includes(toolName)) {
        return { tools: config.alwaysAllowTools };
      }

      const updatedTools = [...config.alwaysAllowTools, toolName];

      await prisma.userLLMConfig.update({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
        data: {
          alwaysAllowTools: updatedTools,
        },
      });

      return { tools: updatedTools };
    }),

  /**
   * Set skip tool confirmation setting
   */
  setSkipToolConfirmation: workspaceMemberProcedure
    .input(setSkipToolConfirmationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, skipToolConfirmation } = input;
      const userId = ctx.auth.user.id;

      await prisma.userLLMConfig.upsert({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
        create: {
          userId,
          workspaceId,
          provider: 'CLAUDE',
          apiKey: '',
          skipToolConfirmation,
        },
        update: {
          skipToolConfirmation,
        },
      });

      return { skipToolConfirmation };
    }),

  /**
   * Verify the API key is valid by making a test request
   */
  verifyApiKey: workspaceMemberProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        provider: z.nativeEnum(LLMProvider),
        apiKey: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { provider, apiKey } = input;

      try {
        // Simple validation based on provider
        switch (provider) {
          case 'CLAUDE':
            // Anthropic API keys typically start with 'sk-ant-'
            if (!apiKey.startsWith('sk-ant-')) {
              return {
                valid: false,
                error: 'Invalid Anthropic API key format. Keys should start with "sk-ant-"',
              };
            }
            break;

          case 'OPENAI':
            // OpenAI API keys typically start with 'sk-'
            if (!apiKey.startsWith('sk-')) {
              return {
                valid: false,
                error: 'Invalid OpenAI API key format. Keys should start with "sk-"',
              };
            }
            break;

          case 'GEMINI':
            // Google API keys have a specific format
            if (apiKey.length < 20) {
              return {
                valid: false,
                error: 'Invalid Google API key format',
              };
            }
            break;
        }

        // For now, just do format validation
        // A more complete implementation would make a test API call
        return { valid: true };
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Failed to verify API key',
        };
      }
    }),

  /**
   * List all workspaces where user has LLM config
   */
  listConfiguredWorkspaces: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.user.id;

    const configs = await prisma.userLLMConfig.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return configs.map((c) => ({
      workspaceId: c.workspaceId,
      workspaceName: c.workspace.name,
      provider: c.provider,
      model: c.model,
      hasApiKey: c.apiKey.length > 0,
    }));
  }),
});
