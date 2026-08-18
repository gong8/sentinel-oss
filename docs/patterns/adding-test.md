# Adding a Test

## When to Use This Pattern

Use this pattern when adding unit tests, integration tests, E2E tests, or security tests to SENTINEL.

## Test Structure Overview

```
test/
├── unit/           # 120+ files - Fast, mocked, no DB
├── integration/    # 33+ files - Real DB required
├── e2e/            # 51+ files - Full browser, Playwright
├── security/       # 6 files - Security validation
├── fixtures/       # Test data fixtures
├── helpers/        # Test utilities
├── setup/          # Test configuration
├── reporters/      # Custom test reporters
├── seed-generation/# Test data generation
└── results/        # Test output files
```

## Test Types Comparison

| Type            | Purpose                      | Speed  | Database | Browser | When to Use                          |
| --------------- | ---------------------------- | ------ | -------- | ------- | ------------------------------------ |
| **Unit**        | Test functions in isolation  | Fast   | Mocked   | No      | Business logic, utilities, services  |
| **Integration** | Test API + database together | Medium | Real     | No      | tRPC endpoints, DB queries, auth     |
| **E2E**         | Test full user workflows     | Slow   | Real     | Yes     | Critical paths, browser interactions |
| **Security**    | Test security boundaries     | Medium | Real     | No      | Org isolation, policy enforcement    |

---

## Test Helpers Reference

### Database Helpers (`test/helpers/db.ts`)

Essential utilities for managing test database state.

```typescript
import {
  hasDatabaseUrl,
  isDatabaseAvailable,
  clearDatabase,
  seedTestData,
  disconnectDatabase
} from '../helpers/db';

// Skip tests when database is unavailable
describe.skipIf(!hasDatabaseUrl())('Feature requiring DB', () => {
  beforeEach(async () => {
    await clearDatabase(); // Clean slate for each test
  });

  afterAll(async () => {
    await disconnectDatabase(); // Cleanup connections
  });
});

// Seed basic test data
const { org, adminUser, regularUser, adminRole, userRole } = await seedTestData();
```

### Factory Pattern (`test/helpers/factory.ts`)

Generate consistent test data with sensible defaults.

```typescript
import {
  createTestOrganization,
  createTestUser,
  createTestAdmin,
  createTestRole,
  createTestPolicy,
  createTestMcpServer,
  createTestAgent,
  createTestWorkspace,
  createTestWorkspaceMember,
  createTestWorkspaceAdmin,
  createTestOrgOwner,
  createTestAuditLogEntry,
  createTestUserWithWorkspace,
  getAdminWithRoles,
} from '../helpers/factory';

// Create entities with defaults
const org = await createTestOrganization({ name: 'Test Org' });
const user = await createTestUser({ organizationId: org.id });
const admin = await createTestAdmin({ organizationId: org.id });

// Create with specific properties
const policy = await createTestPolicy({
  organizationId: org.id,
  effect: 'DENY',
  matchers: ['role:User'],
  toolPatterns: ['github.com::delete*'],
});

const mcpServer = await createTestMcpServer({
  organizationId: org.id,
  name: 'GitHub MCP',
  url: 'https://github-mcp.example.com',
  authType: 'API_KEY',
});

const workspace = await createTestWorkspace({
  organizationId: org.id,
  name: 'Dev Workspace',
});

const member = await createTestWorkspaceMember({
  workspaceId: workspace.id,
  userId: user.id,
  role: 'MEMBER', // or 'ADMIN'
});
```

### tRPC Testing (`test/helpers/trpc.ts`)

Create authenticated tRPC callers for testing endpoints.

