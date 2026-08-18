/**
 * Admin MCP Settings Service Unit Tests
 * Tests for admin MCP settings management
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
}));

import {
  getAdminMcpSettings,
  isAdminAllowed,
  isAdminMcpAccessible,
  isScopeEnabled,
  updateAdminMcpSettings,
} from '../../../../packages/api/src/services/adminMcpSettings.js';
import {
  AdminMcpScope,
  type AdminMcpSettings,
} from '../../../../packages/api/src/types/adminMcp.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockOrgSettings(
  overrides: Partial<{
    adminMcpEnabled: boolean;
    adminMcpEnabledScopes: string[];
    adminMcpAllowedAdmins: string[];
    adminMcpRateLimitPerMin: number;
    adminMcpConfirmationTtl: number;
  }> = {},
) {
  return {
    adminMcpEnabled: overrides.adminMcpEnabled ?? true,
    adminMcpEnabledScopes: overrides.adminMcpEnabledScopes ?? ['POLICIES', 'USERS'],
    adminMcpAllowedAdmins: overrides.adminMcpAllowedAdmins ?? [],
    adminMcpRateLimitPerMin: overrides.adminMcpRateLimitPerMin ?? 30,
    adminMcpConfirmationTtl: overrides.adminMcpConfirmationTtl ?? 300,
  };
}

function createMockSettings(overrides: Partial<AdminMcpSettings> = {}): AdminMcpSettings {
  return {
    enabled: overrides.enabled ?? true,
    enabledScopes: overrides.enabledScopes ?? [AdminMcpScope.POLICIES, AdminMcpScope.USERS],
    allowedAdmins: overrides.allowedAdmins ?? [],
    rateLimitPerMin: overrides.rateLimitPerMin ?? 30,
    confirmationTtlSeconds: overrides.confirmationTtlSeconds ?? 300,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Admin MCP Settings Service', () => {
  describe('getAdminMcpSettings', () => {
    test('should return settings for existing organization', async () => {
      const mockOrgData = createMockOrgSettings();
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await getAdminMcpSettings('org-1');

      expect(result).toEqual({
        enabled: true,
        enabledScopes: ['POLICIES', 'USERS'],
        allowedAdmins: [],
        rateLimitPerMin: 30,
        confirmationTtlSeconds: 300,
      });
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        select: {
          adminMcpEnabled: true,
          adminMcpEnabledScopes: true,
          adminMcpAllowedAdmins: true,
          adminMcpRateLimitPerMin: true,
          adminMcpConfirmationTtl: true,
        },
      });
    });

    test('should throw error when organization not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(getAdminMcpSettings('nonexistent')).rejects.toThrow(
        'Organization not found: nonexistent',
      );
    });

    test('should return disabled settings', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpEnabled: false,
        adminMcpEnabledScopes: [],
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await getAdminMcpSettings('org-1');

      expect(result.enabled).toBe(false);
      expect(result.enabledScopes).toEqual([]);
    });

    test('should return settings with restricted admin list', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpAllowedAdmins: ['admin-1', 'admin-2'],
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await getAdminMcpSettings('org-1');

      expect(result.allowedAdmins).toEqual(['admin-1', 'admin-2']);
    });

    test('should return custom rate limit and TTL', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpRateLimitPerMin: 60,
        adminMcpConfirmationTtl: 600,
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await getAdminMcpSettings('org-1');

      expect(result.rateLimitPerMin).toBe(60);
      expect(result.confirmationTtlSeconds).toBe(600);
    });
  });

  describe('updateAdminMcpSettings', () => {
    test('should update enabled status', async () => {
      const updatedOrgData = createMockOrgSettings({ adminMcpEnabled: false });
      mockPrisma.organization.update.mockResolvedValue(updatedOrgData);

      const result = await updateAdminMcpSettings('org-1', { enabled: false });

      expect(result.enabled).toBe(false);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { adminMcpEnabled: false },
        select: {
          adminMcpEnabled: true,
          adminMcpEnabledScopes: true,
          adminMcpAllowedAdmins: true,
          adminMcpRateLimitPerMin: true,
          adminMcpConfirmationTtl: true,
        },
      });
    });

    test('should update enabled scopes', async () => {
      const newScopes = [AdminMcpScope.POLICIES, AdminMcpScope.ROLES, AdminMcpScope.WEBHOOKS];
      const updatedOrgData = createMockOrgSettings({
        adminMcpEnabledScopes: newScopes,
      });
      mockPrisma.organization.update.mockResolvedValue(updatedOrgData);

      const result = await updateAdminMcpSettings('org-1', {
        enabledScopes: newScopes,
      });

      expect(result.enabledScopes).toEqual(newScopes);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { adminMcpEnabledScopes: newScopes },
        select: expect.any(Object),
      });
    });

    test('should update allowed admins', async () => {
      const allowedAdmins = ['admin-1', 'admin-2', 'admin-3'];
      const updatedOrgData = createMockOrgSettings({
        adminMcpAllowedAdmins: allowedAdmins,
      });
      mockPrisma.organization.update.mockResolvedValue(updatedOrgData);

      const result = await updateAdminMcpSettings('org-1', { allowedAdmins });

      expect(result.allowedAdmins).toEqual(allowedAdmins);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { adminMcpAllowedAdmins: allowedAdmins },
        select: expect.any(Object),
      });
    });

    test('should update rate limit', async () => {
      const updatedOrgData = createMockOrgSettings({
        adminMcpRateLimitPerMin: 100,
      });
      mockPrisma.organization.update.mockResolvedValue(updatedOrgData);

      const result = await updateAdminMcpSettings('org-1', { rateLimitPerMin: 100 });

      expect(result.rateLimitPerMin).toBe(100);
    });

    test('should update confirmation TTL', async () => {
      const updatedOrgData = createMockOrgSettings({
        adminMcpConfirmationTtl: 900,
      });
      mockPrisma.organization.update.mockResolvedValue(updatedOrgData);

      const result = await updateAdminMcpSettings('org-1', {
        confirmationTtlSeconds: 900,
      });

      expect(result.confirmationTtlSeconds).toBe(900);
    });

    test('should update multiple fields at once', async () => {
      const updatedOrgData = createMockOrgSettings({
        adminMcpEnabled: false,
        adminMcpEnabledScopes: [AdminMcpScope.POLICIES],
        adminMcpRateLimitPerMin: 50,
      });
      mockPrisma.organization.update.mockResolvedValue(updatedOrgData);

      const result = await updateAdminMcpSettings('org-1', {
        enabled: false,
        enabledScopes: [AdminMcpScope.POLICIES],
        rateLimitPerMin: 50,
      });

      expect(result.enabled).toBe(false);
      expect(result.enabledScopes).toEqual([AdminMcpScope.POLICIES]);
      expect(result.rateLimitPerMin).toBe(50);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          adminMcpEnabled: false,
          adminMcpEnabledScopes: [AdminMcpScope.POLICIES],
          adminMcpRateLimitPerMin: 50,
        },
        select: expect.any(Object),
      });
    });

    test('should not update fields not provided', async () => {
      const updatedOrgData = createMockOrgSettings();
      mockPrisma.organization.update.mockResolvedValue(updatedOrgData);

      await updateAdminMcpSettings('org-1', {});

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {},
        select: expect.any(Object),
      });
    });
  });

  describe('isScopeEnabled', () => {
    test('should return true when scope is in enabled scopes', () => {
      const settings = createMockSettings({
        enabledScopes: [AdminMcpScope.POLICIES, AdminMcpScope.USERS],
      });

      expect(isScopeEnabled(settings, AdminMcpScope.POLICIES)).toBe(true);
      expect(isScopeEnabled(settings, AdminMcpScope.USERS)).toBe(true);
    });

    test('should return false when scope is not in enabled scopes', () => {
      const settings = createMockSettings({
        enabledScopes: [AdminMcpScope.POLICIES],
      });

      expect(isScopeEnabled(settings, AdminMcpScope.USERS)).toBe(false);
      expect(isScopeEnabled(settings, AdminMcpScope.ROLES)).toBe(false);
    });

    test('should return false when no scopes are enabled', () => {
      const settings = createMockSettings({
        enabledScopes: [],
      });

      expect(isScopeEnabled(settings, AdminMcpScope.POLICIES)).toBe(false);
    });

    test('should check all scope types', () => {
      const allScopes = Object.values(AdminMcpScope);
      const settings = createMockSettings({
        enabledScopes: allScopes,
      });

      for (const scope of allScopes) {
        expect(isScopeEnabled(settings, scope)).toBe(true);
      }
    });
  });

  describe('isAdminAllowed', () => {
    test('should return true when allowedAdmins is empty (all admins allowed)', () => {
      const settings = createMockSettings({
        allowedAdmins: [],
      });

      expect(isAdminAllowed(settings, 'any-admin')).toBe(true);
      expect(isAdminAllowed(settings, 'another-admin')).toBe(true);
    });

    test('should return true when admin is in allowed list', () => {
      const settings = createMockSettings({
        allowedAdmins: ['admin-1', 'admin-2', 'admin-3'],
      });

      expect(isAdminAllowed(settings, 'admin-1')).toBe(true);
      expect(isAdminAllowed(settings, 'admin-2')).toBe(true);
      expect(isAdminAllowed(settings, 'admin-3')).toBe(true);
    });

    test('should return false when admin is not in allowed list', () => {
      const settings = createMockSettings({
        allowedAdmins: ['admin-1', 'admin-2'],
      });

      expect(isAdminAllowed(settings, 'admin-3')).toBe(false);
      expect(isAdminAllowed(settings, 'other-admin')).toBe(false);
    });
  });

  describe('isAdminMcpAccessible', () => {
    test('should return accessible: true when fully configured', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpEnabled: true,
        adminMcpEnabledScopes: [AdminMcpScope.POLICIES],
        adminMcpAllowedAdmins: [],
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await isAdminMcpAccessible('org-1', 'admin-1');

      expect(result.accessible).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('should return accessible: false when admin MCP is disabled', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpEnabled: false,
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await isAdminMcpAccessible('org-1', 'admin-1');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('Admin MCP is not enabled for this organization');
    });

    test('should return accessible: false when admin is not in allowed list', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpEnabled: true,
        adminMcpAllowedAdmins: ['admin-2', 'admin-3'],
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await isAdminMcpAccessible('org-1', 'admin-1');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('Admin is not in the allowed admins list');
    });

    test('should return accessible: false when no scopes are enabled', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpEnabled: true,
        adminMcpEnabledScopes: [],
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await isAdminMcpAccessible('org-1', 'admin-1');

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('No scopes are enabled for admin MCP');
    });

    test('should allow admin when allowedAdmins is empty', async () => {
      const mockOrgData = createMockOrgSettings({
        adminMcpEnabled: true,
        adminMcpEnabledScopes: [AdminMcpScope.POLICIES],
        adminMcpAllowedAdmins: [],
      });
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrgData);

      const result = await isAdminMcpAccessible('org-1', 'any-admin');

      expect(result.accessible).toBe(true);
    });

    test('should throw when organization not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(isAdminMcpAccessible('nonexistent', 'admin-1')).rejects.toThrow(
        'Organization not found: nonexistent',
      );
    });
  });
});
