/**
 * Admin Webhooks Router
 * Handles webhook endpoint management and delivery monitoring
 * Supports multiple types: CUSTOM, DISCORD, SLACK, EMAIL
 */

import {
  AdminActionType,
  AdminResourceType,
  prisma,
  Prisma,
  WebhookEndpointType,
  WebhookEvent,
} from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { throwBadRequest, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { canAccessWorkspace } from '../../services/auth.js';
import {
  generateWebhookSecret,
  getDeliveryHistory,
  isValidDiscordWebhookUrl,
  isValidSlackWebhookUrl,
  sendTestWebhook,
} from '../../services/webhook.js';
import { adminProcedure, router } from '../init.js';

// Use string arrays with runtime validation to avoid TS2589 type inference issues
const validWebhookEvents: Set<string> = new Set(Object.values(WebhookEvent));
const validWebhookEndpointTypes: Set<string> = new Set(Object.values(WebhookEndpointType));

function isWebhookEvent(val: string): val is WebhookEvent {
  return validWebhookEvents.has(val);
}

function isWebhookEndpointType(val: string): val is WebhookEndpointType {
  return validWebhookEndpointTypes.has(val);
}

const webhookEventSchema = z.string().refine(isWebhookEvent, {
  message: 'Invalid webhook event',
});
const webhookEndpointTypeSchema = z.string().refine(isWebhookEndpointType, {
  message: 'Invalid webhook endpoint type',
});

const emailConfigSchema = z.object({
  recipients: z.array(z.string().email()).min(1),
});

const webhookConfigSchema = z.union([emailConfigSchema, z.null()]).optional();

function configToJsonValue(
  config: z.infer<typeof webhookConfigSchema>,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (config === null || config === undefined) {
    return Prisma.DbNull;
  }
  return config;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

type WebhookEndpoint = Awaited<ReturnType<typeof prisma.webhookEndpoint.findFirst>>;

async function findEndpointOrThrow(
  endpointId: string,
  organizationId: string,
  userWorkspaceIds?: string[],
): Promise<NonNullable<WebhookEndpoint>> {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: endpointId,
      organizationId,
      ...(userWorkspaceIds && {
        OR: [{ workspaceId: null }, { workspaceId: { in: userWorkspaceIds } }],
      }),
    },
  });
  if (!endpoint) {
    throwNotFound('Webhook endpoint not found');
  }
  return endpoint;
}

function redactSecret<T extends { secret?: string | null }>(
  endpoint: T,
): Omit<T, 'secret'> & { secret: string | null } {
  return { ...endpoint, secret: endpoint.secret ? '[REDACTED]' : null };
}

function validateUrlForType(url: string, type: WebhookEndpointType): void {
  switch (type) {
    case WebhookEndpointType.DISCORD:
      if (!isValidDiscordWebhookUrl(url)) {
        throwBadRequest(
          'Invalid Discord webhook URL. Must be https://discord.com/api/webhooks/... or https://discordapp.com/api/webhooks/...',
        );
      }
      break;
    case WebhookEndpointType.SLACK:
      if (!isValidSlackWebhookUrl(url)) {
        throwBadRequest('Invalid Slack webhook URL. Must be https://hooks.slack.com/services/...');
      }
      break;
  }
}

