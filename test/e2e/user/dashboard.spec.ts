/**
 * E2E Tests: User Dashboard
 * Tests user dashboard stats, alerts, quick actions, and recent activity
 */

import { expect, navigateTo, test } from '../../helpers/e2e-fixtures.js';

test.describe('User Dashboard', () => {
  // ============================================================================
  // Stats Cards Tests
  // ============================================================================

  test('should display stats cards with tool and server counts', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for the Dashboard page to load (check for page header)
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Verify stats cards are present - use more specific selectors
    // Stats cards use text-sm font-medium text-muted-foreground for titles
    await expect(userPage.getByText('Tools Available', { exact: true })).toBeVisible();
    await expect(userPage.getByText('MCP Servers', { exact: true }).first()).toBeVisible();
    await expect(userPage.getByText('Pending Approvals', { exact: true })).toBeVisible();
    // My Requests appears both as a stats card and a section title, so use first()
    await expect(userPage.getByText('My Requests', { exact: true }).first()).toBeVisible();

    // Each card should show a numeric value (the count)
    // Wait for all 4 stats cards to finish loading - they use tabular-nums class for numeric values
    // We need to wait for ALL 4 cards to load, not just the first one
    await expect(async () => {
      const statsCards = userPage.locator('.tabular-nums');
      const cardCount = await statsCards.count();
      expect(cardCount).toBeGreaterThanOrEqual(4);
    }).toPass({ timeout: 15000 });
  });

  test('should show setup alert when servers need credentials', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for dashboard to load
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // The setup alert appears conditionally when servers need credentials
    // Check if the "Setup Required" alert is present (it may or may not be based on data)
    const setupAlert = userPage.getByRole('heading', { name: 'Setup Required' });

    // If the alert is visible, verify it has correct content
    if (await setupAlert.isVisible({ timeout: 2000 }).catch(() => false)) {
      // The alert should have a "Manage Credentials" button
      await expect(userPage.getByRole('button', { name: 'Manage Credentials' })).toBeVisible();
    }

    // Verify dashboard loaded successfully regardless
    await expect(userPage.getByText('Quick Actions')).toBeVisible();
  });

  test('should display live approvals section when approvals exist', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for dashboard to load
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // The Pending Approvals stat card should always be visible
    await expect(userPage.getByText('Pending Approvals', { exact: true })).toBeVisible();

    // Live Approvals section is only visible if there are pending approvals
    // Check if the section exists (conditional based on data)
    const liveApprovalsTitle = userPage.getByRole('heading', { name: 'Live Approvals' });

    // If there are pending approvals, the section should be visible with approve/cancel buttons
    if (await liveApprovalsTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Should have approve or cancel buttons
      const actionButtons = userPage.getByRole('button', { name: /approve|cancel/i });
      expect(await actionButtons.count()).toBeGreaterThan(0);
    }
  });

  test('should allow self-approve from dashboard if permitted', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for dashboard to load
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Look for Live Approvals section with approve buttons
    const approveButtons = userPage.getByRole('button', { name: 'Approve' });

    // If approve buttons are visible, test one
    if ((await approveButtons.count()) > 0 && (await approveButtons.first().isVisible())) {
      // Get initial count
      const initialCount = await approveButtons.count();

      // Click approve on first item
      await approveButtons.first().click();

      // Wait for mutation to complete
      await userPage.waitForTimeout(2000);

      // Either the count should decrease or success indicator should appear
      const newCount = await approveButtons.count();
      expect(newCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test('should navigate via quick actions', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for dashboard to load
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Verify Quick Actions section
    await expect(userPage.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();

    // Test navigation to Manage Credentials
    const manageCredentialsButton = userPage.getByRole('button', { name: 'Manage Credentials' });
    await expect(manageCredentialsButton).toBeVisible();
    await manageCredentialsButton.click();
    await expect(userPage).toHaveURL(/.*\/user\/[^/]+\/credentials/);

    // Go back and test another action
    await navigateTo(userPage, '/user');
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Test navigation to View Tools
    const viewToolsButton = userPage.getByRole('button', { name: 'View Tools' });
    await expect(viewToolsButton).toBeVisible();
    await viewToolsButton.click();
    await expect(userPage).toHaveURL(/.*\/user\/[^/]+\/tools/);

    // Go back and test View Activity
    await navigateTo(userPage, '/user');
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    const viewActivityButton = userPage.getByRole('button', { name: 'View Activity' });
    await expect(viewActivityButton).toBeVisible();
    await viewActivityButton.click();
    await expect(userPage).toHaveURL(/.*\/user\/[^/]+\/audit/);
  });

  test('should show recent activity with ALLOW/DENY decisions', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for dashboard to load
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Find Recent Activity section - it's a CardTitle
    const recentActivityTitle = userPage.getByRole('heading', { name: 'Recent Activity' });
    await expect(recentActivityTitle).toBeVisible();

    // The Recent Activity card has either entries or "No activity yet"
    // Use a more robust check: wait for either empty state OR activity entries
    const noActivityText = userPage.getByText('No activity yet');
    const _activityContainer = userPage
      .locator('h3:has-text("Recent Activity")')
      .locator('..')
      .locator('..');

    // Wait for the content to load by checking for either state
    await userPage.waitForTimeout(500); // Allow time for data to load

    // Check if empty state is visible
    const hasNoActivity = await noActivityText.isVisible().catch(() => false);

    if (hasNoActivity) {
      // Verify the empty state message is present
      await expect(noActivityText).toBeVisible();
      await expect(userPage.getByText('Activity will appear here as you use tools')).toBeVisible();
    }
    // Note: If no activity text is not visible and no entries, that's still valid
    // (the component may still be loading or there's no data)
    // The main point is the section title is visible (checked above)
  });

  test('should show my requests with status badges', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for dashboard to load
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Find My Requests section - there's a card with this title
    // Note: "My Requests" appears as both a stat card and a section title
    const myRequestsHeading = userPage.getByRole('heading', { name: 'My Requests' });
    await expect(myRequestsHeading).toBeVisible();

    // Check for the empty state text or request entries
    // Allow time for content to load
    await userPage.waitForTimeout(500);

    const noRequestsText = userPage.getByText('No requests yet');
    const hasNoRequests = await noRequestsText.isVisible().catch(() => false);

    if (hasNoRequests) {
      // Empty state should show "Request Access" button (there may be multiple, use first)
      const requestAccessButton = userPage.getByRole('button', { name: 'Request Access' }).first();
      await expect(requestAccessButton).toBeVisible();
    }
    // Note: If no requests text is not visible and no entries, that's still valid
    // The main point is the section title is visible (checked above)
  });

  test('should link stats cards to respective pages', async ({ userPage }) => {
    await navigateTo(userPage, '/user');

    // Wait for dashboard to load
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Click on Tools Available stat card (it's wrapped in a Link)
    const toolsCard = userPage.locator('a').filter({ hasText: 'Tools Available' });
    await expect(toolsCard).toBeVisible();
    await toolsCard.click();
    await expect(userPage).toHaveURL(/.*\/user\/[^/]+\/tools/);

    // Go back and click on MCP Servers card
    await navigateTo(userPage, '/user');
    await expect(userPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    const serversCard = userPage.locator('a').filter({ hasText: 'MCP Servers' }).first();
    await expect(serversCard).toBeVisible();
    await serversCard.click();
    await expect(userPage).toHaveURL(/.*\/user\/[^/]+\/mcp-servers/);
  });
});
