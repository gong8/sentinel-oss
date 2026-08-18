/**
 * Unit Tests for Admin Personal Credentials Router
 * Tests credential masking, error handling, and edge cases
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockEncrypt,
  mockDecrypt,
  mockDecryptCredentials,
  mockEncryptObject,
  mockValidateMcpServerUrl,
  mockDiscoverTools,
  mockLogger,
} = vi.hoisted(() => ({
  mockPrisma: {
    mcpServer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    userMcpConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
  mockLogAdminAction: vi.fn(),
  mockEncrypt: vi.fn((value: string) => `encrypted:${value}`),
  mockDecrypt: vi.fn((value: string) => value.replace('encrypted:', '')),
  mockDecryptCredentials: vi.fn((value: string) => JSON.parse(value.replace('encrypted:', ''))),
  mockEncryptObject: vi.fn((obj: Record<string, unknown>) => `encrypted:${JSON.stringify(obj)}`),
  mockValidateMcpServerUrl: vi.fn(),
  mockDiscoverTools: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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
    PERSONAL_API_KEY_SET: 'PERSONAL_API_KEY_SET',
    PERSONAL_API_KEY_REMOVE: 'PERSONAL_API_KEY_REMOVE',
    PERSONAL_CREDENTIALS_SET: 'PERSONAL_CREDENTIALS_SET',
    PERSONAL_CREDENTIALS_REMOVE: 'PERSONAL_CREDENTIALS_REMOVE',
  },
  AdminResourceType: {
    USER_MCP_CONFIG: 'USER_MCP_CONFIG',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/lib/crypto.js', () => ({
  encryptString: mockEncrypt,
  decryptString: mockDecrypt,
  encryptObject: mockEncryptObject,
  decryptCredentials: mockDecryptCredentials,
}));

vi.mock('../../../../../packages/api/src/services/mcp.js', () => ({
  validateMcpServerUrl: mockValidateMcpServerUrl,
  discoverTools: mockDiscoverTools,
}));

vi.mock('../../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../../packages/api/src/lib/adminActionLabels.js', () => ({
  getActionDisplayName: vi.fn((action: string) => action),
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  adminProcedure: {
    query: vi.fn((fn) => (args: Record<string, unknown>) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: Record<string, unknown>) => fn(args)),
      mutation: vi.fn((fn) => (args: Record<string, unknown>) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: Record<string, unknown>) => fn(args)),
  },
}));

import { adminPersonalCredentialsRouter as _personalCredentialsRouter } from '../../../../../packages/api/src/trpc/admin/personalCredentials.js';

type MockContext = {
  auth: { organizationId: string; user: { id: string; email: string } };
  req: { req: { header: (name: string) => string | null } };
};

// Re-type the router to use our test-friendly handler type
type TestableHandler<TOutput, TInput = unknown> = (opts: {
  ctx: MockContext;
  input?: TInput;
}) => Promise<TOutput>;

const personalCredentialsRouter = _personalCredentialsRouter as unknown as {
  list: TestableHandler<Array<{ personalApiKeyHint: string | null; hasPersonalApiKey: boolean }>>;
  getCredentials: TestableHandler<{ credentials: Record<string, unknown> | null }>;
  updateApiKey: TestableHandler<{ success: boolean }>;
  updateCredentials: TestableHandler<{ success: boolean }>;
};

beforeAll(() => {
  console.log('Test suite starting: personalCredentials');
});

afterAll(() => {
  console.log('Test suite complete: personalCredentials');
});

beforeEach(() => {
  vi.resetAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
  mockValidateMcpServerUrl.mockResolvedValue({ success: true });
  mockDiscoverTools.mockResolvedValue({ success: true, toolsDiscovered: 0 });
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
    userEmail?: string;
  } = {},
): MockContext {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: {
        id: overrides.userId ?? 'user-123',
        email: overrides.userEmail ?? 'user@example.com',
      },
    },
    req: {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.1';
          if (name === 'user-agent') return 'Mozilla/5.0';
          return null;
        }) as unknown as (name: string) => string | null,
      },
    },
  };
}

describe('personalCredentialsRouter', () => {
  describe('list', () => {
    test('should return personalApiKeyHint as null when API key is too short to mask', async () => {
      // API key less than 4 characters - maskCredential returns null (line 60)
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          authType: 'API_KEY',
          updatedAt: new Date(),
          userConfigs: [
            {
              id: 'config-1',
              apiKey: 'encrypted:abc', // Short key (3 chars after decryption)
              credentials: null,
              authenticatedAt: null,
            },
          ],
        },
      ]);

      // Mock decryptString to return short value
      mockDecrypt.mockReturnValue('abc');

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].personalApiKeyHint).toBeNull();
    });

    test('should return personalApiKeyHint as null when API key decryption fails', async () => {
      // Test coverage for line 105 - logger.warn when decryption fails
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          authType: 'API_KEY',
          updatedAt: new Date(),
          userConfigs: [
            {
              id: 'config-1',
              apiKey: 'corrupted-encrypted-data',
              credentials: null,
              authenticatedAt: null,
            },
          ],
        },
      ]);

      // Mock decryptString to throw error
      mockDecrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].personalApiKeyHint).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to decrypt API key for user config config-1',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    test('should return masked API key hint for valid API keys', async () => {
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          authType: 'API_KEY',
          updatedAt: new Date(),
          userConfigs: [
            {
              id: 'config-1',
              apiKey: 'encrypted:my-secret-api-key',
              credentials: null,
              authenticatedAt: new Date(),
            },
          ],
        },
      ]);

      mockDecrypt.mockReturnValue('my-secret-api-key');

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].personalApiKeyHint).toBe('•••-key');
      expect(result[0].hasPersonalApiKey).toBe(true);
    });

    test('should return null hint when API key is exactly 4 characters', async () => {
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          authType: 'API_KEY',
          updatedAt: new Date(),
          userConfigs: [
            {
              id: 'config-1',
              apiKey: 'encrypted:test',
              credentials: null,
              authenticatedAt: null,
            },
          ],
        },
      ]);

      // 4 characters exactly - should return masked version
      mockDecrypt.mockReturnValue('test');

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      // "test" is exactly 4 chars, so mask should work
      expect(result[0].personalApiKeyHint).toBe('•••test');
    });

    test('should return null hint when API key is null or empty', async () => {
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          authType: 'API_KEY',
          updatedAt: new Date(),
          userConfigs: [
            {
              id: 'config-1',
              apiKey: null,
              credentials: null,
              authenticatedAt: null,
            },
          ],
        },
      ]);

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].personalApiKeyHint).toBeNull();
      expect(result[0].hasPersonalApiKey).toBe(false);
    });
  });

  describe('getCredentials', () => {
    test('should throw NOT_FOUND for non-existent server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();

      await expect(
        personalCredentialsRouter.getCredentials({
          ctx,
          input: { mcpServerId: 'non-existent' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        personalCredentialsRouter.getCredentials({
          ctx,
          input: { mcpServerId: 'non-existent' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'MCP server not found',
      });
    });

    test('should return null for non-existent config', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-123',
        organizationId: 'org-123',
      });
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue(null);

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.getCredentials({
        ctx,
        input: { mcpServerId: 'server-123' },
      });

      expect(result).toEqual({ credentials: null });
    });
  });

  describe('updateApiKey', () => {
    test('should throw NOT_FOUND when server is in another organization (line 182)', async () => {
      // Server not found because it belongs to different org
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });

      await expect(
        personalCredentialsRouter.updateApiKey({
          ctx,
          input: { mcpServerId: 'server-from-org-B', apiKey: 'test-key' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        personalCredentialsRouter.updateApiKey({
          ctx,
          input: { mcpServerId: 'server-from-org-B', apiKey: 'test-key' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'MCP server not found',
      });
    });

    test('should throw BAD_REQUEST for non-API_KEY auth type', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-123',
        organizationId: 'org-123',
        authType: 'OAUTH',
      });

      const ctx = createMockContext();

      await expect(
        personalCredentialsRouter.updateApiKey({
          ctx,
          input: { mcpServerId: 'server-123', apiKey: 'test-key' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        personalCredentialsRouter.updateApiKey({
          ctx,
          input: { mcpServerId: 'server-123', apiKey: 'test-key' },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'This MCP server does not use API key authentication',
      });
    });

    test('should clear API key when null is passed', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-123',
        organizationId: 'org-123',
        name: 'Test Server',
        authType: 'API_KEY',
      });
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue({
        id: 'config-123',
        userId: 'user-123',
        mcpServerId: 'server-123',
        apiKey: 'encrypted:old-key',
      });
      mockPrisma.userMcpConfig.update.mockResolvedValue({
        id: 'config-123',
        apiKey: null,
      });

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.updateApiKey({
        ctx,
        input: { mcpServerId: 'server-123', apiKey: null },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.userMcpConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            apiKey: null,
            authenticatedAt: null,
          }),
        }),
      );
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PERSONAL_API_KEY_REMOVE',
        }),
      );
    });

    test('should not update or log when clearing API key and no config exists', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-123',
        organizationId: 'org-123',
        name: 'Test Server',
        authType: 'API_KEY',
      });
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue(null);

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.updateApiKey({
        ctx,
        input: { mcpServerId: 'server-123', apiKey: null },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.userMcpConfig.update).not.toHaveBeenCalled();
      expect(mockLogAdminAction).not.toHaveBeenCalled();
    });
  });

  describe('updateCredentials', () => {
    test('should throw NOT_FOUND when server is in another organization (line 329)', async () => {
      // Server not found because it belongs to different org
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });

      await expect(
        personalCredentialsRouter.updateCredentials({
          ctx,
          input: { mcpServerId: 'server-from-org-B', credentials: { apiKey: 'test' } },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        personalCredentialsRouter.updateCredentials({
          ctx,
          input: { mcpServerId: 'server-from-org-B', credentials: { apiKey: 'test' } },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'MCP server not found',
      });
    });

    test('should clear credentials when null is passed', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-123',
        organizationId: 'org-123',
        name: 'Test Server',
        url: 'https://test.com',
        authType: 'API_KEY',
      });
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue({
        id: 'config-123',
        userId: 'user-123',
        mcpServerId: 'server-123',
        credentials: '{"apiKey":"old"}',
        apiKey: null,
        authenticatedAt: null,
      });
      mockPrisma.userMcpConfig.update.mockResolvedValue({
        id: 'config-123',
        credentials: {},
      });

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.updateCredentials({
        ctx,
        input: { mcpServerId: 'server-123', credentials: null },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.userMcpConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            credentials: {},
          }),
        }),
      );
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PERSONAL_CREDENTIALS_REMOVE',
        }),
      );
    });

    test('should clear credentials when empty object is passed', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-123',
        organizationId: 'org-123',
        name: 'Test Server',
        url: 'https://test.com',
        authType: 'API_KEY',
      });
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue({
        id: 'config-123',
        userId: 'user-123',
        mcpServerId: 'server-123',
        credentials: '{"apiKey":"old"}',
        apiKey: null,
        authenticatedAt: null,
      });
      mockPrisma.userMcpConfig.update.mockResolvedValue({
        id: 'config-123',
        credentials: {},
      });

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.updateCredentials({
        ctx,
        input: { mcpServerId: 'server-123', credentials: {} },
      });

      expect(result.success).toBe(true);
    });

    test('should not update or log when clearing credentials and no config exists', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({
        id: 'server-123',
        organizationId: 'org-123',
        name: 'Test Server',
        url: 'https://test.com',
        authType: 'API_KEY',
      });
      mockPrisma.userMcpConfig.findUnique.mockResolvedValue(null);

      const ctx = createMockContext();
      const result = await personalCredentialsRouter.updateCredentials({
        ctx,
        input: { mcpServerId: 'server-123', credentials: null },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.userMcpConfig.update).not.toHaveBeenCalled();
      expect(mockLogAdminAction).not.toHaveBeenCalled();
    });
  });
});
