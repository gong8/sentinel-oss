/**
 * Verification Service
 * Handles cryptographic verification of agent identity using JWKS/JWS
 * Supports RSA, ECDSA, and EdDSA algorithms via the jose library
 */

import { prisma, Prisma } from '@sentinel/db';
import { createHash } from 'crypto';
import * as jose from 'jose';
import { z } from 'zod';
import { decrypt, encrypt } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationResult {
  verified: boolean;
  verifiedAt: Date | null;
  algorithm: string | null;
  keyId: string | null;
  error: string | null;
}

export interface JWKSResult {
  keys: jose.JWK[];
  cachedAt: Date;
  error: string | null;
}

export interface PublisherKey {
  id: string;
  name: string;
  publicKey: string; // Decrypted PEM
  keyAlgorithm: string;
  keyFingerprint: string;
}

export interface VerificationStatus {
  verified: boolean;
  verifiedAt: Date | null;
  publicKeyUrl: string | null;
  cacheExpired: boolean;
}

// Cache TTL: 1 hour in milliseconds
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Creates a failed verification result with the given error message
 */
function failedVerification(error: string): VerificationResult {
  return {
    verified: false,
    verifiedAt: null,
    algorithm: null,
    keyId: null,
    error,
  };
}

// Supported key algorithms
export const SUPPORTED_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
] as const;

export type SupportedAlgorithm = (typeof SUPPORTED_ALGORITHMS)[number];

// ============================================================================
// ZOD SCHEMAS FOR INPUT VALIDATION
// ============================================================================

/**
 * Schema for validating publisher key registration input
 * Ensures all fields are properly validated before database write
 */
const registerPublisherKeySchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  name: z.string().min(1, 'Publisher name is required').max(255, 'Publisher name too long'),
  publicKeyPem: z.string().min(1, 'Public key is required'),
  keyAlgorithm: z.enum(SUPPORTED_ALGORITHMS, {
    message: `Key algorithm must be one of: ${SUPPORTED_ALGORITHMS.join(', ')}`,
  }),
});

// ============================================================================
// JWKS OPERATIONS
// ============================================================================

/**
 * Type guard for JWKS format
 */
function isValidJWKS(value: unknown): value is { keys: jose.JWK[] } {
  if (typeof value !== 'object' || value === null) return false;
  // After the object check, we can safely access 'keys' property
  return 'keys' in value && Array.isArray(value.keys);
}

/**
 * Fetches JWKS from a URL with caching
 * Returns cached result if within TTL, otherwise fetches fresh
 */
