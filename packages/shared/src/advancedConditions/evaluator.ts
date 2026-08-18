/**
 * Advanced Conditions - Evaluator
 *
 * Evaluates AST against actual runtime values.
 * Handles missing fields gracefully (comparisons return false).
 */

import type { ASTNode, SourceSpan } from './types.js';

/**
 * Evaluation context containing runtime values
 */
export interface EvaluationContext {
  /** Tool parameters (params.xxx) */
  params: Record<string, unknown>;
  /** Request context (context.xxx, TIME.xxx, NETWORK.xxx) */
  context: {
    hourOfDay: number;
    dayOfWeek: number;
    timestamp: Date | string;
    sourceIp?: string;
    timezone?: string;
    userAgent?: string;
    origin?: string;
    [key: string]: unknown;
  };
  /** Global variable namespaces (COMPANY.xxx, LIMITS.xxx) */
  globals?: Record<string, Record<string, unknown>>;
}

/**
 * Result of evaluation
 */
export interface EvaluationResult {
  success: boolean;
  value: unknown;
  error?: string;
  errorSpan?: SourceSpan;
}

/**
 * Special value representing undefined/missing field
 */
const UNDEFINED = Symbol('UNDEFINED');

/**
 * Check if value is missing/undefined
 */
function isUndefined(value: unknown): boolean {
  return value === UNDEFINED || value === undefined || value === null;
}

/**
 * Evaluator class
 */
export class Evaluator {
  private context: EvaluationContext;
  private locals: Map<string, unknown> = new Map();

  constructor(context: EvaluationContext) {
    this.context = context;
  }

  /**
   * Evaluate an AST node
   */
  evaluate(ast: ASTNode): EvaluationResult {
    try {
      const value = this.evalNode(ast);
      return {
        success: true,
        value: value === UNDEFINED ? false : value,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        value: false,
        error: message,
      };
    }
  }

  /**
   * Evaluate a single node
   */
  private evalNode(node: ASTNode): unknown {
    switch (node.type) {
      case 'NumberLiteral':
        return node.value;

      case 'StringLiteral':
        return node.value;

      case 'BooleanLiteral':
        return node.value;

      case 'NullLiteral':
        return null;

      case 'Identifier':
        return this.evalIdentifier(node.name);

      case 'ArrayExpr':
        return node.elements.map((e) => this.evalNode(e));

      case 'BinaryExpr':
        return this.evalBinary(node);

      case 'UnaryExpr':
        return this.evalUnary(node);

      case 'CallExpr':
        return this.evalCall(node);

      case 'MemberExpr':
        return this.evalMember(node);

      case 'IndexExpr':
        return this.evalIndex(node);

      case 'WhereClause':
        return this.evalWhere(node);

      case 'Assignment':
        return this.evalNode(node.value);

      default:
        return UNDEFINED;
    }
  }

  /**
   * Evaluate identifier
   */
  private evalIdentifier(name: string): unknown {
    // Check locals first
    if (this.locals.has(name)) {
      return this.locals.get(name);
    }

    // Check for namespace access
    const upperName = name.toUpperCase();
    if (upperName === 'PARAMS') {
      return this.context.params;
    }
    if (upperName === 'CONTEXT') {
      return this.context.context;
    }
    if (upperName === 'TIME') {
      return this.getTimeNamespace();
    }
    if (upperName === 'NETWORK') {
      return this.getNetworkNamespace();
    }

    // Check globals
    if (this.context.globals?.[upperName]) {
      return this.context.globals[upperName];
    }

    // Direct param access (shorthand for params.xxx)
    if (this.context.params && name in this.context.params) {
      return this.context.params[name];
    }

    return UNDEFINED;
  }

  /**
   * Evaluate member access
   */
  private evalMember(node: ASTNode & { type: 'MemberExpr' }): unknown {
    const object = this.evalNode(node.object);

    if (isUndefined(object)) {
      return UNDEFINED;
    }

    if (typeof object !== 'object' || object === null) {
      return UNDEFINED;
    }

    const value = (object as Record<string, unknown>)[node.property];
    return value === undefined ? UNDEFINED : value;
  }

