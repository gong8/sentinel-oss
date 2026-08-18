/**
 * Advanced Conditions - Function Registry
 *
 * Defines all built-in functions with their type signatures.
 */

import type { ExpressionType } from './types.js';

/**
 * Function parameter definition
 */
export interface FunctionParam {
  name: string;
  type: ExpressionType;
  optional?: boolean;
  variadic?: boolean; // Last param can accept multiple args
}

/**
 * Function signature definition
 */
export interface FunctionSignature {
  name: string;
  description: string;
  params: FunctionParam[];
  returnType: ExpressionType;
  /** For overloaded functions, multiple signatures */
  overloads?: FunctionSignature[];
}

/**
 * Type helpers
 */
const T = {
  number: { kind: 'number' } as ExpressionType,
  string: { kind: 'string' } as ExpressionType,
  boolean: { kind: 'boolean' } as ExpressionType,
  any: { kind: 'any' } as ExpressionType,
  null: { kind: 'null' } as ExpressionType,
  arrayOf: (elementType: ExpressionType): ExpressionType => ({
    kind: 'array',
    elementType,
  }),
  union: (...types: ExpressionType[]): ExpressionType => ({
    kind: 'union',
    types,
  }),
};

/**
 * Built-in function registry
 */
export const FUNCTION_REGISTRY: Map<string, FunctionSignature> = new Map();

// ============================================================================
// Number Functions
// ============================================================================

FUNCTION_REGISTRY.set('FLOOR', {
  name: 'FLOOR',
  description: 'Round down to nearest integer',
  params: [{ name: 'value', type: T.number }],
  returnType: T.number,
});

FUNCTION_REGISTRY.set('CEIL', {
  name: 'CEIL',
  description: 'Round up to nearest integer',
  params: [{ name: 'value', type: T.number }],
  returnType: T.number,
});

FUNCTION_REGISTRY.set('ROUND', {
  name: 'ROUND',
  description: 'Round to nearest integer (or specified decimal places)',
  params: [
    { name: 'value', type: T.number },
    { name: 'decimals', type: T.number, optional: true },
  ],
  returnType: T.number,
});

FUNCTION_REGISTRY.set('ABS', {
  name: 'ABS',
  description: 'Absolute value',
  params: [{ name: 'value', type: T.number }],
  returnType: T.number,
});

// ============================================================================
// Aggregate Functions (work on arrays or variadic args)
// ============================================================================

FUNCTION_REGISTRY.set('MAX', {
  name: 'MAX',
  description: 'Maximum value: MAX(array) or MAX(val1, val2, ...)',
  params: [{ name: 'values', type: T.number, variadic: true }],
  returnType: T.number,
  overloads: [
    {
      name: 'MAX',
      description: 'Maximum value from an array',
      params: [{ name: 'array', type: T.arrayOf(T.number) }],
      returnType: T.number,
    },
  ],
});

FUNCTION_REGISTRY.set('MIN', {
  name: 'MIN',
  description: 'Minimum value: MIN(array) or MIN(val1, val2, ...)',
  params: [{ name: 'values', type: T.number, variadic: true }],
  returnType: T.number,
  overloads: [
    {
      name: 'MIN',
      description: 'Minimum value from an array',
      params: [{ name: 'array', type: T.arrayOf(T.number) }],
      returnType: T.number,
    },
  ],
});

FUNCTION_REGISTRY.set('SUM', {
  name: 'SUM',
  description: 'Sum of values: SUM(array) or SUM(val1, val2, ...)',
  params: [{ name: 'values', type: T.number, variadic: true }],
  returnType: T.number,
  overloads: [
    {
      name: 'SUM',
      description: 'Sum of values from an array',
      params: [{ name: 'array', type: T.arrayOf(T.number) }],
      returnType: T.number,
    },
  ],
});

FUNCTION_REGISTRY.set('AVG', {
  name: 'AVG',
  description: 'Average of values: AVG(array) or AVG(val1, val2, ...)',
  params: [{ name: 'values', type: T.number, variadic: true }],
  returnType: T.number,
  overloads: [
    {
      name: 'AVG',
      description: 'Average of values from an array',
      params: [{ name: 'array', type: T.arrayOf(T.number) }],
      returnType: T.number,
    },
  ],
});

FUNCTION_REGISTRY.set('COUNT', {
  name: 'COUNT',
  description: 'Count of elements in array',
  params: [{ name: 'array', type: T.arrayOf(T.any) }],
  returnType: T.number,
});

FUNCTION_REGISTRY.set('LEN', {
  name: 'LEN',
  description: 'Length of string or array',
  params: [{ name: 'value', type: T.union(T.string, T.arrayOf(T.any)) }],
  returnType: T.number,
});

