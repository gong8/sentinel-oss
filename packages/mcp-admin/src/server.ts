/**
 * Admin MCP Server
 *
 * MCP server that enables administrators to manage Sentinel via natural language
 * commands from MCP clients like Cursor, Claude Code, etc.
 *
 * Key features:
 * - HTTP transport with Bearer token authentication (same as main MCP proxy)
 * - Read operations execute immediately
 * - Write operations require confirmation via admin dashboard
 * - Self-operation blocking (can't delete own account)
 * - Scope-based tool registration
 * - Non-admins see no admin tools (graceful handling)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { sanitizeObject } from '@sentinel/shared';
import { randomUUID } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { z } from 'zod';
import {
  createConfirmation,
  executeExternalMcpTool,
  getAgent,
  getAnalyticsSummary,
  getMcpServer,
  getMcpServersWithTools,
  getParamSuggestions,
  getPolicy,
  getRole,
  getUser,
  listAdminActionLogs,
  listAgents,
  listAuditLogs,
  listMcpServers,
  listPermissionRequests,
  listPolicies,
  listRoles,
  listSensitiveFlags,
  listUsers,
  listWebhooks,
  searchParamValuesByLabel,
  validateAdminMcpAccess,
  validateAdminToken,
  waitForConfirmation,
  type ExternalMcpServer,
  type ExternalMcpTool,
} from './api-client.js';
import { logger } from './logger.js';
import { getToolByName, getToolsForScopes, type ToolDefinition } from './tools.js';
import type { AdminContext, AdminMcpAccessResult } from './types.js';

// Alias for backwards compatibility with existing usage
const sanitizeForLogging = sanitizeObject;

// Helper to create MCP tool result with JSON content
function createToolResult(data: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

// Helper to create error tool result
function createErrorResult(
  error: string,
  message: string,
  extra?: Record<string, unknown>,
): CallToolResult {
  return createToolResult({ error, message, ...extra }, true);
}

// Helper to send JSON-RPC error response
function sendJsonRpcError(
  res: ServerResponse,
  code: number,
  message: string,
  httpStatus = 400,
): void {
  res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

// Self-operations that are blocked via admin MCP
const BLOCKED_SELF_OPERATIONS = new Set([
  'admin_delete_user',
  'admin_update_user',
  'admin_revoke_token',
]);

/**
 * Check if an operation targets the admin's own account
 */
function isSelfOperation(
  toolName: string,
  adminUserId: string,
  toolInput: Record<string, unknown>,
): boolean {
  if (!BLOCKED_SELF_OPERATIONS.has(toolName)) {
    return false;
  }
  const targetUserId = toolInput.id || toolInput.userId;
  return targetUserId === adminUserId;
}

interface SessionContext {
  adminContext: AdminContext;
  accessResult: AdminMcpAccessResult;
  mcpSessionId: string;
  accessToken: string; // Store the access token for authenticated API calls
  externalMcpServers: ExternalMcpServer[]; // External MCP servers with their tools
}

// Session registry
const sessionRegistry = new Map<string, SessionContext>();
const transports = new Map<string, StreamableHTTPServerTransport>();
const servers = new Map<string, McpServer>();

/**
 * Extract domain from a URL for tool naming
 */
function extractDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}

/**
 * Create and configure an MCP server for a session
 */
