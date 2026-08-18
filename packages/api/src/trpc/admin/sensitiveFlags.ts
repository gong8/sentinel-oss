/**
 * Admin Sensitive Flags Router
 * Handles sensitive tool flag management and approval operations
 */

import {
  AdminActionType,
  AdminResourceType,
  ApprovalRequestStatus,
  ApprovalType,
  prisma,
  Prisma,
  SensitiveFlagBehavior,
} from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName, getToolFriendlyNames } from '../../lib/adminActionLabels.js';
import { toJsonValue } from '../../lib/jsonValue.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { canAccessWorkspace } from '../../services/auth.js';
import { validateToolPattern } from '../../services/policy.js';
import {
  alertConfigSchema,
  approvalConfigSchema,
  getPendingApprovals,
  processApprovalDecision,
  rateLimitConfigSchema,
} from '../../services/sensitiveFlag.js';
import { adminProcedure, router } from '../init.js';

const behaviorEnum = z.nativeEnum(SensitiveFlagBehavior);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Fetches servers and returns friendly names for a tool pattern
 */
async function getFriendlyNames(
  organizationId: string,
  toolPattern: string,
): Promise<{ serverFriendlyName: string | null; toolFriendlyName: string | null }> {
  const servers = await prisma.mcpServer.findMany({
    where: { organizationId, deletedAt: null },
    select: { name: true, url: true },
  });
  return getToolFriendlyNames(toolPattern, servers);
}

/**
 * Finds a sensitive flag or throws NOT_FOUND
 */
async function requireFlag(id: string, organizationId: string) {
  const flag = await prisma.sensitiveToolFlag.findFirst({
    where: { id, organizationId },
  });

  if (!flag) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Sensitive flag not found',
    });
  }

  return flag;
}

/**
 * Finds an override with org verification or throws NOT_FOUND
 */
async function requireOverrideWithOrg(id: string, organizationId: string) {
  const override = await prisma.sensitiveFlagAgentOverride.findFirst({
    where: { id },
    include: {
      sensitiveToolFlag: true,
      agent: true,
    },
  });

  if (!override || override.sensitiveToolFlag.organizationId !== organizationId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Override not found',
    });
  }

  return override;
}

type BehaviorArray = SensitiveFlagBehavior[];

interface BehaviorConfigs {
  rateLimitConfig?: unknown;
  approvalConfig?: unknown;
  alertConfig?: unknown;
}

/**
 * Validates that required configs exist for the given behaviors
 * For update operations, pass existing configs to check against
 */
function validateBehaviorConfigs(
  behaviors: BehaviorArray,
  input: BehaviorConfigs,
  existing?: BehaviorConfigs,
): void {
  const checks: Array<{
    behavior: SensitiveFlagBehavior;
    configKey: keyof BehaviorConfigs;
    message: string;
  }> = [
    {
      behavior: 'RATE_LIMIT',
      configKey: 'rateLimitConfig',
      message: 'Rate limit config is required when RATE_LIMIT behavior is enabled',
    },
    {
      behavior: 'REQUIRE_APPROVAL',
      configKey: 'approvalConfig',
      message: 'Approval config is required when REQUIRE_APPROVAL behavior is enabled',
    },
    {
      behavior: 'ALERT',
      configKey: 'alertConfig',
      message: 'Alert config is required when ALERT behavior is enabled',
    },
  ];

  for (const { behavior, configKey, message } of checks) {
    if (!behaviors.includes(behavior)) continue;

    // For updates: config is valid if input provides it (and isn't null) OR existing has it
    const inputConfig = input[configKey];
    const existingConfig = existing?.[configKey];
    const hasConfig = existing
      ? inputConfig !== null && (inputConfig ?? existingConfig)
      : inputConfig;

    if (!hasConfig) {
      throw new TRPCError({ code: 'BAD_REQUEST', message });
    }
  }
}

/**
 * Converts nullable/optional JSON value to Prisma-compatible value
 */
function toDbJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === null) return Prisma.DbNull;
  if (value === undefined) return undefined;
  return toJsonValue(value);
}

// =============================================================================
// ROUTER
// =============================================================================

