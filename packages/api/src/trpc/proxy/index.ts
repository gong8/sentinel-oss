/**
 * Proxy Router
 * Provides endpoints for the MCP proxy server to evaluate policies,
 * log audit entries, lookup MCP servers, and retrieve user credentials
 */

import { AgentCardSchema, agentCardToPrismaJson } from '@sentinel/a2a';
import { AuditDecision, prisma, WebhookEvent } from '@sentinel/db';
import { z } from 'zod';
import { getToolFriendlyNames } from '../../lib/adminActionLabels.js';
import {
  isPlainObject,
  jsonValueSchema,
  toJsonValue,
  type JsonValue,
} from '../../lib/jsonValue.js';
import { logger } from '../../lib/logger.js';
import {
  createAdminMcpConfirmation,
  getConfirmationStatus,
} from '../../services/adminMcpConfirmation.js';
import {
  getAdminMcpSettings,
  isAdminAllowed,
  isScopeEnabled,
} from '../../services/adminMcpSettings.js';
import { validateAdminMcpInput } from '../../services/adminMcpValidation.js';
import { logToolInvocation } from '../../services/audit.js';
import { findMcpServerByToolName } from '../../services/mcp.js';
import {
  refreshAccessToken,
  refreshOrgAccessToken,
  refreshWorkspaceAccessToken,
} from '../../services/oauth.js';
import { isUserOrgOwner } from '../../services/orgOwner.js';
import type { PolicyEvaluationResult } from '../../services/policy.js';
import { checkMatcher, checkToolPattern, evaluatePolicyWithTree } from '../../services/policy.js';
import type { ConditionEvaluationContext } from '../../services/policyCondition.js';
import {
  evaluateSensitiveFlags,
  getApprovalStatusInstant,
  pollApprovalStatus,
} from '../../services/sensitiveFlag.js';
import {
  getOrCreateSession,
  incrementToolCallCount,
  isSessionTerminated,
} from '../../services/session.js';
import { sendWebhook } from '../../services/webhook.js';
import { isSelfOperation, isWriteTool, TOOL_TO_SCOPE } from '../../types/adminMcp.js';
import { proxyProcedure, router } from '../init.js';

// Schema for parameters - must be a JSON-compatible object with size limit
const parametersSchema = z
  .record(z.string(), jsonValueSchema)
  .refine((val) => JSON.stringify(val).length < 100000, {
    message: 'Parameters payload too large',
  });

// Schema for policy snapshot - array of policy objects or undefined
const policySnapshotSchema = z.array(z.record(z.string(), jsonValueSchema)).optional();

// Re-export JsonValue for backward compatibility
export type { JsonValue };

// Common user include pattern with roles and workspace memberships
// Workspace memberships are required for workspace-scoped policy matchers
const userWithRolesAndWorkspacesInclude = {
  userRoles: {
    include: {
      role: true,
    },
  },
  workspaceMemberships: {
    select: {
      workspaceId: true,
      role: true,
    },
  },
} as const;

