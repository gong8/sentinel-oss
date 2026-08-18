import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getUserMcpConfig, refreshOAuthToken } from './api-client.js';
import { extractInjectedToolParams } from './credentials.js';
import { logger } from './logger.js';
import { sanitizeObject } from './redaction.js';
import { mcpSessionManager } from './session-manager.js';
import { createTransport } from './transport-factory.js';
import type { McpServer } from './types.js';
import { isPlainObject, withTimeout } from './utils.js';

/**
 * Check if an error indicates an auth failure (401/403)
 * These often occur when OAuth tokens expire
 */
function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const authKeywords = ['401', '403', 'unauthorized', 'forbidden'];

  if (authKeywords.some((keyword) => message.includes(keyword))) {
    return true;
  }

  // Check for HTTP error objects with status properties
  const statusCodes = [401, 403];
  if ('status' in error && typeof error.status === 'number' && statusCodes.includes(error.status)) {
    return true;
  }
  if (
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    statusCodes.includes(error.statusCode)
  ) {
    return true;
  }

  return false;
}

/**
 * Parse JSON strings in parameters to objects
 *
 * Some MCP clients (like Cursor) send complex parameters as JSON strings
 * instead of objects. This function recursively parses any JSON strings
 * found in the parameters to their object representations.
 *
 * @param params - Parameters object to transform
 * @returns Transformed parameters with JSON strings parsed to objects
 */
function parseJsonStrings(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      // Try to parse as JSON
      try {
        const trimmed = value.trim();
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          // First try direct JSON.parse (handles double quotes)
          try {
            const parsed = JSON.parse(value);
            logger.info(`   Auto-parsed '${key}' from JSON string to object`, undefined, {
              emoji: '🔄',
            });
            result[key] = parsed;
          } catch {
            // If that fails, try converting single quotes to double quotes
            // This handles Python-style strings like "{'key': 'value'}"
            const normalized = value
              .replace(/'/g, '"') // Replace single quotes with double quotes
              .replace(/\bTrue\b/g, 'true') // Python True -> JSON true
              .replace(/\bFalse\b/g, 'false') // Python False -> JSON false
              .replace(/\bNone\b/g, 'null'); // Python None -> JSON null

            const parsed = JSON.parse(normalized);
            logger.info(`   Auto-parsed '${key}' from Python-style string to object`, undefined, {
              emoji: '🔄',
            });
            result[key] = parsed;
          }
        } else {
          result[key] = value;
        }
      } catch {
        // Not valid JSON even after normalization, keep as string
        result[key] = value;
      }
    } else if (isPlainObject(value)) {
      // Recursively parse nested objects
      result[key] = parseJsonStrings(value);
    } else {
      // Keep other types as-is (numbers, booleans, arrays, null)
      result[key] = value;
    }
  }

  return result;
}

/** Default timeout for tool execution in milliseconds (5 minutes) */
const TOOL_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Execute a tool call on an MCP server
 * This is the core logic extracted for retry support
 */
async function executeToolCall(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
  actualToolName: string,
  parameters: Record<string, unknown>,
  organizationId: string,
  userId?: string,
  timeoutMs: number = TOOL_EXECUTION_TIMEOUT_MS,
): Promise<unknown> {
  // Get or create persistent session
  // SECURITY: organizationId required to prevent cross-org session sharing
  const client = await mcpSessionManager.getSession(mcpServer, credentials, organizationId, userId);

  // Transform parameters: parse JSON strings to objects
  const transformedParameters = parseJsonStrings(parameters);

  const injectedToolParams = extractInjectedToolParams(credentials);
  const finalParameters = injectedToolParams
    ? { ...transformedParameters, ...injectedToolParams }
    : transformedParameters;

  const sanitizedParams = sanitizeObject(finalParameters);

  logger.response(`\n[MCP Client] Forwarding to ${mcpServer.name}:`);
  logger.info(`   Tool: ${actualToolName}`);
  logger.info(`   Parameters being sent:`, JSON.stringify(sanitizedParams, null, 2));
  logger.info(
    `   Full call:`,
    JSON.stringify({ name: actualToolName, arguments: sanitizedParams }, null, 2),
  );

  const result = await withTimeout(
    client.callTool({ name: actualToolName, arguments: finalParameters }),
    timeoutMs,
    `Tool execution timeout after ${timeoutMs}ms for ${actualToolName} on ${mcpServer.name}`,
  );

  logger.success(`[MCP Client] Tool call successful`);
  logger.info(`   Response:`, JSON.stringify(result, null, 2).substring(0, 500));
  return result;
}

