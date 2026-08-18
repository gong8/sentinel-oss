# API Reference

Complete tRPC API reference for the Sentinel platform. This document covers all routers, endpoints, middleware, and authentication patterns.

## Table of Contents

- [Authentication & Middleware](#authentication--middleware)
- [Rate Limiting](#rate-limiting)
- [Router Overview](#router-overview)
- [Admin Routers](#admin-routers)
- [User Routers](#user-routers)
- [Workspace Routers](#workspace-routers)
- [Public Routers](#public-routers)
- [Agent Router](#agent-router)
- [Proxy Router](#proxy-router)
- [Auth Router](#auth-router)

---

## Authentication & Middleware

### Procedure Types

All tRPC procedures are built with specific middleware chains that handle authentication and authorization.

| Procedure | Auth Required | Access Level | Description |
|-----------|---------------|--------------|-------------|
| `publicProcedure` | No | Anyone | No authentication required |
| `protectedProcedure` | Yes | Any authenticated user | Validates access token, extracts user context |
| `adminProcedure` | Yes | Admin role required | Extends `protectedProcedure`, requires `isAdmin: true` |
| `orgOwnerProcedure` | Yes | Org owner only | Extends `adminProcedure`, requires `isOrgOwner: true` |
| `workspaceAdminProcedure` | Yes | Workspace admin | Requires admin role within specific workspace |
| `workspaceMemberProcedure` | Yes | Workspace member | Requires membership in workspace |
| `proxyProcedure` | Yes | Internal proxy only | Validates `SENTINEL_API_SECRET` header for proxy-to-API communication |

-----------|------------------|------|
| `webhooksProcedure` | `webhooks` | Standard+ |
| `agentProcedure` | `agent` | Standard+ |
| `policiesProcedure` | `basic_policies` or `all_policies` | Standard+ |

### Context Object

Authenticated procedures receive `ctx.auth` with:

```typescript
interface AuthContext {
  user: { id: string; email: string; accessToken: string };
  organizationId: string;
  roles: string[];
  isAdmin: boolean;
  isOrgOwner: boolean;
  workspaceIds: string[];      // Workspaces user is member of
  adminWorkspaceIds: string[]; // Workspaces where user is admin
}
```

---

## Rate Limiting

Rate limits are enforced per-user or per-organization:

| Tier | Limit | Usage |
|------|-------|-------|
| `authRateLimit` | 2000/min | Authentication endpoints |
| `apiRateLimit` | 10000/min | Standard API endpoints |
| `strictRateLimit` | 500/min | Sensitive operations (token refresh, etc.) |

---

## Router Overview

### Complete Router Hierarchy

```
appRouter
├── admin (adminRouter) - 37 routers
│   ├── a2a                    - A2A agent management
│   ├── accessReview           - SOC2 compliance access review reporting
│   ├── adminActionLogs        - Admin action audit logs
│   ├── adminMcpConfirmation   - Admin MCP write confirmations
│   ├── adminMcpSettings       - Admin MCP settings
│   ├── advancedConditions     - SQL-like condition expression parsing
│   ├── agents                 - Agent CRUD operations
│   ├── analytics              - Analytics & insights
│   ├── attestation            - Agent verification & publisher management
│   ├── auditLogEntries        - Tool invocation audit logs
│   ├── conditions             - Policy condition builder support
│   ├── deletedItems           - View soft-deleted items
│   ├── globalVariables        - Global variable namespace management
│   ├── llmSettings            - Organization LLM configuration
│   ├── mcpServers             - MCP server configuration
│   ├── organizations          - Organization settings
│   ├── orgOAuth               - Org-level OAuth for MCP servers
│   ├── orgOwners              - Organization owner management
│   ├── orgSettings            - Organization settings (timezone, retention)
│   ├── ownerRecovery          - Owner account recovery
│   ├── ownershipTransfer      - Ownership transfer
│   ├── permissionRequests     - Permission request review
│   ├── personalCredentials    - Admin personal API keys
│   ├── policies               - Policy CRUD & evaluation
│   ├── policyAssertions       - Policy testing with assertions
│   ├── policyExceptions       - Policy exception workflow
│   ├── policyProposals        - Policy proposal workflow
│   ├── roles                  - Role management
│   ├── sensitiveFlags         - Sensitive flag configuration
│   ├── sessions               - Session monitoring & control
│   ├── users                  - User management
│   ├── webhooks               - Webhook configuration
│   ├── workspaceAuditLogs     - Workspace-scoped audit logs
│   ├── workspaceMembers       - Workspace membership management
│   └── workspaces             - Workspace CRUD
├── user (userRouter) - 9 routers
│   ├── auditLogEntries        - User's audit history
│   ├── llmConfig              - User LLM config per workspace
│   ├── mcpServers             - User MCP server credentials
│   ├── onboarding             - Onboarding tour management
│   ├── permissionRequests     - User permission requests
│   ├── profile                - User profile
│   ├── sensitiveFlags         - User sensitive flag approvals
│   ├── tools                  - Tool listing with policy access
│   └── workspaces             - User workspace access
├── workspace (workspaceRouter) - 2 routers
│   ├── chat                   - Workspace chat interface
│   └── chatSettings           - Workspace chat configuration
├── public (publicRouter) - 1 router
│   └── ownerRecovery          - Public recovery verification
├── agent (agentRouter) - 2 routers
│   ├── chat                   - Agent chat interface
│   └── confirmation           - Admin MCP confirmations
├── proxy (proxyRouter)        - Internal proxy-to-API communication
└── auth (authRouter)          - Token validation
```

---

## Admin Routers

### admin.a2a

**Path:** `packages/api/src/trpc/admin/a2a.ts`
**Description:** A2A (Agent-to-Agent) protocol agent management, credential configuration, and connection testing.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `previewAgent` | mutation | `{ url: string }` | Preview agent card from URL without registering |
| `registerAgent` | mutation | `{ url: string, nameOverride?: string }` | Register new A2A agent (requires AGENT feature) |
| `listAgents` | query | none | List all A2A agents |
| `getAgent` | query | `{ id: cuid }` | Get specific A2A agent details |
| `refreshAgentCard` | mutation | `{ id: cuid }` | Refresh agent card from URL |
| `updateAgentCard` | mutation | `{ id: cuid, agentCard: AgentCard }` | Manually update agent card |
| `deleteAgent` | mutation | `{ id: cuid }` | Soft delete A2A agent |
| `setCredential` | mutation | `{ agentId: string, authType: 'API_KEY'|'OAUTH'|'OIDC', credentials: {...} }` | Set agent credentials |
| `getCredentialStatus` | query | `{ agentId: string }` | Check if credentials are configured |
| `deleteCredential` | mutation | `{ agentId: string }` | Remove agent credentials |
| `testConnection` | mutation | `{ agentId: string }` | Test agent connectivity |

### admin.accessReview

**Path:** `packages/api/src/trpc/admin/accessReview.ts`
**Description:** SOC2 compliance access review reporting for auditing user access.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `get` | query | none | Get access review report data |
| `exportCsv` | mutation | none | Export access review as base64-encoded CSV |
| `exportJson` | mutation | none | Export access review as base64-encoded JSON |

### admin.adminActionLogs

**Path:** `packages/api/src/trpc/admin/adminActionLogs.ts`
**Description:** Query admin action audit trail with filtering and pagination.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ adminUserId?, resourceType?, actionType?, startDate?, endDate?, limit?, cursor? }` | Paginated admin action logs |
| `get` | query | `{ id: cuid }` | Get specific admin action details |

### admin.adminMcpSettings

**Path:** `packages/api/src/trpc/admin/adminMcpSettings.ts`
**Description:** Admin MCP (AI assistant) settings management and confirmation workflows.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getSettings` | query | none | Get Admin MCP configuration |
| `updateSettings` | mutation | `{ enabled?, enabledScopes?, allowedAdminIds?, rateLimitPerMin?, confirmationTtlSeconds? }` | Update Admin MCP settings |
| `listConfirmations` | query | `{ status?, limit?, cursor? }` | List pending/recent confirmations |
| `getConfirmation` | query | `{ id: cuid }` | Get confirmation details |
| `approveConfirmation` | mutation | `{ id: cuid }` | Approve pending confirmation |
| `rejectConfirmation` | mutation | `{ id: cuid, reason?: string }` | Reject confirmation |

### admin.advancedConditions

**Path:** `packages/api/src/trpc/admin/advancedConditions.ts`
**Description:** SQL-like advanced condition expression parsing, type checking, and autocomplete.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `parse` | mutation | `{ expression: string, toolPatterns?: string[] }` | Parse and type check expression, returns AST and errors |
| `autocomplete` | query | `{ expression: string, cursorOffset: number, toolPatterns?: string[] }` | Get autocomplete suggestions at cursor |
| `signatureHelp` | query | `{ expression: string, cursorOffset: number }` | Get function signature help |
| `hover` | query | `{ expression: string, cursorOffset: number, toolPatterns?: string[] }` | Get hover info for symbol at cursor |
| `convertToAdvanced` | mutation | `{ conditions: SimpleCondition[] }` | Convert simple conditions to advanced expression |
| `getFunctions` | query | none | Get available functions documentation |
| `validate` | query | `{ expression: string, toolPatterns?: string[] }` | Validate expression without storing |

### admin.agents

**Path:** `packages/api/src/trpc/admin/agents.ts`
**Description:** General agent management (non-A2A agents).

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted?, workspaceId? }` | List agents (workspace-scoped access) |
| `get` | query | `{ id: cuid }` | Get agent details |
| `create` | mutation | `{ name: string, publicKeyUrl?: string, workspaceId?: cuid }` | Create new agent |
| `delete` | mutation | `{ id: cuid }` | Soft delete agent |
| `restore` | mutation | `{ id: cuid }` | Restore deleted agent |
| `getDeletionImpact` | query | `{ id: cuid }` | Preview deletion impact |

### admin.analytics

**Path:** `packages/api/src/trpc/admin/analytics.ts`
**Description:** Analytics and insights for tool usage.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `toolUsageTimeSeries` | query | `{ startDate, endDate, granularity? }` | Get tool usage over time |
| `topUsers` | query | `{ startDate, endDate, limit? }` | Get top users by tool usage |
| `topAgents` | query | `{ startDate, endDate, limit? }` | Get top agents by tool usage |
| `topTools` | query | `{ startDate, endDate, limit? }` | Get most used tools |
| `peakUsageHours` | query | `{ startDate, endDate }` | Get peak usage hours |
| `summary` | query | `{ startDate, endDate }` | Get summary statistics |

### admin.attestation

**Path:** `packages/api/src/trpc/admin/attestation.ts`
**Description:** Agent verification and publisher management for identity attestation.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `verifyAgent` | mutation | `{ agentId: cuid }` | Verify agent identity using JWKS URL |
| `getVerificationStatus` | query | `{ agentId: cuid }` | Get verification status for agent |
| `refreshVerification` | mutation | `{ agentId: cuid }` | Clear cache and re-verify agent |
| `updateAgentJwksUrl` | mutation | `{ agentId: cuid, publicKeyUrl: url\|null }` | Update agent's JWKS URL |
| `registerPublisher` | mutation | `{ name: string, publicKey: string, algorithm: enum }` | Register new publisher with public key |
| `listPublishers` | query | none | List all publishers |
| `getPublisher` | query | `{ id: cuid }` | Get publisher details |
| `deletePublisher` | mutation | `{ id: cuid }` | Soft delete publisher |

### admin.approvalRequests

**Path:** `packages/api/src/trpc/admin/approvalRequests.ts`
**Description:** Manage tool invocation approval workflows.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ status?, userId?, limit?, cursor? }` | List approval requests |
| `get` | query | `{ id: cuid }` | Get request details |
| `approve` | mutation | `{ id: cuid }` | Approve tool request |
| `deny` | mutation | `{ id: cuid, reason?: string }` | Deny tool request |
| `cancel` | mutation | `{ id: cuid }` | Cancel pending request |
| `getStats` | query | none | Approval stats (pending count, etc.) |

### admin.auditLogs

**Path:** `packages/api/src/trpc/admin/auditLogs.ts`
**Description:** Query tool invocation audit logs.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ userId?, agentId?, toolName?, decision?, startDate?, endDate?, limit?, cursor? }` | Paginated audit logs |
| `get` | query | `{ id: cuid }` | Get detailed audit entry |
| `getStats` | query | `{ startDate?, endDate? }` | Audit statistics |

### admin.conditions

**Path:** `packages/api/src/trpc/admin/conditions.ts`
**Description:** Policy condition builder support with tool parameter schema introspection and autocomplete.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getToolParamSchema` | query | `{ toolPattern: string }` | Get JSON schema for tool parameters matching pattern |
| `getParamSuggestions` | query | `{ toolPattern: string, paramPath: string, prefix?: string, limit?: number }` | Get autocomplete suggestions for parameter values |
| `searchByLabel` | query | `{ query: string, limit?: number }` | Search conditions by label text |
| `getParamKeys` | query | `{ toolPattern: string, prefix?: string }` | Get available parameter keys for tool pattern |
| `validateConditions` | mutation | `{ conditions: Condition[], toolPatterns: string[] }` | Validate condition set against tool patterns |
| `getOperators` | query | none | Get available comparison operators |
| `getCategories` | query | none | Get condition categories for UI |
| `getParameterType` | query | `{ toolPattern: string, paramPath: string }` | Get type info for specific parameter |
| `getToolPatternSuggestions` | query | `{ prefix?: string, limit?: number }` | Get tool pattern autocomplete suggestions |
| `parseJsonPath` | query | `{ path: string }` | Parse and validate JSON path expression |
| `getConditionPreview` | query | `{ condition: Condition }` | Get human-readable preview of condition |
| `listRecentConditions` | query | `{ limit?: number }` | List recently used conditions for quick access |

### admin.dashboard

**Path:** `packages/api/src/trpc/admin/dashboard.ts`
**Description:** Dashboard statistics and metrics.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getStats` | query | none | Overview stats (users, agents, policies, etc.) |
| `getRecentActivity` | query | `{ limit? }` | Recent admin actions |
| `getToolUsage` | query | `{ days? }` | Tool usage metrics |

### admin.debugLogs

**Path:** `packages/api/src/trpc/admin/debugLogs.ts`
**Description:** System debug log retrieval for troubleshooting.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ level?, source?, startDate?, endDate?, limit?, cursor? }` | Query debug logs |
| `get` | query | `{ id: cuid }` | Get specific log entry |

### admin.deletedItems

**Path:** `packages/api/src/trpc/admin/deletedItems.ts`
**Description:** View soft-deleted items across all entity types for recovery or permanent deletion.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | none | List all soft-deleted items (users, roles, agents, mcpServers, policies) |

### admin.exportImport

**Path:** `packages/api/src/trpc/admin/exportImport.ts`
**Description:** Export and import organization configuration.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `export` | mutation | `{ includeUsers?, includePolicies?, includeMcpServers?, includeAgents? }` | Export config as JSON |
| `import` | mutation | `{ data: object, overwrite? }` | Import configuration |
| `validateImport` | mutation | `{ data: object }` | Validate import without applying |

### admin.globalVariables

**Path:** `packages/api/src/trpc/admin/globalVariables.ts`
**Description:** Global variable namespace and field management for dynamic policy conditions.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `listNamespaces` | query | `{ includeDeleted?: boolean }` | List all namespaces |
| `getNamespace` | query | `{ id: cuid }` | Get namespace with fields |
| `createNamespace` | mutation | `{ name: string, description?: string }` | Create new namespace |
| `updateNamespace` | mutation | `{ id: cuid, name?: string, description?: string }` | Update namespace |
| `deleteNamespace` | mutation | `{ id: cuid }` | Soft delete namespace |
| `restoreNamespace` | mutation | `{ id: cuid }` | Restore deleted namespace |
| `createField` | mutation | `{ namespaceId: cuid, name: string, type: enum, defaultValue?: string }` | Create field in namespace |
| `updateField` | mutation | `{ id: cuid, name?: string, type?: enum, defaultValue?: string }` | Update field |
| `deleteField` | mutation | `{ id: cuid }` | Delete field |
| `listVariablesForConditionBuilder` | query | none | Get variables formatted for condition builder UI |
| `getVariablesPreview` | query | `{ expression: string }` | Preview variable resolution in expression |
| `setFieldValue` | mutation | `{ fieldId: cuid, value: string, scope?: object }` | Set field value with optional scope |
| `getFieldValue` | query | `{ fieldId: cuid, scope?: object }` | Get field value for scope |

### admin.health

**Path:** `packages/api/src/trpc/admin/health.ts`
**Description:** System health and status checks.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `check` | query | none | Basic health check |
| `detailed` | query | none | Detailed health (database, API) |

### admin.llmSettings

**Path:** `packages/api/src/trpc/admin/llmSettings.ts`
**Description:** Organization LLM provider configuration, connection testing, and usage tracking.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getProviders` | query | none | Get available LLM providers (filtered by deployment mode) |
| `getLlmConfig` | query | none | Get current org LLM configuration (API key masked) |
| `updateLlmConfig` | mutation | `{ llmProvider: string, llmModel: string?, llmApiKey: string?, llmBaseUrl: string?, llmMaxTokens: number, llmTemperature: number }` | Update org LLM settings |
| `testConnection` | mutation | `{ provider: string, apiKey?: string, baseUrl?: string, model?: string }` | Test LLM provider connection |
| `listModels` | query | `{ provider: string, baseUrl?: string, apiKey?: string }` | List available models for provider |
| `getUsageSummary` | query | `{ startDate: datetime, endDate: datetime }` | Get LLM usage summary for date range |

### admin.mcpServers

**Path:** `packages/api/src/trpc/admin/mcpServers.ts`
**Description:** MCP server configuration, OAuth, and tool discovery.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted?, workspaceId? }` | List MCP servers |
| `get` | query | `{ id: cuid }` | Get server details with tools |
| `create` | mutation | `{ name, url, trusted?, authType, workspaceId?, ... }` | Create MCP server |
| `update` | mutation | `{ id: cuid, name?, url?, trusted?, authType?, ... }` | Update server config |
| `delete` | mutation | `{ id: cuid }` | Soft delete server |
| `restore` | mutation | `{ id: cuid }` | Restore deleted server |
| `getDeletionImpact` | query | `{ id: cuid }` | Preview deletion impact |
| `refreshTools` | mutation | `{ id: cuid }` | Refresh tool list from server |
| `testConnection` | mutation | `{ id: cuid }` | Test server connectivity |
| `getOAuthConfig` | query | `{ id: cuid }` | Get OAuth configuration |
| `setOAuthConfig` | mutation | `{ id: cuid, clientId, clientSecret, ... }` | Configure OAuth |
| `deleteOAuthConfig` | mutation | `{ id: cuid }` | Remove OAuth config |
| `startOAuthFlow` | mutation | `{ id: cuid, userId? }` | Initiate OAuth authorization |
| `completeOAuthCallback` | mutation | `{ state, code }` | Handle OAuth callback |
| `getOrgOAuthToken` | query | `{ id: cuid }` | Get org-level OAuth status |
| `deleteOrgOAuthToken` | mutation | `{ id: cuid }` | Remove org OAuth tokens |

### admin.organizations

**Path:** `packages/api/src/trpc/admin/organizations.ts`
**Description:** Organization settings management.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `get` | query | none | Get current organization |
| `update` | mutation | `{ name?: string }` | Update organization name |

### admin.orgOAuth

**Path:** `packages/api/src/trpc/admin/orgOAuth.ts`
**Description:** Organization-level OAuth for MCP servers with PKCE support.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `initiate` | mutation | `{ mcpServerId: cuid }` | Start org-level OAuth flow with PKCE |
| `getStatus` | query | `{ mcpServerId: cuid }` | Check org OAuth status for MCP server |
| `disconnect` | mutation | `{ mcpServerId: cuid }` | Revoke and disconnect org OAuth |

### admin.orgOwners

**Path:** `packages/api/src/trpc/admin/orgOwners.ts`
**Procedure:** `orgOwnerProcedure` (requires org owner role)
**Description:** Organization owner management (add/remove org owners).

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | none | List all organization owners |
| `add` | mutation | `{ userId: cuid }` | Add user as org owner |
| `remove` | mutation | `{ userId: cuid }` | Remove org owner (cannot remove self or last owner) |

### admin.orgSettings

**Path:** `packages/api/src/trpc/admin/orgSettings.ts`
**Description:** Organization settings (timezone, retention policies).

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `get` | query | none | Get org settings (creates default if not exists) |
| `update` | mutation | `{ defaultTimezone?: string, paramHistoryRetentionDays?: number, auditLogRetentionDays?: number, defaultConditionMode?: enum }` | Update org settings |

### admin.ownerRecovery

**Path:** `packages/api/src/trpc/admin/ownerRecovery.ts`
**Description:** Organization owner account recovery.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ status?, limit?, cursor? }` | List recovery requests |
| `get` | query | `{ id: cuid }` | Get request details |
| `create` | mutation | `{ targetUserEmail: string }` | Initiate owner recovery |
| `cancel` | mutation | `{ id: cuid }` | Cancel pending recovery |

### admin.ownerTransfer

**Path:** `packages/api/src/trpc/admin/ownerTransfer.ts`
**Description:** Transfer organization ownership.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ status?, limit?, cursor? }` | List transfer requests |
| `create` | mutation | `{ targetUserId: cuid }` | Initiate ownership transfer |
| `cancel` | mutation | `{ id: cuid }` | Cancel pending transfer |
| `accept` | mutation | `{ id: cuid }` | Accept transfer (target user) |
| `decline` | mutation | `{ id: cuid }` | Decline transfer (target user) |

### admin.personalCredentials

**Path:** `packages/api/src/trpc/admin/personalCredentials.ts`
**Description:** Admin personal API key management for MCP servers.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | none | List MCP servers with credential status |
| `getCredentials` | query | `{ mcpServerId: cuid }` | Get credential status for server |
| `updateApiKey` | mutation | `{ mcpServerId: cuid, apiKey: string }` | Set API key (encrypted) |
| `updateCredentials` | mutation | `{ mcpServerId: cuid, credentials: object }` | Set full credentials (encrypted, auto-discovers tools) |

### admin.policies

**Path:** `packages/api/src/trpc/admin/policies.ts`
**Description:** Security policy CRUD and evaluation.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted?, workspaceId? }` | List policies |
| `get` | query | `{ id: cuid }` | Get policy details |
| `getBySlug` | query | `{ slug: string }` | Get policy by slug |
| `create` | mutation | `{ slug, matchers, toolPatterns, effect, description?, enabled?, workspaceId?, conditions? }` | Create policy |
| `update` | mutation | `{ id: cuid, slug?, matchers?, toolPatterns?, effect?, description?, enabled?, conditions? }` | Update policy |
| `delete` | mutation | `{ id: cuid }` | Soft delete policy |
| `restore` | mutation | `{ id: cuid }` | Restore deleted policy |
| `getDeletionImpact` | query | `{ id: cuid }` | Preview deletion impact |
| `evaluate` | mutation | `{ userId, agentId?, toolName, parameters }` | Test policy evaluation |
| `reorder` | mutation | `{ orderedIds: cuid[] }` | Reorder policy priority |

### admin.policyAssertions

**Path:** `packages/api/src/trpc/admin/policyAssertions.ts`
**Description:** Policy testing framework with assertions for validation.
**Pagination:** Offset-based (`limit`, `offset`)

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ limit?: 1-100 (default 50), offset?: number (default 0) }` | List policy assertions with offset pagination |
| `get` | query | `{ id: cuid }` | Get assertion details |
| `create` | mutation | `{ name: string, description?: string, userId: cuid, agentId?: cuid, toolName: string, parameters: object, expectedDecision: enum }` | Create assertion |
| `createFromPlaygroundTest` | mutation | `{ playgroundTestId: cuid, name: string, description?: string, expectedDecision: enum }` | Create from playground test |
| `createFromAuditLog` | mutation | `{ auditLogId: cuid, name: string, description?: string, expectedDecision: enum }` | Create from audit log entry |
| `update` | mutation | `{ id: cuid, name?: string, description?: string, userId?: cuid, agentId?: cuid, toolName?: string, parameters?: object, expectedDecision?: enum }` | Update assertion |
| `delete` | mutation | `{ id: cuid }` | Delete assertion |
| `run` | mutation | `{ id: cuid }` | Run single assertion |
| `runAll` | mutation | none | Run all assertions |
| `summary` | query | none | Get assertion summary (total, passing, failing) |
| `previewImpact` | query | `{ policyId: cuid }` | Preview policy change impact on assertions |

### admin.policyExceptions

**Path:** `packages/api/src/trpc/admin/policyExceptions.ts`
**Description:** Policy exception workflow for workspace-specific overrides.
**Procedures:** Mixed (`workspaceAdminProcedure`, `orgOwnerProcedure`, `adminProcedure`)

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `createProposal` | mutation | `{ workspaceId: cuid, policyId: cuid, justification: string, expiresAt?: datetime }` | Create exception proposal (workspace admin) |
| `createRemovalRequest` | mutation | `{ exceptionId: cuid, justification: string }` | Request exception removal (workspace admin) |
| `createException` | mutation | `{ workspaceId: cuid, policyId: cuid, justification: string, expiresAt?: datetime }` | Create exception directly (org owner) |
| `get` | query | `{ id: cuid }` | Get exception details |
| `listPending` | query | none | List pending proposals/removal requests |
| `listForWorkspace` | query | `{ workspaceId: cuid }` | List exceptions for workspace |
| `approve` | mutation | `{ proposalId: cuid }` | Approve proposal (org owner) |
| `deny` | mutation | `{ proposalId: cuid, reason?: string }` | Deny proposal (org owner) |
| `withdraw` | mutation | `{ proposalId: cuid }` | Withdraw own proposal |
| `countPending` | query | none | Count pending proposals |

### admin.policyProposals

**Path:** `packages/api/src/trpc/admin/policyProposals.ts`
**Description:** Organization-wide policy proposal workflow.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ status?: enum }` | List policy proposals |
| `create` | mutation | `{ slug: string, matchers: object, toolPatterns: string[], effect: enum, description?: string, conditions?: object }` | Create proposal |
| `approve` | mutation | `{ id: cuid }` | Approve proposal (org owner) |
| `reject` | mutation | `{ id: cuid, reason?: string }` | Reject proposal (org owner) |
| `get` | query | `{ id: cuid }` | Get proposal details |

### admin.roles

**Path:** `packages/api/src/trpc/admin/roles.ts`
**Description:** Role management for RBAC.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted? }` | List roles |
| `get` | query | `{ id: cuid }` | Get role details |
| `create` | mutation | `{ name: string, description?: string }` | Create role (auto-detects admin) |
| `update` | mutation | `{ id: cuid, name?: string, description?: string }` | Update role |
| `delete` | mutation | `{ id: cuid }` | Soft delete role |
| `restore` | mutation | `{ id: cuid }` | Restore deleted role |
| `getDeletionImpact` | query | `{ id: cuid }` | Preview deletion impact |

### admin.sensitiveFlags

**Path:** `packages/api/src/trpc/admin/sensitiveFlags.ts`
**Description:** Sensitive flag configuration for enhanced tool monitoring.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted? }` | List sensitive flags |
| `get` | query | `{ id: cuid }` | Get flag details |
| `create` | mutation | `{ name, toolPatterns, parameterPatterns?, behaviors, alertEmail?, rateLimit?, ... }` | Create flag |
| `update` | mutation | `{ id: cuid, name?, toolPatterns?, behaviors?, ... }` | Update flag |
| `delete` | mutation | `{ id: cuid }` | Soft delete flag |
| `restore` | mutation | `{ id: cuid }` | Restore deleted flag |
| `listOverrides` | query | `{ flagId: cuid }` | List agent overrides for flag |
| `createOverride` | mutation | `{ flagId: cuid, agentId: cuid, behaviors: [...] }` | Create agent override |
| `updateOverride` | mutation | `{ id: cuid, behaviors: [...] }` | Update override |
| `deleteOverride` | mutation | `{ id: cuid }` | Delete override |

### admin.sessions

**Path:** `packages/api/src/trpc/admin/sessions.ts`
**Description:** Active session monitoring and control.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ userId?, agentId?, status?, limit?, cursor? }` | List sessions |
| `get` | query | `{ id: cuid }` | Get session details |
| `terminate` | mutation | `{ id: cuid }` | Terminate active session |
| `getStats` | query | none | Session statistics |

### admin.toolParamHistory

**Path:** `packages/api/src/trpc/admin/toolParamHistory.ts`
**Description:** Tool parameter value suggestions for UI.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getValues` | query | `{ serverId: cuid, paramKey: string, limit? }` | Get recent values for parameter |
| `listParamKeys` | query | `{ serverId: cuid }` | List tracked parameter keys |

### admin.users

**Path:** `packages/api/src/trpc/admin/users.ts`
**Description:** User management operations.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted? }` | List all users |
| `get` | query | `{ id: cuid }` | Get user details |
| `create` | mutation | `{ email: string, roleIds: cuid[] }` | Create user (checks seat limit) |
| `update` | mutation | `{ id: cuid, roleIds: cuid[] }` | Update user roles |
| `refreshToken` | mutation | `{ id: cuid }` | Generate new access token |
| `revokeToken` | mutation | `{ id: cuid }` | Revoke user access |
| `delete` | mutation | `{ id: cuid }` | Soft delete user |
| `restore` | mutation | `{ id: cuid }` | Restore deleted user |
| `getDeletionImpact` | query | `{ id: cuid }` | Preview deletion impact |

### admin.webhooks

**Path:** `packages/api/src/trpc/admin/webhooks.ts`
**Description:** Webhook configuration (requires `webhooks` feature).

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted? }` | List webhooks |
| `get` | query | `{ id: cuid }` | Get webhook details |
| `create` | mutation | `{ name, type: 'CUSTOM'|'DISCORD'|'SLACK'|'EMAIL', url?, events, ... }` | Create webhook |
| `update` | mutation | `{ id: cuid, name?, url?, events?, enabled?, ... }` | Update webhook |
| `delete` | mutation | `{ id: cuid }` | Soft delete webhook |
| `restore` | mutation | `{ id: cuid }` | Restore deleted webhook |
| `test` | mutation | `{ id: cuid }` | Send test event |
| `getDeliveries` | query | `{ id: cuid, limit?, cursor? }` | Get delivery history |

### admin.workspaceMembers

**Path:** `packages/api/src/trpc/admin/workspaceMembers.ts`
**Description:** Workspace membership management.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ workspaceId: cuid }` | List workspace members |
| `add` | mutation | `{ workspaceId: cuid, userId: cuid, role: 'ADMIN'|'MEMBER' }` | Add member |
| `updateRole` | mutation | `{ workspaceId: cuid, userId: cuid, role: 'ADMIN'|'MEMBER' }` | Change member role |
| `remove` | mutation | `{ workspaceId: cuid, userId: cuid }` | Remove member |

### admin.workspaceAuditLogs

**Path:** `packages/api/src/trpc/admin/workspaceAuditLogs.ts`
**Procedure:** `workspaceAdminProcedure`
**Description:** Workspace-scoped audit logs with cursor-based pagination.
**Pagination:** Cursor-based (`cursor`, `take`)

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ workspaceId: cuid, cursor?: cuid, limit?: 1-100 (default 50), userId?: cuid, agentId?: cuid, toolName?: string, decision?: enum, startDate?: datetime, endDate?: datetime }` | List audit logs with cursor pagination |
| `get` | query | `{ workspaceId: cuid, id: cuid }` | Get detailed audit entry |
| `getStats` | query | `{ workspaceId: cuid, startDate?: datetime, endDate?: datetime }` | Get workspace audit statistics |

### admin.workspaces

**Path:** `packages/api/src/trpc/admin/workspaces.ts`
**Description:** Workspace CRUD operations.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ includeDeleted? }` | List workspaces (scoped by access) |
| `get` | query | `{ id: cuid }` | Get workspace with counts |
| `getBySlug` | query | `{ slug: string }` | Resolve workspace by slug |
| `create` | mutation | `{ name: string, description?: string }` | Create workspace (org owner only) |
| `update` | mutation | `{ id: cuid, name?: string, description?: string }` | Update workspace (org owner only) |
| `delete` | mutation | `{ id: cuid }` | Soft delete workspace (org owner only) |
| `restore` | mutation | `{ id: cuid }` | Restore deleted workspace (org owner only) |
| `getDeletionImpact` | query | `{ id: cuid }` | Preview deletion impact (org owner only) |

---

## User Routers

### user.approvalRequests

**Path:** `packages/api/src/trpc/user/approvalRequests.ts`
**Description:** User's pending approval requests.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ status?, limit?, cursor? }` | List user's approval requests |
| `get` | query | `{ id: cuid }` | Get request details |

### user.auditLogs

**Path:** `packages/api/src/trpc/user/auditLogs.ts`
**Description:** User's tool invocation history.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ toolName?, decision?, startDate?, endDate?, limit?, cursor? }` | User's audit logs |
| `get` | query | `{ id: cuid }` | Get specific audit entry |

### user.dashboard

**Path:** `packages/api/src/trpc/user/dashboard.ts`
**Description:** User-specific dashboard data.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getStats` | query | none | User statistics |
| `getRecentActivity` | query | `{ limit? }` | Recent tool invocations |

### user.llmConfig

**Path:** `packages/api/src/trpc/user/llmConfig.ts`
**Procedure:** `workspaceMemberProcedure`
**Description:** User LLM configuration per workspace (API keys, model selection, always-allow tools).

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getProviders` | query | none | Get available LLM providers (Claude, OpenAI, Gemini) with models |
| `get` | query | `{ workspaceId: cuid }` | Get user's LLM config for workspace (API key masked) |
| `set` | mutation | `{ workspaceId: cuid, provider: enum, apiKey: string, model?: string }` | Set LLM config (API key encrypted) |
| `remove` | mutation | `{ workspaceId: cuid }` | Remove LLM config |
| `getAlwaysAllowTools` | query | `{ workspaceId: cuid }` | Get user's always-allow tools list |
| `setAlwaysAllowTools` | mutation | `{ workspaceId: cuid, tools: string[] }` | Set always-allow tools (deduplicated) |
| `removeToolFromAlwaysAllow` | mutation | `{ workspaceId: cuid, toolName: string }` | Remove tool from always-allow list |
| `verifyApiKey` | mutation | `{ workspaceId: cuid, provider: enum, apiKey: string }` | Verify API key format |
| `listConfiguredWorkspaces` | query | none | List workspaces where user has LLM config |

### user.mcpCredentials

**Path:** `packages/api/src/trpc/user/mcpCredentials.ts`
**Description:** User MCP server credentials.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | none | List configured credentials |
| `get` | query | `{ mcpServerId: cuid }` | Get credential status |
| `set` | mutation | `{ mcpServerId: cuid, apiKey?: string, credentials?: string }` | Set credentials |
| `delete` | mutation | `{ mcpServerId: cuid }` | Remove credentials |

### user.notifications

**Path:** `packages/api/src/trpc/user/notifications.ts`
**Description:** User notification management.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ unreadOnly?, limit?, cursor? }` | List notifications |
| `markRead` | mutation | `{ id: cuid }` | Mark notification as read |
| `markAllRead` | mutation | none | Mark all as read |
| `getUnreadCount` | query | none | Count of unread notifications |

### user.oauth

**Path:** `packages/api/src/trpc/user/oauth.ts`
**Description:** User OAuth token management.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getTokenStatus` | query | `{ mcpServerId: cuid }` | Check OAuth token status |
| `startFlow` | mutation | `{ mcpServerId: cuid }` | Start OAuth authorization |
| `revokeToken` | mutation | `{ mcpServerId: cuid }` | Revoke OAuth tokens |

