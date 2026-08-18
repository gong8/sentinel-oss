# ADR-004: Monorepo Structure with pnpm + Turborepo

**Status**: Accepted
**Date**: 2024-01
**Deciders**: Project Team

## Context

SENTINEL consists of multiple related packages:

- Database layer (Prisma schema)
- API server (tRPC + Hono)
- MCP proxy server
- A2A proxy server
- Web frontend (React)
- Shared types and utilities

Options for organizing code:

1. **Monorepo**: Single repository with multiple packages
2. **Polyrepo**: Separate repositories for each package
3. **Monolith**: Single package with everything

## Decision

Use a **monorepo structure** with **pnpm workspaces** and **Turborepo** for task orchestration.

### Structure

```
sentinel/
├── packages/
│   ├── db/          # Prisma schema + generated client
│   ├── api/         # tRPC API server (Hono)
│   ├── mcp/         # MCP proxy server
│   ├── a2a/         # A2A proxy server
│   └── web/         # React frontend
├── package.json     # Root workspace config
├── pnpm-workspace.yaml  # pnpm workspace definition
└── turbo.json       # Turborepo configuration
```

## Rationale

### Why Monorepo

1. **Type Sharing**: tRPC types flow from `api` to `web` seamlessly
2. **Atomic Changes**: Change API and frontend in same commit/PR
3. **Simplified Development**: One `git clone`, one `pnpm install`
4. **Shared Dependencies**: Common versions across packages
5. **Easier Refactoring**: Cross-package refactors in one place

### Why pnpm + Turborepo

1. **pnpm**: Fast, disk-efficient package manager with strict dependency resolution
2. **Turborepo**: Intelligent task caching and parallel execution
3. **Simple config**: `pnpm-workspace.yaml` for workspaces, `turbo.json` for tasks
4. **Fast builds**: Turborepo caches build outputs and only rebuilds changed packages
5. **Standard**: Works with all Node.js tooling

### Example

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// turbo.json
{
  "tasks": {
    "build": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["build"] }
  }
}
```

```json
// packages/web/package.json
{
  "name": "@sentinel/web",
  "dependencies": {
    "@sentinel/api": "workspace:*"  // ← pnpm workspace protocol
  }
}
```

## Consequences

### Positive ✅

- **Developer Experience**: Everything in one place
- **Type Safety**: Shared types between packages
- **Atomic Commits**: API + frontend changes together
- **Faster CI**: Can cache node_modules for entire repo
- **Simpler Deployment**: Single version number

### Negative ❌

- **Larger Repository**: More code to clone
- **Shared Dependencies**: Version conflicts possible
- **Longer Build Times**: Must build multiple packages
- **Complex CI**: Need to detect which packages changed

## Alternatives Considered

### Polyrepo (Separate Repositories)

- **Pros**: Independent versioning, smaller repos, clearer ownership
- **Cons**: Type sync nightmare, complex dependency management, slower development
- **Why Not**: Too much overhead for SENTINEL's size

### Monolith (Single Package)

- **Pros**: Simplest possible setup
- **Cons**: Can't import packages independently, unclear boundaries, harder to test
- **Why Not**: Need clear separation between layers

### npm Workspaces Only

- **Pros**: Simpler setup, no extra tooling
- **Cons**: No caching, no parallel task execution, slower builds
- **Why Not**: Turborepo provides significant build time improvements

### Lerna

- **Pros**: Mature monorepo tool, versioning support
- **Cons**: Maintenance mode, npm workspaces now preferred
- **Why Not**: Lerna is being phased out

## Package Boundaries

### `packages/db`

- **Exports**: Prisma client, types
- **Depends on**: Nothing (lowest layer)

### `packages/api`

- **Exports**: tRPC router, types
- **Depends on**: `@sentinel/db`

### `packages/mcp`

- **Exports**: MCP proxy server
- **Depends on**: `@sentinel/db`, `@sentinel/api`

### `packages/web`

- **Exports**: React app (not imported by other packages)
- **Depends on**: `@sentinel/api` (via tRPC client)

## Development Workflow

```bash
# Clone once
git clone https://github.com/org/sentinel.git
cd sentinel

# Install all packages
pnpm install

# Run specific package
pnpm --filter @sentinel/api dev

# Run all packages in parallel
pnpm turbo dev

# Test specific package
pnpm --filter @sentinel/api test

# Test all packages
pnpm turbo test

# Build with caching
pnpm turbo build
```

## Related Decisions

- ADR-001: tRPC benefits from monorepo (type sharing)
- ADR-002: Prisma client in `packages/db` used by all other packages
