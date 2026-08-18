/**
 * A2A Proxy Server
 * HTTP proxy server for forwarding JSON-RPC requests to A2A agents
 * with credential injection and audit logging
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { getPrimarySecurityScheme } from './agent-card.js';
import {
  evaluatePolicy,
  evaluateSensitiveFlags,
  getA2AAgent,
  getA2ACredentials,
  isCardCacheStale,
  logA2AAuditEntry,
  pollApprovalStatus,
  refreshA2AAgentCard,
  validateAccessToken,
} from './api-client.js';
import { areCredentialsExpired, buildAuthHeaders, validateCredentials } from './credential.js';
import { logger } from './logger.js';
import type { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from './types.js';
import { extractParams, parseJsonRpcResponse, tryParseAgentCard } from './validation.js';

// ============================================================================
// REQUEST/RESPONSE HELPERS
// ============================================================================

function parseRequestBody(req: IncomingMessage): Promise<unknown> {
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

function sendJsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function sendJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  id: string | number | null = null,
): void {
  const error: JsonRpcError = { code, message };
  const response: JsonRpcResponse = {
    jsonrpc: '2.0',
    error,
    id,
  };
  sendJsonResponse(res, status, response);
}

function isJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    'jsonrpc' in body &&
    body.jsonrpc === '2.0' &&
    'method' in body &&
    typeof body.method === 'string' &&
    'id' in body
  );
}

// ============================================================================
// MAIN SERVER CLASS
// ============================================================================

export class A2AProxyServer {
  private port: number;

  constructor() {
    this.port = parseInt(process.env.A2A_PORT || '3002', 10);
  }

  /**
   * Forward a JSON-RPC request to an A2A agent
   */
  private async forwardRequest(
    endpointUrl: string,
    request: JsonRpcRequest,
    authHeaders: Record<string, string>,
  ): Promise<JsonRpcResponse> {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(request),
    });

    const responseBody: unknown = await response.json();

    // Validate JSON-RPC response structure
    const parsedResponse = parseJsonRpcResponse(responseBody);
    if (parsedResponse) {
      return parsedResponse;
    }

    // Wrap non-JSON-RPC response
    return {
      jsonrpc: '2.0',
      result: responseBody,
      id: request.id,
    };
  }

  /**
   * Handle the main A2A proxy request
   */
  private async handleA2ARequest(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void> {
    const startTime = Date.now();
    let agentId: string | undefined;
    let organizationId: string | undefined;
    let userId: string | undefined;
    let skillId: string | undefined;
    let workspaceId: string | null | undefined;

    try {
      // 1. Extract agent ID from URL path: /a2a/:agentId
      const urlParts = req.url?.split('/').filter(Boolean) || [];
      if (urlParts.length < 2 || urlParts[0] !== 'a2a') {
        sendJsonRpcError(res, 400, -32600, 'Invalid URL format. Expected /a2a/:agentId');
        return;
      }
      agentId = urlParts[1];

      // 2. Validate access token
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        sendJsonRpcError(res, 401, -32000, 'Unauthorized: Bearer token required');
        return;
      }

      const accessToken = authHeader.substring(7);
      const userContext = await validateAccessToken(accessToken);

      if (!userContext) {
        sendJsonRpcError(res, 401, -32000, 'Unauthorized: Invalid access token');
        return;
      }

      organizationId = userContext.organizationId;
      userId = userContext.userId;

      logger.info(`[A2A] Request from ${userContext.email} for agent ${agentId}`);

      // 3. Validate JSON-RPC request
      if (!isJsonRpcRequest(body)) {
        sendJsonRpcError(res, 400, -32600, 'Invalid JSON-RPC request');
        return;
      }

      // Extract skill ID from method if present (e.g., "tasks/send" or skill-specific methods)
      if (body.method.includes('/')) {
        skillId = body.method.split('/')[0];
      }

      // 4. Get agent details
      const agent = await getA2AAgent(organizationId, agentId);

      if (!agent) {
        sendJsonRpcError(res, 404, -32001, `A2A agent not found: ${agentId}`, body.id);
        return;
      }

      if (!agent.endpointUrl) {
        sendJsonRpcError(res, 500, -32002, `A2A agent has no endpoint URL: ${agent.name}`, body.id);
        return;
      }

      workspaceId = agent.workspaceId;

      logger.info(`[A2A] Forwarding to agent: ${agent.name} at ${agent.endpointUrl}`);

      // 4a. Validate workspace access
      // If the agent is scoped to a workspace, ensure the user has access to that workspace
      if (agent.workspaceId) {
        const userWorkspaceIds = userContext.workspaceIds ?? [];
        if (!userWorkspaceIds.includes(agent.workspaceId)) {
          logger.warn(
            `[A2A] Workspace access denied: User does not have access to workspace ${agent.workspaceId}`,
          );
          sendJsonRpcError(
            res,
            403,
            -32008,
            `Access denied: Agent not accessible in user workspace`,
            body.id,
          );
          return;
        }
      }

      // 5. Check if card cache is stale and refresh if needed
      let agentCard = agent.agentCardCache;
      if (agent.cardSource === 'URL' && isCardCacheStale(agent.agentCardFetchedAt)) {
        logger.info(`[A2A] Agent card cache stale, refreshing...`);
        const refreshResult = await refreshA2AAgentCard(organizationId, agentId);
        if (refreshResult.success && refreshResult.card) {
          agentCard = refreshResult.card;
          logger.success(`[A2A] Agent card refreshed`);
        } else {
          logger.warn(`[A2A] Failed to refresh card: ${refreshResult.error}`);
          // Continue with stale card
        }
      }

      // 6. Get and validate credentials
      const creds = await getA2ACredentials(organizationId, agentId, agentCard);
      let authHeaders: Record<string, string> = {};

      if (creds) {
        // Validate credentials
        const validation = validateCredentials(creds.authType, creds.credentials);
        if (!validation.valid) {
          sendJsonRpcError(res, 401, -32003, `Invalid credentials: ${validation.error}`, body.id);
          return;
        }

        // Check if credentials are expired
        if (areCredentialsExpired(creds.credentials)) {
          sendJsonRpcError(res, 401, -32004, 'Credentials have expired', body.id);
          return;
        }

        // Get security scheme from card if available
        const primaryScheme = agentCard ? getPrimarySecurityScheme(agentCard) : null;
        const securityScheme = primaryScheme?.scheme ?? creds.securityScheme;

        // Build auth headers
        authHeaders = buildAuthHeaders(creds.authType, creds.credentials, securityScheme);
        logger.info(`[A2A] Auth type: ${creds.authType}`);
      } else {
        logger.info(`[A2A] No credentials configured (using NONE auth)`);
      }

      // 7. POLICY EVALUATION (CRITICAL SECURITY PATH)
      // Build A2A-specific tool name for policy matching
      const typedCard = tryParseAgentCard(agentCard);
      const a2aToolName = `a2a::${agent.name}::${skillId || 'default'}`;
      const a2aProvider = typedCard?.provider?.organization;

      // Check for delegation: if an MCP agent is calling on behalf of the user
      // The MCP proxy can pass x-mcp-agent-id header to indicate delegation
      const mcpAgentId = req.headers['x-mcp-agent-id'];
      const isDelegation = typeof mcpAgentId === 'string' && mcpAgentId.length > 0;

      if (isDelegation) {
        logger.info(`[A2A] Delegation detected: MCP agent ${mcpAgentId} acting on behalf of user`);
      }

      logger.info(`[A2A] Evaluating policy for: ${a2aToolName}`);

      // Generate session ID for approval request support
      // Include workspace to ensure session uniqueness per workspace context
      const workspaceScope = agent.workspaceId ?? 'global';
      const sessionId = `a2a:${agentId}:${userId}:${workspaceScope}`;

      // When delegation is active:
      // - agentId = the MCP agent making the call
      // - delegatedUserId = the user the agent is acting on behalf of
      // - Both must have permission (AND logic)
      const policyResult = await evaluatePolicy(
        userId,
        isDelegation ? mcpAgentId : undefined, // MCP agent (if delegating)
        a2aToolName,
        extractParams(body.params),
        {
          a2aAgentId: agentId,
          a2aProvider,
          a2aSkillId: skillId,
        },
        isDelegation ? userId : undefined, // User being acted on behalf of (if delegating)
        sessionId, // Session ID for approval requests
        agent.workspaceId, // Workspace ID for workspace-scoped policy filtering
      );

      if (policyResult.decision === 'DENIED') {
        logger.warn(`[A2A] Policy DENIED: ${policyResult.justification}`);

        // Log denied request
        void logA2AAuditEntry({
          organizationId,
          agentId,
          skillId,
          userId,
          workspaceId: agent.workspaceId,
          request: body,
          durationMs: Date.now() - startTime,
          success: false,
          error: `Policy denied: ${policyResult.justification}`,
        });

        sendJsonRpcError(
          res,
          403,
          -32005,
          `Access denied: ${policyResult.justification || 'Policy violation'}`,
          body.id,
        );
        return;
      }

      if (policyResult.decision === 'PENDING_APPROVAL') {
        logger.info(`[A2A] Policy PENDING_APPROVAL: ${policyResult.justification}`);
        logger.info(`[A2A] Waiting for approval: ${policyResult.approvalRequestId}`);

        // Poll for approval - wait up to 5 minutes with 30 second poll intervals
        const maxWaitMs = 300000; // 5 minutes
        const pollIntervalMs = 30000; // 30 seconds
        const pollStartTime = Date.now();
        let approvalResult = await pollApprovalStatus(
          organizationId,
          policyResult.approvalRequestId!,
          pollIntervalMs,
        );

        while (approvalResult.shouldPoll && Date.now() - pollStartTime < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          approvalResult = await pollApprovalStatus(
            organizationId,
            policyResult.approvalRequestId!,
            pollIntervalMs,
          );
        }

        if (approvalResult.status === 'APPROVED') {
          // Approved! Log and continue with request forwarding
          logger.info(`[A2A] Approval granted for ${policyResult.approvalRequestId}`);
          void logA2AAuditEntry({
            organizationId,
            agentId,
            skillId,
            userId,
            workspaceId: agent.workspaceId,
            request: body,
            durationMs: Date.now() - startTime,
            success: true,
            error: undefined,
          });
          // Fall through to continue with sensitive flags and request forwarding
        } else {
          // Not approved - log and return error
          const statusMessages: Record<string, string> = {
            DENIED: 'Approval denied',
            EXPIRED: 'Approval request expired',
            CANCELLED: 'Approval request cancelled',
            PENDING: 'Approval timeout - request still pending',
          };
          const statusMessage =
            statusMessages[approvalResult.status] || 'Approval request not found';

          logger.warn(`[A2A] ${statusMessage}: ${policyResult.approvalRequestId}`);

          void logA2AAuditEntry({
            organizationId,
            agentId,
            skillId,
            userId,
            workspaceId: agent.workspaceId,
            request: body,
            durationMs: Date.now() - startTime,
            success: false,
            error: `${statusMessage}: ${policyResult.justification}`,
          });

          sendJsonRpcError(
            res,
            403,
            -32007,
            `${statusMessage}: ${policyResult.justification || 'Requires admin approval'}`,
            body.id,
          );
          return;
        }
      }

      logger.info(`[A2A] Policy ALLOWED`);

      // 8. SENSITIVE FLAGS EVALUATION
      // sessionId was already generated above for policy evaluation
      const flagResult = await evaluateSensitiveFlags(
        organizationId,
        sessionId,
        userId,
        undefined, // No MCP agent
        a2aToolName,
        extractParams(body.params),
        agent.workspaceId, // Workspace ID for workspace-scoped flag filtering
      );

      if (!flagResult.proceed) {
        logger.warn(`[A2A] Sensitive flags blocked: ${flagResult.blockReason}`);

        // Log blocked request
        void logA2AAuditEntry({
          organizationId,
          agentId,
          skillId,
          userId,
          workspaceId: agent.workspaceId,
          request: body,
          durationMs: Date.now() - startTime,
          success: false,
          error: `Blocked by sensitive flags: ${flagResult.blockReason}`,
        });

        sendJsonRpcError(
          res,
          429,
          -32006,
          flagResult.blockReason || 'Request blocked by rate limit or approval requirement',
          body.id,
        );
        return;
      }

      // 9. Forward request to agent
      const response = await this.forwardRequest(agent.endpointUrl, body, authHeaders);

      const durationMs = Date.now() - startTime;
      const success = !response.error;

      logger.info(
        `[A2A] Response from ${agent.name}: ${success ? 'success' : 'error'} (${durationMs}ms)`,
      );

      // 8. Log audit entry (fire and forget)
      void logA2AAuditEntry({
        organizationId,
        agentId,
        skillId,
        userId,
        workspaceId: agent.workspaceId,
        request: body,
        response,
        durationMs,
        success,
        error: response.error?.message,
      });

      // 9. Return response
      sendJsonResponse(res, 200, response);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`[A2A] Error:`, error);

      // Log failed request
      if (organizationId && agentId) {
        void logA2AAuditEntry({
          organizationId,
          agentId,
          skillId,
          userId,
          workspaceId,
          request: body,
          durationMs,
          success: false,
          error: errorMessage,
        });
      }

      sendJsonRpcError(
        res,
        500,
        -32603,
        `Internal error: ${errorMessage}`,
        isJsonRpcRequest(body) ? body.id : null,
      );
    }
  }

  /**
   * Handle health check requests
   */
  private handleHealthCheck(res: ServerResponse): void {
    sendJsonResponse(res, 200, {
      status: 'ok',
      server: 'sentinel-a2a-proxy',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Start the proxy server
   */
  async run(): Promise<void> {
    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Health check endpoint
      if (req.url === '/health' && req.method === 'GET') {
        this.handleHealthCheck(res);
        return;
      }

      // A2A proxy endpoint: /a2a/:agentId
      if (req.url?.startsWith('/a2a/') && req.method === 'POST') {
        try {
          const body = await parseRequestBody(req);
          await this.handleA2ARequest(req, res, body);
        } catch (error) {
          logger.error('Error parsing request body:', error);
          sendJsonRpcError(res, 400, -32700, 'Parse error: Invalid JSON');
        }
        return;
      }

      // Method not allowed for /a2a
      if (req.url?.startsWith('/a2a/') && req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST', 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
      }

      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    httpServer.listen(this.port, () => {
      logger.startup('SENTINEL A2A Proxy Server running');
      logger.info(`A2A HTTP endpoint: http://localhost:${this.port}/a2a/:agentId`);
      logger.health(`Health check: http://localhost:${this.port}/health`);
      logger.info('API URL:', process.env.API_URL || 'http://localhost:3000');
      logger.success('A2A proxy mode enabled');
      logger.info('   Credential injection: ✓');
      logger.info('   Audit logging: ✓');
      logger.info('   Card caching: ✓');
    });
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(): Promise<void> {
  const server = new A2AProxyServer();
  await server.run();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Failed to start A2A proxy server:', error);
    process.exit(1);
  });
}
