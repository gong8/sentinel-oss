/**
 * Unit tests for MCP crypto utilities
 * Tests decryption functions used by the MCP proxy
 */

import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock logger to prevent console output during tests
vi.mock('../../../packages/mcp/src/logger.js', () => ({
  logger: {
    security: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Store original env
const originalEnv = process.env;

describe('MCP Crypto', () => {
  // Test encryption key (64 hex chars = 32 bytes)
  const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Helper to create valid encrypted string format
  function encryptString(plaintext: string): string {
    const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  describe('decryptString', () => {
    test('should decrypt valid ciphertext', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = 'test-secret-value';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should decrypt empty string', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = '';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should decrypt string with special characters', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should decrypt unicode string', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = '你好世界 🔐 Здравствуй мир';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should decrypt long string', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = 'x'.repeat(10000);
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should throw on invalid ciphertext format (no colons)', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');

      expect(() => decryptString('invalidciphertext')).toThrow('Invalid ciphertext format');
    });

    test('should throw on invalid ciphertext format (one colon)', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');

      expect(() => decryptString('part1:part2')).toThrow('Invalid ciphertext format');
    });

    test('should throw on tampered auth tag', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = 'test-secret';
      const ciphertext = encryptString(plaintext);
      const [iv, _authTag, encrypted] = ciphertext.split(':');

      // Tamper with auth tag
      const tamperedCiphertext = `${iv}:${'00'.repeat(16)}:${encrypted}`;

      expect(() => decryptString(tamperedCiphertext)).toThrow();
    });

    test('should throw on tampered ciphertext', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = 'test-secret';
      const ciphertext = encryptString(plaintext);
      const [iv, authTag, _encrypted] = ciphertext.split(':');

      // Tamper with encrypted content
      const tamperedCiphertext = `${iv}:${authTag}:${'00'.repeat(20)}`;

      expect(() => decryptString(tamperedCiphertext)).toThrow();
    });

    test('should throw on invalid IV', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      const plaintext = 'test-secret';
      const ciphertext = encryptString(plaintext);
      const [_iv, authTag, encrypted] = ciphertext.split(':');

      // Use invalid IV
      const tamperedCiphertext = `${'00'.repeat(12)}:${authTag}:${encrypted}`;

      expect(() => decryptString(tamperedCiphertext)).toThrow();
    });
  });

  describe('decryptObject', () => {
    test('should decrypt valid JSON object', async () => {
      const { decryptObject } = await import('../../../packages/mcp/src/crypto.js');
      const obj = { key: 'value', number: 123 };
      const ciphertext = encryptString(JSON.stringify(obj));

      const result = decryptObject(ciphertext);
      expect(result).toEqual(obj);
    });

    test('should decrypt nested JSON object', async () => {
      const { decryptObject } = await import('../../../packages/mcp/src/crypto.js');
      const obj = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
        array: [1, 2, 3],
      };
      const ciphertext = encryptString(JSON.stringify(obj));

      const result = decryptObject(ciphertext);
      expect(result).toEqual(obj);
    });

    test('should decrypt JSON array', async () => {
      const { decryptObject } = await import('../../../packages/mcp/src/crypto.js');
      const arr = [1, 'two', { three: 3 }];
      const ciphertext = encryptString(JSON.stringify(arr));

      const result = decryptObject(ciphertext);
      expect(result).toEqual(arr);
    });

    test('should decrypt primitive JSON values', async () => {
      const { decryptObject } = await import('../../../packages/mcp/src/crypto.js');

      expect(decryptObject(encryptString('"string"'))).toBe('string');
      expect(decryptObject(encryptString('123'))).toBe(123);
      expect(decryptObject(encryptString('true'))).toBe(true);
      expect(decryptObject(encryptString('null'))).toBe(null);
    });

    test('should throw on invalid JSON', async () => {
      const { decryptObject } = await import('../../../packages/mcp/src/crypto.js');
      const ciphertext = encryptString('not valid json {');

      expect(() => decryptObject(ciphertext)).toThrow();
    });
  });

  describe('decryptCredentials', () => {
    test('should decrypt valid credentials object', async () => {
      const { decryptCredentials } = await import('../../../packages/mcp/src/crypto.js');
      const creds = { apiKey: 'sk-12345', secret: 'abc' };
      const ciphertext = encryptString(JSON.stringify(creds));

      const result = decryptCredentials(ciphertext);
      expect(result).toEqual(creds);
    });

    test('should decrypt empty credentials object', async () => {
      const { decryptCredentials } = await import('../../../packages/mcp/src/crypto.js');
      const creds = {};
      const ciphertext = encryptString(JSON.stringify(creds));

      const result = decryptCredentials(ciphertext);
      expect(result).toEqual(creds);
    });

    test('should throw on non-object credentials (array)', async () => {
      const { decryptCredentials } = await import('../../../packages/mcp/src/crypto.js');
      const ciphertext = encryptString('["not", "an", "object"]');

      expect(() => decryptCredentials(ciphertext)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (string)', async () => {
      const { decryptCredentials } = await import('../../../packages/mcp/src/crypto.js');
      const ciphertext = encryptString('"just a string"');

      expect(() => decryptCredentials(ciphertext)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (number)', async () => {
      const { decryptCredentials } = await import('../../../packages/mcp/src/crypto.js');
      const ciphertext = encryptString('12345');

      expect(() => decryptCredentials(ciphertext)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (null)', async () => {
      const { decryptCredentials } = await import('../../../packages/mcp/src/crypto.js');
      const ciphertext = encryptString('null');

      expect(() => decryptCredentials(ciphertext)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });
  });

  describe('getEncryptionKey handling', () => {
    test('should log warning when ENCRYPTION_KEY is not set', async () => {
      // Clear the module cache to re-run the import with new env
      vi.resetModules();
      const { logger } = await import('../../../packages/mcp/src/logger.js');
      process.env.ENCRYPTION_KEY = '';

      // Import crypto module which will read env
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');

      // Try to decrypt (will fail but should log warning)
      const ciphertext = 'aa'.repeat(12) + ':' + 'bb'.repeat(16) + ':' + 'cc'.repeat(10);
      try {
        decryptString(ciphertext);
      } catch {
        // Expected to fail
      }

      expect(logger.security).toHaveBeenCalledWith(
        expect.stringContaining('ENCRYPTION_KEY must be set and exactly 64 hex characters'),
      );
    });

    test('should log warning when ENCRYPTION_KEY is wrong length', async () => {
      vi.resetModules();
      const { logger } = await import('../../../packages/mcp/src/logger.js');
      process.env.ENCRYPTION_KEY = 'tooshort';

      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');

      const ciphertext = 'aa'.repeat(12) + ':' + 'bb'.repeat(16) + ':' + 'cc'.repeat(10);
      try {
        decryptString(ciphertext);
      } catch {
        // Expected to fail
      }

      expect(logger.security).toHaveBeenCalledWith(
        expect.stringContaining('ENCRYPTION_KEY must be set and exactly 64 hex characters'),
      );
    });
  });

  describe('edge cases', () => {
    test('should handle ciphertext with extra colons in content', async () => {
      const { decryptString } = await import('../../../packages/mcp/src/crypto.js');
      // Note: Our encryption doesn't produce colons in content (hex), but test parser
      const plaintext = 'value:with:colons';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should handle JSON with colons', async () => {
      const { decryptObject } = await import('../../../packages/mcp/src/crypto.js');
      const obj = { 'key:with:colons': 'value:also:has:colons' };
      const ciphertext = encryptString(JSON.stringify(obj));

      const result = decryptObject(ciphertext);
      expect(result).toEqual(obj);
    });

    test('should produce different ciphertext for same plaintext (random IV)', async () => {
      const plaintext = 'same-plaintext';
      const ciphertext1 = encryptString(plaintext);
      const ciphertext2 = encryptString(plaintext);

      expect(ciphertext1).not.toBe(ciphertext2);
    });

    test('should handle credentials with nested objects', async () => {
      const { decryptCredentials } = await import('../../../packages/mcp/src/crypto.js');
      const creds = {
        oauth: {
          clientId: 'client-123',
          clientSecret: 'secret-abc',
        },
        apiKey: 'sk-key',
      };
      const ciphertext = encryptString(JSON.stringify(creds));

      const result = decryptCredentials(ciphertext);
      expect(result).toEqual(creds);
    });
  });
});

console.log('🧪 Test suite starting...');
