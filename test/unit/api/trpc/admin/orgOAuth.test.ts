/**
 * Tests for Admin Org OAuth Router
 * Tests organization-level OAuth management for MCP servers
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockInitiateOAuthFlow,
  mockGetOrgOAuthStatus,
  mockRevokeAndDisconnectOrg,
  mockLogAdminAction,
} = vi.hoisted(() => ({
  mockPrisma: {
    mcpServer: {
      findFirst: vi.fn(),
    },
  },
  mockInitiateOAuthFlow: vi.fn(),
  mockGetOrgOAuthStatus: vi.fn(),
  mockRevokeAndDisconnectOrg: vi.fn(),
  mockLogAdminAction: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  McpAuthType: {
    NONE: 'NONE',
    API_KEY: 'API_KEY',
    OAUTH: 'OAUTH',
  },
  AdminActionType: {
    OAUTH_FLOW_INITIATE: 'OAUTH_FLOW_INITIATE',
    OAUTH_DISCONNECT: 'OAUTH_DISCONNECT',
  },
  AdminResourceType: {
    MCP_SERVER: 'MCP_SERVER',
  },
}));

vi.mock('../../../../../packages/api/src/services/oauth.js', () => ({
  initiateOAuthFlow: mockInitiateOAuthFlow,
  getOrgOAuthStatus: mockGetOrgOAuthStatus,
  revokeAndDisconnectOrg: mockRevokeAndDisconnectOrg,
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
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
}));

import { McpAuthType } from '@sentinel/db';
import { adminOrgOAuthRouter as _adminOrgOAuthRouter } from '../../../../../packages/api/src/trpc/admin/orgOAuth.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
// Using Record<string, unknown> allows accessing any property on the result
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

const adminOrgOAuthRouter = _adminOrgOAuthRouter as unknown as {
  disconnect: TestableHandler;
  getStatus: TestableHandler;
  initiate: TestableHandler;
};

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
});

// Create a mock context
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
        header: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.1';
          if (name === 'x-real-ip') return null;
          if (name === 'user-agent') return 'Mozilla/5.0';
          return null;
        }),
      },
    },
  };
}

describe('adminOrgOAuthRouter', () => {
  describe('initiate', () => {
    test('should throw NOT_FOUND when server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent' };

      await expect(adminOrgOAuthRouter.initiate({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminOrgOAuthRouter.initiate({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should throw BAD_REQUEST when server does not use OAuth', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: McpAuthType.API_KEY,
        oauthClientRegistration: null,
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      await expect(adminOrgOAuthRouter.initiate({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminOrgOAuthRouter.initiate({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'This MCP server does not use OAuth authentication',
      });
    });

    test('should throw BAD_REQUEST when OAuth client is not registered', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        authType: McpAuthType.OAUTH,
        oauthClientRegistration: null,
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      await expect(adminOrgOAuthRouter.initiate({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminOrgOAuthRouter.initiate({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'OAuth client not registered for this MCP server',
      });
    });

    test('should initiate OAuth flow successfully', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'Test Server',
        authType: McpAuthType.OAUTH,
        oauthClientRegistration: {
          clientId: 'client-123',
          authorizationEndpoint: 'https://auth.example.com/authorize',
        },
      });
      mockInitiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com/authorize?code=abc',
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await adminOrgOAuthRouter.initiate({ ctx, input });

      expect(result).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize?code=abc',
      });
      expect(mockInitiateOAuthFlow).toHaveBeenCalledWith(
        'org-123',
        'user-123',
        'server-1',
        undefined,
        true, // isOrgLevel
      );
    });

    test('should pass returnUrl to initiateOAuthFlow', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'Test Server',
        authType: McpAuthType.OAUTH,
        oauthClientRegistration: { clientId: 'client-123' },
      });
      mockInitiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com/authorize',
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1', returnUrl: 'https://app.example.com/callback' };

      await adminOrgOAuthRouter.initiate({ ctx, input });

      expect(mockInitiateOAuthFlow).toHaveBeenCalledWith(
        'org-123',
        'user-123',
        'server-1',
        'https://app.example.com/callback',
        true,
      );
    });

    test('should query server with correct organization filter', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const input = { mcpServerId: 'server-1' };

      try {
        await adminOrgOAuthRouter.initiate({ ctx, input });
      } catch {
        // Expected to throw
      }

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'server-1',
          organizationId: 'custom-org',
          deletedAt: null,
        },
        include: {
          oauthClientRegistration: true,
        },
      });
    });
  });

  describe('getStatus', () => {
    test('should throw NOT_FOUND when server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent' };

      await expect(adminOrgOAuthRouter.getStatus({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminOrgOAuthRouter.getStatus({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should return OAuth status from service', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
      });
      mockGetOrgOAuthStatus.mockResolvedValue({
        connected: true,
        connectedAt: new Date('2024-01-15'),
        connectedBy: 'admin@example.com',
        expiresAt: new Date('2024-02-15'),
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await adminOrgOAuthRouter.getStatus({ ctx, input });

      expect(result).toEqual({
        connected: true,
        connectedAt: expect.any(Date),
        connectedBy: 'admin@example.com',
        expiresAt: expect.any(Date),
      });
      expect(mockGetOrgOAuthStatus).toHaveBeenCalledWith('org-123', 'server-1');
    });

    test('should return not connected status', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
      });
      mockGetOrgOAuthStatus.mockResolvedValue({
        connected: false,
      });

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await adminOrgOAuthRouter.getStatus({ ctx, input });

      expect(result).toEqual({ connected: false });
    });

    test('should query server with correct organization filter', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
      });
      mockGetOrgOAuthStatus.mockResolvedValue({ connected: false });

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const input = { mcpServerId: 'server-1' };

      await adminOrgOAuthRouter.getStatus({ ctx, input });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'server-1',
          organizationId: 'custom-org',
          deletedAt: null,
        },
      });
      expect(mockGetOrgOAuthStatus).toHaveBeenCalledWith('custom-org', 'server-1');
    });
  });

  describe('disconnect', () => {
    test('should throw NOT_FOUND when server does not exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'nonexistent' };

      await expect(adminOrgOAuthRouter.disconnect({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminOrgOAuthRouter.disconnect({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should disconnect OAuth successfully', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'Test Server',
      });
      mockRevokeAndDisconnectOrg.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      const result = await adminOrgOAuthRouter.disconnect({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockRevokeAndDisconnectOrg).toHaveBeenCalledWith('org-123', 'server-1');
    });

    test('should query server with correct organization filter', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'Test Server',
      });
      mockRevokeAndDisconnectOrg.mockResolvedValue(undefined);

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const input = { mcpServerId: 'server-1' };

      await adminOrgOAuthRouter.disconnect({ ctx, input });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'server-1',
          organizationId: 'custom-org',
          deletedAt: null,
        },
      });
      expect(mockRevokeAndDisconnectOrg).toHaveBeenCalledWith('custom-org', 'server-1');
    });

    test('should propagate errors from revokeAndDisconnectOrg', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-1',
        name: 'Test Server',
      });
      mockRevokeAndDisconnectOrg.mockRejectedValue(new Error('Failed to revoke token'));

      const ctx = createMockContext();
      const input = { mcpServerId: 'server-1' };

      await expect(adminOrgOAuthRouter.disconnect({ ctx, input })).rejects.toThrow(
        'Failed to revoke token',
      );
    });
  });

  describe('organization isolation', () => {
    test('initiate should not find servers from other organizations', async () => {
      // Server exists but belongs to different org
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { mcpServerId: 'server-from-org-B' };

      await expect(adminOrgOAuthRouter.initiate({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('getStatus should not find servers from other organizations', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { mcpServerId: 'server-from-org-B' };

      await expect(adminOrgOAuthRouter.getStatus({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('disconnect should not find servers from other organizations', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { mcpServerId: 'server-from-org-B' };

      await expect(adminOrgOAuthRouter.disconnect({ ctx, input })).rejects.toThrow(TRPCError);
    });
  });

  describe('soft delete handling', () => {
    test('initiate should not find soft-deleted servers', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'deleted-server' };

      try {
        await adminOrgOAuthRouter.initiate({ ctx, input });
      } catch {
        // Expected
      }

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    test('getStatus should not find soft-deleted servers', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'deleted-server' };

      try {
        await adminOrgOAuthRouter.getStatus({ ctx, input });
      } catch {
        // Expected
      }

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    test('disconnect should not find soft-deleted servers', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { mcpServerId: 'deleted-server' };

      try {
        await adminOrgOAuthRouter.disconnect({ ctx, input });
      } catch {
        // Expected
      }

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });
});
