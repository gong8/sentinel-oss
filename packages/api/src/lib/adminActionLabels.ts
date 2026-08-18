import { AdminActionType } from '@sentinel/db';

/**
 * Human-readable display names for admin action types.
 * Used in admin action logs for better readability.
 */
const ACTION_DISPLAY_NAMES: Record<AdminActionType, string> = {
  // User actions
  USER_CREATE: 'Create User',
  USER_UPDATE: 'Update User',
  USER_DELETE: 'Delete User',
  USER_RESTORE: 'Restore User',
  USER_ROLES_UPDATE: 'Update User Roles',
  USER_TOKEN_REFRESH: 'Refresh User Token',
  USER_TOKEN_REVOKE: 'Revoke User Token',

  // Role actions
  ROLE_CREATE: 'Create Role',
  ROLE_UPDATE: 'Update Role',
  ROLE_DELETE: 'Delete Role',
  ROLE_RESTORE: 'Restore Role',

  // Policy actions
  POLICY_CREATE: 'Create Policy',
  POLICY_UPDATE: 'Update Policy',
  POLICY_DELETE: 'Delete Policy',
  POLICY_RESTORE: 'Restore Policy',
  POLICY_ENABLE: 'Enable Policy',
  POLICY_DISABLE: 'Disable Policy',
  POLICY_CONFLICT_RESOLVE: 'Resolve Policy Conflict',

  // Policy exception actions
  POLICY_EXCEPTION_CREATE: 'Create Policy Exception Request',
  POLICY_EXCEPTION_APPROVE: 'Approve Policy Exception',
  POLICY_EXCEPTION_DENY: 'Deny Policy Exception',
  POLICY_EXCEPTION_WITHDRAW: 'Withdraw Policy Exception Request',

  // MCP Server actions
  MCP_SERVER_CREATE: 'Create MCP Server',
  MCP_SERVER_UPDATE: 'Update MCP Server',
  MCP_SERVER_DELETE: 'Delete MCP Server',
  MCP_SERVER_RESTORE: 'Restore MCP Server',
  MCP_SERVER_DISCOVER_TOOLS: 'Discover Tools',
  MCP_SERVER_ORG_API_KEY_ADD: 'Add Org API Key',
  MCP_SERVER_ORG_API_KEY_UPDATE: 'Update Org API Key',
  MCP_SERVER_ORG_API_KEY_REMOVE: 'Remove Org API Key',

  // OAuth actions
  OAUTH_DISCOVER: 'OAuth Discover',
  OAUTH_CLIENT_REGISTER: 'Register OAuth Client',
  OAUTH_CLIENT_CONFIGURE: 'Configure OAuth Client',
  OAUTH_FLOW_INITIATE: 'Initiate OAuth Flow',
  OAUTH_FLOW_COMPLETE: 'Complete OAuth Flow',
  OAUTH_TOKEN_REFRESH: 'Refresh OAuth Token',
  OAUTH_TOKEN_REVOKE: 'Revoke OAuth Token',
  OAUTH_DISCONNECT: 'Disconnect OAuth',

  // Agent actions
  AGENT_CREATE: 'Create Agent',
  AGENT_DELETE: 'Delete Agent',
  AGENT_RESTORE: 'Restore Agent',
  AGENT_VERIFY: 'Verify Agent',
  AGENT_REFRESH_VERIFICATION: 'Refresh Agent Verification',
  AGENT_TERMINATE: 'Terminate Session',

  // Publisher actions
  PUBLISHER_CREATE: 'Create Publisher',
  PUBLISHER_DELETE: 'Delete Publisher',

  // Personal credentials actions
  PERSONAL_API_KEY_SET: 'Set Personal API Key',
  PERSONAL_API_KEY_REMOVE: 'Remove Personal API Key',
  PERSONAL_CREDENTIALS_SET: 'Set Personal Credentials',
  PERSONAL_CREDENTIALS_REMOVE: 'Remove Personal Credentials',

  // Workspace credentials actions
  WORKSPACE_API_KEY_SET: 'Set Workspace API Key',
  WORKSPACE_API_KEY_REMOVE: 'Remove Workspace API Key',
  WORKSPACE_CREDENTIALS_SET: 'Set Workspace Credentials',
  WORKSPACE_CREDENTIALS_REMOVE: 'Remove Workspace Credentials',
  WORKSPACE_OAUTH_CONNECT: 'Connect Workspace OAuth',
  WORKSPACE_OAUTH_DISCONNECT: 'Disconnect Workspace OAuth',

  // Permission Request actions
  PERMISSION_REQUEST_APPROVE: 'Approve Permission Request',
  PERMISSION_REQUEST_DENY: 'Deny Permission Request',
  DENY_POLICY_REMOVAL_APPROVE: 'Approve Restriction Removal',
  DENY_POLICY_REMOVAL_DENY: 'Deny Restriction Removal',

  // Organization actions
  ORGANIZATION_UPDATE: 'Update Organization',

  // Sensitive flag actions
  SENSITIVE_FLAG_CREATE: 'Create Sensitive Flag',
  SENSITIVE_FLAG_UPDATE: 'Update Sensitive Flag',
  SENSITIVE_FLAG_DELETE: 'Delete Sensitive Flag',
  SENSITIVE_OVERRIDE_CREATE: 'Create Sensitive Override',
  SENSITIVE_OVERRIDE_UPDATE: 'Update Sensitive Override',
  SENSITIVE_OVERRIDE_DELETE: 'Delete Sensitive Override',
  SENSITIVE_APPROVAL_GRANTED: 'Grant Sensitive Approval',
  SENSITIVE_APPROVAL_DENIED: 'Deny Sensitive Approval',
  SENSITIVE_APPROVAL_CANCELLED: 'Cancel Sensitive Approval',

  // Webhook actions
  WEBHOOK_ENDPOINT_CREATE: 'Create Webhook Endpoint',
  WEBHOOK_ENDPOINT_UPDATE: 'Update Webhook Endpoint',
  WEBHOOK_ENDPOINT_DELETE: 'Delete Webhook Endpoint',

  // Integration actions
  INTEGRATION_CREATE: 'Create Integration',
  INTEGRATION_UPDATE: 'Update Integration',
  INTEGRATION_DELETE: 'Delete Integration',
  INTEGRATION_ENABLE: 'Enable Integration',
  INTEGRATION_DISABLE: 'Disable Integration',
  INTEGRATION_TEST: 'Test Integration',

  // A2A Agent actions
  A2A_AGENT_REGISTER: 'Register A2A Agent',
  A2A_AGENT_UPDATE: 'Update A2A Agent',
  A2A_AGENT_DELETE: 'Delete A2A Agent',
  A2A_CREDENTIAL_SET: 'Set A2A Credential',
  A2A_CREDENTIAL_DELETE: 'Delete A2A Credential',
  A2A_CARD_REFRESH: 'Refresh A2A Card',
  A2A_CONNECTION_TEST: 'Test A2A Connection',

  // Global Variable actions
  GLOBAL_VAR_NAMESPACE_CREATE: 'Create Variable Namespace',
  GLOBAL_VAR_NAMESPACE_UPDATE: 'Update Variable Namespace',
  GLOBAL_VAR_NAMESPACE_DELETE: 'Delete Variable Namespace',
  GLOBAL_VAR_NAMESPACE_RESTORE: 'Restore Variable Namespace',
  GLOBAL_VAR_FIELD_CREATE: 'Create Variable Field',
  GLOBAL_VAR_FIELD_UPDATE: 'Update Variable Field',
  GLOBAL_VAR_FIELD_DELETE: 'Delete Variable Field',

  // Workspace actions
  WORKSPACE_CREATE: 'Create Workspace',
  WORKSPACE_UPDATE: 'Update Workspace',
  WORKSPACE_DELETE: 'Delete Workspace',
  WORKSPACE_RESTORE: 'Restore Workspace',
  WORKSPACE_MEMBER_ADD: 'Add Workspace Member',
  WORKSPACE_MEMBER_REMOVE: 'Remove Workspace Member',
  WORKSPACE_MEMBER_ROLE_UPDATE: 'Update Workspace Member Role',
  WORKSPACE_CHAT_SETTINGS_CREATE: 'Create Workspace Chat Settings',
  WORKSPACE_CHAT_SETTINGS_UPDATE: 'Update Workspace Chat Settings',

  // Organization owner actions
  ORG_OWNER_ADD: 'Add Organization Owner',
  ORG_OWNER_REMOVE: 'Remove Organization Owner',
  OWNERSHIP_TRANSFER_INITIATE: 'Initiate Ownership Transfer',
  OWNERSHIP_TRANSFER_ACCEPT: 'Accept Ownership Transfer',
  OWNERSHIP_TRANSFER_DECLINE: 'Decline Ownership Transfer',
  OWNERSHIP_TRANSFER_CANCEL: 'Cancel Ownership Transfer',

  // Owner recovery actions
  OWNER_RECOVERY_CREATE: 'Create Owner Recovery Request',
  OWNER_RECOVERY_CANCEL: 'Cancel Owner Recovery Request',
  OWNER_RECOVERY_DENY: 'Deny Owner Recovery Request',

  // MCP confirmation actions
  MCP_CONFIRMATION_REJECT: 'Reject MCP Confirmation',

  // Policy proposal actions
  POLICY_PROPOSAL_CREATE: 'Create Policy Proposal',
  POLICY_PROPOSAL_APPROVE: 'Approve Policy Proposal',
  POLICY_PROPOSAL_REJECT: 'Reject Policy Proposal',
};

/**
 * Get a human-readable display name for an admin action type.
 * Falls back to the enum value if no mapping exists.
 */
export function getActionDisplayName(actionType: AdminActionType): string {
  return ACTION_DISPLAY_NAMES[actionType] ?? actionType;
}

function getServerKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.hostname}${port}`;
  } catch {
    return null;
  }
}

/**
 * Resolve friendly server and tool names from a tool pattern.
 * Tool patterns are in the format "domain:port::toolName" (e.g., "github.com::createPR").
 */
export function getToolFriendlyNames(
  toolPattern: string,
  servers: { name: string; url: string }[],
): { serverFriendlyName: string | null; toolFriendlyName: string | null } {
  const parts = toolPattern.split('::');
  if (parts.length !== 2) {
    return { serverFriendlyName: null, toolFriendlyName: null };
  }

  const [serverPart, toolPart] = parts;
  const matchingServer = servers.find((server) => getServerKey(server.url) === serverPart);

  if (matchingServer) {
    return {
      serverFriendlyName: matchingServer.name,
      toolFriendlyName: `${matchingServer.name}::${toolPart}`,
    };
  }

  return { serverFriendlyName: null, toolFriendlyName: null };
}
