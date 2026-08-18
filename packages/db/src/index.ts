/**
 * SENTINEL Database Client
 * Exports Prisma client and types
 * Updated for Prisma ORM v7 with driver adapter pattern
 */

import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { PrismaClient } from './generated/prisma/client.js';

// Disable Prisma's internal debug logging (uses globalThis.DEBUG)
// This prevents verbose prisma:query logs even if DEBUG env var is set elsewhere
if (typeof globalThis !== 'undefined') {
  const currentDebug = (globalThis as Record<string, unknown>).DEBUG as string | undefined;
  if (currentDebug?.includes('prisma')) {
    (globalThis as Record<string, unknown>).DEBUG = currentDebug
      .split(',')
      .filter((ns: string) => !ns.includes('prisma'))
      .join(',');
  }
}

// Load .env file - don't override existing env vars so callers can set DATABASE_URL
dotenv.config();

// In test mode, use TEST_DATABASE_URL if available
if (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Augment globalThis for Prisma singleton pattern
// This is the standard TypeScript approach for adding typed properties to global scope
// The 'var' declaration is required for globalThis augmentation (not regular variable declaration)
declare global {
  var prisma: PrismaClient | undefined;
}

// Create the PostgreSQL adapter with the connection string
// Debug: Log database URL being used (redact password)
const dbUrl = process.env.DATABASE_URL || 'NOT_SET';
console.log(
  `[@sentinel/db] Creating Prisma client with DATABASE_URL: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`,
);
console.log(
  `[@sentinel/db] NODE_ENV=${process.env.NODE_ENV}, TEST_DATABASE_URL set=${!!process.env.TEST_DATABASE_URL}`,
);

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// Determine Prisma log level from environment
// PRISMA_LOG=query,info,warn,error or PRISMA_LOG=verbose (shorthand for all)
const getPrismaLogLevels = (): Array<'query' | 'info' | 'warn' | 'error'> => {
  const logEnv = process.env.PRISMA_LOG;
  if (!logEnv) return [];
  if (logEnv === 'verbose' || logEnv === 'all') {
    return ['query', 'info', 'warn', 'error'];
  }
  if (logEnv === 'query') {
    return ['query'];
  }
  // Parse comma-separated list
  const validLevels = ['query', 'info', 'warn', 'error'] as const;
  return logEnv
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter((l): l is 'query' | 'info' | 'warn' | 'error' =>
      validLevels.includes(l as 'query' | 'info' | 'warn' | 'error'),
    );
};

// Create or reuse the Prisma client with the adapter
// Note: We explicitly type as PrismaClient to avoid Prisma 7's complex union type inference issues
const createPrismaClient = (): PrismaClient => {
  const logLevels = getPrismaLogLevels();
  if (logLevels.length > 0) {
    console.log(`[@sentinel/db] Prisma logging enabled: ${logLevels.join(', ')}`);
  }
  return new PrismaClient({
    adapter,
    log: logLevels,
  });
};

export const prisma: PrismaClient = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Re-export Prisma types from the generated client
export * from './generated/prisma/client.js';

// Explicitly export enums that TypeScript may not recognize via export *
export {
  AdminActionSource,
  AdminActionType,
  AdminResourceType,
  AgentConfirmationStatus,
  AgentMemoryType,
  AgentMessageRole,
  AgentPlanStatus,
  AgentPlanStepStatus,
  ApprovalRequestStatus,
  ApprovalType,
  AuditDecision,
  ClassificationSource,
  ClassificationStatus,
  ConditionMode,
  DismissType,
  FeatureTipsSetting,
  GlobalVariableFieldType,
  LLMProvider,
  McpAuthType,
  PermissionRequestStatus,
  PermissionRequestType,
  PolicyEffect,
  SensitiveFlagBehavior,
  ToolAccessType,
  ToolRiskLevel,
  TransportType,
} from './generated/prisma/client.js';

// Re-export the default client
export default prisma;
