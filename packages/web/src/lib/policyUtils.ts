/**
 * Policy Utilities
 * Shared conversion functions for policy matchers and tool patterns
 */

import { isPlainObject } from './utils.js';

// Types for matchers and tool patterns
export type MatcherType = 'all' | 'user' | 'role' | 'agent';

export interface MatcherEntry {
  type: MatcherType;
  value: string;
}

export interface ToolPatternEntry {
  server: string;
  tool: string;
}

// Type guard sets for filter validation
const MATCHER_TYPE_SET: ReadonlySet<string> = new Set<MatcherType>([
  'all',
  'user',
  'role',
  'agent',
]);

/**
 * Type guard to check if a string is a valid MatcherType
 */
export function isMatcherType(value: string): value is MatcherType {
  return MATCHER_TYPE_SET.has(value);
}

/**
 * Error type for malformed policy data
 */
export class MalformedPolicyError extends Error {
  constructor(
    message: string,
    public field: 'matcher' | 'toolPattern',
    public value: unknown,
  ) {
    super(message);
    this.name = 'MalformedPolicyError';
  }
}

/**
 * Convert internal matcher string format to UI format
 * @param matcher - Internal format like "*", "user:email@example.com", "role:admin"
 * @returns UI format with type and value separated
 * @throws MalformedPolicyError if the matcher format is invalid or null/undefined
 */
export function matcherToUI(matcher: string | null | undefined): MatcherEntry {
  // Check for null/undefined/empty - these indicate malformed policy data
  if (matcher === null || matcher === undefined) {
    throw new MalformedPolicyError(
      'Matcher is null or undefined - policy data is malformed',
      'matcher',
      matcher,
    );
  }
  if (typeof matcher !== 'string') {
    throw new MalformedPolicyError(
      `Matcher must be a string, got ${typeof matcher}`,
      'matcher',
      matcher,
    );
  }
  if (matcher.trim() === '') {
    throw new MalformedPolicyError('Matcher cannot be empty string', 'matcher', matcher);
  }

  if (matcher === '*') {
    return { type: 'all', value: '' };
  }

  const [type, ...valueParts] = matcher.split(':');
  const value = valueParts.join(':'); // Handle emails with colons
  if (type === 'user' || type === 'role' || type === 'agent') {
    return { type, value };
  }

  // Unknown format - throw error instead of silently defaulting
  throw new MalformedPolicyError(
    `Invalid matcher format: "${matcher}". Expected "*" or "type:value" where type is user, role, or agent`,
    'matcher',
    matcher,
  );
}

/**
 * Convert UI matcher format to internal string format
 * @param type - Matcher type ('all', 'user', 'role', 'agent')
 * @param value - The value (email, role name, or agent id)
 * @returns Internal format string
 */
export function matcherFromUI(type: MatcherType, value: string): string {
  if (type === 'all') {
    return '*';
  }
  return `${type}:${value}`;
}

/**
 * Convert internal tool pattern string to UI format
 * Handles both MCP patterns (server::tool) and A2A patterns (a2a::agentId::skillId)
 * @param toolPattern - Internal format like "*::*", "server::tool", "a2a::agentId::skill"
 * @returns UI format with server and tool separated
 * @throws MalformedPolicyError if the tool pattern format is invalid or null/undefined
 */
export function toolPatternToUI(toolPattern: string | null | undefined): ToolPatternEntry {
  // Check for null/undefined - these indicate malformed policy data
  if (toolPattern === null || toolPattern === undefined) {
    throw new MalformedPolicyError(
      'Tool pattern is null or undefined - policy data is malformed',
      'toolPattern',
      toolPattern,
    );
  }
  if (typeof toolPattern !== 'string') {
    throw new MalformedPolicyError(
      `Tool pattern must be a string, got ${typeof toolPattern}`,
      'toolPattern',
      toolPattern,
    );
  }
  if (toolPattern.trim() === '') {
    throw new MalformedPolicyError(
      'Tool pattern cannot be empty string',
      'toolPattern',
      toolPattern,
    );
  }

  if (toolPattern === '*::*') {
    return { server: '*', tool: '*' };
  }
  const parts = toolPattern.split('::');
  // A2A patterns: a2a::agentId::skillId -> server: "a2a:agentId", tool: skillId
  if (parts.length === 3 && parts[0] === 'a2a') {
    return { server: `a2a:${parts[1]}`, tool: parts[2] || '*' };
  }
  // MCP patterns: server::tool
  if (parts.length === 2) {
    return { server: parts[0] || '*', tool: parts[1] || '*' };
  }

  // Unknown format - throw error instead of silently defaulting
  throw new MalformedPolicyError(
    `Invalid tool pattern format: "${toolPattern}". Expected "server::tool" format`,
    'toolPattern',
    toolPattern,
  );
}

/**
 * Convert UI tool pattern format to internal string format
 * @param server - Server key or "a2a:agentId" for A2A patterns
 * @param tool - Tool or skill name
 * @returns Internal format string
 */
export function toolPatternFromUI(server: string, tool: string): string {
  // A2A patterns: server "a2a:agentId" -> a2a::agentId::skillId
  if (server.startsWith('a2a:')) {
    const agentId = server.slice(4); // Remove "a2a:" prefix
    return `a2a::${agentId}::${tool}`;
  }
  // MCP patterns: server::tool
  return `${server}::${tool}`;
}

