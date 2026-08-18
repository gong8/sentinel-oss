/**
 * SENTINEL Database Clear Script
 * Drops all tables and reseeds the database
 * This is an alternative to migrate reset when the user doesn't have DROP DATABASE privileges
 */

import { runSeed } from './seed-utils.js';

const TABLES_IN_DROP_ORDER = [
  'PermissionRequest',
  'AuditLogEntry',
  'PolicyTest',
  'Policy',
  'UserMcpConfig',
  'McpTool',
  'McpServer',
  'Agent',
  'UserRole',
  'Role',
  'User',
  'Organization',
];

runSeed(async (prisma) => {
  console.log('Clearing database...');

  for (const table of TABLES_IN_DROP_ORDER) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    console.log(`Dropped table: ${table}`);
  }

  console.log('Database cleared successfully');
});
