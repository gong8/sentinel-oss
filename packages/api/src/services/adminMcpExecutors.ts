/**
 * Admin MCP Executors
 *
 * Registry of executors for admin MCP write tools.
 * Each executor implements the actual business logic for a confirmed operation.
 *
 * NOTE: Input validation (toolPatterns, matchers) happens BEFORE confirmation
 * in the write tool executor. The executors here receive pre-validated input.
 * Post-execution verification ensures data was stored correctly.
 */

import {
  Prisma,
  prisma,
  SensitiveFlagBehavior,
  WebhookEndpointType,
  WebhookEvent,
} from '@sentinel/db';
import { z } from 'zod';
import { toJsonValue } from '../lib/jsonValue.js';
import { logger } from '../lib/logger.js';
import { parseInputOrThrow } from '../lib/validation.js';
import { validateToolPattern } from './policy.js';
import { policyConditionsSchema, type PolicyCondition } from './policyCondition.js';
import {
  validateConditionFields,
  validateMatchers,
  validateToolPatterns,
} from './policyValidation.js';
import { alertConfigSchema, approvalConfigSchema, rateLimitConfigSchema } from './sensitiveFlag.js';

// ============================================================================
// WORKSPACE ACCESS VALIDATION
// ============================================================================

/**
 * Error thrown when an admin attempts to access or create resources in a workspace
 * they don't have access to.
 */
export class WorkspaceAccessError extends Error {
  constructor(targetWorkspaceId: string) {
    super(`Access denied: You do not have access to workspace ${targetWorkspaceId}`);
    this.name = 'WorkspaceAccessError';
  }
}

/**
 * Validates that the admin has access to the target workspace.
 *
 * Rules:
 * - If targetWorkspaceId is null/undefined, the resource is org-wide (allowed)
 * - If targetWorkspaceId is provided, admin must have access to that workspace
 *
 * @throws WorkspaceAccessError if access is denied
 */
export function validateWorkspaceAccess(
  targetWorkspaceId: string | null | undefined,
  adminWorkspaceIds: string[] | undefined,
): void {
  // If no target workspace specified (org-wide/global), access is allowed
  if (!targetWorkspaceId) {
    return;
  }

  // If adminWorkspaceIds is undefined, admin is in org-wide mode (can access all)
  if (!adminWorkspaceIds) {
    return;
  }

  // Check if admin has access to the target workspace
  if (!adminWorkspaceIds.includes(targetWorkspaceId)) {
    throw new WorkspaceAccessError(targetWorkspaceId);
  }
}

// ============================================================================
// ZOD SCHEMAS FOR INPUT VALIDATION
// ============================================================================

/**
 * Schema for creating a role
 */
const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  isAdmin: z.boolean().optional(),
});

/**
 * Schema for updating a role
 */
const updateRoleSchema = z.object({
  id: z.string().min(1, 'Role ID is required'),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isAdmin: z.boolean().optional(),
});

/**
 * Schema for deleting a role
 */
const deleteRoleSchema = z.object({
  id: z.string().min(1, 'Role ID is required'),
});

/**
 * Schema for creating an agent
 */
const createAgentSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  protocolType: z.enum(['MCP', 'A2A']).optional(),
  publicKeyUrl: z.string().url('Invalid public key URL format').optional(),
});

/**
 * Schema for deleting an agent
 */
const deleteAgentSchema = z.object({
  id: z.string().min(1, 'Agent ID is required'),
});

/**
 * Schema for creating an MCP server
 */
const createMcpServerSchema = z.object({
  name: z.string().min(1, 'MCP server name is required'),
  url: z.string().url('Invalid MCP server URL format'),
  authType: z.enum(['NONE', 'API_KEY', 'OAUTH']).optional(),
  trusted: z.boolean().optional(),
  workspaceId: z.string().cuid().nullable().optional(),
});

/**
 * Schema for updating an MCP server
 */
const updateMcpServerSchema = z.object({
  id: z.string().min(1, 'MCP server ID is required'),
  name: z.string().min(1).optional(),
  url: z.string().url('Invalid MCP server URL format').optional(),
  authType: z.enum(['NONE', 'API_KEY', 'OAUTH']).optional(),
  trusted: z.boolean().optional(),
  workspaceId: z.string().cuid().nullable().optional(),
});

/**
 * Schema for deleting an MCP server
 */
const deleteMcpServerSchema = z.object({
  id: z.string().min(1, 'MCP server ID is required'),
});

/**
 * Schema for creating a policy
 */
