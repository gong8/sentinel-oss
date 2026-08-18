/**
 * E2E Tests: Policy Enforcement Flow
 * Tests policy enforcement in the UI using tenant isolation
 */

import { expect, navigateTo, selectAllToolsInPolicyForm, test } from '../helpers/e2e-fixtures.js';

test.describe('Policy Enforcement Flow', () => {
  test('should create and enable policy', async ({ adminPage }, testInfo) => {
    // Navigate to policies page
    await navigateTo(adminPage, '/admin/policies');

    // Wait for table to load
    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({
      timeout: 10000,
    });
    // Click create policy button
    await adminPage.click('button:has-text("Create policy")');

    // Wait for dialog to open and input to be visible
    await expect(adminPage.getByRole('dialog')).toBeVisible();
    await expect(adminPage.locator('input#create-description')).toBeVisible();

    // Fill in policy form (use worker index + timestamp for uniqueness in parallel runs)
    await adminPage.fill(
      'input#create-description',
      `E2E Test Policy W${testInfo.parallelIndex}-${Date.now()}`,
    );

    // Select matcher type: Everyone (applies to all users)
    // The matcher selector is a Radix Select component with role="combobox"
    // Default matcher type is "Role", so we need to change it to "Everyone"
    const dialog = adminPage.getByRole('dialog');
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Select effect: DENY (Effect combobox shows "ALLOW" by default)
    const effectCombobox = dialog.getByRole('combobox').filter({ hasText: 'ALLOW' });
    await effectCombobox.click();
    await adminPage.getByRole('option', { name: 'DENY' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    // Submit form
    await adminPage.click('button[type="submit"]:has-text("Create policy")');

    // Handle policy assertions dialog if it appears
    // Wait a moment for either the dialog to close or the assertions dialog to appear
    const createAnyway = adminPage.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear, policy was created directly
    }

    // Wait for all dialogs to close
    await expect(adminPage.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Should see the new policy in the table (check for prefix since full name includes timestamp)
    await expect(adminPage.locator('table')).toContainText('E2E Test Policy');
    await expect(adminPage.locator('table')).toContainText('DENY');
  });

  test('should list policies', async ({ adminPage }, testInfo) => {
    // Navigate to policies page first
    await navigateTo(adminPage, '/admin/policies');

    // First create a policy so we have something to list
    await adminPage.click('button:has-text("Create policy")');

    // Wait for dialog to open and input to be visible
    await expect(adminPage.getByRole('dialog')).toBeVisible();
    await expect(adminPage.locator('input#create-description')).toBeVisible();

    await adminPage.fill(
      'input#create-description',
      `List Policy W${testInfo.parallelIndex}-${Date.now()}`,
    );

    // Select matcher type: Everyone (required for form submission)
    // Default matcher type is "Role", so we need to change it to "Everyone"
    const dialog = adminPage.getByRole('dialog');
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    await adminPage.click('button[type="submit"]:has-text("Create policy")');

    // Handle policy assertions dialog if it appears
    const createAnyway = adminPage.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear, policy was created directly
    }

    // Wait for dialog to close
    await expect(adminPage.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Wait for table to appear with the new policy
    await expect(adminPage.locator('table')).toBeVisible();

    // Should see policies table with correct headers
    await expect(adminPage.locator('th:has-text("Description")')).toBeVisible();
    await expect(adminPage.locator('th:has-text("Effect")')).toBeVisible();
    await expect(adminPage.locator('th:has-text("Status")')).toBeVisible();

    // Verify table has at least one policy row
    const tableBody = adminPage.locator('tbody');
    await expect(tableBody.locator('tr').first()).toBeVisible();

    // Verify the table contains policy effect indicators (either ALLOW or DENY)
    await expect(
      adminPage
        .locator('table')
        .locator('text=ALLOW')
        .or(adminPage.locator('table').locator('text=DENY'))
        .first(),
    ).toBeVisible();
  });

  test('should toggle policy enabled/disabled', async ({ adminPage }, testInfo) => {
    // Navigate to policies page first
    await navigateTo(adminPage, '/admin/policies');

    // First create a policy so we have something to toggle
    await adminPage.click('button:has-text("Create policy")');

    // Wait for dialog to open and input to be visible
    await expect(adminPage.getByRole('dialog')).toBeVisible();
    await expect(adminPage.locator('input#create-description')).toBeVisible();

    await adminPage.fill(
      'input#create-description',
      `Toggle Policy W${testInfo.parallelIndex}-${Date.now()}`,
    );

    // Select matcher type: Everyone (required for form submission)
    // Default matcher type is "Role", so we need to change it to "Everyone"
    const dialog = adminPage.getByRole('dialog');
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    await adminPage.click('button[type="submit"]:has-text("Create policy")');

    // Handle policy assertions dialog if it appears
    const createAnyway = adminPage.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear, policy was created directly
    }

    // Wait for dialog to close and table to appear with the new policy
    await expect(adminPage.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
    await expect(adminPage.locator('table')).toBeVisible();
    await expect(adminPage.locator('table')).toContainText('Toggle Policy');

    // Find a policy and toggle it
    // Using the first switch in the table
    const toggle = adminPage.locator('button[role="switch"]').first();

    // Ensure element is ready
    await expect(toggle).toBeVisible();

    const initialState = await toggle.getAttribute('aria-checked');
    const expectedState = initialState === 'true' ? 'false' : 'true';

    await toggle.click();

    // State should change
    // Use await expect to wait for the attribute to update
    await expect(toggle).toHaveAttribute('aria-checked', expectedState);
  });
});
