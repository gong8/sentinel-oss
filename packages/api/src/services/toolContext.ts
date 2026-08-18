/**
 * Tool Context Service
 * Extracts structured context from tool invocations for policy condition evaluation
 */

import { logger } from '../lib/logger.js';
import { loadGlobalVariablesForOrg, type GlobalVariablesMap } from './globalVariables.js';
import type { ConditionEvaluationContext } from './policyCondition.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolContextInput {
  organizationId: string;
  workspaceId?: string | null;
  toolName: string;
  parameters: Record<string, unknown>;
  sourceIp?: string;
  timestamp?: Date;
}

export interface ContextProvider {
  /** Unique name for this provider */
  name: string;
  /** Category in the condition system (e.g., 'sql', 'github', 'file') */
  category: string;
  /** Tool patterns this provider applies to (glob-style) */
  toolPatterns: string[];
  /** Extract context from tool parameters */
  extract: (input: ToolContextInput) => Record<string, unknown>;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a tool name matches a pattern (supports * wildcard)
 */
function matchToolPattern(toolName: string, pattern: string): boolean {
  if (pattern === '*') return true;

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.'); // Convert ? to .

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(toolName);
}

/**
 * Get string value from parameters, handling nested paths
 */
function getParamString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return undefined;
  return String(value);
}

// ============================================================================
// SQL CONTEXT EXTRACTOR
// ============================================================================

/**
 * Extract SQL context from database query tools
 * Detects: operation type, tables referenced, presence of comments
 */
const sqlExtractor: ContextProvider = {
  name: 'sql',
  category: 'sql',
  toolPatterns: ['*sql*', '*query*', '*database*', '*db*', '*postgres*', '*mysql*'],
  extract: (input: ToolContextInput): Record<string, unknown> => {
    const context: Record<string, unknown> = {};

    // Look for SQL in common parameter names
    const sqlParamNames = ['query', 'sql', 'statement', 'command', 'text'];
    let sqlText: string | undefined;

    for (const paramName of sqlParamNames) {
      const value = getParamString(input.parameters, paramName);
      if (value) {
        sqlText = value;
        break;
      }
    }

    if (!sqlText) {
      return context;
    }

    // Normalize SQL for parsing
    const normalizedSql = sqlText.toUpperCase().trim();

    // Detect operation type
    if (normalizedSql.startsWith('SELECT')) {
      context.sqlOperation = 'SELECT';
    } else if (normalizedSql.startsWith('INSERT')) {
      context.sqlOperation = 'INSERT';
    } else if (normalizedSql.startsWith('UPDATE')) {
      context.sqlOperation = 'UPDATE';
    } else if (normalizedSql.startsWith('DELETE')) {
      context.sqlOperation = 'DELETE';
    } else if (normalizedSql.startsWith('CREATE')) {
      context.sqlOperation = 'CREATE';
    } else if (normalizedSql.startsWith('DROP')) {
      context.sqlOperation = 'DROP';
    } else if (normalizedSql.startsWith('ALTER')) {
      context.sqlOperation = 'ALTER';
    } else if (normalizedSql.startsWith('TRUNCATE')) {
      context.sqlOperation = 'TRUNCATE';
    }

    // Extract table names (simplified extraction)
    const tables: string[] = [];
    const tablePatterns = [
      /FROM\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
      /JOIN\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
      /INTO\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
      /UPDATE\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
      /TABLE\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
    ];

    for (const pattern of tablePatterns) {
      let match;
      while ((match = pattern.exec(sqlText)) !== null) {
        const tableName = match[1]?.toLowerCase();
        if (tableName && !tables.includes(tableName)) {
          tables.push(tableName);
        }
      }
    }

    if (tables.length > 0) {
      context.sqlTables = tables;
    }

    // Check for SQL comments (potential injection indicator)
    context.hasSqlComment = sqlText.includes('--') || sqlText.includes('/*');

    return context;
  },
};

// ============================================================================
// GITHUB CONTEXT EXTRACTOR
// ============================================================================

/**
 * Extract GitHub context from repository/code tools
 * Detects: repository, branch, owner, protected branch status
 */
