# SENTINEL Architecture


## System Overview

SENTINEL is an AI agent governance platform providing:
- **Policy-based access control** for MCP and A2A tool calls (DENY-first evaluation)
- **Credential management** with AES-256-GCM encryption at rest
- **Audit logging** for compliance and debugging
- **Sensitive tool flags** with rate limiting and approval workflows
- **Multi-tenant isolation** with organization and workspace scoping
- **Admin AI agent operations** via MCP server with confirmation flows

---

## Package Structure

```
packages/
├── api/              # tRPC API server (Hono + tRPC)
│   ├── services/     # 47 business logic services
│   ├── trpc/         # Router definitions (admin, user, agent, workspace, proxy, public)
│   ├── middleware/   # Rate limiting, metrics
│   ├── agent/        # LLM client, orchestrator, tools
│   ├── lib/          # Crypto, utilities
│   ├── jobs/         # Background workers (session cleanup, audit log cleanup)
│   └── types/        # TypeScript type definitions
│
├── db/               # Prisma schema (49 models) and client
│
├── web/              # React frontend (Vite + React Router v7)
│   ├── pages/        # Admin (30 pages), user, agent pages
│   ├── components/   # 162 component files, shadcn UI
│   ├── contexts/     # UpgradeModal, Onboarding
│   ├── hooks/        # Custom React hooks
│   └── lib/          # Client utilities
│
├── mcp/              # MCP proxy server
│   ├── transports/   # HTTP, STDIO, WebSocket, SSE
│   ├── session-manager.ts  # Session pooling (30-min timeout)
│   ├── credentials.ts      # Credential injection
│   ├── redaction.ts        # Response redaction
│   └── transport-factory.ts
│
├── a2a/              # A2A proxy server (port 4000)
│   ├── agent-card.ts   # Card fetching, caching (1-hour TTL)
│   ├── credential.ts   # Auth header building
│   ├── validation.ts   # Request validation
│   └── server.ts       # Hono server
│
├── mcp-admin/        # Admin MCP server (40 tools)
│   ├── 21 read tools (immediate execution)
│   ├── 19 write tools (require confirmation)
│   └── tools.ts      # Tool definitions and executors
│
├── shared/           # Shared types and utilities
│   ├── adminTools.ts        # Tool definitions with Zod schemas
│   ├── advancedConditions/  # Lexer, parser, evaluator, type checker
│   ├── evaluationTree.ts    # Policy evaluation tree types
│   ├── types.ts             # UserContext, JsonValue, etc.
│
├── mcp-test-runner/  # MCP testing utilities
├── docs/             # Documentation website
└── landing/          # Marketing landing page (if exists)
```

---

## Key Services (packages/api/src/services/)

### Authentication & Authorization
| Service | Purpose |
|---------|---------|
| `auth.ts` | Token validation, role/permission checking |
| `session.ts` | Session management with termination |
| `oauth.ts` | OAuth 2.1 with PKCE |
| `oauthDiscovery.ts` | OAuth discovery endpoints |

### Policy Engine
| Service | Purpose |
|---------|---------|
| `policy.ts` | Policy evaluation engine (DENY-first, fail-closed) |
| `policyCondition.ts` | Condition evaluation (SIMPLE + ADVANCED modes) |
| `policyValidation.ts` | Input validation preventing LLM hallucinations |
| `policyAssertion.ts` | Policy test assertions |
| `policyException.ts` | Policy exception requests |
| `advancedCondition.ts` | Advanced expression evaluation |

### Security
| Service | Purpose |
|---------|---------|
| `verification.ts` | JWS/JWKS signature verification for agent attestation |
| `sensitiveFlag.ts` | Sensitive flag evaluation with rate limiting |
| `toolValidation.ts` | Tool input validation |
| `toolContext.ts` | Context extraction (SQL, GitHub, file) |

### MCP & A2A
| Service | Purpose |
|---------|---------|
| `mcp.ts` | MCP server connection and tool discovery |
| `adminMcpConfirmation.ts` | Admin MCP confirmation handling |
| `adminMcpSettings.ts` | Admin MCP configuration |
| `adminMcpValidation.ts` | Admin tool input validation |
| `adminMcpExecutors.ts` | Admin tool execution |

### Workspace & Chat
| Service | Purpose |
|---------|---------|
| `workspace.ts` | Workspace CRUD |
| `workspaceMember.ts` | Workspace membership management |
| `workspace-chat-orchestrator.ts` | Chat workflow orchestration |
| `workspace-llm-client.ts` | Multi-provider LLM client |
| `workspace-chat-usage.ts` | Chat usage tracking |
| `workspace-tool-router.ts` | Tool routing for workspace chat |

