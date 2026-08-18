/**
 * OAuth 2.1 Service for MCP Server Authentication
 *
 * Implements OAuth 2.1 client functionality:
 * - PKCE generation (S256 mandatory)
 * - Dynamic Client Registration (RFC 7591)
 * - Authorization code flow initiation
 * - Token exchange with resource parameter (RFC 8707)
 * - Token refresh with rotation
 * - Token revocation
 *
 * Security requirements (non-negotiable):
 * - PKCE with S256 only
 * - Resource parameter in auth AND token requests
 * - State is cryptographically random, one-time, 10min expiry
 * - All tokens encrypted before storage
 * - Never log decrypted tokens
 */

import { prisma } from '@sentinel/db';
import crypto from 'node:crypto';
import { z } from 'zod';
import { decryptString, encryptString } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';

// Zod schemas for OAuth API responses
const dcrResponseSchema = z.object({
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

// PKCE code verifier: 64 random bytes as base64url
const CODE_VERIFIER_LENGTH = 64;
// State: 32 random bytes as base64url
const STATE_LENGTH = 32;
// State expiry: 10 minutes
const STATE_EXPIRY_MS = 10 * 60 * 1000;
// Token refresh buffer: refresh if expiring within 5 minutes
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Get the OAuth redirect URI for callbacks.
 * Priority:
 * 1. OAUTH_CALLBACK_URL - explicit override for special configurations
 * 2. API_URL - derive from the API server URL (recommended for deployments)
 * 3. Fallback to localhost:3000 for local development only
 */
export function getOAuthRedirectUri(): string {
  if (process.env.OAUTH_CALLBACK_URL) {
    return process.env.OAUTH_CALLBACK_URL;
  }
  if (process.env.API_URL) {
    // Ensure we append the callback path correctly
    const apiUrl = process.env.API_URL.replace(/\/$/, ''); // Remove trailing slash
    return `${apiUrl}/api/oauth/callback`;
  }
  // Warn in production when using localhost fallback
  if (process.env.NODE_ENV === 'production') {
    logger.warn(
      'OAuth redirect using localhost fallback. Set API_URL or OAUTH_CALLBACK_URL for production.',
    );
  }
  return 'http://localhost:3000/api/oauth/callback';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface TokenData {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  tokenExpiresAt: Date | null;
  tokenScope: string | null;
}

/**
 * Parse and validate token response from OAuth server.
 */
function parseTokenResponse(json: unknown): TokenData {
  const result = tokenResponseSchema.safeParse(json);
  if (!result.success) {
    throw new Error('Token response missing access_token');
  }
  const tokens = result.data;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenType: tokens.token_type ?? 'Bearer',
    tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    tokenScope: tokens.scope ?? null,
  };
}

/**
 * Build token request body for OAuth token endpoint.
 */
function buildTokenRequestBody(
  params: Record<string, string>,
  registration: { clientId: string; clientSecret: string },
  resource: string,
): URLSearchParams {
  return new URLSearchParams({
    ...params,
    client_id: registration.clientId,
    client_secret: decryptString(registration.clientSecret),
    resource,
  });
}

/**
 * Make a token request to the OAuth server.
 */
async function makeTokenRequest(tokenEndpoint: string, body: URLSearchParams): Promise<Response> {
  return fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(30000),
  });
}

/**
 * Try to revoke a token at the authorization server.
 * Returns true if revocation succeeded, false otherwise.
 */
