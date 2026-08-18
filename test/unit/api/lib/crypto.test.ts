/**
 * Crypto Utilities Unit Tests
 * Tests for encryption/decryption functions
 */

// Store original key for restoration
const _ORIGINAL_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const VALID_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// CRITICAL: Set encryption key BEFORE importing crypto module
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  process.env.ENCRYPTION_KEY = VALID_KEY;
}

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  decrypt,
  decryptCredentials,
  decryptObject,
  decryptObjectSafe,
  decryptString,
  encrypt,
  encryptObject,
  encryptString,
} from '../../../../packages/api/src/lib/crypto.js';

describe('Crypto Utilities', () => {
  describe('encrypt/decrypt', () => {
    test('should encrypt and decrypt strings correctly', () => {
      const plaintext = 'sensitive data';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'sensitive data';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    test('should include IV and auth tag in ciphertext', () => {
      const plaintext = 'test';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBeTruthy(); // IV
      expect(parts[1]).toBeTruthy(); // Auth tag
      expect(parts[2]).toBeTruthy(); // Encrypted data
    });

    test('should fail to decrypt with invalid format', () => {
      expect(() => decrypt('invalid')).toThrow();
    });

    test('should handle empty strings', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle Unicode characters', () => {
      const plaintext = 'Hello 世界 🌍';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle large payloads', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should fail to decrypt tampered ciphertext', () => {
      const plaintext = 'sensitive data';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with the encrypted data
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -5)}xxxxx`;

      expect(() => decrypt(tampered)).toThrow();
    });

    test('should fail to decrypt with wrong auth tag', () => {
      const plaintext = 'sensitive data';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with the auth tag by changing a character
      const authTagHex = parts[1];
      const tamperedTag = authTagHex.slice(0, -2) + (authTagHex.slice(-2) === '00' ? 'ff' : '00');
      const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      expect(() => decrypt(tampered)).toThrow();
    });

    test('should fail to decrypt with wrong IV', () => {
      const plaintext = 'sensitive data';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with the IV
      const tampered = `${parts[0].slice(0, -5)}xxxxx:${parts[1]}:${parts[2]}`;

      expect(() => decrypt(tampered)).toThrow();
    });

    test('should produce different ciphertext for same plaintext (nonce)', () => {
      const plaintext = 'sensitive data';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      const encrypted3 = encrypt(plaintext);

      // All should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
      expect(encrypted2).not.toBe(encrypted3);
      expect(encrypted1).not.toBe(encrypted3);

      // But all should decrypt to the same plaintext
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
      expect(decrypt(encrypted3)).toBe(plaintext);
    });

    test('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle newlines and tabs', () => {
      const plaintext = 'line1\nline2\tline3';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encryptObject/decryptObject', () => {
    test('should encrypt and decrypt objects correctly', () => {
      const obj = { apiKey: 'secret-key-123', userId: 'user-id' };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should preserve object structure', () => {
      const obj = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        string: 'value',
      };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle null values', () => {
      const obj = { apiKey: null, userId: 'user-123' };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle empty objects', () => {
      const obj = {};
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle arrays', () => {
      const obj = { items: [1, 2, 3], nested: [{ a: 1 }, { b: 2 }] };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle boolean values', () => {
      const obj = { enabled: true, disabled: false };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle number values', () => {
      const obj = { count: 42, price: 99.99, negative: -5 };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle complex nested structures', () => {
      const obj = {
        apiKey: 'secret-key',
        config: {
          timeout: 5000,
          retries: 3,
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
          },
        },
        metadata: {
          tags: ['production', 'api'],
          version: '1.0.0',
        },
      };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should fail to decrypt tampered object ciphertext', () => {
      const obj = { apiKey: 'secret' };
      const encrypted = encryptObject(obj);
      const tampered = encrypted.slice(0, -10) + 'xxxxxxxxxx';

      expect(() => decryptObject(tampered)).toThrow();
    });
  });

  describe('encryptString/decryptString', () => {
    test('should encrypt and decrypt strings correctly', () => {
      const plaintext = 'my secret API key';
      const encrypted = encryptString(plaintext);
      const decrypted = decryptString(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle special characters', () => {
      const plaintext = 'sk-1234-!@#$%^&*()';
      const encrypted = encryptString(plaintext);
      const decrypted = decryptString(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should be interchangeable with encrypt/decrypt', () => {
      const plaintext = 'test-value';

      // encryptString -> decrypt
      const encrypted1 = encryptString(plaintext);
      expect(decrypt(encrypted1)).toBe(plaintext);

      // encrypt -> decryptString
      const encrypted2 = encrypt(plaintext);
      expect(decryptString(encrypted2)).toBe(plaintext);
    });
  });

  describe('decryptCredentials', () => {
    test('should decrypt valid credentials object', () => {
      const creds = { apiKey: 'sk-12345', secret: 'abc' };
      const encrypted = encryptObject(creds);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(creds);
    });

    test('should decrypt empty credentials object', () => {
      const creds = {};
      const encrypted = encryptObject(creds);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(creds);
    });

    test('should throw on non-object credentials (array)', () => {
      const encrypted = encryptObject(['not', 'an', 'object']);

      expect(() => decryptCredentials(encrypted)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (string)', () => {
      const encrypted = encryptObject('just a string');

      expect(() => decryptCredentials(encrypted)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (number)', () => {
      const encrypted = encryptObject(12345);

      expect(() => decryptCredentials(encrypted)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (null)', () => {
      const encrypted = encryptObject(null);

      expect(() => decryptCredentials(encrypted)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });
  });

  describe('decryptObjectSafe', () => {
    const CredentialsSchema = z.object({
      apiKey: z.string(),
      secret: z.string().optional(),
    });

    test('should decrypt and validate valid object', () => {
      const creds = { apiKey: 'sk-12345', secret: 'abc' };
      const encrypted = encryptObject(creds);
      const decrypted = decryptObjectSafe(encrypted, CredentialsSchema);

      expect(decrypted).toEqual(creds);
    });

    test('should decrypt and validate object with optional fields', () => {
      const creds = { apiKey: 'sk-12345' };
      const encrypted = encryptObject(creds);
      const decrypted = decryptObjectSafe(encrypted, CredentialsSchema);

      expect(decrypted).toEqual(creds);
    });

    test('should throw on schema validation failure (missing required field)', () => {
      const invalidCreds = { secret: 'abc' }; // missing apiKey
      const encrypted = encryptObject(invalidCreds);

      expect(() => decryptObjectSafe(encrypted, CredentialsSchema)).toThrow();
    });

    test('should throw on schema validation failure (wrong type)', () => {
      const invalidCreds = { apiKey: 12345 }; // apiKey should be string
      const encrypted = encryptObject(invalidCreds);

      expect(() => decryptObjectSafe(encrypted, CredentialsSchema)).toThrow();
    });

    test('should work with complex schemas', () => {
      const ComplexSchema = z.object({
        oauth: z.object({
          clientId: z.string(),
          clientSecret: z.string(),
        }),
        scopes: z.array(z.string()),
      });

      const data = {
        oauth: {
          clientId: 'client-123',
          clientSecret: 'secret-abc',
        },
        scopes: ['read', 'write'],
      };
      const encrypted = encryptObject(data);
      const decrypted = decryptObjectSafe(encrypted, ComplexSchema);

      expect(decrypted).toEqual(data);
    });
  });

  describe('getEncryptionKey validation', () => {
    // These tests manipulate ENCRYPTION_KEY to test error branches
    // Each test must restore the key afterward

    beforeEach(() => {
      // Ensure valid key is set before each test
      process.env.ENCRYPTION_KEY = VALID_KEY;
    });

    afterEach(() => {
      // Restore valid key after each test
      process.env.ENCRYPTION_KEY = VALID_KEY;
    });

    test('should throw when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw when ENCRYPTION_KEY is empty string', () => {
      process.env.ENCRYPTION_KEY = '';

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw when ENCRYPTION_KEY is too short', () => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef'; // 16 chars instead of 64

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw when ENCRYPTION_KEY is too long', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY + 'extra'; // 69 chars

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw when ENCRYPTION_KEY is 63 characters (off by one)', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY.slice(0, 63); // 63 chars

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw when ENCRYPTION_KEY is 65 characters (off by one)', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY + 'a'; // 65 chars

      expect(() => encrypt('test')).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw on decrypt when ENCRYPTION_KEY is missing', () => {
      // First encrypt with valid key
      const encrypted = encrypt('test data');

      // Then try to decrypt without key
      delete process.env.ENCRYPTION_KEY;

      expect(() => decrypt(encrypted)).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw on decryptObject when ENCRYPTION_KEY is invalid', () => {
      const encrypted = encryptObject({ key: 'value' });

      process.env.ENCRYPTION_KEY = 'tooshort';

      expect(() => decryptObject(encrypted)).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw on decryptCredentials when ENCRYPTION_KEY is invalid', () => {
      const encrypted = encryptObject({ apiKey: 'secret' });

      process.env.ENCRYPTION_KEY = '';

      expect(() => decryptCredentials(encrypted)).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw on decryptObjectSafe when ENCRYPTION_KEY is invalid', () => {
      const schema = z.object({ test: z.string() });
      const encrypted = encryptObject({ test: 'value' });

      delete process.env.ENCRYPTION_KEY;

      expect(() => decryptObjectSafe(encrypted, schema)).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw on encryptString when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => encryptString('api-key-123')).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('should throw on encryptObject when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => encryptObject({ secret: 'value' })).toThrow(
        'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)',
      );
    });

    test('error message includes key generation command', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => encrypt('test')).toThrow(
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    });
  });

  describe('decrypt error handling', () => {
    test('should throw on ciphertext with only one part', () => {
      expect(() => decrypt('onlyonepart')).toThrow('Invalid ciphertext format');
    });

    test('should throw on ciphertext with two parts', () => {
      expect(() => decrypt('part1:part2')).toThrow('Invalid ciphertext format');
    });

    test('should throw on ciphertext with four parts', () => {
      expect(() => decrypt('part1:part2:part3:part4')).toThrow('Invalid ciphertext format');
    });

    test('should throw on empty ciphertext', () => {
      expect(() => decrypt('')).toThrow('Invalid ciphertext format');
    });

    test('should throw on ciphertext with invalid hex in IV', () => {
      // Create valid ciphertext first
      const valid = encrypt('test');
      const parts = valid.split(':');

      // Replace IV with invalid hex
      const invalid = `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:${parts[1]}:${parts[2]}`;

      expect(() => decrypt(invalid)).toThrow();
    });

    test('should throw on ciphertext with invalid hex in auth tag', () => {
      const valid = encrypt('test');
      const parts = valid.split(':');

      // Replace auth tag with invalid hex
      const invalid = `${parts[0]}:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:${parts[2]}`;

      expect(() => decrypt(invalid)).toThrow();
    });

    test('should throw on ciphertext with invalid hex in encrypted data', () => {
      const valid = encrypt('test');
      const parts = valid.split(':');

      // Replace encrypted data with invalid hex
      const invalid = `${parts[0]}:${parts[1]}:notvalidhexzzz`;

      expect(() => decrypt(invalid)).toThrow();
    });

    test('should throw on ciphertext with truncated IV', () => {
      const valid = encrypt('test');
      const parts = valid.split(':');

      // Truncate IV
      const invalid = `${parts[0].slice(0, 8)}:${parts[1]}:${parts[2]}`;

      expect(() => decrypt(invalid)).toThrow();
    });

    test('should throw on ciphertext with empty auth tag', () => {
      const valid = encrypt('test');
      const parts = valid.split(':');

      // Empty auth tag
      const invalid = `${parts[0]}::${parts[2]}`;

      expect(() => decrypt(invalid)).toThrow();
    });

    test('should throw on completely swapped IV and auth tag', () => {
      const valid = encrypt('test');
      const parts = valid.split(':');

      // Swap IV and auth tag
      const invalid = `${parts[1]}:${parts[0]}:${parts[2]}`;

      expect(() => decrypt(invalid)).toThrow();
    });
  });

  describe('decryptObject error handling', () => {
    test('should throw on invalid JSON after decryption', () => {
      // Encrypt raw string that's not valid JSON
      const encrypted = encrypt('not valid json {{{');

      expect(() => decryptObject(encrypted)).toThrow();
    });

    test('should throw on truncated JSON', () => {
      const encrypted = encrypt('{"key": "val');

      expect(() => decryptObject(encrypted)).toThrow();
    });
  });

  describe('edge cases and boundary conditions', () => {
    test('should handle very long strings (100KB)', () => {
      const plaintext = 'a'.repeat(100000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(100000);
    });

    test('should handle JSON with deeply nested objects (10 levels)', () => {
      // Create deeply nested object
      let obj: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 10; i++) {
        obj = { nested: obj };
      }

      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle strings with null bytes', () => {
      const plaintext = 'before\x00after';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle strings with only whitespace', () => {
      const plaintext = '   \t\n\r  ';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle object with undefined values (converted to null in JSON)', () => {
      const obj = { key: undefined, other: 'value' };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      // JSON.stringify converts undefined to nothing, so key is omitted
      expect(decrypted).toEqual({ other: 'value' });
    });

    test('should handle object with Date (converted to string in JSON)', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const obj = { created: date };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual({ created: '2024-01-01T00:00:00.000Z' });
    });

    test('should handle array at root level', () => {
      const arr = [1, 2, 3, { nested: 'value' }];
      const encrypted = encryptObject(arr);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(arr);
    });

    test('should handle primitive values at root level', () => {
      expect(decryptObject(encryptObject(null))).toBe(null);
      expect(decryptObject(encryptObject(true))).toBe(true);
      expect(decryptObject(encryptObject(false))).toBe(false);
      expect(decryptObject(encryptObject(42))).toBe(42);
      expect(decryptObject(encryptObject('string'))).toBe('string');
    });

    test('should handle object with special JSON characters in values', () => {
      const obj = {
        quote: '"quoted"',
        backslash: '\\path\\to\\file',
        mixed: '{"nested": "json"}',
      };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    test('should handle emoji strings', () => {
      const plaintext = '🔐🔑🛡️💾';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle mixed language text', () => {
      const plaintext = 'Hello مرحبا שלום Привет 你好 🌍';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle RTL text', () => {
      const plaintext = 'مرحبا بالعالم';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle surrogate pairs', () => {
      const plaintext = '𝟘𝟙𝟚𝟛'; // Mathematical monospace digits (outside BMP)
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decryptCredentials additional edge cases', () => {
    test('should throw on boolean credentials', () => {
      const encrypted = encryptObject(true);

      expect(() => decryptCredentials(encrypted)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on boolean false credentials', () => {
      const encrypted = encryptObject(false);

      expect(() => decryptCredentials(encrypted)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on nested array credentials', () => {
      const encrypted = encryptObject([
        [1, 2],
        [3, 4],
      ]);

      expect(() => decryptCredentials(encrypted)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should accept object with array values', () => {
      const creds = { keys: ['key1', 'key2'], primary: 'main' };
      const encrypted = encryptObject(creds);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(creds);
    });

    test('should accept object with nested objects', () => {
      const creds = {
        oauth: { clientId: 'id', clientSecret: 'secret' },
        apiKey: 'key',
      };
      const encrypted = encryptObject(creds);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(creds);
    });
  });

  describe('decryptObjectSafe additional edge cases', () => {
    test('should handle union schemas', () => {
      const UnionSchema = z.union([
        z.object({ type: z.literal('api'), apiKey: z.string() }),
        z.object({ type: z.literal('oauth'), token: z.string() }),
      ]);

      const apiCreds = { type: 'api' as const, apiKey: 'sk-123' };
      const oauthCreds = { type: 'oauth' as const, token: 'tok-456' };

      expect(decryptObjectSafe(encryptObject(apiCreds), UnionSchema)).toEqual(apiCreds);
      expect(decryptObjectSafe(encryptObject(oauthCreds), UnionSchema)).toEqual(oauthCreds);
    });

    test('should throw on union schema mismatch', () => {
      const UnionSchema = z.union([
        z.object({ type: z.literal('api'), apiKey: z.string() }),
        z.object({ type: z.literal('oauth'), token: z.string() }),
      ]);

      const invalid = { type: 'basic', username: 'user' };
      const encrypted = encryptObject(invalid);

      expect(() => decryptObjectSafe(encrypted, UnionSchema)).toThrow();
    });

    test('should handle array schemas', () => {
      const ArraySchema = z.array(z.object({ id: z.number(), name: z.string() }));

      const data = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ];
      const encrypted = encryptObject(data);
      const decrypted = decryptObjectSafe(encrypted, ArraySchema);

      expect(decrypted).toEqual(data);
    });

    test('should handle nullable schemas', () => {
      const NullableSchema = z.object({ value: z.string().nullable() });

      const data = { value: null };
      const encrypted = encryptObject(data);
      const decrypted = decryptObjectSafe(encrypted, NullableSchema);

      expect(decrypted).toEqual(data);
    });

    test('should handle default values in schema', () => {
      const DefaultSchema = z.object({
        name: z.string(),
        count: z.number().default(0),
      });

      const data = { name: 'test' };
      const encrypted = encryptObject(data);
      const decrypted = decryptObjectSafe(encrypted, DefaultSchema);

      expect(decrypted).toEqual({ name: 'test', count: 0 });
    });

    test('should handle transform in schema', () => {
      const TransformSchema = z.object({
        value: z.string().transform((v) => v.toUpperCase()),
      });

      const data = { value: 'hello' };
      const encrypted = encryptObject(data);
      const decrypted = decryptObjectSafe(encrypted, TransformSchema);

      expect(decrypted).toEqual({ value: 'HELLO' });
    });

    test('should throw on refine validation failure', () => {
      const RefineSchema = z.object({
        password: z.string().refine((p) => p.length >= 8, 'Password too short'),
      });

      const data = { password: 'short' };
      const encrypted = encryptObject(data);

      expect(() => decryptObjectSafe(encrypted, RefineSchema)).toThrow();
    });
  });

  describe('cryptographic integrity', () => {
    test('different keys produce different ciphertext', () => {
      const plaintext = 'test data';

      // Encrypt with current key
      const encrypted1 = encrypt(plaintext);

      // Change to different key
      process.env.ENCRYPTION_KEY =
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const encrypted2 = encrypt(plaintext);

      // Restore original key
      process.env.ENCRYPTION_KEY = VALID_KEY;

      expect(encrypted1).not.toBe(encrypted2);
    });

    test('cannot decrypt with different key', () => {
      const plaintext = 'test data';
      const encrypted = encrypt(plaintext);

      // Try to decrypt with different key
      process.env.ENCRYPTION_KEY =
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

      expect(() => decrypt(encrypted)).toThrow();

      // Restore original key
      process.env.ENCRYPTION_KEY = VALID_KEY;
    });

    test('ciphertext length is consistent for same plaintext length', () => {
      const plaintext1 = 'a'.repeat(100);
      const plaintext2 = 'b'.repeat(100);

      const encrypted1 = encrypt(plaintext1);
      const encrypted2 = encrypt(plaintext2);

      // Ciphertext lengths should be the same for same plaintext lengths
      expect(encrypted1.length).toBe(encrypted2.length);
    });

    test('IV is unique for each encryption', () => {
      const plaintext = 'same data';
      const ivs = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const encrypted = encrypt(plaintext);
        const iv = encrypted.split(':')[0];
        ivs.add(iv);
      }

      // All 100 IVs should be unique
      expect(ivs.size).toBe(100);
    });

    test('auth tag changes with different data', () => {
      const encrypted1 = encrypt('data1');
      const encrypted2 = encrypt('data2');

      const authTag1 = encrypted1.split(':')[1];
      const authTag2 = encrypted2.split(':')[1];

      expect(authTag1).not.toBe(authTag2);
    });
  });
});
