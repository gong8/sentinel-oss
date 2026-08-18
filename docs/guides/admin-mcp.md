# Admin MCP Server Guide

> **Target audience**: AI agents and developers integrating with Sentinel via MCP

The Admin MCP Server enables AI agents to perform administrative operations on Sentinel through natural language commands.

---

## Overview

| Property | Value |
|----------|-------|
| Package | `@sentinel/mcp-admin` |
| Port | 3003 (default, configurable via `ADMIN_MCP_PORT`) |
| Protocol | MCP over HTTP (Streamable HTTP transport) |
| Authentication | Bearer token (admin access token) |
| Total Tools | 40+ (21 read, 19 write) |

The Admin MCP Server allows AI coding assistants (Cursor, Claude Code, Windsurf, etc.) to manage Sentinel configuration through natural language. Write operations require human confirmation via the admin dashboard for safety.

---

## Quick Start

### 1. Configure Your MCP Client

Add to your MCP client configuration (e.g., `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "sentinel-admin": {
      "url": "http://localhost:3003/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer <your_admin_access_token>"
      }
    }
  }
}
```

### 2. Get Your Admin Token

1. Log into the Sentinel dashboard as an admin
2. Go to **Settings** > **Credentials**
3. Generate an API key or use your access token

### 3. Verify Connection

Ask your AI assistant to check the connection:

```
"Check the health of the Sentinel Admin MCP server"
```

The AI will call `admin_health` and return session information.

---

## Tool Categories

Tools are organized by scope. Each scope can be independently enabled/disabled per organization.

| Scope | Read Tools | Write Tools |
|-------|------------|-------------|
| POLICIES | `admin_list_policies`, `admin_get_policy`, `admin_search_param_values_by_label`, `admin_get_param_suggestions`, `admin_get_tool_param_fields` | `admin_create_policy`, `admin_update_policy`, `admin_delete_policy`, `admin_enable_policy`, `admin_disable_policy` |
| USERS | `admin_list_users`, `admin_get_user` | `admin_create_user`, `admin_update_user`, `admin_delete_user` |
| ROLES | `admin_list_roles`, `admin_get_role` | `admin_create_role`, `admin_update_role`, `admin_delete_role` |
| MCP_SERVERS | `admin_list_mcp_servers`, `admin_get_mcp_server`, `admin_list_mcp_server_tools` | `admin_create_mcp_server`, `admin_update_mcp_server`, `admin_delete_mcp_server` |
| AGENTS | `admin_list_agents`, `admin_get_agent` | `admin_create_agent`, `admin_delete_agent` |
| WEBHOOKS | `admin_list_webhooks`, `admin_get_webhook` | `admin_create_webhook`, `admin_update_webhook`, `admin_delete_webhook` |
| PERMISSION_REQUESTS | `admin_list_permission_requests` | `admin_approve_request`, `admin_deny_request` |
| ANALYTICS | `admin_get_analytics_summary` | - |
| AUDIT | `admin_query_audit_log`, `admin_query_admin_actions` | - |
| SENSITIVE_FLAGS | `admin_list_sensitive_flags` | - |

---

## Confirmation Workflow

Write operations require human confirmation for safety. This prevents AI agents from making unauthorized changes.

### How It Works

```
AI Agent                     Admin MCP Server                 Admin Dashboard
    |                              |                               |
    |-- Call write tool ---------->|                               |
    |                              |-- Create confirmation ------->|
    |                              |<-- confirmationId ------------|
    |                              |                               |
    |                              |   [Admin reviews in dashboard]|
    |                              |                               |
    |                              |<-- Confirm/Reject ------------|
    |                              |                               |
    |                              |-- Execute (if confirmed) ---->|
    |<-- Result -------------------|                               |
```

### Step-by-Step

1. **AI calls write tool**: Agent calls a write tool (e.g., `admin_create_policy`)
2. **Confirmation created**: Server creates a pending confirmation record
3. **Agent waits**: The MCP call blocks while waiting for confirmation
4. **Admin reviews**: Human admin sees the pending action in the dashboard
5. **Admin decides**: Admin confirms or rejects the action
6. **Result returned**: If confirmed, operation executes and result is returned

### Confirmation Statuses

| Status | Description |
|--------|-------------|
| `PENDING` | Waiting for admin decision |
| `EXECUTED` | Confirmed and successfully executed |
| `REJECTED` | Admin rejected the action |
| `EXPIRED` | Timed out before decision |
| `FAILED` | Execution failed after confirmation |

---

## Risk Levels

Write operations are categorized by risk level:

| Level | Description | Examples |
|-------|-------------|----------|
| LOW | Easily reversible | Enable/disable policy |
| MEDIUM | Moderate impact | Create user, update policy |
| HIGH | Difficult to reverse | Delete user, delete policy |

Risk levels help admins prioritize confirmation reviews. High-risk operations are highlighted in the dashboard.

---

## Authentication

### Requirements

1. Valid admin access token in `Authorization: Bearer <token>` header
2. User must have admin role in the organization
3. User must be in `adminMcpAllowedAdmins` list (or list is empty = all admins allowed)
4. Admin MCP must be enabled for the organization

### Token Validation

```http
POST /mcp HTTP/1.1
Host: localhost:3003
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{"jsonrpc":"2.0","method":"initialize",...}
```

### Non-Admin Handling

If the token is invalid or belongs to a non-admin user:
- Session is created but with no admin tools
- Only `admin_status` tool is available
- `admin_status` returns an explanation of why tools are unavailable

---

## Self-Protection

The Admin MCP Server prevents admins from performing certain operations on their own account:

| Blocked Operation | Reason |
|-------------------|--------|
| Delete own user | Prevents accidental self-lockout |
| Update own user | Use dashboard for self-updates |
| Revoke own token | Prevents session invalidation |

When a blocked self-operation is attempted, the server returns:

```json
{
  "error": "SELF_OPERATION_BLOCKED",
  "message": "Cannot perform this operation on your own account via Admin MCP. Use the web dashboard instead."
}
```

---

## Organization Configuration

Administrators can configure Admin MCP behavior in organization settings.

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `adminMcpEnabled` | Enable/disable Admin MCP for the organization | `false` |
| `adminMcpEnabledScopes` | Which tool scopes are available | All scopes |
| `adminMcpAllowedAdmins` | Which admin user IDs can use Admin MCP | Empty (all admins) |
| `adminMcpRateLimitPerMin` | Maximum requests per minute per admin | 60 |
| `adminMcpConfirmationTtl` | How long confirmations remain valid (seconds) | 300 |

### Configuring via Dashboard

1. Go to **Admin** > **Settings**
2. Find **Admin MCP** section
3. Enable and configure as needed

---

## Tool Reference

### Read Tools (Execute Immediately)

#### Policies

**`admin_list_policies`**
```typescript
// Input
{ limit?: number, offset?: number }

// Returns list of policies with effect, matchers, toolPatterns, enabled status
```

**`admin_get_policy`**
```typescript
// Input
{ id: string }  // CUID

// Returns full policy details including conditions
```

**`admin_search_param_values_by_label`**
```typescript
// Input
{
  labelQuery: string,      // Human-readable name to search for
  serverDomain?: string,   // Filter by server domain
  serverId?: string,       // Alternative: filter by server ID
  limit?: number           // Max results (default: 10)
}

// Use to find IDs for policy conditions by searching labels
// Example: Find page_id for "Applications Tracker 2026"
```

**`admin_get_param_suggestions`**
```typescript
// Input
{
  toolName: string,        // "server::toolName" format
  parameterKey: string,    // e.g., "page_id"
  prefix?: string,         // Filter by value prefix
  limit?: number           // Max results (default: 10)
}

// Returns recently used values for a parameter
```

**`admin_get_tool_param_fields`**
```typescript
// Input
{ toolName: string }       // "server::toolName" format

// Returns parameter fields, types, and descriptions
// Use BEFORE creating policy conditions
```

#### Users

**`admin_list_users`**
```typescript
{ limit?: number }  // Default: 50, max: 1000
```

**`admin_get_user`**
```typescript
{ id: string }  // CUID
```

#### Roles

**`admin_list_roles`**
```typescript
{}  // No parameters
```

**`admin_get_role`**
```typescript
{ id: string }  // CUID
```

#### MCP Servers

**`admin_list_mcp_servers`**
```typescript
{}  // No parameters
```

**`admin_get_mcp_server`**
```typescript
{ id: string }  // CUID
```

**`admin_list_mcp_server_tools`**
```typescript
{ mcpServerId: string }  // CUID

// Returns discovered tools with names, descriptions, input schemas
```

#### Agents

**`admin_list_agents`**
```typescript
{}  // No parameters
```

**`admin_get_agent`**
```typescript
{ id: string }  // CUID
```

#### Sensitive Flags

**`admin_list_sensitive_flags`**
```typescript
{}  // No parameters
```

#### Webhooks

**`admin_list_webhooks`**
```typescript
{}  // No parameters
```

**`admin_get_webhook`**
```typescript
{ id: string }  // CUID
```

#### Permission Requests

**`admin_list_permission_requests`**
```typescript
{
  status?: 'PENDING' | 'APPROVED' | 'DENIED' | 'WITHDRAWN' | 'MODIFIED'
}
```

#### Analytics

**`admin_get_analytics_summary`**
```typescript
{ days?: number }  // 1-365, default: 7
```

#### Audit

**`admin_query_audit_log`**
```typescript
{ limit?: number }  // Default: 50, max: 1000
```

**`admin_query_admin_actions`**
```typescript
{ limit?: number }  // Default: 50, max: 1000
```

### Write Tools (Require Confirmation)

#### Policies

**`admin_create_policy`**
```typescript
{
  effect: 'ALLOW' | 'DENY',
  matchers: string[],      // ["*", "user:email", "role:name", "agent:id"]
  toolPatterns: string[],  // ["server::tool", "*::*", "server::*"]
  description: string,
  slug?: string,           // Auto-generated if not provided
  conditions?: Array<{
    field: string,         // "params.x", "time.hourOfDay", etc.
    operator: string,      // "equals", "contains", "between", etc.
    value: unknown
  }>,
  enabled?: boolean,       // Default: true
  requestId?: string       // Link to permission request
}
```

**`admin_update_policy`**
```typescript
{
  id: string,              // Required
  effect?: 'ALLOW' | 'DENY',
  matchers?: string[],
  toolPatterns?: string[],
  description?: string,
  slug?: string,
  conditions?: object[] | null,  // null to remove conditions
  enabled?: boolean
}
```

**`admin_delete_policy`**
```typescript
{ id: string }
```

**`admin_enable_policy`**
```typescript
{ id: string }
```

**`admin_disable_policy`**
```typescript
{ id: string }
```

#### Users

**`admin_create_user`**
```typescript
{
  email: string,
  name?: string,
  roleIds?: string[]
}
```

**`admin_update_user`**
```typescript
{
  id: string,
  email?: string,
  name?: string,
  roleIds?: string[]
}
```

**`admin_delete_user`**
```typescript
{ id: string }
```

#### Roles

**`admin_create_role`**
```typescript
{
  name: string,
  description?: string
}
```

**`admin_update_role`**
```typescript
{
  id: string,
  name?: string,
  description?: string
}
```

**`admin_delete_role`**
```typescript
{ id: string }
```

#### MCP Servers

**`admin_create_mcp_server`**
```typescript
{
  name: string,
  url: string,
  authType: 'NONE' | 'API_KEY' | 'OAUTH',
  description?: string
}
```

**`admin_update_mcp_server`**
```typescript
{
  id: string,
  name?: string,
  url?: string,
  authType?: 'NONE' | 'API_KEY' | 'OAUTH',
  description?: string
}
```

**`admin_delete_mcp_server`**
```typescript
{ id: string }
```

#### Agents

**`admin_create_agent`**
```typescript
{
  name: string,
  description?: string
}
```

**`admin_delete_agent`**
```typescript
{ id: string }
```

#### Webhooks

**`admin_create_webhook`**
```typescript
{
  name: string,
  url: string,
  events: string[],  // See supported events below
  enabled?: boolean
}

// Supported events:
// - TOOL_INVOCATION_ALLOWED
// - TOOL_INVOCATION_DENIED
// - SENSITIVE_TOOL_INVOKED
// - SENSITIVE_APPROVAL_NEEDED
// - SENSITIVE_RATE_LIMITED
// - POLICY_CREATED
// - POLICY_UPDATED
// - POLICY_DELETED
// - AGENT_CREATED
// - AGENT_DELETED
```

**`admin_update_webhook`**
```typescript
{
  id: string,
  name?: string,
  url?: string,
  events?: string[],
  enabled?: boolean
}
```

**`admin_delete_webhook`**
```typescript
{ id: string }
```

#### Permission Requests

**`admin_approve_request`**
```typescript
{
  id: string,
  reason?: string
}
```

**`admin_deny_request`**
```typescript
{
  id: string,
  reason?: string
}
```

---

## Audit Logging

All Admin MCP operations are recorded in the audit log.

### Admin Action Log Fields

| Field | Description |
|-------|-------------|
| `source` | Always `MCP_ADMIN` for Admin MCP operations |
| `adminUserId` | The admin who initiated the action |
| `action` | Tool name (e.g., `admin_create_policy`) |
| `resourceType` | Type of resource affected |
| `resourceId` | ID of affected resource |
| `mcpSessionId` | MCP session identifier |
| `mcpToolName` | Tool name as called |
| `confirmationId` | Link to confirmation record (if applicable) |
| `beforeSnapshot` | State before mutation |
| `afterSnapshot` | State after mutation |

### Viewing Audit Logs

Via Admin MCP:
```
"Show me the last 20 admin actions"
```

Via Dashboard:
1. Go to **Admin** > **Activity**
2. Filter by source: `MCP_ADMIN`

---

## Example Conversations

### Create a Policy

**User**: "Create a policy that allows the engineering role to use all filesystem tools"

**AI Response**:
```
I'll create a policy for the engineering role. This requires confirmation.

Creating policy:
- Effect: ALLOW
- Matcher: role:engineering
- Tool Pattern: filesystem::*
- Description: Allow engineering role to use all filesystem tools

Waiting for confirmation in the Sentinel dashboard...
```

**After admin confirms**: "The policy has been created successfully."

### Check Analytics

**User**: "Show me the analytics summary for the last 30 days"

**AI Response**:
```
Here's the analytics summary for the last 30 days:

- Total tool calls: 15,234
- Unique users: 45
- Most used tools:
  1. filesystem::read_file (5,432)
  2. github::get_file_contents (3,211)
  3. postgres::query (2,198)
- Policy denials: 342
- Approval requests: 89
```

### Manage Users

**User**: "Add a new user with email bob@company.com and assign them the developer role"

**AI Response**:
```
I'll create the new user. This requires confirmation.

Creating user:
- Email: bob@company.com
- Role: developer

Waiting for confirmation in the Sentinel dashboard...
```

---

## Troubleshooting

### "Admin MCP access denied"

**Causes**:
- Admin MCP is disabled for the organization
- Your user is not in the allowed admins list
- Your token is invalid or expired

**Solution**:
1. Verify Admin MCP is enabled in organization settings
2. Check if your user ID is in `adminMcpAllowedAdmins`
3. Regenerate your access token

### "No admin tools available"

**Causes**:
- Token belongs to a non-admin user
- No scopes are enabled for your organization

**Solution**:
1. Verify you have the `admin` role
2. Check enabled scopes in organization settings

### "Confirmation timed out"

**Causes**:
- Admin did not respond within TTL period
- Dashboard was not open

**Solution**:
1. Retry the operation
2. Have an admin watch for confirmations
3. Increase `adminMcpConfirmationTtl` if needed

### "Self operation blocked"

**Cause**: Attempted to modify your own account

**Solution**: Use the web dashboard for self-modifications

---

## Security Considerations

### Token Security

- Store access tokens securely (environment variables, secret managers)
- Rotate tokens regularly
- Use separate tokens for Admin MCP and regular MCP access

### Scope Restrictions

- Enable only necessary scopes
- Consider using `adminMcpAllowedAdmins` to restrict access

### Confirmation Review

- Always verify the operation details before confirming
- Check the risk level indicator
- Review the input parameters for unexpected values

### Audit Review

- Regularly review Admin MCP actions in the audit log
- Set up webhooks for sensitive operations
- Monitor for unusual activity patterns
