/**
 * Admin MCP Tool Definitions
 *
 * Shared tool definitions used by both @sentinel/api and @sentinel/mcp-admin.
 * This package exists to break the circular dependency between those packages.
 */

import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  scope: string;
  isWriteTool: boolean;
}

// ============================================================================
// TOOL NAME VALIDATION
// ============================================================================

/**
 * Schema for validating tool name patterns in policies.
 * Accepts:
 * - "*" - matches all tools
 * - "*::*" - matches all tools (explicit format)
 * - "server::*" - matches all tools on a server
 * - "server::tool" - matches a specific tool
 * - "server::tool-name_v2" - alphanumeric with hyphens and underscores
 */
export const toolNameSchema = z
  .string()
  .max(500)
  .refine(
    (val) => val === '*::*' || val === '*' || /^[a-zA-Z0-9._:-]+::[a-zA-Z0-9_*-]+$/.test(val),
    {
      message:
        'Tool name must be in format "serverKey::toolName" or use wildcards (*::*, *). ' +
        'The serverKey comes from the server URL (e.g., "api.notion.so") and can contain letters, numbers, dots, hyphens, underscores, and colons. ' +
        'Tool names can contain letters, numbers, hyphens, and underscores.',
    },
  );

// ============================================================================
// READ TOOLS
// ============================================================================

// POLICIES scope - read tools
export const listPoliciesSchema = z.object({
  limit: z
    .number()
    .max(1000)
    .optional()
    .default(50)
    .describe('Maximum number of policies to return'),
  offset: z.number().optional().default(0).describe('Number of policies to skip'),
});

export const getPolicySchema = z.object({
  id: z.string().cuid().describe('The policy ID'),
});

// USERS scope - read tools
export const listUsersSchema = z.object({
  limit: z.number().max(1000).optional().default(50).describe('Maximum number of users to return'),
});

export const getUserSchema = z.object({
  id: z.string().cuid().describe('The user ID'),
});

// ROLES scope - read tools
export const listRolesSchema = z.object({});

export const getRoleSchema = z.object({
  id: z.string().cuid().describe('The role ID'),
});

// MCP_SERVERS scope - read tools
export const listMcpServersSchema = z.object({});

export const getMcpServerSchema = z.object({
  id: z.string().cuid().describe('The MCP server ID'),
});

export const listMcpServerToolsSchema = z.object({
  mcpServerId: z.string().cuid().describe('The MCP server ID to list tools for'),
});

// AGENTS scope - read tools
export const listAgentsSchema = z.object({});

export const getAgentSchema = z.object({
  id: z.string().cuid().describe('The agent ID'),
});

// SENSITIVE_FLAGS scope - read tools
export const listSensitiveFlagsSchema = z.object({});

export const getSensitiveFlagSchema = z.object({
  id: z.string().cuid().describe('The sensitive flag ID'),
});

// SENSITIVE_FLAGS scope - write tools
const sensitiveBehaviorEnum = z.enum([
  'ALERT',
  'RATE_LIMIT',
  'REQUIRE_APPROVAL',
  'ADDITIONAL_AUDIT',
]);

const rateLimitConfigSchema = z.object({
  window: z.number().int().positive().describe('Time window in seconds'),
  maxCalls: z.number().int().positive().describe('Maximum calls allowed in window'),
});

const approvalConfigSchema = z.object({
  requireReason: z.boolean().optional().describe('Whether a reason is required'),
  autoExpire: z.boolean().optional().describe('Whether approval auto-expires'),
  expiryMinutes: z.number().int().positive().optional().describe('Minutes until approval expires'),
});

const alertConfigSchema = z.object({
  webhookEndpointIds: z
    .array(z.string())
    .optional()
    .describe('Webhook endpoint IDs to notify on alert'),
});