async function tryRevokeToken(
  revocationEndpoint: string,
  token: string,
  clientId: string,
  clientSecret: string,
): Promise<boolean> {
  try {
    await fetch(revocationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token,
        client_id: clientId,
        client_secret: decryptString(clientSecret),
      }),
      signal: AbortSignal.timeout(10000),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a token needs refresh (expiring within buffer period).
 */
export function tokenNeedsRefresh(expiresAt: Date | null, hasRefreshToken: boolean): boolean {
  if (!expiresAt || !hasRefreshToken) {
    return false;
  }
  return expiresAt < new Date(Date.now() + TOKEN_REFRESH_BUFFER_MS);
}

/**
 * Generate PKCE code_verifier and code_challenge.
 * Uses S256 method only (plain is forbidden).
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Generate 64 random bytes for code_verifier
  const codeVerifier = crypto.randomBytes(CODE_VERIFIER_LENGTH).toString('base64url');

  // S256: SHA256 hash of code_verifier, then base64url encode
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Generate cryptographically random state token for CSRF protection.
 */
export function generateState(): string {
  return crypto.randomBytes(STATE_LENGTH).toString('base64url');
}

export interface OAuthClientRegistrationResult {
  clientId: string;
  clientSecret: string;
}

/**
 * Register OAuth client via Dynamic Client Registration (RFC 7591).
 */
export async function registerOAuthClient(
  registrationEndpoint: string,
  organizationName: string,
  redirectUri: string,
): Promise<OAuthClientRegistrationResult> {
  logger.info('Registering OAuth client via DCR', { registrationEndpoint });

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_name: `SENTINEL - ${organizationName}`,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('DCR failed', { registrationEndpoint, status: response.status, error: errorText });
    throw new Error(`OAuth client registration failed: ${response.status}`);
  }

  const responseJson = await response.json();
  const parseResult = dcrResponseSchema.safeParse(responseJson);

  if (!parseResult.success || !parseResult.data.client_id) {
    throw new Error('DCR response missing client_id');
  }

  const clientId = parseResult.data.client_id;
  const clientSecret = parseResult.data.client_secret || '';

  logger.info('OAuth client registered successfully', { clientId });

  return {
    clientId,
    clientSecret,
  };
}

/**
 * Store OAuth client registration for an MCP server.
 */
export async function storeOAuthClientRegistration(
  organizationId: string,
  mcpServerId: string,
  clientId: string,
  clientSecret: string,
  authorizationEndpoint: string,
  tokenEndpoint: string,
  registrationEndpoint: string | null,
  revocationEndpoint: string | null,
  scopesSupported: string[],
  grantTypesSupported: string[],
  redirectUri?: string,
): Promise<void> {
  // Use provided redirectUri or derive from current environment
  const storedRedirectUri = redirectUri || getOAuthRedirectUri();

  await prisma.oAuthClientRegistration.upsert({
    where: { mcpServerId },
    create: {
      organizationId,
      mcpServerId,
      clientId,
      clientSecret: encryptString(clientSecret),
      redirectUri: storedRedirectUri,
      authorizationEndpoint,
      tokenEndpoint,
      registrationEndpoint,
      revocationEndpoint,
      scopesSupported,
      grantTypesSupported,
    },
    update: {
      clientId,
      clientSecret: encryptString(clientSecret),
      redirectUri: storedRedirectUri,
      authorizationEndpoint,
      tokenEndpoint,
      registrationEndpoint,
      revocationEndpoint,
      scopesSupported,
      grantTypesSupported,
      updatedAt: new Date(),
    },
  });

  logger.info('OAuth client registration stored', {
    organizationId,
    mcpServerId,
    clientId,
    redirectUri: storedRedirectUri,
  });
}

/**
 * Initiate OAuth 2.1 authorization flow.
 * Creates PKCE challenge, stores state, and returns authorization URL.
 *
 * @param organizationId - The organization ID to scope the MCP server lookup
 * @param isOrgLevel - If true, tokens will be stored at org level (shared across users)
 * @param workspaceId - If set, tokens will be stored at workspace level
 */
