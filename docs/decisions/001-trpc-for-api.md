# ADR-001: tRPC for API Layer

**Status**: Accepted
**Date**: 2024-01
**Deciders**: Project Team

## Context

SENTINEL needs an API layer to connect the React frontend to the backend services. The API must:

- Provide type safety between frontend and backend
- Support both admin and user endpoints
- Be easy to extend as features are added
- Minimize boilerplate code

## Decision

Use **tRPC** as the API layer instead of REST or GraphQL.

## Rationale

### Why tRPC

1. **End-to-End Type Safety**: TypeScript types flow automatically from backend to frontend without codegen
2. **Zero Boilerplate**: No need to define OpenAPI schemas, generate clients, or maintain type definitions
3. **Developer Experience**: Autocomplete, inline errors, refactoring support in IDE
4. **Perfect for Internal APIs**: SENTINEL's frontend and backend are tightly coupled - tRPC excels here
5. **React Query Integration**: Built-in React hooks for queries and mutations

### Example

```typescript
// Backend (packages/api/src/trpc/admin/users.ts)
export const create = adminProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    return await prisma.user.create({ data: input });
  });

// Frontend (packages/web/src/pages/admin/Users.tsx)
const { mutate } = trpc.admin.users.create.useMutation();
mutate({ email: 'test@example.com' });
//      ^ TypeScript knows this must be an email!
```

## Consequences

### Positive ✅

- **No Type Drift**: Frontend always matches backend types
- **Faster Development**: No manual API client code
- **Better Refactoring**: Rename a field, TypeScript catches all usages
- **Less Testing Needed**: Type errors caught at compile time, not runtime

### Negative ❌

- **tRPC-Specific**: Not suitable if we need a public REST API later
- **Learning Curve**: Developers need to understand tRPC concepts
- **Less Standard**: REST is more universal
- **Vendor Lock-in**: Harder to migrate away from tRPC later

## Alternatives Considered

### REST + OpenAPI

- **Pros**: Standard, universal, tooling mature
- **Cons**: Requires codegen, manual type sync, more boilerplate
- **Why Not**: Too much overhead for internal API

### GraphQL

- **Pros**: Flexible queries, industry standard
- **Cons**: Overkill for SENTINEL's use case, requires schema management, resolver boilerplate
- **Why Not**: Complexity not justified for our needs

### gRPC

- **Pros**: Fast, type-safe, binary protocol
- **Cons**: Not web-friendly, harder to debug, requires protobuf
- **Why Not**: Designed for microservices, not web apps

## Notes

- If SENTINEL ever needs a public API, we can add REST endpoints alongside tRPC
- tRPC is used only for internal frontend ↔ backend communication
- MCP proxy uses standard HTTP/SSE (not tRPC) for external communication

## Related Decisions

- ADR-002: Prisma provides the database types that tRPC procedures use
- ADR-004: Monorepo allows tRPC to share types between packages
