/**
 * Owner Recovery Service
 * Handles owner recovery workflow for support-initiated ownership grants
 */

import { OwnerRecoveryStatus, prisma } from '@sentinel/db';
import crypto from 'crypto';
import { addOrgOwner } from './orgOwner.js';

const RECOVERY_EXPIRY_HOURS = 72; // 3 days

/**
 * Generate a secure verification token
 */
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create an owner recovery request
 * Used by support agents to initiate ownership recovery
 */
export async function createOwnerRecoveryRequest(
  organizationId: string,
  params: {
    requestedByEmail: string;
    requestedByName?: string;
    requestedReason: string;
    supportTicketId?: string;
    targetUserEmail: string;
    targetUserId?: string;
  },
) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + RECOVERY_EXPIRY_HOURS);

  const verificationToken = generateVerificationToken();

  const request = await prisma.ownerRecoveryRequest.create({
    data: {
      organizationId,
      requestedByEmail: params.requestedByEmail,
      requestedByName: params.requestedByName,
      requestedReason: params.requestedReason,
      supportTicketId: params.supportTicketId,
      targetUserEmail: params.targetUserEmail,
      targetUserId: params.targetUserId,
      verificationToken,
      expiresAt,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return request;
}

/**
 * Verify and complete an owner recovery request
 * Called when the target user clicks the verification link
 */
export async function verifyOwnerRecovery(verificationToken: string) {
  // Find the request
  const request = await prisma.ownerRecoveryRequest.findUnique({
    where: { verificationToken },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!request) {
    throw new Error('Invalid verification token');
  }

  if (request.status !== OwnerRecoveryStatus.PENDING) {
    throw new Error(`Recovery request has already been ${request.status.toLowerCase()}`);
  }

  if (request.expiresAt < new Date()) {
    // Mark as expired
    await prisma.ownerRecoveryRequest.update({
      where: { id: request.id },
      data: {
        status: OwnerRecoveryStatus.EXPIRED,
      },
    });
    throw new Error('Recovery request has expired');
  }

  // Find or create the target user
  let targetUser = await prisma.user.findFirst({
    where: {
      organizationId: request.organizationId,
      email: request.targetUserEmail,
      deletedAt: null,
    },
  });

  if (!targetUser && request.targetUserId) {
    targetUser = await prisma.user.findFirst({
      where: {
        id: request.targetUserId,
        organizationId: request.organizationId,
        deletedAt: null,
      },
    });
  }

  if (!targetUser) {
    // Create the user if they don't exist
    targetUser = await prisma.user.create({
      data: {
        organizationId: request.organizationId,
        email: request.targetUserEmail,
        orgRole: 'MEMBER',
      },
    });
  }

  // Update the request to approved
  const updatedRequest = await prisma.ownerRecoveryRequest.update({
    where: { id: request.id },
    data: {
      status: OwnerRecoveryStatus.APPROVED,
      verifiedAt: new Date(),
      approvedAt: new Date(),
      targetUserId: targetUser.id,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Add the user as an org owner
  await addOrgOwner(request.organizationId, targetUser.id);

  return {
    request: updatedRequest,
    user: {
      id: targetUser.id,
      email: targetUser.email,
    },
  };
}

/**
 * Get an owner recovery request by ID
 */
export async function getOwnerRecoveryRequest(id: string) {
  return prisma.ownerRecoveryRequest.findUnique({
    where: { id },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Get an owner recovery request by verification token
 */
export async function getOwnerRecoveryRequestByToken(verificationToken: string) {
  return prisma.ownerRecoveryRequest.findUnique({
    where: { verificationToken },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Cancel a pending owner recovery request
 */
export async function cancelOwnerRecoveryRequest(id: string) {
  const request = await prisma.ownerRecoveryRequest.findUnique({
    where: { id },
  });

  if (!request) {
    throw new Error('Recovery request not found');
  }

  if (request.status !== OwnerRecoveryStatus.PENDING) {
    throw new Error('Can only cancel pending recovery requests');
  }

  return prisma.ownerRecoveryRequest.update({
    where: { id },
    data: {
      status: OwnerRecoveryStatus.CANCELLED,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Deny an owner recovery request
 */
export async function denyOwnerRecoveryRequest(
  id: string,
  deniedBy: string,
  deniedReason?: string,
) {
  const request = await prisma.ownerRecoveryRequest.findUnique({
    where: { id },
  });

  if (!request) {
    throw new Error('Recovery request not found');
  }

  if (request.status !== OwnerRecoveryStatus.PENDING) {
    throw new Error('Can only deny pending recovery requests');
  }

  return prisma.ownerRecoveryRequest.update({
    where: { id },
    data: {
      status: OwnerRecoveryStatus.DENIED,
      deniedAt: new Date(),
      deniedBy,
      deniedReason,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * List owner recovery requests for an organization
 */
export async function listOwnerRecoveryRequests(
  organizationId: string,
  options: { status?: OwnerRecoveryStatus } = {},
) {
  return prisma.ownerRecoveryRequest.findMany({
    where: {
      organizationId,
      ...(options.status ? { status: options.status } : {}),
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Expire old pending recovery requests
 */
export async function expirePendingRecoveryRequests() {
  const result = await prisma.ownerRecoveryRequest.updateMany({
    where: {
      status: OwnerRecoveryStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: OwnerRecoveryStatus.EXPIRED,
    },
  });

  return result.count;
}
