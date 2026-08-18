/**
 * Verification Service Unit Tests
 * Tests for cryptographic verification of agent identity using JWKS/JWS
 * Covers RSA, ECDSA, and EdDSA algorithms
 *
 * Uses real cryptographic operations instead of mocking jose for reliable testing
 */

import { generateKeyPairSync, KeyObject } from 'crypto';
import * as jose from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Test key data - generated at module load time
interface TestKeySet {
  publicJwk: jose.JWK;
  privateKey: KeyObject;
  jws: string;
  publicPem: string;
}

let rsaKeySet: TestKeySet;
let ecKeySet: TestKeySet;
let edKeySet: TestKeySet;

// Pre-generated sample keys for different algorithms (using Node.js crypto)
let sampleEs384PublicKey: string;
let sampleEs512PublicKey: string;
let sampleEdDsaPublicKey: string;

// Real signature test data for verifySignature tests
let realSignatureTestData: {
  payload: string;
  signature: string; // base64url encoded
  publicKeyPem: string;
};

// All mocks must be hoisted to work with vi.mock
const { mockPrisma, mockEncrypt, mockDecrypt, mockLogger } = vi.hoisted(() => {
  return {
    mockPrisma: {
      publisherRegistry: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
      },
      agent: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    mockEncrypt: vi.fn((value: string) => `encrypted:${value}`),
    mockDecrypt: vi.fn((value: string) => value.replace('encrypted:', '')),
    mockLogger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// Mock modules - these vi.mock calls are hoisted by vitest
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: {
    DbNull: Symbol.for('DbNull'),
  },
}));

