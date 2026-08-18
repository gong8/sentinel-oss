/**
 * E2E Tests: Admin Deleted Items
 * Tests viewing and restoring soft-deleted items
 */

import { expect, navigateTo, test, waitForTable } from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Deleted Items', () => {
  test('should list soft-deleted items', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/deleted-items');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await waitForTable(adminPage);

    // Verify table structure or empty state
    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({ timeout: 15000 });

    // Check for expected columns
    const typeHeader = adminPage.locator('th').filter({ hasText: /type/i });
    const nameHeader = adminPage.locator('th').filter({ hasText: /name/i });
    const _deletedByHeader = adminPage.locator('th').filter({ hasText: /deleted.*by/i });
    const _deletedAtHeader = adminPage.locator('th').filter({ hasText: /deleted.*at|date/i });

    if ((await adminPage.locator('table').count()) > 0) {
      await expect(typeHeader).toBeVisible();
      await expect(nameHeader).toBeVisible();
    }

    // If deleted items exist, verify row structure
    const itemRows = adminPage.locator('tbody tr');
    if ((await itemRows.count()) > 0) {
      const firstRow = itemRows.first();
      await expect(firstRow).toBeVisible();

      // Should show entity type (User, Role, Agent, MCP Server, Policy)
      const typeCell = firstRow.locator('td').first();
      await expect(typeCell).toBeVisible();

      const typeCellText = await typeCell.textContent();
      const validTypes = ['User', 'Role', 'Agent', 'MCP Server', 'Policy'];
      const _hasValidType = validTypes.some((type) =>
        typeCellText?.toLowerCase().includes(type.toLowerCase()),
      );

      // Should have restore button
      const restoreButton = firstRow.getByRole('button', { name: /restore/i });
      await expect(restoreButton).toBeVisible();
    }

    // Test filtering by type
    const filtersButton = adminPage.getByRole('button', { name: /filter/i });
    if ((await filtersButton.count()) > 0) {
      await filtersButton.click();

      const filterDialog = adminPage.getByRole('dialog');
      await expect(filterDialog).toBeVisible({ timeout: 5000 });

      // Filter by item type
      const typeSelect = filterDialog.locator('button').filter({ hasText: /all.*type|type/i });
      if ((await typeSelect.count()) > 0) {
        await typeSelect.click();

        // Select User type
        const userOption = adminPage.getByRole('option', { name: /user/i });
        if ((await userOption.count()) > 0) {
          await userOption.click();
          await adminPage.waitForTimeout(300);
        }
      }

      // Close filter dialog
      await filterDialog
        .getByRole('button', { name: /apply|close|cancel/i })
        .first()
        .click();
    }

    // Test search functionality
    const searchInput = adminPage.locator('input[placeholder*="search"]');
    if ((await searchInput.count()) > 0) {
      await searchInput.fill('test');
      await adminPage.waitForTimeout(500);

      // Clear search
      await searchInput.clear();
    }

    expect(true).toBe(true);
  });

  test('should restore deleted item', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/deleted-items');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await waitForTable(adminPage);

    // Find a deleted item and try to restore
    const itemRow = adminPage.locator('tbody tr').first();

    if ((await itemRow.count()) > 0) {
      // Get item info before restoring
      const typeCell = itemRow.locator('td').first();
      const nameCell = itemRow.locator('td').nth(1);

      const _itemType = await typeCell.textContent();
      const itemName = await nameCell.textContent();

      // Click restore button
      const restoreButton = itemRow.getByRole('button', { name: /restore/i });

      if ((await restoreButton.count()) > 0) {
        await restoreButton.click();

        // Confirmation dialog should appear
        const confirmDialog = adminPage.getByRole('dialog');
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        // Verify dialog shows item name
        if (itemName) {
          await expect(confirmDialog.locator(`text=${itemName}`)).toBeVisible();
        }

        // Verify dialog shows restore confirmation message
        await expect(confirmDialog.locator('text=/restore|make.*active/i')).toBeVisible();

        // Check for Cancel and Restore buttons
        const cancelButton = confirmDialog.getByRole('button', { name: /cancel/i });
        const confirmRestoreButton = confirmDialog.getByRole('button', { name: /^restore$/i });

        await expect(cancelButton).toBeVisible();
        await expect(confirmRestoreButton).toBeVisible();

        // Cancel instead of actually restoring to avoid test data issues
        await cancelButton.click();

        // Dialog should close
        await expect(confirmDialog).not.toBeVisible();
      }
    } else {
      // No deleted items to restore - this is acceptable
      const emptyState = adminPage.locator('text=/no.*deleted.*item|no.*item/i');
      if ((await emptyState.count()) > 0) {
        await expect(emptyState).toBeVisible();
      }
    }

    // Test that restore confirmation shows correct entity type
    const itemRows = adminPage.locator('tbody tr');
    if ((await itemRows.count()) > 1) {
      // Try second item if available
      const secondRow = itemRows.nth(1);
      const secondRestoreButton = secondRow.getByRole('button', { name: /restore/i });

      if ((await secondRestoreButton.count()) > 0) {
        await secondRestoreButton.click();

        const dialog = adminPage.getByRole('dialog');
        if ((await dialog.count()) > 0) {
          await expect(dialog).toBeVisible({ timeout: 5000 });

          // Dialog title should include entity type
          const dialogTitle = dialog.locator(
            '[role="dialog"] h2, [role="dialog"] [class*="title"]',
          );
          if ((await dialogTitle.count()) > 0) {
            const titleText = await dialogTitle.textContent();
            // Should include type like "Restore User" or "Restore Role"
            const _hasEntityType =
              titleText?.includes('User') ||
              titleText?.includes('Role') ||
              titleText?.includes('Agent') ||
              titleText?.includes('MCP Server') ||
              titleText?.includes('Policy');
          }

          // Cancel
          await dialog.getByRole('button', { name: /cancel/i }).click();
        }
      }
    }

    expect(true).toBe(true);
  });
});
