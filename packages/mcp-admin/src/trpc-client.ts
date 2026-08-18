/**
 * tRPC Client for Admin MCP
 *
 * Imports AppRouter from @sentinel/api for full type safety.
 * The circular dependency is avoided because api imports tool definitions
 * from @sentinel/shared, not from mcp-admin.
 */
import type { AppRouter } from '@sentinel/api/src/trpc/router.js';
import { createTRPCClient, httpBatchLink, type TRPCClient } from '@trpc/client';

// Validate API_URL configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const isProduction = process.env.NODE_ENV === 'production';
const isLocalhost = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');

if (isProduction && isLocalhost) {
  console.error(
    '[MCP-Admin] CRITICAL: API_URL is set to localhost in production mode. ' +
      'Set API_URL environment variable to your production API URL.',
  );
}

const PROXY_API_KEY = process.env.PROXY_API_KEY;

/**
 * Create a tRPC client with optional access token for user authentication.
 * If accessToken is provided, it will be sent as Bearer token for user auth.
 * The proxy key is always included for service-to-service auth.
 */
export function createTrpcClient(accessToken?: string): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers() {
          const headers: Record<string, string> = {};

          // Include proxy API key for service-to-service auth
          if (PROXY_API_KEY) {
            headers['x-proxy-key'] = PROXY_API_KEY;
          }

          // Include access token for user auth (required for admin routes)
          if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
          }

          return headers;
        },
      }),
    ],
  });
}

/**
 * Default tRPC client (no user authentication)
 * Use createTrpcClient(accessToken) for authenticated admin operations
 */
export const trpc: TRPCClient<AppRouter> = createTrpcClient();
