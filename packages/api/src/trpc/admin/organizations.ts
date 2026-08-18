/**
 * Admin Organizations Router
 * Handles organization management operations
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { z } from 'zod';
import { getActionDisplayName } from '../../lib/adminActionLabels.js';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import { adminProcedure, router } from '../init.js';

export const adminOrganizationsRouter = router({
  /**
   * Get the current organization
   */
  get: adminProcedure.query(async ({ ctx }) => {
    const organization = await prisma.organization.findUnique({
      where: {
        id: ctx.auth.organizationId,
      },
    });

    return organization;
  }),

  /**
   * Update organization
   */
  update: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Capture before snapshot
      const before = await prisma.organization.findUnique({
        where: { id: ctx.auth.organizationId },
      });

      const updated = await prisma.organization.update({
        where: { id: ctx.auth.organizationId },
        data: {
          name: input.name,
        },
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.ORGANIZATION_UPDATE,
        resourceType: AdminResourceType.ORGANIZATION,
        resourceId: updated.id,
        resourceName: updated.name,
        actionDetails: {
          actionDisplayName: getActionDisplayName(AdminActionType.ORGANIZATION_UPDATE),
          changes: input,
        },
        beforeSnapshot: before,
        afterSnapshot: updated,
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),
});
