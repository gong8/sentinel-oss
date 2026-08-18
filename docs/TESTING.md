# Testing Guide

## Test Infrastructure Overview

```
test/
├── unit/           # 120 test files - Fast, mocked
├── integration/    # 33 test files - Real database
├── e2e/            # 51 spec files - Browser testing
├── security/       # 6 test files - Security validation
├── fixtures/       # Mock MCP server, test data
├── helpers/        # Test utilities
│   ├── db.ts              # Database helpers
│   ├── factory.ts         # Test data factories
│   ├── trpc.ts            # tRPC caller helpers
│   ├── auth.ts            # Auth context mocks
│   ├── tenant-isolation.ts # Parallel test isolation
│   ├── integration.ts     # Integration helpers
│   ├── unit-test-mocks.ts # Unit test mocking
│   ├── e2e-fixtures.ts    # Playwright fixtures
│   └── e2e.ts             # E2E utilities
└── setup/
    ├── setup.ts           # Vitest global setup
    ├── playwright.config.ts # Playwright config
    ├── e2e-global-setup.ts  # E2E DB setup
    ├── e2e-global-teardown.ts # E2E cleanup
    └── mock-mcp-server.js # Mock MCP server
```

## Database Setup

### Important: Separate Test and Development Databases

This project uses **separate databases** for development and testing:

- **Development Database**: Uses `DATABASE_URL` from `.env`
- **Test Database**: Uses `TEST_DATABASE_URL` from `.env` (required for integration/security/e2e tests)

### Schema Synchronization

**CRITICAL**: When you make schema changes (add/remove columns, tables, etc.), you **MUST** update **BOTH** databases:

1. **Development Database** (for running the app):

   ```bash
   pnpm db:push
   # or
   pnpm db:migrate
   ```

2. **Test Database** (for running tests):

   ```bash
   # Get TEST_DATABASE_URL from .env
   TEST_DATABASE_URL=$(grep "^TEST_DATABASE_URL" .env | cut -d'=' -f2 | tr -d '"')

   # Push schema to test database
   DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @sentinel/db exec prisma db push --skip-generate

   # Or if using migrations:
   DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @sentinel/db exec prisma migrate deploy
   ```

### Test Database Management

```bash
# Push schema to test database
cd packages/db
TEST_DATABASE_URL=$(grep "^TEST_DATABASE_URL" ../../.env | cut -d'=' -f2 | tr -d '"')
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push --skip-generate

# Reset test database
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate reset --force
```

## Running Tests

### All Tests

```bash
pnpm test
```

### By Category

```bash
pnpm test:unit          # Unit tests only (fast, mocked)
pnpm test:integration   # Integration tests (requires TEST_DATABASE_URL)
pnpm test:e2e           # E2E tests (requires running servers)
pnpm test:security      # Security tests
```

### With Coverage

```bash
pnpm test:coverage
```

### Watch Mode

```bash
pnpm test:watch
```

## Test Database Configuration

The test setup (`test/setup/setup.ts`) automatically:

- Loads `.env` file
- Uses `TEST_DATABASE_URL` if set, otherwise falls back to `DATABASE_URL`
- Sets `NODE_ENV=test`
- Validates `ENCRYPTION_KEY` is present

Make sure your `.env` file has:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/sentinel"
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/sentinel_test"
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
```

**Note**: `ENCRYPTION_KEY` must be exactly 64 hexadecimal characters (32 bytes) for AES-256-GCM encryption.

## Parallel Test Execution

Tests use tenant isolation for parallel execution:

```typescript
import { createTestTenant, TestTenant } from '../helpers/tenant-isolation';

let tenant: TestTenant;
beforeEach(async () => {
  tenant = await createTestTenant();
});
afterEach(async () => {
  await tenant.cleanup();
});

test('test with isolated org', async () => {
  // All data uses tenant.orgId
  const policy = await createTestPolicy({ organizationId: tenant.orgId });
});
```

## E2E Test Setup

E2E tests require the following to be running:

1. API server running
2. Web dev server running
3. Mock MCP server running
4. Test database available

Playwright spawns these via `webServer` config in `playwright.config.ts`.

## Security Tests

Security tests validate critical boundaries:

| Test File | Purpose |
|-----------|---------|
| `credential-leaks.test.ts` | No credential exposure |
| `policy-bypass.test.ts` | DENY cannot be bypassed |
| `organization-boundaries.test.ts` | Org isolation |
| `workspace-boundaries.test.ts` | Workspace isolation |
| `workspace-authorization.test.ts` | Role enforcement |
| `xss.test.ts` | XSS prevention |

## Common Issues

### Issue: Tests fail with "column does not exist" errors

**Cause**: Schema changes were only applied to the development database, not the test database.

**Solution**: Push schema to test database:

```bash
cd packages/db
TEST_DATABASE_URL=$(grep "^TEST_DATABASE_URL" ../../.env | cut -d'=' -f2 | tr -d '"')
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push --skip-generate
```

### Issue: Tests fail with "table does not exist" errors

**Cause**: Test database is missing tables entirely.

**Solution**:

1. Check if `TEST_DATABASE_URL` is set correctly in `.env`
2. Run migrations/push against the test database
3. If the test database is empty, you may need to run migrations from scratch:
   ```bash
   DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @sentinel/db exec prisma migrate deploy
   ```

### Issue: Tests hang

**Cause**: Database connection not closed properly.

**Solution**: Use `disconnectDatabase()` in `afterAll`:

```typescript
import { disconnectDatabase } from '../helpers/db';

afterAll(async () => {
  await disconnectDatabase();
});
```

### Issue: Tests interfere with each other

**Cause**: Shared data between tests without proper isolation.

**Solution**: Use `createTestTenant()` for isolation (see Parallel Test Execution section above).

## Best Practices

1. **Always update both databases** after schema changes
2. **Check test database schema** if tests suddenly start failing after schema changes
3. **Use migrations** in production, but `db:push` is fine for development/testing
4. **Document schema changes** in commit messages so others know to update both databases
5. **Use tenant isolation** for tests that create data to enable parallel execution
6. **Clean up after tests** using `afterEach` or `afterAll` hooks

## Verifying Schema Sync

To verify both databases have the same schema:

```bash
# Check development database
psql $DATABASE_URL -c "\d \"AuditLogEntry\"" | grep -E "matchedPolicyIds|userRoles|policySnapshot"

# Check test database
TEST_DATABASE_URL=$(grep "^TEST_DATABASE_URL" .env | cut -d'=' -f2 | tr -d '"')
psql "$TEST_DATABASE_URL" -c "\d \"AuditLogEntry\"" | grep -E "matchedPolicyIds|userRoles|policySnapshot"
```

Both should show the same columns.

## Quick Fix Script

If tests fail with "column does not exist" errors after schema changes:

```bash
# Update test database schema
cd packages/db
TEST_DATABASE_URL=$(grep "^TEST_DATABASE_URL" ../../.env | cut -d'=' -f2 | tr -d '"')
if [ -n "$TEST_DATABASE_URL" ]; then
  DATABASE_URL="$TEST_DATABASE_URL" dotenv -e ../../.env -- prisma db push --skip-generate
else
  echo "No TEST_DATABASE_URL found - tests will use DATABASE_URL"
fi
```
