/**
 * Metrics Middleware
 * Collects HTTP request metrics for Prometheus
 */

import type { Context, Next } from 'hono';
import { httpRequestDuration, httpRequestsTotal } from '../services/metrics.js';

/**
 * Normalize path for metrics to avoid high cardinality
 * Replaces dynamic segments with placeholders
 */
function normalizePath(path: string): string {
  // Remove query string
  const basePath = path.split('?')[0];

  // Replace common patterns with placeholders
  return (
    basePath
      // Replace UUIDs and CUIDs
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, ':id')
      .replace(/c[a-z0-9]{24,}/g, ':id')
      // Replace numeric IDs
      .replace(/\/\d+(?=\/|$)/g, '/:id')
      // Normalize tRPC paths
      .replace(/\/trpc\/(.+?)($|\?)/, '/trpc/:procedure')
  );
}

/**
 * Middleware to collect HTTP request metrics
 */
export async function metricsMiddleware(c: Context, next: Next): Promise<void> {
  // Skip metrics endpoint to avoid recursion
  if (c.req.path === '/metrics') {
    await next();
    return;
  }

  const start = performance.now();
  const method = c.req.method;
  const path = normalizePath(c.req.path);

  try {
    await next();
  } finally {
    const duration = (performance.now() - start) / 1000; // Convert to seconds
    const status = String(c.res.status);

    // Record metrics
    httpRequestsTotal.inc({ method, path, status });
    httpRequestDuration.observe({ method, path, status }, duration);
  }
}
