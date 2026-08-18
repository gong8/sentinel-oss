/**
 * Admin Policy Assertions Router
 * Handles policy assertion management and execution
 */

import {
  AdminActionType,
  AdminResourceType,
  AssertionContextType,
  AssertionSource,
  PolicyEffect,
  prisma,
  Prisma,
  PrismaClient,
} from '@sentinel/db';
import { z } from 'zod';
import { getActionDisplayName, getToolFriendlyNames } from '../../lib/adminActionLabels.js';
import { toJsonValue } from '../../lib/jsonValue.js';
import { throwBadRequest, throwConflict, throwNotFound } from '../../lib/trpcErrors.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { validateToolPattern, validateToolPatterns } from '../../services/policy.js';
import {
  getAssertionSummary,
  previewAssertionImpact,
  runAllAssertions,
  runAssertion,
} from '../../services/policyAssertion.js';
import {
  contextOverridesSchema,
  extractedContextSchema,
  extractedModeSchema,
  parameterModeSchema,
} from '../../types/toolInvocation.js';
import { adminProcedure, router } from '../init.js';

type PolicyAssertion = Awaited<ReturnType<PrismaClient['policyAssertion']['findFirst']>>;

async function checkDuplicateName(
  organizationId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.policyAssertion.findFirst({
    where: {
      organizationId,
      name,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
  });

  if (existing) {
    throwConflict('An assertion with this name already exists');
  }
}

function determineContextType(
  agentId: string | null | undefined,
  userId: string | null | undefined,
): AssertionContextType {
  if (agentId) return AssertionContextType.AGENT;
  if (userId) return AssertionContextType.USER;
  return AssertionContextType.WILDCARD;
}

interface LogAssertionActionParams {
  adminUserId: string;
  organizationId: string;
  actionType: AdminActionType;
  assertion: NonNullable<PolicyAssertion>;
  extraDetails?: Record<string, unknown>;
}

async function logAssertionAction({
  adminUserId,
  organizationId,
  actionType,
  assertion,
  extraDetails = {},
}: LogAssertionActionParams): Promise<void> {
  const servers = await prisma.mcpServer.findMany({
    where: { organizationId, deletedAt: null },
    select: { name: true, url: true },
  });
  const { serverFriendlyName, toolFriendlyName } = getToolFriendlyNames(
    assertion.toolPattern,
    servers,
  );

  await logAdminAction({
    adminUserId,
    organizationId,
    actionType,
    resourceType: AdminResourceType.POLICY,
    resourceId: assertion.id,
    resourceName: assertion.name,
    actionDetails: {
      type: 'policyAssertion',
      actionDisplayName: getActionDisplayName(actionType),
      toolPattern: assertion.toolPattern,
      serverFriendlyName,
      toolFriendlyName,
      contextType: assertion.contextType,
      expectedDecision: assertion.expectedDecision,
      ...extraDetails,
    },
  });
}

async function requireAssertion(
  id: string,
  organizationId: string,
): Promise<NonNullable<PolicyAssertion>> {
  const assertion = await prisma.policyAssertion.findFirst({
    where: { id, organizationId },
  });

  if (!assertion) {
    throwNotFound('Policy assertion not found');
  }

  return assertion;
}

export const adminPolicyAssertionsRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          enabled: z.boolean().optional(),
          passed: z.boolean().optional(),
          source: z.nativeEnum(AssertionSource).optional(),
          contextType: z.nativeEnum(AssertionContextType).optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        organizationId: ctx.auth.organizationId,
        ...(input?.enabled !== undefined && { enabled: input.enabled }),
        ...(input?.passed !== undefined && { lastRunPassed: input.passed }),
        ...(input?.source && { source: input.source }),
        ...(input?.contextType && { contextType: input.contextType }),
      };

      const [assertions, total] = await Promise.all([
        prisma.policyAssertion.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: input?.limit ?? 50,
          skip: input?.offset ?? 0,
        }),
        prisma.policyAssertion.count({ where }),
      ]);

      return { assertions, total };
    }),

  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    return requireAssertion(input.id, ctx.auth.organizationId);
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        toolPattern: z.string(),
        contextType: z.nativeEnum(AssertionContextType),
        userId: z.string().optional(),
        agentId: z.string().optional(),
        roleName: z.string().optional(),
        expectedDecision: z.enum(['ALLOWED', 'DENIED']),
        enabled: z.boolean().default(true),
        // Tool invocation details
        toolParameters: z.record(z.string(), z.unknown()).optional(),
        contextOverrides: contextOverridesSchema,
        extractedContext: extractedContextSchema,
        extractedMode: extractedModeSchema,
        parameterMode: parameterModeSchema.default('exact'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!validateToolPattern(input.toolPattern)) {
        throwBadRequest('Invalid tool pattern format');
      }

      const contextRequirements: Record<string, { field: string | undefined; label: string }> = {
        USER: { field: input.userId, label: 'userId' },
        AGENT: { field: input.agentId, label: 'agentId' },
        ROLE: { field: input.roleName, label: 'roleName' },
      };

      const requirement = contextRequirements[input.contextType];
      if (requirement && !requirement.field) {
        throwBadRequest(`${input.contextType} context requires ${requirement.label}`);
      }

      await checkDuplicateName(ctx.auth.organizationId, input.name);

      const assertion = await prisma.policyAssertion.create({
        data: {
          organizationId: ctx.auth.organizationId,
          createdById: ctx.auth.user.id,
          name: input.name,
          description: input.description,
          toolPattern: input.toolPattern,
          contextType: input.contextType,
          userId: input.userId,
          agentId: input.agentId,
          roleName: input.roleName,
          expectedDecision: input.expectedDecision,
          source: AssertionSource.MANUAL,
          enabled: input.enabled,
          // Store tool invocation details
          toolParameters: input.toolParameters ? toJsonValue(input.toolParameters) : Prisma.DbNull,
          contextOverrides: input.contextOverrides
            ? toJsonValue(input.contextOverrides)
            : Prisma.DbNull,
          extractedContext: input.extractedContext
            ? toJsonValue(input.extractedContext)
            : Prisma.DbNull,
          extractedMode: input.extractedMode,
          parameterMode: input.parameterMode,
        },
      });

      await logAssertionAction({
        adminUserId: ctx.auth.user.id,
        organizationId: ctx.auth.organizationId,
        actionType: AdminActionType.POLICY_CREATE,
        assertion,
        extraDetails: { name: assertion.name },
      });

      return assertion;
    }),

  createFromPlaygroundTest: adminProcedure
    .input(
      z.object({
        playgroundTestId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        expectedDecision: z.enum(['ALLOWED', 'DENIED']),
        // Allow overriding the parameter mode (defaults to 'exact')
        parameterMode: parameterModeSchema.default('exact'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const test = await prisma.policyTest.findFirst({
        where: { id: input.playgroundTestId, organizationId: ctx.auth.organizationId },
      });

      if (!test) {
        throwNotFound('Playground test not found');
      }

      await checkDuplicateName(ctx.auth.organizationId, input.name);

      const assertion = await prisma.policyAssertion.create({
        data: {
          organizationId: ctx.auth.organizationId,
          createdById: ctx.auth.user.id,
          name: input.name,
          description: input.description ?? `Created from playground test on ${test.toolName}`,
          toolPattern: test.toolName,
          contextType: determineContextType(test.agentId, test.userId),
          userId: test.userId,
          agentId: test.agentId,
          expectedDecision: input.expectedDecision,
          source: AssertionSource.PLAYGROUND,
          sourceId: test.id,
          enabled: true,
          // Copy invocation details from playground test
          toolParameters: test.toolParameters ?? Prisma.DbNull,
          contextOverrides: test.contextOverrides ?? Prisma.DbNull,
          extractedContext: test.extractedContext ?? Prisma.DbNull,
          extractedMode: test.extractedMode,
          parameterMode: input.parameterMode,
        },
      });

      await logAssertionAction({
        adminUserId: ctx.auth.user.id,
        organizationId: ctx.auth.organizationId,
        actionType: AdminActionType.POLICY_CREATE,
        assertion,
        extraDetails: { source: 'playground', sourceId: test.id },
      });

      return assertion;
    }),

  createFromAuditLog: adminProcedure
    .input(
      z.object({
        auditLogEntryId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        expectedDecision: z.enum(['ALLOWED', 'DENIED']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await prisma.auditLogEntry.findFirst({
        where: { id: input.auditLogEntryId, organizationId: ctx.auth.organizationId },
      });

      if (!entry) {
        throwNotFound('Audit log entry not found');
      }

      await checkDuplicateName(ctx.auth.organizationId, input.name);

      const assertion = await prisma.policyAssertion.create({
        data: {
          organizationId: ctx.auth.organizationId,
          createdById: ctx.auth.user.id,
          name: input.name,
          description: input.description ?? `Created from audit log for ${entry.toolName}`,
          toolPattern: entry.toolName,
          contextType: determineContextType(entry.agentId, entry.userId),
          userId: entry.userId,
          agentId: entry.agentId,
          expectedDecision: input.expectedDecision,
          source: AssertionSource.AUDIT_LOG,
          sourceId: entry.id,
          enabled: true,
        },
      });

      await logAssertionAction({
        adminUserId: ctx.auth.user.id,
        organizationId: ctx.auth.organizationId,
        actionType: AdminActionType.POLICY_CREATE,
        assertion,
        extraDetails: { source: 'auditLog', sourceId: entry.id },
      });

      return assertion;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional().nullable(),
        toolPattern: z.string().optional(),
        contextType: z.nativeEnum(AssertionContextType).optional(),
        userId: z.string().cuid().optional().nullable(),
        agentId: z.string().cuid().optional().nullable(),
        roleName: z.string().optional().nullable(),
        expectedDecision: z.enum(['ALLOWED', 'DENIED']).optional(),
        enabled: z.boolean().optional(),
        // Tool invocation details
        toolParameters: z.record(z.string(), z.unknown()).optional().nullable(),
        contextOverrides: contextOverridesSchema.nullable(),
        extractedContext: extractedContextSchema.nullable(),
        extractedMode: extractedModeSchema.nullable(),
        parameterMode: parameterModeSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, toolParameters, contextOverrides, extractedContext, ...updates } = input;

      const existing = await requireAssertion(id, ctx.auth.organizationId);

      if (updates.toolPattern && !validateToolPattern(updates.toolPattern)) {
        throwBadRequest('Invalid tool pattern format');
      }

      if (updates.name && updates.name !== existing.name) {
        await checkDuplicateName(ctx.auth.organizationId, updates.name, id);
      }

      // Handle JSON fields separately to properly convert null to DbNull
      const dataToUpdate: Record<string, unknown> = { ...updates };
      if (toolParameters !== undefined) {
        dataToUpdate.toolParameters =
          toolParameters === null ? Prisma.DbNull : toJsonValue(toolParameters);
      }
      if (contextOverrides !== undefined) {
        dataToUpdate.contextOverrides =
          contextOverrides === null ? Prisma.DbNull : toJsonValue(contextOverrides);
      }
      if (extractedContext !== undefined) {
        dataToUpdate.extractedContext =
          extractedContext === null ? Prisma.DbNull : toJsonValue(extractedContext);
      }

      const assertion = await prisma.policyAssertion.update({
        where: { id },
        data: dataToUpdate,
      });

      await logAssertionAction({
        adminUserId: ctx.auth.user.id,
        organizationId: ctx.auth.organizationId,
        actionType: AdminActionType.POLICY_UPDATE,
        assertion,
        extraDetails: { changes: Object.keys(updates) },
      });

      return assertion;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const assertion = await requireAssertion(input.id, ctx.auth.organizationId);

      await prisma.policyAssertion.delete({ where: { id: input.id } });

      await logAssertionAction({
        adminUserId: ctx.auth.user.id,
        organizationId: ctx.auth.organizationId,
        actionType: AdminActionType.POLICY_DELETE,
        assertion,
      });

      return { success: true };
    }),

  run: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const assertion = await requireAssertion(input.id, ctx.auth.organizationId);

      const result = await runAssertion(assertion, undefined, ctx.auth.workspaceIds);

      await prisma.policyAssertion.update({
        where: { id: assertion.id },
        data: {
          lastRunAt: new Date(),
          lastRunPassed: result.passed,
          lastRunDecision: result.actualDecision,
          lastRunJustification: result.justification,
          lastRunPolicyIds: result.matchedPolicyIds,
          lastRunSubResults: result.subResults ? toJsonValue(result.subResults) : Prisma.JsonNull,
          failureCount: result.passed ? assertion.failureCount : assertion.failureCount + 1,
        },
      });

      return result;
    }),

  runAll: adminProcedure.mutation(async ({ ctx }) => {
    return runAllAssertions(ctx.auth.organizationId, ctx.auth.workspaceIds);
  }),

  summary: adminProcedure.query(async ({ ctx }) => {
    return getAssertionSummary(ctx.auth.organizationId);
  }),

  previewImpact: adminProcedure
    .input(
      z.object({
        matchers: z.array(z.string()).min(1),
        toolPatterns: z.array(z.string()).min(1),
        effect: z.nativeEnum(PolicyEffect),
        excludePolicyId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!validateToolPatterns(input.toolPatterns)) {
        throwBadRequest('Invalid tool pattern format');
      }

      const failures = await previewAssertionImpact(
        ctx.auth.organizationId,
        {
          matchers: input.matchers,
          toolPatterns: input.toolPatterns,
          effect: input.effect,
        },
        input.excludePolicyId,
        ctx.auth.workspaceIds,
      );

      return {
        wouldFail: failures.length > 0,
        failures: failures.map((f) => ({
          assertionId: f.assertionId,
          assertionName: f.assertionName,
          expected: f.expectedDecision,
          actual: f.actualDecision,
          justification: f.justification,
        })),
      };
    }),
});
