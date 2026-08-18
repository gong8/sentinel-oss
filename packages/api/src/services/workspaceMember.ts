/**
 * Workspace Member Service
 * Handles workspace membership operations
 */

import { prisma, WorkspaceMemberRole } from '@sentinel/db';
import { USER_SELECT } from '../lib/prismaSelects.js';

/**
 * Add a user to a workspace
 */
export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole = 'MEMBER',
) {
  const member = await prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId,
      role,
    },
    include: {
      user: {
        select: USER_SELECT,
      },
    },
  });

  return member;
}

/**
 * Remove a user from a workspace
 */
export async function removeWorkspaceMember(workspaceId: string, userId: string) {
  const deleted = await prisma.workspaceMember.delete({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  return deleted;
}

/**
 * Update a workspace member's role
 */
export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole,
) {
  const member = await prisma.workspaceMember.update({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    data: { role },
    include: {
      user: {
        select: USER_SELECT,
      },
    },
  });

  return member;
}

/**
 * Get a workspace member
 */
export async function getWorkspaceMember(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      user: {
        select: USER_SELECT,
      },
    },
  });
}

/**
 * List all members of a workspace
 */
export async function listWorkspaceMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          deletedAt: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Check if a user is a member of a workspace
 */
export async function isUserWorkspaceMember(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  return !!member;
}

/**
 * Check if a user is a workspace admin
 */
export async function isUserWorkspaceAdmin(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  return member?.role === 'ADMIN';
}

/**
 * Get all workspaces a user is a member of
 */
export async function getUserWorkspaces(organizationId: string, userId: string) {
  return prisma.workspaceMember.findMany({
    where: {
      userId,
      workspace: {
        organizationId,
        deletedAt: null,
      },
    },
    include: {
      workspace: true,
    },
  });
}

/**
 * Count workspace admins
 */
export async function countWorkspaceAdmins(workspaceId: string) {
  return prisma.workspaceMember.count({
    where: {
      workspaceId,
      role: 'ADMIN',
    },
  });
}

/**
 * Add multiple users to a workspace
 */
export async function addWorkspaceMembers(
  workspaceId: string,
  userIds: string[],
  role: WorkspaceMemberRole = 'MEMBER',
): Promise<{ count: number }> {
  const result = await prisma.workspaceMember.createMany({
    data: userIds.map((userId) => ({
      workspaceId,
      userId,
      role,
    })),
    skipDuplicates: true,
  });

  return result;
}