export const createSensitiveFlagSchema = z.object({
  toolPattern: toolNameSchema.describe(
    'Tool pattern to flag as sensitive. Format: "server::tool" or wildcards like "server::*"',
  ),
  behaviors: z
    .array(sensitiveBehaviorEnum)
    .min(1)
    .describe(
      'Behaviors to apply: ALERT (send notification), RATE_LIMIT (limit calls), REQUIRE_APPROVAL (need admin approval), ADDITIONAL_AUDIT (enhanced logging)',
    ),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe('Description of why this tool is sensitive'),
  rateLimitConfig: rateLimitConfigSchema
    .optional()
    .describe('Rate limit configuration (required if RATE_LIMIT behavior enabled)'),
  approvalConfig: approvalConfigSchema
    .optional()
    .describe('Approval configuration (required if REQUIRE_APPROVAL behavior enabled)'),
  alertConfig: alertConfigSchema
    .optional()
    .describe('Alert configuration (required if ALERT behavior enabled)'),
  workspaceId: z
    .string()
    .optional()
    .describe('Workspace ID to scope the flag to. Null for organization-wide flags.'),
});

export const updateSensitiveFlagSchema = z.object({
  id: z.string().cuid().describe('The sensitive flag ID to update'),
  behaviors: z.array(sensitiveBehaviorEnum).min(1).optional().describe('New behaviors to apply'),
  description: z.string().max(2000).optional().describe('New description'),
  rateLimitConfig: rateLimitConfigSchema.nullable().optional().describe('New rate limit config'),
  approvalConfig: approvalConfigSchema.nullable().optional().describe('New approval config'),
  alertConfig: alertConfigSchema.nullable().optional().describe('New alert config'),
  enabled: z.boolean().optional().describe('Enable/disable the flag'),
  workspaceId: z.string().nullable().optional().describe('New workspace scope'),
});

export const deleteSensitiveFlagSchema = z.object({
  id: z.string().cuid().describe('The sensitive flag ID to delete'),
});

export const enableSensitiveFlagSchema = z.object({
  id: z.string().cuid().describe('The sensitive flag ID to enable'),
});

export const disableSensitiveFlagSchema = z.object({
  id: z.string().cuid().describe('The sensitive flag ID to disable'),
});

// WEBHOOKS scope - read tools
export const listWebhooksSchema = z.object({});

export const getWebhookSchema = z.object({
  id: z.string().cuid().describe('The webhook endpoint ID'),
});

// PERMISSION_REQUESTS scope - read tools
export const listPermissionRequestsSchema = z.object({
  status: z
    .enum(['PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN', 'MODIFIED'])
    .optional()
    .describe('Filter by status'),
});

// ANALYTICS scope - read tools
export const getAnalyticsSummarySchema = z.object({
  days: z
    .number()
    .min(1)
    .max(365)
    .optional()
    .default(7)
    .describe('Number of days to include in summary'),
});

// AUDIT scope - read tools
export const listAuditLogsSchema = z.object({
  limit: z
    .number()
    .max(1000)
    .optional()
    .default(50)
    .describe('Maximum number of entries to return'),
});

export const listAdminActionLogsSchema = z.object({
  limit: z
    .number()
    .max(1000)
    .optional()
    .default(50)
    .describe('Maximum number of entries to return'),
});

// POLICIES scope - parameter search tools
export const searchParamValuesByLabelSchema = z.object({
  serverDomain: z
    .string()
    .optional()
    .describe('Domain from tool name (e.g., "notion" from "notion-update-page")'),
  serverId: z.string().optional().describe('Server ID (alternative to serverDomain)'),
  labelQuery: z
    .string()
    .describe('Human-readable label to search for (e.g., "Applications Tracker 2026")'),
  limit: z.number().optional().default(10).describe('Maximum results to return'),
});

export const getParamSuggestionsSchema = z.object({
  toolName: z
    .string()
    .describe('Full tool name in format "server::toolName" (e.g., "notion::updatePage")'),
  parameterKey: z
    .string()
    .describe('The parameter key to get suggestions for (e.g., "page_id", "database_id")'),
  prefix: z.string().optional().describe('Filter suggestions to those starting with this prefix'),
  limit: z.number().optional().default(10).describe('Maximum results to return'),
});

export const getToolParamFieldsSchema = z.object({
  toolName: z
    .string()
    .describe('Full tool name in format "server::toolName" (e.g., "api.notion.so::createPage")'),
});

// ============================================================================
// WRITE TOOLS - These require confirmation
// ============================================================================

// Policy condition schema for deterministic evaluation
const conditionOperatorEnum = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'matches',
  'lessThan',
  'greaterThan',
  'between',
  'in',
  'notIn',
  'containsAny',
  'containsNone',
  'exists',
  'notExists',
  'inCidr',
  'notInCidr',
]);