  /**
   * Get TIME namespace values from context
   */
  private getTimeNamespace(): Record<string, unknown> {
    const ctx = this.context.context;
    const timestamp = ctx.timestamp instanceof Date ? ctx.timestamp : new Date(ctx.timestamp);

    return {
      hourOfDay: ctx.hourOfDay,
      dayOfWeek: ctx.dayOfWeek,
      dayOfMonth: timestamp.getDate(),
      month: timestamp.getMonth() + 1, // 1-12
      year: timestamp.getFullYear(),
      timestamp: timestamp.toISOString(),
      timezone: ctx.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Get NETWORK namespace values from context
   */
  private getNetworkNamespace(): Record<string, unknown> {
    const ctx = this.context.context;
    return {
      sourceIp: ctx.sourceIp ?? '',
      userAgent: ctx.userAgent ?? '',
      origin: ctx.origin ?? '',
    };
  }

  /**
   * Evaluate index access
   */
  private evalIndex(node: ASTNode & { type: 'IndexExpr' }): unknown {
    const object = this.evalNode(node.object);
    const index = this.evalNode(node.index);

    if (isUndefined(object) || isUndefined(index)) {
      return UNDEFINED;
    }

    if (Array.isArray(object) && typeof index === 'number') {
      const value = object[index];
      return value === undefined ? UNDEFINED : value;
    }

    if (typeof object === 'string' && typeof index === 'number') {
      const char = object[index];
      return char === undefined ? UNDEFINED : char;
    }

    return UNDEFINED;
  }

  /**
   * Evaluate binary expression
   */
  private evalBinary(node: ASTNode & { type: 'BinaryExpr' }): unknown {
    // Short-circuit for logical operators
    if (node.operator === 'AND') {
      const left = this.evalNode(node.left);
      if (isUndefined(left) || !left) return false;
      const right = this.evalNode(node.right);
      if (isUndefined(right)) return false;
      return Boolean(right);
    }

    if (node.operator === 'OR') {
      const left = this.evalNode(node.left);
      if (!isUndefined(left) && left) return true;
      const right = this.evalNode(node.right);
      if (isUndefined(right)) return false;
      return Boolean(right);
    }

    const left = this.evalNode(node.left);
    const right = this.evalNode(node.right);

    // Comparison with undefined returns false (per spec)
    if (node.operator !== 'EQ' && node.operator !== 'NE') {
      if (isUndefined(left) || isUndefined(right)) {
        return false;
      }
    }

    switch (node.operator) {
      case 'EQ':
        // Special handling for undefined comparisons
        if (isUndefined(left) && isUndefined(right)) return true;
        if (isUndefined(left) || isUndefined(right)) return false;
        return this.equals(left, right);

      case 'NE':
        if (isUndefined(left) && isUndefined(right)) return false;
        if (isUndefined(left) || isUndefined(right)) return true;
        return !this.equals(left, right);

      case 'LT':
        return this.compare(left, right) < 0;

      case 'LE':
        return this.compare(left, right) <= 0;

      case 'GT':
        return this.compare(left, right) > 0;

      case 'GE':
        return this.compare(left, right) >= 0;

      case 'LIKE':
        return this.evalLike(String(left), String(right));

      case 'MATCHES':
        return this.evalMatches(String(left), String(right));

      case 'IN':
        if (!Array.isArray(right)) return false;
        return right.some((item) => this.equals(left, item));

      case 'PLUS':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left) + String(right);
        }
        return Number(left) + Number(right);

      case 'MINUS':
        return Number(left) - Number(right);

      case 'STAR':
        return Number(left) * Number(right);

      case 'SLASH':
        return Number(left) / Number(right);

      case 'POWER':
        return Math.pow(Number(left), Number(right));

      default:
        return UNDEFINED;
    }
  }

  /**
   * Evaluate unary expression
   */
  private evalUnary(node: ASTNode & { type: 'UnaryExpr' }): unknown {
    const operand = this.evalNode(node.operand);

    switch (node.operator) {
      case 'NOT':
        if (isUndefined(operand)) return true; // NOT undefined = true
        return !operand;

      case 'MINUS':
        if (isUndefined(operand)) return UNDEFINED;
        return -Number(operand);

      default:
        return UNDEFINED;
    }
  }

  /**
   * Evaluate function call
   */
  private evalCall(node: ASTNode & { type: 'CallExpr' }): unknown {
    const funcName = node.callee;
    const args = node.arguments.map((a) => this.evalNode(a));

    return this.evalFunction(funcName, args);
  }

  /**
   * Evaluate WHERE clause
   */
  private evalWhere(node: ASTNode & { type: 'WhereClause' }): unknown {
    // Save current locals
    const savedLocals = new Map(this.locals);

    // Add bindings to locals
    for (const binding of node.bindings) {
      const value = this.evalNode(binding.value);
      this.locals.set(binding.name, value);
    }

    // Evaluate main expression
    const result = this.evalNode(node.expression);

    // Restore locals
    this.locals = savedLocals;

    return result;
  }

