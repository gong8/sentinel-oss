# SENTINEL Data Models

> **Canonical source**: `packages/db/prisma/schema.prisma`

This document provides comprehensive documentation of all 49 database models and 30+ enums in the SENTINEL system. Models are organized by functional domain.

---

## Table of Contents

1. [Core Entities](#core-entities) - Organization, User, Role, UserRole
2. [Protocol & Agent](#protocol--agent) - Agent, A2ACredential, PublisherRegistry
3. [MCP Server](#mcp-server) - McpServer, McpTool, OAuth entities, UserMcpConfig
4. [Policy & Testing](#policy--testing) - Policy, PolicyTest, PolicyAssertion
5. [Audit & Logging](#audit--logging) - AuditLogEntry, AdminActionLog
6. [Permission & Request](#permission--request) - PermissionRequest, SensitiveToolFlag, related models
7. [Webhook](#webhook) - WebhookEndpoint, WebhookDelivery
8. [Agent Assistant](#agent-assistant) - AgentConversation, AgentMessage, AgentConfirmation
9. [Admin MCP](#admin-mcp) - AdminMcpConfirmation
10. [Session & Context](#session--context) - Session, SessionContextEntry
11. [Global Variables](#global-variables) - GlobalVariableNamespace, GlobalVariableField
12. [Tool Parameters](#tool-parameters) - ToolParamValue, OrganizationSettings
13. [LLM Usage](#llm-usage) - LlmUsageLog
14. [Enterprise Workspace](#enterprise-workspace) - Workspace, WorkspaceMember, ownership models
15. [Workspace Chat](#workspace-chat) - Chat settings, conversations, messages, usage
16. [User Onboarding](#user-onboarding) - UserOnboarding
17. [Enums Reference](#enums-reference) - All 30+ enums

---

## Core Entities

### Organization

Multi-tenant root entity. All resources are scoped to an organization.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `name` | String | Organization display name |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `adminMcpEnabled` | Boolean | Enable Admin MCP server (default: true) |
| `adminMcpEnabledScopes` | String[] | Allowed scopes: ["POLICIES", "USERS", etc.] |
| `adminMcpAllowedAdmins` | String[] | User IDs allowed (empty = all admins) |
| `adminMcpRateLimitPerMin` | Int | Rate limit for Admin MCP (default: 30) |
| `adminMcpConfirmationTtl` | Int | Confirmation TTL in seconds (default: 300) |

**Relations**: users, mcpServers, policies, policyTests, policyAssertions, auditLogEntries, agents, roles, adminActionLogs, oauthClientRegistrations, orgMcpOAuthTokens, sensitiveToolFlags, sensitiveApprovalRequests, sensitiveRateLimitUsage, webhookEndpoints, publisherRegistries, a2aCredentials, agentConversations, sessions, toolParamValues, settings, llmUsageLogs, adminMcpConfirmations, globalVariableNamespaces, workspaces, orgOwners, ownershipTransfers, policyProposals, ownerRecoveryRequests, policyExceptionRequests

**Indexes**: `createdAt`

---

### User

Human users with soft delete support.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `email` | String | Unique email address |
| `accessToken` | String | Unique API access token |
| `organizationId` | String | FK to Organization |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `lastActivityAt` | DateTime? | Last API/MCP request timestamp |
| `deletedAt` | DateTime? | Soft delete timestamp (NULL = active) |
| `deletedBy` | String? | Admin user ID who deleted |
| `orgRole` | OrgRole | OWNER or MEMBER (default: MEMBER) |

**Relations**: organization, userRoles, mcpConfigs, auditLogEntries, permissionRequests, adminActions, orgOAuthConnections, createdSensitiveFlags, approvalRequestsMade, approvalsGiven, agentConversations, adminMcpConfirmations (3 relations), workspaceMemberships, orgOwnership, ownershipTransfers, policyProposals, policyExceptions, llmConfigs, workspaceChatConversations, workspaceChatUsage, onboarding

**Indexes**: `organizationId`, `email`, `accessToken`, `[organizationId, deletedAt]`

**Constraints**: `email` UNIQUE, `accessToken` UNIQUE

---

### Role

Organizational roles with soft delete. Roles marked `isAdmin` bypass normal policy checks.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `name` | String | Role name (unique per org) |
| `isAdmin` | Boolean | Admin bypass flag (default: false) |
| `description` | String? | Optional description |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `deletedBy` | String? | Admin user ID who deleted |

**Relations**: organization, userRoles

**Indexes**: `organizationId`, `isAdmin`, `[organizationId, deletedAt]`

**Constraints**: `[organizationId, name]` UNIQUE

---

### UserRole

Join table for User-to-Role many-to-many relationship.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `userId` | String | FK to User |
| `roleId` | String | FK to Role |
| `createdAt` | DateTime | Assignment timestamp |

**Relations**: user, role

**Indexes**: `userId`, `roleId`

**Constraints**: `[userId, roleId]` UNIQUE

---

## Protocol & Agent

### Agent

MCP or A2A agents with identity attestation and workspace scoping.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `name` | String | Agent display name |
| `organizationId` | String | FK to Organization |
| `createdAt` | DateTime | Creation timestamp |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `deletedBy` | String? | Admin user ID who deleted |
| `protocolType` | ProtocolType | MCP or A2A (default: MCP) |
| `signatureVerified` | Boolean | Identity verification status |
| `signatureVerifiedAt` | DateTime? | When verification occurred |
| `publicKeyUrl` | String? | JWKS endpoint URL |
| `publicKeyCache` | Json? | Cached JWKS content |
| `publicKeyCachedAt` | DateTime? | When JWKS was cached |
| `cardSource` | AgentCardSource | URL or MANUAL (default: URL) |
| `agentCardUrl` | String? | A2A card fetch URL |
| `endpointUrl` | String? | Extracted from card.url |
| `agentCardCache` | Json? | Full Agent Card JSON |
| `agentCardFetchedAt` | DateTime? | Last fetch timestamp |
| `agentCardHash` | String? | SHA-256 for change detection |
| `workspaceId` | String? | FK to Workspace (null = org-wide) |

**Relations**: organization, workspace, auditLogEntries, a2aCredential, sensitiveOverrides, sensitiveApprovalRequests

**Indexes**: `organizationId`, `[organizationId, deletedAt]`, `[organizationId, protocolType]`, `workspaceId`

---

### A2ACredential

Agent-to-Agent protocol credentials (org-level).

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `agentId` | String | FK to Agent (unique) |
| `authType` | AuthType | NONE, API_KEY, OAUTH, or OIDC |
| `credentials` | String | Encrypted JSON blob |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization, agent

**Indexes**: `organizationId`

**Constraints**: `agentId` UNIQUE

---

### PublisherRegistry

Trusted agent publishers for identity attestation (public key registration).

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `name` | String | Publisher name (e.g., "Anthropic") |
| `publicKey` | String | PEM-encoded public key (encrypted) |
| `keyAlgorithm` | String | RS256, ES256, EdDSA, etc. |
| `keyFingerprint` | String | SHA-256 fingerprint for lookup |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `deletedBy` | String? | Admin user ID who deleted |

**Relations**: organization

**Indexes**: `organizationId`, `[organizationId, deletedAt]`

**Constraints**: `[organizationId, keyFingerprint]` UNIQUE

---

## MCP Server

### McpServer

Registered MCP servers with full transport configuration.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `name` | String | Server display name |
| `url` | String | Server URL |
| `authType` | McpAuthType | NONE, OAUTH, or API_KEY |
| `apiKey` | String? | Encrypted API key (org-level) |
| `credentials` | Json? | Encrypted JSON credentials |
| `authConfig` | Json? | API_KEY header/query templates |
| `transportType` | TransportType | HTTP, STDIO, SSE, WEBSOCKET (default: HTTP) |
| `stdioCommand` | String? | STDIO: command to execute |
| `stdioArgs` | Json? | STDIO: command arguments array |
| `stdioWorkingDir` | String? | STDIO: working directory |
| `stdioEnv` | String? | STDIO: encrypted env vars JSON |
| `wsReconnectMs` | Int? | WebSocket reconnect interval (default: 5000) |
| `wsMaxRetries` | Int? | WebSocket max retries (default: 3) |
| `wsHeartbeatMs` | Int? | WebSocket heartbeat (default: 30000) |
| `trusted` | Boolean | Bypass policy checks (default: false) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `deletedBy` | String? | Admin user ID who deleted |
| `workspaceId` | String? | FK to Workspace (null = org-wide) |

**Relations**: organization, workspace, tools, userConfigs, oauthClientRegistration, orgOAuthToken, toolParamValues

**Indexes**: `organizationId`, `trusted`, `[organizationId, deletedAt]`, `workspaceId`

---

### McpTool

Discovered tools from MCP servers.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `mcpServerId` | String | FK to McpServer |
| `name` | String | Tool name |
| `description` | String? | Tool description |
| `inputSchema` | Json? | JSON Schema from MCP tool definition |
| `discoveredAt` | DateTime | Discovery timestamp |

**Relations**: mcpServer

**Indexes**: `mcpServerId`

**Constraints**: `[mcpServerId, name]` UNIQUE

---

### OAuthClientRegistration

OAuth Dynamic Client Registration (DCR) results.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `mcpServerId` | String | FK to McpServer (unique) |
| `clientId` | String | OAuth client ID |
| `clientSecret` | String | Encrypted client secret |
| `redirectUri` | String? | Redirect URI for consistency |
| `authorizationEndpoint` | String | OAuth authorization URL |
| `tokenEndpoint` | String | OAuth token URL |
| `registrationEndpoint` | String? | DCR endpoint (if available) |
| `revocationEndpoint` | String? | Token revocation endpoint |
| `scopesSupported` | String[] | Supported OAuth scopes |
| `grantTypesSupported` | String[] | Supported grant types |
| `discoveredAt` | DateTime | When endpoints were discovered |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization, mcpServer

**Indexes**: `organizationId`

**Constraints**: `mcpServerId` UNIQUE

---

### OAuthState

PKCE state storage for OAuth flows (10-minute expiry).

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `state` | String | CSRF token (unique, cryptographically random) |
| `userId` | String | Initiating user ID |
| `mcpServerId` | String | Target MCP server |
| `codeVerifier` | String | PKCE code_verifier (64 random bytes) |
| `resource` | String | RFC 8707 resource URL |
| `returnUrl` | String? | Post-OAuth redirect URL |
| `isOrgLevel` | Boolean | Org-level vs personal connection |
| `expiresAt` | DateTime | 10-minute expiry |
| `createdAt` | DateTime | Creation timestamp |

**Indexes**: `state`, `expiresAt`

**Constraints**: `state` UNIQUE

---

### UserMcpConfig

Per-user OAuth tokens and credentials for MCP servers.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `userId` | String | FK to User |
| `mcpServerId` | String | FK to McpServer |
| `apiKey` | String? | Encrypted user-level API key |
| `credentials` | Json | Encrypted legacy/custom credentials |
| `accessToken` | String? | Encrypted OAuth access token |
| `refreshToken` | String? | Encrypted OAuth refresh token |
| `tokenType` | String? | Usually "Bearer" |
| `tokenExpiresAt` | DateTime? | Access token expiry |
| `tokenScope` | String? | Granted OAuth scopes |
| `lastRefreshedAt` | DateTime? | Last token refresh |
| `authenticatedAt` | DateTime? | Initial auth timestamp |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: user, mcpServer

**Indexes**: `userId`, `mcpServerId`

**Constraints**: `[userId, mcpServerId]` UNIQUE

---

### OrgMcpOAuthToken

Organization-level OAuth tokens for MCP servers.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `mcpServerId` | String | FK to McpServer (unique) |
| `accessToken` | String | Encrypted access token |
| `refreshToken` | String? | Encrypted refresh token |
| `tokenType` | String | Token type (default: "Bearer") |
| `tokenExpiresAt` | DateTime? | Access token expiry |
| `tokenScope` | String? | Granted OAuth scopes |
| `lastRefreshedAt` | DateTime? | Last token refresh |
| `connectedBy` | String? | Admin user ID who connected |
| `authenticatedAt` | DateTime | Initial auth timestamp |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization, mcpServer, connectedByUser

**Indexes**: `organizationId`

**Constraints**: `mcpServerId` UNIQUE

---

## Policy & Testing

### Policy

ALLOW/DENY rules with matchers, conditions, and workspace scoping.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `slug` | String | URL-friendly identifier |
| `matchers` | String[] | e.g., ["role:admin", "user:alice@example.com"] |
| `toolPatterns` | String[] | e.g., ["notion.com::createPage", "github.com::*"] |
| `effect` | PolicyEffect | ALLOW or DENY |
| `description` | String | Policy description |
| `enabled` | Boolean | Active status (default: true) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `conditions` | Json? | PolicyCondition[] for SIMPLE mode |
| `conditionMode` | ConditionMode | SIMPLE or ADVANCED (default: SIMPLE) |
| `conditionExpression` | Json? | Advanced SQL-like expression |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `deletedBy` | String? | Admin user ID who deleted |
| `workspaceId` | String? | FK to Workspace (null = org-wide) |

**Relations**: organization, workspace, linkedRequests, createdFromProposals, exceptionRequestsTarget, exceptionRequestsResult

**Indexes**: `organizationId`, `enabled`, `[organizationId, deletedAt]`, `workspaceId`

**Constraints**: `[organizationId, slug]` UNIQUE

---

### PolicyTest

Test results with full policy snapshots.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `createdById` | String | Admin who created the test |
| `toolName` | String | Tool being tested |
| `userId` | String? | User being tested |
| `agentId` | String? | Agent being tested |
| `decision` | String | ALLOWED or DENIED |
| `justification` | String? | Decision explanation |
| `matchedPolicyIds` | String[] | Policies that matched |
| `allEnabledPolicyIds` | String[] | All enabled policies at test time |
| `policySnapshot` | Json | Full snapshot of all policies |
| `userEmail` | String? | User email at test time |
| `userRoles` | String[] | User roles at test time |
| `agentName` | String? | Agent name at test time |
| `toolParameters` | Json? | Parameters used in test |
| `contextOverrides` | Json? | Override context values |
| `extractedContext` | Json? | Extracted context (sql, github, file) |
| `extractedMode` | String? | 'auto' or 'manual' |
| `createdAt` | DateTime | Creation timestamp |

**Relations**: organization

**Indexes**: `organizationId`, `createdById`, `createdAt`

---

### PolicyAssertion

Reusable test assertions with source tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `createdById` | String | Admin who created |
| `name` | String | Human-readable name (unique per org) |
| `description` | String? | Optional description |
| `toolPattern` | String | e.g., "github.com::createPR" |
| `contextType` | AssertionContextType | USER, AGENT, ROLE, or WILDCARD |
| `userId` | String? | For USER context |
| `agentId` | String? | For AGENT context |
| `roleName` | String? | For ROLE context |
| `expectedDecision` | String | "ALLOWED" or "DENIED" |
| `toolParameters` | Json? | Specific params to test with |
| `contextOverrides` | Json? | Fixed context values |
| `extractedContext` | Json? | Fixed extracted values |
| `extractedMode` | String? | 'auto' or 'manual' |
| `parameterMode` | String | 'exact', 'subset', or 'ignore' (default: 'exact') |
| `source` | AssertionSource | MANUAL, PLAYGROUND, or AUDIT_LOG |
| `sourceId` | String? | PlaygroundTest or AuditLogEntry ID |
| `lastRunAt` | DateTime? | Last execution time |
| `lastRunPassed` | Boolean? | Did actual match expected |
| `lastRunDecision` | String? | Actual decision |
| `lastRunJustification` | String? | Decision explanation |
| `lastRunPolicyIds` | String[] | Matching policies |
| `lastRunSubResults` | Json? | Sub-results for ROLE/wildcard |
| `enabled` | Boolean | Active status (default: true) |
| `failureCount` | Int | Historical failure count |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization

**Indexes**: `organizationId`, `enabled`, `lastRunPassed`, `source`

**Constraints**: `[organizationId, name]` UNIQUE

---

## Audit & Logging

### AuditLogEntry

Complete tool invocation audit with evaluation tree and pipeline stages.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `userId` | String? | FK to User |
| `agentId` | String? | FK to Agent |
| `workspaceId` | String? | FK to Workspace |
| `toolName` | String | Fully qualified: "notion.com::createPage" |
| `parameters` | Json | Tool call parameters |
| `decision` | AuditDecision | ALLOWED or DENIED |
| `justification` | String? | Denial explanation |
| `policyIds` | String[] | Contributing policy IDs |
| `timestamp` | DateTime | When the call occurred |
| `matchedPolicyIds` | String[] | Policies that matched |
| `policySnapshot` | Json? | All enabled policies at evaluation |
| `userEmail` | String? | User email (historical accuracy) |
| `userRoles` | String[] | User roles (historical accuracy) |
| `agentName` | String? | Agent name (historical accuracy) |
| `mcpServerName` | String? | Server name (display after deletion) |
| `toolNameDisplay` | String? | "ServerName::toolName" format |
| `approvalRequired` | Boolean | Required live approval (default: false) |
| `approvalRequestId` | String? | Link to approval request |
| `approvalStatus` | String? | APPROVED, DENIED, EXPIRED, CANCELLED |
| `approvalDecidedBy` | String? | User ID who decided |
| `approvalDecidedByEmail` | String? | Email for display |
| `approvalDecidedAt` | DateTime? | Decision timestamp |
| `pipelineStage` | String? | Final stage reached |
| `interruptedAt` | String? | Where processing stopped |
| `interruptionReason` | String? | Why it stopped |
| `trustCheckPassed` | Boolean? | Server trust check result |
| `serverTrusted` | Boolean? | Was server trusted |
| `policyCheckPassed` | Boolean? | Policy check result |
| `flagCheckPassed` | Boolean? | Flag check result |
| `matchedFlagIds` | String[] | IDs of matching flags |
| `flagBehaviors` | String[] | Behaviors of matched flags |
| `rateLimitHit` | Boolean? | Was rate limit hit |
| `evaluationTree` | Json? | Complete evaluation tree |

**Relations**: organization, user, agent, workspace

**Indexes**: `organizationId`, `userId`, `agentId`, `timestamp`, `decision`, `toolName`, `userEmail`, `agentName`, `workspaceId`

---

### AdminActionLog

Administrative action audit with 50+ action types and MCP source tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `adminUserId` | String? | Admin who performed action |
| `actionType` | AdminActionType | One of 50+ action types |
| `resourceType` | AdminResourceType | One of 30+ resource types |
| `resourceId` | String? | Affected resource ID |
| `resourceName` | String? | Human-readable resource name |
| `actionDetails` | Json | Action-specific data |
| `beforeSnapshot` | Json? | Resource state before action |
| `afterSnapshot` | Json? | Resource state after action |
| `ipAddress` | String? | Admin IP address |
| `userAgent` | String? | Browser user agent |
| `reason` | String? | Action reason/note |
| `source` | AdminActionSource | UI, MCP_ADMIN, API, or SYSTEM |
| `mcpSessionId` | String? | MCP session identifier |
| `mcpToolName` | String? | MCP tool name |
| `confirmationId` | String? | Confirmation reference |
| `confirmedByUserId` | String? | Who confirmed |
| `confirmedAt` | DateTime? | Confirmation timestamp |
| `workspaceId` | String? | FK to Workspace |
| `requestHeaders` | Json? | Sanitized HTTP headers |
| `referrer` | String? | HTTP referrer |
| `sessionFingerprint` | String? | Session tracking hash |
| `requestPath` | String? | API endpoint path |
| `changeDiff` | Json? | Field-level change diff |
| `diffSummary` | String? | Human-readable diff |
| `relatedResources` | Json? | Related resource refs |
| `actionStage` | String? | initiated/confirmed/executed/etc |
| `correlationId` | String? | Group related actions |
| `timestamp` | DateTime | When action occurred |

**Relations**: organization, adminUser, workspace

**Indexes**: `organizationId`, `adminUserId`, `actionType`, `resourceType`, `resourceId`, `timestamp`, `source`, `mcpSessionId`, `[organizationId, workspaceId]`, `correlationId`, `[organizationId, resourceType, resourceId, timestamp]`

---

## Permission & Request

### PermissionRequest

User requests for tool access, MCP server registration, or DENY removal.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `userId` | String | FK to User |
| `type` | PermissionRequestType | TOOL_ACCESS, MCP_SERVER, or DENY_REMOVAL |
| `status` | PermissionRequestStatus | PENDING, APPROVED, DENIED, WITHDRAWN, MODIFIED |
| `reason` | String | Request justification |
| `toolNames` | String[] | Tools being requested |
| `data` | Json? | Additional data (e.g., MCP server config) |
| `reviewedBy` | String? | Admin who reviewed |
| `reviewedAt` | DateTime? | Review timestamp |
| `reviewNote` | String? | Review comment |
| `linkedPolicyId` | String? | Policy resolving request |
| `grantDiff` | Json? | Diff for MODIFIED status |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: user, linkedPolicy, chatMessages

**Indexes**: `userId`, `status`, `createdAt`, `linkedPolicyId`

---

### SensitiveToolFlag

Tool risk classification with configurable behaviors.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `toolPattern` | String | e.g., "github.com::*" |
| `behaviors` | SensitiveFlagBehavior[] | REQUIRE_APPROVAL, RATE_LIMIT, ALERT |
| `rateLimitConfig` | Json? | { maxPerSession, windowMinutes } |
| `approvalConfig` | Json? | { allowedApprovers, timeoutSeconds } |
| `alertConfig` | Json? | { webhookEndpointIds } |
| `description` | String? | Flag description |
| `enabled` | Boolean | Active status (default: true) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `createdBy` | String? | User who created |

**Relations**: organization, creator, agentOverrides

**Indexes**: `[organizationId, enabled]`

**Constraints**: `[organizationId, toolPattern]` UNIQUE

---

### SensitiveFlagAgentOverride

Per-agent exceptions to sensitive flags.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `sensitiveToolFlagId` | String | FK to SensitiveToolFlag |
| `agentId` | String | FK to Agent |
| `behaviors` | SensitiveFlagBehavior[] | Override behaviors (empty = inherit) |
| `rateLimitConfig` | Json? | Override rate limit |
| `approvalConfig` | Json? | Override approval config |
| `exempted` | Boolean | Skip flag entirely (default: false) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: sensitiveToolFlag, agent

**Indexes**: `agentId`

**Constraints**: `[sensitiveToolFlagId, agentId]` UNIQUE

---

### SensitiveFlagApprovalRequest

Live approval requests for sensitive tool invocations.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `sessionId` | String | MCP session ID |
| `userId` | String | FK to User |
| `agentId` | String? | FK to Agent |
| `toolName` | String | Tool requiring approval |
| `parameters` | Json | Sanitized parameters |
| `type` | ApprovalType | SENSITIVE_FLAG |
| `status` | ApprovalRequestStatus | PENDING, APPROVED, DENIED, EXPIRED, CANCELLED |
| `approvedBy` | String? | User who approved |
| `approvedAt` | DateTime? | Approval timestamp |
| `deniedReason` | String? | Denial explanation |
| `expiresAt` | DateTime | Request expiry |
| `createdAt` | DateTime | Creation timestamp |

**Relations**: organization, user, approver, agent

**Indexes**: `[organizationId, status]`, `[organizationId, type, status]`, `sessionId`, `[userId, status]`, `expiresAt`

---

### SensitiveFlagRateLimitUsage

Rate limit tracking per session and tool pattern.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `sessionId` | String | MCP session ID |
| `toolPattern` | String | Pattern being rate limited |
| `windowStart` | DateTime | Rate limit window start |
| `windowEnd` | DateTime | Rate limit window end |
| `invocationCount` | Int | Call count in window |
| `lastInvocation` | DateTime | Last call timestamp |

**Relations**: organization

**Indexes**: `windowEnd`

**Constraints**: `[sessionId, toolPattern, windowStart]` UNIQUE

---

## Webhook

### WebhookEndpoint

Notification destinations with type-specific configuration.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `name` | String | Endpoint display name |
| `type` | WebhookEndpointType | CUSTOM, DISCORD, SLACK, or EMAIL |
| `url` | String? | Webhook URL (not used for EMAIL) |
| `events` | WebhookEvent[] | Subscribed events |
| `secret` | String? | HMAC secret (CUSTOM only) |
| `enabled` | Boolean | Active status (default: true) |
| `config` | Json? | Type-specific config (email recipients, etc.) |
| `verbose` | Boolean | Include detailed context (default: false) |
| `maxRetries` | Int | Max delivery retries (default: 3) |
| `retryDelayMs` | Int | Retry delay in ms (default: 1000) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `createdBy` | String? | User who created |

**Relations**: organization, deliveries

**Indexes**: `[organizationId, enabled]`

---

### WebhookDelivery

Delivery tracking with retry management.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `endpointId` | String | FK to WebhookEndpoint |
| `event` | WebhookEvent | Event being delivered |
| `payload` | Json | Webhook payload |
| `responseStatus` | Int? | HTTP response code |
| `responseBody` | String? | Response body |
| `deliveredAt` | DateTime? | Successful delivery time |
| `failedAt` | DateTime? | Failure timestamp |
| `retryCount` | Int | Retry attempts (default: 0) |
| `nextRetryAt` | DateTime? | Next retry scheduled |
| `createdAt` | DateTime | Creation timestamp |

**Relations**: endpoint

**Indexes**: `endpointId`, `nextRetryAt`

---

## Agent Assistant

### AgentConversation

AI assistant conversations for dashboard chat or MCP agents.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `userId` | String? | Dashboard user (null for MCP agent) |
| `mcpAgentId` | String? | External MCP agent (null for dashboard) |
| `title` | String? | Conversation title |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization, user, messages, confirmations

**Indexes**: `[organizationId, userId]`, `[organizationId, mcpAgentId]`, `createdAt`

---

### AgentMessage

Individual messages in agent conversations.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `conversationId` | String | FK to AgentConversation |
| `role` | AgentMessageRole | USER, ASSISTANT, TOOL_USE, or TOOL_RESULT |
| `content` | String | Text content or tool description |
| `toolName` | String? | Tool name for TOOL_USE/TOOL_RESULT |
| `toolInput` | Json? | Tool input parameters |
| `toolResult` | Json? | Tool result data |
| `createdAt` | DateTime | Creation timestamp |

**Relations**: conversation

**Indexes**: `conversationId`, `createdAt`

---

### AgentConfirmation

Pending action confirmations for agent assistant.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | Organization context |
| `conversationId` | String? | For dashboard chat |
| `mcpSessionId` | String? | For MCP access |
| `toolName` | String | Tool to execute |
| `toolInput` | Json | Input parameters |
| `description` | String | Human-readable description |
| `status` | AgentConfirmationStatus | PENDING, CONFIRMED, CANCELLED, EXPIRED |
| `confirmedAt` | DateTime? | Confirmation timestamp |
| `confirmedBy` | String? | User who confirmed |
| `executedAt` | DateTime? | Execution timestamp |
| `result` | Json? | Execution result |
| `error` | String? | Error message if failed |
| `createdAt` | DateTime | Creation timestamp |
| `expiresAt` | DateTime | Auto-expire TTL |

**Relations**: conversation

**Indexes**: `[organizationId, status]`, `conversationId`, `expiresAt`

---

## Admin MCP

### AdminMcpConfirmation

Admin MCP server confirmations with risk levels.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `mcpSessionId` | String | MCP session identifier |
| `adminUserId` | String | Admin making request |
| `toolName` | String | e.g., "admin_create_policy" |
| `toolInput` | Json | Full validated input |
| `scope` | String | AdminMcpScope enum value |
| `description` | String | Human-readable action description |
| `riskLevel` | String | LOW, MEDIUM, or HIGH |
| `status` | AdminMcpConfirmationStatus | PENDING, CONFIRMED, REJECTED, EXPIRED, EXECUTED, FAILED |
| `expiresAt` | DateTime | Confirmation expiry |
| `confirmedAt` | DateTime? | Confirmation timestamp |
| `confirmedBy` | String? | User who confirmed |
| `rejectedAt` | DateTime? | Rejection timestamp |
| `rejectedBy` | String? | User who rejected |
| `rejectionReason` | String? | Rejection explanation |
| `executedAt` | DateTime? | Execution timestamp |
| `result` | Json? | Execution result |
| `error` | String? | Error message if failed |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization, adminUser, confirmer, rejecter

**Indexes**: `[organizationId, status]`, `mcpSessionId`, `adminUserId`, `expiresAt`

---

## Session & Context

### Session

MCP session tracking with termination support.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `externalSessionId` | String | Maps to MCP sessionId string |
| `userId` | String? | Associated user |
| `agentId` | String? | Associated agent |
| `status` | SessionStatus | ACTIVE, EXPIRED, or TERMINATED |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `lastActivityAt` | DateTime | Last activity (default: now) |
| `expiresAt` | DateTime | 24-hour expiry by default |
| `terminatedAt` | DateTime? | Termination timestamp |
| `terminatedBy` | String? | Admin who terminated |
| `contextSummary` | String? | Rolling LLM-generated summary |
| `toolCallCount` | Int | Tool calls in session (default: 0) |

**Relations**: organization, contextEntries

**Indexes**: `organizationId`, `expiresAt`, `status`

**Constraints**: `[organizationId, externalSessionId]` UNIQUE

---

### SessionContextEntry

Context tracking for session-aware policy evaluation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `sessionId` | String | FK to Session |
| `entryType` | SessionContextEntryType | USER_INTENT, DATA_ACCESSED, RISK_SIGNAL, TOOL_OUTCOME, AGENT_OBSERVATION |
| `createdAt` | DateTime | Creation timestamp |
| `key` | String | Context key |
| `value` | Json | Context value |
| `summary` | String? | LLM-generated summary |
| `importance` | Float | Pruning priority 0.0-1.0 (default: 0.5) |
| `sourceToolName` | String? | Tool that created entry |
| `expiresAt` | DateTime? | Entry expiry |

**Relations**: session

**Indexes**: `sessionId`, `[sessionId, entryType]`, `importance`

---

## Global Variables

### GlobalVariableNamespace

Namespaces for organizing global variables with workspace scoping.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `workspaceId` | String? | FK to Workspace (null = org-wide) |
| `name` | String | Namespace name (e.g., "COMPANY", "LIMITS") |
| `description` | String? | Namespace description |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `createdBy` | String? | User who created |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `deletedBy` | String? | Admin who deleted |

**Relations**: organization, workspace, fields

**Indexes**: `organizationId`, `[organizationId, deletedAt]`, `workspaceId`

**Constraints**: `[organizationId, workspaceId, name]` UNIQUE

---

### GlobalVariableField

Individual fields within namespaces.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `namespaceId` | String | FK to GlobalVariableNamespace |
| `name` | String | Field name (e.g., "creationDate") |
| `description` | String? | Field description |
| `fieldType` | GlobalVariableFieldType | STRING, NUMBER, BOOLEAN, DATE, STRING_ARRAY, NUMBER_ARRAY |
| `value` | Json | Field value |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: namespace

**Indexes**: `namespaceId`

**Constraints**: `[namespaceId, name]` UNIQUE

---

## Tool Parameters

### ToolParamValue

Historical parameter values for policy condition suggestions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `serverId` | String | FK to McpServer |
| `toolName` | String? | For reference (not in unique constraint) |
| `parameterKey` | String | e.g., "recipient", "query" |
| `parameterValue` | String | The actual value |
| `displayLabel` | String? | Human-readable label |
| `occurrenceCount` | Int | Times seen (default: 1) |
| `firstSeenAt` | DateTime | First occurrence |
| `lastSeenAt` | DateTime | Most recent occurrence |

**Relations**: organization, mcpServer

**Indexes**: `[organizationId, serverId]`, `[organizationId, serverId, parameterKey]`, `lastSeenAt`

**Constraints**: `[organizationId, serverId, parameterKey, parameterValue]` UNIQUE

---

### OrganizationSettings

Organization-level configuration including LLM settings.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization (unique) |
| `defaultTimezone` | String | Default timezone (default: "UTC") |
| `paramHistoryRetentionDays` | Int | Param history retention (default: 90) |
| `auditLogRetentionDays` | Int | Audit log retention (default: 90) |
| `defaultConditionMode` | ConditionMode | SIMPLE or ADVANCED (default: SIMPLE) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `llmProvider` | String | auto, gemini, claude, openai, ollama, lmstudio, custom |
| `llmModel` | String? | Override default model |
| `llmApiKey` | String? | Encrypted API key |
| `llmBaseUrl` | String? | Custom endpoint URL |
| `llmMaxTokens` | Int | Max tokens (default: 4096) |
| `llmTemperature` | Float | Temperature (default: 0.7) |

**Relations**: organization

**Constraints**: `organizationId` UNIQUE

---

## LLM Usage

### LlmUsageLog

LLM usage tracking with cost estimation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `sessionId` | String? | Related session |
| `provider` | String | gemini, claude, openai, etc. |
| `model` | String | Model identifier |
| `inputTokens` | Int | Input token count |
| `outputTokens` | Int | Output token count |
| `totalTokens` | Int | Total tokens |
| `estimatedCostCents` | Int? | Cost estimate (null for local) |
| `requestType` | String? | agent, policy, chat, etc. |
| `createdAt` | DateTime | Creation timestamp |

**Relations**: organization

**Indexes**: `[organizationId, createdAt]`, `[organizationId, provider]`

---

## Enterprise Workspace

### Workspace

Enterprise workspaces with soft delete.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `name` | String | Workspace name |
| `slug` | String | URL-friendly identifier |
| `description` | String? | Workspace description |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `deletedBy` | String? | Admin who deleted |

**Relations**: organization, members, policies, mcpServers, agents, globalVariableNamespaces, adminActionLogs, policyExceptionRequests, chatSettings, chatConversations, chatUsage, userLlmConfigs, auditLogs

**Indexes**: `organizationId`, `[organizationId, deletedAt]`

**Constraints**: `[organizationId, name]` UNIQUE, `[organizationId, slug]` UNIQUE

---

### WorkspaceMember

Workspace membership with roles.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `workspaceId` | String | FK to Workspace |
| `userId` | String | FK to User |
| `role` | WorkspaceMemberRole | MEMBER or ADMIN (default: MEMBER) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: workspace, user

**Indexes**: `workspaceId`, `userId`

**Constraints**: `[workspaceId, userId]` UNIQUE

---

### OrgOwner

Organization ownership tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `userId` | String | FK to User |
| `addedAt` | DateTime | When added as owner |
| `addedBy` | String? | User who added (null for initial) |

**Relations**: organization, user, addedByUser

**Indexes**: `organizationId`, `userId`, `addedBy`

**Constraints**: `[organizationId, userId]` UNIQUE

---

### OwnershipTransfer

Ownership transfer flow with expiry.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `fromUserId` | String | Current owner initiating |
| `toUserId` | String | User receiving ownership |
| `status` | OwnershipTransferStatus | PENDING, ACCEPTED, DECLINED, EXPIRED |
| `expiresAt` | DateTime | Transfer expiry |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `resolvedAt` | DateTime? | Resolution timestamp |
| `resolvedBy` | String? | Who resolved |

**Relations**: organization, fromUser, toUser

**Indexes**: `[organizationId, status]`, `[toUserId, status]`, `expiresAt`

---

### OrgWidePolicyProposal

Workspace admin proposals for org-wide policies.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `workspaceId` | String | Proposing workspace |
| `proposedById` | String | User who proposed |
| `matchers` | String[] | Proposed matchers |
| `toolPatterns` | String[] | Proposed tool patterns |
| `effect` | PolicyEffect | ALLOW or DENY |
| `description` | String | Policy description |
| `conditions` | Json? | Policy conditions |
| `justification` | String | Why org-wide policy needed |
| `status` | PolicyProposalStatus | PENDING, APPROVED, REJECTED |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `reviewedAt` | DateTime? | Review timestamp |
| `reviewedBy` | String? | Org owner who reviewed |
| `reviewNote` | String? | Review comment |
| `createdPolicyId` | String? | Policy ID if approved |

**Relations**: organization, proposedBy, reviewer, createdPolicy

**Indexes**: `[organizationId, status]`, `workspaceId`, `proposedById`

---

### OwnerRecoveryRequest

Account recovery for organizations without owners.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `requestedByEmail` | String | Support agent email |
| `requestedByName` | String? | Support agent name |
| `requestedReason` | String | Recovery reason |
| `supportTicketId` | String? | Ticket reference |
| `targetUserEmail` | String | User to become owner |
| `targetUserId` | String? | Target user ID |
| `verificationToken` | String | Unique verification token |
| `verificationMethod` | String | Method (default: "email") |
| `verifiedAt` | DateTime? | Verification timestamp |
| `status` | OwnerRecoveryStatus | PENDING, APPROVED, DENIED, EXPIRED, CANCELLED |
| `expiresAt` | DateTime | 72-hour expiry |
| `approvedAt` | DateTime? | Approval timestamp |
| `approvedBy` | String? | Who approved |
| `deniedAt` | DateTime? | Denial timestamp |
| `deniedBy` | String? | Who denied |
| `deniedReason` | String? | Denial reason |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization

**Indexes**: `[organizationId, status]`, `verificationToken`

**Constraints**: `verificationToken` UNIQUE

---

### PolicyExceptionRequest

Workspace requests for policy exceptions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `organizationId` | String | FK to Organization |
| `workspaceId` | String | Requesting workspace |
| `policyId` | String? | Target policy (null for proposals) |
| `requestType` | PolicyExceptionType | PROPOSAL, REMOVAL_REQUEST, WORKSPACE_EXCEPTION |
| `requestedById` | String | User who requested |
| `proposedMatchers` | String[] | For PROPOSAL type |
| `proposedToolPatterns` | String[] | For PROPOSAL type |
| `proposedEffect` | PolicyEffect? | For PROPOSAL type |
| `proposedDescription` | String? | For PROPOSAL type |
| `justification` | String | Why exception needed |
| `status` | PolicyExceptionStatus | PENDING, APPROVED, DENIED, WITHDRAWN |
| `reviewedAt` | DateTime? | Review timestamp |
| `reviewedBy` | String? | Who reviewed |
| `reviewNote` | String? | Review comment |
| `resultPolicyId` | String? | Created/modified policy |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: organization, workspace, policy, requestedBy, reviewer, resultPolicy

**Indexes**: `[organizationId, status]`, `workspaceId`, `policyId`, `requestedById`

---

## Workspace Chat

### WorkspaceChatSettings

Chat configuration per workspace.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `workspaceId` | String | FK to Workspace (unique) |
| `enabled` | Boolean | Chat enabled (default: true) |
| `defaultLlmProvider` | LLMProvider? | Default provider |
| `defaultLlmModel` | String? | Default model |
| `systemPrompt` | String? | Custom system prompt (Text) |
| `monthlyMessageQuota` | Int? | Message limit |
| `monthlyTokenQuota` | Int? | Token limit |
| `adminChatVisibility` | Boolean | Admin can view chats (default: false) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: workspace

**Constraints**: `workspaceId` UNIQUE

---

### UserLLMConfig

User LLM provider configuration per workspace.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `userId` | String | FK to User |
| `workspaceId` | String | FK to Workspace |
| `provider` | LLMProvider | CLAUDE, OPENAI, or GEMINI |
| `apiKey` | String | Encrypted API key |
| `model` | String? | Model override |
| `alwaysAllowTools` | String[] | Auto-approved tools |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: user, workspace

**Indexes**: `userId`, `workspaceId`

**Constraints**: `[userId, workspaceId]` UNIQUE

---

### WorkspaceChatConversation

Chat conversations within workspaces.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `workspaceId` | String | FK to Workspace |
| `userId` | String | FK to User |
| `title` | String? | Conversation title |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: workspace, user, messages

**Indexes**: `[workspaceId, userId]`, `createdAt`

---

### WorkspaceChatMessage

Individual chat messages.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `conversationId` | String | FK to WorkspaceChatConversation |
| `role` | ChatMessageRole | USER, ASSISTANT, TOOL_USE, TOOL_RESULT, PERMISSION_REQUEST |
| `content` | String | Message content (Text) |
| `toolName` | String? | Tool name for tool messages |
| `toolInput` | Json? | Tool input parameters |
| `toolResult` | Json? | Tool result |
| `permissionRequestId` | String? | Linked permission request |
| `tokenCount` | Int? | Token usage |
| `createdAt` | DateTime | Creation timestamp |

**Relations**: conversation, permissionRequest

**Indexes**: `conversationId`, `createdAt`

---

### WorkspaceChatUsage

Monthly usage tracking per user per workspace.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `workspaceId` | String | FK to Workspace |
| `userId` | String | FK to User |
| `month` | DateTime | First of month |
| `messageCount` | Int | Messages sent (default: 0) |
| `inputTokens` | Int | Input tokens (default: 0) |
| `outputTokens` | Int | Output tokens (default: 0) |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: workspace, user

**Indexes**: `workspaceId`, `userId`

**Constraints**: `[workspaceId, userId, month]` UNIQUE

---

## User Onboarding

### UserOnboarding

User onboarding state tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (cuid) |
| `userId` | String | FK to User (unique) |
| `currentTourId` | String? | Active tour (null = none) |
| `currentStep` | Int | Current step (default: 0) |
| `completedTours` | String[] | Completed tour IDs |
| `completedSteps` | String[] | "tourId:stepId" format |
| `dismissed` | Boolean | User dismissed onboarding |
| `showAdvanced` | Boolean | Show advanced features |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

**Relations**: user

**Indexes**: `userId`

**Constraints**: `userId` UNIQUE

---

## Enums Reference

### Protocol Enums

```typescript
enum ProtocolType {
  MCP       // Model Context Protocol
  A2A       // Agent-to-Agent Protocol
}

enum AgentCardSource {
  URL       // Card auto-fetched from agentCardUrl
  MANUAL    // Card uploaded directly by admin
}

enum AuthType {
  NONE      // No authentication
  API_KEY   // API key authentication
  OAUTH     // OAuth 2.0
  OIDC      // OpenID Connect (for A2A)
}

enum TransportType {
  HTTP      // HTTP REST transport
  STDIO     // Standard I/O (subprocess)
  SSE       // Server-Sent Events
  WEBSOCKET // WebSocket connection
}

enum McpAuthType {
  NONE      // No authentication
  OAUTH     // OAuth 2.0
  API_KEY   // API key
}
```

### Policy Enums

```typescript
enum PolicyEffect {
  ALLOW     // Permit the action
  DENY      // Block the action (cannot be bypassed)
}

enum ConditionMode {
  SIMPLE    // Visual condition builder with flat array
  ADVANCED  // SQL-like expression language
}

enum AuditDecision {
  ALLOWED   // Action was permitted
  DENIED    // Action was blocked
}

enum AssertionSource {
  MANUAL     // Created manually by admin
  PLAYGROUND // Created from policy playground test
  AUDIT_LOG  // Created from audit log entry
}

enum AssertionContextType {
  USER      // Test against specific user
  AGENT     // Test against specific agent
  ROLE      // Test all users with role
  WILDCARD  // Test all applicable contexts
}
```

### Session Enums

```typescript
enum SessionStatus {
  ACTIVE     // Session is active
  EXPIRED    // Session expired naturally
  TERMINATED // Admin-initiated termination
}

enum SessionContextEntryType {
  USER_INTENT        // User's stated goal
  DATA_ACCESSED      // Data accessed in session
  RISK_SIGNAL        // Risk indicators
  TOOL_OUTCOME       // Tool execution results
  AGENT_OBSERVATION  // Agent-generated context
}
```

### Permission Enums

```typescript
enum PermissionRequestType {
  TOOL_ACCESS    // Request access to tools
  MCP_SERVER     // Request MCP server registration
  DENY_REMOVAL   // Request removal of DENY policy
}

enum PermissionRequestStatus {
  PENDING    // Awaiting review
  APPROVED   // Approved by admin
  DENIED     // Denied by admin
  WITHDRAWN  // Withdrawn by user
  MODIFIED   // Partially approved with modifications
}

enum ApprovalRequestStatus {
  PENDING    // Awaiting approval
  APPROVED   // Approved
  DENIED     // Denied
  EXPIRED    // Request expired
  CANCELLED  // Cancelled by user
}

enum ApprovalType {
  SENSITIVE_FLAG  // Sensitive tool flag approval
}

enum SensitiveFlagBehavior {
  REQUIRE_APPROVAL  // Block until approved
  RATE_LIMIT        // Enforce per-session rate limits
  ALERT             // Send webhook notification
}
```

### Admin Action Enums

```typescript
enum AdminActionSource {
  UI         // Dashboard UI action
  MCP_ADMIN  // Admin MCP server action
  API        // Direct API call
  SYSTEM     // System-generated action
}

enum AdminActionType {
  // User actions (7)
  USER_CREATE, USER_UPDATE, USER_DELETE, USER_RESTORE,
  USER_ROLES_UPDATE, USER_TOKEN_REFRESH, USER_TOKEN_REVOKE,

  // Role actions (4)
  ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE, ROLE_RESTORE,

  // Policy actions (7)
  POLICY_CREATE, POLICY_UPDATE, POLICY_DELETE, POLICY_RESTORE,
  POLICY_ENABLE, POLICY_DISABLE, POLICY_CONFLICT_RESOLVE,

  // MCP Server actions (10)
  MCP_SERVER_CREATE, MCP_SERVER_UPDATE, MCP_SERVER_DELETE,
  MCP_SERVER_RESTORE, MCP_SERVER_DISCOVER_TOOLS,
  MCP_SERVER_ORG_API_KEY_ADD, MCP_SERVER_ORG_API_KEY_UPDATE,
  MCP_SERVER_ORG_API_KEY_REMOVE,

  // OAuth actions (8)
  OAUTH_DISCOVER, OAUTH_CLIENT_REGISTER, OAUTH_CLIENT_CONFIGURE,
  OAUTH_FLOW_INITIATE, OAUTH_FLOW_COMPLETE, OAUTH_TOKEN_REFRESH,
  OAUTH_TOKEN_REVOKE, OAUTH_DISCONNECT,

  // Agent actions (6)
  AGENT_CREATE, AGENT_DELETE, AGENT_RESTORE, AGENT_VERIFY,
  AGENT_REFRESH_VERIFICATION, AGENT_TERMINATE,

  // Publisher actions (2)
  PUBLISHER_CREATE, PUBLISHER_DELETE,

  // A2A actions (6)
  A2A_AGENT_REGISTER, A2A_AGENT_UPDATE, A2A_AGENT_DELETE,
  A2A_CREDENTIAL_SET, A2A_CREDENTIAL_DELETE, A2A_CARD_REFRESH,
  A2A_CONNECTION_TEST,

  // Personal credentials actions (4)
  PERSONAL_API_KEY_SET, PERSONAL_API_KEY_REMOVE,
  PERSONAL_CREDENTIALS_SET, PERSONAL_CREDENTIALS_REMOVE,

  // Permission Request actions (4)
  PERMISSION_REQUEST_APPROVE, PERMISSION_REQUEST_DENY,
  DENY_POLICY_REMOVAL_APPROVE, DENY_POLICY_REMOVAL_DENY,

  // Organization actions (1)
  ORGANIZATION_UPDATE,

  // Sensitive flag actions (9)
  SENSITIVE_FLAG_CREATE, SENSITIVE_FLAG_UPDATE, SENSITIVE_FLAG_DELETE,
  SENSITIVE_OVERRIDE_CREATE, SENSITIVE_OVERRIDE_UPDATE, SENSITIVE_OVERRIDE_DELETE,
  SENSITIVE_APPROVAL_GRANTED, SENSITIVE_APPROVAL_DENIED, SENSITIVE_APPROVAL_CANCELLED,

  // Webhook actions (3)
  WEBHOOK_ENDPOINT_CREATE, WEBHOOK_ENDPOINT_UPDATE, WEBHOOK_ENDPOINT_DELETE,

  // Integration actions (6)
  INTEGRATION_CREATE, INTEGRATION_UPDATE, INTEGRATION_DELETE,
  INTEGRATION_ENABLE, INTEGRATION_DISABLE, INTEGRATION_TEST,

  // Global variable actions (7)
  GLOBAL_VAR_NAMESPACE_CREATE, GLOBAL_VAR_NAMESPACE_UPDATE,
  GLOBAL_VAR_NAMESPACE_DELETE, GLOBAL_VAR_NAMESPACE_RESTORE,
  GLOBAL_VAR_FIELD_CREATE, GLOBAL_VAR_FIELD_UPDATE, GLOBAL_VAR_FIELD_DELETE,

  // Workspace actions (10)
  WORKSPACE_CREATE, WORKSPACE_UPDATE, WORKSPACE_DELETE, WORKSPACE_RESTORE,
  WORKSPACE_MEMBER_ADD, WORKSPACE_MEMBER_REMOVE, WORKSPACE_MEMBER_ROLE_UPDATE,
  WORKSPACE_CHAT_SETTINGS_CREATE, WORKSPACE_CHAT_SETTINGS_UPDATE,

  // Organization owner actions (6)
  ORG_OWNER_ADD, ORG_OWNER_REMOVE, OWNERSHIP_TRANSFER_INITIATE,
  OWNERSHIP_TRANSFER_ACCEPT, OWNERSHIP_TRANSFER_DECLINE, OWNERSHIP_TRANSFER_CANCEL,

  // Policy proposal actions (3)
  POLICY_PROPOSAL_CREATE, POLICY_PROPOSAL_APPROVE, POLICY_PROPOSAL_REJECT,

  // Policy exception actions (4)
  POLICY_EXCEPTION_CREATE, POLICY_EXCEPTION_APPROVE,
  POLICY_EXCEPTION_DENY, POLICY_EXCEPTION_WITHDRAW,

  // Owner recovery actions (3)
  OWNER_RECOVERY_CREATE, OWNER_RECOVERY_CANCEL, OWNER_RECOVERY_DENY,

  // MCP confirmation actions (1)
  MCP_CONFIRMATION_REJECT
}

enum AdminResourceType {
  USER, ROLE, POLICY, MCP_SERVER, OAUTH_CLIENT, AGENT, PUBLISHER,
  USER_MCP_CONFIG, PERMISSION_REQUEST, ORGANIZATION,
  SENSITIVE_FLAG, SENSITIVE_OVERRIDE, SENSITIVE_APPROVAL,
  WEBHOOK_ENDPOINT, INTEGRATION, A2A_CREDENTIAL,
  GLOBAL_VAR_NAMESPACE, GLOBAL_VAR_FIELD,
  WORKSPACE, WORKSPACE_MEMBER, WORKSPACE_CHAT_SETTINGS,
  ORG_OWNER, OWNERSHIP_TRANSFER, POLICY_PROPOSAL, POLICY_EXCEPTION,
  OWNER_RECOVERY, MCP_CONFIRMATION
}
```

### Webhook Enums

```typescript
enum WebhookEvent {
  // Tool invocation events
  TOOL_INVOCATION_ALLOWED,
  TOOL_INVOCATION_DENIED,

  // Sensitive flag events
  SENSITIVE_TOOL_INVOKED,
  SENSITIVE_APPROVAL_NEEDED,
  SENSITIVE_RATE_LIMITED,

  // Policy events
  POLICY_CREATED,
  POLICY_UPDATED,
  POLICY_DELETED,

  // Agent events
  AGENT_CREATED,
  AGENT_DELETED,
  SESSION_TERMINATED
}

enum WebhookEndpointType {
  CUSTOM   // Raw JSON with HMAC signature
  DISCORD  // Discord-formatted embeds
  SLACK    // Slack-formatted blocks
  EMAIL    // Email notifications
}
```

### Confirmation Enums

```typescript
enum AgentConfirmationStatus {
  PENDING    // Awaiting confirmation
  CONFIRMED  // Confirmed by user
  CANCELLED  // Cancelled by user
  EXPIRED    // TTL expired
}

enum AdminMcpConfirmationStatus {
  PENDING    // Awaiting confirmation
  CONFIRMED  // Confirmed
  REJECTED   // Rejected
  EXPIRED    // TTL expired
  EXECUTED   // Successfully executed
  FAILED     // Execution failed
}
```

### Enterprise Workspace Enums

```typescript
enum OrgRole {
  OWNER   // Full org control, can manage other owners
  MEMBER  // Standard org member, access via workspaces
}

enum WorkspaceMemberRole {
  MEMBER  // Standard workspace member
  ADMIN   // Workspace admin, can manage workspace resources
}

enum OwnershipTransferStatus {
  PENDING   // Awaiting acceptance
  ACCEPTED  // Transfer accepted
  DECLINED  // Transfer declined
  EXPIRED   // Transfer expired
}

enum PolicyProposalStatus {
  PENDING   // Awaiting review
  APPROVED  // Approved by org owner
  REJECTED  // Rejected by org owner
}

enum PolicyExceptionType {
  PROPOSAL            // New global policy proposal
  REMOVAL_REQUEST     // Request to remove a global policy
  WORKSPACE_EXCEPTION // Request workspace-specific exception
}

enum PolicyExceptionStatus {
  PENDING    // Awaiting review
  APPROVED   // Exception approved
  DENIED     // Exception denied
  WITHDRAWN  // Withdrawn by requester
}

enum OwnerRecoveryStatus {
  PENDING    // Awaiting verification
  APPROVED   // Recovery approved
  DENIED     // Recovery denied
  EXPIRED    // Request expired
  CANCELLED  // Cancelled
}
```

### Chat Enums

```typescript
enum AgentMessageRole {
  USER        // User message
  ASSISTANT   // AI assistant response
  TOOL_USE    // Tool invocation
  TOOL_RESULT // Tool result
}

enum ChatMessageRole {
  USER               // User message
  ASSISTANT          // AI response
  TOOL_USE           // Tool invocation
  TOOL_RESULT        // Tool result
  PERMISSION_REQUEST // Permission request embedded
}

enum LLMProvider {
  CLAUDE   // Anthropic Claude
  OPENAI   // OpenAI GPT
  GEMINI   // Google Gemini
}

enum GlobalVariableFieldType {
  STRING       // Text value
  NUMBER       // Numeric value
  BOOLEAN      // True/false
  DATE         // Date/datetime
  STRING_ARRAY // Array of strings
  NUMBER_ARRAY // Array of numbers
}
```

---

## Key Relationships

- `User` -> `Organization` (belongs to one org, CASCADE delete)
- `Policy` -> `Organization` (scoped to org, CASCADE delete)
- `Agent` -> `Organization` (scoped to org, CASCADE delete)
- `McpServer` -> `Organization` (scoped to org, CASCADE delete)
- `AuditLogEntry` -> `Organization`, `User?`, `Agent?` (SetNull on user/agent delete)
- `Workspace` -> `Organization` (scoped to org, CASCADE delete)
- `WorkspaceMember` -> `Workspace`, `User` (CASCADE delete both)

## Important Constraints

- **All queries MUST be scoped to `organizationId`** - Multi-tenant isolation is critical
- **Credentials are encrypted with AES-256-GCM** before storage
- **DENY policies cannot be bypassed** - Even admin roles must respect explicit denials
- **Audit logs include snapshots** of policy/agent state at time of call
- **Soft delete uses `deletedAt`** - NULL means active, non-NULL means deleted
