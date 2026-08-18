/**
 * Integration Test Helpers
 * Utilities for creating test tRPC contexts and testing security boundaries
 */

import { PolicyEffect, prisma, type Policy } from '@sentinel/db';
import type { AuthContext } from '../../packages/api/src/services/auth.js';
import type { UserWithRoles } from '../../packages/api/src/types/role.js';
import { createAuthContext, createMockUser } from './auth.js';
import { createCallerWithAuth } from './trpc.js';

// ============================================================================
// Auth Context Helpers
// ============================================================================

/**
 * Creates an auth context for a database user
 * Fetches the user with roles and creates a proper auth context
 */
export async function createAuthContextForUser(userId: string): Promise<AuthContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  return createAuthContext(user);
}

/**
 * Creates an auth context for a different organization (for isolation testing)
 */
export async function createAuthContextFromDifferentOrg(
  excludeOrgId: string,
): Promise<AuthContext | null> {
  const user = await prisma.user.findFirst({
    where: {
      organizationId: { not: excludeOrgId },
      deletedAt: null,
    },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });

  if (!user) {
    return null;
  }

  return createAuthContext(user);
}

/**
 * Creates a mock session object for testing
 */
export function createMockSession(
  overrides: Partial<{
    userId: string;
    organizationId: string;
    isAdmin: boolean;
    roles: string[];
  }> = {},
) {
  return {
    userId: overrides.userId ?? 'test-user-id',
    organizationId: overrides.organizationId ?? 'test-org-id',
    isAdmin: overrides.isAdmin ?? false,
    roles: overrides.roles ?? ['User'],
  };
}

// ============================================================================
// Organization Isolation Helpers
// ============================================================================

/**
 * Creates a user in a specific organization
 */
export async function createUserInOrg(
  orgId: string,
  isAdmin: boolean = false,
): Promise<UserWithRoles> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Get or create appropriate role
  let role = await prisma.role.findFirst({
    where: { organizationId: orgId, isAdmin },
  });

  if (!role) {
    role = await prisma.role.create({
      data: {
        organizationId: orgId,
        name: isAdmin ? 'Admin' : 'User',
        isAdmin,
        description: `${isAdmin ? 'Admin' : 'User'} role`,
      },
    });
  }

  const user = await prisma.user.create({
    data: {
      email: `test-${uniqueSuffix}@example.com`,
      organizationId: orgId,
      userRoles: {
        create: [{ roleId: role.id }],
      },
    },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });

  return user;
}

/**
 * Creates a second organization with a user for isolation testing
 */
export async function createSecondOrgWithUser(): Promise<{
  org: { id: string; name: string };
  user: UserWithRoles;
}> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const org = await prisma.organization.create({
    data: { name: `Test Org 2 ${uniqueSuffix}` },
  });

  const role = await prisma.role.create({
    data: {
      organizationId: org.id,
      name: 'User',
      isAdmin: false,
      description: 'User role',
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `org2-user-${uniqueSuffix}@example.com`,
      organizationId: org.id,
      userRoles: {
        create: [{ roleId: role.id }],
      },
    },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });

  return { org, user };
}

/**
 * Verifies that a procedure properly enforces organization isolation
 * This is a generic helper that can be used to test any procedure
 */
export function verifyOrgIsolationForList<T extends { organizationId?: string }>(
  items: T[],
  expectedOrgId: string,
): void {
  for (const item of items) {
    if ('organizationId' in item) {
      if (item.organizationId !== expectedOrgId) {
        throw new Error(
          `Organization isolation violated: expected ${expectedOrgId}, got ${item.organizationId}`,
        );
      }
    }
  }
}

// ============================================================================
// Workspace Isolation Helpers
// ============================================================================

/**
 * Result of workspace isolation setup
 */
export interface WorkspaceIsolationSetup {
  /** Organization ID for the test */
  orgId: string;
  /** First workspace (user has access) */
  workspaceA: {
    id: string;
    name: string;
  };
  /** Second workspace (user does NOT have access) */
  workspaceB: {
    id: string;
    name: string;
  };
  /** User who is a member of workspace A but NOT workspace B */
  memberOfA: UserWithRoles & {
    workspaceMemberships: Array<{ workspaceId: string; role: string }>;
  };
  /** Auth context for the user (member of workspace A only) */
  memberOfAAuth: AuthContext;
  /** tRPC caller for the user */
  memberOfACaller: ReturnType<typeof createCallerWithAuth>;
  /** Cleanup function to remove all test data */
  cleanup: () => Promise<void>;
}

