/**
 * Credential Service
 * Handles building authentication headers for A2A requests
 */

import type { AuthType, SecurityScheme } from './types.js';

/**
 * Builds authentication headers based on auth type and credentials
 */
export function buildAuthHeaders(
  authType: AuthType,
  credentials: Record<string, unknown>,
  securityScheme?: SecurityScheme,
): Record<string, string> {
  switch (authType) {
    case 'API_KEY':
      return buildApiKeyHeaders(credentials, securityScheme);

    case 'OAUTH':
    case 'OIDC':
      return buildBearerHeaders(credentials);

    case 'NONE':
    default:
      return {};
  }
}

/**
 * Builds headers for API key authentication
 * Supports header, query (converted to header), and bearer token formats
 */
function buildApiKeyHeaders(
  credentials: Record<string, unknown>,
  securityScheme?: SecurityScheme,
): Record<string, string> {
  const apiKey = credentials.apiKey;
  if (typeof apiKey !== 'string') {
    return {};
  }

  // If we have a security scheme, use its configuration
  if (securityScheme) {
    if (securityScheme.type === 'http' && securityScheme.scheme === 'bearer') {
      // HTTP Bearer authentication
      return { Authorization: `Bearer ${apiKey}` };
    }

    if (securityScheme.type === 'http' && securityScheme.scheme === 'basic') {
      // HTTP Basic authentication (apiKey is base64 encoded user:pass)
      return { Authorization: `Basic ${apiKey}` };
    }

    if (securityScheme.type === 'apiKey' && securityScheme.in === 'header') {
      // Custom header name
      const headerName = securityScheme.name || 'X-API-Key';
      return { [headerName]: apiKey };
    }

    // For query params, we'd handle them elsewhere (in the request URL)
    // For now, just use the default header
  }

  // Default: use X-API-Key header
  return { 'X-API-Key': apiKey };
}

/**
 * Builds headers for OAuth/OIDC bearer token authentication
 */
function buildBearerHeaders(credentials: Record<string, unknown>): Record<string, string> {
  const accessToken = credentials.accessToken;
  if (typeof accessToken !== 'string') {
    return {};
  }

  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Checks if credentials are expired
 */
export function areCredentialsExpired(credentials: Record<string, unknown>): boolean {
  const expiresAt = credentials.tokenExpiresAt;
  if (!expiresAt) {
    return false; // No expiry = not expired
  }

  const expiryTime =
    typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number(expiresAt);

  if (isNaN(expiryTime)) {
    return false;
  }

  // Add 30 second buffer to handle clock skew
  return Date.now() > expiryTime - 30000;
}

/**
 * Validates that credentials have the required fields for the auth type
 */
export function validateCredentials(
  authType: AuthType,
  credentials: Record<string, unknown>,
): { valid: boolean; error?: string } {
  switch (authType) {
    case 'API_KEY':
      if (!credentials.apiKey || typeof credentials.apiKey !== 'string') {
        return { valid: false, error: 'apiKey is required and must be a string' };
      }
      return { valid: true };

    case 'OAUTH':
    case 'OIDC':
      if (!credentials.accessToken || typeof credentials.accessToken !== 'string') {
        return { valid: false, error: 'accessToken is required and must be a string' };
      }
      if (areCredentialsExpired(credentials)) {
        return { valid: false, error: 'accessToken has expired' };
      }
      return { valid: true };

    case 'NONE':
      return { valid: true };

    default:
      return { valid: false, error: `Unknown auth type: ${authType}` };
  }
}

/**
 * Merges multiple credential sources (org-level, user-level, etc.)
 * Later sources override earlier ones
 */
export function mergeCredentials(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const source of sources) {
    if (source) {
      Object.assign(merged, source);
    }
  }

  return merged;
}
