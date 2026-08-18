/**
 * E2E Tests: Admin Policy Deletion
 * Tests soft delete, deletion impact preview, and restoration
 */

import { expect, navigateTo, test, waitForTable } from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Policy Deletion', () => {
  test('should show delete confirmation dialog before deleting policy', async ({
    adminPage,
    tenant,
  }) => {
    const prisma = await import('@sentinel/db').then((m) => m.prisma);

    const policy = await prisma.policy.create({
      data: {
        description: `Delete Preview Policy ${Date.now()}`,
        slug: `delete-preview-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policies');
      await waitForTable(adminPage);

      const policyRow = adminPage.locator('tr').filter({ hasText: policy.description });
      await expect(policyRow).toBeVisible({ timeout: 10000 });

      const deleteButton = policyRow.getByRole('button', { name: 'Delete', exact: true });
      await deleteButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await expect(dialog.getByText('Delete policy')).toBeVisible();
      await expect(dialog.getByText(policy.description, { exact: false })).toBeVisible();

      const cancelButton = dialog.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();
      await expect(dialog).not.toBeVisible();

      await expect(policyRow).toBeVisible();
    } finally {
      await prisma.policy.delete({ where: { id: policy.id } });
    }
  });

  test('should soft delete policy when confirmed', async ({ adminPage, tenant }) => {
    const prisma = await import('@sentinel/db').then((m) => m.prisma);

    const policy = await prisma.policy.create({
      data: {
        description: `Soft Delete Policy ${Date.now()}`,
        slug: `soft-delete-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policies');
      await waitForTable(adminPage);

      const policyRow = adminPage.locator('tr').filter({ hasText: policy.description });
      await expect(policyRow).toBeVisible({ timeout: 10000 });

      const deleteButton = policyRow.getByRole('button', { name: 'Delete', exact: true });
      await deleteButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const confirmButton = dialog.getByRole('button', { name: 'Delete' });
      await confirmButton.click();

      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      const deletedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
      expect(deletedPolicy).toBeTruthy();
      expect(deletedPolicy!.deletedAt).not.toBeNull();

      await adminPage.reload();
      await waitForTable(adminPage);

      // Either the policy is not in the table OR the table doesn't exist (empty state)
      const hasTable = (await adminPage.locator('table').count()) > 0;
      if (hasTable) {
        await expect(adminPage.locator('table')).not.toContainText(policy.description);
      } else {
        // Empty state is fine - it means the policy is gone
        await expect(adminPage.getByText('No policies yet')).toBeVisible();
      }
    } finally {
      await prisma.policy.delete({ where: { id: policy.id } });
    }
  });

  test('should show deleted policy in deleted items page', async ({ adminPage, tenant }) => {
    const prisma = await import('@sentinel/db').then((m) => m.prisma);

    const policy = await prisma.policy.create({
      data: {
        description: `Deleted Items Test ${Date.now()}`,
        slug: `deleted-items-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: false,
        deletedAt: new Date(),
        deletedBy: tenant.adminId,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/deleted-items');
      await waitForTable(adminPage);

      const policyRow = adminPage.locator('tr').filter({ hasText: policy.description });
      await expect(policyRow).toBeVisible({ timeout: 10000 });

      await expect(policyRow.locator('td').first()).toContainText('Policy');
    } finally {
      await prisma.policy.delete({ where: { id: policy.id } });
    }
  });

  test('should restore deleted policy from deleted items page', async ({ adminPage, tenant }) => {
    const prisma = await import('@sentinel/db').then((m) => m.prisma);

    const policy = await prisma.policy.create({
      data: {
        description: `Restore Policy Test ${Date.now()}`,
        slug: `restore-policy-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: false,
        deletedAt: new Date(),
        deletedBy: tenant.adminId,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/deleted-items');
      await waitForTable(adminPage);

      const policyRow = adminPage.locator('tr').filter({ hasText: policy.description });
      await expect(policyRow).toBeVisible({ timeout: 10000 });

      const restoreButton = policyRow.getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      const dialog = adminPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.getByRole('heading', { name: 'Restore Policy' })).toBeVisible();

      const confirmButton = dialog.getByRole('button', { name: 'Restore' });
      await confirmButton.click();

      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      const restoredPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
      expect(restoredPolicy).toBeTruthy();
      expect(restoredPolicy!.deletedAt).toBeNull();
    } finally {
      await prisma.policy.delete({ where: { id: policy.id } });
    }
  });

  test('should allow enabling a restored policy', async ({ adminPage, tenant }) => {
    const prisma = await import('@sentinel/db').then((m) => m.prisma);

    const policy = await prisma.policy.create({
      data: {
        description: `Enable Restored Policy ${Date.now()}`,
        slug: `enable-restored-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*'],
        organizationId: tenant.orgId,
        enabled: false,
        deletedAt: null,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policies');
      await waitForTable(adminPage);

      const policyRow = adminPage.locator('tr').filter({ hasText: policy.description });
      await expect(policyRow).toBeVisible({ timeout: 10000 });

      const toggle = policyRow.locator('[role="switch"]');
      await expect(toggle).toBeVisible();

      const isChecked = await toggle.getAttribute('data-state');
      expect(isChecked).toBe('unchecked');

      await toggle.click();
      await adminPage.waitForTimeout(1000);

      const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
      expect(updatedPolicy!.enabled).toBe(true);
    } finally {
      await prisma.policy.delete({ where: { id: policy.id } });
    }
  });
});
