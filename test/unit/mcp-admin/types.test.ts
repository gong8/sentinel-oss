/**
 * Unit tests for Admin MCP Types
 * Tests type definitions used by the Admin MCP server
 */

import { describe, expect, test } from 'vitest';

import type {
  AdminContext,
  AdminMcpAccessResult,
  AdminMcpRiskLevel,
  ConfirmationResult,
  ConfirmationStatusResult,
} from '../../../packages/mcp-admin/src/types.js';

describe('Admin MCP Types', () => {
  describe('AdminContext', () => {
    test('should accept valid AdminContext object', () => {
      const context: AdminContext = {
        valid: true,
        userId: 'user-123',
        email: 'admin@example.com',
        organizationId: 'org-456',
        isAdmin: true,
        roles: ['admin', 'super-admin'],
        adminWorkspaceIds: ['workspace-1', 'workspace-2'],
      };

      expect(context.valid).toBe(true);
      expect(context.userId).toBe('user-123');
      expect(context.email).toBe('admin@example.com');
      expect(context.organizationId).toBe('org-456');
      expect(context.isAdmin).toBe(true);
      expect(context.roles).toEqual(['admin', 'super-admin']);
    });

    test('should accept AdminContext with empty roles', () => {
      const context: AdminContext = {
        valid: true,
        userId: 'user-123',
        email: 'admin@example.com',
        organizationId: 'org-456',
        isAdmin: true,
        roles: [],
        adminWorkspaceIds: [],
      };

      expect(context.roles).toEqual([]);
    });

    test('should accept invalid AdminContext', () => {
      const context: AdminContext = {
        valid: false,
        userId: '',
        email: '',
        organizationId: '',
        isAdmin: false,
        roles: [],
        adminWorkspaceIds: [],
      };

      expect(context.valid).toBe(false);
    });
  });

  describe('AdminMcpAccessResult', () => {
    test('should accept accessible result', () => {
      const result: AdminMcpAccessResult = {
        accessible: true,
        reason: null,
        enabledScopes: ['POLICIES', 'USERS', 'ROLES'],
        rateLimitPerMin: 60,
        confirmationTtlSeconds: 300,
      };

      expect(result.accessible).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.enabledScopes).toEqual(['POLICIES', 'USERS', 'ROLES']);
      expect(result.rateLimitPerMin).toBe(60);
      expect(result.confirmationTtlSeconds).toBe(300);
    });

    test('should accept inaccessible result with reason', () => {
      const result: AdminMcpAccessResult = {
        accessible: false,
        reason: 'Admin MCP not enabled for this organization',
        enabledScopes: [],
      };

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('Admin MCP not enabled for this organization');
      expect(result.enabledScopes).toEqual([]);
      expect(result.rateLimitPerMin).toBeUndefined();
      expect(result.confirmationTtlSeconds).toBeUndefined();
    });

    test('should accept result without optional fields', () => {
      const result: AdminMcpAccessResult = {
        accessible: true,
        reason: null,
        enabledScopes: ['POLICIES'],
      };

      expect(result.rateLimitPerMin).toBeUndefined();
      expect(result.confirmationTtlSeconds).toBeUndefined();
    });
  });

  describe('ConfirmationResult', () => {
    test('should accept successful confirmation creation', () => {
      const result: ConfirmationResult = {
        success: true,
        requiresConfirmation: true,
        confirmationId: 'confirm-123',
        description: 'Create policy for admin',
        riskLevel: 'MEDIUM',
        expiresAt: '2024-01-15T12:00:00Z',
      };

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.confirmationId).toBe('confirm-123');
      expect(result.description).toBe('Create policy for admin');
      expect(result.riskLevel).toBe('MEDIUM');
      expect(result.expiresAt).toBe('2024-01-15T12:00:00Z');
    });

    test('should accept failed confirmation creation', () => {
      const result: ConfirmationResult = {
        success: false,
        error: 'Failed to create confirmation',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create confirmation');
      expect(result.confirmationId).toBeUndefined();
    });

    test('should accept result that does not require confirmation', () => {
      const result: ConfirmationResult = {
        success: true,
        requiresConfirmation: false,
      };

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.confirmationId).toBeUndefined();
    });
  });

  describe('ConfirmationStatusResult', () => {
    test('should accept found confirmation with EXECUTED status', () => {
      const result: ConfirmationStatusResult = {
        found: true,
        status: 'EXECUTED',
        result: { policyId: 'policy-123' },
        error: null,
      };

      expect(result.found).toBe(true);
      expect(result.status).toBe('EXECUTED');
      expect(result.result).toEqual({ policyId: 'policy-123' });
      expect(result.error).toBeNull();
    });

    test('should accept found confirmation with PENDING status', () => {
      const result: ConfirmationStatusResult = {
        found: true,
        status: 'PENDING',
        result: null,
        error: null,
      };

      expect(result.found).toBe(true);
      expect(result.status).toBe('PENDING');
      expect(result.result).toBeNull();
    });

    test('should accept found confirmation with REJECTED status', () => {
      const result: ConfirmationStatusResult = {
        found: true,
        status: 'REJECTED',
        result: null,
        error: null,
      };

      expect(result.found).toBe(true);
      expect(result.status).toBe('REJECTED');
    });

    test('should accept found confirmation with EXPIRED status', () => {
      const result: ConfirmationStatusResult = {
        found: true,
        status: 'EXPIRED',
        result: null,
        error: null,
      };

      expect(result.found).toBe(true);
      expect(result.status).toBe('EXPIRED');
    });

    test('should accept found confirmation with FAILED status', () => {
      const result: ConfirmationStatusResult = {
        found: true,
        status: 'FAILED',
        result: null,
        error: 'Database constraint violation',
      };

      expect(result.found).toBe(true);
      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Database constraint violation');
    });

    test('should accept not found confirmation', () => {
      const result: ConfirmationStatusResult = {
        found: false,
        status: null,
        result: null,
        error: 'Confirmation not found',
      };

      expect(result.found).toBe(false);
      expect(result.status).toBeNull();
      expect(result.error).toBe('Confirmation not found');
    });
  });

  describe('AdminMcpRiskLevel', () => {
    test('should accept LOW risk level', () => {
      const level: AdminMcpRiskLevel = 'LOW';
      expect(level).toBe('LOW');
    });

    test('should accept MEDIUM risk level', () => {
      const level: AdminMcpRiskLevel = 'MEDIUM';
      expect(level).toBe('MEDIUM');
    });

    test('should accept HIGH risk level', () => {
      const level: AdminMcpRiskLevel = 'HIGH';
      expect(level).toBe('HIGH');
    });
  });
});
