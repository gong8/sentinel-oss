/**
 * Tests for Admin Action Logs Router
 * Tests viewing and filtering of admin action logs
 */

import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockGetAdminActionLogs,
  mockExportAdminActionLogToPdf,
  mockHandler,
  mockInputHandler,
} = vi.hoisted(() => {
  type TestHandler = (opts: { ctx: unknown; input: unknown }) => unknown;
  const handler = vi.fn((fn: TestHandler): TestHandler => fn);
  const inputHandler = vi.fn((): { query: typeof handler; mutation: typeof handler } => ({
    query: handler,
    mutation: handler,
  }));
  return {
    mockPrisma: {
      adminActionLog: {
        findFirst: vi.fn(),
      },
      organization: {
        findUnique: vi.fn(),
      },
    },
    mockGetAdminActionLogs: vi.fn(),
    mockExportAdminActionLogToPdf: vi.fn(),
    mockHandler: handler,
    mockInputHandler: inputHandler,
  };
});

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AdminActionType: {
    USER_CREATE: 'USER_CREATE',
    USER_UPDATE: 'USER_UPDATE',
    USER_DELETE: 'USER_DELETE',
    USER_RESTORE: 'USER_RESTORE',
    USER_ROLES_UPDATE: 'USER_ROLES_UPDATE',
    USER_TOKEN_REFRESH: 'USER_TOKEN_REFRESH',
    USER_TOKEN_REVOKE: 'USER_TOKEN_REVOKE',
    ROLE_CREATE: 'ROLE_CREATE',
    ROLE_UPDATE: 'ROLE_UPDATE',
    ROLE_DELETE: 'ROLE_DELETE',
    ROLE_RESTORE: 'ROLE_RESTORE',
    POLICY_CREATE: 'POLICY_CREATE',
    POLICY_UPDATE: 'POLICY_UPDATE',
    POLICY_DELETE: 'POLICY_DELETE',
    POLICY_RESTORE: 'POLICY_RESTORE',
    POLICY_ENABLE: 'POLICY_ENABLE',
    POLICY_DISABLE: 'POLICY_DISABLE',
    POLICY_CONFLICT_RESOLVE: 'POLICY_CONFLICT_RESOLVE',
    MCP_SERVER_CREATE: 'MCP_SERVER_CREATE',
    MCP_SERVER_UPDATE: 'MCP_SERVER_UPDATE',
    MCP_SERVER_DELETE: 'MCP_SERVER_DELETE',
    MCP_SERVER_RESTORE: 'MCP_SERVER_RESTORE',
    MCP_SERVER_DISCOVER_TOOLS: 'MCP_SERVER_DISCOVER_TOOLS',
    MCP_SERVER_ORG_API_KEY_ADD: 'MCP_SERVER_ORG_API_KEY_ADD',
    MCP_SERVER_ORG_API_KEY_UPDATE: 'MCP_SERVER_ORG_API_KEY_UPDATE',
    MCP_SERVER_ORG_API_KEY_REMOVE: 'MCP_SERVER_ORG_API_KEY_REMOVE',
    OAUTH_DISCOVER: 'OAUTH_DISCOVER',
    OAUTH_CLIENT_REGISTER: 'OAUTH_CLIENT_REGISTER',
    OAUTH_CLIENT_CONFIGURE: 'OAUTH_CLIENT_CONFIGURE',
    OAUTH_FLOW_INITIATE: 'OAUTH_FLOW_INITIATE',
    OAUTH_FLOW_COMPLETE: 'OAUTH_FLOW_COMPLETE',
    OAUTH_TOKEN_REFRESH: 'OAUTH_TOKEN_REFRESH',
    OAUTH_TOKEN_REVOKE: 'OAUTH_TOKEN_REVOKE',
    OAUTH_DISCONNECT: 'OAUTH_DISCONNECT',
    AGENT_CREATE: 'AGENT_CREATE',
    AGENT_DELETE: 'AGENT_DELETE',
    AGENT_RESTORE: 'AGENT_RESTORE',
    PERMISSION_REQUEST_APPROVE: 'PERMISSION_REQUEST_APPROVE',
    PERMISSION_REQUEST_DENY: 'PERMISSION_REQUEST_DENY',
    ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
    SENSITIVE_FLAG_CREATE: 'SENSITIVE_FLAG_CREATE',
    SENSITIVE_FLAG_UPDATE: 'SENSITIVE_FLAG_UPDATE',
    SENSITIVE_FLAG_DELETE: 'SENSITIVE_FLAG_DELETE',
    SENSITIVE_OVERRIDE_CREATE: 'SENSITIVE_OVERRIDE_CREATE',
    SENSITIVE_OVERRIDE_UPDATE: 'SENSITIVE_OVERRIDE_UPDATE',
    SENSITIVE_OVERRIDE_DELETE: 'SENSITIVE_OVERRIDE_DELETE',
    SENSITIVE_APPROVAL_GRANTED: 'SENSITIVE_APPROVAL_GRANTED',
    SENSITIVE_APPROVAL_DENIED: 'SENSITIVE_APPROVAL_DENIED',
    WEBHOOK_ENDPOINT_CREATE: 'WEBHOOK_ENDPOINT_CREATE',
    WEBHOOK_ENDPOINT_UPDATE: 'WEBHOOK_ENDPOINT_UPDATE',
    WEBHOOK_ENDPOINT_DELETE: 'WEBHOOK_ENDPOINT_DELETE',
  },
  AdminResourceType: {
    USER: 'USER',
    ROLE: 'ROLE',
    POLICY: 'POLICY',
    MCP_SERVER: 'MCP_SERVER',
    OAUTH_CLIENT: 'OAUTH_CLIENT',
    AGENT: 'AGENT',
    PERMISSION_REQUEST: 'PERMISSION_REQUEST',
    ORGANIZATION: 'ORGANIZATION',
    SENSITIVE_FLAG: 'SENSITIVE_FLAG',
    SENSITIVE_OVERRIDE: 'SENSITIVE_OVERRIDE',
    SENSITIVE_APPROVAL: 'SENSITIVE_APPROVAL',
    WEBHOOK_ENDPOINT: 'WEBHOOK_ENDPOINT',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  getAdminActionLogs: mockGetAdminActionLogs,
}));