export const adminSensitiveFlagsRouter = router({
  // =========================================================================
  // FLAG MANAGEMENT
  // =========================================================================

  /**
   * List all sensitive flags
   * Org owners see all, others see org-wide + their workspace flags
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
      const { isOrgOwner, isAdmin, workspaceIds } = ctx.auth;
      const hasFullAccess = isOrgOwner || isAdmin;

      // Build workspace filter
      // If specific workspaceId is requested, filter to that workspace only
      // Otherwise, org owners/admins see all, non-admins see org-wide + their workspace flags
      let workspaceFilter: Prisma.SensitiveToolFlagWhereInput = {};
      if (input?.workspaceId) {
        // Explicit workspace filter - validate access
        if (!hasFullAccess && !workspaceIds.includes(input.workspaceId)) {
          return []; // User doesn't have access to this workspace
        }
        workspaceFilter = { workspaceId: input.workspaceId };
      } else if (!hasFullAccess) {
        // Non-admins see org-wide + their workspace flags
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
        };
      }
      // Org owners/admins see all (no workspace filter)

      return prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDisabled ? {} : { enabled: true }),
          ...workspaceFilter,
        },
        include: {
          creator: { select: { email: true } },
          _count: { select: { agentOverrides: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  /**
   * Get a specific flag with its overrides
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const { isOrgOwner, isAdmin, workspaceIds } = ctx.auth;
    const hasFullAccess = isOrgOwner || isAdmin;

    // Build workspace filter
    let workspaceFilter: Prisma.SensitiveToolFlagWhereInput = {};
    if (!hasFullAccess) {
      workspaceFilter = {
        OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
      };
    }

    const flag = await prisma.sensitiveToolFlag.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
        ...workspaceFilter,
      },
      include: {
        creator: { select: { email: true } },
        agentOverrides: {
          include: { agent: { select: { id: true, name: true } } },
        },
      },
    });

    if (!flag) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Sensitive flag not found' });
    }

    return flag;
  }),

  /**
   * Create a new sensitive flag
   */
  create: adminProcedure
    .input(
      z.object({
        toolPattern: z.string().refine(validateToolPattern, {
          message: 'Invalid tool pattern format',
        }),
        behaviors: z.array(behaviorEnum).min(1),
        rateLimitConfig: rateLimitConfigSchema.optional(),
        approvalConfig: approvalConfigSchema.optional(),
        alertConfig: alertConfigSchema.optional(),
        description: z.string().optional(),
        workspaceId: z.string().cuid().optional(),
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

      // Check for duplicate pattern at the same scope (org-wide or specific workspace)
      const existing = await prisma.sensitiveToolFlag.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          toolPattern: input.toolPattern,
          workspaceId: input.workspaceId ?? null,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A flag with pattern "${input.toolPattern}" already exists${input.workspaceId ? ' in this workspace' : ' at org level'}`,
        });
      }

      validateBehaviorConfigs(input.behaviors, input);

      const flag = await prisma.sensitiveToolFlag.create({
        data: {
          organizationId: ctx.auth.organizationId,
          toolPattern: input.toolPattern,
          behaviors: input.behaviors,
          rateLimitConfig: input.rateLimitConfig || undefined,
          approvalConfig: input.approvalConfig || undefined,
          alertConfig: input.alertConfig || undefined,
          description: input.description,
          createdBy: ctx.auth.user.id,
          workspaceId: input.workspaceId,
        },
      });

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        flag.toolPattern,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_FLAG_CREATE,
        resourceType: AdminResourceType.SENSITIVE_FLAG,
        resourceId: flag.id,
        resourceName: flag.toolPattern,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_FLAG_CREATE),
          toolPattern: flag.toolPattern,
          serverFriendlyName,
          toolFriendlyName,
          behaviors: flag.behaviors,
        },
        afterSnapshot: flag,
        ...getRequestMetaFromTrpc(ctx),
      });

      return flag;
    }),

  /**
   * Update a sensitive flag
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        behaviors: z.array(behaviorEnum).min(1).optional(),
        rateLimitConfig: rateLimitConfigSchema.nullable().optional(),
        approvalConfig: approvalConfigSchema.nullable().optional(),
        alertConfig: alertConfigSchema.nullable().optional(),
        description: z.string().optional(),
        enabled: z.boolean().optional(),
        workspaceId: z.string().cuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await requireFlag(input.id, ctx.auth.organizationId);
      const beforeSnapshot = { ...existing };
      const behaviors = input.behaviors ?? existing.behaviors;

      // Validate workspace access if changing workspaceId
      if (input.workspaceId !== undefined && input.workspaceId !== null) {
        if (!canAccessWorkspace(ctx.auth, input.workspaceId)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this workspace',
          });
        }
      }

      // Validate workspace access for existing flag's workspace
      if (existing.workspaceId && !canAccessWorkspace(ctx.auth, existing.workspaceId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      validateBehaviorConfigs(behaviors, input, existing);

      const flag = await prisma.sensitiveToolFlag.update({
        where: { id: input.id },
        data: {
          behaviors: input.behaviors,
          rateLimitConfig: toDbJson(input.rateLimitConfig),
          approvalConfig: toDbJson(input.approvalConfig),
          alertConfig: toDbJson(input.alertConfig),
          description: input.description,
          enabled: input.enabled,
          workspaceId: input.workspaceId,
        },
      });

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        flag.toolPattern,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_FLAG_UPDATE,
        resourceType: AdminResourceType.SENSITIVE_FLAG,
        resourceId: flag.id,
        resourceName: flag.toolPattern,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_FLAG_UPDATE),
          toolPattern: flag.toolPattern,
          serverFriendlyName,
          toolFriendlyName,
          changes: input,
        },
        beforeSnapshot,
        afterSnapshot: flag,
        ...getRequestMetaFromTrpc(ctx),
      });

      return flag;
    }),

  /**
   * Delete a sensitive flag
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const flag = await requireFlag(input.id, ctx.auth.organizationId);
      const beforeSnapshot = { ...flag };

      // Validate workspace access for workspace-scoped flags
      if (flag.workspaceId && !canAccessWorkspace(ctx.auth, flag.workspaceId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      await prisma.sensitiveToolFlag.delete({ where: { id: input.id } });

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        flag.toolPattern,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_FLAG_DELETE,
        resourceType: AdminResourceType.SENSITIVE_FLAG,
        resourceId: flag.id,
        resourceName: flag.toolPattern,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_FLAG_DELETE),
          toolPattern: flag.toolPattern,
          serverFriendlyName,
          toolFriendlyName,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  // =========================================================================
  // AGENT OVERRIDES
  // =========================================================================

  /**
   * List overrides for a flag
   */
  listOverrides: adminProcedure
    .input(z.object({ flagId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireFlag(input.flagId, ctx.auth.organizationId);

      return prisma.sensitiveFlagAgentOverride.findMany({
        where: { sensitiveToolFlagId: input.flagId },
        include: { agent: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }),

  /**
   * Create an agent override
   */
  createOverride: adminProcedure
    .input(
      z.object({
        flagId: z.string(),
        agentId: z.string(),
        behaviors: z.array(behaviorEnum).optional(),
        rateLimitConfig: rateLimitConfigSchema.optional(),
        approvalConfig: approvalConfigSchema.optional(),
        exempted: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const flag = await requireFlag(input.flagId, ctx.auth.organizationId);

      const agent = await prisma.agent.findFirst({
        where: {
          id: input.agentId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!agent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
      }

      const existingOverride = await prisma.sensitiveFlagAgentOverride.findFirst({
        where: { sensitiveToolFlagId: input.flagId, agentId: input.agentId },
      });

      if (existingOverride) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An override for this agent already exists',
        });
      }

      const override = await prisma.sensitiveFlagAgentOverride.create({
        data: {
          sensitiveToolFlagId: input.flagId,
          agentId: input.agentId,
          behaviors: input.behaviors || [],
          rateLimitConfig: input.rateLimitConfig || undefined,
          approvalConfig: input.approvalConfig || undefined,
          exempted: input.exempted ?? false,
        },
        include: { agent: { select: { id: true, name: true } } },
      });

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        flag.toolPattern,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_OVERRIDE_CREATE,
        resourceType: AdminResourceType.SENSITIVE_OVERRIDE,
        resourceId: override.id,
        resourceName: `${flag.toolPattern}:${agent.name}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_OVERRIDE_CREATE),
          flagId: flag.id,
          toolPattern: flag.toolPattern,
          serverFriendlyName,
          toolFriendlyName,
          agentId: agent.id,
          agentName: agent.name,
          exempted: override.exempted,
        },
        afterSnapshot: override,
        ...getRequestMetaFromTrpc(ctx),
      });

      return override;
    }),

  /**
   * Update an agent override
   */
  updateOverride: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        behaviors: z.array(behaviorEnum).optional(),
        rateLimitConfig: rateLimitConfigSchema.nullable().optional(),
        approvalConfig: approvalConfigSchema.nullable().optional(),
        exempted: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await requireOverrideWithOrg(input.id, ctx.auth.organizationId);
      const beforeSnapshot = { ...existing };

      const override = await prisma.sensitiveFlagAgentOverride.update({
        where: { id: input.id },
        data: {
          behaviors: input.behaviors,
          rateLimitConfig: toDbJson(input.rateLimitConfig),
          approvalConfig: toDbJson(input.approvalConfig),
          exempted: input.exempted,
        },
        include: { agent: { select: { id: true, name: true } } },
      });

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        existing.sensitiveToolFlag.toolPattern,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_OVERRIDE_UPDATE,
        resourceType: AdminResourceType.SENSITIVE_OVERRIDE,
        resourceId: override.id,
        resourceName: `${existing.sensitiveToolFlag.toolPattern}:${existing.agent.name}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_OVERRIDE_UPDATE),
          toolPattern: existing.sensitiveToolFlag.toolPattern,
          serverFriendlyName,
          toolFriendlyName,
          agentName: existing.agent.name,
          changes: input,
        },
        beforeSnapshot,
        afterSnapshot: override,
        ...getRequestMetaFromTrpc(ctx),
      });

      return override;
    }),

  /**
   * Delete an agent override
   */
  deleteOverride: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await requireOverrideWithOrg(input.id, ctx.auth.organizationId);
      const beforeSnapshot = { ...existing };

      await prisma.sensitiveFlagAgentOverride.delete({ where: { id: input.id } });

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        existing.sensitiveToolFlag.toolPattern,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_OVERRIDE_DELETE,
        resourceType: AdminResourceType.SENSITIVE_OVERRIDE,
        resourceId: existing.id,
        resourceName: `${existing.sensitiveToolFlag.toolPattern}:${existing.agent.name}`,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_OVERRIDE_DELETE),
          toolPattern: existing.sensitiveToolFlag.toolPattern,
          serverFriendlyName,
          toolFriendlyName,
          agentName: existing.agent.name,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  // =========================================================================
  // APPROVAL MANAGEMENT
  // =========================================================================

  /**
   * List approval requests
   */
  listApprovals: adminProcedure
    .input(
      z
        .object({
          status: z.nativeEnum(ApprovalRequestStatus).optional(),
          type: z.nativeEnum(ApprovalType).optional(),
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return getPendingApprovals(ctx.auth.organizationId, {
        status: input?.status,
        type: input?.type,
        limit: input?.limit,
        offset: input?.offset,
      });
    }),

  /**
   * Get a specific approval request
   */
  getApproval: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
        },
        include: {
          user: { select: { email: true } },
          agent: { select: { name: true } },
          approver: { select: { email: true } },
        },
      });

      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Approval request not found' });
      }

      return request;
    }),

  /**
   * Approve a request
   */
  approveRequest: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          status: 'PENDING',
        },
      });

      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pending approval request not found' });
      }

      await processApprovalDecision(
        ctx.auth.organizationId,
        input.id,
        'APPROVED',
        ctx.auth.user.id,
        input.reason,
      );

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        request.toolName,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_APPROVAL_GRANTED,
        resourceType: AdminResourceType.SENSITIVE_APPROVAL,
        resourceId: request.id,
        resourceName: request.toolName,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_APPROVAL_GRANTED),
          toolName: request.toolName,
          serverFriendlyName,
          toolFriendlyName,
          userId: request.userId,
          agentId: request.agentId,
          reason: input.reason,
          approvalType: request.type,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Deny a request
   */
  denyRequest: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          status: 'PENDING',
        },
      });

      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pending approval request not found' });
      }

      await processApprovalDecision(
        ctx.auth.organizationId,
        input.id,
        'DENIED',
        ctx.auth.user.id,
        input.reason,
      );

      const { serverFriendlyName, toolFriendlyName } = await getFriendlyNames(
        ctx.auth.organizationId,
        request.toolName,
      );

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.SENSITIVE_APPROVAL_DENIED,
        resourceType: AdminResourceType.SENSITIVE_APPROVAL,
        resourceId: request.id,
        resourceName: request.toolName,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.SENSITIVE_APPROVAL_DENIED),
          toolName: request.toolName,
          serverFriendlyName,
          toolFriendlyName,
          userId: request.userId,
          agentId: request.agentId,
          reason: input.reason,
          approvalType: request.type,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),
});
