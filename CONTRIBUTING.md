# Contributing

Thanks for taking a look. This document covers what you need to get productive.

## Setup

Requires Node 20+, pnpm, and Postgres.

```bash
pnpm setup    # install deps, generate Prisma client, push schema, seed
pnpm dev      # start everything
```

If you don't have Postgres locally, `docker compose up -d postgres` starts one.

## Before you open a PR

```bash
pnpm check
```

That runs formatting, lint, typecheck, and tests. CI runs the same thing, so if it passes locally
it should pass there.

## The rules

These are enforced by lint config and the git hooks in `.claude/hooks/`. They are not style
preferences — they exist because this is a security tool.

**Type safety**

- No `as` type assertions. `as const` is fine.
- No `any`. Use `unknown` and validate with Zod.
- No `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`.
- Fix type errors properly rather than suppressing them.

**Security**

- Every database query must be scoped to `organizationId`.
- Workspace-scoped operations must validate `WorkspaceMember` access.
- Validate all input with Zod. No raw input processing.
- Encrypt credentials before storage using the encryption service.
- Audit log sensitive actions. Admin actions need before/after snapshots.
- DENY policies cannot be bypassed. If you touch policy evaluation, test this explicitly.

## Where things live

```
packages/
  api/        tRPC API — services, routers, middleware
  web/        React console
  db/         Prisma schema and client
  mcp/        MCP proxy (HTTP, STDIO, WebSocket, SSE)
  mcp-admin/  Admin MCP server
  a2a/        Agent-to-Agent proxy
  shared/     Shared types, condition evaluation
  docs/       Documentation site
test/
  unit/         no database required
  integration/  requires TEST_DATABASE_URL
  security/     tenant isolation, DENY precedence
  e2e/          Playwright
```

Implementation guides are in `docs/patterns/`. Specs are in `docs/spec/`.

## Building a feature

Work in layers, bottom up:

1. Prisma schema, if the data model changes
2. Service (business logic)
3. tRPC router (API)
4. React components (UI)
5. Tests — unit, then integration, then e2e

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/); commitlint
enforces this. Valid types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
`revert`, `style`, `test`.

## Licensing of contributions

Contributions are accepted under the AGPL-3.0. By opening a PR you agree your work is licensed
under the same terms as the project.
