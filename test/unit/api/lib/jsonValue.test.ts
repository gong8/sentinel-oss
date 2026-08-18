/**
 * Tests for JSON Value Utilities
 * Tests type-safe JSON value conversion for Prisma
 */

import { describe, expect, test, vi } from 'vitest';
import { _testing, toJsonValue } from '../../../../packages/api/src/lib/jsonValue.js';

const { isInputJsonValue } = _testing;

describe('toJsonValue', () => {
  describe('primitive values', () => {
    test('should convert string to InputJsonValue', () => {
      const result = toJsonValue('hello');
      expect(result).toBe('hello');
    });

    test('should convert number to InputJsonValue', () => {
      const result = toJsonValue(42);
      expect(result).toBe(42);
    });

    test('should convert float to InputJsonValue', () => {
      const result = toJsonValue(3.14);
      expect(result).toBe(3.14);
    });

    test('should convert boolean true to InputJsonValue', () => {
      const result = toJsonValue(true);
      expect(result).toBe(true);
    });

    test('should convert boolean false to InputJsonValue', () => {
      const result = toJsonValue(false);
      expect(result).toBe(false);
    });

    test('should convert zero to InputJsonValue', () => {
      const result = toJsonValue(0);
      expect(result).toBe(0);
    });

    test('should convert empty string to InputJsonValue', () => {
      const result = toJsonValue('');
      expect(result).toBe('');
    });

    test('should convert negative number to InputJsonValue', () => {
      const result = toJsonValue(-100);
      expect(result).toBe(-100);
    });
  });

  describe('object values', () => {
    test('should convert simple object to InputJsonValue', () => {
      const input = { name: 'John', age: 30 };
      const result = toJsonValue(input);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    test('should convert nested object to InputJsonValue', () => {
      const input = {
        user: {
          name: 'John',
          address: {
            city: 'NYC',
            zip: '10001',
          },
        },
      };
      const result = toJsonValue(input);
      expect(result).toEqual(input);
    });

    test('should convert empty object to InputJsonValue', () => {
      const result = toJsonValue({});
      expect(result).toEqual({});
    });

    test('should convert object with null values to InputJsonValue', () => {
      const input = { name: 'John', middle: null };
      const result = toJsonValue(input);
      expect(result).toEqual({ name: 'John', middle: null });
    });

    test('should convert object with mixed types to InputJsonValue', () => {
      const input = {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { key: 'value' },
      };
      const result = toJsonValue(input);
      expect(result).toEqual(input);
    });
  });

  describe('array values', () => {
    test('should convert string array to InputJsonValue', () => {
      const input = ['a', 'b', 'c'];
      const result = toJsonValue(input);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    test('should convert number array to InputJsonValue', () => {
      const input = [1, 2, 3];
      const result = toJsonValue(input);
      expect(result).toEqual([1, 2, 3]);
    });

    test('should convert empty array to InputJsonValue', () => {
      const result = toJsonValue([]);
      expect(result).toEqual([]);
    });

    test('should convert mixed array to InputJsonValue', () => {
      const input = ['string', 42, true, null];
      const result = toJsonValue(input);
      expect(result).toEqual(['string', 42, true, null]);
    });

    test('should convert nested array to InputJsonValue', () => {
      const input = [
        [1, 2],
        [3, 4],
        [5, 6],
      ];
      const result = toJsonValue(input);
      expect(result).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
    });

    test('should convert array of objects to InputJsonValue', () => {
      const input = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = toJsonValue(input);
      expect(result).toEqual(input);
    });

    test('should convert array with null elements to InputJsonValue', () => {
      const input = [1, null, 3];
      const result = toJsonValue(input);
      expect(result).toEqual([1, null, 3]);
    });
  });

  describe('error cases', () => {
    test('should throw for null value', () => {
      expect(() => toJsonValue(null)).toThrow(
        'Cannot convert null to InputJsonValue. Use Prisma.JsonNull instead.',
      );
    });

    test('should throw for undefined value', () => {
      expect(() => toJsonValue(undefined)).toThrow();
    });
  });

  describe('JSON serialization edge cases', () => {
    test('should strip undefined properties during serialization', () => {
      const input = { name: 'John', age: undefined };
      const result = toJsonValue(input);
      // undefined is stripped by JSON.stringify
      expect(result).toEqual({ name: 'John' });
    });

    test('should handle special number values', () => {
      // NaN and Infinity become null after JSON round-trip
      // These should still work but the values are transformed
      const inputWithNaN = { value: NaN };
      const resultNaN = toJsonValue(inputWithNaN);
      expect(resultNaN).toEqual({ value: null });

      const inputWithInfinity = { value: Infinity };
      const resultInfinity = toJsonValue(inputWithInfinity);
      expect(resultInfinity).toEqual({ value: null });
    });

    test('should handle Date objects (converted to ISO string)', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const input = { createdAt: date };
      const result = toJsonValue(input);
      expect(result).toEqual({ createdAt: '2024-01-15T12:00:00.000Z' });
    });

    test('should handle BigInt with custom toJSON', () => {
      // BigInt throws by default in JSON.stringify
      // This test verifies the error behavior
      const input = { value: BigInt(123) };
      expect(() => toJsonValue(input)).toThrow();
    });

    test('should handle deeply nested structures', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep',
                },
              },
            },
          },
        },
      };
      const result = toJsonValue(input);
      expect(result).toEqual(input);
    });

    test('should handle array at root level with objects containing arrays', () => {
      const input = [{ tags: ['a', 'b'] }, { tags: ['c', 'd'] }];
      const result = toJsonValue(input);
      expect(result).toEqual(input);
    });
  });

  describe('real-world use cases', () => {
    test('should convert webhook payload data', () => {
      const webhookData = {
        event: 'TOOL_INVOCATION_ALLOWED',
        timestamp: '2024-01-15T12:00:00Z',
        data: {
          toolName: 'createPR',
          arguments: { title: 'Fix bug', body: 'Description' },
          result: 'success',
        },
      };
      const result = toJsonValue(webhookData);
      expect(result).toEqual(webhookData);
    });

    test('should convert policy configuration', () => {
      const policyConfig = {
        matchers: ['user:alice@example.com', 'role:admin'],
        toolPatterns: ['github.com::*', 'slack.com::sendMessage'],
        options: {
          priority: 10,
          enabled: true,
        },
      };
      const result = toJsonValue(policyConfig);
      expect(result).toEqual(policyConfig);
    });

    test('should convert admin action details', () => {
      const actionDetails = {
        actionDisplayName: 'Create User',
        changes: {
          email: 'new@example.com',
          roles: ['admin', 'developer'],
        },
        metadata: {
          source: 'admin-panel',
          version: '1.0',
        },
      };
      const result = toJsonValue(actionDetails);
      expect(result).toEqual(actionDetails);
    });

    test('should convert email config for webhooks', () => {
      const emailConfig = {
        recipients: ['admin@example.com', 'security@example.com'],
      };
      const result = toJsonValue(emailConfig);
      expect(result).toEqual(emailConfig);
    });

    test('should convert sensitive flag rate limit config', () => {
      const rateLimitConfig = {
        maxPerSession: 5,
        windowMinutes: 60,
      };
      const result = toJsonValue(rateLimitConfig);
      expect(result).toEqual(rateLimitConfig);
    });

    test('should convert MCP server environment variables', () => {
      const envVars = {
        API_KEY: 'encrypted_value',
        BASE_URL: 'https://api.example.com',
        DEBUG: 'false',
      };
      const result = toJsonValue(envVars);
      expect(result).toEqual(envVars);
    });
  });
});