// ============================================================================
// String Functions
// ============================================================================

FUNCTION_REGISTRY.set('LOWER', {
  name: 'LOWER',
  description: 'Convert string to lowercase',
  params: [{ name: 'value', type: T.string }],
  returnType: T.string,
});

FUNCTION_REGISTRY.set('UPPER', {
  name: 'UPPER',
  description: 'Convert string to uppercase',
  params: [{ name: 'value', type: T.string }],
  returnType: T.string,
});

FUNCTION_REGISTRY.set('TRIM', {
  name: 'TRIM',
  description: 'Remove leading and trailing whitespace',
  params: [{ name: 'value', type: T.string }],
  returnType: T.string,
});

FUNCTION_REGISTRY.set('SUBSTRING', {
  name: 'SUBSTRING',
  description: 'Extract substring (start is 1-indexed for SQL compatibility)',
  params: [
    { name: 'value', type: T.string },
    { name: 'start', type: T.number },
    { name: 'length', type: T.number, optional: true },
  ],
  returnType: T.string,
});

FUNCTION_REGISTRY.set('CONCAT', {
  name: 'CONCAT',
  description: 'Concatenate strings',
  params: [{ name: 'values', type: T.string, variadic: true }],
  returnType: T.string,
});

FUNCTION_REGISTRY.set('REPLACE', {
  name: 'REPLACE',
  description: 'Replace occurrences of search string with replacement',
  params: [
    { name: 'value', type: T.string },
    { name: 'search', type: T.string },
    { name: 'replacement', type: T.string },
  ],
  returnType: T.string,
});

FUNCTION_REGISTRY.set('SPLIT', {
  name: 'SPLIT',
  description: 'Split string into array by delimiter',
  params: [
    { name: 'value', type: T.string },
    { name: 'delimiter', type: T.string },
  ],
  returnType: T.arrayOf(T.string),
});

// ============================================================================
// Type Conversion Functions
// ============================================================================

FUNCTION_REGISTRY.set('NUMBER', {
  name: 'NUMBER',
  description:
    'Convert string to number (integer or decimal). Returns default if conversion fails.',
  params: [
    { name: 'value', type: T.string },
    { name: 'default', type: T.number, optional: true },
  ],
  returnType: T.number,
});

FUNCTION_REGISTRY.set('STRING', {
  name: 'STRING',
  description: 'Convert to string',
  params: [{ name: 'value', type: T.any }],
  returnType: T.string,
});

FUNCTION_REGISTRY.set('BOOL', {
  name: 'BOOL',
  description: 'Convert to boolean',
  params: [{ name: 'value', type: T.any }],
  returnType: T.boolean,
});

// ============================================================================
// Existence/Null Functions
// ============================================================================

FUNCTION_REGISTRY.set('EXISTS', {
  name: 'EXISTS',
  description: 'Check if value exists (not null/undefined)',
  params: [{ name: 'value', type: T.any }],
  returnType: T.boolean,
});

FUNCTION_REGISTRY.set('COALESCE', {
  name: 'COALESCE',
  description: 'Return first non-null value',
  params: [{ name: 'values', type: T.any, variadic: true }],
  returnType: T.any,
});

FUNCTION_REGISTRY.set('IFNULL', {
  name: 'IFNULL',
  description: 'Return second value if first is null',
  params: [
    { name: 'value', type: T.any },
    { name: 'default', type: T.any },
  ],
  returnType: T.any,
});

// ============================================================================
// Conditional Functions
// ============================================================================

FUNCTION_REGISTRY.set('IF', {
  name: 'IF',
  description: 'Conditional expression: IF(condition, thenValue, elseValue)',
  params: [
    { name: 'condition', type: T.boolean },
    { name: 'thenValue', type: T.any },
    { name: 'elseValue', type: T.any },
  ],
  returnType: T.any,
});

// ============================================================================
// Array Functions
// ============================================================================

FUNCTION_REGISTRY.set('CONTAINS', {
  name: 'CONTAINS',
  description: 'Check if array contains a value',
  params: [
    { name: 'array', type: T.arrayOf(T.any) },
    { name: 'value', type: T.any },
  ],
  returnType: T.boolean,
});

FUNCTION_REGISTRY.set('FIRST', {
  name: 'FIRST',
  description: 'Get first element of array',
  params: [{ name: 'array', type: T.arrayOf(T.any) }],
  returnType: T.any,
});

