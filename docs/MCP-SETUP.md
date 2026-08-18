# MCP Setup Guide

This guide covers all MCP (Model Context Protocol) configuration options for both connecting to Sentinel as a client and registering external MCP servers through the Sentinel admin interface.

## Table of Contents

- [Client Configuration](#client-configuration)
- [Transport Types](#transport-types)
- [MCP Server Registration (Admin)](#mcp-server-registration-admin)
- [Authentication Options](#authentication-options)
- [Session Management](#session-management)
- [Credential Injection](#credential-injection)
- [Tool Discovery](#tool-discovery)
- [Client-Specific Setup](#client-specific-setup)

---

## Client Configuration

To connect your AI client (Claude Code, Cursor, etc.) to Sentinel, add the following to your MCP configuration:

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

Replace `YOUR_ACCESS_TOKEN` with the token generated from the Sentinel web interface.

---

## Transport Types

Sentinel supports three transport protocols for MCP connections:

### 1. HTTP (Default) - StreamableHTTPServerTransport

The recommended transport for most use cases. Uses HTTP POST with streaming responses.

```json
{
  "url": "http://localhost:3001/mcp",
  "transport": "streamable-http"
}
```

**Characteristics:**
- Request-response model with streaming
- Works through proxies and firewalls
- Stateless (session managed via headers)

### 2. SSE - Server-Sent Events

For clients that prefer server-push updates.

```json
{
  "url": "http://localhost:3001/mcp/sse",
  "transport": "sse"
}
```

**Characteristics:**
- Unidirectional server-to-client streaming
- Good for long-running operations
- Automatic reconnection support

### 3. WebSocket

For real-time bidirectional communication with automatic reconnection.

```json
{
  "url": "ws://localhost:3001/mcp/ws",
  "transport": "websocket"
}
```

**Characteristics:**
- Full-duplex communication
- Lower latency for frequent messages
- Persistent connection with heartbeat

---

## MCP Server Registration (Admin)

Administrators can register external MCP servers through the Sentinel admin interface. Sentinel acts as a proxy, applying policies before forwarding requests.

### HTTP Server

For remote MCP servers accessible via HTTP/HTTPS:

```json
{
  "name": "GitHub MCP",
  "url": "https://mcp.github.com",
  "transportType": "HTTP",
  "authType": "OAUTH"
}
```

### STDIO Server (Local)

For local MCP servers that communicate via standard input/output:

```json
{
  "name": "Local MCP Server",
  "transportType": "STDIO",
  "stdioCommand": "npx",
  "stdioArgs": ["-y", "@modelcontextprotocol/server-github"],
  "stdioWorkingDir": "/path/to/working/dir",
  "stdioEnv": {
    "GITHUB_TOKEN": "encrypted-token"
  }
}
```

**STDIO Configuration Options:**

| Option | Description | Required |
|--------|-------------|----------|
| `stdioCommand` | The command to execute | Yes |
| `stdioArgs` | Array of command arguments | No |
| `stdioWorkingDir` | Working directory for the process | No |
| `stdioEnv` | Environment variables (encrypted at rest) | No |

### WebSocket Server

For MCP servers using WebSocket transport:

```json
{
  "name": "WebSocket MCP",
  "url": "wss://mcp.example.com/ws",
  "transportType": "WEBSOCKET",
  "wsReconnectMs": 5000,
  "wsMaxRetries": 3,
  "wsHeartbeatMs": 30000
}
```

**WebSocket Configuration Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `wsReconnectMs` | Delay between reconnection attempts (ms) | 5000 |
| `wsMaxRetries` | Maximum reconnection attempts | 3 |
| `wsHeartbeatMs` | Heartbeat interval (ms) | 30000 |

---

## Authentication Options

Sentinel supports multiple authentication methods for connecting to external MCP servers:

### 1. None

No authentication required.

```json
{
  "authType": "NONE"
}
```

### 2. API Key

Static API key authentication.

```json
{
  "authType": "API_KEY",
  "apiKey": "your-api-key"
}
```

The API key is encrypted at rest and injected into the Authorization header when making requests.

### 3. OAuth 2.1 with PKCE

Full OAuth 2.1 flow with PKCE support for secure authorization.

```json
{
  "authType": "OAUTH",
  "authConfig": {
    "authorizationEndpoint": "https://auth.example.com/authorize",
    "tokenEndpoint": "https://auth.example.com/token",
    "scopes": ["read", "write"]
  }
}
```

**OAuth Configuration Options:**

| Option | Description | Required |
|--------|-------------|----------|
| `authorizationEndpoint` | URL for user authorization | Yes |
| `tokenEndpoint` | URL for token exchange | Yes |
| `scopes` | Array of OAuth scopes to request | No |
| `clientId` | OAuth client ID (if not using dynamic registration) | No |
| `clientSecret` | OAuth client secret (encrypted) | No |

---

## Session Management

Sentinel's MCP proxy uses session pooling for efficient connection management:

### Session Keying

Sessions are uniquely identified by:
- MCP server ID
- User ID
- Credential hash

This ensures each user has isolated sessions per server while enabling connection reuse.

### Session Lifecycle

| Parameter | Value |
|-----------|-------|
| Session timeout | 30 minutes |
| Automatic cleanup | On timeout |
| OAuth token refresh | On 401/403 response |

### Connection Pooling Benefits

- Reduced connection overhead
- Automatic reconnection on failure
- Credential refresh without user intervention

---

## Credential Injection

Credentials are automatically injected into tool calls based on the authentication type:

| Auth Type | Injection Method |
|-----------|------------------|
| API Key | `Authorization: Bearer {apiKey}` header |
| OAuth | `Authorization: Bearer {accessToken}` header |
| Custom | Merged into tool parameters |

Credential injection happens at the proxy layer, ensuring:
- Credentials never reach the AI client
- Audit logging of all credential usage
- Policy enforcement before credential release

---

## Tool Discovery

Sentinel automatically discovers tools from registered MCP servers:

### Discovery Process

1. On first connection to an MCP server
2. Tools fetched via `tools/list` MCP method
3. Tool metadata stored in `McpTool` table
4. Input schemas parsed for policy condition autocomplete

### Tool Metadata Stored

- Tool name and description
- Input schema (JSON Schema)
- Server association
- Last discovery timestamp

### Refreshing Tools

Tools are re-discovered:
- When server connection is re-established
- Manually via admin interface
- On schema version mismatch

---

## Client-Specific Setup

For detailed setup instructions for specific AI clients, see:

| Client | Guide |
|--------|-------|
| Claude Code | [claude-code.md](guides/installation-guides/claude-code.md) |
| Cursor | [cursor.md](guides/installation-guides/cursor.md) |
| Windsurf | [windsurf.md](guides/installation-guides/windsurf.md) |
| Cline | [cline.md](guides/installation-guides/cline.md) |
| Custom Integrations | [custom.md](guides/installation-guides/custom.md) |

---

## Quick Reference

### Minimal Client Setup

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

### Full Server Registration Example

```json
{
  "name": "Production GitHub MCP",
  "url": "https://mcp.github.com",
  "transportType": "HTTP",
  "authType": "OAUTH",
  "authConfig": {
    "authorizationEndpoint": "https://github.com/login/oauth/authorize",
    "tokenEndpoint": "https://github.com/login/oauth/access_token",
    "scopes": ["repo", "read:user"]
  }
}
```

### Transport Comparison

| Transport | Use Case | Latency | Firewall-Friendly |
|-----------|----------|---------|-------------------|
| HTTP (Streamable) | General use | Medium | Yes |
| SSE | Long operations | Medium | Yes |
| WebSocket | Real-time | Low | Sometimes |
