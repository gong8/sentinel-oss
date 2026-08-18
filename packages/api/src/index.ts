/**
 * SENTINEL API Server
 * Main entry point for the Hono + tRPC API server
 */

import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { PermissionRequestStatus, PermissionRequestType } from '@sentinel/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { startAuditLogCleanupInterval } from './jobs/auditLogCleanup.js';
import { startSessionCleanupInterval } from './jobs/sessionCleanup.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { authRateLimit, stopRateLimitCleanup } from './middleware/rateLimit.js';
import {
  getHealthStatusCode,
  livenessCheck,
  performHealthCheck,
  readinessCheck,
} from './services/health.js';
import { discoverTools } from './services/mcp.js';
import { getMetrics, getMetricsContentType } from './services/metrics.js';
import { handleOAuthCallback } from './services/oauth.js';
import { retryFailedDeliveries } from './services/webhook.js';
import { createContext } from './trpc/context.js';
import { appRouter } from './trpc/router.js';

// ============================================================================
// Production Configuration Validation
// ============================================================================
const isProduction = process.env.NODE_ENV === 'production';

function validateProductionConfig(): void {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const apiUrl = process.env.API_URL;

  const frontendIsLocalhost =
    frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1');
  const apiIsLocalhost = !apiUrl || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');

  if (isProduction) {
    if (frontendIsLocalhost) {
      logger.warn(
        'FRONTEND_URL is set to localhost in production. CORS will only allow localhost origins.',
        { frontendUrl },
      );
    }
    if (apiIsLocalhost) {
      logger.warn('API_URL is not set or uses localhost in production. OAuth callbacks may fail.', {
        apiUrl: apiUrl || '(not set)',
      });
    }
  }
}

validateProductionConfig();

const app = new Hono();

// Middleware
app.use('*', honoLogger());
app.use('*', metricsMiddleware);
app.use(
  '*',
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);

// Health check endpoints
app.get('/health', async (c) => {
  const health = await performHealthCheck();
  return c.json(health, getHealthStatusCode(health.status));
});

// Kubernetes-style liveness probe (fast, no dependencies)
app.get('/health/live', (c) => {
  return c.json(livenessCheck());
});

// Kubernetes-style readiness probe (checks if ready to accept traffic)
app.get('/health/ready', async (c) => {
  const result = await readinessCheck();
  return c.json(result, result.ready ? 200 : 503);
});

// Prometheus metrics endpoint
app.get('/metrics', async (c) => {
  const metrics = await getMetrics();
  return c.text(metrics, 200, {
    'Content-Type': getMetricsContentType(),
  });
});

// tRPC endpoint with rate limiting
// Rate limit protects against brute-force token guessing and API abuse
app.use('/trpc/*', authRateLimit);
app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext: async (_opts, c) => createContext({ req: c }),
  }),
);

// OAuth callback endpoint
// Handles the OAuth authorization code callback from upstream MCP servers
app.get('/api/oauth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  const webUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Handle error from OAuth provider
  if (error) {
    logger.warn('OAuth error from provider', { error, errorDescription });
    const errorMsg = encodeURIComponent(String(errorDescription || error));
    return c.redirect(`${webUrl}/oauth/result?status=error&error=${errorMsg}`);
  }

  // Validate required parameters
  if (!code || !state) {
    logger.warn('OAuth callback missing required parameters');
    return c.redirect(`${webUrl}/oauth/result?status=error&error=missing_parameters`);
  }

  try {
    // Exchange code for tokens and store them
    const result = await handleOAuthCallback(String(code), String(state));

    logger.info('OAuth callback successful', {
      mcpServerId: result.mcpServerId,
      serverName: result.serverName,
    });

    // Automatically discover tools after successful OAuth connection
    // Await this so tools are available when user returns to the MCP server tab
    let toolsDiscovered: number | undefined;
    let discoveryError: string | undefined;

    try {
      const discovery = await discoverTools(
        result.organizationId,
        result.mcpServerId,
        result.userId,
        result.workspaceId,
      );
      if (discovery.success) {
        toolsDiscovered = discovery.toolsDiscovered;
        logger.info('Auto tool discovery after OAuth completed', {
          mcpServerId: result.mcpServerId,
          toolsDiscovered: discovery.toolsDiscovered,
        });

        // Update any pending TOOL_ACCESS requests that were created with this mcpServerId
        // but without tools (because tool discovery was deferred until after OAuth)
        try {
          // Get the MCP server to build fully qualified tool names
          const mcpServer = await prisma.mcpServer.findUnique({
            where: { id: result.mcpServerId },
            select: { url: true },
          });

          if (mcpServer) {
            // Get discovered tools
            const discoveredTools = await prisma.mcpTool.findMany({
              where: { mcpServerId: result.mcpServerId },
              select: { name: true },
            });

            // Build fully qualified tool names (domain::toolName)
            const url = new URL(mcpServer.url);
            const port = url.port ? `:${url.port}` : '';
            const domain = `${url.hostname}${port}`.toLowerCase();
            const toolNames = discoveredTools.map((t) => `${domain}::${t.name}`);

            // Find pending requests with this mcpServerId and empty toolNames
            const pendingRequests = await prisma.permissionRequest.findMany({
              where: {
                type: PermissionRequestType.TOOL_ACCESS,
                status: PermissionRequestStatus.PENDING,
                toolNames: { isEmpty: true },
              },
            });

            // Filter to those with matching mcpServerId in data
            const matchingRequests = pendingRequests.filter((req) => {
              const data = req.data;
              if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
              const requestData = data as Record<string, unknown>;
              return requestData.mcpServerId === result.mcpServerId;
            });

            // Update each matching request with the discovered tool names
            for (const req of matchingRequests) {
              await prisma.permissionRequest.update({
                where: { id: req.id },
                data: { toolNames },
              });
              logger.info('Updated chained TOOL_ACCESS request with discovered tools', {
                requestId: req.id,
                mcpServerId: result.mcpServerId,
                toolCount: toolNames.length,
              });
            }
          }
        } catch (updateErr) {
          // Don't fail OAuth flow if request update fails
          logger.error('Failed to update pending TOOL_ACCESS requests after OAuth', {
            mcpServerId: result.mcpServerId,
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          });
        }
      } else {
        discoveryError = discovery.error;
        logger.warn('Auto tool discovery after OAuth failed', {
          mcpServerId: result.mcpServerId,
          error: discovery.error,
        });
      }
    } catch (err) {
      // Tool discovery failure should not fail the OAuth flow
      discoveryError = err instanceof Error ? err.message : String(err);
      logger.error('Auto tool discovery after OAuth error', {
        mcpServerId: result.mcpServerId,
        error: discoveryError,
      });
    }

    // Redirect to success page with discovery results
    const serverName = encodeURIComponent(result.serverName);
    let redirectUrl = `${webUrl}/oauth/result?status=success&server=${serverName}`;
    if (toolsDiscovered !== undefined) {
      redirectUrl += `&toolsDiscovered=${toolsDiscovered}`;
    }
    if (discoveryError) {
      redirectUrl += `&discoveryError=${encodeURIComponent(discoveryError)}`;
    }
    return c.redirect(redirectUrl);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('OAuth callback failed', { error: errorMessage });

    // Don't expose internal error details to user
    const userError = errorMessage.includes('expired')
      ? 'Session expired. Please try again.'
      : errorMessage.includes('state')
        ? 'Invalid session state. Please try again.'
        : 'Authentication failed. Please check the logs.';

    const encodedError = encodeURIComponent(userError);
    return c.redirect(`${webUrl}/oauth/result?status=error&error=${encodedError}`);
  }
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  logger.error('Server error:', err);
  return c.json(
    {
      error: 'Internal server error',
      message: 'An unexpected error occurred',
    },
    500,
  );
});

