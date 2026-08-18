# Admin MCP Server

MCP server enabling AI agents to administer SENTINEL through natural language commands.

## Overview

The Admin MCP Server allows AI assistants (Claude, Cursor, etc.) to perform administrative tasks on SENTINEL via the Model Context Protocol. Administrators can manage policies, users, roles, servers, and more through conversational interfaces.

**Key Features:**
- HTTP transport with Bearer token authentication
- Read operations execute immediately
- Write operations require confirmation via admin dashboard
- Self-operation blocking (prevents accidental self-deletion)
- Scope-based tool registration
- Graceful handling for non-admin users

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  AI Assistant   │────▶│  Admin MCP Server    │────▶│  SENTINEL API   │
│  (Claude, etc.) │     │  (port 3003)         │     │  (tRPC)         │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                         │
        │                         ▼
        │               ┌──────────────────────┐
        │               │  Admin Dashboard     │
        └───────────────│  (Confirmations)     │
                        └──────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_MCP_PORT` | Port for the MCP server | `3003` |
| `API_URL` | tRPC backend URL | Required |

### Running the Server

```bash
# Development (with hot reload)
pnpm --filter @sentinel/mcp-admin dev

# Production
pnpm --filter @sentinel/mcp-admin build
pnpm --filter @sentinel/mcp-admin start
```

## Authentication

The server requires a valid SENTINEL access token in the Authorization header:

```
Authorization: Bearer <access_token>
```

The token must belong to a user with admin privileges. Non-admin users receive a minimal server with only a status tool explaining why admin tools are unavailable.

## Available Tools

The Admin MCP Server provides **40 tools** organized by scope. Tools are dynamically registered based on the admin's enabled scopes.

### Always Available

| Tool | Description |
|------|-------------|
| `admin_health` | Get server health status, admin email, organization, and enabled scopes |

### Policies Scope (POLICIES)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_policies` | Read | List all policies with effect, matcher, tool pattern, and status |
| `admin_get_policy` | Read | Get detailed policy information by ID |
| `admin_search_param_values_by_label` | Read | Search parameter values by human-readable label (for policy conditions) |
| `admin_get_param_suggestions` | Read | Get parameter value suggestions for a specific parameter key |
| `admin_create_policy` | Write | Create a new access control policy |
| `admin_update_policy` | Write | Update an existing policy |
| `admin_delete_policy` | Write | Delete a policy (irreversible) |
| `admin_enable_policy` | Write | Enable a disabled policy |
| `admin_disable_policy` | Write | Disable a policy without deleting it |

### Users Scope (USERS)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_users` | Read | List all users with email, roles, and status |
| `admin_get_user` | Read | Get detailed user information by ID |
| `admin_create_user` | Write | Create a new user (sends invitation email) |
| `admin_update_user` | Write | Update user details |
| `admin_delete_user` | Write | Delete a user (irreversible) |

### Roles Scope (ROLES)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_roles` | Read | List all roles with names and descriptions |
| `admin_get_role` | Read | Get detailed role information by ID |
| `admin_create_role` | Write | Create a new role |
| `admin_update_role` | Write | Update a role |
| `admin_delete_role` | Write | Delete a role (irreversible) |

### MCP Servers Scope (MCP_SERVERS)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_mcp_servers` | Read | List all registered MCP servers |
| `admin_get_mcp_server` | Read | Get detailed server information by ID |
| `admin_create_mcp_server` | Write | Register a new MCP server |
| `admin_update_mcp_server` | Write | Update server configuration |
| `admin_delete_mcp_server` | Write | Delete a server (deletes all credentials) |

### Agents Scope (AGENTS)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_agents` | Read | List all registered agents |
| `admin_get_agent` | Read | Get detailed agent information by ID |
| `admin_create_agent` | Write | Register a new agent |
| `admin_delete_agent` | Write | Delete an agent (irreversible) |

### Sensitive Flags Scope (SENSITIVE_FLAGS)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_sensitive_flags` | Read | List all sensitive tool flags |

### Webhooks Scope (WEBHOOKS)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_webhooks` | Read | List all configured webhooks |
| `admin_create_webhook` | Write | Create a new webhook endpoint |
| `admin_update_webhook` | Write | Update webhook configuration |
| `admin_delete_webhook` | Write | Delete a webhook (irreversible) |

### Permission Requests Scope (PERMISSION_REQUESTS)

| Tool | Type | Description |
|------|------|-------------|
| `admin_list_permission_requests` | Read | List permission requests (filter by status) |
| `admin_approve_request` | Write | Approve a pending permission request |
| `admin_deny_request` | Write | Deny a pending permission request |

### Analytics Scope (ANALYTICS)

| Tool | Type | Description |
|------|------|-------------|
| `admin_get_analytics_summary` | Read | Get analytics summary for specified days |

### Audit Scope (AUDIT)

| Tool | Type | Description |
|------|------|-------------|
| `admin_query_audit_log` | Read | Query recent tool call and policy decision logs |
| `admin_query_admin_actions` | Read | Query recent administrative change logs |

## Confirmation Workflow

Write operations follow a confirmation workflow for safety:

