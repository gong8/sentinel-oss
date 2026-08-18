/**
 * Seed.ts Generator
 *
 * Transforms captured JSON data from Playwright automation
 * into a proper seed.ts file.
 *
 * Run with:
 *   npx tsx test/seed-generation/generate-seed-ts.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { type CapturedData, loadCapturedData, MCP_SERVERS } from './helpers';

const SEED_OUTPUT = path.join(__dirname, '../../packages/db/prisma/seed.ts');

// ============================================================================
// Helper Function Generators
// ============================================================================

function generateHelperFunctions(): string {
  return `
/**
 * Generates a deterministic slug from policy data
 * This matches the implementation in packages/api/src/services/policy.ts
 */
function generatePolicySlug(
  matchers: string[],
  toolPatterns: string[],
  effect: 'ALLOW' | 'DENY',
  existingSlugs: Set<string>,
): string {
  // Normalize matcher: convert to lowercase, replace special chars with dashes
  const normalizeMatcher = (m: string): string => {
    if (m === '*') return 'all';
    return m
      .toLowerCase()
      .replace(/:/g, '-')
      .replace(/@/g, '-at-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Normalize tool pattern: convert to lowercase, replace special chars
  const normalizeToolPattern = (pattern: string): string => {
    return pattern
      .toLowerCase()
      .replace(/::/g, '-')
      .replace(/:/g, '-')
      .replace(/\\./g, '-')
      .replace(/\\*/g, 'all')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const normalizedEffect = effect.toLowerCase();
  const firstMatcher = matchers[0] || '*';
  const firstToolPattern = toolPatterns[0] || '*::*';
  const matcherPart = normalizeMatcher(firstMatcher);
  const toolPart = normalizeToolPattern(firstToolPattern);

  const multiSuffix =
    matchers.length > 1 || toolPatterns.length > 1
      ? \`-multi-\${matchers.length}m\${toolPatterns.length}t\`
      : '';

  const baseSlug = \`\${normalizedEffect}-\${matcherPart}-\${toolPart}\${multiSuffix}\`;
  const maxBaseLength = 90;
  let slug =
    baseSlug.length > maxBaseLength
      ? baseSlug.slice(0, maxBaseLength).replace(/-+$/, '')
      : baseSlug;

  if (existingSlugs.has(slug)) {
    let counter = 2;
    let candidate = \`\${slug}-\${counter}\`;
    while (existingSlugs.has(candidate) && counter < 9999 && candidate.length <= 100) {
      counter++;
      candidate = \`\${slug}-\${counter}\`;
    }
    slug = candidate;
  }

  return slug.length > 100 ? slug.slice(0, 100) : slug;
}

/**
 * Simple encryption for seed data
 * For seed data, we store as JSON string (production uses AES-256-GCM)
 */
function encryptObject(obj: unknown): string {
  return JSON.stringify(obj);
}

function encryptString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Generate a date in the past (days ago)
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(
    Math.floor(Math.random() * 24),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
  );
  return date;
}
`.trim();
}

// ============================================================================
// Code Generators
// ============================================================================

function generateOrganizationCode(org: CapturedData['organization']): string {
  if (!org) return '// No organization data captured';

  return `
  // Organization
  const org = await prisma.organization.upsert({
    where: { id: '${org.id}' },
    update: {},
    create: {
      id: '${org.id}',
      name: '${org.name}',
    },
  });
  console.log('Created organization:', org.name);
`.trim();
}

function generateRolesCode(roles: CapturedData['roles']): string {
  if (roles.length === 0) return '// No roles captured';

  const roleCreations = roles
    .map(
      (role) => `
    prisma.role.upsert({
      where: { id: '${role.id}' },
      update: {},
      create: {
        id: '${role.id}',
        organizationId: org.id,
        name: '${role.name}',
        isAdmin: ${role.isAdmin},
        description: ${role.description ? `'${role.description.replace(/'/g, "\\'")}'` : 'null'},
      },
    })`,
    )
    .join(',\n    ');

  return `
  // Roles
  const [${roles.map((r) => `${r.name.toLowerCase()}Role`).join(', ')}] = await Promise.all([
    ${roleCreations}
  ]);
  console.log('Created', ${roles.length}, 'roles');
`.trim();
}

function generateUsersCode(users: CapturedData['users'], roles: CapturedData['roles']): string {
  if (users.length === 0) return '// No users captured';

  const userCreations = users
    .map((user) => {
      const userRoleConnects = user.roleNames
        .map((roleName) => {
          const role = roles.find((r) => r.name === roleName);
          if (!role) return null;
          return `{ roleId: '${role.id}' }`;
        })
        .filter(Boolean)
        .join(', ');

      return `
    prisma.user.upsert({
      where: { id: '${user.id}' },
      update: {},
      create: {
        id: '${user.id}',
        organizationId: org.id,
        email: '${user.email}',
        accessToken: '${user.accessToken}',
        userRoles: {
          create: [${userRoleConnects}],
        },
      },
    })`;
    })
    .join(',\n    ');

  return `
  // Users
  const users = await Promise.all([
    ${userCreations}
  ]);
  console.log('Created', users.length, 'users');

  // Create user map for later reference
  const userMap = new Map(users.map(u => [u.email, u]));
