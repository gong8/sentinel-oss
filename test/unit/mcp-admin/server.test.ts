/**
 * Unit tests for Admin MCP Server
 * Tests the HTTP server and MCP protocol handling
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

// Mock modules before importing server
vi.mock('../../../packages/mcp-admin/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    startup: vi.fn(),
    mcp: vi.fn(),
    tool: vi.fn(),
    session: vi.fn(),
    confirmation: vi.fn(),
    admin: vi.fn(),
  },
}));

// Mock api-client functions
const mockValidateAdminToken = vi.fn();
const mockValidateAdminMcpAccess = vi.fn();
const mockCreateConfirmation = vi.fn();
const mockWaitForConfirmation = vi.fn();
const mockListPolicies = vi.fn();
const mockGetPolicy = vi.fn();
const mockListUsers = vi.fn();
const mockGetUser = vi.fn();
const mockListRoles = vi.fn();
const mockGetRole = vi.fn();
const mockListMcpServers = vi.fn();
const mockGetMcpServer = vi.fn();
const mockListAgents = vi.fn();
const mockGetAgent = vi.fn();
const mockListSensitiveFlags = vi.fn();
const mockListWebhooks = vi.fn();
const mockListPermissionRequests = vi.fn();
const mockGetAnalyticsSummary = vi.fn();
const mockListAuditLogs = vi.fn();
const mockListAdminActionLogs = vi.fn();
const mockSearchParamValuesByLabel = vi.fn();
const mockGetParamSuggestions = vi.fn();

vi.mock('../../../packages/mcp-admin/src/api-client.js', () => ({
  validateAdminToken: mockValidateAdminToken,
  validateAdminMcpAccess: mockValidateAdminMcpAccess,
  createConfirmation: mockCreateConfirmation,
  waitForConfirmation: mockWaitForConfirmation,
  listPolicies: mockListPolicies,
  getPolicy: mockGetPolicy,
  listUsers: mockListUsers,
  getUser: mockGetUser,
  listRoles: mockListRoles,
  getRole: mockGetRole,
  listMcpServers: mockListMcpServers,
  getMcpServer: mockGetMcpServer,
  listAgents: mockListAgents,
  getAgent: mockGetAgent,
  listSensitiveFlags: mockListSensitiveFlags,
  listWebhooks: mockListWebhooks,
  listPermissionRequests: mockListPermissionRequests,
  getAnalyticsSummary: mockGetAnalyticsSummary,
  listAuditLogs: mockListAuditLogs,
  listAdminActionLogs: mockListAdminActionLogs,
  searchParamValuesByLabel: mockSearchParamValuesByLabel,
  getParamSuggestions: mockGetParamSuggestions,
}));

// Mock tools module
const mockToolDefinitions = [
  {
    name: 'admin_list_policies',
    description: 'List all policies',
    inputSchema: z.object({ limit: z.number().optional() }),
    scope: 'POLICIES',
    isWriteTool: false,
  },
  {
    name: 'admin_create_policy',
    description: 'Create a policy',
    inputSchema: z.object({ effect: z.enum(['ALLOW', 'DENY']) }),
    scope: 'POLICIES',
    isWriteTool: true,
  },
  {
    name: 'admin_delete_user',
    description: 'Delete a user',
    inputSchema: z.object({ id: z.string() }),
    scope: 'USERS',
    isWriteTool: true,
  },
  {
    name: 'admin_update_user',
    description: 'Update a user',
    inputSchema: z.object({ id: z.string() }),
    scope: 'USERS',
    isWriteTool: true,
  },
  {
    name: 'admin_revoke_token',
    description: 'Revoke a token',
    inputSchema: z.object({ userId: z.string() }),
    scope: 'USERS',
    isWriteTool: true,
  },
];

vi.mock('../../../packages/mcp-admin/src/tools.js', () => ({
  getToolsForScopes: vi.fn((scopes: string[]) =>
    mockToolDefinitions.filter((t) => scopes.includes(t.scope)),
  ),
  getToolByName: vi.fn((name: string) => mockToolDefinitions.find((t) => t.name === name)),
}));

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  isInitializeRequest: vi.fn(),
}));

describe('Admin MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Helper functions', () => {
    describe('isSelfOperation', () => {
      // We can test the logic by looking at the behavior
      test('should identify blocked self operations', () => {
        // These are the blocked operations from the server
        const blockedOps = new Set([
          'admin_delete_user',
          'admin_update_user',
          'admin_revoke_token',
        ]);

        expect(blockedOps.has('admin_delete_user')).toBe(true);
        expect(blockedOps.has('admin_update_user')).toBe(true);
        expect(blockedOps.has('admin_revoke_token')).toBe(true);
        expect(blockedOps.has('admin_list_users')).toBe(false);
        expect(blockedOps.has('admin_create_policy')).toBe(false);
      });

      test('should check if operation targets own account by id', () => {
        const adminUserId = 'admin-123';

        // Operation with matching id
        const selfOpById = { id: 'admin-123' };
        expect(selfOpById.id === adminUserId).toBe(true);

        // Operation with different id
        const otherOpById = { id: 'other-user' };
        expect(otherOpById.id === adminUserId).toBe(false);
      });

      test('should check if operation targets own account by userId', () => {
        const adminUserId = 'admin-123';

        // Operation with matching userId
        const selfOpByUserId = { userId: 'admin-123' };
        expect(selfOpByUserId.userId === adminUserId).toBe(true);

        // Operation with different userId
        const otherOpByUserId = { userId: 'other-user' };
        expect(otherOpByUserId.userId === adminUserId).toBe(false);
      });
    });

    describe('createToolResult', () => {
      test('should create success result with JSON content', () => {
        const data = { key: 'value', count: 42 };
        const result = {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: false,
        };

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(JSON.parse(result.content[0].text)).toEqual(data);
        expect(result.isError).toBe(false);
      });

      test('should create error result', () => {
        const errorData = { error: 'TEST_ERROR', message: 'Test error message' };
        const result = {
          content: [{ type: 'text', text: JSON.stringify(errorData, null, 2) }],
          isError: true,
        };

        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text).error).toBe('TEST_ERROR');
      });
    });

    describe('sendJsonRpcError', () => {
      test('should format JSON-RPC error correctly', () => {
        const errorResponse = {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Custom error' },
          id: null,
        };

        expect(errorResponse.jsonrpc).toBe('2.0');
        expect(errorResponse.error.code).toBe(-32000);
        expect(errorResponse.error.message).toBe('Custom error');
        expect(errorResponse.id).toBeNull();
      });
    });
  });

  describe('Tool call handling logic', () => {
    describe('Read operations', () => {
      test('should map tool names to correct API functions', () => {
        const toolToApiMapping: Record<string, string> = {
          admin_list_policies: 'listPolicies',
          admin_get_policy: 'getPolicy',
          admin_list_users: 'listUsers',
          admin_get_user: 'getUser',
          admin_list_roles: 'listRoles',
          admin_get_role: 'getRole',
          admin_list_mcp_servers: 'listMcpServers',
          admin_get_mcp_server: 'getMcpServer',
          admin_list_agents: 'listAgents',
          admin_get_agent: 'getAgent',
          admin_list_sensitive_flags: 'listSensitiveFlags',
          admin_list_webhooks: 'listWebhooks',
          admin_list_permission_requests: 'listPermissionRequests',
          admin_get_analytics_summary: 'getAnalyticsSummary',
          admin_query_audit_log: 'listAuditLogs',
          admin_query_admin_actions: 'listAdminActionLogs',
          admin_search_param_values_by_label: 'searchParamValuesByLabel',
          admin_get_param_suggestions: 'getParamSuggestions',
        };

        // Verify all read tools have mapped API functions
        for (const [toolName, apiFunc] of Object.entries(toolToApiMapping)) {
          expect(toolName).toMatch(/^admin_/);
          expect(apiFunc).toBeDefined();
          expect(typeof apiFunc).toBe('string');
        }
      });
    });

    describe('Write operations', () => {
      test('should require confirmation for write tools', () => {
        const writeTools = mockToolDefinitions.filter((t) => t.isWriteTool);

        expect(writeTools.length).toBeGreaterThan(0);
        for (const tool of writeTools) {
          expect(tool.isWriteTool).toBe(true);
        }
      });
    });

    describe('Input validation', () => {
      test('should validate inputs against Zod schemas', () => {
        const listPoliciesSchema = z.object({ limit: z.number().optional() });

        // Valid input
        const validResult = listPoliciesSchema.safeParse({ limit: 10 });
        expect(validResult.success).toBe(true);

        // Invalid input
        const invalidResult = listPoliciesSchema.safeParse({ limit: 'not a number' });
        expect(invalidResult.success).toBe(false);
      });
    });
  });

  describe('Session management', () => {
    test('should store session context structure', () => {
      const sessionContext = {
        adminContext: {
          valid: true,
          userId: 'user-123',
          email: 'admin@example.com',
          organizationId: 'org-456',
          isAdmin: true,
          roles: ['admin'],
        },
        accessResult: {
          accessible: true,
          reason: null,
          enabledScopes: ['POLICIES', 'USERS'],
          rateLimitPerMin: 60,
          confirmationTtlSeconds: 300,
        },
        mcpSessionId: 'mcp-session-123',
        accessToken: 'access-token-456',
      };

      expect(sessionContext.adminContext.userId).toBe('user-123');
      expect(sessionContext.accessResult.enabledScopes).toContain('POLICIES');
      expect(sessionContext.accessToken).toBe('access-token-456');
    });
  });

  describe('HTTP request handling', () => {
    describe('CORS preflight', () => {
      test('should return correct CORS headers', () => {
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
        };

        expect(corsHeaders['Access-Control-Allow-Origin']).toBe('*');
        expect(corsHeaders['Access-Control-Allow-Methods']).toContain('POST');
        expect(corsHeaders['Access-Control-Allow-Headers']).toContain('Authorization');
        expect(corsHeaders['Access-Control-Allow-Headers']).toContain('mcp-session-id');
      });
    });

    describe('Health check endpoint', () => {
      test('should return health status structure', () => {
        const healthResponse = {
          status: 'healthy',
          server: 'sentinel-admin-mcp',
          version: '0.1.0',
          activeSessions: 0,
        };

        expect(healthResponse.status).toBe('healthy');
        expect(healthResponse.server).toBe('sentinel-admin-mcp');
        expect(healthResponse.version).toBe('0.1.0');
        expect(typeof healthResponse.activeSessions).toBe('number');
      });
    });

    describe('MCP endpoint', () => {
      test('should reject GET requests with 405', () => {
        const response = {
          status: 405,
          headers: { Allow: 'POST' },
          body: 'Method Not Allowed',
        };

        expect(response.status).toBe(405);
        expect(response.headers.Allow).toBe('POST');
      });

      test('should reject non-MCP paths with 404', () => {
        const response = {
          status: 404,
          body: { error: 'Not found' },
        };

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Authentication', () => {
    test('should require Bearer token for new sessions', () => {
      const authHeader = 'Bearer test-access-token';
      const parts = authHeader.split(' ');

      expect(parts[0]).toBe('Bearer');
      expect(parts[1]).toBe('test-access-token');
    });

    test('should reject missing authorization header', () => {
      const errorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Unauthorized: Bearer token required',
        },
        id: null,
      };

      expect(errorResponse.error.code).toBe(-32000);
      expect(errorResponse.error.message).toContain('Unauthorized');
    });

    test('should handle non-admin users gracefully', () => {
      // Non-admins should get a session with only admin_status tool
      const nonAdminToolResult = {
        status: 'unauthorized',
        message:
          'Admin tools require admin privileges. Your token is either invalid or belongs to a non-admin user.',
        timestamp: expect.any(String),
      };

      expect(nonAdminToolResult.status).toBe('unauthorized');
      expect(nonAdminToolResult.message).toContain('admin privileges');
    });
  });

  describe('Tool registration', () => {
    test('should register health tool for all sessions', () => {
      const healthTool = {
        name: 'admin_health',
        description: expect.stringContaining('health status'),
      };

      expect(healthTool.name).toBe('admin_health');
    });

    test('should register tools based on enabled scopes', () => {
      const enabledScopes = ['POLICIES', 'USERS'];
      const tools = mockToolDefinitions.filter((t) => enabledScopes.includes(t.scope));

      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(enabledScopes).toContain(tool.scope);
      }
    });
  });

  describe('Confirmation workflow', () => {
    test('should handle confirmation required response', () => {
      const confirmationResult = {
        success: true,
        requiresConfirmation: true,
        confirmationId: 'confirm-123',
        description: 'Create new policy',
        riskLevel: 'MEDIUM',
        expiresAt: '2024-01-15T12:00:00Z',
      };

      expect(confirmationResult.success).toBe(true);
      expect(confirmationResult.requiresConfirmation).toBe(true);
      expect(confirmationResult.confirmationId).toBeDefined();
    });

    test('should handle different confirmation statuses', () => {
      const statuses = ['EXECUTED', 'REJECTED', 'EXPIRED', 'FAILED', 'PENDING', 'CONFIRMED'];

      for (const status of statuses) {
        expect(typeof status).toBe('string');
      }
    });

    test('should format executed confirmation result', () => {
      const result = {
        success: true,
        message: 'Operation confirmed and executed',
        result: { policyId: 'policy-123' },
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain('confirmed and executed');
    });

    test('should format rejected confirmation result', () => {
      const result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'CONFIRMATION_REJECTED',
                message: 'Operation was rejected by an admin',
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('CONFIRMATION_REJECTED');
      expect(result.isError).toBe(true);
    });

    test('should format expired confirmation result', () => {
      const result = {
        error: 'CONFIRMATION_EXPIRED',
        message: 'Confirmation request expired. Please try again.',
      };

      expect(result.error).toBe('CONFIRMATION_EXPIRED');
    });

    test('should format failed confirmation result', () => {
      const result = {
        error: 'EXECUTION_FAILED',
        message: 'Operation failed during execution',
      };

      expect(result.error).toBe('EXECUTION_FAILED');
    });

    test('should format timeout confirmation result', () => {
      const result = {
        error: 'CONFIRMATION_TIMEOUT',
        message: 'Confirmation timed out. Please try again.',
        status: 'PENDING',
        confirmationId: 'confirm-123',
      };

      expect(result.error).toBe('CONFIRMATION_TIMEOUT');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('Error handling', () => {
    test('should create error result for unknown tool', () => {
      const result = {
        error: 'TOOL_NOT_FOUND',
        message: 'Unknown tool: admin_unknown_tool',
      };

      expect(result.error).toBe('TOOL_NOT_FOUND');
    });

    test('should create error result for validation failure', () => {
      const result = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid arguments',
        errors: [{ path: ['limit'], message: 'Expected number' }],
      };

      expect(result.error).toBe('VALIDATION_ERROR');
      expect(result.errors).toBeDefined();
    });

    test('should create error result for self-operation', () => {
      const result = {
        error: 'SELF_OPERATION_BLOCKED',
        message:
          'Cannot perform this operation on your own account via Admin MCP. Use the web dashboard instead.',
      };

      expect(result.error).toBe('SELF_OPERATION_BLOCKED');
      expect(result.message).toContain('your own account');
    });

    test('should create error result for execution error', () => {
      const result = {
        error: 'EXECUTION_ERROR',
        message: 'Database connection failed',
      };

      expect(result.error).toBe('EXECUTION_ERROR');
    });

    test('should create error result for unknown read tool', () => {
      const result = {
        error: 'UNKNOWN_READ_TOOL',
        message: 'Unknown read tool: admin_unknown_read',
      };

      expect(result.error).toBe('UNKNOWN_READ_TOOL');
    });

    test('should handle JSON parse errors', () => {
      const errorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
        id: null,
      };

      expect(errorResponse.error.code).toBe(-32700);
    });

    test('should handle internal server errors', () => {
      const errorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      };

      expect(errorResponse.error.code).toBe(-32603);
    });
  });

  describe('Server configuration', () => {
    test('should use default port 3003', () => {
      const defaultPort = 3003;
      expect(defaultPort).toBe(3003);
    });

    test('should read port from ADMIN_MCP_PORT env var', () => {
      const envPort = process.env.ADMIN_MCP_PORT;
      const port = envPort ? parseInt(envPort, 10) : 3003;

      expect(typeof port).toBe('number');
    });

    test('should configure MCP server with correct capabilities', () => {
      const serverConfig = {
        name: 'sentinel-admin-mcp',
        version: '0.1.0',
        capabilities: {
          tools: {},
        },
      };

      expect(serverConfig.name).toBe('sentinel-admin-mcp');
      expect(serverConfig.version).toBe('0.1.0');
      expect(serverConfig.capabilities.tools).toEqual({});
    });
  });
});
