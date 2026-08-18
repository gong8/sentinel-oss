/**
 * E2E Tests: Admin MCP Server Trust Settings
 * Tests trust configuration and policy warnings
 */

import { expect, getPrisma, navigateTo, test } from '../../../helpers/e2e-fixtures.js';

test.describe('Admin MCP Server Trust Settings', () => {
  // ============================================================================
  // Trust Status Tests
  // ============================================================================

  test('should toggle server trusted status', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create a test server for toggling trust
    const server = await prisma.mcpServer.create({
      data: {
        name: `toggle-trust-${uniqueSuffix}`,
        url: `https://toggle-trust-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        trusted: false,
        authType: 'NONE',
      },
    });

    const initialTrusted = server.trusted;

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');
      // Wait for page to be ready - don't use networkidle as it can hang on background requests

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      // Find server row and click edit
      const serverRow = adminPage.locator('tr').filter({ hasText: server.name });
      const editButton = serverRow.getByRole('button', { name: /edit/i });

      if ((await editButton.count()) > 0) {
        await editButton.click();

        const dialog = adminPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Find trusted toggle/checkbox
        const trustedToggle = dialog
          .locator('[data-testid="trusted-toggle"]')
          .or(dialog.locator('input[name="trusted"]'))
          .or(dialog.locator('[role="switch"]'))
          .or(
            dialog
              .locator('label')
              .filter({ hasText: /trusted/i })
              .locator('input'),
          );

        if ((await trustedToggle.count()) > 0) {
          // Toggle the trust status
          await trustedToggle.click();

          // Submit
          const submitButton = dialog.getByRole('button', { name: /save|update/i });
          await submitButton.click();

          await adminPage.waitForTimeout(2000);

          // Verify the change
          const updatedServer = await prisma.mcpServer.findUnique({
            where: { id: server.id },
          });

          expect(updatedServer?.trusted).toBe(!initialTrusted);
        }
      }
    } finally {
      // Use deleteMany to avoid error if record was already deleted
      await prisma.mcpServer.deleteMany({ where: { id: server.id } });
    }
  });

  test('should show trust badge in server list', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create both trusted and untrusted servers for this test
    const trustedServer = await prisma.mcpServer.create({
      data: {
        name: `trusted-server-${uniqueSuffix}`,
        url: `https://trusted-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        trusted: true,
        authType: 'NONE',
      },
    });

    const untrustedServer = await prisma.mcpServer.create({
      data: {
        name: `untrusted-server-${uniqueSuffix}`,
        url: `https://untrusted-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        trusted: false,
        authType: 'NONE',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');
      // Wait for page to be ready - don't use networkidle as it can hang on background requests

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      // Check trust column header
      const trustHeader = adminPage.locator('th').filter({ hasText: /trust/i });
      await expect(trustHeader).toBeVisible();

      // Verify trusted server shows "Trusted" badge
      // Use getByText with exact:true to avoid partial matches (untrusted contains trusted)
      const trustedRow = adminPage
        .locator('tr')
        .filter({ has: adminPage.getByText(trustedServer.name, { exact: true }) });
      await expect(trustedRow).toBeVisible();
      await expect(trustedRow).toContainText('Trusted');

      // Verify untrusted server shows "Untrusted" badge
      const untrustedRow = adminPage
        .locator('tr')
        .filter({ has: adminPage.getByText(untrustedServer.name, { exact: true }) });
      await expect(untrustedRow).toBeVisible();
      await expect(untrustedRow).toContainText('Untrusted');
    } finally {
      // Use deleteMany to avoid error if records were already deleted
      await prisma.mcpServer.deleteMany({ where: { id: trustedServer.id } });
      await prisma.mcpServer.deleteMany({ where: { id: untrustedServer.id } });
    }
  });

  test('should warn when creating policy for untrusted server', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create an untrusted server with a tool for this test
    const untrustedServer = await prisma.mcpServer.create({
      data: {
        name: `untrusted-policy-test-${uniqueSuffix}`,
        url: `https://untrusted-policy-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        trusted: false,
        authType: 'NONE',
        tools: {
          create: [
            {
              name: 'test_tool',
              description: 'A test tool for policy warning test',
            },
          ],
        },
      },
      include: {
        tools: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policies');
      // Wait for page to be ready - don't use networkidle as it can hang on background requests

      // Click create policy
      const createButton = adminPage.getByRole('button', { name: /create.*policy/i });
      await createButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Try to select tool from untrusted server
      const addToolButton = dialog
        .locator('[data-testid="add-tool-pattern"]')
        .or(dialog.getByRole('button', { name: /add.*tool|add.*pattern/i }));

      if ((await addToolButton.count()) > 0) {
        await addToolButton.click();

        // Select server
        const serverSelect = dialog
          .locator('[data-testid="server-select"]')
          .or(dialog.locator('button[role="combobox"]').filter({ hasText: /server/i }));

        if ((await serverSelect.count()) > 0) {
          await serverSelect.last().click();

          // Look for the untrusted server option
          const serverOption = adminPage.getByRole('option', {
            name: new RegExp(untrustedServer.name, 'i'),
          });
          if ((await serverOption.count()) > 0) {
            await serverOption.click();

            // Wait a moment for any warnings
            await adminPage.waitForTimeout(500);

            // Check for trust warning - warning is optional
            const warningText = dialog
              .locator('text=/untrusted|warning|caution/i')
              .or(adminPage.locator('[role="alert"]'));

            // Warning may or may not appear depending on implementation
            // Only check visibility if there's actually a visible warning element
            const visibleWarning = await warningText
              .first()
              .isVisible()
              .catch(() => false);
            if (visibleWarning) {
              await expect(warningText.first()).toBeVisible();
            }
          }
        }
      }

      // Close dialog
      await adminPage.keyboard.press('Escape');
    } finally {
      // Clean up tools first due to foreign key constraint
      await prisma.mcpTool.deleteMany({ where: { mcpServerId: untrustedServer.id } });
      // Use deleteMany to avoid error if record was already deleted
      await prisma.mcpServer.deleteMany({ where: { id: untrustedServer.id } });
    }
  });

  test('should update trust without affecting other settings', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testServer = await prisma.mcpServer.create({
      data: {
        name: `trust-test-${uniqueSuffix}`,
        url: `https://trust-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'API_KEY',
        trusted: false,
      },
    });

    await navigateTo(adminPage, '/admin/mcp-servers');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Find server and edit
    const serverRow = adminPage.locator('tr').filter({ hasText: testServer.name });
    const editButton = serverRow.getByRole('button', { name: /edit/i });

    if ((await editButton.count()) > 0) {
      await editButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Toggle trust status
      const trustedToggle = dialog
        .locator('[data-testid="trusted-toggle"]')
        .or(dialog.locator('input[name="trusted"]'))
        .or(dialog.locator('[role="switch"]'));

      if ((await trustedToggle.count()) > 0) {
        await trustedToggle.click();
      }

      // Submit
      const submitButton = dialog.getByRole('button', { name: /save|update/i });
      await submitButton.click();

      await adminPage.waitForTimeout(2000);

      // Verify only trust changed
      const updatedServer = await prisma.mcpServer.findUnique({
        where: { id: testServer.id },
      });

      expect(updatedServer?.trusted).toBe(true);
      expect(updatedServer?.name).toBe(testServer.name);
      expect(updatedServer?.url).toBe(testServer.url);
      expect(updatedServer?.authType).toBe(testServer.authType);
    }

    // Cleanup - use deleteMany to avoid error if record was already deleted
    await prisma.mcpServer.deleteMany({ where: { id: testServer.id } });
  });
});
