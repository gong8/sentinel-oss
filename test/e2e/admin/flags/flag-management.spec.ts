/**
 * E2E Tests: Admin Sensitive Flag Management
 * Tests creating, updating, and deleting sensitive flags with various behaviors
 */

import { expect, navigateTo, test } from '../../../helpers/e2e-fixtures.js';
import { waitForTable } from '../../../helpers/e2e.js';

test.describe('Admin Sensitive Flag Management', () => {
  test('should display sensitive flags page with create button', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const pageTitle = adminPage.getByRole('heading', { name: 'Tool Flags', level: 1 });
    await expect(pageTitle).toBeVisible();

    const createButton = adminPage.getByRole('button', { name: /create flag/i });
    await expect(createButton).toBeVisible();
  });

  test('should open create flag dialog and show behavior options', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: /create flag/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog.getByText('Create Sensitive Flag')).toBeVisible();

    const requireApprovalOption = dialog.getByRole('checkbox', { name: /require approval/i });
    const rateLimitOption = dialog.getByRole('checkbox', { name: /rate limit/i });
    const alertOption = dialog.getByRole('checkbox', { name: /alert/i });

    await expect(requireApprovalOption).toBeVisible();
    await expect(rateLimitOption).toBeVisible();
    await expect(alertOption).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should show rate limit configuration when rate limit behavior is selected', async ({
    adminPage,
  }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: /create flag/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Wait for dialog content to be fully rendered
    await expect(dialog.getByText('Behaviors')).toBeVisible({ timeout: 5000 });

    // Click the label text (not the checkbox) to avoid Radix checkbox interception
    const rateLimitLabel = dialog.getByText('Rate Limit', { exact: true });
    await expect(rateLimitLabel).toBeVisible();
    await rateLimitLabel.click();

    // Wait for the rate limit config section to appear
    const rateLimitConfig = dialog.locator('text=/Rate Limit Configuration/i');
    await expect(rateLimitConfig).toBeVisible({ timeout: 5000 });

    const maxPerSessionInput = dialog.locator('input#maxPerSession');
    const windowMinutesInput = dialog.locator('input#windowMinutes');

    await expect(maxPerSessionInput).toBeVisible();
    await expect(windowMinutesInput).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('should show approval configuration when require approval behavior is selected', async ({
    adminPage,
  }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: /create flag/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Wait for dialog content to be fully rendered
    await expect(dialog.getByText('Behaviors')).toBeVisible({ timeout: 5000 });

    // Click the label text (not the checkbox) to avoid Radix checkbox interception
    const approvalLabel = dialog.getByText('Require Approval', { exact: true });
    await expect(approvalLabel).toBeVisible();
    await approvalLabel.click();

    // Wait for the approval config section to appear
    const approvalConfig = dialog.locator('text=/Approval Configuration/i');
    await expect(approvalConfig).toBeVisible({ timeout: 5000 });

    const sessionOwnerLabel = dialog.locator('label').filter({ hasText: /session owner/i });
    const adminLabel = dialog.locator('label').filter({ hasText: /^admin$/i });
    const timeoutInput = dialog.locator('input#timeoutSeconds');

    await expect(sessionOwnerLabel).toBeVisible();
    await expect(adminLabel).toBeVisible();
    await expect(timeoutInput).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('should show alert configuration when alert behavior is selected', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: /create flag/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Wait for dialog content to be fully rendered
    await expect(dialog.getByText('Behaviors')).toBeVisible({ timeout: 5000 });

    // Click the label text (not the checkbox) to avoid Radix checkbox interception
    const alertLabel = dialog.getByText('Alert', { exact: true });
    await expect(alertLabel).toBeVisible();
    await alertLabel.click();

    // Wait for the alert config section to appear
    const alertConfig = dialog.locator('text=/Alert Configuration/i');
    await expect(alertConfig).toBeVisible({ timeout: 5000 });

    const webhooksSection = dialog.locator('text=/webhook/i');
    await expect(webhooksSection.first()).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('should require at least one behavior to be selected', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: /create flag/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const submitButton = dialog.getByRole('button', { name: /create flag/i });
    await submitButton.click();

    await adminPage.waitForTimeout(500);
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('should open filters dialog and show filter options', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const filtersButton = adminPage.getByRole('button', { name: /filters/i });
    await filtersButton.click();

    const filterDialog = adminPage.getByRole('dialog');
    await expect(filterDialog).toBeVisible({ timeout: 5000 });

    await expect(filterDialog.getByText('Filter Flags')).toBeVisible();

    await expect(filterDialog.getByText('Status', { exact: true })).toBeVisible();
    await expect(filterDialog.getByText('Behavior', { exact: true })).toBeVisible();

    const applyButton = filterDialog.getByRole('button', { name: /apply filters/i });
    await expect(applyButton).toBeVisible();

    const clearButton = filterDialog.getByRole('button', { name: /clear all filters/i });
    await expect(clearButton).toBeVisible();

    await applyButton.click();
    await expect(filterDialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should show edit and delete buttons for existing flags', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const tableOrEmpty = adminPage
      .locator('table')
      .or(adminPage.locator('[data-testid="empty-state"]'));
    await expect(tableOrEmpty).toBeVisible();

    const hasTable = (await adminPage.locator('table').count()) > 0;
    if (!hasTable) {
      return;
    }

    const flagRow = adminPage.locator('tbody tr').first();
    if ((await flagRow.count()) > 0) {
      const viewButton = flagRow.getByRole('button', { name: /view/i });
      const editButton = flagRow.getByRole('button', { name: /edit/i });
      const deleteButton = flagRow.getByRole('button', { name: /delete/i });

      await expect(viewButton).toBeVisible();
      await expect(editButton).toBeVisible();
      await expect(deleteButton).toBeVisible();
    }
  });

  test('should show enabled/disabled toggle switch for flags', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const hasTable = (await adminPage.locator('table').count()) > 0;
    if (!hasTable) {
      return;
    }

    const flagRow = adminPage.locator('tbody tr').first();
    if ((await flagRow.count()) > 0) {
      const toggleSwitch = flagRow.locator('[role="switch"]');
      await expect(toggleSwitch).toBeVisible();
    }
  });

  test('should open view dialog showing flag details', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const hasTable = (await adminPage.locator('table').count()) > 0;
    if (!hasTable) {
      return;
    }

    const flagRow = adminPage.locator('tbody tr').first();
    if ((await flagRow.count()) === 0) {
      return;
    }

    const viewButton = flagRow.getByRole('button', { name: /view/i });
    await viewButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog.getByText('Flag Details')).toBeVisible();
    await expect(dialog.locator('text=/tool pattern/i')).toBeVisible();
    await expect(dialog.locator('text=/behaviors/i').first()).toBeVisible();

    const addOverrideButton = dialog.getByRole('button', { name: /add override/i });
    await expect(addOverrideButton).toBeVisible();

    const closeButton = dialog.getByRole('button', { name: /close/i });
    await closeButton.click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should open edit dialog for existing flag', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const hasTable = (await adminPage.locator('table').count()) > 0;
    if (!hasTable) {
      return;
    }

    const flagRow = adminPage.locator('tbody tr').first();
    if ((await flagRow.count()) === 0) {
      return;
    }

    const editButton = flagRow.getByRole('button', { name: /edit/i });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog.getByText('Edit Sensitive Flag')).toBeVisible();

    const behaviorOptions = dialog.locator('[role="checkbox"]');
    expect(await behaviorOptions.count()).toBeGreaterThan(0);

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should show delete confirmation dialog', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const hasTable = (await adminPage.locator('table').count()) > 0;
    if (!hasTable) {
      return;
    }

    const flagRow = adminPage.locator('tbody tr').first();
    if ((await flagRow.count()) === 0) {
      return;
    }

    const deleteButton = flagRow.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog.getByText('Delete Sensitive Flag')).toBeVisible();
    await expect(dialog.locator('text=/are you sure/i')).toBeVisible();

    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    const confirmDeleteButton = dialog.getByRole('button', { name: /^delete$/i });

    await expect(cancelButton).toBeVisible();
    await expect(confirmDeleteButton).toBeVisible();

    await cancelButton.click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should allow selecting multiple behaviors', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: /create flag/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Wait for dialog content to be fully rendered
    await expect(dialog.getByText('Behaviors')).toBeVisible({ timeout: 5000 });

    // Click the label texts (not the checkbox) to avoid Radix checkbox interception
    const rateLimitLabel = dialog.getByText('Rate Limit', { exact: true });
    const approvalLabel = dialog.getByText('Require Approval', { exact: true });

    await expect(rateLimitLabel).toBeVisible();
    await rateLimitLabel.click();

    // Wait for rate limit to be selected before clicking approval
    const rateLimitConfig = dialog.locator('text=/Rate Limit Configuration/i');
    await expect(rateLimitConfig).toBeVisible({ timeout: 5000 });

    await expect(approvalLabel).toBeVisible();
    await approvalLabel.click();

    // Wait for both config sections to appear
    await expect(rateLimitConfig).toBeVisible({ timeout: 5000 });

    const maxPerSessionInput = dialog.locator('input#maxPerSession');
    await expect(maxPerSessionInput).toBeVisible();

    const sessionOwnerLabel = dialog.locator('label').filter({ hasText: /session owner/i });
    await expect(sessionOwnerLabel).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('should show search input for filtering flags', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/sensitive-flags');
    await waitForTable(adminPage);

    const searchInput = adminPage.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
  });
});