```typescript
import {
  createAdminCaller,
  createUserCaller,
  createCallerWithUser,
  createCallerWithAuth,
  createPublicCaller,
  createProxyCaller,
  createMockContext,
  TEST_PROXY_API_KEY,
} from '../helpers/trpc';

// Quick callers with mock users
const adminCaller = createAdminCaller();
const result = await adminCaller.admin.policies.list();

const userCaller = createUserCaller();
const tools = await userCaller.user.tools.list();

// Caller with real database user (for integration tests)
const dbUser = await prisma.user.findUnique({
  where: { id: userId },
  include: { userRoles: { include: { role: true } } },
});
const caller = createCallerWithUser(dbUser, {
  isOrgOwner: true,
  workspaceIds: ['ws-1', 'ws-2'],
  adminWorkspaceIds: ['ws-1'],
});

// Public caller (no auth)
const publicCaller = createPublicCaller();
await expect(publicCaller.admin.users.list()).rejects.toThrow();

// Proxy caller (for service-to-service endpoints)
const proxyCaller = createProxyCaller();
```

### Tenant Isolation (`test/helpers/tenant-isolation.ts`)

Enable parallel test execution with isolated organizations.

```typescript
import {
  createTestTenant,
  createTestTenants,
  cleanupTenants,
  type TestTenant,
} from '../helpers/tenant-isolation';

describe('Feature', () => {
  let tenant: TestTenant;

  beforeEach(async () => {
    tenant = await createTestTenant();
  });

  afterEach(async () => {
    await tenant.cleanup(); // Removes all org-scoped data
  });

  test('uses isolated data', async () => {
    // tenant.orgId - Organization ID for this test
    // tenant.orgName - Organization name (for debugging)
    const user = await createTestUser({ organizationId: tenant.orgId });
  });
});

// For cross-org isolation testing
const [tenant1, tenant2] = await createTestTenants(2);
// ... test isolation between tenants
await cleanupTenants([tenant1, tenant2]);
```

### Auth Mocks (`test/helpers/auth.ts`)

Create mock authentication contexts.

```typescript
import {
  createMockUser,
  createMockRole,
  createAuthContext,
  createAdminAuthContext,
  createUserAuthContext,
} from '../helpers/auth';

// Create mock user with roles
const mockUser = createMockUser({
  id: 'user-123',
  email: 'test@example.com',
  organizationId: 'org-123',
  roles: [
    { name: 'Admin', isAdmin: true },
    { name: 'User', isAdmin: false },
  ],
});

// Create auth context from user
const authContext = createAuthContext(mockUser, {
  isOrgOwner: true,
  workspaceIds: ['ws-1'],
  adminWorkspaceIds: ['ws-1'],
});

// Quick auth contexts
const adminAuth = createAdminAuthContext();
const userAuth = createUserAuthContext();
```

### Unit Test Mocks (`test/helpers/unit-test-mocks.ts`)

Shared mock utilities for unit tests.

```typescript
import {
  createAdminContext,
  createUserContext,
  createMockPrisma,
  createMockLogger,
  createMockPermissionRequest,
  createMockPolicy,
  createMockMcpServer,
  createMockUserWithRoles,
  expectTRPCError,
} from '../helpers/unit-test-mocks';

// Admin context with headers for audit logging
const ctx = createAdminContext({
  organizationId: 'org-123',
  userId: 'admin-123',
  isOrgOwner: true,
  isAdmin: true,
});

// Mock Prisma client
const mockPrisma = createMockPrisma();
mockPrisma.policy.findMany.mockResolvedValue([createMockPolicy()]);

// Mock logger
const mockLogger = createMockLogger();

// Assert tRPC errors
await expectTRPCError(
  promise,
  'NOT_FOUND',
  'Policy not found'
);
```

### Admin Router Test Helpers (`test/helpers/admin-router-test.ts`)

Utilities for testing admin tRPC routers.

