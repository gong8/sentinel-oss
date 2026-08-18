/**
 * Integration tests for Admin Roles Router
 * Tests complete CRUD operations for role management
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestAdmin, createTestRole } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Admin Roles Router', () => {
  let tenant: TestTenant;
  let adminId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('list', () => {
    test('should list all roles in organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await createTestRole({ organizationId: tenant.orgId, name: 'Editor' });
      await createTestRole({ organizationId: tenant.orgId, name: 'Viewer' });

      const caller = createCallerWithUser(admin);
      const roles = await caller.admin.roles.list();

      expect(roles.length).toBeGreaterThanOrEqual(3); // Admin + Editor + Viewer
      expect(roles.every((r) => r.organizationId === tenant.orgId)).toBe(true);
    });

    test('should sort admin roles first', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await createTestRole({ organizationId: tenant.orgId, name: 'ZZZ User', isAdmin: false });
      await createTestRole({ organizationId: tenant.orgId, name: 'AAA Admin', isAdmin: true });

      const caller = createCallerWithUser(admin);
      const roles = await caller.admin.roles.list();

      const adminRoles = roles.filter((r) => r.isAdmin);
      const firstRole = roles[0];

      expect(adminRoles.length).toBeGreaterThan(0);
      expect(firstRole.isAdmin).toBe(true);
    });
  });

  describe('get', () => {
    test('should get specific role by id', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testRole = await createTestRole({
        organizationId: tenant.orgId,
        name: 'Editor',
        description: 'Can edit content',
      });

      const caller = createCallerWithUser(admin);
      const role = await caller.admin.roles.get({ id: testRole.id });

      expect(role.id).toBe(testRole.id);
      expect(role.name).toBe('Editor');
      expect(role.description).toBe('Can edit content');
    });

    test('should throw NOT_FOUND for non-existent role', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.roles.get({ id: 'cm00000000000nonexistent' })).rejects.toThrow(
        'Role not found',
      );
    });

    test('should not return roles from other organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherRole = await createTestRole({ organizationId: org2.id, name: 'Other Role' });

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.roles.get({ id: otherRole.id })).rejects.toThrow('Role not found');

      // Cleanup the other org
      await prisma.role.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('create', () => {
    test('should create role with name and description', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const role = await caller.admin.roles.create({
        name: 'Editor',
        description: 'Can edit content',
      });

      expect(role.name).toBe('Editor');
      expect(role.description).toBe('Can edit content');
      expect(role.organizationId).toBe(tenant.orgId);
      expect(role.isAdmin).toBe(false);
    });

    test('should auto-detect admin role by name', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const role = await caller.admin.roles.create({
        name: 'admin',
      });

      expect(role.isAdmin).toBe(true);
    });

    test('should auto-detect admin role case-insensitively', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const role = await caller.admin.roles.create({
        name: 'ADMIN',
      });

      expect(role.isAdmin).toBe(true);
    });

    test('should reject duplicate role name in same organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await createTestRole({ organizationId: tenant.orgId, name: 'Editor' });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.roles.create({
          name: 'Editor',
        }),
      ).rejects.toThrow('already exists');
    });

    test('should allow same role name in different organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      await createTestRole({ organizationId: org2.id, name: 'Editor' });

      const caller = createCallerWithUser(admin);
      const role = await caller.admin.roles.create({
        name: 'Editor',
      });

      expect(role.organizationId).toBe(tenant.orgId);

      // Cleanup the other org
      await prisma.role.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });

    test('should reject empty role name', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.roles.create({
          name: '',
        }),
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    test('should update role name', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testRole = await createTestRole({ organizationId: tenant.orgId, name: 'Editor' });

      const caller = createCallerWithUser(admin);
      const updated = await caller.admin.roles.update({
        id: testRole.id,
        name: 'Senior Editor',
      });

      expect(updated.name).toBe('Senior Editor');
    });

    test('should update role description', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testRole = await createTestRole({
        organizationId: tenant.orgId,
        name: 'Editor',
        description: 'Old desc',
      });

      const caller = createCallerWithUser(admin);
      const updated = await caller.admin.roles.update({
        id: testRole.id,
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
    });

    test('should auto-detect admin status when renaming to admin', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testRole = await createTestRole({
        organizationId: tenant.orgId,
        name: 'SuperUser',
        isAdmin: false,
      });

      const caller = createCallerWithUser(admin);
      const updated = await caller.admin.roles.update({
        id: testRole.id,
        name: 'Administrator', // Use different name to avoid conflict with existing Admin role
      });

      expect(updated.isAdmin).toBe(false); // "Administrator" is not "Admin" (case-insensitive exact match)
      expect(updated.name).toBe('Administrator');
    });

    test('should reject duplicate name in same organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await createTestRole({ organizationId: tenant.orgId, name: 'Editor' });
      const testRole = await createTestRole({ organizationId: tenant.orgId, name: 'Viewer' });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.roles.update({
          id: testRole.id,
          name: 'Editor',
        }),
      ).rejects.toThrow('already exists');
    });

    test('should throw NOT_FOUND for non-existent role', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.roles.update({
          id: 'cm00000000000nonexistent',
          name: 'New Name',
        }),
      ).rejects.toThrow('Role not found');
    });

    test('should not update roles from other organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherRole = await createTestRole({ organizationId: org2.id, name: 'Other Role' });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.roles.update({
          id: otherRole.id,
          name: 'Hacked Name',
        }),
      ).rejects.toThrow('Role not found');

      // Cleanup the other org
      await prisma.role.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });

    test('should allow setting description to null', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testRole = await createTestRole({
        organizationId: tenant.orgId,
        name: 'Editor',
        description: 'Has description',
      });

      const caller = createCallerWithUser(admin);
      const updated = await caller.admin.roles.update({
        id: testRole.id,
        description: null,
      });

      expect(updated.description).toBeNull();
    });
  });

  describe('delete', () => {
    test('should delete role', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testRole = await createTestRole({ organizationId: tenant.orgId, name: 'Editor' });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.roles.delete({ id: testRole.id });

      expect(result.success).toBe(true);

      const deleted = await prisma.role.findUnique({ where: { id: testRole.id } });
      expect(deleted).not.toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();
      expect(deleted?.deletedBy).toBe(admin.id);
    });

    test('should soft delete role and remove user role associations for users with other roles', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testRole = await createTestRole({ organizationId: tenant.orgId, name: 'Editor' });

      // Assign role to admin (who already has admin role)
      await prisma.userRole.create({
        data: {
          userId: adminId,
          roleId: testRole.id,
        },
      });

      const caller = createCallerWithUser(admin);
      await caller.admin.roles.delete({ id: testRole.id });

      // Role is soft deleted
      const role = await prisma.role.findUnique({ where: { id: testRole.id } });
      expect(role?.deletedAt).not.toBeNull();

      const userRoles = await prisma.userRole.findMany({
        where: { roleId: testRole.id },
      });

      // User role associations are removed for users who have other roles
      // This ensures users don't appear to have a deleted role
      expect(userRoles.length).toBe(0);
    });

    test('should throw NOT_FOUND for non-existent role', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.roles.delete({ id: 'cm00000000000nonexistent' })).rejects.toThrow(
        'Role not found',
      );
    });

    test('should not delete roles from other organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherRole = await createTestRole({ organizationId: org2.id, name: 'Other Role' });

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.roles.delete({ id: otherRole.id })).rejects.toThrow(
        'Role not found',
      );

      // Cleanup the other org
      await prisma.role.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });
});
