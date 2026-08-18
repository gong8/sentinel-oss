# Adding an API Endpoint

## When to Use This Pattern

Use this pattern when adding a new tRPC endpoint (admin or user) that interacts with the database.

## Prerequisites

- Database model exists (see [Adding a Database Model](./adding-database-model.md))
- You know whether this is an admin or user endpoint

## Steps

### 1. Define Input Schema

**Location**: `packages/api/src/trpc/admin/[resource].ts` or `packages/api/src/trpc/user/[resource].ts`

```typescript
import { z } from 'zod';

// Define input validation schema
const createInput = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
});

// TypeScript type is inferred from Zod schema
type CreateInput = z.infer<typeof createInput>;
```

### 2. Create tRPC Procedure

**For Admin Endpoints** (requires admin role):

```typescript
import { adminProcedure, router } from '../init';
import { prisma } from '@sentinel/db';

export const create = adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
  // ctx.auth.userId - Current admin user ID
  // ctx.auth.organizationId - Current organization ID

  // Always scope by organization!
  return await prisma.myResource.create({
    data: {
      ...input,
      organizationId: ctx.auth.organizationId,
      createdBy: ctx.auth.userId,
    },
  });
});
```

**For User Endpoints** (any authenticated user):

```typescript
import { userProcedure, router } from '../init';

export const get = userProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    // Verify user has access to this resource
    const resource = await prisma.myResource.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId, // ← Security: org scoping!
      },
    });

    if (!resource) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }

    return resource;
  });
```

### 3. Add to Router

**Location**: Same file as procedures

```typescript
export const myResourceRouter = router({
  list: list,
  get: get,
  create: create,
  update: update,
  delete: deleteResource, // "delete" is reserved keyword
});
```

### 4. Wire into Main Router

**Location**: `packages/api/src/trpc/admin/index.ts` or `packages/api/src/trpc/user/index.ts`

```typescript
import { router } from '../init';
import { myResourceRouter } from './myResource';

export const adminRouter = router({
  // ... existing routers
  myResource: myResourceRouter, // ← Add here
});
```

### 5. Test the Endpoint

**Location**: `test/integration/api/admin/myResource.test.ts`

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { createCaller } from '../../../../packages/api/src/trpc/init';
import { createTestOrg, createTestUser } from '../../../utils/factories';
import { prisma } from '@sentinel/db';

describe('admin.myResource', () => {
  let caller: ReturnType<typeof createCaller>;
  let org: any;
  let user: any;

  beforeEach(async () => {
    org = await createTestOrg();
    user = await createTestUser(org.id, { isAdmin: true });
    caller = createCaller({
      auth: {
        userId: user.id,
        organizationId: org.id,
        roles: ['ADMIN'],
      },
    });
  });

  test('creates resource', async () => {
    const result = await caller.admin.myResource.create({
      name: 'Test Resource',
      description: 'Test description',
    });

    expect(result.name).toBe('Test Resource');
    expect(result.organizationId).toBe(org.id);
  });

  test('scopes by organization', async () => {
    // Create resource in different org
    const otherOrg = await createTestOrg();
    const otherResource = await prisma.myResource.create({
      data: {
        name: 'Other Resource',
        organizationId: otherOrg.id,
      },
    });

    // Should not be able to get other org's resource
    await expect(caller.admin.myResource.get({ id: otherResource.id })).rejects.toThrow(
      'NOT_FOUND',
    );
  });
});
```

### 6. Use in Frontend

**Location**: `packages/web/src/pages/admin/MyResources.tsx`

```typescript
import { trpc } from '../../lib/trpc';

