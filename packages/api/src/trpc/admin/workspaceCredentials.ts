/**
 * Admin Workspace Credentials Router
 * Allows workspace admins to manage workspace-level API keys and credentials for MCP servers
 */

import { AdminActionType, AdminResourceType, McpAuthType, Prisma, prisma } from '@sentinel/db';
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
 */
function maskCredential(value: string | null | undefined): string | null {
  if (!value || value.length < 4) {
    return null;
  }
  const lastFour = value.slice(-4);
  return `•••${lastFour}`;
}

/**
 * Verify the user has admin access to the workspace
 */
async function verifyWorkspaceAdminAccess(
  organizationId: string,
  workspaceId: string,
  adminWorkspaceIds: string[],
  isOrgOwner: boolean,
): Promise<void> {
  // Org owners can access all workspaces
  if (isOrgOwner) return;

  // Check if user is admin of this workspace
  if (!adminWorkspaceIds.includes(workspaceId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have admin access to this workspace',
    });
  }
}

export const adminWorkspaceCredentialsRouter = router({
  /**
   * List workspace credentials for servers accessible to a workspace
   */
  list: adminProcedure
    .input(z.object({ workspaceId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAdminAccess(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.adminWorkspaceIds,
        ctx.auth.isOrgOwner,
      );

      // Get servers accessible to this workspace (org-wide + workspace-scoped)
      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
        },
        include: {
          workspaceConfigs: {
            where: {
              workspaceId: input.workspaceId,
            },
            select: {
              id: true,
              apiKey: true,
              credentials: true,
            },
          },
          workspaceOAuthTokens: {
            where: {
              workspaceId: input.workspaceId,
            },
            select: {
              id: true,
              authenticatedAt: true,
              connectedByUser: {
                select: { email: true },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return servers.map((server) => {
        const workspaceConfig = server.workspaceConfigs[0];
        const workspaceOAuth = server.workspaceOAuthTokens[0];

        // Get masked API key hint for display
        let workspaceApiKeyHint: string | null = null;
        if (workspaceConfig?.apiKey) {
          try {
            const decryptedKey = decryptString(workspaceConfig.apiKey);
            workspaceApiKeyHint = maskCredential(decryptedKey);
          } catch (error) {
            logger.warn(`Failed to decrypt API key for workspace config ${workspaceConfig.id}`, {
              error,
            });
          }
        }

        return {
          id: server.id,
          name: server.name,
          authType: server.authType,
          hasWorkspaceApiKey: Boolean(workspaceConfig?.apiKey),
          hasWorkspaceCredentials: typeof workspaceConfig?.credentials === 'string',
          hasWorkspaceOAuth: Boolean(workspaceOAuth),
          workspaceOAuthConnectedByEmail: workspaceOAuth?.connectedByUser?.email ?? null,
          workspaceOAuthAuthenticatedAt: workspaceOAuth?.authenticatedAt ?? null,
          updatedAt: server.updatedAt,
          workspaceApiKeyHint,
        };
      });
    }),

  /**
   * Get decrypted workspace credentials for an MCP server
   */
  getCredentials: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        mcpServerId: z.string().cuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAdminAccess(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.adminWorkspaceIds,
        ctx.auth.isOrgOwner,
      );

      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      const config = await prisma.workspaceMcpConfig.findUnique({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: input.workspaceId,
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
   * Update workspace API key
   */
  updateApiKey: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        mcpServerId: z.string().cuid(),
        apiKey: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyWorkspaceAdminAccess(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.adminWorkspaceIds,
        ctx.auth.isOrgOwner,
      );

      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
        },
      });

      if (!server) {
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

      const workspace = await prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { name: true },
      });

      // If clearing API key
      if (input.apiKey === null) {
        const existing = await prisma.workspaceMcpConfig.findUnique({
          where: {
            workspaceId_mcpServerId: {
              workspaceId: input.workspaceId,
              mcpServerId: input.mcpServerId,
            },
          },
        });

        if (existing) {
          await prisma.workspaceMcpConfig.update({
            where: {
              workspaceId_mcpServerId: {
                workspaceId: input.workspaceId,
                mcpServerId: input.mcpServerId,
              },
            },
            data: {
              apiKey: null,
            },
          });

          await logAdminAction({
            organizationId: ctx.auth.organizationId,
            adminUserId: ctx.auth.user.id,
            actionType: AdminActionType.WORKSPACE_API_KEY_REMOVE,
            resourceType: AdminResourceType.WORKSPACE_MCP_CONFIG,
            resourceId: existing.id,
            resourceName: `${server.name} (${workspace?.name ?? 'Workspace'})`,
            actionDetails: {
              actionDisplayName: getActionDisplayName(AdminActionType.WORKSPACE_API_KEY_REMOVE),
              mcpServerId: server.id,
              mcpServerName: server.name,
              workspaceId: input.workspaceId,
              workspaceName: workspace?.name,
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

      const workspaceMcpConfig = await prisma.workspaceMcpConfig.upsert({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: input.workspaceId,
            mcpServerId: input.mcpServerId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          mcpServerId: input.mcpServerId,
          apiKey: encryptedApiKey,
        },
        update: {
          apiKey: encryptedApiKey,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_API_KEY_SET,
        resourceType: AdminResourceType.WORKSPACE_MCP_CONFIG,
        resourceId: workspaceMcpConfig.id,
        resourceName: `${server.name} (${workspace?.name ?? 'Workspace'})`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.WORKSPACE_API_KEY_SET),
          mcpServerId: server.id,
          mcpServerName: server.name,
          workspaceId: input.workspaceId,
          workspaceName: workspace?.name,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Automatically discover tools after successful API key update
      const discovery = await discoverTools(
        ctx.auth.organizationId,
        input.mcpServerId,
        ctx.auth.user.id,
        input.workspaceId,
      );

      return {
        success: true,
        toolsDiscovered: discovery.toolsDiscovered,
        discoveryError: discovery.error,
      };
    }),

  /**
   * Update workspace JSON credentials
   */
  updateCredentials: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        mcpServerId: z.string().cuid(),
        credentials: credentialsSchema.nullable(),
        validationApiKey: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyWorkspaceAdminAccess(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.adminWorkspaceIds,
        ctx.auth.isOrgOwner,
      );

      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { name: true },
      });

      // If clearing credentials
      if (input.credentials === null || Object.keys(input.credentials).length === 0) {
        const existing = await prisma.workspaceMcpConfig.findUnique({
          where: {
            workspaceId_mcpServerId: {
              workspaceId: input.workspaceId,
              mcpServerId: input.mcpServerId,
            },
          },
        });

        if (existing) {
          await prisma.workspaceMcpConfig.update({
            where: {
              workspaceId_mcpServerId: {
                workspaceId: input.workspaceId,
                mcpServerId: input.mcpServerId,
              },
            },
            data: {
              credentials: Prisma.JsonNull,
            },
          });

          await logAdminAction({
            organizationId: ctx.auth.organizationId,
            adminUserId: ctx.auth.user.id,
            actionType: AdminActionType.WORKSPACE_CREDENTIALS_REMOVE,
            resourceType: AdminResourceType.WORKSPACE_MCP_CONFIG,
            resourceId: existing.id,
            resourceName: `${server.name} (${workspace?.name ?? 'Workspace'})`,
            actionDetails: {
              actionDisplayName: getActionDisplayName(AdminActionType.WORKSPACE_CREDENTIALS_REMOVE),
              mcpServerId: server.id,
              mcpServerName: server.name,
              workspaceId: input.workspaceId,
              workspaceName: workspace?.name,
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

      const workspaceMcpConfig = await prisma.workspaceMcpConfig.upsert({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: input.workspaceId,
            mcpServerId: input.mcpServerId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          mcpServerId: input.mcpServerId,
          credentials: encryptedCredentials,
        },
        update: {
          credentials: encryptedCredentials,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WORKSPACE_CREDENTIALS_SET,
        resourceType: AdminResourceType.WORKSPACE_MCP_CONFIG,
        resourceId: workspaceMcpConfig.id,
        resourceName: `${server.name} (${workspace?.name ?? 'Workspace'})`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.WORKSPACE_CREDENTIALS_SET),
          mcpServerId: server.id,
          mcpServerName: server.name,
          workspaceId: input.workspaceId,
          workspaceName: workspace?.name,
          credentialKeys: Object.keys(input.credentials),
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Automatically discover tools after successful credentials update
      const discovery = await discoverTools(
        ctx.auth.organizationId,
        input.mcpServerId,
        ctx.auth.user.id,
        input.workspaceId,
      );

      return {
        success: true,
        toolsDiscovered: discovery.toolsDiscovered,
        discoveryError: discovery.error,
      };
    }),
});
