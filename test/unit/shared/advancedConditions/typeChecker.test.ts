/**
 * Advanced Conditions - Type Checker Unit Tests
 * Tests for type inference and validation
 */

import { describe, expect, test } from 'vitest';
import { parse } from '../../../../packages/shared/src/advancedConditions/parser.js';
import {
  createTypeEnvFromSchema,
  typeCheck,
  TypeChecker,
  type TypeEnvironment,
} from '../../../../packages/shared/src/advancedConditions/typeChecker.js';

// ============================================================================
// Helper Functions
// ============================================================================

function check(expression: string, env: TypeEnvironment = {}): ReturnType<typeof typeCheck> {
  const parseResult = parse(expression);
  if (!parseResult.success || !parseResult.ast) {
    throw new Error(`Parse failed: ${parseResult.errors[0]?.message}`);
  }
  return typeCheck(parseResult.ast, env);
}

function expectSuccess(expression: string, env: TypeEnvironment = {}): void {
  const result = check(expression, env);
  expect(result.success).toBe(true);
  expect(result.errors).toHaveLength(0);
}

function expectError(expression: string, errorCode: string, env: TypeEnvironment = {}): void {
  const result = check(expression, env);
  expect(result.success).toBe(false);
  expect(result.errors.some((e) => e.code === errorCode)).toBe(true);
}

// ============================================================================
// Literals
// ============================================================================

describe('advancedConditions/typeChecker: literals', () => {
  test('number literal type check passes (with comparison)', () => {
    expectSuccess('42 > 0');
  });

  test('string literal type check passes (with comparison)', () => {
    expectSuccess('"hello" = "hello"');
  });

  test('boolean literal type check passes', () => {
    expectSuccess('true');
    expectSuccess('false');
  });

  test('null literal type check produces non-boolean error', () => {
    expectError('null', 'EXPRESSION_NOT_BOOLEAN');
  });

  test('array literal type check produces non-boolean error', () => {
    expectError('[1, 2, 3]', 'EXPRESSION_NOT_BOOLEAN');
  });
});

// ============================================================================
// Comparison Operators
// ============================================================================

describe('advancedConditions/typeChecker: comparison operators', () => {
  test('equality comparison accepts any types', () => {
    expectSuccess('1 = 1');
    expectSuccess('"a" = "b"');
    expectSuccess('true = false');
  });

  test('numeric comparison with numbers passes', () => {
    expectSuccess('5 > 3');
    expectSuccess('5 >= 3');
    expectSuccess('3 < 5');
    expectSuccess('3 <= 5');
  });

  test('numeric comparison with strings produces error', () => {
    expectError('"a" > "b"', 'TYPE_MISMATCH');
    expectError('"a" >= "b"', 'TYPE_MISMATCH');
  });

  test('LIKE requires strings', () => {
    expectSuccess("'test' LIKE '%est'");
    expectError("5 LIKE '%5'", 'TYPE_MISMATCH');
  });

  test('MATCHES requires strings', () => {
    expectSuccess("'test' MATCHES '^t'");
    expectError("5 MATCHES '^5'", 'TYPE_MISMATCH');
  });

  test('IN requires array on right side', () => {
    expectSuccess("'a' IN ['a', 'b']");
    expectError("'a' IN 'b'", 'TYPE_MISMATCH');
  });
});

// ============================================================================
// Logical Operators
// ============================================================================

describe('advancedConditions/typeChecker: logical operators', () => {
  test('AND requires boolean operands', () => {
    expectSuccess('(1 > 0) AND (2 > 1)');
    expectError('(1 + 2) AND (3 + 4)', 'TYPE_MISMATCH');
  });

  test('OR requires boolean operands', () => {
    expectSuccess('(1 > 0) OR (2 > 1)');
    expectError('(1 + 2) OR (3 + 4)', 'TYPE_MISMATCH');
  });

  test('NOT requires boolean operand', () => {
    expectSuccess('NOT (1 > 0)');
    expectError('NOT 5', 'TYPE_MISMATCH');
  });
});

// ============================================================================
// Arithmetic Operators
// ============================================================================

