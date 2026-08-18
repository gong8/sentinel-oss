/**
 * FlowPipeline Component
 * Visualizes the journey of a tool call through the system with interruption points
 */

import type { PipelineStage, PipelineStageResult } from '@sentinel/shared';
import {
  CheckCircle2,
  Circle,
  FileSearch,
  Flag,
  PlayCircle,
  Shield,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface FlowPipelineProps {
  stages: PipelineStageResult[];
  interruptedAt?: PipelineStage;
  interruptionReason?: string;
  className?: string;
}

const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; icon: React.ElementType; shortLabel: string }
> = {
  REQUEST: { label: 'Request Received', icon: PlayCircle, shortLabel: 'Request' },
  SENTINEL_ENTRY: { label: 'Entered Sentinel', icon: Shield, shortLabel: 'Sentinel' },
  TRUST_CHECK: { label: 'Trust Check', icon: ShieldCheck, shortLabel: 'Trust' },
  POLICY_CHECK: { label: 'Policy Evaluation', icon: FileSearch, shortLabel: 'Policy' },
  FLAG_CHECK: { label: 'Flag Evaluation', icon: Flag, shortLabel: 'Flags' },
  EXECUTE: { label: 'Tool Executed', icon: CheckCircle2, shortLabel: 'Execute' },
  SENTINEL_EXIT: { label: 'Exited Sentinel', icon: Shield, shortLabel: 'Exit' },
  LOG: { label: 'Audit Logged', icon: FileSearch, shortLabel: 'Log' },
};

const STAGE_ORDER: PipelineStage[] = [
  'REQUEST',
  'SENTINEL_ENTRY',
  'TRUST_CHECK',
  'POLICY_CHECK',
  'FLAG_CHECK',
  'EXECUTE',
  'SENTINEL_EXIT',
  'LOG',
];

type StageStatus = 'passed' | 'failed' | 'pending' | 'not_reached';

function getStageStatus(
  stage: PipelineStage,
  stages: PipelineStageResult[],
  interruptedAt?: PipelineStage,
): StageStatus {
  const stageResult = stages.find((s) => s.stage === stage);

  if (!stageResult) {
    return 'not_reached';
  }

  if (stage === interruptedAt) {
    return 'failed';
  }

  return stageResult.passed ? 'passed' : 'failed';
}

function StageNode({
  stage,
  status,
  details,
  isLast,
}: {
  stage: PipelineStage;
  status: StageStatus;
  details?: string;
  isLast: boolean;
}) {
  const config = STAGE_CONFIG[stage];
  const Icon = config.icon;

  const statusStyles: Record<StageStatus, string> = {
    passed: 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400',
    failed: 'bg-destructive/10 border-destructive/30 text-destructive',
    pending: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400',
    not_reached: 'bg-muted/50 border-border/50 text-muted-foreground',
  };

  const connectorStyles: Record<StageStatus, string> = {
    passed: 'bg-green-500/50',
    failed: 'bg-destructive/50',
    pending: 'bg-yellow-500/50',
    not_reached: 'bg-border/50',
  };

  const iconStyles: Record<StageStatus, string> = {
    passed: 'text-green-600 dark:text-green-400',
    failed: 'text-destructive',
    pending: 'text-yellow-600 dark:text-yellow-400',
    not_reached: 'text-muted-foreground/50',
  };

  return (
    <div className="flex items-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex flex-col items-center gap-1.5 px-2 py-2 rounded-lg border transition-colors',
                statusStyles[status],
              )}
            >
              <div className={cn('w-6 h-6', iconStyles[status])}>
                {status === 'passed' && <CheckCircle2 className="w-6 h-6" />}
                {status === 'failed' && <XCircle className="w-6 h-6" />}
                {status === 'pending' && <Circle className="w-6 h-6" />}
                {status === 'not_reached' && <Icon className="w-6 h-6 opacity-50" />}
              </div>
              <span className="text-[10px] font-medium whitespace-nowrap">{config.shortLabel}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">{config.label}</p>
              {details && <p className="text-xs text-muted-foreground">{details}</p>}
              {status === 'not_reached' && (
                <p className="text-xs text-muted-foreground">Not reached in this flow</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {!isLast && <div className={cn('h-0.5 w-6 mx-1', connectorStyles[status])} />}
    </div>
  );
}

export function FlowPipeline({
  stages,
  interruptedAt,
  interruptionReason,
  className,
}: FlowPipelineProps) {
  // Get the set of stages that were actually executed
  const executedStages = new Set(stages.map((s) => s.stage));

  // Determine which stages to show based on what was executed
  const relevantStages = STAGE_ORDER.filter((stage) => {
    // Always show the stage if it was executed
    if (executedStages.has(stage)) return true;

    // Show the next stage after the last executed one (as "not reached")
    const lastExecutedIndex = STAGE_ORDER.findIndex((s) => s === stages[stages.length - 1]?.stage);
    const currentIndex = STAGE_ORDER.indexOf(stage);
    return currentIndex <= lastExecutedIndex + 1;
  });

  // If no stages, show a minimal pipeline
  if (relevantStages.length === 0) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <p className="text-xs text-muted-foreground">No pipeline data available</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center flex-wrap gap-y-2">
        {relevantStages.map((stage, index) => {
          const stageResult = stages.find((s) => s.stage === stage);
          const status = getStageStatus(stage, stages, interruptedAt);

          return (
            <StageNode
              key={stage}
              stage={stage}
              status={status}
              details={stageResult?.details}
              isLast={index === relevantStages.length - 1}
            />
          );
        })}
      </div>

      {interruptedAt && interruptionReason && (
        <div className="flex items-center gap-2 text-xs">
          <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <span className="text-destructive font-medium">
            Interrupted at {STAGE_CONFIG[interruptedAt].label}:
          </span>
          <span className="text-muted-foreground">{interruptionReason}</span>
        </div>
      )}
    </div>
  );
}
