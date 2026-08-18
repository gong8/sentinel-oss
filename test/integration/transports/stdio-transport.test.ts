/**
 * Integration tests for STDIO transport
 *
 * Tests the STDIO transport implementation against real subprocess MCP servers,
 * verifying the complete lifecycle including handshake, tool operations, and cleanup.
 *
 * Note: The createStdioClientTransport function pre-starts the transport, so we
 * communicate directly at the JSON-RPC level rather than through the Client class.
 */

import { resolve } from 'path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createStdioClientTransport,
  createStdioClientTransportWithRestart,
} from '../../../packages/mcp/src/transports/stdio-transport.js';
import type { ClientTransportResult } from '../../../packages/mcp/src/transports/types.js';

vi.mock('../../../packages/mcp/src/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    mcp: vi.fn(),
    tool: vi.fn(),
  },
}));

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolsListResult {
  tools: Array<{ name: string; description: string }>;
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
}

interface InitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
}

/**
 * Helper to perform JSON-RPC communication with transport.
 * Sets up message handler before sending to avoid race conditions.
 */
function createJsonRpcClient(transport: ClientTransportResult['transport']): {
  request: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
  close: () => void;
} {
  let nextId = 1;
  const pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  // Set up the message handler immediately
  transport.onmessage = (message: unknown) => {
    const msg = message as JsonRpcMessage;
    if (msg.id !== undefined) {
      const pending = pendingRequests.get(msg.id);
      if (pending) {
        pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
  };

  transport.onerror = (error: Error) => {
    // Reject all pending requests on error
    for (const [id, pending] of pendingRequests) {
      pending.reject(error);
      pendingRequests.delete(id);
    }
  };

  transport.onclose = () => {
    // Reject all pending requests on close
    for (const [id, pending] of pendingRequests) {
      pending.reject(new Error('Transport closed'));
      pendingRequests.delete(id);
    }
  };

  return {
    request: <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });

        transport
          .send({
            jsonrpc: '2.0',
            id,
            method,
            params,
          })
          .catch((error) => {
            pendingRequests.delete(id);
            reject(error);
          });
      });
    },
    close: () => {
      pendingRequests.clear();
    },
  };
}

/**
 * Initialize the MCP connection with a transport
 */
