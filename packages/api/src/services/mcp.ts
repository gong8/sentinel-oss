/**
 * MCP Service
 * Handles MCP server discovery and tool management
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpAuthType, McpServer, prisma, TransportType } from '@sentinel/db';
import { z } from 'zod';
import { decryptCredentials, decryptString, encryptObject } from '../lib/crypto.js';
import { isPlainObject, toJsonValue } from '../lib/jsonValue.js';
import { logger } from '../lib/logger.js';
import {
  getOrgAccessToken,
  refreshAccessToken,
  refreshWorkspaceAccessToken,
  tokenNeedsRefresh,
} from './oauth.js';
import { startBackgroundClassification } from './toolClassification.js';

// Zod schemas for OAuth metadata responses
const oauthAuthServerMetadataSchema = z.object({
  authorization_endpoint: z.string().optional(),
  issuer: z.string().optional(),
});

const oauthProtectedResourceMetadataSchema = z.object({
  authorization_servers: z.array(z.string()).optional(),
  resource: z.string().optional(),
});

const authServerMetadataSchema = z.object({
  authorization_endpoint: z.string().optional(),
});

export type DetectedAuthType = 'oauth' | 'api_key' | 'none' | 'unknown';

export interface AuthProbeResult {
  detectedAuthType: DetectedAuthType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  supportsOAuth?: boolean;
  authorizationEndpoint?: string;
}

const HEADER_CONTENT_TYPE = 'application/json';
const HEADER_ACCEPT = 'application/json, text/event-stream';
const LOCAL_MCP_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
const DEFAULT_TIMEOUT_MS = 5000;
const MCP_STARTUP_DELAY_MS = 2000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches JSON from a URL with standard timeout and headers.
 */
async function fetchJson(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      return res.json();
    }
  } catch {
    // Fetch failed
  }
  return null;
}

/**
 * Creates an MCP client with standard configuration.
 */
function createMcpClient(name: string): Client {
  return new Client({ name, version: '0.1.0' }, { capabilities: {} });
}

/**
 * Safely closes an MCP client, ignoring any errors.
 */
async function safeCloseClient(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore close errors
  }
}

/**
 * Extracts a string value from credentials if it exists and is non-empty.
 */
