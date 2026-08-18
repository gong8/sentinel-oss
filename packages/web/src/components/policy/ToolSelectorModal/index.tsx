/**
 * ToolSelectorModal Component
 * Modal with tree view for selecting tools with search and filters
 */

import type { JSX } from 'react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { McpServerData, ToolAccessType, ToolRiskLevel } from '../../../hooks/useMcpServers';
import type { ToolPatternEntry } from '../../../lib/policyUtils';
import { getServerKeyFromUrl } from '../../../lib/toolPattern';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { ScrollArea } from '../../ui/scroll-area';
import { FilterBar } from './FilterBar';
import { ServerNode, type ServerTool } from './ServerNode';

// Re-export display component
export { ToolSelectorDisplay } from './ToolSelectorDisplay';

export interface ToolSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTools: ToolPatternEntry[];
  onChange: (patterns: ToolPatternEntry[]) => void;
  mcpServers?: McpServerData[];
  a2aAgents?: Array<{ id: string; name: string; skills?: { id: string; name: string }[] }>;
  toolFlagData?: {
    servers: Array<{
      id: string;
      name: string;
      url: string;
      serverKey: string;
      tools: Array<{
        id: string;
        name: string;
        description?: string | null;
        qualifiedName: string;
        isFlagged: boolean;
        flagBehaviors: string[];
        riskLevel: ToolRiskLevel | null;
        accessType: ToolAccessType | null;
      }>;
    }>;
  };
  /** Whether the policy has tool parameter conditions (params.*) that would be invalidated by changing tool selection */
  hasParamConditions?: boolean;
}

