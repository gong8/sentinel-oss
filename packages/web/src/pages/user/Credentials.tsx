import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { ErrorAlert } from '../../components/admin/ErrorAlert';
import { KeyValueEditor } from '../../components/credentials/KeyValueEditor';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { UserLayout } from '../../components/layout/UserLayout';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import { Switch } from '../../components/ui/switch';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import {
  buildCredentialsPayload,
  entriesFromObject,
  entriesToObject,
  splitCredentials,
  type CredentialEntry,
} from '../../lib/credentials';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required.'),
});

type ApiKeyValues = z.infer<typeof apiKeySchema>;

export default function UserCredentials() {
  const utils = trpc.useUtils();
  const { selectedWorkspaceSlug, isGlobalView } = useWorkspace();

  // Build user prefix for routes
  const userPrefix = useMemo(() => {
    if (isGlobalView) return '/global/user';
    if (selectedWorkspaceSlug) return `/user/${selectedWorkspaceSlug}`;
    return '/user';
  }, [selectedWorkspaceSlug, isGlobalView]);

  const serversQuery = trpc.user.mcpServers.list.useQuery();
  type McpServer = NonNullable<typeof serversQuery.data>[number];
  const apiKeyMutation = trpc.user.mcpServers.submitApiKey.useMutation({
    onSuccess: (data) => {
      utils.user.mcpServers.list.invalidate();
      // Show discovery feedback if tools were discovered
      if (data.toolsDiscovered !== undefined && data.toolsDiscovered > 0) {
        setDiscoveryFeedback({
          success: true,
          toolsDiscovered: data.toolsDiscovered,
        });
      } else if (data.discoveryError) {
        setDiscoveryFeedback({
          success: false,
          error: data.discoveryError,
        });
      }
    },
  });
  const credentialsMutation = trpc.user.mcpServers.submitCredentials.useMutation({
    onSuccess: (data) => {
      utils.user.mcpServers.list.invalidate();
      // Show discovery feedback if tools were discovered
      if (data.toolsDiscovered !== undefined && data.toolsDiscovered > 0) {
        setDiscoveryFeedback({
          success: true,
          toolsDiscovered: data.toolsDiscovered,
        });
      } else if ('discoveryError' in data && data.discoveryError) {
        setDiscoveryFeedback({
          success: false,
          error: data.discoveryError,
        });
      }
    },
  });
  const disconnectMutation = trpc.user.mcpServers.disconnect.useMutation({
    onSuccess: () => utils.user.mcpServers.list.invalidate(),
  });

  const [editingApiKeyServer, setEditingApiKeyServer] = useState<McpServer | null>(null);
  const [editingCredentialsServer, setEditingCredentialsServer] = useState<McpServer | null>(null);
  const [disconnectConfirm, setDisconnectConfirm] = useState<McpServer | null>(null);

  const [credentialEntries, setCredentialEntries] = useState<CredentialEntry[]>([]);
  const [headerEntries, setHeaderEntries] = useState<CredentialEntry[]>([]);
  const [injectIntoToolParams, setInjectIntoToolParams] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);
  const [overrideConflicts, setOverrideConflicts] = useState<string[] | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const activeCredentialServerId = useRef<string | null>(null);
  const [discoveryFeedback, setDiscoveryFeedback] = useState<{
    success: boolean;
    toolsDiscovered?: number;
    error?: string;
  } | null>(null);
  const [refreshTokenFeedback, setRefreshTokenFeedback] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    serverId: string;
    connected: boolean;
    expiresAt?: string;
    error?: string;
  } | null>(null);
  const [checkingConnectionId, setCheckingConnectionId] = useState<string | null>(null);

  const initiateOAuthMutation = trpc.user.mcpServers.initiateOAuth.useMutation({
    onSuccess: (result) => {
      if (result.authorizationUrl) {
        window.open(result.authorizationUrl, '_blank');
      }
    },
  });
  const refreshOAuthTokenMutation = trpc.user.mcpServers.refreshOAuthToken.useMutation({
    onSuccess: () => {
      utils.user.mcpServers.list.invalidate();
      setRefreshTokenFeedback({ success: true });
    },
    onError: (error) => {
      setRefreshTokenFeedback({ success: false, error: error.message });
    },
  });

  const checkConnectionStatus = async (serverId: string) => {
    setCheckingConnectionId(serverId);
    setConnectionStatus(null);
    try {
      const status = await utils.user.mcpServers.getConnectionStatus.fetch({
        mcpServerId: serverId,
      });
      setConnectionStatus({
        serverId,
        connected: status.connected,
        expiresAt: status.expiresAt ?? undefined,
      });
    } catch (error) {
      setConnectionStatus({
        serverId,
        connected: false,
        error: error instanceof Error ? error.message : 'Failed to check connection',
      });
    } finally {
      setCheckingConnectionId(null);
    }
  };

  // Handle OAuth success message from callback tab
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_SUCCESS') {
        utils.user.mcpServers.list.invalidate();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [utils]);

  const form = useForm<ApiKeyValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      apiKey: '',
    },
  });

  const openCredentialsEditor = (server: McpServer) => {
    activeCredentialServerId.current = server.id;
    setEditingCredentialsServer(server);
    setCredentialEntries([]);
    setHeaderEntries([]);
    setInjectIntoToolParams(false);
    setEditorError(null);
    setOverrideConflicts(null);
    setPendingPayload(null);
    setIsLoadingCredentials(true);

    void utils.user.mcpServers.getCredentials
      .fetch({ mcpServerId: server.id })
      .then((data) => {
        if (activeCredentialServerId.current !== server.id) return;
        const { fields, headers, injectIntoToolParams } = splitCredentials(
          data.credentials ?? null,
        );
        setCredentialEntries(entriesFromObject(fields));
        setHeaderEntries(entriesFromObject(headers));
        setInjectIntoToolParams(injectIntoToolParams);
      })
      .catch((error) => {
        if (activeCredentialServerId.current !== server.id) return;
        setEditorError(error?.message || 'Failed to load credentials.');
      })
      .finally(() => {
        if (activeCredentialServerId.current !== server.id) return;
        setIsLoadingCredentials(false);
      });
  };

  const closeCredentialsEditor = () => {
    activeCredentialServerId.current = null;
    setEditingCredentialsServer(null);
    setCredentialEntries([]);
    setHeaderEntries([]);
    setInjectIntoToolParams(false);
    setEditorError(null);
    setOverrideConflicts(null);
    setPendingPayload(null);
    setIsLoadingCredentials(false);
  };

  const submitApiKey = form.handleSubmit((values) => {
    if (!editingApiKeyServer) return;
    const trimmedApiKey = values.apiKey?.trim();

    apiKeyMutation.mutate(
      { mcpServerId: editingApiKeyServer.id, apiKey: trimmedApiKey },
      {
        onSuccess: () => {
          setEditingApiKeyServer(null);
          form.reset();
        },
        onError: (error) => {
          form.setError('apiKey', {
            type: 'server',
            message: error.message || 'API key validation failed.',
          });
        },
      },
    );
  });

  const handleDisconnect = (server: McpServer) => {
    setDisconnectConfirm(server);
  };

  const confirmDisconnect = () => {
    if (!disconnectConfirm) return;
    disconnectMutation.mutate(
      { mcpServerId: disconnectConfirm.id },
      {
        onSuccess: () => {
          setDisconnectConfirm(null);
        },
      },
    );
  };

  const handleSaveCredentials = () => {
    if (!editingCredentialsServer) return;

    const fieldResult = entriesToObject(credentialEntries, {
      reservedKeys: ['_sentinel', 'headers'],
    });
    const headerResult = entriesToObject(headerEntries);
    const combinedErrors = [...fieldResult.errors, ...headerResult.errors];

    if (combinedErrors.length > 0) {
      setEditorError(combinedErrors[0]);
      return;
    }

    const isEmpty =
      Object.keys(fieldResult.value).length === 0 && Object.keys(headerResult.value).length === 0;

    const payload = isEmpty
      ? null
      : buildCredentialsPayload({
          fields: fieldResult.value,
          headers: headerResult.value,
          injectIntoToolParams,
        });

    setEditorError(null);

    credentialsMutation.mutate(
      {
        mcpServerId: editingCredentialsServer.id,
        credentials: payload,
      },
      {
        onSuccess: (result) => {
          if (result.overrideRequired) {
            if ('conflicts' in result) {
              setOverrideConflicts(result.conflicts);
            } else {
              setOverrideConflicts([]);
            }
            setPendingPayload(payload);
            return;
          }

          closeCredentialsEditor();
        },
        onError: (error) => {
          setEditorError(error.message || 'Credential validation failed.');
        },
      },
    );
  };

  const confirmOverride = () => {
    if (!editingCredentialsServer || !pendingPayload) {
      setOverrideConflicts(null);
      return;
    }

    credentialsMutation.mutate(
      {
        mcpServerId: editingCredentialsServer.id,
        credentials: pendingPayload,
        forceOverride: true,
      },
      {
        onSuccess: () => {
          closeCredentialsEditor();
        },
        onError: (error) => {
          setEditorError(error.message || 'Credential validation failed.');
          setOverrideConflicts(null);
        },
      },
    );
  };

  const handleClearCredentials = () => {
    if (!editingCredentialsServer) return;
    credentialsMutation.mutate(
      {
        mcpServerId: editingCredentialsServer.id,
        credentials: null,
      },
      {
        onSuccess: () => {
          closeCredentialsEditor();
        },
        onError: (error) => {
          setEditorError(error.message || 'Failed to clear credentials.');
        },
      },
    );
  };

  const errors = useMemo(() => {
    const allErrors = [
      serversQuery.error,
      apiKeyMutation.error,
      disconnectMutation.error,
      initiateOAuthMutation.error,
      credentialsMutation.error,
      refreshOAuthTokenMutation.error,
    ];
    const result: Array<{ message: string }> = [];
    for (const e of allErrors) {
      if (e) result.push({ message: e.message });
    }
    return result;
  }, [
    serversQuery.error,
    apiKeyMutation.error,
    disconnectMutation.error,
    initiateOAuthMutation.error,
    credentialsMutation.error,
    refreshOAuthTokenMutation.error,
  ]);

  const apiKeyServers = useMemo(
    () => serversQuery.data?.filter((server) => server.authType === 'API_KEY') ?? [],
    [serversQuery.data],
  );

  const oauthServers = useMemo(
    () => serversQuery.data?.filter((server) => server.authType === 'OAUTH') ?? [],
    [serversQuery.data],
  );

  return (
    <UserLayout>
      <div className="space-y-8">
        <PageHeader
          title="My Credentials"
          description="Manage personal API keys, OAuth connections, and JSON credentials for MCP servers."
        />

        <ErrorAlert title="Failed to load credentials" errors={errors} />

        {discoveryFeedback ? (
          <Alert
            variant={discoveryFeedback.success ? 'default' : 'destructive'}
            className="cursor-pointer"
            onClick={() => setDiscoveryFeedback(null)}
          >
            <AlertTitle>Tool discovery</AlertTitle>
            <AlertDescription>
              {discoveryFeedback.success
                ? `Discovered ${discoveryFeedback.toolsDiscovered} tools from the server.`
                : (discoveryFeedback.error ?? 'Tool discovery failed.')}
            </AlertDescription>
          </Alert>
        ) : null}

        {refreshTokenFeedback ? (
          <Alert
            variant={refreshTokenFeedback.success ? 'default' : 'destructive'}
            className="cursor-pointer"
            onClick={() => setRefreshTokenFeedback(null)}
          >
            <AlertTitle>Token refresh</AlertTitle>
            <AlertDescription>
              {refreshTokenFeedback.success
                ? 'OAuth token refreshed successfully.'
                : (refreshTokenFeedback.error ?? 'Token refresh failed.')}
            </AlertDescription>
          </Alert>
        ) : null}

        {connectionStatus ? (
          <Alert
            variant={connectionStatus.connected ? 'default' : 'destructive'}
            className="cursor-pointer"
            onClick={() => setConnectionStatus(null)}
          >
            <AlertTitle>Connection status</AlertTitle>
            <AlertDescription>
              {connectionStatus.connected
                ? connectionStatus.expiresAt
                  ? `Connected. Token expires ${formatDateTime(connectionStatus.expiresAt)}`
                  : 'Connected successfully'
                : (connectionStatus.error ?? 'Connection failed')}
            </AlertDescription>
          </Alert>
        ) : null}

        <ConfirmDialog
          open={Boolean(disconnectConfirm)}
          onOpenChange={() => setDisconnectConfirm(null)}
          title="Disconnect MCP server"
          description={`Remove your stored credentials for "${disconnectConfirm?.name ?? ''}"? Organization-level credentials will remain available.`}
          isLoading={disconnectMutation.isPending}
          onConfirm={confirmDisconnect}
          confirmText="Disconnect"
          loadingText="Disconnecting..."
          confirmVariant="destructive"
        />

        <Card>
          <CardHeader>
            <CardTitle>API Key Servers</CardTitle>
            <CardDescription>
              Add personal API keys for servers requiring API key authentication.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serversQuery.isPending ? (
              <TableSkeleton />
            ) : apiKeyServers.length > 0 ? (
              <div className="divide-y">
                <div className="flex items-center py-2 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <div className="w-48 flex-shrink-0">Server</div>
                  <div className="w-32 flex-shrink-0">User Key</div>
                  <div className="w-32 flex-shrink-0">Org Key</div>
                  <div className="w-24 flex-shrink-0">Updated</div>
                  <div className="flex-1 text-right">Actions</div>
                </div>
                {apiKeyServers.map((server) => (
                  <div key={server.id} className="flex items-center py-3 gap-4">
                    <div className="w-48 flex-shrink-0 font-medium truncate">{server.name}</div>
                    <div className="w-32 flex-shrink-0 text-sm text-muted-foreground font-mono">
                      {server.userApiKeyHint || (server.hasUserApiKey ? 'Configured' : 'None')}
                    </div>
                    <div className="w-32 flex-shrink-0 text-sm text-muted-foreground font-mono">
                      {server.orgApiKeyHint || (server.hasOrgApiKey ? 'Configured' : 'None')}
                    </div>
                    <div className="w-24 flex-shrink-0 text-sm text-muted-foreground">
                      {formatDateTime(server.authenticatedAt)}
                    </div>
                    <div className="flex-1 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingApiKeyServer(server);
                          form.reset({ apiKey: '' });
                        }}
                      >
                        {server.hasUserApiKey ? 'Update' : 'Add'} Key
                      </Button>
                      {server.hasUserApiKey ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(server)}
                          className="text-destructive hover:text-destructive"
                        >
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No API key servers"
                description="No MCP servers are configured to use API key authentication."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OAuth Servers</CardTitle>
            <CardDescription>Connect OAuth accounts for supported MCP servers.</CardDescription>
          </CardHeader>
          <CardContent>
            {serversQuery.isPending ? (
              <TableSkeleton />
            ) : oauthServers.length > 0 ? (
              <div className="divide-y">
                <div className="flex items-center py-2 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <div className="w-48 flex-shrink-0">Server</div>
                  <div className="w-32 flex-shrink-0">Status</div>
                  <div className="w-24 flex-shrink-0">Updated</div>
                  <div className="flex-1 text-right">Actions</div>
                </div>
                {oauthServers.map((server) => (
                  <div key={server.id} className="flex items-center py-3 gap-4">
                    <div className="w-48 flex-shrink-0 font-medium truncate">{server.name}</div>
                    <div className="w-32 flex-shrink-0 text-sm text-muted-foreground">
                      {server.hasUserOAuth
                        ? server.hasOrgOAuth
                          ? 'Overriding org'
                          : 'Connected'
                        : server.hasOrgOAuth
                          ? 'Using org'
                          : 'Not connected'}
                    </div>
                    <div className="w-24 flex-shrink-0 text-sm text-muted-foreground">
                      {formatDateTime(server.authenticatedAt)}
                    </div>
                    <div className="flex-1 flex justify-end gap-2">
                      {(server.hasUserOAuth || server.hasOrgOAuth) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => checkConnectionStatus(server.id)}
                            disabled={checkingConnectionId === server.id}
                            title="Check connection status"
                          >
                            {checkingConnectionId === server.id ? 'Checking...' : 'Check'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              refreshOAuthTokenMutation.mutate({ mcpServerId: server.id })
                            }
                            disabled={refreshOAuthTokenMutation.isPending}
                          >
                            {refreshOAuthTokenMutation.isPending ? 'Refreshing...' : 'Refresh'}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          initiateOAuthMutation.mutate({
                            mcpServerId: server.id,
                            returnUrl: `${userPrefix}/credentials`,
                          })
                        }
                        disabled={initiateOAuthMutation.isPending}
                      >
                        {server.hasUserOAuth ? 'Reconnect' : 'Connect'}
                      </Button>
                      {server.hasUserOAuth ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(server)}
                          className="text-destructive hover:text-destructive"
                        >
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No OAuth servers"
                description="No MCP servers are configured to use OAuth authentication."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Advanced JSON Credentials</CardTitle>
            <CardDescription>
              Store JSON credentials that are merged with organization defaults when available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serversQuery.isPending ? (
              <TableSkeleton />
            ) : serversQuery.data && serversQuery.data.length > 0 ? (
              <div className="divide-y">
                <div className="flex items-center py-2 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <div className="w-48 flex-shrink-0">Server</div>
                  <div className="w-32 flex-shrink-0">User JSON</div>
                  <div className="w-32 flex-shrink-0">Org JSON</div>
                  <div className="w-24 flex-shrink-0">Updated</div>
                  <div className="flex-1 text-right">Actions</div>
                </div>
                {serversQuery.data.map((server) => (
                  <div key={server.id} className="flex items-center py-3 gap-4">
                    <div className="w-48 flex-shrink-0 font-medium truncate">{server.name}</div>
                    <div className="w-32 flex-shrink-0 text-sm text-muted-foreground">
                      {server.hasUserCredentials ? 'Configured' : 'None'}
                    </div>
                    <div className="w-32 flex-shrink-0 text-sm text-muted-foreground">
                      {server.hasOrgCredentials ? 'Configured' : 'None'}
                    </div>
                    <div className="w-24 flex-shrink-0 text-sm text-muted-foreground">
                      {formatDateTime(server.authenticatedAt)}
                    </div>
                    <div className="flex-1 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCredentialsEditor(server)}
                      >
                        {server.hasUserCredentials ? 'Update' : 'Add'} JSON
                      </Button>
                      {server.hasUserCredentials ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(server)}
                          className="text-destructive hover:text-destructive"
                        >
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No MCP servers"
                description="Ask your admin to configure MCP servers before adding credentials."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editingApiKeyServer)} onOpenChange={() => setEditingApiKeyServer(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingApiKeyServer?.hasUserApiKey ? 'Update' : 'Add'} API Key
            </DialogTitle>
            <DialogDescription>
              {editingApiKeyServer?.hasUserApiKey
                ? `Update your API key for ${editingApiKeyServer.name}.`
                : `Add a personal API key for ${editingApiKeyServer?.name}.`}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={submitApiKey}>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                placeholder="Enter API key"
                className="font-mono text-sm"
                {...form.register('apiKey')}
              />
              {form.formState.errors.apiKey ? (
                <p className="text-xs text-destructive">{form.formState.errors.apiKey.message}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                This key is encrypted at rest and never shared with other users.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingApiKeyServer(null)}
                disabled={apiKeyMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={apiKeyMutation.isPending}>
                {apiKeyMutation.isPending ? 'Saving...' : 'Save API key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCredentialsServer)} onOpenChange={closeCredentialsEditor}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Advanced credentials</DialogTitle>
            <DialogDescription>
              Provide JSON credentials for {editingCredentialsServer?.name}. Credentials are
              encrypted at rest and never shared with other users.
            </DialogDescription>
          </DialogHeader>

          {isLoadingCredentials ? (
            <div className="space-y-3">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="h-20 w-full rounded bg-muted" />
            </div>
          ) : (
            <div className="space-y-6">
              <KeyValueEditor
                entries={credentialEntries}
                onChange={setCredentialEntries}
                title="Credential fields"
                description="Add key-value pairs required by the MCP server."
                emptyLabel="No credential fields added yet."
                addLabel="Add credential field"
              />

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold">Tool parameter injection</h4>
                    <p className="text-xs text-muted-foreground">
                      When enabled, credential fields are merged into every tool call. Disable if
                      your MCP server uses strict schemas.
                    </p>
                  </div>
                  <Switch
                    checked={injectIntoToolParams}
                    onCheckedChange={setInjectIntoToolParams}
                  />
                </div>
              </div>

              <Separator />

              <KeyValueEditor
                entries={headerEntries}
                onChange={setHeaderEntries}
                title="Custom headers"
                description="Optional HTTP headers sent with MCP requests. Useful for multi-key auth."
                emptyLabel="No custom headers configured."
                addLabel="Add header"
              />
            </div>
          )}

          {editorError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to save credentials</AlertTitle>
              <AlertDescription>{editorError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeCredentialsEditor}
              disabled={credentialsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearCredentials}
              disabled={credentialsMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              Clear JSON
            </Button>
            <Button
              type="button"
              onClick={handleSaveCredentials}
              disabled={credentialsMutation.isPending}
            >
              {credentialsMutation.isPending ? 'Saving...' : 'Save credentials'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(overrideConflicts)} onOpenChange={() => setOverrideConflicts(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Override organization credentials?</DialogTitle>
            <DialogDescription>
              You are about to override organization-level credential keys. Confirm you want to
              proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {overrideConflicts?.length
              ? overrideConflicts.join(', ')
              : 'Some credential keys overlap with organization defaults.'}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOverrideConflicts(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmOverride}>
              Yes, override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
}
