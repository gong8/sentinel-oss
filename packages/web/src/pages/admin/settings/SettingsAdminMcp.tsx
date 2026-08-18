/**
 * Admin MCP Settings Page
 *
 * Configure Admin MCP Server settings:
 * - Enable/disable Admin MCP
 * - Select enabled scopes
 * - Configure allowed admins
 * - Set rate limits and confirmation TTL
 */

import { useMemo, useState } from 'react';

import { ErrorAlert } from '../../../components/admin';
import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import { SettingsCard, SettingsItem } from '../../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { useMutationErrors } from '../../../hooks/useMutationErrors';
import { getRiskBadgeVariant } from '../../../lib/statusUtils';
import { trpc } from '../../../lib/trpc';

// Scope metadata (matches API types)
const SCOPE_METADATA: Record<
  string,
  { label: string; description: string; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' }
> = {
  POLICIES: {
    label: 'Policy Management',
    description: 'Create, modify, and delete access control policies',
    riskLevel: 'MEDIUM',
  },
  USERS: {
    label: 'User Management',
    description: 'Create, modify, and delete users and manage tokens',
    riskLevel: 'HIGH',
  },
  ROLES: {
    label: 'Role Management',
    description: 'Create, modify, and delete roles',
    riskLevel: 'HIGH',
  },
  MCP_SERVERS: {
    label: 'MCP Server Management',
    description: 'Register, configure, and manage MCP servers',
    riskLevel: 'HIGH',
  },
  AGENTS: {
    label: 'Agent Management',
    description: 'Register and manage agents',
    riskLevel: 'MEDIUM',
  },
  SENSITIVE_FLAGS: {
    label: 'Sensitive Tool Flags',
    description: 'Configure sensitive tool flags and manage approvals',
    riskLevel: 'MEDIUM',
  },
  WEBHOOKS: {
    label: 'Webhook Management',
    description: 'Configure webhook endpoints',
    riskLevel: 'LOW',
  },
  PERMISSION_REQUESTS: {
    label: 'Permission Requests',
    description: 'Review and manage permission requests',
    riskLevel: 'MEDIUM',
  },
  ANALYTICS: {
    label: 'Analytics',
    description: 'View usage statistics and analytics',
    riskLevel: 'LOW',
  },
  AUDIT: {
    label: 'Audit Logs',
    description: 'Query and view audit logs',
    riskLevel: 'LOW',
  },
};

const ALL_SCOPES = Object.keys(SCOPE_METADATA);

export default function SettingsAdminMcp() {
  const utils = trpc.useUtils();

  // Fetch current settings
  const settingsQuery = trpc.admin.adminMcpSettings.get.useQuery();
  const adminUsersQuery = trpc.admin.adminMcpSettings.getAdminUsers.useQuery();

  // Draft state
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [draftScopes, setDraftScopes] = useState<string[] | null>(null);
  const [draftAllowedAdmins, setDraftAllowedAdmins] = useState<string[] | null>(null);
  const [draftRateLimit, setDraftRateLimit] = useState<number | null>(null);
  const [draftConfirmationTtl, setDraftConfirmationTtl] = useState<number | null>(null);
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');

  // Mutation
  const updateMutation = trpc.admin.adminMcpSettings.update.useMutation({
    onSuccess: () => {
      utils.admin.adminMcpSettings.get.invalidate();
      resetDraft();
    },
  });

  // Error handling
  const errors = useMutationErrors([settingsQuery, adminUsersQuery]);

  // Get actual values (draft or fetched)
  const enabled = draftEnabled ?? settingsQuery.data?.enabled ?? false;
  const enabledScopes = draftScopes ?? settingsQuery.data?.enabledScopes ?? [];
  const allowedAdmins = useMemo(
    () => draftAllowedAdmins ?? settingsQuery.data?.allowedAdmins ?? [],
    [draftAllowedAdmins, settingsQuery.data?.allowedAdmins],
  );
  const rateLimitPerMin = draftRateLimit ?? settingsQuery.data?.rateLimitPerMin ?? 60;
  const confirmationTtlSeconds =
    draftConfirmationTtl ?? settingsQuery.data?.confirmationTtlSeconds ?? 300;

  // Check for changes
  const hasChanges = useMemo(() => {
    if (!settingsQuery.data) return false;
    return (
      draftEnabled !== null ||
      draftScopes !== null ||
      draftAllowedAdmins !== null ||
      draftRateLimit !== null ||
      draftConfirmationTtl !== null
    );
  }, [
    draftEnabled,
    draftScopes,
    draftAllowedAdmins,
    draftRateLimit,
    draftConfirmationTtl,
    settingsQuery.data,
  ]);

  // Get admin users from query
  const adminUsers = useMemo(() => {
    return adminUsersQuery.data ?? [];
  }, [adminUsersQuery.data]);

  // Get allowed admin details
  const allowedAdminDetails = useMemo(() => {
    if (!adminUsersQuery.data) return [];
    return allowedAdmins
      .map((id) => adminUsersQuery.data?.find((u) => u.id === id))
      .filter((u): u is { id: string; email: string } => u !== undefined);
  }, [allowedAdmins, adminUsersQuery.data]);

  function resetDraft() {
    setDraftEnabled(null);
    setDraftScopes(null);
    setDraftAllowedAdmins(null);
    setDraftRateLimit(null);
    setDraftConfirmationTtl(null);
  }

  function handleToggleEnabled(checked: boolean) {
    setDraftEnabled(checked);
  }

  function handleToggleScope(scope: string) {
    const currentScopes = draftScopes ?? settingsQuery.data?.enabledScopes ?? [];
    const isEnabled = currentScopes.includes(scope);
    const newScopes = isEnabled
      ? currentScopes.filter((s) => s !== scope)
      : [...currentScopes, scope];
    setDraftScopes(newScopes);
  }

  function handleSelectAllScopes() {
    setDraftScopes([...ALL_SCOPES]);
  }

  function handleDeselectAllScopes() {
    setDraftScopes([]);
  }

  function handleAddAdmin() {
    if (!selectedAdminId) return;
    const currentAdmins = draftAllowedAdmins ?? settingsQuery.data?.allowedAdmins ?? [];
    if (!currentAdmins.includes(selectedAdminId)) {
      setDraftAllowedAdmins([...currentAdmins, selectedAdminId]);
    }
    setSelectedAdminId('');
  }

  function handleRemoveAdmin(adminId: string) {
    const currentAdmins = draftAllowedAdmins ?? settingsQuery.data?.allowedAdmins ?? [];
    setDraftAllowedAdmins(currentAdmins.filter((id) => id !== adminId));
  }

  function handleSave() {
    // Type assertion needed because draft state is string[] but mutation expects AdminMcpScope[]
    // Values are constrained by the UI, so this is safe
    type MutationInput = Parameters<typeof updateMutation.mutate>[0];
    updateMutation.mutate({
      enabled,
      enabledScopes: enabledScopes as MutationInput['enabledScopes'],
      allowedAdmins,
      rateLimitPerMin,
      confirmationTtlSeconds,
    });
  }

  if (settingsQuery.isPending || adminUsersQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        <ErrorAlert title="Failed to load settings" errors={errors} />

        {updateMutation.error && (
          <Alert variant="destructive">
            <AlertTitle>Failed to save settings</AlertTitle>
            <AlertDescription>{updateMutation.error.message}</AlertDescription>
          </Alert>
        )}

        {/* Enable/Disable */}
        <SettingsCard
          title="Admin MCP Server"
          description="Enable natural language administration via MCP clients like Cursor or Claude Code."
          actions={
            hasChanges && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetDraft}>
                  Discard
                </Button>
                <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )
          }
        >
          <SettingsItem
            label="Enable Admin MCP"
            description="Allow administrators to manage Sentinel via MCP protocol"
          >
            <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
          </SettingsItem>
        </SettingsCard>

        {/* Scopes */}
        <SettingsCard
          title="Enabled Scopes"
          description="Select which categories of tools are available via Admin MCP. Write operations in enabled scopes will require confirmation."
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleSelectAllScopes}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDeselectAllScopes}>
                Deselect All
              </Button>
            </div>
          }
        >
          <div className="space-y-1">
            {ALL_SCOPES.map((scope) => {
              const meta = SCOPE_METADATA[scope];
              const isEnabled = enabledScopes.includes(scope);
              return (
                <label
                  key={scope}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox checked={isEnabled} onCheckedChange={() => handleToggleScope(scope)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{meta.label}</span>
                      <Badge variant={getRiskBadgeVariant(meta.riskLevel)} className="text-xs">
                        {meta.riskLevel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </SettingsCard>

        {/* Allowed Admins */}
        <SettingsCard
          title="Allowed Admins"
          description="Specify which admin users can use Admin MCP. Leave empty to allow all admins."
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select an admin to add" />
                </SelectTrigger>
                <SelectContent>
                  {adminUsers
                    .filter((u) => !allowedAdmins.includes(u.id))
                    .map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddAdmin} disabled={!selectedAdminId}>
                Add
              </Button>
            </div>

            {allowedAdminDetails.length > 0 ? (
              <div className="space-y-2">
                {allowedAdminDetails.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/30"
                  >
                    <div>
                      <span className="text-sm font-medium">{admin.email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAdmin(admin.id)}
                      className="h-7 px-2 text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground px-3 py-2">
                No restrictions - all admin users can use Admin MCP.
              </p>
            )}
          </div>
        </SettingsCard>

        {/* Rate Limits */}
        <SettingsCard
          title="Rate Limits"
          description="Configure rate limits for Admin MCP operations."
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rateLimit">Operations per minute</Label>
              <Input
                id="rateLimit"
                type="number"
                min={1}
                max={1000}
                value={rateLimitPerMin}
                onChange={(e) => setDraftRateLimit(parseInt(e.target.value) || 60)}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of Admin MCP operations per minute per admin.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmationTtl">Confirmation timeout (seconds)</Label>
              <Input
                id="confirmationTtl"
                type="number"
                min={30}
                max={3600}
                value={confirmationTtlSeconds}
                onChange={(e) => setDraftConfirmationTtl(parseInt(e.target.value) || 300)}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                How long write operations wait for confirmation before expiring.
              </p>
            </div>
          </div>
        </SettingsCard>

        {/* Setup Instructions */}
        <SettingsCard
          title="Setup Instructions"
          description="Configure your MCP client to use the Admin MCP server."
        >
          <div className="space-y-4">
            <Alert variant="default">
              <AlertTitle>Context Usage Warning</AlertTitle>
              <AlertDescription>
                Admin MCP tools consume LLM context when registered. If you have many scopes
                enabled, this can use significant context in your MCP client (Cursor, Claude Code,
                etc.).
              </AlertDescription>
            </Alert>

            <Alert>
              <AlertTitle>Connection Configuration</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Add the following to your MCP client configuration:</p>
                <pre className="p-3 rounded-md bg-muted text-sm font-mono overflow-x-auto">
                  {JSON.stringify(
                    {
                      mcpServers: {
                        'sentinel-admin': {
                          url: `${window.location.origin.replace('5173', '3003')}/mcp`,
                          headers: {
                            Authorization: 'Bearer <your-access-token>',
                          },
                        },
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
                <p className="text-xs">
                  Replace &lt;your-access-token&gt; with your personal access token from the
                  Credentials page.
                </p>
              </AlertDescription>
            </Alert>
          </div>
        </SettingsCard>
      </div>
    </SettingsPageLayout>
  );
}
