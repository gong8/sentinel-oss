/**
 * Server Utilities
 * Standardized functions for MCP server identification
 *
 * IMPORTANT: Server identification in Sentinel uses two formats:
 *
 * 1. Server Key (for tool patterns, policy matching, tool invocations):
 *    - Format: "hostname:port" or just "hostname" if default port
 *    - Examples: "localhost:3000", "github.com", "api.notion.so"
 *    - Used in: Tool patterns (e.g., "github.com::createPR"), policy rules
 *
 * 2. Server Name (for display only):
 *    - Human-friendly name set by admin
 *    - Examples: "GitHub MCP", "Notion", "Local Dev Server"
 *    - Used in: UI display, audit logs, user-facing messages
 *
 * RULE: Never use server.name in tool patterns or qualified tool names.
 *       Always use getServerKeyFromUrl(server.url) for tool identification.
 */

/**
 * Extracts the server key from a URL for use in tool patterns.
 *
 * The server key is the canonical identifier used in:
 * - Tool patterns (e.g., "github.com::createPR")
 * - Policy tool pattern matching
 * - Tool invocation routing
 *
 * @param url - The MCP server URL (e.g., "http://localhost:3000/mcp")
 * @returns The server key (e.g., "localhost:3000" or "github.com")
 */
export function getServerKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Normalize to lowercase for consistent tool pattern matching
    const hostname = parsed.hostname.toLowerCase();
    return parsed.port ? `${hostname}:${parsed.port}` : hostname;
  } catch {
    // If URL parsing fails, return the original string lowercased
    // This allows for graceful degradation
    return url.toLowerCase();
  }
}

/**
 * Creates a qualified tool name from a server URL and tool name.
 *
 * @param serverUrl - The MCP server URL (e.g., "http://localhost:3000")
 * @param toolName - The tool name (e.g., "createPR")
 * @returns The qualified tool name (e.g., "localhost:3000::createPR")
 */
export function createQualifiedToolName(serverUrl: string, toolName: string): string {
  const serverKey = getServerKeyFromUrl(serverUrl);
  return `${serverKey}::${toolName}`;
}

/**
 * Parses a qualified tool name into its components.
 *
 * @param qualifiedName - The qualified tool name (e.g., "github.com::createPR")
 * @returns Object with serverKey and toolName, or null if invalid format
 */
export function parseQualifiedToolName(
  qualifiedName: string,
): { serverKey: string; toolName: string } | null {
  const parts = qualifiedName.split('::');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { serverKey: parts[0], toolName: parts[1] };
}
