/**
 * Advanced Conditions - Type Definitions
 *
 * This file defines all types for the advanced policy condition expression language.
 * The language supports SQL-like expressions with functions, operators, and WHERE clauses.
 */

// ============================================================================
// SOURCE LOCATION
// ============================================================================

/**
 * Position in source code (1-indexed for IDE compatibility)
 */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number; // 0-indexed byte offset from start
}

/**
 * Span in source code
 */
export interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

// ============================================================================
// TOKEN TYPES
// ============================================================================

export type TokenType =
  // Literals
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  // Identifiers
  | 'IDENTIFIER'
  // Keywords (case-insensitive)
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'WHERE'
  | 'LIKE'
  | 'MATCHES'
  | 'IN'
  | 'EXISTS'
  | 'TRUE'
  | 'FALSE'
  // Comparison operators
  | 'EQ' // = or ==
  | 'NE' // != or <>
  | 'LT' // <
  | 'LE' // <=
  | 'GT' // >
  | 'GE' // >=
  // Arithmetic operators
  | 'PLUS' // +
  | 'MINUS' // -
  | 'STAR' // *
  | 'SLASH' // /
  | 'POWER' // **
  // Punctuation
  | 'LPAREN' // (
  | 'RPAREN' // )
  | 'LBRACKET' // [
  | 'RBRACKET' // ]
  | 'COMMA' // ,
  | 'DOT' // .
  | 'COLON' // : (for namespaced vars like COMPANY.minId)
  // Special
  | 'EOF'
  | 'ERROR';

/**
 * A single token from the lexer
 */
export interface Token {
  type: TokenType;
  value: string;
  span: SourceSpan;
}

// ============================================================================
// AST NODE TYPES
// ============================================================================

export type ASTNodeType =
  // Expressions
  | 'BinaryExpr'
  | 'UnaryExpr'
  | 'CallExpr'
  | 'MemberExpr'
  | 'ArrayExpr'
  | 'IndexExpr'
  // Literals
  | 'NumberLiteral'
  | 'StringLiteral'
  | 'BooleanLiteral'
  | 'NullLiteral'
  | 'Identifier'
  // Special
  | 'WhereClause'
  | 'Assignment';

/**
 * Base interface for all AST nodes
 */
export interface ASTNodeBase {
  type: ASTNodeType;
  span: SourceSpan;
  /** Inferred type from type checker (populated during type checking) */
  inferredType?: ExpressionType;
}

/**
 * Binary expression: left op right
 */
export interface BinaryExpr extends ASTNodeBase {
  type: 'BinaryExpr';
  operator:
    | 'AND'
    | 'OR'
    | 'EQ'
    | 'NE'
    | 'LT'
    | 'LE'
    | 'GT'
    | 'GE'
    | 'PLUS'
    | 'MINUS'
    | 'STAR'
    | 'SLASH'
    | 'POWER'
    | 'LIKE'
    | 'MATCHES'
    | 'IN';
  left: ASTNode;
  right: ASTNode;
}

/**
 * Unary expression: op operand
 */
export interface UnaryExpr extends ASTNodeBase {
  type: 'UnaryExpr';
  operator: 'NOT' | 'MINUS';
  operand: ASTNode;
}

/**
 * Function call: name(args...)
 */
export interface CallExpr extends ASTNodeBase {
  type: 'CallExpr';
  callee: string; // Function name (uppercase)
  arguments: ASTNode[];
}

/**
 * Member access: object.property
 */
export interface MemberExpr extends ASTNodeBase {
  type: 'MemberExpr';
  object: ASTNode;
  property: string;
}

/**
 * Array literal: [a, b, c]
 */
export interface ArrayExpr extends ASTNodeBase {
  type: 'ArrayExpr';
  elements: ASTNode[];
}

/**
 * Index access: array[index]
 */
export interface IndexExpr extends ASTNodeBase {
  type: 'IndexExpr';
  object: ASTNode;
  index: ASTNode;
}

/**
 * Number literal: 123, 45.67
 */
export interface NumberLiteral extends ASTNodeBase {
  type: 'NumberLiteral';
  value: number;
}

/**
 * String literal: "hello" or 'hello'
 */
export interface StringLiteral extends ASTNodeBase {
  type: 'StringLiteral';
  value: string;
}

/**
 * Boolean literal: true or false
 */
export interface BooleanLiteral extends ASTNodeBase {
  type: 'BooleanLiteral';
  value: boolean;
}

/**
 * Null literal
 */
export interface NullLiteral extends ASTNodeBase {
  type: 'NullLiteral';
}

/**
 * Identifier: variable or field name
 */
export interface Identifier extends ASTNodeBase {
  type: 'Identifier';
  name: string;
}