const policyConditionSchema = z.object({
  field: z
    .string()
    .max(500)
    .describe(
      'Field to evaluate. Examples: "time.hourOfDay" (0-23), "time.dayOfWeek" (0-6, Sunday=0), "network.sourceIp", "params.<paramName>", "extracted.sql.sqlOperation", "extracted.sql.sqlTables", "extracted.github.gitRepository", "extracted.github.gitBranch", "extracted.file.filePath"',
    ),
  operator: conditionOperatorEnum.describe(
    'Comparison operator: equals, notEquals, contains, notContains, startsWith, endsWith, matches (regex), lessThan, greaterThan, between, in, notIn, containsAny, containsNone, exists, notExists, inCidr, notInCidr',
  ),
  value: z
    .unknown()
    .refine((val) => JSON.stringify(val).length < 10000, { message: 'Condition value too large' })
    .describe(
      'Value to compare against. Type depends on operator: single value for equals/contains, array for in/between, regex string for matches, CIDR for inCidr',
    ),
});

// POLICIES scope - write tools
export const createPolicySchema = z.object({
  slug: z
    .string()
    .max(255)
    .optional()
    .describe('Unique policy slug (auto-generated if not provided)'),
  effect: z
    .enum(['ALLOW', 'DENY'])
    .describe('Policy effect: ALLOW grants access, DENY blocks access'),
  matchers: z
    .array(z.string().max(500))
    .min(1)
    .max(100)
    .describe(
      'Who this policy applies to. Array of matcher strings: "*" for everyone, "user:email@example.com" for specific user, "role:roleName" for role, "agent:agentId" for agent',
    ),
  toolPatterns: z
    .array(toolNameSchema)
    .min(1)
    .max(100)
    .describe(
      'Which tools this policy controls. Array of patterns: "server::tool" format, "*::*" for all tools, "server::*" for all tools on a server',
    ),
  description: z.string().max(2000).describe('Human-readable description of what this policy does'),
  conditions: z
    .array(policyConditionSchema)
    .max(50)
    .optional()
    .describe(
      'Optional deterministic conditions. All conditions use AND logic. Example: [{"field": "time.hourOfDay", "operator": "between", "value": [9, 17]}]',
    ),
  enabled: z.boolean().optional().default(true).describe('Whether the policy is enabled'),
  requestId: z
    .string()
    .optional()
    .describe(
      'Permission request ID to link this policy to. If provided, the request will be marked as approved when the policy is created.',
    ),
  workspaceId: z
    .string()
    .optional()
    .describe(
      'Workspace ID to scope the policy to. If not provided, defaults to the current workspace context. Use null for organization-wide (global) policies.',
    ),
});

export const updatePolicySchema = z.object({
  id: z.string().cuid().describe('The policy ID to update'),
  slug: z.string().max(255).optional().describe('New policy slug'),
  effect: z.enum(['ALLOW', 'DENY']).optional().describe('New policy effect'),
  matchers: z
    .array(z.string().max(500))
    .min(1)
    .max(100)
    .optional()
    .describe('New matchers array (same format as create)'),
  toolPatterns: z
    .array(toolNameSchema)
    .min(1)
    .max(100)
    .optional()
    .describe('New tool patterns array (same format as create)'),
  description: z.string().max(2000).optional().describe('New description'),
  conditions: z
    .array(policyConditionSchema)
    .max(50)
    .optional()
    .nullable()
    .describe('New conditions (set to null to remove existing conditions)'),
  enabled: z.boolean().optional().describe('Enable/disable policy'),
  workspaceId: z
    .string()
    .optional()
    .describe(
      'Workspace ID to scope the policy to. If not provided, defaults to the current workspace context. Use null for organization-wide (global) policies.',
    ),
});

export const deletePolicySchema = z.object({
  id: z.string().cuid().describe('The policy ID to delete'),
});

export const enablePolicySchema = z.object({
  id: z.string().cuid().describe('The policy ID to enable'),
});

export const disablePolicySchema = z.object({
  id: z.string().cuid().describe('The policy ID to disable'),
});

// USERS scope - write tools
export const createUserSchema = z.object({
  email: z.string().email().max(320).describe('User email address'),
  name: z.string().max(255).optional().describe('User display name'),
  roleIds: z.array(z.string().cuid()).max(50).optional().describe('Role IDs to assign'),
});

