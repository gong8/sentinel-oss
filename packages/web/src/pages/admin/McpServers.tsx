import { ChevronDown, ChevronRight, Globe } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { ServerFormDialog, type ServerFormValues } from '../../components/mcp/ServerFormDialog';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { DeleteConfirmDialog } from '../../components/ui/delete-confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InheritedBadge } from '../../components/ui/InheritedBadge';
import { Label } from '../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { TableActionsCell } from '../../components/ui/table-actions-cell';
import { TableLoadingState } from '../../components/ui/table-loading-state';
import { useMcpServerMutations } from '../../hooks/useMcpServerMutations';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

interface McpServerItem {
  id: string;
  name: string;
  url: string;
  authType: 'OAUTH' | 'API_KEY' | 'NONE';
  trusted: boolean;
  hasApiKey?: boolean;
  hasCredentials?: boolean;
  oauthConfigured?: boolean;
  authenticatedAt?: string | null;
  tools?: { id: string; name: string }[];
  createdAt?: string;
  updatedAt?: string;
  workspaceId?: string | null;
}

function getServers<
  T extends Array<{
    id: string;
    name: string;
    url: string;
    authType: 'OAUTH' | 'API_KEY' | 'NONE';
    trusted: boolean;
    hasApiKey?: boolean;
    hasCredentials?: boolean;
    oauthConfigured?: boolean;
    authenticatedAt?: string | null;
    tools?: { id: string; name: string }[];
    createdAt?: string;
    updatedAt?: string;
    workspaceId?: string | null;
  }>,
>(data: T | undefined): McpServerItem[] | undefined {
  return data;
}

