/**
 * Advanced Conditions - Evaluator Unit Tests
 * Tests for runtime evaluation of expressions
 */

import { describe, expect, test } from 'vitest';
import {
  createEvaluationContext,
  evaluate,
  Evaluator,
  type EvaluationContext,
} from '../../../../packages/shared/src/advancedConditions/evaluator.js';
import { parse } from '../../../../packages/shared/src/advancedConditions/parser.js';

// ============================================================================
// Helper Functions
// ============================================================================

function eval_(expression: string, context: Partial<EvaluationContext> = {}): unknown {
  const parseResult = parse(expression);
  if (!parseResult.success || !parseResult.ast) {
    throw new Error(`Parse failed: ${parseResult.errors[0]?.message}`);
  }

  const fullContext: EvaluationContext = {
    params: context.params ?? {},
    context: context.context ?? {
      hourOfDay: 12,
      dayOfWeek: 3,
      timestamp: new Date('2024-01-15T12:00:00Z'),
    },
    globals: context.globals,
  };

  const result = evaluate(parseResult.ast, fullContext);
  if (!result.success) {
    throw new Error(`Evaluation failed: ${result.error}`);
  }
  return result.value;
}

function expectTrue(expression: string, context: Partial<EvaluationContext> = {}): void {
  const result = eval_(expression, context);
  expect(result).toBe(true);
}

function expectFalse(expression: string, context: Partial<EvaluationContext> = {}): void {
  const result = eval_(expression, context);
  expect(result).toBe(false);
}

function expectValue(
  expression: string,
  expected: unknown,
  context: Partial<EvaluationContext> = {},
): void {
  const result = eval_(expression, context);
  expect(result).toEqual(expected);
}

// ============================================================================
// Literals
// ============================================================================

describe('advancedConditions/evaluator: literals', () => {
  test('evaluates number literal', () => {
    expectValue('42 = 42', true);
  });

  test('evaluates string literal', () => {
    expectValue('"hello" = "hello"', true);
  });

  test('evaluates boolean literal', () => {
    expectValue('true', true);
    expectValue('false', false);
  });

  test('evaluates null literal', () => {
    expectValue('null = null', true);
  });

  test('evaluates array literal', () => {
    expectValue('[1, 2, 3][0] = 1', true);
  });
});

// ============================================================================
// Comparison Operators
// ============================================================================

describe('advancedConditions/evaluator: comparison operators', () => {
  test('equals (=)', () => {
    expectTrue('5 = 5');
    expectFalse('5 = 6');
    expectTrue('"hello" = "HELLO"'); // Case insensitive
  });

  test('not equals (!=)', () => {
    expectTrue('5 != 6');
    expectFalse('5 != 5');
  });

  test('less than (<)', () => {
    expectTrue('3 < 5');
    expectFalse('5 < 3');
    expectFalse('5 < 5');
  });

  test('less than or equal (<=)', () => {
    expectTrue('3 <= 5');
    expectTrue('5 <= 5');
    expectFalse('6 <= 5');
  });

  test('greater than (>)', () => {
    expectTrue('5 > 3');
    expectFalse('3 > 5');
    expectFalse('5 > 5');
  });

  test('greater than or equal (>=)', () => {
    expectTrue('5 >= 3');
    expectTrue('5 >= 5');
    expectFalse('3 >= 5');
  });
});

// ============================================================================
// LIKE and MATCHES
// ============================================================================

describe('advancedConditions/evaluator: LIKE operator', () => {
  test('LIKE with prefix wildcard', () => {
    expectTrue("'hello world' LIKE '%world'");
    expectFalse("'hello world' LIKE '%universe'");
  });

  test('LIKE with suffix wildcard', () => {
    expectTrue("'hello world' LIKE 'hello%'");
    expectFalse("'hello world' LIKE 'goodbye%'");
  });

  test('LIKE with both wildcards', () => {
    expectTrue("'hello world' LIKE '%lo wo%'");
    expectFalse("'hello world' LIKE '%xyz%'");
  });

  test('LIKE with single char wildcard', () => {
    expectTrue("'cat' LIKE 'c_t'");
    expectFalse("'cart' LIKE 'c_t'");
  });

  test('LIKE is case insensitive', () => {
    expectTrue("'HELLO' LIKE 'hello'");
    expectTrue("'hello' LIKE 'HELLO'");
  });
});

