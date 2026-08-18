/**
 * Tool Validation Unit Tests
 * Tests for tool name validation logic
 *
 * IMPORTANT: Tool patterns use serverKey (hostname:port from URL), not friendly server names
 * Example: "github.com::createPR" not "GitHub::createPR"
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getToolValidationErrorMessage,
  normalizeToolNames,
  validateToolNamesForOrganization,
  type ToolValidationResult,
} from '../../../../packages/api/src/services/toolValidation.js';

// Hoist mock to allow any return type (including includes)
const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

// Mock Prisma
vi.mock('@sentinel/db', () => ({
  prisma: {
    mcpServer: {
      findMany: mockFindMany,
    },
  },
}));

describe('Tool Validation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeToolNames', () => {
    test('should remove whitespace from tool names', () => {
      const result = normalizeToolNames(['  github.com::createPR  ', 'slack.com::sendMessage  ']);
      expect(result).toEqual(['github.com::createPR', 'slack.com::sendMessage']);
    });

    test('should remove duplicate tool names', () => {
      const result = normalizeToolNames([
        'github.com::createPR',
        'github.com::createPR',
        'slack.com::sendMessage',
      ]);
      expect(result).toEqual(['github.com::createPR', 'slack.com::sendMessage']);
    });

    test('should handle empty array', () => {
      const result = normalizeToolNames([]);
      expect(result).toEqual([]);
    });

    test('should filter empty strings', () => {
      const result = normalizeToolNames(['', '  ', 'github.com::createPR', '']);
      expect(result).toEqual(['github.com::createPR']);
    });

    test('should handle array with only whitespace strings', () => {
      const result = normalizeToolNames(['  ', '   ', '\t']);
      expect(result).toEqual([]);
    });

    test('should preserve valid tool names', () => {
      const result = normalizeToolNames([
        'github.com::createPR',
        '*::*',
        'api.example.com:8080::test',
      ]);
      expect(result).toEqual(['github.com::createPR', '*::*', 'api.example.com:8080::test']);
    });
  });

  describe('getToolValidationErrorMessage', () => {
    test('should return null when no errors', () => {
      const result: ToolValidationResult = {
        toolNames: ['github.com::createPR'],
        invalidFormat: [],
        unknownServer: [],
        unknownTool: [],
      };
      expect(getToolValidationErrorMessage(result)).toBeNull();
    });

    test('should format invalid format errors', () => {
      const result: ToolValidationResult = {
        toolNames: ['invalid'],
        invalidFormat: ['invalid', 'also-invalid'],
        unknownServer: [],
        unknownTool: [],
      };
      const message = getToolValidationErrorMessage(result);
      expect(message).toContain('Invalid tool pattern format: invalid, also-invalid');
      expect(message).toContain('serverKey::tool_name');
    });

    test('should format unknown server errors', () => {
      const result: ToolValidationResult = {
        toolNames: ['unknown.server.com::tool'],
        invalidFormat: [],
        unknownServer: ['unknown.server.com::tool', 'another.server.com::tool'],
        unknownTool: [],
      };
      const message = getToolValidationErrorMessage(result);
      expect(message).toContain(
        'Unknown MCP server keys: unknown.server.com::tool, another.server.com::tool',
      );
    });

    test('should format unknown tool errors', () => {
      const result: ToolValidationResult = {
        toolNames: ['github.com::unknownTool'],
        invalidFormat: [],
        unknownServer: [],
        unknownTool: ['github.com::unknownTool'],
      };
      const message = getToolValidationErrorMessage(result);
      expect(message).toContain('Unknown tools: github.com::unknownTool');
    });

    test('should combine multiple error types', () => {
      const result: ToolValidationResult = {
        toolNames: ['invalid', 'unknown.server.com::tool', 'github.com::unknownTool'],
        invalidFormat: ['invalid'],
        unknownServer: ['unknown.server.com::tool'],
        unknownTool: ['github.com::unknownTool'],
      };
      const message = getToolValidationErrorMessage(result);
      expect(message).toContain('Invalid tool pattern format: invalid');
      expect(message).toContain('Unknown MCP server keys: unknown.server.com::tool');
      expect(message).toContain('Unknown tools: github.com::unknownTool');
    });
  });

  describe('validateToolNamesForOrganization', () => {
    const orgId = 'org-123';

    beforeEach(() => {
      // Default mock: no servers
      mockFindMany.mockResolvedValue([]);
    });

    test('should handle empty input', async () => {
      const result = await validateToolNamesForOrganization(orgId, []);
      expect(result).toEqual({
        toolNames: [],
        invalidFormat: ['<empty>'],
        unknownServer: [],
        unknownTool: [],
      });
    });

    test('should handle whitespace-only input', async () => {
      const result = await validateToolNamesForOrganization(orgId, ['  ', '']);
      expect(result).toEqual({
        toolNames: [],
        invalidFormat: ['<empty>'],
        unknownServer: [],
        unknownTool: [],
      });
    });

    describe('format validation (parseQualifiedToolName)', () => {
      test('should reject tool names without :: separator', async () => {
        const result = await validateToolNamesForOrganization(orgId, ['invalid-tool-name']);
        expect(result.invalidFormat).toContain('invalid-tool-name');
      });

      test('should reject tool names with more than one :: separator', async () => {
        const result = await validateToolNamesForOrganization(orgId, ['github.com::tool::extra']);
        expect(result.invalidFormat).toContain('github.com::tool::extra');
      });

      test('should reject invalid serverKey format', async () => {
        // ServerKey must be valid hostname:port format
        const result = await validateToolNamesForOrganization(orgId, [
          '@@invalid@@::tool',
          'server#name::tool',
          'server$name::tool',
          // Spaces not allowed in hostnames
          'My Server::tool',
          'Server 8080::tool',
        ]);
        expect(result.invalidFormat).toContain('@@invalid@@::tool');
        expect(result.invalidFormat).toContain('server#name::tool');
        expect(result.invalidFormat).toContain('server$name::tool');
        expect(result.invalidFormat).toContain('My Server::tool');
        expect(result.invalidFormat).toContain('Server 8080::tool');
      });

      test('should reject invalid tool name format', async () => {
        const result = await validateToolNamesForOrganization(orgId, [
          'github.com::tool with spaces',
          'github.com::tool@invalid',
          'github.com::',
        ]);
        expect(result.invalidFormat).toContain('github.com::tool with spaces');
        expect(result.invalidFormat).toContain('github.com::tool@invalid');
      });

      test('should accept valid serverKey formats (hostname)', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://github.com/mcp',
            tools: [{ name: 'createPR' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, ['github.com::createPR']);
        expect(result.invalidFormat).toEqual([]);
      });

      test('should accept serverKey with port', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://api.example.com:8080/mcp',
            tools: [{ name: 'testTool' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, [
          'api.example.com:8080::testTool',
        ]);
        expect(result.invalidFormat).toEqual([]);
        expect(result.unknownServer).toEqual([]);
        expect(result.unknownTool).toEqual([]);
      });

      test('should accept tool names with dots, underscores, and hyphens', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://github.com/mcp',
            tools: [{ name: 'create_pr' }, { name: 'create-issue' }, { name: 'list.repos' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, [
          'github.com::create_pr',
          'github.com::create-issue',
          'github.com::list.repos',
        ]);
        expect(result.invalidFormat).toEqual([]);
      });
    });

    describe('wildcard handling', () => {
      test('should accept *::* universal wildcard', async () => {
        const result = await validateToolNamesForOrganization(orgId, ['*::*']);
        expect(result.invalidFormat).toEqual([]);
        expect(result.unknownServer).toEqual([]);
        expect(result.unknownTool).toEqual([]);
      });

      test('should accept *::toolName domain wildcard', async () => {
        const result = await validateToolNamesForOrganization(orgId, ['*::createPR']);
        expect(result.invalidFormat).toEqual([]);
        expect(result.unknownServer).toEqual([]);
        expect(result.unknownTool).toEqual([]);
      });

      test('should accept serverKey::* tool wildcard', async () => {
        const result = await validateToolNamesForOrganization(orgId, ['github.com::*']);
        expect(result.invalidFormat).toEqual([]);
        expect(result.unknownServer).toEqual([]);
        expect(result.unknownTool).toEqual([]);
      });

      test('should skip existence checks for wildcards', async () => {
        // No servers configured, but wildcards should still pass
        mockFindMany.mockResolvedValue([]);

        const result = await validateToolNamesForOrganization(orgId, [
          '*::*',
          '*::createPR',
          'github.com::*',
        ]);
        expect(result.invalidFormat).toEqual([]);
        expect(result.unknownServer).toEqual([]);
        expect(result.unknownTool).toEqual([]);
      });
    });

    describe('server validation', () => {
      test('should mark unknown servers', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://github.com/mcp',
            tools: [{ name: 'createPR' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, [
          'unknown.server.com::someTool',
        ]);
        expect(result.unknownServer).toContain('unknown.server.com::someTool');
      });

      test('should handle case-insensitive serverKey matching', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://GitHub.com/mcp',
            tools: [{ name: 'createPR' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, ['github.com::createPR']);
        expect(result.unknownServer).toEqual([]);
        expect(result.unknownTool).toEqual([]);
      });
    });

    describe('tool validation', () => {
      test('should mark unknown tools', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://github.com/mcp',
            tools: [{ name: 'createPR' }, { name: 'createIssue' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, ['github.com::unknownTool']);
        expect(result.unknownTool).toContain('github.com::unknownTool');
      });

      test('should validate tool exists on server', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://github.com/mcp',
            tools: [{ name: 'createPR' }, { name: 'createIssue' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, [
          'github.com::createPR',
          'github.com::createIssue',
        ]);
        expect(result.unknownTool).toEqual([]);
        expect(result.toolNames).toEqual(['github.com::createPR', 'github.com::createIssue']);
      });

      test('should handle multiple servers with different URLs', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://api.example.com:8080/mcp',
            tools: [{ name: 'tool8080' }],
          },
          {
            url: 'https://api.example.com:9090/mcp',
            tools: [{ name: 'tool9090' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, [
          'api.example.com:8080::tool8080',
          'api.example.com:9090::tool9090',
          'api.example.com:8080::tool9090', // Wrong server for this tool
        ]);
        expect(result.unknownTool).toContain('api.example.com:8080::tool9090');
        expect(result.toolNames).toHaveLength(3);
      });
    });

    describe('organization isolation', () => {
      test('should query servers for the correct organization', async () => {
        await validateToolNamesForOrganization('specific-org-id', ['github.com::createPR']);

        expect(mockFindMany).toHaveBeenCalledWith({
          where: { organizationId: 'specific-org-id', deletedAt: null },
          select: {
            url: true,
            tools: {
              select: { name: true },
            },
          },
        });
      });
    });

    describe('mixed validation scenarios', () => {
      test('should handle mix of valid, invalid, and unknown tools', async () => {
        mockFindMany.mockResolvedValue([
          {
            url: 'https://github.com/mcp',
            tools: [{ name: 'createPR' }],
          },
        ]);

        const result = await validateToolNamesForOrganization(orgId, [
          'github.com::createPR', // Valid
          'invalid-format', // Invalid format
          'unknown.server.com::tool', // Unknown server
          'github.com::unknownTool', // Unknown tool
          '*::*', // Wildcard
        ]);

        expect(result.toolNames).toHaveLength(5);
        expect(result.invalidFormat).toEqual(['invalid-format']);
        expect(result.unknownServer).toEqual(['unknown.server.com::tool']);
        expect(result.unknownTool).toEqual(['github.com::unknownTool']);
      });

      test('should deduplicate before validation', async () => {
        mockFindMany.mockResolvedValue([]);

        const result = await validateToolNamesForOrganization(orgId, [
          'unknown.server.com::tool',
          'unknown.server.com::tool',
          '  unknown.server.com::tool  ',
        ]);

        // Should only report once after deduplication
        expect(result.toolNames).toEqual(['unknown.server.com::tool']);
        expect(result.unknownServer).toEqual(['unknown.server.com::tool']);
      });
    });
  });
});