export default function MyResourcesPage() {
  // List resources
  const { data: resources, isLoading } = trpc.admin.myResource.list.useQuery();

  // Create resource
  const { mutate: createResource } = trpc.admin.myResource.create.useMutation({
    onSuccess: () => {
      // Invalidate list to refresh
      trpc.admin.myResource.list.invalidate();
    },
  });

  const handleCreate = () => {
    createResource({
      name: 'New Resource',
      description: 'Description',
      enabled: true,
    });
    // TypeScript ensures these fields match createInput schema!
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>My Resources</h1>
      <button onClick={handleCreate}>Create</button>
      <ul>
        {resources?.map((r) => (
          <li key={r.id}>{r.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Common Mistakes

### ❌ Forgetting Organization Scoping

```typescript
// BAD - Can access other orgs' data!
const resource = await prisma.myResource.findUnique({
  where: { id: input.id },
});
```

### ✅ Always Scope by Organization

```typescript
// GOOD
const resource = await prisma.myResource.findFirst({
  where: {
    id: input.id,
    organizationId: ctx.auth.organizationId, // ← Critical!
  },
});
```

### ❌ Returning Internal Fields

```typescript
// BAD - Leaks internal data
return await prisma.user.findMany();
```

### ✅ Use Select

```typescript
// GOOD
return await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    // Don't return accessToken, internal fields, etc.
  },
});
```

### ❌ No Input Validation

```typescript
// BAD - No validation
export const create = adminProcedure.mutation(async ({ input }) => {
  // input is any!
  // ...
});
```

### ✅ Always Validate with Zod

```typescript
// GOOD
export const create = adminProcedure
  .input(createInput) // ← Zod schema
  .mutation(async ({ input }) => {
    // input is typed!
    // ...
  });
```

## Procedure Types Reference

| Procedure | Description | Use Case |
|-----------|-------------|----------|
| `publicProcedure` | No auth required | Public endpoints, health checks |
| `protectedProcedure` | Requires authentication | Any authenticated user |
| `adminProcedure` | Requires admin role | Admin panel operations |
| `orgOwnerProcedure` | Requires org owner | Billing, org settings |
| `workspaceAdminProcedure` | Requires workspace admin | Workspace-scoped admin ops |
| `workspaceMemberProcedure` | Requires workspace membership | Workspace-scoped member ops |

## Advanced Patterns

### Workspace-Scoped Endpoints

Use workspace procedures when operations should be scoped to a specific workspace:

```typescript
import { workspaceAdminProcedure } from '../init';

// Workspace admin endpoint
export const create = workspaceAdminProcedure
  .input(createInput)
  .mutation(async ({ ctx, input }) => {
    return await prisma.myResource.create({
      data: {
        ...input,
        organizationId: ctx.auth.organizationId,
        workspaceId: ctx.workspaceId, // From workspace context
        createdBy: ctx.auth.userId,
      },
    });
  });
```

### Feature-Gated Endpoints

Gate endpoints behind authorization using the appropriate procedure:

```typescript
import { requireFeature } from '../middleware/features';

// With admin authorization
export const advancedFeature = adminProcedure
  .use(requireFeature('advanced_policies'))
  .input(input)
  .mutation(async ({ ctx, input }) => {
    // Only executes if organization has 'advanced_policies' feature
    // ...
  });
```

### Admin Action Logging

Always log admin actions with before/after snapshots for audit compliance:

```typescript
// Always log admin actions with snapshots
await prisma.adminActionLog.create({
  data: {
    organizationId: ctx.auth.organizationId,
    adminUserId: ctx.auth.userId,
    actionType: 'POLICY_CREATE',
    resourceType: 'POLICY',
    resourceId: policy.id,
    resourceName: policy.name,
    afterSnapshot: policy,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  },
});
```

For updates, capture both before and after states:

```typescript
// Capture before state
const beforeSnapshot = await prisma.policy.findUnique({
  where: { id: input.id, organizationId: ctx.auth.organizationId },
});

// Perform update
const updated = await prisma.policy.update({
  where: { id: input.id, organizationId: ctx.auth.organizationId },
  data: input,
});

// Log with both snapshots
await prisma.adminActionLog.create({
  data: {
    organizationId: ctx.auth.organizationId,
    adminUserId: ctx.auth.userId,
    actionType: 'POLICY_UPDATE',
    resourceType: 'POLICY',
    resourceId: updated.id,
    resourceName: updated.name,
    beforeSnapshot,
    afterSnapshot: updated,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  },
});
```

### Deletion Impact Analysis

Before deleting resources, check for dependencies and blockers:

```typescript
import { getDeletionImpact } from '../../services/deletionImpact';
import { TRPCError } from '@trpc/server';

export const deleteResource = adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Before deleting, check impact
    const impact = await getDeletionImpact(input.id, ctx.auth.organizationId);

    if (impact.hasBlockers) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot delete: ' + impact.blockers.join(', '),
      });
    }

    // Proceed with deletion...
  });
```

### Soft Delete Pattern

Prefer soft deletes over hard deletes for audit trails and recovery:

```typescript
export const deleteResource = adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Soft delete instead of hard delete
    const deleted = await prisma.policy.update({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.auth.userId,
      },
    });

    // Log the deletion
    await prisma.adminActionLog.create({
      data: {
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.userId,
        actionType: 'POLICY_DELETE',
        resourceType: 'POLICY',
        resourceId: deleted.id,
        resourceName: deleted.name,
        beforeSnapshot: deleted,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    return { success: true };
  });
```

Remember to exclude soft-deleted records in list queries:

```typescript
export const list = adminProcedure.query(async ({ ctx }) => {
  return await prisma.policy.findMany({
    where: {
      organizationId: ctx.auth.organizationId,
      deletedAt: null, // Exclude soft-deleted records
    },
  });
});
```

## Real Examples in Codebase

- **Policies**: `packages/api/src/trpc/admin/policies.ts`
- **Users**: `packages/api/src/trpc/admin/users.ts`
- **MCP Servers**: `packages/api/src/trpc/admin/mcpServers.ts`
- **Audit Logs**: `packages/api/src/trpc/admin/auditLogEntries.ts`

## Testing

```bash
# Run integration tests
npm run test:integration

# Run specific test file
npm test -- myResource.test.ts

# Watch mode
npm test -- --watch myResource.test.ts
```

## Next Steps

After creating the endpoint:

1. ✅ Verify tests pass
2. ✅ Test in browser (manual)
4. ✅ Add to admin/user sidebar navigation if needed
