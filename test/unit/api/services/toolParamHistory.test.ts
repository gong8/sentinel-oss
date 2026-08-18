/**
 * Tool Parameter History Service Unit Tests
 * Tests for parameter value tracking and suggestion retrieval
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  _testing,
  cleanupAllOrgParamValues,
  cleanupOldParamValues,
  getParamHistory,
  getParamKeys,
  getParamKeysForServers,
  searchParamValues,
  trackParamValues,
} from '../../../../packages/api/src/services/toolParamHistory.js';

const { isSensitiveKey, flattenParameters, SENSITIVE_KEYS, MAX_VALUE_LENGTH } = _testing;

// ============================================================================
// Mock Setup
// ============================================================================

const { mockUpsert, mockFindMany, mockDeleteMany, mockOrgSettingsFindMany, mockOrgFindMany } =
  vi.hoisted(() => ({
    mockUpsert: vi.fn(),
    mockFindMany: vi.fn(),
    mockDeleteMany: vi.fn(),
    mockOrgSettingsFindMany: vi.fn(),
    mockOrgFindMany: vi.fn(),
  }));

vi.mock('@sentinel/db', () => ({
  prisma: {
    toolParamValue: {
      upsert: mockUpsert,
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
    },
    organizationSettings: {
      findMany: mockOrgSettingsFindMany,
    },
    organization: {
      findMany: mockOrgFindMany,
    },
  },
}));

// Mock logger to prevent console output during tests
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_ORG_ID = 'org-test-123';
const TEST_SERVER_ID = 'server-test-123';
const TEST_TOOL_NAME = 'test-server::test-tool';

// ============================================================================
// Utility Function Tests (No Database)
// ============================================================================

describe('toolParamHistory: isSensitiveKey', () => {
  test('detects password keys', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('userPassword')).toBe(true);
    expect(isSensitiveKey('PASSWORD')).toBe(true);
    expect(isSensitiveKey('old_password')).toBe(true);
  });

  test('detects secret keys', () => {
    expect(isSensitiveKey('secret')).toBe(true);
    expect(isSensitiveKey('clientSecret')).toBe(true);
    expect(isSensitiveKey('SECRET_KEY')).toBe(true);
  });

  test('detects token keys', () => {
    expect(isSensitiveKey('token')).toBe(true);
    expect(isSensitiveKey('accessToken')).toBe(true);
    expect(isSensitiveKey('refresh_token')).toBe(true);
  });

  test('detects key/credential variations', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('credential')).toBe(true);
    expect(isSensitiveKey('credentials')).toBe(true);
    expect(isSensitiveKey('privateKey')).toBe(true);
  });

  test('detects auth-related keys', () => {
    expect(isSensitiveKey('auth')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('bearer')).toBe(true);
  });

  test('detects session/cookie keys', () => {
    expect(isSensitiveKey('session')).toBe(true);
    expect(isSensitiveKey('sessionId')).toBe(true);
    expect(isSensitiveKey('cookie')).toBe(true);
  });

  test('allows non-sensitive keys', () => {
    expect(isSensitiveKey('query')).toBe(false);
    expect(isSensitiveKey('limit')).toBe(false);
    expect(isSensitiveKey('offset')).toBe(false);
    expect(isSensitiveKey('username')).toBe(false);
    expect(isSensitiveKey('email')).toBe(false);
    expect(isSensitiveKey('name')).toBe(false);
    expect(isSensitiveKey('path')).toBe(false);
    expect(isSensitiveKey('repository')).toBe(false);
  });

  test('all configured sensitive keys are detected', () => {
    for (const key of SENSITIVE_KEYS) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });
});

describe('toolParamHistory: flattenParameters', () => {
  test('flattens simple key-value pairs', () => {
    const params = {
      query: 'SELECT * FROM users',
      limit: 10,
    };

    const result = flattenParameters(params);

    expect(result).toContainEqual({ key: 'query', value: 'SELECT * FROM users' });
    expect(result).toContainEqual({ key: 'limit', value: '10' });
  });

  test('flattens nested objects with dot notation', () => {
    const params = {
      user: {
        name: 'John',
        age: 30,
      },
    };

    const result = flattenParameters(params);

    expect(result).toContainEqual({ key: 'user.name', value: 'John' });
    expect(result).toContainEqual({ key: 'user.age', value: '30' });
  });

  test('handles deeply nested objects', () => {
    const params = {
      config: {
        database: {
          host: 'localhost',
          port: 5432,
        },
      },
    };

    const result = flattenParameters(params);

    expect(result).toContainEqual({ key: 'config.database.host', value: 'localhost' });
    expect(result).toContainEqual({ key: 'config.database.port', value: '5432' });
  });

  test('handles arrays by tracking each element', () => {
    const params = {
      ids: [1, 2, 3],
      tags: ['important', 'review'],
    };

    const result = flattenParameters(params);

    expect(result).toContainEqual({ key: 'ids', value: '1' });
    expect(result).toContainEqual({ key: 'ids', value: '2' });
    expect(result).toContainEqual({ key: 'ids', value: '3' });
    expect(result).toContainEqual({ key: 'tags', value: 'important' });
    expect(result).toContainEqual({ key: 'tags', value: 'review' });
  });

  test('skips sensitive keys', () => {
    const params = {
      query: 'SELECT * FROM users',
      password: 'secret123',
      token: 'abc123',
      apiKey: 'key-xyz',
    };

    const result = flattenParameters(params);

    expect(result).toContainEqual({ key: 'query', value: 'SELECT * FROM users' });
    expect(result.find((r) => r.key === 'password')).toBeUndefined();
    expect(result.find((r) => r.key === 'token')).toBeUndefined();
    expect(result.find((r) => r.key === 'apiKey')).toBeUndefined();
  });

  test('skips sensitive keys in nested objects', () => {
    const params = {
      config: {
        username: 'admin',
        password: 'secret123',
      },
    };

    const result = flattenParameters(params);

    expect(result).toContainEqual({ key: 'config.username', value: 'admin' });
    expect(result.find((r) => r.key === 'config.password')).toBeUndefined();
  });

  test('skips null and undefined values', () => {
    const params = {
      name: 'John',
      age: null,
      email: undefined,
    };

    const result = flattenParameters(params);

    expect(result).toHaveLength(1);
    expect(result).toContainEqual({ key: 'name', value: 'John' });
  });

  test('skips values exceeding max length', () => {
    const longValue = 'x'.repeat(MAX_VALUE_LENGTH + 1);
    const shortValue = 'y'.repeat(MAX_VALUE_LENGTH);

    const params = {
      long: longValue,
      short: shortValue,
    };

    const result = flattenParameters(params);

    expect(result.find((r) => r.key === 'long')).toBeUndefined();
    expect(result).toContainEqual({ key: 'short', value: shortValue });
  });

  test('handles boolean values', () => {
    const params = {
      enabled: true,
      disabled: false,
    };

    const result = flattenParameters(params);

    expect(result).toContainEqual({ key: 'enabled', value: 'true' });
    expect(result).toContainEqual({ key: 'disabled', value: 'false' });
  });

  test('handles empty objects', () => {
    const result = flattenParameters({});
    expect(result).toHaveLength(0);
  });

  test('handles nested arrays with objects', () => {
    const params = {
      items: [{ name: 'item1' }, { name: 'item2' }],
    };

    const result = flattenParameters(params);

    // Objects in arrays should be recursively processed with [] notation
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ key: 'items[].name', value: 'item1' });
    expect(result).toContainEqual({ key: 'items[].name', value: 'item2' });
  });

  test('handles deeply nested arrays with objects', () => {
    const params = {
      pages: [
        {
          parent: {
            page_id: 'abc123',
          },
        },
        {
          parent: {
            page_id: 'def456',
          },
        },
      ],
    };

    const result = flattenParameters(params);

    // Deeply nested values should use [] notation for array items
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ key: 'pages[].parent.page_id', value: 'abc123' });
    expect(result).toContainEqual({ key: 'pages[].parent.page_id', value: 'def456' });
  });
});

// ============================================================================
// Tracking Tests (Database Mocked)
// ============================================================================

describe('toolParamHistory: trackParamValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({});
  });

  test('tracks simple parameters', async () => {
    await trackParamValues({
      organizationId: TEST_ORG_ID,
      serverId: TEST_SERVER_ID,
      toolName: TEST_TOOL_NAME,
      parameters: {
        query: 'SELECT * FROM users',
      },
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_serverId_parameterKey_parameterValue: {
            organizationId: TEST_ORG_ID,
            serverId: TEST_SERVER_ID,
            parameterKey: 'query',
            parameterValue: 'SELECT * FROM users',
          },
        },
        create: expect.objectContaining({
          organizationId: TEST_ORG_ID,
          serverId: TEST_SERVER_ID,
          toolName: TEST_TOOL_NAME,
          parameterKey: 'query',
          parameterValue: 'SELECT * FROM users',
          occurrenceCount: 1,
        }),
        update: expect.objectContaining({
          occurrenceCount: { increment: 1 },
        }),
      }),
    );
  });

  test('tracks multiple parameters in parallel', async () => {
    await trackParamValues({
      organizationId: TEST_ORG_ID,
      serverId: TEST_SERVER_ID,
      toolName: TEST_TOOL_NAME,
      parameters: {
        query: 'SELECT * FROM users',
        limit: 10,
        offset: 0,
      },
    });

    expect(mockUpsert).toHaveBeenCalledTimes(3);
  });

  test('skips tracking when no parameters', async () => {
    await trackParamValues({
      organizationId: TEST_ORG_ID,
      serverId: TEST_SERVER_ID,
      toolName: TEST_TOOL_NAME,
      parameters: {},
    });

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test('skips tracking for only sensitive parameters', async () => {
    await trackParamValues({
      organizationId: TEST_ORG_ID,
      serverId: TEST_SERVER_ID,
      toolName: TEST_TOOL_NAME,
      parameters: {
        password: 'secret',
        token: 'abc123',
      },
    });

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test('does not throw on database error and returns failure status', async () => {
    mockUpsert.mockRejectedValue(new Error('Database error'));

    // Should not throw, but should return failure status
    const result = await trackParamValues({
      organizationId: TEST_ORG_ID,
      serverId: TEST_SERVER_ID,
      toolName: TEST_TOOL_NAME,
      parameters: { query: 'test' },
    });
    expect(result).toEqual({ success: false });
  });
});

// ============================================================================
// Suggestion Tests (Database Mocked)
// ============================================================================

describe('toolParamHistory: getParamHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns suggestions sorted by most recently used', async () => {
    const mockValues = [
      {
        parameterValue: 'value1',
        displayLabel: null,
        occurrenceCount: 10,
        lastSeenAt: new Date('2024-01-15'),
      },
      {
        parameterValue: 'value2',
        displayLabel: null,
        occurrenceCount: 5,
        lastSeenAt: new Date('2024-01-14'),
      },
    ];
    mockFindMany.mockResolvedValue(mockValues);

    const result = await getParamHistory(TEST_ORG_ID, TEST_SERVER_ID, 'query');

    expect(result).toEqual([
      {
        value: 'value1',
        displayLabel: null,
        occurrenceCount: 10,
        lastSeenAt: new Date('2024-01-15'),
      },
      {
        value: 'value2',
        displayLabel: null,
        occurrenceCount: 5,
        lastSeenAt: new Date('2024-01-14'),
      },
    ]);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: TEST_ORG_ID,
          serverId: TEST_SERVER_ID,
          parameterKey: 'query',
        },
        orderBy: [{ lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
      }),
    );
  });

  test('respects custom limit', async () => {
    mockFindMany.mockResolvedValue([]);

    await getParamHistory(TEST_ORG_ID, TEST_SERVER_ID, 'query', 10);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
      }),
    );
  });

  test('returns empty array when no history', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getParamHistory(TEST_ORG_ID, TEST_SERVER_ID, 'nonexistent');

    expect(result).toEqual([]);
  });
});

describe('toolParamHistory: searchParamValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('searches by prefix', async () => {
    const mockValues = [
      {
        parameterValue: 'SELECT * FROM users',
        displayLabel: null,
        occurrenceCount: 5,
        lastSeenAt: new Date(),
      },
      {
        parameterValue: 'SELECT * FROM orders',
        displayLabel: null,
        occurrenceCount: 3,
        lastSeenAt: new Date(),
      },
    ];
    mockFindMany.mockResolvedValue(mockValues);

    const result = await searchParamValues(TEST_ORG_ID, TEST_SERVER_ID, 'query', 'SELECT');

    expect(result).toHaveLength(2);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: TEST_ORG_ID,
          serverId: TEST_SERVER_ID,
          parameterKey: 'query',
          OR: [
            {
              parameterValue: {
                startsWith: 'SELECT',
                mode: 'insensitive',
              },
            },
            {
              displayLabel: {
                contains: 'SELECT',
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
    );
  });
});

describe('toolParamHistory: getParamKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns unique parameter keys for a server', async () => {
    mockFindMany.mockResolvedValue([
      { parameterKey: 'limit' },
      { parameterKey: 'offset' },
      { parameterKey: 'query' },
    ]);

    const result = await getParamKeys(TEST_ORG_ID, TEST_SERVER_ID);

    expect(result).toEqual(['limit', 'offset', 'query']);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: TEST_ORG_ID,
          serverId: TEST_SERVER_ID,
        },
        distinct: ['parameterKey'],
      }),
    );
  });
});

describe('toolParamHistory: getParamKeysForServers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns keys for multiple servers', async () => {
    mockFindMany.mockResolvedValue([
      { serverId: 'server-1', parameterKey: 'query' },
      { serverId: 'server-1', parameterKey: 'limit' },
      { serverId: 'server-2', parameterKey: 'page_id' },
    ]);

    const result = await getParamKeysForServers(TEST_ORG_ID, ['server-1', 'server-2']);

    expect(result).toEqual([
      { serverId: 'server-1', parameterKey: 'query' },
      { serverId: 'server-1', parameterKey: 'limit' },
      { serverId: 'server-2', parameterKey: 'page_id' },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: TEST_ORG_ID,
          serverId: { in: ['server-1', 'server-2'] },
        },
        distinct: ['serverId', 'parameterKey'],
      }),
    );
  });
});

// ============================================================================
// Cleanup Tests (Database Mocked)
// ============================================================================

describe('toolParamHistory: cleanupOldParamValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('deletes values older than retention period', async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 });

    const result = await cleanupOldParamValues(TEST_ORG_ID, 30);

    expect(result).toBe(5);
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: TEST_ORG_ID,
          lastSeenAt: expect.objectContaining({
            lt: expect.any(Date),
          }),
        }),
      }),
    );

    // Verify the cutoff date is approximately 30 days ago
    const callArg = mockDeleteMany.mock.calls[0][0] as {
      where: { lastSeenAt: { lt: Date } };
    };
    const cutoffDate = callArg.where.lastSeenAt.lt;
    const expectedCutoff = new Date('2024-01-15T00:00:00Z');
    expectedCutoff.setDate(expectedCutoff.getDate() - 30);

    // Allow for timezone differences (within 1 day)
    const diffInHours =
      Math.abs(cutoffDate.getTime() - expectedCutoff.getTime()) / (1000 * 60 * 60);
    expect(diffInHours).toBeLessThan(24);
  });

  test('returns 0 when nothing to delete', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await cleanupOldParamValues(TEST_ORG_ID, 90);

    expect(result).toBe(0);
  });
});

describe('toolParamHistory: cleanupAllOrgParamValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('cleans up all orgs with their settings', async () => {
    mockOrgSettingsFindMany.mockResolvedValue([
      { organizationId: 'org-1', paramHistoryRetentionDays: 30 },
      { organizationId: 'org-2', paramHistoryRetentionDays: 60 },
    ]);
    mockOrgFindMany.mockResolvedValue([{ id: 'org-3' }]);
    mockDeleteMany
      .mockResolvedValueOnce({ count: 10 })
      .mockResolvedValueOnce({ count: 5 })
      .mockResolvedValueOnce({ count: 3 });

    const result = await cleanupAllOrgParamValues();

    expect(result).toEqual({
      'org-1': 10,
      'org-2': 5,
      'org-3': 3,
    });

    // Verify cleanup was called for each org
    expect(mockDeleteMany).toHaveBeenCalledTimes(3);
  });

  test('uses default retention for orgs without settings', async () => {
    mockOrgSettingsFindMany.mockResolvedValue([]);
    mockOrgFindMany.mockResolvedValue([{ id: 'org-no-settings' }]);
    mockDeleteMany.mockResolvedValue({ count: 2 });

    await cleanupAllOrgParamValues();

    // Should use 90 day default retention
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-no-settings',
          lastSeenAt: expect.objectContaining({
            lt: expect.any(Date),
          }),
        }),
      }),
    );

    // Verify the cutoff date is approximately 90 days ago
    const callArg = mockDeleteMany.mock.calls[0][0] as {
      where: { lastSeenAt: { lt: Date } };
    };
    const cutoffDate = callArg.where.lastSeenAt.lt;
    const expectedCutoff = new Date('2024-01-15T00:00:00Z');
    expectedCutoff.setDate(expectedCutoff.getDate() - 90);

    // Allow for timezone differences (within 1 day)
    const diffInHours =
      Math.abs(cutoffDate.getTime() - expectedCutoff.getTime()) / (1000 * 60 * 60);
    expect(diffInHours).toBeLessThan(24);
  });
});
