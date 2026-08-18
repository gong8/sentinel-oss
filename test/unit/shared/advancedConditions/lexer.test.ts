/**
 * Advanced Conditions - Lexer Unit Tests
 * Tests for tokenizing expression strings
 */

import { describe, expect, test } from 'vitest';
import { lex, Lexer } from '../../../../packages/shared/src/advancedConditions/lexer.js';

// ============================================================================
// Token Types - Basic Tokens
// ============================================================================

describe('advancedConditions/lexer: basic tokens', () => {
  test('tokenizes parentheses', () => {
    const result = lex('()');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['LPAREN', 'RPAREN', 'EOF']);
  });

  test('tokenizes brackets', () => {
    const result = lex('[]');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['LBRACKET', 'RBRACKET', 'EOF']);
  });

  test('tokenizes comma', () => {
    const result = lex(',');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['COMMA', 'EOF']);
  });

  test('tokenizes dot', () => {
    const result = lex('.');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['DOT', 'EOF']);
  });

  test('tokenizes colon', () => {
    const result = lex(':');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['COLON', 'EOF']);
  });

  test('tokenizes arithmetic operators', () => {
    const result = lex('+ - * /');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['PLUS', 'MINUS', 'STAR', 'SLASH', 'EOF']);
  });

  test('tokenizes power operator', () => {
    const result = lex('**');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['POWER', 'EOF']);
  });
});

// ============================================================================
// Token Types - Comparison Operators
// ============================================================================

describe('advancedConditions/lexer: comparison operators', () => {
  test('tokenizes equals', () => {
    const result = lex('= ==');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['EQ', 'EQ', 'EOF']);
  });

  test('tokenizes not equals', () => {
    const result = lex('!= <>');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['NE', 'NE', 'EOF']);
  });

  test('tokenizes less than operators', () => {
    const result = lex('< <=');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['LT', 'LE', 'EOF']);
  });

  test('tokenizes greater than operators', () => {
    const result = lex('> >=');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['GT', 'GE', 'EOF']);
  });

  test('tokenizes standalone ! as NOT', () => {
    const result = lex('!');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['NOT', 'EOF']);
  });
});

// ============================================================================
// Token Types - Keywords
// ============================================================================

describe('advancedConditions/lexer: keywords', () => {
  test('tokenizes AND (case insensitive)', () => {
    const result = lex('AND and And');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'AND')).toHaveLength(3);
  });

  test('tokenizes OR (case insensitive)', () => {
    const result = lex('OR or Or');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'OR')).toHaveLength(3);
  });

  test('tokenizes NOT (case insensitive)', () => {
    const result = lex('NOT not Not');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'NOT')).toHaveLength(3);
  });

  test('tokenizes WHERE (case insensitive)', () => {
    const result = lex('WHERE where Where');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'WHERE')).toHaveLength(3);
  });

  test('tokenizes LIKE (case insensitive)', () => {
    const result = lex('LIKE like Like');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'LIKE')).toHaveLength(3);
  });

  test('tokenizes MATCHES (case insensitive)', () => {
    const result = lex('MATCHES matches Matches');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'MATCHES')).toHaveLength(3);
  });

  test('tokenizes IN (case insensitive)', () => {
    const result = lex('IN in In');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'IN')).toHaveLength(3);
  });

  test('tokenizes EXISTS (case insensitive)', () => {
    const result = lex('EXISTS exists Exists');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'EXISTS')).toHaveLength(3);
  });

  test('tokenizes boolean literals (case insensitive)', () => {
    const result = lex('true TRUE false FALSE');
    expect(result.errors).toHaveLength(0);
    const boolTokens = result.tokens.filter((t) => t.type === 'BOOLEAN');
    expect(boolTokens).toHaveLength(4);
    expect(boolTokens[0].value).toBe('true');
    expect(boolTokens[2].value).toBe('false');
  });

  test('tokenizes null literal (case insensitive)', () => {
    const result = lex('null NULL Null');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.filter((t) => t.type === 'NULL')).toHaveLength(3);
  });
});

// ============================================================================
// Token Types - Identifiers
// ============================================================================

