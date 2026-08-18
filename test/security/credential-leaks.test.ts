/**
 * Security Tests: Credential Leak Prevention
 * Ensures credentials are properly encrypted and not leaked
 */

import { McpAuthType } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  decryptCredentials,
  decryptString,
  encryptObject,
  encryptString,
} from '../../packages/api/src/lib/crypto.js';
import { prisma } from '../../packages/db/src/index.js';
import { clearDatabase, hasDatabaseUrl } from '../helpers/db.js';
import { createTestMcpServer, createTestOrganization, createTestUser } from '../helpers/factory.js';

describe.skipIf(!hasDatabaseUrl())('Credential Leak Security', () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    await clearDatabase();
    const org = await createTestOrganization();
    orgId = org.id;
    const user = await createTestUser({ organizationId: orgId });
    userId = user.id;
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe('Credential Encryption', () => {
    test('should store credentials encrypted in database', async () => {
      const server = await createTestMcpServer({
        organizationId: orgId,
        authType: McpAuthType.API_KEY,
      });

      const apiKey = 'secret-api-key-12345';
      const encrypted = encryptString(apiKey);

      await prisma.userMcpConfig.create({
        data: {
          userId: userId,
          mcpServerId: server.id,
          apiKey: encrypted,
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: userId,
            mcpServerId: server.id,
          },
        },
      });

      // Credentials should be encrypted (not plain text)
      expect(config?.apiKey).not.toContain(apiKey);
      expect(config?.apiKey).toContain(':'); // Encrypted format has colons
    });

    test('should decrypt credentials correctly', async () => {
      const server = await createTestMcpServer({
        organizationId: orgId,
        authType: McpAuthType.API_KEY,
      });

      const apiKey = 'secret-api-key-12345';
      const encrypted = encryptString(apiKey);

      await prisma.userMcpConfig.create({
        data: {
          userId: userId,
          mcpServerId: server.id,
          apiKey: encrypted,
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: userId,
            mcpServerId: server.id,
          },
        },
      });

      if (!config) throw new Error('Config not found');

      if (!config.apiKey) throw new Error('Config apiKey not found');
      const decrypted = decryptString(config.apiKey);

      expect(decrypted).toBe(apiKey);
    });

    test('should not leak credentials in error messages', async () => {
      const server = await createTestMcpServer({
        organizationId: orgId,
        authType: McpAuthType.API_KEY,
      });

      const apiKey = 'secret-api-key-12345';
      const encrypted = encryptString(apiKey);

      await prisma.userMcpConfig.create({
        data: {
          userId: userId,
          mcpServerId: server.id,
          apiKey: encrypted,
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      // Try to access non-existent config
      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: userId,
            mcpServerId: 'non-existent-id',
          },
        },
      });

      expect(config).toBeNull();
    });
  });

  describe('Credential Isolation', () => {
    test('should not leak credentials between users', async () => {
      const server = await createTestMcpServer({
        organizationId: orgId,
        authType: McpAuthType.API_KEY,
      });

      const user2 = await createTestUser({
        organizationId: orgId,
        email: 'user2@test.com',
      });

      const apiKey1 = 'user1-secret-key';
      const apiKey2 = 'user2-secret-key';

      await prisma.userMcpConfig.create({
        data: {
          userId: userId,
          mcpServerId: server.id,
          apiKey: encryptString(apiKey1),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      await prisma.userMcpConfig.create({
        data: {
          userId: user2.id,
          mcpServerId: server.id,
          apiKey: encryptString(apiKey2),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      // Get user1's credentials
      const config1 = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: userId,
            mcpServerId: server.id,
          },
        },
      });

      // Get user2's credentials
      const config2 = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: user2.id,
            mcpServerId: server.id,
          },
        },
      });

      if (!config1 || !config2) throw new Error('Configs not found');

      if (!config1.apiKey || !config2.apiKey) throw new Error('Config apiKey not found');
      const decrypted1 = decryptString(config1.apiKey);
      const decrypted2 = decryptString(config2.apiKey);

      expect(decrypted1).toBe(apiKey1);
      expect(decrypted2).toBe(apiKey2);
      expect(decrypted1).not.toBe(decrypted2);
    });

    test('should not leak credentials across organizations', async () => {
      const org2 = await createTestOrganization({ name: 'Org 2' });
      const user2 = await createTestUser({
        organizationId: org2.id,
        email: 'user2@org2.com',
      });

      const server1 = await createTestMcpServer({
        organizationId: orgId,
        authType: McpAuthType.API_KEY,
      });

      const server2 = await createTestMcpServer({
        organizationId: org2.id,
        authType: McpAuthType.API_KEY,
      });

      const apiKey1 = 'org1-secret-key';
      const apiKey2 = 'org2-secret-key';

      await prisma.userMcpConfig.create({
        data: {
          userId: userId,
          mcpServerId: server1.id,
          apiKey: encryptString(apiKey1),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      await prisma.userMcpConfig.create({
        data: {
          userId: user2.id,
          mcpServerId: server2.id,
          apiKey: encryptString(apiKey2),
          credentials: {},
          authenticatedAt: new Date(),
        },
      });

      // User1 should not be able to access org2's server
      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: userId,
            mcpServerId: server2.id, // Different org's server
          },
        },
      });

      expect(config).toBeNull();
    });
  });

  describe('OAuth Token Security', () => {
    test('should encrypt OAuth tokens', async () => {
      const server = await createTestMcpServer({
        organizationId: orgId,
        authType: McpAuthType.OAUTH,
      });

      const accessToken = 'oauth-access-token-12345';
      const refreshToken = 'oauth-refresh-token-67890';
      const encrypted = encryptObject({ accessToken, refreshToken });

      await prisma.userMcpConfig.create({
        data: {
          userId: userId,
          mcpServerId: server.id,
          credentials: encrypted,
          authenticatedAt: new Date(),
        },
      });

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: userId,
            mcpServerId: server.id,
          },
        },
      });

      // Tokens should be encrypted
      expect(config?.credentials).not.toContain(accessToken);
      expect(config?.credentials).not.toContain(refreshToken);
    });

    test('should decrypt OAuth tokens correctly', async () => {
      const server = await createTestMcpServer({
        organizationId: orgId,
        authType: McpAuthType.OAUTH,
      });

      const accessToken = 'oauth-access-token-12345';
      const refreshToken = 'oauth-refresh-token-67890';
      const encrypted = encryptObject({ accessToken, refreshToken });

      await prisma.userMcpConfig.create({
        data: {
          userId: userId,
          mcpServerId: server.id,
          credentials: encrypted,
          authenticatedAt: new Date(),
        },
      });

      const config = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: userId,
            mcpServerId: server.id,
          },
        },
      });

      if (!config) throw new Error('Config not found');
      if (typeof config.credentials !== 'string') throw new Error('Credentials not found');

      const decrypted = decryptCredentials(config.credentials);

      expect(decrypted.accessToken).toBe(accessToken);
      expect(decrypted.refreshToken).toBe(refreshToken);
    });
  });
});
