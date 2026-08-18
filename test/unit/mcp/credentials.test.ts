/**
 * Unit tests for MCP Credentials utilities
 * Tests credential header building, injection, and validation
 */

import { describe, expect, test } from 'vitest';
import {
  buildCredentialHeaders,
  extractCredentialMeta,
  extractHeaderOverrides,
  extractInjectedToolParams,
  hasAuthMaterial,
  isPlainObject,
  isSensitiveKey,
  stripReservedCredentials,
} from '../../../packages/mcp/src/credentials.js';

describe('MCP Credentials', () => {
  describe('isPlainObject', () => {
    test('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ key: 'value' })).toBe(true);
      expect(isPlainObject({ nested: { deep: true } })).toBe(true);
    });

    test('should return false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
      expect(isPlainObject(['a', 'b'])).toBe(false);
    });

    test('should return false for null and undefined', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
    });

    test('should return false for primitives', () => {
      expect(isPlainObject('')).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(0)).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(false)).toBe(false);
    });

    test('should return false for Date and RegExp (not plain objects)', () => {
      // Date and RegExp are objects but have specialized prototypes, not Object.prototype
      // isPlainObject specifically checks for plain objects
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(/regex/)).toBe(false);
    });

    test('should return false for functions', () => {
      expect(isPlainObject(() => {})).toBe(false);
      expect(isPlainObject(function test() {})).toBe(false);
    });
  });

  describe('extractCredentialMeta', () => {
    test('should return default meta when credentials is null', () => {
      const meta = extractCredentialMeta(null);
      expect(meta).toEqual({ injectIntoToolParams: false });
    });

    test('should return default meta when _sentinel is missing', () => {
      const meta = extractCredentialMeta({ apiKey: 'test' });
      expect(meta).toEqual({ injectIntoToolParams: false });
    });

    test('should return default meta when _sentinel is not an object', () => {
      const meta = extractCredentialMeta({ _sentinel: 'string' });
      expect(meta).toEqual({ injectIntoToolParams: false });
    });

    test('should extract injectIntoToolParams when true', () => {
      const meta = extractCredentialMeta({
        _sentinel: { injectIntoToolParams: true },
      });
      expect(meta).toEqual({ injectIntoToolParams: true });
    });

    test('should extract injectIntoToolParams when false', () => {
      const meta = extractCredentialMeta({
        _sentinel: { injectIntoToolParams: false },
      });
      expect(meta).toEqual({ injectIntoToolParams: false });
    });

    test('should treat falsy values as false', () => {
      expect(extractCredentialMeta({ _sentinel: { injectIntoToolParams: 0 } })).toEqual({
        injectIntoToolParams: false,
      });
      expect(extractCredentialMeta({ _sentinel: { injectIntoToolParams: '' } })).toEqual({
        injectIntoToolParams: false,
      });
      expect(extractCredentialMeta({ _sentinel: { injectIntoToolParams: null } })).toEqual({
        injectIntoToolParams: false,
      });
    });

    test('should treat truthy values as true', () => {
      expect(extractCredentialMeta({ _sentinel: { injectIntoToolParams: 1 } })).toEqual({
        injectIntoToolParams: true,
      });
      expect(extractCredentialMeta({ _sentinel: { injectIntoToolParams: 'yes' } })).toEqual({
        injectIntoToolParams: true,
      });
    });
  });

  describe('extractHeaderOverrides', () => {
    test('should return empty object when credentials is null', () => {
      expect(extractHeaderOverrides(null)).toEqual({});
    });

    test('should return empty object when headers is missing', () => {
      expect(extractHeaderOverrides({ apiKey: 'test' })).toEqual({});
    });

    test('should return empty object when headers is not an object', () => {
      expect(extractHeaderOverrides({ headers: 'string' })).toEqual({});
      expect(extractHeaderOverrides({ headers: 123 })).toEqual({});
      expect(extractHeaderOverrides({ headers: null })).toEqual({});
    });

    test('should extract string headers', () => {
      const overrides = extractHeaderOverrides({
        headers: {
          'X-Custom-Header': 'value',
          Authorization: 'Bearer token',
        },
      });
      expect(overrides).toEqual({
        'X-Custom-Header': 'value',
        Authorization: 'Bearer token',
      });
    });

    test('should stringify non-string values', () => {
      const overrides = extractHeaderOverrides({
        headers: {
          'X-Number': 123,
          'X-Bool': true,
          'X-Object': { key: 'value' },
        },
      });
      expect(overrides).toEqual({
        'X-Number': '123',
        'X-Bool': 'true',
        'X-Object': '{"key":"value"}',
      });
    });

    test('should skip undefined values', () => {
      const overrides = extractHeaderOverrides({
        headers: {
          'X-Present': 'value',
          'X-Undefined': undefined,
        },
      });
      expect(overrides).toEqual({ 'X-Present': 'value' });
    });

    test('should include null as stringified', () => {
      const overrides = extractHeaderOverrides({
        headers: { 'X-Null': null },
      });
      expect(overrides).toEqual({ 'X-Null': 'null' });
    });
  });

  describe('stripReservedCredentials', () => {
    test('should strip headers key', () => {
      const stripped = stripReservedCredentials({
        apiKey: 'test',
        headers: { 'X-Custom': 'value' },
      });
      expect(stripped).toEqual({ apiKey: 'test' });
    });

    test('should strip toolParams key', () => {
      const stripped = stripReservedCredentials({
        apiKey: 'test',
        toolParams: { param: 'value' },
      });
      expect(stripped).toEqual({ apiKey: 'test' });
    });

    test('should strip _sentinel key', () => {
      const stripped = stripReservedCredentials({
        apiKey: 'test',
        _sentinel: { injectIntoToolParams: true },
      });
      expect(stripped).toEqual({ apiKey: 'test' });
    });

    test('should strip all reserved keys at once', () => {
      const stripped = stripReservedCredentials({
        apiKey: 'test',
        secret: 'xyz',
        headers: { 'X-Custom': 'value' },
        toolParams: { param: 'value' },
        _sentinel: { injectIntoToolParams: true },
      });
      expect(stripped).toEqual({ apiKey: 'test', secret: 'xyz' });
    });

    test('should preserve non-reserved keys', () => {
      const stripped = stripReservedCredentials({
        apiKey: 'test',
        username: 'user',
        password: 'pass',
        customField: 123,
      });
      expect(stripped).toEqual({
        apiKey: 'test',
        username: 'user',
        password: 'pass',
        customField: 123,
      });
    });

    test('should handle empty credentials', () => {
      expect(stripReservedCredentials({})).toEqual({});
    });
  });

  describe('extractInjectedToolParams', () => {
    test('should return null when credentials is null', () => {
      expect(extractInjectedToolParams(null)).toBeNull();
    });

    test('should return null when no injection and no toolParams', () => {
      expect(extractInjectedToolParams({ apiKey: 'test' })).toBeNull();
    });

    test('should return toolParams when present without injection', () => {
      const result = extractInjectedToolParams({
        apiKey: 'test',
        toolParams: { param1: 'value1' },
      });
      expect(result).toEqual({ param1: 'value1' });
    });

    test('should inject all credentials when injectIntoToolParams is true', () => {
      const result = extractInjectedToolParams({
        apiKey: 'test-key',
        username: 'user',
        _sentinel: { injectIntoToolParams: true },
      });
      expect(result).toEqual({
        apiKey: 'test-key',
        username: 'user',
      });
    });

    test('should merge injected credentials with toolParams', () => {
      const result = extractInjectedToolParams({
        apiKey: 'test-key',
        _sentinel: { injectIntoToolParams: true },
        toolParams: { extraParam: 'extra' },
      });
      expect(result).toEqual({
        apiKey: 'test-key',
        extraParam: 'extra',
      });
    });

    test('should strip reserved keys when injecting', () => {
      const result = extractInjectedToolParams({
        apiKey: 'test-key',
        headers: { 'X-Custom': 'value' },
        _sentinel: { injectIntoToolParams: true },
        toolParams: { override: 'yes' },
      });
      expect(result).toEqual({
        apiKey: 'test-key',
        override: 'yes',
      });
      expect(result).not.toHaveProperty('headers');
      expect(result).not.toHaveProperty('_sentinel');
      expect(result).not.toHaveProperty('toolParams');
    });

    test('should handle deep merge with nested objects', () => {
      const result = extractInjectedToolParams({
        config: { a: 1, b: 2 },
        _sentinel: { injectIntoToolParams: true },
        toolParams: { config: { b: 3, c: 4 } },
      });
      expect(result).toEqual({
        config: { a: 1, b: 3, c: 4 },
      });
    });

    test('should return empty toolParams as null', () => {
      const result = extractInjectedToolParams({
        apiKey: 'test',
        toolParams: {},
      });
      expect(result).toBeNull();
    });
  });

  describe('buildCredentialHeaders', () => {
    test('should return empty headers for NONE auth type', () => {
      expect(buildCredentialHeaders('NONE', null)).toEqual({});
      expect(buildCredentialHeaders('NONE', { apiKey: 'test' })).toEqual({});
    });

    test('should build Authorization header for API_KEY with apiKey', () => {
      const headers = buildCredentialHeaders('API_KEY', { apiKey: 'my-api-key' });
      expect(headers).toEqual({ Authorization: 'Bearer my-api-key' });
    });

    test('should not build Authorization for API_KEY without apiKey', () => {
      expect(buildCredentialHeaders('API_KEY', null)).toEqual({});
      expect(buildCredentialHeaders('API_KEY', {})).toEqual({});
      expect(buildCredentialHeaders('API_KEY', { apiKey: 123 })).toEqual({});
    });

    test('should build Authorization header for OAUTH with accessToken', () => {
      const headers = buildCredentialHeaders('OAUTH', { accessToken: 'my-access-token' });
      expect(headers).toEqual({ Authorization: 'Bearer my-access-token' });
    });

    test('should not build Authorization for OAUTH without accessToken', () => {
      expect(buildCredentialHeaders('OAUTH', null)).toEqual({});
      expect(buildCredentialHeaders('OAUTH', {})).toEqual({});
      expect(buildCredentialHeaders('OAUTH', { accessToken: 123 })).toEqual({});
    });

    test('should include header overrides', () => {
      const headers = buildCredentialHeaders('API_KEY', {
        apiKey: 'test',
        headers: { 'X-Custom': 'value' },
      });
      expect(headers).toEqual({
        Authorization: 'Bearer test',
        'X-Custom': 'value',
      });
    });

    test('should allow header overrides to override Authorization', () => {
      const headers = buildCredentialHeaders('API_KEY', {
        apiKey: 'original',
        headers: { Authorization: 'Custom auth' },
      });
      expect(headers).toEqual({ Authorization: 'Custom auth' });
    });

    test('should handle NONE auth with header overrides', () => {
      const headers = buildCredentialHeaders('NONE', {
        headers: {
          'X-Api-Key': 'custom-key',
          'Content-Type': 'application/json',
        },
      });
      expect(headers).toEqual({
        'X-Api-Key': 'custom-key',
        'Content-Type': 'application/json',
      });
    });
  });

  describe('hasAuthMaterial', () => {
    test('should return false for null credentials', () => {
      expect(hasAuthMaterial(null)).toBe(false);
    });

    test('should return false for empty credentials', () => {
      expect(hasAuthMaterial({})).toBe(false);
    });

    test('should return true when apiKey is present and non-empty', () => {
      expect(hasAuthMaterial({ apiKey: 'test' })).toBe(true);
      expect(hasAuthMaterial({ apiKey: 'a' })).toBe(true);
    });

    test('should return false when apiKey is empty or whitespace', () => {
      expect(hasAuthMaterial({ apiKey: '' })).toBe(false);
      expect(hasAuthMaterial({ apiKey: '   ' })).toBe(false);
      expect(hasAuthMaterial({ apiKey: '\t\n' })).toBe(false);
    });

    test('should return false when apiKey is not a string', () => {
      expect(hasAuthMaterial({ apiKey: 123 })).toBe(false);
      expect(hasAuthMaterial({ apiKey: null })).toBe(false);
      expect(hasAuthMaterial({ apiKey: undefined })).toBe(false);
    });

    test('should return true when accessToken is present and non-empty', () => {
      expect(hasAuthMaterial({ accessToken: 'token' })).toBe(true);
    });

    test('should return false when accessToken is empty or whitespace', () => {
      expect(hasAuthMaterial({ accessToken: '' })).toBe(false);
      expect(hasAuthMaterial({ accessToken: '  ' })).toBe(false);
    });

    test('should return true when headers is present and non-empty', () => {
      expect(hasAuthMaterial({ headers: { 'X-Custom': 'value' } })).toBe(true);
    });

    test('should return false when headers is empty', () => {
      expect(hasAuthMaterial({ headers: {} })).toBe(false);
    });

    test('should return false when headers is not an object', () => {
      expect(hasAuthMaterial({ headers: 'string' })).toBe(false);
      expect(hasAuthMaterial({ headers: null })).toBe(false);
    });

    test('should check all auth sources', () => {
      // Only apiKey
      expect(hasAuthMaterial({ apiKey: 'key' })).toBe(true);
      // Only accessToken
      expect(hasAuthMaterial({ accessToken: 'token' })).toBe(true);
      // Only headers
      expect(hasAuthMaterial({ headers: { H: 'v' } })).toBe(true);
      // All present
      expect(hasAuthMaterial({ apiKey: 'k', accessToken: 't', headers: { H: 'v' } })).toBe(true);
    });
  });

  describe('isSensitiveKey', () => {
    test('should match keys containing "key"', () => {
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('API_KEY')).toBe(true);
      expect(isSensitiveKey('privateKey')).toBe(true);
      expect(isSensitiveKey('publicKey')).toBe(true);
      expect(isSensitiveKey('key')).toBe(true);
      expect(isSensitiveKey('KEY')).toBe(true);
    });

    test('should match keys containing "secret"', () => {
      expect(isSensitiveKey('clientSecret')).toBe(true);
      expect(isSensitiveKey('SECRET')).toBe(true);
      expect(isSensitiveKey('secret_key')).toBe(true);
    });

    test('should match keys containing "token"', () => {
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('refreshToken')).toBe(true);
      expect(isSensitiveKey('TOKEN')).toBe(true);
      expect(isSensitiveKey('bearerToken')).toBe(true);
    });

    test('should match keys containing "password"', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('PASSWORD')).toBe(true);
      expect(isSensitiveKey('userPassword')).toBe(true);
    });

    test('should match keys containing "credential"', () => {
      expect(isSensitiveKey('credential')).toBe(true);
      expect(isSensitiveKey('credentials')).toBe(true);
      expect(isSensitiveKey('CREDENTIAL')).toBe(true);
    });

    test('should match keys containing "auth"', () => {
      expect(isSensitiveKey('auth')).toBe(true);
      expect(isSensitiveKey('AUTH')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('authToken')).toBe(true);
    });

    test('should not match unrelated keys', () => {
      expect(isSensitiveKey('username')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
      expect(isSensitiveKey('id')).toBe(false);
      expect(isSensitiveKey('name')).toBe(false);
      expect(isSensitiveKey('data')).toBe(false);
      expect(isSensitiveKey('value')).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(isSensitiveKey('KeY')).toBe(true);
      expect(isSensitiveKey('SeCrEt')).toBe(true);
      expect(isSensitiveKey('ToKeN')).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('buildCredentialHeaders handles complex credential objects', () => {
      const headers = buildCredentialHeaders('OAUTH', {
        accessToken: 'token123',
        refreshToken: 'refresh456',
        expiresAt: Date.now() + 3600000,
        headers: {
          'X-Request-ID': 'req-123',
          'X-Trace-ID': 'trace-456',
        },
        _sentinel: { injectIntoToolParams: false },
        toolParams: { workspace: 'default' },
      });

      expect(headers).toEqual({
        Authorization: 'Bearer token123',
        'X-Request-ID': 'req-123',
        'X-Trace-ID': 'trace-456',
      });
    });

    test('extractInjectedToolParams handles deeply nested structures', () => {
      const result = extractInjectedToolParams({
        level1: {
          level2: {
            level3: 'deep',
          },
        },
        _sentinel: { injectIntoToolParams: true },
        toolParams: {
          level1: {
            level2: {
              override: 'new',
            },
          },
        },
      });

      expect(result).toEqual({
        level1: {
          level2: {
            level3: 'deep',
            override: 'new',
          },
        },
      });
    });

    test('credential functions handle special characters', () => {
      const credentials = {
        apiKey: 'key-with-special-chars!@#$%',
        headers: {
          'X-Unicode': '你好',
          'X-Emoji': '👍',
        },
      };

      const headers = buildCredentialHeaders('API_KEY', credentials);
      expect(headers['Authorization']).toBe('Bearer key-with-special-chars!@#$%');
      expect(headers['X-Unicode']).toBe('你好');
      expect(headers['X-Emoji']).toBe('👍');
    });

    test('hasAuthMaterial checks trim correctly', () => {
      expect(hasAuthMaterial({ apiKey: ' valid ' })).toBe(true);
      expect(hasAuthMaterial({ accessToken: ' valid ' })).toBe(true);
    });

    test('stripReservedCredentials preserves prototype-less objects', () => {
      const obj = Object.create(null);
      obj.apiKey = 'test';
      obj.headers = { h: 'v' };

      const stripped = stripReservedCredentials(obj);
      expect(stripped).toEqual({ apiKey: 'test' });
    });
  });
});
