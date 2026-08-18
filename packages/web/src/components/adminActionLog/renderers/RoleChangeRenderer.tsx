/**
 * RoleChangeRenderer Component
 * Specialized renderer for ROLE resource changes
 * Shows permissions diff, isAdmin toggle, member changes
 */

import { ArrowRight, Minus, Plus, Shield, ShieldCheck, UserCog, Users } from 'lucide-react';

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

interface RoleChangeRendererProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

export function RoleChangeRenderer({
  changeDiff,
  beforeSnapshot,
  afterSnapshot,
}: RoleChangeRendererProps) {
  // If we have a computed diff, use specialized rendering
  if (changeDiff && Object.keys(changeDiff).length > 0) {
    return <RoleDiffView changeDiff={changeDiff} />;
  }

  // Otherwise, try to extract from snapshots
  const before = beforeSnapshot as Record<string, unknown> | undefined;
  const after = afterSnapshot as Record<string, unknown> | undefined;

  if (!before && !after) {
    return <p className="text-sm text-muted-foreground">No role change details available.</p>;
  }

  return <RoleSnapshotView before={before} after={after} />;
}

function RoleDiffView({ changeDiff }: { changeDiff: ChangeDiff }) {
  // Priority fields to show at top
  const priorityFields = ['name', 'isAdmin', 'permissions', 'description'];

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
        // Render isAdmin toggle with special styling
        if (field === 'isAdmin') {
          return <IsAdminChangeRow key={field} change={change} />;
        }

        // Render permissions with specialized view
        if (field === 'permissions') {
          return <PermissionsChangeRow key={field} change={change} />;
        }

        // Render member changes
        if (field === 'members' || field === 'memberCount' || field === 'users') {
          return <MembersChangeRow key={field} field={field} change={change} />;
        }

        // Default rendering for other fields
        return <GenericFieldRow key={field} field={field} change={change} />;
      })}
    </div>
  );
}

function IsAdminChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span className="font-medium text-sm">Admin Role</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-3">
        {changeType !== 'added' && <AdminBadge isAdmin={!!before} variant="before" />}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && <AdminBadge isAdmin={!!after} variant="after" />}
      </div>
      {changeType === 'modified' && !!after && (
        <div className="mt-2 rounded bg-yellow-50 p-2 text-xs text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400">
          Warning: Users with this role will have full admin access
        </div>
      )}
    </div>
  );
}

