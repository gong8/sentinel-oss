# E2E Tests - Database Cleanup

## Problem

E2E tests were polluting the development database with test data (policies, users, etc.) that persisted after test runs.

## Solution

We've implemented Playwright global setup/teardown hooks that:

1. **Before tests**: Capture a snapshot of the database state
2. **After tests**: Restore the database by deleting only test-created data

## How It Works

### Global Setup (`test/setup/e2e-global-setup.ts`)

- Runs once before all E2E tests
- Captures current state of all tables
- Saves snapshot to `.db-snapshot.json`

### Global Teardown (`test/setup/e2e-global-teardown.ts`)

- Runs once after all E2E tests complete
- Identifies data created during tests (not in snapshot)
- Deletes test data in correct order (respecting foreign keys)
- Restores modified records (e.g., toggled policies)
- Cleans up snapshot file

## What Gets Cleaned Up

The cleanup process removes:

- ✅ Policies created during tests (e.g., "E2E Test Policy")
- ✅ Users created during tests
- ✅ User roles assigned during tests
- ✅ User MCP configs created during tests
- ✅ Audit log entries from test activities
- ✅ Permission requests from tests

And restores:

- ✅ Policy enabled/disabled states (if toggled during tests)

## Running E2E Tests

```bash
# Run all E2E tests (cleanup happens automatically)
pnpm test:e2e

# Run specific test
pnpm playwright test policy-enforcement
```

## Verification

After running E2E tests, check your dev database:

```bash
# Check policies - should only have seed data
psql $DATABASE_URL -c "SELECT description FROM \"Policy\";"

# Check users - should only have seed users
psql $DATABASE_URL -c "SELECT email FROM \"User\";"
```

## Notes

- The snapshot file (`.db-snapshot.json`) is automatically created and cleaned up
- It's gitignored to prevent accidental commits
- Cleanup happens even if tests fail
- If cleanup fails, a warning is logged (won't fail the test run)

## Troubleshooting

If you see leftover test data:

1. Check that global setup/teardown are configured in `playwright.config.ts`
2. Verify `.db-snapshot.json` exists during test run
3. Check console output for cleanup errors
4. Manually clean: `pnpm db:reset:seed`
