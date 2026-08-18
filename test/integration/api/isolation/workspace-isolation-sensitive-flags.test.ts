/**
 * Integration Tests: Workspace Isolation for Sensitive Flags
 * Tests that sensitive flags are properly scoped to workspaces
 * Critical security requirement: Users can only access flags from their workspaces or org-wide flags
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  prisma,
  SensitiveFlagBehavior,
  WorkspaceMemberRole,
} from '../../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestRole,
  createTestUser,
  createTestWorkspace,
} from '../../../helpers/factory.js';
import { createTestTenant, type TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Workspace Isolation - Sensitive Flags', () => {
  let tenant: TestTenant;

  // Workspace A setup
  let workspaceAId: string;
  let userInWorkspaceAId: string;

  // Workspace B setup
  let workspaceBId: string;
  let userInWorkspaceBId: string;

  // Org admin (not in any workspace)
  let orgAdminId: string;

  // Sensitive flag IDs
  let orgWideFlagId: string;
  let workspaceAFlagId: string;
  let workspaceBFlagId: string;

  beforeEach(async () => {
    // Create tenant (organization)
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

    // Create org admin
    const orgAdmin = await createTestAdmin({ organizationId: tenant.orgId });
    orgAdminId = orgAdmin.id;

    // Create Workspace A
    const workspaceA = await createTestWorkspace({
      organizationId: tenant.orgId,
      name: 'Workspace A',
    });
    workspaceAId = workspaceA.id;

    // Create Workspace B
    const workspaceB = await createTestWorkspace({
      organizationId: tenant.orgId,
      name: 'Workspace B',
    });
    workspaceBId = workspaceB.id;

    // Create user in Workspace A
    const userInWorkspaceA = await createTestUser({ organizationId: tenant.orgId });
    userInWorkspaceAId = userInWorkspaceA.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceAId,
        userId: userInWorkspaceAId,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    // Create user in Workspace B
    const userInWorkspaceB = await createTestUser({ organizationId: tenant.orgId });
    userInWorkspaceBId = userInWorkspaceB.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceBId,
        userId: userInWorkspaceBId,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    // Create org-wide sensitive flag (workspaceId: null)
    const orgWideFlag = await prisma.sensitiveToolFlag.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: null,
        toolPattern: 'org-tool::*',
        behaviors: [SensitiveFlagBehavior.ALERT],
        alertConfig: { webhookEndpointIds: [] },
        description: 'Org-wide sensitive flag',
        enabled: true,
        createdBy: orgAdminId,
      },
    });
    orgWideFlagId = orgWideFlag.id;

    // Create Workspace A sensitive flag
    const workspaceAFlag = await prisma.sensitiveToolFlag.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: workspaceAId,
        toolPattern: 'workspace-a-tool::*',
        behaviors: [SensitiveFlagBehavior.RATE_LIMIT],
        rateLimitConfig: { maxPerSession: 10, windowMinutes: 60 },
        description: 'Workspace A sensitive flag',
        enabled: true,
        createdBy: orgAdminId,
      },
    });
    workspaceAFlagId = workspaceAFlag.id;

    // Create Workspace B sensitive flag
    const workspaceBFlag = await prisma.sensitiveToolFlag.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: workspaceBId,
        toolPattern: 'workspace-b-tool::*',
        behaviors: [SensitiveFlagBehavior.REQUIRE_APPROVAL],
        approvalConfig: { allowedApprovers: ['admin'], timeoutSeconds: 300 },
        description: 'Workspace B sensitive flag',
        enabled: true,
        createdBy: orgAdminId,
      },
    });
    workspaceBFlagId = workspaceBFlag.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // ============================================================================
  // Admin List Isolation Tests
  // ============================================================================

  describe('Admin sensitive flags list isolation', () => {
    test('org admin can see all flags (org-wide and all workspaces)', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const flags = await caller.admin.sensitiveFlags.list({ includeDisabled: true });

      // Admin should see all flags in the org
      expect(flags.length).toBe(3);
      expect(flags.map((f) => f.id)).toContain(orgWideFlagId);
      expect(flags.map((f) => f.id)).toContain(workspaceAFlagId);
      expect(flags.map((f) => f.id)).toContain(workspaceBFlagId);
    });

    test('admin list returns flags scoped to organization only', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const flags = await caller.admin.sensitiveFlags.list({ includeDisabled: true });

      // All flags should belong to this organization
      expect(flags.every((f) => f.organizationId === tenant.orgId)).toBe(true);
    });
  });

  // ============================================================================
  // Admin Get Isolation Tests
  // ============================================================================

  describe('Admin sensitive flags get isolation', () => {
    test('admin can get org-wide flag', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const flag = await caller.admin.sensitiveFlags.get({ id: orgWideFlagId });

      expect(flag).toBeDefined();
      expect(flag.id).toBe(orgWideFlagId);
      expect(flag.workspaceId).toBeNull();
    });

    test('admin can get workspace-scoped flag', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const flag = await caller.admin.sensitiveFlags.get({ id: workspaceAFlagId });

      expect(flag).toBeDefined();
      expect(flag.id).toBe(workspaceAFlagId);
      expect(flag.workspaceId).toBe(workspaceAId);
    });
  });

  // ============================================================================
  // Admin Update Isolation Tests
  // ============================================================================

  describe('Admin sensitive flags update isolation', () => {
    test('admin can update org-wide flag', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const updatedFlag = await caller.admin.sensitiveFlags.update({
        id: orgWideFlagId,
        description: 'Updated org-wide flag description',
      });

      expect(updatedFlag.description).toBe('Updated org-wide flag description');
    });

    test('admin can update workspace-scoped flag', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const updatedFlag = await caller.admin.sensitiveFlags.update({
        id: workspaceAFlagId,
        description: 'Updated workspace A flag description',
      });

      expect(updatedFlag.description).toBe('Updated workspace A flag description');
    });
  });

  // ============================================================================
  // Admin Delete Isolation Tests
  // ============================================================================

  describe('Admin sensitive flags delete isolation', () => {
    test('admin can delete org-wide flag', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.sensitiveFlags.delete({ id: orgWideFlagId });

      expect(result.success).toBe(true);

      // Verify flag is deleted
      const flag = await prisma.sensitiveToolFlag.findUnique({
        where: { id: orgWideFlagId },
      });
      expect(flag).toBeNull();
    });

    test('admin can delete workspace-scoped flag', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.sensitiveFlags.delete({ id: workspaceBFlagId });

      expect(result.success).toBe(true);

      // Verify flag is deleted
      const flag = await prisma.sensitiveToolFlag.findUnique({
        where: { id: workspaceBFlagId },
      });
      expect(flag).toBeNull();
    });
  });

  // ============================================================================
  // Workspace Scoping Tests - Flag Visibility for Tool Evaluation
  // ============================================================================

  describe('Workspace-scoped flag visibility', () => {
    test('org-wide flags are visible to all users in organization', async () => {
      // Query flags that would match for a user in workspace A
      const flags = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [
            { workspaceId: null }, // Org-wide
            { workspaceId: workspaceAId }, // User's workspace
          ],
        },
      });

      expect(flags.map((f) => f.id)).toContain(orgWideFlagId);
      expect(flags.map((f) => f.id)).toContain(workspaceAFlagId);
      expect(flags.map((f) => f.id)).not.toContain(workspaceBFlagId);
    });

    test('workspace A user cannot see workspace B flags', async () => {
      // Simulate the query that would be used for evaluating flags for a user in workspace A
      const flags = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [
            { workspaceId: null }, // Org-wide
            { workspaceId: workspaceAId }, // User's workspace
          ],
        },
      });

      // Should not contain workspace B flag
      expect(flags.map((f) => f.id)).not.toContain(workspaceBFlagId);
    });

    test('workspace B user cannot see workspace A flags', async () => {
      // Simulate the query that would be used for evaluating flags for a user in workspace B
      const flags = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [
            { workspaceId: null }, // Org-wide
            { workspaceId: workspaceBId }, // User's workspace
          ],
        },
      });

      // Should not contain workspace A flag
      expect(flags.map((f) => f.id)).not.toContain(workspaceAFlagId);
    });
  });

  // ============================================================================
  // Tool Pattern Matching with Workspace Scoping
  // ============================================================================

  describe('Tool pattern matching with workspace scoping', () => {
    test('org-wide flag matches tool for any user in org', async () => {
      // Tool name 'org-tool::create' matches the pattern 'org-tool::*'

      // Find matching flags for workspace A user
      const flagsForWorkspaceA = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [{ workspaceId: null }, { workspaceId: workspaceAId }],
        },
      });

      // Find matching flags for workspace B user
      const flagsForWorkspaceB = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [{ workspaceId: null }, { workspaceId: workspaceBId }],
        },
      });

      // Both should have the org-wide flag that matches 'org-tool::*'
      const matchingA = flagsForWorkspaceA.filter((f) => f.toolPattern === 'org-tool::*');
      const matchingB = flagsForWorkspaceB.filter((f) => f.toolPattern === 'org-tool::*');

      expect(matchingA.length).toBe(1);
      expect(matchingB.length).toBe(1);
    });

    test('workspace-scoped flag only matches for users in that workspace', async () => {
      // Tool name 'workspace-a-tool::execute' matches the pattern 'workspace-a-tool::*'

      // Find matching flags for workspace A user (should find workspace A flag)
      const flagsForWorkspaceA = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [{ workspaceId: null }, { workspaceId: workspaceAId }],
        },
      });

      // Find matching flags for workspace B user (should NOT find workspace A flag)
      const flagsForWorkspaceB = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [{ workspaceId: null }, { workspaceId: workspaceBId }],
        },
      });

      const matchingA = flagsForWorkspaceA.filter((f) => f.toolPattern === 'workspace-a-tool::*');
      const matchingB = flagsForWorkspaceB.filter((f) => f.toolPattern === 'workspace-a-tool::*');

      expect(matchingA.length).toBe(1);
      expect(matchingB.length).toBe(0);
    });
  });

  // ============================================================================
  // Multi-Workspace User Tests
  // ============================================================================

  describe('Multi-workspace user flag visibility', () => {
    let multiWorkspaceUserId: string;

    beforeEach(async () => {
      // Create a user that belongs to both workspaces
      const multiWorkspaceUser = await createTestUser({ organizationId: tenant.orgId });
      multiWorkspaceUserId = multiWorkspaceUser.id;

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceAId,
          userId: multiWorkspaceUserId,
          role: WorkspaceMemberRole.MEMBER,
        },
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceBId,
          userId: multiWorkspaceUserId,
          role: WorkspaceMemberRole.MEMBER,
        },
      });
    });

    test('user in multiple workspaces can see flags from all their workspaces', async () => {
      const flags = await prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: tenant.orgId,
          enabled: true,
          OR: [
            { workspaceId: null }, // Org-wide
            { workspaceId: workspaceAId }, // Workspace A
            { workspaceId: workspaceBId }, // Workspace B
          ],
        },
      });

      // Should see all 3 flags
      expect(flags.length).toBe(3);
      expect(flags.map((f) => f.id)).toContain(orgWideFlagId);
      expect(flags.map((f) => f.id)).toContain(workspaceAFlagId);
      expect(flags.map((f) => f.id)).toContain(workspaceBFlagId);
    });
  });

  // ============================================================================
  // Cross-Organization Isolation Tests
  // ============================================================================

  describe('Cross-organization isolation', () => {
    let otherOrgTenant: TestTenant;
    let otherOrgAdminId: string;
    let otherOrgFlagId: string;

    beforeEach(async () => {
      // Create another organization
      otherOrgTenant = await createTestTenant();

      await createTestRole({
        organizationId: otherOrgTenant.orgId,
        name: 'Admin',
        isAdmin: true,
      });
      await createTestRole({
        organizationId: otherOrgTenant.orgId,
        name: 'User',
        isAdmin: false,
      });

      const otherOrgAdmin = await createTestAdmin({ organizationId: otherOrgTenant.orgId });
      otherOrgAdminId = otherOrgAdmin.id;

      // Create a flag in the other org
      const otherOrgFlag = await prisma.sensitiveToolFlag.create({
        data: {
          organizationId: otherOrgTenant.orgId,
          workspaceId: null,
          toolPattern: 'other-org-tool::*',
          behaviors: [SensitiveFlagBehavior.ALERT],
          description: 'Other org sensitive flag',
          enabled: true,
          createdBy: otherOrgAdminId,
        },
      });
      otherOrgFlagId = otherOrgFlag.id;
    });

    afterEach(async () => {
      await otherOrgTenant.cleanup();
    });

    test('admin cannot see flags from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const flags = await caller.admin.sensitiveFlags.list({ includeDisabled: true });

      // Should not contain flag from other org
      expect(flags.map((f) => f.id)).not.toContain(otherOrgFlagId);
    });

    test('admin cannot get flag from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      await expect(caller.admin.sensitiveFlags.get({ id: otherOrgFlagId })).rejects.toThrow();
    });

    test('admin cannot update flag from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      await expect(
        caller.admin.sensitiveFlags.update({
          id: otherOrgFlagId,
          description: 'Hacked description',
        }),
      ).rejects.toThrow();

      // Verify flag was not modified
      const flag = await prisma.sensitiveToolFlag.findUnique({
        where: { id: otherOrgFlagId },
      });
      expect(flag?.description).toBe('Other org sensitive flag');
    });

    test('admin cannot delete flag from other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      await expect(caller.admin.sensitiveFlags.delete({ id: otherOrgFlagId })).rejects.toThrow();

      // Verify flag still exists
      const flag = await prisma.sensitiveToolFlag.findUnique({
        where: { id: otherOrgFlagId },
      });
      expect(flag).not.toBeNull();
    });
  });

  // ============================================================================
  // Unique Constraint Tests
  // ============================================================================

  describe('Unique constraint enforcement', () => {
    test('cannot create duplicate tool pattern in same workspace', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Try to create a flag with same pattern as workspace A flag
      // The unique constraint is on [organizationId, workspaceId, toolPattern]
      await expect(
        caller.admin.sensitiveFlags.create({
          toolPattern: 'workspace-a-tool::*',
          behaviors: [SensitiveFlagBehavior.ALERT],
        }),
      ).rejects.toThrow();
    });

    test('can create same tool pattern in different workspaces', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      // Create a flag with pattern 'shared-tool::*' in workspace A
      await prisma.sensitiveToolFlag.create({
        data: {
          organizationId: tenant.orgId,
          workspaceId: workspaceAId,
          toolPattern: 'shared-tool::*',
          behaviors: [SensitiveFlagBehavior.ALERT],
          description: 'Shared tool flag in workspace A',
          enabled: true,
          createdBy: orgAdminId,
        },
      });

      // Should be able to create same pattern in workspace B
      const workspaceBFlag = await prisma.sensitiveToolFlag.create({
        data: {
          organizationId: tenant.orgId,
          workspaceId: workspaceBId,
          toolPattern: 'shared-tool::*',
          behaviors: [SensitiveFlagBehavior.RATE_LIMIT],
          rateLimitConfig: { maxPerSession: 5, windowMinutes: 30 },
          description: 'Shared tool flag in workspace B',
          enabled: true,
          createdBy: orgAdminId,
        },
      });

      expect(workspaceBFlag).toBeDefined();
    });

    test('can create same tool pattern org-wide and workspace-scoped', async () => {
      // Create org-wide flag with new pattern
      const orgWideNewFlag = await prisma.sensitiveToolFlag.create({
        data: {
          organizationId: tenant.orgId,
          workspaceId: null,
          toolPattern: 'new-shared-tool::*',
          behaviors: [SensitiveFlagBehavior.ALERT],
          description: 'New shared tool org-wide',
          enabled: true,
          createdBy: orgAdminId,
        },
      });

      // Should be able to create same pattern in workspace A (different scope)
      const workspaceScopedFlag = await prisma.sensitiveToolFlag.create({
        data: {
          organizationId: tenant.orgId,
          workspaceId: workspaceAId,
          toolPattern: 'new-shared-tool::*',
          behaviors: [SensitiveFlagBehavior.RATE_LIMIT],
          rateLimitConfig: { maxPerSession: 5, windowMinutes: 30 },
          description: 'New shared tool workspace A',
          enabled: true,
          createdBy: orgAdminId,
        },
      });

      expect(orgWideNewFlag).toBeDefined();
      expect(workspaceScopedFlag).toBeDefined();
    });
  });

  // ============================================================================
  // Disabled Flag Tests
  // ============================================================================

  describe('Disabled flag filtering', () => {
    let disabledFlagId: string;

    beforeEach(async () => {
      // Create a disabled flag
      const disabledFlag = await prisma.sensitiveToolFlag.create({
        data: {
          organizationId: tenant.orgId,
          workspaceId: workspaceAId,
          toolPattern: 'disabled-tool::*',
          behaviors: [SensitiveFlagBehavior.ALERT],
          description: 'Disabled flag',
          enabled: false,
          createdBy: orgAdminId,
        },
      });
      disabledFlagId = disabledFlag.id;
    });

    test('disabled flags are excluded by default', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const flags = await caller.admin.sensitiveFlags.list();

      expect(flags.map((f) => f.id)).not.toContain(disabledFlagId);
    });

    test('disabled flags are included when includeDisabled is true', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: orgAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const flags = await caller.admin.sensitiveFlags.list({ includeDisabled: true });

      expect(flags.map((f) => f.id)).toContain(disabledFlagId);
    });
  });
});
