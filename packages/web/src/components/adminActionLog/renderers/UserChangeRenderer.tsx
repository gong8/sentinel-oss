/**
 * UserChangeRenderer Component
 * Specialized renderer for USER resource changes
 * Shows role comparison table, email changes, etc.
 */

import { ArrowRight, Mail, Minus, Plus, Shield, UserCog } from 'lucide-react';

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

interface UserChangeRendererProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

export function UserChangeRenderer({
  changeDiff,
  beforeSnapshot,
  afterSnapshot,
}: UserChangeRendererProps) {
  // If we have a computed diff, use specialized rendering
  if (changeDiff && Object.keys(changeDiff).length > 0) {
    return <UserDiffView changeDiff={changeDiff} />;
  }

  // Otherwise, try to extract from snapshots
  const before = beforeSnapshot as Record<string, unknown> | undefined;
  const after = afterSnapshot as Record<string, unknown> | undefined;

  if (!before && !after) {
    return <p className="text-sm text-muted-foreground">No user change details available.</p>;
  }

  return <UserSnapshotView before={before} after={after} />;
}

function UserDiffView({ changeDiff }: { changeDiff: ChangeDiff }) {
  // Priority fields to show at top
  const priorityFields = ['email', 'name', 'roles', 'isAdmin', 'status'];

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
        // Render email changes with special styling
        if (field === 'email') {
          return <EmailChangeRow key={field} change={change} />;
        }

        // Render role changes with comparison table
        if (field === 'roles' || field === 'roleIds' || field === 'roleNames') {
          return <RoleChangeRow key={field} field={field} change={change} />;
        }

        // Render admin toggle
        if (field === 'isAdmin') {
          return <AdminToggleRow key={field} change={change} />;
        }

        // Render status changes
        if (field === 'status' || field === 'deletedAt') {
          return <StatusChangeRow key={field} field={field} change={change} />;
        }

        // Default rendering for other fields
        return <GenericFieldRow key={field} field={field} change={change} />;
      })}
    </div>
  );
}

function EmailChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Mail className="h-4 w-4" />
        <span className="font-medium text-sm">Email</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        {changeType !== 'added' && (
          <div className="flex-1 rounded bg-red-50 p-2 dark:bg-red-950/20">
            <span className="font-mono text-red-700 dark:text-red-400">
              {formatDiffValue(before)}
            </span>
          </div>
        )}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && (
          <div className="flex-1 rounded bg-green-50 p-2 dark:bg-green-950/20">
            <span className="font-mono text-green-700 dark:text-green-400">
              {formatDiffValue(after)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleChangeRow({ field, change }: { field: string; change: FieldChange }) {
  const { before, after, changeType } = change;

  // Handle different role formats
  const beforeRoles = normalizeRoles(before);
  const afterRoles = normalizeRoles(after);

  // Calculate added and removed roles
  const added = afterRoles.filter(
    (r) => !beforeRoles.some((br) => br.id === r.id || br.name === r.name),
  );
  const removed = beforeRoles.filter(
    (r) => !afterRoles.some((ar) => ar.id === r.id || ar.name === r.name),
  );
  const unchanged = afterRoles.filter((r) =>
    beforeRoles.some((br) => br.id === r.id || br.name === r.name),
  );

  const fieldLabel = field === 'roleNames' ? 'Roles' : field === 'roleIds' ? 'Roles' : 'Roles';

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <UserCog className="h-4 w-4" />
        <span className="font-medium text-sm">{fieldLabel}</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>

      {/* Role comparison table */}
      <div className="space-y-2">
        {removed.map((role, i) => (
          <div
            key={`removed-${i}`}
            className="flex items-center gap-2 rounded bg-red-50 px-3 py-2 dark:bg-red-950/20"
          >
            <Minus className="h-3 w-3 text-red-600" />
            <Badge variant="outline" className="text-red-700 line-through dark:text-red-400">
              {role.name || role.id}
            </Badge>
          </div>
        ))}
        {added.map((role, i) => (
          <div
            key={`added-${i}`}
            className="flex items-center gap-2 rounded bg-green-50 px-3 py-2 dark:bg-green-950/20"
          >
            <Plus className="h-3 w-3 text-green-600" />
            <Badge variant="outline" className="text-green-700 dark:text-green-400">
              {role.name || role.id}
            </Badge>
          </div>
        ))}
        {unchanged.length > 0 && (added.length > 0 || removed.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground mr-1">Unchanged:</span>
            {unchanged.map((role, i) => (
              <Badge key={`unchanged-${i}`} variant="secondary" className="text-xs">
                {role.name || role.id}
              </Badge>
            ))}
          </div>
        )}
        {unchanged.length > 0 && added.length === 0 && removed.length === 0 && (
          <div className="flex flex-wrap gap-1">
            {unchanged.map((role, i) => (
              <Badge key={`unchanged-${i}`} variant="outline" className="text-xs">
                {role.name || role.id}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NormalizedRole {
  id?: string;
  name?: string;
}

function normalizeRoles(value: unknown): NormalizedRole[] {
  if (!value) return [];
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (typeof item === 'string') {
      return { name: item };
    }
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      return {
        id: obj.id as string | undefined,
        name: (obj.name as string | undefined) || (obj.id as string | undefined),
      };
    }
    return { name: String(item) };
  });
}

function AdminToggleRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span className="font-medium text-sm">Admin Status</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-3">
        {changeType !== 'added' && (
          <Badge variant={before ? 'destructive' : 'secondary'} className="opacity-50 line-through">
            {before ? 'Admin' : 'Regular User'}
          </Badge>
        )}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && (
          <Badge variant={after ? 'destructive' : 'secondary'}>
            {after ? 'Admin' : 'Regular User'}
          </Badge>
        )}
      </div>
    </div>
  );
}

function StatusChangeRow({ field, change }: { field: string; change: FieldChange }) {
  const { before, after, changeType } = change;

  // Handle deletedAt field
  if (field === 'deletedAt') {
    const wasDeleted = !!before;
    const isDeleted = !!after;

    return (
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-medium text-sm">Account Status</span>
          <ChangeTypeBadge changeType={changeType} />
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={wasDeleted ? 'destructive' : 'default'}
            className="opacity-50 line-through"
          >
            {wasDeleted ? 'Deleted' : 'Active'}
          </Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant={isDeleted ? 'destructive' : 'default'}>
            {isDeleted ? 'Deleted' : 'Active'}
          </Badge>
        </div>
      </div>
    );
  }

  return <GenericFieldRow field={field} change={change} />;
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

function UserSnapshotView({
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
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(before, null, 2)}
          </pre>
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
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(after, null, 2)}
          </pre>
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
