/**
 * Tests for tRPC Context Creation
 * Tests the createContext function that sets up auth context for tRPC procedures
 */

import { OrgRole } from '@sentinel/db';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AuthContext } from '../../../../packages/api/src/services/auth.js';

// Mock the auth service before importing context
vi.mock('../../../../packages/api/src/services/auth.js', () => ({
  validateAccessToken: vi.fn(),
}));

import { validateAccessToken } from '../../../../packages/api/src/services/auth.js';
import { createContext } from '../../../../packages/api/src/trpc/context.js';

const mockValidateAccessToken = vi.mocked(validateAccessToken);

// Helper to create a properly typed mock auth context
function createMockAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      organizationId: 'org-456',
      accessToken: 'token-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      deletedBy: null,
      lastActivityAt: null,
      orgRole: OrgRole.MEMBER,
      userRoles: [],
    },
    organizationId: 'org-456',
    roles: ['USER'],
    isAdmin: false,
    isOrgOwner: false,
    workspaceIds: [],
    adminWorkspaceIds: [],
    ...overrides,
  };
}

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

// Create a mock Hono context
function createMockHonoContext(options: { authHeader?: string; tokenQuery?: string }): {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
} {
  return {
    req: {
      header: (name: string) => {
        if (name.toLowerCase() === 'authorization') {
          return options.authHeader;
        }
        return undefined;
      },
      query: (name: string) => {
        if (name === 'token') {
          return options.tokenQuery;
        }
        return undefined;
      },
    },
  };
}