vi.mock('../../../../../packages/api/src/services/pdf.js', () => ({
  exportAdminActionLogToPdf: mockExportAdminActionLogToPdf,
}));

// Mock init module to provide test-friendly procedures
// The type assertion in mockHandler breaks TypeScript's inference chain from tRPC types
// allowing our test to pass simple { ctx, input } objects
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  adminProcedure: {
    query: mockHandler,
    input: mockInputHandler,
    mutation: mockHandler,
  },
}));

import { AdminActionType, AdminResourceType } from '@sentinel/db';
import { adminAdminActionLogsRouter as _adminAdminActionLogsRouter } from '../../../../../packages/api/src/trpc/admin/adminActionLogs.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
// Using Record<string, unknown> allows accessing any property on the result
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;
const adminAdminActionLogsRouter = _adminAdminActionLogsRouter as unknown as {
  list: TestableHandler;
  get: TestableHandler;
  exportPdf: TestableHandler<{ data: string; filename: string; contentType: string }>;
};

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
): { auth: { organizationId: string; user: { id: string } } } {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
    },
  };
}

describe('adminAdminActionLogsRouter', () => {
  describe('list', () => {
    test('should list logs with organization filter only', async () => {
      const mockLogs = {
        total: 2,
        entries: [
          { id: 'log-1', actionType: 'CREATE' },
          { id: 'log-2', actionType: 'UPDATE' },
        ],
      };
      mockGetAdminActionLogs.mockResolvedValue(mockLogs);

      const ctx = createMockContext();
      const input = {};

      const result = await adminAdminActionLogsRouter.list({ ctx, input });

      expect(result).toEqual(mockLogs);
      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
      });
    });

    test('should filter by adminUserId', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 1, entries: [] });

      const ctx = createMockContext();
      const input = { adminUserId: 'admin-456' };

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
      });
    });

    test('should filter by actionType', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 1, entries: [] });

      const ctx = createMockContext();
      const input = { actionType: AdminActionType.USER_DELETE };

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
        actionType: 'USER_DELETE',
      });
    });

    test('should filter by resourceType', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 1, entries: [] });

      const ctx = createMockContext();
      const input = { resourceType: AdminResourceType.POLICY };

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
        resourceType: 'POLICY',
      });
    });

    test('should filter by resourceId', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 1, entries: [] });

      const ctx = createMockContext();
      const input = { resourceId: 'resource-789' };

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
        resourceId: 'resource-789',
      });
    });

    test('should filter by date range', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 1, entries: [] });

      const ctx = createMockContext();
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const input = { startDate, endDate };

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
        startDate,
        endDate,
      });
    });

    test('should apply pagination', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 100, entries: [] });

      const ctx = createMockContext();
      const input = { limit: 25, offset: 50 };

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
        limit: 25,
        offset: 50,
      });
    });

    test('should combine all filters', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 1, entries: [] });

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const input = {
        adminUserId: 'admin-456',
        actionType: AdminActionType.USER_UPDATE,
        resourceType: AdminResourceType.USER,
        resourceId: 'user-789',
        startDate,
        endDate,
        limit: 10,
        offset: 5,
      };

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'custom-org',
        adminUserId: 'admin-456',
        actionType: 'USER_UPDATE',
        resourceType: 'USER',
        resourceId: 'user-789',
        startDate,
        endDate,
        limit: 10,
        offset: 5,
      });
    });

    test('should return empty results', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });

      const ctx = createMockContext();
      const input = {};

      const result = await adminAdminActionLogsRouter.list({ ctx, input });

      expect(result).toEqual({ total: 0, entries: [] });
    });

    test('should use organization from context', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });

      const ctx = createMockContext({ organizationId: 'different-org' });
      const input = {};

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'different-org',
      });
    });
  });

  describe('get', () => {
    const mockLogEntry = {
      id: 'log-123',
      organizationId: 'org-123',
      adminUserId: 'admin-456',
      actionType: 'CREATE',
      resourceType: 'USER',
      resourceId: 'user-789',
      resourceName: 'Test User',
      actionDetails: { action: 'created user' },
      timestamp: new Date('2024-01-15'),
      adminUser: {
        id: 'admin-456',
        email: 'admin@example.com',
      },
    };

    test('should get log entry by id', async () => {
      mockPrisma.adminActionLog.findFirst.mockResolvedValue(mockLogEntry);

      const ctx = createMockContext();
      const input = { id: 'log-123' };

      const result = await adminAdminActionLogsRouter.get({ ctx, input });

      expect(result).toEqual(mockLogEntry);
      expect(mockPrisma.adminActionLog.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'log-123',
          organizationId: 'org-123',
        },
        include: {
          adminUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    });

    test('should throw NOT_FOUND when entry does not exist', async () => {
      mockPrisma.adminActionLog.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminAdminActionLogsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminAdminActionLogsRouter.get({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Admin action log entry not found',
      });
    });

    test('should use organization filter for isolation', async () => {
      mockPrisma.adminActionLog.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'custom-org' });
      const input = { id: 'log-123' };

      try {
        await adminAdminActionLogsRouter.get({ ctx, input });
      } catch {
        // Expected to throw
      }

      expect(mockPrisma.adminActionLog.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'log-123',
          organizationId: 'custom-org',
        },
        include: {
          adminUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    });

    test('should include adminUser in response', async () => {
      mockPrisma.adminActionLog.findFirst.mockResolvedValue(mockLogEntry);

      const ctx = createMockContext();
      const input = { id: 'log-123' };

      const result = await adminAdminActionLogsRouter.get({ ctx, input });

      expect(result.adminUser).toEqual({
        id: 'admin-456',
        email: 'admin@example.com',
      });
    });

    test('should not find entries from other organizations', async () => {
      // Entry exists but belongs to different org, so findFirst returns null
      mockPrisma.adminActionLog.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'log-from-org-B' };

      await expect(adminAdminActionLogsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
    });
  });

  describe('organization isolation', () => {
    test('list should only return logs for current organization', async () => {
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });

      const ctx = createMockContext({ organizationId: 'isolated-org' });
      const input = {};

      await adminAdminActionLogsRouter.list({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'isolated-org',
      });
    });

    test('get should enforce organization boundary', async () => {
      mockPrisma.adminActionLog.findFirst.mockResolvedValue(null);

      const ctx = createMockContext({ organizationId: 'org-A' });
      const input = { id: 'log-from-org-B' };

      await expect(adminAdminActionLogsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);

      expect(mockPrisma.adminActionLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-A',
          }),
        }),
      );
    });
  });

  describe('exportPdf', () => {
    const mockOrganization = {
      id: 'org-123',
      name: 'Test Organization',
    };

    const mockLogEntries = {
      total: 2,
      entries: [
        {
          id: 'log-1',
          actionType: 'CREATE',
          resourceType: 'USER',
          resourceId: 'user-1',
          resourceName: 'John Doe',
          reason: 'New employee onboarding',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          adminUser: { email: 'admin@example.com' },
          ipAddress: '192.168.1.1',
        },
        {
          id: 'log-2',
          actionType: 'UPDATE',
          resourceType: 'POLICY',
          resourceId: 'policy-1',
          resourceName: 'Access Policy',
          reason: null,
          timestamp: new Date('2024-01-16T14:30:00Z'),
          adminUser: null,
          ipAddress: '10.0.0.1',
        },
      ],
    };

    const mockPdfBuffer = Buffer.from('mock-pdf-content');

    test('should export PDF successfully with entries', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue(mockLogEntries);
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const input = { limit: 500 };

      const result = await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(result).toEqual({
        data: mockPdfBuffer.toString('base64'),
        filename: expect.stringMatching(/^admin-action-log-\d{4}-\d{2}-\d{2}\.pdf$/),
        contentType: 'application/pdf',
      });
    });

    test('should throw NOT_FOUND when organization does not exist', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { limit: 500 };

      await expect(adminAdminActionLogsRouter.exportPdf({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminAdminActionLogsRouter.exportPdf({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    });

    test('should fetch organization by context organizationId', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext({ organizationId: 'custom-org-id' });
      const input = { limit: 500 };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'custom-org-id' },
        select: { name: true },
      });
    });

    test('should pass filters to getAdminActionLogs', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const input = {
        adminUserId: 'admin-456',
        actionType: AdminActionType.MCP_SERVER_DELETE,
        resourceType: AdminResourceType.MCP_SERVER,
        resourceId: 'server-123',
        startDate,
        endDate,
        limit: 100,
      };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith({
        organizationId: 'org-123',
        adminUserId: 'admin-456',
        actionType: 'MCP_SERVER_DELETE',
        resourceType: 'MCP_SERVER',
        resourceId: 'server-123',
        startDate,
        endDate,
        limit: 100,
        offset: 0,
      });
    });

    test('should transform entries to PDF format correctly', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue(mockLogEntries);
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const input = { limit: 500 };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockExportAdminActionLogToPdf).toHaveBeenCalledWith(
        [
          {
            id: 'log-1',
            actionType: 'CREATE',
            resourceType: 'USER',
            resourceId: 'user-1',
            resourceName: 'John Doe',
            reason: 'New employee onboarding',
            timestamp: mockLogEntries.entries[0].timestamp,
            adminEmail: 'admin@example.com',
            ipAddress: '192.168.1.1',
          },
          {
            id: 'log-2',
            actionType: 'UPDATE',
            resourceType: 'POLICY',
            resourceId: 'policy-1',
            resourceName: 'Access Policy',
            reason: null,
            timestamp: mockLogEntries.entries[1].timestamp,
            adminEmail: null,
            ipAddress: '10.0.0.1',
          },
        ],
        'Test Organization',
        {
          startDate: undefined,
          endDate: undefined,
          actionType: undefined,
          resourceType: undefined,
        },
      );
    });

    test('should pass filter options to PDF generator', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-06-30');
      const input = {
        actionType: AdminActionType.USER_CREATE,
        resourceType: AdminResourceType.USER,
        startDate,
        endDate,
        limit: 500,
      };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockExportAdminActionLogToPdf).toHaveBeenCalledWith([], 'Test Organization', {
        startDate,
        endDate,
        actionType: 'USER_CREATE',
        resourceType: 'USER',
      });
    });

    test('should return base64-encoded PDF data', async () => {
      const specificPdfBuffer = Buffer.from('specific-pdf-content-for-base64-test');
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(specificPdfBuffer);

      const ctx = createMockContext();
      const input = { limit: 500 };

      const result = await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(result.data).toBe(specificPdfBuffer.toString('base64'));
      expect(Buffer.from(result.data, 'base64').toString()).toBe(
        'specific-pdf-content-for-base64-test',
      );
    });

    test('should generate filename with current date', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const input = { limit: 500 };

      const result = await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      // Filename should match pattern: admin-action-log-YYYY-MM-DD.pdf
      expect(result.filename).toMatch(/^admin-action-log-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.contentType).toBe('application/pdf');
    });

    test('should handle entries with null adminUser', async () => {
      const entriesWithNullAdmin = {
        total: 1,
        entries: [
          {
            id: 'log-1',
            actionType: 'CREATE',
            resourceType: 'USER',
            resourceId: 'user-1',
            resourceName: 'Test User',
            reason: null,
            timestamp: new Date('2024-01-15'),
            adminUser: null,
            ipAddress: '127.0.0.1',
          },
        ],
      };

      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue(entriesWithNullAdmin);
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const input = { limit: 500 };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockExportAdminActionLogToPdf).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            adminEmail: null,
          }),
        ]),
        expect.any(String),
        expect.any(Object),
      );
    });

    test('should respect custom limit', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      // Note: Default limit of 500 is applied by Zod schema validation
      // Here we test that a custom limit is passed through correctly
      const input = { limit: 250 };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockGetAdminActionLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 250,
        }),
      );
    });

    test('should handle empty entries list', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const input = { limit: 500 };

      const result = await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockExportAdminActionLogToPdf).toHaveBeenCalledWith(
        [],
        'Test Organization',
        expect.any(Object),
      );
      expect(result.data).toBeDefined();
    });

    test('should use organization from context for all operations', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ name: 'Isolated Org' });
      mockGetAdminActionLogs.mockResolvedValue({ total: 0, entries: [] });
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext({ organizationId: 'isolated-org-id' });
      const input = { limit: 500 };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      // Organization lookup uses context org ID
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'isolated-org-id' },
        select: { name: true },
      });

      // Log fetching uses context org ID
      expect(mockGetAdminActionLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'isolated-org-id',
        }),
      );
    });

    test('should handle large number of entries', async () => {
      const manyEntries = {
        total: 1000,
        entries: Array.from({ length: 1000 }, (_, i) => ({
          id: `log-${i}`,
          actionType: 'CREATE',
          resourceType: 'USER',
          resourceId: `user-${i}`,
          resourceName: `User ${i}`,
          reason: null,
          timestamp: new Date('2024-01-15'),
          adminUser: { email: `admin${i}@example.com` },
          ipAddress: '127.0.0.1',
        })),
      };

      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockGetAdminActionLogs.mockResolvedValue(manyEntries);
      mockExportAdminActionLogToPdf.mockResolvedValue(mockPdfBuffer);

      const ctx = createMockContext();
      const input = { limit: 1000 };

      await adminAdminActionLogsRouter.exportPdf({ ctx, input });

      expect(mockExportAdminActionLogToPdf).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'log-0' }),
          expect.objectContaining({ id: 'log-999' }),
        ]),
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
