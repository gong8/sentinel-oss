import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  isInitializeRequest,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  checkSessionStatus,
  evaluatePolicy,
  evaluateSensitiveFlags,
  getMcpServer,
  getOrCreateSessionForTracking,
  getUserAuditLog,
  getUserMcpConfig,
  getUserPolicies,
  incrementSessionToolCallCount,
  listMcpServers,
  logAuditEntry,
  trackToolParamValues,
  validateAccessToken,
  waitForApproval,
} from './api-client.js';
import { hasAuthMaterial } from './credentials.js';
import { logger } from './logger.js';
import { forwardToMcpServer, listToolsFromMcpServer } from './mcp-client.js';
import { sanitizeObject, sanitizeRecord } from './redaction.js';
import { toJsonRecord, type UserContext } from './types.js';

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

// Type guard to check if result is a CallToolResult
function isCallToolResult(result: ConnectionContext | CallToolResult): result is CallToolResult {
  return 'isError' in result;
}

// Helper to get connection context or return error result
function getConnectionOrError(sessionId: string): ConnectionContext | CallToolResult {
  const connection = connectionRegistry.get(sessionId);
  if (!connection) {
    return createErrorResult('SESSION_NOT_FOUND', 'Session not found');
  }
  return connection;
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

// Helper to get approval status message
function getApprovalStatusMessage(status: string): string {
  const statusMessages: Record<string, string> = {
    DENIED: 'Approval denied',
    EXPIRED: 'Approval request expired',
    CANCELLED: 'Approval request cancelled',
    PENDING: 'Approval timeout - request still pending',
  };
  return statusMessages[status] ?? 'Approval request not found';
}

interface ConnectionContext {
  userContext: UserContext;
}

export const connectionRegistry = new Map<string, ConnectionContext>();

// Global session storage that persists across hot reloads in development
// In production, this would be in Redis or a database
const globalTransports = new Map<string, StreamableHTTPServerTransport>();
const globalServers = new Map<string, McpServer>();

// Mapping from sessionId -> originalToolName -> qualifiedToolName (domain::tool)
// This allows us to register tools with MCP-compliant names while maintaining
// qualified names for policy evaluation
export const toolNameMapping = new Map<string, Map<string, string>>();

// WORKAROUND: Store arguments from JSON-RPC request because SDK doesn't pass them when inputSchema is omitted
// Since the SDK doesn't extract arguments when inputSchema is omitted, we intercept them from the JSON-RPC request
// Map key: sessionId:toolName -> arguments
export const pendingToolArguments = new Map<string, Record<string, unknown>>();

export class SentinelServer {
  // Use global maps so sessions survive hot reloads in development
  private transports: Map<string, StreamableHTTPServerTransport> = globalTransports;
  private servers: Map<string, McpServer> = globalServers;

  private getServer(sessionId: string): McpServer {
    if (this.servers.has(sessionId)) {
      return this.servers.get(sessionId)!;
    }

    const server = new McpServer(
      {
        name: 'sentinel-control-plane',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupTools(server, sessionId);
    this.servers.set(sessionId, server);
    return server;
  }

  private async getServerForSession(sessionId: string): Promise<McpServer | null> {
    return this.servers.get(sessionId) || null;
  }

  private setupTools(server: McpServer, sessionId: string): void {
    // Register a simple health tool
    server.registerTool(
      'sentinel_health',
      {
        description: `Get health status of the SENTINEL MCP proxy server.

Example: Just call this tool with no parameters.

Returns: Server status, version, and timestamp.`,
      },
      async () =>
        createToolResult({
          status: 'healthy',
          server: 'sentinel-control-plane',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        }),
    );

    // Register policy visibility tool
    server.registerTool(
      'get_my_policies',
      {
        description: `List organization policies that apply to your current session.

This shows you what tools you're allowed to use and any restrictions in place.

Example: Just call this tool with no parameters.

Returns: List of policies with their effects (ALLOW/DENY), resources, and descriptions.`,
      },
      async () => {
        const connectionOrError = getConnectionOrError(sessionId);
        if (isCallToolResult(connectionOrError)) return connectionOrError;

        const { userContext } = connectionOrError;
        const result = await getUserPolicies(userContext.organizationId, userContext.workspaceIds);

        return createToolResult({
          user: userContext.email,
          roles: userContext.roles || [],
          organization: userContext.organizationId,
          policies: result.policies.map((policy) => ({
            id: policy.id,
            slug: policy.slug,
            effect: policy.effect,
            matchers: policy.matchers,
            toolPatterns: policy.toolPatterns,
            description: policy.description,
            enabled: policy.enabled,
          })),
          total: result.total,
          note: 'ALLOW policies grant access. If no ALLOW matches, access is DENIED.',
        });
      },
    );

    // Register audit log visibility tool
    server.registerTool(
      'get_my_audit_log',
      {
        description: `View your recent tool usage and policy decisions.

This shows what tools you've called, when, and whether they were allowed or denied.

Example: Call with optional parameters:
{
  "limit": 10,
  "toolName": "localhost:3012::submit_backtest"
}

Returns: Your recent activity with timestamps, decisions, and justifications.`,
      },
      async () => {
        const connectionOrError = getConnectionOrError(sessionId);
        if (isCallToolResult(connectionOrError)) return connectionOrError;

        const { userContext } = connectionOrError;
        const result = await getUserAuditLog(userContext.userId, userContext.organizationId, {
          limit: 20,
          toolName: undefined,
        });

        return createToolResult({
          user: userContext.email,
          recentActivity: result.logs.map((log) => ({
            timestamp: log.timestamp,
            tool: log.toolName,
            decision: log.decision,
            justification: log.justification || 'N/A',
          })),
          total: result.total,
          showing: result.logs.length,
        });
      },
    );

    // Register diagnostic tool for debugging MCP server connectivity
    server.registerTool(
      'sentinel_diagnostics',
      {
        description: `Get diagnostic information about SENTINEL and upstream MCP servers.

This helps debug issues like:
- Why tool counts are jumping between sessions
- Which MCP servers are reachable
- What tools are currently registered

Example: Just call this tool with no parameters.

Returns: Detailed diagnostic information about the current session.`,
      },
      async () => {
        const connectionOrError = getConnectionOrError(sessionId);
        if (isCallToolResult(connectionOrError)) return connectionOrError;

        const { userContext } = connectionOrError;
        const toolMapping = toolNameMapping.get(sessionId);
        const mcpServers = await listMcpServers(userContext.organizationId);

        // Test connectivity to each upstream server
        const upstreamStatus = await Promise.allSettled(
          mcpServers.map(async (mcpServer) => {
            const start = Date.now();
            try {
              const response = await fetch(`${mcpServer.url}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
              });
              return {
                name: mcpServer.name,
                url: mcpServer.url,
                status: response.ok ? 'reachable' : 'error',
                responseTime: `${Date.now() - start}ms`,
                httpStatus: response.status,
              };
            } catch (error) {
              return {
                name: mcpServer.name,
                url: mcpServer.url,
                status: 'unreachable',
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          }),
        );

        const upstreamToolCount = toolMapping?.size ?? 0;
        return createToolResult({
          session: {
            id: sessionId,
            user: userContext.email,
            organization: userContext.organizationId,
          },
          tools: {
            sentinelBuiltIn: 4, // health, policies, audit, diagnostics
            upstream: upstreamToolCount,
            total: 4 + upstreamToolCount,
            registered: toolMapping
              ? Array.from(toolMapping.entries()).map(([original, qualified]) => ({
                  original,
                  qualified,
                }))
              : [],
          },
          upstreamServers: {
            configured: mcpServers.length,
            servers: mcpServers.map((s, i) => ({
              name: s.name,
              url: s.url,
              authType: s.authType,
              connectivity:
                upstreamStatus[i].status === 'fulfilled'
                  ? upstreamStatus[i].value
                  : { status: 'error', error: 'Check failed' },
            })),
          },
          note: 'If tool counts are inconsistent, check upstream server connectivity and logs.',
        });
      },
    );

    // Note: Upstream tools will be registered in registerUpstreamTools()
    // after session initialization
  }

  /**
   * Dynamically register tools from upstream MCP servers
   * Called after session initialization to populate the tool list
   */
  private async registerUpstreamTools(server: McpServer, sessionId: string): Promise<void> {
    const connection = connectionRegistry.get(sessionId);
    if (!connection) {
      return;
    }

    const { userContext } = connection;

    try {
      // Initialize tool name mapping for this session
      if (!toolNameMapping.has(sessionId)) {
        toolNameMapping.set(sessionId, new Map());
      }
      const sessionMapping = toolNameMapping.get(sessionId)!;

      // 1. Get all MCP servers for the organization
      const mcpServers = await listMcpServers(userContext.organizationId);

      if (mcpServers.length === 0) {
        logger.info(
          `No upstream MCP servers configured for organization ${userContext.organizationId}`,
        );
        return;
      }

      logger.info(`Found ${mcpServers.length} upstream MCP server(s) to register`);

      // 2. For each server, list tools and register them
      // Process each server independently - one failure shouldn't block others
      const results = await Promise.allSettled(
        mcpServers.map(async (mcpServer) => {
          try {
            logger.mcp(`  Registering tools from ${mcpServer.name} (${mcpServer.url})...`);

            let userConfig = null;
            // Check if authentication is required
            if (mcpServer.authType !== 'NONE') {
              userConfig = await getUserMcpConfig(userContext.userId, mcpServer.id);
              if (!userConfig) {
                logger.warn(`    Skipping ${mcpServer.name} - no credentials configured`);
                return { server: mcpServer.name, status: 'skipped', reason: 'no credentials' };
              }
            }

            // List tools from the server with 10 second timeout
            // (Some servers like Notion proxy spawn subprocesses which need time to start)
            const { tools, domainPrefix } = await listToolsFromMcpServer(
              mcpServer,
              userConfig?.credentials || null,
              10000, // 10 second timeout per server
            );

            // Register the tools
            this.registerTools(server, tools, sessionId, domainPrefix, sessionMapping);

            logger.success(`    Registered ${tools.length} tool(s) from ${mcpServer.name}`);
            return { server: mcpServer.name, status: 'success', toolCount: tools.length };
          } catch (error) {
            logger.error(`    Failed to register tools from ${mcpServer.name}:`, error);
            return {
              server: mcpServer.name,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        }),
      );

      // Log summary
      const successful = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 'success',
      );
      const failed = results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'failed'),
      );
      const skipped = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 'skipped',
      );

      logger.info(`\nTool registration summary:`, undefined, { emoji: '📊' });
      logger.success(`   Successful: ${successful.length}`);
      logger.error(`   Failed: ${failed.length}`);
      logger.warn(`   Skipped: ${skipped.length}`);

      if (failed.length > 0) {
        logger.warn(`\nSome MCP servers failed to register. Details above.`);
      }
    } catch (error) {
      logger.error('Fatal error during upstream tool registration:', error);
    }
  }

  /**
   * Handle session initialization callback
   * Extracted as a separate method for testability
   */
  async handleSessionInitialized(
    sessionId: string,
    transport: StreamableHTTPServerTransport,
    userContext: UserContext,
  ): Promise<void> {
    logger.session(`Session initialized with ID: ${sessionId} for user: ${userContext.email}`);
    this.transports.set(sessionId, transport);
    connectionRegistry.set(sessionId, { userContext });
    logger.info(
      `Stored transport for session ${sessionId}. Total sessions: ${this.transports.size}`,
      undefined,
      { emoji: '📦' },
    );

    // Register tools from upstream MCP servers
    // Use a timeout to prevent slow upstream servers from blocking session init
    const serverInstance = this.servers.get(sessionId);
    if (serverInstance) {
      logger.tool(`Registering upstream tools for session ${sessionId}...`);
      try {
        // Await with 5 second timeout - if upstream servers are slow, continue anyway
        await Promise.race([
          this.registerUpstreamTools(serverInstance, sessionId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
        ]);
        logger.success(`Upstream tools registered for session ${sessionId}`);
      } catch (error) {
        if (error instanceof Error && error.message === 'Timeout') {
          logger.warn(
            `Upstream tool registration timed out for session ${sessionId} (>5s)`,
            undefined,
            { emoji: '⏱️' },
          );
          logger.warn('   Continuing with partial tool list. Tools may appear shortly.');
          // Continue async registration in background
          void this.registerUpstreamTools(serverInstance, sessionId)
            .then(() => logger.success(`Delayed registration completed for ${sessionId}`))
            .catch((e) => logger.error('Delayed registration failed:', e));
        } else {
          logger.error(`Error registering upstream tools for session ${sessionId}:`, error);
          logger.error('   Sentinel will continue with only built-in tools available');
        }
      }
    }
  }

  /**
   * Register a list of tools from upstream MCP servers
   * NOTE: We don't pass inputSchema to avoid MCP SDK validation bugs
   * The SDK has a bug where it tries to validate JSON Schema as Zod schema
   * Clients must send parameters anyway (Cursor does this)
   */
  private registerTools(
    server: McpServer,
    tools: Tool[],
    sessionId: string,
    domainPrefix: string,
    sessionMapping: Map<string, string>,
  ): void {
    for (const tool of tools) {
      // Construct qualified name for both registration AND policy evaluation (domain::tool)
      // Use :: for policy evaluation but __ for registration (MCP SDK name restrictions)
      // MCP SDK requires names to match ^[a-zA-Z0-9_-]{1,64}$, so replace dots and colons with underscores
      const policyQualifiedName = `${domainPrefix}::${tool.name}`;
      const registrationName = `${domainPrefix.replace(/[:.]/g, '_')}__${tool.name}`;

      try {
        // Store mapping: registration name -> policy qualified name
        sessionMapping.set(registrationName, policyQualifiedName);

        // Enhance description to include parameter info from schema
        let enhancedDescription =
          tool.description || `Tool from upstream MCP server: ${policyQualifiedName}`;

        // Add schema info to description as a workaround
        if (tool.inputSchema && typeof tool.inputSchema === 'object') {
          const schema = tool.inputSchema;
          if (
            'properties' in schema &&
            schema.properties &&
            typeof schema.properties === 'object'
          ) {
            enhancedDescription += `\n\nParameters:`;
            for (const paramName of Object.keys(schema.properties)) {
              const isRequired =
                'required' in schema &&
                Array.isArray(schema.required) &&
                schema.required.includes(paramName)
                  ? ' (required)'
                  : ' (optional)';
              enhancedDescription += `\n- ${paramName}${isRequired}`;
            }
          }
        }

        enhancedDescription += `\n\nSource: ${policyQualifiedName}\nNote: This tool call is subject to organization policies and will be logged to your audit trail.`;

        // Register WITH unique name to avoid collisions between servers with same tool names
        // Use registrationName (with __) instead of :: which isn't MCP SDK compliant
        server.registerTool(
          registrationName,
          {
            description: enhancedDescription,
            // DON'T pass inputSchema - causes SDK validation bug (v3Schema.safeParseAsync)
          },
          async (args: Record<string, unknown>) => {
            // WORKAROUND: SDK doesn't pass real arguments when inputSchema is omitted
            // Retrieve the arguments we intercepted from the JSON-RPC request
            const key = `${sessionId}:${registrationName}`;
            const actualArguments = pendingToolArguments.get(key);

            if (actualArguments) {
              logger.debug(
                `[MCP] Retrieved arguments for ${key}:`,
                JSON.stringify(actualArguments, null, 2),
              );
              // Clean up the map
              pendingToolArguments.delete(key);
              return await this.handleToolInvocation(sessionId, registrationName, actualArguments);
            } else {
              // Fallback to SDK-provided args (might be empty or metadata)
              logger.debug(
                `[MCP] No stored arguments for ${key}, using SDK args:`,
                JSON.stringify(args, null, 2),
              );
              return await this.handleToolInvocation(sessionId, registrationName, args);
            }
          },
        );
      } catch (error) {
        // Tool might already be registered or have naming issues, skip it
        logger.warn(`Failed to register tool ${registrationName}:`, error);
      }
    }
  }

  /**
   * Handle tool invocation with full policy evaluation, audit logging, and forwarding
   */
  private async handleToolInvocation(
    sessionId: string,
    toolName: string, // Original tool name (MCP-compliant, no domain prefix)
    parameters: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const connectionOrError = getConnectionOrError(sessionId);
    if (isCallToolResult(connectionOrError)) {
      return createErrorResult('SESSION_NOT_FOUND', 'No authenticated session found');
    }

    const { userContext } = connectionOrError;

    // Get workspace context for audit logging
    // LIMITATION: Uses first workspace the user belongs to. Proper workspace selection requires
    // client-side X-Workspace-Id header support (future work). For now, defaults to first workspace.
    const workspaceId = userContext.workspaceIds?.[0];

    // Check if session has been terminated by an admin
    const sessionStatus = await checkSessionStatus(userContext.organizationId, sessionId);
    if (sessionStatus.terminated) {
      logger.warn(`[SENTINEL] Rejecting request - session ${sessionId} has been terminated`);
      return createErrorResult(
        'SESSION_TERMINATED',
        sessionStatus.reason || 'Session has been terminated by an administrator',
      );
    }

    // DEBUG: Log incoming parameters
    const sanitizedForLog = sanitizeObject(parameters);
    logger.tool(`\n[SENTINEL] Tool invocation:`);
    logger.info(`   Tool: ${toolName}`);
    logger.info(`   User: ${userContext.email}`);
    logger.info(`   Parameters:`, JSON.stringify(sanitizedForLog, null, 2).substring(0, 800));

    // Get or create session for context tracking (non-blocking on failure)
    const sessionResult = await getOrCreateSessionForTracking(
      userContext.organizationId,
      sessionId, // external session ID
      userContext.userId,
      undefined, // agentId - could be extracted from session in future
      workspaceId,
    );
    const internalSessionId = sessionResult.sessionId;

    try {
      // 1. Look up qualified name (domain::tool) from mapping
      const sessionMapping = toolNameMapping.get(sessionId);
      if (!sessionMapping) {
        throw new Error(`No tool mapping found for session ${sessionId}`);
      }

      const qualifiedName = sessionMapping.get(toolName);
      if (!qualifiedName) {
        throw new Error(`No qualified name found for tool ${toolName} in session ${sessionId}`);
      }

      // 2. Parse qualified name to extract domain
      const [domainPart, tool] = qualifiedName.split('::');
      if (!domainPart || !tool) {
        throw new Error(
          `Invalid qualified tool name format. Expected 'domain::toolName', got: ${qualifiedName}`,
        );
      }

      // Extract domain and optional port
      const [domain, port] = domainPart.split(':');

      // 3. Look up MCP server by domain
      const mcpServer = await getMcpServer(userContext.organizationId, domain, port);

      if (!mcpServer) {
        return createErrorResult(
          'MCP_SERVER_NOT_FOUND',
          `No MCP server configured for domain: ${domainPart}`,
          { domain: domainPart },
        );
      }

      // 4. Evaluate policy (CRITICAL SECURITY PATH) - use qualified name
      const policyResult = await evaluatePolicy(
        userContext.userId,
        undefined, // agentId - could be extracted from session in future
        qualifiedName,
        parameters,
        internalSessionId ?? undefined,
        workspaceId,
      );

      const sanitizedParams = toJsonRecord(sanitizeRecord(parameters));

      // 5. Check if denied by policy - log and return early
      if (policyResult.decision === 'DENIED') {
        await logAuditEntry({
          organizationId: userContext.organizationId,
          userId: userContext.userId,
          agentId: undefined,
          workspaceId,
          toolName: qualifiedName,
          parameters: sanitizedParams,
          decision: policyResult.decision,
          justification: policyResult.justification ?? undefined,
          policyIds: policyResult.policyIds,
          matchedPolicyIds: policyResult.matchedPolicyIds,
          policySnapshot: policyResult.policySnapshot,
          userEmail: policyResult.userEmail,
          userRoles: policyResult.userRoles,
          agentName: policyResult.agentName,
          evaluationTree: policyResult.evaluationTree,
        });

        return createErrorResult(
          'POLICY_DENIED',
          `Access denied: ${policyResult.justification || 'No matching ALLOW policy'}`,
          { justification: policyResult.justification, policyIds: policyResult.policyIds },
        );
      }

      // 5b. Check if pending approval
      if (policyResult.decision === 'PENDING_APPROVAL') {
        logger.info(`[SENTINEL] Waiting for approval: ${policyResult.approvalRequestId}`);

        // Poll for approval - wait up to 5 minutes with 30 second poll intervals
        const approvalResult = await waitForApproval(
          userContext.organizationId,
          policyResult.approvalRequestId!,
          300000, // 5 minutes max wait
          30000, // 30 second poll interval
        );

        if (approvalResult.status === 'APPROVED') {
          // Approved! Log the approval and continue with tool execution
          logger.info(`[SENTINEL] Approval granted for ${policyResult.approvalRequestId}`);
          await logAuditEntry({
            organizationId: userContext.organizationId,
            userId: userContext.userId,
            agentId: undefined,
            workspaceId,
            toolName: qualifiedName,
            parameters: sanitizedParams,
            decision: 'ALLOWED',
            justification: 'Approved via approval request',
            policyIds: policyResult.policyIds,
            matchedPolicyIds: policyResult.matchedPolicyIds,
            policySnapshot: policyResult.policySnapshot,
            userEmail: policyResult.userEmail,
            userRoles: policyResult.userRoles,
            agentName: policyResult.agentName,
            approvalRequired: true,
            approvalRequestId: policyResult.approvalRequestId,
            approvalStatus: 'APPROVED',
            approvalDecidedBy: approvalResult.details?.decidedBy,
            approvalDecidedByEmail: approvalResult.details?.decidedByEmail,
            approvalDecidedAt: approvalResult.details?.decidedAt,
            evaluationTree: policyResult.evaluationTree,
          });
          // Fall through to continue with sensitive flags and tool execution
        } else {
          // Not approved - log and return error
          const statusMessage = getApprovalStatusMessage(approvalResult.status);

          await logAuditEntry({
            organizationId: userContext.organizationId,
            userId: userContext.userId,
            agentId: undefined,
            workspaceId,
            toolName: qualifiedName,
            parameters: sanitizedParams,
            decision: 'DENIED',
            justification: statusMessage,
            policyIds: policyResult.policyIds,
            matchedPolicyIds: policyResult.matchedPolicyIds,
            policySnapshot: policyResult.policySnapshot,
            userEmail: policyResult.userEmail,
            userRoles: policyResult.userRoles,
            agentName: policyResult.agentName,
            approvalRequired: true,
            approvalRequestId: policyResult.approvalRequestId,
            approvalStatus: approvalResult.status,
            approvalDecidedBy: approvalResult.details?.decidedBy,
            approvalDecidedByEmail: approvalResult.details?.decidedByEmail,
            approvalDecidedAt: approvalResult.details?.decidedAt,
            evaluationTree: policyResult.evaluationTree,
          });

          return createErrorResult(
            'APPROVAL_' + approvalResult.status,
            `${statusMessage}: ${policyResult.justification || 'Requires admin approval'}`,
            {
              justification: policyResult.justification,
              policyIds: policyResult.policyIds,
              approvalRequestId: policyResult.approvalRequestId,
              approvalStatus: approvalResult.status,
            },
          );
        }
      }

      // 6. Evaluate sensitive flags (post-policy scrutiny)
      // Note: Pass internalSessionId (CUID) not sessionId (UUID) for API validation
      // SECURITY: Fail-closed - if no session exists, deny the request
      let flagResult: Awaited<ReturnType<typeof evaluateSensitiveFlags>>;
      if (internalSessionId) {
        flagResult = await evaluateSensitiveFlags(
          userContext.organizationId,
          internalSessionId,
          userContext.userId,
          undefined, // agentId - could be extracted from session in future
          qualifiedName,
          parameters,
          workspaceId,
        );
      } else {
        // SECURITY: Fail-closed - deny if session cannot be created for sensitive flag evaluation
        logger.warn(
          `[SENTINEL] No internal session for sensitive flag evaluation - denying request`,
        );
        flagResult = {
          proceed: false,
          blockReason: 'Session required for sensitive flag evaluation',
        };
      }

      // 7. Log audit entry with approval details (if any)
      // We log AFTER sensitive flag evaluation so we can include approval info
      const approvalDetails = flagResult.approvalDetails;
      await logAuditEntry({
        organizationId: userContext.organizationId,
        userId: userContext.userId,
        agentId: undefined,
        workspaceId,
        toolName: qualifiedName,
        parameters: sanitizedParams,
        decision: flagResult.proceed ? policyResult.decision : 'DENIED',
        justification: flagResult.proceed
          ? (policyResult.justification ?? undefined)
          : flagResult.blockReason || 'Blocked by sensitive flag',
        policyIds: policyResult.policyIds,
        matchedPolicyIds: policyResult.matchedPolicyIds,
        policySnapshot: policyResult.policySnapshot,
        userEmail: policyResult.userEmail,
        userRoles: policyResult.userRoles,
        agentName: policyResult.agentName,
        // Live approval tracking
        approvalRequired: approvalDetails?.approvalRequired,
        approvalRequestId: approvalDetails?.approvalRequestId,
        approvalStatus: approvalDetails?.approvalStatus,
        approvalDecidedBy: approvalDetails?.approvalDecidedBy,
        approvalDecidedByEmail: approvalDetails?.approvalDecidedByEmail,
        approvalDecidedAt: approvalDetails?.approvalDecidedAt, // Already ISO string from API
        // Evaluation tree for audit visualization
        evaluationTree: policyResult.evaluationTree,
      });

      if (!flagResult.proceed) {
        return createErrorResult(
          'SENSITIVE_FLAG_BLOCKED',
          flagResult.blockReason || 'Tool blocked by sensitive flag',
          { approvalRequestId: flagResult.approvalRequestId },
        );
      }

      // 8. Get user credentials for this MCP server
      const userConfig = await getUserMcpConfig(userContext.userId, mcpServer.id);

      // 9. Check if authentication is required but missing
      if (mcpServer.authType !== 'NONE' && !userConfig) {
        return createErrorResult(
          'AUTHENTICATION_REQUIRED',
          `Authentication required for ${mcpServer.name}`,
          {
            authType: mcpServer.authType,
            mcpServerId: mcpServer.id,
            mcpServerName: mcpServer.name,
          },
        );
      }

      // 10. Validate credentials match auth type
      const hasCredentials = hasAuthMaterial(userConfig?.credentials || null);
      if ((mcpServer.authType === 'API_KEY' || mcpServer.authType === 'OAUTH') && !hasCredentials) {
        const credentialType = mcpServer.authType === 'API_KEY' ? 'API key' : 'OAuth access token';
        return createErrorResult(
          'INVALID_CREDENTIALS',
          `${credentialType} required for ${mcpServer.name}`,
          { authType: mcpServer.authType },
        );
      }

      // 11. Forward to upstream MCP server - use qualified name for routing
      // Pass organizationId and userId for session isolation
      const result = await forwardToMcpServer(
        mcpServer,
        userConfig?.credentials || null,
        qualifiedName,
        parameters,
        userContext.organizationId,
        userContext.userId,
      );

      // 12. Increment tool call count for session tracking (fire-and-forget)
      if (internalSessionId) {
        incrementSessionToolCallCount(userContext.organizationId, sessionId);
      }

      // 12b. Track parameter values for UI suggestions (fire-and-forget)
      // This enables autocomplete in the policy condition builder
      // Values are shared across all tools on the same MCP server by parameter key
      // Pass result to extract human-readable labels for ID parameters
      trackToolParamValues(
        userContext.organizationId,
        mcpServer.id,
        qualifiedName,
        parameters,
        result,
      );

      // 13. Return result with policy metadata
      // Add metadata about the policy decision for transparency
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
        // Include metadata for debugging and transparency
        // Note: MCP SDK doesn't expose custom headers, so we include metadata in response
        _meta: {
          sentinel: {
            policyDecision: policyResult.decision,
            policyIds: policyResult.matchedPolicyIds || policyResult.policyIds,
            user: userContext.email,
            tool: qualifiedName,
            timestamp: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      // Log error as DENIED in audit - try to get qualified name if available
      const sanitizedParams = toJsonRecord(sanitizeRecord(parameters));
      const sessionMapping = toolNameMapping.get(sessionId);
      const qualifiedNameForAudit = sessionMapping?.get(toolName) || toolName;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await logAuditEntry({
        organizationId: userContext.organizationId,
        userId: userContext.userId,
        agentId: undefined,
        workspaceId,
        toolName: qualifiedNameForAudit,
        parameters: sanitizedParams,
        decision: 'DENIED',
        justification: `Error: ${errorMessage}`,
        policyIds: [],
      });

      return createErrorResult('UPSTREAM_ERROR', errorMessage || 'Unknown error occurred');
    }
  }

  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : undefined);
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  async run(): Promise<void> {
    const port = parseInt(process.env.MCP_PORT || '3001', 10);

    // CORS headers for browser-based MCP clients (Cursor, VS Code extensions)
    const setCorsHeaders = (res: ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, mcp-session-id, Accept',
      );
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    };

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Set CORS headers on all responses
      setCorsHeaders(res);

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/health') {
        try {
          const healthData: {
            status: 'ok' | 'degraded' | 'error';
            server: string;
            version: string;
            timestamp: string;
            sessions: { active: number; total: number };
            components: {
              api: 'checking' | 'ok' | 'error' | 'unreachable';
              upstreamServers: Array<{
                name: string;
                url: string;
                status: 'ok' | 'error' | 'unreachable';
                responseTime?: string;
                error?: string;
              }> | null;
            };
            note?: string;
          } = {
            status: 'ok',
            server: 'sentinel-mcp-proxy',
            version: '0.1.0',
            timestamp: new Date().toISOString(),
            sessions: {
              active: this.transports.size,
              total: this.servers.size,
            },
            components: {
              api: 'checking',
              upstreamServers: [],
            },
          };

          // Check API connectivity
          try {
            const apiUrl = process.env.API_URL || 'http://localhost:3000';
            const apiHealthResponse = await fetch(`${apiUrl}/health`, {
              method: 'GET',
              signal: AbortSignal.timeout(2000),
            });
            healthData.components.api = apiHealthResponse.ok ? 'ok' : 'error';
          } catch {
            healthData.components.api = 'unreachable';
            healthData.status = 'degraded';
          }

          // SECURITY: Health endpoint should not expose organization-specific data
          // Upstream server checks require authentication and are not included here
          // Use the authenticated sentinel_diagnostics tool for detailed server status
          healthData.components.upstreamServers = null;
          healthData.note =
            'Use sentinel_diagnostics tool for upstream server status (requires auth)';

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(healthData, null, 2));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'error',
              server: 'sentinel-mcp-proxy',
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          );
        }
        return;
      }

      if (req.url === '/mcp' && req.method === 'POST') {
        try {
          const body = await this.parseRequestBody(req);
          const sessionIdHeader = req.headers['mcp-session-id'];
          const sessionId = typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;

          // Debug: Log incoming headers to diagnose Cursor connection issues
          logger.info('[MCP] Request headers:', {
            accept: req.headers['accept'],
            authorization: req.headers['authorization'] ? '[PRESENT]' : '[MISSING]',
            contentType: req.headers['content-type'],
            mcpSessionId: req.headers['mcp-session-id'],
            origin: req.headers['origin'],
            userAgent: req.headers['user-agent'],
          });

          logger.debug('[MCP] Incoming request', {
            hasSessionId: !!sessionId,
            sessionId: sessionId,
            isInitialize: isInitializeRequest(body),
            hasTransport: sessionId ? this.transports.has(sessionId) : false,
            totalSessions: this.transports.size,
            allSessionIds: Array.from(this.transports.keys()),
          });

          // WORKAROUND: Extract arguments from tools/call requests before SDK processes them
          // The SDK doesn't pass arguments to handlers when inputSchema is omitted
          if (body && typeof body === 'object' && 'method' in body) {
            logger.debug(`[MCP] Received ${body.method} request`);

            if (body.method === 'tools/call') {
              logger.debug(`[MCP] tools/call full request`, { body: sanitizeObject(body) });

              // Extract and store arguments for the handler to use
              if (
                typeof body === 'object' &&
                'params' in body &&
                body.params &&
                typeof body.params === 'object'
              ) {
                const params = body.params;
                if (
                  'name' in params &&
                  typeof params.name === 'string' &&
                  'arguments' in params &&
                  params.arguments &&
                  typeof params.arguments === 'object' &&
                  !Array.isArray(params.arguments) &&
                  sessionId
                ) {
                  const key = `${sessionId}:${params.name}`;
                  // After validation we know arguments is a non-null object - convert entries to Record
                  const argsRecord: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(params.arguments)) {
                    argsRecord[k] = v;
                  }
                  pendingToolArguments.set(key, argsRecord);
                  logger.debug(`[MCP] Stored arguments for ${key}`, {
                    args: sanitizeObject(argsRecord),
                  });
                }
              }
            }
          }

          let transport: StreamableHTTPServerTransport;

          if (sessionId && this.transports.has(sessionId)) {
            logger.success(`Found transport for session ${sessionId}`);
            transport = this.transports.get(sessionId)!;
            // Handle the request with the existing transport
            await transport.handleRequest(req, res, body);
            return;
          } else if (!sessionId && isInitializeRequest(body)) {
            const authHeader = req.headers['authorization'];
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
              sendJsonRpcError(res, -32000, 'Unauthorized: Bearer token required', 401);
              return;
            }

            const accessToken = authHeader.substring(7);
            let userContext: UserContext;

            try {
              const validationResult = await validateAccessToken(accessToken);
              if (!validationResult || !validationResult.valid) {
                sendJsonRpcError(res, -32000, 'Unauthorized: Invalid access token', 401);
                return;
              }
              userContext = validationResult;
            } catch (error) {
              logger.error('Error validating access token:', error);
              sendJsonRpcError(res, -32000, 'Unauthorized: Token validation failed', 401);
              return;
            }

            const newSessionId = randomUUID();
            const server = this.getServer(newSessionId);

            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => newSessionId,
              enableJsonResponse: true,
              onsessioninitialized: async (sessionId: string) => {
                await this.handleSessionInitialized(sessionId, transport, userContext);
              },
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, body);
            return;
          } else {
            sendJsonRpcError(res, -32000, 'Bad Request: No valid session ID provided', 400);
            return;
          }
        } catch (error) {
          logger.error('Error handling MCP request:', error);
          if (!res.headersSent) {
            sendJsonRpcError(res, -32603, 'Internal server error', 500);
          }
        }
        return;
      }

      if (req.url === '/mcp' && req.method === 'GET') {
        res.writeHead(405, { Allow: 'POST', 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    httpServer.listen(port, () => {
      logger.startup('SENTINEL MCP Proxy Server running');
      logger.mcp(`MCP HTTP endpoint: http://localhost:${port}/mcp`);
      logger.health(`Health check: http://localhost:${port}/health`);
      logger.mcp('API URL:', process.env.API_URL || 'http://localhost:3000');
      logger.success('Transparent proxy mode enabled');
      logger.info('   Policy evaluation: ✓');
      logger.info('   Audit logging: ✓');
      logger.info('   Credential management: ✓');
    });
  }
}