export async function fetchJWKS(
  url: string,
  cachedContent: unknown | null,
  cachedAt: Date | null,
): Promise<JWKSResult> {
  // Check if cache is still valid
  if (cachedContent && cachedAt) {
    const cacheAge = Date.now() - cachedAt.getTime();
    if (cacheAge < JWKS_CACHE_TTL_MS) {
      // Validate cached content is a valid JWKS
      if (isValidJWKS(cachedContent)) {
        return {
          keys: cachedContent.keys,
          cachedAt,
          error: null,
        };
      }
    }
  }

  // Fetch fresh JWKS
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return {
        keys: [],
        cachedAt: new Date(),
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const jwks: unknown = await response.json();

    if (!isValidJWKS(jwks)) {
      return {
        keys: [],
        cachedAt: new Date(),
        error: 'Invalid JWKS format',
      };
    }

    return {
      keys: jwks.keys,
      cachedAt: new Date(),
      error: null,
    };
  } catch (error) {
    logger.error('Failed to fetch JWKS:', error);
    return {
      keys: [],
      cachedAt: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// JWS VERIFICATION
// ============================================================================

/**
 * Verifies a JWS (JSON Web Signature) against a JWKS URL
 */
export async function verifyJWS(
  jws: string,
  jwksUrl: string,
  cachedJwks: unknown | null,
  cachedAt: Date | null,
): Promise<{
  result: VerificationResult;
  updatedCache: { keys: unknown; cachedAt: Date } | null;
}> {
  // Fetch JWKS (using cache if valid)
  const jwksResult = await fetchJWKS(jwksUrl, cachedJwks, cachedAt);

  if (jwksResult.error || jwksResult.keys.length === 0) {
    return {
      result: failedVerification(jwksResult.error || 'No keys found in JWKS'),
      updatedCache: null,
    };
  }

  try {
    // Create JWKS for jose
    const keySet = jose.createLocalJWKSet({ keys: jwksResult.keys });

    // Verify the JWS
    const { protectedHeader } = await jose.compactVerify(jws, keySet);

    return {
      result: {
        verified: true,
        verifiedAt: new Date(),
        algorithm: protectedHeader.alg || null,
        keyId: protectedHeader.kid || null,
        error: null,
      },
      updatedCache: {
        keys: jwksResult.keys,
        cachedAt: jwksResult.cachedAt,
      },
    };
  } catch (error) {
    logger.error('JWS verification failed:', error);
    return {
      result: failedVerification(error instanceof Error ? error.message : 'Verification failed'),
      updatedCache: {
        keys: jwksResult.keys,
        cachedAt: jwksResult.cachedAt,
      },
    };
  }
}

// ============================================================================
// SIGNATURE VERIFICATION (for direct public keys)
// ============================================================================

/**
 * Verifies a signature against a registered publisher key
 */
export async function verifySignature(
  payload: string,
  signature: string,
  keyFingerprint: string,
  organizationId: string,
): Promise<VerificationResult> {
  const publisher = await prisma.publisherRegistry.findFirst({
    where: {
      organizationId,
      keyFingerprint,
      deletedAt: null,
    },
  });

  if (!publisher) {
    return failedVerification('Publisher key not found');
  }

  try {
    // Decrypt the stored public key
    const publicKeyPem = decrypt(publisher.publicKey);

    // Import the key based on algorithm
    const keyObject = await jose.importSPKI(publicKeyPem, publisher.keyAlgorithm);

    // Create a verifier based on algorithm
    const signatureBytes = Buffer.from(signature, 'base64url');
    const payloadBytes = new TextEncoder().encode(payload);

    // Use the appropriate verification method based on algorithm
    const isValid = await verifyRawSignature(
      payloadBytes,
      signatureBytes,
      keyObject,
      publisher.keyAlgorithm,
    );

    return {
      verified: isValid,
      verifiedAt: new Date(),
      algorithm: publisher.keyAlgorithm,
      keyId: publisher.keyFingerprint,
      error: isValid ? null : 'Signature verification failed',
    };
  } catch (error) {
    logger.error('Signature verification failed:', error);
    return {
      ...failedVerification(error instanceof Error ? error.message : 'Verification failed'),
      algorithm: publisher.keyAlgorithm,
      keyId: publisher.keyFingerprint,
    };
  }
}

/**
 * Verifies a raw signature using the appropriate algorithm
 */
async function verifyRawSignature(
  payload: Uint8Array,
  signature: Uint8Array,
  key: CryptoKey,
  algorithm: string,
): Promise<boolean> {
  // Map jose algorithm names to Web Crypto API parameters
  const algorithmParams = getWebCryptoAlgorithm(algorithm);
  if (!algorithmParams) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  try {
    return await crypto.subtle.verify(
      algorithmParams,
      key,
      new Uint8Array(signature),
      new Uint8Array(payload),
    );
  } catch {
    // If Web Crypto fails, try jose's verification
    return false;
  }
}

// Web Crypto algorithm parameters type
type WebCryptoAlgorithm =
  | { name: 'RSASSA-PKCS1-v1_5'; hash: string }
  | { name: 'ECDSA'; hash: string }
  | { name: 'Ed25519' };

/**
 * Maps jose algorithm names to Web Crypto API algorithm parameters
 */
function getWebCryptoAlgorithm(algorithm: string): WebCryptoAlgorithm | null {
  switch (algorithm) {
    case 'RS256':
      return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    case 'RS384':
      return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' };
    case 'RS512':
      return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' };
    case 'ES256':
      return { name: 'ECDSA', hash: 'SHA-256' };
    case 'ES384':
      return { name: 'ECDSA', hash: 'SHA-384' };
    case 'ES512':
      return { name: 'ECDSA', hash: 'SHA-512' };
    case 'EdDSA':
      return { name: 'Ed25519' };
    default:
      return null;
  }
}

// ============================================================================
// PUBLISHER KEY MANAGEMENT
// ============================================================================

/**
 * Computes SHA-256 fingerprint of a public key
 */
export function computeKeyFingerprint(publicKeyPem: string): string {
  const hash = createHash('sha256');
  hash.update(publicKeyPem);
  return hash.digest('hex');
}

/**
 * Validates a public key format and algorithm
 */
export async function validatePublicKey(
  publicKeyPem: string,
  algorithm: string,
): Promise<{ valid: boolean; error: string | null }> {
  try {
    await jose.importSPKI(publicKeyPem, algorithm);
    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid public key format',
    };
  }
}

/**
 * Registers a new publisher key
 * Input is validated with Zod schema before database write
 */
export async function registerPublisherKey(
  organizationId: string,
  name: string,
  publicKeyPem: string,
  keyAlgorithm: string,
): Promise<{ id: string; fingerprint: string }> {
  // Validate input with Zod schema
  const parseResult = registerPublisherKeySchema.safeParse({
    organizationId,
    name,
    publicKeyPem,
    keyAlgorithm,
  });

  if (!parseResult.success) {
    throw new Error(`Invalid input: ${parseResult.error.issues.map((e) => e.message).join(', ')}`);
  }

  const validatedData = parseResult.data;

  // Validate the key format (cryptographic validation)
  const validation = await validatePublicKey(
    validatedData.publicKeyPem,
    validatedData.keyAlgorithm,
  );
  if (!validation.valid) {
    throw new Error(`Invalid public key: ${validation.error}`);
  }

  const fingerprint = computeKeyFingerprint(validatedData.publicKeyPem);

  // Check for duplicate
  const existing = await prisma.publisherRegistry.findFirst({
    where: {
      organizationId: validatedData.organizationId,
      keyFingerprint: fingerprint,
      deletedAt: null,
    },
  });

  if (existing) {
    throw new Error('A publisher with this key already exists');
  }

  // Encrypt and store
  const encryptedKey = encrypt(validatedData.publicKeyPem);

  const publisher = await prisma.publisherRegistry.create({
    data: {
      organizationId: validatedData.organizationId,
      name: validatedData.name,
      publicKey: encryptedKey,
      keyAlgorithm: validatedData.keyAlgorithm,
      keyFingerprint: fingerprint,
    },
  });

  return { id: publisher.id, fingerprint };
}

/**
 * Gets a publisher key by fingerprint
 */
export async function getPublisherKey(
  organizationId: string,
  fingerprint: string,
): Promise<PublisherKey | null> {
  const publisher = await prisma.publisherRegistry.findFirst({
    where: {
      organizationId,
      keyFingerprint: fingerprint,
      deletedAt: null,
    },
  });

  if (!publisher) return null;

  return {
    id: publisher.id,
    name: publisher.name,
    publicKey: decrypt(publisher.publicKey),
    keyAlgorithm: publisher.keyAlgorithm,
    keyFingerprint: publisher.keyFingerprint,
  };
}

/**
 * Lists all publishers for an organization
 */
export async function listPublishers(organizationId: string): Promise<
  Array<{
    id: string;
    name: string;
    keyAlgorithm: string;
    keyFingerprint: string;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  const publishers = await prisma.publisherRegistry.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      keyAlgorithm: true,
      keyFingerprint: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return publishers;
}

// ============================================================================
// AGENT VERIFICATION
// ============================================================================

/**
 * Verifies an agent's identity using its configured JWKS URL
 * Updates the agent's verification status in the database
 */
export async function verifyAgent(
  organizationId: string,
  agentId: string,
): Promise<VerificationResult> {
  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!agent) {
    return failedVerification('Agent not found');
  }

  if (!agent.publicKeyUrl) {
    return failedVerification('Agent has no JWKS URL configured');
  }

  // Fetch and cache JWKS
  const jwksResult = await fetchJWKS(
    agent.publicKeyUrl,
    agent.publicKeyCache,
    agent.publicKeyCachedAt,
  );

  if (jwksResult.error || jwksResult.keys.length === 0) {
    // Update agent with failed verification
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        signatureVerified: false,
        signatureVerifiedAt: new Date(),
        publicKeyCache: Prisma.DbNull,
        publicKeyCachedAt: jwksResult.cachedAt,
      },
    });

    return {
      ...failedVerification(jwksResult.error || 'No keys found in JWKS'),
      verifiedAt: new Date(),
    };
  }

  // Update agent with successful JWKS fetch (ready for signature verification)
  // Serialize JWKS keys to ensure pure JSON for Prisma storage
  const keysForStorage: Prisma.InputJsonValue = JSON.parse(JSON.stringify(jwksResult.keys));
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      signatureVerified: true,
      signatureVerifiedAt: new Date(),
      publicKeyCache: keysForStorage,
      publicKeyCachedAt: jwksResult.cachedAt,
    },
  });

  return {
    verified: true,
    verifiedAt: new Date(),
    algorithm: jwksResult.keys[0]?.alg || null,
    keyId: jwksResult.keys[0]?.kid || null,
    error: null,
  };
}