### user.onboarding

**Path:** `packages/api/src/trpc/user/onboarding.ts`
**Description:** Onboarding tour management and progress tracking.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getState` | query | none | Get onboarding state with tour definitions and current step |
| `startTour` | mutation | `{ tourId: 'admin'|'user'|'org-owner' }` | Start specific tour |
| `advanceStep` | mutation | none | Advance to next step in current tour |
| `completeTour` | mutation | none | Complete current tour |
| `dismiss` | mutation | none | Dismiss onboarding (opt out) |
| `restart` | mutation | `{ tourId?: enum }` | Restart tour (or start recommended) |
| `triggerStepCompletion` | mutation | `{ triggerType: 'mutation'|'navigation', triggerValue: string }` | Trigger step completion for auto-complete |

### user.permissionRequests

**Path:** `packages/api/src/trpc/user/permissionRequests.ts`
**Description:** User permission request operations.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `analyzeToolAccess` | query | `{ mcpServerId: cuid, toolName: string }` | Analyze tool access status and suggest request type |
| `create` | mutation | `{ mcpServerId: cuid, toolName: string, justification: string, requestType: enum }` | Create permission request |
| `list` | query | `{ status?: enum, limit?: number }` | List user's permission requests |
| `get` | query | `{ id: cuid }` | Get request details |
| `withdraw` | mutation | `{ id: cuid }` | Withdraw pending request |
| `probeAuthType` | query | `{ mcpServerId: cuid }` | Probe authentication type needed for server |

### user.profile

**Path:** `packages/api/src/trpc/user/profile.ts`
**Description:** User profile information.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `get` | query | none | Get current user profile with roles |

### user.sensitiveFlags

**Path:** `packages/api/src/trpc/user/sensitiveFlags.ts`
**Description:** User sensitive flag approval operations.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `listPendingApprovals` | query | none | List user's pending sensitive flag approvals |
| `getApproval` | query | `{ id: cuid }` | Get approval request details |
| `selfApprove` | mutation | `{ id: cuid }` | Self-approve pending request (if allowed) |
| `cancelRequest` | mutation | `{ id: cuid }` | Cancel pending request |

### user.sessions

**Path:** `packages/api/src/trpc/user/sessions.ts`
**Description:** User's active sessions.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ limit?, cursor? }` | List user's sessions |
| `get` | query | `{ id: cuid }` | Get session details |

