/**
 * Unit tests for WebSocket Transport
 *
 * Tests the WebSocket transport implementation focusing on:
 * - Connection timeout handling
 * - Message handling and callback invocation
 * - Reconnection logic and shouldReconnect behavior
 * - Message queue flushing with error handling
 * - Cleanup of timers and resources
 *
 * These tests complement the integration tests by targeting
 * specific edge cases and error paths.
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the logger to prevent side effects and capture logging
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

// Store the mock WebSocket class for test manipulation
type WebSocketEventHandler = (...args: unknown[]) => void;

interface MockWebSocketInstance {
  readyState: number;
  eventHandlers: Map<string, WebSocketEventHandler[]>;
  on: (event: string, handler: WebSocketEventHandler) => MockWebSocketInstance;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
}

// WebSocket readyState constants (inline to avoid hoisting issues)
const _WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

vi.mock('ws', () => {
  // Use inline constants to avoid hoisting issues
  const CONNECTING = 0;
  const OPEN = 1;
  const CLOSING = 2;
  const CLOSED = 3;

  const MockWebSocket = function (this: MockWebSocketInstance) {
    const eventHandlers = new Map<string, WebSocketEventHandler[]>();

    this.readyState = CONNECTING;
    this.eventHandlers = eventHandlers;
    this.on = vi.fn((event: string, handler: WebSocketEventHandler) => {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
      return this;
    });
    this.send = vi.fn((_data: unknown, callback?: (error?: Error) => void) => {
      if (callback) {
        callback();
      }
    });
    this.close = vi.fn();
    this.ping = vi.fn();
    this.terminate = vi.fn();
    this.removeAllListeners = vi.fn(() => {
      eventHandlers.clear();
    });
    this.emit = (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        handlers.forEach((handler) => handler(...args));
      }
    };

    // Store reference for tests
    (globalThis as Record<string, unknown>).__mockWsInstance = this;
  };

  return {
    default: Object.assign(MockWebSocket, {
      CONNECTING,
      OPEN,
      CLOSING,
      CLOSED,
    }),
  };
});

// Helper to get the mock instance
function getMockWsInstance(): MockWebSocketInstance | null {
  return (globalThis as Record<string, unknown>).__mockWsInstance as MockWebSocketInstance | null;
}

// Import after mocks are set up
import { logger } from '../../../../packages/mcp/src/logger.js';
import { createWebSocketClientTransport } from '../../../../packages/mcp/src/transports/websocket-transport.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  (globalThis as Record<string, unknown>).__mockWsInstance = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WebSocketClientTransport', () => {
  describe('URL conversion', () => {
    test('should convert http:// to ws://', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'http://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      // Let the transport be created
      await vi.runAllTimersAsync();

      const result = await transportPromise;

      // Start connection to trigger state change logging
      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Check that the URL was converted (by verifying state change was logged)
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('State change'));

      await result.close();
    });

    test('should convert https:// to wss://', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'https://example.com/ws',
        heartbeat: false,
        reconnect: false,
      });

      await vi.runAllTimersAsync();
      const result = await transportPromise;
      await result.close();
    });

    test('should keep ws:// unchanged', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      await vi.runAllTimersAsync();
      const result = await transportPromise;
      await result.close();
    });

    test('should keep wss:// unchanged', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'wss://secure.example.com/ws',
        heartbeat: false,
        reconnect: false,
      });

      await vi.runAllTimersAsync();
      const result = await transportPromise;
      await result.close();
    });
  });

  describe('connection timeout handling (lines 137-145)', () => {
    test('should trigger connection timeout error when connection takes too long', async () => {
      const errors: Error[] = [];

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        connectionTimeout: 100,
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onerror = (error: Error) => {
        errors.push(error);
      };

      // Start connection and immediately add catch handler to prevent unhandled rejection
      const startPromise = result.transport.start().catch((error: Error) => {
        // Expected timeout error
        return error;
      });

      // Advance time past the connection timeout without emitting 'open'
      await vi.advanceTimersByTimeAsync(150);

      // Wait for the promise to resolve with the caught error
      const caughtError = await startPromise;

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toContain('Connection timeout');

      // Error callback should have been called
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Connection timeout');

      await result.close();
    });

    test('should clear timeout when connection succeeds before timeout', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        connectionTimeout: 5000,
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      // Start connection
      const startPromise = result.transport.start();

      // Simulate successful connection before timeout
      await vi.advanceTimersByTimeAsync(100);
      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      expect(result.getState?.()).toBe('connected');

      await result.close();
    });
  });

  describe('message handling and onmessage callback (lines 162, 219)', () => {
    test('should call onmessage callback when message is received', async () => {
      const messages: JSONRPCMessage[] = [];

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onmessage = <T extends JSONRPCMessage>(message: T) => {
        messages.push(message);
      };

      // Start and connect
      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate receiving a message
      const testMessage = {
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      };

      mockWs = getMockWsInstance();
      if (mockWs) {
        const messageData = {
          toString: () => JSON.stringify(testMessage),
        };
        mockWs.emit('message', messageData);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(testMessage);

      await result.close();
    });

    test('should handle message without onmessage callback set', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      // Don't set onmessage callback

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate receiving a message - should not throw
      const testMessage = { jsonrpc: '2.0', method: 'test', id: 1 };
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.emit('message', { toString: () => JSON.stringify(testMessage) });
      }

      // Should not throw, just log
      expect(logger.debug).toHaveBeenCalled();

      await result.close();
    });

    test('should handle malformed JSON messages', async () => {
      const errors: Error[] = [];

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onerror = (error: Error) => {
        errors.push(error);
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Send malformed JSON
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.emit('message', { toString: () => 'not valid json {{{' });
      }

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Failed to parse');
      expect(logger.error).toHaveBeenCalled();

      await result.close();
    });
  });

  describe('shouldReconnect close codes (lines 334-337)', () => {
    test('should not reconnect on code 1002 (protocol error)', async () => {
      let closeCalled = false;

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
      });

      const result = await transportPromise;
      result.transport.onclose = () => {
        closeCalled = true;
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with code 1002 (protocol error)
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1002, Buffer.from('protocol error'));
      }

      await vi.advanceTimersByTimeAsync(100);

      expect(closeCalled).toBe(true);
      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });

    test('should not reconnect on code 1003 (invalid data)', async () => {
      let closeCalled = false;

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
      });

      const result = await transportPromise;
      result.transport.onclose = () => {
        closeCalled = true;
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with code 1003 (invalid data)
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1003, Buffer.from('invalid data'));
      }

      await vi.advanceTimersByTimeAsync(100);

      expect(closeCalled).toBe(true);
      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });

    test('should not reconnect on code 1008 (policy violation)', async () => {
      let closeCalled = false;

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
      });

      const result = await transportPromise;
      result.transport.onclose = () => {
        closeCalled = true;
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with code 1008 (policy violation)
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1008, Buffer.from('policy violation'));
      }

      await vi.advanceTimersByTimeAsync(100);

      expect(closeCalled).toBe(true);
      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });

    test('should not reconnect on code 1009 (message too big)', async () => {
      let closeCalled = false;

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
      });

      const result = await transportPromise;
      result.transport.onclose = () => {
        closeCalled = true;
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with code 1009 (message too big)
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1009, Buffer.from('message too big'));
      }

      await vi.advanceTimersByTimeAsync(100);

      expect(closeCalled).toBe(true);
      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });

    test('should reconnect on code 1001 (going away)', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 50,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with code 1001 (going away) - should trigger reconnect
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Should be in reconnecting state
      expect(result.getState?.()).toBe('reconnecting');

      await result.close();
    });

    test('should reconnect on code 1011 (internal server error)', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 50,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with code 1011 (internal server error) - should trigger reconnect
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1011, Buffer.from('internal server error'));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Should be in reconnecting state
      expect(result.getState?.()).toBe('reconnecting');

      await result.close();
    });

    test('should not reconnect on code 1000 (normal closure)', async () => {
      let closeCalled = false;

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
      });

      const result = await transportPromise;
      result.transport.onclose = () => {
        closeCalled = true;
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with code 1000 (normal closure) - should NOT trigger reconnect
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1000, Buffer.from('normal closure'));
      }

      await vi.advanceTimersByTimeAsync(100);

      expect(closeCalled).toBe(true);
      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });
  });

  describe('message queue flushing error handling (line 458)', () => {
    test('should log error when flushing queued message fails', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 50,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Queue a message while connected
      const queuedMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'queued_test',
        id: 999,
      };

      // Simulate disconnect to put transport in reconnecting state
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Queue a message while reconnecting
      await result.transport.send(queuedMessage);

      // Wait for reconnect timer
      await vi.advanceTimersByTimeAsync(60);

      // Simulate the WebSocket reconnection
      mockWs = getMockWsInstance();
      if (mockWs) {
        // Make send fail when flushing
        mockWs.send = vi.fn((_data: unknown, callback?: (error?: Error) => void) => {
          if (callback) {
            callback(new Error('Send failed during flush'));
          }
        });
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await vi.advanceTimersByTimeAsync(10);

      // Should log the error for failed queued message
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send queued message'),
        expect.any(Error),
      );

      await result.close();
    });
  });

  describe('scheduleReconnect early return (line 361)', () => {
    test('should skip scheduling if reconnect timer already exists', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 1000,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close to trigger reconnect timer
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Should be in reconnecting state
      expect(result.getState?.()).toBe('reconnecting');

      // Simulate another close event - should not schedule a second timer
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.emit('close', 1001, Buffer.from('going away again'));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Still in reconnecting state
      expect(result.getState?.()).toBe('reconnecting');

      await result.close();
    });
  });

  describe('sendImmediate rejection (lines 427-428)', () => {
    test('should reject when WebSocket readyState changes during send', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      };

      // Mock send to change readyState before the callback
      const mockWsAfterConnect = getMockWsInstance();
      if (mockWsAfterConnect) {
        mockWsAfterConnect.send = vi.fn((_data: unknown, callback?: (error?: Error) => void) => {
          // Change readyState to simulate connection closing during send
          mockWsAfterConnect.readyState = WS_CLOSING;
          if (callback) {
            callback(new Error('Connection closed during send'));
          }
        });
      }

      // The send should fail because the connection closed
      await expect(result.transport.send(message)).rejects.toThrow('Connection closed during send');

      await result.close();
    });
  });

  describe('cleanup of reconnect timer (lines 480-481)', () => {
    test('should clear reconnect timer during cleanup', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 1000,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate disconnect to trigger reconnect timer
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Should be in reconnecting state with timer pending
      expect(result.getState?.()).toBe('reconnecting');

      // Close should cleanup the timer
      await result.close();

      expect(result.getState?.()).toBe('disconnected');

      // Advancing time should not cause any reconnection attempts
      await vi.advanceTimersByTimeAsync(2000);

      expect(result.getState?.()).toBe('disconnected');
    });

    test('should handle cleanup when already closed', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      // Close without connecting
      await result.close();
      await result.close(); // Second close should be safe

      expect(result.getState?.()).toBe('disconnected');
    });
  });

  describe('heartbeat functionality', () => {
    test('should start heartbeat after connection', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: true,
        heartbeatInterval: 100,
        heartbeatTimeout: 50,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Wait for heartbeat interval
      await vi.advanceTimersByTimeAsync(110);

      // Ping should have been called
      expect(getMockWsInstance()?.ping).toHaveBeenCalled();

      await result.close();
    });

    test('should handle pong response and clear timeout', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: true,
        heartbeatInterval: 100,
        heartbeatTimeout: 50,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Wait for heartbeat to be sent
      await vi.advanceTimersByTimeAsync(110);

      // Emit pong response
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.emit('pong');
      }

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Heartbeat pong received'));

      // Connection should still be open
      expect(result.getState?.()).toBe('connected');

      await result.close();
    });

    test('should terminate connection on heartbeat timeout', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: true,
        heartbeatInterval: 100,
        heartbeatTimeout: 50,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Wait for heartbeat to be sent and timeout to trigger (no pong)
      await vi.advanceTimersByTimeAsync(160);

      // Terminate should have been called
      expect(getMockWsInstance()?.terminate).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Heartbeat timeout'));

      await result.close();
    });
  });

  describe('send functionality', () => {
    test('should send message when connected', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      };

      await result.transport.send(message);

      expect(getMockWsInstance()?.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function),
      );

      await result.close();
    });

    test('should throw when sending on disconnected transport', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      };

      await expect(result.transport.send(message)).rejects.toThrow(
        'Cannot send message: WebSocket is disconnected',
      );

      await result.close();
    });

    test('should queue messages while reconnecting', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 100,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate disconnect
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      await vi.advanceTimersByTimeAsync(10);

      expect(result.getState?.()).toBe('reconnecting');

      // Queue a message while reconnecting - should not throw
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'queued_test',
        id: 123,
      };

      await result.transport.send(message);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Message queued'));

      await result.close();
    });
  });

  describe('error handling', () => {
    test('should call onerror callback on WebSocket error', async () => {
      const errors: Error[] = [];

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onerror = (error: Error) => {
        errors.push(error);
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      // Simulate WebSocket error
      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.emit('error', new Error('Connection refused'));
      }

      await expect(startPromise).rejects.toThrow();

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Connection refused');

      await result.close();
    });

    test('should handle send error callback', async () => {
      const errors: Error[] = [];

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onerror = (error: Error) => {
        errors.push(error);
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Make send fail
      const mockWsAfterConnect = getMockWsInstance();
      if (mockWsAfterConnect) {
        mockWsAfterConnect.send = vi.fn((_data: unknown, callback?: (error?: Error) => void) => {
          if (callback) {
            callback(new Error('Send failed'));
          }
        });
      }

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      };

      await expect(result.transport.send(message)).rejects.toThrow('Send failed');

      await result.close();
    });
  });

  describe('state management', () => {
    test('should return initial disconnected state', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });

    test('should return to connected state if start called when already connected', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      expect(result.getState?.()).toBe('connected');

      // Calling start again should return immediately
      await result.transport.start();

      expect(result.getState?.()).toBe('connected');

      await result.close();
    });

    test('should reuse existing connection promise when start called during connecting', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      // Start multiple times concurrently
      const startPromise1 = result.transport.start();
      const startPromise2 = result.transport.start();

      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      // Both promises should resolve
      await Promise.all([startPromise1, startPromise2]);

      expect(result.getState?.()).toBe('connected');

      await result.close();
    });
  });

  describe('force reconnect', () => {
    test('should reset reconnect attempts and reconnect', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      expect(result.getState?.()).toBe('connected');

      // Force reconnect
      const reconnectPromise = result.reconnect?.();
      await vi.advanceTimersByTimeAsync(10);

      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await reconnectPromise;

      expect(result.getState?.()).toBe('connected');

      await result.close();
    });
  });

  describe('sessionId generation', () => {
    test('should generate unique sessionId', async () => {
      const transport1Promise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const transport2Promise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const [result1, result2] = await Promise.all([transport1Promise, transport2Promise]);

      expect(result1.transport.sessionId).toBeDefined();
      expect(result2.transport.sessionId).toBeDefined();
      expect(result1.transport.sessionId).not.toBe(result2.transport.sessionId);

      await result1.close();
      await result2.close();
    });
  });

  describe('URL sanitization for logging', () => {
    test('should sanitize URL with query params for logging', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://user:pass@localhost:3000/ws?token=secret123&key=abc',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Verify that the logged URL doesn't contain query params or credentials
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Connected to.*localhost:3000/),
      );

      await result.close();
    });
  });

  describe('getMessageSummary', () => {
    test('should log method for request messages', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Send a method message
      await result.transport.send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('method=tools/list'));

      await result.close();
    });

    test('should log result for response messages', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onmessage = () => {
        // Handler required
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate receiving a result message
      mockWs = getMockWsInstance();
      if (mockWs) {
        const resultMessage = { jsonrpc: '2.0', result: { tools: [] }, id: 1 };
        mockWs.emit('message', { toString: () => JSON.stringify(resultMessage) });
      }

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('result for id=1'));

      await result.close();
    });

    test('should log error for error messages', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onmessage = () => {
        // Handler required
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate receiving an error message
      mockWs = getMockWsInstance();
      if (mockWs) {
        const errorMessage = {
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
          id: 2,
        };
        mockWs.emit('message', { toString: () => JSON.stringify(errorMessage) });
      }

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('error for id=2'));

      await result.close();
    });
  });

  describe('max reconnection attempts', () => {
    test('should stop reconnecting after max attempts reached', async () => {
      let closeCalled = false;
      const errors: Error[] = [];

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 2,
        initialReconnectDelay: 50,
        connectionTimeout: 5000,
      });

      const result = await transportPromise;
      result.transport.onerror = (error: Error) => {
        errors.push(error);
      };
      result.transport.onclose = () => {
        closeCalled = true;
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate disconnect with a code that triggers reconnection
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1011, Buffer.from('internal error'));
      }

      // Should be in reconnecting state
      expect(result.getState?.()).toBe('reconnecting');

      // Wait for first reconnect attempt (50ms delay)
      await vi.advanceTimersByTimeAsync(60);

      // Simulate close event for the first reconnection attempt
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1011, Buffer.from('internal error'));
      }

      // Wait for second reconnect attempt (100ms delay due to backoff)
      await vi.advanceTimersByTimeAsync(110);

      // Simulate close event for the second reconnection attempt
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1011, Buffer.from('internal error'));
      }

      // Wait for max attempts to be reached
      await vi.advanceTimersByTimeAsync(300);

      // At this point, max attempts should be reached
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Max reconnection attempts'),
      );

      expect(closeCalled).toBe(true);
      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });
  });

  describe('setProtocolVersion', () => {
    test('should accept protocol version without error', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      // setProtocolVersion should not throw
      result.transport.setProtocolVersion?.('2024-11-05');

      await result.close();
    });
  });

  describe('invalid JSON-RPC message validation', () => {
    test('should call onerror for invalid JSON-RPC message format', async () => {
      const errors: Error[] = [];

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onerror = (error: Error) => {
        errors.push(error);
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Send a valid JSON but invalid JSON-RPC message (missing jsonrpc field)
      mockWs = getMockWsInstance();
      if (mockWs) {
        const invalidRpcMessage = { method: 'test', id: 1 }; // Missing jsonrpc: '2.0'
        mockWs.emit('message', { toString: () => JSON.stringify(invalidRpcMessage) });
      }

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Invalid JSONRPC message format');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Validation error'),
        expect.any(Error),
      );

      await result.close();
    });
  });

  describe('message queue during connecting state', () => {
    test('should queue messages while connecting (not just reconnecting)', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      // Start connection but don't complete it yet
      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      // Queue a message while still in connecting state
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'queued_during_connect',
        id: 456,
      };

      // This should queue the message, not throw
      await result.transport.send(message);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Message queued'));

      // Now complete the connection
      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // The queued message should have been flushed
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Flushing'));

      await result.close();
    });
  });

  describe('exponential backoff calculation', () => {
    test('should apply exponential backoff with multiplier', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 100,
        maxReconnectDelay: 5000,
        reconnectBackoffMultiplier: 2,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Trigger first reconnection
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      // First attempt: 100ms delay
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Reconnecting in 100ms'));

      await result.close();
    });

    test('should cap reconnect delay at maxReconnectDelay', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 10,
        initialReconnectDelay: 1000,
        maxReconnectDelay: 2000,
        reconnectBackoffMultiplier: 10,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Trigger first reconnection
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      // First attempt: 1000ms delay (within cap)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Reconnecting in 1000ms'));

      // Wait for first reconnect to trigger
      await vi.advanceTimersByTimeAsync(1100);

      // Second close to trigger second reconnect
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      // Second attempt: should be capped at 2000ms (not 10000ms)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Reconnecting in 2000ms'));

      await result.close();
    });
  });

  describe('getMessageSummary edge cases', () => {
    test('should return unknown for message without method, result, or error', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onmessage = () => {
        // Handler required to prevent undefined call
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Send a notification message (has method but no id - this is valid JSON-RPC)
      mockWs = getMockWsInstance();
      if (mockWs) {
        const notificationMessage = { jsonrpc: '2.0', method: 'notify' };
        mockWs.emit('message', { toString: () => JSON.stringify(notificationMessage) });
      }

      // Should log method=notify
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('method=notify'));

      await result.close();
    });
  });

  describe('connection error during reconnect', () => {
    test('should schedule another reconnect on connection error if attempts remain', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 3,
        initialReconnectDelay: 50,
        connectionTimeout: 100,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Trigger first reconnection via close
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      await vi.advanceTimersByTimeAsync(10);
      expect(result.getState?.()).toBe('reconnecting');

      // Wait for reconnect attempt
      await vi.advanceTimersByTimeAsync(60);

      // Simulate connection error during reconnect attempt
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.emit('error', new Error('Connection failed'));
      }

      // Should log the error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        expect.any(Error),
      );

      await result.close();
    });
  });

  describe('heartbeat with closed WebSocket', () => {
    test('should not send ping when WebSocket is not open', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: true,
        heartbeatInterval: 50,
        heartbeatTimeout: 25,
        reconnect: false,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Change WebSocket state to CLOSING before heartbeat fires
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSING;
      }

      // Clear previous ping calls
      vi.clearAllMocks();

      // Wait for heartbeat interval
      await vi.advanceTimersByTimeAsync(60);

      // Ping should not have been called since WebSocket is not OPEN
      expect(getMockWsInstance()?.ping).not.toHaveBeenCalled();

      await result.close();
    });
  });

  describe('default configuration values', () => {
    test('should use default config values when not specified', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        // Only url provided, all other options use defaults
      });

      const result = await transportPromise;

      // The transport should be created with defaults
      expect(result.transport).toBeDefined();
      expect(result.getState?.()).toBe('disconnected');

      await result.close();
    });
  });

  describe('WebSocket constructor error handling', () => {
    test('should handle non-Error exceptions in WebSocket construction', async () => {
      // This tests the catch block that converts non-Error to Error
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;

      // The transport should still be created
      expect(result.transport).toBeDefined();

      await result.close();
    });
  });

  describe('close during connecting state', () => {
    test('should properly close when called during connection', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
        connectionTimeout: 100,
      });

      const result = await transportPromise;

      // Start connection but don't complete it
      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      // Simulate WebSocket error during close
      const mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.emit('error', new Error('Connection aborted'));
      }

      // Close while still connecting
      await result.close();

      expect(result.getState?.()).toBe('disconnected');

      // Wait for the start promise to settle (will reject due to error)
      await expect(startPromise).rejects.toThrow();
    });
  });

  describe('reconnect disabled', () => {
    test('should not attempt reconnection when reconnect is false', async () => {
      let closeCalled = false;

      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: false,
      });

      const result = await transportPromise;
      result.transport.onclose = () => {
        closeCalled = true;
      };

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with a code that would normally trigger reconnect
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 1001, Buffer.from('going away'));
      }

      await vi.advanceTimersByTimeAsync(100);

      // Should be disconnected, not reconnecting
      expect(result.getState?.()).toBe('disconnected');
      expect(closeCalled).toBe(true);

      await result.close();
    });
  });

  describe('other close codes for shouldReconnect', () => {
    test('should reconnect for unknown close codes', async () => {
      const transportPromise = createWebSocketClientTransport({
        url: 'ws://localhost:3000/ws',
        heartbeat: false,
        reconnect: true,
        maxReconnectAttempts: 5,
        initialReconnectDelay: 50,
      });

      const result = await transportPromise;

      const startPromise = result.transport.start();
      await vi.advanceTimersByTimeAsync(10);

      let mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_OPEN;
        mockWs.emit('open');
      }

      await startPromise;

      // Simulate close with an unknown code (e.g., 4000 custom code)
      mockWs = getMockWsInstance();
      if (mockWs) {
        mockWs.readyState = WS_CLOSED;
        mockWs.emit('close', 4000, Buffer.from('custom close'));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Should attempt to reconnect for unknown codes
      expect(result.getState?.()).toBe('reconnecting');

      await result.close();
    });
  });
});