/**
 * Forward a tool invocation to an upstream MCP server
 *
 * Uses persistent session management to maintain MCP connections with proper
 * session ID handling and header configuration.
 *
 * Implements on-demand OAuth token refresh: if upstream returns 403/401,
 * attempts to refresh tokens once and retries the request.
 *
 * @param mcpServer - The MCP server to forward to
 * @param credentials - Decrypted user credentials (or null for NONE auth)
 * @param toolName - Full tool name in format: domain::toolName
 * @param parameters - Tool parameters
 * @param organizationId - Organization ID for session isolation (required for security)
 * @param userId - Optional user ID for session isolation
 * @returns Tool invocation result from upstream server
 */
export async function forwardToMcpServer(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
  toolName: string,
  parameters: Record<string, unknown>,
  organizationId: string,
  userId?: string,
): Promise<unknown> {
  // Validate and extract tool name
  const [, actualToolName] = toolName.split('::');
  if (!actualToolName) {
    throw new Error(`Invalid tool name format: ${toolName}`);
  }

  try {
    // First attempt
    return await executeToolCall(
      mcpServer,
      credentials,
      actualToolName,
      parameters,
      organizationId,
      userId,
    );
  } catch (error) {
    // Check if this is an auth error that might be resolved by token refresh
    if (isAuthError(error) && mcpServer.authType === 'OAUTH' && userId) {
      logger.warn(
        `[MCP Client] Got 403/401 from ${mcpServer.name}, attempting OAuth token refresh...`,
      );

      try {
        // Refresh the OAuth token
        const refreshResult = await refreshOAuthToken(userId, mcpServer.id);
        logger.info(
          `[MCP Client] Token refresh successful (level: ${refreshResult.level}), retrying...`,
        );

        // Close the existing session so it will be recreated with new credentials
        // SECURITY: Include organizationId to prevent cross-org session sharing
        await mcpSessionManager.closeSessionForServer(mcpServer.id, organizationId, userId);

        // Fetch fresh credentials after refresh
        const freshConfig = await getUserMcpConfig(userId, mcpServer.id);
        const freshCredentials = freshConfig?.credentials ?? null;

        // Retry with fresh credentials
        return await executeToolCall(
          mcpServer,
          freshCredentials,
          actualToolName,
          parameters,
          organizationId,
          userId,
        );
      } catch (refreshError) {
        // Token refresh failed - user must re-authenticate
        logger.error(`[MCP Client] Token refresh failed:`, refreshError);

        const errorMessage =
          refreshError instanceof Error ? refreshError.message : 'Token refresh failed';

        throw new Error(
          `OAuth token expired for ${mcpServer.name}. ${errorMessage}. ` +
            `Please re-authenticate with this MCP server.`,
        );
      }
    }

    // Not a 403 error or not OAuth - handle normally
    logger.error(`[MCP Client] Error forwarding tool call to ${mcpServer.name}:`, error);

    // Check for schema validation errors (common in FastMCP/Crucible Trader)
    if (error instanceof Error) {
      if (error.message.includes('safeParseAsync') || error.message.includes('v3Schema')) {
        throw new Error(
          `Upstream MCP server (${mcpServer.name}) has a schema validation bug. ` +
            `This is likely a FastMCP framework issue. ` +
            `Original error: ${error.message}`,
        );
      }

      // Check for MCP protocol errors
      if (error.message.includes('MCP error')) {
        throw new Error(`MCP protocol error from ${mcpServer.name}: ${error.message}`);
      }
    }

    throw error;
  }
}

/**
 * Result of listing tools from an upstream MCP server
 */
export interface ListedTools {
  tools: Tool[];
  domainPrefix: string; // e.g., "github.com" or "localhost:3005"
}

/**
 * List tools from an upstream MCP server
 * Uses the same discovery pattern as the API service
 *
 * @param mcpServer - The MCP server to list tools from
 * @param credentials - Decrypted user credentials (or null for NONE auth)
 * @returns Array of tools with original names (not prefixed) and domain prefix info
 */
export async function listToolsFromMcpServer(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
  timeoutMs: number = 10000,
): Promise<ListedTools> {
  const client = new Client({ name: 'sentinel-proxy', version: '0.1.0' }, { capabilities: {} });
  let cleanup: (() => Promise<void>) | null = null;

  async function closeAll(): Promise<void> {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
    if (cleanup) {
      try {
        await cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  try {
    const transportResult = await createTransport(mcpServer, credentials);
    cleanup = transportResult.cleanup;

    const timeoutMsg = `Timeout listing tools from ${mcpServer.url} after ${timeoutMs}ms`;
    await withTimeout(client.connect(transportResult.transport), timeoutMs, timeoutMsg);

    const toolsResponse = await withTimeout(client.listTools(), timeoutMs, timeoutMsg);
    await closeAll();

    const url = new URL(mcpServer.url);
    const domainPrefix = url.port ? `${url.hostname}:${url.port}` : url.hostname;

    return { tools: toolsResponse.tools, domainPrefix };
  } catch (error) {
    await closeAll();
    logger.error(`Error listing tools from ${mcpServer.url}:`, error);
    return { tools: [], domainPrefix: '' };
  }
}
