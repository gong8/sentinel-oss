# Adding a Database Model

## When to Use This Pattern

Use this pattern when you need to add a new table/entity to the database.

## Prerequisites

- Understand Prisma schema syntax
- Know the relationships with other models
- Have database running locally

## Steps

### 1. Define the Model

**Location**: `packages/db/prisma/schema.prisma`

```prisma
model MyResource {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Resource fields
  name        String
  description String?
  enabled     Boolean @default(true)

  // Multi-tenancy (CRITICAL - every model needs this except Organization)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // Relations
  createdById String
  createdBy   User   @relation("MyResourceCreatedBy", fields: [createdById], references: [id])

  // Unique constraints (scoped by organization)
  @@unique([organizationId, name])

  // Indexes for common queries
  @@index([organizationId])
  @@index([enabled])
}
```

### 2. Update Related Models (if needed)

Add the reverse relation to related models:

```prisma
model Organization {
  // ... existing fields

  myResources MyResource[] // ← Add this
}

model User {
  // ... existing fields

  createdMyResources MyResource[] @relation("MyResourceCreatedBy") // ← Add this
}
```

### 3. Create Migration

```bash
cd packages/db
npx prisma migrate dev --name add_my_resource
```

This will:

- Generate SQL migration file
- Apply migration to your local database
- Regenerate Prisma Client with new types

### 4. Update Seed Data (Optional)

**Location**: `packages/db/prisma/seed.ts`

```typescript
// Add sample data for development
const sampleResource = await prisma.myResource.create({
  data: {
    name: 'Sample Resource',
    description: 'For development',
    enabled: true,
    organizationId: org.id,
    createdById: adminUser.id,
  },
});

console.log('Created sample resource:', sampleResource.id);
```

### 5. Test the Model

**Location**: `test/integration/db/schema.test.ts`

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { prisma } from '@sentinel/db';
import { createTestOrg, createTestUser } from '../../utils/factories';

describe('MyResource model', () => {
  let org: any;
  let user: any;

  beforeEach(async () => {
    org = await createTestOrg();
    user = await createTestUser(org.id);
  });

  test('creates resource', async () => {
    const resource = await prisma.myResource.create({
      data: {
        name: 'Test Resource',
        description: 'Test',
        organizationId: org.id,
        createdById: user.id,
      },
    });

    expect(resource.id).toBeDefined();
    expect(resource.name).toBe('Test Resource');
    expect(resource.organizationId).toBe(org.id);
  });

  test('enforces unique constraint per organization', async () => {
    // Create first resource
    await prisma.myResource.create({
      data: {
        name: 'Same Name',
        organizationId: org.id,
        createdById: user.id,
      },
    });

    // Duplicate in same org should fail
    await expect(
      prisma.myResource.create({
        data: {
          name: 'Same Name',
          organizationId: org.id,
          createdById: user.id,
        },
      }),
    ).rejects.toThrow();

    // Same name in different org should succeed
    const otherOrg = await createTestOrg();
    const otherUser = await createTestUser(otherOrg.id);

    const resource = await prisma.myResource.create({
      data: {
        name: 'Same Name',
        organizationId: otherOrg.id,
        createdById: otherUser.id,
      },
    });

    expect(resource.id).toBeDefined();
  });

  test('cascades delete when organization deleted', async () => {
    const resource = await prisma.myResource.create({
      data: {
        name: 'Test',
        organizationId: org.id,
        createdById: user.id,
      },
    });

    // Delete organization
    await prisma.organization.delete({
      where: { id: org.id },
    });

    // Resource should be deleted too
    const found = await prisma.myResource.findUnique({
      where: { id: resource.id },
    });

    expect(found).toBeNull();
  });
});
```

## Common Mistakes

### ❌ Forgetting Organization Scoping

```prisma
// BAD - No organizationId!
model MyResource {
  id   String @id
  name String @unique // ← Only one "Test" across ALL orgs!
}
```

### ✅ Always Include Organization Foreign Key

```prisma
// GOOD
model MyResource {
  id             String @id
  name           String
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, name]) // ← Scoped unique constraint
}
```

### ❌ Missing onDelete Behavior

```prisma
// BAD - Orphaned records when org deleted
model MyResource {
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  // Missing: onDelete: Cascade
}
```

### ✅ Always Specify Cascade

```prisma
// GOOD
model MyResource {
  organizationId String
  organization   Organization @relation(
    fields: [organizationId],
    references: [id],
    onDelete: Cascade // ← Deletes resource when org deleted
  )
}
```

### ❌ Forgetting Indexes

```prisma
// BAD - Slow queries on organizationId
model MyResource {
  organizationId String
  // No index!
}
```

### ✅ Add Indexes for Filtered Fields

```prisma
// GOOD
model MyResource {
  organizationId String
  enabled        Boolean

  @@index([organizationId]) // ← Fast org filtering
  @@index([enabled])         // ← Fast enabled filtering
}
```

## Real Examples in Codebase

See existing models in `packages/db/prisma/schema.prisma`:

- **Organization**: Root multi-tenant entity
- **User**: User with organization scoping
- **Policy**: Policy with composite unique constraint
- **AuditLogEntry**: Audit log with multiple indexes

## Advanced Model Patterns

### Workspace-Scoped Models

Use when resources can be scoped to a specific workspace or be organization-wide.

```prisma
model WorkspaceScopedResource {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  name        String

  // Multi-tenant isolation (REQUIRED)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // Workspace scoping (null = org-wide, specific = workspace-scoped)
  workspaceId String?
  workspace   Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([organizationId, workspaceId, name])
  @@index([organizationId])
  @@index([workspaceId])
}
```

**Query pattern for workspace-scoped resources:**

```typescript
// Get resources visible to a workspace (org-wide + workspace-specific)
const resources = await prisma.workspaceScopedResource.findMany({
  where: {
    organizationId,
    OR: [
      { workspaceId: null },      // Org-wide resources
      { workspaceId: workspaceId } // Workspace-specific resources
    ]
  }
});
```

### Soft Delete Pattern

Use when you need to preserve records for audit/recovery instead of hard deleting.

```prisma
model SoftDeletableResource {
  id        String    @id @default(cuid())
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  // Soft delete fields
  deletedAt DateTime?
  deletedBy String?
  deletedByUser User? @relation("ResourceDeletedBy", fields: [deletedBy], references: [id])

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, deletedAt])
}
```

**Query pattern for soft-deleted resources:**

```typescript
// Get only active (non-deleted) resources
const activeResources = await prisma.softDeletableResource.findMany({
  where: {
    organizationId,
    deletedAt: null // Exclude soft-deleted
  }
});

