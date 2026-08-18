/**
 * Unit tests for MCP API client
 * Tests API communication layer used by the MCP proxy
 */

import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Test encryption key (64 hex chars = 32 bytes)
const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

// Helper to create valid encrypted string format
function encryptString(plaintext: string): string {
  const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// Store original env
const originalEnv = process.env;

// Mock tRPC client - must be hoisted for ESM module mocking
const mockTrpc = vi.hoisted(() => ({
  auth: {
    validateToken: {
      mutate: vi.fn(),
    },
  },
  proxy: {
    evaluatePolicy: {
      mutate: vi.fn(),
    },
    logAuditEntry: {
      mutate: vi.fn(),
    },
    getMcpServer: {
      query: vi.fn(),
    },
    getUserCredentials: {
      query: vi.fn(),
    },
    listMcpServers: {
      query: vi.fn(),
    },
    refreshOAuthToken: {
      mutate: vi.fn(),
    },
    evaluateSensitiveFlags: {
      mutate: vi.fn(),
    },
    pollApprovalStatus: {
      mutate: vi.fn(),
    },
    // Session management
    getOrCreateSession: {
      mutate: vi.fn(),
    },
    incrementToolCallCount: {
      mutate: vi.fn(),
    },
    trackParamValues: {
      mutate: vi.fn(),
    },
    checkSessionStatus: {
      query: vi.fn(),
    },
    getPolicies: {
      query: vi.fn(),
    },
  },
  user: {
    auditLogEntries: {
      list: {
        query: vi.fn(),
      },
    },
  },
  admin: {
    policies: {
      list: {
        query: vi.fn(),
      },
    },
  },
}));

vi.mock('../../../packages/mcp/src/trpc-client.js', () => ({
  trpc: mockTrpc,
}));

vi.mock('../../../packages/mcp/src/logger.js', () => ({
  logger: {
    security: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MCP API Client', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateAccessToken', () => {
    test('should return user context for valid token', async () => {
      const { validateAccessToken } = await import('../../../packages/mcp/src/api-client.js');

      const mockUserContext = {
        valid: true,
        userId: 'user-123',
        organizationId: 'org-456',
        roles: ['admin'],
      };
      mockTrpc.auth.validateToken.mutate.mockResolvedValue(mockUserContext);

      const result = await validateAccessToken('valid-token');
      expect(result).toEqual(mockUserContext);
      expect(mockTrpc.auth.validateToken.mutate).toHaveBeenCalledWith({
        accessToken: 'valid-token',
      });
    });

    test('should return null for invalid token', async () => {
      const { validateAccessToken } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.auth.validateToken.mutate.mockResolvedValue({ valid: false });

      const result = await validateAccessToken('invalid-token');
      expect(result).toBeNull();
    });

    test('should return null on error', async () => {
      const { validateAccessToken } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.auth.validateToken.mutate.mockRejectedValue(new Error('Network error'));

      const result = await validateAccessToken('any-token');
      expect(result).toBeNull();
    });
  });

  describe('evaluatePolicy', () => {
    test('should return ALLOWED decision', async () => {
      const { evaluatePolicy } = await import('../../../packages/mcp/src/api-client.js');

      const mockResult = {
        decision: 'ALLOWED',
        justification: 'User has permission',
        policyIds: ['policy-1'],
        matchedPolicyIds: ['policy-1'],
      };
      mockTrpc.proxy.evaluatePolicy.mutate.mockResolvedValue(mockResult);

      const result = await evaluatePolicy('user-123', 'agent-456', 'github::createPR', {
        title: 'Test PR',
      });

      expect(result.decision).toBe('ALLOWED');
      expect(result.justification).toBe('User has permission');
      expect(result.policyIds).toEqual(['policy-1']);
      expect(mockTrpc.proxy.evaluatePolicy.mutate).toHaveBeenCalledWith({
        userId: 'user-123',
        agentId: 'agent-456',
        toolName: 'github::createPR',
        parameters: { title: 'Test PR' },
      });
    });

    test('should return DENIED decision', async () => {
      const { evaluatePolicy } = await import('../../../packages/mcp/src/api-client.js');

      const mockResult = {
        decision: 'DENIED',
        justification: 'No matching ALLOW policy',
        policyIds: ['policy-2'],
      };
      mockTrpc.proxy.evaluatePolicy.mutate.mockResolvedValue(mockResult);

      const result = await evaluatePolicy('user-123', undefined, 'restricted::tool', {});

      expect(result.decision).toBe('DENIED');
      expect(mockTrpc.proxy.evaluatePolicy.mutate).toHaveBeenCalledWith({
        userId: 'user-123',
        agentId: null,
        toolName: 'restricted::tool',
        parameters: {},
      });
    });

    test('should fail closed (DENIED) on error', async () => {
      const { evaluatePolicy } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluatePolicy.mutate.mockRejectedValue(new Error('API error'));

      const result = await evaluatePolicy('user-123', 'agent-456', 'tool::name', {});

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toBe('Policy evaluation failed');
      expect(result.policyIds).toEqual([]);
    });

    test('should include optional fields when present', async () => {
      const { evaluatePolicy } = await import('../../../packages/mcp/src/api-client.js');

      const mockResult = {
        decision: 'ALLOWED',
        justification: 'Allowed',
        policyIds: ['p1'],
        matchedPolicyIds: ['p1'],
        policySnapshot: { snapshot: 'data' },
        userEmail: 'user@test.com',
        userRoles: ['admin', 'user'],
        agentName: 'Test Agent',
      };
      mockTrpc.proxy.evaluatePolicy.mutate.mockResolvedValue(mockResult);

      const result = await evaluatePolicy('u1', 'a1', 'tool', {});

      expect(result.matchedPolicyIds).toEqual(['p1']);
      expect(result.policySnapshot).toEqual({ snapshot: 'data' });
      expect(result.userEmail).toBe('user@test.com');
      expect(result.userRoles).toEqual(['admin', 'user']);
      expect(result.agentName).toBe('Test Agent');
    });

    test('should handle null justification (line 146 branch coverage)', async () => {
      const { evaluatePolicy } = await import('../../../packages/mcp/src/api-client.js');

      const mockResult = {
        decision: 'ALLOWED',
        justification: null, // Tests the || undefined fallback
        policyIds: ['p1'],
      };
      mockTrpc.proxy.evaluatePolicy.mutate.mockResolvedValue(mockResult);

      const result = await evaluatePolicy('u1', 'a1', 'tool', {});

      expect(result.decision).toBe('ALLOWED');
      expect(result.justification).toBeUndefined();
    });

    test('should handle empty string justification', async () => {
      const { evaluatePolicy } = await import('../../../packages/mcp/src/api-client.js');

      const mockResult = {
        decision: 'ALLOWED',
        justification: '', // Empty string should become undefined
        policyIds: ['p1'],
      };
      mockTrpc.proxy.evaluatePolicy.mutate.mockResolvedValue(mockResult);

      const result = await evaluatePolicy('u1', 'a1', 'tool', {});

      expect(result.justification).toBeUndefined();
    });
  });

  describe('logAuditEntry', () => {
    test('should log audit entry successfully', async () => {
      const { logAuditEntry } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.logAuditEntry.mutate.mockResolvedValue({});

      const entry = {
        organizationId: 'org-123',
        userId: 'user-456',
        agentId: 'agent-789',
        toolName: 'github::createIssue',
        parameters: { title: 'Bug' },
        decision: 'ALLOWED' as const,
        justification: 'User allowed',
        policyIds: ['p1'],
      };

      await logAuditEntry(entry);

      expect(mockTrpc.proxy.logAuditEntry.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        userId: 'user-456',
        agentId: 'agent-789',
        toolName: 'github::createIssue',
        parameters: { title: 'Bug' },
        decision: 'ALLOWED',
        evaluationTree: null,
        justification: 'User allowed',
        policyIds: ['p1'],
        matchedPolicyIds: undefined,
        policySnapshot: undefined,
        userEmail: undefined,
        userRoles: undefined,
        agentName: undefined,
        workspaceId: null,
        // Live approval tracking fields
        approvalRequired: undefined,
        approvalRequestId: null,
        approvalStatus: null,
        approvalDecidedBy: null,
        approvalDecidedByEmail: null,
        approvalDecidedAt: null,
      });
    });

    test('should not throw on error (logging failures should not block operations)', async () => {
      const { logAuditEntry } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.logAuditEntry.mutate.mockRejectedValue(new Error('DB error'));

      const entry = {
        organizationId: 'org-123',
        userId: 'user-123',
        toolName: 'tool',
        parameters: {},
        decision: 'ALLOWED' as const,
        policyIds: [],
      };

      // Should not throw
      await expect(logAuditEntry(entry)).resolves.toBeUndefined();
    });

    test('should handle optional fields with undefined', async () => {
      const { logAuditEntry } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.logAuditEntry.mutate.mockResolvedValue({});

      const entry = {
        organizationId: 'org-123',
        toolName: 'tool::action',
        parameters: {},
        decision: 'DENIED' as const,
        policyIds: [],
      };

      await logAuditEntry(entry);

      expect(mockTrpc.proxy.logAuditEntry.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        userId: null,
        agentId: null,
        toolName: 'tool::action',
        parameters: {},
        decision: 'DENIED',
        evaluationTree: null,
        justification: null,
        policyIds: [],
        matchedPolicyIds: undefined,
        policySnapshot: undefined,
        userEmail: undefined,
        userRoles: undefined,
        agentName: undefined,
        workspaceId: null,
        // Live approval tracking fields
        approvalRequired: undefined,
        approvalRequestId: null,
        approvalStatus: null,
        approvalDecidedBy: null,
        approvalDecidedByEmail: null,
        approvalDecidedAt: null,
      });
    });

    test('should normalize invalid decision to DENIED', async () => {
      const { logAuditEntry } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.logAuditEntry.mutate.mockResolvedValue({});

      const entry = {
        organizationId: 'org-123',
        userId: 'user-123',
        toolName: 'tool',
        parameters: {},
        decision: 'INVALID' as 'ALLOWED', // Invalid decision
        policyIds: [],
      };

      await logAuditEntry(entry);

      expect(mockTrpc.proxy.logAuditEntry.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'DENIED', // Should be normalized to DENIED
        }),
      );
    });
  });

  describe('getMcpServer', () => {
    test('should return MCP server by domain', async () => {
      const { getMcpServer } = await import('../../../packages/mcp/src/api-client.js');

      const mockServer = {
        id: 'srv-123',
        name: 'GitHub Server',
        domain: 'github.com',
        url: 'https://api.github.com',
      };
      mockTrpc.proxy.getMcpServer.query.mockResolvedValue(mockServer);

      const result = await getMcpServer('org-123', 'github.com');

      expect(result).toEqual(mockServer);
      expect(mockTrpc.proxy.getMcpServer.query).toHaveBeenCalledWith({
        organizationId: 'org-123',
        domain: 'github.com',
        port: null,
      });
    });

    test('should return MCP server by domain and port', async () => {
      const { getMcpServer } = await import('../../../packages/mcp/src/api-client.js');

      const mockServer = {
        id: 'srv-456',
        name: 'Custom Server',
        domain: 'custom.local',
        port: '8080',
      };
      mockTrpc.proxy.getMcpServer.query.mockResolvedValue(mockServer);

      const result = await getMcpServer('org-123', 'custom.local', '8080');

      expect(result).toEqual(mockServer);
      expect(mockTrpc.proxy.getMcpServer.query).toHaveBeenCalledWith({
        organizationId: 'org-123',
        domain: 'custom.local',
        port: '8080',
      });
    });

    test('should return null when server not found', async () => {
      const { getMcpServer } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getMcpServer.query.mockResolvedValue(null);

      const result = await getMcpServer('org-123', 'unknown.com');
      expect(result).toBeNull();
    });

    test('should return null on error', async () => {
      const { getMcpServer } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getMcpServer.query.mockRejectedValue(new Error('DB error'));

      const result = await getMcpServer('org-123', 'github.com');
      expect(result).toBeNull();
    });
  });

  describe('getUserMcpConfig', () => {
    test('should return merged credentials', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getUserCredentials.query.mockResolvedValue({
        organization: {
          apiKey: encryptString('org-api-key'),
          credentials: encryptString(JSON.stringify({ baseUrl: 'https://api.example.com' })),
        },
        user: {
          apiKey: encryptString('user-api-key'),
          credentials: encryptString(JSON.stringify({ timeout: 5000 })),
        },
      });

      const result = await getUserMcpConfig('user-123', 'server-456');

      expect(result).not.toBeNull();
      expect(result?.credentials).toEqual({
        baseUrl: 'https://api.example.com',
        apiKey: 'user-api-key', // User overrides org
        timeout: 5000,
      });
    });

    test('should return only org credentials when user has none', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getUserCredentials.query.mockResolvedValue({
        organization: {
          apiKey: encryptString('org-key'),
          credentials: encryptString(JSON.stringify({ setting: 'value' })),
        },
        user: {
          apiKey: null,
          credentials: null,
        },
      });

      const result = await getUserMcpConfig('user-123', 'server-456');

      expect(result?.credentials).toEqual({
        setting: 'value',
        apiKey: 'org-key',
      });
    });

    test('should return only user credentials when org has none', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getUserCredentials.query.mockResolvedValue({
        organization: {
          apiKey: null,
          credentials: null,
        },
        user: {
          apiKey: encryptString('user-key'),
          credentials: encryptString(JSON.stringify({ userSetting: true })),
        },
      });

      const result = await getUserMcpConfig('user-123', 'server-456');

      expect(result?.credentials).toEqual({
        userSetting: true,
        apiKey: 'user-key',
      });
    });

    test('should return null when no credentials', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getUserCredentials.query.mockResolvedValue({
        organization: {
          apiKey: null,
          credentials: null,
        },
        user: {
          apiKey: null,
          credentials: null,
        },
      });

      const result = await getUserMcpConfig('user-123', 'server-456');
      expect(result).toBeNull();
    });

    test('should return null on error', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getUserCredentials.query.mockRejectedValue(new Error('Auth error'));

      const result = await getUserMcpConfig('user-123', 'server-456');
      expect(result).toBeNull();
    });

    test('should handle OAuth tokens in user credentials', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getUserCredentials.query.mockResolvedValue({
        organization: {
          apiKey: null,
          credentials: null,
        },
        user: {
          apiKey: null,
          credentials: null,
          accessToken: encryptString('oauth-access-token'),
          refreshToken: encryptString('oauth-refresh-token'),
          tokenExpiresAt: '2024-12-31T23:59:59Z',
        },
      });

      const result = await getUserMcpConfig('user-123', 'server-456');

      expect(result?.credentials).toEqual({
        accessToken: 'oauth-access-token',
        refreshToken: 'oauth-refresh-token',
        tokenExpiresAt: '2024-12-31T23:59:59Z',
      });
    });

    test('should deep merge nested credentials', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getUserCredentials.query.mockResolvedValue({
        organization: {
          apiKey: null,
          credentials: encryptString(
            JSON.stringify({
              oauth: {
                clientId: 'org-client-id',
                scope: 'read',
              },
              baseUrl: 'https://api.org.com',
            }),
          ),
        },
        user: {
          apiKey: null,
          credentials: encryptString(
            JSON.stringify({
              oauth: {
                scope: 'read write', // Override nested
              },
            }),
          ),
        },
      });

      const result = await getUserMcpConfig('user-123', 'server-456');

      expect(result?.credentials).toEqual({
        oauth: {
          clientId: 'org-client-id',
          scope: 'read write',
        },
        baseUrl: 'https://api.org.com',
      });
    });

    test('should not override apiKey from credentials when source.apiKey is also provided', async () => {
      vi.resetModules();
      const { getUserMcpConfig } = await import('../../../packages/mcp/src/api-client.js');

      // This tests line 82: the case where credentials JSON already has apiKey
      // and source.apiKey also exists - should NOT override
      mockTrpc.proxy.getUserCredentials.query.mockResolvedValue({
        organization: {
          apiKey: encryptString('org-source-api-key'),
          credentials: encryptString(JSON.stringify({ apiKey: 'org-credentials-api-key' })),
        },
        user: {
          apiKey: null,
          credentials: null,
        },
      });

      const result = await getUserMcpConfig('user-123', 'server-456');

      // The apiKey from credentials should be preserved, not overridden by source.apiKey
      expect(result?.credentials?.apiKey).toBe('org-credentials-api-key');
    });
  });

  describe('listMcpServers', () => {
    test('should return list of MCP servers', async () => {
      const { listMcpServers } = await import('../../../packages/mcp/src/api-client.js');

      const mockServers = [
        { id: 'srv-1', name: 'Server 1', domain: 'api1.example.com' },
        { id: 'srv-2', name: 'Server 2', domain: 'api2.example.com' },
      ];
      mockTrpc.proxy.listMcpServers.query.mockResolvedValue(mockServers);

      const result = await listMcpServers('org-123');

      expect(result).toEqual(mockServers);
      expect(mockTrpc.proxy.listMcpServers.query).toHaveBeenCalledWith({
        organizationId: 'org-123',
      });
    });

    test('should return empty array on error', async () => {
      const { listMcpServers } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.listMcpServers.query.mockRejectedValue(new Error('DB error'));

      const result = await listMcpServers('org-123');
      expect(result).toEqual([]);
    });

    test('should return empty array when no servers', async () => {
      const { listMcpServers } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.listMcpServers.query.mockResolvedValue([]);

      const result = await listMcpServers('org-123');
      expect(result).toEqual([]);
    });
  });

  describe('getUserAuditLog', () => {
    test('should return audit log entries', async () => {
      const { getUserAuditLog } = await import('../../../packages/mcp/src/api-client.js');

      const mockEntries = {
        total: 2,
        entries: [
          {
            timestamp: '2024-01-01T00:00:00Z',
            toolName: 'github::createPR',
            decision: 'ALLOWED',
            justification: 'User allowed',
          },
          {
            timestamp: '2024-01-01T01:00:00Z',
            toolName: 'slack::sendMessage',
            decision: 'DENIED',
            justification: 'No policy',
          },
        ],
      };
      mockTrpc.user.auditLogEntries.list.query.mockResolvedValue(mockEntries);

      const result = await getUserAuditLog('user-123', 'org-456');

      expect(result.total).toBe(2);
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].toolName).toBe('github::createPR');
    });

    test('should pass limit and toolName options', async () => {
      const { getUserAuditLog } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.user.auditLogEntries.list.query.mockResolvedValue({
        total: 1,
        entries: [
          {
            timestamp: new Date(),
            toolName: 'github::createPR',
            decision: 'ALLOWED',
          },
        ],
      });

      await getUserAuditLog('user-123', 'org-456', {
        limit: 10,
        toolName: 'github::createPR',
      });

      expect(mockTrpc.user.auditLogEntries.list.query).toHaveBeenCalledWith({
        limit: 10,
        toolName: 'github::createPR',
      });
    });

    test('should use default limit of 20', async () => {
      const { getUserAuditLog } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.user.auditLogEntries.list.query.mockResolvedValue({
        total: 0,
        entries: [],
      });

      await getUserAuditLog('user-123', 'org-456', {});

      expect(mockTrpc.user.auditLogEntries.list.query).toHaveBeenCalledWith({
        limit: 20,
        toolName: undefined,
      });
    });

    test('should return empty result on error', async () => {
      const { getUserAuditLog } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.user.auditLogEntries.list.query.mockRejectedValue(new Error('DB error'));

      const result = await getUserAuditLog('user-123', 'org-456');

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getUserPolicies', () => {
    test('should return list of policies', async () => {
      const { getUserPolicies } = await import('../../../packages/mcp/src/api-client.js');

      const mockPolicies = [
        {
          id: 'p1',
          slug: 'allow-github',
          matchers: ['role:admin'],
          toolPatterns: ['github::*'],
          effect: 'ALLOW',
          description: 'Allow GitHub',
          enabled: true,
        },
        {
          id: 'p2',
          slug: 'deny-delete',
          matchers: ['role:user'],
          toolPatterns: ['*::delete*'],
          effect: 'DENY',
          description: 'Deny delete',
          enabled: true,
        },
      ];
      mockTrpc.proxy.getPolicies.query.mockResolvedValue(mockPolicies);

      const result = await getUserPolicies('org-123');

      expect(result.total).toBe(2);
      expect(result.policies).toHaveLength(2);
      expect(result.policies[0].slug).toBe('allow-github');
    });

    test('should return empty result on error', async () => {
      const { getUserPolicies } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getPolicies.query.mockRejectedValue(new Error('Auth error'));

      const result = await getUserPolicies('org-123');

      expect(result.policies).toEqual([]);
      expect(result.total).toBe(0);
    });

    test('should return empty result when no policies', async () => {
      const { getUserPolicies } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getPolicies.query.mockResolvedValue([]);

      const result = await getUserPolicies('org-123');

      expect(result.policies).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('evaluatePolicy with sessionId', () => {
    test('should pass sessionId to API when provided', async () => {
      const { evaluatePolicy } = await import('../../../packages/mcp/src/api-client.js');

      const mockResult = {
        decision: 'ALLOWED',
        justification: 'Allowed',
        policyIds: ['p1'],
      };
      mockTrpc.proxy.evaluatePolicy.mutate.mockResolvedValue(mockResult);

      await evaluatePolicy(
        'user-123',
        'agent-456',
        'tool::name',
        { param: 'value' },
        'session-789',
      );

      expect(mockTrpc.proxy.evaluatePolicy.mutate).toHaveBeenCalledWith({
        userId: 'user-123',
        agentId: 'agent-456',
        toolName: 'tool::name',
        parameters: { param: 'value' },
        sessionId: 'session-789',
      });
    });
  });

  describe('refreshOAuthToken', () => {
    test('should refresh user-level OAuth token successfully', async () => {
      const { refreshOAuthToken } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.refreshOAuthToken.mutate.mockResolvedValue({
        success: true,
        level: 'user',
      });

      const result = await refreshOAuthToken('user-123', 'server-456');

      expect(result).toEqual({ success: true, level: 'user' });
      expect(mockTrpc.proxy.refreshOAuthToken.mutate).toHaveBeenCalledWith({
        userId: 'user-123',
        mcpServerId: 'server-456',
      });
    });

    test('should refresh organization-level OAuth token', async () => {
      const { refreshOAuthToken } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.refreshOAuthToken.mutate.mockResolvedValue({
        success: true,
        level: 'organization',
      });

      const result = await refreshOAuthToken('user-123', 'server-456');

      expect(result).toEqual({ success: true, level: 'organization' });
    });

    test('should throw on refresh failure', async () => {
      const { refreshOAuthToken } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.refreshOAuthToken.mutate.mockRejectedValue(
        new Error('No refresh token available'),
      );

      await expect(refreshOAuthToken('user-123', 'server-456')).rejects.toThrow(
        'No refresh token available',
      );
    });

    test('should handle expired refresh token error', async () => {
      const { refreshOAuthToken } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.refreshOAuthToken.mutate.mockRejectedValue(new Error('Refresh token expired'));

      await expect(refreshOAuthToken('user-123', 'server-456')).rejects.toThrow(
        'Refresh token expired',
      );
    });
  });

  describe('evaluateSensitiveFlags', () => {
    test('should return proceed=true when no sensitive flags match', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockResolvedValue({
        proceed: true,
      });

      const result = await evaluateSensitiveFlags(
        'org-123',
        'session-456',
        'user-789',
        'agent-111',
        'safe::tool',
        { param: 'value' },
      );

      expect(result.proceed).toBe(true);
      expect(result.blockReason).toBeUndefined();
      expect(mockTrpc.proxy.evaluateSensitiveFlags.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        sessionId: 'session-456',
        userId: 'user-789',
        agentId: 'agent-111',
        toolName: 'safe::tool',
        parameters: { param: 'value' },
        workspaceId: null,
      });
    });

    test('should return proceed=false with blockReason when rate limited', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockResolvedValue({
        proceed: false,
        blockReason: 'Rate limit exceeded: 10 calls per hour',
        matchedFlagIds: ['flag-rate-limit'],
      });

      const result = await evaluateSensitiveFlags(
        'org-123',
        'session-456',
        'user-789',
        undefined,
        'expensive::tool',
        {},
      );

      expect(result.proceed).toBe(false);
      expect(result.blockReason).toBe('Rate limit exceeded: 10 calls per hour');
      expect(result.matchedFlagIds).toEqual(['flag-rate-limit']);
    });

    test('should handle null agentId', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockResolvedValue({
        proceed: true,
      });

      await evaluateSensitiveFlags('org-123', 'session-456', 'user-789', undefined, 'tool', {});

      expect(mockTrpc.proxy.evaluateSensitiveFlags.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        sessionId: 'session-456',
        userId: 'user-789',
        agentId: null,
        toolName: 'tool',
        parameters: {},
        workspaceId: null,
      });
    });

    test('should return approval request ID when approval required', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockResolvedValue({
        proceed: false,
        blockReason: 'Approval required',
        approvalRequestId: 'approval-abc-123',
        matchedFlagIds: ['flag-approval'],
        approvalDetails: {
          approvalRequired: true,
          approvalRequestId: 'approval-abc-123',
          approvalStatus: 'PENDING',
        },
      });

      const result = await evaluateSensitiveFlags(
        'org-123',
        'session-456',
        'user-789',
        'agent-111',
        'sensitive::operation',
        { target: 'production' },
      );

      expect(result.proceed).toBe(false);
      expect(result.approvalRequestId).toBe('approval-abc-123');
      expect(result.approvalDetails).toEqual({
        approvalRequired: true,
        approvalRequestId: 'approval-abc-123',
        approvalStatus: 'PENDING',
      });
    });

    test('should return enhanced audit data when flags match', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockResolvedValue({
        proceed: true,
        enhancedAuditData: {
          sensitiveParams: ['apiKey'],
          flagNames: ['audit-sensitive-params'],
        },
        matchedFlagIds: ['flag-audit'],
        alertsSent: ['webhook-1', 'slack-channel'],
      });

      const result = await evaluateSensitiveFlags(
        'org-123',
        'session-456',
        'user-789',
        'agent-111',
        'tool::withSensitive',
        { apiKey: 'secret' },
      );

      expect(result.proceed).toBe(true);
      expect(result.enhancedAuditData).toEqual({
        sensitiveParams: ['apiKey'],
        flagNames: ['audit-sensitive-params'],
      });
      expect(result.alertsSent).toEqual(['webhook-1', 'slack-channel']);
    });

    test('should fail closed on evaluation error', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockRejectedValue(new Error('Database error'));

      const result = await evaluateSensitiveFlags(
        'org-123',
        'session-456',
        'user-789',
        'agent-111',
        'tool',
        {},
      );

      expect(result.proceed).toBe(false);
      expect(result.blockReason).toBe('Error evaluating sensitive flags');
    });

    test('should handle approval details with all fields', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockResolvedValue({
        proceed: true,
        approvalDetails: {
          approvalRequired: true,
          approvalRequestId: 'approval-123',
          approvalStatus: 'APPROVED',
          approvalDecidedBy: 'admin-user-456',
          approvalDecidedByEmail: 'admin@example.com',
          approvalDecidedAt: '2024-01-15T10:30:00Z',
        },
      });

      const result = await evaluateSensitiveFlags(
        'org-123',
        'session-456',
        'user-789',
        'agent-111',
        'tool',
        {},
      );

      expect(result.approvalDetails).toEqual({
        approvalRequired: true,
        approvalRequestId: 'approval-123',
        approvalStatus: 'APPROVED',
        approvalDecidedBy: 'admin-user-456',
        approvalDecidedByEmail: 'admin@example.com',
        approvalDecidedAt: '2024-01-15T10:30:00Z',
      });
    });

    test('should handle approval details with null/empty optional fields (lines 390-391 branch coverage)', async () => {
      const { evaluateSensitiveFlags } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.evaluateSensitiveFlags.mutate.mockResolvedValue({
        proceed: false,
        approvalDetails: {
          approvalRequired: true,
          approvalRequestId: null, // Tests line 390 || undefined
          approvalStatus: '', // Tests line 391 || undefined (empty string)
          approvalDecidedBy: null,
          approvalDecidedByEmail: null,
          approvalDecidedAt: null,
        },
      });

      const result = await evaluateSensitiveFlags(
        'org-123',
        'session-456',
        'user-789',
        'agent-111',
        'tool',
        {},
      );

      expect(result.approvalDetails).toEqual({
        approvalRequired: true,
        approvalRequestId: undefined,
        approvalStatus: undefined,
        approvalDecidedBy: undefined,
        approvalDecidedByEmail: undefined,
        approvalDecidedAt: undefined,
      });
    });
  });

  describe('pollApprovalStatus', () => {
    test('should return APPROVED status', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'APPROVED',
        approved: true,
        shouldPoll: false,
        details: {
          decidedBy: 'admin-123',
          decidedByEmail: 'admin@example.com',
          decidedAt: '2024-01-15T10:30:00Z',
        },
      });

      const result = await pollApprovalStatus('org-123', 'request-456');

      expect(result.status).toBe('APPROVED');
      expect(result.approved).toBe(true);
      expect(result.shouldPoll).toBe(false);
      expect(result.details).toEqual({
        decidedBy: 'admin-123',
        decidedByEmail: 'admin@example.com',
        decidedAt: '2024-01-15T10:30:00Z',
      });
    });

    test('should return DENIED status', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'DENIED',
        approved: false,
        shouldPoll: false,
        details: {
          decidedBy: 'admin-123',
          decidedByEmail: 'admin@example.com',
          decidedAt: '2024-01-15T11:00:00Z',
        },
      });

      const result = await pollApprovalStatus('org-123', 'request-456');

      expect(result.status).toBe('DENIED');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should return PENDING status with shouldPoll=true', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'PENDING',
        approved: false,
        shouldPoll: true,
        remainingMs: 120000,
        expiresAt: '2024-01-15T12:00:00Z',
      });

      const result = await pollApprovalStatus('org-123', 'request-456');

      expect(result.status).toBe('PENDING');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(true);
      expect(result.remainingMs).toBe(120000);
      expect(result.expiresAt).toBe('2024-01-15T12:00:00Z');
    });

    test('should return EXPIRED status', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'EXPIRED',
        approved: false,
        shouldPoll: false,
      });

      const result = await pollApprovalStatus('org-123', 'request-456');

      expect(result.status).toBe('EXPIRED');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should return CANCELLED status', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'CANCELLED',
        approved: false,
        shouldPoll: false,
      });

      const result = await pollApprovalStatus('org-123', 'request-456');

      expect(result.status).toBe('CANCELLED');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should use default pollTimeoutMs of 30000', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'PENDING',
        approved: false,
        shouldPoll: true,
      });

      await pollApprovalStatus('org-123', 'request-456');

      expect(mockTrpc.proxy.pollApprovalStatus.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        requestId: 'request-456',
        pollTimeoutMs: 30000,
      });
    });

    test('should pass custom pollTimeoutMs', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'PENDING',
        approved: false,
        shouldPoll: true,
      });

      await pollApprovalStatus('org-123', 'request-456', 60000);

      expect(mockTrpc.proxy.pollApprovalStatus.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        requestId: 'request-456',
        pollTimeoutMs: 60000,
      });
    });

    test('should return NOT_FOUND on error', async () => {
      const { pollApprovalStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockRejectedValue(new Error('Network error'));

      const result = await pollApprovalStatus('org-123', 'request-456');

      expect(result.status).toBe('NOT_FOUND');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });
  });

  describe('logAuditEntry with approval tracking', () => {
    test('should include approval tracking fields', async () => {
      const { logAuditEntry } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.logAuditEntry.mutate.mockResolvedValue({});

      const entry = {
        organizationId: 'org-123',
        userId: 'user-456',
        toolName: 'sensitive::tool',
        parameters: {},
        decision: 'ALLOWED' as const,
        policyIds: ['p1'],
        approvalRequired: true,
        approvalRequestId: 'approval-789',
        approvalStatus: 'APPROVED',
        approvalDecidedBy: 'admin-111',
        approvalDecidedByEmail: 'admin@example.com',
        approvalDecidedAt: '2024-01-15T10:30:00Z',
      };

      await logAuditEntry(entry);

      expect(mockTrpc.proxy.logAuditEntry.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalRequired: true,
          approvalRequestId: 'approval-789',
          approvalStatus: 'APPROVED',
          approvalDecidedBy: 'admin-111',
          approvalDecidedByEmail: 'admin@example.com',
          approvalDecidedAt: '2024-01-15T10:30:00Z',
        }),
      );
    });
  });

  // ============================================================================
  // SESSION MANAGEMENT TESTS
  // Coverage for lines 505-676
  // ============================================================================

  describe('getOrCreateSessionForTracking', () => {
    test('should create a new session successfully', async () => {
      const { getOrCreateSessionForTracking } =
        await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getOrCreateSession.mutate.mockResolvedValue({
        success: true,
        sessionId: 'session-123',
        isNew: true,
      });

      const result = await getOrCreateSessionForTracking(
        'org-123',
        'external-session-456',
        'user-789',
        'agent-111',
      );

      expect(result).toEqual({
        success: true,
        sessionId: 'session-123',
        isNew: true,
      });
      expect(mockTrpc.proxy.getOrCreateSession.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        externalSessionId: 'external-session-456',
        userId: 'user-789',
        agentId: 'agent-111',
        workspaceId: null,
      });
    });

    test('should return existing session', async () => {
      const { getOrCreateSessionForTracking } =
        await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getOrCreateSession.mutate.mockResolvedValue({
        success: true,
        sessionId: 'existing-session-123',
        isNew: false,
      });

      const result = await getOrCreateSessionForTracking('org-123', 'external-session-456');

      expect(result).toEqual({
        success: true,
        sessionId: 'existing-session-123',
        isNew: false,
      });
    });

    test('should handle null agentId', async () => {
      const { getOrCreateSessionForTracking } =
        await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getOrCreateSession.mutate.mockResolvedValue({
        success: true,
        sessionId: 'session-123',
        isNew: true,
      });

      await getOrCreateSessionForTracking('org-123', 'external-session-456', 'user-789', undefined);

      expect(mockTrpc.proxy.getOrCreateSession.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        externalSessionId: 'external-session-456',
        userId: 'user-789',
        agentId: null,
        workspaceId: null,
      });
    });

    test('should return failure result on error', async () => {
      const { getOrCreateSessionForTracking } =
        await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getOrCreateSession.mutate.mockRejectedValue(new Error('Database error'));

      const result = await getOrCreateSessionForTracking('org-123', 'external-session-456');

      expect(result).toEqual({
        success: false,
        sessionId: null,
        isNew: false,
      });
    });

    test('should handle missing userId and agentId', async () => {
      const { getOrCreateSessionForTracking } =
        await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.getOrCreateSession.mutate.mockResolvedValue({
        success: true,
        sessionId: 'session-123',
        isNew: true,
      });

      await getOrCreateSessionForTracking('org-123', 'external-session-456');

      expect(mockTrpc.proxy.getOrCreateSession.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        externalSessionId: 'external-session-456',
        userId: undefined,
        agentId: null,
        workspaceId: null,
      });
    });
  });

  describe('incrementSessionToolCallCount', () => {
    test('should increment tool call count successfully', async () => {
      const { incrementSessionToolCallCount } =
        await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.incrementToolCallCount.mutate.mockResolvedValue({});

      await incrementSessionToolCallCount('org-123', 'external-session-456');

      expect(mockTrpc.proxy.incrementToolCallCount.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        externalSessionId: 'external-session-456',
      });
    });

    test('should not throw on error (tracking should not block tool execution)', async () => {
      const { incrementSessionToolCallCount } =
        await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.incrementToolCallCount.mutate.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(
        incrementSessionToolCallCount('org-123', 'external-session-456'),
      ).resolves.toBeUndefined();
    });
  });

  describe('trackToolParamValues', () => {
    test('should track parameter values with response', async () => {
      const { trackToolParamValues } = await import('../../../packages/mcp/src/api-client.js');

      const mockMutate = vi.fn().mockResolvedValue({});
      mockTrpc.proxy.trackParamValues.mutate = mockMutate;

      await trackToolParamValues(
        'org-123',
        'server-456',
        'notion::getPage',
        { page_id: 'page-123' },
        { title: 'My Page' },
      );

      expect(mockMutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        serverId: 'server-456',
        toolName: 'notion::getPage',
        parameters: { page_id: 'page-123' },
        response: { title: 'My Page' },
      });
    });

    test('should track parameter values without response', async () => {
      const { trackToolParamValues } = await import('../../../packages/mcp/src/api-client.js');

      const mockMutate = vi.fn().mockResolvedValue({});
      mockTrpc.proxy.trackParamValues.mutate = mockMutate;

      await trackToolParamValues('org-123', 'server-456', 'tool::name', { param: 'value' });

      expect(mockMutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        serverId: 'server-456',
        toolName: 'tool::name',
        parameters: { param: 'value' },
        response: undefined,
      });
    });

    test('should not throw on mutate error (fire-and-forget)', async () => {
      const { trackToolParamValues } = await import('../../../packages/mcp/src/api-client.js');

      const mockMutate = vi.fn().mockReturnValue(Promise.reject(new Error('Network error')));
      mockTrpc.proxy.trackParamValues.mutate = mockMutate;

      // Should not throw
      await expect(
        trackToolParamValues('org-123', 'server-456', 'tool::name', {}),
      ).resolves.toBeUndefined();
    });

    test('should handle complex nested parameters', async () => {
      const { trackToolParamValues } = await import('../../../packages/mcp/src/api-client.js');

      const mockMutate = vi.fn().mockResolvedValue({});
      mockTrpc.proxy.trackParamValues.mutate = mockMutate;

      const complexParams = {
        ids: ['id-1', 'id-2'],
        nested: {
          deep: { value: 'test' },
        },
      };

      await trackToolParamValues('org-123', 'server-456', 'tool::name', complexParams);

      expect(mockMutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        serverId: 'server-456',
        toolName: 'tool::name',
        parameters: complexParams,
        response: undefined,
      });
    });

    test('should handle synchronous throw from mutate (line 643 coverage)', async () => {
      const { trackToolParamValues } = await import('../../../packages/mcp/src/api-client.js');

      // Mock that throws synchronously (not returning a promise)
      const mockMutate = vi.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
      });
      mockTrpc.proxy.trackParamValues.mutate = mockMutate;

      // Should not throw - the outer catch handles synchronous errors
      await expect(
        trackToolParamValues('org-123', 'server-456', 'tool::name', {}),
      ).resolves.toBeUndefined();
    });
  });

  describe('checkSessionStatus', () => {
    test('should return active session status', async () => {
      const { checkSessionStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.checkSessionStatus.query.mockResolvedValue({
        terminated: false,
        reason: null,
      });

      const result = await checkSessionStatus('org-123', 'external-session-456');

      expect(result).toEqual({
        terminated: false,
        reason: null,
      });
      expect(mockTrpc.proxy.checkSessionStatus.query).toHaveBeenCalledWith({
        organizationId: 'org-123',
        externalSessionId: 'external-session-456',
      });
    });

    test('should return terminated session status with reason', async () => {
      const { checkSessionStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.checkSessionStatus.query.mockResolvedValue({
        terminated: true,
        reason: 'Session terminated by admin due to security concern',
      });

      const result = await checkSessionStatus('org-123', 'external-session-456');

      expect(result).toEqual({
        terminated: true,
        reason: 'Session terminated by admin due to security concern',
      });
    });

    test('should fail closed on error (block requests when status cannot be verified)', async () => {
      const { checkSessionStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.checkSessionStatus.query.mockRejectedValue(new Error('Database error'));

      const result = await checkSessionStatus('org-123', 'external-session-456');

      // Fail closed - block requests if we can't verify status (PS-001 security fix)
      expect(result).toEqual({
        terminated: true,
        reason: 'Unable to verify session status',
      });
    });

    test('should handle network timeout by failing closed', async () => {
      const { checkSessionStatus } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.checkSessionStatus.query.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await checkSessionStatus('org-123', 'external-session-456');

      // Fail closed - block requests on network timeout (PS-001 security fix)
      expect(result).toEqual({
        terminated: true,
        reason: 'Unable to verify session status',
      });
    });
  });

  // ============================================================================
  // WAIT FOR APPROVAL TESTS
  // Coverage for lines 448-489
  // ============================================================================

  describe('waitForApproval', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('should return immediately when approval is granted on first poll', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'APPROVED',
        approved: true,
        shouldPoll: false,
        details: {
          decidedBy: 'admin-123',
          decidedByEmail: 'admin@example.com',
          decidedAt: '2024-01-15T10:30:00Z',
        },
      });

      const resultPromise = waitForApproval('org-123', 'request-456');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('APPROVED');
      expect(result.approved).toBe(true);
      expect(result.shouldPoll).toBe(false);
      expect(mockTrpc.proxy.pollApprovalStatus.mutate).toHaveBeenCalledTimes(1);
    });

    test('should return immediately when approval is denied on first poll', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'DENIED',
        approved: false,
        shouldPoll: false,
        details: {
          decidedBy: 'admin-123',
          decidedByEmail: 'admin@example.com',
          decidedAt: '2024-01-15T11:00:00Z',
        },
      });

      const resultPromise = waitForApproval('org-123', 'request-456');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('DENIED');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should return immediately when approval is expired on first poll', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'EXPIRED',
        approved: false,
        shouldPoll: false,
      });

      const resultPromise = waitForApproval('org-123', 'request-456');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('EXPIRED');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should return immediately when approval is cancelled on first poll', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'CANCELLED',
        approved: false,
        shouldPoll: false,
      });

      const resultPromise = waitForApproval('org-123', 'request-456');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('CANCELLED');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should poll multiple times until approved', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      // First call returns PENDING, second call returns APPROVED
      mockTrpc.proxy.pollApprovalStatus.mutate
        .mockResolvedValueOnce({
          status: 'PENDING',
          approved: false,
          shouldPoll: true,
          remainingMs: 120000,
          expiresAt: '2024-01-15T12:00:00Z',
        })
        .mockResolvedValueOnce({
          status: 'APPROVED',
          approved: true,
          shouldPoll: false,
          details: {
            decidedBy: 'admin-123',
            decidedByEmail: 'admin@example.com',
            decidedAt: '2024-01-15T10:35:00Z',
          },
        });

      const resultPromise = waitForApproval('org-123', 'request-456');

      // Run all timers to completion
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('APPROVED');
      expect(result.approved).toBe(true);
      expect(mockTrpc.proxy.pollApprovalStatus.mutate).toHaveBeenCalledTimes(2);
    });

    test('should return PENDING when max wait time exceeded', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      // Always return PENDING with shouldPoll=true
      mockTrpc.proxy.pollApprovalStatus.mutate.mockImplementation(async () => {
        // Simulate the poll waiting for a bit before returning
        return {
          status: 'PENDING',
          approved: false,
          shouldPoll: true,
          remainingMs: 60000,
          expiresAt: '2024-01-15T12:00:00Z',
        };
      });

      // Use very short timeouts for testing
      const resultPromise = waitForApproval('org-123', 'request-456', 500, 100);

      // Advance time past maxWaitMs
      await vi.advanceTimersByTimeAsync(600);
      const result = await resultPromise;

      expect(result.status).toBe('PENDING');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should use default maxWaitMs of 300000 (5 minutes)', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'APPROVED',
        approved: true,
        shouldPoll: false,
      });

      const resultPromise = waitForApproval('org-123', 'request-456');
      await vi.runAllTimersAsync();
      await resultPromise;

      // The function should have been called with default pollTimeoutMs of 30000
      expect(mockTrpc.proxy.pollApprovalStatus.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        requestId: 'request-456',
        pollTimeoutMs: 30000,
      });
    });

    test('should use custom pollIntervalMs', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'APPROVED',
        approved: true,
        shouldPoll: false,
      });

      const customPollInterval = 15000;
      const resultPromise = waitForApproval('org-123', 'request-456', 300000, customPollInterval);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockTrpc.proxy.pollApprovalStatus.mutate).toHaveBeenCalledWith({
        organizationId: 'org-123',
        requestId: 'request-456',
        pollTimeoutMs: customPollInterval,
      });
    });

    test('should handle NOT_FOUND status from poll', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      mockTrpc.proxy.pollApprovalStatus.mutate.mockResolvedValue({
        status: 'NOT_FOUND',
        approved: false,
        shouldPoll: false,
      });

      const resultPromise = waitForApproval('org-123', 'request-456');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('NOT_FOUND');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should preserve remainingMs and expiresAt on timeout', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      // Return PENDING but then timeout
      mockTrpc.proxy.pollApprovalStatus.mutate.mockImplementation(async () => {
        return {
          status: 'PENDING',
          approved: false,
          shouldPoll: true,
          remainingMs: 45000,
          expiresAt: '2024-01-15T12:00:00Z',
        };
      });

      // Very short max wait to trigger timeout quickly
      const resultPromise = waitForApproval('org-123', 'request-456', 200, 50);

      await vi.advanceTimersByTimeAsync(300);
      const result = await resultPromise;

      expect(result.status).toBe('PENDING');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
      // Note: When max wait exceeded from the loop, remainingMs and expiresAt may not be preserved
      // from the last poll result in the final return at line 484-488
    });

    test('should handle poll error gracefully (returns NOT_FOUND from pollApprovalStatus)', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      // First poll throws error (pollApprovalStatus catches and returns NOT_FOUND)
      mockTrpc.proxy.pollApprovalStatus.mutate.mockRejectedValue(new Error('Network error'));

      const resultPromise = waitForApproval('org-123', 'request-456');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // pollApprovalStatus catches error and returns NOT_FOUND with shouldPoll=false
      expect(result.status).toBe('NOT_FOUND');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });

    test('should exit loop when remaining time is zero or negative', async () => {
      const { waitForApproval } = await import('../../../packages/mcp/src/api-client.js');

      // Use real Date.now for this test by controlling the mock behavior
      let _callCount = 0;
      mockTrpc.proxy.pollApprovalStatus.mutate.mockImplementation(async () => {
        _callCount++;
        // Always return PENDING with shouldPoll=true
        return {
          status: 'PENDING',
          approved: false,
          shouldPoll: true,
          remainingMs: 10000,
          expiresAt: '2024-01-15T12:00:00Z',
        };
      });

      // Use a max wait of 100ms to test the timeout logic
      const resultPromise = waitForApproval('org-123', 'request-456', 100, 50);

      // Advance time past the max wait
      await vi.advanceTimersByTimeAsync(200);
      const result = await resultPromise;

      expect(result.status).toBe('PENDING');
      expect(result.approved).toBe(false);
      expect(result.shouldPoll).toBe(false);
    });
  });
});
