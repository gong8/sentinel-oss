/**
 * Advanced Conditions - Type Checker
 *
 * Performs type inference and validation on the AST.
 * Tracks types per node for IDE hover display.
 */

import { createError } from './errors.js';
import { getFunction, type FunctionSignature } from './functions.js';
import type {
  ASTNode,
  ConditionError,
  ExpressionType,
  SourceSpan,
  TypeCheckResult,
} from './types.js';
import { isTypeCompatible, typeToString } from './types.js';

/**
 * Type environment for variable resolution
 */
export interface TypeEnvironment {
  /** Tool parameter types from input schema */
  params?: Record<string, ExpressionType>;
  /** Context field types */
  context?: Record<string, ExpressionType>;
  /** Global variable namespaces */
  globals?: Record<string, Record<string, ExpressionType>>;
  /** Local bindings from WHERE clause */
  locals?: Record<string, ExpressionType>;
  /** If set, using params namespace will report this error message */
  paramsDisallowedReason?: string;
}

/**
 * Built-in TIME namespace fields
 */
const DEFAULT_TIME_TYPES: Record<string, ExpressionType> = {
  hourOfDay: { kind: 'number' }, // 0-23
  dayOfWeek: { kind: 'number' }, // 0-6 (Sunday = 0)
  dayOfMonth: { kind: 'number' }, // 1-31
  month: { kind: 'number' }, // 1-12
  year: { kind: 'number' }, // e.g., 2024
  timestamp: { kind: 'string' }, // ISO date string
  timezone: { kind: 'string' }, // e.g., "America/New_York"
};

/**
 * Built-in NETWORK namespace fields
 */
const DEFAULT_NETWORK_TYPES: Record<string, ExpressionType> = {
  sourceIp: { kind: 'string' }, // Client IP address
  userAgent: { kind: 'string' }, // User agent string
  origin: { kind: 'string' }, // Request origin
};

/**
 * Default context types always available
 * Note: time fields (hourOfDay, dayOfWeek, timestamp) belong to TIME namespace
 * Note: network fields (sourceIp) belong to NETWORK namespace
 */
const DEFAULT_CONTEXT_TYPES: Record<string, ExpressionType> = {
  timezone: { kind: 'string' },
};

/**
 * Built-in namespaces that are always available
 */
const BUILTIN_NAMESPACES: Record<string, Record<string, ExpressionType>> = {
  TIME: DEFAULT_TIME_TYPES,
  NETWORK: DEFAULT_NETWORK_TYPES,
};

/**
 * Type helpers
 */
