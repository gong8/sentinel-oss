/**
 * Tool Classification Badges
 * Displays risk level and access type badges for MCP tools
 */

import { AlertTriangle, BookOpen, Edit2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ToolAccessType = 'READ' | 'WRITE' | 'READ_WRITE';
export type ClassificationSource = 'LLM_AUTO' | 'USER_MANUAL';

export interface ToolClassification {
  riskLevel: ToolRiskLevel | null;
  accessType: ToolAccessType | null;
  useCases: string | null;
  source: ClassificationSource;
  llmConfidence: number | null;
  overriddenAt?: string | null;
  overriddenBy?: string | null;
  originalRiskLevel?: ToolRiskLevel | null;
  originalAccessType?: ToolAccessType | null;
  originalUseCases?: string | null;
}

interface RiskBadgeProps {
  riskLevel: ToolRiskLevel;
  showTooltip?: boolean;
}

const riskLevelConfig: Record<
  ToolRiskLevel,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'default'; description: string }
> = {
  LOW: {
    label: 'Low Risk',
    variant: 'success',
    description: 'Read-only operations, no sensitive data',
  },
  MEDIUM: {
    label: 'Medium Risk',
    variant: 'warning',
    description: 'May access sensitive data or make limited modifications',
  },
  HIGH: {
    label: 'High Risk',
    variant: 'destructive',
    description: 'Modifies important data or has broad access',
  },
  CRITICAL: {
    label: 'Critical Risk',
    variant: 'destructive',
    description: 'Deletes data, executes code, or accesses secrets',
  },
};

export function RiskBadge({ riskLevel, showTooltip = true }: RiskBadgeProps): React.ReactElement {
  const config = riskLevelConfig[riskLevel];

  const icon =
    riskLevel === 'LOW' ? (
      <ShieldCheck className="mr-1 h-3 w-3" />
    ) : riskLevel === 'MEDIUM' ? (
      <Shield className="mr-1 h-3 w-3" />
    ) : riskLevel === 'HIGH' ? (
      <ShieldAlert className="mr-1 h-3 w-3" />
    ) : (
      <AlertTriangle className="mr-1 h-3 w-3" />
    );

  const badge = (
    <Badge variant={config.variant} className="text-[10px]">
      {icon}
      {config.label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface AccessTypeBadgeProps {
  accessType: ToolAccessType;
  showTooltip?: boolean;
}

const accessTypeConfig: Record<
  ToolAccessType,
  { label: string; variant: 'secondary' | 'outline'; description: string }
> = {
  READ: {
    label: 'Read',
    variant: 'secondary',
    description: 'Only retrieves/reads data',
  },
  WRITE: {
    label: 'Write',
    variant: 'outline',
    description: 'Only creates/updates/deletes data',
  },
  READ_WRITE: {
    label: 'Read/Write',
    variant: 'outline',
    description: 'Both reads and writes data',
  },
};

export function AccessTypeBadge({
  accessType,
  showTooltip = true,
}: AccessTypeBadgeProps): React.ReactElement {
  const config = accessTypeConfig[accessType];

  const icon =
    accessType === 'READ' ? (
      <BookOpen className="mr-1 h-3 w-3" />
    ) : (
      <Edit2 className="mr-1 h-3 w-3" />
    );

  const badge = (
    <Badge variant={config.variant} className="text-[10px]">
      {icon}
      {config.label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <p>{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ToolClassificationBadgesProps {
  classification: ToolClassification | null;
  showUseCases?: boolean;
  compact?: boolean;
}

export function ToolClassificationBadges({
  classification,
  showUseCases = false,
  compact = false,
}: ToolClassificationBadgesProps): React.ReactElement | null {
  if (!classification) {
    return <span className="text-xs text-muted-foreground italic">Not classified</span>;
  }

  const { riskLevel, accessType, useCases, source, llmConfidence: _llmConfidence } = classification;

  return (
    <div className={compact ? 'flex items-center gap-1' : 'flex flex-col gap-1.5'}>
      <div className="flex items-center gap-1.5">
        {riskLevel && <RiskBadge riskLevel={riskLevel} />}
        {accessType && <AccessTypeBadge accessType={accessType} />}
        {source === 'USER_MANUAL' && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className="text-[10px]">
                Manual
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Classification was manually overridden</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {showUseCases && useCases && (
        <p className="text-xs text-muted-foreground line-clamp-2">{useCases}</p>
      )}
    </div>
  );
}

interface ToolClassificationSummaryProps {
  stats: {
    total: number;
    classified: number;
    unclassified: number;
    byRiskLevel: {
      LOW: number;
      MEDIUM: number;
      HIGH: number;
      CRITICAL: number;
    };
  };
}

export function ToolClassificationSummary({
  stats,
}: ToolClassificationSummaryProps): React.ReactElement {
  const riskCounts = [
    { level: 'LOW' as const, count: stats.byRiskLevel.LOW, color: 'bg-green-500' },
    { level: 'MEDIUM' as const, count: stats.byRiskLevel.MEDIUM, color: 'bg-yellow-500' },
    { level: 'HIGH' as const, count: stats.byRiskLevel.HIGH, color: 'bg-orange-500' },
    { level: 'CRITICAL' as const, count: stats.byRiskLevel.CRITICAL, color: 'bg-red-500' },
  ].filter((r) => r.count > 0);

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        {stats.classified}/{stats.total} classified
      </span>
      {riskCounts.length > 0 && (
        <div className="flex items-center gap-2">
          {riskCounts.map((r) => (
            <Tooltip key={r.level}>
              <TooltipTrigger className="flex items-center gap-1">
                <div className={`h-2 w-2 rounded-full ${r.color}`} />
                <span className="text-xs">{r.count}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {r.count} {r.level.toLowerCase()} risk tool{r.count !== 1 ? 's' : ''}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
