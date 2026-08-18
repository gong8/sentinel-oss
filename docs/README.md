# SENTINEL Documentation

> **For LLMs**: This is your starting point. Read this file FIRST to understand how to navigate the codebase.

---

## Quick Start

**Read these files in order:**

1. **`CLAUDE.md`** (project root) - Development rules, security requirements, type safety rules
3. **This file** (`docs/README.md`) - Navigate to specific documentation

---

## Source of Truth Files

| File | Location | Purpose |
|------|----------|---------|
| `CLAUDE.md` | Project root | Development rules, security checklist, project structure |
| `AGENTS.md` | Project root | Agent-specific development instructions |

---

## Technical Specifications (`docs/spec/`)

Deep technical documentation for each subsystem.

| File | Contents | Read When |
|------|----------|-----------|
| `architecture.md` | System design, package structure, request flows | Understanding the system |
| `data-models.md` | 49 Prisma models with fields and relationships | Working with database |
| `api-reference.md` | 50+ tRPC routers, endpoints, authentication | Implementing API features |
| `policy-engine.md` | Policy evaluation rules, matchers, tool patterns | Working with policies |
| `POLICY-ARCHITECTURE.md` | Full policy system design, condition modes | Deep policy work |
| `security.md` | Auth, encryption, audit logging, org scoping | Security-related work |

---

## Implementation Patterns (`docs/patterns/`)

Step-by-step guides for common development tasks.

| File | When to Use |
|------|-------------|
| `adding-api-endpoint.md` | Adding tRPC endpoints (service -> router -> UI) |
| `adding-database-model.md` | Adding Prisma models, migrations |
| `adding-frontend-page.md` | Adding admin or user pages |
| `adding-ui-component.md` | Adding React components |
| `adding-test.md` | Writing unit, integration, or E2E tests |
| `implementing-policy-rule.md` | Adding new policy matchers or conditions |
| `encrypting-sensitive-data.md` | Using crypto utilities for credentials |

---

## Architecture Decisions (`docs/decisions/`)

ADRs explaining major technical choices. Read these to understand WHY.

| File | Decision |
|------|----------|
| `001-trpc-for-api.md` | Why tRPC over REST/GraphQL |
| `002-prisma-for-database.md` | Why Prisma as ORM |
| `003-deny-first-policy.md` | Policy evaluation order |
| `004-monorepo-structure.md` | Package organization |
| `005-credential-encryption.md` | AES-256-GCM encryption approach |
| `006-a2a-protocol-support.md` | A2A protocol integration |

---

## Operator Guides (`docs/guides/`)

Guides for operators deploying and configuring Sentinel.

| File | Contents |
|------|----------|
| `quickstart.md` | 30-minute setup walkthrough |
| `policies.md` | Policy configuration reference |
| `integration.md` | MCP servers, webhooks, API integration |
| `admin-mcp.md` | Admin MCP Server for AI-driven administration |
| `troubleshooting.md` | Common issues and solutions |
| `admin-tour.md` | Admin dashboard walkthrough |
| `user-guide.md` | End-user documentation |

### LLM Client Guides (`docs/guides/installation-guides/`)

Connect AI clients to Sentinel:

| Client | File |
|--------|------|
| Claude Code/Desktop | `installation-guides/claude-code.md` |
| Cursor IDE | `installation-guides/cursor.md` |
| Windsurf | `installation-guides/windsurf.md` |
| Cline (VS Code) | `installation-guides/cline.md` |
| Custom/API | `installation-guides/custom.md` |

---

## Operational Reference

| File | Contents |
|------|----------|
| `installation.md` | Quick install guide (one-liner setup) |
| `MCP-SETUP.md` | MCP server configuration |
| `TESTING.md` | Test running and coverage |

---

## Key Concepts for LLMs

Understand these concepts before modifying code:

### Multi-tenancy
- **All data is scoped by `organizationId`**
- Every database query MUST filter by org
- Cross-org data access is a critical security violation

### Workspaces
- Enterprise feature for isolation within organizations
- Users can be assigned to workspaces
- Policies can be workspace-scoped

### Policy System
- **DENY-first**: DENY policies always win over ALLOW
- **Fail-closed**: No matching ALLOW = denied
- **Priority ordering**: Higher priority evaluated first

