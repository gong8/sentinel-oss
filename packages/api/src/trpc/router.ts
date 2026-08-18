/**
 * Main tRPC Router
 * Combines all sub-routers into the main application router
 */

import { adminA2ARouter } from './admin/a2a.js';
import { adminAccessReviewRouter } from './admin/accessReview.js';
import { adminAdminActionLogsRouter } from './admin/adminActionLogs.js';
import { adminMcpConfirmationRouter } from './admin/adminMcpConfirmation.js';
import { adminMcpSettingsRouter } from './admin/adminMcpSettings.js';
import { adminAdvancedConditionsRouter } from './admin/advancedConditions.js';
import { adminAgentsRouter } from './admin/agents.js';
import { adminAnalyticsRouter } from './admin/analytics.js';
import { adminAttestationRouter } from './admin/attestation.js';
import { adminAuditLogEntriesRouter } from './admin/auditLogEntries.js';
import { adminConditionsRouter } from './admin/conditions.js';
import { adminDeletedItemsRouter } from './admin/deletedItems.js';
import { adminGlobalVariablesRouter } from './admin/globalVariables.js';
import { adminLlmSettingsRouter } from './admin/llmSettings.js';
import { adminMcpServersRouter } from './admin/mcpServers.js';
import { adminOrganizationsRouter } from './admin/organizations.js';
import { adminOrgOAuthRouter } from './admin/orgOAuth.js';
import { adminOrgOwnersRouter } from './admin/orgOwners.js';
import { adminOrgSettingsRouter } from './admin/orgSettings.js';
import { adminOwnerRecoveryRouter } from './admin/ownerRecovery.js';
import { adminOwnershipTransferRouter } from './admin/ownershipTransfer.js';
import { adminPermissionRequestsRouter } from './admin/permissionRequests.js';
import { adminPersonalCredentialsRouter } from './admin/personalCredentials.js';
import { adminPoliciesRouter } from './admin/policies.js';
import { adminPolicyAssertionsRouter } from './admin/policyAssertions.js';
import { adminPolicyExceptionsRouter } from './admin/policyExceptions.js';
import { adminPolicyProposalsRouter } from './admin/policyProposals.js';
import { adminPolicyTagsRouter } from './admin/policyTags.js';
import { adminRolesRouter } from './admin/roles.js';
import { adminSensitiveFlagsRouter } from './admin/sensitiveFlags.js';
import { adminSessionsRouter } from './admin/sessions.js';
import { adminToolClassificationsRouter } from './admin/toolClassifications.js';
import { adminUsersRouter } from './admin/users.js';
import { adminWebhooksRouter } from './admin/webhooks.js';
import { adminWorkspaceAuditLogsRouter } from './admin/workspaceAuditLogs.js';
import { adminWorkspaceCredentialsRouter } from './admin/workspaceCredentials.js';
import { adminWorkspaceMembersRouter } from './admin/workspaceMembers.js';
import { adminWorkspaceOAuthRouter } from './admin/workspaceOAuth.js';
import { adminWorkspacesRouter } from './admin/workspaces.js';
import { agentRouter } from './agent/index.js';
import { authRouter } from './auth.js';
import { featureDiscoveryRouter } from './featureDiscovery.js';
import { router } from './init.js';
import { proxyRouter } from './proxy/index.js';
import { publicOwnerRecoveryRouter } from './public/ownerRecovery.js';
import { userAuditLogEntriesRouter } from './user/auditLogEntries.js';
import { userLlmConfigRouter } from './user/llmConfig.js';
import { userMcpServersRouter } from './user/mcpServers.js';
import { userOnboardingRouter } from './user/onboarding.js';
import { userPermissionRequestsRouter } from './user/permissionRequests.js';
import { userProfileRouter } from './user/profile.js';
import { userSensitiveFlagsRouter } from './user/sensitiveFlags.js';
import { userToolsRouter } from './user/tools.js';
import { userWorkspacesRouter } from './user/workspaces.js';
import { workspaceChatRouter } from './workspace/chat.js';
import { workspaceChatSettingsRouter } from './workspace/chatSettings.js';
import { workspacePlanRouter } from './workspace/plan.js';

/**
 * Main application router
 */
export const appRouter = router({
  // Authentication
  auth: authRouter,

  // Proxy routes (for MCP proxy server)
  proxy: proxyRouter,

  // Admin routes
  admin: router({
    organizations: adminOrganizationsRouter,
    users: adminUsersRouter,
    roles: adminRolesRouter,
    policies: adminPoliciesRouter,
    mcpServers: adminMcpServersRouter,
    agents: adminAgentsRouter,
    auditLogEntries: adminAuditLogEntriesRouter,
    permissionRequests: adminPermissionRequestsRouter,
    analytics: adminAnalyticsRouter,
    adminActionLogs: adminAdminActionLogsRouter,
    personalCredentials: adminPersonalCredentialsRouter,
    workspaceCredentials: adminWorkspaceCredentialsRouter,
    deletedItems: adminDeletedItemsRouter,
    orgOAuth: adminOrgOAuthRouter,
    workspaceOAuth: adminWorkspaceOAuthRouter,
    policyAssertions: adminPolicyAssertionsRouter,
    policyExceptions: adminPolicyExceptionsRouter,
    sensitiveFlags: adminSensitiveFlagsRouter,
    sessions: adminSessionsRouter,
    webhooks: adminWebhooksRouter,
    attestation: adminAttestationRouter,
    a2a: adminA2ARouter,
    conditions: adminConditionsRouter,
    advancedConditions: adminAdvancedConditionsRouter,
    orgSettings: adminOrgSettingsRouter,
    globalVariables: adminGlobalVariablesRouter,
    adminMcpSettings: adminMcpSettingsRouter,
    adminMcpConfirmation: adminMcpConfirmationRouter,
    llmSettings: adminLlmSettingsRouter,
    workspaces: adminWorkspacesRouter,
    workspaceMembers: adminWorkspaceMembersRouter,
    workspaceAuditLogs: adminWorkspaceAuditLogsRouter,
    orgOwners: adminOrgOwnersRouter,
    ownershipTransfer: adminOwnershipTransferRouter,
    ownerRecovery: adminOwnerRecoveryRouter,
    policyProposals: adminPolicyProposalsRouter,
    policyTags: adminPolicyTagsRouter,
    toolClassifications: adminToolClassificationsRouter,
    accessReview: adminAccessReviewRouter,
  }),

  // User routes
  user: router({
    profile: userProfileRouter,
    mcpServers: userMcpServersRouter,
    auditLogEntries: userAuditLogEntriesRouter,
    permissionRequests: userPermissionRequestsRouter,
    tools: userToolsRouter,
    sensitiveFlags: userSensitiveFlagsRouter,
    llmConfig: userLlmConfigRouter,
    workspaces: userWorkspacesRouter,
    onboarding: userOnboardingRouter,
  }),

  // Workspace routes (member operations)
  workspace: router({
    chat: workspaceChatRouter,
    chatSettings: workspaceChatSettingsRouter,
    plan: workspacePlanRouter,
  }),

  // Agent assistant routes
  agent: agentRouter,

  // Feature Discovery routes
  featureDiscovery: featureDiscoveryRouter,

  // Public routes (no auth required)
  public: router({
    ownerRecovery: publicOwnerRecoveryRouter,
  }),
});

// Export type for use in frontend
export type AppRouter = typeof appRouter;
