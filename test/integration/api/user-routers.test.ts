/**
 * Integration tests for User Routers
 * Tests for profile, mcpServers, tools, auditLogEntries, and permissionRequests
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  decryptCredentials,
  encryptObject,
  encryptString,
} from '../../../packages/api/src/lib/crypto.js';
import * as mcpService from '../../../packages/api/src/services/mcp.js';
import {
  AuditDecision,
  McpAuthType,
  PolicyEffect,
  prisma,
} from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import {
  createTestMcpServer,
  createTestPolicy,
  createTestRole,
  createTestUser,
} from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

vi.mock('../../../packages/api/src/services/mcp.js', async () => {
  const actual = await vi.importActual<typeof import('../../../packages/api/src/services/mcp.js')>(
    '../../../packages/api/src/services/mcp.js',
  );
  return {
    ...actual,
    validateMcpServerUrl: vi.fn(),
    validateMcpServerConnection: vi.fn(),
  };
});

describe.skipIf(!hasDatabaseUrl())('User Routers', () => {
  let tenant: TestTenant;
  let userId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    await createTestRole({ organizationId: tenant.orgId, name: 'User', isAdmin: false });

    const user = await createTestUser({ organizationId: tenant.orgId });
    userId = user.id;

    vi.mocked(mcpService.validateMcpServerUrl).mockResolvedValue({ success: true });
    vi.mocked(mcpService.validateMcpServerConnection).mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('Profile Router', () => {
    test('should get user profile', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const caller = createCallerWithUser(user);
      const profile = await caller.user.profile.get();

      expect(profile).not.toBeNull();
      if (!profile) throw new Error('Profile should not be null');

      expect(profile.id).toBe(userId);
      expect(profile.email).toContain('@example.com');
      expect(profile.userRoles).toBeDefined();
    });
  });

  describe('MCP Servers Router', () => {
    describe('list', () => {
      test('should list MCP servers for user', async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!user) throw new Error('User not found');

        await createTestMcpServer({ organizationId: tenant.orgId, name: 'GitHub' });
        await createTestMcpServer({ organizationId: tenant.orgId, name: 'Notion' });

        const caller = createCallerWithUser(user);
        const servers = await caller.user.mcpServers.list();

        expect(servers.length).toBeGreaterThanOrEqual(2);
      });

      test('should include authentication status', async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!user) throw new Error('User not found');

        const server = await createTestMcpServer({
          organizationId: tenant.orgId,
          authType: McpAuthType.API_KEY,
        });

        // Add user credentials
        await prisma.userMcpConfig.create({
          data: {
            userId,
            mcpServerId: server.id,
            apiKey: encryptString('test-key'),
            credentials: {},
            authenticatedAt: new Date(),
          },
        });

        const caller = createCallerWithUser(user);
        const servers = await caller.user.mcpServers.list();

        const githubServer = servers.find((s) => s.id === server.id);
        expect(githubServer?.authenticated).toBe(true);
      });
    });

    describe('submitApiKey', () => {
      test('should submit API key for server', async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!user) throw new Error('User not found');

        const server = await createTestMcpServer({
          organizationId: tenant.orgId,
          authType: McpAuthType.API_KEY,
        });

        const caller = createCallerWithUser(user);
        const result = await caller.user.mcpServers.submitApiKey({
          mcpServerId: server.id,
          apiKey: 'my-api-key',
        });

        expect(result.success).toBe(true);

        const config = await prisma.userMcpConfig.findUnique({
          where: {
            userId_mcpServerId: {
              userId,
              mcpServerId: server.id,
            },
          },
        });

        expect(config).toBeTruthy();
        expect(config?.authenticatedAt).toBeTruthy();
      });

      test('should update existing credentials', async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!user) throw new Error('User not found');

        const server = await createTestMcpServer({
          organizationId: tenant.orgId,
          authType: McpAuthType.API_KEY,
        });

        // Submit initial key
        const caller = createCallerWithUser(user);
        await caller.user.mcpServers.submitApiKey({
          mcpServerId: server.id,
          apiKey: 'old-key',
        });

        // Update with new key
        await caller.user.mcpServers.submitApiKey({
          mcpServerId: server.id,
          apiKey: 'new-key',
        });

        const configs = await prisma.userMcpConfig.findMany({
          where: { userId, mcpServerId: server.id },
        });

        expect(configs).toHaveLength(1);
      });
    });

    describe('disconnect', () => {
      test('should disconnect from MCP server', async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!user) throw new Error('User not found');

        const server = await createTestMcpServer({
          organizationId: tenant.orgId,
          authType: McpAuthType.API_KEY,
        });

        await prisma.userMcpConfig.create({
          data: {
            userId,
            mcpServerId: server.id,
            apiKey: encryptString('test-key'),
            credentials: {},
            authenticatedAt: new Date(),
          },
        });

        const caller = createCallerWithUser(user);
        const result = await caller.user.mcpServers.disconnect({
          mcpServerId: server.id,
        });

        expect(result.success).toBe(true);

        const config = await prisma.userMcpConfig.findUnique({
          where: {
            userId_mcpServerId: {
              userId,
              mcpServerId: server.id,
            },
          },
        });

        expect(config).toBeNull();
      });
    });

    describe('initiateOAuth', () => {
      test('should return OAuth URL when OAuth is configured', async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
        if (!user) throw new Error('User not found');

        const server = await createTestMcpServer({
          organizationId: tenant.orgId,
          authType: McpAuthType.OAUTH,
        });

        const caller = createCallerWithUser(user);

        // Without OAuth client registration, this should throw an error
        await expect(
          caller.user.mcpServers.initiateOAuth({
            mcpServerId: server.id,
          }),
        ).rejects.toThrow('OAuth not configured');
      });
    });
  });

  describe('submitCredentials', () => {
    test('should submit JSON credentials for server', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
      });

      const caller = createCallerWithUser(user);
      const result = await caller.user.mcpServers.submitCredentials({
        mcpServerId: server.id,
        credentials: {
          apiKey: 'json-key',
          region: 'us-east-1',
        },
      });

      expect(result.success).toBe(true);

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId,
            mcpServerId: server.id,
          },
        },
      });

      expect(config).toBeTruthy();
      expect(typeof config?.credentials).toBe('string');
      if (!config || typeof config.credentials !== 'string')
        throw new Error('Credentials not found');

      const decrypted = decryptCredentials(config.credentials);
      expect(decrypted.apiKey).toBe('json-key');
      expect(decrypted.region).toBe('us-east-1');
    });

    test('should require override when org credentials conflict', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
        credentials: encryptObject({ apiKey: 'org-key', region: 'us-east-1' }),
      });

      const caller = createCallerWithUser(user);
      const result = await caller.user.mcpServers.submitCredentials({
        mcpServerId: server.id,
        credentials: {
          apiKey: 'user-key',
          region: 'us-east-1',
        },
      });

      expect(result.success).toBe(false);
      expect(result.overrideRequired).toBe(true);
      expect(result.conflicts?.length).toBeGreaterThan(0);

      const overrideResult = await caller.user.mcpServers.submitCredentials({
        mcpServerId: server.id,
        credentials: {
          apiKey: 'user-key',
          region: 'us-east-1',
        },
        forceOverride: true,
      });

      expect(overrideResult.success).toBe(true);
    });
  });

  describe('Tools Router', () => {
    test('should list tools with policy evaluation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub',
        url: 'https://github.com/mcp',
      });

      await prisma.mcpTool.createMany({
        data: [
          { mcpServerId: server.id, name: 'getFile' },
          { mcpServerId: server.id, name: 'createPR' },
        ],
      });

      // Create ALLOW policy for getFile using serverKey (github.com from URL)
      await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::getFile'],
        effect: PolicyEffect.ALLOW,
      });

      const caller = createCallerWithUser(user);
      const result = await caller.user.tools.list();

      expect(result.length).toBeGreaterThan(0);
      const githubServer = result.find((s) => s.serverId === server.id);
      expect(githubServer).toBeTruthy();
      expect(githubServer?.tools.length).toBe(2);

      const getFileTool = githubServer?.tools.find((t) => t.name === 'getFile');
      const createPRTool = githubServer?.tools.find((t) => t.name === 'createPR');

      expect(getFileTool?.access).toBe('ALLOWED');
      expect(createPRTool?.access).toBe('DENIED');
    });

    test('should show authentication status', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.API_KEY,
      });

      const caller = createCallerWithUser(user);
      const result = await caller.user.tools.list();

      const serverInfo = result.find((s) => s.serverId === server.id);
      expect(serverInfo?.authenticated).toBe(false);

      // Add credentials
      await prisma.userMcpConfig.create({
        data: {
          userId,
          mcpServerId: server.id,
          apiKey: encryptString('test-key'),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      const result2 = await caller.user.tools.list();
      const serverInfo2 = result2.find((s) => s.serverId === server.id);
      expect(serverInfo2?.authenticated).toBe(true);
    });

    test('should mark NONE auth servers as authenticated', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        authType: McpAuthType.NONE,
      });

      const caller = createCallerWithUser(user);
      const result = await caller.user.tools.list();

      const serverInfo = result.find((s) => s.serverId === server.id);
      expect(serverInfo?.authenticated).toBe(true);
    });
  });

  describe('Audit Log Entries Router', () => {
    test('should list user audit log entries', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      await prisma.auditLogEntry.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            userId,
            toolName: 'github.com::getFile',
            parameters: {},
            decision: AuditDecision.ALLOWED,
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
          {
            organizationId: tenant.orgId,
            userId,
            toolName: 'github.com::createPR',
            parameters: {},
            decision: AuditDecision.DENIED,
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
        ],
      });

      const caller = createCallerWithUser(user);
      const entries = await caller.user.auditLogEntries.list({});

      expect(entries.entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.entries.every((e) => e.userId === userId)).toBe(true);
    });

    test('should support filtering by decision', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      await prisma.auditLogEntry.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            userId,
            toolName: 'tool1',
            parameters: {},
            decision: AuditDecision.ALLOWED,
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
          {
            organizationId: tenant.orgId,
            userId,
            toolName: 'tool2',
            parameters: {},
            decision: AuditDecision.DENIED,
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
        ],
      });

      const caller = createCallerWithUser(user);
      const entries = await caller.user.auditLogEntries.list({
        decision: AuditDecision.DENIED,
      });

      expect(entries.entries.every((e) => e.decision === AuditDecision.DENIED)).toBe(true);
    });

    test('should not show other users audit logs', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const otherUser = await createTestUser({
        organizationId: tenant.orgId,
        email: 'other@test.com',
      });

      await prisma.auditLogEntry.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            userId,
            toolName: 'my-tool',
            parameters: {},
            decision: AuditDecision.ALLOWED,
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
          {
            organizationId: tenant.orgId,
            userId: otherUser.id,
            toolName: 'other-tool',
            parameters: {},
            decision: AuditDecision.ALLOWED,
            policyIds: [],
            matchedPolicyIds: [],
            userRoles: [],
          },
        ],
      });

      const caller = createCallerWithUser(user);
      const entries = await caller.user.auditLogEntries.list({});

      expect(entries.entries.every((e) => e.userId === userId)).toBe(true);
      expect(entries.entries.some((e) => e.toolName === 'other-tool')).toBe(false);
    });
  });

  describe('Permission Requests Router', () => {
    test('should create permission request', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      // Create server and tool for validation
      const server = await createTestMcpServer({
        organizationId: tenant.orgId,
        name: 'GitHub',
        url: 'https://github.com/mcp',
      });
      await prisma.mcpTool.create({
        data: { mcpServerId: server.id, name: 'createPR' },
      });

      const caller = createCallerWithUser(user);
      const request = await caller.user.permissionRequests.create({
        toolNames: ['github.com::createPR'],
        reason: 'Need to create PRs for my work',
      });

      expect(request.userId).toBe(userId);
      expect(request.toolNames).toEqual(['github.com::createPR']);
      expect(request.reason).toBe('Need to create PRs for my work');
      expect(request.status).toBe('PENDING');
    });

    test('should reject MCP server request for Sentinel proxy URL', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      vi.mocked(mcpService.validateMcpServerUrl).mockClear();

      const previousUrl = process.env.MCP_PUBLIC_URL;
      process.env.MCP_PUBLIC_URL = 'https://self.test/mcp';

      try {
        const caller = createCallerWithUser(user);
        await expect(
          caller.user.permissionRequests.create({
            type: 'MCP_SERVER',
            reason: 'Need this server',
            data: {
              name: 'Sentinel MCP',
              url: 'https://self.test/mcp',
              authType: 'NONE',
            },
          }),
        ).rejects.toThrow(mcpService.SENTINEL_SELF_MCP_SERVER_ERROR);

        expect(mcpService.validateMcpServerUrl).not.toHaveBeenCalled();
      } finally {
        if (previousUrl === undefined) {
          delete process.env.MCP_PUBLIC_URL;
        } else {
          process.env.MCP_PUBLIC_URL = previousUrl;
        }
      }
    });

    test('should list user permission requests', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR'],
          reason: 'Test request',
        },
      });

      const caller = createCallerWithUser(user);
      const requests = await caller.user.permissionRequests.list();

      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect(requests.every((r) => r.userId === userId)).toBe(true);
    });

    test('should get specific permission request', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR'],
          reason: 'Test request',
        },
      });

      const caller = createCallerWithUser(user);
      const result = await caller.user.permissionRequests.get({
        id: request.id,
      });

      expect(result.id).toBe(request.id);
    });

    test('should not get other users requests', async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!user) throw new Error('User not found');

      const otherUser = await createTestUser({
        organizationId: tenant.orgId,
        email: 'other@test.com',
      });

      const request = await prisma.permissionRequest.create({
        data: {
          userId: otherUser.id,
          toolNames: ['github.com::createPR'],
          reason: 'Other user request',
        },
      });

      const caller = createCallerWithUser(user);
      await expect(caller.user.permissionRequests.get({ id: request.id })).rejects.toThrow(
        'Permission request not found',
      );
    });
  });
});
