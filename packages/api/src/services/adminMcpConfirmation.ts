/**
 * Admin MCP Confirmation Service
 *
 * Manages confirmation workflow for admin MCP write operations.
 * All write operations require explicit confirmation from the dashboard.
 */

import { AdminMcpConfirmationStatus, prisma, type Prisma } from '@sentinel/db';
import { logger } from '../lib/logger.js';
import { ADMIN_USER_SELECT, USER_SELECT } from '../lib/prismaSelects.js';
import {
  AdminMcpScope,
  getToolRiskLevel,
  type AdminMcpRiskLevel,
  type CreateConfirmationResult,
} from '../types/adminMcp.js';
import { getAdminMcpSettings } from './adminMcpSettings.js';

export interface CreateConfirmationInput {
  organizationId: string;
  mcpSessionId: string;
  adminUserId: string;
  toolName: string;
  toolInput: unknown;
  scope: AdminMcpScope;
  workspaceId?: string | null;
}

/**
 * Generate a human-readable description for a tool operation.
 */
export function generateDescription(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'admin_create_policy': {
      const name = toolInput.name || toolInput.slug || 'unnamed';
      const effect = toolInput.effect || 'ALLOW';
      const matchers = Array.isArray(toolInput.matchers) ? toolInput.matchers.join(', ') : 'all';
      const patterns = Array.isArray(toolInput.toolPatterns)
        ? toolInput.toolPatterns.join(', ')
        : '*';
      return `Create ${effect} policy "${name}" for ${matchers} on ${patterns}`;
    }

    case 'admin_update_policy': {
      const id = toolInput.id || toolInput.policyId || 'unknown';
      return `Update policy ${id}`;
    }

    case 'admin_delete_policy': {
      const id = toolInput.id || toolInput.policyId || 'unknown';
      return `Delete policy ${id}`;
    }

    case 'admin_enable_policy': {
      const id = toolInput.id || toolInput.policyId || 'unknown';
      return `Enable policy ${id}`;
    }

    case 'admin_disable_policy': {
      const id = toolInput.id || toolInput.policyId || 'unknown';
      return `Disable policy ${id}`;
    }

    case 'admin_create_user': {
      const email = toolInput.email || 'unknown';
      return `Create user ${email}`;
    }

    case 'admin_update_user': {
      const id = toolInput.id || toolInput.userId || 'unknown';
      return `Update user ${id}`;
    }

    case 'admin_delete_user': {
      const id = toolInput.id || toolInput.userId || 'unknown';
      return `Delete user ${id}`;
    }

    case 'admin_refresh_token': {
      const id = toolInput.id || toolInput.userId || 'unknown';
      return `Refresh token for user ${id}`;
    }

    case 'admin_revoke_token': {
      const id = toolInput.id || toolInput.userId || 'unknown';
      return `Revoke token for user ${id}`;
    }

    case 'admin_create_role': {
      const name = toolInput.name || 'unnamed';
      return `Create role "${name}"`;
    }

    case 'admin_update_role': {
      const id = toolInput.id || toolInput.roleId || 'unknown';
      return `Update role ${id}`;
    }

    case 'admin_delete_role': {
      const id = toolInput.id || toolInput.roleId || 'unknown';
      return `Delete role ${id}`;
    }

    case 'admin_create_mcp_server': {
      const name = toolInput.name || 'unnamed';
      const url = toolInput.url || 'unknown';
      return `Register MCP server "${name}" at ${url}`;
    }

    case 'admin_update_mcp_server': {
      const id = toolInput.id || toolInput.serverId || 'unknown';
      return `Update MCP server ${id}`;
    }

    case 'admin_delete_mcp_server': {
      const id = toolInput.id || toolInput.serverId || 'unknown';
      return `Delete MCP server ${id}`;
    }

    case 'admin_set_org_api_key': {
      const serverId = toolInput.serverId || 'unknown';
      return `Set org-level API key for server ${serverId}`;
    }

    case 'admin_register_oauth_client': {
      const serverId = toolInput.serverId || 'unknown';
      return `Register OAuth client for server ${serverId}`;
    }

    case 'admin_create_agent': {
      const name = toolInput.name || 'unnamed';
      return `Register agent "${name}"`;
    }

    case 'admin_delete_agent': {
      const id = toolInput.id || toolInput.agentId || 'unknown';
      return `Delete agent ${id}`;
    }

    case 'admin_create_sensitive_flag': {
      const pattern = toolInput.toolPattern || '*';
      return `Create sensitive flag for ${pattern}`;
    }

    case 'admin_update_sensitive_flag': {
      const id = toolInput.id || toolInput.flagId || 'unknown';
      return `Update sensitive flag ${id}`;
    }

    case 'admin_delete_sensitive_flag': {
      const id = toolInput.id || toolInput.flagId || 'unknown';
      return `Delete sensitive flag ${id}`;
    }

    case 'admin_approve_sensitive':
    case 'admin_approve_request': {
      const id = toolInput.id || toolInput.requestId || 'unknown';
      return `Approve request ${id}`;
    }

    case 'admin_deny_sensitive':
    case 'admin_deny_request': {
      const id = toolInput.id || toolInput.requestId || 'unknown';
      return `Deny request ${id}`;
    }

    case 'admin_create_webhook': {
      const name = toolInput.name || 'unnamed';
      return `Create webhook "${name}"`;
    }

    case 'admin_update_webhook': {
      const id = toolInput.id || toolInput.webhookId || 'unknown';
      return `Update webhook ${id}`;
    }

    case 'admin_delete_webhook': {
      const id = toolInput.id || toolInput.webhookId || 'unknown';
      return `Delete webhook ${id}`;
    }

    default:
      return `Execute ${toolName}`;
  }
}

