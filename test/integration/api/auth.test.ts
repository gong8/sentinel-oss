/**
 * Auth Router Integration Tests
 * Tests for authentication endpoints
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { disconnectDatabase, hasDatabaseUrl, seedTestData } from '../../helpers/db.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createPublicCaller } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('tRPC Auth Router Integration', () => {
  let tenant: TestTenant;
  let seededData: Awaited<ReturnType<typeof seedTestData>>;

  beforeAll(async () => {
    // Note: Integration tests require a real database
    // Set TEST_DATABASE_URL or ensure DATABASE_URL points to a test database
    // Run migrations: pnpm db:migrate
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    tenant = await createTestTenant();
    seededData = await seedTestData({ organizationId: tenant.orgId });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('auth.validateToken', () => {
    test('should validate token and return user context', async () => {
      const { adminUser } = seededData;
      const caller = createPublicCaller();

      const result = await caller.auth.validateToken({
        accessToken: adminUser.accessToken,
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.userId).toBe(adminUser.id);
        expect(result.email).toBe(adminUser.email);
        expect(result.roles).toContain('Admin');
        expect(result.roles).toContain('User');
      }
    });

    test('should return invalid for non-existent token', async () => {
      const caller = createPublicCaller();

      const result = await caller.auth.validateToken({
        accessToken: 'non-existent-token-12345',
      });

      expect(result.valid).toBe(false);
    });

    test('should return invalid for empty token', async () => {
      const caller = createPublicCaller();

      const result = await caller.auth.validateToken({
        accessToken: '',
      });

      expect(result.valid).toBe(false);
    });

    test('should return invalid for null token', async () => {
      const caller = createPublicCaller();

      const result = await caller.auth.validateToken({
        accessToken: 'null',
      });

      expect(result.valid).toBe(false);
    });
  });
});
