/**
 * Admin Personal Credentials Router
 * Allows admins to manage their own personal API keys and credentials
 */

import { AdminActionType, AdminResourceType, McpAuthType, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import {
  decryptCredentials,
  decryptString,
  encryptObject,
  encryptString,
} from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { discoverTools, validateMcpServerUrl } from '../../services/mcp.js';
import { adminProcedure, router } from '../init.js';

/**
 * Schema for credential values - primitives plus nested objects for headers/_sentinel
 * The JSON.stringify check prevents excessively large credential payloads
 */
const primitiveValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const credentialValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([primitiveValueSchema, z.record(z.string(), credentialValueSchema)]),
);

const credentialsSchema = z
  .record(z.string(), credentialValueSchema)
  .refine((val) => !Array.isArray(val), 'Credentials must be a JSON object')
  .refine(
    (val) => JSON.stringify(val).length < 100_000,
    'Credentials payload too large (max 100KB)',
  );

function buildValidationCredentials(
  credentials: Record<string, unknown> | null | undefined,
  apiKey: string | undefined,
): Record<string, unknown> | undefined {
  if (!credentials && !apiKey) {
    return undefined;
  }

  const merged: Record<string, unknown> = credentials ? { ...credentials } : {};
  if (apiKey) {
    merged.apiKey = apiKey;
  }
  return merged;
}

/**
 * Masks a credential string, showing only the last 4 characters
 * Returns null if the input is falsy or too short
 */
function maskCredential(value: string | null | undefined): string | null {
  if (!value || value.length < 4) {
    return null;
  }
  const lastFour = value.slice(-4);
  return `•••${lastFour}`;
}