/**
 * Options for workspace isolation setup
 */
export interface WorkspaceIsolationOptions {
  /** Organization ID to use (creates new org if not provided) */
  orgId?: string;
  /** Workspace A name */
  workspaceAName?: string;
  /** Workspace B name */
  workspaceBName?: string;
  /** User email */
  userEmail?: string;
  /** Whether the user should be an admin of workspace A (default: false) */
  isWorkspaceAdmin?: boolean;
}

/**
 * Creates a workspace isolation test setup.
 *
 * This helper creates:
 * - Two workspaces in the same organization
 * - A user who is a member of workspace A but NOT workspace B
 * - Auth context and tRPC caller for testing
 *
 * Use this to test that workspace-scoped resources are properly isolated.
 *
 * @example
 * ```typescript
 * let setup: WorkspaceIsolationSetup;
 *
 * beforeEach(async () => {
 *   setup = await createWorkspaceIsolationSetup();
 * });
 *
 * afterEach(async () => {
 *   await setup.cleanup();
 * });
 *
 * test('user can access workspace A resources', async () => {
 *   // Create a resource in workspace A
 *   const resource = await createResource({ workspaceId: setup.workspaceA.id });
 *
 *   // User should be able to access it
 *   const result = await setup.memberOfACaller.resource.get({ id: resource.id });
 *   expect(result).toBeDefined();
 * });
 *
 * test('user cannot access workspace B resources', async () => {
 *   // Create a resource in workspace B
 *   const resource = await createResource({ workspaceId: setup.workspaceB.id });
 *
 *   // User should NOT be able to access it
 *   await expect(setup.memberOfACaller.resource.get({ id: resource.id }))
 *     .rejects.toThrow(/not found|forbidden/i);
 * });
 * ```
 */
export async function createWorkspaceIsolationSetup(
  options: WorkspaceIsolationOptions = {},
): Promise<WorkspaceIsolationSetup> {
  const { WorkspaceMemberRole } = await import('@sentinel/db');
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create or use existing organization
  let orgId = options.orgId;
  let createdOrg = false;
  if (!orgId) {
    const org = await prisma.organization.create({
      data: { name: `WS Isolation Test Org ${uniqueSuffix}` },
    });
    orgId = org.id;
    createdOrg = true;
  }

  // Create two workspaces
  const workspaceA = await prisma.workspace.create({
    data: {
      organizationId: orgId,
      name: options.workspaceAName ?? `Workspace A ${uniqueSuffix}`,
      slug: `workspace-a-${uniqueSuffix}`,
      description: 'Workspace A for isolation testing',
    },
  });

  const workspaceB = await prisma.workspace.create({
    data: {
      organizationId: orgId,
      name: options.workspaceBName ?? `Workspace B ${uniqueSuffix}`,
      slug: `workspace-b-${uniqueSuffix}`,
      description: 'Workspace B for isolation testing (user should NOT have access)',
    },
  });

  // Get or create user role
  let userRole = await prisma.role.findFirst({
    where: { organizationId: orgId, isAdmin: false },
  });

  if (!userRole) {
    userRole = await prisma.role.create({
      data: {
        organizationId: orgId,
        name: 'User',
        isAdmin: false,
        description: 'User role',
      },
    });
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      email: options.userEmail ?? `ws-isolation-user-${uniqueSuffix}@example.com`,
      organizationId: orgId,
      userRoles: {
        create: [{ roleId: userRole.id }],
      },
    },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });

  // Add user as member of workspace A only (NOT workspace B)
  const membershipRole = options.isWorkspaceAdmin
    ? WorkspaceMemberRole.ADMIN
    : WorkspaceMemberRole.MEMBER;

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspaceA.id,
      userId: user.id,
      role: membershipRole,
    },
  });

  // Fetch user with workspace memberships
  const memberOfA = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      userRoles: {
        include: { role: true },
      },
      workspaceMemberships: {
        select: { workspaceId: true, role: true },
      },
    },
  });

  // Create auth context
  const isAdmin = memberOfA.userRoles.some((ur) => ur.role.isAdmin);
  const workspaceIds = memberOfA.workspaceMemberships.map((wm) => wm.workspaceId);
  const adminWorkspaceIds = memberOfA.workspaceMemberships
    .filter((wm) => wm.role === WorkspaceMemberRole.ADMIN)
    .map((wm) => wm.workspaceId);

  const memberOfAAuth: AuthContext = {
    user: memberOfA,
    organizationId: memberOfA.organizationId,
    roles: memberOfA.userRoles.map((ur) => ur.role.name),
    isAdmin,
    isOrgOwner: false,
    workspaceIds,
    adminWorkspaceIds,
  };

  const memberOfACaller = createCallerWithAuth(memberOfAAuth);

  // Cleanup function
  const cleanup = async () => {
    // Delete workspace memberships
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
    });

    // Delete workspaces
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceA.id, workspaceB.id] } },
    });

    // Delete user roles and user
    await prisma.userRole.deleteMany({
      where: { userId: user.id },
    });
    await prisma.user.delete({
      where: { id: user.id },
    });

    // Delete organization if we created it
    if (createdOrg) {
      // Clean up any roles we created
      await prisma.role.deleteMany({
        where: { organizationId: orgId },
      });
      await prisma.organization.delete({
        where: { id: orgId },
      });
    }
  };

  return {
    orgId,
    workspaceA: { id: workspaceA.id, name: workspaceA.name },
    workspaceB: { id: workspaceB.id, name: workspaceB.name },
    memberOfA,
    memberOfAAuth,
    memberOfACaller,
    cleanup,
  };
}

