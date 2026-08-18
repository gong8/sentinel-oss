/**
 * Admin Policies Router
 * Handles policy management operations
 */

import {
  AdminActionType,
  AdminResourceType,
  PermissionRequestStatus,
  PolicyEffect,
  prisma,
  Prisma,
  WebhookEvent,
  type Policy,
} from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { toJsonValue } from '../../lib/jsonValue.js';
import { logger } from '../../lib/logger.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import type { PolicyEvaluationResult } from '../../services/policy.js';
import { sendWebhook, type VerboseEnrichmentContext } from '../../services/webhook.js';
import { adminProcedure, router } from '../init.js';

import { analyzePolicyDeletion } from '../../services/deletionImpact.js';
import { findMcpServerByToolName } from '../../services/mcp.js';
import {
  checkMatcher,
  checkToolPattern,
  generatePolicySlug,
  matcherArraysOverlap,
  toolPatternArraysOverlap,
  validateMatcher,
  validateMatchers,
  validateToolPattern,
  validateToolPatterns,
} from '../../services/policy.js';
import {
  conditionGroupNodeSchema,
  validateConditions,
  validateConditionsTree,
} from '../../services/policyCondition.js';
import {
  getToolValidationErrorMessage,
  validateToolNamesForOrganization,
} from '../../services/toolValidation.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates matchers and throws TRPCError if invalid
 */
function validateMatchersOrThrow(matchers: string[]): void {
  if (!validateMatchers(matchers)) {
    const invalidMatchers = matchers.filter((m) => !validateMatcher(m));
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid matcher format: ${invalidMatchers.join(', ')}`,
    });
  }
}

/**
 * Validates tool patterns and throws TRPCError if invalid
 */
function validateToolPatternsOrThrow(toolPatterns: string[]): void {
  if (!validateToolPatterns(toolPatterns)) {
    const invalidPatterns = toolPatterns.filter((tp) => !validateToolPattern(tp));
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid tool pattern format: ${invalidPatterns.join(', ')}`,
    });
  }
}

/**
 * Creates a policy snapshot object for audit logging
 */
function createPolicySnapshot(policy: Policy): Prisma.InputJsonObject {
  return {
    id: policy.id,
    slug: policy.slug,
    matchers: toJsonValue(policy.matchers),
    toolPatterns: policy.toolPatterns,
    effect: policy.effect,
    description: policy.description,
    enabled: policy.enabled,
    organizationId: policy.organizationId,
    conditions: policy.conditions ? toJsonValue(policy.conditions) : null,
    workspaceId: policy.workspaceId,
  };
}

/**
 * Runs affected assertions and returns formatted warnings for failed assertions
 */
async function getAssertionWarnings(
  organizationId: string,
  toolPatterns: string[],
  matchers: string[],
  userWorkspaceIds?: string[],
): Promise<
  Array<{
    assertionId: string;
    assertionName: string;
    expected: string;
    actual: string;
  }>
> {
  const { runAffectedAssertions } = await import('../../services/policyAssertion.js');
  const results = await runAffectedAssertions(
    organizationId,
    toolPatterns,
    matchers,
    userWorkspaceIds,
  );
  return results
    .filter((r) => !r.passed)
    .map((r) => ({
      assertionId: r.assertionId,
      assertionName: r.assertionName,
      expected: r.expectedDecision,
      actual: r.actualDecision,
    }));
}

/**
 * Sends a webhook notification and logs any errors
 */
function sendWebhookAsync(
  organizationId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  workspaceId?: string | null,
  meta?: VerboseEnrichmentContext,
): void {
  sendWebhook(organizationId, event, payload, workspaceId, meta).catch((err) =>
    logger.error('Failed to send webhook:', err),
  );
}

/**
 * Gets existing policy slugs for an organization (excluding a specific slug if provided)
 */
async function getExistingSlugs(
  organizationId: string,
  excludeSlug?: string,
): Promise<Set<string>> {
  const existingPolicies = await prisma.policy.findMany({
    where: { organizationId },
    select: { slug: true },
  });
  const slugs = existingPolicies.map((p) => p.slug);
  if (excludeSlug) {
    return new Set(slugs.filter((s) => s !== excludeSlug));
  }
  return new Set(slugs);
}

/**
 * Finds a policy by ID within an organization, throws NOT_FOUND if not found
 */
async function findPolicyOrThrow(
  id: string,
  organizationId: string,
  options?: { mustBeDeleted?: boolean },
): Promise<Policy> {
  const policy = await prisma.policy.findFirst({
    where: {
      id,
      organizationId,
      ...(options?.mustBeDeleted ? { deletedAt: { not: null } } : {}),
    },
  });

  if (!policy) {
    const message = options?.mustBeDeleted ? 'Policy not found or not deleted' : 'Policy not found';
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }

  return policy;
}

/**
 * Finds a policy test by ID within an organization, throws NOT_FOUND if not found
 */
async function findPolicyTestOrThrow(
  id: string,
  organizationId: string,
): Promise<{ id: string; organizationId: string; toolName: string }> {
  const test = await prisma.policyTest.findFirst({
    where: { id, organizationId },
    select: { id: true, organizationId: true, toolName: true },
  });

  if (!test) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Policy test not found' });
  }

  return test;
}

/**
 * Compare a created policy with the original permission request to determine
 * if the policy matches exactly (APPROVED) or has modifications (MODIFIED).
 *
 * Returns true if policy matches request exactly, false otherwise.
 */
