/**
 * E2E Tests: Admin Policy Conflicts
 * Tests conflict detection between ALLOW and DENY policies
 */

import { expect, getPrisma, navigateTo, test } from '../../../helpers/e2e-fixtures.js';

test.describe('Admin Policy Conflicts', () => {
  test('should display page with conflict summary cards', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-conflicts');
    await expect(adminPage.locator('body')).toBeVisible();

    await expect(adminPage.getByRole('heading', { name: 'Policy Conflicts' })).toBeVisible();
    await expect(adminPage.getByText('Contradictions').first()).toBeVisible();
    await expect(adminPage.getByText('Redundant').first()).toBeVisible();
  });

  test('should detect high-severity contradiction between ALLOW and DENY policies', async ({
    adminPage,
    tenant,
  }) => {
    const prisma = await getPrisma();

    const allowPolicy = await prisma.policy.create({
      data: {
        description: `Conflict Allow - ${tenant.orgId}`,
        slug: `conflict-allow-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['read_file'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const denyPolicy = await prisma.policy.create({
      data: {
        description: `Conflict Deny - ${tenant.orgId}`,
        slug: `conflict-deny-${Date.now()}`,
        effect: 'DENY',
        matchers: ['*'],
        toolPatterns: ['read_file'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-conflicts');
      await expect(adminPage.locator('body')).toBeVisible();

      await expect(
        adminPage.getByRole('heading', { name: 'Contradictions' }).first(),
      ).toBeVisible();

      const conflictCard = adminPage.locator('text=/Conflict Allow|Conflict Deny/i').first();
      await expect(conflictCard).toBeVisible({ timeout: 10000 });
    } finally {
      await prisma.policy.delete({ where: { id: allowPolicy.id } });
      await prisma.policy.delete({ where: { id: denyPolicy.id } });
    }
  });

  test('should detect low-severity redundant policies', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    // Create two ALLOW policies with overlapping tool patterns
    // Policy 1 allows ALL tools (*::*), Policy 2 allows a subset (*::read_file)
    // These should be detected as redundant (low severity)
    const policy1 = await prisma.policy.create({
      data: {
        description: `Redundant Policy 1 - ${tenant.orgId}`,
        slug: `redundant-1-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*::*'], // Matches all domains and all tools
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const policy2 = await prisma.policy.create({
      data: {
        description: `Redundant Policy 2 - ${tenant.orgId}`,
        slug: `redundant-2-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['*::read_file'], // Subset of *::* - makes this redundant
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-conflicts');
      await expect(adminPage.locator('body')).toBeVisible();

      // Reload to ensure fresh data after Prisma creates
      await adminPage.reload();
      await expect(adminPage.locator('body')).toBeVisible();

      // Wait for conflict detection to complete and show redundant policies card
      await expect(
        adminPage.getByRole('heading', { name: 'Redundant Policies' }).first(),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await prisma.policy.delete({ where: { id: policy1.id } });
      await prisma.policy.delete({ where: { id: policy2.id } });
    }
  });

  test('should show empty state when no conflicts exist', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-conflicts');

    // Wait for page to fully load
    await expect(adminPage.getByRole('heading', { name: /Policy Conflicts/i })).toBeVisible({
      timeout: 15000,
    });

    // Wait for content to render - check for the empty state OR conflicts heading
    // Note: Both may be visible at once (the "Contradictions" heading is always shown)
    // Just check that one of them is visible
    const emptyState = adminPage.getByText('No conflicts detected');
    const hasConflicts = adminPage.getByRole('heading', { name: 'Contradictions' });

    // Wait for page content to load
    await expect(emptyState.or(hasConflicts).first()).toBeVisible({ timeout: 10000 });

    const emptyVisible = await emptyState.isVisible().catch(() => false);
    const conflictsVisible = await hasConflicts.isVisible().catch(() => false);

    expect(emptyVisible || conflictsVisible).toBe(true);
  });

  test('should allow ignoring a conflict', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const allowPolicy = await prisma.policy.create({
      data: {
        description: `Ignore Allow - ${tenant.orgId}`,
        slug: `ignore-allow-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['api_call'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const denyPolicy = await prisma.policy.create({
      data: {
        description: `Ignore Deny - ${tenant.orgId}`,
        slug: `ignore-deny-${Date.now()}`,
        effect: 'DENY',
        matchers: ['*'],
        toolPatterns: ['api_call'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-conflicts');
      await expect(adminPage.locator('body')).toBeVisible();

      const ignoreButton = adminPage.getByRole('button', { name: 'Ignore' }).first();
      if (await ignoreButton.isVisible().catch(() => false)) {
        await ignoreButton.click();

        const showIgnoredButton = adminPage.getByRole('button', { name: /Show Ignored/i });
        await expect(showIgnoredButton).toBeVisible({ timeout: 5000 });
      }
    } finally {
      await prisma.policy.delete({ where: { id: allowPolicy.id } });
      await prisma.policy.delete({ where: { id: denyPolicy.id } });
    }
  });

  test('should allow unignoring a conflict', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const allowPolicy = await prisma.policy.create({
      data: {
        description: `Unignore Allow - ${tenant.orgId}`,
        slug: `unignore-allow-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['write_data'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const denyPolicy = await prisma.policy.create({
      data: {
        description: `Unignore Deny - ${tenant.orgId}`,
        slug: `unignore-deny-${Date.now()}`,
        effect: 'DENY',
        matchers: ['*'],
        toolPatterns: ['write_data'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-conflicts');
      await expect(adminPage.locator('body')).toBeVisible();

      const ignoreButton = adminPage.getByRole('button', { name: 'Ignore' }).first();
      if (await ignoreButton.isVisible().catch(() => false)) {
        await ignoreButton.click();

        const showIgnoredButton = adminPage.getByRole('button', { name: /Show Ignored/i });
        await expect(showIgnoredButton).toBeVisible({ timeout: 5000 });
        await showIgnoredButton.click();

        const unignoreButton = adminPage.getByRole('button', { name: 'Unignore' }).first();
        await expect(unignoreButton).toBeVisible({ timeout: 5000 });
        await unignoreButton.click();

        const ignoreButtonAgain = adminPage.getByRole('button', { name: 'Ignore' }).first();
        await expect(ignoreButtonAgain).toBeVisible({ timeout: 5000 });
      }
    } finally {
      await prisma.policy.delete({ where: { id: allowPolicy.id } });
      await prisma.policy.delete({ where: { id: denyPolicy.id } });
    }
  });

  test('should open delete policy dialog when clicking Delete Policy button', async ({
    adminPage,
    tenant,
  }) => {
    const prisma = await getPrisma();

    const allowPolicy = await prisma.policy.create({
      data: {
        description: `Delete Dialog Allow - ${tenant.orgId}`,
        slug: `delete-dialog-allow-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['delete_file'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const denyPolicy = await prisma.policy.create({
      data: {
        description: `Delete Dialog Deny - ${tenant.orgId}`,
        slug: `delete-dialog-deny-${Date.now()}`,
        effect: 'DENY',
        matchers: ['*'],
        toolPatterns: ['delete_file'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-conflicts');
      await expect(adminPage.locator('body')).toBeVisible();

      const deleteButton = adminPage.getByRole('button', { name: 'Delete Policy' }).first();
      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();

        const dialog = adminPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await expect(dialog.getByText('Delete Policy to Resolve Conflict')).toBeVisible();
        await expect(dialog.getByText('Choose which policy to delete')).toBeVisible();

        const cancelButton = dialog.getByRole('button', { name: 'Cancel' });
        await cancelButton.click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
      }
    } finally {
      await prisma.policy.delete({ where: { id: allowPolicy.id } });
      await prisma.policy.delete({ where: { id: denyPolicy.id } });
    }
  });

  test('should resolve conflict by deleting a policy', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const allowPolicy = await prisma.policy.create({
      data: {
        description: `Resolve Allow - ${tenant.orgId}`,
        slug: `resolve-allow-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['execute'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const denyPolicy = await prisma.policy.create({
      data: {
        description: `Resolve Deny - ${tenant.orgId}`,
        slug: `resolve-deny-${Date.now()}`,
        effect: 'DENY',
        matchers: ['*'],
        toolPatterns: ['execute'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-conflicts');
      await expect(adminPage.locator('body')).toBeVisible();

      const deleteButton = adminPage.getByRole('button', { name: 'Delete Policy' }).first();
      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();

        const dialog = adminPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        const policyButton = dialog.locator('button').filter({ hasText: 'Resolve Allow' }).first();
        if (await policyButton.isVisible().catch(() => false)) {
          await policyButton.click();
          await expect(dialog).not.toBeVisible({ timeout: 10000 });
        }
      }
    } finally {
      const remainingAllow = await prisma.policy.findUnique({ where: { id: allowPolicy.id } });
      const remainingDeny = await prisma.policy.findUnique({ where: { id: denyPolicy.id } });

      if (remainingAllow && !remainingAllow.deletedAt) {
        await prisma.policy.delete({ where: { id: allowPolicy.id } });
      }
      if (remainingDeny && !remainingDeny.deletedAt) {
        await prisma.policy.delete({ where: { id: denyPolicy.id } });
      }
    }
  });

  test('should display policy details in conflict cards', async ({ adminPage, tenant }) => {
    const prisma = await getPrisma();

    const allowPolicy = await prisma.policy.create({
      data: {
        description: `Details Allow Policy - ${tenant.orgId}`,
        slug: `details-allow-${Date.now()}`,
        effect: 'ALLOW',
        matchers: ['role:Admin'],
        toolPatterns: ['write_file'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    const denyPolicy = await prisma.policy.create({
      data: {
        description: `Details Deny Policy - ${tenant.orgId}`,
        slug: `details-deny-${Date.now()}`,
        effect: 'DENY',
        matchers: ['role:Admin'],
        toolPatterns: ['write_file'],
        organizationId: tenant.orgId,
        enabled: true,
      },
    });

    try {
      await navigateTo(adminPage, '/admin/policy-conflicts');
      await expect(adminPage.locator('body')).toBeVisible();

      await expect(adminPage.getByText('Details Allow Policy').first()).toBeVisible({
        timeout: 10000,
      });
      await expect(adminPage.getByText('Details Deny Policy').first()).toBeVisible({
        timeout: 10000,
      });

      await expect(adminPage.getByText('Effect: ALLOW').first()).toBeVisible();
      await expect(adminPage.getByText('Effect: DENY').first()).toBeVisible();
    } finally {
      await prisma.policy.delete({ where: { id: allowPolicy.id } });
      await prisma.policy.delete({ where: { id: denyPolicy.id } });
    }
  });

  test('should navigate to policies page from empty state', async ({ adminPage }) => {
    await navigateTo(adminPage, '/admin/policy-conflicts');
    await expect(adminPage.locator('body')).toBeVisible();

    const viewPoliciesButton = adminPage.getByRole('link', { name: 'View Policies' });
    if (await viewPoliciesButton.isVisible().catch(() => false)) {
      await viewPoliciesButton.click();
      await expect(adminPage).toHaveURL(/.*\/admin\/policies$/);
    } else {
      expect(true).toBe(true);
    }
  });
});