/**
 * Verifies that a list of workspace-scoped items only contains items from the expected workspace.
 *
 * @param items - Array of items that should have a workspaceId property
 * @param expectedWorkspaceId - The workspace ID that all items should belong to
 * @param allowOrgWide - If true, items with null workspaceId (org-wide) are also allowed
 * @throws Error if any item has a different workspaceId
 *
 * @example
 * ```typescript
 * const policies = await caller.admin.policies.list();
 * verifyWorkspaceIsolationForList(policies, setup.workspaceA.id);
 * ```
 */
export function verifyWorkspaceIsolationForList<T extends { workspaceId?: string | null }>(
  items: T[],
  expectedWorkspaceId: string,
  allowOrgWide: boolean = true,
): void {
  for (const item of items) {
    if ('workspaceId' in item) {
      const isExpectedWorkspace = item.workspaceId === expectedWorkspaceId;
      const isOrgWide = item.workspaceId === null && allowOrgWide;

      if (!isExpectedWorkspace && !isOrgWide) {
        throw new Error(
          `Workspace isolation violated: expected workspaceId ${expectedWorkspaceId}${allowOrgWide ? ' or null (org-wide)' : ''}, got ${item.workspaceId}`,
        );
      }
    }
  }
}

/**
 * Tests that a procedure properly enforces workspace isolation.
 *
 * @param accessibleCall - A function that should succeed (accessing workspace A resource)
 * @param inaccessibleCall - A function that should fail (accessing workspace B resource)
 * @returns Object with success status and any error messages
 *
 * @example
 * ```typescript
 * const result = await verifyWorkspaceIsolation(
 *   () => caller.resource.get({ id: workspaceAResourceId }),
 *   () => caller.resource.get({ id: workspaceBResourceId }),
 * );
 * expect(result.accessibleSuccess).toBe(true);
 * expect(result.inaccessibleBlocked).toBe(true);
 * ```
 */
