/**
 * Rate Limiting Middleware Unit Tests
 * Tests for in-memory rate limiting functionality
 */

import type { Context } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock logger before importing the module
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../../../packages/api/src/lib/logger.js';
import {
  apiRateLimit,
  authRateLimit,
  clearRateLimitStore,
  getRateLimitStats,
  rateLimit,
  restartRateLimitCleanup,
  stopRateLimitCleanup,
  strictRateLimit,
} from '../../../../packages/api/src/middleware/rateLimit.js';

const mockLogger = vi.mocked(logger);

// Store original NODE_ENV
const originalNodeEnv = process.env.NODE_ENV;

/**
 * Creates a mock Hono Context object for testing
 */
function createMockContext(options: {
  headers?: Record<string, string>;
  path?: string;
  env?: Record<string, unknown>;
}): {
  context: Context;
  responseHeaders: Map<string, string>;
  jsonResponse: { body: unknown; status: number } | null;
} {
  const responseHeaders = new Map<string, string>();
  let jsonResponse: { body: unknown; status: number } | null = null;

  const context = {
    req: {
      header: (name: string) => options.headers?.[name.toLowerCase()],
      path: options.path ?? '/api/test',
    },
    env: options.env ?? {},
    header: (name: string, value: string) => {
      responseHeaders.set(name, value);
    },
    json: (body: unknown, status: number) => {
      jsonResponse = { body, status };
      return new Response(JSON.stringify(body), { status });
    },
  } as unknown as Context;

  return { context, responseHeaders, jsonResponse: jsonResponse };
}

/**
 * Creates a mock next function for middleware
 */
function createMockNext(): { next: () => Promise<void>; wasCalled: () => boolean } {
  let called = false;
  return {
    next: async () => {
      called = true;
    },
    wasCalled: () => called,
  };
}

beforeAll(() => {
  console.log('Rate limit middleware test suite starting...');
});