const createPolicySchema = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  effect: z.enum(['ALLOW', 'DENY'], {
    message: 'Policy effect is required (ALLOW or DENY)',
  }),
  matchers: z.array(z.string().min(1)).min(1, {
    message:
      'Policy matchers is required and must be a non-empty array (e.g., ["*"] for everyone, ["user:email@example.com"])',
  }),
  toolPatterns: z.array(z.string().min(1)).min(1, {
    message:
      'Policy toolPatterns is required and must be a non-empty array (e.g., ["*::*"] for all tools, ["server::tool"])',
  }),
  description: z
    .string({ message: 'Policy description is required' })
    .refine((val) => val.trim().length > 0, { message: 'Policy description is required' }),
  conditions: policyConditionsSchema.optional(),
  requestId: z.string().optional(),
  reviewNote: z.string().optional(),
  workspaceId: z.string().cuid().nullable().optional(), // null = global, undefined = not set
});

/**
 * Schema for updating a policy
 */
const updatePolicySchema = z.object({
  id: z.string().min(1, { message: 'Policy id is required' }),
  slug: z.string().min(1).optional(),
  effect: z.enum(['ALLOW', 'DENY']).optional(),
  matchers: z.array(z.string().min(1)).min(1).optional(),
  toolPatterns: z.array(z.string().min(1)).min(1).optional(),
  description: z.string().optional(),
  conditions: policyConditionsSchema.optional(),
});

/**
 * Schema for deleting a policy
 */
const deletePolicySchema = z.object({
  id: z.string().min(1, { message: 'Policy id is required' }),
});

/**
 * Schema for policy ID only operations (enable/disable)
 */
const policyIdSchema = z.object({
  id: z.string().min(1, { message: 'Policy id is required' }),
});

/**
 * Schema for creating a user
 */
const createUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  roleIds: z.array(z.string().min(1)).optional(),
});

/**
 * Schema for updating a user
 */
const updateUserSchema = z.object({
  id: z.string().min(1, { message: 'User id is required' }),
  email: z.string().email({ message: 'Invalid email format' }).optional(),
  roleIds: z.array(z.string().min(1)).optional(),
});

/**
 * Schema for deleting a user
 */
const deleteUserSchema = z.object({
  id: z.string().min(1, { message: 'User id is required' }),
});

/**
 * Schema for user ID only operations (refresh/revoke token)
 */
const userIdSchema = z.object({
  id: z.string().min(1, { message: 'User id is required' }),
});

// ============================================================================
// SCHEMAS FOR SENSITIVE FLAG, WEBHOOK, AND PERMISSION REQUEST TOOLS
// ============================================================================

/**
 * Schema for setting org API key on MCP server
 */
const setOrgApiKeySchema = z.object({
  serverId: z.string().min(1, { message: 'Server ID is required' }),
  apiKey: z.string().min(1, { message: 'API key is required' }),
});

/**
 * Native enum schema for sensitive flag behaviors
 */
const sensitiveFlagBehaviorEnum = z.nativeEnum(SensitiveFlagBehavior);

/**
 * Native enum schema for webhook events
 */
const webhookEventEnum = z.nativeEnum(WebhookEvent);

/**
 * Native enum schema for webhook endpoint types
 */
const webhookEndpointTypeEnum = z.nativeEnum(WebhookEndpointType);

/**
 * Schema for creating a sensitive flag
 */
const createSensitiveFlagSchema = z.object({
  toolPattern: z
    .string()
    .min(1, { message: 'Tool pattern is required' })
    .refine(validateToolPattern, {
      message:
        'Invalid tool pattern format. Must be "serverKey::toolName", "*::*", or "a2a::agentId::skillId"',
    }),
  behaviors: z
    .array(sensitiveFlagBehaviorEnum)
    .min(1, { message: 'At least one behavior is required' }),
  description: z.string().optional(),
  rateLimitConfig: rateLimitConfigSchema.optional(),
  approvalConfig: approvalConfigSchema.optional(),
  alertConfig: alertConfigSchema.optional(),
});

/**
 * Schema for updating a sensitive flag
 */
const updateSensitiveFlagSchema = z.object({
  id: z.string().min(1, { message: 'Sensitive flag ID is required' }),
  behaviors: z.array(sensitiveFlagBehaviorEnum).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  rateLimitConfig: rateLimitConfigSchema.optional(),
  approvalConfig: approvalConfigSchema.optional(),
  alertConfig: alertConfigSchema.optional(),
});

/**
 * Schema for deleting a sensitive flag
 */
const deleteSensitiveFlagSchema = z.object({
  id: z.string().min(1, { message: 'Sensitive flag ID is required' }),
});

/**
 * Schema for approving a sensitive flag request
 */
const approveSensitiveFlagSchema = z.object({
  id: z.string().min(1, { message: 'Approval request ID is required' }),
});

/**
 * Schema for denying a sensitive flag request
 */
