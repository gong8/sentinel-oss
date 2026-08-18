/**
 * Policy Exception Service
 * Handles policy exception requests from workspace admins
 */

import { PolicyEffect, PolicyExceptionStatus, PolicyExceptionType, prisma } from '@sentinel/db';

/**
 * Create a new policy proposal
 * Workspace admin proposes a new org-wide policy
 */
export async function createPolicyProposal(
  organizationId: string,
  workspaceId: string,
  requestedById: string,
  params: {
    proposedMatchers: string[];
    proposedToolPatterns: string[];
    proposedEffect: PolicyEffect;
    proposedDescription: string;
    justification: string;
  },
) {
  return prisma.policyExceptionRequest.create({
    data: {
      organizationId,
      workspaceId,
      requestedById,
      requestType: PolicyExceptionType.PROPOSAL,
      proposedMatchers: params.proposedMatchers,
      proposedToolPatterns: params.proposedToolPatterns,
      proposedEffect: params.proposedEffect,
      proposedDescription: params.proposedDescription,
      justification: params.justification,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Create a policy removal request
 * Workspace admin requests removal of a blocking global policy
 */
export async function createRemovalRequest(
  organizationId: string,
  workspaceId: string,
  requestedById: string,
  params: {
    policyId: string;
    justification: string;
  },
) {
  return prisma.policyExceptionRequest.create({
    data: {
      organizationId,
      workspaceId,
      requestedById,
      requestType: PolicyExceptionType.REMOVAL_REQUEST,
      policyId: params.policyId,
      justification: params.justification,
      proposedMatchers: [],
      proposedToolPatterns: [],
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
      policy: {
        select: {
          id: true,
          slug: true,
          description: true,
          effect: true,
        },
      },
    },
  });
}

/**
 * Create a workspace exception request
 * Workspace admin requests an exception to a global policy for their workspace
 */
export async function createWorkspaceException(
  organizationId: string,
  workspaceId: string,
  requestedById: string,
  params: {
    policyId: string;
    justification: string;
  },
) {
  return prisma.policyExceptionRequest.create({
    data: {
      organizationId,
      workspaceId,
      requestedById,
      requestType: PolicyExceptionType.WORKSPACE_EXCEPTION,
      policyId: params.policyId,
      justification: params.justification,
      proposedMatchers: [],
      proposedToolPatterns: [],
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
      policy: {
        select: {
          id: true,
          slug: true,
          description: true,
          effect: true,
        },
      },
    },
  });
}

/**
 * Get a policy exception request by ID
 */
export async function getPolicyExceptionRequest(id: string) {
  return prisma.policyExceptionRequest.findUnique({
    where: { id },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          email: true,
        },
      },
      policy: {
        select: {
          id: true,
          slug: true,
          description: true,
          effect: true,
          matchers: true,
          toolPatterns: true,
        },
      },
      resultPolicy: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });
}

/**
 * List policy exception requests for an organization
 * Org owners can see all pending requests
 */
export async function listPendingRequests(organizationId: string) {
  return prisma.policyExceptionRequest.findMany({
    where: {
      organizationId,
      status: PolicyExceptionStatus.PENDING,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
      policy: {
        select: {
          id: true,
          slug: true,
          description: true,
          effect: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * List policy exception requests for a workspace
 * Workspace admins can see requests from their workspace
 */
export async function listRequestsForWorkspace(
  organizationId: string,
  workspaceId: string,
  options: { status?: PolicyExceptionStatus } = {},
) {
  return prisma.policyExceptionRequest.findMany({
    where: {
      organizationId,
      workspaceId,
      ...(options.status ? { status: options.status } : {}),
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          email: true,
        },
      },
      policy: {
        select: {
          id: true,
          slug: true,
          description: true,
          effect: true,
        },
      },
      resultPolicy: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Approve a policy exception request
 * Creates the resulting policy based on request type
 */
export async function approveRequest(
  id: string,
  reviewedBy: string,
  options: {
    reviewNote?: string;
    policySlug?: string; // For PROPOSAL type
  } = {},
) {
  const request = await prisma.policyExceptionRequest.findUnique({
    where: { id },
    include: {
      policy: true,
      workspace: true,
    },
  });

  if (!request) {
    throw new Error('Request not found');
  }

  if (request.status !== PolicyExceptionStatus.PENDING) {
    throw new Error('Can only approve pending requests');
  }

  let resultPolicyId: string | null = null;

  // Handle different request types
  if (request.requestType === PolicyExceptionType.PROPOSAL) {
    // Create the proposed policy as org-wide
    const slug = options.policySlug ?? `proposed-${request.id.slice(-8)}`;
    const newPolicy = await prisma.policy.create({
      data: {
        organizationId: request.organizationId,
        slug,
        matchers: request.proposedMatchers,
        toolPatterns: request.proposedToolPatterns,
        effect: request.proposedEffect ?? PolicyEffect.ALLOW,
        description: request.proposedDescription ?? 'Created from policy proposal',
        enabled: true,
        workspaceId: null, // Org-wide policy
      },
    });
    resultPolicyId = newPolicy.id;
  } else if (request.requestType === PolicyExceptionType.REMOVAL_REQUEST) {
    // Disable or soft-delete the target policy
    if (request.policyId) {
      await prisma.policy.update({
        where: { id: request.policyId },
        data: {
          enabled: false,
          deletedAt: new Date(),
          deletedBy: reviewedBy,
        },
      });
    }
  } else if (request.requestType === PolicyExceptionType.WORKSPACE_EXCEPTION) {
    // Create an ALLOW policy scoped to the workspace that overrides the global DENY
    if (request.policy) {
      const slug = `ws-exception-${request.workspace.name.toLowerCase().replace(/\s+/g, '-')}-${request.id.slice(-8)}`;
      const newPolicy = await prisma.policy.create({
        data: {
          organizationId: request.organizationId,
          slug,
          matchers: [`workspace:${request.workspaceId}`],
          toolPatterns: request.policy.toolPatterns,
          effect: PolicyEffect.ALLOW,
          description: `Workspace exception for ${request.workspace.name}: ${request.justification}`,
          enabled: true,
          workspaceId: request.workspaceId,
        },
      });
      resultPolicyId = newPolicy.id;
    }
  }

  // Update the request status
  return prisma.policyExceptionRequest.update({
    where: { id },
    data: {
      status: PolicyExceptionStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedBy,
      reviewNote: options.reviewNote,
      resultPolicyId,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          email: true,
        },
      },
      resultPolicy: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });
}

/**
 * Deny a policy exception request
 */
export async function denyRequest(id: string, reviewedBy: string, reviewNote?: string) {
  const request = await prisma.policyExceptionRequest.findUnique({
    where: { id },
  });

  if (!request) {
    throw new Error('Request not found');
  }

  if (request.status !== PolicyExceptionStatus.PENDING) {
    throw new Error('Can only deny pending requests');
  }

  return prisma.policyExceptionRequest.update({
    where: { id },
    data: {
      status: PolicyExceptionStatus.DENIED,
      reviewedAt: new Date(),
      reviewedBy,
      reviewNote,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Withdraw a policy exception request
 * Requester can withdraw their own pending request
 */
export async function withdrawRequest(id: string, withdrawnById: string) {
  const request = await prisma.policyExceptionRequest.findUnique({
    where: { id },
  });

  if (!request) {
    throw new Error('Request not found');
  }

  if (request.status !== PolicyExceptionStatus.PENDING) {
    throw new Error('Can only withdraw pending requests');
  }

  if (request.requestedById !== withdrawnById) {
    throw new Error('Can only withdraw your own requests');
  }

  return prisma.policyExceptionRequest.update({
    where: { id },
    data: {
      status: PolicyExceptionStatus.WITHDRAWN,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Count pending requests for an organization
 */
export async function countPendingRequests(organizationId: string) {
  return prisma.policyExceptionRequest.count({
    where: {
      organizationId,
      status: PolicyExceptionStatus.PENDING,
    },
  });
}
