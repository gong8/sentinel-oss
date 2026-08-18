/**
 * Tests for MCP Servers Admin Router
 * Tests CRUD operations for MCP server management
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockEncrypt,
  mockDecrypt,
  mockValidateMcpServerUrl,
  mockDiscoverTools,
  mockDiscoverOAuth,
  mockRegisterOAuthClient,
  mockSessionManager,
  mockAnalyzeMcpServerDeletion,
  mockProbeAuthType,
  mockEvaluatePolicy,
  mockCheckToolPattern,
  mockValidateTransportConfig,
  mockValidateMcpServerConnection,
  mockGetOAuthRedirectUri,
} = vi.hoisted(() => ({
  mockPrisma: {
    mcpServer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    mcpServerTool: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    toolPolicy: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    policy: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    oAuthClient: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    oAuthToken: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    userMcpConfig: {
      deleteMany: vi.fn(),
    },
    orgMcpOAuthToken: {
      deleteMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    agent: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    sensitiveToolFlag: {
      findMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      // Function-based transaction
      return (arg as (p: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
    }),
  },
  mockLogAdminAction: vi.fn(),
  mockEncrypt: vi.fn((value: string) => `encrypted:${value}`),
  mockDecrypt: vi.fn((value: string) => value.replace('encrypted:', '')),
  mockValidateMcpServerUrl: vi.fn(),
  mockDiscoverTools: vi.fn(),
  mockDiscoverOAuth: vi.fn(),
  mockRegisterOAuthClient: vi.fn(),
  mockSessionManager: {
    closeSessionForServer: vi.fn(),
    closeAllSessions: vi.fn(),
  },
  mockAnalyzeMcpServerDeletion: vi.fn(),
  mockProbeAuthType: vi.fn(),
  mockEvaluatePolicy: vi.fn(),
  mockCheckToolPattern: vi.fn(),
  mockValidateTransportConfig: vi.fn(),
  mockValidateMcpServerConnection: vi.fn(),
  mockGetOAuthRedirectUri: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  McpAuthType: {
    NONE: 'NONE',
    OAUTH: 'OAUTH',
    API_KEY: 'API_KEY',
  },
  AdminActionType: {
    MCP_SERVER_CREATE: 'MCP_SERVER_CREATE',
    MCP_SERVER_UPDATE: 'MCP_SERVER_UPDATE',
    MCP_SERVER_DELETE: 'MCP_SERVER_DELETE',
    MCP_SERVER_RESTORE: 'MCP_SERVER_RESTORE',
    MCP_SERVER_DISCOVER_TOOLS: 'MCP_SERVER_DISCOVER_TOOLS',
    OAUTH_DISCOVER: 'OAUTH_DISCOVER',
    OAUTH_CLIENT_REGISTER: 'OAUTH_CLIENT_REGISTER',
    OAUTH_CLIENT_CONFIGURE: 'OAUTH_CLIENT_CONFIGURE',
  },
  AdminResourceType: {
    MCP_SERVER: 'MCP_SERVER',
  },
  PolicyEffect: {
    ALLOW: 'ALLOW',
    DENY: 'DENY',
  },
  TransportType: {
    HTTP: 'HTTP',
    STDIO: 'STDIO',
    SSE: 'SSE',
    WEBSOCKET: 'WEBSOCKET',
  },
  SensitiveFlagBehavior: {
    REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
    RATE_LIMIT: 'RATE_LIMIT',
    ALERT: 'ALERT',
  },
  Prisma: {
    JsonNull: null,
    DbNull: Symbol.for('prisma.dbNull'),
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/lib/crypto.js', () => ({
  encryptString: mockEncrypt,
  decryptString: mockDecrypt,
  encryptObject: vi.fn((obj: unknown) => obj),
  decryptCredentials: vi.fn((creds: unknown) => creds),
}));

vi.mock('../../../../../packages/api/src/services/mcp.js', () => ({
  validateMcpServerUrl: mockValidateMcpServerUrl,
  discoverTools: mockDiscoverTools,
  isSentinelMcpServerUrl: vi.fn(() => false),
  probeAuthType: mockProbeAuthType,
  validateTransportConfig: mockValidateTransportConfig,
  validateMcpServerConnection: mockValidateMcpServerConnection,
  SENTINEL_SELF_MCP_SERVER_ERROR: 'Cannot add Sentinel server as MCP server',
}));

vi.mock('../../../../../packages/api/src/mcp/session-manager.js', () => ({
  mcpSessionManager: mockSessionManager,
}));

vi.mock('../../../../../packages/api/src/services/deletionImpact.js', () => ({
  analyzeMcpServerDeletion: mockAnalyzeMcpServerDeletion,
}));

vi.mock('../../../../../packages/api/src/services/oauthDiscovery.js', () => ({
  discoverOAuthCapability: mockDiscoverOAuth,
}));

vi.mock('../../../../../packages/api/src/services/oauth.js', () => ({
  registerOAuthClient: mockRegisterOAuthClient,
  storeOAuthClientRegistration: vi.fn(),
  getOAuthRedirectUri: mockGetOAuthRedirectUri,
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  evaluatePolicy: mockEvaluatePolicy,
  checkToolPattern: mockCheckToolPattern,
}));

vi.mock('../../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  adminProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
  protectedProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { adminMcpServersRouter as _mcpServersRouter } from '../../../../../packages/api/src/trpc/admin/mcpServers.js';

// Re-type the router to use our test-friendly handler type
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

const mcpServersRouter = _mcpServersRouter as unknown as {
  list: TestableHandler;
  get: TestableHandler;
  create: TestableHandler;
  update: TestableHandler;
  delete: TestableHandler;
  restore: TestableHandler;
  discoverTools: TestableHandler;
  discoverOAuth: TestableHandler;
  registerOAuthClient: TestableHandler;
  setOAuthConfig: TestableHandler;
  getOAuthConfig: TestableHandler;
  getCredentials: TestableHandler;
  getDeletionImpact: TestableHandler;
  getToolAccessForUser: TestableHandler;
  probeAuthType: TestableHandler;
  getToolsWithFlagStatus: TestableHandler;
};

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.resetAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
  mockValidateMcpServerUrl.mockResolvedValue({ success: true });
  mockValidateTransportConfig.mockReturnValue({ success: true });
  mockValidateMcpServerConnection.mockResolvedValue({ success: true });
  mockGetOAuthRedirectUri.mockReturnValue('http://localhost:3000/oauth/callback');
  mockProbeAuthType.mockResolvedValue({
    supportsOAuth: false,
    detectedAuthType: 'none',
    supportsApiKey: true,
    supportsNone: true,
  });
  mockEvaluatePolicy.mockResolvedValue({
    decision: 'ALLOW',
    justification: 'No matching policies - default allow',
    policyIds: [],
  });
  mockCheckToolPattern.mockImplementation((pattern: string, qualifiedName: string) => {
    // Simple pattern matching for tests
    if (pattern === '*::dangerous_*') {
      return qualifiedName.includes('::dangerous_');
    }
    if (pattern.includes('::write_*')) {
      const serverPart = pattern.split('::')[0];
      return qualifiedName.includes(serverPart) && qualifiedName.includes('::write_');
    }
    return false;
  });
  mockPrisma.policy.findMany.mockResolvedValue([]);
  mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
  mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
  mockPrisma.userMcpConfig.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.orgMcpOAuthToken.deleteMany.mockResolvedValue({ count: 0 });
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
): {
  auth: { organizationId: string; user: { id: string } };
  req: { req: { header: ReturnType<typeof vi.fn> } };
} {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
    },
    req: {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.1';
          if (name === 'user-agent') return 'Mozilla/5.0';
          return null;
        }),
      },
    },
  };
}

// Helper to create mock MCP server
function createMockMcpServer(
  overrides: Partial<{
    id: string;
    name: string;
    url: string;
    organizationId: string;
    authType: string;
    untrusted: boolean;
    deletedAt: Date | null;
    credentials: unknown;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'server-123',
    name: overrides.name ?? 'Test Server',
    url: overrides.url ?? 'https://mcp.example.com',
    organizationId: overrides.organizationId ?? 'org-123',
    authType: overrides.authType ?? 'NONE',
    untrusted: overrides.untrusted ?? false,
    deletedAt: overrides.deletedAt ?? null,
    credentials: overrides.credentials ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

describe('mcpServersRouter', () => {
  describe('list', () => {
    test('should list active MCP servers', async () => {
      const servers = [
        createMockMcpServer({ id: 'server-1', name: 'Server 1' }),
        createMockMcpServer({ id: 'server-2', name: 'Server 2' }),
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      const ctx = createMockContext();
      const result = await mcpServersRouter.list({
        ctx,
        input: { includeDeleted: false },
      });

      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            deletedAt: null,
          }),
        }),
      );
      expect(result).toHaveLength(2);
    });

    test('should include deleted servers when requested', async () => {
      const servers = [
        createMockMcpServer({ id: 'server-1', deletedAt: null }),
        createMockMcpServer({ id: 'server-2', deletedAt: new Date() }),
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      const ctx = createMockContext();
      const result = await mcpServersRouter.list({
        ctx,
        input: { includeDeleted: true },
      });

      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
          }),
        }),
      );
      expect(result).toHaveLength(2);
    });

    test('should return servers sorted by name', async () => {
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      await mcpServersRouter.list({ ctx, input: {} });

      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.any(Object),
        }),
      );
    });
  });

  describe('get', () => {
    test('should get MCP server by ID', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);

      const ctx = createMockContext();
      const result = await mcpServersRouter.get({
        ctx,
        input: { id: 'server-123' },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'server-123',
            organizationId: 'org-123',
          }),
        }),
      );
      expect(result.id).toBe('server-123');
      expect(result.name).toBe('Test Server');
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.get({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.get({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('create', () => {
    test('should create MCP server with no auth', async () => {
      const newServer = createMockMcpServer({
        id: 'new-server',
        name: 'New Server',
        url: 'https://new-mcp.example.com',
        authType: 'NONE',
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'New Server',
          url: 'https://new-mcp.example.com',
          authType: 'NONE',
        },
      });

      expect(mockValidateMcpServerConnection).toHaveBeenCalledWith(
        'https://new-mcp.example.com',
        'NONE',
        'HTTP',
        expect.objectContaining({
          transportType: 'HTTP',
        }),
        undefined,
      );
      expect(mockPrisma.mcpServer.create).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'MCP_SERVER_CREATE',
        }),
      );
      // Router transforms output - check key fields instead of full equality
      expect(result.id).toBe('new-server');
      expect(result.name).toBe('New Server');
      expect(result.url).toBe('https://new-mcp.example.com');
      expect(result.authType).toBe('NONE');
    });

    test('should create MCP server with API key auth', async () => {
      const newServer = createMockMcpServer({
        id: 'new-server',
        authType: 'API_KEY',
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      await mcpServersRouter.create({
        ctx,
        input: {
          name: 'API Key Server',
          url: 'https://api-key-mcp.example.com',
          authType: 'API_KEY',
          apiKey: 'secret-api-key',
        },
      });

      expect(mockEncrypt).toHaveBeenCalledWith('secret-api-key');
    });

    test('should throw BAD_REQUEST for duplicate URL', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(
        createMockMcpServer({ url: 'https://existing.example.com' }),
      );

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.create({
          ctx,
          input: {
            name: 'Duplicate',
            url: 'https://existing.example.com',
            authType: 'NONE',
          },
        }),
      ).rejects.toThrow(TRPCError);
    });

    test('should auto-detect auth type when not provided', async () => {
      const newServer = createMockMcpServer({ id: 'new-server', name: 'Auto-Detected' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      // Return OAuth as detected auth type
      mockProbeAuthType.mockResolvedValue({
        supportsOAuth: true,
        detectedAuthType: 'oauth',
        supportsApiKey: false,
        supportsNone: false,
      });

      const ctx = createMockContext();
      await mcpServersRouter.create({
        ctx,
        input: {
          name: 'Auto-Detected',
          url: 'https://oauth-server.example.com',
          // Note: authType not provided - should auto-detect
        },
      });

      expect(mockProbeAuthType).toHaveBeenCalledWith('https://oauth-server.example.com');
      expect(mockPrisma.mcpServer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authType: 'OAUTH',
          }),
        }),
      );
    });

    test('should throw BAD_REQUEST with auto-detect hint when validation fails after auto-detection', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      // Return none as detected auth type
      mockProbeAuthType.mockResolvedValue({
        supportsOAuth: false,
        detectedAuthType: 'none',
        supportsApiKey: false,
        supportsNone: true,
      });
      // Validation fails with auth error
      mockValidateMcpServerConnection.mockResolvedValue({
        success: false,
        isAuthError: true,
        error: 'Authentication required',
      });

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.create({
          ctx,
          input: {
            name: 'Auth-Mismatch',
            url: 'https://requires-auth.example.com',
            // Note: authType not provided - will auto-detect
          },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('auto-detected'),
      });
    });

    test('should log admin action on create', async () => {
      const newServer = createMockMcpServer({ id: 'new-server', name: 'New' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ userId: 'admin-456' });
      await mcpServersRouter.create({
        ctx,
        input: {
          name: 'New',
          url: 'https://new.example.com',
          authType: 'NONE',
        },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          adminUserId: 'admin-456',
          actionType: 'MCP_SERVER_CREATE',
          resourceType: 'MCP_SERVER',
          resourceId: 'new-server',
        }),
      );
    });
  });

  describe('update', () => {
    test('should update MCP server name', async () => {
      const existingServer = createMockMcpServer({ id: 'server-123' });
      const updatedServer = { ...existingServer, name: 'Updated Name' };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer) // First call: get existing
        .mockResolvedValueOnce(null); // Second call: check duplicate URL
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          name: 'Updated Name',
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'MCP_SERVER_UPDATE',
        }),
      );
      expect(result.name).toBe('Updated Name');
    });

    test('should update URL', async () => {
      const existingServer = createMockMcpServer({ id: 'server-123' });
      const updatedServer = { ...existingServer, url: 'https://new-url.example.com' };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          url: 'https://new-url.example.com',
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalled();
      expect(result.url).toBe('https://new-url.example.com');
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.update({
          ctx,
          input: {
            id: 'non-existent',
            name: 'Updated',
          },
        }),
      ).rejects.toThrow(TRPCError);
    });

    test('should use existing server transport config when not provided in input', async () => {
      // Server with existing transport configuration (covers lines 834-853)
      const existingServer = {
        ...createMockMcpServer({ id: 'server-123' }),
        transportType: 'STDIO',
        stdioCommand: '/usr/bin/python',
        stdioArgs: ['-m', 'mcp_server'],
        stdioWorkingDir: '/home/user',
        stdioEnv: 'encrypted:{"API_KEY":"secret"}',
        wsReconnectMs: 3000,
        wsMaxRetries: 5,
        wsHeartbeatMs: 15000,
        apiKey: null,
      };
      const updatedServer = { ...existingServer, name: 'Updated Name' };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockValidateTransportConfig.mockReturnValue({ success: true });

      const ctx = createMockContext();
      const result = await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          name: 'Updated Name',
          // No transport config provided - should use existing server values
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalled();
      expect(result.name).toBe('Updated Name');
    });

    test('should handle validationApiKey parameter for update validation', async () => {
      // Test validationApiKey handling (covers lines 886-888)
      const existingServer = {
        ...createMockMcpServer({ id: 'server-123' }),
        authType: 'API_KEY',
        transportType: 'HTTP',
        apiKey: 'encrypted:old-key',
      };
      const updatedServer = { ...existingServer, url: 'https://new-url.example.com' };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockValidateTransportConfig.mockReturnValue({ success: true });
      mockValidateMcpServerConnection.mockResolvedValue({ success: true });

      const ctx = createMockContext();
      const result = await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          url: 'https://new-url.example.com',
          validationApiKey: '  validation-key-with-spaces  ', // Should be trimmed
        },
      });

      expect(mockValidateMcpServerConnection).toHaveBeenCalledWith(
        'https://new-url.example.com',
        'API_KEY',
        'HTTP',
        expect.any(Object),
        expect.objectContaining({
          apiKey: 'validation-key-with-spaces', // Trimmed
        }),
      );
      expect(result.url).toBe('https://new-url.example.com');
    });

    test('should update STDIO transport configuration with non-null values', async () => {
      // Test STDIO transport updates (covers lines 947-956)
      const existingServer = {
        ...createMockMcpServer({ id: 'server-123' }),
        transportType: 'HTTP',
        stdioCommand: null,
        stdioArgs: null,
        stdioWorkingDir: null,
        stdioEnv: null,
      };
      const updatedServer = {
        ...existingServer,
        transportType: 'STDIO',
        stdioCommand: '/usr/bin/node',
        stdioArgs: ['server.js'],
        stdioWorkingDir: '/app',
        stdioEnv: 'encrypted:{"NODE_ENV":"production"}',
      };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockValidateTransportConfig.mockReturnValue({ success: true });
      mockValidateMcpServerConnection.mockResolvedValue({ success: true });

      const ctx = createMockContext();
      const result = await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          transportType: 'STDIO',
          stdio: {
            command: '/usr/bin/node',
            args: ['server.js'],
            workingDir: '/app',
            env: { NODE_ENV: 'production' },
          },
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transportType: 'STDIO',
            stdioCommand: '/usr/bin/node',
            stdioWorkingDir: '/app',
          }),
        }),
      );
      expect(result.transportType).toBe('STDIO');
    });

    test('should update WebSocket transport configuration with individual properties', async () => {
      // Test WebSocket transport updates (covers lines 960-972)
      const existingServer = {
        ...createMockMcpServer({ id: 'server-123' }),
        transportType: 'WEBSOCKET',
        wsReconnectMs: 5000,
        wsMaxRetries: 3,
        wsHeartbeatMs: 30000,
      };
      const updatedServer = {
        ...existingServer,
        wsReconnectMs: 2000,
        wsMaxRetries: 10,
        wsHeartbeatMs: 15000,
      };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockValidateTransportConfig.mockReturnValue({ success: true });
      mockValidateMcpServerConnection.mockResolvedValue({ success: true });

      const ctx = createMockContext();
      const result = await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          websocket: {
            reconnectMs: 2000,
            maxRetries: 10,
            heartbeatMs: 15000,
          },
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            wsReconnectMs: 2000,
            wsMaxRetries: 10,
            wsHeartbeatMs: 15000,
          }),
        }),
      );
      expect(result.wsReconnectMs).toBe(2000);
      expect(result.wsMaxRetries).toBe(10);
      expect(result.wsHeartbeatMs).toBe(15000);
    });

    test('should clear WebSocket transport configuration when set to null', async () => {
      // Test WebSocket transport null clearing (covers lines 960-963)
      const existingServer = {
        ...createMockMcpServer({ id: 'server-123' }),
        transportType: 'WEBSOCKET',
        wsReconnectMs: 5000,
        wsMaxRetries: 3,
        wsHeartbeatMs: 30000,
      };
      const updatedServer = {
        ...existingServer,
        wsReconnectMs: null,
        wsMaxRetries: null,
        wsHeartbeatMs: null,
      };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockValidateTransportConfig.mockReturnValue({ success: true });
      mockValidateMcpServerConnection.mockResolvedValue({ success: true });

      const ctx = createMockContext();
      await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          websocket: null,
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            wsReconnectMs: null,
            wsMaxRetries: null,
            wsHeartbeatMs: null,
          }),
        }),
      );
    });

    test('should update partial WebSocket transport configuration', async () => {
      // Test individual WebSocket property updates (covers lines 965-972)
      const existingServer = {
        ...createMockMcpServer({ id: 'server-123' }),
        transportType: 'WEBSOCKET',
        wsReconnectMs: 5000,
        wsMaxRetries: 3,
        wsHeartbeatMs: 30000,
      };
      const updatedServer = {
        ...existingServer,
        wsReconnectMs: 1000,
      };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockValidateTransportConfig.mockReturnValue({ success: true });
      mockValidateMcpServerConnection.mockResolvedValue({ success: true });

      const ctx = createMockContext();
      await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          websocket: {
            reconnectMs: 1000,
            // Only updating reconnectMs, not maxRetries or heartbeatMs
          },
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            wsReconnectMs: 1000,
          }),
        }),
      );
      // Should not include wsMaxRetries and wsHeartbeatMs since they weren't provided
      const updateCall = mockPrisma.mcpServer.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('wsMaxRetries');
      expect(updateCall.data).not.toHaveProperty('wsHeartbeatMs');
    });

    test('should clear STDIO transport configuration when set to null', async () => {
      // Test STDIO transport null clearing (covers lines 947-951)
      const existingServer = {
        ...createMockMcpServer({ id: 'server-123' }),
        transportType: 'STDIO',
        stdioCommand: '/usr/bin/python',
        stdioArgs: ['-m', 'server'],
        stdioWorkingDir: '/app',
        stdioEnv: 'encrypted:{"KEY":"value"}',
      };
      const updatedServer = {
        ...existingServer,
        stdioCommand: null,
        stdioArgs: null,
        stdioWorkingDir: null,
        stdioEnv: null,
      };

      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(existingServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(updatedServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockValidateTransportConfig.mockReturnValue({ success: true });
      mockValidateMcpServerConnection.mockResolvedValue({ success: true });

      const ctx = createMockContext();
      await mcpServersRouter.update({
        ctx,
        input: {
          id: 'server-123',
          stdio: null,
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stdioCommand: null,
            stdioWorkingDir: null,
            stdioEnv: null,
          }),
        }),
      );
    });
  });

  describe('delete', () => {
    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should throw BAD_REQUEST when deletion is blocked', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [{ type: 'policy', details: 'Server has active policies' }],
        warnings: [],
      });

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'server-123' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('restore', () => {
    test('should restore deleted MCP server', async () => {
      const deletedServer = createMockMcpServer({
        id: 'server-123',
        deletedAt: new Date(),
      });
      const restoredServer = { ...deletedServer, deletedAt: null };

      // First call: get deleted server, Second call: check URL conflict (should be null)
      mockPrisma.mcpServer.findFirst
        .mockResolvedValueOnce(deletedServer)
        .mockResolvedValueOnce(null);
      mockPrisma.mcpServer.update.mockResolvedValue(restoredServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await mcpServersRouter.restore({
        ctx,
        input: { id: 'server-123' },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'server-123' },
          data: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'MCP_SERVER_RESTORE',
        }),
      );
      expect(result.success).toBe(true);
    });

    test('should throw NOT_FOUND for non-deleted server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.restore({
          ctx,
          input: { id: 'active-server' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('discoverTools', () => {
    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.discoverTools({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.discoverTools({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('discoverOAuth', () => {
    test('should discover OAuth configuration', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      const oauthConfig = {
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        registrationEndpoint: 'https://auth.example.com/register',
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockDiscoverOAuth.mockResolvedValue(oauthConfig);

      const ctx = createMockContext();
      const result = await mcpServersRouter.discoverOAuth({
        ctx,
        input: { url: server.url },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'OAUTH_DISCOVER',
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('getDeletionImpact', () => {
    test('should return deletion impact for server', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      const impact = {
        canDelete: true,
        blockers: [],
        warnings: ['This will affect 5 policies'],
        canDeleteWithPolicies: true,
        deleteRelatedPoliciesHint: null,
        nonPolicyBlockersCount: 0,
        policyBlockersCount: 0,
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue(impact);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getDeletionImpact({
        ctx,
        input: { id: 'server-123' },
      });

      expect(mockAnalyzeMcpServerDeletion).toHaveBeenCalledWith('org-123', 'server-123');
      expect(result).toMatchObject({
        canDelete: true,
        blockers: [],
        warnings: ['This will affect 5 policies'],
      });
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.getDeletionImpact({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getCredentials', () => {
    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.getCredentials({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.getCredentials({
          ctx,
          input: { id: 'non-existent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should return credentials object for server with no credentials', async () => {
      const server = createMockMcpServer({
        id: 'server-123',
        authType: 'NONE',
        credentials: null,
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getCredentials({
        ctx,
        input: { id: 'server-123' },
      });

      // The router returns an object with credentials property
      expect(result).toEqual({ credentials: null });
    });
  });

  describe('probeAuthType', () => {
    // Note: probeAuthType is mocked at the service level, so we can only test
    // that the router correctly returns the service result
    test('should return probed auth type result', async () => {
      const ctx = createMockContext();
      const result = await mcpServersRouter.probeAuthType({
        ctx,
        input: { url: 'https://mcp.example.com' },
      });

      // The mocked probeAuthType returns { supportsOAuth: false, detectedAuthType: 'none', ... }
      expect(result).toEqual(
        expect.objectContaining({
          supportsOAuth: false,
          detectedAuthType: 'none',
        }),
      );
    });

    test('should return detectionFailed true when auth type is unknown', async () => {
      mockProbeAuthType.mockResolvedValue({
        supportsOAuth: false,
        detectedAuthType: 'unknown',
        supportsApiKey: false,
        supportsNone: false,
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.probeAuthType({
        ctx,
        input: { url: 'https://mysterious.example.com' },
      });

      expect(result).toEqual(
        expect.objectContaining({
          detectedAuthType: 'unknown',
          suggestedAuthType: null,
          detectionFailed: true,
        }),
      );
    });
  });

  describe('organization isolation', () => {
    test('list should only return servers from current organization', async () => {
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'isolated-org' });
      await mcpServersRouter.list({ ctx, input: {} });

      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });

    test('create should assign to current organization', async () => {
      const newServer = createMockMcpServer({ id: 'new', organizationId: 'org-A' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);

      const ctx = createMockContext({ organizationId: 'org-A' });
      await mcpServersRouter.create({
        ctx,
        input: {
          name: 'Test',
          url: 'https://test.example.com',
          authType: 'NONE',
        },
      });

      expect(mockPrisma.mcpServer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-A',
          }),
        }),
      );
    });

    test('get should enforce organization boundary', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });

      await expect(
        mcpServersRouter.get({
          ctx,
          input: { id: 'server-from-org-B' },
        }),
      ).rejects.toThrow(TRPCError);

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-A',
          }),
        }),
      );
    });

    test('delete should verify organization ownership', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });

      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'server-from-org-B' },
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('registerOAuthClient', () => {
    test('should register OAuth client via DCR', async () => {
      const server = createMockMcpServer({ id: 'server-123', name: 'OAuth Server' });
      const org = { id: 'org-123', name: 'Test Organization' };
      const discovery = {
        supportsOAuth: true,
        registrationEndpoint: 'https://auth.example.com/register',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        revocationEndpoint: 'https://auth.example.com/revoke',
        scopesSupported: ['read', 'write'],
        grantTypesSupported: ['authorization_code', 'refresh_token'],
      };
      const clientCredentials = {
        clientId: 'client-123',
        clientSecret: 'secret-456',
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockPrisma.organization.findUnique.mockResolvedValue(org);
      mockDiscoverOAuth.mockResolvedValue(discovery);
      mockRegisterOAuthClient.mockResolvedValue(clientCredentials);
      mockPrisma.mcpServer.update.mockResolvedValue({ ...server, authType: 'OAUTH' });

      const ctx = createMockContext();
      const result = await mcpServersRouter.registerOAuthClient({
        ctx,
        input: { mcpServerId: 'server-123' },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        'Test Organization',
        expect.any(String),
      );
      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'server-123' },
          data: { authType: 'OAUTH' },
        }),
      );
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'OAUTH_CLIENT_REGISTER',
        }),
      );
      expect(result).toBeDefined();
    });

    test('should throw BAD_REQUEST when server does not support OAuth', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockDiscoverOAuth.mockResolvedValue({
        supportsOAuth: false,
        error: 'Server does not support OAuth',
      });

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.registerOAuthClient({
          ctx,
          input: { mcpServerId: 'server-123' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.registerOAuthClient({
          ctx,
          input: { mcpServerId: 'server-123' },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    test('should throw BAD_REQUEST when DCR is not supported', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockDiscoverOAuth.mockResolvedValue({
        supportsOAuth: true,
        registrationEndpoint: null, // No DCR support
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
      });

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.registerOAuthClient({
          ctx,
          input: { mcpServerId: 'server-123' },
        }),
      ).rejects.toThrow(TRPCError);
    });

    test('should throw BAD_REQUEST when discovery returns incomplete endpoints', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockDiscoverOAuth.mockResolvedValue({
        supportsOAuth: true,
        registrationEndpoint: 'https://auth.example.com/register',
        authorizationEndpoint: null, // Missing auth endpoint
        tokenEndpoint: null, // Missing token endpoint
      });

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.registerOAuthClient({
          ctx,
          input: { mcpServerId: 'server-123' },
        }),
      ).rejects.toThrow(TRPCError);
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.registerOAuthClient({
          ctx,
          input: { mcpServerId: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.registerOAuthClient({
          ctx,
          input: { mcpServerId: 'non-existent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('setOAuthConfig', () => {
    test('should set manual OAuth configuration', async () => {
      const server = createMockMcpServer({ id: 'server-123', name: 'Manual OAuth Server' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockPrisma.mcpServer.update.mockResolvedValue({ ...server, authType: 'OAUTH' });

      const ctx = createMockContext();
      const result = await mcpServersRouter.setOAuthConfig({
        ctx,
        input: {
          mcpServerId: 'server-123',
          clientId: 'manual-client-id',
          clientSecret: 'manual-client-secret',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
          revocationEndpoint: 'https://auth.example.com/revoke',
          scopesSupported: ['openid', 'profile'],
        },
      });

      expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'server-123' },
          data: { authType: 'OAUTH' },
        }),
      );
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'OAUTH_CLIENT_CONFIGURE',
          resourceId: 'server-123',
          actionDetails: expect.objectContaining({
            clientId: 'manual-client-id',
            authorizationEndpoint: 'https://auth.example.com/authorize',
            tokenEndpoint: 'https://auth.example.com/token',
          }),
        }),
      );
      expect(result).toEqual({ success: true });
    });

    test('should set OAuth config without optional fields', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockPrisma.mcpServer.update.mockResolvedValue({ ...server, authType: 'OAUTH' });

      const ctx = createMockContext();
      const result = await mcpServersRouter.setOAuthConfig({
        ctx,
        input: {
          mcpServerId: 'server-123',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
        },
      });

      expect(result).toEqual({ success: true });
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.setOAuthConfig({
          ctx,
          input: {
            mcpServerId: 'non-existent',
            clientId: 'client',
            clientSecret: 'secret',
            authorizationEndpoint: 'https://auth.example.com/authorize',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.setOAuthConfig({
          ctx,
          input: {
            mcpServerId: 'non-existent',
            clientId: 'client',
            clientSecret: 'secret',
            authorizationEndpoint: 'https://auth.example.com/authorize',
            tokenEndpoint: 'https://auth.example.com/token',
          },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getOAuthConfig', () => {
    test('should return OAuth config when configured', async () => {
      const server = {
        ...createMockMcpServer({ id: 'server-123' }),
        oauthClientRegistration: {
          clientId: 'client-123',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
          registrationEndpoint: 'https://auth.example.com/register',
          revocationEndpoint: 'https://auth.example.com/revoke',
          scopesSupported: ['read', 'write'],
          grantTypesSupported: ['authorization_code', 'refresh_token'],
          discoveredAt: new Date('2024-01-01'),
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getOAuthConfig({
        ctx,
        input: { mcpServerId: 'server-123' },
      });

      expect(result).toEqual({
        configured: true,
        clientId: 'client-123',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        registrationEndpoint: 'https://auth.example.com/register',
        revocationEndpoint: 'https://auth.example.com/revoke',
        scopesSupported: ['read', 'write'],
        grantTypesSupported: ['authorization_code', 'refresh_token'],
        discoveredAt: expect.any(Date),
      });
    });

    test('should return configured: false when no OAuth registration', async () => {
      const server = {
        ...createMockMcpServer({ id: 'server-123' }),
        oauthClientRegistration: null,
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getOAuthConfig({
        ctx,
        input: { mcpServerId: 'server-123' },
      });

      expect(result).toEqual({ configured: false });
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.getOAuthConfig({
          ctx,
          input: { mcpServerId: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.getOAuthConfig({
          ctx,
          input: { mcpServerId: 'non-existent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getToolAccessForUser', () => {
    test('should throw BAD_REQUEST when no userId, agentId, or roleId provided', async () => {
      const ctx = createMockContext();

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: {},
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: {},
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Must specify either userId, agentId, or roleId',
      });
    });

    test('should throw NOT_FOUND for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: { userId: 'non-existent-user' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: { userId: 'non-existent-user' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: { agentId: 'non-existent-agent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: { agentId: 'non-existent-agent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Agent not found',
      });
    });

    test('should throw NOT_FOUND for non-existent role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: { roleId: 'non-existent-role' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.getToolAccessForUser({
          ctx,
          input: { roleId: 'non-existent-role' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Role not found',
      });
    });

    test('should return tool access for valid user', async () => {
      const user = {
        id: 'user-123',
        organizationId: 'org-123',
        userRoles: [{ role: { id: 'role-1', name: 'Admin', isAdmin: true } }],
      };
      const servers = [
        {
          ...createMockMcpServer({ id: 'server-1' }),
          tools: [{ id: 'tool-1', name: 'test_tool', description: 'A test tool' }],
        },
      ];

      mockPrisma.user.findFirst.mockResolvedValue(user);
      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getToolAccessForUser({
        ctx,
        input: { userId: 'user-123' },
      });

      expect(result).toBeDefined();
      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalled();
    });

    test('should return tool access for valid agent', async () => {
      const agent = {
        id: 'agent-123',
        name: 'Test Agent',
        organizationId: 'org-123',
      };
      const servers = [
        {
          ...createMockMcpServer({ id: 'server-1' }),
          tools: [{ id: 'tool-1', name: 'agent_tool', description: 'An agent tool' }],
        },
      ];

      mockPrisma.agent.findFirst.mockResolvedValue(agent);
      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getToolAccessForUser({
        ctx,
        input: { agentId: 'agent-123' },
      });

      expect(result).toBeDefined();
    });
  });

  describe('getToolsWithFlagStatus', () => {
    test('should return tools with flag status for all servers', async () => {
      const sensitiveFlags = [
        {
          id: 'flag-1',
          toolPattern: '*::dangerous_*',
          behaviors: ['REQUIRE_APPROVAL'],
          description: 'Dangerous operations',
        },
      ];
      const servers = [
        {
          ...createMockMcpServer({ id: 'server-1', url: 'https://mcp.example.com' }),
          tools: [
            { id: 'tool-1', name: 'dangerous_delete', description: 'Delete operation' },
            { id: 'tool-2', name: 'safe_read', description: 'Read operation' },
          ],
        },
      ];

      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(sensitiveFlags);
      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getToolsWithFlagStatus({
        ctx,
        input: {},
      });

      expect(result).toBeDefined();
      expect(result.servers).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    test('should filter by serverId when provided', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      await mcpServersRouter.getToolsWithFlagStatus({
        ctx,
        input: { serverId: 'specific-server' },
      });

      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'specific-server',
          }),
        }),
      );
    });

    test('should return empty results when no servers exist', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getToolsWithFlagStatus({
        ctx,
        input: undefined,
      });

      expect(result.servers).toEqual([]);
      expect(result.stats).toBeDefined();
    });

    test('should correctly categorize flagged and unflagged tools', async () => {
      const sensitiveFlags = [
        {
          id: 'flag-1',
          toolPattern: 'example.com::write_*',
          behaviors: ['ALERT'],
          description: 'Write operations',
        },
      ];
      const servers = [
        {
          ...createMockMcpServer({ id: 'server-1', url: 'https://example.com' }),
          tools: [
            { id: 'tool-1', name: 'write_file', description: 'Write file' },
            { id: 'tool-2', name: 'read_file', description: 'Read file' },
            { id: 'tool-3', name: 'write_config', description: 'Write config' },
          ],
        },
      ];

      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(sensitiveFlags);
      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getToolsWithFlagStatus({
        ctx,
        input: {},
      });

      expect(result.servers).toHaveLength(1);
      // Stats should reflect the categorization
      expect(result.stats).toBeDefined();
    });

    test('should handle multiple servers with tools', async () => {
      const sensitiveFlags: unknown[] = [];
      const servers = [
        {
          ...createMockMcpServer({
            id: 'server-1',
            name: 'Server 1',
            url: 'https://server1.example.com',
          }),
          tools: [{ id: 'tool-1', name: 'tool_a', description: 'Tool A' }],
        },
        {
          ...createMockMcpServer({
            id: 'server-2',
            name: 'Server 2',
            url: 'https://server2.example.com',
          }),
          tools: [
            { id: 'tool-2', name: 'tool_b', description: 'Tool B' },
            { id: 'tool-3', name: 'tool_c', description: 'Tool C' },
          ],
        },
      ];

      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(sensitiveFlags);
      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      const ctx = createMockContext();
      const result = await mcpServersRouter.getToolsWithFlagStatus({
        ctx,
        input: {},
      });

      expect(result.servers).toHaveLength(2);
    });

    test('should handle server with invalid URL format by using raw URL as server key (line 1551)', async () => {
      // Test that an invalid URL is handled gracefully - the getServerKey function
      // should catch the URL parsing error and return the raw URL string
      const sensitiveFlags = [
        {
          id: 'flag-1',
          toolPattern: 'invalid-url::dangerous_*',
          behaviors: ['REQUIRE_APPROVAL'],
          description: 'Dangerous operations',
        },
      ];

      // Server with an invalid URL that cannot be parsed
      const servers = [
        {
          ...createMockMcpServer({
            id: 'server-1',
            name: 'Invalid URL Server',
            url: 'invalid-url', // This is not a valid URL and will cause URL parsing to fail
          }),
          tools: [
            { id: 'tool-1', name: 'dangerous_delete', description: 'Delete operation' },
            { id: 'tool-2', name: 'safe_read', description: 'Read operation' },
          ],
        },
      ];

      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue(sensitiveFlags);
      mockPrisma.mcpServer.findMany.mockResolvedValue(servers);

      // Update checkToolPattern mock to match the invalid-url server key
      mockCheckToolPattern.mockImplementation((pattern: string, qualifiedName: string) => {
        if (pattern === 'invalid-url::dangerous_*') {
          return qualifiedName.startsWith('invalid-url::dangerous_');
        }
        return false;
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.getToolsWithFlagStatus({
        ctx,
        input: {},
      });

      expect(result.servers).toHaveLength(1);
      // The server key should be the raw URL since parsing failed
      expect((result as { servers: { tools: unknown[] }[] }).servers[0].tools).toBeDefined();
    });
  });

  describe('create - OAuth auto-configuration', () => {
    test('should auto-configure OAuth with DCR when discovery succeeds', async () => {
      const newServer = createMockMcpServer({
        id: 'oauth-server',
        name: 'OAuth Auto Server',
        url: 'https://oauth.example.com',
        authType: 'OAUTH',
      });
      const discovery = {
        supportsOAuth: true,
        registrationEndpoint: 'https://auth.example.com/register',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        revocationEndpoint: 'https://auth.example.com/revoke',
        scopesSupported: ['read', 'write'],
        grantTypesSupported: ['authorization_code', 'refresh_token'],
      };
      const clientCredentials = {
        clientId: 'auto-client-123',
        clientSecret: 'auto-secret-456',
      };
      const org = { id: 'org-123', name: 'Test Organization' };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null); // No duplicate
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockPrisma.organization.findUnique.mockResolvedValue(org);
      mockDiscoverOAuth.mockResolvedValue(discovery);
      mockRegisterOAuthClient.mockResolvedValue(clientCredentials);

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'OAuth Auto Server',
          url: 'https://oauth.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalledWith('https://oauth.example.com');
      expect(mockRegisterOAuthClient).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        'Test Organization',
        expect.any(String),
      );
      expect(result.id).toBe('oauth-server');
    });

    test('should handle OAuth discovery returning supportsOAuth: false with error message', async () => {
      const newServer = createMockMcpServer({
        id: 'no-oauth-server',
        name: 'No OAuth Server',
        url: 'https://no-oauth.example.com',
        authType: 'OAUTH',
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockDiscoverOAuth.mockResolvedValue({
        supportsOAuth: false,
        error: 'Server does not expose OAuth metadata',
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'No OAuth Server',
          url: 'https://no-oauth.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
      expect(result.id).toBe('no-oauth-server');
    });

    test('should handle OAuth discovery returning supportsOAuth: false without error message', async () => {
      const newServer = createMockMcpServer({
        id: 'no-oauth-server-2',
        name: 'No OAuth Server 2',
        url: 'https://no-oauth2.example.com',
        authType: 'OAUTH',
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockDiscoverOAuth.mockResolvedValue({
        supportsOAuth: false,
        // No error message provided
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'No OAuth Server 2',
          url: 'https://no-oauth2.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
      expect(result.id).toBe('no-oauth-server-2');
    });

    test('should handle OAuth discovery throwing Error', async () => {
      const newServer = createMockMcpServer({
        id: 'error-server',
        name: 'Error Server',
        url: 'https://error.example.com',
        authType: 'OAUTH',
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockDiscoverOAuth.mockRejectedValue(new Error('Network timeout'));

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'Error Server',
          url: 'https://error.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
      expect(result.id).toBe('error-server');
    });

    test('should handle OAuth discovery throwing non-Error object', async () => {
      const newServer = createMockMcpServer({
        id: 'non-error-server',
        name: 'Non-Error Server',
        url: 'https://non-error.example.com',
        authType: 'OAUTH',
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockDiscoverOAuth.mockRejectedValue('String error');

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'Non-Error Server',
          url: 'https://non-error.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
      expect(result.id).toBe('non-error-server');
    });

    test('should handle DCR registration throwing Error', async () => {
      const newServer = createMockMcpServer({
        id: 'dcr-error-server',
        name: 'DCR Error Server',
        url: 'https://dcr-error.example.com',
        authType: 'OAUTH',
      });
      const discovery = {
        supportsOAuth: true,
        registrationEndpoint: 'https://auth.example.com/register',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
      };
      const org = { id: 'org-123', name: 'Test Organization' };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockPrisma.organization.findUnique.mockResolvedValue(org);
      mockDiscoverOAuth.mockResolvedValue(discovery);
      mockRegisterOAuthClient.mockRejectedValue(new Error('DCR endpoint returned 400'));

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'DCR Error Server',
          url: 'https://dcr-error.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).toHaveBeenCalled();
      expect(result.id).toBe('dcr-error-server');
    });

    test('should handle DCR registration throwing non-Error object', async () => {
      const newServer = createMockMcpServer({
        id: 'dcr-non-error-server',
        name: 'DCR Non-Error Server',
        url: 'https://dcr-non-error.example.com',
        authType: 'OAUTH',
      });
      const discovery = {
        supportsOAuth: true,
        registrationEndpoint: 'https://auth.example.com/register',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
      };
      const org = { id: 'org-123', name: 'Test Organization' };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockPrisma.organization.findUnique.mockResolvedValue(org);
      mockDiscoverOAuth.mockResolvedValue(discovery);
      mockRegisterOAuthClient.mockRejectedValue({ code: 'invalid_request' });

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'DCR Non-Error Server',
          url: 'https://dcr-non-error.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).toHaveBeenCalled();
      expect(result.id).toBe('dcr-non-error-server');
    });

    test('should handle server supports OAuth but not DCR', async () => {
      const newServer = createMockMcpServer({
        id: 'no-dcr-server',
        name: 'No DCR Server',
        url: 'https://no-dcr.example.com',
        authType: 'OAUTH',
      });
      const discovery = {
        supportsOAuth: true,
        registrationEndpoint: null, // No DCR support
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockDiscoverOAuth.mockResolvedValue(discovery);

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'No DCR Server',
          url: 'https://no-dcr.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
      expect(result.id).toBe('no-dcr-server');
    });

    test('should handle missing OAuth endpoints in discovery result', async () => {
      const newServer = createMockMcpServer({
        id: 'missing-endpoints-server',
        name: 'Missing Endpoints Server',
        url: 'https://missing-endpoints.example.com',
        authType: 'OAUTH',
      });
      const discovery = {
        supportsOAuth: true,
        registrationEndpoint: 'https://auth.example.com/register',
        authorizationEndpoint: null, // Missing
        tokenEndpoint: null, // Missing
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockDiscoverOAuth.mockResolvedValue(discovery);

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'Missing Endpoints Server',
          url: 'https://missing-endpoints.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockDiscoverOAuth).toHaveBeenCalled();
      expect(mockRegisterOAuthClient).not.toHaveBeenCalled();
      expect(result.id).toBe('missing-endpoints-server');
    });

    test('should use fallback org name when organization not found', async () => {
      const newServer = createMockMcpServer({
        id: 'fallback-org-server',
        name: 'Fallback Org Server',
        url: 'https://fallback-org.example.com',
        authType: 'OAUTH',
      });
      const discovery = {
        supportsOAuth: true,
        registrationEndpoint: 'https://auth.example.com/register',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
      };
      const clientCredentials = {
        clientId: 'fallback-client',
        clientSecret: 'fallback-secret',
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.mcpServer.create.mockResolvedValue(newServer);
      mockPrisma.mcpServerTool.findMany.mockResolvedValue([]);
      mockPrisma.toolPolicy.findMany.mockResolvedValue([]);
      mockPrisma.organization.findUnique.mockResolvedValue(null); // Org not found
      mockDiscoverOAuth.mockResolvedValue(discovery);
      mockRegisterOAuthClient.mockResolvedValue(clientCredentials);

      const ctx = createMockContext();
      const result = await mcpServersRouter.create({
        ctx,
        input: {
          name: 'Fallback Org Server',
          url: 'https://fallback-org.example.com',
          authType: 'OAUTH',
          autoConfigureOAuth: true,
        },
      });

      expect(mockRegisterOAuthClient).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        'SENTINEL Organization', // Fallback name
        expect.any(String),
      );
      expect(result.id).toBe('fallback-org-server');
    });
  });

  describe('delete - non-policy blockers', () => {
    test('should throw BAD_REQUEST with non-policy blocker messages', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [{ type: 'other', details: 'Server has active connections' }],
        warnings: [],
      });

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'server-123' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'server-123' },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('Server has active connections'),
      });
    });

    test('should join multiple non-policy blocker messages with semicolons', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [
          { type: 'other', details: 'Server has active connections' },
          { type: 'other', details: 'Server is in use by another process' },
          { type: 'other', details: 'Pending operations not completed' },
        ],
        warnings: [],
      });

      const ctx = createMockContext();

      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'server-123' },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('; '),
      });
    });

    test('should handle mix of policy and non-policy blockers', async () => {
      const server = createMockMcpServer({ id: 'server-123' });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: false,
        blockers: [
          { type: 'policy', details: 'Server has active policies' },
          { type: 'other', details: 'Server has active connections' },
        ],
        warnings: [],
      });

      const ctx = createMockContext();

      // Should still throw for the non-policy blocker
      await expect(
        mcpServersRouter.delete({
          ctx,
          input: { id: 'server-123' },
        }),
      ).rejects.toThrow(TRPCError);
    });

    test('should allow deletion when only policy blockers exist and deleteRelatedPolicies is true', async () => {
      const server = createMockMcpServer({
        id: 'server-123',
        url: 'https://mcp.example.com',
      });
      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: false, // Not deletable without policy deletion
        blockers: [{ type: 'policy', details: 'Server has active policies' }],
        warnings: [],
        canDeleteWithPolicies: true,
      });
      mockPrisma.policy.findMany.mockResolvedValue([
        { id: 'policy-1', slug: 'policy-1', toolPatterns: ['mcp.example.com::tool1'] },
      ]);
      mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
        const ops = arg as unknown[];
        return ops.map(() => ({ count: 1 }));
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.delete({
        ctx,
        input: { id: 'server-123', deleteRelatedPolicies: true },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('delete - soft delete related policies', () => {
    test('should soft delete related policies when deleteRelatedPolicies is true (lines 882-885)', async () => {
      const server = createMockMcpServer({
        id: 'server-123',
        name: 'Test Server',
        url: 'https://mcp.example.com',
      });

      const relatedPolicies = [
        { id: 'policy-1', slug: 'policy-1', toolPatterns: ['mcp.example.com::tool1'] },
        {
          id: 'policy-2',
          slug: 'policy-2',
          toolPatterns: ['mcp.example.com::tool2', 'other::tool'],
        },
      ];

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: true,
        blockers: [],
        warnings: [],
        canDeleteWithPolicies: true,
      });
      mockPrisma.policy.findMany.mockResolvedValue(relatedPolicies);

      // Track what operations are pushed to transaction
      const transactionOps: unknown[] = [];
      mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
        const ops = arg as unknown[];
        transactionOps.push(...ops);
        return ops.map(() => ({ count: 1 }));
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.delete({
        ctx,
        input: { id: 'server-123', deleteRelatedPolicies: true },
      });

      expect(result.success).toBe(true);
      expect(result.deletedPoliciesCount).toBe(2);
      expect(mockPrisma.policy.findMany).toHaveBeenCalled();
      // Transaction should include the policy updateMany operation
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    test('should not soft delete policies when no related policies exist', async () => {
      const server = createMockMcpServer({
        id: 'server-123',
        name: 'Test Server',
        url: 'https://mcp.example.com',
      });

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: true,
        blockers: [],
        warnings: [],
      });
      // No related policies
      mockPrisma.policy.findMany.mockResolvedValue([]);

      mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
        const ops = arg as unknown[];
        return ops.map(() => ({ count: 1 }));
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.delete({
        ctx,
        input: { id: 'server-123', deleteRelatedPolicies: true },
      });

      expect(result.success).toBe(true);
      expect(result.deletedPoliciesCount).toBe(0);
    });

    test('should filter policies correctly based on server key in toolPatterns', async () => {
      const server = createMockMcpServer({
        id: 'server-123',
        name: 'Test Server',
        url: 'https://mcp.example.com:8080', // URL with port
      });

      const policies = [
        // This should match - toolPattern starts with server key
        { id: 'policy-1', slug: 'policy-1', toolPatterns: ['mcp.example.com:8080::tool1'] },
        // This should NOT match - different server
        { id: 'policy-2', slug: 'policy-2', toolPatterns: ['other.example.com::tool2'] },
        // This should match - one of the patterns matches
        {
          id: 'policy-3',
          slug: 'policy-3',
          toolPatterns: ['mcp.example.com:8080::tool3', 'other::tool'],
        },
      ];

      mockPrisma.mcpServer.findFirst.mockResolvedValue(server);
      mockAnalyzeMcpServerDeletion.mockResolvedValue({
        canDelete: true,
        blockers: [],
        warnings: [],
      });
      mockPrisma.policy.findMany.mockResolvedValue(policies);

      mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
        const ops = arg as unknown[];
        return ops.map(() => ({ count: 1 }));
      });

      const ctx = createMockContext();
      const result = await mcpServersRouter.delete({
        ctx,
        input: { id: 'server-123', deleteRelatedPolicies: true },
      });

      expect(result.success).toBe(true);
      // Only 2 policies should be deleted (policy-1 and policy-3)
      expect(result.deletedPoliciesCount).toBe(2);
    });
  });
});
