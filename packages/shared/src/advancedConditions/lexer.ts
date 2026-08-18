/**
 * Advanced Conditions - Lexer
 *
 * Tokenizes expression strings into tokens with source positions.
 * Keywords are case-insensitive (AND, And, and all work).
 */

import { createError, createSpan } from './errors.js';
import type { ConditionError, SourcePosition, Token, TokenType } from './types.js';

/**
 * Keywords mapped to their token types (lowercase for comparison)
 */
const KEYWORDS: Map<string, TokenType> = new Map([
  ['and', 'AND'],
  ['or', 'OR'],
  ['not', 'NOT'],
  ['where', 'WHERE'],
  ['like', 'LIKE'],
  ['matches', 'MATCHES'],
  ['in', 'IN'],
  ['exists', 'EXISTS'],
  ['true', 'TRUE'],
  ['false', 'FALSE'],
  ['null', 'NULL'],
]);

/**
 * Result of lexing
 */
export interface LexResult {
  tokens: Token[];
  errors: ConditionError[];
}

/**
 * Lexer for advanced condition expressions
 */
export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private errors: ConditionError[] = [];

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the entire source
   */
  lex(): LexResult {
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.addToken('EOF', '');
    return { tokens: this.tokens, errors: this.errors };
  }

  private scanToken(): void {
    this.skipWhitespace();
    if (this.isAtEnd()) return;

    const startPos = this.currentPosition();
    const char = this.peek();

    // Single character tokens
    if (char === '(') {
      this.advance();
      this.addTokenWithSpan('LPAREN', '(', startPos);
      return;
    }
    if (char === ')') {
      this.advance();
      this.addTokenWithSpan('RPAREN', ')', startPos);
      return;
    }
    if (char === '[') {
      this.advance();
      this.addTokenWithSpan('LBRACKET', '[', startPos);
      return;
    }
    if (char === ']') {
      this.advance();
      this.addTokenWithSpan('RBRACKET', ']', startPos);
      return;
    }
    if (char === ',') {
      this.advance();
      this.addTokenWithSpan('COMMA', ',', startPos);
      return;
    }
    if (char === '.') {
      this.advance();
      this.addTokenWithSpan('DOT', '.', startPos);
      return;
    }
    if (char === ':') {
      this.advance();
      this.addTokenWithSpan('COLON', ':', startPos);
      return;
    }
    if (char === '+') {
      this.advance();
      this.addTokenWithSpan('PLUS', '+', startPos);
      return;
    }
    if (char === '-') {
      this.advance();
      this.addTokenWithSpan('MINUS', '-', startPos);
      return;
    }
    if (char === '/') {
      this.advance();
      this.addTokenWithSpan('SLASH', '/', startPos);
      return;
    }

    // Multi-character tokens
    if (char === '*') {
      this.advance();
      if (this.peek() === '*') {
        this.advance();
        this.addTokenWithSpan('POWER', '**', startPos);
      } else {
        this.addTokenWithSpan('STAR', '*', startPos);
      }
      return;
    }

    if (char === '=') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
      }
      this.addTokenWithSpan('EQ', '=', startPos);
      return;
    }

    if (char === '!') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        this.addTokenWithSpan('NE', '!=', startPos);
      } else {
        // Treat standalone ! as NOT
        this.addTokenWithSpan('NOT', '!', startPos);
      }
      return;
    }

    if (char === '<') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        this.addTokenWithSpan('LE', '<=', startPos);
      } else if (this.peek() === '>') {
        this.advance();
        this.addTokenWithSpan('NE', '<>', startPos);
      } else {
        this.addTokenWithSpan('LT', '<', startPos);
      }
      return;
    }

    if (char === '>') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        this.addTokenWithSpan('GE', '>=', startPos);
      } else {
        this.addTokenWithSpan('GT', '>', startPos);
      }
      return;
    }

    // String literals
    if (char === '"' || char === "'") {
      this.scanString(char);
      return;
    }

    // Numbers
    if (this.isDigit(char)) {
      this.scanNumber();
      return;
    }

    // Identifiers and keywords
    if (this.isAlpha(char)) {
      this.scanIdentifier();
      return;
    }

    // Unknown character
    this.advance();
    this.errors.push(
      createError(
        'UNEXPECTED_CHARACTER',
        `Unexpected character: '${char}'`,
        createSpan(
          startPos.line,
          startPos.column,
          startPos.offset,
          this.line,
          this.column,
          this.pos,
        ),
      ),
    );
  }

  private scanString(quote: string): void {
    const startPos = this.currentPosition();
    this.advance(); // Skip opening quote

    let value = '';
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        if (!this.isAtEnd()) {
          const escaped = this.peek();
          this.advance();
          switch (escaped) {
            case 'n':
              value += '\n';
              break;
            case 't':
              value += '\t';
              break;
            case 'r':
              value += '\r';
              break;
            case '\\':
              value += '\\';
              break;
            case '"':
              value += '"';
              break;
            case "'":
              value += "'";
              break;
            default:
              value += escaped;
          }
        }
      } else {
        value += this.peek();
        this.advance();
      }
    }

    if (this.isAtEnd()) {
      this.errors.push(
        createError(
          'UNTERMINATED_STRING',
          'Unterminated string literal',
          createSpan(
            startPos.line,
            startPos.column,
            startPos.offset,
            this.line,
            this.column,
            this.pos,
          ),
        ),
      );
      return;
    }

    this.advance(); // Skip closing quote
    this.addTokenWithSpan('STRING', value, startPos);
  }

  private scanNumber(): void {
    const startPos = this.currentPosition();
    let value = '';

    while (this.isDigit(this.peek())) {
      value += this.peek();
      this.advance();
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += '.';
      this.advance();
      while (this.isDigit(this.peek())) {
        value += this.peek();
        this.advance();
      }
    }

    // Scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.peek();
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.peek();
        this.advance();
      }
      if (!this.isDigit(this.peek())) {
        this.errors.push(
          createError(
            'INVALID_NUMBER',
            'Invalid number: expected digits after exponent',
            createSpan(
              startPos.line,
              startPos.column,
              startPos.offset,
              this.line,
              this.column,
              this.pos,
            ),
          ),
        );
        return;
      }
      while (this.isDigit(this.peek())) {
        value += this.peek();
        this.advance();
      }
    }

    this.addTokenWithSpan('NUMBER', value, startPos);
  }

  private scanIdentifier(): void {
    const startPos = this.currentPosition();
    let value = '';

    while (this.isAlphaNumeric(this.peek())) {
      value += this.peek();
      this.advance();
    }

    // Check for keyword (case-insensitive)
    const keyword = KEYWORDS.get(value.toLowerCase());
    if (keyword) {
      // Handle boolean literals specially
      if (keyword === 'TRUE') {
        this.addTokenWithSpan('BOOLEAN', 'true', startPos);
      } else if (keyword === 'FALSE') {
        this.addTokenWithSpan('BOOLEAN', 'false', startPos);
      } else if (keyword === 'NULL') {
        this.addTokenWithSpan('NULL', 'null', startPos);
      } else {
        this.addTokenWithSpan(keyword, value, startPos);
      }
    } else {
      this.addTokenWithSpan('IDENTIFIER', value, startPos);
    }
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r') {
        this.advance();
      } else if (char === '\n') {
        this.line++;
        this.column = 0;
        this.advance();
      } else {
        break;
      }
    }
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.pos];
  }

  private peekNext(): string {
    if (this.pos + 1 >= this.source.length) return '\0';
    return this.source[this.pos + 1];
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  private currentPosition(): SourcePosition {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private addToken(type: TokenType, value: string): void {
    const pos = this.currentPosition();
    this.tokens.push({
      type,
      value,
      span: {
        start: pos,
        end: pos,
      },
    });
  }

  private addTokenWithSpan(type: TokenType, value: string, startPos: SourcePosition): void {
    this.tokens.push({
      type,
      value,
      span: {
        start: startPos,
        end: this.currentPosition(),
      },
    });
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}

/**
 * Tokenize a source string
 */
export function lex(source: string): LexResult {
  const lexer = new Lexer(source);
  return lexer.lex();
}
