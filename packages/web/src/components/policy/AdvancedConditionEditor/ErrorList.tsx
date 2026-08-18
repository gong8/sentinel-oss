/**
 * Error List
 *
 * Displays a list of parse/type errors from the expression.
 */

import { AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ParseError {
  message: string;
  code: string;
  line: number;
  column: number;
}

interface ErrorListProps {
  errors: ParseError[];
  className?: string;
}

export function ErrorList({ errors, className }: ErrorListProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-1', className)}>
      {errors.map((error, index) => (
        <div
          key={`${error.line}-${error.column}-${index}`}
          className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="font-mono text-xs text-red-500 mr-2">
              [{error.line}:{error.column}]
            </span>
            <span>{error.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(code: string): string {
  switch (code) {
    case 'UNEXPECTED_CHARACTER':
      return 'Unexpected character in expression';
    case 'UNTERMINATED_STRING':
      return 'String is not closed - add a closing quote';
    case 'INVALID_NUMBER':
      return 'Invalid number format';
    case 'UNEXPECTED_TOKEN':
      return 'Unexpected token at this position';
    case 'EXPECTED_TOKEN':
      return 'Missing expected token';
    case 'MISSING_PARENTHESES':
      return 'Missing parentheses - enclose expression in ()';
    case 'AMBIGUOUS_PRECEDENCE':
      return 'Use parentheses to clarify AND/OR precedence';
    case 'UNEXPECTED_EOF':
      return 'Expression ended unexpectedly';
    case 'INVALID_EXPRESSION':
      return 'Invalid expression syntax';
    case 'TYPE_MISMATCH':
      return 'Type mismatch in expression';
    case 'UNKNOWN_FUNCTION':
      return 'Unknown function name';
    case 'UNKNOWN_VARIABLE':
      return 'Unknown variable or field';
    case 'WRONG_ARGUMENT_COUNT':
      return 'Wrong number of arguments for function';
    case 'INVALID_OPERATOR':
      return 'Operator cannot be used with these types';
    case 'NOT_CALLABLE':
      return 'Cannot call this as a function';
    case 'NOT_INDEXABLE':
      return 'Cannot use [] index on this type';
    case 'PROPERTY_NOT_FOUND':
      return 'Property not found';
    case 'EXPRESSION_NOT_BOOLEAN':
      return 'Expression must evaluate to true/false';
    default:
      return 'Syntax error';
  }
}
