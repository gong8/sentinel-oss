/**
 * Unit tests for MCP Transport Factory
 * Tests transport creation for different protocols (HTTP, STDIO, SSE, WEBSOCKET)
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock all transport modules before importing the factory
const mockHttpTransportClose = vi.fn().mockResolvedValue(undefined);
const mockHttpTransportStart = vi.fn().mockResolvedValue(undefined);
const mockHttpTransportSend = vi.fn().mockResolvedValue(undefined);

class MockStreamableHTTPClientTransport {
  close = mockHttpTransportClose;
  start = mockHttpTransportStart;
  send = mockHttpTransportSend;
}

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(function (
    this: MockStreamableHTTPClientTransport,
  ) {
    return new MockStreamableHTTPClientTransport();
  }),
}));

vi.mock('../../../packages/mcp/src/transports/index.js', () => ({
  createStdioClientTransport: vi.fn().mockResolvedValue({
    transport: {
      close: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    },
    close: vi.fn().mockResolvedValue(undefined),
  }),
  createSseClientTransport: vi.fn().mockResolvedValue({
    transport: {
      close: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    },
    close: vi.fn().mockResolvedValue(undefined),
  }),
  createWebSocketClientTransport: vi.fn().mockResolvedValue({
    transport: {
      close: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    },
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../packages/mcp/src/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../packages/mcp/src/credentials.js', () => ({
  buildCredentialHeaders: vi.fn().mockImplementation((authType, credentials) => {
    const headers: Record<string, string> = {};
    if (authType === 'API_KEY' && credentials?.apiKey) {
      headers['Authorization'] = `Bearer ${credentials.apiKey}`;
    }
    if (authType === 'OAUTH' && credentials?.accessToken) {
      headers['Authorization'] = `Bearer ${credentials.accessToken}`;
    }
    if (credentials?.headers) {
      Object.assign(headers, credentials.headers);
    }
    return headers;
  }),
}));

vi.mock('../../../packages/mcp/src/utils.js', () => ({
  buildMcpHeaders: vi.fn().mockImplementation((headers = {}) => ({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...headers,
  })),
}));

// Import after mocking
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildCredentialHeaders } from '../../../packages/mcp/src/credentials.js';
import { logger } from '../../../packages/mcp/src/logger.js';
import { createTransport } from '../../../packages/mcp/src/transport-factory.js';
import {
  createSseClientTransport,
  createStdioClientTransport,
  createWebSocketClientTransport,
} from '../../../packages/mcp/src/transports/index.js';
import type { McpServer } from '../../../packages/mcp/src/types.js';
import { buildMcpHeaders } from '../../../packages/mcp/src/utils.js';

describe('MCP Transport Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create a base McpServer object
  function createMcpServer(overrides: Partial<McpServer> = {}): McpServer {
    return {
      id: 'test-server-id',
      name: 'Test Server',
      url: 'https://example.com/mcp',
      trusted: true,
      authType: 'NONE',
      ...overrides,
    };
  }

  describe('createTransport', () => {
    describe('HTTP transport (default)', () => {
      test('should create HTTP transport when transportType is HTTP', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          url: 'https://api.example.com/mcp',
        });

        const result = await createTransport(mcpServer, null);

        expect(result).toBeDefined();
        expect(result.transport).toBeDefined();
        expect(typeof result.cleanup).toBe('function');
        expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
          new URL('https://api.example.com/mcp'),
          expect.objectContaining({
            requestInit: expect.objectContaining({ headers: expect.any(Object) }),
          }),
        );
      });

      test('should create HTTP transport when transportType is undefined (default)', async () => {
        const mcpServer = createMcpServer({
          transportType: undefined,
          url: 'https://api.example.com/mcp',
        });

        const result = await createTransport(mcpServer, null);

        expect(result).toBeDefined();
        expect(StreamableHTTPClientTransport).toHaveBeenCalled();
      });

      test('should include credentials headers for API_KEY auth', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          authType: 'API_KEY',
          url: 'https://api.example.com/mcp',
        });
        const credentials = { apiKey: 'test-api-key' };

        await createTransport(mcpServer, credentials);

        expect(buildCredentialHeaders).toHaveBeenCalledWith('API_KEY', credentials);
        expect(buildMcpHeaders).toHaveBeenCalled();
      });

      test('should include credentials headers for OAUTH auth', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          authType: 'OAUTH',
          url: 'https://api.example.com/mcp',
        });
        const credentials = { accessToken: 'test-oauth-token' };

        await createTransport(mcpServer, credentials);

        expect(buildCredentialHeaders).toHaveBeenCalledWith('OAUTH', credentials);
      });

      test('should not add auth headers for NONE auth type', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          authType: 'NONE',
          url: 'https://api.example.com/mcp',
        });

        await createTransport(mcpServer, null);

        expect(buildCredentialHeaders).toHaveBeenCalledWith('NONE', null);
      });

      test('cleanup should close transport silently on error', async () => {
        const errorClose = vi.fn().mockRejectedValue(new Error('Close error'));
        vi.mocked(StreamableHTTPClientTransport).mockImplementationOnce(function () {
          return {
            close: errorClose,
            start: vi.fn().mockResolvedValue(undefined),
            send: vi.fn().mockResolvedValue(undefined),
          } as unknown as MockStreamableHTTPClientTransport;
        });

        const mcpServer = createMcpServer({ transportType: 'HTTP' });
        const result = await createTransport(mcpServer, null);

        // Should not throw
        await expect(result.cleanup()).resolves.toBeUndefined();
      });

      test('should log transport creation', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          name: 'My Test Server',
        });

        await createTransport(mcpServer, null);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('HTTP'),
          undefined,
          expect.any(Object),
        );
      });
    });

    describe('STDIO transport', () => {
      test('should create STDIO transport with command', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioArgs: ['server.js', '--port', '3000'],
          stdioWorkingDir: '/app',
        });

        const result = await createTransport(mcpServer, null);

        expect(result).toBeDefined();
        expect(result.transport).toBeDefined();
        expect(createStdioClientTransport).toHaveBeenCalledWith({
          command: 'node',
          args: ['server.js', '--port', '3000'],
          workingDir: '/app',
          env: undefined,
        });
      });

      test('should throw error when stdioCommand is missing', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: undefined,
          name: 'Test STDIO Server',
        });

        await expect(createTransport(mcpServer, null)).rejects.toThrow(
          'Stdio transport requires stdioCommand for server Test STDIO Server',
        );
      });

      test('should throw error when stdioCommand is null', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: null,
          name: 'Test STDIO Server',
        });

        await expect(createTransport(mcpServer, null)).rejects.toThrow(
          'Stdio transport requires stdioCommand for server Test STDIO Server',
        );
      });

      test('should handle undefined stdioArgs', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'python',
          stdioArgs: undefined,
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            command: 'python',
            args: undefined,
          }),
        );
      });

      test('should handle null stdioArgs', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'python',
          stdioArgs: null,
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            command: 'python',
            args: undefined,
          }),
        );
      });

      test('should handle undefined stdioWorkingDir', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioWorkingDir: undefined,
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            workingDir: undefined,
          }),
        );
      });

      test('should parse valid stdioEnv JSON', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: JSON.stringify({ NODE_ENV: 'production', DEBUG: 'true' }),
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: { NODE_ENV: 'production', DEBUG: 'true' },
          }),
        );
      });

      test('should handle null stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: null,
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('should handle empty string stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: '',
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('should handle invalid JSON stdioEnv and log warning', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: 'not valid json',
        });

        await createTransport(mcpServer, null);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to parse stdio env JSON'),
        );
        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('should handle array JSON in stdioEnv (invalid) and return undefined', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: '["not", "an", "object"]',
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('cleanup should call close from transport result', async () => {
        const mockClose = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createStdioClientTransport).mockResolvedValueOnce({
          transport: {
            close: vi.fn(),
            start: vi.fn(),
            send: vi.fn(),
          } as unknown as Transport,
          close: mockClose,
        });

        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
        });

        const result = await createTransport(mcpServer, null);
        await result.cleanup();

        expect(mockClose).toHaveBeenCalled();
      });
    });

    describe('SSE transport', () => {
      test('should create SSE transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'SSE',
          url: 'https://sse.example.com/events',
        });

        const result = await createTransport(mcpServer, null);

        expect(result).toBeDefined();
        expect(result.transport).toBeDefined();
        expect(createSseClientTransport).toHaveBeenCalledWith({
          url: 'https://sse.example.com/events',
          headers: expect.any(Object),
        });
      });

      test('should include credentials in SSE headers', async () => {
        const mcpServer = createMcpServer({
          transportType: 'SSE',
          authType: 'API_KEY',
          url: 'https://sse.example.com/events',
        });
        const credentials = { apiKey: 'sse-api-key' };

        await createTransport(mcpServer, credentials);

        expect(buildCredentialHeaders).toHaveBeenCalledWith('API_KEY', credentials);
        expect(buildMcpHeaders).toHaveBeenCalled();
      });

      test('cleanup should call close from SSE transport result', async () => {
        const mockClose = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createSseClientTransport).mockResolvedValueOnce({
          transport: {
            close: vi.fn(),
            start: vi.fn(),
            send: vi.fn(),
          } as unknown as Transport,
          close: mockClose,
        });

        const mcpServer = createMcpServer({
          transportType: 'SSE',
          url: 'https://sse.example.com',
        });

        const result = await createTransport(mcpServer, null);
        await result.cleanup();

        expect(mockClose).toHaveBeenCalled();
      });
    });

    describe('WEBSOCKET transport', () => {
      test('should create WebSocket transport with default options', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/mcp',
        });

        const result = await createTransport(mcpServer, null);

        expect(result).toBeDefined();
        expect(result.transport).toBeDefined();
        expect(createWebSocketClientTransport).toHaveBeenCalledWith({
          url: 'wss://ws.example.com/mcp',
          headers: expect.any(Object),
          reconnect: true,
          maxReconnectAttempts: 10,
          initialReconnectDelay: 1000,
          heartbeat: true,
          heartbeatInterval: 30000,
        });
      });

      test('should use custom wsMaxRetries when provided', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/mcp',
          wsMaxRetries: 5,
        });

        await createTransport(mcpServer, null);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            maxReconnectAttempts: 5,
          }),
        );
      });

      test('should use custom wsReconnectMs when provided', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/mcp',
          wsReconnectMs: 2000,
        });

        await createTransport(mcpServer, null);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            initialReconnectDelay: 2000,
          }),
        );
      });

      test('should use custom wsHeartbeatMs when provided', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/mcp',
          wsHeartbeatMs: 15000,
        });

        await createTransport(mcpServer, null);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            heartbeatInterval: 15000,
          }),
        );
      });

      test('should use default values when ws options are null', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/mcp',
          wsMaxRetries: null,
          wsReconnectMs: null,
          wsHeartbeatMs: null,
        });

        await createTransport(mcpServer, null);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            maxReconnectAttempts: 10,
            initialReconnectDelay: 1000,
            heartbeatInterval: 30000,
          }),
        );
      });

      test('should include credentials in WebSocket headers', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          authType: 'OAUTH',
          url: 'wss://ws.example.com/mcp',
        });
        const credentials = { accessToken: 'ws-oauth-token' };

        await createTransport(mcpServer, credentials);

        expect(buildCredentialHeaders).toHaveBeenCalledWith('OAUTH', credentials);
      });

      test('cleanup should call close from WebSocket transport result', async () => {
        const mockClose = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createWebSocketClientTransport).mockResolvedValueOnce({
          transport: {
            close: vi.fn(),
            start: vi.fn(),
            send: vi.fn(),
          } as unknown as Transport,
          close: mockClose,
        });

        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com',
        });

        const result = await createTransport(mcpServer, null);
        await result.cleanup();

        expect(mockClose).toHaveBeenCalled();
      });
    });

    describe('error scenarios', () => {
      test('should throw error for unsupported transport type', async () => {
        const mcpServer = createMcpServer({
          // Force an invalid transport type for testing
          transportType: 'UNKNOWN' as McpServer['transportType'],
        });

        await expect(createTransport(mcpServer, null)).rejects.toThrow(
          'Unsupported transport type: UNKNOWN',
        );
      });

      test('should propagate errors from stdio transport creation', async () => {
        vi.mocked(createStdioClientTransport).mockRejectedValueOnce(
          new Error('Failed to spawn process'),
        );

        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'nonexistent-command',
        });

        await expect(createTransport(mcpServer, null)).rejects.toThrow('Failed to spawn process');
      });

      test('should propagate errors from SSE transport creation', async () => {
        vi.mocked(createSseClientTransport).mockRejectedValueOnce(
          new Error('SSE connection failed'),
        );

        const mcpServer = createMcpServer({
          transportType: 'SSE',
          url: 'https://invalid.example.com',
        });

        await expect(createTransport(mcpServer, null)).rejects.toThrow('SSE connection failed');
      });

      test('should propagate errors from WebSocket transport creation', async () => {
        vi.mocked(createWebSocketClientTransport).mockRejectedValueOnce(
          new Error('WebSocket connection failed'),
        );

        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://invalid.example.com',
        });

        await expect(createTransport(mcpServer, null)).rejects.toThrow(
          'WebSocket connection failed',
        );
      });
    });

    describe('URL handling', () => {
      test('should correctly parse HTTP URL', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          url: 'https://api.example.com:8080/v1/mcp?param=value',
        });

        await createTransport(mcpServer, null);

        expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
          new URL('https://api.example.com:8080/v1/mcp?param=value'),
          expect.any(Object),
        );
      });

      test('should pass URL string to SSE transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'SSE',
          url: 'https://sse.example.com/events/stream',
        });

        await createTransport(mcpServer, null);

        expect(createSseClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://sse.example.com/events/stream',
          }),
        );
      });

      test('should pass URL string to WebSocket transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/socket',
        });

        await createTransport(mcpServer, null);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'wss://ws.example.com/socket',
          }),
        );
      });
    });

    describe('credentials handling', () => {
      test('should handle complex credentials object', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          authType: 'API_KEY',
        });
        const credentials = {
          apiKey: 'complex-key-123',
          headers: {
            'X-Custom': 'custom-value',
            'X-Request-ID': 'req-456',
          },
          _sentinel: { injectIntoToolParams: true },
          toolParams: { workspace: 'default' },
        };

        await createTransport(mcpServer, credentials);

        expect(buildCredentialHeaders).toHaveBeenCalledWith('API_KEY', credentials);
      });

      test('should handle credentials with only custom headers', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          authType: 'NONE',
        });
        const credentials = {
          headers: {
            'X-Api-Key': 'custom-api-key',
            'X-Tenant-ID': 'tenant-123',
          },
        };

        await createTransport(mcpServer, credentials);

        expect(buildCredentialHeaders).toHaveBeenCalledWith('NONE', credentials);
      });

      test('should handle empty credentials object', async () => {
        const mcpServer = createMcpServer({
          transportType: 'HTTP',
          authType: 'API_KEY',
        });

        await createTransport(mcpServer, {});

        expect(buildCredentialHeaders).toHaveBeenCalledWith('API_KEY', {});
      });
    });

    describe('TransportFactoryResult interface', () => {
      test('should return correct structure for HTTP transport', async () => {
        const mcpServer = createMcpServer({ transportType: 'HTTP' });
        const result = await createTransport(mcpServer, null);

        expect(result).toHaveProperty('transport');
        expect(result).toHaveProperty('cleanup');
        expect(typeof result.cleanup).toBe('function');
      });

      test('should return correct structure for STDIO transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
        });
        const result = await createTransport(mcpServer, null);

        expect(result).toHaveProperty('transport');
        expect(result).toHaveProperty('cleanup');
        expect(typeof result.cleanup).toBe('function');
      });

      test('should return correct structure for SSE transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'SSE',
          url: 'https://sse.example.com',
        });
        const result = await createTransport(mcpServer, null);

        expect(result).toHaveProperty('transport');
        expect(result).toHaveProperty('cleanup');
        expect(typeof result.cleanup).toBe('function');
      });

      test('should return correct structure for WEBSOCKET transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com',
        });
        const result = await createTransport(mcpServer, null);

        expect(result).toHaveProperty('transport');
        expect(result).toHaveProperty('cleanup');
        expect(typeof result.cleanup).toBe('function');
      });
    });

    describe('parseEnvString (via STDIO transport)', () => {
      test('should handle primitive JSON values (number) in stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: '123',
        });

        await createTransport(mcpServer, null);

        // Number is not an object, so env should be undefined
        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('should handle primitive JSON values (string) in stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: '"just a string"',
        });

        await createTransport(mcpServer, null);

        // String is not an object, so env should be undefined
        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('should handle boolean JSON values in stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: 'true',
        });

        await createTransport(mcpServer, null);

        // Boolean is not an object, so env should be undefined
        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('should handle null JSON value in stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: 'null',
        });

        await createTransport(mcpServer, null);

        // null fails the parsed && check, so env should be undefined
        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: undefined,
          }),
        );
      });

      test('should handle empty object JSON in stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: '{}',
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: {},
          }),
        );
      });

      test('should handle nested object JSON in stdioEnv', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: JSON.stringify({
            PATH: '/usr/bin',
            CONFIG: 'nested value',
          }),
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            env: {
              PATH: '/usr/bin',
              CONFIG: 'nested value',
            },
          }),
        );
      });
    });

    describe('logging', () => {
      test('should log with server name for STDIO transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: 'node',
          name: 'Local Dev Server',
        });

        await createTransport(mcpServer, null);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('STDIO'),
          undefined,
          expect.objectContaining({ emoji: expect.any(String) }),
        );
      });

      test('should log with server name for SSE transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'SSE',
          name: 'Legacy SSE Server',
        });

        await createTransport(mcpServer, null);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('SSE'),
          undefined,
          expect.objectContaining({ emoji: expect.any(String) }),
        );
      });

      test('should log with server name for WEBSOCKET transport', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          name: 'Real-time WS Server',
        });

        await createTransport(mcpServer, null);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('WEBSOCKET'),
          undefined,
          expect.objectContaining({ emoji: expect.any(String) }),
        );
      });
    });

    describe('STDIO with all configuration options', () => {
      test('should pass all STDIO configuration options correctly', async () => {
        const mcpServer = createMcpServer({
          transportType: 'STDIO',
          stdioCommand: '/usr/local/bin/mcp-server',
          stdioArgs: ['--config', '/etc/mcp/config.json', '--verbose'],
          stdioWorkingDir: '/var/lib/mcp',
          stdioEnv: JSON.stringify({
            MCP_LOG_LEVEL: 'debug',
            MCP_PORT: '9000',
          }),
        });

        await createTransport(mcpServer, null);

        expect(createStdioClientTransport).toHaveBeenCalledWith({
          command: '/usr/local/bin/mcp-server',
          args: ['--config', '/etc/mcp/config.json', '--verbose'],
          workingDir: '/var/lib/mcp',
          env: {
            MCP_LOG_LEVEL: 'debug',
            MCP_PORT: '9000',
          },
        });
      });
    });

    describe('WEBSOCKET with all configuration options', () => {
      test('should pass all WebSocket configuration options correctly', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/mcp',
          authType: 'API_KEY',
          wsMaxRetries: 3,
          wsReconnectMs: 500,
          wsHeartbeatMs: 10000,
        });
        const credentials = { apiKey: 'ws-key-123' };

        await createTransport(mcpServer, credentials);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith({
          url: 'wss://ws.example.com/mcp',
          headers: expect.any(Object),
          reconnect: true,
          maxReconnectAttempts: 3,
          initialReconnectDelay: 500,
          heartbeat: true,
          heartbeatInterval: 10000,
        });
      });

      test('should use 0 values for ws options when explicitly set to 0', async () => {
        const mcpServer = createMcpServer({
          transportType: 'WEBSOCKET',
          url: 'wss://ws.example.com/mcp',
          wsMaxRetries: 0,
          wsReconnectMs: 0,
          wsHeartbeatMs: 0,
        });

        await createTransport(mcpServer, null);

        // 0 ?? 10 should return 0, not 10
        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            maxReconnectAttempts: 0,
            initialReconnectDelay: 0,
            heartbeatInterval: 0,
          }),
        );
      });
    });
  });
});
