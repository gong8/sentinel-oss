/**
 * Tenant Isolation for Parallel Integration Tests
 *
 * Each test gets its own organization, enabling parallel test execution
 * without race conditions or data conflicts between tests.
 *
 * Usage:
 *   let tenant: TestTenant;
 *
 *   beforeEach(async () => {
 *     tenant = await createTestTenant();
 *   });
 *
 *   afterEach(async () => {
 *     await tenant.cleanup();
 *   });
 *
 *   test('example', async () => {
 *     const admin = await createTestAdmin({ organizationId: tenant.orgId });
 *     // ... test using tenant.orgId
 *   });
 */

import type { PrismaClient } from '@sentinel/db';

// Use dynamic import to ensure DATABASE_URL is set before Prisma client is created
// This is critical for CI where env vars may not be inherited at module load time
let _prisma: PrismaClient | null = null;
async function getPrisma(): Promise<PrismaClient> {
  if (!_prisma) {
    const db = await import('@sentinel/db');
    _prisma = db.prisma;
  }
  return _prisma;
}

/**
 * Represents an isolated test tenant with its own organization
 */
export interface TestTenant {
  /** The organization ID for this test's isolated data */
  orgId: string;
  /** The organization name (useful for debugging) */
  orgName: string;
  /** Cleanup function that removes all data for this tenant only */
  cleanup: () => Promise<void>;
}

/**
 * Type guard to check if an error is a Prisma "record not found" error
 */
function isRecordNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2025';
}

/**
 * Type guard to check if an error is a Prisma "table doesn't exist" error
 */
function isTableNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2021';
}

/**
 * Safely executes a delete operation, ignoring "not found" errors
 */
async function safeDelete(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error: unknown) {
    if (!isRecordNotFoundError(error) && !isTableNotFoundError(error)) {
      throw error;
    }
  }
}

/**
 * Generates a unique identifier for test isolation
 */
function uniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Creates an isolated test tenant with its own organization.
 *
 * The tenant provides complete isolation from other tests running in parallel.
 * All test data should be created within this tenant's organization.
 *
 * @returns A TestTenant with orgId, orgName, and cleanup function
 */
