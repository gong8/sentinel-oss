/**
 * Playwright Global Teardown
 * Restores database state after E2E tests
 */

import * as fs from 'fs';
import * as path from 'path';

// Load prisma dynamically to avoid ESM/CJS interop issues
async function getPrisma() {
  const db = await import('@sentinel/db');
  return db.prisma;
}

interface DbSnapshot {
  users: Array<{ id: string; [key: string]: unknown }>;
  organizations: Array<{ id: string; [key: string]: unknown }>;
  roles: Array<{ id: string; [key: string]: unknown }>;
  policies: Array<{ id: string; enabled: boolean; [key: string]: unknown }>;
  mcpServers: Array<{ id: string; [key: string]: unknown }>;
  userMcpConfigs: Array<{ id: string; [key: string]: unknown }>;
  auditLogEntries: Array<{ id: string; [key: string]: unknown }>;
  permissionRequests: Array<{ id: string; [key: string]: unknown }>;
}

async function globalTeardown() {
  const prisma = await getPrisma();
  console.log('🧹 E2E Global Teardown: Restoring database state...');

  try {
    // Load snapshot
    const snapshotPath = path.join(__dirname, '.db-snapshot.json');

    if (!fs.existsSync(snapshotPath)) {
      console.warn('⚠️  No database snapshot found - skipping restore');
      return;
    }

    const snapshot: DbSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

    // Get IDs that existed before tests
    const originalPolicyIds = new Set(snapshot.policies.map((p) => p.id));
    const originalUserIds = new Set(snapshot.users.map((u) => u.id));
    const originalUserMcpConfigIds = new Set(snapshot.userMcpConfigs.map((c) => c.id));

    // Delete data created during tests (everything NOT in the snapshot)
    // Order matters due to foreign key constraints
    console.log('🗑️  Deleting test data...');

    // 1. Delete permission requests created during tests
    const deletedRequests = await prisma.permissionRequest.deleteMany({
      where: {
        id: {
          notIn: snapshot.permissionRequests.map((r) => r.id),
        },
      },
    });
    console.log(`   - Deleted ${deletedRequests.count} permission requests`);

    // 2. Delete audit log entries created during tests
    const deletedAuditLogs = await prisma.auditLogEntry.deleteMany({
      where: {
        id: {
          notIn: snapshot.auditLogEntries.map((a) => a.id),
        },
      },
    });
    console.log(`   - Deleted ${deletedAuditLogs.count} audit log entries`);

    // 3. Delete user MCP configs created during tests
    const deletedConfigs = await prisma.userMcpConfig.deleteMany({
      where: {
        id: {
          notIn: Array.from(originalUserMcpConfigIds),
        },
      },
    });
    console.log(`   - Deleted ${deletedConfigs.count} user MCP configs`);

    // 4. Delete policies created during tests
    const deletedPolicies = await prisma.policy.deleteMany({
      where: {
        id: {
          notIn: Array.from(originalPolicyIds),
        },
      },
    });
    console.log(`   - Deleted ${deletedPolicies.count} policies`);

    // 5. Delete user roles for users created during tests
    const deletedUserRoles = await prisma.userRole.deleteMany({
      where: {
        userId: {
          notIn: Array.from(originalUserIds),
        },
      },
    });
    console.log(`   - Deleted ${deletedUserRoles.count} user roles`);

    // 6. Delete users created during tests
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        id: {
          notIn: Array.from(originalUserIds),
        },
      },
    });
    console.log(`   - Deleted ${deletedUsers.count} users`);

    // 7. Restore modified records (e.g., toggled policies)
    // For policies that were toggled, restore their enabled state
    for (const policy of snapshot.policies) {
      await prisma.policy.update({
        where: { id: policy.id },
        data: { enabled: policy.enabled },
      });
    }

    // Clean up snapshot file
    fs.unlinkSync(snapshotPath);

    console.log('✅ Database state restored successfully');
  } catch (error) {
    console.error('❌ Failed to restore database state:', error);
    // Don't throw - we don't want to fail the test run if cleanup fails
    console.error('⚠️  Manual database cleanup may be required');
  } finally {
    await prisma.$disconnect();
  }
}

export default globalTeardown;
