/**
 * Unit tests for A2A crypto utilities
 * Tests decryption functions used by the A2A proxy
 */

import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock logger to prevent console output during tests
vi.mock('../../../packages/a2a/src/logger.js', () => ({
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

describe('A2A Crypto', () => {
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
      const { decryptString } = await import('../../../packages/a2a/src/crypto.js');
      const plaintext = 'test-secret-value';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should decrypt empty string', async () => {
      const { decryptString } = await import('../../../packages/a2a/src/crypto.js');
      const plaintext = '';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should decrypt string with special characters', async () => {
      const { decryptString } = await import('../../../packages/a2a/src/crypto.js');
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
      const ciphertext = encryptString(plaintext);

      const result = decryptString(ciphertext);
      expect(result).toBe(plaintext);
    });

    test('should throw on invalid ciphertext format (no colons)', async () => {
      const { decryptString } = await import('../../../packages/a2a/src/crypto.js');

      expect(() => decryptString('invalidciphertext')).toThrow('Invalid ciphertext format');
    });

    test('should throw on tampered auth tag', async () => {
      const { decryptString } = await import('../../../packages/a2a/src/crypto.js');
      const plaintext = 'test-secret';
      const ciphertext = encryptString(plaintext);
      const [iv, _authTag, encrypted] = ciphertext.split(':');

      // Tamper with auth tag
      const tamperedCiphertext = `${iv}:${'00'.repeat(16)}:${encrypted}`;

      expect(() => decryptString(tamperedCiphertext)).toThrow();
    });
  });

  describe('decryptCredentials', () => {
    test('should decrypt valid credentials object', async () => {
      const { decryptCredentials } = await import('../../../packages/a2a/src/crypto.js');
      const creds = { apiKey: 'sk-12345', secret: 'abc' };
      const ciphertext = encryptString(JSON.stringify(creds));

      const result = decryptCredentials(ciphertext);
      expect(result).toEqual(creds);
    });

    test('should decrypt empty credentials object', async () => {
      const { decryptCredentials } = await import('../../../packages/a2a/src/crypto.js');
      const creds = {};
      const ciphertext = encryptString(JSON.stringify(creds));

      const result = decryptCredentials(ciphertext);
      expect(result).toEqual(creds);
    });

    test('should throw on non-object credentials (array)', async () => {
      const { decryptCredentials } = await import('../../../packages/a2a/src/crypto.js');
      const ciphertext = encryptString('["not", "an", "object"]');

      expect(() => decryptCredentials(ciphertext)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (string)', async () => {
      const { decryptCredentials } = await import('../../../packages/a2a/src/crypto.js');
      const ciphertext = encryptString('"just a string"');

      expect(() => decryptCredentials(ciphertext)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });

    test('should throw on non-object credentials (null)', async () => {
      const { decryptCredentials } = await import('../../../packages/a2a/src/crypto.js');
      const ciphertext = encryptString('null');

      expect(() => decryptCredentials(ciphertext)).toThrow(
        'Decrypted credentials is not a valid object',
      );
    });
  });
});