async function checkDuplicateUrl(
  organizationId: string,
  url: string,
  workspaceId: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  const where: Prisma.WebhookEndpointWhereInput = {
    organizationId,
    url,
    // Check within same scope (org-wide or same workspace)
    workspaceId: workspaceId ?? null,
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const existing = await prisma.webhookEndpoint.findFirst({ where });
  if (existing) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A webhook endpoint with URL "${url}" already exists in this scope`,
    });
  }
}

export const adminWebhooksRouter = router({
  // =========================================================================
  // ENDPOINT MANAGEMENT
  // =========================================================================

  /**
   * List all webhook endpoints
   */
  list: adminProcedure
    .input(
      z
        .object({
          includeDisabled: z.boolean().optional(),
          workspaceId: z.string().cuid().optional().nullable(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Build workspace filter
      const workspaceFilter = input?.workspaceId
        ? { workspaceId: input.workspaceId }
        : {
            OR: [
              { workspaceId: null }, // Org-wide webhooks
              { workspaceId: { in: ctx.auth.workspaceIds } }, // User's workspace webhooks
            ],
          };

      const endpoints = await prisma.webhookEndpoint.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDisabled ? {} : { enabled: true }),
          ...workspaceFilter,
        },
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
          events: true,
          enabled: true,
          verbose: true,
          config: true,
          maxRetries: true,
          retryDelayMs: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          workspaceId: true,
          _count: {
            select: { deliveries: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Transform config to avoid deep type inference issues with Prisma JSON type
      return endpoints.map((e) => ({
        ...e,
        config: e.config as { recipients?: string[] } | null,
      }));
    }),

  /**
   * Get a specific endpoint with recent deliveries
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
        OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
      },
      select: {
        id: true,
        name: true,
        type: true,
        url: true,
        events: true,
        enabled: true,
        verbose: true,
        config: true,
        maxRetries: true,
        retryDelayMs: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        workspaceId: true,
      },
    });

    if (!endpoint) {
      throwNotFound('Webhook endpoint not found');
    }

    const { total, deliveries } = await getDeliveryHistory(ctx.auth.organizationId, endpoint.id, {
      limit: 10,
    });

    return {
      ...endpoint,
      recentDeliveries: deliveries,
      totalDeliveries: total,
    };
  }),

  /**
   * Get endpoint secret (separate endpoint for security, only for CUSTOM type)
   */
  getSecret: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const endpoint = await findEndpointOrThrow(
        input.id,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );

      if (endpoint.type !== WebhookEndpointType.CUSTOM) {
        throwBadRequest('Only custom webhooks have secrets');
      }

      return { secret: endpoint.secret };
    }),

  /**
   * Create a new webhook endpoint
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: webhookEndpointTypeSchema.default(WebhookEndpointType.CUSTOM),
        url: z.string().url().optional(), // Required for CUSTOM, DISCORD, SLACK
        events: z.array(webhookEventSchema).min(1),
        config: webhookConfigSchema,
        verbose: z.boolean().optional(), // Include detailed context in payloads
        maxRetries: z.number().min(0).max(10).optional(),
        retryDelayMs: z.number().min(1000).max(60000).optional(),
        workspaceId: z.string().cuid().optional().nullable(), // null = org-wide
      }),
    )
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        url: z.string().nullable(),
        events: z.array(z.string()),
        enabled: z.boolean(),
        verbose: z.boolean(),
        secret: z.string().nullable().optional(),
        createdAt: z.date(),
        updatedAt: z.date(),
        config: z.unknown().nullable(),
        maxRetries: z.number(),
        retryDelayMs: z.number(),
        organizationId: z.string(),
        createdBy: z.string().nullable(),
        workspaceId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate workspace access if workspaceId is provided
      if (input.workspaceId && !canAccessWorkspace(ctx.auth, input.workspaceId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      const type = input.type ?? WebhookEndpointType.CUSTOM;

      // Validate type-specific requirements
      if (type === WebhookEndpointType.EMAIL) {
        if (!input.config || !('recipients' in input.config)) {
          throwBadRequest('Email recipients are required for email webhooks');
        }
      } else {
        if (!input.url) {
          throwBadRequest(`URL is required for ${type.toLowerCase()} webhooks`);
        }
        validateUrlForType(input.url, type);
        await checkDuplicateUrl(ctx.auth.organizationId, input.url, input.workspaceId);
      }

      const secret = type === WebhookEndpointType.CUSTOM ? generateWebhookSecret() : null;

      const endpoint = await prisma.webhookEndpoint.create({
        data: {
          organizationId: ctx.auth.organizationId,
          workspaceId: input.workspaceId ?? null,
          name: input.name,
          type,
          url: input.url ?? null,
          events: input.events,
          secret,
          verbose: input.verbose ?? false,
          config: configToJsonValue(input.config),
          maxRetries: input.maxRetries ?? 3,
          retryDelayMs: input.retryDelayMs ?? 1000,
          createdBy: ctx.auth.user.id,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WEBHOOK_ENDPOINT_CREATE,
        resourceType: AdminResourceType.WEBHOOK_ENDPOINT,
        resourceId: endpoint.id,
        resourceName: endpoint.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_CREATE),
          name: endpoint.name,
          type: endpoint.type,
          url: endpoint.url,
          events: endpoint.events,
        },
        afterSnapshot: redactSecret(endpoint),
        ...getRequestMetaFromTrpc(ctx),
      });

      return {
        ...endpoint,
        secret: type === WebhookEndpointType.CUSTOM ? secret : undefined,
      };
    }),

  /**
   * Update a webhook endpoint
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1).max(100).optional(),
        url: z.string().url().optional(),
        events: z.array(webhookEventSchema).min(1).optional(),
        enabled: z.boolean().optional(),
        verbose: z.boolean().optional(),
        config: webhookConfigSchema,
        maxRetries: z.number().min(0).max(10).optional(),
        retryDelayMs: z.number().min(1000).max(60000).optional(),
        workspaceId: z.string().cuid().optional().nullable(), // Change workspace scope
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await findEndpointOrThrow(
        input.id,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );

      // Validate workspace access if changing workspaceId
      if (input.workspaceId !== undefined && input.workspaceId !== null) {
        if (!canAccessWorkspace(ctx.auth, input.workspaceId)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this workspace',
          });
        }
      }

      if (input.url && input.url !== existing.url) {
        validateUrlForType(input.url, existing.type);
        const targetWorkspaceId =
          input.workspaceId !== undefined ? input.workspaceId : existing.workspaceId;
        await checkDuplicateUrl(ctx.auth.organizationId, input.url, targetWorkspaceId, input.id);
      }

      const beforeSnapshot = redactSecret(existing);

      const endpoint = await prisma.webhookEndpoint.update({
        where: { id: input.id },
        data: {
          name: input.name,
          url: input.url,
          events: input.events,
          enabled: input.enabled,
          verbose: input.verbose,
          config: input.config !== undefined ? configToJsonValue(input.config) : undefined,
          maxRetries: input.maxRetries,
          retryDelayMs: input.retryDelayMs,
          workspaceId: input.workspaceId !== undefined ? input.workspaceId : undefined,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WEBHOOK_ENDPOINT_UPDATE,
        resourceType: AdminResourceType.WEBHOOK_ENDPOINT,
        resourceId: endpoint.id,
        resourceName: endpoint.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_UPDATE),
          changes: {
            ...input,
            config: input.config ? '[UPDATED]' : undefined,
          },
        },
        beforeSnapshot,
        afterSnapshot: redactSecret(endpoint),
        ...getRequestMetaFromTrpc(ctx),
      });

      return {
        ...endpoint,
        secret: undefined,
      };
    }),

  /**
   * Rotate webhook secret (only for CUSTOM type)
   */
  rotateSecret: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await findEndpointOrThrow(
        input.id,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );

      if (existing.type !== WebhookEndpointType.CUSTOM) {
        throwBadRequest('Only custom webhooks have secrets that can be rotated');
      }

      const newSecret = generateWebhookSecret();

      await prisma.webhookEndpoint.update({
        where: { id: input.id },
        data: { secret: newSecret },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WEBHOOK_ENDPOINT_UPDATE,
        resourceType: AdminResourceType.WEBHOOK_ENDPOINT,
        resourceId: existing.id,
        resourceName: existing.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_UPDATE),
          action: 'secret_rotated',
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { secret: newSecret };
    }),

  /**
   * Delete a webhook endpoint
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const endpoint = await findEndpointOrThrow(
        input.id,
        ctx.auth.organizationId,
        ctx.auth.workspaceIds,
      );
      const beforeSnapshot = redactSecret(endpoint);

      await prisma.webhookEndpoint.delete({
        where: { id: input.id },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WEBHOOK_ENDPOINT_DELETE,
        resourceType: AdminResourceType.WEBHOOK_ENDPOINT,
        resourceId: endpoint.id,
        resourceName: endpoint.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_DELETE),
          name: endpoint.name,
          url: endpoint.url,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Test a webhook endpoint
   */
  test: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await findEndpointOrThrow(input.id, ctx.auth.organizationId, ctx.auth.workspaceIds);
      return sendTestWebhook(ctx.auth.organizationId, input.id);
    }),

  // =========================================================================
  // DELIVERY HISTORY
  // =========================================================================

  /**
   * List deliveries for an endpoint
   */
  listDeliveries: adminProcedure
    .input(
      z.object({
        endpointId: z.string().cuid(),
        event: webhookEventSchema.optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await findEndpointOrThrow(input.endpointId, ctx.auth.organizationId, ctx.auth.workspaceIds);
      return getDeliveryHistory(ctx.auth.organizationId, input.endpointId, {
        event: input.event,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get a specific delivery
   * Uses query-time org and workspace scoping for proper multi-tenant isolation
   */
  getDelivery: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const delivery = await prisma.webhookDelivery.findFirst({
        where: {
          id: input.id,
          endpoint: {
            organizationId: ctx.auth.organizationId,
            OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
          },
        },
        include: {
          endpoint: {
            select: { id: true, name: true, url: true, organizationId: true, workspaceId: true },
          },
        },
      });

      if (!delivery) {
        throwNotFound('Webhook delivery not found');
      }

      return delivery;
    }),

  /**
   * Retry a failed delivery
   * Uses query-time org and workspace scoping for proper multi-tenant isolation
   */
  retryDelivery: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const delivery = await prisma.webhookDelivery.findFirst({
        where: {
          id: input.id,
          endpoint: {
            organizationId: ctx.auth.organizationId,
            OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
          },
        },
        include: { endpoint: true },
      });

      if (!delivery) {
        throwNotFound('Webhook delivery not found');
      }

      if (delivery.deliveredAt) {
        throwBadRequest('Cannot retry a successfully delivered webhook');
      }

      await prisma.webhookDelivery.update({
        where: { id: input.id },
        data: {
          nextRetryAt: new Date(),
          failedAt: null,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.WEBHOOK_ENDPOINT_UPDATE,
        resourceType: AdminResourceType.WEBHOOK_ENDPOINT,
        resourceId: delivery.endpoint.id,
        resourceName: delivery.endpoint.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_UPDATE),
          action: 'retry_delivery',
          deliveryId: delivery.id,
          event: delivery.event,
          previousRetryCount: delivery.retryCount,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),
});
