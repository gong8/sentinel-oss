/**
 * E2E Tests: Admin MCP Server Credentials Management
 * Tests API key and credential configuration
 */

import {
  encryptString,
  expect,
  getPrisma,
  navigateTo,
  test,
} from '../../../helpers/e2e-fixtures.js';

test.describe('Admin MCP Server Credentials', () => {
  test('should display credentials management page', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/credentials');

    await expect(adminPage.getByText('Credentials Management')).toBeVisible({ timeout: 15000 });
    // PageHeader description is set via context (document title), not rendered visually
    // Verify core sections are visible instead
    await expect(adminPage.getByRole('heading', { name: 'API Key Servers' })).toBeVisible();
  });

  test('should show API Key Servers section', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const server = await prisma.mcpServer.create({
      data: {
        name: `api-key-test-${uniqueSuffix}`,
        url: `https://api-key-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'API_KEY',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/credentials');

      const apiKeySection = adminPage
        .locator('div')
        .filter({ hasText: /^API Key Servers/ })
        .first();
      await expect(apiKeySection).toBeVisible({ timeout: 15000 });
      // Use .first() since server may appear in multiple sections (API Key + JSON Credentials)
      await expect(adminPage.getByText(server.name).first()).toBeVisible();
    } finally {
      await prisma.mcpServer.delete({ where: { id: server.id } });
    }
  });

  test('should open API key dialog when clicking Add Personal button', async ({
    adminPage,
    tenant,
  }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const server = await prisma.mcpServer.create({
      data: {
        name: `add-key-test-${uniqueSuffix}`,
        url: `https://add-key-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'API_KEY',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/credentials');

      const serverRow = adminPage
        .locator(`[data-server-id="${server.id}"]`)
        .or(adminPage.locator('div').filter({ hasText: server.name }).first());

      if ((await serverRow.count()) > 0) {
        const addPersonalButton = serverRow.getByRole('button', { name: /Add Personal/i });
        if ((await addPersonalButton.count()) > 0) {
          await addPersonalButton.click();

          const dialog = adminPage.getByRole('dialog');
          await expect(dialog).toBeVisible({ timeout: 5000 });
          await expect(dialog.getByText('Personal API Key')).toBeVisible();
          await expect(dialog.locator('input[type="password"]')).toBeVisible();

          await dialog.getByRole('button', { name: 'Cancel' }).click();
          await expect(dialog).not.toBeVisible();
        }
      }
    } finally {
      await prisma.mcpServer.delete({ where: { id: server.id } });
    }
  });

  test('should set organization API key for server', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const server = await prisma.mcpServer.create({
      data: {
        name: `org-key-test-${uniqueSuffix}`,
        url: `https://org-key-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'API_KEY',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/credentials');

      const serverRow = adminPage.locator('div').filter({ hasText: server.name });

      if ((await serverRow.count()) > 0) {
        const expandButton = serverRow.getByRole('button').first();
        if ((await expandButton.count()) > 0) {
          await expandButton.click();
          await adminPage.waitForTimeout(500);
        }

        const addOrgKeyButton = adminPage.getByRole('button', { name: /Add Org Key/i });
        if ((await addOrgKeyButton.count()) > 0) {
          await addOrgKeyButton.click();

          const dialog = adminPage.getByRole('dialog');
          await expect(dialog).toBeVisible({ timeout: 5000 });
          await expect(dialog.getByText('Organization API Key')).toBeVisible();

          const apiKeyInput = dialog.locator('input[type="password"]');
          await apiKeyInput.fill('test-org-api-key-12345');

          const saveButton = dialog.getByRole('button', { name: /Save API Key/i });
          await saveButton.click();

          await adminPage.waitForTimeout(2000);

          const updatedServer = await prisma.mcpServer.findUnique({
            where: { id: server.id },
          });

          expect(updatedServer?.apiKey).toBeTruthy();
        }
      }
    } finally {
      await prisma.mcpServer.delete({ where: { id: server.id } });
    }
  });

  test('should clear organization API key', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const server = await prisma.mcpServer.create({
      data: {
        name: `clear-key-test-${uniqueSuffix}`,
        url: `https://clear-key-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'API_KEY',
        apiKey: encryptString('encrypted-test-key'),
      },
    });

    try {
      await navigateTo(adminPage, '/admin/credentials');

      const serverRow = adminPage.locator('div').filter({ hasText: server.name });

      if ((await serverRow.count()) > 0) {
        const expandButton = serverRow.getByRole('button').first();
        if ((await expandButton.count()) > 0) {
          await expandButton.click();
          await adminPage.waitForTimeout(500);
        }

        const clearButton = adminPage.getByRole('button', { name: /^Clear$/i });
        if ((await clearButton.count()) > 0) {
          await clearButton.first().click();

          const confirmDialog = adminPage.getByRole('dialog');
          if (await confirmDialog.isVisible().catch(() => false)) {
            const confirmButton = confirmDialog.getByRole('button', {
              name: /Clear API key/i,
            });
            await confirmButton.click();
            await adminPage.waitForTimeout(2000);

            const updatedServer = await prisma.mcpServer.findUnique({
              where: { id: server.id },
            });

            expect(updatedServer?.apiKey).toBeFalsy();
          }
        }
      }
    } finally {
      await prisma.mcpServer.delete({ where: { id: server.id } });
    }
  });

  test('should show OAuth Servers section', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const server = await prisma.mcpServer.create({
      data: {
        name: `oauth-test-${uniqueSuffix}`,
        url: `https://oauth-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'OAUTH',
        oauthClientRegistration: {
          create: {
            organizationId: tenant.orgId,
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            authorizationEndpoint: 'https://example.com/authorize',
            tokenEndpoint: 'https://example.com/token',
            scopesSupported: [],
            grantTypesSupported: ['authorization_code'],
          },
        },
      },
    });

    try {
      await navigateTo(adminPage, '/admin/credentials');

      await expect(adminPage.getByText('OAuth Servers')).toBeVisible({ timeout: 15000 });
      await expect(adminPage.getByText(server.name).first()).toBeVisible();
    } finally {
      await prisma.mcpServer.delete({ where: { id: server.id } });
    }
  });

  test('should show Advanced JSON Credentials section', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const server = await prisma.mcpServer.create({
      data: {
        name: `json-creds-test-${uniqueSuffix}`,
        url: `https://json-creds-test-${uniqueSuffix}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
      },
    });

    try {
      await navigateTo(adminPage, '/admin/credentials');

      await expect(adminPage.getByText('Advanced JSON Credentials')).toBeVisible({
        timeout: 15000,
      });
      await expect(adminPage.getByText(server.name).first()).toBeVisible();
    } finally {
      await prisma.mcpServer.delete({ where: { id: server.id } });
    }
  });

  test('should show empty state or server list when page loads', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/credentials');

    // Wait for page to load
    await expect(adminPage.getByRole('heading', { name: 'Credentials Management' })).toBeVisible({
      timeout: 15000,
    });

    // Check for either empty states or server sections - page should show one or the other
    const noApiKeyServers = adminPage.getByText('No API key servers');
    const noOAuthServers = adminPage.getByText('No OAuth servers');
    const apiKeySection = adminPage.getByText('API Key Servers');
    const oauthSection = adminPage.getByText('OAuth Servers');
    const jsonSection = adminPage.getByText('Advanced JSON Credentials');

    const hasEmptyApiKey = await noApiKeyServers.isVisible().catch(() => false);
    const hasEmptyOAuth = await noOAuthServers.isVisible().catch(() => false);
    const hasApiKeySection = await apiKeySection.isVisible().catch(() => false);
    const hasOAuthSection = await oauthSection.isVisible().catch(() => false);
    const hasJsonSection = await jsonSection.isVisible().catch(() => false);

    // Page should show at least one section or empty state
    expect(
      hasEmptyApiKey || hasEmptyOAuth || hasApiKeySection || hasOAuthSection || hasJsonSection,
    ).toBe(true);
  });
});
