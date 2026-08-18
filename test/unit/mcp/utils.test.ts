/**
 * Unit tests for MCP utility functions
 * Tests shared utilities used throughout the MCP package
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Import the actual module under test
import {
  SENSITIVE_KEY_REGEX,
  buildMcpHeaders,
  createTimeoutPromise,
  isPlainObject,
  isSensitiveKey,
  nullToUndefined,
  withTimeout,
} from '../../../packages/mcp/src/utils.js';

describe('MCP Utils', () => {
  describe('SENSITIVE_KEY_REGEX', () => {
    test('should match common sensitive key names', () => {
      const sensitiveKeys = [
        'apiKey',
        'api_key',
        'API_KEY',
        'secret',
        'SECRET_KEY',
        'clientSecret',
        'token',
        'accessToken',
        'access_token',
        'refreshToken',
        'password',
        'PASSWORD',
        'user_password',
        'credential',
        'credentials',
        'auth',
        'authorization',
        'authToken',
      ];

      for (const key of sensitiveKeys) {
        expect(SENSITIVE_KEY_REGEX.test(key)).toBe(true);
      }
    });

    test('should not match non-sensitive key names', () => {
      const nonSensitiveKeys = [
        'name',
        'email',
        'id',
        'userId',
        'organizationId',
        'description',
        'url',
        'domain',
        'port',
        'timeout',
        'limit',
        'offset',
        'page',
        'size',
        'enabled',
        'active',
        'createdAt',
        'updatedAt',
      ];

      for (const key of nonSensitiveKeys) {
        expect(SENSITIVE_KEY_REGEX.test(key)).toBe(false);
      }
    });

    test('should be case insensitive', () => {
      expect(SENSITIVE_KEY_REGEX.test('KEY')).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test('key')).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test('Key')).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test('TOKEN')).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test('token')).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test('Token')).toBe(true);
    });
  });

  describe('isPlainObject', () => {
    test('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ key: 'value' })).toBe(true);
      expect(isPlainObject({ nested: { deep: 'value' } })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    test('should return false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
      expect(isPlainObject(['a', 'b'])).toBe(false);
      expect(isPlainObject([{ key: 'value' }])).toBe(false);
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
      expect(isPlainObject(Symbol('test'))).toBe(false);
      expect(isPlainObject(BigInt(123))).toBe(false);
    });

    test('should return false for functions', () => {
      expect(isPlainObject(() => {})).toBe(false);
      expect(isPlainObject(function () {})).toBe(false);
      expect(isPlainObject(async () => {})).toBe(false);
    });

    test('should return false for Date objects (not plain objects)', () => {
      // Date has specialized prototype, not Object.prototype
      expect(isPlainObject(new Date())).toBe(false);
    });

    test('should return false for class instances (not plain objects)', () => {
      class TestClass {
        value = 1;
      }
      // Class instances have their class prototype, not Object.prototype
      expect(isPlainObject(new TestClass())).toBe(false);
    });
  });

  describe('isSensitiveKey', () => {
    test('should return true for sensitive keys', () => {
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('secret')).toBe(true);
      expect(isSensitiveKey('token')).toBe(true);
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('credential')).toBe(true);
      expect(isSensitiveKey('auth')).toBe(true);
    });

    test('should return false for non-sensitive keys', () => {
      expect(isSensitiveKey('name')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
      expect(isSensitiveKey('id')).toBe(false);
      expect(isSensitiveKey('url')).toBe(false);
    });

    test('should work with mixed case', () => {
      expect(isSensitiveKey('API_KEY')).toBe(true);
      expect(isSensitiveKey('ApiKey')).toBe(true);
      expect(isSensitiveKey('APIKEY')).toBe(true);
    });
  });

  describe('createTimeoutPromise', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('should reject after specified timeout', async () => {
      const promise = createTimeoutPromise(1000, 'Operation timed out');

      // Fast-forward time
      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow('Operation timed out');
    });

    test('should not reject before timeout', async () => {
      const promise = createTimeoutPromise(1000, 'Timeout');

      // Advance partially
      vi.advanceTimersByTime(500);

      // Promise should still be pending
      let rejected = false;
      promise.catch(() => {
        rejected = true;
      });

      // Give time for rejection to propagate
      await vi.advanceTimersByTimeAsync(0);

      expect(rejected).toBe(false);
    });

    test('should use custom error message', async () => {
      const customMessage = 'Custom timeout error: operation exceeded limit';
      const promise = createTimeoutPromise(100, customMessage);

      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow(customMessage);
    });

    test('should work with very short timeouts', async () => {
      const promise = createTimeoutPromise(1, 'Fast timeout');

      vi.advanceTimersByTime(1);

      await expect(promise).rejects.toThrow('Fast timeout');
    });

    test('should work with long timeouts', async () => {
      const promise = createTimeoutPromise(60000, 'Long timeout');

      vi.advanceTimersByTime(60000);

      await expect(promise).rejects.toThrow('Long timeout');
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('should resolve if promise completes before timeout', async () => {
      const fastPromise = Promise.resolve('success');
      const result = withTimeout(fastPromise, 1000, 'Timeout');

      await expect(result).resolves.toBe('success');
    });

    test('should reject with timeout error if promise takes too long', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 2000);
      });

      const withTimeoutPromise = withTimeout(slowPromise, 1000, 'Request timed out');

      vi.advanceTimersByTime(1000);

      await expect(withTimeoutPromise).rejects.toThrow('Request timed out');
    });

    test('should preserve rejection from original promise', async () => {
      const failingPromise = Promise.reject(new Error('Original error'));

      await expect(withTimeout(failingPromise, 1000, 'Timeout')).rejects.toThrow('Original error');
    });

    test('should return correct type', async () => {
      const typedPromise = Promise.resolve({ id: 1, name: 'test' });
      const result = await withTimeout(typedPromise, 1000, 'Timeout');

      expect(result).toEqual({ id: 1, name: 'test' });
    });

    test('should handle async operations', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const asyncOperation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'completed';
      };

      const result = await withTimeout(asyncOperation(), 1000, 'Timeout');
      expect(result).toBe('completed');
    });

    test('should timeout exactly at the specified duration', async () => {
      const neverResolves = new Promise(() => {});

      const withTimeoutPromise = withTimeout(neverResolves, 500, 'Exact timeout');

      // Not yet timed out
      vi.advanceTimersByTime(499);
      let timedOut = false;
      withTimeoutPromise.catch(() => {
        timedOut = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(timedOut).toBe(false);

      // Now it should timeout
      vi.advanceTimersByTime(1);
      await expect(withTimeoutPromise).rejects.toThrow('Exact timeout');
    });
  });

  describe('buildMcpHeaders', () => {
    test('should return default headers when no additional headers provided', () => {
      const headers = buildMcpHeaders();

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      });
    });

    test('should return default headers when undefined passed', () => {
      const headers = buildMcpHeaders(undefined);

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      });
    });

    test('should merge additional headers', () => {
      const headers = buildMcpHeaders({
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      });

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      });
    });

    test('should allow overriding default headers', () => {
      const headers = buildMcpHeaders({
        'Content-Type': 'text/plain',
      });

      expect(headers['Content-Type']).toBe('text/plain');
      expect(headers['Accept']).toBe('application/json, text/event-stream');
    });

    test('should handle empty additional headers object', () => {
      const headers = buildMcpHeaders({});

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      });
    });

    test('should preserve header casing', () => {
      const headers = buildMcpHeaders({
        'X-Api-Key': 'key123',
        'x-lowercase': 'value',
      });

      expect(headers['X-Api-Key']).toBe('key123');
      expect(headers['x-lowercase']).toBe('value');
    });

    test('should handle multiple custom headers', () => {
      const headers = buildMcpHeaders({
        Authorization: 'Bearer xyz',
        'X-Request-ID': 'req-123',
        'X-Correlation-ID': 'corr-456',
        'X-Trace-ID': 'trace-789',
      });

      expect(Object.keys(headers)).toHaveLength(6);
      expect(headers['Authorization']).toBe('Bearer xyz');
      expect(headers['X-Request-ID']).toBe('req-123');
      expect(headers['X-Correlation-ID']).toBe('corr-456');
      expect(headers['X-Trace-ID']).toBe('trace-789');
    });
  });

  describe('nullToUndefined', () => {
    test('should convert null to undefined', () => {
      expect(nullToUndefined(null)).toBeUndefined();
    });

    test('should keep undefined as undefined', () => {
      expect(nullToUndefined(undefined)).toBeUndefined();
    });

    test('should pass through non-null/undefined values', () => {
      expect(nullToUndefined('string')).toBe('string');
      expect(nullToUndefined(123)).toBe(123);
      expect(nullToUndefined(0)).toBe(0);
      expect(nullToUndefined('')).toBe('');
      expect(nullToUndefined(false)).toBe(false);
      expect(nullToUndefined(true)).toBe(true);
    });

    test('should pass through objects', () => {
      const obj = { key: 'value' };
      expect(nullToUndefined(obj)).toBe(obj);
    });

    test('should pass through arrays', () => {
      const arr = [1, 2, 3];
      expect(nullToUndefined(arr)).toBe(arr);
    });

    test('should pass through empty objects and arrays', () => {
      const emptyObj = {};
      const emptyArr: unknown[] = [];
      expect(nullToUndefined(emptyObj)).toBe(emptyObj);
      expect(nullToUndefined(emptyArr)).toBe(emptyArr);
    });

    test('should work with Date objects', () => {
      const date = new Date();
      expect(nullToUndefined(date)).toBe(date);
    });

    test('should handle nested null values (does not recurse)', () => {
      const objWithNull = { value: null };
      const result = nullToUndefined(objWithNull);
      // Function only converts top-level, not nested
      expect(result).toBe(objWithNull);
      expect((result as Record<string, unknown>).value).toBeNull();
    });
  });
});