function createMcpServer(sessionId: string, sessionContext: SessionContext): McpServer {
  const server = new McpServer(
    {
      name: 'sentinel-admin-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register health tool (always available)
  server.registerTool(
    'admin_health',
    {
      description: `Get health status of the Admin MCP server and current session info.

Returns: Server status, admin email, organization, and enabled scopes.`,
    },
    async () =>
      createToolResult({
        status: 'healthy',
        server: 'sentinel-admin-mcp',
        version: '0.1.0',
        admin: sessionContext.adminContext.email,
        organization: sessionContext.adminContext.organizationId,
        enabledScopes: sessionContext.accessResult.enabledScopes,
        externalMcpServers: sessionContext.externalMcpServers.map((s) => ({
          name: s.name,
          url: s.url,
          toolCount: s.tools.length,
        })),
        timestamp: new Date().toISOString(),
      }),
  );

  // Get tools for enabled scopes
  const tools = getToolsForScopes(sessionContext.accessResult.enabledScopes);
  logger.tool(`Registering ${tools.length} admin tools for session ${sessionId}...`);

  // Register all tools for enabled scopes
  for (const toolDef of tools) {
    registerTool(server, toolDef, sessionContext);
  }

  // Register external MCP tools
  let externalToolCount = 0;
  for (const mcpServer of sessionContext.externalMcpServers) {
    const serverDomain = extractDomainFromUrl(mcpServer.url);

    for (const tool of mcpServer.tools) {
      registerExternalMcpTool(server, mcpServer, tool, serverDomain, sessionContext);
      externalToolCount++;
    }
  }

  const totalTools = tools.length + externalToolCount + 1; // +1 for health
  logger.success(
    `Registered ${totalTools} tools (${tools.length} admin, ${externalToolCount} external MCP, 1 health)`,
  );

  return server;
}

/**
 * Register an external MCP tool on the server
 */
/**
 * Build a description for an external MCP tool including its schema info
 */
function buildExternalToolDescription(mcpServer: ExternalMcpServer, tool: ExternalMcpTool): string {
  const baseDesc = tool.description ?? `External MCP tool from ${mcpServer.name}`;

  // If there's an input schema, try to include parameter info in the description
  if (tool.inputSchema && typeof tool.inputSchema === 'object') {
    const schema = tool.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown> | undefined;
    const required = schema.required as string[] | undefined;

    if (properties) {
      const paramLines: string[] = [];
      for (const [key, value] of Object.entries(properties)) {
        const propSchema = value as Record<string, unknown> | undefined;
        const propType = propSchema?.type ?? 'unknown';
        const propDesc = propSchema?.description ?? '';
        const isRequired = required?.includes(key) ? ' (required)' : '';
        paramLines.push(`  - ${key}: ${propType}${isRequired}${propDesc ? ` - ${propDesc}` : ''}`);
      }
      if (paramLines.length > 0) {
        return `${baseDesc}\n\nParameters:\n${paramLines.join('\n')}`;
      }
    }
  }

  return baseDesc;
}

function registerExternalMcpTool(
  server: McpServer,
  mcpServer: ExternalMcpServer,
  tool: ExternalMcpTool,
  serverDomain: string,
  sessionContext: SessionContext,
): void {
  // Tool name format: "domain::toolname" (e.g., "localhost:8017::open_workbook")
  const fullToolName = `${serverDomain}::${tool.name}`;

  // Use a passthrough Zod schema since the target MCP server will validate
  // Include the JSON schema info in the description for the LLM
  const passthroughSchema = z.record(z.string(), z.unknown());

  server.registerTool(
    fullToolName,
    {
      description: buildExternalToolDescription(mcpServer, tool),
      inputSchema: passthroughSchema,
    },
    async (args: unknown) => {
      return handleExternalMcpToolCall(mcpServer, tool.name, args, sessionContext);
    },
  );
}

/**
 * Register a single tool on a server
 * The MCP SDK expects Zod schemas directly and handles JSON Schema conversion internally
 */
function registerTool(
  server: McpServer,
  toolDef: ToolDefinition,
  sessionContext: SessionContext,
): void {
  server.registerTool(
    toolDef.name,
    {
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
    },
    async (args: unknown) => {
      return handleToolCall(toolDef.name, args, sessionContext);
    },
  );
}

/**
 * Handle a tool call
 */
async function handleToolCall(
  toolName: string,
  args: unknown,
  sessionContext: SessionContext,
): Promise<CallToolResult> {
  const { adminContext } = sessionContext;

  logger.tool(`\n[ADMIN MCP] Tool call: ${toolName}`);
  logger.info(`   Args: ${JSON.stringify(sanitizeForLogging(args)).substring(0, 200)}`);

  // Get tool definition
  const toolDef = getToolByName(toolName);
  if (!toolDef) {
    return createErrorResult('TOOL_NOT_FOUND', `Unknown tool: ${toolName}`);
  }

  // Validate args against schema
  const parseResult = toolDef.inputSchema.safeParse(args);
  if (!parseResult.success) {
    return createErrorResult('VALIDATION_ERROR', 'Invalid arguments', {
      errors: parseResult.error.issues,
    });
  }

  // Zod parsed data is guaranteed to be an object for z.object schemas
  const rawData = parseResult.data;
  const validatedArgs: Record<string, unknown> =
    typeof rawData === 'object' && rawData !== null
      ? Object.fromEntries(Object.entries(rawData))
      : {};

  // Check for self-operation
  if (isSelfOperation(toolName, adminContext.userId, validatedArgs)) {
    return createErrorResult(
      'SELF_OPERATION_BLOCKED',
      'Cannot perform this operation on your own account via Admin MCP. Use the web dashboard instead.',
    );
  }

  // Route to appropriate handler
  if (toolDef.isWriteTool) {
    return handleWriteOperation(toolName, validatedArgs, sessionContext);
  } else {
    return handleReadOperation(toolName, validatedArgs, sessionContext);
  }
}

/**
 * Filter resources by workspace access
 * - If adminWorkspaceIds is empty array, admin has no workspace access (should not happen)
 * - If adminWorkspaceIds is non-empty, filter to workspace-scoped + org-wide resources
 * Returns undefined (no filtering) for org-wide admins
 */
function filterByWorkspaceAccess<T extends { workspaceId?: string | null }>(
  items: T[],
  adminWorkspaceIds: string[],
): T[] {
  // Empty array means workspace admin with no workspaces - return nothing
  if (adminWorkspaceIds.length === 0) {
    return [];
  }

  // Filter to workspace-scoped resources the admin can access + org-wide resources
  return items.filter((item) => {
    // Org-wide resources (null workspaceId) are always visible
    if (!item.workspaceId) {
      return true;
    }
    // Workspace-scoped resources require membership
    return adminWorkspaceIds.includes(item.workspaceId);
  });
}

/**
 * Handle a read operation (executes immediately)
 */
async function handleReadOperation(
  toolName: string,
  args: Record<string, unknown>,
  sessionContext: SessionContext,
): Promise<CallToolResult> {
  const { accessToken, adminContext } = sessionContext;
  // If adminWorkspaceIds is non-empty, we need to filter workspace-scoped resources
  const shouldFilterByWorkspace = adminContext.adminWorkspaceIds.length > 0;

  try {
    switch (toolName) {
      // POLICIES (workspace-scoped)
      case 'admin_list_policies': {
        const result = await listPolicies(
          accessToken,
          (args.limit as number) ?? 50,
          (args.offset as number) ?? 0,
        );
        if (
          result.success &&
          'policies' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.policies)
        ) {
          result.policies = filterByWorkspaceAccess(
            result.policies,
            adminContext.adminWorkspaceIds,
          );
        }
        return createToolResult(result);
      }
      case 'admin_get_policy': {
        const result = await getPolicy(accessToken, args.id as string);
        return createToolResult(result);
      }
      // USERS
      case 'admin_list_users': {
        const result = await listUsers(accessToken, (args.limit as number) ?? 50);
        return createToolResult(result);
      }
      case 'admin_get_user': {
        const result = await getUser(accessToken, args.id as string);
        return createToolResult(result);
      }
      // ROLES
      case 'admin_list_roles': {
        const result = await listRoles(accessToken);
        return createToolResult(result);
      }
      case 'admin_get_role': {
        const result = await getRole(accessToken, args.id as string);
        return createToolResult(result);
      }
      // MCP_SERVERS (workspace-scoped)
      case 'admin_list_mcp_servers': {
        const result = await listMcpServers(accessToken);
        if (
          result.success &&
          'servers' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.servers)
        ) {
          result.servers = filterByWorkspaceAccess(result.servers, adminContext.adminWorkspaceIds);
        }
        return createToolResult(result);
      }
      case 'admin_get_mcp_server': {
        const result = await getMcpServer(accessToken, args.id as string);
        return createToolResult(result);
      }
      // AGENTS (workspace-scoped)
      case 'admin_list_agents': {
        const result = await listAgents(accessToken);
        if (
          result.success &&
          'agents' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.agents)
        ) {
          result.agents = filterByWorkspaceAccess(result.agents, adminContext.adminWorkspaceIds);
          result.total = result.agents.length;
        }
        return createToolResult(result);
      }
      case 'admin_get_agent': {
        const result = await getAgent(accessToken, args.id as string);
        return createToolResult(result);
      }
      // SENSITIVE_FLAGS (workspace-scoped)
      case 'admin_list_sensitive_flags': {
        const result = await listSensitiveFlags(accessToken);
        if (
          result.success &&
          'flags' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.flags)
        ) {
          result.flags = filterByWorkspaceAccess(result.flags, adminContext.adminWorkspaceIds);
        }
        return createToolResult(result);
      }
      // WEBHOOKS (workspace-scoped)
      case 'admin_list_webhooks': {
        const result = await listWebhooks(accessToken);
        if (
          result.success &&
          'webhooks' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.webhooks)
        ) {
          result.webhooks = filterByWorkspaceAccess(
            result.webhooks,
            adminContext.adminWorkspaceIds,
          );
        }
        return createToolResult(result);
      }
      // PERMISSION_REQUESTS (workspace-scoped)
      case 'admin_list_permission_requests': {
        const result = await listPermissionRequests(accessToken, args.status as string);
        if (
          result.success &&
          'requests' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.requests)
        ) {
          result.requests = filterByWorkspaceAccess(
            result.requests,
            adminContext.adminWorkspaceIds,
          );
        }
        return createToolResult(result);
      }
      // ANALYTICS
      case 'admin_get_analytics_summary': {
        const result = await getAnalyticsSummary(accessToken, (args.days as number) ?? 7);
        return createToolResult(result);
      }
      // AUDIT (workspace-scoped)
      case 'admin_query_audit_log': {
        const result = await listAuditLogs(accessToken, (args.limit as number) ?? 50);
        if (
          result.success &&
          'entries' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.entries)
        ) {
          const entries = result.entries as Array<{ workspaceId?: string | null }>;
          const filteredEntries = filterByWorkspaceAccess(entries, adminContext.adminWorkspaceIds);
          return createToolResult({
            ...result,
            entries: filteredEntries,
            total: filteredEntries.length,
          });
        }
        return createToolResult(result);
      }
      case 'admin_query_admin_actions': {
        const result = await listAdminActionLogs(accessToken, (args.limit as number) ?? 50);
        if (
          result.success &&
          'logs' in result &&
          shouldFilterByWorkspace &&
          Array.isArray(result.logs)
        ) {
          const logs = result.logs as Array<{ workspaceId?: string | null }>;
          const filteredLogs = filterByWorkspaceAccess(logs, adminContext.adminWorkspaceIds);
          return createToolResult({
            ...result,
            logs: filteredLogs,
            total: filteredLogs.length,
          });
        }
        return createToolResult(result);
      }
      // PARAM LOOKUP
      case 'admin_search_param_values_by_label': {
        const result = await searchParamValuesByLabel(accessToken, args.labelQuery as string, {
          serverId: args.serverId as string | undefined,
          serverDomain: args.serverDomain as string | undefined,
          limit: args.limit as number | undefined,
        });
        return createToolResult(result);
      }
      case 'admin_get_param_suggestions': {
        const result = await getParamSuggestions(
          accessToken,
          args.toolName as string,
          args.parameterKey as string,
          {
            prefix: args.prefix as string | undefined,
            limit: args.limit as number | undefined,
          },
        );
        return createToolResult(result);
      }
      default:
        return createErrorResult('UNKNOWN_READ_TOOL', `Unknown read tool: ${toolName}`);
    }
  } catch (error) {
    logger.error(`Error executing read tool ${toolName}:`, error);
    return createErrorResult(
      'EXECUTION_ERROR',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

/**
 * Handle an external MCP tool call
 */
async function handleExternalMcpToolCall(
  mcpServer: ExternalMcpServer,
  toolName: string,
  args: unknown,
  sessionContext: SessionContext,
): Promise<CallToolResult> {
  const { adminContext, accessToken } = sessionContext;

  logger.tool(`\n[ADMIN MCP] External MCP tool call: ${mcpServer.name}::${toolName}`);
  logger.info(`   Args: ${JSON.stringify(sanitizeForLogging(args)).substring(0, 200)}`);

  // Validate workspace access for workspace-scoped MCP servers
  if (mcpServer.workspaceId !== null) {
    const hasWorkspaceAccess = adminContext.adminWorkspaceIds.includes(mcpServer.workspaceId);
    if (!hasWorkspaceAccess) {
      logger.error(
        `Admin ${adminContext.email} lacks access to workspace ${mcpServer.workspaceId} for server ${mcpServer.name}`,
      );
      return createErrorResult(
        'WORKSPACE_ACCESS_DENIED',
        `You do not have access to the workspace containing MCP server "${mcpServer.name}"`,
      );
    }
  }

  try {
    const result = await executeExternalMcpTool(
      accessToken,
      adminContext.organizationId,
      adminContext.userId,
      mcpServer.id,
      toolName,
      args,
    );

    if (!result.success) {
      logger.error(`External MCP tool ${toolName} failed: ${result.error}`);
      return createErrorResult('EXTERNAL_TOOL_ERROR', result.error ?? 'Unknown error');
    }

    logger.success(`External MCP tool ${toolName} executed successfully`);
    return createToolResult(result.result);
  } catch (error) {
    logger.error(`Error executing external MCP tool ${toolName}:`, error);
    return createErrorResult(
      'EXECUTION_ERROR',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

/**
 * Handle a write operation (requires confirmation)
 */
async function handleWriteOperation(
  toolName: string,
  args: Record<string, unknown>,
  sessionContext: SessionContext,
): Promise<CallToolResult> {
  const { adminContext, accessResult, mcpSessionId } = sessionContext;

  try {
    // Extract workspaceId from tool input if present
    const workspaceId = typeof args.workspaceId === 'string' ? args.workspaceId : null;

    // Validate workspace access before creating confirmation request
    // If admin has workspace restrictions (non-empty adminWorkspaceIds) and the operation
    // targets a specific workspace, verify access upfront to avoid unnecessary confirmations
    if (
      workspaceId &&
      adminContext.adminWorkspaceIds.length > 0 &&
      !adminContext.adminWorkspaceIds.includes(workspaceId)
    ) {
      logger.warn(
        `Admin ${adminContext.email} lacks access to workspace ${workspaceId} for ${toolName}`,
      );
      return createErrorResult(
        'WORKSPACE_ACCESS_DENIED',
        'You do not have admin access to the specified workspace',
      );
    }

    // 1. Create confirmation request
    logger.confirmation(`Creating confirmation for ${toolName}...`);
    const confirmResult = await createConfirmation(
      adminContext.organizationId,
      mcpSessionId,
      adminContext.userId,
      toolName,
      args,
      workspaceId,
    );

    if (!confirmResult.success) {
      return createErrorResult(
        'CONFIRMATION_FAILED',
        confirmResult.error || 'Failed to create confirmation',
      );
    }

    // If no confirmation required (e.g., low-risk operation), the result is already available
    if (!confirmResult.requiresConfirmation) {
      logger.success(`Operation completed without confirmation: ${toolName}`);
      return createToolResult({
        success: true,
        message: 'Operation completed',
        toolName,
      });
    }

    // 2. Tell the user about the pending confirmation
    logger.confirmation(`Confirmation required: ${confirmResult.confirmationId}`);
    logger.info(`   Risk level: ${confirmResult.riskLevel}`);
    logger.info(`   Description: ${confirmResult.description}`);
    logger.info(`   Expires at: ${confirmResult.expiresAt}`);

    // 3. Wait for confirmation
    logger.info('Waiting for confirmation in Sentinel dashboard...');
    const maxWaitMs = (accessResult.confirmationTtlSeconds ?? 300) * 1000;
    const statusResult = await waitForConfirmation(
      adminContext.organizationId,
      confirmResult.confirmationId!,
      maxWaitMs,
    );

    // 4. Handle result
    if (statusResult.status === 'EXECUTED') {
      logger.success(`Operation confirmed and executed: ${toolName}`);
      return createToolResult({
        success: true,
        message: 'Operation confirmed and executed',
        result: statusResult.result,
      });
    } else if (statusResult.status === 'REJECTED') {
      logger.warn(`Operation rejected: ${toolName}`);
      return createErrorResult('CONFIRMATION_REJECTED', 'Operation was rejected by an admin');
    } else if (statusResult.status === 'EXPIRED') {
      logger.warn(`Confirmation expired: ${toolName}`);
      return createErrorResult(
        'CONFIRMATION_EXPIRED',
        'Confirmation request expired. Please try again.',
      );
    } else if (statusResult.status === 'FAILED') {
      logger.error(`Operation failed: ${toolName}`);
      return createErrorResult(
        'EXECUTION_FAILED',
        statusResult.error || 'Operation failed during execution',
      );
    } else {
      // Still pending or confirmed but not executed
      return createErrorResult(
        'CONFIRMATION_TIMEOUT',
        'Confirmation timed out. Please try again.',
        {
          status: statusResult.status,
          confirmationId: confirmResult.confirmationId,
        },
      );
    }
  } catch (error) {
    logger.error(`Error executing write tool ${toolName}:`, error);
    return createErrorResult(
      'EXECUTION_ERROR',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
    });
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        server: 'sentinel-admin-mcp',
        version: '0.1.0',
        activeSessions: sessionRegistry.size,
      }),
    );
    return;
  }

  // Handle GET /mcp - return 405 to indicate SSE is not supported (use POST)
  if (req.url === '/mcp' && req.method === 'GET') {
    res.writeHead(405, { Allow: 'POST', 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Only handle POST to /mcp
  if (req.url !== '/mcp' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Parse request body
  let body: unknown;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    body = JSON.parse(rawBody);
  } catch {
    sendJsonRpcError(res, -32700, 'Parse error', 400);
    return;
  }

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session - route to transport
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, body);
      return;
    }

    // New session - require auth
    if (!sessionId && isInitializeRequest(body)) {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        sendJsonRpcError(res, -32000, 'Unauthorized: Bearer token required', 401);
        return;
      }

      const accessToken = authHeader.substring(7);

      // Validate admin token
      logger.info('Validating admin token...');
      const adminContext = await validateAdminToken(accessToken);

      if (!adminContext) {
        // Not an admin or invalid token - return empty tool list
        logger.warn('Invalid token or user is not an admin - creating session with no admin tools');

        // Create a minimal server with no admin tools
        const newSessionId = randomUUID();
        const server = new McpServer(
          { name: 'sentinel-admin-mcp', version: '0.1.0' },
          { capabilities: { tools: {} } },
        );

        // Only register a status tool that explains why no tools are available
        server.registerTool(
          'admin_status',
          {
            description: 'Get Admin MCP status. Returns why admin tools may not be available.',
          },
          async () =>
            createToolResult({
              status: 'unauthorized',
              message:
                'Admin tools require admin privileges. Your token is either invalid or belongs to a non-admin user.',
              timestamp: new Date().toISOString(),
            }),
        );

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          enableJsonResponse: true,
          onsessioninitialized: async (sid: string) => {
            logger.session(`Non-admin session initialized: ${sid}`);
            transports.set(sid, transport);
            servers.set(sid, server);
          },
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      logger.admin(`Authenticated as: ${adminContext.email}`);

      // Check Admin MCP access
      logger.info('Checking Admin MCP access...');
      const accessResult = await validateAdminMcpAccess(
        adminContext.organizationId,
        adminContext.userId,
      );

      if (!accessResult.accessible) {
        logger.error(`Admin MCP access denied: ${accessResult.reason}`);
        sendJsonRpcError(res, -32000, `Admin MCP access denied: ${accessResult.reason}`, 403);
        return;
      }

      logger.success('Admin MCP access granted');
      logger.info(`Enabled scopes: ${accessResult.enabledScopes.join(', ')}`);

      // Fetch external MCP servers with their tools
      logger.info('Fetching external MCP servers...');
      let externalMcpServers: ExternalMcpServer[] = [];
      const mcpServersResult = await getMcpServersWithTools(accessToken);
      if (mcpServersResult.success) {
        externalMcpServers = mcpServersResult.servers;
        const totalTools = externalMcpServers.reduce((sum, s) => sum + s.tools.length, 0);
        logger.info(
          `Found ${externalMcpServers.length} external MCP servers with ${totalTools} tools`,
        );
      } else {
        logger.warn(`Failed to fetch external MCP servers: ${mcpServersResult.error}`);
      }

      // Create new session
      const newSessionId = randomUUID();
      const mcpSessionId = randomUUID();

      const sessionContext: SessionContext = {
        adminContext,
        accessResult,
        mcpSessionId,
        accessToken, // Store for authenticated API calls
        externalMcpServers,
      };

      const server = createMcpServer(newSessionId, sessionContext);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        enableJsonResponse: true,
        onsessioninitialized: async (sid: string) => {
          logger.session(`Admin session initialized: ${sid} for ${adminContext.email}`);
          transports.set(sid, transport);
          servers.set(sid, server);
          sessionRegistry.set(sid, sessionContext);
        },
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // Invalid request
    sendJsonRpcError(res, -32000, 'Bad Request: No valid session ID provided', 400);
  } catch (error) {
    logger.error('Error handling request:', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, -32603, 'Internal server error', 500);
    }
  }
}

/**
 * Start the Admin MCP HTTP server
 */
function startServer(): void {
  const port = parseInt(process.env.ADMIN_MCP_PORT || '3003', 10);

  const httpServer = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      logger.error('Unhandled error in request handler:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  });

  httpServer.listen(port, () => {
    logger.startup('Admin MCP Server running');
    logger.mcp(`MCP HTTP endpoint: http://localhost:${port}/mcp`);
    logger.info(`Health check: http://localhost:${port}/health`);
    logger.success('Ready to receive commands');
  });
}

// Start the server
startServer();