describe('advancedConditions/evaluator: MATCHES operator', () => {
  test('MATCHES with regex', () => {
    expectTrue("'user@example.com' MATCHES '^[a-z]+@[a-z]+\\.[a-z]+$'");
    expectFalse("'not-an-email' MATCHES '^[a-z]+@[a-z]+\\.[a-z]+$'");
  });

  test('MATCHES is case insensitive', () => {
    expectTrue("'HELLO' MATCHES 'hello'");
  });

  test('MATCHES with invalid regex returns false', () => {
    expectFalse("'test' MATCHES '[invalid(regex'");
  });
});

// ============================================================================
// IN Operator
// ============================================================================

describe('advancedConditions/evaluator: IN operator', () => {
  test('IN with matching value', () => {
    expectTrue("'admin' IN ['admin', 'user', 'guest']");
  });

  test('IN with non-matching value', () => {
    expectFalse("'superuser' IN ['admin', 'user', 'guest']");
  });

  test('IN with numbers', () => {
    expectTrue('5 IN [1, 3, 5, 7, 9]');
    expectFalse('2 IN [1, 3, 5, 7, 9]');
  });

  test('IN is case insensitive for strings', () => {
    expectTrue("'ADMIN' IN ['admin', 'user']");
  });

  test('IN with non-array returns false', () => {
    expectFalse("'test' IN 'notanarray'");
  });
});

// ============================================================================
// Logical Operators
// ============================================================================

describe('advancedConditions/evaluator: logical operators', () => {
  test('AND - both true', () => {
    expectTrue('(1 = 1) AND (2 = 2)');
  });

  test('AND - left false (short circuit)', () => {
    expectFalse('(1 = 2) AND (2 = 2)');
  });

  test('AND - right false', () => {
    expectFalse('(1 = 1) AND (2 = 3)');
  });

  test('OR - both true', () => {
    expectTrue('(1 = 1) OR (2 = 2)');
  });

  test('OR - left true (short circuit)', () => {
    expectTrue('(1 = 1) OR (2 = 3)');
  });

  test('OR - right true', () => {
    expectTrue('(1 = 2) OR (2 = 2)');
  });

  test('OR - both false', () => {
    expectFalse('(1 = 2) OR (3 = 4)');
  });

  test('NOT - negates true', () => {
    expectFalse('NOT true');
    expectFalse('NOT (1 = 1)');
  });

  test('NOT - negates false', () => {
    expectTrue('NOT false');
    expectTrue('NOT (1 = 2)');
  });
});

// ============================================================================
// Arithmetic Operators
// ============================================================================

describe('advancedConditions/evaluator: arithmetic operators', () => {
  test('addition', () => {
    expectValue('(2 + 3) = 5', true);
  });

  test('subtraction', () => {
    expectValue('(5 - 3) = 2', true);
  });

  test('multiplication', () => {
    expectValue('(2 * 3) = 6', true);
  });

  test('division', () => {
    expectValue('(10 / 2) = 5', true);
  });

  test('power', () => {
    expectValue('(2 ** 3) = 8', true);
  });

  test('string concatenation with +', () => {
    expectValue('("hello" + " world") = "hello world"', true);
  });

  test('mixed string/number concatenation', () => {
    expectValue('("value: " + 42) = "value: 42"', true);
  });

  test('unary minus', () => {
    expectValue('(-5) < 0', true);
  });
});

// ============================================================================
// Member Access
// ============================================================================

describe('advancedConditions/evaluator: member access', () => {
  test('params member access', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { amount: 150 },
    };
    expectTrue('params.amount > 100', ctx);
  });

  test('context member access', () => {
    const ctx: Partial<EvaluationContext> = {
      context: {
        hourOfDay: 14,
        dayOfWeek: 3,
        timestamp: new Date(),
      },
    };
    expectTrue('context.hourOfDay = 14', ctx);
  });

  test('nested member access', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { user: { name: 'John' } },
    };
    expectTrue("params.user.name = 'John'", ctx);
  });

  test('global variable access', () => {
    const ctx: Partial<EvaluationContext> = {
      globals: {
        LIMITS: { maxAmount: 1000 },
      },
    };
    expectTrue('LIMITS.maxAmount = 1000', ctx);
  });

  test('missing member returns false in comparison', () => {
    expectFalse('params.nonexistent > 0');
  });
});

// ============================================================================
// Index Access
// ============================================================================

