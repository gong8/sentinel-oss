/**
 * Ownership Transfer Service
 * Handles ownership transfer workflow
 */

import { OwnershipTransferStatus, prisma } from '@sentinel/db';

const TRANSFER_EXPIRY_HOURS = 72; // 3 days

/**
 * Initiate an ownership transfer
 */
export async function initiateOwnershipTransfer(
  organizationId: string,
  fromUserId: string,
  toUserId: string,
) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TRANSFER_EXPIRY_HOURS);

  const transfer = await prisma.ownershipTransfer.create({
    data: {
      organizationId,
      fromUserId,
      toUserId,
      expiresAt,
    },
    include: {
      fromUser: {
        select: {
          id: true,
          email: true,
        },
      },
      toUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  return transfer;
}

/**
 * Accept an ownership transfer
 */
export async function acceptOwnershipTransfer(transferId: string, acceptedByUserId: string) {
  const transfer = await prisma.ownershipTransfer.update({
    where: { id: transferId },
    data: {
      status: OwnershipTransferStatus.ACCEPTED,
      resolvedAt: new Date(),
      resolvedBy: acceptedByUserId,
    },
    include: {
      organization: true,
      fromUser: {
        select: {
          id: true,
          email: true,
        },
      },
      toUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  // Add the new user as owner
  await prisma.orgOwner.create({
    data: {
      organizationId: transfer.organizationId,
      userId: transfer.toUserId,
      addedBy: transfer.fromUserId,
    },
  });

  // Update user's orgRole
  await prisma.user.update({
    where: { id: transfer.toUserId },
    data: { orgRole: 'OWNER' },
  });

  return transfer;
}

/**
 * Decline an ownership transfer
 */
export async function declineOwnershipTransfer(transferId: string, declinedByUserId: string) {
  const transfer = await prisma.ownershipTransfer.update({
    where: { id: transferId },
    data: {
      status: OwnershipTransferStatus.DECLINED,
      resolvedAt: new Date(),
      resolvedBy: declinedByUserId,
    },
  });

  return transfer;
}

/**
 * Cancel an ownership transfer
 */
export async function cancelOwnershipTransfer(transferId: string) {
  const transfer = await prisma.ownershipTransfer.update({
    where: { id: transferId },
    data: {
      status: OwnershipTransferStatus.EXPIRED, // Using EXPIRED for cancelled too
      resolvedAt: new Date(),
    },
  });

  return transfer;
}

/**
 * Get pending transfers for a user (as recipient)
 */
export async function getPendingTransfersForUser(organizationId: string, userId: string) {
  return prisma.ownershipTransfer.findMany({
    where: {
      organizationId,
      toUserId: userId,
      status: OwnershipTransferStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    include: {
      fromUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get pending transfers initiated by a user
 */
export async function getPendingTransfersFromUser(organizationId: string, userId: string) {
  return prisma.ownershipTransfer.findMany({
    where: {
      organizationId,
      fromUserId: userId,
      status: OwnershipTransferStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    include: {
      toUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a transfer by ID
 */
export async function getOwnershipTransfer(transferId: string) {
  return prisma.ownershipTransfer.findUnique({
    where: { id: transferId },
    include: {
      fromUser: {
        select: {
          id: true,
          email: true,
        },
      },
      toUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Expire old pending transfers
 */
export async function expirePendingTransfers() {
  const result = await prisma.ownershipTransfer.updateMany({
    where: {
      status: OwnershipTransferStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: OwnershipTransferStatus.EXPIRED,
      resolvedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * List all transfers for an organization
 */
export async function listOwnershipTransfers(
  organizationId: string,
  options: { status?: OwnershipTransferStatus } = {},
) {
  return prisma.ownershipTransfer.findMany({
    where: {
      organizationId,
      ...(options.status ? { status: options.status } : {}),
    },
    include: {
      fromUser: {
        select: {
          id: true,
          email: true,
        },
      },
      toUser: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
