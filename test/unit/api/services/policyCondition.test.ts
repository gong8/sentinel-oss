/**
 * Policy Condition Service Unit Tests
 * Tests for deterministic condition evaluation (isolated, no database)
 */

import { describe, expect, test } from 'vitest';
import {
  _testing,
  evaluateCondition,
  evaluatePolicyConditions,
  extractFieldValue,
  formatFailedConditions,
  getAllCategories,
  getAvailableFieldsForTools,
  getCategoryForField,
  getOperatorsForCategory,
  validateConditions,
  type ConditionEvaluationContext,
  type ConditionEvaluationResultSingle,
  type PolicyConditions,
} from '../../../../packages/api/src/services/policyCondition.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(
  overrides: Partial<ConditionEvaluationContext> = {},
): ConditionEvaluationContext {
  return {
    params: {},
    time: {
      timestamp: new Date('2024-01-15T14:30:00Z'),
      hourOfDay: 14,
      dayOfWeek: 1, // Monday
    },
    network: {
      sourceIp: '192.168.1.100',
    },
    ...overrides,
  };
}

// ============================================================================
// Operator Tests: Equality
// ============================================================================

describe('policyCondition: equals operator', () => {
  test('string equality (case-insensitive)', () => {
    const context = createMockContext({
      params: { operation: 'SELECT' },
    });

    const result = evaluateCondition(
      { field: 'params.operation', operator: 'equals', value: 'select' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('number equality', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 14, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'equals', value: 14 },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('array equality', () => {
    const context = createMockContext({
      sql: { tables: ['users', 'orders'] },
    });

    const result = evaluateCondition(
      { field: 'sql.tables', operator: 'equals', value: ['users', 'orders'] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('inequality returns false', () => {
    const context = createMockContext({
      params: { operation: 'INSERT' },
    });

    const result = evaluateCondition(
      { field: 'params.operation', operator: 'equals', value: 'SELECT' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: notEquals operator', () => {
  test('different strings pass', () => {
    const context = createMockContext({
      params: { operation: 'DELETE' },
    });

    const result = evaluateCondition(
      { field: 'params.operation', operator: 'notEquals', value: 'SELECT' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('equal strings fail', () => {
    const context = createMockContext({
      params: { operation: 'SELECT' },
    });

    const result = evaluateCondition(
      { field: 'params.operation', operator: 'notEquals', value: 'SELECT' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Operator Tests: String
// ============================================================================

describe('policyCondition: contains operator', () => {
  test('substring match (case-insensitive)', () => {
    const context = createMockContext({
      params: { query: 'SELECT * FROM users WHERE id = 1' },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'contains', value: 'SELECT' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('no match returns false', () => {
    const context = createMockContext({
      params: { query: 'INSERT INTO users VALUES (1)' },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'contains', value: 'SELECT' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: notContains operator', () => {
  test('no substring match passes', () => {
    const context = createMockContext({
      params: { query: 'SELECT * FROM users' },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'notContains', value: 'DELETE' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('substring match fails', () => {
    const context = createMockContext({
      params: { query: 'DELETE FROM users' },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'notContains', value: 'DELETE' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: startsWith operator', () => {
  test('prefix match (case-insensitive)', () => {
    const context = createMockContext({
      file: { path: '/home/user/documents/report.pdf' },
    });

    const result = evaluateCondition(
      { field: 'file.path', operator: 'startsWith', value: '/home/user' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('no prefix match returns false', () => {
    const context = createMockContext({
      file: { path: '/var/log/app.log' },
    });

    const result = evaluateCondition(
      { field: 'file.path', operator: 'startsWith', value: '/home' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: endsWith operator', () => {
  test('suffix match (case-insensitive)', () => {
    const context = createMockContext({
      file: { extension: '.PDF' },
    });

    const result = evaluateCondition(
      { field: 'file.extension', operator: 'endsWith', value: '.pdf' },
      context,
    );

    expect(result.passed).toBe(true);
  });
});

describe('policyCondition: matches operator', () => {
  test('regex match', () => {
    const context = createMockContext({
      params: { email: 'user@example.com' },
    });

    const result = evaluateCondition(
      { field: 'params.email', operator: 'matches', value: '^[a-z]+@[a-z]+\\.com$' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('invalid regex returns false gracefully', () => {
    const context = createMockContext({
      params: { value: 'test' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'matches', value: '[invalid(regex' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Operator Tests: Numeric
// ============================================================================

describe('policyCondition: lessThan operator', () => {
  test('smaller number passes', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 8, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'lessThan', value: 9 },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('equal number fails', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 9, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'lessThan', value: 9 },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: greaterThan operator', () => {
  test('larger number passes', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 18, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'greaterThan', value: 17 },
      context,
    );

    expect(result.passed).toBe(true);
  });
});

describe('policyCondition: between operator', () => {
  test('value in range passes', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 14, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('value at lower boundary passes', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 9, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('value at upper boundary passes', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 17, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('value outside range fails', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 8, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('invalid range format fails', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 14, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'between', value: [9] }, // Invalid: only 1 element
      context,
    );

    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Operator Tests: Set
// ============================================================================

describe('policyCondition: in operator', () => {
  test('value in set passes (case-insensitive for strings)', () => {
    const context = createMockContext({
      sql: { operation: 'SELECT' },
    });

    const result = evaluateCondition(
      { field: 'sql.operation', operator: 'in', value: ['select', 'update'] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('value not in set fails', () => {
    const context = createMockContext({
      sql: { operation: 'DELETE' },
    });

    const result = evaluateCondition(
      { field: 'sql.operation', operator: 'in', value: ['SELECT', 'UPDATE'] },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('number in set passes', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 14, dayOfWeek: 1 },
    });

    const result = evaluateCondition(
      { field: 'time.dayOfWeek', operator: 'in', value: [1, 2, 3, 4, 5] }, // Weekdays
      context,
    );

    expect(result.passed).toBe(true);
  });
});

describe('policyCondition: notIn operator', () => {
  test('value not in set passes', () => {
    const context = createMockContext({
      sql: { operation: 'SELECT' },
    });

    const result = evaluateCondition(
      { field: 'sql.operation', operator: 'notIn', value: ['DELETE', 'DROP'] },
      context,
    );

    expect(result.passed).toBe(true);
  });
});

describe('policyCondition: containsAny operator', () => {
  test('array contains any from expected', () => {
    const context = createMockContext({
      sql: { tables: ['users', 'orders', 'products'] },
    });

    const result = evaluateCondition(
      { field: 'sql.tables', operator: 'containsAny', value: ['users', 'audit_logs'] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('array contains none from expected fails', () => {
    const context = createMockContext({
      sql: { tables: ['users', 'orders'] },
    });

    const result = evaluateCondition(
      { field: 'sql.tables', operator: 'containsAny', value: ['admin', 'secrets'] },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: containsNone operator', () => {
  test('array contains none from expected passes', () => {
    const context = createMockContext({
      sql: { tables: ['users', 'orders'] },
    });

    const result = evaluateCondition(
      { field: 'sql.tables', operator: 'containsNone', value: ['admin', 'secrets'] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('array contains some from expected fails', () => {
    const context = createMockContext({
      sql: { tables: ['users', 'admin'] },
    });

    const result = evaluateCondition(
      { field: 'sql.tables', operator: 'containsNone', value: ['admin', 'secrets'] },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Operator Tests: Existence
// ============================================================================

describe('policyCondition: exists operator', () => {
  test('defined value passes', () => {
    const context = createMockContext({
      params: { query: 'SELECT * FROM users' },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'exists', value: null },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('undefined value fails', () => {
    const context = createMockContext({
      params: {},
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'exists', value: null },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('null value fails', () => {
    const context = createMockContext({
      params: { query: null },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'exists', value: null },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: notExists operator', () => {
  test('undefined value passes', () => {
    const context = createMockContext({
      params: {},
    });

    const result = evaluateCondition(
      { field: 'params.optionalField', operator: 'notExists', value: null },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('defined value fails', () => {
    const context = createMockContext({
      params: { query: 'SELECT' },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'notExists', value: null },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Operator Tests: Network (CIDR)
// ============================================================================

describe('policyCondition: inCidr operator', () => {
  test('IP in CIDR range passes', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 14,
        dayOfWeek: 1,
      },
      network: {
        sourceIp: '192.168.1.100',
      },
    });

    const result = evaluateCondition(
      { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.1.0/24' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('IP outside CIDR range fails', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 14,
        dayOfWeek: 1,
      },
      network: {
        sourceIp: '10.0.0.1',
      },
    });

    const result = evaluateCondition(
      { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.1.0/24' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('exact IP match with /32 passes', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 14,
        dayOfWeek: 1,
      },
      network: {
        sourceIp: '192.168.1.100',
      },
    });

    const result = evaluateCondition(
      { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.1.100/32' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('invalid CIDR notation fails gracefully', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 14,
        dayOfWeek: 1,
      },
      network: {
        sourceIp: '192.168.1.100',
      },
    });

    const result = evaluateCondition(
      { field: 'network.sourceIp', operator: 'inCidr', value: 'invalid-cidr' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

describe('policyCondition: notInCidr operator', () => {
  test('IP outside CIDR range passes', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 14,
        dayOfWeek: 1,
      },
      network: {
        sourceIp: '10.0.0.1',
      },
    });

    const result = evaluateCondition(
      { field: 'network.sourceIp', operator: 'notInCidr', value: '192.168.1.0/24' },
      context,
    );

    expect(result.passed).toBe(true);
  });
});

// ============================================================================
// Condition Group Evaluation
// ============================================================================

describe('policyCondition: evaluatePolicyConditions (AND logic)', () => {
  test('all conditions passing returns passed=true', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 14,
        dayOfWeek: 1,
      },
      network: {
        sourceIp: '192.168.1.100',
      },
      sql: { operation: 'SELECT' },
    });

    const conditions: PolicyConditions = [
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      { field: 'time.dayOfWeek', operator: 'in', value: [1, 2, 3, 4, 5] },
      { field: 'sql.operation', operator: 'equals', value: 'SELECT' },
    ];

    const result = evaluatePolicyConditions(conditions, context);

    expect(result.passed).toBe(true);
    expect(result.failedConditions).toHaveLength(0);
    expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
  });

  test('one failing condition returns passed=false with details', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 20, // Outside business hours
        dayOfWeek: 1,
      },
      network: {
        sourceIp: '192.168.1.100',
      },
      sql: { operation: 'SELECT' },
    });

    const conditions: PolicyConditions = [
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      { field: 'sql.operation', operator: 'equals', value: 'SELECT' },
    ];

    const result = evaluatePolicyConditions(conditions, context);

    expect(result.passed).toBe(false);
    expect(result.failedConditions).toHaveLength(1);
    expect(result.failedConditions[0].field).toBe('time.hourOfDay');
    expect(result.failedConditions[0].actualValue).toBe(20);
  });

  test('multiple failing conditions reports all failures', () => {
    const context = createMockContext({
      time: {
        timestamp: new Date(),
        hourOfDay: 20,
        dayOfWeek: 0, // Sunday
      },
      network: {
        sourceIp: '10.0.0.1',
      },
      sql: { operation: 'DELETE' },
    });

    const conditions: PolicyConditions = [
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      { field: 'time.dayOfWeek', operator: 'in', value: [1, 2, 3, 4, 5] },
      { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.1.0/24' },
      { field: 'sql.operation', operator: 'equals', value: 'SELECT' },
    ];

    const result = evaluatePolicyConditions(conditions, context);

    expect(result.passed).toBe(false);
    expect(result.failedConditions).toHaveLength(4);
  });

  test('empty conditions array passes', () => {
    const context = createMockContext();
    const conditions: PolicyConditions = [];

    const result = evaluatePolicyConditions(conditions, context);

    expect(result.passed).toBe(true);
  });
});

// ============================================================================
// Field Path Extraction
// ============================================================================

describe('policyCondition: field path extraction', () => {
  test('extracts nested object values', () => {
    const context = createMockContext({
      sql: {
        operation: 'SELECT',
        tables: ['users', 'orders'],
        hasSqlComment: true,
      },
    });

    // Test sql.operation
    const result1 = evaluateCondition(
      { field: 'sql.operation', operator: 'equals', value: 'SELECT' },
      context,
    );
    expect(result1.passed).toBe(true);

    // Test sql.tables
    const result2 = evaluateCondition(
      { field: 'sql.tables', operator: 'containsAny', value: ['users'] },
      context,
    );
    expect(result2.passed).toBe(true);

    // Test sql.hasSqlComment
    const result3 = evaluateCondition(
      { field: 'sql.hasSqlComment', operator: 'equals', value: true },
      context,
    );
    expect(result3.passed).toBe(true);
  });

  test('handles missing nested paths gracefully', () => {
    const context = createMockContext({
      params: {},
    });

    const result = evaluateCondition(
      { field: 'sql.operation', operator: 'exists', value: null },
      context,
    );

    expect(result.passed).toBe(false);
    expect(result.actualValue).toBeNull();
  });

  test('extracts params with dynamic keys', () => {
    const context = createMockContext({
      params: {
        recipient: 'admin@example.com',
        subject: 'Important',
        body: 'Hello World',
      },
    });

    const result1 = evaluateCondition(
      { field: 'params.recipient', operator: 'endsWith', value: '@example.com' },
      context,
    );
    expect(result1.passed).toBe(true);

    const result2 = evaluateCondition(
      { field: 'params.subject', operator: 'equals', value: 'Important' },
      context,
    );
    expect(result2.passed).toBe(true);
  });
});

// ============================================================================
// Condition Validation
// ============================================================================

describe('policyCondition: validateConditions', () => {
  test('valid conditions pass validation', () => {
    const conditions: PolicyConditions = [
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17] },
      { field: 'params.query', operator: 'contains', value: 'SELECT' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('empty field fails validation', () => {
    const conditions: PolicyConditions = [{ field: '', operator: 'equals', value: 'test' }];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('between operator requires array of 2 elements', () => {
    const conditions: PolicyConditions = [
      { field: 'time.hourOfDay', operator: 'between', value: [9] },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('between'))).toBe(true);
  });

  test('inCidr operator requires valid CIDR string', () => {
    const conditions: PolicyConditions = [
      { field: 'network.sourceIp', operator: 'inCidr', value: 'not-valid-cidr' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('CIDR'))).toBe(true);
  });

  test('in/notIn operators require array value', () => {
    const conditions: PolicyConditions = [
      { field: 'params.operation', operator: 'in', value: 'SELECT' }, // Should be array
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('array'))).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('policyCondition: edge cases', () => {
  test('handles boolean values correctly', () => {
    const context = createMockContext({
      github: { isProtectedBranch: true },
    });

    const result = evaluateCondition(
      { field: 'github.isProtectedBranch', operator: 'equals', value: true },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('handles empty string values', () => {
    const context = createMockContext({
      params: { query: '' },
    });

    const result = evaluateCondition(
      { field: 'params.query', operator: 'equals', value: '' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('handles zero values', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 0, dayOfWeek: 0 },
    });

    const result = evaluateCondition(
      { field: 'time.hourOfDay', operator: 'equals', value: 0 },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('handles undefined sourceIp', () => {
    const context = createMockContext({
      time: { timestamp: new Date(), hourOfDay: 14, dayOfWeek: 1 },
      network: { sourceIp: undefined },
    });

    const result = evaluateCondition(
      { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.1.0/24' },
      context,
    );

    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Additional Validation Tests (Coverage for lines 508-618)
// ============================================================================

describe('policyCondition: validateConditions - additional paths', () => {
  test('null conditions are valid', () => {
    const result = validateConditions(null);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('undefined conditions are valid', () => {
    const result = validateConditions(undefined);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('empty array conditions are valid', () => {
    const result = validateConditions([]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('field without dot notation fails validation', () => {
    const conditions: PolicyConditions = [
      { field: 'invalidfield', operator: 'equals', value: 'test' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('dot notation'))).toBe(true);
  });

  test('invalid operator for time category fails validation', () => {
    const conditions: PolicyConditions = [
      { field: 'time.hourOfDay', operator: 'contains', value: 'test' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('not valid for category'))).toBe(true);
    expect(result.errors.some((e) => e.message.includes('time'))).toBe(true);
  });

  test('invalid operator for network category fails validation', () => {
    const conditions: PolicyConditions = [
      { field: 'network.sourceIp', operator: 'contains', value: 'test' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('network'))).toBe(true);
  });

  test('containsAny operator requires array value', () => {
    const conditions: PolicyConditions = [
      { field: 'sql.tables', operator: 'containsAny', value: 'users' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('array'))).toBe(true);
  });

  test('containsNone operator requires array value', () => {
    const conditions: PolicyConditions = [
      { field: 'sql.tables', operator: 'containsNone', value: 'admin' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('array'))).toBe(true);
  });

  test('notIn operator requires array value', () => {
    const conditions: PolicyConditions = [
      { field: 'params.operation', operator: 'notIn', value: 'DELETE' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('array'))).toBe(true);
  });

  test('notInCidr operator requires valid CIDR string', () => {
    const conditions: PolicyConditions = [
      { field: 'network.sourceIp', operator: 'notInCidr', value: 'not-cidr' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('CIDR'))).toBe(true);
  });

  test('inCidr operator with non-string value fails validation', () => {
    const conditions: PolicyConditions = [
      { field: 'network.sourceIp', operator: 'inCidr', value: 12345 },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('CIDR'))).toBe(true);
  });

  test('inCidr operator with valid CIDR string passes validation', () => {
    const conditions: PolicyConditions = [
      { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.1.0/24' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('notInCidr operator with valid CIDR string passes validation', () => {
    const conditions: PolicyConditions = [
      { field: 'network.sourceIp', operator: 'notInCidr', value: '10.0.0.0/8' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('inCidr operator with string missing slash fails validation', () => {
    const conditions: PolicyConditions = [
      { field: 'network.sourceIp', operator: 'inCidr', value: '192.168.1.0' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('CIDR'))).toBe(true);
  });

  test('matches operator with invalid regex pattern fails validation', () => {
    const conditions: PolicyConditions = [
      { field: 'params.query', operator: 'matches', value: '[invalid(regex' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Invalid regular expression'))).toBe(true);
  });

  test('matches operator with non-string value fails validation', () => {
    const conditions: PolicyConditions = [
      { field: 'params.query', operator: 'matches', value: 12345 },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('string regex pattern'))).toBe(true);
  });

  test('matches operator with valid regex passes validation', () => {
    const conditions: PolicyConditions = [
      { field: 'params.query', operator: 'matches', value: '^SELECT.*FROM' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('invalid schema structure fails validation', () => {
    const conditions = [{ field: 'params.test', operator: 'invalid_operator', value: 'test' }];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('non-array conditions fail validation', () => {
    const conditions = { field: 'params.test', operator: 'equals', value: 'test' };

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
  });

  test('between with array of wrong length still produces correct error', () => {
    const conditions: PolicyConditions = [
      { field: 'time.hourOfDay', operator: 'between', value: [9, 17, 20] },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('exactly 2 elements'))).toBe(true);
  });

  test('field with unknown category still validates (no operator restriction)', () => {
    const conditions: PolicyConditions = [
      { field: 'custom.field', operator: 'equals', value: 'test' },
    ];

    const result = validateConditions(conditions);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// formatFailedConditions Tests (Coverage for lines 642-653)
// ============================================================================

describe('policyCondition: formatFailedConditions', () => {
  test('returns "All conditions passed" for empty array', () => {
    const result = formatFailedConditions([]);

    expect(result).toBe('All conditions passed');
  });

  test('formats single failed condition correctly', () => {
    const failedConditions: ConditionEvaluationResultSingle[] = [
      {
        passed: false,
        field: 'time.hourOfDay',
        operator: 'between',
        expectedValue: [9, 17],
        actualValue: 20,
        reason: 'some reason',
      },
    ];

    const result = formatFailedConditions(failedConditions);

    expect(result).toContain('Failed conditions:');
    expect(result).toContain('time.hourOfDay');
    expect(result).toContain('between');
    expect(result).toContain('[9,17]');
    expect(result).toContain('20');
  });

  test('formats multiple failed conditions with semicolon separator', () => {
    const failedConditions: ConditionEvaluationResultSingle[] = [
      {
        passed: false,
        field: 'time.hourOfDay',
        operator: 'between',
        expectedValue: [9, 17],
        actualValue: 20,
      },
      {
        passed: false,
        field: 'sql.operation',
        operator: 'equals',
        expectedValue: 'SELECT',
        actualValue: 'DELETE',
      },
    ];

    const result = formatFailedConditions(failedConditions);

    expect(result).toContain('Failed conditions:');
    expect(result).toContain('time.hourOfDay');
    expect(result).toContain('sql.operation');
    expect(result).toContain(';');
  });

  test('handles undefined actualValue correctly', () => {
    const failedConditions: ConditionEvaluationResultSingle[] = [
      {
        passed: false,
        field: 'params.query',
        operator: 'exists',
        expectedValue: null,
        actualValue: undefined as unknown as null,
      },
    ];

    const result = formatFailedConditions(failedConditions);

    expect(result).toContain('undefined');
    expect(result).toContain('params.query');
  });

  test('handles null actualValue correctly', () => {
    const failedConditions: ConditionEvaluationResultSingle[] = [
      {
        passed: false,
        field: 'params.query',
        operator: 'exists',
        expectedValue: null,
        actualValue: null,
      },
    ];

    const result = formatFailedConditions(failedConditions);

    expect(result).toContain('null');
  });

  test('handles string values correctly', () => {
    const failedConditions: ConditionEvaluationResultSingle[] = [
      {
        passed: false,
        field: 'params.operation',
        operator: 'equals',
        expectedValue: 'SELECT',
        actualValue: 'DELETE',
      },
    ];

    const result = formatFailedConditions(failedConditions);

    expect(result).toContain('"SELECT"');
    expect(result).toContain('"DELETE"');
  });
});

// ============================================================================
// getAvailableFieldsForTools Tests (Coverage for lines 659-702)
// ============================================================================

describe('policyCondition: getAvailableFieldsForTools', () => {
  test('returns base time and network fields for empty tool patterns', () => {
    const result = getAvailableFieldsForTools([]);

    expect(result.time).toContain('time.hourOfDay');
    expect(result.time).toContain('time.dayOfWeek');
    expect(result.time).toContain('time.timestamp');
    expect(result.network).toContain('network.sourceIp');
    expect(result.parameters).toHaveLength(0);
    expect(result.extracted).toHaveLength(0);
  });

  test('adds SQL fields for SQL-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['execute_sql', 'run_query']);

    expect(result.extracted).toContain('sql.operation');
    expect(result.extracted).toContain('sql.tables');
    expect(result.extracted).toContain('sql.hasSqlComment');
  });

  test('adds SQL fields for database-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['database_query']);

    expect(result.extracted).toContain('sql.operation');
    expect(result.extracted).toContain('sql.tables');
    expect(result.extracted).toContain('sql.hasSqlComment');
  });

  test('adds GitHub fields for GitHub-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['github_create_pr', 'github_push']);

    expect(result.extracted).toContain('github.repository');
    expect(result.extracted).toContain('github.branch');
    expect(result.extracted).toContain('github.owner');
    expect(result.extracted).toContain('github.isProtectedBranch');
  });

  test('adds GitHub fields for git-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['git_commit', 'git_push']);

    expect(result.extracted).toContain('github.repository');
    expect(result.extracted).toContain('github.branch');
    expect(result.extracted).toContain('github.owner');
    expect(result.extracted).toContain('github.isProtectedBranch');
  });

  test('adds file fields for file-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['file_read', 'file_write']);

    expect(result.extracted).toContain('file.path');
    expect(result.extracted).toContain('file.extension');
    expect(result.extracted).toContain('file.isSensitivePath');
  });

  test('adds file fields for fs-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['fs_read', 'fs_write']);

    expect(result.extracted).toContain('file.path');
    expect(result.extracted).toContain('file.extension');
    expect(result.extracted).toContain('file.isSensitivePath');
  });

  test('adds file fields for read-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['read_document']);

    expect(result.extracted).toContain('file.path');
    expect(result.extracted).toContain('file.extension');
    expect(result.extracted).toContain('file.isSensitivePath');
  });

  test('adds file fields for write-related tool patterns', () => {
    const result = getAvailableFieldsForTools(['write_document']);

    expect(result.extracted).toContain('file.path');
    expect(result.extracted).toContain('file.extension');
    expect(result.extracted).toContain('file.isSensitivePath');
  });

  test('adds multiple field types for mixed tool patterns', () => {
    const result = getAvailableFieldsForTools(['execute_sql', 'github_push', 'file_read']);

    expect(result.extracted).toContain('sql.operation');
    expect(result.extracted).toContain('github.repository');
    expect(result.extracted).toContain('file.path');
  });

  test('case-insensitive pattern matching', () => {
    const result = getAvailableFieldsForTools(['EXECUTE_SQL', 'GITHUB_PUSH', 'FILE_READ']);

    expect(result.extracted).toContain('sql.operation');
    expect(result.extracted).toContain('github.repository');
    expect(result.extracted).toContain('file.path');
  });

  test('returns empty extracted for unrelated tool patterns', () => {
    const result = getAvailableFieldsForTools(['send_email', 'create_calendar_event']);

    expect(result.extracted).toHaveLength(0);
  });
});

// ============================================================================
// Category and Field Utility Tests (Additional coverage)
// ============================================================================

describe('policyCondition: getCategoryForField', () => {
  test('returns time category for context.hourOfDay', () => {
    const result = getCategoryForField('time.hourOfDay');
    expect(result).toBe('time');
  });

  test('returns time category for context.dayOfWeek', () => {
    const result = getCategoryForField('time.dayOfWeek');
    expect(result).toBe('time');
  });

  test('returns time category for context.timestamp', () => {
    const result = getCategoryForField('time.timestamp');
    expect(result).toBe('time');
  });

  test('returns network category for context.sourceIp', () => {
    const result = getCategoryForField('network.sourceIp');
    expect(result).toBe('network');
  });

  test('returns parameters category for params fields', () => {
    const result = getCategoryForField('params.query');
    expect(result).toBe('parameters');
  });

  test('returns extracted category for sql fields', () => {
    const result = getCategoryForField('sql.operation');
    expect(result).toBe('extracted');
  });

  test('returns extracted category for github fields', () => {
    const result = getCategoryForField('github.repository');
    expect(result).toBe('extracted');
  });

  test('returns extracted category for file fields', () => {
    const result = getCategoryForField('file.path');
    expect(result).toBe('extracted');
  });

  test('returns null for unknown field patterns', () => {
    const result = getCategoryForField('unknown.field');
    expect(result).toBeNull();
  });
});

describe('policyCondition: getOperatorsForCategory', () => {
  test('returns correct operators for time category', () => {
    const result = getOperatorsForCategory('time');

    expect(result).toContain('equals');
    expect(result).toContain('notEquals');
    expect(result).toContain('between');
    expect(result).toContain('in');
    expect(result).toContain('notIn');
    expect(result).toContain('lessThan');
    expect(result).toContain('greaterThan');
    expect(result).not.toContain('contains');
  });

  test('returns correct operators for network category', () => {
    const result = getOperatorsForCategory('network');

    expect(result).toContain('equals');
    expect(result).toContain('notEquals');
    expect(result).toContain('in');
    expect(result).toContain('notIn');
    expect(result).toContain('inCidr');
    expect(result).toContain('notInCidr');
    expect(result).not.toContain('contains');
  });

  test('returns correct operators for parameters category', () => {
    const result = getOperatorsForCategory('parameters');

    expect(result).toContain('equals');
    expect(result).toContain('contains');
    expect(result).toContain('startsWith');
    expect(result).toContain('matches');
    expect(result).toContain('exists');
  });

  test('returns correct operators for extracted category', () => {
    const result = getOperatorsForCategory('extracted');

    expect(result).toContain('equals');
    expect(result).toContain('contains');
    expect(result).toContain('in');
    expect(result).toContain('exists');
    expect(result).not.toContain('inCidr');
  });

  test('returns empty array for unknown category', () => {
    const result = getOperatorsForCategory('unknown' as 'time');
    expect(result).toEqual([]);
  });
});

describe('policyCondition: getAllCategories', () => {
  test('returns all four categories', () => {
    const result = getAllCategories();

    expect(result).toHaveLength(4);
    expect(result.map((c) => c.id)).toContain('time');
    expect(result.map((c) => c.id)).toContain('network');
    expect(result.map((c) => c.id)).toContain('parameters');
    expect(result.map((c) => c.id)).toContain('extracted');
  });

  test('each category has required properties', () => {
    const result = getAllCategories();

    for (const category of result) {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('name');
      expect(category).toHaveProperty('fieldPattern');
      expect(category).toHaveProperty('operators');
      expect(Array.isArray(category.operators)).toBe(true);
    }
  });
});

describe('policyCondition: extractFieldValue', () => {
  test('extracts top-level context field', () => {
    const context = createMockContext({
      params: { query: 'SELECT * FROM users' },
    });

    const result = extractFieldValue(context, 'params.query');
    expect(result).toBe('SELECT * FROM users');
  });

  test('extracts nested field from sql context', () => {
    const context = createMockContext({
      sql: { operation: 'SELECT', tables: ['users'] },
    });

    const result = extractFieldValue(context, 'sql.operation');
    expect(result).toBe('SELECT');
  });

  test('returns undefined for non-existent path', () => {
    const context = createMockContext({});

    const result = extractFieldValue(context, 'nonexistent.field');
    expect(result).toBeUndefined();
  });

  test('returns undefined when traversing through null', () => {
    const context = createMockContext({
      sql: undefined,
    });

    const result = extractFieldValue(context, 'sql.operation');
    expect(result).toBeUndefined();
  });

  test('returns undefined when traversing through non-object', () => {
    const context = createMockContext({
      params: { value: 'string_value' },
    });

    const result = extractFieldValue(context, 'params.value.nested');
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// Internal Testing Exports
// ============================================================================

describe('policyCondition: _testing exports', () => {
  test('ipv4ToNumber converts valid IPv4 addresses', () => {
    expect(_testing.ipv4ToNumber('192.168.1.1')).toBe(3232235777);
    expect(_testing.ipv4ToNumber('0.0.0.0')).toBe(0);
    expect(_testing.ipv4ToNumber('255.255.255.255')).toBe(4294967295);
  });

  test('ipv4ToNumber returns null for invalid IPs', () => {
    expect(_testing.ipv4ToNumber('invalid')).toBeNull();
    expect(_testing.ipv4ToNumber('192.168.1')).toBeNull();
    expect(_testing.ipv4ToNumber('192.168.1.256')).toBeNull();
    expect(_testing.ipv4ToNumber('192.168.1.-1')).toBeNull();
  });

  test('isIpInCidr correctly checks IP in range', () => {
    expect(_testing.isIpInCidr('192.168.1.100', '192.168.1.0/24')).toBe(true);
    expect(_testing.isIpInCidr('192.168.2.100', '192.168.1.0/24')).toBe(false);
  });

  test('isIpInCidr handles edge cases', () => {
    expect(_testing.isIpInCidr('192.168.1.100', 'invalid')).toBe(false);
    expect(_testing.isIpInCidr('192.168.1.100', '192.168.1.0/33')).toBe(false);
    expect(_testing.isIpInCidr('192.168.1.100', '192.168.1.0/-1')).toBe(false);
  });

  test('isIpInCidr returns false for invalid CIDR base IP', () => {
    expect(_testing.isIpInCidr('192.168.1.100', 'invalid.ip.addr/24')).toBe(false);
    expect(_testing.isIpInCidr('192.168.1.100', '300.168.1.0/24')).toBe(false);
  });

  test('isIpInCidr returns false for invalid source IP', () => {
    expect(_testing.isIpInCidr('invalid.ip', '192.168.1.0/24')).toBe(false);
    expect(_testing.isIpInCidr('300.0.0.1', '192.168.1.0/24')).toBe(false);
  });

  test('isIpInCidr handles /0 prefix (matches all)', () => {
    expect(_testing.isIpInCidr('192.168.1.100', '0.0.0.0/0')).toBe(true);
    expect(_testing.isIpInCidr('10.0.0.1', '0.0.0.0/0')).toBe(true);
  });

  test('operatorRegistry has all operators', () => {
    const operators = [
      'equals',
      'notEquals',
      'contains',
      'notContains',
      'startsWith',
      'endsWith',
      'matches',
      'lessThan',
      'greaterThan',
      'between',
      'in',
      'notIn',
      'containsAny',
      'containsNone',
      'exists',
      'notExists',
      'inCidr',
      'notInCidr',
    ];

    for (const op of operators) {
      expect(_testing.operatorRegistry.has(op as 'equals')).toBe(true);
    }
  });

  test('categoryRegistry has all categories', () => {
    expect(_testing.categoryRegistry.has('time')).toBe(true);
    expect(_testing.categoryRegistry.has('network')).toBe(true);
    expect(_testing.categoryRegistry.has('parameters')).toBe(true);
    expect(_testing.categoryRegistry.has('extracted')).toBe(true);
  });
});

// ============================================================================
// Additional Operator Edge Cases
// ============================================================================

describe('policyCondition: operator edge cases', () => {
  test('contains returns false for non-string actual value', () => {
    const context = createMockContext({
      params: { value: 123 },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'contains', value: '1' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('contains returns false for non-string expected value', () => {
    const context = createMockContext({
      params: { value: 'test string' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'contains', value: 123 },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('notContains returns true for non-string actual value', () => {
    const context = createMockContext({
      params: { value: 123 },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'notContains', value: '1' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('notContains returns true for non-string expected value', () => {
    const context = createMockContext({
      params: { value: 'test string' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'notContains', value: 123 },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('startsWith returns false for non-string values', () => {
    const context = createMockContext({
      params: { value: 123 },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'startsWith', value: '1' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('endsWith returns false for non-string values', () => {
    const context = createMockContext({
      params: { value: 123 },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'endsWith', value: '3' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('matches returns false for non-string actual value', () => {
    const context = createMockContext({
      params: { value: 123 },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'matches', value: '\\d+' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('matches returns false for non-string expected value', () => {
    const context = createMockContext({
      params: { value: 'test' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'matches', value: 123 },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('lessThan handles string numbers', () => {
    const context = createMockContext({
      params: { value: '5' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'lessThan', value: '10' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('lessThan returns false for non-numeric strings', () => {
    const context = createMockContext({
      params: { value: 'abc' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'lessThan', value: 10 },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('greaterThan handles string numbers', () => {
    const context = createMockContext({
      params: { value: '15' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'greaterThan', value: '10' },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('greaterThan returns false for non-numeric strings', () => {
    const context = createMockContext({
      params: { value: 'abc' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'greaterThan', value: 10 },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('between handles string numbers', () => {
    const context = createMockContext({
      params: { value: '15' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'between', value: ['10', '20'] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('between returns false for non-array expected value', () => {
    const context = createMockContext({
      params: { value: 15 },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'between', value: 'not-array' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('between returns false for non-numeric values in range', () => {
    const context = createMockContext({
      params: { value: 'abc' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'between', value: [10, 20] },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('in returns false for non-array expected value', () => {
    const context = createMockContext({
      params: { value: 'test' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'in', value: 'not-array' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('in handles numeric values in array', () => {
    const context = createMockContext({
      params: { value: 5 },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'in', value: [1, 5, 10] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('containsAny returns false for non-array actual value', () => {
    const context = createMockContext({
      params: { value: 'test' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'containsAny', value: ['test'] },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('containsAny returns false for non-array expected value', () => {
    const context = createMockContext({
      params: { value: ['test'] },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'containsAny', value: 'test' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('containsAny handles non-string values in arrays', () => {
    const context = createMockContext({
      params: { values: [1, 2, 3] },
    });

    const result = evaluateCondition(
      { field: 'params.values', operator: 'containsAny', value: [2, 5] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('containsNone returns true for non-array values', () => {
    const context = createMockContext({
      params: { value: 'test' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'containsNone', value: ['test'] },
      context,
    );

    expect(result.passed).toBe(true);
  });

  test('inCidr returns false for non-string actual value', () => {
    const context = createMockContext({
      params: { ip: 12345 },
    });

    const result = evaluateCondition(
      { field: 'params.ip', operator: 'inCidr', value: '192.168.1.0/24' },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('inCidr returns false for non-string expected value', () => {
    const context = createMockContext({
      params: { ip: '192.168.1.100' },
    });

    const result = evaluateCondition(
      { field: 'params.ip', operator: 'inCidr', value: 12345 },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('unknown operator returns failure with reason', () => {
    const context = createMockContext({
      params: { value: 'test' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'unknownOp' as 'equals', value: 'test' },
      context,
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unknown operator');
  });

  test('equals handles array equality with different lengths', () => {
    const context = createMockContext({
      params: { values: [1, 2, 3] },
    });

    const result = evaluateCondition(
      { field: 'params.values', operator: 'equals', value: [1, 2] },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('equals handles array equality with different values', () => {
    const context = createMockContext({
      params: { values: [1, 2, 3] },
    });

    const result = evaluateCondition(
      { field: 'params.values', operator: 'equals', value: [1, 2, 4] },
      context,
    );

    expect(result.passed).toBe(false);
  });

  test('equals returns false for mismatched types', () => {
    const context = createMockContext({
      params: { value: 'test' },
    });

    const result = evaluateCondition(
      { field: 'params.value', operator: 'equals', value: 123 },
      context,
    );

    expect(result.passed).toBe(false);
  });
});