### user.tools

**Path:** `packages/api/src/trpc/user/tools.ts`
**Description:** Tool listing with policy evaluation for user access.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ workspaceId?: cuid }` | List tools per MCP server with access status |

### user.workspaces

**Path:** `packages/api/src/trpc/user/workspaces.ts`
**Description:** User workspace access.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | none | List user's workspaces |
| `get` | query | `{ id: cuid }` | Get workspace details |

---

## Workspace Routers

### workspace.agents

**Path:** `packages/api/src/trpc/workspace/agents.ts`
**Description:** Workspace-scoped agent management.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ workspaceId: cuid, includeDeleted? }` | List workspace agents |
| `get` | query | `{ workspaceId: cuid, id: cuid }` | Get agent details |
| `create` | mutation | `{ workspaceId: cuid, name: string, publicKeyUrl?: string }` | Create workspace agent |
| `delete` | mutation | `{ workspaceId: cuid, id: cuid }` | Delete workspace agent |

### workspace.chat

**Path:** `packages/api/src/trpc/workspace/chat.ts`
**Procedure:** `workspaceMemberProcedure`
**Description:** Workspace chat interface for AI conversations.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `sendMessage` | mutation | `{ workspaceId: cuid, conversationId?: cuid, message: string }` | Send message to workspace AI chat |
| `getConversation` | query | `{ workspaceId: cuid, conversationId: cuid }` | Get conversation with messages |
| `listConversations` | query | `{ workspaceId: cuid, limit?: number }` | List user's conversations in workspace |
| `deleteConversation` | mutation | `{ workspaceId: cuid, conversationId: cuid }` | Delete conversation |
| `updateTitle` | mutation | `{ workspaceId: cuid, conversationId: cuid, title: string }` | Update conversation title |

