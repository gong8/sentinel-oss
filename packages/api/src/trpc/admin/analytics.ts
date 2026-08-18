/**
 * Admin Analytics Router
 * Provides analytics and insights for administrators
 */

import { z } from 'zod';
import {
  getAnalyticsSummary,
  getPeakUsageHours,
  getToolUsageTimeSeries,
  getTopAgents,
  getTopTools,
  getTopUsers,
} from '../../services/analytics.js';
import { adminProcedure, router } from '../init.js';

// Reusable schema components
const dateSchema = z.string().transform((val) => new Date(val));
const optionalDateSchema = dateSchema.optional();

const dateRangeSchema = z.object({
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
});

const topItemsInputSchema = dateRangeSchema.extend({
  limit: z.number().min(1).max(50).optional(),
});

export const adminAnalyticsRouter = router({
  toolUsageTimeSeries: adminProcedure
    .input(
      z.object({
        startDate: dateSchema,
        endDate: dateSchema,
        interval: z.enum(['hour', 'day']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getToolUsageTimeSeries(
        ctx.auth.organizationId,
        input.startDate,
        input.endDate,
        input.interval,
      );
    }),

  topUsers: adminProcedure.input(topItemsInputSchema).query(async ({ ctx, input }) => {
    return getTopUsers(ctx.auth.organizationId, input.limit, input.startDate, input.endDate);
  }),

  topAgents: adminProcedure.input(topItemsInputSchema).query(async ({ ctx, input }) => {
    return getTopAgents(ctx.auth.organizationId, input.limit, input.startDate, input.endDate);
  }),

  topTools: adminProcedure.input(topItemsInputSchema).query(async ({ ctx, input }) => {
    return getTopTools(ctx.auth.organizationId, input.limit, input.startDate, input.endDate);
  }),

  peakUsageHours: adminProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
    return getPeakUsageHours(ctx.auth.organizationId, input.startDate, input.endDate);
  }),

  summary: adminProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
    return getAnalyticsSummary(ctx.auth.organizationId, input.startDate, input.endDate);
  }),
});
