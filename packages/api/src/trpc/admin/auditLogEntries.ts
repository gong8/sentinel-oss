/**
 * Admin Audit Log Entries Router
 * Handles audit log viewing operations
 */

import { AuditDecision, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { buildPdfExportResponse, getOrganizationOrThrow } from '../../lib/adminHelpers.js';
import { getAuditLogs } from '../../services/audit.js';
import {
  buildExportResponse,
  exportAuditLogsToCsv,
  exportAuditLogsToJson,
  type AuditLogExportEntry,
} from '../../services/export.js';
import type { AuditLogPdfEntry, McpServerInfo } from '../../services/pdf.js';
import { exportAuditLogToPdf } from '../../services/pdf.js';
import { adminProcedure, router } from '../init.js';

const listFiltersSchema = z.object({
  userId: z.string().cuid().optional(),
  agentId: z.string().cuid().optional(),
  toolName: z.string().optional(),
  decision: z.nativeEnum(AuditDecision).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  workspaceId: z
    .string()
    .cuid()
    .nullish()
    .transform((val) => val ?? undefined),
});

export const adminAuditLogEntriesRouter = router({
  /**
   * List audit log entries with filters
   */
  list: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getAuditLogs({
        organizationId: ctx.auth.organizationId,
        ...input,
      }),
    ),

  /**
   * Get a specific audit log entry
   * Validates workspace access: org owners can view all, workspace admins only their workspaces
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const entry = await prisma.auditLogEntry.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
        agent: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!entry) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Audit log entry not found',
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
        message: 'Audit log entry not found',
      });
    }

    return entry;
  }),

  /**
   * Export audit log entries as PDF
   * Returns base64-encoded PDF data
   */
  exportPdf: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(1000).optional().default(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [organization, result, mcpServers] = await Promise.all([
        getOrganizationOrThrow(ctx.auth.organizationId),
        getAuditLogs({
          organizationId: ctx.auth.organizationId,
          ...input,
          offset: 0,
        }),
        prisma.mcpServer.findMany({
          where: { organizationId: ctx.auth.organizationId, deletedAt: null },
          select: { id: true, name: true, url: true },
        }),
      ]);

      const mcpServerInfo: McpServerInfo[] = mcpServers.map((server) => ({
        id: server.id,
        name: server.name,
        url: server.url,
      }));

      const pdfEntries: AuditLogPdfEntry[] = result.entries.map((entry) => ({
        id: entry.id,
        toolName: entry.toolName,
        decision: entry.decision,
        justification: entry.justification,
        timestamp: entry.timestamp,
        userEmail: entry.userEmail ?? entry.user?.email ?? null,
        userRoles: entry.userRoles,
        agentName: entry.agentName ?? entry.agent?.name ?? null,
        mcpServerName: entry.mcpServerName ?? null,
      }));

      const pdfBuffer = await exportAuditLogToPdf(
        pdfEntries,
        organization.name,
        {
          startDate: input.startDate,
          endDate: input.endDate,
          decision: input.decision,
        },
        mcpServerInfo,
      );

      return buildPdfExportResponse(pdfBuffer, 'audit-log');
    }),

  /**
   * Export audit log entries as CSV
   * Returns base64-encoded CSV data
   */
  exportCsv: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(10000).optional().default(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await getAuditLogs({
        organizationId: ctx.auth.organizationId,
        ...input,
        offset: 0,
      });

      const exportEntries: AuditLogExportEntry[] = result.entries.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        toolName: entry.toolName,
        decision: entry.decision,
        justification: entry.justification,
        userEmail: entry.userEmail ?? entry.user?.email ?? null,
        userRoles: entry.userRoles,
        agentName: entry.agentName ?? entry.agent?.name ?? null,
        mcpServerName: entry.mcpServerName ?? null,
        policyIds: entry.policyIds,
      }));

      return buildExportResponse(exportAuditLogsToCsv(exportEntries));
    }),

  /**
   * Export audit log entries as JSON
   * Returns base64-encoded JSON data
   */
  exportJson: adminProcedure
    .input(
      listFiltersSchema.extend({
        limit: z.number().min(1).max(10000).optional().default(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await getAuditLogs({
        organizationId: ctx.auth.organizationId,
        ...input,
        offset: 0,
      });

      const exportEntries: AuditLogExportEntry[] = result.entries.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        toolName: entry.toolName,
        decision: entry.decision,
        justification: entry.justification,
        userEmail: entry.userEmail ?? entry.user?.email ?? null,
        userRoles: entry.userRoles,
        agentName: entry.agentName ?? entry.agent?.name ?? null,
        mcpServerName: entry.mcpServerName ?? null,
        policyIds: entry.policyIds,
      }));

      return buildExportResponse(exportAuditLogsToJson(exportEntries));
    }),
});
