/**
 * Admin MCP Server Types
 */

// Re-export AdminMcpRiskLevel from shared package
export type { AdminMcpRiskLevel } from '@sentinel/shared';

export interface AdminContext {
  valid: boolean;
  userId: string;
  email: string;
  organizationId: string;
  isAdmin: boolean;
  roles: string[];
  adminWorkspaceIds: string[];
}

export interface AdminMcpAccessResult {
  accessible: boolean;
  reason: string | null;
  enabledScopes: string[];
  rateLimitPerMin?: number;
  confirmationTtlSeconds?: number;
}

export interface ConfirmationResult {
  success: boolean;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationId?: string;
  description?: string;
  riskLevel?: string;
  expiresAt?: string;
}

export interface ConfirmationStatusResult {
  found: boolean;
  status: string | null;
  result: unknown;
  error: string | null;
}
