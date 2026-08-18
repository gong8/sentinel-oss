/**
 * ToolRow Component
 * Individual tool checkbox row with details
 */

import type { JSX } from 'react';

import type { ToolAccessType, ToolRiskLevel } from '../../../hooks/useMcpServers';
import { cn } from '../../../lib/utils';
import { Checkbox } from '../../ui/checkbox';
import { AccessTypeBadge, RiskLevelBadge } from './FilterBar';

export interface ToolRowProps {
  name: string;
  description?: string | null;
  riskLevel: ToolRiskLevel | null;
  accessType: ToolAccessType | null;
  isFlagged: boolean;
  isSelected: boolean;
  onToggle: () => void;
}

export function ToolRow({
  name,
  description,
  riskLevel,
  accessType,
  isFlagged,
  isSelected,
  onToggle,
}: ToolRowProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-3 py-2 px-3 rounded-md transition-colors cursor-pointer',
        'hover:bg-muted/50',
        isSelected && 'bg-primary/5',
      )}
      onClick={onToggle}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        className="mt-0.5"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{name}</span>
          {isFlagged && <span className="text-amber-500 text-[10px] font-medium">[Flagged]</span>}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <RiskLevelBadge level={riskLevel} />
          <AccessTypeBadge type={accessType} />
        </div>
      </div>
    </div>
  );
}
