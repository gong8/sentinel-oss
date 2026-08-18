/**
 * A2A Admin Router
 * Handles A2A agent registration, Agent Card management, and credential configuration
 */

import {
  type AgentCard,
  type Skill,
  AgentCardSchema,
  agentCardToPrismaJson,
  buildAuthHeaders,
  computeCardHash,
  fetchAgentCard,
  getPrimarySecurityScheme,
  getSupportedAuthTypes,
  parseCredentials,
  tryParseAgentCard,
} from '@sentinel/a2a';
import { AdminActionType, AdminResourceType, Prisma, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { decrypt, encrypt } from '../../lib/crypto.js';
import { toJsonValue } from '../../lib/jsonValue.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import type { AuthContext } from '../../services/auth.js';
import type { TRPCContext } from '../context.js';
import { adminProcedure, router } from '../init.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function extractSkillSummary(skills: Skill[] | undefined): Array<{ id: string; name: string }> {
  return skills?.map((s) => ({ id: s.id, name: s.name })) ?? [];
}

function buildCardUpdateData(card: AgentCard) {
  return {
    endpointUrl: card.url,
    agentCardCache: toJsonValue(agentCardToPrismaJson(card)),
    agentCardFetchedAt: new Date(),
    agentCardHash: computeCardHash(card),
  };
}

const A2A_AGENT_WHERE = {
  protocolType: 'A2A' as const,
  deletedAt: null,
};

