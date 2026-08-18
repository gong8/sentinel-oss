/**
 * E2E Tests: User Audit Log
 * Tests user-scoped audit entries, filtering, and pagination
 */

import { expect, navigateTo, test, waitForTable } from '../../helpers/e2e-fixtures.js';

test.describe('User Audit Log', () => {
  test('should display user audit page with correct structure', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    await expect(userPage.getByRole('heading', { name: 'My Audit Log' })).toBeVisible({
      timeout: 15000,
    });

    await expect(userPage.getByRole('heading', { name: 'Audit entries' })).toBeVisible();

    const table = userPage.locator('table');
    const emptyStateText = userPage.getByText('No audit entries');

    await expect(table.or(emptyStateText)).toBeVisible({ timeout: 15000 });

    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await expect(userPage.locator('th').filter({ hasText: /tool/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /decision/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /timestamp/i })).toBeVisible();

      const rows = userPage.locator('tbody tr');
      await expect(rows.first()).toBeVisible();
    } else {
      await expect(emptyStateText).toBeVisible();
    }
  });

  test('should show ALLOW/DENY decision badges', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();

      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = rows.nth(i);

        const allowBadge = row.getByText('ALLOW', { exact: true });
        const denyBadge = row.getByText('DENY', { exact: true });

        const hasDecisionBadge =
          (await allowBadge.isVisible().catch(() => false)) ||
          (await denyBadge.isVisible().catch(() => false));

        expect(hasDecisionBadge).toBe(true);
      }
    }
  });

  test('should display filters section with correct controls', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    await expect(userPage.getByRole('heading', { name: 'Filters' })).toBeVisible({
      timeout: 15000,
    });

    const toolNameInput = userPage.locator('#toolName');
    await expect(toolNameInput).toBeVisible();

    const decisionTrigger = userPage.getByRole('combobox');
    await expect(decisionTrigger).toBeVisible();

    await expect(userPage.getByRole('button', { name: 'Reset' })).toBeVisible();
    await expect(userPage.getByRole('button', { name: 'Apply' })).toBeVisible();
  });

  test('should filter audit entries by decision', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    await expect(userPage.getByRole('heading', { name: 'Filters' })).toBeVisible({
      timeout: 15000,
    });

    const decisionTrigger = userPage.getByRole('combobox');
    await decisionTrigger.click();
    await userPage.getByRole('option', { name: 'ALLOWED' }).click();

    await userPage.getByRole('button', { name: 'Apply' }).click();
    await userPage.waitForTimeout(500);

    const table = userPage.locator('table');
    if (await table.isVisible()) {
      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();

      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = rows.nth(i);
        await expect(row.getByText('ALLOW', { exact: true })).toBeVisible();
      }
    }

    await userPage.getByRole('button', { name: 'Reset' }).click();
    await userPage.waitForTimeout(500);

    await decisionTrigger.click();
    await userPage.getByRole('option', { name: 'DENIED' }).click();
    await userPage.getByRole('button', { name: 'Apply' }).click();
    await userPage.waitForTimeout(500);

    if (await table.isVisible()) {
      const deniedRows = userPage.locator('tbody tr');
      const deniedCount = await deniedRows.count();

      for (let i = 0; i < Math.min(deniedCount, 5); i++) {
        const row = deniedRows.nth(i);
        await expect(row.getByText('DENY', { exact: true })).toBeVisible();
      }
    }
  });

  test('should filter audit entries by tool name', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    await expect(userPage.getByRole('heading', { name: 'Filters' })).toBeVisible({
      timeout: 15000,
    });

    const toolNameInput = userPage.locator('#toolName');
    await expect(toolNameInput).toBeVisible();

    await toolNameInput.fill('create');

    await userPage.getByRole('button', { name: 'Apply' }).click();
    await userPage.waitForTimeout(500);

    const table = userPage.locator('table');
    if (await table.isVisible()) {
      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();

      if (rowCount > 0) {
        const firstRow = rows.first();
        const toolCell = firstRow.locator('td').first();
        const toolText = await toolCell.textContent();
        expect(toolText).toBeTruthy();
      }
    }

    await userPage.getByRole('button', { name: 'Reset' }).click();
  });

  test('should support pagination through audit entries', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    await expect(userPage.getByRole('heading', { name: 'Audit entries' })).toBeVisible({
      timeout: 15000,
    });

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      const nextButton = userPage.getByRole('button', { name: 'Next' });
      const prevButton = userPage.getByRole('button', { name: 'Previous' });

      if ((await nextButton.count()) > 0) {
        const isNextDisabled = await nextButton.isDisabled();

        if (!isNextDisabled) {
          const firstRowBefore = await userPage.locator('tbody tr').first().textContent();

          await nextButton.click();
          await userPage.waitForTimeout(500);

          const firstRowAfter = await userPage.locator('tbody tr').first().textContent();

          const contentChanged = firstRowBefore !== firstRowAfter;
          const isAtEnd = await nextButton.isDisabled();

          expect(contentChanged || isAtEnd).toBe(true);

          if ((await prevButton.count()) > 0 && !(await prevButton.isDisabled())) {
            await prevButton.click();
          }
        }
      }
    }
  });

  test('should show entry count in card description', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    await expect(userPage.getByRole('heading', { name: 'Audit entries' })).toBeVisible({
      timeout: 15000,
    });

    const cardDescription = userPage.getByText(/Showing \d+ of \d+ entries/);
    await expect(cardDescription).toBeVisible({ timeout: 15000 });
  });

  test('should open audit detail dialog when clicking View button', async ({ userPage }) => {
    await navigateTo(userPage, '/user/audit');

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      const viewButton = userPage.getByRole('button', { name: 'View' }).first();
      await viewButton.click();

      await expect(userPage.getByRole('dialog')).toBeVisible();
      await expect(userPage.getByRole('heading', { name: 'Audit details' })).toBeVisible();
      await expect(userPage.getByText('Parameters')).toBeVisible();

      await userPage.getByRole('button', { name: 'Close' }).click();
      await expect(userPage.getByRole('dialog')).not.toBeVisible();
    }
  });
});
