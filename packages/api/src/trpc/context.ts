/**
 * tRPC Context
 * Defines the context available to all tRPC procedures
 */

import type { Context as HonoContext } from 'hono';
import { validateAccessToken, type AuthContext } from '../services/auth.js';

export interface TRPCContext extends Record<string, unknown> {
  auth: AuthContext | null;
  req: HonoContext;
}

function extractToken(req: HonoContext): string | null {
  const authHeader = req.req.header('authorization');
  return authHeader?.replace('Bearer ', '') ?? req.req.query('token') ?? null;
}

export async function createContext(opts: { req: HonoContext }): Promise<TRPCContext> {
  const token = extractToken(opts.req);
  const auth = token ? await validateAccessToken(token) : null;
  return { auth, req: opts.req };
}
