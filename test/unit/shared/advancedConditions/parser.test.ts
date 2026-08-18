/**
 * Advanced Conditions - Parser Unit Tests
 * Tests for parsing expressions into AST
 */

import { describe, expect, test } from 'vitest';
import { lex } from '../../../../packages/shared/src/advancedConditions/lexer.js';
import { parse, Parser } from '../../../../packages/shared/src/advancedConditions/parser.js';
import type {
  BinaryExpr,
  CallExpr,
  MemberExpr,
} from '../../../../packages/shared/src/advancedConditions/types.js';

// ============================================================================
// Literals
// ============================================================================

describe('advancedConditions/parser: literals', () => {
  test('parses number literals', () => {
    const result = parse('42');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('NumberLiteral');
    if (result.ast?.type === 'NumberLiteral') {
      expect(result.ast.value).toBe(42);
    }
  });

  test('parses decimal number literals', () => {
    const result = parse('3.14');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('NumberLiteral');
    if (result.ast?.type === 'NumberLiteral') {
      expect(result.ast.value).toBe(3.14);
    }
  });

  test('parses string literals (double quotes)', () => {
    const result = parse('"hello"');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('StringLiteral');
    if (result.ast?.type === 'StringLiteral') {
      expect(result.ast.value).toBe('hello');
    }
  });

  test('parses string literals (single quotes)', () => {
    const result = parse("'hello'");
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('StringLiteral');
    if (result.ast?.type === 'StringLiteral') {
      expect(result.ast.value).toBe('hello');
    }
  });

  test('parses boolean literals', () => {
    const trueResult = parse('true');
    expect(trueResult.success).toBe(true);
    expect(trueResult.ast?.type).toBe('BooleanLiteral');
    if (trueResult.ast?.type === 'BooleanLiteral') {
      expect(trueResult.ast.value).toBe(true);
    }

    const falseResult = parse('false');
    expect(falseResult.success).toBe(true);
    expect(falseResult.ast?.type).toBe('BooleanLiteral');
    if (falseResult.ast?.type === 'BooleanLiteral') {
      expect(falseResult.ast.value).toBe(false);
    }
  });

  test('parses null literal', () => {
    const result = parse('null');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('NullLiteral');
  });

  test('parses identifiers', () => {
    const result = parse('myVariable');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('Identifier');
    if (result.ast?.type === 'Identifier') {
      expect(result.ast.name).toBe('myVariable');
    }
  });
});

// ============================================================================
// Array Expressions
// ============================================================================

describe('advancedConditions/parser: arrays', () => {
  test('parses empty array', () => {
    const result = parse('[]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('ArrayExpr');
    if (result.ast?.type === 'ArrayExpr') {
      expect(result.ast.elements).toHaveLength(0);
    }
  });

  test('parses array with single element', () => {
    const result = parse('[1]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('ArrayExpr');
    if (result.ast?.type === 'ArrayExpr') {
      expect(result.ast.elements).toHaveLength(1);
    }
  });

  test('parses array with multiple elements', () => {
    const result = parse('[1, 2, 3]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('ArrayExpr');
    if (result.ast?.type === 'ArrayExpr') {
      expect(result.ast.elements).toHaveLength(3);
    }
  });

  test('parses array with mixed types', () => {
    const result = parse('[1, "two", true, null]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('ArrayExpr');
    if (result.ast?.type === 'ArrayExpr') {
      expect(result.ast.elements).toHaveLength(4);
    }
  });

  test('parses nested arrays', () => {
    const result = parse('[[1, 2], [3, 4]]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('ArrayExpr');
  });
});

// ============================================================================
// Binary Expressions - Comparison
// ============================================================================

describe('advancedConditions/parser: comparison operators', () => {
  test('parses equals (=)', () => {
    const result = parse('a = 1');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('EQ');
    }
  });

  test('parses not equals (!=)', () => {
    const result = parse('a != 1');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('NE');
    }
  });

  test('parses not equals (<>)', () => {
    const result = parse('a <> 1');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('NE');
    }
  });

  test('parses less than (<)', () => {
    const result = parse('a < 1');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('LT');
    }
  });

  test('parses less than or equal (<=)', () => {
    const result = parse('a <= 1');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('LE');
    }
  });

  test('parses greater than (>)', () => {
    const result = parse('a > 1');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('GT');
    }
  });

  test('parses greater than or equal (>=)', () => {
    const result = parse('a >= 1');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('GE');
    }
  });

  test('parses LIKE', () => {
    const result = parse("name LIKE '%test%'");
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('LIKE');
    }
  });

  test('parses MATCHES', () => {
    const result = parse("email MATCHES '^[a-z]+@'");
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('MATCHES');
    }
  });

  test('parses IN', () => {
    const result = parse("status IN ['active', 'pending']");
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('IN');
    }
  });
});

