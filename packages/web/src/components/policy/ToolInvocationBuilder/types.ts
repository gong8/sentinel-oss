/**
 * Types for Tool Invocation Builder components
 * Matches the backend types in packages/api/src/types/toolInvocation.ts
 */

// ============================================================================
// CONTEXT OVERRIDES
// ============================================================================

export interface ContextOverrides {
  hourOfDay?: number; // 0-23
  dayOfWeek?: number; // 0-6 (Sunday = 0)
  sourceIp?: string;
  timestamp?: string; // ISO timestamp
}

// ============================================================================
// EXTRACTED CONTEXT
// ============================================================================

export interface SqlExtractedContext {
  sqlOperation?: string;
  sqlTables?: string[];
  hasSqlComment?: boolean;
}

export interface GithubExtractedContext {
  gitRepository?: string;
  gitBranch?: string;
  gitOwner?: string;
  isProtectedBranch?: boolean;
}

export interface FileExtractedContext {
  filePath?: string;
  fileExtension?: string;
  isSensitivePath?: boolean;
}

export interface ExtractedContext {
  sql?: SqlExtractedContext;
  github?: GithubExtractedContext;
  file?: FileExtractedContext;
}

// ============================================================================
// MODE TYPES
// ============================================================================

export type ExtractedMode = 'auto' | 'manual';
export type ParameterMode = 'exact' | 'subset' | 'ignore';

// ============================================================================
// TOOL CATEGORY
// ============================================================================

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
// FULL INVOCATION
// ============================================================================

export interface ToolInvocation {
  parameters?: Record<string, unknown>;
  contextOverrides?: ContextOverrides;
  extractedContext?: ExtractedContext;
  extractedMode?: ExtractedMode;
}
