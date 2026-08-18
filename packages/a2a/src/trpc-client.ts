/**
 * A2A tRPC Client
 *
 * This client communicates with the Sentinel API for A2A proxy operations.
 * Uses fetch directly to call tRPC endpoints with Zod validation for type safety,
 * avoiding the cyclic dependency that would result from importing @sentinel/api.
 */

import { z } from 'zod';

// Validate API_URL configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const isProduction = process.env.NODE_ENV === 'production';
const isLocalhost = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');

if (isProduction && isLocalhost) {
  console.error(
    '[A2A] CRITICAL: API_URL is set to localhost in production mode. ' +
      'Set API_URL environment variable to your production API URL.',
  );
}

const PROXY_API_KEY = process.env.PROXY_API_KEY;

// ============================================================================
// ZOD SCHEMAS FOR API RESPONSES
// These provide runtime type validation without importing from @sentinel/api.
// ============================================================================

const ValidateTokenResultSchema = z.object({
  valid: z.boolean(),
  userId: z.string(),
  email: z.string(),
  organizationId: z.string(),
  roles: z.array(z.string()).optional(),
  isAdmin: z.boolean().optional(),
  isOrgOwner: z.boolean().optional(),
  workspaceIds: z.array(z.string()).optional(),
  adminWorkspaceIds: z.array(z.string()).optional(),
});

const GetA2AAgentResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    endpointUrl: z.string().nullable(),
    agentCardCache: z.unknown(),
    agentCardFetchedAt: z.union([z.string(), z.date()]).nullable(),
    cardSource: z.string(),
    agentCardUrl: z.string().nullable(),
    workspaceId: z.string().nullable(),
  })
  .nullable();

const GetA2ACredentialsResultSchema = z
  .object({
    authType: z.string(),
    credentials: z.string(),
  })
  .nullable();

const LogA2AAuditEntryResultSchema = z.object({
  success: z.boolean(),
});

const RefreshA2AAgentCardResultSchema = z.object({
  success: z.boolean(),
  card: z.unknown().optional(),
  error: z.string().optional(),
});

const EvaluatePolicyResultSchema = z.object({
  decision: z.enum(['ALLOWED', 'DENIED', 'PENDING_APPROVAL']),
  justification: z.string().nullable().optional(),
  policyIds: z.array(z.string()),
  matchedPolicyIds: z.array(z.string()).optional(),
  policySnapshot: z.unknown().optional(),
  userEmail: z.string().optional(),
  userRoles: z.array(z.string()).optional(),
  agentName: z.string().nullable().optional(),
  /** Present when decision is PENDING_APPROVAL */
  approvalRequestId: z.string().nullable().optional(),
});

const ApprovalDetailsSchema = z.object({
  approvalRequired: z.boolean(),
  approvalRequestId: z.string().nullable().optional(),
  approvalStatus: z.string().nullable().optional(),
  approvalDecidedBy: z.string().nullable().optional(),
  approvalDecidedByEmail: z.string().nullable().optional(),
  approvalDecidedAt: z.string().nullable().optional(),
});

const EvaluateSensitiveFlagsResultSchema = z.object({
  proceed: z.boolean(),
  blockReason: z.string().nullable().optional(),
  approvalRequestId: z.string().nullable().optional(),
  enhancedAuditData: z.record(z.string(), z.unknown()).optional(),
  matchedFlagIds: z.array(z.string()).optional(),
  alertsSent: z.array(z.string()).optional(),
  approvalDetails: ApprovalDetailsSchema.nullable().optional(),
});

const PollApprovalStatusDetailsSchema = z.object({
  decidedBy: z.string().optional(),
  decidedByEmail: z.string().optional(),
  decidedAt: z.string().optional(),
});

const PollApprovalStatusResultSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED', 'NOT_FOUND']),
  approved: z.boolean(),
  shouldPoll: z.boolean(),
  remainingMs: z.number().optional(),
  expiresAt: z.string().optional(),
  details: PollApprovalStatusDetailsSchema.optional(),
});

// ============================================================================
// EXPORTED TYPES (inferred from Zod schemas)
// ============================================================================

export type ValidateTokenResult = z.infer<typeof ValidateTokenResultSchema>;
export type GetA2AAgentResult = z.infer<typeof GetA2AAgentResultSchema>;
export type GetA2ACredentialsResult = z.infer<typeof GetA2ACredentialsResultSchema>;
export type RefreshA2AAgentCardResult = z.infer<typeof RefreshA2AAgentCardResultSchema>;
export type EvaluatePolicyResult = z.infer<typeof EvaluatePolicyResultSchema>;
export type ApprovalDetailsResult = z.infer<typeof ApprovalDetailsSchema>;
export type EvaluateSensitiveFlagsResult = z.infer<typeof EvaluateSensitiveFlagsResultSchema>;
export type PollApprovalStatusResult = z.infer<typeof PollApprovalStatusResultSchema>;

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface ValidateTokenInput {
  accessToken: string;
}

export interface GetA2AAgentInput {
  organizationId: string;
  agentId: string;
}

export interface GetA2ACredentialsInput {
  organizationId: string;
  agentId: string;
}