export async function initiateOAuthFlow(
  organizationId: string,
  userId: string,
  mcpServerId: string,
  returnUrl?: string,
  isOrgLevel: boolean = false,
  workspaceId?: string,
): Promise<{ authorizationUrl: string }> {
  // Get MCP server with OAuth registration, scoped to organization
  const mcpServer = await prisma.mcpServer.findFirst({
    where: {
      id: mcpServerId,
      organizationId,
      deletedAt: null,
    },
    include: { oauthClientRegistration: true },
  });

  if (!mcpServer) {
    throw new Error('MCP server not found');
  }

  if (!mcpServer.oauthClientRegistration) {
    throw new Error('OAuth not configured for this MCP server');
  }

  const registration = mcpServer.oauthClientRegistration;

  // Generate PKCE
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Generate state
  const state = generateState();

  // Use stored redirect URI from registration (for consistency across environments)
  // Fall back to current environment if not stored (legacy registrations)
  const redirectUri = registration.redirectUri || getOAuthRedirectUri();

  // Store state for callback validation (one-time use, 10min expiry)
  await prisma.oAuthState.create({
    data: {
      organizationId,
      state,
      userId,
      mcpServerId,
      codeVerifier,
      resource: mcpServer.url,
      returnUrl,
      isOrgLevel,
      workspaceId,
      expiresAt: new Date(Date.now() + STATE_EXPIRY_MS),
    },
  });

  // Build authorization URL
  const authUrl = new URL(registration.authorizationEndpoint);
  authUrl.searchParams.set('client_id', registration.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('resource', mcpServer.url); // RFC 8707 - MANDATORY
  authUrl.searchParams.set('state', state);

  // Add scopes if available
  if (registration.scopesSupported.length > 0) {
    authUrl.searchParams.set('scope', registration.scopesSupported.join(' '));
  }

  logger.info('OAuth flow initiated', { userId, mcpServerId });

  return { authorizationUrl: authUrl.toString() };
}

export interface OAuthCallbackResult {
  userId: string;
  mcpServerId: string;
  organizationId: string;
  serverName: string;
  returnUrl?: string;
  isOrgLevel: boolean;
  workspaceId?: string;
}

/**
 * Handle OAuth callback - validate state and exchange code for tokens.
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
): Promise<OAuthCallbackResult> {
  // 1. Validate and retrieve state
  const oauthState = await prisma.oAuthState.findUnique({
    where: { state },
  });

  if (!oauthState) {
    throw new Error('Invalid or expired OAuth state');
  }

  if (oauthState.expiresAt < new Date()) {
    // Clean up expired state
    await prisma.oAuthState.delete({ where: { id: oauthState.id } });
    throw new Error('OAuth state expired');
  }

  // 2. Delete state immediately (one-time use - critical for security)
  await prisma.oAuthState.delete({ where: { id: oauthState.id } });

  // 3. Get MCP server with OAuth registration, scoped to organization from state
  const mcpServer = await prisma.mcpServer.findFirst({
    where: {
      id: oauthState.mcpServerId,
      organizationId: oauthState.organizationId,
      deletedAt: null,
    },
    include: { oauthClientRegistration: true },
  });

  if (!mcpServer?.oauthClientRegistration) {
    throw new Error('OAuth configuration not found for MCP server');
  }

  // 4. Validate user belongs to the organization
  const user = await prisma.user.findUnique({
    where: { id: oauthState.userId },
    select: { organizationId: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.organizationId !== oauthState.organizationId) {
    throw new Error('User does not belong to the organization');
  }

  const registration = mcpServer.oauthClientRegistration;

  // Use stored redirect URI from registration (must match what was used during authorization)
  const redirectUri = registration.redirectUri || getOAuthRedirectUri();

  // 5. Exchange authorization code for tokens
  const body = buildTokenRequestBody(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: oauthState.codeVerifier,
    },
    registration,
    oauthState.resource,
  );
  const tokenResponse = await makeTokenRequest(registration.tokenEndpoint, body);

  if (!tokenResponse.ok) {
    await tokenResponse.text();
    logger.error('Token exchange failed', {
      mcpServerId: mcpServer.id,
      status: tokenResponse.status,
    });
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  const tokens = parseTokenResponse(await tokenResponse.json());
  const encryptedTokens = {
    accessToken: encryptString(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encryptString(tokens.refreshToken) : null,
    tokenType: tokens.tokenType,
    tokenExpiresAt: tokens.tokenExpiresAt,
    tokenScope: tokens.tokenScope,
  };

  // 6. Store tokens (encrypted)
  if (oauthState.isOrgLevel) {
    await prisma.orgMcpOAuthToken.upsert({
      where: { mcpServerId: oauthState.mcpServerId },
      create: {
        organizationId: oauthState.organizationId,
        mcpServerId: oauthState.mcpServerId,
        ...encryptedTokens,
        connectedBy: oauthState.userId,
        authenticatedAt: new Date(),
      },
      update: {
        ...encryptedTokens,
        refreshToken: encryptedTokens.refreshToken ?? undefined,
        connectedBy: oauthState.userId,
        authenticatedAt: new Date(),
        lastRefreshedAt: new Date(),
      },
    });

    logger.info('Org-level OAuth tokens stored', {
      organizationId: oauthState.organizationId,
      mcpServerId: oauthState.mcpServerId,
    });
  } else if (oauthState.workspaceId) {
    await prisma.workspaceMcpOAuthToken.upsert({
      where: {
        workspaceId_mcpServerId: {
          workspaceId: oauthState.workspaceId,
          mcpServerId: oauthState.mcpServerId,
        },
      },
      create: {
        workspaceId: oauthState.workspaceId,
        mcpServerId: oauthState.mcpServerId,
        ...encryptedTokens,
        connectedBy: oauthState.userId,
        authenticatedAt: new Date(),
      },
      update: {
        ...encryptedTokens,
        refreshToken: encryptedTokens.refreshToken ?? undefined,
        connectedBy: oauthState.userId,
        authenticatedAt: new Date(),
        lastRefreshedAt: new Date(),
      },
    });

    logger.info('Workspace-level OAuth tokens stored', {
      workspaceId: oauthState.workspaceId,
      mcpServerId: oauthState.mcpServerId,
    });
  } else {
    const storedConfig = await prisma.userMcpConfig.upsert({
      where: {
        userId_mcpServerId: {
          userId: oauthState.userId,
          mcpServerId: oauthState.mcpServerId,
        },
      },
      create: {
        userId: oauthState.userId,
        mcpServerId: oauthState.mcpServerId,
        ...encryptedTokens,
        authenticatedAt: new Date(),
        credentials: {},
      },
      update: {
        ...encryptedTokens,
        refreshToken: encryptedTokens.refreshToken ?? undefined,
        authenticatedAt: new Date(),
        lastRefreshedAt: new Date(),
      },
    });

    logger.info('Personal OAuth tokens stored', {
      userId: oauthState.userId,
      mcpServerId: oauthState.mcpServerId,
      configId: storedConfig.id,
      hasAccessToken: !!storedConfig.accessToken,
    });
  }

  return {
    userId: oauthState.userId,
    mcpServerId: oauthState.mcpServerId,
    organizationId: mcpServer.organizationId,
    serverName: mcpServer.name,
    returnUrl: oauthState.returnUrl ?? undefined,
    isOrgLevel: oauthState.isOrgLevel,
    workspaceId: oauthState.workspaceId ?? undefined,
  };
}

/**
 * Refresh access token using refresh token.
 * Implements refresh token rotation (stores new refresh_token if returned).
 *
 * @param organizationId - The organization ID to validate user and server belong to same org
 */
export async function refreshAccessToken(
  organizationId: string,
  userId: string,
  mcpServerId: string,
): Promise<void> {
  const userConfig = await prisma.userMcpConfig.findUnique({
    where: { userId_mcpServerId: { userId, mcpServerId } },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
      user: { select: { organizationId: true } },
    },
  });

  if (!userConfig?.refreshToken) {
    throw new Error('No refresh token available - please reconnect');
  }

  // Validate user and server belong to the specified organization
  if (userConfig.user.organizationId !== organizationId) {
    throw new Error('User does not belong to the specified organization');
  }
  if (userConfig.mcpServer.organizationId !== organizationId) {
    throw new Error('MCP server does not belong to the specified organization');
  }

  const registration = userConfig.mcpServer.oauthClientRegistration;
  if (!registration) {
    throw new Error('OAuth not configured for this MCP server');
  }

  const body = buildTokenRequestBody(
    { grant_type: 'refresh_token', refresh_token: decryptString(userConfig.refreshToken) },
    registration,
    userConfig.mcpServer.url,
  );
  const response = await makeTokenRequest(registration.tokenEndpoint, body);

  if (!response.ok) {
    await prisma.userMcpConfig.update({
      where: { id: userConfig.id },
      data: { accessToken: null, refreshToken: null, tokenExpiresAt: null, authenticatedAt: null },
    });
    logger.warn('Token refresh failed, tokens cleared', { userId, mcpServerId });
    throw new Error('Refresh token expired - please reconnect');
  }

  const tokens = parseTokenResponse(await response.json());

  await prisma.userMcpConfig.update({
    where: { id: userConfig.id },
    data: {
      accessToken: encryptString(tokens.accessToken),
      refreshToken: tokens.refreshToken
        ? encryptString(tokens.refreshToken)
        : userConfig.refreshToken,
      tokenType: tokens.tokenType || userConfig.tokenType,
      tokenExpiresAt: tokens.tokenExpiresAt,
      tokenScope: tokens.tokenScope || userConfig.tokenScope,
      lastRefreshedAt: new Date(),
    },
  });

  logger.info('Token refreshed successfully', { userId, mcpServerId });
}

