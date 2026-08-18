/**
 * MCP Server Read Tools Unit Tests
 * Tests for server query tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockServerFindMany, mockServerFindFirst } = vi.hoisted(() => ({
  mockServerFindMany: vi.fn(),
  mockServerFindFirst: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    mcpServer: {
      findMany: mockServerFindMany,
      findFirst: mockServerFindFirst,
    },
  },
}));

// Import after mocking
import { executeReadTool } from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('MCP Server Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list_mcp_servers', () => {
    test('should list servers for organization', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'GitHub MCP',
          url: 'https://github.com/mcp',
          authType: 'OAUTH',
          trusted: true,
          createdAt: new Date('2024-01-10'),
        },
        {
          id: 'server-2',
          name: 'Notion MCP',
          url: 'https://api.notion.so/mcp',
          authType: 'API_KEY',
          trusted: false,
          createdAt: new Date('2024-01-05'),
        },
      ];

      mockServerFindMany.mockResolvedValueOnce(mockServers);

      const result = await executeReadTool('list_mcp_servers', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 2,
        servers: [
          {
            id: 'server-1',
            name: 'GitHub MCP',
            url: 'https://github.com/mcp',
            authType: 'OAUTH',
            trusted: true,
            createdAt: '2024-01-10T00:00:00.000Z',
          },
          {
            id: 'server-2',
            name: 'Notion MCP',
            url: 'https://api.notion.so/mcp',
            authType: 'API_KEY',
            trusted: false,
            createdAt: '2024-01-05T00:00:00.000Z',
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockServerFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_mcp_servers', {}, context);

      expect(mockServerFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should exclude deleted servers', async () => {
      mockServerFindMany.mockResolvedValueOnce([]);

      await executeReadTool('list_mcp_servers', {}, context);

      expect(mockServerFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    test('should return empty array when no servers exist', async () => {
      mockServerFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool('list_mcp_servers', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        count: 0,
        servers: [],
      });
    });
  });

  describe('get_mcp_server', () => {
    test('should get server by id', async () => {
      const mockServer = {
        id: 'server-123',
        name: 'Test Server',
        url: 'https://test.com/mcp',
        authType: 'OAUTH',
        trusted: true,
        createdAt: new Date('2024-01-10'),
      };

      mockServerFindFirst.mockResolvedValueOnce(mockServer);

      const result = await executeReadTool('get_mcp_server', { id: 'server-123' }, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'server-123',
        name: 'Test Server',
        url: 'https://test.com/mcp',
        authType: 'OAUTH',
        trusted: true,
        createdAt: '2024-01-10T00:00:00.000Z',
      });
    });

    test('should scope query to organizationId', async () => {
      mockServerFindFirst.mockResolvedValueOnce(null);

      await executeReadTool('get_mcp_server', { id: 'server-123' }, context);

      expect(mockServerFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            id: 'server-123',
          }),
        }),
      );
    });

    test('should return not found error for non-existent server', async () => {
      mockServerFindFirst.mockResolvedValueOnce(null);

      const result = await executeReadTool('get_mcp_server', { id: 'nonexistent' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('MCP server not found');
    });
  });
});
