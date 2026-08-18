/**
 * E2E Test Fixtures with Tenant Isolation
 *
 * Extends Playwright's test with custom fixtures for isolated test execution:
 * - tenant: Creates an isolated organization for each test
 * - adminPage: A page already logged in as admin for the tenant
 * - userPage: A page already logged in as a regular user for the tenant
 *
 * Usage:
 *   import { expect, test } from '../helpers/e2e-fixtures.js';
 *
 *   test('admin test', async ({ adminPage, tenant }) => {
 *     await adminPage.goto('/admin/users');
 *     // tenant.orgId is available if needed
 *   });
 */

import { test as baseTest, expect, type Page } from '@playwright/test';
import { getPrisma } from './e2e.js';
import { createTestTenant, type TestTenant } from './tenant-isolation.js';

// Re-export expect for convenience
export { expect };

// Re-export common helpers
export {
  closeToolDiscoveryDialog,
  confirmAction,
  dismissOnboardingTour,
  encryptString,
  fillForm,
  generateUniqueName,
  getPrisma,
  handleEndpointValidationOverride,
  navigateTo,
  selectAllToolsInPolicyForm,
  selectOption,
  waitForTable,
  waitForToast,
} from './e2e.js';

/**
 * Extended test tenant with user credentials
 */
interface TenantWithCredentials extends TestTenant {
  adminToken: string;
  adminId: string;
  userToken?: string;
  userId?: string;
  workspaceId: string;
  workspaceSlug: string;
}

/**
 * Custom fixtures for e2e tests
 */
interface E2EFixtures {
  /** An isolated tenant with organization for this test */
  tenant: TenantWithCredentials;
  /** A page logged in as admin for the tenant */
  adminPage: Page;
  /** A page logged in as a regular user for the tenant */
  userPage: Page;
}

/**
 * Generate a unique token for test users
 */
