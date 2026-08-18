/**
 * ActionSummaryBanner Component
 * Displays the action type, status, and timestamp at the top of the detail page
 */

import { Clock, User } from 'lucide-react';

import { Badge } from '../ui/badge';
import { actionTypeLabels } from './labels';
import { ActionTypeIcon, getSourceBadgeVariant } from './utils';

interface ActionSummaryBannerProps {
  actionType: string;
  timestamp: string | Date;
  source: string;
  diffSummary?: string | null;
  adminEmail?: string | null;
  actionStage?: string | null;
}

export function ActionSummaryBanner({
  actionType,
  timestamp,
  source,
  diffSummary,
  adminEmail,
  actionStage,
}: ActionSummaryBannerProps) {
  const actionLabel =
    actionType in actionTypeLabels
      ? actionTypeLabels[actionType as keyof typeof actionTypeLabels]
      : actionType;

  const formattedTimestamp =
    timestamp instanceof Date ? timestamp.toLocaleString() : new Date(timestamp).toLocaleString();

  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ActionTypeIcon actionType={actionType} className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">{actionLabel}</h2>
            {diffSummary ? <p className="text-sm text-muted-foreground">{diffSummary}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getSourceBadgeVariant(source)}>{source}</Badge>
          {actionStage ? (
            <Badge variant="outline" className="capitalize">
              {actionStage}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          <span>{formattedTimestamp}</span>
        </div>
        {adminEmail ? (
          <div className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            <span>{adminEmail}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
