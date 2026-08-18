#!/usr/bin/env node
/* global process, setTimeout */
/**
 * Test MCP server that crashes intentionally for testing error handling.
 *
 * Usage modes (via CRASH_MODE env var):
 * - "immediate": Exit immediately without handshake
 * - "after_init": Exit after server initialization
 * - "on_tool_call": Exit when a tool is called
 * - default: Behave normally (same as stdio-test-server)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const crashMode = process.env.CRASH_MODE ?? 'normal';

if (crashMode === 'immediate') {
  process.exit(1);
}

const server = new Server(
  { name: 'crash-test-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'echo',
      description: 'Echo back the input',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
      },
    },
    {
      name: 'crash',
      description: 'Crash the server process',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (crashMode === 'on_tool_call') {
    process.exit(1);
  }

  switch (name) {
    case 'echo':
      return {
        content: [{ type: 'text', text: args?.message ?? 'no message' }],
      };

    case 'crash':
      process.exit(1);
      break;

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

if (crashMode === 'after_init') {
  setTimeout(() => process.exit(1), 100);
}
