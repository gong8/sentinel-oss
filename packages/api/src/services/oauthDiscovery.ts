/**
 * OAuth 2.1 Discovery Service for MCP Servers
 *
 * Implements RFC 9728 (Protected Resource Metadata) discovery flow:
 * 1. Try /.well-known/oauth-protected-resource → authorization_servers[0]
 * 2. Try /.well-known/oauth-authorization-server on discovered AS
 * 3. Fallback: Parse resource_metadata from WWW-Authenticate header on 401
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9728
 * @see https://datatracker.ietf.org/doc/html/rfc8414
 */

import { z } from 'zod';
import { logger } from '../lib/logger.js';

const DISCOVERY_TIMEOUT_MS = 10000;

export interface OAuthDiscoveryResult {
  supportsOAuth: boolean;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  registrationEndpoint?: string;
  revocationEndpoint?: string;
  scopesSupported?: string[];
  grantTypesSupported?: string[];
  error?: string;
}

// Zod schemas for type-safe JSON parsing of OAuth discovery responses
const protectedResourceMetadataSchema = z.object({
  resource: z.string().optional(),
  authorization_servers: z.array(z.string()).optional(),
  bearer_methods_supported: z.array(z.string()).optional(),
  resource_documentation: z.string().optional(),
});

const authorizationServerMetadataSchema = z.object({
  issuer: z.string().optional(),
  authorization_endpoint: z.string().optional(),
  token_endpoint: z.string().optional(),
  registration_endpoint: z.string().optional(),
  revocation_endpoint: z.string().optional(),
  scopes_supported: z.array(z.string()).optional(),
  grant_types_supported: z.array(z.string()).optional(),
  response_types_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
});

type AuthorizationServerMetadata = z.infer<typeof authorizationServerMetadataSchema>;

const NO_OAUTH: OAuthDiscoveryResult = { supportsOAuth: false };

/**
 * Fetch JSON from a well-known endpoint with timeout
 */
async function fetchWellKnown<T>(
  url: string,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.debug(`Well-known endpoint not available at ${url}: ${response.status}`);
      return { ok: false };
    }
    const data = schema.parse(await response.json());
    return { ok: true, data };
  } catch (error) {
    logger.debug(`Well-known fetch failed`, { url, error: String(error) });
    return { ok: false };
  }
}

/**
 * Extract origin from a URL (e.g., https://mcp.notion.com/mcp -> https://mcp.notion.com)
 */
function getOriginUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * Discover OAuth capability for an MCP server URL.
 * Follows RFC 9728 discovery flow with fallbacks.
 *
 * Per RFC 9728, well-known endpoints may be at the origin (e.g., https://mcp.notion.com)
 * rather than the full resource path (e.g., https://mcp.notion.com/mcp).
 * We try both locations.
 */
export async function discoverOAuthCapability(serverUrl: string): Promise<OAuthDiscoveryResult> {
  const normalizedUrl = serverUrl.replace(/\/$/, '');
  const originUrl = getOriginUrl(normalizedUrl);

  // URLs to try for discovery (origin first, then full path if different)
  const urlsToTry = normalizedUrl === originUrl ? [originUrl] : [originUrl, normalizedUrl];

  for (const baseUrl of urlsToTry) {
    const prmResult = await tryProtectedResourceMetadata(baseUrl);
    if (prmResult.supportsOAuth) return prmResult;

    const directResult = await tryDirectAuthServerMetadata(baseUrl);
    if (directResult.supportsOAuth) return directResult;
  }

  // Fallback: Check WWW-Authenticate header on 401 response (only on full URL)
  const wwwAuthResult = await tryWwwAuthenticateFallback(normalizedUrl);
  if (wwwAuthResult.supportsOAuth) return wwwAuthResult;

  return NO_OAUTH;
}

/**
 * Try RFC 9728 Protected Resource Metadata discovery.
 */
async function tryProtectedResourceMetadata(serverUrl: string): Promise<OAuthDiscoveryResult> {
  const prmUrl = `${serverUrl}/.well-known/oauth-protected-resource`;
  const result = await fetchWellKnown(prmUrl, protectedResourceMetadataSchema);

  if (!result.ok) return NO_OAUTH;

  const asUrl = result.data.authorization_servers?.[0];
  if (!asUrl) {
    logger.debug(`PRM found but no authorization_servers array`, { serverUrl });
    return NO_OAUTH;
  }

  logger.info(`Found authorization server via PRM`, { serverUrl, asUrl });
  return await discoverAuthorizationServer(asUrl);
}

/**
 * Try direct OAuth Authorization Server Metadata on the server URL.
 */
async function tryDirectAuthServerMetadata(serverUrl: string): Promise<OAuthDiscoveryResult> {
  const asmUrl = `${serverUrl}/.well-known/oauth-authorization-server`;
  const result = await fetchWellKnown(asmUrl, authorizationServerMetadataSchema);

  if (!result.ok) return NO_OAUTH;

  logger.info(`Found OAuth AS metadata directly`, { serverUrl });
  return parseAuthServerMetadata(result.data);
}

/**
 * Fallback: Check WWW-Authenticate header on 401 response.
 * MCP servers may include resource_metadata URL in the header.
 */
async function tryWwwAuthenticateFallback(serverUrl: string): Promise<OAuthDiscoveryResult> {
  try {
    const response = await fetch(serverUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });

    if (response.status !== 401) {
      logger.debug(`Server did not return 401, WWW-Authenticate fallback skipped`, {
        serverUrl,
        status: response.status,
      });
      return NO_OAUTH;
    }

    const wwwAuth = response.headers.get('WWW-Authenticate');
    if (!wwwAuth) {
      logger.debug(`No WWW-Authenticate header in 401 response`, { serverUrl });
      return NO_OAUTH;
    }

    const resourceMetaUrl = parseResourceMetadataFromWwwAuth(wwwAuth);
    if (!resourceMetaUrl) {
      logger.debug(`No resource_metadata found in WWW-Authenticate`, { serverUrl, wwwAuth });
      return NO_OAUTH;
    }

    logger.info(`Found resource_metadata in WWW-Authenticate`, { serverUrl, resourceMetaUrl });

    const result = await fetchWellKnown(resourceMetaUrl, protectedResourceMetadataSchema);
    if (!result.ok) return NO_OAUTH;

    const asUrl = result.data.authorization_servers?.[0];
    if (!asUrl) {
      logger.debug(`Resource metadata has no authorization_servers`, { resourceMetaUrl });
      return NO_OAUTH;
    }

    return await discoverAuthorizationServer(asUrl);
  } catch (error) {
    logger.debug(`WWW-Authenticate fallback failed`, { serverUrl, error: String(error) });
    return NO_OAUTH;
  }
}

/**
 * Discover OAuth Authorization Server metadata.
 */
async function discoverAuthorizationServer(asUrl: string): Promise<OAuthDiscoveryResult> {
  const normalizedAsUrl = asUrl.replace(/\/$/, '');
  const asmUrl = `${normalizedAsUrl}/.well-known/oauth-authorization-server`;
  const result = await fetchWellKnown(asmUrl, authorizationServerMetadataSchema);

  if (!result.ok) {
    return { supportsOAuth: false, error: `Failed to fetch AS metadata from ${asmUrl}` };
  }

  return parseAuthServerMetadata(result.data);
}

/**
 * Parse Authorization Server Metadata into our discovery result format.
 */
function parseAuthServerMetadata(asm: AuthorizationServerMetadata): OAuthDiscoveryResult {
  if (!asm.authorization_endpoint || !asm.token_endpoint) {
    return {
      supportsOAuth: false,
      error: 'AS metadata missing required endpoints (authorization_endpoint, token_endpoint)',
    };
  }

  // Verify PKCE support if specified
  const codeChallengeMethodsSupported = asm.code_challenge_methods_supported || [];
  if (codeChallengeMethodsSupported.length > 0 && !codeChallengeMethodsSupported.includes('S256')) {
    logger.warn(`AS does not support S256 PKCE, only: ${codeChallengeMethodsSupported.join(', ')}`);
  }

  return {
    supportsOAuth: true,
    authorizationEndpoint: asm.authorization_endpoint,
    tokenEndpoint: asm.token_endpoint,
    registrationEndpoint: asm.registration_endpoint,
    revocationEndpoint: asm.revocation_endpoint,
    scopesSupported: asm.scopes_supported || [],
    grantTypesSupported: asm.grant_types_supported || ['authorization_code'],
  };
}

/**
 * Parse resource_metadata URL from WWW-Authenticate header.
 * Format: Bearer realm="...", resource_metadata="https://..." or resource_metadata=https://...
 */
function parseResourceMetadataFromWwwAuth(wwwAuth: string): string | null {
  // Match resource_metadata="..." (quoted) or resource_metadata=... (unquoted)
  const match = wwwAuth.match(/resource_metadata="([^"]+)"|resource_metadata=([^\s,]+)/);
  return match?.[1] ?? match?.[2] ?? null;
}
