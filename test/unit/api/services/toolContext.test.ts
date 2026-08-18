/**
 * Tool Context Service Unit Tests
 * Tests for context extraction from tool invocations (isolated, no database)
 */

import { describe, expect, test } from 'vitest';
import {
  _testing,
  buildEvaluationContext,
  getAvailableContextFields,
  registerContextProvider,
  type ContextProvider,
  type ToolContextInput,
} from '../../../../packages/api/src/services/toolContext.js';

// Type for the context with extracted categories
type ExtractedContext = ReturnType<typeof buildEvaluationContext> & {
  sql?: {
    sqlOperation?: string;
    sqlTables?: string[];
    hasSqlComment?: boolean;
  };
  github?: {
    gitRepository?: string;
    gitBranch?: string;
    gitOwner?: string;
    isProtectedBranch?: boolean;
  };
  file?: {
    filePath?: string;
    fileExtension?: string;
    isSensitivePath?: boolean;
  };
};

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockInput(overrides: Partial<ToolContextInput> = {}): ToolContextInput {
  return {
    organizationId: 'org-1',
    toolName: 'test-tool',
    parameters: {},
    sourceIp: '192.168.1.100',
    timestamp: new Date('2024-01-15T14:30:00Z'),
    ...overrides,
  };
}

// ============================================================================
// Base Context Building
// ============================================================================

