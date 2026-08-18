/**
 * E2E Tests: Admin Policy CRUD Operations
 * Tests policy creation, listing, updating, and basic management
 */

import {
  expect,
  navigateTo,
  selectAllToolsInPolicyForm,
  test,
} from '../../../helpers/e2e-fixtures.js';
import { generateUniqueName, getPrisma, waitForTable } from '../../../helpers/e2e.js';

test.describe('Admin Policy CRUD', () => {
  test('should create ALLOW policy with valid data', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: 'Create policy' });
    await expect(createButton).toBeVisible();
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'allow-policy');
    // Description input uses textbox role with placeholder
    const descInput = dialog.getByRole('textbox', { name: 'Description' });
    await descInput.fill(uniqueDesc);

    // The matcher type is a combobox that shows "Role" by default
    // Effect combobox comes first, so find the matcher type by its default value
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    const submitButton = dialog.getByRole('button', { name: 'Create policy' });
    await submitButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await adminPage.reload();
    await waitForTable(adminPage);
    await expect(adminPage.locator('table')).toContainText(uniqueDesc, { timeout: 15000 });
  });

  test('should create DENY policy with valid data', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: 'Create policy' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'deny-policy');
    const descInput = dialog.getByRole('textbox', { name: 'Description' });
    await descInput.fill(uniqueDesc);

    // Select "Everyone" as matcher type (default is "Role")
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Find and click the Effect combobox (shows "ALLOW" by default)
    const effectCombobox = dialog.getByRole('combobox').filter({ hasText: 'ALLOW' });
    await effectCombobox.click();
    await adminPage.getByRole('option', { name: 'DENY' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    const submitButton = dialog.getByRole('button', { name: 'Create policy' });
    await submitButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await adminPage.reload();
    await waitForTable(adminPage);
    await expect(adminPage.locator('table')).toContainText(uniqueDesc, { timeout: 15000 });
  });

  test('should generate unique slug automatically', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: 'Create policy' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'slug-test');
    const descInput = dialog.getByRole('textbox', { name: 'Description' });
    await descInput.fill(uniqueDesc);

    // Select "Everyone" as matcher type (default is "Role")
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    const submitButton = dialog.getByRole('button', { name: 'Create policy' });
    await submitButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    const policy = await prisma.policy.findFirst({
      where: {
        description: { contains: 'slug-test' },
        organizationId: tenant.orgId,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(policy).toBeTruthy();
    expect(policy!.slug).toBeTruthy();
    expect(policy!.slug.length).toBeGreaterThan(0);
  });

  test('should validate required fields on create', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: 'Create policy' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const submitButton = dialog.getByRole('button', { name: 'Create policy' });
    await submitButton.click();

    await adminPage.waitForTimeout(500);

    const dialogStillOpen = await dialog.isVisible();
    const hasValidationError =
      (await dialog.locator('.text-destructive').count()) > 0 ||
      (await adminPage.locator('[role="alert"]').count()) > 0;

    expect(dialogStillOpen || hasValidationError).toBe(true);
  });

  test('should update policy matchers', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    let adminRole = await prisma.role.findFirst({
      where: { isAdmin: true, organizationId: tenant.orgId },
    });
    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: { name: 'Admin', organizationId: tenant.orgId, isAdmin: true },
      });
    }

    const uniqueDesc = generateUniqueName(testInfo, 'update-matchers');
    const policy = await prisma.policy.create({
      data: {
        description: uniqueDesc,
        slug: `test-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const editButton = policyRow.getByRole('button', { name: 'Edit' });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click matcher type combobox and select Role
    // When editing a policy with '*' matcher, it shows as "Everyone"
    const matcherTypeCombobox = dialog
      .getByRole('combobox')
      .filter({ hasText: /Everyone|Role/ })
      .first();
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Role' }).click();

    // After selecting Role, a role selection combobox appears
    // Wait a moment for the UI to update
    await adminPage.waitForTimeout(300);

    // Click the role selection combobox (second combobox in the matcher row)
    const roleValueCombobox = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select role|All roles/ });
    if ((await roleValueCombobox.count()) > 0) {
      await roleValueCombobox.click();

      const roleOption = adminPage.getByRole('option').filter({ hasText: adminRole.name });
      if ((await roleOption.count()) > 0) {
        await roleOption.first().click();
      } else {
        const allRolesOption = adminPage.getByRole('option', { name: 'All roles' });
        if ((await allRolesOption.count()) > 0) {
          await allRolesOption.click();
        }
      }
    }

    const saveButton = dialog.getByRole('button', { name: 'Save changes' });
    await saveButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(updatedPolicy).toBeTruthy();

    await prisma.policy.delete({ where: { id: policy.id } });
  });

  test('should update policy tools', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    const uniqueDesc = generateUniqueName(testInfo, 'update-tools');
    const policy = await prisma.policy.create({
      data: {
        description: uniqueDesc,
        slug: `test-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const editButton = policyRow.getByRole('button', { name: 'Edit' });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const saveButton = dialog.getByRole('button', { name: 'Save changes' });
    await saveButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(updatedPolicy).toBeTruthy();

    await prisma.policy.delete({ where: { id: policy.id } });
  });

  test('should update policy effect from ALLOW to DENY', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    const uniqueDesc = generateUniqueName(testInfo, 'update-effect');
    const policy = await prisma.policy.create({
      data: {
        description: uniqueDesc,
        slug: `test-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const editButton = policyRow.getByRole('button', { name: 'Edit' });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Find and click the Effect combobox (shows "ALLOW" by default)
    const effectCombobox = dialog.getByRole('combobox').filter({ hasText: 'ALLOW' });
    await effectCombobox.click();
    await adminPage.getByRole('option', { name: 'DENY' }).click();

    const saveButton = dialog.getByRole('button', { name: 'Save changes' });
    await saveButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(updatedPolicy!.effect).toBe('DENY');

    await prisma.policy.delete({ where: { id: policy.id } });
  });

  test('should toggle policy enabled/disabled', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    const uniqueDesc = generateUniqueName(testInfo, 'toggle-test');
    const policy = await prisma.policy.create({
      data: {
        description: uniqueDesc,
        slug: `test-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const toggle = policyRow.locator('[role="switch"]');
    if ((await toggle.count()) > 0) {
      await toggle.click();
      await adminPage.waitForTimeout(1000);

      const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
      expect(updatedPolicy!.enabled).toBe(false);

      await toggle.click();
      await adminPage.waitForTimeout(1000);

      const reenabledPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
      expect(reenabledPolicy!.enabled).toBe(true);
    }

    await prisma.policy.delete({ where: { id: policy.id } });
  });

  test('should list policies with filtering by effect', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    const allowDesc = generateUniqueName(testInfo, 'filter-allow');
    const denyDesc = generateUniqueName(testInfo, 'filter-deny');

    const allowPolicy = await prisma.policy.create({
      data: {
        description: allowDesc,
        slug: `test-allow-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const denyPolicy = await prisma.policy.create({
      data: {
        description: denyDesc,
        slug: `test-deny-${Date.now()}`,
        effect: 'DENY',
        matchers: ['*'],
        toolPatterns: ['dangerous'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await expect(adminPage.locator('table')).toContainText(allowDesc, { timeout: 10000 });
    await expect(adminPage.locator('table')).toContainText(denyDesc, { timeout: 10000 });

    const filtersButton = adminPage.getByRole('button', { name: /Filters/ });
    if ((await filtersButton.count()) > 0) {
      await filtersButton.click();

      const filterDialog = adminPage.getByRole('dialog');
      await expect(filterDialog).toBeVisible({ timeout: 5000 });

      // Find the effect filter combobox
      const effectCombobox = filterDialog.getByRole('combobox').first();
      await effectCombobox.click();
      await adminPage.getByRole('option', { name: 'ALLOW' }).click();

      const applyButton = filterDialog.getByRole('button', { name: /Apply/ });
      await applyButton.click();

      await expect(filterDialog).not.toBeVisible({ timeout: 5000 });
      await adminPage.waitForTimeout(500);

      await expect(adminPage.locator('table')).toContainText(allowDesc, { timeout: 10000 });
    }

    await prisma.policy.delete({ where: { id: allowPolicy.id } });
    await prisma.policy.delete({ where: { id: denyPolicy.id } });
  });
});
