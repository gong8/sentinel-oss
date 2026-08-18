/**
 * Tool Invocation Types
 *
 * Shared types for constructing and testing tool invocations
 * with full parameter and context support.
 */

import { z } from 'zod';

// ============================================================================
// CONTEXT OVERRIDES
// ============================================================================

/**
 * Context values that can be overridden for testing
 * These override the default runtime context values
 */
export interface ContextOverrides {
  hourOfDay?: number; // 0-23
  dayOfWeek?: number; // 0-6 (Sunday = 0)
  sourceIp?: string; // IP address for CIDR testing
  timestamp?: string; // ISO timestamp override
}

export const contextOverridesSchema = z
  .object({
    hourOfDay: z.number().int().min(0).max(23).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    sourceIp: z.string().optional(),
    timestamp: z.string().datetime().optional(),
  })
  .optional();

// ============================================================================
// EXTRACTED CONTEXT
// ============================================================================

/**
 * SQL-specific extracted context
 */
export interface SqlExtractedContext {
  sqlOperation?: string; // SELECT, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER
  sqlTables?: string[]; // Table names referenced
  hasSqlComment?: boolean; // True if query contains comments
}

export const sqlExtractedContextSchema = z.object({
  sqlOperation: z.string().optional(),
  sqlTables: z.array(z.string()).optional(),
  hasSqlComment: z.boolean().optional(),
});

/**
 * GitHub-specific extracted context
 */
export interface GithubExtractedContext {
  gitRepository?: string;
  gitBranch?: string;
  gitOwner?: string;
  isProtectedBranch?: boolean;
}

export const githubExtractedContextSchema = z.object({
  gitRepository: z.string().optional(),
  gitBranch: z.string().optional(),
  gitOwner: z.string().optional(),
  isProtectedBranch: z.boolean().optional(),
});

/**
 * File-specific extracted context
 */
export interface FileExtractedContext {
  filePath?: string;
  fileExtension?: string;
  isSensitivePath?: boolean;
}

export const fileExtractedContextSchema = z.object({
  filePath: z.string().optional(),
  fileExtension: z.string().optional(),
  isSensitivePath: z.boolean().optional(),
});

/**
 * Combined extracted context from tool invocation
 */
export interface ExtractedContext {
  sql?: SqlExtractedContext;
  github?: GithubExtractedContext;
  file?: FileExtractedContext;
}

export const extractedContextSchema = z
  .object({
    sql: sqlExtractedContextSchema.optional(),
    github: githubExtractedContextSchema.optional(),
    file: fileExtractedContextSchema.optional(),
  })
  .optional();

// ============================================================================
// EXTRACTED MODE
// ============================================================================

export type ExtractedMode = 'auto' | 'manual';

export const extractedModeSchema = z.enum(['auto', 'manual']).optional();

// ============================================================================
// PARAMETER MODE (for assertions)
// ============================================================================

export type ParameterMode = 'exact' | 'subset' | 'ignore';

export const parameterModeSchema = z.enum(['exact', 'subset', 'ignore']);

// ============================================================================
// TOOL INVOCATION
// ============================================================================

/**
 * Full tool invocation details for testing
 */
export interface ToolInvocation {
  toolName: string; // "server::tool"
  parameters?: Record<string, unknown>;
}