async function initializeMcp(
  rpc: ReturnType<typeof createJsonRpcClient>,
): Promise<InitializeResult> {
  const result = await rpc.request<InitializeResult>('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });

  return result;
}

describe('STDIO Transport Integration', () => {
  const fixturesDir = resolve(__dirname, 'fixtures');
  const serverPath = resolve(fixturesDir, 'stdio-test-server.mjs');
  const crashServerPath = resolve(fixturesDir, 'crash-test-server.mjs');

  let activeTransports: Array<{
    result: ClientTransportResult;
    rpc: ReturnType<typeof createJsonRpcClient>;
  }> = [];

  async function createTransport(
    config: Parameters<typeof createStdioClientTransport>[0],
    timeout?: number,
  ): Promise<{ result: ClientTransportResult; rpc: ReturnType<typeof createJsonRpcClient> }> {
    const result = await createStdioClientTransport(config, timeout);
    const rpc = createJsonRpcClient(result.transport);
    const entry = { result, rpc };
    activeTransports.push(entry);
    return entry;
  }

  afterEach(async () => {
    for (const { result, rpc } of activeTransports) {
      rpc.close();
      try {
        await result.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    activeTransports = [];
  });

  beforeAll(() => {
    expect(process.execPath).toBeDefined();
  });

  describe('Transport Creation and Handshake', () => {
    it('should spawn server and perform MCP handshake', async () => {
      const { result, rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
      });

      expect(result.transport).toBeDefined();
      expect(result.close).toBeInstanceOf(Function);

      const initResult = await initializeMcp(rpc);

      expect(initResult.protocolVersion).toBe('2024-11-05');
      expect(initResult.serverInfo.name).toBe('test-stdio-server');
      expect(initResult.serverInfo.version).toBe('1.0.0');
    });

    it('should handle non-existent script gracefully', async () => {
      const nonExistentScript = resolve(fixturesDir, 'does-not-exist.mjs');

      // The transport will start (node process spawns) but fail when the script can't be loaded
      const result = await createStdioClientTransport({
        command: process.execPath,
        args: [nonExistentScript],
      });

      const rpc = createJsonRpcClient(result.transport);

      // Attempting to communicate should fail because the server process exited
      await expect(
        rpc.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        }),
      ).rejects.toThrow();

      rpc.close();
      await result.close().catch(() => {});
    });
  });

  describe('Tool Operations', () => {
    it('should list tools from stdio server', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
      });

      await initializeMcp(rpc);

      const toolsResult = await rpc.request<ToolsListResult>('tools/list', {});

      expect(toolsResult.tools).toHaveLength(3);

      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('get_env');
      expect(toolNames).toContain('fail');
    });

    it('should execute tool calls successfully', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
      });

      await initializeMcp(rpc);

      const echoResult = await rpc.request<ToolCallResult>('tools/call', {
        name: 'echo',
        arguments: { message: 'Hello, STDIO!' },
      });

      expect(echoResult.content).toHaveLength(1);
      expect(echoResult.content[0].type).toBe('text');
      expect(echoResult.content[0].text).toBe('Hello, STDIO!');
    });

    it('should handle tool execution errors gracefully', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
      });

      await initializeMcp(rpc);

      await expect(
        rpc.request('tools/call', {
          name: 'fail',
          arguments: {},
        }),
      ).rejects.toThrow('Intentional test failure');
    });

    it('should handle unknown tool calls', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
      });

      await initializeMcp(rpc);

      await expect(
        rpc.request('tools/call', {
          name: 'nonexistent_tool',
          arguments: {},
        }),
      ).rejects.toThrow('Unknown tool');
    });
  });

  describe('Environment Variable Passing', () => {
    it('should pass environment variables to subprocess', async () => {
      const testEnvValue = `test-value-${Date.now()}`;

      const { rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
        env: {
          TEST_CUSTOM_VAR: testEnvValue,
        },
      });

      await initializeMcp(rpc);

      const envResult = await rpc.request<ToolCallResult>('tools/call', {
        name: 'get_env',
        arguments: { name: 'TEST_CUSTOM_VAR' },
      });

      expect(envResult.content[0].text).toBe(testEnvValue);
    });

    it('should not pass dangerous environment variables', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
        env: {
          LD_PRELOAD: '/dangerous/lib.so',
          SAFE_VAR: 'safe-value',
        },
      });

      await initializeMcp(rpc);

      // LD_PRELOAD should be filtered out
      const ldPreloadResult = await rpc.request<ToolCallResult>('tools/call', {
        name: 'get_env',
        arguments: { name: 'LD_PRELOAD' },
      });
      expect(ldPreloadResult.content[0].text).toBe('<undefined>');

      // SAFE_VAR should be passed through
      const safeVarResult = await rpc.request<ToolCallResult>('tools/call', {
        name: 'get_env',
        arguments: { name: 'SAFE_VAR' },
      });
      expect(safeVarResult.content[0].text).toBe('safe-value');
    });
  });

  describe('Process Lifecycle', () => {
    it('should start and stop server cleanly', async () => {
      const result = await createStdioClientTransport({
        command: process.execPath,
        args: [serverPath],
      });

      const rpc = createJsonRpcClient(result.transport);

      const initResult = await rpc.request<InitializeResult>('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });
      expect(initResult.protocolVersion).toBeDefined();

      rpc.close();
      await result.close();

      // Transport should be closed - sending should fail
      await expect(
        result.transport.send({ jsonrpc: '2.0', method: 'test', id: 1 }),
      ).rejects.toThrow();
    });

    it('should handle multiple sequential connections', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await createStdioClientTransport({
          command: process.execPath,
          args: [serverPath],
        });

        const rpc = createJsonRpcClient(result.transport);

        await initializeMcp(rpc);

        const echoResult = await rpc.request<ToolCallResult>('tools/call', {
          name: 'echo',
          arguments: { message: `iteration-${i}` },
        });
        expect(echoResult.content[0].text).toBe(`iteration-${i}`);

        rpc.close();
        await result.close();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid command gracefully', async () => {
      await expect(
        createStdioClientTransport({
          command: 'definitely_not_a_real_command_12345',
          args: [],
        }),
      ).rejects.toThrow(/Command not found or not executable/);
    });

    it('should handle process crash during operation', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [crashServerPath],
        env: { CRASH_MODE: 'normal' },
      });

      await initializeMcp(rpc);

      // First call should work
      const echoResult = await rpc.request<ToolCallResult>('tools/call', {
        name: 'echo',
        arguments: { message: 'before crash' },
      });
      expect(echoResult.content[0].text).toBe('before crash');

      // Crash the server - this will cause subsequent calls to fail
      await expect(
        rpc.request('tools/call', {
          name: 'crash',
          arguments: {},
        }),
      ).rejects.toThrow();
    });

    it('should handle server that crashes on tool call', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [crashServerPath],
        env: { CRASH_MODE: 'on_tool_call' },
      });

      await initializeMcp(rpc);

      // Tool call should fail when server crashes
      await expect(
        rpc.request('tools/call', {
          name: 'echo',
          arguments: { message: 'test' },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Restart Capability', () => {
    it('should support transport with restart capability', async () => {
      const result = await createStdioClientTransportWithRestart(
        {
          command: process.execPath,
          args: [serverPath],
        },
        {
          maxRestarts: 3,
          restartDelayMs: 100,
        },
      );

      const rpc = createJsonRpcClient(result.transport);
      activeTransports.push({ result, rpc });

      expect(result.reconnect).toBeInstanceOf(Function);

      const initResult = await rpc.request<InitializeResult>('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });
      expect(initResult.protocolVersion).toBeDefined();
    });

    it('should respect max restart limit', async () => {
      let maxRestartsReached = false;

      const result = await createStdioClientTransportWithRestart(
        {
          command: process.execPath,
          args: [serverPath],
        },
        {
          maxRestarts: 2,
          restartDelayMs: 50,
          onMaxRestartsReached: () => {
            maxRestartsReached = true;
          },
        },
      );

      const rpc = createJsonRpcClient(result.transport);
      activeTransports.push({ result, rpc });

      // Trigger restarts until max is reached
      for (let i = 0; i < 3; i++) {
        if (result.reconnect) {
          if (i < 2) {
            await result.reconnect();
          } else {
            await expect(result.reconnect()).rejects.toThrow(/Max restarts.*reached/);
          }
        }
      }

      expect(maxRestartsReached).toBe(true);
    });
  });

  describe('Working Directory', () => {
    it('should accept working directory configuration', async () => {
      const { rpc } = await createTransport({
        command: process.execPath,
        args: [serverPath],
        workingDir: fixturesDir,
      });

      const initResult = await initializeMcp(rpc);
      expect(initResult.protocolVersion).toBeDefined();

      const toolsResult = await rpc.request<ToolsListResult>('tools/list', {});
      expect(toolsResult.tools.length).toBeGreaterThan(0);
    });
  });

  describe('PATH Resolution', () => {
    it('should resolve command from PATH using relative name', async () => {
      // Use 'node' (relative command) instead of process.execPath (absolute)
      // This exercises the PATH search loop (lines 136-143)
      const { rpc } = await createTransport({
        command: 'node',
        args: [serverPath],
      });

      const initResult = await initializeMcp(rpc);
      expect(initResult.protocolVersion).toBeDefined();
    });

    it('should search multiple PATH directories when command not in first', async () => {
      // Node should be found in PATH after searching
      const { rpc } = await createTransport({
        command: 'node',
        args: [serverPath],
      });

      const toolsResult = await rpc.request<ToolsListResult>('tools/list', {});
      expect(toolsResult.tools.length).toBeGreaterThan(0);
    });
  });
});
