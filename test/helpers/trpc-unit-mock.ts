/**
 * tRPC Unit Test Mock Helper
 *
 * Provides a consistent mock for tRPC init module that breaks TypeScript's
 * strict inference chain, allowing tests to call procedures with simple
 * { ctx, input } objects instead of full ProcedureCallOptions.
 */
import { vi } from 'vitest';

/**
 * Type for test-friendly procedure handlers.
 * Using Record<string, unknown> allows accessing any property on the result.
 * Input is optional since some procedures (like list) don't require input.
 */
export type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

/**
 * Creates the mock configuration for tRPC init module.
 * Call this in your test file and pass the result to vi.mock().
 *
 * @example
 * ```ts
 * import { createTrpcInitMock } from '../../../helpers/trpc-unit-mock.js';
 *
 * vi.mock('../../../../../packages/api/src/trpc/init.js', createTrpcInitMock);
 * ```
 */
export function createTrpcInitMock() {
  const mockHandler = vi.fn((fn: TestableHandler): TestableHandler => fn);
  const mockInputHandler = vi.fn(
    (): { query: typeof mockHandler; mutation: typeof mockHandler } => ({
      query: mockHandler,
      mutation: mockHandler,
    }),
  );

  return {
    router: vi.fn((routes: unknown) => routes),
    adminProcedure: {
      query: mockHandler,
      input: mockInputHandler,
      mutation: mockHandler,
    },
    publicProcedure: {
      query: mockHandler,
      input: mockInputHandler,
      mutation: mockHandler,
    },
    userProcedure: {
      query: mockHandler,
      input: mockInputHandler,
      mutation: mockHandler,
    },
    proxyProcedure: {
      query: mockHandler,
      input: mockInputHandler,
      mutation: mockHandler,
    },
  };
}

/**
 * Helper to re-type an imported router for testing.
 * This breaks tRPC's strict type inference and allows simple { ctx, input } calls.
 *
 * @example
 * ```ts
 * import { adminPoliciesRouter as _adminPoliciesRouter } from '../router.js';
 * import { testableRouter } from '../../../helpers/trpc-unit-mock.js';
 *
 * const adminPoliciesRouter = testableRouter<{
 *   list: TestableHandler;
 *   get: TestableHandler;
 *   create: TestableHandler;
 * }>(_adminPoliciesRouter);
 * ```
 */
export function testableRouter<T>(router: unknown): T {
  return router as T;
}