describe('isInputJsonValue (internal)', () => {
  describe('primitive values', () => {
    test('should return true for string', () => {
      expect(isInputJsonValue('hello')).toBe(true);
    });

    test('should return true for number', () => {
      expect(isInputJsonValue(42)).toBe(true);
      expect(isInputJsonValue(3.14)).toBe(true);
      expect(isInputJsonValue(0)).toBe(true);
      expect(isInputJsonValue(-100)).toBe(true);
    });

    test('should return true for boolean', () => {
      expect(isInputJsonValue(true)).toBe(true);
      expect(isInputJsonValue(false)).toBe(true);
    });
  });

  describe('null and undefined', () => {
    test('should return false for null', () => {
      expect(isInputJsonValue(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isInputJsonValue(undefined)).toBe(false);
    });
  });

  describe('arrays', () => {
    test('should return true for valid arrays', () => {
      expect(isInputJsonValue([1, 2, 3])).toBe(true);
      expect(isInputJsonValue(['a', 'b', 'c'])).toBe(true);
      expect(isInputJsonValue([{ a: 1 }, { b: 2 }])).toBe(true);
    });

    test('should return true for arrays with null elements', () => {
      expect(isInputJsonValue([1, null, 3])).toBe(true);
    });

    test('should return false for arrays with invalid elements', () => {
      expect(isInputJsonValue([1, Symbol('test'), 3])).toBe(false);
      expect(isInputJsonValue([() => {}])).toBe(false);
    });
  });

  describe('objects', () => {
    test('should return true for valid objects', () => {
      expect(isInputJsonValue({ a: 1, b: 'hello' })).toBe(true);
      expect(isInputJsonValue({ nested: { value: true } })).toBe(true);
    });

    test('should return true for objects with null values', () => {
      expect(isInputJsonValue({ a: 1, b: null })).toBe(true);
    });

    test('should return false for objects with invalid values', () => {
      expect(isInputJsonValue({ a: 1, b: Symbol('test') })).toBe(false);
      expect(isInputJsonValue({ func: () => {} })).toBe(false);
    });
  });

  describe('non-JSON types (line 82 coverage)', () => {
    test('should return false for Symbol', () => {
      expect(isInputJsonValue(Symbol('test'))).toBe(false);
    });

    test('should return false for Function', () => {
      expect(isInputJsonValue(() => {})).toBe(false);
      expect(isInputJsonValue(function named() {})).toBe(false);
    });

    test('should return false for BigInt', () => {
      expect(isInputJsonValue(BigInt(123))).toBe(false);
    });
  });
});

describe('toJsonValue edge cases', () => {
  test('should throw when JSON.parse returns a non-valid InputJsonValue (line 107 coverage)', () => {
    // This tests the defensive code path at line 107
    // We mock JSON.parse to return a Symbol, which is not a valid InputJsonValue
    const originalParse = JSON.parse;
    vi.spyOn(JSON, 'parse').mockReturnValueOnce(Symbol('invalid'));

    expect(() => toJsonValue({ test: 'value' })).toThrow('Value is not a valid InputJsonValue');

    // Restore original
    JSON.parse = originalParse;
  });
});

describe('jsonValueSchema', () => {
  // Need to import the schema for testing
  let jsonValueSchema: unknown;

  beforeAll(async () => {
    const mod = await import('../../../../packages/api/src/lib/jsonValue.js');
    jsonValueSchema = mod.jsonValueSchema;
  });

  test('should validate primitive types', () => {
    const schema = jsonValueSchema as { parse: (v: unknown) => unknown };
    expect(schema.parse('hello')).toBe('hello');
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
  });

  test('should validate arrays', () => {
    const schema = jsonValueSchema as { parse: (v: unknown) => unknown };
    expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(schema.parse([{ key: 'value' }])).toEqual([{ key: 'value' }]);
  });

  test('should validate objects', () => {
    const schema = jsonValueSchema as { parse: (v: unknown) => unknown };
    expect(schema.parse({ key: 'value' })).toEqual({ key: 'value' });
    expect(schema.parse({ nested: { deep: true } })).toEqual({ nested: { deep: true } });
  });

  test('should reject null', () => {
    const schema = jsonValueSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse(null).success).toBe(false);
  });
});

