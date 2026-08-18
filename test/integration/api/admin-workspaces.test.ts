/**
 * Integration tests for Admin Workspaces Router
 * Tests complete CRUD operations for workspace management
 */

import { prisma, WorkspaceMemberRole } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { hasDatabaseUrl } from '../../helpers/db.js';
import {
  createTestAdmin,
  createTestOrgOwner,
  createTestRole,
  createTestUser,
  createTestWorkspace,
} from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithAuth } from '../../helpers/trpc.js';

/**
 * Helper to load user with all relations needed for auth context
 */
async function loadUserForAuth(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: true } },
      workspaceMemberships: {
        where: { workspace: { deletedAt: null } },
        select: { workspaceId: true, role: true },
      },
      orgOwnership: true,
    },
  });
}

/**
 * Creates auth context from a loaded user
 */
function createAuthContextFromUser(user: NonNullable<Awaited<ReturnType<typeof loadUserForAuth>>>) {
  const isAdmin = user.userRoles.some((ur) => ur.role.isAdmin);
  const isOrgOwner = user.orgOwnership.length > 0;
  const workspaceIds = user.workspaceMemberships.map((wm) => wm.workspaceId);
  const adminWorkspaceIds = user.workspaceMemberships
    .filter((wm) => wm.role === WorkspaceMemberRole.ADMIN)
    .map((wm) => wm.workspaceId);

  return {
    user,
    organizationId: user.organizationId,
    roles: user.userRoles.map((ur) => ur.role.name),
    isAdmin,
    isOrgOwner,
    workspaceIds,
    adminWorkspaceIds,
  };
}

