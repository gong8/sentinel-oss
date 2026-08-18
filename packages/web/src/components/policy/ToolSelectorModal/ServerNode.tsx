/**
 * ServerNode Component
 * Collapsible server section with tools
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { JSX } from 'react';

import type { ToolAccessType, ToolRiskLevel } from '../../../hooks/useMcpServers';
import { cn } from '../../../lib/utils';
import { Checkbox } from '../../ui/checkbox';
import { ToolRow } from './ToolRow';

export interface ServerTool {
  name: string;
  description?: string | null;
  qualifiedName: string;
  riskLevel: ToolRiskLevel | null;
  accessType: ToolAccessType | null;
  isFlagged: boolean;
}

export interface ServerNodeProps {
  serverName: string;
  serverKey: string;
  tools: ServerTool[];
  filteredTools: ServerTool[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedTools: Set<string>;
  selectedServers: Set<string>;
  onToggleTool: (qualifiedName: string) => void;
  onToggleServer: (serverKey: string) => void;
  isDisabled: boolean;
}

export function ServerNode({
  serverName,
  serverKey,
  tools,
  filteredTools,
  isExpanded,
  onToggleExpand,
  selectedTools,
  selectedServers,
  onToggleTool,
  onToggleServer,
  isDisabled,
}: ServerNodeProps): JSX.Element {
  // Check if this server is selected (all tools including future)
  const serverSelected = selectedServers.has(serverKey);

  // Calculate if some individual tools are selected (for indeterminate state)
  const toolQualifiedNames = tools.map((t) => t.qualifiedName);
  const selectedIndividualTools = toolQualifiedNames.filter((qn) => selectedTools.has(qn));
  const hasIndividualSelections = !serverSelected && selectedIndividualTools.length > 0;

  function handleServerCheckbox(e: React.MouseEvent): void {
    e.stopPropagation();
    onToggleServer(serverKey);
  }

  return (
    <div className={cn('border rounded-lg', isDisabled && 'opacity-50')}>
      {/* Server header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
          'hover:bg-muted/50',
          isExpanded && 'border-b',
        )}
        onClick={onToggleExpand}
      >
        {/* Server checkbox on the left - larger click target */}
        <div
          className="flex items-center justify-center p-1.5 -m-1.5"
          onClick={handleServerCheckbox}
        >
          <Checkbox
            checked={serverSelected}
            onCheckedChange={() => onToggleServer(serverKey)}
            data-state={
              hasIndividualSelections ? 'indeterminate' : serverSelected ? 'checked' : 'unchecked'
            }
            className={cn(hasIndividualSelections && 'data-[state=indeterminate]:bg-primary/50')}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Expand/collapse icon */}
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </span>

        {/* Server name and tool count */}
        <div className="flex-1 flex items-center gap-2">
          <span className="font-medium text-sm">{serverName}</span>
          <span className="text-xs text-muted-foreground">
            ({tools.length} {tools.length === 1 ? 'tool' : 'tools'})
          </span>
          {serverSelected && (
            <span className="text-xs text-primary font-medium">All tools (including future)</span>
          )}
        </div>
      </div>

      {/* Tools list */}
      {isExpanded && (
        <div className="px-2 py-1">
          {serverSelected ? (
            <div className="text-sm text-muted-foreground italic py-2 px-3">
              All tools from this server are included (including any added in the future)
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-2 px-3">
              No tools match current filters
            </div>
          ) : (
            filteredTools.map((tool) => (
              <ToolRow
                key={tool.qualifiedName}
                name={tool.name}
                description={tool.description}
                riskLevel={tool.riskLevel}
                accessType={tool.accessType}
                isFlagged={tool.isFlagged}
                isSelected={selectedTools.has(tool.qualifiedName)}
                onToggle={() => onToggleTool(tool.qualifiedName)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
