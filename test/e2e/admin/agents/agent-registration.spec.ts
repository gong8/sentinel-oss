/**
 * E2E Tests: Admin Agent Registration
 * Tests creating and managing agents
 */

import {
  expect,
  generateUniqueName,
  navigateTo,
  test,
  waitForTable,
} from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Agent Registration', () => {
  test('should open create agent dialog', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/agents');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: 'Create agent' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog.getByText('Give the agent a friendly name.')).toBeVisible();

    const nameInput = dialog.locator('input#agent-name');
    await expect(nameInput).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('should create agent with name', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/agents');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: 'Create agent' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const agentName = generateUniqueName(testInfo, 'agent');
    const nameInput = dialog.locator('input#agent-name');
    await nameInput.fill(agentName);

    await dialog.getByRole('button', { name: 'Create agent' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(adminPage.getByText(agentName)).toBeVisible({ timeout: 5000 });
  });

  test('should validate agent name is required', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/agents');
    await waitForTable(adminPage);

    const createButton = adminPage.getByRole('button', { name: 'Create agent' });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.locator('input#agent-name');
    await nameInput.fill('a');
    await nameInput.clear();

    await dialog.getByRole('button', { name: 'Create agent' }).click();

    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should list agents with correct table structure', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/agents');
    await waitForTable(adminPage);

    const tableOrEmpty = adminPage.locator('table').or(adminPage.getByText('No agents yet'));
    await expect(tableOrEmpty).toBeVisible({ timeout: 15000 });

    const table = adminPage.locator('table');
    if ((await table.count()) > 0) {
      await expect(adminPage.locator('th').filter({ hasText: 'Name' })).toBeVisible();
      await expect(adminPage.locator('th').filter({ hasText: 'Verification' })).toBeVisible();
      await expect(adminPage.locator('th').filter({ hasText: 'Created' })).toBeVisible();
      await expect(adminPage.locator('th').filter({ hasText: 'Actions' })).toBeVisible();

      const agentRows = adminPage.locator('tbody tr');
      if ((await agentRows.count()) > 0) {
        const firstRow = agentRows.first();

        const nameCell = firstRow.locator('td').first();
        await expect(nameCell).toBeVisible();

        const deleteButton = firstRow.getByRole('button', { name: 'Delete' });
        await expect(deleteButton).toBeVisible();
      }
    }
  });

  test('should show empty state when no agents exist', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/agents');
    await waitForTable(adminPage);

    const emptyState = adminPage.getByText('No agents yet');
    const table = adminPage.locator('table');

    const hasTable = (await table.count()) > 0;
    const hasEmptyState = (await emptyState.count()) > 0;

    expect(hasTable || hasEmptyState).toBe(true);

    if (hasEmptyState) {
      await expect(
        adminPage.getByText('Create an agent to start recording activity.'),
      ).toBeVisible();
    }
  });
});
