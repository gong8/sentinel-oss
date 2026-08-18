/**
 * Admin Organization Settings Router
 * Handles organization-wide settings management
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { z } from 'zod';

import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { adminProcedure, router } from '../init.js';

export const adminOrgSettingsRouter = router({
  /**
   * Get organization settings (creates default if not exists)
   */
  get: adminProcedure.query(async ({ ctx }) => {
    let settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: ctx.auth.organizationId },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.organizationSettings.create({
        data: {
          organizationId: ctx.auth.organizationId,
        },
      });
    }

    return settings;
  }),

  /**
   * Update organization settings
   */
  update: adminProcedure
    .input(
      z.object({
        defaultTimezone: z.string().optional(),
        paramHistoryRetentionDays: z.number().min(1).max(365).optional(),
        auditLogRetentionDays: z.number().min(0).max(3650).optional(), // 0 = indefinite, max 10 years
        defaultConditionMode: z.enum(['SIMPLE', 'ADVANCED']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Capture before snapshot
      const beforeSettings = await prisma.organizationSettings.findUnique({
        where: { organizationId: ctx.auth.organizationId },
      });

      const settings = await prisma.organizationSettings.upsert({
        where: { organizationId: ctx.auth.organizationId },
        create: {
          organizationId: ctx.auth.organizationId,
          ...input,
        },
        update: input,
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ORGANIZATION_UPDATE,
        resourceType: AdminResourceType.ORGANIZATION,
        resourceId: ctx.auth.organizationId,
        resourceName: 'Organization Settings',
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.ORGANIZATION_UPDATE),
          changes: input,
        },
        beforeSnapshot: beforeSettings,
        afterSnapshot: settings,
        ...getRequestMetaFromTrpc(ctx),
      });

      return settings;
    }),
});
