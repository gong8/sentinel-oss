/**
 * Integration Tests: Workspace Data Isolation for Agents
 * Tests that tRPC API properly isolates agent data between workspaces
 * Critical security requirement: Users can only access agents in their workspaces or org-wide agents
 *
 * Note: admin.agents.* routes require admin role. Workspace isolation is enforced
 * through workspaceIds in the auth context, not through workspace membership per se.
 * Admins are workspace-scoped based on their workspaceIds context.
 */

import { WorkspaceMemberRole, prisma } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestAgent,
  createTestRole,
  createTestWorkspace,
} from '../../../helpers/factory.js';
import { createTestTenant, type TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Workspace Agent Isolation', () => {
  let tenant: TestTenant;

  // Admins (must be admins to access admin.agents.* routes)
  let orgOwnerId: string;
  let workspaceAAdminId: string;
  let workspaceBAdminId: string;
  let noWorkspaceAdminId: string;

  // Workspaces
  let workspaceAId: string;
  let workspaceBId: string;

  // Agents
  let orgWideAgentId: string;
  let workspaceAAgentId: string;
  let workspaceBAgentId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    // Create roles
    await createTestRole({
      organizationId: tenant.orgId,
      name: 'Admin',
      isAdmin: true,
    });
    await createTestRole({
      organizationId: tenant.orgId,
      name: 'User',
      isAdmin: false,
    });

    // Create workspaces
    const workspaceA = await createTestWorkspace({
      organizationId: tenant.orgId,
      name: 'Workspace A',
    });
    workspaceAId = workspaceA.id;

    const workspaceB = await createTestWorkspace({
      organizationId: tenant.orgId,
      name: 'Workspace B',
    });
    workspaceBId = workspaceB.id;

    // Create org owner (has access to all workspaces)
    const orgOwner = await createTestAdmin({ organizationId: tenant.orgId });
    orgOwnerId = orgOwner.id;
    await prisma.orgOwner.create({
      data: {
        organizationId: tenant.orgId,
        userId: orgOwnerId,
      },
    });

    // Create admin with workspace A membership
    const workspaceAAdmin = await createTestAdmin({ organizationId: tenant.orgId });
    workspaceAAdminId = workspaceAAdmin.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceAId,
        userId: workspaceAAdminId,
        role: WorkspaceMemberRole.ADMIN,
      },
    });

    // Create admin with workspace B membership
    const workspaceBAdmin = await createTestAdmin({ organizationId: tenant.orgId });
    workspaceBAdminId = workspaceBAdmin.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceBId,
        userId: workspaceBAdminId,
        role: WorkspaceMemberRole.ADMIN,
      },
    });

    // Create admin with no workspace memberships
    const noWorkspaceAdmin = await createTestAdmin({ organizationId: tenant.orgId });
    noWorkspaceAdminId = noWorkspaceAdmin.id;

    // Create agents with different scopes
    const orgWideAgent = await createTestAgent({
      organizationId: tenant.orgId,
      name: 'Org-Wide Agent',
      workspaceId: null, // Org-wide
    });
    orgWideAgentId = orgWideAgent.id;

    const workspaceAAgent = await createTestAgent({
      organizationId: tenant.orgId,
      name: 'Workspace A Agent',
      workspaceId: workspaceAId,
    });
    workspaceAAgentId = workspaceAAgent.id;

    const workspaceBAgent = await createTestAgent({
      organizationId: tenant.orgId,
      name: 'Workspace B Agent',
      workspaceId: workspaceBId,
    });
    workspaceBAgentId = workspaceBAgent.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // ============================================================================
  // Agent List Isolation Tests
  // ============================================================================

  describe('Agent list isolation', () => {
    test('admin in workspace A can list agents scoped to workspace A', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId] });
      const agents = await caller.admin.agents.list();

      // Should see workspace A agent
      expect(agents.some((a) => a.id === workspaceAAgentId)).toBe(true);
      expect(agents.some((a) => a.name === 'Workspace A Agent')).toBe(true);
    });

    test('org admin can see agents from all workspaces', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Org admins have full access to all workspaces
      const caller = createCallerWithUser(admin);
      const agents = await caller.admin.agents.list();

      // Should see all agents including workspace B agent
      expect(agents.some((a) => a.id === workspaceAAgentId)).toBe(true);
      expect(agents.some((a) => a.id === workspaceBAgentId)).toBe(true);
      expect(agents.some((a) => a.id === orgWideAgentId)).toBe(true);
    });

    test('admin can see org-wide agents (workspaceId: null)', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId] });
      const agents = await caller.admin.agents.list();

      // Should see org-wide agent
      expect(agents.some((a) => a.id === orgWideAgentId)).toBe(true);
      expect(agents.some((a) => a.name === 'Org-Wide Agent')).toBe(true);
    });

    test('org owner can see all agents across all workspaces', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });
      const agents = await caller.admin.agents.list();

      // Should see all agents
      expect(agents.some((a) => a.id === orgWideAgentId)).toBe(true);
      expect(agents.some((a) => a.id === workspaceAAgentId)).toBe(true);
      expect(agents.some((a) => a.id === workspaceBAgentId)).toBe(true);
    });

    test('org admin without workspace membership can see all agents', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: noWorkspaceAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Even without workspace memberships, org admins have full access
      const caller = createCallerWithUser(admin);
      const agents = await caller.admin.agents.list();

      // Org admin should see all agents
      expect(agents.some((a) => a.id === orgWideAgentId)).toBe(true);
      expect(agents.some((a) => a.id === workspaceAAgentId)).toBe(true);
      expect(agents.some((a) => a.id === workspaceBAgentId)).toBe(true);
    });

    test('admin in both workspaces can see agents from both workspaces', async () => {
      // Add workspace B membership to workspace A admin
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceBId,
          userId: workspaceAAdminId,
          role: WorkspaceMemberRole.MEMBER,
        },
      });

      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId, workspaceBId] });
      const agents = await caller.admin.agents.list();

      // Should see all agents
      expect(agents.some((a) => a.id === orgWideAgentId)).toBe(true);
      expect(agents.some((a) => a.id === workspaceAAgentId)).toBe(true);
      expect(agents.some((a) => a.id === workspaceBAgentId)).toBe(true);
    });
  });

  // ============================================================================
  // Agent Get Isolation Tests
  // ============================================================================

  describe('Agent get isolation', () => {
    test('admin in workspace A can get agent scoped to workspace A', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId] });
      const agent = await caller.admin.agents.get({ id: workspaceAAgentId });

      expect(agent).toBeDefined();
      expect(agent.id).toBe(workspaceAAgentId);
      expect(agent.name).toBe('Workspace A Agent');
    });

    test('admin can get org-wide agent', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId] });
      const agent = await caller.admin.agents.get({ id: orgWideAgentId });

      expect(agent).toBeDefined();
      expect(agent.id).toBe(orgWideAgentId);
      expect(agent.name).toBe('Org-Wide Agent');
    });

    test('org owner can get workspace-scoped agent', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });
      const agent = await caller.admin.agents.get({ id: workspaceBAgentId });

      expect(agent).toBeDefined();
      expect(agent.id).toBe(workspaceBAgentId);
    });
  });

  // ============================================================================
  // Agent Create Isolation Tests
  // ============================================================================

  describe('Agent create isolation', () => {
    test('workspace admin can create workspace-scoped agent', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      const agent = await caller.admin.agents.create({
        name: 'New Workspace A Agent',
        workspaceId: workspaceAId,
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe('New Workspace A Agent');
      expect(agent.workspaceId).toBe(workspaceAId);
      expect(agent.organizationId).toBe(tenant.orgId);
    });

    test('org admin can create agent in any workspace', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Org admin has full access to all workspaces
      const caller = createCallerWithUser(admin);

      // Should be able to create agent in workspace B even though they're only a member of A
      const agent = await caller.admin.agents.create({
        name: 'Cross-Workspace Agent',
        workspaceId: workspaceBId,
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe('Cross-Workspace Agent');
      expect(agent.workspaceId).toBe(workspaceBId);
    });

    test('org owner can create agent in any workspace', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });

      const agentA = await caller.admin.agents.create({
        name: 'Owner Created Agent A',
        workspaceId: workspaceAId,
      });

      const agentB = await caller.admin.agents.create({
        name: 'Owner Created Agent B',
        workspaceId: workspaceBId,
      });

      expect(agentA.workspaceId).toBe(workspaceAId);
      expect(agentB.workspaceId).toBe(workspaceBId);
    });

    test('admin can create org-wide agent (null workspaceId)', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      const agent = await caller.admin.agents.create({
        name: 'New Org-Wide Agent',
        // No workspaceId - org-wide
      });

      expect(agent).toBeDefined();
      expect(agent.workspaceId).toBeNull();
      expect(agent.organizationId).toBe(tenant.orgId);
    });
  });

  // ============================================================================
  // Org Admin Access Tests
  // ============================================================================

  describe('Org admin access', () => {
    test('org admin can see all workspace-scoped agents in list', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: noWorkspaceAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Admin has isAdmin: true, so they can see all agents
      const caller = createCallerWithUser(admin);
      const agents = await caller.admin.agents.list();

      // Admin should see all agents (org-wide + both workspace-scoped)
      expect(agents.length).toBe(3);
      expect(agents.map((a) => a.id)).toContain(orgWideAgentId);
      expect(agents.map((a) => a.id)).toContain(workspaceAAgentId);
      expect(agents.map((a) => a.id)).toContain(workspaceBAgentId);
    });

    test('org admin can create agent in any workspace', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: noWorkspaceAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Admin can create agent in workspace A even without membership
      const newAgent = await caller.admin.agents.create({
        name: 'Admin Created Agent',
        workspaceId: workspaceAId,
      });

      expect(newAgent).toBeDefined();
      expect(newAgent.workspaceId).toBe(workspaceAId);
    });
  });

  // ============================================================================
  // Workspace Filter Tests
  // ============================================================================

  describe('Workspace filter in list', () => {
    test('org owner can filter by specific workspaceId', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });

      // Filter for workspace A only
      const agentsA = await caller.admin.agents.list({ workspaceId: workspaceAId });
      expect(agentsA.every((a) => a.workspaceId === workspaceAId)).toBe(true);
      expect(agentsA.some((a) => a.id === workspaceAAgentId)).toBe(true);

      // Filter for workspace B only
      const agentsB = await caller.admin.agents.list({ workspaceId: workspaceBId });
      expect(agentsB.every((a) => a.workspaceId === workspaceBId)).toBe(true);
      expect(agentsB.some((a) => a.id === workspaceBAgentId)).toBe(true);

      // Filter for org-wide only (null)
      const orgWideAgents = await caller.admin.agents.list({ workspaceId: null });
      expect(orgWideAgents.every((a) => a.workspaceId === null)).toBe(true);
      expect(orgWideAgents.some((a) => a.id === orgWideAgentId)).toBe(true);
    });
  });

  // ============================================================================
  // Cross-Workspace Security Tests
  // ============================================================================

  describe('Cross-workspace security', () => {
    test('should not leak workspace information in error messages', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId] });

      try {
        await caller.admin.agents.create({
          name: 'Cross-Workspace Agent',
          workspaceId: workspaceBId,
        });
        throw new Error('Should have thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Error should not mention workspace B details
        expect(errorMessage).not.toContain('Workspace B');
        expect(errorMessage).not.toContain(workspaceBId);
      }
    });

    test('deleted workspace-scoped agent should not be visible', async () => {
      // Soft delete workspace A agent
      await prisma.agent.update({
        where: { id: workspaceAAgentId },
        data: { deletedAt: new Date(), deletedBy: orgOwnerId },
      });

      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId] });
      const agents = await caller.admin.agents.list();

      // Should not see deleted agent
      expect(agents.some((a) => a.id === workspaceAAgentId)).toBe(false);
    });

    test('includeDeleted flag shows deleted workspace-scoped agents', async () => {
      // Soft delete workspace A agent
      await prisma.agent.update({
        where: { id: workspaceAAgentId },
        data: { deletedAt: new Date(), deletedBy: orgOwnerId },
      });

      const admin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { workspaceIds: [workspaceAId] });
      const agents = await caller.admin.agents.list({ includeDeleted: true });

      // Should see deleted agent when includeDeleted is true
      expect(agents.some((a) => a.id === workspaceAAgentId)).toBe(true);
      const deletedAgent = agents.find((a) => a.id === workspaceAAgentId);
      expect(deletedAgent?.deletedAt).not.toBeNull();
    });
  });
});
