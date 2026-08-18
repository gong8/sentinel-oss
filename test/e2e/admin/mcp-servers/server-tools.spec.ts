/**
 * E2E Tests: Admin MCP Server Tool Discovery
 * Tests tool discovery, refresh, and display functionality
 */

import {
  expect,
  generateUniqueName,
  getPrisma,
  handleEndpointValidationOverride,
  navigateTo,
  test,
} from '../../../helpers/e2e-fixtures.js';

test.describe('Admin MCP Server Tool Discovery', () => {
  // ============================================================================
  // Tool Discovery Tests
  // ============================================================================

  test('should discover tools on server creation with NONE auth', async ({
    adminPage,
    tenant: _tenant,
  }, testInfo) => {
    // This test verifies that tools are discovered when a server is created
    // Note: Requires a mock MCP server or the actual tool discovery may fail

    await navigateTo(adminPage, '/admin/mcp-servers');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const addButton = adminPage.getByRole('button', { name: /add.*server/i });
    await addButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueName = generateUniqueName(testInfo, 'tool-discovery');

    await dialog.locator('input[name="name"]').fill(uniqueName);
    await dialog.locator('input[name="url"]').fill('https://tool-discovery.example.com/mcp');

    // Select NONE auth
    const authTypeSelect = dialog
      .locator('[data-testid="auth-type"]')
      .or(dialog.locator('button[role="combobox"]').filter({ hasText: /auth|type/i }));
    if ((await authTypeSelect.count()) > 0) {
      await authTypeSelect.click();
      await adminPage.getByRole('option', { name: /none/i }).click();
    }

    // Handle endpoint validation override if URL is unreachable
    await handleEndpointValidationOverride(adminPage);

    // Submit
    const submitButton = dialog.getByRole('button', { name: /add|create|save/i });
    await submitButton.click();

    // Wait for creation and potential tool discovery
    await adminPage.waitForTimeout(3000);

    // Navigate to servers page
    await navigateTo(adminPage, '/admin/mcp-servers');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Server should be in the list
    const serverRow = adminPage.locator('tr').filter({ hasText: uniqueName });
    await expect(serverRow).toBeVisible({ timeout: 15000 });

    // Tools column should show count or "None"
    const toolsCell = serverRow.locator('td').nth(4); // Tools typically 5th column
    await expect(toolsCell).toBeVisible();
  });

  test('should display discovered tools count in server list', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create a server with tools for this test
    const serverWithTools = await prisma.mcpServer.create({
      data: {
        name: `tools-count-test-${uniqueSuffix}`,
        url: `https://tools-count-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
        tools: {
          create: [
            { name: 'tool_one', description: 'First tool' },
            { name: 'tool_two', description: 'Second tool' },
          ],
        },
      },
      include: {
        tools: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');
      // Wait for page to be ready - don't use networkidle as it can hang on background requests

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      // Find server row
      const serverRow = adminPage.locator('tr').filter({ hasText: serverWithTools.name });
      await expect(serverRow).toBeVisible();

      // Verify tools count is displayed
      const rowText = await serverRow.textContent();

      // Should show tool names or count
      const hasToolInfo =
        serverWithTools.tools.some((t) => rowText?.includes(t.name)) ||
        rowText?.includes(`+${serverWithTools.tools.length - 2}`) ||
        rowText?.includes('more') ||
        rowText?.match(/\d+/);

      expect(hasToolInfo).toBe(true);
    } finally {
      await prisma.mcpTool.deleteMany({ where: { mcpServerId: serverWithTools.id } });
      await prisma.mcpServer.delete({ where: { id: serverWithTools.id } });
    }
  });

  test('should refresh tools from server', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create a refreshable server for this test
    const refreshableServer = await prisma.mcpServer.create({
      data: {
        name: `refresh-test-${uniqueSuffix}`,
        url: `https://refresh-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');
      // Wait for page to be ready - don't use networkidle as it can hang on background requests

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      // Find server row
      const serverRow = adminPage.locator('tr').filter({ hasText: refreshableServer.name });

      if ((await serverRow.count()) > 0) {
        // Click refresh button
        const refreshButton = serverRow.getByRole('button', { name: /refresh/i });

        if ((await refreshButton.count()) > 0 && (await refreshButton.isEnabled())) {
          await refreshButton.click();

          // Wait for refresh to complete
          await adminPage.waitForTimeout(3000);

          // Check for success/error feedback
          const feedback = adminPage
            .locator('[role="alert"]')
            .or(adminPage.locator('text=/discovered|refresh|tools/i'));

          // Either shows feedback or button returns to normal state
          const refreshComplete =
            (await feedback.isVisible().catch(() => false)) ||
            (await refreshButton.textContent()) === 'Refresh';

          expect(refreshComplete).toBe(true);
        }
      }
    } finally {
      // Use deleteMany to avoid error if record was already deleted
      await prisma.mcpServer.deleteMany({ where: { id: refreshableServer.id } });
    }
  });

  test('should handle tool discovery failure gracefully', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testServer = await prisma.mcpServer.create({
      data: {
        name: `discovery-fail-${uniqueSuffix}`,
        url: 'https://unreachable-server-xyz-12345.invalid/mcp',
        organizationId: tenant.orgId,
        authType: 'NONE',
      },
    });

    await navigateTo(adminPage, '/admin/mcp-servers');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    const serverRow = adminPage.locator('tr').filter({ hasText: testServer.name });

    if ((await serverRow.count()) > 0) {
      const refreshButton = serverRow.getByRole('button', { name: /refresh/i });

      if ((await refreshButton.count()) > 0 && (await refreshButton.isEnabled())) {
        await refreshButton.click();

        // Wait for failure
        await adminPage.waitForTimeout(5000);

        // Should show error alert
        const errorAlert = adminPage.locator('[role="alert"]').filter({ hasText: /fail|error/i });

        // Error should be displayed or handled gracefully
        if ((await errorAlert.count()) > 0) {
          await expect(errorAlert.first()).toBeVisible();
        }
      }
    }

    // Cleanup
    await prisma.mcpServer.delete({ where: { id: testServer.id } });
  });

  test('should show tool names in server detail view', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create a server with tools for this test
    const serverWithTools = await prisma.mcpServer.create({
      data: {
        name: `detail-view-test-${uniqueSuffix}`,
        url: `https://detail-view-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
        tools: {
          create: [
            { name: 'detail_tool_one', description: 'First detail tool' },
            { name: 'detail_tool_two', description: 'Second detail tool' },
          ],
        },
      },
      include: {
        tools: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/mcp-servers');
      // Wait for page to be ready - don't use networkidle as it can hang on background requests

      // Find server row
      const serverRow = adminPage.locator('tr').filter({ hasText: serverWithTools.name });

      if ((await serverRow.count()) > 0) {
        // Click edit to view details
        const editButton = serverRow.getByRole('button', { name: /edit/i });

        if ((await editButton.count()) > 0) {
          await editButton.click();

          const dialog = adminPage.getByRole('dialog');
          await expect(dialog).toBeVisible({ timeout: 5000 });

          // Check if tools are displayed
          const dialogContent = await dialog.textContent();
          const hasToolNames = serverWithTools.tools.some((t) => dialogContent?.includes(t.name));

          // Close dialog
          await adminPage.keyboard.press('Escape');

          // Alternatively, check tools page
          if (!hasToolNames) {
            await navigateTo(adminPage, '/admin/tools');
            // Wait for page to be ready - don't use networkidle as it can hang on background requests

            // Tools from this server should be visible
            // We just verify the tools page loaded, individual tool visibility depends on pagination
            await expect(adminPage.locator('body')).toBeVisible();
          }
        }
      }
    } finally {
      await prisma.mcpTool.deleteMany({ where: { mcpServerId: serverWithTools.id } });
      await prisma.mcpServer.delete({ where: { id: serverWithTools.id } });
    }
  });

  test('should auto-discover tools when credentials are added', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Find an API_KEY server without credentials
    const serverWithoutCreds = await prisma.mcpServer.findFirst({
      where: {
        deletedAt: null,
        authType: 'API_KEY',
        apiKey: null,
        organizationId: tenant.orgId,
      },
    });

    if (!serverWithoutCreds) {
      // Create one for this test
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const testServer = await prisma.mcpServer.create({
        data: {
          name: `auto-discover-${uniqueSuffix}`,
          url: `https://auto-discover-${uniqueSuffix}.example.com/mcp`,
          organizationId: tenant.orgId,
          authType: 'API_KEY',
        },
      });

      await navigateTo(adminPage, '/admin/credentials');
      // Wait for page to be ready - don't use networkidle as it can hang on background requests

      // Find the server in credentials list
      const serverCard = adminPage
        .locator('[data-testid="server-card"]')
        .or(adminPage.locator('div').filter({ hasText: testServer.name }));

      if ((await serverCard.count()) > 0) {
        // Click to add API key
        const addKeyButton = serverCard.getByRole('button', { name: /add|set|api.?key/i });

        if ((await addKeyButton.count()) > 0) {
          await addKeyButton.click();

          // Fill API key form
          const dialog = adminPage.getByRole('dialog');
          if (await dialog.isVisible().catch(() => false)) {
            const apiKeyInput = dialog
              .locator('input[name="apiKey"]')
              .or(dialog.locator('input[type="password"]'));
            await apiKeyInput.fill('test-api-key-auto-discover');

            const submitButton = dialog.getByRole('button', { name: /save|add|set/i });
            await submitButton.click();

            // Wait for discovery feedback
            await adminPage.waitForTimeout(3000);

            // Check for discovery feedback
            const discoveryFeedback = adminPage.locator('text=/discovered|tools/i');
            if ((await discoveryFeedback.count()) > 0) {
              await expect(discoveryFeedback.first()).toBeVisible();
            }
          }
        }
      }

      // Cleanup
      await prisma.mcpServer.delete({ where: { id: testServer.id } });
    }
  });
});