function getCredentialString(
  credentials: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = credentials?.[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

/**
 * Creates an AuthProbeResult with the given parameters.
 */
function probeResult(
  detectedAuthType: DetectedAuthType,
  confidence: 'high' | 'medium' | 'low',
  reason: string,
  options?: { supportsOAuth?: boolean; authorizationEndpoint?: string },
): AuthProbeResult {
  return {
    detectedAuthType,
    confidence,
    reason,
    ...options,
  };
}

/**
 * Checks if a response indicates an HTML page (not an MCP server).
 */
async function isHtmlResponse(response: Response): Promise<boolean> {
  const text = await response.text().catch(() => '');
  return text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<HTML');
}

/**
 * Auth-related error indicators for classification.
 */
const AUTH_ERROR_INDICATORS = [
  'unauthorized',
  '401',
  'forbidden',
  '403',
  'authentication',
  'auth required',
  'access denied',
  'invalid credentials',
  'invalid token',
  'token expired',
  'bearer',
];

/**
 * Checks if an error message indicates an authentication problem.
 */
export function isAuthenticationError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_INDICATORS.some((indicator) => lower.includes(indicator));
}

/**
 * Classifies an error and returns a user-friendly message.
 */
export function classifyConnectionError(
  error: Error,
  authType: McpAuthType,
  hasCredentials: boolean,
): { message: string; isAuthError: boolean } {
  const msg = error.message.toLowerCase();
  const original = error.message;
  const isAuthError = isAuthenticationError(msg);
  const needsAuth = authType !== McpAuthType.NONE;

  if (msg.includes('timeout')) {
    return {
      message:
        'Connection timeout - the server did not respond. Please check the URL and ensure the server is running.',
      isAuthError: false,
    };
  }

  if (msg.includes('econnrefused') || msg.includes('connection refused')) {
    return {
      message: 'Connection refused - the server is not reachable at this URL.',
      isAuthError: false,
    };
  }

  if (msg.includes('enotfound') || msg.includes('dns')) {
    return {
      message: 'DNS resolution failed - the hostname could not be resolved.',
      isAuthError: false,
    };
  }

  if (msg.includes('econnreset')) {
    return { message: 'Connection reset - the server closed the connection.', isAuthError: false };
  }

  if (msg.includes('not found') || msg.includes('404')) {
    return {
      message: 'Server not found - the endpoint does not exist at this URL.',
      isAuthError: false,
    };
  }

  if (
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('forbidden') ||
    msg.includes('403')
  ) {
    if (!needsAuth) {
      return {
        message:
          'Authentication required - the server requires authentication. Please select API Key or OAuth as the auth type.',
        isAuthError: true,
      };
    }
    if (!hasCredentials) {
      return {
        message: 'Authentication required - please provide valid credentials for this server.',
        isAuthError: true,
      };
    }
    return {
      message: msg.includes('forbidden')
        ? 'Access forbidden - the credentials are valid but lack permission for this operation.'
        : 'Authentication failed - the provided credentials are invalid or expired.',
      isAuthError: true,
    };
  }

  if (msg.includes('invalid') || msg.includes('malformed')) {
    if (isAuthError) {
      if (!needsAuth) {
        return {
          message:
            'Authentication required - the server returned an auth-related error. Try selecting API Key or OAuth as the auth type.',
          isAuthError: true,
        };
      }
      return {
        message: hasCredentials
          ? 'Authentication failed - the provided credentials may be incorrect.'
          : 'Authentication required - please provide valid credentials for this server.',
        isAuthError: true,
      };
    }
    return {
      message:
        'Invalid MCP response - the server did not respond with a valid MCP protocol message. Ensure this is a valid MCP server URL.',
      isAuthError: false,
    };
  }

  if (isAuthError) {
    if (!needsAuth) {
      return {
        message: `Authentication required - ${original}. Please select the correct auth type.`,
        isAuthError: true,
      };
    }
    return {
      message: hasCredentials
        ? `Authentication error - ${original}. Please check your credentials.`
        : `Authentication required - ${original}. Please provide credentials.`,
      isAuthError: true,
    };
  }

  return { message: `Connection failed: ${original}`, isAuthError: false };
}

export const SENTINEL_SELF_MCP_SERVER_ERROR =
  'This MCP server URL points to the SENTINEL MCP proxy. Sentinel cannot add itself as an upstream MCP server.';

/**
 * Known valid MCP endpoint path segments.
 * This is a generous allowlist to catch obvious typos while permitting valid configurations.
 * See docs/mcp-probe-limitations.md for details on the imperfections of this approach.
 *
 * Sources:
 * - MCP Spec: /mcp is the standard streamable HTTP endpoint
 * - Legacy SSE transport: /sse (GET), /messages (POST)
 * - Common variations and prefixes are allowed
 */
const KNOWN_MCP_PATH_SEGMENTS = [
  // Standard MCP endpoints (from spec)
  'mcp',
  'sse',
  'messages',
  'message',
  'msg',
  // Common API patterns
  'api',
  'v1',
  'v2',
  'v3',
  // Common server naming patterns
  'rpc',
  'jsonrpc',
  'json-rpc',
  'stream',
  'events',
  'webhook',
  'webhooks',
  // Root path is always valid
  '',
];

/**
 * Validates that a URL path looks like a plausible MCP endpoint.
 * This catches obvious typos like /mcpFUCKYOU while allowing valid paths.
 *
 * @param pathname - The URL pathname to validate
 * @returns true if the path looks valid, false otherwise
 */
function isPlausibleMcpPath(pathname: string): boolean {
  // Normalize: remove leading/trailing slashes, lowercase
  const normalized = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

  // Empty path (root) is always valid
  if (normalized === '') {
    return true;
  }

  // Split into segments
  const segments = normalized.split('/');

  // Check if the last segment (the actual endpoint) matches known patterns
  const lastSegment = segments[segments.length - 1];

  // Exact match with known segments
  if (KNOWN_MCP_PATH_SEGMENTS.includes(lastSegment)) {
    return true;
  }

  // Allow paths where any segment is a known MCP endpoint
  // e.g., /api/v1/mcp, /company/mcp, /mcp/v2
  for (const segment of segments) {
    if (KNOWN_MCP_PATH_SEGMENTS.includes(segment)) {
      return true;
    }
  }

  return false;
}

function extractHeaderOverrides(credentials?: Record<string, unknown>): Record<string, string> {
  if (!credentials || !isPlainObject(credentials.headers)) {
    return {};
  }

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials.headers)) {
    if (value === undefined) continue;
    overrides[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return overrides;
}

function buildCredentialHeaders(
  authType: McpAuthType,
  credentials?: Record<string, unknown>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': HEADER_CONTENT_TYPE,
    Accept: HEADER_ACCEPT,
  };

  // Set Authorization header based on auth type
  const apiKey = getCredentialString(credentials, 'apiKey');
  const accessToken = getCredentialString(credentials, 'accessToken');

  if (authType === McpAuthType.API_KEY && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (authType === McpAuthType.OAUTH && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Apply header overrides, but protect Authorization if API key is set
  const overrides = extractHeaderOverrides(credentials);
  const hasApiKey = authType === McpAuthType.API_KEY && apiKey;

  for (const [key, value] of Object.entries(overrides)) {
    if (hasApiKey && key.toLowerCase() === 'authorization') {
      continue;
    }
    headers[key] = value;
  }

  return headers;
}

function normalizePort(url: URL): string {
  if (url.port) {
    return url.port;
  }
  return url.protocol === 'https:' ? '443' : '80';
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

function buildMcpUrlKey(url: URL): string {
  return `${url.hostname.toLowerCase()}:${normalizePort(url)}|${normalizePath(url.pathname)}`;
}

function resolveMcpPort(): string {
  const parsed = Number.parseInt(process.env.MCP_PORT || '3001', 10);
  return Number.isFinite(parsed) ? String(parsed) : '3001';
}

function buildSelfMcpUrlKeys(): Set<string> {
  const keys = new Set<string>();
  const mcpPort = resolveMcpPort();
  const envOverrides = [
    process.env.MCP_PUBLIC_URL,
    process.env.SENTINEL_MCP_URL,
    process.env.MCP_URL,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  const addKey = (value: string) => {
    try {
      keys.add(buildMcpUrlKey(new URL(value)));
    } catch {
      // Ignore invalid override values
    }
  };

  envOverrides.forEach(addKey);

  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  try {
    const api = new URL(apiUrl);
    const hosts = LOCAL_MCP_HOSTS.includes(api.hostname) ? LOCAL_MCP_HOSTS : [api.hostname];
    for (const host of hosts) {
      addKey(`http://${host}:${mcpPort}/mcp`);
    }
  } catch {
    for (const host of LOCAL_MCP_HOSTS) {
      addKey(`http://${host}:${mcpPort}/mcp`);
    }
  }

  return keys;
}

export function isSentinelMcpServerUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const key = buildMcpUrlKey(parsed);
  return buildSelfMcpUrlKeys().has(key);
}

/**
 * Parses the WWW-Authenticate header to extract OAuth resource metadata URL.
 * Per RFC 9728, OAuth servers should include resource="..." in the header.
 */
function parseWwwAuthenticateForResource(header: string): string | null {
  // Look for resource="..." in the header
  const resourceMatch = header.match(/resource="([^"]+)"/i);
  if (resourceMatch) {
    return resourceMatch[1];
  }
  // Also check without quotes (some servers might not quote it)
  const unquotedMatch = header.match(/resource=([^\s,]+)/i);
  if (unquotedMatch) {
    return unquotedMatch[1];
  }
  return null;
}

/**
 * Checks if a URL endpoint exists by making a HEAD or GET request.
 * Returns the response if successful (2xx or 3xx), null otherwise.
 */
async function checkEndpointExists(url: string): Promise<{ exists: boolean; response?: Response }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json, text/html, */*' },
      signal: AbortSignal.timeout(5000),
      redirect: 'manual', // Don't follow redirects, just detect them
    });
    // 2xx, 3xx, or even 401/403 means the endpoint exists
    if (res.status < 500) {
      return { exists: true, response: res };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Probes an MCP server URL to detect what authentication type it requires.
 * Uses comprehensive detection based on MCP specification (RFC 9728).
 *
 * Detection strategy (process of elimination - 100% confident):
 * 1. FIRST verify the endpoint itself responds (POST to actual URL)
 *    - No response? → FAIL (endpoint unreachable)
 *    - HTML response? → FAIL (not an MCP server)
 *    - 401/403/400/200 with JSON? → Continue (endpoint exists)
 * 2. Try unauthenticated MCP connection - if works, NONE
 * 3. Check .well-known/oauth-authorization-server (at BASE URL) - if exists, OAUTH
 * 4. Check WWW-Authenticate header for resource= (RFC 9728) - if present, OAUTH
 * 5. Check .well-known/oauth-protected-resource (at BASE URL) - if exists, OAUTH
 * 6. Probe fallback OAuth URL /authorize (at BASE URL) - if exists, OAUTH
 * 7. Endpoint talks back but no OAuth indicators - API_KEY (by elimination)
 *
 * @param url - The MCP server URL to probe
 * @returns AuthProbeResult with detected auth type and confidence level
 */
export async function probeAuthType(url: string): Promise<AuthProbeResult> {
  let serverUrl: URL;
  try {
    serverUrl = new URL(url);
  } catch {
    return probeResult('unknown', 'low', 'Invalid URL format');
  }

  // Step 0: Validate the path looks like a plausible MCP endpoint
  if (!isPlausibleMcpPath(serverUrl.pathname)) {
    return probeResult(
      'unknown',
      'medium',
      `Path "${serverUrl.pathname}" does not look like a standard MCP endpoint. Common paths are /mcp, /sse, /messages, or /api/mcp. Check for typos.`,
    );
  }

  const baseUrl = `${serverUrl.protocol}//${serverUrl.host}`;

  // Step 1: Verify the endpoint responds
  let endpointResponds = false;
  let wwwAuthHeader: string | null = null;

  try {
    const probeRes = await fetch(serverUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': HEADER_CONTENT_TYPE, Accept: HEADER_ACCEPT },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'probe', version: '0.1.0' },
        },
        id: 1,
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    const contentType = probeRes.headers.get('content-type') || '';
    const isJson =
      contentType.includes('application/json') || contentType.includes('text/event-stream');
    const status = probeRes.status;

    if (status === 404 || status === 405) {
      return probeResult(
        'unknown',
        'high',
        `Endpoint returned ${status} - the path does not exist. Verify the URL is correct (many MCP servers use /mcp)`,
      );
    }

    if (status === 401 || status === 403) {
      endpointResponds = true;
      wwwAuthHeader = probeRes.headers.get('www-authenticate');
    } else if ((status === 400 || probeRes.ok) && isJson) {
      endpointResponds = true;
    } else if (!isJson) {
      if (await isHtmlResponse(probeRes)) {
        return probeResult(
          'unknown',
          'high',
          'Server returned HTML instead of JSON - this does not appear to be an MCP server endpoint',
        );
      }
    } else if (status >= 500) {
      return probeResult(
        'unknown',
        'medium',
        `Server returned ${status} error - the server may be misconfigured or unavailable`,
      );
    } else {
      return probeResult(
        'unknown',
        'medium',
        `Unexpected response status ${status} - verify this is a valid MCP server endpoint`,
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';
    const isConnectionError =
      errorMsg.includes('timeout') ||
      errorMsg.includes('econnrefused') ||
      errorMsg.includes('enotfound') ||
      errorMsg.includes('connection refused');

    if (isConnectionError) {
      return probeResult(
        'unknown',
        'high',
        'Endpoint did not respond - verify the URL is correct and includes the full path (e.g., /mcp)',
      );
    }
  }

  if (!endpointResponds) {
    return probeResult(
      'unknown',
      'high',
      'Endpoint did not respond as expected - verify this is a valid MCP server URL with the correct path',
    );
  }

  // Step 2: Try unauthenticated MCP connection (with timeout)
  const client = createMcpClient('sentinel-auth-probe');

  try {
    const transport = new StreamableHTTPClientTransport(serverUrl, {
      requestInit: { headers: { 'Content-Type': HEADER_CONTENT_TYPE, Accept: HEADER_ACCEPT } },
    });

    // Wrap connection in timeout to prevent hanging on streaming endpoints
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('MCP connection timeout')), DEFAULT_TIMEOUT_MS),
      ),
    ]);

    try {
      // Also wrap listTools in timeout
      await Promise.race([
        client.listTools(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MCP listTools timeout')), DEFAULT_TIMEOUT_MS),
        ),
      ]);
      await client.close();
      return probeResult('none', 'high', 'Server allows unauthenticated access');
    } catch {
      await client.close();
    }
  } catch {
    await safeCloseClient(client);
  }

  // Step 3: Check for OAuth Authorization Server Metadata (RFC 8414)
  const authServerJson = await fetchJson(`${baseUrl}/.well-known/oauth-authorization-server`);
  if (authServerJson) {
    const parseResult = oauthAuthServerMetadataSchema.safeParse(authServerJson);
    if (parseResult.success) {
      const { authorization_endpoint, issuer } = parseResult.data;
      if (authorization_endpoint || issuer) {
        return probeResult(
          'oauth',
          'high',
          'Server exposes OAuth metadata at .well-known/oauth-authorization-server',
          { supportsOAuth: true, authorizationEndpoint: authorization_endpoint },
        );
      }
    }
  }

  // Step 4: Check WWW-Authenticate header for resource= (RFC 9728)
  if (wwwAuthHeader && parseWwwAuthenticateForResource(wwwAuthHeader)) {
    return probeResult(
      'oauth',
      'high',
      'Server returned WWW-Authenticate with resource parameter (RFC 9728)',
      { supportsOAuth: true },
    );
  }

  // Step 5: Check for OAuth Protected Resource Metadata (RFC 9728)
  const resourceJson = await fetchJson(`${baseUrl}/.well-known/oauth-protected-resource`);
  if (resourceJson) {
    const parseResult = oauthProtectedResourceMetadataSchema.safeParse(resourceJson);
    if (parseResult.success) {
      const authServers = parseResult.data.authorization_servers;
      if (authServers && authServers.length > 0) {
        let authEndpoint: string | undefined;
        const authMetaJson = await fetchJson(
          `${authServers[0]}/.well-known/oauth-authorization-server`,
        );
        if (authMetaJson) {
          const authResult = authServerMetadataSchema.safeParse(authMetaJson);
          if (authResult.success) {
            authEndpoint = authResult.data.authorization_endpoint;
          }
        }
        return probeResult(
          'oauth',
          'high',
          'Server exposes OAuth protected resource metadata at .well-known/oauth-protected-resource',
          { supportsOAuth: true, authorizationEndpoint: authEndpoint },
        );
      }
    }
  }

  // Step 6: Check for OAuth fallback endpoint (/authorize)
  const authorizeCheck = await checkEndpointExists(`${baseUrl}/authorize`);
  if (authorizeCheck.exists && authorizeCheck.response) {
    const status = authorizeCheck.response.status;
    if (status !== 404 && status !== 405) {
      return probeResult(
        'oauth',
        'high',
        'Server exposes OAuth /authorize endpoint (fallback discovery)',
        { supportsOAuth: true, authorizationEndpoint: `${baseUrl}/authorize` },
      );
    }
  }

  // Step 7: By elimination - no OAuth indicators means API_KEY
  return probeResult(
    'api_key',
    'high',
    'Server requires authentication but no OAuth indicators found - using API key by elimination',
  );
}