describe('createContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('token extraction', () => {
    test('should extract token from Authorization header', async () => {
      const mockAuth = createMockAuthContext();
      mockValidateAccessToken.mockResolvedValue(mockAuth);

      const mockReq = createMockHonoContext({
        authHeader: 'Bearer test-token-123',
      });

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).toHaveBeenCalledWith('test-token-123');
      expect(context.auth).toEqual(mockAuth);
    });

    test('should extract token from query parameter when no header', async () => {
      const mockAuth = createMockAuthContext();
      mockValidateAccessToken.mockResolvedValue(mockAuth);

      const mockReq = createMockHonoContext({
        tokenQuery: 'query-token-456',
      });

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).toHaveBeenCalledWith('query-token-456');
      expect(context.auth).toEqual(mockAuth);
    });

    test('should prefer Authorization header over query parameter', async () => {
      const mockAuth = createMockAuthContext();
      mockValidateAccessToken.mockResolvedValue(mockAuth);

      const mockReq = createMockHonoContext({
        authHeader: 'Bearer header-token',
        tokenQuery: 'query-token',
      });

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).toHaveBeenCalledWith('header-token');
      expect(context.auth).toEqual(mockAuth);
    });

    test('should handle Bearer prefix correctly', async () => {
      mockValidateAccessToken.mockResolvedValue(null);

      const mockReq = createMockHonoContext({
        authHeader: 'Bearer   token-with-spaces',
      });

      await createContext({ req: mockReq as never });

      // Should only remove 'Bearer ' prefix once
      expect(mockValidateAccessToken).toHaveBeenCalledWith('  token-with-spaces');
    });
  });

  describe('no token scenarios', () => {
    test('should return null auth when no token provided', async () => {
      const mockReq = createMockHonoContext({});

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).not.toHaveBeenCalled();
      expect(context.auth).toBeNull();
    });

    test('should return null auth when header is empty', async () => {
      const mockReq = createMockHonoContext({
        authHeader: '',
      });

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).not.toHaveBeenCalled();
      expect(context.auth).toBeNull();
    });

    test('should return null auth when query token is empty', async () => {
      const mockReq = createMockHonoContext({
        tokenQuery: '',
      });

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).not.toHaveBeenCalled();
      expect(context.auth).toBeNull();
    });
  });

  describe('token validation', () => {
    test('should return auth context for valid token', async () => {
      const mockAuth = createMockAuthContext({
        organizationId: 'org-xyz',
        roles: ['ADMIN', 'USER'],
        isAdmin: true,
      });
      mockValidateAccessToken.mockResolvedValue(mockAuth);

      const mockReq = createMockHonoContext({
        authHeader: 'Bearer valid-token',
      });

      const context = await createContext({ req: mockReq as never });

      expect(context.auth).toEqual(mockAuth);
      expect(context.req).toBe(mockReq);
    });

    test('should return null auth for invalid token', async () => {
      mockValidateAccessToken.mockResolvedValue(null);

      const mockReq = createMockHonoContext({
        authHeader: 'Bearer invalid-token',
      });

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).toHaveBeenCalledWith('invalid-token');
      expect(context.auth).toBeNull();
    });

    test('should handle validateAccessToken throwing error', async () => {
      mockValidateAccessToken.mockRejectedValue(new Error('Database error'));

      const mockReq = createMockHonoContext({
        authHeader: 'Bearer some-token',
      });

      await expect(createContext({ req: mockReq as never })).rejects.toThrow('Database error');
    });
  });

  describe('context structure', () => {
    test('should include req in context', async () => {
      const mockReq = createMockHonoContext({});

      const context = await createContext({ req: mockReq as never });

      expect(context.req).toBe(mockReq);
    });

    test('should satisfy TRPCContext interface', async () => {
      const mockAuth = createMockAuthContext();
      mockValidateAccessToken.mockResolvedValue(mockAuth);

      const mockReq = createMockHonoContext({
        authHeader: 'Bearer test',
      });

      const context = await createContext({ req: mockReq as never });

      // Context should have auth and req properties
      expect(context).toHaveProperty('auth');
      expect(context).toHaveProperty('req');
      expect(typeof context.auth === 'object' || context.auth === null).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should handle token with Bearer prefix only (no actual token)', async () => {
      const mockReq = createMockHonoContext({
        authHeader: 'Bearer ',
      });

      const context = await createContext({ req: mockReq as never });

      // Empty string after stripping Bearer should not validate
      expect(mockValidateAccessToken).not.toHaveBeenCalled();
      expect(context.auth).toBeNull();
    });

    test('should handle non-Bearer authorization schemes', async () => {
      mockValidateAccessToken.mockResolvedValue(null);

      const mockReq = createMockHonoContext({
        authHeader: 'Basic dXNlcjpwYXNz', // Basic auth
      });

      const context = await createContext({ req: mockReq as never });

      // Should still try to validate (after removing 'Bearer ' which results in 'Basic dXNlcjpwYXNz' without 'Bearer ')
      // Actually 'Basic...' doesn't start with 'Bearer ', so replace returns unchanged
      expect(mockValidateAccessToken).toHaveBeenCalledWith('Basic dXNlcjpwYXNz');
      expect(context.auth).toBeNull();
    });

    test('should handle very long tokens', async () => {
      const longToken = 'a'.repeat(10000);
      mockValidateAccessToken.mockResolvedValue(null);

      const mockReq = createMockHonoContext({
        authHeader: `Bearer ${longToken}`,
      });

      const context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).toHaveBeenCalledWith(longToken);
      expect(context.auth).toBeNull();
    });

    test('should handle special characters in token', async () => {
      const specialToken = 'token+with/special=chars==';
      mockValidateAccessToken.mockResolvedValue(null);

      const mockReq = createMockHonoContext({
        authHeader: `Bearer ${specialToken}`,
      });

      const _context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).toHaveBeenCalledWith(specialToken);
    });

    test('should handle unicode in token', async () => {
      const unicodeToken = 'token-日本語-🔐';
      mockValidateAccessToken.mockResolvedValue(null);

      const mockReq = createMockHonoContext({
        authHeader: `Bearer ${unicodeToken}`,
      });

      const _context = await createContext({ req: mockReq as never });

      expect(mockValidateAccessToken).toHaveBeenCalledWith(unicodeToken);
    });
  });
});
