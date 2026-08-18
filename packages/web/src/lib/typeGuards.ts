/**
 * Shared type guards for the web application
 */

/**
 * Valid decision values for audit logs
 */
export type DecisionValue = 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';

/**
 * Type guard for decision values
 */
export function isDecisionValue(value: unknown): value is DecisionValue {
  return value === 'ALLOWED' || value === 'DENIED' || value === 'PENDING_APPROVAL';
}

/**
 * Valid values for AllowDenyBadge component
 */
export type AllowDenyValue = 'ALLOW' | 'DENY' | 'ALLOWED' | 'DENIED';

/**
 * Type guard for allow/deny binary decision
 */
export function isAllowDenyValue(value: unknown): value is AllowDenyValue {
  return value === 'ALLOW' || value === 'DENY' || value === 'ALLOWED' || value === 'DENIED';
}

/**
 * Helper to get a safe decision value for AllowDenyBadge
 * Falls back to 'DENIED' if the value is not a valid AllowDenyValue
 */
export function getDecisionBadgeValue(decision: string): AllowDenyValue {
  return isAllowDenyValue(decision) ? decision : 'DENIED';
}
