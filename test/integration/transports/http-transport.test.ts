/**
 * HTTP Transport Integration Tests
 *
 * Tests the full MCP HTTP transport lifecycle:
 * - Server creation with StreamableHTTPServerTransport
 * - Client connection with StreamableHTTPClientTransport
 * - MCP handshake (initialize)
 * - Tool listing and execution
 * - Error handling
 * - Cleanup/disconnection
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

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

describe('HTTP Transport Integration', () => {
  let httpServer: Server;
  let mcpServer: McpServer;
  let serverPort: number;
  let serverUrl: string;
  const sessionTransports = new Map<string, StreamableHTTPServerTransport>();

  beforeAll(async () => {
    mcpServer = new McpServer({
      name: 'test-mcp-server',
      version: '1.0.0',
    });

    mcpServer.tool('echo', 'Echoes the input message back', { message: z.string() }, (args) => {
      return {
        content: [{ type: 'text', text: `Echo: ${args.message}` }],
      };
    });

    mcpServer.tool('add', 'Adds two numbers', { a: z.number(), b: z.number() }, (args) => {
      return {
        content: [{ type: 'text', text: String(args.a + args.b) }],
      };
    });

    mcpServer.tool('error_tool', 'A tool that always throws an error', {}, () => {
      throw new Error('Intentional test error');
    });

    mcpServer.tool(
      'slow_tool',
      'A tool that takes time to execute',
      { delayMs: z.number() },
      async (args) => {
        await new Promise((resolve) => setTimeout(resolve, args.delayMs));
        return {
          content: [{ type: 'text', text: 'Completed after delay' }],
        };
      },
    );

    httpServer = createServer();

    httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost:${serverPort}`);

      if (url.pathname !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (req.method === 'POST') {
        if (sessionId && sessionTransports.has(sessionId)) {
          const transport = sessionTransports.get(sessionId);
          if (transport) {
            await transport.handleRequest(req, res);
            return;
          }
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          onsessioninitialized: (newSessionId) => {
            sessionTransports.set(newSessionId, transport);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessionTransports.delete(transport.sessionId);
          }
        };

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === 'GET') {
        if (sessionId && sessionTransports.has(sessionId)) {
          const transport = sessionTransports.get(sessionId);
          if (transport) {
            await transport.handleRequest(req, res);
            return;
          }
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found or not provided for GET request' }));
        return;
      }

      if (req.method === 'DELETE') {
        if (sessionId && sessionTransports.has(sessionId)) {
          const transport = sessionTransports.get(sessionId);
          if (transport) {
            await transport.handleRequest(req, res);
            sessionTransports.delete(sessionId);
            return;
          }
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found for DELETE request' }));
        return;
      }

      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const address = httpServer.address() as AddressInfo;
        serverPort = address.port;
        serverUrl = `http://127.0.0.1:${serverPort}/mcp`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Close all active session transports first
    for (const transport of sessionTransports.values()) {
      try {
        await transport.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    sessionTransports.clear();

    // Close the HTTP server
    await new Promise<void>((resolve) => {
      httpServer.closeAllConnections();
      httpServer.close(() => resolve());
    });
  });

  describe('Connection and Handshake', () => {
    let client: Client;
    let transport: StreamableHTTPClientTransport;

    afterEach(async () => {
      if (client) {
        await client.close();
      }
    });

    it('should connect and perform MCP handshake', async () => {
      transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

      await client.connect(transport);

      expect(client.getServerVersion()).toBeDefined();
      expect(client.getServerVersion()?.name).toBe('test-mcp-server');
      expect(client.getServerVersion()?.version).toBe('1.0.0');
    });

    it('should handle connection to invalid URL gracefully', async () => {
      const invalidTransport = new StreamableHTTPClientTransport(
        new URL('http://127.0.0.1:1/invalid'),
      );
      const invalidClient = new Client(
        { name: 'test-client', version: '1.0.0' },
        { capabilities: {} },
      );

      await expect(invalidClient.connect(invalidTransport)).rejects.toThrow();
    });

    it('should handle connection to non-MCP endpoint gracefully', async () => {
      const wrongPathTransport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${serverPort}/wrong-path`),
      );
      const wrongPathClient = new Client(
        { name: 'test-client', version: '1.0.0' },
        { capabilities: {} },
      );

      await expect(wrongPathClient.connect(wrongPathTransport)).rejects.toThrow();
    });
  });

  describe('Tool Listing', () => {
    let client: Client;

    beforeAll(async () => {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);
    });

    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });

    it('should list tools from server', async () => {
      const result = await client.listTools();

      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBeGreaterThanOrEqual(4);

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('add');
      expect(toolNames).toContain('error_tool');
      expect(toolNames).toContain('slow_tool');
    });

    it('should have correct tool schemas', async () => {
      const result = await client.listTools();

      const echoTool = result.tools.find((t) => t.name === 'echo');
      expect(echoTool).toBeDefined();
      expect(echoTool?.description).toBe('Echoes the input message back');
      expect(echoTool?.inputSchema).toBeDefined();
      expect(echoTool?.inputSchema.properties).toHaveProperty('message');

      const addTool = result.tools.find((t) => t.name === 'add');
      expect(addTool).toBeDefined();
      expect(addTool?.description).toBe('Adds two numbers');
      expect(addTool?.inputSchema.properties).toHaveProperty('a');
      expect(addTool?.inputSchema.properties).toHaveProperty('b');
    });
  });

  describe('Tool Execution', () => {
    let client: Client;

    beforeAll(async () => {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);
    });

    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });

    it('should execute echo tool correctly', async () => {
      const result = await client.callTool({
        name: 'echo',
        arguments: { message: 'Hello, World!' },
      });
      const content = getContent(result);

      expect(content).toBeDefined();
      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({ type: 'text', text: 'Echo: Hello, World!' });
    });

    it('should execute add tool correctly', async () => {
      const result = await client.callTool({ name: 'add', arguments: { a: 5, b: 3 } });
      const content = getContent(result);

      expect(content).toBeDefined();
      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({ type: 'text', text: '8' });
    });

    it('should execute add tool with negative numbers', async () => {
      const result = await client.callTool({ name: 'add', arguments: { a: -10, b: 7 } });
      const content = getContent(result);

      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({ type: 'text', text: '-3' });
    });

    it('should execute add tool with floating point numbers', async () => {
      const result = await client.callTool({ name: 'add', arguments: { a: 1.5, b: 2.5 } });
      const content = getContent(result);

      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({ type: 'text', text: '4' });
    });

    it('should execute slow tool and wait for completion', async () => {
      const startTime = Date.now();
      const result = await client.callTool({ name: 'slow_tool', arguments: { delayMs: 100 } });
      const content = getContent(result);
      const elapsed = Date.now() - startTime;

      expect(content).toHaveLength(1);
      expect(content[0]).toEqual({ type: 'text', text: 'Completed after delay' });
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should handle tool that does not exist', async () => {
      const result = await client.callTool({ name: 'nonexistent_tool', arguments: {} });
      const content = getContent(result);

      expect(result.isError).toBe(true);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      const textContent = content[0];
      expect(textContent.text).toContain('nonexistent_tool');
    });
  });

  describe('Error Handling', () => {
    let client: Client;

    beforeAll(async () => {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);
    });

    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });

    it('should handle server errors gracefully', async () => {
      const result = await client.callTool({ name: 'error_tool', arguments: {} });
      const content = getContent(result);

      expect(result.isError).toBe(true);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
    });

    it('should handle invalid tool arguments', async () => {
      const result = await client.callTool({ name: 'add', arguments: { a: 'not a number', b: 5 } });
      const content = getContent(result);

      expect(result.isError).toBe(true);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
    });

    it('should handle missing required arguments', async () => {
      const result = await client.callTool({ name: 'echo', arguments: {} });
      const content = getContent(result);

      expect(result.isError).toBe(true);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Clients', () => {
    it('should handle multiple sequential clients', async () => {
      const clientCount = 3;
      const results: Array<{ content: Array<{ type: string; text: string }> }> = [];

      for (let i = 0; i < clientCount; i++) {
        const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
        const client = new Client(
          { name: `test-client-${i}`, version: '1.0.0' },
          { capabilities: {} },
        );
        await client.connect(transport);

        const result = await client.callTool({
          name: 'echo',
          arguments: { message: `Client ${i}` },
        });
        results.push(result as { content: Array<{ type: string; text: string }> });

        await client.close();
      }

      results.forEach((result, i) => {
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toEqual({ type: 'text', text: `Echo: Client ${i}` });
      });
    });

    it('should handle rapid sequential requests from same client', async () => {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);

      const requestCount = 10;
      const results = [];

      for (let i = 0; i < requestCount; i++) {
        const result = await client.callTool({ name: 'add', arguments: { a: i, b: 1 } });
        results.push(result);
      }

      results.forEach((result, i) => {
        const content = getContent(result);
        expect(content[0]).toEqual({ type: 'text', text: String(i + 1) });
      });

      await client.close();
    });

    it('should handle concurrent requests from same client', async () => {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);

      const requestCount = 5;
      const promises = [];

      for (let i = 0; i < requestCount; i++) {
        promises.push(client.callTool({ name: 'add', arguments: { a: i, b: 100 } }));
      }

      const results = await Promise.all(promises);

      results.forEach((result, i) => {
        const content = getContent(result);
        expect(content[0]).toEqual({ type: 'text', text: String(i + 100) });
      });

      await client.close();
    });
  });

  describe('Cleanup and Disconnection', () => {
    it('should disconnect cleanly', async () => {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

      await client.connect(transport);
      const toolsBeforeClose = await client.listTools();
      expect(toolsBeforeClose.tools.length).toBeGreaterThan(0);

      await client.close();
    });

    it('should reject requests after close', async () => {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

      await client.connect(transport);
      await client.close();

      await expect(client.listTools()).rejects.toThrow();
    });

    it('should allow reconnection after close', async () => {
      const transport1 = new StreamableHTTPClientTransport(new URL(serverUrl));
      const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

      await client.connect(transport1);
      await client.close();

      const transport2 = new StreamableHTTPClientTransport(new URL(serverUrl));
      await client.connect(transport2);

      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);

      await client.close();
    });
  });
});
