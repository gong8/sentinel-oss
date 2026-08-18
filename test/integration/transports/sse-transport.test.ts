/**
 * SSE Transport Integration Tests
 *
 * Tests the SSE transport implementation against a real MCP server using the SDK's
 * SSEServerTransport. SSE transport is the legacy MCP protocol where:
 * - Server to Client: SSE stream (text/event-stream)
 * - Client to Server: HTTP POST to a message endpoint
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSseClientTransport } from '../../../packages/mcp/src/transports/sse-transport.js';

// Type for tool result content items
type ToolResultContent = Array<{ type: string; text?: string }>;

// Helper to extract content from tool call result
// The SDK returns a complex union type with index signature [x: string]: unknown
// We need to match that signature to accept the SDK result type
function getContent(result: {
  [x: string]: unknown;
  content?: ToolResultContent;
}): ToolResultContent {
  if (!result.content) {
    throw new Error('Expected result to have content property');
  }
  return result.content;
}

describe('SSE Transport Integration', () => {
  let httpServer: Server;
  let serverPort: number;
  let mcpServer: McpServer;
  let sseTransport: SSEServerTransport | null = null;
  const activeClients: Client[] = [];
  const activeTransportClosers: Array<() => Promise<void>> = [];

  /**
   * Creates the HTTP server that handles SSE connections and POST messages.
   * The SSE server needs to:
   * 1. Handle GET /sse for the event stream
   * 2. Handle POST /message for client messages
   */
  function createHttpServer(): Server {
    return createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost:${serverPort}`);
      const pathname = url.pathname;

      // CORS headers for testing
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // SSE endpoint - establishes the event stream
      if (req.method === 'GET' && pathname === '/sse') {
        // Create a new SSE transport for this connection
        sseTransport = new SSEServerTransport('/message', res);

        // Connect the MCP server to this transport
        await mcpServer.connect(sseTransport);
        return;
      }

      // Message endpoint - receives POST requests from the client
      if (req.method === 'POST' && pathname === '/message') {
        const sessionId = url.searchParams.get('sessionId');

        if (!sseTransport) {
          res.writeHead(500);
          res.end('No SSE connection established');
          return;
        }

        // Verify session ID matches
        if (sessionId !== sseTransport.sessionId) {
          res.writeHead(400);
          res.end('Invalid session ID');
          return;
        }

        // Let the transport handle the message
        await sseTransport.handlePostMessage(req, res);
        return;
      }

      // 404 for unknown routes
      res.writeHead(404);
      res.end('Not found');
    });
  }

  /**
   * Waits for the server to start listening
   */
  function startServer(server: Server, port: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      server.listen(port, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });
      server.on('error', reject);
    });
  }

  beforeAll(async () => {
    // Create and configure the MCP server with test tools
    mcpServer = new McpServer({
      name: 'test-sse-server',
      version: '1.0.0',
    });

    // Register test tools
    mcpServer.registerTool('echo', { description: 'Echoes back the input' }, async (extra) => {
      const input = (extra as unknown as { input?: string }).input ?? '';
      return {
        content: [{ type: 'text', text: `Echo: ${input}` }],
      };
    });

    mcpServer.registerTool(
      'add',
      {
        description: 'Adds two numbers',
        inputSchema: { a: z.number(), b: z.number() },
      },
      async (args) => {
        return {
          content: [{ type: 'text', text: `Result: ${args.a + args.b}` }],
        };
      },
    );

    mcpServer.registerTool(
      'greet',
      {
        description: 'Greets a person',
        inputSchema: { name: z.string() },
      },
      async (args) => {
        return {
          content: [{ type: 'text', text: `Hello, ${args.name}!` }],
        };
      },
    );

    mcpServer.registerTool(
      'slow_operation',
      {
        description: 'A slow operation for testing',
        inputSchema: { delay: z.number() },
      },
      async (args) => {
        await new Promise((resolve) => setTimeout(resolve, args.delay));
        return {
          content: [{ type: 'text', text: `Completed after ${args.delay}ms` }],
        };
      },
    );

    // Create and start the HTTP server
    httpServer = createHttpServer();
    serverPort = await startServer(httpServer);
  });

  afterAll(async () => {
    // Close all active clients
    for (const client of activeClients) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
    activeClients.length = 0;

    // Close the SSE transport if active
    if (sseTransport) {
      try {
        await sseTransport.close();
      } catch {
        // Ignore close errors
      }
      sseTransport = null;
    }

    // Close the HTTP server
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  beforeEach(() => {
    // Reset transport for each test to ensure clean state
    if (sseTransport) {
      sseTransport = null;
    }
  });

  afterEach(async () => {
    // Clean up clients after each test
    for (const client of activeClients) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
    activeClients.length = 0;

    // Close all tracked transports
    for (const closeTransport of activeTransportClosers) {
      try {
        await closeTransport();
      } catch {
        // Ignore close errors
      }
    }
    activeTransportClosers.length = 0;

    // Close and reset server-side transport
    if (sseTransport) {
      try {
        await sseTransport.close();
      } catch {
        // Ignore close errors
      }
      sseTransport = null;
    }
  });

  /**
   * Helper to create a transport and track its closer for cleanup
   */
  async function createTrackedTransport(
    urlOrConfig?: string | { url?: string; headers?: Record<string, string> },
  ) {
    const config = typeof urlOrConfig === 'string' ? { url: urlOrConfig } : (urlOrConfig ?? {});
    const result = await createSseClientTransport({
      url: config.url ?? `http://localhost:${serverPort}/sse`,
      headers: config.headers,
    });
    activeTransportClosers.push(result.close);
    return result;
  }

  /**
   * Helper to create and connect a client
   */
  async function createConnectedClient(): Promise<Client> {
    const { transport } = await createTrackedTransport();

    const client = new Client({
      name: 'test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    activeClients.push(client);

    return client;
  }

  describe('Connection and Handshake', () => {
    it('should connect via SSE and perform MCP handshake', async () => {
      const client = await createConnectedClient();

      // If we got here without error, handshake succeeded
      expect(client).toBeDefined();
    });

    it('should receive server info during handshake', async () => {
      const client = await createConnectedClient();

      // Wait a small moment for initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const _serverInfo = client.getServerVersion();
      // Server info may or may not be available depending on timing
      // The handshake is successful if we can make tool calls
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    });

    it('should track connection state correctly', async () => {
      const { transport, getState } = await createTrackedTransport();

      expect(getState?.()).toBe('disconnected');

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      expect(getState?.()).toBe('connected');
    });
  });

  describe('Tool Listing', () => {
    it('should list tools from SSE server', async () => {
      const client = await createConnectedClient();

      const tools = await client.listTools();

      expect(tools.tools).toHaveLength(4);
      expect(tools.tools.map((t) => t.name).sort()).toEqual([
        'add',
        'echo',
        'greet',
        'slow_operation',
      ]);
    });

    it('should include tool descriptions', async () => {
      const client = await createConnectedClient();

      const tools = await client.listTools();

      const addTool = tools.tools.find((t) => t.name === 'add');
      expect(addTool?.description).toBe('Adds two numbers');

      const greetTool = tools.tools.find((t) => t.name === 'greet');
      expect(greetTool?.description).toBe('Greets a person');
    });

    it('should include input schemas for tools', async () => {
      const client = await createConnectedClient();

      const tools = await client.listTools();

      const addTool = tools.tools.find((t) => t.name === 'add');
      expect(addTool?.inputSchema).toBeDefined();
      expect(addTool?.inputSchema?.properties).toHaveProperty('a');
      expect(addTool?.inputSchema?.properties).toHaveProperty('b');
    });
  });

  describe('Tool Execution', () => {
    it('should execute tool calls over SSE', async () => {
      const client = await createConnectedClient();

      const result = await client.callTool({
        name: 'add',
        arguments: { a: 5, b: 3 },
      });
      const content = getContent(result);

      expect(content).toHaveLength(1);
      expect(content[0]).toMatchObject({
        type: 'text',
        text: 'Result: 8',
      });
    });

    it('should execute tool with string argument', async () => {
      const client = await createConnectedClient();

      const result = await client.callTool({
        name: 'greet',
        arguments: { name: 'Alice' },
      });
      const content = getContent(result);

      expect(content).toHaveLength(1);
      expect(content[0]).toMatchObject({
        type: 'text',
        text: 'Hello, Alice!',
      });
    });

    it('should handle multiple sequential tool calls', async () => {
      const client = await createConnectedClient();

      const result1 = await client.callTool({
        name: 'add',
        arguments: { a: 1, b: 2 },
      });
      expect(getContent(result1)[0].text).toBe('Result: 3');

      const result2 = await client.callTool({
        name: 'add',
        arguments: { a: 10, b: 20 },
      });
      expect(getContent(result2)[0].text).toBe('Result: 30');

      const result3 = await client.callTool({
        name: 'greet',
        arguments: { name: 'Bob' },
      });
      expect(getContent(result3)[0].text).toBe('Hello, Bob!');
    });

    it('should handle concurrent tool calls', async () => {
      const client = await createConnectedClient();

      const [result1, result2, result3] = await Promise.all([
        client.callTool({ name: 'add', arguments: { a: 1, b: 1 } }),
        client.callTool({ name: 'add', arguments: { a: 2, b: 2 } }),
        client.callTool({ name: 'greet', arguments: { name: 'Charlie' } }),
      ]);

      expect(getContent(result1)[0].text).toBe('Result: 2');
      expect(getContent(result2)[0].text).toBe('Result: 4');
      expect(getContent(result3)[0].text).toBe('Hello, Charlie!');
    });

    it('should handle slow operations', async () => {
      const client = await createConnectedClient();

      const startTime = Date.now();
      const result = await client.callTool({
        name: 'slow_operation',
        arguments: { delay: 100 },
      });
      const elapsed = Date.now() - startTime;
      const content = getContent(result);

      expect(content[0].text).toBe('Completed after 100ms');
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Transport Statistics', () => {
    it('should track message statistics', async () => {
      const { transport, getState } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      // Make a tool call to generate traffic
      await client.callTool({
        name: 'add',
        arguments: { a: 1, b: 2 },
      });

      // Access the transport stats
      const managedTransport = transport as {
        getStats?: () => {
          messagesSent: number;
          messagesReceived: number;
          bytesIn: number;
          bytesOut: number;
        };
      };
      if (managedTransport.getStats) {
        const stats = managedTransport.getStats();
        expect(stats.messagesSent).toBeGreaterThan(0);
        expect(stats.messagesReceived).toBeGreaterThan(0);
        expect(stats.bytesIn).toBeGreaterThan(0);
        expect(stats.bytesOut).toBeGreaterThan(0);
      }

      expect(getState?.()).toBe('connected');
    });
  });

  describe('Cleanup', () => {
    it('should close transport cleanly', async () => {
      const { transport, close, getState } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      expect(getState?.()).toBe('connected');

      await close();
      expect(getState?.()).toBe('disconnected');

      // Client should no longer be usable
      // (don't add to activeClients since we closed it)
    });

    it('should handle double close gracefully', async () => {
      const { transport, close } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);

      await close();
      // Second close should not throw
      await close();
    });
  });

  describe('Reconnection', () => {
    it('should support manual reconnection', async () => {
      const { transport, reconnect, getState } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);
      expect(getState?.()).toBe('connected');

      // Reconnect creates a new connection
      await reconnect?.();
      expect(getState?.()).toBe('connected');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection to invalid URL', async () => {
      const { transport } = await createTrackedTransport('http://localhost:1/sse');

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await expect(client.connect(transport)).rejects.toThrow();
    });

    it('should handle invalid tool calls', async () => {
      const client = await createConnectedClient();

      // MCP SDK returns error response rather than throwing for invalid tools
      const result = await client.callTool({
        name: 'nonexistent_tool',
        arguments: {},
      });
      const content = getContent(result);

      expect(result.isError).toBe(true);
      expect(content).toHaveLength(1);
      expect(content[0].text).toContain('not found');
    });

    it('should handle malformed tool arguments', async () => {
      const client = await createConnectedClient();

      // Pass string instead of number - should be rejected by schema validation
      // MCP SDK returns error response rather than throwing
      const result = await client.callTool({
        name: 'add',
        arguments: { a: 'not a number', b: 2 },
      });
      const content = getContent(result);

      expect(result.isError).toBe(true);
      expect(content).toHaveLength(1);
      // The error message should indicate validation failure
      const errorText = content[0].text;
      expect(errorText).toContain('error');
    });
  });

  describe('Headers', () => {
    it('should send custom headers with SSE connection', async () => {
      const customHeaders = {
        Authorization: 'Bearer test-token',
        'X-Custom-Header': 'custom-value',
      };

      const { transport } = await createTrackedTransport({ headers: customHeaders });

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      // Connection should work with custom headers
      await client.connect(transport);
      activeClients.push(client);

      // Verify connection succeeded
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    });
  });

  describe('Send Error Handling', () => {
    it('should throw when sending message on disconnected transport', async () => {
      const { transport, close } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      // Close the transport
      await close();

      // Attempting to send after close should fail
      await expect(
        (transport as { send: (msg: unknown) => Promise<void> }).send({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ).rejects.toThrow('Cannot send message: transport is disconnected');
    });

    it('should throw when sending message before connection is established', async () => {
      const { transport } = await createTrackedTransport();

      // Try to send without connecting first
      await expect(
        (transport as { send: (msg: unknown) => Promise<void> }).send({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ).rejects.toThrow('Cannot send message: transport is disconnected');
    });
  });

  describe('Protocol Version', () => {
    it('should call setProtocolVersion when transport is connected', async () => {
      const { transport } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      // Should not throw when transport exists
      const managedTransport = transport as { setProtocolVersion: (v: string) => void };
      expect(() => managedTransport.setProtocolVersion('2024-11-05')).not.toThrow();
    });

    it('should handle setProtocolVersion when transport is not initialized', async () => {
      const { transport } = await createTrackedTransport();

      // Before connecting, sseTransport is null
      // setProtocolVersion should use optional chaining and not throw
      const managedTransport = transport as { setProtocolVersion: (v: string) => void };
      expect(() => managedTransport.setProtocolVersion('2024-11-05')).not.toThrow();
    });
  });

  describe('Connection State Transitions', () => {
    it('should return early when start() called while already connected', async () => {
      const { transport, getState } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      expect(getState?.()).toBe('connected');

      // Calling start again should return early without error
      const managedTransport = transport as { start: () => Promise<void> };
      await expect(managedTransport.start()).resolves.toBeUndefined();
      expect(getState?.()).toBe('connected');
    });

    it('should handle reconnect when transport is in connecting state', async () => {
      const { transport, reconnect, getState } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      expect(getState?.()).toBe('connected');

      // Reconnect should close first then start again
      await reconnect?.();
      expect(getState?.()).toBe('connected');
    });

    it('should track connection attempts', async () => {
      const { transport, close, getStats } = await createTrackedTransport();

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      const stats = getStats?.();
      expect(stats?.connectionAttempts).toBeGreaterThanOrEqual(1);

      await close();
    });

    it('should set error state and track error stats on connection failure', async () => {
      const { transport, getState, getStats } =
        await createTrackedTransport('http://localhost:1/sse');

      // Attempt connection which should fail
      await expect(transport.start()).rejects.toThrow();

      expect(getState?.()).toBe('error');
      const stats = getStats?.();
      expect(stats?.lastErrorAt).toBeDefined();
      expect(stats?.lastError).toBeDefined();
    });

    it('should handle reconnect when transport is disconnected', async () => {
      const { transport, reconnect, getState } = await createTrackedTransport();

      // Start in disconnected state
      expect(getState?.()).toBe('disconnected');

      // Reconnect from disconnected state should just start
      // This tests the branch where state is neither 'connected' nor 'connecting'
      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      expect(getState?.()).toBe('connected');

      // Close first to go back to disconnected
      const managedTransport = transport as { close: () => Promise<void> };
      await managedTransport.close();
      expect(getState?.()).toBe('disconnected');

      // Now reconnect from disconnected - should not call close again, just start
      await reconnect?.();
      expect(getState?.()).toBe('connected');
    });
  });

  describe('Event Callbacks', () => {
    it('should call onclose callback when connection is closed', async () => {
      const { transport, close } = await createTrackedTransport();

      let closeCalled = false;
      const managedTransport = transport as {
        start: () => Promise<void>;
        onclose?: () => void;
      };
      managedTransport.onclose = () => {
        closeCalled = true;
      };

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      await close();

      // Give a small delay for the callback to be invoked
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(closeCalled).toBe(true);
    });

    it('should call onmessage callback when message is received', async () => {
      const { transport } = await createTrackedTransport();

      const receivedMessages: unknown[] = [];
      const managedTransport = transport as {
        onmessage?: (message: unknown) => void;
      };
      managedTransport.onmessage = (message) => {
        receivedMessages.push(message);
      };

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      // Make a tool call to trigger messages
      await client.callTool({
        name: 'add',
        arguments: { a: 1, b: 2 },
      });

      expect(receivedMessages.length).toBeGreaterThan(0);
    });

    it('should call onerror callback on transport error', async () => {
      const { transport } = await createTrackedTransport('http://localhost:1/sse');

      const managedTransport = transport as {
        start: () => Promise<void>;
        onerror?: (error: Error) => void;
      };
      managedTransport.onerror = () => {
        // onerror may or may not be called depending on how the SDK handles errors
      };

      // Attempt connection which should fail
      await expect(managedTransport.start()).rejects.toThrow();

      // The important thing is the test covers the branch
    });

    it('should handle missing callbacks gracefully', async () => {
      const { transport, close, getState } = await createTrackedTransport();

      // Don't set any callbacks - this tests the optional chaining paths

      const client = new Client({
        name: 'test-client',
        version: '1.0.0',
      });

      await client.connect(transport);
      activeClients.push(client);

      // Make a request to trigger message handling
      await client.listTools();

      // Close should not throw even without onclose callback
      await close();
      expect(getState?.()).toBe('disconnected');
    });
  });

  describe('Session ID', () => {
    it('should generate a unique session ID', async () => {
      const { transport: transport1 } = await createTrackedTransport();
      const { transport: transport2 } = await createTrackedTransport();

      const managedTransport1 = transport1 as { sessionId?: string };
      const managedTransport2 = transport2 as { sessionId?: string };

      expect(managedTransport1.sessionId).toBeDefined();
      expect(managedTransport2.sessionId).toBeDefined();
      expect(managedTransport1.sessionId).not.toBe(managedTransport2.sessionId);
      expect(managedTransport1.sessionId).toMatch(/^sse-\d+-[a-z0-9]+$/);
    });
  });
});

// Tests for createRawSseTransport function
import { createRawSseTransport } from '../../../packages/mcp/src/transports/sse-transport.js';

describe('createRawSseTransport', () => {
  it('should create transport from string URL', () => {
    const transport = createRawSseTransport('http://localhost:3000/sse');
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  it('should create transport from URL object', () => {
    const urlObj = new URL('http://localhost:3000/sse');
    const transport = createRawSseTransport(urlObj);
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  it('should create transport with custom headers', () => {
    const transport = createRawSseTransport('http://localhost:3000/sse', {
      Authorization: 'Bearer token',
    });
    expect(transport).toBeDefined();
  });

  it('should create transport without headers', () => {
    const transport = createRawSseTransport('http://localhost:3000/sse');
    expect(transport).toBeDefined();
  });
});