export default function AdminMcpServers(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedWorkspaceId, selectedWorkspace, isOrgOwner, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspace?.slug) return `/admin/${selectedWorkspace.slug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspace?.slug, isGlobalView]);

  // Clear navigation state immediately after reading it
  useEffect(() => {
    if (location.state?.openCreateModal) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const serversQuery = trpc.admin.mcpServers.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const servers = getServers(serversQuery.data);
  const mutations = useMcpServerMutations({
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  // Separate global (inherited) and workspace servers
  const { globalServers, workspaceServers } = useMemo(() => {
    if (!servers) return { globalServers: [], workspaceServers: [] };
    return {
      globalServers: servers.filter((s) => s.workspaceId === null),
      workspaceServers: servers.filter((s) => s.workspaceId !== null),
    };
  }, [servers]);

  // Expand/collapse state for global servers section
  const [globalServersExpanded, setGlobalServersExpanded] = useState(true);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(() => Boolean(location.state?.openCreateModal));
  const [editingServer, setEditingServer] = useState<McpServerItem | null>(null);
  const [deleteServer, setDeleteServer] = useState<McpServerItem | null>(null);
  const [deleteWithPolicies, setDeleteWithPolicies] = useState(false);
  const [confirmDeletePolicies, setConfirmDeletePolicies] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Discovery modal state
  const [discoveryState, setDiscoveryState] = useState<{
    status: 'idle' | 'discovering' | 'success' | 'failed' | 'skipped';
    serverName?: string;
    toolsDiscovered?: number;
    error?: string;
  }>({ status: 'idle' });

  const deletionImpactQuery = trpc.admin.mcpServers.getDeletionImpact.useQuery(
    { id: deleteServer?.id || '' },
    { enabled: Boolean(deleteServer) },
  );

  const handleCreate = (values: ServerFormValues) => {
    setSubmitError(null);
    const trimmedApiKey = values.apiKey?.trim();
    const apiKeyForSubmit =
      values.authType === 'API_KEY' && trimmedApiKey ? trimmedApiKey : undefined;

    mutations.createMutation.mutate(
      {
        name: values.name,
        url: values.url,
        authType: values.authType,
        trusted: values.trusted,
        apiKey: apiKeyForSubmit,
        workspaceId: mutations.workspaceId,
      },
      {
        onSuccess: (server) => {
          setCreateOpen(false);

          // Redirect for OAuth servers to credentials page
          if (values.authType === 'OAUTH') {
            navigate(`${adminPrefix}/credentials?highlight=${server.id}&section=oauth`);
            return;
          }

          // Redirect for API_KEY servers without key
          if (values.authType === 'API_KEY' && !apiKeyForSubmit) {
            navigate(`${adminPrefix}/credentials?highlight=${server.id}&section=apikey`);
            return;
          }

          // Auto-discover tools with discovery modal
          if (values.authType !== 'API_KEY' || apiKeyForSubmit) {
            setDiscoveryState({ status: 'discovering', serverName: values.name });
            mutations.discoverMutation.mutate(
              { id: server.id, workspaceId: mutations.workspaceId },
              {
                onSuccess: (result) => {
                  setDiscoveryState({
                    status: 'success',
                    serverName: values.name,
                    toolsDiscovered: result.toolsDiscovered,
                  });
                },
                onError: (error) => {
                  setDiscoveryState({
                    status: 'failed',
                    serverName: values.name,
                    error: error.message,
                  });
                },
              },
            );
          }
        },
        onError: (error) => {
          setSubmitError(formatMutationError(error.message));
        },
      },
    );
  };

  const handleUpdate = (values: ServerFormValues) => {
    if (!editingServer) return;
    setSubmitError(null);

    const trimmedApiKey = values.apiKey?.trim();
    const apiKeyForSubmit =
      values.authType === 'API_KEY' && trimmedApiKey ? trimmedApiKey : undefined;

    mutations.updateMutation.mutate(
      {
        id: editingServer.id,
        name: values.name,
        url: values.url,
        authType: values.authType,
        trusted: values.trusted,
        ...(apiKeyForSubmit ? { apiKey: apiKeyForSubmit } : {}),
      },
      {
        onSuccess: () => setEditingServer(null),
        onError: (error) => {
          setSubmitError(formatMutationError(error.message));
        },
      },
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteServer) return;

    const hasPolicyBlockers = deletionImpactQuery.data?.blockers?.some((b) => b.type === 'policy');
    if (hasPolicyBlockers && deleteWithPolicies && !confirmDeletePolicies) {
      setConfirmDeletePolicies(true);
      return;
    }

    mutations.deleteMutation.mutate(
      { id: deleteServer.id, deleteRelatedPolicies: deleteWithPolicies },
      {
        onSuccess: () => closeDeleteDialog(),
      },
    );
  };

  const closeDeleteDialog = () => {
    setDeleteServer(null);
    setDeleteWithPolicies(false);
    setConfirmDeletePolicies(false);
  };

  const canRefreshServer = (server: McpServerItem): boolean => {
    return server.authType !== 'API_KEY' || Boolean(server.hasApiKey || server.hasCredentials);
  };

  const errors = useMemo(
    () =>
      [serversQuery.error, mutations.deleteMutation.error, mutations.discoverMutation.error].filter(
        Boolean,
      ),
    [serversQuery.error, mutations.deleteMutation.error, mutations.discoverMutation.error],
  );

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="MCP Servers"
          description="Manage MCP servers, trust settings, and tool discovery."
        />

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load MCP servers</AlertTitle>
            <AlertDescription>{errors[0]?.message}</AlertDescription>
          </Alert>
        )}

        {mutations.refreshFeedback && (
          <Alert variant={mutations.refreshFeedback.success ? 'default' : 'destructive'}>
            <AlertTitle>Tool refresh</AlertTitle>
            <AlertDescription>
              {mutations.refreshFeedback.success
                ? `${mutations.refreshFeedback.serverName}: discovered ${mutations.refreshFeedback.toolsDiscovered} tools.`
                : `${mutations.refreshFeedback.serverName}: ${mutations.refreshFeedback.error ?? 'Refresh failed.'}`}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>Add MCP server</Button>
        </div>

        {/* Content varies based on whether viewing all workspaces or a specific workspace */}
        {selectedWorkspaceId === null ? (
          /* All workspaces view - single table showing all servers */
          <Card>
            <CardHeader>
              <CardTitle>All Servers</CardTitle>
              <CardDescription>All MCP servers across the organization.</CardDescription>
            </CardHeader>
            <CardContent>
              <TableLoadingState
                isLoading={serversQuery.isPending}
                isEmpty={!servers || servers.length === 0}
                hasActiveFilters={false}
                emptyTitle="No servers yet"
                emptyDescription="Add your first MCP server to start discovery."
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Auth</TableHead>
                      <TableHead>Trusted</TableHead>
                      <TableHead>Tools</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {servers?.map((server) => (
                      <ServerTableRow
                        key={server.id}
                        server={server}
                        onEdit={() => setEditingServer(server)}
                        onDelete={() => {
                          setDeleteServer(server);
                          setDeleteWithPolicies(false);
                          setConfirmDeletePolicies(false);
                        }}
                        onRefresh={() => mutations.refreshServer(server.id, server.name)}
                        canRefresh={canRefreshServer(server)}
                        isRefreshing={mutations.refreshingServerId === server.id}
                        isAnyRefreshing={mutations.isRefreshing}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableLoadingState>
            </CardContent>
          </Card>
        ) : (
          /* Specific workspace view - split into inherited and workspace sections */
          <div className="space-y-4">
            {/* Inherited from Organization Section */}
            {globalServers.length > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setGlobalServersExpanded(!globalServersExpanded)}
                >
                  <CardHeader className="pb-3 cursor-pointer hover:bg-primary/10 transition-colors">
                    <div className="flex items-center gap-2">
                      {globalServersExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Globe className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Inherited from Organization</CardTitle>
                      <Badge variant="secondary" className="ml-2">
                        {globalServers.length}
                      </Badge>
                    </div>
                    <CardDescription className="ml-6">
                      Global MCP servers available to all workspaces (read-only)
                    </CardDescription>
                  </CardHeader>
                </button>
                {globalServersExpanded && (
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead>Auth</TableHead>
                          <TableHead>Trusted</TableHead>
                          <TableHead>Tools</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {globalServers.map((server) => (
                          <TableRow key={server.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <InheritedBadge />
                                {server.name}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{server.url}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {server.authType}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {server.trusted ? 'Trusted' : 'Untrusted'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatToolsList(server.tools)}
                            </TableCell>
                            <TableCell>{formatDateTime(server.updatedAt)}</TableCell>
                            <TableCell className="text-right">
                              {isOrgOwner ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingServer(server)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => mutations.refreshServer(server.id, server.name)}
                                    disabled={mutations.isRefreshing || !canRefreshServer(server)}
                                    title={
                                      canRefreshServer(server)
                                        ? undefined
                                        : 'Add an API key to discover tools.'
                                    }
                                  >
                                    {mutations.refreshingServerId === server.id
                                      ? 'Refreshing...'
                                      : 'Refresh'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setDeleteServer(server);
                                      setDeleteWithPolicies(false);
                                      setConfirmDeletePolicies(false);
                                    }}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => mutations.refreshServer(server.id, server.name)}
                                    disabled={mutations.isRefreshing || !canRefreshServer(server)}
                                    title={
                                      canRefreshServer(server)
                                        ? undefined
                                        : 'Add an API key to discover tools.'
                                    }
                                  >
                                    {mutations.refreshingServerId === server.id
                                      ? 'Refreshing...'
                                      : 'Refresh'}
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Workspace Servers Section */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Workspace {selectedWorkspace?.name ? `"${selectedWorkspace.name}"` : 'Servers'}
                </CardTitle>
                <CardDescription>
                  MCP servers specific to this workspace (editable).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TableLoadingState
                  isLoading={serversQuery.isPending}
                  isEmpty={workspaceServers.length === 0}
                  hasActiveFilters={false}
                  emptyTitle="No workspace servers"
                  emptyDescription="Add an MCP server specific to this workspace."
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead>Auth</TableHead>
                        <TableHead>Trusted</TableHead>
                        <TableHead>Tools</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workspaceServers.map((server) => (
                        <ServerTableRow
                          key={server.id}
                          server={server}
                          onEdit={() => setEditingServer(server)}
                          onDelete={() => {
                            setDeleteServer(server);
                            setDeleteWithPolicies(false);
                            setConfirmDeletePolicies(false);
                          }}
                          onRefresh={() => mutations.refreshServer(server.id, server.name)}
                          canRefresh={canRefreshServer(server)}
                          isRefreshing={mutations.refreshingServerId === server.id}
                          isAnyRefreshing={mutations.isRefreshing}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </TableLoadingState>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Create Dialog */}
        <ServerFormDialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setSubmitError(null);
          }}
          mode="create"
          onSubmit={handleCreate}
          isSubmitting={mutations.createMutation.isPending}
          submitError={submitError}
        />

        {/* Edit Dialog */}
        <ServerFormDialog
          open={Boolean(editingServer)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingServer(null);
              setSubmitError(null);
            }
          }}
          mode="edit"
          server={editingServer}
          onSubmit={handleUpdate}
          isSubmitting={mutations.updateMutation.isPending}
          submitError={submitError}
        />

        {/* Delete Dialog */}
        <DeleteServerDialog
          server={deleteServer}
          onClose={closeDeleteDialog}
          onConfirm={handleDeleteConfirm}
          isDeleting={mutations.deleteMutation.isPending}
          impactData={deletionImpactQuery.data}
          impactLoading={deletionImpactQuery.isPending}
          deleteWithPolicies={deleteWithPolicies}
          setDeleteWithPolicies={setDeleteWithPolicies}
          confirmDeletePolicies={confirmDeletePolicies}
          setConfirmDeletePolicies={setConfirmDeletePolicies}
        />

        {/* Discovery Modal */}
        <DiscoveryModal
          state={discoveryState}
          onClose={() => setDiscoveryState({ status: 'idle' })}
        />
      </div>
    </AdminLayout>
  );
}

// Helper to format mutation errors
function formatMutationError(message: string): string {
  if (
    message.includes('fetch failed') ||
    (message.includes('Connection failed') &&
      !message.includes('timeout') &&
      !message.includes('refused'))
  ) {
    return 'Invalid MCP server URL. The server is not reachable or does not exist.';
  }
  return message;
}

// Server table row component
interface ServerTableRowProps {
  server: McpServerItem;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  canRefresh: boolean;
  isRefreshing: boolean;
  isAnyRefreshing: boolean;
}

function ServerTableRow({
  server,
  onEdit,
  onDelete,
  onRefresh,
  canRefresh,
  isRefreshing,
  isAnyRefreshing,
}: ServerTableRowProps): React.ReactElement {
  const toolsDisplay = formatToolsList(server.tools);

  return (
    <TableRow>
      <TableCell className="font-medium">{server.name}</TableCell>
      <TableCell className="max-w-[200px] truncate">{server.url}</TableCell>
      <TableCell className="text-muted-foreground">{server.authType}</TableCell>
      <TableCell className="text-muted-foreground">
        {server.trusted ? 'Trusted' : 'Untrusted'}
      </TableCell>
      <TableCell className="text-muted-foreground">{toolsDisplay}</TableCell>
      <TableCell>{formatDateTime(server.updatedAt)}</TableCell>
      <TableActionsCell onEdit={onEdit} onDelete={onDelete}>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isAnyRefreshing || !canRefresh}
          title={canRefresh ? undefined : 'Add an API key to discover tools.'}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </TableActionsCell>
    </TableRow>
  );
}

function formatToolsList(tools?: { id: string; name: string }[]): string {
  if (!tools || tools.length === 0) return 'None';
  if (tools.length <= 2) return tools.map((t) => t.name).join(', ');
  return `${tools
    .slice(0, 2)
    .map((t) => t.name)
    .join(', ')}, +${tools.length - 2} more`;
}

// Delete dialog component
interface DeleteServerDialogProps {
  server: McpServerItem | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  impactData?: {
    canDelete: boolean;
    blockers?: Array<{
      type: string;
      count?: number;
      details?: string;
      items?: Array<{ id: string; name: string }>;
    }>;
    warnings?: Array<{ message: string }>;
  };
  impactLoading: boolean;
  deleteWithPolicies: boolean;
  setDeleteWithPolicies: (value: boolean) => void;
  confirmDeletePolicies: boolean;
  setConfirmDeletePolicies: (value: boolean) => void;
}

function DeleteServerDialog({
  server,
  onClose,
  onConfirm,
  isDeleting,
  impactData,
  impactLoading,
  deleteWithPolicies,
  setDeleteWithPolicies,
  confirmDeletePolicies,
  setConfirmDeletePolicies,
}: DeleteServerDialogProps): React.ReactElement | null {
  if (!server) return null;

  const policyBlockers = impactData?.blockers?.filter((b) => b.type === 'policy') ?? [];
  const hasPolicyBlockers = policyBlockers.length > 0;

  if (confirmDeletePolicies) {
    return (
      <DeleteConfirmDialog
        open
        onOpenChange={onClose}
        title="Confirm deletion"
        itemName={server.name}
        description="and all related policies? This action cannot be undone."
        onConfirm={onConfirm}
        isLoading={isDeleting}
        confirmLabel="Delete server and policies"
        loadingLabel="Deleting..."
      >
        <Alert variant="destructive">
          <AlertTitle>Final confirmation</AlertTitle>
          <AlertDescription>
            This will permanently delete the MCP server and all {policyBlockers[0]?.count || 0}{' '}
            related policies. The server can be restored, but the policies cannot.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmDeletePolicies(false)}
            disabled={isDeleting}
          >
            Go back
          </Button>
        </div>
      </DeleteConfirmDialog>
    );
  }

  return (
    <DeleteConfirmDialog
      open
      onOpenChange={onClose}
      title="Delete MCP server"
      itemName={server.name}
      description="This will soft-delete the server and it can be restored later."
      onConfirm={onConfirm}
      isLoading={isDeleting}
      impactsLoading={impactLoading}
      canDelete={impactData?.canDelete || deleteWithPolicies}
      confirmLabel="Delete server"
      loadingLabel="Deleting..."
    >
      {hasPolicyBlockers && (
        <Alert variant={deleteWithPolicies ? 'default' : 'destructive'}>
          <AlertTitle>
            {deleteWithPolicies ? 'Policies will be deleted' : 'Policy blockers'}
          </AlertTitle>
          <AlertDescription>
            {policyBlockers.map((blocker, i) => (
              <div key={i}>
                <strong>{blocker.details}</strong>
                {blocker.items && blocker.items.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {blocker.items.map((item) => (
                      <li key={item.id}>{item.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <div className="mt-4 flex items-center gap-2">
              <Checkbox
                id="delete-policies"
                checked={deleteWithPolicies}
                onCheckedChange={(checked) => setDeleteWithPolicies(checked === true)}
              />
              <Label htmlFor="delete-policies" className="text-sm font-medium">
                Also delete all related policies
              </Label>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {impactData?.warnings &&
        impactData.warnings.length > 0 &&
        (impactData.canDelete || deleteWithPolicies) && (
          <Alert>
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              {impactData.warnings.map((warning, i) => (
                <div key={i}>- {warning.message}</div>
              ))}
            </AlertDescription>
          </Alert>
        )}
    </DeleteConfirmDialog>
  );
}

// Discovery modal component
interface DiscoveryModalProps {
  state: {
    status: 'idle' | 'discovering' | 'success' | 'failed' | 'skipped';
    serverName?: string;
    toolsDiscovered?: number;
    error?: string;
  };
  onClose: () => void;
}

function DiscoveryModal({ state, onClose }: DiscoveryModalProps): React.ReactElement | null {
  if (state.status === 'idle') return null;

  const isComplete =
    state.status === 'success' || state.status === 'failed' || state.status === 'skipped';

  return (
    <Dialog open onOpenChange={(open) => !open && isComplete && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {state.status === 'discovering' && 'Discovering Tools'}
            {state.status === 'success' && 'Tools Discovered'}
            {state.status === 'failed' && 'Discovery Failed'}
            {state.status === 'skipped' && 'Discovery Skipped'}
          </DialogTitle>
          <DialogDescription>{state.serverName && `Server: ${state.serverName}`}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {state.status === 'discovering' && (
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">
                Connecting to server and discovering available tools...
              </span>
            </div>
          )}

          {state.status === 'success' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-medium">Discovery complete</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Found {state.toolsDiscovered} tool{state.toolsDiscovered !== 1 ? 's' : ''} on this
                server.
              </p>
            </div>
          )}

          {state.status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>Discovery failed</AlertTitle>
              <AlertDescription>
                {state.error ||
                  'Failed to discover tools. You can try again later from the server list.'}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} disabled={!isComplete}>
            {isComplete ? 'Close' : 'Please wait...'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
