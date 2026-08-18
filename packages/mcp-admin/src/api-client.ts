/**
 * Admin MCP API Client
 *
 * Provides functions for interacting with the Sentinel API for admin MCP operations.
 */

import { logger } from './logger.js';
import { createTrpcClient, trpc } from './trpc-client.js';
import type {
  AdminContext,
  AdminMcpAccessResult,
  ConfirmationResult,
  ConfirmationStatusResult,
} from './types.js';

// Generic result types for API calls to avoid TypeScript serialization limits
type ApiSuccess<T extends Record<string, unknown>> = { success: true } & T;
type ApiError = { success: false; error: string };
type ApiResult<T extends Record<string, unknown>> = ApiSuccess<T> | ApiError;

/**
 * Validate admin access token
 * Returns admin context if valid
 */
export async function validateAdminToken(accessToken: string): Promise<AdminContext | null> {
  try {
    const result = await trpc.auth.validateToken.mutate({ accessToken });

    if (result.valid && result.isAdmin) {
      return {
        valid: true,
        userId: result.userId,
        email: result.email,
        organizationId: result.organizationId,
        isAdmin: result.isAdmin,
        roles: result.roles || [],
        adminWorkspaceIds: result.adminWorkspaceIds || [],
      };
    }

    // Not an admin
    if (result.valid && !result.isAdmin) {
      logger.warn(`User ${result.email} is not an admin`);
    }

    return null;
  } catch (error) {
    logger.error('Error validating admin token:', error);
    return null;
  }
}

/**
 * Validate that the admin has access to Admin MCP
 * Returns enabled scopes and settings
 */
export async function validateAdminMcpAccess(
  organizationId: string,
  adminUserId: string,
): Promise<AdminMcpAccessResult> {
  try {
    const result = await trpc.proxy.validateAdminMcpAccess.query({
      organizationId,
      adminUserId,
    });

    return {
      accessible: result.accessible,
      reason: result.reason ?? null,
      enabledScopes: result.enabledScopes,
      rateLimitPerMin: 'rateLimitPerMin' in result ? result.rateLimitPerMin : undefined,
      confirmationTtlSeconds:
        'confirmationTtlSeconds' in result ? result.confirmationTtlSeconds : undefined,
    };
  } catch (error) {
    logger.error('Error validating admin MCP access:', error);
    return {
      accessible: false,
      reason: 'Failed to validate access',
      enabledScopes: [],
    };
  }
}

/**
 * Create a confirmation for an admin MCP write operation
 * Returns confirmation ID for polling
 */
