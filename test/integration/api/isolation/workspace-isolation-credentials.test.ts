/**
 * Integration Tests: Workspace Isolation for Credentials
 * Tests that workspace credentials are properly scoped to workspaces
 * Critical security requirement: Users can only access credentials for MCP servers in their workspaces
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { encryptString } from '../../../../packages/api/src/lib/crypto.js';
import { McpAuthType, prisma, WorkspaceMemberRole } from '../../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../../helpers/db.js';
import {
  createTestAdmin,
  createTestMcpServer,
  createTestRole,
  createTestUser,
  createTestWorkspace,
} from '../../../helpers/factory.js';
import { createTestTenant, type TestTenant } from '../../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Workspace Isolation - Credentials', () => {
  let tenant: TestTenant;

  // Users
  let orgOwnerId: string;
  let workspaceAAdminId: string;
  let workspaceAMemberId: string;
  let workspaceBAdminId: string;
  let workspaceBMemberId: string;
  let nonWorkspaceMemberId: string;

  // Workspaces
  let workspaceAId: string;
  let workspaceBId: string;

  // MCP Servers
  let orgWideServerId: string;
  let workspaceAServerId: string;
  let workspaceBServerId: string;

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

    // Create workspace A admin
    const workspaceAAdmin = await createTestAdmin({ organizationId: tenant.orgId });
    workspaceAAdminId = workspaceAAdmin.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceAId,
        userId: workspaceAAdminId,
        role: WorkspaceMemberRole.ADMIN,
      },
    });

    // Create workspace A member
    const workspaceAMember = await createTestUser({ organizationId: tenant.orgId });
    workspaceAMemberId = workspaceAMember.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceAId,
        userId: workspaceAMemberId,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    // Create workspace B admin
    const workspaceBAdmin = await createTestAdmin({ organizationId: tenant.orgId });
    workspaceBAdminId = workspaceBAdmin.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceBId,
        userId: workspaceBAdminId,
        role: WorkspaceMemberRole.ADMIN,
      },
    });

    // Create workspace B member
    const workspaceBMember = await createTestUser({ organizationId: tenant.orgId });
    workspaceBMemberId = workspaceBMember.id;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceBId,
        userId: workspaceBMemberId,
        role: WorkspaceMemberRole.MEMBER,
      },
    });

    // Create non-workspace member (org user with no workspace memberships)
    const nonWorkspaceMember = await createTestUser({ organizationId: tenant.orgId });
    nonWorkspaceMemberId = nonWorkspaceMember.id;

    // Create MCP servers with different scopes
    const orgWideServer = await createTestMcpServer({
      organizationId: tenant.orgId,
      name: 'Org-Wide Server',
      authType: McpAuthType.API_KEY,
    });
    orgWideServerId = orgWideServer.id;

    const workspaceAServer = await createTestMcpServer({
      organizationId: tenant.orgId,
      name: 'Workspace A Server',
      authType: McpAuthType.API_KEY,
    });
    workspaceAServerId = workspaceAServer.id;
    // Associate server with workspace A
    await prisma.mcpServer.update({
      where: { id: workspaceAServerId },
      data: { workspaceId: workspaceAId },
    });

    const workspaceBServer = await createTestMcpServer({
      organizationId: tenant.orgId,
      name: 'Workspace B Server',
      authType: McpAuthType.API_KEY,
    });
    workspaceBServerId = workspaceBServer.id;
    // Associate server with workspace B
    await prisma.mcpServer.update({
      where: { id: workspaceBServerId },
      data: { workspaceId: workspaceBId },
    });

    // Create workspace credentials for each workspace
    // Workspace A credentials for org-wide server
    await prisma.workspaceMcpConfig.create({
      data: {
        workspaceId: workspaceAId,
        mcpServerId: orgWideServerId,
        apiKey: encryptString('workspace-a-api-key-for-org-server'),
      },
    });

    // Workspace A credentials for workspace A server
    await prisma.workspaceMcpConfig.create({
      data: {
        workspaceId: workspaceAId,
        mcpServerId: workspaceAServerId,
        apiKey: encryptString('workspace-a-api-key'),
      },
    });

    // Workspace B credentials for org-wide server
    await prisma.workspaceMcpConfig.create({
      data: {
        workspaceId: workspaceBId,
        mcpServerId: orgWideServerId,
        apiKey: encryptString('workspace-b-api-key-for-org-server'),
      },
    });

    // Workspace B credentials for workspace B server
    await prisma.workspaceMcpConfig.create({
      data: {
        workspaceId: workspaceBId,
        mcpServerId: workspaceBServerId,
        apiKey: encryptString('workspace-b-api-key'),
      },
    });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  // ============================================================================
  // Workspace Credentials List Isolation Tests
  // ============================================================================

  describe('Workspace credentials list isolation', () => {
    test('workspace A admin can see credentials for MCP servers in workspace A', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      const credentials = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceAId,
      });

      // Should see org-wide server and workspace A server
      expect(credentials.some((c) => c.id === orgWideServerId)).toBe(true);
      expect(credentials.some((c) => c.id === workspaceAServerId)).toBe(true);
      // Should NOT see workspace B server
      expect(credentials.some((c) => c.id === workspaceBServerId)).toBe(false);
    });

    test('workspace A admin CANNOT see credentials for MCP servers in workspace B', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Should fail - workspace A admin cannot access workspace B credentials
      await expect(
        caller.admin.workspaceCredentials.list({
          workspaceId: workspaceBId,
        }),
      ).rejects.toThrow();
    });

    test('workspace B admin can see credentials for MCP servers in workspace B', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceBAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceBId],
        adminWorkspaceIds: [workspaceBId],
      });

      const credentials = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceBId,
      });

      // Should see org-wide server and workspace B server
      expect(credentials.some((c) => c.id === orgWideServerId)).toBe(true);
      expect(credentials.some((c) => c.id === workspaceBServerId)).toBe(true);
      // Should NOT see workspace A server
      expect(credentials.some((c) => c.id === workspaceAServerId)).toBe(false);
    });

    test('org owner can see credentials for any workspace', async () => {
      const user = await prisma.user.findUnique({
        where: { id: orgOwnerId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { isOrgOwner: true });

      // Can access workspace A credentials
      const credentialsA = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceAId,
      });
      expect(credentialsA.some((c) => c.id === workspaceAServerId)).toBe(true);

      // Can access workspace B credentials
      const credentialsB = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceBId,
      });
      expect(credentialsB.some((c) => c.id === workspaceBServerId)).toBe(true);
    });

    test('non-workspace-member cannot access workspace credentials', async () => {
      const user = await prisma.user.findUnique({
        where: { id: nonWorkspaceMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [] });

      // Should fail - non-member cannot access any workspace credentials
      await expect(
        caller.admin.workspaceCredentials.list({
          workspaceId: workspaceAId,
        }),
      ).rejects.toThrow();
    });

    test('workspace member (non-admin) cannot access workspace credentials', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      // User is a member but not an admin
      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [], // Not a workspace admin
      });

      // Should fail - regular member cannot access credentials
      await expect(
        caller.admin.workspaceCredentials.list({
          workspaceId: workspaceAId,
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Workspace Credentials Get Isolation Tests
  // ============================================================================

  describe('Workspace credentials get isolation', () => {
    test('workspace admin can get credentials for MCP server in their workspace', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Can get credentials for workspace A server
      const result = await caller.admin.workspaceCredentials.getCredentials({
        workspaceId: workspaceAId,
        mcpServerId: workspaceAServerId,
      });

      // Should return the credentials
      expect(result.credentials).toBeDefined();
    });

    test('workspace A admin CANNOT get credentials for workspace B MCP server', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Should fail - cannot access workspace B server through workspace A
      await expect(
        caller.admin.workspaceCredentials.getCredentials({
          workspaceId: workspaceAId,
          mcpServerId: workspaceBServerId,
        }),
      ).rejects.toThrow();
    });

    test('workspace admin CANNOT get credentials from other workspace', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Should fail - cannot access workspace B
      await expect(
        caller.admin.workspaceCredentials.getCredentials({
          workspaceId: workspaceBId,
          mcpServerId: orgWideServerId,
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Workspace Credentials Update Isolation Tests
  // ============================================================================

  describe('Workspace credentials update isolation', () => {
    test('workspace admin can manage credentials for their workspace', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Create a new MCP server for testing update
      const newServer = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'New Test Server',
        authType: McpAuthType.NONE, // Use NONE auth type to avoid validation
      });

      // List should include the new server (accessible to workspace A)
      const credentials = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceAId,
      });

      expect(credentials.some((c) => c.id === newServer.id)).toBe(true);
    });

    test('workspace A admin CANNOT update credentials for workspace B', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Should fail - cannot update workspace B credentials
      await expect(
        caller.admin.workspaceCredentials.updateCredentials({
          workspaceId: workspaceBId,
          mcpServerId: orgWideServerId,
          credentials: { token: 'hacked-token' },
        }),
      ).rejects.toThrow();

      // Verify credentials were not modified
      const config = await prisma.workspaceMcpConfig.findUnique({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: workspaceBId,
            mcpServerId: orgWideServerId,
          },
        },
      });
      // Original credential should still be there
      expect(config?.apiKey).toBeTruthy();
    });

    test('non-workspace-member cannot update workspace credentials', async () => {
      const user = await prisma.user.findUnique({
        where: { id: nonWorkspaceMemberId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, { workspaceIds: [] });

      // Should fail - non-member cannot update credentials
      await expect(
        caller.admin.workspaceCredentials.updateCredentials({
          workspaceId: workspaceAId,
          mcpServerId: orgWideServerId,
          credentials: { token: 'unauthorized-token' },
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Org-Wide Server Credentials Isolation Tests
  // ============================================================================

  describe('Org-wide server credentials per workspace', () => {
    test('each workspace has separate credentials for org-wide servers', async () => {
      // Workspace A admin gets credentials
      const workspaceAAdmin = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!workspaceAAdmin) throw new Error('User not found');

      const callerA = createCallerWithUser(workspaceAAdmin, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Workspace B admin gets credentials
      const workspaceBAdmin = await prisma.user.findUnique({
        where: { id: workspaceBAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!workspaceBAdmin) throw new Error('User not found');

      const callerB = createCallerWithUser(workspaceBAdmin, {
        workspaceIds: [workspaceBId],
        adminWorkspaceIds: [workspaceBId],
      });

      // Both can list the org-wide server
      const credentialsA = await callerA.admin.workspaceCredentials.list({
        workspaceId: workspaceAId,
      });
      const credentialsB = await callerB.admin.workspaceCredentials.list({
        workspaceId: workspaceBId,
      });

      const orgServerInA = credentialsA.find((c) => c.id === orgWideServerId);
      const orgServerInB = credentialsB.find((c) => c.id === orgWideServerId);

      // Both should see the org-wide server
      expect(orgServerInA).toBeDefined();
      expect(orgServerInB).toBeDefined();

      // Both should have workspace-specific credentials configured
      expect(orgServerInA?.hasWorkspaceApiKey).toBe(true);
      expect(orgServerInB?.hasWorkspaceApiKey).toBe(true);
    });

    test('workspace A credentials for org-wide server do not affect workspace B', async () => {
      // Verify workspace A has its own credential
      const configA = await prisma.workspaceMcpConfig.findUnique({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: workspaceAId,
            mcpServerId: orgWideServerId,
          },
        },
      });

      // Verify workspace B has its own credential
      const configB = await prisma.workspaceMcpConfig.findUnique({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: workspaceBId,
            mcpServerId: orgWideServerId,
          },
        },
      });

      // Both should exist and be different
      expect(configA).toBeTruthy();
      expect(configB).toBeTruthy();
      expect(configA?.id).not.toBe(configB?.id);
      // Encrypted keys should be different
      expect(configA?.apiKey).not.toBe(configB?.apiKey);
    });
  });

  // ============================================================================
  // Multi-Workspace User Tests
  // ============================================================================

  describe('Multi-workspace user credentials access', () => {
    let multiWorkspaceAdminId: string;

    beforeEach(async () => {
      // Create a user that is admin in both workspaces
      const multiWorkspaceAdmin = await createTestAdmin({ organizationId: tenant.orgId });
      multiWorkspaceAdminId = multiWorkspaceAdmin.id;

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceAId,
          userId: multiWorkspaceAdminId,
          role: WorkspaceMemberRole.ADMIN,
        },
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceBId,
          userId: multiWorkspaceAdminId,
          role: WorkspaceMemberRole.ADMIN,
        },
      });
    });

    test('user admin in both workspaces can access credentials for both', async () => {
      const user = await prisma.user.findUnique({
        where: { id: multiWorkspaceAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId, workspaceBId],
        adminWorkspaceIds: [workspaceAId, workspaceBId],
      });

      // Can access workspace A credentials
      const credentialsA = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceAId,
      });
      expect(credentialsA.some((c) => c.id === workspaceAServerId)).toBe(true);

      // Can access workspace B credentials
      const credentialsB = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceBId,
      });
      expect(credentialsB.some((c) => c.id === workspaceBServerId)).toBe(true);
    });

    test('each workspace request returns only that workspace credentials', async () => {
      const user = await prisma.user.findUnique({
        where: { id: multiWorkspaceAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId, workspaceBId],
        adminWorkspaceIds: [workspaceAId, workspaceBId],
      });

      // Workspace A credentials should not include workspace B server
      const credentialsA = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceAId,
      });
      expect(credentialsA.some((c) => c.id === workspaceBServerId)).toBe(false);

      // Workspace B credentials should not include workspace A server
      const credentialsB = await caller.admin.workspaceCredentials.list({
        workspaceId: workspaceBId,
      });
      expect(credentialsB.some((c) => c.id === workspaceAServerId)).toBe(false);
    });
  });

  // ============================================================================
  // Cross-Organization Isolation Tests
  // ============================================================================

  describe('Cross-organization credentials isolation', () => {
    let otherOrgTenant: TestTenant;
    let otherOrgAdminId: string;
    let otherOrgWorkspaceId: string;
    let otherOrgServerId: string;

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

      // Create admin in other org
      const otherOrgAdmin = await createTestAdmin({ organizationId: otherOrgTenant.orgId });
      otherOrgAdminId = otherOrgAdmin.id;

      // Create workspace in other org
      const otherOrgWorkspace = await createTestWorkspace({
        organizationId: otherOrgTenant.orgId,
        name: 'Other Org Workspace',
      });
      otherOrgWorkspaceId = otherOrgWorkspace.id;

      await prisma.workspaceMember.create({
        data: {
          workspaceId: otherOrgWorkspaceId,
          userId: otherOrgAdminId,
          role: WorkspaceMemberRole.ADMIN,
        },
      });

      // Create server in other org
      const otherOrgServer = await createTestMcpServer({
        organizationId: otherOrgTenant.orgId,
        name: 'Other Org Server',
        authType: McpAuthType.API_KEY,
      });
      otherOrgServerId = otherOrgServer.id;

      // Create credentials in other org
      await prisma.workspaceMcpConfig.create({
        data: {
          workspaceId: otherOrgWorkspaceId,
          mcpServerId: otherOrgServerId,
          apiKey: encryptString('other-org-api-key'),
        },
      });
    });

    afterEach(async () => {
      await otherOrgTenant.cleanup();
    });

    test('cannot access credentials from other organization workspace', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Should fail - cannot access workspace from other org
      await expect(
        caller.admin.workspaceCredentials.list({
          workspaceId: otherOrgWorkspaceId,
        }),
      ).rejects.toThrow();
    });

    test('cannot get credentials for server from other organization', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Should fail - cannot access server from other org
      await expect(
        caller.admin.workspaceCredentials.getCredentials({
          workspaceId: workspaceAId,
          mcpServerId: otherOrgServerId,
        }),
      ).rejects.toThrow();
    });

    test('cannot update credentials for server from other organization', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      // Should fail - cannot update server from other org
      await expect(
        caller.admin.workspaceCredentials.updateCredentials({
          workspaceId: workspaceAId,
          mcpServerId: otherOrgServerId,
          credentials: { token: 'hacked-token' },
        }),
      ).rejects.toThrow();

      // Verify credentials in other org were not modified
      const config = await prisma.workspaceMcpConfig.findUnique({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: otherOrgWorkspaceId,
            mcpServerId: otherOrgServerId,
          },
        },
      });
      expect(config?.apiKey).toBeTruthy();
    });
  });

  // ============================================================================
  // Security Tests - Error Message Leakage
  // ============================================================================

  describe('Security - error message should not leak information', () => {
    test('should not leak workspace information in error messages', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      try {
        await caller.admin.workspaceCredentials.list({
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

    test('should not leak server information for cross-workspace access', async () => {
      const user = await prisma.user.findUnique({
        where: { id: workspaceAAdminId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user, {
        workspaceIds: [workspaceAId],
        adminWorkspaceIds: [workspaceAId],
      });

      try {
        await caller.admin.workspaceCredentials.getCredentials({
          workspaceId: workspaceAId,
          mcpServerId: workspaceBServerId,
        });
        throw new Error('Should have thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Error should not reveal the server exists in another workspace
        expect(errorMessage).not.toContain('Workspace B Server');
        expect(errorMessage).not.toContain('another workspace');
      }
    });
  });
});
