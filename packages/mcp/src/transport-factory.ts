/**
 * Transport factory for creating MCP client transports based on server configuration
 */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { buildCredentialHeaders } from './credentials.js';
import { logger } from './logger.js';
import {
  createSseClientTransport,
  createStdioClientTransport,
  createWebSocketClientTransport,
} from './transports/index.js';
import type { McpServer } from './types.js';
import { buildMcpHeaders } from './utils.js';

/**
 * Result from creating a transport via the factory
 */
export interface TransportFactoryResult {
  /** The transport instance */
  transport: Transport;
  /** Cleanup function to close the transport */
  cleanup: () => Promise<void>;
}

/**
 * Parse JSON string to environment record
 */
function parseEnvString(envStr: string | null | undefined): Record<string, string> | undefined {
  if (!envStr) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(envStr) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return undefined;
  } catch {
    logger.warn(`Failed to parse stdio env JSON: ${envStr}`);
    return undefined;
  }
}

/**
 * Create HTTP transport (default, using StreamableHTTPClientTransport)
 */
function createHttpTransport(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
): TransportFactoryResult {
  const headers = buildMcpHeaders(buildCredentialHeaders(mcpServer.authType, credentials));
  const transport = new StreamableHTTPClientTransport(new URL(mcpServer.url), {
    requestInit: { headers },
  });

  return {
    transport,
    cleanup: async () => {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    },
  };
}

/**
 * Create stdio transport for local subprocess MCP servers
 */
async function createStdioTransport(mcpServer: McpServer): Promise<TransportFactoryResult> {
  if (!mcpServer.stdioCommand) {
    throw new Error(`Stdio transport requires stdioCommand for server ${mcpServer.name}`);
  }

  const result = await createStdioClientTransport({
    command: mcpServer.stdioCommand,
    args: mcpServer.stdioArgs ?? undefined,
    workingDir: mcpServer.stdioWorkingDir ?? undefined,
    env: parseEnvString(mcpServer.stdioEnv),
  });

  return {
    transport: result.transport,
    cleanup: result.close,
  };
}

/**
 * Create SSE transport for legacy MCP servers
 */
async function createSseTransport(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
): Promise<TransportFactoryResult> {
  const headers = buildMcpHeaders(buildCredentialHeaders(mcpServer.authType, credentials));
  const result = await createSseClientTransport({
    url: mcpServer.url,
    headers,
  });

  return {
    transport: result.transport,
    cleanup: result.close,
  };
}

/**
 * Create WebSocket transport for bidirectional MCP communication
 */
async function createWsTransport(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
): Promise<TransportFactoryResult> {
  const headers = buildMcpHeaders(buildCredentialHeaders(mcpServer.authType, credentials));
  const result = await createWebSocketClientTransport({
    url: mcpServer.url,
    headers,
    reconnect: true,
    maxReconnectAttempts: mcpServer.wsMaxRetries ?? 10,
    initialReconnectDelay: mcpServer.wsReconnectMs ?? 1000,
    heartbeat: true,
    heartbeatInterval: mcpServer.wsHeartbeatMs ?? 30000,
  });

  return {
    transport: result.transport,
    cleanup: result.close,
  };
}

/**
 * Create a transport for an MCP server based on its configuration
 *
 * Supports:
 * - HTTP (default): StreamableHTTPClientTransport for modern MCP servers
 * - STDIO: Local subprocess communication via stdin/stdout
 * - SSE: Server-Sent Events for legacy MCP servers
 * - WEBSOCKET: Bidirectional WebSocket communication
 *
 * @param mcpServer - The MCP server configuration
 * @param credentials - Decrypted user credentials (or null for NONE auth)
 * @returns Transport instance and cleanup function
 */
export async function createTransport(
  mcpServer: McpServer,
  credentials: Record<string, unknown> | null,
): Promise<TransportFactoryResult> {
  const transportType = mcpServer.transportType ?? 'HTTP';

  logger.debug(`Creating ${transportType} transport for ${mcpServer.name}`, undefined, {
    emoji: '🔌',
  });

  switch (transportType) {
    case 'HTTP':
      return createHttpTransport(mcpServer, credentials);

    case 'STDIO':
      return createStdioTransport(mcpServer);

    case 'SSE':
      return createSseTransport(mcpServer, credentials);

    case 'WEBSOCKET':
      return createWsTransport(mcpServer, credentials);

    default: {
      const exhaustiveCheck: never = transportType;
      throw new Error(`Unsupported transport type: ${exhaustiveCheck}`);
    }
  }
}
