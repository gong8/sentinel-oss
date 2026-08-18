/**
 * Policy Tag Service
 * Handles policy tag CRUD operations and tag assignments
 */

import { prisma } from '@sentinel/db';

export interface CreatePolicyTagInput {
  organizationId: string;
  workspaceId?: string | null; // null = global (org-wide)
  name: string;
  description?: string;
  color?: string;
}

export interface UpdatePolicyTagInput {
  name?: string;
  description?: string | null;
  color?: string;
}

export interface ListPolicyTagsOptions {
  organizationId: string;
  /** If true, user is org owner and can see all tags. Otherwise, filter by workspace access. */
  isOrgOwner: boolean;
  /** Workspace IDs the user has access to (for non-owners) */
  workspaceIds?: string[];
  /** Optional: filter to specific workspace */
  workspaceId?: string | null;
}

/**
 * List policy tags based on user access
 * - Org owners see all tags (global + all workspaces)
 * - Workspace members see global tags + tags in their workspaces
 */
export async function listPolicyTags(options: ListPolicyTagsOptions) {
  const { organizationId, isOrgOwner, workspaceIds = [], workspaceId } = options;

  // Build the where clause based on access
  if (workspaceId !== undefined) {
    // Filter to specific workspace (or global if null)
    return prisma.policyTag.findMany({
      where: {
        organizationId,
        workspaceId: workspaceId,
      },
      orderBy: [{ workspaceId: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { policies: true } },
        workspace: { select: { id: true, name: true } },
      },
    });
  } else if (isOrgOwner) {
    // Org owners see all tags
    return prisma.policyTag.findMany({
      where: { organizationId },
      orderBy: [{ workspaceId: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { policies: true } },
        workspace: { select: { id: true, name: true } },
      },
    });
  } else {
    // Workspace members see global tags + their workspace tags
    return prisma.policyTag.findMany({
      where: {
        organizationId,
        OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
      },
      orderBy: [{ workspaceId: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { policies: true } },
        workspace: { select: { id: true, name: true } },
      },
    });
  }
}

/**
 * Get a single policy tag by ID
 */
export async function getPolicyTag(id: string, organizationId: string) {
  return prisma.policyTag.findFirst({
    where: { id, organizationId },
    include: {
      _count: {
        select: { policies: true },
      },
      workspace: {
        select: { id: true, name: true },
      },
    },
  });
}

/**
 * Create a new policy tag
 */
export async function createPolicyTag(input: CreatePolicyTagInput) {
  const { organizationId, workspaceId, name, description, color } = input;

  return prisma.policyTag.create({
    data: {
      organizationId,
      workspaceId: workspaceId ?? null, // null = global
      name: name.trim(),
      description: description?.trim() || null,
      color: color || '#6366f1',
    },
    include: {
      _count: {
        select: { policies: true },
      },
      workspace: {
        select: { id: true, name: true },
      },
    },
  });
}

/**
 * Update a policy tag
 */
export async function updatePolicyTag(
  id: string,
  organizationId: string,
  input: UpdatePolicyTagInput,
) {
  return prisma.policyTag.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && {
        description: input.description?.trim() || null,
      }),
      ...(input.color !== undefined && { color: input.color }),
    },
    include: {
      _count: {
        select: { policies: true },
      },
      workspace: {
        select: { id: true, name: true },
      },
    },
  });
}

/**
 * Delete a policy tag (unlinks from all policies)
 */
export async function deletePolicyTag(id: string, organizationId: string) {
  // First verify the tag belongs to this org
  const tag = await prisma.policyTag.findFirst({
    where: { id, organizationId },
  });

  if (!tag) {
    throw new Error('Policy tag not found');
  }

  // Delete will cascade to PolicyTagAssignment due to onDelete: Cascade
  return prisma.policyTag.delete({
    where: { id },
  });
}

/**
 * Check if a tag name is available within the scope
 * Names must be unique per workspace (or within global tags)
 */
export async function isTagNameAvailable(
  organizationId: string,
  workspaceId: string | null,
  name: string,
  excludeId?: string,
) {
  const existing = await prisma.policyTag.findFirst({
    where: {
      organizationId,
      workspaceId: workspaceId,
      name: name.trim(),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  return !existing;
}

/**
 * Assign tags to a policy (replaces existing assignments)
 */
export async function assignTagsToPolicy(
  policyId: string,
  organizationId: string,
  tagIds: string[],
) {
  // Verify all tags belong to this org
  if (tagIds.length > 0) {
    const validTags = await prisma.policyTag.findMany({
      where: {
        id: { in: tagIds },
        organizationId,
      },
      select: { id: true },
    });

    const validTagIds = new Set(validTags.map((t) => t.id));
    const invalidIds = tagIds.filter((id) => !validTagIds.has(id));

    if (invalidIds.length > 0) {
      throw new Error(`Invalid tag IDs: ${invalidIds.join(', ')}`);
    }
  }

  // Use a transaction to replace all assignments
  await prisma.$transaction([
    // Delete existing assignments
    prisma.policyTagAssignment.deleteMany({
      where: { policyId },
    }),
    // Create new assignments
    ...(tagIds.length > 0
      ? [
          prisma.policyTagAssignment.createMany({
            data: tagIds.map((tagId) => ({
              policyId,
              policyTagId: tagId,
            })),
          }),
        ]
      : []),
  ]);
}

/**
 * Get tags for a policy
 */
export async function getTagsForPolicy(policyId: string) {
  const assignments = await prisma.policyTagAssignment.findMany({
    where: { policyId },
    include: {
      policyTag: true,
    },
  });

  return assignments.map((a) => a.policyTag);
}

/**
 * Bulk assign a tag to multiple policies
 */
export async function bulkAssignTagToPolicies(
  tagId: string,
  organizationId: string,
  policyIds: string[],
) {
  // Verify tag belongs to this org
  const tag = await prisma.policyTag.findFirst({
    where: { id: tagId, organizationId },
  });

  if (!tag) {
    throw new Error('Policy tag not found');
  }

  // Get existing assignments to avoid duplicates
  const existingAssignments = await prisma.policyTagAssignment.findMany({
    where: {
      policyTagId: tagId,
      policyId: { in: policyIds },
    },
    select: { policyId: true },
  });

  const existingPolicyIds = new Set(existingAssignments.map((a) => a.policyId));
  const newPolicyIds = policyIds.filter((id) => !existingPolicyIds.has(id));

  if (newPolicyIds.length > 0) {
    await prisma.policyTagAssignment.createMany({
      data: newPolicyIds.map((policyId) => ({
        policyId,
        policyTagId: tagId,
      })),
    });
  }

  return { assignedCount: newPolicyIds.length };
}

/**
 * Bulk remove a tag from multiple policies
 */
export async function bulkRemoveTagFromPolicies(
  tagId: string,
  organizationId: string,
  policyIds: string[],
) {
  // Verify tag belongs to this org
  const tag = await prisma.policyTag.findFirst({
    where: { id: tagId, organizationId },
  });

  if (!tag) {
    throw new Error('Policy tag not found');
  }

  const result = await prisma.policyTagAssignment.deleteMany({
    where: {
      policyTagId: tagId,
      policyId: { in: policyIds },
    },
  });

  return { removedCount: result.count };
}