/**
 * Revoke tokens and disconnect user from MCP server.
 * Calls revocation endpoint if available.
 *
 * @param organizationId - The organization ID to validate user and server belong to same org
 */
export async function revokeAndDisconnect(
  organizationId: string,
  userId: string,
  mcpServerId: string,
): Promise<void> {
  const userConfig = await prisma.userMcpConfig.findUnique({
    where: { userId_mcpServerId: { userId, mcpServerId } },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
      user: { select: { organizationId: true } },
    },
  });

  if (!userConfig) {
    throw new Error('User is not connected to this MCP server');
  }

  // Validate user and server belong to the specified organization
  if (userConfig.user.organizationId !== organizationId) {
    throw new Error('User does not belong to the specified organization');
  }
  if (userConfig.mcpServer.organizationId !== organizationId) {
    throw new Error('MCP server does not belong to the specified organization');
  }

  const registration = userConfig.mcpServer.oauthClientRegistration;

  if (registration?.revocationEndpoint && userConfig.accessToken) {
    const revoked = await tryRevokeToken(
      registration.revocationEndpoint,
      decryptString(userConfig.accessToken),
      registration.clientId,
      registration.clientSecret,
    );
    if (revoked) {
      logger.info('Token revoked at authorization server', { userId, mcpServerId });
    } else {
      logger.warn('Token revocation failed', { userId, mcpServerId });
    }
  }

  await prisma.userMcpConfig.delete({
    where: { userId_mcpServerId: { userId, mcpServerId } },
  });

  logger.info('User disconnected from MCP server', { userId, mcpServerId });
}

