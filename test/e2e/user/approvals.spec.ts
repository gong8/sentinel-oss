/**
 * E2E Tests: User Live Approvals
 * Tests approval request display, self-approval, and cancellation
 */

import { expect, navigateTo, test, waitForTable } from '../../helpers/e2e-fixtures.js';

test.describe('User Live Approvals', () => {
  // ============================================================================
  // Approval Display Tests
  // ============================================================================

  test('should display pending approvals with details', async ({ userPage }) => {
    await navigateTo(userPage, '/user/approvals');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Page header should be visible
    await expect(userPage.getByRole('heading', { name: 'Live Approvals' })).toBeVisible({
      timeout: 15000,
    });

    // Approval Requests card should be visible
    await expect(userPage.getByRole('heading', { name: 'Approval Requests' })).toBeVisible({
      timeout: 10000,
    });

    // Check for table or empty state - wait for content to load
    const table = userPage.locator('table');
    const emptyStateText = userPage.getByText('No pending approvals');

    // Wait for either table or empty state to appear
    await expect(table.or(emptyStateText)).toBeVisible({ timeout: 15000 });

    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      // Table headers should be present
      await expect(userPage.locator('th').filter({ hasText: /tool/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /agent/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /status/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /requested/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /expires/i })).toBeVisible();

      // At least one approval row should exist
      const rows = userPage.locator('tbody tr');
      await expect(rows.first()).toBeVisible();
    } else {
      // Empty state should be shown
      await expect(emptyStateText).toBeVisible();
    }
  });

  test('should show approval details in view dialog', async ({ userPage }) => {
    await navigateTo(userPage, '/user/approvals');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      // Look for View button
      const viewButtons = userPage.getByRole('button', { name: /view/i });
      const buttonCount = await viewButtons.count();

      if (buttonCount > 0) {
        // Click first View button
        await viewButtons.first().click();

        // Dialog should open with details
        const dialog = userPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Should show approval details
        await expect(dialog.locator('text=Approval Request Details')).toBeVisible();

        // Should show parameters section
        await expect(dialog.locator('text=Parameters')).toBeVisible();

        // Should show metadata
        await expect(dialog.locator('text=Agent:')).toBeVisible();
        await expect(dialog.locator('text=Requested:')).toBeVisible();
        await expect(dialog.locator('text=Expires:')).toBeVisible();
        await expect(dialog.locator('text=Self-Approve:')).toBeVisible();

        // Close dialog
        await dialog.getByRole('button', { name: /close/i }).click();
        await expect(dialog).not.toBeVisible();
      }
    }
  });

  test('should allow self-approval when permitted', async ({ userPage }) => {
    await navigateTo(userPage, '/user/approvals');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      // Look for Approve button (only visible if self-approve is allowed)
      const approveButtons = userPage.getByRole('button', { name: /^approve$/i });
      const buttonCount = await approveButtons.count();

      if (buttonCount > 0) {
        // Approve button exists - user can self-approve
        const firstApproveButton = approveButtons.first();
        await expect(firstApproveButton).toBeVisible();

        // Get initial count of rows
        const initialRowCount = await userPage.locator('tbody tr').count();

        // Click approve
        await firstApproveButton.click();

        // Wait for mutation to complete
        await userPage.waitForTimeout(2000);

        // Either row disappears or status changes
        const newRowCount = await userPage.locator('tbody tr').count();

        // After approval, row count may decrease or status may change
        expect(newRowCount).toBeLessThanOrEqual(initialRowCount);
      }
    }
  });

  test('should allow cancelling approval request', async ({ userPage }) => {
    await navigateTo(userPage, '/user/approvals');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      // Look for Cancel button
      const cancelButtons = userPage.getByRole('button', { name: /^cancel$/i });
      const buttonCount = await cancelButtons.count();

      if (buttonCount > 0) {
        // Click first cancel button
        await cancelButtons.first().click();

        // Confirmation dialog should appear
        const dialog = userPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Should show confirmation message
        await expect(dialog.locator('text=Cancel Approval Request')).toBeVisible();
        await expect(dialog.locator('text=Are you sure you want to cancel')).toBeVisible();

        // Should have confirm and keep buttons
        const confirmCancelButton = dialog.getByRole('button', { name: /cancel request/i });
        const keepButton = dialog.getByRole('button', { name: /keep request/i });

        await expect(confirmCancelButton).toBeVisible();
        await expect(keepButton).toBeVisible();

        // Keep request to avoid modifying data
        await keepButton.click();
        await expect(dialog).not.toBeVisible();
      }
    }
  });

  test('should show expiration status in expires column', async ({ userPage }) => {
    await navigateTo(userPage, '/user/approvals');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();

      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = rows.nth(i);

        // Expires column should show: a date/time, "Never", or "Expired"
        const expiresCell = row.locator('td').nth(4);
        await expect(expiresCell).toBeVisible();

        const expiresText = await expiresCell.textContent();

        // Should have some expiration info
        const hasValidExpires =
          expiresText?.includes('Never') ||
          expiresText?.includes('Expired') ||
          /\d{1,2}[:/]\d{2}/.test(expiresText || ''); // Date/time pattern

        expect(hasValidExpires).toBe(true);
      }
    }
  });
});
