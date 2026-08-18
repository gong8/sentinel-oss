/**
 * Prometheus Metrics Service
 * Provides metrics collection and export for monitoring
 */

import client from 'prom-client';

// Create a Registry to register metrics
export const register = new client.Registry();

// Add default labels
register.setDefaultLabels({
  app: 'sentinel',
});

// Collect default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// ============================================================================
// HTTP Request Metrics
// ============================================================================

export const httpRequestsTotal = new client.Counter({
  name: 'sentinel_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: 'sentinel_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ============================================================================
// Audit Log Metrics
// ============================================================================

export const auditLogsTotal = new client.Counter({
  name: 'sentinel_audit_logs_total',
  help: 'Total number of audit log entries',
  labelNames: ['decision', 'organization'] as const,
  registers: [register],
});

// ============================================================================
// Session Metrics
// ============================================================================

export const activeSessions = new client.Gauge({
  name: 'sentinel_active_sessions',
  help: 'Number of active sessions',
  labelNames: ['organization'] as const,
  registers: [register],
});

// ============================================================================
// Policy Evaluation Metrics
// ============================================================================

export const policyEvaluationsTotal = new client.Counter({
  name: 'sentinel_policy_evaluations_total',
  help: 'Total number of policy evaluations',
  labelNames: ['result'] as const,
  registers: [register],
});

export const policyEvaluationDuration = new client.Histogram({
  name: 'sentinel_policy_evaluation_duration_seconds',
  help: 'Duration of policy evaluations in seconds',
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register],
});

// ============================================================================
// tRPC Metrics
// ============================================================================

export const trpcRequestsTotal = new client.Counter({
  name: 'sentinel_trpc_requests_total',
  help: 'Total number of tRPC requests',
  labelNames: ['procedure', 'type', 'status'] as const,
  registers: [register],
});

export const trpcRequestDuration = new client.Histogram({
  name: 'sentinel_trpc_request_duration_seconds',
  help: 'Duration of tRPC requests in seconds',
  labelNames: ['procedure', 'type'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ============================================================================
// Webhook Metrics
// ============================================================================

export const webhookDeliveriesTotal = new client.Counter({
  name: 'sentinel_webhook_deliveries_total',
  help: 'Total number of webhook deliveries',
  labelNames: ['event', 'status'] as const,
  registers: [register],
});

// ============================================================================
// Database Connection Metrics
// ============================================================================

export const dbConnectionErrors = new client.Counter({
  name: 'sentinel_db_connection_errors_total',
  help: 'Total number of database connection errors',
  registers: [register],
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Record an audit log event
 */
export function recordAuditLog(decision: 'ALLOWED' | 'DENIED', organizationId: string): void {
  auditLogsTotal.inc({ decision, organization: organizationId });
}

/**
 * Record a policy evaluation
 */
export function recordPolicyEvaluation(result: 'ALLOWED' | 'DENIED', durationMs: number): void {
  policyEvaluationsTotal.inc({ result });
  policyEvaluationDuration.observe(durationMs / 1000);
}

/**
 * Update active session count for an organization
 */
export function updateActiveSessions(organizationId: string, count: number): void {
  activeSessions.set({ organization: organizationId }, count);
}

/**
 * Record a webhook delivery
 */
export function recordWebhookDelivery(event: string, status: 'success' | 'failure'): void {
  webhookDeliveriesTotal.inc({ event, status });
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

/**
 * Get content type for metrics endpoint
 */
export function getMetricsContentType(): string {
  return register.contentType;
}
