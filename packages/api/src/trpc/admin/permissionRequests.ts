/**
 * Admin Permission Requests Router
 * Handles permission request review and approval
 */

import {
  AdminActionType,
  AdminResourceType,
  McpAuthType,
  PermissionRequestStatus,
  PermissionRequestType,
  PolicyEffect,
  Prisma,
  prisma,
  type PermissionRequest,
  type Policy,
} from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { encryptString } from '../../lib/crypto.js';
import { toJsonValue } from '../../lib/jsonValue.js';
import { logger } from '../../lib/logger.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { canAccessWorkspace } from '../../services/auth.js';
import {
  SENTINEL_SELF_MCP_SERVER_ERROR,
  discoverTools,
  isSentinelMcpServerUrl,
  validateMcpServerUrl,
} from '../../services/mcp.js';
import {
  getOAuthRedirectUri,
  registerOAuthClient,
  storeOAuthClientRegistration,
} from '../../services/oauth.js';
import { discoverOAuthCapability } from '../../services/oauthDiscovery.js';
import { generatePolicyDescription, generatePolicySlug } from '../../services/policy.js';
import {
  getToolValidationErrorMessage,
  validateToolNamesForOrganization,
} from '../../services/toolValidation.js';
import { adminProcedure, router } from '../init.js';

// Zod schemas for request data validation
const mcpServerRequestDataSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  authType: z.nativeEnum(McpAuthType),
  apiKey: z.string().optional(),
  alsoRequestTools: z.boolean().optional(),
  workspaceId: z.string().optional(), // Workspace to add the MCP server to
});

const denyRemovalRequestDataSchema = z.object({ policyId: z.string() });

// Common user include for permission request queries
const userEmailInclude = { user: { select: { email: true } } } as const;

type RequestWithUserEmail = PermissionRequest & { user: { email: string } };

/**
 * Fetch a permission request scoped to organization with user email
 * Also validates workspace access: org owners can access all, workspace admins only their workspaces
 */
async function fetchRequest(
  requestId: string,
  organizationId: string,
  auth: { isOrgOwner: boolean; adminWorkspaceIds: string[] },
  requestType?: PermissionRequestType,
): Promise<RequestWithUserEmail> {
  const request = await prisma.permissionRequest.findFirst({
    where: {
      id: requestId,
      ...(requestType && { type: requestType }),
      user: { organizationId },
    },
    include: userEmailInclude,
  });

  if (!request) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Permission request not found' });
  }

  // Validate workspace access for workspace-scoped requests
  // Org owners can access all requests, workspace admins only their workspace requests
  if (
    request.workspaceId &&
    !auth.isOrgOwner &&
    !auth.adminWorkspaceIds.includes(request.workspaceId)
  ) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Permission request not found' });
  }

  return request;
}

/**
 * Validate request is still pending
 */
function assertPending(request: PermissionRequest): void {
  if (request.status !== PermissionRequestStatus.PENDING) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Permission request has already been reviewed',
    });
  }
}

/**
 * Create before snapshot for audit logging
 */
function createBeforeSnapshot(request: PermissionRequest): Prisma.InputJsonObject {
  return {
    id: request.id,
    userId: request.userId,
    status: request.status,
    type: request.type,
    toolNames: request.toolNames,
    reason: request.reason,
    data: request.data !== null ? toJsonValue(request.data) : null,
  };
}

/**
 * Create after snapshot for audit logging
 */
function createAfterSnapshot(
  request: Pick<
    PermissionRequest,
    'id' | 'userId' | 'status' | 'reviewedBy' | 'reviewedAt' | 'reviewNote'
  >,
): Prisma.InputJsonObject {
  return {
    id: request.id,
    userId: request.userId,
    status: request.status,
    reviewedBy: request.reviewedBy,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    reviewNote: request.reviewNote,
  };
}

/**
 * Extract policy display fields for API response
 */
function extractPolicyDetails(policy: Policy): {
  id: string;
  slug: string;
  description: string | null;
  matchers: string[];
  toolPatterns: string[];
  effect: PolicyEffect;
  enabled: boolean;
  createdAt: Date;
} {
  return {
    id: policy.id,
    slug: policy.slug,
    description: policy.description,
    matchers: policy.matchers,
    toolPatterns: policy.toolPatterns,
    effect: policy.effect,
    enabled: policy.enabled,
    createdAt: policy.createdAt,
  };
}

/**
 * Generate warnings for a DENY policy being removed
 */
