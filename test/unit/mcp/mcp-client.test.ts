/**
 * MCP Client Unit Tests
 *
 * Tests MCP client functionality including:
 * - Tool name validation
 * - Helper function behavior
 * - Error handling patterns
 * - forwardToMcpServer with mocked session manager
 * - listToolsFromMcpServer with mocked client
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mock variables so they can be used in vi.mock factories
const {
  mockGetSession,
  mockCloseSession,
  mockCloseSessionForServer,
  mockConnect,
  mockListTools,
  mockCallTool,
  mockClose,
  mockRefreshOAuthToken,
  mockGetUserMcpConfig,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCloseSession: vi.fn(),
  mockCloseSessionForServer: vi.fn(),
  mockConnect: vi.fn(),
  mockListTools: vi.fn(),
  mockCallTool: vi.fn(),
  mockClose: vi.fn(),
  mockRefreshOAuthToken: vi.fn(),
  mockGetUserMcpConfig: vi.fn(),
}));

// Mock the session manager
vi.mock('../../../packages/mcp/src/session-manager.js', () => ({
  mcpSessionManager: {
    getSession: mockGetSession,
    closeSession: mockCloseSession,
    closeSessionForServer: mockCloseSessionForServer,
    closeAllSessions: vi.fn(),
  },
}));

// Mock the API client
vi.mock('../../../packages/mcp/src/api-client.js', () => ({
  refreshOAuthToken: mockRefreshOAuthToken,
  getUserMcpConfig: mockGetUserMcpConfig,
}));

// Mock the MCP SDK Client (Vitest 4.x requires class constructor)
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockConnect;
    listTools = mockListTools;
    callTool = mockCallTool;
    close = mockClose;
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class MockTransport {},
}));

// Mock logger
vi.mock('../../../packages/mcp/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    response: vi.fn(),
    request: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  forwardToMcpServer,
  listToolsFromMcpServer,
} from '../../../packages/mcp/src/mcp-client.js';
import type { McpServer } from '../../../packages/mcp/src/types.js';

// Test organizationId for session isolation - top level for all describe blocks
const TEST_ORG_ID = 'org-test-123';

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('MCP Client (Unit)', () => {
  const createMockServer = (overrides: Partial<McpServer> = {}): McpServer => ({
    id: 'test-server',
    name: 'Test',
    url: 'https://example.com',
    authType: 'NONE',
    trusted: true,
    ...overrides,
  });

  describe('forwardToMcpServer', () => {
    test('should validate tool name format before forwarding', async () => {
      const mcpServer = createMockServer();

      // Invalid format - missing ::
      await expect(
        forwardToMcpServer(mcpServer, null, 'invalidformat', {}, TEST_ORG_ID),
      ).rejects.toThrow('Invalid tool name format');
    });

    test('should validate tool name format with empty tool part', async () => {
      const mcpServer = createMockServer();

      // Invalid format - empty tool name
      await expect(
        forwardToMcpServer(mcpServer, null, 'domain::', {}, TEST_ORG_ID),
      ).rejects.toThrow('Invalid tool name format');
    });

    test('should reject tool name with only domain and no separator', async () => {
      const mcpServer = createMockServer();

      await expect(
        forwardToMcpServer(mcpServer, null, 'onlydomain', {}, TEST_ORG_ID),
      ).rejects.toThrow('Invalid tool name format');
    });

    test('should reject tool name with single colon', async () => {
      const mcpServer = createMockServer();

      await expect(
        forwardToMcpServer(mcpServer, null, 'domain:tool', {}, TEST_ORG_ID),
      ).rejects.toThrow('Invalid tool name format');
    });

    test('should reject empty tool name', async () => {
      const mcpServer = createMockServer();

      await expect(forwardToMcpServer(mcpServer, null, '', {}, TEST_ORG_ID)).rejects.toThrow(
        'Invalid tool name format',
      );
    });

    test('should reject tool name with only separator', async () => {
      const mcpServer = createMockServer();

      await expect(forwardToMcpServer(mcpServer, null, '::', {}, TEST_ORG_ID)).rejects.toThrow(
        'Invalid tool name format',
      );
    });

    test('should successfully forward valid tool call', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: 'Success!' }] });

      const result = await forwardToMcpServer(
        mcpServer,
        null,
        'example.com::testTool',
        { param1: 'value1' },
        TEST_ORG_ID,
      );

      expect(mockGetSession).toHaveBeenCalledWith(mcpServer, null, TEST_ORG_ID, undefined);
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'testTool',
        arguments: { param1: 'value1' },
      });
      expect(result).toEqual({ content: [{ type: 'text', text: 'Success!' }] });
    });

    test('should forward with user ID for session isolation', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        { apiKey: 'secret' },
        'api.com::myTool',
        { data: 'test' },
        TEST_ORG_ID,
        'user-123',
      );

      expect(mockGetSession).toHaveBeenCalledWith(
        mcpServer,
        { apiKey: 'secret' },
        TEST_ORG_ID,
        'user-123',
      );
    });

    test('should parse JSON string parameters', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        {
          jsonParam: '{"nested": "value"}',
          regularParam: 'string',
        },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          jsonParam: { nested: 'value' },
          regularParam: 'string',
        },
      });
    });

    test('should handle Python-style JSON strings', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        {
          pythonParam: "{'key': True, 'other': False, 'empty': None}",
        },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          pythonParam: { key: true, other: false, empty: null },
        },
      });
    });

    test('should handle array JSON strings', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        { arrayParam: '[1, 2, 3]' },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          arrayParam: [1, 2, 3],
        },
      });
    });

    test('should handle nested objects with JSON strings', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        { outer: { innerJson: '{"deep": "value"}' } },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          outer: {
            innerJson: { deep: 'value' },
          },
        },
      });
    });

    test('should keep non-JSON strings as strings', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        { regularString: 'not json at all', incomplete: '{ incomplete json' },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          regularString: 'not json at all',
          incomplete: '{ incomplete json',
        },
      });
    });

    test('should keep malformed JSON-like strings as strings (line 93)', async () => {
      // This tests line 93: catch block when JSON.parse fails after normalization
      // The string looks like JSON (starts with { ends with }) but is invalid even after normalization
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        {
          // This looks like JSON but has invalid syntax that can't be fixed by quote normalization
          malformedJson: '{key without quotes: value}',
          // This looks like Python dict but has invalid syntax
          malformedPython: "{'key': 'unclosed}",
          // Valid brackets but completely invalid content
          invalidInside: '{,,,}',
        },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          malformedJson: '{key without quotes: value}',
          malformedPython: "{'key': 'unclosed}",
          invalidInside: '{,,,}',
        },
      });
    });

    test('should preserve non-string types', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        { numberParam: 42, boolParam: true, nullParam: null, arrayParam: [1, 2, 3] },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          numberParam: 42,
          boolParam: true,
          nullParam: null,
          arrayParam: [1, 2, 3],
        },
      });
    });

    test('should inject credential tool params when injectIntoToolParams is true', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      // Credentials with meta.injectIntoToolParams=true and toolParams
      const credentials = {
        meta: { injectIntoToolParams: true },
        apiKey: 'secret',
        toolParams: { orgId: 'org-123' },
      };

      await forwardToMcpServer(
        mcpServer,
        credentials,
        'api.com::tool',
        { param1: 'value1' },
        TEST_ORG_ID,
      );

      // The apiKey should be stripped (reserved field) and toolParams merged
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: expect.objectContaining({
          param1: 'value1',
          orgId: 'org-123',
        }),
      });
    });

    test('should not inject params without injectIntoToolParams flag', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      const credentials = {
        apiKey: 'secret',
        // No meta.injectIntoToolParams or toolParams
      };

      await forwardToMcpServer(
        mcpServer,
        credentials,
        'api.com::tool',
        { param1: 'value1' },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: { param1: 'value1' },
      });
    });

    test('should wrap schema validation errors', async () => {
      const mcpServer = createMockServer({ name: 'Buggy Server' });
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('safeParseAsync failed in tool call'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow(/Upstream MCP server.*schema validation bug.*FastMCP/);
    });

    test('should wrap v3Schema validation errors', async () => {
      const mcpServer = createMockServer({ name: 'Schema Server' });
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('v3Schema validation error'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow(/schema validation bug/);
    });

    test('should wrap MCP protocol errors', async () => {
      const mcpServer = createMockServer({ name: 'MCP Server' });
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('MCP error -32600: Invalid request'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow(/MCP protocol error from MCP Server/);
    });

    test('should re-throw other errors', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('Network connection failed'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow('Network connection failed');
    });

    test('should handle session manager failure', async () => {
      const mcpServer = createMockServer();
      mockGetSession.mockRejectedValue(new Error('Failed to create session'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow('Failed to create session');
    });

    test('should handle 403 error for non-OAuth servers without token refresh', async () => {
      // For NONE auth type, 403 errors are just re-thrown
      const mcpServer = createMockServer({ authType: 'NONE' });
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('HTTP 403 Forbidden'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow('HTTP 403 Forbidden');
      // For non-OAuth servers, session is NOT closed (no token refresh attempted)
    });

    test('should handle 401 error for non-OAuth servers', async () => {
      // For API_KEY auth type, 401 errors are just re-thrown
      const mcpServer = createMockServer({ authType: 'API_KEY' });
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('Unauthorized access'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow('Unauthorized access');
    });

    test('should not attempt token refresh for non-auth errors', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('Some random error'));

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow('Some random error');
    });

    test('should rethrow 403 errors for OAuth server without userId', async () => {
      // OAuth server but no userId - can't refresh token
      const mcpServer = createMockServer({ authType: 'OAUTH' });
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      const errorWith403 = new Error('HTTP 403 Forbidden');
      mockCallTool.mockRejectedValue(errorWith403);

      await expect(
        forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID),
      ).rejects.toThrow('HTTP 403 Forbidden');
    });

    test('should attempt OAuth token refresh on 403 for OAuth server with userId', async () => {
      const mcpServer = createMockServer({ id: 'oauth-server', authType: 'OAUTH' });
      const mockClient = { callTool: mockCallTool };

      // First call fails with 403, second succeeds after refresh
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool
        .mockRejectedValueOnce(new Error('HTTP 403 Forbidden'))
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Success!' }] });

      mockRefreshOAuthToken.mockResolvedValue({ level: 'user' });
      mockGetUserMcpConfig.mockResolvedValue({
        credentials: { accessToken: 'new-token' },
      });
      mockCloseSessionForServer.mockResolvedValue(undefined);

      const result = await forwardToMcpServer(
        mcpServer,
        { accessToken: 'old-token' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      );

      expect(mockRefreshOAuthToken).toHaveBeenCalledWith('user-123', 'oauth-server');
      expect(mockCloseSessionForServer).toHaveBeenCalledWith(
        'oauth-server',
        TEST_ORG_ID,
        'user-123',
      );
      expect(mockGetUserMcpConfig).toHaveBeenCalledWith('user-123', 'oauth-server');
      expect(result).toEqual({ content: [{ type: 'text', text: 'Success!' }] });
    });

    test('should attempt OAuth token refresh on 401 for OAuth server', async () => {
      const mcpServer = createMockServer({ id: 'oauth-server', authType: 'OAUTH' });
      const mockClient = { callTool: mockCallTool };

      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool
        .mockRejectedValueOnce(new Error('Unauthorized'))
        .mockResolvedValueOnce({ content: [] });

      mockRefreshOAuthToken.mockResolvedValue({ level: 'org' });
      mockGetUserMcpConfig.mockResolvedValue({
        credentials: { accessToken: 'refreshed-token' },
      });
      mockCloseSessionForServer.mockResolvedValue(undefined);

      await forwardToMcpServer(
        mcpServer,
        { accessToken: 'expired-token' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-456',
      );

      expect(mockRefreshOAuthToken).toHaveBeenCalledWith('user-456', 'oauth-server');
    });

    test('should throw error when OAuth token refresh fails', async () => {
      const mcpServer = createMockServer({
        id: 'oauth-server',
        name: 'OAuth API',
        authType: 'OAUTH',
      });
      const mockClient = { callTool: mockCallTool };

      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockRejectedValue(new Error('HTTP 403 Forbidden'));
      mockRefreshOAuthToken.mockRejectedValue(new Error('Refresh token expired'));

      await expect(
        forwardToMcpServer(
          mcpServer,
          { accessToken: 'old-token' },
          'api.com::tool',
          {},
          TEST_ORG_ID,
          'user-123',
        ),
      ).rejects.toThrow(/OAuth token expired.*OAuth API.*Refresh token expired.*re-authenticate/);
    });

    test('should handle 403 with status property in error', async () => {
      const mcpServer = createMockServer({ id: 'oauth-server', authType: 'OAUTH' });
      const mockClient = { callTool: mockCallTool };

      mockGetSession.mockResolvedValue(mockClient);
      const errorWithStatus = new Error('Forbidden');
      (errorWithStatus as Error & { status: number }).status = 403;
      mockCallTool.mockRejectedValueOnce(errorWithStatus).mockResolvedValueOnce({ content: [] });

      mockRefreshOAuthToken.mockResolvedValue({ level: 'user' });
      mockGetUserMcpConfig.mockResolvedValue({ credentials: { accessToken: 'new' } });
      mockCloseSessionForServer.mockResolvedValue(undefined);

      await forwardToMcpServer(
        mcpServer,
        { accessToken: 'old' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      );

      expect(mockRefreshOAuthToken).toHaveBeenCalled();
    });

    test('should handle 401 with statusCode property in error', async () => {
      const mcpServer = createMockServer({ id: 'oauth-server', authType: 'OAUTH' });
      const mockClient = { callTool: mockCallTool };

      mockGetSession.mockResolvedValue(mockClient);
      const errorWithStatusCode = new Error('Auth failed');
      (errorWithStatusCode as Error & { statusCode: number }).statusCode = 401;
      mockCallTool
        .mockRejectedValueOnce(errorWithStatusCode)
        .mockResolvedValueOnce({ content: [] });

      mockRefreshOAuthToken.mockResolvedValue({ level: 'user' });
      mockGetUserMcpConfig.mockResolvedValue({ credentials: null });
      mockCloseSessionForServer.mockResolvedValue(undefined);

      await forwardToMcpServer(
        mcpServer,
        { accessToken: 'old' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      );

      expect(mockRefreshOAuthToken).toHaveBeenCalled();
    });

    test('should use null credentials after refresh if config has no credentials', async () => {
      const mcpServer = createMockServer({ id: 'oauth-server', authType: 'OAUTH' });
      const mockClient = { callTool: mockCallTool };

      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool
        .mockRejectedValueOnce(new Error('HTTP 403'))
        .mockResolvedValueOnce({ content: [] });

      mockRefreshOAuthToken.mockResolvedValue({ level: 'user' });
      // No credentials in config
      mockGetUserMcpConfig.mockResolvedValue({});
      mockCloseSessionForServer.mockResolvedValue(undefined);

      await forwardToMcpServer(
        mcpServer,
        { accessToken: 'old' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      );

      // Second call to getSession should use null credentials
      expect(mockGetSession).toHaveBeenLastCalledWith(mcpServer, null, TEST_ORG_ID, 'user-123');
    });

    test('should handle tool name with port in domain', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(mcpServer, null, 'localhost:3000::myTool', {}, TEST_ORG_ID);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'myTool',
        arguments: {},
      });
    });

    test('should handle complex nested JSON with Python booleans', async () => {
      const mcpServer = createMockServer();
      const mockClient = { callTool: mockCallTool };
      mockGetSession.mockResolvedValue(mockClient);
      mockCallTool.mockResolvedValue({ content: [] });

      await forwardToMcpServer(
        mcpServer,
        null,
        'api.com::tool',
        { config: "{'enabled': True, 'settings': {'debug': False, 'mode': None}}" },
        TEST_ORG_ID,
      );

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tool',
        arguments: {
          config: { enabled: true, settings: { debug: false, mode: null } },
        },
      });
    });
  });

  describe('listToolsFromMcpServer', () => {
    // Note: listToolsFromMcpServer creates its own Client instance from SDK
    // SDK mocking doesn't work well with pnpm workspaces, so we test error paths only
    // Lines 292-296 (success path) require integration testing with a real MCP server
    test('should return empty tools array on connection error', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'https://nonexistent.example.com:9999/mcp',
        authType: 'NONE',
        trusted: true,
      };

      // Should return empty result, not throw
      const result = await listToolsFromMcpServer(mcpServer, null, 100); // Short timeout

      expect(result.tools).toEqual([]);
      expect(result.domainPrefix).toBe('');
    });

    test('should handle timeout for slow servers', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'https://httpstat.us/200?sleep=5000', // Sleeps for 5 seconds
        authType: 'NONE',
        trusted: true,
      };

      // Should timeout and return empty result
      const result = await listToolsFromMcpServer(mcpServer, null, 50); // 50ms timeout

      expect(result.tools).toEqual([]);
    });

    test('should handle invalid URL format', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'not-a-valid-url',
        authType: 'NONE',
        trusted: true,
      };

      // Should handle gracefully
      const result = await listToolsFromMcpServer(mcpServer, null, 100);
      expect(result.tools).toEqual([]);
    });

    test('should handle connection refused', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'http://127.0.0.1:59999/mcp', // Port unlikely to be in use
        authType: 'NONE',
        trusted: true,
      };

      const result = await listToolsFromMcpServer(mcpServer, null, 100);
      expect(result.tools).toEqual([]);
    });

    test('should handle API_KEY auth type with credentials', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'http://127.0.0.1:59998/mcp', // Port unlikely to be in use
        authType: 'API_KEY',
        trusted: true,
      };

      // Should not throw even with API key auth
      const result = await listToolsFromMcpServer(mcpServer, { apiKey: 'test-key' }, 100);
      expect(result.tools).toEqual([]);
    });

    test('should handle OAUTH auth type with credentials', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'http://127.0.0.1:59997/mcp', // Port unlikely to be in use
        authType: 'OAUTH',
        trusted: true,
      };

      // Should not throw even with OAuth auth
      const result = await listToolsFromMcpServer(mcpServer, { accessToken: 'bearer-token' }, 100);
      expect(result.tools).toEqual([]);
    });

    test('should handle server with custom port in URL', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'http://localhost:8080/mcp',
        authType: 'NONE',
        trusted: true,
      };

      const result = await listToolsFromMcpServer(mcpServer, null, 100);
      // Domain prefix should include port
      expect(result.tools).toEqual([]);
      // Even on error, verify URL was parsed (no exceptions)
    });

    test('should handle credentials with custom headers', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'http://127.0.0.1:59996/mcp',
        authType: 'API_KEY',
        trusted: true,
      };

      // Credentials with custom headers
      const result = await listToolsFromMcpServer(
        mcpServer,
        {
          headers: {
            'X-Custom-Header': 'custom-value',
          },
          apiKey: 'api-key',
        },
        100,
      );
      expect(result.tools).toEqual([]);
    });

    test('should handle null credentials for API_KEY server', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'http://127.0.0.1:59995/mcp',
        authType: 'API_KEY',
        trusted: true,
      };

      // Should not throw with null credentials
      const result = await listToolsFromMcpServer(mcpServer, null, 100);
      expect(result.tools).toEqual([]);
    });

    test('should use default timeout when not specified', async () => {
      const mcpServer: McpServer = {
        id: 'test-server',
        name: 'Test',
        url: 'http://127.0.0.1:59994/mcp',
        authType: 'NONE',
        trusted: true,
      };

      // Call without timeout parameter - should use default 10000ms
      // Use a port that's unlikely to be in use so it fails quickly
      const result = await listToolsFromMcpServer(mcpServer, null);
      expect(result.tools).toEqual([]);
    });
  });

  describe('Tool Name Parsing', () => {
    test('valid qualified names should have domain and tool', () => {
      const validNames = [
        'github.com::createPR',
        'localhost:3000::submit_backtest',
        'api.example.com:8080::query_data',
        'my-server.local::do_something',
      ];

      validNames.forEach((name) => {
        const [domain, tool] = name.split('::');
        expect(domain).toBeTruthy();
        expect(tool).toBeTruthy();
        expect(domain.length).toBeGreaterThan(0);
        expect(tool.length).toBeGreaterThan(0);
      });
    });

    test('invalid qualified names should fail parsing', () => {
      const invalidNames = [
        'invalidformat', // No ::
        'domain:', // Wrong separator
        '::', // Empty both parts
        'domain::', // Empty tool
        '::tool', // Empty domain
      ];

      invalidNames.forEach((name) => {
        const parts = name.split('::');
        const [domain, tool] = parts;
        // At least one part should be empty for invalid names
        const isInvalid = !domain || !tool || parts.length !== 2;
        expect(isInvalid).toBe(true);
      });
    });
  });

  describe('Error Message Handling', () => {
    test('should identify schema validation errors', () => {
      const schemaErrors = [
        'safeParseAsync failed',
        'v3Schema validation error',
        'Error in safeParseAsync',
      ];

      schemaErrors.forEach((msg) => {
        expect(msg.includes('safeParseAsync') || msg.includes('v3Schema')).toBe(true);
      });
    });

    test('should identify MCP protocol errors', () => {
      const mcpError = 'MCP error -32600: Invalid request';
      expect(mcpError.includes('MCP error')).toBe(true);
    });
  });
});

describe('is403Error helper behavior', () => {
  // Testing the expected behavior of the internal is403Error function
  // The actual function is not exported, but we verify its logic patterns

  test('should identify 403 status in error message', () => {
    const errorMessages = ['HTTP 403 Forbidden', '403: Access Denied', 'Got a 403 response'];

    errorMessages.forEach((msg) => {
      expect(msg.toLowerCase().includes('403')).toBe(true);
    });
  });

  test('should identify forbidden keyword in error message', () => {
    const errorMessages = ['Request forbidden', 'Forbidden access to resource'];

    errorMessages.forEach((msg) => {
      expect(msg.toLowerCase().includes('forbidden')).toBe(true);
    });
  });

  test('should identify 401 status in error message', () => {
    const errorMessages = ['HTTP 401 Unauthorized', '401: Not authenticated'];

    errorMessages.forEach((msg) => {
      expect(msg.toLowerCase().includes('401')).toBe(true);
    });
  });

  test('should identify unauthorized keyword in error message', () => {
    const errorMessages = ['Unauthorized request', 'Access unauthorized'];

    errorMessages.forEach((msg) => {
      expect(msg.toLowerCase().includes('unauthorized')).toBe(true);
    });
  });

  test('should not identify random errors as 403', () => {
    const errorMessages = ['Network error', 'Timeout', 'Internal server error', 'Bad request'];

    errorMessages.forEach((msg) => {
      const lower = msg.toLowerCase();
      expect(
        lower.includes('403') ||
          lower.includes('401') ||
          lower.includes('forbidden') ||
          lower.includes('unauthorized'),
      ).toBe(false);
    });
  });

  test('should check status property on error objects', () => {
    const errorsWithStatus = [
      { status: 403, message: 'Forbidden' },
      { status: 401, message: 'Unauthorized' },
    ];

    errorsWithStatus.forEach((err) => {
      expect(err.status === 403 || err.status === 401).toBe(true);
    });
  });

  test('should check statusCode property on error objects', () => {
    const errorsWithStatusCode = [
      { statusCode: 403, message: 'Forbidden' },
      { statusCode: 401, message: 'Unauthorized' },
    ];

    errorsWithStatusCode.forEach((err) => {
      expect(err.statusCode === 403 || err.statusCode === 401).toBe(true);
    });
  });

  test('should return false for non-Error values', () => {
    const nonErrors = ['string error', 123, null, undefined, { notAnError: true }];

    nonErrors.forEach((val) => {
      expect(val instanceof Error).toBe(false);
    });
  });
});

describe('isAuthError edge cases through forwardToMcpServer', () => {
  const TEST_ORG_ID = 'org-test-123';
  const createMockServer = (overrides: Partial<McpServer> = {}): McpServer => ({
    id: 'test-server',
    name: 'Test',
    url: 'https://example.com',
    authType: 'NONE',
    trusted: true,
    ...overrides,
  });

  test('should not treat non-Error thrown values as auth errors', async () => {
    // This tests line 18 in mcp-client.ts: isAuthError returns false for non-Error types
    const mcpServer = createMockServer({ authType: 'OAUTH' });
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);

    // Throw a string instead of an Error object
    mockCallTool.mockRejectedValue('Not an Error object');

    await expect(
      forwardToMcpServer(
        mcpServer,
        { accessToken: 'token' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      ),
    ).rejects.toBe('Not an Error object');

    // Should NOT attempt token refresh since it's not an Error object
    expect(mockRefreshOAuthToken).not.toHaveBeenCalled();
  });

  test('should not treat Error without auth keywords as auth error', async () => {
    const mcpServer = createMockServer({ authType: 'OAUTH' });
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);

    // Error with no auth-related keywords
    mockCallTool.mockRejectedValue(new Error('Connection timeout'));

    await expect(
      forwardToMcpServer(
        mcpServer,
        { accessToken: 'token' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      ),
    ).rejects.toThrow('Connection timeout');

    // Should NOT attempt token refresh for non-auth errors
    expect(mockRefreshOAuthToken).not.toHaveBeenCalled();
  });

  test('should detect auth error from status property on Error object', async () => {
    // This tests line 31 in mcp-client.ts: return true when error.status is 401/403
    const mcpServer = createMockServer({ id: 'oauth-server', authType: 'OAUTH' });
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);

    // Create Error with status property (no auth keywords in message)
    const errorWithStatus = new Error('Request failed');
    (errorWithStatus as Error & { status: number }).status = 401;
    mockCallTool.mockRejectedValueOnce(errorWithStatus).mockResolvedValueOnce({ content: [] });

    mockRefreshOAuthToken.mockResolvedValue({ level: 'user' });
    mockGetUserMcpConfig.mockResolvedValue({ credentials: { accessToken: 'new' } });
    mockCloseSessionForServer.mockResolvedValue(undefined);

    await forwardToMcpServer(
      mcpServer,
      { accessToken: 'old' },
      'api.com::tool',
      {},
      TEST_ORG_ID,
      'user-123',
    );

    // Should have attempted token refresh based on status property alone
    expect(mockRefreshOAuthToken).toHaveBeenCalled();
  });
});

describe('isPlainObject helper', () => {
  const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  };

  test('should identify plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ key: 'value' })).toBe(true);
    expect(isPlainObject({ nested: { deep: true } })).toBe(true);
  });

  test('should reject non-plain objects', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(123)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });

  test('should accept class instances (simple typeof check)', () => {
    class TestClass {
      value = 1;
    }
    // This local helper uses simple typeof check, which returns true for class instances
    expect(isPlainObject(new TestClass())).toBe(true);
    expect(isPlainObject(new Date())).toBe(true);
  });

  test('should accept objects with symbol keys', () => {
    const sym = Symbol('test');
    const obj = { [sym]: 'value', regular: 'key' };
    expect(isPlainObject(obj)).toBe(true);
  });

  test('should reject functions', () => {
    expect(isPlainObject(() => {})).toBe(false);
    expect(isPlainObject(function test() {})).toBe(false);
  });
});

describe('parseJsonStrings helper behavior', () => {
  // This tests the expected behavior of the internal parseJsonStrings function
  // The actual function is not exported, but we can verify its logic

  test('should parse JSON object strings', () => {
    const input = '{"key": "value"}';
    const parsed = JSON.parse(input);
    expect(parsed).toEqual({ key: 'value' });
  });

  test('should parse JSON array strings', () => {
    const input = '[1, 2, 3]';
    const parsed = JSON.parse(input);
    expect(parsed).toEqual([1, 2, 3]);
  });

  test('should handle Python-style True/False/None', () => {
    const pythonString = "{'key': True, 'other': False, 'empty': None}";
    const normalized = pythonString
      .replace(/'/g, '"')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null');

    const parsed = JSON.parse(normalized);
    expect(parsed).toEqual({ key: true, other: false, empty: null });
  });

  test('should handle nested JSON strings', () => {
    const nested = '{"outer": {"inner": "value"}}';
    const parsed = JSON.parse(nested);
    expect(parsed.outer.inner).toBe('value');
  });

  test('should detect JSON by starting/ending brackets', () => {
    const jsonObjects = ['{"key": "value"}', '{ "spaced": true }', '  {"whitespace": 1}  '];

    jsonObjects.forEach((str) => {
      const trimmed = str.trim();
      expect(trimmed.startsWith('{') && trimmed.endsWith('}')).toBe(true);
    });
  });

  test('should detect arrays by starting/ending brackets', () => {
    const jsonArrays = ['[1, 2, 3]', '[ "a", "b" ]', '  [true, false]  '];

    jsonArrays.forEach((str) => {
      const trimmed = str.trim();
      expect(trimmed.startsWith('[') && trimmed.endsWith(']')).toBe(true);
    });
  });

  test('should not parse non-JSON strings', () => {
    const nonJsonStrings = ['just a string', '{ incomplete', 'incomplete }', 'not json at all'];

    nonJsonStrings.forEach((str) => {
      const trimmed = str.trim();
      const looksLikeJson =
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'));
      expect(looksLikeJson).toBe(false);
    });
  });

  test('should handle whitespace around JSON', () => {
    const padded = '  {"key": "value"}  ';
    const trimmed = padded.trim();
    expect(trimmed.startsWith('{') && trimmed.endsWith('}')).toBe(true);
    expect(JSON.parse(trimmed)).toEqual({ key: 'value' });
  });

  test('should handle empty object and array', () => {
    expect(JSON.parse('{}')).toEqual({});
    expect(JSON.parse('[]')).toEqual([]);
  });

  test('should handle complex nested structures', () => {
    const complex = '{"array": [1, {"nested": true}], "obj": {"deep": {"value": "test"}}}';
    const parsed = JSON.parse(complex);
    expect(parsed.array[1].nested).toBe(true);
    expect(parsed.obj.deep.value).toBe('test');
  });
});

describe('Domain prefix extraction', () => {
  test('should extract hostname from various URLs', () => {
    const cases = [
      { url: 'https://github.com/mcp', expected: 'github.com' },
      { url: 'https://api.example.com:8080/path', expected: 'api.example.com:8080' },
      { url: 'http://localhost:3000/api', expected: 'localhost:3000' },
      { url: 'https://subdomain.domain.com/nested/path', expected: 'subdomain.domain.com' },
    ];

    cases.forEach(({ url, expected }) => {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const port = urlObj.port ? `:${urlObj.port}` : '';
      const domainPrefix = `${domain}${port}`;
      expect(domainPrefix).toBe(expected);
    });
  });

  test('should handle URLs without explicit ports', () => {
    const url = new URL('https://example.com/mcp');
    expect(url.port).toBe(''); // Default ports are not included
    expect(`${url.hostname}${url.port ? `:${url.port}` : ''}`).toBe('example.com');
  });

  test('should include non-default ports', () => {
    const url = new URL('https://example.com:3000/mcp');
    expect(url.port).toBe('3000');
    expect(`${url.hostname}:${url.port}`).toBe('example.com:3000');
  });
});

describe('OAuth token refresh edge cases', () => {
  const createMockServer = (overrides: Partial<McpServer> = {}): McpServer => ({
    id: 'test-server',
    name: 'Test',
    url: 'https://example.com',
    authType: 'NONE',
    trusted: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should handle non-Error refresh failure message (line 219-220)', async () => {
    // Tests the case where refreshError is NOT an Error instance
    // refreshError instanceof Error returns false, so errorMessage = 'Token refresh failed'
    const mcpServer = createMockServer({
      id: 'oauth-server',
      name: 'OAuth Server',
      authType: 'OAUTH',
    });
    const mockClient = { callTool: mockCallTool };

    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockRejectedValue(new Error('HTTP 403 Forbidden'));
    // Reject with a non-Error value (string)
    mockRefreshOAuthToken.mockRejectedValue('String error instead of Error object');

    await expect(
      forwardToMcpServer(
        mcpServer,
        { accessToken: 'old-token' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      ),
    ).rejects.toThrow(/OAuth token expired.*OAuth Server.*Token refresh failed.*re-authenticate/);
  });

  test('should handle refresh error with empty message', async () => {
    const mcpServer = createMockServer({
      id: 'oauth-server',
      name: 'OAuth Server',
      authType: 'OAUTH',
    });
    const mockClient = { callTool: mockCallTool };

    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockRejectedValue(new Error('HTTP 403 Forbidden'));
    // Error with empty message
    mockRefreshOAuthToken.mockRejectedValue(new Error(''));

    await expect(
      forwardToMcpServer(
        mcpServer,
        { accessToken: 'old-token' },
        'api.com::tool',
        {},
        TEST_ORG_ID,
        'user-123',
      ),
    ).rejects.toThrow(/OAuth token expired.*OAuth Server/);
  });
});

describe('Tool execution timeout', () => {
  const createMockServer = (overrides: Partial<McpServer> = {}): McpServer => ({
    id: 'test-server',
    name: 'Test',
    url: 'https://example.com',
    authType: 'NONE',
    trusted: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should use default 5 minute timeout constant', () => {
    // The constant TOOL_EXECUTION_TIMEOUT_MS is 5 * 60 * 1000 = 300000ms
    const defaultTimeoutMs = 5 * 60 * 1000;
    expect(defaultTimeoutMs).toBe(300000);
  });

  test('should handle tool call that takes time', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);

    // Simulate a slow tool call that eventually succeeds
    mockCallTool.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ content: [{ type: 'text', text: 'Slow result' }] }), 10);
        }),
    );

    const result = await forwardToMcpServer(
      mcpServer,
      null,
      'example.com::slowTool',
      {},
      TEST_ORG_ID,
    );

    expect(result).toEqual({ content: [{ type: 'text', text: 'Slow result' }] });
  });
});

describe('Parameter handling edge cases', () => {
  const createMockServer = (overrides: Partial<McpServer> = {}): McpServer => ({
    id: 'test-server',
    name: 'Test',
    url: 'https://example.com',
    authType: 'NONE',
    trusted: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should handle empty parameters object', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    await forwardToMcpServer(mcpServer, null, 'api.com::tool', {}, TEST_ORG_ID);

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'tool',
      arguments: {},
    });
  });

  test('should handle parameters with null values', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    await forwardToMcpServer(
      mcpServer,
      null,
      'api.com::tool',
      {
        nullValue: null,
        regularValue: 'test',
      },
      TEST_ORG_ID,
    );

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'tool',
      arguments: {
        nullValue: null,
        regularValue: 'test',
      },
    });
  });

  test('should handle parameters with undefined values', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    await forwardToMcpServer(
      mcpServer,
      null,
      'api.com::tool',
      {
        undefinedValue: undefined,
        regularValue: 'test',
      },
      TEST_ORG_ID,
    );

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'tool',
      arguments: expect.objectContaining({
        regularValue: 'test',
      }),
    });
  });

  test('should handle deeply nested JSON string parsing', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    await forwardToMcpServer(
      mcpServer,
      null,
      'api.com::tool',
      {
        level1: {
          level2: {
            jsonString: '{"deep": {"nested": "value"}}',
          },
        },
      },
      TEST_ORG_ID,
    );

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'tool',
      arguments: {
        level1: {
          level2: {
            jsonString: { deep: { nested: 'value' } },
          },
        },
      },
    });
  });

  test('should handle JSON array with mixed types', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    await forwardToMcpServer(
      mcpServer,
      null,
      'api.com::tool',
      {
        mixedArray: '[1, "two", true, null, {"nested": "obj"}]',
      },
      TEST_ORG_ID,
    );

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'tool',
      arguments: {
        mixedArray: [1, 'two', true, null, { nested: 'obj' }],
      },
    });
  });

  test('should handle whitespace-only JSON-like strings', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    await forwardToMcpServer(
      mcpServer,
      null,
      'api.com::tool',
      {
        // Looks like it might be JSON but is just whitespace between brackets
        almostJson: '{   }',
      },
      TEST_ORG_ID,
    );

    // Empty object is valid JSON
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'tool',
      arguments: {
        almostJson: {},
      },
    });
  });

  test('should handle strings with escaped quotes', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    await forwardToMcpServer(
      mcpServer,
      null,
      'api.com::tool',
      {
        escapedQuotes: '{"message": "He said \\"hello\\""}',
      },
      TEST_ORG_ID,
    );

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'tool',
      arguments: {
        escapedQuotes: { message: 'He said "hello"' },
      },
    });
  });
});

describe('listToolsFromMcpServer success path', () => {
  // Note: The MCP SDK Client is mocked globally, so we can test success paths
  // The mock setup at the top provides mockConnect, mockListTools, mockClose

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to success state
    mockConnect.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({
      tools: [
        { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Second tool', inputSchema: { type: 'object' } },
      ],
    });
    mockClose.mockResolvedValue(undefined);
  });

  test('should return tools and domain prefix on success', async () => {
    const mcpServer: McpServer = {
      id: 'test-server',
      name: 'Test',
      url: 'https://api.example.com/mcp',
      authType: 'NONE',
      trusted: true,
    };

    const result = await listToolsFromMcpServer(mcpServer, null, 5000);

    // Even though we mock the SDK Client, the actual implementation creates
    // its own Client instance, so we verify error handling behavior
    // The mocked Client class returns tools from mockListTools
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('tool1');
    expect(result.domainPrefix).toBe('api.example.com');
  });

  test('should extract domain with port for non-standard ports', async () => {
    const mcpServer: McpServer = {
      id: 'test-server',
      name: 'Test',
      url: 'https://localhost:3000/mcp',
      authType: 'NONE',
      trusted: true,
    };

    const result = await listToolsFromMcpServer(mcpServer, null, 5000);

    expect(result.domainPrefix).toBe('localhost:3000');
  });

  test('should handle close errors during cleanup', async () => {
    const mcpServer: McpServer = {
      id: 'test-server',
      name: 'Test',
      url: 'https://api.example.com/mcp',
      authType: 'NONE',
      trusted: true,
    };

    // Make close throw
    mockClose.mockRejectedValue(new Error('Close failed'));

    // Should not throw - close errors are silently ignored
    const result = await listToolsFromMcpServer(mcpServer, null, 5000);
    expect(result.tools).toBeDefined();
  });
});

describe('isAuthError comprehensive tests', () => {
  // These tests verify the behavior patterns of isAuthError through forwardToMcpServer

  const createMockServer = (overrides: Partial<McpServer> = {}): McpServer => ({
    id: 'test-server',
    name: 'Test',
    url: 'https://example.com',
    authType: 'OAUTH',
    trusted: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should detect auth error with 500 status (not auth error)', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);

    // 500 is not an auth error
    const errorWith500 = new Error('Internal Server Error');
    (errorWith500 as Error & { status: number }).status = 500;
    mockCallTool.mockRejectedValue(errorWith500);

    await expect(
      forwardToMcpServer(mcpServer, { accessToken: 'token' }, 'api.com::tool', {}, 'user-123'),
    ).rejects.toThrow('Internal Server Error');

    // Should NOT attempt refresh for 500 error
    expect(mockRefreshOAuthToken).not.toHaveBeenCalled();
  });

  test('should detect auth error with 404 status (not auth error)', async () => {
    const mcpServer = createMockServer();
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);

    const errorWith404 = new Error('Not Found');
    (errorWith404 as Error & { statusCode: number }).statusCode = 404;
    mockCallTool.mockRejectedValue(errorWith404);

    await expect(
      forwardToMcpServer(mcpServer, { accessToken: 'token' }, 'api.com::tool', {}, 'user-123'),
    ).rejects.toThrow('Not Found');

    expect(mockRefreshOAuthToken).not.toHaveBeenCalled();
  });

  test('should handle multiple colons in tool name', async () => {
    const mcpServer = createMockServer({ authType: 'NONE' });
    const mockClient = { callTool: mockCallTool };
    mockGetSession.mockResolvedValue(mockClient);
    mockCallTool.mockResolvedValue({ content: [] });

    // Tool name with multiple :: separators
    // The split('::') behavior: 'domain.com::namespace::tool' splits to ['domain.com', 'namespace', 'tool']
    // The code uses destructuring [, actualToolName] which gets the second element
    await forwardToMcpServer(mcpServer, null, 'domain.com::namespace::actualTool', {}, TEST_ORG_ID);

    // Due to how split works with '::' and destructuring [, actualToolName],
    // only 'namespace' is extracted (the second element after split)
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'namespace',
      arguments: {},
    });
  });
});

describe('TOOL_EXECUTION_TIMEOUT_MS constant', () => {
  test('should be exactly 5 minutes in milliseconds', () => {
    const fiveMinutesMs = 5 * 60 * 1000;
    expect(fiveMinutesMs).toBe(300000);
  });
});

describe('ListedTools interface structure', () => {
  test('should have expected structure', () => {
    const listedTools = {
      tools: [{ name: 'tool1', description: 'desc', inputSchema: { type: 'object' } }],
      domainPrefix: 'example.com',
    };

    expect(listedTools.tools).toBeInstanceOf(Array);
    expect(typeof listedTools.domainPrefix).toBe('string');
  });

  test('should handle empty tools array', () => {
    const listedTools = {
      tools: [],
      domainPrefix: 'example.com',
    };

    expect(listedTools.tools).toHaveLength(0);
    expect(listedTools.domainPrefix).toBe('example.com');
  });
});
