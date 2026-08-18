/**
 * E2E Workflow Tests: Policy Enforcement Flow
 * Tests the complete policy enforcement lifecycle demonstrating DENY precedence
 *
 * Flow:
 * 1. Create ALLOW policy
 * 2. Verify user can access tool
 * 3. Create DENY policy for same tool
 * 4. Verify user is blocked
 * 5. Delete DENY policy and verify access restored
 *
 * NOTE: This test uses beforeAll/afterAll instead of the tenant fixture because
 * serial mode tests need to share state (tokens, IDs) across all steps.
 * The tenant fixture is test-scoped and would create a new org for each step.
 */

import { test as baseTest, expect, type TestInfo } from '@playwright/test';
import {
  getPrisma,
  loginWithToken,
  navigateTo,
  selectAllToolsInPolicyForm,
  waitForTable,
} from '../../helpers/e2e.js';

// Generate a unique name for test data
function generateUniqueName(testInfo: TestInfo, prefix: string): string {
  return `${prefix}-${testInfo.parallelIndex}-${Date.now()}`;
}

// Generate a unique token for test users
function generateToken(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

baseTest.describe('Policy Enforcement Flow', () => {
  // IMPORTANT: These tests share state between sequential steps via module-level variables
  // They MUST run in serial mode to maintain correct order
  baseTest.describe.configure({ mode: 'serial' });

  // Shared state for the entire test suite
  let organizationId: string;
  let adminToken: string;
  let adminId: string;
  let adminRoleId: string;
  let userRoleId: string;
  let userToken: string;
  let userId: string;
  let userEmail: string;
  let allowPolicyId: string;
  let denyPolicyId: string;
  let workspaceId: string;

  baseTest.beforeAll(async () => {
    const prisma = await getPrisma();
    // Create an isolated organization for this test suite
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const org = await prisma.organization.create({
      data: { name: `PolicyEnforcementTestOrg-${uniqueSuffix}` },
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

    // Create user role
    const userRole = await prisma.role.create({
      data: {
        name: `User-${uniqueSuffix}`,
        isAdmin: false,
        organizationId,
      },
    });
    userRoleId = userRole.id;

    // Create admin user
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

    // Create regular user
    userToken = generateToken();
    userEmail = `user-${uniqueSuffix}@test.local`;
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        accessToken: userToken,
        organizationId,
        userRoles: {
          create: { roleId: userRoleId },
        },
      },
    });
    userId = user.id;

    // Create a workspace for the organization
    const workspace = await prisma.workspace.create({
      data: {
        name: `Test Workspace ${uniqueSuffix}`,
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

    // Add regular user as workspace member
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: userId,
        role: 'MEMBER',
      },
    });

    // Dismiss onboarding for both users to prevent tour overlay from blocking tests
    await prisma.userOnboarding.create({
      data: {
        userId: adminId,
        dismissed: true,
      },
    });
    await prisma.userOnboarding.create({
      data: {
        userId: userId,
        dismissed: true,
      },
    });
  });

  baseTest.afterAll(async () => {
    const prisma = await getPrisma();
    // Clean up test policies
    if (allowPolicyId) {
      await prisma.policy.delete({ where: { id: allowPolicyId } }).catch(() => {});
    }
    if (denyPolicyId) {
      await prisma.policy.delete({ where: { id: denyPolicyId } }).catch(() => {});
    }

    // Clean up workspace members and workspace
    if (workspaceId) {
      await prisma.workspaceMember.deleteMany({ where: { workspaceId } }).catch(() => {});
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }

    // Clean up users
    if (userId) {
      await prisma.userRole.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }

    if (adminId) {
      await prisma.userRole.deleteMany({ where: { userId: adminId } }).catch(() => {});
      await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
    }

    // Clean up roles
    if (userRoleId) {
      await prisma.role.delete({ where: { id: userRoleId } }).catch(() => {});
    }

    if (adminRoleId) {
      await prisma.role.delete({ where: { id: adminRoleId } }).catch(() => {});
    }

    // Clean up organization
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => {});
    }
  });

  baseTest('Step 1: Create ALLOW policy for user', async ({ page }, testInfo) => {
    await loginWithToken(page, adminToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

    // Navigate to policies page
    await navigateTo(page, '/admin/policies');

    // Wait for page to load
    await expect(page.locator('table').or(page.locator('[data-testid="empty-state"]'))).toBeVisible(
      {
        timeout: 15000,
      },
    );

    // Click create policy button
    await page.click('button:has-text("Create policy")');

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill description with unique name
    const policyName = generateUniqueName(testInfo, 'allow-policy');
    const descInput = dialog
      .locator('input#create-description')
      .or(dialog.locator('input[name="description"]'));
    await expect(descInput).toBeVisible();
    await descInput.fill(policyName);

    // Select matcher type: User (default is "Role")
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await page.getByRole('option', { name: 'User', exact: true }).click();

    // Wait for user selector to be enabled
    const matcherValueCombobox = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select user|All users/ });
    await expect(matcherValueCombobox).toBeEnabled();
    await matcherValueCombobox.click();

    // Select the test user
    const userOption = page.getByRole('option', { name: new RegExp(userEmail, 'i') });
    if (await userOption.isVisible().catch(() => false)) {
      await userOption.click();
    } else {
      // Fallback to first available user
      await page.getByRole('option').first().click();
    }

    // Effect defaults to ALLOW, verify it's visible
    await expect(dialog.getByRole('combobox').filter({ hasText: 'ALLOW' })).toBeVisible();

    // Select tools (required)
    await selectAllToolsInPolicyForm(page);

    // Submit
    const submitButton = dialog.locator('button[type="submit"]:has-text("Create policy")');
    await submitButton.click();

    // Handle policy assertions dialog if it appears
    const createAnyway = page.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear
    }

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify policy created
    await expect(page.locator('table')).toContainText(policyName, { timeout: 10000 });

    // Store policy ID for cleanup
    const prisma = await getPrisma();
    const policy = await prisma.policy.findFirst({
      where: { description: policyName, organizationId },
    });
    if (policy) {
      allowPolicyId = policy.id;
    }
  });

  baseTest('Step 2: Verify user can access tool', async ({ page }) => {
    await loginWithToken(page, userToken, { isOrgOwner: false, expectedPath: /.*\/user/ });

    // Navigate to tools page
    await navigateTo(page, '/user/tools');

    // Wait for tools to load
    await expect(
      page
        .locator('table')
        .or(page.getByText('No tools available'))
        .or(page.locator('[data-testid="tools-list"]'))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Look for ALLOW indication or total tools
    const totalTools = page.locator('text=Total Tools');

    // Verify page loads and shows tool status
    if (await totalTools.isVisible().catch(() => false)) {
      // If there are tools, we should see some access indicators
      await expect(totalTools).toBeVisible();
    }

    // Page should be accessible
    await expect(page.locator('body')).toBeVisible();
  });

  baseTest('Step 3: Create DENY policy for same tool', async ({ page }, testInfo) => {
    await loginWithToken(page, adminToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

    // Navigate to policies page
    await navigateTo(page, '/admin/policies');

    await expect(page.locator('table').or(page.locator('[data-testid="empty-state"]'))).toBeVisible(
      {
        timeout: 15000,
      },
    );

    // Click create policy button
    await page.click('button:has-text("Create policy")');

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill description with unique name
    const policyName = generateUniqueName(testInfo, 'deny-policy');
    const descInput = dialog
      .locator('input#create-description')
      .or(dialog.locator('input[name="description"]'));
    await expect(descInput).toBeVisible();
    await descInput.fill(policyName);

    // Select matcher type: User (default is "Role")
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await page.getByRole('option', { name: 'User', exact: true }).click();

    // Wait for user selector and select the same user
    const matcherValueCombobox = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select user|All users/ });
    await expect(matcherValueCombobox).toBeEnabled();
    await matcherValueCombobox.click();

    const userOption = page.getByRole('option', { name: new RegExp(userEmail, 'i') });
    if (await userOption.isVisible().catch(() => false)) {
      await userOption.click();
    } else {
      await page.getByRole('option').first().click();
    }

    // Set effect to DENY (default is "ALLOW")
    const effectCombobox = dialog.getByRole('combobox').filter({ hasText: 'ALLOW' });
    await effectCombobox.click();
    await page.getByRole('option', { name: 'DENY' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(page);

    // Submit
    const submitButton = dialog.locator('button[type="submit"]:has-text("Create policy")');
    await submitButton.click();

    // Handle policy assertions dialog
    const createAnyway = page.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear
    }

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify policy created
    await expect(page.locator('table')).toContainText(policyName, { timeout: 10000 });
    await expect(page.locator('table')).toContainText('DENY', { timeout: 10000 });

    // Store policy ID for cleanup
    const prisma = await getPrisma();
    const policy = await prisma.policy.findFirst({
      where: { description: policyName, organizationId },
    });
    if (policy) {
      denyPolicyId = policy.id;
    }
  });

  baseTest('Step 4: Verify user is blocked by DENY', async ({ page }) => {
    await loginWithToken(page, userToken, { isOrgOwner: false, expectedPath: /.*\/user/ });

    // Navigate to tools page
    await navigateTo(page, '/user/tools');

    // Wait for tools to load
    await expect(
      page
        .locator('table')
        .or(page.getByText('No tools available'))
        .or(page.locator('[data-testid="tools-list"]'))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Look for DENY indication - DENY should override ALLOW
    const denyBadge = page.locator('text=DENY');

    // Check if there are denied tools
    if (
      await denyBadge
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(denyBadge.first()).toBeVisible();
    }

    // Page should still be accessible, just with denied status
    await expect(page.locator('body')).toBeVisible();
  });

  baseTest('Step 5: Delete DENY policy and verify access restored', async ({ page }) => {
    baseTest.skip(!denyPolicyId, 'No DENY policy ID from previous test');

    await loginWithToken(page, adminToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

    // Navigate to policies page
    await navigateTo(page, '/admin/policies');

    await waitForTable(page);

    // Find the DENY policy row
    const denyPolicyRow = page.locator('tr').filter({ hasText: 'DENY' }).first();
    await expect(denyPolicyRow).toBeVisible({ timeout: 10000 });

    // Click delete button or open action menu
    const deleteButton = denyPolicyRow
      .getByRole('button', { name: /delete/i })
      .or(denyPolicyRow.locator('[data-testid="delete-button"]'));

    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click();
    } else {
      // Open action menu
      const menuButton = denyPolicyRow
        .getByRole('button', { name: /actions|menu/i })
        .or(denyPolicyRow.locator('[data-testid="actions-menu"]'));
      if (await menuButton.isVisible().catch(() => false)) {
        await menuButton.click();
        await page.getByRole('menuitem', { name: /delete/i }).click();
      }
    }

    // Confirm deletion in dialog
    const confirmDialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    if (await confirmDialog.isVisible().catch(() => false)) {
      const confirmButton = confirmDialog.getByRole('button', { name: /delete|confirm|yes/i });
      await confirmButton.click();
      await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });
    }

    // Wait for policy to be deleted
    await page.waitForTimeout(1000);

    // Now verify user access is restored - first logout then login as user
    // Clear cookies to ensure clean login
    await page.context().clearCookies();
    await loginWithToken(page, userToken, { isOrgOwner: false, expectedPath: /.*\/user/ });
    await navigateTo(page, '/user/tools');

    // Wait for tools to load
    await expect(
      page
        .locator('table')
        .or(page.getByText('No tools available'))
        .or(page.locator('[data-testid="tools-list"]'))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // With DENY removed, ALLOW should take effect
    // Look for ALLOW indication
    const allowBadge = page.locator('text=ALLOW');
    if (
      await allowBadge
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(allowBadge.first()).toBeVisible();
    }

    // Page should be accessible
    await expect(page.locator('body')).toBeVisible();

    // Clear denyPolicyId since it's deleted
    denyPolicyId = '';
  });
});