FUNCTION_REGISTRY.set('LAST', {
  name: 'LAST',
  description: 'Get last element of array',
  params: [{ name: 'array', type: T.arrayOf(T.any) }],
  returnType: T.any,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get function signature by name (case-insensitive)
 */
export function getFunction(name: string): FunctionSignature | undefined {
  return FUNCTION_REGISTRY.get(name.toUpperCase());
}

/**
 * Get all function names
 */
export function getFunctionNames(): string[] {
  return Array.from(FUNCTION_REGISTRY.keys());
}

/**
 * Check if a function exists
 */
export function hasFunction(name: string): boolean {
  return FUNCTION_REGISTRY.has(name.toUpperCase());
}

/**
 * Get function documentation for autocomplete
 */
export function getFunctionDocs(): Array<{
  name: string;
  description: string;
  signature: string;
  returnType: string;
}> {
  const docs: Array<{ name: string; description: string; signature: string; returnType: string }> =
    [];

  for (const func of FUNCTION_REGISTRY.values()) {
    const params = func.params
      .map((p) => {
        let paramStr = p.name;
        if (p.optional) paramStr += '?';
        if (p.variadic) paramStr += '...';
        return paramStr;
      })
      .join(', ');

    docs.push({
      name: func.name,
      description: func.description,
      signature: `${func.name}(${params})`,
      returnType: formatType(func.returnType),
    });
  }

  return docs;
}

/**
 * Signature help result
 */
export interface SignatureHelp {
  functionName: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    optional?: boolean;
    variadic?: boolean;
  }>;
  activeParameter: number;
  returnType: string;
}

/**
 * Format an ExpressionType to a readable string
 */
function formatType(type: ExpressionType): string {
  switch (type.kind) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'null':
    case 'any':
      return type.kind;
    case 'array':
      return `${formatType(type.elementType)}[]`;
    case 'object':
      return 'object';
    case 'union':
      return type.types.map(formatType).join(' | ');
    default:
      return 'unknown';
  }
}

/**
 * Check if cursor position is inside a string literal
 */
function isInsideString(text: string, cursorPos: number): boolean {
  let inString: '"' | "'" | null = null;

  for (let i = 0; i < cursorPos; i++) {
    const char = text[i];

    if (char === '\\' && i + 1 < cursorPos) {
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      if (inString === null) {
        inString = char;
      } else if (inString === char) {
        inString = null;
      }
    }
  }

  return inString !== null;
}

/**
 * Get signature help for the cursor position in an expression
 * Returns null if cursor is not inside a function call
 */
export function getSignatureHelp(expression: string, cursorOffset: number): SignatureHelp | null {
  // Don't show signature help inside string literals
  if (isInsideString(expression, cursorOffset)) {
    return null;
  }

  // Find the function call containing the cursor
  // Work backwards from cursor to find opening paren and function name

  let parenDepth = 0;
  let openParenPos = -1;
  let commaCount = 0;

  // Scan backwards from cursor to find the opening paren of current function context
  for (let i = cursorOffset - 1; i >= 0; i--) {
    const char = expression[i];

    // Skip string literals
    if (char === '"' || char === "'") {
      const quote = char;
      i--;
      while (i >= 0 && expression[i] !== quote) {
        if (expression[i] === '\\') i--;
        i--;
      }
      continue;
    }

    if (char === ')') {
      parenDepth++;
    } else if (char === '(') {
      if (parenDepth === 0) {
        openParenPos = i;
        break;
      }
      parenDepth--;
    } else if (char === ',' && parenDepth === 0) {
      commaCount++;
    }
  }

  if (openParenPos < 0) {
    return null;
  }

  // Extract function name (identifier before the opening paren)
  let funcNameEnd = openParenPos;
  // Skip whitespace
  while (funcNameEnd > 0 && /\s/.test(expression[funcNameEnd - 1])) {
    funcNameEnd--;
  }

  let funcNameStart = funcNameEnd;
  while (funcNameStart > 0 && /[a-zA-Z_]/.test(expression[funcNameStart - 1])) {
    funcNameStart--;
  }

  const funcName = expression.slice(funcNameStart, funcNameEnd);
  if (!funcName) {
    return null;
  }

  // Look up the function
  const func = getFunction(funcName);
  if (!func) {
    return null;
  }

  // Format parameters
  const parameters = func.params.map((p) => ({
    name: p.name,
    type: formatType(p.type),
    optional: p.optional,
    variadic: p.variadic,
  }));

  // Calculate active parameter index
  // For variadic functions, cap at last parameter
  let activeParameter = commaCount;
  if (func.params.length > 0) {
    const lastParam = func.params[func.params.length - 1];
    if (lastParam.variadic) {
      activeParameter = Math.min(activeParameter, func.params.length - 1);
    } else {
      activeParameter = Math.min(activeParameter, func.params.length - 1);
    }
  }

  return {
    functionName: func.name,
    description: func.description,
    parameters,
    activeParameter,
    returnType: formatType(func.returnType),
  };
}
