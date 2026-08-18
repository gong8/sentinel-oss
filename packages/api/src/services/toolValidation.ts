import { prisma } from '@sentinel/db';
import { getServerKeyFromUrl } from '../lib/serverUtils.js';

export interface ToolValidationResult {
  toolNames: string[];
  invalidFormat: string[];
  unknownServer: string[];
  unknownTool: string[];
}

// Server key: hostname with optional port (e.g., "localhost:3000", "api.notion.so")
const SERVER_KEY_PATTERN = /^[a-zA-Z0-9.-]+(:\d+)?$/;
// Tool name: letters, numbers, dots, hyphens, underscores
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function normalizeToolNames(toolNames: string[]): string[] {
  const trimmed = toolNames.map((name) => name.trim()).filter(Boolean);
  return Array.from(new Set(trimmed));
}

function isValidNamePart(value: string, pattern: RegExp): boolean {
  return value === '*' || pattern.test(value);
}

function parseQualifiedToolName(toolName: string): {
  server: string;
  tool: string;
  isWildcard: boolean;
} | null {
  const parts = toolName.split('::');
  if (parts.length !== 2) {
    return null;
  }

  const [server, tool] = parts;

  if (!isValidNamePart(server, SERVER_KEY_PATTERN) || !isValidNamePart(tool, TOOL_NAME_PATTERN)) {
    return null;
  }

  return {
    server,
    tool,
    isWildcard: server === '*' || tool === '*',
  };
}

const ERROR_MESSAGES = {
  invalidFormat: {
    prefix: 'Invalid tool pattern format',
    suffix:
      'Use "serverKey::tool_name" format where serverKey is hostname:port (e.g., "api.notion.so::*").',
  },
  unknownServer: {
    prefix: 'Unknown MCP server keys',
    suffix: 'Use list_mcp_servers to see available servers and their serverKey values.',
  },
  unknownTool: {
    prefix: 'Unknown tools',
    suffix: 'Use list_tools to see available tools with their fullName values.',
  },
} as const;

function formatErrorItems(items: string[], prefix: string, suffix: string): string {
  return `${prefix}: ${items.join(', ')}. ${suffix}`;
}

export function getToolValidationErrorMessage(result: ToolValidationResult): string | null {
  const messages: string[] = [];

  for (const [key, config] of Object.entries(ERROR_MESSAGES)) {
    const items = result[key as keyof typeof ERROR_MESSAGES];
    if (items.length > 0) {
      messages.push(formatErrorItems(items, config.prefix, config.suffix));
    }
  }

  return messages.length > 0 ? messages.join('. ') : null;
}

interface IndexedServer {
  toolNames: Set<string>;
}

function buildServerIndex(
  servers: Array<{ url: string; tools: Array<{ name: string }> }>,
): Map<string, IndexedServer[]> {
  const index = new Map<string, IndexedServer[]>();

  for (const server of servers) {
    // Use server key (hostname:port) derived from URL, not friendly name
    const key = getServerKeyFromUrl(server.url).toLowerCase();
    const entry: IndexedServer = {
      toolNames: new Set(server.tools.map((tool) => tool.name)),
    };

    const existing = index.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      index.set(key, [entry]);
    }
  }

  return index;
}

function createEmptyResult(toolNames: string[]): ToolValidationResult {
  return { toolNames, invalidFormat: [], unknownServer: [], unknownTool: [] };
}

export async function validateToolNamesForOrganization(
  organizationId: string,
  toolNames: string[],
): Promise<ToolValidationResult> {
  const normalized = normalizeToolNames(toolNames);

  if (normalized.length === 0) {
    return {
      toolNames: normalized,
      invalidFormat: ['<empty>'],
      unknownServer: [],
      unknownTool: [],
    };
  }

  const servers = await prisma.mcpServer.findMany({
    where: { organizationId, deletedAt: null },
    select: { url: true, tools: { select: { name: true } } },
  });

  const serverIndex = buildServerIndex(servers);
  const result = createEmptyResult(normalized);

  for (const toolName of normalized) {
    const parsed = parseQualifiedToolName(toolName);

    if (!parsed) {
      result.invalidFormat.push(toolName);
      continue;
    }

    if (parsed.isWildcard) {
      continue;
    }

    const matchingServers = serverIndex.get(parsed.server.toLowerCase());

    if (!matchingServers) {
      result.unknownServer.push(toolName);
      continue;
    }

    const hasTool = matchingServers.some((server) => server.toolNames.has(parsed.tool));
    if (!hasTool) {
      result.unknownTool.push(toolName);
    }
  }

  return result;
}
