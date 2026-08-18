/**
 * Admin MCP Servers Router
 * Handles MCP server management operations
 */

import {
  AdminActionType,
  AdminResourceType,
  McpAuthType,
  PolicyEffect,
  Prisma,
  SensitiveFlagBehavior,
  TransportType,
  prisma,
  type Agent,
} from '@sentinel/db';
import { checkToolPattern } from '@sentinel/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  decryptCredentials,
  decryptString,
  encryptObject,
  encryptString,
} from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { analyzeMcpServerDeletion } from '../../services/deletionImpact.js';
import {
  SENTINEL_SELF_MCP_SERVER_ERROR,
  discoverTools,
  isSentinelMcpServerUrl,
  probeAuthType,
  validateMcpServerConnection,
  validateTransportConfig,
  type TransportConfigInput,
} from '../../services/mcp.js';
import {
  getOAuthRedirectUri,
  registerOAuthClient,
  storeOAuthClientRegistration,
} from '../../services/oauth.js';
import { discoverOAuthCapability } from '../../services/oauthDiscovery.js';
import { evaluatePolicy } from '../../services/policy.js';
import type { UserWithRoles } from '../../types/role.js';
import { adminProcedure, router } from '../init.js';

// =============================================================================
// Types
// =============================================================================

interface McpServerSnapshot {
  id: string;
  name: string;
  url: string;
  authType: string;
  trusted: boolean;
  organizationId: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  [key: string]: string | boolean | null | undefined;
}

export interface SanitizedServer {
  hasApiKey: boolean;
  hasCredentials: boolean;
  hasStdioEnv: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

type FindServerOptions =
  | { include: Prisma.McpServerInclude; select?: never }
  | { select: Prisma.McpServerSelect; include?: never }
  | Record<string, never>;

type FindServerResult<T extends FindServerOptions> = T extends {
  include: infer TInclude extends Prisma.McpServerInclude;
}
  ? Prisma.McpServerGetPayload<{ include: TInclude }>
  : T extends { select: infer TSelect extends Prisma.McpServerSelect }
    ? Prisma.McpServerGetPayload<{ select: TSelect }>
    : Prisma.McpServerGetPayload<Record<string, never>>;

/**
 * Finds an MCP server by ID, ensuring it belongs to the given organization
 * and optionally validating workspace access.
 * Throws NOT_FOUND if the server doesn't exist, belongs to a different org,
 * or if workspace access is denied.
 */
async function findServerOrThrow<T extends FindServerOptions = Record<string, never>>(
  organizationId: string,
  serverId: string,
  options?: T,
  workspaceAccess?: {
    workspaceIds: string[];
    isOrgOwner: boolean;
  },
): Promise<FindServerResult<T>> {
  const server = await prisma.mcpServer.findFirst({
    ...options,
    where: {
      id: serverId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!server) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'MCP server not found',
    });
  }

  // Validate workspace access if workspaceAccess context is provided
  if (workspaceAccess) {
    const serverWorkspaceId = (server as { workspaceId?: string | null }).workspaceId;
    if (serverWorkspaceId && !workspaceAccess.isOrgOwner) {
      if (!workspaceAccess.workspaceIds.includes(serverWorkspaceId)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }
    }
  }

  return server as FindServerResult<T>;
}

/**
 * Creates a snapshot object for audit logging from an MCP server.
 */
function createServerSnapshot(
  server: {
    id: string;
    name: string;
    url: string;
    authType: McpAuthType;
    trusted: boolean;
    organizationId: string;
    deletedAt?: Date | null;
    deletedBy?: string | null;
  },
  includeDeleted = false,
): McpServerSnapshot {
  const snapshot: McpServerSnapshot = {
    id: server.id,
    name: server.name,
    url: server.url,
    authType: server.authType,
    trusted: server.trusted,
    organizationId: server.organizationId,
  };

  if (includeDeleted) {
    snapshot.deletedAt = server.deletedAt?.toISOString() ?? null;
    snapshot.deletedBy = server.deletedBy;
  }

  return snapshot;
}

/**
 * Removes sensitive fields from a server object and adds credential status flags.
 */
function sanitizeServer<
  T extends { apiKey?: string | null; credentials?: unknown; stdioEnv?: string | null },
>(
  server: T,
): Omit<T, 'apiKey' | 'credentials' | 'stdioEnv'> & {
  hasApiKey: boolean;
  hasCredentials: boolean;
  hasStdioEnv: boolean;
} {
  const { apiKey: _apiKey, credentials: _credentials, stdioEnv: _stdioEnv, ...rest } = server;
  return {
    ...rest,
    hasApiKey: Boolean(server.apiKey),
    hasCredentials: typeof server.credentials === 'string',
    hasStdioEnv: Boolean(server.stdioEnv),
  };
}

/**
 * Maps a detected auth type string to the McpAuthType enum.
 */
function mapDetectedAuthType(detected: string): McpAuthType {
  switch (detected) {
    case 'oauth':
      return McpAuthType.OAUTH;
    case 'api_key':
      return McpAuthType.API_KEY;
    case 'none':
    default:
      return McpAuthType.NONE;
  }
}

/**
 * Validates API key is only set for API_KEY auth type.
 */
function validateApiKeyAuthType(apiKey: string | undefined, authType: McpAuthType): void {
  if (apiKey && authType !== McpAuthType.API_KEY) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'API keys can only be set for API_KEY authentication',
    });
  }
}

/**
 * Validates that a URL is not the Sentinel MCP server URL.
 */
function validateNotSentinelUrl(url: string): void {
  if (isSentinelMcpServerUrl(url)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: SENTINEL_SELF_MCP_SERVER_ERROR,
    });
  }
}

/**
 * Gets the server key (hostname:port or hostname) from a URL.
 */
function getServerKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url;
  }
}

