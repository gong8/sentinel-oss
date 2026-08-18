/**
 * Tests for tRPC Initialization Module
 * Tests procedures and middleware configuration
 *
 * Coverage targets:
 * - Lines 15-27: Error formatter (logging non-UNAUTHORIZED errors)
 * - Line 46: TRPCError throw in protectedProcedure
 * - Line 59: logger.warn call when lastActivityAt update fails
 * - Lines 96-99: Proxy procedure warning when PROXY_API_KEY not configured
 */

import { getErrorShape, TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogger, mockIsAdmin } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      update: vi.fn(),
    },
  },
  mockLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  mockIsAdmin: vi.fn(),
}));

// Mock modules before importing init.ts
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../packages/api/src/services/auth.js', () => ({
  isAdmin: mockIsAdmin,
}));

// Import the actual init module - this will use our mocks
import {
  adminProcedure,
  protectedProcedure,
  proxyProcedure,
  publicProcedure,
  router,
} from '../../../../packages/api/src/trpc/init.js';

// Helper to create a mock Hono-like context
function createMockHonoContext(options: { proxyKey?: string | null } = {}) {
  return {
    req: {
      header: vi.fn((name: string) => {
        if (name === 'x-proxy-key') {
          return options.proxyKey ?? null;
        }
        return null;
      }),
      query: vi.fn(),
    },
  };
}

// Helper to create mock auth context
function createMockAuth(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      organizationId: 'org-456',
    },
    organizationId: 'org-456',
    roles: ['USER'],
    isAdmin: false,
    ...overrides,
  };
}

// Type for router with createCaller and _def for accessing config
type RouterWithCaller = ReturnType<typeof router> & {
  createCaller: (ctx: unknown) => Record<string, () => Promise<unknown>>;
  _def: {
    _config: Parameters<typeof getErrorShape>[0]['config'];
  };
};

