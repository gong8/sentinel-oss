/**
 * Deletion Impact Analysis Service
 * Analyzes the impact of deleting resources before actual deletion
 */

import { prisma } from '@sentinel/db';

export interface DeletionImpact {
  canDelete: boolean;
  blockers: Array<{
    type: 'policy' | 'user_config' | 'audit_log' | 'admin_log';
    count: number;
    details: string;
    items?: Array<{ id: string; name: string }>;
  }>;
  warnings: Array<{
    type: string;
    message: string;
    count?: number;
  }>;
}

// Helper functions to reduce duplication

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function notFoundResponse(resourceType: string): DeletionImpact {
  return {
    canDelete: false,
    blockers: [{ type: 'audit_log', count: 0, details: `${resourceType} not found` }],
    warnings: [],
  };
}

function buildResult(
  blockers: DeletionImpact['blockers'],
  warnings: DeletionImpact['warnings'],
  alwaysCanDelete = false,
): DeletionImpact {
  return {
    canDelete: alwaysCanDelete || blockers.length === 0,
    blockers: alwaysCanDelete ? [] : blockers,
    warnings,
  };
}

/**
 * Analyze impact of deleting an MCP server
 */
export async function analyzeMcpServerDeletion(
  organizationId: string,
  serverId: string,
  userWorkspaceIds?: string[],
): Promise<DeletionImpact> {
  const server = await prisma.mcpServer.findFirst({
    where: { id: serverId, organizationId, deletedAt: null },
    include: { userConfigs: true },
  });

  if (!server) {
    return notFoundResponse('Server');
  }

  const blockers: DeletionImpact['blockers'] = [];
  const warnings: DeletionImpact['warnings'] = [];

  const serverUrl = new URL(server.url);
  const port = serverUrl.port ? `:${serverUrl.port}` : '';
  const serverKey = `${serverUrl.hostname}${port}`;
  const serverKeyPrefix = `${serverKey}::`;

  // Build workspace filter based on server's workspace scope
  const workspaceFilter = server.workspaceId
    ? { workspaceId: server.workspaceId } // Server is workspace-scoped, only check that workspace's policies
    : userWorkspaceIds
      ? {
          OR: [
            { workspaceId: null }, // Org-wide policies
            { workspaceId: { in: userWorkspaceIds } }, // User's workspace policies
          ],
        }
      : {};

  const allPolicies = await prisma.policy.findMany({
    where: { organizationId, enabled: true, deletedAt: null, ...workspaceFilter },
    select: { id: true, slug: true, description: true, toolPatterns: true, workspaceId: true },
  });

  const referencingPolicies = allPolicies.filter((p) =>
    p.toolPatterns.some((tp) => tp.startsWith(serverKeyPrefix)),
  );

  if (referencingPolicies.length > 0) {
    const count = referencingPolicies.length;
    blockers.push({
      type: 'policy',
      count,
      details: `${count} active ${pluralize(count, 'policy', 'policies')} reference tools from this server`,
      items: referencingPolicies.map((p) => ({
        id: p.id,
        name: `${p.slug} - ${p.description}`,
      })),
    });
  }

  const userConfigCount = server.userConfigs.length;
  if (userConfigCount > 0) {
    warnings.push({
      type: 'user_config',
      message: `${userConfigCount} ${pluralize(userConfigCount, 'user has', 'users have')} configured this server`,
      count: userConfigCount,
    });
  }

  const auditLogCount = await prisma.auditLogEntry.count({
    where: { organizationId, toolName: { startsWith: serverKeyPrefix } },
  });

  if (auditLogCount > 0) {
    warnings.push({
      type: 'audit_log',
      message: `${auditLogCount} audit log ${pluralize(auditLogCount, 'entry references', 'entries reference')} tools from this server`,
      count: auditLogCount,
    });
  }

  return buildResult(blockers, warnings);
}

/**
 * Analyze impact of deleting a policy
 */
export async function analyzePolicyDeletion(
  organizationId: string,
  policyId: string,
  userWorkspaceIds?: string[],
): Promise<DeletionImpact> {
  // Build workspace filter for policy lookup
  const workspaceFilter = userWorkspaceIds
    ? {
        OR: [
          { workspaceId: null }, // Org-wide policies
          { workspaceId: { in: userWorkspaceIds } }, // User's workspace policies
        ],
      }
    : {};

  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId, deletedAt: null, ...workspaceFilter },
  });

  if (!policy) {
    return notFoundResponse('Policy');
  }

  const warnings: DeletionImpact['warnings'] = [];

  const auditLogCount = await prisma.auditLogEntry.count({
    where: { organizationId, policyIds: { has: policyId } },
  });

  if (auditLogCount > 0) {
    warnings.push({
      type: 'audit_log',
      message: `${auditLogCount} audit log ${pluralize(auditLogCount, 'entry references', 'entries reference')} this policy`,
      count: auditLogCount,
    });
  }

  const testCount = await prisma.policyTest.count({
    where: { organizationId, matchedPolicyIds: { has: policyId } },
  });

  if (testCount > 0) {
    warnings.push({
      type: 'admin_log',
      message: `${testCount} policy test ${pluralize(testCount, 'entry references', 'entries reference')} this policy`,
      count: testCount,
    });
  }

  return buildResult([], warnings, true);
}