describe('advancedConditions/lexer: identifiers', () => {
  test('tokenizes simple identifiers', () => {
    const result = lex('foo bar baz');
    expect(result.errors).toHaveLength(0);
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids.map((t) => t.value)).toEqual(['foo', 'bar', 'baz']);
  });

  test('tokenizes identifiers with underscores', () => {
    const result = lex('foo_bar _private __dunder__');
    expect(result.errors).toHaveLength(0);
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids.map((t) => t.value)).toEqual(['foo_bar', '_private', '__dunder__']);
  });

  test('tokenizes identifiers with numbers', () => {
    const result = lex('var1 test123 abc99');
    expect(result.errors).toHaveLength(0);
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids.map((t) => t.value)).toEqual(['var1', 'test123', 'abc99']);
  });

  test('preserves identifier case in value', () => {
    const result = lex('MyVariable');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens[0].value).toBe('MyVariable');
  });
});

// ============================================================================
// Token Types - Numbers
// ============================================================================

describe('advancedConditions/lexer: numbers', () => {
  test('tokenizes integers', () => {
    const result = lex('0 42 123456');
    expect(result.errors).toHaveLength(0);
    const nums = result.tokens.filter((t) => t.type === 'NUMBER');
    expect(nums.map((t) => t.value)).toEqual(['0', '42', '123456']);
  });

  test('tokenizes decimals', () => {
    const result = lex('3.14 0.5 123.456');
    expect(result.errors).toHaveLength(0);
    const nums = result.tokens.filter((t) => t.type === 'NUMBER');
    expect(nums.map((t) => t.value)).toEqual(['3.14', '0.5', '123.456']);
  });

  test('tokenizes scientific notation', () => {
    const result = lex('1e10 2.5E-3 3e+4');
    expect(result.errors).toHaveLength(0);
    const nums = result.tokens.filter((t) => t.type === 'NUMBER');
    expect(nums.map((t) => t.value)).toEqual(['1e10', '2.5E-3', '3e+4']);
  });

  test('reports error for invalid scientific notation', () => {
    const result = lex('1e');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('INVALID_NUMBER');
  });
});

// ============================================================================
// Token Types - Strings
// ============================================================================

describe('advancedConditions/lexer: strings', () => {
  test('tokenizes double-quoted strings', () => {
    const result = lex('"hello world"');
    expect(result.errors).toHaveLength(0);
    const strs = result.tokens.filter((t) => t.type === 'STRING');
    expect(strs[0].value).toBe('hello world');
  });

  test('tokenizes single-quoted strings', () => {
    const result = lex("'hello world'");
    expect(result.errors).toHaveLength(0);
    const strs = result.tokens.filter((t) => t.type === 'STRING');
    expect(strs[0].value).toBe('hello world');
  });

  test('tokenizes escape sequences', () => {
    const result = lex('"line1\\nline2\\ttab\\rcarriage"');
    expect(result.errors).toHaveLength(0);
    const strs = result.tokens.filter((t) => t.type === 'STRING');
    expect(strs[0].value).toBe('line1\nline2\ttab\rcarriage');
  });

  test('tokenizes escaped quotes', () => {
    const result = lex('"say \\"hello\\""');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens[0].value).toBe('say "hello"');
  });

  test('tokenizes escaped backslash', () => {
    const result = lex('"path\\\\to\\\\file"');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens[0].value).toBe('path\\to\\file');
  });

  test('reports error for unterminated string', () => {
    const result = lex('"unterminated');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('UNTERMINATED_STRING');
  });

  test('tokenizes empty strings', () => {
    const result = lex('""');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens[0].value).toBe('');
  });
});

// ============================================================================
// Whitespace Handling
// ============================================================================

describe('advancedConditions/lexer: whitespace', () => {
  test('ignores spaces', () => {
    const result = lex('   a   b   c   ');
    expect(result.errors).toHaveLength(0);
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids).toHaveLength(3);
  });

  test('ignores tabs', () => {
    const result = lex('\ta\t\tb\tc');
    expect(result.errors).toHaveLength(0);
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids).toHaveLength(3);
  });

  test('ignores newlines and tracks line numbers', () => {
    const result = lex('a\nb\nc');
    expect(result.errors).toHaveLength(0);
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids[0].span.start.line).toBe(1);
    expect(ids[1].span.start.line).toBe(2);
    expect(ids[2].span.start.line).toBe(3);
  });

  test('ignores carriage returns', () => {
    const result = lex('a\r\nb');
    expect(result.errors).toHaveLength(0);
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids).toHaveLength(2);
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('advancedConditions/lexer: errors', () => {
  test('reports unexpected characters', () => {
    const result = lex('@#$');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('UNEXPECTED_CHARACTER');
  });

  test('error includes source position', () => {
    const result = lex('abc @');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].span.start.column).toBe(5);
  });

  test('continues lexing after errors', () => {
    const result = lex('a @ b @ c');
    // Should still tokenize a, b, c
    const ids = result.tokens.filter((t) => t.type === 'IDENTIFIER');
    expect(ids).toHaveLength(3);
  });
});

