/**
 * SENTINEL Demo Seed Script
 * Populates the database with realistic demo data for investor/customer conversations
 *
 * Run with: pnpm tsx scripts/seed-demo.ts
 */

import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import {
  AdminActionType,
  AdminResourceType,
  AuditDecision,
  McpAuthType,
  PermissionRequestStatus,
  PolicyEffect,
  Prisma,
  PrismaClient,
} from '../packages/db/src/generated/prisma/client.js';

// Create the PostgreSQL adapter
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

/**
 * Generate a random date within the past N days
 */
function randomDateInPast(maxDaysAgo: number): Date {
  const daysAgo = Math.random() * maxDaysAgo;
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  // Add some randomness to hours (business hours weighted)
  const hour =
    Math.random() > 0.3 ? Math.floor(Math.random() * 10) + 8 : Math.floor(Math.random() * 24);
  date.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
  return date;
}

/**
 * Generate a specific date in the past (days ago)
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(
    Math.floor(Math.random() * 10) + 9, // 9 AM - 7 PM
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
  );
  return date;
}

/**
 * Mock encryption for seed data (just JSON stringify)
 * In production, this would use AES-256-GCM
 */
function _encryptObject(obj: unknown): string {
  return JSON.stringify(obj);
}

function _encryptString(value: string): string {
  return JSON.stringify(value);
}

