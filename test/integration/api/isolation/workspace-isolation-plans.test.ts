/**
 * Integration Tests: Workspace Data Isolation for Agent Plans
 * Tests that tRPC API properly isolates agent plan data between workspaces
 * Critical security requirement: Users can only access plans in their workspaces or org-wide plans
 *
 * Agent plans are workspace-scoped through:
 * - workspaceId field (null = org-wide, specific ID = workspace-scoped)
 * - conversationId which links to WorkspaceChatConversation (workspace-scoped)
 *
 * Access is enforced through workspace membership and ownership verification.
 */

import { AgentPlanStatus, WorkspaceMemberRole, prisma } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getPlan,
  listPlansForConversation,
} from '../../../../packages/api/src/services/agentPlan.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestRole,
  createTestUser,
  createTestWorkspace,
} from '../../../helpers/factory.js';
import { createTestTenant, type TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Workspace Agent Plan Isolation', () => {
  let tenant: TestTenant;

  // Users
  let orgOwnerId: string;
  let workspaceAMemberId: string;
  let workspaceBMemberId: string;
  let nonWorkspaceMemberId: string;

  // Workspaces
  let workspaceAId: string;
  let workspaceBId: string;

  // Conversations
  let workspaceAConversationId: string;
  let workspaceBConversationId: string;

  // Plans
  let orgWidePlanId: string;
  let workspaceAPlanId: string;
  let workspaceBPlanId: string;

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

    // Create user with workspace A membership
    const workspaceAMember = await createTestUser({ organizationId: tenant.orgId });
    workspaceAMemberId = workspaceAMember.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceAId,
        userId: workspaceAMemberId,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    // Create user with workspace B membership
    const workspaceBMember = await createTestUser({ organizationId: tenant.orgId });
    workspaceBMemberId = workspaceBMember.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceBId,
        userId: workspaceBMemberId,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    // Create user with no workspace memberships
    const nonWorkspaceMember = await createTestUser({ organizationId: tenant.orgId });
    nonWorkspaceMemberId = nonWorkspaceMember.id;

    // Create conversations for workspace members
    const workspaceAConversation = await prisma.workspaceChatConversation.create({
      data: {
        workspaceId: workspaceAId,
        userId: workspaceAMemberId,
        title: 'Workspace A Conversation',
      },
    });
    workspaceAConversationId = workspaceAConversation.id;

    const workspaceBConversation = await prisma.workspaceChatConversation.create({
      data: {
        workspaceId: workspaceBId,
        userId: workspaceBMemberId,
        title: 'Workspace B Conversation',
      },
    });
    workspaceBConversationId = workspaceBConversation.id;

    // Create plans with different scopes
    const orgWidePlan = await prisma.agentPlan.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: null, // Org-wide
        conversationId: workspaceAConversationId,
        userId: workspaceAMemberId,
        name: 'Org-Wide Plan',
        description: 'A plan accessible across the entire organization',
        status: AgentPlanStatus.DRAFT,
        totalSteps: 1,
        steps: {
          create: [
            {
              stepNumber: 0,
              toolName: 'test_tool',
              toolInput: {},
              description: 'Test step',
            },
          ],
        },
      },
    });
    orgWidePlanId = orgWidePlan.id;

    const workspaceAPlan = await prisma.agentPlan.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: workspaceAId,
        conversationId: workspaceAConversationId,
        userId: workspaceAMemberId,
        name: 'Workspace A Plan',
        description: 'A plan scoped to workspace A',
        status: AgentPlanStatus.DRAFT,
        totalSteps: 1,
        steps: {
          create: [
            {
              stepNumber: 0,
              toolName: 'test_tool',
              toolInput: {},
              description: 'Test step',
            },
          ],
        },
      },
    });
    workspaceAPlanId = workspaceAPlan.id;

    const workspaceBPlan = await prisma.agentPlan.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: workspaceBId,
        conversationId: workspaceBConversationId,
        userId: workspaceBMemberId,
        name: 'Workspace B Plan',
        description: 'A plan scoped to workspace B',
        status: AgentPlanStatus.DRAFT,
        totalSteps: 1,
        steps: {
          create: [
            {
              stepNumber: 0,
              toolName: 'test_tool',
              toolInput: {},
              description: 'Test step',
            },
          ],
        },
      },
    });
    workspaceBPlanId = workspaceBPlan.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // ============================================================================
  // Service-Level getPlan() Tests
  // ============================================================================

  describe('getPlan() workspace isolation', () => {
    test('getPlan with workspaceId filter returns workspace-scoped plan', async () => {
      const plan = await getPlan(workspaceAPlanId, tenant.orgId, workspaceAId);

      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(workspaceAPlanId);
      expect(plan?.name).toBe('Workspace A Plan');
      expect(plan?.workspaceId).toBe(workspaceAId);
    });

    test('getPlan with workspaceId filter returns org-wide plan', async () => {
      // Even when filtering by workspace A, org-wide plans should be visible
      const plan = await getPlan(orgWidePlanId, tenant.orgId, workspaceAId);

      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(orgWidePlanId);
      expect(plan?.name).toBe('Org-Wide Plan');
      expect(plan?.workspaceId).toBeNull();
    });

    test('getPlan with workspace A filter CANNOT see workspace B plan', async () => {
      // Trying to get workspace B plan while filtering for workspace A
      const plan = await getPlan(workspaceBPlanId, tenant.orgId, workspaceAId);

      expect(plan).toBeNull();
    });

    test('getPlan without workspaceId filter returns org-wide plan only', async () => {
      // Without workspace filter, only org-wide plans should be accessible
      const orgWidePlan = await getPlan(orgWidePlanId, tenant.orgId);
      expect(orgWidePlan).not.toBeNull();
      expect(orgWidePlan?.id).toBe(orgWidePlanId);

      // Workspace-scoped plans should not be accessible without workspace filter
      const workspacePlan = await getPlan(workspaceAPlanId, tenant.orgId);
      expect(workspacePlan).toBeNull();
    });

    test('getPlan enforces organization isolation', async () => {
      // Create another organization
      const otherOrg = await prisma.organization.create({
        data: { name: 'Other Org' },
      });

      try {
        // Trying to get plan from tenant org using other org's ID
        const plan = await getPlan(orgWidePlanId, otherOrg.id);
        expect(plan).toBeNull();
      } finally {
        await prisma.organization.delete({ where: { id: otherOrg.id } });
      }
    });
  });

  // ============================================================================
  // Service-Level listPlansForConversation() Tests
  // ============================================================================

  describe('listPlansForConversation() workspace isolation', () => {
    test('listPlansForConversation with workspace filter returns workspace-scoped plans', async () => {
      const plans = await listPlansForConversation(
        workspaceAConversationId,
        tenant.orgId,
        workspaceAId,
      );

      // Should see workspace A plan and org-wide plan (both in workspace A conversation)
      expect(plans.some((p) => p.id === workspaceAPlanId)).toBe(true);
      expect(plans.some((p) => p.id === orgWidePlanId)).toBe(true);

      // Should NOT see workspace B plan (different conversation)
      expect(plans.some((p) => p.id === workspaceBPlanId)).toBe(false);
    });

    test('listPlansForConversation without workspace filter returns only org-wide plans', async () => {
      // Without workspace filter, only org-wide plans in the conversation should be accessible
      const plans = await listPlansForConversation(workspaceAConversationId, tenant.orgId);

      expect(plans.some((p) => p.id === orgWidePlanId)).toBe(true);
      expect(plans.some((p) => p.id === workspaceAPlanId)).toBe(false);
    });

    test('listPlansForConversation for workspace B returns only workspace B plans', async () => {
      const plans = await listPlansForConversation(
        workspaceBConversationId,
        tenant.orgId,
        workspaceBId,
      );

      expect(plans.some((p) => p.id === workspaceBPlanId)).toBe(true);
      expect(plans.some((p) => p.id === workspaceAPlanId)).toBe(false);
      expect(plans.some((p) => p.id === orgWidePlanId)).toBe(false); // Org-wide plan is in different conversation
    });
  });

  // ============================================================================
  // Workspace Plan Router Tests (workspace.plan.*)
  // ============================================================================

  describe('workspace.plan.get isolation', () => {
    test('user in workspace A can get plan scoped to workspace A', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });
      const plan = await caller.workspace.plan.get({
        workspaceId: workspaceAId,
        planId: workspaceAPlanId,
      });

      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(workspaceAPlanId);
      expect(plan?.name).toBe('Workspace A Plan');
    });

    test('user in workspace A CANNOT get plan scoped to workspace B', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });

      // Should throw NOT_FOUND when trying to access workspace B plan via workspace A
      await expect(
        caller.workspace.plan.get({
          workspaceId: workspaceAId,
          planId: workspaceBPlanId,
        }),
      ).rejects.toThrow();
    });

    test('user can get org-wide plan via workspace membership', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });
      const plan = await caller.workspace.plan.get({
        workspaceId: workspaceAId,
        planId: orgWidePlanId,
      });

      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(orgWidePlanId);
      expect(plan?.name).toBe('Org-Wide Plan');
    });

    test('non-workspace member cannot get workspace-scoped plan', async () => {
      const user = await prisma.user.findUnique({
        where: { id: nonWorkspaceMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      // User has no workspace memberships
      const caller = createCallerWithUser(user, { workspaceIds: [] });

      // Trying to access workspace A plan - should fail
      await expect(
        caller.workspace.plan.get({
          workspaceId: workspaceAId,
          planId: workspaceAPlanId,
        }),
      ).rejects.toThrow();
    });
  });

  describe('workspace.plan.listForConversation isolation', () => {
    test('user in workspace A can list plans for workspace A conversation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });
      const plans = await caller.workspace.plan.listForConversation({
        workspaceId: workspaceAId,
        conversationId: workspaceAConversationId,
      });

      // Should see both workspace A plan and org-wide plan
      expect(plans.some((p) => p.id === workspaceAPlanId)).toBe(true);
      expect(plans.some((p) => p.id === orgWidePlanId)).toBe(true);
    });

    test('user in workspace A CANNOT list plans for workspace B conversation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });

      // Should throw NOT_FOUND for conversation in different workspace
      await expect(
        caller.workspace.plan.listForConversation({
          workspaceId: workspaceAId,
          conversationId: workspaceBConversationId,
        }),
      ).rejects.toThrow();
    });

    test('workspace B user cannot see workspace A plans', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceBMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceBId] });
      const plans = await caller.workspace.plan.listForConversation({
        workspaceId: workspaceBId,
        conversationId: workspaceBConversationId,
      });

      // Should only see workspace B plan
      expect(plans.some((p) => p.id === workspaceBPlanId)).toBe(true);
      expect(plans.some((p) => p.id === workspaceAPlanId)).toBe(false);
      expect(plans.some((p) => p.id === orgWidePlanId)).toBe(false);
    });
  });

  // ============================================================================
  // Workspace Plan Mutation Isolation Tests
  // ============================================================================

  describe('workspace.plan.approve isolation', () => {
    test('user in workspace A can approve plan in workspace A', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });
      const result = await caller.workspace.plan.approve({
        workspaceId: workspaceAId,
        planId: workspaceAPlanId,
      });

      expect(result.success).toBe(true);

      // Verify plan status changed
      const updatedPlan = await prisma.agentPlan.findUnique({
        where: { id: workspaceAPlanId },
      });
      expect(updatedPlan?.status).toBe(AgentPlanStatus.PENDING);
    });

    test('user in workspace A CANNOT approve plan in workspace B', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });

      // Should throw NOT_FOUND
      await expect(
        caller.workspace.plan.approve({
          workspaceId: workspaceAId,
          planId: workspaceBPlanId,
        }),
      ).rejects.toThrow();

      // Verify workspace B plan status is unchanged
      const plan = await prisma.agentPlan.findUnique({
        where: { id: workspaceBPlanId },
      });
      expect(plan?.status).toBe(AgentPlanStatus.DRAFT);
    });
  });

  describe('workspace.plan.abort isolation', () => {
    test('user in workspace A can abort plan in workspace A', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });
      const result = await caller.workspace.plan.abort({
        workspaceId: workspaceAId,
        planId: workspaceAPlanId,
      });

      expect(result.success).toBe(true);

      // Verify plan status changed
      const updatedPlan = await prisma.agentPlan.findUnique({
        where: { id: workspaceAPlanId },
      });
      expect(updatedPlan?.status).toBe(AgentPlanStatus.ABORTED);
    });

    test('user in workspace A CANNOT abort plan in workspace B', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });

      // Should throw NOT_FOUND
      await expect(
        caller.workspace.plan.abort({
          workspaceId: workspaceAId,
          planId: workspaceBPlanId,
        }),
      ).rejects.toThrow();

      // Verify workspace B plan status is unchanged
      const plan = await prisma.agentPlan.findUnique({
        where: { id: workspaceBPlanId },
      });
      expect(plan?.status).toBe(AgentPlanStatus.DRAFT);
    });
  });

  // ============================================================================
  // Org Owner Access Tests
  // ============================================================================

  describe('Org owner access', () => {
    test('org owner cannot read plans from another user conversation', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      // Org ownership grants reach across every workspace, but agent conversations
      // are per-user. Oversight of what agents did belongs to the audit log, not to
      // reading someone else's chat history.
      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });

      await expect(
        caller.workspace.plan.get({
          workspaceId: workspaceAId,
          planId: workspaceAPlanId,
        }),
      ).rejects.toThrow(/not found/i);

      await expect(
        caller.workspace.plan.get({
          workspaceId: workspaceBId,
          planId: workspaceBPlanId,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  // ============================================================================
  // Cross-Workspace Security Tests
  // ============================================================================

  describe('Cross-workspace security', () => {
    test('should not leak workspace information in error messages', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [workspaceAId] });

      try {
        await caller.workspace.plan.get({
          workspaceId: workspaceAId,
          planId: workspaceBPlanId,
        });
        throw new Error('Should have thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Error should not mention workspace B details
        expect(errorMessage).not.toContain('Workspace B');
        expect(errorMessage).not.toContain(workspaceBId);
        expect(errorMessage.toLowerCase()).toContain('not found');
      }
    });

    test('workspace membership alone does not grant access to another user plans', async () => {
      // Add workspace B membership to workspace A member
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceBId,
          userId: workspaceAMemberId,
          role: WorkspaceMemberRole.MEMBER,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId, workspaceBId],
      });

      // Their own conversation in workspace A stays readable
      const planA = await caller.workspace.plan.get({
        workspaceId: workspaceAId,
        planId: workspaceAPlanId,
      });
      expect(planA).not.toBeNull();

      // But joining workspace B does not grant access to another member's
      // conversation there - membership is not conversation ownership
      await expect(
        caller.workspace.plan.get({
          workspaceId: workspaceBId,
          planId: workspaceBPlanId,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  // ============================================================================
  // Plan-Conversation Ownership Tests
  // ============================================================================

  describe('Plan-conversation ownership', () => {
    test('user cannot access plan from conversation they do not own', async () => {
      // Create another user in workspace A
      const otherUser = await createTestUser({ organizationId: tenant.orgId });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceAId,
          userId: otherUser.id,
          role: WorkspaceMemberRole.MEMBER,
        },
      });

      const userWithRoles = await prisma.user.findUnique({
        where: { id: otherUser.id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!userWithRoles) throw new Error('User not found');

      const caller = createCallerWithUser(userWithRoles, { workspaceIds: [workspaceAId] });

      // Should throw because the plan's conversation belongs to a different user
      await expect(
        caller.workspace.plan.get({
          workspaceId: workspaceAId,
          planId: workspaceAPlanId,
        }),
      ).rejects.toThrow();
    });

    test('user can only list plans from conversations they own', async () => {
      // Create another user in workspace A
      const otherUser = await createTestUser({ organizationId: tenant.orgId });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceAId,
          userId: otherUser.id,
          role: WorkspaceMemberRole.MEMBER,
        },
      });

      // Create a conversation for the other user
      const otherConversation = await prisma.workspaceChatConversation.create({
        data: {
          workspaceId: workspaceAId,
          userId: otherUser.id,
          title: 'Other User Conversation',
        },
      });

      const userWithRoles = await prisma.user.findUnique({
        where: { id: otherUser.id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!userWithRoles) throw new Error('User not found');

      const caller = createCallerWithUser(userWithRoles, { workspaceIds: [workspaceAId] });

      // Should return empty list because there are no plans in their conversation
      const plans = await caller.workspace.plan.listForConversation({
        workspaceId: workspaceAId,
        conversationId: otherConversation.id,
      });

      expect(plans).toHaveLength(0);

      // Trying to list from original user's conversation should throw
      await expect(
        caller.workspace.plan.listForConversation({
          workspaceId: workspaceAId,
          conversationId: workspaceAConversationId,
        }),
      ).rejects.toThrow();
    });
  });
});