// ============================================================================
// Transport Configuration
// ============================================================================

/**
 * Input type for transport configuration when creating/updating MCP servers.
 */
export interface TransportConfigInput {
  transportType?: TransportType;
  stdioCommand?: string;
  stdioArgs?: string[];
  stdioWorkingDir?: string;
  stdioEnv?: Record<string, string>;
  wsReconnectMs?: number;
  wsMaxRetries?: number;
  wsHeartbeatMs?: number;
}

/**
 * Prepared transport data ready for database storage.
 * Environment variables are encrypted for STDIO transport.
 */
export interface PreparedTransportData {
  transportType: TransportType;
  stdioCommand: string | null;
  stdioArgs: unknown;
  stdioWorkingDir: string | null;
  stdioEnv: string | null;
  wsReconnectMs: number | null;
  wsMaxRetries: number | null;
  wsHeartbeatMs: number | null;
}

/**
 * Shell metacharacters that are disallowed in STDIO commands for security.
 * These could be used for command injection attacks.
 */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#*?\\'"]/;

/**
 * Path traversal patterns including encoded variations
 */
const PATH_TRAVERSAL_PATTERNS = [
  '..', // Direct traversal
  '%2e%2e', // URL encoded
  '%252e%252e', // Double URL encoded
  '..%c0%af', // Unicode encoding
  '..%c1%9c', // Unicode encoding
];

