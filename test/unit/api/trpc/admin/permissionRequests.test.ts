/**
 * Unit tests for Admin Permission Requests Router
 * Tests MCP server approval workflow (lines 165-306)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type TestableHandler,
  createAdminContext,
  createMcpServerRequestData,
  createMockMcpServer,
  createMockPermissionRequest,
  createMockPolicy,
  expectTRPCError,
} from '../../../../helpers/unit-test-mocks.js';

// ============================================================================
// Mock Setup
// ============================================================================

const {
  mockPrisma,
  mockMcpService,
  mockCrypto,
  mockAdminAction,
  mockToolValidation,
  mockPolicy,
  mockLogger,
} = vi.hoisted(() => ({
  mockPrisma: {
    permissionRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    mcpServer: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    mcpTool: {
      findMany: vi.fn(),
    },
    policy: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: unknown) =>
      typeof fn === 'function' ? fn(mockPrisma) : Promise.resolve([]),
    ),
  },
  mockMcpService: {
    validateMcpServerUrl: vi.fn(),
    discoverTools: vi.fn(),
    isSentinelMcpServerUrl: vi.fn(),
  },
  mockCrypto: {
    encryptString: vi.fn(),
  },
  mockAdminAction: {
    logAdminAction: vi.fn(),
  },
  mockToolValidation: {
    validateToolNamesForOrganization: vi.fn(),
    getToolValidationErrorMessage: vi.fn(),
  },
  mockPolicy: {
    generatePolicyDescription: vi.fn(),
    generatePolicySlug: vi.fn(),
  },
  mockLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  PermissionRequestStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    DENIED: 'DENIED',
    WITHDRAWN: 'WITHDRAWN',
  },
  PermissionRequestType: {
    TOOL_ACCESS: 'TOOL_ACCESS',
    MCP_SERVER: 'MCP_SERVER',
    DENY_REMOVAL: 'DENY_REMOVAL',
  },
  PolicyEffect: { ALLOW: 'ALLOW', DENY: 'DENY' },
  AdminActionType: {
    PERMISSION_REQUEST_APPROVE: 'PERMISSION_REQUEST_APPROVE',
    PERMISSION_REQUEST_DENY: 'PERMISSION_REQUEST_DENY',
    MCP_SERVER_CREATE: 'MCP_SERVER_CREATE',
    POLICY_CREATE: 'POLICY_CREATE',
    POLICY_DELETE: 'POLICY_DELETE',
    DENY_POLICY_REMOVAL_APPROVE: 'DENY_POLICY_REMOVAL_APPROVE',
    DENY_POLICY_REMOVAL_DENY: 'DENY_POLICY_REMOVAL_DENY',
  },
  AdminResourceType: {
    PERMISSION_REQUEST: 'PERMISSION_REQUEST',
    MCP_SERVER: 'MCP_SERVER',
    POLICY: 'POLICY',
  },
  McpAuthType: { NONE: 'NONE', API_KEY: 'API_KEY', OAUTH: 'OAUTH' },
}));

vi.mock('../../../../../packages/api/src/services/mcp.js', () => ({
  validateMcpServerUrl: mockMcpService.validateMcpServerUrl,
  discoverTools: mockMcpService.discoverTools,
  isSentinelMcpServerUrl: mockMcpService.isSentinelMcpServerUrl,
  SENTINEL_SELF_MCP_SERVER_ERROR: 'Cannot add Sentinel as an MCP server',
}));

vi.mock('../../../../../packages/api/src/lib/crypto.js', () => ({
  encryptString: mockCrypto.encryptString,
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockAdminAction.logAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/toolValidation.js', () => ({
  validateToolNamesForOrganization: mockToolValidation.validateToolNamesForOrganization,
  getToolValidationErrorMessage: mockToolValidation.getToolValidationErrorMessage,
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  generatePolicyDescription: mockPolicy.generatePolicyDescription,
  generatePolicySlug: mockPolicy.generatePolicySlug,
}));

vi.mock('../../../../../packages/api/src/lib/logger.js', () => ({ logger: mockLogger }));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => {
  const createProcedure = () => ({
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  });
  return {
    router: vi.fn((routes) => routes),
    adminProcedure: createProcedure(),
    approvalWorkflowsProcedure: createProcedure(),
  };
});

import { McpAuthType, PermissionRequestStatus, PermissionRequestType } from '@sentinel/db';
import { adminPermissionRequestsRouter as _router } from '../../../../../packages/api/src/trpc/admin/permissionRequests.js';

const router = _router as unknown as {
  approve: TestableHandler;
  get: TestableHandler;
  list: TestableHandler;
  deny: TestableHandler;
  getDenyPolicyDetails: TestableHandler<{
    status: string;
    policy: { slug: string; id: string; description: string | null } | null;
    warnings: string[];
  }>;
};

// ============================================================================
// Test Utilities
// ============================================================================

function setupMcpServerApprovalMocks(overrides: {
  request?: ReturnType<typeof createMockPermissionRequest>;
  mcpServer?: ReturnType<typeof createMockMcpServer>;
  validationSuccess?: boolean;
}): void {
  const request =
    overrides.request ??
    createMockPermissionRequest({
      type: PermissionRequestType.MCP_SERVER,
      toolNames: [],
      data: createMcpServerRequestData({
        name: 'GitHub MCP',
        url: 'https://github-mcp.example.com',
      }),
    });
  const mcpServer =
    overrides.mcpServer ??
    createMockMcpServer({ name: 'GitHub MCP', url: 'https://github-mcp.example.com' });

  mockPrisma.permissionRequest.findFirst.mockResolvedValue(request);
  mockMcpService.isSentinelMcpServerUrl.mockReturnValue(false);
  mockMcpService.validateMcpServerUrl.mockResolvedValue({
    success: overrides.validationSuccess ?? true,
    tools: [],
  });
  mockPrisma.mcpServer.create.mockResolvedValue(mcpServer);
  mockPrisma.permissionRequest.update.mockResolvedValue({
    ...request,
    status: PermissionRequestStatus.APPROVED,
    reviewedBy: 'admin-user-123',
    reviewedAt: new Date(),
  });
  mockAdminAction.logAdminAction.mockResolvedValue(undefined);
  mockMcpService.discoverTools.mockResolvedValue(undefined);
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminPermissionRequestsRouter', () => {
  describe('approve - MCP_SERVER type', () => {
    test('should approve MCP_SERVER request successfully with authType NONE', async () => {
      setupMcpServerApprovalMocks({});

      const result = await router.approve({
        ctx: createAdminContext(),
        input: { id: 'request-123' },
      });

      expect(result.status).toBe(PermissionRequestStatus.APPROVED);
      expect(mockPrisma.mcpServer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
          name: 'GitHub MCP',
          url: 'https://github-mcp.example.com',
          authType: McpAuthType.NONE,
          trusted: false,
        }),
      });
      expect(mockMcpService.discoverTools).toHaveBeenCalledWith(
        'org-123',
        'mcp-server-123',
        'admin-user-123',
      );
    });

    test('should approve MCP_SERVER request with API_KEY auth', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({
          name: 'Private MCP',
          url: 'https://private-mcp.example.com',
          authType: McpAuthType.API_KEY,
          apiKey: 'original-api-key',
        }),
      });
      const mcpServer = createMockMcpServer({
        id: 'mcp-server-456',
        name: 'Private MCP',
        url: 'https://private-mcp.example.com',
        authType: McpAuthType.API_KEY,
        apiKey: 'encrypted-api-key',
      });

      mockPrisma.permissionRequest.findFirst.mockResolvedValue(request);
      mockMcpService.isSentinelMcpServerUrl.mockReturnValue(false);
      mockMcpService.validateMcpServerUrl.mockResolvedValue({ success: true, tools: [] });
      mockCrypto.encryptString.mockReturnValue('encrypted-api-key');
      mockPrisma.mcpServer.create.mockResolvedValue(mcpServer);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...request,
        status: PermissionRequestStatus.APPROVED,
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);
      mockMcpService.discoverTools.mockResolvedValue(undefined);

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockCrypto.encryptString).toHaveBeenCalledWith('original-api-key');
      expect(mockPrisma.mcpServer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ apiKey: 'encrypted-api-key' }),
      });
    });

    test('should use admin-provided API key over request API key', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({
          authType: McpAuthType.API_KEY,
          apiKey: 'original-api-key',
        }),
      });
      setupMcpServerApprovalMocks({ request });
      mockCrypto.encryptString.mockReturnValue('encrypted-admin-key');

      await router.approve({
        ctx: createAdminContext(),
        input: { id: 'request-123', apiKey: 'admin-provided-key' },
      });

      expect(mockCrypto.encryptString).toHaveBeenCalledWith('admin-provided-key');
      expect(mockMcpService.validateMcpServerUrl).toHaveBeenCalledWith(
        expect.any(String),
        McpAuthType.API_KEY,
        { apiKey: 'admin-provided-key' },
      );
    });

    test('should throw error for invalid MCP server data', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(
        createMockPermissionRequest({
          type: PermissionRequestType.MCP_SERVER,
          data: { invalid: 'data' },
        }),
      );

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'INTERNAL_SERVER_ERROR',
        'Invalid MCP server data in request',
      );
    });

    test('should throw error for Sentinel self-referential URL', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(
        createMockPermissionRequest({
          type: PermissionRequestType.MCP_SERVER,
          data: createMcpServerRequestData(),
        }),
      );
      mockMcpService.isSentinelMcpServerUrl.mockReturnValue(true);

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'BAD_REQUEST',
        'Cannot add Sentinel as an MCP server',
      );
    });

    test('should throw error when MCP server validation fails', async () => {
      setupMcpServerApprovalMocks({ validationSuccess: false });
      mockMcpService.validateMcpServerUrl.mockResolvedValue({
        success: false,
        error: 'Connection refused',
      });

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'PRECONDITION_FAILED',
        /Connection refused/,
      );
    });

    test('should skip validation for API_KEY auth without key', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({ authType: McpAuthType.API_KEY }),
      });
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(request);
      mockMcpService.isSentinelMcpServerUrl.mockReturnValue(false);
      mockPrisma.mcpServer.create.mockResolvedValue(createMockMcpServer());
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...request,
        status: PermissionRequestStatus.APPROVED,
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockMcpService.validateMcpServerUrl).not.toHaveBeenCalled();
      expect(mockMcpService.discoverTools).not.toHaveBeenCalled();
    });

    test('should log both permission request approval and MCP server creation', async () => {
      setupMcpServerApprovalMocks({});

      await router.approve({
        ctx: createAdminContext(),
        input: { id: 'request-123', reviewNote: 'Approved by admin' },
      });

      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PERMISSION_REQUEST_APPROVE',
          resourceType: 'PERMISSION_REQUEST',
          resourceId: 'request-123',
        }),
      );
      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'MCP_SERVER_CREATE',
          resourceType: 'MCP_SERVER',
          resourceId: 'mcp-server-123',
        }),
      );
      expect(mockAdminAction.logAdminAction).toHaveBeenCalledTimes(2);
    });

    test('should handle tool discovery failure gracefully', async () => {
      setupMcpServerApprovalMocks({});
      mockMcpService.discoverTools.mockRejectedValue(new Error('Tool discovery failed'));

      const result = await router.approve({
        ctx: createAdminContext(),
        input: { id: 'request-123' },
      });

      expect(result.status).toBe(PermissionRequestStatus.APPROVED);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to discover tools'),
        expect.any(Error),
      );
    });

    test('should skip tool discovery for OAuth auth type', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({ authType: McpAuthType.OAUTH }),
      });
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(request);
      mockMcpService.isSentinelMcpServerUrl.mockReturnValue(false);
      mockMcpService.validateMcpServerUrl.mockResolvedValue({ success: true, tools: [] });
      mockPrisma.mcpServer.create.mockResolvedValue(
        createMockMcpServer({ authType: McpAuthType.OAUTH }),
      );
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...request,
        status: PermissionRequestStatus.APPROVED,
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockMcpService.discoverTools).not.toHaveBeenCalled();
    });

    test('should include review note in permission request update', async () => {
      setupMcpServerApprovalMocks({});

      await router.approve({
        ctx: createAdminContext(),
        input: { id: 'request-123', reviewNote: '  Approved for production use  ' },
      });

      expect(mockPrisma.permissionRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-123' },
        data: expect.objectContaining({ reviewNote: 'Approved for production use' }),
      });
    });

    test('should throw NOT_FOUND when permission request does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'non-existent' } }),
        'NOT_FOUND',
        'Permission request not found',
      );
    });

    test('should throw error when request already reviewed', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(
        createMockPermissionRequest({
          status: PermissionRequestStatus.APPROVED,
          reviewedBy: 'other-admin',
          reviewedAt: new Date(),
        }),
      );

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'BAD_REQUEST',
        'Permission request has already been reviewed',
      );
    });

    test('should use context organization ID for MCP server creation', async () => {
      setupMcpServerApprovalMocks({});

      await router.approve({
        ctx: createAdminContext({ organizationId: 'custom-org-id' }),
        input: { id: 'request-123' },
      });

      expect(mockPrisma.mcpServer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'custom-org-id' }),
      });
    });

    test('should trim whitespace from API key', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({
          authType: McpAuthType.API_KEY,
          apiKey: '  api-key-with-spaces  ',
        }),
      });
      setupMcpServerApprovalMocks({ request });
      mockCrypto.encryptString.mockReturnValue('encrypted-key');

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockCrypto.encryptString).toHaveBeenCalledWith('api-key-with-spaces');
      expect(mockMcpService.validateMcpServerUrl).toHaveBeenCalledWith(
        expect.any(String),
        McpAuthType.API_KEY,
        { apiKey: 'api-key-with-spaces' },
      );
    });

    test('should capture IP address and user agent for audit logs', async () => {
      setupMcpServerApprovalMocks({});

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '192.168.1.1', userAgent: 'test-agent' }),
      );
    });

    test('should include action details with MCP server info', async () => {
      setupMcpServerApprovalMocks({});

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'MCP_SERVER_CREATE',
          actionDetails: expect.objectContaining({
            name: 'GitHub MCP',
            url: 'https://github-mcp.example.com',
            authType: McpAuthType.NONE,
            trusted: false,
            createdViaPermissionRequest: true,
            permissionRequestId: 'request-123',
          }),
        }),
      );
    });

    test('should create chained TOOL_ACCESS request when alsoRequestTools is true and tools are discovered', async () => {
      const request = createMockPermissionRequest({
        id: 'request-123',
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({
          name: 'GitHub MCP',
          url: 'https://github-mcp.example.com:3000',
          alsoRequestTools: true,
        }),
      });
      const mcpServer = createMockMcpServer({
        id: 'mcp-server-123',
        name: 'GitHub MCP',
        url: 'https://github-mcp.example.com:3000',
      });

      mockPrisma.permissionRequest.findFirst.mockResolvedValue(request);
      mockMcpService.isSentinelMcpServerUrl.mockReturnValue(false);
      mockMcpService.validateMcpServerUrl.mockResolvedValue({ success: true, tools: [] });
      mockPrisma.mcpServer.create.mockResolvedValue(mcpServer);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...request,
        status: PermissionRequestStatus.APPROVED,
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);
      // Mock successful tool discovery
      mockMcpService.discoverTools.mockResolvedValue({ success: true, toolsDiscovered: 2 });
      // Mock the tools that were discovered
      mockPrisma.mcpTool.findMany.mockResolvedValue([
        { name: 'read_file' },
        { name: 'write_file' },
      ]);
      mockPrisma.permissionRequest.create.mockResolvedValue({
        id: 'chained-request-123',
        userId: request.userId,
        type: PermissionRequestType.TOOL_ACCESS,
        status: PermissionRequestStatus.PENDING,
        toolNames: [
          'github-mcp.example.com:3000::read_file',
          'github-mcp.example.com:3000::write_file',
        ],
        reason: 'Automatically requested with MCP server "GitHub MCP"',
        data: { chainedFromRequestId: 'request-123' },
      });

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      // Verify chained TOOL_ACCESS request was created
      expect(mockPrisma.permissionRequest.create).toHaveBeenCalledWith({
        data: {
          userId: request.userId,
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: [
            'github-mcp.example.com:3000::read_file',
            'github-mcp.example.com:3000::write_file',
          ],
          reason: 'Automatically requested with MCP server "GitHub MCP"',
          data: { chainedFromRequestId: 'request-123' },
        },
      });
    });

    test('should not create chained request when alsoRequestTools is false', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({
          alsoRequestTools: false,
        }),
      });
      setupMcpServerApprovalMocks({ request });
      mockMcpService.discoverTools.mockResolvedValue({ success: true, toolsDiscovered: 2 });
      mockPrisma.mcpTool.findMany.mockResolvedValue([{ name: 'read_file' }]);

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      // Verify chained request was NOT created
      expect(mockPrisma.permissionRequest.create).not.toHaveBeenCalled();
    });

    test('should create chained request with mcpServerId when no tools are discovered', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({
          alsoRequestTools: true,
        }),
      });
      setupMcpServerApprovalMocks({ request });
      mockMcpService.discoverTools.mockResolvedValue({ success: true, toolsDiscovered: 0 });
      mockPrisma.mcpTool.findMany.mockResolvedValue([]);

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      // Verify chained request WAS created with empty toolNames and mcpServerId for later population
      expect(mockPrisma.permissionRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: [],
          data: expect.objectContaining({
            chainedFromRequestId: 'request-123',
            mcpServerId: 'mcp-server-123',
          }),
        }),
      });
    });

    test('should create chained request with mcpServerId when tool discovery fails', async () => {
      const request = createMockPermissionRequest({
        type: PermissionRequestType.MCP_SERVER,
        toolNames: [],
        data: createMcpServerRequestData({
          alsoRequestTools: true,
        }),
      });
      setupMcpServerApprovalMocks({ request });
      // Mock failed tool discovery (returns error result, doesn't throw)
      mockMcpService.discoverTools.mockResolvedValue({
        success: false,
        toolsDiscovered: 0,
        error: 'Connection failed',
      });

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      // Verify chained request WAS created with empty toolNames and mcpServerId for later population
      expect(mockPrisma.permissionRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: [],
          data: expect.objectContaining({
            chainedFromRequestId: 'request-123',
            mcpServerId: 'mcp-server-123',
          }),
        }),
      });
      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Tool discovery failed'),
      );
    });
  });

  describe('list', () => {
    test('should list all permission requests for organization', async () => {
      const mockRequests = [
        { id: 'req-1', status: 'PENDING', user: { email: 'user1@example.com' } },
        { id: 'req-2', status: 'APPROVED', user: { email: 'user2@example.com' } },
      ];
      mockPrisma.permissionRequest.findMany.mockResolvedValue(mockRequests);

      const result = await router.list({ ctx: createAdminContext(), input: {} });

      expect(result).toEqual(mockRequests);
      expect(mockPrisma.permissionRequest.findMany).toHaveBeenCalledWith({
        where: { user: { organizationId: 'org-123' }, status: { not: 'WITHDRAWN' } },
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should filter by status', async () => {
      mockPrisma.permissionRequest.findMany.mockResolvedValue([]);

      await router.list({
        ctx: createAdminContext(),
        input: { status: PermissionRequestStatus.PENDING },
      });

      expect(mockPrisma.permissionRequest.findMany).toHaveBeenCalledWith({
        where: { user: { organizationId: 'org-123' }, status: 'PENDING' },
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('get', () => {
    test('should get permission request by id', async () => {
      const mockRequest = {
        id: 'req-123',
        status: 'PENDING',
        user: { email: 'user@example.com', organizationId: 'org-123' },
      };
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockRequest);

      const result = await router.get({ ctx: createAdminContext(), input: { id: 'req-123' } });

      expect(result).toEqual(mockRequest);
    });

    test('should throw NOT_FOUND when request does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      await expectTRPCError(
        router.get({ ctx: createAdminContext(), input: { id: 'non-existent' } }),
        'NOT_FOUND',
        'Permission request not found',
      );
    });
  });

  describe('deny', () => {
    const mockPendingRequest = createMockPermissionRequest();

    test('should deny a pending permission request', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockPendingRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: 'DENIED',
        reviewedBy: 'admin-user-123',
        reviewedAt: new Date(),
        reviewNote: 'Request denied for security reasons',
        user: { email: 'requester@example.com' },
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      const result = await router.deny({
        ctx: createAdminContext(),
        input: { id: 'request-123', reviewNote: 'Request denied for security reasons' },
      });

      expect(result.status).toBe('DENIED');
      expect(mockPrisma.permissionRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-123' },
        data: expect.objectContaining({
          status: 'DENIED',
          reviewedBy: 'admin-user-123',
          reviewNote: 'Request denied for security reasons',
        }),
        include: { user: { select: { email: true } } },
      });
    });

    test('should log admin action for denied request', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockPendingRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: 'DENIED',
        user: { email: 'requester@example.com' },
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.deny({
        ctx: createAdminContext(),
        input: { id: 'request-123', reviewNote: 'Denied' },
      });

      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PERMISSION_REQUEST_DENY',
          resourceType: 'PERMISSION_REQUEST',
          resourceId: 'request-123',
        }),
      );
    });

    test('should use DENY_POLICY_REMOVAL_DENY action type for DENY_REMOVAL requests', async () => {
      const denyRemovalRequest = createMockPermissionRequest({
        type: 'DENY_REMOVAL',
        data: { policyId: 'policy-123' },
      });
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(denyRemovalRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...denyRemovalRequest,
        status: 'DENIED',
        user: { email: 'requester@example.com' },
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.deny({
        ctx: createAdminContext(),
        input: { id: 'request-123', reviewNote: 'Cannot remove this restriction' },
      });

      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'DENY_POLICY_REMOVAL_DENY',
          resourceName: 'Restriction Removal Request from requester@example.com',
        }),
      );
    });

    test('should throw NOT_FOUND when request does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      await expectTRPCError(
        router.deny({
          ctx: createAdminContext(),
          input: { id: 'non-existent', reviewNote: 'Denied' },
        }),
        'NOT_FOUND',
        'Permission request not found',
      );
    });

    test('should throw error when request already reviewed', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(
        createMockPermissionRequest({
          status: PermissionRequestStatus.APPROVED,
          reviewedBy: 'other-admin',
          reviewedAt: new Date(),
        }),
      );

      await expectTRPCError(
        router.deny({
          ctx: createAdminContext(),
          input: { id: 'request-123', reviewNote: 'Denied' },
        }),
        'BAD_REQUEST',
        'Permission request has already been reviewed',
      );
    });

    test('should trim review note whitespace', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockPendingRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: 'DENIED',
        user: { email: 'requester@example.com' },
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.deny({
        ctx: createAdminContext(),
        input: { id: 'request-123', reviewNote: '  Trimmed note  ' },
      });

      expect(mockPrisma.permissionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewNote: 'Trimmed note' }),
        }),
      );
    });
  });

  describe('getDenyPolicyDetails', () => {
    const mockDenyRemovalRequest = createMockPermissionRequest({
      type: 'DENY_REMOVAL',
      toolNames: ['server::dangerous-tool'],
      reason: 'I need this tool',
      data: { policyId: 'policy-123' },
    });

    test('should return policy details for a valid request', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(
        createMockPolicy({
          id: 'policy-123',
          slug: 'deny-dangerous-tools',
          description: 'Blocks dangerous tools',
          matchers: ['user:test@example.com'],
          toolPatterns: ['server::dangerous-tool'],
          effect: 'DENY',
        }),
      );

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.policy?.slug).toBe('deny-dangerous-tools');
    });

    test('should return NOT_FOUND status when request does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      await expectTRPCError(
        router.getDenyPolicyDetails({
          ctx: createAdminContext(),
          input: { requestId: 'non-existent' },
        }),
        'NOT_FOUND',
        'Permission request not found',
      );
    });

    test('should return INVALID_DATA status for malformed request data', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue({
        ...mockDenyRemovalRequest,
        data: { invalid: 'data' },
      });

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.status).toBe('INVALID_DATA');
      expect(result.policy).toBeNull();
    });

    test('should return POLICY_NOT_FOUND status when policy does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.status).toBe('POLICY_NOT_FOUND');
      expect(result.policy).toBeNull();
    });

    test('should return ALREADY_DELETED status when policy is soft-deleted', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(
        createMockPolicy({ effect: 'DENY', enabled: false, deletedAt: new Date() }),
      );

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.status).toBe('ALREADY_DELETED');
    });

    test('should return NOT_DENY_POLICY status when policy effect is not DENY', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(createMockPolicy({ effect: 'ALLOW' }));

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.status).toBe('NOT_DENY_POLICY');
      expect(result.warnings).toContain('Policy effect was changed from DENY');
    });

    test('should include warning for wildcard matcher', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(
        createMockPolicy({ matchers: ['*'], effect: 'DENY' }),
      );

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.warnings).toContain('This policy affects ALL users in the organization');
    });

    test('should include warning for role-based matcher', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(
        createMockPolicy({ matchers: ['role:admin', 'role:superuser'], effect: 'DENY' }),
      );

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.warnings).toContainEqual(
        expect.stringContaining('This policy affects all users with roles:'),
      );
    });

    test('should include warning for wildcard tool pattern', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(
        createMockPolicy({ toolPatterns: ['*::*'], effect: 'DENY' }),
      );

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.warnings).toContain(
        'This policy blocks ALL tools - removing grants broad access',
      );
    });

    test('should include warning for server-wide tool pattern', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(
        createMockPolicy({ toolPatterns: ['github::*', 'jira::*'], effect: 'DENY' }),
      );

      const result = await router.getDenyPolicyDetails({
        ctx: createAdminContext(),
        input: { requestId: 'request-123' },
      });

      expect(result.warnings).toContainEqual(
        expect.stringContaining('This policy blocks all tools on:'),
      );
    });
  });

  describe('approve - DENY_REMOVAL type', () => {
    const mockDenyRemovalRequest = createMockPermissionRequest({
      type: 'DENY_REMOVAL',
      toolNames: ['server::dangerous-tool'],
      reason: 'I need this tool for my work',
      data: { policyId: 'policy-123' },
    });

    const mockDenyPolicy = createMockPolicy({
      id: 'policy-123',
      slug: 'deny-dangerous-tools',
      description: 'Blocks dangerous tools',
      matchers: ['user:test@example.com'],
      toolPatterns: ['server::dangerous-tool'],
      effect: 'DENY',
    });

    test('should approve DENY_REMOVAL request and soft-delete policy', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(mockDenyPolicy);
      mockPrisma.policy.update.mockResolvedValue({
        ...mockDenyPolicy,
        deletedAt: new Date(),
        enabled: false,
      });
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockDenyRemovalRequest,
        status: 'APPROVED',
        reviewedBy: 'admin-user-123',
        reviewedAt: new Date(),
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      const result = await router.approve({
        ctx: createAdminContext(),
        input: { id: 'request-123' },
      });

      expect(result.status).toBe('APPROVED');
      expect(mockPrisma.policy.update).toHaveBeenCalledWith({
        where: { id: 'policy-123' },
        data: { deletedAt: expect.any(Date), enabled: false },
      });
    });

    test('should throw error for invalid DENY removal request data', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue({
        ...mockDenyRemovalRequest,
        data: { invalid: 'data' },
      });

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'INTERNAL_SERVER_ERROR',
        'Invalid DENY removal request data',
      );
    });

    test('should throw NOT_FOUND when policy does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'NOT_FOUND',
        'The restriction policy no longer exists',
      );
    });

    test('should throw error when policy already deleted', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue({ ...mockDenyPolicy, deletedAt: new Date() });

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'BAD_REQUEST',
        'This restriction has already been removed',
      );
    });

    test('should throw error when policy is not DENY effect', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue({ ...mockDenyPolicy, effect: 'ALLOW' });

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'BAD_REQUEST',
        'This policy is no longer a restriction (DENY) policy',
      );
    });

    test('should log both request approval and policy deletion', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockDenyRemovalRequest);
      mockPrisma.policy.findFirst.mockResolvedValue(mockDenyPolicy);
      mockPrisma.policy.update.mockResolvedValue({
        ...mockDenyPolicy,
        deletedAt: new Date(),
        enabled: false,
      });
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockDenyRemovalRequest,
        status: 'APPROVED',
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'DENY_POLICY_REMOVAL_APPROVE',
          resourceType: 'PERMISSION_REQUEST',
        }),
      );
      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'POLICY_DELETE', resourceType: 'POLICY' }),
      );
      expect(mockAdminAction.logAdminAction).toHaveBeenCalledTimes(2);
    });
  });

  describe('approve - TOOL_ACCESS type', () => {
    const mockToolAccessRequest = createMockPermissionRequest({
      type: 'TOOL_ACCESS',
      toolNames: ['server::tool1', 'server::tool2'],
      reason: 'Need access to these tools',
    });

    test('should approve TOOL_ACCESS request with default behavior', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockToolAccessRequest);
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        { name: 'Server', url: 'https://server.example.com' },
      ]);
      mockToolValidation.validateToolNamesForOrganization.mockResolvedValue({
        valid: true,
        toolNames: ['server::tool1', 'server::tool2'],
      });
      mockToolValidation.getToolValidationErrorMessage.mockReturnValue(null);
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPolicy.generatePolicySlug.mockReturnValue('allow-tool1-for-user');
      mockPolicy.generatePolicyDescription.mockReturnValue('Allows tool1 for user');
      mockPrisma.policy.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockToolAccessRequest,
        status: 'APPROVED',
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      const result = await router.approve({
        ctx: createAdminContext(),
        input: { id: 'request-123' },
      });

      expect(result.status).toBe('APPROVED');
    });

    test('should approve TOOL_ACCESS request with custom grant', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockToolAccessRequest);
      mockPrisma.mcpServer.findMany.mockResolvedValue([
        { name: 'Server', url: 'https://server.example.com' },
      ]);
      mockToolValidation.validateToolNamesForOrganization.mockResolvedValue({
        valid: true,
        toolNames: ['server::tool1', 'server::tool2'],
      });
      mockToolValidation.getToolValidationErrorMessage.mockReturnValue(null);
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPolicy.generatePolicySlug.mockReturnValue('custom-grant-policy');
      mockPolicy.generatePolicyDescription.mockReturnValue('Custom policy description');
      mockPrisma.policy.create.mockResolvedValue({ id: 'policy-new', slug: 'custom-grant-policy' });
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockToolAccessRequest,
        status: 'APPROVED',
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      const result = await router.approve({
        ctx: createAdminContext(),
        input: {
          id: 'request-123',
          customGrant: {
            matchers: ['role:developer'],
            toolPatterns: ['server::tool1', 'server::tool2'],
          },
        },
      });

      expect(result.status).toBe('APPROVED');
      expect(mockPrisma.policy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matchers: ['role:developer'],
          toolPatterns: ['server::tool1', 'server::tool2'],
          effect: 'ALLOW',
        }),
      });
    });

    test('should throw error for invalid tool names', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockToolAccessRequest);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockToolValidation.validateToolNamesForOrganization.mockResolvedValue({
        valid: false,
        error: 'Invalid tool names',
      });
      mockToolValidation.getToolValidationErrorMessage.mockReturnValue(
        'Tool validation failed: unknown tools',
      );

      await expectTRPCError(
        router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } }),
        'BAD_REQUEST',
        'Tool validation failed: unknown tools',
      );
    });

    test('should skip creating policies for already covered tools', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockToolAccessRequest);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockToolValidation.validateToolNamesForOrganization.mockResolvedValue({
        valid: true,
        toolNames: ['server::tool1', 'server::tool2'],
      });
      mockToolValidation.getToolValidationErrorMessage.mockReturnValue(null);
      mockPrisma.policy.findMany
        .mockResolvedValueOnce([{ toolPatterns: ['server::tool1'] }])
        .mockResolvedValueOnce([{ slug: 'existing-policy' }]);
      mockPolicy.generatePolicySlug.mockReturnValue('allow-tool2-for-user');
      mockPolicy.generatePolicyDescription.mockReturnValue('Allows tool2 for user');
      mockPrisma.policy.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockToolAccessRequest,
        status: 'APPROVED',
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.approve({ ctx: createAdminContext(), input: { id: 'request-123' } });

      expect(mockPrisma.policy.createMany).toHaveBeenCalled();
    });

    test('should log custom grant with correct action details', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockToolAccessRequest);
      mockPrisma.mcpServer.findMany.mockResolvedValue([]);
      mockToolValidation.validateToolNamesForOrganization.mockResolvedValue({
        valid: true,
        toolNames: ['server::*'],
      });
      mockToolValidation.getToolValidationErrorMessage.mockReturnValue(null);
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPolicy.generatePolicySlug.mockReturnValue('custom-policy');
      mockPolicy.generatePolicyDescription.mockReturnValue('Custom description');
      mockPrisma.policy.create.mockResolvedValue({ id: 'policy-new', slug: 'custom-policy' });
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockToolAccessRequest,
        status: 'APPROVED',
      });
      mockAdminAction.logAdminAction.mockResolvedValue(undefined);

      await router.approve({
        ctx: createAdminContext(),
        input: {
          id: 'request-123',
          customGrant: { matchers: ['*'], toolPatterns: ['server::*'] },
          reviewNote: 'Granted broad access',
        },
      });

      expect(mockAdminAction.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionDetails: expect.objectContaining({
            customGrant: true,
            grantedMatchers: ['*'],
            grantedToolPatterns: ['server::*'],
          }),
        }),
      );
    });
  });
});
