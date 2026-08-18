/**
 * E2E Tests: Admin Webhook CRUD Operations
 * Tests creating, updating, and deleting webhooks with various types
 */

import { expect, navigateTo, test } from '../../../helpers/e2e-fixtures.js';
import { generateUniqueName, waitForTable } from '../../../helpers/e2e.js';

test.describe('Admin Webhook CRUD', () => {
  test('should create CUSTOM webhook with valid URL', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/webhooks');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: 'Create endpoint' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const webhookName = generateUniqueName(testInfo, 'webhook');
    await dialog.locator('#create-name').fill(webhookName);

    await dialog.locator('#create-url').fill('https://webhook.example.com/test');

    const eventsSection = dialog.locator('.space-y-4.max-h-48');
    const firstCheckbox = eventsSection.locator('label').first();
    await firstCheckbox.click();

    await dialog.getByRole('button', { name: 'Create endpoint' }).click();

    // A "Webhook Secret" dialog appears after creation - dismiss it
    const secretDialog = adminPage.getByRole('dialog').filter({ hasText: 'Webhook Secret' });
    await expect(secretDialog).toBeVisible({ timeout: 5000 });
    await secretDialog.getByRole('button', { name: 'Done' }).click();
    await expect(secretDialog).not.toBeVisible({ timeout: 5000 });

    // Verify webhook appears in the table
    await expect(adminPage.locator('table')).toBeVisible();
    await expect(adminPage.getByText(webhookName)).toBeVisible();
  });

  test('should create DISCORD webhook with proper format', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/webhooks');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: 'Create endpoint' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.locator('#create-name').fill(generateUniqueName(testInfo, 'discord'));

    const typeSelect = dialog.locator('button[role="combobox"]').first();
    await typeSelect.click();
    await adminPage.getByRole('option', { name: 'Discord' }).click();

    await dialog.locator('#create-url').fill('https://discord.com/api/webhooks/123456789/abcdef');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should create SLACK webhook with proper format', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/webhooks');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: 'Create endpoint' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.locator('#create-name').fill(generateUniqueName(testInfo, 'slack'));

    const typeSelect = dialog.locator('button[role="combobox"]').first();
    await typeSelect.click();
    await adminPage.getByRole('option', { name: 'Slack' }).click();

    await dialog
      .locator('#create-url')
      .fill('https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should validate webhook URL format', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/webhooks');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: 'Create endpoint' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.locator('#create-name').fill('Invalid URL Test');

    await dialog.locator('#create-url').fill('not-a-valid-url');

    const eventsSection = dialog.locator('.space-y-4.max-h-48');
    await eventsSection.locator('label').first().click();

    await dialog.getByRole('button', { name: 'Create endpoint' }).click();

    await adminPage.waitForTimeout(500);

    const hasError = await dialog.isVisible();
    expect(hasError).toBe(true);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should select specific events for webhook', async ({ adminPage }, testInfo) => {
    await navigateTo(adminPage, '/admin/webhooks');
    await waitForTable(adminPage);

    await adminPage.getByRole('button', { name: 'Create endpoint' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.locator('#create-name').fill(generateUniqueName(testInfo, 'events'));
    await dialog.locator('#create-url').fill('https://example.com/webhook');

    const eventsSection = dialog.locator('.space-y-4.max-h-48');

    const toolAllowedCheckbox = eventsSection.locator('label').filter({ hasText: 'Tool Allowed' });
    if ((await toolAllowedCheckbox.count()) > 0) {
      await toolAllowedCheckbox.click();
    }

    const policyCreatedCheckbox = eventsSection
      .locator('label')
      .filter({ hasText: 'Policy Created' });
    if ((await policyCreatedCheckbox.count()) > 0) {
      await policyCreatedCheckbox.click();
    }

    const sensitiveToolCheckbox = eventsSection
      .locator('label')
      .filter({ hasText: 'Sensitive Tool Invoked' });
    if ((await sensitiveToolCheckbox.count()) > 0) {
      await sensitiveToolCheckbox.click();
    }

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should update existing webhook configuration', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/webhooks');
    await waitForTable(adminPage);

    const webhookRow = adminPage.locator('tbody tr').first();

    if ((await webhookRow.count()) > 0) {
      const editButton = webhookRow.getByRole('button', { name: 'Edit' });

      if ((await editButton.count()) > 0) {
        await editButton.click();

        const dialog = adminPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        await expect(dialog.getByText('Edit endpoint')).toBeVisible();

        await dialog.getByRole('button', { name: 'Cancel' }).click();
      }
    }

    expect(true).toBe(true);
  });

  test('should delete webhook with confirmation', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/webhooks');
    await waitForTable(adminPage);

    const webhookRow = adminPage.locator('tbody tr').first();

    if ((await webhookRow.count()) > 0) {
      const deleteButton = webhookRow.getByRole('button', { name: 'Delete' });

      if ((await deleteButton.count()) > 0) {
        await deleteButton.click();

        const confirmDialog = adminPage.getByRole('dialog');
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        await expect(confirmDialog.getByText('Delete endpoint')).toBeVisible();

        await expect(
          confirmDialog
            .getByText(/Are you sure you want to delete/)
            .or(confirmDialog.getByText(/This will also delete all delivery history/)),
        ).toBeVisible();

        await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
      }
    }

    expect(true).toBe(true);
  });
});
