/**
 * A2A Type Validation Helpers
 * Provides type-safe parsing and validation for A2A data structures
 */

import { z } from 'zod';
import { AgentCardSchema, SecuritySchemeSchema, type AgentCard, type AuthType } from './types.js';

// ============================================================================
// ZOD SCHEMAS FOR RUNTIME VALIDATION
// ============================================================================

/**
 * Schema for validating decrypted credentials
 */
export const CredentialsSchema = z.union([
  // API Key credentials
  z.object({
    apiKey: z.string(),
  }),
  // OAuth/OIDC credentials
  z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    idToken: z.string().optional(),
    tokenExpiresAt: z.string().optional(),
  }),
]);

/**
 * Schema for validating auth type
 */
export const AuthTypeSchema = z.enum(['NONE', 'API_KEY', 'OAUTH', 'OIDC']);

/**
 * Schema for security schemes record with minimal type checking for headers
 */
export const SecuritySchemesRecordSchema = z.record(z.string(), SecuritySchemeSchema);

/**
 * Minimal security scheme info for header building
 */
export const MinimalSecuritySchemeSchema = z.object({
  type: z.string(),
  in: z.string().optional(),
  name: z.string().optional(),
  scheme: z.string().optional(),
});

export const MinimalSecuritySchemesSchema = z.record(z.string(), MinimalSecuritySchemeSchema);

/**
 * Schema for JSON-RPC response validation
 */
export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

export type JsonRpcResponseParsed = z.infer<typeof JsonRpcResponseSchema>;

// ============================================================================
// TYPE-SAFE PARSING FUNCTIONS
// ============================================================================

/**
 * Helper for safe parsing that returns null on failure
 */
function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parses AgentCard from Prisma JSON, returning null if invalid
 */
export function tryParseAgentCard(data: unknown): AgentCard | null {
  return data ? safeParse(AgentCardSchema, data) : null;
}

/**
 * Parses decrypted credentials with type safety
 */
export function parseCredentials(data: unknown): Record<string, unknown> | null {
  return safeParse(CredentialsSchema, data);
}

/**
 * Validates and parses auth type from unknown data
 */
export function parseAuthType(data: unknown): AuthType | null {
  return safeParse(AuthTypeSchema, data);
}

/**
 * Validates and parses security schemes record for header building
 */
export function parseSecuritySchemesForHeaders(
  data: unknown,
): Record<string, { type: string; in?: string; name?: string; scheme?: string }> | undefined {
  return data ? (safeParse(MinimalSecuritySchemesSchema, data) ?? undefined) : undefined;
}

/**
 * Parses JSON-RPC response from fetch
 */
export function parseJsonRpcResponse(data: unknown): JsonRpcResponseParsed | null {
  return safeParse(JsonRpcResponseSchema, data);
}

/**
 * Type guard for checking if a value is a plain object (Record<string, unknown>)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely extracts params as Record, returning empty object if invalid
 */
export function extractParams(params: unknown): Record<string, unknown> {
  return isPlainObject(params) ? params : {};
}

// ============================================================================
// PRISMA JSON HELPERS
// ============================================================================

/**
 * Type-safe helper for storing validated AgentCard to Prisma JSON field
 * Validates data against schema before returning for Prisma storage
 * Returns the data as unknown for Prisma.InputJsonValue compatibility
 *
 * @example
 * agentCardCache: agentCardToPrismaJson(card)
 */
export function agentCardToPrismaJson(card: AgentCard): unknown {
  // Validate the card matches the schema (throws if invalid)
  AgentCardSchema.parse(card);
  // Return as unknown for Prisma JSON compatibility
  return card;
}

/**
 * Type-safe helper for reading Prisma JSON field as AgentCard
 * Validates and returns typed data or null
 *
 * @example
 * const card = agentCardFromPrismaJson(agent.agentCardCache);
 */
export function agentCardFromPrismaJson(data: unknown): AgentCard | null {
  return tryParseAgentCard(data);
}
