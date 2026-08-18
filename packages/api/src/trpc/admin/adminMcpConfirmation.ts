/**
 * Admin MCP Confirmation Router
 *
 * Handles the confirmation workflow for admin MCP write operations.
 * Admins review and approve/reject pending operations from the dashboard.
 */

import {
  AdminActionSource,
  AdminActionType,
  AdminMcpConfirmationStatus,
  AdminResourceType,
} from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { isPlainObject } from '../../lib/isPlainObject.js';
import { toJsonValue } from '../../lib/jsonValue.js';

import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  confirmAction,
  expireOldConfirmations,
  getConfirmationById,
  getConfirmations,
  getPendingCount,
  markExecuted,
  markFailed,
  rejectAction,
} from '../../services/adminMcpConfirmation.js';
import { executeConfirmedAction } from '../../services/adminMcpExecutors.js';
import { getAdminWorkspaceIds } from '../../services/workspace.js';
import { adminProcedure, router } from '../init.js';

export const adminMcpConfirmationRouter = router({
  /**
   * List confirmations with optional filtering
   */
  list: adminProcedure
    .input(
      z.object({
        status: z.nativeEnum(AdminMcpConfirmationStatus).optional(),
        mcpSessionId: z.string().cuid().optional(),
        adminUserId: z.string().cuid().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { total, confirmations } = await getConfirmations(ctx.auth.organizationId, input);

      return {
        total,
        confirmations,
        hasMore: input.offset + confirmations.length < total,
      };
    }),

  /**
   * Get a single confirmation by ID
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const confirmation = await getConfirmationById(ctx.auth.organizationId, input.id);

    if (!confirmation) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Confirmation not found',
      });
    }

    return confirmation;
  }),

  /**
   * Get count of pending confirmations
   */
  pendingCount: adminProcedure.query(async ({ ctx }) => {
    return getPendingCount(ctx.auth.organizationId);
  }),

  /**
   * Confirm (approve) and execute an action
   */
  confirm: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // First confirm the action
      const { success, confirmation } = await confirmAction(
        ctx.auth.organizationId,
        input.id,
        ctx.auth.user.id,
      );

      if (!success || !confirmation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Confirmation not found, already processed, or expired',
        });
      }

      // Execute the confirmed action
      try {
        // Fetch the admin's workspace IDs to enforce workspace access at execution time
        const adminWorkspaceIds = await getAdminWorkspaceIds(
          ctx.auth.organizationId,
          confirmation.adminUserId,
        );

        const result = await executeConfirmedAction(confirmation, { adminWorkspaceIds });

        await markExecuted(ctx.auth.organizationId, confirmation.id, result);

        // Log the admin action with MCP source
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: confirmation.adminUserId,
          actionType: getActionTypeForTool(confirmation.toolName),
          resourceType: getResourceTypeForTool(confirmation.toolName),
          resourceId: getResourceIdFromResult(result),
          resourceName: getResourceNameFromResult(result, confirmation.toolName),
          actionDetails: {
            toolInput: confirmation.toolInput,
            executedAt: new Date().toISOString(),
          },
          beforeSnapshot: null,
          afterSnapshot: result !== null ? toJsonValue(result) : null,
          source: AdminActionSource.MCP_ADMIN,
          mcpSessionId: confirmation.mcpSessionId,
          mcpToolName: confirmation.toolName,
          confirmationId: confirmation.id,
          confirmedByUserId: ctx.auth.user.id,
          confirmedAt: new Date(),
          ...getRequestMetaFromTrpc(ctx),
        });

        return { success: true, result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await markFailed(ctx.auth.organizationId, confirmation.id, errorMessage);

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to execute action: ${errorMessage}`,
          cause: error,
        });
      }
    }),

  /**
   * Reject a pending action
   */
  reject: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get confirmation details before rejection for logging
      const confirmation = await getConfirmationById(ctx.auth.organizationId, input.id);

      const { success } = await rejectAction(
        ctx.auth.organizationId,
        input.id,
        ctx.auth.user.id,
        input.reason,
      );

      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Confirmation not found or already processed',
        });
      }

      // Log the rejection
      if (confirmation) {
        await logAdminAction({
          organizationId: ctx.auth.organizationId,
          adminUserId: ctx.auth.user.id,
          actionType: AdminActionType.MCP_CONFIRMATION_REJECT,
          resourceType: AdminResourceType.MCP_CONFIRMATION,
          resourceId: input.id,
          resourceName: confirmation.toolName,
          actionDetails: {
            toolName: confirmation.toolName,
            reason: input.reason,
            mcpSessionId: confirmation.mcpSessionId,
          },
          beforeSnapshot: {
            id: confirmation.id,
            status: confirmation.status,
            toolName: confirmation.toolName,
          },
          afterSnapshot: {
            id: confirmation.id,
            status: 'REJECTED',
          },
          source: AdminActionSource.UI,
          ...getRequestMetaFromTrpc(ctx),
        });
      }

      return { success: true };
    }),

  /**
   * Expire old confirmations (can be called periodically)
   */
  expireOld: adminProcedure.mutation(async ({ ctx }) => {
    const count = await expireOldConfirmations(ctx.auth.organizationId);
    return { expired: count };
  }),
});

/**
 * Map tool name to AdminActionType
 */
function getActionTypeForTool(toolName: string): AdminActionType {
  const mapping: Record<string, AdminActionType> = {
    // Policy tools
    admin_create_policy: AdminActionType.POLICY_CREATE,
    admin_update_policy: AdminActionType.POLICY_UPDATE,
    admin_delete_policy: AdminActionType.POLICY_DELETE,
    admin_enable_policy: AdminActionType.POLICY_ENABLE,
    admin_disable_policy: AdminActionType.POLICY_DISABLE,

    // User tools
    admin_create_user: AdminActionType.USER_CREATE,
    admin_update_user: AdminActionType.USER_UPDATE,
    admin_delete_user: AdminActionType.USER_DELETE,
    admin_refresh_token: AdminActionType.USER_TOKEN_REFRESH,
    admin_revoke_token: AdminActionType.USER_TOKEN_REVOKE,

    // Role tools
    admin_create_role: AdminActionType.ROLE_CREATE,
    admin_update_role: AdminActionType.ROLE_UPDATE,
    admin_delete_role: AdminActionType.ROLE_DELETE,

    // MCP Server tools
    admin_create_mcp_server: AdminActionType.MCP_SERVER_CREATE,
    admin_update_mcp_server: AdminActionType.MCP_SERVER_UPDATE,
    admin_delete_mcp_server: AdminActionType.MCP_SERVER_DELETE,
    admin_set_org_api_key: AdminActionType.MCP_SERVER_ORG_API_KEY_ADD,
    admin_register_oauth_client: AdminActionType.OAUTH_CLIENT_REGISTER,

    // Agent tools
    admin_create_agent: AdminActionType.AGENT_CREATE,
    admin_delete_agent: AdminActionType.AGENT_DELETE,

    // Sensitive flag tools
    admin_create_sensitive_flag: AdminActionType.SENSITIVE_FLAG_CREATE,
    admin_update_sensitive_flag: AdminActionType.SENSITIVE_FLAG_UPDATE,
    admin_delete_sensitive_flag: AdminActionType.SENSITIVE_FLAG_DELETE,
    admin_approve_sensitive: AdminActionType.SENSITIVE_APPROVAL_GRANTED,
    admin_deny_sensitive: AdminActionType.SENSITIVE_APPROVAL_DENIED,

    // Webhook tools
    admin_create_webhook: AdminActionType.WEBHOOK_ENDPOINT_CREATE,
    admin_update_webhook: AdminActionType.WEBHOOK_ENDPOINT_UPDATE,
    admin_delete_webhook: AdminActionType.WEBHOOK_ENDPOINT_DELETE,

    // Permission request tools
    admin_approve_request: AdminActionType.PERMISSION_REQUEST_APPROVE,
    admin_deny_request: AdminActionType.PERMISSION_REQUEST_DENY,
  };

  return mapping[toolName] ?? AdminActionType.ORGANIZATION_UPDATE;
}

/**
 * Map tool name to AdminResourceType
 */
function getResourceTypeForTool(toolName: string): AdminResourceType {
  if (toolName.includes('policy')) return AdminResourceType.POLICY;
  if (toolName.includes('user') || toolName.includes('token')) return AdminResourceType.USER;
  if (toolName.includes('role')) return AdminResourceType.ROLE;
  if (toolName.includes('mcp_server') || toolName.includes('oauth'))
    return AdminResourceType.MCP_SERVER;
  if (toolName.includes('agent')) return AdminResourceType.AGENT;
  if (toolName.includes('sensitive')) return AdminResourceType.SENSITIVE_FLAG;
  if (toolName.includes('webhook')) return AdminResourceType.WEBHOOK_ENDPOINT;
  if (toolName.includes('request')) return AdminResourceType.PERMISSION_REQUEST;
  return AdminResourceType.ORGANIZATION;
}

/**
 * Extract resource ID from execution result
 */
function getResourceIdFromResult(result: unknown): string | undefined {
  if (isPlainObject(result) && typeof result.id === 'string') {
    return result.id;
  }
  return undefined;
}

/**
 * Extract resource name from execution result
 */
function getResourceNameFromResult(result: unknown, toolName: string): string | undefined {
  if (isPlainObject(result)) {
    if (typeof result.name === 'string') return result.name;
    if (typeof result.slug === 'string') return result.slug;
    if (typeof result.email === 'string') return result.email;
  }
  return toolName;
}
