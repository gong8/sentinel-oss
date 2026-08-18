/**
 * Admin MCP Types
 *
 * Types for the Admin MCP Server feature that allows administrators
 * to manage Sentinel via natural language commands from MCP clients.
 */

// Import and re-export AdminMcpRiskLevel from shared package
import type { AdminMcpRiskLevel } from '@sentinel/shared';
export type { AdminMcpRiskLevel };

/**
 * Scope categories for admin MCP tools.
 * Each scope can be independently enabled/disabled per organization.
 */
export enum AdminMcpScope {
  POLICIES = 'POLICIES',
  USERS = 'USERS',
  ROLES = 'ROLES',
  MCP_SERVERS = 'MCP_SERVERS',
  AGENTS = 'AGENTS',
  SENSITIVE_FLAGS = 'SENSITIVE_FLAGS',
  WEBHOOKS = 'WEBHOOKS',
  PERMISSION_REQUESTS = 'PERMISSION_REQUESTS',
  ANALYTICS = 'ANALYTICS',
  AUDIT = 'AUDIT',
}

/**
 * Metadata for each scope category.
 */
export interface ScopeMetadata {
  label: string;
  description: string;
  riskLevel: AdminMcpRiskLevel;
  readTools: string[];
  writeTools: string[];
}

/**
 * Complete scope metadata for all categories.
 */
export const SCOPE_METADATA: Record<AdminMcpScope, ScopeMetadata> = {
  [AdminMcpScope.POLICIES]: {
    label: 'Policy Management',
    description: 'Create, modify, and delete access control policies',
    riskLevel: 'MEDIUM',
    readTools: [
      'admin_list_policies',
      'admin_get_policy',
      'admin_test_policy',
      'admin_detect_conflicts',
    ],
    writeTools: [
      'admin_create_policy',
      'admin_update_policy',
      'admin_delete_policy',
      'admin_enable_policy',
      'admin_disable_policy',
    ],
  },
  [AdminMcpScope.USERS]: {
    label: 'User Management',
    description: 'Create, modify, and delete users and manage tokens',
    riskLevel: 'HIGH',
    readTools: ['admin_list_users', 'admin_get_user'],
    writeTools: [
      'admin_create_user',
      'admin_update_user',
      'admin_delete_user',
      'admin_refresh_token',
      'admin_revoke_token',
    ],
  },
  [AdminMcpScope.ROLES]: {
    label: 'Role Management',
    description: 'Create, modify, and delete roles',
    riskLevel: 'HIGH',
    readTools: ['admin_list_roles', 'admin_get_role'],
    writeTools: ['admin_create_role', 'admin_update_role', 'admin_delete_role'],
  },
  [AdminMcpScope.MCP_SERVERS]: {
    label: 'MCP Server Management',
    description: 'Register, configure, and manage MCP servers',
    riskLevel: 'HIGH',
    readTools: [
      'admin_list_mcp_servers',
      'admin_get_mcp_server',
      'admin_discover_tools',
      'admin_probe_auth_type',
      'admin_discover_oauth',
    ],
    writeTools: [
      'admin_create_mcp_server',
      'admin_update_mcp_server',
      'admin_delete_mcp_server',
      'admin_set_org_api_key',
      'admin_register_oauth_client',
    ],
  },
  [AdminMcpScope.AGENTS]: {
    label: 'Agent Management',
    description: 'Register and manage agents',
    riskLevel: 'MEDIUM',
    readTools: ['admin_list_agents', 'admin_get_agent', 'admin_verify_agent'],
    writeTools: ['admin_create_agent', 'admin_delete_agent'],
  },
  [AdminMcpScope.SENSITIVE_FLAGS]: {
    label: 'Sensitive Tool Flags',
    description: 'Configure sensitive tool flags and manage approvals',
    riskLevel: 'MEDIUM',
    readTools: ['admin_list_sensitive_flags', 'admin_get_sensitive_flag', 'admin_list_approvals'],
    writeTools: [
      'admin_create_sensitive_flag',
      'admin_update_sensitive_flag',
      'admin_delete_sensitive_flag',
      'admin_approve_sensitive',
      'admin_deny_sensitive',
    ],
  },
  [AdminMcpScope.WEBHOOKS]: {
    label: 'Webhook Management',
    description: 'Configure webhook endpoints',
    riskLevel: 'LOW',
    readTools: ['admin_list_webhooks', 'admin_get_webhook', 'admin_test_webhook'],
    writeTools: ['admin_create_webhook', 'admin_update_webhook', 'admin_delete_webhook'],
  },
  [AdminMcpScope.PERMISSION_REQUESTS]: {
    label: 'Permission Requests',
    description: 'Review and manage permission requests',
    riskLevel: 'MEDIUM',
    readTools: ['admin_list_permission_requests', 'admin_get_permission_request'],
    writeTools: ['admin_approve_request', 'admin_deny_request'],
  },
  [AdminMcpScope.ANALYTICS]: {
    label: 'Analytics',
    description: 'View usage statistics and analytics',
    riskLevel: 'LOW',
    readTools: [
      'admin_get_analytics_summary',
      'admin_get_top_users',
      'admin_get_top_tools',
      'admin_get_peak_hours',
    ],
    writeTools: [],
  },
  [AdminMcpScope.AUDIT]: {
    label: 'Audit Logs',
    description: 'Query and view audit logs',
    riskLevel: 'LOW',
    readTools: ['admin_query_audit_log', 'admin_query_admin_actions', 'admin_get_audit_entry'],
    writeTools: [],
  },
};

