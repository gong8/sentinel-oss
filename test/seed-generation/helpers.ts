/**
 * Seed Generation Helpers
 * Utilities for Discord notifications, data capture, and seed generation
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface CapturedOrganization {
  id: string;
  name: string;
  createdAt: Date;
}

export interface CapturedRole {
  id: string;
  organizationId: string;
  name: string;
  isAdmin: boolean;
  description: string | null;
  createdAt: Date;
}

export interface CapturedUser {
  id: string;
  organizationId: string;
  email: string;
  accessToken: string;
  roleNames: string[];
  createdAt: Date;
}

export interface CapturedAgent {
  id: string;
  organizationId: string;
  name: string;
  protocolType: string;
  createdAt: Date;
}

export interface CapturedMcpServer {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  authType: string;
  trusted: boolean;
  tools: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
  createdAt: Date;
}

export interface CapturedPolicy {
  id: string;
  organizationId: string;
  slug: string;
  matchers: string[];
  toolPatterns: string[];
  effect: 'ALLOW' | 'DENY';
  description: string | null;
  enabled: boolean;
  createdAt: Date;
}

export interface CapturedAuditEntry {
  id: string;
  organizationId: string;
  userId: string | null;
  agentId: string | null;
  toolName: string;
  parameters: unknown;
  decision: 'ALLOWED' | 'DENIED';
  justification: string | null;
  timestamp: Date;
}

export interface CapturedWebhook {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  url: string;
  events: string[];
  enabled: boolean;
}

export interface CapturedPermissionRequest {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  status: string;
  reason: string | null;
  toolNames: string[];
  reviewedAt: Date | null;
  reviewNote: string | null;
}

export interface CapturedSensitiveFlag {
  id: string;
  organizationId: string;
  toolPattern: string;
  behaviors: string[];
  description: string | null;
  enabled: boolean;
  rateLimitConfig: Record<string, unknown> | null;
  approvalConfig: Record<string, unknown> | null;
  alertConfig: Record<string, unknown> | null;
}

export interface CapturedPolicyAssertion {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  toolPattern: string;
  contextType: string;
  roleName: string | null;
  expectedDecision: string;
  enabled: boolean;
}

export interface CapturedData {
  capturedAt: string;
  organization: CapturedOrganization | null;
  roles: CapturedRole[];
  users: CapturedUser[];
  agents: CapturedAgent[];
  mcpServers: CapturedMcpServer[];
  policies: CapturedPolicy[];
  auditLogEntries: CapturedAuditEntry[];
  webhooks: CapturedWebhook[];
  permissionRequests: CapturedPermissionRequest[];
  sensitiveFlags: CapturedSensitiveFlag[];
  policyAssertions: CapturedPolicyAssertion[];
}

// ============================================================================
// Hardcoded MCP Servers (from command requirements)
// ============================================================================

export const MCP_SERVERS = [
  // Notion Official - unauthenticated, no policies
  {
    name: 'Notion (Official)',
    url: 'https://mcp.notion.com/mcp',
    authType: 'OAUTH' as const,
    trusted: false, // Unauthenticated
    skipPolicies: true, // NO policies for this server's tools
    skipHealthCheck: true, // External server, don't check health
  },
  {
    name: 'crucible-trader',
    url: 'http://localhost:3012/mcp',
    authType: 'NONE' as const,
    trusted: true,
    skipPolicies: false,
  },
  {
    name: 'useless-server',
    url: 'http://localhost:3005/mcp',
    authType: 'NONE' as const,
    trusted: true,
    skipPolicies: false,
  },
  {
    name: 'notion-local',
    url: 'http://localhost:3006/mcp',
    authType: 'API_KEY' as const,
    trusted: true,
    skipPolicies: false,
    apiKeyEnvVar: 'NOTION_PROXY_KEY',
  },
] as const;

// ============================================================================
// A2A Agents (Agent-to-Agent Protocol - stored in Agent model, NOT McpServer)
// ============================================================================

export const A2A_AGENTS = [
  {
    name: 'hello-world',
    endpointUrl: 'http://localhost:9999',
    agentCardUrl: 'http://localhost:9999/.well-known/agent.json',
    description: 'Sample A2A hello-world agent for testing',
  },
] as const;

// ============================================================================
// Discord Notifications
// ============================================================================

export async function sendDiscordNotification(
  stage: string,
  status: 'started' | 'success' | 'error' | 'info',
  details?: string,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  if (!webhookUrl) {
    console.log(`[Discord] No webhook configured. Stage: ${stage}, Status: ${status}`);
    return;
  }

  const colors = {
    started: 0x3b82f6, // Blue
    success: 0x22c55e, // Green
    error: 0xef4444, // Red
    info: 0x6b7280, // Gray
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `Seed Regeneration: ${stage}`,
            description: details || `Stage ${status}`,
            color: colors[status],
            timestamp: new Date().toISOString(),
            footer: { text: 'SENTINEL Seed Generator' },
          },
        ],
      }),
    });
  } catch (error) {
    console.error(`[Discord] Failed to send notification:`, error);
  }
}

// ============================================================================
// Data Capture
// ============================================================================

const CAPTURE_DIR = path.join(__dirname, '.seed-capture');

export function initializeCapturedData(): CapturedData {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });

  return {
    capturedAt: new Date().toISOString(),
    organization: null,
    roles: [],
    users: [],
    agents: [],
    mcpServers: [],
    policies: [],
    auditLogEntries: [],
    webhooks: [],
    permissionRequests: [],
    sensitiveFlags: [],
    policyAssertions: [],
  };
}

export function saveCapturedData(data: CapturedData): string {
  const filePath = path.join(CAPTURE_DIR, 'captured-data.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[Capture] Saved data to ${filePath}`);
  return filePath;
}

export function loadCapturedData(): CapturedData {
  const filePath = path.join(CAPTURE_DIR, 'captured-data.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Captured data not found at ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function savePartialData(data: CapturedData, phase: string): void {
  const filePath = path.join(CAPTURE_DIR, `partial-${phase}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[Capture] Saved partial data for phase ${phase}`);
}

// ============================================================================
// MCP Server Health Check
// ============================================================================

export async function checkMcpServerHealth(url: string): Promise<boolean> {
  try {
    // Try the /health endpoint first
    const healthUrl = url.replace(/\/mcp$/, '/health');
    const response = await fetch(healthUrl, { method: 'GET' });
    if (response.ok) return true;
  } catch {
    // Health endpoint failed, try other methods
  }

  try {
    // Fallback to GET on the main URL (some servers return 405 for GET)
    const response = await fetch(url, { method: 'GET' });
    if (response.ok || response.status === 405) return true;
  } catch {
    // GET failed, try POST
  }

  try {
    // Last resort: try POST to MCP endpoint (MCP servers require POST)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Any response (even error) means server is up
    return response.status !== 0;
  } catch {
    return false;
  }
}

export async function getAvailableMcpServers(): Promise<(typeof MCP_SERVERS)[number][]> {
  const available: (typeof MCP_SERVERS)[number][] = [];

  for (const server of MCP_SERVERS) {
    // Skip health check for external servers (like Notion Official)
    if ('skipHealthCheck' in server && server.skipHealthCheck) {
      available.push(server);
      console.log(`[MCP] ${server.name}: INCLUDED (health check skipped)`);
      continue;
    }

    const isHealthy = await checkMcpServerHealth(server.url);
    if (isHealthy) {
      available.push(server);
      console.log(`[MCP] ${server.name}: AVAILABLE`);
    } else {
      console.log(`[MCP] ${server.name}: NOT AVAILABLE (skipping)`);
    }
  }

  return available;
}

// ============================================================================
// Archive Management
// ============================================================================

export function createArchiveDirectory(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveDir = path.join(__dirname, '../../packages/db/prisma/seed-archives', timestamp);
  fs.mkdirSync(archiveDir, { recursive: true });
  return archiveDir;
}

export function archiveExistingSeeds(archiveDir: string): void {
  const seedPath = path.join(__dirname, '../../packages/db/prisma/seed.ts');
  const minimalPath = path.join(__dirname, '../../packages/db/prisma/seed-minimal.ts');

  if (fs.existsSync(seedPath)) {
    fs.copyFileSync(seedPath, path.join(archiveDir, 'seed.ts'));
    console.log(`[Archive] Backed up seed.ts`);
  }

  if (fs.existsSync(minimalPath)) {
    fs.copyFileSync(minimalPath, path.join(archiveDir, 'seed-minimal.ts'));
    console.log(`[Archive] Backed up seed-minimal.ts`);
  }
}

// ============================================================================
// User/Role Data for Seeding
// ============================================================================

export const SEED_ROLES = [
  { name: 'Admin', isAdmin: true, description: 'Full administrative access' },
  { name: 'Developer', isAdmin: false, description: 'Development team access' },
  { name: 'Manager', isAdmin: false, description: 'Project management access' },
  { name: 'Viewer', isAdmin: false, description: 'Read-only access' },
];

export const SEED_USERS = [
  { email: 'admin@acme.com', roles: ['Admin'], description: 'Primary admin' },
  { email: 'alice@acme.com', roles: ['Developer'], description: 'Senior Developer' },
  { email: 'bob@acme.com', roles: ['Developer'], description: 'Junior Developer' },
  { email: 'carol@acme.com', roles: ['Manager'], description: 'Project Manager' },
  { email: 'dave@acme.com', roles: ['Viewer'], description: 'External Viewer' },
  { email: 'eve@acme.com', roles: ['Developer', 'Manager'], description: 'Tech Lead (dual role)' },
];

export const SEED_AGENTS = [
  { name: 'Development Agent', description: 'Automated development tasks' },
  { name: 'Documentation Agent', description: 'Documentation generation' },
  { name: 'Support Agent', description: 'Customer support automation' },
];

// ============================================================================
// Policy Templates (excluding Notion Official tools)
// ============================================================================

export function generatePolicyTemplates(mcpServers: CapturedMcpServer[]): Array<{
  matcher: string;
  toolPattern: string;
  effect: 'ALLOW' | 'DENY';
  description: string;
}> {
  const policies: Array<{
    matcher: string;
    toolPattern: string;
    effect: 'ALLOW' | 'DENY';
    description: string;
  }> = [];

  // Get servers that should have policies (exclude Notion Official)
  const policyServers = mcpServers.filter((s) => {
    const serverConfig = MCP_SERVERS.find((cfg) => cfg.url === s.url);
    return serverConfig && !serverConfig.skipPolicies;
  });

  // Find specific servers for targeted policies
  const crucible = policyServers.find((s) => s.name === 'crucible-trader');
  const notionLocal = policyServers.find((s) => s.name === 'notion-local');

  // ========================================
  // ALLOW Policies (5 policies)
  // ========================================

  // 1. Admin: Full access to everything
  policies.push({
    matcher: 'role:Admin',
    toolPattern: '*::*',
    effect: 'ALLOW',
    description: 'Admins have full access to all tools',
  });

  // 2. Developer: Full access to everything
  policies.push({
    matcher: 'role:Developer',
    toolPattern: '*::*',
    effect: 'ALLOW',
    description: 'Developers can use all tools',
  });

  // 3. Manager: Only notion-local access
  if (notionLocal) {
    policies.push({
      matcher: 'role:Manager',
      toolPattern: `${new URL(notionLocal.url).host}::*`,
      effect: 'ALLOW',
      description: 'Managers can use notion-local for documentation',
    });
  }

  // 4. Viewer: Read-only access (get_* and list_* tools)
  policies.push({
    matcher: 'role:Viewer',
    toolPattern: '*::get_*',
    effect: 'ALLOW',
    description: 'Viewers can use read-only tools (get_*)',
  });

  policies.push({
    matcher: 'role:Viewer',
    toolPattern: '*::list_*',
    effect: 'ALLOW',
    description: 'Viewers can use read-only tools (list_*)',
  });

  // 5. Agents: Full access
  policies.push({
    matcher: 'agent:*',
    toolPattern: '*::*',
    effect: 'ALLOW',
    description: 'Agents have access to all tools',
  });

  // ========================================
  // DENY Policies (4 policies)
  // ========================================

  // 6. Block submit_optimization globally (use rate limits instead via sensitive flags)
  if (crucible) {
    policies.push({
      matcher: '*',
      toolPattern: `${new URL(crucible.url).host}::submit_optimization`,
      effect: 'DENY',
      description: 'Block optimization submissions (controlled via sensitive flags)',
    });
  }

  // 7. Viewers cannot submit anything
  policies.push({
    matcher: 'role:Viewer',
    toolPattern: '*::submit_*',
    effect: 'DENY',
    description: 'Viewers cannot submit backtests or optimizations',
  });

  // 8. Block all delete operations globally
  policies.push({
    matcher: '*',
    toolPattern: '*::delete_*',
    effect: 'DENY',
    description: 'Block all destructive delete operations',
  });

  // 9. Viewers cannot run tests or builds
  policies.push({
    matcher: 'role:Viewer',
    toolPattern: '*::run_*',
    effect: 'DENY',
    description: 'Viewers cannot run tests or builds',
  });

  return policies; // ~10 policies total
}

// ============================================================================
// Sensitive Flag Templates
// ============================================================================

export interface SeedSensitiveFlag {
  toolPattern: string;
  behaviors: ('REQUIRE_APPROVAL' | 'RATE_LIMIT' | 'ALERT')[];
  description: string;
  rateLimitConfig?: { maxPerSession: number; windowMinutes: number };
  approvalConfig?: { allowedApprovers: string[]; timeoutSeconds: number };
  alertConfig?: { webhookEndpointIds: string[] };
}

export const SEED_SENSITIVE_FLAGS: SeedSensitiveFlag[] = [
  {
    toolPattern: 'localhost:3012::submit_backtest',
    behaviors: ['REQUIRE_APPROVAL', 'ALERT'],
    description: 'Backtest submissions require approval and send alerts',
    approvalConfig: { allowedApprovers: ['session_owner', 'admin'], timeoutSeconds: 300 },
    alertConfig: { webhookEndpointIds: [] }, // Will be filled with webhook ID
  },
  {
    toolPattern: 'localhost:3012::submit_optimization',
    behaviors: ['RATE_LIMIT'],
    description: 'Optimization submissions are rate-limited',
    rateLimitConfig: { maxPerSession: 5, windowMinutes: 60 },
  },
  {
    toolPattern: '*::delete_*',
    behaviors: ['ALERT'],
    description: 'All delete operations send alerts',
    alertConfig: { webhookEndpointIds: [] }, // Will be filled with webhook ID
  },
];

// ============================================================================
// Policy Assertion Templates
// ============================================================================

export interface SeedPolicyAssertion {
  name: string;
  description: string;
  toolPattern: string;
  contextType: 'ROLE' | 'WILDCARD' | 'USER' | 'AGENT';
  roleName?: string;
  expectedDecision: 'ALLOWED' | 'DENIED';
}

export const SEED_POLICY_ASSERTIONS: SeedPolicyAssertion[] = [
  {
    name: 'Admin full access',
    description: 'Admins should have access to any tool',
    toolPattern: '*::*',
    contextType: 'ROLE',
    roleName: 'Admin',
    expectedDecision: 'ALLOWED',
  },
  {
    name: 'Developer backtest access',
    description: 'Developers should be able to run backtests',
    toolPattern: 'localhost:3012::submit_backtest',
    contextType: 'ROLE',
    roleName: 'Developer',
    expectedDecision: 'ALLOWED',
  },
  {
    name: 'Viewer cannot submit',
    description: 'Viewers should be blocked from submitting anything',
    toolPattern: '*::submit_backtest',
    contextType: 'ROLE',
    roleName: 'Viewer',
    expectedDecision: 'DENIED',
  },
  {
    name: 'Global delete block',
    description: 'Nobody should be able to delete anything',
    toolPattern: '*::delete_all',
    contextType: 'WILDCARD',
    expectedDecision: 'DENIED',
  },
];

// ============================================================================
// Summary Generation
// ============================================================================

export function generateSummary(data: CapturedData): string {
  return `
Seed Data Generation Summary
============================
Captured At: ${data.capturedAt}

Entities:
- Organization: ${data.organization ? 1 : 0}
- Roles: ${data.roles.length}
- Users: ${data.users.length}
- Agents: ${data.agents.length}
- MCP Servers: ${data.mcpServers.length}
- MCP Tools: ${data.mcpServers.reduce((acc, s) => acc + s.tools.length, 0)}
- Policies: ${data.policies.length}
- Audit Entries: ${data.auditLogEntries.length}
- Webhooks: ${data.webhooks.length}
- Permission Requests: ${data.permissionRequests.length}
- Sensitive Flags: ${data.sensitiveFlags.length}
- Policy Assertions: ${data.policyAssertions.length}
`;
}