/**
 * Analyze impact of deleting a role
 * Note: Roles are org-wide, but we filter policy references by workspace
 */
export async function analyzeRoleDeletion(
  organizationId: string,
  roleId: string,
  userWorkspaceIds?: string[],
): Promise<DeletionImpact> {
  const role = await prisma.role.findFirst({
    where: { id: roleId, organizationId, deletedAt: null },
    include: {
      userRoles: {
        include: {
          user: {
            include: {
              userRoles: { include: { role: true } },
            },
          },
        },
      },
    },
  });

  if (!role) {
    return notFoundResponse('Role');
  }

  const blockers: DeletionImpact['blockers'] = [];
  const warnings: DeletionImpact['warnings'] = [];

  const usersWithOnlyThisRole = role.userRoles.filter((ur) => ur.user.userRoles.length === 1);
  const usersWithOtherRoles = role.userRoles.filter((ur) => ur.user.userRoles.length > 1);

  if (usersWithOnlyThisRole.length > 0) {
    const count = usersWithOnlyThisRole.length;
    blockers.push({
      type: 'user_config',
      count,
      details: `${count} ${pluralize(count, 'user only has', 'users only have')} this role. Users must have at least one role.`,
      items: usersWithOnlyThisRole.map((ur) => ({
        id: ur.user.id,
        name: ur.user.email,
      })),
    });
  }

  // Build workspace filter for policy count
  const policyWorkspaceFilter = userWorkspaceIds
    ? {
        OR: [{ workspaceId: null }, { workspaceId: { in: userWorkspaceIds } }],
      }
    : {};

  const referencingPoliciesCount = await prisma.policy.count({
    where: {
      organizationId,
      matchers: { has: `role:${role.name}` },
      enabled: true,
      deletedAt: null,
      ...policyWorkspaceFilter,
    },
  });

  if (referencingPoliciesCount > 0) {
    warnings.push({
      type: 'policy',
      message: `${referencingPoliciesCount} active ${pluralize(referencingPoliciesCount, 'policy references', 'policies reference')} this role`,
      count: referencingPoliciesCount,
    });
  }

  if (usersWithOtherRoles.length > 0) {
    const count = usersWithOtherRoles.length;
    warnings.push({
      type: 'user_config',
      message: `${count} ${pluralize(count, 'user will', 'users will')} lose this role but retain other roles`,
      count,
    });
  }

  return buildResult(blockers, warnings);
}

/**
 * Analyze impact of deleting a user
 */
export async function analyzeUserDeletion(
  organizationId: string,
  userId: string,
  currentUserId: string,
): Promise<DeletionImpact> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, deletedAt: null },
    include: {
      userRoles: { include: { role: true } },
      mcpConfigs: true,
    },
  });

  if (!user) {
    return notFoundResponse('User');
  }

  const blockers: DeletionImpact['blockers'] = [];
  const warnings: DeletionImpact['warnings'] = [];

  if (userId === currentUserId) {
    blockers.push({
      type: 'user_config',
      count: 1,
      details: 'You cannot delete your own account',
    });
  }

  const isAdmin = user.userRoles.some((ur) => ur.role.isAdmin);
  if (isAdmin) {
    const adminCount = await prisma.user.count({
      where: {
        organizationId,
        deletedAt: null,
        userRoles: { some: { role: { isAdmin: true } } },
      },
    });

    if (adminCount <= 1) {
      blockers.push({
        type: 'user_config',
        count: 1,
        details: 'Cannot delete the last admin user. Organization must have at least one admin.',
      });
    }
  }

  const mcpConfigCount = user.mcpConfigs.length;
  if (mcpConfigCount > 0) {
    warnings.push({
      type: 'user_config',
      message: `User has ${mcpConfigCount} MCP server ${pluralize(mcpConfigCount, 'configuration', 'configurations')}`,
      count: mcpConfigCount,
    });
  }

  const auditLogCount = await prisma.auditLogEntry.count({
    where: { organizationId, userId },
  });

  if (auditLogCount > 0) {
    warnings.push({
      type: 'audit_log',
      message: `User has ${auditLogCount} audit log ${pluralize(auditLogCount, 'entry', 'entries')}`,
      count: auditLogCount,
    });
  }

  return buildResult(blockers, warnings);
}