```typescript
import {
  createMockContext,
  createMockContextWithHeaders,
  expectTRPCError,
  expectNotFound,
  expectBadRequest,
  expectConflict,
  expectAdminActionLogged,
  expectOrgScoped,
  createTrpcInitMock,
  createMockData,
} from '../helpers/admin-router-test';

// Test error conditions
await expectNotFound(() => handler({ ctx, input: { id: 'missing' } }));
await expectBadRequest(() => handler({ ctx, input: { invalid: true } }));
await expectConflict(() => handler({ ctx, input: { duplicate: true } }));

// Assert admin action was logged
expectAdminActionLogged(mockLogAdminAction, 'CREATE', 'policy', policyId);

// Assert query was scoped to organization
expectOrgScoped(mockPrisma.policy.findMany, 'org-123');
```

### Integration Test Helpers (`test/helpers/integration.ts`)

Utilities for integration testing with real database.

```typescript
import {
  createAuthContextForUser,
  createAuthContextFromDifferentOrg,
  createUserInOrg,
  createSecondOrgWithUser,
  createTestPolicyWithMatchers,
  createAllowEveryonePolicy,
  createDenyEveryonePolicy,
  createDenyRolePolicy,
  createDenyUserPolicy,
  testUnauthenticatedAccess,
  testNonAdminAccess,
  createCallerWithRevokedToken,
  createCallerWithDeletedUser,
  revokeUserToken,
  softDeleteUser,
  refreshUserToken,
  createTestMcpServer,
  createTestAuditEntry,
  createTestPermissionRequest,
  cleanupTestData,
  verifyOrgIsolationForList,
} from '../helpers/integration';

// Create auth context for DB user
const authContext = await createAuthContextForUser(userId);

// Test organization isolation
const { org, user } = await createSecondOrgWithUser();

// Create policies with specific matchers
const policy = await createTestPolicyWithMatchers(
  orgId,
  'DENY',
  ['role:User', 'user:attacker@evil.com'],
  ['dangerous::*']
);

// Test auth bypass attempts
const result = await testUnauthenticatedAccess(() => caller.admin.secrets.list());
expect(result.success).toBe(true);

// Test with revoked/deleted user tokens
const revokedCaller = createCallerWithRevokedToken();
const deletedCaller = createCallerWithDeletedUser();
```

---

## Unit Tests

### When to Write Unit Tests

- Testing services with business logic
- Testing utility functions
- Testing policy evaluation logic
- Testing encryption/decryption
- Testing input validation

### Location

`test/unit/[category]/[file].test.ts`

### Example: Testing a Service Function

**Location**: `test/unit/api/services/policy.test.ts`

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { evaluatePolicy } from '../../../../packages/api/src/services/policy';