### workspace.chatSettings

**Path:** `packages/api/src/trpc/workspace/chatSettings.ts`
**Procedure:** `workspaceAdminProcedure`
**Description:** Workspace chat configuration for admins.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `get` | query | `{ workspaceId: cuid }` | Get workspace chat settings |
| `update` | mutation | `{ workspaceId: cuid, systemPrompt?: string, enabledMcpServers?: cuid[], maxTokens?: number }` | Update chat settings |

### workspace.policies

**Path:** `packages/api/src/trpc/workspace/policies.ts`
**Description:** Workspace-scoped policy management.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ workspaceId: cuid, includeDeleted? }` | List workspace policies |
| `get` | query | `{ workspaceId: cuid, id: cuid }` | Get policy details |
| `create` | mutation | `{ workspaceId: cuid, slug, matchers, toolPatterns, effect, ... }` | Create workspace policy |
| `update` | mutation | `{ workspaceId: cuid, id: cuid, ... }` | Update workspace policy |
| `delete` | mutation | `{ workspaceId: cuid, id: cuid }` | Delete workspace policy |

---

## Public Routers

### public.ownerRecovery

**Path:** `packages/api/src/trpc/public/ownerRecovery.ts`
**Description:** Public endpoints for owner recovery verification.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `getByToken` | query | `{ token: string }` | Get recovery request status by token |
| `verify` | mutation | `{ token: string }` | Verify and complete recovery |

---

## Agent Router

**Path:** `packages/api/src/trpc/agent/index.ts`
**Procedure:** `adminProcedure`
**Description:** Agent-facing endpoints for chat and admin confirmations.

### agent.chat

**Path:** `packages/api/src/trpc/agent/chat.ts`
**Description:** Agent chat interface for Sentinel Admin AI conversations.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `sendMessage` | mutation | `{ conversationId?: cuid, message: string (1-10000 chars) }` | Send message to AI, creates conversation if needed |
| `getConversation` | query | `{ conversationId: cuid }` | Get conversation with all messages |
| `listConversations` | query | `{ limit?: 1-100 }` | List user's conversations |
| `listAllConversations` | query | `{ limit?: 1-100 }` | List all conversations (SENTINEL_ADMIN and WORKSPACE_AGENT types) |
| `deleteConversation` | mutation | `{ conversationId: cuid }` | Delete conversation |
| `updateTitle` | mutation | `{ conversationId: cuid, title: string (1-200 chars) }` | Update conversation title |
| `retryFromMessage` | mutation | `{ conversationId: cuid, messageId: cuid }` | Delete messages from ID and retry |

**Response Structure:**
```typescript
{
  conversationId: string;
  response: {
    text: string;
    toolCalls: Array<{
      name: string;
      input: unknown;
      result: unknown;
      error: string | undefined;
      confirmationId: string | undefined;
    }>;
    pendingConfirmations: Array<{ id: string; toolName: string; }>;
    model?: string;
  };
}
```

### agent.confirmation

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `list` | query | `{ status? }` | List pending confirmations |
| `get` | query | `{ id: cuid }` | Get confirmation details |
| `confirm` | mutation | `{ id: cuid }` | Confirm action |
| `reject` | mutation | `{ id: cuid, reason?: string }` | Reject action |

---

## Proxy Router

**Path:** `packages/api/src/trpc/proxy/index.ts`
**Description:** Internal endpoints for MCP proxy server communication. Uses `proxyProcedure` which validates `SENTINEL_API_SECRET`.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `evaluatePolicy` | mutation | `{ userId, agentId?, delegatedUserId?, toolName, parameters, sessionId?, a2aContext? }` | Evaluate policy for tool invocation |
| `logAuditEntry` | mutation | `{ organizationId, userId?, agentId?, toolName, parameters, decision, ... }` | Log audit entry |
| `getMcpServer` | query | `{ organizationId, domain, port? }` | Look up MCP server by domain |
| `getUserCredentials` | query | `{ userId, mcpServerId }` | Get decrypted user credentials |
| `listMcpServers` | query | `{ organizationId }` | List all MCP servers |
| `refreshOAuthToken` | mutation | `{ userId, mcpServerId }` | Refresh OAuth tokens |
| `evaluateSensitiveFlags` | mutation | `{ organizationId, sessionId, userId, agentId?, toolName, parameters }` | Evaluate sensitive flags |
| `checkApprovalStatus` | query | `{ organizationId, requestId }` | Check approval status (instant) |
| `pollApprovalStatus` | mutation | `{ organizationId, requestId, pollTimeoutMs? }` | Poll for approval with timeout |
| `checkAgentVerification` | query | `{ organizationId, agentId }` | Check agent signature verification |
| `getA2AAgent` | query | `{ organizationId, agentId }` | Get A2A agent for proxying |
| `getA2ACredentials` | query | `{ organizationId, agentId }` | Get A2A agent credentials |
| `logA2AAuditEntry` | mutation | `{ organizationId, agentId, skillId?, userId?, request, response?, durationMs, success, error? }` | Log A2A audit entry |
| `refreshA2AAgentCard` | mutation | `{ organizationId, agentId }` | Refresh A2A agent card |
| `getOrCreateSession` | mutation | `{ organizationId, externalSessionId, userId?, agentId? }` | Get or create session |
| `incrementToolCallCount` | mutation | `{ organizationId, externalSessionId }` | Increment session tool count |
| `checkSessionStatus` | query | `{ organizationId, externalSessionId }` | Check if session is terminated |
| `trackParamValues` | mutation | `{ organizationId, serverId, toolName?, parameters, response? }` | Track parameter values for suggestions |
| `validateAdminMcpAccess` | query | `{ organizationId, adminUserId }` | Validate Admin MCP access |
| `createAdminMcpConfirmation` | mutation | `{ organizationId, mcpSessionId, adminUserId, toolName, toolInput }` | Create write confirmation |
| `pollAdminMcpConfirmation` | query | `{ organizationId, confirmationId }` | Poll confirmation status |
| `getPolicies` | query | `{ organizationId }` | Get policies for proxy |

---

## Auth Router

**Path:** `packages/api/src/trpc/auth.ts`
**Description:** Token validation for authentication.

| Endpoint | Type | Input | Description |
|----------|------|-------|-------------|
| `validateToken` | mutation | `{ accessToken: string }` | Validate access token and return user context |

**Output (discriminated union):**
```typescript
// Invalid token
{ valid: false }

