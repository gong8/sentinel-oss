/**
 * Workspace Service
 * Handles workspace CRUD operations
 */

import { prisma } from '@sentinel/db';

import { isUserOrgOwner } from './orgOwner.js';

/**
 * Reserved workspace slugs that would conflict with routes
 * These cannot be used as workspace slugs
 *
 * Only includes slugs that actually conflict with top-level routes.
 * Since workspace routes are /admin/:slug, /user/:slug, /agent/:slug,
 * only top-level route conflicts matter.
 */
export const RESERVED_WORKSPACE_SLUGS = [
  'global', // /global/admin/* routes (org-wide view)
  'select-workspace', // /select-workspace route
  'login', // /login route
  'oauth', // /oauth/* routes
] as const;

/**
 * Check if a slug is reserved and cannot be used for workspaces
 */
export function isReservedSlug(slug: string): boolean {
  const normalizedSlug = slug.toLowerCase().trim();
  return RESERVED_WORKSPACE_SLUGS.includes(
    normalizedSlug as (typeof RESERVED_WORKSPACE_SLUGS)[number],
  );
}

export interface CreateWorkspaceInput {
  organizationId: string;
  name: string;
  description?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string | null;
}

/**
 * Generate a URL-friendly slug from a workspace name
 * Converts to lowercase, replaces spaces and special chars with hyphens
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Check if a workspace slug is available in the organization
 * Returns false if the slug is reserved or already in use
 */
export async function isWorkspaceSlugAvailable(
  organizationId: string,
  slug: string,
  excludeId?: string,
) {
  // Check if slug is reserved
  if (isReservedSlug(slug)) {
    return false;
  }

  const existing = await prisma.workspace.findFirst({
    where: {
      organizationId,
      slug,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  return !existing;
}

/**
 * Generate a unique slug for a workspace
 * If the base slug is taken or reserved, append a number
 */
export async function generateUniqueSlug(
  organizationId: string,
  name: string,
  excludeId?: string,
): Promise<string> {
  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  let counter = 1;

  // If the base slug is reserved, start with a numbered version
  if (isReservedSlug(baseSlug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  while (!(await isWorkspaceSlugAvailable(organizationId, slug, excludeId))) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

/**
 * Create a new workspace
 */
export async function createWorkspace(input: CreateWorkspaceInput) {
  const slug = await generateUniqueSlug(input.organizationId, input.name);

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      slug,
      description: input.description,
    },
  });

  return workspace;
}

/**
 * Update a workspace
 */
export async function updateWorkspace(
  organizationId: string,
  workspaceId: string,
  input: UpdateWorkspaceInput,
) {
  // If name is changing, regenerate the slug
  let slug: string | undefined;
  if (input.name) {
    slug = await generateUniqueSlug(organizationId, input.name, workspaceId);
  }

  const workspace = await prisma.workspace.update({
    where: {
      id: workspaceId,
      organizationId,
    },
    data: {
      name: input.name,
      slug,
      description: input.description,
    },
  });

  return workspace;
}

/**
 * Soft delete a workspace
 */
export async function deleteWorkspace(
  organizationId: string,
  workspaceId: string,
  deletedBy: string,
) {
  const workspace = await prisma.workspace.update({
    where: {
      id: workspaceId,
      organizationId,
    },
    data: {
      deletedAt: new Date(),
      deletedBy,
    },
  });

  return workspace;
}

/**
 * Restore a soft-deleted workspace
 */
export async function restoreWorkspace(organizationId: string, workspaceId: string) {
  const workspace = await prisma.workspace.update({
    where: {
      id: workspaceId,
      organizationId,
    },
    data: {
      deletedAt: null,
      deletedBy: null,
    },
  });

  return workspace;
}

/**
 * Get a workspace by ID
 */
export async function getWorkspace(organizationId: string, workspaceId: string) {
  return prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      organizationId,
    },
  });
}

/**
 * Get a workspace by slug
 */
export async function getWorkspaceBySlug(organizationId: string, slug: string) {
  return prisma.workspace.findFirst({
    where: {
      slug,
      organizationId,
      deletedAt: null,
    },
  });
}

/**
 * List all workspaces in an organization
 */
export async function listWorkspaces(
  organizationId: string,
  options: { includeDeleted?: boolean } = {},
) {
  return prisma.workspace.findMany({
    where: {
      organizationId,
      ...(options.includeDeleted ? {} : { deletedAt: null }),
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Get workspaces accessible by a user (member or org owner sees all)
 */
export async function getWorkspacesForUser(
  organizationId: string,
  userId: string,
  isOrgOwner: boolean,
  workspaceIds: string[],
) {
  if (isOrgOwner) {
    // Org owners see all workspaces
    return listWorkspaces(organizationId);
  }

  // Regular users see workspaces they're members of
  return prisma.workspace.findMany({
    where: {
      organizationId,
      id: { in: workspaceIds },
      deletedAt: null,
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Check if a workspace name is available in the organization
 */
export async function isWorkspaceNameAvailable(
  organizationId: string,
  name: string,
  excludeId?: string,
) {
  const existing = await prisma.workspace.findFirst({
    where: {
      organizationId,
      name,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  return !existing;
}

/**
 * Get workspace with member and resource counts
 */
export async function getWorkspaceWithCounts(organizationId: string, workspaceId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      organizationId,
    },
    include: {
      _count: {
        select: {
          members: true,
          policies: {
            where: { deletedAt: null },
          },
          mcpServers: {
            where: { deletedAt: null },
          },
          agents: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });

  return workspace;
}

/**
 * Get the list of workspace IDs an admin user has access to.
 *
 * This is used for workspace access validation in admin MCP operations.
 * - Returns undefined if the admin is an org owner (they have access to all workspaces)
 * - Returns an array of workspace IDs if the admin is a workspace-level admin
 *
 * @param organizationId - The organization ID
 * @param adminUserId - The admin user ID
 * @returns Array of workspace IDs the admin has access to, or undefined for org-wide access
 */
export async function getAdminWorkspaceIds(
  organizationId: string,
  adminUserId: string,
): Promise<string[] | undefined> {
  // Org owners have access to all workspaces (return undefined for org-wide access)
  const isOrgOwner = await isUserOrgOwner(organizationId, adminUserId);
  if (isOrgOwner) {
    return undefined;
  }

  // Get workspace IDs where the user is a member
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId: adminUserId,
      workspace: {
        organizationId,
        deletedAt: null,
      },
    },
    select: {
      workspaceId: true,
    },
  });

  return memberships.map((m) => m.workspaceId);
}
