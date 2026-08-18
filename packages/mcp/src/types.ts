// Re-export types from shared package for consistency
import type { JsonObject, JsonValue, PolicyEvaluationTree, UserContext } from '@sentinel/shared';
export type { JsonArray, JsonPrimitive } from '@sentinel/shared';
export type { JsonObject, JsonValue, PolicyEvaluationTree, UserContext };

function isJsonPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Converts an unknown value to a JsonValue.
 * - Primitives (string, number, boolean) pass through
 * - Arrays are recursively converted
 * - Objects are recursively converted
 * - null, undefined, and other types become their string representation
 */
function toJsonValue(value: unknown): JsonValue {
  if (isJsonPrimitive(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    const result: JsonObject = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = toJsonValue(v);
    }
    return result;
  }
  return String(value);
}

/**
 * Converts a Record<string, unknown> to Record<string, JsonValue>.
 */
export function toJsonRecord(record: Record<string, unknown>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = toJsonValue(value);
  }
  return result;
}

export interface PolicyResult {
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  justification?: string;
  policyIds: string[];
  matchedPolicyIds?: string[];
  policySnapshot?: JsonObject[];
  userEmail?: string | null;
  userRoles?: string[];
  agentName?: string | null;
  /** Present when decision is PENDING_APPROVAL */
  approvalRequestId?: string;
  /** Full evaluation tree for audit log visualization */
  evaluationTree?: PolicyEvaluationTree;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  trusted: boolean;
  authType: 'NONE' | 'OAUTH' | 'API_KEY';
  // Transport configuration
  transportType?: 'HTTP' | 'STDIO' | 'SSE' | 'WEBSOCKET';
  stdioCommand?: string | null;
  stdioArgs?: string[] | null;
  stdioWorkingDir?: string | null;
  stdioEnv?: string | null;
  wsReconnectMs?: number | null;
  wsMaxRetries?: number | null;
  wsHeartbeatMs?: number | null;
}

export interface UserMcpConfig {
  credentials?: Record<string, unknown>;
}

export interface AuditLogEntry {
  organizationId: string;
  userId?: string;
  agentId?: string;
  workspaceId?: string;
  toolName: string;
  parameters: Record<string, JsonValue>;
  decision: string;
  justification?: string;
  policyIds: string[];
  matchedPolicyIds?: string[];
  policySnapshot?: JsonObject[];
  userEmail?: string | null;
  userRoles?: string[];
  agentName?: string | null;
  // Live approval tracking
  approvalRequired?: boolean;
  approvalRequestId?: string;
  approvalStatus?: string;
  approvalDecidedBy?: string;
  approvalDecidedByEmail?: string;
  approvalDecidedAt?: string; // ISO string
  // Evaluation tree for audit visualization
  evaluationTree?: PolicyEvaluationTree;
}

export interface AuthenticationRequiredError {
  error: 'AUTHENTICATION_REQUIRED';
  message: string;
  authType: 'OAUTH' | 'API_KEY';
  mcpServerId: string;
  mcpServerName: string;
  authUrl?: string;
}