async function syncUntrustedServerPolicies(
  organizationId: string,
  serverUrl: string,
  trusted: boolean,
): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    return;
  }

  const port = parsedUrl.port ? `:${parsedUrl.port}` : '';
  const toolPattern = `${parsedUrl.hostname}${port}::*`;

  const policies = await prisma.policy.findMany({
    where: {
      organizationId,
      matchers: { has: '*' },
      toolPatterns: { has: toolPattern },
      effect: PolicyEffect.DENY,
      description: {
        contains: 'untrusted',
        mode: 'insensitive',
      },
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (policies.length === 0) {
    return;
  }

  await prisma.policy.updateMany({
    where: {
      id: {
        in: policies.map((policy) => policy.id),
      },
    },
    data: {
      enabled: !trusted,
    },
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

// =============================================================================
// Transport Configuration Schemas
// =============================================================================

const transportTypeSchema = z.nativeEnum(TransportType);

const stdioConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  workingDir: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const websocketConfigSchema = z.object({
  reconnectMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().positive().optional(),
  heartbeatMs: z.number().int().positive().optional(),
});

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

function normalizeCredentialsForStorage(
  credentials: Record<string, unknown> | null | undefined,
): string | null | undefined {
  if (credentials === undefined) {
    return undefined;
  }

  if (!credentials || Object.keys(credentials).length === 0) {
    return null;
  }

  return encryptObject(credentials);
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

export const adminMcpServersRouter = router({
  /**
   * List all MCP servers
   * Org owners see all, others see org-wide + their workspace servers
   */
  list: adminProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean().optional(),
          workspaceId: z.string().cuid().optional(), // Filter to specific workspace
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { isOrgOwner, workspaceIds } = ctx.auth;

      // Build workspace filter
      type WorkspaceFilter =
        | { workspaceId?: string | null }
        | { OR: Array<{ workspaceId: string | null } | { workspaceId: { in: string[] } }> };
      let workspaceFilter: WorkspaceFilter = {};
      if (input?.workspaceId) {
        // Show workspace servers AND org-wide (inherited) servers
        workspaceFilter = { OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }] };
      } else if (!isOrgOwner) {
        // Non-owners see org-wide + their workspace servers
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
        };
      }
      // Org owners see all (no workspace filter)

      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDeleted ? {} : { deletedAt: null }),
          ...workspaceFilter,
        },
        include: {
          tools: true,
          _count: {
            select: {
              tools: true,
            },
          },
          orgOAuthToken: {
            include: {
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
        const {
          apiKey: _apiKey,
          credentials: _credentials,
          stdioEnv: _stdioEnv,
          orgOAuthToken,
          ...sanitized
        } = server;

        // Get masked API key hint for display
        let apiKeyHint: string | null = null;
        if (server.apiKey) {
          const decryptedKey = decryptString(server.apiKey);
          apiKeyHint = maskCredential(decryptedKey);
        }

        return {
          ...sanitized,
          hasApiKey: Boolean(server.apiKey),
          hasCredentials: typeof server.credentials === 'string',
          hasStdioEnv: Boolean(server.stdioEnv),
          apiKeyHint,
          // Org-level OAuth status
          hasOrgOAuth: Boolean(orgOAuthToken),
          orgOAuthConnectedByEmail: orgOAuthToken?.connectedByUser?.email ?? null,
          orgOAuthAuthenticatedAt: orgOAuthToken?.authenticatedAt ?? null,
          // Classification status
          classificationStatus: server.classificationStatus,
          classificationStartedAt: server.classificationStartedAt,
          classificationError: server.classificationError,
        };
      });
    }),

  /**
   * Get a specific MCP server
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const server = await findServerOrThrow(
      ctx.auth.organizationId,
      input.id,
      { include: { tools: true } },
      { workspaceIds: ctx.auth.workspaceIds, isOrgOwner: ctx.auth.isOrgOwner },
    );

    return sanitizeServer(server);
  }),

  /**
   * Get decrypted organization credentials for an MCP server
   */
  getCredentials: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const server = await findServerOrThrow(
        ctx.auth.organizationId,
        input.id,
        { select: { credentials: true, workspaceId: true } },
        { workspaceIds: ctx.auth.workspaceIds, isOrgOwner: ctx.auth.isOrgOwner },
      );

      if (!server.credentials || typeof server.credentials !== 'string') {
        return { credentials: null };
      }

      return { credentials: decryptCredentials(server.credentials) };
    }),

  /**
   * Get STDIO transport configuration for an MCP server
   * Returns decrypted environment variables for admins
   */
  getStdioConfig: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const server = await findServerOrThrow(
        ctx.auth.organizationId,
        input.id,
        {
          select: {
            transportType: true,
            stdioCommand: true,
            stdioArgs: true,
            stdioWorkingDir: true,
            stdioEnv: true,
            workspaceId: true,
          },
        },
        { workspaceIds: ctx.auth.workspaceIds, isOrgOwner: ctx.auth.isOrgOwner },
      );

      if (server.transportType !== TransportType.STDIO) {
        return { configured: false };
      }

      let env: Record<string, string> | null = null;
      if (server.stdioEnv) {
        const decrypted = decryptString(server.stdioEnv);
        env = JSON.parse(decrypted);
      }

      return {
        configured: true,
        command: server.stdioCommand,
        args: server.stdioArgs,
        workingDir: server.stdioWorkingDir,
        env,
      };
    }),

  /**
   * Probe an MCP server URL to detect its authentication requirements
   * This is a best-effort detection that checks for OAuth metadata
   * and analyzes connection errors to infer the auth type.
   *
   * Note: This is a read-only probe operation and is not audit logged.
   */
  probeAuthType: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      validateNotSentinelUrl(input.url);

      const result = await probeAuthType(input.url);

      if (result.detectedAuthType === 'unknown') {
        return { ...result, suggestedAuthType: null, detectionFailed: true };
      }

      return {
        ...result,
        suggestedAuthType: mapDetectedAuthType(result.detectedAuthType),
        detectionFailed: false,
      };
    }),

  /**
   * Create a new MCP server
   * Validates that the URL is a working MCP server before creating.
   *
   * If authType is not provided, the server will be probed to auto-detect
   * the auth type. The detected type defaults to NONE if detection fails.
   */
  create: adminProcedure
    .input(
      z
        .object({
          name: z.string(),
          url: z.string().url(),
          // authType is now optional - will be auto-detected if not provided
          authType: z.nativeEnum(McpAuthType).optional(),
          trusted: z.boolean().optional(),
          apiKey: z.string().min(1).optional(),
          credentials: credentialsSchema.optional(),
          // Optional credentials for validation (only used for API_KEY auth)
          validationApiKey: z.string().optional(),
          // Transport configuration
          transportType: transportTypeSchema.optional(),
          stdio: stdioConfigSchema.optional(),
          websocket: websocketConfigSchema.optional(),
          // Workspace scoping (null = org-wide)
          workspaceId: z.string().cuid().optional(),
        })
        .refine(
          (data) => {
            if (data.transportType === TransportType.STDIO && !data.stdio?.command) {
              return false;
            }
            return true;
          },
          { message: 'STDIO transport requires command' },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      validateNotSentinelUrl(input.url);

      // Check for duplicate URL in active servers
      const existingActive = await prisma.mcpServer.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          url: input.url,
          deletedAt: null,
        },
      });

      if (existingActive) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `An MCP server with this URL already exists: "${existingActive.name}"`,
        });
      }

      // Determine auth type - auto-detect if not provided
      let effectiveAuthType = input.authType;
      let authProbeResult: Awaited<ReturnType<typeof probeAuthType>> | undefined;

      if (!effectiveAuthType) {
        authProbeResult = await probeAuthType(input.url);
        effectiveAuthType = mapDetectedAuthType(authProbeResult.detectedAuthType);
      }

      validateApiKeyAuthType(input.apiKey, effectiveAuthType);

      // Validate transport configuration
      const effectiveTransportType = input.transportType ?? TransportType.HTTP;
      const transportConfig: TransportConfigInput = {
        transportType: effectiveTransportType,
        stdioCommand: input.stdio?.command,
        stdioArgs: input.stdio?.args,
        stdioWorkingDir: input.stdio?.workingDir,
        stdioEnv: input.stdio?.env,
        wsReconnectMs: input.websocket?.reconnectMs,
        wsMaxRetries: input.websocket?.maxRetries,
        wsHeartbeatMs: input.websocket?.heartbeatMs,
      };

      const transportValidation = validateTransportConfig(effectiveTransportType, transportConfig);
      if (!transportValidation.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: transportValidation.error || 'Invalid transport configuration',
        });
      }

      // Validate that the URL is a working MCP server
      // - NONE: Always validate (should be accessible without auth)
      // - API_KEY: Only validate if validation key provided
      // - OAUTH: Skip validation (requires OAuth flow first, can't validate without token)
      // - E2E: Skip validation when SKIP_MCP_URL_VALIDATION is set (for e2e tests with fake URLs)
      const validationApiKey = input.validationApiKey ?? input.apiKey;
      const trimmedValidationApiKey = validationApiKey?.trim();
      const skipValidation = process.env.SKIP_MCP_URL_VALIDATION === 'true';
      const shouldValidate =
        !skipValidation &&
        (effectiveAuthType === McpAuthType.NONE ||
          (effectiveAuthType === McpAuthType.API_KEY && Boolean(trimmedValidationApiKey)));

      if (shouldValidate) {
        const validationCredentials = buildValidationCredentials(
          input.credentials,
          trimmedValidationApiKey,
        );
        const validation = await validateMcpServerConnection(
          input.url,
          effectiveAuthType,
          effectiveTransportType,
          transportConfig,
          validationCredentials,
        );

        if (!validation.success) {
          // If validation failed with an auth error and we auto-detected,
          // provide a more helpful message
          if (validation.isAuthError && authProbeResult) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `${validation.error} (Auth type was auto-detected as ${effectiveAuthType}. You may need to specify a different auth type manually.)`,
            });
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: validation.error || 'Failed to validate MCP server URL',
          });
        }
      }

      const encryptedCredentials = normalizeCredentialsForStorage(input.credentials);

      // Encrypt STDIO environment variables if provided
      const encryptedStdioEnv =
        input.stdio?.env && Object.keys(input.stdio.env).length > 0
          ? encryptString(JSON.stringify(input.stdio.env))
          : null;

      // Verify workspace access if workspaceId is provided
      if (input.workspaceId) {
        // Org owners can create in any workspace, workspace admins can create in their workspaces
        if (!ctx.auth.isOrgOwner && !ctx.auth.adminWorkspaceIds.includes(input.workspaceId)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to create servers in this workspace',
          });
        }

        // Verify workspace exists
        const workspace = await prisma.workspace.findFirst({
          where: {
            id: input.workspaceId,
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
        });

        if (!workspace) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Workspace not found',
          });
        }
      }

      const server = await prisma.mcpServer.create({
        data: {
          organizationId: ctx.auth.organizationId,
          name: input.name,
          url: input.url,
          authType: effectiveAuthType,
          apiKey:
            effectiveAuthType === McpAuthType.API_KEY && input.apiKey
              ? encryptString(input.apiKey)
              : null,
          credentials: encryptedCredentials ?? Prisma.DbNull,
          trusted: input.trusted ?? false,
          // Transport configuration
          transportType: input.transportType ?? TransportType.HTTP,
          // STDIO transport config
          stdioCommand: input.stdio?.command ?? null,
          stdioArgs: input.stdio?.args ?? Prisma.DbNull,
          stdioWorkingDir: input.stdio?.workingDir ?? null,
          stdioEnv: encryptedStdioEnv,
          // WebSocket transport config
          wsReconnectMs: input.websocket?.reconnectMs ?? null,
          wsMaxRetries: input.websocket?.maxRetries ?? null,
          wsHeartbeatMs: input.websocket?.heartbeatMs ?? null,
          // Workspace scoping
          workspaceId: input.workspaceId ?? null,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_CREATE,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: server.id,
        resourceName: server.name,
        actionDetails: {
          name: server.name,
          url: server.url,
          authType: server.authType,
          trusted: server.trusted,
          transportType: server.transportType,
          authTypeAutoDetected: Boolean(authProbeResult),
          ...(authProbeResult && {
            detectedAuthType: authProbeResult.detectedAuthType,
            detectionConfidence: authProbeResult.confidence,
            detectionReason: authProbeResult.reason,
          }),
        },
        afterSnapshot: createServerSnapshot(server),
        ...getRequestMetaFromTrpc(ctx),
      });

      await syncUntrustedServerPolicies(ctx.auth.organizationId, server.url, server.trusted);

      // For OAuth servers, automatically discover and register OAuth client
      let oauthConfigured = false;
      let oauthError: string | undefined;
      if (effectiveAuthType === McpAuthType.OAUTH) {
        logger.info('Starting OAuth discovery for new MCP server', {
          serverUrl: server.url,
          serverId: server.id,
        });
        try {
          const discovery = await discoverOAuthCapability(server.url);
          logger.info('OAuth discovery result', { discovery });

          if (
            discovery.supportsOAuth &&
            discovery.authorizationEndpoint &&
            discovery.tokenEndpoint
          ) {
            if (discovery.registrationEndpoint) {
              // Server supports DCR - automatically register
              const org = await prisma.organization.findUnique({
                where: { id: ctx.auth.organizationId },
              });

              const redirectUri = getOAuthRedirectUri();

              try {
                const clientCredentials = await registerOAuthClient(
                  discovery.registrationEndpoint,
                  org?.name || 'SENTINEL Organization',
                  redirectUri,
                );

                await storeOAuthClientRegistration(
                  ctx.auth.organizationId,
                  server.id,
                  clientCredentials.clientId,
                  clientCredentials.clientSecret,
                  discovery.authorizationEndpoint,
                  discovery.tokenEndpoint,
                  discovery.registrationEndpoint,
                  discovery.revocationEndpoint || null,
                  discovery.scopesSupported || [],
                  discovery.grantTypesSupported || ['authorization_code', 'refresh_token'],
                  redirectUri,
                );

                logger.success('OAuth client registered and stored successfully', {
                  serverId: server.id,
                  clientId: clientCredentials.clientId,
                });
                oauthConfigured = true;
              } catch (dcrError) {
                // DCR failed - admin will need to configure manually
                logger.error('OAuth DCR failed', { serverId: server.id, error: dcrError });
                oauthError = `DCR failed: ${dcrError instanceof Error ? dcrError.message : 'Unknown error'}. Manual OAuth configuration required.`;
              }
            } else {
              // Server supports OAuth but not DCR - store discovery results for manual config
              oauthError =
                'Server supports OAuth but not Dynamic Client Registration. Please configure OAuth credentials manually using the setOAuthConfig endpoint.';
            }
          } else {
            oauthError =
              discovery.error ||
              'OAuth discovery failed. Please configure OAuth credentials manually.';
          }
        } catch (discoveryError) {
          oauthError = `OAuth discovery error: ${discoveryError instanceof Error ? discoveryError.message : 'Unknown error'}`;
        }
      }

      // Discover tools for non-OAuth servers (OAuth requires auth flow first)
      let toolsDiscovered = 0;
      if (
        effectiveAuthType === McpAuthType.NONE ||
        (effectiveAuthType === McpAuthType.API_KEY && input.apiKey)
      ) {
        try {
          const discoveryResult = await discoverTools(
            ctx.auth.organizationId,
            server.id,
            ctx.auth.user.id,
          );
          if (discoveryResult.success) {
            toolsDiscovered = discoveryResult.toolsDiscovered;
            logger.info('Tools discovered for new MCP server', {
              serverId: server.id,
              toolCount: toolsDiscovered,
            });
          } else {
            logger.warn('Tool discovery failed for new MCP server', {
              serverId: server.id,
              error: discoveryResult.error,
            });
          }
        } catch (error) {
          logger.error('Error discovering tools for new MCP server', {
            serverId: server.id,
            error,
          });
        }
      }

      return {
        ...sanitizeServer(server),
        oauthConfigured,
        oauthError,
        toolsDiscovered,
        authDetection: authProbeResult
          ? {
              wasAutoDetected: true,
              detectedType: authProbeResult.detectedAuthType,
              confidence: authProbeResult.confidence,
              reason: authProbeResult.reason,
            }
          : undefined,
      };
    }),

  /**
   * Update an MCP server
   * Validates URL if it's being changed
   */
  update: adminProcedure
    .input(
      z
        .object({
          id: z.string().cuid(),
          name: z.string().optional(),
          url: z.string().url().optional(),
          authType: z.nativeEnum(McpAuthType).optional(),
          trusted: z.boolean().optional(),
          apiKey: z.string().min(1).nullable().optional(),
          credentials: credentialsSchema.nullable().optional(),
          validationApiKey: z.string().optional(),
          // Transport configuration
          transportType: transportTypeSchema.optional(),
          stdio: stdioConfigSchema.nullable().optional(),
          websocket: websocketConfigSchema.nullable().optional(),
        })
        .refine(
          (data) => {
            if (data.transportType === TransportType.STDIO && data.stdio === null) {
              return false;
            }
            if (
              data.transportType === TransportType.STDIO &&
              data.stdio !== undefined &&
              !data.stdio?.command
            ) {
              return false;
            }
            return true;
          },
          { message: 'STDIO transport requires command' },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await findServerOrThrow(ctx.auth.organizationId, input.id, undefined, {
        workspaceIds: ctx.auth.workspaceIds,
        isOrgOwner: ctx.auth.isOrgOwner,
      });

      const effectiveAuthType = input.authType ?? server.authType;
      validateApiKeyAuthType(input.apiKey ?? undefined, effectiveAuthType);

      if (input.url) {
        validateNotSentinelUrl(input.url);
      }

      // Validate transport configuration if changed
      const effectiveTransportType = input.transportType ?? server.transportType;
      const transportConfig: TransportConfigInput = {
        transportType: effectiveTransportType,
        stdioCommand: input.stdio?.command ?? server.stdioCommand ?? undefined,
        stdioArgs:
          input.stdio?.args ??
          (Array.isArray(server.stdioArgs) ? (server.stdioArgs as string[]) : undefined),
        stdioWorkingDir: input.stdio?.workingDir ?? server.stdioWorkingDir ?? undefined,
        stdioEnv: input.stdio?.env,
        wsReconnectMs: input.websocket?.reconnectMs ?? server.wsReconnectMs ?? undefined,
        wsMaxRetries: input.websocket?.maxRetries ?? server.wsMaxRetries ?? undefined,
        wsHeartbeatMs: input.websocket?.heartbeatMs ?? server.wsHeartbeatMs ?? undefined,
      };

      // Validate transport config if transport settings are being changed
      const transportChanged =
        input.transportType !== undefined ||
        input.stdio !== undefined ||
        input.websocket !== undefined;

      if (transportChanged) {
        const transportValidation = validateTransportConfig(
          effectiveTransportType,
          transportConfig,
        );
        if (!transportValidation.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: transportValidation.error || 'Invalid transport configuration',
          });
        }
      }

      const apiKeyProvided = input.apiKey !== undefined && input.apiKey !== null;
      const credentialsProvided = input.credentials !== undefined && input.credentials !== null;
      const shouldValidate =
        Boolean(input.url && input.url !== server.url) ||
        Boolean(input.authType && input.authType !== server.authType) ||
        apiKeyProvided ||
        credentialsProvided ||
        transportChanged;

      if (shouldValidate) {
        const validationUrl = input.url ?? server.url;
        const validationApiKey = input.validationApiKey ?? input.apiKey ?? undefined;
        const trimmedValidationApiKey = validationApiKey?.trim();
        // Skip validation for OAUTH servers (requires OAuth flow, can't validate without token)
        // Skip validation when SKIP_MCP_URL_VALIDATION is set (for e2e tests with fake URLs)
        const skipValidation = process.env.SKIP_MCP_URL_VALIDATION === 'true';
        const canValidate =
          !skipValidation &&
          (effectiveAuthType === McpAuthType.NONE ||
            (effectiveAuthType === McpAuthType.API_KEY && Boolean(trimmedValidationApiKey)));

        if (canValidate) {
          const validationCredentials = buildValidationCredentials(
            input.credentials ?? undefined,
            trimmedValidationApiKey,
          );
          const validation = await validateMcpServerConnection(
            validationUrl,
            effectiveAuthType,
            effectiveTransportType,
            transportConfig,
            validationCredentials,
          );

          if (!validation.success) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: validation.error || 'Failed to validate MCP server connection',
            });
          }
        }
      }

      const beforeSnapshot = createServerSnapshot(server);

      let apiKeyUpdate: string | null | undefined;
      let credentialsUpdate: string | null | undefined;
      if (input.apiKey !== undefined) {
        apiKeyUpdate = input.apiKey ? encryptString(input.apiKey) : null;
      } else if (input.authType && input.authType !== McpAuthType.API_KEY) {
        apiKeyUpdate = null;
      }
      if (input.credentials !== undefined) {
        credentialsUpdate = normalizeCredentialsForStorage(input.credentials);
      }

      // Handle STDIO env encryption
      let stdioEnvUpdate: string | null | undefined;
      if (input.stdio !== undefined) {
        if (input.stdio === null || !input.stdio.env || Object.keys(input.stdio.env).length === 0) {
          stdioEnvUpdate = null;
        } else {
          stdioEnvUpdate = encryptString(JSON.stringify(input.stdio.env));
        }
      }

      // Build transport configuration updates
      const transportUpdates: Prisma.McpServerUpdateInput = {};
      if (input.transportType !== undefined) {
        transportUpdates.transportType = input.transportType;
      }
      if (input.stdio !== undefined) {
        if (input.stdio === null) {
          transportUpdates.stdioCommand = null;
          transportUpdates.stdioArgs = Prisma.DbNull;
          transportUpdates.stdioWorkingDir = null;
          transportUpdates.stdioEnv = null;
        } else {
          transportUpdates.stdioCommand = input.stdio.command;
          transportUpdates.stdioArgs = input.stdio.args ?? Prisma.DbNull;
          transportUpdates.stdioWorkingDir = input.stdio.workingDir ?? null;
          transportUpdates.stdioEnv = stdioEnvUpdate ?? null;
        }
      }
      if (input.websocket !== undefined) {
        if (input.websocket === null) {
          transportUpdates.wsReconnectMs = null;
          transportUpdates.wsMaxRetries = null;
          transportUpdates.wsHeartbeatMs = null;
        } else {
          if (input.websocket.reconnectMs !== undefined) {
            transportUpdates.wsReconnectMs = input.websocket.reconnectMs;
          }
          if (input.websocket.maxRetries !== undefined) {
            transportUpdates.wsMaxRetries = input.websocket.maxRetries;
          }
          if (input.websocket.heartbeatMs !== undefined) {
            transportUpdates.wsHeartbeatMs = input.websocket.heartbeatMs;
          }
        }
      }

      const updated = await prisma.mcpServer.update({
        where: { id: input.id },
        data: {
          name: input.name,
          url: input.url,
          authType: input.authType,
          apiKey: apiKeyUpdate,
          credentials: credentialsUpdate === null ? Prisma.DbNull : credentialsUpdate,
          trusted: input.trusted,
          ...transportUpdates,
        },
      });

      // Determine the action type based on API key changes
      let actionType: AdminActionType = AdminActionType.MCP_SERVER_UPDATE;
      const hadOrgApiKey = Boolean(server.apiKey);
      const hasOrgApiKey = Boolean(updated.apiKey);

      if (input.apiKey !== undefined) {
        // API key was explicitly changed
        if (!hadOrgApiKey && hasOrgApiKey) {
          actionType = AdminActionType.MCP_SERVER_ORG_API_KEY_ADD;
        } else if (hadOrgApiKey && hasOrgApiKey) {
          actionType = AdminActionType.MCP_SERVER_ORG_API_KEY_UPDATE;
        } else if (hadOrgApiKey && !hasOrgApiKey) {
          actionType = AdminActionType.MCP_SERVER_ORG_API_KEY_REMOVE;
        }
      }

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: updated.id,
        resourceName: updated.name,
        actionDetails: {
          previousName: server.name,
          newName: updated.name,
          previousUrl: server.url,
          newUrl: updated.url,
          previousAuthType: server.authType,
          newAuthType: updated.authType,
          previousTrusted: server.trusted,
          newTrusted: updated.trusted,
          previousTransportType: server.transportType,
          newTransportType: updated.transportType,
          apiKeyChanged: input.apiKey !== undefined,
          credentialsChanged: input.credentials !== undefined,
          transportChanged:
            input.transportType !== undefined ||
            input.stdio !== undefined ||
            input.websocket !== undefined,
          hadOrgApiKey,
          hasOrgApiKey,
        },
        beforeSnapshot,
        afterSnapshot: createServerSnapshot(updated),
        ...getRequestMetaFromTrpc(ctx),
      });

      if (server.trusted !== updated.trusted || server.url !== updated.url) {
        await syncUntrustedServerPolicies(ctx.auth.organizationId, updated.url, updated.trusted);
      }

      // Auto-discover tools if API key or credentials were added/updated
      let toolsDiscovered: number | undefined;
      let discoveryError: string | undefined;
      if ((apiKeyProvided && updated.apiKey) || (credentialsProvided && updated.credentials)) {
        const discovery = await discoverTools(
          ctx.auth.organizationId,
          updated.id,
          ctx.auth.user.id,
          updated.workspaceId ?? undefined,
        );
        toolsDiscovered = discovery.toolsDiscovered;
        discoveryError = discovery.error;
      }

      return { ...sanitizeServer(updated), toolsDiscovered, discoveryError };
    }),

  /**
   * Delete an MCP server (soft delete)
   */
  delete: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        deleteRelatedPolicies: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await findServerOrThrow(ctx.auth.organizationId, input.id, undefined, {
        workspaceIds: ctx.auth.workspaceIds,
        isOrgOwner: ctx.auth.isOrgOwner,
      });

      // Analyze deletion impact
      const impact = await analyzeMcpServerDeletion(ctx.auth.organizationId, input.id);

      // Separate policy blockers from other blockers
      const policyBlockers = impact.blockers.filter((b) => b.type === 'policy');
      const nonPolicyBlockers = impact.blockers.filter((b) => b.type !== 'policy');

      // Non-policy blockers always prevent deletion
      if (nonPolicyBlockers.length > 0) {
        const blockerMessages = nonPolicyBlockers.map((b) => b.details).join('; ');
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete: ${blockerMessages}`,
        });
      }

      // Policy blockers can be bypassed with deleteRelatedPolicies: true
      if (policyBlockers.length > 0 && !input.deleteRelatedPolicies) {
        const blockerMessages = policyBlockers.map((b) => b.details).join('; ');
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete: ${blockerMessages}. To delete the server along with its related policies, set deleteRelatedPolicies: true.`,
        });
      }

      const beforeSnapshot = createServerSnapshot(server);
      const serverKey = getServerKeyFromUrl(server.url);

      // Build transaction operations
      const transactionOps = [
        prisma.userMcpConfig.deleteMany({
          where: { mcpServerId: input.id },
        }),
        prisma.orgMcpOAuthToken.deleteMany({
          where: { mcpServerId: input.id },
        }),
        // Soft delete: Update instead of delete, but clear credentials
        prisma.mcpServer.update({
          where: { id: input.id },
          data: {
            deletedAt: new Date(),
            deletedBy: ctx.auth.user.id,
            // Clear sensitive credentials
            apiKey: null,
            credentials: Prisma.DbNull,
          },
        }),
      ];

      // If deleteRelatedPolicies is true, soft delete all related policies
      let deletedPoliciesCount = 0;
      if (input.deleteRelatedPolicies) {
        // Fetch all non-deleted policies and filter for those with tool patterns referencing this server
        const allPolicies = await prisma.policy.findMany({
          where: {
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
          select: { id: true, slug: true, toolPatterns: true },
        });

        // Filter policies where any tool pattern starts with the server key
        const relatedPolicies = allPolicies.filter((p) =>
          p.toolPatterns.some((tp) => tp.startsWith(`${serverKey}::`)),
        );

        deletedPoliciesCount = relatedPolicies.length;

        if (relatedPolicies.length > 0) {
          transactionOps.push(
            prisma.policy.updateMany({
              where: {
                id: { in: relatedPolicies.map((p) => p.id) },
              },
              data: {
                deletedAt: new Date(),
                deletedBy: ctx.auth.user.id,
              },
            }),
          );
        }
      }

      // Execute the transaction
      await prisma.$transaction(transactionOps);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_DELETE,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: server.id,
        resourceName: server.name,
        actionDetails: {
          name: server.name,
          url: server.url,
          authType: server.authType,
          trusted: server.trusted,
          deletedRelatedPolicies: input.deleteRelatedPolicies,
          deletedPoliciesCount,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true, impact, deletedPoliciesCount };
    }),

  /**
   * Restore a soft-deleted MCP server
   */
  restore: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Find server that is deleted - custom query needed
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: { not: null },
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found or not deleted',
        });
      }

      // Check if URL is now used by another active server
      const urlConflict = await prisma.mcpServer.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          url: server.url,
          deletedAt: null,
          id: { not: server.id },
        },
      });

      if (urlConflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cannot restore - URL is now used by "${urlConflict.name}". Delete that server first if you want to restore this one.`,
        });
      }

      const beforeSnapshot = createServerSnapshot(server, true);

      const restored = await prisma.mcpServer.update({
        where: { id: input.id },
        data: { deletedAt: null, deletedBy: null },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_RESTORE,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: restored.id,
        resourceName: restored.name,
        actionDetails: {
          action: 'restore',
          name: restored.name,
          url: restored.url,
          previousDeletedAt: server.deletedAt?.toISOString(),
          previousDeletedBy: server.deletedBy,
        },
        beforeSnapshot,
        afterSnapshot: createServerSnapshot(restored, true),
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Get deletion impact preview for an MCP server
   *
   * Returns impact analysis with additional metadata:
   * - `canDeleteWithPolicies`: true if deletion is possible when deleteRelatedPolicies is true
   * - `policyBlockersCount`: number of policies blocking deletion (can be bypassed)
   * - `nonPolicyBlockersCount`: number of non-policy blockers (cannot be bypassed)
   */
  getDeletionImpact: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await findServerOrThrow(ctx.auth.organizationId, input.id, undefined, {
        workspaceIds: ctx.auth.workspaceIds,
        isOrgOwner: ctx.auth.isOrgOwner,
      });

      const impact = await analyzeMcpServerDeletion(ctx.auth.organizationId, input.id);

      const policyBlockers = impact.blockers.filter((b) => b.type === 'policy');
      const nonPolicyBlockers = impact.blockers.filter((b) => b.type !== 'policy');

      const hint =
        policyBlockers.length > 0 && nonPolicyBlockers.length === 0
          ? `Set deleteRelatedPolicies: true to delete this server along with ${policyBlockers.length} related ${policyBlockers.length === 1 ? 'policy' : 'policies'}.`
          : null;

      return {
        ...impact,
        canDeleteWithPolicies: nonPolicyBlockers.length === 0,
        policyBlockersCount: policyBlockers.length,
        nonPolicyBlockersCount: nonPolicyBlockers.length,
        deleteRelatedPoliciesHint: hint,
      };
    }),

  /**
   * Discover tools from an MCP server
   */
  discoverTools: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        workspaceId: z.string().cuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await findServerOrThrow(ctx.auth.organizationId, input.id, undefined, {
        workspaceIds: ctx.auth.workspaceIds,
        isOrgOwner: ctx.auth.isOrgOwner,
      });
      const result = await discoverTools(
        ctx.auth.organizationId,
        input.id,
        ctx.auth.user.id,
        input.workspaceId,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_DISCOVER_TOOLS,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: server.id,
        resourceName: server.name,
        actionDetails: {
          serverName: server.name,
          serverUrl: server.url,
          toolsDiscovered: result.toolsDiscovered,
          success: result.success,
          error: result.error,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Get tool access for a specific user/agent
   * Returns which tools are accessible based on current policies
   */
  getToolAccessForUser: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        agentId: z.string().optional(),
        roleId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Must specify at least one of userId, agentId, or roleId
      if (!input.userId && !input.agentId && !input.roleId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Must specify either userId, agentId, or roleId',
        });
      }

      let user: UserWithRoles | null = null;
      let agent: Agent | null = null;
      let role: { id: string; name: string; isAdmin: boolean } | null = null;

      // Get user with roles if userId specified
      if (input.userId) {
        const foundUser = await prisma.user.findFirst({
          where: {
            id: input.userId,
            organizationId: ctx.auth.organizationId,
          },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        });

        if (!foundUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // foundUser already has the correct type from Prisma include
        user = foundUser;
      }

      // Get agent if agentId specified
      if (input.agentId) {
        const foundAgent = await prisma.agent.findFirst({
          where: {
            id: input.agentId,
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
        });

        if (!foundAgent) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Agent not found',
          });
        }

        agent = foundAgent;
      }

      // Get role if roleId specified (for role-based preview)
      if (input.roleId) {
        const foundRole = await prisma.role.findFirst({
          where: {
            id: input.roleId,
            organizationId: ctx.auth.organizationId,
          },
        });

        if (!foundRole) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Role not found',
          });
        }

        role = foundRole;

        // Create a synthetic user with this role for policy evaluation
        if (!user) {
          user = {
            id: 'synthetic-role-preview',
            email: `role-preview-${foundRole.name}@synthetic.local`,
            organizationId: ctx.auth.organizationId,
            accessToken: '',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastActivityAt: null,
            deletedAt: null,
            deletedBy: null,
            orgRole: 'MEMBER',
            userRoles: [
              {
                id: 'synthetic',
                userId: 'synthetic-role-preview',
                roleId: foundRole.id,
                createdAt: new Date(),
                role: {
                  id: foundRole.id,
                  name: foundRole.name,
                  isAdmin: foundRole.isAdmin,
                  organizationId: ctx.auth.organizationId,
                  description: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                  deletedBy: null,
                },
              },
            ],
          };
        }
      }

      // Get all enabled policies for the organization
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          enabled: true,
          deletedAt: null,
        },
      });

      // Get all MCP servers with their tools
      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        include: {
          tools: true,
        },
      });

      // Evaluate access for each tool
      const toolAccess = [];

      for (const server of servers) {
        for (const tool of server.tools) {
          if (!user) {
            // If no user context, skip evaluation
            toolAccess.push({
              serverId: server.id,
              serverName: server.name,
              toolId: tool.id,
              toolName: tool.name,
              toolDescription: tool.description,
              decision: 'DENIED' as const,
              justification: 'No user context for evaluation',
              policyIds: [],
            });
            continue;
          }

          // Evaluate policy for this tool
          const result = await evaluatePolicy(
            {
              user,
              agent,
              toolName: tool.name,
            },
            policies,
          );

          toolAccess.push({
            serverId: server.id,
            serverName: server.name,
            toolId: tool.id,
            toolName: tool.name,
            toolDescription: tool.description,
            decision: result.decision,
            justification: result.justification,
            policyIds: result.policyIds,
          });
        }
      }

      return {
        user: user
          ? {
              id: user.id,
              email: user.email,
              roles: user.userRoles.map(
                (ur: { role: { id: string; name: string; isAdmin: boolean } }) => ({
                  id: ur.role.id,
                  name: ur.role.name,
                  isAdmin: ur.role.isAdmin,
                }),
              ),
            }
          : null,
        agent: agent
          ? {
              id: agent.id,
              name: agent.name,
            }
          : null,
        role: role
          ? {
              id: role.id,
              name: role.name,
              isAdmin: role.isAdmin,
            }
          : null,
        toolAccess,
      };
    }),

  // ============================================================================
  // OAuth Administration
  // ============================================================================

  /**
   * Discover OAuth capability for a URL
   * Implements RFC 9728 discovery flow with fallbacks
   */
  discoverOAuth: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .query(async ({ ctx, input }) => {
      const result = await discoverOAuthCapability(input.url);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OAUTH_DISCOVER,
        resourceType: AdminResourceType.OAUTH_CLIENT,
        resourceId: null,
        resourceName: input.url,
        actionDetails: {
          url: input.url,
          supportsOAuth: result.supportsOAuth,
          authorizationEndpoint: result.authorizationEndpoint,
          tokenEndpoint: result.tokenEndpoint,
          registrationEndpoint: result.registrationEndpoint,
          scopesSupported: result.scopesSupported,
          error: result.error,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Register OAuth client via Dynamic Client Registration (RFC 7591)
   * Requires prior OAuth discovery to have found a registration endpoint
   */
  registerOAuthClient: adminProcedure
    .input(z.object({ mcpServerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const server = await findServerOrThrow(
        ctx.auth.organizationId,
        input.mcpServerId,
        undefined,
        { workspaceIds: ctx.auth.workspaceIds, isOrgOwner: ctx.auth.isOrgOwner },
      );
      const discovery = await discoverOAuthCapability(server.url);

      if (!discovery.supportsOAuth) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: discovery.error || 'MCP server does not support OAuth',
        });
      }

      if (!discovery.registrationEndpoint) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'MCP server does not support Dynamic Client Registration. Use manual configuration.',
        });
      }

      if (!discovery.authorizationEndpoint || !discovery.tokenEndpoint) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'OAuth discovery returned incomplete endpoint information',
        });
      }

      // Get organization name for client registration
      const org = await prisma.organization.findUnique({
        where: { id: ctx.auth.organizationId },
      });

      const redirectUri = getOAuthRedirectUri();

      // Register client via DCR
      const clientCredentials = await registerOAuthClient(
        discovery.registrationEndpoint,
        org?.name || 'SENTINEL Organization',
        redirectUri,
      );

      // Store registration
      await storeOAuthClientRegistration(
        ctx.auth.organizationId,
        input.mcpServerId,
        clientCredentials.clientId,
        clientCredentials.clientSecret,
        discovery.authorizationEndpoint,
        discovery.tokenEndpoint,
        discovery.registrationEndpoint,
        discovery.revocationEndpoint || null,
        discovery.scopesSupported || [],
        discovery.grantTypesSupported || ['authorization_code', 'refresh_token'],
        redirectUri,
      );

      // Update MCP server auth type to OAUTH
      await prisma.mcpServer.update({
        where: { id: input.mcpServerId },
        data: { authType: McpAuthType.OAUTH },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OAUTH_CLIENT_REGISTER,
        resourceType: AdminResourceType.OAUTH_CLIENT,
        resourceId: input.mcpServerId,
        resourceName: server.name,
        actionDetails: {
          mcpServerId: input.mcpServerId,
          serverName: server.name,
          serverUrl: server.url,
          clientId: clientCredentials.clientId,
          registrationEndpoint: discovery.registrationEndpoint,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return {
        success: true,
        clientId: clientCredentials.clientId,
        authorizationEndpoint: discovery.authorizationEndpoint,
        tokenEndpoint: discovery.tokenEndpoint,
        scopesSupported: discovery.scopesSupported,
      };
    }),

  /**
   * Manually configure OAuth client credentials
   * For servers that don't support DCR
   */
  setOAuthConfig: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string(),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        authorizationEndpoint: z.string().url(),
        tokenEndpoint: z.string().url(),
        revocationEndpoint: z.string().url().optional(),
        scopesSupported: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await findServerOrThrow(
        ctx.auth.organizationId,
        input.mcpServerId,
        undefined,
        { workspaceIds: ctx.auth.workspaceIds, isOrgOwner: ctx.auth.isOrgOwner },
      );

      // Capture redirect URI at configuration time for consistency
      const redirectUri = getOAuthRedirectUri();

      await storeOAuthClientRegistration(
        ctx.auth.organizationId,
        input.mcpServerId,
        input.clientId,
        input.clientSecret,
        input.authorizationEndpoint,
        input.tokenEndpoint,
        null, // No DCR endpoint for manual config
        input.revocationEndpoint || null,
        input.scopesSupported || [],
        ['authorization_code', 'refresh_token'],
        redirectUri,
      );

      // Update MCP server auth type to OAUTH
      await prisma.mcpServer.update({
        where: { id: input.mcpServerId },
        data: { authType: McpAuthType.OAUTH },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OAUTH_CLIENT_CONFIGURE,
        resourceType: AdminResourceType.OAUTH_CLIENT,
        resourceId: input.mcpServerId,
        resourceName: server.name,
        actionDetails: {
          mcpServerId: input.mcpServerId,
          serverName: server.name,
          serverUrl: server.url,
          clientId: input.clientId,
          authorizationEndpoint: input.authorizationEndpoint,
          tokenEndpoint: input.tokenEndpoint,
          revocationEndpoint: input.revocationEndpoint,
          scopesSupported: input.scopesSupported,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Get OAuth configuration for an MCP server
   */
  getOAuthConfig: adminProcedure
    .input(z.object({ mcpServerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        include: {
          oauthClientRegistration: true,
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
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      if (!server.oauthClientRegistration) {
        return { configured: false };
      }

      const reg = server.oauthClientRegistration;
      return {
        configured: true,
        clientId: reg.clientId,
        authorizationEndpoint: reg.authorizationEndpoint,
        tokenEndpoint: reg.tokenEndpoint,
        registrationEndpoint: reg.registrationEndpoint,
        revocationEndpoint: reg.revocationEndpoint,
        scopesSupported: reg.scopesSupported,
        grantTypesSupported: reg.grantTypesSupported,
        discoveredAt: reg.discoveredAt,
      };
    }),

  /**
   * Get tools with their sensitive flag status
   * Returns tools categorized by whether they match any enabled sensitive flag
   */
  getToolsWithFlagStatus: adminProcedure
    .input(
      z
        .object({
          serverId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Fetch all enabled sensitive flags for the organization
      const sensitiveFlags = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          enabled: true,
        },
        select: {
          id: true,
          toolPattern: true,
          behaviors: true,
          description: true,
        },
      });

      // Build workspace filter (same as list endpoint)
      const { isOrgOwner, workspaceIds } = ctx.auth;
      type WorkspaceFilter =
        | Record<string, never>
        | { OR: Array<{ workspaceId: string | null } | { workspaceId: { in: string[] } }> };
      let workspaceFilter: WorkspaceFilter = {};
      if (!isOrgOwner) {
        // Non-owners see org-wide + their workspace servers
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
        };
      }

      // Fetch all MCP servers with their tools and classification data
      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          ...(input?.serverId ? { id: input.serverId } : {}),
          ...workspaceFilter,
        },
        include: {
          tools: {
            include: {
              classification: {
                select: {
                  riskLevel: true,
                  accessType: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Helper to get server key from URL
      const getServerKey = (url: string): string => {
        try {
          const parsed = new URL(url);
          return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
        } catch {
          return url;
        }
      };

      // Process each server and categorize tools
      let totalFlagged = 0;
      let totalUnflagged = 0;

      const enrichedServers = servers.map((server) => {
        const serverKey = getServerKey(server.url);

        const enrichedTools = server.tools.map((tool) => {
          const qualifiedName = `${serverKey}::${tool.name}`;

          // Find all matching flags
          const matchingFlags = sensitiveFlags.filter((flag) =>
            checkToolPattern(flag.toolPattern, qualifiedName),
          );

          const isFlagged = matchingFlags.length > 0;
          if (isFlagged) {
            totalFlagged++;
          } else {
            totalUnflagged++;
          }

          // Collect unique behaviors from all matching flags
          const flagBehaviors: SensitiveFlagBehavior[] = [
            ...new Set(matchingFlags.flatMap((f) => f.behaviors)),
          ];

          return {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            qualifiedName,
            isFlagged,
            flagBehaviors,
            matchingFlagIds: matchingFlags.map((f) => f.id),
            riskLevel: tool.classification?.riskLevel ?? null,
            accessType: tool.classification?.accessType ?? null,
          };
        });

        return {
          id: server.id,
          name: server.name,
          url: server.url,
          serverKey,
          tools: enrichedTools,
        };
      });

      return {
        servers: enrichedServers,
        stats: {
          total: totalFlagged + totalUnflagged,
          flagged: totalFlagged,
          unflagged: totalUnflagged,
        },
      };
    }),
});
