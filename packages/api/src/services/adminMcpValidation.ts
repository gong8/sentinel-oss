/**
 * Admin MCP Pre-validation Service
 *
 * Validates business rules BEFORE creating a confirmation.
 * This catches errors like duplicate slugs early, rather than after approval.
 */

import { prisma } from '@sentinel/db';
import {
  createEntityExistsValidator,
  createUniqueFieldValidator,
} from '../lib/entityValidators.js';
import { isPlainObject } from '../lib/isPlainObject.js';
import { logger } from '../lib/logger.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Entity existence validators created via factory
const validatePolicyExists = createEntityExistsValidator({
  entityName: 'Policy',
  modelName: 'Policy',
  idFields: ['id', 'policyId'],
});

const validateUserExists = createEntityExistsValidator({
  entityName: 'User',
  modelName: 'User',
  idFields: ['id', 'userId'],
});

const validateRoleExists = createEntityExistsValidator({
  entityName: 'Role',
  modelName: 'Role',
  idFields: ['id', 'roleId'],
});

const validateMcpServerExists = createEntityExistsValidator({
  entityName: 'MCP server',
  modelName: 'McpServer',
  idFields: ['id', 'serverId'],
});

const validateAgentExists = createEntityExistsValidator({
  entityName: 'Agent',
  modelName: 'Agent',
  idFields: ['id', 'agentId'],
});

const validateWebhookExists = createEntityExistsValidator({
  entityName: 'Webhook',
  modelName: 'WebhookEndpoint',
  idFields: ['id', 'webhookId'],
  softDeleteFilter: false,
});

const validateSensitiveFlagExists = createEntityExistsValidator({
  entityName: 'Sensitive flag',
  modelName: 'SensitiveToolFlag',
  idFields: ['id', 'flagId'],
  softDeleteFilter: false,
});

// Unique field validators for create operations
const validatePolicySlugUnique = createUniqueFieldValidator({
  entityName: 'Policy',
  modelName: 'Policy',
  uniqueField: 'slug',
});

const validateUserEmailUnique = createUniqueFieldValidator({
  entityName: 'User',
  modelName: 'User',
  uniqueField: 'email',
});

const validateRoleNameUnique = createUniqueFieldValidator({
  entityName: 'Role',
  modelName: 'Role',
  uniqueField: 'name',
});

const validateMcpServerNameUnique = createUniqueFieldValidator({
  entityName: 'MCP server',
  modelName: 'McpServer',
  uniqueField: 'name',
});

const validateAgentNameUnique = createUniqueFieldValidator({
  entityName: 'Agent',
  modelName: 'Agent',
  uniqueField: 'name',
});

const validateWebhookNameUnique = createUniqueFieldValidator({
  entityName: 'Webhook',
  modelName: 'WebhookEndpoint',
  uniqueField: 'name',
  softDeleteFilter: false,
});

const validateSensitiveFlagToolPatternUnique = createUniqueFieldValidator({
  entityName: 'Sensitive flag',
  modelName: 'SensitiveToolFlag',
  uniqueField: 'toolPattern',
  softDeleteFilter: false,
});

/**
 * Extracts an ID from input, trying multiple possible key names.
 * Returns the first non-empty string value found, or null if none match.
 */