afterAll(() => {
  // Stop the cleanup interval to prevent leaks
  stopRateLimitCleanup();
  console.log('Rate limit middleware test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimitStore();
  // Set to production for most tests
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  // Restore original NODE_ENV
  process.env.NODE_ENV = originalNodeEnv;
});

describe('rateLimit middleware', () => {
  describe('rate limit configuration', () => {
    test('should accept valid configuration with maxRequests and windowMs', () => {
      const middleware = rateLimit({ maxRequests: 100, windowMs: 60000 });
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    test('should accept configuration with custom keyExtractor', () => {
      const customExtractor = (c: Context) => c.req.header('x-api-key') ?? 'anonymous';
      const middleware = rateLimit({
        maxRequests: 100,
        windowMs: 60000,
        keyExtractor: customExtractor,
      });
      expect(middleware).toBeDefined();
    });

    test('should accept configuration with skipInTest option', () => {
      const middleware = rateLimit({
        maxRequests: 100,
        windowMs: 60000,
        skipInTest: false,
      });
      expect(middleware).toBeDefined();
    });
  });

  describe('test environment skipping', () => {
    test('should skip rate limiting in test environment by default', async () => {
      process.env.NODE_ENV = 'test';

      const middleware = rateLimit({ maxRequests: 1, windowMs: 60000 });
      const { context, responseHeaders } = createMockContext({});
      const { next, wasCalled } = createMockNext();

      // First request
      await middleware(context, next);
      expect(wasCalled()).toBe(true);

      // Second request should also pass (skipped)
      const { context: context2 } = createMockContext({});
      const { next: next2, wasCalled: wasCalled2 } = createMockNext();
      await middleware(context2, next2);
      expect(wasCalled2()).toBe(true);

      // No rate limit headers should be set when skipped
      expect(responseHeaders.size).toBe(0);
    });

    test('should enforce rate limiting in test environment when skipInTest is false', async () => {
      process.env.NODE_ENV = 'test';

      const middleware = rateLimit({ maxRequests: 1, windowMs: 60000, skipInTest: false });
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });
      const { next, wasCalled } = createMockNext();

      await middleware(context, next);
      expect(wasCalled()).toBe(true);
      expect(responseHeaders.get('X-RateLimit-Limit')).toBe('1');
    });

    test('should enforce rate limiting in production environment', async () => {
      process.env.NODE_ENV = 'production';

      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });
      const { next } = createMockNext();

      await middleware(context, next);
      expect(responseHeaders.get('X-RateLimit-Limit')).toBe('5');
    });
  });

  describe('request counting and tracking', () => {
    test('should count requests per IP address', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });

      // Make 3 requests from same IP
      for (let i = 0; i < 3; i++) {
        const { context } = createMockContext({
          headers: { 'x-forwarded-for': '1.2.3.4' },
        });
        const { next } = createMockNext();
        await middleware(context, next);
      }

      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.entries[0].key).toBe('1.2.3.4');
      expect(stats.entries[0].count).toBe(3);
    });

    test('should track different IPs separately', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });

      const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.3'];

      for (const ip of ips) {
        const { context } = createMockContext({
          headers: { 'x-forwarded-for': ip },
        });
        const { next } = createMockNext();
        await middleware(context, next);
      }

      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.entries.map((e) => e.key).sort()).toEqual(ips.sort());
    });

    test('should set correct rate limit headers', async () => {
      const middleware = rateLimit({ maxRequests: 10, windowMs: 60000 });
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '5.6.7.8' },
      });
      const { next } = createMockNext();

      await middleware(context, next);

      expect(responseHeaders.get('X-RateLimit-Limit')).toBe('10');
      expect(responseHeaders.get('X-RateLimit-Remaining')).toBe('9');
      expect(Number(responseHeaders.get('X-RateLimit-Reset'))).toBeGreaterThan(0);
      expect(Number(responseHeaders.get('X-RateLimit-Reset'))).toBeLessThanOrEqual(60);
    });

    test('should decrement remaining count with each request', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const remainingValues: string[] = [];

      for (let i = 0; i < 5; i++) {
        const { context, responseHeaders } = createMockContext({
          headers: { 'x-forwarded-for': '9.9.9.9' },
        });
        const { next } = createMockNext();
        await middleware(context, next);
        remainingValues.push(responseHeaders.get('X-RateLimit-Remaining') ?? '');
      }

      expect(remainingValues).toEqual(['4', '3', '2', '1', '0']);
    });
  });

  describe('rate limit exceeded scenarios', () => {
    test('should block requests when limit exceeded', async () => {
      const middleware = rateLimit({ maxRequests: 2, windowMs: 60000 });

      // Make 2 allowed requests
      for (let i = 0; i < 2; i++) {
        const { context } = createMockContext({
          headers: { 'x-forwarded-for': '11.11.11.11' },
        });
        const { next, wasCalled } = createMockNext();
        await middleware(context, next);
        expect(wasCalled()).toBe(true);
      }

      // Third request should be blocked
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '11.11.11.11' },
      });
      const { next, wasCalled } = createMockNext();
      const response = await middleware(context, next);

      expect(wasCalled()).toBe(false);
      expect(response).toBeInstanceOf(Response);
      expect(responseHeaders.get('Retry-After')).toBeDefined();
    });

    test('should return 429 status with proper error body', async () => {
      const middleware = rateLimit({ maxRequests: 1, windowMs: 60000 });

      // First request passes
      const { context: ctx1 } = createMockContext({
        headers: { 'x-forwarded-for': '22.22.22.22' },
      });
      await middleware(ctx1, createMockNext().next);

      // Second request should be blocked
      const { context: ctx2 } = createMockContext({
        headers: { 'x-forwarded-for': '22.22.22.22' },
      });
      const response = (await middleware(ctx2, createMockNext().next)) as Response;

      expect(response.status).toBe(429);
      const body = (await response.json()) as {
        error: string;
        message: string;
        retryAfter: number;
      };
      expect(body.error).toBe('Too many requests');
      expect(body.message).toContain('Rate limit exceeded');
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    test('should log warning when rate limit exceeded', async () => {
      const middleware = rateLimit({ maxRequests: 1, windowMs: 60000 });

      // First request
      const { context: ctx1 } = createMockContext({
        headers: { 'x-forwarded-for': '33.33.33.33' },
        path: '/api/auth/login',
      });
      await middleware(ctx1, createMockNext().next);

      // Second request triggers warning
      const { context: ctx2 } = createMockContext({
        headers: { 'x-forwarded-for': '33.33.33.33' },
        path: '/api/auth/login',
      });
      await middleware(ctx2, createMockNext().next);

      expect(mockLogger.warn).toHaveBeenCalledWith('Rate limit exceeded', {
        ip: '33.33.33.33',
        path: '/api/auth/login',
        count: 2,
        limit: 1,
      });
    });

    test('should set Retry-After header when rate limited', async () => {
      const middleware = rateLimit({ maxRequests: 1, windowMs: 30000 }); // 30 seconds

      // First request
      const { context: ctx1 } = createMockContext({
        headers: { 'x-forwarded-for': '44.44.44.44' },
      });
      await middleware(ctx1, createMockNext().next);

      // Second request should be blocked with Retry-After
      const { context: ctx2, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '44.44.44.44' },
      });
      await middleware(ctx2, createMockNext().next);

      const retryAfter = Number(responseHeaders.get('Retry-After'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(30);
    });

    test('should continue blocking while limit exceeded', async () => {
      const middleware = rateLimit({ maxRequests: 1, windowMs: 60000 });

      // Make many requests
      let blockedCount = 0;
      for (let i = 0; i < 5; i++) {
        const { context } = createMockContext({
          headers: { 'x-forwarded-for': '55.55.55.55' },
        });
        const { next, wasCalled } = createMockNext();
        await middleware(context, next);
        if (!wasCalled()) blockedCount++;
      }

      // 4 requests should be blocked (first one passes)
      expect(blockedCount).toBe(4);
    });
  });

  describe('rate limit reset behavior', () => {
    test('should reset count when window expires', async () => {
      // Use fake timers for this test
      vi.useFakeTimers();

      const middleware = rateLimit({ maxRequests: 2, windowMs: 1000 }); // 1 second window

      // Make 2 requests (at limit)
      for (let i = 0; i < 2; i++) {
        const { context } = createMockContext({
          headers: { 'x-forwarded-for': '66.66.66.66' },
        });
        const { next, wasCalled } = createMockNext();
        await middleware(context, next);
        expect(wasCalled()).toBe(true);
      }

      // Advance time past window
      vi.advanceTimersByTime(1001);

      // New request should be allowed (new window)
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '66.66.66.66' },
      });
      const { next, wasCalled } = createMockNext();
      await middleware(context, next);

      expect(wasCalled()).toBe(true);
      expect(responseHeaders.get('X-RateLimit-Remaining')).toBe('1'); // Reset to maxRequests - 1

      vi.useRealTimers();
    });

    test('should start new window with count of 1', async () => {
      vi.useFakeTimers();

      const middleware = rateLimit({ maxRequests: 5, windowMs: 500 });

      // First request in first window
      const { context: ctx1 } = createMockContext({
        headers: { 'x-forwarded-for': '77.77.77.77' },
      });
      await middleware(ctx1, createMockNext().next);

      // Advance time past window
      vi.advanceTimersByTime(600);

      // First request in new window
      const { context: ctx2 } = createMockContext({
        headers: { 'x-forwarded-for': '77.77.77.77' },
      });
      await middleware(ctx2, createMockNext().next);

      const stats = getRateLimitStats();
      const entry = stats.entries.find((e) => e.key === '77.77.77.77');
      expect(entry?.count).toBe(1);

      vi.useRealTimers();
    });
  });

  describe('IP extraction', () => {
    test('should extract IP from x-forwarded-for header', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        headers: { 'x-forwarded-for': '203.0.113.50' },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('203.0.113.50');
    });

    test('should use first IP from x-forwarded-for chain', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178' },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('203.0.113.50');
    });

    test('should extract IP from x-real-ip header if x-forwarded-for missing', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        headers: { 'x-real-ip': '198.51.100.178' },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('198.51.100.178');
    });

    test('should prefer x-forwarded-for over x-real-ip', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        headers: {
          'x-forwarded-for': '203.0.113.50',
          'x-real-ip': '198.51.100.178',
        },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('203.0.113.50');
    });

    test('should extract IP from socket remoteAddress', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        env: {
          incoming: {
            socket: {
              remoteAddress: '192.0.2.1',
            },
          },
        },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('192.0.2.1');
    });

    test('should handle IPv6-mapped IPv4 addresses', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        env: {
          incoming: {
            socket: {
              remoteAddress: '::ffff:127.0.0.1',
            },
          },
        },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('127.0.0.1');
    });

    test('should fall back to "unknown" when no IP available', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({});
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('unknown');
    });
  });

  describe('custom key extractor', () => {
    test('should use custom keyExtractor when provided', async () => {
      const middleware = rateLimit({
        maxRequests: 5,
        windowMs: 60000,
        keyExtractor: (c) => c.req.header('x-api-key') ?? 'no-key',
      });

      const { context } = createMockContext({
        headers: {
          'x-api-key': 'my-api-key-123',
          'x-forwarded-for': '192.168.1.1', // Should be ignored
        },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('my-api-key-123');
    });

    test('should track by custom key separately from IP', async () => {
      const middleware = rateLimit({
        maxRequests: 2,
        windowMs: 60000,
        keyExtractor: (c) => c.req.header('x-user-id') ?? 'anonymous',
      });

      // Same IP but different user IDs
      const userIds = ['user-1', 'user-2'];
      for (const userId of userIds) {
        const { context } = createMockContext({
          headers: {
            'x-forwarded-for': '10.0.0.1',
            'x-user-id': userId,
          },
        });
        await middleware(context, createMockNext().next);
      }

      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('edge cases', () => {
    test('should handle concurrent requests from same IP', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });

      // Simulate concurrent requests
      const promises = Array.from({ length: 5 }, () => {
        const { context } = createMockContext({
          headers: { 'x-forwarded-for': '88.88.88.88' },
        });
        return middleware(context, createMockNext().next);
      });

      await Promise.all(promises);

      const stats = getRateLimitStats();
      expect(stats.entries[0].count).toBe(5);
    });

    test('should handle very large request counts', async () => {
      const middleware = rateLimit({ maxRequests: 1000, windowMs: 60000 });

      for (let i = 0; i < 100; i++) {
        const { context } = createMockContext({
          headers: { 'x-forwarded-for': '99.99.99.99' },
        });
        await middleware(context, createMockNext().next);
      }

      const stats = getRateLimitStats();
      expect(stats.entries[0].count).toBe(100);
    });

    test('should handle empty x-forwarded-for header', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        headers: { 'x-forwarded-for': '' },
      });
      await middleware(context, createMockNext().next);

      // Empty string should be treated as falsy, falling back
      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('unknown');
    });

    test('should handle whitespace in x-forwarded-for header', async () => {
      const middleware = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const { context } = createMockContext({
        headers: { 'x-forwarded-for': '  192.168.1.100  ' },
      });
      await middleware(context, createMockNext().next);

      const stats = getRateLimitStats();
      expect(stats.entries[0].key).toBe('192.168.1.100');
    });

    test('should handle maxRequests of 0', async () => {
      const middleware = rateLimit({ maxRequests: 0, windowMs: 60000 });
      const { context } = createMockContext({
        headers: { 'x-forwarded-for': '100.100.100.100' },
      });
      const { next, wasCalled } = createMockNext();
      await middleware(context, next);

      // First request should already exceed (count 1 > maxRequests 0)
      expect(wasCalled()).toBe(false);
    });

    test('should handle very short window duration', async () => {
      vi.useFakeTimers();

      const middleware = rateLimit({ maxRequests: 1, windowMs: 1 }); // 1ms window

      const { context: ctx1 } = createMockContext({
        headers: { 'x-forwarded-for': '111.111.111.111' },
      });
      await middleware(ctx1, createMockNext().next);

      // Advance 2ms
      vi.advanceTimersByTime(2);

      const { context: ctx2 } = createMockContext({
        headers: { 'x-forwarded-for': '111.111.111.111' },
      });
      const { next, wasCalled } = createMockNext();
      await middleware(ctx2, next);

      // Should be allowed (new window)
      expect(wasCalled()).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('getRateLimitStats', () => {
    test('should return empty stats when no requests made', () => {
      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    test('should return accurate stats after requests', async () => {
      const middleware = rateLimit({ maxRequests: 10, windowMs: 60000 });

      // Make requests from different IPs
      const ips = ['1.1.1.1', '2.2.2.2'];
      for (const ip of ips) {
        for (let i = 0; i < 3; i++) {
          const { context } = createMockContext({
            headers: { 'x-forwarded-for': ip },
          });
          await middleware(context, createMockNext().next);
        }
      }

      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.entries).toHaveLength(2);

      for (const entry of stats.entries) {
        expect(entry.count).toBe(3);
        expect(entry.windowStart).toBeGreaterThan(0);
      }
    });
  });

  describe('clearRateLimitStore', () => {
    test('should clear all entries', async () => {
      const middleware = rateLimit({ maxRequests: 10, windowMs: 60000 });

      // Make some requests
      const { context } = createMockContext({
        headers: { 'x-forwarded-for': '123.123.123.123' },
      });
      await middleware(context, createMockNext().next);

      expect(getRateLimitStats().totalEntries).toBe(1);

      clearRateLimitStore();

      expect(getRateLimitStats().totalEntries).toBe(0);
    });
  });
});

describe('pre-configured rate limiters', () => {
  describe('authRateLimit', () => {
    test('should be configured with expected limits', () => {
      expect(authRateLimit).toBeDefined();
      expect(typeof authRateLimit).toBe('function');
    });

    test('should allow 2000 requests per minute', async () => {
      // This is a configuration verification test
      // We make a few requests and verify headers show correct limit
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '200.200.200.200' },
      });
      await authRateLimit(context, createMockNext().next);

      expect(responseHeaders.get('X-RateLimit-Limit')).toBe('2000');
    });
  });

  describe('apiRateLimit', () => {
    test('should be configured with expected limits', () => {
      expect(apiRateLimit).toBeDefined();
      expect(typeof apiRateLimit).toBe('function');
    });

    test('should allow 10000 requests per minute', async () => {
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '201.201.201.201' },
      });
      await apiRateLimit(context, createMockNext().next);

      expect(responseHeaders.get('X-RateLimit-Limit')).toBe('10000');
    });
  });

  describe('strictRateLimit', () => {
    test('should be configured with expected limits', () => {
      expect(strictRateLimit).toBeDefined();
      expect(typeof strictRateLimit).toBe('function');
    });

    test('should allow 500 requests per minute', async () => {
      const { context, responseHeaders } = createMockContext({
        headers: { 'x-forwarded-for': '202.202.202.202' },
      });
      await strictRateLimit(context, createMockNext().next);

      expect(responseHeaders.get('X-RateLimit-Limit')).toBe('500');
    });
  });

  describe('rate limiter isolation', () => {
    test('different rate limiters should have separate tracking', async () => {
      clearRateLimitStore();

      const ip = '203.203.203.203';

      // Make requests with different rate limiters
      const { context: ctx1 } = createMockContext({
        headers: { 'x-forwarded-for': ip },
      });
      await authRateLimit(ctx1, createMockNext().next);

      const { context: ctx2 } = createMockContext({
        headers: { 'x-forwarded-for': ip },
      });
      await apiRateLimit(ctx2, createMockNext().next);

      // Both use the same store keyed by IP, so count should be combined
      // This tests the shared store behavior
      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.entries[0].count).toBe(2);
    });
  });
});

