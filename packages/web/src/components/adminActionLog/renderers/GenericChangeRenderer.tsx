/**
 * GenericChangeRenderer Component
 * Fallback renderer for any resource type without a specialized renderer
 */

import { ArrowRight, Minus, Plus } from 'lucide-react';

import { Badge } from '../../ui/badge';
import { formatDiffValue, isSensitiveField } from '../utils';

interface FieldChange {
  before: unknown;
  after: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

interface ChangeDiff {
  [field: string]: FieldChange;
}

interface GenericChangeRendererProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

export function GenericChangeRenderer({
  changeDiff,
  beforeSnapshot,
  afterSnapshot,
}: GenericChangeRendererProps) {
  // If we have a computed diff, use it
  if (changeDiff && Object.keys(changeDiff).length > 0) {
    return (
      <div className="space-y-3">
        {Object.entries(changeDiff).map(([field, change]) => (
          <FieldChangeRow key={field} field={field} change={change} />
        ))}
      </div>
    );
  }

  // Otherwise, show before/after snapshots
  const hasBefore = beforeSnapshot && typeof beforeSnapshot === 'object';
  const hasAfter = afterSnapshot && typeof afterSnapshot === 'object';

  if (!hasBefore && !hasAfter) {
    return <p className="text-sm text-muted-foreground">No change details available.</p>;
  }

  return (
    <div className="space-y-4">
      {hasBefore ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="text-red-600">
              <Minus className="mr-1 h-3 w-3" />
              Before
            </Badge>
          </div>
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(beforeSnapshot, null, 2)}
          </pre>
        </div>
      ) : null}
      {hasAfter ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="text-green-600">
              <Plus className="mr-1 h-3 w-3" />
              After
            </Badge>
          </div>
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(afterSnapshot, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

interface FieldChangeRowProps {
  field: string;
  change: FieldChange;
}

function FieldChangeRow({ field, change }: FieldChangeRowProps) {
  const isSensitive = isSensitiveField(field);
  const { before, after, changeType } = change;

  // Format field name for display
  const fieldLabel = formatFieldName(field);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-sm">{fieldLabel}</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>

      {isSensitive ? (
        <div className="text-sm text-muted-foreground italic">(Sensitive value hidden)</div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          {changeType !== 'added' ? (
            <div className="flex-1 rounded bg-red-50 p-2 dark:bg-red-950/20">
              <span className="text-red-700 dark:text-red-400">{formatDiffValue(before)}</span>
            </div>
          ) : null}

          {changeType === 'modified' ? (
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          ) : null}

          {changeType !== 'removed' ? (
            <div className="flex-1 rounded bg-green-50 p-2 dark:bg-green-950/20">
              <span className="text-green-700 dark:text-green-400">{formatDiffValue(after)}</span>
            </div>
          ) : null}
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
