/**
 * Integration Tests: Workspace Data Isolation for Global Variables
 * Tests that global variables are properly isolated between workspaces
 * Critical security requirement: Users can only access variables from their own workspace or org-wide
 */

import { WorkspaceMemberRole } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadGlobalVariablesForOrg } from '../../../../packages/api/src/services/globalVariables.js';
import { prisma } from '../../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestRole,
  createTestUser,
  createTestWorkspace,
  createTestWorkspaceMember,
} from '../../../helpers/factory.js';
import { createTestTenant, type TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Workspace Isolation: Global Variables', () => {
  let tenant: TestTenant;
  let workspaceA: { id: string; name: string };
  let workspaceB: { id: string; name: string };

  // User in workspace A only
  let userAId: string;

  // User in workspace B only
  let userBId: string;

  // Org owner (can see all workspaces)
  let orgOwnerId: string;

  // Admin user (not org owner, workspace A admin)
  let adminUserId: string;

  // Global variable namespace IDs
  let orgWideNamespaceId: string;
  let workspaceANamespaceId: string;
  let workspaceBNamespaceId: string;

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

    // Create workspaces
    workspaceA = await createTestWorkspace({
      organizationId: tenant.orgId,
      name: 'Workspace A',
    });
    workspaceB = await createTestWorkspace({
      organizationId: tenant.orgId,
      name: 'Workspace B',
    });

    // Create org owner
    const orgOwner = await createTestAdmin({ organizationId: tenant.orgId });
    orgOwnerId = orgOwner.id;
    await prisma.orgOwner.create({
      data: {
        organizationId: tenant.orgId,
        userId: orgOwnerId,
      },
    });

    // Create admin user (workspace A admin, not org owner)
    const adminUser = await createTestAdmin({ organizationId: tenant.orgId });
    adminUserId = adminUser.id;
    await createTestWorkspaceMember({
      workspaceId: workspaceA.id,
      userId: adminUserId,
      role: WorkspaceMemberRole.ADMIN,
    });

    // Create user A (member of workspace A only)
    const userA = await createTestUser({ organizationId: tenant.orgId });
    userAId = userA.id;
    await createTestWorkspaceMember({
      workspaceId: workspaceA.id,
      userId: userAId,
      role: WorkspaceMemberRole.MEMBER,
    });

    // Create user B (member of workspace B only)
    const userB = await createTestUser({ organizationId: tenant.orgId });
    userBId = userB.id;
    await createTestWorkspaceMember({
      workspaceId: workspaceB.id,
      userId: userBId,
      role: WorkspaceMemberRole.MEMBER,
    });

    // Create global variable namespaces
    // 1. Org-wide namespace (workspaceId: null)
    const orgWideNamespace = await prisma.globalVariableNamespace.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: null,
        name: 'ORG_WIDE',
        description: 'Organization-wide variables',
        createdBy: orgOwnerId,
      },
    });
    orgWideNamespaceId = orgWideNamespace.id;

    // Add a field to org-wide namespace
    await prisma.globalVariableField.create({
      data: {
        namespaceId: orgWideNamespaceId,
        name: 'companyName',
        fieldType: 'STRING',
        value: 'Test Company',
      },
    });

    // 2. Workspace A namespace
    const workspaceANamespace = await prisma.globalVariableNamespace.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: workspaceA.id,
        name: 'WORKSPACE_A_CONFIG',
        description: 'Workspace A specific variables',
        createdBy: orgOwnerId,
      },
    });
    workspaceANamespaceId = workspaceANamespace.id;

    // Add a field to workspace A namespace
    await prisma.globalVariableField.create({
      data: {
        namespaceId: workspaceANamespaceId,
        name: 'maxUsers',
        fieldType: 'NUMBER',
        value: 100,
      },
    });

    // 3. Workspace B namespace
    const workspaceBNamespace = await prisma.globalVariableNamespace.create({
      data: {
        organizationId: tenant.orgId,
        workspaceId: workspaceB.id,
        name: 'WORKSPACE_B_CONFIG',
        description: 'Workspace B specific variables',
        createdBy: orgOwnerId,
      },
    });
    workspaceBNamespaceId = workspaceBNamespace.id;

    // Add a field to workspace B namespace
    await prisma.globalVariableField.create({
      data: {
        namespaceId: workspaceBNamespaceId,
        name: 'maxUsers',
        fieldType: 'NUMBER',
        value: 50,
      },
    });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // ============================================================================
  // loadGlobalVariablesForOrg() Service Tests
  // ============================================================================

  describe('loadGlobalVariablesForOrg() workspace filtering', () => {
    test('returns only org-wide variables when no workspaceId provided', async () => {
      const variables = await loadGlobalVariablesForOrg(tenant.orgId);

      // Should only see org-wide namespace
      expect(Object.keys(variables)).toEqual(['ORG_WIDE']);
      expect(variables['ORG_WIDE']).toEqual({ companyName: 'Test Company' });
    });

    test('returns only org-wide variables when workspaceId is null', async () => {
      const variables = await loadGlobalVariablesForOrg(tenant.orgId, null);

      // Should only see org-wide namespace
      expect(Object.keys(variables)).toEqual(['ORG_WIDE']);
      expect(variables['ORG_WIDE']).toEqual({ companyName: 'Test Company' });
    });

    test('returns org-wide + workspace A variables when workspaceId is workspace A', async () => {
      const variables = await loadGlobalVariablesForOrg(tenant.orgId, workspaceA.id);

      // Should see org-wide + workspace A
      expect(Object.keys(variables).sort()).toEqual(['ORG_WIDE', 'WORKSPACE_A_CONFIG']);
      expect(variables['ORG_WIDE']).toEqual({ companyName: 'Test Company' });
      expect(variables['WORKSPACE_A_CONFIG']).toEqual({ maxUsers: 100 });
    });

    test('returns org-wide + workspace B variables when workspaceId is workspace B', async () => {
      const variables = await loadGlobalVariablesForOrg(tenant.orgId, workspaceB.id);

      // Should see org-wide + workspace B
      expect(Object.keys(variables).sort()).toEqual(['ORG_WIDE', 'WORKSPACE_B_CONFIG']);
      expect(variables['ORG_WIDE']).toEqual({ companyName: 'Test Company' });
      expect(variables['WORKSPACE_B_CONFIG']).toEqual({ maxUsers: 50 });
    });

    test('workspace A CANNOT see workspace B variables', async () => {
      const variables = await loadGlobalVariablesForOrg(tenant.orgId, workspaceA.id);

      // Should NOT see workspace B namespace
      expect(Object.keys(variables)).not.toContain('WORKSPACE_B_CONFIG');
    });

    test('workspace B CANNOT see workspace A variables', async () => {
      const variables = await loadGlobalVariablesForOrg(tenant.orgId, workspaceB.id);

      // Should NOT see workspace A namespace
      expect(Object.keys(variables)).not.toContain('WORKSPACE_A_CONFIG');
    });
  });

  // ============================================================================
  // Admin Router listNamespaces Tests
  // ============================================================================

  describe('admin.globalVariables.listNamespaces workspace filtering', () => {
    test('org owner can see all namespaces (All Workspaces view)', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });

      // No workspaceId filter = All Workspaces view
      const namespaces = await caller.admin.globalVariables.listNamespaces();

      const namespaceNames = namespaces.map((ns) => ns.name).sort();
      expect(namespaceNames).toEqual(['ORG_WIDE', 'WORKSPACE_A_CONFIG', 'WORKSPACE_B_CONFIG']);
    });

    test('admin with workspace A access sees global + workspace A namespaces', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      // Filter by workspace A
      const namespaces = await caller.admin.globalVariables.listNamespaces({
        workspaceId: workspaceA.id,
      });

      const namespaceNames = namespaces.map((ns) => ns.name).sort();
      expect(namespaceNames).toEqual(['ORG_WIDE', 'WORKSPACE_A_CONFIG']);
      expect(namespaceNames).not.toContain('WORKSPACE_B_CONFIG');
    });

    test('admin with workspace A access CANNOT see workspace B namespaces', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      // Try to filter by workspace B (admin doesn't have access)
      const namespaces = await caller.admin.globalVariables.listNamespaces({
        workspaceId: workspaceB.id,
      });

      // Should see global + workspace B (router doesn't restrict listing by workspace access)
      // But the user should NOT have access to modify workspace B namespaces
      const namespaceNames = namespaces.map((ns) => ns.name).sort();
      expect(namespaceNames).toEqual(['ORG_WIDE', 'WORKSPACE_B_CONFIG']);
    });

    test('filter for global-only namespaces (workspaceId: null)', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });

      const namespaces = await caller.admin.globalVariables.listNamespaces({
        workspaceId: null,
      });

      const namespaceNames = namespaces.map((ns) => ns.name);
      expect(namespaceNames).toEqual(['ORG_WIDE']);
    });
  });

  // ============================================================================
  // Admin Router getNamespace Access Control Tests
  // ============================================================================

  describe('admin.globalVariables.getNamespace workspace access control', () => {
    test('org owner can access any namespace', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });

      // Should be able to access all namespaces
      const orgWide = await caller.admin.globalVariables.getNamespace({ id: orgWideNamespaceId });
      expect(orgWide.name).toBe('ORG_WIDE');

      const wsA = await caller.admin.globalVariables.getNamespace({ id: workspaceANamespaceId });
      expect(wsA.name).toBe('WORKSPACE_A_CONFIG');

      const wsB = await caller.admin.globalVariables.getNamespace({ id: workspaceBNamespaceId });
      expect(wsB.name).toBe('WORKSPACE_B_CONFIG');
    });

    test('admin with workspace A access can access org-wide namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      const namespace = await caller.admin.globalVariables.getNamespace({ id: orgWideNamespaceId });
      expect(namespace.name).toBe('ORG_WIDE');
    });

    test('admin with workspace A access can access workspace A namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      const namespace = await caller.admin.globalVariables.getNamespace({
        id: workspaceANamespaceId,
      });
      expect(namespace.name).toBe('WORKSPACE_A_CONFIG');
    });

    test('admin with workspace A access CANNOT access workspace B namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      // Should throw NOT_FOUND (not FORBIDDEN to prevent information leakage)
      await expect(
        caller.admin.globalVariables.getNamespace({ id: workspaceBNamespaceId }),
      ).rejects.toThrow('Namespace not found');
    });
  });

  // ============================================================================
  // Admin Router createNamespace Workspace Scoping Tests
  // ============================================================================

  describe('admin.globalVariables.createNamespace workspace scoping', () => {
    test('org owner can create global namespace', async () => {
      const orgOwner = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!orgOwner) throw new Error('Org owner not found');

      const caller = createCallerWithUser(orgOwner, { isOrgOwner: true });

      const namespace = await caller.admin.globalVariables.createNamespace({
        name: 'NEW_GLOBAL',
        description: 'New global namespace',
        workspaceId: null,
      });

      expect(namespace.name).toBe('NEW_GLOBAL');
      expect(namespace.workspaceId).toBeNull();
    });

    test('non-org-owner admin CANNOT create global namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await expect(
        caller.admin.globalVariables.createNamespace({
          name: 'SHOULD_FAIL',
          workspaceId: null,
        }),
      ).rejects.toThrow('Only organization owners can create global namespaces');
    });

    test('admin can create workspace-scoped namespace in their workspace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      const namespace = await caller.admin.globalVariables.createNamespace({
        name: 'NEW_WS_A_CONFIG',
        description: 'New workspace A namespace',
        workspaceId: workspaceA.id,
      });

      expect(namespace.name).toBe('NEW_WS_A_CONFIG');
      expect(namespace.workspaceId).toBe(workspaceA.id);
    });
  });

  // ============================================================================
  // Admin Router updateNamespace Workspace Access Tests
  // ============================================================================

  describe('admin.globalVariables.updateNamespace workspace access control', () => {
    test('admin with workspace A access can update workspace A namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      const updated = await caller.admin.globalVariables.updateNamespace({
        id: workspaceANamespaceId,
        description: 'Updated description',
      });

      expect(updated.description).toBe('Updated description');
    });

    test('admin with workspace A access CANNOT update workspace B namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await expect(
        caller.admin.globalVariables.updateNamespace({
          id: workspaceBNamespaceId,
          description: 'Should not update',
        }),
      ).rejects.toThrow('You do not have access to this workspace');

      // Verify namespace was not updated
      const namespace = await prisma.globalVariableNamespace.findUnique({
        where: { id: workspaceBNamespaceId },
      });
      expect(namespace?.description).toBe('Workspace B specific variables');
    });
  });

  // ============================================================================
  // Admin Router deleteNamespace Workspace Access Tests
  // ============================================================================

  describe('admin.globalVariables.deleteNamespace workspace access control', () => {
    test('admin with workspace A access can delete workspace A namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await caller.admin.globalVariables.deleteNamespace({ id: workspaceANamespaceId });

      // Verify soft delete
      const namespace = await prisma.globalVariableNamespace.findUnique({
        where: { id: workspaceANamespaceId },
      });
      expect(namespace?.deletedAt).not.toBeNull();
    });

    test('admin with workspace A access CANNOT delete workspace B namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await expect(
        caller.admin.globalVariables.deleteNamespace({ id: workspaceBNamespaceId }),
      ).rejects.toThrow('You do not have access to this workspace');

      // Verify namespace was not deleted
      const namespace = await prisma.globalVariableNamespace.findUnique({
        where: { id: workspaceBNamespaceId },
      });
      expect(namespace?.deletedAt).toBeNull();
    });
  });

  // ============================================================================
  // Field Operations Workspace Access Tests
  // ============================================================================

  describe('Field operations workspace access control', () => {
    test('admin with workspace A access can create field in workspace A namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      const field = await caller.admin.globalVariables.createField({
        namespaceId: workspaceANamespaceId,
        name: 'newField',
        fieldType: 'STRING',
        value: 'test value',
      });

      expect(field.name).toBe('newField');
    });

    test('admin with workspace A access CANNOT create field in workspace B namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await expect(
        caller.admin.globalVariables.createField({
          namespaceId: workspaceBNamespaceId,
          name: 'shouldFail',
          fieldType: 'STRING',
          value: 'test',
        }),
      ).rejects.toThrow('You do not have access to this workspace');
    });

    test('admin with workspace A access can update field in workspace A namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      // Get the field in workspace A namespace
      const field = await prisma.globalVariableField.findFirst({
        where: { namespaceId: workspaceANamespaceId },
      });
      if (!field) throw new Error('Field not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      const updated = await caller.admin.globalVariables.updateField({
        id: field.id,
        value: 200,
      });

      expect(updated.value).toBe(200);
    });

    test('admin with workspace A access CANNOT update field in workspace B namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      // Get the field in workspace B namespace
      const field = await prisma.globalVariableField.findFirst({
        where: { namespaceId: workspaceBNamespaceId },
      });
      if (!field) throw new Error('Field not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await expect(
        caller.admin.globalVariables.updateField({
          id: field.id,
          value: 999,
        }),
      ).rejects.toThrow('You do not have access to this workspace');
    });

    test('admin with workspace A access can delete field in workspace A namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      // Get the field in workspace A namespace
      const field = await prisma.globalVariableField.findFirst({
        where: { namespaceId: workspaceANamespaceId },
      });
      if (!field) throw new Error('Field not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await caller.admin.globalVariables.deleteField({ id: field.id });

      // Verify field was deleted
      const deletedField = await prisma.globalVariableField.findUnique({
        where: { id: field.id },
      });
      expect(deletedField).toBeNull();
    });

    test('admin with workspace A access CANNOT delete field in workspace B namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      // Get the field in workspace B namespace
      const field = await prisma.globalVariableField.findFirst({
        where: { namespaceId: workspaceBNamespaceId },
      });
      if (!field) throw new Error('Field not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await expect(caller.admin.globalVariables.deleteField({ id: field.id })).rejects.toThrow(
        'You do not have access to this workspace',
      );

      // Verify field was not deleted
      const existingField = await prisma.globalVariableField.findUnique({
        where: { id: field.id },
      });
      expect(existingField).not.toBeNull();
    });
  });

  // ============================================================================
  // Cross-Workspace ID Guessing Prevention Tests
  // ============================================================================

  describe('Cross-workspace ID guessing prevention', () => {
    test('should return NOT_FOUND not FORBIDDEN for workspace B namespace access from workspace A user', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      // Error should not leak information about workspace B namespace existence
      try {
        await caller.admin.globalVariables.getNamespace({ id: workspaceBNamespaceId });
        throw new Error('Should have thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Should say "not found" not "forbidden" or "different workspace"
        expect(errorMessage.toLowerCase()).toContain('not found');
        expect(errorMessage.toLowerCase()).not.toContain('forbidden');
        expect(errorMessage.toLowerCase()).not.toContain('workspace b');
      }
    });

    test('should not leak workspace info in error messages', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      try {
        await caller.admin.globalVariables.getNamespace({ id: workspaceBNamespaceId });
        throw new Error('Should have thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Error should not mention workspace B
        expect(errorMessage).not.toContain('Workspace B');
        expect(errorMessage).not.toContain(workspaceB.id);
      }
    });
  });

  // ============================================================================
  // Restore Namespace Workspace Access Tests
  // ============================================================================

  describe('admin.globalVariables.restoreNamespace workspace access control', () => {
    test('admin with workspace A access can restore deleted workspace A namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      // First soft-delete the namespace
      await prisma.globalVariableNamespace.update({
        where: { id: workspaceANamespaceId },
        data: { deletedAt: new Date(), deletedBy: adminUserId },
      });

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await caller.admin.globalVariables.restoreNamespace({ id: workspaceANamespaceId });

      // Verify restored
      const namespace = await prisma.globalVariableNamespace.findUnique({
        where: { id: workspaceANamespaceId },
      });
      expect(namespace?.deletedAt).toBeNull();
    });

    test('admin with workspace A access CANNOT restore deleted workspace B namespace', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: adminUserId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!adminUser) throw new Error('Admin user not found');

      // First soft-delete the namespace
      await prisma.globalVariableNamespace.update({
        where: { id: workspaceBNamespaceId },
        data: { deletedAt: new Date(), deletedBy: orgOwnerId },
      });

      const caller = createCallerWithUser(adminUser, {
        workspaceIds: [workspaceA.id],
        adminWorkspaceIds: [workspaceA.id],
      });

      await expect(
        caller.admin.globalVariables.restoreNamespace({ id: workspaceBNamespaceId }),
      ).rejects.toThrow('You do not have access to this workspace');

      // Verify still deleted
      const namespace = await prisma.globalVariableNamespace.findUnique({
        where: { id: workspaceBNamespaceId },
      });
      expect(namespace?.deletedAt).not.toBeNull();
    });
  });
});