/**
 * WHERE clause: (expr) WHERE name = value, ...
 */
export interface WhereClause extends ASTNodeBase {
  type: 'WhereClause';
  expression: ASTNode;
  bindings: Assignment[];
}

/**
 * Assignment in WHERE clause: name = value
 */
export interface Assignment extends ASTNodeBase {
  type: 'Assignment';
  name: string;
  value: ASTNode;
}

/**
 * Union of all AST node types
 */
export type ASTNode =
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | ArrayExpr
  | IndexExpr
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | Identifier
  | WhereClause
  | Assignment;

// ============================================================================
// TYPE SYSTEM
// ============================================================================

/**
 * Expression types for type checking
 */
export type ExpressionType =
  | { kind: 'number' }
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'array'; elementType: ExpressionType }
  | { kind: 'object'; properties?: Map<string, ExpressionType> }
  | { kind: 'any' } // For dynamic/unknown types
  | { kind: 'never' } // For type errors
  | { kind: 'union'; types: ExpressionType[] };

/**
 * Type compatibility check result
 */
export function isTypeCompatible(actual: ExpressionType, expected: ExpressionType): boolean {
  // Any matches anything
  if (actual.kind === 'any' || expected.kind === 'any') {
    return true;
  }

  // Never matches nothing
  if (actual.kind === 'never' || expected.kind === 'never') {
    return false;
  }

  // Handle unions
  if (expected.kind === 'union') {
    return expected.types.some((t) => isTypeCompatible(actual, t));
  }
  if (actual.kind === 'union') {
    return actual.types.every((t) => isTypeCompatible(t, expected));
  }

  // Same kind check
  if (actual.kind !== expected.kind) {
    return false;
  }

  // Array element type check
  if (actual.kind === 'array' && expected.kind === 'array') {
    return isTypeCompatible(actual.elementType, expected.elementType);
  }

  return true;
}

/**
 * Get a human-readable type name
 */
export function typeToString(type: ExpressionType): string {
  switch (type.kind) {
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `${typeToString(type.elementType)}[]`;
    case 'object':
      return 'object';
    case 'any':
      return 'any';
    case 'never':
      return 'never';
    case 'union':
      return type.types.map(typeToString).join(' | ');
  }
}

// ============================================================================
// PARSE RESULT
// ============================================================================

/**
 * Error from parsing or type checking
 */
export interface ConditionError {
  message: string;
  span: SourceSpan;
  code: ConditionErrorCode;
}

export type ConditionErrorCode =
  // Lexer errors
  | 'UNEXPECTED_CHARACTER'
  | 'UNTERMINATED_STRING'
  | 'INVALID_NUMBER'
  // Parser errors
  | 'UNEXPECTED_TOKEN'
  | 'EXPECTED_TOKEN'
  | 'MISSING_PARENTHESES'
  | 'AMBIGUOUS_PRECEDENCE'
  | 'UNEXPECTED_EOF'
  | 'INVALID_EXPRESSION'
  // Type errors
  | 'TYPE_MISMATCH'
  | 'UNKNOWN_FUNCTION'
  | 'UNKNOWN_VARIABLE'
  | 'UNKNOWN_IDENTIFIER'
  | 'WRONG_ARGUMENT_COUNT'
  | 'INVALID_OPERATOR'
  | 'NOT_CALLABLE'
  | 'NOT_INDEXABLE'
  | 'PROPERTY_NOT_FOUND'
  | 'EXPRESSION_NOT_BOOLEAN'
  | 'PARAMS_NOT_ALLOWED';

/**
 * Result of parsing an expression
 */
export interface ParseResult {
  success: boolean;
  ast: ASTNode | null;
  errors: ConditionError[];
}

/**
 * Result of type checking an expression
 */
export interface TypeCheckResult {
  success: boolean;
  errors: ConditionError[];
  /** Map from node offset to inferred type */
  typeMap: Map<number, ExpressionType>;
}

/**
 * Full parse and type check result for API
 */
export interface AdvancedConditionParseResult {
  success: boolean;
  ast: ASTNode | null;
  errors: ConditionError[];
  /** Inferred types by node offset for hover display */
  typeMap?: Map<number, ExpressionType>;
}

// ============================================================================
// STORED FORMAT
// ============================================================================

/**
 * Format stored in Policy.conditionExpression JSON field
 */
export interface StoredAdvancedCondition {
  /** The raw expression string */
  expression: string;
  /** The parsed AST (for faster evaluation) */
  ast: ASTNode;
  /** Schema version for future migrations */
  version: number;
}

/**
 * Condition mode for Policy model
 */
export type ConditionMode = 'SIMPLE' | 'ADVANCED';
