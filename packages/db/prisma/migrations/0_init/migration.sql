-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AdminActionSource" AS ENUM ('UI', 'MCP_ADMIN', 'API', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."AdminActionType" AS ENUM ('USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_RESTORE', 'USER_ROLES_UPDATE', 'USER_TOKEN_REFRESH', 'USER_TOKEN_REVOKE', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'ROLE_RESTORE', 'POLICY_CREATE', 'POLICY_UPDATE', 'POLICY_DELETE', 'POLICY_RESTORE', 'POLICY_ENABLE', 'POLICY_DISABLE', 'POLICY_CONFLICT_RESOLVE', 'MCP_SERVER_CREATE', 'MCP_SERVER_UPDATE', 'MCP_SERVER_DELETE', 'MCP_SERVER_RESTORE', 'MCP_SERVER_DISCOVER_TOOLS', 'MCP_SERVER_ORG_API_KEY_ADD', 'MCP_SERVER_ORG_API_KEY_UPDATE', 'MCP_SERVER_ORG_API_KEY_REMOVE', 'OAUTH_DISCOVER', 'OAUTH_CLIENT_REGISTER', 'OAUTH_CLIENT_CONFIGURE', 'OAUTH_FLOW_INITIATE', 'OAUTH_FLOW_COMPLETE', 'OAUTH_TOKEN_REFRESH', 'OAUTH_TOKEN_REVOKE', 'OAUTH_DISCONNECT', 'AGENT_CREATE', 'AGENT_DELETE', 'AGENT_RESTORE', 'AGENT_VERIFY', 'AGENT_REFRESH_VERIFICATION', 'AGENT_TERMINATE', 'PUBLISHER_CREATE', 'PUBLISHER_DELETE', 'A2A_AGENT_REGISTER', 'A2A_AGENT_UPDATE', 'A2A_AGENT_DELETE', 'A2A_CREDENTIAL_SET', 'A2A_CREDENTIAL_DELETE', 'A2A_CARD_REFRESH', 'A2A_CONNECTION_TEST', 'PERSONAL_API_KEY_SET', 'PERSONAL_API_KEY_REMOVE', 'PERSONAL_CREDENTIALS_SET', 'PERSONAL_CREDENTIALS_REMOVE', 'WORKSPACE_API_KEY_SET', 'WORKSPACE_API_KEY_REMOVE', 'WORKSPACE_CREDENTIALS_SET', 'WORKSPACE_CREDENTIALS_REMOVE', 'WORKSPACE_OAUTH_CONNECT', 'WORKSPACE_OAUTH_DISCONNECT', 'PERMISSION_REQUEST_APPROVE', 'PERMISSION_REQUEST_DENY', 'DENY_POLICY_REMOVAL_APPROVE', 'DENY_POLICY_REMOVAL_DENY', 'ORGANIZATION_UPDATE', 'SENSITIVE_FLAG_CREATE', 'SENSITIVE_FLAG_UPDATE', 'SENSITIVE_FLAG_DELETE', 'SENSITIVE_OVERRIDE_CREATE', 'SENSITIVE_OVERRIDE_UPDATE', 'SENSITIVE_OVERRIDE_DELETE', 'SENSITIVE_APPROVAL_GRANTED', 'SENSITIVE_APPROVAL_DENIED', 'SENSITIVE_APPROVAL_CANCELLED', 'WEBHOOK_ENDPOINT_CREATE', 'WEBHOOK_ENDPOINT_UPDATE', 'WEBHOOK_ENDPOINT_DELETE', 'INTEGRATION_CREATE', 'INTEGRATION_UPDATE', 'INTEGRATION_DELETE', 'INTEGRATION_ENABLE', 'INTEGRATION_DISABLE', 'INTEGRATION_TEST', 'GLOBAL_VAR_NAMESPACE_CREATE', 'GLOBAL_VAR_NAMESPACE_UPDATE', 'GLOBAL_VAR_NAMESPACE_DELETE', 'GLOBAL_VAR_NAMESPACE_RESTORE', 'GLOBAL_VAR_FIELD_CREATE', 'GLOBAL_VAR_FIELD_UPDATE', 'GLOBAL_VAR_FIELD_DELETE', 'WORKSPACE_CREATE', 'WORKSPACE_UPDATE', 'WORKSPACE_DELETE', 'WORKSPACE_RESTORE', 'WORKSPACE_MEMBER_ADD', 'WORKSPACE_MEMBER_REMOVE', 'WORKSPACE_MEMBER_ROLE_UPDATE', 'WORKSPACE_CHAT_SETTINGS_CREATE', 'WORKSPACE_CHAT_SETTINGS_UPDATE', 'ORG_OWNER_ADD', 'ORG_OWNER_REMOVE', 'OWNERSHIP_TRANSFER_INITIATE', 'OWNERSHIP_TRANSFER_ACCEPT', 'OWNERSHIP_TRANSFER_DECLINE', 'OWNERSHIP_TRANSFER_CANCEL', 'POLICY_PROPOSAL_CREATE', 'POLICY_PROPOSAL_APPROVE', 'POLICY_PROPOSAL_REJECT', 'POLICY_EXCEPTION_CREATE', 'POLICY_EXCEPTION_APPROVE', 'POLICY_EXCEPTION_DENY', 'POLICY_EXCEPTION_WITHDRAW', 'OWNER_RECOVERY_CREATE', 'OWNER_RECOVERY_CANCEL', 'OWNER_RECOVERY_DENY', 'MCP_CONFIRMATION_REJECT');

-- CreateEnum
CREATE TYPE "public"."AdminMcpConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."AdminResourceType" AS ENUM ('USER', 'ROLE', 'POLICY', 'MCP_SERVER', 'OAUTH_CLIENT', 'AGENT', 'PUBLISHER', 'USER_MCP_CONFIG', 'WORKSPACE_MCP_CONFIG', 'PERMISSION_REQUEST', 'ORGANIZATION', 'SENSITIVE_FLAG', 'SENSITIVE_OVERRIDE', 'SENSITIVE_APPROVAL', 'WEBHOOK_ENDPOINT', 'INTEGRATION', 'A2A_CREDENTIAL', 'GLOBAL_VAR_NAMESPACE', 'GLOBAL_VAR_FIELD', 'WORKSPACE', 'WORKSPACE_MEMBER', 'WORKSPACE_CHAT_SETTINGS', 'ORG_OWNER', 'OWNERSHIP_TRANSFER', 'POLICY_PROPOSAL', 'POLICY_EXCEPTION', 'OWNER_RECOVERY', 'MCP_CONFIRMATION');