function generatePolicyWarnings(policy: Policy): string[] {
  const warnings: string[] = [];

  if (policy.matchers.includes('*')) {
    warnings.push('This policy affects ALL users in the organization');
  } else if (policy.matchers.some((m) => m.startsWith('role:'))) {
    const roles = policy.matchers.filter((m) => m.startsWith('role:')).map((m) => m.split(':')[1]);
    warnings.push(`This policy affects all users with roles: ${roles.join(', ')}`);
  }

  if (policy.toolPatterns.includes('*::*')) {
    warnings.push('This policy blocks ALL tools - removing grants broad access');
  } else if (policy.toolPatterns.some((tp) => tp.endsWith('::*'))) {
    const servers = policy.toolPatterns
      .filter((tp) => tp.endsWith('::*'))
      .map((tp) => tp.replace('::*', ''));
    warnings.push(`This policy blocks all tools on: ${servers.join(', ')}`);
  }

  return warnings;
}

/**
 * Build a map of server domain to server name
 */
function buildServerNameMap(servers: Array<{ name: string; url: string }>): Map<string, string> {
  const serverMap = new Map<string, string>();
  for (const server of servers) {
    try {
      const url = new URL(server.url);
      const port = url.port ? `:${url.port}` : '';
      const key = `${url.hostname}${port}`.toLowerCase();
      serverMap.set(key, server.name);
    } catch {
      // Ignore invalid URLs
    }
  }
  return serverMap;
}