### Audit & Analytics
| Service | Purpose |
|---------|---------|
| `audit.ts` | Audit log creation |
| `adminActionLog.ts` | Admin action logging with before/after snapshots |
| `analytics.ts` | Analytics computation |
| `metrics.ts` | Metrics collection |
| `llmUsage.ts` | LLM usage tracking |

### Data Management
| Service | Purpose |
|---------|---------|
| `globalVariables.ts` | Global variable management for policies |
| `webhook.ts` | Webhook delivery |
| `webhookVerbose.ts` | Verbose webhook payloads |
| `webhookDataSchemas.ts` | Webhook payload schemas |
| `export.ts` | Data export |
| `deletionImpact.ts` | Deletion impact analysis |
| `labelExtraction.ts` | Label extraction from tool parameters |
| `toolParamHistory.ts` | Tool parameter history tracking |

### Enterprise Features
| Service | Purpose |
|---------|---------|
| `orgOwner.ts` | Organization owner management |
| `ownerRecovery.ts` | Owner recovery flow |
| `ownershipTransfer.ts` | Ownership transfer flow |
| `accessReview.ts` | Access review workflows |
| `onboarding.ts` | Onboarding flow |

---

## Request Flows

### MCP Tool Call
```
Agent Request
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Proxy Server                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Authenticate (Bearer token → organization)       │   │
│  │ 2. Session Manager (pool or create connection)      │   │
│  │ 3. Policy Engine (DENY-first evaluation)            │   │
│  │    - Match tool name patterns                       │   │
│  │    - Evaluate conditions (SIMPLE or ADVANCED)       │   │
│  │    - Check user roles                               │   │
│  │ 4. Sensitive Flags                                  │   │
│  │    - Rate limit check                               │   │
│  │    - Approval requirement check                     │   │
│  │ 5. [If approval needed] Create approval request     │   │
│  │ 6. Inject credentials (encrypted → decrypted)       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
Backend MCP Server
     │
     ▼
Response → Redaction → Audit Log → Return to Agent
```

### A2A Skill Call
```
Agent Request
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    A2A Proxy Server                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Authenticate (Bearer token)                      │   │
│  │ 2. Fetch/Cache Agent Card (1-hour TTL)              │   │
│  │ 3. Policy Engine (same as MCP)                      │   │
│  │ 4. Sensitive Flags check                            │   │
│  │ 5. Build auth header from A2A credentials           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
Backend A2A Agent
     │
     ▼
Response → Audit Log → Return to Agent
```

### Admin MCP Operation
```
AI Agent (Claude, etc.)
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Admin MCP Server                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Authenticate admin user                          │   │
│  │ 2. Validate enabled scopes (POLICIES, USERS, etc.)  │   │
│  │ 3. Validate tool input with Zod schema              │   │
│  │ 4. Check if tool is read or write                   │   │
│  │    ┌──────────────────────────────────────────┐     │   │
│  │    │ READ TOOL (21 tools)                     │     │   │
│  │    │ → Execute immediately                    │     │   │
│  │    └──────────────────────────────────────────┘     │   │
│  │    ┌──────────────────────────────────────────┐     │   │
│  │    │ WRITE TOOL (19 tools)                    │     │   │
│  │    │ → Create confirmation record             │     │   │
│  │    │ → Return confirmation ID to AI           │     │   │
│  │    │ → Wait for admin approval in UI          │     │   │
│  │    │ → Execute on approval                    │     │   │
│  │    └──────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
tRPC API → Prisma → Database
     │
     ▼
Admin Action Log (with before/after snapshots) → Return Result
```

### Web UI Request
```
React Component
     │
     ▼
tRPC Client (React Query)
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Server (Hono + tRPC)                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Rate limit middleware                            │   │
│  │ 3. Metrics middleware                               │   │
│  │ 4. tRPC context (auth, organization)                │   │
│  │ 5. Router handler                                   │   │
│  │ 6. Service layer (business logic)                   │   │
│  │ 7. Prisma (database operations)                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
Response → React Query Cache → UI Update
```

---

## Transport Support

| Transport | Use Case | Features |
|-----------|----------|----------|
| **HTTP** | Default | StreamableHTTPServerTransport, stateless |
| **STDIO** | Local process servers | Restart capability, process management |
| **WebSocket** | Real-time connections | Reconnection, heartbeat (`wsReconnectMs`, `wsMaxRetries`, `wsHeartbeatMs`) |
| **SSE** | Server-sent events | One-way streaming |

