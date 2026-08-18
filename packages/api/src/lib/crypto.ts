/**
 * Cryptographic utilities for SENTINEL
 * Handles encryption/decryption of sensitive data (MCP credentials)
 */

import crypto from 'crypto';
import type { ZodType } from 'zod';
import { isPlainObject } from './jsonValue.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Gets the encryption key, reading from environment at call time
 * This allows tests to set the key before calling encrypt/decrypt
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || '';
  if (!key || key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes). ' +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return key;
}

/**
 * Encrypts data using AES-256-GCM
 * @param plaintext - Data to encrypt
 * @returns Encrypted data with IV and auth tag
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(getEncryptionKey(), 'hex');

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Encrypts a string (API keys, secrets)
 */
export function encryptString(plaintext: string): string {
  return encrypt(plaintext);
}

/**
 * Decrypts data encrypted with encrypt()
 * @param ciphertext - Encrypted data
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(getEncryptionKey(), 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Decrypts a string encrypted with encryptString()
 */
export function decryptString(ciphertext: string): string {
  return decrypt(ciphertext);
}

/**
 * Encrypts an object (typically credentials) to JSON string
 */
export function encryptObject(obj: unknown): string {
  return encrypt(JSON.stringify(obj));
}

/**
 * Decrypts a JSON string back to an object.
 * Returns `unknown` by default - caller is responsible for type validation.
 * @param ciphertext - Encrypted JSON string
 * @returns Parsed object as unknown (must be validated/narrowed by caller)
 */
export function decryptObject(ciphertext: string): unknown {
  return JSON.parse(decrypt(ciphertext));
}

/**
 * Decrypts a JSON string back to a credentials record.
 * Validates that the result is a plain object.
 * @param ciphertext - Encrypted JSON string
 * @returns Parsed credentials object
 * @throws If decryption fails or result is not a plain object
 */
export function decryptCredentials(ciphertext: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(decrypt(ciphertext));
  if (!isPlainObject(parsed)) {
    throw new Error('Decrypted credentials is not a valid object');
  }
  return parsed;
}

/**
 * Decrypts a JSON string back to an object with Zod schema validation
 * @param ciphertext - Encrypted JSON string
 * @param schema - Zod schema to validate the decrypted data
 * @returns Validated and typed object
 * @throws If decryption fails or data doesn't match schema
 */
export function decryptObjectSafe<T>(ciphertext: string, schema: ZodType<T>): T {
  const parsed: unknown = JSON.parse(decrypt(ciphertext));
  return schema.parse(parsed);
}
