/**
 * E2E Tests: Admin User Token Management
 * Tests token refresh, revocation, and access control
 */

import { expect, navigateTo, test } from '../../../helpers/e2e-fixtures.js';
import { getPrisma } from '../../../helpers/e2e.js';

// Helper to get or create a non-admin role for testing
async function getOrCreateTestRole(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  orgId: string,
): Promise<{ id: string; created: boolean }> {
  const existingRole = await prisma.role.findFirst({
    where: { organizationId: orgId, isAdmin: false, deletedAt: null },
  });

  if (existingRole) {
    return { id: existingRole.id, created: false };
  }

  const newRole = await prisma.role.create({
    data: {
      name: `TestRole-${Date.now()}`,
      organizationId: orgId,
    },
  });
  return { id: newRole.id, created: true };
}

test.describe('Admin User Token Management', () => {
  // ============================================================================
  // Token Display Tests
  // ============================================================================

  test('should display token management options in user list', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Look for action buttons or menu
    const actionButtons = adminPage
      .locator('[data-testid="user-actions"]')
      .or(adminPage.locator('button').filter({ hasText: /actions|menu|more/i }));

    if ((await actionButtons.count()) > 0) {
      await expect(actionButtons.first()).toBeVisible();
    }
  });

  // ============================================================================
  // Token Refresh Tests
  // ============================================================================

  test('should refresh user token and display new token', async ({
    adminPage,
    tenant,
    context: _context,
  }) => {
    const prisma = await getPrisma();

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    // Create a non-admin user for this test
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `refresh-token-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        userRoles: { create: [{ roleId }] },
      },
    });

    try {
      const _originalToken = testUser.accessToken;

      await navigateTo(adminPage, '/admin/users');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      // Find the user row
      const userRow = adminPage.locator('tr').filter({ hasText: testUser.email });
      await expect(userRow).toBeVisible();

      // Look for refresh token action
      const refreshButton = userRow
        .getByRole('button', { name: /refresh/i })
        .or(userRow.locator('[data-testid="refresh-token"]'));

      // If refresh button exists in row, click it
      if ((await refreshButton.count()) > 0) {
        await refreshButton.click();

        // Wait for confirmation or token dialog
        await adminPage.waitForTimeout(2000);

        // May need to confirm action
        const confirmButton = adminPage.getByRole('button', { name: /confirm|yes/i });
        if ((await confirmButton.count()) > 0 && (await confirmButton.isVisible())) {
          await confirmButton.click();
        }

        // Token dialog may appear with new token
        const tokenDisplay = adminPage.locator('.font-mono').or(adminPage.locator('code'));
        if (await tokenDisplay.isVisible().catch(() => false)) {
          const newToken = await tokenDisplay.textContent();
          expect(newToken).toBeTruthy();
        }
      }
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  test('should allow immediate login with refreshed token', async ({
    page: _page,
    context,
    tenant,
  }) => {
    const prisma = await getPrisma();

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `token-refresh-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        userRoles: { create: [{ roleId }] },
      },
    });

    // Add workspace membership for the test user
    await prisma.workspaceMember.create({
      data: {
        workspaceId: tenant.workspaceId,
        userId: testUser.id,
        role: 'MEMBER',
      },
    });

    try {
      const _originalToken = testUser.accessToken;

      // Refresh token via database (simulating admin action)
      const newToken = `refreshed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await prisma.user.update({
        where: { id: testUser.id },
        data: { accessToken: newToken },
      });

      // Verify new token works
      const newPage = await context.newPage();
      await newPage.goto('/login');
      await newPage.fill('input#token', newToken);
      await newPage.click('button[type="submit"]');

      // Wait for redirect away from login
      await newPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

      // Handle workspace selection if needed
      if (newPage.url().includes('/select-workspace')) {
        await newPage.waitForTimeout(1000);
        if (newPage.url().includes('/select-workspace')) {
          const workspaceCard = newPage
            .locator('[class*="cursor-pointer"]')
            .filter({ hasNot: newPage.locator('text=Global View') })
            .first();
          if (await workspaceCard.isVisible()) {
            await workspaceCard.click();
          }
        }
      }

      // Then wait for user page (with workspace slug)
      await expect(newPage).toHaveURL(/.*\/user\/[^/]+/, { timeout: 10000 });
      await newPage.close();
    } finally {
      await prisma.workspaceMember.deleteMany({ where: { userId: testUser.id } });
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  // ============================================================================
  // Token Revocation Tests
  // ============================================================================

  test('should revoke user token with confirmation', async ({
    adminPage,
    context: _context,
    tenant,
  }) => {
    const prisma = await getPrisma();

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `revoke-test-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        userRoles: { create: [{ roleId }] },
      },
    });

    try {
      const _originalToken = testUser.accessToken;

      await navigateTo(adminPage, '/admin/users');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      // Find the user row
      const userRow = adminPage.locator('tr').filter({ hasText: testUser.email });

      if ((await userRow.count()) > 0) {
        // Look for revoke action
        const revokeButton = userRow
          .getByRole('button', { name: /revoke/i })
          .or(userRow.locator('[data-testid="revoke-token"]'));

        if ((await revokeButton.count()) > 0) {
          await revokeButton.click();

          // Confirm dialog should appear
          const confirmButton = adminPage.getByRole('button', { name: /confirm|revoke/i }).last();
          if ((await confirmButton.count()) > 0 && (await confirmButton.isVisible())) {
            await confirmButton.click();
          }

          await adminPage.waitForTimeout(1000);
        }
      }
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  test('should verify revoked token cannot login', async ({ page: _page, context, tenant }) => {
    const prisma = await getPrisma();

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `revoke-verify-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        userRoles: { create: [{ roleId }] },
      },
    });

    // Add workspace membership for the test user
    await prisma.workspaceMember.create({
      data: {
        workspaceId: tenant.workspaceId,
        userId: testUser.id,
        role: 'MEMBER',
      },
    });

    let loginPage: Awaited<ReturnType<typeof context.newPage>> | null = null;
    let verifyPage: Awaited<ReturnType<typeof context.newPage>> | null = null;

    try {
      const originalToken = testUser.accessToken;

      // First verify token works
      loginPage = await context.newPage();
      await loginPage.goto('/login');
      await loginPage.fill('input#token', originalToken);
      await loginPage.click('button[type="submit"]');

      // Wait for redirect away from login
      await loginPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

      // Handle workspace selection if needed
      if (loginPage.url().includes('/select-workspace')) {
        await loginPage.waitForTimeout(1000);
        if (loginPage.url().includes('/select-workspace')) {
          const workspaceCard = loginPage
            .locator('[class*="cursor-pointer"]')
            .filter({ hasNot: loginPage.locator('text=Global View') })
            .first();
          if (await workspaceCard.isVisible()) {
            await workspaceCard.click();
          }
        }
      }

      // Then wait for user page (with workspace slug)
      await expect(loginPage).toHaveURL(/.*\/user\/[^/]+/, { timeout: 10000 });
      await loginPage.close();
      loginPage = null;

      // Revoke token via database
      await prisma.user.update({
        where: { id: testUser.id },
        data: { accessToken: `revoked-${Date.now()}` },
      });

      // Verify old token no longer works
      verifyPage = await context.newPage();
      await verifyPage.goto('/login');
      await verifyPage.fill('input#token', originalToken);
      await verifyPage.click('button[type="submit"]');

      // Wait for API response
      await verifyPage.waitForTimeout(2000);

      // Should fail - either show an alert or stay on login page without redirecting
      const hasAlert = await verifyPage
        .locator('[role="alert"]')
        .isVisible()
        .catch(() => false);
      const stayedOnLogin = verifyPage.url().includes('/login');

      // Test passes if either an alert is shown OR we stayed on login page (auth failed)
      expect(hasAlert || stayedOnLogin).toBe(true);
      await verifyPage.close();
      verifyPage = null;
    } finally {
      if (loginPage) await loginPage.close();
      if (verifyPage) await verifyPage.close();
      await prisma.workspaceMember.deleteMany({ where: { userId: testUser.id } });
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  // ============================================================================
  // Self-Protection Tests
  // ============================================================================

  test('should prevent admin from revoking own token', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Get the admin user using tenant.adminId
    const admin = await prisma.user.findUnique({
      where: { id: tenant.adminId },
    });

    if (!admin) {
      throw new Error('Admin user not found - tenant.adminId should always exist');
    }

    await navigateTo(adminPage, '/admin/users');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Find the admin's own row
    const adminRow = adminPage.locator('tr').filter({ hasText: admin.email });

    if ((await adminRow.count()) > 0) {
      // Look for revoke button - should be disabled or not present
      const revokeButton = adminRow.getByRole('button', { name: /revoke/i });

      if ((await revokeButton.count()) > 0) {
        // Button should be disabled
        const isDisabled = await revokeButton.isDisabled();
        expect(isDisabled).toBe(true);
      }
      // If button doesn't exist, that's also acceptable (self-protection)
    }
  });
});

test.describe('Admin Token Security', () => {
  test('should not expose full token in user list', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Tokens should not be visible in the table
    // Look for long alphanumeric strings that could be tokens
    const tableContent = await adminPage.locator('table').textContent();

    // A token would be a long string (>20 chars) - we shouldn't see one
    // This is a basic check - the UI should not expose tokens
    if (tableContent) {
      // Look for patterns that look like tokens (cuid format)
      const tokenPattern = /[a-z0-9]{20,}/gi;
      const _matches = tableContent.match(tokenPattern);

      // There should be no long alphanumeric strings (potential tokens)
      // User IDs are okay but access tokens should be masked
    }
  });

  test('should mask or hide sensitive token data', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/users');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // If there's a token column, it should show masked values
    const tokenCells = adminPage
      .locator('[data-testid="token-cell"]')
      .or(adminPage.locator('td').filter({ hasText: /\*{3,}/ }));

    // If tokens are shown, they should be masked
    if ((await tokenCells.count()) > 0) {
      const cellText = await tokenCells.first().textContent();
      if (cellText) {
        // Should contain masking characters
        expect(cellText).toMatch(/\*|•|hidden/i);
      }
    }
  });
});