export const toolInvocationSchema = z.object({
  toolName: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// TEST INPUT
// ============================================================================

/**
 * Full test input including invocation details
 */
export interface TestInput {
  toolName: string;
  userId?: string;
  agentId?: string;
  parameters?: Record<string, unknown>;
  contextOverrides?: ContextOverrides;
  extractedContext?: ExtractedContext;
  extractedMode?: ExtractedMode;
}

export const testInputSchema = z.object({
  toolName: z.string().min(1),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  contextOverrides: contextOverridesSchema,
  extractedContext: extractedContextSchema,
  extractedMode: extractedModeSchema,
});

// ============================================================================
// ASSERTION INPUT
// ============================================================================

/**
 * Assertion input with invocation details
 */
export interface AssertionInput {
  name: string;
  description?: string;
  toolPattern: string;
  contextType: string;
  userId?: string;
  agentId?: string;
  roleName?: string;
  expectedDecision: string;
  parameters?: Record<string, unknown>;
  contextOverrides?: ContextOverrides;
  extractedContext?: ExtractedContext;
  extractedMode?: ExtractedMode;
  parameterMode?: ParameterMode;
}

// ============================================================================
// TOOL CATEGORY DETECTION
// ============================================================================

/**
 * Detect the category of a tool for extracted context purposes
 */
export type ToolCategory = 'sql' | 'github' | 'file' | null;

const SQL_PATTERNS = ['sql', 'query', 'database', 'postgres', 'mysql', 'supabase', 'execute'];
const GITHUB_PATTERNS = ['github', 'git', 'repo', 'branch', 'commit', 'pull', 'push'];
const FILE_PATTERNS = ['file', 'read', 'write', 'fs', 'directory', 'path'];

export function getToolCategory(toolName: string): ToolCategory {
  const lowerName = toolName.toLowerCase();

  if (SQL_PATTERNS.some((p) => lowerName.includes(p))) {
    return 'sql';
  }
  if (GITHUB_PATTERNS.some((p) => lowerName.includes(p))) {
    return 'github';
  }
  if (FILE_PATTERNS.some((p) => lowerName.includes(p))) {
    return 'file';
  }

  return null;
}

// ============================================================================
// SQL EXTRACTION
// ============================================================================

/**
 * Extract SQL context from a query string
 */
export function extractSqlContext(
  params: Record<string, unknown>,
): SqlExtractedContext | undefined {
  // Find the SQL query in params
  const query = findSqlQuery(params);
  if (!query) return undefined;

  const upperQuery = query.toUpperCase().trim();

  // Detect operation
  let sqlOperation: string | undefined;
  if (upperQuery.startsWith('SELECT')) sqlOperation = 'SELECT';
  else if (upperQuery.startsWith('INSERT')) sqlOperation = 'INSERT';
  else if (upperQuery.startsWith('UPDATE')) sqlOperation = 'UPDATE';
  else if (upperQuery.startsWith('DELETE')) sqlOperation = 'DELETE';
  else if (upperQuery.startsWith('DROP')) sqlOperation = 'DROP';
  else if (upperQuery.startsWith('CREATE')) sqlOperation = 'CREATE';
  else if (upperQuery.startsWith('ALTER')) sqlOperation = 'ALTER';
  else if (upperQuery.startsWith('TRUNCATE')) sqlOperation = 'TRUNCATE';

  // Extract table names
  const tablePatterns = [
    /FROM\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
    /JOIN\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
    /INTO\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
    /UPDATE\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
  ];

  const tables = new Set<string>();
  for (const pattern of tablePatterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      tables.add(match[1].toLowerCase());
    }
  }

  // Detect comments
  const hasSqlComment = query.includes('--') || query.includes('/*');

  return {
    sqlOperation,
    sqlTables: tables.size > 0 ? Array.from(tables) : undefined,
    hasSqlComment: hasSqlComment || undefined,
  };
}

function findSqlQuery(params: Record<string, unknown>): string | undefined {
  // Common parameter names for SQL queries
  const queryKeys = ['query', 'sql', 'statement', 'command'];

  for (const key of queryKeys) {
    const value = params[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  // Check nested objects
  for (const value of Object.values(params)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = findSqlQuery(value as Record<string, unknown>);
      if (nested) return nested;
    }
  }

  return undefined;
}

// ============================================================================
// GITHUB EXTRACTION
// ============================================================================

const PROTECTED_BRANCHES = ['main', 'master', 'release', 'production', 'prod'];
const PROTECTED_PATTERNS = [/^release\//, /^hotfix\//];

export function extractGithubContext(
  params: Record<string, unknown>,
): GithubExtractedContext | undefined {
  const context: GithubExtractedContext = {};

  // Extract repository
  const repo = findParamValue(params, ['repository', 'repo', 'repoName', 'repo_name']);
  if (typeof repo === 'string') context.gitRepository = repo;

  // Extract branch
  const branch = findParamValue(params, ['branch', 'ref', 'branchName', 'branch_name']);
  if (typeof branch === 'string') {
    context.gitBranch = branch;
    context.isProtectedBranch =
      PROTECTED_BRANCHES.includes(branch.toLowerCase()) ||
      PROTECTED_PATTERNS.some((p) => p.test(branch));
  }

  // Extract owner
  const owner = findParamValue(params, ['owner', 'org', 'organization']);
  if (typeof owner === 'string') context.gitOwner = owner;

  return Object.keys(context).length > 0 ? context : undefined;
}

// ============================================================================
// FILE EXTRACTION
// ============================================================================

const SENSITIVE_PATHS = ['.env', '.ssh', '.aws', 'credentials', 'secrets', 'private', '.config'];
const SENSITIVE_EXTENSIONS = ['pem', 'key', 'p12', 'pfx', 'jks', 'keystore'];

export function extractFileContext(
  params: Record<string, unknown>,
): FileExtractedContext | undefined {
  const context: FileExtractedContext = {};

  // Extract file path
  const path = findParamValue(params, ['path', 'filePath', 'file_path', 'filename', 'file']);
  if (typeof path === 'string') {
    context.filePath = path;

    // Extract extension
    const lastDot = path.lastIndexOf('.');
    if (lastDot > 0) {
      context.fileExtension = path.substring(lastDot + 1).toLowerCase();
    }

    // Check if sensitive
    const lowerPath = path.toLowerCase();
    context.isSensitivePath =
      SENSITIVE_PATHS.some((s) => lowerPath.includes(s)) ||
      (context.fileExtension !== undefined && SENSITIVE_EXTENSIONS.includes(context.fileExtension));
  }

  return Object.keys(context).length > 0 ? context : undefined;
}

// ============================================================================
// HELPERS
// ============================================================================

function findParamValue(params: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in params) return params[key];
  }

  // Check nested
  for (const value of Object.values(params)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = findParamValue(value as Record<string, unknown>, keys);
      if (nested !== undefined) return nested;
    }
  }

  return undefined;
}

/**
 * Extract context based on mode and tool category
 */
export function extractContextForMode(
  toolName: string,
  params: Record<string, unknown>,
  mode: ExtractedMode,
  manualContext?: ExtractedContext,
): ExtractedContext | undefined {
  if (mode === 'manual' && manualContext) {
    return manualContext;
  }

  const category = getToolCategory(toolName);
  if (!category) return undefined;

  const extracted: ExtractedContext = {};

  if (category === 'sql') {
    extracted.sql = extractSqlContext(params);
  } else if (category === 'github') {
    extracted.github = extractGithubContext(params);
  } else if (category === 'file') {
    extracted.file = extractFileContext(params);
  }

  return Object.keys(extracted).length > 0 ? extracted : undefined;
}
