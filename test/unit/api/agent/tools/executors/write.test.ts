/**
 * Write Tool Executors Unit Tests
 * Tests for write tool executors that handle tool operations requiring confirmation
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockCreateConfirmation, mockGenerateActionDescription, mockValidatePolicyInput } =
  vi.hoisted(() => ({
    mockCreateConfirmation: vi.fn(),
    mockGenerateActionDescription: vi.fn(),
    mockValidatePolicyInput: vi.fn(),
  }));

vi.mock('../../../../../../packages/api/src/agent/confirmation.js', () => ({
  createConfirmation: mockCreateConfirmation,
  generateActionDescription: mockGenerateActionDescription,
}));

vi.mock('../../../../../../packages/api/src/services/policyValidation.js', () => ({
  validatePolicyInput: mockValidatePolicyInput,
}));

// Import after mocking
import type { AgentToolDefinition } from '@sentinel/shared';
import {
  executeWriteTool,
  getWriteToolBaseNames,
  isWriteTool,
} from '../../../../../../packages/api/src/agent/tools/executors/write.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Write Tool Executors', () => {
  const mockContext: ToolContext = {
    organizationId: 'org-123',
    conversationId: 'conv-456',
    userId: 'user-789',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockValidatePolicyInput.mockResolvedValue({});
    mockCreateConfirmation.mockResolvedValue({
      confirmationId: 'conf-123',
      toolName: 'test_tool',
      toolInput: {},
      description: 'Test confirmation',
      expiresAt: '2024-01-15T10:05:00.000Z',
    });
    mockGenerateActionDescription.mockReturnValue('Execute test action');
  });

  describe('executeWriteTool', () => {
    test('should successfully create confirmation for valid input', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_user',
        baseName: 'create_user',
        description: 'Create a user',
        inputSchema: {} as never,
        scope: 'USERS',
        isWriteTool: true,
      };
      const input = { email: 'test@example.com' };

      mockCreateConfirmation.mockResolvedValueOnce({
        confirmationId: 'conf-abc',
        toolName: 'create_user',
        toolInput: input,
        description: 'Create user with email test@example.com',
        expiresAt: '2024-01-15T10:05:00.000Z',
      });

      const result = await executeWriteTool(toolDef, input, mockContext);

      expect(result.success).toBe(true);
      expect(result.confirmationId).toBe('conf-abc');
      expect(result.data).toEqual({
        requiresConfirmation: true,
        message: 'Action requires confirmation: Create user with email test@example.com',
        description: 'Create user with email test@example.com',
        confirmationId: 'conf-abc',
        expiresAt: '2024-01-15T10:05:00.000Z',
      });
    });

    test('should return confirmationId and metadata', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_delete_policy',
        baseName: 'delete_policy',
        description: 'Delete a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = { id: 'policy-123' };

      mockCreateConfirmation.mockResolvedValueOnce({
        confirmationId: 'conf-xyz',
        toolName: 'delete_policy',
        toolInput: input,
        description: 'Delete policy policy-123',
        expiresAt: '2024-01-15T10:10:00.000Z',
      });

      const result = await executeWriteTool(toolDef, input, mockContext);

      expect(result.success).toBe(true);
      expect(result.confirmationId).toBe('conf-xyz');
      expect(result.data).toHaveProperty('requiresConfirmation', true);
      expect(result.data).toHaveProperty('expiresAt', '2024-01-15T10:10:00.000Z');
    });

    test('should include human-readable description in result', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_role',
        baseName: 'create_role',
        description: 'Create a role',
        inputSchema: {} as never,
        scope: 'ROLES',
        isWriteTool: true,
      };
      const input = { name: 'Admin' };

      mockCreateConfirmation.mockResolvedValueOnce({
        confirmationId: 'conf-role',
        toolName: 'create_role',
        toolInput: input,
        description: 'Create role "Admin"',
        expiresAt: '2024-01-15T10:05:00.000Z',
      });

      const result = await executeWriteTool(toolDef, input, mockContext);

      expect(result.success).toBe(true);
      expect((result.data as { message: string }).message).toContain('Create role "Admin"');
    });

    test('should validate create_policy input before creating confirmation', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_policy',
        baseName: 'create_policy',
        description: 'Create a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = {
        effect: 'ALLOW',
        matchers: ['role:Admin'],
        toolPatterns: ['*::*'],
        description: 'Allow all for admin',
      };

      mockValidatePolicyInput.mockResolvedValueOnce({
        validatedToolPatterns: ['*::*'],
      });

      await executeWriteTool(toolDef, input, mockContext);

      expect(mockValidatePolicyInput).toHaveBeenCalledWith('org-123', input, true);
    });

    test('should validate update_policy input before creating confirmation', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_update_policy',
        baseName: 'update_policy',
        description: 'Update a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = {
        id: 'policy-123',
        toolPatterns: ['github::*'],
      };

      mockValidatePolicyInput.mockResolvedValueOnce({
        validatedToolPatterns: ['github.com::*'],
      });

      await executeWriteTool(toolDef, input, mockContext);

      expect(mockValidatePolicyInput).toHaveBeenCalledWith('org-123', input, false);
    });

    test('should return validation error immediately for invalid policy input', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_policy',
        baseName: 'create_policy',
        description: 'Create a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = {
        effect: 'ALLOW',
        matchers: ['role:Admin'],
        toolPatterns: ['InvalidServer::tool'],
        description: 'Test',
      };

      mockValidatePolicyInput.mockRejectedValueOnce(
        new Error('Unknown server "InvalidServer" in pattern'),
      );

      const result = await executeWriteTool(toolDef, input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown server "InvalidServer" in pattern');
      expect(mockCreateConfirmation).not.toHaveBeenCalled();
    });

    test('should use validated/normalized input for confirmation (not original)', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_policy',
        baseName: 'create_policy',
        description: 'Create a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = {
        effect: 'ALLOW',
        matchers: ['*'],
        toolPatterns: ['notion::updatePage'],
        description: 'Allow Notion updates',
      };

      // Validation returns normalized patterns
      mockValidatePolicyInput.mockResolvedValueOnce({
        validatedToolPatterns: ['api.notion.so::updatePage'],
      });

      mockCreateConfirmation.mockResolvedValueOnce({
        confirmationId: 'conf-normalized',
        toolName: 'create_policy',
        toolInput: { ...input, toolPatterns: ['api.notion.so::updatePage'] },
        description: 'Create ALLOW policy',
        expiresAt: '2024-01-15T10:05:00.000Z',
      });

      await executeWriteTool(toolDef, input, mockContext);

      // Confirmation should be created with validated/normalized patterns
      expect(mockCreateConfirmation).toHaveBeenCalledWith({
        organizationId: 'org-123',
        conversationId: 'conv-456',
        toolName: 'create_policy',
        toolInput: expect.objectContaining({
          toolPatterns: ['api.notion.so::updatePage'],
        }),
        description: expect.any(String),
      });
    });

    test('should pass non-policy tools without special validation', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_user',
        baseName: 'create_user',
        description: 'Create a user',
        inputSchema: {} as never,
        scope: 'USERS',
        isWriteTool: true,
      };
      const input = { email: 'user@example.com' };

      await executeWriteTool(toolDef, input, mockContext);

      // validatePolicyInput should not be called for non-policy tools
      expect(mockValidatePolicyInput).not.toHaveBeenCalled();
      expect(mockCreateConfirmation).toHaveBeenCalled();
    });

    test('should handle non-Error thrown values during validation', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_policy',
        baseName: 'create_policy',
        description: 'Create a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };

      mockValidatePolicyInput.mockRejectedValueOnce('string error');

      const result = await executeWriteTool(toolDef, { effect: 'ALLOW' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation failed');
    });
  });

  describe('isWriteTool', () => {
    test('should return true for tool with isWriteTool=true', () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_policy',
        baseName: 'create_policy',
        description: 'Create a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };

      expect(isWriteTool(toolDef)).toBe(true);
    });

    test('should return false for tool with isWriteTool=false', () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_list_policies',
        baseName: 'list_policies',
        description: 'List policies',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: false,
      };

      expect(isWriteTool(toolDef)).toBe(false);
    });
  });

  describe('getWriteToolBaseNames', () => {
    test('should return only base names of write tools', () => {
      const toolDefs: AgentToolDefinition[] = [
        {
          name: 'admin_create_policy',
          baseName: 'create_policy',
          description: 'Create a policy',
          inputSchema: {} as never,
          scope: 'POLICIES',
          isWriteTool: true,
        },
        {
          name: 'admin_list_policies',
          baseName: 'list_policies',
          description: 'List policies',
          inputSchema: {} as never,
          scope: 'POLICIES',
          isWriteTool: false,
        },
        {
          name: 'admin_delete_policy',
          baseName: 'delete_policy',
          description: 'Delete a policy',
          inputSchema: {} as never,
          scope: 'POLICIES',
          isWriteTool: true,
        },
      ];

      const result = getWriteToolBaseNames(toolDefs);

      expect(result).toEqual(['create_policy', 'delete_policy']);
    });

    test('should handle empty array', () => {
      const result = getWriteToolBaseNames([]);

      expect(result).toEqual([]);
    });

    test('should filter out read-only tools', () => {
      const toolDefs: AgentToolDefinition[] = [
        {
          name: 'admin_list_users',
          baseName: 'list_users',
          description: 'List users',
          inputSchema: {} as never,
          scope: 'USERS',
          isWriteTool: false,
        },
        {
          name: 'admin_get_user',
          baseName: 'get_user',
          description: 'Get user',
          inputSchema: {} as never,
          scope: 'USERS',
          isWriteTool: false,
        },
      ];

      const result = getWriteToolBaseNames(toolDefs);

      expect(result).toEqual([]);
    });
  });

  describe('generateDescription (via executeWriteTool)', () => {
    // Helper to test description generation by inspecting createConfirmation calls
    async function getGeneratedDescription(baseName: string, input: Record<string, unknown>) {
      const toolDef: AgentToolDefinition = {
        name: `admin_${baseName}`,
        baseName,
        description: `${baseName} operation`,
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };

      // Reset mock to capture new call
      mockCreateConfirmation.mockResolvedValueOnce({
        confirmationId: 'conf-test',
        toolName: baseName,
        toolInput: input,
        description: 'Test',
        expiresAt: '2024-01-15T10:05:00.000Z',
      });

      await executeWriteTool(toolDef, input, mockContext);

      const lastCall =
        mockCreateConfirmation.mock.calls[mockCreateConfirmation.mock.calls.length - 1];
      return lastCall?.[0]?.description as string;
    }

    describe('Policy tools', () => {
      test('create_policy: includes effect, matchers, tool patterns', async () => {
        const input = {
          effect: 'ALLOW',
          matchers: ['role:Admin', 'role:SuperUser'],
          toolPatterns: ['github::*', 'notion::*'],
          description: 'Allow admin access',
        };

        const description = await getGeneratedDescription('create_policy', input);

        expect(description).toContain('ALLOW');
        expect(description).toContain('role:Admin');
        expect(description).toContain('role:SuperUser');
        expect(description).toContain('github::*');
        expect(description).toContain('notion::*');
      });

      test('create_policy: handles undefined matchers with fallback to "all"', async () => {
        const input = {
          effect: 'DENY',
          toolPatterns: ['github::*'],
          description: 'Deny without matchers',
        };

        const description = await getGeneratedDescription('create_policy', input);

        expect(description).toContain('DENY');
        expect(description).toContain('all');
        expect(description).toContain('github::*');
      });

      test('create_policy: handles undefined toolPatterns with fallback to "*"', async () => {
        const input = {
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          description: 'Allow without toolPatterns',
        };

        const description = await getGeneratedDescription('create_policy', input);

        expect(description).toContain('ALLOW');
        expect(description).toContain('role:Admin');
        expect(description).toContain('*');
      });

      test('create_policy: handles both matchers and toolPatterns undefined', async () => {
        const input = {
          effect: 'DENY',
          description: 'Deny all',
        };

        const description = await getGeneratedDescription('create_policy', input);

        expect(description).toContain('DENY');
        expect(description).toContain('all');
        expect(description).toContain('*');
      });

      test('update_policy: includes policy id', async () => {
        const input = { id: 'policy-abc-123' };

        const description = await getGeneratedDescription('update_policy', input);

        expect(description).toContain('policy-abc-123');
      });

      test('update_policy: includes policy slug when id not provided', async () => {
        const input = { slug: 'admin-access-policy' };

        const description = await getGeneratedDescription('update_policy', input);

        expect(description).toContain('admin-access-policy');
      });

      test('delete_policy: includes policy id', async () => {
        const input = { id: 'policy-to-delete' };

        const description = await getGeneratedDescription('delete_policy', input);

        expect(description).toContain('policy-to-delete');
      });

      test('enable_policy: includes policy id', async () => {
        const input = { id: 'policy-enable' };

        const description = await getGeneratedDescription('enable_policy', input);

        expect(description).toContain('policy-enable');
      });

      test('disable_policy: includes policy id', async () => {
        const input = { id: 'policy-disable' };

        const description = await getGeneratedDescription('disable_policy', input);

        expect(description).toContain('policy-disable');
      });
    });

    describe('User tools', () => {
      test('create_user: includes email', async () => {
        const input = { email: 'newuser@example.com', name: 'New User' };

        const description = await getGeneratedDescription('create_user', input);

        expect(description).toContain('newuser@example.com');
      });

      test('update_user: includes user id', async () => {
        const input = { id: 'user-abc' };

        const description = await getGeneratedDescription('update_user', input);

        expect(description).toContain('user-abc');
      });

      test('delete_user: includes user id', async () => {
        const input = { id: 'user-to-delete' };

        const description = await getGeneratedDescription('delete_user', input);

        expect(description).toContain('user-to-delete');
      });
    });

    describe('Role tools', () => {
      test('create_role: includes role name', async () => {
        const input = { name: 'SuperAdmin' };

        const description = await getGeneratedDescription('create_role', input);

        expect(description).toContain('SuperAdmin');
      });

      test('update_role: includes role id', async () => {
        const input = { id: 'role-123' };

        const description = await getGeneratedDescription('update_role', input);

        expect(description).toContain('role-123');
      });

      test('delete_role: includes role id', async () => {
        const input = { id: 'role-to-delete' };

        const description = await getGeneratedDescription('delete_role', input);

        expect(description).toContain('role-to-delete');
      });
    });

    describe('MCP Server tools', () => {
      test('create_mcp_server: includes name and url', async () => {
        const input = { name: 'Notion Server', url: 'https://api.notion.so/mcp' };

        const description = await getGeneratedDescription('create_mcp_server', input);

        expect(description).toContain('Notion Server');
        expect(description).toContain('https://api.notion.so/mcp');
      });

      test('update_mcp_server: includes server id', async () => {
        const input = { id: 'server-xyz' };

        const description = await getGeneratedDescription('update_mcp_server', input);

        expect(description).toContain('server-xyz');
      });

      test('delete_mcp_server: includes server id', async () => {
        const input = { id: 'server-to-delete' };

        const description = await getGeneratedDescription('delete_mcp_server', input);

        expect(description).toContain('server-to-delete');
      });
    });

    describe('Agent tools', () => {
      test('create_agent: includes agent name', async () => {
        const input = { name: 'Claude Assistant' };

        const description = await getGeneratedDescription('create_agent', input);

        expect(description).toContain('Claude Assistant');
      });

      test('delete_agent: includes agent id', async () => {
        const input = { id: 'agent-123' };

        const description = await getGeneratedDescription('delete_agent', input);

        expect(description).toContain('agent-123');
      });
    });

    describe('Webhook tools', () => {
      test('create_webhook: includes name and events', async () => {
        const input = {
          name: 'Security Alerts',
          events: ['TOOL_INVOCATION_DENIED', 'POLICY_CREATED'],
        };

        const description = await getGeneratedDescription('create_webhook', input);

        expect(description).toContain('Security Alerts');
        expect(description).toContain('TOOL_INVOCATION_DENIED');
        expect(description).toContain('POLICY_CREATED');
      });

      test('create_webhook: handles undefined events with empty list fallback', async () => {
        const input = {
          name: 'Empty Events Webhook',
        };

        const description = await getGeneratedDescription('create_webhook', input);

        expect(description).toContain('Empty Events Webhook');
        expect(description).toContain('events:');
      });

      test('update_webhook: includes webhook id', async () => {
        const input = { id: 'webhook-456' };

        const description = await getGeneratedDescription('update_webhook', input);

        expect(description).toContain('webhook-456');
      });

      test('delete_webhook: includes webhook id', async () => {
        const input = { id: 'webhook-to-delete' };

        const description = await getGeneratedDescription('delete_webhook', input);

        expect(description).toContain('webhook-to-delete');
      });
    });

    describe('Permission request tools', () => {
      test('approve_request: includes request id', async () => {
        const input = { id: 'request-789' };

        const description = await getGeneratedDescription('approve_request', input);

        expect(description).toContain('request-789');
      });

      test('deny_request: includes request id', async () => {
        const input = { id: 'request-deny' };

        const description = await getGeneratedDescription('deny_request', input);

        expect(description).toContain('request-deny');
      });
    });

    describe('Fallback behavior', () => {
      test('falls back to generateActionDescription for unknown tools', async () => {
        mockGenerateActionDescription.mockReturnValueOnce('Execute custom_action');

        const input = { customField: 'value' };

        const description = await getGeneratedDescription('custom_unknown_tool', input);

        // Should fall back since custom_unknown_tool isn't in DESCRIPTION_GENERATORS
        expect(description).toBeDefined();
      });
    });
  });

  describe('validateWriteToolInput', () => {
    test('create_policy: calls validatePolicyInput with isCreate=true', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_policy',
        baseName: 'create_policy',
        description: 'Create a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = {
        effect: 'DENY',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        description: 'Deny all',
      };

      await executeWriteTool(toolDef, input, mockContext);

      expect(mockValidatePolicyInput).toHaveBeenCalledWith('org-123', input, true);
    });

    test('update_policy: calls validatePolicyInput with isCreate=false', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_update_policy',
        baseName: 'update_policy',
        description: 'Update a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = {
        id: 'policy-123',
        matchers: ['role:Editor'],
      };

      await executeWriteTool(toolDef, input, mockContext);

      expect(mockValidatePolicyInput).toHaveBeenCalledWith('org-123', input, false);
    });

    test('other tools: returns input unchanged', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_role',
        baseName: 'create_role',
        description: 'Create a role',
        inputSchema: {} as never,
        scope: 'ROLES',
        isWriteTool: true,
      };
      const input = { name: 'TestRole' };

      await executeWriteTool(toolDef, input, mockContext);

      // validatePolicyInput should not be called
      expect(mockValidatePolicyInput).not.toHaveBeenCalled();

      // createConfirmation should be called with original input
      expect(mockCreateConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          toolInput: input,
        }),
      );
    });

    test('validation failure returns error immediately', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_update_policy',
        baseName: 'update_policy',
        description: 'Update a policy',
        inputSchema: {} as never,
        scope: 'POLICIES',
        isWriteTool: true,
      };
      const input = {
        id: 'policy-123',
        toolPatterns: ['BadServer::badTool'],
      };

      mockValidatePolicyInput.mockRejectedValueOnce(
        new Error('Invalid tool pattern: BadServer::badTool'),
      );

      const result = await executeWriteTool(toolDef, input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tool pattern: BadServer::badTool');
      expect(mockCreateConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('Context handling', () => {
    test('should pass organizationId to createConfirmation', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_user',
        baseName: 'create_user',
        description: 'Create user',
        inputSchema: {} as never,
        scope: 'USERS',
        isWriteTool: true,
      };

      await executeWriteTool(toolDef, { email: 'test@test.com' }, mockContext);

      expect(mockCreateConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
        }),
      );
    });

    test('should pass conversationId to createConfirmation', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_user',
        baseName: 'create_user',
        description: 'Create user',
        inputSchema: {} as never,
        scope: 'USERS',
        isWriteTool: true,
      };

      await executeWriteTool(toolDef, { email: 'test@test.com' }, mockContext);

      expect(mockCreateConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-456',
        }),
      );
    });

    test('should handle context without conversationId', async () => {
      const toolDef: AgentToolDefinition = {
        name: 'admin_create_user',
        baseName: 'create_user',
        description: 'Create user',
        inputSchema: {} as never,
        scope: 'USERS',
        isWriteTool: true,
      };
      const contextWithoutConv: ToolContext = {
        organizationId: 'org-123',
      };

      await executeWriteTool(toolDef, { email: 'test@test.com' }, contextWithoutConv);

      expect(mockCreateConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          conversationId: undefined,
        }),
      );
    });
  });
});
