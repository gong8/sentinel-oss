/**
 * PolicyChangeRenderer Component
 * Specialized renderer for POLICY resource changes
 * Shows effect badges, matchers list diff, tool patterns diff
 */

import { ArrowRight, Minus, Plus, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

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

interface PolicyChangeRendererProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

export function PolicyChangeRenderer({
  changeDiff,
  beforeSnapshot,
  afterSnapshot,
}: PolicyChangeRendererProps) {
  // If we have a computed diff, use specialized rendering
  if (changeDiff && Object.keys(changeDiff).length > 0) {
    return <PolicyDiffView changeDiff={changeDiff} />;
  }

  // Otherwise, try to extract from snapshots
  const before = beforeSnapshot as Record<string, unknown> | undefined;
  const after = afterSnapshot as Record<string, unknown> | undefined;

  if (!before && !after) {
    return <p className="text-sm text-muted-foreground">No policy change details available.</p>;
  }

  return <PolicySnapshotView before={before} after={after} />;
}

function PolicyDiffView({ changeDiff }: { changeDiff: ChangeDiff }) {
  // Priority fields to show at top
  const priorityFields = ['effect', 'enabled', 'priority', 'name', 'description'];
  const matcherFields = ['toolPatterns', 'resourcePatterns', 'mcpServerPatterns', 'actionPatterns'];

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
        // Render effect changes with special styling
        if (field === 'effect') {
          return <EffectChangeRow key={field} change={change} />;
        }

        // Render enabled toggle
        if (field === 'enabled') {
          return <EnabledChangeRow key={field} change={change} />;
        }

        // Render pattern arrays with specialized view
        if (matcherFields.includes(field)) {
          return <PatternArrayChangeRow key={field} field={field} change={change} />;
        }

        // Default rendering for other fields
        return <GenericFieldRow key={field} field={field} change={change} />;
      })}
    </div>
  );
}

function EffectChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span className="font-medium text-sm">Effect</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-3">
        {changeType !== 'added' && <EffectBadge effect={before as string} variant="before" />}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && <EffectBadge effect={after as string} variant="after" />}
      </div>
    </div>
  );
}

function EffectBadge({ effect, variant }: { effect: string; variant: 'before' | 'after' }) {
  const isAllow = effect === 'ALLOW';
  const isDeny = effect === 'DENY';

  if (isDeny) {
    return (
      <Badge
        variant="destructive"
        className={variant === 'before' ? 'opacity-50 line-through' : ''}
      >
        <ShieldAlert className="mr-1 h-3 w-3" />
        DENY
      </Badge>
    );
  }

  if (isAllow) {
    return (
      <Badge
        variant="default"
        className={`bg-green-600 ${variant === 'before' ? 'opacity-50 line-through' : ''}`}
      >
        <ShieldCheck className="mr-1 h-3 w-3" />
        ALLOW
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={variant === 'before' ? 'opacity-50 line-through' : ''}>
      {effect}
    </Badge>
  );
}

function EnabledChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-sm">Enabled</span>
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

function PatternArrayChangeRow({ field, change }: { field: string; change: FieldChange }) {
  const { before, after, changeType } = change;
  const beforeArr = (Array.isArray(before) ? before : []) as string[];
  const afterArr = (Array.isArray(after) ? after : []) as string[];

  // Calculate added and removed patterns
  const added = afterArr.filter((p) => !beforeArr.includes(p));
  const removed = beforeArr.filter((p) => !afterArr.includes(p));
  const unchanged = afterArr.filter((p) => beforeArr.includes(p));

  const fieldLabel = formatFieldName(field);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-sm">{fieldLabel}</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="space-y-1">
        {removed.map((pattern, i) => (
          <div
            key={`removed-${i}`}
            className="flex items-center gap-2 rounded bg-red-50 px-2 py-1 dark:bg-red-950/20"
          >
            <Minus className="h-3 w-3 text-red-600" />
            <code className="text-xs text-red-700 line-through dark:text-red-400">{pattern}</code>
          </div>
        ))}
        {added.map((pattern, i) => (
          <div
            key={`added-${i}`}
            className="flex items-center gap-2 rounded bg-green-50 px-2 py-1 dark:bg-green-950/20"
          >
            <Plus className="h-3 w-3 text-green-600" />
            <code className="text-xs text-green-700 dark:text-green-400">{pattern}</code>
          </div>
        ))}
        {unchanged.length > 0 && (added.length > 0 || removed.length > 0) && (
          <div className="mt-2 text-xs text-muted-foreground">
            {unchanged.length} pattern{unchanged.length !== 1 ? 's' : ''} unchanged
          </div>
        )}
        {unchanged.length > 0 && added.length === 0 && removed.length === 0 && (
          <div className="space-y-1">
            {unchanged.map((pattern, i) => (
              <div key={`unchanged-${i}`} className="flex items-center gap-2 px-2 py-1">
                <code className="text-xs text-muted-foreground">{pattern}</code>
              </div>
            ))}
          </div>
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

function PolicySnapshotView({
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
          <PolicySnapshot policy={before} />
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
          <PolicySnapshot policy={after} />
        </div>
      )}
    </div>
  );
}

function PolicySnapshot({ policy }: { policy: Record<string, unknown> }) {
  const effect = policy.effect as string | undefined;
  const enabled = policy.enabled as boolean | undefined;
  const toolPatterns = policy.toolPatterns as string[] | undefined;

  return (
    <div className="space-y-2 rounded-md bg-muted p-3">
      {effect && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Effect:</span>
          <EffectBadge effect={effect} variant="after" />
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
      {toolPatterns && toolPatterns.length > 0 && (
        <div>
          <span className="text-sm text-muted-foreground">Tool Patterns:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {toolPatterns.map((pattern, i) => (
              <code key={i} className="rounded bg-background px-2 py-0.5 text-xs">
                {pattern}
              </code>
            ))}
          </div>
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
  // Map specific policy fields to better labels
  const fieldMap: Record<string, string> = {
    toolPatterns: 'Tool Patterns',
    resourcePatterns: 'Resource Patterns',
    mcpServerPatterns: 'MCP Server Patterns',
    actionPatterns: 'Action Patterns',
  };

  if (fieldMap[field]) return fieldMap[field];

  // Convert camelCase/snake_case to Title Case
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+/, '')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