/**
 * Result type for safe conversion functions
 */
export type SafeConversionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; rawValue: unknown };

/**
 * Safe version of matcherToUI that returns a result object instead of throwing
 * Use this in UI components where you need to display an error state
 */
export function safeMatcherToUI(matcher: unknown): SafeConversionResult<MatcherEntry> {
  try {
    const result = matcherToUI(matcher as string);
    return { success: true, data: result };
  } catch (e) {
    const message = e instanceof MalformedPolicyError ? e.message : 'Unknown error parsing matcher';
    return { success: false, error: message, rawValue: matcher };
  }
}

/**
 * Safe version of toolPatternToUI that returns a result object instead of throwing
 * Use this in UI components where you need to display an error state
 */
export function safeToolPatternToUI(toolPattern: unknown): SafeConversionResult<ToolPatternEntry> {
  try {
    const result = toolPatternToUI(toolPattern as string);
    return { success: true, data: result };
  } catch (e) {
    const message =
      e instanceof MalformedPolicyError ? e.message : 'Unknown error parsing tool pattern';
    return { success: false, error: message, rawValue: toolPattern };
  }
}

/**
 * Check if a policy has valid matchers array
 */
export function hasValidMatchers(matchers: unknown): matchers is string[] {
  return (
    Array.isArray(matchers) &&
    matchers.length > 0 &&
    matchers.every((m) => typeof m === 'string' && m.trim() !== '')
  );
}

/**
 * Check if a policy has valid toolPatterns array
 */
export function hasValidToolPatterns(toolPatterns: unknown): toolPatterns is string[] {
  return (
    Array.isArray(toolPatterns) &&
    toolPatterns.length > 0 &&
    toolPatterns.every((t) => typeof t === 'string' && t.trim() !== '')
  );
}

/**
 * Validate that a policy has all required fields properly set
 * Returns an array of error messages, empty if valid
 */
export function validatePolicyData(policy: {
  matchers?: unknown;
  toolPatterns?: unknown;
  effect?: unknown;
  description?: unknown;
}): string[] {
  const errors: string[] = [];

  if (!hasValidMatchers(policy.matchers)) {
    errors.push('matchers is missing or invalid (must be non-empty string array)');
  }
  if (!hasValidToolPatterns(policy.toolPatterns)) {
    errors.push('toolPatterns is missing or invalid (must be non-empty string array)');
  }
  if (policy.effect !== 'ALLOW' && policy.effect !== 'DENY') {
    errors.push('effect is missing or invalid (must be ALLOW or DENY)');
  }
  if (typeof policy.description !== 'string') {
    errors.push('description is missing or invalid');
  }

  return errors;
}

/**
 * Format a tool pattern for display using friendly server names
 * @param toolPattern - Tool pattern string like "localhost:3000::myTool"
 * @param getServerName - Function to convert server key to friendly name
 * @returns Formatted display string like "MyServer::myTool"
 */
export function formatToolPatternDisplay(
  toolPattern: string,
  getServerName: (serverKey: string) => string,
): string {
  const { server, tool } = toolPatternToUI(toolPattern);
  const serverName = getServerName(server);
  return `${serverName}::${tool}`;
}

/**
 * Format a matcher for display
 * @param matcher - Matcher string like "user:email@example.com" or "*"
 * @returns Formatted display string
 */
export function formatMatcherDisplay(matcher: string): string {
  if (matcher === '*') {
    return 'All Users';
  }
  const { type, value } = matcherToUI(matcher);
  switch (type) {
    case 'user':
      return `User: ${value}`;
    case 'role':
      return `Role: ${value}`;
    case 'agent':
      return `Agent: ${value}`;
    default:
      return 'All Users';
  }
}

/**
 * Normalize policy conditions from database format to UI format
 * Handles both wrapped format { conditions: [...] } and flat array format
 * @param conditions - Raw conditions from database (may be wrapped or flat array)
 * @returns Flat array of conditions or null
 */
export function normalizeConditions(
  conditions: unknown,
): Array<{ field: string; operator: string; value?: unknown; valueRef?: string }> | null {
  if (conditions === null || conditions === undefined) {
    return null;
  }

  // Already a flat array
  if (Array.isArray(conditions)) {
    // Validate that each item has the expected shape
    const isValidArray = conditions.every(
      (item) =>
        isPlainObject(item) && typeof item.field === 'string' && typeof item.operator === 'string',
    );
    if (isValidArray) {
      return conditions as Array<{
        field: string;
        operator: string;
        value?: unknown;
        valueRef?: string;
      }>;
    }
    return null;
  }

  // Wrapped format { conditions: [...] }
  if (
    isPlainObject(conditions) &&
    'conditions' in conditions &&
    Array.isArray(conditions.conditions)
  ) {
    const innerConditions = conditions.conditions;
    // Validate inner array structure
    const isValidArray = innerConditions.every(
      (item: unknown) =>
        isPlainObject(item) && typeof item.field === 'string' && typeof item.operator === 'string',
    );
    if (isValidArray) {
      return innerConditions as Array<{ field: string; operator: string; value?: unknown }>;
    }
    return null;
  }

  // Unknown format, return null
  return null;
}
