/**
 * Tests for User MCP Servers Router
 * Tests user authentication, credentials, and OAuth flows for MCP servers
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockValidateMcpServerUrl,
  mockDiscoverTools,
  mockEncryptString,
  mockDecryptString,
  mockEncryptObject,
  mockDecryptCredentials,
  mockInitiateOAuthFlow,
  mockGetOAuthConnectionStatus,
  mockRevokeAndDisconnect,
  mockRefreshAccessToken,
  mockLogAdminAction,
} = vi.hoisted(() => ({
  mockPrisma: {
    mcpServer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    userMcpConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockValidateMcpServerUrl: vi.fn(),
  mockDiscoverTools: vi.fn(),
  mockEncryptString: vi.fn(),
  mockDecryptString: vi.fn(),
  mockEncryptObject: vi.fn(),
  mockDecryptCredentials: vi.fn(),
  mockInitiateOAuthFlow: vi.fn(),
  mockGetOAuthConnectionStatus: vi.fn(),
  mockRevokeAndDisconnect: vi.fn(),
  mockRefreshAccessToken: vi.fn(),
  mockLogAdminAction: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  McpAuthType: {
    NONE: 'NONE',
    API_KEY: 'API_KEY',
    OAUTH: 'OAUTH',
    CUSTOM: 'CUSTOM',
  },
  AdminActionType: {
    OAUTH_FLOW_INITIATE: 'OAUTH_FLOW_INITIATE',
    OAUTH_TOKEN_REFRESH: 'OAUTH_TOKEN_REFRESH',
    OAUTH_DISCONNECT: 'OAUTH_DISCONNECT',
  },
  AdminResourceType: {
    OAUTH_CLIENT: 'OAUTH_CLIENT',
  },
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  protectedProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

vi.mock('../../../../../packages/api/src/lib/crypto.js', () => ({
  encryptString: mockEncryptString,
  decryptString: mockDecryptString,
  encryptObject: mockEncryptObject,
  decryptCredentials: mockDecryptCredentials,
}));

vi.mock('../../../../../packages/api/src/services/mcp.js', () => ({
  validateMcpServerUrl: mockValidateMcpServerUrl,
  discoverTools: mockDiscoverTools,
}));

vi.mock('../../../../../packages/api/src/services/oauth.js', () => ({
  initiateOAuthFlow: mockInitiateOAuthFlow,
  getConnectionStatus: mockGetOAuthConnectionStatus,
  revokeAndDisconnect: mockRevokeAndDisconnect,
  refreshAccessToken: mockRefreshAccessToken,
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

import { userMcpServersRouter as _userMcpServersRouter } from '../../../../../packages/api/src/trpc/user/mcpServers.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

// Type aliases for list operations
type ListHandler = TestableHandler<Record<string, unknown>[]>;

const userMcpServersRouter = _userMcpServersRouter as unknown as {
  disconnect: TestableHandler<{ success: boolean }>;
  getConnectionStatus: TestableHandler<{
    connected: boolean;
    expiresAt: Date | null;
    [key: string]: unknown;
  }>;
  getCredentials: TestableHandler<{
    apiKey: string | null;
    credentials: Record<string, unknown> | null;
    [key: string]: unknown;
  }>;
  initiateOAuth: TestableHandler<{ authUrl: string; [key: string]: unknown }>;
  list: ListHandler;
  refreshOAuthToken: TestableHandler<{
    success: boolean;
    expiresAt?: Date;
    [key: string]: unknown;
  }>;
  submitApiKey: TestableHandler<{
    success: boolean;
    overrideRequired?: boolean;
    conflicts?: unknown[];
  }>;
  submitCredentials: TestableHandler<{
    success: boolean;
    overrideRequired?: boolean;
    conflicts?: unknown[];
  }>;
};

function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
) {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
    },
    req: {
      req: {
        header: vi.fn().mockReturnValue(null),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDecryptString.mockImplementation((val) => (val ? `decrypted:${val}` : null));
  mockEncryptString.mockImplementation((val) => `encrypted:${val}`);
  mockEncryptObject.mockImplementation((val) => JSON.stringify(val));
  mockDecryptCredentials.mockImplementation((val) => JSON.parse(val));
  mockLogAdminAction.mockResolvedValue(undefined);
  mockDiscoverTools.mockResolvedValue({ tools: [] });
});

describe('userMcpServersRouter', () => {
  describe('list', () => {
    test('should list MCP servers with authentication status', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server',
          url: 'https://api.example.com',
          authType: 'NONE',
          trusted: true,
          apiKey: null,
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [],
          orgOAuthToken: null,
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('server-1');
      expect(result[0].authenticated).toBe(true); // NONE auth type
    });

    test('should show authenticated=true for API_KEY with user config', async () => {
      const mockServers = [
        {
          id: 'server-2',
          name: 'API Key Server',
          url: 'https://api.example.com',
          authType: 'API_KEY',
          trusted: true,
          apiKey: null,
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [
            {
              id: 'config-1',
              apiKey: 'encrypted-key',
              credentials: null,
              accessToken: null,
              authenticatedAt: new Date('2024-01-15'),
            },
          ],
          orgOAuthToken: null,
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result[0].authenticated).toBe(true);
      expect(result[0].hasUserApiKey).toBe(true);
      expect(result[0].userApiKeyHint).toMatch(/•••/);
    });

    test('should show authenticated=true for org-level API key', async () => {
      const mockServers = [
        {
          id: 'server-3',
          name: 'Org API Key Server',
          url: 'https://api.example.com',
          authType: 'API_KEY',
          trusted: true,
          apiKey: 'org-encrypted-key',
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [],
          orgOAuthToken: null,
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result[0].authenticated).toBe(true);
      expect(result[0].hasOrgApiKey).toBe(true);
      expect(result[0].orgApiKeyHint).toMatch(/•••/);
    });

    test('should show authenticated=false when no credentials', async () => {
      const mockServers = [
        {
          id: 'server-4',
          name: 'No Auth Server',
          url: 'https://api.example.com',
          authType: 'API_KEY',
          trusted: true,
          apiKey: null,
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [],
          orgOAuthToken: null,
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result[0].authenticated).toBe(false);
    });

    test('should include user credentials status', async () => {
      const mockServers = [
        {
          id: 'server-5',
          name: 'Creds Server',
          url: 'https://api.example.com',
          authType: 'CUSTOM',
          trusted: false,
          apiKey: null,
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [
            {
              id: 'config-2',
              apiKey: null,
              credentials: '{"apiKey":"test"}',
              accessToken: null,
              authenticatedAt: new Date('2024-01-15'),
            },
          ],
          orgOAuthToken: null,
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result[0].hasUserCredentials).toBe(true);
    });

    test('should include OAuth status', async () => {
      const mockServers = [
        {
          id: 'server-6',
          name: 'OAuth Server',
          url: 'https://api.example.com',
          authType: 'OAUTH',
          trusted: true,
          apiKey: null,
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [
            {
              id: 'config-3',
              apiKey: null,
              credentials: null,
              accessToken: 'access-token',
              authenticatedAt: new Date('2024-01-15'),
            },
          ],
          orgOAuthToken: null,
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result[0].hasUserOAuth).toBe(true);
      expect(result[0].authenticated).toBe(true);
    });

    test('should include org OAuth status', async () => {
      const mockServers = [
        {
          id: 'server-7',
          name: 'Org OAuth Server',
          url: 'https://api.example.com',
          authType: 'OAUTH',
          trusted: true,
          apiKey: null,
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [],
          orgOAuthToken: { id: 'token-1' },
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result[0].hasOrgOAuth).toBe(true);
      expect(result[0].authenticated).toBe(true);
    });
  });

  describe('submitApiKey', () => {
    test('should submit API key successfully', async () => {
      const mockServer = {
        id: 'server-1',
        authType: 'API_KEY',
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(mockServer);
      mockValidateMcpServerUrl.mockResolvedValue({ success: true });
      mockPrisma.userMcpConfig.upsert.mockResolvedValue({
        authenticatedAt: new Date('2024-01-15'),
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1', apiKey: 'test-api-key' };

      const result = await userMcpServersRouter.submitApiKey({ ctx, input });

      expect(result.success).toBe(true);
      expect(mockEncryptString).toHaveBeenCalledWith('test-api-key');
      expect(mockPrisma.userMcpConfig.upsert).toHaveBeenCalled();
    });

    test('should throw NOT_FOUND if server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent', apiKey: 'key' };

      await expect(userMcpServersRouter.submitApiKey({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('should throw BAD_REQUEST for non-API_KEY auth type', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'OAUTH',
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1', apiKey: 'key' };

      await expect(userMcpServersRouter.submitApiKey({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('should throw BAD_REQUEST for invalid API key', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
      });
      mockValidateMcpServerUrl.mockResolvedValue({
        success: false,
        error: 'Invalid API key',
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1', apiKey: 'bad-key' };

      await expect(userMcpServersRouter.submitApiKey({ ctx, input })).rejects.toThrow(
        'Invalid API key',
      );
    });
  });

  describe('submitCredentials', () => {
    test('should submit credentials successfully', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
        apiKey: null,
        credentials: null,
        url: 'https://api.example.com',
      });
      mockValidateMcpServerUrl.mockResolvedValue({ success: true });
      mockPrisma.userMcpConfig.upsert.mockResolvedValue({
        authenticatedAt: new Date('2024-01-15'),
      });

      const ctx = createMockContext();
      const input = {
        mcpServerId: 'server-1',
        credentials: { apiKey: 'test-key' },
      };

      const result = await userMcpServersRouter.submitCredentials({ ctx, input });

      expect(result.success).toBe(true);
      expect(result.overrideRequired).toBe(false);
    });

    test('should clear credentials when null provided', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
        apiKey: null,
        credentials: null,
        url: 'https://api.example.com',
      });
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue({
        apiKey: null,
        authenticatedAt: null,
      });
      mockPrisma.userMcpConfig.update.mockResolvedValue({});

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1', credentials: null };

      const result = await userMcpServersRouter.submitCredentials({ ctx, input });

      expect(result.success).toBe(true);
    });

    test('should throw NOT_FOUND if server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent', credentials: {} };

      await expect(userMcpServersRouter.submitCredentials({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });

    test('should require auth fields for non-NONE auth type', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
        apiKey: null,
        credentials: null,
        url: 'https://api.example.com',
      });

      const ctx = createMockContext();
      const input = {
        mcpServerId: 'server-1',
        credentials: { someField: 'value' }, // No apiKey, accessToken, or headers
      };

      await expect(userMcpServersRouter.submitCredentials({ ctx, input })).rejects.toThrow(
        'Credentials must include an API key',
      );
    });

    test('should throw BAD_REQUEST for invalid credentials', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
        apiKey: null,
        credentials: null,
        url: 'https://api.example.com',
      });
      mockValidateMcpServerUrl.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      const ctx = createMockContext();
      const input = {
        mcpServerId: 'server-1',
        credentials: { apiKey: 'bad-key' },
      };

      await expect(userMcpServersRouter.submitCredentials({ ctx, input })).rejects.toThrow(
        'Invalid credentials',
      );
    });

    test('should detect conflicts with org credentials', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
        apiKey: 'org-api-key',
        credentials: null,
        url: 'https://api.example.com',
      });
      mockValidateMcpServerUrl.mockResolvedValue({ success: true });
      mockDecryptString.mockImplementation(() => 'org-key-value');

      const ctx = createMockContext();
      const input = {
        mcpServerId: 'server-1',
        credentials: { apiKey: 'user-key-different' }, // Different from org
      };

      const result = await userMcpServersRouter.submitCredentials({ ctx, input });

      expect(result.success).toBe(false);
      expect(result.overrideRequired).toBe(true);
      expect(result.conflicts).toContain('apiKey');
    });

    test('should allow override with forceOverride flag', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
        apiKey: 'org-api-key',
        credentials: null,
        url: 'https://api.example.com',
      });
      mockValidateMcpServerUrl.mockResolvedValue({ success: true });
      mockDecryptString.mockImplementation(() => 'org-key-value');
      mockPrisma.userMcpConfig.upsert.mockResolvedValue({
        authenticatedAt: new Date('2024-01-15'),
      });

      const ctx = createMockContext();
      const input = {
        mcpServerId: 'server-1',
        credentials: { apiKey: 'user-key' },
        forceOverride: true,
      };

      const result = await userMcpServersRouter.submitCredentials({ ctx, input });

      expect(result.success).toBe(true);
    });

    test('should accept headers as valid auth field', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'CUSTOM',
        apiKey: null,
        credentials: null,
        url: 'https://api.example.com',
      });
      mockValidateMcpServerUrl.mockResolvedValue({ success: true });
      mockPrisma.userMcpConfig.upsert.mockResolvedValue({
        authenticatedAt: new Date('2024-01-15'),
      });

      const ctx = createMockContext();
      const input = {
        mcpServerId: 'server-1',
        credentials: { headers: { 'X-Custom-Auth': 'token' } },
      };

      const result = await userMcpServersRouter.submitCredentials({ ctx, input });

      expect(result.success).toBe(true);
    });

    test('should accept accessToken as valid auth field', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'OAUTH',
        apiKey: null,
        credentials: null,
        url: 'https://api.example.com',
      });
      mockValidateMcpServerUrl.mockResolvedValue({ success: true });
      mockPrisma.userMcpConfig.upsert.mockResolvedValue({
        authenticatedAt: new Date('2024-01-15'),
      });

      const ctx = createMockContext();
      const input = {
        mcpServerId: 'server-1',
        credentials: { accessToken: 'oauth-token' },
      };

      const result = await userMcpServersRouter.submitCredentials({ ctx, input });

      expect(result.success).toBe(true);
    });
  });

  describe('getCredentials', () => {
    test('should return decrypted credentials', async () => {
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue({
        credentials: '{"apiKey":"test-key"}',
      });
      mockDecryptCredentials.mockReturnValue({ apiKey: 'test-key' });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.getCredentials({ ctx, input });

      expect(result.credentials).toEqual({ apiKey: 'test-key' });
    });

    test('should return null if no config exists', async () => {
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.getCredentials({ ctx, input });

      expect(result.credentials).toBeNull();
    });

    test('should return null if credentials are not a string', async () => {
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue({
        credentials: {},
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.getCredentials({ ctx, input });

      expect(result.credentials).toBeNull();
    });
  });

  describe('initiateOAuth', () => {
    test('should initiate OAuth flow successfully', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'OAuth Server',
        authType: 'OAUTH',
        oauthClientRegistration: { id: 'client-1' },
      });
      mockInitiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com/authorize?...',
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.initiateOAuth({ ctx, input });

      expect(result.authorizationUrl).toContain('auth.example.com');
      expect(mockLogAdminAction).toHaveBeenCalled();
    });

    test('should throw NOT_FOUND if server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent' };

      await expect(userMcpServersRouter.initiateOAuth({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('should throw BAD_REQUEST for non-OAUTH auth type', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'API_KEY',
        oauthClientRegistration: null,
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      await expect(userMcpServersRouter.initiateOAuth({ ctx, input })).rejects.toThrow(
        'does not use OAuth',
      );
    });

    test('should throw BAD_REQUEST if OAuth not configured', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: 'OAUTH',
        oauthClientRegistration: null,
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      await expect(userMcpServersRouter.initiateOAuth({ ctx, input })).rejects.toThrow(
        'OAuth not configured',
      );
    });

    test('should handle OAuth flow errors', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'OAuth Server',
        authType: 'OAUTH',
        oauthClientRegistration: { id: 'client-1' },
      });
      mockInitiateOAuthFlow.mockRejectedValue(new Error('OAuth provider error'));

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      await expect(userMcpServersRouter.initiateOAuth({ ctx, input })).rejects.toThrow(
        'OAuth provider error',
      );
    });
  });

  describe('getConnectionStatus', () => {
    test('should return connection status', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'Test Server',
        authType: 'OAUTH',
      });
      mockGetOAuthConnectionStatus.mockResolvedValue({
        connected: true,
        expiresAt: new Date('2024-12-31'),
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.getConnectionStatus({ ctx, input });

      expect(result.serverName).toBe('Test Server');
      expect(result.authType).toBe('OAUTH');
      expect(result.connected).toBe(true);
    });

    test('should throw NOT_FOUND if server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent' };

      await expect(userMcpServersRouter.getConnectionStatus({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('refreshOAuthToken', () => {
    test('should refresh token successfully', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'OAuth Server',
      });
      mockRefreshAccessToken.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.refreshOAuthToken({ ctx, input });

      expect(result.success).toBe(true);
      expect(mockLogAdminAction).toHaveBeenCalled();
    });

    test('should throw NOT_FOUND if server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent' };

      await expect(userMcpServersRouter.refreshOAuthToken({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });

    test('should handle refresh errors', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'OAuth Server',
      });
      mockRefreshAccessToken.mockRejectedValue(new Error('Token expired'));

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      await expect(userMcpServersRouter.refreshOAuthToken({ ctx, input })).rejects.toThrow(
        'Token expired',
      );
    });
  });

  describe('disconnect', () => {
    test('should disconnect API_KEY server successfully', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'API Server',
        authType: 'API_KEY',
      });
      mockPrisma.userMcpConfig.deleteMany.mockResolvedValue({ count: 1 });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.disconnect({ ctx, input });

      expect(result.success).toBe(true);
      expect(mockPrisma.userMcpConfig.deleteMany).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalled();
    });

    test('should disconnect OAuth server with revocation', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'OAuth Server',
        authType: 'OAUTH',
      });
      mockRevokeAndDisconnect.mockResolvedValue(undefined);
      mockPrisma.userMcpConfig.deleteMany.mockResolvedValue({ count: 1 });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.disconnect({ ctx, input });

      expect(result.success).toBe(true);
      expect(mockRevokeAndDisconnect).toHaveBeenCalled();
    });

    test('should continue even if OAuth revocation fails', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'OAuth Server',
        authType: 'OAUTH',
      });
      mockRevokeAndDisconnect.mockRejectedValue(new Error('Revocation failed'));
      mockPrisma.userMcpConfig.deleteMany.mockResolvedValue({ count: 1 });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await userMcpServersRouter.disconnect({ ctx, input });

      expect(result.success).toBe(true);
      expect(mockPrisma.userMcpConfig.deleteMany).toHaveBeenCalled();
    });

    test('should throw NOT_FOUND if server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent' };

      await expect(userMcpServersRouter.disconnect({ ctx, input })).rejects.toThrow(TRPCError);
    });
  });
});

describe('helper functions', () => {
  describe('maskCredential', () => {
    // Tested implicitly through list endpoint
    test('should mask credentials in list output', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server',
          url: 'https://api.example.com',
          authType: 'API_KEY',
          trusted: true,
          apiKey: 'encrypted-org-key',
          credentials: null,
          updatedAt: new Date('2024-01-01'),
          userConfigs: [
            {
              id: 'config-1',
              apiKey: 'encrypted-user-key',
              credentials: null,
              accessToken: null,
              authenticatedAt: new Date('2024-01-15'),
            },
          ],
          orgOAuthToken: null,
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(mockServers);
      mockDecryptString.mockImplementation((val) =>
        val === 'encrypted-org-key' ? 'org-key-1234' : 'user-key-5678',
      );

      const ctx = createMockContext();
      const result = await userMcpServersRouter.list({ ctx });

      expect(result[0].orgApiKeyHint).toBe('•••1234');
      expect(result[0].userApiKeyHint).toBe('•••5678');
    });
  });
});
