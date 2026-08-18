/**
 * Advanced Conditions - Error Utilities
 *
 * Provides utilities for creating and formatting errors with source locations.
 */

import type { ConditionError, ConditionErrorCode, SourcePosition, SourceSpan } from './types.js';

/**
 * Create a source position
 */
export function createPosition(line: number, column: number, offset: number): SourcePosition {
  return { line, column, offset };
}

/**
 * Create a source span
 */
export function createSpan(
  startLine: number,
  startColumn: number,
  startOffset: number,
  endLine: number,
  endColumn: number,
  endOffset: number,
): SourceSpan {
  return {
    start: createPosition(startLine, startColumn, startOffset),
    end: createPosition(endLine, endColumn, endOffset),
  };
}

/**
 * Create an error with source location
 */
export function createError(
  code: ConditionErrorCode,
  message: string,
  span: SourceSpan,
): ConditionError {
  return { code, message, span };
}

/**
 * Format an error for display
 */
export function formatError(error: ConditionError, source?: string): string {
  const { span, message } = error;
  const locationStr = `${span.start.line}:${span.start.column}`;

  if (!source) {
    return `[${locationStr}] ${message}`;
  }

  const lines = source.split('\n');
  const line = lines[span.start.line - 1] || '';
  const pointer = ' '.repeat(span.start.column - 1) + '^';

  return `Error at ${locationStr}: ${message}\n${line}\n${pointer}`;
}

/**
 * Format multiple errors for display
 */
export function formatErrors(errors: ConditionError[], source?: string): string {
  return errors.map((e) => formatError(e, source)).join('\n\n');
}

/**
 * Get a human-readable message for an error code
 */
export function getErrorCodeMessage(code: ConditionErrorCode): string {
  switch (code) {
    case 'UNEXPECTED_CHARACTER':
      return 'Unexpected character';
    case 'UNTERMINATED_STRING':
      return 'Unterminated string literal';
    case 'INVALID_NUMBER':
      return 'Invalid number';
    case 'UNEXPECTED_TOKEN':
      return 'Unexpected token';
    case 'EXPECTED_TOKEN':
      return 'Expected token';
    case 'MISSING_PARENTHESES':
      return 'Missing parentheses';
    case 'AMBIGUOUS_PRECEDENCE':
      return 'Ambiguous operator precedence - use parentheses';
    case 'UNEXPECTED_EOF':
      return 'Unexpected end of expression';
    case 'INVALID_EXPRESSION':
      return 'Invalid expression';
    case 'TYPE_MISMATCH':
      return 'Type mismatch';
    case 'UNKNOWN_FUNCTION':
      return 'Unknown function';
    case 'UNKNOWN_VARIABLE':
      return 'Unknown variable';
    case 'UNKNOWN_IDENTIFIER':
      return 'Unknown identifier';
    case 'WRONG_ARGUMENT_COUNT':
      return 'Wrong number of arguments';
    case 'INVALID_OPERATOR':
      return 'Invalid operator for these types';
    case 'NOT_CALLABLE':
      return 'Not a function';
    case 'NOT_INDEXABLE':
      return 'Cannot index this type';
    case 'PROPERTY_NOT_FOUND':
      return 'Property not found';
    case 'EXPRESSION_NOT_BOOLEAN':
      return 'Expression must evaluate to a boolean';
    case 'PARAMS_NOT_ALLOWED':
      return 'PARAMS namespace requires a single tool to be selected';
  }
}

/**
 * Merge multiple source spans into one
 */
export function mergeSpans(spans: SourceSpan[]): SourceSpan {
  if (spans.length === 0) {
    return createSpan(1, 1, 0, 1, 1, 0);
  }

  let minStart = spans[0].start;
  let maxEnd = spans[0].end;

  for (const span of spans) {
    if (span.start.offset < minStart.offset) {
      minStart = span.start;
    }
    if (span.end.offset > maxEnd.offset) {
      maxEnd = span.end;
    }
  }

  return { start: minStart, end: maxEnd };
}
