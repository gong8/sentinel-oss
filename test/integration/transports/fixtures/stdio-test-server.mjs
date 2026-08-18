#!/usr/bin/env node
/* global process */
/**
 * Test MCP server for STDIO transport integration tests.
 *
 * This server implements basic MCP protocol over stdin/stdout for testing
 * the STDIO transport implementation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'test-stdio-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'echo',
      description: 'Echo back the input message',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to echo' },
        },
        required: ['message'],
      },
    },
    {
      name: 'get_env',
      description: 'Get an environment variable value',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Environment variable name' },
        },
        required: ['name'],
      },
    },
    {
      name: 'fail',
      description: 'Always throws an error for testing error handling',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'echo':
      return {
        content: [{ type: 'text', text: args?.message ?? 'no message' }],
      };

    case 'get_env': {
      const envName = args?.name;
      const value = process.env[envName] ?? '<undefined>';
      return {
        content: [{ type: 'text', text: value }],
      };
    }

    case 'fail':
      throw new Error('Intentional test failure');

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
