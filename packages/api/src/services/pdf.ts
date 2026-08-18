/**
 * PDF Generation Service
 * Handles PDF export for audit logs and admin action logs using Puppeteer
 */

import puppeteer from 'puppeteer';
import { logger } from '../lib/logger.js';

export interface AuditLogPdfEntry {
  id: string;
  toolName: string;
  decision: string;
  justification: string | null;
  timestamp: Date;
  userEmail: string | null;
  userRoles: string[];
  agentName: string | null;
  mcpServerName: string | null;
}

export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
}

export interface AdminActionLogPdfEntry {
  id: string;
  actionType: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  reason: string | null;
  timestamp: Date;
  adminEmail: string | null;
  ipAddress: string | null;
}

export interface PdfExportFilters {
  startDate?: Date;
  endDate?: Date;
  decision?: string;
  actionType?: string;
  resourceType?: string;
  userId?: string;
  agentId?: string;
  adminUserId?: string;
}

function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
}

/**
 * Converts tool name from URL format (e.g., "notion.com::createPage")
 * to friendly format (e.g., "Notion::createPage") using MCP server info
 */
function formatToolNameFriendly(toolName: string, mcpServers: McpServerInfo[]): string {
  try {
    const parts = toolName.split('::');
    if (parts.length === 2) {
      const [serverPart, toolPart] = parts;
      // Find matching server by URL
      for (const server of mcpServers) {
        try {
          const url = new URL(server.url);
          const domain = url.hostname;
          const port = url.port ? `:${url.port}` : '';
          const serverKey = `${domain}${port}`;
          if (serverPart === serverKey) {
            return `${server.name}::${toolPart}`;
          }
        } catch {
          // Skip invalid URLs
        }
      }
    }
    return toolName;
  } catch {
    return toolName;
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Gets a label from a mapping, falling back to the key if not found
 */
function getLabel(labels: Record<string, string>, key: string): string {
  return labels[key] ?? key;
}

// Label mappings for admin actions
const ACTION_TYPE_LABELS: Record<string, string> = {
  USER_CREATE: 'Create User',
  USER_UPDATE: 'Update User',
  USER_DELETE: 'Delete User',
  USER_RESTORE: 'Restore User',
  USER_ROLES_UPDATE: 'Update User Roles',
  USER_TOKEN_REFRESH: 'Refresh User Token',
  USER_TOKEN_REVOKE: 'Revoke User Token',
  ROLE_CREATE: 'Create Role',
  ROLE_UPDATE: 'Update Role',
  ROLE_DELETE: 'Delete Role',
  ROLE_RESTORE: 'Restore Role',
  POLICY_CREATE: 'Create Policy',
  POLICY_UPDATE: 'Update Policy',
  POLICY_DELETE: 'Delete Policy',
  POLICY_RESTORE: 'Restore Policy',
  POLICY_ENABLE: 'Enable Policy',
  POLICY_DISABLE: 'Disable Policy',
  POLICY_CONFLICT_RESOLVE: 'Resolve Conflict',
  MCP_SERVER_CREATE: 'Create MCP Server',
  MCP_SERVER_UPDATE: 'Update MCP Server',
  MCP_SERVER_DELETE: 'Delete MCP Server',
  MCP_SERVER_RESTORE: 'Restore MCP Server',
  MCP_SERVER_DISCOVER_TOOLS: 'Discover Tools',
  MCP_SERVER_ORG_API_KEY_ADD: 'Add Org API Key',
  MCP_SERVER_ORG_API_KEY_UPDATE: 'Update Org API Key',
  MCP_SERVER_ORG_API_KEY_REMOVE: 'Remove Org API Key',
  OAUTH_DISCOVER: 'OAuth Discover',
  OAUTH_CLIENT_REGISTER: 'Register OAuth',
  OAUTH_CLIENT_CONFIGURE: 'Configure OAuth',
  OAUTH_FLOW_INITIATE: 'Initiate OAuth',
  OAUTH_FLOW_COMPLETE: 'Complete OAuth',
  OAUTH_TOKEN_REFRESH: 'Refresh Token',
  OAUTH_TOKEN_REVOKE: 'Revoke Token',
  OAUTH_DISCONNECT: 'Disconnect OAuth',
  AGENT_CREATE: 'Create Agent',
  AGENT_DELETE: 'Delete Agent',
  AGENT_RESTORE: 'Restore Agent',
  PERMISSION_REQUEST_APPROVE: 'Approve Request',
  PERMISSION_REQUEST_DENY: 'Deny Request',
  ORGANIZATION_UPDATE: 'Update Organization',
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  USER: 'User',
  ROLE: 'Role',
  POLICY: 'Policy',
  MCP_SERVER: 'MCP Server',
  OAUTH_CLIENT: 'OAuth Client',
  AGENT: 'Agent',
  PERMISSION_REQUEST: 'Permission Request',
  ORGANIZATION: 'Organization',
};

interface PdfDocumentOptions {
  title: string;
  organizationName: string;
  metaItems: Array<{ label: string; value: string | number }>;
  filterInfo: string[];
  tableHtml: string;
  reportIdPrefix: string;
}

/**
 * Wraps content in a standard PDF document structure
 */
function createPdfDocument(options: PdfDocumentOptions): string {
  const now = new Date();
  const { title, organizationName, metaItems, filterInfo, tableHtml, reportIdPrefix } = options;

  const metaHtml = metaItems
    .map(
      (item) => `
      <div class="meta-item">
        <span class="label">${item.label}:</span>
        <span class="value">${item.value}</span>
      </div>`,
    )
    .join('');

  const filterHtml =
    filterInfo.length > 0
      ? `<div class="meta-item"><span class="label">Filters:</span> <span class="value">${filterInfo.join(' | ')}</span></div>`
      : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
      ${getBaseStyles()}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="org-name">${escapeHtml(organizationName)}</div>
          <h1>${escapeHtml(title)}</h1>
          <div class="subtitle">Generated on ${formatDate(now)}</div>
        </div>

        <div class="meta-info">
          ${metaHtml}
          ${filterHtml}
        </div>

        ${tableHtml}

        <div class="footer">
          <p>This report was generated by SENTINEL - Control Plane for AI Agent Tooling</p>
          <p>Report ID: ${reportIdPrefix}-${now.getTime()}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getBaseStyles(): string {
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 10px;
        line-height: 1.5;
        color: #1a1a1a;
        background: #fff;
      }

      .container {
        max-width: 100%;
        margin: 0 auto;
        padding: 40px;
      }

      .header {
        border-bottom: 2px solid #1a1a1a;
        padding-bottom: 20px;
        margin-bottom: 30px;
      }

      .header h1 {
        font-size: 24px;
        font-weight: 700;
        color: #1a1a1a;
        margin-bottom: 8px;
      }

      .header .subtitle {
        font-size: 12px;
        color: #666;
      }

      .header .org-name {
        font-size: 14px;
        font-weight: 600;
        color: #333;
        margin-bottom: 4px;
      }

      .meta-info {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 30px;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 6px;
      }

      .meta-item {
        font-size: 11px;
      }

      .meta-item .label {
        color: #666;
        font-weight: 500;
      }

      .meta-item .value {
        color: #1a1a1a;
        font-weight: 600;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 30px;
      }

      th {
        background: #f1f3f4;
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #333;
        border-bottom: 2px solid #ddd;
      }

      td {
        padding: 10px 12px;
        border-bottom: 1px solid #eee;
        vertical-align: top;
        font-size: 10px;
      }

      tr:nth-child(even) {
        background: #fafafa;
      }

      .badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .badge-allowed {
        background: #d4edda;
        color: #155724;
      }

      .badge-denied {
        background: #f8d7da;
        color: #721c24;
      }

      .badge-action {
        background: #e7f1ff;
        color: #0047ab;
      }

      .mono {
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 9px;
      }

      .text-muted {
        color: #666;
      }

      .text-small {
        font-size: 9px;
      }

      .footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #ddd;
        font-size: 9px;
        color: #666;
        text-align: center;
      }

      .page-break {
        page-break-after: always;
      }

      .summary-card {
        display: inline-block;
        padding: 15px 25px;
        background: #f8f9fa;
        border-radius: 8px;
        margin-right: 15px;
        margin-bottom: 15px;
      }

      .summary-card .number {
        font-size: 24px;
        font-weight: 700;
        color: #1a1a1a;
      }

      .summary-card .label {
        font-size: 10px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .truncate {
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    </style>
  `;
}

function generateAuditLogHtml(
  entries: AuditLogPdfEntry[],
  organizationName: string,
  filters: PdfExportFilters,
  mcpServers: McpServerInfo[] = [],
): string {
  const allowedCount = entries.filter((e) => e.decision === 'ALLOWED').length;
  const deniedCount = entries.filter((e) => e.decision === 'DENIED').length;

  const filterInfo: string[] = [];
  if (filters.startDate) filterInfo.push(`From: ${formatDateShort(filters.startDate)}`);
  if (filters.endDate) filterInfo.push(`To: ${formatDateShort(filters.endDate)}`);
  if (filters.decision) filterInfo.push(`Decision: ${filters.decision}`);

  const rows = entries
    .map((entry) => {
      const friendlyToolName = formatToolNameFriendly(entry.toolName, mcpServers);
      const badgeClass = entry.decision === 'ALLOWED' ? 'badge-allowed' : 'badge-denied';
      return `
    <tr>
      <td class="mono">${formatDate(entry.timestamp)}</td>
      <td>
        <div class="mono truncate" title="${escapeHtml(entry.toolName)}">${escapeHtml(friendlyToolName)}</div>
        ${entry.mcpServerName ? `<div class="text-small text-muted">${escapeHtml(entry.mcpServerName)}</div>` : ''}
      </td>
      <td>
        ${entry.userEmail ? `<div>${escapeHtml(entry.userEmail)}</div>` : ''}
        ${entry.agentName ? `<div class="text-muted">Agent: ${escapeHtml(entry.agentName)}</div>` : ''}
        ${entry.userRoles.length > 0 ? `<div class="text-small text-muted">${escapeHtml(entry.userRoles.join(', '))}</div>` : ''}
      </td>
      <td>
        <span class="badge ${badgeClass}">${entry.decision}</span>
      </td>
      <td class="text-small">${entry.justification ? escapeHtml(entry.justification) : '-'}</td>
    </tr>
  `;
    })
    .join('');

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th style="width: 140px;">Timestamp</th>
          <th style="width: 200px;">Tool</th>
          <th style="width: 180px;">User/Agent</th>
          <th style="width: 80px;">Decision</th>
          <th>Justification</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  return createPdfDocument({
    title: 'Audit Log Export',
    organizationName,
    metaItems: [
      { label: 'Total Entries', value: entries.length },
      { label: 'Allowed', value: allowedCount },
      { label: 'Denied', value: deniedCount },
    ],
    filterInfo,
    tableHtml,
    reportIdPrefix: 'audit',
  });
}

function generateAdminActionLogHtml(
  entries: AdminActionLogPdfEntry[],
  organizationName: string,
  filters: PdfExportFilters,
): string {
  const filterInfo: string[] = [];
  if (filters.startDate) filterInfo.push(`From: ${formatDateShort(filters.startDate)}`);
  if (filters.endDate) filterInfo.push(`To: ${formatDateShort(filters.endDate)}`);
  if (filters.actionType) {
    filterInfo.push(`Action: ${getLabel(ACTION_TYPE_LABELS, filters.actionType)}`);
  }
  if (filters.resourceType) {
    filterInfo.push(`Resource: ${getLabel(RESOURCE_TYPE_LABELS, filters.resourceType)}`);
  }

  const rows = entries
    .map(
      (entry) => `
    <tr>
      <td class="mono">${formatDate(entry.timestamp)}</td>
      <td>${entry.adminEmail ? escapeHtml(entry.adminEmail) : '<span class="text-muted">Unknown</span>'}</td>
      <td>
        <span class="badge badge-action">${getLabel(ACTION_TYPE_LABELS, entry.actionType)}</span>
      </td>
      <td>
        <div>${getLabel(RESOURCE_TYPE_LABELS, entry.resourceType)}</div>
        ${entry.resourceName ? `<div class="text-small text-muted">${escapeHtml(entry.resourceName)}</div>` : ''}
      </td>
      <td class="text-small">${entry.reason ? escapeHtml(entry.reason) : '-'}</td>
      <td class="mono text-small text-muted">${entry.ipAddress ?? '-'}</td>
    </tr>
  `,
    )
    .join('');

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th style="width: 140px;">Timestamp</th>
          <th style="width: 160px;">Admin</th>
          <th style="width: 120px;">Action</th>
          <th style="width: 150px;">Resource</th>
          <th>Reason</th>
          <th style="width: 100px;">IP Address</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  return createPdfDocument({
    title: 'Admin Action Log Export',
    organizationName,
    metaItems: [{ label: 'Total Entries', value: entries.length }],
    filterInfo,
    tableHtml,
    reportIdPrefix: 'admin',
  });
}

/**
 * Generates a PDF from HTML content using Puppeteer
 */
async function htmlToPdf(html: string): Promise<Buffer> {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfUint8Array = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    return Buffer.from(pdfUint8Array);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Exports audit log entries to PDF
 */
export async function exportAuditLogToPdf(
  entries: AuditLogPdfEntry[],
  organizationName: string,
  filters: PdfExportFilters = {},
  mcpServers: McpServerInfo[] = [],
): Promise<Buffer> {
  try {
    const html = generateAuditLogHtml(entries, organizationName, filters, mcpServers);
    return await htmlToPdf(html);
  } catch (error) {
    logger.error('Failed to generate audit log PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}

/**
 * Exports admin action log entries to PDF
 */
export async function exportAdminActionLogToPdf(
  entries: AdminActionLogPdfEntry[],
  organizationName: string,
  filters: PdfExportFilters = {},
): Promise<Buffer> {
  try {
    const html = generateAdminActionLogHtml(entries, organizationName, filters);
    return await htmlToPdf(html);
  } catch (error) {
    logger.error('Failed to generate admin action log PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}