/**
 * Get decrypted access token for making MCP requests.
 * Handles automatic refresh if token is expiring soon.
 *
 * @param organizationId - The organization ID to validate user and server belong to same org
 */
export async function getAccessToken(
  organizationId: string,
  userId: string,
  mcpServerId: string,
): Promise<{ token: string; tokenType: string }> {
  const userConfig = await prisma.userMcpConfig.findUnique({
    where: { userId_mcpServerId: { userId, mcpServerId } },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
      user: { select: { organizationId: true } },
    },
  });

  if (!userConfig?.accessToken) {
    throw new Error('Not authenticated - please connect via OAuth');
  }

  // Validate user and server belong to the specified organization
  if (userConfig.user.organizationId !== organizationId) {
    throw new Error('User does not belong to the specified organization');
  }
  if (userConfig.mcpServer.organizationId !== organizationId) {
    throw new Error('MCP server does not belong to the specified organization');
  }

  if (tokenNeedsRefresh(userConfig.tokenExpiresAt, !!userConfig.refreshToken)) {
    logger.info('Proactively refreshing expiring token', { userId, mcpServerId });
    await refreshAccessToken(organizationId, userId, mcpServerId);

    const refreshedConfig = await prisma.userMcpConfig.findUnique({
      where: { userId_mcpServerId: { userId, mcpServerId } },
    });

    if (!refreshedConfig?.accessToken) {
      throw new Error('Token refresh failed - please reconnect');
    }

    return {
      token: decryptString(refreshedConfig.accessToken),
      tokenType: refreshedConfig.tokenType || 'Bearer',
    };
  }

  return {
    token: decryptString(userConfig.accessToken),
    tokenType: userConfig.tokenType || 'Bearer',
  };
}

