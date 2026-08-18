/**
 * Zod schemas and type-safe accessors for webhook verbose enrichment data
 *
 * These helpers safely extract typed data from the webhook payload's
 * `data: Record<string, unknown>` field without using unsafe 'as' casts.
 */

import { z } from 'zod';

// ============================================================================
// Schema Definitions
// ============================================================================

/** Resolved matcher info for policy events */
export const resolvedMatcherSchema = z.object({
  raw: z.string(),
  type: z.string(),
  targetName: z.string().nullable(),
  affectedCount: z.number(),
});
export type ResolvedMatcher = z.infer<typeof resolvedMatcherSchema>;

/** Policy info for tool invocation events */
export const policyInfoSchema = z.object({
  slug: z.string(),
  effect: z.string(),
});
export type PolicyInfo = z.infer<typeof policyInfoSchema>;

/** Resolved tool pattern info */
export const resolvedToolPatternSchema = z.object({
  raw: z.string(),
  serverName: z.string().nullable(),
  isWildcard: z.boolean(),
  matchedToolCount: z.number(),
});
export type ResolvedToolPattern = z.infer<typeof resolvedToolPatternSchema>;

/** Impact metrics */
export const impactSchema = z.object({
  affectedUserCount: z.number().nullable().optional(),
  affectedAgentCount: z.number().nullable().optional(),
});
export type Impact = z.infer<typeof impactSchema>;

/** String array changes (added/removed) */
export const arrayChangesSchema = z.object({
  added: z.array(z.string()).optional(),
  removed: z.array(z.string()).optional(),
});
export type ArrayChanges = z.infer<typeof arrayChangesSchema>;

/** User context info */
const roleInfoSchema = z.object({ name: z.string() });
export const userContextSchema = z.object({
  email: z.string().optional(),
  roles: z.union([z.array(roleInfoSchema), z.array(z.string())]).optional(),
});
export type UserContext = z.infer<typeof userContextSchema>;

/** Flag configuration for sensitive events */
export const flagConfigSchema = z.object({
  toolPattern: z.string().optional(),
  description: z.string().nullable().optional(),
  behaviors: z.array(z.string()).optional(),
  rateLimit: z
    .object({
      maxPerSession: z.number().optional(),
      windowMinutes: z.number().optional(),
    })
    .nullable()
    .optional(),
  approvalConfig: z
    .object({
      allowedApprovers: z.array(z.string()).optional(),
      timeoutSeconds: z.number().optional(),
    })
    .nullable()
    .optional(),
});
export type FlagConfig = z.infer<typeof flagConfigSchema>;

/** Server context for tool invocations */
export const serverContextSchema = z.object({
  name: z.string().optional(),
  trusted: z.boolean().optional(),
});
export type ServerContext = z.infer<typeof serverContextSchema>;

/** Agent override info */
export const agentOverrideSchema = z.object({
  exempted: z.boolean().optional(),
  customBehaviors: z.array(z.string()).optional(),
});
export type AgentOverride = z.infer<typeof agentOverrideSchema>;

/** Requesting user info for approval events */
const roleWithAdminSchema = z.object({
  name: z.string(),
  isAdmin: z.boolean().optional(),
});
export const requestingUserSchema = z.object({
  email: z.string().optional(),
  roles: z.array(roleWithAdminSchema).optional(),
});
export type RequestingUser = z.infer<typeof requestingUserSchema>;

/** Rate limit context */
export const rateLimitContextSchema = z.object({
  currentUsage: z.number().optional(),
  remaining: z.number().optional(),
  resetAt: z.string().optional(),
});
export type RateLimitContext = z.infer<typeof rateLimitContextSchema>;

/** Rate limit config from Prisma JSON field */
export const rateLimitConfigSchema = z.object({
  maxPerSession: z.number().optional(),
  windowMinutes: z.number().optional(),
});
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;

/** Approval config from Prisma JSON field */
export const approvalConfigSchema = z.object({
  allowedApprovers: z.array(z.string()).optional(),
  timeoutSeconds: z.number().optional(),
});
export type ApprovalConfig = z.infer<typeof approvalConfigSchema>;