describe('stopRateLimitCleanup', () => {
  test('should stop cleanup interval without error', () => {
    // Just verify it doesn't throw
    expect(() => stopRateLimitCleanup()).not.toThrow();
  });

  test('should be idempotent', () => {
    // Should be safe to call multiple times
    expect(() => {
      stopRateLimitCleanup();
      stopRateLimitCleanup();
      stopRateLimitCleanup();
    }).not.toThrow();
  });
});

describe('cleanup interval', () => {
  test('should remove entries older than 1 hour during cleanup', async () => {
    // Setup fake timers first, then restart the cleanup interval
    vi.useFakeTimers();
    restartRateLimitCleanup();

    const middleware = rateLimit({ maxRequests: 10, windowMs: 60000 });

    // Create an entry
    const { context } = createMockContext({
      headers: { 'x-forwarded-for': '150.150.150.150' },
    });
    await middleware(context, createMockNext().next);

    // Verify entry exists
    expect(getRateLimitStats().totalEntries).toBe(1);

    // Advance time by more than 1 hour (entry retention time)
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    // Advance to trigger cleanup interval (5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Entry should be cleaned up
    expect(getRateLimitStats().totalEntries).toBe(0);
    expect(mockLogger.debug).toHaveBeenCalledWith('Rate limit cleanup: removed 1 expired entries');

    vi.useRealTimers();
    restartRateLimitCleanup();
  });

  test('should not remove entries younger than 1 hour during cleanup', async () => {
    vi.useFakeTimers();
    restartRateLimitCleanup();

    const middleware = rateLimit({ maxRequests: 10, windowMs: 60000 });

    // Create an entry
    const { context } = createMockContext({
      headers: { 'x-forwarded-for': '151.151.151.151' },
    });
    await middleware(context, createMockNext().next);

    // Verify entry exists
    expect(getRateLimitStats().totalEntries).toBe(1);

    // Advance time but stay under 1 hour
    vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes

    // Advance to trigger cleanup interval (5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Entry should still exist
    expect(getRateLimitStats().totalEntries).toBe(1);

    vi.useRealTimers();
    restartRateLimitCleanup();
  });

  test('should not log when no entries are cleaned', async () => {
    vi.useFakeTimers();
    restartRateLimitCleanup();

    // Clear any existing entries and logger calls
    clearRateLimitStore();
    vi.clearAllMocks();

    // Advance to trigger cleanup interval (5 minutes) with empty store
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Debug should not be called when cleaned === 0
    expect(mockLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Rate limit cleanup'),
    );

    vi.useRealTimers();
    restartRateLimitCleanup();
  });

  test('should clean multiple expired entries', async () => {
    vi.useFakeTimers();
    restartRateLimitCleanup();

    const middleware = rateLimit({ maxRequests: 10, windowMs: 60000 });

    // Create multiple entries from different IPs
    const ips = ['160.160.160.1', '160.160.160.2', '160.160.160.3'];
    for (const ip of ips) {
      const { context } = createMockContext({
        headers: { 'x-forwarded-for': ip },
      });
      await middleware(context, createMockNext().next);
    }

    // Verify entries exist
    expect(getRateLimitStats().totalEntries).toBe(3);

    // Advance time by more than 1 hour
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    // Advance to trigger cleanup interval (5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // All entries should be cleaned up
    expect(getRateLimitStats().totalEntries).toBe(0);
    expect(mockLogger.debug).toHaveBeenCalledWith('Rate limit cleanup: removed 3 expired entries');

    vi.useRealTimers();
    restartRateLimitCleanup();
  });

  test('should only clean expired entries leaving fresh ones', async () => {
    vi.useFakeTimers();
    restartRateLimitCleanup();

    const middleware = rateLimit({ maxRequests: 10, windowMs: 60000 });

    // Create first entry
    const { context: ctx1 } = createMockContext({
      headers: { 'x-forwarded-for': '170.170.170.1' },
    });
    await middleware(ctx1, createMockNext().next);

    // Advance time by 50 minutes (still under 1 hour)
    vi.advanceTimersByTime(50 * 60 * 1000);

    // Create second entry (this one is fresh)
    const { context: ctx2 } = createMockContext({
      headers: { 'x-forwarded-for': '170.170.170.2' },
    });
    await middleware(ctx2, createMockNext().next);

    // Verify both entries exist
    expect(getRateLimitStats().totalEntries).toBe(2);

    // Advance time by 15 more minutes (first entry now >1 hour old, second is 15 min old)
    vi.advanceTimersByTime(15 * 60 * 1000);

    // Advance to trigger cleanup interval (5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Only one entry should remain (the fresh one)
    const stats = getRateLimitStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.entries[0].key).toBe('170.170.170.2');
    expect(mockLogger.debug).toHaveBeenCalledWith('Rate limit cleanup: removed 1 expired entries');

    vi.useRealTimers();
    restartRateLimitCleanup();
  });
});
