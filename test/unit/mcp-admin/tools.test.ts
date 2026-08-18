/**
 * Unit tests for Admin MCP Tools
 * Tests tool definitions and helper functions exported from @sentinel/shared
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import {
  ALL_TOOL_DEFINITIONS,
  getAdminToolName,
  getAllToolDefinitionsForAgent,
  getBaseName,
  getReadToolDefinitionsForAgent,
  getToolByName,
  getToolsForScopes,
  getWriteToolDefinitionsForAgent,
  READ_TOOL_DEFINITIONS,
  type ToolDefinition,
  WRITE_TOOL_DEFINITIONS,
} from '../../../packages/mcp-admin/src/tools.js';

describe('Admin MCP Tools', () => {
  describe('tool definitions arrays', () => {
    test('should export READ_TOOL_DEFINITIONS', () => {
      expect(READ_TOOL_DEFINITIONS).toBeDefined();
      expect(Array.isArray(READ_TOOL_DEFINITIONS)).toBe(true);
      expect(READ_TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    });

    test('should export WRITE_TOOL_DEFINITIONS', () => {
      expect(WRITE_TOOL_DEFINITIONS).toBeDefined();
      expect(Array.isArray(WRITE_TOOL_DEFINITIONS)).toBe(true);
      expect(WRITE_TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    });

    test('should export ALL_TOOL_DEFINITIONS as combination of read and write', () => {
      expect(ALL_TOOL_DEFINITIONS).toBeDefined();
      expect(Array.isArray(ALL_TOOL_DEFINITIONS)).toBe(true);
      expect(ALL_TOOL_DEFINITIONS.length).toBe(
        READ_TOOL_DEFINITIONS.length + WRITE_TOOL_DEFINITIONS.length,
      );
    });

    test('all read tools should have isWriteTool=false', () => {
      for (const tool of READ_TOOL_DEFINITIONS) {
        expect(tool.isWriteTool).toBe(false);
      }
    });

    test('all write tools should have isWriteTool=true', () => {
      for (const tool of WRITE_TOOL_DEFINITIONS) {
        expect(tool.isWriteTool).toBe(true);
      }
    });

    test('all tools should have required properties', () => {
      for (const tool of ALL_TOOL_DEFINITIONS) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.name).toMatch(/^admin_/);

        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');

        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema).toBeInstanceOf(z.ZodType);

        expect(tool.scope).toBeDefined();
        expect(typeof tool.scope).toBe('string');

        expect(typeof tool.isWriteTool).toBe('boolean');
      }
    });

    test('all tools should have unique names', () => {
      const names = ALL_TOOL_DEFINITIONS.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('tool scopes', () => {
    test('should have tools for POLICIES scope', () => {
      const policyTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'POLICIES');
      expect(policyTools.length).toBeGreaterThan(0);

      // Should have both read and write tools
      expect(policyTools.some((t) => !t.isWriteTool)).toBe(true);
      expect(policyTools.some((t) => t.isWriteTool)).toBe(true);
    });

    test('should have tools for USERS scope', () => {
      const userTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'USERS');
      expect(userTools.length).toBeGreaterThan(0);
    });

    test('should have tools for ROLES scope', () => {
      const roleTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'ROLES');
      expect(roleTools.length).toBeGreaterThan(0);
    });

    test('should have tools for MCP_SERVERS scope', () => {
      const serverTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'MCP_SERVERS');
      expect(serverTools.length).toBeGreaterThan(0);
    });

    test('should have tools for AGENTS scope', () => {
      const agentTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'AGENTS');
      expect(agentTools.length).toBeGreaterThan(0);
    });

    test('should have tools for SENSITIVE_FLAGS scope', () => {
      const flagTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'SENSITIVE_FLAGS');
      expect(flagTools.length).toBeGreaterThan(0);
    });

    test('should have tools for WEBHOOKS scope', () => {
      const webhookTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'WEBHOOKS');
      expect(webhookTools.length).toBeGreaterThan(0);
    });

    test('should have tools for PERMISSION_REQUESTS scope', () => {
      const requestTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'PERMISSION_REQUESTS');
      expect(requestTools.length).toBeGreaterThan(0);
    });

    test('should have tools for ANALYTICS scope', () => {
      const analyticsTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'ANALYTICS');
      expect(analyticsTools.length).toBeGreaterThan(0);
    });

    test('should have tools for AUDIT scope', () => {
      const auditTools = ALL_TOOL_DEFINITIONS.filter((t) => t.scope === 'AUDIT');
      expect(auditTools.length).toBeGreaterThan(0);
    });
  });

  describe('getToolsForScopes', () => {
    test('should return empty array for empty scopes', () => {
      const tools = getToolsForScopes([]);
      expect(tools).toEqual([]);
    });

    test('should return tools for single scope', () => {
      const tools = getToolsForScopes(['POLICIES']);

      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.scope).toBe('POLICIES');
      }
    });

    test('should return tools for multiple scopes', () => {
      const tools = getToolsForScopes(['POLICIES', 'USERS']);

      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(['POLICIES', 'USERS']).toContain(tool.scope);
      }
    });

    test('should return empty array for unknown scope', () => {
      const tools = getToolsForScopes(['UNKNOWN_SCOPE']);
      expect(tools).toEqual([]);
    });

    test('should return all tools for all scopes', () => {
      const allScopes = [
        'POLICIES',
        'USERS',
        'ROLES',
        'MCP_SERVERS',
        'AGENTS',
        'SENSITIVE_FLAGS',
        'WEBHOOKS',
        'PERMISSION_REQUESTS',
        'ANALYTICS',
        'AUDIT',
      ];

      const tools = getToolsForScopes(allScopes);
      expect(tools.length).toBe(ALL_TOOL_DEFINITIONS.length);
    });
  });

  describe('getToolByName', () => {
    test('should return tool definition for valid name', () => {
      const tool = getToolByName('admin_list_policies');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('admin_list_policies');
      expect(tool?.scope).toBe('POLICIES');
      expect(tool?.isWriteTool).toBe(false);
    });

    test('should return tool definition for write tool', () => {
      const tool = getToolByName('admin_create_policy');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('admin_create_policy');
      expect(tool?.scope).toBe('POLICIES');
      expect(tool?.isWriteTool).toBe(true);
    });

    test('should return undefined for unknown tool name', () => {
      const tool = getToolByName('admin_unknown_tool');

      expect(tool).toBeUndefined();
    });

    test('should return undefined for empty string', () => {
      const tool = getToolByName('');

      expect(tool).toBeUndefined();
    });

    test('should find all known read tools', () => {
      const readToolNames = [
        'admin_list_policies',
        'admin_get_policy',
        'admin_list_users',
        'admin_get_user',
        'admin_list_roles',
        'admin_get_role',
        'admin_list_mcp_servers',
        'admin_get_mcp_server',
        'admin_list_agents',
        'admin_get_agent',
        'admin_list_sensitive_flags',
        'admin_list_webhooks',
        'admin_list_permission_requests',
        'admin_get_analytics_summary',
        'admin_query_audit_log',
        'admin_query_admin_actions',
        'admin_search_param_values_by_label',
        'admin_get_param_suggestions',
      ];

      for (const name of readToolNames) {
        const tool = getToolByName(name);
        expect(tool).toBeDefined();
        expect(tool?.isWriteTool).toBe(false);
      }
    });

    test('should find all known write tools', () => {
      const writeToolNames = [
        'admin_create_policy',
        'admin_update_policy',
        'admin_delete_policy',
        'admin_enable_policy',
        'admin_disable_policy',
        'admin_create_user',
        'admin_update_user',
        'admin_delete_user',
        'admin_create_role',
        'admin_update_role',
        'admin_delete_role',
        'admin_create_mcp_server',
        'admin_update_mcp_server',
        'admin_delete_mcp_server',
        'admin_create_agent',
        'admin_delete_agent',
        'admin_create_webhook',
        'admin_update_webhook',
        'admin_delete_webhook',
        'admin_approve_request',
        'admin_deny_request',
      ];

      for (const name of writeToolNames) {
        const tool = getToolByName(name);
        expect(tool).toBeDefined();
        expect(tool?.isWriteTool).toBe(true);
      }
    });
  });

  describe('input schema validation', () => {
    test('admin_list_policies schema should validate correctly', () => {
      const tool = getToolByName('admin_list_policies');
      expect(tool).toBeDefined();

      const validInput = { limit: 10, offset: 0 };
      const result = tool!.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // Should accept empty object with defaults
      const defaultResult = tool!.inputSchema.safeParse({});
      expect(defaultResult.success).toBe(true);
    });

    test('admin_get_policy schema should require id', () => {
      const tool = getToolByName('admin_get_policy');
      expect(tool).toBeDefined();

      const validInput = { id: 'cljtest0000000000000000000' };
      const result = tool!.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // Should reject missing id
      const invalidResult = tool!.inputSchema.safeParse({});
      expect(invalidResult.success).toBe(false);
    });

    test('admin_create_policy schema should validate required fields', () => {
      const tool = getToolByName('admin_create_policy');
      expect(tool).toBeDefined();

      const validInput = {
        effect: 'ALLOW',
        matchers: ['user:admin@example.com'],
        toolPatterns: ['github::*'],
        description: 'Test policy',
      };
      const result = tool!.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // Should reject invalid effect
      const invalidEffect = tool!.inputSchema.safeParse({
        ...validInput,
        effect: 'INVALID',
      });
      expect(invalidEffect.success).toBe(false);

      // Should reject empty matchers
      const emptyMatchers = tool!.inputSchema.safeParse({
        ...validInput,
        matchers: [],
      });
      expect(emptyMatchers.success).toBe(false);
    });

    test('admin_create_user schema should validate email', () => {
      const tool = getToolByName('admin_create_user');
      expect(tool).toBeDefined();

      const validInput = {
        email: 'user@example.com',
        name: 'Test User',
      };
      const result = tool!.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // Should reject invalid email
      const invalidEmail = tool!.inputSchema.safeParse({
        email: 'not-an-email',
      });
      expect(invalidEmail.success).toBe(false);
    });

    test('admin_create_webhook schema should validate events', () => {
      const tool = getToolByName('admin_create_webhook');
      expect(tool).toBeDefined();

      const validInput = {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['TOOL_INVOCATION_ALLOWED', 'TOOL_INVOCATION_DENIED'],
      };
      const result = tool!.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // Should reject invalid event
      const invalidEvent = tool!.inputSchema.safeParse({
        ...validInput,
        events: ['INVALID_EVENT'],
      });
      expect(invalidEvent.success).toBe(false);

      // Should reject invalid URL
      const invalidUrl = tool!.inputSchema.safeParse({
        ...validInput,
        url: 'not-a-url',
      });
      expect(invalidUrl.success).toBe(false);
    });

    test('admin_list_permission_requests schema should validate status enum', () => {
      const tool = getToolByName('admin_list_permission_requests');
      expect(tool).toBeDefined();

      const validStatuses = ['PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN', 'MODIFIED'];

      for (const status of validStatuses) {
        const result = tool!.inputSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }

      // Should reject invalid status
      const invalidStatus = tool!.inputSchema.safeParse({ status: 'INVALID' });
      expect(invalidStatus.success).toBe(false);

      // Should accept empty object (status is optional)
      const emptyResult = tool!.inputSchema.safeParse({});
      expect(emptyResult.success).toBe(true);
    });
  });

  describe('agent helper functions', () => {
    describe('getBaseName', () => {
      test('should strip admin_ prefix', () => {
        expect(getBaseName('admin_list_policies')).toBe('list_policies');
        expect(getBaseName('admin_create_user')).toBe('create_user');
        expect(getBaseName('admin_get_analytics_summary')).toBe('get_analytics_summary');
      });

      test('should return unchanged if no admin_ prefix', () => {
        expect(getBaseName('list_policies')).toBe('list_policies');
        expect(getBaseName('some_tool')).toBe('some_tool');
      });

      test('should handle empty string', () => {
        expect(getBaseName('')).toBe('');
      });

      test('should only strip first admin_ prefix', () => {
        expect(getBaseName('admin_admin_test')).toBe('admin_test');
      });
    });

    describe('getAdminToolName', () => {
      test('should add admin_ prefix', () => {
        expect(getAdminToolName('list_policies')).toBe('admin_list_policies');
        expect(getAdminToolName('create_user')).toBe('admin_create_user');
        expect(getAdminToolName('get_analytics_summary')).toBe('admin_get_analytics_summary');
      });

      test('should add prefix even if already present', () => {
        expect(getAdminToolName('admin_list_policies')).toBe('admin_admin_list_policies');
      });

      test('should handle empty string', () => {
        expect(getAdminToolName('')).toBe('admin_');
      });
    });

    describe('getAllToolDefinitionsForAgent', () => {
      test('should return all tools with baseName', () => {
        const tools = getAllToolDefinitionsForAgent();

        expect(tools.length).toBe(ALL_TOOL_DEFINITIONS.length);

        for (const tool of tools) {
          expect(tool.baseName).toBeDefined();
          expect(tool.baseName).toBe(getBaseName(tool.name));
        }
      });
    });

    describe('getReadToolDefinitionsForAgent', () => {
      test('should return only read tools with baseName', () => {
        const tools = getReadToolDefinitionsForAgent();

        expect(tools.length).toBe(READ_TOOL_DEFINITIONS.length);

        for (const tool of tools) {
          expect(tool.baseName).toBeDefined();
          expect(tool.isWriteTool).toBe(false);
        }
      });
    });

    describe('getWriteToolDefinitionsForAgent', () => {
      test('should return only write tools with baseName', () => {
        const tools = getWriteToolDefinitionsForAgent();

        expect(tools.length).toBe(WRITE_TOOL_DEFINITIONS.length);

        for (const tool of tools) {
          expect(tool.baseName).toBeDefined();
          expect(tool.isWriteTool).toBe(true);
        }
      });
    });
  });

  describe('ToolDefinition interface', () => {
    test('should allow creating valid ToolDefinition', () => {
      const tool: ToolDefinition = {
        name: 'admin_test_tool',
        description: 'A test tool',
        inputSchema: z.object({ id: z.string() }),
        scope: 'TEST',
        isWriteTool: false,
      };

      expect(tool.name).toBe('admin_test_tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.scope).toBe('TEST');
      expect(tool.isWriteTool).toBe(false);
    });
  });
});
