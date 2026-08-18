/**
 * Authentication Test Helpers
 * Utilities for creating test authentication contexts
 */

import { OrgRole } from '@sentinel/db';
import type { Role, UserWithRoles } from '../../packages/api/src/types/role.js';

/**
 * Creates a mock Role object for testing
 */
export function createMockRole(overrides: Partial<Role> = {}): Role {
  const now = new Date();
  return {
    id: 'role-id',
    organizationId: 'org-id',
    name: 'User',
    isAdmin: false,
    description: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

/**
 * Creates a mock UserWithRoles object for testing
 */
export function createMockUser(
  overrides: Partial<Omit<UserWithRoles, 'userRoles'>> & {
    roles?: Array<Partial<Role>>;
  } = {},
): UserWithRoles {
  const now = new Date();
  const userId = overrides.id ?? 'user-id';
  const orgId = overrides.organizationId ?? 'org-id';

  const roles = overrides.roles ?? [{ name: 'User', isAdmin: false }];

  return {
    id: userId,
    email: 'user@test.com',
    organizationId: orgId,
    accessToken: 'user-token',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
    lastActivityAt: null,
    orgRole: OrgRole.MEMBER,
    ...overrides,
    userRoles: roles.map((roleOverrides, index) => {
      const role = createMockRole({
        id: `role-${index}-id`,
        organizationId: orgId,
        ...roleOverrides,
      });
      return {
        id: `user-role-${index}`,
        userId,
        roleId: role.id,
        createdAt: now,
        role,
      };
    }),
  };
}

/**
 * Creates an auth context from a user object
 */
export function createAuthContext(
  user: UserWithRoles,
  overrides: { isOrgOwner?: boolean; workspaceIds?: string[]; adminWorkspaceIds?: string[] } = {},
) {
  const isAdmin = user.userRoles.some((ur) => ur.role.isAdmin);
  return {
    user,
    organizationId: user.organizationId,
    roles: user.userRoles.map((ur) => ur.role.name),
    isAdmin,
    isOrgOwner: overrides.isOrgOwner ?? false,
    workspaceIds: overrides.workspaceIds ?? [],
    adminWorkspaceIds: overrides.adminWorkspaceIds ?? [],
  };
}

/**
 * Creates an admin auth context for testing
 */
export function createAdminAuthContext() {
  const user = createMockUser({
    id: 'admin-id',
    email: 'admin@test.com',
    accessToken: 'admin-token',
    roles: [{ id: 'admin-role-id', name: 'Admin', isAdmin: true }],
  });
  return createAuthContext(user);
}

/**
 * Creates a regular user auth context for testing
 */
export function createUserAuthContext() {
  const user = createMockUser({
    id: 'user-id',
    email: 'user@test.com',
    accessToken: 'user-token',
    roles: [{ id: 'user-role-id', name: 'User', isAdmin: false }],
  });
  return createAuthContext(user);
}
