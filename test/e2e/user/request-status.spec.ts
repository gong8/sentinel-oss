/**
 * E2E Tests: User Request Status
 * Tests request listing, status display, and withdrawal
 */

import { expect, navigateTo, test, waitForTable } from '../../helpers/e2e-fixtures.js';

test.describe('User Request Status', () => {
  // ============================================================================
  // Request Listing Tests
  // ============================================================================

  test('should list user requests with details', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Page should load - use heading to be specific
    await expect(userPage.getByRole('heading', { name: 'Requests', level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Request history section should be visible (it's a h3 heading)
    await expect(userPage.getByRole('heading', { name: 'Request history' })).toBeVisible();

    // Check for table or empty state - wait for either to appear
    const table = userPage.locator('table');
    const emptyState = userPage
      .getByText('No requests yet')
      .or(userPage.getByText('No pending requests'))
      .or(userPage.locator('[data-testid="empty-state"]'));

    // Wait for either table or empty state to appear (use first() to avoid strict mode)
    await expect(table.or(emptyState).first()).toBeVisible({ timeout: 10000 });

    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      // Table headers should be present
      await expect(userPage.locator('th').filter({ hasText: /type/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /details/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /status/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /created/i })).toBeVisible();

      // At least one request row should exist
      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // First row should have request details
      const firstRow = rows.first();
      await expect(firstRow.locator('td').first()).toBeVisible();
    }
    // If no table, empty state was visible (verified by the or() wait above)
  });

  test('should show status badges on requests', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(userPage.getByText('Request history')).toBeVisible({ timeout: 15000 });

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();

      // Check each row for status
      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = rows.nth(i);

        // Status should be one of: PENDING, APPROVED, MODIFIED, DENIED, WITHDRAWN
        const statusCell = row.locator('td').nth(2);
        const statusText = await statusCell.textContent();

        const validStatuses = ['PENDING', 'APPROVED', 'MODIFIED', 'DENIED', 'WITHDRAWN'];
        const hasValidStatus = validStatuses.some((status) =>
          statusText?.toUpperCase().includes(status),
        );

        expect(hasValidStatus).toBe(true);
      }
    }
  });

  test('should allow withdrawing pending requests', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(userPage.getByText('Request history')).toBeVisible({ timeout: 15000 });

    // Look for Withdraw button (only visible on PENDING requests)
    const withdrawButtons = userPage.getByRole('button', { name: /withdraw/i });
    const buttonCount = await withdrawButtons.count();

    if (buttonCount > 0) {
      // Click first withdraw button
      await withdrawButtons.first().click();

      // Confirmation dialog should appear
      const dialog = userPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Should show confirmation message
      await expect(dialog.locator('text=Withdraw Request')).toBeVisible();
      await expect(
        dialog.locator('text=Are you sure you want to withdraw this permission request'),
      ).toBeVisible();

      // Should have confirm and cancel buttons
      const confirmButton = dialog.getByRole('button', { name: /withdraw request/i });
      const cancelButton = dialog.getByRole('button', { name: /cancel/i });

      await expect(confirmButton).toBeVisible();
      await expect(cancelButton).toBeVisible();

      // Cancel to avoid modifying data
      await cancelButton.click();
      await expect(dialog).not.toBeVisible();
    }
  });

  test('should show denial reason when request is denied', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(userPage.getByText('Request history')).toBeVisible({ timeout: 15000 });

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      // Look for DENIED status in any row
      const deniedRows = userPage.locator('tbody tr').filter({
        has: userPage.locator('td:has-text("DENIED")'),
      });
      const deniedCount = await deniedRows.count();

      if (deniedCount > 0) {
        const firstDenied = deniedRows.first();

        // Review column should contain the denial reason or "Pending review"
        const reviewCell = firstDenied.locator('td').nth(4);
        await expect(reviewCell).toBeVisible();

        const reviewText = await reviewCell.textContent();
        // Should have some review note content
        expect(reviewText).toBeTruthy();
      }

      // Also check that Review column header exists
      await expect(userPage.locator('th').filter({ hasText: /review/i })).toBeVisible();
    }
  });
});
