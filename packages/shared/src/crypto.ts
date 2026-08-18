/**
 * Shared cryptographic utilities for SENTINEL
 * Handles decryption of sensitive data (MCP credentials)
 *
 * Note: Encryption is only done in the API package (packages/api/src/lib/crypto.ts)
 * This module provides decrypt-only functionality for proxy packages (mcp, a2a)
 */

import crypto from 'crypto';

import { isPlainObject } from './security.js';

export const CRYPTO_ALGORITHM = 'aes-256-gcm';
export const CRYPTO_IV_LENGTH = 16;

/**
 * Options for decryption functions
 */
export interface DecryptOptions {
  /**
   * Optional callback for logging warnings (e.g., when key is invalid)
   * If not provided, an error will be thrown for invalid keys
   */
  onKeyWarning?: (message: string) => void;
}

/**
 * Gets the encryption key from environment
 * @param onWarning - Optional callback for logging warnings instead of throwing
 * @returns The encryption key, or empty string if invalid and onWarning provided
 * @throws Error if ENCRYPTION_KEY is not set/invalid and no onWarning callback
 */
export function getEncryptionKey(onWarning?: (message: string) => void): string {
  const key = process.env.ENCRYPTION_KEY || '';
  if (!key || key.length !== 64) {
    const message =
      'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes). ' +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";
    if (onWarning) {
      onWarning(message);
      return key; // Return potentially invalid key; let decryption fail naturally
    }
    throw new Error(message);
  }
  return key;
}

/**
 * Decrypts a string encrypted with AES-256-GCM
 * @param ciphertext - Encrypted data in format: iv:authTag:encrypted
 * @param options - Optional decryption options
 * @returns Decrypted plaintext
 */
export function decryptString(ciphertext: string, options?: DecryptOptions): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(getEncryptionKey(options?.onKeyWarning), 'hex');

  const decipher = crypto.createDecipheriv(CRYPTO_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Alias for decryptString (matches API naming)
 */
export const decrypt = decryptString;

/**
 * Decrypts a JSON string back to an object.
 * Returns `unknown` by default - caller is responsible for type validation.
 * @param ciphertext - Encrypted JSON string
 * @param options - Optional decryption options
 * @returns Parsed object as unknown (must be validated/narrowed by caller)
 */
export function decryptObject(ciphertext: string, options?: DecryptOptions): unknown {
  return JSON.parse(decryptString(ciphertext, options));
}

/**
 * Decrypts a JSON string back to a credentials record.
 * Validates that the result is a plain object.
 * @param ciphertext - Encrypted JSON string
 * @param options - Optional decryption options
 * @returns Parsed credentials object
 * @throws If decryption fails or result is not a plain object
 */
export function decryptCredentials(
  ciphertext: string,
  options?: DecryptOptions,
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(decryptString(ciphertext, options));
  if (!isPlainObject(parsed)) {
    throw new Error('Decrypted credentials is not a valid object');
  }
  return parsed;
}