describe('jsonValueNullableSchema', () => {
  let jsonValueNullableSchema: unknown;

  beforeAll(async () => {
    const mod = await import('../../../../packages/api/src/lib/jsonValue.js');
    jsonValueNullableSchema = mod.jsonValueNullableSchema;
  });

  test('should validate primitive types including null', () => {
    const schema = jsonValueNullableSchema as { parse: (v: unknown) => unknown };
    expect(schema.parse('hello')).toBe('hello');
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(null)).toBe(null);
  });

  test('should validate arrays with nulls', () => {
    const schema = jsonValueNullableSchema as { parse: (v: unknown) => unknown };
    expect(schema.parse([1, null, 3])).toEqual([1, null, 3]);
    expect(schema.parse([null, null])).toEqual([null, null]);
  });

  test('should validate objects with null values', () => {
    const schema = jsonValueNullableSchema as { parse: (v: unknown) => unknown };
    expect(schema.parse({ key: null })).toEqual({ key: null });
    expect(schema.parse({ a: 1, b: null })).toEqual({ a: 1, b: null });
  });
});

describe('isPlainObject', () => {
  let isPlainObject: (v: unknown) => boolean;

  beforeAll(async () => {
    const mod = await import('../../../../packages/api/src/lib/jsonValue.js');
    isPlainObject = mod.isPlainObject;
  });

  test('should return true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ key: 'value' })).toBe(true);
    expect(isPlainObject({ nested: { deep: true } })).toBe(true);
  });

  test('should return false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });

  test('should return false for arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  test('should return false for primitives', () => {
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(123)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});