export const adminPermissionRequestsRouter = router({
  /**
   * Get policy details for a DENY_REMOVAL request
   */
  getDenyPolicyDetails: adminProcedure
    .input(z.object({ requestId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const request = await fetchRequest(
        input.requestId,
        ctx.auth.organizationId,
        ctx.auth,
        PermissionRequestType.DENY_REMOVAL,
      );

      const parseResult = denyRemovalRequestDataSchema.safeParse(request.data);
      if (!parseResult.success) {
        return { policy: null, status: 'INVALID_DATA' as const, warnings: [] as string[] };
      }

      const policy = await prisma.policy.findFirst({
        where: { id: parseResult.data.policyId, organizationId: ctx.auth.organizationId },
      });

      if (!policy) {
        return { policy: null, status: 'POLICY_NOT_FOUND' as const, warnings: [] as string[] };
      }

      // Validate workspace access for workspace-scoped policies
      if (policy.workspaceId && !canAccessWorkspace(ctx.auth, policy.workspaceId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      if (policy.deletedAt) {
        return {
          policy: extractPolicyDetails(policy),
          status: 'ALREADY_DELETED' as const,
          warnings: [] as string[],
        };
      }

      if (policy.effect !== PolicyEffect.DENY) {
        return {
          policy: extractPolicyDetails(policy),
          status: 'NOT_DENY_POLICY' as const,
          warnings: ['Policy effect was changed from DENY'],
        };
      }

      return {
        policy: extractPolicyDetails(policy),
        status: 'ACTIVE' as const,
        warnings: generatePolicyWarnings(policy),
      };
    }),

  /**
   * List permission requests
   */
  list: adminProcedure
    .input(
      z.object({
        status: z.nativeEnum(PermissionRequestStatus).optional(),
        workspaceId: z.string().cuid().optional().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { isOrgOwner, workspaceIds } = ctx.auth;

      // Build workspace filter
      // If specific workspaceId is requested, filter to that workspace only
      // Otherwise, org owners see all, workspace admins see org-wide + their workspace requests
      let workspaceFilter: Prisma.PermissionRequestWhereInput = {};
      if (input.workspaceId) {
        // Explicit workspace filter - validate access
        if (!isOrgOwner && !workspaceIds.includes(input.workspaceId)) {
          return []; // User doesn't have access to this workspace
        }
        workspaceFilter = { workspaceId: input.workspaceId };
      } else if (!isOrgOwner) {
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
        };
      }

      return prisma.permissionRequest.findMany({
        where: {
          user: { organizationId: ctx.auth.organizationId },
          status: input.status ?? { not: PermissionRequestStatus.WITHDRAWN },
          ...workspaceFilter,
        },
        include: userEmailInclude,
        orderBy: { createdAt: 'desc' },
      });
    }),

  /**
   * Get a specific permission request
   */
  get: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(({ ctx, input }) => fetchRequest(input.id, ctx.auth.organizationId, ctx.auth)),

  /**
   * Approve a permission request
   * Requires APPROVAL_WORKFLOWS feature (standard+ tier)
   */
  approve: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reviewNote: z.string().optional(),
        apiKey: z.string().optional(),
        customGrant: z
          .object({
            matchers: z.array(z.string()).min(1, 'At least one matcher is required'),
            toolPatterns: z.array(z.string()).min(1, 'At least one tool pattern is required'),
            conditions: z
              .array(
                z.object({
                  field: z.string(),
                  operator: z.string(),
                  value: z.unknown().optional(),
                }),
              )
              .nullable()
              .optional(),
            workspaceId: z.string().cuid().nullable().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(input.id, ctx.auth.organizationId, ctx.auth);
      assertPending(request);

      const beforeSnapshot = createBeforeSnapshot(request);
      const requestMeta = getRequestMetaFromTrpc(ctx);
      const reviewNote = input.reviewNote?.trim() || null;

      const approvalData = {
        status: PermissionRequestStatus.APPROVED,
        reviewedBy: ctx.auth.user.id,
        reviewedAt: new Date(),
        reviewNote,
      };

      // Route to appropriate handler based on request type
      if (request.type === PermissionRequestType.MCP_SERVER) {
        return approveMcpServerRequest(
          ctx.auth.organizationId,
          ctx.auth.user.id,
          request,
          input.apiKey,
          approvalData,
          beforeSnapshot,
          requestMeta,
        );
      }

      if (request.type === PermissionRequestType.DENY_REMOVAL) {
        return approveDenyRemovalRequest(
          ctx.auth.organizationId,
          ctx.auth.user.id,
          request,
          approvalData,
          beforeSnapshot,
          requestMeta,
        );
      }

      // Tool access request
      return approveToolAccessRequest(
        ctx.auth.organizationId,
        ctx.auth.user.id,
        request,
        input.customGrant,
        approvalData,
        beforeSnapshot,
        requestMeta,
      );
    }),

  /**
   * Deny a permission request
   * Requires APPROVAL_WORKFLOWS feature (standard+ tier)
   */
  deny: adminProcedure
    .input(z.object({ id: z.string().cuid(), reviewNote: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(input.id, ctx.auth.organizationId, ctx.auth);
      assertPending(request);

      const beforeSnapshot = createBeforeSnapshot(request);
      const reviewNote = input.reviewNote.trim();

      const updated = await prisma.permissionRequest.update({
        where: { id: input.id },
        data: {
          status: PermissionRequestStatus.DENIED,
          reviewedBy: ctx.auth.user.id,
          reviewedAt: new Date(),
          reviewNote,
        },
        include: userEmailInclude,
      });

      const actionType =
        request.type === PermissionRequestType.DENY_REMOVAL
          ? AdminActionType.DENY_POLICY_REMOVAL_DENY
          : AdminActionType.PERMISSION_REQUEST_DENY;

      const resourceName =
        request.type === PermissionRequestType.DENY_REMOVAL
          ? `Restriction Removal Request from ${updated.user.email}`
          : `Request from ${updated.user.email}`;

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType,
        resourceType: AdminResourceType.PERMISSION_REQUEST,
        resourceId: updated.id,
        resourceName,
        actionDetails: {
          actionDisplayName: getActionDisplayName(actionType),
          requestId: updated.id,
          userId: updated.userId,
          userEmail: updated.user.email,
          toolNames: updated.toolNames,
          type: updated.type,
          reviewNote: updated.reviewNote,
        },
        beforeSnapshot,
        afterSnapshot: createAfterSnapshot(updated),
        reason: updated.reviewNote,
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),
});

// --- Approval Handler Functions ---

type ApprovalData = {
  status: typeof PermissionRequestStatus.APPROVED;
  reviewedBy: string;
  reviewedAt: Date;
  reviewNote: string | null;
};

type RequestMeta = ReturnType<typeof getRequestMetaFromTrpc>;

/**
 * Handle MCP server request approval
 */
async function approveMcpServerRequest(
  organizationId: string,
  adminUserId: string,
  request: RequestWithUserEmail,
  inputApiKey: string | undefined,
  approvalData: ApprovalData,
  beforeSnapshot: Prisma.InputJsonObject,
  requestMeta: RequestMeta,
): Promise<PermissionRequest> {
  const parseResult = mcpServerRequestDataSchema.safeParse(request.data);
  if (!parseResult.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Invalid MCP server data in request',
    });
  }
  const data = parseResult.data;

  if (isSentinelMcpServerUrl(data.url)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: SENTINEL_SELF_MCP_SERVER_ERROR });
  }

  // Validate workspace if provided - must exist and belong to the organization
  if (data.workspaceId) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: data.workspaceId,
        organizationId,
        deletedAt: null,
      },
    });
    if (!workspace) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Specified workspace does not exist or is not accessible',
      });
    }
  }

  const { authType } = data;
  const effectiveApiKey = inputApiKey?.trim() || data.apiKey?.trim() || undefined;
  // Validation rules:
  // - NONE: Always validate (should be accessible without auth)
  // - API_KEY: Only validate if we have an API key to test with
  // - OAUTH: Skip validation (requires OAuth flow first, can't validate without token)
  const shouldValidate =
    authType === McpAuthType.NONE || (authType === McpAuthType.API_KEY && Boolean(effectiveApiKey));

  if (shouldValidate) {
    const credentials =
      authType === McpAuthType.API_KEY && effectiveApiKey ? { apiKey: effectiveApiKey } : undefined;
    const validation = await validateMcpServerUrl(data.url, authType, credentials);

    if (!validation.success) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `MCP server validation failed: ${validation.error}. The server may be offline or configuration is invalid.`,
      });
    }
  }

  const encryptedApiKey =
    authType === McpAuthType.API_KEY && effectiveApiKey ? encryptString(effectiveApiKey) : null;

  const mcpServer = await prisma.mcpServer.create({
    data: {
      organizationId,
      name: data.name,
      url: data.url,
      authType,
      apiKey: encryptedApiKey,
      trusted: false,
      workspaceId: data.workspaceId ?? null, // Workspace from user's request
    },
  });

  const updatedRequest = await prisma.permissionRequest.update({
    where: { id: request.id },
    data: approvalData,
  });

  // Log request approval
  await logAdminAction({
    organizationId,
    adminUserId,
    actionType: AdminActionType.PERMISSION_REQUEST_APPROVE,
    resourceType: AdminResourceType.PERMISSION_REQUEST,
    resourceId: request.id,
    resourceName: `MCP Server Request from ${request.user.email}`,
    actionDetails: {
      actionDisplayName: getActionDisplayName(AdminActionType.PERMISSION_REQUEST_APPROVE),
      requestId: request.id,
      userId: request.userId,
      userEmail: request.user.email,
      type: request.type,
      createdMcpServerId: mcpServer.id,
      reviewNote: approvalData.reviewNote,
    },
    beforeSnapshot,
    afterSnapshot: createAfterSnapshot(updatedRequest),
    reason: approvalData.reviewNote,
    ...requestMeta,
  });

  // Log MCP server creation
  await logAdminAction({
    organizationId,
    adminUserId,
    actionType: AdminActionType.MCP_SERVER_CREATE,
    resourceType: AdminResourceType.MCP_SERVER,
    resourceId: mcpServer.id,
    resourceName: mcpServer.name,
    actionDetails: {
      actionDisplayName: getActionDisplayName(AdminActionType.MCP_SERVER_CREATE),
      name: mcpServer.name,
      url: mcpServer.url,
      authType: mcpServer.authType,
      trusted: mcpServer.trusted,
      workspaceId: mcpServer.workspaceId,
      createdViaPermissionRequest: true,
      permissionRequestId: request.id,
    },
    afterSnapshot: {
      id: mcpServer.id,
      name: mcpServer.name,
      url: mcpServer.url,
      authType: mcpServer.authType,
      trusted: mcpServer.trusted,
      organizationId: mcpServer.organizationId,
      workspaceId: mcpServer.workspaceId,
    },
    reason: `Created via approval of request from ${request.user.email}`,
    ...requestMeta,
  });

  // For OAuth servers, automatically discover and register OAuth client
  if (authType === McpAuthType.OAUTH) {
    try {
      const discovery = await discoverOAuthCapability(data.url);

      if (discovery.supportsOAuth && discovery.authorizationEndpoint && discovery.tokenEndpoint) {
        if (discovery.registrationEndpoint) {
          // Server supports DCR - automatically register
          const org = await prisma.organization.findUnique({
            where: { id: organizationId },
          });

          const redirectUri = getOAuthRedirectUri();

          try {
            const clientCredentials = await registerOAuthClient(
              discovery.registrationEndpoint,
              org?.name || 'SENTINEL Organization',
              redirectUri,
            );

            await storeOAuthClientRegistration(
              organizationId,
              mcpServer.id,
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

            logger.info('OAuth client registered for MCP server via request approval', {
              serverId: mcpServer.id,
              clientId: clientCredentials.clientId,
            });
          } catch (dcrError) {
            logger.error('OAuth DCR failed during request approval', {
              serverId: mcpServer.id,
              error: dcrError,
            });
          }
        } else {
          logger.warn('MCP server supports OAuth but not DCR', {
            serverId: mcpServer.id,
            url: data.url,
          });
        }
      } else {
        logger.warn('OAuth discovery failed for MCP server', {
          serverId: mcpServer.id,
          url: data.url,
          error: discovery.error,
        });
      }
    } catch (discoveryError) {
      logger.error('OAuth discovery error during request approval', {
        serverId: mcpServer.id,
        error: discoveryError,
      });
    }
  }

  // Discover tools (skip for OAuth servers and API_KEY servers without a key)
  let discoveredToolNames: string[] = [];
  const shouldDiscoverTools =
    authType === McpAuthType.NONE || (authType === McpAuthType.API_KEY && effectiveApiKey);

  logger.info('MCP server approval - tool discovery check', {
    serverId: mcpServer.id,
    serverName: data.name,
    authType,
    hasApiKey: Boolean(effectiveApiKey),
    shouldDiscoverTools,
    alsoRequestTools: data.alsoRequestTools,
  });

  if (shouldDiscoverTools) {
    try {
      const discoveryResult = await discoverTools(organizationId, mcpServer.id, adminUserId);

      logger.info('Tool discovery result', {
        serverId: mcpServer.id,
        success: discoveryResult.success,
        toolsDiscovered: discoveryResult.toolsDiscovered,
        error: discoveryResult.error,
      });

      if (discoveryResult.success) {
        // Get the discovered tools for the chained request
        const discoveredTools = await prisma.mcpTool.findMany({
          where: { mcpServerId: mcpServer.id },
          select: { name: true },
        });

        logger.info('Tools found in database after discovery', {
          serverId: mcpServer.id,
          toolCount: discoveredTools.length,
          tools: discoveredTools.map((t) => t.name),
        });

        // Build fully qualified tool names (domain::toolName)
        const url = new URL(mcpServer.url);
        const port = url.port ? `:${url.port}` : '';
        const domain = `${url.hostname}${port}`.toLowerCase();
        discoveredToolNames = discoveredTools.map((t: { name: string }) => `${domain}::${t.name}`);
      } else {
        logger.warn(
          `Tool discovery failed for MCP server ${mcpServer.id}: ${discoveryResult.error}`,
        );
      }
    } catch (error) {
      logger.error(`Failed to discover tools for new MCP server ${mcpServer.id}:`, error);
    }
  } else {
    logger.info('Skipping tool discovery', {
      serverId: mcpServer.id,
      reason:
        authType === McpAuthType.OAUTH
          ? 'OAuth servers require authentication first'
          : 'API_KEY server without API key provided',
    });
  }

  // Create chained TOOL_ACCESS request if user requested it
  // For OAuth servers or API_KEY servers without a key, tools won't be discovered yet,
  // so we store the mcpServerId in data for later population after OAuth/credential flow
  logger.info('Chained tool request check', {
    serverId: mcpServer.id,
    alsoRequestTools: data.alsoRequestTools,
    discoveredToolCount: discoveredToolNames.length,
    willCreateChainedRequest: Boolean(data.alsoRequestTools),
  });

  if (data.alsoRequestTools) {
    const chainedRequest = await prisma.permissionRequest.create({
      data: {
        userId: request.userId,
        type: PermissionRequestType.TOOL_ACCESS,
        toolNames: discoveredToolNames, // Empty array if tools not discovered yet
        reason: `Automatically requested with MCP server "${data.name}"`,
        data: {
          chainedFromRequestId: request.id,
          // Store mcpServerId for later population if tools weren't discovered
          ...(discoveredToolNames.length === 0 ? { mcpServerId: mcpServer.id } : {}),
        },
      },
    });
    logger.info('Created chained TOOL_ACCESS request', {
      chainedRequestId: chainedRequest.id,
      originalRequestId: request.id,
      toolCount: discoveredToolNames.length,
      pendingToolDiscovery: discoveredToolNames.length === 0,
    });
  }

  return updatedRequest;
}

