/**
 * Tests for Admin MCP Settings Router
 * Tests organization-level settings management for the Admin MCP Server feature
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminMcpScope } from '../../../../../packages/api/src/types/adminMcp.js';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';
import { createAdminContext, type MockPrisma } from '../../../../helpers/unit-test-mocks.js';

// Hoist mocks for proper initialization
const { mockGetAdminMcpSettings, mockUpdateAdminMcpSettings, mockLogAdminAction, mockPrisma } =
  vi.hoisted(() => ({
    mockGetAdminMcpSettings: vi.fn(),
    mockUpdateAdminMcpSettings: vi.fn(),
    mockLogAdminAction: vi.fn(),
    mockPrisma: {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    } satisfies Partial<MockPrisma>,
  }));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminActionType: {
    ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
  },
  AdminResourceType: {
    ORGANIZATION: 'ORGANIZATION',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminMcpSettings.js', () => ({
  getAdminMcpSettings: mockGetAdminMcpSettings,
  updateAdminMcpSettings: mockUpdateAdminMcpSettings,
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/lib/requestMeta.js', () => ({
  getRequestMetaFromTrpc: vi.fn(() => ({
    ipAddress: '192.168.1.1',
    userAgent: 'test-agent',
  })),
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => {
  const createChain = () => ({
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    output: vi.fn(() => createChain()),
    input: vi.fn(() => createChain()),
  });
  return {
    router: vi.fn((routes) => routes),
    adminProcedure: createChain(),
  };
});

import { adminMcpSettingsRouter as _adminMcpSettingsRouter } from '../../../../../packages/api/src/trpc/admin/adminMcpSettings.js';

interface AdminMcpSettingsResult {
  enabled: boolean;
  enabledScopes: AdminMcpScope[];
  allowedAdmins: string[];
  rateLimitPerMin: number;
  confirmationTtlSeconds: number;
}

interface ScopeResult {
  scope: AdminMcpScope;
  label: string;
  description: string;
  riskLevel: string;
  readTools: string[];
  writeTools: string[];
  toolCount: number;
}

interface AdminUser {
  id: string;
  email: string;
}

const adminMcpSettingsRouter = _adminMcpSettingsRouter as unknown as {
  get: TestableHandler<AdminMcpSettingsResult>;
  update: TestableHandler<AdminMcpSettingsResult>;
  getScopes: TestableHandler<ScopeResult[]>;
  getAdminUsers: TestableHandler<AdminUser[]>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe('adminMcpSettingsRouter', () => {
  describe('get', () => {
    test('should return admin MCP settings for organization', async () => {
      const mockSettings: AdminMcpSettingsResult = {
        enabled: true,
        enabledScopes: [AdminMcpScope.POLICIES, AdminMcpScope.USERS],
        allowedAdmins: ['admin-1', 'admin-2'],
        rateLimitPerMin: 60,
        confirmationTtlSeconds: 300,
      };
      mockGetAdminMcpSettings.mockResolvedValue(mockSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.get({ ctx });

      expect(result).toEqual(mockSettings);
      expect(mockGetAdminMcpSettings).toHaveBeenCalledWith('org-123');
    });

    test('should use organization ID from context', async () => {
      const mockSettings: AdminMcpSettingsResult = {
        enabled: false,
        enabledScopes: [],
        allowedAdmins: [],
        rateLimitPerMin: 30,
        confirmationTtlSeconds: 120,
      };
      mockGetAdminMcpSettings.mockResolvedValue(mockSettings);

      const ctx = createAdminContext({ organizationId: 'custom-org-456' });
      await adminMcpSettingsRouter.get({ ctx });

      expect(mockGetAdminMcpSettings).toHaveBeenCalledWith('custom-org-456');
    });

    test('should return settings with empty arrays', async () => {
      const mockSettings: AdminMcpSettingsResult = {
        enabled: true,
        enabledScopes: [],
        allowedAdmins: [],
        rateLimitPerMin: 100,
        confirmationTtlSeconds: 600,
      };
      mockGetAdminMcpSettings.mockResolvedValue(mockSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.get({ ctx });

      expect(result.enabledScopes).toEqual([]);
      expect(result.allowedAdmins).toEqual([]);
    });

    test('should propagate service errors', async () => {
      mockGetAdminMcpSettings.mockRejectedValue(new Error('Organization not found: org-123'));

      const ctx = createAdminContext();

      await expect(adminMcpSettingsRouter.get({ ctx })).rejects.toThrow(
        'Organization not found: org-123',
      );
    });
  });

  describe('update', () => {
    const defaultSettings: AdminMcpSettingsResult = {
      enabled: false,
      enabledScopes: [],
      allowedAdmins: [],
      rateLimitPerMin: 30,
      confirmationTtlSeconds: 300,
    };

    test('should update enabled setting', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      const updatedSettings = { ...defaultSettings, enabled: true };
      mockUpdateAdminMcpSettings.mockResolvedValue(updatedSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.update({
        ctx,
        input: { enabled: true },
      });

      expect(result.enabled).toBe(true);
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('org-123', { enabled: true });
    });

    test('should update enabledScopes', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      const newScopes = [AdminMcpScope.POLICIES, AdminMcpScope.ROLES];
      const updatedSettings = { ...defaultSettings, enabledScopes: newScopes };
      mockUpdateAdminMcpSettings.mockResolvedValue(updatedSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.update({
        ctx,
        input: { enabledScopes: newScopes },
      });

      expect(result.enabledScopes).toEqual(newScopes);
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('org-123', {
        enabledScopes: newScopes,
      });
    });

    test('should update allowedAdmins', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      const newAdmins = ['admin-1', 'admin-2', 'admin-3'];
      const updatedSettings = { ...defaultSettings, allowedAdmins: newAdmins };
      mockUpdateAdminMcpSettings.mockResolvedValue(updatedSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.update({
        ctx,
        input: { allowedAdmins: newAdmins },
      });

      expect(result.allowedAdmins).toEqual(newAdmins);
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('org-123', {
        allowedAdmins: newAdmins,
      });
    });

    test('should update rateLimitPerMin', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      const updatedSettings = { ...defaultSettings, rateLimitPerMin: 120 };
      mockUpdateAdminMcpSettings.mockResolvedValue(updatedSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.update({
        ctx,
        input: { rateLimitPerMin: 120 },
      });

      expect(result.rateLimitPerMin).toBe(120);
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('org-123', {
        rateLimitPerMin: 120,
      });
    });

    test('should update confirmationTtlSeconds', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      const updatedSettings = { ...defaultSettings, confirmationTtlSeconds: 600 };
      mockUpdateAdminMcpSettings.mockResolvedValue(updatedSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.update({
        ctx,
        input: { confirmationTtlSeconds: 600 },
      });

      expect(result.confirmationTtlSeconds).toBe(600);
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('org-123', {
        confirmationTtlSeconds: 600,
      });
    });

    test('should update multiple settings at once', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      const updatedSettings: AdminMcpSettingsResult = {
        enabled: true,
        enabledScopes: [AdminMcpScope.POLICIES],
        allowedAdmins: ['admin-1'],
        rateLimitPerMin: 60,
        confirmationTtlSeconds: 180,
      };
      mockUpdateAdminMcpSettings.mockResolvedValue(updatedSettings);

      const ctx = createAdminContext();
      const input = {
        enabled: true,
        enabledScopes: [AdminMcpScope.POLICIES],
        allowedAdmins: ['admin-1'],
        rateLimitPerMin: 60,
        confirmationTtlSeconds: 180,
      };
      const result = await adminMcpSettingsRouter.update({ ctx, input });

      expect(result).toEqual(updatedSettings);
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('org-123', input);
    });

    test('should log admin action on update', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      const updatedSettings = { ...defaultSettings, enabled: true };
      mockUpdateAdminMcpSettings.mockResolvedValue(updatedSettings);

      const ctx = createAdminContext();
      await adminMcpSettingsRouter.update({
        ctx,
        input: { enabled: true },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          adminUserId: 'admin-user-123',
          actionType: 'ORGANIZATION_UPDATE',
          resourceType: 'ORGANIZATION',
          resourceId: 'org-123',
          resourceName: 'Admin MCP Settings',
          actionDetails: { updated: { enabled: true } },
          beforeSnapshot: expect.objectContaining(defaultSettings),
          afterSnapshot: expect.objectContaining(updatedSettings),
        }),
      );
    });

    test('should include request metadata in admin action log', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      mockUpdateAdminMcpSettings.mockResolvedValue({ ...defaultSettings, enabled: true });

      const ctx = createAdminContext();
      await adminMcpSettingsRouter.update({
        ctx,
        input: { enabled: true },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
        }),
      );
    });

    test('should use organization ID from context for update', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      mockUpdateAdminMcpSettings.mockResolvedValue({ ...defaultSettings, enabled: true });

      const ctx = createAdminContext({ organizationId: 'another-org-789' });
      await adminMcpSettingsRouter.update({
        ctx,
        input: { enabled: true },
      });

      expect(mockGetAdminMcpSettings).toHaveBeenCalledWith('another-org-789');
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('another-org-789', { enabled: true });
    });

    test('should propagate service errors', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      mockUpdateAdminMcpSettings.mockRejectedValue(new Error('Database error'));

      const ctx = createAdminContext();

      await expect(
        adminMcpSettingsRouter.update({ ctx, input: { enabled: true } }),
      ).rejects.toThrow('Database error');
    });

    test('should handle empty input update', async () => {
      mockGetAdminMcpSettings.mockResolvedValue(defaultSettings);
      mockUpdateAdminMcpSettings.mockResolvedValue(defaultSettings);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.update({ ctx, input: {} });

      expect(result).toEqual(defaultSettings);
      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('org-123', {});
    });
  });

  describe('getScopes', () => {
    test('should return all scopes with metadata', async () => {
      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getScopes({ ctx });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(Object.keys(AdminMcpScope).length);
    });

    test('should include POLICIES scope with correct metadata', async () => {
      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getScopes({ ctx });

      const policiesScope = result.find((s) => s.scope === AdminMcpScope.POLICIES);
      expect(policiesScope).toBeDefined();
      expect(policiesScope?.label).toBe('Policy Management');
      expect(policiesScope?.description).toBe('Create, modify, and delete access control policies');
      expect(policiesScope?.riskLevel).toBe('MEDIUM');
      expect(policiesScope?.readTools).toContain('admin_list_policies');
      expect(policiesScope?.writeTools).toContain('admin_create_policy');
    });

    test('should include USERS scope with correct metadata', async () => {
      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getScopes({ ctx });

      const usersScope = result.find((s) => s.scope === AdminMcpScope.USERS);
      expect(usersScope).toBeDefined();
      expect(usersScope?.label).toBe('User Management');
      expect(usersScope?.riskLevel).toBe('HIGH');
    });

    test('should calculate toolCount correctly', async () => {
      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getScopes({ ctx });

      for (const scope of result) {
        expect(scope.toolCount).toBe(scope.readTools.length + scope.writeTools.length);
      }
    });

    test('should include all AdminMcpScope values', async () => {
      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getScopes({ ctx });

      const scopeValues = Object.values(AdminMcpScope);
      const returnedScopes = result.map((s) => s.scope);

      for (const scopeValue of scopeValues) {
        expect(returnedScopes).toContain(scopeValue);
      }
    });

    test('should include ANALYTICS scope with no write tools', async () => {
      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getScopes({ ctx });

      const analyticsScope = result.find((s) => s.scope === AdminMcpScope.ANALYTICS);
      expect(analyticsScope).toBeDefined();
      expect(analyticsScope?.writeTools).toEqual([]);
      expect(analyticsScope?.readTools.length).toBeGreaterThan(0);
    });

    test('should include AUDIT scope with no write tools', async () => {
      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getScopes({ ctx });

      const auditScope = result.find((s) => s.scope === AdminMcpScope.AUDIT);
      expect(auditScope).toBeDefined();
      expect(auditScope?.writeTools).toEqual([]);
      expect(auditScope?.riskLevel).toBe('LOW');
    });
  });

  describe('getAdminUsers', () => {
    test('should return admin users for organization', async () => {
      const mockAdminUsers = [
        { id: 'admin-1', email: 'admin1@example.com' },
        { id: 'admin-2', email: 'admin2@example.com' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockAdminUsers);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(result).toEqual(mockAdminUsers);
    });

    test('should filter by organization ID from context', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'specific-org' });
      await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'specific-org',
          }),
        }),
      );
    });

    test('should filter out deleted users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    test('should only include users with admin roles', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userRoles: {
              some: {
                role: {
                  isAdmin: true,
                  deletedAt: null,
                },
              },
            },
          }),
        }),
      );
    });

    test('should select only id and email fields', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            email: true,
          },
        }),
      );
    });

    test('should order by email ascending', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { email: 'asc' },
        }),
      );
    });

    test('should return empty array when no admin users exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(result).toEqual([]);
    });

    test('should return multiple admin users sorted by email', async () => {
      const mockAdminUsers = [
        { id: 'admin-3', email: 'alpha@example.com' },
        { id: 'admin-1', email: 'beta@example.com' },
        { id: 'admin-2', email: 'gamma@example.com' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockAdminUsers);

      const ctx = createAdminContext();
      const result = await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(result).toHaveLength(3);
      expect(result[0].email).toBe('alpha@example.com');
    });

    test('should propagate database errors', async () => {
      mockPrisma.user.findMany.mockRejectedValue(new Error('Database connection failed'));

      const ctx = createAdminContext();

      await expect(adminMcpSettingsRouter.getAdminUsers({ ctx })).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('organization isolation', () => {
    test('get should use organization from context', async () => {
      const mockSettings: AdminMcpSettingsResult = {
        enabled: true,
        enabledScopes: [],
        allowedAdmins: [],
        rateLimitPerMin: 30,
        confirmationTtlSeconds: 300,
      };
      mockGetAdminMcpSettings.mockResolvedValue(mockSettings);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminMcpSettingsRouter.get({ ctx });

      expect(mockGetAdminMcpSettings).toHaveBeenCalledWith('isolated-org');
    });

    test('update should use organization from context', async () => {
      const mockSettings: AdminMcpSettingsResult = {
        enabled: false,
        enabledScopes: [],
        allowedAdmins: [],
        rateLimitPerMin: 30,
        confirmationTtlSeconds: 300,
      };
      mockGetAdminMcpSettings.mockResolvedValue(mockSettings);
      mockUpdateAdminMcpSettings.mockResolvedValue({ ...mockSettings, enabled: true });

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminMcpSettingsRouter.update({ ctx, input: { enabled: true } });

      expect(mockUpdateAdminMcpSettings).toHaveBeenCalledWith('isolated-org', {
        enabled: true,
      });
    });

    test('getAdminUsers should filter by organization from context', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminMcpSettingsRouter.getAdminUsers({ ctx });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });
  });

  describe('admin action logging', () => {
    test('should log before and after snapshots', async () => {
      const beforeSettings: AdminMcpSettingsResult = {
        enabled: false,
        enabledScopes: [AdminMcpScope.POLICIES],
        allowedAdmins: ['admin-1'],
        rateLimitPerMin: 30,
        confirmationTtlSeconds: 300,
      };
      const afterSettings: AdminMcpSettingsResult = {
        enabled: true,
        enabledScopes: [AdminMcpScope.POLICIES, AdminMcpScope.USERS],
        allowedAdmins: ['admin-1', 'admin-2'],
        rateLimitPerMin: 60,
        confirmationTtlSeconds: 600,
      };

      mockGetAdminMcpSettings.mockResolvedValue(beforeSettings);
      mockUpdateAdminMcpSettings.mockResolvedValue(afterSettings);

      const ctx = createAdminContext();
      await adminMcpSettingsRouter.update({
        ctx,
        input: {
          enabled: true,
          enabledScopes: [AdminMcpScope.POLICIES, AdminMcpScope.USERS],
          allowedAdmins: ['admin-1', 'admin-2'],
          rateLimitPerMin: 60,
          confirmationTtlSeconds: 600,
        },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          beforeSnapshot: expect.objectContaining({
            enabled: false,
            enabledScopes: [AdminMcpScope.POLICIES],
          }),
          afterSnapshot: expect.objectContaining({
            enabled: true,
            enabledScopes: [AdminMcpScope.POLICIES, AdminMcpScope.USERS],
          }),
        }),
      );
    });

    test('should log the correct admin user ID', async () => {
      const mockSettings: AdminMcpSettingsResult = {
        enabled: false,
        enabledScopes: [],
        allowedAdmins: [],
        rateLimitPerMin: 30,
        confirmationTtlSeconds: 300,
      };
      mockGetAdminMcpSettings.mockResolvedValue(mockSettings);
      mockUpdateAdminMcpSettings.mockResolvedValue({ ...mockSettings, enabled: true });

      const ctx = createAdminContext({ userId: 'specific-admin-user' });
      await adminMcpSettingsRouter.update({ ctx, input: { enabled: true } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: 'specific-admin-user',
        }),
      );
    });
  });
});
