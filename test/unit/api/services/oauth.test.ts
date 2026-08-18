/**
 * Tests for OAuth 2.1 Service
 * Tests PKCE generation, state management, and OAuth flow functions
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks
const {
  mockMcpServerFindUnique,
  mockOAuthStateCreate,
  mockOAuthStateFindUnique,
  mockOAuthStateDelete,
  mockOAuthStateDeleteMany,
  mockUserMcpConfigFindUnique,
  mockUserMcpConfigUpsert,
  mockUserMcpConfigUpdate,
  mockUserMcpConfigDelete,
  mockOrgMcpOAuthTokenFindUnique,
  mockOrgMcpOAuthTokenUpsert,
  mockOrgMcpOAuthTokenUpdate,
  mockOrgMcpOAuthTokenDelete,
  mockOAuthClientRegistrationUpsert,
  mockUserFindUnique,
} = vi.hoisted(() => ({
  mockMcpServerFindUnique: vi.fn(),
  mockOAuthStateCreate: vi.fn(),
  mockOAuthStateFindUnique: vi.fn(),
  mockOAuthStateDelete: vi.fn(),
  mockOAuthStateDeleteMany: vi.fn(),
  mockUserMcpConfigFindUnique: vi.fn(),
  mockUserMcpConfigUpsert: vi.fn(),
  mockUserMcpConfigUpdate: vi.fn(),
  mockUserMcpConfigDelete: vi.fn(),
  mockOrgMcpOAuthTokenFindUnique: vi.fn(),
  mockOrgMcpOAuthTokenUpsert: vi.fn(),
  mockOrgMcpOAuthTokenUpdate: vi.fn(),
  mockOrgMcpOAuthTokenDelete: vi.fn(),
  mockOAuthClientRegistrationUpsert: vi.fn(),
  mockUserFindUnique: vi.fn(),
}));

const mockMcpServerFindFirst = vi.hoisted(() => vi.fn());

vi.mock('@sentinel/db', () => ({
  prisma: {
    mcpServer: {
      findUnique: mockMcpServerFindUnique,
      findFirst: mockMcpServerFindFirst,
    },
    oAuthState: {
      create: mockOAuthStateCreate,
      findUnique: mockOAuthStateFindUnique,
      delete: mockOAuthStateDelete,
      deleteMany: mockOAuthStateDeleteMany,
    },
    userMcpConfig: {
      findUnique: mockUserMcpConfigFindUnique,
      upsert: mockUserMcpConfigUpsert,
      update: mockUserMcpConfigUpdate,
      delete: mockUserMcpConfigDelete,
    },
    orgMcpOAuthToken: {
      findUnique: mockOrgMcpOAuthTokenFindUnique,
      upsert: mockOrgMcpOAuthTokenUpsert,
      update: mockOrgMcpOAuthTokenUpdate,
      delete: mockOrgMcpOAuthTokenDelete,
    },
    oAuthClientRegistration: {
      upsert: mockOAuthClientRegistrationUpsert,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

vi.mock('../../../../packages/api/src/lib/crypto.js', () => ({
  encryptString: vi.fn((s: string) => `encrypted:${s}`),
  decryptString: vi.fn((s: string) => s.replace('encrypted:', '')),
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../packages/api/src/services/oauthDiscovery.js', () => ({
  discoverOAuthCapability: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  cleanupExpiredStates,
  generatePKCE,
  generateState,
  getAccessToken,
  getConnectionStatus,
  getOrgAccessToken,
  getOrgOAuthStatus,
  handleOAuthCallback,
  initiateOAuthFlow,
  refreshAccessToken,
  refreshOrgAccessToken,
  registerOAuthClient,
  revokeAndDisconnect,
  revokeAndDisconnectOrg,
  storeOAuthClientRegistration,
} from '../../../../packages/api/src/services/oauth.js';

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('oauth', () => {
  describe('generatePKCE', () => {
    test('should generate code verifier and challenge', () => {
      const { codeVerifier, codeChallenge } = generatePKCE();

      expect(codeVerifier).toBeDefined();
      expect(codeChallenge).toBeDefined();
      expect(typeof codeVerifier).toBe('string');
      expect(typeof codeChallenge).toBe('string');
    });

    test('should generate base64url encoded code verifier', () => {
      const { codeVerifier } = generatePKCE();
      // Base64url should not contain +, /, or = padding
      expect(codeVerifier).not.toMatch(/[+/=]/);
    });

    test('should generate code verifier of correct length', () => {
      const { codeVerifier } = generatePKCE();
      // 64 bytes = 86 chars in base64url (approximately)
      expect(codeVerifier.length).toBeGreaterThan(80);
    });

    test('should generate unique values on each call', () => {
      const first = generatePKCE();
      const second = generatePKCE();

      expect(first.codeVerifier).not.toBe(second.codeVerifier);
      expect(first.codeChallenge).not.toBe(second.codeChallenge);
    });

    test('should generate SHA256 challenge (S256 method)', () => {
      const { codeVerifier, codeChallenge } = generatePKCE();
      // Challenge should be shorter than verifier (hash output)
      expect(codeChallenge.length).toBeLessThan(codeVerifier.length);
      // SHA256 hash in base64url is 43 characters
      expect(codeChallenge.length).toBe(43);
    });
  });

  describe('generateState', () => {
    test('should generate a state token', () => {
      const state = generateState();

      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
    });

    test('should generate base64url encoded state', () => {
      const state = generateState();
      expect(state).not.toMatch(/[+/=]/);
    });

    test('should generate state of correct length', () => {
      const state = generateState();
      // 32 bytes = ~43 chars in base64url
      expect(state.length).toBeGreaterThan(40);
    });

    test('should generate unique state on each call', () => {
      const states = new Set();
      for (let i = 0; i < 100; i++) {
        states.add(generateState());
      }
      expect(states.size).toBe(100);
    });
  });

  describe('registerOAuthClient', () => {
    test('should register client successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          client_id: 'client-123',
          client_secret: 'secret-456',
        }),
      });

      const result = await registerOAuthClient(
        'https://auth.example.com/register',
        'Test Org',
        'https://sentinel.example.com/callback',
      );

      expect(result.clientId).toBe('client-123');
      expect(result.clientSecret).toBe('secret-456');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    test('should throw on registration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(
        registerOAuthClient(
          'https://auth.example.com/register',
          'Test Org',
          'https://sentinel.example.com/callback',
        ),
      ).rejects.toThrow('OAuth client registration failed: 400');
    });

    test('should throw when client_id is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(
        registerOAuthClient(
          'https://auth.example.com/register',
          'Test Org',
          'https://sentinel.example.com/callback',
        ),
      ).rejects.toThrow('DCR response missing client_id');
    });

    test('should handle missing client_secret', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          client_id: 'client-123',
        }),
      });

      const result = await registerOAuthClient(
        'https://auth.example.com/register',
        'Test Org',
        'https://sentinel.example.com/callback',
      );

      expect(result.clientSecret).toBe('');
    });
  });

  describe('storeOAuthClientRegistration', () => {
    test('should store registration with encryption', async () => {
      mockOAuthClientRegistrationUpsert.mockResolvedValue({});

      await storeOAuthClientRegistration(
        'org-123',
        'server-456',
        'client-id',
        'client-secret',
        'https://auth.example.com/authorize',
        'https://auth.example.com/token',
        'https://auth.example.com/register',
        'https://auth.example.com/revoke',
        ['read', 'write'],
        ['authorization_code', 'refresh_token'],
      );

      expect(mockOAuthClientRegistrationUpsert).toHaveBeenCalledWith({
        where: { mcpServerId: 'server-456' },
        create: expect.objectContaining({
          organizationId: 'org-123',
          mcpServerId: 'server-456',
          clientId: 'client-id',
          clientSecret: 'encrypted:client-secret',
        }),
        update: expect.objectContaining({
          clientId: 'client-id',
          clientSecret: 'encrypted:client-secret',
        }),
      });
    });
  });

  describe('initiateOAuthFlow', () => {
    test('should throw when MCP server not found', async () => {
      mockMcpServerFindFirst.mockResolvedValue(null);

      await expect(initiateOAuthFlow('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'MCP server not found',
      );
    });

    test('should throw when OAuth not configured', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: 'server-456',
        organizationId: 'org-123',
        oauthClientRegistration: null,
      });

      await expect(initiateOAuthFlow('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'OAuth not configured for this MCP server',
      );
    });

    test('should create authorization URL', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: 'server-456',
        organizationId: 'org-123',
        url: 'https://mcp.example.com',
        oauthClientRegistration: {
          clientId: 'client-123',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          scopesSupported: ['read', 'write'],
        },
      });
      mockOAuthStateCreate.mockResolvedValue({});

      const result = await initiateOAuthFlow('org-123', 'user-123', 'server-456');

      expect(result.authorizationUrl).toContain('https://auth.example.com/authorize');
      expect(result.authorizationUrl).toContain('client_id=client-123');
      expect(result.authorizationUrl).toContain('code_challenge_method=S256');
      expect(result.authorizationUrl).toContain('resource=https%3A%2F%2Fmcp.example.com');
    });

    test('should store OAuth state', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: 'server-456',
        organizationId: 'org-123',
        url: 'https://mcp.example.com',
        oauthClientRegistration: {
          clientId: 'client-123',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          scopesSupported: [],
        },
      });
      mockOAuthStateCreate.mockResolvedValue({});

      await initiateOAuthFlow('org-123', 'user-123', 'server-456', '/return-url', true);

      expect(mockOAuthStateCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
          userId: 'user-123',
          mcpServerId: 'server-456',
          returnUrl: '/return-url',
          isOrgLevel: true,
        }),
      });
    });
  });

  describe('handleOAuthCallback', () => {
    test('should throw on invalid state', async () => {
      mockOAuthStateFindUnique.mockResolvedValue(null);

      await expect(handleOAuthCallback('auth-code', 'invalid-state')).rejects.toThrow(
        'Invalid or expired OAuth state',
      );
    });

    test('should throw on expired state', async () => {
      mockOAuthStateFindUnique.mockResolvedValue({
        id: 'state-id',
        state: 'valid-state',
        expiresAt: new Date(Date.now() - 1000), // Expired
      });
      mockOAuthStateDelete.mockResolvedValue({});

      await expect(handleOAuthCallback('auth-code', 'valid-state')).rejects.toThrow(
        'OAuth state expired',
      );
    });

    test('should throw when MCP server config not found', async () => {
      mockOAuthStateFindUnique.mockResolvedValue({
        id: 'state-id',
        state: 'valid-state',
        organizationId: 'org-789',
        expiresAt: new Date(Date.now() + 60000),
        userId: 'user-123',
        mcpServerId: 'server-456',
        codeVerifier: 'verifier',
        resource: 'https://mcp.example.com',
        isOrgLevel: false,
      });
      mockOAuthStateDelete.mockResolvedValue({});
      mockMcpServerFindFirst.mockResolvedValue(null);

      await expect(handleOAuthCallback('auth-code', 'valid-state')).rejects.toThrow(
        'OAuth configuration not found',
      );
    });

    test('should throw on token exchange failure', async () => {
      mockOAuthStateFindUnique.mockResolvedValue({
        id: 'state-id',
        organizationId: 'org-789',
        expiresAt: new Date(Date.now() + 60000),
        userId: 'user-123',
        mcpServerId: 'server-456',
        codeVerifier: 'verifier',
        resource: 'https://mcp.example.com',
        isOrgLevel: false,
      });
      mockOAuthStateDelete.mockResolvedValue({});
      mockUserFindUnique.mockResolvedValue({
        id: 'user-123',
        organizationId: 'org-789',
      });
      mockMcpServerFindFirst.mockResolvedValue({
        id: 'server-456',
        organizationId: 'org-789',
        name: 'Test Server',
        oauthClientRegistration: {
          clientId: 'client-123',
          clientSecret: 'encrypted:secret',
          tokenEndpoint: 'https://auth.example.com/token',
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(handleOAuthCallback('auth-code', 'valid-state')).rejects.toThrow(
        'Token exchange failed: 401',
      );
    });

    test('should successfully exchange tokens for personal flow', async () => {
      mockOAuthStateFindUnique.mockResolvedValue({
        id: 'state-id',
        organizationId: 'org-789',
        expiresAt: new Date(Date.now() + 60000),
        userId: 'user-123',
        mcpServerId: 'server-456',
        codeVerifier: 'verifier',
        resource: 'https://mcp.example.com',
        returnUrl: '/dashboard',
        isOrgLevel: false,
      });
      mockOAuthStateDelete.mockResolvedValue({});
      mockUserFindUnique.mockResolvedValue({
        id: 'user-123',
        organizationId: 'org-789',
      });
      mockMcpServerFindFirst.mockResolvedValue({
        id: 'server-456',
        organizationId: 'org-789',
        name: 'Test Server',
        oauthClientRegistration: {
          clientId: 'client-123',
          clientSecret: 'encrypted:secret',
          tokenEndpoint: 'https://auth.example.com/token',
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-123',
          refresh_token: 'refresh-token-456',
          expires_in: 3600,
        }),
      });
      mockUserMcpConfigUpsert.mockResolvedValue({});

      const result = await handleOAuthCallback('auth-code', 'valid-state');

      expect(result.userId).toBe('user-123');
      expect(result.mcpServerId).toBe('server-456');
      expect(result.serverName).toBe('Test Server');
      expect(result.returnUrl).toBe('/dashboard');
      expect(result.isOrgLevel).toBe(false);
      expect(mockUserMcpConfigUpsert).toHaveBeenCalled();
    });

    test('should successfully exchange tokens for org-level flow', async () => {
      mockOAuthStateFindUnique.mockResolvedValue({
        id: 'state-id',
        organizationId: 'org-789',
        expiresAt: new Date(Date.now() + 60000),
        userId: 'user-123',
        mcpServerId: 'server-456',
        codeVerifier: 'verifier',
        resource: 'https://mcp.example.com',
        isOrgLevel: true,
      });
      mockOAuthStateDelete.mockResolvedValue({});
      mockUserFindUnique.mockResolvedValue({
        id: 'user-123',
        organizationId: 'org-789',
      });
      mockMcpServerFindFirst.mockResolvedValue({
        id: 'server-456',
        organizationId: 'org-789',
        name: 'Test Server',
        oauthClientRegistration: {
          clientId: 'client-123',
          clientSecret: 'encrypted:secret',
          tokenEndpoint: 'https://auth.example.com/token',
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-123',
          token_type: 'Bearer',
        }),
      });
      mockOrgMcpOAuthTokenUpsert.mockResolvedValue({});

      const result = await handleOAuthCallback('auth-code', 'valid-state');

      expect(result.isOrgLevel).toBe(true);
      expect(mockOrgMcpOAuthTokenUpsert).toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    test('should throw when no user config exists', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue(null);

      await expect(refreshAccessToken('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'No refresh token available',
      );
    });

    test('should throw when no refresh token', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        refreshToken: null,
        user: { organizationId: 'org-123' },
        mcpServer: { organizationId: 'org-123' },
      });

      await expect(refreshAccessToken('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'No refresh token available',
      );
    });

    test('should throw when OAuth not configured', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        refreshToken: 'encrypted:refresh-token',
        user: { organizationId: 'org-123' },
        mcpServer: {
          organizationId: 'org-123',
          oauthClientRegistration: null,
        },
      });

      await expect(refreshAccessToken('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'OAuth not configured',
      );
    });

    test('should refresh token successfully', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        id: 'config-id',
        refreshToken: 'encrypted:refresh-token',
        tokenType: 'Bearer',
        tokenScope: 'read',
        user: { organizationId: 'org-123' },
        mcpServer: {
          organizationId: 'org-123',
          url: 'https://mcp.example.com',
          oauthClientRegistration: {
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });
      mockUserMcpConfigUpdate.mockResolvedValue({});

      await refreshAccessToken('org-123', 'user-123', 'server-456');

      expect(mockUserMcpConfigUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'config-id' },
          data: expect.objectContaining({
            accessToken: 'encrypted:new-access-token',
            refreshToken: 'encrypted:new-refresh-token',
          }),
        }),
      );
    });

    test('should clear tokens on refresh failure', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        id: 'config-id',
        refreshToken: 'encrypted:refresh-token',
        user: { organizationId: 'org-123' },
        mcpServer: {
          organizationId: 'org-123',
          url: 'https://mcp.example.com',
          oauthClientRegistration: {
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      mockUserMcpConfigUpdate.mockResolvedValue({});

      await expect(refreshAccessToken('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'Refresh token expired',
      );

      expect(mockUserMcpConfigUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            authenticatedAt: null,
          },
        }),
      );
    });
  });

  describe('revokeAndDisconnect', () => {
    test('should throw when user not connected', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue(null);

      await expect(revokeAndDisconnect('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'User is not connected',
      );
    });

    test('should revoke and delete config', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        id: 'config-id',
        accessToken: 'encrypted:access-token',
        user: { organizationId: 'org-123' },
        mcpServer: {
          organizationId: 'org-123',
          oauthClientRegistration: {
            revocationEndpoint: 'https://auth.example.com/revoke',
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
          },
        },
      });
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockUserMcpConfigDelete.mockResolvedValue({});

      await revokeAndDisconnect('org-123', 'user-123', 'server-456');

      expect(mockFetch).toHaveBeenCalledWith('https://auth.example.com/revoke', expect.any(Object));
      expect(mockUserMcpConfigDelete).toHaveBeenCalled();
    });

    test('should continue deletion even if revocation fails', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        id: 'config-id',
        accessToken: 'encrypted:access-token',
        user: { organizationId: 'org-123' },
        mcpServer: {
          organizationId: 'org-123',
          oauthClientRegistration: {
            revocationEndpoint: 'https://auth.example.com/revoke',
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
          },
        },
      });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockUserMcpConfigDelete.mockResolvedValue({});

      // Should not throw
      await revokeAndDisconnect('org-123', 'user-123', 'server-456');

      expect(mockUserMcpConfigDelete).toHaveBeenCalled();
    });
  });

  describe('getAccessToken', () => {
    test('should throw when not authenticated', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue(null);

      await expect(getAccessToken('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'Not authenticated',
      );
    });

    test('should return decrypted token', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        accessToken: 'encrypted:my-access-token',
        tokenType: 'Bearer',
        tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour
        refreshToken: null,
        user: { organizationId: 'org-123' },
        mcpServer: {
          organizationId: 'org-123',
          oauthClientRegistration: {},
        },
      });

      const result = await getAccessToken('org-123', 'user-123', 'server-456');

      expect(result.token).toBe('my-access-token');
      expect(result.tokenType).toBe('Bearer');
    });

    test('should proactively refresh expiring token', async () => {
      const configWithRefresh = {
        id: 'config-id',
        accessToken: 'encrypted:expiring-token',
        tokenType: 'Bearer',
        tokenExpiresAt: new Date(Date.now() + 60000), // 1 minute (within 5 min buffer)
        refreshToken: 'encrypted:refresh-token',
        tokenScope: 'read',
        user: { organizationId: 'org-123' },
        mcpServer: {
          organizationId: 'org-123',
          url: 'https://mcp.example.com',
          oauthClientRegistration: {
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        },
      };
      mockUserMcpConfigFindUnique
        .mockResolvedValueOnce(configWithRefresh) // First call in getAccessToken
        .mockResolvedValueOnce(configWithRefresh) // Call in refreshAccessToken
        .mockResolvedValueOnce({
          // Re-fetch after refresh
          accessToken: 'encrypted:new-access-token',
          tokenType: 'Bearer',
          user: { organizationId: 'org-123' },
          mcpServer: { organizationId: 'org-123' },
        });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
        }),
      });
      mockUserMcpConfigUpdate.mockResolvedValue({});

      const result = await getAccessToken('org-123', 'user-123', 'server-456');

      expect(result.token).toBe('new-access-token');
    });
  });

  describe('getConnectionStatus', () => {
    test('should return NONE when no config', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue(null);

      const result = await getConnectionStatus('org-123', 'user-123', 'server-456');

      expect(result.connected).toBe(false);
      expect(result.method).toBe('NONE');
    });

    test('should return OAUTH when access token present', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        accessToken: 'encrypted:token',
        tokenExpiresAt: new Date('2025-01-01'),
        tokenScope: 'read write',
        authenticatedAt: new Date('2024-01-01'),
        user: { organizationId: 'org-123' },
        mcpServer: { organizationId: 'org-123' },
      });

      const result = await getConnectionStatus('org-123', 'user-123', 'server-456');

      expect(result.connected).toBe(true);
      expect(result.method).toBe('OAUTH');
      expect(result.expiresAt).toEqual(new Date('2025-01-01'));
      expect(result.scope).toBe('read write');
    });

    test('should return API_KEY when only apiKey present', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        accessToken: null,
        apiKey: 'encrypted:api-key',
        authenticatedAt: new Date('2024-01-01'),
        user: { organizationId: 'org-123' },
        mcpServer: { organizationId: 'org-123' },
      });

      const result = await getConnectionStatus('org-123', 'user-123', 'server-456');

      expect(result.connected).toBe(true);
      expect(result.method).toBe('API_KEY');
    });

    test('should return NONE when no tokens', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        accessToken: null,
        apiKey: null,
        user: { organizationId: 'org-123' },
        mcpServer: { organizationId: 'org-123' },
      });

      const result = await getConnectionStatus('org-123', 'user-123', 'server-456');

      expect(result.connected).toBe(false);
      expect(result.method).toBe('NONE');
    });
  });

  describe('cleanupExpiredStates', () => {
    test('should delete expired states', async () => {
      mockOAuthStateDeleteMany.mockResolvedValue({ count: 5 });

      const result = await cleanupExpiredStates();

      expect(result).toBe(5);
      expect(mockOAuthStateDeleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    test('should return 0 when no expired states', async () => {
      mockOAuthStateDeleteMany.mockResolvedValue({ count: 0 });

      const result = await cleanupExpiredStates();

      expect(result).toBe(0);
    });
  });

  describe('getOrgOAuthStatus', () => {
    test('should return not connected when no token', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue(null);

      const result = await getOrgOAuthStatus('org-123', 'server-456');

      expect(result.connected).toBe(false);
    });

    test('should return not connected when org mismatch', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'different-org',
      });

      const result = await getOrgOAuthStatus('org-123', 'server-456');

      expect(result.connected).toBe(false);
    });

    test('should return connected status', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'org-123',
        accessToken: 'encrypted:valid-token',
        connectedBy: 'user-789',
        tokenExpiresAt: new Date('2025-01-01'),
        tokenScope: 'read write',
        authenticatedAt: new Date('2024-06-01'),
        connectedByUser: { email: 'admin@example.com' },
      });

      const result = await getOrgOAuthStatus('org-123', 'server-456');

      expect(result.connected).toBe(true);
      expect(result.connectedBy).toBe('user-789');
      expect(result.connectedByEmail).toBe('admin@example.com');
    });

    test('should return not connected when tokens have been cleared', async () => {
      // After refresh failure, accessToken is set to encrypted empty string
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'org-123',
        accessToken: 'encrypted:', // Empty string encrypted (cleared after refresh failure)
        connectedBy: 'user-789',
        authenticatedAt: new Date('2024-06-01'),
        connectedByUser: { email: 'admin@example.com' },
      });

      const result = await getOrgOAuthStatus('org-123', 'server-456');

      expect(result.connected).toBe(false);
    });
  });

  describe('getOrgAccessToken', () => {
    test('should throw when no org token', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue(null);

      await expect(getOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'No org-level OAuth token',
      );
    });

    test('should throw on org mismatch', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'different-org',
      });

      await expect(getOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'No org-level OAuth token',
      );
    });

    test('should return decrypted token', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'org-123',
        accessToken: 'encrypted:org-token',
        tokenType: 'Bearer',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        refreshToken: null,
        mcpServer: {
          oauthClientRegistration: {},
        },
      });

      const result = await getOrgAccessToken('org-123', 'server-456');

      expect(result.token).toBe('org-token');
      expect(result.tokenType).toBe('Bearer');
    });
  });

  describe('refreshOrgAccessToken', () => {
    test('should throw when no org token', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue(null);

      await expect(refreshOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'No org-level OAuth token found',
      );
    });

    test('should throw when no refresh token', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'org-123',
        refreshToken: null,
        mcpServer: { oauthClientRegistration: {} },
      });

      await expect(refreshOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'No refresh token available',
      );
    });

    test('should refresh org token successfully', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        id: 'token-id',
        organizationId: 'org-123',
        refreshToken: 'encrypted:refresh-token',
        tokenType: 'Bearer',
        tokenScope: 'read',
        mcpServer: {
          url: 'https://mcp.example.com',
          oauthClientRegistration: {
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-org-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });
      mockOrgMcpOAuthTokenUpdate.mockResolvedValue({});

      await refreshOrgAccessToken('org-123', 'server-456');

      expect(mockOrgMcpOAuthTokenUpdate).toHaveBeenCalled();
      const updateCall = mockOrgMcpOAuthTokenUpdate.mock.calls[0][0];
      expect(updateCall.where.id).toBe('token-id');
      expect(updateCall.data.accessToken).toBe('encrypted:new-org-token');
    });

    test('should clear tokens on refresh failure', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        id: 'token-id',
        organizationId: 'org-123',
        refreshToken: 'encrypted:refresh-token',
        tokenType: 'Bearer',
        mcpServer: {
          url: 'https://mcp.example.com',
          oauthClientRegistration: {
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      mockOrgMcpOAuthTokenUpdate.mockResolvedValue({});

      await expect(refreshOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'Refresh token expired',
      );

      // Verify tokens were cleared
      expect(mockOrgMcpOAuthTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-id' },
          data: expect.objectContaining({
            accessToken: 'encrypted:', // Empty string encrypted
            refreshToken: null,
            tokenExpiresAt: null,
          }),
        }),
      );
    });
  });

  describe('revokeAndDisconnectOrg', () => {
    test('should throw when org not connected', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue(null);

      await expect(revokeAndDisconnectOrg('org-123', 'server-456')).rejects.toThrow(
        'Organization is not connected',
      );
    });

    test('should throw on org mismatch', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'different-org',
      });

      await expect(revokeAndDisconnectOrg('org-123', 'server-456')).rejects.toThrow(
        'Organization is not connected',
      );
    });

    test('should revoke and delete org token', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'org-123',
        accessToken: 'encrypted:org-token',
        mcpServer: {
          oauthClientRegistration: {
            revocationEndpoint: 'https://auth.example.com/revoke',
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
          },
        },
      });
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockOrgMcpOAuthTokenDelete.mockResolvedValue({});

      await revokeAndDisconnectOrg('org-123', 'server-456');

      expect(mockFetch).toHaveBeenCalled();
      expect(mockOrgMcpOAuthTokenDelete).toHaveBeenCalled();
    });

    test('should continue deletion even if revocation fails', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'org-123',
        accessToken: 'encrypted:org-token',
        mcpServer: {
          oauthClientRegistration: {
            revocationEndpoint: 'https://auth.example.com/revoke',
            clientId: 'client-123',
            clientSecret: 'encrypted:secret',
          },
        },
      });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockOrgMcpOAuthTokenDelete.mockResolvedValue({});

      await revokeAndDisconnectOrg('org-123', 'server-456');

      expect(mockOrgMcpOAuthTokenDelete).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getConnectionStatus - organization validation coverage (lines 711-716)
  // ============================================================================
  describe('getConnectionStatus - organization validation', () => {
    test('should throw when user org does not match requested org', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        accessToken: 'encrypted:token',
        user: { organizationId: 'different-org' }, // User belongs to different org
        mcpServer: { organizationId: 'org-123' },
      });

      await expect(getConnectionStatus('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'User does not belong to the specified organization',
      );
    });

    test('should throw when server org does not match requested org', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        accessToken: 'encrypted:token',
        user: { organizationId: 'org-123' },
        mcpServer: { organizationId: 'different-org' }, // Server belongs to different org
      });

      await expect(getConnectionStatus('org-123', 'user-123', 'server-456')).rejects.toThrow(
        'MCP server does not belong to the specified organization',
      );
    });

    test('should succeed when user and server both belong to same org', async () => {
      mockUserMcpConfigFindUnique.mockResolvedValue({
        accessToken: 'encrypted:token',
        tokenExpiresAt: new Date('2025-01-01'),
        tokenScope: 'read',
        authenticatedAt: new Date('2024-01-01'),
        user: { organizationId: 'org-123' },
        mcpServer: { organizationId: 'org-123' },
      });

      const result = await getConnectionStatus('org-123', 'user-123', 'server-456');

      expect(result.connected).toBe(true);
      expect(result.method).toBe('OAUTH');
    });
  });

  // ============================================================================
  // getOrgAccessToken - proactive refresh coverage (lines 823-838)
  // ============================================================================
  describe('getOrgAccessToken - proactive token refresh', () => {
    test('should proactively refresh expiring org token', async () => {
      // First call: token needs refresh
      mockOrgMcpOAuthTokenFindUnique
        .mockResolvedValueOnce({
          id: 'token-id',
          organizationId: 'org-123',
          accessToken: 'encrypted:expiring-token',
          tokenType: 'Bearer',
          tokenExpiresAt: new Date(Date.now() + 60000), // 1 minute - within 5 min buffer
          refreshToken: 'encrypted:refresh-token',
          tokenScope: 'read',
          mcpServer: {
            url: 'https://mcp.example.com',
            oauthClientRegistration: {
              clientId: 'client-123',
              clientSecret: 'encrypted:secret',
              tokenEndpoint: 'https://auth.example.com/token',
            },
          },
        })
        // Call in refreshOrgAccessToken
        .mockResolvedValueOnce({
          id: 'token-id',
          organizationId: 'org-123',
          refreshToken: 'encrypted:refresh-token',
          tokenType: 'Bearer',
          tokenScope: 'read',
          mcpServer: {
            url: 'https://mcp.example.com',
            oauthClientRegistration: {
              clientId: 'client-123',
              clientSecret: 'encrypted:secret',
              tokenEndpoint: 'https://auth.example.com/token',
            },
          },
        })
        // Re-fetch after refresh
        .mockResolvedValueOnce({
          accessToken: 'encrypted:new-org-token',
          tokenType: 'Bearer',
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-org-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });
      mockOrgMcpOAuthTokenUpdate.mockResolvedValue({});

      const result = await getOrgAccessToken('org-123', 'server-456');

      expect(result.token).toBe('new-org-token');
      expect(result.tokenType).toBe('Bearer');
    });

    test('should throw when refresh succeeds but re-fetch returns no token', async () => {
      // First call: token needs refresh
      mockOrgMcpOAuthTokenFindUnique
        .mockResolvedValueOnce({
          id: 'token-id',
          organizationId: 'org-123',
          accessToken: 'encrypted:expiring-token',
          tokenType: 'Bearer',
          tokenExpiresAt: new Date(Date.now() + 60000), // 1 minute
          refreshToken: 'encrypted:refresh-token',
          mcpServer: {
            url: 'https://mcp.example.com',
            oauthClientRegistration: {
              clientId: 'client-123',
              clientSecret: 'encrypted:secret',
              tokenEndpoint: 'https://auth.example.com/token',
            },
          },
        })
        // Call in refreshOrgAccessToken
        .mockResolvedValueOnce({
          id: 'token-id',
          organizationId: 'org-123',
          refreshToken: 'encrypted:refresh-token',
          mcpServer: {
            url: 'https://mcp.example.com',
            oauthClientRegistration: {
              clientId: 'client-123',
              clientSecret: 'encrypted:secret',
              tokenEndpoint: 'https://auth.example.com/token',
            },
          },
        })
        // Re-fetch after refresh returns null
        .mockResolvedValueOnce(null);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          expires_in: 3600,
        }),
      });
      mockOrgMcpOAuthTokenUpdate.mockResolvedValue({});

      await expect(getOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'Org token refresh failed - please reconnect',
      );
    });

    test('should throw when refresh succeeds but re-fetch returns empty accessToken', async () => {
      // First call: token needs refresh
      mockOrgMcpOAuthTokenFindUnique
        .mockResolvedValueOnce({
          id: 'token-id',
          organizationId: 'org-123',
          accessToken: 'encrypted:expiring-token',
          tokenType: 'Bearer',
          tokenExpiresAt: new Date(Date.now() + 60000),
          refreshToken: 'encrypted:refresh-token',
          mcpServer: {
            url: 'https://mcp.example.com',
            oauthClientRegistration: {
              clientId: 'client-123',
              clientSecret: 'encrypted:secret',
              tokenEndpoint: 'https://auth.example.com/token',
            },
          },
        })
        // Call in refreshOrgAccessToken
        .mockResolvedValueOnce({
          id: 'token-id',
          organizationId: 'org-123',
          refreshToken: 'encrypted:refresh-token',
          mcpServer: {
            url: 'https://mcp.example.com',
            oauthClientRegistration: {
              clientId: 'client-123',
              clientSecret: 'encrypted:secret',
              tokenEndpoint: 'https://auth.example.com/token',
            },
          },
        })
        // Re-fetch after refresh returns token without accessToken
        .mockResolvedValueOnce({
          accessToken: null, // Token was cleared
          tokenType: 'Bearer',
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          expires_in: 3600,
        }),
      });
      mockOrgMcpOAuthTokenUpdate.mockResolvedValue({});

      await expect(getOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'Org token refresh failed - please reconnect',
      );
    });

    test('should return non-expiring token without refresh', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValueOnce({
        organizationId: 'org-123',
        accessToken: 'encrypted:valid-token',
        tokenType: 'Bearer',
        tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        refreshToken: 'encrypted:refresh-token',
        mcpServer: {
          oauthClientRegistration: {},
        },
      });

      const result = await getOrgAccessToken('org-123', 'server-456');

      expect(result.token).toBe('valid-token');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should return token without expiry date without refresh', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValueOnce({
        organizationId: 'org-123',
        accessToken: 'encrypted:no-expiry-token',
        tokenType: 'Bearer',
        tokenExpiresAt: null, // No expiry set
        refreshToken: 'encrypted:refresh-token',
        mcpServer: {
          oauthClientRegistration: {},
        },
      });

      const result = await getOrgAccessToken('org-123', 'server-456');

      expect(result.token).toBe('no-expiry-token');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // refreshOrgAccessToken - additional edge cases
  // ============================================================================
  describe('refreshOrgAccessToken - edge cases', () => {
    test('should throw when OAuth not configured', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'org-123',
        refreshToken: 'encrypted:refresh-token',
        mcpServer: {
          oauthClientRegistration: null, // OAuth not configured
        },
      });

      await expect(refreshOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'OAuth not configured',
      );
    });

    test('should handle org mismatch during refresh', async () => {
      mockOrgMcpOAuthTokenFindUnique.mockResolvedValue({
        organizationId: 'different-org', // Mismatch
        refreshToken: 'encrypted:refresh-token',
        mcpServer: { oauthClientRegistration: {} },
      });

      await expect(refreshOrgAccessToken('org-123', 'server-456')).rejects.toThrow(
        'No org-level OAuth token found',
      );
    });
  });
});