/**
 * Validates STDIO transport configuration.
 * Ensures command is provided and args are valid strings.
 * Security: prevents shell metacharacters in command to avoid injection.
 *
 * @throws Error if validation fails
 */
export function validateStdioConfig(config: {
  command?: string;
  args?: string[];
  workingDir?: string;
}): void {
  if (!config.command || config.command.trim().length === 0) {
    throw new Error('STDIO transport requires a command');
  }

  // Security: Check for shell metacharacters in command
  if (SHELL_METACHARACTERS.test(config.command)) {
    throw new Error(
      'STDIO command contains disallowed shell metacharacters. Use args array for arguments.',
    );
  }

  // Validate args are all strings and don't contain shell metacharacters
  if (config.args) {
    for (let i = 0; i < config.args.length; i++) {
      const arg = config.args[i];
      if (typeof arg !== 'string') {
        throw new Error(`STDIO args[${i}] must be a string`);
      }
      // Defense in depth: also check args for shell metacharacters
      // Note: Node.js spawn() doesn't invoke a shell, but the spawned process might
      if (SHELL_METACHARACTERS.test(arg)) {
        throw new Error(`STDIO args[${i}] contains disallowed shell metacharacters`);
      }
    }
  }

  // Validate workingDir doesn't contain path traversal (including encoded variants)
  if (config.workingDir) {
    const normalized = config.workingDir.replace(/\\/g, '/').toLowerCase();
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (normalized.includes(pattern.toLowerCase())) {
        throw new Error('STDIO workingDir cannot contain path traversal patterns');
      }
    }
    // Ensure it's an absolute path or relative from project root
    if (!config.workingDir.startsWith('/') && !config.workingDir.match(/^[a-zA-Z]:/)) {
      // Relative path - ensure it doesn't start with dots
      if (config.workingDir.startsWith('.')) {
        throw new Error('STDIO workingDir must be an absolute path or not start with dots');
      }
    }
  }
}

/**
 * Validates WebSocket transport configuration.
 * Ensures timing parameters are within reasonable bounds.
 *
 * @throws Error if validation fails
 */
