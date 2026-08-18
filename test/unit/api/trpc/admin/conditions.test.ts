/**
 * Tests for Admin Conditions Router
 * Tests condition builder-related API endpoints for policy condition management
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';
import { createAdminContext } from '../../../../helpers/unit-test-mocks.js';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockValidateConditions,
  mockGetAvailableContextFields,
  mockGetParamHistory,
  mockGetParamKeys,
  mockSearchParamValues,
  mockCheckToolPattern,
  mockIsIdParameter,
  mockDbNull,
} = vi.hoisted(() => ({
  mockPrisma: {
    mcpServer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    mcpTool: {
      findFirst: vi.fn(),
    },
    policy: {
      findMany: vi.fn(),
    },
    toolParamValue: {
      findMany: vi.fn(),
    },
  },
  mockValidateConditions: vi.fn(),
  mockGetAvailableContextFields: vi.fn(),
  mockGetParamHistory: vi.fn(),
  mockGetParamKeys: vi.fn(),
  mockSearchParamValues: vi.fn(),
  mockCheckToolPattern: vi.fn(),
  mockIsIdParameter: vi.fn(),
  mockDbNull: Symbol('DbNull'),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: {
    DbNull: mockDbNull,
    QueryMode: { insensitive: 'insensitive' },
  },
}));

vi.mock('../../../../../packages/api/src/services/policyCondition.js', () => ({
  validateConditions: mockValidateConditions,
}));

vi.mock('../../../../../packages/api/src/services/toolContext.js', () => ({
  getAvailableContextFields: mockGetAvailableContextFields,
}));

vi.mock('../../../../../packages/api/src/services/toolParamHistory.js', () => ({
  getParamHistory: mockGetParamHistory,
  getParamKeys: mockGetParamKeys,
  searchParamValues: mockSearchParamValues,
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  checkToolPattern: mockCheckToolPattern,
}));

vi.mock('../../../../../packages/api/src/services/labelExtraction.js', () => ({
  isIdParameter: mockIsIdParameter,
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => {
  const createChain = () => ({
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    output: vi.fn(() => createChain()),
    input: vi.fn(() => createChain()),
  });
  return {
    router: vi.fn((routes) => routes),
    adminProcedure: createChain(),
  };
});

import { adminConditionsRouter as _adminConditionsRouter } from '../../../../../packages/api/src/trpc/admin/conditions.js';

// Nested field schema type for getNestedCategories
interface NestedFieldSchema {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';
  description?: string;
  enum?: string[];
  children?: NestedFieldSchema[];
  items?: NestedFieldSchema;
}

// Re-type the router to use our test-friendly handler type
const adminConditionsRouter = _adminConditionsRouter as unknown as {
  getToolParamSchema: TestableHandler<{ inputSchema: unknown }>;
  getParamSuggestions: TestableHandler<{
    suggestions: Array<{
      value: string;
      label: string | null;
      count: number;
      sourceKey?: string;
    }>;
  }>;
  searchByLabel: TestableHandler<{
    results: Array<{
      value: string;
      label: string | null;
      parameterKey: string;
      serverId: string;
      toolName: string | null;
      count: number;
    }>;
  }>;
  getParamKeys: TestableHandler<{ keys: string[] }>;
  getContextFieldsForTools: TestableHandler<{
    fields: Array<{ category: string; fields: string[] }>;
  }>;
  validateConditions: TestableHandler<{
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
  }>;
  getOperators: TestableHandler<{
    operators: {
      comparison: Array<{ name: string; label: string; types: string[] }>;
      string: Array<{ name: string; label: string; types: string[] }>;
      collection: Array<{ name: string; label: string; types: string[] }>;
      existence: Array<{ name: string; label: string; types: string[] }>;
      network: Array<{ name: string; label: string; types: string[] }>;
    };
  }>;
  getDynamicCategories: TestableHandler<{
    categories: Array<{
      name: string;
      label: string;
      fields: Array<{
        name: string;
        label: string;
        type: string;
        description?: string;
        enum?: string[];
      }>;
    }>;
  }>;
  getNestedCategories: TestableHandler<{
    categories: Array<{
      name: string;
      label: string;
      fields: NestedFieldSchema[];
    }>;
  }>;
  getCategories: TestableHandler<{
    categories: Array<{
      name: string;
      label: string;
      fields: Array<{ name: string; label: string; type: string }>;
    }>;
  }>;
  getConditionFieldsForTool: TestableHandler<{ fields: string[] }>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock for isIdParameter - returns false unless specified
  mockIsIdParameter.mockReturnValue(false);
});

describe('adminConditionsRouter', () => {
  describe('getToolParamSchema', () => {
    test('should return input schema for valid tool', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SQL query' },
          limit: { type: 'number' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({ inputSchema: mockInputSchema });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: 'mcp.example.com::executeQuery' },
      });

      expect(result.inputSchema).toEqual(mockInputSchema);
      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
          url: { contains: 'mcp.example.com' },
        },
        select: { id: true },
      });
      expect(mockPrisma.mcpTool.findFirst).toHaveBeenCalledWith({
        where: {
          mcpServerId: 'server-1',
          name: 'executeQuery',
        },
        select: { inputSchema: true },
      });
    });

    test('should return null for invalid tool name format (no ::)', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: 'invalidToolName' },
      });

      expect(result.inputSchema).toBeNull();
      expect(mockPrisma.mcpServer.findFirst).not.toHaveBeenCalled();
    });

    test('should return null when MCP server not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: 'unknown.server::tool' },
      });

      expect(result.inputSchema).toBeNull();
    });

    test('should return null when tool not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: 'mcp.example.com::unknownTool' },
      });

      expect(result.inputSchema).toBeNull();
    });

    test('should return null when tool has no input schema', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({ inputSchema: null });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: 'mcp.example.com::toolWithoutSchema' },
      });

      expect(result.inputSchema).toBeNull();
    });

    test('should handle empty server key in tool name', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: '::tool' },
      });

      expect(result.inputSchema).toBeNull();
    });

    test('should handle empty tool name part', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: 'server::' },
      });

      expect(result.inputSchema).toBeNull();
    });
  });

  describe('getParamSuggestions', () => {
    const TEST_SERVER_ID = 'server-db-123';
    const mockSuggestions = [
      {
        value: 'SELECT * FROM users',
        displayLabel: null,
        occurrenceCount: 10,
        lastSeenAt: new Date(),
      },
      {
        value: 'SELECT * FROM orders',
        displayLabel: 'Orders query',
        occurrenceCount: 5,
        lastSeenAt: new Date(),
      },
    ];

    test('should return suggestions without prefix', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamHistory.mockResolvedValue(mockSuggestions);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'sql', limit: 20 },
      });

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0]).toEqual({
        value: 'SELECT * FROM users',
        label: null,
        count: 10,
        sourceKey: undefined,
      });
      expect(result.suggestions[1]).toEqual({
        value: 'SELECT * FROM orders',
        label: 'Orders query',
        count: 5,
        sourceKey: undefined,
      });
      expect(mockGetParamHistory).toHaveBeenCalledWith('org-123', TEST_SERVER_ID, 'sql', 20);
    });

    test('should search with prefix when provided', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockSearchParamValues.mockResolvedValue(mockSuggestions);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'sql', prefix: 'SELECT', limit: 10 },
      });

      expect(result.suggestions).toHaveLength(2);
      expect(mockSearchParamValues).toHaveBeenCalledWith(
        'org-123',
        TEST_SERVER_ID,
        'sql',
        'SELECT',
        10,
      );
      expect(mockGetParamHistory).not.toHaveBeenCalled();
    });

    test('should use getParamHistory for empty prefix', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamHistory.mockResolvedValue([]);
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'sql', prefix: '', limit: 20 },
      });

      expect(mockGetParamHistory).toHaveBeenCalled();
      expect(mockSearchParamValues).not.toHaveBeenCalled();
    });

    test('should pass limit to service function', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamHistory.mockResolvedValue([]);
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'sql', limit: 30 },
      });

      expect(mockGetParamHistory).toHaveBeenCalledWith('org-123', TEST_SERVER_ID, 'sql', 30);
    });

    test('should return empty array when no suggestions found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamHistory.mockResolvedValue([]);
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'unknownParam' },
      });

      expect(result.suggestions).toEqual([]);
    });

    test('should return empty array when server not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'unknown::query', paramName: 'sql' },
      });

      expect(result.suggestions).toEqual([]);
      expect(mockGetParamHistory).not.toHaveBeenCalled();
    });

    test('should return empty array when domain part is missing', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: '::query', paramName: 'sql' },
      });

      expect(result.suggestions).toEqual([]);
    });

    test('should handle server domain with port', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamHistory.mockResolvedValue([]);
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db:8080::query', paramName: 'sql', limit: 10 },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
          url: { contains: 'db:8080' },
        },
        select: { id: true },
      });
    });

    test('should search across ID-like keys when searching for ID parameter with prefix', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockSearchParamValues.mockResolvedValue([]); // No exact match
      mockIsIdParameter.mockReturnValue(true); // Simulate ID-like parameter

      const mockIdResults = [
        {
          parameterValue: 'page-123',
          displayLabel: 'My Page',
          occurrenceCount: 5,
          parameterKey: 'id',
        },
      ];
      mockPrisma.toolParamValue.findMany.mockResolvedValue(mockIdResults);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'page_id', prefix: 'page', limit: 10 },
      });

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]).toEqual({
        value: 'page-123',
        label: 'My Page',
        count: 5,
        sourceKey: 'id', // Different from paramName, so sourceKey is included
      });
    });

    test('should use fuzzy matching when no exact match found without prefix', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamHistory.mockResolvedValue([]); // No exact match
      mockGetParamKeys.mockResolvedValue(['id', 'user_id', 'other_param']);
      mockIsIdParameter.mockImplementation((key: string) => key === 'id' || key.endsWith('_id'));

      const mockRelatedValues = [
        {
          parameterValue: 'user-456',
          displayLabel: 'John Doe',
          occurrenceCount: 3,
          lastSeenAt: new Date(),
          parameterKey: 'user_id',
        },
      ];
      mockPrisma.toolParamValue.findMany.mockResolvedValue(mockRelatedValues);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'page_id', limit: 10 },
      });

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].sourceKey).toBe('user_id');
    });

    test('should match leaf key when fuzzy matching', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamHistory.mockResolvedValue([]);
      // Keys where one contains the other
      mockGetParamKeys.mockResolvedValue(['data.name', 'config.username']);

      const mockRelatedValues = [
        {
          parameterValue: 'testuser',
          displayLabel: null,
          occurrenceCount: 2,
          lastSeenAt: new Date(),
          parameterKey: 'config.username',
        },
      ];
      mockPrisma.toolParamValue.findMany.mockResolvedValue(mockRelatedValues);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'name', limit: 10 },
      });

      expect(result.suggestions).toHaveLength(1);
    });
  });

  describe('searchByLabel', () => {
    const VALIDATED_SERVER_ID = 'server-db-validated';

    test('should search by serverId when provided', async () => {
      // Mock server ownership validation - returns validated server
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: VALIDATED_SERVER_ID });

      const mockResults = [
        {
          parameterValue: 'page-123',
          displayLabel: 'My Page',
          parameterKey: 'page_id',
          serverId: VALIDATED_SERVER_ID,
          toolName: 'pages::get',
          occurrenceCount: 5,
        },
      ];
      mockPrisma.toolParamValue.findMany.mockResolvedValue(mockResults);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.searchByLabel({
        ctx,
        input: { serverId: 'server-1', labelQuery: 'My Page', limit: 10 },
      });

      // Verify server ownership was checked
      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'server-1',
          organizationId: 'org-123',
          deletedAt: null,
        },
        select: { id: true },
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        value: 'page-123',
        label: 'My Page',
        parameterKey: 'page_id',
        serverId: VALIDATED_SERVER_ID,
        toolName: 'pages::get',
        count: 5,
      });
      // Query uses the validated server.id, not the raw input
      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          serverId: VALIDATED_SERVER_ID,
          displayLabel: {
            contains: 'My Page',
            mode: 'insensitive',
          },
        },
        orderBy: [{ lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
        take: 10,
        select: {
          parameterValue: true,
          displayLabel: true,
          parameterKey: true,
          serverId: true,
          toolName: true,
          occurrenceCount: true,
        },
      });
    });

    test('should return empty results when serverId not found in organization', async () => {
      // Mock server ownership validation - server not found
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.searchByLabel({
        ctx,
        input: { serverId: 'server-not-owned', labelQuery: 'My Page', limit: 10 },
      });

      // Verify server ownership was checked
      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'server-not-owned',
          organizationId: 'org-123',
          deletedAt: null,
        },
        select: { id: true },
      });

      // Should return empty results without querying toolParamValue
      expect(result.results).toEqual([]);
      expect(mockPrisma.toolParamValue.findMany).not.toHaveBeenCalled();
    });

    test('should search by serverDomain when provided', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-from-domain' });
      mockPrisma.toolParamValue.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminConditionsRouter.searchByLabel({
        ctx,
        input: { serverDomain: 'notion.com', labelQuery: 'Database', limit: 10 },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
          url: { contains: 'notion.com' },
        },
        select: { id: true },
      });
      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serverId: 'server-from-domain',
          }),
        }),
      );
    });

    test('should search across all servers when neither serverId nor serverDomain provided', async () => {
      mockPrisma.toolParamValue.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminConditionsRouter.searchByLabel({
        ctx,
        input: { labelQuery: 'Project', limit: 20 },
      });

      expect(mockPrisma.mcpServer.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          displayLabel: {
            contains: 'Project',
            mode: 'insensitive',
          },
        },
        orderBy: [{ lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
        take: 20,
        select: expect.any(Object),
      });
    });

    test('should return empty results when no matches found', async () => {
      mockPrisma.toolParamValue.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.searchByLabel({
        ctx,
        input: { labelQuery: 'NonExistent', limit: 10 },
      });

      expect(result.results).toEqual([]);
    });

    test('should handle serverDomain not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);
      mockPrisma.toolParamValue.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminConditionsRouter.searchByLabel({
        ctx,
        input: { serverDomain: 'unknown.com', labelQuery: 'Test', limit: 10 },
      });

      // Should still search, but without server filter
      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          displayLabel: {
            contains: 'Test',
            mode: 'insensitive',
          },
        },
        orderBy: expect.any(Array),
        take: 10,
        select: expect.any(Object),
      });
    });

    test('should respect organization isolation', async () => {
      mockPrisma.toolParamValue.findMany.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminConditionsRouter.searchByLabel({
        ctx,
        input: { labelQuery: 'Test', limit: 10 },
      });

      expect(mockPrisma.toolParamValue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });
  });

  describe('getParamKeys', () => {
    const TEST_SERVER_ID = 'server-db-456';

    test('should return parameter keys for a server', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      const mockKeys = ['query', 'database', 'limit', 'offset'];
      mockGetParamKeys.mockResolvedValue(mockKeys);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamKeys({
        ctx,
        input: { toolName: 'db::executeQuery' },
      });

      expect(result.keys).toEqual(mockKeys);
      expect(mockGetParamKeys).toHaveBeenCalledWith('org-123', TEST_SERVER_ID);
    });

    test('should return empty array when no keys exist', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: TEST_SERVER_ID });
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamKeys({
        ctx,
        input: { toolName: 'unknown::tool' },
      });

      expect(result.keys).toEqual([]);
    });

    test('should return empty array when server not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamKeys({
        ctx,
        input: { toolName: 'unknown::tool' },
      });

      expect(result.keys).toEqual([]);
      expect(mockGetParamKeys).not.toHaveBeenCalled();
    });

    test('should return empty array when domain part is missing', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getParamKeys({
        ctx,
        input: { toolName: '::tool' },
      });

      expect(result.keys).toEqual([]);
    });
  });

  describe('getContextFieldsForTools', () => {
    test('should return context fields for tool patterns', async () => {
      const mockFields = [
        { category: 'context', fields: ['hourOfDay', 'dayOfWeek', 'timestamp', 'sourceIp'] },
        { category: 'sql', fields: ['sqlOperation', 'sqlTables', 'hasSqlComment'] },
      ];
      mockGetAvailableContextFields.mockReturnValue(mockFields);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getContextFieldsForTools({
        ctx,
        input: { toolPatterns: ['db::*', 'postgres::query'] },
      });

      expect(result.fields).toEqual(mockFields);
      expect(mockGetAvailableContextFields).toHaveBeenCalledWith(['db::*', 'postgres::query']);
    });

    test('should handle empty tool patterns', async () => {
      mockGetAvailableContextFields.mockReturnValue([]);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getContextFieldsForTools({
        ctx,
        input: { toolPatterns: [] },
      });

      expect(result.fields).toEqual([]);
    });
  });

  describe('validateConditions', () => {
    test('should validate conditions and return success', async () => {
      mockValidateConditions.mockReturnValue({ valid: true, errors: [] });

      const ctx = createAdminContext();
      const validConditions = [
        { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
        { field: 'params.query', operator: 'notContains', value: 'DROP' },
      ];

      const result = await adminConditionsRouter.validateConditions({
        ctx,
        input: { conditions: validConditions },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockValidateConditions).toHaveBeenCalledWith(validConditions);
    });

    test('should return validation errors for invalid conditions', async () => {
      const errors = [
        { field: '[0].operator', message: 'Invalid operator' },
        { field: '[1].value', message: 'Value must be an array' },
      ];
      mockValidateConditions.mockReturnValue({ valid: false, errors });

      const ctx = createAdminContext();
      const invalidConditions = [
        { field: 'time.hourOfDay', operator: 'invalid', value: 10 },
        { field: 'params.list', operator: 'in', value: 'not-an-array' },
      ];

      const result = await adminConditionsRouter.validateConditions({
        ctx,
        input: { conditions: invalidConditions },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(errors);
    });

    test('should handle empty conditions array', async () => {
      mockValidateConditions.mockReturnValue({ valid: true, errors: [] });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.validateConditions({
        ctx,
        input: { conditions: [] },
      });

      expect(result.valid).toBe(true);
      expect(mockValidateConditions).toHaveBeenCalledWith([]);
    });
  });

  describe('getOperators', () => {
    test('should return all operator categories', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getOperators({ ctx, input: undefined });

      expect(result.operators).toBeDefined();
      expect(result.operators.comparison).toBeDefined();
      expect(result.operators.string).toBeDefined();
      expect(result.operators.collection).toBeDefined();
      expect(result.operators.existence).toBeDefined();
      expect(result.operators.network).toBeDefined();
    });

    test('should include comparison operators', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getOperators({ ctx, input: undefined });

      const comparisonNames = result.operators.comparison.map((op) => op.name);
      expect(comparisonNames).toContain('equals');
      expect(comparisonNames).toContain('notEquals');
      expect(comparisonNames).toContain('lessThan');
      expect(comparisonNames).toContain('greaterThan');
      expect(comparisonNames).toContain('between');
    });

    test('should include string operators', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getOperators({ ctx, input: undefined });

      const stringNames = result.operators.string.map((op) => op.name);
      expect(stringNames).toContain('contains');
      expect(stringNames).toContain('notContains');
      expect(stringNames).toContain('startsWith');
      expect(stringNames).toContain('endsWith');
      expect(stringNames).toContain('matches');
    });

    test('should include collection operators', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getOperators({ ctx, input: undefined });

      const collectionNames = result.operators.collection.map((op) => op.name);
      expect(collectionNames).toContain('in');
      expect(collectionNames).toContain('notIn');
      expect(collectionNames).toContain('containsAny');
      expect(collectionNames).toContain('containsNone');
    });

    test('should include existence operators', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getOperators({ ctx, input: undefined });

      const existenceNames = result.operators.existence.map((op) => op.name);
      expect(existenceNames).toContain('exists');
      expect(existenceNames).toContain('notExists');
    });

    test('should have empty network operators (removed as too specialized)', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getOperators({ ctx, input: undefined });

      expect(result.operators.network).toEqual([]);
    });

    test('should include type information for operators', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getOperators({ ctx, input: undefined });

      const equalsOp = result.operators.comparison.find((op) => op.name === 'equals');
      expect(equalsOp).toBeDefined();
      expect(equalsOp?.types).toContain('string');
      expect(equalsOp?.types).toContain('number');
      expect(equalsOp?.types).toContain('boolean');

      const lessThanOp = result.operators.comparison.find((op) => op.name === 'lessThan');
      expect(lessThanOp).toBeDefined();
      expect(lessThanOp?.types).toEqual(['number']);
    });
  });

  describe('getDynamicCategories', () => {
    test('should always include time and network categories', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: [] },
      });

      const categoryNames = result.categories.map((c) => c.name);
      expect(categoryNames).toContain('time');
      expect(categoryNames).toContain('network');

      const timeCategory = result.categories.find((c) => c.name === 'time');
      expect(timeCategory?.fields.some((f) => f.name === 'time.hourOfDay')).toBe(true);
      expect(timeCategory?.fields.some((f) => f.name === 'time.dayOfWeek')).toBe(true);

      const networkCategory = result.categories.find((c) => c.name === 'network');
      expect(networkCategory?.fields.some((f) => f.name === 'network.sourceIp')).toBe(true);
    });

    test('should add SQL context for SQL-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['db::execute_sql', 'postgres::query'] },
      });

      const sqlCategory = result.categories.find((c) => c.name === 'extracted.sql');
      expect(sqlCategory).toBeDefined();
      expect(sqlCategory?.fields.some((f) => f.name === 'extracted.sql.sqlOperation')).toBe(true);
      expect(sqlCategory?.fields.some((f) => f.name === 'extracted.sql.sqlTables')).toBe(true);
    });

    test('should add SQL context for database-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['database::connect'] },
      });

      const sqlCategory = result.categories.find((c) => c.name === 'extracted.sql');
      expect(sqlCategory).toBeDefined();
    });

    test('should add SQL context for mysql-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['mysql::query'] },
      });

      const sqlCategory = result.categories.find((c) => c.name === 'extracted.sql');
      expect(sqlCategory).toBeDefined();
    });

    test('should add GitHub context for GitHub-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['github::create_pr', 'repo::push'] },
      });

      const githubCategory = result.categories.find((c) => c.name === 'extracted.github');
      expect(githubCategory).toBeDefined();
      expect(githubCategory?.fields.some((f) => f.name === 'extracted.github.gitRepository')).toBe(
        true,
      );
      expect(githubCategory?.fields.some((f) => f.name === 'extracted.github.gitBranch')).toBe(
        true,
      );
      expect(
        githubCategory?.fields.some((f) => f.name === 'extracted.github.isProtectedBranch'),
      ).toBe(true);
    });

    test('should add GitHub context for git-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['git::commit'] },
      });

      const githubCategory = result.categories.find((c) => c.name === 'extracted.github');
      expect(githubCategory).toBeDefined();
    });

    test('should add file context for file-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['fs::read_file', 'path::write'] },
      });

      const fileCategory = result.categories.find((c) => c.name === 'extracted.file');
      expect(fileCategory).toBeDefined();
      expect(fileCategory?.fields.some((f) => f.name === 'extracted.file.filePath')).toBe(true);
      expect(fileCategory?.fields.some((f) => f.name === 'extracted.file.fileExtension')).toBe(
        true,
      );
      expect(fileCategory?.fields.some((f) => f.name === 'extracted.file.isSensitivePath')).toBe(
        true,
      );
    });

    test('should add file context for read/write tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['read::document', 'write::text'] },
      });

      const fileCategory = result.categories.find((c) => c.name === 'extracted.file');
      expect(fileCategory).toBeDefined();
    });

    test('should extract tool parameters from schema', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The SQL query' },
          limit: { type: 'integer', description: 'Max results' },
          dryRun: { type: 'boolean' },
          tables: { type: 'array' },
          format: { type: 'string', enum: ['json', 'csv', 'xml'] },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'query',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['db.example.com::query'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeDefined();
      expect(
        paramsCategory?.fields.some((f) => f.name === 'params.query' && f.type === 'string'),
      ).toBe(true);
      expect(
        paramsCategory?.fields.some((f) => f.name === 'params.limit' && f.type === 'number'),
      ).toBe(true);
      expect(
        paramsCategory?.fields.some((f) => f.name === 'params.dryRun' && f.type === 'boolean'),
      ).toBe(true);
      expect(
        paramsCategory?.fields.some((f) => f.name === 'params.tables' && f.type === 'array'),
      ).toBe(true);

      const formatField = paramsCategory?.fields.find((f) => f.name === 'params.format');
      expect(formatField?.enum).toEqual(['json', 'csv', 'xml']);
    });

    test('should skip wildcard patterns for schema lookup', async () => {
      const ctx = createAdminContext();
      await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['db::*', 'server::tool'] },
      });

      // Should only be called for non-wildcard pattern
      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledTimes(1);
    });

    test('should skip patterns without correct format', async () => {
      const ctx = createAdminContext();
      await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['invalidpattern', 'also-invalid'] },
      });

      expect(mockPrisma.mcpServer.findFirst).not.toHaveBeenCalled();
    });

    test('should not add duplicate parameter fields', async () => {
      const mockInputSchema = {
        properties: {
          query: { type: 'string' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['server1::tool', 'server2::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const queryFields = paramsCategory?.fields.filter((f) => f.name === 'params.query');
      expect(queryFields?.length).toBe(1);
    });

    test('should handle tools without input schema', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({ inputSchema: null, name: 'tool' });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeUndefined();
    });

    test('should handle server not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['unknown.server::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeUndefined();
    });

    test('should handle schema that is not a plain object', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: 'invalid-schema', // Not an object
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeUndefined();
    });

    test('should handle schema with no properties object', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: { type: 'object' }, // No properties
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeUndefined();
    });

    test('should handle schema with invalid property definitions', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: {
          type: 'object',
          properties: {
            validField: { type: 'string' },
            invalidField: 'not-an-object', // Invalid
            anotherValid: { type: 'number' },
          },
        },
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeDefined();
      // Should only include valid fields
      expect(paramsCategory?.fields.some((f) => f.name === 'params.validField')).toBe(true);
      expect(paramsCategory?.fields.some((f) => f.name === 'params.invalidField')).toBe(false);
      expect(paramsCategory?.fields.some((f) => f.name === 'params.anotherValid')).toBe(true);
    });

    test('should handle properties with non-string type', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: {
          type: 'object',
          properties: {
            field1: { type: 123 }, // Non-string type
            field2: { description: 'No type specified' },
          },
        },
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeDefined();
      // Fields default to string type when type is not a valid string
      expect(paramsCategory?.fields.find((f) => f.name === 'params.field1')?.type).toBe('string');
      expect(paramsCategory?.fields.find((f) => f.name === 'params.field2')?.type).toBe('string');
    });
  });

  describe('getNestedCategories', () => {
    test('should always include time and network categories', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: [] },
      });

      const categoryNames = result.categories.map((c) => c.name);
      expect(categoryNames).toContain('time');
      expect(categoryNames).toContain('network');

      const timeCategory = result.categories.find((c) => c.name === 'time');
      expect(timeCategory?.fields.some((f) => f.name === 'time.hourOfDay')).toBe(true);
      expect(timeCategory?.fields.some((f) => f.name === 'time.dayOfWeek')).toBe(true);
      expect(timeCategory?.fields.some((f) => f.name === 'time.timestamp')).toBe(true);

      const networkCategory = result.categories.find((c) => c.name === 'network');
      expect(networkCategory?.fields.some((f) => f.name === 'network.sourceIp')).toBe(true);
    });

    test('should extract nested parameter fields from JSON schema', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'User name' },
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'createUser',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api.example.com::createUser'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeDefined();

      const nameField = paramsCategory?.fields.find((f) => f.name === 'params.name');
      expect(nameField).toBeDefined();
      expect(nameField?.type).toBe('string');
      expect(nameField?.description).toBe('User name');

      const ageField = paramsCategory?.fields.find((f) => f.name === 'params.age');
      expect(ageField?.type).toBe('number');

      const activeField = paramsCategory?.fields.find((f) => f.name === 'params.active');
      expect(activeField?.type).toBe('boolean');
    });

    test('should handle object type with children', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'updateUser',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::updateUser'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const userField = paramsCategory?.fields.find((f) => f.name === 'params.user');
      expect(userField).toBeDefined();
      expect(userField?.type).toBe('object');
      expect(userField?.children).toBeDefined();
      expect(userField?.children?.some((c) => c.name === 'params.user.name')).toBe(true);
      expect(userField?.children?.some((c) => c.name === 'params.user.email')).toBe(true);
    });

    test('should handle array type with items schema', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              description: 'List item',
              properties: {
                id: { type: 'string' },
                value: { type: 'number' },
              },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'processItems',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::processItems'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const itemsField = paramsCategory?.fields.find((f) => f.name === 'params.items');
      expect(itemsField).toBeDefined();
      expect(itemsField?.type).toBe('array');
      expect(itemsField?.items).toBeDefined();
      expect(itemsField?.items?.type).toBe('object');
      expect(itemsField?.items?.children?.some((c) => c.name === 'params.items[].id')).toBe(true);
      expect(itemsField?.items?.children?.some((c) => c.name === 'params.items[].value')).toBe(
        true,
      );
    });

    test('should handle anyOf/oneOf schemas', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          payload: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['A'] },
                  dataA: { type: 'string' },
                },
              },
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['B'] },
                  dataB: { type: 'number' },
                },
              },
            ],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'handlePayload',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::handlePayload'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const payloadField = paramsCategory?.fields.find((f) => f.name === 'params.payload');
      expect(payloadField).toBeDefined();
      expect(payloadField?.type).toBe('object');
      // Should merge children from both anyOf variants
      expect(payloadField?.children?.some((c) => c.name === 'params.payload.type')).toBe(true);
      expect(payloadField?.children?.some((c) => c.name === 'params.payload.dataA')).toBe(true);
      expect(payloadField?.children?.some((c) => c.name === 'params.payload.dataB')).toBe(true);
    });

    test('should handle allOf schemas by merging properties', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          config: {
            allOf: [
              {
                type: 'object',
                properties: {
                  base: { type: 'string' },
                },
              },
              {
                type: 'object',
                properties: {
                  extended: { type: 'number' },
                },
              },
            ],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'configure',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::configure'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const configField = paramsCategory?.fields.find((f) => f.name === 'params.config');
      expect(configField).toBeDefined();
      expect(configField?.type).toBe('object');
      expect(configField?.children?.some((c) => c.name === 'params.config.base')).toBe(true);
      expect(configField?.children?.some((c) => c.name === 'params.config.extended')).toBe(true);
    });

    test('should handle additionalProperties with wildcard field', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'setMetadata',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::setMetadata'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const metadataField = paramsCategory?.fields.find((f) => f.name === 'params.metadata');
      expect(metadataField).toBeDefined();
      expect(metadataField?.type).toBe('object');
      // Should have wildcard child
      expect(metadataField?.children?.some((c) => c.name === 'params.metadata.*')).toBe(true);
      const wildcardChild = metadataField?.children?.find((c) => c.name === 'params.metadata.*');
      expect(wildcardChild?.label).toBe('<any key>');
      expect(wildcardChild?.type).toBe('string');
    });

    test('should handle additionalProperties with true', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            additionalProperties: true,
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'setData',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::setData'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const dataField = paramsCategory?.fields.find((f) => f.name === 'params.data');
      expect(dataField?.children?.some((c) => c.name === 'params.data.*')).toBe(true);
      const wildcardChild = dataField?.children?.find((c) => c.name === 'params.data.*');
      expect(wildcardChild?.type).toBe('unknown');
    });

    test('should add SQL context for SQL-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['db::execute_sql'] },
      });

      const sqlCategory = result.categories.find((c) => c.name === 'extracted.sql');
      expect(sqlCategory).toBeDefined();
      expect(sqlCategory?.fields.some((f) => f.name === 'extracted.sql.sqlOperation')).toBe(true);
      expect(sqlCategory?.fields.some((f) => f.name === 'extracted.sql.sqlTables')).toBe(true);
      expect(sqlCategory?.fields.some((f) => f.name === 'extracted.sql.hasSqlComment')).toBe(true);
    });

    test('should add GitHub context for GitHub-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['github::push'] },
      });

      const githubCategory = result.categories.find((c) => c.name === 'extracted.github');
      expect(githubCategory).toBeDefined();
      expect(githubCategory?.fields.some((f) => f.name === 'extracted.github.gitRepository')).toBe(
        true,
      );
      expect(githubCategory?.fields.some((f) => f.name === 'extracted.github.gitBranch')).toBe(
        true,
      );
    });

    test('should add File context for file-related tools', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['fs::readFile'] },
      });

      const fileCategory = result.categories.find((c) => c.name === 'extracted.file');
      expect(fileCategory).toBeDefined();
      expect(fileCategory?.fields.some((f) => f.name === 'extracted.file.filePath')).toBe(true);
    });

    test('should skip wildcard patterns for schema lookup', async () => {
      const ctx = createAdminContext();
      await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::*', 'server::tool'] },
      });

      // Should only be called once for non-wildcard pattern
      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledTimes(1);
    });

    test('should handle invalid pattern formats', async () => {
      const ctx = createAdminContext();
      await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['invalid', 'no-separator'] },
      });

      expect(mockPrisma.mcpServer.findFirst).not.toHaveBeenCalled();
    });

    test('should avoid duplicate parameter fields from multiple tools', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['server1::tool', 'server2::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const queryFields = paramsCategory?.fields.filter((f) => f.name === 'params.query');
      expect(queryFields?.length).toBe(1);
    });

    test('should handle tools without input schema', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({ inputSchema: null, name: 'tool' });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeUndefined();
    });

    test('should handle server not found', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['unknown::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      expect(paramsCategory).toBeUndefined();
    });

    test('should respect organization isolation', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'isolated-org',
          deletedAt: null,
          url: { contains: 'server' },
        },
        select: { id: true },
      });
    });

    test('should extract enum values from schema', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
            description: 'User status',
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'updateStatus',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::updateStatus'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const statusField = paramsCategory?.fields.find((f) => f.name === 'params.status');
      expect(statusField?.enum).toEqual(['active', 'inactive', 'pending']);
    });

    test('should handle type arrays like ["string", "null"]', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          nullableField: {
            type: ['string', 'null'],
            description: 'Optional string field',
          },
          nullFirst: {
            type: ['null', 'number'],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'withNullable',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::withNullable'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const nullableField = paramsCategory?.fields.find((f) => f.name === 'params.nullableField');
      expect(nullableField?.type).toBe('string');

      const nullFirstField = paramsCategory?.fields.find((f) => f.name === 'params.nullFirst');
      expect(nullFirstField?.type).toBe('number');
    });

    test('should infer object type from presence of properties', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          implicitObject: {
            // No type specified, but has properties
            properties: {
              nested: { type: 'string' },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'implicit',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::implicit'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const implicitField = paramsCategory?.fields.find((f) => f.name === 'params.implicitObject');
      expect(implicitField?.type).toBe('object');
    });

    test('should infer array type from presence of items', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          implicitArray: {
            // No type specified, but has items
            items: { type: 'string' },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'implicitArr',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::implicitArr'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const implicitField = paramsCategory?.fields.find((f) => f.name === 'params.implicitArray');
      expect(implicitField?.type).toBe('array');
    });
  });

  describe('getCategories (deprecated)', () => {
    test('should return static time and network categories', async () => {
      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getCategories({ ctx, input: undefined });

      expect(result.categories).toHaveLength(2);

      const timeCategory = result.categories.find((c) => c.name === 'time');
      expect(timeCategory).toBeDefined();
      expect(timeCategory?.label).toBe('Time-based');
      expect(timeCategory?.fields.some((f) => f.name === 'time.hourOfDay')).toBe(true);
      expect(timeCategory?.fields.some((f) => f.name === 'time.dayOfWeek')).toBe(true);
      expect(timeCategory?.fields.some((f) => f.name === 'time.timestamp')).toBe(true);

      const networkCategory = result.categories.find((c) => c.name === 'network');
      expect(networkCategory).toBeDefined();
      expect(networkCategory?.label).toBe('Network');
      expect(networkCategory?.fields.some((f) => f.name === 'network.sourceIp')).toBe(true);
    });
  });

  describe('getConditionFieldsForTool', () => {
    test('should return fields from matching policies', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          toolPatterns: ['api::createUser', 'api::updateUser'],
          conditions: [
            { field: 'params.role', operator: 'equals', value: 'admin' },
            { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
          ],
        },
        {
          toolPatterns: ['api::*'],
          conditions: [{ field: 'network.sourceIp', operator: 'inCidr', value: '10.0.0.0/8' }],
        },
      ]);
      mockCheckToolPattern.mockImplementation((pattern, tool) => {
        if (pattern === 'api::createUser' && tool === 'api::createUser') return true;
        if (pattern === 'api::*' && tool === 'api::createUser') return true;
        return false;
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::createUser' },
      });

      expect(result.fields).toContain('params.role');
      expect(result.fields).toContain('time.hourOfDay');
      expect(result.fields).toContain('network.sourceIp');
    });

    test('should filter by enabled policies only', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          toolPatterns: ['api::tool'],
          conditions: [{ field: 'enabled.field', operator: 'equals', value: 'x' }],
        },
      ]);
      mockCheckToolPattern.mockReturnValue(true);

      const ctx = createAdminContext();
      await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::tool' },
      });

      // Verify query filters for enabled policies
      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
          enabled: true,
          conditions: { not: mockDbNull },
        },
        select: { conditions: true, toolPatterns: true },
      });
    });

    test('should return empty when no matching policies', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          toolPatterns: ['other::tool'],
          conditions: [{ field: 'some.field', operator: 'equals', value: 'x' }],
        },
      ]);
      mockCheckToolPattern.mockReturnValue(false);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::myTool' },
      });

      expect(result.fields).toEqual([]);
    });

    test('should handle policies without conditions', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          toolPatterns: ['api::tool'],
          conditions: null, // No conditions
        },
      ]);
      mockCheckToolPattern.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::tool' },
      });

      expect(result.fields).toEqual([]);
    });

    test('should handle policies with non-array conditions', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          toolPatterns: ['api::tool'],
          conditions: 'invalid', // Not an array
        },
      ]);
      mockCheckToolPattern.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::tool' },
      });

      expect(result.fields).toEqual([]);
    });

    test('should handle conditions without field property', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          toolPatterns: ['api::tool'],
          conditions: [
            { field: 'valid.field', operator: 'equals', value: 'x' },
            { operator: 'equals', value: 'x' }, // Missing field
            { field: 123, operator: 'equals', value: 'x' }, // Non-string field
          ],
        },
      ]);
      mockCheckToolPattern.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::tool' },
      });

      expect(result.fields).toEqual(['valid.field']);
    });

    test('should deduplicate fields across multiple policies', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([
        {
          toolPatterns: ['api::tool'],
          conditions: [{ field: 'params.name', operator: 'equals', value: 'x' }],
        },
        {
          toolPatterns: ['api::*'],
          conditions: [
            { field: 'params.name', operator: 'contains', value: 'y' }, // Same field
            { field: 'context.ip', operator: 'equals', value: 'z' },
          ],
        },
      ]);
      mockCheckToolPattern.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::tool' },
      });

      // Should have unique fields only
      const uniqueFields = [...new Set(result.fields)];
      expect(result.fields).toEqual(uniqueFields);
      expect(result.fields).toContain('params.name');
      expect(result.fields).toContain('context.ip');
    });

    test('should respect organization isolation', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminConditionsRouter.getConditionFieldsForTool({
        ctx,
        input: { toolName: 'api::tool' },
      });

      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'isolated-org',
        }),
        select: expect.any(Object),
      });
    });
  });

  describe('organization isolation', () => {
    test('getToolParamSchema should filter by organization', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminConditionsRouter.getToolParamSchema({
        ctx,
        input: { toolName: 'server::tool' },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'custom-org',
          deletedAt: null,
          url: { contains: 'server' },
        },
        select: { id: true },
      });
    });

    test('getParamSuggestions should use organization from context', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'isolated-server-id' });
      mockGetParamHistory.mockResolvedValue([]);
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'sql', limit: 20 },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'isolated-org',
          deletedAt: null,
          url: { contains: 'db' },
        },
        select: { id: true },
      });
      expect(mockGetParamHistory).toHaveBeenCalledWith(
        'isolated-org',
        'isolated-server-id',
        'sql',
        20,
      );
    });

    test('getParamKeys should use organization from context', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'xyz-server-id' });
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'org-xyz' });
      await adminConditionsRouter.getParamKeys({
        ctx,
        input: { toolName: 'tool::name' },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-xyz',
          deletedAt: null,
          url: { contains: 'tool' },
        },
        select: { id: true },
      });
      expect(mockGetParamKeys).toHaveBeenCalledWith('org-xyz', 'xyz-server-id');
    });

    test('getDynamicCategories should filter MCP servers by organization', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext({ organizationId: 'my-org' });
      await adminConditionsRouter.getDynamicCategories({
        ctx,
        input: { toolPatterns: ['server::tool'] },
      });

      expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'my-org',
          deletedAt: null,
          url: { contains: 'server' },
        },
        select: { id: true },
      });
    });
  });

  describe('input validation', () => {
    test('getParamSuggestions should respect limit bounds', async () => {
      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-limit-test' });
      mockGetParamHistory.mockResolvedValue([]);
      mockGetParamKeys.mockResolvedValue([]);

      const ctx = createAdminContext();

      await adminConditionsRouter.getParamSuggestions({
        ctx,
        input: { toolName: 'db::query', paramName: 'sql', limit: 50 },
      });

      expect(mockGetParamHistory).toHaveBeenCalledWith('org-123', 'server-limit-test', 'sql', 50);
    });

    test('validateConditions should handle various condition types', async () => {
      mockValidateConditions.mockReturnValue({ valid: true, errors: [] });

      const ctx = createAdminContext();
      const mixedConditions = [
        { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
        { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.0.0/16' },
        { field: 'params.tables', operator: 'containsNone', value: ['users', 'secrets'] },
        { field: 'extracted.sql.sqlOperation', operator: 'in', value: ['SELECT', 'INSERT'] },
      ];

      await adminConditionsRouter.validateConditions({
        ctx,
        input: { conditions: mixedConditions },
      });

      expect(mockValidateConditions).toHaveBeenCalledWith(mixedConditions);
    });
  });

  describe('helper function coverage via getNestedCategories', () => {
    test('inferFieldType: handles integer type', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const countField = paramsCategory?.fields.find((f) => f.name === 'params.count');
      expect(countField?.type).toBe('number');
    });

    test('inferFieldType: handles $ref as object type', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          reference: { $ref: '#/definitions/SomeType' },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'tool',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::tool'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const refField = paramsCategory?.fields.find((f) => f.name === 'params.reference');
      expect(refField?.type).toBe('object');
    });

    test('extractNestedFields: handles deeply nested objects', async () => {
      const mockInputSchema = {
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
                      value: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'deep',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::deep'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const level1Field = paramsCategory?.fields.find((f) => f.name === 'params.level1');
      expect(level1Field?.type).toBe('object');

      // Should have nested children
      const level2Child = level1Field?.children?.find((c) => c.name === 'params.level1.level2');
      expect(level2Child?.type).toBe('object');
    });

    test('extractObjectChildren: handles nested anyOf within allOf', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          complex: {
            allOf: [
              {
                anyOf: [
                  {
                    type: 'object',
                    properties: {
                      variantA: { type: 'string' },
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'complex',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::complex'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const complexField = paramsCategory?.fields.find((f) => f.name === 'params.complex');
      expect(complexField?.type).toBe('object');
      expect(complexField?.children?.some((c) => c.name === 'params.complex.variantA')).toBe(true);
    });

    test('extractObjectChildren: avoids duplicate children paths', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          merged: {
            allOf: [
              {
                type: 'object',
                properties: {
                  shared: { type: 'string' },
                },
              },
              {
                type: 'object',
                properties: {
                  shared: { type: 'string' }, // Duplicate
                  unique: { type: 'number' },
                },
              },
            ],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'merged',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::merged'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const mergedField = paramsCategory?.fields.find((f) => f.name === 'params.merged');
      // Should only have one 'shared' child, not duplicates
      const sharedChildren = mergedField?.children?.filter(
        (c) => c.name === 'params.merged.shared',
      );
      expect(sharedChildren?.length).toBe(1);
    });

    test('handles oneOf schema variant', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          variant: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  optionA: { type: 'string' },
                },
              },
              {
                type: 'object',
                properties: {
                  optionB: { type: 'number' },
                },
              },
            ],
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'oneOf',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::oneOf'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const variantField = paramsCategory?.fields.find((f) => f.name === 'params.variant');
      expect(variantField?.type).toBe('object');
      expect(variantField?.children?.some((c) => c.name === 'params.variant.optionA')).toBe(true);
      expect(variantField?.children?.some((c) => c.name === 'params.variant.optionB')).toBe(true);
    });

    test('handles additionalProperties with nested object structure', async () => {
      const mockInputSchema = {
        type: 'object',
        properties: {
          dynamic: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                nestedValue: { type: 'string' },
              },
            },
          },
        },
      };

      mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-1' });
      mockPrisma.mcpTool.findFirst.mockResolvedValue({
        inputSchema: mockInputSchema,
        name: 'dynamicNested',
      });

      const ctx = createAdminContext();
      const result = await adminConditionsRouter.getNestedCategories({
        ctx,
        input: { toolPatterns: ['api::dynamicNested'] },
      });

      const paramsCategory = result.categories.find((c) => c.name === 'parameters');
      const dynamicField = paramsCategory?.fields.find((f) => f.name === 'params.dynamic');
      expect(dynamicField?.type).toBe('object');

      const wildcardChild = dynamicField?.children?.find((c) => c.name === 'params.dynamic.*');
      expect(wildcardChild).toBeDefined();
      expect(wildcardChild?.type).toBe('object');
      expect(wildcardChild?.children?.some((c) => c.name === 'params.dynamic.*.nestedValue')).toBe(
        true,
      );
    });
  });
});
