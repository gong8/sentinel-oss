/**
 * ToolSelectorDisplay Component
 * Compact list display with pencil icon to open modal
 * Clicking on a server chip expands to show all tools
 */

import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { useState, type JSX } from 'react';

import type { McpServerData } from '../../../hooks/useMcpServers';
import type { ToolPatternEntry } from '../../../lib/policyUtils';
import { getServerKeyFromUrl } from '../../../lib/toolPattern';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';

export interface ToolSelectorDisplayProps {
  patterns: ToolPatternEntry[];
  mcpServers?: McpServerData[];
  a2aAgents?: Array<{ id: string; name: string }>;
  onOpenModal: () => void;
  readOnly?: boolean;
}

export function ToolSelectorDisplay({
  patterns,
  mcpServers,
  a2aAgents,
  onOpenModal,
  readOnly = false,
}: ToolSelectorDisplayProps): JSX.Element {
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Group patterns by server
  const grouped = groupPatternsByServer(patterns, mcpServers, a2aAgents);
  const isAllTools =
    patterns.length === 1 && patterns[0].server === '*' && patterns[0].tool === '*';
  const isNoTools = patterns.length === 0;

  const toggleServer = (serverKey: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverKey)) {
        next.delete(serverKey);
      } else {
        next.add(serverKey);
      }
      return next;
    });
  };

  return (
    <div className="relative border rounded-lg p-3 min-h-[60px]">
      {/* Pencil icon button */}
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-7 w-7 p-0 hover:bg-muted"
          onClick={onOpenModal}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Content */}
      {isNoTools ? (
        <div
          className={cn('text-sm text-muted-foreground', !readOnly && 'cursor-pointer')}
          onClick={readOnly ? undefined : onOpenModal}
        >
          No tools selected (click to select tools)
        </div>
      ) : isAllTools ? (
        <div className="flex flex-wrap gap-2 pr-8">
          <div className="inline-flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5 text-sm">
            <span className="font-medium">All Servers</span>
            <span className="text-xs text-primary font-medium">(including future)</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pr-8">
          {grouped.map(({ serverName, serverKey, toolCount, tools }) => (
            <ServerChip
              key={serverKey}
              serverName={serverName}
              serverKey={serverKey}
              toolCount={toolCount}
              tools={tools}
              expanded={expandedServers.has(serverKey)}
              onToggle={() => toggleServer(serverKey)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ServerChipProps {
  serverName: string;
  serverKey: string;
  toolCount: number;
  tools: string[];
  expanded: boolean;
  onToggle: () => void;
}

function ServerChip({
  serverName,
  toolCount,
  tools,
  expanded,
  onToggle,
}: ServerChipProps): JSX.Element {
  const isAllTools = tools.includes('*');
  const displayTools = tools.slice(0, 2);
  const hasMore = tools.length > 2;
  const canExpand = !isAllTools && tools.length > 0;

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'inline-flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5 text-sm',
          canExpand && 'cursor-pointer hover:bg-muted/70 transition-colors',
        )}
        onClick={canExpand ? onToggle : undefined}
      >
        {canExpand &&
          (expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ))}
        <span className="font-medium">{serverName}</span>
        {isAllTools ? (
          <span className="text-xs text-primary font-medium">All tools (including future)</span>
        ) : (
          <>
            <span className="text-muted-foreground">
              ({toolCount} {toolCount === 1 ? 'tool' : 'tools'})
            </span>
            {!expanded && (
              <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                {displayTools.join(', ')}
                {hasMore ? '...' : ''}
              </span>
            )}
          </>
        )}
      </div>
      {expanded && !isAllTools && (
        <div className="ml-6 mt-1 flex flex-col gap-0.5">
          {tools.map((tool) => (
            <span key={tool} className="text-xs text-muted-foreground py-0.5">
              {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface GroupedPattern {
  serverName: string;
  serverKey: string;
  toolCount: number;
  tools: string[];
}

function groupPatternsByServer(
  patterns: ToolPatternEntry[],
  mcpServers?: McpServerData[],
  a2aAgents?: Array<{ id: string; name: string }>,
): GroupedPattern[] {
  const groups = new Map<string, { tools: string[]; serverName: string }>();

  for (const pattern of patterns) {
    const serverKey = pattern.server;

    if (!groups.has(serverKey)) {
      let serverName = serverKey;

      // Look up friendly name
      if (serverKey === '*') {
        serverName = 'All Servers';
      } else if (serverKey.startsWith('a2a:')) {
        const agentId = serverKey.slice(4);
        const agent = a2aAgents?.find((a) => a.id === agentId);
        serverName = agent ? `A2A: ${agent.name}` : serverKey;
      } else if (mcpServers) {
        const server = mcpServers.find((s) => getServerKeyFromUrl(s.url) === serverKey);
        if (server) {
          serverName = server.name;
        }
      }

      groups.set(serverKey, { tools: [], serverName });
    }

    groups.get(serverKey)!.tools.push(pattern.tool);
  }

  return Array.from(groups.entries()).map(([serverKey, { tools, serverName }]) => ({
    serverKey,
    serverName,
    toolCount: tools.includes('*') ? 0 : tools.length,
    tools: tools.includes('*') ? ['*'] : tools,
  }));
}
