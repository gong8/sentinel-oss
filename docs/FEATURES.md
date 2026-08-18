# SENTINEL Features Registry

> **Last Updated**: 2026-01-30
> **Version**: Phase 1

This document catalogs all implemented features in the SENTINEL platform.

---

## Table of Contents

- [Core Platform](#core-platform)
  - [Authentication & Authorization](#1-authentication--authorization)
  - [Policy Engine](#2-policy-engine)
  - [Sensitive Tool Flags](#3-sensitive-tool-flags)
  - [Agent Management](#4-agent-management)
  - [MCP Server Management](#5-mcp-server-management)
  - [Credentials & OAuth](#6-credentials--oauth)
  - [Permission Requests](#7-permission-requests)
  - [Audit Logging](#8-audit-logging)
  - [Webhooks](#9-webhooks)
  - [Policy Testing](#10-policy-testing--validation)
  - [Session Management](#11-session-management)
  - [Admin MCP Server](#12-admin-mcp-server)
  - [Tool Context & Parameters](#13-tool-context--parameter-extraction)
  - [Organization Settings](#14-organization-settings)
  - [Workspace Management](#15-workspace-management)
- [MCP Proxy](#mcp-proxy)
- [Frontend](#frontend)
  - [Admin Pages](#admin-pages)
  - [User Pages](#user-pages)
- [API](#api)
  - [Admin Routers](#admin-routers)
  - [User Routers](#user-routers)
  - [Proxy Router](#proxy-router)
  - [Agent Router](#agent-router)
- [Services](#services)
- [Database Models](#database-models)
- [Packages](#packages)

---

## Core Platform

### 1. Authentication & Authorization

| Feature | Description | Status |
|---------|-------------|--------|
| **Token-Based Auth** | 24-character tokens via `crypto.randomBytes(18)` base64url | ✅ |
| Bearer Token Auth | `Authorization: Bearer <token>` header or query param | ✅ |
| User Management | Create, update, soft-delete, restore users | ✅ |
| **Three-Tier Permissions** | Org-level roles, Org owner status, Workspace roles | ✅ |
| Role-Based Access Control | Custom roles with admin/user distinction | ✅ |
| User Role Assignment | Assign multiple roles to users | ✅ |
| Activity Tracking | Track user `lastActivityAt` timestamps | ✅ |
| Organization Scoping | All queries scoped to organization | ✅ |
| **Org Owner Status** | Special status granting full org control | ✅ |
| **Owner Recovery** | Support-initiated recovery with 72-hour verification | ✅ |
| **tRPC Procedures** | public, protected, admin, orgOwner, workspaceAdmin | ✅ |

### 2. Policy Engine

| Feature | Description | Status |
|---------|-------------|--------|
| **DENY-First Evaluation** | Any matching DENY blocks immediately | ✅ |
| **Fail-Closed Behavior** | Default deny, explicit allow required | ✅ |
| **Evaluation Pipeline** | REQUEST → TRUST_CHECK → POLICY_CHECK → FLAG_CHECK → EXECUTE | ✅ |
| **User Matchers** | `user:email`, `role:name`, `*` (wildcard) | ✅ |
| **Workspace Matchers** | `workspace:ID`, `workspace-admin:ID` | ✅ |
| **A2A Matchers** | `a2a-agent:*`, `a2a-provider:*`, `a2a-skill:*` | ✅ |
| **Agent Matchers** | `agent:ID`, `agent:*` | ✅ |
| **Tool Patterns** | `serverKey::toolName` fully qualified | ✅ |
| **A2A Tool Patterns** | `a2a::agentId::skillId` format | ✅ |
| Wildcard Support | `*::*` for all tools, `server::*` per server | ✅ |
| Policy Effects | ALLOW and DENY with descriptions | ✅ |
| Policy Enable/Disable | Toggle policy status | ✅ |
| Soft Deletes | Restore deleted policies | ✅ |
| Conflict Detection | Identify overlapping/conflicting policies | ✅ |
| **Deterministic Conditions** | JSON-based condition groups | ✅ |
| **SIMPLE Conditions** | Array of conditions with AND logic | ✅ |
| **ADVANCED Conditions** | SQL-like expression language with AST | ✅ |
| **18 Operators** | equals, contains, between, in, inCidr, matches (regex), etc. | ✅ |
| **Condition Fields** | time.*, network.*, params.*, sql.*, github.*, file.* | ✅ |
| **Delegation Support** | Agent + User both must have matching ALLOW | ✅ |
| **Policy Inheritance** | Workspace policies inherit from org-wide | ✅ |
| **Evaluation Trees** | Full audit trail of evaluation decisions | ✅ |
| **Policy Validation** | Matcher, tool pattern, and condition field validation | ✅ |
| **Slug Generation** | Deterministic slugs from policy attributes | ✅ |

### 3. Sensitive Tool Flags

| Feature | Description | Status |
|---------|-------------|--------|
| Tool Pattern Matching | Match tools with wildcard patterns | ✅ |
| **RATE_LIMIT Behavior** | Per-session windowed rate limiting | ✅ |
| **REQUIRE_APPROVAL Behavior** | Block until admin/self approval | ✅ |
| **ALERT Behavior** | Send webhook notifications | ✅ |
| Enhanced Audit | Always-on detailed logging for sensitive tools | ✅ |
| Agent Overrides | Per-agent behavior customization | ✅ |
| Agent Exemptions | Exempt specific agents from flags | ✅ |
| Configurable Limits | JSON configs for rate limits, timeouts | ✅ |
| **Approval Workflow** | PENDING → APPROVED/DENIED/EXPIRED/CANCELLED | ✅ |
| Self-Approval | Users can approve their own requests | ✅ |
| **Long-Polling** | 5-min max, 30-sec intervals for approval status | ✅ |

### 4. Agent Management

| Feature | Description | Status |
|---------|-------------|--------|
| MCP Agents | Traditional MCP protocol support | ✅ |
| A2A Agents | Agent-to-Agent protocol support | ✅ |
| Protocol Type Tracking | MCP vs A2A distinction | ✅ |
| **Sentinel Agent** | Built-in AI agent for admin operations | ✅ |
| **Multi-LLM Support** | OpenAI, Claude, Gemini with fallback | ✅ |
| **40+ Agent Tools** | Policies, users, roles, servers, analytics | ✅ |
| **Confirmation Workflow** | Write operations require user approval | ✅ |
| **Conversation Persistence** | Full message history storage | ✅ |
| **Smart Tool Filtering** | Embedding + keyword-based tool selection | ✅ |
| **Agent Card Management** | | |
| - URL-Sourced Cards | Auto-fetch from agent card URL | ✅ |
| - Manual Card Upload | Upload card JSON directly | ✅ |
| - Card Caching | 1-hour TTL per A2A spec | ✅ |
| - Card Hashing | Detect card changes | ✅ |
| - Card Refresh | Manual refresh for URL cards | ✅ |
| **Agent Attestation** | | |
| - Cryptographic Verification | RS256-RS512, ES256-ES512, EdDSA | ✅ |
| - JWKS Fetching | Fetch public keys with 1-hour cache | ✅ |
| - Verification Status | Verified/Unverified/Not Configured | ✅ |
| - Signature Tracking | Store verification timestamp | ✅ |
| **A2A Credentials** | | |
| - API Key Support | Bearer token injection | ✅ |
| - OAuth 2.1 Support | Token management and refresh | ✅ |
| - OIDC Support | OpenID Connect integration | ✅ |
| - Encrypted Storage | AES-256-GCM encryption | ✅ |
| **Publisher Registry** | Trusted publisher key management | ✅ |

### 5. MCP Server Management

| Feature | Description | Status |
|---------|-------------|--------|
| Server Registration | URL-based MCP server configuration | ✅ |
| **Tool Discovery** | Auto tool listing with 10-second timeout | ✅ |
| **Qualified Tool Names** | `domain::toolName` format | ✅ |
| **MCP-Compliant Names** | `domain_toolName` (no dots/colons) | ✅ |
| Auth Type: NONE | No authentication required | ✅ |
| Auth Type: API_KEY | API key authentication | ✅ |
| Auth Type: OAUTH | OAuth 2.1 authentication | ✅ |
| Org-Level API Keys | Organization-wide credentials | ✅ |
| OAuth Client Registration | DCR and manual configuration | ✅ |
| OAuth Scopes | Configurable scopes per server | ✅ |
| OAuth Grant Types | Authorization code, client credentials | ✅ |
| **Trust Status** | Trusted/untrusted server flag | ✅ |
| Soft Deletes | Restore deleted servers | ✅ |

### 6. Credentials & OAuth

| Feature | Description | Status |
|---------|-------------|--------|
| User-Level API Keys | Personal credentials per MCP server | ✅ |
| User OAuth Tokens | Access/refresh token storage | ✅ |
| Token Expiry Tracking | Track and display expiry | ✅ |
| **Auto Token Refresh** | On-demand refresh on 401/403 errors | ✅ |
| Manual Token Refresh | User-triggered refresh | ✅ |
| Token Revocation | Disconnect OAuth connections | ✅ |
| Org OAuth Tokens | Shared organization-level tokens | ✅ |
| OAuth PKCE Flow | Secure authorization code flow | ✅ |
| OAuth Discovery | Auto-discover OAuth endpoints | ✅ |
| Encrypted Storage | All credentials AES-256-GCM encrypted | ✅ |
| **Header Injection** | Credentials injected into HTTP headers | ✅ |
| **Parameter Injection** | Credentials merged into tool params | ✅ |

### 7. Permission Requests

| Feature | Description | Status |
|---------|-------------|--------|
| Request Type: TOOL_ACCESS | Request access to specific tools | ✅ |
| Request Type: MCP_SERVER | Request access to MCP server | ✅ |
| Request Type: DENY_REMOVAL | Request removal of DENY policies | ✅ |
| Status: PENDING | Awaiting admin review | ✅ |
| Status: APPROVED | Admin approved request | ✅ |
| Status: DENIED | Admin denied request | ✅ |
| Status: MODIFIED | Approved with modifications | ✅ |
| Status: WITHDRAWN | User withdrew request | ✅ |
| Admin Review Notes | Decision justification | ✅ |
| Policy Linking | Link approval to created policy | ✅ |
| Grant Differential | Track requested vs granted diff | ✅ |
| **Policy Exception Requests** | PROPOSAL, REMOVAL_REQUEST, WORKSPACE_EXCEPTION | ✅ |

### 8. Audit Logging

| Feature | Description | Status |
|---------|-------------|--------|
| Tool Invocation Logging | Log all tool calls with decision | ✅ |
| **Policy Snapshots** | Full policy state at evaluation time | ✅ |
| **Evaluation Trees** | Complete decision tree stored | ✅ |
| User Context Capture | Email, roles at time of call | ✅ |
| Denial Justification | Explain why calls were denied | ✅ |
| Approval Linking | Link to approval request if applicable | ✅ |
| **Admin Action Logging** | Track all admin operations | ✅ |
| MCP Source Tracking | Identify MCP Admin tool usage | ✅ |
| Comprehensive Indexing | Fast queries by org, user, tool, decision | ✅ |
| A2A Audit Logging | Log A2A agent interactions | ✅ |
| **Parameter Sanitization** | Auto-redact sensitive keys | ✅ |
| **PDF Export** | Export audit logs to PDF | ✅ |

### 9. Webhooks

| Feature | Description | Status |
|---------|-------------|--------|
| **Event Types** | | |
| - TOOL_INVOCATION_ALLOWED | Tool call permitted | ✅ |
| - TOOL_INVOCATION_DENIED | Tool call blocked | ✅ |
| - SENSITIVE_TOOL_INVOKED | Sensitive tool used | ✅ |
| - SENSITIVE_APPROVAL_NEEDED | Approval required | ✅ |
| - SENSITIVE_RATE_LIMITED | Rate limit triggered | ✅ |
| - POLICY_CREATED/UPDATED/DELETED | Policy changes | ✅ |
| - AGENT_CREATED/DELETED | Agent changes | ✅ |
| **Endpoint Types** | | |
| - CUSTOM | Raw JSON with HMAC-SHA256 signature | ✅ |
| - DISCORD | Formatted Discord embeds | ✅ |
| - SLACK | Formatted Slack blocks | ✅ |
| - EMAIL | HTML emails via Resend API | ✅ |
| **Delivery Management** | | |
| - Retry Logic | Exponential backoff | ✅ |
| - Delivery History | Track all delivery attempts | ✅ |
| - Manual Retry | Re-attempt failed deliveries | ✅ |
| Verbose Mode | Include detailed context | ✅ |
| Secret Management | HMAC secrets with rotation | ✅ |
| Background Worker | 30-second polling, graceful shutdown | ✅ |

### 10. Policy Testing & Validation

| Feature | Description | Status |
|---------|-------------|--------|
| Policy Tests | Snapshot-based testing | ✅ |
| Test Context Override | Custom user/agent context | ✅ |
| Test Results | ALLOWED/DENIED with policy match | ✅ |
| **Policy Assertions** | Unit tests for policies | ✅ |
| - Expected Decision | Validate ALLOW/DENY outcome | ✅ |
| - Context Types | USER, AGENT, ROLE, WILDCARD | ✅ |
| - Parameter Testing | Exact/subset/ignore modes | ✅ |
| - Failure Tracking | Record assertion failures | ✅ |
| - Batch Execution | Run all assertions at once | ✅ |
| - Source Tracking | Manual, playground, audit log | ✅ |
| - Impact Preview | Predict failures before policy change | ✅ |
| Policy Playground | Interactive testing interface | ✅ |
| **Validation Helpers** | Suggest correct matcher/tool names | ✅ |

### 11. Session Management

| Feature | Description | Status |
|---------|-------------|--------|
| **External Session ID** | UUID per client connection | ✅ |
| **Internal Session** | CUID for context tracking | ✅ |
| Session Context | User intent, data accessed, risk | ✅ |
| Tool Call Counting | Track invocations per session | ✅ |
| Session Expiry | 24-hour default TTL | ✅ |
| Context Entries | Store session metadata | ✅ |
| **Session Termination** | Admin can terminate active sessions | ✅ |
| **Connection Registry** | Map session to user context | ✅ |
| **Transport Management** | Per-session HTTP transports | ✅ |

### 12. Admin MCP Server

| Feature | Description | Status |
|---------|-------------|--------|
| **Tool Scopes** | | |
| - POLICIES | Policy management tools | ✅ |
| - USERS | User management tools | ✅ |
| - ROLES | Role management tools | ✅ |
| - MCP_SERVERS | Server management tools | ✅ |
| - AGENTS | Agent management tools | ✅ |
| - SENSITIVE_FLAGS | Sensitive flag tools | ✅ |
| - WEBHOOKS | Webhook management tools | ✅ |
| - PERMISSION_REQUESTS | Request management tools | ✅ |
| - ANALYTICS | Analytics tools | ✅ |
| Read & Write Tools | Full CRUD operations | ✅ |
| Confirmation Workflow | Require confirmation for sensitive ops | ✅ |
| Risk Assessment | LOW/MEDIUM/HIGH risk levels | ✅ |
| Confirmation TTL | Configurable timeout (default 5 min) | ✅ |
| Rate Limiting | Per-org rate limits (default 30/min) | ✅ |
| Allowed Admins | Optional admin allowlist | ✅ |

### 13. Tool Context & Parameter Extraction

| Feature | Description | Status |
|---------|-------------|--------|
| SQL Extraction | Parse SQL from parameters | ✅ |
| GitHub Extraction | Parse GitHub objects | ✅ |
| File Path Extraction | Detect file operations | ✅ |
| Auto/Manual Mode | Automatic or manual detection | ✅ |
| Context Enrichment | Label important values | ✅ |
| Parameter History | Track historical values | ✅ |
| Suggestion System | Autocomplete for parameters | ✅ |
| Display Labels | Human-readable parameter labels | ✅ |
| **JSON String Parsing** | Auto-parse JSON-encoded params | ✅ |

### 14. Organization Settings

| Feature | Description | Status |
|---------|-------------|--------|
| Default Timezone | Org-wide timezone | ✅ |
| Parameter Retention | Days to retain history | ✅ |
| Default Condition Mode | Simple or Advanced mode for new policies | ✅ |
| Admin MCP Config | Enable, scopes, rate limits, TTL | ✅ |

### 15. Workspace Management

| Feature | Description | Status |
|---------|-------------|--------|
| **Multi-Workspace Support** | Multiple workspaces per organization | ✅ |
| **Workspace Isolation** | Resources scoped to workspaces | ✅ |
| **Membership Management** | Add/remove users from workspaces | ✅ |
| **Workspace Roles** | MEMBER and ADMIN roles per workspace | ✅ |
| **Auto-Slug Generation** | URL-friendly workspace identifiers | ✅ |
| **Reserved Slugs** | global, select-workspace, login, oauth | ✅ |
| **Workspace Policies** | Workspace-scoped policy inheritance | ✅ |

---

## MCP Proxy

The MCP proxy is a transparent intermediary between MCP clients and upstream servers.

| Feature | Description | Status |
|---------|-------------|--------|
| **Dual-Layer Architecture** | MCP Server + tRPC Backend | ✅ |
| **Tool Interception** | All tool calls go through proxy | ✅ |
| **Policy Enforcement** | Evaluate policies before forwarding | ✅ |
| **Credential Injection** | Auto-inject API keys/OAuth tokens | ✅ |
| **Streaming Support** | StreamableHTTPServerTransport | ✅ |
| **Session Persistence** | Survive hot reloads in dev | ✅ |
| **Parameter Transformation** | JSON string parsing, normalization | ✅ |
| **Audit Logging** | Every invocation logged | ✅ |
| **Multiple Transports** | HTTP, STDIO, SSE, WebSocket | ✅ |

### Interception Flow

```
1. Client connects with Bearer token
2. Proxy validates token, creates session
3. Tool discovery from upstream servers
4. Each tool call: Policy → Flags → Forward → Audit
5. Credentials auto-injected into requests
6. Results returned with policy metadata
```

---

## Frontend

### Admin Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/admin` | Overview, approvals, confirmations, activity |
| Users | `/admin/users` | User CRUD with role management |
| Roles | `/admin/roles` | RBAC management |
| Policies | `/admin/policies` | Policy CRUD with matcher editor |
| Policy Assertions | `/admin/policy-assertions` | Unit tests for policies |
| Policy Playground | `/admin/policy-playground` | Interactive policy testing |
| Policy Conflicts | `/admin/policy-conflicts` | Conflict detection and resolution |
| Sensitive Flags | `/admin/sensitive-flags` | Tool risk classification |
| Sessions | `/admin/sessions` | Active session monitoring |
| MCP Servers | `/admin/mcp-servers` | Server registration and discovery |
| Agents | `/admin/agents` | MCP agent management |
| A2A Agents | `/admin/a2a-agents` | A2A agent management |
| Publishers | `/admin/publishers` | Trusted publisher keys |
| Tools | `/admin/tools` | Browse all tools |
| Audit Logs | `/admin/audit-logs` | Full audit trail with PDF export |
| Admin Action Logs | `/admin/admin-action-logs` | Admin operation tracking |
| Permission Requests | `/admin/permission-requests` | Review access requests |
| Credentials | `/admin/credentials` | Org-level credentials |
| Personal Credentials | `/admin/personal-credentials` | User credentials |
| Webhooks | `/admin/webhooks` | Event notifications |
| Analytics | `/admin/analytics` | Usage statistics with charts |
| Workspaces | `/admin/workspaces` | Workspace management |
| Deleted Items | `/admin/deleted-items` | Restore soft-deleted items |
| Admin MCP Confirmations | `/admin/admin-mcp-confirmations` | Pending confirmations |
| Settings | `/admin/settings` | Organization settings |
| - Organization | `/admin/settings/organization` | Org configuration |
| - Appearance | `/admin/settings/appearance` | Light/dark mode |
| - System | `/admin/settings/system` | System settings |
| - Variables | `/admin/settings/variables` | Global condition variables |
| - Admin MCP | `/admin/settings/admin-mcp` | Admin MCP configuration |
| - Advanced | `/admin/settings/advanced` | Advanced settings |

### User Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/user` | Personal tool usage |
| Tools | `/user/tools` | Browse available tools |
| Approvals | `/user/approvals` | Pending sensitive approvals |
| Requests | `/user/requests` | Permission requests |
| Audit Logs | `/user/audit-logs` | Personal audit trail |
| Credentials | `/user/credentials` | Personal credentials |
| MCP Servers | `/user/mcp-servers` | Accessible servers |

### Other Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | OAuth authentication |
| OAuth Result | `/oauth/result` | OAuth callback |
| Not Found | `*` | 404 handling |

---

## API

### Admin Routers

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| `admin.organizations` | get, update | Org settings |
| `admin.users` | list, get, create, update, delete, restore, updateRoles, refreshToken, revokeToken | User management |
| `admin.roles` | list, get, create, update, delete, restore, getDeletionImpact | Role management |
| `admin.policies` | list, get, create, update, delete, restore, detectConflicts, test | Policy management |
| `admin.policyAssertions` | list, create, get, update, delete, run, runBatch, previewImpact | Policy testing |
| `admin.policyExceptions` | list, get, create, approve, deny, withdraw | Policy exceptions |
| `admin.conditions` | getToolSchema, getContextFields, getParamHistory, searchParamValues, getParamKeys, getNestedFields, validateConditions | Condition builder |
| `admin.mcpServers` | list, get, create, update, delete, restore, discoverTools, discoverOAuth, setOrgApiKey, updateOrgApiKey, removeOrgApiKey | MCP server management |
| `admin.agents` | list, get, create, delete, restore | Agent management |
| `admin.attestation` | verifyAgent, getVerificationStatus, refreshVerification, updateAgentJwksUrl, registerPublisher, listPublishers, getPublisher, deletePublisher | Agent verification |
| `admin.a2a` | registerAgent, listAgents, getAgent, updateAgent, deleteAgent, setCredential, deleteCredential, refreshCard, testConnection | A2A management |
| `admin.auditLogEntries` | list, get | Audit viewing |
| `admin.adminActionLogs` | list, get | Admin action tracking |
| `admin.permissionRequests` | list, get, approve, deny, withdraw, denyRemoval | Permission requests |
| `admin.personalCredentials` | list, get, setApiKey, removeApiKey, setCredentials, removeCredentials | Personal credentials |
| `admin.sensitiveFlags` | list, create, update, delete, listOverrides, createOverride, updateOverride, deleteOverride, processApproval, cancelApproval, getApprovalRequest | Sensitive flags |
| `admin.webhooks` | list, get, create, update, delete, getSecret, rotateSecret, test, listDeliveries, getDelivery, retryDelivery | Webhooks |
| `admin.analytics` | getSummary | Usage analytics |
| `admin.deletedItems` | list, restore | Deleted items |
| `admin.orgOAuth` | discoverAll, registerClient, configureClient, connect, disconnect, listConnections, getConnectionDetails, refreshToken, revokeToken | OAuth management |
| `admin.orgSettings` | get, update | Org settings |
| `admin.workspaces` | list, get, create, update, delete | Workspace management |
| `admin.workspaceMembers` | list, add, remove, updateRole | Membership management |
| `admin.orgOwners` | list, add, remove | Org owner management |
| `admin.ownerRecovery` | list, create, cancel, deny, verify | Owner recovery |
| `admin.sessions` | list, terminate, terminateAllForUser | Session management |
| `admin.adminMcpSettings` | getSettings, updateSettings, testConnection | Admin MCP config |
| `admin.adminMcpConfirmation` | list, get, confirm, reject, getStatus | Admin MCP confirmations |

### User Routers

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| `user.profile` | get, update | User profile |
| `user.mcpServers` | list, get, discoverOAuth, connect, disconnect, getConnectionDetails, refreshToken, revokeToken, listCredentials, setCredential, removeCredential | MCP access |
| `user.permissionRequests` | list, create, withdraw, cancel | Permission requests |
| `user.sensitiveFlags` | listPendingApprovals, approve, cancel, getApprovalRequest | Approvals |
| `user.tools` | list, get | Tool browsing |
| `user.auditLogEntries` | list, get | Audit log |

### Proxy Router

| Endpoint | Purpose |
|----------|---------|
| evaluatePolicy | Policy evaluation for tool calls |
| evaluateSensitiveFlags | Sensitive flag checking |
| logAuditEntry | Audit logging from proxy |
| getMcpServer | Server lookup |
| getUserPolicies | User-specific policies |
| getUserMcpConfig | User credentials |
| validateAccessToken | Token validation |
| refreshAccessToken | Token refresh |
| listMcpServers | Available servers |
| getMcpServerByToolName | Server lookup by tool |
| logToolInvocation | Detailed invocation logging |
| checkAgentVerification | Agent verification status |
| getA2AAgent | A2A agent lookup |
| getA2ACredentials | A2A credential injection |
| refreshA2AAgentCard | Card refresh |
| logA2AAuditEntry | A2A audit logging |
| adminMcpCreateConfirmation | Create admin MCP confirmation |
| adminMcpGetConfirmationStatus | Check confirmation status |
| getOrCreateSession | Session management |
| incrementToolCallCount | Session tracking |
| pollApprovalStatus | Long-polling for approvals |
| checkSessionStatus | Session termination check |

### Agent Router

| Endpoint | Purpose |
|----------|---------|
| chat.list | List conversations |
| chat.create | Create conversation |
| chat.get | Get conversation |
| chat.delete | Delete conversation |
| chat.updateTitle | Update title |
| chat.addMessage | Add message |
| confirmation.list | List confirmations |
| confirmation.get | Get confirmation |
| confirmation.confirm | Confirm action |
| confirmation.reject | Reject action |

---

## Services

| Service | File | Purpose |
|---------|------|---------|
| Policy | `policy.ts` | DENY-first evaluation, matchers, patterns, evaluation trees |
| Policy Condition | `policyCondition.ts` | SIMPLE/ADVANCED condition validation, 18 operators |
| Policy Validation | `policyValidation.ts` | Matcher, tool pattern, condition field validation |
| Policy Assertion | `policyAssertion.ts` | Policy unit test execution, impact preview |
| Policy Exception | `policyException.ts` | Exception request workflow |
| Sensitive Flag | `sensitiveFlag.ts` | Rate limiting, approvals, flag evaluation |
| Verification | `verification.ts` | Agent cryptographic verification |
| Audit | `audit.ts` | Audit log creation and querying |
| Admin Action Log | `adminActionLog.ts` | Track admin operations |
| Webhook | `webhook.ts` | Delivery, retry, formatting |
| Webhook Verbose | `webhookVerbose.ts` | Detailed payload enrichment |
| Webhook Schemas | `webhookDataSchemas.ts` | Event data schemas |
| OAuth | `oauth.ts` | OAuth 2.1 with PKCE, tokens |
| OAuth Discovery | `oauthDiscovery.ts` | Endpoint discovery |
| MCP | `mcp.ts` | MCP server utilities |
| Session | `session.ts` | Session tracking and context |
| Tool Context | `toolContext.ts` | SQL/GitHub/file extraction |
| Tool Param History | `toolParamHistory.ts` | Parameter history, suggestions |
| Label Extraction | `labelExtraction.ts` | Human-readable labels |
| Tool Validation | `toolValidation.ts` | Tool name/pattern validation |
| Workspace | `workspace.ts` | Workspace CRUD, membership |
| Org Owner | `orgOwner.ts` | Org owner management |
| Owner Recovery | `ownerRecovery.ts` | Support-initiated recovery |
| Auth | `auth.ts` | Token validation, permission checks |
| Admin MCP Settings | `adminMcpSettings.ts` | Admin MCP configuration |
| Admin MCP Validation | `adminMcpValidation.ts` | Admin MCP input validation |
| Admin MCP Confirmation | `adminMcpConfirmation.ts` | Confirmation workflow |
| Admin MCP Executors | `adminMcpExecutors.ts` | Tool execution |
| Analytics | `analytics.ts` | Usage analytics |
| Deletion Impact | `deletionImpact.ts` | Analyze deletion impact |
| Agent Services | `agent/` | Chat orchestration, conversations, LLM client |

---

## Database Models

### Core Entities

| Model | Purpose |
|-------|---------|
| Organization | Multi-tenant container |
| User | User accounts with roles, soft delete, org ownership |
| Role | Custom roles with admin flag |
| Policy | ALLOW/DENY policies with matchers, conditions |
| PolicyTest | Test snapshots for policies |
| PolicyAssertion | Unit tests for policies |
| PolicyExceptionRequest | Workspace exception requests |

### Workspace

| Model | Purpose |
|-------|---------|
| Workspace | Organization workspaces |
| WorkspaceMember | User-workspace membership with role |

### Agent & A2A

| Model | Purpose |
|-------|---------|
| Agent | MCP and A2A agents with attestation |
| A2ACredential | Encrypted A2A credentials |
| PublisherRegistry | Trusted publisher keys |

### MCP & OAuth

| Model | Purpose |
|-------|---------|
| McpServer | MCP server registration |
| McpTool | Discovered tools |
| OAuthClientRegistration | OAuth client credentials |
| OAuthState | PKCE state tracking |
| UserMcpConfig | User OAuth tokens/credentials |
| OrgMcpOAuthToken | Organization OAuth tokens |

### Audit & Logging

| Model | Purpose |
|-------|---------|
| AuditLogEntry | Tool invocation audit trail |
| AdminActionLog | Admin operation tracking |

### Sensitive Flags

| Model | Purpose |
|-------|---------|
| SensitiveToolFlag | Risk classification |
| SensitiveFlagAgentOverride | Per-agent overrides |
| SensitiveFlagApprovalRequest | Approval workflow |
| SensitiveFlagRateLimitUsage | Rate limit tracking |

### Webhooks

| Model | Purpose |
|-------|---------|
| WebhookEndpoint | Event subscription |
| WebhookDelivery | Delivery tracking |

### Sessions & Context

| Model | Purpose |
|-------|---------|
| Session | Session context tracking |
| SessionContextEntry | Session metadata |
| ToolParamValue | Parameter history |

### Settings & Configuration

| Model | Purpose |
|-------|---------|
| OrganizationSettings | Org-level feature settings |
| AdminMcpConfirmation | Admin MCP confirmations |
| OwnerRecoveryRequest | Owner recovery workflow |

### Access Requests

| Model | Purpose |
|-------|---------|
| PermissionRequest | User access requests |

### Agent Chat

| Model | Purpose |
|-------|---------|
| AgentConversation | Chat conversations |
| AgentMessage | Chat messages |
| AgentConfirmation | Chat confirmations |

---

## Packages

### `packages/api`

tRPC API server with:
- 30+ admin routers
- 6 user routers
- Proxy router for MCP/A2A communication
- Agent router for chat functionality
- 35+ services
- Middleware for auth, logging, rate limiting
- Multi-LLM client (OpenAI, Claude, Gemini)

### `packages/db`

Prisma database layer:
- Complete schema with all models
- Migrations
- Type-safe client

### `packages/web`

React frontend:
- 30+ admin pages
- 7 user pages
- Reusable UI components
- TanStack Query for data fetching
- Mantine UI framework
- Charts (line, bar, heatmap)
- PDF export capabilities

### `packages/mcp`

MCP proxy server:
- Policy evaluation and enforcement
- Sensitive flag checking
- Audit logging
- Session management
- Tool forwarding to backend servers
- Credential injection
- Multiple transport support

### `packages/mcp-admin`

Admin MCP server:
- Tool definitions for admin operations
- Confirmation workflow
- Input validation
- Risk assessment

### `packages/a2a`

A2A proxy server:
- Agent Card management
- Credential injection
- Security scheme handling (apiKey, OAuth, OIDC)
- Encryption utilities

### `packages/shared`

Shared utilities:
- Admin tool schemas (40+ tools)
- Evaluation tree types
- Common types and validators

### `packages/landing`

Landing page for the product.

### `packages/mcp-test-runner`

MCP test runner for development.

---

## Security Features

| Feature | Description |
|---------|-------------|
| AES-256-GCM Encryption | Encrypt credentials at rest |
| HMAC-SHA256 Signatures | Webhook payload signing |
| Zod Validation | All inputs validated |
| Organization Scoping | All queries filtered by org |
| Soft Deletes | No permanent data loss |
| PKCE for OAuth | Secure authorization code flow |
| Bearer Token Auth | Standard token authentication |
| Admin Action Audit | Track all admin operations |
| Fail-Closed Policy | Deny on error |
| Parameter Sanitization | Auto-redact sensitive keys |
| Session Termination | Admin can terminate active sessions |
| Owner Recovery | Support-initiated account recovery |

---

## Test Coverage

| Category | Count |
|----------|-------|
| **Total Tests** | 2,639+ |
| Unit Tests | Comprehensive |
| Integration Tests | Full API coverage |
| Security Tests | 29+ injection tests |
| E2E Tests | Key flows |

### Notable Test Suites

- Webhook service: 2,849+ tests
- Webhook data schemas: 627 tests
- Webhook verbose: 871 tests
- Policy assertions: 842 tests
- Sensitive flags: 582+ tests
- MCP servers router: 916 tests
- Permission requests: 793+ tests