describe.skipIf(!hasDatabaseUrl())('Admin Workspaces Router', () => {
  let tenant: TestTenant;
  let orgOwnerId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    // Create admin role
    await createTestRole({
      organizationId: tenant.orgId,
      name: 'Admin',
      isAdmin: true,
    });

    // Create org owner
    const orgOwner = await createTestOrgOwner({ organizationId: tenant.orgId });
    orgOwnerId = orgOwner!.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('list', () => {
    test('org owner should list all workspaces', async () => {
      // Create workspaces
      await createTestWorkspace({ organizationId: tenant.orgId, name: 'Workspace 1' });
      await createTestWorkspace({ organizationId: tenant.orgId, name: 'Workspace 2' });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const workspaces = await caller.admin.workspaces.list();

      expect(workspaces.length).toBe(2);
      expect(workspaces.map((w) => w.name)).toContain('Workspace 1');
      expect(workspaces.map((w) => w.name)).toContain('Workspace 2');
    });

    test('workspace member should only see their workspaces', async () => {
      // Create two workspaces
      const ws1 = await createTestWorkspace({ organizationId: tenant.orgId, name: 'WS 1' });
      const ws2 = await createTestWorkspace({ organizationId: tenant.orgId, name: 'WS 2' });

      // Create admin user who is member of only WS1
      const admin = await createTestAdmin({ organizationId: tenant.orgId });
      await prisma.workspaceMember.create({
        data: { workspaceId: ws1.id, userId: admin.id, role: WorkspaceMemberRole.ADMIN },
      });

      const adminWithWorkspaces = await loadUserForAuth(admin.id);
      if (!adminWithWorkspaces) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(adminWithWorkspaces));
      const workspaces = await caller.admin.workspaces.list();

      expect(workspaces.length).toBe(1);
      expect(workspaces[0]?.name).toBe('WS 1');
      expect(workspaces.map((w) => w.id)).not.toContain(ws2.id);
    });

    test('should include counts for members, policies, servers, agents', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Test WS',
      });

      // Add a member
      const user = await createTestUser({ organizationId: tenant.orgId });
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceMemberRole.MEMBER },
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const workspaces = await caller.admin.workspaces.list();

      const ws = workspaces.find((w) => w.id === workspace.id);
      expect(ws?._count).toBeDefined();
      expect(ws?._count.members).toBe(1);
    });

    test('should not list deleted workspaces by default', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Deleted WS',
      });
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { deletedAt: new Date(), deletedBy: orgOwnerId },
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const workspaces = await caller.admin.workspaces.list();

      expect(workspaces.map((w) => w.id)).not.toContain(workspace.id);
    });

    test('should list deleted workspaces when includeDeleted is true', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Deleted WS',
      });
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { deletedAt: new Date(), deletedBy: orgOwnerId },
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const workspaces = await caller.admin.workspaces.list({ includeDeleted: true });

      expect(workspaces.map((w) => w.id)).toContain(workspace.id);
    });
  });

  describe('get', () => {
    test('org owner can get any workspace', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Test Workspace',
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const result = await caller.admin.workspaces.get({ id: workspace.id });

      expect(result.id).toBe(workspace.id);
      expect(result.name).toBe('Test Workspace');
    });

    test('workspace member can get their workspace', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Member WS',
      });

      const admin = await createTestAdmin({ organizationId: tenant.orgId });
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: admin.id, role: WorkspaceMemberRole.ADMIN },
      });

      const adminWithWorkspaces = await loadUserForAuth(admin.id);
      if (!adminWithWorkspaces) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(adminWithWorkspaces));
      const result = await caller.admin.workspaces.get({ id: workspace.id });

      expect(result.id).toBe(workspace.id);
    });

    test('non-member should get NOT_FOUND for workspace they are not in', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Private WS',
      });

      const admin = await createTestAdmin({ organizationId: tenant.orgId });
      // Admin is not a member of the workspace

      const adminWithWorkspaces = await loadUserForAuth(admin.id);
      if (!adminWithWorkspaces) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(adminWithWorkspaces));

      await expect(caller.admin.workspaces.get({ id: workspace.id })).rejects.toThrow(/not found/i);
    });
  });

  describe('create', () => {
    test('org owner can create workspace', async () => {
      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const workspace = await caller.admin.workspaces.create({
        name: 'New Workspace',
        description: 'A test workspace',
      });

      expect(workspace.name).toBe('New Workspace');
      expect(workspace.description).toBe('A test workspace');
      expect(workspace.organizationId).toBe(tenant.orgId);

      // Verify in database
      const dbWorkspace = await prisma.workspace.findUnique({ where: { id: workspace.id } });
      expect(dbWorkspace).toBeDefined();
      expect(dbWorkspace?.name).toBe('New Workspace');
    });

    test('non-org-owner should be rejected', async () => {
      const admin = await createTestAdmin({ organizationId: tenant.orgId });

      const adminUser = await loadUserForAuth(admin.id);
      if (!adminUser) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(adminUser));

      await expect(
        caller.admin.workspaces.create({
          name: 'Unauthorized WS',
        }),
      ).rejects.toThrow(/organization owner|unauthorized|forbidden/i);
    });

    test('should reject duplicate workspace name', async () => {
      await createTestWorkspace({ organizationId: tenant.orgId, name: 'Existing WS' });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));

      await expect(
        caller.admin.workspaces.create({
          name: 'Existing WS',
        }),
      ).rejects.toThrow(/already exists|conflict/i);
    });
  });

  describe('update', () => {
    test('org owner can update workspace', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Original Name',
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const updated = await caller.admin.workspaces.update({
        id: workspace.id,
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
    });

    test('non-org-owner should be rejected', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'WS to Update',
      });

      const admin = await createTestAdmin({ organizationId: tenant.orgId });
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: admin.id, role: WorkspaceMemberRole.ADMIN },
      });

      const adminUser = await loadUserForAuth(admin.id);
      if (!adminUser) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(adminUser));

      await expect(
        caller.admin.workspaces.update({
          id: workspace.id,
          name: 'New Name',
        }),
      ).rejects.toThrow(/organization owner|unauthorized|forbidden/i);
    });

    test('should reject update to duplicate name', async () => {
      await createTestWorkspace({ organizationId: tenant.orgId, name: 'Name A' });
      const wsB = await createTestWorkspace({ organizationId: tenant.orgId, name: 'Name B' });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));

      await expect(
        caller.admin.workspaces.update({
          id: wsB.id,
          name: 'Name A',
        }),
      ).rejects.toThrow(/already exists|conflict/i);
    });
  });

  describe('delete', () => {
    test('org owner can delete workspace', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'WS to Delete',
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const result = await caller.admin.workspaces.delete({ id: workspace.id });

      expect(result.success).toBe(true);

      // Verify soft deleted
      const dbWorkspace = await prisma.workspace.findUnique({ where: { id: workspace.id } });
      expect(dbWorkspace?.deletedAt).not.toBeNull();
    });

    test('non-org-owner should be rejected', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'WS to Delete',
      });

      const admin = await createTestAdmin({ organizationId: tenant.orgId });
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: admin.id, role: WorkspaceMemberRole.ADMIN },
      });

      const adminUser = await loadUserForAuth(admin.id);
      if (!adminUser) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(adminUser));

      await expect(caller.admin.workspaces.delete({ id: workspace.id })).rejects.toThrow(
        /organization owner|unauthorized|forbidden/i,
      );
    });

    test('delete should also delete workspace members', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'WS with Members',
      });

      // Add members
      const user1 = await createTestUser({ organizationId: tenant.orgId });
      const user2 = await createTestUser({ organizationId: tenant.orgId });
      await prisma.workspaceMember.createMany({
        data: [
          { workspaceId: workspace.id, userId: user1.id, role: WorkspaceMemberRole.MEMBER },
          { workspaceId: workspace.id, userId: user2.id, role: WorkspaceMemberRole.ADMIN },
        ],
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      await caller.admin.workspaces.delete({ id: workspace.id });

      // Verify members are deleted
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
      });
      expect(members.length).toBe(0);
    });
  });

  describe('restore', () => {
    test('org owner can restore deleted workspace', async () => {
      const workspace = await createTestWorkspace({
        organizationId: tenant.orgId,
        name: 'Deleted WS',
      });
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { deletedAt: new Date(), deletedBy: orgOwnerId },
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const result = await caller.admin.workspaces.restore({ id: workspace.id });

      expect(result.success).toBe(true);

      // Verify restored
      const dbWorkspace = await prisma.workspace.findUnique({ where: { id: workspace.id } });
      expect(dbWorkspace?.deletedAt).toBeNull();
    });

    // Note: Test for "name conflict on restore" is not possible with current schema.
    // The @@unique([organizationId, name]) constraint prevents having both a deleted
    // and active workspace with the same name. This would require a partial unique
    // index at the database level, which Prisma doesn't support declaratively.
  });
});
