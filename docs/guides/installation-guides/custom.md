# Custom Client Integration Guide

> **Target audience**: Developers building custom AI integrations

This guide covers integrating any MCP-compatible client with Sentinel.

---

## Overview

Sentinel implements the Model Context Protocol (MCP) specification. Any MCP-compatible client can connect to Sentinel's MCP proxy endpoint.

**Endpoint**: `http://your-sentinel-server:3001/mcp`

---

## Prerequisites

- Sentinel running and accessible
- API key (from Dashboard > Credentials)
- MCP client library for your language

---

## Connection Parameters

| Parameter | Value |
|-----------|-------|
| Protocol | HTTP or HTTPS |
| Port | 3001 (default MCP_PORT) |
| Path | `/mcp` |
| Auth Header | `Authorization: Bearer <api-key>` |

---

## MCP Client Libraries

### TypeScript/JavaScript

Using `@modelcontextprotocol/sdk`:

```typescript
import { Client } from '@modelcontextprotocol/sdk';

const client = new Client({
  url: 'http://localhost:3001/mcp',
  headers: {
    'Authorization': `Bearer ${process.env.SENTINEL_API_KEY}`
  }
});

// Connect
await client.connect();

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool('read_file', {
  path: '/tmp/example.txt'
});
```

### Python

Using `mcp` package:

```python
from mcp import Client
import os

client = Client(
    url='http://localhost:3001/mcp',
    headers={
        'Authorization': f'Bearer {os.environ["SENTINEL_API_KEY"]}'
    }
)

# Connect
await client.connect()

# List tools
tools = await client.list_tools()

# Call a tool
result = await client.call_tool('read_file', {'path': '/tmp/example.txt'})
```

### Go

```go
import "github.com/modelcontextprotocol/sdk-go"

client := mcp.NewClient(mcp.ClientConfig{
    URL: "http://localhost:3001/mcp",
    Headers: map[string]string{
        "Authorization": "Bearer " + os.Getenv("SENTINEL_API_KEY"),
    },
})

// Connect
err := client.Connect()

// List tools
tools, err := client.ListTools()

// Call a tool
result, err := client.CallTool("read_file", map[string]interface{}{
    "path": "/tmp/example.txt",
})
```

---

## HTTP API (Direct)

If you're not using an MCP SDK, you can make direct HTTP requests.

### Initialize Session

```bash
curl -X POST http://localhost:3001/mcp/initialize \
  -H "Authorization: Bearer $SENTINEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }'
```

### List Tools

```bash
curl -X POST http://localhost:3001/mcp/tools/list \
  -H "Authorization: Bearer $SENTINEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Call Tool

```bash
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Authorization: Bearer $SENTINEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "read_file",
    "arguments": {
      "path": "/tmp/example.txt"
    }
  }'
```

---

## Handling Approvals

When a tool requires approval (DEFER policy), the response will indicate pending status.

### Polling for Approval

```typescript
const result = await client.callTool('write_file', {
  path: '/etc/config.json',
  content: '...'
});

if (result.status === 'pending_approval') {
  const requestId = result.requestId;

  // Poll for approval status
  while (true) {
    const status = await client.checkApproval(requestId);
    if (status.approved) {
      // Tool executed, get result
      const finalResult = status.result;
      break;
    } else if (status.denied) {
      throw new Error('Tool call denied');
    }
    await sleep(1000); // Poll every second
  }
}
```

### Webhook Notification

Configure webhooks in Sentinel to receive approval notifications:

```javascript
// Your webhook endpoint
app.post('/sentinel-webhook', (req, res) => {
  const { event, data } = req.body;

  if (event === 'APPROVAL_GRANTED') {
    // Resume the pending operation
  } else if (event === 'APPROVAL_DENIED') {
    // Handle denial
  }

  res.status(200).send('OK');
});
```

---

## Error Handling

### Common Error Responses

| Status | Meaning |
|--------|---------|
| 401 | Invalid or missing API key |
| 403 | Access denied by policy |
| 404 | Tool not found |
| 429 | Rate limited |
| 500 | Server error |

### Error Response Format

```json
{
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Tool 'write_file' is denied by policy 'Block All Writes'",
    "policy": "Block All Writes"
  }
}
```

---

## Best Practices

### Authentication

- Use environment variables for API keys
- Rotate keys periodically
- Use separate keys for different environments

### Connection Management

- Reuse connections when possible
- Implement reconnection logic
- Handle connection timeouts gracefully

### Error Handling

- Check policy errors vs server errors
- Implement retry with backoff for transient errors
- Log tool calls for debugging

### Performance

- Cache tool listings
- Batch operations when possible
- Monitor response times

---

## Testing

### Health Check

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","sessions":0}
```

### Connection Test

```bash
curl -X POST http://localhost:3001/mcp/initialize \
  -H "Authorization: Bearer $SENTINEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}'
```

### Tool List

```bash
curl -X POST http://localhost:3001/mcp/tools/list \
  -H "Authorization: Bearer $SENTINEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Troubleshooting

### Connection refused

1. Check Sentinel is running
2. Verify port 3001 is accessible
3. Check firewall rules

### 401 Unauthorized

1. Verify API key is correct
2. Check header format: `Authorization: Bearer <key>`
3. Regenerate key if needed

### Tool call denied

1. Check your policies in Sentinel Dashboard
2. Verify your role has access
3. Look at Activity log for details

### Timeout

1. Tool may require approval
2. Check Sentinel server load
3. Increase client timeout

---

## Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP SDK (TypeScript)](https://github.com/modelcontextprotocol/sdk)
- [Sentinel API Reference](../../spec/api-reference.md)
