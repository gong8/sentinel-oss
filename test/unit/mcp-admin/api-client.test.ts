/**
 * Unit tests for Admin MCP API Client
 * Tests API communication layer used by the Admin MCP server
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock tRPC client
const mockTrpc = {
  auth: {
    validateToken: {
      mutate: vi.fn(),
    },
  },
  proxy: {
    validateAdminMcpAccess: {
      query: vi.fn(),
    },
    createAdminMcpConfirmation: {
      mutate: vi.fn(),
    },
    pollAdminMcpConfirmation: {
      query: vi.fn(),
    },
  },
  admin: {
    policies: {
      list: {
        query: vi.fn(),
      },
      get: {
        query: vi.fn(),
      },
    },
    users: {
      list: {
        query: vi.fn(),
      },
      get: {
        query: vi.fn(),
      },
    },
    roles: {
      list: {
        query: vi.fn(),
      },
      get: {
        query: vi.fn(),
      },
    },
    mcpServers: {
      list: {
        query: vi.fn(),
      },
      get: {
        query: vi.fn(),
      },
    },
    agents: {
      list: {
        query: vi.fn(),
      },
      get: {
        query: vi.fn(),
      },
    },
    sensitiveFlags: {
      list: {
        query: vi.fn(),
      },
    },
    webhooks: {
      list: {
        query: vi.fn(),
      },
    },
    permissionRequests: {
      list: {
        query: vi.fn(),
      },
    },
    analytics: {
      summary: {
        query: vi.fn(),
      },
    },
    auditLogEntries: {
      list: {
        query: vi.fn(),
      },
    },
    adminActionLogs: {
      list: {
        query: vi.fn(),
      },
    },
    conditions: {
      searchByLabel: {
        query: vi.fn(),
      },
      getParamSuggestions: {
        query: vi.fn(),
      },
    },
  },
};

// Create mock client factory
const mockCreateTrpcClient = vi.fn().mockReturnValue(mockTrpc);

vi.mock('../../../packages/mcp-admin/src/trpc-client.js', () => ({
  trpc: mockTrpc,
  createTrpcClient: mockCreateTrpcClient,
}));

vi.mock('../../../packages/mcp-admin/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Admin MCP API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateAdminToken', () => {
    test('should return admin context for valid admin token', async () => {
      const { validateAdminToken } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.auth.validateToken.mutate.mockResolvedValue({
        valid: true,
        userId: 'user-123',
        email: 'admin@example.com',
        organizationId: 'org-456',
        isAdmin: true,
        roles: ['admin'],
      });

      const result = await validateAdminToken('valid-admin-token');

      expect(result).toEqual({
        valid: true,
        userId: 'user-123',
        email: 'admin@example.com',
        organizationId: 'org-456',
        isAdmin: true,
        roles: ['admin'],
        adminWorkspaceIds: [],
      });
      expect(mockTrpc.auth.validateToken.mutate).toHaveBeenCalledWith({
        accessToken: 'valid-admin-token',
      });
    });

    test('should return null for valid token but non-admin user', async () => {
      const { validateAdminToken } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.auth.validateToken.mutate.mockResolvedValue({
        valid: true,
        userId: 'user-123',
        email: 'user@example.com',
        organizationId: 'org-456',
        isAdmin: false,
        roles: ['user'],
      });

      const result = await validateAdminToken('valid-user-token');

      expect(result).toBeNull();
    });

    test('should return null for invalid token', async () => {
      const { validateAdminToken } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.auth.validateToken.mutate.mockResolvedValue({
        valid: false,
      });

      const result = await validateAdminToken('invalid-token');

      expect(result).toBeNull();
    });

    test('should return null on error', async () => {
      const { validateAdminToken } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.auth.validateToken.mutate.mockRejectedValue(new Error('Network error'));

      const result = await validateAdminToken('any-token');

      expect(result).toBeNull();
    });

    test('should handle missing roles array', async () => {
      const { validateAdminToken } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.auth.validateToken.mutate.mockResolvedValue({
        valid: true,
        userId: 'user-123',
        email: 'admin@example.com',
        organizationId: 'org-456',
        isAdmin: true,
        // roles is undefined
      });

      const result = await validateAdminToken('valid-token');

      expect(result?.roles).toEqual([]);
    });
  });

  describe('validateAdminMcpAccess', () => {
    test('should return accessible result with scopes', async () => {
      const { validateAdminMcpAccess } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.validateAdminMcpAccess.query.mockResolvedValue({
        accessible: true,
        enabledScopes: ['POLICIES', 'USERS', 'ROLES'],
        rateLimitPerMin: 60,
        confirmationTtlSeconds: 300,
      });

      const result = await validateAdminMcpAccess('org-123', 'user-456');

      expect(result).toEqual({
        accessible: true,
        reason: null,
        enabledScopes: ['POLICIES', 'USERS', 'ROLES'],
        rateLimitPerMin: 60,
        confirmationTtlSeconds: 300,
      });
    });

    test('should return inaccessible result with reason', async () => {
      const { validateAdminMcpAccess } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.validateAdminMcpAccess.query.mockResolvedValue({
        accessible: false,
        reason: 'Admin MCP is disabled for this organization',
        enabledScopes: [],
      });

      const result = await validateAdminMcpAccess('org-123', 'user-456');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('Admin MCP is disabled for this organization');
      expect(result.enabledScopes).toEqual([]);
    });

    test('should return inaccessible result on error', async () => {
      const { validateAdminMcpAccess } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.validateAdminMcpAccess.query.mockRejectedValue(new Error('Database error'));

      const result = await validateAdminMcpAccess('org-123', 'user-456');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('Failed to validate access');
      expect(result.enabledScopes).toEqual([]);
    });

    test('should handle missing optional fields', async () => {
      const { validateAdminMcpAccess } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.validateAdminMcpAccess.query.mockResolvedValue({
        accessible: true,
        enabledScopes: ['POLICIES'],
      });

      const result = await validateAdminMcpAccess('org-123', 'user-456');

      expect(result.accessible).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.rateLimitPerMin).toBeUndefined();
      expect(result.confirmationTtlSeconds).toBeUndefined();
    });
  });

  describe('createConfirmation', () => {
    test('should create confirmation successfully', async () => {
      const { createConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.createAdminMcpConfirmation.mutate.mockResolvedValue({
        success: true,
        requiresConfirmation: true,
        confirmationId: 'confirm-123',
        description: 'Create new policy',
        riskLevel: 'MEDIUM',
        expiresAt: '2024-01-15T12:00:00Z',
      });

      const result = await createConfirmation(
        'org-123',
        'session-456',
        'user-789',
        'admin_create_policy',
        { effect: 'ALLOW', matchers: ['*'], toolPatterns: ['*::*'], description: 'Test' },
      );

      expect(result).toEqual({
        success: true,
        requiresConfirmation: true,
        confirmationId: 'confirm-123',
        description: 'Create new policy',
        riskLevel: 'MEDIUM',
        expiresAt: '2024-01-15T12:00:00Z',
        error: undefined,
      });
    });

    test('should handle operation that does not require confirmation', async () => {
      const { createConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.createAdminMcpConfirmation.mutate.mockResolvedValue({
        success: true,
        requiresConfirmation: false,
      });

      const result = await createConfirmation(
        'org-123',
        'session-456',
        'user-789',
        'admin_enable_policy',
        { id: 'policy-123' },
      );

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
    });

    test('should handle confirmation creation error', async () => {
      const { createConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.createAdminMcpConfirmation.mutate.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
      });

      const result = await createConfirmation(
        'org-123',
        'session-456',
        'user-789',
        'admin_create_policy',
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    test('should return error result on exception', async () => {
      const { createConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.createAdminMcpConfirmation.mutate.mockRejectedValue(
        new Error('Network failure'),
      );

      const result = await createConfirmation(
        'org-123',
        'session-456',
        'user-789',
        'admin_create_policy',
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network failure');
    });

    test('should handle non-Error exception', async () => {
      const { createConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.createAdminMcpConfirmation.mutate.mockRejectedValue('string error');

      const result = await createConfirmation(
        'org-123',
        'session-456',
        'user-789',
        'admin_create_policy',
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('pollConfirmationStatus', () => {
    test('should return EXECUTED status with result', async () => {
      const { pollConfirmationStatus } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'EXECUTED',
        result: { policyId: 'policy-123' },
        error: null,
      });

      const result = await pollConfirmationStatus('org-123', 'confirm-123');

      expect(result).toEqual({
        found: true,
        status: 'EXECUTED',
        result: { policyId: 'policy-123' },
        error: null,
      });
    });

    test('should return PENDING status', async () => {
      const { pollConfirmationStatus } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'PENDING',
        result: null,
        error: null,
      });

      const result = await pollConfirmationStatus('org-123', 'confirm-123');

      expect(result.found).toBe(true);
      expect(result.status).toBe('PENDING');
      expect(result.result).toBeNull();
    });

    test('should return REJECTED status', async () => {
      const { pollConfirmationStatus } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'REJECTED',
        result: null,
        error: null,
      });

      const result = await pollConfirmationStatus('org-123', 'confirm-123');

      expect(result.status).toBe('REJECTED');
    });

    test('should return EXPIRED status', async () => {
      const { pollConfirmationStatus } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'EXPIRED',
        result: null,
        error: null,
      });

      const result = await pollConfirmationStatus('org-123', 'confirm-123');

      expect(result.status).toBe('EXPIRED');
    });

    test('should return FAILED status with error', async () => {
      const { pollConfirmationStatus } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'FAILED',
        result: null,
        error: 'Database constraint violation',
      });

      const result = await pollConfirmationStatus('org-123', 'confirm-123');

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Database constraint violation');
    });

    test('should return not found result on error', async () => {
      const { pollConfirmationStatus } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockRejectedValue(new Error('API error'));

      const result = await pollConfirmationStatus('org-123', 'confirm-123');

      expect(result.found).toBe(false);
      expect(result.status).toBeNull();
      expect(result.error).toBe('API error');
    });

    test('should handle non-Error exception', async () => {
      const { pollConfirmationStatus } =
        await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockRejectedValue('string error');

      const result = await pollConfirmationStatus('org-123', 'confirm-123');

      expect(result.found).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('waitForConfirmation', () => {
    test('should return immediately when EXECUTED', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'EXECUTED',
        result: { success: true },
        error: null,
      });

      const result = await waitForConfirmation('org-123', 'confirm-123');

      expect(result.status).toBe('EXECUTED');
      expect(mockTrpc.proxy.pollAdminMcpConfirmation.query).toHaveBeenCalledTimes(1);
    });

    test('should return immediately when REJECTED', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'REJECTED',
        result: null,
        error: null,
      });

      const result = await waitForConfirmation('org-123', 'confirm-123');

      expect(result.status).toBe('REJECTED');
    });

    test('should return immediately when EXPIRED', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'EXPIRED',
        result: null,
        error: null,
      });

      const result = await waitForConfirmation('org-123', 'confirm-123');

      expect(result.status).toBe('EXPIRED');
    });

    test('should return immediately when FAILED', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'FAILED',
        result: null,
        error: 'Execution failed',
      });

      const result = await waitForConfirmation('org-123', 'confirm-123');

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Execution failed');
    });

    test('should return when not found', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: false,
        status: null,
        result: null,
        error: 'Not found',
      });

      const result = await waitForConfirmation('org-123', 'confirm-123');

      expect(result.found).toBe(false);
    });

    test('should poll until terminal state', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      let callCount = 0;
      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            found: true,
            status: 'PENDING',
            result: null,
            error: null,
          });
        }
        return Promise.resolve({
          found: true,
          status: 'EXECUTED',
          result: { success: true },
          error: null,
        });
      });

      const result = await waitForConfirmation('org-123', 'confirm-123', 10000, 10);

      expect(result.status).toBe('EXECUTED');
      expect(callCount).toBe(3);
    });

    test('should return timeout result when max wait exceeded', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          found: true,
          status: 'PENDING',
          result: null,
          error: null,
        };
      });

      const result = await waitForConfirmation('org-123', 'confirm-123', 50, 10);

      expect(result.status).toBe('PENDING');
      expect(result.error).toContain('Confirmation timeout');
    });

    test('should use default wait time and poll interval', async () => {
      const { waitForConfirmation } = await import('../../../packages/mcp-admin/src/api-client.js');

      mockTrpc.proxy.pollAdminMcpConfirmation.query.mockResolvedValue({
        found: true,
        status: 'EXECUTED',
        result: { success: true },
        error: null,
      });

      await waitForConfirmation('org-123', 'confirm-123');

      expect(mockTrpc.proxy.pollAdminMcpConfirmation.query).toHaveBeenCalledWith({
        organizationId: 'org-123',
        confirmationId: 'confirm-123',
      });
    });
  });

  describe('READ TOOL API CALLS', () => {
    describe('listPolicies', () => {
      test('should return list of policies', async () => {
        const { listPolicies } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockPolicies = [
          { id: 'p1', slug: 'test-policy', effect: 'ALLOW' },
          { id: 'p2', slug: 'deny-policy', effect: 'DENY' },
        ];
        mockTrpc.admin.policies.list.query.mockResolvedValue(mockPolicies);

        const result = await listPolicies('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.policies).toEqual(mockPolicies);
        expect(mockCreateTrpcClient).toHaveBeenCalledWith('access-token');
      });

      test('should return error on failure', async () => {
        const { listPolicies } = await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.policies.list.query.mockRejectedValue(new Error('Unauthorized'));

        const result = await listPolicies('invalid-token');

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Expected failure');
        expect(result.error).toBe('Unauthorized');
      });
    });

    describe('getPolicy', () => {
      test('should return single policy', async () => {
        const { getPolicy } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockPolicy = { id: 'p1', slug: 'test-policy', effect: 'ALLOW' };
        mockTrpc.admin.policies.get.query.mockResolvedValue(mockPolicy);

        const result = await getPolicy('access-token', 'p1');

        if (!result.success) throw new Error('Expected success');
        expect(result.policy).toEqual(mockPolicy);
      });

      test('should return error when policy not found', async () => {
        const { getPolicy } = await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.policies.get.query.mockRejectedValue(new Error('Policy not found'));

        const result = await getPolicy('access-token', 'invalid-id');

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Expected failure');
        expect(result.error).toBe('Policy not found');
      });
    });

    describe('listUsers', () => {
      test('should return list of users', async () => {
        const { listUsers } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockUsers = [
          { id: 'u1', email: 'user1@test.com' },
          { id: 'u2', email: 'user2@test.com' },
        ];
        mockTrpc.admin.users.list.query.mockResolvedValue(mockUsers);

        const result = await listUsers('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.users).toEqual(mockUsers);
        expect(result.total).toBe(2);
      });

      test('should return error on failure', async () => {
        const { listUsers } = await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.users.list.query.mockRejectedValue(new Error('Access denied'));

        const result = await listUsers('invalid-token');

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Expected failure');
        expect(result.error).toBe('Access denied');
      });
    });

    describe('getUser', () => {
      test('should return single user', async () => {
        const { getUser } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockUser = { id: 'u1', email: 'user@test.com', name: 'Test User' };
        mockTrpc.admin.users.get.query.mockResolvedValue(mockUser);

        const result = await getUser('access-token', 'u1');

        if (!result.success) throw new Error('Expected success');
        expect(result.user).toEqual(mockUser);
      });
    });

    describe('listRoles', () => {
      test('should return list of roles', async () => {
        const { listRoles } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockRoles = [
          { id: 'r1', name: 'Admin' },
          { id: 'r2', name: 'User' },
        ];
        mockTrpc.admin.roles.list.query.mockResolvedValue(mockRoles);

        const result = await listRoles('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.roles).toEqual(mockRoles);
      });
    });

    describe('getRole', () => {
      test('should return single role', async () => {
        const { getRole } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockRole = { id: 'r1', name: 'Admin', description: 'Administrator role' };
        mockTrpc.admin.roles.get.query.mockResolvedValue(mockRole);

        const result = await getRole('access-token', 'r1');

        if (!result.success) throw new Error('Expected success');
        expect(result.role).toEqual(mockRole);
      });
    });

    describe('listMcpServers', () => {
      test('should return list of MCP servers', async () => {
        const { listMcpServers } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockServers = [
          { id: 's1', name: 'GitHub', url: 'https://github.mcp' },
          { id: 's2', name: 'Slack', url: 'https://slack.mcp' },
        ];
        mockTrpc.admin.mcpServers.list.query.mockResolvedValue(mockServers);

        const result = await listMcpServers('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.servers).toEqual(mockServers);
      });

      test('should return error on failure', async () => {
        const { listMcpServers } = await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.mcpServers.list.query.mockRejectedValue(new Error('Server error'));

        const result = await listMcpServers('access-token');

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Expected failure');
        expect(result.error).toBe('Server error');
      });
    });

    describe('getMcpServer', () => {
      test('should return single MCP server', async () => {
        const { getMcpServer } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockServer = { id: 's1', name: 'GitHub', url: 'https://github.mcp' };
        mockTrpc.admin.mcpServers.get.query.mockResolvedValue(mockServer);

        const result = await getMcpServer('access-token', 's1');

        if (!result.success) throw new Error('Expected success');
        expect(result.server).toEqual(mockServer);
      });
    });

    describe('listAgents', () => {
      test('should return list of agents', async () => {
        const { listAgents } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockAgents = [
          { id: 'a1', name: 'Agent 1' },
          { id: 'a2', name: 'Agent 2' },
        ];
        mockTrpc.admin.agents.list.query.mockResolvedValue(mockAgents);

        const result = await listAgents('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.agents).toEqual(mockAgents);
        expect(result.total).toBe(2);
      });
    });

    describe('getAgent', () => {
      test('should return single agent', async () => {
        const { getAgent } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockAgent = { id: 'a1', name: 'Agent 1', description: 'Test agent' };
        mockTrpc.admin.agents.get.query.mockResolvedValue(mockAgent);

        const result = await getAgent('access-token', 'a1');

        if (!result.success) throw new Error('Expected success');
        expect(result.agent).toEqual(mockAgent);
      });
    });

    describe('listSensitiveFlags', () => {
      test('should return list of sensitive flags', async () => {
        const { listSensitiveFlags } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        const mockFlags = [
          { id: 'f1', toolPattern: '*::delete*' },
          { id: 'f2', toolPattern: 'github::*' },
        ];
        mockTrpc.admin.sensitiveFlags.list.query.mockResolvedValue(mockFlags);

        const result = await listSensitiveFlags('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.flags).toEqual(mockFlags);
        expect(result.total).toBe(2);
      });
    });

    describe('listWebhooks', () => {
      test('should return list of webhooks', async () => {
        const { listWebhooks } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockWebhooks = [{ id: 'w1', name: 'Webhook 1', url: 'https://webhook.test' }];
        mockTrpc.admin.webhooks.list.query.mockResolvedValue(mockWebhooks);

        const result = await listWebhooks('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.webhooks).toEqual(mockWebhooks);
        expect(result.total).toBe(1);
      });
    });

    describe('listPermissionRequests', () => {
      test('should return list of permission requests', async () => {
        const { listPermissionRequests } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        const mockRequests = [
          { id: 'r1', status: 'PENDING' },
          { id: 'r2', status: 'APPROVED' },
        ];
        mockTrpc.admin.permissionRequests.list.query.mockResolvedValue(mockRequests);

        const result = await listPermissionRequests('access-token');

        if (!result.success) throw new Error('Expected success');
        expect(result.requests).toEqual(mockRequests);
        expect(result.total).toBe(2);
      });

      test('should filter by status', async () => {
        const { listPermissionRequests } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.permissionRequests.list.query.mockResolvedValue([]);

        await listPermissionRequests('access-token', 'PENDING');

        expect(mockTrpc.admin.permissionRequests.list.query).toHaveBeenCalledWith({
          status: 'PENDING',
        });
      });
    });

    describe('getAnalyticsSummary', () => {
      test('should return analytics summary', async () => {
        const { getAnalyticsSummary } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        const mockSummary = {
          totalToolCalls: 1000,
          allowedCalls: 800,
          deniedCalls: 200,
        };
        mockTrpc.admin.analytics.summary.query.mockResolvedValue(mockSummary);

        const result = await getAnalyticsSummary('access-token', 7);

        if (!result.success) throw new Error('Expected success');
        expect(result.summary).toEqual(mockSummary);
      });

      test('should use default days', async () => {
        const { getAnalyticsSummary } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.analytics.summary.query.mockResolvedValue({});

        await getAnalyticsSummary('access-token');

        // Should calculate date range for 7 days
        expect(mockTrpc.admin.analytics.summary.query).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
          }),
        );
      });
    });

    describe('listAuditLogs', () => {
      test('should return audit log entries', async () => {
        const { listAuditLogs } = await import('../../../packages/mcp-admin/src/api-client.js');

        const mockEntries = {
          entries: [{ id: 'e1', toolName: 'github::createPR' }],
          total: 1,
        };
        mockTrpc.admin.auditLogEntries.list.query.mockResolvedValue(mockEntries);

        const result = await listAuditLogs('access-token', 50);

        if (!result.success) throw new Error('Expected success');
        expect(result.entries).toEqual(mockEntries.entries);
        expect(result.total).toBe(1);
      });
    });

    describe('listAdminActionLogs', () => {
      test('should return admin action logs', async () => {
        const { listAdminActionLogs } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        const mockLogs = {
          entries: [{ id: 'l1', action: 'CREATE_POLICY' }],
          total: 1,
        };
        mockTrpc.admin.adminActionLogs.list.query.mockResolvedValue(mockLogs);

        const result = await listAdminActionLogs('access-token', 50);

        if (!result.success) throw new Error('Expected success');
        expect(result.logs).toEqual(mockLogs.entries);
        expect(result.total).toBe(1);
      });
    });
  });

  describe('PARAMETER LOOKUP API CALLS', () => {
    describe('searchParamValuesByLabel', () => {
      test('should return matching parameter values', async () => {
        const { searchParamValuesByLabel } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        const mockResults = {
          results: [{ value: 'page-123', label: 'Applications Tracker 2026', paramKey: 'page_id' }],
        };
        mockTrpc.admin.conditions.searchByLabel.query.mockResolvedValue(mockResults);

        const result = await searchParamValuesByLabel('access-token', 'Applications Tracker', {
          serverDomain: 'notion',
          limit: 10,
        });

        if (!result.success) throw new Error('Expected success');
        expect(result.results).toEqual(mockResults.results);
      });

      test('should use default limit', async () => {
        const { searchParamValuesByLabel } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.conditions.searchByLabel.query.mockResolvedValue({ results: [] });

        await searchParamValuesByLabel('access-token', 'query');

        expect(mockTrpc.admin.conditions.searchByLabel.query).toHaveBeenCalledWith({
          labelQuery: 'query',
          serverId: undefined,
          serverDomain: undefined,
          limit: 10,
        });
      });

      test('should return error on failure', async () => {
        const { searchParamValuesByLabel } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.conditions.searchByLabel.query.mockRejectedValue(new Error('Search failed'));

        const result = await searchParamValuesByLabel('access-token', 'query');

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Expected failure');
        expect(result.error).toBe('Search failed');
      });
    });

    describe('getParamSuggestions', () => {
      test('should return parameter suggestions', async () => {
        const { getParamSuggestions } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        const mockSuggestions = {
          suggestions: [
            { value: 'page-1', label: 'Page 1', count: 5 },
            { value: 'page-2', label: 'Page 2', count: 3 },
          ],
        };
        mockTrpc.admin.conditions.getParamSuggestions.query.mockResolvedValue(mockSuggestions);

        const result = await getParamSuggestions('access-token', 'notion::getPage', 'page_id', {
          prefix: 'page-',
          limit: 5,
        });

        if (!result.success) throw new Error('Expected success');
        expect(result.suggestions).toEqual(mockSuggestions.suggestions);
      });

      test('should use default limit', async () => {
        const { getParamSuggestions } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.conditions.getParamSuggestions.query.mockResolvedValue({ suggestions: [] });

        await getParamSuggestions('access-token', 'tool::name', 'param');

        expect(mockTrpc.admin.conditions.getParamSuggestions.query).toHaveBeenCalledWith({
          toolName: 'tool::name',
          paramName: 'param',
          prefix: undefined,
          limit: 10,
        });
      });

      test('should return error on failure', async () => {
        const { getParamSuggestions } =
          await import('../../../packages/mcp-admin/src/api-client.js');

        mockTrpc.admin.conditions.getParamSuggestions.query.mockRejectedValue(
          new Error('Suggestions failed'),
        );

        const result = await getParamSuggestions('access-token', 'tool', 'param');

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Expected failure');
        expect(result.error).toBe('Suggestions failed');
      });
    });
  });
});