// ============================================================================
// Source Positions
// ============================================================================

describe('advancedConditions/lexer: source positions', () => {
  test('tracks column positions', () => {
    const result = lex('foo bar');
    expect(result.tokens[0].span.start.column).toBe(1);
    expect(result.tokens[1].span.start.column).toBe(5);
  });

  test('tracks offsets', () => {
    const result = lex('ab cd');
    expect(result.tokens[0].span.start.offset).toBe(0);
    expect(result.tokens[1].span.start.offset).toBe(3);
  });

  test('tracks multi-character token spans', () => {
    const result = lex('>=');
    expect(result.tokens[0].span.start.offset).toBe(0);
    expect(result.tokens[0].span.end.offset).toBe(2);
  });
});

// ============================================================================
// Complex Expressions
// ============================================================================

describe('advancedConditions/lexer: complex expressions', () => {
  test('tokenizes arithmetic expression', () => {
    const result = lex('(a + b) * c / 2');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual([
      'LPAREN',
      'IDENTIFIER',
      'PLUS',
      'IDENTIFIER',
      'RPAREN',
      'STAR',
      'IDENTIFIER',
      'SLASH',
      'NUMBER',
      'EOF',
    ]);
  });

  test('tokenizes comparison with AND/OR', () => {
    const result = lex('(a > 5) AND (b < 10)');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual([
      'LPAREN',
      'IDENTIFIER',
      'GT',
      'NUMBER',
      'RPAREN',
      'AND',
      'LPAREN',
      'IDENTIFIER',
      'LT',
      'NUMBER',
      'RPAREN',
      'EOF',
    ]);
  });

  test('tokenizes function call', () => {
    const result = lex('MAX(a, b, c)');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual([
      'IDENTIFIER',
      'LPAREN',
      'IDENTIFIER',
      'COMMA',
      'IDENTIFIER',
      'COMMA',
      'IDENTIFIER',
      'RPAREN',
      'EOF',
    ]);
  });

  test('tokenizes member access', () => {
    const result = lex('params.amount >= 100');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual([
      'IDENTIFIER',
      'DOT',
      'IDENTIFIER',
      'GE',
      'NUMBER',
      'EOF',
    ]);
  });

  test('tokenizes array literal', () => {
    const result = lex('[1, 2, 3]');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual([
      'LBRACKET',
      'NUMBER',
      'COMMA',
      'NUMBER',
      'COMMA',
      'NUMBER',
      'RBRACKET',
      'EOF',
    ]);
  });

  test('tokenizes IN expression', () => {
    const result = lex("status IN ['active', 'pending']");
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual([
      'IDENTIFIER',
      'IN',
      'LBRACKET',
      'STRING',
      'COMMA',
      'STRING',
      'RBRACKET',
      'EOF',
    ]);
  });

  test('tokenizes WHERE clause', () => {
    const result = lex('(a > threshold) WHERE threshold = 10');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual([
      'LPAREN',
      'IDENTIFIER',
      'GT',
      'IDENTIFIER',
      'RPAREN',
      'WHERE',
      'IDENTIFIER',
      'EQ',
      'NUMBER',
      'EOF',
    ]);
  });

  test('tokenizes LIKE pattern', () => {
    const result = lex("name LIKE '%john%'");
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['IDENTIFIER', 'LIKE', 'STRING', 'EOF']);
  });

  test('tokenizes MATCHES pattern', () => {
    const result = lex("email MATCHES '^[a-z]+@'");
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['IDENTIFIER', 'MATCHES', 'STRING', 'EOF']);
  });
});

// ============================================================================
// Lexer Class Direct Usage
// ============================================================================

describe('advancedConditions/lexer: Lexer class', () => {
  test('can be instantiated and used directly', () => {
    const lexer = new Lexer('1 + 2');
    const result = lexer.lex();
    expect(result.errors).toHaveLength(0);
    expect(result.tokens).toHaveLength(4); // NUMBER, PLUS, NUMBER, EOF
  });

  test('returns EOF for empty input', () => {
    const lexer = new Lexer('');
    const result = lexer.lex();
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].type).toBe('EOF');
  });

  test('returns EOF for whitespace-only input', () => {
    const lexer = new Lexer('   \t\n  ');
    const result = lexer.lex();
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].type).toBe('EOF');
  });
});
