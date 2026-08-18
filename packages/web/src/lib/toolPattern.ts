/**
 * Tool Pattern Utilities
 * Matches tool patterns against qualified tool names for flagged tool detection
 */

/**
 * Checks if a tool pattern matches a qualified tool name
 *
 * Pattern formats:
 * - "domain::toolName" - exact match
 * - "domain::*" - all tools from domain
 * - "*::toolName" - specific tool on any server
 * - "*::*" - all tools
 *
 * @param pattern - The pattern to match against (e.g., "github.com::*")
 * @param toolName - The qualified tool name (e.g., "github.com::createPR")
 */
export function checkToolPattern(pattern: string, toolName: string): boolean {
  if (pattern === '*::*') {
    return true;
  }

  const [patternDomain, patternTool] = pattern.split('::');
  const [toolDomain, tool] = toolName.split('::');

  if (!patternDomain || !patternTool || !toolDomain || !tool) {
    return false;
  }

  const domainMatches = patternDomain === '*' || patternDomain === toolDomain;
  const toolMatches = patternTool === '*' || patternTool === tool;

  return domainMatches && toolMatches;
}

/**
 * Extracts the server key from a URL for use in tool patterns
 *
 * @param url - The MCP server URL (e.g., "http://localhost:3000")
 * @returns The server key (e.g., "localhost:3000" or "github.com")
 */
export function getServerKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Creates a qualified tool name from server key and tool name
 *
 * @param serverKey - The server key (e.g., "github.com")
 * @param toolName - The tool name (e.g., "createPR")
 * @returns The qualified tool name (e.g., "github.com::createPR")
 */
export function createQualifiedToolName(serverKey: string, toolName: string): string {
  return `${serverKey}::${toolName}`;
}