function requireA2AAgent<T>(agent: T | null, message = 'A2A agent not found'): T {
  if (!agent) {
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  return agent;
}

interface AdminContext {
  auth: AuthContext;
  req: TRPCContext['req'];
}

interface LogActionParams {
  ctx: AdminContext;
  actionType: AdminActionType;
  resourceType: AdminResourceType;
  resourceId: string;
  resourceName: string;
  actionDetails?: Prisma.InputJsonValue;
  beforeSnapshot?: Prisma.InputJsonValue;
  afterSnapshot?: Prisma.InputJsonValue;
}

async function logAction(params: LogActionParams): Promise<void> {
  const {
    ctx,
    actionType,
    resourceType,
    resourceId,
    resourceName,
    actionDetails,
    beforeSnapshot,
    afterSnapshot,
  } = params;

  await logAdminAction({
    organizationId: ctx.auth.organizationId,
    adminUserId: ctx.auth.user.id,
    actionType,
    resourceType,
    resourceId,
    resourceName,
    actionDetails: actionDetails ?? {},
    beforeSnapshot: beforeSnapshot ?? null,
    afterSnapshot: afterSnapshot ?? null,
    ...getRequestMetaFromTrpc(ctx),
  });
}

// ============================================================================
// CREDENTIAL SCHEMAS
// ============================================================================

// API Key credentials
const ApiKeyCredentialsSchema = z.object({
  apiKey: z.string().min(1).max(10000),
});

// OAuth credentials
const OAuthCredentialsSchema = z.object({
  accessToken: z.string().min(1).max(10000),
  refreshToken: z.string().max(10000).optional(),
  tokenExpiresAt: z.string().optional(),
});

// OIDC credentials (same structure as OAuth with optional idToken)
const OidcCredentialsSchema = z.object({
  accessToken: z.string().min(1).max(10000),
  idToken: z.string().max(10000).optional(),
  refreshToken: z.string().max(10000).optional(),
  tokenExpiresAt: z.string().optional(),
});

// Discriminated union for credential input
const SetCredentialInputSchema = z.discriminatedUnion('authType', [
  z.object({
    agentId: z.string().cuid(),
    authType: z.literal('API_KEY'),
    credentials: ApiKeyCredentialsSchema,
  }),
  z.object({
    agentId: z.string().cuid(),
    authType: z.literal('OAUTH'),
    credentials: OAuthCredentialsSchema,
  }),
  z.object({
    agentId: z.string().cuid(),
    authType: z.literal('OIDC'),
    credentials: OidcCredentialsSchema,
  }),
]);

// ============================================================================
// ROUTER
// ============================================================================

export const adminA2ARouter = router({
  // ============================================================================
  // AGENT MANAGEMENT
  // ============================================================================

  previewAgent: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      try {
        const card = await fetchAgentCard(input.url);
        return {
          success: true as const,
          card,
          suggestedName: card.name,
          endpointUrl: card.url,
          provider: card.provider?.organization,
          skills: extractSkillSummary(card.skills),
        };
      } catch (error) {
        return {
          success: false as const,
          error: getErrorMessage(error, 'Failed to fetch Agent Card'),
        };
      }
    }),

  /**
   * Register a new A2A agent
   * Requires AGENT feature (standard+ tier)
   */
  registerAgent: adminProcedure
    .input(
      z.object({
        url: z.string().url(),
        nameOverride: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let card: AgentCard;
      try {
        card = await fetchAgentCard(input.url);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: getErrorMessage(error, 'Failed to fetch Agent Card from URL'),
        });
      }

      const name = input.nameOverride ?? card.name;

      const agent = await prisma.agent.create({
        data: {
          organizationId: ctx.auth.organizationId,
          name,
          protocolType: 'A2A',
          cardSource: 'URL',
          agentCardUrl: input.url,
          ...buildCardUpdateData(card),
        },
      });

      await logAction({
        ctx,
        actionType: AdminActionType.A2A_AGENT_REGISTER,
        resourceType: AdminResourceType.AGENT,
        resourceId: agent.id,
        resourceName: name,
        actionDetails: {
          cardSource: 'URL',
          endpointUrl: card.url,
          skillCount: card.skills.length,
        },
        afterSnapshot: {
          id: agent.id,
          name: agent.name,
          protocolType: agent.protocolType,
          cardSource: agent.cardSource,
          endpointUrl: agent.endpointUrl,
        },
      });

      return {
        id: agent.id,
        name: agent.name,
        endpointUrl: agent.endpointUrl,
        cardSource: agent.cardSource,
        agentCard: card,
        createdAt: agent.createdAt,
      };
    }),

  listAgents: adminProcedure.query(async ({ ctx }) => {
    const agents = await prisma.agent.findMany({
      where: {
        organizationId: ctx.auth.organizationId,
        ...A2A_AGENT_WHERE,
      },
      select: {
        id: true,
        name: true,
        endpointUrl: true,
        cardSource: true,
        agentCardCache: true,
        agentCardFetchedAt: true,
        signatureVerified: true,
        createdAt: true,
        a2aCredential: {
          select: { authType: true, updatedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return agents.map((agent) => {
      const card = tryParseAgentCard(agent.agentCardCache);
      return {
        id: agent.id,
        name: agent.name,
        endpointUrl: agent.endpointUrl,
        cardSource: agent.cardSource,
        provider: card?.provider?.organization,
        skills: extractSkillSummary(card?.skills),
        skillCount: card?.skills?.length ?? 0,
        agentCardFetchedAt: agent.agentCardFetchedAt,
        signatureVerified: agent.signatureVerified,
        credentialConfigured: !!agent.a2aCredential,
        credentialAuthType: agent.a2aCredential?.authType ?? null,
        createdAt: agent.createdAt,
      };
    });
  }),

  getAgent: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          ...A2A_AGENT_WHERE,
        },
        include: {
          a2aCredential: {
            select: { authType: true, updatedAt: true },
          },
        },
      });

      const validAgent = requireA2AAgent(agent);
      const card = tryParseAgentCard(validAgent.agentCardCache);

      return {
        id: validAgent.id,
        name: validAgent.name,
        endpointUrl: validAgent.endpointUrl,
        cardSource: validAgent.cardSource,
        agentCardUrl: validAgent.agentCardUrl,
        agentCard: card,
        agentCardFetchedAt: validAgent.agentCardFetchedAt,
        agentCardHash: validAgent.agentCardHash,
        signatureVerified: validAgent.signatureVerified,
        signatureVerifiedAt: validAgent.signatureVerifiedAt,
        credentialConfigured: !!validAgent.a2aCredential,
        credentialAuthType: validAgent.a2aCredential?.authType ?? null,
        credentialUpdatedAt: validAgent.a2aCredential?.updatedAt ?? null,
        supportedAuthTypes: getSupportedAuthTypes(card?.securitySchemes),
        createdAt: validAgent.createdAt,
      };
    }),

  refreshAgentCard: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          ...A2A_AGENT_WHERE,
        },
      });

      const validAgent = requireA2AAgent(agent);

      if (!validAgent.agentCardUrl) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No Agent Card URL configured. Upload a new card manually.',
        });
      }

      let card: AgentCard;
      try {
        card = await fetchAgentCard(validAgent.agentCardUrl);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: getErrorMessage(error, 'Failed to fetch Agent Card'),
        });
      }

      const oldHash = validAgent.agentCardHash;
      const updateData = buildCardUpdateData(card);
      const cardChanged = oldHash !== updateData.agentCardHash;

      await prisma.agent.update({
        where: { id: input.id },
        data: updateData,
      });

      await logAction({
        ctx,
        actionType: AdminActionType.A2A_CARD_REFRESH,
        resourceType: AdminResourceType.AGENT,
        resourceId: validAgent.id,
        resourceName: validAgent.name,
        actionDetails: { cardChanged, oldHash, newHash: updateData.agentCardHash },
      });

      return { success: true, cardChanged, agentCard: card };
    }),

  updateAgentCard: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        agentCard: AgentCardSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          ...A2A_AGENT_WHERE,
        },
      });

      const validAgent = requireA2AAgent(agent);
      const oldHash = validAgent.agentCardHash;
      const updateData = buildCardUpdateData(input.agentCard);

      await prisma.agent.update({
        where: { id: input.id },
        data: updateData,
      });

      await logAction({
        ctx,
        actionType: AdminActionType.A2A_AGENT_UPDATE,
        resourceType: AdminResourceType.AGENT,
        resourceId: validAgent.id,
        resourceName: validAgent.name,
        actionDetails: { action: 'update_card', oldHash, newHash: updateData.agentCardHash },
      });

      return { success: true };
    }),

  deleteAgent: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          ...A2A_AGENT_WHERE,
        },
      });

      const validAgent = requireA2AAgent(agent);

      const beforeSnapshot = {
        id: validAgent.id,
        name: validAgent.name,
        endpointUrl: validAgent.endpointUrl,
        cardSource: validAgent.cardSource,
      };

      await prisma.agent.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.auth.user.id,
        },
      });

      await prisma.a2ACredential.deleteMany({
        where: {
          agentId: input.id,
          organizationId: ctx.auth.organizationId,
        },
      });

      await logAction({
        ctx,
        actionType: AdminActionType.A2A_AGENT_DELETE,
        resourceType: AdminResourceType.AGENT,
        resourceId: validAgent.id,
        resourceName: validAgent.name,
        actionDetails: { action: 'delete' },
        beforeSnapshot,
      });

      return { success: true };
    }),

  // ============================================================================
  // CREDENTIAL MANAGEMENT
  // ============================================================================

  setCredential: adminProcedure.input(SetCredentialInputSchema).mutation(async ({ ctx, input }) => {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input.agentId,
        organizationId: ctx.auth.organizationId,
        ...A2A_AGENT_WHERE,
      },
    });

    const validAgent = requireA2AAgent(agent);
    const card = tryParseAgentCard(validAgent.agentCardCache);

    if (card?.securitySchemes && Object.keys(card.securitySchemes).length > 0) {
      const supportedTypes = getSupportedAuthTypes(card.securitySchemes);
      if (!supportedTypes.includes(input.authType)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Agent doesn't support ${input.authType}. Supported: ${supportedTypes.join(', ')}`,
        });
      }
    }

    const encrypted = encrypt(JSON.stringify(input.credentials));

    await prisma.a2ACredential.upsert({
      where: { agentId: input.agentId },
      create: {
        organizationId: ctx.auth.organizationId,
        agentId: input.agentId,
        authType: input.authType,
        credentials: encrypted,
      },
      update: {
        authType: input.authType,
        credentials: encrypted,
      },
    });

    await logAction({
      ctx,
      actionType: AdminActionType.A2A_CREDENTIAL_SET,
      resourceType: AdminResourceType.A2A_CREDENTIAL,
      resourceId: input.agentId,
      resourceName: validAgent.name,
      actionDetails: { authType: input.authType },
    });

    return { success: true };
  }),

  getCredentialStatus: adminProcedure
    .input(z.object({ agentId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const cred = await prisma.a2ACredential.findFirst({
        where: {
          agentId: input.agentId,
          organizationId: ctx.auth.organizationId,
        },
        select: { authType: true, updatedAt: true },
      });

      if (!cred) {
        return { configured: false as const };
      }

      return { configured: true as const, authType: cred.authType, updatedAt: cred.updatedAt };
    }),

  deleteCredential: adminProcedure
    .input(z.object({ agentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.agentId,
          organizationId: ctx.auth.organizationId,
          ...A2A_AGENT_WHERE,
        },
        select: { id: true, name: true },
      });

      const validAgent = requireA2AAgent(agent);

      await prisma.a2ACredential.deleteMany({
        where: {
          agentId: input.agentId,
          organizationId: ctx.auth.organizationId,
        },
      });

      await logAction({
        ctx,
        actionType: AdminActionType.A2A_CREDENTIAL_DELETE,
        resourceType: AdminResourceType.A2A_CREDENTIAL,
        resourceId: input.agentId,
        resourceName: validAgent.name,
        actionDetails: { action: 'delete' },
      });

      return { success: true };
    }),

  // ============================================================================
  // CONNECTION TESTING
  // ============================================================================

  testConnection: adminProcedure
    .input(z.object({ agentId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await prisma.agent.findFirst({
        where: {
          id: input.agentId,
          organizationId: ctx.auth.organizationId,
          ...A2A_AGENT_WHERE,
        },
        include: { a2aCredential: true },
      });

      const validAgent = requireA2AAgent(agent);

      if (!validAgent.endpointUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Agent has no endpoint URL' });
      }

      const card = tryParseAgentCard(validAgent.agentCardCache);
      const startTime = Date.now();

      async function logConnectionTest(details: Prisma.InputJsonValue): Promise<void> {
        await logAction({
          ctx,
          actionType: AdminActionType.A2A_CONNECTION_TEST,
          resourceType: AdminResourceType.AGENT,
          resourceId: validAgent.id,
          resourceName: validAgent.name,
          actionDetails: details,
        });
      }

      try {
        let authHeaders: Record<string, string> = {};
        if (validAgent.a2aCredential) {
          const decryptedJson: unknown = JSON.parse(decrypt(validAgent.a2aCredential.credentials));
          const credentials = parseCredentials(decryptedJson) ?? {};
          const primaryScheme = card ? getPrimarySecurityScheme(card) : null;
          authHeaders = buildAuthHeaders(
            validAgent.a2aCredential.authType as 'NONE' | 'API_KEY' | 'OAUTH' | 'OIDC',
            credentials,
            primaryScheme?.scheme,
          );
        }

        const response = await fetch(validAgent.endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'agent/info',
            id: `test-${Date.now()}`,
          }),
        });

        const latencyMs = Date.now() - startTime;

        await logConnectionTest({ success: response.ok, latencyMs, statusCode: response.status });

        return {
          success: response.ok,
          latencyMs,
          statusCode: response.status,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = getErrorMessage(error, 'Connection failed');

        await logConnectionTest({ success: false, latencyMs, error: errorMessage });

        return {
          success: false,
          latencyMs,
          error: errorMessage,
        };
      }
    }),
});
