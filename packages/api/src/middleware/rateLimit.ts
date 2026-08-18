/**
 * Rate Limiting Middleware
 *
 * In-memory rate limiting for protecting auth endpoints and preventing brute-force attacks.
 * Uses a sliding window algorithm with automatic cleanup of expired entries.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { logger } from '../lib/logger.js';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Custom key extractor (defaults to IP address) */
  keyExtractor?: (c: Context) => string;
  /** Whether to skip rate limiting in test environment */
  skipInTest?: boolean;
}

// In-memory store for rate limit tracking
// In production with multiple instances, use Redis instead
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of rateLimitStore.entries()) {
      // Remove entries older than their window
      if (now - entry.windowStart > 60 * 60 * 1000) {
        // 1 hour max retention
        rateLimitStore.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Rate limit cleanup: removed ${cleaned} expired entries`);
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start cleanup on module load
startCleanupInterval();

/**
 * Extract client IP from request
 * Handles common proxy headers and Node.js socket
 */
function getClientIP(c: Context): string {
  // Check common proxy headers
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = c.req.header('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Try to get IP from Node.js socket (works with @hono/node-server)
  try {
    const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } };
    const remoteAddress = env?.incoming?.socket?.remoteAddress;
    if (remoteAddress) {
      // Handle IPv6-mapped IPv4 addresses (::ffff:127.0.0.1 -> 127.0.0.1)
      return remoteAddress.replace(/^::ffff:/, '');
    }
  } catch {
    // Ignore errors accessing socket
  }

  // Fallback
  return 'unknown';
}

/**
 * Create a rate limiting middleware
 *
 * @example
 * // Limit to 10 requests per minute
 * app.use('/api/auth/*', rateLimit({ maxRequests: 10, windowMs: 60000 }))
 */
export function rateLimit(config: RateLimitConfig): MiddlewareHandler {
  const { maxRequests, windowMs, keyExtractor, skipInTest = true } = config;

  return async (c, next) => {
    // Skip in test environment if configured
    if (skipInTest && process.env.NODE_ENV === 'test') {
      return next();
    }

    const key = keyExtractor ? keyExtractor(c) : getClientIP(c);
    const now = Date.now();

    // Get or create entry
    let entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      // New window
      entry = { count: 1, windowStart: now };
      rateLimitStore.set(key, entry);
    } else {
      // Increment existing window
      entry.count++;
    }

    // Calculate remaining requests
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetTime = Math.ceil((entry.windowStart + windowMs - now) / 1000);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetTime));

    // Check if rate limited
    if (entry.count > maxRequests) {
      logger.warn('Rate limit exceeded', {
        ip: key,
        path: c.req.path,
        count: entry.count,
        limit: maxRequests,
      });

      c.header('Retry-After', String(resetTime));

      return c.json(
        {
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
          retryAfter: resetTime,
        },
        429,
      );
    }

    return next();
  };
}

/**
 * Pre-configured rate limiter for authentication endpoints
 * Limits to prevent brute-force attacks on tokens
 *
 * - 2000 requests per minute per IP
 */
export const authRateLimit = rateLimit({
  maxRequests: 2000,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Pre-configured rate limiter for general API endpoints
 * More generous limits for normal API usage
 *
 * - 10000 requests per minute per IP
 */
export const apiRateLimit = rateLimit({
  maxRequests: 10000,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Stricter rate limiter for sensitive operations
 * Use for password reset, account creation, etc.
 *
 * - 500 requests per minute per IP
 */
export const strictRateLimit = rateLimit({
  maxRequests: 500,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Get current rate limit stats (for monitoring)
 */
export function getRateLimitStats(): {
  totalEntries: number;
  entries: Array<{ key: string; count: number; windowStart: number }>;
} {
  const entries: Array<{ key: string; count: number; windowStart: number }> = [];

  for (const [key, entry] of rateLimitStore.entries()) {
    entries.push({
      key,
      count: entry.count,
      windowStart: entry.windowStart,
    });
  }

  return {
    totalEntries: rateLimitStore.size,
    entries,
  };
}

/**
 * Clear rate limit store (for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Stop the cleanup interval (for graceful shutdown)
 */
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Restart the cleanup interval (for testing)
 */
export function restartRateLimitCleanup(): void {
  stopRateLimitCleanup();
  startCleanupInterval();
}
