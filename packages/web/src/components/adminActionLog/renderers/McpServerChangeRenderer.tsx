/**
 * McpServerChangeRenderer Component
 * Specialized renderer for MCP_SERVER resource changes
 * Shows URL, auth config, tools list diff
 */

import { ArrowRight, Key, Link, Minus, Plus, Server, Wrench } from 'lucide-react';

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

interface McpServerChangeRendererProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

export function McpServerChangeRenderer({
  changeDiff,
  beforeSnapshot,
  afterSnapshot,
}: McpServerChangeRendererProps) {
  // If we have a computed diff, use specialized rendering
  if (changeDiff && Object.keys(changeDiff).length > 0) {
    return <McpServerDiffView changeDiff={changeDiff} />;
  }

  // Otherwise, try to extract from snapshots
  const before = beforeSnapshot as Record<string, unknown> | undefined;
  const after = afterSnapshot as Record<string, unknown> | undefined;

  if (!before && !after) {
    return <p className="text-sm text-muted-foreground">No MCP server change details available.</p>;
  }

  return <McpServerSnapshotView before={before} after={after} />;
}

function McpServerDiffView({ changeDiff }: { changeDiff: ChangeDiff }) {
  // Priority fields to show at top
  const priorityFields = ['name', 'url', 'enabled', 'authType', 'tools', 'discoveredTools'];

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
        // Render URL changes with special styling
        if (field === 'url' || field === 'baseUrl') {
          return <UrlChangeRow key={field} change={change} />;
        }

        // Render auth type changes
        if (field === 'authType' || field === 'authenticationType') {
          return <AuthTypeChangeRow key={field} change={change} />;
        }

        // Render tools list with specialized view
        if (field === 'tools' || field === 'discoveredTools') {
          return <ToolsChangeRow key={field} field={field} change={change} />;
        }

        // Render enabled toggle
        if (field === 'enabled') {
          return <EnabledChangeRow key={field} change={change} />;
        }

        // Render config changes (may contain sensitive data)
        if (field === 'config' || field === 'authConfig') {
          return <ConfigChangeRow key={field} field={field} change={change} />;
        }

        // Default rendering for other fields
        return <GenericFieldRow key={field} field={field} change={change} />;
      })}
    </div>
  );
}

function UrlChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Link className="h-4 w-4" />
        <span className="font-medium text-sm">Server URL</span>
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

function AuthTypeChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Key className="h-4 w-4" />
        <span className="font-medium text-sm">Authentication Type</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="flex items-center gap-3">
        {changeType !== 'added' && <AuthTypeBadge type={before as string} variant="before" />}
        {changeType === 'modified' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        {changeType !== 'removed' && <AuthTypeBadge type={after as string} variant="after" />}
      </div>
    </div>
  );
}

function AuthTypeBadge({ type, variant }: { type: string; variant: 'before' | 'after' }) {
  const label = formatAuthType(type);
  const className = variant === 'before' ? 'opacity-50 line-through' : '';

  return (
    <Badge variant="outline" className={className}>
      <Key className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}

function formatAuthType(type: string): string {
  switch (type?.toUpperCase()) {
    case 'NONE':
      return 'No Auth';
    case 'API_KEY':
      return 'API Key';
    case 'BEARER':
      return 'Bearer Token';
    case 'BASIC':
      return 'Basic Auth';
    case 'OAUTH':
      return 'OAuth';
    default:
      return type || 'Unknown';
  }
}

function ToolsChangeRow({ field, change }: { field: string; change: FieldChange }) {
  const { before, after, changeType } = change;

  // Normalize tools to array of names
  const beforeTools = normalizeTools(before);
  const afterTools = normalizeTools(after);

  // Calculate added and removed tools
  const added = afterTools.filter((t) => !beforeTools.includes(t));
  const removed = beforeTools.filter((t) => !afterTools.includes(t));
  const unchanged = afterTools.filter((t) => beforeTools.includes(t));

  const fieldLabel = field === 'discoveredTools' ? 'Discovered Tools' : 'Tools';

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Wrench className="h-4 w-4" />
        <span className="font-medium text-sm">{fieldLabel}</span>
        <ChangeTypeBadge changeType={changeType} />
        <span className="text-xs text-muted-foreground">({afterTools.length} total)</span>
      </div>

      <div className="space-y-1">
        {removed.map((tool, i) => (
          <div
            key={`removed-${i}`}
            className="flex items-center gap-2 rounded bg-red-50 px-2 py-1 dark:bg-red-950/20"
          >
            <Minus className="h-3 w-3 text-red-600" />
            <code className="text-xs text-red-700 line-through dark:text-red-400">{tool}</code>
          </div>
        ))}
        {added.map((tool, i) => (
          <div
            key={`added-${i}`}
            className="flex items-center gap-2 rounded bg-green-50 px-2 py-1 dark:bg-green-950/20"
          >
            <Plus className="h-3 w-3 text-green-600" />
            <code className="text-xs text-green-700 dark:text-green-400">{tool}</code>
          </div>
        ))}
        {unchanged.length > 0 && (added.length > 0 || removed.length > 0) && (
          <div className="mt-2 text-xs text-muted-foreground">
            {unchanged.length} tool{unchanged.length !== 1 ? 's' : ''} unchanged
          </div>
        )}
        {unchanged.length > 0 && added.length === 0 && removed.length === 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {unchanged.slice(0, 10).map((tool, i) => (
              <Badge key={`unchanged-${i}`} variant="secondary" className="text-xs font-mono">
                {tool}
              </Badge>
            ))}
            {unchanged.length > 10 && (
              <span className="text-xs text-muted-foreground">+{unchanged.length - 10} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeTools(value: unknown): string[] {
  if (!value) return [];
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      return (obj.name as string) || (obj.toolName as string) || JSON.stringify(item);
    }
    return String(item);
  });
}

function EnabledChangeRow({ change }: { change: FieldChange }) {
  const { before, after, changeType } = change;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Server className="h-4 w-4" />
        <span className="font-medium text-sm">Server Status</span>
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

function ConfigChangeRow({ field, change }: { field: string; change: FieldChange }) {
  const { changeType } = change;
  const fieldLabel = field === 'authConfig' ? 'Authentication Config' : 'Configuration';

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Key className="h-4 w-4" />
        <span className="font-medium text-sm">{fieldLabel}</span>
        <ChangeTypeBadge changeType={changeType} />
      </div>
      <div className="text-sm text-muted-foreground italic">
        (Configuration details hidden for security)
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

function McpServerSnapshotView({
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
          <McpServerSnapshot server={before} />
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
          <McpServerSnapshot server={after} />
        </div>
      )}
    </div>
  );
}

function McpServerSnapshot({ server }: { server: Record<string, unknown> }) {
  const url = server.url as string | undefined;
  const enabled = server.enabled as boolean | undefined;
  const authType = server.authType as string | undefined;
  const tools = normalizeTools(server.tools || server.discoveredTools);

  return (
    <div className="space-y-2 rounded-md bg-muted p-3">
      {url && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">URL:</span>
          <code className="text-xs">{url}</code>
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
      {authType && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Auth:</span>
          <Badge variant="outline">{formatAuthType(authType)}</Badge>
        </div>
      )}
      {tools.length > 0 && (
        <div>
          <span className="text-sm text-muted-foreground">Tools ({tools.length}):</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {tools.slice(0, 8).map((tool, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-mono">
                {tool}
              </Badge>
            ))}
            {tools.length > 8 && (
              <span className="text-xs text-muted-foreground">+{tools.length - 8} more</span>
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
