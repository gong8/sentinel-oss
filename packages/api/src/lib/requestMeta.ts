/**
 * Request Metadata Utilities
 */

import type { Context as HonoContext } from 'hono';

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

function getHeader(ctx: HonoContext, ...names: string[]): string | null {
  for (const name of names) {
    const value = ctx.req.header(name);
    if (value) return value;
  }
  return null;
}

/**
 * Extracts IP address and user agent from a Hono context
 */
export function getRequestMeta(ctx: HonoContext): RequestMeta {
  return {
    ipAddress: getHeader(ctx, 'x-forwarded-for', 'x-real-ip'),
    userAgent: getHeader(ctx, 'user-agent'),
  };
}

/**
 * Extracts request metadata from tRPC context
 */
export function getRequestMetaFromTrpc(ctx: { req: HonoContext }): RequestMeta {
  return getRequestMeta(ctx.req);
}