  /**
   * Evaluate built-in function
   */
  private evalFunction(name: string, args: unknown[]): unknown {
    switch (name) {
      // Number functions
      case 'FLOOR':
        return Math.floor(Number(args[0]));

      case 'CEIL':
        return Math.ceil(Number(args[0]));

      case 'ROUND': {
        const value = Number(args[0]);
        const decimals = args.length > 1 ? Number(args[1]) : 0;
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
      }

      case 'ABS':
        return Math.abs(Number(args[0]));

      // Aggregate functions
      case 'MAX':
        return this.evalMax(args);

      case 'MIN':
        return this.evalMin(args);

      case 'SUM':
        return this.evalSum(args);

      case 'AVG':
        return this.evalAvg(args);

      case 'COUNT':
        if (Array.isArray(args[0])) return args[0].length;
        return 0;

      case 'LEN':
        if (typeof args[0] === 'string') return args[0].length;
        if (Array.isArray(args[0])) return args[0].length;
        return 0;

      // String functions
      case 'LOWER':
        return String(args[0]).toLowerCase();

      case 'UPPER':
        return String(args[0]).toUpperCase();

      case 'TRIM':
        return String(args[0]).trim();

      case 'SUBSTRING': {
        const str = String(args[0]);
        const start = Number(args[1]) - 1; // 1-indexed to 0-indexed
        const length = args.length > 2 ? Number(args[2]) : undefined;
        return length !== undefined ? str.substr(start, length) : str.substr(start);
      }

      case 'CONCAT':
        return args.map(String).join('');

      case 'REPLACE':
        return String(args[0]).split(String(args[1])).join(String(args[2]));

      case 'SPLIT':
        return String(args[0]).split(String(args[1]));

      // Type conversion
      case 'NUMBER': {
        const num = Number(args[0]);
        if (isNaN(num)) {
          return args.length > 1 ? args[1] : NaN;
        }
        return num;
      }

      case 'STRING':
        return String(args[0]);

      case 'BOOL':
        return Boolean(args[0]);

      // Existence
      case 'EXISTS':
        return !isUndefined(args[0]);

      case 'COALESCE':
        for (const arg of args) {
          if (!isUndefined(arg)) return arg;
        }
        return null;

      case 'IFNULL':
        return isUndefined(args[0]) ? args[1] : args[0];

      // Conditional
      case 'IF':
        return args[0] ? args[1] : args[2];

      // Array functions
      case 'CONTAINS':
        if (Array.isArray(args[0])) {
          return args[0].some((item) => this.equals(item, args[1]));
        }
        return false;

      case 'FIRST':
        if (Array.isArray(args[0]) && args[0].length > 0) {
          return args[0][0];
        }
        return UNDEFINED;

      case 'LAST':
        if (Array.isArray(args[0]) && args[0].length > 0) {
          return args[0][args[0].length - 1];
        }
        return UNDEFINED;

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  /**
   * SQL LIKE pattern matching (% = any chars, _ = single char)
   */
  private evalLike(value: string, pattern: string): boolean {
    // Convert SQL LIKE pattern to regex
    // Escape regex special chars, then convert % and _
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');

    const regex = new RegExp(`^${escaped}$`, 'i');
    return regex.test(value);
  }

  /**
   * Regex pattern matching
   */
  private evalMatches(value: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(value);
    } catch {
      return false;
    }
  }

  /**
   * Equality check (case-insensitive for strings)
   */
  private equals(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (typeof a === 'string' && typeof b === 'string') {
      return a.toLowerCase() === b.toLowerCase();
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this.equals(v, b[i]));
    }

    return false;
  }

  /**
   * Comparison for ordering
   */
  private compare(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }

    // Convert to numbers for comparison
    return Number(a) - Number(b);
  }

  /**
   * MAX aggregate
   */
  private evalMax(args: unknown[]): number {
    const values = this.flattenNumbers(args);
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  /**
   * MIN aggregate
   */
  private evalMin(args: unknown[]): number {
    const values = this.flattenNumbers(args);
    if (values.length === 0) return 0;
    return Math.min(...values);
  }

  /**
   * SUM aggregate
   */
  private evalSum(args: unknown[]): number {
    const values = this.flattenNumbers(args);
    return values.reduce((sum, v) => sum + v, 0);
  }

  /**
   * AVG aggregate
   */
  private evalAvg(args: unknown[]): number {
    const values = this.flattenNumbers(args);
    if (values.length === 0) return 0;
    return this.evalSum(args) / values.length;
  }

  /**
   * Flatten arguments into number array
   * Handles both variadic args and single array arg
   */
  private flattenNumbers(args: unknown[]): number[] {
    const result: number[] = [];

    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const item of arg) {
          if (typeof item === 'number' && !isNaN(item)) {
            result.push(item);
          }
        }
      } else if (typeof arg === 'number' && !isNaN(arg)) {
        result.push(arg);
      }
    }

    return result;
  }
}

/**
 * Evaluate an AST against a context
 */
export function evaluate(ast: ASTNode, context: EvaluationContext): EvaluationResult {
  const evaluator = new Evaluator(context);
  return evaluator.evaluate(ast);
}

/**
 * Create evaluation context from policy condition context
 */
export function createEvaluationContext(
  params: Record<string, unknown>,
  ctx: {
    sourceIp?: string;
    timestamp?: Date | string;
    hourOfDay?: number;
    dayOfWeek?: number;
    timezone?: string;
    userAgent?: string;
    origin?: string;
  },
  globals?: Record<string, Record<string, unknown>>,
): EvaluationContext {
  const timestamp = ctx.timestamp || new Date();
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  return {
    params,
    context: {
      sourceIp: ctx.sourceIp,
      timestamp: date.toISOString(),
      hourOfDay: ctx.hourOfDay ?? date.getHours(),
      dayOfWeek: ctx.dayOfWeek ?? date.getDay(),
      timezone: ctx.timezone ?? 'UTC',
      userAgent: ctx.userAgent,
      origin: ctx.origin,
    },
    globals,
  };
}
