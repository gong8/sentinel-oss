/**
 * E2E Tests: Admin User Deletion
 * Tests soft delete, deletion impact preview, and restoration
 */

import { expect, navigateTo, test } from '../../../helpers/e2e-fixtures.js';

// Helper to get or create a non-admin role
async function getOrCreateTestRole(
  prisma: (typeof import('@sentinel/db'))['prisma'],
  orgId: string,
): Promise<{ id: string; created: boolean }> {
  const existingRole = await prisma.role.findFirst({
    where: { organizationId: orgId, isAdmin: false, deletedAt: null },
  });

  if (existingRole) {
    return { id: existingRole.id, created: false };
  }

  const newRole = await prisma.role.create({
    data: {
      name: `TestRole-${Date.now()}`,
      organizationId: orgId,
    },
  });
  return { id: newRole.id, created: true };
}

test.describe('Admin User Deletion', () => {
  test('should show confirmation dialog before deleting user', async ({ adminPage, tenant }) => {
    const { prisma } = await import('@sentinel/db');

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `delete-confirm-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        userRoles: { create: [{ roleId }] },
      },
    });

    try {
      await navigateTo(adminPage, '/admin/users');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      const userRow = adminPage.locator('tr').filter({ hasText: testUser.email });
      await expect(userRow).toBeVisible({ timeout: 5000 });

      const deleteButton = userRow.getByRole('button', { name: 'Delete' });
      await expect(deleteButton).toBeVisible();
      await deleteButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await expect(dialog.getByText('Delete user')).toBeVisible();
      await expect(dialog.getByText(testUser.email)).toBeVisible();

      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  test('should soft delete user and hide from main list', async ({ adminPage, tenant }) => {
    const { prisma } = await import('@sentinel/db');

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `soft-delete-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        userRoles: { create: [{ roleId }] },
      },
    });

    try {
      await navigateTo(adminPage, '/admin/users');
      await expect(adminPage.locator('table')).toContainText(testUser.email, { timeout: 15000 });

      const userRow = adminPage.locator('tr').filter({ hasText: testUser.email });
      const deleteButton = userRow.getByRole('button', { name: 'Delete' });
      await deleteButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const confirmDeleteButton = dialog.getByRole('button', { name: 'Delete' });
      await confirmDeleteButton.click();

      await expect(dialog).not.toBeVisible({ timeout: 5000 });

      await expect(adminPage.locator('table')).not.toContainText(testUser.email, {
        timeout: 10000,
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(deletedUser?.deletedAt).not.toBeNull();
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  test('should prevent admin from deleting themselves', async ({ adminPage, tenant }) => {
    const { prisma } = await import('@sentinel/db');

    // Fetch the admin user using tenant.adminId
    const admin = await prisma.user.findUnique({
      where: { id: tenant.adminId },
    });

    if (!admin) {
      throw new Error('Admin user not found - tenant.adminId should always exist');
    }

    await navigateTo(adminPage, '/admin/users');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

    const adminRow = adminPage.locator('tr').filter({ hasText: admin.email });
    await expect(adminRow).toBeVisible({ timeout: 5000 });

    const deleteButton = adminRow.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeDisabled();
  });

  test('should show deletion impact in confirmation dialog', async ({ adminPage, tenant }) => {
    const { prisma } = await import('@sentinel/db');

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `impact-test-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        userRoles: { create: [{ roleId }] },
      },
    });

    try {
      await navigateTo(adminPage, '/admin/users');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      const userRow = adminPage.locator('tr').filter({ hasText: testUser.email });
      await expect(userRow).toBeVisible({ timeout: 5000 });

      const deleteButton = userRow.getByRole('button', { name: 'Delete' });
      await deleteButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await expect(dialog.getByText(/soft delete/i)).toBeVisible();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  test('should show deleted users in deleted items page', async ({ adminPage, tenant }) => {
    const { prisma } = await import('@sentinel/db');

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `deleted-items-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        deletedAt: new Date(),
        deletedBy: tenant.adminId,
        userRoles: { create: [{ roleId }] },
      },
    });

    try {
      await navigateTo(adminPage, '/admin/deleted-items');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      await expect(adminPage.locator('table')).toContainText(testUser.email, { timeout: 5000 });

      const userRow = adminPage.locator('tr').filter({ hasText: testUser.email });
      await expect(userRow.getByText('User')).toBeVisible();
      await expect(userRow.getByRole('button', { name: 'Restore' })).toBeVisible();
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });

  test('should restore deleted user from deleted items', async ({ adminPage, tenant }) => {
    const { prisma } = await import('@sentinel/db');

    const { id: roleId, created: roleCreated } = await getOrCreateTestRole(prisma, tenant.orgId);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testUser = await prisma.user.create({
      data: {
        email: `restore-test-${uniqueSuffix}@test.com`,
        organizationId: tenant.orgId,
        deletedAt: new Date(),
        deletedBy: tenant.adminId,
        userRoles: { create: [{ roleId }] },
      },
    });

    try {
      await navigateTo(adminPage, '/admin/deleted-items');
      await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });

      const userRow = adminPage.locator('tr').filter({ hasText: testUser.email });
      await expect(userRow).toBeVisible({ timeout: 5000 });

      const restoreButton = userRow.getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.getByText('Restore User')).toBeVisible();
      await expect(dialog.getByText(testUser.email)).toBeVisible();

      const confirmRestoreButton = dialog.getByRole('button', { name: 'Restore' });
      await confirmRestoreButton.click();

      await expect(dialog).not.toBeVisible({ timeout: 5000 });

      // Wait for API to process and reload to ensure fresh data
      await adminPage.reload();
      await expect(adminPage.locator('body')).toBeVisible();

      // Verify user is no longer in deleted items (either table is gone or doesn't contain user)
      const table = adminPage.locator('table');
      const tableVisible = await table.isVisible().catch(() => false);
      if (tableVisible) {
        await expect(table).not.toContainText(testUser.email, { timeout: 5000 });
      }

      const restoredUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(restoredUser?.deletedAt).toBeNull();
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      if (roleCreated) {
        await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
      }
    }
  });
});
