/**
 * Admin Policy Proposals Router
 * Handles org-wide policy proposal workflow for workspace admins
 */

import { AdminActionType, AdminResourceType, PolicyEffect, prisma } from '@sentinel/db';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwBadRequest, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { generatePolicySlug } from '../../services/policy.js';
import { validateMatchers, validateToolPatterns } from '../../services/policyValidation.js';
import { adminProcedure, orgOwnerProcedure, router } from '../init.js';

export const adminPolicyProposalsRouter = router({
  /**
   * List policy proposals
   * Org owners see all, workspace admins see their own
   */
  list: adminProcedure
    .input(
      z
        .object({
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { isOrgOwner } = ctx.auth;

      return prisma.orgWidePolicyProposal.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.status ? { status: input.status } : {}),
          // Org owners see all, workspace admins see their own
          ...(isOrgOwner ? {} : { proposedById: ctx.auth.user.id }),
        },
        include: {
          proposedBy: {
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
        orderBy: { createdAt: 'desc' },
      });
    }),

  /**
   * Create a policy proposal (workspace admins only)
   */
  create: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        matchers: z.array(z.string()).min(1),
        toolPatterns: z.array(z.string()).min(1),
        effect: z.nativeEnum(PolicyEffect),
        description: z.string().min(1).max(500),
        conditions: z.unknown().optional(),
        justification: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Must be a workspace admin (or org owner)
      if (!ctx.auth.isOrgOwner && !ctx.auth.adminWorkspaceIds.includes(input.workspaceId)) {
        throwBadRequest('You must be a workspace admin to create policy proposals');
      }

      // Verify workspace exists
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: input.workspaceId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!workspace) {
        throwNotFound('Workspace not found');
      }

      // Validate matchers
      const matchersResult = await validateMatchers(ctx.auth.organizationId, input.matchers);
      if (!matchersResult.valid) {
        throwBadRequest(matchersResult.error);
      }

      // Validate tool patterns
      const patternsResult = await validateToolPatterns(
        ctx.auth.organizationId,
        input.toolPatterns,
      );
      if (!patternsResult.valid) {
        throwBadRequest(patternsResult.error);
      }

      const proposal = await prisma.orgWidePolicyProposal.create({
        data: {
          organizationId: ctx.auth.organizationId,
          workspaceId: input.workspaceId,
          proposedById: ctx.auth.user.id,
          matchers: input.matchers,
          toolPatterns: patternsResult.patterns,
          effect: input.effect,
          description: input.description,
          conditions: input.conditions ?? undefined,
          justification: input.justification,
        },
        include: {
          proposedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_PROPOSAL_CREATE,
        resourceType: AdminResourceType.POLICY_PROPOSAL,
        resourceId: proposal.id,
        resourceName: input.description,
        actionDetails: {
          workspaceId: input.workspaceId,
          workspaceName: workspace.name,
          matchers: input.matchers,
          toolPatterns: patternsResult.patterns,
          effect: input.effect,
          justification: input.justification,
        },
        afterSnapshot: {
          id: proposal.id,
          organizationId: proposal.organizationId,
          workspaceId: proposal.workspaceId,
          status: proposal.status,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return proposal;
    }),

  /**
   * Approve a policy proposal (org owners only)
   * Creates the actual org-wide policy
   */
  approve: orgOwnerProcedure
    .input(
      z.object({
        proposalId: z.string().cuid(),
        reviewNote: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await prisma.orgWidePolicyProposal.findFirst({
        where: {
          id: input.proposalId,
          organizationId: ctx.auth.organizationId,
          status: 'PENDING',
        },
        include: {
          proposedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!proposal) {
        throwNotFound('Proposal not found or already resolved');
      }

      // Generate slug for the new policy
      const existingSlugs = new Set(
        (
          await prisma.policy.findMany({
            where: { organizationId: ctx.auth.organizationId },
            select: { slug: true },
          })
        ).map((p) => p.slug),
      );

      const slug = generatePolicySlug(
        proposal.matchers,
        proposal.toolPatterns,
        proposal.effect,
        existingSlugs,
      );

      // Create the actual policy
      const policy = await prisma.policy.create({
        data: {
          organizationId: ctx.auth.organizationId,
          slug,
          matchers: proposal.matchers,
          toolPatterns: proposal.toolPatterns,
          effect: proposal.effect,
          description: proposal.description,
          conditions: proposal.conditions ?? undefined,
          // No workspaceId - this is an org-wide policy
        },
      });

      // Update the proposal
      const updated = await prisma.orgWidePolicyProposal.update({
        where: { id: input.proposalId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedBy: ctx.auth.user.id,
          reviewNote: input.reviewNote,
          createdPolicyId: policy.id,
        },
      });

      // Log admin action for proposal approval
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_PROPOSAL_APPROVE,
        resourceType: AdminResourceType.POLICY_PROPOSAL,
        resourceId: proposal.id,
        resourceName: proposal.description,
        actionDetails: {
          proposedBy: proposal.proposedBy.email,
          workspaceId: proposal.workspaceId,
          createdPolicyId: policy.id,
          createdPolicySlug: slug,
          reviewNote: input.reviewNote,
        },
        beforeSnapshot: {
          id: proposal.id,
          status: proposal.status,
        },
        afterSnapshot: {
          id: updated.id,
          status: updated.status,
          reviewedAt: updated.reviewedAt?.toISOString(),
          reviewedBy: updated.reviewedBy,
          createdPolicyId: updated.createdPolicyId,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      // Log admin action for policy creation
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_CREATE,
        resourceType: AdminResourceType.POLICY,
        resourceId: policy.id,
        resourceName: policy.slug,
        actionDetails: {
          createdFromProposal: proposal.id,
          proposedBy: proposal.proposedBy.email,
        },
        afterSnapshot: {
          id: policy.id,
          slug: policy.slug,
          matchers: policy.matchers,
          toolPatterns: policy.toolPatterns,
          effect: policy.effect,
          description: policy.description,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { proposal: updated, policy };
    }),

  /**
   * Reject a policy proposal (org owners only)
   */
  reject: orgOwnerProcedure
    .input(
      z.object({
        proposalId: z.string().cuid(),
        reviewNote: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await prisma.orgWidePolicyProposal.findFirst({
        where: {
          id: input.proposalId,
          organizationId: ctx.auth.organizationId,
          status: 'PENDING',
        },
        include: {
          proposedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!proposal) {
        throwNotFound('Proposal not found or already resolved');
      }

      const updated = await prisma.orgWidePolicyProposal.update({
        where: { id: input.proposalId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedBy: ctx.auth.user.id,
          reviewNote: input.reviewNote,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_PROPOSAL_REJECT,
        resourceType: AdminResourceType.POLICY_PROPOSAL,
        resourceId: proposal.id,
        resourceName: proposal.description,
        actionDetails: {
          proposedBy: proposal.proposedBy.email,
          workspaceId: proposal.workspaceId,
          reviewNote: input.reviewNote,
        },
        beforeSnapshot: {
          id: proposal.id,
          status: proposal.status,
        },
        afterSnapshot: {
          id: updated.id,
          status: updated.status,
          reviewedAt: updated.reviewedAt?.toISOString(),
          reviewedBy: updated.reviewedBy,
          reviewNote: updated.reviewNote,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Get a specific proposal
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const proposal = await prisma.orgWidePolicyProposal.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
      include: {
        proposedBy: {
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
        createdPolicy: true,
      },
    });

    if (!proposal) {
      throwNotFound('Proposal not found');
    }

    // Non-owners can only see their own proposals
    if (!ctx.auth.isOrgOwner && proposal.proposedById !== ctx.auth.user.id) {
      throwNotFound('Proposal not found');
    }

    return proposal;
  }),
});
