/**
 * Agent Tools Index Unit Tests
 * Tests for tool registry creation and execution
 *
 * Note: These tests verify the tool registry mechanics, not the underlying executors.
 * Executor tests are in separate files.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

// Mock the executor modules
vi.mock('../../../../packages/api/src/agent/tools/executors/index.js', () => ({
  executeReadTool: vi.fn().mockResolvedValue({
    success: true,
    data: { mockResult: true },
  }),
  executeWriteTool: vi.fn().mockResolvedValue({
    success: true,
    data: { description: 'Mock confirmation' },
    confirmationId: 'conf-123',
  }),
}));

// Import after mocking
import {
  allTools,
  createToolRegistry,
  executeTool,
  readTools,
  writeTools,
} from '../../../../packages/api/src/agent/tools/index.js';

describe('Tools Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readTools', () => {
    test('should include all read tool categories', () => {
      const toolNames = readTools.map((t) => t.name);

      // Read tools should have the base name (without admin_ prefix)
      expect(toolNames).toContain('list_policies');
      expect(toolNames).toContain('get_policy');
      expect(toolNames).toContain('list_users');
      expect(toolNames).toContain('list_roles');
      expect(toolNames).toContain('list_mcp_servers');
      expect(toolNames).toContain('list_agents');
      expect(toolNames).toContain('list_sensitive_flags');
      expect(toolNames).toContain('list_webhooks');
      expect(toolNames).toContain('list_permission_requests');
      expect(toolNames).toContain('get_analytics_summary');
      expect(toolNames).toContain('query_audit_log');
    });
  });

  describe('writeTools', () => {
    test('should include write tools', () => {
      const toolNames = writeTools.map((t) => t.name);

      // Write tools should have the base name (without admin_ prefix)
      expect(toolNames).toContain('create_policy');
      expect(toolNames).toContain('update_policy');
      expect(toolNames).toContain('delete_policy');
      expect(toolNames).toContain('create_user');
      expect(toolNames).toContain('create_role');
    });
  });

  describe('allTools', () => {
    test('should include both read and write tools', () => {
      expect(allTools.length).toBe(readTools.length + writeTools.length);
    });
  });

  describe('createToolRegistry', () => {
    test('should create registry with read tools only by default', () => {
      const registry = createToolRegistry();

      // Should have read tools
      expect(registry.get('list_policies')).toBeDefined();
      expect(registry.get('query_audit_log')).toBeDefined();
      // Should NOT have write tools
      expect(registry.get('create_policy')).toBeUndefined();
    });

    test('should include write tools when configured', () => {
      const registry = createToolRegistry({ includeWriteTools: true });

      expect(registry.get('list_policies')).toBeDefined();
      expect(registry.get('create_policy')).toBeDefined();
    });

    test('should not include write tools when explicitly disabled', () => {
      const registry = createToolRegistry({ includeWriteTools: false });

      expect(registry.get('create_policy')).toBeUndefined();
    });
  });

  describe('executeTool', () => {
    test('should execute registered tool', async () => {
      const context = { organizationId: 'org-1' };
      const result = await executeTool('list_policies', { limit: 10 }, context);

      expect(result.success).toBe(true);
    });

    test('should return error for unknown tool', async () => {
      const context = { organizationId: 'org-1' };
      const result = await executeTool('nonexistent_tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown tool: nonexistent_tool');
    });

    test('should use provided registry', async () => {
      const registry = createToolRegistry({ includeWriteTools: true });
      const context = { organizationId: 'org-1' };

      const result = await executeTool(
        'create_policy',
        {
          effect: 'ALLOW',
          matchers: ['*'],
          toolPatterns: ['*::*'],
          description: 'Test policy',
        },
        context,
        registry,
      );

      expect(result.success).toBe(true);
      expect(result.confirmationId).toBe('conf-123');
    });

    test('should catch and return tool execution errors', async () => {
      const failingTool = {
        name: 'failing_tool',
        description: 'Tool that fails',
        inputSchema: z.object({}),
        execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
      };

      const registry = createToolRegistry();
      registry.register(failingTool);

      const context = { organizationId: 'org-1' };
      const result = await executeTool('failing_tool', {}, context, registry);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    test('should handle non-Error thrown values', async () => {
      const weirdTool = {
        name: 'weird_tool',
        description: 'Tool that throws non-Error',
        inputSchema: z.object({}),
        execute: vi.fn().mockRejectedValue('string error'),
      };

      const registry = createToolRegistry();
      registry.register(weirdTool);

      const context = { organizationId: 'org-1' };
      const result = await executeTool('weird_tool', {}, context, registry);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error executing tool');
    });

    test('should pass context to tool execution', async () => {
      const { executeReadTool } =
        await import('../../../../packages/api/src/agent/tools/executors/index.js');

      const context = {
        organizationId: 'org-1',
        userId: 'user-1',
        agentId: 'agent-1',
        conversationId: 'conv-1',
      };

      await executeTool('list_policies', { limit: 10 }, context);

      // executeReadTool should be called with the tool name, input, and context
      expect(executeReadTool).toHaveBeenCalledWith('list_policies', expect.any(Object), context);
    });

    test('should create default registry if none provided', async () => {
      const context = { organizationId: 'org-1' };

      // Should work without explicit registry
      const result = await executeTool('list_policies', {}, context);

      expect(result.success).toBe(true);
    });
  });
});
