# SENTINEL MCP Proxy

TypeScript MCP proxy server for SENTINEL, built on the Model Context Protocol SDK and streamable HTTP transport.

## What It Does

- Authenticates MCP sessions with SENTINEL access tokens
- Lists and registers upstream MCP tools for each session
- Evaluates policies via the SENTINEL API before tool execution
- Logs every tool invocation to the audit log
- Injects user credentials for upstream MCP servers

## Quick Start

1. Start the API server (the proxy depends on it):

```bash
pnpm --filter @sentinel/api dev
```

2. Start the MCP proxy:

```bash
pnpm --filter @sentinel/mcp dev
```

By default it listens on `http://localhost:3001/mcp` and `http://localhost:3001/health`.

## Configuration

Environment variables:

- `API_URL` (default: `http://localhost:3000`)
- `MCP_PORT` (default: `3001`)

## Using a Client

Use an MCP client that supports **streamable HTTP**. The client must send a bearer token on the initial `initialize` call.

Example (Node + MCP SDK):

```bash
node --input-type=module <<'JS'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'sentinel-client', version: '0.1.0' }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3001/mcp'),
  { requestInit: { headers: { Authorization: 'Bearer YOUR_ACCESS_TOKEN' } } }
);

await client.connect(transport);
const tools = await client.listTools();
console.log(tools.tools.map(t => t.name));

const health = await client.callTool({ name: 'sentinel_health', arguments: {} });
console.log(health);

await client.close();
JS
```

## Tool Names

- The proxy registers a built-in `sentinel_health` tool.
- Upstream tools are registered **by their original names** (no domain prefix).
- Policy evaluation uses qualified names internally (`domain[:port]::tool`).

## Known Limitations

- Tool name collisions across upstream servers will cause later tools to be skipped.
- Session and tool mappings are stored in memory (development-friendly, not multi-instance safe).
- OAuth callback + token exchange is still a stub.

## Development Commands

```bash
pnpm --filter @sentinel/mcp dev
pnpm --filter @sentinel/mcp build
pnpm --filter @sentinel/mcp start
pnpm --filter @sentinel/mcp test
```
