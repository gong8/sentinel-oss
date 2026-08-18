/**
 * User Tools Router
 * Lists tools available to the user with policy evaluation
 */

import { McpAuthType, prisma } from '@sentinel/db';
import { getServerKeyFromUrl } from '../../lib/serverUtils.js';
import { checkToolPattern, evaluatePolicy } from '../../services/policy.js';
import { protectedProcedure, router } from '../init.js';

/**
 * Gets unique behaviors from matching sensitive flags
 */
function getMatchingFlagBehaviors(
  sensitiveFlags: Array<{ toolPattern: string; behaviors: string[] }>,
  qualifiedName: string,
): string[] {
  const matchingFlags = sensitiveFlags.filter((flag) =>
    checkToolPattern(flag.toolPattern, qualifiedName),
  );
  return [...new Set(matchingFlags.flatMap((f) => f.behaviors))];
}

export const userToolsRouter = router({
  /**
   * List all tools from registered MCP servers with access status
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.auth.user.id },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        workspaceMemberships: {
          select: {
            workspaceId: true,
            role: true,
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    const [servers, policies, sensitiveFlags] = await Promise.all([
      prisma.mcpServer.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          // Users can only see org-wide servers or servers in their workspaces
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
        include: {
          tools: {
            orderBy: { name: 'asc' },
          },
          userConfigs: {
            where: { userId: ctx.auth.user.id },
            select: { id: true },
          },
        },
      }),
      prisma.policy.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          enabled: true,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
      }),
      prisma.sensitiveToolFlag.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          enabled: true,
        },
        select: {
          toolPattern: true,
          behaviors: true,
        },
      }),
    ]);

    return Promise.all(
      servers.map(async (server) => {
        const isAuthenticated =
          server.authType === McpAuthType.NONE || server.userConfigs.length > 0;

        const tools = await Promise.all(
          server.tools.map(async (tool) => {
            const qualifiedName = `${getServerKeyFromUrl(server.url)}::${tool.name}`;
            const policyResult = await evaluatePolicy(
              { user, agent: null, toolName: qualifiedName },
              policies,
            );

            const isDenied = policyResult.decision === 'DENIED';
            const blockedByDeny = isDenied && policyResult.policyIds.length > 0;
            const flagBehaviors = getMatchingFlagBehaviors(sensitiveFlags, qualifiedName);

            return {
              id: tool.id,
              name: tool.name,
              qualifiedName,
              description: tool.description,
              access: isDenied ? 'DENIED' : 'ALLOWED',
              justification: policyResult.justification,
              blockedByDeny,
              blockingPolicyId: blockedByDeny ? (policyResult.policyIds[0] ?? null) : null,
              isFlagged: flagBehaviors.length > 0,
              flagBehaviors,
            };
          }),
        );

        return {
          serverId: server.id,
          serverName: server.name,
          serverUrl: server.url,
          authenticated: isAuthenticated,
          authType: server.authType,
          tools,
        };
      }),
    );
  }),
});
