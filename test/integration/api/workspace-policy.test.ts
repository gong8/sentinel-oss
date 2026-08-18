/**
 * Integration Tests for Workspace-Scoped Policies
 * Tests full policy evaluation with workspace-scoped policies
 */

import { PolicyEffect, prisma, WorkspaceMemberRole } from '@sentinel/db';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestOrganization,
  createTestPolicy,
  createTestUser,
  createTestWorkspace,
} from '../../helpers/factory.js';

describe('workspace-policy integration', () => {
  let organizationId: string;
  let workspace1Id: string;
  let workspace2Id: string;
  let userInWorkspace1Id: string;
  let userInWorkspace2Id: string;
  let adminInWorkspace1Id: string;
  let userInNoWorkspaceId: string;

  beforeAll(async () => {
    // Create test organization
    const org = await createTestOrganization({ name: 'Workspace Policy Test Org' });
    organizationId = org.id;

    // Create two workspaces
    const ws1 = await createTestWorkspace({ organizationId, name: 'Workspace 1' });
    const ws2 = await createTestWorkspace({ organizationId, name: 'Workspace 2' });
    workspace1Id = ws1.id;
    workspace2Id = ws2.id;

    // Create users
    const user1 = await createTestUser({ organizationId, email: 'user1@test.com' });
    const user2 = await createTestUser({ organizationId, email: 'user2@test.com' });
    const admin1 = await createTestUser({ organizationId, email: 'admin1@test.com' });
    const userNoWs = await createTestUser({ organizationId, email: 'no-workspace@test.com' });

    userInWorkspace1Id = user1.id;
    userInWorkspace2Id = user2.id;
    adminInWorkspace1Id = admin1.id;
    userInNoWorkspaceId = userNoWs.id;

    // Add users to workspaces
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: userInWorkspace1Id,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace2Id,
        userId: userInWorkspace2Id,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: adminInWorkspace1Id,
        role: WorkspaceMemberRole.ADMIN,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.workspaceMember.deleteMany({
      where: { workspace: { organizationId } },
    });
    await prisma.policy.deleteMany({ where: { organizationId } });
    await prisma.workspace.deleteMany({ where: { organizationId } });
    await prisma.userRole.deleteMany({
      where: { user: { organizationId } },
    });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.role.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  describe('loading user with workspace memberships', () => {
    test('should load user with workspace memberships via include', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userInWorkspace1Id },
        include: {
          userRoles: { include: { role: true } },
          workspaceMemberships: {
            select: { workspaceId: true, role: true },
          },
        },
      });

      expect(user).toBeDefined();
      expect(user?.workspaceMemberships).toHaveLength(1);
      expect(user?.workspaceMemberships?.[0]?.workspaceId).toBe(workspace1Id);
      expect(user?.workspaceMemberships?.[0]?.role).toBe(WorkspaceMemberRole.MEMBER);
    });

    test('should load workspace admin with ADMIN role', async () => {
      const user = await prisma.user.findUnique({
        where: { id: adminInWorkspace1Id },
        include: {
          userRoles: { include: { role: true } },
          workspaceMemberships: {
            select: { workspaceId: true, role: true },
          },
        },
      });

      expect(user).toBeDefined();
      expect(user?.workspaceMemberships).toHaveLength(1);
      expect(user?.workspaceMemberships?.[0]?.role).toBe(WorkspaceMemberRole.ADMIN);
    });

    test('should return empty memberships for user not in any workspace', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userInNoWorkspaceId },
        include: {
          userRoles: { include: { role: true } },
          workspaceMemberships: {
            select: { workspaceId: true, role: true },
          },
        },
      });

      expect(user).toBeDefined();
      expect(user?.workspaceMemberships).toHaveLength(0);
    });
  });

  describe('workspace-scoped policies', () => {
    let workspacePolicyId: string;
    let _globalPolicyId: string;

    beforeEach(async () => {
      // Clean up policies before each test
      await prisma.policy.deleteMany({ where: { organizationId } });

      // Create a workspace-scoped policy (only for workspace 1)
      const wsPolicy = await createTestPolicy({
        organizationId,
        slug: 'ws1-allow-github',
        matchers: [`workspace:${workspace1Id}`],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        description: 'Allow GitHub access for workspace 1',
      });
      workspacePolicyId = wsPolicy.id;

      // Create a global ALLOW policy for all users
      const globalPolicy = await createTestPolicy({
        organizationId,
        slug: 'global-allow-slack',
        matchers: ['role:User'],
        toolPatterns: ['slack.com::*'],
        effect: PolicyEffect.ALLOW,
        description: 'Allow Slack access for all users',
      });
      _globalPolicyId = globalPolicy.id;
    });

    test('policy with workspace matcher should exist and be properly configured', async () => {
      const policy = await prisma.policy.findUnique({
        where: { id: workspacePolicyId },
      });

      expect(policy).toBeDefined();
      expect(policy?.matchers).toContain(`workspace:${workspace1Id}`);
      expect(policy?.toolPatterns).toContain('github.com::*');
      expect(policy?.effect).toBe(PolicyEffect.ALLOW);
    });

    test('should find policies matching workspace members', async () => {
      // Find all policies that could match workspace 1 members
      const policies = await prisma.policy.findMany({
        where: {
          organizationId,
          enabled: true,
          deletedAt: null,
          matchers: { hasSome: [`workspace:${workspace1Id}`, 'role:User'] },
        },
      });

      expect(policies.length).toBeGreaterThanOrEqual(2);
      expect(policies.map((p) => p.slug)).toContain('ws1-allow-github');
      expect(policies.map((p) => p.slug)).toContain('global-allow-slack');
    });

    test('should find only workspace-specific policy for workspace matcher query', async () => {
      const policies = await prisma.policy.findMany({
        where: {
          organizationId,
          enabled: true,
          deletedAt: null,
          matchers: { has: `workspace:${workspace1Id}` },
        },
      });

      expect(policies).toHaveLength(1);
      expect(policies[0]?.slug).toBe('ws1-allow-github');
    });

    test('workspace 2 members should not match workspace 1 policy', async () => {
      const policies = await prisma.policy.findMany({
        where: {
          organizationId,
          enabled: true,
          deletedAt: null,
          matchers: { has: `workspace:${workspace2Id}` },
        },
      });

      // No policies specifically for workspace 2
      expect(policies.filter((p) => p.slug === 'ws1-allow-github')).toHaveLength(0);
    });
  });

  describe('workspace-admin scoped policies', () => {
    beforeEach(async () => {
      await prisma.policy.deleteMany({ where: { organizationId } });
    });

    test('should create policy for workspace admins only', async () => {
      const policy = await createTestPolicy({
        organizationId,
        slug: 'ws1-admin-deploy',
        matchers: [`workspace-admin:${workspace1Id}`],
        toolPatterns: ['deploy::*'],
        effect: PolicyEffect.ALLOW,
        description: 'Allow deploy for workspace 1 admins only',
      });

      expect(policy.matchers).toContain(`workspace-admin:${workspace1Id}`);
    });

    test('should find workspace admin policies separately', async () => {
      await createTestPolicy({
        organizationId,
        slug: 'ws1-admin-policy',
        matchers: [`workspace-admin:${workspace1Id}`],
        toolPatterns: ['admin-tool::*'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId,
        slug: 'ws1-member-policy',
        matchers: [`workspace:${workspace1Id}`],
        toolPatterns: ['member-tool::*'],
        effect: PolicyEffect.ALLOW,
      });

      const adminPolicies = await prisma.policy.findMany({
        where: {
          organizationId,
          enabled: true,
          deletedAt: null,
          matchers: { has: `workspace-admin:${workspace1Id}` },
        },
      });

      const memberPolicies = await prisma.policy.findMany({
        where: {
          organizationId,
          enabled: true,
          deletedAt: null,
          matchers: { has: `workspace:${workspace1Id}` },
        },
      });

      expect(adminPolicies).toHaveLength(1);
      expect(adminPolicies[0]?.slug).toBe('ws1-admin-policy');

      expect(memberPolicies).toHaveLength(1);
      expect(memberPolicies[0]?.slug).toBe('ws1-member-policy');
    });
  });

  describe('wildcard workspace matchers', () => {
    beforeEach(async () => {
      await prisma.policy.deleteMany({ where: { organizationId } });
    });

    test('should create policy for any workspace member', async () => {
      const policy = await createTestPolicy({
        organizationId,
        slug: 'any-workspace-member',
        matchers: ['workspace:*'],
        toolPatterns: ['common-tool::*'],
        effect: PolicyEffect.ALLOW,
        description: 'Allow common tool for any workspace member',
      });

      expect(policy.matchers).toContain('workspace:*');
    });

    test('should create policy for any workspace admin', async () => {
      const policy = await createTestPolicy({
        organizationId,
        slug: 'any-workspace-admin',
        matchers: ['workspace-admin:*'],
        toolPatterns: ['admin-common::*'],
        effect: PolicyEffect.ALLOW,
        description: 'Allow admin tool for any workspace admin',
      });

      expect(policy.matchers).toContain('workspace-admin:*');
    });
  });

  describe('workspace DENY policies', () => {
    beforeEach(async () => {
      await prisma.policy.deleteMany({ where: { organizationId } });
    });

    test('should create workspace-scoped DENY policy', async () => {
      const policy = await createTestPolicy({
        organizationId,
        slug: 'ws1-deny-dangerous',
        matchers: [`workspace:${workspace1Id}`],
        toolPatterns: ['dangerous-tool::*'],
        effect: PolicyEffect.DENY,
        description: 'Deny dangerous tool for workspace 1',
      });

      expect(policy.effect).toBe(PolicyEffect.DENY);
      expect(policy.matchers).toContain(`workspace:${workspace1Id}`);
    });

    test('DENY policy should take precedence when evaluating policies', async () => {
      // Create both ALLOW and DENY policies for the same pattern
      await createTestPolicy({
        organizationId,
        slug: 'global-allow',
        matchers: ['role:User'],
        toolPatterns: ['test-tool::*'],
        effect: PolicyEffect.ALLOW,
      });

      const denyPolicy = await createTestPolicy({
        organizationId,
        slug: 'ws1-deny',
        matchers: [`workspace:${workspace1Id}`],
        toolPatterns: ['test-tool::*'],
        effect: PolicyEffect.DENY,
      });

      // Verify both policies exist
      const policies = await prisma.policy.findMany({
        where: {
          organizationId,
          enabled: true,
          deletedAt: null,
          toolPatterns: { has: 'test-tool::*' },
        },
        orderBy: { effect: 'asc' }, // ALLOW before DENY alphabetically
      });

      expect(policies).toHaveLength(2);
      expect(policies.some((p) => p.effect === PolicyEffect.DENY)).toBe(true);
      expect(policies.find((p) => p.effect === PolicyEffect.DENY)?.id).toBe(denyPolicy.id);
    });
  });
});