describe('advancedConditions/evaluator: index access', () => {
  test('array index access', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { items: [10, 20, 30] },
    };
    expectTrue('params.items[0] = 10', ctx);
    expectTrue('params.items[1] = 20', ctx);
    expectTrue('params.items[2] = 30', ctx);
  });

  test('string index access', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { name: 'hello' },
    };
    expectTrue("params.name[0] = 'h'", ctx);
  });

  test('out of bounds returns undefined (comparison false)', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { items: [1, 2, 3] },
    };
    expectFalse('params.items[99] > 0', ctx);
  });
});

// ============================================================================
// Function Calls - Number Functions
// ============================================================================

describe('advancedConditions/evaluator: number functions', () => {
  test('FLOOR rounds down', () => {
    expectValue('FLOOR(3.7) = 3', true);
    expectValue('FLOOR(-3.2) = -4', true);
  });

  test('CEIL rounds up', () => {
    expectValue('CEIL(3.2) = 4', true);
    expectValue('CEIL(-3.7) = -3', true);
  });

  test('ROUND rounds to nearest', () => {
    expectValue('ROUND(3.5) = 4', true);
    expectValue('ROUND(3.4) = 3', true);
  });

  test('ROUND with decimal places', () => {
    expectValue('ROUND(3.14159, 2) = 3.14', true);
  });

  test('ABS returns absolute value', () => {
    expectValue('ABS(-5) = 5', true);
    expectValue('ABS(5) = 5', true);
  });
});

// ============================================================================
// Function Calls - Aggregate Functions
// ============================================================================

describe('advancedConditions/evaluator: aggregate functions', () => {
  test('MAX with variadic args', () => {
    expectValue('MAX(1, 5, 3) = 5', true);
  });

  test('MAX with array', () => {
    expectValue('MAX([1, 5, 3]) = 5', true);
  });

  test('MIN with variadic args', () => {
    expectValue('MIN(1, 5, 3) = 1', true);
  });

  test('MIN with array', () => {
    expectValue('MIN([1, 5, 3]) = 1', true);
  });

  test('SUM with variadic args', () => {
    expectValue('SUM(1, 2, 3) = 6', true);
  });

  test('SUM with array', () => {
    expectValue('SUM([1, 2, 3]) = 6', true);
  });

  test('AVG with variadic args', () => {
    expectValue('AVG(2, 4, 6) = 4', true);
  });

  test('AVG with array', () => {
    expectValue('AVG([2, 4, 6]) = 4', true);
  });

  test('COUNT with array', () => {
    expectValue('COUNT([1, 2, 3]) = 3', true);
  });

  test('LEN with string', () => {
    expectValue("LEN('hello') = 5", true);
  });

  test('LEN with array', () => {
    expectValue('LEN([1, 2, 3]) = 3', true);
  });
});

// ============================================================================
// Function Calls - String Functions
// ============================================================================

describe('advancedConditions/evaluator: string functions', () => {
  test('LOWER converts to lowercase', () => {
    expectValue("LOWER('HELLO') = 'hello'", true);
  });

  test('UPPER converts to uppercase', () => {
    expectValue("UPPER('hello') = 'HELLO'", true);
  });

  test('TRIM removes whitespace', () => {
    expectValue("TRIM('  hello  ') = 'hello'", true);
  });

  test('SUBSTRING extracts portion (1-indexed)', () => {
    expectValue("SUBSTRING('hello', 2, 3) = 'ell'", true);
  });

  test('SUBSTRING without length', () => {
    expectValue("SUBSTRING('hello', 2) = 'ello'", true);
  });

  test('CONCAT joins strings', () => {
    expectValue("CONCAT('a', 'b', 'c') = 'abc'", true);
  });

  test('REPLACE replaces text', () => {
    expectValue("REPLACE('hello world', 'world', 'there') = 'hello there'", true);
  });

  test('SPLIT creates array', () => {
    expectValue("SPLIT('a,b,c', ',')[0] = 'a'", true);
    expectValue("SPLIT('a,b,c', ',')[1] = 'b'", true);
  });
});

// ============================================================================
// Function Calls - Type Conversion
// ============================================================================

