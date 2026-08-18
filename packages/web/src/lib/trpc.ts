/**
 * tRPC Client Setup
 * Configures the tRPC client for the frontend
 */

import { createTRPCClient, httpBatchStreamLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/src/trpc/router';
import { getAccessToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Create tRPC hooks for React Query integration
export const trpc = createTRPCReact<AppRouter>();

// Create vanilla tRPC client for direct streaming access
// This allows proper async iteration over streaming mutations
export const vanillaTrpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: `${API_URL}/trpc`,
      headers() {
        const token = getAccessToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

// Export router output types for use in components
export type RouterOutputs = inferRouterOutputs<AppRouter>;
