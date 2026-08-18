/**
 * Playwright Global Setup
 * Seeds database and captures state before E2E tests
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Ensure test environment is set BEFORE importing @sentinel/db
// This ensures the db package uses TEST_DATABASE_URL
process.env.NODE_ENV = 'test';

// Load prisma dynamically to avoid ESM/CJS interop issues
async function getPrisma() {
  const db = await import('@sentinel/db');
  return db.prisma;
}

async function globalSetup() {
  console.log('🧪 E2E Global Setup: Seeding database...');

  try {
    // Initialize test database with minimal seed data (db:init uses seed-minimal.ts which is tracked in git)
    // Use TEST_DATABASE_URL to ensure we seed the correct database
    const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    execSync('pnpm db:init', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        // Override DATABASE_URL with TEST_DATABASE_URL for seeding
        DATABASE_URL: testDbUrl,
        // Consent for Prisma AI safeguard - this is the test database (sentinel_test)
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes',
      },
    });
    console.log('✅ Database seeded successfully');
  } catch (error) {
    console.error('❌ Failed to seed database:', error);
    throw error;
  }

  const prisma = await getPrisma();
  console.log('🧪 E2E Global Setup: Capturing database state...');

  try {
    // Capture current database state
    const snapshot = {
      users: await prisma.user.findMany({
        include: {
          userRoles: true,
        },
      }),
      organizations: await prisma.organization.findMany(),
      roles: await prisma.role.findMany(),
      policies: await prisma.policy.findMany(),
      mcpServers: await prisma.mcpServer.findMany(),
      userMcpConfigs: await prisma.userMcpConfig.findMany(),
      auditLogEntries: await prisma.auditLogEntry.findMany(),
      permissionRequests: await prisma.permissionRequest.findMany(),
    };

    // Save snapshot to temp file
    const snapshotPath = path.join(__dirname, '.db-snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    console.log('✅ Database snapshot saved');
  } catch (error) {
    console.error('❌ Failed to capture database snapshot:', error);
    throw error;
  }
  // Note: Do NOT disconnect the Prisma client here.
  // The singleton is shared with the test process, and disconnecting
  // would break subsequent queries until auto-reconnect happens.
}

export default globalSetup;