export const updateUserSchema = z.object({
  id: z.string().cuid().describe('The user ID to update'),
  email: z.string().email().max(320).optional().describe('New email address'),
  name: z.string().max(255).optional().describe('New display name'),
  roleIds: z.array(z.string().cuid()).max(50).optional().describe('New role IDs'),
});

export const deleteUserSchema = z.object({
  id: z.string().cuid().describe('The user ID to delete'),
});

// ROLES scope - write tools
export const createRoleSchema = z.object({
  name: z.string().min(1).max(255).describe('Role name'),
  description: z.string().max(2000).optional().describe('Role description'),
});

export const updateRoleSchema = z.object({
  id: z.string().cuid().describe('The role ID to update'),
  name: z.string().min(1).max(255).optional().describe('New role name'),
  description: z.string().max(2000).optional().describe('New role description'),
});

export const deleteRoleSchema = z.object({
  id: z.string().cuid().describe('The role ID to delete'),
});

// MCP_SERVERS scope - write tools
export const createMcpServerSchema = z.object({
  name: z.string().min(1).max(255).describe('Server display name'),
  url: z.string().url().max(2000).describe('Server URL'),
  authType: z.enum(['NONE', 'API_KEY', 'OAUTH']).describe('Authentication type'),
  description: z.string().max(2000).optional().describe('Server description'),
  workspaceId: z
    .string()
    .optional()
    .describe(
      'Workspace ID to scope the resource to. If not provided, defaults to the current workspace context. Use null for organization-wide (global) resources.',
    ),
});

export const updateMcpServerSchema = z.object({
  id: z.string().cuid().describe('The MCP server ID to update'),
  name: z.string().min(1).max(255).optional().describe('New display name'),
  url: z.string().url().max(2000).optional().describe('New URL'),
  authType: z.enum(['NONE', 'API_KEY', 'OAUTH']).optional().describe('New auth type'),
  description: z.string().max(2000).optional().describe('New description'),
  workspaceId: z
    .string()
    .optional()
    .describe(
      'Workspace ID to scope the resource to. If not provided, defaults to the current workspace context. Use null for organization-wide (global) resources.',
    ),
});

export const deleteMcpServerSchema = z.object({
  id: z.string().cuid().describe('The MCP server ID to delete'),
});

// AGENTS scope - write tools
export const createAgentSchema = z.object({
  name: z.string().min(1).max(255).describe('Agent name'),
  description: z.string().max(2000).optional().describe('Agent description'),
});

export const deleteAgentSchema = z.object({
  id: z.string().cuid().describe('The agent ID to delete'),
});

// WEBHOOKS scope - write tools
const webhookEventEnum = z.enum([
  'TOOL_INVOCATION_ALLOWED',
  'TOOL_INVOCATION_DENIED',
  'SENSITIVE_TOOL_INVOKED',
  'SENSITIVE_APPROVAL_NEEDED',
  'SENSITIVE_RATE_LIMITED',
  'POLICY_CREATED',
  'POLICY_UPDATED',
  'POLICY_DELETED',
  'AGENT_CREATED',
  'AGENT_DELETED',
]);

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(255).describe('Webhook display name'),
  url: z.string().url().max(2000).describe('Webhook endpoint URL'),
  events: z
    .array(webhookEventEnum)
    .min(1)
    .max(20)
    .describe(
      'Events to subscribe to. Valid events: TOOL_INVOCATION_ALLOWED, TOOL_INVOCATION_DENIED, SENSITIVE_TOOL_INVOKED, SENSITIVE_APPROVAL_NEEDED, SENSITIVE_RATE_LIMITED, POLICY_CREATED, POLICY_UPDATED, POLICY_DELETED, AGENT_CREATED, AGENT_DELETED',
    ),
  enabled: z.boolean().optional().default(true).describe('Whether the webhook is enabled'),
  workspaceId: z
    .string()
    .optional()
    .describe(
      'Workspace ID to scope the resource to. If not provided, defaults to the current workspace context. Use null for organization-wide (global) resources.',
    ),
});