/**
 * Check if user is connected to an MCP server via OAuth.
 *
 * @param organizationId - The organization ID to validate user and server belong to same org
 */
export async function getConnectionStatus(
  organizationId: string,
  userId: string,
  mcpServerId: string,
): Promise<{
  connected: boolean;
  method: 'OAUTH' | 'API_KEY' | 'NONE';
  expiresAt?: Date;
  scope?: string;
  authenticatedAt?: Date;
}> {
  const userConfig = await prisma.userMcpConfig.findUnique({
    where: { userId_mcpServerId: { userId, mcpServerId } },
    include: {
      mcpServer: true,
      user: { select: { organizationId: true } },
    },
  });

  if (!userConfig) {
    return { connected: false, method: 'NONE' };
  }

  // Validate user and server belong to the specified organization
  if (userConfig.user.organizationId !== organizationId) {
    throw new Error('User does not belong to the specified organization');
  }
  if (userConfig.mcpServer.organizationId !== organizationId) {
    throw new Error('MCP server does not belong to the specified organization');
  }

  // Check for OAuth tokens
  if (userConfig.accessToken) {
    return {
      connected: true,
      method: 'OAUTH',
      expiresAt: userConfig.tokenExpiresAt ?? undefined,
      scope: userConfig.tokenScope ?? undefined,
      authenticatedAt: userConfig.authenticatedAt ?? undefined,
    };
  }

  // Check for API key
  if (userConfig.apiKey) {
    return {
      connected: true,
      method: 'API_KEY',
      authenticatedAt: userConfig.authenticatedAt ?? undefined,
    };
  }

  return { connected: false, method: 'NONE' };
}

/**
 * System-wide cleanup function for removing expired OAuth states.
 * Should only be called from trusted cron jobs.
 */
export async function cleanupExpiredStates(): Promise<number> {
  const result = await prisma.oAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  if (result.count > 0) {
    logger.info(`Cleaned up ${result.count} expired OAuth states`);
  }

  return result.count;
}

// ============================================================================
// ORG-LEVEL OAUTH FUNCTIONS
// ============================================================================

/**
 * Get org-level access token status.
 */
export async function getOrgOAuthStatus(
  organizationId: string,
  mcpServerId: string,
): Promise<{
  connected: boolean;
  connectedBy?: string; // User ID who connected
  connectedByEmail?: string;
  expiresAt?: Date;
  scope?: string;
  authenticatedAt?: Date;
}> {
  const orgToken = await prisma.orgMcpOAuthToken.findUnique({
    where: { mcpServerId },
    include: {
      connectedByUser: { select: { email: true } },
    },
  });

  if (!orgToken || orgToken.organizationId !== organizationId) {
    return { connected: false };
  }

  // Check if tokens have been cleared (refresh failed)
  // accessToken might be encrypted empty string after failed refresh
  const hasValidToken = orgToken.accessToken && decryptString(orgToken.accessToken).length > 0;

  if (!hasValidToken) {
    return { connected: false };
  }

  return {
    connected: true,
    connectedBy: orgToken.connectedBy ?? undefined,
    connectedByEmail: orgToken.connectedByUser?.email ?? undefined,
    expiresAt: orgToken.tokenExpiresAt ?? undefined,
    scope: orgToken.tokenScope ?? undefined,
    authenticatedAt: orgToken.authenticatedAt,
  };
}

