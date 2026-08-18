/**
 * Integration tests for Proxy Router
 * Tests policy evaluation, audit logging, MCP server lookup, and credential retrieval
 */

import { AuditDecision, McpAuthType, PolicyEffect } from '@sentinel/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { encryptString } from '../../../packages/api/src/lib/crypto.js';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestOrganization, createTestPolicy, createTestUser } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createProxyCaller, TEST_PROXY_API_KEY } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Proxy Router', () => {
  let tenant: TestTenant;
  let testUserId: string;
  let originalProxyApiKey: string | undefined;

  beforeAll(() => {
    // Save original and set test proxy API key for authentication
    originalProxyApiKey = process.env.PROXY_API_KEY;
    process.env.PROXY_API_KEY = TEST_PROXY_API_KEY;
  });

  afterAll(() => {
    // Restore original environment
    if (originalProxyApiKey !== undefined) {
      process.env.PROXY_API_KEY = originalProxyApiKey;
    } else {
      delete process.env.PROXY_API_KEY;
    }
  });

  beforeEach(async () => {
    tenant = await createTestTenant();

    const user = await createTestUser({ organizationId: tenant.orgId });
    testUserId = user.id;
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('evaluatePolicy', () => {
    test('should return ALLOWED when matching ALLOW policy exists', async () => {
      // Create ALLOW policy
      await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::createPR'],
        effect: PolicyEffect.ALLOW,
      });

      const caller = createProxyCaller();
      const result = await caller.proxy.evaluatePolicy({
        userId: testUserId,
        toolName: 'github.com::createPR',
        parameters: { title: 'Test PR' },
      });

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds.length).toBeGreaterThan(0);
    });

    test('should return DENIED when no matching policy exists', async () => {
      const caller = createProxyCaller();
      const result = await caller.proxy.evaluatePolicy({
        userId: testUserId,
        toolName: 'github.com::createPR',
        parameters: {},
      });

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('No matching ALLOW policy');
    });

    test('should return DENIED when DENY policy exists', async () => {
      // Create both ALLOW and DENY policies
      await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId: tenant.orgId,
        matchers: ['role:User'],
        toolPatterns: ['github.com::createPR'],
        effect: PolicyEffect.DENY,
      });

      const caller = createProxyCaller();
      const result = await caller.proxy.evaluatePolicy({
        userId: testUserId,
        toolName: 'github.com::createPR',
        parameters: {},
      });

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('Denied by policy');
    });

    test('should return DENIED for non-existent user', async () => {
      const caller = createProxyCaller();
      const result = await caller.proxy.evaluatePolicy({
        userId: 'cljnonexistent00000000000',
        toolName: 'github.com::createPR',
        parameters: {},
      });

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toBe('User not found');
    });
  });

  describe('logAuditEntry', () => {
    test('should create audit log entry', async () => {
      const caller = createProxyCaller();
      const result = await caller.proxy.logAuditEntry({
        organizationId: tenant.orgId,
        userId: testUserId,
        toolName: 'github.com::createPR',
        parameters: { title: 'Test PR' },
        decision: AuditDecision.ALLOWED,
        policyIds: ['cljpolicy000000000000000'],
      });

      expect(result.success).toBe(true);

      // Verify audit entry was created
      const entries = await prisma.auditLogEntry.findMany({
        where: { organizationId: tenant.orgId },
      });

      expect(entries.length).toBe(1);
      expect(entries[0].userId).toBe(testUserId);
      expect(entries[0].toolName).toBe('github.com::createPR');
      expect(entries[0].decision).toBe(AuditDecision.ALLOWED);
    });

    test('should return success even if logging fails (fail-open)', async () => {
      const caller = createProxyCaller();

      // Pass non-existent organizationId (valid CUID format) to cause FK constraint error
      const result = await caller.proxy.logAuditEntry({
        organizationId: 'cljnonexistent00000000000',
        userId: testUserId,
        toolName: 'test::tool',
        parameters: {},
        decision: AuditDecision.DENIED,
        policyIds: [],
      });

      // Should still return success (fail-open) - logging errors don't block operations
      expect(result.success).toBe(true);
    });
  });

  describe('getMcpServer', () => {
    test('should find MCP server by domain', async () => {
      // Create MCP server
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'GitHub',
          url: 'https://mcp.github.com',
          authType: McpAuthType.OAUTH,
          trusted: true,
        },
      });

      const caller = createProxyCaller();
      const result = await caller.proxy.getMcpServer({
        organizationId: tenant.orgId,
        domain: 'mcp.github.com',
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(mcpServer.id);
      expect(result?.name).toBe('GitHub');
      expect(result?.authType).toBe(McpAuthType.OAUTH);
    });

    test('should find MCP server by domain with port', async () => {
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'Local Server',
          url: 'http://localhost:8080',
          authType: McpAuthType.NONE,
          trusted: true,
        },
      });

      const caller = createProxyCaller();
      const result = await caller.proxy.getMcpServer({
        organizationId: tenant.orgId,
        domain: 'localhost',
        port: '8080',
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(mcpServer.id);
    });

    test('should return null for non-existent server', async () => {
      const caller = createProxyCaller();
      const result = await caller.proxy.getMcpServer({
        organizationId: tenant.orgId,
        domain: 'nonexistent.com',
      });

      expect(result).toBeNull();
    });

    test('should not return servers from other organizations', async () => {
      // Create server for different organization
      const otherOrg = await createTestOrganization();
      await prisma.mcpServer.create({
        data: {
          organizationId: otherOrg.id,
          name: 'Other Org Server',
          url: 'https://mcp.github.com',
          authType: McpAuthType.NONE,
          trusted: true,
        },
      });

      const caller = createProxyCaller();
      const result = await caller.proxy.getMcpServer({
        organizationId: tenant.orgId, // Different org
        domain: 'mcp.github.com',
      });

      expect(result).toBeNull();

      // Cleanup
      await prisma.mcpServer.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });

  describe('getUserCredentials', () => {
    test('should return encrypted credentials', async () => {
      // Create MCP server
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'GitHub',
          url: 'https://mcp.github.com',
          authType: McpAuthType.API_KEY,
          trusted: true,
        },
      });

      // Create user credentials
      const testApiKey = 'test-api-key-12345';
      await prisma.userMcpConfig.create({
        data: {
          userId: testUserId,
          mcpServerId: mcpServer.id,
          apiKey: encryptString(testApiKey),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      const caller = createProxyCaller();
      const result = await caller.proxy.getUserCredentials({
        userId: testUserId,
        mcpServerId: mcpServer.id,
      });

      expect(result.user.apiKey).not.toBeNull();
      expect(result.user.apiKey).not.toBe(testApiKey);
      expect(result.user.apiKey).toContain(':');
      expect(result.user.credentials).toBeNull();
      expect(result.authType).toBe(McpAuthType.API_KEY);
    });

    test('should return null credentials when user not authenticated', async () => {
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'GitHub',
          url: 'https://mcp.github.com',
          authType: McpAuthType.API_KEY,
          trusted: true,
        },
      });

      const caller = createProxyCaller();
      const result = await caller.proxy.getUserCredentials({
        userId: testUserId,
        mcpServerId: mcpServer.id,
      });

      expect(result.user.credentials).toBeNull();
      expect(result.user.apiKey).toBeNull();
      expect(result.authType).toBe(McpAuthType.API_KEY);
    });

    test('should not leak credentials across users', async () => {
      // Create another user
      const otherUser = await createTestUser({
        organizationId: tenant.orgId,
      });

      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'GitHub',
          url: 'https://mcp.github.com',
          authType: McpAuthType.API_KEY,
          trusted: true,
        },
      });

      // Create credentials for other user
      await prisma.userMcpConfig.create({
        data: {
          userId: otherUser.id,
          mcpServerId: mcpServer.id,
          apiKey: encryptString('other-user-key'),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      // Try to get credentials as testUser
      const caller = createProxyCaller();
      const result = await caller.proxy.getUserCredentials({
        userId: testUserId, // Different user!
        mcpServerId: mcpServer.id,
      });

      expect(result.user.credentials).toBeNull();
      expect(result.user.apiKey).toBeNull();

      // Cleanup
      await prisma.userMcpConfig.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
    });
  });

  describe('refreshOAuthToken', () => {
    test('should throw error when user not found', async () => {
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'OAuth Server',
          url: 'https://mcp.oauth.example.com',
          authType: McpAuthType.OAUTH,
          trusted: true,
        },
      });

      const caller = createProxyCaller();
      await expect(
        caller.proxy.refreshOAuthToken({
          userId: 'cljnonexistent00000000000',
          mcpServerId: mcpServer.id,
        }),
      ).rejects.toThrow('User not found');
    });

    test('should throw error when no refresh token available', async () => {
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'OAuth Server',
          url: 'https://mcp.oauth.example.com',
          authType: McpAuthType.OAUTH,
          trusted: true,
        },
      });

      // Create user config without refresh token
      await prisma.userMcpConfig.create({
        data: {
          userId: testUserId,
          mcpServerId: mcpServer.id,
          credentials: {},
          accessToken: encryptString('expired-token'),
          refreshToken: null,
        },
      });

      const caller = createProxyCaller();
      await expect(
        caller.proxy.refreshOAuthToken({
          userId: testUserId,
          mcpServerId: mcpServer.id,
        }),
      ).rejects.toThrow('No refresh token available');
    });

    test('should attempt user-level refresh when user has refresh token', async () => {
      // This test verifies the code path is reached - actual refresh requires
      // mock OAuth server, which is tested in oauth.test.ts
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'OAuth Server',
          url: 'https://mcp.oauth.example.com',
          authType: McpAuthType.OAUTH,
          trusted: true,
        },
      });

      // Create user config with refresh token but no OAuth registration
      await prisma.userMcpConfig.create({
        data: {
          userId: testUserId,
          mcpServerId: mcpServer.id,
          credentials: {},
          accessToken: encryptString('expired-token'),
          refreshToken: encryptString('refresh-token'),
        },
      });

      const caller = createProxyCaller();

      // Should fail because OAuth client is not registered, but this confirms
      // the code path tries user-level refresh first
      await expect(
        caller.proxy.refreshOAuthToken({
          userId: testUserId,
          mcpServerId: mcpServer.id,
        }),
      ).rejects.toThrow('OAuth not configured for this MCP server');
    });

    test('should fall back to org-level refresh when user has no refresh token but org does', async () => {
      const mcpServer = await prisma.mcpServer.create({
        data: {
          organizationId: tenant.orgId,
          name: 'OAuth Server',
          url: 'https://mcp.oauth.example.com',
          authType: McpAuthType.OAUTH,
          trusted: true,
        },
      });

      // Create user config without refresh token
      await prisma.userMcpConfig.create({
        data: {
          userId: testUserId,
          mcpServerId: mcpServer.id,
          credentials: {},
          accessToken: encryptString('expired-token'),
          refreshToken: null,
        },
      });

      // Create org-level OAuth token
      await prisma.orgMcpOAuthToken.create({
        data: {
          organizationId: tenant.orgId,
          mcpServerId: mcpServer.id,
          accessToken: encryptString('org-expired-token'),
          refreshToken: encryptString('org-refresh-token'),
          authenticatedAt: new Date(),
        },
      });

      const caller = createProxyCaller();

      // Should fail because OAuth client is not registered, but this confirms
      // the code path falls back to org-level refresh
      await expect(
        caller.proxy.refreshOAuthToken({
          userId: testUserId,
          mcpServerId: mcpServer.id,
        }),
      ).rejects.toThrow('OAuth not configured for this MCP server');

      // Cleanup
      await prisma.orgMcpOAuthToken.deleteMany({ where: { mcpServerId: mcpServer.id } });
    });
  });

  describe('Authentication', () => {
    test('should reject requests without proxy API key', async () => {
      // Create a caller without the proxy API key
      const { appRouter } = await import('../../../packages/api/src/trpc/router.js');

      const mockReq = {
        req: {
          header: () => null, // No x-proxy-key header
          query: () => null,
        },
      };

      const ctx = {
        auth: null,
        req: mockReq as unknown as typeof mockReq,
      };

      // Using type assertion for test context
      const unauthenticatedCaller = appRouter.createCaller(
        ctx as unknown as Parameters<typeof appRouter.createCaller>[0],
      );

      await expect(
        unauthenticatedCaller.proxy.evaluatePolicy({
          userId: testUserId,
          toolName: 'github.com::test',
          parameters: {},
        }),
      ).rejects.toThrow('Proxy API key required');
    });

    test('should reject requests with invalid proxy API key', async () => {
      const { appRouter } = await import('../../../packages/api/src/trpc/router.js');

      const mockReq = {
        req: {
          header: (name: string) => {
            if (name === 'x-proxy-key') {
              return 'wrong-api-key';
            }
            return null;
          },
          query: () => null,
        },
      };

      const ctx = {
        auth: null,
        req: mockReq as unknown as typeof mockReq,
      };

      const invalidKeyCaller = appRouter.createCaller(
        ctx as unknown as Parameters<typeof appRouter.createCaller>[0],
      );

      await expect(
        invalidKeyCaller.proxy.evaluatePolicy({
          userId: testUserId,
          toolName: 'github.com::test',
          parameters: {},
        }),
      ).rejects.toThrow('Invalid proxy API key');
    });
  });
});