---

## Policy Engine Details

### Evaluation Order (DENY-First)
1. Collect all matching policies for tool
2. If ANY policy has effect=DENY and conditions match → **DENIED**
3. If ANY policy has effect=ALLOW and conditions match → **ALLOWED**
4. If no matching policies → **DENIED** (fail-closed)

### Policy Matching
- `*` or `*::*` → matches all tools
- `server::*` → matches all tools on server
- `server::tool` → matches specific tool

### Condition Modes
```typescript
enum ConditionMode {
  SIMPLE,   // Key-value matching with operators
  ADVANCED  // Expression language with functions
}
```

### Advanced Condition Language
```
// Lexer → Parser → Type Checker → Evaluator
// Located in: packages/shared/src/advancedConditions/

// Example expressions:
ctx.user.email ENDS_WITH "@company.com"
ctx.params.amount < 1000 AND ctx.params.currency == "USD"
CONTAINS(ctx.params.recipients, "admin@company.com")
ctx.globalVars.allowedTools CONTAINS ctx.tool.name
```

---

## Security Architecture

### Multi-Tenant Isolation
- Every database model has `organizationId` field
- All queries MUST filter by `organizationId`
- Cross-tenant access is impossible at the data layer

### Workspace Isolation
- Workspaces are isolated environments within organizations
- Policies, MCP servers, agents can be workspace-scoped
- `workspaceId` on models enables workspace-level filtering

### Credential Security
- AES-256-GCM encryption for all stored credentials
- Encryption key from environment variable
- Credentials decrypted only at request time
- Never logged or returned in API responses

### Session Management
- Session tokens with configurable expiry
- Session termination capability
- Last activity tracking
- 30-minute session pool timeout for MCP connections

### Rate Limiting
- Per-endpoint rate limits
- Per-user rate limits for sensitive operations
- Configurable via middleware

---

## Enterprise Features

### Workspaces
- Isolated environments within organizations
- Workspace admins can manage their workspace
- Workspace-scoped policies, servers, agents

### Global Variables
- Namespace-based variables for policy conditions
- Available in advanced condition expressions
- Managed per organization

### LLM Configuration
- Per-organization provider settings
- Supported: Claude, OpenAI, Gemini, Ollama, LM Studio
- API key encryption

### Ownership Management
- Owner recovery flow (for lost access)
- Ownership transfer flow (planned succession)
- Org owner role management

### Policy Proposals
- Workspace admins can propose org-wide policies
- Approval workflow for proposals

---

## Database Models (49 total)

### Core Entities
- `Organization`, `User`, `Role`, `Agent`, `Workspace`, `WorkspaceMember`

### Policy & Access Control
- `Policy`, `PolicyTest`, `PolicyAssertion`, `PolicyExceptionRequest`, `OrgWidePolicyProposal`

### MCP & A2A
- `McpServer`, `McpServerTool`, `A2ACredential`

### Credentials & OAuth
- `OAuthClientRegistration`, `OrgMcpOAuthToken`

### Audit & Logging
- `AuditLogEntry`, `AdminActionLog`, `AdminMcpConfirmation`

### Sensitive Flags
- `SensitiveToolFlag`, `SensitiveFlagApprovalRequest`, `SensitiveFlagRateLimitUsage`

### Webhooks & Integration
- `WebhookEndpoint`, `WebhookDelivery`

### Session & Context
- `Session`, `ToolParamValue`, `GlobalVariableNamespace`, `GlobalVariable`

### Enterprise
- `OrgOwner`, `OwnershipTransfer`, `OwnerRecoveryRequest`, `OrganizationSettings`

### Agent Features
- `AgentConversation`, `AgentMessage`, `PublisherRegistry`

### Usage Tracking
- `LlmUsageLog`

---

## tRPC Router Structure

```
router/
├── admin/           # 36 admin routers
│   ├── policies.ts
│   ├── users.ts
│   ├── roles.ts
│   ├── agents.ts
│   ├── mcpServers.ts
│   ├── sensitiveFlags.ts
│   ├── webhooks.ts
│   ├── workspaces.ts
│   ├── globalVariables.ts
│   ├── adminMcpConfirmation.ts
│   ├── adminActionLogs.ts
│   ├── analytics.ts
│   └── ... (22 more)
│
├── user/            # User-facing operations
├── agent/           # Agent operations
├── workspace/       # Workspace operations
├── proxy/           # Proxy operations
└── public/          # Public endpoints (health, etc.)
```