/**
 * Mapping from tool name to scope.
 * Uses typed Object.entries via explicit iteration.
 */
export const TOOL_TO_SCOPE: Record<string, AdminMcpScope> = (() => {
  const result: Record<string, AdminMcpScope> = {};
  const scopes = Object.keys(SCOPE_METADATA) as AdminMcpScope[];
  for (const scope of scopes) {
    const metadata = SCOPE_METADATA[scope];
    for (const tool of [...metadata.readTools, ...metadata.writeTools]) {
      result[tool] = scope;
    }
  }
  return result;
})();

/**
 * Get all read tools across all scopes.
 */
export const READ_TOOLS: string[] = Object.values(SCOPE_METADATA).flatMap((m) => m.readTools);

/**
 * Get all write tools across all scopes.
 */
export const WRITE_TOOLS: string[] = Object.values(SCOPE_METADATA).flatMap((m) => m.writeTools);

/**
 * Check if a tool is a write tool (requires confirmation).
 */
export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOLS.includes(toolName);
}

/**
 * Get the scope for a tool.
 */
export function getToolScope(toolName: string): AdminMcpScope | undefined {
  return TOOL_TO_SCOPE[toolName];
}

/**
 * Risk levels for specific tools (overrides scope default).
 */
const TOOL_RISK_OVERRIDES: Record<string, AdminMcpRiskLevel> = {
  // HIGH: Destructive or privilege-changing
  admin_delete_user: 'HIGH',
  admin_delete_role: 'HIGH',
  admin_delete_mcp_server: 'HIGH',
  admin_revoke_token: 'HIGH',
  admin_update_user: 'HIGH',

  // LOW: Low-impact or reversible
  admin_enable_policy: 'LOW',
  admin_disable_policy: 'LOW',
  admin_test_webhook: 'LOW',
  admin_refresh_token: 'LOW',
};

/**
 * Get the risk level for a specific tool.
 */
export function getToolRiskLevel(toolName: string): AdminMcpRiskLevel {
  if (TOOL_RISK_OVERRIDES[toolName]) {
    return TOOL_RISK_OVERRIDES[toolName];
  }
  const scope = TOOL_TO_SCOPE[toolName];
  if (scope) {
    return SCOPE_METADATA[scope].riskLevel;
  }
  return 'MEDIUM';
}

/**
 * Admin MCP context after authentication.
 */
export interface AdminMcpContext {
  userId: string;
  organizationId: string;
  email: string;
  enabledScopes: AdminMcpScope[];
  rateLimitPerMin: number;
}

/**
 * Admin MCP settings for an organization.
 */
export interface AdminMcpSettings {
  enabled: boolean;
  enabledScopes: AdminMcpScope[];
  allowedAdmins: string[];
  rateLimitPerMin: number;
  confirmationTtlSeconds: number;
}

/**
 * Result of creating a confirmation.
 */
export interface CreateConfirmationResult {
  confirmationId: string;
  description: string;
  riskLevel: AdminMcpRiskLevel;
  expiresAt: Date;
}

/**
 * Self-operations that are blocked via admin MCP.
 */
export const BLOCKED_SELF_OPERATIONS = new Set([
  'admin_delete_user',
  'admin_update_user',
  'admin_revoke_token',
]);

/**
 * Check if an operation targets the admin's own account.
 */
export function isSelfOperation(
  toolName: string,
  adminUserId: string,
  toolInput: Record<string, unknown>,
): boolean {
  if (!BLOCKED_SELF_OPERATIONS.has(toolName)) {
    return false;
  }

  const targetUserId = toolInput.id || toolInput.userId;
  return targetUserId === adminUserId;
}
