/**
 * Agent Card Service
 * Handles fetching, parsing, validating, and caching of A2A Agent Cards
 */

import crypto from 'crypto';
import { logger } from './logger.js';
import { AgentCardSchema, type AgentCard, type AuthType, type SecurityScheme } from './types.js';

// Cache TTL: 1 hour (per A2A spec recommendation)
const CARD_CACHE_TTL_MS = 60 * 60 * 1000;

// Fetch timeout: 10 seconds
const FETCH_TIMEOUT_MS = 10000;

// Maximum response size: 1MB (agent cards should be small)
const MAX_RESPONSE_SIZE = 1024 * 1024;

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^240\./,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  /^ff00:/i,
];

// Blocked hostnames (common internal/localhost names)
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'kubernetes.default',
  'kubernetes.default.svc',
  'metadata.google.internal',
];

/**
 * Validates a URL for safe external fetching (SSRF protection)
 */
export function validateAgentCardUrl(url: string): { valid: boolean; error?: string } {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Require HTTPS scheme
  if (parsedUrl.protocol !== 'https:') {
    logger.warn(`[SSRF] Blocked non-HTTPS URL: ${url}`);
    return { valid: false, error: 'Only HTTPS URLs are allowed for agent cards' };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Block localhost and common internal hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    logger.warn(`[SSRF] Blocked internal hostname: ${hostname}`);
    return { valid: false, error: 'Internal hostnames are not allowed' };
  }

  // Block private IP addresses
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      logger.warn(`[SSRF] Blocked private IP: ${hostname}`);
      return { valid: false, error: 'Private IP addresses are not allowed' };
    }
  }

  return { valid: true };
}

/**
 * Fetches a URL with timeout and size limits
 */
async function safeFetch(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check Content-Length header if present
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new Error(
        `Response too large: ${contentLength} bytes exceeds ${MAX_RESPONSE_SIZE} limit`,
      );
    }

    // Read response with size limit
    const text = await response.text();
    if (text.length > MAX_RESPONSE_SIZE) {
      throw new Error(
        `Response too large: ${text.length} bytes exceeds ${MAX_RESPONSE_SIZE} limit`,
      );
    }

    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches an Agent Card from a URL
 * Tries /.well-known/agent-card.json first, then the direct URL
 * Includes SSRF protection: validates URL scheme, blocks private IPs, applies timeout/size limits
 */
export async function fetchAgentCard(url: string): Promise<AgentCard> {
  // Validate URL before fetching (SSRF protection)
  const validation = validateAgentCardUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Try the well-known location first if it's not already a well-known URL
  const wellKnownUrl = url.includes('/.well-known/agent-card.json')
    ? url
    : new URL('/.well-known/agent-card.json', url).toString();

  // Validate well-known URL as well (in case it differs)
  if (wellKnownUrl !== url) {
    const wellKnownValidation = validateAgentCardUrl(wellKnownUrl);
    if (!wellKnownValidation.valid) {
      throw new Error(wellKnownValidation.error);
    }
  }

  logger.card(`Fetching Agent Card from ${wellKnownUrl}`);

  try {
    const json = await safeFetch(wellKnownUrl);
    return parseAgentCard(json);
  } catch (error) {
    // If well-known location fails and we were given a different URL, try that
    if (wellKnownUrl !== url) {
      logger.card(`Well-known URL failed, trying direct URL: ${url}`);
      const json = await safeFetch(url);
      return parseAgentCard(json);
    }

    throw error;
  }
}

/**
 * Parses and validates an Agent Card JSON object
 */