/**
 * Get decrypted org-level access token for making MCP requests.
 * Handles automatic refresh if token is expiring soon.
 */
export async function getOrgAccessToken(
  organizationId: string,
  mcpServerId: string,
): Promise<{ token: string; tokenType: string }> {
  const orgToken = await prisma.orgMcpOAuthToken.findUnique({
    where: { mcpServerId },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
    },
  });

  if (!orgToken || orgToken.organizationId !== organizationId) {
    throw new Error('No org-level OAuth token - please connect via OAuth');
  }

  if (tokenNeedsRefresh(orgToken.tokenExpiresAt, !!orgToken.refreshToken)) {
    logger.info('Proactively refreshing expiring org token', { organizationId, mcpServerId });
    await refreshOrgAccessToken(organizationId, mcpServerId);

    const refreshedToken = await prisma.orgMcpOAuthToken.findUnique({
      where: { mcpServerId },
    });

    if (!refreshedToken?.accessToken) {
      throw new Error('Org token refresh failed - please reconnect');
    }

    return {
      token: decryptString(refreshedToken.accessToken),
      tokenType: refreshedToken.tokenType,
    };
  }

  return {
    token: decryptString(orgToken.accessToken),
    tokenType: orgToken.tokenType,
  };
}

/**
 * Refresh org-level access token using refresh token.
 */
export async function refreshOrgAccessToken(
  organizationId: string,
  mcpServerId: string,
): Promise<void> {
  const orgToken = await prisma.orgMcpOAuthToken.findUnique({
    where: { mcpServerId },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
    },
  });

  if (!orgToken || orgToken.organizationId !== organizationId) {
    throw new Error('No org-level OAuth token found');
  }

  if (!orgToken.refreshToken) {
    throw new Error('No refresh token available - please reconnect');
  }

  const registration = orgToken.mcpServer.oauthClientRegistration;
  if (!registration) {
    throw new Error('OAuth not configured for this MCP server');
  }

  const body = buildTokenRequestBody(
    { grant_type: 'refresh_token', refresh_token: decryptString(orgToken.refreshToken) },
    registration,
    orgToken.mcpServer.url,
  );
  const response = await makeTokenRequest(registration.tokenEndpoint, body);

  if (!response.ok) {
    await prisma.orgMcpOAuthToken.update({
      where: { id: orgToken.id },
      data: {
        accessToken: encryptString(''),
        refreshToken: null,
        tokenExpiresAt: null,
      },
    });
    logger.warn('Org token refresh failed, tokens cleared', { organizationId, mcpServerId });
    throw new Error('Refresh token expired - please reconnect');
  }

  const tokens = parseTokenResponse(await response.json());

  await prisma.orgMcpOAuthToken.update({
    where: { id: orgToken.id },
    data: {
      accessToken: encryptString(tokens.accessToken),
      refreshToken: tokens.refreshToken
        ? encryptString(tokens.refreshToken)
        : orgToken.refreshToken,
      tokenType: tokens.tokenType || orgToken.tokenType,
      tokenExpiresAt: tokens.tokenExpiresAt,
      tokenScope: tokens.tokenScope || orgToken.tokenScope,
      lastRefreshedAt: new Date(),
    },
  });

  logger.info('Org token refreshed successfully', { organizationId, mcpServerId });
}

/**
 * Refresh workspace-level access token using refresh token.
 */
