# Testing the MCP Proxy

This proxy uses streamable HTTP transport. Use a client that supports it (the MCP SDK does).

## 1. Start Services

```bash
pnpm --filter @sentinel/api dev
pnpm --filter @sentinel/mcp dev
```

Confirm the proxy is running:

```bash
curl http://localhost:3001/health
```

## 2. Get an Access Token

Use a seeded user token or create a user in the admin UI. You can also query the DB directly:

```bash
psql "$DATABASE_URL" -c 'select email, "accessToken" from "User" limit 5;'
```

## 3. Call the MCP Proxy

```bash
node --input-type=module <<'JS'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'sentinel-test', version: '0.1.0' }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3001/mcp'),
  { requestInit: { headers: { Authorization: 'Bearer YOUR_ACCESS_TOKEN' } } }
);

await client.connect(transport);
const tools = await client.listTools();
console.log('tools:', tools.tools.map(t => t.name));

const health = await client.callTool({ name: 'sentinel_health', arguments: {} });
console.log('health:', health);

await client.close();
JS
```

## Troubleshooting

- Ensure `API_URL` points to the API server the proxy should call.
- Ensure your access token belongs to an existing user.
- If tools are missing, confirm MCP servers/tools exist in the DB and the user has credentials where required.