-- CreateEnum
CREATE TYPE "public"."AgentCardSource" AS ENUM ('URL', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."AgentConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."AgentMemoryType" AS ENUM ('CONVERSATION_SUMMARY', 'USER_PREFERENCE', 'ENTITY_REFERENCE', 'TOOL_USAGE_PATTERN', 'CORRECTION');

-- CreateEnum
CREATE TYPE "public"."AgentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL_USE', 'TOOL_RESULT');

-- CreateEnum
CREATE TYPE "public"."AgentPlanStatus" AS ENUM ('DRAFT', 'PENDING', 'EXECUTING', 'PAUSED', 'COMPLETED', 'FAILED', 'ABORTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "public"."AgentPlanStepStatus" AS ENUM ('PENDING', 'WAITING', 'CONFIRMING', 'EXECUTING', 'COMPLETED', 'FAILED', 'SKIPPED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "public"."ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ApprovalType" AS ENUM ('SENSITIVE_FLAG');

-- CreateEnum
CREATE TYPE "public"."AssertionContextType" AS ENUM ('USER', 'AGENT', 'ROLE', 'WILDCARD');

-- CreateEnum
CREATE TYPE "public"."AssertionSource" AS ENUM ('MANUAL', 'PLAYGROUND', 'AUDIT_LOG');

-- CreateEnum
CREATE TYPE "public"."AuditDecision" AS ENUM ('ALLOWED', 'DENIED');

-- CreateEnum
CREATE TYPE "public"."AuthType" AS ENUM ('NONE', 'API_KEY', 'OAUTH', 'OIDC');

-- CreateEnum
CREATE TYPE "public"."ChatMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL_USE', 'TOOL_RESULT', 'PERMISSION_REQUEST');

-- CreateEnum
CREATE TYPE "public"."ClassificationSource" AS ENUM ('LLM_AUTO', 'USER_MANUAL');

-- CreateEnum
CREATE TYPE "public"."ClassificationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ConditionMode" AS ENUM ('SIMPLE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "public"."DismissType" AS ENUM ('NOT_INTERESTED', 'REMIND_LATER');

-- CreateEnum
CREATE TYPE "public"."FeatureTipsSetting" AS ENUM ('ON', 'OFF', 'INHERIT');

-- CreateEnum
CREATE TYPE "public"."GlobalVariableFieldType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'STRING_ARRAY', 'NUMBER_ARRAY');

-- CreateEnum
CREATE TYPE "public"."LLMProvider" AS ENUM ('CLAUDE', 'OPENAI', 'GEMINI');

-- CreateEnum
CREATE TYPE "public"."McpAuthType" AS ENUM ('NONE', 'OAUTH', 'API_KEY');

-- CreateEnum
CREATE TYPE "public"."OrgRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."OwnerRecoveryStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."OwnershipTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."PermissionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN', 'MODIFIED');

-- CreateEnum
CREATE TYPE "public"."PermissionRequestType" AS ENUM ('TOOL_ACCESS', 'MCP_SERVER', 'DENY_REMOVAL');

-- CreateEnum
CREATE TYPE "public"."PolicyEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "public"."PolicyExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "public"."PolicyExceptionType" AS ENUM ('PROPOSAL', 'REMOVAL_REQUEST', 'WORKSPACE_EXCEPTION');

-- CreateEnum
CREATE TYPE "public"."PolicyProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ProtocolType" AS ENUM ('MCP', 'A2A');

-- CreateEnum
CREATE TYPE "public"."SensitiveFlagBehavior" AS ENUM ('REQUIRE_APPROVAL', 'RATE_LIMIT', 'ALERT');

-- CreateEnum
CREATE TYPE "public"."SessionContextEntryType" AS ENUM ('USER_INTENT', 'DATA_ACCESSED', 'RISK_SIGNAL', 'TOOL_OUTCOME', 'AGENT_OBSERVATION');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "public"."ToolAccessType" AS ENUM ('READ', 'WRITE', 'READ_WRITE');

-- CreateEnum
CREATE TYPE "public"."ToolRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."TransportType" AS ENUM ('HTTP', 'STDIO', 'SSE', 'WEBSOCKET');

-- CreateEnum
CREATE TYPE "public"."WebhookEndpointType" AS ENUM ('CUSTOM', 'DISCORD', 'SLACK', 'EMAIL');

-- CreateEnum
CREATE TYPE "public"."WebhookEvent" AS ENUM ('TOOL_INVOCATION_ALLOWED', 'TOOL_INVOCATION_DENIED', 'SENSITIVE_TOOL_INVOKED', 'SENSITIVE_APPROVAL_NEEDED', 'SENSITIVE_RATE_LIMITED', 'POLICY_CREATED', 'POLICY_UPDATED', 'POLICY_DELETED', 'AGENT_CREATED', 'AGENT_DELETED', 'SESSION_TERMINATED');

-- CreateEnum
CREATE TYPE "public"."WorkspaceMemberRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateTable
CREATE TABLE "public"."A2ACredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "authType" "public"."AuthType" NOT NULL,
    "credentials" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "A2ACredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminActionLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "adminUserId" TEXT,
    "actionType" "public"."AdminActionType" NOT NULL,
    "resourceType" "public"."AdminResourceType" NOT NULL,
    "resourceId" TEXT,
    "resourceName" TEXT,
    "actionDetails" JSONB NOT NULL,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,
    "source" "public"."AdminActionSource" NOT NULL DEFAULT 'UI',
    "mcpSessionId" TEXT,
    "mcpToolName" TEXT,
    "confirmationId" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "workspaceId" TEXT,
    "requestHeaders" JSONB,
    "referrer" TEXT,
    "sessionFingerprint" TEXT,
    "requestPath" TEXT,
    "changeDiff" JSONB,
    "diffSummary" TEXT,
    "relatedResources" JSONB,
    "actionStage" TEXT,
    "correlationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminMcpConfirmation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "mcpSessionId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "scope" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" "public"."AdminMcpConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMcpConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "protocolType" "public"."ProtocolType" NOT NULL DEFAULT 'MCP',
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "signatureVerifiedAt" TIMESTAMP(3),
    "publicKeyUrl" TEXT,
    "publicKeyCache" JSONB,
    "publicKeyCachedAt" TIMESTAMP(3),
    "cardSource" "public"."AgentCardSource" NOT NULL DEFAULT 'URL',
    "agentCardUrl" TEXT,
    "endpointUrl" TEXT,
    "agentCardCache" JSONB,
    "agentCardFetchedAt" TIMESTAMP(3),
    "agentCardHash" TEXT,
    "workspaceId" TEXT,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentConfirmation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "mcpSessionId" TEXT,
    "workspaceId" TEXT,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."AgentConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "mcpAgentId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentMemory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "memoryType" "public"."AgentMemoryType" NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "summary" TEXT,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "sourceConversationId" TEXT,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "public"."AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolInput" JSONB,
    "toolResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."AgentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentPlanStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "dependsOn" TEXT[],
    "status" "public"."AgentPlanStepStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "canRollback" BOOLEAN NOT NULL DEFAULT false,
    "rollbackToolName" TEXT,
    "rollbackToolInput" JSONB,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentPlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentToolUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "toolName" TEXT NOT NULL,
    "contextKeywords" TEXT[],
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLogEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "workspaceId" TEXT,
    "toolName" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "decision" "public"."AuditDecision" NOT NULL,
    "justification" TEXT,
    "policyIds" TEXT[],
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedPolicyIds" TEXT[],
    "policySnapshot" JSONB,
    "userEmail" TEXT,
    "userRoles" TEXT[],
    "agentName" TEXT,
    "mcpServerName" TEXT,
    "toolNameDisplay" TEXT,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvalRequestId" TEXT,
    "approvalStatus" TEXT,
    "approvalDecidedBy" TEXT,
    "approvalDecidedByEmail" TEXT,
    "approvalDecidedAt" TIMESTAMP(3),
    "pipelineStage" TEXT,
    "interruptedAt" TEXT,
    "interruptionReason" TEXT,
    "trustCheckPassed" BOOLEAN,
    "serverTrusted" BOOLEAN,
    "policyCheckPassed" BOOLEAN,
    "flagCheckPassed" BOOLEAN,
    "matchedFlagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flagBehaviors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rateLimitHit" BOOLEAN,
    "evaluationTree" JSONB,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailDigestLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "EmailDigestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailDigestPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDigestPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeatureTipDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipId" TEXT NOT NULL,
    "dismissType" "public"."DismissType" NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindAfter" TIMESTAMP(3),

    CONSTRAINT "FeatureTipDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeatureTipOrgOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureTipOrgOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GlobalVariableField" (
    "id" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fieldType" "public"."GlobalVariableFieldType" NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalVariableField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GlobalVariableNamespace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "GlobalVariableNamespace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LlmUsageLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCostCents" INTEGER,
    "requestType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."McpServer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authType" "public"."McpAuthType" NOT NULL,
    "apiKey" TEXT,
    "credentials" JSONB,
    "authConfig" JSONB,
    "transportType" "public"."TransportType" NOT NULL DEFAULT 'HTTP',
    "stdioCommand" TEXT,
    "stdioArgs" JSONB,
    "stdioWorkingDir" TEXT,
    "stdioEnv" TEXT,
    "wsReconnectMs" INTEGER DEFAULT 5000,
    "wsMaxRetries" INTEGER DEFAULT 3,
    "wsHeartbeatMs" INTEGER DEFAULT 30000,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "workspaceId" TEXT,
    "classificationStatus" "public"."ClassificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "classificationStartedAt" TIMESTAMP(3),
    "classificationError" TEXT,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."McpTool" (
    "id" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" JSONB,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."McpToolClassification" (
    "id" TEXT NOT NULL,
    "mcpToolId" TEXT NOT NULL,
    "riskLevel" "public"."ToolRiskLevel",
    "accessType" "public"."ToolAccessType",
    "useCases" TEXT,
    "source" "public"."ClassificationSource" NOT NULL DEFAULT 'LLM_AUTO',
    "llmConfidence" DOUBLE PRECISION,
    "llmRawResponse" JSONB,
    "overriddenAt" TIMESTAMP(3),
    "overriddenBy" TEXT,
    "originalRiskLevel" "public"."ToolRiskLevel",
    "originalAccessType" "public"."ToolAccessType",
    "originalUseCases" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpToolClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MilestoneAchievement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedVia" TEXT[],

    CONSTRAINT "MilestoneAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MilestoneNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "toastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilestoneNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OAuthClientRegistration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUri" TEXT,
    "authorizationEndpoint" TEXT NOT NULL,
    "tokenEndpoint" TEXT NOT NULL,
    "registrationEndpoint" TEXT,
    "revocationEndpoint" TEXT,
    "scopesSupported" TEXT[],
    "grantTypesSupported" TEXT[],
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthClientRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OAuthState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "returnUrl" TEXT,
    "isOrgLevel" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrgMcpOAuthToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenScope" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "connectedBy" TEXT,
    "authenticatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMcpOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrgOwner" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT,

    CONSTRAINT "OrgOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrgWidePolicyProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "matchers" TEXT[],
    "toolPatterns" TEXT[],
    "effect" "public"."PolicyEffect" NOT NULL,
    "description" TEXT NOT NULL,
    "conditions" JSONB,
    "justification" TEXT NOT NULL,
    "status" "public"."PolicyProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdPolicyId" TEXT,

    CONSTRAINT "OrgWidePolicyProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adminMcpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adminMcpEnabledScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adminMcpAllowedAdmins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adminMcpRateLimitPerMin" INTEGER NOT NULL DEFAULT 30,
    "adminMcpConfirmationTtl" INTEGER NOT NULL DEFAULT 300,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "paramHistoryRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "defaultConditionMode" "public"."ConditionMode" NOT NULL DEFAULT 'SIMPLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "llmProvider" TEXT NOT NULL DEFAULT 'auto',
    "llmModel" TEXT,
    "llmApiKey" TEXT,
    "llmBaseUrl" TEXT,
    "llmMaxTokens" INTEGER NOT NULL DEFAULT 4096,
    "llmTemperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "featureTipsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyDigestEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OwnerRecoveryRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedByEmail" TEXT NOT NULL,
    "requestedByName" TEXT,
    "requestedReason" TEXT NOT NULL,
    "supportTicketId" TEXT,
    "targetUserEmail" TEXT NOT NULL,
    "targetUserId" TEXT,
    "verificationToken" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL DEFAULT 'email',
    "verifiedAt" TIMESTAMP(3),
    "status" "public"."OwnerRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "deniedAt" TIMESTAMP(3),
    "deniedBy" TEXT,
    "deniedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerRecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OwnershipTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "public"."OwnershipTransferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "OwnershipTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PermissionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."PermissionRequestType" NOT NULL DEFAULT 'TOOL_ACCESS',
    "status" "public"."PermissionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "toolNames" TEXT[],
    "data" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "linkedPolicyId" TEXT,
    "grantDiff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT,

    CONSTRAINT "PermissionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Policy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "matchers" TEXT[],
    "toolPatterns" TEXT[],
    "effect" "public"."PolicyEffect" NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "conditions" JSONB,
    "conditionsTree" JSONB,
    "conditionMode" "public"."ConditionMode" NOT NULL DEFAULT 'SIMPLE',
    "conditionExpression" JSONB,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "workspaceId" TEXT,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PolicyAssertion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "toolPattern" TEXT NOT NULL,
    "contextType" "public"."AssertionContextType" NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "roleName" TEXT,
    "expectedDecision" TEXT NOT NULL,
    "toolParameters" JSONB,
    "contextOverrides" JSONB,
    "extractedContext" JSONB,
    "extractedMode" TEXT,
    "parameterMode" TEXT NOT NULL DEFAULT 'exact',
    "source" "public"."AssertionSource" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastRunPassed" BOOLEAN,
    "lastRunDecision" TEXT,
    "lastRunJustification" TEXT,
    "lastRunPolicyIds" TEXT[],
    "lastRunSubResults" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PolicyExceptionRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policyId" TEXT,
    "requestType" "public"."PolicyExceptionType" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "proposedMatchers" TEXT[],
    "proposedToolPatterns" TEXT[],
    "proposedEffect" "public"."PolicyEffect",
    "proposedDescription" TEXT,
    "justification" TEXT NOT NULL,
    "status" "public"."PolicyExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "resultPolicyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyExceptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PolicyTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PolicyTagAssignment" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PolicyTest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "decision" TEXT NOT NULL,
    "justification" TEXT,
    "matchedPolicyIds" TEXT[],
    "allEnabledPolicyIds" TEXT[],
    "policySnapshot" JSONB NOT NULL,
    "userEmail" TEXT,
    "userRoles" TEXT[],
    "agentName" TEXT,
    "toolParameters" JSONB,
    "contextOverrides" JSONB,
    "extractedContext" JSONB,
    "extractedMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PublisherRegistry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "keyAlgorithm" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "PublisherRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SensitiveFlagAgentOverride" (
    "id" TEXT NOT NULL,
    "sensitiveToolFlagId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "behaviors" "public"."SensitiveFlagBehavior"[],
    "rateLimitConfig" JSONB,
    "approvalConfig" JSONB,
    "exempted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensitiveFlagAgentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SensitiveFlagApprovalRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "toolName" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "workspaceId" TEXT,
    "type" "public"."ApprovalType" NOT NULL DEFAULT 'SENSITIVE_FLAG',
    "status" "public"."ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deniedReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensitiveFlagApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SensitiveFlagRateLimitUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "toolPattern" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "invocationCount" INTEGER NOT NULL DEFAULT 0,
    "lastInvocation" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensitiveFlagRateLimitUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SensitiveToolFlag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "toolPattern" TEXT NOT NULL,
    "behaviors" "public"."SensitiveFlagBehavior"[],
    "rateLimitConfig" JSONB,
    "approvalConfig" JSONB,
    "alertConfig" JSONB,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "workspaceId" TEXT,

    CONSTRAINT "SensitiveToolFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "externalSessionId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "terminatedAt" TIMESTAMP(3),
    "terminatedBy" TEXT,
    "contextSummary" TEXT,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SessionContextEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "entryType" "public"."SessionContextEntryType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "summary" TEXT,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sourceToolName" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SessionContextEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ToolEmbeddingCache" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "toolName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embeddingModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolEmbeddingCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ToolParamValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "toolName" TEXT,
    "parameterKey" TEXT NOT NULL,
    "parameterValue" TEXT NOT NULL,
    "displayLabel" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolParamValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "orgRole" "public"."OrgRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserFeatureTipsSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "setting" "public"."FeatureTipsSetting" NOT NULL DEFAULT 'INHERIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeatureTipsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserLLMConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "public"."LLMProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "model" TEXT,
    "alwaysAllowTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skipToolConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLLMConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserMcpConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "apiKey" TEXT,
    "credentials" JSONB NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenScope" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "authenticatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMcpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentTourId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "completedTours" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "showAdvanced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" "public"."WebhookEvent" NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "type" "public"."WebhookEndpointType" NOT NULL DEFAULT 'CUSTOM',
    "url" TEXT,
    "events" "public"."WebhookEvent"[],
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "verbose" BOOLEAN NOT NULL DEFAULT false,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryDelayMs" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Workspace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceChatConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "public"."ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolInput" JSONB,
    "toolResult" JSONB,
    "permissionRequestId" TEXT,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceChatSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultLlmProvider" "public"."LLMProvider",
    "defaultLlmModel" TEXT,
    "systemPrompt" TEXT,
    "monthlyMessageQuota" INTEGER,
    "monthlyTokenQuota" INTEGER,
    "adminChatVisibility" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceChatSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceChatUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceChatUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceFeatureTipsSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "setting" "public"."FeatureTipsSetting" NOT NULL DEFAULT 'INHERIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceFeatureTipsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceMcpConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "apiKey" TEXT,
    "credentials" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMcpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceMcpOAuthToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenScope" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "connectedBy" TEXT,
    "authenticatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMcpOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."WorkspaceMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "A2ACredential_agentId_key" ON "public"."A2ACredential"("agentId" ASC);

-- CreateIndex
CREATE INDEX "A2ACredential_organizationId_idx" ON "public"."A2ACredential"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_actionType_idx" ON "public"."AdminActionLog"("actionType" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_adminUserId_idx" ON "public"."AdminActionLog"("adminUserId" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_correlationId_idx" ON "public"."AdminActionLog"("correlationId" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_mcpSessionId_idx" ON "public"."AdminActionLog"("mcpSessionId" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_organizationId_idx" ON "public"."AdminActionLog"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_organizationId_resourceType_resourceId_times_idx" ON "public"."AdminActionLog"("organizationId" ASC, "resourceType" ASC, "resourceId" ASC, "timestamp" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_organizationId_workspaceId_idx" ON "public"."AdminActionLog"("organizationId" ASC, "workspaceId" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_resourceId_idx" ON "public"."AdminActionLog"("resourceId" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_resourceType_idx" ON "public"."AdminActionLog"("resourceType" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_source_idx" ON "public"."AdminActionLog"("source" ASC);

-- CreateIndex
CREATE INDEX "AdminActionLog_timestamp_idx" ON "public"."AdminActionLog"("timestamp" ASC);

-- CreateIndex
CREATE INDEX "AdminMcpConfirmation_adminUserId_idx" ON "public"."AdminMcpConfirmation"("adminUserId" ASC);

-- CreateIndex
CREATE INDEX "AdminMcpConfirmation_expiresAt_idx" ON "public"."AdminMcpConfirmation"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "AdminMcpConfirmation_mcpSessionId_idx" ON "public"."AdminMcpConfirmation"("mcpSessionId" ASC);

-- CreateIndex
CREATE INDEX "AdminMcpConfirmation_organizationId_status_idx" ON "public"."AdminMcpConfirmation"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "AdminMcpConfirmation_organizationId_workspaceId_idx" ON "public"."AdminMcpConfirmation"("organizationId" ASC, "workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Agent_organizationId_deletedAt_idx" ON "public"."Agent"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "Agent_organizationId_idx" ON "public"."Agent"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "Agent_organizationId_protocolType_idx" ON "public"."Agent"("organizationId" ASC, "protocolType" ASC);

-- CreateIndex
CREATE INDEX "Agent_workspaceId_idx" ON "public"."Agent"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "AgentConfirmation_conversationId_idx" ON "public"."AgentConfirmation"("conversationId" ASC);

-- CreateIndex
CREATE INDEX "AgentConfirmation_expiresAt_idx" ON "public"."AgentConfirmation"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "AgentConfirmation_organizationId_status_idx" ON "public"."AgentConfirmation"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "AgentConfirmation_workspaceId_idx" ON "public"."AgentConfirmation"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "AgentConversation_createdAt_idx" ON "public"."AgentConversation"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "AgentConversation_organizationId_mcpAgentId_idx" ON "public"."AgentConversation"("organizationId" ASC, "mcpAgentId" ASC);

-- CreateIndex
CREATE INDEX "AgentConversation_organizationId_userId_idx" ON "public"."AgentConversation"("organizationId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "AgentMemory_importance_idx" ON "public"."AgentMemory"("importance" ASC);

-- CreateIndex
CREATE INDEX "AgentMemory_lastAccessedAt_idx" ON "public"."AgentMemory"("lastAccessedAt" ASC);

-- CreateIndex
CREATE INDEX "AgentMemory_organizationId_memoryType_idx" ON "public"."AgentMemory"("organizationId" ASC, "memoryType" ASC);

-- CreateIndex
CREATE INDEX "AgentMemory_organizationId_userId_category_idx" ON "public"."AgentMemory"("organizationId" ASC, "userId" ASC, "category" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_organizationId_userId_category_key_key" ON "public"."AgentMemory"("organizationId" ASC, "userId" ASC, "category" ASC, "key" ASC);

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_idx" ON "public"."AgentMessage"("conversationId" ASC);

-- CreateIndex
CREATE INDEX "AgentMessage_createdAt_idx" ON "public"."AgentMessage"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "AgentPlan_conversationId_idx" ON "public"."AgentPlan"("conversationId" ASC);

-- CreateIndex
CREATE INDEX "AgentPlan_organizationId_status_idx" ON "public"."AgentPlan"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "AgentPlan_userId_idx" ON "public"."AgentPlan"("userId" ASC);

-- CreateIndex
CREATE INDEX "AgentPlan_workspaceId_idx" ON "public"."AgentPlan"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "AgentPlanStep_planId_idx" ON "public"."AgentPlanStep"("planId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPlanStep_planId_stepNumber_key" ON "public"."AgentPlanStep"("planId" ASC, "stepNumber" ASC);

-- CreateIndex
CREATE INDEX "AgentPlanStep_status_idx" ON "public"."AgentPlanStep"("status" ASC);

-- CreateIndex
CREATE INDEX "AgentToolUsage_createdAt_idx" ON "public"."AgentToolUsage"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "AgentToolUsage_organizationId_toolName_idx" ON "public"."AgentToolUsage"("organizationId" ASC, "toolName" ASC);

-- CreateIndex
CREATE INDEX "AgentToolUsage_organizationId_userId_toolName_idx" ON "public"."AgentToolUsage"("organizationId" ASC, "userId" ASC, "toolName" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_agentId_idx" ON "public"."AuditLogEntry"("agentId" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_agentName_idx" ON "public"."AuditLogEntry"("agentName" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_decision_idx" ON "public"."AuditLogEntry"("decision" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_organizationId_idx" ON "public"."AuditLogEntry"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_timestamp_idx" ON "public"."AuditLogEntry"("timestamp" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_toolName_idx" ON "public"."AuditLogEntry"("toolName" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_userEmail_idx" ON "public"."AuditLogEntry"("userEmail" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_userId_idx" ON "public"."AuditLogEntry"("userId" ASC);

-- CreateIndex
CREATE INDEX "AuditLogEntry_workspaceId_idx" ON "public"."AuditLogEntry"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "EmailDigestLog_organizationId_idx" ON "public"."EmailDigestLog"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "EmailDigestLog_sentAt_idx" ON "public"."EmailDigestLog"("sentAt" ASC);

-- CreateIndex
CREATE INDEX "EmailDigestPreference_organizationId_idx" ON "public"."EmailDigestPreference"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "EmailDigestPreference_userId_idx" ON "public"."EmailDigestPreference"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDigestPreference_userId_organizationId_key" ON "public"."EmailDigestPreference"("userId" ASC, "organizationId" ASC);

-- CreateIndex
CREATE INDEX "FeatureTipDismissal_organizationId_idx" ON "public"."FeatureTipDismissal"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "FeatureTipDismissal_userId_idx" ON "public"."FeatureTipDismissal"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureTipDismissal_userId_organizationId_tipId_key" ON "public"."FeatureTipDismissal"("userId" ASC, "organizationId" ASC, "tipId" ASC);

-- CreateIndex
CREATE INDEX "FeatureTipOrgOverride_organizationId_idx" ON "public"."FeatureTipOrgOverride"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureTipOrgOverride_organizationId_tipId_key" ON "public"."FeatureTipOrgOverride"("organizationId" ASC, "tipId" ASC);

-- CreateIndex
CREATE INDEX "GlobalVariableField_namespaceId_idx" ON "public"."GlobalVariableField"("namespaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalVariableField_namespaceId_name_key" ON "public"."GlobalVariableField"("namespaceId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "GlobalVariableNamespace_organizationId_deletedAt_idx" ON "public"."GlobalVariableNamespace"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "GlobalVariableNamespace_organizationId_idx" ON "public"."GlobalVariableNamespace"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalVariableNamespace_organizationId_workspaceId_name_key" ON "public"."GlobalVariableNamespace"("organizationId" ASC, "workspaceId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "GlobalVariableNamespace_workspaceId_idx" ON "public"."GlobalVariableNamespace"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "LlmUsageLog_organizationId_createdAt_idx" ON "public"."LlmUsageLog"("organizationId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "LlmUsageLog_organizationId_provider_idx" ON "public"."LlmUsageLog"("organizationId" ASC, "provider" ASC);

-- CreateIndex
CREATE INDEX "McpServer_organizationId_deletedAt_idx" ON "public"."McpServer"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "McpServer_organizationId_idx" ON "public"."McpServer"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "McpServer_trusted_idx" ON "public"."McpServer"("trusted" ASC);

-- CreateIndex
CREATE INDEX "McpServer_workspaceId_idx" ON "public"."McpServer"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "McpTool_mcpServerId_idx" ON "public"."McpTool"("mcpServerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "McpTool_mcpServerId_name_key" ON "public"."McpTool"("mcpServerId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "McpToolClassification_accessType_idx" ON "public"."McpToolClassification"("accessType" ASC);

-- CreateIndex
CREATE INDEX "McpToolClassification_mcpToolId_idx" ON "public"."McpToolClassification"("mcpToolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "McpToolClassification_mcpToolId_key" ON "public"."McpToolClassification"("mcpToolId" ASC);

-- CreateIndex
CREATE INDEX "McpToolClassification_riskLevel_idx" ON "public"."McpToolClassification"("riskLevel" ASC);

-- CreateIndex
CREATE INDEX "MilestoneAchievement_organizationId_idx" ON "public"."MilestoneAchievement"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneAchievement_organizationId_milestoneId_key" ON "public"."MilestoneAchievement"("organizationId" ASC, "milestoneId" ASC);

-- CreateIndex
CREATE INDEX "MilestoneNotificationPreference_organizationId_idx" ON "public"."MilestoneNotificationPreference"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "MilestoneNotificationPreference_userId_idx" ON "public"."MilestoneNotificationPreference"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneNotificationPreference_userId_organizationId_key" ON "public"."MilestoneNotificationPreference"("userId" ASC, "organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClientRegistration_mcpServerId_key" ON "public"."OAuthClientRegistration"("mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "OAuthClientRegistration_organizationId_idx" ON "public"."OAuthClientRegistration"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "public"."OAuthState"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "OAuthState_organizationId_idx" ON "public"."OAuthState"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "OAuthState_state_idx" ON "public"."OAuthState"("state" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "public"."OAuthState"("state" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrgMcpOAuthToken_mcpServerId_key" ON "public"."OrgMcpOAuthToken"("mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "OrgMcpOAuthToken_organizationId_idx" ON "public"."OrgMcpOAuthToken"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "OrgOwner_addedBy_idx" ON "public"."OrgOwner"("addedBy" ASC);

-- CreateIndex
CREATE INDEX "OrgOwner_organizationId_idx" ON "public"."OrgOwner"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrgOwner_organizationId_userId_key" ON "public"."OrgOwner"("organizationId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "OrgOwner_userId_idx" ON "public"."OrgOwner"("userId" ASC);

-- CreateIndex
CREATE INDEX "OrgWidePolicyProposal_organizationId_status_idx" ON "public"."OrgWidePolicyProposal"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "OrgWidePolicyProposal_proposedById_idx" ON "public"."OrgWidePolicyProposal"("proposedById" ASC);

-- CreateIndex
CREATE INDEX "OrgWidePolicyProposal_workspaceId_idx" ON "public"."OrgWidePolicyProposal"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Organization_createdAt_idx" ON "public"."Organization"("createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "public"."OrganizationSettings"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "OwnerRecoveryRequest_organizationId_status_idx" ON "public"."OwnerRecoveryRequest"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "OwnerRecoveryRequest_verificationToken_idx" ON "public"."OwnerRecoveryRequest"("verificationToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerRecoveryRequest_verificationToken_key" ON "public"."OwnerRecoveryRequest"("verificationToken" ASC);

-- CreateIndex
CREATE INDEX "OwnershipTransfer_expiresAt_idx" ON "public"."OwnershipTransfer"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "OwnershipTransfer_organizationId_status_idx" ON "public"."OwnershipTransfer"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "OwnershipTransfer_toUserId_status_idx" ON "public"."OwnershipTransfer"("toUserId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "PermissionRequest_createdAt_idx" ON "public"."PermissionRequest"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "PermissionRequest_linkedPolicyId_idx" ON "public"."PermissionRequest"("linkedPolicyId" ASC);

-- CreateIndex
CREATE INDEX "PermissionRequest_status_idx" ON "public"."PermissionRequest"("status" ASC);

-- CreateIndex
CREATE INDEX "PermissionRequest_userId_idx" ON "public"."PermissionRequest"("userId" ASC);

-- CreateIndex
CREATE INDEX "PermissionRequest_workspaceId_idx" ON "public"."PermissionRequest"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Policy_enabled_idx" ON "public"."Policy"("enabled" ASC);

-- CreateIndex
CREATE INDEX "Policy_organizationId_deletedAt_idx" ON "public"."Policy"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "Policy_organizationId_idx" ON "public"."Policy"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Policy_organizationId_slug_key" ON "public"."Policy"("organizationId" ASC, "slug" ASC);

-- CreateIndex
CREATE INDEX "Policy_workspaceId_idx" ON "public"."Policy"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "PolicyAssertion_enabled_idx" ON "public"."PolicyAssertion"("enabled" ASC);

-- CreateIndex
CREATE INDEX "PolicyAssertion_lastRunPassed_idx" ON "public"."PolicyAssertion"("lastRunPassed" ASC);

-- CreateIndex
CREATE INDEX "PolicyAssertion_organizationId_idx" ON "public"."PolicyAssertion"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAssertion_organizationId_name_key" ON "public"."PolicyAssertion"("organizationId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "PolicyAssertion_source_idx" ON "public"."PolicyAssertion"("source" ASC);

-- CreateIndex
CREATE INDEX "PolicyExceptionRequest_organizationId_status_idx" ON "public"."PolicyExceptionRequest"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "PolicyExceptionRequest_policyId_idx" ON "public"."PolicyExceptionRequest"("policyId" ASC);

-- CreateIndex
CREATE INDEX "PolicyExceptionRequest_requestedById_idx" ON "public"."PolicyExceptionRequest"("requestedById" ASC);

-- CreateIndex
CREATE INDEX "PolicyExceptionRequest_workspaceId_idx" ON "public"."PolicyExceptionRequest"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "PolicyTag_organizationId_idx" ON "public"."PolicyTag"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyTag_organizationId_workspaceId_name_key" ON "public"."PolicyTag"("organizationId" ASC, "workspaceId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "PolicyTag_workspaceId_idx" ON "public"."PolicyTag"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "PolicyTagAssignment_policyId_idx" ON "public"."PolicyTagAssignment"("policyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyTagAssignment_policyId_policyTagId_key" ON "public"."PolicyTagAssignment"("policyId" ASC, "policyTagId" ASC);

-- CreateIndex
CREATE INDEX "PolicyTagAssignment_policyTagId_idx" ON "public"."PolicyTagAssignment"("policyTagId" ASC);

-- CreateIndex
CREATE INDEX "PolicyTest_createdAt_idx" ON "public"."PolicyTest"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "PolicyTest_createdById_idx" ON "public"."PolicyTest"("createdById" ASC);

-- CreateIndex
CREATE INDEX "PolicyTest_organizationId_idx" ON "public"."PolicyTest"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "PublisherRegistry_organizationId_deletedAt_idx" ON "public"."PublisherRegistry"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "PublisherRegistry_organizationId_idx" ON "public"."PublisherRegistry"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PublisherRegistry_organizationId_keyFingerprint_key" ON "public"."PublisherRegistry"("organizationId" ASC, "keyFingerprint" ASC);

-- CreateIndex
CREATE INDEX "Role_isAdmin_idx" ON "public"."Role"("isAdmin" ASC);

-- CreateIndex
CREATE INDEX "Role_organizationId_deletedAt_idx" ON "public"."Role"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "Role_organizationId_idx" ON "public"."Role"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "public"."Role"("organizationId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "SensitiveFlagAgentOverride_agentId_idx" ON "public"."SensitiveFlagAgentOverride"("agentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SensitiveFlagAgentOverride_sensitiveToolFlagId_agentId_key" ON "public"."SensitiveFlagAgentOverride"("sensitiveToolFlagId" ASC, "agentId" ASC);

-- CreateIndex
CREATE INDEX "SensitiveFlagApprovalRequest_expiresAt_idx" ON "public"."SensitiveFlagApprovalRequest"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "SensitiveFlagApprovalRequest_organizationId_status_idx" ON "public"."SensitiveFlagApprovalRequest"("organizationId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "SensitiveFlagApprovalRequest_organizationId_type_status_idx" ON "public"."SensitiveFlagApprovalRequest"("organizationId" ASC, "type" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "SensitiveFlagApprovalRequest_sessionId_idx" ON "public"."SensitiveFlagApprovalRequest"("sessionId" ASC);

-- CreateIndex
CREATE INDEX "SensitiveFlagApprovalRequest_userId_status_idx" ON "public"."SensitiveFlagApprovalRequest"("userId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SensitiveFlagRateLimitUsage_sessionId_toolPattern_windowSta_key" ON "public"."SensitiveFlagRateLimitUsage"("sessionId" ASC, "toolPattern" ASC, "windowStart" ASC);

-- CreateIndex
CREATE INDEX "SensitiveFlagRateLimitUsage_windowEnd_idx" ON "public"."SensitiveFlagRateLimitUsage"("windowEnd" ASC);

-- CreateIndex
CREATE INDEX "SensitiveToolFlag_organizationId_enabled_idx" ON "public"."SensitiveToolFlag"("organizationId" ASC, "enabled" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SensitiveToolFlag_organizationId_workspaceId_toolPattern_key" ON "public"."SensitiveToolFlag"("organizationId" ASC, "workspaceId" ASC, "toolPattern" ASC);

-- CreateIndex
CREATE INDEX "SensitiveToolFlag_workspaceId_idx" ON "public"."SensitiveToolFlag"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "public"."Session"("expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Session_organizationId_externalSessionId_key" ON "public"."Session"("organizationId" ASC, "externalSessionId" ASC);

-- CreateIndex
CREATE INDEX "Session_organizationId_idx" ON "public"."Session"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "public"."Session"("status" ASC);

-- CreateIndex
CREATE INDEX "Session_workspaceId_idx" ON "public"."Session"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "SessionContextEntry_importance_idx" ON "public"."SessionContextEntry"("importance" ASC);

-- CreateIndex
CREATE INDEX "SessionContextEntry_sessionId_entryType_idx" ON "public"."SessionContextEntry"("sessionId" ASC, "entryType" ASC);

-- CreateIndex
CREATE INDEX "SessionContextEntry_sessionId_idx" ON "public"."SessionContextEntry"("sessionId" ASC);

-- CreateIndex
CREATE INDEX "ToolEmbeddingCache_organizationId_idx" ON "public"."ToolEmbeddingCache"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ToolEmbeddingCache_organizationId_toolName_key" ON "public"."ToolEmbeddingCache"("organizationId" ASC, "toolName" ASC);

-- CreateIndex
CREATE INDEX "ToolParamValue_lastSeenAt_idx" ON "public"."ToolParamValue"("lastSeenAt" ASC);

-- CreateIndex
CREATE INDEX "ToolParamValue_organizationId_serverId_idx" ON "public"."ToolParamValue"("organizationId" ASC, "serverId" ASC);

-- CreateIndex
CREATE INDEX "ToolParamValue_organizationId_serverId_parameterKey_idx" ON "public"."ToolParamValue"("organizationId" ASC, "serverId" ASC, "parameterKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ToolParamValue_organizationId_serverId_parameterKey_paramet_key" ON "public"."ToolParamValue"("organizationId" ASC, "serverId" ASC, "parameterKey" ASC, "parameterValue" ASC);

-- CreateIndex
CREATE INDEX "User_accessToken_idx" ON "public"."User"("accessToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_accessToken_key" ON "public"."User"("accessToken" ASC);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE INDEX "User_organizationId_deletedAt_idx" ON "public"."User"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "public"."User"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "UserFeatureTipsSettings_userId_idx" ON "public"."UserFeatureTipsSettings"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserFeatureTipsSettings_userId_workspaceId_key" ON "public"."UserFeatureTipsSettings"("userId" ASC, "workspaceId" ASC);

-- CreateIndex
CREATE INDEX "UserFeatureTipsSettings_workspaceId_idx" ON "public"."UserFeatureTipsSettings"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "UserLLMConfig_userId_idx" ON "public"."UserLLMConfig"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserLLMConfig_userId_workspaceId_key" ON "public"."UserLLMConfig"("userId" ASC, "workspaceId" ASC);

-- CreateIndex
CREATE INDEX "UserLLMConfig_workspaceId_idx" ON "public"."UserLLMConfig"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "UserMcpConfig_mcpServerId_idx" ON "public"."UserMcpConfig"("mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "UserMcpConfig_userId_idx" ON "public"."UserMcpConfig"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserMcpConfig_userId_mcpServerId_key" ON "public"."UserMcpConfig"("userId" ASC, "mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "UserOnboarding_userId_idx" ON "public"."UserOnboarding"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserOnboarding_userId_key" ON "public"."UserOnboarding"("userId" ASC);

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "public"."UserRole"("roleId" ASC);

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "public"."UserRole"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "public"."UserRole"("userId" ASC, "roleId" ASC);

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_idx" ON "public"."WebhookDelivery"("endpointId" ASC);

-- CreateIndex
CREATE INDEX "WebhookDelivery_nextRetryAt_idx" ON "public"."WebhookDelivery"("nextRetryAt" ASC);

-- CreateIndex
CREATE INDEX "WebhookEndpoint_organizationId_enabled_idx" ON "public"."WebhookEndpoint"("organizationId" ASC, "enabled" ASC);

-- CreateIndex
CREATE INDEX "WebhookEndpoint_workspaceId_idx" ON "public"."WebhookEndpoint"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Workspace_organizationId_deletedAt_idx" ON "public"."Workspace"("organizationId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "Workspace_organizationId_idx" ON "public"."Workspace"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_name_key" ON "public"."Workspace"("organizationId" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_slug_key" ON "public"."Workspace"("organizationId" ASC, "slug" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceChatConversation_createdAt_idx" ON "public"."WorkspaceChatConversation"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceChatConversation_workspaceId_userId_idx" ON "public"."WorkspaceChatConversation"("workspaceId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceChatMessage_conversationId_idx" ON "public"."WorkspaceChatMessage"("conversationId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceChatMessage_createdAt_idx" ON "public"."WorkspaceChatMessage"("createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceChatSettings_workspaceId_key" ON "public"."WorkspaceChatSettings"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceChatUsage_userId_idx" ON "public"."WorkspaceChatUsage"("userId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceChatUsage_workspaceId_idx" ON "public"."WorkspaceChatUsage"("workspaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceChatUsage_workspaceId_userId_month_key" ON "public"."WorkspaceChatUsage"("workspaceId" ASC, "userId" ASC, "month" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeatureTipsSettings_workspaceId_key" ON "public"."WorkspaceFeatureTipsSettings"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceMcpConfig_mcpServerId_idx" ON "public"."WorkspaceMcpConfig"("mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceMcpConfig_workspaceId_idx" ON "public"."WorkspaceMcpConfig"("workspaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMcpConfig_workspaceId_mcpServerId_key" ON "public"."WorkspaceMcpConfig"("workspaceId" ASC, "mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceMcpOAuthToken_mcpServerId_idx" ON "public"."WorkspaceMcpOAuthToken"("mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceMcpOAuthToken_workspaceId_idx" ON "public"."WorkspaceMcpOAuthToken"("workspaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMcpOAuthToken_workspaceId_mcpServerId_key" ON "public"."WorkspaceMcpOAuthToken"("workspaceId" ASC, "mcpServerId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "public"."WorkspaceMember"("userId" ASC);

-- CreateIndex
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "public"."WorkspaceMember"("workspaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "public"."WorkspaceMember"("workspaceId" ASC, "userId" ASC);

-- AddForeignKey
ALTER TABLE "public"."A2ACredential" ADD CONSTRAINT "A2ACredential_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."A2ACredential" ADD CONSTRAINT "A2ACredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminActionLog" ADD CONSTRAINT "AdminActionLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminActionLog" ADD CONSTRAINT "AdminActionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminMcpConfirmation" ADD CONSTRAINT "AdminMcpConfirmation_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminMcpConfirmation" ADD CONSTRAINT "AdminMcpConfirmation_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminMcpConfirmation" ADD CONSTRAINT "AdminMcpConfirmation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminMcpConfirmation" ADD CONSTRAINT "AdminMcpConfirmation_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminMcpConfirmation" ADD CONSTRAINT "AdminMcpConfirmation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Agent" ADD CONSTRAINT "Agent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Agent" ADD CONSTRAINT "Agent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentConfirmation" ADD CONSTRAINT "AgentConfirmation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentConfirmation" ADD CONSTRAINT "AgentConfirmation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentConfirmation" ADD CONSTRAINT "AgentConfirmation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentConversation" ADD CONSTRAINT "AgentConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentConversation" ADD CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentMemory" ADD CONSTRAINT "AgentMemory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentPlan" ADD CONSTRAINT "AgentPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentPlan" ADD CONSTRAINT "AgentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentPlan" ADD CONSTRAINT "AgentPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentPlanStep" ADD CONSTRAINT "AgentPlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."AgentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentToolUsage" ADD CONSTRAINT "AgentToolUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentToolUsage" ADD CONSTRAINT "AgentToolUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailDigestLog" ADD CONSTRAINT "EmailDigestLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailDigestPreference" ADD CONSTRAINT "EmailDigestPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailDigestPreference" ADD CONSTRAINT "EmailDigestPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureTipDismissal" ADD CONSTRAINT "FeatureTipDismissal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureTipDismissal" ADD CONSTRAINT "FeatureTipDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureTipOrgOverride" ADD CONSTRAINT "FeatureTipOrgOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GlobalVariableField" ADD CONSTRAINT "GlobalVariableField_namespaceId_fkey" FOREIGN KEY ("namespaceId") REFERENCES "public"."GlobalVariableNamespace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GlobalVariableNamespace" ADD CONSTRAINT "GlobalVariableNamespace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GlobalVariableNamespace" ADD CONSTRAINT "GlobalVariableNamespace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LlmUsageLog" ADD CONSTRAINT "LlmUsageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."McpServer" ADD CONSTRAINT "McpServer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."McpServer" ADD CONSTRAINT "McpServer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."McpTool" ADD CONSTRAINT "McpTool_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "public"."McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."McpToolClassification" ADD CONSTRAINT "McpToolClassification_mcpToolId_fkey" FOREIGN KEY ("mcpToolId") REFERENCES "public"."McpTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MilestoneAchievement" ADD CONSTRAINT "MilestoneAchievement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MilestoneNotificationPreference" ADD CONSTRAINT "MilestoneNotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MilestoneNotificationPreference" ADD CONSTRAINT "MilestoneNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthClientRegistration" ADD CONSTRAINT "OAuthClientRegistration_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "public"."McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthClientRegistration" ADD CONSTRAINT "OAuthClientRegistration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthState" ADD CONSTRAINT "OAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgMcpOAuthToken" ADD CONSTRAINT "OrgMcpOAuthToken_connectedBy_fkey" FOREIGN KEY ("connectedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgMcpOAuthToken" ADD CONSTRAINT "OrgMcpOAuthToken_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "public"."McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgMcpOAuthToken" ADD CONSTRAINT "OrgMcpOAuthToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgOwner" ADD CONSTRAINT "OrgOwner_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgOwner" ADD CONSTRAINT "OrgOwner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgOwner" ADD CONSTRAINT "OrgOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgWidePolicyProposal" ADD CONSTRAINT "OrgWidePolicyProposal_createdPolicyId_fkey" FOREIGN KEY ("createdPolicyId") REFERENCES "public"."Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgWidePolicyProposal" ADD CONSTRAINT "OrgWidePolicyProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgWidePolicyProposal" ADD CONSTRAINT "OrgWidePolicyProposal_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgWidePolicyProposal" ADD CONSTRAINT "OrgWidePolicyProposal_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnerRecoveryRequest" ADD CONSTRAINT "OwnerRecoveryRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PermissionRequest" ADD CONSTRAINT "PermissionRequest_linkedPolicyId_fkey" FOREIGN KEY ("linkedPolicyId") REFERENCES "public"."Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PermissionRequest" ADD CONSTRAINT "PermissionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PermissionRequest" ADD CONSTRAINT "PermissionRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Policy" ADD CONSTRAINT "Policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Policy" ADD CONSTRAINT "Policy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyAssertion" ADD CONSTRAINT "PolicyAssertion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyExceptionRequest" ADD CONSTRAINT "PolicyExceptionRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyExceptionRequest" ADD CONSTRAINT "PolicyExceptionRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyExceptionRequest" ADD CONSTRAINT "PolicyExceptionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyExceptionRequest" ADD CONSTRAINT "PolicyExceptionRequest_resultPolicyId_fkey" FOREIGN KEY ("resultPolicyId") REFERENCES "public"."Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyExceptionRequest" ADD CONSTRAINT "PolicyExceptionRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyExceptionRequest" ADD CONSTRAINT "PolicyExceptionRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyTag" ADD CONSTRAINT "PolicyTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyTag" ADD CONSTRAINT "PolicyTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyTagAssignment" ADD CONSTRAINT "PolicyTagAssignment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyTagAssignment" ADD CONSTRAINT "PolicyTagAssignment_policyTagId_fkey" FOREIGN KEY ("policyTagId") REFERENCES "public"."PolicyTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyTest" ADD CONSTRAINT "PolicyTest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PublisherRegistry" ADD CONSTRAINT "PublisherRegistry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagAgentOverride" ADD CONSTRAINT "SensitiveFlagAgentOverride_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagAgentOverride" ADD CONSTRAINT "SensitiveFlagAgentOverride_sensitiveToolFlagId_fkey" FOREIGN KEY ("sensitiveToolFlagId") REFERENCES "public"."SensitiveToolFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagApprovalRequest" ADD CONSTRAINT "SensitiveFlagApprovalRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagApprovalRequest" ADD CONSTRAINT "SensitiveFlagApprovalRequest_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagApprovalRequest" ADD CONSTRAINT "SensitiveFlagApprovalRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagApprovalRequest" ADD CONSTRAINT "SensitiveFlagApprovalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagApprovalRequest" ADD CONSTRAINT "SensitiveFlagApprovalRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveFlagRateLimitUsage" ADD CONSTRAINT "SensitiveFlagRateLimitUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveToolFlag" ADD CONSTRAINT "SensitiveToolFlag_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveToolFlag" ADD CONSTRAINT "SensitiveToolFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensitiveToolFlag" ADD CONSTRAINT "SensitiveToolFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionContextEntry" ADD CONSTRAINT "SessionContextEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ToolEmbeddingCache" ADD CONSTRAINT "ToolEmbeddingCache_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ToolParamValue" ADD CONSTRAINT "ToolParamValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ToolParamValue" ADD CONSTRAINT "ToolParamValue_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFeatureTipsSettings" ADD CONSTRAINT "UserFeatureTipsSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFeatureTipsSettings" ADD CONSTRAINT "UserFeatureTipsSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLLMConfig" ADD CONSTRAINT "UserLLMConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLLMConfig" ADD CONSTRAINT "UserLLMConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMcpConfig" ADD CONSTRAINT "UserMcpConfig_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "public"."McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMcpConfig" ADD CONSTRAINT "UserMcpConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserOnboarding" ADD CONSTRAINT "UserOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "public"."WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceChatConversation" ADD CONSTRAINT "WorkspaceChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceChatConversation" ADD CONSTRAINT "WorkspaceChatConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceChatMessage" ADD CONSTRAINT "WorkspaceChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."WorkspaceChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceChatMessage" ADD CONSTRAINT "WorkspaceChatMessage_permissionRequestId_fkey" FOREIGN KEY ("permissionRequestId") REFERENCES "public"."PermissionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceChatSettings" ADD CONSTRAINT "WorkspaceChatSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceChatUsage" ADD CONSTRAINT "WorkspaceChatUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceChatUsage" ADD CONSTRAINT "WorkspaceChatUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceFeatureTipsSettings" ADD CONSTRAINT "WorkspaceFeatureTipsSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMcpConfig" ADD CONSTRAINT "WorkspaceMcpConfig_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "public"."McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMcpConfig" ADD CONSTRAINT "WorkspaceMcpConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMcpOAuthToken" ADD CONSTRAINT "WorkspaceMcpOAuthToken_connectedBy_fkey" FOREIGN KEY ("connectedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMcpOAuthToken" ADD CONSTRAINT "WorkspaceMcpOAuthToken_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "public"."McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMcpOAuthToken" ADD CONSTRAINT "WorkspaceMcpOAuthToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