/** Policy state for diff before/after */
export const policyStateSchema = z.object({
  effect: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type PolicyState = z.infer<typeof policyStateSchema>;

/** Diff info for policy updates */
export const diffSchema = z.object({
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  changedFields: z.array(z.string()).optional(),
});
export type Diff = z.infer<typeof diffSchema>;

/** Diff with typed before/after for policy state */
export interface TypedDiff {
  before?: PolicyState;
  after?: PolicyState;
  changedFields?: string[];
}

/** Organization context for agent events */
export const organizationContextSchema = z.object({
  totalAgents: z.number().optional(),
  remainingAgents: z.number().optional(),
});
export type OrganizationContext = z.infer<typeof organizationContextSchema>;

// ============================================================================
// Type-Safe Accessor Functions
// ============================================================================

/**
 * Safely extract a string from data
 */
export function safeString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Safely extract a string array from data
 */
export function safeStringArray(data: Record<string, unknown>, key: string): string[] | undefined {
  const value = data[key];
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === 'string')) return undefined;
  return value;
}

/**
 * Safely extract an array of items from data using Zod schema
 */
function safeArrayExtract<T>(
  data: Record<string, unknown>,
  key: string,
  itemSchema: z.ZodType<T>,
): T[] | undefined {
  const value = data[key];
  if (!value || !Array.isArray(value)) return undefined;
  const result = z.array(itemSchema).safeParse(value);
  return result.success ? result.data : undefined;
}

/**
 * Safely extract an object from data using Zod schema
 */
function safeObjectExtract<T>(
  data: Record<string, unknown>,
  key: string,
  schema: z.ZodType<T>,
): T | undefined {
  const value = data[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/**
 * Safely parse a Prisma JSON value with a schema
 */
export function safePrismaJson<T>(value: unknown, schema: z.ZodType<T>): T | undefined {
  if (value === null || value === undefined) return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/**
 * Create an array accessor function for a specific key and schema
 */
function createArrayAccessor<T>(key: string, itemSchema: z.ZodType<T>) {
  return (data: Record<string, unknown>): T[] | undefined =>
    safeArrayExtract(data, key, itemSchema);
}

/**
 * Create an object accessor function for a specific key and schema
 */
function createObjectAccessor<T>(key: string, schema: z.ZodType<T>) {
  return (data: Record<string, unknown>): T | undefined => safeObjectExtract(data, key, schema);
}

// Array accessors
export const getResolvedMatchers = createArrayAccessor('resolvedMatchers', resolvedMatcherSchema);
export const getMatchedPolicies = createArrayAccessor('matchedPolicies', policyInfoSchema);
export const getResolvedToolPatterns = createArrayAccessor(
  'resolvedToolPatterns',
  resolvedToolPatternSchema,
);
export const getApplicablePolicies = createArrayAccessor('applicablePolicies', policyInfoSchema);
export const getAffectedPolicies = createArrayAccessor('affectedPolicies', policyInfoSchema);

// Object accessors
export const getImpact = createObjectAccessor('impact', impactSchema);
export const getMatcherChanges = createObjectAccessor('matcherChanges', arrayChangesSchema);
export const getToolPatternChanges = createObjectAccessor('toolPatternChanges', arrayChangesSchema);
export const getUserContext = createObjectAccessor('userContext', userContextSchema);
export const getFlagConfig = createObjectAccessor('flagConfig', flagConfigSchema);
export const getServerContext = createObjectAccessor('serverContext', serverContextSchema);
export const getAgentOverride = createObjectAccessor('agentOverride', agentOverrideSchema);
export const getRequestingUser = createObjectAccessor('requestingUser', requestingUserSchema);
export const getRateLimitContext = createObjectAccessor('rateLimitContext', rateLimitContextSchema);
export const getDiff = createObjectAccessor('diff', diffSchema);

// Typed diff with policy state before/after
export function getTypedDiff(data: Record<string, unknown>): TypedDiff | undefined {
  const diff = getDiff(data);
  if (!diff) return undefined;

  const typedDiff: TypedDiff = {
    changedFields: diff.changedFields,
  };

  if (diff.before) {
    const beforeResult = policyStateSchema.safeParse(diff.before);
    if (beforeResult.success) {
      typedDiff.before = beforeResult.data;
    }
  }

  if (diff.after) {
    const afterResult = policyStateSchema.safeParse(diff.after);
    if (afterResult.success) {
      typedDiff.after = afterResult.data;
    }
  }

  return typedDiff;
}

// Organization context
export function getOrganizationContext(
  data: Record<string, unknown>,
): OrganizationContext | undefined {
  return safeObjectExtract(data, 'organizationContext', organizationContextSchema);
}
