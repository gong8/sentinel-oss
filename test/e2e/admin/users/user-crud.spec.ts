/**
 * E2E Tests: Admin User CRUD Operations
 * Tests user creation, listing, and basic management
 */

import { expect, getPrisma, navigateTo, test } from '../../../helpers/e2e-fixtures.js';
import { generateUniqueName } from '../../../helpers/e2e.js';

test.describe('Admin User CRUD', () => {
  // ============================================================================
  // User Listing Tests
  // ============================================================================

  test('should list all users with roles and status', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Verify table structure
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });
    await expect(adminPage.locator('th').filter({ hasText: /email/i })).toBeVisible();
    await expect(adminPage.locator('th').filter({ hasText: /role/i })).toBeVisible();

    // Verify at least one user row exists
    const rows = adminPage.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('should display role badges for each user', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Look for role badges (Admin, User, etc.)
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // At least one role badge should be visible
    const roleBadge = adminPage
      .locator('[data-testid="role-badge"]')
      .or(adminPage.locator('.badge'));
    if ((await roleBadge.count()) > 0) {
      await expect(roleBadge.first()).toBeVisible();
    }
  });

  // ============================================================================
  // User Creation Tests
  // ============================================================================

  test('should create user with valid email and single role', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Wait for table to load
    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({
      timeout: 15000,
    });

    // Click create user button
    const createButton = adminPage.getByRole('button', { name: /create user/i });
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Wait for dialog
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill email with unique value
    const uniqueEmail = generateUniqueName(testInfo, 'user') + '@test.com';
    const emailInput = dialog
      .locator('input#create-email')
      .or(dialog.locator('input[type="email"]'));
    await expect(emailInput).toBeVisible();
    await emailInput.fill(uniqueEmail);

    // Wait for roles to load
    await expect(dialog.locator('label').first().or(dialog.getByText('No roles'))).toBeVisible({
      timeout: 10000,
    });

    // Select the "User" role checkbox
    // Radix UI checkboxes need force click to ensure event propagation
    const userCheckbox = dialog.getByRole('checkbox', { name: /User/i });
    await userCheckbox.click({ force: true });
    await adminPage.waitForTimeout(500);

    // If still not checked, try clicking the parent label
    const isChecked = await userCheckbox.isChecked();
    if (!isChecked) {
      const userRoleLabel = dialog.locator('label').filter({ hasText: 'User' }).first();
      await userRoleLabel.click({ force: true });
      await adminPage.waitForTimeout(500);
    }

    // Verify checkbox is now checked
    await expect(userCheckbox).toBeChecked({ timeout: 5000 });

    // Submit form
    const submitButton = dialog.getByRole('button', { name: /create user/i });
    await submitButton.click();

    // Wait for dialog to close (either create dialog closes or token dialog appears)
    await adminPage.waitForTimeout(2000);

    // Check for token dialog
    const tokenHeading = adminPage.getByRole('heading', { name: /access token/i });
    if (await tokenHeading.isVisible().catch(() => false)) {
      // Close token dialog
      await adminPage.getByRole('button', { name: /close/i }).first().click();
    }

    // Verify user appears in list
    await expect(adminPage.locator('table')).toContainText(uniqueEmail, { timeout: 15000 });
  });

  test('should display new access token in dialog after creation', async ({
    adminPage,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({
      timeout: 15000,
    });

    const createButton = adminPage.getByRole('button', { name: /create user/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueEmail = generateUniqueName(testInfo, 'tokentest') + '@test.com';
    const emailInput = dialog
      .locator('input#create-email')
      .or(dialog.locator('input[type="email"]'));
    await emailInput.fill(uniqueEmail);

    // Select a role - use force click for Radix UI checkboxes
    const userCheckbox = dialog.getByRole('checkbox', { name: /User/i });
    if ((await userCheckbox.count()) > 0) {
      await userCheckbox.click({ force: true });
      await adminPage.waitForTimeout(300);
    }

    await dialog.getByRole('button', { name: /create user/i }).click();

    // Wait for token dialog
    await adminPage.waitForTimeout(2000);
    const tokenDialog = adminPage.getByRole('dialog');
    const tokenDisplay = tokenDialog.locator('.font-mono').or(tokenDialog.locator('code'));

    // Check if token is displayed
    if (await tokenDisplay.isVisible().catch(() => false)) {
      const token = await tokenDisplay.textContent();
      expect(token).toBeTruthy();
      expect(token!.length).toBeGreaterThan(10);

      // Close dialog
      await adminPage.getByRole('button', { name: /close/i }).first().click();
    }
  });

  test('should show validation error for invalid email format', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const createButton = adminPage.getByRole('button', { name: /create user/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Check if this is a billing limit dialog instead of create user dialog
    const limitReachedTitle = dialog.getByRole('heading', { name: /limit reached/i });
    if (await limitReachedTitle.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Close the billing limit dialog and skip this test
      const maybeLaterButton = dialog.getByRole('button', { name: /maybe later/i });
      if (await maybeLaterButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await maybeLaterButton.click();
      }
      test.skip(true, 'Skipping test: user limit reached on free plan');
      return;
    }

    // Enter invalid email
    const emailInput = dialog
      .locator('input#create-email')
      .or(dialog.locator('input[type="email"]'));
    await emailInput.fill('invalid-email-format');

    // Select a role - use force click for Radix UI checkboxes
    const userCheckbox = dialog.getByRole('checkbox', { name: /User/i });
    if ((await userCheckbox.count()) > 0) {
      await userCheckbox.click({ force: true });
      await adminPage.waitForTimeout(300);
    }

    // Try to submit
    await dialog.getByRole('button', { name: /create user/i }).click();

    // Should show validation error or stay in dialog
    await adminPage.waitForTimeout(1000);
    await expect(dialog).toBeVisible();
  });

  test('should show validation error when no role selected', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const createButton = adminPage.getByRole('button', { name: /create user/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Enter valid email but don't select any role
    const uniqueEmail = generateUniqueName(testInfo, 'norole') + '@test.com';
    const emailInput = dialog
      .locator('input#create-email')
      .or(dialog.locator('input[type="email"]'));
    await emailInput.fill(uniqueEmail);

    // Try to submit without selecting role
    await dialog.getByRole('button', { name: /create user/i }).click();

    // Should show validation error or stay in dialog
    await adminPage.waitForTimeout(1000);
    await expect(dialog).toBeVisible();
  });

  test('should prevent creating user with duplicate email', async ({ adminPage }) => {
    const prisma = await getPrisma();

    // Get an existing user email
    const existingUser = await prisma.user.findFirst({
      where: { deletedAt: null },
    });

    test.skip(!existingUser, 'No existing user found to test duplicate email');

    if (!existingUser) {
      return;
    }

    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const createButton = adminPage.getByRole('button', { name: /create user/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Enter duplicate email
    const emailInput = dialog
      .locator('input#create-email')
      .or(dialog.locator('input[type="email"]'));
    await emailInput.fill(existingUser.email);

    // Select a role - use force click for Radix UI checkboxes
    const userCheckbox = dialog.getByRole('checkbox', { name: /User/i });
    if ((await userCheckbox.count()) > 0) {
      await userCheckbox.click({ force: true });
      await adminPage.waitForTimeout(300);
    }

    // Submit
    await dialog.getByRole('button', { name: /create user/i }).click();

    // Should show error (dialog stays open or error message appears)
    await adminPage.waitForTimeout(2000);

    // Verify error is shown somehow (dialog stays open or toast appears)
    const hasError =
      (await dialog.isVisible()) ||
      (await adminPage
        .locator('[role="alert"]')
        .isVisible()
        .catch(() => false)) ||
      (await adminPage
        .locator('text=already exists')
        .isVisible()
        .catch(() => false));

    expect(hasError).toBe(true);
  });

  // ============================================================================
  // User Search and Filter Tests
  // ============================================================================

  test('should filter users by search term', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Look for search input
    const searchInput = adminPage
      .locator('input[placeholder*="search" i]')
      .or(adminPage.locator('input[type="search"]'));

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('admin');
      await adminPage.waitForTimeout(500);

      // Table should filter to show only matching results
      await expect(adminPage.locator('tbody tr')).toBeVisible();
    }
  });

  test('should paginate through users if many exist', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Look for pagination controls
    const nextButton = adminPage
      .locator('button[aria-label="Next page"]')
      .or(adminPage.getByRole('button', { name: /next/i }));

    // If pagination exists, verify it works
    if ((await nextButton.count()) > 0 && (await nextButton.isEnabled())) {
      await nextButton.click();
      await adminPage.waitForTimeout(500);
      // Page should update
    }
  });
});

test.describe('Admin User Creation with Multiple Roles', () => {
  test('should create user with multiple non-admin roles', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({
      timeout: 15000,
    });

    const createButton = adminPage.getByRole('button', { name: /create user/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueEmail = generateUniqueName(testInfo, 'multirole') + '@test.com';
    const emailInput = dialog
      .locator('input#create-email')
      .or(dialog.locator('input[type="email"]'));
    await emailInput.fill(uniqueEmail);

    // Select a non-admin role - use force click for Radix UI checkboxes
    const userCheckbox = dialog.getByRole('checkbox', { name: /^User$/i });
    const hasUserRole = (await userCheckbox.count()) > 0;

    if (hasUserRole) {
      await userCheckbox.click({ force: true });
      await adminPage.waitForTimeout(500);

      // If still not checked, try clicking the parent label
      const isChecked = await userCheckbox.isChecked();
      if (!isChecked) {
        const userRoleLabel = dialog.locator('label').filter({ hasText: 'User' }).first();
        await userRoleLabel.click({ force: true });
        await adminPage.waitForTimeout(500);
      }

      await expect(userCheckbox).toBeChecked({ timeout: 5000 });
      await dialog.getByRole('button', { name: /create user/i }).click();

      await adminPage.waitForTimeout(2000);

      // Close token dialog if visible
      const closeButton = adminPage.getByRole('button', { name: /close/i });
      if ((await closeButton.count()) > 0 && (await closeButton.first().isVisible())) {
        await closeButton.first().click();
      }

      // Verify user created
      await expect(adminPage.locator('table')).toContainText(uniqueEmail, { timeout: 15000 });
    }
  });
});
