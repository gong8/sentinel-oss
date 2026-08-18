/**
 * Integration tests for Admin Personal Credentials Router
 * Tests personal credential management for admins
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  decryptCredentials,
  decryptString,
  encryptString,
} from '../../../packages/api/src/lib/crypto.js';
import * as mcpService from '../../../packages/api/src/services/mcp.js';
import { McpAuthType, prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import {
  createTestAdmin,
  createTestMcpServer,
  createTestOrganization,
} from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

// Mock MCP service functions
vi.mock('../../../packages/api/src/services/mcp.js', async () => {
  const actual = await vi.importActual('../../../packages/api/src/services/mcp.js');
  return {
    ...actual,
    validateMcpServerUrl: vi.fn(),
    validateMcpServerConnection: vi.fn(),
  };
});

describe.skipIf(!hasDatabaseUrl())('Admin Personal Credentials Router', () => {
  let tenant: TestTenant;
  let adminId: string;
  let mcpServerId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;

    const server = await createTestMcpServer({
      organizationId: tenant.orgId,
      name: 'Test Server',
      authType: McpAuthType.API_KEY,
    });
    mcpServerId = server.id;

    // Default mocks
    vi.mocked(mcpService.validateMcpServerUrl).mockResolvedValue({ success: true });
    vi.mocked(mcpService.validateMcpServerConnection).mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    await tenant.cleanup();
    vi.clearAllMocks();
  });

  describe('list', () => {
    test('should list all servers with personal credential status', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const credentials = await caller.admin.personalCredentials.list();

      expect(credentials.length).toBeGreaterThanOrEqual(1);
      expect(credentials[0]).toHaveProperty('id');
      expect(credentials[0]).toHaveProperty('name');
      expect(credentials[0]).toHaveProperty('hasPersonalApiKey');
      expect(credentials[0]).toHaveProperty('hasPersonalCredentials');
    });

    test('should show configured status for servers with personal credentials', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Add personal API key (must be properly encrypted)
      await prisma.userMcpConfig.create({
        data: {
          userId: adminId,
          mcpServerId,
          apiKey: encryptString('test-api-key'),
          credentials: {},
        },
      });

      const caller = createCallerWithUser(admin);
      const credentials = await caller.admin.personalCredentials.list();

      const server = credentials.find((c) => c.id === mcpServerId);
      expect(server?.hasPersonalApiKey).toBe(true);
    });
  });

  describe('updateApiKey', () => {
    test('should add personal API key', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.personalCredentials.updateApiKey({
        mcpServerId,
        apiKey: 'test-api-key-123',
      });

      expect(result.success).toBe(true);

      // Verify stored
      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: adminId,
            mcpServerId,
          },
        },
      });

      expect(config).not.toBeNull();
      expect(config?.apiKey).not.toBeNull();

      // Verify encrypted
      const decrypted = decryptString(config!.apiKey!);
      expect(decrypted).toBe('test-api-key-123');
    });

    test('should update existing personal API key', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create initial config
      await prisma.userMcpConfig.create({
        data: {
          userId: adminId,
          mcpServerId,
          apiKey: 'old-key',
          credentials: {},
        },
      });

      const caller = createCallerWithUser(admin);
      await caller.admin.personalCredentials.updateApiKey({
        mcpServerId,
        apiKey: 'new-api-key-456',
      });

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: adminId,
            mcpServerId,
          },
        },
      });

      const decrypted = decryptString(config!.apiKey!);
      expect(decrypted).toBe('new-api-key-456');
    });

    test('should clear personal API key when null', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create initial config
      await prisma.userMcpConfig.create({
        data: {
          userId: adminId,
          mcpServerId,
          apiKey: 'test-key',
          credentials: {},
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.personalCredentials.updateApiKey({
        mcpServerId,
        apiKey: null,
      });

      expect(result.success).toBe(true);

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: adminId,
            mcpServerId,
          },
        },
      });

      expect(config?.apiKey).toBeNull();
    });

    test('should reject non-API_KEY auth type', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create OAuth server
      const oauthServer = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.OAUTH,
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.personalCredentials.updateApiKey({
          mcpServerId: oauthServer.id,
          apiKey: 'test-key',
        }),
      ).rejects.toThrow('does not use API key authentication');
    });

    test('should validate API key with MCP server', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      vi.mocked(mcpService.validateMcpServerUrl).mockResolvedValue({
        success: false,
        error: 'Invalid API key',
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.personalCredentials.updateApiKey({
          mcpServerId,
          apiKey: 'bad-key',
        }),
      ).rejects.toThrow('Invalid API key');

      expect(mcpService.validateMcpServerUrl).toHaveBeenCalled();
    });
  });

  describe('updateCredentials', () => {
    test('should add personal JSON credentials', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.personalCredentials.updateCredentials({
        mcpServerId,
        credentials: {
          apiKey: 'test-key',
          customField: 'test-value',
        },
      });

      expect(result.success).toBe(true);

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: adminId,
            mcpServerId,
          },
        },
      });

      expect(config).not.toBeNull();
      expect(typeof config?.credentials).toBe('string');
      if (!config || typeof config.credentials !== 'string')
        throw new Error('Credentials not found');

      const decrypted = decryptCredentials(config.credentials);
      expect(decrypted.apiKey).toBe('test-key');
      expect(decrypted.customField).toBe('test-value');
    });

    test('should clear credentials when null', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create initial config
      await prisma.userMcpConfig.create({
        data: {
          userId: adminId,
          mcpServerId,
          credentials: '{"apiKey":"test"}',
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.personalCredentials.updateCredentials({
        mcpServerId,
        credentials: null,
      });

      expect(result.success).toBe(true);

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: adminId,
            mcpServerId,
          },
        },
      });

      // Credentials should be empty object
      expect(config?.credentials).toEqual({});
    });

    test('should validate credentials with MCP server', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      vi.mocked(mcpService.validateMcpServerUrl).mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.personalCredentials.updateCredentials({
          mcpServerId,
          credentials: { apiKey: 'bad-creds' },
        }),
      ).rejects.toThrow('Invalid credentials');

      expect(mcpService.validateMcpServerUrl).toHaveBeenCalled();
    });
  });

  describe('getCredentials', () => {
    test('should retrieve decrypted personal credentials', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // First add credentials
      await caller.admin.personalCredentials.updateCredentials({
        mcpServerId,
        credentials: {
          apiKey: 'secret-key',
          username: 'testuser',
        },
      });

      // Then retrieve
      const result = await caller.admin.personalCredentials.getCredentials({
        mcpServerId,
      });

      expect(result.credentials).not.toBeNull();
      expect(result.credentials?.apiKey).toBe('secret-key');
      expect(result.credentials?.username).toBe('testuser');
    });

    test('should return null for non-existent credentials', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.personalCredentials.getCredentials({
        mcpServerId,
      });

      expect(result.credentials).toBeNull();
    });

    test('should reject access to other organization servers', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create server in another org
      const otherOrg = await createTestOrganization({ name: 'Other Org' });
      const otherServer = await createTestMcpServer({
        organizationId: otherOrg.id,
        name: 'Other Server',
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.personalCredentials.getCredentials({
          mcpServerId: otherServer.id,
        }),
      ).rejects.toThrow('MCP server not found');
    });
  });

  describe('list - edge cases', () => {
    test('should handle corrupted API key gracefully', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create a user config with corrupted/invalid encrypted API key
      await prisma.userMcpConfig.create({
        data: {
          userId: adminId,
          mcpServerId,
          apiKey: 'not-a-valid-encrypted-string',
          credentials: {},
        },
      });

      const caller = createCallerWithUser(admin);
      // Should not throw - should handle decryption failure gracefully
      const credentials = await caller.admin.personalCredentials.list();

      const server = credentials.find((c) => c.id === mcpServerId);
      expect(server?.hasPersonalApiKey).toBe(true);
      // Hint should be null since decryption failed
      expect(server?.personalApiKeyHint).toBeNull();
    });

    test('should return null hint for very short API key', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create a user config with a very short API key (< 4 chars after encryption)
      await prisma.userMcpConfig.create({
        data: {
          userId: adminId,
          mcpServerId,
          apiKey: encryptString('abc'), // Only 3 characters
          credentials: {},
        },
      });

      const caller = createCallerWithUser(admin);
      const credentials = await caller.admin.personalCredentials.list();

      const server = credentials.find((c) => c.id === mcpServerId);
      expect(server?.hasPersonalApiKey).toBe(true);
      // Hint should be null since key is too short to mask
      expect(server?.personalApiKeyHint).toBeNull();
    });
  });

  describe('updateApiKey - edge cases', () => {
    test('should throw NOT_FOUND for server in other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create server in another org
      const otherOrg = await createTestOrganization({ name: 'Other Org for API Key' });
      const otherServer = await createTestMcpServer({
        organizationId: otherOrg.id,
        name: 'Other Server',
        authType: McpAuthType.API_KEY,
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.personalCredentials.updateApiKey({
          mcpServerId: otherServer.id,
          apiKey: 'test-key',
        }),
      ).rejects.toThrow('MCP server not found');
    });
  });

  describe('updateCredentials - edge cases', () => {
    test('should throw NOT_FOUND for server in other organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create server in another org
      const otherOrg = await createTestOrganization({ name: 'Other Org for Credentials' });
      const otherServer = await createTestMcpServer({
        organizationId: otherOrg.id,
        name: 'Other Server',
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.personalCredentials.updateCredentials({
          mcpServerId: otherServer.id,
          credentials: { apiKey: 'test' },
        }),
      ).rejects.toThrow('MCP server not found');
    });
  });
});
