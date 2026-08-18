/**
 * Admin Tool Classifications Router
 * Handles tool classification management operations
 */

import {
  AdminActionType,
  AdminResourceType,
  ClassificationSource,
  prisma,
  ToolAccessType,
  ToolRiskLevel,
} from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  classifyUnclassifiedTools,
  getClassificationStatus,
  overrideClassification,
  reclassifyServerTools,
  resetToAutoClassification,
} from '../../services/toolClassification.js';
import { adminProcedure, router } from '../init.js';

export const adminToolClassificationsRouter = router({
  /**
   * Get classifications for all tools on a server
   */
  getByServer: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify server belongs to organization
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      // Get all tools with their classifications
      const tools = await prisma.mcpTool.findMany({
        where: { mcpServerId: input.mcpServerId },
        include: {
          classification: true,
        },
        orderBy: { name: 'asc' },
      });

      return {
        serverId: server.id,
        serverName: server.name,
        tools: tools.map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          classification: tool.classification
            ? {
                riskLevel: tool.classification.riskLevel,
                accessType: tool.classification.accessType,
                useCases: tool.classification.useCases,
                source: tool.classification.source,
                llmConfidence: tool.classification.llmConfidence,
                overriddenAt: tool.classification.overriddenAt,
                overriddenBy: tool.classification.overriddenBy,
                // Include original values if overridden
                originalRiskLevel: tool.classification.originalRiskLevel,
                originalAccessType: tool.classification.originalAccessType,
                originalUseCases: tool.classification.originalUseCases,
              }
            : null,
        })),
      };
    }),

  /**
   * Get classification for a single tool
   */
  getByTool: adminProcedure
    .input(
      z.object({
        toolId: z.string().cuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tool = await prisma.mcpTool.findFirst({
        where: {
          id: input.toolId,
          mcpServer: {
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
        },
        include: {
          classification: true,
          mcpServer: {
            select: { id: true, name: true },
          },
        },
      });

      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        });
      }

      return {
        toolId: tool.id,
        toolName: tool.name,
        toolDescription: tool.description,
        serverId: tool.mcpServer.id,
        serverName: tool.mcpServer.name,
        classification: tool.classification
          ? {
              riskLevel: tool.classification.riskLevel,
              accessType: tool.classification.accessType,
              useCases: tool.classification.useCases,
              source: tool.classification.source,
              llmConfidence: tool.classification.llmConfidence,
              overriddenAt: tool.classification.overriddenAt,
              overriddenBy: tool.classification.overriddenBy,
              originalRiskLevel: tool.classification.originalRiskLevel,
              originalAccessType: tool.classification.originalAccessType,
              originalUseCases: tool.classification.originalUseCases,
            }
          : null,
      };
    }),

  /**
   * Override a tool's classification
   */
  override: adminProcedure
    .input(
      z.object({
        toolId: z.string().cuid(),
        riskLevel: z.nativeEnum(ToolRiskLevel).optional(),
        accessType: z.nativeEnum(ToolAccessType).optional(),
        useCases: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify tool belongs to organization
      const tool = await prisma.mcpTool.findFirst({
        where: {
          id: input.toolId,
          mcpServer: {
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
        },
        include: {
          classification: true,
          mcpServer: {
            select: { id: true, name: true },
          },
        },
      });

      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        });
      }

      // Must provide at least one override value
      if (!input.riskLevel && !input.accessType && !input.useCases) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Must provide at least one field to override',
        });
      }

      const beforeSnapshot = tool.classification
        ? {
            riskLevel: tool.classification.riskLevel,
            accessType: tool.classification.accessType,
            useCases: tool.classification.useCases,
            source: tool.classification.source,
          }
        : null;

      await overrideClassification(input.toolId, ctx.auth.user.id, {
        riskLevel: input.riskLevel,
        accessType: input.accessType,
        useCases: input.useCases,
      });

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_UPDATE,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: tool.mcpServer.id,
        resourceName: `${tool.mcpServer.name}::${tool.name}`,
        actionDetails: {
          action: 'override_tool_classification',
          toolId: tool.id,
          toolName: tool.name,
          serverId: tool.mcpServer.id,
          serverName: tool.mcpServer.name,
          overrides: {
            riskLevel: input.riskLevel,
            accessType: input.accessType,
            useCases: input.useCases,
          },
        },
        beforeSnapshot,
        afterSnapshot: {
          riskLevel: input.riskLevel ?? beforeSnapshot?.riskLevel ?? null,
          accessType: input.accessType ?? beforeSnapshot?.accessType ?? null,
          useCases: input.useCases ?? beforeSnapshot?.useCases ?? null,
          source: ClassificationSource.USER_MANUAL,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Reset a tool's classification back to LLM-generated values
   */
  resetToAuto: adminProcedure
    .input(
      z.object({
        toolId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify tool belongs to organization
      const tool = await prisma.mcpTool.findFirst({
        where: {
          id: input.toolId,
          mcpServer: {
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
        },
        include: {
          classification: true,
          mcpServer: {
            select: { id: true, name: true },
          },
        },
      });

      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        });
      }

      if (!tool.classification || tool.classification.source === ClassificationSource.LLM_AUTO) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tool classification is already using auto classification',
        });
      }

      const beforeSnapshot = {
        riskLevel: tool.classification.riskLevel,
        accessType: tool.classification.accessType,
        useCases: tool.classification.useCases,
        source: tool.classification.source,
      };

      const success = await resetToAutoClassification(input.toolId);

      if (!success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset classification',
        });
      }

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_UPDATE,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: tool.mcpServer.id,
        resourceName: `${tool.mcpServer.name}::${tool.name}`,
        actionDetails: {
          action: 'reset_tool_classification',
          toolId: tool.id,
          toolName: tool.name,
          serverId: tool.mcpServer.id,
          serverName: tool.mcpServer.name,
        },
        beforeSnapshot,
        afterSnapshot: {
          riskLevel: tool.classification.originalRiskLevel,
          accessType: tool.classification.originalAccessType,
          useCases: tool.classification.originalUseCases,
          source: ClassificationSource.LLM_AUTO,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Re-run classification for all tools on a server
   */
  reclassify: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify server belongs to organization
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      const result = await reclassifyServerTools(input.mcpServerId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_DISCOVER_TOOLS,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: server.id,
        resourceName: server.name,
        actionDetails: {
          action: 'reclassify_tools',
          serverId: server.id,
          serverName: server.name,
          classified: result.classified,
          total: result.total,
          success: result.success,
          error: result.error,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Classification failed',
        });
      }

      return {
        success: true,
        classified: result.classified,
        total: result.total,
      };
    }),

  /**
   * Get all tool classifications for an organization
   */
  getAll: adminProcedure.query(async ({ ctx }) => {
    const tools = await prisma.mcpTool.findMany({
      where: {
        mcpServer: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      },
      include: {
        classification: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      tools: tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        classification: tool.classification
          ? {
              riskLevel: tool.classification.riskLevel,
              accessType: tool.classification.accessType,
              useCases: tool.classification.useCases,
              source: tool.classification.source,
              llmConfidence: tool.classification.llmConfidence,
              overriddenAt: tool.classification.overriddenAt,
              overriddenBy: tool.classification.overriddenBy,
              originalRiskLevel: tool.classification.originalRiskLevel,
              originalAccessType: tool.classification.originalAccessType,
              originalUseCases: tool.classification.originalUseCases,
            }
          : null,
      })),
    };
  }),

  /**
   * Get classification summary/stats for an organization
   */
  getSummary: adminProcedure.query(async ({ ctx }) => {
    // Get all tools with classifications for this org
    const tools = await prisma.mcpTool.findMany({
      where: {
        mcpServer: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      },
      include: {
        classification: {
          select: {
            riskLevel: true,
            accessType: true,
            source: true,
          },
        },
      },
    });

    const stats = {
      total: tools.length,
      classified: 0,
      unclassified: 0,
      byRiskLevel: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      },
      byAccessType: {
        READ: 0,
        WRITE: 0,
        READ_WRITE: 0,
      },
      bySource: {
        LLM_AUTO: 0,
        USER_MANUAL: 0,
      },
    };

    for (const tool of tools) {
      if (tool.classification) {
        stats.classified++;

        if (tool.classification.riskLevel) {
          stats.byRiskLevel[tool.classification.riskLevel]++;
        }

        if (tool.classification.accessType) {
          stats.byAccessType[tool.classification.accessType]++;
        }

        stats.bySource[tool.classification.source]++;
      } else {
        stats.unclassified++;
      }
    }

    return stats;
  }),

  /**
   * Get classification status for an MCP server
   */
  getStatus: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify server belongs to organization
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      return getClassificationStatus(input.mcpServerId);
    }),

  /**
   * Classify all unclassified tools for an MCP server
   */
  classifyUnclassified: adminProcedure
    .input(
      z.object({
        mcpServerId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify server belongs to organization
      const server = await prisma.mcpServer.findFirst({
        where: {
          id: input.mcpServerId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MCP server not found',
        });
      }

      const result = await classifyUnclassifiedTools(input.mcpServerId);

      // Log admin action
      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.MCP_SERVER_DISCOVER_TOOLS,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: server.id,
        resourceName: server.name,
        actionDetails: {
          action: 'classify_unclassified_tools',
          serverId: server.id,
          serverName: server.name,
          classified: result.classified,
          total: result.total,
          success: result.success,
          error: result.error,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Classification failed',
        });
      }

      return {
        success: true,
        classified: result.classified,
        total: result.total,
      };
    }),
});
