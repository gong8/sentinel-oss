# SENTINEL Development Guide

## Project Structure

```
packages/
  a2a/            - A2A (Agent-to-Agent) protocol proxy server
  api/            - tRPC API server (49+ services, 50+ routers, middleware)
  db/             - Prisma schema (67 models) & client
  docs/           - Documentation website
  mcp/            - MCP proxy server (multi-transport: HTTP, STDIO, WebSocket, SSE)
  mcp-admin/      - Admin MCP server (40 tools for AI agent admin operations)
  mcp-test-runner/- MCP testing utilities
  shared/         - Shared utilities, types, admin tool definitions, advanced conditions
  web/            - React frontend (236 components & pages)
docs/
  README.md       - Start here for documentation map
  spec/           - Current technical specifications
  patterns/       - Implementation how-to guides
  guides/         - Installation and setup guides
  decisions/      - Architecture decision records
  archive/        - Outdated docs (do NOT read for implementation)
test/
  unit/           - Unit tests (120 files)
  integration/    - Integration tests (33 files)
  e2e/            - End-to-end tests (51 files)
  security/       - Security tests (6 files)
  fixtures/       - Test fixtures
  helpers/        - Test helpers (factory, auth, db, trpc, tenant-isolation)
```

## Before Starting Any Task

2. Open `docs/README.md` for documentation navigation
3. Read only the spec section you need from `docs/spec/`
4. Look at existing patterns in `docs/patterns/`

**Warning**: Do NOT read `docs/archive/` - it contains outdated documentation.

## Critical Rules

### Security (Non-Negotiable)

- **Always scope queries to organizationId** - Every database query must filter by org
- **Validate workspace access** - Check WorkspaceMember for workspace-scoped operations
- **Validate all inputs with Zod** - No raw input processing
- **Encrypt credentials before storage** - Use the encryption service (AES-256-GCM)
- **Audit log all sensitive actions** - Tool calls, policy changes, auth events, admin actions
- **DENY policies cannot be bypassed** - Test this explicitly

### Type Safety (Non-Negotiable)

- **Never use `as` type assertions** - Exception: `as const` is allowed
- **Never use `// @ts-ignore` or `// @ts-expect-error`**
- **Never use `// eslint-disable`**
- **Never use `any` type** - Use `unknown` and validate with Zod
- **Fix type errors properly** - Don't bypass them

### Workflow

- **Run `pnpm lint` after changes** - Catch errors early
- **Follow existing patterns** - Match the codebase style

## Security Checklist

Before submitting changes:

- [ ] Inputs validated with Zod
- [ ] Queries scoped to organizationId
- [ ] Workspace access validated (if workspace-scoped)
- [ ] Credentials encrypted
- [ ] Actions audit logged
- [ ] Admin actions logged with before/after snapshots
- [ ] DENY policies tested

## Key Services

- `packages/api/src/services/policy.ts` - Policy evaluation engine
- `packages/api/src/services/policyCondition.ts` - Condition evaluation
- `packages/api/src/services/auth.ts` - Authentication
- `packages/api/src/services/audit.ts` - Audit logging
- `packages/api/src/services/adminActionLog.ts` - Admin action logging
- `packages/api/src/services/workspace.ts` - Workspace management
- `packages/api/src/services/sensitiveFlag.ts` - Sensitive tool flags
- `packages/api/src/lib/crypto.ts` - Encryption utilities

## Key Patterns

- **Policy conditions**: Use SIMPLE (array) or ADVANCED (expression) modes
- **Workspace scoping**: null workspaceId = org-wide, specific = workspace-scoped
- **Soft deletes**: deletedAt, deletedBy fields (not hard deletes)
- **Admin actions**: Always log with before/after snapshots

## Testing

- **Unit tests**: `test/unit/` - Use mocks, no DB required
- **Integration tests**: `test/integration/` - Require TEST_DATABASE_URL
- **Security tests**: `test/security/` - Critical security validation
- **E2E tests**: `test/e2e/` - Full browser testing with Playwright

## Implementation Order

When adding features, build in layers:

1. Data layer (Prisma schema if needed)
2. Business logic (services)
3. API layer (tRPC routers)
4. UI layer (React components)
5. Tests (unit -> integration -> e2e)

## Don't

- Over-engineer - simplest solution first
- Add features not requested
- Create files unless necessary
- Add comments explaining obvious code
- Optimize prematurely

## Extended Examples

For detailed code examples and patterns, see `docs/patterns/` directory.