/**
 * Handle DENY removal request approval
 */
async function approveDenyRemovalRequest(
  organizationId: string,
  adminUserId: string,
  request: RequestWithUserEmail,
  approvalData: ApprovalData,
  beforeSnapshot: Prisma.InputJsonObject,
  requestMeta: RequestMeta,
): Promise<PermissionRequest> {
  const parseResult = denyRemovalRequestDataSchema.safeParse(request.data);
  if (!parseResult.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Invalid DENY removal request data',
    });
  }

  const { policyId } = parseResult.data;

  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
  });

  if (!policy) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'The restriction policy no longer exists' });
  }
  if (policy.deletedAt) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This restriction has already been removed',
    });
  }
  if (policy.effect !== PolicyEffect.DENY) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This policy is no longer a restriction (DENY) policy',
    });
  }

  const policyBeforeSnapshot = {
    id: policy.id,
    slug: policy.slug,
    matchers: policy.matchers,
    toolPatterns: policy.toolPatterns,
    effect: policy.effect,
    description: policy.description,
    enabled: policy.enabled,
  };

  const deletedPolicy = await prisma.policy.update({
    where: { id: policyId },
    data: { deletedAt: new Date(), enabled: false },
  });

  const updatedRequest = await prisma.permissionRequest.update({
    where: { id: request.id },
    data: approvalData,
  });

  // Log request approval
  await logAdminAction({
    organizationId,
    adminUserId,
    actionType: AdminActionType.DENY_POLICY_REMOVAL_APPROVE,
    resourceType: AdminResourceType.PERMISSION_REQUEST,
    resourceId: request.id,
    resourceName: `Restriction Removal Request from ${request.user.email}`,
    actionDetails: {
      actionDisplayName: getActionDisplayName(AdminActionType.DENY_POLICY_REMOVAL_APPROVE),
      requestId: request.id,
      userId: request.userId,
      userEmail: request.user.email,
      type: request.type,
      deletedPolicyId: policyId,
      deletedPolicySlug: policy.slug,
      toolNames: request.toolNames,
      reviewNote: approvalData.reviewNote,
    },
    beforeSnapshot,
    afterSnapshot: createAfterSnapshot(updatedRequest),
    reason: approvalData.reviewNote,
    ...requestMeta,
  });

  // Log policy deletion
  await logAdminAction({
    organizationId,
    adminUserId,
    actionType: AdminActionType.POLICY_DELETE,
    resourceType: AdminResourceType.POLICY,
    resourceId: policy.id,
    resourceName: policy.slug,
    actionDetails: {
      actionDisplayName: getActionDisplayName(AdminActionType.POLICY_DELETE),
      slug: policy.slug,
      deletedViaPermissionRequest: true,
      permissionRequestId: request.id,
      userEmail: request.user.email,
    },
    beforeSnapshot: policyBeforeSnapshot,
    afterSnapshot: {
      id: deletedPolicy.id,
      slug: deletedPolicy.slug,
      matchers: deletedPolicy.matchers,
      toolPatterns: deletedPolicy.toolPatterns,
      effect: deletedPolicy.effect,
      description: deletedPolicy.description,
      enabled: deletedPolicy.enabled,
      deletedAt: deletedPolicy.deletedAt,
    },
    reason: `Deleted via approval of restriction removal request from ${request.user.email}`,
    ...requestMeta,
  });

  return updatedRequest;
}

