/**
 * Tests for PDF Service Error Handling
 * Isolated test file for error paths that require mocked puppeteer
 *
 * This file is separate because puppeteer mocking requires complete module isolation.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  AdminActionLogPdfEntry,
  AuditLogPdfEntry,
} from '../../../../packages/api/src/services/pdf.js';

// Mock logger - must be hoisted
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

// Mock puppeteer to always fail - must be hoisted
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockRejectedValue(new Error('Puppeteer launch failed')),
  },
}));

// Import after mocking
import {
  exportAdminActionLogToPdf,
  exportAuditLogToPdf,
} from '../../../../packages/api/src/services/pdf.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pdf error handling', () => {
  describe('exportAuditLogToPdf error path (lines 601-602)', () => {
    test('should log error and throw wrapped error when PDF generation fails', async () => {
      const entries: AuditLogPdfEntry[] = [
        {
          id: 'test',
          toolName: 'test::tool',
          decision: 'ALLOWED',
          justification: null,
          timestamp: new Date('2024-01-15T10:30:00Z'),
          userEmail: 'user@example.com',
          userRoles: [],
          agentName: null,
          mcpServerName: null,
        },
      ];

      await expect(exportAuditLogToPdf(entries, 'Test Org', {}, [])).rejects.toThrow(
        'Failed to generate PDF',
      );

      // Verify error was logged (lines 601-602)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate audit log PDF:',
        expect.any(Error),
      );
    });
  });

  describe('exportAdminActionLogToPdf error path (lines 618-619)', () => {
    test('should log error and throw wrapped error when PDF generation fails', async () => {
      const entries: AdminActionLogPdfEntry[] = [
        {
          id: 'action-1',
          actionType: 'USER_CREATE',
          resourceType: 'USER',
          resourceId: 'user-123',
          resourceName: 'test@example.com',
          reason: 'Test reason',
          timestamp: new Date('2024-01-15T10:30:00Z'),
          adminEmail: 'admin@example.com',
          ipAddress: '192.168.1.1',
        },
      ];

      await expect(exportAdminActionLogToPdf(entries, 'Test Org', {})).rejects.toThrow(
        'Failed to generate PDF',
      );

      // Verify error was logged (lines 618-619)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate admin action log PDF:',
        expect.any(Error),
      );
    });
  });
});
