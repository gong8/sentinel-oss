/**
 * RelatedEntriesCard Component
 * Displays resource history and correlated actions
 */

import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Clock, GitBranch, History, Link2 } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { getActionTypeLabel } from './labels';
import { ActionTypeIcon, getSourceBadgeVariant } from './utils';

interface RelatedEntry {
  id: string;
  actionType: string;
  source: string;
  timestamp: Date | string;
  adminEmail?: string | null;
  diffSummary?: string | null;
}

interface RelatedEntriesCardProps {
  resourceHistory: RelatedEntry[];
  correlatedActions: RelatedEntry[];
  currentEntryId: string;
  adminPrefix: string;
}

export function RelatedEntriesCard({
  resourceHistory,
  correlatedActions,
  currentEntryId,
  adminPrefix,
}: RelatedEntriesCardProps) {
  const hasResourceHistory = resourceHistory.length > 0;
  const hasCorrelatedActions = correlatedActions.length > 0;

  if (!hasResourceHistory && !hasCorrelatedActions) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Related Entries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resource History */}
        {hasResourceHistory && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4" />
              Resource History
              <Badge variant="secondary" className="ml-auto">
                {resourceHistory.length} entries
              </Badge>
            </div>
            <div className="space-y-2">
              {resourceHistory.map((entry) => (
                <RelatedEntryRow
                  key={entry.id}
                  entry={entry}
                  isCurrent={entry.id === currentEntryId}
                  adminPrefix={adminPrefix}
                />
              ))}
            </div>
          </div>
        )}

        {/* Separator */}
        {hasResourceHistory && hasCorrelatedActions && <div className="border-t" />}

        {/* Correlated Actions */}
        {hasCorrelatedActions && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <GitBranch className="h-4 w-4" />
              Correlated Actions
              <Badge variant="secondary" className="ml-auto">
                {correlatedActions.length} entries
              </Badge>
            </div>
            <div className="space-y-2">
              {correlatedActions.map((entry) => (
                <RelatedEntryRow
                  key={entry.id}
                  entry={entry}
                  isCurrent={entry.id === currentEntryId}
                  adminPrefix={adminPrefix}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RelatedEntryRowProps {
  entry: RelatedEntry;
  isCurrent: boolean;
  adminPrefix: string;
}

function RelatedEntryRow({ entry, isCurrent, adminPrefix }: RelatedEntryRowProps) {
  const actionLabel = getActionTypeLabel(entry.actionType);
  const timestamp = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

  const content = (
    <div
      className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
        isCurrent
          ? 'border-primary bg-primary/5'
          : 'hover:border-muted-foreground/30 hover:bg-muted/50'
      }`}
    >
      <ActionTypeIcon actionType={entry.actionType} className="h-4 w-4 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{actionLabel}</span>
          {isCurrent && (
            <Badge variant="outline" className="text-xs">
              Current
            </Badge>
          )}
        </div>
        {entry.diffSummary && (
          <p className="text-xs text-muted-foreground truncate">{entry.diffSummary}</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={getSourceBadgeVariant(entry.source)} className="text-xs">
          {formatSource(entry.source)}
        </Badge>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo}
        </span>
        {!isCurrent && <ArrowRight className="h-3 w-3" />}
      </div>
    </div>
  );

  if (isCurrent) {
    return content;
  }

  return (
    <Link to={`${adminPrefix}/action-log/${entry.id}`} className="block">
      {content}
    </Link>
  );
}

function formatSource(source: string): string {
  switch (source) {
    case 'UI':
      return 'Dashboard';
    case 'MCP_ADMIN':
      return 'MCP';
    case 'API':
      return 'API';
    case 'SYSTEM':
      return 'System';
    default:
      return source;
  }
}
