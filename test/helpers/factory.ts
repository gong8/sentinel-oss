/**
 * Test Data Factories
 * Generate consistent test data for tests
 *
 * Note: We use explicit inline types instead of Partial<Prisma.*CreateInput>
 * to avoid TypeScript "Excessive stack depth" errors with Prisma v7's complex types.
 */

import {
  AuditDecision,
  McpAuthType,
  PolicyEffect,
  prisma,
  Prisma,
  WorkspaceMemberRole,
} from '@sentinel/db';

/**
 * Generates a unique identifier suffix for test data
 */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Converts a name to a URL-friendly slug (lowercase, hyphenated)
 */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
}

/**
 * Gets or creates a role with the given properties
 */
async function getOrCreateRole(organizationId: string, name: string, isAdmin: boolean) {
  const existing = await prisma.role.findFirst({
    where: { organizationId, name, isAdmin },
  });

  if (existing) {
    return existing;
  }

  return prisma.role.create({
    data: {
      organizationId,
      name,
      isAdmin,
      description: `${name} role`,
    },
  });
}

export async function createTestOrganization(overrides: { name?: string } = {}) {
  return prisma.organization.create({
    data: {
      name: overrides.name ?? 'Test Organization',
    },
  });
}

export async function createTestRole(
  overrides: {
    organizationId?: string;
    name?: string;
    isAdmin?: boolean;
    description?: string;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;

  return prisma.role.create({
    data: {
      organizationId: orgId,
      name: overrides.name ?? 'User',
      isAdmin: overrides.isAdmin ?? false,
      description: overrides.description ?? 'Test role',
    },
  });
}

export async function createTestUser(
  overrides: {
    organizationId?: string;
    email?: string;
    accessToken?: string;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;
  const userRole = await getOrCreateRole(orgId, 'User', false);
  const email = overrides.email ?? `test-${uniqueSuffix()}@example.com`;

  return prisma.user.create({
    data: {
      email,
      organizationId: orgId,
      accessToken: overrides.accessToken,
      userRoles: {
        create: [{ roleId: userRole.id }],
      },
    },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });
}

export async function createTestAdmin(
  overrides: {
    organizationId?: string;
    email?: string;
    accessToken?: string;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;
  const [adminRole, userRole] = await Promise.all([
    getOrCreateRole(orgId, 'Admin', true),
    getOrCreateRole(orgId, 'User', false),
  ]);
  const email = overrides.email ?? `admin-${uniqueSuffix()}@example.com`;

  return prisma.user.create({
    data: {
      email,
      organizationId: orgId,
      accessToken: overrides.accessToken,
      userRoles: {
        create: [{ roleId: adminRole.id }, { roleId: userRole.id }],
      },
    },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });
}

export async function createTestPolicy(
  overrides: {
    organizationId?: string;
    slug?: string;
    matchers?: string[];
    toolPatterns?: string[];
    effect?: typeof PolicyEffect.ALLOW | typeof PolicyEffect.DENY;
    description?: string;
    enabled?: boolean;
    conditions?: Prisma.InputJsonValue;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;
  const slug = overrides.slug ?? `test-policy-${uniqueSuffix()}`;

  return prisma.policy.create({
    data: {
      slug,
      organizationId: orgId,
      matchers: overrides.matchers ?? ['role:User'],
      toolPatterns: overrides.toolPatterns ?? ['github.com::*'],
      effect: overrides.effect ?? PolicyEffect.ALLOW,
      description: overrides.description ?? 'Test policy',
      enabled: overrides.enabled ?? true,
      conditions: overrides.conditions ?? undefined,
    },
  });
}

export async function createTestMcpServer(
  overrides: {
    organizationId?: string;
    name?: string;
    url?: string;
    authType?: typeof McpAuthType.NONE | typeof McpAuthType.API_KEY | typeof McpAuthType.OAUTH;
    trusted?: boolean;
    apiKey?: string | null;
    credentials?: Prisma.InputJsonValue | null;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;
  const url = overrides.url ?? `https://test-mcp-${uniqueSuffix()}.example.com`;

  return prisma.mcpServer.create({
    data: {
      name: overrides.name ?? 'Test MCP Server',
      organizationId: orgId,
      url,
      authType: overrides.authType ?? McpAuthType.NONE,
      trusted: overrides.trusted ?? true,
      apiKey: overrides.apiKey ?? undefined,
      credentials: overrides.credentials ?? undefined,
    },
  });
}

export async function createTestAgent(
  overrides: {
    organizationId?: string;
    name?: string;
    workspaceId?: string | null;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;

  return prisma.agent.create({
    data: {
      name: overrides.name ?? 'Test Agent',
      organizationId: orgId,
      workspaceId: overrides.workspaceId ?? null,
    },
  });
}

/**
 * Fetches an admin user with roles from the database.
 * Used for integration tests that need a real user with proper role relationships.
 */
export async function getAdminWithRoles(adminId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });
  if (!admin) throw new Error('Admin not found');
  return admin;
}

export async function createTestAuditLogEntry(
  overrides: {
    organizationId?: string;
    userId?: string;
    agentId?: string | null;
    toolName?: string;
    parameters?: Prisma.InputJsonValue;
    decision?: AuditDecision;
    justification?: string | null;
    policyIds?: string[];
    matchedPolicyIds?: string[];
    userRoles?: string[];
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;

  return prisma.auditLogEntry.create({
    data: {
      organizationId: orgId,
      userId: overrides.userId ?? 'test-user-id',
      agentId: overrides.agentId ?? 'test-agent-id',
      toolName: overrides.toolName ?? 'github.com::createPR',
      parameters: overrides.parameters ?? { repo: 'test/repo' },
      decision: overrides.decision ?? AuditDecision.ALLOWED,
      justification: overrides.justification ?? null,
      policyIds: overrides.policyIds ?? [],
      matchedPolicyIds: overrides.matchedPolicyIds ?? [],
      userRoles: overrides.userRoles ?? [],
    },
  });
}

export async function createTestWorkspace(
  overrides: {
    organizationId?: string;
    name?: string;
    description?: string;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;
  const name = overrides.name ?? `Test Workspace ${uniqueSuffix()}`;
  const slug = `${nameToSlug(name)}-${uniqueSuffix()}`;

  return prisma.workspace.create({
    data: {
      organizationId: orgId,
      name,
      slug,
      description: overrides.description ?? 'Test workspace description',
    },
  });
}

export async function createTestWorkspaceMember(
  overrides: {
    workspaceId?: string;
    userId?: string;
    role?: WorkspaceMemberRole;
    organizationId?: string;
  } = {},
) {
  let workspaceId = overrides.workspaceId;
  let userId = overrides.userId;

  if (!workspaceId) {
    const orgId = overrides.organizationId ?? (await createTestOrganization()).id;
    const workspace = await createTestWorkspace({ organizationId: orgId });
    workspaceId = workspace.id;
  }

  if (!userId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organizationId: true },
    });
    if (!workspace) throw new Error('Workspace not found');
    const user = await createTestUser({ organizationId: workspace.organizationId });
    userId = user.id;
  }

  return prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId,
      role: overrides.role ?? WorkspaceMemberRole.MEMBER,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function createTestUserWithWorkspace(
  overrides: {
    organizationId?: string;
    workspaceId?: string;
    workspaceRole?: WorkspaceMemberRole;
    email?: string;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;
  const workspaceId =
    overrides.workspaceId ?? (await createTestWorkspace({ organizationId: orgId })).id;
  const user = await createTestUser({ organizationId: orgId, email: overrides.email });

  await prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId: user.id,
      role: overrides.workspaceRole ?? WorkspaceMemberRole.MEMBER,
    },
  });

  return prisma.user.findUnique({
    where: { id: user.id },
    include: {
      userRoles: {
        include: { role: true },
      },
      workspaceMemberships: {
        include: { workspace: true },
      },
    },
  });
}

export async function createTestWorkspaceAdmin(
  overrides: {
    organizationId?: string;
    workspaceId?: string;
    email?: string;
  } = {},
) {
  return createTestUserWithWorkspace({
    organizationId: overrides.organizationId,
    workspaceId: overrides.workspaceId,
    workspaceRole: WorkspaceMemberRole.ADMIN,
    email: overrides.email,
  });
}

export async function createTestOrgOwner(
  overrides: {
    organizationId?: string;
    userId?: string;
    email?: string;
  } = {},
) {
  const orgId = overrides.organizationId ?? (await createTestOrganization()).id;

  let userId = overrides.userId;
  if (!userId) {
    const user = await createTestAdmin({ organizationId: orgId, email: overrides.email });
    userId = user.id;
  }

  await prisma.orgOwner.create({
    data: {
      organizationId: orgId,
      userId,
    },
  });

  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: { role: true },
      },
      orgOwnership: true,
    },
  });
}
