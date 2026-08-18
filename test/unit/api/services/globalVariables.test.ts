/**
 * Global Variables Service Unit Tests
 * Tests for global variable management: validation, serialization, and loading
 */

import type { GlobalVariableFieldType } from '@sentinel/db';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks to avoid initialization order issues
const { mockNamespaceFindMany } = vi.hoisted(() => ({
  mockNamespaceFindMany: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    globalVariableNamespace: {
      findMany: mockNamespaceFindMany,
    },
  },
  GlobalVariableFieldType: {
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    DATE: 'DATE',
    STRING_ARRAY: 'STRING_ARRAY',
    NUMBER_ARRAY: 'NUMBER_ARRAY',
  },
}));

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  GLOBAL_VARIABLE_RESERVED_NAMES,
  loadGlobalVariablesForOrg,
  serializeFieldValue,
  validateFieldName,
  validateFieldValue,
  validateNamespaceName,
} from '../../../../packages/api/src/services/globalVariables.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Namespace Name Validation Tests
// ============================================================================

describe('globalVariables: validateNamespaceName', () => {
  describe('valid namespace names', () => {
    test('accepts uppercase letters only', () => {
      const result = validateNamespaceName('COMPANY');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts uppercase letters with numbers', () => {
      const result = validateNamespaceName('CONFIG2');
      expect(result.valid).toBe(true);
    });

    test('accepts uppercase letters with underscores', () => {
      const result = validateNamespaceName('MY_COMPANY');
      expect(result.valid).toBe(true);
    });

    test('accepts complex valid names', () => {
      const result = validateNamespaceName('ORG_SETTINGS_V2');
      expect(result.valid).toBe(true);
    });

    test('accepts single uppercase letter', () => {
      const result = validateNamespaceName('A');
      expect(result.valid).toBe(true);
    });

    test('accepts 50 character name (max length)', () => {
      const name = 'A'.repeat(50);
      const result = validateNamespaceName(name);
      expect(result.valid).toBe(true);
    });
  });

  describe('reserved namespace names', () => {
    test('rejects "context" (case-insensitive)', () => {
      const result = validateNamespaceName('CONTEXT');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved namespace name');
      expect(result.error).toContain('context');
    });

    test('rejects "params"', () => {
      const result = validateNamespaceName('PARAMS');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    test('rejects "sql"', () => {
      const result = validateNamespaceName('SQL');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    test('rejects "github"', () => {
      const result = validateNamespaceName('GITHUB');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    });

    test('rejects "file"', () => {
      const result = validateNamespaceName('FILE');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved');
    });
  });

  describe('invalid namespace names', () => {
    test('rejects lowercase letters', () => {
      const result = validateNamespaceName('company');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('uppercase');
    });

    test('rejects mixed case', () => {
      const result = validateNamespaceName('Company');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('uppercase');
    });

    test('rejects names starting with number', () => {
      const result = validateNamespaceName('2CONFIG');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with a letter');
    });

    test('rejects names starting with underscore', () => {
      const result = validateNamespaceName('_CONFIG');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with a letter');
    });

    test('rejects names with special characters', () => {
      const result = validateNamespaceName('MY-CONFIG');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, and underscores');
    });

    test('rejects names with spaces', () => {
      const result = validateNamespaceName('MY CONFIG');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, and underscores');
    });

    test('rejects names exceeding 50 characters', () => {
      const name = 'A'.repeat(51);
      const result = validateNamespaceName(name);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50 characters or less');
    });

    test('rejects empty string', () => {
      const result = validateNamespaceName('');
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// Field Name Validation Tests
// ============================================================================

describe('globalVariables: validateFieldName', () => {
  describe('valid field names', () => {
    test('accepts camelCase names', () => {
      const result = validateFieldName('creationDate');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('accepts snake_case names', () => {
      const result = validateFieldName('creation_date');
      expect(result.valid).toBe(true);
    });

    test('accepts PascalCase names', () => {
      const result = validateFieldName('CreationDate');
      expect(result.valid).toBe(true);
    });

    test('accepts lowercase only', () => {
      const result = validateFieldName('date');
      expect(result.valid).toBe(true);
    });

    test('accepts uppercase only', () => {
      const result = validateFieldName('DATE');
      expect(result.valid).toBe(true);
    });

    test('accepts names with numbers', () => {
      const result = validateFieldName('value2');
      expect(result.valid).toBe(true);
    });

    test('accepts single letter', () => {
      const result = validateFieldName('x');
      expect(result.valid).toBe(true);
    });

    test('accepts 50 character name (max length)', () => {
      const name = 'a'.repeat(50);
      const result = validateFieldName(name);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid field names', () => {
    test('rejects names starting with number', () => {
      const result = validateFieldName('2value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with a letter');
    });

    test('rejects names starting with underscore', () => {
      const result = validateFieldName('_value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with a letter');
    });

    test('rejects names with hyphens', () => {
      const result = validateFieldName('my-value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, and underscores');
    });

    test('rejects names with spaces', () => {
      const result = validateFieldName('my value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, and underscores');
    });

    test('rejects names with special characters', () => {
      const result = validateFieldName('value@test');
      expect(result.valid).toBe(false);
    });

    test('rejects names exceeding 50 characters', () => {
      const name = 'a'.repeat(51);
      const result = validateFieldName(name);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50 characters or less');
    });

    test('rejects empty string', () => {
      const result = validateFieldName('');
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// Field Value Validation Tests
// ============================================================================

describe('globalVariables: validateFieldValue', () => {
  describe('STRING type', () => {
    const type: GlobalVariableFieldType = 'STRING';

    test('accepts string value', () => {
      const result = validateFieldValue('hello', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('hello');
    });

    test('accepts empty string', () => {
      const result = validateFieldValue('', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('');
    });

    test('rejects number value', () => {
      const result = validateFieldValue(123, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('rejects boolean value', () => {
      const result = validateFieldValue(true, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('rejects null value', () => {
      const result = validateFieldValue(null, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('rejects undefined value', () => {
      const result = validateFieldValue(undefined, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('rejects array value', () => {
      const result = validateFieldValue(['a', 'b'], type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });
  });

  describe('NUMBER type', () => {
    const type: GlobalVariableFieldType = 'NUMBER';

    test('accepts integer value', () => {
      const result = validateFieldValue(42, type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(42);
    });

    test('accepts float value', () => {
      const result = validateFieldValue(3.14, type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(3.14);
    });

    test('accepts zero', () => {
      const result = validateFieldValue(0, type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(0);
    });

    test('accepts negative number', () => {
      const result = validateFieldValue(-5, type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(-5);
    });

    test('accepts string number and converts it', () => {
      const result = validateFieldValue('123', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(123);
    });

    test('accepts string float and converts it', () => {
      const result = validateFieldValue('3.14', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(3.14);
    });

    test('rejects non-numeric string', () => {
      const result = validateFieldValue('hello', type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    test('rejects NaN', () => {
      const result = validateFieldValue(NaN, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    test('rejects boolean value', () => {
      const result = validateFieldValue(true, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    test('rejects null value', () => {
      const result = validateFieldValue(null, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a number');
    });
  });

  describe('BOOLEAN type', () => {
    const type: GlobalVariableFieldType = 'BOOLEAN';

    test('accepts true', () => {
      const result = validateFieldValue(true, type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(true);
    });

    test('accepts false', () => {
      const result = validateFieldValue(false, type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(false);
    });

    test('accepts string "true" and converts it', () => {
      const result = validateFieldValue('true', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(true);
    });

    test('accepts string "false" and converts it', () => {
      const result = validateFieldValue('false', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(false);
    });

    test('rejects string "TRUE" (case sensitive)', () => {
      const result = validateFieldValue('TRUE', type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a boolean');
    });

    test('rejects number 1', () => {
      const result = validateFieldValue(1, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a boolean');
    });

    test('rejects number 0', () => {
      const result = validateFieldValue(0, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a boolean');
    });

    test('rejects string "yes"', () => {
      const result = validateFieldValue('yes', type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a boolean');
    });

    test('rejects null value', () => {
      const result = validateFieldValue(null, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a boolean');
    });
  });

  describe('DATE type', () => {
    const type: GlobalVariableFieldType = 'DATE';

    test('accepts Date object', () => {
      const date = new Date('2024-01-15');
      const result = validateFieldValue(date, type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual(date);
    });

    test('accepts ISO date string and converts it', () => {
      const result = validateFieldValue('2024-01-15T00:00:00.000Z', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBeInstanceOf(Date);
      expect((result.normalizedValue as Date).toISOString()).toBe('2024-01-15T00:00:00.000Z');
    });

    test('accepts partial date string and converts it', () => {
      const result = validateFieldValue('2024-01-15', type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBeInstanceOf(Date);
    });

    test('rejects invalid date string', () => {
      const result = validateFieldValue('not-a-date', type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid date');
    });

    test('rejects invalid Date object', () => {
      const result = validateFieldValue(new Date('invalid'), type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid date');
    });

    test('rejects number value', () => {
      const result = validateFieldValue(1234567890, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid date');
    });

    test('rejects null value', () => {
      const result = validateFieldValue(null, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid date');
    });
  });

  describe('STRING_ARRAY type', () => {
    const type: GlobalVariableFieldType = 'STRING_ARRAY';

    test('accepts array of strings', () => {
      const result = validateFieldValue(['a', 'b', 'c'], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual(['a', 'b', 'c']);
    });

    test('accepts empty array', () => {
      const result = validateFieldValue([], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual([]);
    });

    test('accepts single element array', () => {
      const result = validateFieldValue(['one'], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual(['one']);
    });

    test('rejects non-array value', () => {
      const result = validateFieldValue('string', type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an array of strings');
    });

    test('rejects array with non-string elements', () => {
      const result = validateFieldValue(['a', 1, 'c'], type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('All array elements must be strings');
    });

    test('rejects array with null elements', () => {
      const result = validateFieldValue(['a', null, 'c'], type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('All array elements must be strings');
    });

    test('rejects null value', () => {
      const result = validateFieldValue(null, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an array');
    });
  });

  describe('NUMBER_ARRAY type', () => {
    const type: GlobalVariableFieldType = 'NUMBER_ARRAY';

    test('accepts array of numbers', () => {
      const result = validateFieldValue([1, 2, 3], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual([1, 2, 3]);
    });

    test('accepts empty array', () => {
      const result = validateFieldValue([], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual([]);
    });

    test('accepts array with floats', () => {
      const result = validateFieldValue([1.5, 2.7, 3.9], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual([1.5, 2.7, 3.9]);
    });

    test('accepts array with string numbers and converts them', () => {
      const result = validateFieldValue(['1', '2', '3'], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual([1, 2, 3]);
    });

    test('accepts mixed number and string number array', () => {
      const result = validateFieldValue([1, '2', 3.5, '4.5'], type);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toEqual([1, 2, 3.5, 4.5]);
    });

    test('rejects non-array value', () => {
      const result = validateFieldValue(123, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an array of numbers');
    });

    test('rejects array with non-numeric strings', () => {
      const result = validateFieldValue([1, 'hello', 3], type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('All array elements must be numbers');
    });

    test('rejects array with boolean elements', () => {
      const result = validateFieldValue([1, true, 3], type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('All array elements must be numbers');
    });

    test('rejects array with null elements', () => {
      const result = validateFieldValue([1, null, 3], type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('All array elements must be numbers');
    });

    test('rejects null value', () => {
      const result = validateFieldValue(null, type);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an array');
    });
  });

  describe('unknown type', () => {
    test('rejects unknown field type', () => {
      const result = validateFieldValue('value', 'UNKNOWN' as GlobalVariableFieldType);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown field type');
    });
  });
});

// ============================================================================
// Field Value Serialization Tests
// ============================================================================

describe('globalVariables: serializeFieldValue', () => {
  test('serializes string value as-is', () => {
    const result = serializeFieldValue('hello', 'STRING');
    expect(result).toBe('hello');
  });

  test('serializes number value as-is', () => {
    const result = serializeFieldValue(42, 'NUMBER');
    expect(result).toBe(42);
  });

  test('serializes boolean value as-is', () => {
    const result = serializeFieldValue(true, 'BOOLEAN');
    expect(result).toBe(true);
  });

  test('serializes Date to ISO string', () => {
    const date = new Date('2024-01-15T12:00:00.000Z');
    const result = serializeFieldValue(date, 'DATE');
    expect(result).toBe('2024-01-15T12:00:00.000Z');
  });

  test('serializes string array as-is', () => {
    const value = ['a', 'b', 'c'];
    const result = serializeFieldValue(value, 'STRING_ARRAY');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  test('serializes number array as-is', () => {
    const value = [1, 2, 3];
    const result = serializeFieldValue(value, 'NUMBER_ARRAY');
    expect(result).toEqual([1, 2, 3]);
  });

  test('handles non-Date value for DATE type gracefully', () => {
    // If value is already a string (not a Date), it passes through
    const result = serializeFieldValue('2024-01-15' as unknown as Date, 'DATE');
    expect(result).toBe('2024-01-15');
  });
});

// ============================================================================
// Load Global Variables Tests
// ============================================================================

describe('globalVariables: loadGlobalVariablesForOrg', () => {
  const organizationId = 'org-123';

  test('returns empty object when no namespaces exist', async () => {
    mockNamespaceFindMany.mockResolvedValue([]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result).toEqual({});
    expect(mockNamespaceFindMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ workspaceId: null }],
      },
      include: {
        fields: true,
      },
    });
  });

  test('returns org-wide and workspace-specific variables when workspaceId is provided', async () => {
    const workspaceId = 'ws-123';
    mockNamespaceFindMany.mockResolvedValue([]);

    const result = await loadGlobalVariablesForOrg(organizationId, workspaceId);

    expect(result).toEqual({});
    expect(mockNamespaceFindMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ workspaceId: null }, { workspaceId }],
      },
      include: {
        fields: true,
      },
    });
  });

  test('loads single namespace with string field', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'COMPANY',
        description: 'Company settings',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'companyName',
            fieldType: 'STRING',
            value: 'Acme Corp',
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result).toEqual({
      COMPANY: {
        companyName: 'Acme Corp',
      },
    });
  });

  test('loads namespace with multiple fields of different types', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'maxUsers',
            fieldType: 'NUMBER',
            value: 100,
          },
          {
            id: 'field-2',
            namespaceId: 'ns-1',
            name: 'featureEnabled',
            fieldType: 'BOOLEAN',
            value: true,
          },
          {
            id: 'field-3',
            namespaceId: 'ns-1',
            name: 'apiKey',
            fieldType: 'STRING',
            value: 'abc123',
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result).toEqual({
      CONFIG: {
        maxUsers: 100,
        featureEnabled: true,
        apiKey: 'abc123',
      },
    });
  });

  test('loads multiple namespaces', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'COMPANY',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'name',
            fieldType: 'STRING',
            value: 'Acme',
          },
        ],
      },
      {
        id: 'ns-2',
        organizationId,
        name: 'LIMITS',
        fields: [
          {
            id: 'field-2',
            namespaceId: 'ns-2',
            name: 'maxRequests',
            fieldType: 'NUMBER',
            value: 1000,
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result).toEqual({
      COMPANY: {
        name: 'Acme',
      },
      LIMITS: {
        maxRequests: 1000,
      },
    });
  });

  test('deserializes string array fields', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'allowedDomains',
            fieldType: 'STRING_ARRAY',
            value: ['example.com', 'test.com'],
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result).toEqual({
      CONFIG: {
        allowedDomains: ['example.com', 'test.com'],
      },
    });
  });

  test('deserializes number array fields', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'allowedPorts',
            fieldType: 'NUMBER_ARRAY',
            value: [80, 443, 8080],
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result).toEqual({
      CONFIG: {
        allowedPorts: [80, 443, 8080],
      },
    });
  });

  test('deserializes DATE field from ISO string', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'creationDate',
            fieldType: 'DATE',
            value: '2024-01-15T00:00:00.000Z',
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result.CONFIG.creationDate).toBeInstanceOf(Date);
    expect((result.CONFIG.creationDate as Date).toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });

  test('filters by organizationId, workspaceId, and excludes deleted namespaces', async () => {
    mockNamespaceFindMany.mockResolvedValue([]);

    await loadGlobalVariablesForOrg(organizationId);

    expect(mockNamespaceFindMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ workspaceId: null }],
      },
      include: {
        fields: true,
      },
    });
  });

  test('handles namespace with empty fields array', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'EMPTY',
        fields: [],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result).toEqual({
      EMPTY: {},
    });
  });

  test('handles NUMBER deserialization from string storage', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'count',
            fieldType: 'NUMBER',
            value: '42', // stored as string
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result.CONFIG.count).toBe(42);
  });

  test('handles BOOLEAN deserialization from string storage', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'enabled',
            fieldType: 'BOOLEAN',
            value: 'true', // stored as string
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result.CONFIG.enabled).toBe(true);
  });

  test('handles DATE deserialization from numeric timestamp', async () => {
    const timestamp = Date.now();
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'timestamp',
            fieldType: 'DATE',
            value: timestamp,
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result.CONFIG.timestamp).toBeInstanceOf(Date);
    expect((result.CONFIG.timestamp as Date).getTime()).toBe(timestamp);
  });

  test('skips field with undefined deserialized value', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'validField',
            fieldType: 'STRING',
            value: 'valid',
          },
          {
            id: 'field-2',
            namespaceId: 'ns-1',
            name: 'invalidField',
            fieldType: 'STRING_ARRAY',
            value: 'not-an-array', // invalid for STRING_ARRAY
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result.CONFIG.validField).toBe('valid');
    expect(result.CONFIG.invalidField).toBeUndefined();
  });

  test('handles NUMBER_ARRAY with mixed string and number values', async () => {
    mockNamespaceFindMany.mockResolvedValue([
      {
        id: 'ns-1',
        organizationId,
        name: 'CONFIG',
        fields: [
          {
            id: 'field-1',
            namespaceId: 'ns-1',
            name: 'ports',
            fieldType: 'NUMBER_ARRAY',
            value: ['80', 443, '8080'],
          },
        ],
      },
    ]);

    const result = await loadGlobalVariablesForOrg(organizationId);

    expect(result.CONFIG.ports).toEqual([80, 443, 8080]);
  });
});

// ============================================================================
// Reserved Names Export Tests
// ============================================================================

describe('globalVariables: GLOBAL_VARIABLE_RESERVED_NAMES', () => {
  test('exports reserved namespace names', () => {
    expect(GLOBAL_VARIABLE_RESERVED_NAMES).toBeDefined();
    expect(Array.isArray(GLOBAL_VARIABLE_RESERVED_NAMES)).toBe(true);
  });

  test('includes expected reserved names', () => {
    expect(GLOBAL_VARIABLE_RESERVED_NAMES).toContain('context');
    expect(GLOBAL_VARIABLE_RESERVED_NAMES).toContain('params');
    expect(GLOBAL_VARIABLE_RESERVED_NAMES).toContain('sql');
    expect(GLOBAL_VARIABLE_RESERVED_NAMES).toContain('github');
    expect(GLOBAL_VARIABLE_RESERVED_NAMES).toContain('file');
  });

  test('contains exactly 5 reserved names', () => {
    expect(GLOBAL_VARIABLE_RESERVED_NAMES).toHaveLength(5);
  });
});

// ============================================================================
// Organization Scoping Tests
// ============================================================================

describe('globalVariables: organization scoping', () => {
  test('loadGlobalVariablesForOrg queries only the specified organization', async () => {
    mockNamespaceFindMany.mockResolvedValue([]);

    await loadGlobalVariablesForOrg('org-specific-123');

    expect(mockNamespaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-specific-123',
        }),
      }),
    );
  });

  test('loadGlobalVariablesForOrg does not return data from other organizations', async () => {
    // Mock returns empty for this specific org
    mockNamespaceFindMany.mockResolvedValue([]);

    const result = await loadGlobalVariablesForOrg('org-no-data');

    expect(result).toEqual({});
    expect(mockNamespaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-no-data',
        }),
      }),
    );
  });
});

// ============================================================================
// Edge Cases and Error Handling Tests
// ============================================================================

describe('globalVariables: edge cases', () => {
  test('validateNamespaceName handles very long name correctly', () => {
    const name = 'A'.repeat(100);
    const result = validateNamespaceName(name);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50 characters');
  });

  test('validateFieldName handles unicode characters', () => {
    const result = validateFieldName('field\u00E9');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('letters, numbers, and underscores');
  });

  test('validateFieldValue handles object value for STRING type', () => {
    const result = validateFieldValue({ key: 'value' }, 'STRING');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a string');
  });

  test('validateFieldValue handles Infinity for NUMBER type', () => {
    const result = validateFieldValue(Infinity, 'NUMBER');
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(Infinity);
  });

  test('validateFieldValue handles negative Infinity for NUMBER type', () => {
    const result = validateFieldValue(-Infinity, 'NUMBER');
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(-Infinity);
  });

  test('loadGlobalVariablesForOrg handles different organization IDs', async () => {
    const orgIds = ['org-1', 'org-2', 'org-3'];

    for (const orgId of orgIds) {
      mockNamespaceFindMany.mockResolvedValue([]);
      await loadGlobalVariablesForOrg(orgId);

      expect(mockNamespaceFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
          }),
        }),
      );
    }
  });
});
