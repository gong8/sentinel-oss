/**
 * Policy Pattern Utilities
 *
 * Pure functions for matching and validating policy patterns (matchers and tool patterns).
 * These functions have no external dependencies and can be used across packages.
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Matches pattern to value, supporting '*' wildcard */
function matchesWithWildcard(pattern: string, value: string, caseInsensitive = false): boolean {
  if (pattern === '*') return true;
  if (caseInsensitive) return pattern.toLowerCase() === value.toLowerCase();
  return pattern === value;
}

/** Parses a matcher into type and value */
function parseMatcherTypeAndValue(matcher: string): { type: string; value: string } {
  const [type, ...valueParts] = matcher.split(':');
  return { type, value: valueParts.join(':') };
}

/** Checks if two values overlap (either is wildcard or they're equal) */
function valuesOverlap(a: string, b: string): boolean {
  return a === '*' || b === '*' || a === b;
}

// ============================================================================
// TOOL PATTERN MATCHING
// ============================================================================

/**
 * Checks if a tool pattern matches the tool name
 *
 * Pattern formats:
 * - MCP: "Server Name::toolName", "Server Name::*", "*::*"
 * - A2A: "a2a::agentId::skillId", "a2a::agentId::*", "a2a::*::*"
 *
 * @returns true if pattern matches, false otherwise (including invalid formats)
 */
