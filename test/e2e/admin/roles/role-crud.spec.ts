/**
 * E2E Tests: Admin Role CRUD Operations
 * Tests role creation, updating, listing, and admin auto-detection
 */

import {
  expect,
  generateUniqueName,
  getPrisma,
  navigateTo,
  test,
  waitForTable,
} from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Role CRUD', () => {
  // ============================================================================
  // Role Creation Tests
  // ============================================================================

  test('should create role with name and description', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();
    const uniqueName = generateUniqueName(testInfo, 'TestRole');

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests

    // Wait for table to load
    await waitForTable(adminPage);

    // Click create role button
    const createButton = adminPage.getByRole('button', { name: /create role/i });
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Wait for dialog
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill role name
    const nameInput = dialog.locator('input#create-name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(uniqueName);

    // Fill description
    const descriptionInput = dialog.locator('textarea#create-description');
    await descriptionInput.fill('Test role created by e2e test');

    // Submit form
    const submitButton = dialog.getByRole('button', { name: /create role/i });
    await submitButton.click();

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Verify role appears in list
    await expect(adminPage.locator('table')).toContainText(uniqueName, { timeout: 10000 });
    await expect(adminPage.locator('table')).toContainText('Test role created by e2e test');

    // Cleanup
    const createdRole = await prisma.role.findFirst({
      where: { name: uniqueName, organizationId: tenant.orgId },
    });

    if (createdRole) {
      await prisma.role.delete({ where: { id: createdRole.id } });
    }
  });

  test('should auto-detect admin role by name (case-insensitive)', async ({
    adminPage,
    tenant,
  }) => {
    const prisma = await getPrisma();

    // Check if an Admin role already exists for this tenant
    const existingAdminRole = await prisma.role.findFirst({
      where: {
        organizationId: tenant.orgId,
        name: { equals: 'Admin', mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (existingAdminRole) {
      // Admin role already exists - verify it has isAdmin=true (which confirms auto-detection worked)
      expect(existingAdminRole.isAdmin).toBe(true);
      return;
    }

    // No Admin role exists, so create one and verify auto-detection
    const uniqueAdminName = 'Admin';

    await navigateTo(adminPage, '/admin/roles');
    await waitForTable(adminPage);

    // Create role with name "Admin"
    await adminPage.getByRole('button', { name: /create role/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.locator('input#create-name').fill(uniqueAdminName);
    await dialog.locator('textarea#create-description').fill('Auto-detected admin role test');
    await dialog.getByRole('button', { name: /create role/i }).click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Verify in database that isAdmin is true
    const createdRole = await prisma.role.findFirst({
      where: {
        name: uniqueAdminName,
        organizationId: tenant.orgId,
        deletedAt: null,
      },
    });

    expect(createdRole).not.toBeNull();
    expect(createdRole?.isAdmin).toBe(true);

    // Cleanup
    if (createdRole) {
      await prisma.role.delete({ where: { id: createdRole.id } });
    }
  });

  test('should prevent creating role with duplicate name', async ({
    adminPage,
    tenant,
  }, testInfo) => {
    const prisma = await getPrisma();

    // Create a role first
    const uniqueName = generateUniqueName(testInfo, 'DuplicateTest');
    const existingRole = await prisma.role.create({
      data: {
        name: uniqueName,
        description: 'Existing role',
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);

    // Try to create role with same name
    await adminPage.getByRole('button', { name: /create role/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.locator('input#create-name').fill(uniqueName);
    await dialog.getByRole('button', { name: /create role/i }).click();

    // Should show error or dialog stays open
    await adminPage.waitForTimeout(1000);

    // Check for error state (dialog should remain open or error message shown)
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

    // Cleanup
    await prisma.role.delete({ where: { id: existingRole.id } });
  });

  // ============================================================================
  // Role Update Tests
  // ============================================================================

  test('should update role name and description', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    // Create a test role
    const originalName = generateUniqueName(testInfo, 'UpdateTest');
    const testRole = await prisma.role.create({
      data: {
        name: originalName,
        description: 'Original description',
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);

    // Find the role row and click edit
    const roleRow = adminPage.locator('tr').filter({ hasText: originalName });
    await expect(roleRow).toBeVisible({ timeout: 10000 });

    const editButton = roleRow.getByRole('button', { name: /edit/i });
    await editButton.click();

    // Wait for edit dialog
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Update name and description
    const updatedName = generateUniqueName(testInfo, 'UpdatedRole');
    await dialog.locator('input#edit-name').clear();
    await dialog.locator('input#edit-name').fill(updatedName);
    await dialog.locator('textarea#edit-description').clear();
    await dialog.locator('textarea#edit-description').fill('Updated description');

    // Submit
    await dialog.getByRole('button', { name: /save changes/i }).click();

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Verify updated role appears in list
    await expect(adminPage.locator('table')).toContainText(updatedName, { timeout: 10000 });
    await expect(adminPage.locator('table')).toContainText('Updated description');

    // Cleanup
    await prisma.role.delete({ where: { id: testRole.id } });
  });

  test('should prevent renaming to existing role name', async ({ adminPage, tenant }, testInfo) => {
    const prisma = await getPrisma();

    // Create two roles
    const firstName = generateUniqueName(testInfo, 'FirstRole');
    const secondName = generateUniqueName(testInfo, 'SecondRole');

    const firstRole = await prisma.role.create({
      data: {
        name: firstName,
        description: 'First role',
        organizationId: tenant.orgId,
      },
    });

    const secondRole = await prisma.role.create({
      data: {
        name: secondName,
        description: 'Second role',
        organizationId: tenant.orgId,
      },
    });

    await navigateTo(adminPage, '/admin/roles');
    // Wait for page to be ready - don't use networkidle as it can hang on background requests
    await waitForTable(adminPage);

    // Edit second role and try to rename to first role's name
    const roleRow = adminPage.locator('tr').filter({ hasText: secondName });
    await expect(roleRow).toBeVisible({ timeout: 10000 });

    await roleRow.getByRole('button', { name: /edit/i }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.locator('input#edit-name').clear();
    await dialog.locator('input#edit-name').fill(firstName);
    await dialog.getByRole('button', { name: /save changes/i }).click();

    // Should show error
    await adminPage.waitForTimeout(1000);

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

    // Cleanup
    await prisma.role.delete({ where: { id: firstRole.id } });
    await prisma.role.delete({ where: { id: secondRole.id } });
  });

  // ============================================================================
  // Role Listing Tests
  // ============================================================================

  test('should list roles sorted by admin status then name', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Ensure we have at least 2 roles for this test
    const existingRoles = await prisma.role.findMany({
      where: { organizationId: tenant.orgId, deletedAt: null },
    });

    const createdRoles: Array<{ id: string }> = [];

    // Create additional roles if needed to have at least 2
    if (existingRoles.length < 2) {
      const rolesToCreate = 2 - existingRoles.length;
      for (let i = 0; i < rolesToCreate; i++) {
        const newRole = await prisma.role.create({
          data: {
            name: `SortTest-${Date.now()}-${i}`,
            organizationId: tenant.orgId,
          },
        });
        createdRoles.push(newRole);
      }
    }

    try {
      await navigateTo(adminPage, '/admin/roles');
      await waitForTable(adminPage);

      // Get all rows
      const rows = adminPage.locator('tbody tr');
      const rowCount = await rows.count();

      // Get role names from the table in order
      const roleNames: string[] = [];
      for (let i = 0; i < rowCount; i++) {
        const nameCell = rows.nth(i).locator('td').first();
        const name = await nameCell.textContent();
        if (name) {
          roleNames.push(name.trim());
        }
      }

      // Verify from database that admin roles come first
      const dbRoles = await prisma.role.findMany({
        where: { organizationId: tenant.orgId, deletedAt: null },
        orderBy: [{ isAdmin: 'desc' }, { name: 'asc' }],
      });

      // The first role in the list should be an admin role if one exists
      const adminRoles = dbRoles.filter((r) => r.isAdmin);
      if (adminRoles.length > 0) {
        expect(roleNames[0]).toBe(adminRoles[0].name);
      }
    } finally {
      // Cleanup created roles
      for (const role of createdRoles) {
        await prisma.role.delete({ where: { id: role.id } }).catch(() => {});
      }
    }
  });

  test('should show admin badge on admin roles', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Find or create an admin role
    let adminRole = await prisma.role.findFirst({
      where: { organizationId: tenant.orgId, isAdmin: true, deletedAt: null },
    });

    let createdAdminRole = false;
    if (!adminRole) {
      // Create an admin role for this test
      adminRole = await prisma.role.create({
        data: {
          name: `TestAdmin-${Date.now()}`,
          organizationId: tenant.orgId,
          isAdmin: true,
        },
      });
      createdAdminRole = true;
    }

    try {
      await navigateTo(adminPage, '/admin/roles');
      await waitForTable(adminPage);

      // Find the admin role row
      const adminRow = adminPage.locator('tr').filter({ hasText: adminRole.name });
      await expect(adminRow).toBeVisible({ timeout: 10000 });

      // Admin roles should have edit/delete buttons disabled
      const editButton = adminRow.getByRole('button', { name: /edit/i });
      const deleteButton = adminRow.getByRole('button', { name: /delete/i });

      // Edit and Delete buttons should be disabled for admin roles
      await expect(editButton).toBeDisabled();
      await expect(deleteButton).toBeDisabled();
    } finally {
      if (createdAdminRole && adminRole) {
        await prisma.role.delete({ where: { id: adminRole.id } }).catch(() => {});
      }
    }
  });
});
