/**
 * Unit tests for MCP redaction utilities
 * Tests sensitive data redaction functions used by the MCP proxy
 */

import { describe, expect, test } from 'vitest';
import {
  isPlainObject,
  sanitizeObject,
  sanitizeRecord,
} from '../../../packages/mcp/src/redaction.js';

describe('MCP Redaction', () => {
  describe('isPlainObject', () => {
    test('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject({ nested: { deep: true } })).toBe(true);
    });

    test('should return false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
      expect(isPlainObject([{ a: 1 }])).toBe(false);
    });

    test('should return false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isPlainObject(undefined)).toBe(false);
    });

    test('should return false for primitives', () => {
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(false)).toBe(false);
      expect(isPlainObject(0)).toBe(false);
      expect(isPlainObject('')).toBe(false);
    });

    test('should return false for Date objects (not plain objects)', () => {
      // Date has specialized prototype, not Object.prototype
      expect(isPlainObject(new Date())).toBe(false);
    });

    test('should return false for RegExp (not plain objects)', () => {
      // RegExp has specialized prototype, not Object.prototype
      expect(isPlainObject(/test/)).toBe(false);
    });

    test('should return false for functions', () => {
      expect(isPlainObject(() => {})).toBe(false);
      expect(isPlainObject(function test() {})).toBe(false);
    });
  });

  describe('sanitizeObject', () => {
    describe('primitives pass through unchanged', () => {
      test('should pass through strings', () => {
        expect(sanitizeObject('hello')).toBe('hello');
        expect(sanitizeObject('')).toBe('');
      });

      test('should pass through numbers', () => {
        expect(sanitizeObject(123)).toBe(123);
        expect(sanitizeObject(0)).toBe(0);
        expect(sanitizeObject(-42)).toBe(-42);
        expect(sanitizeObject(3.14)).toBe(3.14);
      });

      test('should pass through booleans', () => {
        expect(sanitizeObject(true)).toBe(true);
        expect(sanitizeObject(false)).toBe(false);
      });

      test('should pass through null', () => {
        expect(sanitizeObject(null)).toBe(null);
      });

      test('should pass through undefined', () => {
        expect(sanitizeObject(undefined)).toBe(undefined);
      });
    });

    describe('array handling', () => {
      test('should recursively sanitize array elements', () => {
        const input = [1, 'hello', { name: 'test' }];
        const result = sanitizeObject(input);
        expect(result).toEqual([1, 'hello', { name: 'test' }]);
      });

      test('should redact sensitive keys in array objects', () => {
        const input = [
          { apiKey: 'secret123', name: 'server1' },
          { password: 'pass456', name: 'server2' },
        ];
        const result = sanitizeObject(input);
        expect(result).toEqual([
          { apiKey: '[REDACTED]', name: 'server1' },
          { password: '[REDACTED]', name: 'server2' },
        ]);
      });

      test('should handle nested arrays', () => {
        const input = [[{ secret: 'nested' }]];
        const result = sanitizeObject(input);
        expect(result).toEqual([[{ secret: '[REDACTED]' }]]);
      });

      test('should handle empty arrays', () => {
        expect(sanitizeObject([])).toEqual([]);
      });
    });

    describe('object handling', () => {
      test('should preserve non-sensitive keys', () => {
        const input = { name: 'test', value: 123, active: true };
        const result = sanitizeObject(input);
        expect(result).toEqual({ name: 'test', value: 123, active: true });
      });

      test('should redact sensitive keys', () => {
        const input = { apiKey: 'sk-12345', name: 'test' };
        const result = sanitizeObject(input);
        expect(result).toEqual({ apiKey: '[REDACTED]', name: 'test' });
      });

      test('should handle empty objects', () => {
        expect(sanitizeObject({})).toEqual({});
      });

      test('should handle deeply nested objects', () => {
        const input = {
          level1: {
            level2: {
              level3: {
                password: 'deep-secret',
                data: 'safe',
              },
            },
          },
        };
        const result = sanitizeObject(input);
        expect(result).toEqual({
          level1: {
            level2: {
              level3: {
                password: '[REDACTED]',
                data: 'safe',
              },
            },
          },
        });
      });
    });

    describe('sensitive key patterns', () => {
      test('should redact keys containing "key" (case-insensitive)', () => {
        expect(sanitizeObject({ apiKey: 'x' })).toEqual({ apiKey: '[REDACTED]' });
        expect(sanitizeObject({ API_KEY: 'x' })).toEqual({ API_KEY: '[REDACTED]' });
        expect(sanitizeObject({ apikey: 'x' })).toEqual({ apikey: '[REDACTED]' });
        expect(sanitizeObject({ KeyData: 'x' })).toEqual({ KeyData: '[REDACTED]' });
        expect(sanitizeObject({ myKeyValue: 'x' })).toEqual({ myKeyValue: '[REDACTED]' });
      });

      test('should redact keys containing "secret" (case-insensitive)', () => {
        expect(sanitizeObject({ secret: 'x' })).toEqual({ secret: '[REDACTED]' });
        expect(sanitizeObject({ SECRET: 'x' })).toEqual({ SECRET: '[REDACTED]' });
        expect(sanitizeObject({ clientSecret: 'x' })).toEqual({ clientSecret: '[REDACTED]' });
        expect(sanitizeObject({ secretValue: 'x' })).toEqual({ secretValue: '[REDACTED]' });
      });

      test('should redact keys containing "token" (case-insensitive)', () => {
        expect(sanitizeObject({ token: 'x' })).toEqual({ token: '[REDACTED]' });
        expect(sanitizeObject({ TOKEN: 'x' })).toEqual({ TOKEN: '[REDACTED]' });
        expect(sanitizeObject({ accessToken: 'x' })).toEqual({ accessToken: '[REDACTED]' });
        expect(sanitizeObject({ refreshToken: 'x' })).toEqual({ refreshToken: '[REDACTED]' });
        expect(sanitizeObject({ bearerToken: 'x' })).toEqual({ bearerToken: '[REDACTED]' });
      });

      test('should redact keys containing "password" (case-insensitive)', () => {
        expect(sanitizeObject({ password: 'x' })).toEqual({ password: '[REDACTED]' });
        expect(sanitizeObject({ PASSWORD: 'x' })).toEqual({ PASSWORD: '[REDACTED]' });
        expect(sanitizeObject({ userPassword: 'x' })).toEqual({ userPassword: '[REDACTED]' });
        expect(sanitizeObject({ passwordHash: 'x' })).toEqual({ passwordHash: '[REDACTED]' });
      });

      test('should redact keys containing "credential" (case-insensitive)', () => {
        expect(sanitizeObject({ credential: 'x' })).toEqual({ credential: '[REDACTED]' });
        expect(sanitizeObject({ CREDENTIALS: 'x' })).toEqual({ CREDENTIALS: '[REDACTED]' });
        expect(sanitizeObject({ userCredentials: 'x' })).toEqual({ userCredentials: '[REDACTED]' });
      });

      test('should redact keys containing "auth" (case-insensitive)', () => {
        expect(sanitizeObject({ auth: 'x' })).toEqual({ auth: '[REDACTED]' });
        expect(sanitizeObject({ AUTH: 'x' })).toEqual({ AUTH: '[REDACTED]' });
        expect(sanitizeObject({ authorization: 'x' })).toEqual({ authorization: '[REDACTED]' });
        expect(sanitizeObject({ authToken: 'x' })).toEqual({ authToken: '[REDACTED]' });
        expect(sanitizeObject({ oauthData: 'x' })).toEqual({ oauthData: '[REDACTED]' });
      });

      test('should NOT redact keys that do not match patterns', () => {
        const input = {
          name: 'value',
          description: 'text',
          id: '123',
          url: 'https://example.com',
          config: { setting: true },
        };
        const result = sanitizeObject(input);
        expect(result).toEqual(input);
      });
    });

    describe('complex mixed structures', () => {
      test('should handle mixed objects and arrays with sensitive data', () => {
        const input = {
          users: [
            { id: 1, password: 'pass1', name: 'Alice' },
            { id: 2, password: 'pass2', name: 'Bob' },
          ],
          settings: {
            apiKey: 'sk-abc',
            config: {
              timeout: 5000,
              secret: 'hidden',
            },
          },
          metadata: {
            version: '1.0',
          },
        };
        const result = sanitizeObject(input);
        expect(result).toEqual({
          users: [
            { id: 1, password: '[REDACTED]', name: 'Alice' },
            { id: 2, password: '[REDACTED]', name: 'Bob' },
          ],
          settings: {
            apiKey: '[REDACTED]',
            config: {
              timeout: 5000,
              secret: '[REDACTED]',
            },
          },
          metadata: {
            version: '1.0',
          },
        });
      });

      test('should handle realistic MCP server config', () => {
        const input = {
          serverId: 'srv-123',
          name: 'GitHub Server',
          url: 'https://api.github.com',
          credentials: {
            apiKey: 'ghp_xxxxxxxxxxxx',
            clientSecret: 'cs_yyyyyyyy',
          },
          config: {
            timeout: 30000,
            retries: 3,
          },
        };
        const result = sanitizeObject(input);
        expect(result).toEqual({
          serverId: 'srv-123',
          name: 'GitHub Server',
          url: 'https://api.github.com',
          credentials: '[REDACTED]',
          config: {
            timeout: 30000,
            retries: 3,
          },
        });
      });

      test('should handle OAuth token response', () => {
        const input = {
          accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...',
          refreshToken: 'rt_xxxxxxxxxxxxx',
          tokenType: 'Bearer',
          expiresIn: 3600,
          scope: 'read write',
        };
        const result = sanitizeObject(input);
        expect(result).toEqual({
          accessToken: '[REDACTED]',
          refreshToken: '[REDACTED]',
          tokenType: '[REDACTED]', // Note: contains "token" so it gets redacted
          expiresIn: 3600,
          scope: 'read write',
        });
      });
    });

    describe('edge cases', () => {
      test('should handle objects with numeric keys', () => {
        const input = { '0': 'first', '1': 'second', apiKey: 'secret' };
        const result = sanitizeObject(input);
        expect(result).toEqual({ '0': 'first', '1': 'second', apiKey: '[REDACTED]' });
      });

      test('should handle objects with symbol-like string keys', () => {
        const input = { 'Symbol(key)': 'value', secretData: 'hidden' };
        const result = sanitizeObject(input);
        expect(result).toEqual({ 'Symbol(key)': '[REDACTED]', secretData: '[REDACTED]' });
      });

      test('should handle very deep nesting', () => {
        let deep: unknown = { secret: 'bottom' };
        for (let i = 0; i < 10; i++) {
          deep = { level: deep };
        }
        const result = sanitizeObject(deep) as Record<string, unknown>;

        // Traverse to the bottom and verify secret is redacted
        let current = result;
        for (let i = 0; i < 10; i++) {
          current = current.level as Record<string, unknown>;
        }
        expect(current).toEqual({ secret: '[REDACTED]' });
      });

      test('should handle objects with null values', () => {
        const input = { name: null, password: null };
        const result = sanitizeObject(input);
        expect(result).toEqual({ name: null, password: '[REDACTED]' });
      });

      test('should handle objects with undefined values', () => {
        const input = { name: undefined, token: undefined };
        const result = sanitizeObject(input);
        expect(result).toEqual({ name: undefined, token: '[REDACTED]' });
      });

      test('should handle objects with empty string keys', () => {
        const input = { '': 'empty key', apiKey: 'secret' };
        const result = sanitizeObject(input);
        expect(result).toEqual({ '': 'empty key', apiKey: '[REDACTED]' });
      });

      test('should preserve object key order', () => {
        const input = { z: 1, a: 2, secret: 'x', m: 3 };
        const result = sanitizeObject(input) as Record<string, unknown>;
        expect(Object.keys(result)).toEqual(['z', 'a', 'secret', 'm']);
      });
    });
  });

  describe('sanitizeRecord', () => {
    test('should sanitize a simple record', () => {
      const record: Record<string, unknown> = { name: 'test', apiKey: 'secret' };
      const result = sanitizeRecord(record);
      expect(result).toEqual({ name: 'test', apiKey: '[REDACTED]' });
    });

    test('should sanitize a nested record', () => {
      const record: Record<string, unknown> = {
        config: {
          secret: 'hidden',
          visible: true,
        },
      };
      const result = sanitizeRecord(record);
      expect(result).toEqual({
        config: {
          secret: '[REDACTED]',
          visible: true,
        },
      });
    });

    test('should return empty object for empty input', () => {
      const result = sanitizeRecord({});
      expect(result).toEqual({});
    });

    test('should handle record with array values', () => {
      const record: Record<string, unknown> = {
        items: [{ password: 'p1' }, { password: 'p2' }],
      };
      const result = sanitizeRecord(record);
      expect(result).toEqual({
        items: [{ password: '[REDACTED]' }, { password: '[REDACTED]' }],
      });
    });

    test('should handle record with mixed value types', () => {
      const record: Record<string, unknown> = {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        object: { key: 'redact' },
        array: [1, 2, 3],
      };
      const result = sanitizeRecord(record);
      expect(result).toEqual({
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        object: { key: '[REDACTED]' },
        array: [1, 2, 3],
      });
    });

    test('should return Record type (type safety)', () => {
      const input: Record<string, unknown> = { test: 'value' };
      const result: Record<string, unknown> = sanitizeRecord(input);
      expect(typeof result).toBe('object');
      expect(Array.isArray(result)).toBe(false);
    });

    test('should always return a plain object for valid record input', () => {
      // This tests that sanitizeRecord always returns a plain object
      // The internal fallback to {} should never be reached with valid input
      // because sanitizeObject preserves structure (record in = record out)

      const testCases = [
        {},
        { simple: 'value' },
        { nested: { deep: { secret: 'value' } } },
        { array: [1, 2, 3] },
        { mixed: { arr: [{ key: 'val' }], num: 42 } },
      ];

      for (const input of testCases) {
        const result = sanitizeRecord(input);
        expect(typeof result).toBe('object');
        expect(result).not.toBeNull();
        expect(Array.isArray(result)).toBe(false);
      }
    });
  });

  describe('real-world scenarios', () => {
    test('should sanitize audit log entry data', () => {
      const auditEntry = {
        action: 'tool_invocation',
        userId: 'user-123',
        tool: 'github::createIssue',
        input: {
          title: 'Bug report',
          body: 'Details here',
          headers: {
            authorization: 'Bearer token123',
          },
        },
        result: 'success',
      };
      const result = sanitizeObject(auditEntry);
      expect(result).toEqual({
        action: 'tool_invocation',
        userId: 'user-123',
        tool: 'github::createIssue',
        input: {
          title: 'Bug report',
          body: 'Details here',
          headers: {
            authorization: '[REDACTED]',
          },
        },
        result: 'success',
      });
    });

    test('should sanitize environment variables object', () => {
      const envVars = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://...',
        API_KEY: 'sk-xxxxx',
        SECRET_KEY: 'secret123',
        PORT: '3000',
        AUTH_TOKEN: 'jwt_token_here',
      };
      const result = sanitizeObject(envVars);
      expect(result).toEqual({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://...',
        API_KEY: '[REDACTED]',
        SECRET_KEY: '[REDACTED]',
        PORT: '3000',
        AUTH_TOKEN: '[REDACTED]',
      });
    });

    test('should sanitize webhook payload', () => {
      const webhook = {
        event: 'user.created',
        timestamp: '2024-01-01T00:00:00Z',
        data: {
          userId: 'u-123',
          email: 'user@example.com',
        },
        signature: {
          hmacSecret: 'webhook_secret',
          algorithm: 'sha256',
        },
      };
      const result = sanitizeObject(webhook);
      expect(result).toEqual({
        event: 'user.created',
        timestamp: '2024-01-01T00:00:00Z',
        data: {
          userId: 'u-123',
          email: 'user@example.com',
        },
        signature: {
          hmacSecret: '[REDACTED]',
          algorithm: 'sha256',
        },
      });
    });

    test('should sanitize database connection config', () => {
      const dbConfig = {
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'admin',
        password: 'db_password_123',
        ssl: {
          key: 'ssl_private_key',
          cert: 'ssl_certificate',
        },
      };
      const result = sanitizeObject(dbConfig);
      expect(result).toEqual({
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'admin',
        password: '[REDACTED]',
        ssl: {
          key: '[REDACTED]',
          cert: 'ssl_certificate',
        },
      });
    });
  });
});