export function ToolSelectorModal({
  open,
  onOpenChange,
  selectedTools,
  onChange,
  mcpServers,
  a2aAgents,
  toolFlagData,
  hasParamConditions = false,
}: ToolSelectorModalProps): JSX.Element {
  // Local state - track individual tools and server-level wildcards separately
  const [localSelectedTools, setLocalSelectedTools] = useState<Set<string>>(new Set());
  const [localSelectedServers, setLocalSelectedServers] = useState<Set<string>>(new Set());
  const [allServersSelected, setAllServersSelected] = useState(false);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [riskLevelFilter, setRiskLevelFilter] = useState<ToolRiskLevel[]>([]);
  const [accessTypeFilter, setAccessTypeFilter] = useState<ToolAccessType[]>([]);
  const [paramConditionError, setParamConditionError] = useState<string | null>(null);

  // Track previous open state to detect open transitions
  const prevOpenRef = useRef(false);

  // Build server data combining MCP servers and A2A agents
  const serverData = useMemo(() => {
    const servers: Array<{
      serverKey: string;
      serverName: string;
      tools: ServerTool[];
    }> = [];

    // MCP Servers
    if (toolFlagData?.servers) {
      for (const server of toolFlagData.servers) {
        servers.push({
          serverKey: server.serverKey,
          serverName: server.name,
          tools: server.tools.map((t) => ({
            name: t.name,
            description: t.description,
            qualifiedName: t.qualifiedName,
            riskLevel: t.riskLevel,
            accessType: t.accessType,
            isFlagged: t.isFlagged,
          })),
        });
      }
    } else if (mcpServers) {
      for (const server of mcpServers) {
        const serverKey = getServerKeyFromUrl(server.url);
        servers.push({
          serverKey,
          serverName: server.name,
          tools: (server.tools ?? []).map((t) => ({
            name: t.name,
            description: null,
            qualifiedName: `${serverKey}::${t.name}`,
            riskLevel: null,
            accessType: null,
            isFlagged: false,
          })),
        });
      }
    }

    // A2A Agents
    if (a2aAgents) {
      for (const agent of a2aAgents) {
        const serverKey = `a2a:${agent.id}`;
        servers.push({
          serverKey,
          serverName: `A2A: ${agent.name}`,
          tools: (agent.skills ?? []).map((s) => ({
            name: s.name,
            description: null,
            qualifiedName: `a2a::${agent.id}::${s.name}`,
            riskLevel: null,
            accessType: null,
            isFlagged: false,
          })),
        });
      }
    }

    return servers;
  }, [toolFlagData, mcpServers, a2aAgents]);

  // Apply filters to tools
  const filteredServerData = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return serverData.map((server) => {
      const filteredTools = server.tools.filter((tool) => {
        // Search filter
        if (query) {
          const matchesSearch =
            tool.name.toLowerCase().includes(query) ||
            (tool.description?.toLowerCase().includes(query) ?? false) ||
            server.serverName.toLowerCase().includes(query);
          if (!matchesSearch) return false;
        }

        // Risk level filter
        if (riskLevelFilter.length > 0) {
          if (!tool.riskLevel || !riskLevelFilter.includes(tool.riskLevel)) {
            return false;
          }
        }

        // Access type filter
        if (accessTypeFilter.length > 0) {
          if (!tool.accessType || !accessTypeFilter.includes(tool.accessType)) {
            return false;
          }
        }

        return true;
      });

      return {
        ...server,
        filteredTools,
        isDisabled: filteredTools.length === 0,
      };
    });
  }, [serverData, searchQuery, riskLevelFilter, accessTypeFilter]);

  // Total counts
  const totalToolCount = serverData.reduce((sum, s) => sum + s.tools.length, 0);
  const selectedCount = allServersSelected
    ? totalToolCount
    : localSelectedServers.size > 0
      ? serverData.reduce(
          (sum, s) => (localSelectedServers.has(s.serverKey) ? sum + s.tools.length : sum),
          0,
        ) + localSelectedTools.size
      : localSelectedTools.size;

  // Compute initial state from selectedTools prop
  const computeInitialState = useCallback(() => {
    const selectedToolsSet = new Set<string>();
    const selectedServersSet = new Set<string>();
    let isAllServers = false;

    for (const pattern of selectedTools) {
      if (pattern.server === '*' && pattern.tool === '*') {
        isAllServers = true;
        break;
      }

      if (pattern.tool === '*') {
        const matchingServer = serverData.find((s) => s.serverKey === pattern.server);
        selectedServersSet.add(matchingServer?.serverKey ?? pattern.server);
      } else {
        let found = false;
        for (const server of serverData) {
          if (server.serverKey === pattern.server) {
            const tool = server.tools.find((t) => t.name === pattern.tool);
            if (tool) {
              selectedToolsSet.add(tool.qualifiedName);
              found = true;
              break;
            }
          }
        }

        if (!found) {
          if (pattern.server.startsWith('a2a:')) {
            const agentId = pattern.server.slice(4);
            selectedToolsSet.add(`a2a::${agentId}::${pattern.tool}`);
          } else {
            selectedToolsSet.add(`${pattern.server}::${pattern.tool}`);
          }
        }
      }
    }

    return { selectedToolsSet, selectedServersSet, isAllServers };
  }, [selectedTools, serverData]);

  // Initialize local state when modal opens (transitions from closed to open)
  // Using useEffect instead of onOpenChange callback because Radix Dialog
  // only calls onOpenChange for user-initiated changes, not when the controlled
  // `open` prop changes externally
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (open && !wasOpen) {
      const { selectedToolsSet, selectedServersSet, isAllServers } = computeInitialState();

      // Batch state updates in startTransition to avoid cascading render warnings
      startTransition(() => {
        setAllServersSelected(isAllServers);
        setLocalSelectedServers(selectedServersSet);
        setLocalSelectedTools(selectedToolsSet);
        setExpandedServers(new Set());
        setSearchQuery('');
        setRiskLevelFilter([]);
        setAccessTypeFilter([]);
        setParamConditionError(null);
      });
    }
  }, [open, computeInitialState]);

  // Toggle "All Servers" selection
  const handleToggleAllServers = useCallback(() => {
    setAllServersSelected((prev) => {
      const next = !prev;
      if (next) {
        // Clear individual selections when selecting all
        setLocalSelectedServers(new Set());
        setLocalSelectedTools(new Set());
      }
      return next;
    });
  }, []);

  // Toggle server-level wildcard
  const handleToggleServer = useCallback(
    (serverKey: string) => {
      // If all servers is selected, deselect it and select all OTHER servers
      if (allServersSelected) {
        setAllServersSelected(false);
        const allServerKeys = new Set(serverData.map((s) => s.serverKey));
        allServerKeys.delete(serverKey);
        setLocalSelectedServers(allServerKeys);
        return;
      }

      setLocalSelectedServers((prev) => {
        const next = new Set(prev);
        if (next.has(serverKey)) {
          next.delete(serverKey);
        } else {
          next.add(serverKey);
          // Clear any individual tool selections from this server
          setLocalSelectedTools((prevTools) => {
            const server = serverData.find((s) => s.serverKey === serverKey);
            if (!server) return prevTools;
            const nextTools = new Set(prevTools);
            for (const tool of server.tools) {
              nextTools.delete(tool.qualifiedName);
            }
            return nextTools;
          });
        }
        return next;
      });
    },
    [allServersSelected, serverData],
  );

  // Toggle individual tool selection
  const handleToggleTool = useCallback(
    (qualifiedName: string) => {
      // Don't allow individual tool selection if all servers or this server is selected
      const serverKey = qualifiedName.startsWith('a2a::')
        ? `a2a:${qualifiedName.split('::')[1]}`
        : qualifiedName.split('::')[0];

      if (allServersSelected || localSelectedServers.has(serverKey)) {
        return;
      }

      setLocalSelectedTools((prev) => {
        const next = new Set(prev);
        if (next.has(qualifiedName)) {
          next.delete(qualifiedName);
        } else {
          next.add(qualifiedName);
        }
        return next;
      });
    },
    [allServersSelected, localSelectedServers],
  );

  // Toggle server expansion
  const handleToggleExpand = useCallback((serverKey: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverKey)) {
        next.delete(serverKey);
      } else {
        next.add(serverKey);
      }
      return next;
    });
  }, []);

  // Check if the current selection represents a single specific tool (no wildcards)
  const isNewSelectionSingleSpecificTool = useMemo(() => {
    // Must have no server-level wildcards, no "all servers" selected
    if (allServersSelected || localSelectedServers.size > 0) return false;
    // Must have exactly one tool selected
    return localSelectedTools.size === 1;
  }, [allServersSelected, localSelectedServers.size, localSelectedTools.size]);

  // Check if the original selection was a single specific tool
  const wasOriginalSingleSpecificTool = useMemo(() => {
    if (selectedTools.length !== 1) return false;
    const pattern = selectedTools[0];
    return Boolean(
      pattern.server && pattern.tool && pattern.server !== '*' && pattern.tool !== '*',
    );
  }, [selectedTools]);

  // Get the original tool's qualified name (for comparison)
  const originalToolQualifiedName = useMemo(() => {
    if (!wasOriginalSingleSpecificTool) return null;
    const pattern = selectedTools[0];
    // Build qualified name matching the format used in localSelectedTools
    if (pattern.server.startsWith('a2a:')) {
      const agentId = pattern.server.slice(4);
      return `a2a::${agentId}::${pattern.tool}`;
    }
    return `${pattern.server}::${pattern.tool}`;
  }, [wasOriginalSingleSpecificTool, selectedTools]);

  // Check if the tool selection has changed (relevant when both old and new are single specific tools)
  const hasToolSelectionChanged = useMemo(() => {
    if (!wasOriginalSingleSpecificTool || !isNewSelectionSingleSpecificTool) return true;
    if (!originalToolQualifiedName) return true;
    // Both are single specific tools - check if it's the same tool
    const newToolQualifiedName = Array.from(localSelectedTools)[0];
    return originalToolQualifiedName !== newToolQualifiedName;
  }, [
    wasOriginalSingleSpecificTool,
    isNewSelectionSingleSpecificTool,
    originalToolQualifiedName,
    localSelectedTools,
  ]);

  // Handle Done - convert selected tools back to patterns
  const handleDone = useCallback(() => {
    // Validate: if there are param conditions and the tool selection has changed
    // This covers both:
    // 1. Changing from single tool to wildcards/multiple tools
    // 2. Changing from one specific tool to a different specific tool
    if (hasParamConditions && wasOriginalSingleSpecificTool && hasToolSelectionChanged) {
      setParamConditionError(
        'Cannot change tool selection while parameter conditions exist. Remove all params.* conditions from the expression first, then change the tool selection.',
      );
      return;
    }

    // Clear any previous error
    setParamConditionError(null);

    // If all servers selected
    if (allServersSelected) {
      onChange([{ server: '*', tool: '*' }]);
      onOpenChange(false);
      return;
    }

    // No selections = empty array (form validation will handle if this is allowed)
    if (localSelectedServers.size === 0 && localSelectedTools.size === 0) {
      onChange([]);
      onOpenChange(false);
      return;
    }

    const patterns: ToolPatternEntry[] = [];

    // Add server-level wildcards
    for (const serverKey of localSelectedServers) {
      patterns.push({ server: serverKey, tool: '*' });
    }

    // Add individual tools
    for (const qualifiedName of localSelectedTools) {
      // Handle A2A patterns: a2a::agentId::skillId -> server: "a2a:agentId", tool: skillId
      if (qualifiedName.startsWith('a2a::')) {
        const parts = qualifiedName.split('::');
        if (parts.length === 3) {
          patterns.push({ server: `a2a:${parts[1]}`, tool: parts[2] });
        }
      } else {
        // Handle MCP patterns: server::tool
        const [server, tool] = qualifiedName.split('::');
        if (server && tool) {
          patterns.push({ server, tool });
        }
      }
    }

    onChange(patterns.length > 0 ? patterns : [{ server: '*', tool: '*' }]);
    onOpenChange(false);
  }, [
    hasParamConditions,
    wasOriginalSingleSpecificTool,
    hasToolSelectionChanged,
    allServersSelected,
    localSelectedServers,
    localSelectedTools,
    onChange,
    onOpenChange,
  ]);

  // Handle Cancel
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select Tools</DialogTitle>
          <DialogDescription>Choose which tools this policy applies to</DialogDescription>
        </DialogHeader>

        {/* Filter bar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          riskLevelFilter={riskLevelFilter}
          onRiskLevelChange={setRiskLevelFilter}
          accessTypeFilter={accessTypeFilter}
          onAccessTypeChange={setAccessTypeFilter}
          selectedCount={selectedCount}
          totalCount={totalToolCount}
        />

        {/* Server list */}
        <ScrollArea className="h-[400px] border rounded-lg">
          <div className="p-2 space-y-2">
            {/* All Servers option - always shown */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-3 rounded-lg border cursor-pointer transition-colors',
                'hover:bg-muted/50',
                allServersSelected && 'bg-primary/5 border-primary/30',
              )}
              onClick={handleToggleAllServers}
            >
              <div className="flex items-center justify-center p-1.5 -m-1.5">
                <Checkbox
                  checked={allServersSelected}
                  onCheckedChange={handleToggleAllServers}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="flex-1">
                <span className="font-medium text-sm">All Servers</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All tools from all servers, including any servers or tools added in the future
                </p>
              </div>
            </div>

            {/* Separator */}
            {serverData.length > 0 && (
              <div className="text-xs text-muted-foreground px-3 py-1">
                Or select specific servers:
              </div>
            )}

            {/* Server nodes */}
            {filteredServerData.map((server) => (
              <ServerNode
                key={server.serverKey}
                serverName={server.serverName}
                serverKey={server.serverKey}
                tools={server.tools}
                filteredTools={server.filteredTools}
                isExpanded={expandedServers.has(server.serverKey)}
                onToggleExpand={() => handleToggleExpand(server.serverKey)}
                selectedTools={localSelectedTools}
                selectedServers={
                  allServersSelected
                    ? new Set(serverData.map((s) => s.serverKey))
                    : localSelectedServers
                }
                onToggleTool={handleToggleTool}
                onToggleServer={handleToggleServer}
                isDisabled={allServersSelected}
              />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {paramConditionError && (
            <div className="w-full rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {paramConditionError}
            </div>
          )}
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={handleDone}>
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