/**
 * Handle tool access request approval
 */
async function approveToolAccessRequest(
  organizationId: string,
  adminUserId: string,
  request: RequestWithUserEmail,
  customGrant: { matchers: string[]; toolPatterns: string[] } | undefined,
  approvalData: ApprovalData,
  beforeSnapshot: Prisma.InputJsonObject,
  requestMeta: RequestMeta,
): Promise<PermissionRequest> {
  const servers = await prisma.mcpServer.findMany({
    where: { organizationId, deletedAt: null },
    select: { name: true, url: true },
  });
  const serverMap = buildServerNameMap(servers);

  if (customGrant) {
    return approveCustomGrant(
      organizationId,
      adminUserId,
      request,
      customGrant,
      serverMap,
      approvalData,
      beforeSnapshot,
      requestMeta,
    );
  }

  return approveDefaultToolAccess(
    organizationId,
    adminUserId,
    request,
    serverMap,
    approvalData,
    beforeSnapshot,
    requestMeta,
  );
}

/**
 * Check if custom grant differs from the original request
 */
function isGrantModified(
  request: RequestWithUserEmail,
  customGrant: {
    matchers: string[];
    toolPatterns: string[];
    conditions?: Array<{ field: string; operator: string; value?: unknown }> | null;
  },
): boolean {
  const expectedMatcher = `user:${request.user.email}`;
  const requestedToolNames = [...request.toolNames].sort();
  const grantedToolPatterns = [...customGrant.toolPatterns].sort();

  // Check if matchers differ from expected (just the requesting user)
  const matchersModified =
    customGrant.matchers.length !== 1 || customGrant.matchers[0] !== expectedMatcher;

  // Check if tool patterns differ from requested tools
  const toolPatternsModified =
    requestedToolNames.length !== grantedToolPatterns.length ||
    requestedToolNames.some((tool, i) => tool !== grantedToolPatterns[i]);

  // Check if conditions were added (original requests never have conditions)
  const conditionsAdded =
    customGrant.conditions !== null &&
    customGrant.conditions !== undefined &&
    customGrant.conditions.length > 0;

  return matchersModified || toolPatternsModified || conditionsAdded;
}

