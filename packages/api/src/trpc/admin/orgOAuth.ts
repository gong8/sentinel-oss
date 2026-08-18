/**
 * Admin Org OAuth Router
 * Allows admins to manage organization-level OAuth connections for MCP servers.
 * When an admin connects OAuth at org level, all users in the org inherit
 * that connection unless they have their own personal OAuth connection.
 */

import { AdminActionType, AdminResourceType, McpAuthType, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  getOrgOAuthStatus,
  initiateOAuthFlow,
  revokeAndDisconnectOrg,
} from '../../services/oauth.js';
import { adminProcedure, router } from '../init.js';

export const adminOrgOAuthRouter = router({
  /**
   * Initiate org-level OAuth flow for an MCP server.
   * Creates PKCE challenge, stores state with isOrgLevel=true, returns authorization URL.
   */
  initiate: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
        returnUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify server exists and belongs to org
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
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

      // Initiate OAuth flow with isOrgLevel=true
      const { authorizationUrl } = await initiateOAuthFlow(
        ctx.auth.organizationId,
        ctx.auth.user.id,
        input.mcpServerId,
        input.returnUrl,
        true, // isOrgLevel
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
          isOrgLevel: true,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { authorizationUrl };
    }),

  /**
   * Get org-level OAuth status for an MCP server.
   */
  getStatus: adminProcedure
    .input(z.object({ mcpServerId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
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

      return getOrgOAuthStatus(ctx.auth.organizationId, input.mcpServerId);
    }),

  /**
   * Disconnect org-level OAuth for an MCP server.
   * This revokes the tokens and removes the connection.
   */
  disconnect: adminProcedure
    .input(z.object({ mcpServerId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
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

      await revokeAndDisconnectOrg(ctx.auth.organizationId, input.mcpServerId);

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
          isOrgLevel: true,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),
});