function doesPolicyMatchRequest(
  policy: { matchers: string[]; toolPatterns: string[]; effect: PolicyEffect },
  request: { userEmail: string; toolNames: string[] },
): boolean {
  // Effect must be ALLOW
  if (policy.effect !== PolicyEffect.ALLOW) {
    return false;
  }

  // Matchers must be exactly ["user:<email>"]
  if (policy.matchers.length !== 1) {
    return false;
  }
  if (policy.matchers[0] !== `user:${request.userEmail}`) {
    return false;
  }

  // Tool patterns must match exactly (order-insensitive)
  if (policy.toolPatterns.length !== request.toolNames.length) {
    return false;
  }

  const sortedPatterns = [...policy.toolPatterns].sort();
  const sortedTools = [...request.toolNames].sort();

  for (let i = 0; i < sortedPatterns.length; i++) {
    if (sortedPatterns[i] !== sortedTools[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Generate a diff between what was requested and what was granted.
 * Returns null if no differences, otherwise returns the diff object.
 */
function generateRequestPolicyDiff(
  request: { userEmail: string; toolNames: string[] },
  policy: { matchers: string[]; toolPatterns: string[]; effect: PolicyEffect },
): {
  effect: { requested: string; granted: string } | null;
  matchers: { requested: string[]; granted: string[] } | null;
  tools: { requested: string[]; granted: string[] } | null;
} | null {
  const diff: {
    effect: { requested: string; granted: string } | null;
    matchers: { requested: string[]; granted: string[] } | null;
    tools: { requested: string[]; granted: string[] } | null;
  } = {
    effect: null,
    matchers: null,
    tools: null,
  };

  // Check effect
  const requestedEffect = 'ALLOW'; // Requests always ask for ALLOW
  if (policy.effect !== requestedEffect) {
    diff.effect = { requested: requestedEffect, granted: policy.effect };
  }

  // Check matchers
  const requestedMatchers = [`user:${request.userEmail}`];
  const sortedRequestedMatchers = [...requestedMatchers].sort();
  const sortedGrantedMatchers = [...policy.matchers].sort();
  if (JSON.stringify(sortedRequestedMatchers) !== JSON.stringify(sortedGrantedMatchers)) {
    diff.matchers = { requested: requestedMatchers, granted: policy.matchers };
  }

  // Check tools
  const sortedRequestedTools = [...request.toolNames].sort();
  const sortedGrantedTools = [...policy.toolPatterns].sort();
  if (JSON.stringify(sortedRequestedTools) !== JSON.stringify(sortedGrantedTools)) {
    diff.tools = { requested: request.toolNames, granted: policy.toolPatterns };
  }

  // Return null if no differences
  if (!diff.effect && !diff.matchers && !diff.tools) {
    return null;
  }

  return diff;
}

/**
 * Validates tool patterns against organization's MCP servers and returns normalized patterns
 */
async function validateAndNormalizeToolPatterns(
  organizationId: string,
  toolPatterns: string[],
): Promise<string[]> {
  const validation = await validateToolNamesForOrganization(organizationId, toolPatterns);
  const validationMessage = getToolValidationErrorMessage(validation);
  if (validationMessage) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: validationMessage,
    });
  }
  return validation.toolNames.length > 0 ? validation.toolNames : toolPatterns;
}

// ============================================================================
// Output Schemas (helps TypeScript avoid deep type instantiation)
// ============================================================================

const assertionWarningSchema = z.object({
  assertionId: z.string(),
  assertionName: z.string(),
  expected: z.string(),
  actual: z.string(),
});

const policyOutputSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  matchers: z.array(z.string()),
  toolPatterns: z.array(z.string()),
  effect: z.nativeEnum(PolicyEffect),
  description: z.string(),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  conditions: z.unknown().nullable(),
  conditionsTree: z.unknown().nullable(),
  conditionMode: z.enum(['SIMPLE', 'ADVANCED']),
  conditionExpression: z.unknown().nullable(),
  deletedAt: z.date().nullable(),
  deletedBy: z.string().nullable(),
  workspaceId: z.string().nullable(),
});

const createOutputSchema = z.object({
  policy: policyOutputSchema,
  linkedRequestUpdated: z.boolean(),
  assertionWarnings: z.array(assertionWarningSchema),
});

const updateOutputSchema = policyOutputSchema.extend({
  assertionWarnings: z.array(assertionWarningSchema),
});