describe('evaluatePolicy', () => {
  test('denies when DENY policy matches', async () => {
    const policies = [
      {
        effect: 'DENY',
        tool: 'dangerous::*',
        enabled: true,
      },
    ];

    const result = await evaluatePolicy({
      policies,
      tool: 'dangerous::delete',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(result.effect).toBe('DENIED');
    expect(result.matchedPolicy).toBeDefined();
  });

  test('evaluates DENY before ALLOW (DENY always wins)', async () => {
    const policies = [
      { effect: 'ALLOW', tool: 'github::*', enabled: true },
      { effect: 'DENY', tool: 'github::delete_repo', enabled: true },
    ];

    const result = await evaluatePolicy({
      policies,
      tool: 'github::delete_repo',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(result.effect).toBe('DENIED'); // DENY always wins
  });
});
```

### Example: Testing with Mocks

**Location**: `test/unit/api/routers/admin/policies.test.ts`

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createTrpcInitMock } from '../../../helpers/trpc-unit-mock';
import {
  createAdminContext,
  createMockPrisma,
  createMockPolicy,
} from '../../../helpers/unit-test-mocks';

// Mock tRPC init
vi.mock('../../../../../packages/api/src/trpc/init.js', createTrpcInitMock);

// Mock Prisma
const mockPrisma = createMockPrisma();
vi.mock('@sentinel/db', () => ({ prisma: mockPrisma }));

describe('admin.policies router', () => {
  const ctx = createAdminContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('list returns policies scoped to organization', async () => {
    const mockPolicies = [createMockPolicy({ id: 'p1' }), createMockPolicy({ id: 'p2' })];
    mockPrisma.policy.findMany.mockResolvedValue(mockPolicies);

    // Import and call handler
    const { adminPoliciesRouter } = await import('../router.js');
    const result = await adminPoliciesRouter.list({ ctx });

    expect(result).toHaveLength(2);
    expect(mockPrisma.policy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ctx.auth.organizationId }),
      })
    );
  });
});
```

---

## Integration Tests

### When to Write Integration Tests

- Testing tRPC endpoints with real database
- Testing database queries and constraints
- Testing authentication flows
- Testing API responses and error handling
- Testing organization isolation

### Location

`test/integration/api/[namespace]/[router].test.ts`

### Example: Basic Integration Test

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@sentinel/db';
import { hasDatabaseUrl } from '../../../helpers/db';
import { createTestTenant, type TestTenant } from '../../../helpers/tenant-isolation';
import { createTestAdmin, createTestUser, getAdminWithRoles } from '../../../helpers/factory';
import { createCallerWithUser } from '../../../helpers/trpc';

describe.skipIf(!hasDatabaseUrl())('admin.users', () => {
  let tenant: TestTenant;
  let adminId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();
    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  test('lists users in organization', async () => {
    await createTestUser({ organizationId: tenant.orgId });
    await createTestUser({ organizationId: tenant.orgId });

    const admin = await getAdminWithRoles(adminId);
    const caller = createCallerWithUser(admin);
    const result = await caller.admin.users.list();

    expect(result.length).toBe(3); // admin + 2 users
    expect(result.every(u => u.organizationId === tenant.orgId)).toBe(true);
  });

  test('creates user with validation', async () => {
    const admin = await getAdminWithRoles(adminId);
    const caller = createCallerWithUser(admin);

    const result = await caller.admin.users.create({
      email: 'new@example.com',
      roleIds: [],
    });

    expect(result.email).toBe('new@example.com');
    expect(result.organizationId).toBe(tenant.orgId);
  });

  test('rejects invalid email', async () => {
    const admin = await getAdminWithRoles(adminId);
    const caller = createCallerWithUser(admin);

    await expect(
      caller.admin.users.create({ email: 'not-an-email', roleIds: [] })
    ).rejects.toThrow();
  });
});
```

---

## E2E Tests

### When to Write E2E Tests

- Testing complete user workflows
- Testing browser interactions
- Testing authentication flows
- Testing critical paths (login, policy enforcement)
- Testing UI components in real context

### Location

`test/e2e/[workflow].spec.ts`

### E2E Fixtures (`test/helpers/e2e-fixtures.ts`)

Custom Playwright fixtures with tenant isolation.

```typescript
import { expect, test } from '../helpers/e2e-fixtures';

test.describe('Admin Workflow', () => {
  // adminPage: Pre-authenticated admin page
  // tenant: Isolated tenant with adminToken, userToken, orgId
  test('admin can view users', async ({ adminPage, tenant }) => {
    await adminPage.goto('/admin/users');
    await expect(adminPage.locator('table')).toBeVisible();
  });

  test('user can view tools', async ({ userPage, tenant }) => {
    await userPage.goto('/user/tools');
    await expect(userPage.locator('[data-testid="tools-list"]')).toBeVisible();
  });
});
```

### E2E Helpers (`test/helpers/e2e.ts`)

Utility functions for E2E testing.

```typescript
import {
  loginAsAdmin,
  loginAsUser,
  loginWithToken,
  logout,
  navigateTo,
  navigateToAdminPage,
  waitForTable,
  waitForToast,
  confirmAction,
  fillForm,
  selectOption,
  createUserViaUI,
  createPolicyViaUI,
  createMcpServerViaUI,
  handleEndpointValidationOverride,
  generateUniqueName,
  getTestUser,
  getPrisma,
  encryptString,
  expectAccessStatus,
  expectAuditEntry,
  waitForApiResponse,
  waitForTableRefresh,
  verifyAccessDenied,
  verifyApiUnauthorized,
  getUsersFromDifferentOrgs,
} from '../helpers/e2e';

// Authentication
await loginAsAdmin(page);
await loginAsUser(page);
await loginWithToken(page, 'specific-token');
await logout(page);

// Navigation
await navigateTo(page, '/admin/policies', { waitForTable: true });
await navigateToAdminPage(page, 'Settings', 'Users');

// UI interactions
await waitForTable(page);
await waitForToast(page, 'Policy created', 'success');
await confirmAction(page, 'Delete');
await fillForm(page, { name: 'Test', email: 'test@example.com' });
await selectOption(page, '[data-testid="role-select"]', 'Admin');

// Create entities via UI
const { userId, token } = await createUserViaUI(page, 'new@example.com', ['Admin']);
const policyId = await createPolicyViaUI(page, {
  matchers: [{ type: 'role', value: 'User' }],
  toolPatterns: [{ server: 'github', tool: '*' }],
  effect: 'ALLOW',
  description: 'Allow GitHub access',
});
```

### Example: Full E2E Test

**Location**: `test/e2e/auth-flow.spec.ts`

```typescript
import { expect, test } from '../helpers/e2e-fixtures';

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Secure MCP Gateway');
    await expect(page.locator('input#token')).toBeVisible();
    await context.close();
  });

  test('should show error for invalid credentials', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.fill('input#token', 'invalid-token-123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toContainText('Invalid access token');
    await context.close();
  });

  test('admin login redirects to admin dashboard', async ({ browser, tenant }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.fill('input#token', tenant.adminToken);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/admin/);
    await context.close();
  });

  test('user login redirects to user dashboard', async ({ browser, tenant }) => {
    test.skip(!tenant.userToken, 'No user token available for tenant');
    if (!tenant.userToken) return;

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.fill('input#token', tenant.userToken);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/user$/);
    await context.close();
  });
});
```

---

## Security Tests

### When to Write Security Tests

- Testing organization boundaries
- Testing policy enforcement (especially DENY bypass attempts)
- Testing credential protection
- Testing XSS/injection prevention
- Testing authorization boundaries

### Location

`test/security/[concern].test.ts`

### Security Test Categories

| File                          | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `organization-boundaries.test.ts` | Cross-org data isolation                  |
| `workspace-boundaries.test.ts`    | Cross-workspace data isolation            |
| `workspace-authorization.test.ts` | Workspace role enforcement                |
| `policy-bypass.test.ts`           | Policy bypass attempts                    |
| `credential-leaks.test.ts`        | Credential exposure prevention            |
| `xss.test.ts`                     | XSS/injection prevention                  |

### Example: Policy Bypass Test

**Location**: `test/security/policy-bypass.test.ts`

```typescript
import { PolicyEffect } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { evaluatePolicy } from '../../packages/api/src/services/policy';
import { prisma } from '@sentinel/db';
import { clearDatabase, hasDatabaseUrl } from '../helpers/db';
import { createTestOrganization, createTestPolicy, createTestUser } from '../helpers/factory';

