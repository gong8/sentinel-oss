/**
 * E2E Tests: User MCP Servers List
 * Tests server listing, connection status, and server details
 */

import { expect, navigateTo, test, waitForTable } from '../../helpers/e2e-fixtures.js';

test.describe('User MCP Servers List', () => {
  // ============================================================================
  // Server Listing Tests
  // ============================================================================

  test('should list available MCP servers with details', async ({ userPage }) => {
    await navigateTo(userPage, '/user/mcp-servers');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Page header should be visible - use heading role to avoid matching sidebar link
    await expect(userPage.getByRole('heading', { name: 'MCP Servers' })).toBeVisible({
      timeout: 15000,
    });

    // Check for table or empty state
    const table = userPage.locator('table');
    const emptyStateText = userPage.getByText('No MCP servers available');

    // Wait for either table or empty state to appear
    await expect(table.or(emptyStateText)).toBeVisible({ timeout: 15000 });

    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      // Table headers should be present
      await expect(userPage.locator('th').filter({ hasText: /name/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /url/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /auth/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /status/i })).toBeVisible();
      await expect(userPage.locator('th').filter({ hasText: /tools/i })).toBeVisible();

      // At least one server row should exist
      const rows = userPage.locator('tbody tr');
      await expect(rows.first()).toBeVisible();

      // First row should have server details
      const firstRow = rows.first();
      await expect(firstRow.locator('td').first()).toBeVisible();
    } else {
      // Empty state should be shown
      await expect(emptyStateText).toBeVisible();
    }
  });

  test('should show connection status per server', async ({ userPage }) => {
    await navigateTo(userPage, '/user/mcp-servers');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Wait for table to load
    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      // Each server row should show a status
      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();

      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = rows.nth(i);

        // Status should be one of: Connected, Needs credentials, No auth required
        const connectedStatus = row.locator('text=Connected');
        const needsCredentials = row.locator('text=Needs credentials');
        const noAuthRequired = row.locator('text=No auth required');

        const hasStatus =
          (await connectedStatus.isVisible().catch(() => false)) ||
          (await needsCredentials.isVisible().catch(() => false)) ||
          (await noAuthRequired.isVisible().catch(() => false));

        expect(hasStatus).toBe(true);
      }
    }
  });

  test('should show server details with tools and manage button', async ({ userPage }) => {
    await navigateTo(userPage, '/user/mcp-servers');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const table = userPage.locator('table');
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await waitForTable(userPage);

      const rows = userPage.locator('tbody tr');
      const rowCount = await rows.count();

      if (rowCount > 0) {
        const firstRow = rows.first();

        // Server should show name
        const nameCell = firstRow.locator('td').first();
        await expect(nameCell).toBeVisible();
        const serverName = await nameCell.textContent();
        expect(serverName).toBeTruthy();

        // Server should show URL
        const urlCell = firstRow.locator('td').nth(1);
        await expect(urlCell).toBeVisible();

        // Server should show auth type
        const authCell = firstRow.locator('td').nth(2);
        await expect(authCell).toBeVisible();
        const authType = await authCell.textContent();
        expect(['NONE', 'API_KEY', 'OAUTH']).toContain(authType?.trim());

        // Server should have a Manage button
        const manageButton = firstRow.getByRole('button', { name: /manage/i });
        await expect(manageButton).toBeVisible();

        // Clicking Manage should navigate to credentials page
        await manageButton.click();
        await expect(userPage).toHaveURL(/.*\/user\/credentials/);
      }
    }
  });
});
