# SENTINEL Development Guide

## Project Structure

```
packages/
  a2a/            - A2A (Agent-to-Agent) protocol implementation
  api/            - tRPC API server (services, routers, middleware)
  db/             - Prisma schema & client
  docs/           - Documentation website
  mcp/            - MCP protocol utilities
  mcp-admin/      - MCP server for admin AI agent operations
  mcp-test-runner/- MCP test runner
  shared/         - Shared utilities and types
  web/            - React frontend (pages, components)
docs/
  README.md       - Start here for documentation map
  spec/           - Current technical specifications
  patterns/       - Implementation how-to guides
  guides/         - Installation and setup guides
  decisions/      - Architecture decision records
  archive/        - Outdated docs (do NOT read for implementation)
test/
  unit/           - Unit tests
  integration/    - Integration tests
  e2e/            - End-to-end tests
  security/       - Security tests
  fixtures/       - Test fixtures
  helpers/        - Test helpers
```

## Before Starting Any Task

2. Open `docs/README.md` for documentation navigation
3. Read only the spec section you need from `docs/spec/`
4. Look at existing patterns in `docs/patterns/`

**Warning**: Do NOT read `docs/archive/` - it contains outdated documentation.

## Critical Rules

### Security (Non-Negotiable)

- **Always scope queries to organizationId** - Every database query must filter by org
- **Validate all inputs with Zod** - No raw input processing
- **Encrypt credentials before storage** - Use the encryption service
- **Audit log all sensitive actions** - Tool calls, policy changes, auth events
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
- [ ] Credentials encrypted
- [ ] Actions audit logged
- [ ] DENY policies tested

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