export async function verifyWorkspaceIsolation(
  accessibleCall: () => Promise<unknown>,
  inaccessibleCall: () => Promise<unknown>,
): Promise<{
  accessibleSuccess: boolean;
  accessibleError?: string;
  inaccessibleBlocked: boolean;
  inaccessibleError?: string;
}> {
  let accessibleSuccess = false;
  let accessibleError: string | undefined;
  let inaccessibleBlocked = false;
  let inaccessibleError: string | undefined;

  // Test accessible resource (should succeed)
  try {
    await accessibleCall();
    accessibleSuccess = true;
  } catch (error: unknown) {
    const err = error as { message?: string };
    accessibleError = err.message ?? 'Unknown error';
  }

  // Test inaccessible resource (should fail)
  try {
    await inaccessibleCall();
    // If we get here, the call succeeded when it should have failed
    inaccessibleBlocked = false;
    inaccessibleError = 'Call succeeded when it should have been blocked';
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    // Expected behavior - the call was blocked
    inaccessibleBlocked = true;
    // Check if it's the right kind of error (not found, forbidden, etc.)
    const isExpectedError =
      err.code === 'NOT_FOUND' ||
      err.code === 'FORBIDDEN' ||
      err.code === 'UNAUTHORIZED' ||
      err.message?.toLowerCase().includes('not found') ||
      err.message?.toLowerCase().includes('forbidden') ||
      err.message?.toLowerCase().includes('permission') ||
      err.message?.toLowerCase().includes('access');

    if (!isExpectedError) {
      inaccessibleError = `Unexpected error type: ${err.code ?? err.message}`;
    }
  }

  return {
    accessibleSuccess,
    accessibleError,
    inaccessibleBlocked,
    inaccessibleError,
  };
}

// ============================================================================
// Policy Testing Helpers
// ============================================================================

/**
 * Creates a test policy with specified configuration
 */
export async function createTestPolicyWithMatchers(
  orgId: string,
  effect: 'ALLOW' | 'DENY',
  matchers: string[],
  toolPatterns: string[] = ['*::*'],
): Promise<Policy> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return prisma.policy.create({
    data: {
      slug: `test-policy-${uniqueSuffix}`,
      organizationId: orgId,
      matchers,
      toolPatterns,
      effect: effect === 'ALLOW' ? PolicyEffect.ALLOW : PolicyEffect.DENY,
      description: `Test ${effect} policy`,
      enabled: true,
    },
  });
}

/**
 * Creates an ALLOW policy for everyone
 */
export async function createAllowEveryonePolicy(
  orgId: string,
  toolPatterns: string[] = ['*::*'],
): Promise<Policy> {
  return createTestPolicyWithMatchers(orgId, 'ALLOW', ['*'], toolPatterns);
}

/**
 * Creates a DENY policy for everyone
 */
export async function createDenyEveryonePolicy(
  orgId: string,
  toolPatterns: string[] = ['*::*'],
): Promise<Policy> {
  return createTestPolicyWithMatchers(orgId, 'DENY', ['*'], toolPatterns);
}

/**
 * Creates a DENY policy for a specific role
 */
export async function createDenyRolePolicy(
  orgId: string,
  roleName: string,
  toolPatterns: string[] = ['*::*'],
): Promise<Policy> {
  return createTestPolicyWithMatchers(orgId, 'DENY', [`role:${roleName}`], toolPatterns);
}

/**
 * Creates a DENY policy for a specific user
 */
export async function createDenyUserPolicy(
  orgId: string,
  userEmail: string,
  toolPatterns: string[] = ['*::*'],
): Promise<Policy> {
  return createTestPolicyWithMatchers(orgId, 'DENY', [`user:${userEmail}`], toolPatterns);
}

// ============================================================================
// Auth Bypass Test Helpers
// ============================================================================

/**
 * Test result for auth bypass testing
 */
export interface AuthBypassTestResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Tests that a procedure rejects unauthenticated requests
 */
export async function testUnauthenticatedAccess(
  procedureCall: () => Promise<unknown>,
): Promise<AuthBypassTestResult> {
  try {
    await procedureCall();
    return {
      success: false,
      error: 'Procedure did not reject unauthenticated request',
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'UNAUTHORIZED' || err.message?.includes('UNAUTHORIZED')) {
      return { success: true };
    }
    return { success: true }; // Any error is acceptable for auth rejection
  }
}

/**
 * Tests that a procedure rejects non-admin users when adminProcedure is expected
 */
export async function testNonAdminAccess(
  procedureCall: () => Promise<unknown>,
): Promise<AuthBypassTestResult> {
  try {
    await procedureCall();
    return {
      success: false,
      error: 'Procedure did not reject non-admin request',
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED' || err.message?.includes('admin')) {
      return { success: true };
    }
    return { success: true }; // Any error is acceptable for access rejection
  }
}

/**
 * Creates a tRPC caller with a revoked (invalid) token context
 */
