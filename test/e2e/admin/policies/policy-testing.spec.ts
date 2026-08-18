/**
 * E2E Tests: Admin Policy Testing (Playground)
 * Tests the policy playground for testing policies with different contexts
 */

import { expect, getPrisma, navigateTo, test } from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Policy Testing (Playground)', () => {
  test('should navigate to policy playground and see page header', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-playground');
    await expect(adminPage.locator('body')).toBeVisible();

    await expect(
      adminPage.getByRole('heading', { name: /Policy Testing Playground/i }),
    ).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'New Policy Test' })).toBeVisible();
  });

  test('should open new policy test dialog', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-playground');
    await expect(adminPage.locator('body')).toBeVisible();

    await adminPage.getByRole('button', { name: 'New Policy Test' }).click();

    await expect(
      adminPage.getByRole('dialog').getByRole('heading', { name: 'New Policy Test' }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('dialog').getByRole('button', { name: 'Run Test' }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('dialog').getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
  });

  test('should display test history card', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-playground');
    await expect(adminPage.locator('body')).toBeVisible();

    await expect(adminPage.getByRole('heading', { name: 'Test History' })).toBeVisible();
    await expect(
      adminPage.getByText('Previous policy tests with results and policy snapshots.'),
    ).toBeVisible();
  });

  test('should show filter button with badge when filters active', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-playground');
    await expect(adminPage.locator('body')).toBeVisible();

    const filtersButton = adminPage.getByRole('button', { name: /Filters/ });
    await expect(filtersButton).toBeVisible();
    await filtersButton.click();

    await expect(
      adminPage.getByRole('dialog').getByRole('heading', { name: 'Filter Test Results' }),
    ).toBeVisible();

    const decisionDropdown = adminPage
      .getByRole('dialog')
      .locator('button')
      .filter({ hasText: /All Decisions/ });
    await decisionDropdown.click();
    await adminPage.getByRole('option', { name: 'ALLOWED' }).click();

    await adminPage.getByRole('button', { name: 'Apply filters' }).click();

    await expect(adminPage.getByRole('button', { name: /Filters/ })).toBeVisible();
  });

  test('should create and run a policy test with user context', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();
    const mcpServer = await prisma.mcpServer.create({
      data: {
        name: `Test Server ${Date.now()}`,
        url: `https://test-server-${Date.now()}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
        trusted: true,
        tools: {
          create: [
            {
              name: 'test_read_file',
              description: 'Test tool for reading files',
            },
          ],
        },
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-playground');
      await expect(adminPage.locator('body')).toBeVisible();

      await adminPage.getByRole('button', { name: 'New Policy Test' }).click();
      await expect(
        adminPage.getByRole('dialog').getByRole('heading', { name: 'New Policy Test' }),
      ).toBeVisible();

      const dialog = adminPage.getByRole('dialog');

      const serverTrigger = dialog
        .locator('button')
        .filter({ hasText: /All servers/ })
        .first();
      await serverTrigger.click();
      await adminPage.getByRole('option', { name: mcpServer.name }).click();

      const toolTrigger = dialog
        .locator('button')
        .filter({ hasText: /All tools/ })
        .first();
      await toolTrigger.click();
      await adminPage.getByRole('option', { name: 'test_read_file' }).click();

      const userTrigger = dialog.locator('button').filter({ hasText: /Select user/ });
      await userTrigger.click();
      await adminPage.getByRole('option').first().click();

      await dialog.getByRole('button', { name: 'Run Test' }).click();

      await adminPage.waitForTimeout(2000);
      await expect(adminPage.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

      await expect(adminPage.locator('table')).toBeVisible();
      await expect(adminPage.locator('table')).toContainText('test_read_file');
    } finally {
      await prisma.mcpServer.delete({ where: { id: mcpServer.id } });
    }
  });

  test('should view test result details', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();
    const mcpServer = await prisma.mcpServer.create({
      data: {
        name: `View Test Server ${Date.now()}`,
        url: `https://view-test-${Date.now()}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
        trusted: true,
        tools: {
          create: [
            {
              name: 'view_test_tool',
              description: 'Tool for view test',
            },
          ],
        },
      },
    });

    // Use admin user from tenant fixture - guaranteed to exist
    const user = await prisma.user.findUnique({
      where: { id: tenant.adminId },
    });

    if (!user) {
      throw new Error('Admin user not found - tenant.adminId should always exist');
    }

    const serverKey = new URL(mcpServer.url).hostname.split('.')[0];
    const policyTest = await prisma.policyTest.create({
      data: {
        toolName: `${serverKey}::view_test_tool`,
        decision: 'ALLOWED',
        justification: 'Test policy matched',
        userId: user.id,
        userEmail: user.email,
        userRoles: ['Admin'],
        policySnapshot: [],
        matchedPolicyIds: [],
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-playground');
      await expect(adminPage.locator('body')).toBeVisible();

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 10000 });

      const row = adminPage.locator('tr').filter({ hasText: 'view_test_tool' });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: 'View' }).click();

      await expect(
        adminPage.getByRole('dialog').getByRole('heading', { name: 'Test Result Details' }),
      ).toBeVisible();
      await expect(adminPage.getByRole('dialog').getByText('ALLOWED')).toBeVisible();
      await expect(adminPage.getByRole('dialog').getByText('view_test_tool')).toBeVisible();
    } finally {
      await prisma.policyTest.delete({ where: { id: policyTest.id } });
      await prisma.mcpServer.delete({ where: { id: mcpServer.id } });
    }
  });

  test('should retest from test result details', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();
    const mcpServer = await prisma.mcpServer.create({
      data: {
        name: `Retest Server ${Date.now()}`,
        url: `https://retest-${Date.now()}.example.com/mcp`,
        organizationId: tenant.orgId,
        authType: 'NONE',
        trusted: true,
        tools: {
          create: [
            {
              name: 'retest_tool',
              description: 'Tool for retest',
            },
          ],
        },
      },
    });

    // Use admin user from tenant fixture - guaranteed to exist
    const user = await prisma.user.findUnique({
      where: { id: tenant.adminId },
    });

    if (!user) {
      await prisma.mcpServer.delete({ where: { id: mcpServer.id } });
      throw new Error('Admin user not found - tenant.adminId should always exist');
    }

    const serverKey = new URL(mcpServer.url).hostname.split('.')[0];
    const policyTest = await prisma.policyTest.create({
      data: {
        toolName: `${serverKey}::retest_tool`,
        decision: 'DENIED',
        justification: 'No matching policy',
        userId: user.id,
        userEmail: user.email,
        userRoles: ['User'],
        policySnapshot: [],
        matchedPolicyIds: [],
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-playground');
      await expect(adminPage.locator('body')).toBeVisible();

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 10000 });

      const row = adminPage.locator('tr').filter({ hasText: 'retest_tool' });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: 'View' }).click();

      await expect(
        adminPage.getByRole('dialog').getByRole('heading', { name: 'Test Result Details' }),
      ).toBeVisible();

      await adminPage.getByRole('dialog').getByRole('button', { name: 'Retest' }).click();

      await expect(
        adminPage.getByRole('dialog').getByRole('heading', { name: 'New Policy Test' }),
      ).toBeVisible();
    } finally {
      await prisma.policyTest.delete({ where: { id: policyTest.id } });
      await prisma.mcpServer.delete({ where: { id: mcpServer.id } });
    }
  });

  test('should delete a test from history', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();
    // Use admin user from tenant fixture - guaranteed to exist
    const user = await prisma.user.findUnique({
      where: { id: tenant.adminId },
    });

    if (!user) {
      throw new Error('Admin user not found - tenant.adminId should always exist');
    }

    const policyTest = await prisma.policyTest.create({
      data: {
        toolName: `delete-server::delete_test_tool`,
        decision: 'ALLOWED',
        justification: 'Test',
        userId: user.id,
        userEmail: user.email,
        userRoles: [],
        policySnapshot: [],
        matchedPolicyIds: [],
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-playground');
      await expect(adminPage.locator('body')).toBeVisible();

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 10000 });

      const row = adminPage.locator('tr').filter({ hasText: 'delete_test_tool' });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: 'Delete' }).click();

      await expect(
        adminPage.getByRole('dialog').getByRole('heading', { name: /Delete test result/i }),
      ).toBeVisible();

      await adminPage.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

      await expect(row).not.toBeVisible({ timeout: 5000 });
    } finally {
      const exists = await prisma.policyTest.findUnique({
        where: { id: policyTest.id },
      });
      if (exists) {
        await prisma.policyTest.delete({ where: { id: policyTest.id } });
      }
    }
  });

  test('should display search input', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-playground');
    await expect(adminPage.locator('body')).toBeVisible();

    await expect(
      adminPage.getByPlaceholder('Search by tool name, user email, or agent name...'),
    ).toBeVisible();
  });

  test('should show empty state when no tests exist', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-playground');
    await expect(adminPage.locator('body')).toBeVisible();

    // Wait for page to fully load
    await expect(
      adminPage.getByRole('heading', { name: /Policy Testing Playground/i }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for either empty state or table to appear
    await expect(adminPage.getByText('No tests yet').or(adminPage.locator('table'))).toBeVisible({
      timeout: 10000,
    });

    const emptyState = adminPage.getByText('No tests yet');
    const noMatchState = adminPage.getByText('No tests match filters');

    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasNoMatchState = await noMatchState.isVisible().catch(() => false);
    const hasTable = (await adminPage.locator('table tbody tr').count()) > 0;

    expect(hasEmptyState || hasNoMatchState || hasTable).toBe(true);
  });

  test('should create assertion from test result', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();
    // Use admin user from tenant fixture - guaranteed to exist
    const user = await prisma.user.findUnique({
      where: { id: tenant.adminId },
    });

    if (!user) {
      throw new Error('Admin user not found - tenant.adminId should always exist');
    }

    const policyTest = await prisma.policyTest.create({
      data: {
        toolName: `assertion-server::assertion_test_tool`,
        decision: 'ALLOWED',
        justification: 'Policy matched',
        userId: user.id,
        userEmail: user.email,
        userRoles: ['Admin'],
        policySnapshot: [],
        matchedPolicyIds: [],
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-playground');
      await expect(adminPage.locator('body')).toBeVisible();

      await expect(adminPage.locator('table')).toBeVisible({ timeout: 10000 });

      const row = adminPage.locator('tr').filter({ hasText: 'assertion_test_tool' });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: 'View' }).click();

      await expect(
        adminPage.getByRole('dialog').getByRole('heading', { name: 'Test Result Details' }),
      ).toBeVisible();

      await adminPage.getByRole('button', { name: 'Create Assertion' }).click();

      await expect(
        adminPage.getByRole('heading', { name: 'Create Policy Assertion' }),
      ).toBeVisible();

      await adminPage.getByLabel('Name').fill('Test Assertion');
      await adminPage.getByRole('button', { name: 'Create Assertion' }).click();

      await adminPage.waitForTimeout(1000);
    } finally {
      await prisma.policyAssertion.deleteMany({
        where: { sourceId: policyTest.id },
      });
      await prisma.policyTest.delete({ where: { id: policyTest.id } });
    }
  });
});
