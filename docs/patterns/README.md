# SENTINEL Patterns

This directory contains step-by-step guides for common development tasks in SENTINEL.

## Available Patterns

| Pattern | When to Use |
|---------|-------------|
| [adding-api-endpoint.md](./adding-api-endpoint.md) | Adding new tRPC endpoints (admin, user, workspace) |
| [adding-database-model.md](./adding-database-model.md) | Adding new Prisma models with proper scoping |
| [adding-test.md](./adding-test.md) | Writing unit, integration, e2e, and security tests |
| [implementing-policy-rule.md](./implementing-policy-rule.md) | Adding policy conditions, operators, or context extractors |
| [encrypting-sensitive-data.md](./encrypting-sensitive-data.md) | Storing credentials, API keys, tokens securely |
| [adding-frontend-page.md](./adding-frontend-page.md) | Creating new React pages with workspace routing |
| [adding-ui-component.md](./adding-ui-component.md) | Building UI components with shadcn and Tailwind |

## Pattern Format

Each pattern follows a consistent structure:
1. **When to Use** - Scenarios where this pattern applies
2. **Prerequisites** - Required knowledge or setup
3. **Step-by-Step Guide** - Detailed implementation steps
4. **Code Examples** - Real code from the codebase
5. **Common Mistakes** - Pitfalls to avoid
6. **Real Examples** - Links to actual implementations

## Quick Reference

### Adding a feature end-to-end:
1. `adding-database-model.md` - Define the data model
2. `adding-api-endpoint.md` - Create API endpoints
3. `adding-frontend-page.md` - Build the UI
4. `adding-test.md` - Write tests

### Security-related changes:
1. `encrypting-sensitive-data.md` - For any credentials
2. `implementing-policy-rule.md` - For access control changes
3. `adding-test.md` (security section) - Security test patterns

## Key Principles

1. **Organization Scoping** - All data must be scoped to organizationId
2. **Workspace Scoping** - Workspace-level data uses workspaceId (null = org-wide)
3. **Soft Deletes** - Use deletedAt/deletedBy, not hard deletes
4. **Input Validation** - Always use Zod schemas
5. **Audit Logging** - Log admin actions with before/after snapshots
6. **Type Safety** - No `any` types, no type assertions (except `as const`)
