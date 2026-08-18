/**
 * E2E Workflow Tests: User Onboarding Flow
 * Tests the complete user onboarding lifecycle from creation to first login
 *
 * Flow:
 * 1. Admin creates new user
 * 2. Token is displayed and copyable
 * 3. New user logs in with token
 * 4. New user sees appropriate dashboard
 * 5. New user has correct permissions
 *
 * NOTE: This test uses beforeAll/afterAll instead of the tenant fixture because
 * serial mode tests need to share state (the newly created user) across all steps.
 * The tenant fixture is test-scoped and would create a new org for each step.
 */

import { test as baseTest, expect, type TestInfo } from '@playwright/test';
import { getPrisma, loginWithToken, navigateTo } from '../../helpers/e2e.js';

// Generate a unique name for test data
function generateUniqueName(testInfo: TestInfo, prefix: string): string {
  return `${prefix}-${testInfo.parallelIndex}-${Date.now()}`;
}

// Generate a unique token for test users
function generateToken(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

baseTest.describe('User Onboarding Flow', () => {
  // IMPORTANT: These tests share state between sequential steps via module-level variables
  // They MUST run in serial mode to maintain correct order
  baseTest.describe.configure({ mode: 'serial' });

  // Shared state for the entire test suite
  let organizationId: string;
  let adminToken: string;
  let adminId: string;
  let adminRoleId: string;
  let userRoleId: string;
  let newUserToken: string;
  let newUserId: string;
  let newUserEmail: string;
  let workspaceId: string;

  baseTest.beforeAll(async () => {
    const prisma = await getPrisma();
    // Create an isolated organization for this test suite
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const org = await prisma.organization.create({
      data: { name: `OnboardingTestOrg-${uniqueSuffix}` },
    });
    organizationId = org.id;

    // Create admin role
    const adminRole = await prisma.role.create({
      data: {
        name: `Admin-${uniqueSuffix}`,
        isAdmin: true,
        organizationId,
      },
    });
    adminRoleId = adminRole.id;

    // Create user role (for the new user we'll create via UI)
    const userRole = await prisma.role.create({
      data: {
        name: `User-${uniqueSuffix}`,
        isAdmin: false,
        organizationId,
      },
    });
    userRoleId = userRole.id;

    // Create admin user (as org owner for Global View access)
    adminToken = generateToken();
    const admin = await prisma.user.create({
      data: {
        email: `admin-${uniqueSuffix}@test.local`,
        accessToken: adminToken,
        organizationId,
        orgRole: 'OWNER',
        userRoles: {
          create: { roleId: adminRoleId },
        },
      },
    });
    adminId = admin.id;

    // Create a workspace for the organization
    const workspace = await prisma.workspace.create({
      data: {
        name: `Test Workspace ${uniqueSuffix.slice(0, 8)}`,
        slug: `test-ws-${uniqueSuffix.slice(0, 12)}`,
        organizationId,
      },
    });
    workspaceId = workspace.id;

    // Add admin as workspace admin
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: adminId,
        role: 'ADMIN',
      },
    });

    // Dismiss onboarding for admin user to prevent tour overlay from blocking tests
    await prisma.userOnboarding.create({
      data: {
        userId: adminId,
        dismissed: true,
      },
    });
  });

  baseTest.afterAll(async () => {
    const prisma = await getPrisma();
    // Clean up in dependency order

    // Clean up workspace members and workspace first
    if (workspaceId) {
      await prisma.workspaceMember.deleteMany({ where: { workspaceId } }).catch(() => {});
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }

    if (newUserId) {
      await prisma.userRole.deleteMany({ where: { userId: newUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: newUserId } }).catch(() => {});
    }

    if (adminId) {
      await prisma.userRole.deleteMany({ where: { userId: adminId } }).catch(() => {});
      await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
    }

    if (userRoleId) {
      await prisma.role.delete({ where: { id: userRoleId } }).catch(() => {});
    }

    if (adminRoleId) {
      await prisma.role.delete({ where: { id: adminRoleId } }).catch(() => {});
    }

    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => {});
    }
  });

  baseTest('Step 1: Admin creates new user', async ({ page }, testInfo) => {
    await loginWithToken(page, adminToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

    // Navigate to users page
    await navigateTo(page, '/admin/users');

    // Wait for users table to load
    await expect(page.locator('table').or(page.locator('[data-testid="empty-state"]'))).toBeVisible(
      {
        timeout: 15000,
      },
    );

    // Click create user button
    const createButton = page.getByRole('button', { name: /create user/i });
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Wait for dialog header to confirm it's the right dialog
    await expect(dialog.getByRole('heading', { name: /create user/i })).toBeVisible();

    // Generate unique email
    newUserEmail = generateUniqueName(testInfo, 'onboard-user') + '@test.com';

    // Fill email
    const emailInput = dialog
      .locator('input#create-email')
      .or(dialog.locator('input[type="email"]'));
    await expect(emailInput).toBeVisible();
    await emailInput.fill(newUserEmail);

    // Wait for roles to load
    await expect(
      dialog.locator('label').first().or(dialog.getByText('No roles available')),
    ).toBeVisible({ timeout: 10000 });

    // Select a non-admin role - get role labels and click on one that doesn't include 'admin'
    const roleLabels = dialog.locator('label').filter({ has: dialog.getByRole('checkbox') });
    const labelCount = await roleLabels.count();

    for (let i = 0; i < labelCount; i++) {
      const label = roleLabels.nth(i);
      const labelText = await label.textContent().catch(() => '');

      // Skip Admin role
      if (labelText && !labelText.toLowerCase().includes('admin')) {
        // Click the label (or the checkbox button inside it)
        await label.click();
        await expect(label.getByRole('checkbox').first()).toBeChecked({ timeout: 5000 });
        break;
      }
    }

    // Submit form
    const submitButton = dialog.getByRole('button', { name: /create user/i });
    await expect(submitButton).toBeEnabled();

    // Click submit and wait for API response
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes('/trpc/') && response.status() === 200,
        { timeout: 15000 },
      ),
      submitButton.click(),
    ]);

    // Wait for create dialog to close
    await expect(dialog.getByText(/invite a new user/i)).not.toBeVisible({ timeout: 10000 });

    // Wait for token dialog to appear and get the token
    const tokenDialog = page.getByRole('dialog').filter({ hasText: /access token/i });
    await expect(tokenDialog).toBeVisible({ timeout: 10000 });

    // Get the token from dialog - look for font-mono element WITHIN the dialog
    const tokenElement = tokenDialog.locator('.font-mono').first();
    await expect(tokenElement).toBeVisible();

    const token = await tokenElement.textContent();
    expect(token).toBeTruthy();
    expect(token!.trim().length).toBeGreaterThan(10);

    // Store token for later tests
    newUserToken = token!.trim();
    console.log('Captured new user token:', newUserToken.substring(0, 10) + '...');

    // Close token dialog - use first button which is the main Close button (not the X icon)
    const closeButton = tokenDialog.getByRole('button', { name: /close/i }).first();
    await closeButton.click();

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Store user ID for cleanup and add to workspace
    const prisma = await getPrisma();
    const user = await prisma.user.findFirst({
      where: { email: newUserEmail, organizationId },
    });
    if (user) {
      newUserId = user.id;

      // Add new user to the workspace so they can access workspace-scoped routes
      await prisma.workspaceMember.create({
        data: {
          workspaceId,
          userId: user.id,
          role: 'MEMBER',
        },
      });
    }
  });

  baseTest('Step 2: New user logs in with token', async ({ page }) => {
    baseTest.skip(!newUserToken, 'No user token from previous test');

    // Navigate to login page
    await page.goto('/login');

    // Verify login page loaded
    await expect(page.locator('input#token')).toBeVisible({ timeout: 10000 });

    // Enter the token
    await page.fill('input#token', newUserToken);

    // Submit login
    await page.click('button[type="submit"]');

    // Wait for redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Handle workspace selection if needed
    if (page.url().includes('/select-workspace')) {
      // Wait for auto-redirect or click the first available workspace
      await page.waitForTimeout(1000);
      if (page.url().includes('/select-workspace')) {
        // Click on the first workspace card (not Global View)
        const workspaceCard = page
          .locator('[class*="cursor-pointer"]')
          .filter({
            hasNot: page.locator('text=Global View'),
          })
          .first();
        if (await workspaceCard.isVisible()) {
          await workspaceCard.click();
        }
      }
    }

    // Should redirect to user dashboard (not admin since we selected non-admin role)
    await page.waitForURL(/.*\/user/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/user/);

    // Verify we're logged in
    await expect(page.locator('body')).toBeVisible();
  });

  baseTest('Step 3: New user sees appropriate dashboard', async ({ page }) => {
    baseTest.skip(!newUserToken, 'No user token from previous test');

    await loginWithToken(page, newUserToken, { isOrgOwner: false, expectedPath: /.*\/user/ });

    // Should be on user dashboard
    await expect(page).toHaveURL(/.*\/user/);

    // Verify dashboard elements are visible
    // Dashboard should show user-appropriate content
    // Look for common dashboard elements (use first() for strict mode)
    const dashboardContent = page
      .locator('[data-testid="dashboard"]')
      .or(page.locator('main'))
      .or(page.locator('h1'))
      .first();

    await expect(dashboardContent).toBeVisible({ timeout: 10000 });
  });

  baseTest('Step 4: New user has correct permissions', async ({ page }) => {
    baseTest.skip(!newUserToken, 'No user token from previous test');

    await loginWithToken(page, newUserToken, { isOrgOwner: false, expectedPath: /.*\/user/ });

    // Navigate to tools page to check permissions
    await navigateTo(page, '/user/tools');

    // Wait for tools page to load - use .first() to handle multiple "No tools" elements
    await expect(
      page
        .locator('table')
        .or(page.getByText('No tools available'))
        .or(page.locator('[data-testid="tools-list"]'))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Page should be accessible
    await expect(page.locator('body')).toBeVisible();

    // Verify user cannot access admin pages (without workspace context)
    // Try to access /admin directly - this should redirect to /select-workspace
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    // Give time for redirects
    await page.waitForTimeout(1000);

    // Should redirect to workspace selection or stay on user routes
    const currentUrl = page.url();

    // Non-admin users hitting /admin without workspace context should be redirected
    // to /select-workspace (legacy route handling)
    const isAtWorkspaceSelection = currentUrl.includes('/select-workspace');
    const isAtUserRoute = currentUrl.includes('/user/');
    const isAtLogin = currentUrl.includes('/login');

    // The test passes if user was redirected away from admin routes to an appropriate page
    expect(isAtWorkspaceSelection || isAtUserRoute || isAtLogin).toBe(true);
  });
});