const denySensitiveFlagSchema = z.object({
  id: z.string().min(1, { message: 'Approval request ID is required' }),
  reason: z.string().optional(),
});

/**
 * Schema for creating a webhook
 */
const createWebhookSchema = z.object({
  name: z.string().min(1, { message: 'Webhook name is required' }),
  type: webhookEndpointTypeEnum.optional(),
  url: z.string().url({ message: 'Invalid webhook URL format' }).optional(),
  events: z.array(webhookEventEnum).min(1, { message: 'At least one event is required' }),
  secret: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for updating a webhook
 */
const updateWebhookSchema = z.object({
  id: z.string().min(1, { message: 'Webhook ID is required' }),
  name: z.string().min(1).optional(),
  url: z.string().url({ message: 'Invalid webhook URL format' }).optional(),
  events: z.array(webhookEventEnum).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for deleting a webhook
 */
const deleteWebhookSchema = z.object({
  id: z.string().min(1, { message: 'Webhook ID is required' }),
});

/**
 * Schema for approving a permission request
 */
const approveRequestSchema = z.object({
  id: z.string().min(1, { message: 'Permission request ID is required' }),
  note: z.string().optional(),
});

/**
 * Schema for denying a permission request
 */
const denyRequestSchema = z.object({
  id: z.string().min(1, { message: 'Permission request ID is required' }),
  note: z.string().optional(),
});

/**
 * Type for tool executor functions
 * @param workspaceId - Optional workspace scope. If provided, resources are scoped to that workspace.
 *                      If undefined/null, operations are org-wide (global mode).
 * @param adminWorkspaceIds - Optional list of workspace IDs the admin has access to.
 *                            If undefined, admin is in org-wide mode (can access all workspaces).
 *                            If defined, admin can only operate on resources in these workspaces.
 */
export type ToolExecutor = (
  organizationId: string,
  adminUserId: string,
  input: unknown,
  workspaceId?: string,
  adminWorkspaceIds?: string[],
) => Promise<unknown>;

/**
 * Registry of tool executors.
 * Each key is a tool name (with 'admin_' prefix), and the value is the executor function.
 * These executors implement the actual business logic for confirmed write operations.
 *
 * @example
 * ```typescript
 * const executor = TOOL_EXECUTORS['admin_create_policy'];
 * const result = await executor(organizationId, userId, input);
 * ```
 */
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // ============================================================================
  // POLICY TOOLS
  // ============================================================================

  admin_create_policy: async (
    organizationId,
    adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(createPolicySchema, input);

    // Determine workspace scope early for validation
    const effectiveWorkspaceId =
      data.workspaceId !== undefined ? data.workspaceId : (workspaceId ?? null);

    // Validate workspace access before creating the resource
    validateWorkspaceAccess(effectiveWorkspaceId, adminWorkspaceIds);

    // Validate matchers format AND role existence
    const matchersResult = await validateMatchers(organizationId, data.matchers);
    if (!matchersResult.valid) {
      throw new Error(matchersResult.error);
    }

    // Validate tool patterns against registered servers
    const patternsResult = await validateToolPatterns(organizationId, data.toolPatterns);
    if (!patternsResult.valid) {
      throw new Error(patternsResult.error);
    }

    // Use validated patterns (which may have been normalized)
    const validatedPatterns = patternsResult.patterns;

    // Validate condition field paths against tool schemas
    if (data.conditions && Array.isArray(data.conditions) && data.conditions.length > 0) {
      const conditionsResult = await validateConditionFields(
        organizationId,
        data.conditions as PolicyCondition[],
        validatedPatterns,
      );
      if (!conditionsResult.valid) {
        throw new Error(conditionsResult.error);
      }
    }

    logger.info('Creating policy with validated patterns', {
      organizationId,
      originalPatterns: data.toolPatterns,
      validatedPatterns,
    });

    // effectiveWorkspaceId was already computed and validated above
    const policy = await prisma.policy.create({
      data: {
        organizationId,
        workspaceId: effectiveWorkspaceId, // Workspace-scoped or org-wide
        slug: data.slug || data.name || `policy-${Date.now()}`,
        effect: data.effect,
        matchers: data.matchers,
        toolPatterns: validatedPatterns,
        description: data.description,
        conditions: data.conditions ? toJsonValue(data.conditions) : undefined,
        enabled: true,
      },
    });

    // POST-EXECUTION VERIFICATION: Ensure the policy was created correctly
    const verification = await prisma.policy.findUnique({
      where: { id: policy.id },
    });

    if (!verification) {
      throw new Error(
        `Post-execution verification failed: Policy ${policy.id} was not found after creation`,
      );
    }

    // Verify critical fields match what we intended
    const toolPatternsMatch =
      JSON.stringify(verification.toolPatterns) === JSON.stringify(validatedPatterns);
    const matchersMatch = JSON.stringify(verification.matchers) === JSON.stringify(data.matchers);
    const effectMatch = verification.effect === data.effect;

    if (!toolPatternsMatch) {
      logger.error('Post-execution verification failed: toolPatterns mismatch', {
        policyId: policy.id,
        expected: validatedPatterns,
        actual: verification.toolPatterns,
      });
      // Delete the invalid policy
      await prisma.policy.delete({ where: { id: policy.id } });
      throw new Error(
        `Post-execution verification failed: toolPatterns were not saved correctly. ` +
          `Expected: ${JSON.stringify(validatedPatterns)}, Got: ${JSON.stringify(verification.toolPatterns)}`,
      );
    }

    if (!matchersMatch) {
      logger.error('Post-execution verification failed: matchers mismatch', {
        policyId: policy.id,
        expected: data.matchers,
        actual: verification.matchers,
      });
      await prisma.policy.delete({ where: { id: policy.id } });
      throw new Error(
        `Post-execution verification failed: matchers were not saved correctly. ` +
          `Expected: ${JSON.stringify(data.matchers)}, Got: ${JSON.stringify(verification.matchers)}`,
      );
    }

    if (!effectMatch) {
      logger.error('Post-execution verification failed: effect mismatch', {
        policyId: policy.id,
        expected: data.effect,
        actual: verification.effect,
      });
      await prisma.policy.delete({ where: { id: policy.id } });
      throw new Error(
        `Post-execution verification failed: effect was not saved correctly. ` +
          `Expected: ${data.effect}, Got: ${verification.effect}`,
      );
    }

    logger.info('Policy created and verified successfully', {
      policyId: policy.id,
      toolPatterns: verification.toolPatterns,
      matchers: verification.matchers,
      effect: verification.effect,
    });

    // If a requestId was provided, link the policy to the permission request and approve it
    if (data.requestId) {
      const request = await prisma.permissionRequest.findFirst({
        where: {
          id: data.requestId,
          user: { organizationId },
          status: 'PENDING',
        },
        include: {
          user: { select: { email: true } },
        },
      });

      if (request) {
        // Check if the granted policy differs from the original request
        const expectedMatcher = `user:${request.user.email}`;
        const requestedToolNames = [...request.toolNames].sort();
        const grantedToolPatterns = [...validatedPatterns].sort();

        // Check if matchers differ from expected (just the requesting user)
        const matchersModified = data.matchers.length !== 1 || data.matchers[0] !== expectedMatcher;

        // Check if tool patterns differ from requested tools
        const toolPatternsModified =
          requestedToolNames.length !== grantedToolPatterns.length ||
          requestedToolNames.some((tool, i) => tool !== grantedToolPatterns[i]);

        // Check if conditions were added (original requests never have conditions)
        const conditionsAdded =
          data.conditions !== null && data.conditions !== undefined && data.conditions.length > 0;

        const wasModified = matchersModified || toolPatternsModified || conditionsAdded;
        const finalStatus = wasModified ? 'MODIFIED' : 'APPROVED';

        // Build grantDiff for MODIFIED status
        const grantDiff = wasModified
          ? {
              matchers: { requested: [expectedMatcher], granted: data.matchers },
              toolPatterns: { requested: request.toolNames, granted: validatedPatterns },
              conditions: { requested: null, granted: data.conditions || null },
            }
          : null;

        await prisma.permissionRequest.update({
          where: { id: data.requestId },
          data: {
            status: finalStatus,
            linkedPolicyId: policy.id,
            reviewedBy: adminUserId,
            reviewedAt: new Date(),
            reviewNote: data.reviewNote,
            ...(grantDiff ? { grantDiff: toJsonValue(grantDiff) } : {}),
          },
        });

        logger.info('Permission request resolved and linked to policy', {
          requestId: data.requestId,
          policyId: policy.id,
          status: finalStatus,
          wasModified,
        });
      } else {
        logger.warn('Permission request not found or already processed', {
          requestId: data.requestId,
          organizationId,
        });
      }
    }

    return policy;
  },

  admin_update_policy: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(updatePolicySchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // Validate matchers format AND role existence if being updated
    if (data.matchers && data.matchers.length > 0) {
      const matchersResult = await validateMatchers(organizationId, data.matchers);
      if (!matchersResult.valid) {
        throw new Error(matchersResult.error);
      }
    }

    // Validate tool patterns against registered servers if being updated
    let validatedPatterns: string[] | undefined;
    if (data.toolPatterns && data.toolPatterns.length > 0) {
      const patternsResult = await validateToolPatterns(organizationId, data.toolPatterns);
      if (!patternsResult.valid) {
        throw new Error(patternsResult.error);
      }
      validatedPatterns = patternsResult.patterns;

      logger.info('Updating policy with validated patterns', {
        organizationId,
        policyId: data.id,
        originalPatterns: data.toolPatterns,
        validatedPatterns,
      });
    }

    // Validate condition field paths against tool schemas if conditions are being updated
    if (data.conditions && Array.isArray(data.conditions) && data.conditions.length > 0) {
      // Get tool patterns to validate against (use new ones if provided, else fetch existing)
      let patternsForValidation: string[] = validatedPatterns ?? [];
      if (patternsForValidation.length === 0) {
        const existingPolicy = await prisma.policy.findUnique({
          where: { id: data.id, organizationId },
          select: { toolPatterns: true },
        });
        patternsForValidation = existingPolicy?.toolPatterns ?? [];
      }

      if (patternsForValidation.length > 0) {
        const conditionsResult = await validateConditionFields(
          organizationId,
          data.conditions as PolicyCondition[],
          patternsForValidation,
        );
        if (!conditionsResult.valid) {
          throw new Error(conditionsResult.error);
        }
      }
    }

    // In workspace mode, can only update workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    const policy = await prisma.policy.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: {
        ...(data.slug && { slug: data.slug }),
        ...(data.effect && { effect: data.effect }),
        ...(data.matchers && { matchers: data.matchers }),
        ...(validatedPatterns && { toolPatterns: validatedPatterns }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.conditions !== undefined && {
          conditions: data.conditions ? toJsonValue(data.conditions) : Prisma.DbNull,
        }),
      },
    });

    // POST-EXECUTION VERIFICATION: Ensure the policy was updated correctly
    const verification = await prisma.policy.findUnique({
      where: { id: policy.id },
    });

    if (!verification) {
      throw new Error(
        `Post-execution verification failed: Policy ${policy.id} was not found after update`,
      );
    }

    // Verify critical fields that were updated
    if (validatedPatterns) {
      const toolPatternsMatch =
        JSON.stringify(verification.toolPatterns) === JSON.stringify(validatedPatterns);
      if (!toolPatternsMatch) {
        logger.error('Post-execution verification failed: toolPatterns mismatch on update', {
          policyId: policy.id,
          expected: validatedPatterns,
          actual: verification.toolPatterns,
        });
        throw new Error(
          `Post-execution verification failed: toolPatterns were not updated correctly. ` +
            `Expected: ${JSON.stringify(validatedPatterns)}, Got: ${JSON.stringify(verification.toolPatterns)}`,
        );
      }
    }

    if (data.matchers) {
      const matchersMatch = JSON.stringify(verification.matchers) === JSON.stringify(data.matchers);
      if (!matchersMatch) {
        logger.error('Post-execution verification failed: matchers mismatch on update', {
          policyId: policy.id,
          expected: data.matchers,
          actual: verification.matchers,
        });
        throw new Error(
          `Post-execution verification failed: matchers were not updated correctly. ` +
            `Expected: ${JSON.stringify(data.matchers)}, Got: ${JSON.stringify(verification.matchers)}`,
        );
      }
    }

    if (data.effect) {
      const effectMatch = verification.effect === data.effect;
      if (!effectMatch) {
        logger.error('Post-execution verification failed: effect mismatch on update', {
          policyId: policy.id,
          expected: data.effect,
          actual: verification.effect,
        });
        throw new Error(
          `Post-execution verification failed: effect was not updated correctly. ` +
            `Expected: ${data.effect}, Got: ${verification.effect}`,
        );
      }
    }

    logger.info('Policy updated and verified successfully', {
      policyId: policy.id,
      updatedFields: {
        toolPatterns: validatedPatterns ? 'updated' : 'unchanged',
        matchers: data.matchers ? 'updated' : 'unchanged',
        effect: data.effect ? 'updated' : 'unchanged',
      },
    });

    return policy;
  },

  admin_delete_policy: async (
    organizationId,
    adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(deletePolicySchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // In workspace mode, can only delete workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.policy.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: {
        deletedAt: new Date(),
        deletedBy: adminUserId,
      },
    });
  },

  admin_enable_policy: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(policyIdSchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // In workspace mode, can only enable workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.policy.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: { enabled: true },
    });
  },

  admin_disable_policy: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(policyIdSchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // In workspace mode, can only disable workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.policy.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: { enabled: false },
    });
  },

  // ============================================================================
  // USER TOOLS
  // ============================================================================

  admin_create_user: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(createUserSchema, input);

    const user = await prisma.user.create({
      data: {
        organizationId,
        email: data.email,
      },
    });

    // Assign roles if provided
    if (data.roleIds && data.roleIds.length > 0) {
      await prisma.userRole.createMany({
        data: data.roleIds.map((roleId) => ({
          userId: user.id,
          roleId,
        })),
      });
    }

    return prisma.user.findUnique({
      where: { id: user.id },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
  },

  admin_update_user: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(updateUserSchema, input);

    // Use transaction to ensure atomicity of email update and role changes
    await prisma.$transaction(async (tx) => {
      // Update user email if provided
      if (data.email) {
        await tx.user.update({
          where: { id: data.id, organizationId },
          data: { email: data.email },
        });
      }

      // Update roles if provided
      if (data.roleIds) {
        // Remove existing roles and add new ones atomically
        await tx.userRole.deleteMany({
          where: { userId: data.id },
        });

        await tx.userRole.createMany({
          data: data.roleIds.map((roleId) => ({
            userId: data.id,
            roleId,
          })),
        });
      }
    });

    return prisma.user.findUnique({
      where: { id: data.id },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
  },

  admin_delete_user: async (organizationId, adminUserId, input) => {
    const data = parseInputOrThrow(deleteUserSchema, input);

    return prisma.user.update({
      where: { id: data.id, organizationId },
      data: {
        deletedAt: new Date(),
        deletedBy: adminUserId,
      },
    });
  },

  admin_refresh_token: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(userIdSchema, input);
    const { randomUUID } = await import('crypto');

    return prisma.user.update({
      where: { id: data.id, organizationId },
      data: { accessToken: randomUUID() },
      select: { id: true, email: true, accessToken: true },
    });
  },

  admin_revoke_token: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(userIdSchema, input);
    const { randomUUID } = await import('crypto');

    // Revoke by generating a new token that the user doesn't have
    return prisma.user.update({
      where: { id: data.id, organizationId },
      data: { accessToken: randomUUID() },
      select: { id: true, email: true },
    });
  },

  // ============================================================================
  // ROLE TOOLS
  // ============================================================================

  admin_create_role: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(createRoleSchema, input);

    return prisma.role.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        isAdmin: data.isAdmin ?? false,
      },
    });
  },

  admin_update_role: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(updateRoleSchema, input);

    return prisma.role.update({
      where: { id: data.id, organizationId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isAdmin !== undefined && { isAdmin: data.isAdmin }),
      },
    });
  },

  admin_delete_role: async (organizationId, adminUserId, input) => {
    const data = parseInputOrThrow(deleteRoleSchema, input);

    return prisma.role.update({
      where: { id: data.id, organizationId },
      data: {
        deletedAt: new Date(),
        deletedBy: adminUserId,
      },
    });
  },

  // ============================================================================
  // MCP SERVER TOOLS
  // ============================================================================

  admin_create_mcp_server: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(createMcpServerSchema, input);

    // Determine effective workspace ID
    const effectiveWorkspaceId = data.workspaceId ?? workspaceId ?? null;

    // Validate workspace access before creating the resource
    validateWorkspaceAccess(effectiveWorkspaceId, adminWorkspaceIds);

    return prisma.mcpServer.create({
      data: {
        organizationId,
        workspaceId: effectiveWorkspaceId,
        name: data.name,
        url: data.url,
        authType: data.authType ?? 'NONE',
        trusted: data.trusted ?? false,
      },
    });
  },

  admin_update_mcp_server: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(updateMcpServerSchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // If updating workspaceId, also validate access to the target workspace
    if (data.workspaceId !== undefined) {
      validateWorkspaceAccess(data.workspaceId, adminWorkspaceIds);
    }

    // In workspace mode, can only update workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.mcpServer.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.url && { url: data.url }),
        ...(data.authType && { authType: data.authType }),
        ...(data.trusted !== undefined && { trusted: data.trusted }),
        ...(data.workspaceId !== undefined && { workspaceId: data.workspaceId }),
      },
    });
  },

  admin_delete_mcp_server: async (
    organizationId,
    adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(deleteMcpServerSchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // In workspace mode, can only delete workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.mcpServer.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: {
        deletedAt: new Date(),
        deletedBy: adminUserId,
      },
    });
  },

  admin_set_org_api_key: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(setOrgApiKeySchema, input);

    // Import encryption function dynamically to avoid circular dependencies
    const { encrypt } = await import('../lib/crypto.js');

    // Encrypt the API key before storage for security
    const encryptedApiKey = encrypt(data.apiKey);

    return prisma.mcpServer.update({
      where: { id: data.serverId, organizationId },
      data: { apiKey: encryptedApiKey },
      select: { id: true, name: true },
    });
  },

  // ============================================================================
  // AGENT TOOLS
  // ============================================================================

  admin_create_agent: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(createAgentSchema, input);

    // Validate workspace access before creating the resource
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    return prisma.agent.create({
      data: {
        organizationId,
        workspaceId: workspaceId ?? null, // Workspace-scoped or org-wide
        name: data.name,
        protocolType: data.protocolType ?? 'MCP',
        publicKeyUrl: data.publicKeyUrl,
      },
    });
  },

  admin_delete_agent: async (
    organizationId,
    adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(deleteAgentSchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // In workspace mode, can only delete workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.agent.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: {
        deletedAt: new Date(),
        deletedBy: adminUserId,
      },
    });
  },

  // ============================================================================
  // SENSITIVE FLAG TOOLS
  // ============================================================================

  admin_create_sensitive_flag: async (
    organizationId,
    adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(createSensitiveFlagSchema, input);

    // Validate workspace access before creating the resource
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    return prisma.sensitiveToolFlag.create({
      data: {
        organizationId,
        workspaceId: workspaceId ?? null, // Workspace-scoped or org-wide
        toolPattern: data.toolPattern,
        behaviors: data.behaviors,
        description: data.description,
        rateLimitConfig: data.rateLimitConfig,
        approvalConfig: data.approvalConfig,
        alertConfig: data.alertConfig,
        createdBy: adminUserId,
      },
    });
  },

  admin_update_sensitive_flag: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(updateSensitiveFlagSchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // In workspace mode, can only update workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.sensitiveToolFlag.update({
      where: { id: data.id, organizationId, ...workspaceFilter },
      data: {
        ...(data.behaviors && { behaviors: data.behaviors }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.rateLimitConfig !== undefined && { rateLimitConfig: data.rateLimitConfig }),
        ...(data.approvalConfig !== undefined && { approvalConfig: data.approvalConfig }),
        ...(data.alertConfig !== undefined && { alertConfig: data.alertConfig }),
      },
    });
  },

  admin_delete_sensitive_flag: async (
    organizationId,
    _adminUserId,
    input,
    workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(deleteSensitiveFlagSchema, input);

    // Validate workspace access for the session's workspace scope
    validateWorkspaceAccess(workspaceId, adminWorkspaceIds);

    // In workspace mode, can only delete workspace-specific or org-wide resources
    const workspaceFilter = workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {};

    return prisma.sensitiveToolFlag.delete({
      where: { id: data.id, organizationId, ...workspaceFilter },
    });
  },

  admin_approve_sensitive: async (organizationId, adminUserId, input) => {
    const data = parseInputOrThrow(approveSensitiveFlagSchema, input);

    const result = await prisma.sensitiveFlagApprovalRequest.updateMany({
      where: {
        id: data.id,
        organizationId,
        status: 'PENDING', // Only update if still PENDING to prevent race conditions
      },
      data: {
        status: 'APPROVED',
        approvedBy: adminUserId,
        approvedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new Error('Approval request not found or already processed');
    }

    return prisma.sensitiveFlagApprovalRequest.findUnique({
      where: { id: data.id },
    });
  },

  admin_deny_sensitive: async (organizationId, adminUserId, input) => {
    const data = parseInputOrThrow(denySensitiveFlagSchema, input);

    const result = await prisma.sensitiveFlagApprovalRequest.updateMany({
      where: {
        id: data.id,
        organizationId,
        status: 'PENDING', // Only update if still PENDING to prevent race conditions
      },
      data: {
        status: 'DENIED',
        approvedBy: adminUserId,
        approvedAt: new Date(),
        deniedReason: data.reason,
      },
    });

    if (result.count === 0) {
      throw new Error('Approval request not found or already processed');
    }

    return prisma.sensitiveFlagApprovalRequest.findUnique({
      where: { id: data.id },
    });
  },

  // ============================================================================
  // WEBHOOK TOOLS
  // ============================================================================

  admin_create_webhook: async (organizationId, adminUserId, input) => {
    const data = parseInputOrThrow(createWebhookSchema, input);

    return prisma.webhookEndpoint.create({
      data: {
        organizationId,
        name: data.name,
        type: data.type ?? 'CUSTOM',
        url: data.url,
        events: data.events,
        secret: data.secret,
        config: data.config ? toJsonValue(data.config) : undefined,
        createdBy: adminUserId,
      },
    });
  },

  admin_update_webhook: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(updateWebhookSchema, input);

    return prisma.webhookEndpoint.update({
      where: { id: data.id, organizationId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.events && { events: data.events }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.config !== undefined && { config: toJsonValue(data.config) }),
      },
    });
  },

  admin_delete_webhook: async (organizationId, _adminUserId, input) => {
    const data = parseInputOrThrow(deleteWebhookSchema, input);

    return prisma.webhookEndpoint.delete({
      where: { id: data.id, organizationId },
    });
  },

  // ============================================================================
  // PERMISSION REQUEST TOOLS
  // ============================================================================

  admin_approve_request: async (
    organizationId,
    adminUserId,
    input,
    _workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(approveRequestSchema, input);

    // First fetch the permission request to validate workspace access
    const request = await prisma.permissionRequest.findFirst({
      where: {
        id: data.id,
        user: { organizationId },
      },
      select: { id: true, workspaceId: true, status: true },
    });

    if (!request) {
      throw new Error('Permission request not found');
    }

    if (request.status !== 'PENDING') {
      throw new Error('Permission request already processed');
    }

    // Validate workspace access before approving
    validateWorkspaceAccess(request.workspaceId, adminWorkspaceIds);

    const result = await prisma.permissionRequest.updateMany({
      where: {
        id: data.id,
        user: { organizationId },
        status: 'PENDING', // Only update if still PENDING to prevent race conditions
      },
      data: {
        status: 'APPROVED',
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        reviewNote: data.note,
      },
    });

    if (result.count === 0) {
      throw new Error('Permission request not found or already processed');
    }

    return prisma.permissionRequest.findUnique({
      where: { id: data.id },
    });
  },

  admin_deny_request: async (
    organizationId,
    adminUserId,
    input,
    _workspaceId,
    adminWorkspaceIds,
  ) => {
    const data = parseInputOrThrow(denyRequestSchema, input);

    // First fetch the permission request to validate workspace access
    const request = await prisma.permissionRequest.findFirst({
      where: {
        id: data.id,
        user: { organizationId },
      },
      select: { id: true, workspaceId: true, status: true },
    });

    if (!request) {
      throw new Error('Permission request not found');
    }

    if (request.status !== 'PENDING') {
      throw new Error('Permission request already processed');
    }

    // Validate workspace access before denying
    validateWorkspaceAccess(request.workspaceId, adminWorkspaceIds);

    const result = await prisma.permissionRequest.updateMany({
      where: {
        id: data.id,
        user: { organizationId },
        status: 'PENDING', // Only update if still PENDING to prevent race conditions
      },
      data: {
        status: 'DENIED',
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        reviewNote: data.note,
      },
    });

    if (result.count === 0) {
      throw new Error('Permission request not found or already processed');
    }

    return prisma.permissionRequest.findUnique({
      where: { id: data.id },
    });
  },
};