// ============================================================================
// Binary Expressions - Arithmetic
// ============================================================================

describe('advancedConditions/parser: arithmetic operators', () => {
  test('parses addition', () => {
    const result = parse('a + b');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('PLUS');
    }
  });

  test('parses subtraction', () => {
    const result = parse('a - b');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('MINUS');
    }
  });

  test('parses multiplication', () => {
    const result = parse('a * b');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('STAR');
    }
  });

  test('parses division', () => {
    const result = parse('a / b');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('SLASH');
    }
  });

  test('parses power', () => {
    const result = parse('a ** b');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('POWER');
    }
  });

  test('respects arithmetic precedence: multiplication before addition', () => {
    const result = parse('a + b * c');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    const ast = result.ast as BinaryExpr;
    expect(ast.operator).toBe('PLUS');
    expect(ast.right.type).toBe('BinaryExpr');
  });

  test('respects power precedence (right associative)', () => {
    const result = parse('2 ** 3 ** 2');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    const ast = result.ast as BinaryExpr;
    expect(ast.operator).toBe('POWER');
    expect(ast.right.type).toBe('BinaryExpr');
  });
});

// ============================================================================
// Logical Operators
// ============================================================================

describe('advancedConditions/parser: logical operators', () => {
  test('parses AND', () => {
    const result = parse('(a = 1) AND (b = 2)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('AND');
    }
  });

  test('parses OR', () => {
    const result = parse('(a = 1) OR (b = 2)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    if (result.ast?.type === 'BinaryExpr') {
      expect(result.ast.operator).toBe('OR');
    }
  });

  test('parses NOT', () => {
    const result = parse('NOT (a = 1)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('UnaryExpr');
    if (result.ast?.type === 'UnaryExpr') {
      expect(result.ast.operator).toBe('NOT');
    }
  });

  test('parses chained AND', () => {
    const result = parse('(a = 1) AND (b = 2) AND (c = 3)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('parses chained OR', () => {
    const result = parse('(a = 1) OR (b = 2) OR (c = 3)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('reports error for mixed AND/OR without parentheses', () => {
    const result = parse('(a = 1) AND (b = 2) OR (c = 3)');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'AMBIGUOUS_PRECEDENCE')).toBe(true);
  });

  test('allows mixed AND/OR with proper parentheses', () => {
    const result = parse('((a = 1) AND (b = 2)) OR (c = 3)');
    expect(result.success).toBe(true);
  });

  test('allows mixed OR/AND with proper parentheses', () => {
    const result = parse('(a = 1) OR ((b = 2) AND (c = 3))');
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Unary Expressions
// ============================================================================

describe('advancedConditions/parser: unary operators', () => {
  test('parses unary minus', () => {
    const result = parse('-5');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('UnaryExpr');
    if (result.ast?.type === 'UnaryExpr') {
      expect(result.ast.operator).toBe('MINUS');
    }
  });

  test('parses double unary minus', () => {
    const result = parse('--5');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('UnaryExpr');
  });

  test('parses NOT with comparison', () => {
    const result = parse('NOT x = 5');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('UnaryExpr');
    if (result.ast?.type === 'UnaryExpr') {
      expect(result.ast.operator).toBe('NOT');
      expect(result.ast.operand.type).toBe('BinaryExpr');
    }
  });
});

// ============================================================================
// Function Calls
// ============================================================================

describe('advancedConditions/parser: function calls', () => {
  test('parses function with no arguments', () => {
    const result = parse('NOW()');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('CallExpr');
    if (result.ast?.type === 'CallExpr') {
      expect(result.ast.callee).toBe('NOW');
      expect(result.ast.arguments).toHaveLength(0);
    }
  });

  test('parses function with single argument', () => {
    const result = parse('ABS(-5)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('CallExpr');
    if (result.ast?.type === 'CallExpr') {
      expect(result.ast.callee).toBe('ABS');
      expect(result.ast.arguments).toHaveLength(1);
    }
  });

  test('parses function with multiple arguments', () => {
    const result = parse('MAX(1, 2, 3)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('CallExpr');
    if (result.ast?.type === 'CallExpr') {
      expect(result.ast.callee).toBe('MAX');
      expect(result.ast.arguments).toHaveLength(3);
    }
  });

  test('parses nested function calls', () => {
    const result = parse('FLOOR(ABS(-3.5))');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('CallExpr');
    const ast = result.ast as CallExpr;
    expect(ast.callee).toBe('FLOOR');
    expect(ast.arguments[0].type).toBe('CallExpr');
  });

  test('function names are case insensitive (stored uppercase)', () => {
    const result = parse('max(1, 2)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('CallExpr');
    if (result.ast?.type === 'CallExpr') {
      expect(result.ast.callee).toBe('MAX');
    }
  });

  test('reports error for non-identifier callee', () => {
    const result = parse('(a + b)(1, 2)');
    expect(result.errors.some((e) => e.code === 'NOT_CALLABLE')).toBe(true);
  });
});

// ============================================================================
// Member Access
// ============================================================================

describe('advancedConditions/parser: member access', () => {
  test('parses simple member access', () => {
    const result = parse('params.amount');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('MemberExpr');
    if (result.ast?.type === 'MemberExpr') {
      expect(result.ast.property).toBe('amount');
    }
  });

  test('parses chained member access', () => {
    const result = parse('params.user.name');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('MemberExpr');
    const ast = result.ast as MemberExpr;
    expect(ast.property).toBe('name');
    expect(ast.object.type).toBe('MemberExpr');
  });

  test('parses member access in comparison', () => {
    const result = parse('params.amount > 100');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });
});

// ============================================================================
// Index Access
// ============================================================================

describe('advancedConditions/parser: index access', () => {
  test('parses simple index access', () => {
    const result = parse('items[0]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('IndexExpr');
  });

  test('parses chained index access', () => {
    const result = parse('matrix[0][1]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('IndexExpr');
  });

  test('parses expression as index', () => {
    const result = parse('items[i + 1]');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('IndexExpr');
  });

  test('parses member + index access combined', () => {
    const result = parse('params.items[0].name');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('MemberExpr');
  });
});

// ============================================================================
// WHERE Clause
// ============================================================================

describe('advancedConditions/parser: WHERE clause', () => {
  test('parses WHERE with single binding', () => {
    const result = parse('(a > threshold) WHERE threshold = 10');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('WhereClause');
    if (result.ast?.type === 'WhereClause') {
      expect(result.ast.bindings).toHaveLength(1);
      expect(result.ast.bindings[0].name).toBe('threshold');
    }
  });

  test('parses WHERE with multiple bindings', () => {
    const result = parse('(a > min) WHERE min = 5, max = 10');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('WhereClause');
    if (result.ast?.type === 'WhereClause') {
      expect(result.ast.bindings).toHaveLength(2);
      expect(result.ast.bindings[0].name).toBe('min');
      expect(result.ast.bindings[1].name).toBe('max');
    }
  });

  test('parses WHERE with expression binding', () => {
    const result = parse('(price > threshold) WHERE threshold = basePrice * 1.5');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('WhereClause');
    if (result.ast?.type === 'WhereClause') {
      expect(result.ast.bindings[0].value.type).toBe('BinaryExpr');
    }
  });
});

// ============================================================================
// Grouped Expressions
// ============================================================================

describe('advancedConditions/parser: grouped expressions', () => {
  test('parses parenthesized expression', () => {
    const result = parse('(a + b)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('parses nested parentheses', () => {
    const result = parse('((a + b))');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('parentheses override precedence', () => {
    const result = parse('(a + b) * c');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
    const ast = result.ast as BinaryExpr;
    expect(ast.operator).toBe('STAR');
    expect(ast.left.type).toBe('BinaryExpr');
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('advancedConditions/parser: error handling', () => {
  test('reports error for empty expression', () => {
    const result = parse('');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNEXPECTED_EOF')).toBe(true);
  });

  test('reports error for unexpected token', () => {
    const result = parse('a + + b');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNEXPECTED_TOKEN')).toBe(true);
  });

  test('reports error for unclosed parenthesis', () => {
    const result = parse('(a + b');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'EXPECTED_TOKEN')).toBe(true);
  });

  test('reports error for unclosed bracket', () => {
    const result = parse('[1, 2, 3');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'EXPECTED_TOKEN')).toBe(true);
  });

  test('reports error for missing property after dot', () => {
    const result = parse('params.');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'EXPECTED_TOKEN')).toBe(true);
  });

  test('reports error for missing equals in WHERE binding', () => {
    const result = parse('(a > b) WHERE threshold');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'EXPECTED_TOKEN')).toBe(true);
  });

  test('reports error for trailing tokens', () => {
    const result = parse('a = 1 extra');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNEXPECTED_TOKEN')).toBe(true);
  });

  test('errors include source positions', () => {
    const result = parse('a + + b');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].span).toBeDefined();
    expect(result.errors[0].span.start.line).toBeDefined();
    expect(result.errors[0].span.start.column).toBeDefined();
  });
});

// ============================================================================
// Complex Expressions
// ============================================================================

describe('advancedConditions/parser: complex expressions', () => {
  test('parses complete policy expression', () => {
    const result = parse('(params.amount > 100) AND (context.hourOfDay >= 9)');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('parses expression with function and member access', () => {
    const result = parse('SUM(params.items.price) <= LIMITS.maxTotal');
    expect(result.success).toBe(true);
  });

  test('parses expression with WHERE and functions', () => {
    const result = parse(
      '(price > threshold) WHERE threshold = MAX(minPrice, params.basePrice * 1.5)',
    );
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('WhereClause');
  });

  test('parses expression with LIKE and AND', () => {
    const result = parse("(name LIKE '%admin%') AND (status = 'active')");
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('parses expression with IN and nested array', () => {
    const result = parse("role IN ['admin', 'manager', 'user']");
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('parses expression with function call syntax', () => {
    // Note: EXISTS is a keyword, so we test with a different function name
    const result = parse('LEN(params.email) > 0');
    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('BinaryExpr');
  });

  test('parses complex aggregate expression', () => {
    const result = parse('SUM(params.items.price) <= MAX(100, LIMITS.maxTotal)');
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Parser Class Direct Usage
// ============================================================================

describe('advancedConditions/parser: Parser class', () => {
  test('can be instantiated and used directly', () => {
    const { tokens } = lex('1 + 2');
    const parser = new Parser(tokens);
    const result = parser.parse();
    expect(result.success).toBe(true);
  });

  test('handles EOF-only tokens', () => {
    const { tokens } = lex('');
    const parser = new Parser(tokens);
    const result = parser.parse();
    expect(result.success).toBe(false);
  });
});
