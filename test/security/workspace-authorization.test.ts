/**
 * Security Tests for Workspace Authorization
 * Tests that unauthorized workspace actions are properly rejected
 */

import { prisma, WorkspaceMemberRole } from '@sentinel/db';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  createTestAdmin,
  createTestOrganization,
  createTestOrgOwner,
  createTestPolicy,
  createTestRole,
  createTestUser,
  createTestWorkspace,
} from '../helpers/factory.js';
import { createCallerWithAuth } from '../helpers/trpc.js';

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

describe('workspace authorization security', () => {
  let orgId: string;
  let workspace1Id: string;
  let workspace2Id: string;
  let orgOwnerId: string;
  let ws1AdminId: string;
  let ws2AdminId: string;
  let regularUserId: string;

  beforeAll(async () => {
    // Create organization
    const org = await createTestOrganization({ name: 'Auth Test Org' });
    orgId = org.id;

    // Create roles
    await createTestRole({ organizationId: orgId, name: 'Admin', isAdmin: true });
    await createTestRole({ organizationId: orgId, name: 'User', isAdmin: false });

    // Create workspaces
    const ws1 = await createTestWorkspace({ organizationId: orgId, name: 'Workspace 1' });
    const ws2 = await createTestWorkspace({ organizationId: orgId, name: 'Workspace 2' });
    workspace1Id = ws1.id;
    workspace2Id = ws2.id;

    // Create org owner
    const orgOwner = await createTestOrgOwner({ organizationId: orgId });
    orgOwnerId = orgOwner!.id;

    // Create workspace 1 admin
    const ws1Admin = await createTestAdmin({ organizationId: orgId, email: 'ws1admin@test.com' });
    ws1AdminId = ws1Admin.id;
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace1Id, userId: ws1AdminId, role: WorkspaceMemberRole.ADMIN },
    });

    // Create workspace 2 admin
    const ws2Admin = await createTestAdmin({ organizationId: orgId, email: 'ws2admin@test.com' });
    ws2AdminId = ws2Admin.id;
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace2Id, userId: ws2AdminId, role: WorkspaceMemberRole.ADMIN },
    });

    // Create regular user (no workspace)
    const regularUser = await createTestUser({ organizationId: orgId, email: 'regular@test.com' });
    regularUserId = regularUser.id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.workspaceMember.deleteMany({ where: { workspace: { organizationId: orgId } } });
    await prisma.policy.deleteMany({ where: { organizationId: orgId } });
    await prisma.workspace.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgOwner.deleteMany({ where: { organizationId: orgId } });
    await prisma.userRole.deleteMany({ where: { user: { organizationId: orgId } } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.role.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  describe('workspace creation authorization', () => {
    test('non-org-owner cannot create workspace', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(caller.admin.workspaces.create({ name: 'Unauthorized WS' })).rejects.toThrow(
        /organization owner|unauthorized|forbidden/i,
      );
    });

    test('regular user (non-admin) cannot create workspace', async () => {
      const regularUser = await loadUserForAuth(regularUserId);
      if (!regularUser) throw new Error('User not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(regularUser));

      await expect(caller.admin.workspaces.create({ name: 'Unauthorized WS' })).rejects.toThrow();
    });
  });

  describe('cross-workspace access control', () => {
    test('workspace 1 admin cannot access workspace 2 details', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(caller.admin.workspaces.get({ id: workspace2Id })).rejects.toThrow(/not found/i);
    });

    test('workspace 1 admin cannot update workspace 2', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(
        caller.admin.workspaces.update({ id: workspace2Id, name: 'Hijacked' }),
      ).rejects.toThrow(/organization owner|unauthorized|forbidden/i);
    });

    test('workspace 1 admin cannot delete workspace 2', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(caller.admin.workspaces.delete({ id: workspace2Id })).rejects.toThrow(
        /organization owner|unauthorized|forbidden/i,
      );
    });
  });

  describe('workspace member management authorization', () => {
    test('workspace 1 admin cannot add member to workspace 2', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(
        caller.admin.workspaceMembers.add({
          workspaceId: workspace2Id,
          userId: regularUserId,
        }),
      ).rejects.toThrow(/permission|forbidden|not found/i);
    });

    test('workspace 1 admin cannot remove member from workspace 2', async () => {
      // First add a member to workspace 2 via database
      const newUser = await createTestUser({ organizationId: orgId, email: 'ws2member@test.com' });
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace2Id, userId: newUser.id, role: WorkspaceMemberRole.MEMBER },
      });

      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(
        caller.admin.workspaceMembers.remove({
          workspaceId: workspace2Id,
          userId: newUser.id,
        }),
      ).rejects.toThrow(/permission|forbidden|not found/i);

      // Cleanup
      await prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: workspace2Id, userId: newUser.id } },
      });
      await prisma.userRole.deleteMany({ where: { userId: newUser.id } });
      await prisma.user.delete({ where: { id: newUser.id } });
    });

    test('regular member cannot add other members', async () => {
      // Add regular user as member of workspace 1
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace1Id,
          userId: regularUserId,
          role: WorkspaceMemberRole.MEMBER,
        },
      });

      const regularUser = await loadUserForAuth(regularUserId);
      if (!regularUser) throw new Error('User not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(regularUser));

      const newUser = await createTestUser({ organizationId: orgId, email: 'attempt@test.com' });

      await expect(
        caller.admin.workspaceMembers.add({
          workspaceId: workspace1Id,
          userId: newUser.id,
        }),
      ).rejects.toThrow(/permission|forbidden|admin/i);

      // Cleanup
      await prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: workspace1Id, userId: regularUserId } },
      });
      await prisma.userRole.deleteMany({ where: { userId: newUser.id } });
      await prisma.user.delete({ where: { id: newUser.id } });
    });
  });

  describe('org owner management authorization', () => {
    test('workspace admin cannot add org owners', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(caller.admin.orgOwners.add({ userId: regularUserId })).rejects.toThrow(
        /organization owner|unauthorized|forbidden/i,
      );
    });

    test('workspace admin cannot remove org owners', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(caller.admin.orgOwners.remove({ userId: orgOwnerId })).rejects.toThrow(
        /organization owner|unauthorized|forbidden/i,
      );
    });

    test('cannot remove the last org owner', async () => {
      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));

      await expect(caller.admin.orgOwners.remove({ userId: orgOwnerId })).rejects.toThrow(
        /last|cannot remove|self/i,
      );
    });
  });

  describe('last workspace admin protection', () => {
    test('cannot remove the last admin from a workspace', async () => {
      // WS1 has only one admin (ws1AdminId)
      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));

      await expect(
        caller.admin.workspaceMembers.remove({
          workspaceId: workspace1Id,
          userId: ws1AdminId,
        }),
      ).rejects.toThrow(/last|admin/i);
    });
  });

  describe('workspace policy authorization', () => {
    test('workspace admin cannot create org-wide policy', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(
        caller.admin.policies.create({
          matchers: ['role:User'],
          toolPatterns: ['test::*'],
          effect: 'ALLOW',
          description: 'Unauthorized org-wide policy',
          // No workspaceId = org-wide
        }),
      ).rejects.toThrow(/organization owner|permission|forbidden/i);
    });

    test('workspace admin can create policy scoped to their workspace', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      const result = await caller.admin.policies.create({
        matchers: ['role:User'],
        toolPatterns: ['test::*'],
        effect: 'ALLOW',
        description: 'WS1 scoped policy',
        workspaceId: workspace1Id,
      });

      expect(result.policy.workspaceId).toBe(workspace1Id);

      // Cleanup
      await prisma.policy.delete({ where: { id: result.policy.id } });
    });

    test('workspace admin cannot create policy for another workspace', async () => {
      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));

      await expect(
        caller.admin.policies.create({
          matchers: ['role:User'],
          toolPatterns: ['test::*'],
          effect: 'ALLOW',
          description: 'Unauthorized WS2 policy',
          workspaceId: workspace2Id,
        }),
      ).rejects.toThrow(/permission|forbidden|admin/i);
    });
  });

  describe('workspace resource visibility', () => {
    test('workspace 1 admin can only see policies from their workspace and org-wide', async () => {
      // Create policies
      const orgWidePolicy = await createTestPolicy({
        organizationId: orgId,
        slug: 'org-wide-visible',
        matchers: ['role:User'],
        toolPatterns: ['visible::*'],
      });

      const ws1Policy = await prisma.policy.create({
        data: {
          organizationId: orgId,
          slug: 'ws1-policy',
          matchers: ['role:User'],
          toolPatterns: ['ws1::*'],
          effect: 'ALLOW',
          description: 'WS1 policy for visibility test',
          workspaceId: workspace1Id,
        },
      });

      const ws2Policy = await prisma.policy.create({
        data: {
          organizationId: orgId,
          slug: 'ws2-policy',
          matchers: ['role:User'],
          toolPatterns: ['ws2::*'],
          effect: 'ALLOW',
          description: 'WS2 policy for visibility test',
          workspaceId: workspace2Id,
        },
      });

      const ws1Admin = await loadUserForAuth(ws1AdminId);
      if (!ws1Admin) throw new Error('Admin not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(ws1Admin));
      const policies = await caller.admin.policies.list();

      const policyIds = policies.map((p) => p.id);
      expect(policyIds).toContain(orgWidePolicy.id); // Can see org-wide
      expect(policyIds).toContain(ws1Policy.id); // Can see own workspace
      expect(policyIds).not.toContain(ws2Policy.id); // Cannot see other workspace

      // Cleanup
      await prisma.policy.deleteMany({
        where: { id: { in: [orgWidePolicy.id, ws1Policy.id, ws2Policy.id] } },
      });
    });

    test('org owner can see all policies across workspaces', async () => {
      // Create policies
      const orgWidePolicy = await createTestPolicy({
        organizationId: orgId,
        slug: 'org-wide-all',
        matchers: ['role:User'],
        toolPatterns: ['all::*'],
      });

      const ws1Policy = await prisma.policy.create({
        data: {
          organizationId: orgId,
          slug: 'ws1-policy-all',
          matchers: ['role:User'],
          toolPatterns: ['ws1all::*'],
          effect: 'ALLOW',
          description: 'WS1 policy for all visibility test',
          workspaceId: workspace1Id,
        },
      });

      const ws2Policy = await prisma.policy.create({
        data: {
          organizationId: orgId,
          slug: 'ws2-policy-all',
          matchers: ['role:User'],
          toolPatterns: ['ws2all::*'],
          effect: 'ALLOW',
          description: 'WS2 policy for all visibility test',
          workspaceId: workspace2Id,
        },
      });

      const orgOwner = await loadUserForAuth(orgOwnerId);
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithAuth(createAuthContextFromUser(orgOwner));
      const policies = await caller.admin.policies.list();

      const policyIds = policies.map((p) => p.id);
      expect(policyIds).toContain(orgWidePolicy.id);
      expect(policyIds).toContain(ws1Policy.id);
      expect(policyIds).toContain(ws2Policy.id);

      // Cleanup
      await prisma.policy.deleteMany({
        where: { id: { in: [orgWidePolicy.id, ws1Policy.id, ws2Policy.id] } },
      });
    });
  });
});
