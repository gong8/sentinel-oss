/**
 * Admin Action Logs Router
 * Handles viewing of admin action logs
 */

import { AdminActionType, AdminResourceType, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { buildPdfExportResponse, getOrganizationOrThrow } from '../../lib/adminHelpers.js';
import {
  getAdminActionLogDetail,
  getAdminActionLogs,
  getResourceHistory,
} from '../../services/adminActionLog.js';
import {
  buildExportResponse,
  exportAdminActionLogsToCsv,
  exportAdminActionLogsToJson,
  type AdminActionLogExportEntry,
} from '../../services/export.js';
import type { AdminActionLogPdfEntry } from '../../services/pdf.js';
import { exportAdminActionLogToPdf } from '../../services/pdf.js';
import { adminProcedure, router } from '../init.js';

const listFiltersSchema = z.object({
  workspaceId: z.string().cuid().nullish(),
  adminUserId: z.string().cuid().optional(),
  actionType: z.nativeEnum(AdminActionType).optional(),
  resourceType: z.nativeEnum(AdminResourceType).optional(),
  resourceId: z.string().cuid().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

export const adminAdminActionLogsRouter = router({
  /**
   * List admin action logs with filters
   */
  list: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getAdminActionLogs({
        organizationId: ctx.auth.organizationId,
        ...input,
      }),
    ),

  /**
   * Get a specific admin action log entry (basic)
   * Validates workspace access: org owners can view all, workspace admins only their workspaces
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const entry = await prisma.adminActionLog.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!entry) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Admin action log entry not found',
      });
    }

    // Validate workspace access for workspace-scoped entries
    // Org owners can access all entries, workspace admins only their workspace entries
    if (
      entry.workspaceId &&
      !ctx.auth.isOrgOwner &&
      !ctx.auth.workspaceIds.includes(entry.workspaceId)
    ) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Admin action log entry not found',
      });
    }

    return entry;
  }),

  /**
   * Get detailed admin action log entry with related actions
   * Validates workspace access: org owners can view all, workspace admins only their workspaces
   */
  getDetail: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const result = await getAdminActionLogDetail(ctx.auth.organizationId, input.id);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Admin action log entry not found',
        });
      }

      // Validate workspace access for workspace-scoped entries
      // Org owners can access all entries, workspace admins only their workspace entries
      if (
        result.entry.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(result.entry.workspaceId)
      ) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Admin action log entry not found',
        });
      }

      return result;
    }),

  /**
   * Get the history of actions for a specific resource
   */
  getResourceHistory: adminProcedure
    .input(
      z.object({
        resourceType: z.nativeEnum(AdminResourceType),
        resourceId: z.string(),
        limit: z.number().min(1).max(100).optional().default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const history = await getResourceHistory(
        ctx.auth.organizationId,
        input.resourceType,
        input.resourceId,
        input.limit,
      );

      return { entries: history };
    }),

  /**
   * Export admin action logs as PDF
   * Returns base64-encoded PDF data
   */
  exportPdf: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(1000).optional().default(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organization = await getOrganizationOrThrow(ctx.auth.organizationId);

      const result = await getAdminActionLogs({
        organizationId: ctx.auth.organizationId,
        ...input,
        offset: 0,
      });

      const pdfEntries: AdminActionLogPdfEntry[] = result.entries.map((entry) => ({
        id: entry.id,
        actionType: entry.actionType,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        resourceName: entry.resourceName,
        reason: entry.reason,
        timestamp: entry.timestamp,
        adminEmail: entry.adminUser?.email ?? null,
        ipAddress: entry.ipAddress,
      }));

      const pdfBuffer = await exportAdminActionLogToPdf(pdfEntries, organization.name, {
        startDate: input.startDate,
        endDate: input.endDate,
        actionType: input.actionType,
        resourceType: input.resourceType,
      });

      return buildPdfExportResponse(pdfBuffer, 'admin-action-log');
    }),

  /**
   * Export admin action logs as CSV
   * Returns base64-encoded CSV data
   */
  exportCsv: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(10000).optional().default(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await getAdminActionLogs({
        organizationId: ctx.auth.organizationId,
        ...input,
        offset: 0,
      });

      const exportEntries: AdminActionLogExportEntry[] = result.entries.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        actionType: entry.actionType,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        resourceName: entry.resourceName,
        adminEmail: entry.adminUser?.email ?? null,
        reason: entry.reason,
        ipAddress: entry.ipAddress,
      }));

      return buildExportResponse(exportAdminActionLogsToCsv(exportEntries));
    }),

  /**
   * Export admin action logs as JSON
   * Returns base64-encoded JSON data
   */
  exportJson: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(10000).optional().default(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await getAdminActionLogs({
        organizationId: ctx.auth.organizationId,
        ...input,
        offset: 0,
      });

      const exportEntries: AdminActionLogExportEntry[] = result.entries.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        actionType: entry.actionType,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        resourceName: entry.resourceName,
        adminEmail: entry.adminUser?.email ?? null,
        reason: entry.reason,
        ipAddress: entry.ipAddress,
      }));

      return buildExportResponse(exportAdminActionLogsToJson(exportEntries));
    }),
});