export interface LogA2AAuditEntryInput {
  organizationId: string;
  agentId: string;
  skillId?: string;
  userId?: string;
  workspaceId?: string | null;
  request: unknown;
  response?: unknown;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface RefreshA2AAgentCardInput {
  organizationId: string;
  agentId: string;
}

export interface EvaluatePolicyInput {
  userId: string;
  agentId: string | null;
  /** User ID the agent is acting on behalf of (for delegation) */
  delegatedUserId?: string | null;
  /** Workspace ID for workspace-scoped policy filtering */
  workspaceId?: string | null;
  toolName: string;
  parameters: Record<string, unknown>;
  /** Session ID for approval requests */
  sessionId?: string;
  a2aContext?: {
    a2aAgentId?: string;
    a2aProvider?: string;
    a2aSkillId?: string;
  } | null;
}

export interface EvaluateSensitiveFlagsInput {
  organizationId: string;
  sessionId: string;
  userId: string;
  agentId: string | null;
  /** Workspace ID for workspace-scoped flag filtering */
  workspaceId?: string | null;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface PollApprovalStatusInput {
  organizationId: string;
  requestId: string;
  pollTimeoutMs?: number;
}

// ============================================================================
// TRPC HTTP CLIENT HELPERS
// Call tRPC endpoints directly via fetch for type-safe operations.
// ============================================================================

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (PROXY_API_KEY) {
    headers['x-proxy-key'] = PROXY_API_KEY;
  }
  return headers;
}

const TRPCResultSchema = z.object({
  result: z.object({
    data: z.unknown(),
  }),
});

const TRPCBatchResultSchema = z.array(TRPCResultSchema);

async function trpcCall<T>(
  procedure: string,
  input: unknown,
  schema: z.ZodType<T>,
  method: 'GET' | 'POST',
): Promise<T> {
  const isQuery = method === 'GET';
  const encodedInput = encodeURIComponent(JSON.stringify(input));
  const url = isQuery
    ? `${API_URL}/trpc/${procedure}?batch=1&input=${encodedInput}`
    : `${API_URL}/trpc/${procedure}?batch=1`;

  const response = await fetch(url, {
    method,
    headers: getHeaders(),
    body: isQuery ? undefined : JSON.stringify(input),
  });

  if (!response.ok) {
    const type = isQuery ? 'query' : 'mutation';
    throw new Error(`tRPC ${type} failed: ${response.status} ${response.statusText}`);
  }

  const json: unknown = await response.json();
  const parsed = TRPCBatchResultSchema.parse(json);

  if (parsed.length === 0 || !parsed[0]) {
    throw new Error('Empty tRPC batch response');
  }

  return schema.parse(parsed[0].result.data);
}

function trpcQuery<T>(procedure: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  return trpcCall(procedure, input, schema, 'GET');
}

function trpcMutation<T>(procedure: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  return trpcCall(procedure, input, schema, 'POST');
}

// ============================================================================
// TYPED API FUNCTIONS
// These provide type-safe access to tRPC routes with Zod validation.
// ============================================================================

/**
 * Validate an access token
 */
export async function validateToken(input: ValidateTokenInput): Promise<ValidateTokenResult> {
  return trpcMutation('auth.validateToken', input, ValidateTokenResultSchema);
}

/**
 * Get A2A agent details
 */
export async function getA2AAgentQuery(input: GetA2AAgentInput): Promise<GetA2AAgentResult> {
  return trpcQuery('proxy.getA2AAgent', input, GetA2AAgentResultSchema);
}

/**
 * Get A2A credentials
 */
export async function getA2ACredentialsQuery(
  input: GetA2ACredentialsInput,
): Promise<GetA2ACredentialsResult> {
  return trpcQuery('proxy.getA2ACredentials', input, GetA2ACredentialsResultSchema);
}

/**
 * Log A2A audit entry
 */
export async function logA2AAuditEntryMutation(
  input: LogA2AAuditEntryInput,
): Promise<{ success: boolean }> {
  return trpcMutation('proxy.logA2AAuditEntry', input, LogA2AAuditEntryResultSchema);
}

/**
 * Refresh A2A agent card
 */
export async function refreshA2AAgentCardMutation(
  input: RefreshA2AAgentCardInput,
): Promise<RefreshA2AAgentCardResult> {
  return trpcMutation('proxy.refreshA2AAgentCard', input, RefreshA2AAgentCardResultSchema);
}

/**
 * Evaluate policy
 */
export async function evaluatePolicyMutation(
  input: EvaluatePolicyInput,
): Promise<EvaluatePolicyResult> {
  return trpcMutation('proxy.evaluatePolicy', input, EvaluatePolicyResultSchema);
}

/**
 * Evaluate sensitive flags
 */
export async function evaluateSensitiveFlagsMutation(
  input: EvaluateSensitiveFlagsInput,
): Promise<EvaluateSensitiveFlagsResult> {
  return trpcMutation('proxy.evaluateSensitiveFlags', input, EvaluateSensitiveFlagsResultSchema);
}

/**
 * Poll for approval status
 */
export async function pollApprovalStatusMutation(
  input: PollApprovalStatusInput,
): Promise<PollApprovalStatusResult> {
  return trpcMutation('proxy.pollApprovalStatus', input, PollApprovalStatusResultSchema);
}
