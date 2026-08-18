/**
 * Authentication Service
 * Handles token validation and user authentication
 */

import { prisma } from '@sentinel/db';
import crypto from 'node:crypto';
import { logger } from '../lib/logger.js';
import type { UserWithRoles } from '../types/role.js';

export interface AuthContext {
  user: UserWithRoles;
  organizationId: string;
  roles: string[];
  isAdmin: boolean;
  /** User is an organization owner */
  isOrgOwner: boolean;
  /** Workspace IDs user is a member of */
  workspaceIds: string[];
  /** Workspace IDs user is an admin of */
  adminWorkspaceIds: string[];
}

/**
 * Validates an access token and returns user context
 * @param accessToken - The access token to validate
 * @returns User context if valid, null if invalid
 */
export async function validateAccessToken(accessToken: string): Promise<AuthContext | null> {
  if (!accessToken) {
    return null;
  }

  try {
    // Find active user by access token with type-safe include
    // Uses findFirst instead of findUnique to allow filtering by deletedAt
    // This ensures soft-deleted users cannot authenticate
    const user = await prisma.user.findFirst({
      where: {
        accessToken,
        deletedAt: null, // Only allow active (non-deleted) users
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        workspaceMemberships: {
          include: {
            workspace: true,
          },
        },
        orgOwnership: true,
      },
    });

    if (!user) {
      return null;
    }

    // Prisma returns the correct type with includes - no cast needed
    // Check if user has any admin role
    const isAdmin = user.userRoles.some((ur) => ur.role.isAdmin);

    // Check if user is an organization owner
    // Check both OrgOwner records and orgRole field for backwards compatibility
    const isOrgOwner = user.orgOwnership.length > 0 || user.orgRole === 'OWNER';

    // Get workspace memberships (filter out deleted workspaces)
    const activeWorkspaceMemberships = user.workspaceMemberships.filter(
      (wm) => wm.workspace.deletedAt === null,
    );

    // Get all workspace IDs user is a member of
    const workspaceIds = activeWorkspaceMemberships.map((wm) => wm.workspaceId);

    // Get workspace IDs user is an admin of
    const adminWorkspaceIds = activeWorkspaceMemberships
      .filter((wm) => wm.role === 'ADMIN')
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
  } catch (error) {
    logger.error('Error validating access token:', error);
    return null;
  }
}

/**
 * Generates a secure random token (similar format to cuid)
 * Uses crypto.randomBytes for secure generation
 */
function generateAccessToken(): string {
  // Generate a 24-character base36 string (similar to cuid format)
  return crypto.randomBytes(18).toString('base64url').slice(0, 24);
}

/**
 * Generates a new access token for a user
 * Invalidates the old token by replacing it with a new one
 */
export async function refreshAccessToken(userId: string): Promise<string> {
  const newToken = generateAccessToken();

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: newToken,
      updatedAt: new Date(),
    },
  });

  return user.accessToken;
}

/**
 * Checks if user has a specific role (by name)
 */
export function hasRole(context: AuthContext, roleName: string): boolean {
  return context.roles.includes(roleName);
}

/**
 * Checks if user is an admin
 * Admin is special - they have the isAdmin flag set
 */
export function isAdmin(context: AuthContext): boolean {
  return context.isAdmin;
}

/**
 * Checks if user is an organization owner
 */
export function isOrgOwner(context: AuthContext): boolean {
  return context.isOrgOwner;
}

/**
 * Checks if user is a member of a specific workspace
 */
export function isWorkspaceMember(context: AuthContext, workspaceId: string): boolean {
  return context.workspaceIds.includes(workspaceId);
}

/**
 * Checks if user is an admin of a specific workspace
 */
export function isWorkspaceAdmin(context: AuthContext, workspaceId: string): boolean {
  return context.adminWorkspaceIds.includes(workspaceId);
}

/**
 * Checks if user can access a workspace (member, org owner, or org admin)
 */
export function canAccessWorkspace(context: AuthContext, workspaceId: string): boolean {
  return context.isOrgOwner || context.isAdmin || context.workspaceIds.includes(workspaceId);
}

/**
 * Checks if user can manage a workspace (workspace admin or org owner)
 *
 * Deliberately excludes org-level admins: workspace management is workspace-scoped,
 * so an org admin must be an admin of the specific workspace to manage its members.
 */
export function canManageWorkspace(context: AuthContext, workspaceId: string): boolean {
  return context.isOrgOwner || context.adminWorkspaceIds.includes(workspaceId);
}
