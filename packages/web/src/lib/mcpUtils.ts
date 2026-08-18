/**
 * Utilities for working with MCP servers and tool names
 */

/**
 * Server info for tool name formatting
 */
interface ServerInfo {
  name: string;
  url: string;
}

/**
 * Known brand name mappings for common services
 */
const BRAND_NAMES: Record<string, string> = {
  'notion.so': 'Notion',
  'github.com': 'GitHub',
  'api.github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'api.slack.com': 'Slack',
  'slack.com': 'Slack',
  'linear.app': 'Linear',
  'api.linear.app': 'Linear',
  'jira.atlassian.com': 'Jira',
  'confluence.atlassian.com': 'Confluence',
  'api.openai.com': 'OpenAI',
  'api.anthropic.com': 'Anthropic',
  'googleapis.com': 'Google',
  'api.trello.com': 'Trello',
  'api.asana.com': 'Asana',
  'api.airtable.com': 'Airtable',
  'api.hubspot.com': 'HubSpot',
  'api.salesforce.com': 'Salesforce',
  'api.zendesk.com': 'Zendesk',
  'api.intercom.io': 'Intercom',
  'api.stripe.com': 'Stripe',
  'api.twilio.com': 'Twilio',
  'api.sendgrid.com': 'SendGrid',
  'api.mailchimp.com': 'Mailchimp',
  'api.dropbox.com': 'Dropbox',
  'graph.microsoft.com': 'Microsoft',
  'outlook.office.com': 'Outlook',
  'api.figma.com': 'Figma',
  'api.vercel.com': 'Vercel',
  'api.netlify.com': 'Netlify',
  'api.aws.amazon.com': 'AWS',
  'sentry.io': 'Sentry',
  'api.datadog.com': 'Datadog',
  'api.pagerduty.com': 'PagerDuty',
};

/**
 * Format a domain to a friendly server name
 * e.g., "notion.so" -> "Notion", "github.com" -> "GitHub"
 */
export function formatServerName(domain: string): string {
  const lowerDomain = domain.toLowerCase();

  // Check for exact match
  if (BRAND_NAMES[lowerDomain]) {
    return BRAND_NAMES[lowerDomain];
  }

  // Check for partial match
  for (const [key, value] of Object.entries(BRAND_NAMES)) {
    if (lowerDomain.includes(key) || key.includes(lowerDomain)) {
      return value;
    }
  }

  // Fallback: Extract the main domain name and capitalize
  const parts = domain.split('.');
  const mainPart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  const cleanPart = mainPart.replace(/^(api|app|www|v\d+)[-.]?/, '');

  return cleanPart
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extracts the tool name from a qualified format (server::tool)
 * @param toolName - Tool name, possibly in qualified format
 * @returns The unqualified tool name
 */
export function extractToolName(toolName: string): string {
  if (toolName.includes('::')) {
    const parts = toolName.split('::');
    return parts[parts.length - 1];
  }
  return toolName;
}

/**
 * Extracts the domain from a qualified format (server::tool)
 * @param toolName - Tool name, possibly in qualified format
 * @returns The domain/server part, or empty string if not qualified
 */
export function extractDomain(toolName: string): string {
  if (toolName.includes('::')) {
    const parts = toolName.split('::');
    return parts[0];
  }
  return '';
}

/**
 * Format a raw tool name (without domain prefix)
 * e.g., "search_pages" -> "Search Pages", "createIssue" -> "Create Issue"
 */
export function formatRawToolName(name: string): string {
  // Handle snake_case
  if (name.includes('_')) {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Handle camelCase/PascalCase
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Formats a tool name for display in chat messages and confirmation cards.
 * Handles qualified names (server::tool), underscores, and camelCase.
 * @param toolName - Tool name in any format
 * @returns Human-readable tool name (e.g., "notion.so::search_pages" -> "Notion: Search Pages")
 */
export function formatToolNameForChat(toolName: string): string {
  // Check for domain::toolname format (MCP tools)
  if (toolName.includes('::')) {
    const domain = extractDomain(toolName);
    const name = extractToolName(toolName);
    const serverName = formatServerName(domain);
    const formattedTool = formatRawToolName(name);
    return `${serverName}: ${formattedTool}`;
  }

  // Simple tool name (admin tools)
  return formatRawToolName(toolName);
}

/**
 * Extracts domain:port from a server URL
 * @param serverUrl - Full URL of the MCP server
 * @returns Domain with optional port (e.g., "example.com" or "example.com:3000")
 */
export function getDomainPrefix(serverUrl: string): string {
  try {
    const url = new URL(serverUrl);
    const domain = url.hostname;
    const port = url.port ? `:${url.port}` : '';
    return `${domain}${port}`;
  } catch {
    return '';
  }
}

/**
 * Converts a qualified tool name from domain::tool format to serverName::tool format
 * @param qualifiedName - Tool name in domain::tool format
 * @param servers - Array of server info objects
 * @returns Tool name in serverName::tool format for display
 */
export function formatToolNameForDisplay(qualifiedName: string, servers: ServerInfo[]): string {
  try {
    const parts = qualifiedName.split('::');
    if (parts.length === 2) {
      const [serverPart, toolPart] = parts;
      for (const server of servers) {
        const domainPrefix = getDomainPrefix(server.url);
        if (serverPart === domainPrefix) {
          return `${server.name}::${toolPart}`;
        }
      }
    }
    return qualifiedName;
  } catch {
    return qualifiedName;
  }
}

/**
 * Creates a formatter function bound to a specific set of servers
 * Useful when you have server data from a query and want to format multiple tool names
 * @param servers - Array of server info objects
 * @returns A function that formats tool names using the bound servers
 */
export function createToolNameFormatter(
  servers: ServerInfo[] | undefined,
): (qualifiedName: string) => string {
  if (!servers) {
    return (qualifiedName) => qualifiedName;
  }
  return (qualifiedName) => formatToolNameForDisplay(qualifiedName, servers);
}
