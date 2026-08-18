/**
 * tRPC Test Helpers
 * Utilities for creating test tRPC contexts and callers
 */

import type { AuthContext } from '../../packages/api/src/services/auth.js';
import type { TRPCContext } from '../../packages/api/src/trpc/context.js';
import { appRouter } from '../../packages/api/src/trpc/router.js';
import type { UserWithRoles } from '../../packages/api/src/types/role.js';
import { createAuthContext, createMockUser } from './auth.js';

/**
 * Creates a mock tRPC context for testing.
 * Uses a minimal mock that satisfies only the methods used by createContext.
 */
export function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  const mockReq = {
    req: {
      header: () => null,
      query: () => null,
    },
  };

  return {
    auth: null,
    // Test-only cast: HonoContext is complex, but tests only need minimal mock
    req: mockReq as unknown as TRPCContext['req'],
    ...overrides,
  };
}

/**
 * Creates a tRPC caller with the given auth context
 */
function createCallerWithAuthContext(auth: AuthContext) {
  const ctx = createMockContext({ auth });
  return appRouter.createCaller(ctx);
}

/**
 * Creates a tRPC caller with admin context
 */
export function createAdminCaller() {
  const user = createMockUser({
    id: 'admin-id',
    email: 'admin@test.com',
    accessToken: 'admin-token',
    roles: [{ id: 'admin-role-id', name: 'Admin', isAdmin: true }],
  });
  return createCallerWithAuthContext(createAuthContext(user));
}

/**
 * Creates a tRPC caller with user context
 */
export function createUserCaller() {
  const user = createMockUser({
    id: 'user-id',
    email: 'user@test.com',
    accessToken: 'user-token',
    roles: [{ id: 'user-role-id', name: 'User', isAdmin: false }],
  });
  return createCallerWithAuthContext(createAuthContext(user));
}

/**
 * Creates a tRPC caller with custom auth context from database user
 */
export function createCallerWithUser(
  user: UserWithRoles,
  overrides: { isOrgOwner?: boolean; workspaceIds?: string[]; adminWorkspaceIds?: string[] } = {},
) {
  return createCallerWithAuthContext(createAuthContext(user, overrides));
}

/**
 * Creates a tRPC caller with custom auth context
 */
export function createCallerWithAuth(auth: AuthContext) {
  return createCallerWithAuthContext(auth);
}

/**
 * Creates a tRPC caller with no authentication
 */
export function createPublicCaller() {
  const ctx = createMockContext({ auth: null });
  return appRouter.createCaller(ctx);
}

/**
 * Test proxy API key for service-to-service authentication
 */
export const TEST_PROXY_API_KEY = 'test-proxy-api-key-for-testing';

/**
 * Creates a tRPC caller for proxy endpoints (with proxy API key)
 */
export function createProxyCaller() {
  const mockReq = {
    req: {
      header: (name: string) => (name === 'x-proxy-key' ? TEST_PROXY_API_KEY : null),
      query: () => null,
    },
  };

  const ctx: TRPCContext = {
    auth: null,
    req: mockReq as unknown as TRPCContext['req'],
  };

  return appRouter.createCaller(ctx);
}