/**
 * Analyze impact of deleting an agent
 */
export async function analyzeAgentDeletion(
  organizationId: string,
  agentId: string,
  userWorkspaceIds?: string[],
): Promise<DeletionImpact> {
  // Build workspace filter for agent lookup
  const workspaceFilter = userWorkspaceIds
    ? {
        OR: [{ workspaceId: null }, { workspaceId: { in: userWorkspaceIds } }],
      }
    : {};

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId, deletedAt: null, ...workspaceFilter },
  });

  if (!agent) {
    return notFoundResponse('Agent');
  }

  const warnings: DeletionImpact['warnings'] = [];

  // Build workspace filter for policy count based on agent's workspace scope
  const policyWorkspaceFilter = agent.workspaceId
    ? { workspaceId: agent.workspaceId } // Agent is workspace-scoped
    : userWorkspaceIds
      ? {
          OR: [{ workspaceId: null }, { workspaceId: { in: userWorkspaceIds } }],
        }
      : {};

  const referencingPoliciesCount = await prisma.policy.count({
    where: {
      organizationId,
      matchers: { has: `agent:${agentId}` },
      enabled: true,
      deletedAt: null,
      ...policyWorkspaceFilter,
    },
  });

  if (referencingPoliciesCount > 0) {
    warnings.push({
      type: 'policy',
      message: `${referencingPoliciesCount} active ${pluralize(referencingPoliciesCount, 'policy references', 'policies reference')} this agent`,
      count: referencingPoliciesCount,
    });
  }

  // Audit logs are scoped by workspace too
  const auditLogFilter = agent.workspaceId
    ? { workspaceId: agent.workspaceId }
    : userWorkspaceIds
      ? {
          OR: [{ workspaceId: null }, { workspaceId: { in: userWorkspaceIds } }],
        }
      : {};

  const auditLogCount = await prisma.auditLogEntry.count({
    where: { organizationId, agentId, ...auditLogFilter },
  });

  if (auditLogCount > 0) {
    warnings.push({
      type: 'audit_log',
      message: `Agent has ${auditLogCount} audit log ${pluralize(auditLogCount, 'entry', 'entries')}`,
      count: auditLogCount,
    });
  }

  return buildResult([], warnings, true);
}

/**
 * Analyze impact of deleting a workspace
 */
export async function analyzeWorkspaceDeletion(
  organizationId: string,
  workspaceId: string,
): Promise<DeletionImpact> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId, deletedAt: null },
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
  });

  if (!workspace) {
    return notFoundResponse('Workspace');
  }

  const blockers: DeletionImpact['blockers'] = [];
  const warnings: DeletionImpact['warnings'] = [];

  // Check for workspace-scoped policies
  const policyCount = workspace._count.policies;
  if (policyCount > 0) {
    blockers.push({
      type: 'policy',
      count: policyCount,
      details: `${policyCount} ${pluralize(policyCount, 'policy is', 'policies are')} scoped to this workspace. Delete or reassign them first.`,
    });
  }

  // Check for workspace-scoped MCP servers
  const serverCount = workspace._count.mcpServers;
  if (serverCount > 0) {
    blockers.push({
      type: 'policy',
      count: serverCount,
      details: `${serverCount} MCP ${pluralize(serverCount, 'server is', 'servers are')} scoped to this workspace. Delete or reassign them first.`,
    });
  }

  // Check for workspace-scoped agents
  const agentCount = workspace._count.agents;
  if (agentCount > 0) {
    blockers.push({
      type: 'policy',
      count: agentCount,
      details: `${agentCount} ${pluralize(agentCount, 'agent is', 'agents are')} scoped to this workspace. Delete or reassign them first.`,
    });
  }

  // Members are just warnings (they'll be removed)
  const memberCount = workspace._count.members;
  if (memberCount > 0) {
    warnings.push({
      type: 'user_config',
      message: `${memberCount} ${pluralize(memberCount, 'member will', 'members will')} be removed from this workspace`,
      count: memberCount,
    });
  }

  // Check for policies referencing workspace matchers
  const referencingPoliciesCount = await prisma.policy.count({
    where: {
      organizationId,
      OR: [
        { matchers: { has: `workspace:${workspaceId}` } },
        { matchers: { has: `workspace-admin:${workspaceId}` } },
      ],
      enabled: true,
      deletedAt: null,
    },
  });

  if (referencingPoliciesCount > 0) {
    warnings.push({
      type: 'policy',
      message: `${referencingPoliciesCount} ${pluralize(referencingPoliciesCount, 'policy references', 'policies reference')} this workspace in matchers`,
      count: referencingPoliciesCount,
    });
  }

  return buildResult(blockers, warnings);
}
