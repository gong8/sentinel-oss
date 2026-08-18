/**
 * Integration tests for Admin Users Router
 * Tests complete CRUD operations for user management
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import {
  createTestAdmin,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Admin Users Router', () => {
  let tenant: TestTenant;
  let adminId: string;
  let adminRoleId: string;
  let userRoleId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    // Create roles
    const adminRole = await createTestRole({
      organizationId: tenant.orgId,
      name: 'Admin',
      isAdmin: true,
    });
    const userRole = await createTestRole({
      organizationId: tenant.orgId,
      name: 'User',
      isAdmin: false,
    });
    adminRoleId = adminRole.id;
    userRoleId = userRole.id;

    // Create admin user
    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('list', () => {
    test('should list all users in organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create additional users
      await createTestUser({ organizationId: tenant.orgId });
      await createTestUser({ organizationId: tenant.orgId });

      const caller = createCallerWithUser(admin);
      const users = await caller.admin.users.list();

      expect(users.length).toBeGreaterThanOrEqual(3); // admin + 2 users
      expect(users.every((u) => u.organizationId === tenant.orgId)).toBe(true);
    });

    test('should include user roles in response', async () => {
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
      const users = await caller.admin.users.list();

      expect(users[0].userRoles).toBeDefined();
      expect(Array.isArray(users[0].userRoles)).toBe(true);
    });

    test('should include lastActivityAt field in response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Update admin's lastActivityAt
      await prisma.user.update({
        where: { id: adminId },
        data: { lastActivityAt: new Date() },
      });

      const caller = createCallerWithUser(admin);
      const users = await caller.admin.users.list();

      // Find the admin user in the list
      const adminFromList = users.find((u) => u.id === adminId);
      expect(adminFromList).toBeDefined();
      expect(adminFromList?.lastActivityAt).toBeDefined();
      expect(adminFromList?.lastActivityAt).toBeInstanceOf(Date);
    });
  });

  describe('get', () => {
    test('should get specific user by id', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testUser = await createTestUser({
        organizationId: tenant.orgId,
      });

      const caller = createCallerWithUser(admin);
      const user = await caller.admin.users.get({ id: testUser.id });

      expect(user.id).toBe(testUser.id);
      expect(user.email).toBe(testUser.email);
    });

    test('should throw NOT_FOUND for non-existent user', async () => {
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
      await expect(caller.admin.users.get({ id: 'cm00000000000nonexistent' })).rejects.toThrow(
        'User not found',
      );
    });

    test('should not return users from other organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create user in different org
      const org2 = await createTestOrganization({ name: 'Other Org' });
      const otherUser = await createTestUser({
        organizationId: org2.id,
      });

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.users.get({ id: otherUser.id })).rejects.toThrow('User not found');
    });
  });

  describe('create', () => {
    test('should create user with single role', async () => {
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
      const uniqueEmail = `newuser-${Date.now()}@test.com`;
      const user = await caller.admin.users.create({
        email: uniqueEmail,
        roleIds: [userRoleId],
      });

      expect(user.email).toBe(uniqueEmail);
      expect(user.organizationId).toBe(tenant.orgId);
      expect(user.userRoles).toHaveLength(1);
      expect(user.userRoles[0].roleId).toBe(userRoleId);
    });

    test('should create user with multiple non-admin roles', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const role2 = await createTestRole({
        organizationId: tenant.orgId,
        name: 'Editor',
        isAdmin: false,
      });

      const caller = createCallerWithUser(admin);
      const user = await caller.admin.users.create({
        email: `multiuser-${Date.now()}@test.com`,
        roleIds: [userRoleId, role2.id],
      });

      expect(user.userRoles).toHaveLength(2);
    });

    test('should reject creating user with admin role + other roles', async () => {
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
        caller.admin.users.create({
          email: `baduser-${Date.now()}@test.com`,
          roleIds: [adminRoleId, userRoleId],
        }),
      ).rejects.toThrow('Admin roles are exclusive');
    });

    test('should reject creating user with role from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await createTestOrganization({ name: 'Other Org' });
      const otherRole = await createTestRole({ organizationId: org2.id, name: 'Other Role' });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.users.create({
          email: `crossorg-${Date.now()}@test.com`,
          roleIds: [otherRole.id],
        }),
      ).rejects.toThrow('do not belong to this organization');
    });

    test('should reject invalid email', async () => {
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
        caller.admin.users.create({
          email: 'not-an-email',
          roleIds: [userRoleId],
        }),
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    test('should update user roles', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testUser = await createTestUser({
        organizationId: tenant.orgId,
      });
      const role2 = await createTestRole({
        organizationId: tenant.orgId,
        name: 'Editor',
        isAdmin: false,
      });

      const caller = createCallerWithUser(admin);
      const updated = await caller.admin.users.update({
        id: testUser.id,
        roleIds: [userRoleId, role2.id],
      });

      expect(updated?.userRoles).toHaveLength(2);
    });

    test('should prevent admin from removing own admin role', async () => {
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
        caller.admin.users.update({
          id: adminId,
          roleIds: [userRoleId],
        }),
      ).rejects.toThrow('cannot remove your own admin role');
    });

    test('should reject updating user from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await createTestOrganization({ name: 'Other Org' });
      const otherUser = await createTestUser({
        organizationId: org2.id,
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.users.update({
          id: otherUser.id,
          roleIds: [userRoleId],
        }),
      ).rejects.toThrow('User not found');
    });

    test('should enforce admin role exclusivity on update', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testUser = await createTestUser({
        organizationId: tenant.orgId,
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.users.update({
          id: testUser.id,
          roleIds: [adminRoleId, userRoleId],
        }),
      ).rejects.toThrow('Admin roles are exclusive');
    });
  });

  describe('refreshToken', () => {
    test('should return access token', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testUser = await createTestUser({
        organizationId: tenant.orgId,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.users.refreshToken({ id: testUser.id });

      expect(result.accessToken).toBeDefined();
      expect(result.accessToken).toBeTruthy();

      // Note: Current implementation doesn't actually regenerate the token
      // This is a known limitation - accessToken: undefined doesn't trigger Prisma's @default(cuid())
    });

    test('should throw NOT_FOUND for non-existent user', async () => {
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
        caller.admin.users.refreshToken({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('User not found');
    });
  });

  describe('revokeToken', () => {
    test('should revoke user token successfully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testUser = await createTestUser({
        organizationId: tenant.orgId,
      });
      const originalToken = testUser.accessToken;

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.users.revokeToken({ id: testUser.id });

      expect(result.success).toBe(true);

      // Verify token was changed to a revoked token
      const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(updatedUser?.accessToken).not.toBe(originalToken);
      expect(updatedUser?.accessToken).toMatch(/^revoked_/);
    });

    test('should prevent admin from revoking their own token', async () => {
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
      await expect(caller.admin.users.revokeToken({ id: adminId })).rejects.toThrow(
        'cannot revoke your own access token',
      );
    });

    test('should throw NOT_FOUND for non-existent user', async () => {
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
        caller.admin.users.revokeToken({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('User not found');
    });

    test('should not revoke token for user from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await createTestOrganization({ name: 'Other Org' });
      const otherUser = await createTestUser({
        organizationId: org2.id,
      });

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.users.revokeToken({ id: otherUser.id })).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('delete', () => {
    test('should delete user', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const testUser = await createTestUser({
        organizationId: tenant.orgId,
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.users.delete({ id: testUser.id });

      expect(result.success).toBe(true);

      const deleted = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(deleted).not.toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();
      expect(deleted?.deletedBy).toBe(admin.id);
    });

    test('should prevent admin from deleting themselves', async () => {
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
      await expect(caller.admin.users.delete({ id: adminId })).rejects.toThrow(
        'cannot delete your own account',
      );
    });

    test('should throw NOT_FOUND for non-existent user', async () => {
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
      await expect(caller.admin.users.delete({ id: 'cm00000000000nonexistent' })).rejects.toThrow(
        'User not found',
      );
    });

    test('should not delete user from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const org2 = await createTestOrganization({ name: 'Other Org' });
      const otherUser = await createTestUser({
        organizationId: org2.id,
      });

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.users.delete({ id: otherUser.id })).rejects.toThrow(
        'User not found',
      );
    });
  });
});
