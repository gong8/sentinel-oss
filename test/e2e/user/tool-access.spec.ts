/**
 * E2E Tests: User Tool Access Page
 * Tests tool listing, filtering, and access status display
 */

import { expect, getPrisma, navigateTo, test } from '../../helpers/e2e-fixtures.js';

test.describe('User Tool Access', () => {
  test.describe('Empty State', () => {
    test('should display empty state when no tools are available', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      const emptyState = userPage.getByTestId('empty-state');
      await expect(emptyState).toBeVisible();
      await expect(emptyState.getByText('No tools available')).toBeVisible();
    });
  });

  test.describe('With Tools', () => {
    test.beforeEach(async ({ tenant }) => {
      const prisma = await getPrisma();
      const mcpServer = await prisma.mcpServer.create({
        data: {
          name: 'Test Server',
          url: 'https://test-server.example.com/mcp',
          authType: 'NONE',
          organizationId: tenant.orgId,
        },
      });

      await prisma.mcpTool.createMany({
        data: [
          {
            name: 'allowed_tool',
            description: 'A tool that is allowed',
            mcpServerId: mcpServer.id,
          },
          {
            name: 'denied_tool',
            description: 'A tool that is denied',
            mcpServerId: mcpServer.id,
          },
          {
            name: 'another_allowed',
            description: 'Another allowed tool',
            mcpServerId: mcpServer.id,
          },
        ],
      });

      const userRole = await prisma.role.findFirst({
        where: {
          organizationId: tenant.orgId,
          isAdmin: false,
        },
      });

      if (!userRole) {
        throw new Error('User role not found');
      }

      await prisma.policy.create({
        data: {
          slug: 'allow-allowed-tool',
          effect: 'ALLOW',
          matchers: [`role:${userRole.name}`],
          toolPatterns: ['test-server.example.com::allowed_tool'],
          description: 'Allow allowed_tool for user role',
          organizationId: tenant.orgId,
        },
      });

      await prisma.policy.create({
        data: {
          slug: 'allow-another-allowed',
          effect: 'ALLOW',
          matchers: [`role:${userRole.name}`],
          toolPatterns: ['test-server.example.com::another_allowed'],
          description: 'Allow another_allowed for user role',
          organizationId: tenant.orgId,
        },
      });

      await prisma.policy.create({
        data: {
          slug: 'deny-denied-tool',
          effect: 'DENY',
          matchers: [`role:${userRole.name}`],
          toolPatterns: ['test-server.example.com::denied_tool'],
          description: 'Deny denied_tool for user role',
          organizationId: tenant.orgId,
        },
      });
    });

    test('should display tool access stats cards', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      const statsGrid = userPage.locator('.grid.gap-4.md\\:grid-cols-3');
      await expect(statsGrid.getByText('Total Tools')).toBeVisible();
      await expect(statsGrid.getByText('Allowed', { exact: true })).toBeVisible();
      await expect(statsGrid.getByText('Denied', { exact: true })).toBeVisible();

      const statsValues = statsGrid.locator('.text-3xl');
      await expect(statsValues).toHaveCount(3);
    });

    test('should show ALLOW/DENY badges on each tool', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      await expect(userPage.getByText('ALLOW', { exact: true }).first()).toBeVisible();
      await expect(userPage.getByText('DENY', { exact: true })).toBeVisible();
    });

    test('should display filter controls', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Filters' })).toBeVisible({
        timeout: 15000,
      });

      await expect(userPage.locator('#search')).toBeVisible();
      await expect(userPage.locator('#access')).toBeVisible();
      await expect(userPage.locator('#server')).toBeVisible();
      await expect(userPage.getByRole('button', { name: 'Apply' })).toBeVisible();
      await expect(userPage.getByRole('button', { name: 'Reset' })).toBeVisible();
    });

    test('should filter tools by access status', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Filters' })).toBeVisible({
        timeout: 15000,
      });

      await userPage.locator('#access').click();
      await userPage.getByRole('option', { name: 'ALLOWED' }).click();
      await userPage.getByRole('button', { name: 'Apply' }).click();
      await userPage.waitForTimeout(500);

      await expect(userPage.getByText('ALLOW', { exact: true }).first()).toBeVisible();
      await expect(userPage.getByText('DENY', { exact: true })).not.toBeVisible();

      await userPage.getByRole('button', { name: 'Reset' }).click();
      await userPage.waitForTimeout(500);

      await userPage.locator('#access').click();
      await userPage.getByRole('option', { name: 'DENIED' }).click();
      await userPage.getByRole('button', { name: 'Apply' }).click();
      await userPage.waitForTimeout(500);

      await expect(userPage.getByText('DENY', { exact: true })).toBeVisible();
      await expect(userPage.getByText('ALLOW', { exact: true })).not.toBeVisible();
    });

    test('should search tools by name', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Filters' })).toBeVisible({
        timeout: 15000,
      });

      await userPage.locator('#search').fill('allowed_tool');
      await userPage.getByRole('button', { name: 'Apply' }).click();
      await userPage.waitForTimeout(500);

      await expect(userPage.locator('h4').filter({ hasText: 'allowed_tool' })).toBeVisible();
      await expect(userPage.locator('h4').filter({ hasText: 'denied_tool' })).not.toBeVisible();
    });

    test('should show tool description and server info', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      await expect(userPage.getByRole('heading', { name: 'Test Server' })).toBeVisible();
      await expect(userPage.locator('h4').filter({ hasText: 'allowed_tool' })).toBeVisible();
      await expect(userPage.getByText('A tool that is allowed')).toBeVisible();
    });

    test('should show Request button for denied tools', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      const deniedToolCard = userPage
        .locator('.space-y-2 > div')
        .filter({ has: userPage.locator('h4').filter({ hasText: 'denied_tool' }) });
      await expect(deniedToolCard).toBeVisible();

      const requestButton = deniedToolCard.getByRole('button', { name: 'Request Removal' });
      await expect(requestButton).toBeVisible();
    });

    test('should navigate to request page when clicking Request button', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      const deniedToolCard = userPage
        .locator('.space-y-2 > div')
        .filter({ has: userPage.locator('h4').filter({ hasText: 'denied_tool' }) });
      const requestButton = deniedToolCard.getByRole('button', { name: 'Request Removal' });
      await requestButton.click();

      // Should navigate to requests page (may or may not have toolNames query param)
      await expect(userPage).toHaveURL(/\/user\/[^/]+\/requests/, { timeout: 10000 });
    });

    test('should show Request All button when server has denied tools', async ({ userPage }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      const requestAllButton = userPage.getByRole('button', { name: 'Request All' });
      await expect(requestAllButton).toBeVisible();
    });
  });

  test.describe('With Blocked by DENY Policy', () => {
    test.beforeEach(async ({ tenant }) => {
      const prisma = await getPrisma();
      const mcpServer = await prisma.mcpServer.create({
        data: {
          name: 'Blocked Server',
          url: 'https://blocked-server.example.com/mcp',
          authType: 'NONE',
          organizationId: tenant.orgId,
        },
      });

      await prisma.mcpTool.create({
        data: {
          name: 'blocked_tool',
          description: 'A tool blocked by explicit DENY',
          mcpServerId: mcpServer.id,
        },
      });

      await prisma.policy.create({
        data: {
          slug: 'deny-blocked-tool',
          effect: 'DENY',
          matchers: ['*'],
          toolPatterns: ['blocked-server.example.com::blocked_tool'],
          description: 'Deny blocked_tool for everyone',
          organizationId: tenant.orgId,
        },
      });
    });

    test('should show Request Removal button for tools blocked by DENY policy', async ({
      userPage,
    }) => {
      await navigateTo(userPage, '/user/tools');

      await expect(userPage.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      const blockedToolCard = userPage
        .locator('.space-y-2 > div')
        .filter({ has: userPage.locator('h4').filter({ hasText: 'blocked_tool' }) });
      await expect(blockedToolCard).toBeVisible();

      const requestRemovalButton = blockedToolCard.getByRole('button', { name: 'Request Removal' });
      await expect(requestRemovalButton).toBeVisible();
    });
  });
});
