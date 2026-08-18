/**
 * Export Service
 * Provides CSV and JSON export functionality for audit logs and admin action logs
 */

import type { AdminActionType, AdminResourceType, AuditDecision } from '@sentinel/db';

// ============================================================================
// Types
// ============================================================================

export interface AuditLogExportEntry {
  id: string;
  timestamp: Date;
  toolName: string;
  decision: AuditDecision;
  justification: string | null;
  userEmail: string | null;
  userRoles: string[];
  agentName: string | null;
  mcpServerName: string | null;
  policyIds: string[];
}

export interface AdminActionLogExportEntry {
  id: string;
  timestamp: Date;
  actionType: AdminActionType;
  resourceType: AdminResourceType;
  resourceId: string | null;
  resourceName: string | null;
  adminEmail: string | null;
  reason: string | null;
  ipAddress: string | null;
}

export interface ExportResult {
  data: string;
  filename: string;
  contentType: string;
}

// ============================================================================
// CSV Formatting
// ============================================================================

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If contains special characters, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Convert an array of objects to CSV format
 */
function objectsToCsv<T extends Record<string, unknown>>(objects: T[], headers: string[]): string {
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(escapeCsvValue).join(','));

  // Data rows
  for (const obj of objects) {
    const values = headers.map((header) => escapeCsvValue(obj[header]));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

// ============================================================================
// Audit Log Export
// ============================================================================

/**
 * Export audit logs to CSV format
 */
export function exportAuditLogsToCsv(entries: AuditLogExportEntry[]): ExportResult {
  const flattenedEntries = entries.map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp.toISOString(),
    toolName: entry.toolName,
    decision: entry.decision,
    justification: entry.justification,
    userEmail: entry.userEmail,
    userRoles: entry.userRoles.join('; '),
    agentName: entry.agentName,
    mcpServerName: entry.mcpServerName,
    policyIds: entry.policyIds.join('; '),
  }));

  const headers = [
    'id',
    'timestamp',
    'toolName',
    'decision',
    'justification',
    'userEmail',
    'userRoles',
    'agentName',
    'mcpServerName',
    'policyIds',
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    data: objectsToCsv(flattenedEntries, headers),
    filename: `audit-log-export-${timestamp}.csv`,
    contentType: 'text/csv',
  };
}

/**
 * Export audit logs to JSON format
 */
export function exportAuditLogsToJson(entries: AuditLogExportEntry[]): ExportResult {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    data: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: entries.length,
        entries: entries.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp.toISOString(),
          toolName: entry.toolName,
          decision: entry.decision,
          justification: entry.justification,
          userEmail: entry.userEmail,
          userRoles: entry.userRoles,
          agentName: entry.agentName,
          mcpServerName: entry.mcpServerName,
          policyIds: entry.policyIds,
        })),
      },
      null,
      2,
    ),
    filename: `audit-log-export-${timestamp}.json`,
    contentType: 'application/json',
  };
}

// ============================================================================
// Admin Action Log Export
// ============================================================================

/**
 * Export admin action logs to CSV format
 */
export function exportAdminActionLogsToCsv(entries: AdminActionLogExportEntry[]): ExportResult {
  const flattenedEntries = entries.map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp.toISOString(),
    actionType: entry.actionType,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    resourceName: entry.resourceName,
    adminEmail: entry.adminEmail,
    reason: entry.reason,
    ipAddress: entry.ipAddress,
  }));

  const headers = [
    'id',
    'timestamp',
    'actionType',
    'resourceType',
    'resourceId',
    'resourceName',
    'adminEmail',
    'reason',
    'ipAddress',
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    data: objectsToCsv(flattenedEntries, headers),
    filename: `admin-action-log-export-${timestamp}.csv`,
    contentType: 'text/csv',
  };
}

/**
 * Export admin action logs to JSON format
 */
export function exportAdminActionLogsToJson(entries: AdminActionLogExportEntry[]): ExportResult {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    data: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: entries.length,
        entries: entries.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp.toISOString(),
          actionType: entry.actionType,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          resourceName: entry.resourceName,
          adminEmail: entry.adminEmail,
          reason: entry.reason,
          ipAddress: entry.ipAddress,
        })),
      },
      null,
      2,
    ),
    filename: `admin-action-log-export-${timestamp}.json`,
    contentType: 'application/json',
  };
}

// ============================================================================
// Build Export Response
// ============================================================================

/**
 * Build a base64-encoded response for export data
 */
export function buildExportResponse(result: ExportResult): {
  data: string;
  filename: string;
  contentType: string;
} {
  return {
    data: Buffer.from(result.data, 'utf-8').toString('base64'),
    filename: result.filename,
    contentType: result.contentType,
  };
}
