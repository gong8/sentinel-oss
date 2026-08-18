/**
 * Advanced Conditions Module
 *
 * Provides SQL-like expression language for complex policy conditions.
 */

// Types
export * from './types.js';

// Errors
export * from './errors.js';

// Lexer
export { Lexer, lex } from './lexer.js';
export type { LexResult } from './lexer.js';

// Parser
export { Parser, parse } from './parser.js';

// Functions
export {
  FUNCTION_REGISTRY,
  getFunction,
  getFunctionDocs,
  getFunctionNames,
  getSignatureHelp,
  hasFunction,
} from './functions.js';
export type { FunctionParam, FunctionSignature, SignatureHelp } from './functions.js';

// Type Checker
export { TypeChecker, createTypeEnvFromSchema, typeCheck } from './typeChecker.js';
export type { TypeEnvironment } from './typeChecker.js';

// Evaluator
export { Evaluator, createEvaluationContext, evaluate } from './evaluator.js';
export type { EvaluationContext, EvaluationResult } from './evaluator.js';
