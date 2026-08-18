/**
 * E2E Tests: Admin Policy Matchers
 * Tests different matcher types: everyone (*), role, user, agent
 */

import {
  expect,
  navigateTo,
  selectAllToolsInPolicyForm,
  test,
} from '../../../helpers/e2e-fixtures.js';
import { generateUniqueName, waitForTable } from '../../../helpers/e2e.js';

test.describe('Admin Policy Matchers', () => {
  test('should create policy with everyone matcher', async ({
    adminPage,
    tenant: _tenant,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: /create policy/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'everyone-matcher');
    await dialog.getByRole('textbox', { name: 'Description' }).fill(uniqueDesc);

    // Matcher type dropdown shows "Role" by default
    const matcherTypeDropdown = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeDropdown.click();
    await adminPage.getByRole('option', { name: 'Everyone' }).click();

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    await dialog.getByRole('button', { name: /create policy/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.locator('table').getByText(uniqueDesc)).toBeVisible({ timeout: 5000 });
  });

  test('should create policy with role matcher', async ({
    adminPage,
    tenant: _tenant,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: /create policy/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'role-matcher');
    await dialog.getByRole('textbox', { name: 'Description' }).fill(uniqueDesc);

    // Default is already "Role", so we just need to select a role value
    // The matcher type combobox shows "Role" by default
    const matcherTypeDropdown = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await expect(matcherTypeDropdown).toBeVisible();

    // Matcher value dropdown shows "Select role" placeholder
    const matcherValueDropdown = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select role|All roles/ });
    await matcherValueDropdown.click();
    const roleOptions = adminPage.locator('[role="option"]');
    const roleCount = await roleOptions.count();
    if (roleCount > 0) {
      await roleOptions.first().click();
    }

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    await dialog.getByRole('button', { name: /create policy/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.locator('table').getByText(uniqueDesc)).toBeVisible({ timeout: 5000 });
  });

  test('should create policy with user matcher', async ({
    adminPage,
    tenant: _tenant,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: /create policy/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'user-matcher');
    await dialog.getByRole('textbox', { name: 'Description' }).fill(uniqueDesc);

    // Matcher type dropdown shows "Role" by default, select "User"
    const matcherTypeDropdown = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeDropdown.click();
    await adminPage.getByRole('option', { name: 'User' }).click();

    // After selecting User, the value dropdown shows "Select user"
    const matcherValueDropdown = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select user|All users/ });
    await matcherValueDropdown.click();
    const userOptions = adminPage.locator('[role="option"]');
    const userCount = await userOptions.count();
    if (userCount > 0) {
      await userOptions.first().click();
    }

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    await dialog.getByRole('button', { name: /create policy/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.locator('table').getByText(uniqueDesc)).toBeVisible({ timeout: 5000 });
  });

  test('should create policy with agent matcher', async ({
    adminPage,
    tenant: _tenant,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: /create policy/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'agent-matcher');
    await dialog.getByRole('textbox', { name: 'Description' }).fill(uniqueDesc);

    // Matcher type dropdown shows "Role" by default, select "Agent"
    const matcherTypeDropdown = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeDropdown.click();
    await adminPage.getByRole('option', { name: 'Agent' }).click();

    // After selecting Agent, the value dropdown shows "Select agent"
    const matcherValueDropdown = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select agent|All agents/ });
    await matcherValueDropdown.click();
    const agentOptions = adminPage.locator('[role="option"]');
    const agentCount = await agentOptions.count();
    if (agentCount > 0) {
      await agentOptions.first().click();
    } else {
      // Fallback to Everyone if no agents
      await adminPage.keyboard.press('Escape');
      // Matcher type now shows "Agent", need to find it
      const agentTypeDropdown = dialog.getByRole('combobox').filter({ hasText: 'Agent' });
      await agentTypeDropdown.click();
      await adminPage.getByRole('option', { name: 'Everyone' }).click();
    }

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    await dialog.getByRole('button', { name: /create policy/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.locator('table').getByText(uniqueDesc)).toBeVisible({ timeout: 5000 });
  });

  test('should create policy with multiple matchers', async ({
    adminPage,
    tenant: _tenant,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: /create policy/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'multi-matcher');
    await dialog.getByRole('textbox', { name: 'Description' }).fill(uniqueDesc);

    // First matcher: select a role value (type is already "Role" by default)
    const matcherValueDropdown = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select role|All roles/ });
    await matcherValueDropdown.click();
    const roleOptions = adminPage.locator('[role="option"]');
    if ((await roleOptions.count()) > 0) {
      await roleOptions.first().click();
    }

    await dialog.getByRole('button', { name: /add matcher/i }).click();
    await adminPage.waitForTimeout(300);

    // Second matcher: the new matcher also defaults to "Role"
    // Find all matcher type dropdowns showing "Role" and get the second one
    const matcherTypeDropdowns = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    const secondMatcherType = matcherTypeDropdowns.nth(1);
    await secondMatcherType.click();
    await adminPage.getByRole('option', { name: 'User' }).click();

    // Second matcher value: now shows "Select user"
    const secondMatcherValue = dialog
      .getByRole('combobox')
      .filter({ hasText: /Select user|All users/ });
    await secondMatcherValue.click();
    const userOptions = adminPage.locator('[role="option"]');
    if ((await userOptions.count()) > 0) {
      await userOptions.first().click();
    }

    // Select tools (required)
    await selectAllToolsInPolicyForm(adminPage);

    await dialog.getByRole('button', { name: /create policy/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.locator('table').getByText(uniqueDesc)).toBeVisible({ timeout: 5000 });
  });

  test('should remove a matcher when multiple exist', async ({
    adminPage,
    tenant: _tenant,
  }, testInfo) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: /create policy/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const uniqueDesc = generateUniqueName(testInfo, 'remove-matcher');
    await dialog.getByRole('textbox', { name: 'Description' }).fill(uniqueDesc);

    await dialog.getByRole('button', { name: /add matcher/i }).click();

    // Wait for the new matcher to appear
    await adminPage.waitForTimeout(500);

    const removeButtons = dialog.getByRole('button', { name: /remove matcher/i });
    const removeCount = await removeButtons.count();
    expect(removeCount).toBeGreaterThan(0);

    await removeButtons.first().click();

    // Wait for the matcher to be removed from the UI
    await adminPage.waitForTimeout(500);

    const remainingRemoveButtons = dialog.getByRole('button', { name: /remove matcher/i });
    const newCount = await remainingRemoveButtons.count();
    // After removing one matcher, count should decrease (or be 0 if last matcher was removed)
    expect(newCount).toBeLessThan(removeCount);

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('should show matcher type options correctly', async ({ adminPage, tenant: _tenant }) => {
    await navigateTo(adminPage, '/admin/policies');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: /create policy/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Matcher type dropdown shows "Role" by default
    const matcherTypeDropdown = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeDropdown.click();

    await expect(adminPage.getByRole('option', { name: 'Everyone' })).toBeVisible();
    await expect(adminPage.getByRole('option', { name: 'Role' })).toBeVisible();
    await expect(adminPage.getByRole('option', { name: 'User' })).toBeVisible();
    await expect(adminPage.getByRole('option', { name: 'Agent' })).toBeVisible();

    await adminPage.keyboard.press('Escape');
    await dialog.getByRole('button', { name: /cancel/i }).click();
  });
});