describe('toolContext: buildEvaluationContext basics', () => {
  test('creates base context with time information', () => {
    const input = createMockInput({
      timestamp: new Date('2024-01-15T14:30:00Z'), // Monday, 2pm UTC
    });

    const context = buildEvaluationContext(input);

    expect(context.time.hourOfDay).toBe(14);
    expect(context.time.dayOfWeek).toBe(1); // Monday
    expect(context.time.timestamp).toBeInstanceOf(Date);
  });

  test('includes source IP when provided', () => {
    const input = createMockInput({
      sourceIp: '10.0.0.1',
    });

    const context = buildEvaluationContext(input);

    expect(context.network.sourceIp).toBe('10.0.0.1');
  });

  test('passes through parameters', () => {
    const input = createMockInput({
      parameters: {
        query: 'SELECT * FROM users',
        limit: 10,
      },
    });

    const context = buildEvaluationContext(input);

    expect(context.params.query).toBe('SELECT * FROM users');
    expect(context.params.limit).toBe(10);
  });

  test('uses current time when timestamp not provided', () => {
    const input = createMockInput();
    delete input.timestamp;

    const before = new Date();
    const context = buildEvaluationContext(input);
    const after = new Date();

    expect(context.time.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(context.time.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ============================================================================
// SQL Context Extractor
// ============================================================================

describe('toolContext: SQL extractor', () => {
  test('extracts SELECT operation', () => {
    const input = createMockInput({
      toolName: 'database-query',
      parameters: { query: 'SELECT * FROM users WHERE id = 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('SELECT');
  });

  test('extracts INSERT operation', () => {
    const input = createMockInput({
      toolName: 'postgres-execute',
      parameters: { sql: 'INSERT INTO users (name, email) VALUES (?, ?)' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('INSERT');
  });

  test('extracts UPDATE operation', () => {
    const input = createMockInput({
      toolName: 'mysql-query',
      parameters: { statement: 'UPDATE users SET name = ? WHERE id = ?' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('UPDATE');
  });

  test('extracts DELETE operation', () => {
    const input = createMockInput({
      toolName: 'db-command',
      parameters: { command: 'DELETE FROM users WHERE id = 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('DELETE');
  });

  test('extracts table names from FROM clause', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users WHERE id = 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlTables).toContain('users');
  });

  test('extracts table names from JOIN clauses', () => {
    const input = createMockInput({
      toolName: 'query-tool',
      parameters: { query: 'SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlTables).toContain('users');
    expect(context.sql?.sqlTables).toContain('orders');
  });

  test('extracts table name from INSERT INTO', () => {
    const input = createMockInput({
      toolName: 'database-tool',
      parameters: { query: 'INSERT INTO audit_logs (action, user_id) VALUES (?, ?)' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlTables).toContain('audit_logs');
  });

  test('detects SQL comments (injection indicator)', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users -- WHERE id = 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.hasSqlComment).toBe(true);
  });

  test('detects block comments', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users /* comment */ WHERE id = 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.hasSqlComment).toBe(true);
  });

  test('no SQL comment flag when clean query', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users WHERE id = 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.hasSqlComment).toBe(false);
  });

  test('handles DDL operations', () => {
    const createInput = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'CREATE TABLE test (id INT PRIMARY KEY)' },
    });
    expect((buildEvaluationContext(createInput) as ExtractedContext).sql?.sqlOperation).toBe(
      'CREATE',
    );

    const dropInput = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'DROP TABLE test' },
    });
    expect((buildEvaluationContext(dropInput) as ExtractedContext).sql?.sqlOperation).toBe('DROP');

    const alterInput = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'ALTER TABLE test ADD COLUMN name VARCHAR(100)' },
    });
    expect((buildEvaluationContext(alterInput) as ExtractedContext).sql?.sqlOperation).toBe(
      'ALTER',
    );

    const truncateInput = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'TRUNCATE TABLE test' },
    });
    expect((buildEvaluationContext(truncateInput) as ExtractedContext).sql?.sqlOperation).toBe(
      'TRUNCATE',
    );
  });

  test('does not extract for non-SQL tools', () => {
    const input = createMockInput({
      toolName: 'send-email',
      parameters: { query: 'SELECT * FROM users' }, // Has query but wrong tool
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    // sql extractor shouldn't trigger for email tool
    expect(context.sql?.sqlOperation).toBeUndefined();
  });
});

// ============================================================================
// GitHub Context Extractor
// ============================================================================

describe('toolContext: GitHub extractor', () => {
  test('extracts repository name', () => {
    const input = createMockInput({
      toolName: 'github-api',
      parameters: { repository: 'my-project' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.gitRepository).toBe('my-project');
  });

  test('extracts owner and repo from combined format', () => {
    const input = createMockInput({
      toolName: 'git-tool',
      parameters: { repo: 'acme-corp/api-server' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.gitOwner).toBe('acme-corp');
    expect(context.github?.gitRepository).toBe('api-server');
  });

  test('extracts owner separately', () => {
    const input = createMockInput({
      toolName: 'repo-manager',
      parameters: { owner: 'my-org', repository: 'my-repo' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.gitOwner).toBe('my-org');
    expect(context.github?.gitRepository).toBe('my-repo');
  });

  test('extracts branch name', () => {
    const input = createMockInput({
      toolName: 'github-api',
      parameters: { branch: 'feature/new-feature' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.gitBranch).toBe('feature/new-feature');
  });

  test('detects protected branch: main', () => {
    const input = createMockInput({
      toolName: 'git-tool',
      parameters: { ref: 'main' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.isProtectedBranch).toBe(true);
  });

  test('detects protected branch: master', () => {
    const input = createMockInput({
      toolName: 'git-tool',
      parameters: { branch: 'master' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.isProtectedBranch).toBe(true);
  });

  test('detects protected branch: production', () => {
    const input = createMockInput({
      toolName: 'git-tool',
      parameters: { branchName: 'production' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.isProtectedBranch).toBe(true);
  });

  test('detects protected branch: release/*', () => {
    const input = createMockInput({
      toolName: 'git-tool',
      parameters: { branch: 'release/v2.0.0' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.isProtectedBranch).toBe(true);
  });

  test('detects protected branch: hotfix/*', () => {
    const input = createMockInput({
      toolName: 'git-tool',
      parameters: { branch: 'hotfix/urgent-fix' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.isProtectedBranch).toBe(true);
  });

  test('feature branch is not protected', () => {
    const input = createMockInput({
      toolName: 'github-api',
      parameters: { branch: 'feature/new-feature' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.isProtectedBranch).toBe(false);
  });

  test('does not extract for non-GitHub tools', () => {
    const input = createMockInput({
      toolName: 'email-sender',
      parameters: { branch: 'main' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.gitBranch).toBeUndefined();
  });
});

// ============================================================================
// File Context Extractor
// ============================================================================

describe('toolContext: File extractor', () => {
  test('extracts file path', () => {
    const input = createMockInput({
      toolName: 'file-reader',
      parameters: { path: '/home/user/document.txt' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.filePath).toBe('/home/user/document.txt');
  });

  test('extracts file extension', () => {
    const input = createMockInput({
      toolName: 'read-file',
      parameters: { filePath: '/var/log/app.log' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.fileExtension).toBe('log');
  });

  test('handles files without extension', () => {
    const input = createMockInput({
      toolName: 'file-tool',
      parameters: { file: '/etc/hosts' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.filePath).toBe('/etc/hosts');
    expect(context.file?.fileExtension).toBeUndefined();
  });

  test('detects sensitive path: .env', () => {
    const input = createMockInput({
      toolName: 'fs-read',
      parameters: { path: '/project/.env' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.isSensitivePath).toBe(true);
  });

  test('detects sensitive path: .ssh', () => {
    const input = createMockInput({
      toolName: 'read-file',
      parameters: { filename: '/home/user/.ssh/id_rsa' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.isSensitivePath).toBe(true);
  });

  test('detects sensitive path: credentials', () => {
    const input = createMockInput({
      toolName: 'file-tool',
      parameters: { path: '/etc/credentials.json' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.isSensitivePath).toBe(true);
  });

  test('detects sensitive path: secrets', () => {
    const input = createMockInput({
      toolName: 'path-reader',
      parameters: { path: '/app/secrets/api-key.txt' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.isSensitivePath).toBe(true);
  });

  test('regular path is not sensitive', () => {
    const input = createMockInput({
      toolName: 'file-reader',
      parameters: { path: '/home/user/documents/report.pdf' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.isSensitivePath).toBe(false);
  });

  test('does not extract for non-file tools', () => {
    const input = createMockInput({
      toolName: 'api-caller',
      parameters: { path: '/api/users' }, // path but not file tool
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.file?.filePath).toBeUndefined();
  });

  test('returns empty context when no path parameter is provided', () => {
    const input = createMockInput({
      toolName: 'file-reader', // matches file tool pattern
      parameters: { content: 'some content' }, // no path parameter
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    // File extractor should return empty context (early return at line 228)
    expect(context.file).toBeUndefined();
  });
});

// ============================================================================
// Tool Pattern Matching
// ============================================================================

describe('toolContext: tool pattern matching', () => {
  test('matches exact tool name', () => {
    const input = createMockInput({
      toolName: 'sql-query',
      parameters: { query: 'SELECT 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('SELECT');
  });

  test('matches wildcard pattern', () => {
    // Should match *sql* pattern
    const input = createMockInput({
      toolName: 'my-sql-executor',
      parameters: { query: 'SELECT 1' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('SELECT');
  });

  test('case-insensitive tool name matching', () => {
    const input = createMockInput({
      toolName: 'GitHub-API',
      parameters: { branch: 'main' },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.github?.gitBranch).toBe('main');
  });
});

// ============================================================================
// Multiple Extractors
// ============================================================================

describe('toolContext: multiple extractors', () => {
  test('applies multiple extractors when tool matches multiple patterns', () => {
    // Tool name matches both 'git' and 'file' patterns
    const input = createMockInput({
      toolName: 'git-file-reader',
      parameters: {
        branch: 'main',
        path: '/project/.env',
      },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    // Should have both github and file context
    expect(context.github?.gitBranch).toBe('main');
    expect(context.file?.filePath).toBe('/project/.env');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('toolContext: edge cases', () => {
  test('handles empty parameters', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: {},
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.params).toEqual({});
    expect(context.sql?.sqlOperation).toBeUndefined();
  });

  test('handles null parameter values', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: null as unknown as string },
    });

    const context = buildEvaluationContext(input) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBeUndefined();
  });

  test('handles non-string parameters', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 12345 as unknown as string },
    });

    const context = buildEvaluationContext(input);

    // Should convert to string and process
    expect(context.params.query).toBe(12345);
  });

  test('handles missing sourceIp', () => {
    const input = createMockInput();
    delete input.sourceIp;

    const context = buildEvaluationContext(input);

    expect(context.network.sourceIp).toBeUndefined();
  });
});

// ============================================================================
// Context Provider Registration (covers line 289)
// ============================================================================

describe('toolContext: registerContextProvider', () => {
  test('registers a new context provider', () => {
    const customProvider: ContextProvider = {
      name: 'custom-test-provider',
      category: 'custom',
      toolPatterns: ['custom-*'],
      extract: (input: ToolContextInput) => ({
        customField: input.parameters.customParam,
      }),
    };

    // Register the provider
    registerContextProvider(customProvider);

    // Verify it works by building context for a matching tool
    const input = createMockInput({
      toolName: 'custom-tool',
      parameters: { customParam: 'test-value' },
    });

    const context = buildEvaluationContext(input);
    expect((context as Record<string, unknown>).custom).toEqual({
      customField: 'test-value',
    });
  });

  test('replaces existing provider with same name', () => {
    const originalProvider: ContextProvider = {
      name: 'replaceable-provider',
      category: 'replaceable',
      toolPatterns: ['replaceable-*'],
      extract: () => ({ version: 'v1' }),
    };

    const replacementProvider: ContextProvider = {
      name: 'replaceable-provider',
      category: 'replaceable',
      toolPatterns: ['replaceable-*'],
      extract: () => ({ version: 'v2' }),
    };

    // Register original
    registerContextProvider(originalProvider);

    // Register replacement with same name
    registerContextProvider(replacementProvider);

    // Verify the replacement is used
    const input = createMockInput({
      toolName: 'replaceable-tool',
      parameters: {},
    });

    const context = buildEvaluationContext(input);
    expect((context as Record<string, unknown>).replaceable).toEqual({
      version: 'v2',
    });
  });
});

// ============================================================================
// Context Provider Error Handling (covers line 348)
// ============================================================================

describe('toolContext: provider error handling', () => {
  test('continues with other providers when one throws an error', () => {
    const errorProvider: ContextProvider = {
      name: 'error-provider',
      category: 'error',
      toolPatterns: ['error-*', '*-multi-*'],
      extract: () => {
        throw new Error('Provider extraction failed');
      },
    };

    const workingProvider: ContextProvider = {
      name: 'working-provider',
      category: 'working',
      toolPatterns: ['*-multi-*'],
      extract: () => ({ status: 'success' }),
    };

    // Register both providers
    registerContextProvider(errorProvider);
    registerContextProvider(workingProvider);

    // Use a tool that matches both providers
    const input = createMockInput({
      toolName: 'test-multi-tool',
      parameters: {},
    });

    // Should not throw, should continue with working provider
    const context = buildEvaluationContext(input);

    // The working provider's data should still be present
    expect((context as Record<string, unknown>).working).toEqual({
      status: 'success',
    });

    // Base context should still be intact
    expect(context.time.hourOfDay).toBeDefined();
  });

  test('handles error provider gracefully without affecting base context', () => {
    const errorOnlyProvider: ContextProvider = {
      name: 'error-only-provider',
      category: 'erroronly',
      toolPatterns: ['error-only-*'],
      extract: () => {
        throw new Error('Always fails');
      },
    };

    registerContextProvider(errorOnlyProvider);

    const testTimestamp = new Date('2024-06-15T10:30:00Z');
    const input = createMockInput({
      toolName: 'error-only-tool',
      parameters: { someParam: 'value' },
      sourceIp: '10.0.0.1',
      timestamp: testTimestamp,
    });

    const context = buildEvaluationContext(input);

    // Base context should still be intact
    expect(context.network.sourceIp).toBe('10.0.0.1');
    // Use the same timestamp to get the expected hour (local time)
    expect(context.time.hourOfDay).toBe(testTimestamp.getHours());
    expect(context.params.someParam).toBe('value');
  });
});

// ============================================================================
// getAvailableContextFields (covers lines 368-420)
// ============================================================================

describe('toolContext: getAvailableContextFields', () => {
  test('returns base context fields for any tool pattern', () => {
    const fields = getAvailableContextFields(['unknown-tool']);

    const contextCategory = fields.find((f) => f.category === 'context');
    expect(contextCategory).toBeDefined();
    expect(contextCategory?.fields).toContain('hourOfDay');
    expect(contextCategory?.fields).toContain('dayOfWeek');
    expect(contextCategory?.fields).toContain('timestamp');
    expect(contextCategory?.fields).toContain('sourceIp');
  });

  test('returns SQL fields for sql-matching tool patterns', () => {
    const fields = getAvailableContextFields(['sql-tool', 'database-query']);

    const sqlCategory = fields.find((f) => f.category === 'sql');
    expect(sqlCategory).toBeDefined();
    expect(sqlCategory?.fields).toContain('sqlOperation');
    expect(sqlCategory?.fields).toContain('sqlTables');
    expect(sqlCategory?.fields).toContain('hasSqlComment');
  });

  test('returns GitHub fields for git-matching tool patterns', () => {
    const fields = getAvailableContextFields(['github-api', 'git-push']);

    const githubCategory = fields.find((f) => f.category === 'github');
    expect(githubCategory).toBeDefined();
    expect(githubCategory?.fields).toContain('gitRepository');
    expect(githubCategory?.fields).toContain('gitBranch');
    expect(githubCategory?.fields).toContain('gitOwner');
    expect(githubCategory?.fields).toContain('isProtectedBranch');
  });

  test('returns file fields for file-matching tool patterns', () => {
    const fields = getAvailableContextFields(['file-reader', 'read-document']);

    const fileCategory = fields.find((f) => f.category === 'file');
    expect(fileCategory).toBeDefined();
    expect(fileCategory?.fields).toContain('filePath');
    expect(fileCategory?.fields).toContain('fileExtension');
    expect(fileCategory?.fields).toContain('isSensitivePath');
  });

  test('returns multiple categories for tools matching multiple patterns', () => {
    // A tool pattern that could match both git and file
    const fields = getAvailableContextFields(['git-file-tool']);

    const categoryNames = fields.map((f) => f.category);
    expect(categoryNames).toContain('context');
    expect(categoryNames).toContain('github');
    expect(categoryNames).toContain('file');
  });

  test('handles wildcard tool patterns', () => {
    const fields = getAvailableContextFields(['*']);

    // Should get context fields at minimum
    const contextCategory = fields.find((f) => f.category === 'context');
    expect(contextCategory).toBeDefined();
  });

  test('handles empty tool patterns array', () => {
    const fields = getAvailableContextFields([]);

    // Should still return base context fields
    const contextCategory = fields.find((f) => f.category === 'context');
    expect(contextCategory).toBeDefined();
    expect(contextCategory?.fields.length).toBe(4);
  });

  test('does not duplicate categories when multiple patterns match same provider', () => {
    const fields = getAvailableContextFields(['sql-tool', 'database-query', 'postgres-exec']);

    const sqlCategories = fields.filter((f) => f.category === 'sql');
    expect(sqlCategories.length).toBe(1);
  });
});

// ============================================================================
// getProviderFields (covers lines 411-422)
// ============================================================================

describe('toolContext: getProviderFields via _testing', () => {
  test('returns correct fields for sql provider', () => {
    const fields = _testing.getProviderFields('sql');
    expect(fields).toEqual(['sqlOperation', 'sqlTables', 'hasSqlComment']);
  });

  test('returns correct fields for github provider', () => {
    const fields = _testing.getProviderFields('github');
    expect(fields).toEqual(['gitRepository', 'gitBranch', 'gitOwner', 'isProtectedBranch']);
  });

  test('returns correct fields for file provider', () => {
    const fields = _testing.getProviderFields('file');
    expect(fields).toEqual(['filePath', 'fileExtension', 'isSensitivePath']);
  });

  test('returns empty array for unknown provider', () => {
    const fields = _testing.getProviderFields('unknown-provider');
    expect(fields).toEqual([]);
  });
});

// ============================================================================
// matchToolPattern utility (additional coverage)
// ============================================================================

describe('toolContext: matchToolPattern via _testing', () => {
  test('matches wildcard * pattern', () => {
    expect(_testing.matchToolPattern('anything', '*')).toBe(true);
  });

  test('matches exact pattern', () => {
    expect(_testing.matchToolPattern('sql-tool', 'sql-tool')).toBe(true);
  });

  test('matches glob pattern with asterisk', () => {
    expect(_testing.matchToolPattern('database-query', '*query*')).toBe(true);
    expect(_testing.matchToolPattern('my-sql-tool', '*sql*')).toBe(true);
  });

  test('matches glob pattern with question mark', () => {
    expect(_testing.matchToolPattern('sql1', 'sql?')).toBe(true);
    expect(_testing.matchToolPattern('sqlA', 'sql?')).toBe(true);
  });

  test('is case insensitive', () => {
    expect(_testing.matchToolPattern('SQL-TOOL', 'sql-tool')).toBe(true);
    expect(_testing.matchToolPattern('sql-tool', 'SQL-TOOL')).toBe(true);
  });

  test('does not match when pattern does not apply', () => {
    expect(_testing.matchToolPattern('email-sender', '*sql*')).toBe(false);
    expect(_testing.matchToolPattern('api-caller', '*github*')).toBe(false);
  });

  test('escapes special regex characters in pattern', () => {
    // These characters should be treated literally, not as regex
    expect(_testing.matchToolPattern('test.tool', 'test.tool')).toBe(true);
    expect(_testing.matchToolPattern('tesXtool', 'test.tool')).toBe(false); // . should not match X
  });
});

// ============================================================================
// getParamString utility (additional coverage)
// ============================================================================

describe('toolContext: getParamString via _testing', () => {
  test('returns string value directly', () => {
    const params = { key: 'value' };
    expect(_testing.getParamString(params, 'key')).toBe('value');
  });

  test('returns undefined for null value', () => {
    const params = { key: null };
    expect(_testing.getParamString(params, 'key')).toBeUndefined();
  });

  test('returns undefined for undefined value', () => {
    const params = { key: undefined };
    expect(_testing.getParamString(params, 'key')).toBeUndefined();
  });

  test('returns undefined for missing key', () => {
    const params = {};
    expect(_testing.getParamString(params, 'missing')).toBeUndefined();
  });

  test('converts number to string', () => {
    const params = { key: 123 };
    expect(_testing.getParamString(params, 'key')).toBe('123');
  });

  test('converts boolean to string', () => {
    const params = { key: true };
    expect(_testing.getParamString(params, 'key')).toBe('true');
  });

  test('converts object to string', () => {
    const params = { key: { nested: 'value' } };
    expect(_testing.getParamString(params, 'key')).toBe('[object Object]');
  });
});

// ============================================================================
// getApplicableProviders (additional coverage)
// ============================================================================

describe('toolContext: getApplicableProviders via _testing', () => {
  test('returns sql provider for sql-matching tools', () => {
    const providers = _testing.getApplicableProviders('sql-executor');
    expect(providers.some((p) => p.name === 'sql')).toBe(true);
  });

  test('returns github provider for git-matching tools', () => {
    const providers = _testing.getApplicableProviders('github-api');
    expect(providers.some((p) => p.name === 'github')).toBe(true);
  });

  test('returns file provider for file-matching tools', () => {
    const providers = _testing.getApplicableProviders('file-reader');
    expect(providers.some((p) => p.name === 'file')).toBe(true);
  });

  test('returns empty array for non-matching tools', () => {
    const providers = _testing.getApplicableProviders('email-sender');
    // Should not match any of the built-in providers
    const builtInNames = ['sql', 'github', 'file'];
    const matchedBuiltIns = providers.filter((p) => builtInNames.includes(p.name));
    expect(matchedBuiltIns.length).toBe(0);
  });

  test('returns multiple providers when tool matches multiple patterns', () => {
    const providers = _testing.getApplicableProviders('git-file-reader');
    expect(providers.some((p) => p.name === 'github')).toBe(true);
    expect(providers.some((p) => p.name === 'file')).toBe(true);
  });
});

// ============================================================================
// buildEvaluationContextWithOverrides (covers lines 479-537)
// ============================================================================

import { buildEvaluationContextWithOverrides } from '../../../../packages/api/src/services/toolContext.js';

describe('toolContext: buildEvaluationContextWithOverrides', () => {
  // -------------------------------------------------------------------------
  // Timestamp Override Parsing (lines 479-483)
  // -------------------------------------------------------------------------

  test('uses provided timestamp override when available', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      timestamp: new Date('2024-01-01T00:00:00Z'),
    });

    const context = buildEvaluationContextWithOverrides(input, {
      timestamp: '2024-06-15T14:30:00Z',
    });

    // Should use the override timestamp, not the input timestamp
    expect(context.time.timestamp.toISOString()).toBe('2024-06-15T14:30:00.000Z');
  });

  test('uses input timestamp when no override provided', () => {
    const inputTimestamp = new Date('2024-03-20T10:00:00Z');
    const input = createMockInput({
      toolName: 'test-tool',
      timestamp: inputTimestamp,
    });

    const context = buildEvaluationContextWithOverrides(input, undefined);

    expect(context.time.timestamp).toEqual(inputTimestamp);
  });

  test('uses current time when neither override nor input timestamp provided', () => {
    const input = createMockInput({
      toolName: 'test-tool',
    });
    delete input.timestamp;

    const before = new Date();
    const context = buildEvaluationContextWithOverrides(input, undefined);
    const after = new Date();

    expect(context.time.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(context.time.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test('handles invalid timestamp override gracefully', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      timestamp: new Date('2024-01-01T00:00:00Z'),
    });

    const context = buildEvaluationContextWithOverrides(input, {
      timestamp: 'invalid-date-string',
    });

    // Invalid Date is still a Date object, but isNaN for its time value
    expect(context.time.timestamp instanceof Date).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Context Overrides (lines 486-494)
  // -------------------------------------------------------------------------

  test('applies hourOfDay override', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      timestamp: new Date('2024-01-15T08:00:00Z'), // 8 AM UTC
    });

    const context = buildEvaluationContextWithOverrides(input, {
      hourOfDay: 22, // Override to 10 PM
    });

    expect(context.time.hourOfDay).toBe(22);
  });

  test('applies dayOfWeek override', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      timestamp: new Date('2024-01-15T08:00:00Z'), // Monday
    });

    const context = buildEvaluationContextWithOverrides(input, {
      dayOfWeek: 0, // Override to Sunday
    });

    expect(context.time.dayOfWeek).toBe(0);
  });

  test('applies sourceIp override', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      sourceIp: '192.168.1.1',
    });

    const context = buildEvaluationContextWithOverrides(input, {
      sourceIp: '10.0.0.50',
    });

    expect(context.network.sourceIp).toBe('10.0.0.50');
  });

  test('uses input sourceIp when no override provided', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      sourceIp: '192.168.1.1',
    });

    const context = buildEvaluationContextWithOverrides(input, undefined);

    expect(context.network.sourceIp).toBe('192.168.1.1');
  });

  test('applies all context overrides together', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      sourceIp: '10.0.0.1',
      timestamp: new Date('2024-01-15T12:00:00Z'),
    });

    const context = buildEvaluationContextWithOverrides(input, {
      hourOfDay: 3,
      dayOfWeek: 6,
      sourceIp: '172.16.0.1',
      timestamp: '2024-12-25T00:00:00Z',
    });

    expect(context.time.hourOfDay).toBe(3);
    expect(context.time.dayOfWeek).toBe(6);
    expect(context.network.sourceIp).toBe('172.16.0.1');
    expect(context.time.timestamp.toISOString()).toBe('2024-12-25T00:00:00.000Z');
  });

  test('preserves parameters in context', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: {
        query: 'SELECT * FROM users',
        limit: 100,
      },
    });

    const context = buildEvaluationContextWithOverrides(input, {
      hourOfDay: 12,
    });

    expect(context.params.query).toBe('SELECT * FROM users');
    expect(context.params.limit).toBe(100);
  });

  // -------------------------------------------------------------------------
  // Manual Mode (lines 497-507)
  // -------------------------------------------------------------------------

  test('uses manual extracted context when mode is manual with sql context', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users' }, // Would auto-extract differently
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        sql: {
          sqlOperation: 'DELETE',
          sqlTables: ['sensitive_data'],
          hasSqlComment: true,
        },
      },
      'manual',
    ) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('DELETE');
    expect(context.sql?.sqlTables).toEqual(['sensitive_data']);
    expect(context.sql?.hasSqlComment).toBe(true);
  });

  test('uses manual extracted context when mode is manual with github context', () => {
    const input = createMockInput({
      toolName: 'github-api',
      parameters: { branch: 'feature' }, // Would auto-extract differently
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        github: {
          gitRepository: 'manual-repo',
          gitBranch: 'production',
          gitOwner: 'manual-owner',
          isProtectedBranch: true,
        },
      },
      'manual',
    ) as ExtractedContext;

    expect(context.github?.gitRepository).toBe('manual-repo');
    expect(context.github?.gitBranch).toBe('production');
    expect(context.github?.gitOwner).toBe('manual-owner');
    expect(context.github?.isProtectedBranch).toBe(true);
  });

  test('uses manual extracted context when mode is manual with file context', () => {
    const input = createMockInput({
      toolName: 'file-reader',
      parameters: { path: '/safe/path.txt' }, // Would auto-extract differently
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        file: {
          filePath: '/etc/secrets/key.pem',
          fileExtension: 'pem',
          isSensitivePath: true,
        },
      },
      'manual',
    ) as ExtractedContext;

    expect(context.file?.filePath).toBe('/etc/secrets/key.pem');
    expect(context.file?.fileExtension).toBe('pem');
    expect(context.file?.isSensitivePath).toBe(true);
  });

  test('uses manual extracted context with multiple categories', () => {
    const input = createMockInput({
      toolName: 'git-file-tool',
      parameters: {},
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        sql: { sqlOperation: 'INSERT' },
        github: { gitBranch: 'main', isProtectedBranch: true },
        file: { filePath: '/test', isSensitivePath: false },
      },
      'manual',
    ) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('INSERT');
    expect(context.github?.gitBranch).toBe('main');
    expect(context.file?.filePath).toBe('/test');
  });

  test('ignores extractedContext when mode is not manual', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        sql: {
          sqlOperation: 'DELETE', // This should be ignored
          sqlTables: ['manual_table'],
        },
      },
      'auto', // Not manual mode
    ) as ExtractedContext;

    // Should auto-extract SELECT, not use the manual DELETE
    expect(context.sql?.sqlOperation).toBe('SELECT');
  });

  test('handles empty extractedContext in manual mode', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {}, // Empty extracted context
      'manual',
    ) as ExtractedContext;

    // Should have no extracted context
    expect(context.sql).toBeUndefined();
    expect(context.github).toBeUndefined();
    expect(context.file).toBeUndefined();
  });

  test('falls through to auto mode when extractedContext is undefined even if mode is manual', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'SELECT * FROM users' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined, // No extracted context
      'manual', // Mode is manual but extractedContext is undefined
    ) as ExtractedContext;

    // With undefined extractedContext, the condition (extractedMode === 'manual' && extractedContext)
    // is false, so it falls through to auto-extraction
    expect(context.sql?.sqlOperation).toBe('SELECT');
    expect(context.sql?.sqlTables).toContain('users');
  });

  // -------------------------------------------------------------------------
  // Auto Mode (lines 509-534)
  // -------------------------------------------------------------------------

  test('auto-extracts sql context in auto mode', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'UPDATE users SET name = ? WHERE id = 1' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      'auto',
    ) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('UPDATE');
    expect(context.sql?.sqlTables).toContain('users');
  });

  test('auto-extracts github context in auto mode', () => {
    const input = createMockInput({
      toolName: 'github-api',
      parameters: { branch: 'main', repository: 'acme/app' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      'auto',
    ) as ExtractedContext;

    expect(context.github?.gitBranch).toBe('main');
    expect(context.github?.gitOwner).toBe('acme');
    expect(context.github?.gitRepository).toBe('app');
    expect(context.github?.isProtectedBranch).toBe(true);
  });

  test('auto-extracts file context in auto mode', () => {
    const input = createMockInput({
      toolName: 'file-reader',
      parameters: { path: '/home/.ssh/id_rsa' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      'auto',
    ) as ExtractedContext;

    expect(context.file?.filePath).toBe('/home/.ssh/id_rsa');
    expect(context.file?.isSensitivePath).toBe(true);
  });

  test('auto mode is default when extractedMode is undefined', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'DELETE FROM logs' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      undefined, // No mode specified
    ) as ExtractedContext;

    // Should auto-extract
    expect(context.sql?.sqlOperation).toBe('DELETE');
  });

  test('auto-extracts from multiple providers for matching tool', () => {
    const input = createMockInput({
      toolName: 'git-file-reader', // Matches both git and file patterns
      parameters: {
        branch: 'release/v1.0',
        path: '/app/config.yml',
      },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      'auto',
    ) as ExtractedContext;

    expect(context.github?.gitBranch).toBe('release/v1.0');
    expect(context.github?.isProtectedBranch).toBe(true);
    expect(context.file?.filePath).toBe('/app/config.yml');
    expect(context.file?.fileExtension).toBe('yml');
  });

  // -------------------------------------------------------------------------
  // Error Handling in Auto Mode (lines 527-533)
  // -------------------------------------------------------------------------

  test('handles provider extraction error in auto mode gracefully', () => {
    // Register a provider that throws
    const errorProvider: ContextProvider = {
      name: 'override-error-provider',
      category: 'override-error',
      toolPatterns: ['override-error-*'],
      extract: () => {
        throw new Error('Extraction failed in override test');
      },
    };

    registerContextProvider(errorProvider);

    const input = createMockInput({
      toolName: 'override-error-tool',
      parameters: { data: 'test' },
      sourceIp: '10.0.0.1',
    });

    // Should not throw, should continue gracefully
    const context = buildEvaluationContextWithOverrides(
      input,
      { hourOfDay: 15 },
      undefined,
      'auto',
    );

    // Base context should be intact
    expect(context.time.hourOfDay).toBe(15);
    expect(context.network.sourceIp).toBe('10.0.0.1');
    expect(context.params.data).toBe('test');
  });

  test('continues with other providers after one fails in auto mode', () => {
    // Register a failing provider and ensure built-in providers still work
    const anotherErrorProvider: ContextProvider = {
      name: 'another-error-provider',
      category: 'another-error',
      toolPatterns: ['*-combined-*'],
      extract: () => {
        throw new Error('Another extraction failure');
      },
    };

    registerContextProvider(anotherErrorProvider);

    // Tool matches both the error provider and sql provider
    const input = createMockInput({
      toolName: 'sql-combined-tool',
      parameters: { query: 'SELECT * FROM products' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      'auto',
    ) as ExtractedContext;

    // SQL extraction should still work
    expect(context.sql?.sqlOperation).toBe('SELECT');
    expect(context.sql?.sqlTables).toContain('products');
  });

  // -------------------------------------------------------------------------
  // Combined Overrides and Extraction
  // -------------------------------------------------------------------------

  test('combines context overrides with auto-extracted context', () => {
    const input = createMockInput({
      toolName: 'sql-tool',
      parameters: { query: 'INSERT INTO orders VALUES (1, 2)' },
      sourceIp: '192.168.1.1',
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      {
        hourOfDay: 2,
        dayOfWeek: 0,
        sourceIp: '10.10.10.10',
      },
      undefined,
      'auto',
    ) as ExtractedContext;

    // Overridden base context
    expect(context.time.hourOfDay).toBe(2);
    expect(context.time.dayOfWeek).toBe(0);
    expect(context.network.sourceIp).toBe('10.10.10.10');

    // Auto-extracted SQL context
    expect(context.sql?.sqlOperation).toBe('INSERT');
    expect(context.sql?.sqlTables).toContain('orders');
  });

  test('combines context overrides with manual extracted context', () => {
    const input = createMockInput({
      toolName: 'generic-tool',
      parameters: {},
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      {
        hourOfDay: 23,
        sourceIp: '172.16.0.1',
      },
      {
        github: { gitBranch: 'hotfix/urgent', isProtectedBranch: true },
      },
      'manual',
    ) as ExtractedContext;

    // Overridden base context
    expect(context.time.hourOfDay).toBe(23);
    expect(context.network.sourceIp).toBe('172.16.0.1');

    // Manual extracted context
    expect(context.github?.gitBranch).toBe('hotfix/urgent');
    expect(context.github?.isProtectedBranch).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  test('handles partial sql extractedContext in manual mode', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      parameters: {},
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        sql: { sqlOperation: 'SELECT' }, // Only operation, no tables or comment flag
      },
      'manual',
    ) as ExtractedContext;

    expect(context.sql?.sqlOperation).toBe('SELECT');
    expect(context.sql?.sqlTables).toBeUndefined();
    expect(context.sql?.hasSqlComment).toBeUndefined();
  });

  test('handles partial github extractedContext in manual mode', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      parameters: {},
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        github: { gitBranch: 'develop' }, // Only branch, no other fields
      },
      'manual',
    ) as ExtractedContext;

    expect(context.github?.gitBranch).toBe('develop');
    expect(context.github?.gitRepository).toBeUndefined();
    expect(context.github?.isProtectedBranch).toBeUndefined();
  });

  test('handles partial file extractedContext in manual mode', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      parameters: {},
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      {
        file: { isSensitivePath: true }, // Only sensitive flag
      },
      'manual',
    ) as ExtractedContext;

    expect(context.file?.isSensitivePath).toBe(true);
    expect(context.file?.filePath).toBeUndefined();
    expect(context.file?.fileExtension).toBeUndefined();
  });

  test('handles zero values in context overrides', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      timestamp: new Date('2024-06-15T14:30:00Z'),
    });

    const context = buildEvaluationContextWithOverrides(input, {
      hourOfDay: 0, // Midnight
      dayOfWeek: 0, // Sunday
    });

    expect(context.time.hourOfDay).toBe(0);
    expect(context.time.dayOfWeek).toBe(0);
  });

  test('handles empty string sourceIp override', () => {
    const input = createMockInput({
      toolName: 'test-tool',
      sourceIp: '192.168.1.1',
    });

    const context = buildEvaluationContextWithOverrides(input, {
      sourceIp: '',
    });

    expect(context.network.sourceIp).toBe('');
  });

  test('handles non-matching tool with auto mode', () => {
    const input = createMockInput({
      toolName: 'email-sender', // Doesn't match any provider
      parameters: { to: 'test@example.com' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      'auto',
    ) as ExtractedContext;

    // No provider-specific context should be extracted
    expect(context.sql).toBeUndefined();
    expect(context.github).toBeUndefined();
    expect(context.file).toBeUndefined();

    // But params should still be preserved
    expect(context.params.to).toBe('test@example.com');
  });

  test('merges extracted context into existing category object', () => {
    // This tests the logic where categoryObj already exists
    const input = createMockInput({
      toolName: 'database-query-tool', // Matches both *database* and *query*
      parameters: { query: 'SELECT id, name FROM customers' },
    });

    const context = buildEvaluationContextWithOverrides(
      input,
      undefined,
      undefined,
      'auto',
    ) as ExtractedContext;

    // The sql provider should be applied once and create the category
    expect(context.sql?.sqlOperation).toBe('SELECT');
    expect(context.sql?.sqlTables).toContain('customers');
  });
});