function extractId(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * Validate admin MCP tool input before creating a confirmation.
 * Returns an error if business rules would prevent execution.
 */
export async function validateAdminMcpInput(
  organizationId: string,
  toolName: string,
  toolInput: unknown,
): Promise<ValidationResult> {
  const input = isPlainObject(toolInput) ? toolInput : {};

  try {
    switch (toolName) {
      // Policy validations
      case 'admin_create_policy':
        return await validateCreatePolicy(organizationId, input);
      case 'admin_update_policy':
        return await validateUpdatePolicy(organizationId, input);
      case 'admin_delete_policy':
      case 'admin_enable_policy':
      case 'admin_disable_policy':
        return await validatePolicyExists(organizationId, input);

      // User validations
      case 'admin_create_user':
        return await validateCreateUser(organizationId, input);
      case 'admin_update_user':
      case 'admin_delete_user':
      case 'admin_refresh_token':
      case 'admin_revoke_token':
        return await validateUserExists(organizationId, input);

      // Role validations
      case 'admin_create_role':
        return await validateCreateRole(organizationId, input);
      case 'admin_update_role':
        return await validateUpdateRole(organizationId, input);
      case 'admin_delete_role':
        return await validateRoleExists(organizationId, input);

      // MCP Server validations
      case 'admin_create_mcp_server':
        return await validateCreateMcpServer(organizationId, input);
      case 'admin_update_mcp_server':
      case 'admin_delete_mcp_server':
      case 'admin_set_org_api_key':
      case 'admin_register_oauth_client':
        return await validateMcpServerExists(organizationId, input);

      // Agent validations
      case 'admin_create_agent':
        return await validateCreateAgent(organizationId, input);
      case 'admin_delete_agent':
        return await validateAgentExists(organizationId, input);

      // Webhook validations
      case 'admin_create_webhook':
        return await validateCreateWebhook(organizationId, input);
      case 'admin_update_webhook':
        return await validateUpdateWebhook(organizationId, input);
      case 'admin_delete_webhook':
        return await validateWebhookExists(organizationId, input);

      // Sensitive flag validations
      case 'admin_create_sensitive_flag':
        return await validateCreateSensitiveFlag(organizationId, input);
      case 'admin_update_sensitive_flag':
      case 'admin_delete_sensitive_flag':
        return await validateSensitiveFlagExists(organizationId, input);

      // Approval/denial validations
      case 'admin_approve_sensitive':
      case 'admin_deny_sensitive':
        return await validateSensitiveApprovalRequestExists(organizationId, input);
      case 'admin_approve_request':
      case 'admin_deny_request':
        return await validatePermissionRequestExists(organizationId, input);

      default:
        // Unknown tools pass validation - let execution handle errors
        return { valid: true };
    }
  } catch (error) {
    logger.error('Error validating admin MCP input', {
      toolName,
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // On validation error, let it through - execution will handle the actual error
    return { valid: true };
  }
}

// ============================================================================
// POLICY VALIDATIONS
// ============================================================================

async function validateCreatePolicy(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const slug = typeof input.slug === 'string' ? input.slug : null;

  if (!slug) {
    return { valid: false, error: 'Policy slug is required' };
  }

  return validatePolicySlugUnique(organizationId, slug);
}

async function validateUpdatePolicy(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const policyId = extractId(input, 'id', 'policyId');
  if (!policyId) {
    return { valid: false, error: 'Policy ID is required' };
  }

  // Check policy exists
  const policy = await prisma.policy.findFirst({
    where: {
      id: policyId,
      organizationId,
      deletedAt: null,
    },
    select: { id: true, slug: true },
  });

  if (!policy) {
    return { valid: false, error: `Policy "${policyId}" not found` };
  }

  // If slug is being updated, check uniqueness
  const newSlug = typeof input.slug === 'string' ? input.slug : null;
  if (newSlug && newSlug !== policy.slug) {
    return validatePolicySlugUnique(organizationId, newSlug, policyId);
  }

  return { valid: true };
}

// ============================================================================
// USER VALIDATIONS
// ============================================================================

async function validateCreateUser(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const email = typeof input.email === 'string' ? input.email : null;

  if (!email) {
    return { valid: false, error: 'User email is required' };
  }

  return validateUserEmailUnique(organizationId, email);
}

// ============================================================================
// ROLE VALIDATIONS
// ============================================================================

async function validateCreateRole(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const name = typeof input.name === 'string' ? input.name : null;

  if (!name) {
    return { valid: false, error: 'Role name is required' };
  }

  return validateRoleNameUnique(organizationId, name);
}

async function validateUpdateRole(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const roleId = extractId(input, 'id', 'roleId');
  if (!roleId) {
    return { valid: false, error: 'Role ID is required' };
  }

  // Check role exists
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      organizationId,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

  if (!role) {
    return { valid: false, error: `Role "${roleId}" not found` };
  }

  // If name is being updated, check uniqueness
  const newName = typeof input.name === 'string' ? input.name : null;
  if (newName && newName !== role.name) {
    return validateRoleNameUnique(organizationId, newName, roleId);
  }

  return { valid: true };
}

// ============================================================================
// MCP SERVER VALIDATIONS
// ============================================================================

async function validateCreateMcpServer(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const name = typeof input.name === 'string' ? input.name : null;

  if (!name) {
    return { valid: false, error: 'MCP server name is required' };
  }

  return validateMcpServerNameUnique(organizationId, name);
}

// ============================================================================
// AGENT VALIDATIONS
// ============================================================================

async function validateCreateAgent(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const name = typeof input.name === 'string' ? input.name : null;

  if (!name) {
    return { valid: false, error: 'Agent name is required' };
  }

  return validateAgentNameUnique(organizationId, name);
}

// ============================================================================
// WEBHOOK VALIDATIONS
// ============================================================================

async function validateCreateWebhook(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const name = typeof input.name === 'string' ? input.name : null;

  if (!name) {
    return { valid: false, error: 'Webhook name is required' };
  }

  return validateWebhookNameUnique(organizationId, name);
}

async function validateUpdateWebhook(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const webhookId = extractId(input, 'id', 'webhookId');
  if (!webhookId) {
    return { valid: false, error: 'Webhook ID is required' };
  }

  // Check webhook exists
  const webhook = await prisma.webhookEndpoint.findFirst({
    where: {
      id: webhookId,
      organizationId,
    },
    select: { id: true, name: true },
  });

  if (!webhook) {
    return { valid: false, error: `Webhook "${webhookId}" not found` };
  }

  // If name is being updated, check uniqueness
  const newName = typeof input.name === 'string' ? input.name : null;
  if (newName && newName !== webhook.name) {
    return validateWebhookNameUnique(organizationId, newName, webhookId);
  }

  return { valid: true };
}

// ============================================================================
// SENSITIVE FLAG VALIDATIONS
// ============================================================================

async function validateCreateSensitiveFlag(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const toolPattern = typeof input.toolPattern === 'string' ? input.toolPattern : null;

  if (!toolPattern) {
    return { valid: false, error: 'Tool pattern is required for sensitive flag' };
  }

  return validateSensitiveFlagToolPatternUnique(organizationId, toolPattern);
}

// ============================================================================
// APPROVAL REQUEST VALIDATIONS
// ============================================================================

async function validateSensitiveApprovalRequestExists(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const requestId = extractId(input, 'id', 'requestId');

  if (!requestId) {
    return { valid: false, error: 'Approval request ID is required' };
  }

  const request = await prisma.sensitiveFlagApprovalRequest.findFirst({
    where: {
      id: requestId,
      organizationId,
      status: 'PENDING',
    },
    select: { id: true },
  });

  if (!request) {
    return { valid: false, error: `Pending approval request "${requestId}" not found` };
  }

  return { valid: true };
}

async function validatePermissionRequestExists(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ValidationResult> {
  const requestId = extractId(input, 'id', 'requestId');

  if (!requestId) {
    return { valid: false, error: 'Permission request ID is required' };
  }

  // PermissionRequest doesn't have organizationId directly - it's through user relation
  const request = await prisma.permissionRequest.findFirst({
    where: {
      id: requestId,
      user: {
        organizationId,
      },
      status: 'PENDING',
    },
    select: { id: true },
  });

  if (!request) {
    return { valid: false, error: `Pending permission request "${requestId}" not found` };
  }

  return { valid: true };
}