export function validateWebSocketConfig(config: {
  reconnectMs?: number;
  maxRetries?: number;
  heartbeatMs?: number;
}): void {
  if (config.reconnectMs !== undefined) {
    if (config.reconnectMs < 100 || config.reconnectMs > 60000) {
      throw new Error('WebSocket reconnectMs must be between 100 and 60000 milliseconds');
    }
  }

  if (config.maxRetries !== undefined) {
    if (config.maxRetries < 0 || config.maxRetries > 100) {
      throw new Error('WebSocket maxRetries must be between 0 and 100');
    }
  }

  if (config.heartbeatMs !== undefined) {
    if (config.heartbeatMs < 1000 || config.heartbeatMs > 300000) {
      throw new Error('WebSocket heartbeatMs must be between 1000 and 300000 milliseconds');
    }
  }
}

/**
 * Validates transport configuration based on transport type.
 * For STDIO: validates command exists and is safe
 * For WebSocket: validates timing parameters
 * For HTTP/SSE: no additional validation needed
 *
 * @returns Validation result with success flag and optional error
 */
export function validateTransportConfig(
  transportType: TransportType,
  config: TransportConfigInput,
): { success: boolean; error?: string } {
  switch (transportType) {
    case TransportType.STDIO:
      try {
        validateStdioConfig({
          command: config.stdioCommand,
          args: config.stdioArgs,
          workingDir: config.stdioWorkingDir,
        });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Invalid STDIO configuration',
        };
      }

    case TransportType.WEBSOCKET:
      try {
        validateWebSocketConfig({
          reconnectMs: config.wsReconnectMs,
          maxRetries: config.wsMaxRetries,
          heartbeatMs: config.wsHeartbeatMs,
        });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Invalid WebSocket configuration',
        };
      }

    case TransportType.HTTP:
    case TransportType.SSE:
      // No additional validation needed for HTTP/SSE
      return { success: true };

    default:
      return { success: false, error: `Unknown transport type: ${transportType}` };
  }
}

/**
 * Prepares transport configuration for database storage.
 * Encrypts sensitive data (stdioEnv) and normalizes fields.
 *
 * @param config - Transport configuration input
 * @returns Data ready for Prisma create/update
 */
export function prepareTransportData(config: TransportConfigInput): PreparedTransportData {
  const transportType = config.transportType ?? TransportType.HTTP;

  return {
    transportType,
    stdioCommand: transportType === TransportType.STDIO ? (config.stdioCommand ?? null) : null,
    stdioArgs: transportType === TransportType.STDIO && config.stdioArgs ? config.stdioArgs : null,
    stdioWorkingDir:
      transportType === TransportType.STDIO ? (config.stdioWorkingDir ?? null) : null,
    stdioEnv:
      transportType === TransportType.STDIO &&
      config.stdioEnv &&
      Object.keys(config.stdioEnv).length > 0
        ? encryptObject(config.stdioEnv)
        : null,
    wsReconnectMs:
      transportType === TransportType.WEBSOCKET ? (config.wsReconnectMs ?? 5000) : null,
    wsMaxRetries: transportType === TransportType.WEBSOCKET ? (config.wsMaxRetries ?? 3) : null,
    wsHeartbeatMs:
      transportType === TransportType.WEBSOCKET ? (config.wsHeartbeatMs ?? 30000) : null,
  };
}

/**
 * Validates that an MCP server connection is valid based on transport type.
 * - HTTP/SSE: Test via HTTP request (existing logic)
 * - WebSocket: Test via WebSocket connection
 * - STDIO: Validate command exists (don't spawn in validation)
 */
export async function validateMcpServerConnection(
  url: string,
  authType: McpAuthType,
  transportType: TransportType,
  config: TransportConfigInput,
  credentials?: Record<string, unknown>,
  timeoutMs: number = 10000,
): Promise<{ success: boolean; error?: string; isAuthError?: boolean }> {
  // First validate transport-specific config
  const configValidation = validateTransportConfig(transportType, config);
  if (!configValidation.success) {
    return { success: false, error: configValidation.error };
  }

  switch (transportType) {
    case TransportType.STDIO:
      // For STDIO, we only validate the config, don't spawn the process
      // The command existence is validated by the config validation
      return { success: true };

    case TransportType.WEBSOCKET:
      // For WebSocket, attempt a connection test
      return validateWebSocketConnection(url, authType, credentials, timeoutMs);

    case TransportType.HTTP:
    case TransportType.SSE:
    default:
      // Use existing HTTP validation
      return validateMcpServerUrl(url, authType, credentials, timeoutMs);
  }
}

/**
 * Validates a WebSocket connection to an MCP server.
 * Attempts to establish a WebSocket connection and verify handshake.
 */
