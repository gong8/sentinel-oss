# SENTINEL Security Model

> **See also**: `CLAUDE.md` security checklist

## Core Principles

1. **Organization scoping** - All queries MUST filter by `organizationId`
2. **Workspace isolation** - Workspace-scoped resources isolated within orgs
3. **DENY-first policies** - DENY always wins, no bypass possible
4. **Fail-closed** - Errors result in denial
5. **Audit everything** - Tool calls, admin actions, policy changes

## Multi-Tenant Isolation

### Organization Scoping

- Every database model has an `organizationId` field
- All queries filtered by `ctx.auth.organizationId`
- Cascading deletes on organization deletion
- Unique constraints scoped per-organization

```typescript
// Example: All queries must include organizationId
const policies = await prisma.policy.findMany({
  where: {
    organizationId: ctx.auth.organizationId,  // REQUIRED
    workspaceId: workspaceId,
  },
});
```

### Workspace Isolation

Workspace-scoped models:
- `Policy` - Access control policies
- `McpServer` - MCP server configurations
- `Agent` - Agent definitions
- `GlobalVariableNamespace` - Variable namespaces

Access control:
- `WorkspaceMember` controls access with roles: `MEMBER` or `ADMIN`
- Organization owners can access all workspaces
- Cross-workspace access is prevented at the service layer

## Credential Security

| Aspect | Implementation |
|--------|----------------|
| Encryption | AES-256-GCM |
| Key derivation | HKDF from master key |
| Storage | Encrypted before database storage |
| Transmission | Never in logs/responses |
| Redaction | Sensitive keys redacted in logging |

### Sensitive Key Redaction

The following keys are automatically redacted from logs:
- `token`
- `password`
- `key`
- `secret`
- `credential`
- `auth`

## Authentication

| Flow | Method |
|------|--------|
| User → API | Bearer access token |
| Proxy → API | Service token (`PROXY_API_KEY`) |
| User → MCP Server | Per-server credentials (API key/OAuth) |
| Admin MCP | Bearer token with scope validation |

## Session Management

### Session Model

Sessions track active user connections:
- States: `ACTIVE`, `EXPIRED`, `TERMINATED`
- Session timeout is configurable
- MCP session pooling with 30-minute timeout

### Session Controls

- Administrators can terminate sessions
- Sessions expire after configured timeout
- Terminated sessions cannot be reactivated

## Rate Limiting

| Limiter | Rate | Use Case |
|---------|------|----------|
| `authRateLimit` | 2000 req/min | Authentication endpoints |
| `apiRateLimit` | 10000 req/min | General API |
| `strictRateLimit` | 500 req/min | Password reset, sensitive operations |

Admin MCP rate limiting is applied per organization.

## Sensitive Tool Flags

### Flag Behaviors

| Behavior | Description |
|----------|-------------|
| `REQUIRE_APPROVAL` | Tool call requires explicit approval before execution |
| `RATE_LIMIT` | Tool call subject to rate limiting |
| `ALERT` | Tool call triggers an alert notification |

### Supporting Models

- `SensitiveFlagAgentOverride` - Per-agent behavior overrides
- `SensitiveFlagApprovalRequest` - Pending approval workflow
- `SensitiveFlagRateLimitUsage` - Rate limit tracking per flag

## Audit Logging

### Tool Call Logging

All tool calls are logged with:
- User/agent identity
- Tool and parameters (sensitive values redacted)
- Policy evaluation result
- Evaluation tree (full decision path)
- Matched policy IDs and snapshots
- Timestamp and organization

### Pipeline Stages

Tool calls pass through logged stages:
1. `REQUEST` - Initial request received
2. `SENTINEL_ENTRY` - Entered Sentinel processing
3. `TRUST_CHECK` - Trust verification
4. `POLICY_CHECK` - Policy evaluation
5. `FLAG_CHECK` - Sensitive flag evaluation
6. `EXECUTION` - Tool execution
7. `COMPLETION` - Request completed

### Admin Action Logging

Admin actions are logged with:
- Admin identity
- Action type (50+ types supported)
- Resource affected
- Before/after snapshots
- Change diff
- Source: `UI`, `MCP_ADMIN`, `API`, or `SYSTEM`
- IP address
- User agent
- Request path

## Policy Evaluation Security

### DENY Policy Enforcement

- DENY policies **always win** (non-bypassable)
- No admin override for DENY policies
- Fail-closed default on evaluation errors
- This is tested explicitly in the test suite

### Validation

| Validation | Purpose |
|------------|---------|
| Condition validation | Prevents LLM hallucinations in conditions |
| Tool pattern validation | Validates against registered MCP servers |
| Matcher validation | Validates role:, user:, agent:, and wildcard patterns |

## Input Validation

All inputs are validated with Zod schemas:
- Tool patterns validated against schema definitions
- Matchers validated against allowed formats
- Conditions validated for field paths and operators
- No raw input processing allowed

```typescript
// Example: Input validation
const policyInput = z.object({
  name: z.string().min(1).max(255),
  effect: z.enum(['ALLOW', 'DENY']),
  priority: z.number().int().min(0).max(1000),
  toolPattern: z.string().regex(/^[\w*]+\/[\w*]+$/),
});
```

## Admin MCP Security

### Scope-Based Access

Admin MCP operations are controlled by scopes:
- `POLICIES` - Policy management
- `USERS` - User management
- `ROLES` - Role management
- And more...

### Operation Controls

| Operation Type | Behavior |
|----------------|----------|
| Read tools | Execute immediately |
| Write tools | Require confirmation |

### Risk Classification

Operations are classified by risk level:
- `LOW` - Read operations, listing
- `MEDIUM` - Updates, configuration changes
- `HIGH` - Deletions, permission changes

### Self-Operation Protection

- Users cannot delete their own account via Admin MCP
- Prevents accidental self-lockout

## Owner Management

### Organization Ownership

The `OrgOwner` model tracks organization owners:
- Ownership transfer with status flow
- Owner recovery with verification tokens
- 72-hour expiry on recovery requests

## Security Checklist

Before submitting changes:

- [ ] Inputs validated with Zod
- [ ] Queries scoped to `organizationId`
- [ ] Workspace access verified via `WorkspaceMember`
- [ ] Credentials encrypted before storage
- [ ] Actions audit logged
- [ ] DENY policies tested (cannot be bypassed)
- [ ] Rate limits configured
- [ ] Session management implemented