/**
 * Create a new confirmation for an admin MCP write operation.
 */
export async function createAdminMcpConfirmation(
  input: CreateConfirmationInput,
): Promise<CreateConfirmationResult> {
  const settings = await getAdminMcpSettings(input.organizationId);
  const description = generateDescription(
    input.toolName,
    input.toolInput as Record<string, unknown>,
  );
  const riskLevel = getToolRiskLevel(input.toolName);
  const expiresAt = new Date(Date.now() + settings.confirmationTtlSeconds * 1000);

  const confirmation = await prisma.adminMcpConfirmation.create({
    data: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      mcpSessionId: input.mcpSessionId,
      adminUserId: input.adminUserId,
      toolName: input.toolName,
      toolInput: input.toolInput as Prisma.InputJsonValue,
      scope: input.scope,
      description,
      riskLevel,
      expiresAt,
    },
  });

  logger.info('Created admin MCP confirmation', {
    confirmationId: confirmation.id,
    toolName: input.toolName,
    adminUserId: input.adminUserId,
    organizationId: input.organizationId,
  });

  return {
    confirmationId: confirmation.id,
    description: confirmation.description,
    riskLevel: confirmation.riskLevel as AdminMcpRiskLevel,
    expiresAt: confirmation.expiresAt,
  };
}

