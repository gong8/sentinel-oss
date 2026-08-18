/**
 * Advanced Conditions - Parser
 *
 * Recursive descent parser for advanced condition expressions.
 * Enforces explicit parentheses for AND/OR to avoid precedence ambiguity.
 *
 * Grammar:
 *   expression     -> whereClause | orExpr
 *   whereClause    -> orExpr "WHERE" assignments
 *   assignments    -> assignment ("," assignment)*
 *   assignment     -> IDENTIFIER "=" orExpr
 *   orExpr         -> andExpr (("OR" andExpr)+ | ("AND" andExpr)+)?
 *   andExpr        -> notExpr
 *   notExpr        -> "NOT"? comparison
 *   comparison     -> addition (compOp addition)?
 *   compOp         -> "=" | "==" | "!=" | "<>" | "<" | "<=" | ">" | ">=" | "LIKE" | "MATCHES" | "IN"
 *   addition       -> multiplication (("+"|"-") multiplication)*
 *   multiplication -> power (("*"|"/") power)*
 *   power          -> unary ("**" power)?
 *   unary          -> "-" unary | call
 *   call           -> primary (callSuffix | memberSuffix | indexSuffix)*
 *   callSuffix     -> "(" arguments? ")"
 *   memberSuffix   -> "." IDENTIFIER
 *   indexSuffix    -> "[" expression "]"
 *   arguments      -> expression ("," expression)*
 *   primary        -> NUMBER | STRING | BOOLEAN | NULL | IDENTIFIER | "(" expression ")" | array
 *   array          -> "[" (expression ("," expression)*)? "]"
 */

import { createError, mergeSpans } from './errors.js';
import { lex } from './lexer.js';
import type {
  ArrayExpr,
  Assignment,
  ASTNode,
  BinaryExpr,
  BooleanLiteral,
  CallExpr,
  ConditionError,
  Identifier,
  IndexExpr,
  MemberExpr,
  NullLiteral,
  NumberLiteral,
  ParseResult,
  StringLiteral,
  Token,
  TokenType,
  UnaryExpr,
  WhereClause,
} from './types.js';

/**
 * Parser for advanced condition expressions
 */
