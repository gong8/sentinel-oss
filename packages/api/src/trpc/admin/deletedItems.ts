/**
 * Admin Deleted Items Router
 * Handles listing and restoring deleted items across all entity types
 */

import { prisma, type Prisma } from '@sentinel/db';
import { z } from 'zod';
import { adminProcedure, router } from '../init.js';

export type EntityType = 'user' | 'role' | 'agent' | 'mcpServer' | 'policy';

export interface DeletedItem {
  type: EntityType;
  id: string;
  name: string;
  deletedAt: Date;
  deletedBy: string | null;
  deletedByEmail: string | null;
}

interface RawDeletedItem {
  id: string;
  name: string;
  deletedAt: Date | null;
  deletedBy: string | null;
}

function toDeletedItem(
  item: RawDeletedItem,
  type: EntityType,
  emailMap: Map<string, string>,
): DeletedItem {
  return {
    type,
    id: item.id,
    name: item.name,
    deletedAt: item.deletedAt ?? new Date(),
    deletedBy: item.deletedBy,
    deletedByEmail: item.deletedBy ? (emailMap.get(item.deletedBy) ?? null) : null,
  };
}

const deletedWhereClause = (organizationId: string) => ({
  organizationId,
  deletedAt: { not: null },
});

const deletedSelectFields = {
  id: true,
  name: true,
  deletedAt: true,
  deletedBy: true,
} as const;

export const adminDeletedItemsRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          workspaceId: z.string().cuid().optional().nullable(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }): Promise<DeletedItem[]> => {
      const organizationId = ctx.auth.organizationId;
      const { isOrgOwner, workspaceIds } = ctx.auth;
      const where = deletedWhereClause(organizationId);

      // Build workspace filter for workspace-scoped entities
      // Users and roles are org-wide, no workspace filtering
      // Agents, MCP servers, and policies can be workspace-scoped
      type WorkspaceFilter =
        | { workspaceId: string }
        | { id: string }
        | { OR: [{ workspaceId: null }, { workspaceId: { in: string[] } }] }
        | Record<string, never>;

      let workspaceFilter: WorkspaceFilter = {};
      if (input?.workspaceId) {
        // Explicit workspace filter - validate access
        if (!isOrgOwner && !workspaceIds.includes(input.workspaceId)) {
          workspaceFilter = { id: '__none__' }; // Return empty result
        } else {
          workspaceFilter = { workspaceId: input.workspaceId };
        }
      } else if (!isOrgOwner) {
        // Non-owners see org-wide + their workspace items
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }],
        };
      }
      // Org owners see all (no workspace filter)

      const [users, roles, agents, mcpServers, policies] = await Promise.all([
        // Users and roles are org-wide, no workspace filtering
        prisma.user.findMany({
          where,
          select: { id: true, email: true, deletedAt: true, deletedBy: true },
        }),
        prisma.role.findMany({ where, select: deletedSelectFields }),
        // Workspace-scoped entities
        prisma.agent.findMany({
          where: { ...where, ...workspaceFilter } as Prisma.AgentWhereInput,
          select: deletedSelectFields,
        }),
        prisma.mcpServer.findMany({
          where: { ...where, ...workspaceFilter } as Prisma.McpServerWhereInput,
          select: deletedSelectFields,
        }),
        prisma.policy.findMany({
          where: { ...where, ...workspaceFilter } as Prisma.PolicyWhereInput,
          select: { id: true, slug: true, description: true, deletedAt: true, deletedBy: true },
        }),
      ]);

      const allItems = [...users, ...roles, ...agents, ...mcpServers, ...policies];
      const deletedByIds = [
        ...new Set(
          allItems.map((item) => item.deletedBy).filter((id): id is string => id !== null),
        ),
      ];

      const deletedByUsers = await prisma.user.findMany({
        where: { id: { in: deletedByIds }, organizationId },
        select: { id: true, email: true },
      });

      const emailMap = new Map(deletedByUsers.map((u) => [u.id, u.email]));

      const deletedItems: DeletedItem[] = [
        ...users.map((u) => toDeletedItem({ ...u, name: u.email }, 'user', emailMap)),
        ...roles.map((r) => toDeletedItem(r, 'role', emailMap)),
        ...agents.map((a) => toDeletedItem(a, 'agent', emailMap)),
        ...mcpServers.map((s) => toDeletedItem(s, 'mcpServer', emailMap)),
        ...policies.map((p) =>
          toDeletedItem({ ...p, name: p.description || p.slug }, 'policy', emailMap),
        ),
      ];

      deletedItems.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

      return deletedItems;
    }),
});
