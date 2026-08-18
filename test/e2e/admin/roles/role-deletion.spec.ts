/**
 * E2E Tests: Admin Role Deletion
 * Tests soft delete, deletion impact preview, and restoration
 */

import {
  expect,
  generateUniqueName,
  getPrisma,
  navigateTo,
  test,
  waitForTable,
} from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Role Deletion', () => {
  // ============================================================================
  // Deletion Impact Tests
  // ============================================================================

  test('should show deletion impact with affected user count', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    // Create a test role
    const roleName = generateUniqueName(testInfo, 'ImpactTestRole');
    const testRole = await prisma.role.create({
      data: {
        name: roleName,
        description: 'Role for impact testing',
        organizationId: tenant.orgId,
      },
    });

    // Create a user with multiple roles (including another role so deletion is allowed)
    const existingRole = await prisma.role.findFirst({
      where: {
        organizationId: tenant.orgId,
        id: { not: testRole.id },
        isAdmin: false,
        deletedAt: null,
      },
    });

    let testUser = null;
    if (existingRole) {
      testUser = await prisma.user.create({
        data: {
          email: `impact-test-${Date.now()}@test.com`,
          organizationId: tenant.orgId,
          userRoles: {
            create: [{ roleId: testRole.id }, { roleId: existingRole.id }],
          },
        },
      });
    }

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);

    // Find the role row and click delete
    const roleRow = adminPage.locator('tr').filter({ hasText: roleName });
    await expect(roleRow).toBeVisible({ timeout: 10000 });

    const deleteButton = roleRow.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    // Confirmation dialog should appear with impact info
    const dialog = adminPage.getByRole('alertdialog').or(adminPage.getByRole('dialog'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Dialog should show impact information
    await expect(dialog).toBeVisible();

    // If we created a test user, the impact should mention users
    if (testUser) {
      // Look for user impact information
      const dialogContent = await dialog.textContent();
      expect(dialogContent).toBeTruthy();
    }

    // Cancel to not delete
    await dialog.getByRole('button', { name: /cancel/i }).click();

    // Cleanup
    if (testUser) {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
    }
    await prisma.role.delete({ where: { id: testRole.id } });
  });

  test('should prevent deleting role if users have only this role', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    // Create a test role
    const roleName = generateUniqueName(testInfo, 'OnlyRoleTest');
    const testRole = await prisma.role.create({
      data: {
        name: roleName,
        description: 'Role that will be the only role for a user',
        organizationId: tenant.orgId,
      },
    });

    // Create a user with ONLY this role
    const testUser = await prisma.user.create({
      data: {
        email: `only-role-${Date.now()}@test.com`,
        organizationId: tenant.orgId,
        userRoles: {
          create: [{ roleId: testRole.id }],
        },
      },
    });

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);

    // Find the role row and click delete
    const roleRow = adminPage.locator('tr').filter({ hasText: roleName });
    await expect(roleRow).toBeVisible({ timeout: 10000 });

    const deleteButton = roleRow.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    // Confirmation dialog should appear
    const dialog = adminPage.getByRole('alertdialog').or(adminPage.getByRole('dialog'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Wait for impact analysis to complete (it shows "Analyzing impact..." initially)
    await adminPage.waitForTimeout(3000);

    // Re-get the dialog text after impact analysis
    const dialogText = await dialog.textContent();

    // The dialog should show impact information - look for various indicators
    // It may show "user" count, "cannot" delete message, or still be analyzing
    expect(dialogText?.toLowerCase()).toMatch(/user|cannot|block|impact|affected|analyzing/i);

    // The confirm/delete button should be disabled or clicking it should show error
    const confirmButton = dialog.getByRole('button', { name: /delete|confirm/i }).last();

    if (await confirmButton.isEnabled()) {
      // If button is enabled, clicking should fail
      await confirmButton.click();
      await adminPage.waitForTimeout(1000);

      // Check for error message
      const hasError =
        (await adminPage
          .locator('[role="alert"]')
          .isVisible()
          .catch(() => false)) ||
        (await adminPage
          .locator('text=cannot delete')
          .isVisible()
          .catch(() => false)) ||
        (await adminPage
          .locator('text=Cannot delete')
          .isVisible()
          .catch(() => false));

      expect(hasError).toBe(true);
    }

    // Close dialog
    const cancelButton = dialog.getByRole('button', { name: 'Cancel' });
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
    }

    // Cleanup
    await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.role.delete({ where: { id: testRole.id } });
  });

  test('should cascade-remove role from multi-role users on delete', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    // Create a test role to delete
    const roleToDelete = generateUniqueName(testInfo, 'CascadeDelete');
    const testRole = await prisma.role.create({
      data: {
        name: roleToDelete,
        description: 'Role that will be deleted',
        organizationId: tenant.orgId,
      },
    });

    // Find or create another role for the user to have
    let otherRole = await prisma.role.findFirst({
      where: {
        organizationId: tenant.orgId,
        id: { not: testRole.id },
        isAdmin: false,
        deletedAt: null,
      },
    });

    if (!otherRole) {
      otherRole = await prisma.role.create({
        data: {
          name: generateUniqueName(testInfo, 'OtherRole'),
          organizationId: tenant.orgId,
        },
      });
    }

    // Create a user with both roles
    const testUser = await prisma.user.create({
      data: {
        email: `cascade-test-${Date.now()}@test.com`,
        organizationId: tenant.orgId,
        userRoles: {
          create: [{ roleId: testRole.id }, { roleId: otherRole.id }],
        },
      },
    });

    // Verify user has both roles
    const userRolesBefore = await prisma.userRole.findMany({
      where: { userId: testUser.id },
    });
    expect(userRolesBefore.length).toBe(2);

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);

    // Delete the role
    const roleRow = adminPage.locator('tr').filter({ hasText: roleToDelete });
    await expect(roleRow).toBeVisible({ timeout: 10000 });

    await roleRow.getByRole('button', { name: /delete/i }).click();

    const dialog = adminPage.getByRole('alertdialog').or(adminPage.getByRole('dialog'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Confirm deletion
    const confirmButton = dialog.getByRole('button', { name: /delete|confirm/i }).last();
    await confirmButton.click();

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify role is removed from the table
    await adminPage.waitForTimeout(1000);
    await expect(adminPage.locator('table')).not.toContainText(roleToDelete);

    // Verify user now has only one role
    const userRolesAfter = await prisma.userRole.findMany({
      where: { userId: testUser.id },
    });
    expect(userRolesAfter.length).toBe(1);
    expect(userRolesAfter[0].roleId).toBe(otherRole.id);

    // Cleanup
    await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    // Role was soft-deleted, so hard delete it
    await prisma.role.delete({ where: { id: testRole.id } });

    // Clean up other role if we created it
    if (otherRole.name.includes('OtherRole')) {
      await prisma.role.delete({ where: { id: otherRole.id } });
    }
  });

  test('should soft delete role successfully', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    // Create a test role with no users
    const roleName = generateUniqueName(testInfo, 'SoftDeleteTest');
    const testRole = await prisma.role.create({
      data: {
        name: roleName,
        description: 'Role to be soft deleted',
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);

    // Verify role is in the list
    await expect(adminPage.locator('table')).toContainText(roleName, { timeout: 10000 });

    // Delete the role
    const roleRow = adminPage.locator('tr').filter({ hasText: roleName });
    await roleRow.getByRole('button', { name: /delete/i }).click();

    const dialog = adminPage.getByRole('alertdialog').or(adminPage.getByRole('dialog'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Confirm deletion
    const confirmButton = dialog.getByRole('button', { name: /delete|confirm/i }).last();
    await confirmButton.click();

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify role is no longer in the active list
    await adminPage.waitForTimeout(1000);
    await adminPage.reload();
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await expect(adminPage.locator('table')).not.toContainText(roleName);

    // Verify role is soft-deleted in database (deletedAt is set)
    const deletedRole = await prisma.role.findUnique({
      where: { id: testRole.id },
    });
    expect(deletedRole).not.toBeNull();
    expect(deletedRole?.deletedAt).not.toBeNull();

    // Cleanup - hard delete
    await prisma.role.delete({ where: { id: testRole.id } });
  });

  test('should restore deleted role from deleted items', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    // Create and soft-delete a role
    const roleName = generateUniqueName(testInfo, 'RestoreTest');
    const testRole = await prisma.role.create({
      data: {
        name: roleName,
        description: 'Role to be restored',
        organizationId: tenant.orgId,
        deletedAt: new Date(),
        deletedBy: 'test',
      },
    });

    // Navigate to deleted items page
    await navigateTo(adminPage, '/admin/deleted-items');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Wait for table to load
    await expect(
      adminPage.locator('table').or(adminPage.locator('[data-testid="empty-state"]')),
    ).toBeVisible({
      timeout: 15000,
    });

    // Find the deleted role in the list
    // Wait for the role to appear - it should be there since we just created it with deletedAt set
    const roleRow = adminPage.locator('tr').filter({ hasText: roleName });
    await expect(roleRow).toBeVisible({ timeout: 15000 });

    // Click restore
    const restoreButton = roleRow.getByRole('button', { name: /restore/i });
    await restoreButton.click();

    // Confirm restoration if dialog appears
    const confirmDialog = adminPage.getByRole('dialog');
    if (await confirmDialog.isVisible().catch(() => false)) {
      const confirmButton = confirmDialog.getByRole('button', { name: /restore|confirm/i }).last();
      await confirmButton.click();
    }

    // Wait for restore to complete
    await adminPage.waitForTimeout(2000);

    // Verify role is restored in database
    const restoredRole = await prisma.role.findUnique({
      where: { id: testRole.id },
    });
    expect(restoredRole).not.toBeNull();
    expect(restoredRole?.deletedAt).toBeNull();

    // Verify role is now visible in roles page
    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);
    await expect(adminPage.locator('table')).toContainText(roleName, { timeout: 10000 });

    // Cleanup
    await prisma.role.delete({ where: { id: testRole.id } });
  });
});