export const updateWebhookSchema = z.object({
  id: z.string().cuid().describe('The webhook ID to update'),
  name: z.string().min(1).max(255).optional().describe('New display name'),
  url: z.string().url().max(2000).optional().describe('New endpoint URL'),
  events: z
    .array(webhookEventEnum)
    .min(1)
    .max(20)
    .optional()
    .describe('New events list (same valid events as create)'),
  enabled: z.boolean().optional().describe('Enable/disable webhook'),
  workspaceId: z
    .string()
    .optional()
    .describe(
      'Workspace ID to scope the resource to. If not provided, defaults to the current workspace context. Use null for organization-wide (global) resources.',
    ),
});

export const deleteWebhookSchema = z.object({
  id: z.string().cuid().describe('The webhook ID to delete'),
});

// PERMISSION_REQUESTS scope - write tools
export const approveRequestSchema = z.object({
  id: z.string().cuid().describe('The permission request ID to approve'),
  reason: z.string().max(1000).optional().describe('Reason for approval'),
});

export const denyRequestSchema = z.object({
  id: z.string().cuid().describe('The permission request ID to deny'),
  reason: z.string().max(1000).optional().describe('Reason for denial'),
});

// ============================================================================
// TOOL REGISTRY
// ============================================================================

export const READ_TOOL_DEFINITIONS: ToolDefinition[] = [
  // POLICIES
  {
    name: 'admin_list_policies',
    description:
      'List all policies in the organization. Returns policy details including effect, matcher, tool pattern, and status.',
    inputSchema: listPoliciesSchema,
    scope: 'POLICIES',
    isWriteTool: false,
  },
  {
    name: 'admin_get_policy',
    description: 'Get detailed information about a specific policy by ID.',
    inputSchema: getPolicySchema,
    scope: 'POLICIES',
    isWriteTool: false,
  },
  // USERS
  {
    name: 'admin_list_users',
    description:
      'List all users in the organization. Returns user details including email, roles, and status.',
    inputSchema: listUsersSchema,
    scope: 'USERS',
    isWriteTool: false,
  },
  {
    name: 'admin_get_user',
    description: 'Get detailed information about a specific user by ID.',
    inputSchema: getUserSchema,
    scope: 'USERS',
    isWriteTool: false,
  },
  // ROLES
  {
    name: 'admin_list_roles',
    description:
      'List all roles in the organization. Returns role details including name and description.',
    inputSchema: listRolesSchema,
    scope: 'ROLES',
    isWriteTool: false,
  },
  {
    name: 'admin_get_role',
    description: 'Get detailed information about a specific role by ID.',
    inputSchema: getRoleSchema,
    scope: 'ROLES',
    isWriteTool: false,
  },
  // MCP_SERVERS
  {
    name: 'admin_list_mcp_servers',
    description:
      'List all registered MCP servers in the organization. Returns server details including URL, auth type, and status.',
    inputSchema: listMcpServersSchema,
    scope: 'MCP_SERVERS',
    isWriteTool: false,
  },
  {
    name: 'admin_get_mcp_server',
    description: 'Get detailed information about a specific MCP server by ID.',
    inputSchema: getMcpServerSchema,
    scope: 'MCP_SERVERS',
    isWriteTool: false,
  },
  {
    name: 'admin_list_mcp_server_tools',
    description:
      'List all tools discovered from a specific MCP server. Returns tool names, descriptions, and input schemas.',
    inputSchema: listMcpServerToolsSchema,
    scope: 'MCP_SERVERS',
    isWriteTool: false,
  },
  // AGENTS
  {
    name: 'admin_list_agents',
    description: 'List all registered agents in the organization.',
    inputSchema: listAgentsSchema,
    scope: 'AGENTS',
    isWriteTool: false,
  },
  {
    name: 'admin_get_agent',
    description: 'Get detailed information about a specific agent by ID.',
    inputSchema: getAgentSchema,
    scope: 'AGENTS',
    isWriteTool: false,
  },
  // SENSITIVE_FLAGS
  {
    name: 'admin_list_sensitive_flags',
    description: 'List all sensitive tool flags configured for the organization.',
    inputSchema: listSensitiveFlagsSchema,
    scope: 'SENSITIVE_FLAGS',
    isWriteTool: false,
  },
  {
    name: 'admin_get_sensitive_flag',
    description:
      'Get detailed information about a specific sensitive flag by ID, including agent overrides.',
    inputSchema: getSensitiveFlagSchema,
    scope: 'SENSITIVE_FLAGS',
    isWriteTool: false,
  },
  // WEBHOOKS
  {
    name: 'admin_list_webhooks',
    description: 'List all webhooks configured for the organization.',
    inputSchema: listWebhooksSchema,
    scope: 'WEBHOOKS',
    isWriteTool: false,
  },
  {
    name: 'admin_get_webhook',
    description:
      'Get detailed information about a specific webhook by ID, including URL, events, retry configuration, and enabled status.',
    inputSchema: getWebhookSchema,
    scope: 'WEBHOOKS',
    isWriteTool: false,
  },
  // PERMISSION_REQUESTS
  {
    name: 'admin_list_permission_requests',
    description: 'List permission requests. Can filter by status.',
    inputSchema: listPermissionRequestsSchema,
    scope: 'PERMISSION_REQUESTS',
    isWriteTool: false,
  },
  // ANALYTICS
  {
    name: 'admin_get_analytics_summary',
    description: 'Get analytics summary for the organization over the specified time period.',
    inputSchema: getAnalyticsSummarySchema,
    scope: 'ANALYTICS',
    isWriteTool: false,
  },
  // AUDIT
  {
    name: 'admin_query_audit_log',
    description: 'Query recent audit log entries for tool calls and policy decisions.',
    inputSchema: listAuditLogsSchema,
    scope: 'AUDIT',
    isWriteTool: false,
  },
  {
    name: 'admin_query_admin_actions',
    description: 'Query recent admin action logs for administrative changes.',
    inputSchema: listAdminActionLogsSchema,
    scope: 'AUDIT',
    isWriteTool: false,
  },
  // POLICIES - parameter lookup tools
  {
    name: 'admin_search_param_values_by_label',
    description: `Search for parameter values by their human-readable label. Use this to find IDs when creating policies based on resource names.

For example, to create a policy that blocks updates to a Notion page called "Applications Tracker 2026":
1. Call this tool with labelQuery="Applications Tracker 2026" and serverDomain="notion"
2. Get the page_id from the results
3. Use that ID in the policy condition

Returns matching values with their IDs, labels, parameter keys, and usage stats.`,
    inputSchema: searchParamValuesByLabelSchema,
    scope: 'POLICIES',
    isWriteTool: false,
  },
  {
    name: 'admin_get_param_suggestions',
    description: `Get parameter value suggestions for a specific parameter key. Shows recently used values for that parameter across all tools on the server.

Use this when you know the parameter key (e.g., "page_id") and want to see what values have been used.
Results include both the raw value (ID) and display label (human-readable name) when available.`,
    inputSchema: getParamSuggestionsSchema,
    scope: 'POLICIES',
    isWriteTool: false,
  },
  {
    name: 'admin_get_tool_param_fields',
    description: `Get all parameter fields and their types for a specific tool. Use this BEFORE creating policy conditions to:

1. See the exact field paths (e.g., "params.parent.page_id" not "params.parent_page_id")
2. See the field types (string, number, boolean, array) to choose appropriate operators
3. Understand nested object structures

IMPORTANT: Always call this before creating conditions to ensure:
- Field paths match the actual tool schema (use dots for nesting, e.g., "parent.page_id")
- Operators are compatible with field types:
  * string: equals, notEquals, contains, startsWith, endsWith, matches, in, notIn
  * number: equals, notEquals, lessThan, greaterThan, between, in, notIn
  * boolean: equals
  * array: containsAny, containsNone

Returns a list of fields with their paths, types, and descriptions.`,
    inputSchema: getToolParamFieldsSchema,
    scope: 'POLICIES',
    isWriteTool: false,
  },
];