export const adminPersonalCredentialsRouter = router({
  /**
   * List admin's personal credentials for all MCP servers
   */
  list: adminProcedure.query(async ({ ctx }) => {
    // Build workspace filter - non-org-owners only see org-wide + their workspace servers
    const { isOrgOwner, workspaceIds } = ctx.auth;
    type WorkspaceFilter =
      | Record<string, never>
      | { OR: Array<{ workspaceId: string | null } | { workspaceId: { in: string[] } }> };
    let workspaceFilter: WorkspaceFilter = {};
    if (!isOrgOwner) {
      workspaceFilter = {
        OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
      };
    }

    const servers = await prisma.mcpServer.findMany({
      where: {
        organizationId: ctx.auth.organizationId,
        deletedAt: null,
        ...workspaceFilter,
      },
      include: {
        userConfigs: {
          where: {
            userId: ctx.auth.user.id,
          },
          select: {
            id: true,
            apiKey: true,
            credentials: true,
            authenticatedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return servers.map((server) => {
      const userConfig = server.userConfigs[0];

      // Get masked API key hint for display
      let personalApiKeyHint: string | null = null;
      if (userConfig?.apiKey) {
        try {
          const decryptedKey = decryptString(userConfig.apiKey);
          personalApiKeyHint = maskCredential(decryptedKey);
        } catch (error) {
          // If decryption fails (e.g. invalid format), treat as if we can't show hint
          // We don't want to crash the whole list for one bad key
          logger.warn(`Failed to decrypt API key for user config ${userConfig.id}`, { error });
        }
      }

      return {
        id: server.id,
        name: server.name,
        authType: server.authType,
        hasPersonalApiKey: Boolean(userConfig?.apiKey),
        hasPersonalCredentials: typeof userConfig?.credentials === 'string',
        authenticatedAt: userConfig?.authenticatedAt,
        updatedAt: server.updatedAt,
        personalApiKeyHint,
      };
    });
  }),

  /**
   * Get decrypted personal credentials for an MCP server
   */
  getCredentials: adminProcedure
    .input(z.object({ mcpServerId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      // Validate workspace access for workspace-scoped servers
      if (
        server.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(server.workspaceId)
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: ctx.auth.user.id,
            mcpServerId: input.mcpServerId,
          },
        },
        select: {
          credentials: true,
        },
      });

      if (!config || typeof config.credentials !== 'string') {
        return { credentials: null };
      }

      return {
        credentials: decryptCredentials(config.credentials),
      };
    }),

  /**
   * Update admin's personal API key
   */
  updateApiKey: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
        apiKey: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      // Validate workspace access for workspace-scoped servers
      if (
        server.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(server.workspaceId)
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      if (server.authType !== McpAuthType.API_KEY) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This MCP server does not use API key authentication',
        });
      }

      // If clearing API key
      if (input.apiKey === null) {
        const existing = await prisma.userMcpConfig.findUnique({
          where: {
            userId_mcpServerId: {
              userId: ctx.auth.user.id,
              mcpServerId: input.mcpServerId,
            },
          },
        });

        if (existing) {
          await prisma.userMcpConfig.update({
            where: {
              userId_mcpServerId: {
                userId: ctx.auth.user.id,
                mcpServerId: input.mcpServerId,
              },
            },
            data: {
              apiKey: null,
              authenticatedAt: null,
            },
          });

          // Log admin action for API key removal
          await logAdminAction({
            organizationId: ctx.auth.organizationId,
            adminUserId: ctx.auth.user.id,
            actionType: AdminActionType.PERSONAL_API_KEY_REMOVE,
            resourceType: AdminResourceType.USER_MCP_CONFIG,
            resourceId: existing.id,
            resourceName: `${server.name} (Personal)`,
            actionDetails: {
              actionDisplayName: getActionDisplayName(AdminActionType.PERSONAL_API_KEY_REMOVE),
              mcpServerId: server.id,
              mcpServerName: server.name,
              userId: ctx.auth.user.id,
              userEmail: ctx.auth.user.email,
            },
            ...getRequestMetaFromTrpc(ctx),
          });
        }

        return { success: true, toolsDiscovered: 0, discoveryError: undefined };
      }

      // Validate API key (skip validation in e2e tests with fake URLs)
      const skipValidation = process.env.SKIP_MCP_URL_VALIDATION === 'true';
      if (!skipValidation) {
        const validation = await validateMcpServerUrl(server.url, server.authType, {
          apiKey: input.apiKey,
        });

        if (!validation.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: validation.error || 'Failed to validate API key with MCP server',
          });
        }
      }

      // Encrypt and store API key
      const encryptedApiKey = encryptString(input.apiKey);

      const userMcpConfig = await prisma.userMcpConfig.upsert({
        where: {
          userId_mcpServerId: {
            userId: ctx.auth.user.id,
            mcpServerId: input.mcpServerId,
          },
        },
        create: {
          userId: ctx.auth.user.id,
          mcpServerId: input.mcpServerId,
          apiKey: encryptedApiKey,
          credentials: {},
          authenticatedAt: new Date(),
        },
        update: {
          apiKey: encryptedApiKey,
          authenticatedAt: new Date(),
        },
      });

      // Log admin action for API key set
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.PERSONAL_API_KEY_SET,
        resourceType: AdminResourceType.USER_MCP_CONFIG,
        resourceId: userMcpConfig.id,
        resourceName: `${server.name} (Personal)`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.PERSONAL_API_KEY_SET),
          mcpServerId: server.id,
          mcpServerName: server.name,
          userId: ctx.auth.user.id,
          userEmail: ctx.auth.user.email,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Automatically discover tools after successful API key update
      const discovery = await discoverTools(
        ctx.auth.organizationId,
        input.mcpServerId,
        ctx.auth.user.id,
      );

      return {
        success: true,
        toolsDiscovered: discovery.toolsDiscovered,
        discoveryError: discovery.error,
      };
    }),

  /**
   * Update admin's personal JSON credentials
   */
  updateCredentials: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
        credentials: credentialsSchema.nullable(),
        validationApiKey: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      // Validate workspace access for workspace-scoped servers
      if (
        server.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(server.workspaceId)
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      // If clearing credentials
      if (input.credentials === null || Object.keys(input.credentials).length === 0) {
        const existing = await prisma.userMcpConfig.findUnique({
          where: {
            userId_mcpServerId: {
              userId: ctx.auth.user.id,
              mcpServerId: input.mcpServerId,
            },
          },
        });

        if (existing) {
          await prisma.userMcpConfig.update({
            where: {
              userId_mcpServerId: {
                userId: ctx.auth.user.id,
                mcpServerId: input.mcpServerId,
              },
            },
            data: {
              credentials: {},
              authenticatedAt: existing.apiKey ? existing.authenticatedAt : null,
            },
          });

          // Log admin action for credentials removal
          await logAdminAction({
            organizationId: ctx.auth.organizationId,
            adminUserId: ctx.auth.user.id,
            actionType: AdminActionType.PERSONAL_CREDENTIALS_REMOVE,
            resourceType: AdminResourceType.USER_MCP_CONFIG,
            resourceId: existing.id,
            resourceName: `${server.name} (Personal)`,
            actionDetails: {
              actionDisplayName: getActionDisplayName(AdminActionType.PERSONAL_CREDENTIALS_REMOVE),
              mcpServerId: server.id,
              mcpServerName: server.name,
              userId: ctx.auth.user.id,
              userEmail: ctx.auth.user.email,
            },
            ...getRequestMetaFromTrpc(ctx),
          });
        }

        return { success: true, toolsDiscovered: 0, discoveryError: undefined };
      }

      // Validate credentials (skip validation in e2e tests with fake URLs)
      const validationApiKey = input.validationApiKey ?? undefined;
      const validationCredentials = buildValidationCredentials(input.credentials, validationApiKey);
      const skipCredentialValidation = process.env.SKIP_MCP_URL_VALIDATION === 'true';

      if (validationCredentials && !skipCredentialValidation) {
        const validation = await validateMcpServerUrl(
          server.url,
          server.authType,
          validationCredentials,
        );

        if (!validation.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: validation.error || 'Failed to validate credentials with MCP server',
          });
        }
      }

      // Encrypt and store credentials
      const encryptedCredentials = encryptObject(input.credentials);

      const userMcpConfig = await prisma.userMcpConfig.upsert({
        where: {
          userId_mcpServerId: {
            userId: ctx.auth.user.id,
            mcpServerId: input.mcpServerId,
          },
        },
        create: {
          userId: ctx.auth.user.id,
          mcpServerId: input.mcpServerId,
          credentials: encryptedCredentials,
          authenticatedAt: new Date(),
        },
        update: {
          credentials: encryptedCredentials,
          authenticatedAt: new Date(),
        },
      });

      // Log admin action for credentials set
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.PERSONAL_CREDENTIALS_SET,
        resourceType: AdminResourceType.USER_MCP_CONFIG,
        resourceId: userMcpConfig.id,
        resourceName: `${server.name} (Personal)`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.PERSONAL_CREDENTIALS_SET),
          mcpServerId: server.id,
          mcpServerName: server.name,
          userId: ctx.auth.user.id,
          userEmail: ctx.auth.user.email,
          credentialKeys: Object.keys(input.credentials),
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Automatically discover tools after successful credentials update
      const discovery = await discoverTools(
        ctx.auth.organizationId,
        input.mcpServerId,
        ctx.auth.user.id,
      );

      return {
        success: true,
        toolsDiscovered: discovery.toolsDiscovered,
        discoveryError: discovery.error,
      };
    }),
});