export async function createTestTenant(): Promise<TestTenant> {
  const prisma = await getPrisma();
  const id = uniqueId();
  const orgName = `TestOrg-${id}`;

  const org = await prisma.organization.create({
    data: { name: orgName },
  });

  const cleanup = async () => {
    // Get prisma inside cleanup to ensure it's available
    const prisma = await getPrisma();

    // Delete in dependency order (children before parents)
    // This mirrors the order in clearDatabase() but scoped to this org
    //
    // NOTE: Prisma deleteMany doesn't support relation filtering.
    // For tables that don't have organizationId directly, we use raw SQL.

    // Get user IDs for this org (needed for tables without direct org reference)
    const orgUserIds = (
      await prisma.user.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
    ).map((u) => u.id);

    // Get MCP server IDs for this org
    const orgMcpServerIds = (
      await prisma.mcpServer.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
    ).map((s) => s.id);

    // Get agent IDs for this org
    const orgAgentIds = (
      await prisma.agent.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
    ).map((a) => a.id);

    // Get sensitive flag IDs for this org
    const orgSensitiveFlagIds = (
      await prisma.sensitiveToolFlag.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
    ).map((f) => f.id);

    // Get webhook endpoint IDs for this org
    const orgWebhookEndpointIds = (
      await prisma.webhookEndpoint.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
    ).map((e) => e.id);

    // Webhooks
    if (orgWebhookEndpointIds.length > 0) {
      await safeDelete(() =>
        prisma.webhookDelivery.deleteMany({
          where: { endpointId: { in: orgWebhookEndpointIds } },
        }),
      );
    }
    await safeDelete(() =>
      prisma.webhookEndpoint.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Sessions and context entries
    const orgSessionIds = (
      await prisma.session.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
    ).map((s) => s.id);

    if (orgSessionIds.length > 0) {
      await safeDelete(() =>
        prisma.sessionContextEntry.deleteMany({
          where: { sessionId: { in: orgSessionIds } },
        }),
      );
    }
    await safeDelete(() =>
      prisma.session.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Sensitive flags - use direct organizationId where available
    await safeDelete(() =>
      prisma.sensitiveFlagRateLimitUsage.deleteMany({
        where: { organizationId: org.id },
      }),
    );
    await safeDelete(() =>
      prisma.sensitiveFlagApprovalRequest.deleteMany({
        where: { organizationId: org.id },
      }),
    );
    if (orgSensitiveFlagIds.length > 0) {
      await safeDelete(() =>
        prisma.sensitiveFlagAgentOverride.deleteMany({
          where: { sensitiveToolFlagId: { in: orgSensitiveFlagIds } },
        }),
      );
    }
    await safeDelete(() =>
      prisma.sensitiveToolFlag.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Audit and permissions
    await safeDelete(() =>
      prisma.auditLogEntry.deleteMany({
        where: { organizationId: org.id },
      }),
    );
    if (orgUserIds.length > 0) {
      await safeDelete(() =>
        prisma.permissionRequest.deleteMany({
          where: { userId: { in: orgUserIds } },
        }),
      );
    }

    // OAuth and MCP config
    await safeDelete(() =>
      prisma.orgMcpOAuthToken.deleteMany({
        where: { organizationId: org.id },
      }),
    );
    if (orgUserIds.length > 0) {
      await safeDelete(() =>
        prisma.oAuthState.deleteMany({
          where: { userId: { in: orgUserIds } },
        }),
      );
    }
    if (orgMcpServerIds.length > 0) {
      await safeDelete(() =>
        prisma.oAuthClientRegistration.deleteMany({
          where: { mcpServerId: { in: orgMcpServerIds } },
        }),
      );
    }
    if (orgUserIds.length > 0) {
      await safeDelete(() =>
        prisma.userMcpConfig.deleteMany({
          where: { userId: { in: orgUserIds } },
        }),
      );
    }

    // MCP tools and servers
    if (orgMcpServerIds.length > 0) {
      await safeDelete(() =>
        prisma.mcpTool.deleteMany({
          where: { mcpServerId: { in: orgMcpServerIds } },
        }),
      );
    }
    await safeDelete(() =>
      prisma.mcpServer.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Policy tests and assertions - PolicyAssertion has direct organizationId
    await safeDelete(() =>
      prisma.policyAssertion.deleteMany({
        where: { organizationId: org.id },
      }),
    );
    await safeDelete(() =>
      prisma.policyTest.deleteMany({
        where: { organizationId: org.id },
      }),
    );
    await safeDelete(() =>
      prisma.policy.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // A2A and Agents
    if (orgAgentIds.length > 0) {
      await safeDelete(() =>
        prisma.a2ACredential.deleteMany({
          where: { agentId: { in: orgAgentIds } },
        }),
      );
    }
    await safeDelete(() =>
      prisma.agent.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Get role IDs for this org
    const orgRoleIds = (
      await prisma.role.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
    ).map((r) => r.id);

    // User roles and roles
    if (orgRoleIds.length > 0) {
      await safeDelete(() =>
        prisma.userRole.deleteMany({
          where: { roleId: { in: orgRoleIds } },
        }),
      );
    }
    await safeDelete(() =>
      prisma.role.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Admin action logs
    await safeDelete(() =>
      prisma.adminActionLog.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Global variables - fields are deleted via CASCADE on namespace
    await safeDelete(() =>
      prisma.globalVariableNamespace.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Users
    await safeDelete(() =>
      prisma.user.deleteMany({
        where: { organizationId: org.id },
      }),
    );

    // Finally, the organization itself
    await safeDelete(() =>
      prisma.organization.delete({
        where: { id: org.id },
      }),
    );
  };

  return {
    orgId: org.id,
    orgName,
    cleanup,
  };
}

/**
 * Creates multiple isolated test tenants at once.
 * Useful for tests that need to verify cross-organization isolation.
 *
 * @param count Number of tenants to create
 * @returns Array of TestTenants
 */
export async function createTestTenants(count: number): Promise<TestTenant[]> {
  const tenants = await Promise.all(Array.from({ length: count }, () => createTestTenant()));
  return tenants;
}

/**
 * Helper to cleanup multiple tenants
 */
export async function cleanupTenants(tenants: TestTenant[]): Promise<void> {
  await Promise.all(tenants.map((t) => t.cleanup()));
}
