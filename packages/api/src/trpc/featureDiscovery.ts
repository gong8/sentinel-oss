/**
 * Feature Discovery Router
 * Handles feature tips, milestones, and notification preferences
 */

import { prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import * as emailDigestService from '../services/emailDigest.js';
import * as featureDiscoveryService from '../services/featureDiscovery.js';
import * as milestonesService from '../services/milestones.js';
import { adminProcedure, protectedProcedure, router } from './init.js';

export const featureDiscoveryRouter = router({
  // === USER-LEVEL ENDPOINTS ===

  /**
   * Get tips for current user on current page
   */
  getTips: protectedProcedure
    .input(
      z.object({
        currentPath: z.string(),
        workspaceId: z.string().nullable().optional(),
        limit: z.number().min(1).max(10).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return featureDiscoveryService.getRelevantTips({
        orgId: ctx.auth.organizationId,
        workspaceId: input.workspaceId ?? null,
        userId: ctx.auth.user.id,
        currentPath: input.currentPath,
        limit: input.limit,
        userWorkspaceIds: ctx.auth.workspaceIds,
      });
    }),

  /**
   * Dismiss a tip
   */
  dismissTip: protectedProcedure
    .input(
      z.object({
        tipId: z.string(),
        dismissType: z.enum(['NOT_INTERESTED', 'REMIND_LATER']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await featureDiscoveryService.dismissTip({
        userId: ctx.auth.user.id,
        orgId: ctx.auth.organizationId,
        tipId: input.tipId,
        dismissType: input.dismissType,
      });
      return { success: true };
    }),

  /**
   * Get user's feature tips setting for a workspace
   */
  getUserSettings: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify workspace belongs to org
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: input.workspaceId,
          organizationId: ctx.auth.organizationId,
        },
      });
      if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      const settings = await prisma.userFeatureTipsSettings.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.auth.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });
      return { setting: settings?.setting ?? 'INHERIT' };
    }),

  /**
   * Update user's feature tips setting
   */
  updateUserSettings: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        setting: z.enum(['ON', 'OFF', 'INHERIT']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify workspace belongs to org
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: input.workspaceId,
          organizationId: ctx.auth.organizationId,
        },
      });
      if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
      }

      const settings = await prisma.userFeatureTipsSettings.upsert({
        where: {
          userId_workspaceId: {
            userId: ctx.auth.user.id,
            workspaceId: input.workspaceId,
          },
        },
        create: {
          userId: ctx.auth.user.id,
          workspaceId: input.workspaceId,
          setting: input.setting,
        },
        update: {
          setting: input.setting,
        },
      });
      return settings;
    }),

  /**
   * Get milestone preferences
   */
  getMilestonePreferences: protectedProcedure.query(async ({ ctx }) => {
    return milestonesService.getMilestonePreferences(ctx.auth.user.id, ctx.auth.organizationId);
  }),

  /**
   * Update milestone preferences
   */
  updateMilestonePreferences: protectedProcedure
    .input(
      z.object({
        toastEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await milestonesService.updateMilestonePreferences({
        userId: ctx.auth.user.id,
        orgId: ctx.auth.organizationId,
        ...input,
      });
      return { success: true };
    }),

  /**
   * Get achieved milestones
   */
  getAchievedMilestones: protectedProcedure.query(async ({ ctx }) => {
    return milestonesService.getAchievedMilestones(ctx.auth.organizationId);
  }),

  /**
   * Get email digest preference
   */
  getDigestPreference: protectedProcedure.query(async ({ ctx }) => {
    const enabled = await emailDigestService.getDigestPreference(
      ctx.auth.user.id,
      ctx.auth.organizationId,
    );
    return { enabled };
  }),

  /**
   * Update email digest preference
   */
  updateDigestPreference: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await emailDigestService.updateDigestPreference(
        ctx.auth.user.id,
        ctx.auth.organizationId,
        input.enabled,
      );
      return { success: true };
    }),

  // === ADMIN-LEVEL ENDPOINTS ===

  admin: router({
    /**
     * Get org-level feature tips settings
     */
    getOrgSettings: adminProcedure.query(async ({ ctx }) => {
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: ctx.auth.organizationId },
        select: {
          featureTipsEnabled: true,
          monthlyDigestEnabled: true,
        },
      });
      return settings ?? { featureTipsEnabled: true, monthlyDigestEnabled: true };
    }),

    /**
     * Update org-level feature tips settings
     */
    updateOrgSettings: adminProcedure
      .input(
        z.object({
          featureTipsEnabled: z.boolean().optional(),
          monthlyDigestEnabled: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const settings = await prisma.organizationSettings.upsert({
          where: { organizationId: ctx.auth.organizationId },
          create: {
            organizationId: ctx.auth.organizationId,
            ...input,
          },
          update: input,
        });
        return settings;
      }),

    /**
     * Get tip overrides for org
     */
    getTipOverrides: adminProcedure.query(async ({ ctx }) => {
      const overrides = await prisma.featureTipOrgOverride.findMany({
        where: { organizationId: ctx.auth.organizationId },
      });
      return overrides;
    }),

    /**
     * Update tip override
     */
    updateTipOverride: adminProcedure
      .input(
        z.object({
          tipId: z.string(),
          enabled: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const override = await prisma.featureTipOrgOverride.upsert({
          where: {
            organizationId_tipId: {
              organizationId: ctx.auth.organizationId,
              tipId: input.tipId,
            },
          },
          create: {
            organizationId: ctx.auth.organizationId,
            tipId: input.tipId,
            enabled: input.enabled,
          },
          update: {
            enabled: input.enabled,
          },
        });
        return override;
      }),

    /**
     * Get workspace feature tips settings
     */
    getWorkspaceSettings: adminProcedure
      .input(
        z.object({
          workspaceId: z.string(),
        }),
      )
      .query(async ({ ctx, input }) => {
        // Verify workspace belongs to org
        const workspace = await prisma.workspace.findFirst({
          where: {
            id: input.workspaceId,
            organizationId: ctx.auth.organizationId,
          },
        });
        if (!workspace) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
        }

        const settings = await prisma.workspaceFeatureTipsSettings.findUnique({
          where: { workspaceId: input.workspaceId },
        });
        return { setting: settings?.setting ?? 'INHERIT' };
      }),

    /**
     * Update workspace feature tips settings
     */
    updateWorkspaceSettings: adminProcedure
      .input(
        z.object({
          workspaceId: z.string(),
          setting: z.enum(['ON', 'OFF', 'INHERIT']),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Verify workspace belongs to org
        const workspace = await prisma.workspace.findFirst({
          where: {
            id: input.workspaceId,
            organizationId: ctx.auth.organizationId,
          },
        });
        if (!workspace) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
        }

        const settings = await prisma.workspaceFeatureTipsSettings.upsert({
          where: { workspaceId: input.workspaceId },
          create: {
            workspaceId: input.workspaceId,
            setting: input.setting,
          },
          update: {
            setting: input.setting,
          },
        });
        return settings;
      }),

    /**
     * Get digest history
     */
    getDigestHistory: adminProcedure
      .input(
        z
          .object({
            limit: z.number().min(1).max(50).optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        return emailDigestService.getDigestHistory(ctx.auth.organizationId, input?.limit);
      }),

    /**
     * Manually trigger digest (for testing)
     */
    triggerDigest: adminProcedure.mutation(async ({ ctx }) => {
      const { stats, featureSpotlight } = await emailDigestService.generateMonthlyDigest(
        ctx.auth.organizationId,
      );
      return { stats, featureSpotlight };
    }),

    /**
     * Get current metric counts (for milestone preview)
     */
    getMetricCounts: adminProcedure.query(async ({ ctx }) => {
      return milestonesService.getCurrentMetricCounts(ctx.auth.organizationId);
    }),
  }),
});