export interface GetConfirmationsOptions {
  status?: AdminMcpConfirmationStatus;
  mcpSessionId?: string;
  adminUserId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get confirmations for an organization with optional filtering.
 */
export async function getConfirmations(
  organizationId: string,
  options: GetConfirmationsOptions = {},
) {
  // Expire old confirmations first
  await expireOldConfirmations(organizationId);

  const where: Prisma.AdminMcpConfirmationWhereInput = {
    organizationId,
    ...(options.status && { status: options.status }),
    ...(options.mcpSessionId && { mcpSessionId: options.mcpSessionId }),
    ...(options.adminUserId && { adminUserId: options.adminUserId }),
  };

  const [total, confirmations] = await Promise.all([
    prisma.adminMcpConfirmation.count({ where }),
    prisma.adminMcpConfirmation.findMany({
      where,
      include: {
        adminUser: { select: ADMIN_USER_SELECT },
        confirmer: { select: USER_SELECT },
        rejecter: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
  ]);

  return { total, confirmations };
}

/**
 * Get a single confirmation by ID.
 */
export async function getConfirmationById(organizationId: string, confirmationId: string) {
  return prisma.adminMcpConfirmation.findFirst({
    where: {
      id: confirmationId,
      organizationId,
    },
    include: {
      adminUser: { select: ADMIN_USER_SELECT },
      confirmer: { select: USER_SELECT },
      rejecter: { select: USER_SELECT },
    },
  });
}

/**
 * Count pending confirmations for an organization.
 */
export async function getPendingCount(organizationId: string): Promise<number> {
  // Expire old confirmations first
  await expireOldConfirmations(organizationId);

  return prisma.adminMcpConfirmation.count({
    where: {
      organizationId,
      status: AdminMcpConfirmationStatus.PENDING,
    },
  });
}

/**
 * Confirm (approve) a pending confirmation.
 * This marks it as CONFIRMED but does not execute yet.
 */
export async function confirmAction(
  organizationId: string,
  confirmationId: string,
  confirmedBy: string,
): Promise<{ success: boolean; confirmation?: Awaited<ReturnType<typeof getConfirmationById>> }> {
  const confirmation = await prisma.adminMcpConfirmation.findFirst({
    where: {
      id: confirmationId,
      organizationId,
      status: AdminMcpConfirmationStatus.PENDING,
    },
  });

  if (!confirmation) {
    return { success: false };
  }

  // Check if expired
  if (confirmation.expiresAt < new Date()) {
    await prisma.adminMcpConfirmation.update({
      where: { id: confirmationId, organizationId },
      data: { status: AdminMcpConfirmationStatus.EXPIRED },
    });
    return { success: false };
  }

  // Mark as confirmed
  await prisma.adminMcpConfirmation.update({
    where: { id: confirmationId, organizationId },
    data: {
      status: AdminMcpConfirmationStatus.CONFIRMED,
      confirmedAt: new Date(),
      confirmedBy,
    },
  });

  logger.info('Admin MCP confirmation approved', {
    confirmationId,
    confirmedBy,
    toolName: confirmation.toolName,
  });

  const updated = await getConfirmationById(organizationId, confirmationId);
  return { success: true, confirmation: updated };
}

/**
 * Mark a confirmation as executed with result.
 */
export async function markExecuted(
  organizationId: string,
  confirmationId: string,
  result: unknown,
): Promise<void> {
  await prisma.adminMcpConfirmation.update({
    where: { id: confirmationId, organizationId },
    data: {
      status: AdminMcpConfirmationStatus.EXECUTED,
      executedAt: new Date(),
      result: result as Prisma.InputJsonValue,
    },
  });

  logger.info('Admin MCP confirmation executed', { confirmationId, organizationId });
}

/**
 * Mark a confirmation as failed.
 */
export async function markFailed(
  organizationId: string,
  confirmationId: string,
  error: string,
): Promise<void> {
  await prisma.adminMcpConfirmation.update({
    where: { id: confirmationId, organizationId },
    data: {
      status: AdminMcpConfirmationStatus.FAILED,
      error,
    },
  });

  logger.warn('Admin MCP confirmation failed', { confirmationId, organizationId, error });
}

/**
 * Reject a pending confirmation.
 */
export async function rejectAction(
  organizationId: string,
  confirmationId: string,
  rejectedBy: string,
  reason?: string,
): Promise<{ success: boolean }> {
  const confirmation = await prisma.adminMcpConfirmation.findFirst({
    where: {
      id: confirmationId,
      organizationId,
      status: AdminMcpConfirmationStatus.PENDING,
    },
  });

  if (!confirmation) {
    return { success: false };
  }

  await prisma.adminMcpConfirmation.update({
    where: { id: confirmationId, organizationId },
    data: {
      status: AdminMcpConfirmationStatus.REJECTED,
      rejectedAt: new Date(),
      rejectedBy,
      rejectionReason: reason,
    },
  });

  logger.info('Admin MCP confirmation rejected', {
    confirmationId,
    rejectedBy,
    reason,
    toolName: confirmation.toolName,
  });

  return { success: true };
}

/**
 * Expire old pending confirmations that have passed their TTL.
 */
export async function expireOldConfirmations(organizationId: string): Promise<number> {
  const result = await prisma.adminMcpConfirmation.updateMany({
    where: {
      organizationId,
      status: AdminMcpConfirmationStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: AdminMcpConfirmationStatus.EXPIRED,
    },
  });

  if (result.count > 0) {
    logger.info('Expired admin MCP confirmations', {
      organizationId,
      count: result.count,
    });
  }

  return result.count;
}

/**
 * Get confirmation status (for polling from MCP client).
 */
export async function getConfirmationStatus(
  organizationId: string,
  confirmationId: string,
): Promise<{
  status: AdminMcpConfirmationStatus;
  result?: unknown;
  error?: string;
} | null> {
  const confirmation = await prisma.adminMcpConfirmation.findFirst({
    where: {
      id: confirmationId,
      organizationId,
    },
    select: {
      status: true,
      result: true,
      error: true,
    },
  });

  if (!confirmation) {
    return null;
  }

  return {
    status: confirmation.status,
    result: confirmation.result ?? undefined,
    error: confirmation.error ?? undefined,
  };
}
