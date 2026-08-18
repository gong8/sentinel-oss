/**
 * Policy Validation Unit Tests
 * Tests for policy validation logic that validates tool patterns, matchers,
 * and condition fields against actual registered data.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  validateConditionFields,
  validateMatchersFormat,
  validatePolicyInput,
  validateToolPatterns,
} from '../../../../packages/api/src/services/policyValidation.js';

// Hoist mock to allow any return type
const { mockMcpServerFindMany, mockRoleFindMany, mockUserFindMany, mockAgentFindMany } = vi.hoisted(
  () => ({
    mockMcpServerFindMany: vi.fn(),
    mockRoleFindMany: vi.fn(),
    mockUserFindMany: vi.fn(),
    mockAgentFindMany: vi.fn(),
  }),
);

// Mock Prisma
vi.mock('@sentinel/db', () => ({
  prisma: {
    mcpServer: {
      findMany: mockMcpServerFindMany,
    },
    role: {
      findMany: mockRoleFindMany,
    },
    user: {
      findMany: mockUserFindMany,
    },
    agent: {
      findMany: mockAgentFindMany,
    },
  },
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockServer(
  name: string,
  url: string,
  tools: Array<{ name: string; inputSchema?: unknown }> = [],
) {
  return {
    id: `server-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    url,
    tools,
  };
}

// ============================================================================
// validateToolPatterns Tests
// ============================================================================

describe('policyValidation: validateToolPatterns', () => {
  const orgId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wildcard patterns', () => {
    test('valid "*::*" wildcard pattern passes without database lookup', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateToolPatterns(orgId, ['*::*']);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toEqual(['*::*']);
      }
    });

    test('valid "serverKey::*" server wildcard pattern passes', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [{ name: 'createPR' }]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::*']);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toEqual(['github.com::*']);
      }
    });
  });

  describe('exact match patterns', () => {
    test('valid "serverKey::toolName" exact match passes', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'createPR' },
          { name: 'getFile' },
        ]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::createPR']);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toEqual(['github.com::createPR']);
      }
    });

    test('case-insensitive tool name matching works', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [{ name: 'CreatePR' }]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::createpr']);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toEqual(['github.com::CreatePR']);
      }
    });

    test('exact case tool name matching works', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [{ name: 'createPR' }]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::createPR']);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toEqual(['github.com::createPR']);
      }
    });
  });

  describe('invalid pattern format', () => {
    test('invalid pattern format (missing "::") returns error', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateToolPatterns(orgId, ['invalid-pattern']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid tool pattern format');
        expect(result.error).toContain('invalid-pattern');
        expect(result.error).toContain('::');
      }
    });

    test('invalid pattern with single colon returns error', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateToolPatterns(orgId, ['github.com:createPR']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid tool pattern format');
      }
    });
  });

  describe('unknown server errors', () => {
    test('unknown server key with suggestions provides helpful error', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [{ name: 'createPR' }]),
        createMockServer('Notion', 'https://api.notion.so/mcp', [{ name: 'createPage' }]),
      ]);

      const result = await validateToolPatterns(orgId, ['unknown.server.com::tool']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Unknown server "unknown.server.com"');
        expect(result.error).toContain('Available servers');
        expect(result.error).toContain('github.com');
        expect(result.error).toContain('api.notion.so');
      }
    });

    test('server friendly name used instead of serverKey returns helpful error', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [{ name: 'createPR' }]),
      ]);

      const result = await validateToolPatterns(orgId, ['GitHub MCP::createPR']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid serverKey "GitHub MCP"');
        expect(result.error).toContain('friendly display name');
        expect(result.error).toContain('github.com');
        expect(result.error).toContain('Correct pattern');
      }
    });

    test('no servers registered returns appropriate error', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateToolPatterns(orgId, ['github.com::createPR']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Unknown server "github.com"');
        expect(result.error).toContain('No MCP servers are registered');
      }
    });
  });

  describe('unknown tool errors', () => {
    test('unknown tool with similar tool suggestions provides helpful error', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'createPullRequest' },
          { name: 'createIssue' },
          { name: 'getFile' },
        ]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::createPR']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Unknown tool "createPR"');
        expect(result.error).toContain('github.com');
        // The implementation shows "Did you mean" only when findSimilarTools finds matches
        // Since "createPR" matches "createPullRequest" with word matching, it should show suggestions
        // If not, it shows "Available tools:" instead
        const hasSuggestions =
          result.error.includes('Did you mean') || result.error.includes('Available tools');
        expect(hasSuggestions).toBe(true);
        expect(result.error).toContain('createPullRequest');
      }
    });

    test('server exists but no tools registered returns appropriate error', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', []),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::createPR']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Unknown tool "createPR"');
        expect(result.error).toContain('No tools have been discovered');
      }
    });

    test('unknown tool shows available tools when no similar matches', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'alpha' },
          { name: 'beta' },
          { name: 'gamma' },
        ]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::zzzzzzz']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Unknown tool "zzzzzzz"');
        expect(result.error).toContain('Available tools');
      }
    });
  });

  describe('empty and multiple patterns', () => {
    test('empty tool patterns array validates successfully', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateToolPatterns(orgId, []);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toEqual([]);
      }
    });

    test('multiple valid patterns all pass', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'createPR' },
          { name: 'getFile' },
        ]),
        createMockServer('Notion', 'https://api.notion.so/mcp', [{ name: 'createPage' }]),
      ]);

      const result = await validateToolPatterns(orgId, [
        'github.com::createPR',
        'api.notion.so::createPage',
        '*::*',
      ]);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toHaveLength(3);
      }
    });

    test('multiple errors are joined with newlines', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [{ name: 'createPR' }]),
      ]);

      const result = await validateToolPatterns(orgId, [
        'invalid-format',
        'unknown.com::tool',
        'github.com::unknownTool',
      ]);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid tool pattern format');
        expect(result.error).toContain('Unknown server');
        expect(result.error).toContain('Unknown tool');
      }
    });
  });
});

// ============================================================================
// validateMatchersFormat Tests
// ============================================================================

describe('policyValidation: validateMatchersFormat', () => {
  describe('valid matchers', () => {
    test('valid "*" wildcard passes', () => {
      const result = validateMatchersFormat(['*']);
      expect(result.valid).toBe(true);
    });

    test('valid "user:email@example.com" passes', () => {
      const result = validateMatchersFormat(['user:john@example.com']);
      expect(result.valid).toBe(true);
    });

    test('valid "role:roleName" passes', () => {
      const result = validateMatchersFormat(['role:Admin']);
      expect(result.valid).toBe(true);
    });

    test('valid "agent:agentId" passes', () => {
      const result = validateMatchersFormat(['agent:my-agent-123']);
      expect(result.valid).toBe(true);
    });

    test('multiple valid matchers pass', () => {
      const result = validateMatchersFormat([
        '*',
        'user:alice@example.com',
        'role:Developer',
        'agent:test-agent',
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid matchers', () => {
    test('invalid format without prefix returns error with guidance', () => {
      const result = validateMatchersFormat(['invalid-matcher']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid matcher format: "invalid-matcher"');
        expect(result.error).toContain('Valid formats');
        expect(result.error).toContain('user:');
        expect(result.error).toContain('role:');
        expect(result.error).toContain('agent:');
      }
    });

    test('mixed valid and invalid matchers reports all invalid ones', () => {
      const result = validateMatchersFormat(['role:Admin', 'bad-matcher', 'user:test@example.com']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('bad-matcher');
        expect(result.error).not.toContain('role:Admin');
      }
    });

    test('unknown prefix returns error', () => {
      const result = validateMatchersFormat(['team:engineering']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid matcher format');
      }
    });

    test('multiple invalid matchers are all reported', () => {
      const result = validateMatchersFormat(['invalid1', 'invalid2', 'invalid3']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('invalid1');
        expect(result.error).toContain('invalid2');
        expect(result.error).toContain('invalid3');
      }
    });
  });
});

// ============================================================================
// validateMatchers (async with role existence check) Tests
// ============================================================================

import { validateMatchers } from '../../../../packages/api/src/services/policyValidation.js';

describe('policyValidation: validateMatchers (async)', () => {
  const orgId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock - some roles exist
    mockRoleFindMany.mockResolvedValue([
      { name: 'Admin' },
      { name: 'Developer' },
      { name: 'Viewer' },
    ]);
    // Default mock - some users exist
    mockUserFindMany.mockResolvedValue([
      { email: 'test@example.com' },
      { email: 'alice@example.com' },
    ]);
    // Default mock - some agents exist
    mockAgentFindMany.mockResolvedValue([
      { id: 'my-bot', name: 'My Bot' },
      { id: 'test-agent', name: 'Test Agent' },
    ]);
  });

  describe('role existence validation', () => {
    test('valid role that exists passes', async () => {
      const result = await validateMatchers(orgId, ['role:Admin']);
      expect(result.valid).toBe(true);
    });

    test('valid role with correct case passes', async () => {
      const result = await validateMatchers(orgId, ['role:Developer']);
      expect(result.valid).toBe(true);
    });

    test('non-existent role returns error with available roles', async () => {
      const result = await validateMatchers(orgId, ['role:SuperAdmin']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Role "SuperAdmin" does not exist');
        expect(result.error).toContain('Admin');
        expect(result.error).toContain('Developer');
        expect(result.error).toContain('Viewer');
      }
    });

    test('case mismatch role returns helpful error', async () => {
      const result = await validateMatchers(orgId, ['role:admin']); // lowercase

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('case mismatch');
        expect(result.error).toContain('Did you mean "Admin"');
      }
    });

    test('wildcard matcher does not require role check', async () => {
      const result = await validateMatchers(orgId, ['*']);
      expect(result.valid).toBe(true);
      // Should not have called role.findMany since no roles in matchers
      expect(mockRoleFindMany).not.toHaveBeenCalled();
    });

    test('user matcher does not require role check', async () => {
      const result = await validateMatchers(orgId, ['user:test@example.com']);
      expect(result.valid).toBe(true);
    });

    test('agent matcher does not require role check', async () => {
      const result = await validateMatchers(orgId, ['agent:my-bot']);
      expect(result.valid).toBe(true);
    });

    test('mixed matchers with valid role passes', async () => {
      const result = await validateMatchers(orgId, [
        '*',
        'user:test@example.com',
        'role:Admin',
        'agent:my-bot',
      ]);
      expect(result.valid).toBe(true);
    });

    test('mixed matchers with invalid role fails', async () => {
      const result = await validateMatchers(orgId, [
        '*',
        'user:test@example.com',
        'role:NonExistent',
        'agent:my-bot',
      ]);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Role "NonExistent" does not exist');
      }
    });

    test('no roles exist returns helpful error', async () => {
      mockRoleFindMany.mockResolvedValue([]);

      const result = await validateMatchers(orgId, ['role:Admin']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('No roles have been created');
      }
    });
  });

  describe('user existence validation', () => {
    test('valid user that exists passes', async () => {
      const result = await validateMatchers(orgId, ['user:test@example.com']);
      expect(result.valid).toBe(true);
    });

    test('non-existent user returns error with available users', async () => {
      const result = await validateMatchers(orgId, ['user:unknown@example.com']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('User "unknown@example.com" does not exist');
        expect(result.error).toContain('test@example.com');
        expect(result.error).toContain('alice@example.com');
      }
    });

    test('case mismatch user returns helpful error', async () => {
      const result = await validateMatchers(orgId, ['user:TEST@EXAMPLE.COM']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('case mismatch');
        expect(result.error).toContain('Did you mean "test@example.com"');
      }
    });

    test('no users exist returns helpful error', async () => {
      mockUserFindMany.mockResolvedValue([]);

      const result = await validateMatchers(orgId, ['user:test@example.com']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('No users have been created');
      }
    });

    test('user:* wildcard does not require user check', async () => {
      const result = await validateMatchers(orgId, ['user:*']);
      expect(result.valid).toBe(true);
    });
  });

  describe('agent existence validation', () => {
    test('valid agent that exists passes', async () => {
      const result = await validateMatchers(orgId, ['agent:my-bot']);
      expect(result.valid).toBe(true);
    });

    test('non-existent agent returns error with available agents', async () => {
      const result = await validateMatchers(orgId, ['agent:unknown-agent']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Agent "unknown-agent" does not exist');
        expect(result.error).toContain('my-bot');
        expect(result.error).toContain('My Bot');
      }
    });

    test('no agents exist returns helpful error', async () => {
      mockAgentFindMany.mockResolvedValue([]);

      const result = await validateMatchers(orgId, ['agent:some-agent']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('No agents have been registered');
      }
    });

    test('agent:* wildcard does not require agent check', async () => {
      const result = await validateMatchers(orgId, ['agent:*']);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// validateConditionFields Tests
// ============================================================================

describe('policyValidation: validateConditionFields', () => {
  const orgId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid conditions', () => {
    test('valid params.* field that exists in schema passes', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          {
            name: 'createPR',
            inputSchema: {
              type: 'object',
              properties: {
                repository: { type: 'string' },
                branch: { type: 'string' },
              },
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.repository', operator: 'equals', value: 'test-repo' }],
        ['github.com::createPR'],
      );

      expect(result.valid).toBe(true);
    });

    test('non-params conditions (context.*) pass without schema check', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'time.hourOfDay', operator: 'between', value: [9, 17] }],
        ['github.com::createPR'],
      );

      expect(result.valid).toBe(true);
    });

    test('wildcard tool patterns skip validation', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.any_field', operator: 'equals', value: 'test' }],
        ['*::*'],
      );

      expect(result.valid).toBe(true);
    });

    test('empty conditions array is valid', async () => {
      mockMcpServerFindMany.mockResolvedValue([]);

      const result = await validateConditionFields(orgId, [], ['github.com::createPR']);

      expect(result.valid).toBe(true);
    });

    test('no tool schemas found passes validation (lenient behavior)', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'createPR', inputSchema: null },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.repository', operator: 'equals', value: 'test' }],
        ['github.com::createPR'],
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('invalid conditions', () => {
    test('invalid params.* field with suggestions returns helpful error', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          {
            name: 'createPR',
            inputSchema: {
              type: 'object',
              properties: {
                repository: { type: 'string' },
                branch: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.repo', operator: 'equals', value: 'test' }],
        ['github.com::createPR'],
      );

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Invalid condition field "params.repo"');
        expect(result.error).toContain('Did you mean one of these?');
        expect(result.error).toContain('params.repository');
      }
    });

    test('nested object field paths work correctly', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('Notion', 'https://api.notion.so/mcp', [
          {
            name: 'createPage',
            inputSchema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    page_id: { type: 'string' },
                    title: { type: 'string' },
                  },
                },
              },
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.data.page_id', operator: 'equals', value: 'page-123' }],
        ['api.notion.so::createPage'],
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('array indexing notation', () => {
    test('array indexing notation (items.0.value matches items[*].value)', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('API Server', 'https://api.example.com/mcp', [
          {
            name: 'updateItems',
            inputSchema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.items.0.value', operator: 'equals', value: 'test' }],
        ['api.example.com::updateItems'],
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('schema path extraction', () => {
    test('extracts paths from simple object with properties', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('Test', 'https://test.com/mcp', [
          {
            name: 'simpleOp',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                count: { type: 'number' },
              },
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.name', operator: 'equals', value: 'test' }],
        ['test.com::simpleOp'],
      );

      expect(result.valid).toBe(true);
    });

    test('extracts paths from nested objects', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('Test', 'https://test.com/mcp', [
          {
            name: 'nestedOp',
            inputSchema: {
              type: 'object',
              properties: {
                outer: {
                  type: 'object',
                  properties: {
                    inner: {
                      type: 'object',
                      properties: {
                        deep: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.outer.inner.deep', operator: 'equals', value: 'test' }],
        ['test.com::nestedOp'],
      );

      expect(result.valid).toBe(true);
    });

    test('extracts paths from arrays with items', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('Test', 'https://test.com/mcp', [
          {
            name: 'arrayOp',
            inputSchema: {
              type: 'object',
              properties: {
                tags: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.tags.0.label', operator: 'equals', value: 'test' }],
        ['test.com::arrayOp'],
      );

      expect(result.valid).toBe(true);
    });

    test('extracts paths from anyOf/oneOf/allOf schemas', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('Test', 'https://test.com/mcp', [
          {
            name: 'unionOp',
            inputSchema: {
              type: 'object',
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    typeA: { type: 'string' },
                  },
                },
                {
                  type: 'object',
                  properties: {
                    typeB: { type: 'number' },
                  },
                },
              ],
            },
          },
        ]),
      ]);

      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.typeA', operator: 'equals', value: 'test' }],
        ['test.com::unionOp'],
      );

      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// validatePolicyInput Tests
// ============================================================================

describe('policyValidation: validatePolicyInput', () => {
  const orgId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpServerFindMany.mockResolvedValue([
      createMockServer('GitHub MCP', 'https://github.com/mcp', [
        {
          name: 'createPR',
          inputSchema: {
            type: 'object',
            properties: {
              repository: { type: 'string' },
            },
          },
        },
      ]),
    ]);
    // Mock roles for role existence validation
    mockRoleFindMany.mockResolvedValue([
      { name: 'Admin' },
      { name: 'Developer' },
      { name: 'Viewer' },
    ]);
    // Mock users for user existence validation
    mockUserFindMany.mockResolvedValue([
      { email: 'test@example.com' },
      { email: 'alice@example.com' },
    ]);
    // Mock agents for agent existence validation
    mockAgentFindMany.mockResolvedValue([
      { id: 'my-bot', name: 'My Bot' },
      { id: 'test-agent', name: 'Test Agent' },
    ]);
  });

  describe('create validation', () => {
    test('create requires effect, matchers, toolPatterns, description', async () => {
      const result = await validatePolicyInput(
        orgId,
        {
          effect: 'ALLOW',
          matchers: ['*'],
          toolPatterns: ['*::*'],
          description: 'Test policy',
        },
        true,
      );

      expect(result.validatedMatchers).toEqual(['*']);
      expect(result.validatedToolPatterns).toEqual(['*::*']);
    });

    test('create missing effect throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
          true,
        ),
      ).rejects.toThrow('Policy effect is required');
    });

    test('create missing matchers throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            effect: 'ALLOW',
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
          true,
        ),
      ).rejects.toThrow('Policy matchers is required');
    });

    test('create empty matchers array throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            effect: 'ALLOW',
            matchers: [],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
          true,
        ),
      ).rejects.toThrow('Policy matchers is required');
    });

    test('create missing toolPatterns throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            effect: 'ALLOW',
            matchers: ['*'],
            description: 'Test policy',
          },
          true,
        ),
      ).rejects.toThrow('Policy toolPatterns is required');
    });

    test('create empty toolPatterns array throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: [],
            description: 'Test policy',
          },
          true,
        ),
      ).rejects.toThrow('Policy toolPatterns is required');
    });

    test('create missing description throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
          },
          true,
        ),
      ).rejects.toThrow('Policy description is required');
    });

    test('create empty description throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: '   ',
          },
          true,
        ),
      ).rejects.toThrow('Policy description is required');
    });
  });

  describe('update validation', () => {
    test('update validates only provided fields', async () => {
      const result = await validatePolicyInput(
        orgId,
        {
          matchers: ['role:Admin'],
        },
        false,
      );

      expect(result.validatedMatchers).toEqual(['role:Admin']);
      expect(result.validatedToolPatterns).toBeUndefined();
    });

    test('update with invalid matchers throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            matchers: ['invalid-matcher'],
          },
          false,
        ),
      ).rejects.toThrow('Invalid matcher format');
    });

    test('update with invalid toolPatterns throws error', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            toolPatterns: ['unknown.server.com::tool'],
          },
          false,
        ),
      ).rejects.toThrow('Unknown server');
    });
  });

  describe('condition validation', () => {
    test('validates conditions when provided', async () => {
      const result = await validatePolicyInput(
        orgId,
        {
          effect: 'ALLOW',
          matchers: ['*'],
          toolPatterns: ['github.com::createPR'],
          description: 'Test policy',
          conditions: [{ field: 'params.repository', operator: 'equals', value: 'test' }],
        },
        true,
      );

      expect(result.validatedToolPatterns).toEqual(['github.com::createPR']);
    });

    test('throws error for invalid condition fields', async () => {
      await expect(
        validatePolicyInput(
          orgId,
          {
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['github.com::createPR'],
            description: 'Test policy',
            conditions: [{ field: 'params.nonexistent', operator: 'equals', value: 'test' }],
          },
          true,
        ),
      ).rejects.toThrow('Invalid condition field');
    });
  });

  describe('normalized patterns', () => {
    test('returns validated/normalized patterns', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [{ name: 'CreatePR' }]),
      ]);

      const result = await validatePolicyInput(
        orgId,
        {
          effect: 'ALLOW',
          matchers: ['*'],
          toolPatterns: ['github.com::createpr'],
          description: 'Test policy',
        },
        true,
      );

      expect(result.validatedToolPatterns).toEqual(['github.com::CreatePR']);
    });
  });
});

// ============================================================================
// Similar Tool/Path Suggestion Tests
// ============================================================================

describe('policyValidation: similar tool/path suggestions', () => {
  const orgId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findSimilarTools behavior', () => {
    test('finds exact case-insensitive matches', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'CreatePR' },
          { name: 'createIssue' },
        ]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::CREATEPR']);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.patterns).toEqual(['github.com::CreatePR']);
      }
    });

    test('finds substring matches for suggestions', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'createPullRequest' },
          { name: 'createIssue' },
          { name: 'deletePullRequest' },
        ]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::pullrequest']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Did you mean one of these?');
        expect(result.error).toContain('createPullRequest');
        expect(result.error).toContain('deletePullRequest');
      }
    });

    test('finds word-based matches for suggestions', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'create_pull_request' },
          { name: 'get_pull_request' },
          { name: 'delete_issue' },
        ]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::update_pull']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Did you mean one of these?');
      }
    });

    test('limits results to maxResults (5 by default)', async () => {
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('GitHub MCP', 'https://github.com/mcp', [
          { name: 'tool_create_1' },
          { name: 'tool_create_2' },
          { name: 'tool_create_3' },
          { name: 'tool_create_4' },
          { name: 'tool_create_5' },
          { name: 'tool_create_6' },
          { name: 'tool_create_7' },
        ]),
      ]);

      const result = await validateToolPatterns(orgId, ['github.com::create']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        const suggestions = result.error.match(/"tool_create_\d+"/g);
        expect(suggestions?.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('findSimilarPaths behavior', () => {
    test('finds similar paths based on final part match', async () => {
      // The isPathValidInSchema function allows prefix matching.
      // If "data" is a valid path, then "data.user_id" is considered valid
      // because it starts with "data.". So we need a schema where the
      // invalid path doesn't have any valid prefix.
      mockMcpServerFindMany.mockResolvedValue([
        createMockServer('API', 'https://api.example.com/mcp', [
          {
            name: 'updateData',
            inputSchema: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                userName: { type: 'string' },
                count: { type: 'number' },
              },
            },
          },
        ]),
      ]);

      // "user_id" does not match any of the top-level properties exactly
      // and no prefix matching applies here
      const result = await validateConditionFields(
        orgId,
        [{ field: 'params.user_id', operator: 'equals', value: 'test' }],
        ['api.example.com::updateData'],
      );

      expect(result.valid).toBe(false);
      if (!result.valid) {
        // The findSimilarPaths function looks for matches based on word overlap
        // "user_id" should match "userId" since they share overlapping parts
        // The error should contain either suggestions or available fields
        const hasSuggestions =
          result.error.includes('Did you mean') || result.error.includes('Available fields');
        expect(hasSuggestions).toBe(true);
        expect(result.error).toContain('userId');
      }
    });
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('policyValidation: edge cases', () => {
  const orgId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('handles server with port in URL correctly', async () => {
    mockMcpServerFindMany.mockResolvedValue([
      createMockServer('Local Server', 'http://localhost:3000/mcp', [{ name: 'testTool' }]),
    ]);

    const result = await validateToolPatterns(orgId, ['localhost:3000::testTool']);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.patterns).toEqual(['localhost:3000::testTool']);
    }
  });

  test('handles multiple servers with same hostname different ports', async () => {
    mockMcpServerFindMany.mockResolvedValue([
      createMockServer('Dev Server', 'http://localhost:3000/mcp', [{ name: 'devTool' }]),
      createMockServer('Prod Server', 'http://localhost:8080/mcp', [{ name: 'prodTool' }]),
    ]);

    const result = await validateToolPatterns(orgId, [
      'localhost:3000::devTool',
      'localhost:8080::prodTool',
    ]);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.patterns).toHaveLength(2);
    }
  });

  test('case-insensitive server key matching', async () => {
    mockMcpServerFindMany.mockResolvedValue([
      createMockServer('GitHub MCP', 'https://GITHUB.COM/mcp', [{ name: 'createPR' }]),
    ]);

    const result = await validateToolPatterns(orgId, ['github.com::createPR']);

    expect(result.valid).toBe(true);
  });

  test('handles schema with maximum depth limiting', async () => {
    const deeplyNestedSchema: Record<string, unknown> = {
      type: 'object',
      properties: {},
    };

    let current = deeplyNestedSchema.properties as Record<string, unknown>;
    for (let i = 0; i < 15; i++) {
      const nextLevel: Record<string, unknown> = {
        type: 'object',
        properties: {
          next: { type: 'string' },
        },
      };
      current[`level${i}`] = nextLevel;
      current = nextLevel.properties as Record<string, unknown>;
    }

    mockMcpServerFindMany.mockResolvedValue([
      createMockServer('Test', 'https://test.com/mcp', [
        { name: 'deepOp', inputSchema: deeplyNestedSchema },
      ]),
    ]);

    const result = await validateConditionFields(
      orgId,
      [{ field: 'params.level0.level1.level2', operator: 'equals', value: 'test' }],
      ['test.com::deepOp'],
    );

    expect(result.valid).toBe(true);
  });

  test('handles empty input schema gracefully', async () => {
    mockMcpServerFindMany.mockResolvedValue([
      createMockServer('Test', 'https://test.com/mcp', [{ name: 'emptyOp', inputSchema: {} }]),
    ]);

    const result = await validateConditionFields(
      orgId,
      [{ field: 'params.anything', operator: 'equals', value: 'test' }],
      ['test.com::emptyOp'],
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Could not find any fields');
    }
  });

  test('handles non-object input schema gracefully', async () => {
    mockMcpServerFindMany.mockResolvedValue([
      createMockServer('Test', 'https://test.com/mcp', [
        { name: 'primitiveOp', inputSchema: 'invalid' },
      ]),
    ]);

    const result = await validateConditionFields(
      orgId,
      [{ field: 'params.field', operator: 'equals', value: 'test' }],
      ['test.com::primitiveOp'],
    );

    // When inputSchema is not a valid object (like a string "invalid"),
    // extractSchemaPaths returns an empty set. Since no paths are found,
    // we fall into the error branch showing "Could not find any fields".
    // However, loadToolSchemas only adds tools where tool.inputSchema is truthy,
    // so with a string "invalid", it IS truthy and gets added, but extractSchemaPaths
    // returns empty. This triggers the "Could not find any fields" error.
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Could not find any fields');
    }
  });
});