const T = {
  number: { kind: 'number' } as ExpressionType,
  string: { kind: 'string' } as ExpressionType,
  boolean: { kind: 'boolean' } as ExpressionType,
  any: { kind: 'any' } as ExpressionType,
  null: { kind: 'null' } as ExpressionType,
  never: { kind: 'never' } as ExpressionType,
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
 * Type checker class
 */
export class TypeChecker {
  private errors: ConditionError[] = [];
  private typeMap: Map<number, ExpressionType> = new Map();
  private env: TypeEnvironment;

  constructor(env: TypeEnvironment = {}) {
    this.env = {
      ...env,
      context: { ...DEFAULT_CONTEXT_TYPES, ...env.context },
    };
  }

  /**
   * Type check an AST and return results
   */
  check(ast: ASTNode): TypeCheckResult {
    this.errors = [];
    this.typeMap = new Map();

    const type = this.checkNode(ast);

    // Final expression must be boolean
    // Don't allow 'any' - unresolved identifiers should not pass validation
    if (type.kind !== 'boolean' && type.kind !== 'never') {
      this.errors.push(
        createError(
          'EXPRESSION_NOT_BOOLEAN',
          `Expression must evaluate to a boolean, got ${typeToString(type)}`,
          ast.span,
        ),
      );
    }

    return {
      success: this.errors.length === 0,
      errors: this.errors,
      typeMap: this.typeMap,
    };
  }

  /**
   * Check a single node and return its type
   */
  private checkNode(node: ASTNode): ExpressionType {
    let type: ExpressionType;

    switch (node.type) {
      case 'NumberLiteral':
        type = T.number;
        break;

      case 'StringLiteral':
        type = T.string;
        break;

      case 'BooleanLiteral':
        type = T.boolean;
        break;

      case 'NullLiteral':
        type = T.null;
        break;

      case 'Identifier':
        type = this.checkIdentifier(node.name, node.span);
        break;

      case 'ArrayExpr':
        type = this.checkArray(node);
        break;

      case 'BinaryExpr':
        type = this.checkBinary(node);
        break;

      case 'UnaryExpr':
        type = this.checkUnary(node);
        break;

      case 'CallExpr':
        type = this.checkCall(node);
        break;

      case 'MemberExpr':
        type = this.checkMember(node);
        break;

      case 'IndexExpr':
        type = this.checkIndex(node);
        break;

      case 'WhereClause':
        type = this.checkWhere(node);
        break;

      case 'Assignment':
        type = this.checkNode(node.value);
        break;

      default:
        type = T.any;
    }

    // Store inferred type for this node
    this.typeMap.set(node.span.start.offset, type);
    node.inferredType = type;

    return type;
  }

  /**
   * Check identifier reference
   */
  private checkIdentifier(name: string, span: SourceSpan): ExpressionType {
    // Check local bindings first (from WHERE clause)
    if (this.env.locals?.[name]) {
      return this.env.locals[name];
    }

    // Check if it's a reserved keyword used as identifier
    const upperName = name.toUpperCase();
    if (['PARAMS', 'CONTEXT'].includes(upperName)) {
      // Return object type for namespace access
      // Note: paramsDisallowedReason is checked in checkMember to avoid duplicate errors
      return { kind: 'object' };
    }

    // Check globals (namespace access like COMPANY.minId)
    if (this.env.globals?.[upperName]) {
      return { kind: 'object' };
    }

    // Check params
    if (this.env.params?.[name]) {
      return this.env.params[name];
    }

    // Built-in time and network namespaces (case-insensitive)
    if (upperName === 'TIME' || upperName === 'NETWORK') {
      return { kind: 'object' };
    }

    // Unknown bare identifier - report error with available namespaces
    const availableNamespaces = ['params', 'time', 'network'];
    if (this.env.globals) {
      availableNamespaces.push(...Object.keys(this.env.globals));
    }
    const namespaceList = availableNamespaces.slice(0, 5).join(', ');
    this.errors.push(
      createError(
        'UNKNOWN_IDENTIFIER',
        `Unknown identifier '${name}'. Did you mean to use a namespace? Available: ${namespaceList}`,
        span,
      ),
    );
    return T.never; // Return never to suppress cascading "must be boolean" error
  }

  /**
   * Check array literal
   */
  private checkArray(node: ASTNode & { type: 'ArrayExpr' }): ExpressionType {
    if (node.elements.length === 0) {
      return T.arrayOf(T.any);
    }

    const elementTypes = node.elements.map((e) => this.checkNode(e));

    // If all elements have same type, use that
    const firstType = elementTypes[0];
    const allSame = elementTypes.every((t) => t.kind === firstType.kind);

    if (allSame) {
      return T.arrayOf(firstType);
    }

    // Mixed types are not allowed - report error
    // Find which elements have different types for a helpful error message
    const typesSeen = new Map<string, number>();
    for (let i = 0; i < elementTypes.length; i++) {
      const kind = elementTypes[i].kind;
      if (!typesSeen.has(kind)) {
        typesSeen.set(kind, i);
      }
    }

    const typeNames = Array.from(typesSeen.keys()).join(', ');
    this.errors.push(
      createError(
        'TYPE_MISMATCH',
        `Array elements must all be the same type. Found mixed types: ${typeNames}`,
        node.span,
      ),
    );

    // Return array of first type for continued checking
    return T.arrayOf(firstType);
  }

  /**
   * Check binary expression
   */
  private checkBinary(node: ASTNode & { type: 'BinaryExpr' }): ExpressionType {
    const leftType = this.checkNode(node.left);
    const rightType = this.checkNode(node.right);

    switch (node.operator) {
      // Logical operators
      case 'AND':
      case 'OR':
        this.expectType(node.left, leftType, T.boolean, 'left operand');
        this.expectType(node.right, rightType, T.boolean, 'right operand');
        return T.boolean;

      // Comparison operators
      case 'EQ':
      case 'NE':
        // Types must be compatible for equality comparison
        if (!this.areTypesComparable(leftType, rightType)) {
          this.errors.push(
            createError(
              'TYPE_MISMATCH',
              `Cannot compare ${typeToString(leftType)} with ${typeToString(rightType)}`,
              node.span,
            ),
          );
        }
        return T.boolean;

      case 'LT':
      case 'LE':
      case 'GT':
      case 'GE':
        // Numeric comparison
        this.expectType(node.left, leftType, T.number, 'left operand');
        this.expectType(node.right, rightType, T.number, 'right operand');
        return T.boolean;

      // Pattern matching
      case 'LIKE':
      case 'MATCHES':
        this.expectType(node.left, leftType, T.string, 'left operand');
        this.expectType(node.right, rightType, T.string, 'pattern');
        return T.boolean;

      // Set membership
      case 'IN':
        if (rightType.kind !== 'array' && rightType.kind !== 'any') {
          this.errors.push(
            createError(
              'TYPE_MISMATCH',
              `IN operator requires array on right side, got ${typeToString(rightType)}`,
              node.right.span,
            ),
          );
        } else if (rightType.kind === 'array' && leftType.kind !== 'any') {
          // Check that left operand type matches array element type
          const elemType = rightType.elementType;
          if (elemType.kind !== 'any' && !isTypeCompatible(leftType, elemType)) {
            this.errors.push(
              createError(
                'TYPE_MISMATCH',
                `Cannot check if ${typeToString(leftType)} is in array of ${typeToString(elemType)}`,
                node.span,
              ),
            );
          }
        }
        return T.boolean;

      // Arithmetic operators
      case 'PLUS':
        // String concatenation or number addition
        if (leftType.kind === 'string' || rightType.kind === 'string') {
          return T.string;
        }
        this.expectType(node.left, leftType, T.number, 'left operand');
        this.expectType(node.right, rightType, T.number, 'right operand');
        return T.number;

      case 'MINUS':
      case 'STAR':
      case 'SLASH':
      case 'POWER':
        this.expectType(node.left, leftType, T.number, 'left operand');
        this.expectType(node.right, rightType, T.number, 'right operand');
        return T.number;

      default:
        return T.any;
    }
  }

  /**
   * Check unary expression
   */
  private checkUnary(node: ASTNode & { type: 'UnaryExpr' }): ExpressionType {
    const operandType = this.checkNode(node.operand);

    switch (node.operator) {
      case 'NOT':
        this.expectType(node.operand, operandType, T.boolean, 'operand');
        return T.boolean;

      case 'MINUS':
        this.expectType(node.operand, operandType, T.number, 'operand');
        return T.number;

      default:
        return T.any;
    }
  }

  /**
   * Check function call
   */
  private checkCall(node: ASTNode & { type: 'CallExpr' }): ExpressionType {
    const funcName = node.callee.toUpperCase();
    const funcSig = getFunction(funcName);

    if (!funcSig) {
      this.errors.push(createError('UNKNOWN_FUNCTION', `Unknown function: ${funcName}`, node.span));
      return T.any;
    }

    // Get argument types first
    const argTypes = node.arguments.map((arg) => this.checkNode(arg));

    // Try to find a matching signature (main or overload)
    const allSignatures = [funcSig, ...(funcSig.overloads ?? [])];
    const matchResult = this.findMatchingSignature(allSignatures, argTypes, node.arguments);

    if (matchResult.matched) {
      return this.resolveReturnType(matchResult.signature, node.arguments);
    }

    // No signature matched - report the best error
    this.reportSignatureError(funcName, funcSig, argTypes, node);

    return funcSig.returnType;
  }

  /**
   * Find a matching function signature for the given arguments
   */
  private findMatchingSignature(
    signatures: FunctionSignature[],
    argTypes: ExpressionType[],
    argNodes: ASTNode[],
  ): { matched: boolean; signature: FunctionSignature; errors: string[] } {
    for (const sig of signatures) {
      const result = this.checkSignatureMatch(sig, argTypes, argNodes);
      if (result.matched) {
        return { matched: true, signature: sig, errors: [] };
      }
    }

    return { matched: false, signature: signatures[0], errors: [] };
  }

  /**
   * Check if arguments match a specific signature
   */
  private checkSignatureMatch(
    sig: FunctionSignature,
    argTypes: ExpressionType[],
    _argNodes: ASTNode[],
  ): { matched: boolean } {
    const hasVariadic = sig.params.some((p) => p.variadic);

    // Calculate minimum required arguments:
    // - Non-optional, non-variadic params are always required
    // - Variadic params require at least 1 argument (unless optional)
    let minRequired = 0;
    for (const param of sig.params) {
      if (param.optional) {
        continue; // Optional params don't add to minimum
      }
      if (param.variadic) {
        minRequired += 1; // Variadic needs at least 1
      } else {
        minRequired += 1;
      }
    }

    // Check argument count
    if (argTypes.length < minRequired) {
      return { matched: false };
    }

    if (!hasVariadic && argTypes.length > sig.params.length) {
      return { matched: false };
    }

    // Check argument types
    for (let i = 0; i < argTypes.length; i++) {
      const argType = argTypes[i];
      const paramIndex = Math.min(i, sig.params.length - 1);
      const param = sig.params[paramIndex];

      if (param && !isTypeCompatible(argType, param.type) && argType.kind !== 'any') {
        return { matched: false };
      }
    }

    return { matched: true };
  }

  /**
   * Report error for function call that didn't match any signature
   */
  private reportSignatureError(
    funcName: string,
    funcSig: FunctionSignature,
    argTypes: ExpressionType[],
    node: ASTNode & { type: 'CallExpr' },
  ): void {
    // Check if it looks like they're trying to use the wrong overload
    const hasArrayArg = argTypes.some((t) => t.kind === 'array');
    const hasMultipleArgs = argTypes.length > 1;
    const hasOverloads = funcSig.overloads && funcSig.overloads.length > 0;

    if (hasOverloads && hasArrayArg && hasMultipleArgs) {
      // User passed multiple arrays - explain the two forms
      this.errors.push(
        createError(
          'WRONG_ARGUMENT_COUNT',
          `${funcName} accepts either a single array OR multiple values, not multiple arrays. Use ${funcName}([...]) or ${funcName}(val1, val2, ...)`,
          node.span,
        ),
      );
      return;
    }

    // Fall back to generic argument count/type errors
    const hasVariadic = funcSig.params.some((p) => p.variadic);

    // Calculate minimum required arguments (same logic as checkSignatureMatch)
    let minRequired = 0;
    for (const param of funcSig.params) {
      if (param.optional) {
        continue;
      }
      minRequired += 1; // Both regular and variadic non-optional params need at least 1
    }

    if (argTypes.length < minRequired) {
      this.errors.push(
        createError(
          'WRONG_ARGUMENT_COUNT',
          `${funcName} requires at least ${minRequired} argument(s), got ${argTypes.length}`,
          node.span,
        ),
      );
      return;
    }

    if (!hasVariadic && argTypes.length > funcSig.params.length) {
      this.errors.push(
        createError(
          'WRONG_ARGUMENT_COUNT',
          `${funcName} takes at most ${funcSig.params.length} argument(s), got ${argTypes.length}`,
          node.span,
        ),
      );
      return;
    }

    // Type mismatch on specific argument
    for (let i = 0; i < argTypes.length; i++) {
      const argType = argTypes[i];
      const paramIndex = Math.min(i, funcSig.params.length - 1);
      const param = funcSig.params[paramIndex];

      if (param && !isTypeCompatible(argType, param.type) && argType.kind !== 'any') {
        this.errors.push(
          createError(
            'TYPE_MISMATCH',
            `Argument ${i + 1} of ${funcName}: expected ${typeToString(param.type)}, got ${typeToString(argType)}`,
            node.arguments[i].span,
          ),
        );
      }
    }
  }

  /**
   * Resolve function return type (may depend on arguments)
   */
  private resolveReturnType(funcSig: FunctionSignature, args: ASTNode[]): ExpressionType {
    // For functions like COALESCE, IF - return type depends on args
    if (funcSig.returnType.kind === 'any' && args.length > 0) {
      // Try to infer from first non-any argument
      for (const arg of args) {
        if (arg.inferredType && arg.inferredType.kind !== 'any') {
          return arg.inferredType;
        }
      }
    }

    return funcSig.returnType;
  }

  /**
   * Check member access
   */
  private checkMember(node: ASTNode & { type: 'MemberExpr' }): ExpressionType {
    const objectType = this.checkNode(node.object);

    // Handle namespace access (params.x, context.y, TIME.z, NETWORK.w, COMPANY.z)
    if (node.object.type === 'Identifier') {
      const namespace = node.object.name.toUpperCase();

      // params.xxx - look up in params
      if (namespace === 'PARAMS') {
        // Check if params namespace is disallowed (e.g., multiple tools selected)
        if (this.env.paramsDisallowedReason) {
          this.errors.push(
            createError('PARAMS_NOT_ALLOWED', this.env.paramsDisallowedReason, node.span),
          );
          return T.never;
        }
        if (this.env.params?.[node.property]) {
          return this.env.params[node.property];
        }
        // Only report error if params are defined (we have schema information)
        if (this.env.params && Object.keys(this.env.params).length > 0) {
          const availableParams = Object.keys(this.env.params);
          const suggestion = `. Available: ${availableParams.slice(0, 5).join(', ')}${availableParams.length > 5 ? '...' : ''}`;
          this.errors.push(
            createError(
              'PROPERTY_NOT_FOUND',
              `Unknown parameter '${node.property}'${suggestion}`,
              node.span,
            ),
          );
        }
        // Return any for unknown params (dynamic typing when no schema)
        return T.any;
      }

      // context.xxx - look up in context (legacy)
      if (namespace === 'CONTEXT') {
        if (this.env.context?.[node.property]) {
          return this.env.context[node.property];
        }
        // Report error for unknown context field
        const availableContext = Object.keys(this.env.context ?? {});
        this.errors.push(
          createError(
            'PROPERTY_NOT_FOUND',
            `Unknown context field '${node.property}'. Available: ${availableContext.join(', ')}`,
            node.span,
          ),
        );
        return T.any;
      }

      // Built-in namespaces (TIME, NETWORK)
      if (BUILTIN_NAMESPACES[namespace]) {
        const nsTypes = BUILTIN_NAMESPACES[namespace];
        if (nsTypes[node.property]) {
          return nsTypes[node.property];
        }
        // Unknown field in built-in namespace
        const availableFields = Object.keys(nsTypes);
        this.errors.push(
          createError(
            'PROPERTY_NOT_FOUND',
            `Unknown field '${node.property}' in ${namespace}. Available: ${availableFields.join(', ')}`,
            node.span,
          ),
        );
        return T.any;
      }

      // Global variable namespace (COMPANY.minId, LIMITS.maxAmount)
      if (this.env.globals?.[namespace]) {
        const nsTypes = this.env.globals[namespace];
        if (nsTypes[node.property]) {
          return nsTypes[node.property];
        }
        // Unknown global field
        this.errors.push(
          createError(
            'PROPERTY_NOT_FOUND',
            `Unknown field '${node.property}' in namespace '${namespace}'`,
            node.span,
          ),
        );
        return T.any;
      }
    }

    // Generic member access on object types
    if (objectType.kind === 'object') {
      // Try to find property type
      if (objectType.properties?.has(node.property)) {
        return objectType.properties.get(node.property)!;
      }

      // Object has defined properties - report error for unknown property
      if (objectType.properties && objectType.properties.size > 0) {
        const availableProps = Array.from(objectType.properties.keys());
        const suggestion =
          availableProps.length > 0
            ? `. Available: ${availableProps.slice(0, 5).join(', ')}${availableProps.length > 5 ? '...' : ''}`
            : '';
        this.errors.push(
          createError(
            'PROPERTY_NOT_FOUND',
            `Unknown property '${node.property}'${suggestion}`,
            node.span,
          ),
        );
      }
      return T.any;
    }

    if (objectType.kind === 'array') {
      // Array methods like .length
      if (node.property === 'length') {
        return T.number;
      }
    }

    if (objectType.kind !== 'any') {
      this.errors.push(
        createError(
          'PROPERTY_NOT_FOUND',
          `Cannot access property '${node.property}' on type ${typeToString(objectType)}`,
          node.span,
        ),
      );
    }

    return T.any;
  }

  /**
   * Check index access
   */
  private checkIndex(node: ASTNode & { type: 'IndexExpr' }): ExpressionType {
    const objectType = this.checkNode(node.object);
    const indexType = this.checkNode(node.index);

    if (objectType.kind === 'array') {
      this.expectType(node.index, indexType, T.number, 'array index');
      return objectType.elementType;
    }

    if (objectType.kind === 'string') {
      this.expectType(node.index, indexType, T.number, 'string index');
      return T.string;
    }

    if (objectType.kind !== 'any') {
      this.errors.push(
        createError(
          'NOT_INDEXABLE',
          `Cannot index type ${typeToString(objectType)}`,
          node.object.span,
        ),
      );
    }

    return T.any;
  }

  /**
   * Check WHERE clause
   */
  private checkWhere(node: ASTNode & { type: 'WhereClause' }): ExpressionType {
    // First check bindings and add to locals
    const savedLocals = this.env.locals || {};
    this.env.locals = { ...savedLocals };

    for (const binding of node.bindings) {
      const valueType = this.checkNode(binding.value);
      this.env.locals[binding.name] = valueType;
    }

    // Then check main expression
    const exprType = this.checkNode(node.expression);

    // Restore locals
    this.env.locals = savedLocals;

    return exprType;
  }

  /**
   * Check if actual type matches expected
   */
  private expectType(
    node: ASTNode,
    actual: ExpressionType,
    expected: ExpressionType,
    context: string,
  ): void {
    if (!isTypeCompatible(actual, expected) && actual.kind !== 'any') {
      this.errors.push(
        createError(
          'TYPE_MISMATCH',
          `${context}: expected ${typeToString(expected)}, got ${typeToString(actual)}`,
          node.span,
        ),
      );
    }
  }

  /**
   * Check if two types can be compared for equality
   */
  private areTypesComparable(left: ExpressionType, right: ExpressionType): boolean {
    // Any type is compatible with anything (we don't know the actual type)
    if (left.kind === 'any' || right.kind === 'any') {
      return true;
    }

    // Null can be compared to anything
    if (left.kind === 'null' || right.kind === 'null') {
      return true;
    }

    // Same type is always comparable
    if (left.kind === right.kind) {
      return true;
    }

    // Numbers and strings are not comparable to each other
    if (
      (left.kind === 'string' && right.kind === 'number') ||
      (left.kind === 'number' && right.kind === 'string')
    ) {
      return false;
    }

    // Boolean should only compare to boolean
    if (
      (left.kind === 'boolean' && right.kind !== 'boolean') ||
      (right.kind === 'boolean' && left.kind !== 'boolean')
    ) {
      return false;
    }

    // Default to comparable for other combinations
    return true;
  }
}

/**
 * Type check an AST with the given environment
 */
export function typeCheck(ast: ASTNode, env: TypeEnvironment = {}): TypeCheckResult {
  const checker = new TypeChecker(env);
  return checker.check(ast);
}

/**
 * Create type environment from tool input schema
 */
export function createTypeEnvFromSchema(inputSchema: Record<string, unknown>): TypeEnvironment {
  const params: Record<string, ExpressionType> = {};

  // Parse JSON Schema to extract types
  if (inputSchema && typeof inputSchema === 'object' && 'properties' in inputSchema) {
    const properties = inputSchema.properties as Record<string, Record<string, unknown>>;

    for (const [key, prop] of Object.entries(properties)) {
      params[key] = jsonSchemaToType(prop);
    }
  }

  return { params };
}

/**
 * Convert JSON Schema type to ExpressionType
 * Recursively processes nested object properties
 */
function jsonSchemaToType(schema: Record<string, unknown>): ExpressionType {
  const schemaType = schema.type as string | string[] | undefined;

  if (Array.isArray(schemaType)) {
    // Union type
    const types = schemaType.map((t) => jsonSchemaToType({ ...schema, type: t }));
    return { kind: 'union', types };
  }

  // Infer type from structure when not explicit
  const effectiveType = schemaType ?? inferTypeFromSchema(schema);

  switch (effectiveType) {
    case 'string':
      return T.string;
    case 'number':
    case 'integer':
      return T.number;
    case 'boolean':
      return T.boolean;
    case 'null':
      return T.null;
    case 'array': {
      const items = schema.items as Record<string, unknown> | undefined;
      const elementType = items ? jsonSchemaToType(items) : T.any;
      return T.arrayOf(elementType);
    }
    case 'object': {
      // Build properties map for nested field access
      const properties = new Map<string, ExpressionType>();
      const schemaProps = schema.properties as Record<string, Record<string, unknown>> | undefined;

      if (schemaProps) {
        for (const [key, prop] of Object.entries(schemaProps)) {
          properties.set(key, jsonSchemaToType(prop));
        }
      }

      // Handle allOf by merging properties
      if (Array.isArray(schema.allOf)) {
        for (const subSchema of schema.allOf) {
          if (isPlainObject(subSchema)) {
            const subProps = (subSchema as Record<string, unknown>).properties as
              | Record<string, Record<string, unknown>>
              | undefined;
            if (subProps) {
              for (const [key, prop] of Object.entries(subProps)) {
                if (!properties.has(key)) {
                  properties.set(key, jsonSchemaToType(prop));
                }
              }
            }
          }
        }
      }

      // Handle anyOf/oneOf by merging all variant properties
      const variants = (schema.anyOf ?? schema.oneOf) as unknown[] | undefined;
      if (Array.isArray(variants)) {
        for (const variant of variants) {
          if (isPlainObject(variant)) {
            const variantProps = (variant as Record<string, unknown>).properties as
              | Record<string, Record<string, unknown>>
              | undefined;
            if (variantProps) {
              for (const [key, prop] of Object.entries(variantProps)) {
                if (!properties.has(key)) {
                  properties.set(key, jsonSchemaToType(prop));
                }
              }
            }
          }
        }
      }

      return properties.size > 0 ? { kind: 'object', properties } : { kind: 'object' };
    }
    default:
      return T.any;
  }
}

/**
 * Check if a value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Infer schema type from structure when type field is not explicit
 */
function inferTypeFromSchema(schema: Record<string, unknown>): string | undefined {
  if (isPlainObject(schema.properties)) return 'object';
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false)
    return 'object';
  if (Array.isArray(schema.allOf)) return 'object';
  if (isPlainObject(schema.items) || Array.isArray(schema.items)) return 'array';

  // Check anyOf/oneOf for type hints
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const variants = (schema.anyOf ?? schema.oneOf) as unknown[];
    for (const variant of variants) {
      if (isPlainObject(variant)) {
        const variantType = inferTypeFromSchema(variant);
        if (variantType) return variantType;
      }
    }
  }

  return undefined;
}
