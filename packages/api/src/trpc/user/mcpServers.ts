/**
 * User MCP Servers Router
 * Handles user MCP server authentication and management
 */

import { AdminActionType, AdminResourceType, McpAuthType, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import type { Context as HonoContext } from 'hono';
import { z } from 'zod';
import {
  decryptCredentials,
  decryptString,
  encryptObject,
  encryptString,
} from '../../lib/crypto.js';
import { isPlainObject } from '../../lib/jsonValue.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import type { AuthContext } from '../../services/auth.js';
import { discoverTools, validateMcpServerUrl } from '../../services/mcp.js';
import {
  getConnectionStatus as getOAuthConnectionStatus,
  initiateOAuthFlow,
  refreshAccessToken,
  revokeAndDisconnect,
} from '../../services/oauth.js';
import { protectedProcedure, router } from '../init.js';

// =============================================================================
// Types
// =============================================================================

interface ProtectedCtx {
  auth: AuthContext;
  req: HonoContext;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Finds an MCP server by ID, scoped to the user's organization and workspaces
 * Throws NOT_FOUND if server doesn't exist, is deleted, or user doesn't have access
 */
async function findMcpServerOrThrow(
  mcpServerId: string,
  organizationId: string,
  workspaceIds: string[],
): Promise<{
  id: string;
  name: string;
  url: string;
  authType: McpAuthType;
  workspaceId: string | null;
}> {
  const server = await prisma.mcpServer.findFirst({
    where: {
      id: mcpServerId,
      organizationId,
      deletedAt: null,
      // Users can only access org-wide servers or servers in their workspaces
      OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
    },
  });

  if (!server) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'MCP server not found',
    });
  }

  return server;
}

/**
 * Validates that the MCP server uses the expected auth type
 */
function requireAuthType(
  server: { authType: McpAuthType },
  expectedType: McpAuthType,
  friendlyName: string,
): void {
  if (server.authType !== expectedType) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `This MCP server does not use ${friendlyName} authentication`,
    });
  }
}

/**
 * Composite key for user MCP config lookups
 */
function userMcpKey(userId: string, mcpServerId: string) {
  return { userId_mcpServerId: { userId, mcpServerId } };
}

/**
 * Logs an admin action with common context from the request
 */
async function logMcpAction(
  ctx: ProtectedCtx,
  actionType: AdminActionType,
  server: { id: string; name: string },
  additionalDetails?: Record<string, unknown>,
): Promise<void> {
  await logAdminAction({
    organizationId: ctx.auth.organizationId,
    adminUserId: ctx.auth.user.id,
    actionType,
    resourceType: AdminResourceType.OAUTH_CLIENT,
    resourceId: server.id,
    resourceName: server.name,
    actionDetails: {
      mcpServerId: server.id,
      serverName: server.name,
      ...additionalDetails,
    },
    ...getRequestMetaFromTrpc(ctx),
  });
}

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

function stripMeta(value: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === '_sentinel') continue;
    stripped[key] = entry;
  }
  return stripped;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!valuesEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return a === b;
}

function findOverrides(
  orgCredentials: Record<string, unknown>,
  userCredentials: Record<string, unknown>,
  prefix: string = '',
): string[] {
  const overrides: string[] = [];
  for (const [key, userValue] of Object.entries(userCredentials)) {
    if (!(key in orgCredentials)) continue;

    const orgValue = orgCredentials[key];
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(orgValue) && isPlainObject(userValue)) {
      overrides.push(...findOverrides(orgValue, userValue, path));
      continue;
    }

    if (!valuesEqual(orgValue, userValue)) {
      overrides.push(path);
    }
  }
  return overrides;
}