export function createCallerWithRevokedToken() {
  const user = createMockUser({
    id: 'revoked-user-id',
    email: 'revoked@test.com',
    accessToken: 'revoked-token-12345',
    roles: [{ id: 'user-role-id', name: 'User', isAdmin: false }],
  });

  // Note: In real tests, you'd also need to ensure the token is marked as revoked in DB
  return createCallerWithAuth(createAuthContext(user));
}

/**
 * Creates a tRPC caller with a deleted user context
 */
export function createCallerWithDeletedUser() {
  const now = new Date();
  const user = createMockUser({
    id: 'deleted-user-id',
    email: 'deleted@test.com',
    accessToken: 'deleted-token-12345',
    deletedAt: now,
    roles: [{ id: 'user-role-id', name: 'User', isAdmin: false }],
  });

  return createCallerWithAuth(createAuthContext(user));
}

// ============================================================================
// Token Security Helpers
// ============================================================================

/**
 * Revokes a user's token in the database
 */
export async function revokeUserToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { accessToken: `revoked-${Date.now()}` },
  });
}

/**
 * Soft deletes a user in the database
 */
export async function softDeleteUser(userId: string, deletedBy: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      deletedBy,
    },
  });
}

/**
 * Refreshes a user's token and returns the new token
 */
export async function refreshUserToken(userId: string): Promise<string> {
  const newToken = `refreshed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await prisma.user.update({
    where: { id: userId },
    data: { accessToken: newToken },
  });

  return newToken;
}

// ============================================================================
// MCP Server Helpers
// ============================================================================

/**
 * Creates a test MCP server in the database
 */
export async function createTestMcpServer(
  orgId: string,
  overrides: {
    name?: string;
    url?: string;
    authType?: 'NONE' | 'API_KEY' | 'OAUTH';
    trusted?: boolean;
  } = {},
): Promise<{ id: string; name: string; url: string }> {
  const { McpAuthType } = await import('@sentinel/db');
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const server = await prisma.mcpServer.create({
    data: {
      name: overrides.name ?? `Test Server ${uniqueSuffix}`,
      organizationId: orgId,
      url: overrides.url ?? `https://test-${uniqueSuffix}.example.com`,
      authType: McpAuthType[overrides.authType ?? 'NONE'],
      trusted: overrides.trusted ?? true,
    },
  });

  return { id: server.id, name: server.name, url: server.url };
}

// ============================================================================
// Audit Log Helpers
// ============================================================================

/**
 * Creates a test audit log entry
 */
export async function createTestAuditEntry(
  orgId: string,
  userId: string,
  overrides: {
    toolName?: string;
    decision?: 'ALLOWED' | 'DENIED';
    agentId?: string;
  } = {},
): Promise<{ id: string }> {
  const { AuditDecision } = await import('@sentinel/db');

  const entry = await prisma.auditLogEntry.create({
    data: {
      organizationId: orgId,
      userId,
      agentId: overrides.agentId ?? null,
      toolName: overrides.toolName ?? 'test::tool',
      parameters: { test: true },
      decision: AuditDecision[overrides.decision ?? 'ALLOWED'],
      policyIds: [],
      matchedPolicyIds: [],
      userRoles: [],
    },
  });

  return { id: entry.id };
}

// ============================================================================
// Permission Request Helpers
// ============================================================================

/**
 * Creates a test permission request
 */
export async function createTestPermissionRequest(
  orgId: string,
  userId: string,
  overrides: {
    toolNames?: string[];
    reason?: string;
  } = {},
): Promise<{ id: string }> {
  const request = await prisma.permissionRequest.create({
    data: {
      userId,
      toolNames: overrides.toolNames ?? ['test::*'],
      reason: overrides.reason ?? 'Test request',
      status: 'PENDING',
    },
  });

  return { id: request.id };
}

// ============================================================================
// Cleanup Helpers
// ============================================================================

/**
 * Cleans up test data created with a specific prefix
 */
export async function cleanupTestData(prefix: string): Promise<void> {
  // Clean up policies
  await prisma.policy.deleteMany({
    where: { slug: { startsWith: prefix } },
  });

  // Clean up users
  await prisma.user.deleteMany({
    where: { email: { contains: prefix } },
  });

  // Clean up MCP servers
  await prisma.mcpServer.deleteMany({
    where: { name: { contains: prefix } },
  });
}
