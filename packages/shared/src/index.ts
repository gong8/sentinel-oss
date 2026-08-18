/**
 * @sentinel/shared
 *
 * Shared types and utilities used across sentinel packages.
 * This package exists to break circular dependencies between packages.
 */

export * from './adminTools.js';
export * from './crypto.js';
export * from './evaluationTree.js';
export * from './logger.js';
export * from './security.js';
export * from './types.js';
export * from './utils.js';

// Policy pattern utilities
export * from './policyPatterns.js';

// Advanced conditions expression language
export * as advancedConditions from './advancedConditions/index.js';

// Feature Discovery
export * as featureDiscovery from './featureDiscovery/index.js';

// Re-export types from advancedConditions for TypeScript portability
// This ensures types can be named without referencing internal paths
export type {
  // Core types used in API responses
  ASTNode,
  ConditionError,
  ConditionErrorCode,
  ExpressionType,
  ParseResult,
  SourcePosition,
  SourceSpan,
  StoredAdvancedCondition,
} from './advancedConditions/types.js';

export type {
  FunctionParam,
  FunctionSignature,
  SignatureHelp,
} from './advancedConditions/functions.js';

export type { TypeEnvironment } from './advancedConditions/typeChecker.js';

// Re-export types from featureDiscovery for TypeScript portability
export type {
  DismissType as FeatureDismissType,
  FeatureTip,
  FeatureTipsSetting,
  FeatureUsageStatus,
  Milestone,
  MonthlyStats,
} from './featureDiscovery/types.js';