function generateToken(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

/**
 * Login to a page with a specific token
 * After login, handles workspace selection flow:
 * - Non-org-owners with single workspace: auto-redirect to /admin/{slug} or /user/{slug}
 * - Org-owners: stay on selection, need to click Global View or a workspace
 */
async function loginWithToken(
  page: Page,
  token: string,
  expectedPath: RegExp,
  isOrgOwner = false,
): Promise<void> {
  console.log(`[loginWithToken] Starting login with token: ${token.substring(0, 20)}...`);
  await page.goto('/login');
  console.log(`[loginWithToken] Navigated to /login, current URL: ${page.url()}`);
  const tokenInput = page.locator('input#token');
  await tokenInput.waitFor({ state: 'visible', timeout: 10000 });
  console.log(`[loginWithToken] Token input visible, filling token`);
  await tokenInput.fill(token);
  console.log(`[loginWithToken] Token filled, clicking submit`);
  await page.click('button[type="submit"]');
  console.log(`[loginWithToken] Submit clicked, waiting for redirect...`);

  try {
    // First wait for redirect away from /login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log(`[loginWithToken] Redirected from login, current URL: ${page.url()}`);

    // If we're at workspace selection and user is org owner, click Global View
    if (page.url().includes('/select-workspace')) {
      console.log(`[loginWithToken] At workspace selection page`);
      if (isOrgOwner) {
        // Org owners click Global View to go to /global/admin
        const globalViewCard = page.locator('text=Global View').first();
        await globalViewCard.waitFor({ state: 'visible', timeout: 5000 });
        await globalViewCard.click();
        console.log(`[loginWithToken] Clicked Global View`);
      } else {
        // Non-org-owners should auto-redirect if they have exactly one workspace
        // If still on select-workspace, click the first workspace
        await page.waitForTimeout(1000); // Wait for auto-redirect
        if (page.url().includes('/select-workspace')) {
          console.log(`[loginWithToken] Still at workspace selection, clicking first workspace`);
          // Click on the first workspace card (not Global View)
          const workspaceCard = page
            .locator('[class*="cursor-pointer"]')
            .filter({
              hasNot: page.locator('text=Global View'),
            })
            .first();
          if (await workspaceCard.isVisible()) {
            await workspaceCard.click();
            console.log(`[loginWithToken] Clicked first workspace card`);
          }
        }
      }
    }

    // Now wait for the expected path
    await page.waitForURL(expectedPath, { timeout: 15000 });
    console.log(`[loginWithToken] Login successful, current URL: ${page.url()}`);

    // Debug: Check localStorage after login
    const storedToken = await page.evaluate(() => localStorage.getItem('sentinel_access_token'));
    const storedIsAdmin = await page.evaluate(() => localStorage.getItem('sentinel_is_admin'));
    console.log(
      `[loginWithToken] LocalStorage after login: token=${storedToken?.substring(0, 20)}..., isAdmin=${storedIsAdmin}`,
    );
  } catch (error) {
    console.log(`[loginWithToken] Login failed, current URL: ${page.url()}`);
    // Take a screenshot for debugging
    const content = await page.content();
    console.log(`[loginWithToken] Page content preview: ${content.substring(0, 500)}`);
    throw error;
  }
}

/**
 * Extended test with tenant isolation fixtures
 */
export const test = baseTest.extend<E2EFixtures>({
  // Create an isolated tenant with admin user for each test
  // eslint-disable-next-line no-empty-pattern
  tenant: async ({}, use) => {
    // Get prisma via dynamic import (ensures DATABASE_URL is set in CI)
    const prisma = await getPrisma();

    // Create isolated organization
    const baseTenant = await createTestTenant();

    // Use full orgId for guaranteed uniqueness - orgId is already unique per tenant
    // This ensures no email collisions even in heavily parallel tests
    const uniqueSuffix = baseTenant.orgId;

    // Create admin role for this org
    const adminRole = await prisma.role.create({
      data: {
        name: `Admin-${uniqueSuffix}`,
        isAdmin: true,
        organizationId: baseTenant.orgId,
      },
    });

    // Create admin user for this org (org owner for Global View access)
    const adminToken = generateToken();
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-${uniqueSuffix}@test.local`,
        accessToken: adminToken,
        organizationId: baseTenant.orgId,
        orgRole: 'OWNER', // Org owner can access Global View
        userRoles: {
          create: {
            roleId: adminRole.id,
          },
        },
      },
    });

    // Create a default workspace for testing
    const workspace = await prisma.workspace.create({
      data: {
        name: `Test Workspace ${uniqueSuffix.slice(0, 8)}`,
        slug: `test-ws-${uniqueSuffix.slice(0, 12)}`,
        organizationId: baseTenant.orgId,
      },
    });

    // Add admin as workspace admin member
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: adminUser.id,
        role: 'ADMIN',
      },
    });

    // Dismiss onboarding for admin user to prevent tour overlay from blocking tests
    await prisma.userOnboarding.create({
      data: {
        userId: adminUser.id,
        dismissed: true,
      },
    });

    // Create regular role for this org
    const userRole = await prisma.role.create({
      data: {
        name: `User-${uniqueSuffix}`,
        isAdmin: false,
        organizationId: baseTenant.orgId,
      },
    });

    // Create regular user for this org
    const userToken = generateToken();
    const regularUser = await prisma.user.create({
      data: {
        email: `user-${uniqueSuffix}@test.local`,
        accessToken: userToken,
        organizationId: baseTenant.orgId,
        userRoles: {
          create: {
            roleId: userRole.id,
          },
        },
      },
    });

    // Add regular user as workspace member
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: regularUser.id,
        role: 'MEMBER',
      },
    });

    // Dismiss onboarding for regular user to prevent tour overlay from blocking tests
    await prisma.userOnboarding.create({
      data: {
        userId: regularUser.id,
        dismissed: true,
      },
    });

    const tenantWithCreds: TenantWithCredentials = {
      ...baseTenant,
      adminToken,
      adminId: adminUser.id,
      userToken,
      userId: regularUser.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
    };

    await use(tenantWithCreds);

    // Cleanup is handled by baseTenant.cleanup()
    await baseTenant.cleanup();
  },

  // Create a page logged in as admin (org owner with Global View access)
  adminPage: async ({ page, tenant }, use) => {
    // Admin is org owner, so pass isOrgOwner=true to click Global View
    await loginWithToken(page, tenant.adminToken, /.*\/admin/, true);
    await use(page);
  },

  // Create a page logged in as regular user
  userPage: async ({ page, tenant }, use) => {
    if (!tenant.userToken) {
      throw new Error('No user token available for this tenant');
    }
    // Regular user has one workspace, will auto-redirect
    await loginWithToken(page, tenant.userToken, /.*\/user/, false);
    await use(page);
  },
});
