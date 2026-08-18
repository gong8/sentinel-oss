/**
 * Admin Router Test Helpers
 *
 * Common utilities for testing admin tRPC routers.
 * Reduces boilerplate and ensures consistent testing patterns.
 */
import { expect, vi } from 'vitest';

/**
 * Type for test-friendly procedure handlers.
 * Allows accessing any property on the result.
 */
export type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

/**
 * Standard mock context options
 */
export interface MockContextOptions {
  organizationId?: string;
  userId?: string;
  userEmail?: string;
}

/**
 * Creates a mock context for admin router tests.
 * Provides consistent auth and request header mocking.
 */
export function createMockContext(overrides: MockContextOptions = {}): {
  auth: { organizationId: string; user: { id: string; email?: string } };
  req: { req: { header: ReturnType<typeof vi.fn> } };
} {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: {
        id: overrides.userId ?? 'user-123',
        email: overrides.userEmail ?? 'admin@example.com',
      },
    },
    req: {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '192.168.1.1';
          if (name === 'x-real-ip') return null;
          if (name === 'user-agent') return 'Mozilla/5.0';
          return null;
        }),
      },
    },
  };
}

/**
 * Creates a mock context with custom header handler.
 */
export function createMockContextWithHeaders(
  headerFn: (name: string) => string | null,
  overrides: MockContextOptions = {},
): ReturnType<typeof createMockContext> {
  const ctx = createMockContext(overrides);
  ctx.req.req.header = vi.fn(headerFn);
  return ctx;
}

/**
 * Asserts that a handler throws a TRPCError with specific code and optional message.
 * Simplifies the common pattern of testing error conditions.
 */
export async function expectTRPCError(
  handler: () => Promise<unknown>,
  code: string,
  messageContains?: string,
): Promise<void> {
  const errorMatcher: { code: string; message?: unknown } = { code };
  if (messageContains !== undefined) {
    errorMatcher.message = expect.stringContaining(messageContains);
  }
  // Only call handler once to avoid consuming mocked values twice
  await expect(handler()).rejects.toMatchObject(errorMatcher);
}

/**
 * Asserts that a handler throws NOT_FOUND error.
 */
export async function expectNotFound(
  handler: () => Promise<unknown>,
  message?: string,
): Promise<void> {
  await expectTRPCError(handler, 'NOT_FOUND', message);
}

/**
 * Asserts that a handler throws BAD_REQUEST error.
 */
export async function expectBadRequest(
  handler: () => Promise<unknown>,
  message?: string,
): Promise<void> {
  await expectTRPCError(handler, 'BAD_REQUEST', message);
}

/**
 * Asserts that a handler throws CONFLICT error.
 */
export async function expectConflict(
  handler: () => Promise<unknown>,
  message?: string,
): Promise<void> {
  await expectTRPCError(handler, 'CONFLICT', message);
}

/**
 * Asserts that admin action was logged with specific properties.
 */
export function expectAdminActionLogged(
  mockLogAdminAction: ReturnType<typeof vi.fn>,
  actionType: string,
  resourceType: string,
  resourceId?: string,
): void {
  const expected: Record<string, unknown> = { actionType, resourceType };
  if (resourceId !== undefined) {
    expected.resourceId = resourceId;
  }
  expect(mockLogAdminAction).toHaveBeenCalledWith(expect.objectContaining(expected));
}

/**
 * Asserts that a Prisma query was scoped to the organization.
 */
export function expectOrgScoped(mockFn: ReturnType<typeof vi.fn>, organizationId: string): void {
  expect(mockFn).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ organizationId }),
    }),
  );
}

/**
 * Creates a standard tRPC init mock for admin routers.
 * Use with vi.mock() in test files.
 */
export function createTrpcInitMock() {
  return {
    router: vi.fn((routes: unknown) => routes),
    adminProcedure: {
      query: vi.fn((fn: unknown) => (args: unknown) => (fn as (args: unknown) => unknown)(args)),
      input: vi.fn(() => ({
        query: vi.fn((fn: unknown) => (args: unknown) => (fn as (args: unknown) => unknown)(args)),
        mutation: vi.fn(
          (fn: unknown) => (args: unknown) => (fn as (args: unknown) => unknown)(args),
        ),
        output: vi.fn(() => ({
          mutation: vi.fn(
            (fn: unknown) => (args: unknown) => (fn as (args: unknown) => unknown)(args),
          ),
        })),
      })),
      mutation: vi.fn((fn: unknown) => (args: unknown) => (fn as (args: unknown) => unknown)(args)),
    },
  };
}

/**
 * Creates mock data with defaults and overrides.
 * Generic factory function for test data.
 */
export function createMockData<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> = {},
): T {
  return { ...defaults, ...overrides };
}