/**
 * Confirmation type from the database
 */
interface AdminMcpConfirmation {
  id: string;
  organizationId: string;
  adminUserId: string;
  toolName: string;
  toolInput: unknown;
  mcpSessionId: string;
  workspaceId: string | null;
}

/**
 * Options for executing a confirmed action
 */
export interface ExecuteConfirmedActionOptions {
  /**
   * List of workspace IDs the admin has access to.
   * If undefined, admin is in org-wide mode (can access all workspaces).
   * If defined, admin can only operate on resources in these workspaces.
   */
  adminWorkspaceIds?: string[];
}

/**
 * Execute a confirmed admin MCP action.
 *
 * @param confirmation - The confirmation object from the database
 * @param options - Optional execution options including adminWorkspaceIds for validation
 */
export async function executeConfirmedAction(
  confirmation: AdminMcpConfirmation,
  options: ExecuteConfirmedActionOptions = {},
): Promise<unknown> {
  const executor = TOOL_EXECUTORS[confirmation.toolName];

  if (!executor) {
    throw new Error(`Unknown tool: ${confirmation.toolName}`);
  }

  logger.info('Executing confirmed admin MCP action', {
    confirmationId: confirmation.id,
    toolName: confirmation.toolName,
    organizationId: confirmation.organizationId,
    workspaceId: confirmation.workspaceId,
    hasWorkspaceRestrictions: options.adminWorkspaceIds !== undefined,
  });

  try {
    const result = await executor(
      confirmation.organizationId,
      confirmation.adminUserId,
      confirmation.toolInput,
      confirmation.workspaceId ?? undefined,
      options.adminWorkspaceIds,
    );

    logger.info('Admin MCP action executed successfully', {
      confirmationId: confirmation.id,
      toolName: confirmation.toolName,
    });

    return result;
  } catch (error) {
    logger.error('Admin MCP action failed', {
      confirmationId: confirmation.id,
      toolName: confirmation.toolName,
      error,
    });
    throw error;
  }
}

/**
 * Check if an executor exists for a tool.
 */
export function hasExecutor(toolName: string): boolean {
  return toolName in TOOL_EXECUTORS;
}