describe('advancedConditions/typeChecker: arithmetic operators', () => {
  test('arithmetic with numbers passes when used in comparison', () => {
    expectSuccess('(1 + 2) = 3');
    expectSuccess('(5 - 3) > 0');
    expectSuccess('(2 * 3) < 10');
    expectSuccess('(10 / 2) >= 5');
    expectSuccess('(2 ** 3) = 8');
  });

  test('arithmetic alone produces non-boolean error', () => {
    expectError('1 + 2', 'EXPRESSION_NOT_BOOLEAN');
    expectError('5 - 3', 'EXPRESSION_NOT_BOOLEAN');
  });

  test('string concatenation with + passes when compared', () => {
    expectSuccess('("a" + "b") = "ab"');
  });

  test('arithmetic with strings produces error (except +)', () => {
    expectError('"a" - "b"', 'TYPE_MISMATCH');
    expectError('"a" * "b"', 'TYPE_MISMATCH');
  });
});

// ============================================================================
// Function Calls
// ============================================================================

describe('advancedConditions/typeChecker: function calls', () => {
  test('known function with correct args passes', () => {
    expectSuccess('ABS(-5) > 0');
    expectSuccess('FLOOR(3.7) = 3');
    expectSuccess('CEIL(3.2) = 4');
  });

  test('unknown function produces error', () => {
    expectError('UNKNOWN_FUNC(1) > 0', 'UNKNOWN_FUNCTION');
  });

  test('function with wrong argument count produces error', () => {
    expectError('ABS() > 0', 'WRONG_ARGUMENT_COUNT');
    expectError('ABS(1, 2, 3) > 0', 'WRONG_ARGUMENT_COUNT');
  });

  test('function with wrong argument type produces error', () => {
    expectError('FLOOR("not a number") > 0', 'TYPE_MISMATCH');
  });

  test('variadic functions accept multiple args', () => {
    expectSuccess('MAX(1, 2, 3) > 0');
    expectSuccess('MIN(1, 2, 3, 4, 5) > 0');
    expectSuccess('SUM(1, 2, 3) > 0');
    expectSuccess("CONCAT('a', 'b', 'c') = 'abc'");
  });

  test('COALESCE function with params', () => {
    const env: TypeEnvironment = {
      params: { email: { kind: 'string' } },
    };
    // Test that COALESCE returns the expected type
    expectSuccess("COALESCE(params.email, 'default') = 'value'", env);
  });

  test('COALESCE returns inferred type from args when compared', () => {
    const env: TypeEnvironment = {
      params: {
        a: { kind: 'string' },
        b: { kind: 'string' },
      },
    };
    expectSuccess("COALESCE(params.a, params.b) = 'default'", env);
  });

  test('CONTAINS requires array first arg', () => {
    const env: TypeEnvironment = {
      params: { items: { kind: 'array', elementType: { kind: 'number' } } },
    };
    expectSuccess('CONTAINS(params.items, 5)', env);
  });

  test('LEN works with strings and arrays', () => {
    expectSuccess("LEN('hello') = 5");
    expectSuccess('LEN([1, 2, 3]) = 3');
  });
});

// ============================================================================
// Member Access
// ============================================================================

describe('advancedConditions/typeChecker: member access', () => {
  test('params member access with known type', () => {
    const env: TypeEnvironment = {
      params: { amount: { kind: 'number' } },
    };
    expectSuccess('params.amount > 100', env);
  });

  test('time and network member access with known type', () => {
    expectSuccess('time.hourOfDay >= 9');
    expectSuccess('time.dayOfWeek = 1');
    expectSuccess('network.sourceIp = "10.0.0.1"');
  });

  test('unknown param produces error when params are defined', () => {
    const env: TypeEnvironment = {
      params: { amount: { kind: 'number' } },
    };
    expectError('params.unknown > 0', 'PROPERTY_NOT_FOUND', env);
  });

  test('unknown param allows any operation when no params defined', () => {
    expectSuccess('params.unknown > 0');
  });

  test('global namespace access', () => {
    const env: TypeEnvironment = {
      globals: {
        COMPANY: { minAmount: { kind: 'number' } },
      },
    };
    expectSuccess('COMPANY.minAmount > 0', env);
  });

  test('unknown field in known global namespace produces error', () => {
    const env: TypeEnvironment = {
      globals: {
        COMPANY: { knownField: { kind: 'number' } },
      },
    };
    expectError('COMPANY.unknownField > 0', 'PROPERTY_NOT_FOUND', env);
  });

  test('nested object property access with valid path', () => {
    const env: TypeEnvironment = {
      params: {
        parent: {
          kind: 'object',
          properties: new Map([
            ['child', { kind: 'number' }],
            ['name', { kind: 'string' }],
          ]),
        },
      },
    };
    expectSuccess('params.parent.child > 0', env);
    expectSuccess("params.parent.name = 'test'", env);
  });

  test('nested object property access with invalid path produces error', () => {
    const env: TypeEnvironment = {
      params: {
        parent: {
          kind: 'object',
          properties: new Map([['child', { kind: 'number' }]]),
        },
      },
    };
    expectError('params.parent.invalidField > 0', 'PROPERTY_NOT_FOUND', env);
  });

  test('deeply nested object property access', () => {
    const env: TypeEnvironment = {
      params: {
        level1: {
          kind: 'object',
          properties: new Map([
            [
              'level2',
              {
                kind: 'object',
                properties: new Map([['level3', { kind: 'number' }]]),
              },
            ],
          ]),
        },
      },
    };
    expectSuccess('params.level1.level2.level3 > 0', env);
  });

  test('nested property access on object without properties map', () => {
    const env: TypeEnvironment = {
      params: {
        generic: { kind: 'object' }, // No properties map
      },
    };
    // Should allow access since object has no defined properties
    expectSuccess('params.generic.anything > 0', env);
  });
});