/**
 * Approve with custom grant (single policy with specified matchers/patterns)
 */
async function approveCustomGrant(
  organizationId: string,
  adminUserId: string,
  request: RequestWithUserEmail,
  customGrant: {
    matchers: string[];
    toolPatterns: string[];
    conditions?: Array<{ field: string; operator: string; value?: unknown }> | null;
    workspaceId?: string | null;
  },
  serverMap: Map<string, string>,
  approvalData: ApprovalData,
  beforeSnapshot: Prisma.InputJsonObject,
  requestMeta: RequestMeta,
): Promise<PermissionRequest> {
  const { matchers, toolPatterns, conditions, workspaceId } = customGrant;

  const validation = await validateToolNamesForOrganization(organizationId, toolPatterns);
  const errorMessage = getToolValidationErrorMessage(validation);
  if (errorMessage) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: errorMessage });
  }

  // Determine if the grant was modified from the original request
  const wasModified = isGrantModified(request, customGrant);
  const finalStatus = wasModified
    ? PermissionRequestStatus.MODIFIED
    : PermissionRequestStatus.APPROVED;

  const updated = await prisma.$transaction(async (tx) => {
    const existingSlugs = new Set(
      (await tx.policy.findMany({ where: { organizationId }, select: { slug: true } })).map(
        (p) => p.slug,
      ),
    );

    const slug = generatePolicySlug(matchers, toolPatterns, PolicyEffect.ALLOW, existingSlugs);
    const description = generatePolicyDescription(
      matchers,
      toolPatterns,
      PolicyEffect.ALLOW,
      serverMap,
    );

    const policy = await tx.policy.create({
      data: {
        organizationId,
        slug,
        matchers,
        toolPatterns,
        effect: PolicyEffect.ALLOW,
        description,
        enabled: true,
        ...(conditions && conditions.length > 0 ? { conditions: toJsonValue(conditions) } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    return tx.permissionRequest.update({
      where: { id: request.id },
      data: { ...approvalData, status: finalStatus, linkedPolicyId: policy.id },
    });
  });

  await logAdminAction({
    organizationId,
    adminUserId,
    actionType: AdminActionType.PERMISSION_REQUEST_APPROVE,
    resourceType: AdminResourceType.PERMISSION_REQUEST,
    resourceId: request.id,
    resourceName: `Tool Access Request from ${request.user.email}`,
    actionDetails: {
      actionDisplayName: getActionDisplayName(AdminActionType.PERMISSION_REQUEST_APPROVE),
      requestId: request.id,
      userId: request.userId,
      userEmail: request.user.email,
      type: request.type,
      requestedToolNames: request.toolNames,
      grantedMatchers: matchers,
      grantedToolPatterns: toolPatterns,
      policiesCreated: 1,
      reviewNote: approvalData.reviewNote,
      customGrant: true,
      workspaceId: workspaceId ?? null,
    },
    beforeSnapshot,
    afterSnapshot: createAfterSnapshot(updated),
    reason: approvalData.reviewNote,
    ...requestMeta,
  });

  return updated;
}

/**
 * Approve with default behavior (one policy per tool for requesting user)
 */
async function approveDefaultToolAccess(
  organizationId: string,
  adminUserId: string,
  request: RequestWithUserEmail,
  serverMap: Map<string, string>,
  approvalData: ApprovalData,
  beforeSnapshot: Prisma.InputJsonObject,
  requestMeta: RequestMeta,
): Promise<PermissionRequest> {
  const validation = await validateToolNamesForOrganization(organizationId, request.toolNames);
  const errorMessage = getToolValidationErrorMessage(validation);
  if (errorMessage) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: errorMessage });
  }

  const matcher = `user:${request.user.email}`;
  const toolNames = validation.toolNames;
  const toolPatternsCreated: string[] = [];

  const updated = await prisma.$transaction(async (tx) => {
    // Find existing tool patterns already covered
    const existingPolicies = await tx.policy.findMany({
      where: { organizationId, matchers: { has: matcher }, effect: PolicyEffect.ALLOW },
      select: { toolPatterns: true },
    });
    const coveredPatterns = new Set(
      existingPolicies.flatMap((p) => p.toolPatterns).filter((tp) => toolNames.includes(tp)),
    );

    // Get existing slugs for collision detection
    const existingSlugs = new Set(
      (await tx.policy.findMany({ where: { organizationId }, select: { slug: true } })).map(
        (p) => p.slug,
      ),
    );

    const policiesToCreate = toolNames
      .filter((toolName) => !coveredPatterns.has(toolName))
      .map((toolName) => {
        const slug = generatePolicySlug([matcher], [toolName], PolicyEffect.ALLOW, existingSlugs);
        existingSlugs.add(slug);

        const parts = toolName.split('::');
        let mcpServerNameMap: Map<string, string> | undefined;
        if (parts.length === 2) {
          const domain = parts[0].toLowerCase();
          const mcpServerName = serverMap.get(domain);
          if (mcpServerName) {
            mcpServerNameMap = new Map([[domain, mcpServerName]]);
          }
        }

        const description = generatePolicyDescription(
          [matcher],
          [toolName],
          PolicyEffect.ALLOW,
          mcpServerNameMap,
        );

        return {
          organizationId,
          slug,
          matchers: [matcher],
          toolPatterns: [toolName],
          effect: PolicyEffect.ALLOW,
          description,
          enabled: true,
        };
      });

    toolPatternsCreated.push(...policiesToCreate.map((p) => p.toolPatterns[0]));

    if (policiesToCreate.length > 0) {
      await tx.policy.createMany({ data: policiesToCreate });
    }

    return tx.permissionRequest.update({ where: { id: request.id }, data: approvalData });
  });

  // Fetch created policies for logging and linking
  const createdPolicies =
    toolPatternsCreated.length > 0
      ? await prisma.policy.findMany({
          where: {
            organizationId,
            matchers: { has: matcher },
            toolPatterns: { hasSome: toolPatternsCreated },
          },
        })
      : [];

  // Link the first created policy to the request
  if (createdPolicies.length > 0) {
    await prisma.permissionRequest.update({
      where: { id: request.id },
      data: { linkedPolicyId: createdPolicies[0].id },
    });
  }

  // Log request approval
  await logAdminAction({
    organizationId,
    adminUserId,
    actionType: AdminActionType.PERMISSION_REQUEST_APPROVE,
    resourceType: AdminResourceType.PERMISSION_REQUEST,
    resourceId: request.id,
    resourceName: `Request from ${request.user.email}`,
    actionDetails: {
      actionDisplayName: getActionDisplayName(AdminActionType.PERMISSION_REQUEST_APPROVE),
      requestId: request.id,
      userId: request.userId,
      userEmail: request.user.email,
      toolNames: request.toolNames,
      policiesCreated: createdPolicies.length,
      policyIds: createdPolicies.map((p) => p.id),
      reviewNote: approvalData.reviewNote,
    },
    beforeSnapshot,
    afterSnapshot: createAfterSnapshot(updated),
    reason: approvalData.reviewNote,
    ...requestMeta,
  });

  // Log each policy creation
  for (const policy of createdPolicies) {
    await logAdminAction({
      organizationId,
      adminUserId,
      actionType: AdminActionType.POLICY_CREATE,
      resourceType: AdminResourceType.POLICY,
      resourceId: policy.id,
      resourceName: policy.slug,
      actionDetails: {
        actionDisplayName: getActionDisplayName(AdminActionType.POLICY_CREATE),
        slug: policy.slug,
        matchers: policy.matchers,
        toolPatterns: policy.toolPatterns,
        effect: policy.effect,
        description: policy.description,
        enabled: policy.enabled,
        createdViaPermissionRequest: true,
        permissionRequestId: request.id,
        userEmail: request.user.email,
      },
      afterSnapshot: {
        id: policy.id,
        slug: policy.slug,
        matchers: policy.matchers,
        toolPatterns: policy.toolPatterns,
        effect: policy.effect,
        description: policy.description,
        enabled: policy.enabled,
        organizationId: policy.organizationId,
      },
      reason: `Created automatically when approving permission request from ${request.user.email}`,
      ...requestMeta,
    });
  }

  return updated;
}
