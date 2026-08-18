/**
 * Admin Workspace OAuth Router
 * Allows workspace admins to manage workspace-level OAuth connections for MCP servers.
 * When an admin connects OAuth at workspace level, all users in the workspace inherit
 * that connection unless they have their own personal OAuth connection.
 */

import { AdminActionType, AdminResourceType, McpAuthType, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { initiateOAuthFlow, revokeAndDisconnectWorkspace } from '../../services/oauth.js';
import { adminProcedure, router } from '../init.js';

/**
 * Verify the user has admin access to the workspace
 */
async function verifyWorkspaceAdminAccess(
  organizationId: string,
  workspaceId: string,
  adminWorkspaceIds: string[],
  isOrgOwner: boolean,
): Promise<void> {
  // Org owners can access all workspaces
  if (isOrgOwner) return;

  // Check if user is admin of this workspace
  if (!adminWorkspaceIds.includes(workspaceId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have admin access to this workspace',
    });
  }
}

export const adminWorkspaceOAuthRouter = router({
  /**
   * Initiate workspace-level OAuth flow for an MCP server.
   * Creates PKCE challenge, stores state with workspaceId, returns authorization URL.
   */
  initiate: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        mcpServerId: z.string().cuid(),
        returnUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyWorkspaceAdminAccess(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.adminWorkspaceIds,
        ctx.auth.isOrgOwner,
      );

      // Verify server exists and belongs to org (and is accessible to workspace)
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
        },
        include: {
          oauthClientRegistration: true,
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      if (server.authType !== McpAuthType.OAUTH) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This MCP server does not use OAuth authentication',
        });
      }

      if (!server.oauthClientRegistration) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'OAuth client not registered for this MCP server',
        });
      }

      // Get workspace name for logging
      const workspace = await prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { name: true },
      });

      // Initiate OAuth flow with workspaceId
      const { authorizationUrl } = await initiateOAuthFlow(
        ctx.auth.organizationId,
        ctx.auth.user.id,
        input.mcpServerId,
        input.returnUrl,
        false, // isOrgLevel
        input.workspaceId,
      );

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OAUTH_FLOW_INITIATE,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: server.id,
        resourceName: server.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.OAUTH_FLOW_INITIATE),
          mcpServerId: server.id,
          mcpServerName: server.name,
          workspaceId: input.workspaceId,
          workspaceName: workspace?.name,
          isWorkspaceLevel: true,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { authorizationUrl };
    }),

  /**
   * Disconnect workspace-level OAuth for an MCP server.
   * This revokes the tokens and removes the connection.
   */
  disconnect: adminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        mcpServerId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyWorkspaceAdminAccess(
        ctx.auth.organizationId,
        input.workspaceId,
        ctx.auth.adminWorkspaceIds,
        ctx.auth.isOrgOwner,
      );

      // Verify server exists and belongs to org
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      // Get workspace name for logging
      const workspace = await prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { name: true },
      });

      await revokeAndDisconnectWorkspace(input.workspaceId, input.mcpServerId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.OAUTH_DISCONNECT,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: server.id,
        resourceName: server.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.OAUTH_DISCONNECT),
          mcpServerId: server.id,
          mcpServerName: server.name,
          workspaceId: input.workspaceId,
          workspaceName: workspace?.name,
          isWorkspaceLevel: true,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),
});