// ============================================================================
// Index Access
// ============================================================================

describe('advancedConditions/typeChecker: index access', () => {
  test('array index access with number', () => {
    const env: TypeEnvironment = {
      params: { items: { kind: 'array', elementType: { kind: 'number' } } },
    };
    expectSuccess('params.items[0] > 0', env);
  });

  test('string index access with number', () => {
    const env: TypeEnvironment = {
      params: { name: { kind: 'string' } },
    };
    expectSuccess("params.name[0] = 'A'", env);
  });

  test('array index with non-number produces error', () => {
    const env: TypeEnvironment = {
      params: { items: { kind: 'array', elementType: { kind: 'number' } } },
    };
    expectError("params.items['a'] > 0", 'TYPE_MISMATCH', env);
  });
});

// ============================================================================
// WHERE Clause
// ============================================================================

describe('advancedConditions/typeChecker: WHERE clause', () => {
  test('WHERE bindings are scoped to expression', () => {
    const env: TypeEnvironment = {
      params: { x: { kind: 'number' } },
    };
    expectSuccess('(params.x > threshold) WHERE threshold = 100', env);
  });

  test('WHERE binding with expression', () => {
    const env: TypeEnvironment = {
      params: { basePrice: { kind: 'number' }, price: { kind: 'number' } },
    };
    expectSuccess('(params.price > threshold) WHERE threshold = params.basePrice * 1.5', env);
  });

  test('multiple WHERE bindings', () => {
    const env: TypeEnvironment = {
      params: { x: { kind: 'number' } },
    };
    expectSuccess('(params.x > min) WHERE min = 5, max = 10', env);
  });
});

// ============================================================================
// Final Expression Type
// ============================================================================

describe('advancedConditions/typeChecker: final expression type', () => {
  test('final expression must be boolean - number fails', () => {
    expectError('42', 'EXPRESSION_NOT_BOOLEAN');
  });

  test('final expression must be boolean - string fails', () => {
    expectError('"hello"', 'EXPRESSION_NOT_BOOLEAN');
  });

  test('final expression must be boolean - comparison passes', () => {
    expectSuccess('42 > 0');
    expectSuccess('"a" = "a"');
  });

  test('final expression must be boolean - logical passes', () => {
    expectSuccess('(1 > 0) AND (2 > 1)');
    expectSuccess('NOT false');
  });

  test('final expression must be boolean - comparison function passes', () => {
    const env: TypeEnvironment = {
      params: { value: { kind: 'number' } },
    };
    // Test that comparison returns boolean
    expectSuccess('params.value > 0', env);
  });
});

// ============================================================================
// Type Environment from Schema
// ============================================================================

