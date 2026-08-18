# ADR-002: Prisma for Database ORM

**Status**: Accepted
**Date**: 2024-01
**Deciders**: Project Team

## Context

SENTINEL needs a way to interact with PostgreSQL database. Requirements:

- Type-safe database queries
- Migration management
- Support for complex relationships (Organization → Users → Roles → Policies)
- Good TypeScript integration

## Decision

Use **Prisma** as the ORM instead of TypeORM, Drizzle, or raw SQL.

## Rationale

### Why Prisma

1. **Excellent TypeScript Support**: Generated types for all models and queries
2. **Declarative Schema**: Schema defined in Prisma Schema Language, not decorators or code
3. **Migration System**: Robust migration workflow with up/down migrations
4. **Query API**: Intuitive, type-safe query builder
5. **Prisma Studio**: Built-in database GUI for development
6. **Relations Handling**: Easy to work with nested relations

### Example

```prisma
// packages/db/prisma/schema.prisma
model Organization {
  id     String @id @default(cuid())
  name   String
  users  User[]
}

model User {
  id             String       @id @default(cuid())
  email          String       @unique
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
}
```

```typescript
// Type-safe query
const users = await prisma.user.findMany({
  where: { organizationId: org.id },
  include: { organization: true },
});
// TypeScript knows users[0].organization exists and is typed!
```

## Consequences

### Positive ✅

- **Type Safety**: All queries are fully typed
- **Developer Experience**: Great autocomplete, inline documentation
- **Migrations**: Easy to create and apply migrations
- **No SQL Injection**: Parameterized queries by default
- **Fast Development**: Less boilerplate than traditional ORMs

### Negative ❌

- **Query Performance**: Some complex queries slower than raw SQL
- **Limited Control**: Can't optimize every query perfectly
- **Vendor Lock-in**: Prisma-specific patterns
- **Schema Size**: Large schemas can make generated client big

## Alternatives Considered

### TypeORM

- **Pros**: Mature, feature-rich, supports multiple databases
- **Cons**: Decorator-based (verbose), TypeScript support not as good, more boilerplate
- **Why Not**: Worse DX than Prisma

### Drizzle

- **Pros**: Lightweight, SQL-like syntax, great TypeScript support
- **Cons**: Newer/less mature, smaller ecosystem
- **Why Not**: Too new in 2024, Prisma more proven

### Raw SQL (pg)

- **Pros**: Maximum control, best performance
- **Cons**: No type safety, manual migrations, SQL injection risk, verbose
- **Why Not**: Too low-level, prone to errors

### Kysely

- **Pros**: Type-safe SQL builder, lightweight
- **Cons**: No schema management, manual migrations, less opinionated
- **Why Not**: Prisma's integrated approach better for our use case

## Mitigation Strategies

For performance-critical queries:

- Use `prisma.$queryRaw` for optimized SQL when needed
- Add database indexes (defined in Prisma schema)
- Use `select` to fetch only needed fields
- Consider database views for complex aggregations

## Notes

- Prisma client is generated from schema, commit `prisma/schema.prisma` but not generated code
- Run `npx prisma generate` after schema changes
- Use `npx prisma migrate dev` in development
- Use `npx prisma migrate deploy` in production

## Related Decisions

- ADR-001: tRPC uses Prisma-generated types
- ADR-005: Credential encryption uses Prisma's `Json` type for encrypted data
