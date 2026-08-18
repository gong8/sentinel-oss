/**
 * Unit tests for A2A Credential service
 * Tests auth header building and credential validation
 */

import { describe, expect, test } from 'vitest';

describe('A2A Credential', () => {
  describe('buildAuthHeaders', () => {
    test('should return empty headers for NONE auth type', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const result = buildAuthHeaders('NONE', {});
      expect(result).toEqual({});
    });

    test('should build X-API-Key header for API_KEY without scheme', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const result = buildAuthHeaders('API_KEY', { apiKey: 'sk-12345' });
      expect(result).toEqual({ 'X-API-Key': 'sk-12345' });
    });

    test('should build Bearer header for API_KEY with http bearer scheme', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const scheme = { type: 'http' as const, scheme: 'bearer' };
      const result = buildAuthHeaders('API_KEY', { apiKey: 'token123' }, scheme);
      expect(result).toEqual({ Authorization: 'Bearer token123' });
    });

    test('should build Basic header for API_KEY with http basic scheme', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const scheme = { type: 'http' as const, scheme: 'basic' };
      const result = buildAuthHeaders('API_KEY', { apiKey: 'dXNlcjpwYXNz' }, scheme);
      expect(result).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
    });

    test('should build custom header for apiKey scheme in header', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const scheme = { type: 'apiKey' as const, in: 'header' as const, name: 'X-Custom-Key' };
      const result = buildAuthHeaders('API_KEY', { apiKey: 'custom-key' }, scheme);
      expect(result).toEqual({ 'X-Custom-Key': 'custom-key' });
    });

    test('should use default X-API-Key for apiKey scheme without name', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const scheme = { type: 'apiKey' as const, in: 'header' as const };
      const result = buildAuthHeaders('API_KEY', { apiKey: 'api-key' }, scheme);
      expect(result).toEqual({ 'X-API-Key': 'api-key' });
    });

    test('should return empty headers when apiKey is missing', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const result = buildAuthHeaders('API_KEY', {});
      expect(result).toEqual({});
    });

    test('should return empty headers when apiKey is not a string', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const result = buildAuthHeaders('API_KEY', { apiKey: 12345 });
      expect(result).toEqual({});
    });

    test('should build Bearer header for OAUTH auth type', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const result = buildAuthHeaders('OAUTH', { accessToken: 'oauth-token' });
      expect(result).toEqual({ Authorization: 'Bearer oauth-token' });
    });

    test('should build Bearer header for OIDC auth type', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const result = buildAuthHeaders('OIDC', { accessToken: 'oidc-token' });
      expect(result).toEqual({ Authorization: 'Bearer oidc-token' });
    });

    test('should return empty headers when accessToken is missing', async () => {
      const { buildAuthHeaders } = await import('../../../packages/a2a/src/credential.js');

      const result = buildAuthHeaders('OAUTH', {});
      expect(result).toEqual({});
    });
  });

  describe('areCredentialsExpired', () => {
    test('should return false when no expiresAt field', async () => {
      const { areCredentialsExpired } = await import('../../../packages/a2a/src/credential.js');

      const result = areCredentialsExpired({});
      expect(result).toBe(false);
    });

    test('should return false when expiresAt is in the future', async () => {
      const { areCredentialsExpired } = await import('../../../packages/a2a/src/credential.js');

      const futureTime = Date.now() + 60 * 60 * 1000; // 1 hour from now
      const result = areCredentialsExpired({ tokenExpiresAt: futureTime });
      expect(result).toBe(false);
    });

    test('should return true when expiresAt is in the past', async () => {
      const { areCredentialsExpired } = await import('../../../packages/a2a/src/credential.js');

      const pastTime = Date.now() - 60 * 1000; // 1 minute ago
      const result = areCredentialsExpired({ tokenExpiresAt: pastTime });
      expect(result).toBe(true);
    });

    test('should return true when expiresAt is within 30 second buffer', async () => {
      const { areCredentialsExpired } = await import('../../../packages/a2a/src/credential.js');

      const almostExpired = Date.now() + 15 * 1000; // 15 seconds from now (within buffer)
      const result = areCredentialsExpired({ tokenExpiresAt: almostExpired });
      expect(result).toBe(true);
    });

    test('should handle ISO date string', async () => {
      const { areCredentialsExpired } = await import('../../../packages/a2a/src/credential.js');

      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const result = areCredentialsExpired({ tokenExpiresAt: futureDate });
      expect(result).toBe(false);
    });

    test('should return false for invalid date value', async () => {
      const { areCredentialsExpired } = await import('../../../packages/a2a/src/credential.js');

      const result = areCredentialsExpired({ tokenExpiresAt: 'not-a-date' });
      expect(result).toBe(false);
    });
  });

  describe('validateCredentials', () => {
    test('should validate NONE auth type', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('NONE', {});
      expect(result.valid).toBe(true);
    });

    test('should validate API_KEY with valid apiKey', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('API_KEY', { apiKey: 'sk-12345' });
      expect(result.valid).toBe(true);
    });

    test('should reject API_KEY without apiKey', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('API_KEY', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('apiKey is required');
    });

    test('should reject API_KEY with non-string apiKey', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('API_KEY', { apiKey: 12345 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('should validate OAUTH with valid accessToken', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('OAUTH', { accessToken: 'token123' });
      expect(result.valid).toBe(true);
    });

    test('should reject OAUTH without accessToken', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('OAUTH', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('accessToken is required');
    });

    test('should reject OAUTH with expired token', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const expiredTime = Date.now() - 60 * 1000;
      const result = validateCredentials('OAUTH', {
        accessToken: 'token',
        tokenExpiresAt: expiredTime,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('has expired');
    });

    test('should validate OIDC with valid accessToken', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('OIDC', { accessToken: 'oidc-token' });
      expect(result.valid).toBe(true);
    });

    test('should reject unknown auth type', async () => {
      const { validateCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = validateCredentials('UNKNOWN' as unknown as 'NONE', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown auth type');
    });
  });

  describe('mergeCredentials', () => {
    test('should merge multiple credential objects', async () => {
      const { mergeCredentials } = await import('../../../packages/a2a/src/credential.js');

      const creds1 = { apiKey: 'key1', extra: 'value1' };
      const creds2 = { accessToken: 'token', extra: 'value2' };

      const result = mergeCredentials(creds1, creds2);
      expect(result).toEqual({
        apiKey: 'key1',
        accessToken: 'token',
        extra: 'value2', // Later value wins
      });
    });

    test('should handle null/undefined sources', async () => {
      const { mergeCredentials } = await import('../../../packages/a2a/src/credential.js');

      const creds = { apiKey: 'key1' };

      const result = mergeCredentials(null, creds, undefined);
      expect(result).toEqual({ apiKey: 'key1' });
    });

    test('should return empty object for no sources', async () => {
      const { mergeCredentials } = await import('../../../packages/a2a/src/credential.js');

      const result = mergeCredentials();
      expect(result).toEqual({});
    });
  });
});