export function parseAgentCard(json: unknown): AgentCard {
  const result = AgentCardSchema.safeParse(json);

  if (!result.success) {
    const errorMessages = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Invalid Agent Card: ${errorMessages.join(', ')}`);
  }

  return result.data;
}

/**
 * Computes a SHA-256 hash of an Agent Card for change detection
 */
export function computeCardHash(card: AgentCard): string {
  // Sort keys for consistent hashing
  const normalized = JSON.stringify(card, Object.keys(card).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Checks if a cached Agent Card is still valid (not expired)
 */
export function isCacheValid(fetchedAt: Date | null): boolean {
  if (!fetchedAt) {
    return false;
  }

  const age = Date.now() - fetchedAt.getTime();
  return age < CARD_CACHE_TTL_MS;
}

/**
 * Gets the cached card if valid, otherwise returns null
 */
export function getCachedCard(cache: unknown, fetchedAt: Date | null): AgentCard | null {
  if (!cache || !isCacheValid(fetchedAt)) {
    return null;
  }

  try {
    return parseAgentCard(cache);
  } catch {
    return null;
  }
}

/**
 * Maps A2A security scheme types to AuthType enum values
 */
export function schemeTypeToAuthType(schemeType: SecurityScheme['type']): AuthType {
  switch (schemeType) {
    case 'apiKey':
      return 'API_KEY';
    case 'http':
      return 'API_KEY'; // Bearer tokens use API_KEY auth type
    case 'oauth2':
      return 'OAUTH';
    case 'openIdConnect':
      return 'OIDC';
    default:
      return 'NONE';
  }
}

/**
 * Gets the supported auth types from an Agent Card's security schemes
 */
export function getSupportedAuthTypes(
  schemes: Record<string, SecurityScheme> | undefined,
): AuthType[] {
  if (!schemes || Object.keys(schemes).length === 0) {
    // No security schemes means any auth type is allowed (or NONE)
    return ['NONE', 'API_KEY', 'OAUTH', 'OIDC'];
  }

  const authTypes = new Set<AuthType>();

  for (const scheme of Object.values(schemes)) {
    authTypes.add(schemeTypeToAuthType(scheme.type));
  }

  return Array.from(authTypes);
}

/**
 * Gets the primary security scheme from an Agent Card
 * Returns the first scheme referenced in the security array, or the first defined scheme
 */
export function getPrimarySecurityScheme(
  card: AgentCard,
): { name: string; scheme: SecurityScheme } | null {
  if (!card.securitySchemes) {
    return null;
  }

  const schemeNames = Object.keys(card.securitySchemes);
  if (schemeNames.length === 0) {
    return null;
  }

  // If security array is defined, use the first one
  if (card.security && card.security.length > 0) {
    const firstSecurity = card.security[0];
    const name = Object.keys(firstSecurity)[0];
    if (name && card.securitySchemes[name]) {
      return { name, scheme: card.securitySchemes[name] };
    }
  }

  // Otherwise return the first defined scheme
  const name = schemeNames[0];
  return { name, scheme: card.securitySchemes[name] };
}

/**
 * Validates that a given auth type is compatible with the card's security schemes
 */
export function validateAuthTypeForCard(
  authType: AuthType,
  card: AgentCard,
): { valid: boolean; error?: string } {
  if (authType === 'NONE') {
    // NONE is always valid if no security schemes are required
    if (!card.security || card.security.length === 0) {
      return { valid: true };
    }
    // Check if any security option allows empty scopes (optional auth)
    const hasOptionalAuth = card.security.some((sec) =>
      Object.values(sec).every((scopes) => scopes.length === 0),
    );
    if (hasOptionalAuth) {
      return { valid: true };
    }
    return { valid: false, error: 'Agent requires authentication' };
  }

  const supportedTypes = getSupportedAuthTypes(card.securitySchemes);

  if (!supportedTypes.includes(authType)) {
    return {
      valid: false,
      error: `Auth type ${authType} not supported. Supported: ${supportedTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Extracts skill IDs from an Agent Card
 */
export function getSkillIds(card: AgentCard): string[] {
  return card.skills.map((skill) => skill.id);
}

/**
 * Finds a skill by ID in an Agent Card
 */
export function findSkill(card: AgentCard, skillId: string) {
  return card.skills.find((skill) => skill.id === skillId);
}