// Soft delete a resource
await prisma.softDeletableResource.update({
  where: { id: resourceId },
  data: {
    deletedAt: new Date(),
    deletedBy: userId
  }
});
```

### Encrypted Field Pattern

Use for storing sensitive data like API keys, credentials, or tokens.

```prisma
model SecureResource {
  id String @id @default(cuid())

  // Encrypted fields - store encrypted, never log plaintext
  apiKey      String?  // Encrypted with AES-256-GCM
  credentials String?  // Encrypted JSON
  accessToken String?  // Encrypted OAuth token

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
```

**Usage with encryption service:**

```typescript
import { encryptionService } from '@sentinel/api/services/encryption';

// Encrypt before storing
const encrypted = encryptionService.encrypt(plainTextApiKey);
await prisma.secureResource.create({
  data: {
    apiKey: encrypted,
    organizationId
  }
});

// Decrypt when reading
const resource = await prisma.secureResource.findUnique({ where: { id } });
const plainText = encryptionService.decrypt(resource.apiKey);
```

**CRITICAL**: Never log plaintext values of encrypted fields.

### Audit Trail Pattern

Use when you need to track who created/modified resources.

```prisma
model AuditableResource {
  id String @id @default(cuid())

  // Audit fields
  createdById String
  createdBy   User @relation("ResourceCreatedBy", fields: [createdById], references: [id])

  updatedById String?
  updatedBy   User? @relation("ResourceUpdatedBy", fields: [updatedById], references: [id])

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
```

**Update related User model:**

```prisma
model User {
  // ... existing fields

  createdResources  AuditableResource[] @relation("ResourceCreatedBy")
  updatedResources  AuditableResource[] @relation("ResourceUpdatedBy")
}
```

### Status Flow Pattern

Use for approval workflows, requests, or any entity with status transitions.

```prisma
enum RequestStatus {
  PENDING
  APPROVED
  DENIED
  EXPIRED
  CANCELLED
}

model ApprovalRequest {
  id        String        @id @default(cuid())
  createdAt DateTime      @default(now())
  status    RequestStatus @default(PENDING)

  // Resolution fields
  resolvedAt   DateTime?
  resolvedBy   String?
  resolvedByUser User? @relation(fields: [resolvedBy], references: [id])
  expiresAt    DateTime

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, status])
  @@index([expiresAt])
}
```

**Status transition helper:**

```typescript
// Resolve a request
await prisma.approvalRequest.update({
  where: { id: requestId },
  data: {
    status: 'APPROVED',
    resolvedAt: new Date(),
    resolvedBy: userId
  }
});

// Find expired pending requests
const expired = await prisma.approvalRequest.findMany({
  where: {
    status: 'PENDING',
    expiresAt: { lt: new Date() }
  }
});
```

## Index Strategy

Always include appropriate indexes for query performance:

```prisma
// Always index:
@@index([organizationId])           // Multi-tenant queries (REQUIRED)
@@index([workspaceId])              // Workspace scoping
@@index([deletedAt])                // Soft delete queries
@@index([createdAt])                // Sorting by creation time
@@index([status])                   // Status filtering
@@index([organizationId, status])   // Combined filtering (most common)
@@index([organizationId, deletedAt]) // Active records per org
@@index([expiresAt])                // Time-based queries
```

**Index guidelines:**

1. **Always index `organizationId`** - Every query filters by org
2. **Index fields used in WHERE clauses** - Status, type, enabled flags
3. **Create composite indexes for common query patterns** - `[organizationId, status]`
4. **Index foreign keys** - Improves JOIN performance
5. **Index date fields used for sorting/filtering** - `createdAt`, `expiresAt`

## Field Type Reference

```prisma
// Strings
name        String          // Required string
description String?         // Optional string
slug        String @unique  // Unique string

// Numbers
priority    Int             // Integer
score       Float           // Decimal

// Booleans
enabled     Boolean @default(true)

// Dates
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt

// Enums
role        Role    // From enum Role { ADMIN, USER }

// JSON (for flexible data)
metadata    Json?

// Relations
organizationId String
organization   Organization @relation(fields: [organizationId], references: [id])
```

## Testing Your Migration

```bash
# Apply migration to local DB
npm run db:migrate

# Reset database and re-seed
npm run db:reset

# Open Prisma Studio to view data
npm run db:studio

# Generate Prisma Client (if types not updating)
npm run db:generate
```

## Rollback

If you need to undo the migration:

```bash
# Revert last migration
cd packages/db
npx prisma migrate resolve --rolled-back <migration_name>

# Delete migration file
rm -rf prisma/migrations/<timestamp>_add_my_resource

# Reset database
npm run db:reset
```

## Next Steps

After creating the model:

1. ✅ Add API endpoints (see [Adding an API Endpoint](./adding-api-endpoint.md))
2. ✅ Add factory function in `test/utils/factories.ts`