describe.skipIf(!hasDatabaseUrl())('Policy Bypass Security', () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    await clearDatabase();
    const org = await createTestOrganization();
    orgId = org.id;
    const user = await createTestUser({ organizationId: orgId });
    userId = user.id;
  });

  afterEach(async () => {
    await clearDatabase();
  });

  test('DENY policy cannot be bypassed with ALLOW policy', async () => {
    // Create ALLOW for all GitHub tools
    await createTestPolicy({
      organizationId: orgId,
      matchers: ['role:User'],
      toolPatterns: ['GitHub::*'],
      effect: PolicyEffect.ALLOW,
    });

    // Create DENY for specific tool
    await createTestPolicy({
      organizationId: orgId,
      matchers: ['role:User'],
      toolPatterns: ['GitHub::createPR'],
      effect: PolicyEffect.DENY,
      description: 'Cannot create PRs',
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new Error('User not found');

    const policies = await prisma.policy.findMany({
      where: { organizationId: orgId, enabled: true },
    });

    const result = await evaluatePolicy({ user, toolName: 'GitHub::createPR' }, policies);

    // DENY ALWAYS wins - this is critical security behavior
    expect(result.decision).toBe('DENIED');
    expect(result.justification).toContain('Cannot create PRs');
  });

  test('disabled ALLOW policy does not grant access', async () => {
    await createTestPolicy({
      organizationId: orgId,
      matchers: ['role:User'],
      toolPatterns: ['GitHub::*'],
      effect: PolicyEffect.ALLOW,
      enabled: false, // Disabled!
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new Error('User not found');

    // Only fetch enabled policies
    const policies = await prisma.policy.findMany({
      where: { organizationId: orgId, enabled: true },
    });

    const result = await evaluatePolicy({ user, toolName: 'GitHub::getFile' }, policies);

    expect(result.decision).toBe('DENIED');
  });
});
```

### Example: Organization Isolation Test

**Location**: `test/security/organization-boundaries.test.ts`

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@sentinel/db';
import { hasDatabaseUrl } from '../helpers/db';
import { createTestTenant, type TestTenant } from '../helpers/tenant-isolation';
import {
  createTestAdmin,
  createTestOrganization,
  createTestPolicy,
} from '../helpers/factory';
import { createCallerWithUser } from '../helpers/trpc';

describe.skipIf(!hasDatabaseUrl())('Organization Boundaries', () => {
  let tenant: TestTenant;
  let org2Id: string;

  beforeEach(async () => {
    tenant = await createTestTenant();
    const org2 = await createTestOrganization({ name: 'Org Two' });
    org2Id = org2.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  test('cannot access cross-org policy', async () => {
    // Create policy in org2
    const org2Policy = await createTestPolicy({
      organizationId: org2Id,
      slug: 'org2-secret-policy',
    });

    // Admin in org1 tries to access it
    const org1Admin = await createTestAdmin({ organizationId: tenant.orgId });
    const admin = await prisma.user.findUnique({
      where: { id: org1Admin.id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!admin) throw new Error('Admin not found');

    const caller = createCallerWithUser(admin);

    // Should throw NOT_FOUND (not FORBIDDEN - prevents enumeration)
    await expect(caller.admin.policies.get({ id: org2Policy.id })).rejects.toThrow();
  });

  test('error does not leak cross-org information', async () => {
    const org2Policy = await createTestPolicy({
      organizationId: org2Id,
      slug: 'org2-secret-policy',
    });

    const org1Admin = await createTestAdmin({ organizationId: tenant.orgId });
    const admin = await prisma.user.findUnique({
      where: { id: org1Admin.id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!admin) throw new Error('Admin not found');

    const caller = createCallerWithUser(admin);

    try {
      await caller.admin.policies.get({ id: org2Policy.id });
      throw new Error('Should have thrown');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Should NOT leak org info
      expect(errorMessage.toLowerCase()).not.toContain('unauthorized');
      expect(errorMessage.toLowerCase()).not.toContain('forbidden');
      expect(errorMessage.toLowerCase()).not.toContain('different organization');
      expect(errorMessage).not.toContain(org2Id);
    }
  });
});
```

---

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test types
pnpm run test:unit
pnpm run test:integration
pnpm run test:e2e
pnpm run test:security

# Run specific test file
pnpm test -- policy.test.ts

# Run with pattern matching
pnpm test -- --grep "DENY policy"

# Watch mode
pnpm run test:watch

# Coverage report
pnpm run test:coverage

# UI mode (interactive)
pnpm run test:ui

# Run MCP test runner (custom)
pnpm run mcp:test
```

---

## Coverage Requirements

| Category              | Minimum | Critical                          |
| --------------------- | ------- | --------------------------------- |
| **Policy engine**     | 100%    | All DENY/ALLOW logic paths        |
| **Crypto utilities**  | 100%    | Encrypt/decrypt, key management   |
| **Services**          | 80%     | Core business logic               |
| **tRPC routes**       | N/A     | Integration test for every endpoint |
| **Critical paths**    | N/A     | E2E test required                 |
| **Security boundaries**| N/A    | Security test for each boundary   |

---

## Common Patterns

### Pattern: Database Skip Guard

```typescript
import { hasDatabaseUrl } from '../helpers/db';

// Skip entire test suite when no DB available
describe.skipIf(!hasDatabaseUrl())('Feature', () => {
  // tests...
});
```

### Pattern: Tenant Isolation Setup

```typescript
let tenant: TestTenant;

beforeEach(async () => {
  tenant = await createTestTenant();
});

afterEach(async () => {
  await tenant.cleanup();
});

// All test data uses tenant.orgId
```

### Pattern: Cross-Org Isolation Testing

```typescript
test('cannot access cross-org data', async () => {
  const org1 = await createTestOrganization();
  const org2 = await createTestOrganization();
  const resource = await createResource({ organizationId: org1.id });

  const org2Admin = await createTestAdmin({ organizationId: org2.id });
  const caller = createCallerWithUser(org2Admin);

  // Should fail - resource is in org1, caller is in org2
  await expect(caller.admin.resources.get({ id: resource.id })).rejects.toThrow();
});
```

### Pattern: DENY Policy Testing

```typescript
test('DENY policy blocks access even with ALLOW', async () => {
  await createTestPolicy({ effect: 'ALLOW', toolPatterns: ['*::*'] });
  await createTestPolicy({ effect: 'DENY', toolPatterns: ['*::delete'] });

  const result = await evaluatePolicy({ tool: 'server::delete' });
  expect(result.decision).toBe('DENIED'); // DENY always wins
});
```

---

## Common Mistakes

### Sharing State Between Tests

```typescript
// BAD - Shared mutable state
let user: User;
beforeAll(async () => {
  user = await createTestUser();
});

test('test 1', () => {
  user.email = 'changed'; // Mutates shared state!
});
```

```typescript
// GOOD - Fresh data per test
test('test 1', async () => {
  const user = await createTestUser(); // Fresh per test
});
```

### Not Using Tenant Isolation

```typescript
// BAD - Tests may conflict in parallel
beforeEach(async () => {
  await clearDatabase(); // Wipes everything!
});
```

```typescript
// GOOD - Isolated per test
let tenant: TestTenant;
beforeEach(async () => {
  tenant = await createTestTenant();
});
afterEach(async () => {
  await tenant.cleanup();
});
```

### Leaking Across Tests

```typescript
// BAD - No cleanup
test('creates user', async () => {
  await prisma.user.create({ ... });
  // No cleanup - pollutes other tests
});
```

```typescript
// GOOD - Using tenant cleanup
test('creates user', async () => {
  const user = await createTestUser({ organizationId: tenant.orgId });
  // Automatically cleaned up by tenant.cleanup()
});
```

### Forgetting Database Skip Guard

```typescript
// BAD - Will fail in CI without DB
describe('Database tests', () => {
  test('queries DB', async () => {
    await prisma.user.findMany(); // Fails without DB!
  });
});
```

```typescript
// GOOD - Gracefully skips
describe.skipIf(!hasDatabaseUrl())('Database tests', () => {
  test('queries DB', async () => {
    await prisma.user.findMany();
  });
});
```

---

## Next Steps

After writing tests:

1. Ensure all tests pass locally
2. Check coverage meets requirements
3. Verify security tests cover all boundaries
4. Run linting: `pnpm lint`
5. Tests run automatically in CI/CD