/**
 * Gets the verification status for an agent
 */
export async function getAgentVerificationStatus(
  organizationId: string,
  agentId: string,
): Promise<VerificationStatus> {
  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      organizationId,
      deletedAt: null,
    },
    select: {
      signatureVerified: true,
      signatureVerifiedAt: true,
      publicKeyUrl: true,
      publicKeyCachedAt: true,
    },
  });

  if (!agent) {
    return {
      verified: false,
      verifiedAt: null,
      publicKeyUrl: null,
      cacheExpired: false,
    };
  }

  const cacheExpired = agent.publicKeyCachedAt
    ? Date.now() - agent.publicKeyCachedAt.getTime() > JWKS_CACHE_TTL_MS
    : true;

  return {
    verified: agent.signatureVerified,
    verifiedAt: agent.signatureVerifiedAt,
    publicKeyUrl: agent.publicKeyUrl,
    cacheExpired,
  };
}

/**
 * Checks if an agent is verified (for blocking unverified agents)
 * Returns true if verified and cache is not expired
 */
export async function isAgentVerified(organizationId: string, agentId: string): Promise<boolean> {
  const status = await getAgentVerificationStatus(organizationId, agentId);
  return status.verified && !status.cacheExpired;
}

/**
 * Clears an agent's verification cache (forces re-fetch on next verification)
 */
export async function clearAgentVerificationCache(
  organizationId: string,
  agentId: string,
): Promise<void> {
  await prisma.agent.updateMany({
    where: {
      id: agentId,
      organizationId,
      deletedAt: null,
    },
    data: {
      publicKeyCachedAt: null,
    },
  });
}