describe('advancedConditions/evaluator: type conversion functions', () => {
  test('NUMBER converts string to integer', () => {
    expectValue("NUMBER('42') = 42", true);
  });

  test('NUMBER converts string to decimal', () => {
    expectValue("NUMBER('3.14') = 3.14", true);
    expectValue("NUMBER('-99.5') = -99.5", true);
  });

  test('NUMBER returns default for invalid string', () => {
    expectValue("NUMBER('not a number', 0) = 0", true);
    expectValue("NUMBER('abc', -1) = -1", true);
  });

  test('NUMBER returns NaN for invalid string without default', () => {
    // NaN != NaN, so we check via comparison failing
    expectFalse("NUMBER('invalid') = NUMBER('invalid')");
  });

  test('STRING converts to string', () => {
    expectValue("STRING(42) = '42'", true);
  });

  test('BOOL converts to boolean', () => {
    expectValue('BOOL(1) = true', true);
    expectValue('BOOL(0) = false', true);
  });
});

// ============================================================================
// Function Calls - Existence/Null Functions
// ============================================================================

describe('advancedConditions/evaluator: existence functions', () => {
  test('defined value is not equal to undefined', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { email: 'test@test.com' },
    };
    // Since EXISTS is a keyword, test existence via comparison
    expectTrue('params.email != params.nonexistent', ctx);
  });

  test('undefined value comparison', () => {
    // Two undefined values are equal
    expectTrue('params.a = params.b');
  });

  test('COALESCE returns first non-null', () => {
    expectValue("COALESCE(null, 'default') = 'default'", true);
    expectValue("COALESCE('value', 'default') = 'value'", true);
  });

  test('IFNULL returns default for null', () => {
    expectValue("IFNULL(null, 'default') = 'default'", true);
    expectValue("IFNULL('value', 'default') = 'value'", true);
  });
});

// ============================================================================
// Function Calls - Conditional
// ============================================================================

describe('advancedConditions/evaluator: conditional functions', () => {
  test('IF with true condition', () => {
    expectValue("IF(true, 'yes', 'no') = 'yes'", true);
  });

  test('IF with false condition', () => {
    expectValue("IF(false, 'yes', 'no') = 'no'", true);
  });

  test('IF with expression condition', () => {
    expectValue("IF(5 > 3, 'bigger', 'smaller') = 'bigger'", true);
  });
});

// ============================================================================
// Function Calls - Array Functions
// ============================================================================

describe('advancedConditions/evaluator: array functions', () => {
  test('CONTAINS with array', () => {
    expectTrue('CONTAINS([1, 2, 3], 2)');
    expectFalse('CONTAINS([1, 2, 3], 4)');
  });

  test('FIRST gets first element', () => {
    expectValue('FIRST([10, 20, 30]) = 10', true);
  });

  test('LAST gets last element', () => {
    expectValue('LAST([10, 20, 30]) = 30', true);
  });

  test('FIRST on empty array returns undefined', () => {
    expectFalse('FIRST([]) > 0');
  });
});

// ============================================================================
// WHERE Clause
// ============================================================================

describe('advancedConditions/evaluator: WHERE clause', () => {
  test('WHERE with single binding', () => {
    expectTrue('(5 > threshold) WHERE threshold = 3');
    expectFalse('(5 > threshold) WHERE threshold = 10');
  });

  test('WHERE with multiple bindings', () => {
    expectTrue('(5 > min) WHERE min = 3, max = 10');
  });

  test('WHERE with expression binding', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { basePrice: 100 },
    };
    expectTrue('(200 > threshold) WHERE threshold = params.basePrice * 1.5', ctx);
  });

  test('WHERE bindings are scoped', () => {
    // threshold is only available inside the WHERE clause
    expectTrue('(x > threshold) WHERE x = 10, threshold = 5');
  });
});

// ============================================================================
// Undefined/Missing Values
// ============================================================================

describe('advancedConditions/evaluator: undefined values', () => {
  test('missing field comparison returns false', () => {
    expectFalse('params.missing > 0');
    expectFalse('params.missing < 0');
  });

  test('undefined = undefined is true', () => {
    expectTrue('params.a = params.b'); // Both undefined
  });

  test('undefined != defined is true', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { defined: 'value' },
    };
    expectTrue('params.undefined != params.defined', ctx);
  });

  test('NOT undefined is true', () => {
    expectTrue('NOT params.missing');
  });

  test('undefined AND x returns false', () => {
    expectFalse('(params.missing > 0) AND true');
  });

  test('undefined OR true returns true', () => {
    expectTrue('(params.missing > 0) OR true');
  });
});

// ============================================================================
// Complex Expressions
// ============================================================================

