/**
 * Evaluation Tree Types
 *
 * Types for representing the complete policy evaluation decision tree.
 * Used for rich audit log visualization showing exactly how each policy
 * condition was evaluated and why the final decision was made.
 */

import type { JsonValueNullable } from './types.js';

/**
 * Individual condition evaluation node.
 * Represents a single condition check (e.g., "context.hourOfDay between [9, 17]")
 */
export interface ConditionNode {
  type: 'condition';
  /** The field being evaluated (e.g., "context.hourOfDay", "params.tableName") */
  field: string;
  /** The operator used (e.g., "between", "equals", "contains") */
  operator: string;
  /** The expected/configured value (can be null if not found) */
  expectedValue: JsonValueNullable;
  /** The actual runtime value (can be null if not found) */
  actualValue: JsonValueNullable;
  /** Whether the condition passed */
  passed: boolean;
  /** Optional human-readable reason for the result */
  reason?: string;
}

/**
 * Boolean operator node (AND/OR).
 * Groups multiple conditions with boolean logic.
 */
export interface BooleanNode {
  type: 'AND' | 'OR';
  /** Child nodes (conditions or nested boolean operators) */
  children: EvaluationNode[];
  /** Whether the boolean expression passed */
  passed: boolean;
}

/**
 * Union type for all evaluation nodes
 */
export type EvaluationNode = ConditionNode | BooleanNode;

/**
 * Single policy evaluation result.
 * Shows how one policy was evaluated against the tool call.
 */
export interface PolicyNode {
  type: 'policy';
  /** Database ID of the policy */
  policyId: string;
  /** Human-readable slug for the policy */
  policySlug: string;
  /** Policy effect (ALLOW or DENY) */
  effect: 'ALLOW' | 'DENY';
  /** Whether any matcher matched the user/agent/role */
  matcherMatched: boolean;
  /** Details about matcher evaluation */
  matcherDetails?: {
    patterns: string[];
    matched: string[];
  };
  /** Whether the tool pattern matched */
  toolPatternMatched: boolean;
  /** Details about tool pattern evaluation */
  toolPatternDetails?: {
    pattern: string;
    toolName: string;
  };
  /** Condition evaluation tree (if policy has conditions) */
  conditionsResult?: BooleanNode;
  /**
   * Overall policy match result.
   * For DENY: true if policy matched (and will deny)
   * For ALLOW: true if policy matched and all conditions passed
   */
  matched: boolean;
  /** Why this policy was or wasn't applied */
  evaluationStatus: 'MATCHED' | 'NOT_MATCHED' | 'CONDITIONS_FAILED' | 'SKIPPED';
  /** Reason for skipping (e.g., "DENY takes precedence") */
  skipReason?: string;
}

/**
 * Pipeline stage names
 */
export type PipelineStage =
  | 'REQUEST'
  | 'SENTINEL_ENTRY'
  | 'TRUST_CHECK'
  | 'POLICY_CHECK'
  | 'FLAG_CHECK'
  | 'EXECUTE'
  | 'SENTINEL_EXIT'
  | 'LOG';

/**
 * Pipeline stage result
 */
export interface PipelineStageResult {
  stage: PipelineStage;
  /** Whether this stage passed */
  passed: boolean;
  /** When this stage was processed */
  timestamp: string;
  /** Details about what happened at this stage */
  details?: string;
}

/**
 * Complete policy evaluation tree.
 * The root structure stored in audit logs for visualization.
 */
export interface PolicyEvaluationTree {
  /** When the evaluation occurred */
  timestamp: string;
  /** The tool being called */
  toolName: string;
  /** Display name for the tool */
  toolNameDisplay?: string;

  /** Pipeline stage tracking */
  pipeline: {
    /** All stages processed */
    stages: PipelineStageResult[];
    /** Final stage reached */
    finalStage: PipelineStage;
    /** Stage where processing was interrupted (if any) */
    interruptedAt?: PipelineStage;
    /** Why processing was interrupted */
    interruptionReason?: string;
  };

  /** The actual context values used during evaluation */
  evaluationContext: {
    /** Tool parameters */
    params: Record<string, unknown>;
    /** Runtime context */
    context: {
      hourOfDay: number;
      dayOfWeek: number;
      timestamp: string;
      sourceIp?: string;
      timezone?: string;
    };
    /** SQL-specific extracted context */
    sql?: {
      operation?: string;
      tables?: string[];
      hasSqlComment?: boolean;
    };
    /** GitHub-specific extracted context */
    github?: {
      repository?: string;
      branch?: string;
      owner?: string;
      isProtectedBranch?: boolean;
    };
    /** File-specific extracted context */
    file?: {
      path?: string;
      extension?: string;
      isSensitivePath?: boolean;
    };
  };

  /** Trust check result (for untrusted servers) */
  trustCheck?: {
    serverTrusted: boolean;
    serverName: string;
    reason?: string;
  };

  /** All policy evaluations */
  policies: PolicyNode[];

  /** Flag check results */
  flagCheck?: {
    passed: boolean;
    matchedFlagIds: string[];
    flagBehaviors: string[];
    rateLimitHit?: boolean;
    approvalRequired?: boolean;
  };

  /** Final decision */
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  /** ID of the policy that made the final decision */
  decidingPolicyId?: string;
  /** Human-readable justification for the decision */
  justification: string;
}

/**
 * Simplified evaluation tree for display purposes.
 * Contains only the essential information needed for UI rendering.
 */
export interface EvaluationTreeSummary {
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
  interruptedAt?: PipelineStage;
  interruptionReason?: string;
  matchedPolicyCount: number;
  totalPolicyCount: number;
  decidingPolicySlug?: string;
}
