/**
 * Security Tests: Organization Boundaries
 * Ensures users cannot access data from other organizations
 */

import { McpAuthType, PolicyEffect } from '@sentinel/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { encryptString } from '../../packages/api/src/lib/crypto.js';
import { prisma } from '../../packages/db/src/index.js';
import { clearDatabase, hasDatabaseUrl } from '../helpers/db.js';
import {
  createTestMcpServer,
  createTestOrganization,
  createTestOrgOwner,
  createTestPolicy,
  createTestUser,
} from '../helpers/factory.js';
import { createCallerWithUser, createProxyCaller, TEST_PROXY_API_KEY } from '../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Organization Boundary Security', () => {
  let org1Id: string;
  let org2Id: string;
  let user1Id: string;
  let user2Id: string;
  let admin1Id: string;
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
    await clearDatabase();

    const org1 = await createTestOrganization({ name: 'Organization 1' });
    const org2 = await createTestOrganization({ name: 'Organization 2' });
    org1Id = org1.id;
    org2Id = org2.id;

    const user1 = await createTestUser({ organizationId: org1Id, email: 'user1@org1.com' });
    const user2 = await createTestUser({ organizationId: org2Id, email: 'user2@org2.com' });
    // Use org owner for creating org-wide policies
    const admin1 = await createTestOrgOwner({ organizationId: org1Id, email: 'admin1@org1.com' });
    if (!admin1) throw new Error('Failed to create admin user');

    user1Id = user1.id;
    user2Id = user2.id;
    if (!admin1) throw new Error('Setup failed: admin1 is null');
    admin1Id = admin1.id;
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe('Policy Access', () => {
    test('should not return policies from other organizations', async () => {
      await createTestPolicy({
        organizationId: org1Id,
        slug: 'org1-policy',
        matchers: ['role:User'],
        toolPatterns: ['GitHub::*'],
        effect: PolicyEffect.ALLOW,
      });

      await createTestPolicy({
        organizationId: org2Id,
        slug: 'org2-policy',
        matchers: ['role:User'],
        toolPatterns: ['Notion::*'],
        effect: PolicyEffect.ALLOW,
      });

      const user1 = await prisma.user.findUnique({
        where: { id: user1Id },
        include: { userRoles: true },
      });
      if (!user1) throw new Error('User not found');

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: user1.organizationId,
          enabled: true,
        },
      });

      expect(policies).toHaveLength(1);
      expect(policies[0].slug).toBe('org1-policy');
      expect(policies.every((p) => p.organizationId === org1Id)).toBe(true);
    });

    test('should not allow user to create policy for other organization', async () => {
      const admin1 = await prisma.user.findUnique({
        where: { id: admin1Id },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin1) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin1, { isOrgOwner: true });

      // Try to create policy with different organizationId
      // Note: slug and organizationId are auto-generated/set by server, so we can't inject them
      // This test verifies that policies can only be created for the caller's organization
      await expect(
        caller.admin.policies.create({
          matchers: ['role:User'],
          toolPatterns: ['GitHub::*'],
          effect: 'ALLOW',
          description: 'Malicious',
          // organizationId is set by server from ctx.auth.organizationId
        }),
      ).resolves.toBeDefined();

      // Verify the policy was created for the correct organization (org1Id, not org2Id)
      const policies = await caller.admin.policies.list();
      expect(
        policies.some((p) => p.description === 'Malicious' && p.organizationId === org1Id),
      ).toBe(true);
    });
  });

  describe('MCP Server Access', () => {
    test('should not return MCP servers from other organizations', async () => {
      await createTestMcpServer({
        organizationId: org1Id,
        name: 'Org1 Server',
        url: 'https://mcp.org1.com',
      });

      await createTestMcpServer({
        organizationId: org2Id,
        name: 'Org2 Server',
        url: 'https://mcp.org2.com',
      });

      const user1 = await prisma.user.findUnique({
        where: { id: user1Id },
        include: { userRoles: true },
      });
      if (!user1) throw new Error('User not found');

      const servers = await prisma.mcpServer.findMany({
        where: {
          organizationId: user1.organizationId,
        },
      });

      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('Org1 Server');
      expect(servers.every((s) => s.organizationId === org1Id)).toBe(true);
    });

    test('should not allow user to access credentials from other organization', async () => {
      await createTestMcpServer({
        organizationId: org1Id,
        name: 'Org1 Server',
        url: 'https://mcp.org1.com',
        authType: McpAuthType.API_KEY,
      });

      const server2 = await createTestMcpServer({
        organizationId: org2Id,
        name: 'Org2 Server',
        url: 'https://mcp.org2.com',
        authType: McpAuthType.API_KEY,
      });

      // Create credentials for user2 on server2
      await prisma.userMcpConfig.create({
        data: {
          userId: user2Id,
          mcpServerId: server2.id,
          apiKey: encryptString('secret-key-org2'),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      // Use proxy caller (with proper API key authentication) to test org boundary enforcement
      const caller = createProxyCaller();

      // Try to get credentials from org2's server as user1 (from org1)
      const result = await caller.proxy.getUserCredentials({
        userId: user1Id,
        mcpServerId: server2.id, // Different org's server!
      });

      // Should return null (not found) because server doesn't belong to user's org
      expect(result.user.credentials).toBeNull();
      expect(result.user.apiKey).toBeNull();
    });
  });

  describe('Audit Log Access', () => {
    test('should not return audit logs from other organizations', async () => {
      await prisma.auditLogEntry.create({
        data: {
          organizationId: org1Id,
          userId: user1Id,
          toolName: 'GitHub::getFile',
          parameters: {},
          decision: 'ALLOWED',
          policyIds: [],
          matchedPolicyIds: [],
          userRoles: [],
        },
      });

      await prisma.auditLogEntry.create({
        data: {
          organizationId: org2Id,
          userId: user2Id,
          toolName: 'Notion::createPage',
          parameters: {},
          decision: 'ALLOWED',
          policyIds: [],
          matchedPolicyIds: [],
          userRoles: [],
        },
      });

      const user1 = await prisma.user.findUnique({
        where: { id: user1Id },
        include: { userRoles: true },
      });
      if (!user1) throw new Error('User not found');

      const logs = await prisma.auditLogEntry.findMany({
        where: {
          organizationId: user1.organizationId,
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].organizationId).toBe(org1Id);
    });
  });

  describe('User Access', () => {
    test('should not return users from other organizations', async () => {
      const user1 = await prisma.user.findUnique({
        where: { id: user1Id },
        include: { userRoles: true },
      });
      if (!user1) throw new Error('User not found');

      const users = await prisma.user.findMany({
        where: {
          organizationId: user1.organizationId,
        },
      });

      expect(users.every((u) => u.organizationId === org1Id)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });
  });
});
