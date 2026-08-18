/**
 * E2E Tests: Policy Conditions
 * Tests creating and managing policies with deterministic conditions
 */

import {
  expect,
  navigateTo,
  selectAllToolsInPolicyForm,
  test,
} from '../../../helpers/e2e-fixtures.js';
import { generateUniqueName, getPrisma, waitForTable } from '../../../helpers/e2e.js';

test.describe('Policy Conditions', () => {
  test('should create policy with network condition via conditions modal', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    // Open create dialog
    const createButton = adminPage.getByRole('button', { name: 'Create policy' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill basic policy details
    const uniqueDesc = generateUniqueName(testInfo, 'network-condition');
    const descInput = dialog.getByRole('textbox', { name: 'Description' });
    await descInput.fill(uniqueDesc);

    // Select "Everyone" as matcher type (default shows "Role")
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Open the Conditions Modal
    const addConditionsButton = dialog.getByRole('button', { name: /Add Conditions/i });
    await addConditionsButton.click();

    // Wait for the conditions modal to appear (it has heading "Edit Conditions")
    const conditionsModalHeading = adminPage.getByRole('heading', { name: 'Edit Conditions' });
    await expect(conditionsModalHeading).toBeVisible({ timeout: 5000 });
    // Get the dialog that contains this heading
    const conditionsModal = adminPage.getByRole('dialog').filter({ has: conditionsModalHeading });

    // Wait for categories to load - look for any tab or "Loading schema" to disappear
    // The tabs container should become visible once categories load
    await adminPage.waitForTimeout(1000); // Allow API to respond

    // Click on Network tab to get network-related fields
    const networkTab = conditionsModal.getByRole('button', { name: 'Network' });
    await expect(networkTab).toBeVisible({ timeout: 5000 });
    await networkTab.click();
    await adminPage.waitForTimeout(500);

    // Wait for the schema tree to load and find the Select button for a network field
    const selectButton = conditionsModal.getByRole('button', { name: 'Select' }).first();
    await expect(selectButton).toBeVisible({ timeout: 10000 });
    await selectButton.click();
    await adminPage.waitForTimeout(300);

    // Fill in the value in the condition editor (network fields are text type for IP addresses)
    const valueInput = conditionsModal.locator('input[type="text"]').first();
    await expect(valueInput).toBeVisible({ timeout: 3000 });
    await valueInput.fill('192.168.1.100');

    // Add the condition
    const addButton = conditionsModal.getByRole('button', { name: /Add Condition/i });
    await expect(addButton).toBeVisible({ timeout: 3000 });
    await addButton.click();

    // Wait for condition to be added (should see "1 condition" in footer)
    await expect(conditionsModal.getByText('1 condition')).toBeVisible({ timeout: 3000 });

    // Save the conditions
    const saveButton = conditionsModal.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Wait for conditions modal to close (the heading disappears)
    await expect(conditionsModalHeading).not.toBeVisible({ timeout: 5000 });

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    // Submit the policy form
    const submitButton = dialog.getByRole('button', { name: 'Create policy' });
    await submitButton.click();

    // Handle policy assertions dialog if it appears
    const createAnyway = adminPage.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear
    }

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify the policy was created with conditions
    const policy = await prisma.policy.findFirst({
      where: {
        description: { contains: 'network-condition' },
        organizationId: tenant.orgId,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(policy).toBeTruthy();
    expect(policy!.conditions).toBeTruthy();

    // Cleanup
    await prisma.policy.delete({ where: { id: policy!.id } });
  });

  test('should create policy with time condition', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    // Open create dialog
    const createButton = adminPage.getByRole('button', { name: 'Create policy' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill basic policy details
    const uniqueDesc = generateUniqueName(testInfo, 'time-condition');
    const descInput = dialog.getByRole('textbox', { name: 'Description' });
    await descInput.fill(uniqueDesc);

    // Select "Everyone" as matcher type
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Open the Conditions Modal
    const addConditionsButton = dialog.getByRole('button', { name: /Add Conditions/i });
    await addConditionsButton.click();

    // Wait for the conditions modal to appear (it has heading "Edit Conditions")
    const conditionsModalHeading = adminPage.getByRole('heading', { name: 'Edit Conditions' });
    await expect(conditionsModalHeading).toBeVisible({ timeout: 5000 });
    // Get the dialog that contains this heading
    const conditionsModal = adminPage.getByRole('dialog').filter({ has: conditionsModalHeading });

    // Wait for categories to load from API
    await adminPage.waitForTimeout(1000);

    // Time-based tab should be selected by default, wait for schema to load
    const selectButton = conditionsModal.getByRole('button', { name: 'Select' }).first();
    await expect(selectButton).toBeVisible({ timeout: 10000 });

    // Click Select on the first time field (Hour of day)
    await selectButton.click();
    await adminPage.waitForTimeout(300);

    // Fill in the value (e.g., 9 for 9 AM)
    const valueInput = conditionsModal.locator('input[type="text"], input[type="number"]').first();
    await expect(valueInput).toBeVisible({ timeout: 3000 });
    await valueInput.fill('9');

    // Add the condition
    const addButton = conditionsModal.getByRole('button', { name: /Add Condition/i });
    await expect(addButton).toBeVisible({ timeout: 3000 });
    await addButton.click();

    // Wait for condition to be added (should see "1 condition" in footer)
    await expect(conditionsModal.getByText('1 condition')).toBeVisible({ timeout: 3000 });

    // Save the conditions
    const saveButton = conditionsModal.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Wait for conditions modal to close (the heading disappears)
    await expect(conditionsModalHeading).not.toBeVisible({ timeout: 5000 });

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    // Submit the policy form
    const submitButton = dialog.getByRole('button', { name: 'Create policy' });
    await submitButton.click();

    // Handle policy assertions dialog if it appears
    const createAnyway = adminPage.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear
    }

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify the policy was created with conditions
    const policy = await prisma.policy.findFirst({
      where: {
        description: { contains: 'time-condition' },
        organizationId: tenant.orgId,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(policy).toBeTruthy();
    expect(policy!.conditions).toBeTruthy();

    // Cleanup
    await prisma.policy.delete({ where: { id: policy!.id } });
  });

  test('should update existing policy to add conditions', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    // Create a policy without conditions first
    const uniqueDesc = generateUniqueName(testInfo, 'add-conditions');
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

    // Find and edit the policy
    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const editButton = policyRow.getByRole('button', { name: 'Edit' });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open the Conditions Modal - it shows "Add Conditions" when no conditions exist
    const conditionsButton = dialog.getByRole('button', { name: /Conditions|Add Conditions/i });
    await conditionsButton.click();

    // Wait for the conditions modal to appear (it has heading "Edit Conditions")
    const conditionsModalHeading = adminPage.getByRole('heading', { name: 'Edit Conditions' });
    await expect(conditionsModalHeading).toBeVisible({ timeout: 5000 });
    // Get the dialog that contains this heading
    const conditionsModal = adminPage.getByRole('dialog').filter({ has: conditionsModalHeading });

    // Wait for categories to load from API
    await adminPage.waitForTimeout(1000);

    // Wait for schema to load
    const selectButton = conditionsModal.getByRole('button', { name: 'Select' }).first();
    await expect(selectButton).toBeVisible({ timeout: 10000 });

    // Click Select on a field
    await selectButton.click();
    await adminPage.waitForTimeout(300);

    // Add condition value
    const valueInput = conditionsModal.locator('input[type="text"], input[type="number"]').first();
    await expect(valueInput).toBeVisible({ timeout: 3000 });
    await valueInput.fill('9');

    // Add the condition
    const addButton = conditionsModal.getByRole('button', { name: /Add Condition/i });
    await expect(addButton).toBeVisible({ timeout: 3000 });
    await addButton.click();

    // Wait for condition to be added (should see "1 condition" in footer)
    await expect(conditionsModal.getByText('1 condition')).toBeVisible({ timeout: 3000 });

    // Save the conditions
    const saveButton = conditionsModal.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Wait for conditions modal to close (the heading disappears)
    await expect(conditionsModalHeading).not.toBeVisible({ timeout: 5000 });

    // Save changes
    const saveChangesButton = dialog.getByRole('button', { name: 'Save changes' });
    await saveChangesButton.click();

    // Handle policy assertions dialog if it appears
    const saveAnyway = adminPage.getByRole('button', { name: 'Save Anyway' });
    try {
      await saveAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await saveAnyway.click();
    } catch {
      // Assertions dialog didn't appear
    }

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify conditions were added
    const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(updatedPolicy!.conditions).toBeTruthy();

    // Cleanup
    await prisma.policy.delete({ where: { id: policy.id } });
  });

  test('should display existing conditions when editing policy', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    // Create a policy with conditions
    const uniqueDesc = generateUniqueName(testInfo, 'display-conditions');
    const policy = await prisma.policy.create({
      data: {
        description: uniqueDesc,
        slug: `test-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        organizationId: tenant.orgId,
        enabled: true,
        conditions: [
          {
            field: 'time.hourOfDay',
            operator: 'between',
            value: [9, 17],
          },
        ],
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    // Find and edit the policy
    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const editButton = policyRow.getByRole('button', { name: 'Edit' });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // The badge next to "Conditions" label should show the count
    // Look for the badge showing "1 condition"
    const conditionsBadge = dialog.getByText('1 condition');
    await expect(conditionsBadge).toBeVisible();

    // Open the conditions modal by clicking the "Edit conditions" button
    const editConditionsButton = dialog.getByRole('button', { name: 'Edit conditions' });
    await editConditionsButton.click();

    // Wait for the conditions modal to appear (it has heading "Edit Conditions")
    const conditionsModalHeading = adminPage.getByRole('heading', { name: 'Edit Conditions' });
    await expect(conditionsModalHeading).toBeVisible({ timeout: 5000 });
    // Get the dialog that contains this heading
    const conditionsModal = adminPage.getByRole('dialog').filter({ has: conditionsModalHeading });

    // Wait for conditions to load - the footer should show "1 condition"
    // First wait for the modal content to stabilize
    await adminPage.waitForTimeout(1000);

    // Verify condition count is displayed in footer (format: "1 condition")
    await expect(conditionsModal.getByText('1 condition')).toBeVisible({ timeout: 5000 });

    // Close modal
    const cancelButton = conditionsModal.getByRole('button', { name: 'Cancel' });
    await cancelButton.click();

    // Close dialog
    await adminPage.keyboard.press('Escape');

    // Cleanup
    await prisma.policy.delete({ where: { id: policy.id } });
  });

  test('should remove conditions from policy', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    // Create a policy with conditions
    const uniqueDesc = generateUniqueName(testInfo, 'remove-conditions');
    const policy = await prisma.policy.create({
      data: {
        description: uniqueDesc,
        slug: `test-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        organizationId: tenant.orgId,
        enabled: true,
        conditions: [
          {
            field: 'network.sourceIp',
            operator: 'inCidr',
            value: '192.168.0.0/16',
          },
        ],
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    // Find and edit the policy
    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const editButton = policyRow.getByRole('button', { name: 'Edit' });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open conditions modal
    const conditionsButton = dialog.getByRole('button', { name: /condition/i });
    await conditionsButton.click();

    // Wait for the conditions modal to appear (it has heading "Edit Conditions")
    const conditionsModalHeading = adminPage.getByRole('heading', { name: 'Edit Conditions' });
    await expect(conditionsModalHeading).toBeVisible({ timeout: 5000 });
    // Get the dialog that contains this heading
    const conditionsModal = adminPage.getByRole('dialog').filter({ has: conditionsModalHeading });

    // Wait for conditions to load
    await adminPage.waitForTimeout(1000);

    // Wait for conditions list to show the condition count
    await expect(conditionsModal.getByText('1 condition')).toBeVisible({ timeout: 5000 });

    // First click on the condition chip to select it, then click the Delete button
    // The condition chips are displayed as buttons/divs with role="option"
    const conditionChip = conditionsModal.locator('[role="option"]').first();
    await expect(conditionChip).toBeVisible({ timeout: 3000 });
    await conditionChip.click();

    // After selecting, the Delete button should appear in the toolbar
    const deleteButton = conditionsModal.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible({ timeout: 3000 });
    await deleteButton.click();

    // Save the conditions (now empty)
    const saveButton = conditionsModal.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Wait for conditions modal to close (the heading disappears)
    await expect(conditionsModalHeading).not.toBeVisible({ timeout: 5000 });

    // Save changes
    const saveChangesButton = dialog.getByRole('button', { name: 'Save changes' });
    await saveChangesButton.click();

    // Handle policy assertions dialog if it appears
    const saveAnyway = adminPage.getByRole('button', { name: 'Save Anyway' });
    try {
      await saveAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await saveAnyway.click();
    } catch {
      // Assertions dialog didn't appear
    }

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify conditions were removed
    const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });

    // Conditions should be null or empty array
    const conditions = updatedPolicy!.conditions;
    const hasNoConditions = !conditions || (Array.isArray(conditions) && conditions.length === 0);
    expect(hasNoConditions).toBe(true);

    // Cleanup
    await prisma.policy.delete({ where: { id: policy.id } });
  });

  test('should show condition count badge in form', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    // Create a policy with multiple conditions
    const uniqueDesc = generateUniqueName(testInfo, 'count-badge');
    const policy = await prisma.policy.create({
      data: {
        description: uniqueDesc,
        slug: `test-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        organizationId: tenant.orgId,
        enabled: true,
        conditions: [
          { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
          { field: 'time.dayOfWeek', operator: 'in', value: [1, 2, 3, 4, 5] },
        ],
      },
    });

    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    // Find and edit the policy
    const policyRow = adminPage.locator('tr').filter({ hasText: uniqueDesc });
    await expect(policyRow).toBeVisible({ timeout: 10000 });

    const editButton = policyRow.getByRole('button', { name: 'Edit' });
    await editButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify the badge shows "2 conditions" (not "2 active" as previously expected)
    await expect(dialog.getByText('2 conditions').first()).toBeVisible();

    // Close dialog
    await adminPage.keyboard.press('Escape');

    // Cleanup
    await prisma.policy.delete({ where: { id: policy.id } });
  });
});
