/**
 * Read Tool Executors Unit Tests
 * Tests for read tool executors that handle read-only tool operations
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    policy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    mcpServer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    mcpTool: {
      findFirst: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    sensitiveToolFlag: {
      findMany: vi.fn(),
    },
    webhookEndpoint: {
      findMany: vi.fn(),
    },
    permissionRequest: {
      findMany: vi.fn(),
    },
    auditLogEntry: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    adminActionLog: {
      findMany: vi.fn(),
    },
    toolParamValue: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
}));

// Import after mocking
import {
  executeReadTool,
  hasReadExecutor,
} from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Read Tool Executors', () => {
  const mockContext: ToolContext = {
    organizationId: 'org-123',
    userId: 'user-456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeReadTool', () => {
    test('should return error for unknown tool', async () => {
      const result = await executeReadTool('unknown_tool', {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown read tool: unknown_tool');
    });

    test('should handle executor throwing an Error', async () => {
      // Make list_policies throw an error
      mockPrisma.policy.findMany.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await executeReadTool('list_policies', {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    test('should handle executor throwing a non-Error value', async () => {
      // Make list_policies throw a non-Error value
      mockPrisma.policy.findMany.mockRejectedValueOnce('string error');

      const result = await executeReadTool('list_policies', {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error executing read tool');
    });

    test('should handle executor throwing null', async () => {
      mockPrisma.policy.findMany.mockRejectedValueOnce(null);

      const result = await executeReadTool('list_policies', {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error executing read tool');
    });
  });

  describe('hasReadExecutor', () => {
    test('should return true for existing read tools', () => {
      expect(hasReadExecutor('list_policies')).toBe(true);
      expect(hasReadExecutor('get_policy')).toBe(true);
      expect(hasReadExecutor('list_users')).toBe(true);
      expect(hasReadExecutor('list_webhooks')).toBe(true);
    });

    test('should return false for non-existent tools', () => {
      expect(hasReadExecutor('unknown_tool')).toBe(false);
      expect(hasReadExecutor('create_policy')).toBe(false);
    });
  });

  describe('list_webhooks', () => {
    test('should list webhooks for organization', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          name: 'Security Alerts',
          type: 'HTTP',
          url: 'https://example.com/webhook',
          events: ['TOOL_INVOCATION_DENIED'],
          enabled: true,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 'webhook-2',
          name: 'Audit Log',
          type: 'HTTP',
          url: 'https://example.com/audit',
          events: ['POLICY_CREATED', 'POLICY_UPDATED'],
          enabled: false,
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];

      mockPrisma.webhookEndpoint.findMany.mockResolvedValueOnce(mockWebhooks);

      const result = await executeReadTool('list_webhooks', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        webhooks: [
          {
            id: 'webhook-1',
            name: 'Security Alerts',
            type: 'HTTP',
            url: 'https://example.com/webhook',
            events: ['TOOL_INVOCATION_DENIED'],
            enabled: true,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'webhook-2',
            name: 'Audit Log',
            type: 'HTTP',
            url: 'https://example.com/audit',
            events: ['POLICY_CREATED', 'POLICY_UPDATED'],
            enabled: false,
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      });

      expect(mockPrisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
        },
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
          events: true,
          enabled: true,
          createdAt: true,
        },
      });
    });

    test('should return empty list when no webhooks exist', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_webhooks', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        webhooks: [],
      });
    });

    test('should handle database error', async () => {
      mockPrisma.webhookEndpoint.findMany.mockRejectedValueOnce(new Error('Database query failed'));

      const result = await executeReadTool('list_webhooks', {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database query failed');
    });
  });

  describe('list_policies', () => {
    test('should list policies with default limit and offset', async () => {
      const mockPolicies = [
        {
          id: 'policy-1',
          slug: 'admin-access',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          toolPatterns: ['*::*'],
          description: 'Allow admin',
          enabled: true,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];

      mockPrisma.policy.findMany.mockResolvedValueOnce(mockPolicies);

      const result = await executeReadTool('list_policies', {}, mockContext);

      expect(result.success).toBe(true);
      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        }),
      );
    });

    test('should use custom limit and offset', async () => {
      mockPrisma.policy.findMany.mockResolvedValueOnce([]);

      await executeReadTool('list_policies', { limit: 10, offset: 20 }, mockContext);

      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe('get_policy', () => {
    test('should return policy not found error', async () => {
      mockPrisma.policy.findFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_policy', { id: 'nonexistent' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Policy not found');
    });
  });

  describe('list_users', () => {
    test('should use default limit', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      await executeReadTool('list_users', {}, mockContext);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    test('should use custom limit', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      await executeReadTool('list_users', { limit: 25 }, mockContext);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });
  });

  describe('get_user', () => {
    test('should return user not found error', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_user', { id: 'nonexistent' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('get_role', () => {
    test('should return role not found error', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_role', { id: 'nonexistent' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Role not found');
    });
  });

  describe('get_mcp_server', () => {
    test('should return MCP server not found error', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_mcp_server', { id: 'nonexistent' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('MCP server not found');
    });
  });

  describe('get_agent', () => {
    test('should return agent not found error', async () => {
      mockPrisma.agent.findFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_agent', { id: 'nonexistent' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent not found');
    });
  });

  describe('list_permission_requests', () => {
    test('should filter by status when provided', async () => {
      mockPrisma.permissionRequest.findMany.mockResolvedValueOnce([]);

      await executeReadTool('list_permission_requests', { status: 'PENDING' }, mockContext);

      expect(mockPrisma.permissionRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
    });

    test('should not filter by status when not provided', async () => {
      mockPrisma.permissionRequest.findMany.mockResolvedValueOnce([]);

      await executeReadTool('list_permission_requests', {}, mockContext);

      expect(mockPrisma.permissionRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user: { organizationId: 'org-123' },
          },
        }),
      );
    });

    test('should handle null user in request', async () => {
      const mockRequests = [
        {
          id: 'request-1',
          status: 'PENDING',
          type: 'TOOL_ACCESS',
          toolNames: ['tool1'],
          reason: 'Need access',
          user: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          reviewedAt: null,
        },
      ];

      mockPrisma.permissionRequest.findMany.mockResolvedValueOnce(mockRequests);

      const result = await executeReadTool('list_permission_requests', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as { requests: Array<{ user: unknown }> };
      expect(data.requests[0].user).toBeNull();
    });

    test('should format reviewedAt when present', async () => {
      const mockRequests = [
        {
          id: 'request-1',
          status: 'APPROVED',
          type: 'TOOL_ACCESS',
          toolNames: ['tool1'],
          reason: 'Need access',
          user: { id: 'user-1', email: 'user@test.com' },
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          reviewedAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];

      mockPrisma.permissionRequest.findMany.mockResolvedValueOnce(mockRequests);

      const result = await executeReadTool('list_permission_requests', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as { requests: Array<{ reviewedAt: string | null }> };
      expect(data.requests[0].reviewedAt).toBe('2024-01-02T00:00:00.000Z');
    });
  });

  describe('get_analytics_summary', () => {
    test('should use default 7 days when not specified', async () => {
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([]);
      mockPrisma.user.count.mockResolvedValueOnce(0);
      mockPrisma.policy.count.mockResolvedValueOnce(0);

      const result = await executeReadTool('get_analytics_summary', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as { period: { days: number } };
      expect(data.period.days).toBe(7);
    });

    test('should calculate denial rate correctly', async () => {
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([
        { decision: 'ALLOWED', _count: { id: 80 } },
        { decision: 'DENIED', _count: { id: 20 } },
      ]);
      mockPrisma.user.count.mockResolvedValueOnce(5);
      mockPrisma.policy.count.mockResolvedValueOnce(3);

      const result = await executeReadTool('get_analytics_summary', { days: 30 }, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as {
        toolCalls: { total: number; denied: number; denialRate: string };
      };
      expect(data.toolCalls.total).toBe(100);
      expect(data.toolCalls.denied).toBe(20);
      expect(data.toolCalls.denialRate).toBe('20.0%');
    });

    test('should handle zero total calls', async () => {
      mockPrisma.auditLogEntry.groupBy.mockResolvedValueOnce([]);
      mockPrisma.user.count.mockResolvedValueOnce(0);
      mockPrisma.policy.count.mockResolvedValueOnce(0);

      const result = await executeReadTool('get_analytics_summary', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as { toolCalls: { denialRate: string } };
      expect(data.toolCalls.denialRate).toBe('0%');
    });
  });

  describe('query_audit_log', () => {
    test('should use default limit', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValueOnce([]);

      await executeReadTool('query_audit_log', {}, mockContext);

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    test('should handle null user and agent', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          toolName: 'test_tool',
          decision: 'ALLOWED',
          matchedPolicyIds: [],
          user: null,
          agent: null,
          timestamp: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValueOnce(mockEntries);

      const result = await executeReadTool('query_audit_log', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as { entries: Array<{ user: unknown; agent: unknown }> };
      expect(data.entries[0].user).toBeNull();
      expect(data.entries[0].agent).toBeNull();
    });
  });

  describe('query_admin_actions', () => {
    test('should use default limit', async () => {
      mockPrisma.adminActionLog.findMany.mockResolvedValueOnce([]);

      await executeReadTool('query_admin_actions', {}, mockContext);

      expect(mockPrisma.adminActionLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    test('should handle null adminUser', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          actionType: 'CREATE',
          resourceType: 'POLICY',
          resourceId: 'policy-1',
          resourceName: 'Test Policy',
          adminUser: null,
          timestamp: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];

      mockPrisma.adminActionLog.findMany.mockResolvedValueOnce(mockLogs);

      const result = await executeReadTool('query_admin_actions', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as { entries: Array<{ admin: unknown }> };
      expect(data.entries[0].admin).toBeNull();
    });
  });

  describe('search_param_values_by_label', () => {
    test('should search with label query', async () => {
      const mockParamValues = [
        {
          parameterValue: 'value1',
          displayLabel: 'Test Label',
          parameterKey: 'key1',
          mcpServer: { id: 'server-1', name: 'Test Server' },
          occurrenceCount: 5,
        },
      ];

      mockPrisma.toolParamValue.findMany.mockResolvedValueOnce(mockParamValues);

      const result = await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'Test' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as { results: Array<{ value: string; displayLabel: string }> };
      expect(data.results[0].value).toBe('value1');
      expect(data.results[0].displayLabel).toBe('Test Label');
    });

    test('should filter by serverId when provided', async () => {
      mockPrisma.toolParamValue.findMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'Test', serverId: 'server-123' },
        mockContext,
      );

      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serverId: 'server-123',
          }),
        }),
      );
    });

    test('should filter by serverDomain when provided', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-123' });
      mockPrisma.toolParamValue.findMany.mockResolvedValue([]);

      await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'Test', serverDomain: 'notion' },
        mockContext,
      );

      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            displayLabel: {
              contains: 'Test',
              mode: 'insensitive',
            },
            serverId: 'server-123',
          }),
        }),
      );
    });
  });

  describe('get_param_suggestions', () => {
    test('should get suggestions for tool parameter', async () => {
      const mockParamValues = [
        {
          parameterValue: 'suggestion1',
          displayLabel: 'Suggestion 1',
          occurrenceCount: 10,
        },
      ];

      mockPrisma.toolParamValue.findMany.mockResolvedValueOnce(mockParamValues);

      const result = await executeReadTool(
        'get_param_suggestions',
        { toolName: 'notion.com::createPage', parameterKey: 'pageId' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as { suggestions: Array<{ value: string }> };
      expect(data.suggestions[0].value).toBe('suggestion1');
    });

    test('should filter by prefix when provided', async () => {
      mockPrisma.toolParamValue.findMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'notion.com::createPage', parameterKey: 'pageId', prefix: 'abc' },
        mockContext,
      );

      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parameterValue: { startsWith: 'abc' },
          }),
        }),
      );
    });
  });

  describe('list_roles', () => {
    test('should list roles for organization', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'Admin',
          description: 'Administrator role',
          isAdmin: true,
          _count: { userRoles: 5 },
        },
        {
          id: 'role-2',
          name: 'Viewer',
          description: 'View-only role',
          isAdmin: false,
          _count: { userRoles: 10 },
        },
      ];

      mockPrisma.role.findMany.mockResolvedValueOnce(mockRoles);

      const result = await executeReadTool('list_roles', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        roles: [
          {
            id: 'role-1',
            name: 'Admin',
            description: 'Administrator role',
            isAdmin: true,
            userCount: 5,
          },
          {
            id: 'role-2',
            name: 'Viewer',
            description: 'View-only role',
            isAdmin: false,
            userCount: 10,
          },
        ],
      });

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          description: true,
          isAdmin: true,
          _count: {
            select: { userRoles: true },
          },
        },
      });
    });

    test('should return empty list when no roles exist', async () => {
      mockPrisma.role.findMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_roles', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        roles: [],
      });
    });
  });

  describe('get_role', () => {
    test('should get role with users', async () => {
      const mockRole = {
        id: 'role-1',
        name: 'Admin',
        description: 'Administrator role',
        isAdmin: true,
        userRoles: [
          { user: { id: 'user-1', email: 'admin@example.com' } },
          { user: { id: 'user-2', email: 'admin2@example.com' } },
        ],
      };

      mockPrisma.role.findFirst.mockResolvedValueOnce(mockRole);

      const result = await executeReadTool('get_role', { id: 'role-1' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'role-1',
        name: 'Admin',
        description: 'Administrator role',
        isAdmin: true,
        users: [
          { id: 'user-1', email: 'admin@example.com' },
          { id: 'user-2', email: 'admin2@example.com' },
        ],
      });
    });
  });

  describe('list_mcp_servers', () => {
    test('should list MCP servers for organization', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Notion Server',
          url: 'https://api.notion.so/mcp',
          authType: 'OAUTH',
          trusted: true,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 'server-2',
          name: 'GitHub Server',
          url: 'https://api.github.com/mcp',
          authType: 'API_KEY',
          trusted: false,
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];

      mockPrisma.mcpServer.findMany.mockResolvedValueOnce(mockServers);

      const result = await executeReadTool('list_mcp_servers', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        servers: [
          {
            id: 'server-1',
            name: 'Notion Server',
            url: 'https://api.notion.so/mcp',
            authType: 'OAUTH',
            trusted: true,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'server-2',
            name: 'GitHub Server',
            url: 'https://api.github.com/mcp',
            authType: 'API_KEY',
            trusted: false,
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      });

      expect(mockPrisma.mcpServer.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          url: true,
          authType: true,
          trusted: true,
          createdAt: true,
        },
      });
    });

    test('should return empty list when no servers exist', async () => {
      mockPrisma.mcpServer.findMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_mcp_servers', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        servers: [],
      });
    });
  });

  describe('get_mcp_server', () => {
    test('should get MCP server details', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Notion Server',
        url: 'https://api.notion.so/mcp',
        authType: 'OAUTH',
        trusted: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce(mockServer);

      const result = await executeReadTool('get_mcp_server', { id: 'server-1' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'server-1',
        name: 'Notion Server',
        url: 'https://api.notion.so/mcp',
        authType: 'OAUTH',
        trusted: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('list_agents', () => {
    test('should list agents for organization', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Claude Assistant',
          protocolType: 'A2A',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 'agent-2',
          name: 'Helper Bot',
          protocolType: 'MCP',
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];

      mockPrisma.agent.findMany.mockResolvedValueOnce(mockAgents);

      const result = await executeReadTool('list_agents', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        agents: [
          {
            id: 'agent-1',
            name: 'Claude Assistant',
            protocolType: 'A2A',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'agent-2',
            name: 'Helper Bot',
            protocolType: 'MCP',
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      });

      expect(mockPrisma.agent.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          protocolType: true,
          createdAt: true,
        },
      });
    });

    test('should return empty list when no agents exist', async () => {
      mockPrisma.agent.findMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_agents', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        agents: [],
      });
    });
  });

  describe('get_agent', () => {
    test('should get agent details', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Claude Assistant',
        protocolType: 'A2A',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      mockPrisma.agent.findFirst.mockResolvedValueOnce(mockAgent);

      const result = await executeReadTool('get_agent', { id: 'agent-1' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'agent-1',
        name: 'Claude Assistant',
        protocolType: 'A2A',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('list_sensitive_flags', () => {
    test('should list sensitive flags for organization', async () => {
      const mockFlags = [
        {
          id: 'flag-1',
          toolPattern: 'github::deleteRepo',
          behaviors: ['REQUIRE_CONFIRMATION'],
          description: 'Destructive GitHub operation',
          enabled: true,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 'flag-2',
          toolPattern: '*::delete*',
          behaviors: ['AUDIT_LOG', 'NOTIFY_ADMIN'],
          description: 'All delete operations',
          enabled: false,
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];

      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValueOnce(mockFlags);

      const result = await executeReadTool('list_sensitive_flags', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        flags: [
          {
            id: 'flag-1',
            toolPattern: 'github::deleteRepo',
            behaviors: ['REQUIRE_CONFIRMATION'],
            description: 'Destructive GitHub operation',
            enabled: true,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'flag-2',
            toolPattern: '*::delete*',
            behaviors: ['AUDIT_LOG', 'NOTIFY_ADMIN'],
            description: 'All delete operations',
            enabled: false,
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      });

      expect(mockPrisma.sensitiveToolFlag.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
        },
        select: {
          id: true,
          toolPattern: true,
          behaviors: true,
          description: true,
          enabled: true,
          createdAt: true,
        },
      });
    });

    test('should return empty list when no sensitive flags exist', async () => {
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_sensitive_flags', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        flags: [],
      });
    });
  });

  describe('get_policy', () => {
    test('should get policy details', async () => {
      const mockPolicy = {
        id: 'policy-1',
        slug: 'admin-access',
        effect: 'ALLOW',
        matchers: ['role:Admin'],
        toolPatterns: ['*::*'],
        description: 'Allow all for admin',
        enabled: true,
        conditions: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      };

      mockPrisma.policy.findFirst.mockResolvedValueOnce(mockPolicy);

      const result = await executeReadTool('get_policy', { id: 'policy-1' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'policy-1',
        slug: 'admin-access',
        effect: 'ALLOW',
        matchers: ['role:Admin'],
        toolPatterns: ['*::*'],
        description: 'Allow all for admin',
        enabled: true,
        conditions: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });

      expect(mockPrisma.policy.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'policy-1',
          organizationId: 'org-123',
        },
      });
    });
  });

  describe('list_users', () => {
    test('should list users with roles', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'admin@example.com',
          userRoles: [{ role: { id: 'role-1', name: 'Admin', isAdmin: true } }],
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 'user-2',
          email: 'viewer@example.com',
          userRoles: [{ role: { id: 'role-2', name: 'Viewer', isAdmin: false } }],
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];

      mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);

      const result = await executeReadTool('list_users', {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        users: [
          {
            id: 'user-1',
            email: 'admin@example.com',
            roles: [{ id: 'role-1', name: 'Admin', isAdmin: true }],
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'user-2',
            email: 'viewer@example.com',
            roles: [{ id: 'role-2', name: 'Viewer', isAdmin: false }],
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      });
    });
  });

  describe('get_user', () => {
    test('should get user with roles', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'admin@example.com',
        userRoles: [{ role: { id: 'role-1', name: 'Admin', isAdmin: true } }],
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUser);

      const result = await executeReadTool('get_user', { id: 'user-1' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'user-1',
        email: 'admin@example.com',
        roles: [{ id: 'role-1', name: 'Admin', isAdmin: true }],
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('query_audit_log', () => {
    test('should query audit log with custom limit', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValueOnce([]);

      await executeReadTool('query_audit_log', { limit: 25 }, mockContext);

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    test('should handle user and agent data', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          toolName: 'test_tool',
          decision: 'ALLOWED',
          matchedPolicyIds: ['policy-1'],
          user: { id: 'user-1', email: 'user@test.com' },
          agent: { id: 'agent-1', name: 'Claude' },
          timestamp: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValueOnce(mockEntries);

      const result = await executeReadTool('query_audit_log', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as {
        entries: Array<{
          user: { id: string; email: string };
          agent: { id: string; name: string };
        }>;
      };
      expect(data.entries[0].user).toEqual({ id: 'user-1', email: 'user@test.com' });
      expect(data.entries[0].agent).toEqual({ id: 'agent-1', name: 'Claude' });
    });
  });

  describe('query_admin_actions', () => {
    test('should query admin actions with custom limit', async () => {
      mockPrisma.adminActionLog.findMany.mockResolvedValueOnce([]);

      await executeReadTool('query_admin_actions', { limit: 25 }, mockContext);

      expect(mockPrisma.adminActionLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    test('should handle adminUser data', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          actionType: 'CREATE',
          resourceType: 'POLICY',
          resourceId: 'policy-1',
          resourceName: 'Test Policy',
          adminUser: { id: 'user-1', email: 'admin@test.com' },
          timestamp: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];

      mockPrisma.adminActionLog.findMany.mockResolvedValueOnce(mockLogs);

      const result = await executeReadTool('query_admin_actions', {}, mockContext);

      expect(result.success).toBe(true);
      const data = result.data as {
        entries: Array<{ admin: { id: string; email: string } }>;
      };
      expect(data.entries[0].admin).toEqual({ id: 'user-1', email: 'admin@test.com' });
    });
  });

  describe('get_tool_param_fields', () => {
    test('should return error for invalid tool name format - no separator', async () => {
      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'invalidToolName' },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Invalid tool name format. Use "serverKey::toolName" (e.g., "api.notion.so::createPage")',
      );
    });

    test('should return error for invalid tool name format - too many separators', async () => {
      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'server::tool::extra' },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Invalid tool name format. Use "serverKey::toolName" (e.g., "api.notion.so::createPage")',
      );
    });

    test('should return error when server key is empty', async () => {
      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: '::toolName' },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Both server key and tool name are required');
    });

    test('should return error when tool name is empty', async () => {
      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'serverKey::' },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Both server key and tool name are required');
    });

    test('should return error when MCP server not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'api.notion.so::createPage' },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('MCP server with key "api.notion.so" not found');

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          url: { contains: 'api.notion.so' },
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
    });

    test('should return error when tool not found on server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Notion Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'api.notion.so::createPage' },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool "createPage" not found on server "Notion Server"');

      expect(mockPrisma.mcpTool.findFirst).toHaveBeenCalledWith({
        where: {
          mcpServerId: 'server-1',
          name: 'createPage',
        },
        select: { inputSchema: true, name: true, description: true },
      });
    });

    test('should return empty fields when tool has no input schema', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Notion Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'simpleTool',
        description: 'A simple tool with no parameters',
        inputSchema: null,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'api.notion.so::simpleTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        tool: 'simpleTool',
        description: 'A simple tool with no parameters',
        fields: [],
        note: 'No input schema available for this tool',
      });
    });

    test('should extract fields from simple schema with basic types', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name' },
          count: { type: 'integer', description: 'The count' },
          enabled: { type: 'boolean' },
          score: { type: 'number' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'testTool',
        description: 'A test tool',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::testTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        tool: string;
        description: string;
        fields: Array<{ path: string; type: string; description?: string }>;
        usage: string;
      };
      expect(data.tool).toBe('testTool');
      expect(data.description).toBe('A test tool');
      expect(data.fields).toEqual([
        { path: 'params.name', type: 'string', description: 'The name' },
        { path: 'params.count', type: 'number', description: 'The count' },
        { path: 'params.enabled', type: 'boolean' },
        { path: 'params.score', type: 'number' },
      ]);
      expect(data.usage).toContain('params.name');
    });

    test('should extract fields from schema with nested objects', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            description: 'User details',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', description: 'User email' },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'userTool',
        description: 'User management tool',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::userTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string; description?: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.user',
        type: 'object',
        description: 'User details',
      });
      expect(data.fields).toContainEqual({ path: 'params.user.name', type: 'string' });
      expect(data.fields).toContainEqual({
        path: 'params.user.email',
        type: 'string',
        description: 'User email',
      });
    });

    test('should extract fields from schema with arrays', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            description: 'List of tags',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                color: { type: 'string' },
              },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'tagTool',
        description: 'Tag management tool',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::tagTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string; description?: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.tags',
        type: 'array',
        description: 'List of tags',
      });
      expect(data.fields).toContainEqual({ path: 'params.tags[*].name', type: 'string' });
      expect(data.fields).toContainEqual({ path: 'params.tags[*].color', type: 'string' });
    });

    test('should handle anyOf type inference with string', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          value: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Optional string value',
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'anyOfTool',
        description: 'Tool with anyOf types',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::anyOfTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string; description?: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.value',
        type: 'string',
        description: 'Optional string value',
      });
    });

    test('should handle anyOf type inference with number', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          amount: {
            anyOf: [{ type: 'number' }, { type: 'integer' }],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'numberTool',
        description: 'Tool with number anyOf',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::numberTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.amount',
        type: 'number',
      });
    });

    test('should return unknown type for unrecognized type', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          mystery: {
            description: 'Mystery field with no type',
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'mysteryTool',
        description: 'Tool with unknown types',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::mysteryTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string; description?: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.mystery',
        type: 'unknown',
        description: 'Mystery field with no type',
      });
    });

    test('should respect max depth for nested structures', async () => {
      // Create a deeply nested schema (more than 5 levels)
      const inputSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      level4: {
                        type: 'object',
                        properties: {
                          level5: {
                            type: 'object',
                            properties: {
                              level6: {
                                type: 'object',
                                properties: {
                                  deepValue: { type: 'string' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'deepTool',
        description: 'Tool with deep nesting',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::deepTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string }>;
      };
      // Should have fields up to level 5 (max depth = 5, starting at depth 0)
      expect(data.fields.some((f) => f.path === 'params.level1')).toBe(true);
      expect(data.fields.some((f) => f.path === 'params.level1.level2')).toBe(true);
      expect(data.fields.some((f) => f.path === 'params.level1.level2.level3')).toBe(true);
      expect(data.fields.some((f) => f.path === 'params.level1.level2.level3.level4')).toBe(true);
      expect(data.fields.some((f) => f.path === 'params.level1.level2.level3.level4.level5')).toBe(
        true,
      );
      // Level 6 should NOT be present due to max depth
      expect(
        data.fields.some((f) => f.path === 'params.level1.level2.level3.level4.level5.level6'),
      ).toBe(true);
      // But level 6's children should not be present
      expect(
        data.fields.some(
          (f) => f.path === 'params.level1.level2.level3.level4.level5.level6.deepValue',
        ),
      ).toBe(false);
    });

    test('should handle schema with no properties', async () => {
      const inputSchema = {
        type: 'object',
        // No properties defined
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'emptyTool',
        description: 'Tool with empty schema',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::emptyTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string }>;
        usage: string;
      };
      expect(data.fields).toEqual([]);
      // Usage should have a default example when no fields exist
      expect(data.usage).toContain('params.fieldName');
    });

    test('should handle array with non-object items', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            description: 'List of IDs',
            items: {
              type: 'string',
              // No properties - primitive array items
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'idTool',
        description: 'Tool with string array',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::idTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string; description?: string }>;
      };
      // Should have the array field but no nested fields for primitive items
      expect(data.fields).toContainEqual({
        path: 'params.ids',
        type: 'array',
        description: 'List of IDs',
      });
      // Should NOT have params.ids[*] fields since items are primitives (no properties)
      expect(data.fields.filter((f) => f.path.includes('[*]'))).toHaveLength(0);
    });

    test('should handle array without items definition', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            description: 'Generic array',
            // No items defined
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'genericArrayTool',
        description: 'Tool with generic array',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::genericArrayTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string; description?: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.data',
        type: 'array',
        description: 'Generic array',
      });
      // No nested fields since no items definition
      expect(data.fields.filter((f) => f.path.includes('[*]'))).toHaveLength(0);
    });

    test('should use first field path in usage example', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          firstField: { type: 'string' },
          secondField: { type: 'number' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'multiFieldTool',
        description: 'Tool with multiple fields',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::multiFieldTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        usage: string;
      };
      expect(data.usage).toContain('params.firstField');
    });

    test('should handle anyOf with integer type', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          quantity: {
            anyOf: [{ type: 'integer' }],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'integerTool',
        description: 'Tool with integer anyOf',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::integerTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.quantity',
        type: 'number',
      });
    });

    test('should handle anyOf with no matching types', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          weird: {
            anyOf: [{ type: 'null' }, {}],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValueOnce({
        id: 'server-1',
        name: 'Test Server',
      });
      mockPrisma.mcpTool.findFirst.mockResolvedValueOnce({
        name: 'weirdTool',
        description: 'Tool with weird anyOf',
        inputSchema,
      });

      const result = await executeReadTool(
        'get_tool_param_fields',
        { toolName: 'test.server::weirdTool' },
        mockContext,
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        fields: Array<{ path: string; type: string }>;
      };
      expect(data.fields).toContainEqual({
        path: 'params.weird',
        type: 'unknown',
      });
    });
  });
});