describe('tRPC init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    // Reset environment
    delete process.env.PROXY_API_KEY;
  });

  afterEach(() => {
    delete process.env.PROXY_API_KEY;
  });

  describe('router', () => {
    test('should be a valid router function', () => {
      expect(router).toBeDefined();
      expect(typeof router).toBe('function');
    });
  });

  describe('publicProcedure', () => {
    test('should be defined', () => {
      expect(publicProcedure).toBeDefined();
    });
  });

  describe('protectedProcedure', () => {
    test('should throw UNAUTHORIZED when auth is null', async () => {
      // Create a test router with protectedProcedure
      const testRouter = router({
        test: protectedProcedure.query(() => {
          return { success: true };
        }),
      }) as RouterWithCaller;

      // Create a caller with null auth using the router's createCaller method
      const caller = testRouter.createCaller({
        auth: null,
        req: createMockHonoContext(),
      });

      // Should throw UNAUTHORIZED
      await expect(caller.test()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    });

    test('should allow authenticated users and update lastActivityAt', async () => {
      const mockAuth = createMockAuth();

      // Create a test router
      const testRouter = router({
        test: protectedProcedure.query(({ ctx }) => {
          return { userId: ctx.auth.user.id };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: mockAuth,
        req: createMockHonoContext(),
      });

      const result = await caller.test();

      expect(result).toEqual({ userId: 'user-123' });

      // Wait a tick for the fire-and-forget update
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { lastActivityAt: expect.any(Date) },
      });
    });

    test('should log warning when lastActivityAt update fails', async () => {
      const mockAuth = createMockAuth();
      const dbError = new Error('Database connection failed');
      mockPrisma.user.update.mockRejectedValue(dbError);

      // Create a test router
      const testRouter = router({
        test: protectedProcedure.query(() => {
          return { success: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: mockAuth,
        req: createMockHonoContext(),
      });

      // The call should succeed (update is fire-and-forget)
      const result = await caller.test();
      expect(result).toEqual({ success: true });

      // Wait for the catch block to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to update lastActivityAt',
        expect.objectContaining({
          error: dbError,
          userId: 'user-123',
        }),
      );
    });
  });

  describe('adminProcedure', () => {
    test('should throw FORBIDDEN when user is not admin', async () => {
      const mockAuth = createMockAuth();
      mockIsAdmin.mockReturnValue(false);

      const testRouter = router({
        adminTest: adminProcedure.query(() => {
          return { admin: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: mockAuth,
        req: createMockHonoContext(),
      });

      await expect(caller.adminTest()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    });

    test('should allow admin users through', async () => {
      const mockAuth = createMockAuth({ isAdmin: true });
      mockIsAdmin.mockReturnValue(true);

      const testRouter = router({
        adminTest: adminProcedure.query(() => {
          return { admin: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: mockAuth,
        req: createMockHonoContext(),
      });

      const result = await caller.adminTest();
      expect(result).toEqual({ admin: true });
    });
  });

  describe('proxyProcedure', () => {
    test('should warn and allow access when PROXY_API_KEY is not configured', async () => {
      delete process.env.PROXY_API_KEY;

      const testRouter = router({
        proxyTest: proxyProcedure.query(() => {
          return { proxy: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: null,
        req: createMockHonoContext(),
      });

      const result = await caller.proxyTest();

      expect(result).toEqual({ proxy: true });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'PROXY_API_KEY not configured - proxy endpoints are unprotected',
      );
    });

    test('should throw UNAUTHORIZED when proxy key header is missing', async () => {
      process.env.PROXY_API_KEY = 'secret-proxy-key';

      const testRouter = router({
        proxyTest: proxyProcedure.query(() => {
          return { proxy: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: null,
        req: createMockHonoContext({ proxyKey: null }),
      });

      await expect(caller.proxyTest()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Proxy API key required',
      });
    });

    test('should throw UNAUTHORIZED when proxy key is invalid', async () => {
      process.env.PROXY_API_KEY = 'correct-secret-key';

      const testRouter = router({
        proxyTest: proxyProcedure.query(() => {
          return { proxy: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: null,
        req: createMockHonoContext({ proxyKey: 'wrong-key' }),
      });

      await expect(caller.proxyTest()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Invalid proxy API key',
      });
    });

    test('should throw UNAUTHORIZED when key lengths differ', async () => {
      process.env.PROXY_API_KEY = 'long-correct-key-here';

      const testRouter = router({
        proxyTest: proxyProcedure.query(() => {
          return { proxy: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: null,
        req: createMockHonoContext({ proxyKey: 'short' }),
      });

      await expect(caller.proxyTest()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Invalid proxy API key',
      });
    });

    test('should allow valid proxy key through', async () => {
      const validKey = 'my-secret-proxy-key';
      process.env.PROXY_API_KEY = validKey;

      const testRouter = router({
        proxyTest: proxyProcedure.query(() => {
          return { proxy: true };
        }),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: null,
        req: createMockHonoContext({ proxyKey: validKey }),
      });

      const result = await caller.proxyTest();
      expect(result).toEqual({ proxy: true });
    });
  });

  describe('error formatter', () => {
    // Helper function to get config from a router
    function getRouterConfig() {
      const testRouter = router({
        test: publicProcedure.query(() => 'test'),
      }) as RouterWithCaller;
      return testRouter._def._config;
    }

    test('should log non-UNAUTHORIZED errors', () => {
      const config = getRouterConfig();
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong',
      });

      // Trigger the error formatter via getErrorShape
      getErrorShape({
        config,
        error,
        type: 'query',
        path: 'test.path',
        input: undefined,
        ctx: {},
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'tRPC Error:',
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Something went wrong',
          path: 'test.path',
        }),
      );
    });

    test('should not log UNAUTHORIZED errors', () => {
      const config = getRouterConfig();
      const error = new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });

      // Trigger the error formatter via getErrorShape
      getErrorShape({
        config,
        error,
        type: 'query',
        path: 'test.path',
        input: undefined,
        ctx: {},
      });

      // The error formatter should NOT log UNAUTHORIZED errors
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should log FORBIDDEN errors', () => {
      const config = getRouterConfig();
      const error = new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });

      getErrorShape({
        config,
        error,
        type: 'query',
        path: 'admin.test',
        input: undefined,
        ctx: {},
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'tRPC Error:',
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'Admin access required',
          path: 'admin.test',
        }),
      );
    });

    test('should log BAD_REQUEST errors', () => {
      const config = getRouterConfig();
      const error = new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid input',
      });

      getErrorShape({
        config,
        error,
        type: 'query',
        path: 'user.create',
        input: undefined,
        ctx: {},
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'tRPC Error:',
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Invalid input',
        }),
      );
    });

    test('should include path in error log', () => {
      const config = getRouterConfig();
      const error = new TRPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });

      getErrorShape({
        config,
        error,
        type: 'query',
        path: 'nested.deep.procedure',
        input: undefined,
        ctx: {},
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'tRPC Error:',
        expect.objectContaining({
          path: 'nested.deep.procedure',
        }),
      );
    });

    test('should include cause in error log when present', () => {
      const config = getRouterConfig();
      const cause = new Error('Original error');
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Wrapped error',
        cause,
      });

      getErrorShape({
        config,
        error,
        type: 'query',
        path: 'test',
        input: undefined,
        ctx: {},
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'tRPC Error:',
        expect.objectContaining({
          cause,
        }),
      );
    });

    test('should include stack in error log', () => {
      const config = getRouterConfig();
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Server error',
      });

      getErrorShape({
        config,
        error,
        type: 'query',
        path: 'test',
        input: undefined,
        ctx: {},
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'tRPC Error:',
        expect.objectContaining({
          stack: expect.stringContaining('TRPCError'),
        }),
      );
    });

    test('should return the original shape unchanged', () => {
      const config = getRouterConfig();
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Test error',
      });

      const result = getErrorShape({
        config,
        error,
        type: 'query',
        path: 'test',
        input: undefined,
        ctx: {},
      });

      // The shape should contain the standard error information
      expect(result).toMatchObject({
        message: 'Test error',
        code: expect.any(Number),
        data: expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      });
    });
  });

  describe('integration scenarios', () => {
    test('should handle multiple sequential calls with same auth', async () => {
      const mockAuth = createMockAuth();

      const testRouter = router({
        first: protectedProcedure.query(() => ({ step: 1 })),
        second: protectedProcedure.query(() => ({ step: 2 })),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: mockAuth,
        req: createMockHonoContext(),
      });

      const result1 = await caller.first();
      const result2 = await caller.second();

      expect(result1).toEqual({ step: 1 });
      expect(result2).toEqual({ step: 2 });

      // Wait for fire-and-forget updates
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have tried to update lastActivityAt twice
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    });

    test('should pass auth context correctly through middleware chain', async () => {
      const mockAuth = createMockAuth({
        user: { id: 'specific-user-id', email: 'specific@test.com' },
      });
      mockIsAdmin.mockReturnValue(true);

      const testRouter = router({
        adminEndpoint: adminProcedure.query(({ ctx }) => ({
          userId: ctx.auth.user.id,
        })),
      }) as RouterWithCaller;

      const caller = testRouter.createCaller({
        auth: mockAuth,
        req: createMockHonoContext(),
      });

      const result = await caller.adminEndpoint();

      expect(result).toEqual({ userId: 'specific-user-id' });
    });
  });
});