export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private errors: ConditionError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse the token stream into an AST
   */
  parse(): ParseResult {
    try {
      if (this.isAtEnd()) {
        return {
          success: false,
          ast: null,
          errors: [
            createError('UNEXPECTED_EOF', 'Empty expression', {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 1, offset: 0 },
            }),
          ],
        };
      }

      const ast = this.expression();

      if (!this.isAtEnd()) {
        const token = this.peek();
        this.errors.push(
          createError(
            'UNEXPECTED_TOKEN',
            `Unexpected token: ${token.value || token.type}`,
            token.span,
          ),
        );
      }

      return {
        success: this.errors.length === 0,
        ast,
        errors: this.errors,
      };
    } catch {
      // Recovery: return partial AST with errors
      return {
        success: false,
        ast: null,
        errors: this.errors,
      };
    }
  }

  /**
   * expression -> whereClause | orExpr
   */
  private expression(): ASTNode {
    const expr = this.orExpr();

    // Check for WHERE clause
    if (this.match('WHERE')) {
      const whereToken = this.previous();
      const bindings = this.assignments();
      const whereClause: WhereClause = {
        type: 'WhereClause',
        expression: expr,
        bindings,
        span: mergeSpans([expr.span, whereToken.span, ...bindings.map((b) => b.span)]),
      };
      return whereClause;
    }

    return expr;
  }

  /**
   * assignments -> assignment ("," assignment)*
   */
  private assignments(): Assignment[] {
    const assignments: Assignment[] = [];
    assignments.push(this.assignment());

    while (this.match('COMMA')) {
      assignments.push(this.assignment());
    }

    return assignments;
  }

  /**
   * assignment -> IDENTIFIER "=" orExpr
   */
  private assignment(): Assignment {
    const nameToken = this.consume('IDENTIFIER', 'Expected variable name in WHERE clause');
    this.consume('EQ', "Expected '=' after variable name");
    const value = this.orExpr();

    return {
      type: 'Assignment',
      name: nameToken.value,
      value,
      span: mergeSpans([nameToken.span, value.span]),
    };
  }

  /**
   * orExpr -> andExpr (("OR" andExpr)+ | ("AND" andExpr)+)?
   *
   * Enforces: if mixing AND/OR, requires parentheses
   */
  private orExpr(): ASTNode {
    let left = this.notExpr();

    // Track which operator we see first
    let seenOperator: 'AND' | 'OR' | null = null;

    while (this.check('AND') || this.check('OR')) {
      const operator = this.peek().type as 'AND' | 'OR';

      // Check for ambiguous precedence
      if (seenOperator !== null && seenOperator !== operator) {
        this.errors.push(
          createError(
            'AMBIGUOUS_PRECEDENCE',
            `Cannot mix AND and OR without parentheses. Use (A AND B) OR C or A AND (B OR C)`,
            this.peek().span,
          ),
        );
        // Continue parsing to find more errors
      }

      seenOperator = operator;
      this.advance();
      const right = this.notExpr();

      const binaryExpr: BinaryExpr = {
        type: 'BinaryExpr',
        operator,
        left,
        right,
        span: mergeSpans([left.span, right.span]),
      };
      left = binaryExpr;
    }

    return left;
  }

  /**
   * notExpr -> "NOT"? comparison
   */
  private notExpr(): ASTNode {
    if (this.match('NOT')) {
      const opToken = this.previous();
      const operand = this.notExpr();
      const unaryExpr: UnaryExpr = {
        type: 'UnaryExpr',
        operator: 'NOT',
        operand,
        span: mergeSpans([opToken.span, operand.span]),
      };
      return unaryExpr;
    }

    return this.comparison();
  }

  /**
   * comparison -> addition (compOp addition)?
   */
  private comparison(): ASTNode {
    let left = this.addition();

    const compOps: TokenType[] = ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'LIKE', 'MATCHES', 'IN'];

    if (compOps.some((op) => this.check(op))) {
      const opToken = this.advance();
      const right = this.addition();

      const operator = this.tokenTypeToOperator(opToken.type);
      const binaryExpr: BinaryExpr = {
        type: 'BinaryExpr',
        operator,
        left,
        right,
        span: mergeSpans([left.span, right.span]),
      };
      return binaryExpr;
    }

    return left;
  }

  /**
   * addition -> multiplication (("+"|"-") multiplication)*
   */
  private addition(): ASTNode {
    let left = this.multiplication();

    while (this.check('PLUS') || this.check('MINUS')) {
      const opToken = this.advance();
      const right = this.multiplication();
      const operator = opToken.type === 'PLUS' ? 'PLUS' : 'MINUS';

      const binaryExpr: BinaryExpr = {
        type: 'BinaryExpr',
        operator,
        left,
        right,
        span: mergeSpans([left.span, right.span]),
      };
      left = binaryExpr;
    }

    return left;
  }

  /**
   * multiplication -> power (("*"|"/") power)*
   */
  private multiplication(): ASTNode {
    let left = this.power();

    while (this.check('STAR') || this.check('SLASH')) {
      const opToken = this.advance();
      const right = this.power();
      const operator = opToken.type === 'STAR' ? 'STAR' : 'SLASH';

      const binaryExpr: BinaryExpr = {
        type: 'BinaryExpr',
        operator,
        left,
        right,
        span: mergeSpans([left.span, right.span]),
      };
      left = binaryExpr;
    }

    return left;
  }

  /**
   * power -> unary ("**" power)?
   */
  private power(): ASTNode {
    const left = this.unary();

    if (this.match('POWER')) {
      const right = this.power(); // Right associative

      const binaryExpr: BinaryExpr = {
        type: 'BinaryExpr',
        operator: 'POWER',
        left,
        right,
        span: mergeSpans([left.span, right.span]),
      };
      return binaryExpr;
    }

    return left;
  }

  /**
   * unary -> "-" unary | call
   */
  private unary(): ASTNode {
    if (this.match('MINUS')) {
      const opToken = this.previous();
      const operand = this.unary();

      const unaryExpr: UnaryExpr = {
        type: 'UnaryExpr',
        operator: 'MINUS',
        operand,
        span: mergeSpans([opToken.span, operand.span]),
      };
      return unaryExpr;
    }

    return this.call();
  }

  /**
   * call -> primary (callSuffix | memberSuffix | indexSuffix)*
   */
  private call(): ASTNode {
    let expr = this.primary();

    while (true) {
      if (this.match('LPAREN')) {
        // Function call
        expr = this.finishCall(expr);
      } else if (this.match('DOT')) {
        // Member access
        const nameToken = this.consume('IDENTIFIER', 'Expected property name after "."');
        const memberExpr: MemberExpr = {
          type: 'MemberExpr',
          object: expr,
          property: nameToken.value,
          span: mergeSpans([expr.span, nameToken.span]),
        };
        expr = memberExpr;
      } else if (this.match('LBRACKET')) {
        // Index access
        const index = this.expression();
        const rbracket = this.consume('RBRACKET', 'Expected "]" after index');
        const indexExpr: IndexExpr = {
          type: 'IndexExpr',
          object: expr,
          index,
          span: mergeSpans([expr.span, rbracket.span]),
        };
        expr = indexExpr;
      } else {
        break;
      }
    }

    return expr;
  }

  /**
   * Finish parsing a function call
   */
  private finishCall(callee: ASTNode): CallExpr {
    const args: ASTNode[] = [];

    if (!this.check('RPAREN')) {
      do {
        args.push(this.expression());
      } while (this.match('COMMA'));
    }

    const rparen = this.consume('RPAREN', 'Expected ")" after arguments');

    // Get callee name - must be an identifier
    if (callee.type !== 'Identifier') {
      this.errors.push(
        createError('NOT_CALLABLE', 'Only identifiers can be called as functions', callee.span),
      );
    }

    const calleeName =
      callee.type === 'Identifier' ? (callee as Identifier).name.toUpperCase() : '?';

    return {
      type: 'CallExpr',
      callee: calleeName,
      arguments: args,
      span: mergeSpans([callee.span, rparen.span]),
    };
  }

  /**
   * primary -> NUMBER | STRING | BOOLEAN | NULL | IDENTIFIER | "(" expression ")" | array
   */
  private primary(): ASTNode {
    // Number literal
    if (this.match('NUMBER')) {
      const token = this.previous();
      const literal: NumberLiteral = {
        type: 'NumberLiteral',
        value: parseFloat(token.value),
        span: token.span,
      };
      return literal;
    }

    // String literal
    if (this.match('STRING')) {
      const token = this.previous();
      const literal: StringLiteral = {
        type: 'StringLiteral',
        value: token.value,
        span: token.span,
      };
      return literal;
    }

    // Boolean literal
    if (this.match('BOOLEAN')) {
      const token = this.previous();
      const literal: BooleanLiteral = {
        type: 'BooleanLiteral',
        value: token.value === 'true',
        span: token.span,
      };
      return literal;
    }

    // Null literal
    if (this.match('NULL')) {
      const token = this.previous();
      const literal: NullLiteral = {
        type: 'NullLiteral',
        span: token.span,
      };
      return literal;
    }

    // Identifier
    if (this.match('IDENTIFIER')) {
      const token = this.previous();
      const identifier: Identifier = {
        type: 'Identifier',
        name: token.value,
        span: token.span,
      };
      return identifier;
    }

    // Grouped expression
    if (this.match('LPAREN')) {
      const lparen = this.previous();
      const expr = this.expression();
      const rparen = this.consume('RPAREN', 'Expected ")" after expression');
      // Preserve span to include parentheses
      expr.span = mergeSpans([lparen.span, expr.span, rparen.span]);
      return expr;
    }

    // Array literal
    if (this.match('LBRACKET')) {
      return this.array();
    }

    // Error: unexpected token
    const token = this.peek();
    this.errors.push(
      createError('UNEXPECTED_TOKEN', `Unexpected token: ${token.value || token.type}`, token.span),
    );

    // Return a dummy node to allow continued parsing
    const dummy: Identifier = {
      type: 'Identifier',
      name: '<error>',
      span: token.span,
    };
    this.advance();
    return dummy;
  }

  /**
   * array -> "[" (expression ("," expression)*)? "]"
   */
  private array(): ArrayExpr {
    const lbracket = this.previous();
    const elements: ASTNode[] = [];

    if (!this.check('RBRACKET')) {
      do {
        elements.push(this.expression());
      } while (this.match('COMMA'));
    }

    const rbracket = this.consume('RBRACKET', 'Expected "]" after array elements');

    return {
      type: 'ArrayExpr',
      elements,
      span: mergeSpans([lbracket.span, rbracket.span]),
    };
  }

  /**
   * Convert token type to binary operator
   */
  private tokenTypeToOperator(type: TokenType): BinaryExpr['operator'] {
    switch (type) {
      case 'EQ':
        return 'EQ';
      case 'NE':
        return 'NE';
      case 'LT':
        return 'LT';
      case 'LE':
        return 'LE';
      case 'GT':
        return 'GT';
      case 'GE':
        return 'GE';
      case 'LIKE':
        return 'LIKE';
      case 'MATCHES':
        return 'MATCHES';
      case 'IN':
        return 'IN';
      default:
        throw new Error(`Unknown operator token: ${type}`);
    }
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    const token = this.peek();
    this.errors.push(createError('EXPECTED_TOKEN', message, token.span));

    // Return a dummy token to allow continued parsing
    return {
      type,
      value: '',
      span: token.span,
    };
  }
}

/**
 * Parse an expression string into an AST
 */
export function parse(source: string): ParseResult {
  const { tokens, errors: lexErrors } = lex(source);

  if (lexErrors.length > 0) {
    return {
      success: false,
      ast: null,
      errors: lexErrors,
    };
  }

  const parser = new Parser(tokens);
  const result = parser.parse();

  return {
    success: result.success && lexErrors.length === 0,
    ast: result.ast,
    errors: [...lexErrors, ...result.errors],
  };
}
