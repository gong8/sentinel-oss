import { useState, type JSX } from 'react';

import type {
  McpServerData,
  ToolAccessType,
  ToolRiskLevel,
  ToolWithFlagStatus,
} from '../../hooks/useMcpServers';
import type { ToolPatternEntry } from '../../lib/policyUtils';
import { Label } from '../ui/label';
import { ToolSelectorModal } from './ToolSelectorModal';
import { ToolSelectorDisplay } from './ToolSelectorModal/ToolSelectorDisplay';

export interface ToolPatternSelectorProps {
  patterns: ToolPatternEntry[];
  onChange: (patterns: ToolPatternEntry[]) => void;
  mcpServers?: McpServerData[];
  a2aAgents?: Array<{ id: string; name: string; skills?: { id: string; name: string }[] }>;
  getToolsForServer: (serverKey: string) => { id: string; name: string }[];
  isToolFlagged?: (serverKey: string, toolName: string) => boolean;
  getToolFlagCountsForServer?: (serverKey: string) => {
    flagged: number;
    unflagged: number;
    flaggedTools: ToolWithFlagStatus[];
    unflaggedTools: ToolWithFlagStatus[];
  };
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
  error?: string;
  label?: string;
  description?: string;
  showBulkActions?: boolean;
  readOnly?: boolean;
  /** Whether the policy has tool parameter conditions (params.*) that would be invalidated by changing tool selection */
  hasParamConditions?: boolean;
}

/**
 * Multi-tool pattern selector for policy forms
 * Uses a modal interface with tree view for selecting tools
 */
export function ToolPatternSelector({
  patterns,
  onChange,
  mcpServers,
  a2aAgents,
  toolFlagData,
  error,
  label = 'Tool access',
  description = 'Select which tools this policy applies to.',
  readOnly = false,
  hasParamConditions = false,
}: ToolPatternSelectorProps): JSX.Element {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>

      <ToolSelectorDisplay
        patterns={patterns}
        onOpenModal={() => setModalOpen(true)}
        mcpServers={mcpServers}
        a2aAgents={a2aAgents}
        readOnly={readOnly}
      />

      <ToolSelectorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        selectedTools={patterns}
        onChange={onChange}
        mcpServers={mcpServers}
        a2aAgents={a2aAgents}
        toolFlagData={toolFlagData}
        hasParamConditions={hasParamConditions}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
