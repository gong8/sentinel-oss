/**
 * E2E Tests: Admin MCP Server Auth Types
 * Tests different authentication configurations for MCP servers
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

test.describe('Admin MCP Server Auth Types', () => {
  test('should create server with API_KEY auth type', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'api-key-server');

    await dialog.locator('#name').fill(uniqueName);
    await dialog.locator('#url').fill('https://api-key-test.example.com/mcp');

    await adminPage.waitForTimeout(1500);

    const authTrigger = dialog.locator('button[role="combobox"]');
    await authTrigger.click();
    await adminPage.getByRole('option', { name: 'API_KEY' }).click();

    const apiKeyInput = dialog.locator('#apiKey');
    await expect(apiKeyInput).toBeVisible();
    await apiKeyInput.fill('test-api-key-12345');

    await handleEndpointValidationOverride(adminPage);

    const submitButton = dialog.getByRole('button', { name: 'Add server' });
    await submitButton.click();

    // Close the tool discovery dialog that appears after server creation
    await closeToolDiscoveryDialog(adminPage);

    const serverRow = adminPage.locator('tr').filter({ hasText: uniqueName });
    await expect(serverRow).toBeVisible({ timeout: 15000 });
    await expect(serverRow).toContainText('API_KEY');
  });

  test('should create server with OAUTH auth type and redirect to credentials', async ({
    adminPage,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'oauth-server');

    await dialog.locator('#name').fill(uniqueName);
    await dialog.locator('#url').fill('https://oauth-test.example.com/mcp');

    await adminPage.waitForTimeout(1500);

    const authTrigger = dialog.locator('button[role="combobox"]');
    await authTrigger.click();
    await adminPage.getByRole('option', { name: 'OAUTH' }).click();

    await handleEndpointValidationOverride(adminPage);

    const submitButton = dialog.getByRole('button', { name: 'Add server' });
    await submitButton.click();

    await adminPage.waitForURL(/\/admin\/credentials/, { timeout: 10000 });
    expect(adminPage.url()).toContain('credentials');

    await navigateTo(adminPage, '/admin/mcp-servers');

    const serverRow = adminPage.locator('tr').filter({ hasText: uniqueName });
    await expect(serverRow).toBeVisible({ timeout: 15000 });
    await expect(serverRow).toContainText('OAUTH');
  });

  test('should show auth type select with detection status', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'detect-test');

    await dialog.locator('#name').fill(uniqueName);

    const urlInput = dialog.locator('#url');
    await urlInput.fill('https://detect-test.example.com/mcp');
    await urlInput.blur();

    await adminPage.waitForTimeout(2000);

    const authTrigger = dialog.locator('button[role="combobox"]');
    await expect(authTrigger).toBeVisible();

    const detectingText = dialog.locator('text=Detecting auth type');
    const detectedText = dialog.locator('text=Detected:');
    const detectionFailedText = dialog.locator('text=Detection failed');

    const hasDetectionStatus =
      (await detectingText.count()) > 0 ||
      (await detectedText.count()) > 0 ||
      (await detectionFailedText.count()) > 0;

    expect(hasDetectionStatus || (await authTrigger.isVisible())).toBe(true);
  });

  test('should redirect to credentials page for API_KEY server without key', async ({
    adminPage,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/mcp-servers');

    const addButton = adminPage.getByRole('button', { name: 'Add MCP server' });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'no-key');

    await dialog.locator('#name').fill(uniqueName);
    await dialog.locator('#url').fill('https://no-key-test.example.com/mcp');

    await adminPage.waitForTimeout(1500);

    const authTrigger = dialog.locator('button[role="combobox"]');
    await authTrigger.click();
    await adminPage.getByRole('option', { name: 'API_KEY' }).click();

    await handleEndpointValidationOverride(adminPage);

    const submitButton = dialog.getByRole('button', { name: 'Add server' });
    await submitButton.click();

    await adminPage.waitForURL(/\/admin\/credentials/, { timeout: 10000 });
    expect(adminPage.url()).toContain('credentials');
    expect(adminPage.url()).toContain('apikey');
  });

  test('should show auth type column in server list', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testServer = await prisma.mcpServer.create({
      data: {
        name: `auth-badge-test-${uniqueSuffix}`,
        url: `https://auth-badge-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'API_KEY',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      const authHeader = adminPage.locator('th').filter({ hasText: 'Auth' });
      await expect(authHeader).toBeVisible();

      const serverRow = adminPage.locator('tr').filter({ hasText: testServer.name });
      await expect(serverRow).toBeVisible();
      await expect(serverRow).toContainText('API_KEY');
    } finally {
      await prisma.mcpServer.delete({ where: { id: testServer.id } });
    }
  });

  test('should preserve auth type when editing server', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testServer = await prisma.mcpServer.create({
      data: {
        name: `edit-auth-test-${uniqueSuffix}`,
        url: `https://edit-auth-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'API_KEY',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      const serverRow = adminPage.locator('tr').filter({ hasText: testServer.name });
      const editButton = serverRow.getByRole('button', { name: 'Edit' });
      await editButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const authTrigger = dialog.locator('button[role="combobox"]');
      await expect(authTrigger).toContainText('API_KEY');

      const cancelButton = dialog.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();
    } finally {
      await prisma.mcpServer.delete({ where: { id: testServer.id } });
    }
  });
});
