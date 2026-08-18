# Admin Dashboard Tour

> **Target audience**: New administrators learning the Sentinel dashboard

This guide walks through each section of the admin dashboard.

---

## Dashboard Overview

After logging in as an admin, you'll see the main dashboard with navigation on the left.

### Navigation Structure

```
Admin
  ├── Analytics        (usage metrics and trends)
  ├── Policies         (access control rules)
  ├── Roles            (user role management)
  ├── MCP Servers      (tool server configuration)
  ├── A2A Agents       (agent-to-agent settings)
  ├── Sensitive Flags  (tool risk markers)
  ├── Webhooks         (notification channels)
  ├── Activity         (audit log viewer)
  └── Settings         (organization config)
```

---

## Analytics

**Purpose**: Monitor usage patterns and trends.

### Key Metrics

- **Tool Calls**: Total tool invocations over time
- **Top Tools**: Most frequently used tools
- **Top Users**: Most active users
- **Policy Hits**: Which policies are triggered most

### Date Range

Use the date picker to filter by:
- Last 24 hours
- Last 7 days
- Last 30 days
- Custom range

### Use Cases

- Identify unused tools for cleanup
- Spot unusual activity patterns
- Measure adoption rates
- Capacity planning

---

## Policies

**Purpose**: Define who can use which tools.

### Policy List

Shows all policies with:
- Name and description
- Effect (ALLOW/DENY)
- Matcher pattern
- Priority (higher = evaluated first)
- Status (enabled/disabled)

### Creating a Policy

1. Click **Create Policy**
2. Fill in:
   - **Name**: Human-readable identifier
   - **Rule**: What action to take
   - **Matcher**: Tool pattern to match
   - **Priority**: Evaluation order
   - **Roles**: Which roles this applies to
   - **Conditions** (optional): Parameter-based filters

### Policy Order

Policies evaluate in priority order:
1. All DENY policies first (cannot be overridden)
2. Then ALLOW
3. Default: DENY if no match

Note: DEFER and FLAG behaviors are configured through **Sensitive Flags**, not policy effects.

### Tips

- Start with restrictive policies (DENY all, then ALLOW specific)
- Use high priority for security-critical rules
- Use Sensitive Flags to require approval before switching to DENY
- Check Activity log to see policy evaluations

---

## Roles

**Purpose**: Group users for policy assignment.

### Default Roles

- **Admin**: Users with the Admin role have full access and can manage settings (identified by `isAdmin` flag)

All other roles are user-created and can be named as needed for your organization.

### Creating Roles

1. Click **Create Role**
2. Enter name and description
3. Save

### Assigning Roles

1. Go to **Users** section
2. Select a user
3. Add/remove roles

### Role-Based Policies

Create policies that target specific roles:
```
Name: Developer File Access
Rule: ALLOW
Matcher: localhost:3001::*
Roles: [developer]
```

Note: Matchers use `server::tool` format where server is the MCP server URL or name.

---

## MCP Servers

**Purpose**: Configure tool servers that Sentinel proxies.

### Server List

Shows all registered MCP servers with:
- Name and status
- Command/args
- Tool count
- Connection state

### Adding a Server

1. Click **Add Server**
2. Configure:
   - **Name**: Unique identifier (no spaces)
   - **Command**: Executable to run
   - **Args**: Command arguments
   - **Env** (optional): Environment variables

### Common Server Types

**File system tools**:
```
Command: npx
Args: -y @anthropic/mcp-server-filesystem /home/user
```

**Database tools**:
```
Command: npx
Args: -y @anthropic/mcp-server-postgres
Env: DATABASE_URL=postgresql://...
```

### Server Status

- **Connected** (green): Server is running and responding
- **Starting** (yellow): Server is initializing
- **Error** (red): Server failed to start

### Troubleshooting

Click on a server to see:
- Recent logs
- Error messages
- Tool list
- Active connections

---

## A2A Agents

**Purpose**: Manage Agent-to-Agent protocol connections.

### Agent Registration

Register external agents that will communicate via A2A:

1. Click **Register Agent**
2. Configure:
   - **Agent Name**: Identifier
   - **Attestation**: JWKS URL or public key
   - **Capabilities**: Allowed skills

### A2A Policies

Use A2A-specific matchers in policies:
```
a2a-agent:github-assistant
a2a-provider:github
a2a-skill:code-review
```

---

## Sensitive Flags

**Purpose**: Mark tools requiring extra scrutiny.

### Flag Types

- **Rate Limited**: Restrict invocations per time period
- **Requires Approval**: Trigger DEFER for all calls
- **Alert Only**: Log and notify without blocking

### Adding a Flag

1. Click **Create Flag**
2. Configure:
   - **Tool Pattern**: Which tools to flag
   - **Flag Type**: Rate limit, approval, or alert
   - **Configuration**: Limits, thresholds, etc.

### Examples

**Rate limit file writes**:
```
Pattern: *::write_*
Type: Rate Limited
Limit: 10 per minute
```

**Approval for deletes**:
```
Pattern: *::delete_*
Type: Requires Approval
```

---

## Webhooks

**Purpose**: Send notifications to external systems.

### Creating a Webhook

1. Click **Create Webhook**
2. Configure:
   - **Name**: Identifier
   - **URL**: Destination endpoint
   - **Events**: Which events to send
   - **Secret** (optional): For signature verification

### Supported Events

| Event | When Triggered |
|-------|----------------|
| TOOL_CALL | Any tool invocation |
| POLICY_DENY | Request blocked |
| APPROVAL_REQUIRED | DEFER triggered |
| APPROVAL_GRANTED | Approval given |
| APPROVAL_DENIED | Approval rejected |
| SESSION_STARTED | New connection |
| SESSION_TERMINATED | Connection closed |

### Integration Examples

**Slack**:
```
URL: https://hooks.slack.com/services/T.../B.../xxx
Events: APPROVAL_REQUIRED, POLICY_DENY
```

**Discord**:
```
URL: https://discord.com/api/webhooks/.../...
Events: APPROVAL_REQUIRED
```

**Custom**:
```
URL: https://api.company.com/sentinel-events
Events: ALL
Secret: your-hmac-secret
```

---

## Activity

**Purpose**: View audit log of all actions.

### Activity List

Shows recent events with:
- Timestamp
- User
- Action type
- Tool/resource
- Result (allowed/denied)
- Policy matched

### Filters

Filter by:
- Date range
- User
- Action type
- Tool
- Result

### Detail View

Click an entry to see:
- Full request parameters
- Policy evaluation chain
- Response data
- Duration

### Export

Export activity logs for compliance:
- PDF format
- Date range selection

---

## Settings

**Purpose**: Organization-wide configuration.

### General

- **Organization Name**: Display name
- **Default Role**: Role for new users
- **Session Timeout**: Inactivity limit

### Authentication

- **SSO/OIDC**: Configure identity provider
- **API Key Settings**: Expiration, rotation

### Security

- **Encryption Key** (read-only): Current key status
- **Audit Retention**: How long to keep logs
- **IP Allowlist**: Restrict access by IP

### Features

- **A2A Protocol**: Enable agent-to-agent
- **Admin MCP**: Enable AI agent administration

---

## Quick Actions

### Common Admin Tasks

| Task | Location |
|------|----------|
| Add a user | Users > Add User |
| Create a policy | Policies > Create Policy |
| Add a tool server | MCP Servers > Add Server |
| View recent activity | Activity (no filter) |
| Check system health | Settings > Health |
| Export audit logs | Activity > Export |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Search |
| `n` | New (context-dependent) |
| `?` | Help |
| `Esc` | Close modal |
