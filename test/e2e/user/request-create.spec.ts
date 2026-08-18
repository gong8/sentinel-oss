/**
 * E2E Tests: User Request Creation
 * Tests creating tool access and MCP server requests
 */

import { expect, navigateTo, test } from '../../helpers/e2e-fixtures.js';

test.describe('User Request Creation', () => {
  test('should open tool request dialog with correct elements', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');

    const requestButton = userPage.getByRole('button', { name: 'Request Tool Access' });
    await expect(requestButton).toBeVisible({ timeout: 15000 });
    await requestButton.click();

    const dialog = userPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('heading', { name: 'Request Tool Access' })).toBeVisible();

    const serverTrigger = dialog.getByRole('combobox').first();
    await expect(serverTrigger).toBeVisible();

    const reasonTextarea = dialog.locator('#reason');
    await expect(reasonTextarea).toBeVisible();

    const addMoreButton = dialog.getByRole('button', { name: 'Add more' });
    await expect(addMoreButton).toBeVisible();

    const submitButton = dialog.getByRole('button', { name: 'Submit Request' });
    await expect(submitButton).toBeVisible();

    const cancelButton = dialog.getByRole('button', { name: 'Cancel' });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(dialog).not.toBeVisible();
  });

  test('should allow adding multiple tool selection rows', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');

    const requestButton = userPage.getByRole('button', { name: 'Request Tool Access' });
    await expect(requestButton).toBeVisible({ timeout: 15000 });
    await requestButton.click();

    const dialog = userPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const comboboxesBefore = dialog.getByRole('combobox');
    const countBefore = await comboboxesBefore.count();

    const addMoreButton = dialog.getByRole('button', { name: 'Add more' });
    await addMoreButton.click();

    const comboboxesAfter = dialog.getByRole('combobox');
    const countAfter = await comboboxesAfter.count();

    expect(countAfter).toBeGreaterThan(countBefore);

    const removeButtons = dialog.locator('button[aria-label="Remove tool request"]');
    await expect(removeButtons.first()).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should validate reason field minimum length', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');

    const requestButton = userPage.getByRole('button', { name: 'Request Tool Access' });
    await requestButton.click();

    const dialog = userPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const reasonTextarea = dialog.locator('#reason');
    await reasonTextarea.fill('short');

    const submitButton = dialog.getByRole('button', { name: 'Submit Request' });
    await submitButton.click();

    await userPage.waitForTimeout(500);
    const dialogStillOpen = await dialog.isVisible();
    expect(dialogStillOpen).toBe(true);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should open MCP server request dialog with correct elements', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');

    const mcpRequestButton = userPage.getByRole('button', { name: 'Request New MCP Server' });
    await expect(mcpRequestButton).toBeVisible({ timeout: 15000 });
    await mcpRequestButton.click();

    const dialog = userPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('heading', { name: 'Request New MCP Server' })).toBeVisible();

    const nameInput = dialog.locator('#name');
    await expect(nameInput).toBeVisible();

    const urlInput = dialog.locator('#url');
    await expect(urlInput).toBeVisible();

    const reasonTextarea = dialog.locator('#mcpReason');
    await expect(reasonTextarea).toBeVisible();

    const submitButton = dialog.getByRole('button', { name: 'Submit Request' });
    await expect(submitButton).toBeVisible();

    const cancelButton = dialog.getByRole('button', { name: 'Cancel' });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(dialog).not.toBeVisible();
  });

  test('should fill MCP server request form', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');

    const mcpRequestButton = userPage.getByRole('button', { name: 'Request New MCP Server' });
    await mcpRequestButton.click();

    const dialog = userPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.locator('#name');
    await nameInput.fill('Test MCP Server');

    const urlInput = dialog.locator('#url');
    await urlInput.fill('https://example.com/mcp');

    await userPage.waitForTimeout(1000);

    const detectingText = dialog.getByText('Detecting auth type...');
    const detectedText = dialog.getByText(/Detected:/);
    const detectionFailedText = dialog.getByText(/Detection failed:/);

    const hasDetectionIndicator =
      (await detectingText.isVisible().catch(() => false)) ||
      (await detectedText.isVisible().catch(() => false)) ||
      (await detectionFailedText.isVisible().catch(() => false));

    expect(hasDetectionIndicator).toBe(true);

    const reasonTextarea = dialog.locator('#mcpReason');
    await reasonTextarea.fill('This server provides useful tools for our team.');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('should validate server URL format', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');

    const mcpRequestButton = userPage.getByRole('button', { name: 'Request New MCP Server' });
    await mcpRequestButton.click();

    const dialog = userPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.locator('#name');
    await nameInput.fill('Test Server');

    const urlInput = dialog.locator('#url');
    await urlInput.fill('not-a-valid-url');

    const reasonTextarea = dialog.locator('#mcpReason');
    await reasonTextarea.fill('Testing URL validation behavior.');

    const submitButton = dialog.getByRole('button', { name: 'Submit Request' });
    await submitButton.click();

    await userPage.waitForTimeout(500);

    const urlError = dialog.getByText('Invalid URL');
    const hasUrlError = await urlError.isVisible().catch(() => false);
    const dialogStillOpen = await dialog.isVisible();

    expect(hasUrlError || dialogStillOpen).toBe(true);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should show request history card', async ({ userPage }) => {
    await navigateTo(userPage, '/user/requests');

    const historyCard = userPage.getByRole('heading', { name: 'Request history' });
    await expect(historyCard).toBeVisible({ timeout: 15000 });

    const historyDescription = userPage.getByText(
      'Track all requests submitted from your account.',
    );
    await expect(historyDescription).toBeVisible();
  });
});
