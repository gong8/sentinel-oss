/**
 * Parameter Suggestions Read Tool Unit Tests
 * Tests for parameter suggestion tools via executeReadTool (fully mocked, no database calls)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Use vi.hoisted() to define mocks that will be available during vi.mock() hoisting
const { mockToolParamValueFindMany, mockMcpServerFindFirst } = vi.hoisted(() => ({
  mockToolParamValueFindMany: vi.fn(),
  mockMcpServerFindFirst: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    toolParamValue: {
      findMany: mockToolParamValueFindMany,
    },
    mcpServer: {
      findFirst: mockMcpServerFindFirst,
    },
  },
}));

// Import after mocking
import { executeReadTool } from '../../../../../../packages/api/src/agent/tools/executors/read.js';
import type { ToolContext } from '../../../../../../packages/api/src/agent/tools/types.js';

describe('Parameter Suggestions Read Tools', () => {
  const context: ToolContext = { organizationId: 'org-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search_param_values_by_label', () => {
    test('should search for parameter values by label', async () => {
      const mockParamValues = [
        {
          parameterValue: 'page_abc123',
          displayLabel: 'Q1 Planning',
          parameterKey: 'page_id',
          mcpServer: { id: 'server-1', name: 'api.notion.so' },
          occurrenceCount: 15,
        },
        {
          parameterValue: 'page_def456',
          displayLabel: 'Q2 Planning',
          parameterKey: 'page_id',
          mcpServer: { id: 'server-1', name: 'api.notion.so' },
          occurrenceCount: 8,
        },
      ];

      mockToolParamValueFindMany.mockResolvedValueOnce(mockParamValues);

      const result = await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'Planning' },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        results: [
          {
            value: 'page_abc123',
            displayLabel: 'Q1 Planning',
            parameterKey: 'page_id',
            server: { id: 'server-1', name: 'api.notion.so' },
            useCount: 15,
          },
          {
            value: 'page_def456',
            displayLabel: 'Q2 Planning',
            parameterKey: 'page_id',
            server: { id: 'server-1', name: 'api.notion.so' },
            useCount: 8,
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool('search_param_values_by_label', { labelQuery: 'test' }, context);

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should search with case insensitive label match', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool('search_param_values_by_label', { labelQuery: 'Budget' }, context);

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            displayLabel: { contains: 'Budget', mode: 'insensitive' },
          }),
        }),
      );
    });

    test('should filter by serverId when provided', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'test', serverId: 'server-123' },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serverId: 'server-123',
          }),
        }),
      );
    });

    test('should filter by serverDomain when provided', async () => {
      mockMcpServerFindFirst.mockResolvedValue({ id: 'server-1' });
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'test', serverDomain: 'notion' },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            displayLabel: {
              contains: 'test',
              mode: 'insensitive',
            },
            serverId: 'server-1',
          }),
        }),
      );
    });

    test('should respect limit parameter', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'test', limit: 25 },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    test('should use default limit of 10', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool('search_param_values_by_label', { labelQuery: 'test' }, context);

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    test('should order by occurrence count descending', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool('search_param_values_by_label', { labelQuery: 'test' }, context);

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { occurrenceCount: 'desc' },
        }),
      );
    });

    test('should include mcpServer relation', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool('search_param_values_by_label', { labelQuery: 'test' }, context);

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            mcpServer: { select: { id: true, name: true } },
          },
        }),
      );
    });

    test('should return empty results when no matches', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool(
        'search_param_values_by_label',
        { labelQuery: 'nonexistent' },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ results: [] });
    });
  });

  describe('get_param_suggestions', () => {
    beforeEach(() => {
      // Default: server lookup returns a server
      mockMcpServerFindFirst.mockResolvedValue({ id: 'server-1' });
    });

    test('should get parameter suggestions by key', async () => {
      const mockParamValues = [
        {
          parameterValue: 'page_abc123',
          displayLabel: 'Q1 Planning',
          occurrenceCount: 15,
        },
        {
          parameterValue: 'page_def456',
          displayLabel: 'Budget 2024',
          occurrenceCount: 8,
        },
        {
          parameterValue: 'page_ghi789',
          displayLabel: null,
          occurrenceCount: 3,
        },
      ];

      mockToolParamValueFindMany.mockResolvedValueOnce(mockParamValues);

      const result = await executeReadTool(
        'get_param_suggestions',
        { toolName: 'api.notion.so::getPage', parameterKey: 'page_id' },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        suggestions: [
          {
            value: 'page_abc123',
            displayLabel: 'Q1 Planning',
            useCount: 15,
          },
          {
            value: 'page_def456',
            displayLabel: 'Budget 2024',
            useCount: 8,
          },
          {
            value: 'page_ghi789',
            displayLabel: null,
            useCount: 3,
          },
        ],
      });
    });

    test('should scope query to organizationId', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'github::createPR', parameterKey: 'repository' },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });

    test('should filter by parameterKey', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'github::createPR', parameterKey: 'repository' },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parameterKey: 'repository',
          }),
        }),
      );
    });

    test('should filter by prefix when provided', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'github::createPR', parameterKey: 'repository', prefix: 'sentinel' },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parameterValue: { startsWith: 'sentinel' },
          }),
        }),
      );
    });

    test('should filter by server domain from toolName', async () => {
      mockMcpServerFindFirst.mockResolvedValueOnce({ id: 'notion-server-1' });
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'api.notion.so::getPage', parameterKey: 'page_id' },
        context,
      );

      // First, it looks up the server by URL
      expect(mockMcpServerFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            deletedAt: null,
            url: { contains: 'api.notion.so', mode: 'insensitive' },
          }),
        }),
      );

      // Then it uses serverId in the param value query
      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serverId: 'notion-server-1',
          }),
        }),
      );
    });

    test('should respect limit parameter', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'test::tool', parameterKey: 'param', limit: 25 },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    test('should use default limit of 10', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'test::tool', parameterKey: 'param' },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    test('should order by occurrence count descending', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      await executeReadTool(
        'get_param_suggestions',
        { toolName: 'test::tool', parameterKey: 'param' },
        context,
      );

      expect(mockToolParamValueFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { occurrenceCount: 'desc' },
        }),
      );
    });

    test('should return empty suggestions when no matches', async () => {
      mockToolParamValueFindMany.mockResolvedValueOnce([]);

      const result = await executeReadTool(
        'get_param_suggestions',
        { toolName: 'test::tool', parameterKey: 'nonexistent' },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ suggestions: [] });
    });

    test('should handle suggestions without display labels', async () => {
      const mockParamValues = [
        {
          parameterValue: 'uuid-123-456',
          displayLabel: null,
          occurrenceCount: 5,
        },
      ];

      mockToolParamValueFindMany.mockResolvedValueOnce(mockParamValues);

      const result = await executeReadTool(
        'get_param_suggestions',
        { toolName: 'test::tool', parameterKey: 'record_id' },
        context,
      );

      expect(result.success).toBe(true);

      const data = result.data as { suggestions: { displayLabel: null }[] };
      expect(data.suggestions[0].displayLabel).toBeNull();
    });
  });
});
