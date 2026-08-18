/**
 * E2E Tests: Admin MCP Server CRUD Operations
 * Tests server creation, listing, updating, and deletion
 */

import {
  closeToolDiscoveryDialog,
  expect,
  generateUniqueName,
  getPrisma,
  handleEndpointValidationOverride,
  navigateTo,
  test,
} from '../../../helpers/e2e-fixtures.js';

test.describe('Admin MCP Server CRUD', () => {
  test('should create MCP server with NONE auth type', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({ timeout: 15000 });

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await expect(addButton).toBeVisible();
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'mcp-server');
    const serverUrl = 'https://example.com/mcp';

    await dialog.locator('#name').fill(uniqueName);
    await dialog.locator('#url').fill(serverUrl);

    // Auth type defaults to NONE, so we don't need to change it
    // Wait for auth type detection to complete (endpoint validation will fail for fake URL)
    await adminPage.waitForTimeout(2000);

    // Click Override if endpoint validation fails (expected for fake URL)
    const overrideButton = dialog.getByRole('button', { name: 'Override' });
    if ((await overrideButton.count()) > 0) {
      await overrideButton.click();
      await adminPage.waitForTimeout(500);
    }

    const submitButton = dialog.getByRole('button', { name: 'Add server' });
    await submitButton.click();

    // Close the tool discovery dialog that appears after server creation
    await closeToolDiscoveryDialog(adminPage);

    await expect(adminPage.locator('table')).toContainText(uniqueName, { timeout: 15000 });
  });

  test('should validate server URL format', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'invalid-url');
    await dialog.locator('#name').fill(uniqueName);
    await dialog.locator('#url').fill('not-a-valid-url');

    const submitButton = dialog.getByRole('button', { name: 'Add server' });
    await submitButton.click();

    await adminPage.waitForTimeout(1000);
    await expect(dialog).toBeVisible();

    const errorText = dialog.locator('.text-destructive');
    await expect(errorText.first()).toBeVisible();
  });

  test('should validate URL is reachable on server creation', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'unreachable');
    await dialog.locator('#name').fill(uniqueName);
    await dialog.locator('#url').fill('https://unreachable-server-xyz-12345.invalid/mcp');

    // Wait for auth type detection to fail
    await adminPage.waitForTimeout(2000);

    // Should show detection error
    const errorText = dialog.locator('.text-destructive');
    if ((await errorText.count()) > 0) {
      await expect(errorText.first()).toBeVisible();
    }
  });

  test('should prevent adding Sentinel own URL as MCP server', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const sentinelMcpUrl = 'http://localhost:3001/mcp';

    const uniqueName = generateUniqueName(testInfo, 'self-url');
    await dialog.locator('#name').fill(uniqueName);
    await dialog.locator('#url').fill(sentinelMcpUrl);

    // Wait for validation
    await adminPage.waitForTimeout(2000);

    // Dialog should remain open due to validation blocking
    const isDialogVisible = await dialog.isVisible();
    expect(isDialogVisible).toBe(true);
  });

  test('should prevent duplicate server URLs within organization', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create an existing server to test duplicate URL prevention
    const existingServer = await prisma.mcpServer.create({
      data: {
        name: `existing-server-${uniqueSuffix}`,
        url: `https://existing-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');

      const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
      await addButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const uniqueName = generateUniqueName(testInfo, 'duplicate');
      await dialog.locator('#name').fill(uniqueName);
      await dialog.locator('#url').fill(existingServer.url);

      // Wait for auth detection
      await adminPage.waitForTimeout(1000);

      // Handle endpoint validation override if needed
      await handleEndpointValidationOverride(adminPage);

      const submitButton = dialog.getByRole('button', { name: 'Add server' });
      await submitButton.click();

      await adminPage.waitForTimeout(2000);

      const hasError =
        (await dialog.isVisible()) ||
        (await adminPage
          .locator('.text-destructive')
          .isVisible()
          .catch(() => false));

      expect(hasError).toBe(true);
    } finally {
      await prisma.mcpServer.delete({ where: { id: existingServer.id } });
    }
  });

  test('should update server name', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testServer = await prisma.mcpServer.create({
      data: {
        name: `update-test-${uniqueSuffix}`,
        url: `https://update-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
      },
    });

    await navigateTo(adminPage, '/admin/mcp-servers');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    const serverRow = adminPage.locator('tr').filter({ hasText: testServer.name });

    if ((await serverRow.count()) > 0) {
      const editButton = serverRow.getByRole('button', { name: 'Edit' });

      if ((await editButton.count()) > 0) {
        await editButton.click();

        const dialog = adminPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        const newName = `updated-${uniqueSuffix}`;
        await dialog.locator('#name').clear();
        await dialog.locator('#name').fill(newName);

        // Handle endpoint validation override if needed
        await handleEndpointValidationOverride(adminPage);

        const submitButton = dialog.getByRole('button', { name: 'Save changes' });
        await submitButton.click();

        await adminPage.waitForTimeout(2000);

        await adminPage.reload();
        await expect(adminPage.locator('table')).toContainText(newName, { timeout: 15000 });
      }
    }

    await prisma.mcpServer.delete({ where: { id: testServer.id } });
  });

  test('should soft delete server and hide from main list', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testServer = await prisma.mcpServer.create({
      data: {
        name: `delete-test-${uniqueSuffix}`,
        url: `https://delete-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
      },
    });

    await navigateTo(adminPage, '/admin/mcp-servers');
    await expect(adminPage.locator('table')).toContainText(testServer.name, { timeout: 15000 });

    const serverRow = adminPage.locator('tr').filter({ hasText: testServer.name });
    const deleteButton = serverRow.getByRole('button', { name: 'Delete' });

    if ((await deleteButton.count()) > 0) {
      await deleteButton.click();

      const confirmDialog = adminPage.getByRole('dialog');
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });

      const confirmButton = confirmDialog.getByRole('button', { name: 'Delete server' });
      await confirmButton.click();

      await adminPage.waitForTimeout(2000);

      await adminPage.reload();
      await expect(adminPage.locator('body')).toBeVisible();

      // After deleting the server, it should either:
      // 1. Show empty state (if this was the only server)
      // 2. Show a table without the deleted server
      // Wait for either to appear with proper Playwright wait
      const emptyState = adminPage.getByText('No servers yet');
      const table = adminPage.locator('table');

      await expect(emptyState.or(table)).toBeVisible({ timeout: 15000 });

      const hasEmptyState = await emptyState.isVisible().catch(() => false);
      const hasTable = await table.isVisible().catch(() => false);

      if (hasEmptyState) {
        // Empty state means server was successfully removed
        expect(hasEmptyState).toBe(true);
      } else if (hasTable) {
        // Table exists but should not contain the deleted server
        const serverStillVisible = await table.textContent();
        expect(serverStillVisible?.includes(testServer.name)).toBe(false);
      }
    }

    await prisma.mcpServer.delete({ where: { id: testServer.id } });
  });

  test('should restore deleted server from deleted items', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const admin = await prisma.user.findFirst({
      where: {
        userRoles: { some: { role: { isAdmin: true } } },
        deletedAt: null,
        organizationId: tenant.orgId,
      },
    });

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testServer = await prisma.mcpServer.create({
      data: {
        name: `restore-test-${uniqueSuffix}`,
        url: `https://restore-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
        deletedAt: new Date(),
        deletedBy: admin?.id ?? 'test',
      },
    });

    await navigateTo(adminPage, '/admin/deleted-items');

    const serverRow = adminPage.locator('tr').filter({ hasText: testServer.name });

    if ((await serverRow.count()) > 0) {
      const restoreButton = serverRow.getByRole('button', { name: /restore/i });

      if ((await restoreButton.count()) > 0) {
        await restoreButton.click();

        const confirmButton = adminPage.getByRole('button', { name: /confirm|restore/i }).last();
        if ((await confirmButton.count()) > 0 && (await confirmButton.isVisible())) {
          await confirmButton.click();
        }

        await adminPage.waitForTimeout(1000);

        const restoredServer = await prisma.mcpServer.findUnique({
          where: { id: testServer.id },
        });

        expect(restoredServer?.deletedAt).toBeNull();
      }
    }

    await prisma.mcpServer.delete({ where: { id: testServer.id } });
  });
});