vi.mock('../../../../packages/api/src/lib/crypto.js', () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import {
  clearAgentVerificationCache,
  computeKeyFingerprint,
  fetchJWKS,
  getAgentVerificationStatus,
  getPublisherKey,
  isAgentVerified,
  listPublishers,
  registerPublisherKey,
  SUPPORTED_ALGORITHMS,
  validatePublicKey,
  verifyAgent,
  verifyJWS,
  verifySignature,
} from '../../../../packages/api/src/services/verification.js';

// Helper to generate a key pair and signed JWS using Node.js native crypto
async function generateTestKeySet(alg: string, kid: string): Promise<TestKeySet> {
  let publicKey: KeyObject;
  let privateKey: KeyObject;

  // Generate key pair using Node.js crypto based on algorithm
  if (alg.startsWith('RS')) {
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
  } else if (alg === 'ES256') {
    const keyPair = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
  } else if (alg === 'ES384') {
    const keyPair = generateKeyPairSync('ec', {
      namedCurve: 'P-384',
    });
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
  } else if (alg === 'ES512') {
    const keyPair = generateKeyPairSync('ec', {
      namedCurve: 'P-521',
    });
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
  } else if (alg === 'EdDSA') {
    const keyPair = generateKeyPairSync('ed25519');
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
  } else {
    throw new Error(`Unsupported algorithm: ${alg}`);
  }

  // Export public key to JWK and PEM
  const publicJwk = await jose.exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = alg;

  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  // Sign a test payload to create JWS
  const encoder = new TextEncoder();
  const jws = await new jose.CompactSign(encoder.encode(JSON.stringify({ sub: 'test' })))
    .setProtectedHeader({ alg, kid })
    .sign(privateKey);

  return { publicJwk, privateKey, jws, publicPem };
}

// Sample PEM keys for testing (generated using Node.js crypto, validated to work with jose)
const SAMPLE_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzKJiHhheeoupeiWlZfC4
f4qzcNkDe48LKSpPxd6laPLU+B6nQWnX+1oPBX0j4byy3+sjB6NWFxUR5aS2ZgR0
1/oWkbJguGutGboWv7QPGSys4xJjKxUaRb8V5+LUNWEQYkeSw7CEs52KktNAtszx
ZSiT42MAdAhibexgiIaKFdA0KEg5xl0UY0cbbEDDhxVnhCRCQfCNTLheataLRnll
fHEpFsdAyQ+mXJviyRt5OJrdm1V2ZC5FFlpk0xpBIeIgQRiAeMiZFFsOPvzKDVLy
I4d1ZVUOLmS8we+6dPHDlTkE+M2Pxa5StmelCnm1p3xq06Q+uGMCOVPigMYlVnUT
7wIDAQAB
-----END PUBLIC KEY-----`;

const SAMPLE_EC_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE4tkWpd70E9dfyYj9nRQgJr2/T8AT
3BCfgvwOdt67Gyuow0MRcjQLmQZITrjQ1QLGzDW5kx8LECdu76ASSUXBvQ==
-----END PUBLIC KEY-----`;

// =============================================================================
// Mock Data Factories
// =============================================================================

function createMockJWKS(keys: jose.JWK[] = []) {
  return {
    keys:
      keys.length > 0 ? keys : [{ kid: 'key-1', alg: 'RS256', kty: 'RSA', n: 'test-n', e: 'AQAB' }],
  };
}

function createMockAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    organizationId: 'org-1',
    publicKeyUrl: 'https://example.com/.well-known/jwks.json',
    publicKeyCache: null,
    publicKeyCachedAt: null,
    signatureVerified: false,
    signatureVerifiedAt: null,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function createMockPublisher(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pub-1',
    organizationId: 'org-1',
    name: 'Test Publisher',
    publicKey: `encrypted:${SAMPLE_RSA_PUBLIC_KEY}`,
    keyAlgorithm: 'RS256',
    keyFingerprint: 'abc123fingerprint',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

// =============================================================================
// Mock Response Helpers
// =============================================================================

function _mockFetchOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, statusText: string) {
  mockFetch.mockResolvedValueOnce({ ok: false, status, statusText });
}

function _mockFetchNetworkError(message: string) {
  mockFetch.mockRejectedValueOnce(new Error(message));
}

// Mock crypto.subtle at module level (for verifySignature tests)
const mockCryptoSubtleVerify = vi.fn();
const _mockCryptoSubtleImportKey = vi.fn();

describe('Verification Service', () => {
  beforeAll(async () => {
    // Generate test key sets with real cryptographic keys using Node.js crypto
    rsaKeySet = await generateTestKeySet('RS256', 'rsa-key-1');
    ecKeySet = await generateTestKeySet('ES256', 'ec-key-1');
    edKeySet = await generateTestKeySet('EdDSA', 'ed-key-1');

    // Generate additional sample keys for validatePublicKey tests
    const es384KeyPair = generateKeyPairSync('ec', { namedCurve: 'P-384' });
    sampleEs384PublicKey = es384KeyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const es512KeyPair = generateKeyPairSync('ec', { namedCurve: 'P-521' });
    sampleEs512PublicKey = es512KeyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const eddsaKeyPair = generateKeyPairSync('ed25519');
    sampleEdDsaPublicKey = eddsaKeyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    // Generate real signature test data for verifySignature tests
    const { sign } = await import('crypto');
    const testPayload = 'test-payload-for-signature';
    const rsaKeyPairForSig = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signature = sign('sha256', Buffer.from(testPayload), rsaKeyPairForSig.privateKey);
    realSignatureTestData = {
      payload: testPayload,
      signature: signature.toString('base64url'),
      publicKeyPem: rsaKeyPairForSig.publicKey.export({ type: 'spki', format: 'pem' }) as string,
    };
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    // Reset the crypto mock to default behavior
    mockCryptoSubtleVerify.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // SUPPORTED_ALGORITHMS
  // ==========================================================================
  describe('SUPPORTED_ALGORITHMS', () => {
    test('should include RSA algorithms', () => {
      expect(SUPPORTED_ALGORITHMS).toContain('RS256');
      expect(SUPPORTED_ALGORITHMS).toContain('RS384');
      expect(SUPPORTED_ALGORITHMS).toContain('RS512');
    });

    test('should include ECDSA algorithms', () => {
      expect(SUPPORTED_ALGORITHMS).toContain('ES256');
      expect(SUPPORTED_ALGORITHMS).toContain('ES384');
      expect(SUPPORTED_ALGORITHMS).toContain('ES512');
    });

    test('should include EdDSA', () => {
      expect(SUPPORTED_ALGORITHMS).toContain('EdDSA');
    });

    test('should have exactly 7 algorithms', () => {
      expect(SUPPORTED_ALGORITHMS).toHaveLength(7);
    });
  });

  // ==========================================================================
  // fetchJWKS
  // ==========================================================================
  describe('fetchJWKS', () => {
    describe('caching behavior', () => {
      test('should return cached JWKS when cache is valid (within 1 hour)', async () => {
        const cachedJwks = createMockJWKS();
        const cachedAt = new Date('2024-01-15T11:30:00Z'); // 30 minutes ago

        const result = await fetchJWKS('https://example.com/jwks', cachedJwks, cachedAt);

        expect(result.keys).toEqual(cachedJwks.keys);
        expect(result.cachedAt).toEqual(cachedAt);
        expect(result.error).toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('should fetch fresh JWKS when cache is expired (over 1 hour)', async () => {
        const cachedJwks = createMockJWKS([{ kid: 'old-key', alg: 'RS256', kty: 'RSA' }]);
        const cachedAt = new Date('2024-01-15T10:00:00Z'); // 2 hours ago
        const freshJwks = createMockJWKS([{ kid: 'new-key', alg: 'RS256', kty: 'RSA' }]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshJwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', cachedJwks, cachedAt);

        expect(result.keys).toEqual(freshJwks.keys);
        expect(result.error).toBeNull();
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/jwks', {
          headers: { Accept: 'application/json' },
          signal: expect.any(AbortSignal),
        });
      });

      test('should fetch fresh JWKS when no cache exists', async () => {
        const freshJwks = createMockJWKS();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshJwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toEqual(freshJwks.keys);
        expect(result.error).toBeNull();
        expect(mockFetch).toHaveBeenCalled();
      });

      test('should fetch fresh JWKS when cache content is null but cachedAt exists', async () => {
        const freshJwks = createMockJWKS();
        const cachedAt = new Date('2024-01-15T11:30:00Z');

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshJwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, cachedAt);

        expect(result.keys).toEqual(freshJwks.keys);
        expect(mockFetch).toHaveBeenCalled();
      });

      test('should fetch fresh JWKS when cachedAt is null but content exists', async () => {
        const cachedJwks = createMockJWKS();
        const freshJwks = createMockJWKS([{ kid: 'fresh', alg: 'ES256', kty: 'EC' }]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshJwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', cachedJwks, null);

        expect(result.keys).toEqual(freshJwks.keys);
        expect(mockFetch).toHaveBeenCalled();
      });

      test('should return cached JWKS at exactly 59 minutes (within TTL)', async () => {
        const cachedJwks = createMockJWKS();
        // 59 minutes ago
        const cachedAt = new Date('2024-01-15T11:01:00Z');

        const result = await fetchJWKS('https://example.com/jwks', cachedJwks, cachedAt);

        expect(result.keys).toEqual(cachedJwks.keys);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('should fetch fresh JWKS at exactly 60 minutes (TTL boundary)', async () => {
        const cachedJwks = createMockJWKS();
        // Exactly 60 minutes ago
        const cachedAt = new Date('2024-01-15T11:00:00Z');
        const freshJwks = createMockJWKS();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshJwks),
        });

        const _result = await fetchJWKS('https://example.com/jwks', cachedJwks, cachedAt);

        expect(mockFetch).toHaveBeenCalled();
      });
    });

    describe('HTTP error handling', () => {
      const httpErrorCases = [
        { status: 404, statusText: 'Not Found' },
        { status: 500, statusText: 'Internal Server Error' },
        { status: 401, statusText: 'Unauthorized' },
        { status: 403, statusText: 'Forbidden' },
      ];

      test.each(httpErrorCases)(
        'should handle HTTP $status error',
        async ({ status, statusText }) => {
          mockFetchError(status, statusText);

          const result = await fetchJWKS('https://example.com/jwks', null, null);

          expect(result.keys).toEqual([]);
          expect(result.error).toBe(`HTTP ${status}: ${statusText}`);
          expect(result.cachedAt).toBeInstanceOf(Date);
        },
      );
    });

    describe('network error handling', () => {
      test('should handle network timeout', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Request timed out'));

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toEqual([]);
        expect(result.error).toBe('Request timed out');
        expect(mockLogger.error).toHaveBeenCalled();
      });

      test('should handle DNS resolution failure', async () => {
        mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND example.com'));

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toEqual([]);
        expect(result.error).toBe('getaddrinfo ENOTFOUND example.com');
      });

      test('should handle connection refused', async () => {
        mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.error).toBe('connect ECONNREFUSED');
      });

      test('should handle SSL/TLS errors', async () => {
        mockFetch.mockRejectedValueOnce(new Error('unable to verify the first certificate'));

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.error).toBe('unable to verify the first certificate');
      });

      test('should handle non-Error exceptions', async () => {
        mockFetch.mockRejectedValueOnce('string error');

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toEqual([]);
        expect(result.error).toBe('Unknown error');
      });
    });

    describe('invalid JWKS format handling', () => {
      test('should handle response without keys array', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ notKeys: [] }),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toEqual([]);
        expect(result.error).toBe('Invalid JWKS format');
      });

      test('should handle response with keys as non-array', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ keys: 'not-an-array' }),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toEqual([]);
        expect(result.error).toBe('Invalid JWKS format');
      });

      test('should handle null response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(null),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.error).toBe('Invalid JWKS format');
      });

      test('should handle empty object response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.error).toBe('Invalid JWKS format');
      });

      test('should handle array response (not object with keys)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ kid: 'key-1' }]),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.error).toBe('Invalid JWKS format');
      });

      test('should reject cached content with invalid format', async () => {
        const invalidCachedContent = { notKeys: [] };
        const cachedAt = new Date('2024-01-15T11:30:00Z'); // Valid cache time
        const freshJwks = createMockJWKS();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshJwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', invalidCachedContent, cachedAt);

        // Should fetch fresh since cached content is invalid
        expect(mockFetch).toHaveBeenCalled();
        expect(result.keys).toEqual(freshJwks.keys);
      });
    });

    describe('successful fetch', () => {
      test('should return JWKS with multiple keys', async () => {
        const jwks = createMockJWKS([
          { kid: 'key-1', alg: 'RS256', kty: 'RSA' },
          { kid: 'key-2', alg: 'ES256', kty: 'EC' },
          { kid: 'key-3', alg: 'EdDSA', kty: 'OKP' },
        ]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toHaveLength(3);
        expect(result.error).toBeNull();
      });

      test('should accept JWKS with empty keys array', async () => {
        const jwks = { keys: [] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.keys).toEqual([]);
        expect(result.error).toBeNull();
      });

      test('should set cachedAt to current time on fresh fetch', async () => {
        const jwks = createMockJWKS();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await fetchJWKS('https://example.com/jwks', null, null);

        expect(result.cachedAt.getTime()).toBe(new Date('2024-01-15T12:00:00Z').getTime());
      });
    });
  });

  // ==========================================================================
  // verifyJWS - using real cryptographic operations
  // ==========================================================================
  describe('verifyJWS', () => {
    describe('successful verification', () => {
      test('should verify valid JWS with RS256', async () => {
        const jwks = { keys: [rsaKeySet.publicJwk] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(rsaKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(true);
        expect(result.result.algorithm).toBe('RS256');
        expect(result.result.keyId).toBe('rsa-key-1');
        expect(result.result.error).toBeNull();
        expect(result.result.verifiedAt).toBeInstanceOf(Date);
      });

      test('should verify valid JWS with ES256', async () => {
        const jwks = { keys: [ecKeySet.publicJwk] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(ecKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(true);
        expect(result.result.algorithm).toBe('ES256');
        expect(result.result.keyId).toBe('ec-key-1');
      });

      test('should verify valid JWS with EdDSA', async () => {
        const jwks = { keys: [edKeySet.publicJwk] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(edKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(true);
        expect(result.result.algorithm).toBe('EdDSA');
      });

      test('should return updated cache on successful verification', async () => {
        const jwks = { keys: [rsaKeySet.publicJwk] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(rsaKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.updatedCache).not.toBeNull();
        expect(result.updatedCache?.keys).toEqual(jwks.keys);
        expect(result.updatedCache?.cachedAt).toBeInstanceOf(Date);
      });

      test('should handle JWS without kid in header', async () => {
        // Generate a JWS without kid
        const { publicKey, privateKey } = await jose.generateKeyPair('RS256');
        const publicJwk = await jose.exportJWK(publicKey);
        publicJwk.alg = 'RS256';
        // No kid set

        const encoder = new TextEncoder();
        const jwsNoKid = await new jose.CompactSign(encoder.encode(JSON.stringify({ sub: 'test' })))
          .setProtectedHeader({ alg: 'RS256' }) // No kid
          .sign(privateKey);

        const jwks = { keys: [publicJwk] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(jwsNoKid, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(true);
        // keyId is null when not present in the JWS header (protectedHeader.kid || null)
        expect(result.result.keyId).toBeNull();
      });
    });

    describe('verification failures', () => {
      test('should fail when JWKS fetch fails', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        const result = await verifyJWS(rsaKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(false);
        expect(result.result.error).toBe('HTTP 500: Internal Server Error');
        expect(result.updatedCache).toBeNull();
      });

      test('should fail when JWKS has no keys', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ keys: [] }),
        });

        const result = await verifyJWS(rsaKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(false);
        expect(result.result.error).toBe('No keys found in JWKS');
      });

      test('should fail when signature verification fails (wrong key)', async () => {
        // Use a different key than what was used to sign
        const jwks = { keys: [ecKeySet.publicJwk] }; // EC key but JWS is RSA-signed

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(rsaKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(false);
        expect(result.result.error).toContain('no applicable key');
      });

      test('should fail when no matching key found', async () => {
        // Use a key with different kid
        const differentKey = { ...rsaKeySet.publicJwk, kid: 'different-key' };
        const jwks = { keys: [differentKey] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(rsaKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(false);
        expect(result.result.error).toContain('no applicable key');
      });

      test('should still return updated cache on verification failure', async () => {
        const jwks = { keys: [ecKeySet.publicJwk] }; // Wrong key type

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS(rsaKeySet.jws, 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(false);
        expect(result.updatedCache).not.toBeNull();
        expect(result.updatedCache?.keys).toEqual(jwks.keys);
      });

      test('should handle malformed JWS', async () => {
        const jwks = { keys: [rsaKeySet.publicJwk] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        const result = await verifyJWS('invalid.jws', 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(false);
        expect(result.result.error).toBeDefined();
      });

      test('should handle non-Error exception during verification', async () => {
        const jwks = { keys: [rsaKeySet.publicJwk] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });

        // Completely invalid JWS format
        const result = await verifyJWS('not-a-jws-at-all', 'https://example.com/jwks', null, null);

        expect(result.result.verified).toBe(false);
        expect(result.result.error).toBeDefined();
      });
    });

    describe('caching with verification', () => {
      test('should use cached JWKS for verification', async () => {
        const cachedJwks = { keys: [rsaKeySet.publicJwk] };
        const cachedAt = new Date('2024-01-15T11:30:00Z'); // 30 min ago, still valid

        const result = await verifyJWS(
          rsaKeySet.jws,
          'https://example.com/jwks',
          cachedJwks,
          cachedAt,
        );

        expect(result.result.verified).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // verifySignature
  // ==========================================================================
  describe('verifySignature', () => {
    describe('successful verification', () => {
      test('should verify valid RSA signature', async () => {
        // Use real cryptographic signature data
        const publisher = createMockPublisher({
          keyAlgorithm: 'RS256',
          publicKey: `encrypted:${realSignatureTestData.publicKeyPem}`,
        });
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

        const result = await verifySignature(
          realSignatureTestData.payload,
          realSignatureTestData.signature,
          'abc123fingerprint',
          'org-1',
        );

        expect(result.verified).toBe(true);
        expect(result.algorithm).toBe('RS256');
        expect(result.keyId).toBe('abc123fingerprint');
        expect(result.error).toBeNull();
        expect(mockDecrypt).toHaveBeenCalled();
      });

      test('should return verifiedAt timestamp on success', async () => {
        const publisher = createMockPublisher({
          keyAlgorithm: 'RS256',
          publicKey: `encrypted:${realSignatureTestData.publicKeyPem}`,
        });
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

        const result = await verifySignature(
          realSignatureTestData.payload,
          realSignatureTestData.signature,
          'abc123fingerprint',
          'org-1',
        );

        expect(result.verifiedAt).toBeInstanceOf(Date);
      });
    });

    describe('verification failures', () => {
      test('should fail when publisher not found', async () => {
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);

        const result = await verifySignature(
          'payload',
          'signature',
          'unknown-fingerprint',
          'org-1',
        );

        expect(result.verified).toBe(false);
        expect(result.error).toBe('Publisher key not found');
        expect(result.algorithm).toBeNull();
        expect(result.keyId).toBeNull();
      });

      test('should fail with invalid signature', async () => {
        // Use valid public key but wrong signature - should fail verification
        const publisher = createMockPublisher({
          keyAlgorithm: 'RS256',
          publicKey: `encrypted:${realSignatureTestData.publicKeyPem}`,
        });
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

        // Pass correct payload but wrong signature
        const result = await verifySignature(
          realSignatureTestData.payload,
          'wrongSignatureBase64url',
          'abc123fingerprint',
          'org-1',
        );

        expect(result.verified).toBe(false);
        expect(result.error).toBe('Signature verification failed');
        expect(result.algorithm).toBe('RS256');
      });

      test('should fail when key import fails', async () => {
        // Use an invalid PEM that jose.importSPKI will reject
        const publisher = createMockPublisher({
          publicKey: 'encrypted:not-a-valid-pem-key',
        });
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

        const result = await verifySignature('payload', 'signature', 'abc123fingerprint', 'org-1');

        expect(result.verified).toBe(false);
        expect(result.error).toBeDefined();
        expect(mockLogger.error).toHaveBeenCalled();
      });

      test('should fail when signature is malformed', async () => {
        // Use valid public key but completely malformed signature
        const publisher = createMockPublisher({
          keyAlgorithm: 'RS256',
          publicKey: `encrypted:${realSignatureTestData.publicKeyPem}`,
        });
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

        // Pass a completely wrong signature format
        const result = await verifySignature(
          realSignatureTestData.payload,
          'not-base64-at-all!!!',
          'abc123fingerprint',
          'org-1',
        );

        // Falls back to false when verification fails
        expect(result.verified).toBe(false);
      });
    });

    describe('organization isolation', () => {
      test('should only find publishers in the specified organization', async () => {
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);

        await verifySignature('payload', 'signature', 'fingerprint', 'org-A');

        expect(mockPrisma.publisherRegistry.findFirst).toHaveBeenCalledWith({
          where: {
            organizationId: 'org-A',
            keyFingerprint: 'fingerprint',
            deletedAt: null,
          },
        });
      });

      test('should exclude deleted publishers', async () => {
        mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);

        await verifySignature('payload', 'signature', 'fingerprint', 'org-1');

        expect(mockPrisma.publisherRegistry.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
            }),
          }),
        );
      });
    });
  });

  // ==========================================================================
  // computeKeyFingerprint
  // ==========================================================================
  describe('computeKeyFingerprint', () => {
    test('should compute SHA-256 fingerprint', () => {
      const fingerprint = computeKeyFingerprint(SAMPLE_RSA_PUBLIC_KEY);

      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should produce consistent fingerprints for same key', () => {
      const fingerprint1 = computeKeyFingerprint(SAMPLE_RSA_PUBLIC_KEY);
      const fingerprint2 = computeKeyFingerprint(SAMPLE_RSA_PUBLIC_KEY);

      expect(fingerprint1).toBe(fingerprint2);
    });

    test('should produce different fingerprints for different keys', () => {
      const fingerprint1 = computeKeyFingerprint(SAMPLE_RSA_PUBLIC_KEY);
      const fingerprint2 = computeKeyFingerprint(SAMPLE_EC_PUBLIC_KEY);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    test('should handle keys with different whitespace', () => {
      const keyWithExtraWhitespace = SAMPLE_RSA_PUBLIC_KEY + '\n\n';
      const fingerprint1 = computeKeyFingerprint(SAMPLE_RSA_PUBLIC_KEY);
      const fingerprint2 = computeKeyFingerprint(keyWithExtraWhitespace);

      // Different whitespace should produce different fingerprints
      expect(fingerprint1).not.toBe(fingerprint2);
    });

    test('should handle empty string', () => {
      const fingerprint = computeKeyFingerprint('');

      // SHA-256 of empty string
      expect(fingerprint).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  // ==========================================================================
  // validatePublicKey - using real jose validation
  // ==========================================================================
  describe('validatePublicKey', () => {
    test('should accept valid RSA public key with RS256', async () => {
      const result = await validatePublicKey(SAMPLE_RSA_PUBLIC_KEY, 'RS256');

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test('should accept valid RSA public key with RS384', async () => {
      const result = await validatePublicKey(SAMPLE_RSA_PUBLIC_KEY, 'RS384');

      expect(result.valid).toBe(true);
    });

    test('should accept valid RSA public key with RS512', async () => {
      const result = await validatePublicKey(SAMPLE_RSA_PUBLIC_KEY, 'RS512');

      expect(result.valid).toBe(true);
    });

    test('should accept valid EC public key with ES256', async () => {
      const result = await validatePublicKey(SAMPLE_EC_PUBLIC_KEY, 'ES256');

      expect(result.valid).toBe(true);
    });

    test('should accept valid EC public key with ES384', async () => {
      // Use pre-generated P-384 key
      const result = await validatePublicKey(sampleEs384PublicKey, 'ES384');

      expect(result.valid).toBe(true);
    });

    test('should accept valid EC public key with ES512', async () => {
      // Use pre-generated P-521 key
      const result = await validatePublicKey(sampleEs512PublicKey, 'ES512');

      expect(result.valid).toBe(true);
    });

    test('should accept EdDSA key', async () => {
      // Use pre-generated Ed25519 key
      const result = await validatePublicKey(sampleEdDsaPublicKey, 'EdDSA');

      expect(result.valid).toBe(true);
    });

    test('should reject invalid PEM format', async () => {
      const result = await validatePublicKey('not-a-valid-key', 'RS256');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject mismatched algorithm', async () => {
      // Using RSA key with EC algorithm
      const result = await validatePublicKey(SAMPLE_RSA_PUBLIC_KEY, 'ES256');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle non-Error exceptions', async () => {
      // Passing garbage that will cause some kind of exception
      const result = await validatePublicKey(
        '-----BEGIN PUBLIC KEY-----\ngarbage\n-----END PUBLIC KEY-----',
        'RS256',
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject empty key', async () => {
      const result = await validatePublicKey('', 'RS256');

      expect(result.valid).toBe(false);
    });
  });

  // ==========================================================================
  // registerPublisherKey
  // ==========================================================================
  describe('registerPublisherKey', () => {
    test('should register valid publisher key', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);
      mockPrisma.publisherRegistry.create.mockResolvedValueOnce({
        id: 'new-pub-id',
        organizationId: 'org-1',
        name: 'New Publisher',
        publicKey: `encrypted:${SAMPLE_RSA_PUBLIC_KEY}`,
        keyAlgorithm: 'RS256',
        keyFingerprint: 'computed-fingerprint',
      });

      const result = await registerPublisherKey(
        'org-1',
        'New Publisher',
        SAMPLE_RSA_PUBLIC_KEY,
        'RS256',
      );

      expect(result.id).toBe('new-pub-id');
      expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(mockEncrypt).toHaveBeenCalledWith(SAMPLE_RSA_PUBLIC_KEY);
    });

    test('should reject duplicate fingerprint', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce({
        id: 'existing-pub',
        keyFingerprint: 'existing-fingerprint',
      });

      await expect(
        registerPublisherKey('org-1', 'Duplicate Publisher', SAMPLE_RSA_PUBLIC_KEY, 'RS256'),
      ).rejects.toThrow('A publisher with this key already exists');
    });

    test('should reject invalid key format', async () => {
      await expect(
        registerPublisherKey('org-1', 'Bad Publisher', 'invalid-key', 'RS256'),
      ).rejects.toThrow(/Invalid public key/);
    });

    test('should encrypt key before storing', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);
      mockPrisma.publisherRegistry.create.mockResolvedValueOnce({
        id: 'pub-id',
        publicKey: `encrypted:${SAMPLE_RSA_PUBLIC_KEY}`,
        keyFingerprint: 'fingerprint',
      });

      await registerPublisherKey('org-1', 'Publisher', SAMPLE_RSA_PUBLIC_KEY, 'RS256');

      expect(mockPrisma.publisherRegistry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          publicKey: `encrypted:${SAMPLE_RSA_PUBLIC_KEY}`,
        }),
      });
    });

    test('should store correct algorithm', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);
      mockPrisma.publisherRegistry.create.mockResolvedValueOnce({
        id: 'pub-id',
        keyFingerprint: 'fingerprint',
      });

      await registerPublisherKey('org-1', 'Publisher', SAMPLE_EC_PUBLIC_KEY, 'ES256');

      expect(mockPrisma.publisherRegistry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          keyAlgorithm: 'ES256',
        }),
      });
    });

    test('should store organization ID', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);
      mockPrisma.publisherRegistry.create.mockResolvedValueOnce({
        id: 'pub-id',
        keyFingerprint: 'fingerprint',
      });

      await registerPublisherKey('org-specific', 'Publisher', SAMPLE_RSA_PUBLIC_KEY, 'RS256');

      expect(mockPrisma.publisherRegistry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-specific',
        }),
      });
    });

    test('should only check for duplicates within same organization', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);
      mockPrisma.publisherRegistry.create.mockResolvedValueOnce({
        id: 'pub-id',
        keyFingerprint: 'fingerprint',
      });

      await registerPublisherKey('org-1', 'Publisher', SAMPLE_RSA_PUBLIC_KEY, 'RS256');

      expect(mockPrisma.publisherRegistry.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          keyFingerprint: expect.any(String),
          deletedAt: null,
        },
      });
    });
  });

  // ==========================================================================
  // getPublisherKey
  // ==========================================================================
  describe('getPublisherKey', () => {
    test('should return decrypted key', async () => {
      const publisher = createMockPublisher({
        publicKey: `encrypted:${SAMPLE_RSA_PUBLIC_KEY}`,
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await getPublisherKey('org-1', 'abc123fingerprint');

      expect(result).not.toBeNull();
      expect(result?.publicKey).toBe(SAMPLE_RSA_PUBLIC_KEY);
      expect(mockDecrypt).toHaveBeenCalled();
    });

    test('should return null for non-existent key', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);

      const result = await getPublisherKey('org-1', 'unknown-fingerprint');

      expect(result).toBeNull();
    });

    test('should return all publisher fields', async () => {
      const publisher = createMockPublisher({
        id: 'pub-123',
        name: 'Test Publisher',
        keyAlgorithm: 'ES256',
        keyFingerprint: 'fingerprint-abc',
        publicKey: `encrypted:${SAMPLE_EC_PUBLIC_KEY}`,
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await getPublisherKey('org-1', 'fingerprint-abc');

      expect(result?.id).toBe('pub-123');
      expect(result?.name).toBe('Test Publisher');
      expect(result?.keyAlgorithm).toBe('ES256');
      expect(result?.keyFingerprint).toBe('fingerprint-abc');
    });

    test('should respect organization isolation', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);

      await getPublisherKey('org-specific', 'fingerprint');

      expect(mockPrisma.publisherRegistry.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-specific',
          keyFingerprint: 'fingerprint',
          deletedAt: null,
        },
      });
    });

    test('should exclude deleted publishers', async () => {
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(null);

      await getPublisherKey('org-1', 'fingerprint');

      expect(mockPrisma.publisherRegistry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // listPublishers
  // ==========================================================================
  describe('listPublishers', () => {
    test('should list all publishers in organization', async () => {
      const publishers = [
        {
          id: 'pub-1',
          name: 'Publisher 1',
          keyAlgorithm: 'RS256',
          keyFingerprint: 'fp-1',
          createdAt: new Date('2024-01-10'),
          updatedAt: new Date('2024-01-10'),
        },
        {
          id: 'pub-2',
          name: 'Publisher 2',
          keyAlgorithm: 'ES256',
          keyFingerprint: 'fp-2',
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-15'),
        },
      ];
      mockPrisma.publisherRegistry.findMany.mockResolvedValueOnce(publishers);

      const result = await listPublishers('org-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('pub-1');
      expect(result[1].id).toBe('pub-2');
    });

    test('should exclude deleted publishers', async () => {
      mockPrisma.publisherRegistry.findMany.mockResolvedValueOnce([]);

      await listPublishers('org-1');

      expect(mockPrisma.publisherRegistry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            deletedAt: null,
          },
        }),
      );
    });

    test('should order by createdAt descending', async () => {
      mockPrisma.publisherRegistry.findMany.mockResolvedValueOnce([]);

      await listPublishers('org-1');

      expect(mockPrisma.publisherRegistry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            createdAt: 'desc',
          },
        }),
      );
    });

    test('should select only necessary fields (no publicKey)', async () => {
      mockPrisma.publisherRegistry.findMany.mockResolvedValueOnce([]);

      await listPublishers('org-1');

      expect(mockPrisma.publisherRegistry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            name: true,
            keyAlgorithm: true,
            keyFingerprint: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      );
    });

    test('should return empty array when no publishers', async () => {
      mockPrisma.publisherRegistry.findMany.mockResolvedValueOnce([]);

      const result = await listPublishers('org-1');

      expect(result).toEqual([]);
    });

    test('should respect organization isolation', async () => {
      mockPrisma.publisherRegistry.findMany.mockResolvedValueOnce([]);

      await listPublishers('org-specific');

      expect(mockPrisma.publisherRegistry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-specific',
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // verifyAgent
  // ==========================================================================
  describe('verifyAgent', () => {
    describe('successful verification', () => {
      test('should verify agent with valid JWKS URL', async () => {
        const agent = createMockAgent();
        const jwks = { keys: [rsaKeySet.publicJwk] };

        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });
        mockPrisma.agent.update.mockResolvedValueOnce({ ...agent, signatureVerified: true });

        const result = await verifyAgent('org-1', 'agent-1');

        expect(result.verified).toBe(true);
        expect(result.algorithm).toBe('RS256');
        expect(result.keyId).toBe('rsa-key-1');
        expect(result.error).toBeNull();
      });

      test('should update agent record on successful verification', async () => {
        const agent = createMockAgent();
        const jwks = { keys: [rsaKeySet.publicJwk] };

        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });
        mockPrisma.agent.update.mockResolvedValueOnce({});

        await verifyAgent('org-1', 'agent-1');

        expect(mockPrisma.agent.update).toHaveBeenCalledWith({
          where: { id: 'agent-1' },
          data: {
            signatureVerified: true,
            signatureVerifiedAt: expect.any(Date),
            publicKeyCache: jwks.keys,
            publicKeyCachedAt: expect.any(Date),
          },
        });
      });

      test('should return verifiedAt timestamp', async () => {
        const agent = createMockAgent();
        const jwks = { keys: [rsaKeySet.publicJwk] };

        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });
        mockPrisma.agent.update.mockResolvedValueOnce({});

        const result = await verifyAgent('org-1', 'agent-1');

        expect(result.verifiedAt).toBeInstanceOf(Date);
      });

      test('should handle JWKS with multiple keys', async () => {
        const agent = createMockAgent();
        const jwks = { keys: [rsaKeySet.publicJwk, ecKeySet.publicJwk] };

        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jwks),
        });
        mockPrisma.agent.update.mockResolvedValueOnce({});

        const result = await verifyAgent('org-1', 'agent-1');

        // Should use first key's algorithm and kid
        expect(result.algorithm).toBe('RS256');
        expect(result.keyId).toBe('rsa-key-1');
      });
    });

    describe('verification failures', () => {
      test('should fail when agent not found', async () => {
        mockPrisma.agent.findFirst.mockResolvedValueOnce(null);

        const result = await verifyAgent('org-1', 'unknown-agent');

        expect(result.verified).toBe(false);
        expect(result.error).toBe('Agent not found');
      });

      test('should fail when no JWKS URL configured', async () => {
        const agent = createMockAgent({ publicKeyUrl: null });
        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

        const result = await verifyAgent('org-1', 'agent-1');

        expect(result.verified).toBe(false);
        expect(result.error).toBe('Agent has no JWKS URL configured');
      });

      test('should fail when JWKS fetch fails', async () => {
        const agent = createMockAgent();
        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Server Error',
        });
        mockPrisma.agent.update.mockResolvedValueOnce({});

        const result = await verifyAgent('org-1', 'agent-1');

        expect(result.verified).toBe(false);
        expect(result.error).toBe('HTTP 500: Server Error');
      });

      test('should fail when JWKS has no keys', async () => {
        const agent = createMockAgent();
        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ keys: [] }),
        });
        mockPrisma.agent.update.mockResolvedValueOnce({});

        const result = await verifyAgent('org-1', 'agent-1');

        expect(result.verified).toBe(false);
        expect(result.error).toBe('No keys found in JWKS');
      });

      test('should update agent record on failed verification', async () => {
        const agent = createMockAgent();
        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });
        mockPrisma.agent.update.mockResolvedValueOnce({});

        await verifyAgent('org-1', 'agent-1');

        expect(mockPrisma.agent.update).toHaveBeenCalledWith({
          where: { id: 'agent-1' },
          data: {
            signatureVerified: false,
            signatureVerifiedAt: expect.any(Date),
            publicKeyCache: Symbol.for('DbNull'),
            publicKeyCachedAt: expect.any(Date),
          },
        });
      });
    });

    describe('organization isolation', () => {
      test('should only find agents in specified organization', async () => {
        mockPrisma.agent.findFirst.mockResolvedValueOnce(null);

        await verifyAgent('org-specific', 'agent-1');

        expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
          where: {
            id: 'agent-1',
            organizationId: 'org-specific',
            deletedAt: null,
          },
        });
      });

      test('should exclude deleted agents', async () => {
        mockPrisma.agent.findFirst.mockResolvedValueOnce(null);

        await verifyAgent('org-1', 'agent-1');

        expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
            }),
          }),
        );
      });
    });

    describe('caching behavior', () => {
      test('should use cached JWKS when valid', async () => {
        // JWKS cache must be in { keys: [...] } format for isValidJWKS check
        const cachedJwks = { keys: [rsaKeySet.publicJwk] };
        const agent = createMockAgent({
          publicKeyCache: cachedJwks,
          publicKeyCachedAt: new Date('2024-01-15T11:30:00Z'), // 30 min ago
        });

        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockPrisma.agent.update.mockResolvedValueOnce({});

        const result = await verifyAgent('org-1', 'agent-1');

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.verified).toBe(true);
        expect(result.keyId).toBe('rsa-key-1');
      });

      test('should fetch fresh JWKS when cache expired', async () => {
        const agent = createMockAgent({
          publicKeyCache: { keys: [{ kid: 'old-key' }] },
          publicKeyCachedAt: new Date('2024-01-15T10:00:00Z'), // 2 hours ago
        });
        const freshJwks = { keys: [rsaKeySet.publicJwk] };

        mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshJwks),
        });
        mockPrisma.agent.update.mockResolvedValueOnce({});

        const result = await verifyAgent('org-1', 'agent-1');

        expect(mockFetch).toHaveBeenCalled();
        expect(result.keyId).toBe('rsa-key-1');
      });
    });
  });

  // ==========================================================================
  // getAgentVerificationStatus
  // ==========================================================================
  describe('getAgentVerificationStatus', () => {
    test('should return verified status', async () => {
      const agent = createMockAgent({
        signatureVerified: true,
        signatureVerifiedAt: new Date('2024-01-15T10:00:00Z'),
        publicKeyUrl: 'https://example.com/jwks',
        publicKeyCachedAt: new Date('2024-01-15T11:30:00Z'),
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await getAgentVerificationStatus('org-1', 'agent-1');

      expect(result.verified).toBe(true);
      expect(result.verifiedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(result.publicKeyUrl).toBe('https://example.com/jwks');
      expect(result.cacheExpired).toBe(false);
    });

    test('should detect expired cache', async () => {
      const agent = createMockAgent({
        signatureVerified: true,
        signatureVerifiedAt: new Date('2024-01-14T10:00:00Z'),
        publicKeyCachedAt: new Date('2024-01-15T10:00:00Z'), // 2 hours ago
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await getAgentVerificationStatus('org-1', 'agent-1');

      expect(result.cacheExpired).toBe(true);
    });

    test('should return cacheExpired true when publicKeyCachedAt is null', async () => {
      const agent = createMockAgent({
        signatureVerified: true,
        publicKeyCachedAt: null,
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await getAgentVerificationStatus('org-1', 'agent-1');

      expect(result.cacheExpired).toBe(true);
    });

    test('should return default values when agent not found', async () => {
      mockPrisma.agent.findFirst.mockResolvedValueOnce(null);

      const result = await getAgentVerificationStatus('org-1', 'unknown-agent');

      expect(result.verified).toBe(false);
      expect(result.verifiedAt).toBeNull();
      expect(result.publicKeyUrl).toBeNull();
      expect(result.cacheExpired).toBe(false);
    });

    test('should return unverified status', async () => {
      const agent = createMockAgent({
        signatureVerified: false,
        signatureVerifiedAt: null,
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await getAgentVerificationStatus('org-1', 'agent-1');

      expect(result.verified).toBe(false);
      expect(result.verifiedAt).toBeNull();
    });

    test('should query with correct organization', async () => {
      mockPrisma.agent.findFirst.mockResolvedValueOnce(null);

      await getAgentVerificationStatus('org-specific', 'agent-1');

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'agent-1',
          organizationId: 'org-specific',
          deletedAt: null,
        },
        select: {
          signatureVerified: true,
          signatureVerifiedAt: true,
          publicKeyUrl: true,
          publicKeyCachedAt: true,
        },
      });
    });
  });

  // ==========================================================================
  // isAgentVerified
  // ==========================================================================
  describe('isAgentVerified', () => {
    test('should return true when verified and cache valid', async () => {
      const agent = createMockAgent({
        signatureVerified: true,
        publicKeyCachedAt: new Date('2024-01-15T11:30:00Z'), // 30 min ago
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await isAgentVerified('org-1', 'agent-1');

      expect(result).toBe(true);
    });

    test('should return false when cache expired', async () => {
      const agent = createMockAgent({
        signatureVerified: true,
        publicKeyCachedAt: new Date('2024-01-15T10:00:00Z'), // 2 hours ago
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await isAgentVerified('org-1', 'agent-1');

      expect(result).toBe(false);
    });

    test('should return false when not verified', async () => {
      const agent = createMockAgent({
        signatureVerified: false,
        publicKeyCachedAt: new Date('2024-01-15T11:30:00Z'),
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await isAgentVerified('org-1', 'agent-1');

      expect(result).toBe(false);
    });

    test('should return false when agent not found', async () => {
      mockPrisma.agent.findFirst.mockResolvedValueOnce(null);

      const result = await isAgentVerified('org-1', 'unknown-agent');

      expect(result).toBe(false);
    });

    test('should return false when publicKeyCachedAt is null', async () => {
      const agent = createMockAgent({
        signatureVerified: true,
        publicKeyCachedAt: null,
      });
      mockPrisma.agent.findFirst.mockResolvedValueOnce(agent);

      const result = await isAgentVerified('org-1', 'agent-1');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // clearAgentVerificationCache
  // ==========================================================================
  describe('clearAgentVerificationCache', () => {
    test('should set publicKeyCachedAt to null', async () => {
      mockPrisma.agent.updateMany.mockResolvedValueOnce({ count: 1 });

      await clearAgentVerificationCache('org-1', 'agent-1');

      expect(mockPrisma.agent.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'agent-1',
          organizationId: 'org-1',
          deletedAt: null,
        },
        data: {
          publicKeyCachedAt: null,
        },
      });
    });

    test('should respect organization isolation', async () => {
      mockPrisma.agent.updateMany.mockResolvedValueOnce({ count: 0 });

      await clearAgentVerificationCache('org-specific', 'agent-1');

      expect(mockPrisma.agent.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'org-specific',
        }),
        data: {
          publicKeyCachedAt: null,
        },
      });
    });

    test('should not throw when agent not found', async () => {
      mockPrisma.agent.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(clearAgentVerificationCache('org-1', 'unknown-agent')).resolves.not.toThrow();
    });

    test('should exclude deleted agents', async () => {
      mockPrisma.agent.updateMany.mockResolvedValueOnce({ count: 0 });

      await clearAgentVerificationCache('org-1', 'agent-1');

      expect(mockPrisma.agent.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletedAt: null,
        }),
        data: {
          publicKeyCachedAt: null,
        },
      });
    });
  });

  // ==========================================================================
  // verifySignature - additional edge cases for coverage
  // ==========================================================================
  describe('verifySignature - edge cases', () => {
    test('should handle unsupported algorithm from jose', async () => {
      // Use a publisher with an unsupported algorithm
      // jose.importSPKI will throw for unsupported algorithms
      const publisher = createMockPublisher({
        keyAlgorithm: 'UNSUPPORTED_ALG',
        publicKey: `encrypted:${realSignatureTestData.publicKeyPem}`,
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await verifySignature(
        realSignatureTestData.payload,
        realSignatureTestData.signature,
        'abc123fingerprint',
        'org-1',
      );

      // Should fail - jose throws for invalid algorithm
      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.algorithm).toBe('UNSUPPORTED_ALG');
      expect(result.keyId).toBe('abc123fingerprint');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should return false when Web Crypto verify throws', async () => {
      // Use a valid publisher with RS256 but the signature verification will fail
      // due to invalid signature format causing Web Crypto to throw
      const publisher = createMockPublisher({
        keyAlgorithm: 'RS256',
        publicKey: `encrypted:${realSignatureTestData.publicKeyPem}`,
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      // Pass a payload that doesn't match the signature - this will cause
      // the verification to fail and return false
      const result = await verifySignature(
        'completely-different-payload',
        realSignatureTestData.signature,
        'abc123fingerprint',
        'org-1',
      );

      // Web Crypto verification should fail and return false
      expect(result.verified).toBe(false);
      expect(result.error).toBe('Signature verification failed');
    });

    test('should handle RS384 algorithm mapping', async () => {
      // Generate a key pair for RS384
      const rs384KeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const rs384PublicPem = rs384KeyPair.publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;

      // Sign with RS384
      const { sign } = await import('crypto');
      const testPayload = 'test-rs384-payload';
      const signature = sign('sha384', Buffer.from(testPayload), rs384KeyPair.privateKey);

      const publisher = createMockPublisher({
        keyAlgorithm: 'RS384',
        publicKey: `encrypted:${rs384PublicPem}`,
        keyFingerprint: 'rs384-fingerprint',
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await verifySignature(
        testPayload,
        signature.toString('base64url'),
        'rs384-fingerprint',
        'org-1',
      );

      expect(result.verified).toBe(true);
      expect(result.algorithm).toBe('RS384');
    });

    test('should handle RS512 algorithm mapping', async () => {
      const rs512KeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const rs512PublicPem = rs512KeyPair.publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const { sign } = await import('crypto');
      const testPayload = 'test-rs512-payload';
      const signature = sign('sha512', Buffer.from(testPayload), rs512KeyPair.privateKey);

      const publisher = createMockPublisher({
        keyAlgorithm: 'RS512',
        publicKey: `encrypted:${rs512PublicPem}`,
        keyFingerprint: 'rs512-fingerprint',
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await verifySignature(
        testPayload,
        signature.toString('base64url'),
        'rs512-fingerprint',
        'org-1',
      );

      expect(result.verified).toBe(true);
      expect(result.algorithm).toBe('RS512');
    });

    test('should handle ES256 algorithm mapping', async () => {
      const es256KeyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const es256PublicPem = es256KeyPair.publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const { sign } = await import('crypto');
      const testPayload = 'test-es256-payload';
      const signature = sign(null, Buffer.from(testPayload), {
        key: es256KeyPair.privateKey,
        dsaEncoding: 'ieee-p1363',
      });

      const publisher = createMockPublisher({
        keyAlgorithm: 'ES256',
        publicKey: `encrypted:${es256PublicPem}`,
        keyFingerprint: 'es256-fingerprint',
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await verifySignature(
        testPayload,
        signature.toString('base64url'),
        'es256-fingerprint',
        'org-1',
      );

      expect(result.verified).toBe(true);
      expect(result.algorithm).toBe('ES256');
    });

    test('should handle ES384 verification failure gracefully', async () => {
      // ES384 with P-384 curve - Web Crypto may throw due to key format issues
      // This tests the catch block that returns false
      const es384KeyPair = generateKeyPairSync('ec', { namedCurve: 'P-384' });
      const es384PublicPem = es384KeyPair.publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const publisher = createMockPublisher({
        keyAlgorithm: 'ES384',
        publicKey: `encrypted:${es384PublicPem}`,
        keyFingerprint: 'es384-fingerprint',
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      // Pass a deliberately wrong signature to trigger verification failure
      const result = await verifySignature(
        'test-payload',
        'wrong-signature',
        'es384-fingerprint',
        'org-1',
      );

      // Verification should fail but not throw
      expect(result.verified).toBe(false);
      expect(result.algorithm).toBe('ES384');
    });

    test('should handle ES512 verification failure gracefully', async () => {
      // ES512 with P-521 curve - Web Crypto may throw due to key format issues
      const es512KeyPair = generateKeyPairSync('ec', { namedCurve: 'P-521' });
      const es512PublicPem = es512KeyPair.publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const publisher = createMockPublisher({
        keyAlgorithm: 'ES512',
        publicKey: `encrypted:${es512PublicPem}`,
        keyFingerprint: 'es512-fingerprint',
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      // Pass a wrong signature
      const result = await verifySignature(
        'test-payload',
        'wrong-signature',
        'es512-fingerprint',
        'org-1',
      );

      expect(result.verified).toBe(false);
      expect(result.algorithm).toBe('ES512');
    });

    test('should handle EdDSA algorithm mapping', async () => {
      const edKeyPair = generateKeyPairSync('ed25519');
      const edPublicPem = edKeyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

      const { sign } = await import('crypto');
      const testPayload = 'test-eddsa-payload';
      const signature = sign(null, Buffer.from(testPayload), edKeyPair.privateKey);

      const publisher = createMockPublisher({
        keyAlgorithm: 'EdDSA',
        publicKey: `encrypted:${edPublicPem}`,
        keyFingerprint: 'eddsa-fingerprint',
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await verifySignature(
        testPayload,
        signature.toString('base64url'),
        'eddsa-fingerprint',
        'org-1',
      );

      expect(result.verified).toBe(true);
      expect(result.algorithm).toBe('EdDSA');
    });

    test('should handle unknown algorithm in getWebCryptoAlgorithm', async () => {
      // This test verifies the default case in getWebCryptoAlgorithm
      // by using an algorithm that jose accepts but isn't in our switch statement
      // PS256 is valid for RSA-PSS but not in our supported list
      const publisher = createMockPublisher({
        keyAlgorithm: 'PS256', // Not in our SUPPORTED_ALGORITHMS
        publicKey: `encrypted:${realSignatureTestData.publicKeyPem}`,
      });
      mockPrisma.publisherRegistry.findFirst.mockResolvedValueOnce(publisher);

      const result = await verifySignature(
        realSignatureTestData.payload,
        realSignatureTestData.signature,
        'abc123fingerprint',
        'org-1',
      );

      // Should fail because PS256 isn't in getWebCryptoAlgorithm switch
      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