export const WRITE_TOOL_DEFINITIONS: ToolDefinition[] = [
  // POLICIES
  {
    name: 'admin_create_policy',
    description:
      'Create a new access control policy. Requires confirmation before execution. ALLOW policies grant access, DENY policies block access.',
    inputSchema: createPolicySchema,
    scope: 'POLICIES',
    isWriteTool: true,
  },
  {
    name: 'admin_update_policy',
    description:
      'Update an existing policy. Requires confirmation before execution. Changes take effect immediately after confirmation.',
    inputSchema: updatePolicySchema,
    scope: 'POLICIES',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_policy',
    description:
      'Delete a policy. Requires confirmation before execution. This action cannot be undone.',
    inputSchema: deletePolicySchema,
    scope: 'POLICIES',
    isWriteTool: true,
  },
  {
    name: 'admin_enable_policy',
    description:
      'Enable a disabled policy. Requires confirmation before execution. The policy will immediately start being evaluated.',
    inputSchema: enablePolicySchema,
    scope: 'POLICIES',
    isWriteTool: true,
  },
  {
    name: 'admin_disable_policy',
    description:
      'Disable a policy without deleting it. Requires confirmation before execution. The policy will no longer be evaluated.',
    inputSchema: disablePolicySchema,
    scope: 'POLICIES',
    isWriteTool: true,
  },
  // USERS
  {
    name: 'admin_create_user',
    description:
      'Create a new user in the organization. Requires confirmation before execution. The user will receive an invitation email.',
    inputSchema: createUserSchema,
    scope: 'USERS',
    isWriteTool: true,
  },
  {
    name: 'admin_update_user',
    description:
      "Update a user's details. Requires confirmation before execution. Cannot be used on your own account.",
    inputSchema: updateUserSchema,
    scope: 'USERS',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_user',
    description:
      'Delete a user from the organization. Requires confirmation before execution. Cannot be used on your own account. This action cannot be undone.',
    inputSchema: deleteUserSchema,
    scope: 'USERS',
    isWriteTool: true,
  },
  // ROLES
  {
    name: 'admin_create_role',
    description:
      'Create a new role. Requires confirmation before execution. Roles can be assigned to users to control access via policies.',
    inputSchema: createRoleSchema,
    scope: 'ROLES',
    isWriteTool: true,
  },
  {
    name: 'admin_update_role',
    description:
      'Update a role. Requires confirmation before execution. Changes affect all users with this role.',
    inputSchema: updateRoleSchema,
    scope: 'ROLES',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_role',
    description:
      'Delete a role. Requires confirmation before execution. Users with this role will lose associated access. This action cannot be undone.',
    inputSchema: deleteRoleSchema,
    scope: 'ROLES',
    isWriteTool: true,
  },
  // MCP_SERVERS
  {
    name: 'admin_create_mcp_server',
    description:
      'Register a new MCP server. Requires confirmation before execution. Users will need to configure credentials if auth is required.',
    inputSchema: createMcpServerSchema,
    scope: 'MCP_SERVERS',
    isWriteTool: true,
  },
  {
    name: 'admin_update_mcp_server',
    description:
      'Update an MCP server configuration. Requires confirmation before execution. May affect user connections.',
    inputSchema: updateMcpServerSchema,
    scope: 'MCP_SERVERS',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_mcp_server',
    description:
      'Delete an MCP server. Requires confirmation before execution. All user credentials for this server will be deleted. This action cannot be undone.',
    inputSchema: deleteMcpServerSchema,
    scope: 'MCP_SERVERS',
    isWriteTool: true,
  },
  // AGENTS
  {
    name: 'admin_create_agent',
    description:
      'Register a new agent. Requires confirmation before execution. Agents can be used in policy matching.',
    inputSchema: createAgentSchema,
    scope: 'AGENTS',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_agent',
    description:
      'Delete an agent. Requires confirmation before execution. Policies targeting this agent may be affected. This action cannot be undone.',
    inputSchema: deleteAgentSchema,
    scope: 'AGENTS',
    isWriteTool: true,
  },
  // WEBHOOKS
  {
    name: 'admin_create_webhook',
    description:
      'Create a new webhook endpoint. Requires confirmation before execution. Events will be sent to this endpoint.',
    inputSchema: createWebhookSchema,
    scope: 'WEBHOOKS',
    isWriteTool: true,
  },
  {
    name: 'admin_update_webhook',
    description:
      'Update a webhook configuration. Requires confirmation before execution. May affect event delivery.',
    inputSchema: updateWebhookSchema,
    scope: 'WEBHOOKS',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_webhook',
    description:
      'Delete a webhook. Requires confirmation before execution. Events will no longer be sent to this endpoint. This action cannot be undone.',
    inputSchema: deleteWebhookSchema,
    scope: 'WEBHOOKS',
    isWriteTool: true,
  },
  // SENSITIVE_FLAGS
  {
    name: 'admin_create_sensitive_flag',
    description:
      'Create a new sensitive tool flag. Requires confirmation before execution. Flags add behaviors like alerts, rate limits, or approval requirements to matching tools.',
    inputSchema: createSensitiveFlagSchema,
    scope: 'SENSITIVE_FLAGS',
    isWriteTool: true,
  },
  {
    name: 'admin_update_sensitive_flag',
    description:
      'Update a sensitive tool flag. Requires confirmation before execution. Changes affect all tool calls matching the flag pattern.',
    inputSchema: updateSensitiveFlagSchema,
    scope: 'SENSITIVE_FLAGS',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_sensitive_flag',
    description:
      'Delete a sensitive tool flag. Requires confirmation before execution. The flag behaviors will no longer apply. This action cannot be undone.',
    inputSchema: deleteSensitiveFlagSchema,
    scope: 'SENSITIVE_FLAGS',
    isWriteTool: true,
  },
  {
    name: 'admin_enable_sensitive_flag',
    description:
      'Enable a disabled sensitive flag. Requires confirmation before execution. The flag will immediately start being evaluated.',
    inputSchema: enableSensitiveFlagSchema,
    scope: 'SENSITIVE_FLAGS',
    isWriteTool: true,
  },
  {
    name: 'admin_disable_sensitive_flag',
    description:
      'Disable a sensitive flag without deleting it. Requires confirmation before execution. The flag will no longer be evaluated.',
    inputSchema: disableSensitiveFlagSchema,
    scope: 'SENSITIVE_FLAGS',
    isWriteTool: true,
  },
  // PERMISSION_REQUESTS
  {
    name: 'admin_approve_request',
    description:
      'Approve a pending permission request. Requires confirmation before execution. The user/agent will be granted the requested access.',
    inputSchema: approveRequestSchema,
    scope: 'PERMISSION_REQUESTS',
    isWriteTool: true,
  },
  {
    name: 'admin_deny_request',
    description:
      'Deny a pending permission request. Requires confirmation before execution. The request will be marked as denied.',
    inputSchema: denyRequestSchema,
    scope: 'PERMISSION_REQUESTS',
    isWriteTool: true,
  },
];

