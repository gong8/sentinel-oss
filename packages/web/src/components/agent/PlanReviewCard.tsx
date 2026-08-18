/**
 * Plan Review Card Component
 * Displays multi-step operation plans for user review and approval
 */

import * as React from 'react';

import { formatToolNameForChat } from '../../lib/mcpUtils';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Separator } from '../ui/separator';

// Plan status enum values
type PlanStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'EXECUTING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED'
  | 'ROLLED_BACK';

// Define step status type to match the API
type StepStatus =
  | 'PENDING'
  | 'WAITING'
  | 'CONFIRMING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'ROLLED_BACK';

// Simplified step interface for display (avoids recursive Prisma JSON type)
interface DisplayStep {
  id: string;
  stepNumber: number;
  toolName: string;
  toolInput: unknown;
  description: string;
  dependsOn: string[];
  status: StepStatus;
  result: unknown;
  error: string | null;
  canRollback: boolean;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Convert any step-like object to display step (avoiding Prisma's recursive JSON type)
 */
function toDisplayStep(step: {
  id: string;
  stepNumber: number;
  toolName: string;
  toolInput: unknown;
  description: string;
  dependsOn: string[];
  status: string;
  result: unknown;
  error: string | null;
  canRollback: boolean;
  startedAt?: string;
  completedAt?: string;
}): DisplayStep {
  return {
    id: step.id,
    stepNumber: step.stepNumber,
    toolName: step.toolName,
    toolInput: step.toolInput,
    description: step.description,
    dependsOn: step.dependsOn,
    status: step.status as StepStatus,
    result: step.result,
    error: step.error,
    canRollback: step.canRollback,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
  };
}

interface PlanReviewCardProps {
  planId: string;
  onClose?: () => void;
}

/**
 * Safely format a value as JSON string for display
 */
function formatJsonValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getStatusBadgeVariant(
  status: PlanStatus,
): 'default' | 'secondary' | 'destructive' | 'success' | 'warning' {
  switch (status) {
    case 'DRAFT':
      return 'secondary';
    case 'PENDING':
      return 'warning';
    case 'EXECUTING':
      return 'default';
    case 'PAUSED':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'destructive';
    case 'ABORTED':
      return 'secondary';
    case 'ROLLED_BACK':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function getStepStatusIcon(status: StepStatus): React.ReactNode {
  switch (status) {
    case 'PENDING':
      return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />;
    case 'WAITING':
      return (
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'CONFIRMING':
      return (
        <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );
    case 'EXECUTING':
      return (
        <svg className="h-4 w-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      );
    case 'COMPLETED':
      return (
        <svg className="h-4 w-4 text-green-600 dark:text-green-500" fill="none" viewBox="0 0 24 24">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      );
    case 'FAILED':
      return (
        <svg className="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      );
    case 'SKIPPED':
      return (
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 5l7 7-7 7M5 5l7 7-7 7"
          />
        </svg>
      );
    case 'ROLLED_BACK':
      return (
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
          />
        </svg>
      );
    default:
      return <div className="h-4 w-4" />;
  }
}

interface StepItemProps {
  step: DisplayStep;
  isLast: boolean;
}

function StepItem({ step, isLast }: StepItemProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && <div className="absolute left-[7px] top-6 h-[calc(100%-12px)] w-0.5 bg-border" />}

      <div className="flex gap-3">
        {/* Status icon */}
        <div className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center bg-card">
          {getStepStatusIcon(step.status)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 pb-4">
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="flex w-full items-start gap-2 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Step {step.stepNumber + 1}
                  </span>
                  <span className="text-xs text-muted-foreground/60">|</span>
                  <span className="text-xs font-medium text-primary">
                    {formatToolNameForChat(step.toolName)}
                  </span>
                </div>
                <div className="mt-0.5 text-sm">{step.description}</div>
                {step.dependsOn.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Depends on: {step.dependsOn.map((d) => d.replace('step_', 'Step ')).join(', ')}
                  </div>
                )}
              </div>
              <svg
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  isOpen && 'rotate-90',
                )}
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-2 space-y-2 rounded-md border border-border/50 bg-muted/30 p-3 text-xs">
                {/* Tool input */}
                <div>
                  <div className="font-medium text-muted-foreground">Input</div>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
                    {formatJsonValue(step.toolInput)}
                  </pre>
                </div>

                {/* Result if completed */}
                {step.status === 'COMPLETED' && step.result !== null && (
                  <div>
                    <div className="font-medium text-green-600 dark:text-green-500">Result</div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
                      {formatJsonValue(step.result)}
                    </pre>
                  </div>
                )}

                {/* Error if failed */}
                {step.status === 'FAILED' && step.error && (
                  <div>
                    <div className="font-medium text-destructive">Error</div>
                    <div className="mt-1 text-destructive">{step.error}</div>
                  </div>
                )}

                {/* Rollback indicator */}
                {step.canRollback && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                      />
                    </svg>
                    Can be rolled back
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}

interface ProgressBarProps {
  current: number;
  total: number;
  status: PlanStatus;
}

function ProgressBar({ current, total, status }: ProgressBarProps): React.ReactElement {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  let barColor = 'bg-primary';
  if (status === 'COMPLETED') {
    barColor = 'bg-green-500';
  } else if (status === 'FAILED') {
    barColor = 'bg-destructive';
  } else if (status === 'ABORTED' || status === 'ROLLED_BACK') {
    barColor = 'bg-muted-foreground';
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span>
          {current} / {total} steps
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-all duration-300', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function PlanReviewCard({
  planId,
  onClose,
}: PlanReviewCardProps): React.ReactElement | null {
  const utils = trpc.useUtils();

  // Fetch plan data with polling when executing
  const { data: plan, isLoading } = trpc.agent.plan.get.useQuery({ planId });

  // Poll while plan is executing
  const isExecuting = plan?.status === 'EXECUTING';
  React.useEffect(() => {
    if (!isExecuting) return;

    const interval = setInterval(() => {
      void utils.agent.plan.get.invalidate({ planId });
    }, 1000);

    return () => clearInterval(interval);
  }, [isExecuting, planId, utils.agent.plan.get]);

  // Mutations
  const approveMutation = trpc.agent.plan.approve.useMutation({
    onSuccess: () => {
      void utils.agent.plan.get.invalidate({ planId });
    },
  });

  const executeMutation = trpc.agent.plan.execute.useMutation({
    onSuccess: () => {
      void utils.agent.plan.get.invalidate({ planId });
    },
  });

  const abortMutation = trpc.agent.plan.abort.useMutation({
    onSuccess: () => {
      void utils.agent.plan.get.invalidate({ planId });
    },
  });

  const rollbackMutation = trpc.agent.plan.rollback.useMutation({
    onSuccess: () => {
      void utils.agent.plan.get.invalidate({ planId });
    },
  });

  // Handlers
  function handleApproveAndExecute(): void {
    approveMutation.mutate(
      { planId },
      {
        onSuccess: (result) => {
          if (result.success) {
            executeMutation.mutate({ planId });
          }
        },
      },
    );
  }

  function handleAbort(): void {
    abortMutation.mutate({ planId });
  }

  function handleRollback(): void {
    rollbackMutation.mutate({ planId });
  }

  // Convert steps to display-safe format (avoids recursive Prisma JSON types)
  // Must be called before any conditional returns to satisfy React hooks rules
  const displaySteps: DisplayStep[] = React.useMemo(() => {
    if (!plan?.steps) return [];
    // Cast the steps array to avoid deep type instantiation issues with Prisma JSON
    const steps = plan.steps as unknown as Array<{
      id: string;
      stepNumber: number;
      toolName: string;
      toolInput: unknown;
      description: string;
      dependsOn: string[];
      status: string;
      result: unknown;
      error: string | null;
      canRollback: boolean;
      startedAt?: string;
      completedAt?: string;
    }>;
    return steps.map((step) => toDisplayStep(step));
  }, [plan?.steps]);

  if (isLoading) {
    return (
      <Card className="mx-4 my-4 animate-pulse">
        <CardHeader className="pb-3">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return null;
  }

  const isDraft = plan.status === 'DRAFT';
  const isPending = plan.status === 'PENDING';
  const isFailed = plan.status === 'FAILED';
  const isCompleted = plan.status === 'COMPLETED';
  const isTerminal = isCompleted || plan.status === 'ABORTED' || plan.status === 'ROLLED_BACK';
  const canRollback =
    isFailed && displaySteps.some((s) => s.canRollback && s.status === 'COMPLETED');
  const isActionPending =
    approveMutation.isPending ||
    executeMutation.isPending ||
    abortMutation.isPending ||
    rollbackMutation.isPending;

  return (
    <Card
      className={cn(
        'mx-4 my-4 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300',
        isDraft && 'border-2 border-primary/50',
        isExecuting && 'border-2 border-amber-500/50',
        isFailed && 'border-2 border-destructive/50',
        isCompleted && 'border-2 border-green-500/50',
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <Badge variant={getStatusBadgeVariant(plan.status)}>
                {plan.status.replace('_', ' ')}
              </Badge>
            </div>
            {plan.description && (
              <CardDescription className="mt-1">{plan.description}</CardDescription>
            )}
          </div>
          {onClose && isTerminal && (
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar for executing/completed states */}
        {(isExecuting || isCompleted || isFailed) && (
          <ProgressBar current={plan.currentStep} total={plan.totalSteps} status={plan.status} />
        )}

        {/* Error message if failed */}
        {plan.error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-destructive">Execution Failed</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{plan.error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Completed message */}
        {isCompleted && (
          <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-600 dark:text-green-500"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <div className="text-sm font-medium text-green-600 dark:text-green-500">
                Plan completed successfully
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Steps list */}
        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Steps ({displaySteps.length})
          </div>
          <div className="space-y-0">
            {displaySteps.map((step, index) => (
              <StepItem key={step.id} step={step} isLast={index === displaySteps.length - 1} />
            ))}
          </div>
        </div>

        {/* Action buttons */}
        {!isTerminal && (
          <>
            <Separator />
            <div className="flex gap-3">
              {(isDraft || isPending) && (
                <Button
                  onClick={handleApproveAndExecute}
                  disabled={isActionPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  {approveMutation.isPending || executeMutation.isPending
                    ? 'Starting...'
                    : 'Approve & Execute'}
                </Button>
              )}
              {!isTerminal && !isExecuting && (
                <Button
                  onClick={handleAbort}
                  disabled={isActionPending}
                  variant="outline"
                  className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  {abortMutation.isPending ? 'Aborting...' : 'Reject'}
                </Button>
              )}
              {isExecuting && (
                <Button
                  onClick={handleAbort}
                  disabled={isActionPending}
                  variant="outline"
                  className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  {abortMutation.isPending ? 'Aborting...' : 'Abort Execution'}
                </Button>
              )}
            </div>
          </>
        )}

        {/* Rollback button for failed plans */}
        {canRollback && (
          <>
            <Separator />
            <div className="flex gap-3">
              <Button
                onClick={handleRollback}
                disabled={isActionPending}
                variant="outline"
                className="flex-1"
              >
                {rollbackMutation.isPending ? 'Rolling back...' : 'Rollback Completed Steps'}
              </Button>
            </div>
          </>
        )}

        {/* Mutation errors */}
        {(approveMutation.error ||
          executeMutation.error ||
          abortMutation.error ||
          rollbackMutation.error) && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {approveMutation.error?.message ||
              executeMutation.error?.message ||
              abortMutation.error?.message ||
              rollbackMutation.error?.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Container for displaying multiple plans in a conversation
 */
interface PlanListProps {
  conversationId: string;
}

export function PlanList({ conversationId }: PlanListProps): React.ReactElement | null {
  const { data: plans } = trpc.agent.plan.listForConversation.useQuery(
    { conversationId },
    { enabled: !!conversationId },
  );

  if (!plans || plans.length === 0) {
    return null;
  }

  // Only show non-completed plans, or the most recent completed one
  const activePlans = plans.filter(
    (p) => p.status !== 'COMPLETED' && p.status !== 'ABORTED' && p.status !== 'ROLLED_BACK',
  );

  if (activePlans.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {activePlans.map((plan) => (
        <PlanReviewCard key={plan.id} planId={plan.id} />
      ))}
    </div>
  );
}