async function validateWebSocketConnection(
  url: string,
  authType: McpAuthType,
  credentials?: Record<string, unknown>,
  timeoutMs: number = 10000,
): Promise<{ success: boolean; error?: string; isAuthError?: boolean }> {
  let wsUrl: URL;
  try {
    wsUrl = new URL(url);
    // Convert http(s) to ws(s) if needed
    if (wsUrl.protocol === 'http:') {
      wsUrl.protocol = 'ws:';
    } else if (wsUrl.protocol === 'https:') {
      wsUrl.protocol = 'wss:';
    }
  } catch {
    return { success: false, error: 'Invalid WebSocket URL format' };
  }

  if (isSentinelMcpServerUrl(url)) {
    return { success: false, error: SENTINEL_SELF_MCP_SERVER_ERROR };
  }

  const hasCredentials = credentials !== undefined;

  // Build headers for WebSocket connection
  const headers = buildCredentialHeaders(authType, credentials);

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: 'WebSocket connection timeout - server did not respond',
      });
    }, timeoutMs);

    // Note: In Node.js, we need to use a WebSocket library that supports headers
    // For now, we do a basic HTTP upgrade check
    const httpUrl = new URL(url);
    fetch(httpUrl.toString(), {
      method: 'GET',
      headers: {
        ...headers,
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
          'base64',
        ),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
      .then((response) => {
        clearTimeout(timeoutId);
        // A 101 Switching Protocols indicates successful WebSocket upgrade
        // A 401/403 indicates auth issues
        // Other codes may indicate the endpoint doesn't support WebSocket
        if (response.status === 101) {
          resolve({ success: true });
        } else if (response.status === 401 || response.status === 403) {
          resolve({
            success: false,
            error: 'WebSocket authentication failed',
            isAuthError: true,
          });
        } else if (response.status === 426) {
          // 426 Upgrade Required - endpoint exists but we need to actually connect
          // This is a valid response, the endpoint supports upgrades
          resolve({ success: true });
        } else {
          // For other responses, the endpoint might still work
          // We'll consider it successful if we got a response
          if (response.status >= 200 && response.status < 500) {
            resolve({ success: true });
          } else {
            resolve({
              success: false,
              error: `WebSocket endpoint returned status ${response.status}`,
            });
          }
        }
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';
        if (errorMsg.includes('timeout')) {
          resolve({
            success: false,
            error: 'WebSocket connection timeout',
          });
        } else if (errorMsg.includes('econnrefused') || errorMsg.includes('connection refused')) {
          resolve({
            success: false,
            error: 'WebSocket connection refused - server not reachable',
          });
        } else if (hasCredentials && isAuthenticationError(errorMsg)) {
          resolve({
            success: false,
            error: 'WebSocket authentication failed',
            isAuthError: true,
          });
        } else {
          resolve({
            success: false,
            error: `WebSocket connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      });
  });
}

/**
 * Validates that an MCP server URL is valid and working.
 * Attempts to connect and list tools to verify it's a functional MCP server.
 */
export async function validateMcpServerUrl(
  url: string,
  authType: McpAuthType,
  credentials?: Record<string, unknown>,
  timeoutMs: number = 10000,
): Promise<{ success: boolean; error?: string; isAuthError?: boolean }> {
  let serverUrl: URL;
  try {
    serverUrl = new URL(url);
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }

  if (isSentinelMcpServerUrl(url)) {
    return { success: false, error: SENTINEL_SELF_MCP_SERVER_ERROR };
  }

  const client = createMcpClient('sentinel-server-validation');
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const hasCredentials = credentials !== undefined;
  const needsAuthWithoutCreds =
    (authType === McpAuthType.API_KEY || authType === McpAuthType.OAUTH) && !hasCredentials;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout - server did not respond within 10 seconds'));
      }, timeoutMs);
    });

    const headers = buildCredentialHeaders(authType, credentials);
    const transport = new StreamableHTTPClientTransport(serverUrl, { requestInit: { headers } });

    const connectPromise = (async () => {
      await client.connect(transport);
      await new Promise((resolve) => setTimeout(resolve, MCP_STARTUP_DELAY_MS));

      try {
        await client.listTools();
      } catch (listError) {
        if (needsAuthWithoutCreds && listError instanceof Error) {
          if (isAuthenticationError(listError.message)) {
            await client.close();
            return;
          }
        }
        throw listError;
      }
      await client.close();
    })();

    await Promise.race([connectPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);

    return { success: true };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    await safeCloseClient(client);

    if (!(error instanceof Error)) {
      return { success: false, error: 'Unknown error', isAuthError: false };
    }

    // For auth types without credentials, auth errors mean the server is valid but needs auth
    if (needsAuthWithoutCreds && isAuthenticationError(error.message)) {
      return { success: true };
    }

    const classified = classifyConnectionError(error, authType, hasCredentials);
    return { success: false, error: classified.message, isAuthError: classified.isAuthError };
  }
}

export interface DiscoverToolsResult {
  success: boolean;
  toolsDiscovered: number;
  error?: string;
}

function discoverToolsError(error: string): DiscoverToolsResult {
  return { success: false, toolsDiscovered: 0, error };
}

/**
 * Discovers tools from an MCP server.
 * For OAuth servers, requires a userId to retrieve the user's OAuth tokens.
 */
export async function discoverTools(
  organizationId: string,
  mcpServerId: string,
  userId?: string,
  workspaceId?: string,
): Promise<DiscoverToolsResult> {
  const client = createMcpClient('sentinel-tool-discovery');

  try {
    const mcpServer = await prisma.mcpServer.findFirst({
      where: { id: mcpServerId, organizationId, deletedAt: null },
    });

    if (!mcpServer) {
      return discoverToolsError('MCP server not found');
    }

    if (mcpServer.authType === McpAuthType.OAUTH && !userId) {
      return discoverToolsError(
        'User authentication required to discover tools from OAuth server.',
      );
    }

    // Get credentials
    let credentials: Record<string, unknown> | null = null;
    if (userId) {
      credentials = await getCredentialsForMcpServer(
        organizationId,
        userId,
        mcpServerId,
        workspaceId,
      );
    } else {
      let decrypted: Record<string, unknown> = {};
      if (typeof mcpServer.credentials === 'string') {
        decrypted = decryptCredentials(mcpServer.credentials);
      }
      if (mcpServer.apiKey) {
        decrypted.apiKey = decryptString(mcpServer.apiKey);
      }
      credentials = Object.keys(decrypted).length > 0 ? decrypted : null;
    }

    // Validate required credentials
    if (
      mcpServer.authType === McpAuthType.API_KEY &&
      !getCredentialString(credentials ?? undefined, 'apiKey')
    ) {
      return discoverToolsError('API key required to discover tools.');
    }
    if (
      mcpServer.authType === McpAuthType.OAUTH &&
      !getCredentialString(credentials ?? undefined, 'accessToken')
    ) {
      return discoverToolsError(
        'OAuth authentication required. Please connect to the MCP server first.',
      );
    }

    const headers = buildCredentialHeaders(mcpServer.authType, credentials ?? undefined);
    const transport = new StreamableHTTPClientTransport(new URL(mcpServer.url), {
      requestInit: { headers },
    });

    await client.connect(transport);
    await new Promise((resolve) => setTimeout(resolve, MCP_STARTUP_DELAY_MS));

    const { tools } = await client.listTools();

    // Track upserted tools for classification
    const upsertedTools: Array<{
      id: string;
      name: string;
      description?: string | null;
      inputSchema?: unknown;
    }> = [];

    for (const tool of tools) {
      // Store input schema if provided by the MCP server
      const inputSchema = tool.inputSchema ? toJsonValue(tool.inputSchema) : undefined;

      const upsertedTool = await prisma.mcpTool.upsert({
        where: { mcpServerId_name: { mcpServerId: mcpServer.id, name: tool.name } },
        create: {
          mcpServerId: mcpServer.id,
          name: tool.name,
          description: tool.description || null,
          inputSchema,
        },
        update: {
          description: tool.description || null,
          inputSchema,
          discoveredAt: new Date(),
        },
      });

      upsertedTools.push({
        id: upsertedTool.id,
        name: upsertedTool.name,
        description: upsertedTool.description,
        inputSchema: upsertedTool.inputSchema,
      });
    }

    await client.close();
    logger.success(`Discovered ${tools.length} tools from ${mcpServer.name}`);

    // Start background classification (fire and forget - doesn't block discovery)
    startBackgroundClassification(mcpServer.id, upsertedTools);

    return { success: true, toolsDiscovered: tools.length };
  } catch (error) {
    logger.error('Error discovering tools:', error);
    await safeCloseClient(client);
    return discoverToolsError(error instanceof Error ? error.message : 'Unknown error');
  }
}

export async function findMcpServerByToolName(
  organizationId: string,
  toolName: string,
): Promise<Pick<McpServer, 'id' | 'name' | 'url' | 'trusted'> | null> {
  const parts = toolName.split('::');
  if (parts.length !== 2) {
    return null;
  }

  const [domainPart] = parts;
  if (!domainPart || domainPart === '*') {
    return null;
  }

  const server = await prisma.mcpServer.findFirst({
    where: {
      organizationId,
      deletedAt: null,
      url: {
        contains: domainPart,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      url: true,
      trusted: true,
    },
  });

  return server ?? null;
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function getUserMcpConfigKey(userId: string, mcpServerId: string) {
  return { userId_mcpServerId: { userId, mcpServerId } };
}

/**
 * Attempts to get a valid OAuth token for a user, refreshing if necessary.
 */
async function getOAuthTokenForUser(
  organizationId: string,
  userId: string,
  mcpServerId: string,
  userConfig: { accessToken: string; tokenExpiresAt: Date | null },
): Promise<string | null> {
  const now = new Date();
  const expiresAt = userConfig.tokenExpiresAt;
  const needsRefresh = expiresAt && expiresAt.getTime() < now.getTime() + TOKEN_REFRESH_BUFFER_MS;

  logger.info('getOAuthTokenForUser called', {
    userId,
    mcpServerId,
    hasExpiresAt: !!expiresAt,
    expiresAt: expiresAt?.toISOString(),
    now: now.toISOString(),
    needsRefresh,
  });

  if (!needsRefresh) {
    return decryptString(userConfig.accessToken);
  }

  logger.info(
    `Token expiring soon for user ${userId} on server ${mcpServerId}, attempting refresh`,
  );

  try {
    await refreshAccessToken(organizationId, userId, mcpServerId);
    const updated = await prisma.userMcpConfig.findUnique({
      where: getUserMcpConfigKey(userId, mcpServerId),
    });
    if (updated?.accessToken) {
      return decryptString(updated.accessToken);
    }
    return decryptString(userConfig.accessToken);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (expiresAt && expiresAt > now) {
      logger.warn(`Token refresh failed but token still valid, using existing token`, {
        error: errorMsg,
      });
      return decryptString(userConfig.accessToken);
    }
    logger.error(`Token refresh failed and token expired`, { error: errorMsg });
    return null;
  }
}

/**
 * Retrieves credentials for making requests to an MCP server.
 * Handles both API key and OAuth authentication methods.
 * For OAuth, proactively refreshes tokens if they expire within 5 minutes.
 *
 * Token precedence for OAuth:
 * 1. Personal token (userMcpConfig)
 * 2. Workspace token (workspaceMcpOAuthToken) - if workspaceId provided
 * 3. Org token (orgMcpOAuthToken)
 */
export async function getCredentialsForMcpServer(
  organizationId: string,
  userId: string,
  mcpServerId: string,
  workspaceId?: string,
): Promise<Record<string, unknown> | null> {
  const mcpServer = await prisma.mcpServer.findFirst({
    where: { id: mcpServerId, organizationId, deletedAt: null },
    include: { oauthClientRegistration: true },
  });

  if (!mcpServer) {
    return null;
  }

  if (mcpServer.authType === McpAuthType.NONE) {
    return {};
  }

  if (mcpServer.authType === McpAuthType.API_KEY) {
    let credentials: Record<string, unknown> = {};
    if (typeof mcpServer.credentials === 'string') {
      credentials = decryptCredentials(mcpServer.credentials);
    }
    if (mcpServer.apiKey) {
      credentials.apiKey = decryptString(mcpServer.apiKey);
    }
    const userConfig = await prisma.userMcpConfig.findUnique({
      where: getUserMcpConfigKey(userId, mcpServerId),
    });
    if (userConfig?.apiKey) {
      credentials.apiKey = decryptString(userConfig.apiKey);
    }
    return credentials;
  }

  if (mcpServer.authType === McpAuthType.OAUTH) {
    logger.info('Looking up OAuth credentials', { userId, mcpServerId, workspaceId });

    // 1. Check personal token first
    const userConfig = await prisma.userMcpConfig.findUnique({
      where: getUserMcpConfigKey(userId, mcpServerId),
    });

    logger.info('Personal token lookup result', {
      userId,
      mcpServerId,
      found: !!userConfig,
      hasAccessToken: !!userConfig?.accessToken,
    });

    if (userConfig?.accessToken) {
      const token = await getOAuthTokenForUser(organizationId, userId, mcpServerId, {
        accessToken: userConfig.accessToken,
        tokenExpiresAt: userConfig.tokenExpiresAt,
      });
      if (token) {
        logger.info('Using personal OAuth token', { userId, mcpServerId });
        return { accessToken: token };
      }
      logger.warn('Personal token found but getOAuthTokenForUser returned null', {
        userId,
        mcpServerId,
      });
    }

    // 2. Check workspace-level token if workspaceId provided OR server is workspace-scoped
    // This allows admin agents (which may not have workspaceId in context) to use
    // workspace-level OAuth tokens when the MCP server is scoped to a workspace
    const effectiveWorkspaceId = workspaceId || mcpServer.workspaceId;
    if (effectiveWorkspaceId) {
      const workspaceToken = await prisma.workspaceMcpOAuthToken.findUnique({
        where: {
          workspaceId_mcpServerId: {
            workspaceId: effectiveWorkspaceId,
            mcpServerId,
          },
        },
      });

      logger.info('Workspace token lookup result', {
        workspaceId,
        mcpServerId,
        found: !!workspaceToken,
        hasAccessToken: !!workspaceToken?.accessToken,
      });

      if (workspaceToken?.accessToken) {
        // Check if token needs refresh
        if (tokenNeedsRefresh(workspaceToken.tokenExpiresAt, !!workspaceToken.refreshToken)) {
          logger.info('Workspace OAuth token needs refresh', {
            workspaceId: effectiveWorkspaceId,
            mcpServerId,
          });
          try {
            await refreshWorkspaceAccessToken(effectiveWorkspaceId, mcpServerId);
            // Re-fetch the refreshed token
            const refreshedToken = await prisma.workspaceMcpOAuthToken.findUnique({
              where: {
                workspaceId_mcpServerId: {
                  workspaceId: effectiveWorkspaceId,
                  mcpServerId,
                },
              },
            });
            if (refreshedToken?.accessToken) {
              return { accessToken: decryptString(refreshedToken.accessToken) };
            }
          } catch (refreshError) {
            logger.warn('Failed to refresh workspace OAuth token, falling through to org token', {
              workspaceId: effectiveWorkspaceId,
              mcpServerId,
              error: refreshError instanceof Error ? refreshError.message : 'Unknown error',
            });
            // Fall through to org token
          }
        } else {
          logger.info('Using workspace OAuth token', { workspaceId, mcpServerId });
          return { accessToken: decryptString(workspaceToken.accessToken) };
        }
      }
    }

    // 3. Try org-level token as fallback
    try {
      const orgToken = await getOrgAccessToken(mcpServer.organizationId, mcpServerId);
      logger.info('Using org-level OAuth token', { mcpServerId });
      return { accessToken: orgToken.token };
    } catch (error) {
      logger.warn(
        `No OAuth token available (personal, workspace, or org-level) for server ${mcpServerId}`,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
          workspaceId,
        },
      );
      return null;
    }
  }

  return null;
}

/**
 * Builds headers for an MCP server request with proper authentication.
 * This is a convenience wrapper around getCredentialsForMcpServer and buildCredentialHeaders.
 *
 * @param organizationId - The organization ID
 * @param userId - The user ID
 * @param mcpServer - The MCP server object
 * @param workspaceId - Optional workspace ID for workspace-level credentials
 * @returns Headers object for the request
 */
export async function buildMcpRequestHeaders(
  organizationId: string,
  userId: string,
  mcpServer: Pick<McpServer, 'id' | 'authType'>,
  workspaceId?: string,
): Promise<Record<string, string>> {
  const credentials = await getCredentialsForMcpServer(
    organizationId,
    userId,
    mcpServer.id,
    workspaceId,
  );

  if (!credentials && mcpServer.authType !== McpAuthType.NONE) {
    logger.warn('No credentials available for MCP server requiring authentication', {
      mcpServerId: mcpServer.id,
      authType: mcpServer.authType,
      userId,
      workspaceId,
    });
  }

  return buildCredentialHeaders(mcpServer.authType, credentials ?? undefined);
}

// ============================================================================
// Direct MCP Tool Execution (for Admin MCP)
// ============================================================================

const MCP_CONNECTION_TIMEOUT_MS = 10000;
const MCP_TOOL_CALL_TIMEOUT_MS = 30000;

interface ExecuteMcpToolDirectParams {
  organizationId: string;
  userId: string;
  serverId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  workspaceId?: string;
}

interface ExecuteMcpToolDirectResult {
  content: unknown;
}

/**
 * Execute a tool on an MCP server directly (bypassing policy checks)
 * Used by Admin MCP to execute tools on external MCP servers
 */
export async function executeMcpToolDirect(
  params: ExecuteMcpToolDirectParams,
): Promise<ExecuteMcpToolDirectResult> {
  const { organizationId, userId, serverId, toolName, toolInput, workspaceId } = params;

  // Find the MCP server
  const server = await prisma.mcpServer.findFirst({
    where: {
      id: serverId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!server) {
    throw new Error(`MCP server not found: ${serverId}`);
  }

  // Build authentication headers
  const headers = await buildMcpRequestHeaders(
    organizationId,
    userId,
    {
      id: server.id,
      authType: server.authType,
    },
    workspaceId,
  );

  // Create MCP client
  const client = createMcpClient('sentinel-admin-mcp-executor');
  let connected = false;

  try {
    // Create transport
    const transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers },
    });

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), MCP_CONNECTION_TIMEOUT_MS);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    connected = true;

    // Wait for server initialization
    await new Promise((resolve) => setTimeout(resolve, MCP_STARTUP_DELAY_MS));

    // Call the tool with timeout
    const callPromise = client.callTool({
      name: toolName,
      arguments: toolInput,
    });
    const callTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Tool call timeout')), MCP_TOOL_CALL_TIMEOUT_MS);
    });

    const result = await Promise.race([callPromise, callTimeoutPromise]);

    await client.close();

    return { content: result };
  } catch (error) {
    if (connected) {
      await safeCloseClient(client);
    }
    throw error;
  }
}
