/**
 * E2E Tests: Authentication Flow
 * Tests complete user authentication workflow using tenant isolation
 */

import { expect, test } from '../helpers/e2e-fixtures.js';

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Secure MCP Gateway');
    await expect(page.locator('input#token')).toBeVisible();
    await context.close();
  });

  test('should show error for invalid credentials', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.fill('input#token', 'invalid-token-123456');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('[role="alert"]')).toContainText('Invalid access token');
    await context.close();
  });

  test('should redirect to admin dashboard after successful admin login', async ({
    browser,
    tenant,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');

    // Use tenant's admin token
    await page.fill('input#token', tenant.adminToken);
    await page.click('button[type="submit"]');

    // Wait for redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Handle workspace selection if needed (admin is org owner, clicks Global View)
    if (page.url().includes('/select-workspace')) {
      const globalViewCard = page.locator('text=Global View').first();
      await globalViewCard.waitFor({ state: 'visible', timeout: 5000 });
      await globalViewCard.click();
    }

    // Should redirect to admin dashboard (may include workspace slug or be global admin)
    await expect(page).toHaveURL(/.*\/(admin|global\/admin)/);
    await context.close();
  });

  test('should redirect to user dashboard after successful user login', async ({
    browser,
    tenant,
  }) => {
    // Skip if no user token is available (conditional skip with reason)
    test.skip(!tenant.userToken, 'No user token available for tenant');

    // TypeScript still needs the guard for narrowing
    if (!tenant.userToken) {
      return;
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');

    // Use tenant's user token
    await page.fill('input#token', tenant.userToken);
    await page.click('button[type="submit"]');

    // Wait for redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Handle workspace selection if needed (regular user may need to select workspace)
    if (page.url().includes('/select-workspace')) {
      await page.waitForTimeout(1000); // Wait for potential auto-redirect
      if (page.url().includes('/select-workspace')) {
        // Click first workspace card (not Global View)
        const workspaceCard = page
          .locator('[class*="cursor-pointer"]')
          .filter({
            hasNot: page.locator('text=Global View'),
          })
          .first();
        if (await workspaceCard.isVisible()) {
          await workspaceCard.click();
        }
      }
    }

    // Should redirect to user dashboard (with workspace slug)
    await expect(page).toHaveURL(/.*\/user\/[^/]+$/);
    await context.close();
  });
});