export function checkToolPattern(pattern: string, toolName: string): boolean {
  if (pattern === '*::*' || pattern === '*') return true;

  const isA2APattern = pattern.startsWith('a2a::');
  const isA2ATool = toolName.startsWith('a2a::');

  // A2A patterns must match A2A tools
  if (isA2APattern !== isA2ATool) return false;

  if (isA2APattern) {
    const patternParts = pattern.split('::');
    const toolParts = toolName.split('::');

    if (patternParts.length !== 3 || toolParts.length !== 3) {
      return false;
    }

    return (
      matchesWithWildcard(patternParts[1], toolParts[1]) &&
      matchesWithWildcard(patternParts[2], toolParts[2])
    );
  }

  // MCP patterns: Server Name::tool
  const [patternServer, patternTool] = pattern.split('::');
  const [toolServer, tool] = toolName.split('::');

  if (!patternServer || !patternTool || !toolServer || !tool) {
    return false;
  }

  return (
    matchesWithWildcard(patternServer, toolServer, true) && matchesWithWildcard(patternTool, tool)
  );
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates a single policy matcher format
 *
 * Valid matchers identify WHO is calling:
 * - "*" - everyone
 * - "role:RoleName" - users with a specific role
 * - "user:email@example.com" - specific user
 * - "agent:agentId" - specific MCP agent
 * - "workspace:workspaceId" - members of a specific workspace
 * - "workspace-admin:workspaceId" - admins of a specific workspace
 *
 * Note: A2A agents are TARGETS, not callers. Use tool patterns to control A2A access.
 */
export function validateMatcher(matcher: string): boolean {
  if (matcher === '*') return true;

  const pattern = /^(role|user|agent|workspace|workspace-admin):(\*|[a-zA-Z0-9@._-]+)$/;
  return pattern.test(matcher);
}

/**
 * Validates an array of matchers
 * Returns true if all matchers are valid and array is non-empty
 */
export function validateMatchers(matchers: string[]): boolean {
  if (matchers.length === 0) return false;
  return matchers.every(validateMatcher);
}

/**
 * Validates a single tool pattern format
 *
 * Formats:
 * - MCP tools: "serverKey::tool", "serverKey::*", "*::tool", "*::*"
 *   where serverKey is hostname:port (e.g., "api.notion.so", "localhost:3000")
 * - A2A agents: "a2a::agentId::skillId", "a2a::agentId::*", "a2a::*::*"
 */
export function validateToolPattern(toolPattern: string): boolean {
  // Universal wildcard
  if (toolPattern === '*::*') {
    return true;
  }

  // A2A patterns: a2a::agentId::skillId
  if (toolPattern.startsWith('a2a::')) {
    const a2aParts = toolPattern.split('::');
    if (a2aParts.length !== 3) {
      return false;
    }
    const [, agentPart, skillPart] = a2aParts;
    const agentValid = agentPart === '*' || /^[a-zA-Z0-9._-]+$/.test(agentPart);
    const skillValid = skillPart === '*' || /^[a-zA-Z0-9._-]+$/.test(skillPart);
    return agentValid && skillValid;
  }

  // MCP patterns: serverKey::tool (serverKey is hostname with optional port)
  const parts = toolPattern.split('::');
  if (parts.length !== 2) {
    return false;
  }

  const [serverPart, toolPart] = parts;

  // Validate server part: either * or serverKey (hostname with optional :port)
  // Examples: "api.notion.so", "localhost:3000", "github.com"
  const serverValid = serverPart === '*' || /^[a-zA-Z0-9.-]+(:\d+)?$/.test(serverPart);

  // Validate tool part: either * or toolName
  const toolValid = toolPart === '*' || /^[a-zA-Z0-9._-]+$/.test(toolPart);

  return serverValid && toolValid;
}

/**
 * Validates an array of tool patterns
 * Returns true if all patterns are valid and array is non-empty
 */
export function validateToolPatterns(toolPatterns: string[]): boolean {
  if (toolPatterns.length === 0) return false;
  return toolPatterns.every(validateToolPattern);
}

// ============================================================================
// OVERLAP DETECTION
// ============================================================================

/**
 * Checks if two matcher patterns overlap (could match the same user/agent)
 * e.g., "role:*" overlaps with "role:Admin", "*" overlaps with everything
 */
export function matchersOverlap(matcher1: string, matcher2: string): boolean {
  if (matcher1 === matcher2) return true;
  if (matcher1 === '*' || matcher2 === '*') return true;

  const { type: type1, value: value1 } = parseMatcherTypeAndValue(matcher1);
  const { type: type2, value: value2 } = parseMatcherTypeAndValue(matcher2);

  if (type1 !== type2) return false;

  return valuesOverlap(value1, value2);
}

/**
 * Checks if two matcher arrays overlap (any matcher in one could match a matcher in the other)
 */
export function matcherArraysOverlap(matchers1: string[], matchers2: string[]): boolean {
  return matchers1.some((m1) => matchers2.some((m2) => matchersOverlap(m1, m2)));
}

/**
 * Checks if two tool patterns overlap (could match the same tool)
 * Examples: "github::*" and "github::createPR" overlap, "*::*" overlaps with everything
 */
export function toolPatternsOverlap(pattern1: string, pattern2: string): boolean {
  if (pattern1 === pattern2) return true;
  if (pattern1 === '*::*' || pattern2 === '*::*') return true;

  const isA2A1 = pattern1.startsWith('a2a::');
  const isA2A2 = pattern2.startsWith('a2a::');

  // Different namespaces don't overlap
  if (isA2A1 !== isA2A2) return false;

  if (isA2A1) {
    const parts1 = pattern1.split('::');
    const parts2 = pattern2.split('::');
    if (parts1.length !== 3 || parts2.length !== 3) return false;

    return valuesOverlap(parts1[1], parts2[1]) && valuesOverlap(parts1[2], parts2[2]);
  }

  // MCP patterns
  const [domain1, tool1] = pattern1.split('::');
  const [domain2, tool2] = pattern2.split('::');

  if (!domain1 || !tool1 || !domain2 || !tool2) return false;

  return valuesOverlap(domain1, domain2) && valuesOverlap(tool1, tool2);
}

/**
 * Checks if two tool pattern arrays overlap (any pattern in one could match a pattern in the other)
 */
export function toolPatternArraysOverlap(patterns1: string[], patterns2: string[]): boolean {
  return patterns1.some((p1) => patterns2.some((p2) => toolPatternsOverlap(p1, p2)));
}
