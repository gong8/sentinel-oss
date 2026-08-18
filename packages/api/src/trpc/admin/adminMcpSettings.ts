/**
 * Admin MCP Settings Router
 *
 * Handles organization-level settings for the Admin MCP Server feature.
 */

import { AdminActionType, AdminResourceType } from '@sentinel/db';
import { z } from 'zod';

import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { getAdminMcpSettings, updateAdminMcpSettings } from '../../services/adminMcpSettings.js';
import { AdminMcpScope, SCOPE_METADATA } from '../../types/adminMcp.js';
import { adminProcedure, router } from '../init.js';

export const adminMcpSettingsRouter = router({
  /**
   * Get admin MCP settings for the organization
   */
  get: adminProcedure.query(async ({ ctx }) => {
    const settings = await getAdminMcpSettings(ctx.auth.organizationId);
    return settings;
  }),

  /**
   * Update admin MCP settings
   */
  update: adminProcedure
    .input(
      z.object({
        enabled: z.boolean().optional(),
        enabledScopes: z.array(z.nativeEnum(AdminMcpScope)).max(20).optional(),
        allowedAdmins: z.array(z.string().cuid()).max(100).optional(),
        rateLimitPerMin: z.number().min(1).max(1000).optional(),
        confirmationTtlSeconds: z.number().min(60).max(3600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await getAdminMcpSettings(ctx.auth.organizationId);

      const updated = await updateAdminMcpSettings(ctx.auth.organizationId, input);

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ORGANIZATION_UPDATE,
        resourceType: AdminResourceType.ORGANIZATION,
        resourceId: ctx.auth.organizationId,
        resourceName: 'Admin MCP Settings',
        actionDetails: { updated: input },
        beforeSnapshot: { ...before },
        afterSnapshot: { ...updated },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Get available scopes with metadata
   */
  getScopes: adminProcedure.query(() => {
    return Object.entries(SCOPE_METADATA).map(([scope, metadata]) => ({
      scope: scope as AdminMcpScope,
      ...metadata,
      toolCount: metadata.readTools.length + metadata.writeTools.length,
    }));
  }),

  /**
   * Get list of admin users that can be added to allowedAdmins
   */
  getAdminUsers: adminProcedure.query(async ({ ctx }) => {
    const { prisma } = await import('@sentinel/db');

    // Get users who have admin roles
    const adminUsers = await prisma.user.findMany({
      where: {
        organizationId: ctx.auth.organizationId,
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              isAdmin: true,
              deletedAt: null,
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
      },
      orderBy: { email: 'asc' },
    });

    return adminUsers;
  }),
});
