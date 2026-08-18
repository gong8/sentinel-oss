/**
 * Shared tRPC error throwing helpers
 * These functions provide consistent error handling across all routers
 */

import { TRPCError } from '@trpc/server';

/**
 * Throws a NOT_FOUND TRPCError
 */
export function throwNotFound(message: string): never {
  throw new TRPCError({ code: 'NOT_FOUND', message });
}

/**
 * Throws a BAD_REQUEST TRPCError
 */
export function throwBadRequest(message: string): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

/**
 * Throws a CONFLICT TRPCError
 */
export function throwConflict(message: string): never {
  throw new TRPCError({ code: 'CONFLICT', message });
}

/**
 * Throws a FORBIDDEN TRPCError
 */
export function throwForbidden(message: string): never {
  throw new TRPCError({ code: 'FORBIDDEN', message });
}

/**
 * Throws an UNAUTHORIZED TRPCError
 */
export function throwUnauthorized(message: string): never {
  throw new TRPCError({ code: 'UNAUTHORIZED', message });
}
