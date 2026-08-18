/**
 * Unit tests for MCP transport factory
 *
 * Tests the transport factory module which creates transport instances
 * from various configuration sources (inline configs, database models).
 *
 * Key functions tested:
 * - createTransportFromConfig: Creates transports from typed configs
 * - buildTransportConfig: Builds configs from McpServer database models
 * - decryptStdioEnv: Decrypts encrypted environment variables
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the logger first to prevent side effects during tests
vi.mock('../../../../packages/mcp/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    mcp: vi.fn(),
    session: vi.fn(),
    security: vi.fn(),
  },
}));

// Mock crypto module to avoid encryption key requirements
vi.mock('../../../../packages/mcp/src/crypto.js', () => ({
  decryptString: vi.fn((ciphertext: string) => {
    // Simple mock that returns a predictable decrypted value
    if (ciphertext === 'encrypted-env-json') {
      return JSON.stringify({ API_KEY: 'test-key', SECRET: 'test-secret' });
    }
    if (ciphertext === 'invalid-json') {
      return 'not-valid-json{';
    }
    if (ciphertext === 'encrypted-non-object') {
      return JSON.stringify(['array', 'value']);
    }
    if (ciphertext === 'encrypted-null') {
      return 'null';
    }
    if (ciphertext === 'encrypted-number') {
      return '123';
    }
    if (ciphertext === 'encrypted-with-non-strings') {
      return JSON.stringify({ VALID: 'string', INVALID_NUM: 123, INVALID_OBJ: {} });
    }
    return JSON.stringify({});
  }),
}));

// Mock transport implementations to avoid actual process/network operations
const mockStdioTransport = {
  transport: { send: vi.fn(), close: vi.fn(), start: vi.fn() },
  close: vi.fn(),
};

const mockSseTransport = {
  transport: { send: vi.fn(), close: vi.fn(), start: vi.fn() },
  close: vi.fn(),
  getState: vi.fn(() => 'disconnected'),
  reconnect: vi.fn(),
};

const mockWebSocketTransport = {
  transport: { send: vi.fn(), close: vi.fn(), start: vi.fn() },
  close: vi.fn(),
  getState: vi.fn(() => 'disconnected'),
  reconnect: vi.fn(),
};

vi.mock('../../../../packages/mcp/src/transports/stdio-transport.js', () => ({
  createStdioClientTransport: vi.fn(() => Promise.resolve(mockStdioTransport)),
}));

vi.mock('../../../../packages/mcp/src/transports/sse-transport.js', () => ({
  createSseClientTransport: vi.fn(() => Promise.resolve(mockSseTransport)),
}));

vi.mock('../../../../packages/mcp/src/transports/websocket-transport.js', () => ({
  createWebSocketClientTransport: vi.fn(() => Promise.resolve(mockWebSocketTransport)),
}));

// Mock StreamableHTTPClientTransport - must use a factory pattern to avoid hoisting issues
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  return {
    StreamableHTTPClientTransport: class {
      url: URL;
      options?: { requestInit?: { headers?: Record<string, string> } };
      close = vi.fn();
      start = vi.fn();
      send = vi.fn();
      constructor(url: URL, options?: { requestInit?: { headers?: Record<string, string> } }) {
        this.url = url;
        this.options = options;
      }
    },
  };
});

// Import after mocks are set up
import { decryptString } from '../../../../packages/mcp/src/crypto.js';
import { logger } from '../../../../packages/mcp/src/logger.js';
import {
  buildTransportConfig,
  createTransportFromConfig,
  decryptStdioEnv,
  type HttpTransportConfig,
  type McpServerModel,
  type TaggedSseTransportConfig,
  type TaggedStdioTransportConfig,
  type TaggedWebSocketTransportConfig,
  type TransportConfig,
} from '../../../../packages/mcp/src/transports/factory.js';
import { createSseClientTransport } from '../../../../packages/mcp/src/transports/sse-transport.js';
import { createStdioClientTransport } from '../../../../packages/mcp/src/transports/stdio-transport.js';
import { createWebSocketClientTransport } from '../../../../packages/mcp/src/transports/websocket-transport.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Transport Factory', () => {
  describe('createTransportFromConfig', () => {
    describe('HTTP transport', () => {
      test('should create HTTP transport with minimal config', async () => {
        const config: HttpTransportConfig = {
          type: 'HTTP',
          url: 'http://localhost:3000/mcp',
        };

        const result = await createTransportFromConfig(config);

        expect(result.transport).toBeDefined();
        expect(result.close).toBeDefined();
        expect(typeof result.close).toBe('function');
        // Verify the transport was created with correct URL via logger
        expect(logger.mcp).toHaveBeenCalledWith(
          'Creating HTTP transport: http://localhost:3000/mcp',
        );
      });

      test('should create HTTP transport with headers', async () => {
        const config: HttpTransportConfig = {
          type: 'HTTP',
          url: 'https://api.example.com/mcp',
          headers: {
            Authorization: 'Bearer token123',
            'X-Custom-Header': 'custom-value',
          },
        };

        const result = await createTransportFromConfig(config);

        expect(result.transport).toBeDefined();
        // Verify URL via logger
        expect(logger.mcp).toHaveBeenCalledWith(
          'Creating HTTP transport: https://api.example.com/mcp',
        );
      });

      test('should close HTTP transport properly', async () => {
        const config: HttpTransportConfig = {
          type: 'HTTP',
          url: 'http://localhost:3000/mcp',
        };

        const result = await createTransportFromConfig(config);
        // Should not throw when closing
        await expect(result.close()).resolves.toBeUndefined();
      });

      test('should handle HTTPS URLs', async () => {
        const config: HttpTransportConfig = {
          type: 'HTTP',
          url: 'https://secure.example.com/mcp',
        };

        const result = await createTransportFromConfig(config);

        expect(result.transport).toBeDefined();
        // Verify URL via logger
        expect(logger.mcp).toHaveBeenCalledWith(
          'Creating HTTP transport: https://secure.example.com/mcp',
        );
      });
    });

    describe('STDIO transport', () => {
      test('should create STDIO transport with minimal config', async () => {
        const config: TaggedStdioTransportConfig = {
          type: 'STDIO',
          command: '/usr/bin/node',
        };

        const result = await createTransportFromConfig(config);

        expect(result).toBe(mockStdioTransport);
        expect(createStdioClientTransport).toHaveBeenCalledWith({
          command: '/usr/bin/node',
          args: undefined,
          workingDir: undefined,
          env: undefined,
        });
      });

      test('should create STDIO transport with full config', async () => {
        const config: TaggedStdioTransportConfig = {
          type: 'STDIO',
          command: '/usr/bin/node',
          args: ['server.js', '--port', '3000'],
          workingDir: '/app',
          env: { NODE_ENV: 'production' },
        };

        const result = await createTransportFromConfig(config);

        expect(result).toBe(mockStdioTransport);
        expect(createStdioClientTransport).toHaveBeenCalledWith({
          command: '/usr/bin/node',
          args: ['server.js', '--port', '3000'],
          workingDir: '/app',
          env: { NODE_ENV: 'production' },
        });
      });

      test('should create STDIO transport with empty args', async () => {
        const config: TaggedStdioTransportConfig = {
          type: 'STDIO',
          command: 'mcp-server',
          args: [],
        };

        await createTransportFromConfig(config);

        expect(createStdioClientTransport).toHaveBeenCalledWith({
          command: 'mcp-server',
          args: [],
          workingDir: undefined,
          env: undefined,
        });
      });
    });

    describe('SSE transport', () => {
      test('should create SSE transport with minimal config', async () => {
        const config: TaggedSseTransportConfig = {
          type: 'SSE',
          url: 'http://localhost:3000/sse',
        };

        const result = await createTransportFromConfig(config);

        expect(result).toBe(mockSseTransport);
        expect(createSseClientTransport).toHaveBeenCalledWith({
          url: 'http://localhost:3000/sse',
          headers: undefined,
          connectionTimeout: undefined,
        });
      });

      test('should create SSE transport with headers', async () => {
        const config: TaggedSseTransportConfig = {
          type: 'SSE',
          url: 'https://api.example.com/sse',
          headers: { Authorization: 'Bearer token' },
        };

        await createTransportFromConfig(config);

        expect(createSseClientTransport).toHaveBeenCalledWith({
          url: 'https://api.example.com/sse',
          headers: { Authorization: 'Bearer token' },
          connectionTimeout: undefined,
        });
      });

      test('should create SSE transport with connection timeout', async () => {
        const config: TaggedSseTransportConfig = {
          type: 'SSE',
          url: 'http://localhost:3000/sse',
          connectionTimeout: 5000,
        };

        await createTransportFromConfig(config);

        expect(createSseClientTransport).toHaveBeenCalledWith({
          url: 'http://localhost:3000/sse',
          headers: undefined,
          connectionTimeout: 5000,
        });
      });
    });

    describe('WebSocket transport', () => {
      test('should create WebSocket transport with minimal config', async () => {
        const config: TaggedWebSocketTransportConfig = {
          type: 'WEBSOCKET',
          url: 'ws://localhost:3000/ws',
        };

        const result = await createTransportFromConfig(config);

        expect(result).toBe(mockWebSocketTransport);
        expect(createWebSocketClientTransport).toHaveBeenCalledWith({
          url: 'ws://localhost:3000/ws',
          headers: undefined,
          reconnect: undefined,
          maxReconnectAttempts: undefined,
          initialReconnectDelay: undefined,
          maxReconnectDelay: undefined,
          reconnectBackoffMultiplier: undefined,
          heartbeat: undefined,
          heartbeatInterval: undefined,
          heartbeatTimeout: undefined,
          connectionTimeout: undefined,
        });
      });

      test('should create WebSocket transport with full config', async () => {
        const config: TaggedWebSocketTransportConfig = {
          type: 'WEBSOCKET',
          url: 'wss://api.example.com/ws',
          headers: { Authorization: 'Bearer token' },
          reconnect: true,
          maxReconnectAttempts: 5,
          initialReconnectDelay: 500,
          maxReconnectDelay: 10000,
          reconnectBackoffMultiplier: 1.5,
          heartbeat: true,
          heartbeatInterval: 15000,
          heartbeatTimeout: 5000,
          connectionTimeout: 3000,
        };

        await createTransportFromConfig(config);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith({
          url: 'wss://api.example.com/ws',
          headers: { Authorization: 'Bearer token' },
          reconnect: true,
          maxReconnectAttempts: 5,
          initialReconnectDelay: 500,
          maxReconnectDelay: 10000,
          reconnectBackoffMultiplier: 1.5,
          heartbeat: true,
          heartbeatInterval: 15000,
          heartbeatTimeout: 5000,
          connectionTimeout: 3000,
        });
      });

      test('should create WebSocket transport with reconnection disabled', async () => {
        const config: TaggedWebSocketTransportConfig = {
          type: 'WEBSOCKET',
          url: 'ws://localhost:3000/ws',
          reconnect: false,
        };

        await createTransportFromConfig(config);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({ reconnect: false }),
        );
      });

      test('should create WebSocket transport with heartbeat disabled', async () => {
        const config: TaggedWebSocketTransportConfig = {
          type: 'WEBSOCKET',
          url: 'ws://localhost:3000/ws',
          heartbeat: false,
        };

        await createTransportFromConfig(config);

        expect(createWebSocketClientTransport).toHaveBeenCalledWith(
          expect.objectContaining({ heartbeat: false }),
        );
      });
    });

    describe('error handling', () => {
      test('should throw on unknown transport type', async () => {
        const config = {
          type: 'UNKNOWN',
          url: 'http://localhost:3000',
        } as unknown as TransportConfig;

        await expect(createTransportFromConfig(config)).rejects.toThrow(
          'Unknown transport type: UNKNOWN',
        );
      });
    });
  });

  describe('decryptStdioEnv', () => {
    test('should return empty object for null input', () => {
      const result = decryptStdioEnv(null);
      expect(result).toEqual({});
    });

    test('should return empty object for undefined input', () => {
      const result = decryptStdioEnv(undefined);
      expect(result).toEqual({});
    });

    test('should return empty object for empty string input', () => {
      const result = decryptStdioEnv('');
      expect(result).toEqual({});
    });

    test('should decrypt and parse valid JSON env', () => {
      const result = decryptStdioEnv('encrypted-env-json');

      expect(decryptString).toHaveBeenCalledWith('encrypted-env-json');
      expect(result).toEqual({
        API_KEY: 'test-key',
        SECRET: 'test-secret',
      });
    });

    test('should return empty object for non-object decrypted value', () => {
      const result = decryptStdioEnv('encrypted-non-object');

      expect(decryptString).toHaveBeenCalledWith('encrypted-non-object');
      expect(result).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith('Decrypted stdio env is not a valid object');
    });

    test('should return empty object for null decrypted value', () => {
      const result = decryptStdioEnv('encrypted-null');

      expect(result).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith('Decrypted stdio env is not a valid object');
    });

    test('should return empty object for number decrypted value', () => {
      const result = decryptStdioEnv('encrypted-number');

      expect(result).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith('Decrypted stdio env is not a valid object');
    });

    test('should filter out non-string values from env', () => {
      const result = decryptStdioEnv('encrypted-with-non-strings');

      expect(result).toEqual({ VALID: 'string' });
    });

    test('should throw on invalid JSON', () => {
      expect(() => decryptStdioEnv('invalid-json')).toThrow();
    });
  });

  describe('buildTransportConfig', () => {
    describe('HTTP transport', () => {
      test('should build HTTP config from McpServer model', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'http://localhost:3000/mcp',
          authType: 'NONE',
          transportType: 'HTTP',
        };

        const config = buildTransportConfig(server);

        expect(config).toEqual({
          type: 'HTTP',
          url: 'http://localhost:3000/mcp',
          headers: {},
        });
      });

      test('should build HTTP config with headers', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'https://api.example.com/mcp',
          authType: 'API_KEY',
          transportType: 'HTTP',
        };
        const headers = { Authorization: 'Bearer token123' };

        const config = buildTransportConfig(server, headers);

        expect(config).toEqual({
          type: 'HTTP',
          url: 'https://api.example.com/mcp',
          headers: { Authorization: 'Bearer token123' },
        });
      });
    });

    describe('STDIO transport', () => {
      test('should build STDIO config from McpServer model', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: '/usr/bin/node',
          stdioArgs: ['server.js'],
          stdioWorkingDir: '/app',
          stdioEnv: null,
        };

        const config = buildTransportConfig(server);

        expect(config).toEqual({
          type: 'STDIO',
          command: '/usr/bin/node',
          args: ['server.js'],
          workingDir: '/app',
          env: {},
        });
      });

      test('should throw error when stdioCommand is missing', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: null,
        };

        expect(() => buildTransportConfig(server)).toThrow(
          'STDIO transport requires stdioCommand for server server-1',
        );
      });

      test('should throw error when stdioCommand is empty string', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: '',
        };

        expect(() => buildTransportConfig(server)).toThrow(
          'STDIO transport requires stdioCommand for server server-1',
        );
      });

      test('should parse stdioArgs from JSON array', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioArgs: ['arg1', 'arg2', 'arg3'],
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('STDIO');
        if (config.type === 'STDIO') {
          expect(config.args).toEqual(['arg1', 'arg2', 'arg3']);
        }
      });

      test('should parse stdioArgs from JSON string', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioArgs: '["arg1", "arg2"]',
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('STDIO');
        if (config.type === 'STDIO') {
          expect(config.args).toEqual(['arg1', 'arg2']);
        }
      });

      test('should handle null stdioArgs', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioArgs: null,
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('STDIO');
        if (config.type === 'STDIO') {
          expect(config.args).toEqual([]);
        }
      });

      test('should handle undefined stdioArgs', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioArgs: undefined,
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('STDIO');
        if (config.type === 'STDIO') {
          expect(config.args).toEqual([]);
        }
      });

      test('should filter non-string values from stdioArgs array', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioArgs: ['arg1', 123, 'arg2', true, 'arg3'] as unknown,
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('STDIO');
        if (config.type === 'STDIO') {
          expect(config.args).toEqual(['arg1', 'arg2', 'arg3']);
        }
      });

      test('should handle null stdioWorkingDir', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioWorkingDir: null,
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('STDIO');
        if (config.type === 'STDIO') {
          expect(config.workingDir).toBeUndefined();
        }
      });

      test('should decrypt stdioEnv', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: '',
          authType: 'NONE',
          transportType: 'STDIO',
          stdioCommand: 'node',
          stdioEnv: 'encrypted-env-json',
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('STDIO');
        if (config.type === 'STDIO') {
          expect(config.env).toEqual({
            API_KEY: 'test-key',
            SECRET: 'test-secret',
          });
        }
      });
    });

    describe('SSE transport', () => {
      test('should build SSE config from McpServer model', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'http://localhost:3000/sse',
          authType: 'NONE',
          transportType: 'SSE',
        };

        const config = buildTransportConfig(server);

        expect(config).toEqual({
          type: 'SSE',
          url: 'http://localhost:3000/sse',
          headers: {},
        });
      });

      test('should build SSE config with headers', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'https://api.example.com/sse',
          authType: 'OAUTH',
          transportType: 'SSE',
        };
        const headers = { Authorization: 'Bearer oauth-token' };

        const config = buildTransportConfig(server, headers);

        expect(config).toEqual({
          type: 'SSE',
          url: 'https://api.example.com/sse',
          headers: { Authorization: 'Bearer oauth-token' },
        });
      });
    });

    describe('WebSocket transport', () => {
      test('should build WebSocket config from McpServer model', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'ws://localhost:3000/ws',
          authType: 'NONE',
          transportType: 'WEBSOCKET',
        };

        const config = buildTransportConfig(server);

        expect(config).toEqual({
          type: 'WEBSOCKET',
          url: 'ws://localhost:3000/ws',
          headers: {},
          initialReconnectDelay: undefined,
          maxReconnectAttempts: undefined,
          heartbeatInterval: undefined,
        });
      });

      test('should convert HTTP URL to WS URL', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'http://localhost:3000/ws',
          authType: 'NONE',
          transportType: 'WEBSOCKET',
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('WEBSOCKET');
        if (config.type === 'WEBSOCKET') {
          expect(config.url).toBe('ws://localhost:3000/ws');
        }
      });

      test('should convert HTTPS URL to WSS URL', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'https://api.example.com/ws',
          authType: 'NONE',
          transportType: 'WEBSOCKET',
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('WEBSOCKET');
        if (config.type === 'WEBSOCKET') {
          expect(config.url).toBe('wss://api.example.com/ws');
        }
      });

      test('should keep WS URL unchanged', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'ws://localhost:3000/ws',
          authType: 'NONE',
          transportType: 'WEBSOCKET',
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('WEBSOCKET');
        if (config.type === 'WEBSOCKET') {
          expect(config.url).toBe('ws://localhost:3000/ws');
        }
      });

      test('should keep WSS URL unchanged', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'wss://secure.example.com/ws',
          authType: 'NONE',
          transportType: 'WEBSOCKET',
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('WEBSOCKET');
        if (config.type === 'WEBSOCKET') {
          expect(config.url).toBe('wss://secure.example.com/ws');
        }
      });

      test('should include WebSocket-specific options', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'ws://localhost:3000/ws',
          authType: 'NONE',
          transportType: 'WEBSOCKET',
          wsReconnectMs: 500,
          wsMaxRetries: 5,
          wsHeartbeatMs: 15000,
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('WEBSOCKET');
        if (config.type === 'WEBSOCKET') {
          expect(config.initialReconnectDelay).toBe(500);
          expect(config.maxReconnectAttempts).toBe(5);
          expect(config.heartbeatInterval).toBe(15000);
        }
      });

      test('should handle null WebSocket options', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'ws://localhost:3000/ws',
          authType: 'NONE',
          transportType: 'WEBSOCKET',
          wsReconnectMs: null,
          wsMaxRetries: null,
          wsHeartbeatMs: null,
        };

        const config = buildTransportConfig(server);

        expect(config.type).toBe('WEBSOCKET');
        if (config.type === 'WEBSOCKET') {
          expect(config.initialReconnectDelay).toBeUndefined();
          expect(config.maxReconnectAttempts).toBeUndefined();
          expect(config.heartbeatInterval).toBeUndefined();
        }
      });

      test('should build WebSocket config with headers', () => {
        const server: McpServerModel = {
          id: 'server-1',
          url: 'wss://api.example.com/ws',
          authType: 'API_KEY',
          transportType: 'WEBSOCKET',
        };
        const headers = { 'X-API-Key': 'secret-key' };

        const config = buildTransportConfig(server, headers);

        expect(config.type).toBe('WEBSOCKET');
        if (config.type === 'WEBSOCKET') {
          expect(config.headers).toEqual({ 'X-API-Key': 'secret-key' });
        }
      });
    });

    describe('error handling', () => {
      test('should throw on unknown transport type', () => {
        const server = {
          id: 'server-1',
          url: 'http://localhost:3000',
          authType: 'NONE',
          transportType: 'UNKNOWN',
        } as unknown as McpServerModel;

        expect(() => buildTransportConfig(server)).toThrow('Unknown transport type: UNKNOWN');
      });
    });
  });

  describe('TransportConfig type union', () => {
    test('should accept HttpTransportConfig', () => {
      const config: TransportConfig = {
        type: 'HTTP',
        url: 'http://localhost:3000/mcp',
        headers: {},
      };

      expect(config.type).toBe('HTTP');
    });

    test('should accept TaggedStdioTransportConfig', () => {
      const config: TransportConfig = {
        type: 'STDIO',
        command: 'node',
        args: ['server.js'],
      };

      expect(config.type).toBe('STDIO');
    });

    test('should accept TaggedSseTransportConfig', () => {
      const config: TransportConfig = {
        type: 'SSE',
        url: 'http://localhost:3000/sse',
      };

      expect(config.type).toBe('SSE');
    });

    test('should accept TaggedWebSocketTransportConfig', () => {
      const config: TransportConfig = {
        type: 'WEBSOCKET',
        url: 'ws://localhost:3000/ws',
      };

      expect(config.type).toBe('WEBSOCKET');
    });
  });

  describe('McpServerModel interface', () => {
    test('should accept minimal McpServerModel', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'http://localhost:3000',
        authType: 'NONE',
        transportType: 'HTTP',
      };

      expect(server.id).toBe('server-1');
      expect(server.transportType).toBe('HTTP');
    });

    test('should accept McpServerModel with all STDIO fields', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: '',
        authType: 'NONE',
        transportType: 'STDIO',
        stdioCommand: 'node',
        stdioArgs: ['server.js'],
        stdioWorkingDir: '/app',
        stdioEnv: 'encrypted-string',
      };

      expect(server.stdioCommand).toBe('node');
      expect(server.stdioArgs).toEqual(['server.js']);
      expect(server.stdioWorkingDir).toBe('/app');
      expect(server.stdioEnv).toBe('encrypted-string');
    });

    test('should accept McpServerModel with all WebSocket fields', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'ws://localhost:3000/ws',
        authType: 'NONE',
        transportType: 'WEBSOCKET',
        wsReconnectMs: 1000,
        wsMaxRetries: 10,
        wsHeartbeatMs: 30000,
      };

      expect(server.wsReconnectMs).toBe(1000);
      expect(server.wsMaxRetries).toBe(10);
      expect(server.wsHeartbeatMs).toBe(30000);
    });

    test('should accept McpServerModel with OAUTH auth type', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'https://api.example.com/mcp',
        authType: 'OAUTH',
        transportType: 'HTTP',
      };

      expect(server.authType).toBe('OAUTH');
    });

    test('should accept McpServerModel with API_KEY auth type', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'https://api.example.com/mcp',
        authType: 'API_KEY',
        transportType: 'HTTP',
      };

      expect(server.authType).toBe('API_KEY');
    });
  });

  describe('URL conversion edge cases', () => {
    test('should handle URLs with paths during conversion', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'http://localhost:3000/api/v1/ws',
        authType: 'NONE',
        transportType: 'WEBSOCKET',
      };

      const config = buildTransportConfig(server);

      expect(config.type).toBe('WEBSOCKET');
      if (config.type === 'WEBSOCKET') {
        expect(config.url).toBe('ws://localhost:3000/api/v1/ws');
      }
    });

    test('should handle URLs with query params during conversion', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'https://api.example.com/ws?token=abc123',
        authType: 'NONE',
        transportType: 'WEBSOCKET',
      };

      const config = buildTransportConfig(server);

      expect(config.type).toBe('WEBSOCKET');
      if (config.type === 'WEBSOCKET') {
        expect(config.url).toBe('wss://api.example.com/ws?token=abc123');
      }
    });

    test('should handle URLs with ports during conversion', () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'http://localhost:8080/ws',
        authType: 'NONE',
        transportType: 'WEBSOCKET',
      };

      const config = buildTransportConfig(server);

      expect(config.type).toBe('WEBSOCKET');
      if (config.type === 'WEBSOCKET') {
        expect(config.url).toBe('ws://localhost:8080/ws');
      }
    });
  });

  describe('integration scenarios', () => {
    test('should build config and create transport for HTTP', async () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'http://localhost:3000/mcp',
        authType: 'API_KEY',
        transportType: 'HTTP',
      };
      const headers = { Authorization: 'Bearer token' };

      const config = buildTransportConfig(server, headers);
      const result = await createTransportFromConfig(config);

      expect(result.transport).toBeDefined();
      // Verify config was built correctly
      expect(config.type).toBe('HTTP');
      if (config.type === 'HTTP') {
        expect(config.url).toBe('http://localhost:3000/mcp');
      }
      // Verify transport creation via logger
      expect(logger.mcp).toHaveBeenCalledWith('Creating HTTP transport: http://localhost:3000/mcp');
    });

    test('should build config and create transport for STDIO', async () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: '',
        authType: 'NONE',
        transportType: 'STDIO',
        stdioCommand: 'mcp-server',
        stdioArgs: ['--port', '3000'],
        stdioEnv: 'encrypted-env-json',
      };

      const config = buildTransportConfig(server);
      const result = await createTransportFromConfig(config);

      expect(result).toBe(mockStdioTransport);
      expect(createStdioClientTransport).toHaveBeenCalledWith({
        command: 'mcp-server',
        args: ['--port', '3000'],
        workingDir: undefined,
        env: { API_KEY: 'test-key', SECRET: 'test-secret' },
      });
    });

    test('should build config and create transport for SSE', async () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'http://localhost:3000/sse',
        authType: 'OAUTH',
        transportType: 'SSE',
      };
      const headers = { Authorization: 'Bearer oauth-token' };

      const config = buildTransportConfig(server, headers);
      const result = await createTransportFromConfig(config);

      expect(result).toBe(mockSseTransport);
      expect(createSseClientTransport).toHaveBeenCalledWith({
        url: 'http://localhost:3000/sse',
        headers: { Authorization: 'Bearer oauth-token' },
        connectionTimeout: undefined,
      });
    });

    test('should build config and create transport for WebSocket', async () => {
      const server: McpServerModel = {
        id: 'server-1',
        url: 'https://api.example.com/ws',
        authType: 'API_KEY',
        transportType: 'WEBSOCKET',
        wsReconnectMs: 1000,
        wsMaxRetries: 5,
        wsHeartbeatMs: 15000,
      };
      const headers = { 'X-API-Key': 'secret' };

      const config = buildTransportConfig(server, headers);
      const result = await createTransportFromConfig(config);

      expect(result).toBe(mockWebSocketTransport);
      expect(createWebSocketClientTransport).toHaveBeenCalledWith({
        url: 'wss://api.example.com/ws',
        headers: { 'X-API-Key': 'secret' },
        reconnect: undefined,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 1000,
        maxReconnectDelay: undefined,
        reconnectBackoffMultiplier: undefined,
        heartbeat: undefined,
        heartbeatInterval: 15000,
        heartbeatTimeout: undefined,
        connectionTimeout: undefined,
      });
    });
  });
});