export async function createConfirmation(
  organizationId: string,
  mcpSessionId: string,
  adminUserId: string,
  toolName: string,
  toolInput: unknown,
  workspaceId?: string | null,
): Promise<ConfirmationResult> {
  try {
    const result = await trpc.proxy.createAdminMcpConfirmation.mutate({
      organizationId,
      mcpSessionId,
      adminUserId,
      toolName,
      toolInput,
      workspaceId,
    });

    return {
      success: result.success,
      error: 'error' in result ? result.error : undefined,
      requiresConfirmation: 'requiresConfirmation' in result ? result.requiresConfirmation : false,
      confirmationId: 'confirmationId' in result ? result.confirmationId : undefined,
      description: 'description' in result ? result.description : undefined,
      riskLevel: 'riskLevel' in result ? result.riskLevel : undefined,
      expiresAt: 'expiresAt' in result ? result.expiresAt : undefined,
    };
  } catch (error) {
    logger.error('Error creating confirmation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Poll confirmation status
 * Returns current status: PENDING, CONFIRMED, EXECUTED, REJECTED, EXPIRED, FAILED
 */
export async function pollConfirmationStatus(
  organizationId: string,
  confirmationId: string,
): Promise<ConfirmationStatusResult> {
  try {
    const result = await trpc.proxy.pollAdminMcpConfirmation.query({
      organizationId,
      confirmationId,
    });

    return {
      found: result.found,
      status: result.status,
      result: result.result,
      error: result.error,
    };
  } catch (error) {
    logger.error('Error polling confirmation status:', error);
    return {
      found: false,
      status: null,
      result: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Wait for confirmation to be executed
 * Polls until the confirmation is executed, rejected, expired, or max timeout
 */
export async function waitForConfirmation(
  organizationId: string,
  confirmationId: string,
  maxWaitMs: number = 300000, // 5 minutes default
  pollIntervalMs: number = 2000, // 2 second poll interval
): Promise<ConfirmationStatusResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const status = await pollConfirmationStatus(organizationId, confirmationId);

    if (!status.found) {
      return status;
    }

    // Check for terminal states
    if (
      status.status === 'EXECUTED' ||
      status.status === 'REJECTED' ||
      status.status === 'EXPIRED' ||
      status.status === 'FAILED'
    ) {
      return status;
    }

    // Still pending or confirmed - wait and poll again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout reached
  return {
    found: true,
    status: 'PENDING',
    result: null,
    error:
      `Confirmation timeout after ${Math.round(maxWaitMs / 1000)} seconds. ` +
      `The operation (ID: ${confirmationId}) is still pending. ` +
      `Check /admin/mcp-confirmations or ask an admin to review.`,
  };
}

// ============================================================================
// READ TOOL API CALLS
// These are direct read operations that don't require confirmation
// All functions require accessToken for user authentication
// ============================================================================

/**
 * List policies for the organization
 */
export async function listPolicies(accessToken: string, _limit = 50, _offset = 0) {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.policies.list.query();
    return { success: true, policies: result };
  } catch (error) {
    logger.error('Error listing policies:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a single policy by ID
 */
export async function getPolicy(
  accessToken: string,
  policyId: string,
): Promise<ApiResult<{ policy: unknown }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.policies.get.query({ id: policyId });
    return { success: true, policy: result };
  } catch (error) {
    logger.error('Error getting policy:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List users for the organization
 */
export async function listUsers(accessToken: string, _limit = 50) {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.users.list.query();
    return { success: true, users: result, total: result.length };
  } catch (error) {
    logger.error('Error listing users:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a single user by ID
 */
export async function getUser(accessToken: string, userId: string) {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.users.get.query({ id: userId });
    return { success: true, user: result };
  } catch (error) {
    logger.error('Error getting user:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List roles for the organization
 */
export async function listRoles(accessToken: string) {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.roles.list.query();
    return { success: true, roles: result };
  } catch (error) {
    logger.error('Error listing roles:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a single role by ID
 */
export async function getRole(accessToken: string, roleId: string) {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.roles.get.query({ id: roleId });
    return { success: true, role: result };
  } catch (error) {
    logger.error('Error getting role:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List MCP servers for the organization
 */
export async function listMcpServers(
  accessToken: string,
): Promise<ApiResult<{ servers: unknown }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.mcpServers.list.query();
    return { success: true, servers: result };
  } catch (error) {
    logger.error('Error listing MCP servers:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a single MCP server by ID
 */
export async function getMcpServer(
  accessToken: string,
  serverId: string,
): Promise<ApiResult<{ server: unknown }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.mcpServers.get.query({ id: serverId });
    return { success: true, server: result };
  } catch (error) {
    logger.error('Error getting MCP server:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List agents for the organization
 */
export async function listAgents(accessToken: string) {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.agents.list.query();
    return { success: true, agents: result, total: result.length };
  } catch (error) {
    logger.error('Error listing agents:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a single agent by ID
 */
export async function getAgent(
  accessToken: string,
  agentId: string,
): Promise<ApiResult<{ agent: unknown }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.agents.get.query({ id: agentId });
    return { success: true, agent: result };
  } catch (error) {
    logger.error('Error getting agent:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List sensitive flags for the organization
 */
export async function listSensitiveFlags(
  accessToken: string,
): Promise<ApiResult<{ flags: unknown; total: number }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.sensitiveFlags.list.query();
    return { success: true, flags: result, total: result.length };
  } catch (error) {
    logger.error('Error listing sensitive flags:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List webhooks for the organization
 */
export async function listWebhooks(accessToken: string) {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.webhooks.list.query();
    return { success: true, webhooks: result, total: result.length };
  } catch (error) {
    logger.error('Error listing webhooks:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List pending permission requests
 */
export async function listPermissionRequests(
  accessToken: string,
  status?: string,
): Promise<ApiResult<{ requests: unknown; total: number }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.permissionRequests.list.query({
      status: status as 'PENDING' | 'APPROVED' | 'DENIED' | 'WITHDRAWN' | 'MODIFIED' | undefined,
    });
    return { success: true, requests: result, total: result.length };
  } catch (error) {
    logger.error('Error listing permission requests:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get analytics summary
 */
export async function getAnalyticsSummary(accessToken: string, days = 7) {
  try {
    const client = createTrpcClient(accessToken);
    // Calculate date range based on days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await client.admin.analytics.summary.query({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    return { success: true, summary: result };
  } catch (error) {
    logger.error('Error getting analytics summary:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List recent audit log entries
 */
export async function listAuditLogs(
  accessToken: string,
  limit = 50,
): Promise<ApiResult<{ entries: unknown; total: number }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.auditLogEntries.list.query({ limit });
    return { success: true, entries: result.entries, total: result.total };
  } catch (error) {
    logger.error('Error listing audit logs:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * List admin action logs
 */
export async function listAdminActionLogs(
  accessToken: string,
  limit = 50,
): Promise<ApiResult<{ logs: unknown; total: number }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.adminActionLogs.list.query({ limit });
    return { success: true, logs: result.entries, total: result.total };
  } catch (error) {
    logger.error('Error listing admin action logs:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// PARAMETER LOOKUP API CALLS
// Used for finding IDs by labels when creating policies with conditions
// ============================================================================

/**
 * Search for parameter values by their human-readable label
 * Used to find IDs when creating policies based on resource names
 */
export async function searchParamValuesByLabel(
  accessToken: string,
  labelQuery: string,
  options?: {
    serverId?: string;
    serverDomain?: string;
    limit?: number;
  },
): Promise<ApiResult<{ results: unknown[] }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.conditions.searchByLabel.query({
      labelQuery,
      serverId: options?.serverId,
      serverDomain: options?.serverDomain,
      limit: options?.limit ?? 10,
    });
    return { success: true, results: result.results };
  } catch (error) {
    logger.error('Error searching param values by label:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get parameter value suggestions for a specific parameter key
 * Shows recently used values for that parameter
 */
export async function getParamSuggestions(
  accessToken: string,
  toolName: string,
  parameterKey: string,
  options?: {
    prefix?: string;
    limit?: number;
  },
): Promise<ApiResult<{ suggestions: unknown[] }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.conditions.getParamSuggestions.query({
      toolName,
      paramName: parameterKey,
      prefix: options?.prefix,
      limit: options?.limit ?? 10,
    });
    return { success: true, suggestions: result.suggestions };
  } catch (error) {
    logger.error('Error getting param suggestions:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// MCP SERVER TOOL DISCOVERY
// Used for getting external MCP server tools for the admin agent
// ============================================================================

/**
 * External MCP tool definition from the database
 */
export interface ExternalMcpTool {
  id: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
}

/**
 * External MCP server with its tools
 */
export interface ExternalMcpServer {
  id: string;
  name: string;
  url: string;
  authType: string;
  workspaceId: string | null;
  tools: ExternalMcpTool[];
}

/**
 * Get MCP servers with their tools for external tool execution
 * Returns servers that have discovered tools
 */
export async function getMcpServersWithTools(
  accessToken: string,
): Promise<ApiResult<{ servers: ExternalMcpServer[] }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.admin.mcpServers.list.query();

    // Filter to servers with tools and map to our expected shape
    const serversWithTools: ExternalMcpServer[] = (
      result as Array<{
        id: string;
        name: string;
        url: string;
        authType: string;
        workspaceId: string | null;
        tools: Array<{
          id: string;
          name: string;
          description: string | null;
          inputSchema: unknown;
        }>;
      }>
    )
      .filter((s) => s.tools && s.tools.length > 0)
      .map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        authType: s.authType,
        workspaceId: s.workspaceId ?? null,
        tools: s.tools.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }));

    return { success: true, servers: serversWithTools };
  } catch (error) {
    logger.error('Error getting MCP servers with tools:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Execute a tool on an external MCP server via the proxy
 */
export async function executeExternalMcpTool(
  accessToken: string,
  organizationId: string,
  adminUserId: string,
  serverId: string,
  toolName: string,
  toolInput: unknown,
): Promise<ApiResult<{ result: unknown }>> {
  try {
    const client = createTrpcClient(accessToken);
    const result = await client.proxy.callMcpTool.mutate({
      organizationId,
      adminUserId,
      serverId,
      toolName,
      toolInput,
    });
    if (result.success && 'result' in result) {
      return { success: true, result: result.result };
    }
    const errorMsg = 'error' in result ? (result.error as string) : 'Unknown error';
    return { success: false, error: errorMsg };
  } catch (error) {
    logger.error('Error executing external MCP tool:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
