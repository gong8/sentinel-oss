/**
 * User Workspaces Router
 * Handles workspace listing for regular users (non-admins)
 */

import { prisma } from '@sentinel/db';
import { z } from 'zod';
import { protectedProcedure, router } from '../init.js';

export const userWorkspacesRouter = router({
  /**
   * List workspaces the user has access to
   * - Org owners see all workspaces
   * - Regular users see workspaces they're members of
   */
  list: protectedProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { isOrgOwner, workspaceIds } = ctx.auth;

      if (isOrgOwner) {
        // Org owners see all workspaces (they have admin access to all)
        const workspaces = await prisma.workspace.findMany({
          where: {
            organizationId: ctx.auth.organizationId,
            ...(input?.includeDeleted ? {} : { deletedAt: null }),
          },
          include: {
            _count: {
              select: {
                members: true,
                policies: { where: { deletedAt: null } },
                mcpServers: { where: { deletedAt: null } },
                agents: { where: { deletedAt: null } },
              },
            },
          },
          orderBy: { name: 'asc' },
        });

        // Org owners always have admin access
        return workspaces.map((w) => ({
          ...w,
          userRole: 'ADMIN' as const,
        }));
      }

      // Regular users see workspaces they're members of
      const workspaces = await prisma.workspace.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          id: { in: workspaceIds },
          deletedAt: null,
        },
        include: {
          _count: {
            select: {
              members: true,
              policies: { where: { deletedAt: null } },
              mcpServers: { where: { deletedAt: null } },
              agents: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Add user's role in each workspace
      // User gets ADMIN role if:
      // - They are an org-level admin (isAdmin), OR
      // - They are a workspace admin for this specific workspace
      return workspaces.map((w) => ({
        ...w,
        userRole:
          ctx.auth.isAdmin || ctx.auth.adminWorkspaceIds.includes(w.id)
            ? ('ADMIN' as const)
            : ('MEMBER' as const),
      }));
    }),

  /**
   * Get a specific workspace by slug (for URL validation)
   */
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const workspace = await prisma.workspace.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          slug: input.slug,
          deletedAt: null,
        },
      });

      if (!workspace) {
        return null;
      }

      // Check access (org owners can see all, others need to be members)
      if (!ctx.auth.isOrgOwner && !ctx.auth.workspaceIds.includes(workspace.id)) {
        return null;
      }

      return workspace;
    }),
});