const githubExtractor: ContextProvider = {
  name: 'github',
  category: 'github',
  toolPatterns: ['*github*', '*git*', '*repo*', '*repository*'],
  extract: (input: ToolContextInput): Record<string, unknown> => {
    const context: Record<string, unknown> = {};

    // Extract repository
    const repoValue =
      getParamString(input.parameters, 'repository') ||
      getParamString(input.parameters, 'repo') ||
      getParamString(input.parameters, 'repoName');
    if (repoValue) {
      context.gitRepository = repoValue;

      // Parse owner from owner/repo format
      if (repoValue.includes('/')) {
        const [owner, repo] = repoValue.split('/');
        if (owner) context.gitOwner = owner;
        if (repo) context.gitRepository = repo;
      }
    }

    // Extract owner separately if provided
    const ownerValue =
      getParamString(input.parameters, 'owner') || getParamString(input.parameters, 'org');
    if (ownerValue) {
      context.gitOwner = ownerValue;
    }

    // Extract branch
    const branchValue =
      getParamString(input.parameters, 'branch') ||
      getParamString(input.parameters, 'ref') ||
      getParamString(input.parameters, 'branchName');
    if (branchValue) {
      context.gitBranch = branchValue;

      // Detect protected branches
      const protectedBranches = ['main', 'master', 'release', 'production', 'prod'];
      const normalizedBranch = branchValue.toLowerCase();
      context.isProtectedBranch =
        protectedBranches.includes(normalizedBranch) ||
        normalizedBranch.startsWith('release/') ||
        normalizedBranch.startsWith('hotfix/');
    }

    return context;
  },
};

// ============================================================================
// FILE CONTEXT EXTRACTOR
// ============================================================================

/**
 * Extract file context from filesystem tools
 * Detects: file path, extension, sensitive path detection
 */
const fileExtractor: ContextProvider = {
  name: 'file',
  category: 'file',
  toolPatterns: ['*file*', '*read*', '*write*', '*fs*', '*path*', '*directory*'],
  extract: (input: ToolContextInput): Record<string, unknown> => {
    const context: Record<string, unknown> = {};

    // Extract file path
    const pathValue =
      getParamString(input.parameters, 'path') ||
      getParamString(input.parameters, 'filePath') ||
      getParamString(input.parameters, 'file') ||
      getParamString(input.parameters, 'filename');

    if (!pathValue) {
      return context;
    }

    context.filePath = pathValue;

    // Extract extension
    const lastDotIndex = pathValue.lastIndexOf('.');
    if (lastDotIndex > 0 && lastDotIndex < pathValue.length - 1) {
      context.fileExtension = pathValue.substring(lastDotIndex + 1).toLowerCase();
    }

    // Detect sensitive paths
    const sensitivePaths = [
      '.env',
      '.ssh',
      '.aws',
      '.config',
      'credentials',
      'secrets',
      'private',
      'password',
      '.git/config',
      'id_rsa',
      'id_ed25519',
      '.npmrc',
      '.pypirc',
      'kubeconfig',
      '.kube/config',
    ];

    const sensitiveExtensions = ['pem', 'key', 'p12', 'pfx', 'jks', 'keystore'];

    const normalizedPath = pathValue.toLowerCase();
    const isSensitivePath = sensitivePaths.some(
      (sp) => normalizedPath.includes(sp) || normalizedPath.endsWith(sp),
    );
    const isSensitiveExt = sensitiveExtensions.some((ext) => normalizedPath.endsWith(`.${ext}`));

    context.isSensitivePath = isSensitivePath || isSensitiveExt;

    return context;
  },
};

// ============================================================================
// CONTEXT PROVIDER REGISTRY
// ============================================================================

const contextProviders: ContextProvider[] = [sqlExtractor, githubExtractor, fileExtractor];

/**
 * Register a custom context provider
 */
export function registerContextProvider(provider: ContextProvider): void {
  // Check for duplicate names
  const existing = contextProviders.find((p) => p.name === provider.name);
  if (existing) {
    logger.warn('Replacing existing context provider', { name: provider.name });
    const index = contextProviders.indexOf(existing);
    contextProviders[index] = provider;
  } else {
    contextProviders.push(provider);
  }
}

