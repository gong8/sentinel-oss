/**
 * Admin MCP Confirmation Service Unit Tests
 * Tests for admin MCP confirmation workflow
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogger, mockGetAdminMcpSettings } = vi.hoisted(() => ({
  mockPrisma: {
    adminMcpConfirmation: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockGetAdminMcpSettings: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminMcpConfirmationStatus: {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
    EXECUTED: 'EXECUTED',
    FAILED: 'FAILED',
  },
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../packages/api/src/services/adminMcpSettings.js', () => ({
  getAdminMcpSettings: mockGetAdminMcpSettings,
}));

import {
  confirmAction,
  createAdminMcpConfirmation,
  expireOldConfirmations,
  generateDescription,
  getConfirmationById,
  getConfirmations,
  getConfirmationStatus,
  getPendingCount,
  markExecuted,
  markFailed,
  rejectAction,
} from '../../../../packages/api/src/services/adminMcpConfirmation.js';
import { AdminMcpScope } from '../../../../packages/api/src/types/adminMcp.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockConfirmation(
  overrides: Partial<{
    id: string;
    organizationId: string;
    mcpSessionId: string;
    adminUserId: string;
    toolName: string;
    toolInput: unknown;
    scope: string;
    description: string;
    riskLevel: string;
    status: string;
    expiresAt: Date;
    confirmedAt: Date | null;
    confirmedBy: string | null;
    rejectedAt: Date | null;
    rejectedBy: string | null;
    rejectionReason: string | null;
    executedAt: Date | null;
    result: unknown;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'confirmation-1',
    organizationId: overrides.organizationId ?? 'org-1',
    mcpSessionId: overrides.mcpSessionId ?? 'session-1',
    adminUserId: overrides.adminUserId ?? 'admin-1',
    toolName: overrides.toolName ?? 'admin_create_policy',
    toolInput: overrides.toolInput ?? { name: 'test', effect: 'ALLOW' },
    scope: overrides.scope ?? 'POLICIES',
    description: overrides.description ?? 'Create ALLOW policy "test"',
    riskLevel: overrides.riskLevel ?? 'MEDIUM',
    status: overrides.status ?? 'PENDING',
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 300000),
    confirmedAt: overrides.confirmedAt ?? null,
    confirmedBy: overrides.confirmedBy ?? null,
    rejectedAt: overrides.rejectedAt ?? null,
    rejectedBy: overrides.rejectedBy ?? null,
    rejectionReason: overrides.rejectionReason ?? null,
    executedAt: overrides.executedAt ?? null,
    result: overrides.result ?? null,
    error: overrides.error ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    adminUser: { id: overrides.adminUserId ?? 'admin-1', email: 'admin@example.com' },
    confirmer: overrides.confirmedBy
      ? { id: overrides.confirmedBy, email: 'confirmer@example.com' }
      : null,
    rejecter: overrides.rejectedBy
      ? { id: overrides.rejectedBy, email: 'rejecter@example.com' }
      : null,
  };
}

function setupDefaultSettings() {
  mockGetAdminMcpSettings.mockResolvedValue({
    enabled: true,
    enabledScopes: [AdminMcpScope.POLICIES],
    allowedAdmins: [],
    rateLimitPerMin: 30,
    confirmationTtlSeconds: 300,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultSettings();
});

describe('Admin MCP Confirmation Service', () => {
  describe('generateDescription', () => {
    describe('policy tools', () => {
      test('should generate description for admin_create_policy', () => {
        const result = generateDescription('admin_create_policy', {
          name: 'test-policy',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          toolPatterns: ['github.com::*'],
        });

        expect(result).toBe('Create ALLOW policy "test-policy" for role:Admin on github.com::*');
      });

      test('should use slug when name is not provided', () => {
        const result = generateDescription('admin_create_policy', {
          slug: 'test-slug',
          effect: 'DENY',
        });

        expect(result).toContain('test-slug');
        expect(result).toContain('DENY');
      });

      test('should handle missing matchers', () => {
        const result = generateDescription('admin_create_policy', {
          name: 'test',
          effect: 'ALLOW',
        });

        expect(result).toContain('all');
      });

      test('should handle missing toolPatterns', () => {
        const result = generateDescription('admin_create_policy', {
          name: 'test',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
        });

        expect(result).toContain('*');
      });

      test('should generate description for admin_update_policy', () => {
        const result = generateDescription('admin_update_policy', { id: 'policy-123' });
        expect(result).toBe('Update policy policy-123');
      });

      test('should generate description for admin_delete_policy', () => {
        const result = generateDescription('admin_delete_policy', { policyId: 'policy-456' });
        expect(result).toBe('Delete policy policy-456');
      });

      test('should generate description for admin_enable_policy', () => {
        const result = generateDescription('admin_enable_policy', { id: 'policy-789' });
        expect(result).toBe('Enable policy policy-789');
      });

      test('should generate description for admin_disable_policy', () => {
        const result = generateDescription('admin_disable_policy', { id: 'policy-abc' });
        expect(result).toBe('Disable policy policy-abc');
      });
    });

    describe('user tools', () => {
      test('should generate description for admin_create_user', () => {
        const result = generateDescription('admin_create_user', { email: 'new@example.com' });
        expect(result).toBe('Create user new@example.com');
      });

      test('should generate description for admin_update_user', () => {
        const result = generateDescription('admin_update_user', { userId: 'user-123' });
        expect(result).toBe('Update user user-123');
      });

      test('should generate description for admin_delete_user', () => {
        const result = generateDescription('admin_delete_user', { id: 'user-456' });
        expect(result).toBe('Delete user user-456');
      });

      test('should generate description for admin_refresh_token', () => {
        const result = generateDescription('admin_refresh_token', { id: 'user-789' });
        expect(result).toBe('Refresh token for user user-789');
      });

      test('should generate description for admin_revoke_token', () => {
        const result = generateDescription('admin_revoke_token', { userId: 'user-abc' });
        expect(result).toBe('Revoke token for user user-abc');
      });
    });

    describe('role tools', () => {
      test('should generate description for admin_create_role', () => {
        const result = generateDescription('admin_create_role', { name: 'Developer' });
        expect(result).toBe('Create role "Developer"');
      });

      test('should generate description for admin_update_role', () => {
        const result = generateDescription('admin_update_role', { roleId: 'role-123' });
        expect(result).toBe('Update role role-123');
      });

      test('should generate description for admin_delete_role', () => {
        const result = generateDescription('admin_delete_role', { id: 'role-456' });
        expect(result).toBe('Delete role role-456');
      });
    });

    describe('MCP server tools', () => {
      test('should generate description for admin_create_mcp_server', () => {
        const result = generateDescription('admin_create_mcp_server', {
          name: 'GitHub MCP',
          url: 'https://github.com/mcp',
        });
        expect(result).toBe('Register MCP server "GitHub MCP" at https://github.com/mcp');
      });

      test('should generate description for admin_update_mcp_server', () => {
        const result = generateDescription('admin_update_mcp_server', { serverId: 'server-123' });
        expect(result).toBe('Update MCP server server-123');
      });

      test('should generate description for admin_delete_mcp_server', () => {
        const result = generateDescription('admin_delete_mcp_server', { id: 'server-456' });
        expect(result).toBe('Delete MCP server server-456');
      });

      test('should generate description for admin_set_org_api_key', () => {
        const result = generateDescription('admin_set_org_api_key', { serverId: 'server-789' });
        expect(result).toBe('Set org-level API key for server server-789');
      });

      test('should generate description for admin_register_oauth_client', () => {
        const result = generateDescription('admin_register_oauth_client', {
          serverId: 'server-abc',
        });
        expect(result).toBe('Register OAuth client for server server-abc');
      });
    });

    describe('agent tools', () => {
      test('should generate description for admin_create_agent', () => {
        const result = generateDescription('admin_create_agent', { name: 'Claude Agent' });
        expect(result).toBe('Register agent "Claude Agent"');
      });

      test('should generate description for admin_delete_agent', () => {
        const result = generateDescription('admin_delete_agent', { agentId: 'agent-123' });
        expect(result).toBe('Delete agent agent-123');
      });
    });

    describe('sensitive flag tools', () => {
      test('should generate description for admin_create_sensitive_flag', () => {
        const result = generateDescription('admin_create_sensitive_flag', {
          toolPattern: 'github.com::delete*',
        });
        expect(result).toBe('Create sensitive flag for github.com::delete*');
      });

      test('should generate description for admin_update_sensitive_flag', () => {
        const result = generateDescription('admin_update_sensitive_flag', { flagId: 'flag-123' });
        expect(result).toBe('Update sensitive flag flag-123');
      });

      test('should generate description for admin_delete_sensitive_flag', () => {
        const result = generateDescription('admin_delete_sensitive_flag', { id: 'flag-456' });
        expect(result).toBe('Delete sensitive flag flag-456');
      });

      test('should generate description for admin_approve_sensitive', () => {
        const result = generateDescription('admin_approve_sensitive', { requestId: 'req-123' });
        expect(result).toBe('Approve request req-123');
      });

      test('should generate description for admin_deny_sensitive', () => {
        const result = generateDescription('admin_deny_sensitive', { id: 'req-456' });
        expect(result).toBe('Deny request req-456');
      });
    });

    describe('webhook tools', () => {
      test('should generate description for admin_create_webhook', () => {
        const result = generateDescription('admin_create_webhook', { name: 'Slack Notifier' });
        expect(result).toBe('Create webhook "Slack Notifier"');
      });

      test('should generate description for admin_update_webhook', () => {
        const result = generateDescription('admin_update_webhook', { webhookId: 'webhook-123' });
        expect(result).toBe('Update webhook webhook-123');
      });

      test('should generate description for admin_delete_webhook', () => {
        const result = generateDescription('admin_delete_webhook', { id: 'webhook-456' });
        expect(result).toBe('Delete webhook webhook-456');
      });
    });

    describe('permission request tools', () => {
      test('should generate description for admin_approve_request', () => {
        const result = generateDescription('admin_approve_request', { id: 'perm-123' });
        expect(result).toBe('Approve request perm-123');
      });

      test('should generate description for admin_deny_request', () => {
        const result = generateDescription('admin_deny_request', { requestId: 'perm-456' });
        expect(result).toBe('Deny request perm-456');
      });
    });

    describe('edge cases', () => {
      test('should handle unknown tool name', () => {
        const result = generateDescription('admin_unknown_tool', { foo: 'bar' });
        expect(result).toBe('Execute admin_unknown_tool');
      });

      test('should handle missing id fields with fallback to "unknown"', () => {
        const result = generateDescription('admin_delete_policy', {});
        expect(result).toBe('Delete policy unknown');
      });

      test('should handle empty object input', () => {
        const result = generateDescription('admin_create_policy', {});
        expect(result).toContain('unnamed');
      });
    });

    describe('fallback field coverage', () => {
      test('admin_update_policy should use policyId when id is missing', () => {
        const result = generateDescription('admin_update_policy', { policyId: 'fallback-id' });
        expect(result).toBe('Update policy fallback-id');
      });

      test('admin_update_policy should fallback to unknown when no id provided', () => {
        const result = generateDescription('admin_update_policy', {});
        expect(result).toBe('Update policy unknown');
      });

      test('admin_enable_policy should use policyId when id is missing', () => {
        const result = generateDescription('admin_enable_policy', { policyId: 'enable-id' });
        expect(result).toBe('Enable policy enable-id');
      });

      test('admin_enable_policy should fallback to unknown', () => {
        const result = generateDescription('admin_enable_policy', {});
        expect(result).toBe('Enable policy unknown');
      });

      test('admin_disable_policy should use policyId when id is missing', () => {
        const result = generateDescription('admin_disable_policy', { policyId: 'disable-id' });
        expect(result).toBe('Disable policy disable-id');
      });

      test('admin_disable_policy should fallback to unknown', () => {
        const result = generateDescription('admin_disable_policy', {});
        expect(result).toBe('Disable policy unknown');
      });

      test('admin_create_user should fallback to unknown email', () => {
        const result = generateDescription('admin_create_user', {});
        expect(result).toBe('Create user unknown');
      });

      test('admin_update_user should use id when userId is missing', () => {
        const result = generateDescription('admin_update_user', { id: 'update-user-id' });
        expect(result).toBe('Update user update-user-id');
      });

      test('admin_update_user should fallback to unknown', () => {
        const result = generateDescription('admin_update_user', {});
        expect(result).toBe('Update user unknown');
      });

      test('admin_delete_user should use userId when id is missing', () => {
        const result = generateDescription('admin_delete_user', { userId: 'delete-user-id' });
        expect(result).toBe('Delete user delete-user-id');
      });

      test('admin_delete_user should fallback to unknown', () => {
        const result = generateDescription('admin_delete_user', {});
        expect(result).toBe('Delete user unknown');
      });

      test('admin_refresh_token should use userId when id is missing', () => {
        const result = generateDescription('admin_refresh_token', { userId: 'refresh-user-id' });
        expect(result).toBe('Refresh token for user refresh-user-id');
      });

      test('admin_refresh_token should fallback to unknown', () => {
        const result = generateDescription('admin_refresh_token', {});
        expect(result).toBe('Refresh token for user unknown');
      });

      test('admin_revoke_token should use id when userId is missing', () => {
        const result = generateDescription('admin_revoke_token', { id: 'revoke-user-id' });
        expect(result).toBe('Revoke token for user revoke-user-id');
      });

      test('admin_revoke_token should fallback to unknown', () => {
        const result = generateDescription('admin_revoke_token', {});
        expect(result).toBe('Revoke token for user unknown');
      });

      test('admin_create_role should fallback to unnamed', () => {
        const result = generateDescription('admin_create_role', {});
        expect(result).toBe('Create role "unnamed"');
      });

      test('admin_update_role should use id when roleId is missing', () => {
        const result = generateDescription('admin_update_role', { id: 'update-role-id' });
        expect(result).toBe('Update role update-role-id');
      });

      test('admin_update_role should fallback to unknown', () => {
        const result = generateDescription('admin_update_role', {});
        expect(result).toBe('Update role unknown');
      });

      test('admin_delete_role should use roleId when id is missing', () => {
        const result = generateDescription('admin_delete_role', { roleId: 'delete-role-id' });
        expect(result).toBe('Delete role delete-role-id');
      });

      test('admin_delete_role should fallback to unknown', () => {
        const result = generateDescription('admin_delete_role', {});
        expect(result).toBe('Delete role unknown');
      });

      test('admin_create_mcp_server should fallback to unnamed and unknown url', () => {
        const result = generateDescription('admin_create_mcp_server', {});
        expect(result).toBe('Register MCP server "unnamed" at unknown');
      });

      test('admin_update_mcp_server should use id when serverId is missing', () => {
        const result = generateDescription('admin_update_mcp_server', { id: 'update-server-id' });
        expect(result).toBe('Update MCP server update-server-id');
      });

      test('admin_update_mcp_server should fallback to unknown', () => {
        const result = generateDescription('admin_update_mcp_server', {});
        expect(result).toBe('Update MCP server unknown');
      });

      test('admin_delete_mcp_server should use serverId when id is missing', () => {
        const result = generateDescription('admin_delete_mcp_server', {
          serverId: 'delete-server-id',
        });
        expect(result).toBe('Delete MCP server delete-server-id');
      });

      test('admin_delete_mcp_server should fallback to unknown', () => {
        const result = generateDescription('admin_delete_mcp_server', {});
        expect(result).toBe('Delete MCP server unknown');
      });

      test('admin_set_org_api_key should fallback to unknown', () => {
        const result = generateDescription('admin_set_org_api_key', {});
        expect(result).toBe('Set org-level API key for server unknown');
      });

      test('admin_register_oauth_client should fallback to unknown', () => {
        const result = generateDescription('admin_register_oauth_client', {});
        expect(result).toBe('Register OAuth client for server unknown');
      });

      test('admin_create_agent should fallback to unnamed', () => {
        const result = generateDescription('admin_create_agent', {});
        expect(result).toBe('Register agent "unnamed"');
      });

      test('admin_delete_agent should use id when agentId is missing', () => {
        const result = generateDescription('admin_delete_agent', { id: 'delete-agent-id' });
        expect(result).toBe('Delete agent delete-agent-id');
      });

      test('admin_delete_agent should fallback to unknown', () => {
        const result = generateDescription('admin_delete_agent', {});
        expect(result).toBe('Delete agent unknown');
      });

      test('admin_create_sensitive_flag should fallback to wildcard pattern', () => {
        const result = generateDescription('admin_create_sensitive_flag', {});
        expect(result).toBe('Create sensitive flag for *');
      });

      test('admin_update_sensitive_flag should use id when flagId is missing', () => {
        const result = generateDescription('admin_update_sensitive_flag', { id: 'update-flag-id' });
        expect(result).toBe('Update sensitive flag update-flag-id');
      });

      test('admin_update_sensitive_flag should fallback to unknown', () => {
        const result = generateDescription('admin_update_sensitive_flag', {});
        expect(result).toBe('Update sensitive flag unknown');
      });

      test('admin_delete_sensitive_flag should use flagId when id is missing', () => {
        const result = generateDescription('admin_delete_sensitive_flag', {
          flagId: 'delete-flag-id',
        });
        expect(result).toBe('Delete sensitive flag delete-flag-id');
      });

      test('admin_delete_sensitive_flag should fallback to unknown', () => {
        const result = generateDescription('admin_delete_sensitive_flag', {});
        expect(result).toBe('Delete sensitive flag unknown');
      });

      test('admin_approve_sensitive should use id when requestId is missing', () => {
        const result = generateDescription('admin_approve_sensitive', { id: 'approve-req-id' });
        expect(result).toBe('Approve request approve-req-id');
      });

      test('admin_approve_sensitive should fallback to unknown', () => {
        const result = generateDescription('admin_approve_sensitive', {});
        expect(result).toBe('Approve request unknown');
      });

      test('admin_deny_sensitive should use requestId when id is missing', () => {
        const result = generateDescription('admin_deny_sensitive', { requestId: 'deny-req-id' });
        expect(result).toBe('Deny request deny-req-id');
      });

      test('admin_deny_sensitive should fallback to unknown', () => {
        const result = generateDescription('admin_deny_sensitive', {});
        expect(result).toBe('Deny request unknown');
      });

      test('admin_approve_request should use requestId when id is missing', () => {
        const result = generateDescription('admin_approve_request', {
          requestId: 'approve-perm-id',
        });
        expect(result).toBe('Approve request approve-perm-id');
      });

      test('admin_approve_request should fallback to unknown', () => {
        const result = generateDescription('admin_approve_request', {});
        expect(result).toBe('Approve request unknown');
      });

      test('admin_deny_request should use id when requestId is missing', () => {
        const result = generateDescription('admin_deny_request', { id: 'deny-perm-id' });
        expect(result).toBe('Deny request deny-perm-id');
      });

      test('admin_deny_request should fallback to unknown', () => {
        const result = generateDescription('admin_deny_request', {});
        expect(result).toBe('Deny request unknown');
      });

      test('admin_create_webhook should fallback to unnamed', () => {
        const result = generateDescription('admin_create_webhook', {});
        expect(result).toBe('Create webhook "unnamed"');
      });

      test('admin_update_webhook should use id when webhookId is missing', () => {
        const result = generateDescription('admin_update_webhook', { id: 'update-webhook-id' });
        expect(result).toBe('Update webhook update-webhook-id');
      });

      test('admin_update_webhook should fallback to unknown', () => {
        const result = generateDescription('admin_update_webhook', {});
        expect(result).toBe('Update webhook unknown');
      });

      test('admin_delete_webhook should use webhookId when id is missing', () => {
        const result = generateDescription('admin_delete_webhook', {
          webhookId: 'delete-webhook-id',
        });
        expect(result).toBe('Delete webhook delete-webhook-id');
      });

      test('admin_delete_webhook should fallback to unknown', () => {
        const result = generateDescription('admin_delete_webhook', {});
        expect(result).toBe('Delete webhook unknown');
      });

      test('admin_create_policy with default effect', () => {
        const result = generateDescription('admin_create_policy', { name: 'test-policy' });
        expect(result).toContain('ALLOW');
      });
    });
  });

  describe('createAdminMcpConfirmation', () => {
    test('should create confirmation with correct data', async () => {
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.create.mockResolvedValue(mockConfirmation);

      const result = await createAdminMcpConfirmation({
        organizationId: 'org-1',
        mcpSessionId: 'session-1',
        adminUserId: 'admin-1',
        toolName: 'admin_create_policy',
        toolInput: { name: 'test', effect: 'ALLOW' },
        scope: AdminMcpScope.POLICIES,
      });

      expect(result.confirmationId).toBe('confirmation-1');
      expect(result.description).toBeDefined();
      expect(result.riskLevel).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    test('should use settings TTL for expiration', async () => {
      mockGetAdminMcpSettings.mockResolvedValue({
        enabled: true,
        enabledScopes: [AdminMcpScope.POLICIES],
        allowedAdmins: [],
        rateLimitPerMin: 30,
        confirmationTtlSeconds: 600, // 10 minutes
      });
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.create.mockResolvedValue(mockConfirmation);

      await createAdminMcpConfirmation({
        organizationId: 'org-1',
        mcpSessionId: 'session-1',
        adminUserId: 'admin-1',
        toolName: 'admin_create_policy',
        toolInput: {},
        scope: AdminMcpScope.POLICIES,
      });

      expect(mockPrisma.adminMcpConfirmation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          mcpSessionId: 'session-1',
          adminUserId: 'admin-1',
          toolName: 'admin_create_policy',
          scope: AdminMcpScope.POLICIES,
        }),
      });
    });

    test('should determine correct risk level for HIGH risk tools', async () => {
      const mockConfirmation = createMockConfirmation({ riskLevel: 'HIGH' });
      mockPrisma.adminMcpConfirmation.create.mockResolvedValue(mockConfirmation);

      const result = await createAdminMcpConfirmation({
        organizationId: 'org-1',
        mcpSessionId: 'session-1',
        adminUserId: 'admin-1',
        toolName: 'admin_delete_user',
        toolInput: { id: 'user-1' },
        scope: AdminMcpScope.USERS,
      });

      expect(result.riskLevel).toBe('HIGH');
    });

    test('should log confirmation creation', async () => {
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.create.mockResolvedValue(mockConfirmation);

      await createAdminMcpConfirmation({
        organizationId: 'org-1',
        mcpSessionId: 'session-1',
        adminUserId: 'admin-1',
        toolName: 'admin_create_policy',
        toolInput: {},
        scope: AdminMcpScope.POLICIES,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created admin MCP confirmation',
        expect.objectContaining({
          confirmationId: 'confirmation-1',
          toolName: 'admin_create_policy',
          adminUserId: 'admin-1',
          organizationId: 'org-1',
        }),
      );
    });
  });

  describe('getConfirmations', () => {
    test('should return confirmations with default options', async () => {
      const mockConfirmations = [createMockConfirmation()];
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(1);
      mockPrisma.adminMcpConfirmation.findMany.mockResolvedValue(mockConfirmations);

      const result = await getConfirmations('org-1');

      expect(result.total).toBe(1);
      expect(result.confirmations).toHaveLength(1);
    });

    test('should filter by status', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(0);
      mockPrisma.adminMcpConfirmation.findMany.mockResolvedValue([]);

      await getConfirmations('org-1', { status: 'PENDING' as const });

      expect(mockPrisma.adminMcpConfirmation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            status: 'PENDING',
          }),
        }),
      );
    });

    test('should filter by mcpSessionId', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(0);
      mockPrisma.adminMcpConfirmation.findMany.mockResolvedValue([]);

      await getConfirmations('org-1', { mcpSessionId: 'session-123' });

      expect(mockPrisma.adminMcpConfirmation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mcpSessionId: 'session-123',
          }),
        }),
      );
    });

    test('should filter by adminUserId', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(0);
      mockPrisma.adminMcpConfirmation.findMany.mockResolvedValue([]);

      await getConfirmations('org-1', { adminUserId: 'admin-123' });

      expect(mockPrisma.adminMcpConfirmation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            adminUserId: 'admin-123',
          }),
        }),
      );
    });

    test('should apply pagination', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(100);
      mockPrisma.adminMcpConfirmation.findMany.mockResolvedValue([]);

      await getConfirmations('org-1', { limit: 10, offset: 20 });

      expect(mockPrisma.adminMcpConfirmation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });

    test('should expire old confirmations before returning', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(0);
      mockPrisma.adminMcpConfirmation.findMany.mockResolvedValue([]);

      await getConfirmations('org-1');

      expect(mockPrisma.adminMcpConfirmation.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'PENDING',
          expiresAt: { lt: expect.any(Date) },
        },
        data: {
          status: 'EXPIRED',
        },
      });
    });

    test('should include user relations', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(0);
      mockPrisma.adminMcpConfirmation.findMany.mockResolvedValue([]);

      await getConfirmations('org-1');

      expect(mockPrisma.adminMcpConfirmation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            adminUser: { select: { id: true, email: true } },
            confirmer: { select: { id: true, email: true } },
            rejecter: { select: { id: true, email: true } },
          },
        }),
      );
    });
  });

  describe('getConfirmationById', () => {
    test('should return confirmation when found', async () => {
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(mockConfirmation);

      const result = await getConfirmationById('org-1', 'confirmation-1');

      expect(result).toEqual(mockConfirmation);
      expect(mockPrisma.adminMcpConfirmation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'confirmation-1',
          organizationId: 'org-1',
        },
        include: {
          adminUser: { select: { id: true, email: true } },
          confirmer: { select: { id: true, email: true } },
          rejecter: { select: { id: true, email: true } },
        },
      });
    });

    test('should return null when not found', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(null);

      const result = await getConfirmationById('org-1', 'nonexistent');

      expect(result).toBeNull();
    });

    test('should enforce organization isolation', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(null);

      await getConfirmationById('org-1', 'confirmation-from-org-2');

      expect(mockPrisma.adminMcpConfirmation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });
  });

  describe('getPendingCount', () => {
    test('should return count of pending confirmations', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(5);

      const result = await getPendingCount('org-1');

      expect(result).toBe(5);
      expect(mockPrisma.adminMcpConfirmation.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'PENDING',
        },
      });
    });

    test('should expire old confirmations before counting', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.adminMcpConfirmation.count.mockResolvedValue(2);

      const result = await getPendingCount('org-1');

      expect(result).toBe(2);
      expect(mockPrisma.adminMcpConfirmation.updateMany).toHaveBeenCalled();
    });
  });

  describe('confirmAction', () => {
    test('should confirm pending confirmation', async () => {
      const mockConfirmation = createMockConfirmation();
      const confirmedConfirmation = createMockConfirmation({
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy: 'confirmer-1',
      });
      mockPrisma.adminMcpConfirmation.findFirst
        .mockResolvedValueOnce(mockConfirmation)
        .mockResolvedValueOnce(confirmedConfirmation);
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue(confirmedConfirmation);

      const result = await confirmAction('org-1', 'confirmation-1', 'confirmer-1');

      expect(result.success).toBe(true);
      expect(result.confirmation).toBeDefined();
      expect(mockPrisma.adminMcpConfirmation.update).toHaveBeenCalledWith({
        where: { id: 'confirmation-1', organizationId: 'org-1' },
        data: {
          status: 'CONFIRMED',
          confirmedAt: expect.any(Date),
          confirmedBy: 'confirmer-1',
        },
      });
    });

    test('should return success: false when confirmation not found', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(null);

      const result = await confirmAction('org-1', 'nonexistent', 'confirmer-1');

      expect(result.success).toBe(false);
      expect(result.confirmation).toBeUndefined();
    });

    test('should mark as expired and return success: false when confirmation has expired', async () => {
      const expiredConfirmation = createMockConfirmation({
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      });
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(expiredConfirmation);
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue({
        ...expiredConfirmation,
        status: 'EXPIRED',
      });

      const result = await confirmAction('org-1', 'confirmation-1', 'confirmer-1');

      expect(result.success).toBe(false);
      expect(mockPrisma.adminMcpConfirmation.update).toHaveBeenCalledWith({
        where: { id: 'confirmation-1', organizationId: 'org-1' },
        data: { status: 'EXPIRED' },
      });
    });

    test('should log confirmation approval', async () => {
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(mockConfirmation);
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue(mockConfirmation);

      await confirmAction('org-1', 'confirmation-1', 'confirmer-1');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Admin MCP confirmation approved',
        expect.objectContaining({
          confirmationId: 'confirmation-1',
          confirmedBy: 'confirmer-1',
        }),
      );
    });

    test('should only confirm PENDING confirmations', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(null);

      await confirmAction('org-1', 'confirmation-1', 'confirmer-1');

      expect(mockPrisma.adminMcpConfirmation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'confirmation-1',
          organizationId: 'org-1',
          status: 'PENDING',
        },
      });
    });
  });

  describe('markExecuted', () => {
    test('should mark confirmation as executed with result', async () => {
      const executedConfirmation = createMockConfirmation({
        status: 'EXECUTED',
        executedAt: new Date(),
        result: { policyId: 'policy-123' },
      });
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue(executedConfirmation);

      await markExecuted('org-1', 'confirmation-1', { policyId: 'policy-123' });

      expect(mockPrisma.adminMcpConfirmation.update).toHaveBeenCalledWith({
        where: { id: 'confirmation-1', organizationId: 'org-1' },
        data: {
          status: 'EXECUTED',
          executedAt: expect.any(Date),
          result: { policyId: 'policy-123' },
        },
      });
    });

    test('should log execution', async () => {
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue(createMockConfirmation());

      await markExecuted('org-1', 'confirmation-1', { success: true });

      expect(mockLogger.info).toHaveBeenCalledWith('Admin MCP confirmation executed', {
        confirmationId: 'confirmation-1',
        organizationId: 'org-1',
      });
    });
  });

  describe('markFailed', () => {
    test('should mark confirmation as failed with error', async () => {
      const failedConfirmation = createMockConfirmation({
        status: 'FAILED',
        error: 'Database connection failed',
      });
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue(failedConfirmation);

      await markFailed('org-1', 'confirmation-1', 'Database connection failed');

      expect(mockPrisma.adminMcpConfirmation.update).toHaveBeenCalledWith({
        where: { id: 'confirmation-1', organizationId: 'org-1' },
        data: {
          status: 'FAILED',
          error: 'Database connection failed',
        },
      });
    });

    test('should log failure with warning', async () => {
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue(createMockConfirmation());

      await markFailed('org-1', 'confirmation-1', 'Policy validation failed');

      expect(mockLogger.warn).toHaveBeenCalledWith('Admin MCP confirmation failed', {
        confirmationId: 'confirmation-1',
        organizationId: 'org-1',
        error: 'Policy validation failed',
      });
    });
  });

  describe('rejectAction', () => {
    test('should reject pending confirmation', async () => {
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(mockConfirmation);
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue({
        ...mockConfirmation,
        status: 'REJECTED',
      });

      const result = await rejectAction('org-1', 'confirmation-1', 'rejecter-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.adminMcpConfirmation.update).toHaveBeenCalledWith({
        where: { id: 'confirmation-1', organizationId: 'org-1' },
        data: {
          status: 'REJECTED',
          rejectedAt: expect.any(Date),
          rejectedBy: 'rejecter-1',
          rejectionReason: undefined,
        },
      });
    });

    test('should include rejection reason', async () => {
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(mockConfirmation);
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue({
        ...mockConfirmation,
        status: 'REJECTED',
      });

      await rejectAction('org-1', 'confirmation-1', 'rejecter-1', 'Policy conflicts detected');

      expect(mockPrisma.adminMcpConfirmation.update).toHaveBeenCalledWith({
        where: { id: 'confirmation-1', organizationId: 'org-1' },
        data: expect.objectContaining({
          rejectionReason: 'Policy conflicts detected',
        }),
      });
    });

    test('should return success: false when confirmation not found', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(null);

      const result = await rejectAction('org-1', 'nonexistent', 'rejecter-1');

      expect(result.success).toBe(false);
    });

    test('should log rejection', async () => {
      const mockConfirmation = createMockConfirmation();
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(mockConfirmation);
      mockPrisma.adminMcpConfirmation.update.mockResolvedValue(mockConfirmation);

      await rejectAction('org-1', 'confirmation-1', 'rejecter-1', 'Not authorized');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Admin MCP confirmation rejected',
        expect.objectContaining({
          confirmationId: 'confirmation-1',
          rejectedBy: 'rejecter-1',
          reason: 'Not authorized',
        }),
      );
    });
  });

  describe('expireOldConfirmations', () => {
    test('should expire pending confirmations past their expiry', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 5 });

      const result = await expireOldConfirmations('org-1');

      expect(result).toBe(5);
      expect(mockPrisma.adminMcpConfirmation.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'PENDING',
          expiresAt: { lt: expect.any(Date) },
        },
        data: {
          status: 'EXPIRED',
        },
      });
    });

    test('should log when confirmations are expired', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 3 });

      await expireOldConfirmations('org-1');

      expect(mockLogger.info).toHaveBeenCalledWith('Expired admin MCP confirmations', {
        organizationId: 'org-1',
        count: 3,
      });
    });

    test('should not log when no confirmations expired', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });

      await expireOldConfirmations('org-1');

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        'Expired admin MCP confirmations',
        expect.any(Object),
      );
    });

    test('should return 0 when no confirmations to expire', async () => {
      mockPrisma.adminMcpConfirmation.updateMany.mockResolvedValue({ count: 0 });

      const result = await expireOldConfirmations('org-1');

      expect(result).toBe(0);
    });
  });

  describe('getConfirmationStatus', () => {
    test('should return status for existing confirmation', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue({
        status: 'PENDING',
        result: null,
        error: null,
      });

      const result = await getConfirmationStatus('org-1', 'confirmation-1');

      expect(result).toEqual({
        status: 'PENDING',
        result: undefined,
        error: undefined,
      });
    });

    test('should return null when confirmation not found', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue(null);

      const result = await getConfirmationStatus('org-1', 'nonexistent');

      expect(result).toBeNull();
    });

    test('should include result when available', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue({
        status: 'EXECUTED',
        result: { policyId: 'policy-123' },
        error: null,
      });

      const result = await getConfirmationStatus('org-1', 'confirmation-1');

      expect(result).toEqual({
        status: 'EXECUTED',
        result: { policyId: 'policy-123' },
        error: undefined,
      });
    });

    test('should include error when available', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue({
        status: 'FAILED',
        result: null,
        error: 'Validation failed',
      });

      const result = await getConfirmationStatus('org-1', 'confirmation-1');

      expect(result).toEqual({
        status: 'FAILED',
        result: undefined,
        error: 'Validation failed',
      });
    });

    test('should query with organizationId for security', async () => {
      mockPrisma.adminMcpConfirmation.findFirst.mockResolvedValue({
        status: 'PENDING',
        result: null,
        error: null,
      });

      await getConfirmationStatus('org-1', 'confirmation-1');

      expect(mockPrisma.adminMcpConfirmation.findFirst).toHaveBeenCalledWith({
        where: { id: 'confirmation-1', organizationId: 'org-1' },
        select: {
          status: true,
          result: true,
          error: true,
        },
      });
    });
  });
});