export async function refreshWorkspaceAccessToken(
  workspaceId: string,
  mcpServerId: string,
): Promise<void> {
  const workspaceToken = await prisma.workspaceMcpOAuthToken.findUnique({
    where: {
      workspaceId_mcpServerId: {
        workspaceId,
        mcpServerId,
      },
    },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
    },
  });

  if (!workspaceToken) {
    throw new Error('No workspace-level OAuth token found');
  }

  if (!workspaceToken.refreshToken) {
    throw new Error('No refresh token available - please reconnect');
  }

  const registration = workspaceToken.mcpServer.oauthClientRegistration;
  if (!registration) {
    throw new Error('OAuth not configured for this MCP server');
  }

  const body = buildTokenRequestBody(
    { grant_type: 'refresh_token', refresh_token: decryptString(workspaceToken.refreshToken) },
    registration,
    workspaceToken.mcpServer.url,
  );
  const response = await makeTokenRequest(registration.tokenEndpoint, body);

  if (!response.ok) {
    await prisma.workspaceMcpOAuthToken.update({
      where: { id: workspaceToken.id },
      data: {
        accessToken: encryptString(''),
        refreshToken: null,
        tokenExpiresAt: null,
      },
    });
    logger.warn('Workspace token refresh failed, tokens cleared', { workspaceId, mcpServerId });
    throw new Error('Refresh token expired - please reconnect');
  }

  const tokens = parseTokenResponse(await response.json());

  await prisma.workspaceMcpOAuthToken.update({
    where: { id: workspaceToken.id },
    data: {
      accessToken: encryptString(tokens.accessToken),
      refreshToken: tokens.refreshToken
        ? encryptString(tokens.refreshToken)
        : workspaceToken.refreshToken,
      tokenType: tokens.tokenType || workspaceToken.tokenType,
      tokenExpiresAt: tokens.tokenExpiresAt,
      tokenScope: tokens.tokenScope || workspaceToken.tokenScope,
      lastRefreshedAt: new Date(),
    },
  });

  logger.info('Workspace token refreshed successfully', { workspaceId, mcpServerId });
}

/**
 * Revoke org-level tokens and disconnect organization from MCP server.
 */
export async function revokeAndDisconnectOrg(
  organizationId: string,
  mcpServerId: string,
): Promise<void> {
  const orgToken = await prisma.orgMcpOAuthToken.findUnique({
    where: { mcpServerId },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
    },
  });

  if (!orgToken || orgToken.organizationId !== organizationId) {
    throw new Error('Organization is not connected to this MCP server');
  }

  const registration = orgToken.mcpServer.oauthClientRegistration;

  if (registration?.revocationEndpoint && orgToken.accessToken) {
    const revoked = await tryRevokeToken(
      registration.revocationEndpoint,
      decryptString(orgToken.accessToken),
      registration.clientId,
      registration.clientSecret,
    );
    if (revoked) {
      logger.info('Org token revoked at authorization server', { organizationId, mcpServerId });
    } else {
      logger.warn('Org token revocation failed', { organizationId, mcpServerId });
    }
  }

  await prisma.orgMcpOAuthToken.delete({
    where: { mcpServerId },
  });

  logger.info('Organization disconnected from MCP server', { organizationId, mcpServerId });
}

/**
 * Revoke workspace-level tokens and disconnect workspace from MCP server.
 */
export async function revokeAndDisconnectWorkspace(
  workspaceId: string,
  mcpServerId: string,
): Promise<void> {
  const workspaceToken = await prisma.workspaceMcpOAuthToken.findUnique({
    where: {
      workspaceId_mcpServerId: {
        workspaceId,
        mcpServerId,
      },
    },
    include: {
      mcpServer: { include: { oauthClientRegistration: true } },
    },
  });

  if (!workspaceToken) {
    throw new Error('Workspace is not connected to this MCP server');
  }

  const registration = workspaceToken.mcpServer.oauthClientRegistration;

  if (registration?.revocationEndpoint && workspaceToken.accessToken) {
    const revoked = await tryRevokeToken(
      registration.revocationEndpoint,
      decryptString(workspaceToken.accessToken),
      registration.clientId,
      registration.clientSecret,
    );
    if (revoked) {
      logger.info('Workspace token revoked at authorization server', { workspaceId, mcpServerId });
    } else {
      logger.warn('Workspace token revocation failed', { workspaceId, mcpServerId });
    }
  }

  await prisma.workspaceMcpOAuthToken.delete({
    where: {
      workspaceId_mcpServerId: {
        workspaceId,
        mcpServerId,
      },
    },
  });

  logger.info('Workspace disconnected from MCP server', { workspaceId, mcpServerId });
}