export const adminPoliciesRouter = router({
  /**
   * List all policies
   * Org owners see all, others see org-wide + their workspace policies
   */
  list: adminProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean().optional(),
          workspaceId: z.string().cuid().optional(), // Filter to specific workspace
          tagIds: z.array(z.string().cuid()).optional(), // Filter by tag IDs
        })
        .optional(),
    )
    .output(
      z.array(
        policyOutputSchema.extend({
          tags: z
            .array(z.object({ id: z.string(), name: z.string(), color: z.string() }))
            .optional(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const { isOrgOwner, workspaceIds } = ctx.auth;

      // Build workspace filter
      let workspaceFilter: Prisma.PolicyWhereInput = {};
      if (input?.workspaceId) {
        // Filter to specific workspace + global policies (global policies apply to all workspaces)
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
        };
      } else if (!isOrgOwner) {
        // Non-owners see org-wide + their workspace policies
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
        };
      }
      // Org owners see all (no workspace filter)

      // Build tag filter
      let tagFilter: Prisma.PolicyWhereInput = {};
      if (input?.tagIds && input.tagIds.length > 0) {
        tagFilter = {
          tags: {
            some: {
              policyTagId: { in: input.tagIds },
            },
          },
        };
      }

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDeleted ? {} : { deletedAt: null }),
          ...workspaceFilter,
          ...tagFilter,
        },
        include: {
          tags: {
            include: {
              policyTag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Transform to include tags in a cleaner format
      return policies.map((p) => ({
        ...p,
        tags: p.tags.map((t) => t.policyTag),
      }));
    }),

  /**
   * Get a specific policy
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const policy = await prisma.policy.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
      include: {
        tags: {
          include: {
            policyTag: {
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
    });

    if (!policy) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Policy not found' });
    }

    // Validate workspace access for workspace-scoped policies
    if (
      policy.workspaceId &&
      !ctx.auth.isOrgOwner &&
      !ctx.auth.workspaceIds.includes(policy.workspaceId)
    ) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Policy not found',
      });
    }

    // Transform to include tags in a cleaner format
    return {
      ...policy,
      tags: policy.tags.map((t) => t.policyTag),
    };
  }),

  /**
   * Create a new policy
   * Supports multiple matchers and tool patterns per policy
   * Slug is auto-generated from matchers, toolPatterns, and effect
   * Requires BASIC_POLICIES or ALL_POLICIES feature (free+ tier)
   */
  create: adminProcedure
    .input(
      z.object({
        matchers: z.array(z.string()).min(1, 'At least one matcher is required').max(100),
        toolPatterns: z.array(z.string()).min(1, 'At least one tool pattern is required').max(100),
        effect: z.nativeEnum(PolicyEffect),
        description: z.string(),
        enabled: z.boolean().optional(),
        linkedRequestId: z.string().optional(), // Link to permission request being resolved
        conditions: z
          .array(
            z.object({
              field: z.string().min(1),
              operator: z.string().min(1),
              value: z.unknown().optional(), // Optional for operators like exists/notExists
              valueRef: z.string().optional(), // Global variable reference "NAMESPACE.fieldName"
            }),
          )
          .nullish(), // Deterministic conditions array (SIMPLE mode)
        conditionsTree: conditionGroupNodeSchema.nullish(), // Tree structure with AND/OR nesting
        conditionMode: z.enum(['SIMPLE', 'ADVANCED']).optional(), // Condition mode
        conditionExpression: z.string().max(10000).optional(), // Advanced expression (ADVANCED mode)
        workspaceId: z.string().cuid().optional(), // Workspace to scope policy to (null = org-wide)
        tagIds: z.array(z.string().cuid()).optional(), // Tags to assign to the policy
      }),
    )
    .output(createOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate matchers and tool patterns
      validateMatchersOrThrow(input.matchers);
      validateToolPatternsOrThrow(input.toolPatterns);

      // Validate conditions if provided (flat array)
      if (input.conditions) {
        const conditionValidation = validateConditions(input.conditions);
        if (!conditionValidation.valid) {
          const errorMessages = conditionValidation.errors.map((e) => `${e.field}: ${e.message}`);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid conditions: ${errorMessages.join('; ')}`,
          });
        }
      }

      // Validate conditionsTree if provided (tree structure with AND/OR)
      if (input.conditionsTree) {
        const treeValidation = validateConditionsTree(input.conditionsTree);
        if (!treeValidation.valid) {
          const errorMessages = treeValidation.errors.map((e) => `${e.field}: ${e.message}`);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid conditions tree: ${errorMessages.join('; ')}`,
          });
        }
      }

      // Validate and normalize tool patterns against organization's MCP servers
      const normalizedToolPatterns = await validateAndNormalizeToolPatterns(
        ctx.auth.organizationId,
        input.toolPatterns,
      );

      // Generate unique slug
      const existingSlugs = await getExistingSlugs(ctx.auth.organizationId);
      const slug = generatePolicySlug(
        input.matchers,
        normalizedToolPatterns,
        input.effect,
        existingSlugs,
      );

      // Handle advanced condition expression if provided
      let conditionExpression = undefined;
      if (input.conditionMode === 'ADVANCED' && input.conditionExpression) {
        // Parse and validate the expression with type environment (includes global vars)
        const { parseAdvancedCondition, createStoredExpression, buildTypeEnvironment } =
          await import('../../services/advancedCondition.js');
        const typeEnv = await buildTypeEnvironment(ctx.auth.organizationId, normalizedToolPatterns);
        const parseResult = parseAdvancedCondition(input.conditionExpression, typeEnv);
        if (!parseResult.success || !parseResult.ast) {
          const errorMessages = parseResult.errors.map((e) => e.message);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid advanced expression: ${errorMessages.join('; ')}`,
          });
        }
        conditionExpression = toJsonValue(
          createStoredExpression(input.conditionExpression, parseResult.ast),
        );
      }

      // Verify workspace access if workspaceId is provided
      if (input.workspaceId) {
        // Org owners can create in any workspace, workspace admins can create in their workspaces
        if (!ctx.auth.isOrgOwner && !ctx.auth.adminWorkspaceIds.includes(input.workspaceId)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to create policies in this workspace',
          });
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
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Workspace not found',
          });
        }
      } else {
        // Creating org-wide policy (no workspaceId) requires org owner
        if (!ctx.auth.isOrgOwner) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization owner access required',
          });
        }
      }

      const policy = await prisma.policy.create({
        data: {
          organizationId: ctx.auth.organizationId,
          slug,
          matchers: input.matchers,
          toolPatterns: normalizedToolPatterns,
          effect: input.effect,
          description: input.description,
          enabled: input.enabled ?? true,
          conditions: input.conditions ? toJsonValue(input.conditions) : undefined,
          conditionsTree: input.conditionsTree ? toJsonValue(input.conditionsTree) : undefined,
          conditionMode: input.conditionMode ?? 'SIMPLE',
          conditionExpression,
          workspaceId: input.workspaceId,
        },
      });

      // Assign tags if provided
      if (input.tagIds && input.tagIds.length > 0) {
        const { assignTagsToPolicy } = await import('../../services/policyTag.js');
        await assignTagsToPolicy(policy.id, ctx.auth.organizationId, input.tagIds);
      }

      // Capture request metadata early for use in multiple log calls
      const requestMeta = getRequestMetaFromTrpc(ctx);

      // Handle linked permission request if provided
      let linkedRequest = null;
      let approvalType: 'APPROVED' | 'MODIFIED' = 'MODIFIED';
      if (input.linkedRequestId) {
        linkedRequest = await prisma.permissionRequest.findFirst({
          where: {
            id: input.linkedRequestId,
            user: {
              organizationId: ctx.auth.organizationId,
            },
            status: PermissionRequestStatus.PENDING,
          },
          include: {
            user: { select: { email: true } },
          },
        });

        if (linkedRequest) {
          // Determine if policy matches request exactly
          const policyMatchesRequest = doesPolicyMatchRequest(
            { matchers: policy.matchers, toolPatterns: policy.toolPatterns, effect: policy.effect },
            { userEmail: linkedRequest.user.email, toolNames: linkedRequest.toolNames },
          );

          // Set status based on whether there are modifications
          approvalType = policyMatchesRequest ? 'APPROVED' : 'MODIFIED';
          const newStatus = policyMatchesRequest
            ? PermissionRequestStatus.APPROVED
            : PermissionRequestStatus.MODIFIED;

          // Generate diff for MODIFIED requests
          const grantDiff = policyMatchesRequest
            ? null
            : generateRequestPolicyDiff(
                { userEmail: linkedRequest.user.email, toolNames: linkedRequest.toolNames },
                {
                  matchers: policy.matchers,
                  toolPatterns: policy.toolPatterns,
                  effect: policy.effect,
                },
              );

          // Capture before snapshot for the request
          const requestBeforeSnapshot = {
            id: linkedRequest.id,
            userId: linkedRequest.userId,
            type: linkedRequest.type,
            status: linkedRequest.status,
            toolNames: linkedRequest.toolNames,
            reason: linkedRequest.reason,
            linkedPolicyId: linkedRequest.linkedPolicyId,
          };

          await prisma.permissionRequest.update({
            where: { id: input.linkedRequestId },
            data: {
              status: newStatus,
              reviewedBy: ctx.auth.user.id,
              reviewedAt: new Date(),
              linkedPolicyId: policy.id,
              grantDiff: grantDiff ? toJsonValue(grantDiff) : Prisma.JsonNull,
            },
          });

          // Log permission request approval
          await logAdminAction({
            organizationId: ctx.auth.organizationId,
            adminUserId: ctx.auth.user.id,
            actionType: AdminActionType.PERMISSION_REQUEST_APPROVE,
            resourceType: AdminResourceType.PERMISSION_REQUEST,
            resourceId: linkedRequest.id,
            resourceName: `Request from ${linkedRequest.user.email}`,
            actionDetails: {
              actionDisplayName: getActionDisplayName(AdminActionType.PERMISSION_REQUEST_APPROVE),
              requestId: linkedRequest.id,
              userId: linkedRequest.userId,
              userEmail: linkedRequest.user.email,
              type: linkedRequest.type,
              requestedToolNames: linkedRequest.toolNames,
              approvalType, // 'APPROVED' if exact match, 'MODIFIED' if different
              linkedPolicyId: policy.id,
              linkedPolicySlug: policy.slug,
              ...(grantDiff && { grantDiff }),
            },
            beforeSnapshot: requestBeforeSnapshot,
            afterSnapshot: {
              id: linkedRequest.id,
              userId: linkedRequest.userId,
              type: linkedRequest.type,
              status: newStatus,
              toolNames: linkedRequest.toolNames,
              reason: linkedRequest.reason,
              linkedPolicyId: policy.id,
              grantDiff: grantDiff,
              reviewedBy: ctx.auth.user.id,
              reviewedAt: new Date().toISOString(),
            },
            reason: policyMatchesRequest ? 'Approved as requested' : 'Approved with modifications',
            ...requestMeta,
          });
        }
      }

      // Log policy creation
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_CREATE,
        resourceType: AdminResourceType.POLICY,
        resourceId: policy.id,
        resourceName: policy.slug,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_CREATE),
          slug: policy.slug,
          matchers: policy.matchers,
          toolPatterns: policy.toolPatterns,
          effect: policy.effect,
          description: policy.description,
          enabled: policy.enabled,
          ...(linkedRequest && {
            createdViaPermissionRequest: true,
            permissionRequestId: linkedRequest.id,
            requestUserEmail: linkedRequest.user.email,
          }),
        },
        afterSnapshot: createPolicySnapshot(policy),
        ...requestMeta,
      });

      // Send webhook notification (fire-and-forget)
      sendWebhookAsync(
        ctx.auth.organizationId,
        WebhookEvent.POLICY_CREATED,
        {
          policyId: policy.id,
          policySlug: policy.slug,
          matchers: policy.matchers,
          toolPatterns: policy.toolPatterns,
          effect: policy.effect,
          description: policy.description,
          enabled: policy.enabled,
          createdBy: ctx.auth.user.email,
        },
        policy.workspaceId,
        { organizationId: ctx.auth.organizationId },
      );

      // Run affected assertions and collect warnings
      const assertionWarnings = await getAssertionWarnings(
        ctx.auth.organizationId,
        policy.toolPatterns,
        policy.matchers,
        ctx.auth.workspaceIds,
      );

      return { policy, linkedRequestUpdated: Boolean(linkedRequest), assertionWarnings };
    }),

  /**
   * Update a policy
   * Supports updating multiple matchers and tool patterns
   * Requires BASIC_POLICIES or ALL_POLICIES feature (free+ tier)
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        matchers: z.array(z.string()).min(1).max(100).optional(),
        toolPatterns: z.array(z.string()).min(1).max(100).optional(),
        effect: z.nativeEnum(PolicyEffect).optional(),
        description: z.string().optional(),
        enabled: z.boolean().optional(),
        conditions: z
          .array(
            z.object({
              field: z.string().min(1),
              operator: z.string().min(1),
              value: z.unknown().optional(), // Optional for operators like exists/notExists
              valueRef: z.string().optional(), // Global variable reference "NAMESPACE.fieldName"
            }),
          )
          .nullish(), // Deterministic conditions array (SIMPLE mode)
        conditionsTree: conditionGroupNodeSchema.nullish(), // Tree structure with AND/OR nesting
        conditionMode: z.enum(['SIMPLE', 'ADVANCED']).optional(), // Condition mode
        conditionExpression: z.string().max(10000).nullish(), // Advanced expression (ADVANCED mode)
        tagIds: z.array(z.string().cuid()).optional(), // Tags to assign to the policy
      }),
    )
    .output(updateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const policy = await findPolicyOrThrow(input.id, ctx.auth.organizationId);

      // Validate workspace access for workspace-scoped policies
      if (policy.workspaceId) {
        // Org owners can update any policy, workspace admins can update their workspace policies
        if (!ctx.auth.isOrgOwner && !ctx.auth.adminWorkspaceIds.includes(policy.workspaceId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Policy not found',
          });
        }
      } else {
        // Updating org-wide policy requires org owner
        if (!ctx.auth.isOrgOwner) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization owner access required',
          });
        }
      }

      // Validate matchers and tool patterns if provided
      if (input.matchers) {
        validateMatchersOrThrow(input.matchers);
      }
      if (input.toolPatterns) {
        validateToolPatternsOrThrow(input.toolPatterns);
      }

      // Normalize tool patterns if provided
      const normalizedToolPatterns = input.toolPatterns
        ? await validateAndNormalizeToolPatterns(ctx.auth.organizationId, input.toolPatterns)
        : undefined;

      // Validate conditions if provided (flat array)
      if (input.conditions) {
        const conditionValidation = validateConditions(input.conditions);
        if (!conditionValidation.valid) {
          const errorMessages = conditionValidation.errors.map((e) => `${e.field}: ${e.message}`);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid conditions: ${errorMessages.join('; ')}`,
          });
        }
      }

      // Validate conditionsTree if provided (tree structure)
      if (input.conditionsTree) {
        const treeValidation = validateConditionsTree(input.conditionsTree);
        if (!treeValidation.valid) {
          const errorMessages = treeValidation.errors.map((e) => `${e.field}: ${e.message}`);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid conditions tree: ${errorMessages.join('; ')}`,
          });
        }
      }

      // Determine final values (use input if provided, otherwise keep existing)
      const finalMatchers = input.matchers ?? policy.matchers;
      const finalToolPatterns = normalizedToolPatterns ?? policy.toolPatterns;
      const finalEffect = input.effect ?? policy.effect;

      // Check if slug-generating fields changed
      const matchersChanged =
        input.matchers !== undefined &&
        JSON.stringify(input.matchers) !== JSON.stringify(policy.matchers);
      const toolPatternsChanged =
        normalizedToolPatterns !== undefined &&
        JSON.stringify(normalizedToolPatterns) !== JSON.stringify(policy.toolPatterns);
      const slugFieldsChanged =
        matchersChanged ||
        toolPatternsChanged ||
        (input.effect !== undefined && input.effect !== policy.effect);

      // Generate new slug if slug-generating fields changed
      let newSlug: string | undefined;
      if (slugFieldsChanged) {
        const existingSlugs = await getExistingSlugs(ctx.auth.organizationId, policy.slug);
        newSlug = generatePolicySlug(finalMatchers, finalToolPatterns, finalEffect, existingSlugs);
      }

      const beforeSnapshot = createPolicySnapshot(policy);

      // Handle advanced condition expression if provided
      let conditionExpression: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
      if (input.conditionMode === 'ADVANCED' && input.conditionExpression !== undefined) {
        if (input.conditionExpression) {
          const { parseAdvancedCondition, createStoredExpression, buildTypeEnvironment } =
            await import('../../services/advancedCondition.js');
          // Build type environment with final tool patterns (includes global vars)
          const typeEnv = await buildTypeEnvironment(ctx.auth.organizationId, finalToolPatterns);
          const parseResult = parseAdvancedCondition(input.conditionExpression, typeEnv);
          if (!parseResult.success || !parseResult.ast) {
            const errorMessages = parseResult.errors.map((e) => e.message);
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Invalid advanced expression: ${errorMessages.join('; ')}`,
            });
          }
          conditionExpression = toJsonValue(
            createStoredExpression(input.conditionExpression, parseResult.ast),
          );
        } else {
          conditionExpression = Prisma.DbNull;
        }
      }

      const updated = await prisma.policy.update({
        where: { id: input.id },
        data: {
          matchers: input.matchers,
          toolPatterns: normalizedToolPatterns,
          effect: input.effect,
          description: input.description,
          enabled: input.enabled,
          ...(newSlug && { slug: newSlug }),
          ...(input.conditions !== undefined && {
            conditions: input.conditions ? toJsonValue(input.conditions) : Prisma.DbNull,
          }),
          ...(input.conditionsTree !== undefined && {
            conditionsTree: input.conditionsTree
              ? toJsonValue(input.conditionsTree)
              : Prisma.DbNull,
          }),
          ...(input.conditionMode !== undefined && { conditionMode: input.conditionMode }),
          ...(conditionExpression !== undefined && { conditionExpression }),
        },
      });

      // Update tags if provided
      if (input.tagIds !== undefined) {
        const { assignTagsToPolicy } = await import('../../services/policyTag.js');
        await assignTagsToPolicy(updated.id, ctx.auth.organizationId, input.tagIds);
      }

      // Determine action type based on what changed
      const wasEnabledChange = input.enabled !== undefined && input.enabled !== policy.enabled;
      let actionType: AdminActionType;
      if (wasEnabledChange) {
        actionType = input.enabled ? AdminActionType.POLICY_ENABLE : AdminActionType.POLICY_DISABLE;
      } else {
        actionType = AdminActionType.POLICY_UPDATE;
      }

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType,
        resourceType: AdminResourceType.POLICY,
        resourceId: updated.id,
        resourceName: updated.slug,
        actionDetails: {
          actionDisplayName: getActionDisplayName(actionType),
          previousSlug: policy.slug,
          newSlug: updated.slug,
          previousMatchers: policy.matchers,
          newMatchers: updated.matchers,
          previousToolPatterns: policy.toolPatterns,
          newToolPatterns: updated.toolPatterns,
          previousEffect: policy.effect,
          newEffect: updated.effect,
          previousDescription: policy.description,
          newDescription: updated.description,
          previousEnabled: policy.enabled,
          newEnabled: updated.enabled,
        },
        beforeSnapshot,
        afterSnapshot: createPolicySnapshot(updated),
        ...getRequestMetaFromTrpc(ctx),
      });

      // Send webhook notification (fire-and-forget)
      sendWebhookAsync(
        ctx.auth.organizationId,
        WebhookEvent.POLICY_UPDATED,
        {
          policyId: updated.id,
          policySlug: updated.slug,
          matchers: updated.matchers,
          toolPatterns: updated.toolPatterns,
          effect: updated.effect,
          description: updated.description,
          enabled: updated.enabled,
          updatedBy: ctx.auth.user.email,
          changes: {
            matchers: policy.matchers !== updated.matchers,
            toolPatterns: policy.toolPatterns !== updated.toolPatterns,
            effect: policy.effect !== updated.effect,
            enabled: policy.enabled !== updated.enabled,
          },
        },
        updated.workspaceId,
        { organizationId: ctx.auth.organizationId, beforeSnapshot },
      );

      // Run affected assertions and collect warnings
      const assertionWarnings = await getAssertionWarnings(
        ctx.auth.organizationId,
        updated.toolPatterns,
        updated.matchers,
        ctx.auth.workspaceIds,
      );

      return { ...updated, assertionWarnings };
    }),

  /**
   * Delete a policy (soft delete)
   * Requires BASIC_POLICIES or ALL_POLICIES feature (free+ tier)
   */
  delete: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string().optional(), // Optional reason (e.g., "Conflict resolution")
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const policy = await findPolicyOrThrow(input.id, ctx.auth.organizationId);

      // Validate workspace access for workspace-scoped policies
      if (policy.workspaceId) {
        // Org owners can delete any policy, workspace admins can delete their workspace policies
        if (!ctx.auth.isOrgOwner && !ctx.auth.adminWorkspaceIds.includes(policy.workspaceId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Policy not found',
          });
        }
      } else {
        // Deleting org-wide policy requires org owner
        if (!ctx.auth.isOrgOwner) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization owner access required',
          });
        }
      }

      // Analyze deletion impact (warnings only, no blocking for policies)
      const impact = await analyzePolicyDeletion(ctx.auth.organizationId, input.id);

      const beforeSnapshot = createPolicySnapshot(policy);

      // Soft delete: Update instead of delete
      await prisma.policy.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.auth.user.id,
          enabled: false, // Also disable when deleting
        },
      });

      // Determine if this is a conflict resolution
      const isConflictResolution = input.reason?.toLowerCase().includes('conflict') ?? false;
      const requestMeta = getRequestMetaFromTrpc(ctx);

      // If conflict resolution, find which policies this one conflicts with
      let conflictingPolicies: Array<{ id: string; slug: string; effect: string }> = [];
      if (isConflictResolution) {
        // Get all enabled policies to check for conflicts
        const allPolicies = await prisma.policy.findMany({
          where: {
            organizationId: ctx.auth.organizationId,
            enabled: true,
            id: { not: policy.id }, // Exclude the policy being deleted
          },
        });

        // Check for conflicts using array overlap functions
        for (const otherPolicy of allPolicies) {
          // Check if matchers overlap (any matcher in one could match a matcher in the other)
          const matchersDoOverlap = matcherArraysOverlap(policy.matchers, otherPolicy.matchers);

          // Check if tool patterns overlap
          const toolPatternsDoOverlap = toolPatternArraysOverlap(
            policy.toolPatterns,
            otherPolicy.toolPatterns,
          );

          if (matchersDoOverlap && toolPatternsDoOverlap) {
            conflictingPolicies.push({
              id: otherPolicy.id,
              slug: otherPolicy.slug,
              effect: otherPolicy.effect,
            });
          }
        }
      }

      // If conflict resolution, log two separate actions: conflict resolution first, then delete
      if (isConflictResolution) {
        // Log conflict resolution first - show which policies it was conflicting with
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: ctx.auth.user.id,
          actionType: AdminActionType.POLICY_CONFLICT_RESOLVE,
          resourceType: AdminResourceType.POLICY,
          resourceId: policy.id,
          resourceName: policy.slug,
          actionDetails: {
            actionDisplayName: getActionDisplayName(AdminActionType.POLICY_CONFLICT_RESOLVE),
            policySlug: policy.slug,
            policyEffect: policy.effect,
            conflictingPolicies: conflictingPolicies.map((p) => ({
              id: p.id,
              slug: p.slug,
              effect: p.effect,
            })),
            resolutionMethod: 'delete',
          },
          beforeSnapshot,
          reason: 'Conflict resolved by deleting policy',
          ...requestMeta,
        });

        // Then log the delete action with full policy details
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: ctx.auth.user.id,
          actionType: AdminActionType.POLICY_DELETE,
          resourceType: AdminResourceType.POLICY,
          resourceId: policy.id,
          resourceName: policy.slug,
          actionDetails: {
            actionDisplayName: getActionDisplayName(AdminActionType.POLICY_DELETE),
            slug: policy.slug,
            matchers: policy.matchers,
            toolPatterns: policy.toolPatterns,
            effect: policy.effect,
            description: policy.description,
            enabled: policy.enabled,
            deletedViaConflictResolution: true,
          },
          beforeSnapshot,
          reason: 'Deleted to resolve policy conflict',
          ...requestMeta,
        });
      } else {
        // Regular delete - just log the delete action
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: ctx.auth.user.id,
          actionType: AdminActionType.POLICY_DELETE,
          resourceType: AdminResourceType.POLICY,
          resourceId: policy.id,
          resourceName: policy.slug,
          actionDetails: {
            actionDisplayName: getActionDisplayName(AdminActionType.POLICY_DELETE),
            slug: policy.slug,
            matchers: policy.matchers,
            toolPatterns: policy.toolPatterns,
            effect: policy.effect,
            description: policy.description,
            enabled: policy.enabled,
          },
          beforeSnapshot,
          reason: input.reason || null,
          ...requestMeta,
        });
      }

      // Send webhook notification (fire-and-forget)
      sendWebhookAsync(
        ctx.auth.organizationId,
        WebhookEvent.POLICY_DELETED,
        {
          policyId: policy.id,
          policySlug: policy.slug,
          matchers: policy.matchers,
          toolPatterns: policy.toolPatterns,
          effect: policy.effect,
          description: policy.description,
          deletedBy: ctx.auth.user.email,
          deletedViaConflictResolution: isConflictResolution,
        },
        policy.workspaceId,
        { organizationId: ctx.auth.organizationId, beforeSnapshot },
      );

      // Run affected assertions and collect warnings
      const assertionWarnings = await getAssertionWarnings(
        ctx.auth.organizationId,
        policy.toolPatterns,
        policy.matchers,
        ctx.auth.workspaceIds,
      );

      return { success: true, impact, assertionWarnings };
    }),

  /**
   * Restore a soft-deleted policy
   */
  restore: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const policy = await findPolicyOrThrow(input.id, ctx.auth.organizationId, {
        mustBeDeleted: true,
      });

      // Validate workspace access for workspace-scoped policies
      if (policy.workspaceId) {
        // Org owners can restore any policy, workspace admins can restore their workspace policies
        if (!ctx.auth.isOrgOwner && !ctx.auth.adminWorkspaceIds.includes(policy.workspaceId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Policy not found or not deleted',
          });
        }
      } else {
        // Restoring org-wide policy requires org owner
        if (!ctx.auth.isOrgOwner) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization owner access required',
          });
        }
      }

      // Capture before snapshot including deletion fields
      const beforeSnapshot = {
        ...createPolicySnapshot(policy),
        deletedAt: policy.deletedAt,
        deletedBy: policy.deletedBy,
      };

      // Restore: Clear deletedAt and deletedBy (do NOT auto-enable)
      const restored = await prisma.policy.update({
        where: { id: input.id },
        data: { deletedAt: null, deletedBy: null },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.POLICY_RESTORE,
        resourceType: AdminResourceType.POLICY,
        resourceId: restored.id,
        resourceName: restored.slug,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.POLICY_RESTORE),
          action: 'restore',
          previousDeletedAt: policy.deletedAt?.toISOString(),
          previousDeletedBy: policy.deletedBy,
        },
        beforeSnapshot,
        afterSnapshot: {
          ...createPolicySnapshot(restored),
          deletedAt: null,
          deletedBy: null,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Get deletion impact preview for a policy
   */
  getDeletionImpact: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const policy = await findPolicyOrThrow(input.id, ctx.auth.organizationId);

      // Validate workspace access for workspace-scoped policies
      if (policy.workspaceId) {
        // Org owners can view any policy, workspace admins can view their workspace policies
        if (!ctx.auth.isOrgOwner && !ctx.auth.adminWorkspaceIds.includes(policy.workspaceId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Policy not found',
          });
        }
      } else {
        // Viewing org-wide policy impact requires org owner
        if (!ctx.auth.isOrgOwner) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization owner access required',
          });
        }
      }

      return analyzePolicyDeletion(ctx.auth.organizationId, input.id);
    }),

  /**
   * Test policy evaluation
   * Allows admins to test how a specific tool invocation would be evaluated
   * Now supports full invocation details including parameters and context overrides
   */
  test: adminProcedure
    .input(
      z.object({
        toolName: z.string(),
        userId: z.string().optional(),
        agentId: z.string().optional(),
        // Tool invocation parameters
        parameters: z.record(z.string(), z.unknown()).optional(),
        // Context overrides for testing
        contextOverrides: z
          .object({
            hourOfDay: z.number().int().min(0).max(23).optional(),
            dayOfWeek: z.number().int().min(0).max(6).optional(),
            sourceIp: z.string().optional(),
            timestamp: z.string().datetime().optional(),
          })
          .optional(),
        // Extracted context for testing
        extractedContext: z
          .object({
            sql: z
              .object({
                sqlOperation: z.string().optional(),
                sqlTables: z.array(z.string()).optional(),
                hasSqlComment: z.boolean().optional(),
              })
              .optional(),
            github: z
              .object({
                gitRepository: z.string().optional(),
                gitBranch: z.string().optional(),
                gitOwner: z.string().optional(),
                isProtectedBranch: z.boolean().optional(),
              })
              .optional(),
            file: z
              .object({
                filePath: z.string().optional(),
                fileExtension: z.string().optional(),
                isSensitivePath: z.boolean().optional(),
              })
              .optional(),
          })
          .optional(),
        // Extraction mode: 'auto' or 'manual'
        extractedMode: z.enum(['auto', 'manual']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { evaluatePolicy } = await import('../../services/policy.js');

      const { isOrgOwner, workspaceIds } = ctx.auth;

      // Build workspace filter - same pattern as list procedure
      let workspaceFilter: Prisma.PolicyWhereInput = {};
      if (!isOrgOwner) {
        // Non-owners see org-wide + their workspace policies
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
        };
      }

      // Get all non-deleted policies for the organization
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          ...workspaceFilter,
        },
      });

      // Get user with roles
      let user;
      if (input.userId) {
        user = await prisma.user.findFirst({
          where: {
            id: input.userId,
            organizationId: ctx.auth.organizationId,
          },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }
      } else {
        // Use the current admin user if no userId provided
        user = await prisma.user.findFirst({
          where: {
            id: ctx.auth.user.id,
          },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Current user not found',
          });
        }
      }

      // Get agent if provided
      let agent = null;
      if (input.agentId) {
        agent = await prisma.agent.findFirst({
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
      }

      const mcpServer = await findMcpServerByToolName(ctx.auth.organizationId, input.toolName);

      // Evaluate policy with invocation details
      const result = await evaluatePolicy(
        {
          user,
          agent,
          toolName: input.toolName,
          parameters: input.parameters,
          sourceIp: input.contextOverrides?.sourceIp,
          contextOverrides: input.contextOverrides,
          extractedContext: input.extractedContext,
          extractedMode: input.extractedMode,
        },
        policies,
      );

      const finalResult: PolicyEvaluationResult =
        mcpServer && !mcpServer.trusted
          ? {
              decision: 'DENIED',
              justification: `MCP server "${mcpServer.name}" is untrusted`,
              policyIds: [],
            }
          : result;

      // Find ALL policies that match the context (both ALLOW and DENY)
      // A policy matches if ANY matcher matches AND ANY tool pattern matches
      const allMatchingPolicies = policies.filter((policy) => {
        if (!policy.enabled || policy.deletedAt) return false;
        const matchesMatcher = policy.matchers.some((m) => checkMatcher(m, user, agent));
        const matchesTool = policy.toolPatterns.some((tp) => checkToolPattern(tp, input.toolName));
        return matchesMatcher && matchesTool;
      });

      // Get the actual policy details for matching policies
      const matchingPolicies = allMatchingPolicies.map((p) => ({
        id: p.id,
        slug: p.slug,
        matchers: p.matchers,
        toolPatterns: p.toolPatterns,
        effect: p.effect,
        description: p.description,
      }));

      // Also return ALL enabled policies for debugging
      // Map effect to string to ensure JSON serialization compatibility
      const allEnabledPolicies = policies
        .filter((p) => p.enabled && !p.deletedAt)
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          matchers: p.matchers,
          toolPatterns: p.toolPatterns,
          effect: String(p.effect),
          description: p.description,
          enabled: p.enabled,
        }));

      // Save test result to database for history
      const policyTest = await prisma.policyTest.create({
        data: {
          organizationId: ctx.auth.organizationId,
          createdById: ctx.auth.user.id,
          toolName: input.toolName,
          userId: user.id,
          agentId: agent?.id,
          decision: finalResult.decision,
          justification: finalResult.justification,
          matchedPolicyIds: allMatchingPolicies.map((p) => p.id), // All matching policies
          allEnabledPolicyIds: allEnabledPolicies.map((p) => p.id),
          policySnapshot: allEnabledPolicies,
          userEmail: user.email,
          userRoles: user.userRoles.map((ur) => ur.role.name),
          agentName: agent?.name,
          // Store invocation details for replay
          toolParameters: input.parameters ? toJsonValue(input.parameters) : Prisma.DbNull,
          contextOverrides: input.contextOverrides
            ? toJsonValue(input.contextOverrides)
            : Prisma.DbNull,
          extractedContext: input.extractedContext
            ? toJsonValue(input.extractedContext)
            : Prisma.DbNull,
          extractedMode: input.extractedMode ?? null,
        },
      });

      return {
        ...finalResult,
        testId: policyTest.id,
        matchingPolicies,
        allEnabledPolicies,
        user: {
          id: user.id,
          email: user.email,
          roles: user.userRoles.map((ur) => ur.role.name),
        },
        agent: agent
          ? {
              id: agent.id,
              name: agent.name,
            }
          : null,
      };
    }),

  /**
   * Detect conflicts between policies
   */
  detectConflicts: adminProcedure.query(async ({ ctx }) => {
    const policies = await prisma.policy.findMany({
      where: {
        organizationId: ctx.auth.organizationId,
        enabled: true,
        deletedAt: null,
      },
    });

    const conflicts: Array<{
      type: 'overlap' | 'contradiction';
      severity: 'high' | 'low';
      policies: Array<{ id: string; slug: string; description: string; effect: string }>;
      message: string;
    }> = [];

    // Check for overlapping policies
    for (let i = 0; i < policies.length; i++) {
      for (let j = i + 1; j < policies.length; j++) {
        const p1 = policies[i];
        const p2 = policies[j];

        // Use array-based overlap detection functions
        const matchersDoOverlap = matcherArraysOverlap(p1.matchers, p2.matchers);
        const toolPatternsDoOverlap = toolPatternArraysOverlap(p1.toolPatterns, p2.toolPatterns);

        if (matchersDoOverlap && toolPatternsDoOverlap) {
          // Determine conflict type
          if (p1.effect !== p2.effect) {
            // Case 1: Contradiction - different effects (DENY vs ALLOW)
            // This is high severity because DENY will always override ALLOW
            const denyPolicy = p1.effect === 'DENY' ? p1 : p2;
            const allowPolicy = p1.effect === 'ALLOW' ? p1 : p2;

            conflicts.push({
              type: 'contradiction',
              severity: 'high',
              policies: [
                { id: p1.id, slug: p1.slug, description: p1.description, effect: p1.effect },
                { id: p2.id, slug: p2.slug, description: p2.description, effect: p2.effect },
              ],
              message: `DENY policy "${denyPolicy.slug}" will always override ALLOW policy "${allowPolicy.slug}" for overlapping scope`,
            });
          } else if (p1.effect === 'ALLOW' && p2.effect === 'ALLOW') {
            // Case 2: Overlap - redundant ALLOW policies
            // Low severity because redundant ALLOWs don't cause issues
            conflicts.push({
              type: 'overlap',
              severity: 'low',
              policies: [
                { id: p1.id, slug: p1.slug, description: p1.description, effect: p1.effect },
                { id: p2.id, slug: p2.slug, description: p2.description, effect: p2.effect },
              ],
              message: `Policies "${p1.slug}" and "${p2.slug}" grant overlapping permissions (redundant)`,
            });
          } else if (p1.effect === 'DENY' && p2.effect === 'DENY') {
            // Case 3: Overlap - redundant DENY policies
            // Low severity because redundant DENYs don't cause issues (both deny)
            conflicts.push({
              type: 'overlap',
              severity: 'low',
              policies: [
                { id: p1.id, slug: p1.slug, description: p1.description, effect: p1.effect },
                { id: p2.id, slug: p2.slug, description: p2.description, effect: p2.effect },
              ],
              message: `Policies "${p1.slug}" and "${p2.slug}" have overlapping deny rules (redundant)`,
            });
          }
        }
      }
    }

    return conflicts;
  }),

  /**
   * List policy test history
   */
  listTests: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [total, tests] = await Promise.all([
        prisma.policyTest.count({
          where: { organizationId: ctx.auth.organizationId },
        }),
        prisma.policyTest.findMany({
          where: { organizationId: ctx.auth.organizationId },
          orderBy: { createdAt: 'desc' },
          take: input.limit ?? 20,
          skip: input.offset ?? 0,
        }),
      ]);

      return { total, tests };
    }),

  /**
   * Get a specific policy test
   */
  getTest: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return findPolicyTestOrThrow(input.id, ctx.auth.organizationId);
    }),

  /**
   * Delete a policy test
   */
  deleteTest: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await findPolicyTestOrThrow(input.id, ctx.auth.organizationId);
      await prisma.policyTest.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Bulk enable multiple policies
   */
  bulkEnable: adminProcedure
    .input(z.object({ ids: z.array(z.string().cuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Verify all policies belong to the organization
      const policies = await prisma.policy.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true, slug: true, enabled: true },
      });

      const foundIds = new Set(policies.map((p) => p.id));
      const missingIds = input.ids.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Policies not found: ${missingIds.join(', ')}`,
        });
      }

      // Only update policies that are currently disabled
      const toEnable = policies.filter((p) => !p.enabled);

      if (toEnable.length > 0) {
        await prisma.policy.updateMany({
          where: { id: { in: toEnable.map((p) => p.id) } },
          data: { enabled: true },
        });

        // Log admin action for each enabled policy
        const requestMeta = getRequestMetaFromTrpc(ctx);
        for (const policy of toEnable) {
          await logAdminAction({
            organizationId: ctx.auth.organizationId,
            adminUserId: ctx.auth.user.id,
            actionType: AdminActionType.POLICY_ENABLE,
            resourceType: AdminResourceType.POLICY,
            resourceId: policy.id,
            resourceName: policy.slug,
            actionDetails: {
              actionDisplayName: getActionDisplayName(AdminActionType.POLICY_ENABLE),
              bulkOperation: true,
            },
            ...requestMeta,
          });
        }
      }

      return { enabledCount: toEnable.length, totalRequested: input.ids.length };
    }),

  /**
   * Bulk disable multiple policies
   */
  bulkDisable: adminProcedure
    .input(z.object({ ids: z.array(z.string().cuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Verify all policies belong to the organization
      const policies = await prisma.policy.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true, slug: true, enabled: true },
      });

      const foundIds = new Set(policies.map((p) => p.id));
      const missingIds = input.ids.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Policies not found: ${missingIds.join(', ')}`,
        });
      }

      // Only update policies that are currently enabled
      const toDisable = policies.filter((p) => p.enabled);

      if (toDisable.length > 0) {
        await prisma.policy.updateMany({
          where: { id: { in: toDisable.map((p) => p.id) } },
          data: { enabled: false },
        });

        // Log admin action for each disabled policy
        const requestMeta = getRequestMetaFromTrpc(ctx);
        for (const policy of toDisable) {
          await logAdminAction({
            organizationId: ctx.auth.organizationId,
            adminUserId: ctx.auth.user.id,
            actionType: AdminActionType.POLICY_DISABLE,
            resourceType: AdminResourceType.POLICY,
            resourceId: policy.id,
            resourceName: policy.slug,
            actionDetails: {
              actionDisplayName: getActionDisplayName(AdminActionType.POLICY_DISABLE),
              bulkOperation: true,
            },
            ...requestMeta,
          });
        }
      }

      return { disabledCount: toDisable.length, totalRequested: input.ids.length };
    }),

  /**
   * Bulk delete multiple policies (soft delete)
   */
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.string().cuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Verify all policies belong to the organization
      const policies = await prisma.policy.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true, slug: true },
      });

      const foundIds = new Set(policies.map((p) => p.id));
      const missingIds = input.ids.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Policies not found: ${missingIds.join(', ')}`,
        });
      }

      // Soft delete all policies
      await prisma.policy.updateMany({
        where: { id: { in: input.ids } },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.auth.user.id,
          enabled: false,
        },
      });

      // Log admin action for each deleted policy
      const requestMeta = getRequestMetaFromTrpc(ctx);
      for (const policy of policies) {
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: ctx.auth.user.id,
          actionType: AdminActionType.POLICY_DELETE,
          resourceType: AdminResourceType.POLICY,
          resourceId: policy.id,
          resourceName: policy.slug,
          actionDetails: {
            actionDisplayName: getActionDisplayName(AdminActionType.POLICY_DELETE),
            bulkOperation: true,
          },
          ...requestMeta,
        });
      }

      return { deletedCount: policies.length };
    }),

  /**
   * Bulk assign tags to multiple policies
   */
  bulkAssignTags: adminProcedure
    .input(
      z.object({
        policyIds: z.array(z.string().cuid()).min(1).max(100),
        tagIds: z.array(z.string().cuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify all policies belong to the organization
      const policies = await prisma.policy.findMany({
        where: {
          id: { in: input.policyIds },
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });

      const foundIds = new Set(policies.map((p) => p.id));
      const missingIds = input.policyIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Policies not found: ${missingIds.join(', ')}`,
        });
      }

      // Verify all tags belong to the organization
      const tags = await prisma.policyTag.findMany({
        where: {
          id: { in: input.tagIds },
          organizationId: ctx.auth.organizationId,
        },
        select: { id: true },
      });

      const foundTagIds = new Set(tags.map((t) => t.id));
      const missingTagIds = input.tagIds.filter((id) => !foundTagIds.has(id));
      if (missingTagIds.length > 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Tags not found: ${missingTagIds.join(', ')}`,
        });
      }

      // Get existing assignments to avoid duplicates
      const existingAssignments = await prisma.policyTagAssignment.findMany({
        where: {
          policyId: { in: input.policyIds },
          policyTagId: { in: input.tagIds },
        },
        select: { policyId: true, policyTagId: true },
      });

      const existingPairs = new Set(
        existingAssignments.map((a) => `${a.policyId}:${a.policyTagId}`),
      );

      // Create new assignments
      const newAssignments: { policyId: string; policyTagId: string }[] = [];
      for (const policyId of input.policyIds) {
        for (const tagId of input.tagIds) {
          if (!existingPairs.has(`${policyId}:${tagId}`)) {
            newAssignments.push({ policyId, policyTagId: tagId });
          }
        }
      }

      if (newAssignments.length > 0) {
        await prisma.policyTagAssignment.createMany({
          data: newAssignments,
        });
      }

      return {
        assignedCount: newAssignments.length,
        policiesAffected: input.policyIds.length,
        tagsAssigned: input.tagIds.length,
      };
    }),
});