// Valid token
{
  valid: true,
  userId: string,
  organizationId: string,
  email: string,
  roles: string[],
  isAdmin: boolean,
  isOrgOwner: boolean,
  workspaceIds: string[],
  adminWorkspaceIds: string[]
}
```

---

## Common Patterns

### Soft Deletion

Most resources support soft deletion with restore capability:

```typescript
// Delete marks deletedAt timestamp
delete: adminProcedure
  .input(z.object({ id: z.string().cuid() }))
  .mutation(async ({ ctx, input }) => {
    await prisma.resource.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedBy: ctx.auth.user.id }
    });
  });

// Restore clears deletion fields
restore: adminProcedure
  .input(z.object({ id: z.string().cuid() }))
  .mutation(async ({ ctx, input }) => {
    await prisma.resource.update({
      where: { id: input.id },
      data: { deletedAt: null, deletedBy: null }
    });
  });
```

### Deletion Impact Analysis

Before deleting, analyze dependencies:

```typescript
getDeletionImpact: adminProcedure
  .input(z.object({ id: z.string().cuid() }))
  .query(async ({ ctx, input }) => {
    return {
      canDelete: boolean,
      blockers: [{ type: string, details: string }],
      warnings: [{ type: string, details: string }]
    };
  });
```

### Admin Action Logging

All mutations log admin actions:

```typescript
await logAdminAction({
  organizationId: ctx.auth.organizationId,
  adminUserId: ctx.auth.user.id,
  actionType: AdminActionType.RESOURCE_CREATE,
  resourceType: AdminResourceType.RESOURCE,
  resourceId: resource.id,
  resourceName: resource.name,
  actionDetails: { /* operation-specific details */ },
  beforeSnapshot: { /* state before change */ },
  afterSnapshot: { /* state after change */ },
  ...getRequestMetaFromTrpc(ctx),
});
```

### Pagination

The API uses two pagination patterns depending on the use case:

#### Cursor-Based Pagination (Preferred)

Used for most list endpoints, especially where data may change during pagination. Returns a cursor for the next page.

**Example Routers:** `admin.workspaceAuditLogs`, `admin.adminActionLogs`, `admin.webhooks`

```typescript
// Input schema
.input(z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().cuid().optional()
}))
.query(async ({ input }) => {
  const items = await prisma.resource.findMany({
    take: input.limit + 1,
    cursor: input.cursor ? { id: input.cursor } : undefined,
    orderBy: { createdAt: 'desc' }
  });

  const hasMore = items.length > input.limit;
  if (hasMore) items.pop();

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : undefined
  };
});