// Empty credentials response for when user or server not found
function emptyCredentialsResponse() {
  return {
    authType: 'NONE' as const,
    user: {
      apiKey: null,
      credentials: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
    workspace: {
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
    organization: {
      apiKey: null,
      credentials: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
  };
}

// Convert optional value to null for consistent API responses
function toNullable<T>(value: T | undefined | null): T | null {
  return value ?? null;
}

// Common input schema for organization + agent lookups
const orgAgentInput = z.object({
  organizationId: z.string().cuid(),
  agentId: z.string().cuid(),
});

// Build well-known agent card URL from base URL
function buildWellKnownUrl(baseUrl: string): string {
  if (baseUrl.includes('/.well-known/agent-card.json')) {
    return baseUrl;
  }
  return new URL('/.well-known/agent-card.json', baseUrl).toString();
}

export const proxyRouter = router({
  /**
   * Evaluate policy for a tool invocation
   * Returns ALLOWED or DENIED decision with justification and policy IDs
   *
   * Delegation: When delegatedUserId is provided, both the agent AND the delegated
   * user must have permission (AND logic). This is used when an MCP agent calls
   * an A2A agent on behalf of a user.
   */
  evaluatePolicy: proxyProcedure
    .input(
      z.object({
        userId: z.string().cuid(),
        agentId: z.string().cuid().nullable().optional(),
        /** User ID the agent is acting on behalf of (for delegation) */
        delegatedUserId: z.string().cuid().nullable().optional(),
        /** Workspace ID for workspace-scoped policy filtering */
        workspaceId: z.string().cuid().optional(),
        toolName: z.string().max(500),
        parameters: z
          .record(z.string(), z.unknown())
          .refine((val) => JSON.stringify(val).length < 100000, {
            message: 'Parameters payload too large',
          }),
        /** Session ID for policy deferral requests */
        sessionId: z.string().cuid().optional(),
        a2aContext: z
          .object({
            a2aAgentId: z.string().cuid().optional(),
            a2aProvider: z.string().optional(),
            a2aSkillId: z.string().optional(),
          })
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // 1. Get user with roles and workspace memberships (exclude soft-deleted users)
      const user = await prisma.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        include: userWithRolesAndWorkspacesInclude,
      });

      if (!user) {
        return {
          decision: 'DENIED' as const,
          justification: 'User not found',
          policyIds: [],
        };
      }

      // 2. Get agent (if specified) - with organizationId validation for defense-in-depth
      const agent = input.agentId
        ? await prisma.agent.findFirst({
            where: { id: input.agentId, organizationId: user.organizationId, deletedAt: null },
          })
        : null;

      if (input.agentId && !agent) {
        return {
          decision: 'DENIED' as const,
          justification: 'Agent not found or does not belong to user organization',
          policyIds: [],
        };
      }

      // 3. Get delegated user (if specified) - for delegation scenarios
      // Uses organizationId validation for defense-in-depth
      let delegatedUser = null;
      if (input.delegatedUserId) {
        delegatedUser = await prisma.user.findFirst({
          where: {
            id: input.delegatedUserId,
            organizationId: user.organizationId,
            deletedAt: null,
          },
          include: userWithRolesAndWorkspacesInclude,
        });

        if (!delegatedUser) {
          return {
            decision: 'DENIED' as const,
            justification: 'Delegated user not found or does not belong to user organization',
            policyIds: [],
          };
        }
      }

      // 4. Get enabled policies for user's accessible workspaces (exclude soft-deleted)
      // Only include org-wide policies (workspaceId = null) and policies from user's workspaces
      const userWorkspaceIds = user.workspaceMemberships?.map((w) => w.workspaceId) ?? [];
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: user.organizationId,
          enabled: true,
          deletedAt: null,
          OR: [
            { workspaceId: null }, // Org-wide policies
            { workspaceId: { in: userWorkspaceIds } }, // Workspace-scoped policies
          ],
        },
      });

      const mcpServer = await findMcpServerByToolName(user.organizationId, input.toolName);

      // 5. Build evaluation context for condition evaluation and tree building
      const now = new Date();
      const evaluationContext: ConditionEvaluationContext = {
        params: input.parameters as Record<string, unknown>,
        time: {
          timestamp: now,
          hourOfDay: now.getHours(),
          dayOfWeek: now.getDay(),
        },
        network: {},
      };

      // 6. Evaluate policy with tree building for audit visualization
      const treeResult = await evaluatePolicyWithTree(
        {
          user,
          agent,
          delegatedUser: delegatedUser ?? undefined,
          toolName: input.toolName,
        },
        policies,
        {
          toolName: input.toolName,
          evaluationContext,
          serverTrusted: mcpServer?.trusted,
          serverName: mcpServer?.name,
        },
      );

      const result = treeResult;

      // Find matching policies for snapshot
      const matchingPolicies = policies.filter((policy) => {
        const matchesMatcher = policy.matchers.some((m) => checkMatcher(m, user, agent));
        const matchesTool = policy.toolPatterns.some((tp) => checkToolPattern(tp, input.toolName));
        return matchesMatcher && matchesTool;
      });

      // Create policy snapshot
      const policySnapshot = policies.map((p) => ({
        id: p.id,
        slug: p.slug,
        matchers: p.matchers,
        toolPatterns: p.toolPatterns,
        effect: p.effect,
        description: p.description,
        enabled: p.enabled,
      }));

      // Override result if MCP server is untrusted
      const finalResult: PolicyEvaluationResult =
        mcpServer && !mcpServer.trusted
          ? {
              decision: 'DENIED',
              justification: `MCP server "${mcpServer.name}" is untrusted`,
              policyIds: [],
            }
          : result;

      return {
        decision: finalResult.decision,
        justification: toNullable(finalResult.justification),
        policyIds: finalResult.policyIds,
        matchedPolicyIds: matchingPolicies.map((p) => p.id),
        policySnapshot,
        userEmail: user.email,
        userRoles: user.userRoles.map((ur) => ur.role.name),
        agentName: toNullable(agent?.name),
        approvalRequestId: toNullable(finalResult.approvalRequestId),
        evaluationTree: treeResult.evaluationTree,
      };
    }),

  /**
   * Log an audit entry for a tool invocation
   * Never throws - failures are logged but don't block operations
   */
  logAuditEntry: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        userId: z.string().cuid().nullable().optional(),
        agentId: z.string().cuid().nullable().optional(),
        workspaceId: z.string().cuid().nullable().optional(),
        toolName: z.string().max(500),
        parameters: parametersSchema,
        decision: z.nativeEnum(AuditDecision),
        justification: z.string().max(2000).nullable().optional(),
        policyIds: z.array(z.string().cuid()).max(100),
        matchedPolicyIds: z.array(z.string().cuid()).max(100).optional(),
        policySnapshot: policySnapshotSchema,
        userEmail: z.string().max(320).nullable().optional(),
        userRoles: z.array(z.string().max(255)).max(50).optional(),
        agentName: z.string().max(255).nullable().optional(),
        // Live approval tracking
        approvalRequired: z.boolean().optional(),
        approvalRequestId: z.string().cuid().nullable().optional(),
        approvalStatus: z.string().nullable().optional(),
        approvalDecidedBy: z.string().cuid().nullable().optional(),
        approvalDecidedByEmail: z.string().nullable().optional(),
        approvalDecidedAt: z.string().nullable().optional(), // ISO string from MCP server
        // Pipeline and Evaluation Tree (for audit visualization)
        pipelineStage: z.string().nullable().optional(),
        interruptedAt: z.string().nullable().optional(),
        interruptionReason: z.string().max(2000).nullable().optional(),
        trustCheckPassed: z.boolean().nullable().optional(),
        serverTrusted: z.boolean().nullable().optional(),
        policyCheckPassed: z.boolean().nullable().optional(),
        flagCheckPassed: z.boolean().nullable().optional(),
        matchedFlagIds: z.array(z.string()).optional(),
        flagBehaviors: z.array(z.string()).optional(),
        rateLimitHit: z.boolean().nullable().optional(),
        evaluationTree: jsonValueSchema.nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Validate workspace access if workspaceId is provided
      // If the user doesn't have access to the workspace, default to null (org-level audit)
      let validatedWorkspaceId = input.workspaceId;
      if (input.workspaceId && input.userId) {
        const userWorkspaceMembership = await prisma.workspaceMember.findFirst({
          where: {
            userId: input.userId,
            workspaceId: input.workspaceId,
            workspace: {
              organizationId: input.organizationId,
              deletedAt: null,
            },
          },
          select: { workspaceId: true },
        });

        // If user doesn't have access to the workspace, log at org level instead
        if (!userWorkspaceMembership) {
          validatedWorkspaceId = null;
        }
      }
      // Always return success - audit logging failures should not block operations (fail-open)
      // Data is validated by Zod schemas above to be JSON-compatible
      await logToolInvocation({
        organizationId: input.organizationId,
        userId: input.userId || null,
        agentId: input.agentId || null,
        workspaceId: validatedWorkspaceId || null,
        toolName: input.toolName,
        parameters: input.parameters,
        decision: input.decision,
        justification: input.justification || null,
        policyIds: input.policyIds,
        matchedPolicyIds: input.matchedPolicyIds,
        policySnapshot: input.policySnapshot,
        userEmail: input.userEmail,
        userRoles: input.userRoles,
        agentName: input.agentName,
        // Live approval tracking
        approvalRequired: input.approvalRequired,
        approvalRequestId: input.approvalRequestId,
        approvalStatus: input.approvalStatus,
        approvalDecidedBy: input.approvalDecidedBy,
        approvalDecidedByEmail: input.approvalDecidedByEmail,
        approvalDecidedAt: input.approvalDecidedAt ? new Date(input.approvalDecidedAt) : null,
        // Pipeline and Evaluation Tree
        pipelineStage: input.pipelineStage,
        interruptedAt: input.interruptedAt,
        interruptionReason: input.interruptionReason,
        trustCheckPassed: input.trustCheckPassed,
        serverTrusted: input.serverTrusted,
        policyCheckPassed: input.policyCheckPassed,
        flagCheckPassed: input.flagCheckPassed,
        matchedFlagIds: input.matchedFlagIds,
        flagBehaviors: input.flagBehaviors,
        rateLimitHit: input.rateLimitHit,
        evaluationTree: input.evaluationTree,
      });

      // Send webhook for tool invocation events (fire-and-forget, don't block on failures)
      const webhookEvent =
        input.decision === AuditDecision.ALLOWED
          ? WebhookEvent.TOOL_INVOCATION_ALLOWED
          : WebhookEvent.TOOL_INVOCATION_DENIED;

      // Get friendly tool name for webhook display
      const servers = await prisma.mcpServer.findMany({
        where: { organizationId: input.organizationId, deletedAt: null },
        select: { name: true, url: true },
      });
      const { toolFriendlyName } = getToolFriendlyNames(input.toolName, servers);

      // Don't await - webhooks should not block audit logging
      sendWebhook(
        input.organizationId,
        webhookEvent,
        {
          toolName: input.toolName,
          toolFriendlyName,
          userId: input.userId,
          agentId: input.agentId,
          userEmail: input.userEmail,
          agentName: input.agentName,
          decision: input.decision,
          justification: input.justification,
          policyIds: input.policyIds,
        },
        validatedWorkspaceId,
        {
          organizationId: input.organizationId,
        },
      ).catch(() => {
        // Silently ignore webhook failures - they're logged internally
      });

      // Always return success - logToolInvocation swallows errors internally
      return { success: true };
    }),

  /**
   * Look up MCP server by domain
   * Returns server info or null if not found
   */
  getMcpServer: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        domain: z.string(),
        port: z.string().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      // Build URL pattern to match
      // We need to find servers whose URL contains the domain (and port if specified)
      const domainWithPort = input.port ? `${input.domain}:${input.port}` : input.domain;

      // Find server by URL containing the domain
      const server = await prisma.mcpServer.findFirst({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
          url: {
            contains: domainWithPort,
          },
        },
      });

      if (!server) {
        return null;
      }

      return {
        id: server.id,
        name: server.name,
        url: server.url,
        trusted: server.trusted,
        authType: server.authType,
      };
    }),

  /**
   * Retrieve and decrypt user credentials for an MCP server
   * Credentials are decrypted server-side only for security
   */
  getUserCredentials: proxyProcedure
    .input(
      z.object({
        userId: z.string().cuid(),
        mcpServerId: z.string().cuid(),
      }),
    )
    .query(async ({ input }) => {
      // Get user with their workspace memberships
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          organizationId: true,
          workspaceMemberships: {
            select: { workspaceId: true },
          },
        },
      });

      if (!user) {
        return emptyCredentialsResponse();
      }

      const mcpServer = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: {
          authType: true,
          apiKey: true,
          credentials: true,
        },
      });

      if (!mcpServer) {
        return emptyCredentialsResponse();
      }

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: input.userId,
            mcpServerId: input.mcpServerId,
          },
        },
        select: {
          apiKey: true,
          credentials: true,
          accessToken: true,
          refreshToken: true,
          tokenExpiresAt: true,
        },
      });

      const isApiKey = mcpServer.authType === 'API_KEY';
      const isOAuth = mcpServer.authType === 'OAUTH';

      // Get workspace IDs for the user
      const workspaceIds = user.workspaceMemberships.map((m) => m.workspaceId);

      // Workspace-level OAuth tokens (shared within workspace)
      // Find the first workspace OAuth token for any workspace the user belongs to
      const workspaceOAuthToken =
        isOAuth && workspaceIds.length > 0
          ? await prisma.workspaceMcpOAuthToken.findFirst({
              where: {
                mcpServerId: input.mcpServerId,
                workspaceId: { in: workspaceIds },
              },
              select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
            })
          : null;

      // Org-level OAuth tokens (fallback when user doesn't have personal OAuth)
      // Defense-in-depth: validate the org token belongs to the user's organization
      const orgOAuthToken = isOAuth
        ? await prisma.orgMcpOAuthToken.findFirst({
            where: {
              mcpServerId: input.mcpServerId,
              organizationId: user.organizationId,
            },
            select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
          })
        : null;

      return {
        authType: mcpServer.authType,
        user: {
          apiKey: config && isApiKey ? toNullable(config.apiKey) : null,
          credentials: config && typeof config.credentials === 'string' ? config.credentials : null,
          accessToken: config && isOAuth ? toNullable(config.accessToken) : null,
          refreshToken: config && isOAuth ? toNullable(config.refreshToken) : null,
          tokenExpiresAt:
            config && isOAuth ? toNullable(config.tokenExpiresAt?.toISOString()) : null,
        },
        workspace: {
          accessToken: toNullable(workspaceOAuthToken?.accessToken),
          refreshToken: toNullable(workspaceOAuthToken?.refreshToken),
          tokenExpiresAt: toNullable(workspaceOAuthToken?.tokenExpiresAt?.toISOString()),
        },
        organization: {
          apiKey: isApiKey ? toNullable(mcpServer.apiKey) : null,
          credentials: typeof mcpServer.credentials === 'string' ? mcpServer.credentials : null,
          accessToken: toNullable(orgOAuthToken?.accessToken),
          refreshToken: toNullable(orgOAuthToken?.refreshToken),
          tokenExpiresAt: toNullable(orgOAuthToken?.tokenExpiresAt?.toISOString()),
        },
      };
    }),

  /**
   * Get all MCP servers for an organization
   * Used by proxy to list available tools
   */
  listMcpServers: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
      }),
    )
    .query(async ({ input }) => {
      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          url: true,
          trusted: true,
          authType: true,
        },
      });

      return servers;
    }),

  /**
   * Refresh OAuth tokens on-demand (called when upstream returns 403)
   * Attempts refresh in order: user -> workspace -> org
   * Returns success if refresh worked, throws if user must re-authenticate
   */
  refreshOAuthToken: proxyProcedure
    .input(
      z.object({
        userId: z.string().cuid(),
        mcpServerId: z.string().cuid(),
      }),
    )
    .mutation(async ({ input }) => {
      // Get user with workspace memberships
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          organizationId: true,
          workspaceMemberships: {
            select: { workspaceId: true },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Check if user has personal OAuth tokens
      const userConfig = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: input.userId,
            mcpServerId: input.mcpServerId,
          },
        },
        select: {
          refreshToken: true,
        },
      });

      // Try user-level refresh first if user has a refresh token
      if (userConfig?.refreshToken) {
        await refreshAccessToken(user.organizationId, input.userId, input.mcpServerId);
        return { success: true, level: 'user' as const };
      }

      // Try workspace-level refresh if user belongs to a workspace with OAuth tokens
      const workspaceIds = user.workspaceMemberships.map((m) => m.workspaceId);
      if (workspaceIds.length > 0) {
        const workspaceToken = await prisma.workspaceMcpOAuthToken.findFirst({
          where: {
            mcpServerId: input.mcpServerId,
            workspaceId: { in: workspaceIds },
            refreshToken: { not: null },
          },
          select: { workspaceId: true, refreshToken: true },
        });

        if (workspaceToken?.refreshToken) {
          await refreshWorkspaceAccessToken(workspaceToken.workspaceId, input.mcpServerId);
          return { success: true, level: 'workspace' as const };
        }
      }

      // Fall back to org-level refresh
      const orgToken = await prisma.orgMcpOAuthToken.findUnique({
        where: { mcpServerId: input.mcpServerId },
        select: { refreshToken: true, organizationId: true },
      });

      if (orgToken?.refreshToken && orgToken.organizationId === user.organizationId) {
        await refreshOrgAccessToken(user.organizationId, input.mcpServerId);
        return { success: true, level: 'organization' as const };
      }

      // No refresh token available at any level
      throw new Error('No refresh token available - user must re-authenticate');
    }),

  /**
   * Evaluate sensitive flags for a tool invocation (called AFTER policy passes)
   * Returns whether to proceed or block, with optional approval request ID
   */
  evaluateSensitiveFlags: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        sessionId: z.string().cuid(),
        userId: z.string().cuid(),
        agentId: z.string().cuid().nullable().optional(),
        /** Workspace ID for workspace-scoped flag filtering */
        workspaceId: z.string().cuid().nullable().optional(),
        toolName: z.string().max(500),
        parameters: z
          .record(z.string(), z.unknown())
          .refine((val) => JSON.stringify(val).length < 100000, {
            message: 'Parameters payload too large',
          }),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await evaluateSensitiveFlags({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        userId: input.userId,
        agentId: input.agentId || undefined,
        workspaceId: input.workspaceId,
        toolName: input.toolName,
        parameters: input.parameters,
      });

      const approvalDetails = result.approvalDetails
        ? {
            approvalRequired: result.approvalDetails.approvalRequired,
            approvalRequestId: toNullable(result.approvalDetails.approvalRequestId),
            approvalStatus: toNullable(result.approvalDetails.approvalStatus),
            approvalDecidedBy: toNullable(result.approvalDetails.approvalDecidedBy),
            approvalDecidedByEmail: toNullable(result.approvalDetails.approvalDecidedByEmail),
            approvalDecidedAt: toNullable(result.approvalDetails.approvalDecidedAt?.toISOString()),
          }
        : null;

      return {
        proceed: result.proceed,
        blockReason: toNullable(result.blockReason),
        approvalRequestId: toNullable(result.approvalRequestId),
        enhancedAuditData: toNullable(result.enhancedAuditData),
        matchedFlagIds: toNullable(result.matchedFlagIds),
        alertsSent: toNullable(result.alertsSent),
        approvalDetails,
        shouldPoll: result.shouldPoll ?? false,
        approvalExpiresAt: toNullable(result.approvalExpiresAt),
        approvalRemainingMs: toNullable(result.approvalRemainingMs),
      };
    }),

  /**
   * Check approval status instantly (no waiting)
   * Use for quick status checks when agent wants immediate response
   */
  checkApprovalStatus: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        requestId: z.string().cuid(),
      }),
    )
    .query(async ({ input }) => {
      return getApprovalStatusInstant(input.organizationId, input.requestId);
    }),

  /**
   * Poll for approval status with short timeout
   * Returns PENDING with shouldPoll=true if still waiting (agent should call again)
   * Returns final status (APPROVED/DENIED/EXPIRED/CANCELLED) when decision is made
   *
   * This is the preferred method for agents to wait for approval:
   * 1. Call evaluateSensitiveFlags - gets approvalRequestId if approval needed
   * 2. Loop: call pollApprovalStatus until shouldPoll=false
   * 3. Check status and proceed accordingly
   *
   * Each poll waits up to pollTimeoutMs (default 30s) before returning PENDING
   * This avoids long-lived HTTP connections that can timeout at various layers
   */
  pollApprovalStatus: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        requestId: z.string().cuid(),
        /** Max time to wait in this request before returning PENDING (default 30s, max 60s) */
        pollTimeoutMs: z.number().min(1000).max(60000).optional().default(30000),
      }),
    )
    .mutation(async ({ input }) => {
      return pollApprovalStatus(input.organizationId, input.requestId, input.pollTimeoutMs);
    }),

  /**
   * Check if an agent is verified (for MCP proxy to block unverified agents)
   * Returns verified status and reason if not verified
   */
  checkAgentVerification: proxyProcedure.input(orgAgentInput).query(async ({ input }) => {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input.agentId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      select: {
        signatureVerified: true,
        signatureVerifiedAt: true,
        publicKeyCachedAt: true,
        publicKeyUrl: true,
      },
    });

    if (!agent) {
      return { verified: false, reason: 'Agent not found' };
    }

    // If no JWKS URL configured, agent doesn't require verification
    if (!agent.publicKeyUrl) {
      return { verified: true, reason: null };
    }

    // Check if cache is expired (1 hour TTL)
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    const cacheExpired = agent.publicKeyCachedAt
      ? Date.now() - agent.publicKeyCachedAt.getTime() > JWKS_CACHE_TTL_MS
      : true;

    if (!agent.signatureVerified) {
      return { verified: false, reason: 'Agent signature not verified' };
    }

    if (cacheExpired) {
      return { verified: false, reason: 'Verification cache expired' };
    }

    return { verified: true, reason: null };
  }),

  // ============================================================================
  // A2A PROXY ENDPOINTS
  // ============================================================================

  /**
   * Get an A2A agent with card cache for proxying
   */
  getA2AAgent: proxyProcedure.input(orgAgentInput).query(async ({ input }) => {
    return prisma.agent.findFirst({
      where: {
        id: input.agentId,
        organizationId: input.organizationId,
        protocolType: 'A2A',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        endpointUrl: true,
        agentCardCache: true,
        agentCardFetchedAt: true,
        cardSource: true,
        agentCardUrl: true,
        workspaceId: true,
      },
    });
  }),

  /**
   * Get decrypted A2A credentials for injection
   */
  getA2ACredentials: proxyProcedure.input(orgAgentInput).query(async ({ input }) => {
    // Note: credentials are still encrypted - proxy will decrypt
    return prisma.a2ACredential.findFirst({
      where: {
        agentId: input.agentId,
        organizationId: input.organizationId,
      },
      select: {
        authType: true,
        credentials: true,
      },
    });
  }),

  /**
   * Log an A2A audit entry
   */
  logA2AAuditEntry: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        agentId: z.string().cuid(),
        skillId: z.string().max(500).optional(),
        userId: z.string().cuid().optional(),
        workspaceId: z.string().cuid().optional(),
        request: z.unknown().refine((val) => JSON.stringify(val).length < 100000, {
          message: 'Request payload too large',
        }),
        response: z
          .unknown()
          .refine((val) => JSON.stringify(val).length < 100000, {
            message: 'Response payload too large',
          })
          .optional(),
        durationMs: z.number().min(0).max(3600000),
        success: z.boolean(),
        error: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Fetch agent name for audit log
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { name: true },
      });

      // Log to console for debugging
      logger.info('[A2A Audit]', {
        organizationId: input.organizationId,
        agentId: input.agentId,
        skillId: input.skillId,
        userId: input.userId,
        durationMs: input.durationMs,
        success: input.success,
        error: input.error,
        timestamp: new Date().toISOString(),
      });

      // Persist to database using the audit service
      await logToolInvocation({
        organizationId: input.organizationId,
        agentId: input.agentId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        toolName: input.skillId ? `a2a::${input.skillId}` : 'a2a::invoke',
        toolNameDisplay: input.skillId ? `A2A::${input.skillId}` : 'A2A::invoke',
        parameters: toJsonValue(input.request) ?? {},
        decision: input.success ? AuditDecision.ALLOWED : AuditDecision.DENIED,
        justification: input.error,
        policyIds: [],
        agentName: agent?.name,
        pipelineStage: 'EXECUTE',
        evaluationTree: toJsonValue({
          type: 'a2a_invocation',
          durationMs: input.durationMs,
          response: input.response,
        }),
      });

      return { success: true };
    }),

  /**
   * Refresh A2A agent card if stale (called by proxy when card is > 1 hour old)
   */
  refreshA2AAgentCard: proxyProcedure.input(orgAgentInput).mutation(async ({ input }) => {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input.agentId,
        organizationId: input.organizationId,
        protocolType: 'A2A',
        deletedAt: null,
      },
      select: {
        id: true,
        cardSource: true,
        agentCardUrl: true,
      },
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Only auto-refresh for URL mode
    if (agent.cardSource !== 'URL' || !agent.agentCardUrl) {
      return { success: false, error: 'Agent not in URL mode' };
    }

    try {
      const response = await fetch(buildWellKnownUrl(agent.agentCardUrl), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const cardJson: unknown = await response.json();

      // Validate the fetched card against schema
      const cardResult = AgentCardSchema.safeParse(cardJson);
      if (!cardResult.success) {
        return { success: false, error: 'Invalid agent card format' };
      }

      const card = cardResult.data;

      // Compute hash
      const crypto = await import('crypto');
      const normalized = JSON.stringify(card, Object.keys(card).sort());
      const hash = crypto.createHash('sha256').update(normalized).digest('hex');

      await prisma.agent.update({
        where: { id: input.agentId },
        data: {
          endpointUrl: card.url,
          agentCardCache: toJsonValue(agentCardToPrismaJson(card)),
          agentCardFetchedAt: new Date(),
          agentCardHash: hash,
        },
      });

      return { success: true, card };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh card',
      };
    }
  }),

  // ============================================================================
  // SESSION MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * Get or create a session for context tracking
   * Sessions track tool invocations and context for policy evaluation
   */
  getOrCreateSession: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        externalSessionId: z.string(),
        userId: z.string().cuid().optional(),
        agentId: z.string().cuid().nullable().optional(),
        workspaceId: z.string().cuid().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await getOrCreateSession(
          {
            organizationId: input.organizationId,
            externalSessionId: input.externalSessionId,
            userId: input.userId,
            agentId: input.agentId,
          },
          input.workspaceId,
        );
        return {
          success: true,
          sessionId: result.id,
          isNew: result.isNew,
        };
      } catch (error) {
        logger.error('Failed to get or create session:', error);
        return {
          success: false,
          sessionId: null,
          isNew: false,
        };
      }
    }),

  /**
   * Increment tool call count for a session
   * Called after each tool invocation for tracking
   */
  incrementToolCallCount: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        externalSessionId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        await incrementToolCallCount(input.organizationId, input.externalSessionId);
        return { success: true };
      } catch (error) {
        logger.error('Failed to increment tool call count:', error);
        return { success: false };
      }
    }),

  /**
   * Check if a session has been terminated by an admin
   * MCP proxy should call this before processing tool requests
   * Returns terminated status - if true, proxy should reject the request
   */
  checkSessionStatus: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        externalSessionId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const terminated = await isSessionTerminated(input.organizationId, input.externalSessionId);
        return {
          terminated,
          reason: terminated ? 'Session has been terminated by an administrator' : null,
        };
      } catch (error) {
        logger.error('Failed to check session status:', error);
        // Fail open - don't block requests if we can't check status
        return { terminated: false, reason: null };
      }
    }),

  /**
   * Track parameter values for UI suggestions in condition builder
   * Called after successful tool execution (fire-and-forget)
   * Values are shared across all tools on the same MCP server by parameter key.
   * If response is provided, extracts human-readable labels for ID parameters
   */
  trackParamValues: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        /** MCP server ID - values are shared across all tools on this server */
        serverId: z.string().cuid(),
        /** Tool name for reference/auditing (optional) */
        toolName: z.string().max(500).optional(),
        parameters: parametersSchema,
        /** Optional response from the tool - used to extract human-readable labels */
        response: z
          .unknown()
          .refine((val) => JSON.stringify(val).length < 100000, {
            message: 'Response payload too large',
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { trackParamValues } = await import('../../services/toolParamHistory.js');
        await trackParamValues({
          organizationId: input.organizationId,
          serverId: input.serverId,
          toolName: input.toolName,
          parameters: input.parameters,
          response: input.response,
        });
        return { success: true };
      } catch (error) {
        logger.error('Failed to track param values:', error);
        return { success: false };
      }
    }),

  // ============================================================================
  // ADMIN MCP PROXY ENDPOINTS
  // ============================================================================

  /**
   * Validate Admin MCP access for a session
   * Called when MCP client connects to the Admin MCP Server
   * Returns enabled scopes and settings
   */
  validateAdminMcpAccess: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        adminUserId: z.string().cuid(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const settings = await getAdminMcpSettings(input.organizationId);

        if (!settings.enabled) {
          return {
            accessible: false,
            reason: 'Admin MCP is not enabled for this organization',
            enabledScopes: [],
          };
        }

        if (!isAdminAllowed(settings, input.adminUserId)) {
          return {
            accessible: false,
            reason: 'Admin is not in the allowed admins list',
            enabledScopes: [],
          };
        }

        if (settings.enabledScopes.length === 0) {
          return {
            accessible: false,
            reason: 'No scopes are enabled for admin MCP',
            enabledScopes: [],
          };
        }

        return {
          accessible: true,
          reason: null,
          enabledScopes: settings.enabledScopes,
          rateLimitPerMin: settings.rateLimitPerMin,
          confirmationTtlSeconds: settings.confirmationTtlSeconds,
        };
      } catch (error) {
        logger.error('Failed to validate admin MCP access:', error);
        return {
          accessible: false,
          reason: 'Failed to validate access',
          enabledScopes: [],
        };
      }
    }),

  /**
   * Create a confirmation for an admin MCP write operation
   * Returns confirmation ID and description for the admin to review
   */
  createAdminMcpConfirmation: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        mcpSessionId: z.string().max(500),
        adminUserId: z.string().cuid(),
        toolName: z.string().max(500),
        toolInput: z.unknown().refine((val) => JSON.stringify(val).length < 50000, {
          message: 'Tool input too large',
        }),
        workspaceId: z.string().cuid().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Validate that adminUserId belongs to the organizationId
      const admin = await prisma.user.findFirst({
        where: {
          id: input.adminUserId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!admin) {
        return {
          success: false,
          error: 'Admin user not found or does not belong to this organization',
        };
      }

      // Check if admin is an org owner (org owners have access to all workspaces)
      const isOrgOwner = await isUserOrgOwner(input.organizationId, input.adminUserId);

      // Validate workspace access if a workspaceId is specified
      // Org owners have access to all workspaces
      if (input.workspaceId && !isOrgOwner) {
        const membership = await prisma.workspaceMember.findFirst({
          where: {
            userId: input.adminUserId,
            workspaceId: input.workspaceId,
            workspace: {
              organizationId: input.organizationId,
              deletedAt: null,
            },
          },
        });

        if (!membership) {
          return {
            success: false,
            error: `Access denied: You do not have access to workspace ${input.workspaceId}`,
          };
        }
      }

      // Get settings
      const settings = await getAdminMcpSettings(input.organizationId);

      // Determine scope for this tool
      const scope = TOOL_TO_SCOPE[input.toolName];
      if (!scope) {
        return {
          success: false,
          error: `Unknown tool: ${input.toolName}`,
        };
      }

      // Check if scope is enabled
      if (!isScopeEnabled(settings, scope)) {
        return {
          success: false,
          error: `Scope ${scope} is not enabled`,
        };
      }

      // Check for self-operations (e.g., admin trying to delete themselves)
      const toolInput: Record<string, unknown> = isPlainObject(input.toolInput)
        ? input.toolInput
        : {};
      if (isSelfOperation(input.toolName, input.adminUserId, toolInput)) {
        return {
          success: false,
          error: 'Self-operations are not allowed through Admin MCP',
        };
      }

      // Pre-validate business rules before creating confirmation
      // This catches errors like duplicate slugs BEFORE the admin approves
      const validation = await validateAdminMcpInput(
        input.organizationId,
        input.toolName,
        input.toolInput,
      );
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error ?? 'Validation failed',
        };
      }

      // Also validate workspaceId in tool input (e.g., admin_create_policy with explicit workspaceId)
      const inputWorkspaceId = toolInput.workspaceId;
      if (typeof inputWorkspaceId === 'string' && inputWorkspaceId && !isOrgOwner) {
        const inputMembership = await prisma.workspaceMember.findFirst({
          where: {
            userId: input.adminUserId,
            workspaceId: inputWorkspaceId,
            workspace: {
              organizationId: input.organizationId,
              deletedAt: null,
            },
          },
        });

        if (!inputMembership) {
          return {
            success: false,
            error: `Access denied: You do not have access to workspace ${inputWorkspaceId}`,
          };
        }
      }

      // For read tools, no confirmation needed
      if (!isWriteTool(input.toolName)) {
        return {
          success: true,
          requiresConfirmation: false,
        };
      }

      // Create confirmation for write operation
      const result = await createAdminMcpConfirmation({
        organizationId: input.organizationId,
        mcpSessionId: input.mcpSessionId,
        adminUserId: input.adminUserId,
        toolName: input.toolName,
        toolInput: input.toolInput,
        scope,
        workspaceId: input.workspaceId,
      });

      return {
        success: true,
        requiresConfirmation: true,
        confirmationId: result.confirmationId,
        description: result.description,
        riskLevel: result.riskLevel,
        expiresAt: result.expiresAt.toISOString(),
      };
    }),

  /**
   * Poll confirmation status (for MCP client waiting for approval)
   * Returns current status: PENDING, CONFIRMED, EXECUTED, REJECTED, EXPIRED, FAILED
   */
  pollAdminMcpConfirmation: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        confirmationId: z.string().cuid(),
      }),
    )
    .query(async ({ input }) => {
      const status = await getConfirmationStatus(input.organizationId, input.confirmationId);

      if (!status) {
        return {
          found: false,
          status: null,
          result: null,
          error: null,
        };
      }

      return {
        found: true,
        status: status.status,
        result: status.result ?? null,
        error: status.error ?? null,
      };
    }),

  /**
   * Get policies for an organization
   * Used by MCP proxy to return policies to clients
   * Filters by workspace access: only returns org-wide policies (workspaceId = null)
   * and policies from the user's workspaces
   */
  getPolicies: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        /** User's accessible workspace IDs for filtering */
        workspaceIds: z.array(z.string().cuid()).nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      // Build workspace filter condition
      // If workspaceIds provided: org-wide (null) OR user's workspaces
      // If not provided: only org-wide policies (backward compatible)
      const workspaceFilter =
        input.workspaceIds && input.workspaceIds.length > 0
          ? {
              OR: [
                { workspaceId: null }, // Org-wide policies
                { workspaceId: { in: input.workspaceIds } }, // User's workspace policies
              ],
            }
          : { workspaceId: null }; // Only org-wide if no workspaceIds provided

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: input.organizationId,
          enabled: true,
          deletedAt: null,
          ...workspaceFilter,
        },
        select: {
          id: true,
          slug: true,
          matchers: true,
          toolPatterns: true,
          effect: true,
          description: true,
          enabled: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return policies;
    }),

  /**
   * Execute a tool on an external MCP server (for Admin MCP)
   * This bypasses policy checks since it's used by admin users with full access
   */
  callMcpTool: proxyProcedure
    .input(
      z.object({
        organizationId: z.string().cuid(),
        adminUserId: z.string().cuid(),
        serverId: z.string().cuid(),
        toolName: z.string().max(500),
        toolInput: z.unknown().refine((val) => JSON.stringify(val).length < 100000, {
          message: 'Tool input payload too large',
        }),
        workspaceId: z.string().cuid().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Validate that adminUserId belongs to the organizationId
      const admin = await prisma.user.findFirst({
        where: {
          id: input.adminUserId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!admin) {
        return {
          success: false,
          error: 'Admin user not found or does not belong to this organization',
        };
      }

      const { executeMcpToolDirect } = await import('../../services/mcp.js');

      try {
        const result = await executeMcpToolDirect({
          organizationId: input.organizationId,
          userId: input.adminUserId,
          serverId: input.serverId,
          toolName: input.toolName,
          toolInput: input.toolInput as Record<string, unknown>,
          workspaceId: input.workspaceId,
        });

        return {
          success: true,
          result: result.content,
        };
      } catch (error) {
        logger.error('Error executing MCP tool:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error executing tool',
        };
      }
    }),
});