/**
 * Get providers that apply to a given tool name
 */
function getApplicableProviders(toolName: string): ContextProvider[] {
  return contextProviders.filter((provider) =>
    provider.toolPatterns.some((pattern) => matchToolPattern(toolName, pattern)),
  );
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build the complete evaluation context for a tool invocation
 * Combines base context with extracted context from applicable providers
 */
export function buildEvaluationContext(input: ToolContextInput): ConditionEvaluationContext {
  const now = input.timestamp ?? new Date();

  // Build base context
  const context: ConditionEvaluationContext = {
    time: {
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
      timestamp: now,
    },
    network: {
      sourceIp: input.sourceIp,
    },
    params: input.parameters,
  };

  // Apply applicable context providers
  const providers = getApplicableProviders(input.toolName);

  for (const provider of providers) {
    try {
      const extracted = provider.extract(input);

      // Merge extracted context under the provider's category
      for (const [key, value] of Object.entries(extracted)) {
        // Store extracted values directly on context using dot notation
        // This allows field paths like "sql.operation" to work in conditions
        const category = provider.category;
        // ConditionEvaluationContext has index signature [key: string]: unknown
        // so we can safely assign to dynamic categories
        const existing = context[category];
        const categoryObj =
          typeof existing === 'object' && existing !== null && !Array.isArray(existing)
            ? (existing as Record<string, unknown>)
            : {};
        categoryObj[key] = value;
        context[category] = categoryObj;
      }

      logger.debug('Context provider extracted data', {
        provider: provider.name,
        toolName: input.toolName,
        extractedKeys: Object.keys(extracted),
      });
    } catch (error) {
      logger.error('Context provider extraction failed', {
        provider: provider.name,
        toolName: input.toolName,
        error,
      });
      // Continue with other providers
    }
  }

  return context;
}

/**
 * Inject global variables into an evaluation context
 * Global variables are loaded from the database and injected at the top level
 * This allows policy conditions to reference them like COMPANY.creationDate
 */
export function injectGlobalVariables(
  context: ConditionEvaluationContext,
  globalVars: GlobalVariablesMap,
): ConditionEvaluationContext {
  for (const [namespace, fields] of Object.entries(globalVars)) {
    context[namespace] = fields;
  }
  return context;
}

/**
 * Build evaluation context with global variables
 * Async version that loads global variables from the database
 */
export async function buildEvaluationContextWithGlobalVars(
  input: ToolContextInput,
): Promise<ConditionEvaluationContext> {
  const context = buildEvaluationContext(input);
  const globalVars = await loadGlobalVariablesForOrg(input.organizationId, input.workspaceId);
  return injectGlobalVariables(context, globalVars);
}

/**
 * Build evaluation context with overrides and global variables
 * Async version that loads global variables from the database
 */
export async function buildEvaluationContextWithOverridesAndGlobalVars(
  input: ToolContextInput,
  contextOverrides?: ContextOverridesInput,
  extractedContext?: ExtractedContextInput,
  extractedMode?: 'auto' | 'manual',
): Promise<ConditionEvaluationContext> {
  const context = buildEvaluationContextWithOverrides(
    input,
    contextOverrides,
    extractedContext,
    extractedMode,
  );
  const globalVars = await loadGlobalVariablesForOrg(input.organizationId, input.workspaceId);
  return injectGlobalVariables(context, globalVars);
}

/**
 * Get available context fields for a set of tool patterns
 * Used by UI to show available fields in condition builder
 */
export function getAvailableContextFields(toolPatterns: string[]): {
  category: string;
  fields: string[];
}[] {
  const result: { category: string; fields: string[] }[] = [
    // Base context fields (always available)
    {
      category: 'context',
      fields: ['hourOfDay', 'dayOfWeek', 'timestamp', 'sourceIp'],
    },
  ];

  // Find providers that match any of the tool patterns
  const matchedProviders = new Set<ContextProvider>();

  for (const provider of contextProviders) {
    for (const toolPattern of toolPatterns) {
      // Check if any provider pattern could match the tool pattern
      if (
        provider.toolPatterns.some(
          (pp) => matchToolPattern(toolPattern, pp) || matchToolPattern(pp, toolPattern),
        )
      ) {
        matchedProviders.add(provider);
        break;
      }
    }
  }

  // Add fields from matched providers
  for (const provider of matchedProviders) {
    const fields = getProviderFields(provider.name);
    if (fields.length > 0) {
      result.push({
        category: provider.category,
        fields,
      });
    }
  }

  return result;
}

/**
 * Get known fields for a provider
 * These are the fields that can be used in conditions
 */
function getProviderFields(providerName: string): string[] {
  switch (providerName) {
    case 'sql':
      return ['sqlOperation', 'sqlTables', 'hasSqlComment'];
    case 'github':
      return ['gitRepository', 'gitBranch', 'gitOwner', 'isProtectedBranch'];
    case 'file':
      return ['filePath', 'fileExtension', 'isSensitivePath'];
    default:
      return [];
  }
}

// ============================================================================
// PLAYGROUND/TESTING CONTEXT BUILDING
// ============================================================================

/**
 * Overrides for testing/playground context
 * These allow admins to simulate different runtime conditions
 */
export interface ContextOverridesInput {
  hourOfDay?: number; // 0-23
  dayOfWeek?: number; // 0-6 (Sunday = 0)
  sourceIp?: string;
  timestamp?: string; // ISO timestamp
}

/**
 * Extracted context overrides for manual testing
 * When in 'manual' mode, these values are used instead of auto-extraction
 */
export interface ExtractedContextInput {
  sql?: {
    sqlOperation?: string;
    sqlTables?: string[];
    hasSqlComment?: boolean;
  };
  github?: {
    gitRepository?: string;
    gitBranch?: string;
    gitOwner?: string;
    isProtectedBranch?: boolean;
  };
  file?: {
    filePath?: string;
    fileExtension?: string;
    isSensitivePath?: boolean;
  };
}

/**
 * Build evaluation context with overrides for testing
 * This is used by the playground to test policies with specific conditions
 */
export function buildEvaluationContextWithOverrides(
  input: ToolContextInput,
  contextOverrides?: ContextOverridesInput,
  extractedContext?: ExtractedContextInput,
  extractedMode?: 'auto' | 'manual',
): ConditionEvaluationContext {
  // Parse timestamp if provided
  let now: Date;
  if (contextOverrides?.timestamp) {
    now = new Date(contextOverrides.timestamp);
  } else {
    now = input.timestamp ?? new Date();
  }

  // Build base context with overrides
  const context: ConditionEvaluationContext = {
    time: {
      hourOfDay: contextOverrides?.hourOfDay ?? now.getHours(),
      dayOfWeek: contextOverrides?.dayOfWeek ?? now.getDay(),
      timestamp: now,
    },
    network: {
      sourceIp: contextOverrides?.sourceIp ?? input.sourceIp,
    },
    params: input.parameters,
  };

  // Handle extracted context based on mode
  if (extractedMode === 'manual' && extractedContext) {
    // Use manually specified values - these properties are defined in ConditionEvaluationContext
    if (extractedContext.sql) {
      context.sql = extractedContext.sql;
    }
    if (extractedContext.github) {
      context.github = extractedContext.github;
    }
    if (extractedContext.file) {
      context.file = extractedContext.file;
    }
  } else {
    // Auto-extract from parameters (default behavior)
    const providers = getApplicableProviders(input.toolName);

    for (const provider of providers) {
      try {
        const extracted = provider.extract(input);

        for (const [key, value] of Object.entries(extracted)) {
          const category = provider.category;
          // ConditionEvaluationContext has index signature [key: string]: unknown
          const existing = context[category];
          const categoryObj =
            typeof existing === 'object' && existing !== null && !Array.isArray(existing)
              ? (existing as Record<string, unknown>)
              : {};
          categoryObj[key] = value;
          context[category] = categoryObj;
        }
      } catch (error) {
        logger.error('Context provider extraction failed during testing', {
          provider: provider.name,
          toolName: input.toolName,
          error,
        });
      }
    }
  }

  return context;
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export const _testing = {
  matchToolPattern,
  getParamString,
  sqlExtractor,
  githubExtractor,
  fileExtractor,
  getApplicableProviders,
  getProviderFields,
};
