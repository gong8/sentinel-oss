/**
 * Tests for User Permission Requests Router
 * Tests user permission request operations
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';
import {
  createMockUserWithRoles,
  createUserContext,
  type MockPrisma,
} from '../../../../helpers/unit-test-mocks.js';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockValidateToolNamesForOrganization,
  mockGetToolValidationErrorMessage,
  mockIsSentinelMcpServerUrl,
  mockValidateMcpServerUrl,
  mockProbeAuthType,
  mockEvaluatePolicy,
  mockCheckMatcher,
  mockCheckToolPattern,
} = vi.hoisted(() => ({
  mockPrisma: {
    permissionRequest: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    policy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  } satisfies Partial<MockPrisma>,
  mockValidateToolNamesForOrganization: vi.fn(),
  mockGetToolValidationErrorMessage: vi.fn(),
  mockIsSentinelMcpServerUrl: vi.fn(),
  mockValidateMcpServerUrl: vi.fn(),
  mockProbeAuthType: vi.fn(),
  mockEvaluatePolicy: vi.fn(),
  mockCheckMatcher: vi.fn(),
  mockCheckToolPattern: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  PermissionRequestType: {
    TOOL_ACCESS: 'TOOL_ACCESS',
    MCP_SERVER: 'MCP_SERVER',
    DENY_REMOVAL: 'DENY_REMOVAL',
  },
  PermissionRequestStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    DENIED: 'DENIED',
    WITHDRAWN: 'WITHDRAWN',
  },
  McpAuthType: { NONE: 'NONE', API_KEY: 'API_KEY', OAUTH: 'OAUTH' },
  PolicyEffect: { ALLOW: 'ALLOW', DENY: 'DENY' },
}));

vi.mock('../../../../../packages/api/src/services/toolValidation.js', () => ({
  validateToolNamesForOrganization: mockValidateToolNamesForOrganization,
  getToolValidationErrorMessage: mockGetToolValidationErrorMessage,
}));

vi.mock('../../../../../packages/api/src/services/mcp.js', () => ({
  isSentinelMcpServerUrl: mockIsSentinelMcpServerUrl,
  validateMcpServerUrl: mockValidateMcpServerUrl,
  probeAuthType: mockProbeAuthType,
  SENTINEL_SELF_MCP_SERVER_ERROR: 'Cannot add Sentinel server as an MCP server',
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  evaluatePolicy: mockEvaluatePolicy,
  checkMatcher: mockCheckMatcher,
  checkToolPattern: mockCheckToolPattern,
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  protectedProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { McpAuthType, PermissionRequestType } from '@sentinel/db';
import { userPermissionRequestsRouter as _userPermissionRequestsRouter } from '../../../../../packages/api/src/trpc/user/permissionRequests.js';

const userPermissionRequestsRouter = _userPermissionRequestsRouter as unknown as {
  analyzeToolAccess: TestableHandler<{
    tools: Array<{
      toolName: string;
      hasAccess: boolean;
      blockedByDeny: boolean;
      blockingPolicyId: string | null;
    }>;
  }>;
  create: TestableHandler;
  get: TestableHandler;
  list: TestableHandler;
  probeAuthType: TestableHandler;
  withdraw: TestableHandler;
};

function createMockUser(userId: string = 'user-123') {
  return createMockUserWithRoles({ id: userId, email: 'user@example.com' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
  mockPrisma.policy.findMany.mockResolvedValue([]);
  mockEvaluatePolicy.mockResolvedValue({
    decision: 'DENIED',
    justification: 'No matching ALLOW policy',
    policyIds: [],
  });
});

describe('userPermissionRequestsRouter', () => {
  describe('create', () => {
    describe('TOOL_ACCESS type', () => {
      function setupToolAccessMocks(toolNames: string[]) {
        mockValidateToolNamesForOrganization.mockResolvedValue({
          valid: true,
          toolNames,
          warnings: [],
        });
        mockGetToolValidationErrorMessage.mockReturnValue(null);
      }

      test('should create a tool access request', async () => {
        const toolNames = ['github.com::listRepos', 'github.com::createPR'];
        setupToolAccessMocks(toolNames);
        mockPrisma.permissionRequest.create.mockResolvedValue({
          id: 'req-1',
          userId: 'user-123',
          type: 'TOOL_ACCESS',
          toolNames,
          reason: 'Need to manage repos',
          status: 'PENDING',
        });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames,
          reason: 'Need to manage repos',
        };

        const result = await userPermissionRequestsRouter.create({ ctx, input });

        expect(result.id).toBe('req-1');
        expect(mockValidateToolNamesForOrganization).toHaveBeenCalledWith('org-123', toolNames);
        expect(mockPrisma.permissionRequest.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-123',
            type: 'TOOL_ACCESS',
            toolNames,
            reason: 'Need to manage repos',
            data: undefined,
          },
        });
      });

      test('should throw BAD_REQUEST when tool names are missing', async () => {
        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: [],
          reason: 'Need access',
        };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Tool names are required for tool access requests',
        });
      });

      test('should throw BAD_REQUEST when tool names are undefined', async () => {
        const ctx = createUserContext();
        const input = { type: PermissionRequestType.TOOL_ACCESS, reason: 'Need access' };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Tool names are required for tool access requests',
        });
      });

      test('should throw BAD_REQUEST when tool validation fails', async () => {
        mockValidateToolNamesForOrganization.mockResolvedValue({
          valid: false,
          toolNames: [],
          errors: ['Tool not found'],
        });
        mockGetToolValidationErrorMessage.mockReturnValue('Tool not found in organization');

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: ['invalid.tool'],
          reason: 'Need access',
        };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Tool not found in organization',
        });
      });

      test('should trim reason', async () => {
        setupToolAccessMocks(['tool']);
        mockPrisma.permissionRequest.create.mockResolvedValue({ id: 'req-1' });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: ['tool'],
          reason: '  Need access  ',
        };

        await userPermissionRequestsRouter.create({ ctx, input });

        expect(mockPrisma.permissionRequest.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ reason: 'Need access' }),
        });
      });

      test('should throw BAD_REQUEST when user already has access to all requested tools', async () => {
        setupToolAccessMocks(['github.com::listRepos', 'github.com::createPR']);
        mockEvaluatePolicy.mockResolvedValue({
          decision: 'ALLOWED',
          justification: null,
          policyIds: ['policy-1'],
        });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: ['github.com::listRepos', 'github.com::createPR'],
          reason: 'Need to manage repos',
        };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'You already have access to all requested tools',
        });
      });

      test('should allow request when user has access to only some requested tools', async () => {
        setupToolAccessMocks(['github.com::listRepos', 'github.com::createPR']);
        mockEvaluatePolicy.mockImplementation(async ({ toolName }: { toolName: string }) => {
          if (toolName === 'github.com::listRepos') {
            return { decision: 'ALLOWED', justification: null, policyIds: ['policy-1'] };
          }
          return { decision: 'DENIED', justification: 'No matching ALLOW policy', policyIds: [] };
        });
        mockPrisma.permissionRequest.create.mockResolvedValue({
          id: 'req-1',
          userId: 'user-123',
          type: 'TOOL_ACCESS',
          toolNames: ['github.com::listRepos', 'github.com::createPR'],
          reason: 'Need to manage repos',
          status: 'PENDING',
        });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: ['github.com::listRepos', 'github.com::createPR'],
          reason: 'Need to manage repos',
        };

        const result = await userPermissionRequestsRouter.create({ ctx, input });

        expect(result.id).toBe('req-1');
        expect(mockPrisma.permissionRequest.create).toHaveBeenCalled();
      });

      test('should throw NOT_FOUND when user is not found during access check', async () => {
        setupToolAccessMocks(['github.com::listRepos']);
        mockPrisma.user.findUnique.mockResolvedValue(null);

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.TOOL_ACCESS,
          toolNames: ['github.com::listRepos'],
          reason: 'Need access',
        };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      });
    });

    describe('MCP_SERVER type', () => {
      function setupMcpServerMocks() {
        mockIsSentinelMcpServerUrl.mockReturnValue(false);
        mockValidateMcpServerUrl.mockResolvedValue({ success: true });
      }

      test('should create an MCP server request', async () => {
        setupMcpServerMocks();
        mockPrisma.permissionRequest.create.mockResolvedValue({
          id: 'req-1',
          type: 'MCP_SERVER',
          data: { name: 'Test Server', url: 'https://mcp.example.com', authType: 'NONE' },
        });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need this server',
          data: { name: 'Test Server', url: 'https://mcp.example.com', authType: McpAuthType.NONE },
        };

        const result = await userPermissionRequestsRouter.create({ ctx, input });

        expect(result.id).toBe('req-1');
        expect(mockValidateMcpServerUrl).toHaveBeenCalledWith(
          'https://mcp.example.com',
          'NONE',
          undefined,
        );
      });

      test('should throw BAD_REQUEST when data is missing', async () => {
        const ctx = createUserContext();
        const input = { type: PermissionRequestType.MCP_SERVER, reason: 'Need server' };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Configuration data is required for MCP server requests',
        });
      });

      test('should throw BAD_REQUEST when data is invalid', async () => {
        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need server',
          data: { invalid: 'data' },
        };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Invalid MCP server configuration',
        });
      });

      test('should throw BAD_REQUEST when URL is Sentinel server', async () => {
        mockIsSentinelMcpServerUrl.mockReturnValue(true);

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need server',
          data: {
            name: 'Sentinel',
            url: 'https://sentinel.example.com/mcp',
            authType: McpAuthType.NONE,
          },
        };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Cannot add Sentinel server as an MCP server',
        });
      });

      test('should throw BAD_REQUEST when MCP server validation fails', async () => {
        mockIsSentinelMcpServerUrl.mockReturnValue(false);
        mockValidateMcpServerUrl.mockResolvedValue({ success: false, error: 'Connection refused' });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need server',
          data: {
            name: 'Test Server',
            url: 'https://invalid.example.com',
            authType: McpAuthType.NONE,
          },
        };

        await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Could not connect to MCP server: Connection refused',
        });
      });

      test('should skip validation when API_KEY auth but no key provided', async () => {
        mockIsSentinelMcpServerUrl.mockReturnValue(false);
        mockPrisma.permissionRequest.create.mockResolvedValue({ id: 'req-1' });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need server',
          data: {
            name: 'Test Server',
            url: 'https://mcp.example.com',
            authType: McpAuthType.API_KEY,
          },
        };

        await userPermissionRequestsRouter.create({ ctx, input });

        expect(mockValidateMcpServerUrl).not.toHaveBeenCalled();
      });

      test('should validate when API_KEY auth with key provided', async () => {
        setupMcpServerMocks();
        mockPrisma.permissionRequest.create.mockResolvedValue({ id: 'req-1' });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need server',
          data: {
            name: 'Test Server',
            url: 'https://mcp.example.com',
            authType: McpAuthType.API_KEY,
            apiKey: 'sk-12345',
          },
        };

        await userPermissionRequestsRouter.create({ ctx, input });

        expect(mockValidateMcpServerUrl).toHaveBeenCalledWith(
          'https://mcp.example.com',
          'API_KEY',
          {
            apiKey: 'sk-12345',
          },
        );
      });

      test('should trim API key', async () => {
        setupMcpServerMocks();
        mockPrisma.permissionRequest.create.mockResolvedValue({ id: 'req-1' });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need server',
          data: {
            name: 'Test Server',
            url: 'https://mcp.example.com',
            authType: McpAuthType.API_KEY,
            apiKey: '  sk-12345  ',
          },
        };

        await userPermissionRequestsRouter.create({ ctx, input });

        expect(mockValidateMcpServerUrl).toHaveBeenCalledWith(
          'https://mcp.example.com',
          'API_KEY',
          {
            apiKey: 'sk-12345',
          },
        );
      });

      test('should handle empty API key string', async () => {
        mockIsSentinelMcpServerUrl.mockReturnValue(false);
        mockPrisma.permissionRequest.create.mockResolvedValue({ id: 'req-1' });

        const ctx = createUserContext();
        const input = {
          type: PermissionRequestType.MCP_SERVER,
          reason: 'Need server',
          data: {
            name: 'Test Server',
            url: 'https://mcp.example.com',
            authType: McpAuthType.API_KEY,
            apiKey: '   ',
          },
        };

        await userPermissionRequestsRouter.create({ ctx, input });

        expect(mockValidateMcpServerUrl).not.toHaveBeenCalled();
      });
    });
  });

  describe('list', () => {
    test('should list user permission requests', async () => {
      const mockRequests = [
        { id: 'req-1', type: 'TOOL_ACCESS', status: 'PENDING' },
        { id: 'req-2', type: 'MCP_SERVER', status: 'APPROVED' },
      ];
      mockPrisma.permissionRequest.findMany.mockResolvedValue(mockRequests);

      const ctx = createUserContext();
      const result = await userPermissionRequestsRouter.list({ ctx });

      expect(result).toEqual(mockRequests);
      expect(mockPrisma.permissionRequest.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should return empty array when no requests', async () => {
      mockPrisma.permissionRequest.findMany.mockResolvedValue([]);

      const ctx = createUserContext();
      const result = await userPermissionRequestsRouter.list({ ctx });

      expect(result).toEqual([]);
    });

    test('should only return requests for current user', async () => {
      mockPrisma.permissionRequest.findMany.mockResolvedValue([]);

      const ctx = createUserContext({ userId: 'specific-user' });
      await userPermissionRequestsRouter.list({ ctx });

      expect(mockPrisma.permissionRequest.findMany).toHaveBeenCalledWith({
        where: { userId: 'specific-user' },
        orderBy: expect.any(Object),
      });
    });
  });

  describe('get', () => {
    test('should get a specific request', async () => {
      const mockRequest = { id: 'req-1', type: 'TOOL_ACCESS', userId: 'user-123' };
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockRequest);

      const ctx = createUserContext();
      const input = { id: 'req-1' };

      const result = await userPermissionRequestsRouter.get({ ctx, input });

      expect(result).toEqual(mockRequest);
      expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'req-1', userId: 'user-123' },
      });
    });

    test('should throw NOT_FOUND when request does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createUserContext();
      const input = { id: 'nonexistent' };

      await expect(userPermissionRequestsRouter.get({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Permission request not found',
      });
    });

    test('should not find requests from other users', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createUserContext({ userId: 'user-A' });
      const input = { id: 'request-from-user-B' };

      await expect(userPermissionRequestsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);

      expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'request-from-user-B', userId: 'user-A' },
      });
    });
  });

  describe('withdraw', () => {
    test('should withdraw a pending request', async () => {
      const mockRequest = { id: 'req-1', status: 'PENDING', userId: 'user-123' };
      const withdrawnRequest = { ...mockRequest, status: 'WITHDRAWN' };
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue(withdrawnRequest);

      const ctx = createUserContext();
      const input = { id: 'req-1' };

      const result = await userPermissionRequestsRouter.withdraw({ ctx, input });

      expect(result.status).toBe('WITHDRAWN');
      expect(mockPrisma.permissionRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'WITHDRAWN' },
      });
    });

    test('should throw NOT_FOUND when request does not exist', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createUserContext();
      const input = { id: 'nonexistent' };

      await expect(userPermissionRequestsRouter.withdraw({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Request not found or cannot be withdrawn',
      });
    });

    test('should only allow withdrawing pending requests', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createUserContext();
      const input = { id: 'approved-request' };

      try {
        await userPermissionRequestsRouter.withdraw({ ctx, input });
      } catch {
        // Expected to throw
      }

      expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'approved-request', userId: 'user-123', status: 'PENDING' },
      });
    });

    test('should not allow withdrawing requests from other users', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createUserContext({ userId: 'user-A' });
      const input = { id: 'request-from-user-B' };

      await expect(userPermissionRequestsRouter.withdraw({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('probeAuthType', () => {
    test('should probe URL and return suggested auth type for OAuth', async () => {
      mockIsSentinelMcpServerUrl.mockReturnValue(false);
      mockProbeAuthType.mockResolvedValue({
        detectedAuthType: 'oauth',
        serverInfo: { name: 'OAuth Server' },
      });

      const ctx = createUserContext();
      const input = { url: 'https://mcp.example.com' };

      const result = await userPermissionRequestsRouter.probeAuthType({ ctx, input });

      expect(result.suggestedAuthType).toBe('OAUTH');
      expect(result.detectionFailed).toBe(false);
      expect(mockProbeAuthType).toHaveBeenCalledWith('https://mcp.example.com');
    });

    test('should return API_KEY for api_key detected type', async () => {
      mockIsSentinelMcpServerUrl.mockReturnValue(false);
      mockProbeAuthType.mockResolvedValue({
        detectedAuthType: 'api_key',
        serverInfo: { name: 'API Key Server' },
      });

      const ctx = createUserContext();
      const input = { url: 'https://mcp.example.com' };

      const result = await userPermissionRequestsRouter.probeAuthType({ ctx, input });

      expect(result.suggestedAuthType).toBe('API_KEY');
      expect(result.detectionFailed).toBe(false);
    });

    test('should return NONE for none detected type', async () => {
      mockIsSentinelMcpServerUrl.mockReturnValue(false);
      mockProbeAuthType.mockResolvedValue({
        detectedAuthType: 'none',
        serverInfo: { name: 'Public Server' },
      });

      const ctx = createUserContext();
      const input = { url: 'https://mcp.example.com' };

      const result = await userPermissionRequestsRouter.probeAuthType({ ctx, input });

      expect(result.suggestedAuthType).toBe('NONE');
      expect(result.detectionFailed).toBe(false);
    });

    test('should indicate detection failed for unknown type', async () => {
      mockIsSentinelMcpServerUrl.mockReturnValue(false);
      mockProbeAuthType.mockResolvedValue({
        detectedAuthType: 'unknown',
        serverInfo: null,
      });

      const ctx = createUserContext();
      const input = { url: 'https://invalid.example.com' };

      const result = await userPermissionRequestsRouter.probeAuthType({ ctx, input });

      expect(result.suggestedAuthType).toBe(null);
      expect(result.detectionFailed).toBe(true);
    });

    test('should throw BAD_REQUEST for Sentinel server URL', async () => {
      mockIsSentinelMcpServerUrl.mockReturnValue(true);

      const ctx = createUserContext();
      const input = { url: 'https://sentinel.example.com/mcp' };

      await expect(
        userPermissionRequestsRouter.probeAuthType({ ctx, input }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot add Sentinel server as an MCP server',
      });
    });

    test('should handle default case for unknown auth types', async () => {
      mockIsSentinelMcpServerUrl.mockReturnValue(false);
      mockProbeAuthType.mockResolvedValue({
        detectedAuthType: 'some_other_type',
        serverInfo: {},
      });

      const ctx = createUserContext();
      const input = { url: 'https://mcp.example.com' };

      const result = await userPermissionRequestsRouter.probeAuthType({ ctx, input });

      expect(result.suggestedAuthType).toBe('NONE');
    });
  });

  describe('user isolation', () => {
    test('list should only show current user requests', async () => {
      mockPrisma.permissionRequest.findMany.mockResolvedValue([]);

      const ctx = createUserContext({ userId: 'isolated-user' });
      await userPermissionRequestsRouter.list({ ctx });

      expect(mockPrisma.permissionRequest.findMany).toHaveBeenCalledWith({
        where: { userId: 'isolated-user' },
        orderBy: expect.any(Object),
      });
    });

    test('get should enforce user ownership', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createUserContext({ userId: 'user-A' });
      const input = { id: 'request-id' };

      await expect(userPermissionRequestsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);

      expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'request-id', userId: 'user-A' },
      });
    });

    test('withdraw should enforce user ownership', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createUserContext({ userId: 'user-A' });
      const input = { id: 'request-id' };

      await expect(userPermissionRequestsRouter.withdraw({ ctx, input })).rejects.toThrow(
        TRPCError,
      );

      expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'request-id', userId: 'user-A', status: 'PENDING' },
      });
    });
  });

  describe('analyzeToolAccess', () => {
    test('should return tool access analysis for tools user has access to', async () => {
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'ALLOWED',
        justification: null,
        policyIds: ['policy-1'],
      });

      const ctx = createUserContext();
      const input = { toolNames: ['github.com::listRepos'] };

      const result = await userPermissionRequestsRouter.analyzeToolAccess({ ctx, input });

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]).toEqual({
        toolName: 'github.com::listRepos',
        hasAccess: true,
        blockedByDeny: false,
        blockingPolicyId: 'policy-1',
      });
    });

    test('should return tool access analysis for tools user does not have access to', async () => {
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'DENIED',
        justification: 'No matching ALLOW policy',
        policyIds: [],
      });

      const ctx = createUserContext();
      const input = { toolNames: ['github.com::createPR'] };

      const result = await userPermissionRequestsRouter.analyzeToolAccess({ ctx, input });

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]).toEqual({
        toolName: 'github.com::createPR',
        hasAccess: false,
        blockedByDeny: false,
        blockingPolicyId: null,
      });
    });

    test('should identify tools blocked by DENY policy', async () => {
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'DENIED',
        justification: 'Blocked by policy',
        policyIds: ['deny-policy-1'],
      });

      const ctx = createUserContext();
      const input = { toolNames: ['sensitive.com::deleteAll'] };

      const result = await userPermissionRequestsRouter.analyzeToolAccess({ ctx, input });

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]).toEqual({
        toolName: 'sensitive.com::deleteAll',
        hasAccess: false,
        blockedByDeny: true,
        blockingPolicyId: 'deny-policy-1',
      });
    });

    test('should analyze multiple tools with mixed access', async () => {
      mockEvaluatePolicy.mockImplementation(async ({ toolName }: { toolName: string }) => {
        if (toolName === 'github.com::listRepos') {
          return { decision: 'ALLOWED', justification: null, policyIds: ['policy-1'] };
        } else if (toolName === 'github.com::createPR') {
          return { decision: 'DENIED', justification: 'No policy', policyIds: [] };
        } else {
          return { decision: 'DENIED', justification: 'Blocked', policyIds: ['deny-policy-1'] };
        }
      });

      const ctx = createUserContext();
      const input = {
        toolNames: ['github.com::listRepos', 'github.com::createPR', 'admin::delete'],
      };

      const result = await userPermissionRequestsRouter.analyzeToolAccess({ ctx, input });

      expect(result.tools).toHaveLength(3);
      expect(result.tools[0].hasAccess).toBe(true);
      expect(result.tools[1].hasAccess).toBe(false);
      expect(result.tools[1].blockedByDeny).toBe(false);
      expect(result.tools[2].hasAccess).toBe(false);
      expect(result.tools[2].blockedByDeny).toBe(true);
      expect(result.tools[2].blockingPolicyId).toBe('deny-policy-1');
    });

    test('should throw NOT_FOUND when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const ctx = createUserContext();
      const input = { toolNames: ['github.com::listRepos'] };

      await expect(
        userPermissionRequestsRouter.analyzeToolAccess({ ctx, input }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'User not found' });
    });

    test('should query policies for the correct organization with workspace filtering', async () => {
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'ALLOWED',
        justification: null,
        policyIds: [],
      });

      const ctx = createUserContext({ organizationId: 'test-org-123', workspaceIds: ['ws-1'] });
      const input = { toolNames: ['tool1'] };

      await userPermissionRequestsRouter.analyzeToolAccess({ ctx, input });

      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'test-org-123',
          enabled: true,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: { in: ['ws-1'] } }],
        },
      });
    });
  });

  describe('create - DENY_REMOVAL type', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
    });

    function setupDenyRemovalMocks() {
      const mockPolicy = {
        id: 'deny-policy-1',
        organizationId: 'org-123',
        effect: 'DENY',
        matchers: [{ type: 'USER', value: 'user-123' }],
        toolPatterns: ['sensitive::*'],
        enabled: true,
        deletedAt: null,
      };
      mockPrisma.policy.findFirst.mockResolvedValue(mockPolicy);
      mockCheckMatcher.mockReturnValue(true);
      mockCheckToolPattern.mockReturnValue(true);
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);
      return mockPolicy;
    }

    test('should create a DENY_REMOVAL request when policy blocks user tools', async () => {
      setupDenyRemovalMocks();
      mockPrisma.permissionRequest.create.mockResolvedValue({
        id: 'req-1',
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        data: { policyId: 'deny-policy-1' },
      });

      const ctx = createUserContext({ workspaceIds: ['ws-1'] });
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access for project',
        data: { policyId: 'deny-policy-1' },
      };

      const result = await userPermissionRequestsRouter.create({ ctx, input });

      expect(result.type).toBe('DENY_REMOVAL');
      expect(mockPrisma.policy.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'deny-policy-1',
          organizationId: 'org-123',
          effect: 'DENY',
          deletedAt: null,
          enabled: true,
          OR: [{ workspaceId: null }, { workspaceId: { in: ['ws-1'] } }],
        },
      });
    });

    test('should throw BAD_REQUEST when data is missing for DENY_REMOVAL', async () => {
      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Policy information required for restriction removal request',
      });
    });

    test('should throw BAD_REQUEST when data has invalid format', async () => {
      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
        data: { invalidField: 'value' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid restriction removal request data',
      });
    });

    test('should throw BAD_REQUEST when tool names are missing', async () => {
      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        reason: 'Need access',
        data: { policyId: 'deny-policy-1' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Tool names required for restriction removal request',
      });
    });

    test('should throw BAD_REQUEST when tool names array is empty', async () => {
      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: [],
        reason: 'Need access',
        data: { policyId: 'deny-policy-1' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Tool names required for restriction removal request',
      });
    });

    test('should throw NOT_FOUND when policy does not exist', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
        data: { policyId: 'nonexistent-policy' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'The restriction policy no longer exists or was already removed',
      });
    });

    test('should throw NOT_FOUND when user is not found', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue({
        id: 'deny-policy-1',
        organizationId: 'org-123',
        effect: 'DENY',
        matchers: [],
        toolPatterns: [],
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
        data: { policyId: 'deny-policy-1' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    test('should throw BAD_REQUEST when no tools are blocked by the policy', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue({
        id: 'deny-policy-1',
        organizationId: 'org-123',
        effect: 'DENY',
        matchers: [{ type: 'USER', value: 'user-123' }],
        toolPatterns: ['other::*'],
      });
      mockCheckMatcher.mockReturnValue(true);
      mockCheckToolPattern.mockReturnValue(false);

      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
        data: { policyId: 'deny-policy-1' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'None of the specified tools are blocked by this policy',
      });
    });

    test('should throw BAD_REQUEST when user does not match policy matcher', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue({
        id: 'deny-policy-1',
        organizationId: 'org-123',
        effect: 'DENY',
        matchers: [{ type: 'USER', value: 'other-user' }],
        toolPatterns: ['sensitive::*'],
      });
      mockCheckMatcher.mockReturnValue(false);
      mockCheckToolPattern.mockReturnValue(true);

      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
        data: { policyId: 'deny-policy-1' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'None of the specified tools are blocked by this policy',
      });
    });

    test('should throw BAD_REQUEST when duplicate pending request exists for same policy', async () => {
      setupDenyRemovalMocks();
      mockPrisma.permissionRequest.findFirst.mockResolvedValue({
        id: 'existing-req',
        type: 'DENY_REMOVAL',
        status: 'PENDING',
        data: { policyId: 'deny-policy-1' },
      });

      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
        data: { policyId: 'deny-policy-1' },
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'You already have a pending request to remove this restriction',
      });
    });

    test('should allow DENY_REMOVAL request when existing request is for different policy', async () => {
      setupDenyRemovalMocks();
      mockPrisma.permissionRequest.findFirst.mockResolvedValue({
        id: 'existing-req',
        type: 'DENY_REMOVAL',
        status: 'PENDING',
        data: { policyId: 'different-policy' },
      });
      mockPrisma.permissionRequest.create.mockResolvedValue({
        id: 'new-req',
        type: 'DENY_REMOVAL',
      });

      const ctx = createUserContext();
      const input = {
        type: 'DENY_REMOVAL',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
        data: { policyId: 'deny-policy-1' },
      };

      const result = await userPermissionRequestsRouter.create({ ctx, input });

      expect(result.id).toBe('new-req');
    });

    test('should throw BAD_REQUEST when tools are blocked by DENY policy in TOOL_ACCESS request', async () => {
      mockValidateToolNamesForOrganization.mockResolvedValue({
        valid: true,
        toolNames: ['sensitive::tool1'],
        warnings: [],
      });
      mockGetToolValidationErrorMessage.mockReturnValue(null);
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'DENIED',
        justification: 'Blocked by policy',
        policyIds: ['deny-policy-1'],
      });

      const ctx = createUserContext();
      const input = {
        type: 'TOOL_ACCESS',
        toolNames: ['sensitive::tool1'],
        reason: 'Need access',
      };

      await expect(userPermissionRequestsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message:
          'Some tools are blocked by admin policies. Use a restriction removal request instead.',
      });
    });
  });

  describe('create - OAuth auth type', () => {
    test('should skip validation for OAuth auth type', async () => {
      mockIsSentinelMcpServerUrl.mockReturnValue(false);
      mockPrisma.permissionRequest.create.mockResolvedValue({
        id: 'req-1',
        type: 'MCP_SERVER',
      });

      const ctx = createUserContext();
      const input = {
        type: 'MCP_SERVER',
        reason: 'Need server',
        data: { name: 'OAuth Server', url: 'https://oauth.example.com', authType: 'OAUTH' },
      };

      await userPermissionRequestsRouter.create({ ctx, input });

      expect(mockValidateMcpServerUrl).not.toHaveBeenCalled();
    });
  });
});
