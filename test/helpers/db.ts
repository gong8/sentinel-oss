/**
 * Database Test Helpers
 * Utilities for managing test database state
 */

import { prisma } from '@sentinel/db';

/**
 * Type guard to check if an error is a Prisma "table doesn't exist" error
 */
function isTableNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2021';
}

/**
 * Safely deletes all records from a table, ignoring if table doesn't exist
 */
async function safeDeleteMany(deleteOperation: () => Promise<unknown>): Promise<void> {
  try {
    await deleteOperation();
  } catch (error: unknown) {
    if (!isTableNotFoundError(error)) {
      throw error;
    }
  }
}

/**
 * Checks if database is available for testing
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous check for DATABASE_URL environment variable
 * Use this in describe.skipIf() for faster test skipping
 */
export function hasDatabaseUrl(): boolean {
  return !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
}

/**
 * Clears all data from the test database
 * Order matters: delete child records before parent records to respect foreign key constraints
 */
export async function clearDatabase(): Promise<void> {
  // Webhooks
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();

  // Sensitive flags
  await prisma.sensitiveFlagRateLimitUsage.deleteMany();
  await prisma.sensitiveFlagApprovalRequest.deleteMany();
  await prisma.sensitiveFlagAgentOverride.deleteMany();
  await prisma.sensitiveToolFlag.deleteMany();

  // Audit and permissions
  await prisma.auditLogEntry.deleteMany();
  await prisma.permissionRequest.deleteMany();

  // OAuth and MCP config
  await prisma.orgMcpOAuthToken.deleteMany();
  await prisma.oAuthState.deleteMany();
  await prisma.oAuthClientRegistration.deleteMany();
  await prisma.userMcpConfig.deleteMany();

  // MCP
  await prisma.mcpTool.deleteMany();
  await prisma.mcpServer.deleteMany();

  // Policies
  await prisma.policyAssertion.deleteMany();
  await prisma.policyTest.deleteMany();
  await prisma.policy.deleteMany();

  // A2A and Agents (tables may not exist if migrations haven't been run)
  await safeDeleteMany(() => prisma.a2ACredential.deleteMany());
  await prisma.agent.deleteMany();
  await safeDeleteMany(() => prisma.publisherRegistry.deleteMany());

  // User roles and roles
  await prisma.userRole.deleteMany();
  await prisma.role.deleteMany({ where: {} });

  // Admin action logs (may not exist)
  await safeDeleteMany(() => prisma.adminActionLog.deleteMany());

  // Global variables (fields are deleted via CASCADE on namespace)
  await safeDeleteMany(() => prisma.globalVariableNamespace.deleteMany());

  // Users and organizations
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

/**
 * Seeds the database with basic test data
 */
export async function seedTestData(options?: { organizationId?: string }) {
  const org = options?.organizationId
    ? await prisma.organization.findUniqueOrThrow({ where: { id: options.organizationId } })
    : await prisma.organization.create({ data: { name: 'Test Organization' } });

  const adminRole = await prisma.role.create({
    data: {
      organizationId: org.id,
      name: 'Admin',
      isAdmin: true,
      description: 'Administrator role',
    },
  });

  const userRole = await prisma.role.create({
    data: {
      organizationId: org.id,
      name: 'User',
      isAdmin: false,
      description: 'Standard user role',
    },
  });

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const adminUser = await prisma.user.create({
    data: {
      email: `admin-${uniqueSuffix}@test.com`,
      organizationId: org.id,
      userRoles: {
        create: [{ roleId: adminRole.id }, { roleId: userRole.id }],
      },
    },
  });

  const regularUser = await prisma.user.create({
    data: {
      email: `user-${uniqueSuffix}@test.com`,
      organizationId: org.id,
      userRoles: {
        create: [{ roleId: userRole.id }],
      },
    },
  });

  return { org, adminUser, regularUser, adminRole, userRole };
}

/**
 * Disconnects from the database
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