`.trim();
}

function generateMcpServersCode(servers: CapturedData['mcpServers']): string {
  if (servers.length === 0) return '// No MCP servers captured';

  const serverCreations = servers
    .map((server) => {
      const serverConfig = MCP_SERVERS.find((cfg) => cfg.url === server.url);
      const authType = server.authType || 'NONE';

      // Generate tools array
      const toolsCreate =
        server.tools.length > 0
          ? `tools: {
          create: [
            ${server.tools.map((t) => `{ name: '${t.name}', description: ${t.description ? `'${t.description.replace(/'/g, "\\'")}'` : 'null'} }`).join(',\n            ')}
          ],
        },`
          : '';

      return `
    // ${server.name}${serverConfig?.skipPolicies ? ' (NO POLICIES - intentionally unauthenticated)' : ''}
    prisma.mcpServer.upsert({
      where: { id: '${server.id}' },
      update: {},
      create: {
        id: '${server.id}',
        organizationId: org.id,
        name: '${server.name}',
        url: '${server.url}',
        authType: McpAuthType.${authType},
        trusted: ${server.trusted},
        ${toolsCreate}
      },
    })`;
    })
    .join(',\n    ');

  return `
  // MCP Servers
  const mcpServers = await Promise.all([
    ${serverCreations}
  ]);
  console.log('Created', mcpServers.length, 'MCP servers with tools');

  // Create server map for later reference
  const serverMap = new Map(mcpServers.map(s => [s.name, s]));
`.trim();
}

function generatePoliciesCode(policies: CapturedData['policies']): string {
  if (policies.length === 0) return '// No policies captured';

  return `
  // Policies
  const existingSlugs = new Set<string>();
  const policyData = [
    ${policies
      .map(
        (p) => `{
      matchers: ${JSON.stringify(p.matchers)},
      toolPatterns: ${JSON.stringify(p.toolPatterns)},
      effect: PolicyEffect.${p.effect},
      description: ${p.description ? `'${p.description.replace(/'/g, "\\'")}'` : 'null'},
      enabled: ${p.enabled},
    }`,
      )
      .join(',\n    ')}
  ];

  for (const policy of policyData) {
    const slug = generatePolicySlug(policy.matchers, policy.toolPatterns, policy.effect as 'ALLOW' | 'DENY', existingSlugs);
    existingSlugs.add(slug);

    await prisma.policy.create({
      data: {
        organizationId: org.id,
        slug,
        matchers: policy.matchers,
        toolPatterns: policy.toolPatterns,
        effect: policy.effect,
        description: policy.description,
        enabled: policy.enabled,
      },
    });
  }
  console.log('Created', policyData.length, 'policies');
`.trim();
}

function generateAgentsCode(agents: CapturedData['agents']): string {
  if (agents.length === 0) return '// No agents captured';

  const agentCreations = agents
    .map(
      (agent) => `
    prisma.agent.upsert({
      where: { id: '${agent.id}' },
      update: {},
      create: {
        id: '${agent.id}',
        organizationId: org.id,
        name: '${agent.name}',
        protocolType: ProtocolType.${agent.protocolType},
      },
    })`,
    )
    .join(',\n    ');

  return `
  // Agents
  const agents = await Promise.all([
    ${agentCreations}
  ]);
  console.log('Created', agents.length, 'agents');
`.trim();
}

function generateWebhooksCode(webhooks: CapturedData['webhooks']): string {
  if (webhooks.length === 0) return '// No webhooks captured';

  const webhookCreations = webhooks
    .map(
      (webhook) => `
    prisma.webhookEndpoint.upsert({
      where: { id: '${webhook.id}' },
      update: {},
      create: {
        id: '${webhook.id}',
        organizationId: org.id,
        name: '${webhook.name}',
        type: WebhookEndpointType.${webhook.type},
        url: process.env.DISCORD_WEBHOOK || '${webhook.url}',
        events: ${JSON.stringify(webhook.events)},
        enabled: ${webhook.enabled},
        secret: 'seed-webhook-secret',
      },
    })`,
    )
    .join(',\n    ');

  return `
  // Webhooks
  const webhooks = await Promise.all([
    ${webhookCreations}
  ]);
  console.log('Created', webhooks.length, 'webhooks');
`.trim();
}