```
1. AI calls write tool (e.g., admin_create_policy)
2. Server creates confirmation request
3. Server returns confirmation details to AI
4. Admin confirms/rejects in SENTINEL dashboard
5. Server polls for confirmation status
6. Result returned to AI
```

### Confirmation States

| State | Description |
|-------|-------------|
| `PENDING` | Waiting for admin confirmation |
| `CONFIRMED` | Confirmed, executing operation |
| `EXECUTED` | Operation completed successfully |
| `REJECTED` | Admin rejected the operation |
| `EXPIRED` | Confirmation timed out |
| `FAILED` | Execution failed after confirmation |

### Risk Levels

Operations are classified by risk level:

| Level | Description | Examples |
|-------|-------------|----------|
| `LOW` | Minimal impact, easily reversible | Update description |
| `MEDIUM` | Moderate impact | Create/enable/disable entities |
| `HIGH` | Significant impact, irreversible | Delete operations |

## Self-Operation Protection

The server blocks operations that would affect the admin's own account:

- `admin_delete_user` on self
- `admin_update_user` on self
- `admin_revoke_token` on self

These operations must be performed via the web dashboard.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/health` | GET | Health check endpoint |

### Health Check Response

```json
{
  "status": "healthy",
  "server": "sentinel-admin-mcp",
  "version": "0.1.0",
  "activeSessions": 1
}
```

## Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sentinel-admin": {
      "url": "http://localhost:3003/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

### Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "sentinel-admin": {
      "command": "curl",
      "args": ["-X", "POST", "-H", "Content-Type: application/json", "-H", "Authorization: Bearer YOUR_ACCESS_TOKEN", "http://localhost:3003/mcp"]
    }
  }
}
```

Alternatively, use the HTTP transport directly if supported.

## Example Usage

### List All Policies

```
User: What policies are currently configured?
AI: [calls admin_list_policies]

Result:
{
  "policies": [
    {
      "id": "pol_123",
      "slug": "deny-admin-tools",
      "effect": "DENY",
      "matcher": "ALL",
      "toolPattern": "admin_*",
      "enabled": true
    }
  ]
}
```

### Create a Policy

```
User: Create a policy to allow the engineering role to use database tools
AI: [calls admin_create_policy with:
     slug: "allow-engineering-db",
     effect: "ALLOW",
     matcher: "ROLE",
     matcherValue: "engineering",
     toolPattern: "db_*"]

Result:
{
  "requiresConfirmation": true,
  "confirmationId": "conf_456",
  "description": "Create ALLOW policy for ROLE:engineering on db_*",
  "riskLevel": "MEDIUM",
  "expiresAt": "2026-01-20T12:00:00Z"
}

[Admin confirms in dashboard]

{
  "success": true,
  "message": "Operation confirmed and executed",
  "result": {
    "id": "pol_789",
    "slug": "allow-engineering-db"
  }
}
```

### Search for Parameter Values

```
User: Find the page ID for "Applications Tracker 2026" on Notion
AI: [calls admin_search_param_values_by_label with:
     labelQuery: "Applications Tracker 2026",
     serverDomain: "notion"]

Result:
{
  "values": [
    {
      "value": "abc-123-def",
      "label": "Applications Tracker 2026",
      "parameterKey": "page_id",
      "usageCount": 47
    }
  ]
}
```

## Error Handling

### Error Response Format

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "extra": { "additional": "context" }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `TOOL_NOT_FOUND` | Unknown tool name |
| `VALIDATION_ERROR` | Invalid tool arguments |
| `SELF_OPERATION_BLOCKED` | Attempted operation on own account |
| `CONFIRMATION_FAILED` | Failed to create confirmation |
| `CONFIRMATION_REJECTED` | Admin rejected the operation |
| `CONFIRMATION_EXPIRED` | Confirmation timed out |
| `CONFIRMATION_TIMEOUT` | Polling timed out |
| `EXECUTION_ERROR` | Operation failed during execution |

## Security Considerations

1. **Authentication**: All requests require valid Bearer tokens
2. **Authorization**: Only admin users receive admin tools
3. **Confirmation**: Write operations require explicit admin confirmation
4. **Self-Protection**: Cannot modify own account via MCP
5. **Audit Logging**: All operations are logged for compliance
6. **Scope Control**: Tools are registered based on enabled scopes

## Development

### Project Structure

```
packages/mcp-admin/
├── src/
│   ├── server.ts       # HTTP server and MCP setup
│   ├── tools.ts        # Tool definitions and schemas
│   ├── api-client.ts   # tRPC client for SENTINEL API
│   ├── types.ts        # TypeScript interfaces
│   ├── logger.ts       # Structured logging
│   ├── trpc-client.ts  # tRPC client setup
│   └── index.ts        # Package exports
├── package.json
├── tsconfig.json
└── README.md
```

### Adding New Tools

1. Add schema in `tools.ts`:
```typescript
export const myNewToolSchema = z.object({
  param: z.string().describe('Parameter description'),
});
```

2. Add to tool definitions:
```typescript
{
  name: 'admin_my_new_tool',
  description: 'Tool description',
  inputSchema: myNewToolSchema,
  scope: 'MY_SCOPE',
  isWriteTool: false, // or true
}
```

3. Add handler in `server.ts` (read or write handler)

4. Add API client function in `api-client.ts` if needed
