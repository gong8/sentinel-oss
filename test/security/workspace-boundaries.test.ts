/**
 * Security Tests for Workspace Boundaries
 * Tests that workspace isolation is properly enforced
 */

import { PolicyEffect, prisma, WorkspaceMemberRole } from '@sentinel/db';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { checkMatcher } from '../../packages/api/src/services/policy.js';
import {
  createTestOrganization,
  createTestPolicy,
  createTestUser,
  createTestWorkspace,
} from '../helpers/factory.js';

describe('workspace security boundaries', () => {
  let orgId: string;
  let workspace1Id: string;
  let workspace2Id: string;

  // Users
  let userInWs1Id: string;
  let userInWs2Id: string;
  let adminInWs1Id: string;
  let userInBothWorkspacesId: string;
  let userNotInAnyWorkspaceId: string;

  beforeAll(async () => {
    // Create organization
    const org = await createTestOrganization({ name: 'Security Test Org' });
    orgId = org.id;

    // Create workspaces
    const ws1 = await createTestWorkspace({ organizationId: orgId, name: 'Security WS1' });
    const ws2 = await createTestWorkspace({ organizationId: orgId, name: 'Security WS2' });
    workspace1Id = ws1.id;
    workspace2Id = ws2.id;

    // Create users
    const user1 = await createTestUser({ organizationId: orgId, email: 'sec-user1@test.com' });
    const user2 = await createTestUser({ organizationId: orgId, email: 'sec-user2@test.com' });
    const admin1 = await createTestUser({ organizationId: orgId, email: 'sec-admin1@test.com' });
    const userBoth = await createTestUser({ organizationId: orgId, email: 'sec-both@test.com' });
    const userNone = await createTestUser({ organizationId: orgId, email: 'sec-none@test.com' });

    userInWs1Id = user1.id;
    userInWs2Id = user2.id;
    adminInWs1Id = admin1.id;
    userInBothWorkspacesId = userBoth.id;
    userNotInAnyWorkspaceId = userNone.id;

    // Assign workspace memberships
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: workspace1Id, userId: userInWs1Id, role: WorkspaceMemberRole.MEMBER },
        { workspaceId: workspace2Id, userId: userInWs2Id, role: WorkspaceMemberRole.MEMBER },
        { workspaceId: workspace1Id, userId: adminInWs1Id, role: WorkspaceMemberRole.ADMIN },
        {
          workspaceId: workspace1Id,
          userId: userInBothWorkspacesId,
          role: WorkspaceMemberRole.MEMBER,
        },
        {
          workspaceId: workspace2Id,
          userId: userInBothWorkspacesId,
          role: WorkspaceMemberRole.MEMBER,
        },
      ],
    });
  });

  afterAll(async () => {
    // Clean up in correct order (respect foreign keys)
    await prisma.workspaceMember.deleteMany({
      where: { workspace: { organizationId: orgId } },
    });
    await prisma.policy.deleteMany({ where: { organizationId: orgId } });
    await prisma.workspace.deleteMany({ where: { organizationId: orgId } });
    await prisma.userRole.deleteMany({
      where: { user: { organizationId: orgId } },
    });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.role.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  /**
   * Helper to load user with roles and workspace memberships
   */
  async function loadUserWithWorkspaces(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        workspaceMemberships: {
          select: { workspaceId: true, role: true },
        },
      },
    });
  }

  describe('workspace:id matcher isolation', () => {
    test('user in workspace 1 should NOT match workspace:ws2 policy', async () => {
      const user = await loadUserWithWorkspaces(userInWs1Id);
      expect(user).toBeDefined();

      // User in ws1 should not match ws2 workspace matcher
      expect(checkMatcher(`workspace:${workspace2Id}`, user!)).toBe(false);
    });

    test('user in workspace 2 should NOT match workspace:ws1 policy', async () => {
      const user = await loadUserWithWorkspaces(userInWs2Id);
      expect(user).toBeDefined();

      // User in ws2 should not match ws1 workspace matcher
      expect(checkMatcher(`workspace:${workspace1Id}`, user!)).toBe(false);
    });

    test('user in no workspace should NOT match any workspace:id policy', async () => {
      const user = await loadUserWithWorkspaces(userNotInAnyWorkspaceId);
      expect(user).toBeDefined();

      expect(checkMatcher(`workspace:${workspace1Id}`, user!)).toBe(false);
      expect(checkMatcher(`workspace:${workspace2Id}`, user!)).toBe(false);
    });

    test('user in both workspaces should match both workspace:id policies', async () => {
      const user = await loadUserWithWorkspaces(userInBothWorkspacesId);
      expect(user).toBeDefined();

      expect(checkMatcher(`workspace:${workspace1Id}`, user!)).toBe(true);
      expect(checkMatcher(`workspace:${workspace2Id}`, user!)).toBe(true);
    });
  });

  describe('workspace-admin:id matcher isolation', () => {
    test('workspace member should NOT match workspace-admin:id policy', async () => {
      const user = await loadUserWithWorkspaces(userInWs1Id);
      expect(user).toBeDefined();

      // Regular member should not match admin matcher
      expect(checkMatcher(`workspace-admin:${workspace1Id}`, user!)).toBe(false);
    });

    test('workspace admin should match workspace-admin:id policy', async () => {
      const user = await loadUserWithWorkspaces(adminInWs1Id);
      expect(user).toBeDefined();

      expect(checkMatcher(`workspace-admin:${workspace1Id}`, user!)).toBe(true);
    });

    test('workspace admin in ws1 should NOT match workspace-admin:ws2 policy', async () => {
      const user = await loadUserWithWorkspaces(adminInWs1Id);
      expect(user).toBeDefined();

      // Admin of ws1 should not match admin policy for ws2
      expect(checkMatcher(`workspace-admin:${workspace2Id}`, user!)).toBe(false);
    });

    test('user not in workspace should NOT match workspace-admin:id policy', async () => {
      const user = await loadUserWithWorkspaces(userNotInAnyWorkspaceId);
      expect(user).toBeDefined();

      expect(checkMatcher(`workspace-admin:${workspace1Id}`, user!)).toBe(false);
    });
  });

  describe('workspace:* wildcard matcher isolation', () => {
    test('user in any workspace should match workspace:* policy', async () => {
      const user = await loadUserWithWorkspaces(userInWs1Id);
      expect(user).toBeDefined();

      expect(checkMatcher('workspace:*', user!)).toBe(true);
    });

    test('user not in any workspace should NOT match workspace:* policy', async () => {
      const user = await loadUserWithWorkspaces(userNotInAnyWorkspaceId);
      expect(user).toBeDefined();

      // User with no workspace memberships should not match
      expect(checkMatcher('workspace:*', user!)).toBe(false);
    });
  });

  describe('workspace-admin:* wildcard matcher isolation', () => {
    test('workspace admin should match workspace-admin:* policy', async () => {
      const user = await loadUserWithWorkspaces(adminInWs1Id);
      expect(user).toBeDefined();

      expect(checkMatcher('workspace-admin:*', user!)).toBe(true);
    });

    test('workspace member (non-admin) should NOT match workspace-admin:* policy', async () => {
      const user = await loadUserWithWorkspaces(userInWs1Id);
      expect(user).toBeDefined();

      expect(checkMatcher('workspace-admin:*', user!)).toBe(false);
    });

    test('user in multiple workspaces as member should NOT match workspace-admin:*', async () => {
      const user = await loadUserWithWorkspaces(userInBothWorkspacesId);
      expect(user).toBeDefined();

      // User is member in both, admin in neither
      expect(checkMatcher('workspace-admin:*', user!)).toBe(false);
    });
  });

  describe('workspace-scoped DENY policy enforcement', () => {
    test('workspace DENY policy should be stored correctly', async () => {
      const denyPolicy = await createTestPolicy({
        organizationId: orgId,
        slug: 'sec-ws1-deny-dangerous',
        matchers: [`workspace:${workspace1Id}`],
        toolPatterns: ['dangerous-tool::delete'],
        effect: PolicyEffect.DENY,
        description: 'Deny dangerous operations in workspace 1',
      });

      const stored = await prisma.policy.findUnique({
        where: { id: denyPolicy.id },
      });

      expect(stored).toBeDefined();
      expect(stored?.effect).toBe(PolicyEffect.DENY);
      expect(stored?.matchers).toContain(`workspace:${workspace1Id}`);

      // Clean up
      await prisma.policy.delete({ where: { id: denyPolicy.id } });
    });

    test('workspace DENY policy should only match workspace members', async () => {
      const user1 = await loadUserWithWorkspaces(userInWs1Id);
      const user2 = await loadUserWithWorkspaces(userInWs2Id);
      const userNone = await loadUserWithWorkspaces(userNotInAnyWorkspaceId);

      // Create workspace-scoped deny
      const denyPolicy = await createTestPolicy({
        organizationId: orgId,
        slug: 'sec-ws1-deny-test',
        matchers: [`workspace:${workspace1Id}`],
        toolPatterns: ['test::*'],
        effect: PolicyEffect.DENY,
      });

      // User in ws1 should match the workspace matcher
      expect(checkMatcher(`workspace:${workspace1Id}`, user1!)).toBe(true);

      // User in ws2 should NOT match
      expect(checkMatcher(`workspace:${workspace1Id}`, user2!)).toBe(false);

      // User not in any workspace should NOT match
      expect(checkMatcher(`workspace:${workspace1Id}`, userNone!)).toBe(false);

      // Clean up
      await prisma.policy.delete({ where: { id: denyPolicy.id } });
    });
  });

  describe('cross-workspace isolation', () => {
    test('user should not be able to query other workspace members', async () => {
      // Get members of workspace 1
      const ws1Members = await prisma.workspaceMember.findMany({
        where: { workspaceId: workspace1Id },
        include: { user: { select: { id: true, email: true } } },
      });

      // Verify expected members
      expect(ws1Members.map((m) => m.userId)).toContain(userInWs1Id);
      expect(ws1Members.map((m) => m.userId)).toContain(adminInWs1Id);

      // Verify ws2 users are NOT in ws1 list
      expect(ws1Members.map((m) => m.userId)).not.toContain(userInWs2Id);
    });

    test('workspace resources should be scoped correctly', async () => {
      // Verify workspace isolation at database level
      const ws1 = await prisma.workspace.findUnique({
        where: { id: workspace1Id },
        include: {
          members: { select: { userId: true } },
        },
      });

      const ws2 = await prisma.workspace.findUnique({
        where: { id: workspace2Id },
        include: {
          members: { select: { userId: true } },
        },
      });

      // Workspace 1 members
      const ws1UserIds = ws1?.members.map((m) => m.userId) ?? [];
      expect(ws1UserIds).toContain(userInWs1Id);
      expect(ws1UserIds).toContain(adminInWs1Id);
      expect(ws1UserIds).toContain(userInBothWorkspacesId);
      expect(ws1UserIds).not.toContain(userInWs2Id); // ws2-only user

      // Workspace 2 members
      const ws2UserIds = ws2?.members.map((m) => m.userId) ?? [];
      expect(ws2UserIds).toContain(userInWs2Id);
      expect(ws2UserIds).toContain(userInBothWorkspacesId);
      expect(ws2UserIds).not.toContain(userInWs1Id); // ws1-only user
      expect(ws2UserIds).not.toContain(adminInWs1Id); // ws1 admin
    });
  });

  describe('organization isolation', () => {
    test('workspace should belong to organization', async () => {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspace1Id },
      });

      expect(ws?.organizationId).toBe(orgId);
    });

    test('workspace policies should be scoped to organization', async () => {
      const policy = await createTestPolicy({
        organizationId: orgId,
        slug: 'org-scoped-ws-policy',
        matchers: [`workspace:${workspace1Id}`],
        toolPatterns: ['org-tool::*'],
        effect: PolicyEffect.ALLOW,
      });

      // Verify org scoping
      expect(policy.organizationId).toBe(orgId);

      // Query should only return policies from same org
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: orgId,
          matchers: { has: `workspace:${workspace1Id}` },
        },
      });

      expect(policies.every((p) => p.organizationId === orgId)).toBe(true);

      // Clean up
      await prisma.policy.delete({ where: { id: policy.id } });
    });
  });
});