### Condition Modes
- **SIMPLE**: Array-based conditions `[{field, operator, value}]`
- **ADVANCED**: Expression language `param.path > 100 AND param.type == "file"`

### Soft Deletes
- Use `deletedAt` field, never hard delete
- Queries must filter `deletedAt: null`

### Transport Types
- MCP supports: HTTP, STDIO, WebSocket, SSE
- A2A uses HTTP with agent cards

### Credential Encryption
- All credentials encrypted with AES-256-GCM before storage
- Use the crypto utilities in `packages/api/src/lib/crypto.ts`

---

## Package Overview

### Core Packages

| Package | Purpose | Key Stats |
|---------|---------|-----------|
| `@sentinel/api` | tRPC API server | 47 services, 56 router files |
| `@sentinel/db` | Prisma schema & client | 49 models |
| `@sentinel/web` | React frontend | 219 components |
| `@sentinel/mcp` | MCP proxy server | Multi-transport support |
| `@sentinel/a2a` | A2A proxy server | Agent-to-agent protocol |
| `@sentinel/mcp-admin` | Admin MCP server | 53 tools for AI administration |
| `@sentinel/shared` | Shared types & utilities | Common code |

### Supporting Packages

| Package | Purpose |
|---------|---------|
| `@sentinel/docs` | Documentation website |
| `@sentinel/mcp-test-runner` | MCP testing utilities |

---

## Testing Overview

| Category | Files | Purpose |
|----------|-------|---------|
| Unit | 120 files | Mocked tests, fast, isolated |
| Integration | 33 files | Real database, API tests |
| E2E | 51 files | Playwright browser tests |
| Security | 6 files | Critical security validations |

**Total: 210 test files**

Run tests with:
```bash
pnpm test          # All tests
pnpm test:unit     # Unit tests only
pnpm test:int      # Integration tests
pnpm test:e2e      # End-to-end tests
```

---

## Quick Reference for Common Tasks

### For Developers

| Task | Read These |
|------|------------|
| Add a new feature | `spec/architecture.md` -> relevant `patterns/` guide |
| Fix a bug | `spec/` for relevant area -> codebase |
| Understand policies | `spec/policy-engine.md` + `spec/POLICY-ARCHITECTURE.md` |
| Add database model | `patterns/adding-database-model.md` -> `spec/data-models.md` |
| Add API endpoint | `patterns/adding-api-endpoint.md` |
| Add frontend page | `patterns/adding-frontend-page.md` |
| Security review | `spec/security.md` -> `CLAUDE.md` security checklist |

### For Operators

| Task | Read These |
|------|------------|
| Quick install | `installation.md` (one command setup) |
| Deploy Sentinel | `installation.md` -> `guides/quickstart.md` |
| Configure policies | `guides/policies.md` |
| Connect AI clients | `guides/installation-guides/` |
| Set up webhooks | `guides/integration.md` |
| Troubleshoot issues | `guides/troubleshooting.md` |

---

## Project Structure

```
packages/
  api/            - tRPC API server (services, routers, middleware)
  a2a/            - A2A (Agent-to-Agent) protocol implementation
  db/             - Prisma schema & client
  docs/           - Documentation website
  mcp/            - MCP protocol utilities
  mcp-admin/      - MCP server for admin AI agent operations
  mcp-test-runner/- MCP test runner
  shared/         - Shared utilities and types
  web/            - React frontend (pages, components)

docs/
  README.md       - This file (start here)
  spec/           - Technical specifications
  patterns/       - Implementation how-to guides
  guides/         - Operator and user guides
  decisions/      - Architecture decision records

test/
  unit/           - Unit tests (120 files)
  integration/    - Integration tests (33 files)
  e2e/            - End-to-end tests (51 files)
  security/       - Security tests (6 files)
  fixtures/       - Test fixtures
  helpers/        - Test helpers
```

---

## What NOT to Read

| Location | Reason |
|----------|--------|
| `docs/ztemp/` | Temporary working files, may be stale |

---

## Quick Install

```bash
npx tsx https://raw.githubusercontent.com/gong8/sentinel/main/scripts/install.ts
```

See `installation.md` for full installation guide.
