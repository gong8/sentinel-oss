/**
 * Workspace Audit Logs Router
 * Admin-only endpoints for viewing workspace-scoped audit logs
 */

import { AuditDecision, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, workspaceAdminProcedure } from '../init.js';

// ============================================================================
// Schemas
// ============================================================================

const listAuditLogsInputSchema = z.object({
  workspaceId: z.string().cuid(),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: z.string().cuid().optional(),
  toolName: z.string().optional(),
  decision: z.nativeEnum(AuditDecision).optional(),
  userId: z.string().cuid().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

const getAuditLogInputSchema = z.object({
  workspaceId: z.string().cuid(),
  auditLogId: z.string().cuid(),
});

// ============================================================================
// Router Definition
// ============================================================================

export const adminWorkspaceAuditLogsRouter = router({
  /**
   * List audit logs for a workspace
   */
  list: workspaceAdminProcedure.input(listAuditLogsInputSchema).query(async ({ ctx, input }) => {
    const { workspaceId, limit, cursor, toolName, decision, userId, startDate, endDate } = input;
    const organizationId = ctx.auth.organizationId;

    // Verify workspace belongs to organization
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!workspace) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      });
    }

    // Build where clause
    const where: {
      organizationId: string;
      workspaceId: string;
      toolName?: { contains: string };
      decision?: AuditDecision;
      userId?: string;
      timestamp?: { gte?: Date; lte?: Date };
    } = {
      organizationId,
      workspaceId,
    };

    if (toolName) {
      where.toolName = { contains: toolName };
    }

    if (decision) {
      where.decision = decision;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.timestamp = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [total, rawEntries] = await Promise.all([
      prisma.auditLogEntry.count({ where }),
      prisma.auditLogEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
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
      }),
    ]);

    const hasMore = rawEntries.length > limit;
    const entries = hasMore ? rawEntries.slice(0, -1) : rawEntries;
    const nextCursor = hasMore ? entries[entries.length - 1]?.id : undefined;

    return {
      total,
      entries: entries.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        toolName: entry.toolName,
        toolNameDisplay: entry.toolNameDisplay,
        parameters: entry.parameters,
        decision: entry.decision,
        justification: entry.justification,
        userId: entry.userId,
        userEmail: entry.user?.email ?? entry.userEmail,
        agentId: entry.agentId,
        agentName: entry.agent?.name ?? entry.agentName,
        mcpServerName: entry.mcpServerName,
        policyIds: entry.policyIds,
        approvalRequired: entry.approvalRequired,
        approvalStatus: entry.approvalStatus,
      })),
      nextCursor,
    };
  }),

  /**
   * Get a specific audit log entry
   */
  get: workspaceAdminProcedure.input(getAuditLogInputSchema).query(async ({ ctx, input }) => {
    const { workspaceId, auditLogId } = input;
    const organizationId = ctx.auth.organizationId;

    // Verify workspace belongs to organization
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!workspace) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      });
    }

    const entry = await prisma.auditLogEntry.findFirst({
      where: {
        id: auditLogId,
        organizationId,
        workspaceId,
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

    return {
      id: entry.id,
      timestamp: entry.timestamp,
      toolName: entry.toolName,
      toolNameDisplay: entry.toolNameDisplay,
      parameters: entry.parameters,
      decision: entry.decision,
      justification: entry.justification,
      userId: entry.userId,
      userEmail: entry.user?.email ?? entry.userEmail,
      userRoles: entry.userRoles,
      agentId: entry.agentId,
      agentName: entry.agent?.name ?? entry.agentName,
      mcpServerName: entry.mcpServerName,
      policyIds: entry.policyIds,
      matchedPolicyIds: entry.matchedPolicyIds,
      policySnapshot: entry.policySnapshot,
      approvalRequired: entry.approvalRequired,
      approvalRequestId: entry.approvalRequestId,
      approvalStatus: entry.approvalStatus,
      approvalDecidedBy: entry.approvalDecidedBy,
      approvalDecidedByEmail: entry.approvalDecidedByEmail,
      approvalDecidedAt: entry.approvalDecidedAt,
      pipelineStage: entry.pipelineStage,
      evaluationTree: entry.evaluationTree,
    };
  }),

  /**
   * Get audit log statistics for the workspace
   */
  getStats: workspaceAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().cuid(),
        days: z.number().min(1).max(90).optional().default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, days } = input;
      const organizationId = ctx.auth.organizationId;

      // Verify workspace belongs to organization
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          organizationId,
          deletedAt: null,
        },
      });

      if (!workspace) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [totalCount, allowedCount, deniedCount, recentEntries] = await Promise.all([
        prisma.auditLogEntry.count({
          where: { organizationId, workspaceId, timestamp: { gte: startDate } },
        }),
        prisma.auditLogEntry.count({
          where: {
            organizationId,
            workspaceId,
            timestamp: { gte: startDate },
            decision: AuditDecision.ALLOWED,
          },
        }),
        prisma.auditLogEntry.count({
          where: {
            organizationId,
            workspaceId,
            timestamp: { gte: startDate },
            decision: AuditDecision.DENIED,
          },
        }),
        prisma.auditLogEntry.findMany({
          where: { organizationId, workspaceId, timestamp: { gte: startDate } },
          select: { toolName: true },
          take: 1000,
        }),
      ]);

      // Count tool usage
      const toolCounts: Record<string, number> = {};
      for (const entry of recentEntries) {
        toolCounts[entry.toolName] = (toolCounts[entry.toolName] ?? 0) + 1;
      }

      // Get top tools
      const topTools = Object.entries(toolCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      return {
        totalCount,
        allowedCount,
        deniedCount,
        topTools,
        period: { days, startDate },
      };
    }),
});