describe('advancedConditions/evaluator: complex expressions', () => {
  test('nested function calls', () => {
    expectValue('FLOOR(ABS(-3.7)) = 3', true);
  });

  test('arithmetic in comparison', () => {
    expectTrue('(2 + 3) * 4 > 15');
  });

  test('combined member access and functions', () => {
    const ctx: Partial<EvaluationContext> = {
      params: { items: [10, 20, 30] },
    };
    expectTrue('SUM(params.items) = 60', ctx);
  });

  test('full policy-like expression', () => {
    const ctx: Partial<EvaluationContext> = {
      params: {
        amount: 150,
        status: 'active',
      },
      context: {
        hourOfDay: 14,
        dayOfWeek: 3,
        timestamp: new Date(),
      },
      globals: {
        LIMITS: { maxAmount: 1000 },
      },
    };

    expectTrue(
      "(params.amount <= LIMITS.maxAmount) AND (params.status = 'active') AND (context.hourOfDay >= 9)",
      ctx,
    );
  });
});

// ============================================================================
// Evaluator Class and createEvaluationContext
// ============================================================================

describe('advancedConditions/evaluator: Evaluator class', () => {
  test('can be instantiated and used directly', () => {
    const parseResult = parse('1 + 1 = 2');
    expect(parseResult.ast).not.toBeNull();

    const ctx: EvaluationContext = {
      params: {},
      context: { hourOfDay: 12, dayOfWeek: 3, timestamp: new Date() },
    };

    const evaluator = new Evaluator(ctx);
    const result = evaluator.evaluate(parseResult.ast!);
    expect(result.success).toBe(true);
    expect(result.value).toBe(true);
  });

  test('returns error for unknown function', () => {
    const parseResult = parse('UNKNOWN_FUNC(1) > 0');
    expect(parseResult.ast).not.toBeNull();

    const ctx: EvaluationContext = {
      params: {},
      context: { hourOfDay: 12, dayOfWeek: 3, timestamp: new Date() },
    };

    const evaluator = new Evaluator(ctx);
    const result = evaluator.evaluate(parseResult.ast!);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown function');
  });
});

describe('advancedConditions/evaluator: createEvaluationContext', () => {
  test('creates context with defaults', () => {
    const ctx = createEvaluationContext({ amount: 100 }, {});

    expect(ctx.params.amount).toBe(100);
    expect(ctx.context.hourOfDay).toBeDefined();
    expect(ctx.context.dayOfWeek).toBeDefined();
  });

  test('uses provided timestamp', () => {
    const timestamp = new Date('2024-06-15T10:30:00Z');
    const ctx = createEvaluationContext({}, { timestamp });

    expect(ctx.context.timestamp).toBe(timestamp.toISOString());
  });

  test('uses provided hour and day', () => {
    const ctx = createEvaluationContext({}, { hourOfDay: 15, dayOfWeek: 5 });

    expect(ctx.context.hourOfDay).toBe(15);
    expect(ctx.context.dayOfWeek).toBe(5);
  });

  test('includes globals', () => {
    const ctx = createEvaluationContext({}, {}, { COMPANY: { name: 'TestCorp' } });

    expect(ctx.globals?.COMPANY.name).toBe('TestCorp');
  });

  test('handles string timestamp', () => {
    const ctx = createEvaluationContext({}, { timestamp: '2024-06-15T10:30:00Z' });

    expect(ctx.context.timestamp).toBe('2024-06-15T10:30:00.000Z');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('advancedConditions/evaluator: edge cases', () => {
  test('empty array aggregates', () => {
    expectValue('MAX([]) = 0', true);
    expectValue('MIN([]) = 0', true);
    expectValue('SUM([]) = 0', true);
    expectValue('AVG([]) = 0', true);
  });

  test('division by zero returns Infinity', () => {
    // JavaScript returns Infinity for division by zero
    expectTrue('(1 / 0) > 1000000');
  });

  test('deeply nested member access', () => {
    const ctx: Partial<EvaluationContext> = {
      params: {
        a: { b: { c: { d: 'value' } } },
      },
    };
    expectTrue("params.a.b.c.d = 'value'", ctx);
  });

  test('array of objects with member access', () => {
    const ctx: Partial<EvaluationContext> = {
      params: {
        items: [{ price: 10 }, { price: 20 }, { price: 30 }],
      },
    };
    expectTrue('params.items[0].price = 10', ctx);
    expectTrue('params.items[1].price = 20', ctx);
  });
});