// Client usage
const page1 = await trpc.admin.auditLogs.list.query({ limit: 50 });
const page2 = await trpc.admin.auditLogs.list.query({
  limit: 50,
  cursor: page1.nextCursor
});
```

#### Offset-Based Pagination

Used for endpoints where random access or page jumping is needed.

**Example Routers:** `admin.policyAssertions`

```typescript
// Input schema
.input(z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0)
}))
.query(async ({ input }) => {
  const [items, total] = await Promise.all([
    prisma.resource.findMany({
      take: input.limit,
      skip: input.offset,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.resource.count()
  ]);

  return {
    items,
    total,
    hasMore: input.offset + items.length < total
  };
});

// Client usage
const page1 = await trpc.admin.policyAssertions.list.query({ limit: 50, offset: 0 });
const page3 = await trpc.admin.policyAssertions.list.query({ limit: 50, offset: 100 });
```

### Organization Scoping

All queries must be scoped to organization:

```typescript
const resource = await prisma.resource.findFirst({
  where: {
    id: input.id,
    organizationId: ctx.auth.organizationId,  // CRITICAL: Always scope
    deletedAt: null
  }
});
```

---

## Input/Output Schema Examples

### Policy Create/Update

**Input Schema:**
```typescript
z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  matchers: z.object({
    users: z.array(z.string().cuid()).optional(),
    roles: z.array(z.string().cuid()).optional(),
    agents: z.array(z.string().cuid()).optional(),
    workspaces: z.array(z.string().cuid()).optional(),
  }),
  toolPatterns: z.array(z.string().min(1).max(500)),
  effect: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL']),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().default(true),
  workspaceId: z.string().cuid().optional(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'regex']),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  })).optional(),
  advancedCondition: z.string().max(10000).optional(),
})
```

**Output:**
```typescript
{
  id: string;           // CUID
  slug: string;
  matchers: { users?: string[]; roles?: string[]; agents?: string[]; workspaces?: string[]; };
  toolPatterns: string[];
  effect: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  description: string | null;
  enabled: boolean;
  priority: number;
  workspaceId: string | null;
  conditions: Condition[];
  advancedCondition: string | null;
  createdAt: string;    // ISO datetime
  updatedAt: string;
  deletedAt: string | null;
}
```

### MCP Server Create

**Input Schema:**
```typescript
z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  trusted: z.boolean().default(false),
  authType: z.enum(['NONE', 'API_KEY', 'OAUTH', 'CREDENTIALS']),
  workspaceId: z.string().cuid().optional(),
  description: z.string().max(1000).optional(),
  headers: z.record(z.string()).optional(),
  oauthConfig: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    authorizationUrl: z.string().url(),
    tokenUrl: z.string().url(),
    scopes: z.array(z.string()),
  }).optional(),
})
```

**Output:**
```typescript
{
  id: string;
  name: string;
  url: string;
  trusted: boolean;
  authType: 'NONE' | 'API_KEY' | 'OAUTH' | 'CREDENTIALS';
  workspaceId: string | null;
  description: string | null;
  tools: Array<{
    id: string;
    name: string;
    description: string | null;
    inputSchema: object | null;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

### User LLM Config

**Input Schema (set):**
```typescript
z.object({
  workspaceId: z.string().cuid(),
  provider: z.enum(['CLAUDE', 'OPENAI', 'GEMINI']),
  apiKey: z.string().min(1).max(500),
  model: z.string().max(100).optional().nullable(),
})
```

**Output:**
```typescript
{
  id: string;
  provider: 'CLAUDE' | 'OPENAI' | 'GEMINI';
  model: string | null;
  hasApiKey: boolean;      // Never returns actual key
  alwaysAllowTools: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Unified Conversation (listAllConversations)

**Output:**
```typescript
Array<{
  id: string;
  type: 'SENTINEL_ADMIN' | 'WORKSPACE_AGENT';
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;      // Only for WORKSPACE_AGENT
  workspaceName?: string;    // Only for WORKSPACE_AGENT
}>
```

### Policy Evaluation (proxy.evaluatePolicy)

**Input Schema:**
```typescript
z.object({
  userId: z.string().cuid(),
  agentId: z.string().cuid().optional(),
  delegatedUserId: z.string().cuid().optional(),
  toolName: z.string(),
  parameters: z.record(z.unknown()),
  sessionId: z.string().optional(),
  a2aContext: z.object({
    callerAgentId: z.string(),
    delegatedUserId: z.string().optional(),
  }).optional(),
})
```

**Output:**
```typescript
{
  decision: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  matchedPolicy: {
    id: string;
    slug: string;
    effect: string;
  } | null;
  reason: string;
  sensitiveFlags?: Array<{
    id: string;
    name: string;
    behaviors: string[];
  }>;
  approvalRequestId?: string;  // If REQUIRE_APPROVAL
}
```

### Access Review Report

**Output:**
```typescript
{
  generatedAt: string;
  organization: {
    id: string;
    name: string;
  };
  summary: {
    totalUsers: number;
    totalRoles: number;
    totalPolicies: number;
    totalWorkspaces: number;
  };
  users: Array<{
    id: string;
    email: string;
    isAdmin: boolean;
    isOrgOwner: boolean;
    roles: Array<{ id: string; name: string; }>;
    workspaces: Array<{ id: string; name: string; role: string; }>;
    lastActivity: string | null;
  }>;
  roles: Array<{
    id: string;
    name: string;
    isAdmin: boolean;
    userCount: number;
  }>;
  policies: Array<{
    id: string;
    slug: string;
    effect: string;
    enabled: boolean;
    toolPatterns: string[];
  }>;
}
```
