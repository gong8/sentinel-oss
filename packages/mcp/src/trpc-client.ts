import type { AppRouter } from '@sentinel/api/src/trpc/router';
import { createTRPCClient, httpBatchLink, type CreateTRPCClient } from '@trpc/client';

// Validate API_URL configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const isProduction = process.env.NODE_ENV === 'production';
const isLocalhost = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');

if (isProduction && isLocalhost) {
  console.error(
    '[MCP] CRITICAL: API_URL is set to localhost in production mode. ' +
      'Set API_URL environment variable to your production API URL.',
  );
}

const PROXY_API_KEY = process.env.PROXY_API_KEY;

export const trpc: CreateTRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers() {
        // Include proxy API key for service-to-service auth
        if (PROXY_API_KEY) {
          return {
            'x-proxy-key': PROXY_API_KEY,
          };
        }
        return {};
      },
    }),
  ],
});