export const ALL_TOOL_DEFINITIONS = [...READ_TOOL_DEFINITIONS, ...WRITE_TOOL_DEFINITIONS];

/**
 * Get tool definitions for a specific set of enabled scopes
 */
export function getToolsForScopes(enabledScopes: string[]): ToolDefinition[] {
  return ALL_TOOL_DEFINITIONS.filter((tool) => enabledScopes.includes(tool.scope));
}

/**
 * Get a tool definition by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

// ============================================================================
// SENTINEL AGENT HELPERS
// These helpers are used by the Sentinel Agent to consume tool definitions
// ============================================================================

/**
 * Strip the 'admin_' prefix from a tool name to get the base name
 * Used by Sentinel Agent which uses unprefixed tool names
 */
export function getBaseName(adminToolName: string): string {
  return adminToolName.replace(/^admin_/, '');
}

/**
 * Get the admin tool name from a base name
 */
export function getAdminToolName(baseName: string): string {
  return `admin_${baseName}`;
}

/**
 * Tool definition extended with base name for Sentinel Agent
 */
export interface AgentToolDefinition extends ToolDefinition {
  /** Tool name without 'admin_' prefix (for Sentinel Agent) */
  baseName: string;
}

/**
 * Get all tool definitions with base names for Sentinel Agent
 */
export function getAllToolDefinitionsForAgent(): AgentToolDefinition[] {
  return ALL_TOOL_DEFINITIONS.map((tool) => ({
    ...tool,
    baseName: getBaseName(tool.name),
  }));
}

/**
 * Get read tool definitions with base names for Sentinel Agent
 */
export function getReadToolDefinitionsForAgent(): AgentToolDefinition[] {
  return READ_TOOL_DEFINITIONS.map((tool) => ({
    ...tool,
    baseName: getBaseName(tool.name),
  }));
}

/**
 * Get write tool definitions with base names for Sentinel Agent
 */
export function getWriteToolDefinitionsForAgent(): AgentToolDefinition[] {
  return WRITE_TOOL_DEFINITIONS.map((tool) => ({
    ...tool,
    baseName: getBaseName(tool.name),
  }));
}