---

## Agent Architecture (packages/api/src/agent/)

### Components
| File | Purpose |
|------|---------|
| `llm-client.ts` | Unified LLM client interface |
| `llm-providers.ts` | Provider configuration |
| `claude-client.ts` | Claude API client |
| `openai-compatible-client.ts` | OpenAI-compatible client (OpenAI, Gemini) |
| `ollama-client.ts` | Ollama local model client |
| `orchestrator.ts` | Chat orchestration logic |
| `conversation.ts` | Conversation management |
| `confirmation.ts` | Tool confirmation handling |
| `tools/` | Tool definitions for workspace chat |
| `prompts/` | System prompts |

### Supported Providers
- **Claude** (Anthropic API)
- **OpenAI** (GPT-4, etc.)
- **Gemini** (Google AI)
- **Ollama** (Local models)
- **LM Studio** (Local models)

---

## Admin Pages (packages/web/src/pages/admin/)

| Page | Purpose |
|------|---------|
| `Dashboard.tsx` | Overview and stats |
| `Policies.tsx` | Policy management |
| `PolicyPlayground.tsx` | Policy testing |
| `PolicyConflicts.tsx` | Conflict detection |
| `PolicyAssertions.tsx` | Policy test assertions |
| `PolicyProposals.tsx` | Proposal management |
| `Users.tsx` | User management |
| `Roles.tsx` | Role management |
| `Agents.tsx` | Agent management |
| `A2AAgents.tsx` | A2A agent configuration |
| `McpServers.tsx` | MCP server configuration |
| `McpServerRequests.tsx` | Server request logs |
| `Tools.tsx` | Tool discovery |
| `SensitiveFlags.tsx` | Sensitive flag management |
| `Credentials.tsx` | Credential management |
| `Sessions.tsx` | Session management |
| `Webhooks.tsx` | Webhook configuration |
| `Audit.tsx` | Audit log viewer |
| `AuditDetail.tsx` | Single audit entry |
| `AdminActionLog.tsx` | Admin action history |
| `AdminActionLogDetail.tsx` | Action detail with diffs |
| `AdminMcpConfirmations.tsx` | Pending confirmations |
| `Analytics.tsx` | Usage analytics |
| `Workspaces.tsx` | Workspace management |
| `WorkspaceDetail.tsx` | Single workspace |
| `WorkspaceChatSettings.tsx` | Chat configuration |
| `Publishers.tsx` | Publisher registry |
| `PermissionRequests.tsx` | Access requests |
| `DeletedItems.tsx` | Soft-deleted items |
| `settings/` | Organization settings |

---

## Key Interfaces

### Policy Context
```typescript
interface PolicyContext {
  user: UserWithRoles;
  agent?: Agent | null;
  delegatedUser?: UserWithRoles;  // For delegation
  toolName: string;
  parameters?: Record<string, unknown>;
  sourceIp?: string;
  contextOverrides?: ContextOverridesInput;  // For playground
  extractedContext?: ExtractedContextInput;
}
```

### Policy Evaluation Result
```typescript
interface PolicyEvaluationResult {
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  justification: string | null;
  policyIds: string[];
  approvalRequestId?: string;  // When PENDING_APPROVAL
}
```

### User Context (for conditions)
```typescript
interface UserContext {
  user: {
    id: string;
    email: string;
    roles: string[];
  };
  agent?: {
    id: string;
    name: string;
    publisher?: string;
  };
  tool: {
    name: string;
    server: string;
  };
  params: Record<string, unknown>;
  globalVars: Record<string, unknown>;
  time: {
    hour: number;
    dayOfWeek: number;
    timestamp: number;
  };
}
```

---

## Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `ENCRYPTION_KEY` - AES-256 key for credential encryption

### Optional
- `ANTHROPIC_API_KEY` - Default Claude API key
- `OPENAI_API_KEY` - Default OpenAI API key

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Run tests
pnpm test           # All tests
pnpm test:unit      # Unit tests only
pnpm test:int       # Integration tests only
pnpm test:e2e       # E2E tests only

# Linting
pnpm lint
pnpm lint:fix

# Type checking
pnpm typecheck

# Database
pnpm db:push        # Push schema changes
pnpm db:generate    # Generate Prisma client
pnpm db:seed        # Seed database
```

---

## Related Documentation

- `docs/patterns/` - Implementation patterns and examples
- `docs/guides/` - Installation and setup guides
- `docs/decisions/` - Architecture decision records
- `CLAUDE.md` - Development guidelines
