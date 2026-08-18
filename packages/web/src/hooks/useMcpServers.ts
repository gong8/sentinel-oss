import { useMemo } from 'react';
import { getServerKeyFromUrl } from '../lib/toolPattern';
import { trpc } from '../lib/trpc';

// MCP server interface for simpler type handling (avoids deep instantiation issues)
export interface McpServerData {
  id: string;
  name: string;
  url: string;
  tools?: { id: string; name: string }[];
}

// Risk level enum matching backend
export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Access type enum matching backend
export type ToolAccessType = 'READ' | 'WRITE' | 'READ_WRITE';

// Tool with flag status and classification
export interface ToolWithFlagStatus {
  name: string;
  description?: string | null;
  isFlagged: boolean;
  flagBehaviors: string[];
  riskLevel: ToolRiskLevel | null;
  accessType: ToolAccessType | null;
}

/**
 * Helper to extract MCP servers with simpler type to avoid deep instantiation
 */
function extractMcpServers<
  T extends Array<{
    id: string;
    name: string;
    url: string;
    tools?: { id: string; name: string }[];
  }>,
>(data: T | undefined): McpServerData[] | undefined {
  return data;
}

export interface UseMcpServersOptions {
  /**
   * Optional workspace ID to filter servers.
   * When provided, shows servers for that workspace + org-wide servers.
   * When null/undefined, shows all servers the user has access to.
   */
  workspaceId?: string | null;
}

/**
 * Hook to manage MCP servers and their tools with utility functions
 */
export function useMcpServers(options?: UseMcpServersOptions) {
  // Only pass workspaceId when it's a non-null string to avoid query key issues
  const queryInput =
    options?.workspaceId != null ? { workspaceId: options.workspaceId } : undefined;
  const mcpServersQuery = trpc.admin.mcpServers.list.useQuery(queryInput);
  const a2aAgentsQuery = trpc.admin.a2a.listAgents.useQuery();
  const toolFlagStatusQuery = trpc.admin.mcpServers.getToolsWithFlagStatus.useQuery();

  const mcpServers = extractMcpServers(mcpServersQuery.data);

  // Build a map of tool qualified name -> flag status for quick lookup
  const toolFlagMap = useMemo(() => {
    const map = new Map<string, { isFlagged: boolean; flagBehaviors: string[] }>();
    if (!toolFlagStatusQuery.data?.servers) return map;
    for (const server of toolFlagStatusQuery.data.servers) {
      const serverKey = getServerKeyFromUrl(server.url);
      for (const tool of server.tools) {
        const qualifiedName = `${serverKey}::${tool.name}`;
        map.set(qualifiedName, {
          isFlagged: tool.isFlagged,
          flagBehaviors: tool.flagBehaviors,
        });
      }
    }
    return map;
  }, [toolFlagStatusQuery.data]);

  /**
   * Get the server key from a server URL
   */
  function getServerKey(serverUrl: string): string {
    return getServerKeyFromUrl(serverUrl);
  }

  /**
   * Get display name for a server key
   * @param serverKey - The server key like "localhost:3000"
   * @returns The friendly server name or the key itself
   */
  function getServerNameForDisplay(serverKey: string): string {
    if (serverKey === '*') return '*';

    // Handle A2A agent patterns
    if (serverKey.startsWith('a2a:')) {
      const agentId = serverKey.slice(4);
      const agent = a2aAgentsQuery.data?.find((a) => a.id === agentId);
      return agent ? `A2A: ${agent.name}` : serverKey;
    }

    if (!mcpServers) return serverKey;

    // Find matching server by URL
    for (const server of mcpServers) {
      const key = getServerKeyFromUrl(server.url);
      if (serverKey === key) {
        return server.name;
      }
    }
    return serverKey;
  }

  /**
   * Get tools for a given server key
   * @param serverKey - The server key like "localhost:3000" or "a2a:agentId"
   * @returns Array of tools with id and name
   */
  function getToolsForServer(serverKey: string): { id: string; name: string }[] {
    if (serverKey === '*') return [];

    // Handle A2A agents: server key is "a2a:agentId", return skills
    if (serverKey.startsWith('a2a:')) {
      const agentId = serverKey.slice(4);
      const agent = a2aAgentsQuery.data?.find((a) => a.id === agentId);
      return agent?.skills ?? [];
    }

    // Handle MCP servers
    if (!mcpServers) return [];
    const server = mcpServers.find((s) => getServerKeyFromUrl(s.url) === serverKey);
    return server?.tools || [];
  }

  /**
   * Check if a specific tool is flagged
   */
  function isToolFlagged(serverKey: string, toolName: string): boolean {
    if (serverKey === '*' || toolName === '*') return false;
    const qualifiedName = `${serverKey}::${toolName}`;
    return toolFlagMap.get(qualifiedName)?.isFlagged ?? false;
  }

  /**
   * Get flagged and unflagged tool counts for a server
   */
  function getToolFlagCountsForServer(serverKey: string): {
    flagged: number;
    unflagged: number;
    flaggedTools: ToolWithFlagStatus[];
    unflaggedTools: ToolWithFlagStatus[];
  } {
    if (!toolFlagStatusQuery.data?.servers || serverKey === '*') {
      return { flagged: 0, unflagged: 0, flaggedTools: [], unflaggedTools: [] };
    }
    const server = toolFlagStatusQuery.data.servers.find(
      (s) => getServerKeyFromUrl(s.url) === serverKey,
    );
    if (!server) {
      return { flagged: 0, unflagged: 0, flaggedTools: [], unflaggedTools: [] };
    }
    const flaggedTools = server.tools.filter((t) => t.isFlagged);
    const unflaggedTools = server.tools.filter((t) => !t.isFlagged);
    return {
      flagged: flaggedTools.length,
      unflagged: unflaggedTools.length,
      flaggedTools,
      unflaggedTools,
    };
  }

  /**
   * Format a tool name to use friendly server name
   * @param toolName - Qualified tool name like "localhost:3000::myTool"
   * @returns Formatted name like "MyServer::myTool"
   */
  function formatToolNameFriendly(toolName: string): string {
    const parts = toolName.split('::');
    if (parts.length === 2) {
      const [domain, tool] = parts;
      const serverName = getServerNameForDisplay(domain || '*');
      return `${serverName}::${tool}`;
    }
    return toolName;
  }

  // Tool flag data with classification info for ToolSelectorModal
  const toolFlagData = useMemo(() => {
    if (!toolFlagStatusQuery.data?.servers) return undefined;
    return {
      servers: toolFlagStatusQuery.data.servers.map((server) => ({
        id: server.id,
        name: server.name,
        url: server.url,
        serverKey: server.serverKey,
        tools: server.tools.map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          qualifiedName: tool.qualifiedName,
          isFlagged: tool.isFlagged,
          flagBehaviors: tool.flagBehaviors,
          riskLevel: tool.riskLevel,
          accessType: tool.accessType,
        })),
      })),
    };
  }, [toolFlagStatusQuery.data]);

  return {
    // Data
    mcpServers,
    a2aAgents: a2aAgentsQuery.data,
    toolFlagMap,
    toolFlagData,

    // Query states
    isLoading:
      mcpServersQuery.isPending || a2aAgentsQuery.isPending || toolFlagStatusQuery.isPending,
    isError: mcpServersQuery.isError || a2aAgentsQuery.isError || toolFlagStatusQuery.isError,

    // Utility functions
    getServerKey,
    getServerNameForDisplay,
    getToolsForServer,
    isToolFlagged,
    getToolFlagCountsForServer,
    formatToolNameFriendly,
  };
}