function generateAuditLogCode(entries: CapturedData['auditLogEntries']): string {
  if (entries.length === 0) {
    // Generate some sample audit log entries
    return `
  // Audit Log Entries (sample data)
  const auditData = [
    { toolName: 'localhost:3012::get_data', decision: AuditDecision.ALLOWED, daysAgo: 1 },
    { toolName: 'localhost:3005::list_items', decision: AuditDecision.ALLOWED, daysAgo: 2 },
    { toolName: 'localhost:3006::search', decision: AuditDecision.ALLOWED, daysAgo: 3 },
    { toolName: 'localhost:3012::delete_all', decision: AuditDecision.DENIED, daysAgo: 4 },
    { toolName: 'localhost:3005::execute', decision: AuditDecision.ALLOWED, daysAgo: 5 },
  ];

  for (const entry of auditData) {
    await prisma.auditLogEntry.create({
      data: {
        organizationId: org.id,
        userId: users[0].id,
        toolName: entry.toolName,
        parameters: {},
        decision: entry.decision,
        justification: entry.decision === AuditDecision.DENIED ? 'Blocked by DENY policy' : null,
        timestamp: daysAgo(entry.daysAgo),
        policyIds: [],
        matchedPolicyIds: [],
        userRoles: [],
      },
    });
  }
  console.log('Created', auditData.length, 'audit log entries');
`;
  }

  return `
  // Audit Log Entries (from captured data)
  const auditEntries = ${JSON.stringify(entries.slice(0, 30), null, 2)};

  for (const entry of auditEntries) {
    await prisma.auditLogEntry.create({
      data: {
        organizationId: org.id,
        userId: entry.userId,
        agentId: entry.agentId,
        toolName: entry.toolName,
        parameters: entry.parameters || {},
        decision: entry.decision as AuditDecision,
        justification: entry.justification,
        timestamp: new Date(entry.timestamp),
        policyIds: entry.policyIds || [],
        matchedPolicyIds: entry.matchedPolicyIds || [],
        userRoles: entry.userRoles || [],
      },
    });
  }
  console.log('Created', auditEntries.length, 'audit log entries');
`.trim();
}

function generateSummaryOutput(data: CapturedData): string {
  return `
  // Summary
  console.log('\\n=== Seed Summary ===');
  console.log('Organization:', org.name);
  console.log('Roles:', ${data.roles.length});
  console.log('Users:', ${data.users.length});
  console.log('Agents:', ${data.agents.length});
  console.log('MCP Servers:', ${data.mcpServers.length});
  console.log('MCP Tools:', ${data.mcpServers.reduce((acc, s) => acc + s.tools.length, 0)});
  console.log('Policies:', ${data.policies.length});
  console.log('Webhooks:', ${data.webhooks.length});
  console.log('==================\\n');
`.trim();
}

// ============================================================================
// Main Generator
// ============================================================================

function generateSeedTs(data: CapturedData): string {
  const mcpServerNotes = MCP_SERVERS.map((s) => {
    const skipNote = s.skipPolicies ? ' (NO POLICIES - intentionally unauthenticated)' : '';
    return ` * - ${s.name} (${s.url})${skipNote}`;
  }).join('\n');

  return `/**
 * SENTINEL Database Seed Script
 * Generated: ${new Date().toISOString()}
 * Source: Playwright automation against real MCP servers
 *
 * MCP Servers Used:
${mcpServerNotes}
 */

import 'dotenv/config';
import {
  PrismaClient,
  PolicyEffect,
  McpAuthType,
  AuditDecision,
  PermissionRequestStatus,
  ProtocolType,
  WebhookEndpointType,
} from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

${generateHelperFunctions()}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');
  console.log('Generated:', '${data.capturedAt}');

  ${generateOrganizationCode(data.organization)}

  ${generateRolesCode(data.roles)}

  ${generateUsersCode(data.users, data.roles)}

  ${generateAgentsCode(data.agents)}

  ${generateMcpServersCode(data.mcpServers)}

  ${generatePoliciesCode(data.policies)}

  ${generateWebhooksCode(data.webhooks)}

  ${generateAuditLogCode(data.auditLogEntries)}

  ${generateSummaryOutput(data)}

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Loading captured data...');

  let data: CapturedData;
  try {
    data = loadCapturedData();
  } catch (error) {
    console.error('Failed to load captured data:', error);
    console.error('Run the Playwright automation first:');
    console.error(
      '  npx playwright test test/seed-generation/generate-seed-data.spec.ts --config=test/seed-generation/playwright.config.ts',
    );
    process.exit(1);
  }

  console.log('Generating seed.ts...');
  const seedContent = generateSeedTs(data);

  // Backup existing seed.ts if it exists
  if (fs.existsSync(SEED_OUTPUT)) {
    const backupPath = SEED_OUTPUT.replace('.ts', '.backup.ts');
    fs.copyFileSync(SEED_OUTPUT, backupPath);
    console.log(`Backed up existing seed.ts to ${backupPath}`);
  }

  fs.writeFileSync(SEED_OUTPUT, seedContent);
  console.log(`\nSeed file generated at: ${SEED_OUTPUT}`);
  console.log(`Lines: ${seedContent.split('\n').length}`);

  // Validate TypeScript syntax
  console.log('\nValidating TypeScript syntax...');
  const { execSync } = await import('child_process');
  try {
    execSync(`npx tsc --noEmit ${SEED_OUTPUT}`, { stdio: 'inherit' });
    console.log('TypeScript validation passed!');
  } catch {
    console.warn('TypeScript validation failed - manual fixes may be needed');
  }
}

main().catch(console.error);
