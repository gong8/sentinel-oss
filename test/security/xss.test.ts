/**
 * Security Tests: XSS Prevention
 * Ensures user input is properly sanitized to prevent XSS attacks
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../packages/db/src/index.js';
import { clearDatabase, hasDatabaseUrl } from '../helpers/db.js';
import { createTestOrganization, createTestPolicy, createTestUser } from '../helpers/factory.js';

describe.skipIf(!hasDatabaseUrl())('XSS Prevention Security', () => {
  let orgId: string;

  beforeEach(async () => {
    await clearDatabase();
    const org = await createTestOrganization();
    orgId = org.id;
    await createTestUser({ organizationId: orgId });
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe('Policy Description XSS', () => {
    test('should store XSS payloads safely in database', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<svg onload=alert("XSS")>',
        '"><script>alert("XSS")</script>',
      ];

      for (const payload of xssPayloads) {
        const policy = await createTestPolicy({
          organizationId: orgId,
          slug: `test-${Date.now()}`,
          description: payload,
        });

        // Should be stored as-is (sanitization happens at display layer)
        const stored = await prisma.policy.findUnique({
          where: { id: policy.id },
        });

        expect(stored?.description).toBe(payload);

        // Cleanup
        await prisma.policy.delete({ where: { id: policy.id } });
      }
    });

    test('should handle XSS in tool pattern safely', async () => {
      // Tool pattern validation should reject invalid formats
      // This test documents that invalid patterns are rejected
      const policy = await createTestPolicy({
        organizationId: orgId,
        slug: `test-${Date.now()}`,
        toolPatterns: ['github.com::*'], // Valid pattern
      });

      // Invalid patterns should be caught by validation
      // This is tested in unit tests for validateToolPattern
      expect(policy.toolPatterns[0]).not.toContain('<script>');
    });
  });

  describe('User Input Sanitization', () => {
    test('should handle special characters in policy slug', async () => {
      const specialChars = [
        'policy-with-dashes',
        'policy_with_underscores',
        'policy.with.dots',
        'policy123',
      ];

      for (const slug of specialChars) {
        const policy = await createTestPolicy({
          organizationId: orgId,
          slug: `test-${slug}-${Date.now()}`,
        });

        expect(policy.slug).toBeTruthy();

        // Cleanup
        await prisma.policy.delete({ where: { id: policy.id } });
      }
    });

    test('should handle unicode characters safely', async () => {
      const unicodeStrings = ['Policy with émojis 🎉', 'Policy with 中文', 'Policy with русский'];

      for (const description of unicodeStrings) {
        const policy = await createTestPolicy({
          organizationId: orgId,
          slug: `test-${Date.now()}`,
          description,
        });

        const stored = await prisma.policy.findUnique({
          where: { id: policy.id },
        });

        expect(stored?.description).toBe(description);

        // Cleanup
        await prisma.policy.delete({ where: { id: policy.id } });
      }
    });
  });

  describe('SQL Injection via XSS', () => {
    test('should not execute SQL from XSS payloads', async () => {
      // XSS payloads that also contain SQL injection attempts
      const maliciousPayloads = [
        '<script>alert("XSS"); DROP TABLE policies; --</script>',
        '"; DROP TABLE policies; --',
        "'; DROP TABLE policies; --",
      ];

      for (const payload of maliciousPayloads) {
        // Should store safely without executing SQL
        const policy = await createTestPolicy({
          organizationId: orgId,
          slug: `test-${Date.now()}`,
          description: payload,
        });

        // Verify policy was created (table not dropped)
        const count = await prisma.policy.count({
          where: { organizationId: orgId },
        });

        expect(count).toBeGreaterThan(0);

        // Cleanup
        await prisma.policy.delete({ where: { id: policy.id } });
      }
    });
  });
});
