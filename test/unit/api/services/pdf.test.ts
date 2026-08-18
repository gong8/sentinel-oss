/**
 * Tests for PDF Service
 * Tests PDF generation for audit logs and admin action logs
 *
 * Note: Puppeteer browser is installed in CI via workflow step.
 * Tests use real Puppeteer for success cases and mock for error cases.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  AdminActionLogPdfEntry,
  AuditLogPdfEntry,
  McpServerInfo,
  PdfExportFilters,
} from '../../../../packages/api/src/services/pdf.js';

// Create hoisted mock for logger
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

// Import the module after mocking logger (uses real puppeteer for success cases)
import {
  exportAdminActionLogToPdf,
  exportAuditLogToPdf,
} from '../../../../packages/api/src/services/pdf.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pdf', () => {
  describe('exportAuditLogToPdf', () => {
    const baseEntry: AuditLogPdfEntry = {
      id: 'log-1',
      toolName: 'github.com::createPR',
      decision: 'ALLOWED',
      justification: null,
      timestamp: new Date('2024-01-15T10:30:00Z'),
      userEmail: 'user@example.com',
      userRoles: ['Admin', 'Developer'],
      agentName: null,
      mcpServerName: 'GitHub MCP',
    };

    const mcpServers: McpServerInfo[] = [
      { id: 'server-1', name: 'GitHub', url: 'https://github.com/mcp' },
      { id: 'server-2', name: 'Notion', url: 'https://notion.com:443/mcp' },
    ];

    test('should generate valid PDF with various entry types', async () => {
      // Tests: basic generation, null fields, empty arrays, decisions, agent names
      const entries: AuditLogPdfEntry[] = [
        baseEntry,
        { ...baseEntry, id: 'log-2', userEmail: null, userRoles: [] },
        { ...baseEntry, id: 'log-3', decision: 'DENIED', justification: 'No matching policy' },
        {
          ...baseEntry,
          id: 'log-4',
          agentName: 'Test Agent',
          justification: 'Matched admin policy',
        },
      ];

      const filters: PdfExportFilters = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        decision: 'ALLOWED',
      };

      const result = await exportAuditLogToPdf(entries, 'Test Organization', filters, mcpServers);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
    });

    test('should handle empty entries and XSS prevention', async () => {
      // Test empty array
      const emptyResult = await exportAuditLogToPdf([], 'Test Organization', {}, []);
      expect(emptyResult).toBeInstanceOf(Buffer);

      // Test XSS - should not throw, HTML escaping handles special chars
      const xssEntries: AuditLogPdfEntry[] = [
        {
          ...baseEntry,
          userEmail: '<script>alert("xss")</script>',
          justification: '&<>"\'',
        },
      ];
      const xssResult = await exportAuditLogToPdf(xssEntries, 'Test & Company <Corp>', {}, []);
      expect(xssResult).toBeInstanceOf(Buffer);
    });

    test('should handle edge cases in tool names and URLs', async () => {
      const entries: AuditLogPdfEntry[] = [
        {
          ...baseEntry,
          id: 'log-1',
          toolName:
            'very-long-domain-name-that-exceeds-normal-length.example.com::very_long_tool_name_that_also_exceeds_normal_length',
        },
        { ...baseEntry, id: 'log-2', toolName: 'localhost:8080::createFile' },
      ];

      const servers: McpServerInfo[] = [
        { id: 'server-1', name: 'Local Dev', url: 'http://localhost:8080' },
        { id: 'server-2', name: 'Invalid', url: 'not-a-valid-url' },
      ];

      const result = await exportAuditLogToPdf(entries, 'Test Organization', {}, servers);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('exportAdminActionLogToPdf', () => {
    const baseEntry: AdminActionLogPdfEntry = {
      id: 'action-1',
      actionType: 'USER_CREATE',
      resourceType: 'USER',
      resourceId: 'user-123',
      resourceName: 'test@example.com',
      reason: 'New employee onboarding',
      timestamp: new Date('2024-01-15T10:30:00Z'),
      adminEmail: 'admin@example.com',
      ipAddress: '192.168.1.1',
    };

    test('should generate valid PDF with various entry types', async () => {
      // Tests: basic generation, null fields, different action types
      const entries: AdminActionLogPdfEntry[] = [
        baseEntry,
        { ...baseEntry, id: 'action-2', adminEmail: null, ipAddress: null },
        { ...baseEntry, id: 'action-3', reason: null, resourceName: null },
        { ...baseEntry, id: 'action-4', actionType: 'POLICY_DELETE' },
        { ...baseEntry, id: 'action-5', actionType: 'MCP_SERVER_CREATE' },
        { ...baseEntry, id: 'action-6', actionType: 'UNKNOWN_ACTION' },
      ];

      const filters: PdfExportFilters = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        actionType: 'USER_CREATE',
        resourceType: 'USER',
      };

      const result = await exportAdminActionLogToPdf(entries, 'Test Organization', filters);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
    });

    test('should handle empty entries array', async () => {
      const result = await exportAdminActionLogToPdf([], 'Test Organization', {});
      expect(result).toBeInstanceOf(Buffer);
    });
  });
});

// Note: Error handling tests are in pdf-error.test.ts
// They require complete module isolation for proper puppeteer mocking
