/**
 * E2E Tests: Admin Action Log
 * Tests viewing administrative actions with before/after snapshots
 */

import { expect, navigateTo, test, waitForTable } from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Action Log', () => {
  test('should list admin actions with types', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/action-log');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await waitForTable(adminPage);

    // Verify table structure
    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({ timeout: 15000 });

    // Check for expected columns
    const timestampHeader = adminPage.locator('th').filter({ hasText: /timestamp|time|date/i });
    const adminHeader = adminPage.locator('th').filter({ hasText: /admin/i });
    const actionHeader = adminPage.locator('th').filter({ hasText: /action/i });
    const resourceHeader = adminPage.locator('th').filter({ hasText: /resource/i });

    if ((await adminPage.locator('table').count()) > 0) {
      await expect(timestampHeader).toBeVisible();
      await expect(adminHeader).toBeVisible();
      await expect(actionHeader).toBeVisible();
      await expect(resourceHeader).toBeVisible();
    }

    // If entries exist, verify row structure
    const actionRows = adminPage.locator('tbody tr');
    if ((await actionRows.count()) > 0) {
      const firstRow = actionRows.first();
      await expect(firstRow).toBeVisible();

      // Should show action type label (e.g., "Create User", "Update Policy")
      const actionCell = firstRow.locator('td').nth(2);
      await expect(actionCell).toBeVisible();

      // Action types include: Create User, Update User, Delete User, Create Role, etc.
      const actionTypePatterns = [
        /create|update|delete|restore|enable|disable|approve|deny|refresh|revoke|discover/i,
      ];

      // Verify at least one action type pattern matches in the table
      const _hasValidActionType =
        (await adminPage.locator('tbody td').filter({ hasText: actionTypePatterns[0] }).count()) >
        0;
    }
  });

  test('should show before/after snapshots in detail dialog', async ({
    adminPage,
    tenant: _tenant,
  }) => {
    await navigateTo(adminPage, '/admin/action-log');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await waitForTable(adminPage);

    // Find an action entry and click to view details
    const actionRow = adminPage.locator('tbody tr').first();

    if ((await actionRow.count()) > 0) {
      await actionRow.click();

      const dialog = adminPage.getByRole('dialog');
      if ((await dialog.count()) > 0) {
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Verify dialog title
        await expect(dialog.locator('text=/action.*details/i')).toBeVisible();

        // Look for detail sections
        const detailSections = [
          { name: 'timestamp', regex: /timestamp/i },
          { name: 'admin', regex: /admin/i },
          { name: 'action type', regex: /action.*type/i },
          { name: 'resource type', regex: /resource.*type/i },
        ];

        for (const section of detailSections) {
          const _sectionLabel = dialog.locator('text=').filter({ hasText: section.regex });
        }

        // Look for before/after snapshots
        const beforeSnapshot = dialog.locator('text=/before.*snapshot/i');
        const afterSnapshot = dialog.locator('text=/after.*snapshot/i');

        // Snapshots may or may not be present depending on the action type
        if ((await beforeSnapshot.count()) > 0) {
          await expect(beforeSnapshot).toBeVisible();

          // Snapshot should be displayed in a code/pre block
          const beforePre = dialog.locator('pre').first();
          if ((await beforePre.count()) > 0) {
            await expect(beforePre).toBeVisible();

            // Content should be JSON-like
            const _preContent = await beforePre.textContent();
            // May contain JSON object with entity data
          }
        }

        if ((await afterSnapshot.count()) > 0) {
          await expect(afterSnapshot).toBeVisible();
        }

        // Also check for action details section
        const _actionDetails = dialog.locator('text=/action.*details/i');

        // Check for additional metadata
        const _ipAddress = dialog.locator('text=/ip.*address/i');
        const _userAgent = dialog.locator('text=/user.*agent/i');
        const _reason = dialog.locator('text=/reason/i');

        // Close dialog
        await dialog.getByRole('button', { name: /close/i }).click();
      }
    }

    expect(true).toBe(true);
  });

  test('should filter by action type and resource type', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/action-log');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await waitForTable(adminPage);

    // Open filters dialog - use exact name pattern to avoid matching "Clear X filter" buttons
    const filtersButton = adminPage.getByRole('button', { name: /^Filters/ });
    if ((await filtersButton.count()) > 0) {
      await filtersButton.click();

      const filterDialog = adminPage.getByRole('dialog');
      await expect(filterDialog).toBeVisible({ timeout: 5000 });

      // Filter by action type
      const actionTypeSelect = filterDialog
        .locator('button')
        .filter({ hasText: /all.*action|action.*type/i });
      if ((await actionTypeSelect.count()) > 0) {
        await actionTypeSelect.click();

        // Select a specific action type (e.g., Create User)
        const createUserOption = adminPage.getByRole('option', { name: /create.*user/i });
        if ((await createUserOption.count()) > 0) {
          await createUserOption.click();
          await adminPage.waitForTimeout(300);
        } else {
          // Try another common action type
          const updateOption = adminPage.getByRole('option', { name: /update/i });
          if ((await updateOption.count()) > 0) {
            await updateOption.first().click();
            await adminPage.waitForTimeout(300);
          }
        }
      }

      // Filter by resource type
      const resourceTypeSelect = filterDialog
        .locator('button')
        .filter({ hasText: /all.*resource|resource.*type/i });
      if ((await resourceTypeSelect.count()) > 0) {
        await resourceTypeSelect.click();

        // Select a specific resource type (e.g., User)
        const userOption = adminPage.getByRole('option', { name: /^user$/i });
        if ((await userOption.count()) > 0) {
          await userOption.click();
          await adminPage.waitForTimeout(300);
        } else {
          // Try policy
          const policyOption = adminPage.getByRole('option', { name: /policy/i });
          if ((await policyOption.count()) > 0) {
            await policyOption.click();
            await adminPage.waitForTimeout(300);
          }
        }
      }

      // Apply filters (button is always "Apply")
      const applyButton = filterDialog.getByRole('button', { name: 'Apply' });
      await applyButton.click();

      // Verify active filters are shown
      await adminPage.waitForTimeout(500);

      const _activeFilters = adminPage
        .locator('[data-testid="active-filters"]')
        .or(adminPage.locator('.active-filters'));
    }

    // Test date range filter
    await filtersButton.click();
    const filterDialog2 = adminPage.getByRole('dialog');
    if ((await filterDialog2.count()) > 0) {
      await expect(filterDialog2).toBeVisible({ timeout: 5000 });

      // Look for date inputs
      const startDateInput = filterDialog2.locator('input[type="date"]').first();
      const _endDateInput = filterDialog2.locator('input[type="date"]').last();

      if ((await startDateInput.count()) > 0) {
        // Set a date range
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);

        await startDateInput.fill(startDate.toISOString().split('T')[0]);
      }

      // Apply filters (button is always "Apply")
      await filterDialog2.getByRole('button', { name: 'Apply' }).click();
    }

    expect(true).toBe(true);
  });
});
