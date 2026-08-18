/**
 * SensitiveFlagChangeRenderer Component
 * Specialized renderer for SENSITIVE_FLAG resource changes
 * Shows behavior badges, pattern diff
 */

import { ArrowRight, Eye, EyeOff, Flag, Minus, Plus, ShieldAlert } from 'lucide-react';

import { Badge } from '../../ui/badge';
import { formatDiffValue } from '../utils';

interface FieldChange {
  before: unknown;
  after: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

interface ChangeDiff {
  [field: string]: FieldChange;
}

interface SensitiveFlagChangeRendererProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

export function SensitiveFlagChangeRenderer({
  changeDiff,
  beforeSnapshot,
  afterSnapshot,
}: SensitiveFlagChangeRendererProps) {
  // If we have a computed diff, use specialized rendering
  if (changeDiff && Object.keys(changeDiff).length > 0) {
    return <SensitiveFlagDiffView changeDiff={changeDiff} />;
  }

  // Otherwise, try to extract from snapshots
  const before = beforeSnapshot as Record<string, unknown> | undefined;
  const after = afterSnapshot as Record<string, unknown> | undefined;

  if (!before && !after) {
    return (
      <p className="text-sm text-muted-foreground">No sensitive flag change details available.</p>
    );
  }

  return <SensitiveFlagSnapshotView before={before} after={after} />;
}

function SensitiveFlagDiffView({ changeDiff }: { changeDiff: ChangeDiff }) {
  // Priority fields to show at top
  const priorityFields = ['name', 'pattern', 'behavior', 'enabled', 'description'];

  const sortedEntries = Object.entries(changeDiff).sort((a, b) => {
    const aIndex = priorityFields.indexOf(a[0]);
    const bIndex = priorityFields.indexOf(b[0]);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return 0;
  });

  return (
    <div className="space-y-4">
      {sortedEntries.map(([field, change]) => {
        // Render pattern changes with special styling
        if (field === 'pattern') {
          return <PatternChangeRow key={field} change={change} />;
        }

        // Render behavior changes with badges
        if (field === 'behavior') {
          return <BehaviorChangeRow key={field} change={change} />;
        }

        // Render enabled toggle
        if (field === 'enabled') {
          return <EnabledChangeRow key={field} change={change} />;
        }

        // Default rendering for other fields
        return <GenericFieldRow key={field} field={field} change={change} />;
      })}
    </div>
  );
}

function PatternChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Flag className="h-4 w-4" />
        <span className="font-medium text-sm">Pattern</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        {changeType !== 'added' && (
          <div className="flex-1 rounded bg-red-50 p-2 dark:bg-red-950/20">
            <code className="text-xs text-red-700 dark:text-red-400">
              {formatDiffValue(before)}
            </code>
          </div>
        )}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && (
          <div className="flex-1 rounded bg-green-50 p-2 dark:bg-green-950/20">
            <code className="text-xs text-green-700 dark:text-green-400">
              {formatDiffValue(after)}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

function BehaviorChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" />
        <span className="font-medium text-sm">Behavior</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-3">
        {changeType !== 'added' && <BehaviorBadge behavior={before as string} variant="before" />}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && <BehaviorBadge behavior={after as string} variant="after" />}
      </div>
    </div>
  );
}

function BehaviorBadge({ behavior, variant }: { behavior: string; variant: 'before' | 'after' }) {
  const className = variant === 'before' ? 'opacity-50 line-through' : '';

  switch (behavior?.toUpperCase()) {
    case 'MASK':
      return (
        <Badge variant="secondary" className={className}>
          <EyeOff className="mr-1 h-3 w-3" />
          Mask
        </Badge>
      );
    case 'REDACT':
      return (
        <Badge variant="destructive" className={className}>
          <EyeOff className="mr-1 h-3 w-3" />
          Redact
        </Badge>
      );
    case 'WARN':
      return (
        <Badge variant="outline" className={`text-yellow-600 ${className}`}>
          <ShieldAlert className="mr-1 h-3 w-3" />
          Warn
        </Badge>
      );
    case 'BLOCK':
      return (
        <Badge variant="destructive" className={className}>
          <ShieldAlert className="mr-1 h-3 w-3" />
          Block
        </Badge>
      );
    case 'LOG':
      return (
        <Badge variant="outline" className={className}>
          <Eye className="mr-1 h-3 w-3" />
          Log Only
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {behavior || 'Unknown'}
        </Badge>
      );
  }
}

function EnabledChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Flag className="h-4 w-4" />
        <span className="font-medium text-sm">Status</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-3">
        {changeType !== 'added' && (
          <Badge variant={before ? 'default' : 'secondary'} className="opacity-50 line-through">
            {before ? 'Enabled' : 'Disabled'}
          </Badge>
        )}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && (
          <Badge variant={after ? 'default' : 'secondary'}>{after ? 'Enabled' : 'Disabled'}</Badge>
        )}
      </div>
    </div>
  );
}

function GenericFieldRow({ field, change }: { field: string; change: FieldChange }) {
  const { before, after, changeType } = change;
  const fieldLabel = formatFieldName(field);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-sm">{fieldLabel}</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        {changeType !== 'added' && (
          <div className="flex-1 rounded bg-red-50 p-2 dark:bg-red-950/20">
            <span className="text-red-700 dark:text-red-400">{formatDiffValue(before)}</span>
          </div>
        )}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && (
          <div className="flex-1 rounded bg-green-50 p-2 dark:bg-green-950/20">
            <span className="text-green-700 dark:text-green-400">{formatDiffValue(after)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SensitiveFlagSnapshotView({
  before,
  after,
}: {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}) {
  return (
    <div className="space-y-4">
      {before && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="text-red-600">
              <Minus className="mr-1 h-3 w-3" />
              Before
            </Badge>
          </div>
          <SensitiveFlagSnapshot flag={before} />
        </div>
      )}
      {after && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="text-green-600">
              <Plus className="mr-1 h-3 w-3" />
              After
            </Badge>
          </div>
          <SensitiveFlagSnapshot flag={after} />
        </div>
      )}
    </div>
  );
}

function SensitiveFlagSnapshot({ flag }: { flag: Record<string, unknown> }) {
  const pattern = flag.pattern as string | undefined;
  const behavior = flag.behavior as string | undefined;
  const enabled = flag.enabled as boolean | undefined;
  const description = flag.description as string | undefined;

  return (
    <div className="space-y-2 rounded-md bg-muted p-3">
      {pattern && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Pattern:</span>
          <code className="rounded bg-background px-2 py-0.5 text-xs">{pattern}</code>
        </div>
      )}
      {behavior && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Behavior:</span>
          <BehaviorBadge behavior={behavior} variant="after" />
        </div>
      )}
      {enabled !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Badge variant={enabled ? 'default' : 'secondary'}>
            {enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      )}
      {description && (
        <div>
          <span className="text-sm text-muted-foreground">Description:</span>
          <p className="mt-1 text-sm">{description}</p>
        </div>
      )}
    </div>
  );
}

function ChangeTypeBadge({ changeType }: { changeType: 'added' | 'removed' | 'modified' }) {
  switch (changeType) {
    case 'added':
      return (
        <Badge variant="outline" className="text-green-600 text-xs">
          <Plus className="mr-1 h-3 w-3" />
          Added
        </Badge>
      );
    case 'removed':
      return (
        <Badge variant="outline" className="text-red-600 text-xs">
          <Minus className="mr-1 h-3 w-3" />
          Removed
        </Badge>
      );
    case 'modified':
      return (
        <Badge variant="outline" className="text-yellow-600 text-xs">
          Modified
        </Badge>
      );
  }
}

function formatFieldName(field: string): string {
  // Convert camelCase/snake_case to Title Case
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+/, '')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
