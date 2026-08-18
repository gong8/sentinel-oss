/**
 * Transport factory for creating MCP transports from configuration
 */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { decryptString } from '../crypto.js';
import { logger } from '../logger.js';
import { isPlainObject } from '../utils.js';
import { createSseClientTransport } from './sse-transport.js';
import { createStdioClientTransport } from './stdio-transport.js';
import type {
  ClientTransportResult,
  SseTransportConfig,
  StdioTransportConfig,
  WebSocketTransportConfig,
} from './types.js';
import { createWebSocketClientTransport } from './websocket-transport.js';

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
  type: 'HTTP';
  url: string;
  headers?: Record<string, string>;
}

/**
 * Tagged STDIO transport configuration
 */
export interface TaggedStdioTransportConfig extends StdioTransportConfig {
  type: 'STDIO';
}

/**
 * Tagged SSE transport configuration
 */
export interface TaggedSseTransportConfig extends SseTransportConfig {
  type: 'SSE';
}

/**
 * Tagged WebSocket transport configuration
 */
export interface TaggedWebSocketTransportConfig extends WebSocketTransportConfig {
  type: 'WEBSOCKET';
}

/**
 * Union of all transport configurations
 */
export type TransportConfig =
  | HttpTransportConfig
  | TaggedStdioTransportConfig
  | TaggedSseTransportConfig
  | TaggedWebSocketTransportConfig;

/**
 * Database McpServer model shape (from Prisma)
 */
export interface McpServerModel {
  id: string;
  url: string;
  authType: 'NONE' | 'OAUTH' | 'API_KEY';
  transportType: 'HTTP' | 'STDIO' | 'SSE' | 'WEBSOCKET';
  // STDIO config
  stdioCommand?: string | null;
  stdioArgs?: unknown; // JSON array
  stdioWorkingDir?: string | null;
  stdioEnv?: string | null; // Encrypted
  // WebSocket config
  wsReconnectMs?: number | null;
  wsMaxRetries?: number | null;
  wsHeartbeatMs?: number | null;
}

/**
 * Create HTTP/Streamable HTTP transport
 */
async function createHttpTransport(config: HttpTransportConfig): Promise<ClientTransportResult> {
  logger.mcp(`Creating HTTP transport: ${config.url}`);

  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers ?? {} },
  });

  return {
    transport,
    close: async () => {
      await transport.close();
    },
  };
}

/**
 * Create transport from configuration
 */
export async function createTransportFromConfig(
  config: TransportConfig,
): Promise<ClientTransportResult> {
  switch (config.type) {
    case 'HTTP':
      return createHttpTransport(config);

    case 'STDIO':
      return createStdioClientTransport({
        command: config.command,
        args: config.args,
        workingDir: config.workingDir,
        env: config.env,
      });

    case 'SSE':
      return createSseClientTransport({
        url: config.url,
        headers: config.headers,
        connectionTimeout: config.connectionTimeout,
      });

    case 'WEBSOCKET':
      return createWebSocketClientTransport({
        url: config.url,
        headers: config.headers,
        reconnect: config.reconnect,
        maxReconnectAttempts: config.maxReconnectAttempts,
        initialReconnectDelay: config.initialReconnectDelay,
        maxReconnectDelay: config.maxReconnectDelay,
        reconnectBackoffMultiplier: config.reconnectBackoffMultiplier,
        heartbeat: config.heartbeat,
        heartbeatInterval: config.heartbeatInterval,
        heartbeatTimeout: config.heartbeatTimeout,
        connectionTimeout: config.connectionTimeout,
      });

    default: {
      const exhaustiveCheck: never = config;
      throw new Error(`Unknown transport type: ${(exhaustiveCheck as TransportConfig).type}`);
    }
  }
}

/**
 * Parse stdioArgs from JSON to string array
 */
function parseStdioArgs(args: unknown): string[] {
  if (args === null || args === undefined) {
    return [];
  }

  if (Array.isArray(args)) {
    return args.filter((arg): arg is string => typeof arg === 'string');
  }

  if (typeof args === 'string') {
    const parsed: unknown = JSON.parse(args);
    if (Array.isArray(parsed)) {
      return parsed.filter((arg): arg is string => typeof arg === 'string');
    }
  }

  return [];
}

/**
 * Decrypt stdio environment variables
 */
export function decryptStdioEnv(encryptedEnv: string | null | undefined): Record<string, string> {
  if (!encryptedEnv) {
    return {};
  }

  const decrypted: unknown = JSON.parse(decryptString(encryptedEnv));

  if (!isPlainObject(decrypted)) {
    logger.warn('Decrypted stdio env is not a valid object');
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(decrypted)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Build transport config from McpServer database model
 */
export function buildTransportConfig(
  server: McpServerModel,
  headers: Record<string, string> = {},
): TransportConfig {
  switch (server.transportType) {
    case 'HTTP':
      return {
        type: 'HTTP',
        url: server.url,
        headers,
      };

    case 'STDIO': {
      if (!server.stdioCommand) {
        throw new Error(`STDIO transport requires stdioCommand for server ${server.id}`);
      }

      const env = decryptStdioEnv(server.stdioEnv);

      return {
        type: 'STDIO',
        command: server.stdioCommand,
        args: parseStdioArgs(server.stdioArgs),
        workingDir: server.stdioWorkingDir ?? undefined,
        env,
      };
    }

    case 'SSE':
      return {
        type: 'SSE',
        url: server.url,
        headers,
      };

    case 'WEBSOCKET': {
      const wsUrl = convertToWebSocketUrl(server.url);

      return {
        type: 'WEBSOCKET',
        url: wsUrl,
        headers,
        initialReconnectDelay: server.wsReconnectMs ?? undefined,
        maxReconnectAttempts: server.wsMaxRetries ?? undefined,
        heartbeatInterval: server.wsHeartbeatMs ?? undefined,
      };
    }

    default: {
      const exhaustiveCheck: never = server.transportType;
      throw new Error(`Unknown transport type: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Convert HTTP/HTTPS URL to WebSocket URL (ws/wss)
 */
function convertToWebSocketUrl(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'ws://');
  }
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://');
  }
  return url;
}