async function seedDemo() {
  console.log('🌱 Seeding demo data for Acme AI Labs...\n');

  // Check if demo org already exists
  const existingOrg = await prisma.organization.findFirst({
    where: { name: 'Acme AI Labs' },
  });

  if (existingOrg) {
    console.log('⚠️  Demo organization "Acme AI Labs" already exists.');
    console.log('   Run `pnpm db:clear` first to reset the database.\n');
    return;
  }

  // ==========================================================================
  // 1. CREATE ORGANIZATION
  // ==========================================================================
  const org = await prisma.organization.create({
    data: {
      name: 'Acme AI Labs',
    },
  });
  console.log('✅ Created organization:', org.name);

  // ==========================================================================
  // 2. CREATE ROLES
  // ==========================================================================
  const roles = await Promise.all([
    prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'Admin',
        isAdmin: true,
        description: 'Full administrative access to all tools and settings',
      },
    }),
    prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'Engineer',
        isAdmin: false,
        description: 'Software development team with access to dev tools',
      },
    }),
    prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'AI-Team',
        isAdmin: false,
        description: 'AI/ML development team with extended tool access',
      },
    }),
    prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'Support',
        isAdmin: false,
        description: 'Customer support team with communication tools',
      },
    }),
    prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'Analyst',
        isAdmin: false,
        description: 'Data and business analysts with reporting access',
      },
    }),
    prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'Contractor',
        isAdmin: false,
        description: 'External contractors with limited read-only access',
      },
    }),
  ]);

  const [adminRole, engineerRole, aiTeamRole, supportRole, analystRole, contractorRole] = roles;
  console.log('✅ Created', roles.length, 'roles:', roles.map((r) => r.name).join(', '));

  // ==========================================================================
  // 3. CREATE USERS
  // ==========================================================================
  const users = await Promise.all([
    // Admin
    prisma.user.create({
      data: {
        email: 'admin@acme.ai',
        organizationId: org.id,
        userRoles: { create: [{ roleId: adminRole.id }] },
        lastActivityAt: daysAgo(0),
      },
    }),
    // Sarah Chen - Lead Engineer + AI Team
    prisma.user.create({
      data: {
        email: 'sarah.chen@acme.ai',
        organizationId: org.id,
        userRoles: { create: [{ roleId: engineerRole.id }, { roleId: aiTeamRole.id }] },
        lastActivityAt: daysAgo(0),
      },
    }),
    // Mike Johnson - Backend Developer
    prisma.user.create({
      data: {
        email: 'mike.johnson@acme.ai',
        organizationId: org.id,
        userRoles: { create: [{ roleId: engineerRole.id }] },
        lastActivityAt: daysAgo(1),
      },
    }),
    // Lisa Wong - AI/ML Engineer
    prisma.user.create({
      data: {
        email: 'lisa.wong@acme.ai',
        organizationId: org.id,
        userRoles: { create: [{ roleId: aiTeamRole.id }] },
        lastActivityAt: daysAgo(0),
      },
    }),
    // David Kim - Customer Support
    prisma.user.create({
      data: {
        email: 'david.kim@acme.ai',
        organizationId: org.id,
        userRoles: { create: [{ roleId: supportRole.id }] },
        lastActivityAt: daysAgo(0),
      },
    }),
    // Emma Davis - Data Analyst
    prisma.user.create({
      data: {
        email: 'emma.davis@acme.ai',
        organizationId: org.id,
        userRoles: { create: [{ roleId: analystRole.id }] },
        lastActivityAt: daysAgo(2),
      },
    }),
    // James Wilson - External Contractor
    prisma.user.create({
      data: {
        email: 'james.wilson@acme.ai',
        organizationId: org.id,
        userRoles: { create: [{ roleId: contractorRole.id }] },
        lastActivityAt: daysAgo(1),
      },
    }),
    // Test User - No roles (new user)
    prisma.user.create({
      data: {
        email: 'test.user@acme.ai',
        organizationId: org.id,
        lastActivityAt: daysAgo(0),
      },
    }),
  ]);

  const [adminUser, sarah, mike, lisa, david, emma, james, testUser] = users;
  console.log('✅ Created', users.length, 'users');

  // ==========================================================================
  // 4. CREATE MCP SERVERS
  // ==========================================================================
  const githubServer = await prisma.mcpServer.create({
    data: {
      organizationId: org.id,
      name: 'GitHub',
      url: 'https://github-mcp.acme.ai',
      authType: McpAuthType.OAUTH,
      trusted: true,
      tools: {
        create: [
          { name: 'createPR', description: 'Create a new pull request' },
          { name: 'mergePR', description: 'Merge a pull request' },
          { name: 'createIssue', description: 'Create a new issue' },
          { name: 'closeIssue', description: 'Close an existing issue' },
          { name: 'createBranch', description: 'Create a new branch' },
          { name: 'deleteBranch', description: 'Delete a branch' },
          { name: 'pushCode', description: 'Push code to a repository' },
          { name: 'reviewPR', description: 'Review a pull request' },
          { name: 'getFile', description: 'Get file contents' },
          { name: 'listRepos', description: 'List repositories' },
        ],
      },
    },
  });

  const _notionServer = await prisma.mcpServer.create({
    data: {
      organizationId: org.id,
      name: 'Notion',
      url: 'https://notion-mcp.acme.ai',
      authType: McpAuthType.OAUTH,
      trusted: true,
      tools: {
        create: [
          { name: 'createPage', description: 'Create a new page' },
          { name: 'updatePage', description: 'Update an existing page' },
          { name: 'deletePage', description: 'Delete a page' },
          { name: 'queryDatabase', description: 'Query a database' },
          { name: 'createDatabase', description: 'Create a new database' },
        ],
      },
    },
  });

  const _slackServer = await prisma.mcpServer.create({
    data: {
      organizationId: org.id,
      name: 'Slack',
      url: 'https://slack-mcp.acme.ai',
      authType: McpAuthType.API_KEY,
      trusted: true,
      tools: {
        create: [
          { name: 'sendMessage', description: 'Send a message to a channel' },
          { name: 'createChannel', description: 'Create a new channel' },
          { name: 'inviteUser', description: 'Invite a user to a channel' },
          { name: 'uploadFile', description: 'Upload a file to a channel' },
        ],
      },
    },
  });

  const _awsServer = await prisma.mcpServer.create({
    data: {
      organizationId: org.id,
      name: 'AWS Console',
      url: 'https://aws-mcp.acme.ai',
      authType: McpAuthType.API_KEY,
      trusted: false, // Untrusted - requires explicit policies
      tools: {
        create: [
          { name: 'launchInstance', description: 'Launch an EC2 instance' },
          { name: 'terminateInstance', description: 'Terminate an EC2 instance' },
          { name: 'createBucket', description: 'Create an S3 bucket' },
          { name: 'deleteBucket', description: 'Delete an S3 bucket' },
          { name: 'modifySecurityGroup', description: 'Modify a security group' },
        ],
      },
    },
  });

  const _internalServer = await prisma.mcpServer.create({
    data: {
      organizationId: org.id,
      name: 'Internal Tools',
      url: 'https://internal.acme.ai/mcp',
      authType: McpAuthType.NONE,
      trusted: true,
      tools: {
        create: [
          { name: 'getMetrics', description: 'Get system metrics' },
          { name: 'generateReport', description: 'Generate a business report' },
          { name: 'sendNotification', description: 'Send an internal notification' },
        ],
      },
    },
  });

  console.log(
    '✅ Created 5 MCP servers with',
    await prisma.mcpTool.count({ where: { mcpServer: { organizationId: org.id } } }),
    'tools',
  );

  // ==========================================================================
  // 5. CREATE POLICIES
  // ==========================================================================
  const policies = await Promise.all([
    // 1. Admin full access
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'admin-full-access',
        matchers: ['role:Admin'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
        description: 'Admins can access all tools',
        enabled: true,
      },
    }),
    // 2. Block destructive AWS operations for everyone
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'block-aws-production',
        matchers: ['*'],
        toolPatterns: [
          'aws-mcp.acme.ai::terminateInstance',
          'aws-mcp.acme.ai::deleteBucket',
          'aws-mcp.acme.ai::modifySecurityGroup',
        ],
        effect: PolicyEffect.DENY,
        description: 'Block destructive AWS operations for everyone',
        enabled: true,
      },
    }),
    // 3. Engineers can use all GitHub tools
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'engineers-github',
        matchers: ['role:Engineer', 'role:AI-Team'],
        toolPatterns: ['github-mcp.acme.ai::*'],
        effect: PolicyEffect.ALLOW,
        description: 'Engineers can use all GitHub tools',
        enabled: true,
      },
    }),
    // 4. Engineers can query Notion databases
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'engineers-notion-read',
        matchers: ['role:Engineer'],
        toolPatterns: ['notion-mcp.acme.ai::queryDatabase'],
        effect: PolicyEffect.ALLOW,
        description: 'Engineers can query Notion databases',
        enabled: true,
      },
    }),
    // 5. AI team has full Notion access
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'ai-team-notion',
        matchers: ['role:AI-Team'],
        toolPatterns: ['notion-mcp.acme.ai::*'],
        effect: PolicyEffect.ALLOW,
        description: 'AI team has full Notion access',
        enabled: true,
      },
    }),
    // 6. Support can send Slack messages
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'support-slack',
        matchers: ['role:Support'],
        toolPatterns: ['slack-mcp.acme.ai::sendMessage', 'slack-mcp.acme.ai::uploadFile'],
        effect: PolicyEffect.ALLOW,
        description: 'Support can send Slack messages',
        enabled: true,
      },
    }),
    // 7. Analysts can generate reports
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'analysts-reports',
        matchers: ['role:Analyst'],
        toolPatterns: ['internal.acme.ai::getMetrics', 'internal.acme.ai::generateReport'],
        effect: PolicyEffect.ALLOW,
        description: 'Analysts can generate reports',
        enabled: true,
      },
    }),
    // 8. Contractors get read-only access
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'contractors-readonly',
        matchers: ['role:Contractor'],
        toolPatterns: ['*::get*', '*::list*', '*::query*'],
        effect: PolicyEffect.ALLOW,
        description: 'Contractors get read-only access',
        enabled: true,
      },
    }),
    // 9. Block write operations for contractors
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'block-contractors-write',
        matchers: ['role:Contractor'],
        toolPatterns: ['*::create*', '*::update*', '*::delete*', '*::push*'],
        effect: PolicyEffect.DENY,
        description: 'Block write operations for contractors',
        enabled: true,
      },
    }),
    // 10. Sarah gets special AWS access
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'sarah-extra-aws',
        matchers: ['user:sarah.chen@acme.ai'],
        toolPatterns: ['aws-mcp.acme.ai::launchInstance'],
        effect: PolicyEffect.ALLOW,
        description: 'Sarah specifically allowed to launch instances',
        enabled: true,
      },
    }),
    // 11. Block all access for unassigned users
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'block-new-users',
        matchers: ['user:test.user@acme.ai'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.DENY,
        description: 'Block all access for unassigned users',
        enabled: true,
      },
    }),
    // 12. AI team can create staging resources
    prisma.policy.create({
      data: {
        organizationId: org.id,
        slug: 'ai-team-aws-staging',
        matchers: ['role:AI-Team'],
        toolPatterns: ['aws-mcp.acme.ai::launchInstance', 'aws-mcp.acme.ai::createBucket'],
        effect: PolicyEffect.ALLOW,
        description: 'AI team can create staging resources',
        enabled: true,
      },
    }),
  ]);

  console.log('✅ Created', policies.length, 'policies');

  // ==========================================================================
  // 6. CREATE AGENTS
  // ==========================================================================
  const agents = await Promise.all([
    prisma.agent.create({
      data: {
        organizationId: org.id,
        name: 'CodeReviewBot',
      },
    }),
    prisma.agent.create({
      data: {
        organizationId: org.id,
        name: 'DeploymentAgent',
      },
    }),
    prisma.agent.create({
      data: {
        organizationId: org.id,
        name: 'SupportBot',
      },
    }),
  ]);

  console.log('✅ Created', agents.length, 'agents:', agents.map((a) => a.name).join(', '));

  // ==========================================================================
  // 7. CREATE AUDIT LOG ENTRIES (50+ entries)
  // ==========================================================================
  const auditEntries: Prisma.AuditLogEntryUncheckedCreateInput[] = [];

  // Helper to create audit entries
  const addAuditEntry = (
    userId: string | null,
    agentId: string | null,
    toolName: string,
    parameters: Prisma.InputJsonValue,
    decision: AuditDecision,
    justification: string | null,
    timestamp: Date,
    userEmail?: string | null,
    userRoles?: string[],
    agentName?: string | null,
    matchedPolicyIds?: string[],
  ) => {
    auditEntries.push({
      organizationId: org.id,
      userId,
      agentId,
      toolName,
      parameters,
      decision,
      justification,
      policyIds: matchedPolicyIds ?? [],
      matchedPolicyIds: matchedPolicyIds ?? [],
      policySnapshot: {},
      userEmail,
      userRoles: userRoles ?? [],
      agentName,
      timestamp,
    });
  };

  // Sarah's activity (heavy user - lead engineer)
  addAuditEntry(
    sarah.id,
    null,
    'GitHub::createPR',
    { repo: 'acme/api', title: 'Add auth refactor' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.1),
    sarah.email,
    ['Engineer', 'AI-Team'],
  );
  addAuditEntry(
    sarah.id,
    null,
    'GitHub::mergePR',
    { repo: 'acme/api', pr: 142 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.2),
    sarah.email,
    ['Engineer', 'AI-Team'],
  );
  addAuditEntry(
    sarah.id,
    null,
    'GitHub::pushCode',
    { repo: 'acme/api', branch: 'main' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.5),
    sarah.email,
    ['Engineer', 'AI-Team'],
  );
  addAuditEntry(
    sarah.id,
    null,
    'Notion::createPage',
    { parent: 'Engineering', title: 'API Docs' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1),
    sarah.email,
    ['Engineer', 'AI-Team'],
  );
  addAuditEntry(
    sarah.id,
    null,
    'AWS Console::launchInstance',
    { type: 't3.medium', count: 1 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1.5),
    sarah.email,
    ['Engineer', 'AI-Team'],
  );
  addAuditEntry(
    sarah.id,
    null,
    'GitHub::createBranch',
    { repo: 'acme/ml', branch: 'feature/llm-v2' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(2),
    sarah.email,
    ['Engineer', 'AI-Team'],
  );

  // Mike's activity (backend developer)
  addAuditEntry(
    mike.id,
    null,
    'GitHub::createPR',
    { repo: 'acme/backend', title: 'Fix database connection' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.3),
    mike.email,
    ['Engineer'],
  );
  addAuditEntry(
    mike.id,
    null,
    'GitHub::pushCode',
    { repo: 'acme/backend', branch: 'fix/db' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.8),
    mike.email,
    ['Engineer'],
  );
  addAuditEntry(
    mike.id,
    null,
    'Notion::queryDatabase',
    { db: 'tasks' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1.2),
    mike.email,
    ['Engineer'],
  );
  addAuditEntry(
    mike.id,
    null,
    'AWS Console::terminateInstance',
    { instanceId: 'i-12345' },
    AuditDecision.DENIED,
    'Blocked by policy: block-aws-production',
    daysAgo(2),
    mike.email,
    ['Engineer'],
  );
  addAuditEntry(
    mike.id,
    null,
    'GitHub::reviewPR',
    { repo: 'acme/api', pr: 140 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(3),
    mike.email,
    ['Engineer'],
  );

  // Lisa's activity (AI/ML engineer)
  addAuditEntry(
    lisa.id,
    null,
    'Notion::createPage',
    { parent: 'ML', title: 'Model Training Log' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.4),
    lisa.email,
    ['AI-Team'],
  );
  addAuditEntry(
    lisa.id,
    null,
    'AWS Console::launchInstance',
    { type: 'p3.2xlarge', count: 1 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.6),
    lisa.email,
    ['AI-Team'],
  );
  addAuditEntry(
    lisa.id,
    null,
    'AWS Console::createBucket',
    { name: 'acme-ml-data-staging' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1),
    lisa.email,
    ['AI-Team'],
  );
  addAuditEntry(
    lisa.id,
    null,
    'Notion::updatePage',
    { pageId: 'page123', content: 'Updated results' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(2),
    lisa.email,
    ['AI-Team'],
  );

  // David's activity (support)
  addAuditEntry(
    david.id,
    null,
    'Slack::sendMessage',
    { channel: '#support', message: 'Ticket resolved' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.2),
    david.email,
    ['Support'],
  );
  addAuditEntry(
    david.id,
    null,
    'Slack::sendMessage',
    { channel: '#customers', message: 'Update on issue' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.5),
    david.email,
    ['Support'],
  );
  addAuditEntry(
    david.id,
    null,
    'Slack::uploadFile',
    { channel: '#support', file: 'screenshot.png' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1),
    david.email,
    ['Support'],
  );
  addAuditEntry(
    david.id,
    null,
    'GitHub::createPR',
    { repo: 'acme/docs', title: 'Update FAQ' },
    AuditDecision.DENIED,
    'No matching ALLOW policy',
    daysAgo(2),
    david.email,
    ['Support'],
  );

  // Emma's activity (analyst)
  addAuditEntry(
    emma.id,
    null,
    'Internal Tools::getMetrics',
    { range: 'last_7_days' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.3),
    emma.email,
    ['Analyst'],
  );
  addAuditEntry(
    emma.id,
    null,
    'Internal Tools::generateReport',
    { type: 'usage', format: 'pdf' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1),
    emma.email,
    ['Analyst'],
  );
  addAuditEntry(
    emma.id,
    null,
    'GitHub::listRepos',
    {},
    AuditDecision.DENIED,
    'No matching ALLOW policy',
    daysAgo(2),
    emma.email,
    ['Analyst'],
  );

  // James's activity (contractor - should see denials)
  addAuditEntry(
    james.id,
    null,
    'GitHub::getFile',
    { repo: 'acme/api', path: 'README.md' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.1),
    james.email,
    ['Contractor'],
  );
  addAuditEntry(
    james.id,
    null,
    'GitHub::listRepos',
    {},
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.3),
    james.email,
    ['Contractor'],
  );
  addAuditEntry(
    james.id,
    null,
    'GitHub::pushCode',
    { repo: 'acme/api', branch: 'fix/typo' },
    AuditDecision.DENIED,
    'Blocked by policy: block-contractors-write',
    daysAgo(0.5),
    james.email,
    ['Contractor'],
  );
  addAuditEntry(
    james.id,
    null,
    'GitHub::createPR',
    { repo: 'acme/api', title: 'Fix typo' },
    AuditDecision.DENIED,
    'Blocked by policy: block-contractors-write',
    daysAgo(1),
    james.email,
    ['Contractor'],
  );
  addAuditEntry(
    james.id,
    null,
    'Notion::queryDatabase',
    { db: 'docs' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1.5),
    james.email,
    ['Contractor'],
  );
  addAuditEntry(
    james.id,
    null,
    'Notion::createPage',
    { parent: 'Docs', title: 'My notes' },
    AuditDecision.DENIED,
    'Blocked by policy: block-contractors-write',
    daysAgo(2),
    james.email,
    ['Contractor'],
  );

  // Test user activity (all blocked)
  addAuditEntry(
    testUser.id,
    null,
    'Slack::sendMessage',
    { channel: '#general', message: 'Hello' },
    AuditDecision.DENIED,
    'Blocked by policy: block-new-users',
    daysAgo(0.5),
    testUser.email,
    [],
  );
  addAuditEntry(
    testUser.id,
    null,
    'GitHub::listRepos',
    {},
    AuditDecision.DENIED,
    'Blocked by policy: block-new-users',
    daysAgo(1),
    testUser.email,
    [],
  );

  // Agent activity (automated tools)
  addAuditEntry(
    null,
    agents[0].id,
    'GitHub::reviewPR',
    { repo: 'acme/api', pr: 142 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.2),
    null,
    [],
    'CodeReviewBot',
  );
  addAuditEntry(
    null,
    agents[0].id,
    'GitHub::reviewPR',
    { repo: 'acme/backend', pr: 89 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.5),
    null,
    [],
    'CodeReviewBot',
  );
  addAuditEntry(
    null,
    agents[0].id,
    'GitHub::reviewPR',
    { repo: 'acme/ml', pr: 31 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(1),
    null,
    [],
    'CodeReviewBot',
  );
  addAuditEntry(
    null,
    agents[1].id,
    'AWS Console::launchInstance',
    { type: 't3.small', count: 2 },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.8),
    null,
    [],
    'DeploymentAgent',
  );
  addAuditEntry(
    null,
    agents[2].id,
    'Slack::sendMessage',
    { channel: '#support', message: 'Auto-reply sent' },
    AuditDecision.ALLOWED,
    null,
    daysAgo(0.3),
    null,
    [],
    'SupportBot',
  );

  // More historical entries spread over past week
  for (let i = 0; i < 20; i++) {
    const randomUser = users[Math.floor(Math.random() * (users.length - 1))]; // Exclude test user
    const tools = [
      { name: 'GitHub::getFile', decision: AuditDecision.ALLOWED },
      { name: 'GitHub::listRepos', decision: AuditDecision.ALLOWED },
      { name: 'Notion::queryDatabase', decision: AuditDecision.ALLOWED },
      { name: 'Internal Tools::getMetrics', decision: AuditDecision.ALLOWED },
    ];
    const tool = tools[Math.floor(Math.random() * tools.length)];
    addAuditEntry(
      randomUser.id,
      null,
      tool.name,
      {},
      tool.decision,
      null,
      randomDateInPast(7),
      randomUser.email,
      ['Engineer'],
    );
  }

  // Create all audit entries
  await prisma.auditLogEntry.createMany({ data: auditEntries });
  console.log('✅ Created', auditEntries.length, 'audit log entries');

  // ==========================================================================
  // 8. CREATE PERMISSION REQUESTS
  // ==========================================================================
  const permissionRequests = await Promise.all([
    // James (contractor) wants to push code - PENDING
    prisma.permissionRequest.create({
      data: {
        userId: james.id,
        status: PermissionRequestStatus.PENDING,
        reason: 'Need to push hotfix for client issue',
        toolNames: ['github-mcp.acme.ai::pushCode'],
        createdAt: daysAgo(1),
        updatedAt: daysAgo(1),
      },
    }),
    // Test user wants Slack access - PENDING
    prisma.permissionRequest.create({
      data: {
        userId: testUser.id,
        status: PermissionRequestStatus.PENDING,
        reason: 'Just joined, need to communicate with team',
        toolNames: ['slack-mcp.acme.ai::sendMessage'],
        createdAt: daysAgo(0.5),
        updatedAt: daysAgo(0.5),
      },
    }),
    // David (support) got Notion access - APPROVED
    prisma.permissionRequest.create({
      data: {
        userId: david.id,
        status: PermissionRequestStatus.APPROVED,
        reason: 'Need to document support procedures',
        toolNames: ['notion-mcp.acme.ai::createPage'],
        reviewedBy: adminUser.id,
        reviewedAt: daysAgo(3),
        reviewNote: 'Approved - added to support documentation team',
        createdAt: daysAgo(5),
        updatedAt: daysAgo(3),
      },
    }),
    // Mike wanted AWS access - DENIED
    prisma.permissionRequest.create({
      data: {
        userId: mike.id,
        status: PermissionRequestStatus.DENIED,
        reason: 'Wanted to test new deployment',
        toolNames: ['aws-mcp.acme.ai::launchInstance'],
        reviewedBy: adminUser.id,
        reviewedAt: daysAgo(4),
        reviewNote: 'Denied - use staging environment via DeploymentAgent instead',
        createdAt: daysAgo(6),
        updatedAt: daysAgo(4),
      },
    }),
    // Lisa wants HuggingFace MCP - PENDING
    prisma.permissionRequest.create({
      data: {
        userId: lisa.id,
        status: PermissionRequestStatus.PENDING,
        reason: 'Need access to model inference API',
        toolNames: [],
        data: {
          type: 'MCP_SERVER',
          name: 'HuggingFace',
          url: 'https://hf-mcp.acme.ai',
          authType: 'API_KEY',
        },
        createdAt: daysAgo(2),
        updatedAt: daysAgo(2),
      },
    }),
  ]);

  console.log('✅ Created', permissionRequests.length, 'permission requests');

  // ==========================================================================
  // 9. CREATE ADMIN ACTION LOGS
  // ==========================================================================
  const adminActions: Prisma.AdminActionLogUncheckedCreateInput[] = [
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.POLICY_CREATE,
      resourceType: AdminResourceType.POLICY,
      resourceId: policies[0].id,
      resourceName: 'admin-full-access',
      actionDetails: { slug: 'admin-full-access', effect: 'ALLOW' },
      timestamp: daysAgo(7),
    },
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.POLICY_CREATE,
      resourceType: AdminResourceType.POLICY,
      resourceId: policies[1].id,
      resourceName: 'block-aws-production',
      actionDetails: { slug: 'block-aws-production', effect: 'DENY' },
      timestamp: daysAgo(7),
    },
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.USER_CREATE,
      resourceType: AdminResourceType.USER,
      resourceId: sarah.id,
      resourceName: 'sarah.chen@acme.ai',
      actionDetails: { email: 'sarah.chen@acme.ai', roles: ['Engineer', 'AI-Team'] },
      timestamp: daysAgo(6),
    },
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.MCP_SERVER_CREATE,
      resourceType: AdminResourceType.MCP_SERVER,
      resourceId: githubServer.id,
      resourceName: 'GitHub',
      actionDetails: { name: 'GitHub', authType: 'OAUTH', trusted: true },
      timestamp: daysAgo(6),
    },
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.PERMISSION_REQUEST_APPROVE,
      resourceType: AdminResourceType.PERMISSION_REQUEST,
      resourceId: permissionRequests[2].id,
      resourceName: 'david.kim@acme.ai',
      actionDetails: { tools: ['notion-mcp.acme.ai::createPage'] },
      timestamp: daysAgo(3),
    },
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.PERMISSION_REQUEST_DENY,
      resourceType: AdminResourceType.PERMISSION_REQUEST,
      resourceId: permissionRequests[3].id,
      resourceName: 'mike.johnson@acme.ai',
      actionDetails: { tools: ['aws-mcp.acme.ai::launchInstance'], reason: 'Use staging instead' },
      timestamp: daysAgo(4),
    },
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.POLICY_UPDATE,
      resourceType: AdminResourceType.POLICY,
      resourceId: policies[2].id,
      resourceName: 'engineers-github',
      actionDetails: { added: ['role:AI-Team'] },
      timestamp: daysAgo(5),
    },
    {
      organizationId: org.id,
      adminUserId: adminUser.id,
      actionType: AdminActionType.USER_ROLES_UPDATE,
      resourceType: AdminResourceType.USER,
      resourceId: james.id,
      resourceName: 'james.wilson@acme.ai',
      actionDetails: { added: ['Contractor'], removed: [] },
      timestamp: daysAgo(5),
    },
  ];

  await prisma.adminActionLog.createMany({ data: adminActions });
  console.log('✅ Created', adminActions.length, 'admin action logs');

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n🎉 Demo data seeded successfully!\n');
  console.log('📊 Summary:');
  console.log(`   ✅ Organization: ${org.name}`);
  console.log(`   ✅ ${roles.length} roles`);
  console.log(`   ✅ ${users.length} users`);
  console.log(`   ✅ ${agents.length} agents`);
  console.log(`   ✅ 5 MCP servers`);
  console.log(`   ✅ ${policies.length} policies`);
  console.log(`   ✅ ${auditEntries.length} audit log entries`);
  console.log(`   ✅ ${permissionRequests.length} permission requests`);
  console.log(`   ✅ ${adminActions.length} admin action logs`);

  console.log('\n📝 Demo Users:');
  console.log('   Admin: admin@acme.ai');
  console.log('   Token:', adminUser.accessToken);
  console.log('\n   Lead Engineer: sarah.chen@acme.ai (Engineer, AI-Team)');
  console.log('   Token:', sarah.accessToken);
  console.log('\n   Contractor: james.wilson@acme.ai (Contractor - blocked from writes)');
  console.log('   Token:', james.accessToken);
  console.log('\n   New User: test.user@acme.ai (No roles - blocked from everything)');
  console.log('   Token:', testUser.accessToken);

  console.log('\n🔍 Demo Scenarios:');
  console.log('   1. Show audit log - mix of ALLOWED/DENIED decisions');
  console.log('   2. Show policy evaluation - contractors blocked from pushCode');
  console.log('   3. Show permission requests - pending, approved, denied');
  console.log("   4. Show Sarah's special AWS access (user-specific policy)");
  console.log('   5. Show test.user completely blocked (no roles = no access)');
}

seedDemo()
  .catch((e) => {
    console.error('❌ Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