function hasAuthFields(credentials: Record<string, unknown>): boolean {
  if (typeof credentials.apiKey === 'string' && credentials.apiKey.trim()) {
    return true;
  }

  if (typeof credentials.accessToken === 'string' && credentials.accessToken.trim()) {
    return true;
  }

  if (isPlainObject(credentials.headers) && Object.keys(credentials.headers).length > 0) {
    return true;
  }

  return false;
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

function buildOrgCredentialsSnapshot(mcpServer: {
  apiKey: string | null;
  credentials: unknown;
}): Record<string, unknown> {
  let orgCredentials: Record<string, unknown> = {};
  if (typeof mcpServer.credentials === 'string') {
    const decrypted = decryptCredentials(mcpServer.credentials);
    if (isPlainObject(decrypted)) {
      orgCredentials = decrypted;
    }
  }

  if (mcpServer.apiKey && orgCredentials.apiKey === undefined) {
    orgCredentials.apiKey = decryptString(mcpServer.apiKey);
  }

  return stripMeta(orgCredentials);
}

export const userMcpServersRouter = router({
  /**
   * List available MCP servers
   * Only returns org-wide servers and servers in workspaces the user belongs to
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const servers = await prisma.mcpServer.findMany({
      where: {
        organizationId: ctx.auth.organizationId,
        deletedAt: null,
        // Users can only see org-wide servers or servers in their workspaces
        OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
      },
      include: {
        userConfigs: {
          where: {
            userId: ctx.auth.user.id,
          },
          select: {
            id: true,
            authenticatedAt: true,
            apiKey: true,
            credentials: true,
            accessToken: true,
          },
        },
        orgOAuthToken: true,
      },
    });

    // Return servers with authentication status
    return servers.map((server) => {
      const userConfig = server.userConfigs[0];
      const hasUserApiKey = Boolean(userConfig?.apiKey);
      const hasUserCredentials = typeof userConfig?.credentials === 'string';
      const hasUserOAuth = Boolean(userConfig?.accessToken);

      const hasOrgApiKey = server.authType === McpAuthType.API_KEY ? Boolean(server.apiKey) : false;
      const hasOrgCredentials = typeof server.credentials === 'string';
      const hasOrgOAuth = Boolean(server.orgOAuthToken);

      // For NONE auth type, no user config is needed - always considered connected
      const isAuthenticated =
        server.authType === McpAuthType.NONE
          ? true
          : hasUserApiKey ||
            hasUserCredentials ||
            hasUserOAuth ||
            hasOrgApiKey ||
            hasOrgCredentials ||
            hasOrgOAuth;

      // Get masked credential hints for display
      let userApiKeyHint: string | null = null;
      let orgApiKeyHint: string | null = null;

      if (userConfig?.apiKey) {
        const decryptedUserKey = decryptString(userConfig.apiKey);
        userApiKeyHint = maskCredential(decryptedUserKey);
      }

      if (server.apiKey) {
        const decryptedOrgKey = decryptString(server.apiKey);
        orgApiKeyHint = maskCredential(decryptedOrgKey);
      }

      return {
        id: server.id,
        name: server.name,
        url: server.url,
        authType: server.authType,
        trusted: server.trusted,
        authenticated: isAuthenticated,
        authenticatedAt:
          userConfig?.authenticatedAt ||
          (hasOrgApiKey || hasOrgCredentials || hasOrgOAuth ? server.updatedAt : null),
        hasUserApiKey,
        hasUserCredentials,
        hasUserOAuth,
        hasOrgApiKey,
        hasOrgCredentials,
        hasOrgOAuth,
        userApiKeyHint,
        orgApiKeyHint,
      };
    });
  }),

  /**
   * Submit API key for authentication
   */
  submitApiKey: protectedProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
        apiKey: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const mcpServer = await findMcpServerOrThrow(
        input.mcpServerId,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );
      requireAuthType(mcpServer, McpAuthType.API_KEY, 'API key');

      const validation = await validateMcpServerUrl(mcpServer.url, mcpServer.authType, {
        apiKey: input.apiKey,
      });

      if (!validation.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.error || 'Failed to validate API key with MCP server',
        });
      }

      const encryptedApiKey = encryptString(input.apiKey);

      const config = await prisma.userMcpConfig.upsert({
        where: userMcpKey(ctx.auth.user.id, input.mcpServerId),
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

      const discovery = await discoverTools(
        ctx.auth.organizationId,
        input.mcpServerId,
        ctx.auth.user.id,
      );

      return {
        success: true,
        authenticatedAt: config.authenticatedAt?.toISOString(),
        toolsDiscovered: discovery.toolsDiscovered,
        discoveryError: discovery.error,
      };
    }),

  /**
   * Submit advanced JSON credentials
   */
  submitCredentials: protectedProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
        credentials: credentialsSchema.nullable(),
        forceOverride: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const mcpServer = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          // Users can only access org-wide servers or servers in their workspaces
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
        select: {
          id: true,
          url: true,
          authType: true,
          apiKey: true,
          credentials: true,
        },
      });

      if (!mcpServer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      const key = userMcpKey(ctx.auth.user.id, input.mcpServerId);

      // Handle clearing credentials
      if (input.credentials === null || Object.keys(input.credentials).length === 0) {
        const existing = await prisma.userMcpConfig.findUnique({
          where: key,
          select: { apiKey: true, authenticatedAt: true },
        });

        if (existing) {
          await prisma.userMcpConfig.update({
            where: key,
            data: {
              credentials: {},
              authenticatedAt: existing.apiKey ? existing.authenticatedAt : null,
            },
          });
        }

        return {
          success: true,
          overrideRequired: false,
          toolsDiscovered: 0,
          discoveryError: undefined,
        };
      }

      const credentials = input.credentials;

      if (mcpServer.authType !== McpAuthType.NONE && !hasAuthFields(credentials)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Credentials must include an API key, access token, or headers for this server',
        });
      }

      const validation = await validateMcpServerUrl(mcpServer.url, mcpServer.authType, credentials);

      if (!validation.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.error || 'Failed to validate credentials with MCP server',
        });
      }

      const orgSnapshot = buildOrgCredentialsSnapshot(mcpServer);
      const conflicts = findOverrides(orgSnapshot, stripMeta(credentials));

      if (conflicts.length > 0 && !input.forceOverride) {
        return {
          success: false,
          overrideRequired: true,
          conflicts,
          toolsDiscovered: 0,
          discoveryError: undefined,
        };
      }

      const encryptedCredentials = encryptObject(credentials);

      const config = await prisma.userMcpConfig.upsert({
        where: key,
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

      // Automatically discover tools after successful credentials submission
      const discovery = await discoverTools(
        ctx.auth.organizationId,
        input.mcpServerId,
        ctx.auth.user.id,
      );

      return {
        success: true,
        overrideRequired: false,
        authenticatedAt: config.authenticatedAt?.toISOString(),
        toolsDiscovered: discovery.toolsDiscovered,
        discoveryError: discovery.error,
      };
    }),

  /**
   * Get decrypted user credentials for editing
   */
  getCredentials: protectedProcedure
    .input(z.object({ mcpServerId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this server's workspace
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
        select: { id: true },
      });

      if (!server) {
        return { credentials: null };
      }

      const config = await prisma.userMcpConfig.findUnique({
        where: userMcpKey(ctx.auth.user.id, input.mcpServerId),
        select: { credentials: true },
      });

      if (!config || typeof config.credentials !== 'string') {
        return { credentials: null };
      }

      return { credentials: decryptCredentials(config.credentials) };
    }),

  // ============================================================================
  // OAuth Authentication
  // ============================================================================

  /**
   * Initiate OAuth flow - returns authorization URL
   */
  initiateOAuth: protectedProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
        returnUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const mcpServer = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          // Users can only access org-wide servers or servers in their workspaces
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
        include: { oauthClientRegistration: true },
      });

      if (!mcpServer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      requireAuthType(mcpServer, McpAuthType.OAUTH, 'OAuth');

      if (!mcpServer.oauthClientRegistration) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'OAuth not configured for this MCP server. Please contact your administrator.',
        });
      }

      try {
        const result = await initiateOAuthFlow(
          ctx.auth.organizationId,
          ctx.auth.user.id,
          input.mcpServerId,
          input.returnUrl,
        );

        await logMcpAction(ctx, AdminActionType.OAUTH_FLOW_INITIATE, mcpServer);

        return { authorizationUrl: result.authorizationUrl };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to initiate OAuth flow',
        });
      }
    }),

  /**
   * Get connection status for an MCP server
   */
  getConnectionStatus: protectedProcedure
    .input(z.object({ mcpServerId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const mcpServer = await findMcpServerOrThrow(
        input.mcpServerId,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );
      const status = await getOAuthConnectionStatus(
        ctx.auth.organizationId,
        ctx.auth.user.id,
        input.mcpServerId,
      );

      return {
        serverName: mcpServer.name,
        authType: mcpServer.authType,
        ...status,
      };
    }),

  refreshOAuthToken: protectedProcedure
    .input(z.object({ mcpServerId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const mcpServer = await findMcpServerOrThrow(
        input.mcpServerId,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );

      try {
        await refreshAccessToken(ctx.auth.organizationId, ctx.auth.user.id, input.mcpServerId);
        await logMcpAction(ctx, AdminActionType.OAUTH_TOKEN_REFRESH, mcpServer);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to refresh token',
        });
      }
    }),

  /**
   * Disconnect from an MCP server
   * For OAuth: revokes tokens at authorization server
   * For API_KEY: clears stored credentials
   */
  disconnect: protectedProcedure
    .input(z.object({ mcpServerId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const mcpServer = await findMcpServerOrThrow(
        input.mcpServerId,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );

      // For OAuth, attempt proper revocation (continue on failure)
      if (mcpServer.authType === McpAuthType.OAUTH) {
        try {
          await revokeAndDisconnect(ctx.auth.organizationId, ctx.auth.user.id, input.mcpServerId);
        } catch {
          // If revocation fails, still clear local credentials
        }
      }

      await prisma.userMcpConfig.deleteMany({
        where: {
          userId: ctx.auth.user.id,
          mcpServerId: input.mcpServerId,
        },
      });

      await logMcpAction(ctx, AdminActionType.OAUTH_DISCONNECT, mcpServer, {
        authType: mcpServer.authType,
      });

      return { success: true };
    }),
});
