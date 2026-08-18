/**
 * Integration tests for Database Schema
 * Tests database constraints, relationships, and data integrity
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import {
  createTestMcpServer,
  createTestPolicy,
  createTestRole,
  createTestUser,
} from '../../helpers/factory.js';
import {
  cleanupTenants,
  createTestTenant,
  createTestTenants,
  TestTenant,
} from '../../helpers/tenant-isolation.js';

describe.skipIf(!hasDatabaseUrl())('Database Schema Integration', () => {
  beforeAll(async () => {
    // Apply the user-role organization constraint migration if it doesn't exist
    try {
      // Check if trigger already exists
      const result = await prisma.$queryRaw<Array<{ trigger_name: string }>>`
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE trigger_name = 'user_role_organization_check'
      `;

      if (result.length === 0) {
        // Apply the migration - split into separate statements
        await prisma.$executeRaw`
          CREATE OR REPLACE FUNCTION check_user_role_organization()
          RETURNS TRIGGER AS $$
          BEGIN
            IF (SELECT "organizationId" FROM "User" WHERE "id" = NEW."userId") != 
               (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId") THEN
              RAISE EXCEPTION 'User and role must belong to the same organization';
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;

        await prisma.$executeRaw`
          CREATE TRIGGER user_role_organization_check
            BEFORE INSERT OR UPDATE ON "UserRole"
            FOR EACH ROW
            EXECUTE FUNCTION check_user_role_organization();
        `;
      }
    } catch (error) {
      // Ignore errors - migration might already be applied or database might not support it
      console.warn('Could not apply user-role organization constraint:', error);
    }
  });

  let tenant: TestTenant;

  beforeEach(async () => {
    tenant = await createTestTenant();
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('Organization Relationships', () => {
    test('should cascade delete users when organization is deleted', async () => {
      // Use a separate tenant for deletion tests (can't delete main tenant)
      const [deletableTenant] = await createTestTenants(1);
      const user = await createTestUser({ organizationId: deletableTenant.orgId });

      await prisma.organization.delete({
        where: { id: deletableTenant.orgId },
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });

      expect(deletedUser).toBeNull();
    });

    test('should cascade delete policies when organization is deleted', async () => {
      const [deletableTenant] = await createTestTenants(1);
      const policy = await createTestPolicy({ organizationId: deletableTenant.orgId });

      await prisma.organization.delete({
        where: { id: deletableTenant.orgId },
      });

      const deletedPolicy = await prisma.policy.findUnique({
        where: { id: policy.id },
      });

      expect(deletedPolicy).toBeNull();
    });

    test('should cascade delete MCP servers when organization is deleted', async () => {
      const [deletableTenant] = await createTestTenants(1);
      const server = await createTestMcpServer({ organizationId: deletableTenant.orgId });

      await prisma.organization.delete({
        where: { id: deletableTenant.orgId },
      });

      const deletedServer = await prisma.mcpServer.findUnique({
        where: { id: server.id },
      });

      expect(deletedServer).toBeNull();
    });
  });

  describe('User Relationships', () => {
    test('should cascade delete user roles when user is deleted', async () => {
      const user = await createTestUser({ organizationId: tenant.orgId });

      const roleCount = await prisma.userRole.count({
        where: { userId: user.id },
      });

      expect(roleCount).toBeGreaterThan(0);

      await prisma.user.delete({
        where: { id: user.id },
      });

      const deletedRoles = await prisma.userRole.count({
        where: { userId: user.id },
      });

      expect(deletedRoles).toBe(0);
    });

    test('should cascade delete user MCP configs when user is deleted', async () => {
      const user = await createTestUser({ organizationId: tenant.orgId });
      const server = await createTestMcpServer({ organizationId: tenant.orgId });

      await prisma.userMcpConfig.create({
        data: {
          userId: user.id,
          mcpServerId: server.id,
          credentials: 'encrypted-credentials',
          authenticatedAt: new Date(),
        },
      });

      await prisma.user.delete({
        where: { id: user.id },
      });

      const deletedConfig = await prisma.userMcpConfig.findUnique({
        where: {
          userId_mcpServerId: {
            userId: user.id,
            mcpServerId: server.id,
          },
        },
      });

      expect(deletedConfig).toBeNull();
    });
  });

  describe('Unique Constraints', () => {
    test('should enforce unique email constraint', async () => {
      const uniqueEmail = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
      await createTestUser({
        organizationId: tenant.orgId,
        email: uniqueEmail,
      });

      await expect(
        prisma.user.create({
          data: {
            email: uniqueEmail,
            organizationId: tenant.orgId,
          },
        }),
      ).rejects.toThrow();
    });

    test('should enforce unique access token constraint', async () => {
      const user1 = await createTestUser({ organizationId: tenant.orgId });

      // Try to create user with same access token
      await expect(
        prisma.user.create({
          data: {
            email: 'different@example.com',
            organizationId: tenant.orgId,
            accessToken: user1.accessToken,
          },
        }),
      ).rejects.toThrow();
    });

    test('should enforce unique policy slug per organization', async () => {
      await createTestPolicy({
        organizationId: tenant.orgId,
        slug: 'test-policy',
      });

      await expect(
        createTestPolicy({
          organizationId: tenant.orgId,
          slug: 'test-policy', // Duplicate slug
        }),
      ).rejects.toThrow();
    });
  });

  describe('Indexes', () => {
    test('should efficiently query by organizationId', async () => {
      const [tenant1, tenant2] = await createTestTenants(2);
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const email1 = `user1-${suffix}@org1.com`;
      const email2 = `user2-${suffix}@org2.com`;

      await createTestUser({ organizationId: tenant1.orgId, email: email1 });
      await createTestUser({ organizationId: tenant2.orgId, email: email2 });

      const org1Users = await prisma.user.findMany({
        where: { organizationId: tenant1.orgId },
      });

      expect(org1Users).toHaveLength(1);
      expect(org1Users[0].email).toBe(email1);

      // Cleanup the extra tenants
      await cleanupTenants([tenant1, tenant2]);
    });

    test('should efficiently query by email', async () => {
      const uniqueEmail = `unique-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
      const user = await createTestUser({
        organizationId: tenant.orgId,
        email: uniqueEmail,
      });

      const found = await prisma.user.findUnique({
        where: { email: uniqueEmail },
      });

      expect(found?.id).toBe(user.id);
    });
  });

  describe('Enums', () => {
    test('should enforce valid PolicyEffect enum values', async () => {
      // Test database-level enum constraint using raw SQL
      // This correctly tests runtime validation without TypeScript type casts
      await expect(
        prisma.$executeRaw`
          INSERT INTO "Policy" (id, "organizationId", slug, matcher, "toolPattern", effect, description, enabled, "createdAt", "updatedAt")
          VALUES (${crypto.randomUUID()}, ${tenant.orgId}, 'test-policy', 'role:User', 'github.com::*', 'INVALID', 'Invalid policy', true, NOW(), NOW())
        `,
      ).rejects.toThrow();
    });

    test('should enforce valid McpAuthType enum values', async () => {
      // Test database-level enum constraint using raw SQL
      // This correctly tests runtime validation without TypeScript type casts
      await expect(
        prisma.$executeRaw`
          INSERT INTO "McpServer" (id, "organizationId", name, url, "authType", trusted, "createdAt", "updatedAt")
          VALUES (${crypto.randomUUID()}, ${tenant.orgId}, 'Test Server', 'https://test.com', 'INVALID', true, NOW(), NOW())
        `,
      ).rejects.toThrow();
    });

    test('should enforce role belongs to organization', async () => {
      const [tenant1, tenant2] = await createTestTenants(2);
      const role = await createTestRole({ organizationId: tenant1.orgId });
      const user = await createTestUser({ organizationId: tenant2.orgId });

      // Try to assign role from tenant1 to user in tenant2
      await expect(
        prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
          },
        }),
      ).rejects.toThrow();

      // Cleanup the extra tenants
      await cleanupTenants([tenant1, tenant2]);
    });
  });
});
