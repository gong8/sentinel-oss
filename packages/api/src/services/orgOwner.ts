/**
 * Organization Owner Service
 * Handles org owner management operations
 */

import { prisma } from '@sentinel/db';
import { USER_SELECT } from '../lib/prismaSelects.js';

/**
 * Add a user as an organization owner
 */
export async function addOrgOwner(organizationId: string, userId: string, addedBy?: string) {
  // Update user's orgRole to OWNER
  await prisma.user.update({
    where: { id: userId },
    data: { orgRole: 'OWNER' },
  });

  // Create OrgOwner record
  const owner = await prisma.orgOwner.create({
    data: {
      organizationId,
      userId,
      addedBy,
    },
    include: {
      user: {
        select: USER_SELECT,
      },
    },
  });

  return owner;
}

/**
 * Remove a user from organization owners
 * Note: Caller must ensure at least one owner remains
 */
export async function removeOrgOwner(organizationId: string, userId: string) {
  // Remove OrgOwner record
  const deleted = await prisma.orgOwner.delete({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  });

  // Update user's orgRole back to MEMBER
  await prisma.user.update({
    where: { id: userId },
    data: { orgRole: 'MEMBER' },
  });

  return deleted;
}

/**
 * List all organization owners
 */
export async function listOrgOwners(organizationId: string) {
  return prisma.orgOwner.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          deletedAt: true,
        },
      },
      addedByUser: {
        select: USER_SELECT,
      },
    },
    orderBy: { addedAt: 'asc' },
  });
}

/**
 * Check if a user is an organization owner
 */
export async function isUserOrgOwner(organizationId: string, userId: string) {
  const owner = await prisma.orgOwner.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  });

  return !!owner;
}

/**
 * Count organization owners
 */
export async function countOrgOwners(organizationId: string) {
  return prisma.orgOwner.count({
    where: { organizationId },
  });
}

/**
 * Get an org owner record
 */
export async function getOrgOwner(organizationId: string, userId: string) {
  return prisma.orgOwner.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
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
