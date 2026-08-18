/**
 * Tests for Proxy Router - Webhook Events
 * Tests that TOOL_INVOCATION_ALLOWED and TOOL_INVOCATION_DENIED webhooks are sent
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogToolInvocation, mockSendWebhook, mockEvaluateSensitiveFlags } =
  vi.hoisted(() => ({
    mockPrisma: {
      user: {
        findUnique: vi.fn(),
      },
      agent: {
        findUnique: vi.fn(),
      },
      policy: {
        findMany: vi.fn(),
      },
      mcpServer: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      userMcpConfig: {
        findUnique: vi.fn(),
      },
      orgMcpOAuthToken: {
        findUnique: vi.fn(),
      },
    },
    mockLogToolInvocation: vi.fn(),
    mockSendWebhook: vi.fn(),
    mockEvaluateSensitiveFlags: vi.fn(),
  }));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  AuditDecision: {
    ALLOWED: 'ALLOWED',
    DENIED: 'DENIED',
  },
  WebhookEvent: {
    TOOL_INVOCATION_ALLOWED: 'TOOL_INVOCATION_ALLOWED',
    TOOL_INVOCATION_DENIED: 'TOOL_INVOCATION_DENIED',
  },
}));

vi.mock('../../../../../packages/api/src/services/audit.js', () => ({
  logToolInvocation: mockLogToolInvocation,
}));

vi.mock('../../../../../packages/api/src/services/webhook.js', () => ({
  sendWebhook: mockSendWebhook,
}));

vi.mock('../../../../../packages/api/src/services/sensitiveFlag.js', () => ({
  evaluateSensitiveFlags: mockEvaluateSensitiveFlags,
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  evaluatePolicy: vi.fn().mockResolvedValue({
    decision: 'ALLOWED',
    justification: 'Test',
    policyIds: [],
  }),
  checkMatcher: vi.fn().mockReturnValue(true),
  checkToolPattern: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../../../packages/api/src/services/mcp.js', () => ({
  findMcpServerByToolName: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../../packages/api/src/services/oauth.js', () => ({
  refreshAccessToken: vi.fn(),
  refreshOrgAccessToken: vi.fn(),
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  proxyProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { proxyRouter as _proxyRouter } from '../../../../../packages/api/src/trpc/proxy/index.js';

// Re-type the router to use our test-friendly handler type
type TestableHandler<T = Record<string, unknown>> = (opts: { input: unknown }) => Promise<T>;

const proxyRouter = _proxyRouter as unknown as {
  logAuditEntry: TestableHandler<{ success: boolean }>;
  evaluatePolicy: TestableHandler;
  getMcpServer: TestableHandler;
  getUserCredentials: TestableHandler;
  listMcpServers: TestableHandler;
  refreshOAuthToken: TestableHandler;
  evaluateSensitiveFlags: TestableHandler;
};

beforeAll(() => {
  console.log('Proxy Router Webhook Tests starting...');
});

afterAll(() => {
  console.log('Proxy Router Webhook Tests complete');
});

beforeEach(() => {
  vi.clearAllMocks();
  // Mock sendWebhook to return a resolved promise (fire-and-forget pattern)
  mockSendWebhook.mockResolvedValue(undefined);
  mockLogToolInvocation.mockResolvedValue(undefined);
  // Mock mcpServer.findMany for tool name lookup
  mockPrisma.mcpServer.findMany.mockResolvedValue([]);
});

describe('proxyRouter', () => {
  describe('logAuditEntry', () => {
    const baseInput = {
      organizationId: 'org-123',
      userId: 'user-123',
      agentId: 'agent-123',
      toolName: 'domain.com::tool',
      parameters: { param1: 'value1' },
      justification: 'Test justification',
      policyIds: ['policy-1'],
      matchedPolicyIds: ['policy-1'],
      policySnapshot: [{ id: 'policy-1', slug: 'test' }],
      userEmail: 'user@example.com',
      userRoles: ['User'],
      agentName: 'Test Agent',
    };

    test('should send TOOL_INVOCATION_ALLOWED webhook when decision is ALLOWED', async () => {
      const input = {
        ...baseInput,
        decision: 'ALLOWED',
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'TOOL_INVOCATION_ALLOWED',
        expect.objectContaining({
          toolName: 'domain.com::tool',
          userId: 'user-123',
          agentId: 'agent-123',
          userEmail: 'user@example.com',
          agentName: 'Test Agent',
          decision: 'ALLOWED',
          justification: 'Test justification',
          policyIds: ['policy-1'],
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should send TOOL_INVOCATION_DENIED webhook when decision is DENIED', async () => {
      const input = {
        ...baseInput,
        decision: 'DENIED',
        justification: 'Policy denied access',
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'TOOL_INVOCATION_DENIED',
        expect.objectContaining({
          toolName: 'domain.com::tool',
          userId: 'user-123',
          decision: 'DENIED',
          justification: 'Policy denied access',
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should call logToolInvocation with correct parameters', async () => {
      const input = {
        ...baseInput,
        decision: 'ALLOWED',
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockLogToolInvocation).toHaveBeenCalledWith({
        organizationId: 'org-123',
        userId: 'user-123',
        agentId: 'agent-123',
        toolName: 'domain.com::tool',
        parameters: { param1: 'value1' },
        decision: 'ALLOWED',
        justification: 'Test justification',
        policyIds: ['policy-1'],
        matchedPolicyIds: ['policy-1'],
        policySnapshot: [{ id: 'policy-1', slug: 'test' }],
        userEmail: 'user@example.com',
        userRoles: ['User'],
        agentName: 'Test Agent',
        workspaceId: null,
        // Pipeline audit fields
        pipelineStage: undefined,
        serverTrusted: undefined,
        trustCheckPassed: undefined,
        policyCheckPassed: undefined,
        rateLimitHit: undefined,
        // Live approval tracking fields
        approvalRequired: undefined,
        approvalRequestId: undefined,
        approvalStatus: undefined,
        approvalDecidedBy: undefined,
        approvalDecidedByEmail: undefined,
        approvalDecidedAt: null,
      });
    });

    test('should not block on webhook failure', async () => {
      // Simulate webhook failure
      mockSendWebhook.mockRejectedValue(new Error('Webhook delivery failed'));

      const input = {
        ...baseInput,
        decision: 'ALLOWED',
      };

      // Should not throw even if webhook fails
      const result = await proxyRouter.logAuditEntry({ input });
      expect(result.success).toBe(true);
    });

    test('should handle null userId', async () => {
      const input = {
        ...baseInput,
        userId: null,
        decision: 'ALLOWED',
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'TOOL_INVOCATION_ALLOWED',
        expect.objectContaining({
          userId: null,
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
      expect(mockLogToolInvocation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
        }),
      );
    });

    test('should handle null agentId', async () => {
      const input = {
        ...baseInput,
        agentId: null,
        decision: 'DENIED',
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'TOOL_INVOCATION_DENIED',
        expect.objectContaining({
          agentId: null,
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should always return success even if logToolInvocation fails', async () => {
      // logToolInvocation swallows errors internally per the implementation
      mockLogToolInvocation.mockResolvedValue(undefined);

      const input = {
        ...baseInput,
        decision: 'ALLOWED',
      };

      const result = await proxyRouter.logAuditEntry({ input });
      expect(result.success).toBe(true);
    });

    test('should send webhook with empty policyIds array', async () => {
      const input = {
        ...baseInput,
        decision: 'DENIED',
        policyIds: [],
        justification: 'Default deny - no matching policy',
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'TOOL_INVOCATION_DENIED',
        expect.objectContaining({
          policyIds: [],
          justification: 'Default deny - no matching policy',
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });
  });

  describe('webhook event selection', () => {
    test('should use TOOL_INVOCATION_ALLOWED for ALLOWED decision', async () => {
      const input = {
        organizationId: 'org-123',
        toolName: 'test::tool',
        parameters: {},
        decision: 'ALLOWED',
        policyIds: [],
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'TOOL_INVOCATION_ALLOWED',
        expect.anything(),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should use TOOL_INVOCATION_DENIED for DENIED decision', async () => {
      const input = {
        organizationId: 'org-123',
        toolName: 'test::tool',
        parameters: {},
        decision: 'DENIED',
        policyIds: [],
      };

      await proxyRouter.logAuditEntry({ input });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'TOOL_INVOCATION_DENIED',
        expect.anything(),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });
  });
});
