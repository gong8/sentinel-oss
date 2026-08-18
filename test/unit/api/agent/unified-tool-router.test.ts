/**
 * Unified Tool Router Unit Tests
 * Tests for mode-aware tool routing (fully mocked, no API calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const {
  mockGetTools,
  mockWorkspaceGetAvailableTools,
  mockWorkspaceExecuteTool,
  mockAdminExecuteTool,
} = vi.hoisted(() => ({
  mockGetTools: vi.fn(),
  mockWorkspaceGetAvailableTools: vi.fn(),
  mockWorkspaceExecuteTool: vi.fn(),
  mockAdminExecuteTool: vi.fn(),
}));

// Mock admin tool registry
const mockToolRegistry = {
  getTools: mockGetTools,
  getTool: vi.fn(),
  hasTool: vi.fn(),
  get: vi.fn(),
};

vi.mock('../../../../packages/api/src/agent/tools/index.js', () => ({
  createToolRegistry: vi.fn(() => mockToolRegistry),
  executeTool: mockAdminExecuteTool,
}));

// Mock workspace tool router with proper class
vi.mock('../../../../packages/api/src/services/workspace-tool-router.js', () => ({
  WorkspaceToolRouter: class MockWorkspaceToolRouter {
    getAvailableTools = mockWorkspaceGetAvailableTools;
    executeTool = mockWorkspaceExecuteTool;
  },
}));

// Mock docs search tool
vi.mock('../../../../packages/api/src/services/docs-search-tool.js', () => ({
  searchSentinelDocs: vi.fn(() => []),
  searchSentinelDocsTool: {
    name: 'search_sentinel_docs',
    description: 'Search Sentinel documentation',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
}));

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocking
import { UnifiedToolRouter } from '../../../../packages/api/src/agent/unified-tool-router.js';
import type {
  AdminAgentContext,
  WorkspaceAgentContext,
} from '../../../../packages/api/src/agent/unified-types.js';

describe('UnifiedToolRouter', () => {
  let router: UnifiedToolRouter;

  const adminContext: AdminAgentContext = {
    mode: 'admin',
    organizationId: 'org-1',
    userId: 'user-1',
    conversationId: 'conv-1',
  };

  const workspaceContext: WorkspaceAgentContext = {
    mode: 'workspace',
    organizationId: 'org-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    workspaceId: 'ws-1',
    userEmail: 'user@test.com',
    userRoles: ['user'],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default admin tools (no domain:: prefix)
    const adminTools = [
      { name: 'list_policies', description: 'List policies', input_schema: { type: 'object' } },
      { name: 'create_policy', description: 'Create policy', input_schema: { type: 'object' } },
    ];
    mockGetTools.mockReturnValue(adminTools);

    // Mock registry.get() to return tool by name
    mockToolRegistry.get.mockImplementation((name: string) => {
      return adminTools.find((t) => t.name === name) ?? null;
    });

    // Default workspace tools (MCP tools with domain:: prefix)
    mockWorkspaceGetAvailableTools.mockResolvedValue([
      {
        name: 'github::list_repos',
        description: 'List GitHub repos',
        inputSchema: { type: 'object' },
        serverName: 'github',
        serverDomain: 'github.com',
      },
    ]);

    router = new UnifiedToolRouter();
  });

  describe('getAvailableTools', () => {
    test('admin context returns admin tools plus MCP tools and docs search', async () => {
      const tools = await router.getAvailableTools(adminContext);

      expect(mockGetTools).toHaveBeenCalled();
      // Admin tools (2) + MCP tools from org-wide servers (1) + docs search (1) = 4
      expect(tools).toHaveLength(4);
      expect(tools[0].name).toBe('list_policies');
      expect(tools[1].name).toBe('create_policy');
      // MCP tools are included for admin context (for org-wide servers)
      expect(tools[2].name).toBe('github::list_repos');
      expect(tools[3].name).toBe('search_sentinel_docs');
    });

    test('workspace context returns MCP tools plus search_sentinel_docs', async () => {
      const tools = await router.getAvailableTools(workspaceContext);

      expect(mockWorkspaceGetAvailableTools).toHaveBeenCalledWith('org-1', 'ws-1');
      // Should include MCP tool + docs search tool
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('github::list_repos');
      expect(tools[1].name).toBe('search_sentinel_docs');
    });

    test('admin context triggers workspace router for org-wide MCP tools', async () => {
      await router.getAvailableTools(adminContext);

      // Admin context now includes org-wide MCP tools
      expect(mockWorkspaceGetAvailableTools).toHaveBeenCalledWith('org-1', '');
    });

    test('workspace context does NOT trigger admin registry', async () => {
      await router.getAvailableTools(workspaceContext);

      expect(mockGetTools).not.toHaveBeenCalled();
    });
  });

  describe('executeTool', () => {
    test('admin context executes via admin registry', async () => {
      mockAdminExecuteTool.mockResolvedValue({
        success: true,
        data: { policies: [] },
      });

      const result = await router.executeTool('list_policies', {}, adminContext, 'tool-1');

      expect(mockAdminExecuteTool).toHaveBeenCalledWith(
        'list_policies',
        {},
        expect.objectContaining({ organizationId: 'org-1' }),
        mockToolRegistry,
      );
      expect(result.name).toBe('list_policies');
      expect(result.result).toEqual({ policies: [] });
    });

    test('admin context returns confirmationId for write tools', async () => {
      mockAdminExecuteTool.mockResolvedValue({
        success: true,
        data: { id: 'policy-1' },
        confirmationId: 'confirm-123',
      });

      const result = await router.executeTool(
        'create_policy',
        { name: 'Test' },
        adminContext,
        'tool-2',
      );

      expect(result.confirmationId).toBe('confirm-123');
    });

    test('workspace context executes via workspace router', async () => {
      mockWorkspaceExecuteTool.mockResolvedValue({
        success: true,
        result: { repos: [] },
        decision: 'ALLOWED',
      });

      const result = await router.executeTool('github::list_repos', {}, workspaceContext, 'tool-3');

      expect(mockWorkspaceExecuteTool).toHaveBeenCalledWith(
        'github::list_repos',
        {},
        expect.objectContaining({
          workspaceId: 'ws-1',
          userEmail: 'user@test.com',
        }),
      );
      expect(result.name).toBe('github::list_repos');
      expect(result.decision).toBe('ALLOWED');
    });

    test('workspace context returns DENIED with reason when policy denies', async () => {
      mockWorkspaceExecuteTool.mockResolvedValue({
        success: false,
        decision: 'DENIED',
        deniedReason: 'Access not permitted by policy',
        serverDomain: 'github.com',
        blockingPolicyId: 'policy-456',
      });

      const result = await router.executeTool(
        'github::delete_repo',
        { id: 'repo-1' },
        workspaceContext,
        'tool-4',
      );

      expect(result.decision).toBe('DENIED');
      expect(result.deniedReason).toBe('Access not permitted by policy');
      expect(result.serverDomain).toBe('github.com');
      expect(result.blockingPolicyId).toBe('policy-456');
    });

    test('admin context cannot trigger workspace tool execution', async () => {
      mockAdminExecuteTool.mockResolvedValue({
        success: true,
        data: {},
      });

      await router.executeTool('list_policies', {}, adminContext, 'tool-5');

      expect(mockWorkspaceExecuteTool).not.toHaveBeenCalled();
    });

    test('workspace context cannot trigger admin tool execution', async () => {
      mockWorkspaceExecuteTool.mockResolvedValue({
        success: true,
        result: {},
        decision: 'ALLOWED',
      });

      await router.executeTool('github::list_repos', {}, workspaceContext, 'tool-6');

      expect(mockAdminExecuteTool).not.toHaveBeenCalled();
    });

    test('built-in search_sentinel_docs works in both modes', async () => {
      const adminResult = await router.executeTool(
        'search_sentinel_docs',
        { query: 'policies' },
        adminContext,
        'tool-7',
      );
      expect(adminResult.decision).toBe('ALLOWED');
      expect(adminResult.result).toBeDefined();

      const workspaceResult = await router.executeTool(
        'search_sentinel_docs',
        { query: 'policies' },
        workspaceContext,
        'tool-8',
      );
      expect(workspaceResult.decision).toBe('ALLOWED');
      expect(workspaceResult.result).toBeDefined();
    });
  });

  describe('mode isolation security', () => {
    test('admin tools are not accessible from workspace context', async () => {
      // Workspace context should only get MCP tools
      const tools = await router.getAvailableTools(workspaceContext);

      // Should not include admin tools like list_policies
      const adminToolNames = ['list_policies', 'create_policy'];
      const hasAdminTools = tools.some((t) => adminToolNames.includes(t.name));
      expect(hasAdminTools).toBe(false);
    });

    test('admin context includes org-wide MCP tools', async () => {
      const tools = await router.getAvailableTools(adminContext);

      // Admin context now includes org-wide MCP tools for administration
      const mcpTools = tools.filter((t) => t.name.includes('::'));
      expect(mcpTools.length).toBeGreaterThan(0);
      expect(mcpTools[0].name).toBe('github::list_repos');
    });
  });
});
