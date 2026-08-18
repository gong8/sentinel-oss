/**
 * tRPC Initialization
 * Sets up tRPC instance and base procedures with middleware
 */

import { prisma } from '@sentinel/db';
import { initTRPC, TRPCError } from '@trpc/server';
import { timingSafeEqual } from 'crypto';
import { logger } from '../lib/logger.js';
import { isAdmin, isOrgOwner } from '../services/auth.js';
import type { TRPCContext } from './context.js';

function timingSafeKeyEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter(opts) {
    const { shape, error } = opts;
    if (error.code !== 'UNAUTHORIZED') {
      logger.error('tRPC Error:', {
        code: error.code,
        message: error.message,
        path: opts.path,
        cause: error.cause,
        stack: error.stack,
      });
    }
    return shape;
  },
});

/**
 * Base router
 */
export const router = t.router;

/**
 * Public procedure - no authentication required
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.auth) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
    });
  }

  // Update last activity timestamp (fire and forget - don't block the request)
  prisma.user
    .update({
      where: { id: opts.ctx.auth.user.id },
      data: { lastActivityAt: new Date() },
    })
    .catch((err) => {
      logger.warn('Failed to update lastActivityAt', {
        error: err,
        userId: opts.ctx.auth?.user.id,
      });
    });

  return opts.next({
    ctx: {
      auth: opts.ctx.auth,
      req: opts.ctx.req,
    },
  });
});

/**
 * Admin procedure - requires ADMIN role
 */
export const adminProcedure = protectedProcedure.use(async (opts) => {
  if (!isAdmin(opts.ctx.auth)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }

  return opts.next();
});

/**
 * Proxy procedure - requires valid proxy API key
 * Used for service-to-service auth between MCP proxy and API
 */
export const proxyProcedure = t.procedure.use(async (opts) => {
  const proxyApiKey = process.env.PROXY_API_KEY;

  if (!proxyApiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'PROXY_API_KEY must be configured in production',
      });
    }
    logger.warn('PROXY_API_KEY not configured - proxy endpoints are unprotected');
    return opts.next();
  }

  const providedKey = opts.ctx.req.req.header('x-proxy-key');

  if (!providedKey || !timingSafeKeyEquals(providedKey, proxyApiKey)) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: providedKey ? 'Invalid proxy API key' : 'Proxy API key required',
    });
  }

  return opts.next();
});

/**
 * Org Owner procedure - requires organization owner status
 * Used for org-wide operations like managing workspaces and other org owners
 */
export const orgOwnerProcedure = adminProcedure.use(async (opts) => {
  if (!isOrgOwner(opts.ctx.auth)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Organization owner access required',
    });
  }

  return opts.next();
});

/**
 * Workspace Admin procedure - requires workspace admin or org owner status
 * Used for workspace management operations
 * Input must include workspaceId field
 */
export const workspaceAdminProcedure = adminProcedure.use(async (opts) => {
  // Org owners can always access
  if (isOrgOwner(opts.ctx.auth)) {
    return opts.next();
  }

  // Get workspaceId from raw input (before schema validation)
  // This is needed because middleware runs before .input() schema parsing
  const rawInput = (await opts.getRawInput()) as Record<string, unknown> | undefined;
  const workspaceId = rawInput?.workspaceId;

  if (typeof workspaceId !== 'string') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'workspaceId is required',
    });
  }

  // Check if user is workspace admin
  if (!opts.ctx.auth.adminWorkspaceIds.includes(workspaceId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Workspace admin access required',
    });
  }

  return opts.next();
});

/**
 * Workspace Member procedure - requires workspace membership or org owner status
 * Used for operations that any workspace member can perform
 * Input must include workspaceId field
 */
export const workspaceMemberProcedure = protectedProcedure.use(async (opts) => {
  // Org owners can always access
  if (isOrgOwner(opts.ctx.auth)) {
    return opts.next();
  }

  // Get workspaceId from raw input (before schema validation)
  // This is needed because middleware runs before .input() schema parsing
  const rawInput = (await opts.getRawInput()) as Record<string, unknown> | undefined;
  const workspaceId = rawInput?.workspaceId;

  if (typeof workspaceId !== 'string') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'workspaceId is required',
    });
  }

  // Check if user is workspace member
  if (!opts.ctx.auth.workspaceIds.includes(workspaceId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Workspace membership required',
    });
  }

  return opts.next();
});
