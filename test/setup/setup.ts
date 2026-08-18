/**
 * Global Test Setup
 * Runs before all tests
 */

import { webcrypto } from 'crypto';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll } from 'vitest';

// Polyfill globalThis.crypto for jose library compatibility in Node.js
// This is needed because jose uses Web Crypto API which isn't available by default
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// Try to load .env file manually if it exists (for local development)
// In CI environments, environment variables are already set via workflow
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  } catch {
    console.log('Could not load .env file, using existing environment variables');
  }
}

// Set test environment variables AFTER loading .env
process.env.NODE_ENV = 'test';

// Use TEST_DATABASE_URL if provided, otherwise use DATABASE_URL
// This allows tests to run against the dev database if TEST_DATABASE_URL is not set
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// CRITICAL: Set encryption key if not present
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

// Set a test API key for LLM-dependent tests (context extraction, etc.)
// Actual API calls are mocked in tests
if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = 'test-api-key-for-llm-tests';
}

// Validate encryption key length
if (process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
}

beforeAll(async () => {
  console.log('🧪 Test suite starting...');
});

afterAll(async () => {
  console.log('✅ Test suite complete');
});
