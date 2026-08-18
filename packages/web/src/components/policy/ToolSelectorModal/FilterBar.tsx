/**
 * FilterBar Component
 * Search input and filter dropdowns for tool selector modal
 */

import { Search, X } from 'lucide-react';
import { useMemo, type JSX } from 'react';

import type { ToolAccessType, ToolRiskLevel } from '../../../hooks/useMcpServers';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

export interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  riskLevelFilter: ToolRiskLevel[];
  onRiskLevelChange: (levels: ToolRiskLevel[]) => void;
  accessTypeFilter: ToolAccessType[];
  onAccessTypeChange: (types: ToolAccessType[]) => void;
  selectedCount: number;
  totalCount: number;
}

const RISK_LEVELS: ToolRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ACCESS_TYPES: ToolAccessType[] = ['READ', 'WRITE', 'READ_WRITE'];

export function FilterBar({
  searchQuery,
  onSearchChange,
  riskLevelFilter,
  onRiskLevelChange,
  accessTypeFilter,
  onAccessTypeChange,
  selectedCount,
  totalCount,
}: FilterBarProps): JSX.Element {
  const hasActiveFilters = riskLevelFilter.length > 0 || accessTypeFilter.length > 0;

  const riskLevelLabel = useMemo(() => {
    if (riskLevelFilter.length === 0) return 'Risk Level';
    if (riskLevelFilter.length === 1) return riskLevelFilter[0];
    return `${riskLevelFilter.length} levels`;
  }, [riskLevelFilter]);

  const accessTypeLabel = useMemo(() => {
    if (accessTypeFilter.length === 0) return 'Access Type';
    if (accessTypeFilter.length === 1) {
      return accessTypeFilter[0] === 'READ_WRITE' ? 'Read/Write' : accessTypeFilter[0];
    }
    return `${accessTypeFilter.length} types`;
  }, [accessTypeFilter]);

  function toggleRiskLevel(level: ToolRiskLevel): void {
    if (riskLevelFilter.includes(level)) {
      onRiskLevelChange(riskLevelFilter.filter((l) => l !== level));
    } else {
      onRiskLevelChange([...riskLevelFilter, level]);
    }
  }

  function toggleAccessType(type: ToolAccessType): void {
    if (accessTypeFilter.includes(type)) {
      onAccessTypeChange(accessTypeFilter.filter((t) => t !== type));
    } else {
      onAccessTypeChange([...accessTypeFilter, type]);
    }
  }

  function clearFilters(): void {
    onRiskLevelChange([]);
    onAccessTypeChange([]);
  }

  return (
    <div className="space-y-3">
      {/* Search and filters row */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => onSearchChange('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Risk Level filter */}
        <Select
          value={riskLevelFilter.length > 0 ? 'custom' : 'all'}
          onValueChange={(val) => {
            if (val === 'all') {
              onRiskLevelChange([]);
            }
          }}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue>{riskLevelLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <div className="border-t my-1" />
            {RISK_LEVELS.map((level) => (
              <div
                key={level}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50 rounded-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleRiskLevel(level);
                }}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-sm border ${
                    riskLevelFilter.includes(level) ? 'bg-primary border-primary' : 'border-border'
                  } flex items-center justify-center`}
                >
                  {riskLevelFilter.includes(level) && (
                    <span className="text-primary-foreground text-[10px]">✓</span>
                  )}
                </div>
                <RiskLevelBadge level={level} />
              </div>
            ))}
          </SelectContent>
        </Select>

        {/* Access Type filter */}
        <Select
          value={accessTypeFilter.length > 0 ? 'custom' : 'all'}
          onValueChange={(val) => {
            if (val === 'all') {
              onAccessTypeChange([]);
            }
          }}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue>{accessTypeLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Access Types</SelectItem>
            <div className="border-t my-1" />
            {ACCESS_TYPES.map((type) => (
              <div
                key={type}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50 rounded-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleAccessType(type);
                }}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-sm border ${
                    accessTypeFilter.includes(type) ? 'bg-primary border-primary' : 'border-border'
                  } flex items-center justify-center`}
                >
                  {accessTypeFilter.includes(type) && (
                    <span className="text-primary-foreground text-[10px]">✓</span>
                  )}
                </div>
                <AccessTypeBadge type={type} />
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {selectedCount} of {totalCount} tools selected
        </div>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

export function RiskLevelBadge({ level }: { level: ToolRiskLevel | null }): JSX.Element | null {
  if (!level) return null;

  const variants: Record<ToolRiskLevel, { className: string; label: string }> = {
    LOW: {
      className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
      label: 'LOW',
    },
    MEDIUM: {
      className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
      label: 'MEDIUM',
    },
    HIGH: {
      className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
      label: 'HIGH',
    },
    CRITICAL: {
      className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
      label: 'CRITICAL',
    },
  };

  const variant = variants[level];
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${variant.className}`}>
      {variant.label}
    </Badge>
  );
}

export function AccessTypeBadge({ type }: { type: ToolAccessType | null }): JSX.Element | null {
  if (!type) return null;

  const variants: Record<ToolAccessType, { className: string; label: string }> = {
    READ: {
      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
      label: 'READ',
    },
    WRITE: {
      className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
      label: 'WRITE',
    },
    READ_WRITE: {
      className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
      label: 'R/W',
    },
  };

  const variant = variants[type];
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${variant.className}`}>
      {variant.label}
    </Badge>
  );
}
