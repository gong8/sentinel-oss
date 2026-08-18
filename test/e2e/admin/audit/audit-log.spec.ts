/**
 * E2E Tests: Admin Audit Log
 * Tests viewing and filtering tool invocation audit entries
 */

import { expect, navigateTo, test, waitForTable } from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Audit Log', () => {
  test('should display audit log page with table structure', async ({
    adminPage,
    tenant: _tenant,
  }) => {
    await navigateTo(adminPage, '/admin/audit');
    await waitForTable(adminPage);

    await expect(adminPage.locator('h1:has-text("Audit Log")')).toBeVisible();

    const tableOrEmpty = adminPage
      .locator('table')
      .or(adminPage.locator('[data-testid="empty-state"]'));
    await expect(tableOrEmpty).toBeVisible({ timeout: 15000 });

    const table = adminPage.locator('table');
    if ((await table.count()) > 0) {
      await expect(adminPage.locator('th:has-text("Tool")')).toBeVisible();
      await expect(adminPage.locator('th:has-text("User/Agent")')).toBeVisible();
      await expect(adminPage.locator('th:has-text("Decision")')).toBeVisible();
      await expect(adminPage.locator('th:has-text("Timestamp")')).toBeVisible();
      await expect(adminPage.locator('th:has-text("Actions")')).toBeVisible();
    }
  });

  test('should open filters dialog and apply decision filter', async ({
    adminPage,
    tenant: _tenant,
  }) => {
    await navigateTo(adminPage, '/admin/audit');
    await waitForTable(adminPage);

    const filtersButton = adminPage.getByRole('button', { name: /Filters/ });
    await expect(filtersButton).toBeVisible();
    await filtersButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('text=Filter Audit Entries')).toBeVisible();

    const decisionSelect = dialog
      .locator('label:has-text("Decision")')
      .locator('..')
      .locator('button');
    await decisionSelect.click();

    const allowedOption = adminPage.locator('[role="option"]:has-text("ALLOWED")');
    await expect(allowedOption).toBeVisible();
    await allowedOption.click();

    const applyButton = dialog.getByRole('button', { name: 'Apply' });
    await applyButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should open filters dialog and filter by user', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/audit');
    await waitForTable(adminPage);

    const filtersButton = adminPage.getByRole('button', { name: /Filters/ });
    await filtersButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const userLabel = dialog.locator('label:has-text("User")').first();
    await expect(userLabel).toBeVisible();

    const userSelect = userLabel.locator('..').locator('button');
    if ((await userSelect.count()) > 0) {
      await userSelect.click();
      const options = adminPage.locator('[role="option"]');
      if ((await options.count()) > 0) {
        await options.first().click();
      }
    }

    const applyButton = dialog.getByRole('button', { name: 'Apply' });
    await applyButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should open filters dialog and filter by agent', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/audit');
    await waitForTable(adminPage);

    const filtersButton = adminPage.getByRole('button', { name: /Filters/ });
    await filtersButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const agentLabel = dialog.locator('label:has-text("Agent")');
    await expect(agentLabel).toBeVisible();

    const agentSelect = agentLabel.locator('..').locator('button');
    if ((await agentSelect.count()) > 0) {
      await agentSelect.click();
      const options = adminPage.locator('[role="option"]');
      if ((await options.count()) > 0) {
        await options.first().click();
      }
    }

    const applyButton = dialog.getByRole('button', { name: 'Apply' });
    await applyButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should show entry details when clicking View Details', async ({
    adminPage,
    tenant: _tenant,
  }) => {
    await navigateTo(adminPage, '/admin/audit');
    await waitForTable(adminPage);

    const viewDetailsButton = adminPage.getByRole('button', { name: 'View Details' }).first();
    if ((await viewDetailsButton.count()) > 0) {
      await viewDetailsButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await expect(dialog.locator('text=Test Result Details')).toBeVisible();
      await expect(dialog.locator('text=Decision:')).toBeVisible();
      await expect(dialog.locator('text=Tool')).toBeVisible();
      await expect(dialog.locator('text=Context')).toBeVisible();

      const closeButton = dialog.getByRole('button', { name: 'Close' });
      await expect(closeButton).toBeVisible();

      const resimulateButton = dialog.getByRole('button', {
        name: 'Resimulate with Current Rules',
      });
      await expect(resimulateButton).toBeVisible();

      await closeButton.click();
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('should clear all filters', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/audit');
    await waitForTable(adminPage);

    const filtersButton = adminPage.getByRole('button', { name: /Filters/ });
    await filtersButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const decisionSelect = dialog
      .locator('label:has-text("Decision")')
      .locator('..')
      .locator('button');
    await decisionSelect.click();
    await adminPage.locator('[role="option"]:has-text("DENIED")').click();

    const applyButton = dialog.getByRole('button', { name: 'Apply' });
    await applyButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    const clearAllButton = adminPage.getByRole('button', { name: 'Clear all' });
    if ((await clearAllButton.count()) > 0) {
      await clearAllButton.click();
    }
  });

  test('should search audit entries', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/audit');
    await waitForTable(adminPage);

    const searchInput = adminPage.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('test-search-term');
    await adminPage.waitForTimeout(300);

    await searchInput.fill('');
  });
});
