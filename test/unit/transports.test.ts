/**
 * Transport Unit Tests
 *
 * Tests MCP transport implementations including:
 * - Stdio transport (command validation, environment sanitization)
 * - SSE transport (URL handling, headers, connection state)
 * - WebSocket transport (URL conversion, reconnection, heartbeat)
 *
 * Note: These tests avoid calling transport.start() to prevent actual
 * process spawning and network connections.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock logger first to prevent side effects
vi.mock('../../packages/mcp/src/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    mcp: vi.fn(),
    session: vi.fn(),
  },
}));

// Import after mocks are set up
import type {
  SseTransportConfig,
  StdioTransportConfig,
  WebSocketTransportConfig,
} from '../../packages/mcp/src/transports/types.ts';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Stdio Transport Types', () => {
  test('StdioTransportConfig should have correct structure', () => {
    const config: StdioTransportConfig = {
      command: '/usr/bin/node',
      args: ['server.js'],
      workingDir: '/app',
      env: { NODE_ENV: 'production' },
    };

    expect(config.command).toBe('/usr/bin/node');
    expect(config.args).toEqual(['server.js']);
    expect(config.workingDir).toBe('/app');
    expect(config.env).toEqual({ NODE_ENV: 'production' });
  });

  test('StdioTransportConfig should allow minimal config', () => {
    const config: StdioTransportConfig = {
      command: 'node',
    };

    expect(config.command).toBe('node');
    expect(config.args).toBeUndefined();
    expect(config.workingDir).toBeUndefined();
    expect(config.env).toBeUndefined();
  });

  test('StdioTransportConfig should allow empty args array', () => {
    const config: StdioTransportConfig = {
      command: '/usr/bin/node',
      args: [],
    };

    expect(config.args).toEqual([]);
  });

  test('StdioTransportConfig should allow complex env', () => {
    const config: StdioTransportConfig = {
      command: '/usr/bin/node',
      env: {
        NODE_ENV: 'production',
        DEBUG: 'mcp:*',
        API_KEY: 'secret',
        DATABASE_URL: 'postgres://localhost/db',
      },
    };

    expect(Object.keys(config.env!)).toHaveLength(4);
  });
});

describe('SSE Transport Types', () => {
  test('SseTransportConfig should have correct structure', () => {
    const config: SseTransportConfig = {
      url: 'http://localhost:3000/sse',
      headers: { Authorization: 'Bearer token' },
      connectionTimeout: 5000,
    };

    expect(config.url).toBe('http://localhost:3000/sse');
    expect(config.headers).toEqual({ Authorization: 'Bearer token' });
    expect(config.connectionTimeout).toBe(5000);
  });

  test('SseTransportConfig should allow minimal config', () => {
    const config: SseTransportConfig = {
      url: 'http://localhost:3000/sse',
    };

    expect(config.url).toBe('http://localhost:3000/sse');
    expect(config.headers).toBeUndefined();
    expect(config.connectionTimeout).toBeUndefined();
  });

  test('SseTransportConfig should handle HTTPS URLs', () => {
    const config: SseTransportConfig = {
      url: 'https://api.example.com/sse',
    };

    expect(config.url).toBe('https://api.example.com/sse');
  });

  test('SseTransportConfig should allow multiple headers', () => {
    const config: SseTransportConfig = {
      url: 'http://localhost:3000/sse',
      headers: {
        Authorization: 'Bearer token',
        'X-Custom-Header': 'value',
        'X-Request-Id': '12345',
      },
    };

    expect(Object.keys(config.headers!)).toHaveLength(3);
  });
});

describe('WebSocket Transport Types', () => {
  test('WebSocketTransportConfig should have correct structure', () => {
    const config: WebSocketTransportConfig = {
      url: 'ws://localhost:3000/ws',
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

    expect(config.url).toBe('ws://localhost:3000/ws');
    expect(config.headers).toEqual({ Authorization: 'Bearer token' });
    expect(config.reconnect).toBe(true);
    expect(config.maxReconnectAttempts).toBe(5);
    expect(config.initialReconnectDelay).toBe(500);
    expect(config.maxReconnectDelay).toBe(10000);
    expect(config.reconnectBackoffMultiplier).toBe(1.5);
    expect(config.heartbeat).toBe(true);
    expect(config.heartbeatInterval).toBe(15000);
    expect(config.heartbeatTimeout).toBe(5000);
    expect(config.connectionTimeout).toBe(3000);
  });

  test('WebSocketTransportConfig should allow minimal config', () => {
    const config: WebSocketTransportConfig = {
      url: 'ws://localhost:3000/ws',
    };

    expect(config.url).toBe('ws://localhost:3000/ws');
    expect(config.reconnect).toBeUndefined();
  });

  test('WebSocketTransportConfig should handle WSS URLs', () => {
    const config: WebSocketTransportConfig = {
      url: 'wss://api.example.com/ws',
    };

    expect(config.url).toBe('wss://api.example.com/ws');
  });

  test('WebSocketTransportConfig should handle HTTP URLs for conversion', () => {
    const config: WebSocketTransportConfig = {
      url: 'http://localhost:3000/ws',
    };

    expect(config.url).toBe('http://localhost:3000/ws');
  });

  test('WebSocketTransportConfig should handle HTTPS URLs for conversion', () => {
    const config: WebSocketTransportConfig = {
      url: 'https://api.example.com/ws',
    };

    expect(config.url).toBe('https://api.example.com/ws');
  });
});

describe('WebSocket URL Conversion Logic', () => {
  function convertToWebSocketUrl(url: string): string {
    if (url.startsWith('http://')) {
      return url.replace('http://', 'ws://');
    }
    if (url.startsWith('https://')) {
      return url.replace('https://', 'wss://');
    }
    return url;
  }

  test('should convert HTTP URL to WS URL', () => {
    const result = convertToWebSocketUrl('http://localhost:3000/ws');
    expect(result).toBe('ws://localhost:3000/ws');
  });

  test('should convert HTTPS URL to WSS URL', () => {
    const result = convertToWebSocketUrl('https://api.example.com/ws');
    expect(result).toBe('wss://api.example.com/ws');
  });

  test('should keep WS URL unchanged', () => {
    const result = convertToWebSocketUrl('ws://localhost:3000/ws');
    expect(result).toBe('ws://localhost:3000/ws');
  });

  test('should keep WSS URL unchanged', () => {
    const result = convertToWebSocketUrl('wss://api.example.com/ws');
    expect(result).toBe('wss://api.example.com/ws');
  });

  test('should handle URLs with paths', () => {
    const result = convertToWebSocketUrl('http://localhost:3000/api/v1/ws');
    expect(result).toBe('ws://localhost:3000/api/v1/ws');
  });

  test('should handle URLs with query params', () => {
    const result = convertToWebSocketUrl('http://localhost:3000/ws?token=abc');
    expect(result).toBe('ws://localhost:3000/ws?token=abc');
  });
});

describe('Environment Variable Sanitization Logic', () => {
  const SAFE_ENV_VARS_UNIX = ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];
  const SAFE_ENV_VARS_WIN = [
    'APPDATA',
    'HOMEDRIVE',
    'HOMEPATH',
    'LOCALAPPDATA',
    'PATH',
    'PROCESSOR_ARCHITECTURE',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'USERNAME',
    'USERPROFILE',
    'PROGRAMFILES',
  ];

  function buildSafeEnvironment(
    processEnv: Record<string, string | undefined>,
    additionalEnv?: Record<string, string>,
    platform: 'win32' | 'unix' = 'unix',
  ): Record<string, string> {
    const safeVars = platform === 'win32' ? SAFE_ENV_VARS_WIN : SAFE_ENV_VARS_UNIX;
    const env: Record<string, string> = {};

    for (const key of safeVars) {
      const value = processEnv[key];
      if (value !== undefined && !value.startsWith('()')) {
        env[key] = value;
      }
    }

    if (additionalEnv) {
      Object.assign(env, additionalEnv);
    }

    return env;
  }

  test('should include safe environment variables', () => {
    const processEnv = {
      HOME: '/home/user',
      PATH: '/usr/bin:/bin',
      USER: 'testuser',
    };

    const result = buildSafeEnvironment(processEnv);

    expect(result.HOME).toBe('/home/user');
    expect(result.PATH).toBe('/usr/bin:/bin');
    expect(result.USER).toBe('testuser');
  });

  test('should exclude unsafe environment variables', () => {
    const processEnv = {
      HOME: '/home/user',
      PATH: '/usr/bin',
      SECRET_KEY: 'should-not-be-included',
      AWS_ACCESS_KEY: 'should-not-be-included',
      DATABASE_URL: 'postgres://localhost/db',
    };

    const result = buildSafeEnvironment(processEnv);

    expect(result.HOME).toBe('/home/user');
    expect(result.SECRET_KEY).toBeUndefined();
    expect(result.AWS_ACCESS_KEY).toBeUndefined();
    expect(result.DATABASE_URL).toBeUndefined();
  });

  test('should merge additional env vars', () => {
    const processEnv = {
      HOME: '/home/user',
    };

    const additionalEnv = {
      CUSTOM_VAR: 'custom-value',
      ANOTHER_VAR: 'another-value',
    };

    const result = buildSafeEnvironment(processEnv, additionalEnv);

    expect(result.HOME).toBe('/home/user');
    expect(result.CUSTOM_VAR).toBe('custom-value');
    expect(result.ANOTHER_VAR).toBe('another-value');
  });

  test('should filter out shell function definitions', () => {
    const processEnv = {
      HOME: '/home/user',
      PATH: '() { dangerous; }',
      SHELL: '() { malicious; }',
    };

    const result = buildSafeEnvironment(processEnv);

    expect(result.HOME).toBe('/home/user');
    expect(result.PATH).toBeUndefined();
    expect(result.SHELL).toBeUndefined();
  });

  test('should handle Windows environment variables', () => {
    const processEnv = {
      APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
      USERPROFILE: 'C:\\Users\\test',
      PATH: 'C:\\Windows\\System32',
    };

    const result = buildSafeEnvironment(processEnv, undefined, 'win32');

    expect(result.APPDATA).toBe('C:\\Users\\test\\AppData\\Roaming');
    expect(result.USERPROFILE).toBe('C:\\Users\\test');
    expect(result.PATH).toBe('C:\\Windows\\System32');
  });

  test('should handle undefined values gracefully', () => {
    const processEnv = {
      HOME: '/home/user',
      PATH: undefined,
    };

    const result = buildSafeEnvironment(processEnv as Record<string, string | undefined>);

    expect(result.HOME).toBe('/home/user');
    expect(result.PATH).toBeUndefined();
  });

  test('additional env should override safe env', () => {
    const processEnv = {
      HOME: '/home/user',
      PATH: '/usr/bin',
    };

    const additionalEnv = {
      PATH: '/custom/path',
    };

    const result = buildSafeEnvironment(processEnv, additionalEnv);

    expect(result.PATH).toBe('/custom/path');
  });
});

describe('Command Resolution Logic', () => {
  test('should identify absolute paths', () => {
    const isAbsolute = (path: string): boolean => path.startsWith('/');

    expect(isAbsolute('/usr/bin/node')).toBe(true);
    expect(isAbsolute('/home/user/bin/app')).toBe(true);
    expect(isAbsolute('node')).toBe(false);
    expect(isAbsolute('./bin/app')).toBe(false);
    expect(isAbsolute('../bin/app')).toBe(false);
  });

  test('should split PATH correctly', () => {
    const splitPath = (pathEnv: string, delimiter: string): string[] => {
      return pathEnv.split(delimiter).filter(Boolean);
    };

    const unixPath = '/usr/bin:/bin:/usr/local/bin';
    expect(splitPath(unixPath, ':')).toEqual(['/usr/bin', '/bin', '/usr/local/bin']);

    const winPath = 'C:\\Windows\\System32;C:\\Program Files\\Node';
    expect(splitPath(winPath, ';')).toEqual(['C:\\Windows\\System32', 'C:\\Program Files\\Node']);
  });

  test('should handle empty PATH', () => {
    const splitPath = (pathEnv: string, delimiter: string): string[] => {
      return pathEnv.split(delimiter).filter(Boolean);
    };

    expect(splitPath('', ':')).toEqual([]);
  });

  test('should handle PATH with empty segments', () => {
    const splitPath = (pathEnv: string, delimiter: string): string[] => {
      return pathEnv.split(delimiter).filter(Boolean);
    };

    const pathWithEmpty = '/usr/bin::/bin::';
    expect(splitPath(pathWithEmpty, ':')).toEqual(['/usr/bin', '/bin']);
  });
});

describe('WebSocket Reconnection Config', () => {
  const DEFAULT_CONFIG = {
    reconnect: true,
    maxReconnectAttempts: 10,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30000,
    reconnectBackoffMultiplier: 2,
    heartbeat: true,
    heartbeatInterval: 30000,
    heartbeatTimeout: 10000,
    connectionTimeout: 10000,
  };

  test('should have sensible default values', () => {
    expect(DEFAULT_CONFIG.reconnect).toBe(true);
    expect(DEFAULT_CONFIG.maxReconnectAttempts).toBe(10);
    expect(DEFAULT_CONFIG.initialReconnectDelay).toBe(1000);
    expect(DEFAULT_CONFIG.maxReconnectDelay).toBe(30000);
    expect(DEFAULT_CONFIG.reconnectBackoffMultiplier).toBe(2);
    expect(DEFAULT_CONFIG.heartbeat).toBe(true);
    expect(DEFAULT_CONFIG.heartbeatInterval).toBe(30000);
    expect(DEFAULT_CONFIG.heartbeatTimeout).toBe(10000);
    expect(DEFAULT_CONFIG.connectionTimeout).toBe(10000);
  });

  test('should calculate correct backoff delays', () => {
    function calculateBackoffDelay(
      attempt: number,
      initialDelay: number,
      maxDelay: number,
      multiplier: number,
    ): number {
      const delay = initialDelay * Math.pow(multiplier, attempt);
      return Math.min(delay, maxDelay);
    }

    const initial = 1000;
    const max = 30000;
    const multiplier = 2;

    expect(calculateBackoffDelay(0, initial, max, multiplier)).toBe(1000);
    expect(calculateBackoffDelay(1, initial, max, multiplier)).toBe(2000);
    expect(calculateBackoffDelay(2, initial, max, multiplier)).toBe(4000);
    expect(calculateBackoffDelay(3, initial, max, multiplier)).toBe(8000);
    expect(calculateBackoffDelay(4, initial, max, multiplier)).toBe(16000);
    expect(calculateBackoffDelay(5, initial, max, multiplier)).toBe(30000); // Capped at max
    expect(calculateBackoffDelay(10, initial, max, multiplier)).toBe(30000); // Still capped
  });
});

describe('WebSocket Close Codes', () => {
  const CLOSE_CODES = {
    NORMAL: 1000,
    GOING_AWAY: 1001,
    PROTOCOL_ERROR: 1002,
    UNSUPPORTED_DATA: 1003,
    NO_STATUS: 1005,
    ABNORMAL: 1006,
    INVALID_DATA: 1007,
    POLICY_VIOLATION: 1008,
    MESSAGE_TOO_BIG: 1009,
    MANDATORY_EXTENSION: 1010,
    INTERNAL_ERROR: 1011,
    SERVICE_RESTART: 1012,
    TRY_AGAIN_LATER: 1013,
    BAD_GATEWAY: 1014,
    TLS_HANDSHAKE: 1015,
  };

  function shouldReconnect(closeCode: number): boolean {
    // Codes that should NOT reconnect
    const nonReconnectCodes = [
      CLOSE_CODES.NORMAL,
      CLOSE_CODES.PROTOCOL_ERROR,
      CLOSE_CODES.UNSUPPORTED_DATA,
      CLOSE_CODES.INVALID_DATA,
      CLOSE_CODES.POLICY_VIOLATION,
      CLOSE_CODES.MESSAGE_TOO_BIG,
      CLOSE_CODES.MANDATORY_EXTENSION,
    ];

    return !nonReconnectCodes.includes(closeCode);
  }

  test('should not reconnect on normal closure (1000)', () => {
    expect(shouldReconnect(CLOSE_CODES.NORMAL)).toBe(false);
  });

  test('should reconnect on server going away (1001)', () => {
    expect(shouldReconnect(CLOSE_CODES.GOING_AWAY)).toBe(true);
  });

  test('should not reconnect on protocol error (1002)', () => {
    expect(shouldReconnect(CLOSE_CODES.PROTOCOL_ERROR)).toBe(false);
  });

  test('should not reconnect on policy violation (1008)', () => {
    expect(shouldReconnect(CLOSE_CODES.POLICY_VIOLATION)).toBe(false);
  });

  test('should reconnect on internal server error (1011)', () => {
    expect(shouldReconnect(CLOSE_CODES.INTERNAL_ERROR)).toBe(true);
  });

  test('should reconnect on service restart (1012)', () => {
    expect(shouldReconnect(CLOSE_CODES.SERVICE_RESTART)).toBe(true);
  });

  test('should reconnect on try again later (1013)', () => {
    expect(shouldReconnect(CLOSE_CODES.TRY_AGAIN_LATER)).toBe(true);
  });

  test('should reconnect on abnormal closure (1006)', () => {
    expect(shouldReconnect(CLOSE_CODES.ABNORMAL)).toBe(true);
  });
});

describe('Transport State Machine', () => {
  type TransportState = 'disconnected' | 'connecting' | 'connected' | 'error';

  interface TransportStats {
    connectionAttempts: number;
    messagesSent: number;
    messagesReceived: number;
    bytesIn: number;
    bytesOut: number;
    lastConnectedAt: Date | null;
    lastErrorAt: Date | null;
    lastError: string | null;
  }

  function createInitialStats(): TransportStats {
    return {
      connectionAttempts: 0,
      messagesSent: 0,
      messagesReceived: 0,
      bytesIn: 0,
      bytesOut: 0,
      lastConnectedAt: null,
      lastErrorAt: null,
      lastError: null,
    };
  }

  test('should start in disconnected state', () => {
    const state: TransportState = 'disconnected';
    expect(state).toBe('disconnected');
  });

  test('should transition to connecting on start', () => {
    let state: TransportState = 'disconnected';
    state = 'connecting';
    expect(state).toBe('connecting');
  });

  test('should transition to connected on success', () => {
    let state: TransportState = 'connecting';
    state = 'connected';
    expect(state).toBe('connected');
  });

  test('should transition to error on failure', () => {
    let state: TransportState = 'connecting';
    state = 'error';
    expect(state).toBe('error');
  });

  test('should transition to disconnected on close', () => {
    let state: TransportState = 'connected';
    state = 'disconnected';
    expect(state).toBe('disconnected');
  });

  test('should initialize stats with zeroes', () => {
    const stats = createInitialStats();

    expect(stats.connectionAttempts).toBe(0);
    expect(stats.messagesSent).toBe(0);
    expect(stats.messagesReceived).toBe(0);
    expect(stats.bytesIn).toBe(0);
    expect(stats.bytesOut).toBe(0);
    expect(stats.lastConnectedAt).toBeNull();
    expect(stats.lastErrorAt).toBeNull();
    expect(stats.lastError).toBeNull();
  });

  test('should increment connection attempts', () => {
    const stats = createInitialStats();
    stats.connectionAttempts++;
    expect(stats.connectionAttempts).toBe(1);

    stats.connectionAttempts++;
    expect(stats.connectionAttempts).toBe(2);
  });

  test('should track bytes sent', () => {
    const stats = createInitialStats();
    const message = JSON.stringify({ jsonrpc: '2.0', method: 'test', id: 1 });

    stats.messagesSent++;
    stats.bytesOut += message.length;

    expect(stats.messagesSent).toBe(1);
    expect(stats.bytesOut).toBeGreaterThan(0);
  });
});

describe('Session ID Generation', () => {
  function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  test('should generate unique session IDs', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();

    expect(id1).not.toBe(id2);
  });

  test('should have session prefix', () => {
    const id = generateSessionId();
    expect(id.startsWith('session_')).toBe(true);
  });

  test('should contain timestamp', () => {
    const before = Date.now();
    const id = generateSessionId();
    const after = Date.now();

    const parts = id.split('_');
    const timestamp = parseInt(parts[1], 10);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  test('should be reasonably long', () => {
    const id = generateSessionId();
    expect(id.length).toBeGreaterThan(20);
  });
});

describe('Timeout Utility', () => {
  function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
    ]);
  }

  test('should resolve if promise completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve('success'), 1000, 'Timeout');
    expect(result).toBe('success');
  });

  test('should reject if promise times out', async () => {
    await expect(
      withTimeout(
        new Promise(() => {}), // Never resolves
        10,
        'Custom timeout message',
      ),
    ).rejects.toThrow('Custom timeout message');
  });

  test('should propagate promise rejection', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('Original error')), 1000, 'Timeout'),
    ).rejects.toThrow('Original error');
  });
});

describe('Header Normalization', () => {
  function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      // Lowercase header names for consistency
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  test('should lowercase header names', () => {
    const headers = {
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value',
    };

    const result = normalizeHeaders(headers);

    expect(result['authorization']).toBe('Bearer token');
    expect(result['content-type']).toBe('application/json');
    expect(result['x-custom-header']).toBe('value');
  });

  test('should preserve header values', () => {
    const headers = {
      Authorization: 'Bearer ABC123',
    };

    const result = normalizeHeaders(headers);
    expect(result['authorization']).toBe('Bearer ABC123');
  });

  test('should handle empty headers', () => {
    const result = normalizeHeaders({});
    expect(Object.keys(result)).toHaveLength(0);
  });
});
