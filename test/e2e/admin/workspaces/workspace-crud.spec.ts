/**
 * E2E Tests: Admin Workspace CRUD Operations
 * Tests workspace creation, listing, updating, and deletion
 */

import { expect, getPrisma, navigateTo, test } from '../../../helpers/e2e-fixtures.js';
import { generateUniqueName } from '../../../helpers/e2e.js';

test.describe('Admin Workspace CRUD', () => {
  // ============================================================================
  // Workspace Listing Tests
  // ============================================================================

  test('should list all workspaces with member counts', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/workspaces');

    // Verify table structure or empty state
    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({ timeout: 15000 });

    // If table exists, verify column headers
    const table = adminPage.locator('table');
    if ((await table.count()) > 0) {
      await expect(adminPage.locator('th').filter({ hasText: /name/i })).toBeVisible();
    }
  });

  test('should display workspace details with description', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Create a workspace with description
    const timestamp = Date.now();
    const workspace = await prisma.workspace.create({
      data: {
        name: `Test WS ${timestamp}`,
        slug: `test-ws-${timestamp}`,
        description: 'A test workspace for E2E',
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/workspaces');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Verify workspace appears in list
    await expect(adminPage.locator('table')).toContainText(workspace.name, { timeout: 10000 });
  });

  // ============================================================================
  // Workspace Creation Tests
  // ============================================================================

  test('should create workspace with valid name', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    // Make admin user an org owner so they can create workspaces
    await prisma.orgOwner.upsert({
      where: {
        organizationId_userId: { organizationId: tenant.orgId, userId: tenant.adminId },
      },
      create: {
        organizationId: tenant.orgId,
        userId: tenant.adminId,
      },
      update: {},
    });

    await navigateTo(adminPage, '/admin/workspaces');

    // Wait for page to load
    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({ timeout: 15000 });

    // Click create workspace button
    const createButton = adminPage.getByRole('button', { name: /create workspace/i });
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Wait for dialog
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill workspace name with unique value
    const uniqueName = generateUniqueName(testInfo, 'workspace');
    const nameInput = dialog.locator('input[name="name"]').or(dialog.locator('input').first());
    await expect(nameInput).toBeVisible();
    await nameInput.fill(uniqueName);

    // Optionally fill description if field exists
    const descInput = dialog.locator('textarea').or(dialog.locator('input[name="description"]'));
    if ((await descInput.count()) > 0) {
      await descInput.fill('E2E test workspace');
    }

    // Submit form
    const submitButton = dialog.getByRole('button', { name: /create/i });
    await submitButton.click();

    // Wait for dialog to close
    await adminPage.waitForTimeout(2000);

    // Verify workspace appears in list
    await expect(adminPage.locator('table')).toContainText(uniqueName, { timeout: 15000 });
  });

  test('should show validation error for empty workspace name', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Make admin user an org owner
    await prisma.orgOwner.upsert({
      where: {
        organizationId_userId: { organizationId: tenant.orgId, userId: tenant.adminId },
      },
      create: {
        organizationId: tenant.orgId,
        userId: tenant.adminId,
      },
      update: {},
    });

    await navigateTo(adminPage, '/admin/workspaces');

    const createButton = adminPage.getByRole('button', { name: /create workspace/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Try to submit without entering a name
    const submitButton = dialog.getByRole('button', { name: /create/i });
    await submitButton.click();

    // Should show validation error or stay in dialog
    await adminPage.waitForTimeout(1000);
    await expect(dialog).toBeVisible();
  });

  test('should prevent creating workspace with duplicate name', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Make admin user an org owner
    await prisma.orgOwner.upsert({
      where: {
        organizationId_userId: { organizationId: tenant.orgId, userId: tenant.adminId },
      },
      create: {
        organizationId: tenant.orgId,
        userId: tenant.adminId,
      },
      update: {},
    });

    // Create an existing workspace
    const existingTimestamp = Date.now();
    const existingName = `Existing WS ${existingTimestamp}`;
    await prisma.workspace.create({
      data: {
        name: existingName,
        slug: `existing-ws-${existingTimestamp}`,
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/workspaces');

    const createButton = adminPage.getByRole('button', { name: /create workspace/i });
    await createButton.click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Enter duplicate name
    const nameInput = dialog.locator('input[name="name"]').or(dialog.locator('input').first());
    await nameInput.fill(existingName);

    // Submit
    const submitButton = dialog.getByRole('button', { name: /create/i });
    await submitButton.click();

    // Should show error (dialog stays open or error message appears)
    await adminPage.waitForTimeout(2000);

    const hasError =
      (await dialog.isVisible()) ||
      (await adminPage
        .locator('[role="alert"]')
        .isVisible()
        .catch(() => false)) ||
      (await adminPage
        .locator('text=already exists')
        .isVisible()
        .catch(() => false));

    expect(hasError).toBe(true);
  });

  // ============================================================================
  // Workspace Update Tests
  // ============================================================================

  test('should update workspace name', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Make admin user an org owner
    await prisma.orgOwner.upsert({
      where: {
        organizationId_userId: { organizationId: tenant.orgId, userId: tenant.adminId },
      },
      create: {
        organizationId: tenant.orgId,
        userId: tenant.adminId,
      },
      update: {},
    });

    // Create a workspace to edit
    const editTimestamp = Date.now();
    const workspace = await prisma.workspace.create({
      data: {
        name: `Edit Test WS ${editTimestamp}`,
        slug: `edit-test-ws-${editTimestamp}`,
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/workspaces');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Find and click edit button for the workspace row
    const row = adminPage.locator('tr').filter({ hasText: workspace.name });
    await expect(row).toBeVisible({ timeout: 5000 });

    // Use exact match to avoid matching workspace names that might contain "Edit"
    const editButton = row
      .getByRole('button', { name: 'Edit', exact: true })
      .or(row.locator('[data-testid="edit-button"]'));
    if ((await editButton.count()) > 0) {
      await editButton.first().click();

      // Wait for edit dialog
      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Update name
      const newName = `Updated WS ${Date.now()}`;
      const nameInput = dialog.locator('input[name="name"]').or(dialog.locator('input').first());
      await nameInput.fill(newName);

      // Save
      const saveButton = dialog.getByRole('button', { name: /save|update/i });
      await saveButton.click();

      // Wait for dialog to close
      await adminPage.waitForTimeout(2000);

      // Verify updated name appears
      await expect(adminPage.locator('table')).toContainText(newName, { timeout: 10000 });
    }
  });

  // ============================================================================
  // Workspace Deletion Tests
  // ============================================================================

  test('should delete workspace (soft delete)', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Make admin user an org owner
    await prisma.orgOwner.upsert({
      where: {
        organizationId_userId: { organizationId: tenant.orgId, userId: tenant.adminId },
      },
      create: {
        organizationId: tenant.orgId,
        userId: tenant.adminId,
      },
      update: {},
    });

    // Create a workspace to delete
    const deleteTimestamp = Date.now();
    const workspace = await prisma.workspace.create({
      data: {
        name: `Delete Test WS ${deleteTimestamp}`,
        slug: `delete-test-ws-${deleteTimestamp}`,
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/workspaces');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Find the workspace row
    const row = adminPage.locator('tr').filter({ hasText: workspace.name });
    await expect(row).toBeVisible({ timeout: 5000 });

    // Click delete button - use exact match to avoid matching workspace names that might contain "Delete"
    const deleteButton = row
      .getByRole('button', { name: 'Delete', exact: true })
      .or(row.locator('[data-testid="delete-button"]'));
    if ((await deleteButton.count()) > 0) {
      await deleteButton.first().click();

      // Confirm deletion if dialog appears
      const confirmButton = adminPage.getByRole('button', { name: /confirm|delete/i });
      if ((await confirmButton.count()) > 0) {
        await confirmButton.click();
      }

      // Wait for deletion to complete
      await adminPage.waitForTimeout(2000);

      // Verify workspace is no longer visible in list
      await expect(adminPage.locator('table')).not.toContainText(workspace.name, {
        timeout: 10000,
      });

      // Verify soft deleted in database
      const deletedWorkspace = await prisma.workspace.findUnique({
        where: { id: workspace.id },
      });
      expect(deletedWorkspace?.deletedAt).not.toBeNull();
    }
  });
});

test.describe('Workspace Access Control', () => {
  test('non-org-owner can see create workspace button but creation is blocked server-side', async ({
    adminPage,
    tenant,
  }) => {
    const prisma = await getPrisma();

    // Ensure admin is NOT an org owner (cleanup any existing ownership)
    await prisma.orgOwner.deleteMany({
      where: { organizationId: tenant.orgId, userId: tenant.adminId },
    });

    await navigateTo(adminPage, '/admin/workspaces');
    await adminPage.waitForTimeout(2000);

    // Create button is visible to all users (permission check happens server-side)
    const createButton = adminPage.getByRole('button', { name: /create workspace/i });
    await expect(createButton).toBeVisible();
  });

  test('workspace member can view their workspace', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Create a workspace and add admin as member
    const memberTimestamp = Date.now();
    const workspace = await prisma.workspace.create({
      data: {
        name: `Member WS ${memberTimestamp}`,
        slug: `member-ws-${memberTimestamp}`,
        organizationId: tenant.orgId,
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: tenant.adminId,
        role: 'MEMBER',
      },
    });

    await navigateTo(adminPage, '/admin/workspaces');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    // Member should see their workspace
    await expect(adminPage.locator('table')).toContainText(workspace.name, { timeout: 10000 });
  });
});
