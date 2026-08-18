/**
 * ActionTimeline Component
 * Visualizes multi-stage action flow (similar to FlowPipeline)
 */

import { Check, Circle, Clock, Loader2, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface ActionTimelineProps {
  actionStage?: string | null;
  correlationId?: string | null;
  timestamp: Date | string;
}

type StageStatus = 'completed' | 'current' | 'pending' | 'failed';

interface Stage {
  id: string;
  label: string;
  status: StageStatus;
}

export function ActionTimeline({ actionStage, timestamp }: ActionTimelineProps) {
  // If no action stage info, don't render
  if (!actionStage) {
    return null;
  }

  const stages = getStagesForAction(actionStage);
  const formattedTime =
    timestamp instanceof Date
      ? timestamp.toLocaleTimeString()
      : new Date(timestamp).toLocaleTimeString();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Action Flow
          <span className="ml-auto text-xs font-normal text-muted-foreground">{formattedTime}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center">
              <StageIndicator stage={stage} />
              {index < stages.length - 1 && <StageConnector status={stage.status} />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StageIndicator({ stage }: { stage: Stage }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
          stage.status === 'completed' && 'border-green-500 bg-green-50 dark:bg-green-950/30',
          stage.status === 'current' && 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
          stage.status === 'pending' && 'border-muted-foreground/30 bg-muted',
          stage.status === 'failed' && 'border-red-500 bg-red-50 dark:bg-red-950/30',
        )}
      >
        {stage.status === 'completed' && <Check className="h-4 w-4 text-green-600" />}
        {stage.status === 'current' && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        {stage.status === 'pending' && <Circle className="h-4 w-4 text-muted-foreground/50" />}
        {stage.status === 'failed' && <X className="h-4 w-4 text-red-600" />}
      </div>
      <span
        className={cn(
          'text-xs',
          stage.status === 'completed' && 'text-green-600',
          stage.status === 'current' && 'font-medium text-blue-600',
          stage.status === 'pending' && 'text-muted-foreground',
          stage.status === 'failed' && 'text-red-600',
        )}
      >
        {stage.label}
      </span>
    </div>
  );
}

function StageConnector({ status }: { status: StageStatus }) {
  return (
    <div
      className={cn(
        'mx-2 h-0.5 w-8 sm:w-12 md:w-16',
        status === 'completed' ? 'bg-green-500' : 'bg-muted-foreground/20',
      )}
    />
  );
}

function getStagesForAction(actionStage: string): Stage[] {
  // Define standard action stages
  const allStages = [
    { id: 'initiated', label: 'Initiated' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'executed', label: 'Executed' },
    { id: 'completed', label: 'Completed' },
  ];

  // Map current stage to index
  const stageOrder: Record<string, number> = {
    initiated: 0,
    confirmed: 1,
    executed: 2,
    completed: 3,
    failed: -1, // Special case
  };

  const currentStageIndex = stageOrder[actionStage.toLowerCase()] ?? -1;
  const isFailed = actionStage.toLowerCase() === 'failed';

  return allStages.map((stage, index) => {
    let status: StageStatus;

    if (isFailed) {
      // If failed, show all stages up to failure as completed, current as failed
      status = index < 2 ? 'completed' : index === 2 ? 'failed' : 'pending';
    } else if (index < currentStageIndex) {
      status = 'completed';
    } else if (index === currentStageIndex) {
      status = actionStage.toLowerCase() === 'completed' ? 'completed' : 'current';
    } else {
      status = 'pending';
    }

    return { ...stage, status };
  });
}
