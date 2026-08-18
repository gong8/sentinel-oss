/**
 * Shared Types
 *
 * Types used across multiple sentinel packages.
 * These types break circular dependencies by providing a single source of truth.
 */

import { z } from 'zod';

/**
 * JSON-compatible value types for API serialization.
 * JsonPrimitive excludes null for Prisma InputJsonValue compatibility.
 * Use JsonPrimitiveNullable/JsonValueNullable for output scenarios.
 */
export type JsonPrimitive = string | number | boolean;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * JSON value types that include null (for output/query scenarios)
 */
export type JsonPrimitiveNullable = JsonPrimitive | null;
export type JsonArrayNullable = JsonValueNullable[];
export type JsonObjectNullable = { [key: string]: JsonValueNullable };
export type JsonValueNullable = JsonPrimitiveNullable | JsonObjectNullable | JsonArrayNullable;

/**
 * Zod schema for JSON values (excludes null at top level for Prisma InputJsonValue)
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * Zod schema for JSON values that includes null
 */
export const jsonValueNullableSchema: z.ZodType<JsonValueNullable> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueNullableSchema),
    z.record(z.string(), jsonValueNullableSchema),
  ]),
);

/**
 * User context returned from token validation.
 * Used by MCP, A2A, and MCP-Admin packages.
 */
export interface UserContext {
  valid: boolean;
  userId: string;
  organizationId: string;
  email: string; // Required - matches API auth.validateToken response
  roles?: string[];
  isAdmin?: boolean;
  workspaceIds?: string[]; // User's workspace memberships
  adminWorkspaceIds?: string[]; // Workspaces where user has admin access
}

/**
 * Risk level for admin MCP operations.
 * Used by API and MCP-Admin packages.
 */
export type AdminMcpRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
