# Integration Guide

> **Target audience**: Developers integrating Sentinel with existing infrastructure

This guide covers integrating Sentinel with MCP servers, authentication systems, and notification channels.

---

## MCP Server Integration

Sentinel acts as a proxy between AI clients and your MCP tool servers.

### Registering MCP Servers

1. Go to **Admin** > **MCP Servers**
2. Click **Add Server**
3. Configure the server:

| Field | Description | Example |
|-------|-------------|---------|
| Name | Unique identifier | `filesystem` |
| Command | Executable path | `npx` or `/usr/local/bin/mcp-server` |
| Args | Command arguments | `-y @anthropic/mcp-server-filesystem /tmp` |
| Env | Environment variables | `API_KEY=xxx` |

### Supported Server Types

**npx-based servers** (most common):
```
Command: npx
Args: -y @anthropic/mcp-server-filesystem /home/user
```

**Local executables**:
```
Command: /opt/mcp-servers/my-server
Args: --config /etc/my-server.json
```

**Docker containers**:
```
Command: docker
Args: run --rm -i my-mcp-server:latest
```

### Server Lifecycle

- Servers start on-demand when first requested
- Connections are pooled per user session
- Servers restart automatically on failure
- Health checks run periodically

---

## Authentication Integration

### API Key Authentication

Users authenticate to Sentinel via API keys in the Authorization header:

```
Authorization: Bearer <api-key>
```

API keys are generated per-user in the dashboard under **Credentials**.

### SSO/OIDC Integration

Sentinel supports OIDC for user authentication:

1. Configure OIDC provider in **Admin** > **Settings** > **Authentication**
2. Set:
   - Client ID
   - Client Secret
   - Issuer URL
   - Callback URL: `https://sentinel.example.com/api/auth/callback/oidc`

Supported providers:
- Okta
- Auth0
- Azure AD
- Google Workspace
- Any OIDC-compliant provider

### Role Mapping

Map external identity claims to Sentinel roles:

```json
{
  "roleMapping": {
    "admin": ["sentinel-admins", "platform-admins"],
    "developer": ["engineering", "contractors"],
    "viewer": ["*"]
  }
}
```

---

## Webhook Integration

Send notifications when events occur in Sentinel.

### Supported Events

| Event | Description |
|-------|-------------|
| `TOOL_CALL` | Any tool invocation |
| `POLICY_DENY` | Request denied by policy |
| `APPROVAL_REQUIRED` | DEFER policy triggered |
| `APPROVAL_GRANTED` | Approval given |
| `APPROVAL_DENIED` | Approval rejected |
| `SESSION_STARTED` | New MCP session |
| `SESSION_TERMINATED` | MCP session ended |

### Webhook Configuration

1. Go to **Admin** > **Webhooks**
2. Click **Create Webhook**
3. Configure:

| Field | Description |
|-------|-------------|
| URL | Destination endpoint |
| Events | Which events to send |
| Secret | HMAC signing key (optional) |
| Headers | Custom headers |

### Webhook Payload

```json
{
  "event": "APPROVAL_REQUIRED",
  "timestamp": "2026-01-24T10:30:00Z",
  "data": {
    "requestId": "req_abc123",
    "tool": "filesystem::write_file",
    "user": "alice@company.com",
    "parameters": {
      "path": "/etc/config.json",
      "content": "..."
    }
  }
}
```

### Slack Integration

```
URL: https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
Events: APPROVAL_REQUIRED, POLICY_DENY
```

### Discord Integration

```
URL: https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK
Events: APPROVAL_REQUIRED, POLICY_DENY
```

---

## A2A Protocol Integration

Sentinel supports the Agent-to-Agent (A2A) protocol for multi-agent workflows.

### Enabling A2A

A2A is enabled by default on port 3002. Ensure this port is accessible:

```bash
# Verify A2A server is running
curl http://localhost:3002/health
```

### A2A Agent Registration

Register agents that will communicate via A2A:

1. Go to **Admin** > **A2A Agents**
2. Click **Register Agent**
3. Configure:
   - Agent name
   - Attestation method (JWKS URL or public key)
   - Allowed capabilities

### A2A Policies

Create policies using A2A matchers:

```yaml
- name: Allow GitHub Agent
  rule: ALLOW
  matcher: a2a-agent:github-assistant
  priority: 10

- name: Require Approval for Code Review
  rule: DEFER
  matcher: a2a-skill:code-review
  priority: 20
```

---

## API Integration

Sentinel exposes a tRPC API for programmatic access.

### Base URL

```
http://localhost:3000/trpc
```

### Authentication

Include the API key in headers:

```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/trpc/health
```

### Common Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/trpc/health` | GET | Health check |
| `/trpc/user.me` | GET | Current user info |
| `/trpc/admin.policies.list` | GET | List policies (admin) |
| `/trpc/admin.auditLog.list` | GET | Audit log entries (admin) |

### TypeScript Client

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@sentinel/api';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    }),
  ],
});

// List policies
const policies = await client.admin.policies.list.query();
```

---

## Logging Integration

### Structured Logs

Sentinel outputs JSON logs in production:

```json
{
  "level": "info",
  "time": "2026-01-24T10:30:00Z",
  "msg": "Tool call processed",
  "tool": "filesystem::read_file",
  "user": "alice@company.com",
  "result": "allowed",
  "duration": 45
}
```

### Log Forwarding

Forward logs to your observability stack:

**Docker logging driver**:
```yaml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

**To external service** (Datadog, Splunk, etc.):
```yaml
services:
  api:
    logging:
      driver: "syslog"
      options:
        syslog-address: "udp://logs.example.com:514"
```

---

## Database Integration

### Connection String

```
DATABASE_URL=postgresql://user:pass@host:5432/sentinel
```

### Backup/Restore

```bash
# Backup
docker compose exec postgres pg_dump -U sentinel sentinel > backup.sql

# Restore
docker compose exec -T postgres psql -U sentinel sentinel < backup.sql
```

### Read Replicas

For high availability, configure read replicas:

```
DATABASE_URL=postgresql://user:pass@primary:5432/sentinel
DATABASE_READ_URL=postgresql://user:pass@replica:5432/sentinel
```

---

## Health Monitoring

### Health Endpoints

| Service | Endpoint | Response |
|---------|----------|----------|
| API | `/health` | `{"status":"ok"}` |
| MCP Proxy | `:3001/health` | `{"status":"ok","sessions":0}` |
| A2A | `:3002/health` | `{"status":"ok"}` |

### Prometheus Metrics (Coming Soon)

```
sentinel_tool_calls_total{tool="filesystem::read_file",result="allowed"} 1234
sentinel_policy_evaluations_total{policy="default",result="deny"} 56
sentinel_active_sessions{type="mcp"} 12
```

---

## Security Considerations

### Network Security

- Keep PostgreSQL port (5432) internal only
- Expose only necessary ports (80/443, 3001, 3002)
- Use TLS for all external connections
- Configure firewall rules per deployment environment

### Credential Security

- All credentials encrypted at rest with AES-256
- Encryption key (`ENCRYPTION_KEY`) must be kept secret
- Rotate credentials regularly
- Use secret managers in production (AWS Secrets Manager, Vault, etc.)

### Audit Trail

All actions are logged to the audit table:
- Tool invocations
- Policy evaluations
- Admin actions
- Authentication events

Export audit logs for compliance:
```bash
# Export last 30 days
docker compose exec api npx tsx scripts/export-audit.ts --days 30
```
