/**
 * Integration tests for Admin MCP Servers Router
 * Tests complete CRUD operations for MCP server management
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as mcpService from '../../../packages/api/src/services/mcp.js';
import type { UserWithRoles } from '../../../packages/api/src/types/role.js';
import { McpAuthType, prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestAdmin, createTestMcpServer } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

// Mock MCP service functions
vi.mock('../../../packages/api/src/services/mcp.js', async () => {
  const actual = await vi.importActual('../../../packages/api/src/services/mcp.js');
  return {
    ...actual,
    validateMcpServerUrl: vi.fn(),
    validateMcpServerConnection: vi.fn(),
    discoverTools: vi.fn(),
  };
});

describe.skipIf(!hasDatabaseUrl())('Admin MCP Servers Router', () => {
  let tenant: TestTenant;
  let adminId: string;
  let admin: UserWithRoles;

  /** Gets a caller for the admin user */
  function getCaller() {
    return createCallerWithUser(admin);
  }

  beforeEach(async () => {
    tenant = await createTestTenant();

    admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;

    // Default mocks
    vi.mocked(mcpService.validateMcpServerUrl).mockResolvedValue({ success: true });
    vi.mocked(mcpService.validateMcpServerConnection).mockResolvedValue({ success: true });
    vi.mocked(mcpService.discoverTools).mockResolvedValue({ success: true, toolsDiscovered: 0 });
  });

  afterEach(async () => {
    await tenant.cleanup();
    vi.clearAllMocks();
  });

  describe('list', () => {
    test('should list all MCP servers in organization', async () => {
      await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub',
        url: 'https://github.com/mcp',
      });
      await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Notion',
        url: 'https://notion.com/mcp',
      });

      const caller = getCaller();
      const servers = await caller.admin.mcpServers.list();

      expect(servers.length).toBeGreaterThanOrEqual(2);
      expect(servers.every((s) => s.organizationId === tenant.orgId)).toBe(true);
    });

    test('should include tools in response', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId, name: 'GitHub' });

      // Add tools
      await prisma.mcpTool.createMany({
        data: [
          { mcpServerId: server.id, name: 'getFile' },
          { mcpServerId: server.id, name: 'createPR' },
        ],
      });

      const caller = getCaller();
      const servers = await caller.admin.mcpServers.list();

      const githubServer = servers.find((s) => s.id === server.id);
      expect(githubServer?.tools).toHaveLength(2);
      expect(githubServer?._count.tools).toBe(2);
    });

    test('should not list servers from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      await createTestMcpServer({ organizationId: org2.id, name: 'Other Server' });
      await createTestMcpServer({ organizationId: tenant.orgId, name: 'My Server' });

      const caller = getCaller();
      const servers = await caller.admin.mcpServers.list();

      expect(servers.every((s) => s.organizationId === tenant.orgId)).toBe(true);
      expect(servers.some((s) => s.name === 'Other Server')).toBe(false);

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('get', () => {
    test('should get specific MCP server by id', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub',
        url: 'https://github.com/mcp',
        authType: McpAuthType.API_KEY,
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.get({ id: server.id });

      expect(result.id).toBe(server.id);
      expect(result.name).toBe('GitHub');
      expect(result.url).toBe('https://github.com/mcp');
      expect(result.authType).toBe(McpAuthType.API_KEY);
    });

    test('should include tools in response', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId, name: 'GitHub' });
      await prisma.mcpTool.create({
        data: { mcpServerId: server.id, name: 'getFile' },
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.get({ id: server.id });

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('getFile');
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(caller.admin.mcpServers.get({ id: 'cm00000000000nonexistent' })).rejects.toThrow(
        'MCP server not found',
      );
    });

    test('should not return servers from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({
        organizationId: org2.id,
        name: 'Other Server',
      });

      const caller = getCaller();
      await expect(caller.admin.mcpServers.get({ id: otherServer.id })).rejects.toThrow(
        'MCP server not found',
      );

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('create', () => {
    test('should create MCP server with valid URL', async () => {
      const caller = getCaller();
      const server = await caller.admin.mcpServers.create({
        name: 'GitHub',
        url: 'https://github.com/mcp',
        authType: McpAuthType.API_KEY,
        trusted: true,
      });

      expect(server.name).toBe('GitHub');
      expect(server.url).toBe('https://github.com/mcp');
      expect(server.authType).toBe(McpAuthType.API_KEY);
      expect(server.trusted).toBe(true);
      expect(server.organizationId).toBe(tenant.orgId);
    });

    test('should validate MCP server URL before creating', async () => {
      const caller = getCaller();
      await caller.admin.mcpServers.create({
        name: 'GitHub',
        url: 'https://github.com/mcp',
        authType: McpAuthType.NONE,
      });

      expect(mcpService.validateMcpServerConnection).toHaveBeenCalledWith(
        'https://github.com/mcp',
        McpAuthType.NONE,
        expect.anything(), // transportType
        expect.anything(), // transportConfig
        undefined, // credentials
      );
    });

    test('should skip validation for API_KEY when no key is provided', async () => {
      const caller = getCaller();
      await caller.admin.mcpServers.create({
        name: 'GitHub',
        url: 'https://github.com/mcp',
        authType: McpAuthType.API_KEY,
      });

      expect(mcpService.validateMcpServerConnection).not.toHaveBeenCalled();
    });

    test('should pass validation API key to validator', async () => {
      const caller = getCaller();
      await caller.admin.mcpServers.create({
        name: 'GitHub',
        url: 'https://github.com/mcp',
        authType: McpAuthType.API_KEY,
        validationApiKey: 'test-key-123',
      });

      expect(mcpService.validateMcpServerConnection).toHaveBeenCalledWith(
        'https://github.com/mcp',
        McpAuthType.API_KEY,
        expect.anything(), // transportType
        expect.anything(), // transportConfig
        { apiKey: 'test-key-123' }, // credentials
      );
    });

    test('should reject invalid MCP server URL', async () => {
      vi.mocked(mcpService.validateMcpServerConnection).mockResolvedValue({
        success: false,
        error: 'Server is not a valid MCP endpoint',
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.create({
          name: 'Invalid Server',
          url: 'https://not-an-mcp-server.com',
          authType: McpAuthType.NONE,
        }),
      ).rejects.toThrow('Server is not a valid MCP endpoint');
    });

    test('should reject adding Sentinel MCP proxy URL', async () => {
      const previousUrl = process.env.MCP_PUBLIC_URL;
      process.env.MCP_PUBLIC_URL = 'https://self.test/mcp';

      try {
        const caller = getCaller();
        await expect(
          caller.admin.mcpServers.create({
            name: 'Sentinel MCP',
            url: 'https://self.test/mcp',
            authType: McpAuthType.NONE,
          }),
        ).rejects.toThrow(mcpService.SENTINEL_SELF_MCP_SERVER_ERROR);

        expect(mcpService.validateMcpServerConnection).not.toHaveBeenCalled();
      } finally {
        if (previousUrl === undefined) {
          delete process.env.MCP_PUBLIC_URL;
        } else {
          process.env.MCP_PUBLIC_URL = previousUrl;
        }
      }
    });

    test('should default trusted to false', async () => {
      const caller = getCaller();
      const server = await caller.admin.mcpServers.create({
        name: 'GitHub',
        url: 'https://github.com/mcp',
        authType: McpAuthType.API_KEY,
      });

      expect(server.trusted).toBe(false);
    });
  });

  describe('update', () => {
    test('should update server name', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId, name: 'GitHub' });

      const caller = getCaller();
      const updated = await caller.admin.mcpServers.update({
        id: server.id,
        name: 'GitHub Enterprise',
      });

      expect(updated.name).toBe('GitHub Enterprise');
    });

    test('should update server URL and validate it', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        url: 'https://old-url.com',
      });

      const caller = getCaller();
      await caller.admin.mcpServers.update({
        id: server.id,
        url: 'https://new-url.com',
      });

      expect(mcpService.validateMcpServerConnection).toHaveBeenCalledWith(
        'https://new-url.com',
        server.authType,
        expect.anything(), // transportType
        expect.anything(), // transportConfig
        undefined, // credentials
      );
    });

    test('should reject invalid URL on update', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      vi.mocked(mcpService.validateMcpServerConnection).mockResolvedValue({
        success: false,
        error: 'Invalid URL',
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.update({
          id: server.id,
          url: 'https://invalid.com',
        }),
      ).rejects.toThrow('Invalid URL');
    });

    test('should skip revalidation when auth type is API_KEY without a key', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        url: 'https://server.com',
        authType: McpAuthType.NONE,
      });

      const caller = getCaller();
      await caller.admin.mcpServers.update({
        id: server.id,
        url: 'https://server.com',
        authType: McpAuthType.API_KEY,
      });

      expect(mcpService.validateMcpServerConnection).not.toHaveBeenCalled();
    });

    test('should update trusted flag', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId, trusted: false });

      const caller = getCaller();
      const updated = await caller.admin.mcpServers.update({
        id: server.id,
        trusted: true,
      });

      expect(updated.trusted).toBe(true);
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.update({
          id: 'cm00000000000nonexistent',
          name: 'New Name',
        }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not update servers from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({
        organizationId: org2.id,
        name: 'Other Server',
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.update({
          id: otherServer.id,
          name: 'Hacked Name',
        }),
      ).rejects.toThrow('MCP server not found');

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('delete', () => {
    test('should delete MCP server', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.delete({ id: server.id });

      expect(result.success).toBe(true);

      const deleted = await prisma.mcpServer.findUnique({ where: { id: server.id } });
      expect(deleted).not.toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();
      expect(deleted?.deletedBy).toBe(admin.id);
    });

    test('should soft delete server and preserve tools', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });
      await prisma.mcpTool.create({
        data: { mcpServerId: server.id, name: 'getFile' },
      });

      const caller = getCaller();
      await caller.admin.mcpServers.delete({ id: server.id });

      // Server is soft deleted
      const deletedServer = await prisma.mcpServer.findUnique({ where: { id: server.id } });
      expect(deletedServer?.deletedAt).not.toBeNull();

      // Tools still exist because it's a soft delete
      const tools = await prisma.mcpTool.findMany({
        where: { mcpServerId: server.id },
      });

      expect(tools.length).toBeGreaterThan(0);
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.delete({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not delete servers from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({
        organizationId: org2.id,
        name: 'Other Server',
      });

      const caller = getCaller();
      await expect(caller.admin.mcpServers.delete({ id: otherServer.id })).rejects.toThrow(
        'MCP server not found',
      );

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('organization API key action logging', () => {
    test('should log MCP_SERVER_ORG_API_KEY_ADD when adding org API key', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
      });

      const caller = getCaller();
      await caller.admin.mcpServers.update({
        id: server.id,
        apiKey: 'new-api-key-123',
      });

      const actionLog = await prisma.adminActionLog.findFirst({
        where: {
          resourceId: server.id,
          actionType: 'MCP_SERVER_ORG_API_KEY_ADD',
        },
      });

      expect(actionLog).not.toBeNull();
      expect(actionLog?.actionType).toBe('MCP_SERVER_ORG_API_KEY_ADD');
      expect(actionLog?.resourceType).toBe('MCP_SERVER');
      expect(actionLog?.adminUserId).toBe(adminId);
    });

    test('should log MCP_SERVER_ORG_API_KEY_UPDATE when updating org API key', async () => {
      // Create server with existing API key
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
        apiKey: 'existing-api-key',
      });

      const caller = getCaller();
      await caller.admin.mcpServers.update({
        id: server.id,
        apiKey: 'updated-api-key-456',
      });

      const actionLog = await prisma.adminActionLog.findFirst({
        where: {
          resourceId: server.id,
          actionType: 'MCP_SERVER_ORG_API_KEY_UPDATE',
        },
      });

      expect(actionLog).not.toBeNull();
      expect(actionLog?.actionType).toBe('MCP_SERVER_ORG_API_KEY_UPDATE');
      expect(actionLog?.resourceType).toBe('MCP_SERVER');
      expect(actionLog?.adminUserId).toBe(adminId);
    });

    test('should log MCP_SERVER_ORG_API_KEY_REMOVE when removing org API key', async () => {
      // Create server with existing API key
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
        apiKey: 'existing-api-key',
      });

      const caller = getCaller();
      await caller.admin.mcpServers.update({
        id: server.id,
        apiKey: null,
      });

      const actionLog = await prisma.adminActionLog.findFirst({
        where: {
          resourceId: server.id,
          actionType: 'MCP_SERVER_ORG_API_KEY_REMOVE',
        },
      });

      expect(actionLog).not.toBeNull();
      expect(actionLog?.actionType).toBe('MCP_SERVER_ORG_API_KEY_REMOVE');
      expect(actionLog?.resourceType).toBe('MCP_SERVER');
      expect(actionLog?.adminUserId).toBe(adminId);
    });

    test('should log MCP_SERVER_UPDATE when not changing API key', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
        apiKey: 'existing-api-key',
      });

      const caller = getCaller();
      await caller.admin.mcpServers.update({
        id: server.id,
        name: 'Updated Name',
      });

      const actionLog = await prisma.adminActionLog.findFirst({
        where: {
          resourceId: server.id,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      expect(actionLog).not.toBeNull();
      expect(actionLog?.actionType).toBe('MCP_SERVER_UPDATE');
      expect(actionLog?.resourceType).toBe('MCP_SERVER');
    });
  });

  describe('discoverTools', () => {
    test('should discover tools from MCP server', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      vi.mocked(mcpService.discoverTools).mockResolvedValue({
        success: true,
        toolsDiscovered: 2,
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.discoverTools({ id: server.id });

      expect(result.success).toBe(true);
      expect(result.toolsDiscovered).toBe(2);
      expect(mcpService.discoverTools).toHaveBeenCalledWith(
        tenant.orgId,
        server.id,
        adminId,
        undefined, // workspaceId
      );
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.discoverTools({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not discover tools from servers in other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({ organizationId: org2.id });

      const caller = getCaller();
      await expect(caller.admin.mcpServers.discoverTools({ id: otherServer.id })).rejects.toThrow(
        'MCP server not found',
      );

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('restore', () => {
    test('should restore soft-deleted MCP server', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      // Soft delete the server
      await prisma.mcpServer.update({
        where: { id: server.id },
        data: {
          deletedAt: new Date(),
          deletedBy: adminId,
        },
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.restore({ id: server.id });

      expect(result.success).toBe(true);

      const restored = await prisma.mcpServer.findUnique({ where: { id: server.id } });
      expect(restored?.deletedAt).toBeNull();
      expect(restored?.deletedBy).toBeNull();
    });

    test('should throw NOT_FOUND for non-deleted server', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      const caller = getCaller();
      await expect(caller.admin.mcpServers.restore({ id: server.id })).rejects.toThrow(
        'MCP server not found or not deleted',
      );
    });

    test('should throw CONFLICT if URL is used by another active server', async () => {
      const url = 'https://conflicting.com/mcp';

      // Create and soft delete a server
      const deletedServer = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Deleted Server',
        url,
      });
      await prisma.mcpServer.update({
        where: { id: deletedServer.id },
        data: { deletedAt: new Date(), deletedBy: adminId },
      });

      // Create an active server with the same URL
      await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Active Server',
        url,
      });

      const caller = getCaller();
      await expect(caller.admin.mcpServers.restore({ id: deletedServer.id })).rejects.toThrow(
        'Cannot restore',
      );
    });

    test('should not restore servers from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({ organizationId: org2.id });
      await prisma.mcpServer.update({
        where: { id: otherServer.id },
        data: { deletedAt: new Date() },
      });

      const caller = getCaller();
      await expect(caller.admin.mcpServers.restore({ id: otherServer.id })).rejects.toThrow(
        'MCP server not found or not deleted',
      );

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('list with includeDeleted', () => {
    test('should exclude deleted servers by default', async () => {
      const activeServer = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Active Server',
      });
      const deletedServer = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Deleted Server',
      });
      await prisma.mcpServer.update({
        where: { id: deletedServer.id },
        data: { deletedAt: new Date() },
      });

      const caller = getCaller();
      const servers = await caller.admin.mcpServers.list();

      expect(servers.some((s) => s.id === activeServer.id)).toBe(true);
      expect(servers.some((s) => s.id === deletedServer.id)).toBe(false);
    });

    test('should include deleted servers when includeDeleted is true', async () => {
      const activeServer = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Active Server',
      });
      const deletedServer = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Deleted Server',
      });
      await prisma.mcpServer.update({
        where: { id: deletedServer.id },
        data: { deletedAt: new Date() },
      });

      const caller = getCaller();
      const servers = await caller.admin.mcpServers.list({ includeDeleted: true });

      expect(servers.some((s) => s.id === activeServer.id)).toBe(true);
      expect(servers.some((s) => s.id === deletedServer.id)).toBe(true);
    });
  });

  describe('getDeletionImpact', () => {
    test('should return deletion impact preview', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      const caller = getCaller();
      const impact = await caller.admin.mcpServers.getDeletionImpact({ id: server.id });

      expect(impact).toHaveProperty('canDelete');
      expect(impact).toHaveProperty('blockers');
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getDeletionImpact({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not return impact for servers from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({ organizationId: org2.id });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getDeletionImpact({ id: otherServer.id }),
      ).rejects.toThrow('MCP server not found');

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('getCredentials', () => {
    test('should return null for server without credentials', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.getCredentials({ id: server.id });

      expect(result.credentials).toBeNull();
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getCredentials({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not return credentials from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({ organizationId: org2.id });

      const caller = getCaller();
      await expect(caller.admin.mcpServers.getCredentials({ id: otherServer.id })).rejects.toThrow(
        'MCP server not found',
      );

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('getToolAccessForUser', () => {
    test('should return tool access for a user', async () => {
      const caller = getCaller();
      const result = await caller.admin.mcpServers.getToolAccessForUser({ userId: adminId });

      expect(result.user).not.toBeNull();
      expect(result.user?.id).toBe(adminId);
      expect(result.toolAccess).toBeDefined();
      expect(Array.isArray(result.toolAccess)).toBe(true);
    });

    test('should require at least one of userId, agentId, or roleId', async () => {
      const caller = getCaller();
      await expect(caller.admin.mcpServers.getToolAccessForUser({})).rejects.toThrow(
        'Must specify either userId, agentId, or roleId',
      );
    });

    test('should throw NOT_FOUND for non-existent user', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getToolAccessForUser({ userId: 'non-existent' }),
      ).rejects.toThrow('User not found');
    });

    test('should throw NOT_FOUND for user in another organization', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherAdmin = await createTestAdmin({ organizationId: org2.id });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getToolAccessForUser({ userId: otherAdmin.id }),
      ).rejects.toThrow('User not found');

      // Cleanup the other org
      await prisma.userRole.deleteMany({ where: { role: { organizationId: org2.id } } });
      await prisma.role.deleteMany({ where: { organizationId: org2.id } });
      await prisma.user.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });

    test('should return tool access for a role', async () => {
      // Create a role
      const role = await prisma.role.create({
        data: {
          organizationId: tenant.orgId,
          name: 'Test Role',
          isAdmin: false,
        },
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.getToolAccessForUser({ roleId: role.id });

      expect(result.role).not.toBeNull();
      expect(result.role?.id).toBe(role.id);
      expect(result.role?.name).toBe('Test Role');
    });
  });

  describe('getOAuthConfig', () => {
    test('should return not configured for server without OAuth', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.NONE,
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.getOAuthConfig({ mcpServerId: server.id });

      expect(result.configured).toBe(false);
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getOAuthConfig({ mcpServerId: 'non-existent' }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not return config from other organizations', async () => {
      const org2 = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({ organizationId: org2.id });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getOAuthConfig({ mcpServerId: otherServer.id }),
      ).rejects.toThrow('MCP server not found');

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: org2.id } });
      await prisma.organization.delete({ where: { id: org2.id } });
    });
  });

  describe('delete with related policies', () => {
    test('should delete related policies when deleteRelatedPolicies is true', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Test Server',
        url: 'https://test-server.com/mcp',
      });

      // Create a policy related to this server
      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['*'],
          toolPatterns: ['Test Server::*'],
          effect: 'DENY',
          description: 'Test policy for deletion',
        },
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.delete({
        id: server.id,
        deleteRelatedPolicies: true,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPoliciesCount).toBeGreaterThanOrEqual(0);
    });

    test('should soft delete policies matching server URL in tool patterns (lines 882-885)', async () => {
      const serverUrl = `https://policy-delete-test-${Date.now()}.com/mcp`;
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Policy Delete Server',
        url: serverUrl,
      });

      // Extract the server key (hostname) from the URL
      const url = new URL(serverUrl);
      const serverKey = url.hostname;

      // Create policies related to this server
      const relatedPolicy1 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `related-policy-1-${Date.now()}`,
          matchers: ['*'],
          toolPatterns: [`${serverKey}::tool1`],
          effect: 'DENY',
          description: 'Related policy 1',
        },
      });

      const relatedPolicy2 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `related-policy-2-${Date.now()}`,
          matchers: ['*'],
          toolPatterns: [`${serverKey}::tool2`, 'other.com::other_tool'],
          effect: 'ALLOW',
          description: 'Related policy 2',
        },
      });

      // Create an unrelated policy
      const unrelatedPolicy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `unrelated-policy-${Date.now()}`,
          matchers: ['*'],
          toolPatterns: ['different-server.com::*'],
          effect: 'ALLOW',
          description: 'Unrelated policy',
        },
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.delete({
        id: server.id,
        deleteRelatedPolicies: true,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPoliciesCount).toBe(2);

      // Verify related policies are soft-deleted
      const deletedPolicy1 = await prisma.policy.findUnique({
        where: { id: relatedPolicy1.id },
      });
      expect(deletedPolicy1?.deletedAt).not.toBeNull();
      expect(deletedPolicy1?.deletedBy).toBe(admin.id);

      const deletedPolicy2 = await prisma.policy.findUnique({
        where: { id: relatedPolicy2.id },
      });
      expect(deletedPolicy2?.deletedAt).not.toBeNull();
      expect(deletedPolicy2?.deletedBy).toBe(admin.id);

      // Verify unrelated policy is NOT soft-deleted
      const untouchedPolicy = await prisma.policy.findUnique({
        where: { id: unrelatedPolicy.id },
      });
      expect(untouchedPolicy?.deletedAt).toBeNull();
    });

    test('should block deletion when deleteRelatedPolicies is false and policies exist', async () => {
      const serverUrl = `https://no-policy-delete-test-${Date.now()}.com/mcp`;
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'No Policy Delete Server',
        url: serverUrl,
      });

      const url = new URL(serverUrl);
      const serverKey = url.hostname;

      // Create a related policy
      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: `keep-policy-${Date.now()}`,
          matchers: ['*'],
          toolPatterns: [`${serverKey}::tool1`],
          effect: 'ALLOW',
          description: 'Policy to keep',
        },
      });

      const caller = getCaller();

      // Deletion should be blocked because policies exist and deleteRelatedPolicies is false
      await expect(
        caller.admin.mcpServers.delete({
          id: server.id,
          deleteRelatedPolicies: false,
        }),
      ).rejects.toThrow('Cannot delete');

      // Verify policy is NOT soft-deleted
      const keptPolicy = await prisma.policy.findUnique({
        where: { id: policy.id },
      });
      expect(keptPolicy?.deletedAt).toBeNull();

      // Verify server is NOT soft-deleted
      const keptServer = await prisma.mcpServer.findUnique({
        where: { id: server.id },
      });
      expect(keptServer?.deletedAt).toBeNull();
    });
  });

  describe('probeAuthType', () => {
    test('should probe a URL for auth type', async () => {
      const caller = getCaller();
      // This will probe and return a result - actual detection depends on the URL
      const result = await caller.admin.mcpServers.probeAuthType({
        url: 'https://example.com/mcp',
      });

      // Should have detection result fields
      expect(result).toHaveProperty('detectedAuthType');
      expect(result).toHaveProperty('detectionFailed');
    });

    test('should reject Sentinel MCP proxy URL', async () => {
      const previousUrl = process.env.MCP_PUBLIC_URL;
      process.env.MCP_PUBLIC_URL = 'https://self.test/mcp';

      try {
        const caller = getCaller();
        await expect(
          caller.admin.mcpServers.probeAuthType({
            url: 'https://self.test/mcp',
          }),
        ).rejects.toThrow(mcpService.SENTINEL_SELF_MCP_SERVER_ERROR);
      } finally {
        if (previousUrl === undefined) {
          delete process.env.MCP_PUBLIC_URL;
        } else {
          process.env.MCP_PUBLIC_URL = previousUrl;
        }
      }
    });
  });

  describe('create - duplicate URL handling', () => {
    test('should reject duplicate URL within same organization', async () => {
      const testUrl = 'https://duplicate-test.com/mcp';
      await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'First Server',
        url: testUrl,
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.create({
          name: 'Second Server',
          url: testUrl,
          authType: McpAuthType.NONE,
        }),
      ).rejects.toThrow('already exists');
    });

    test('should allow same URL in different organizations', async () => {
      const testUrl = `https://same-url-diff-org-${Date.now()}.com/mcp`;

      // Create in a different org
      const otherOrg = await prisma.organization.create({
        data: { name: 'Other Org for URL test' },
      });
      await createTestMcpServer({
        organizationId: otherOrg.id,
        name: 'Other Org Server',
        url: testUrl,
      });

      // Should succeed in current org
      const caller = getCaller();
      const server = await caller.admin.mcpServers.create({
        name: 'My Org Server',
        url: testUrl,
        authType: McpAuthType.NONE,
      });

      expect(server.url).toBe(testUrl);
      expect(server.organizationId).toBe(tenant.orgId);

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('create - API key validation', () => {
    test('should reject API key for non-API_KEY auth type', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.create({
          name: 'Test Server',
          url: 'https://api-key-test.com/mcp',
          authType: McpAuthType.NONE,
          apiKey: 'should-not-be-allowed',
        }),
      ).rejects.toThrow('API keys can only be set for API_KEY authentication');
    });
  });

  describe('update - API key validation', () => {
    test('should reject API key when switching to non-API_KEY auth type', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.update({
          id: server.id,
          authType: McpAuthType.NONE,
          apiKey: 'should-not-be-allowed',
        }),
      ).rejects.toThrow('API keys can only be set for API_KEY authentication');
    });

    test('should clear API key when switching from API_KEY to NONE auth type', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
        apiKey: 'encrypted-key-value',
      });

      const caller = getCaller();
      const updated = await caller.admin.mcpServers.update({
        id: server.id,
        authType: McpAuthType.NONE,
      });

      expect(updated.authType).toBe(McpAuthType.NONE);
      expect(updated.hasApiKey).toBe(false);
    });
  });

  describe('update - Sentinel MCP URL rejection', () => {
    test('should reject updating URL to Sentinel MCP proxy URL', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      const previousUrl = process.env.MCP_PUBLIC_URL;
      process.env.MCP_PUBLIC_URL = 'https://self.test/mcp';

      try {
        const caller = getCaller();
        await expect(
          caller.admin.mcpServers.update({
            id: server.id,
            url: 'https://self.test/mcp',
          }),
        ).rejects.toThrow(mcpService.SENTINEL_SELF_MCP_SERVER_ERROR);
      } finally {
        if (previousUrl === undefined) {
          delete process.env.MCP_PUBLIC_URL;
        } else {
          process.env.MCP_PUBLIC_URL = previousUrl;
        }
      }
    });
  });

  describe('setOAuthConfig', () => {
    test('should set OAuth config for MCP server', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.OAUTH,
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.setOAuthConfig({
        mcpServerId: server.id,
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        scopesSupported: ['read', 'write'],
      });

      expect(result.success).toBe(true);

      // Verify OAuth config was stored
      const config = await caller.admin.mcpServers.getOAuthConfig({ mcpServerId: server.id });
      expect(config.configured).toBe(true);
      expect(config.clientId).toBe('test-client-id');
      expect(config.authorizationEndpoint).toBe('https://auth.example.com/authorize');
      expect(config.tokenEndpoint).toBe('https://auth.example.com/token');
    });

    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.setOAuthConfig({
          mcpServerId: 'non-existent',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
        }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not set OAuth config for servers in other organizations', async () => {
      const otherOrg = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({
        organizationId: otherOrg.id,
        authType: McpAuthType.OAUTH,
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.setOAuthConfig({
          mcpServerId: otherServer.id,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
        }),
      ).rejects.toThrow('MCP server not found');

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('discoverOAuth', () => {
    test('should attempt OAuth discovery for a URL', async () => {
      const caller = getCaller();
      const result = await caller.admin.mcpServers.discoverOAuth({
        url: 'https://example.com/mcp',
      });

      // Should return discovery result structure
      expect(result).toHaveProperty('supportsOAuth');
    });

    test('should log admin action for OAuth discovery', async () => {
      const caller = getCaller();
      // Loopback discard port: connection is refused instantly, so discovery fails
      // fast and offline. The admin action must still be logged either way.
      await caller.admin.mcpServers.discoverOAuth({
        url: 'http://127.0.0.1:9/mcp',
      });

      const actionLog = await prisma.adminActionLog.findFirst({
        where: {
          adminUserId: adminId,
          actionType: 'OAUTH_DISCOVER',
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      expect(actionLog).not.toBeNull();
      expect(actionLog?.actionType).toBe('OAUTH_DISCOVER');
    });
  });

  describe('registerOAuthClient', () => {
    test('should throw NOT_FOUND for non-existent server', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.registerOAuthClient({
          mcpServerId: 'non-existent',
        }),
      ).rejects.toThrow('MCP server not found');
    });

    test('should not register OAuth for servers in other organizations', async () => {
      const otherOrg = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherServer = await createTestMcpServer({
        organizationId: otherOrg.id,
        authType: McpAuthType.OAUTH,
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.registerOAuthClient({
          mcpServerId: otherServer.id,
        }),
      ).rejects.toThrow('MCP server not found');

      // Cleanup the other org
      await prisma.mcpServer.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('getToolAccessForUser - agent lookup', () => {
    test('should return tool access for an agent', async () => {
      // Create an agent
      const agent = await prisma.agent.create({
        data: {
          organizationId: tenant.orgId,
          name: 'Test Agent',
        },
      });

      const caller = getCaller();
      const result = await caller.admin.mcpServers.getToolAccessForUser({ agentId: agent.id });

      expect(result.agent).not.toBeNull();
      expect(result.agent?.id).toBe(agent.id);
      expect(result.agent?.name).toBe('Test Agent');
    });

    test('should throw NOT_FOUND for non-existent agent', async () => {
      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getToolAccessForUser({ agentId: 'non-existent' }),
      ).rejects.toThrow('Agent not found');
    });

    test('should throw NOT_FOUND for agent in another organization', async () => {
      const otherOrg = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherAgent = await prisma.agent.create({
        data: {
          organizationId: otherOrg.id,
          name: 'Other Agent',
        },
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getToolAccessForUser({ agentId: otherAgent.id }),
      ).rejects.toThrow('Agent not found');

      // Cleanup the other org
      await prisma.agent.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });

    test('should throw NOT_FOUND for role in another organization', async () => {
      const otherOrg = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherRole = await prisma.role.create({
        data: {
          organizationId: otherOrg.id,
          name: 'Other Role',
          isAdmin: false,
        },
      });

      const caller = getCaller();
      await expect(
        caller.admin.mcpServers.getToolAccessForUser({ roleId: otherRole.id }),
      ).rejects.toThrow('Role not found');

      // Cleanup the other org
      await prisma.role.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('list - OAuth status', () => {
    test('should include OAuth status in list response', async () => {
      await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'OAuth Server',
        authType: McpAuthType.OAUTH,
      });

      const caller = getCaller();
      const servers = await caller.admin.mcpServers.list();

      const oauthServer = servers.find((s) => s.name === 'OAuth Server');
      expect(oauthServer).toBeDefined();
      expect(oauthServer).toHaveProperty('hasOrgOAuth');
      expect(oauthServer).toHaveProperty('orgOAuthConnectedByEmail');
      expect(oauthServer).toHaveProperty('orgOAuthAuthenticatedAt');
    });
  });

  describe('create - credentials handling', () => {
    test('should store credentials when provided', async () => {
      const caller = getCaller();
      const server = await caller.admin.mcpServers.create({
        name: 'Credentials Server',
        url: 'https://credentials-test.com/mcp',
        authType: McpAuthType.NONE,
        credentials: { custom_key: 'custom_value' },
      });

      expect(server.hasCredentials).toBe(true);

      // Verify credentials are retrievable
      const creds = await caller.admin.mcpServers.getCredentials({ id: server.id });
      expect(creds.credentials).toEqual({ custom_key: 'custom_value' });
    });

    test('should handle empty credentials object', async () => {
      const caller = getCaller();
      const server = await caller.admin.mcpServers.create({
        name: 'Empty Credentials Server',
        url: 'https://empty-creds-test.com/mcp',
        authType: McpAuthType.NONE,
        credentials: {},
      });

      expect(server.hasCredentials).toBe(false);
    });
  });

  describe('update - credentials handling', () => {
    test('should update credentials', async () => {
      const caller = getCaller();

      // Create server first
      const server = await caller.admin.mcpServers.create({
        name: 'Update Creds Server',
        url: 'https://update-creds-test.com/mcp',
        authType: McpAuthType.NONE,
      });

      // Update with credentials
      const updated = await caller.admin.mcpServers.update({
        id: server.id,
        credentials: { updated_key: 'updated_value' },
      });

      expect(updated.hasCredentials).toBe(true);

      const creds = await caller.admin.mcpServers.getCredentials({ id: server.id });
      expect(creds.credentials).toEqual({ updated_key: 'updated_value' });
    });

    test('should clear credentials when set to null', async () => {
      const caller = getCaller();

      // Create server with credentials first
      const server = await caller.admin.mcpServers.create({
        name: 'Clear Creds Server',
        url: 'https://clear-creds-test.com/mcp',
        authType: McpAuthType.NONE,
        credentials: { some_key: 'some_value' },
      });

      expect(server.hasCredentials).toBe(true);

      // Clear credentials
      const updated = await caller.admin.mcpServers.update({
        id: server.id,
        credentials: null,
      });

      expect(updated.hasCredentials).toBe(false);
    });
  });

  describe('list - API key hint', () => {
    test('should include masked API key hint in list response', async () => {
      const caller = getCaller();

      // Create server with API key using validation key
      const server = await caller.admin.mcpServers.create({
        name: 'API Key Hint Server',
        url: 'https://api-key-hint-test.com/mcp',
        authType: McpAuthType.API_KEY,
        apiKey: 'my-secret-api-key-12345',
        validationApiKey: 'my-secret-api-key-12345',
      });

      const servers = await caller.admin.mcpServers.list();
      const apiKeyServer = servers.find((s) => s.id === server.id);

      expect(apiKeyServer).toBeDefined();
      expect(apiKeyServer?.hasApiKey).toBe(true);
      // Hint should be masked, showing only last 4 chars
      expect(apiKeyServer?.apiKeyHint).toMatch(/^•••\w{4}$/);
    });
  });

  describe('delete - deletion impact with policies', () => {
    test('should return impact with policy blockers', async () => {
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'Impact Test Server',
        url: 'https://impact-test.com/mcp',
      });

      // Create a policy related to this server
      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'impact-test-policy',
          matchers: ['*'],
          toolPatterns: ['Impact Test Server::*'],
          effect: 'ALLOW',
          description: 'Policy for impact test',
        },
      });

      const caller = getCaller();
      const impact = await caller.admin.mcpServers.getDeletionImpact({ id: server.id });

      expect(impact).toHaveProperty('canDelete');
      expect(impact).toHaveProperty('blockers');
      expect(impact).toHaveProperty('warnings');
    });
  });

  describe('discoverTools - logging', () => {
    test('should log admin action for tool discovery', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      const caller = getCaller();
      await caller.admin.mcpServers.discoverTools({ id: server.id });

      const actionLog = await prisma.adminActionLog.findFirst({
        where: {
          resourceId: server.id,
          actionType: 'MCP_SERVER_DISCOVER_TOOLS',
        },
      });

      expect(actionLog).not.toBeNull();
      expect(actionLog?.actionType).toBe('MCP_SERVER_DISCOVER_TOOLS');
      expect(actionLog?.resourceType).toBe('MCP_SERVER');
    });
  });

  describe('restore - logging', () => {
    test('should log admin action for server restore', async () => {
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      // Soft delete the server
      await prisma.mcpServer.update({
        where: { id: server.id },
        data: {
          deletedAt: new Date(),
          deletedBy: adminId,
        },
      });

      const caller = getCaller();
      await caller.admin.mcpServers.restore({ id: server.id });

      const actionLog = await prisma.adminActionLog.findFirst({
        where: {
          resourceId: server.id,
          actionType: 'MCP_SERVER_RESTORE',
        },
      });

      expect(actionLog).not.toBeNull();
      expect(actionLog?.actionType).toBe('MCP_SERVER_RESTORE');
      expect(actionLog?.resourceType).toBe('MCP_SERVER');
    });
  });
});
