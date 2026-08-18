/**
 * Admin Attestation Router
 * Handles agent verification and publisher management for identity attestation
 */

import { AdminActionType, AdminResourceType, prisma, Prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  clearAgentVerificationCache,
  getAgentVerificationStatus,
  listPublishers,
  registerPublisherKey,
  SUPPORTED_ALGORITHMS,
  verifyAgent,
} from '../../services/verification.js';
import { adminProcedure, router } from '../init.js';

// Zod schema for supported algorithms
const algorithmSchema = z.enum(SUPPORTED_ALGORITHMS);

export const adminAttestationRouter = router({
  // ============================================================================
  // AGENT VERIFICATION
  // ============================================================================

  /**
   * Verify an agent's identity using its JWKS URL
   */
  verifyAgent: adminProcedure
    .input(z.object({ agentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.agentId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found',
        });
      }

      const result = await verifyAgent(ctx.auth.organizationId, input.agentId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.AGENT_VERIFY,
        resourceType: AdminResourceType.AGENT,
        resourceId: agent.id,
        resourceName: agent.name,
        actionDetails: {
          verified: result.verified,
          algorithm: result.algorithm,
          keyId: result.keyId,
          error: result.error,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Get verification status for an agent
   */
  getVerificationStatus: adminProcedure
    .input(z.object({ agentId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.agentId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found',
        });
      }

      return getAgentVerificationStatus(ctx.auth.organizationId, input.agentId);
    }),

  /**
   * Refresh agent verification (clear cache and re-verify)
   */
  refreshVerification: adminProcedure
    .input(z.object({ agentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.agentId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found',
        });
      }

      // Clear cache to force re-fetch
      await clearAgentVerificationCache(ctx.auth.organizationId, input.agentId);

      const result = await verifyAgent(ctx.auth.organizationId, input.agentId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.AGENT_REFRESH_VERIFICATION,
        resourceType: AdminResourceType.AGENT,
        resourceId: agent.id,
        resourceName: agent.name,
        actionDetails: {
          verified: result.verified,
          algorithm: result.algorithm,
          keyId: result.keyId,
          error: result.error,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return result;
    }),

  /**
   * Update an agent's JWKS URL
   */
  updateAgentJwksUrl: adminProcedure
    .input(
      z.object({
        agentId: z.string().cuid(),
        publicKeyUrl: z.string().url().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.agentId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found',
        });
      }

      // Capture before snapshot
      const beforeSnapshot = {
        publicKeyUrl: agent.publicKeyUrl,
        signatureVerified: agent.signatureVerified,
      };

      // Update agent and reset verification status
      await prisma.agent.update({
        where: { id: input.agentId },
        data: {
          publicKeyUrl: input.publicKeyUrl,
          signatureVerified: false,
          signatureVerifiedAt: null,
          publicKeyCache: Prisma.DbNull,
          publicKeyCachedAt: null,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.AGENT_VERIFY,
        resourceType: AdminResourceType.AGENT,
        resourceId: agent.id,
        resourceName: agent.name,
        actionDetails: {
          action: 'update_jwks_url',
          newUrl: input.publicKeyUrl,
        },
        beforeSnapshot,
        afterSnapshot: {
          publicKeyUrl: input.publicKeyUrl,
          signatureVerified: false,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  // ============================================================================
  // PUBLISHER MANAGEMENT
  // ============================================================================

  /**
   * Register a new publisher with a public key
   */
  registerPublisher: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        publicKey: z.string().min(200), // PEM-encoded public key (valid PEM keys are >= 200 chars)
        algorithm: algorithmSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, fingerprint } = await registerPublisherKey(
          ctx.auth.organizationId,
          input.name,
          input.publicKey,
          input.algorithm,
        );

        // Log admin action
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: ctx.auth.user.id,
          actionType: AdminActionType.PUBLISHER_CREATE,
          resourceType: AdminResourceType.PUBLISHER,
          resourceId: id,
          resourceName: input.name,
          actionDetails: {
            algorithm: input.algorithm,
            fingerprint,
          },
          afterSnapshot: {
            id,
            name: input.name,
            algorithm: input.algorithm,
            fingerprint,
          },
          ...getRequestMetaFromTrpc(ctx),
        });

        return { id, fingerprint };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to register publisher',
        });
      }
    }),

  /**
   * List all publishers for the organization
   */
  listPublishers: adminProcedure.query(async ({ ctx }) => {
    return listPublishers(ctx.auth.organizationId);
  }),

  /**
   * Get a single publisher by ID
   */
  getPublisher: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const publisher = await prisma.publisherRegistry.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          keyAlgorithm: true,
          keyFingerprint: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!publisher) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Publisher not found',
        });
      }

      return publisher;
    }),

  /**
   * Delete a publisher (soft delete)
   */
  deletePublisher: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const publisher = await prisma.publisherRegistry.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!publisher) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Publisher not found',
        });
      }

      // Capture before snapshot
      const beforeSnapshot = {
        id: publisher.id,
        name: publisher.name,
        keyAlgorithm: publisher.keyAlgorithm,
        keyFingerprint: publisher.keyFingerprint,
      };

      // Soft delete
      await prisma.publisherRegistry.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.auth.user.id,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.PUBLISHER_DELETE,
        resourceType: AdminResourceType.PUBLISHER,
        resourceId: publisher.id,
        resourceName: publisher.name,
        actionDetails: {
          fingerprint: publisher.keyFingerprint,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),
});