// Start server
const port = parseInt(process.env.PORT || '3000');

async function startServer(): Promise<void> {
  logger.startup('SENTINEL API Server starting...');

  logger.info(`Database: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`, undefined, {
    emoji: '🗃️',
  });
  logger.info(`Server listening on port ${port}`, undefined, { emoji: '📡' });
  if (process.env.API_URL) {
    logger.info(`External API URL: ${process.env.API_URL}`, undefined, { emoji: '🌐' });
  }
  logger.info(`CORS origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`, undefined, {
    emoji: '🔗',
  });
  logger.health(`Health check: http://localhost:${port}/health`);

  serve({
    fetch: app.fetch,
    port,
  });
}

startServer().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});

// ============================================================================
// Background Workers
// ============================================================================

/**
 * Session Cleanup Worker
 * Periodically cleans up expired sessions and context entries.
 * Runs every hour by default.
 */
let sessionCleanupInterval: ReturnType<typeof setInterval> | null = null;

// Start session cleanup worker (runs every hour)
sessionCleanupInterval = startSessionCleanupInterval();
logger.info('Session cleanup worker started (interval: 60m)', undefined, { emoji: '🧹' });

/**
 * Audit Log Cleanup Worker
 * Periodically cleans up old audit log entries based on per-org retention settings.
 * Runs every 24 hours by default.
 */
let auditLogCleanupInterval: ReturnType<typeof setInterval> | null = null;

// Start audit log cleanup worker (runs every 24 hours)
auditLogCleanupInterval = startAuditLogCleanupInterval();
logger.info('Audit log cleanup worker started (interval: 24h)', undefined, { emoji: '🗑️' });

/**
 * Webhook Retry Worker
 * Periodically retries failed webhook deliveries based on their nextRetryAt timestamp.
 * Runs every 30 seconds to process deliveries due for retry.
 */
const WEBHOOK_RETRY_INTERVAL_MS = 30_000; // 30 seconds

let webhookRetryInterval: ReturnType<typeof setInterval> | null = null;

async function runWebhookRetryWorker(): Promise<void> {
  try {
    const retriedCount = await retryFailedDeliveries();
    if (retriedCount > 0) {
      logger.info(`Webhook retry worker: retried ${retriedCount} deliveries`, undefined, {
        emoji: '🔄',
      });
    }
  } catch (error) {
    logger.error('Webhook retry worker error:', error);
  }
}

// Start webhook retry worker
webhookRetryInterval = setInterval(runWebhookRetryWorker, WEBHOOK_RETRY_INTERVAL_MS);

// Run immediately on startup to process any pending retries
runWebhookRetryWorker().catch((err) => {
  logger.error('Initial webhook retry worker run failed:', err);
});

logger.info(
  `Webhook retry worker started (interval: ${WEBHOOK_RETRY_INTERVAL_MS / 1000}s)`,
  undefined,
  {
    emoji: '⏰',
  },
);

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received, shutting down gracefully...`);

  // Stop all background workers
  if (webhookRetryInterval) {
    clearInterval(webhookRetryInterval);
    webhookRetryInterval = null;
  }
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
    sessionCleanupInterval = null;
  }
  if (auditLogCleanupInterval) {
    clearInterval(auditLogCleanupInterval);
    auditLogCleanupInterval = null;
  }

  // Stop rate limit cleanup
  stopRateLimitCleanup();

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
