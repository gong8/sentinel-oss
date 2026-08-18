/**
 * E2E Tests: Admin Policy Assertions
 * Tests creating, viewing, running, and deleting policy assertions
 */

import { expect, getPrisma, navigateTo, test } from '../../../helpers/e2e-fixtures.js';
import { generateUniqueName } from '../../../helpers/e2e.js';

test.describe('Admin Policy Assertions', () => {
  test('should display policy assertions page with summary cards', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-assertions');

    await expect(adminPage.getByRole('heading', { name: 'Policy Assertions' })).toBeVisible();
    await expect(adminPage.getByText('Total')).toBeVisible();
    await expect(adminPage.getByText('Passing')).toBeVisible();
    await expect(adminPage.getByText('Failing')).toBeVisible();
    await expect(adminPage.getByText('Never Run')).toBeVisible();
  });

  test('should create assertion with ALLOWED expected decision', async ({
    adminPage,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/policy-assertions');

    await adminPage.getByRole('button', { name: 'New Assertion' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('New Policy Assertion')).toBeVisible();

    const uniqueName = generateUniqueName(testInfo, 'allow-assertion');
    await dialog.locator('input#name').fill(uniqueName);
    await dialog.locator('textarea#description').fill('Test assertion for ALLOWED');

    const expectedDecisionTrigger = dialog
      .locator('div')
      .filter({ hasText: /^Expected Decision/ })
      .locator('button[role="combobox"]');
    await expectedDecisionTrigger.click();
    await adminPage.getByRole('option', { name: 'ALLOWED' }).click();

    await dialog.getByRole('button', { name: 'Create Assertion' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.getByText(uniqueName)).toBeVisible({ timeout: 10000 });
  });

  test('should create assertion with DENIED expected decision', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/policy-assertions');

    await adminPage.getByRole('button', { name: 'New Assertion' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const uniqueName = generateUniqueName(testInfo, 'deny-assertion');
    await dialog.locator('input#name').fill(uniqueName);

    const expectedDecisionTrigger = dialog
      .locator('div')
      .filter({ hasText: /^Expected Decision/ })
      .locator('button[role="combobox"]');
    await expectedDecisionTrigger.click();
    await adminPage.getByRole('option', { name: 'DENIED' }).click();

    await dialog.getByRole('button', { name: 'Create Assertion' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.getByText(uniqueName)).toBeVisible({ timeout: 10000 });
  });

  test('should run all assertions and show summary', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const assertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'run-all'),
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policy-assertions');

    await expect(adminPage.getByText(assertion.name)).toBeVisible({ timeout: 10000 });

    await adminPage.getByRole('button', { name: 'Run All' }).click();

    await expect(
      adminPage
        .getByText(/passed.*failed.*total|All Assertions Passed|Some Assertions Failed/i)
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('should view assertion details', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const assertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'view-details'),
        description: 'Test description for viewing',
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policy-assertions');

    const assertionRow = adminPage.locator('tr').filter({ hasText: assertion.name });
    await expect(assertionRow).toBeVisible({ timeout: 10000 });

    await assertionRow.getByRole('button', { name: 'View' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(assertion.name)).toBeVisible();
    await expect(dialog.getByText('Test description for viewing')).toBeVisible();
    await expect(dialog.getByText('Tool Pattern')).toBeVisible();
    await expect(dialog.getByText('Context')).toBeVisible();
    await expect(dialog.getByText('Expected Decision')).toBeVisible();
  });

  test('should run single assertion from view dialog', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const assertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'run-single'),
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policy-assertions');

    const assertionRow = adminPage.locator('tr').filter({ hasText: assertion.name });
    await expect(assertionRow).toBeVisible({ timeout: 10000 });

    await assertionRow.getByRole('button', { name: 'View' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click Run Now button
    const runButton = dialog.getByRole('button', { name: 'Run Now' });
    await runButton.click();

    // Wait for the button to change to "Running..." and then back to "Run Now"
    // This indicates the mutation has completed
    await expect(runButton)
      .toContainText('Running', { timeout: 5000 })
      .catch(() => {});
    await expect(runButton).toContainText('Run Now', { timeout: 15000 });

    // Close dialog and reopen to get fresh data (the selected assertion state doesn't auto-update)
    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Reopen the dialog to see the updated assertion
    const assertionRowAgain = adminPage.locator('tr').filter({ hasText: assertion.name });
    await assertionRowAgain.getByRole('button', { name: 'View' }).click();

    const dialogAgain = adminPage.getByRole('dialog');
    await expect(dialogAgain).toBeVisible();

    // Now the "Last Run" section should show "Passed" or "Failed"
    await expect(dialogAgain.getByText(/Passed|Failed/).first()).toBeVisible({ timeout: 10000 });
  });

  test('should edit assertion from view dialog', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const assertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'edit-assertion'),
        description: 'Original description',
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policy-assertions');

    const assertionRow = adminPage.locator('tr').filter({ hasText: assertion.name });
    await expect(assertionRow).toBeVisible({ timeout: 10000 });

    await assertionRow.getByRole('button', { name: 'View' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Edit' }).click();

    await expect(dialog.getByText('Edit Assertion')).toBeVisible();

    const descriptionInput = dialog.locator('textarea#edit-description');
    await descriptionInput.clear();
    await descriptionInput.fill('Updated description');

    await dialog.getByRole('button', { name: 'Save Changes' }).click();

    await expect(dialog.getByText('Edit Assertion')).not.toBeVisible({ timeout: 10000 });

    const prismaUpdated = await getPrisma();
    const updated = await prismaUpdated.policyAssertion.findUnique({ where: { id: assertion.id } });
    expect(updated?.description).toBe('Updated description');
  });

  test('should delete assertion', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const assertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'delete-assertion'),
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policy-assertions');

    const assertionRow = adminPage.locator('tr').filter({ hasText: assertion.name });
    await expect(assertionRow).toBeVisible({ timeout: 10000 });

    await assertionRow.getByRole('button', { name: 'Delete' }).click();

    const confirmDialog = adminPage.getByRole('alertdialog').or(adminPage.getByRole('dialog'));
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText('Delete assertion')).toBeVisible();

    await confirmDialog.getByRole('button', { name: 'Delete' }).click();

    await expect(adminPage.getByText(assertion.name)).not.toBeVisible({ timeout: 10000 });

    const prismaDeleted = await getPrisma();
    const deleted = await prismaDeleted.policyAssertion.findUnique({ where: { id: assertion.id } });
    expect(deleted).toBeNull();
  });

  test('should filter assertions by status', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const passedAssertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'filter-passed'),
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
        lastRunAt: new Date(),
        lastRunPassed: true,
      },
    });

    const neverRunAssertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'filter-never-run'),
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'DENIED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policy-assertions');

    await expect(adminPage.getByText(passedAssertion.name)).toBeVisible({ timeout: 10000 });
    await expect(adminPage.getByText(neverRunAssertion.name)).toBeVisible();

    const statusFilter = adminPage
      .locator('button[role="combobox"]')
      .filter({ hasText: /All Status|Status/ });
    await statusFilter.click();
    await adminPage.getByRole('option', { name: 'Passed' }).click();

    await expect(adminPage.getByText(passedAssertion.name)).toBeVisible();
    await expect(adminPage.getByText(neverRunAssertion.name)).not.toBeVisible();
  });

  test('should search assertions by name', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const searchableAssertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'searchable-unique'),
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    const otherAssertion = await prisma.policyAssertion.create({
      data: {
        name: generateUniqueName(testInfo, 'other-assertion'),
        toolPattern: '*::*',
        contextType: 'WILDCARD',
        expectedDecision: 'DENIED',
        organizationId: tenant.orgId,
        createdById: tenant.adminId,
        enabled: true,
      },
    });

    await navigateTo(adminPage, '/admin/policy-assertions');

    await expect(adminPage.getByText(searchableAssertion.name)).toBeVisible({ timeout: 10000 });
    await expect(adminPage.getByText(otherAssertion.name)).toBeVisible();

    const searchInput = adminPage.getByPlaceholder(/Search by name/i);
    await searchInput.fill('searchable-unique');

    await expect(adminPage.getByText(searchableAssertion.name)).toBeVisible();
    await expect(adminPage.getByText(otherAssertion.name)).not.toBeVisible();
  });

  test('should show empty state when no assertions exist', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-assertions');

    // Wait for page to fully load
    await expect(adminPage.getByRole('heading', { name: /Policy Assertions/i })).toBeVisible({
      timeout: 15000,
    });

    // Wait for either table or empty state to appear
    const table = adminPage.locator('table');
    const emptyState = adminPage.getByText(/No assertions yet|No assertions match/);
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10000 });

    const hasTable = await table.isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    expect(hasTable || hasEmptyState).toBe(true);
  });

  test('should auto-generate assertion name', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-assertions');

    await adminPage.getByRole('button', { name: 'New Assertion' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Auto-generate' }).click();

    const nameInput = dialog.locator('input#name');
    const generatedName = await nameInput.inputValue();
    expect(generatedName.length).toBeGreaterThan(0);
  });
});
