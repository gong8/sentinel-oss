/**
 * Integration tests for Admin Organizations Router
 * Tests organization management operations
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestAdmin, createTestUser } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Admin Organizations Router', () => {
  let tenant: TestTenant;
  let adminId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;

    // Update the org name for testing
    await prisma.organization.update({
      where: { id: tenant.orgId },
      data: { name: 'Test Organization' },
    });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // Helper to get admin user
  async function getAdmin() {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!admin) throw new Error('Admin not found');
    return admin;
  }

  describe('get', () => {
    test('should get current organization', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.organizations.get();

      expect(result).not.toBeNull();
      expect(result?.id).toBe(tenant.orgId);
      expect(result?.name).toBe('Test Organization');
    });

    test('should only return own organization', async () => {
      const admin = await getAdmin();

      // Create another organization
      const otherOrg = await prisma.organization.create({ data: { name: 'Other Organization' } });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.organizations.get();

      expect(result?.id).toBe(tenant.orgId);
      expect(result?.name).toBe('Test Organization');

      // Cleanup the other org
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('update', () => {
    test('should update organization name', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.organizations.update({ name: 'Updated Organization' });

      expect(result.name).toBe('Updated Organization');

      // Verify the change persisted
      const org = await prisma.organization.findUnique({ where: { id: tenant.orgId } });
      expect(org?.name).toBe('Updated Organization');
    });

    test('should not update organization without name field', async () => {
      const admin = await getAdmin();

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.organizations.update({});

      // Should return current organization unchanged
      expect(result.id).toBe(tenant.orgId);
      expect(result.name).toBe('Test Organization');
    });

    test('should not affect other organizations', async () => {
      const admin = await getAdmin();

      // Create another organization
      const otherOrg = await prisma.organization.create({ data: { name: 'Other Organization' } });

      const caller = createCallerWithUser(admin);
      await caller.admin.organizations.update({ name: 'Updated Organization' });

      // Verify other org unchanged
      const other = await prisma.organization.findUnique({ where: { id: otherOrg.id } });
      expect(other?.name).toBe('Other Organization');

      // Cleanup the other org
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('Authorization', () => {
    test('should reject non-admin users for get', async () => {
      const regularUser = await createTestUser({ organizationId: tenant.orgId });
      const user = await prisma.user.findUnique({
        where: { id: regularUser.id },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);

      await expect(caller.admin.organizations.get()).rejects.toThrow();
    });

    test('should reject non-admin users for update', async () => {
      const regularUser = await createTestUser({ organizationId: tenant.orgId });
      const user = await prisma.user.findUnique({
        where: { id: regularUser.id },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);

      await expect(caller.admin.organizations.update({ name: 'Hacked' })).rejects.toThrow();
    });
  });
});
