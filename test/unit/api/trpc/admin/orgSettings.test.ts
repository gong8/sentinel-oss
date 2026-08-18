/**
 * Tests for Admin Organization Settings Router
 * Tests organization-wide settings management operations including get and update
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';
import { createAdminContext } from '../../../../helpers/unit-test-mocks.js';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogAdminAction, mockGetActionDisplayName, mockGetRequestMetaFromTrpc } =
  vi.hoisted(() => ({
    mockPrisma: {
      organizationSettings: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    },
    mockLogAdminAction: vi.fn(),
    mockGetActionDisplayName: vi.fn(() => 'Updated Organization'),
    mockGetRequestMetaFromTrpc: vi.fn(() => ({ ipAddress: '127.0.0.1', userAgent: 'test' })),
  }));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminActionType: { ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE' },
  AdminResourceType: { ORGANIZATION: 'ORGANIZATION' },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/lib/adminActionLabels.js', () => ({
  getActionDisplayName: mockGetActionDisplayName,
}));

vi.mock('../../../../../packages/api/src/lib/requestMeta.js', () => ({
  getRequestMetaFromTrpc: mockGetRequestMetaFromTrpc,
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

import { adminOrgSettingsRouter as _adminOrgSettingsRouter } from '../../../../../packages/api/src/trpc/admin/orgSettings.js';

interface OrganizationSettings {
  id: string;
  organizationId: string;
  defaultTimezone: string;
  paramHistoryRetentionDays: number;
}

const adminOrgSettingsRouter = _adminOrgSettingsRouter as unknown as {
  get: TestableHandler<OrganizationSettings>;
  update: TestableHandler<OrganizationSettings>;
};

function createMockSettings(overrides: Partial<OrganizationSettings> = {}): OrganizationSettings {
  return {
    id: 'settings-123',
    organizationId: 'org-123',
    defaultTimezone: 'UTC',
    paramHistoryRetentionDays: 30,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminOrgSettingsRouter', () => {
  describe('get', () => {
    test('should return existing organization settings', async () => {
      const mockSettings = createMockSettings();
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(mockSettings);

      const ctx = createAdminContext();
      const result = await adminOrgSettingsRouter.get({ ctx, input: undefined });

      expect(result).toEqual(mockSettings);
      expect(mockPrisma.organizationSettings.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
      });
    });

    test('should create default settings when not exists', async () => {
      const newSettings = createMockSettings();
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(null);
      mockPrisma.organizationSettings.create.mockResolvedValue(newSettings);

      const ctx = createAdminContext();
      const result = await adminOrgSettingsRouter.get({ ctx, input: undefined });

      expect(result).toEqual(newSettings);
      expect(mockPrisma.organizationSettings.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-123' },
      });
    });

    test('should scope query to organization', async () => {
      const mockSettings = createMockSettings({ organizationId: 'custom-org' });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(mockSettings);

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminOrgSettingsRouter.get({ ctx, input: undefined });

      expect(mockPrisma.organizationSettings.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'custom-org' },
      });
    });
  });

  describe('update', () => {
    test('should update organization settings successfully and log admin action', async () => {
      const existingSettings = createMockSettings();
      const updatedSettings = createMockSettings({ defaultTimezone: 'America/New_York' });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(existingSettings);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(updatedSettings);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext();
      const result = await adminOrgSettingsRouter.update({
        ctx,
        input: { defaultTimezone: 'America/New_York' },
      });

      expect(result).toEqual(updatedSettings);
      expect(mockPrisma.organizationSettings.upsert).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        create: {
          organizationId: 'org-123',
          defaultTimezone: 'America/New_York',
        },
        update: { defaultTimezone: 'America/New_York' },
      });
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          actionType: 'ORGANIZATION_UPDATE',
          resourceType: 'ORGANIZATION',
          resourceId: 'org-123',
          resourceName: 'Organization Settings',
        }),
      );
    });

    test('should update defaultTimezone', async () => {
      const existingSettings = createMockSettings();
      const updatedSettings = createMockSettings({ defaultTimezone: 'America/New_York' });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(existingSettings);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(updatedSettings);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext();
      const result = await adminOrgSettingsRouter.update({
        ctx,
        input: { defaultTimezone: 'America/New_York' },
      });

      expect(result.defaultTimezone).toBe('America/New_York');
    });

    test('should update paramHistoryRetentionDays', async () => {
      const existingSettings = createMockSettings();
      const updatedSettings = createMockSettings({ paramHistoryRetentionDays: 90 });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(existingSettings);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(updatedSettings);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext();
      const result = await adminOrgSettingsRouter.update({
        ctx,
        input: { paramHistoryRetentionDays: 90 },
      });

      expect(result.paramHistoryRetentionDays).toBe(90);
    });

    test('should update multiple settings at once', async () => {
      const existingSettings = createMockSettings();
      const updatedSettings = createMockSettings({
        defaultTimezone: 'Europe/London',
        paramHistoryRetentionDays: 60,
      });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(existingSettings);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(updatedSettings);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext();
      const input = {
        defaultTimezone: 'Europe/London',
        paramHistoryRetentionDays: 60,
      };
      const result = await adminOrgSettingsRouter.update({ ctx, input });

      expect(result).toEqual(updatedSettings);
      expect(mockPrisma.organizationSettings.upsert).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        create: {
          organizationId: 'org-123',
          ...input,
        },
        update: input,
      });
    });

    test('should create settings if not exists (upsert)', async () => {
      const newSettings = createMockSettings({ defaultTimezone: 'America/New_York' });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(null);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(newSettings);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext();
      await adminOrgSettingsRouter.update({
        ctx,
        input: { defaultTimezone: 'America/New_York' },
      });

      expect(mockPrisma.organizationSettings.upsert).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        create: expect.objectContaining({ organizationId: 'org-123' }),
        update: expect.anything(),
      });
    });

    test('should scope update to organization', async () => {
      const existingSettings = createMockSettings({ organizationId: 'custom-org' });
      const updatedSettings = createMockSettings({ organizationId: 'custom-org' });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(existingSettings);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(updatedSettings);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminOrgSettingsRouter.update({
        ctx,
        input: { defaultTimezone: 'America/New_York' },
      });

      expect(mockPrisma.organizationSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'custom-org' },
          create: expect.objectContaining({ organizationId: 'custom-org' }),
        }),
      );
    });

    test('should handle empty input (no changes)', async () => {
      const existingSettings = createMockSettings();
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(existingSettings);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(existingSettings);
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext();
      const result = await adminOrgSettingsRouter.update({ ctx, input: {} });

      expect(result).toEqual(existingSettings);
      expect(mockPrisma.organizationSettings.upsert).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        create: { organizationId: 'org-123' },
        update: {},
      });
    });
  });

  describe('organization isolation', () => {
    test('get should filter by organization', async () => {
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(null);
      mockPrisma.organizationSettings.create.mockResolvedValue(
        createMockSettings({ organizationId: 'isolated-org' }),
      );

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminOrgSettingsRouter.get({ ctx, input: undefined });

      expect(mockPrisma.organizationSettings.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'isolated-org' },
      });
      expect(mockPrisma.organizationSettings.create).toHaveBeenCalledWith({
        data: { organizationId: 'isolated-org' },
      });
    });

    test('update should filter by organization', async () => {
      const existingSettings = createMockSettings({ organizationId: 'isolated-org' });
      mockPrisma.organizationSettings.findUnique.mockResolvedValue(existingSettings);
      mockPrisma.organizationSettings.upsert.mockResolvedValue(
        createMockSettings({ organizationId: 'isolated-org' }),
      );
      mockLogAdminAction.mockResolvedValue(undefined);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminOrgSettingsRouter.update({
        ctx,
        input: { defaultTimezone: 'America/New_York' },
      });

      expect(mockPrisma.organizationSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'isolated-org' },
          create: expect.objectContaining({ organizationId: 'isolated-org' }),
        }),
      );
    });
  });
});
