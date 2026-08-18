# SENTINEL Test Suite

This directory contains unit, integration, security, and E2E tests.

## Structure

```
test/
|-- unit/           # Unit tests (isolated, no database)
|-- integration/    # Integration tests (require database)
|-- security/       # Security-focused tests (require database)
|-- e2e/            # End-to-end tests (require dev server)
|-- helpers/        # Test utilities and factories
`-- setup/          # Test configuration
```

## Running Tests

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
```

`pnpm test` runs unit + integration. `pnpm test:all` runs unit + integration + E2E.

## Database Requirements

Integration and security tests use a real Postgres database:

- `TEST_DATABASE_URL` is preferred for tests.
- If `TEST_DATABASE_URL` is not set, tests fall back to `DATABASE_URL`.

See `TESTING.md` for schema sync and troubleshooting steps.

## Current Test Inventory (Defined)

- **Unit**: 69 tests
- **Integration**: 232 tests (skipped if DB missing)
- **Security**: 26 tests (skipped if DB missing)
- **E2E**: 10 tests (scaffolded, require dev server)

## Coverage

`pnpm test:coverage` writes a snapshot to `coverage/`. The latest snapshot in this repo reports **59.32% statement coverage** (see `coverage/coverage-final.json`).

## Helpful Test Utilities

- `test/helpers/db.ts`: clear/seed database
- `test/helpers/factory.ts`: entity factories
- `test/helpers/auth.ts`: auth context helpers
- `test/helpers/trpc.ts`: tRPC caller helpers