describe('advancedConditions/typeChecker: createTypeEnvFromSchema', () => {
  test('creates env from simple schema', () => {
    const schema = {
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        active: { type: 'boolean' },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.name.kind).toBe('string');
    expect(env.params?.age.kind).toBe('number');
    expect(env.params?.active.kind).toBe('boolean');
  });

  test('handles integer type', () => {
    const schema = {
      properties: {
        count: { type: 'integer' },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.count.kind).toBe('number');
  });

  test('handles array type', () => {
    const schema = {
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.items.kind).toBe('array');
    if (env.params?.items.kind === 'array') {
      expect(env.params.items.elementType.kind).toBe('string');
    }
  });

  test('handles object type', () => {
    const schema = {
      properties: {
        config: { type: 'object' },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.config.kind).toBe('object');
  });

  test('handles null type', () => {
    const schema = {
      properties: {
        value: { type: 'null' },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.value.kind).toBe('null');
  });

  test('handles union type (array of types)', () => {
    const schema = {
      properties: {
        value: { type: ['string', 'null'] },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.value.kind).toBe('union');
  });

  test('handles missing properties', () => {
    const schema = {};
    const env = createTypeEnvFromSchema(schema);
    expect(env.params).toEqual({});
  });

  test('handles empty schema', () => {
    const env = createTypeEnvFromSchema({});
    expect(env.params).toEqual({});
  });

  test('handles nested object with properties', () => {
    const schema = {
      properties: {
        parent: {
          type: 'object',
          properties: {
            child: { type: 'number' },
            name: { type: 'string' },
          },
        },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.parent.kind).toBe('object');
    if (env.params?.parent.kind === 'object') {
      expect(env.params.parent.properties?.get('child')?.kind).toBe('number');
      expect(env.params.parent.properties?.get('name')?.kind).toBe('string');
    }
  });

  test('handles deeply nested objects', () => {
    const schema = {
      properties: {
        level1: {
          type: 'object',
          properties: {
            level2: {
              type: 'object',
              properties: {
                level3: { type: 'boolean' },
              },
            },
          },
        },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.level1.kind).toBe('object');
    if (env.params?.level1.kind === 'object') {
      const level2 = env.params.level1.properties?.get('level2');
      expect(level2?.kind).toBe('object');
      if (level2?.kind === 'object') {
        expect(level2.properties?.get('level3')?.kind).toBe('boolean');
      }
    }
  });

  test('handles allOf with merged properties', () => {
    const schema = {
      properties: {
        merged: {
          allOf: [
            { properties: { fieldA: { type: 'string' } } },
            { properties: { fieldB: { type: 'number' } } },
          ],
        },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.merged.kind).toBe('object');
    if (env.params?.merged.kind === 'object') {
      expect(env.params.merged.properties?.get('fieldA')?.kind).toBe('string');
      expect(env.params.merged.properties?.get('fieldB')?.kind).toBe('number');
    }
  });

  test('handles anyOf with merged properties', () => {
    const schema = {
      properties: {
        variant: {
          anyOf: [
            { properties: { optionA: { type: 'string' } } },
            { properties: { optionB: { type: 'number' } } },
          ],
        },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.variant.kind).toBe('object');
    if (env.params?.variant.kind === 'object') {
      expect(env.params.variant.properties?.get('optionA')?.kind).toBe('string');
      expect(env.params.variant.properties?.get('optionB')?.kind).toBe('number');
    }
  });

  test('infers object type from properties when type is not specified', () => {
    const schema = {
      properties: {
        implicitObject: {
          properties: {
            field: { type: 'string' },
          },
        },
      },
    };

    const env = createTypeEnvFromSchema(schema);
    expect(env.params?.implicitObject.kind).toBe('object');
    if (env.params?.implicitObject.kind === 'object') {
      expect(env.params.implicitObject.properties?.get('field')?.kind).toBe('string');
    }
  });
});

// ============================================================================
// TypeChecker Class
// ============================================================================

describe('advancedConditions/typeChecker: TypeChecker class', () => {
  test('can be instantiated and used directly', () => {
    const parseResult = parse('1 > 0');
    expect(parseResult.ast).not.toBeNull();

    const checker = new TypeChecker();
    const result = checker.check(parseResult.ast!);
    expect(result.success).toBe(true);
  });

  test('can be instantiated with environment', () => {
    const parseResult = parse('params.amount > 100');
    expect(parseResult.ast).not.toBeNull();

    const env: TypeEnvironment = {
      params: { amount: { kind: 'number' } },
    };

    const checker = new TypeChecker(env);
    const result = checker.check(parseResult.ast!);
    expect(result.success).toBe(true);
  });

  test('stores type information in typeMap', () => {
    const parseResult = parse('1 > 0');
    expect(parseResult.ast).not.toBeNull();

    const checker = new TypeChecker();
    const result = checker.check(parseResult.ast!);
    expect(result.typeMap.size).toBeGreaterThan(0);
  });

  test('attaches inferredType to nodes', () => {
    const parseResult = parse('1 > 0');
    expect(parseResult.ast).not.toBeNull();

    const checker = new TypeChecker();
    checker.check(parseResult.ast!);
    expect(parseResult.ast!.inferredType).toBeDefined();
  });
});

// ============================================================================
// Array Type Checking
// ============================================================================

describe('advancedConditions/typeChecker: array types', () => {
  test('homogeneous number array is valid', () => {
    expectSuccess('1 IN [1, 2, 3]');
  });

  test('homogeneous string array is valid', () => {
    expectSuccess("'a' IN ['a', 'b', 'c']");
  });

  test('mixed type array produces error', () => {
    expectError("1 IN [1, 2, 'three']", 'TYPE_MISMATCH');
  });

  test('mixed number and string array produces error', () => {
    expectError("'x' IN [1, 'two', 3]", 'TYPE_MISMATCH');
  });

  test('number IN string array produces error', () => {
    const env: TypeEnvironment = {
      globals: {
        COMPANY: { startTime: { kind: 'number' } },
      },
    };
    expectError("COMPANY.startTime IN ['a', 'b']", 'TYPE_MISMATCH', env);
  });

  test('string IN number array produces error', () => {
    const env: TypeEnvironment = {
      globals: {
        COMPANY: { name: { kind: 'string' } },
      },
    };
    expectError('COMPANY.name IN [1, 2, 3]', 'TYPE_MISMATCH', env);
  });

  test('number IN number array is valid', () => {
    const env: TypeEnvironment = {
      globals: {
        COMPANY: { startTime: { kind: 'number' } },
      },
    };
    expectSuccess('COMPANY.startTime IN [1, 2, 3]', env);
  });

  test('string IN string array is valid', () => {
    const env: TypeEnvironment = {
      globals: {
        COMPANY: { name: { kind: 'string' } },
      },
    };
    expectSuccess("COMPANY.name IN ['a', 'b', 'c']", env);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('advancedConditions/typeChecker: edge cases', () => {
  test('deeply nested expressions', () => {
    expectSuccess('((((1 > 0))))');
  });

  test('complex combined expression', () => {
    const env: TypeEnvironment = {
      params: {
        amount: { kind: 'number' },
        status: { kind: 'string' },
        items: { kind: 'array', elementType: { kind: 'number' } },
      },
      globals: {
        LIMITS: { maxAmount: { kind: 'number' } },
      },
    };

    expectSuccess("(params.amount <= LIMITS.maxAmount) AND (params.status = 'active')", env);
  });

  test('array.length access', () => {
    const env: TypeEnvironment = {
      params: { items: { kind: 'array', elementType: { kind: 'any' } } },
    };
    expectSuccess('params.items.length > 0', env);
  });

  test('unknown identifier reports error', () => {
    expectError('unknown > 0', 'UNKNOWN_IDENTIFIER');
  });

  test('function call in WHERE binding', () => {
    const env: TypeEnvironment = {
      params: { x: { kind: 'number' } },
    };
    expectSuccess('(params.x > threshold) WHERE threshold = MAX(10, 20)', env);
  });
});

// ============================================================================
// Params Namespace Restrictions
// ============================================================================

describe('advancedConditions/typeChecker: params namespace restrictions', () => {
  test('params access allowed when no paramsDisallowedReason', () => {
    const env: TypeEnvironment = {
      params: { amount: { kind: 'number' } },
    };
    expectSuccess('params.amount > 100', env);
  });

  test('params access blocked when paramsDisallowedReason is set', () => {
    const env: TypeEnvironment = {
      params: { amount: { kind: 'number' } },
      paramsDisallowedReason: 'PARAMS namespace requires a single tool to be selected',
    };
    expectError('params.amount > 100', 'PARAMS_NOT_ALLOWED', env);
  });

  test('bare PARAMS identifier blocked when paramsDisallowedReason is set', () => {
    const env: TypeEnvironment = {
      paramsDisallowedReason: 'Select exactly one tool to use tool parameters',
    };
    // Using PARAMS.field in expression
    expectError('params.field = "test"', 'PARAMS_NOT_ALLOWED', env);
  });

  test('error message contains the reason', () => {
    const customReason = 'Custom error message for testing';
    const env: TypeEnvironment = {
      paramsDisallowedReason: customReason,
    };
    const result = check('params.value = 1', env);
    expect(result.success).toBe(false);
    expect(result.errors[0]?.message).toContain(customReason);
  });

  test('other namespaces still work when params is disallowed', () => {
    const env: TypeEnvironment = {
      paramsDisallowedReason: 'PARAMS not available',
    };
    // TIME namespace should still work
    expectSuccess('TIME.hourOfDay >= 9', env);
    expectSuccess('TIME.dayOfWeek < 5', env);
  });

  test('globals still work when params is disallowed', () => {
    const env: TypeEnvironment = {
      paramsDisallowedReason: 'PARAMS not available',
      globals: {
        COMPANY: { maxAmount: { kind: 'number' } },
      },
    };
    expectSuccess('COMPANY.maxAmount > 1000', env);
  });
});