function AdminBadge({ isAdmin, variant }: { isAdmin: boolean; variant: 'before' | 'after' }) {
  const className = variant === 'before' ? 'opacity-50 line-through' : '';

  if (isAdmin) {
    return (
      <Badge variant="destructive" className={className}>
        <ShieldCheck className="mr-1 h-3 w-3" />
        Admin Role
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      <UserCog className="mr-1 h-3 w-3" />
      Standard Role
    </Badge>
  );
}

function PermissionsChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  // Normalize permissions to array of strings
  const beforePerms = normalizePermissions(before);
  const afterPerms = normalizePermissions(after);

  // Calculate added and removed permissions
  const added = afterPerms.filter((p) => !beforePerms.includes(p));
  const removed = beforePerms.filter((p) => !afterPerms.includes(p));
  const unchanged = afterPerms.filter((p) => beforePerms.includes(p));

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span className="font-medium text-sm">Permissions</span>
        <ChangeTypeBadge changeType={changeType} />
        <span className="text-xs text-muted-foreground">({afterPerms.length} total)</span>
      </div>

      <div className="space-y-1">
        {removed.map((perm, i) => (
          <div
            key={`removed-${i}`}
            className="flex items-center gap-2 rounded bg-red-50 px-2 py-1 dark:bg-red-950/20"
          >
            <Minus className="h-3 w-3 text-red-600" />
            <code className="text-xs text-red-700 line-through dark:text-red-400">
              {formatPermission(perm)}
            </code>
          </div>
        ))}
        {added.map((perm, i) => (
          <div
            key={`added-${i}`}
            className="flex items-center gap-2 rounded bg-green-50 px-2 py-1 dark:bg-green-950/20"
          >
            <Plus className="h-3 w-3 text-green-600" />
            <code className="text-xs text-green-700 dark:text-green-400">
              {formatPermission(perm)}
            </code>
          </div>
        ))}
        {unchanged.length > 0 && (added.length > 0 || removed.length > 0) && (
          <div className="mt-2 text-xs text-muted-foreground">
            {unchanged.length} permission{unchanged.length !== 1 ? 's' : ''} unchanged
          </div>
        )}
        {unchanged.length > 0 && added.length === 0 && removed.length === 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {unchanged.slice(0, 8).map((perm, i) => (
              <Badge key={`unchanged-${i}`} variant="secondary" className="text-xs">
                {formatPermission(perm)}
              </Badge>
            ))}
            {unchanged.length > 8 && (
              <span className="text-xs text-muted-foreground">+{unchanged.length - 8} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizePermissions(value: unknown): string[] {
  if (!value) return [];
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      return (obj.name as string) || (obj.permission as string) || JSON.stringify(item);
    }
    return String(item);
  });
}

function formatPermission(perm: string): string {
  // Make permissions more readable
  return perm
    .replace(/_/g, ' ')
    .replace(/:/g, ' → ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function MembersChangeRow({ field, change }: { field: string; change: FieldChange }) {
  const { before, after, changeType } = change;

  // Handle memberCount
  if (field === 'memberCount') {
    const beforeCount = (before as number) || 0;
    const afterCount = (after as number) || 0;
    const diff = afterCount - beforeCount;

    return (
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span className="font-medium text-sm">Member Count</span>
          <ChangeTypeBadge changeType={changeType} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{afterCount}</span>
          {diff !== 0 && (
            <Badge variant={diff > 0 ? 'default' : 'secondary'}>
              {diff > 0 ? '+' : ''}
              {diff}
            </Badge>
          )}
        </div>
      </div>
    );
  }

  // Handle members/users array
  const beforeMembers = normalizeMembers(before);
  const afterMembers = normalizeMembers(after);

  const added = afterMembers.filter(
    (m) => !beforeMembers.some((bm) => bm.id === m.id || bm.email === m.email),
  );
  const removed = beforeMembers.filter(
    (m) => !afterMembers.some((am) => am.id === m.id || am.email === m.email),
  );

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4" />
        <span className="font-medium text-sm">Members</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>

      <div className="space-y-1">
        {removed.map((member, i) => (
          <div
            key={`removed-${i}`}
            className="flex items-center gap-2 rounded bg-red-50 px-2 py-1 dark:bg-red-950/20"
          >
            <Minus className="h-3 w-3 text-red-600" />
            <span className="text-xs text-red-700 line-through dark:text-red-400">
              {member.email || member.name || member.id}
            </span>
          </div>
        ))}
        {added.map((member, i) => (
          <div
            key={`added-${i}`}
            className="flex items-center gap-2 rounded bg-green-50 px-2 py-1 dark:bg-green-950/20"
          >
            <Plus className="h-3 w-3 text-green-600" />
            <span className="text-xs text-green-700 dark:text-green-400">
              {member.email || member.name || member.id}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface NormalizedMember {
  id?: string;
  email?: string;
  name?: string;
}

function normalizeMembers(value: unknown): NormalizedMember[] {
  if (!value) return [];
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (typeof item === 'string') {
      return { email: item };
    }
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      return {
        id: obj.id as string | undefined,
        email: obj.email as string | undefined,
        name: obj.name as string | undefined,
      };
    }
    return { id: String(item) };
  });
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

function RoleSnapshotView({
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
          <RoleSnapshot role={before} />
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
          <RoleSnapshot role={after} />
        </div>
      )}
    </div>
  );
}

function RoleSnapshot({ role }: { role: Record<string, unknown> }) {
  const name = role.name as string | undefined;
  const isAdmin = role.isAdmin as boolean | undefined;
  const permissions = normalizePermissions(role.permissions);

  return (
    <div className="space-y-2 rounded-md bg-muted p-3">
      {name && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Name:</span>
          <span className="font-medium">{name}</span>
        </div>
      )}
      {isAdmin !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Type:</span>
          <AdminBadge isAdmin={isAdmin} variant="after" />
        </div>
      )}
      {permissions.length > 0 && (
        <div>
          <span className="text-sm text-muted-foreground">Permissions ({permissions.length}):</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {permissions.slice(0, 6).map((perm, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {formatPermission(perm)}
              </Badge>
            ))}
            {permissions.length > 6 && (
              <span className="text-xs text-muted-foreground">+{permissions.length - 6} more</span>
            )}
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
  // Convert camelCase/snake_case to Title Case
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+/, '')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
