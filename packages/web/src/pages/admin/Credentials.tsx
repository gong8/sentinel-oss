import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { useWorkspace } from '../../hooks/WorkspaceContext';

import { ConfirmDialog, DataTableCard, ErrorAlert, FormInput } from '../../components/admin';
import {
  CredentialSectionHeader,
  CredentialServerRow,
} from '../../components/credentials/CredentialServerRow';
import { KeyValueEditor } from '../../components/credentials/KeyValueEditor';
import {
  ToolDiscoveryModal,
  type DiscoveryState,
} from '../../components/credentials/ToolDiscoveryModal';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Separator } from '../../components/ui/separator';
import { Switch } from '../../components/ui/switch';
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
type CredentialLevel = 'personal' | 'workspace' | 'org';

interface McpServerItem {
  id: string;
  name: string;
  url: string;
  authType: 'OAUTH' | 'API_KEY' | 'NONE';
  trusted: boolean;
  hasApiKey: boolean;
  hasCredentials: boolean;
  apiKeyHint: string | null;
  hasOrgOAuth: boolean;
  orgOAuthConnectedByEmail: string | null;
  orgOAuthAuthenticatedAt: string | null;
  updatedAt: string;
}

interface PersonalCredItem {
  id: string;
  name: string;
  hasPersonalApiKey: boolean;
  hasPersonalCredentials: boolean;
  authenticatedAt: string | null;
  personalApiKeyHint: string | null;
}

interface WorkspaceCredItem {
  id: string;
  name: string;
  updatedAt: string;
  authType: 'OAUTH' | 'API_KEY' | 'NONE';
  hasWorkspaceApiKey: boolean;
  hasWorkspaceCredentials: boolean;
  hasWorkspaceOAuth: boolean;
  workspaceOAuthConnectedByEmail: string | null;
  workspaceOAuthAuthenticatedAt: string;
  workspaceApiKeyHint: string | null;
}

interface MutationResultWithDiscovery {
  toolsDiscovered?: number;
  discoveryError?: string;
}

interface DiscoveryFeedback {
  success: boolean;
  toolsDiscovered?: number;
  error?: string;
}

function handleDiscoveryResult(
  data: MutationResultWithDiscovery,
  setFeedback: (feedback: DiscoveryFeedback | null) => void,
): void {
  if (data.toolsDiscovered !== undefined && data.toolsDiscovered > 0) {
    setFeedback({ success: true, toolsDiscovered: data.toolsDiscovered });
  } else if (data.discoveryError) {
    setFeedback({ success: false, error: data.discoveryError });
  }
}

export default function AdminCredentials(): React.ReactElement {
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightServerId = searchParams.get('highlight');
  const highlightSection = searchParams.get('section');
  const { selectedWorkspaceSlug, selectedWorkspaceId, isGlobalView, isOrgOwner } = useWorkspace();

  // Workspace admins can set workspace credentials when viewing a specific workspace
  const canManageWorkspaceCredentials = !isGlobalView && selectedWorkspaceId !== null;

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  // Queries - scope servers to workspace when viewing a specific workspace
  const serversQuery = trpc.admin.mcpServers.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const servers: McpServerItem[] | undefined = serversQuery.data;
  const personalCredsQuery = trpc.admin.personalCredentials.list.useQuery();
  const personalCreds: PersonalCredItem[] | undefined = personalCredsQuery.data;

  // Workspace credentials query (only when viewing a specific workspace)
  const workspaceCredsQuery = trpc.admin.workspaceCredentials.list.useQuery(
    { workspaceId: selectedWorkspaceId ?? '' },
    { enabled: canManageWorkspaceCredentials },
  );
  const workspaceCreds: WorkspaceCredItem[] | undefined = workspaceCredsQuery.data;

  // Mutations
  const updateServerMutation = trpc.admin.mcpServers.update.useMutation({
    onSuccess: (data: MutationResultWithDiscovery) => {
      utils.admin.mcpServers.list.invalidate();
      if (highlightServerId) setSearchParams({}, { replace: true });
      handleDiscoveryResult(data, setDiscoveryFeedback);
    },
  });

  const updatePersonalApiKeyMutation = trpc.admin.personalCredentials.updateApiKey.useMutation({
    onSuccess: (data: MutationResultWithDiscovery) => {
      utils.admin.personalCredentials.list.invalidate();
      utils.admin.mcpServers.list.invalidate();
      if (highlightServerId) setSearchParams({}, { replace: true });
      handleDiscoveryResult(data, setDiscoveryFeedback);
    },
  });

  const updatePersonalCredsMutation = trpc.admin.personalCredentials.updateCredentials.useMutation({
    onSuccess: (data: MutationResultWithDiscovery) => {
      utils.admin.personalCredentials.list.invalidate();
      utils.admin.mcpServers.list.invalidate();
      if (highlightServerId) setSearchParams({}, { replace: true });
      handleDiscoveryResult(data, setDiscoveryFeedback);
    },
  });

  // Workspace credential mutations
  const updateWorkspaceApiKeyMutation = trpc.admin.workspaceCredentials.updateApiKey.useMutation({
    onSuccess: (data: MutationResultWithDiscovery) => {
      utils.admin.workspaceCredentials.list.invalidate();
      utils.admin.mcpServers.list.invalidate();
      if (highlightServerId) setSearchParams({}, { replace: true });
      handleDiscoveryResult(data, setDiscoveryFeedback);
    },
  });

  const updateWorkspaceCredsMutation =
    trpc.admin.workspaceCredentials.updateCredentials.useMutation({
      onSuccess: (data: MutationResultWithDiscovery) => {
        utils.admin.workspaceCredentials.list.invalidate();
        utils.admin.mcpServers.list.invalidate();
        if (highlightServerId) setSearchParams({}, { replace: true });
        handleDiscoveryResult(data, setDiscoveryFeedback);
      },
    });

  const initiatePersonalOAuthMutation = trpc.user.mcpServers.initiateOAuth.useMutation({
    onSuccess: (result) => {
      if (result.authorizationUrl) {
        window.open(result.authorizationUrl, '_blank');
      }
    },
  });

  const initiateOrgOAuthMutation = trpc.admin.orgOAuth.initiate.useMutation({
    onSuccess: (result) => {
      if (result.authorizationUrl) {
        window.open(result.authorizationUrl, '_blank');
      }
    },
  });

  const disconnectPersonalOAuthMutation = trpc.user.mcpServers.disconnect.useMutation({
    onSuccess: () => utils.admin.personalCredentials.list.invalidate(),
  });

  const disconnectOrgOAuthMutation = trpc.admin.orgOAuth.disconnect.useMutation({
    onSuccess: () => utils.admin.mcpServers.list.invalidate(),
  });

  const initiateWorkspaceOAuthMutation = trpc.admin.workspaceOAuth.initiate.useMutation({
    onSuccess: (result) => {
      if (result.authorizationUrl) {
        window.open(result.authorizationUrl, '_blank');
      }
    },
  });

  const disconnectWorkspaceOAuthMutation = trpc.admin.workspaceOAuth.disconnect.useMutation({
    onSuccess: () => utils.admin.workspaceCredentials.list.invalidate(),
  });

  // UI State
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const hasProcessedHighlight = useRef(false);

  const [editingApiKeyServer, setEditingApiKeyServer] = useState<{
    server: McpServerItem;
    level: CredentialLevel;
  } | null>(null);

  const [editingCredentialsServer, setEditingCredentialsServer] = useState<{
    server: McpServerItem;
    level: CredentialLevel;
  } | null>(null);

  const [clearApiKeyConfirm, setClearApiKeyConfirm] = useState<{
    server: McpServerItem;
    level: CredentialLevel;
  } | null>(null);

  const [disconnectOAuthConfirm, setDisconnectOAuthConfirm] = useState<{
    server: McpServerItem;
    level: CredentialLevel;
  } | null>(null);

  const [discoveryFeedback, setDiscoveryFeedback] = useState<DiscoveryFeedback | null>(null);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>({ status: 'idle' });

  // Handle OAuth success message from popup window
  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      if (event.data?.type === 'OAUTH_SUCCESS') {
        // Invalidate queries to refresh credential status
        utils.admin.personalCredentials.list.invalidate();
        utils.admin.mcpServers.list.invalidate();
        utils.admin.workspaceCredentials.list.invalidate();
        if (highlightServerId) setSearchParams({}, { replace: true });

        // Show discovery modal with results from OAuth callback
        const { serverName, toolsDiscovered, discoveryError } = event.data as {
          serverName?: string;
          toolsDiscovered?: number;
          discoveryError?: string;
        };

        if (serverName) {
          if (discoveryError) {
            setDiscoveryState({
              status: 'error',
              serverName,
              error: discoveryError,
            });
          } else if (toolsDiscovered !== undefined) {
            setDiscoveryState({
              status: 'success',
              serverName,
              toolsDiscovered,
            });
          }
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [utils, highlightServerId, setSearchParams]);

  // Handle highlight params
  useEffect(() => {
    if (
      highlightServerId &&
      serversQuery.data &&
      !serversQuery.isPending &&
      !hasProcessedHighlight.current
    ) {
      hasProcessedHighlight.current = true;

      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [highlightServerId, serversQuery.data, serversQuery.isPending, setSearchParams]);

  // Credential editor state
  const [credentialEntries, setCredentialEntries] = useState<CredentialEntry[]>([]);
  const [headerEntries, setHeaderEntries] = useState<CredentialEntry[]>([]);
  const [injectIntoToolParams, setInjectIntoToolParams] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);
  const activeCredentialServerId = useRef<string | null>(null);

  const form = useForm<ApiKeyValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { apiKey: '' },
  });

  function getPersonalCred(serverId: string): PersonalCredItem | undefined {
    return personalCreds?.find((c) => c.id === serverId);
  }

  function getWorkspaceCred(serverId: string): WorkspaceCredItem | undefined {
    return workspaceCreds?.find((c) => c.id === serverId);
  }

  function getLevelLabel(level: CredentialLevel): string {
    switch (level) {
      case 'personal':
        return 'Personal';
      case 'workspace':
        return 'Workspace';
      case 'org':
        return 'Organization';
    }
  }

  // API Key handlers
  const submitApiKey = form.handleSubmit((values) => {
    if (!editingApiKeyServer) return;
    const { server, level } = editingApiKeyServer;
    const trimmedApiKey = values.apiKey?.trim();

    // Show discovery modal
    setEditingApiKeyServer(null);
    form.reset();
    setDiscoveryState({ status: 'discovering', serverName: server.name });

    const onSuccess = (data: MutationResultWithDiscovery) => {
      if (data.toolsDiscovered !== undefined && data.toolsDiscovered > 0) {
        setDiscoveryState({
          status: 'success',
          serverName: server.name,
          toolsDiscovered: data.toolsDiscovered,
        });
      } else if (data.discoveryError) {
        setDiscoveryState({
          status: 'error',
          serverName: server.name,
          error: data.discoveryError,
        });
      } else {
        // No tools discovered but no error - show success with 0 tools
        setDiscoveryState({
          status: 'success',
          serverName: server.name,
          toolsDiscovered: data.toolsDiscovered ?? 0,
        });
      }
    };
    const onError = (error: { message?: string }) => {
      setDiscoveryState({
        status: 'error',
        serverName: server.name,
        error: error.message ?? 'API key validation failed.',
      });
    };

    if (level === 'org') {
      updateServerMutation.mutate({ id: server.id, apiKey: trimmedApiKey }, { onSuccess, onError });
    } else if (level === 'workspace' && selectedWorkspaceId) {
      updateWorkspaceApiKeyMutation.mutate(
        { workspaceId: selectedWorkspaceId, mcpServerId: server.id, apiKey: trimmedApiKey },
        { onSuccess, onError },
      );
    } else {
      updatePersonalApiKeyMutation.mutate(
        { mcpServerId: server.id, apiKey: trimmedApiKey },
        { onSuccess, onError },
      );
    }
  });

  function confirmClearApiKey(): void {
    if (!clearApiKeyConfirm) return;
    const { server, level } = clearApiKeyConfirm;
    const onSuccess = () => setClearApiKeyConfirm(null);

    if (level === 'org') {
      updateServerMutation.mutate({ id: server.id, apiKey: null }, { onSuccess });
    } else if (level === 'workspace' && selectedWorkspaceId) {
      updateWorkspaceApiKeyMutation.mutate(
        { workspaceId: selectedWorkspaceId, mcpServerId: server.id, apiKey: null },
        { onSuccess },
      );
    } else {
      updatePersonalApiKeyMutation.mutate({ mcpServerId: server.id, apiKey: null }, { onSuccess });
    }
  }

  // Credentials editor handlers
  function openCredentialsEditor(server: McpServerItem, level: CredentialLevel): void {
    activeCredentialServerId.current = server.id;
    setEditingCredentialsServer({ server, level });
    setCredentialEntries([]);
    setHeaderEntries([]);
    setInjectIntoToolParams(false);
    setEditorError(null);
    setIsLoadingCredentials(true);

    let fetchFn: Promise<{ credentials: Record<string, unknown> | null }>;
    if (level === 'org') {
      fetchFn = utils.admin.mcpServers.getCredentials.fetch({ id: server.id });
    } else if (level === 'workspace' && selectedWorkspaceId) {
      fetchFn = utils.admin.workspaceCredentials.getCredentials.fetch({
        workspaceId: selectedWorkspaceId,
        mcpServerId: server.id,
      });
    } else {
      fetchFn = utils.admin.personalCredentials.getCredentials.fetch({ mcpServerId: server.id });
    }

    void fetchFn
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
  }

  function closeCredentialsEditor(): void {
    activeCredentialServerId.current = null;
    setEditingCredentialsServer(null);
    setCredentialEntries([]);
    setHeaderEntries([]);
    setInjectIntoToolParams(false);
    setEditorError(null);
    setIsLoadingCredentials(false);
  }

  function handleSaveCredentials(): void {
    if (!editingCredentialsServer) return;
    const { server, level } = editingCredentialsServer;

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

    // Close editor and show discovery modal
    closeCredentialsEditor();
    setDiscoveryState({ status: 'discovering', serverName: server.name });

    const onSuccess = (data: MutationResultWithDiscovery) => {
      if (data.toolsDiscovered !== undefined && data.toolsDiscovered > 0) {
        setDiscoveryState({
          status: 'success',
          serverName: server.name,
          toolsDiscovered: data.toolsDiscovered,
        });
      } else if (data.discoveryError) {
        setDiscoveryState({
          status: 'error',
          serverName: server.name,
          error: data.discoveryError,
        });
      } else {
        // No tools discovered but no error - show success with 0 tools
        setDiscoveryState({
          status: 'success',
          serverName: server.name,
          toolsDiscovered: data.toolsDiscovered ?? 0,
        });
      }
    };
    const onError = (error: { message?: string }) =>
      setDiscoveryState({
        status: 'error',
        serverName: server.name,
        error: error.message ?? 'Credential validation failed.',
      });

    if (level === 'org') {
      updateServerMutation.mutate({ id: server.id, credentials: payload }, { onSuccess, onError });
    } else if (level === 'workspace' && selectedWorkspaceId) {
      updateWorkspaceCredsMutation.mutate(
        { workspaceId: selectedWorkspaceId, mcpServerId: server.id, credentials: payload },
        { onSuccess, onError },
      );
    } else {
      updatePersonalCredsMutation.mutate(
        { mcpServerId: server.id, credentials: payload },
        { onSuccess, onError },
      );
    }
  }

  function handleClearCredentials(): void {
    if (!editingCredentialsServer) return;
    const { server, level } = editingCredentialsServer;

    const onSuccess = () => closeCredentialsEditor();
    const onError = (error: { message?: string }) =>
      setEditorError(error.message ?? 'Failed to clear credentials.');

    if (level === 'org') {
      updateServerMutation.mutate({ id: server.id, credentials: null }, { onSuccess, onError });
    } else if (level === 'workspace' && selectedWorkspaceId) {
      updateWorkspaceCredsMutation.mutate(
        { workspaceId: selectedWorkspaceId, mcpServerId: server.id, credentials: null },
        { onSuccess, onError },
      );
    } else {
      updatePersonalCredsMutation.mutate(
        { mcpServerId: server.id, credentials: null },
        { onSuccess, onError },
      );
    }
  }

  // OAuth disconnect handler
  function confirmDisconnectOAuth(): void {
    if (!disconnectOAuthConfirm) return;
    const { server, level } = disconnectOAuthConfirm;
    const onSuccess = () => setDisconnectOAuthConfirm(null);

    if (level === 'org') {
      disconnectOrgOAuthMutation.mutate({ mcpServerId: server.id }, { onSuccess });
    } else if (level === 'workspace' && selectedWorkspaceId) {
      disconnectWorkspaceOAuthMutation.mutate(
        { workspaceId: selectedWorkspaceId, mcpServerId: server.id },
        { onSuccess },
      );
    } else {
      disconnectPersonalOAuthMutation.mutate({ mcpServerId: server.id }, { onSuccess });
    }
  }

  // Filtered server lists
  const apiKeyServers = useMemo(
    () => servers?.filter((s) => s.authType === 'API_KEY') ?? [],
    [servers],
  );
  const oauthServers = useMemo(
    () => servers?.filter((s) => s.authType === 'OAUTH') ?? [],
    [servers],
  );

  const errors = useMemo(() => {
    const allErrors = [
      serversQuery.error,
      personalCredsQuery.error,
      workspaceCredsQuery.error,
      updateServerMutation.error,
      updatePersonalApiKeyMutation.error,
      updatePersonalCredsMutation.error,
      updateWorkspaceApiKeyMutation.error,
      updateWorkspaceCredsMutation.error,
      initiatePersonalOAuthMutation.error,
      initiateOrgOAuthMutation.error,
      initiateWorkspaceOAuthMutation.error,
      disconnectPersonalOAuthMutation.error,
      disconnectOrgOAuthMutation.error,
      disconnectWorkspaceOAuthMutation.error,
    ];
    const result: Array<{ message: string }> = [];
    for (const e of allErrors) {
      if (e) result.push({ message: e.message });
    }
    return result;
  }, [
    serversQuery.error,
    personalCredsQuery.error,
    workspaceCredsQuery.error,
    updateServerMutation.error,
    updatePersonalApiKeyMutation.error,
    updatePersonalCredsMutation.error,
    updateWorkspaceApiKeyMutation.error,
    updateWorkspaceCredsMutation.error,
    initiatePersonalOAuthMutation.error,
    initiateOrgOAuthMutation.error,
    initiateWorkspaceOAuthMutation.error,
    disconnectPersonalOAuthMutation.error,
    disconnectOrgOAuthMutation.error,
    disconnectWorkspaceOAuthMutation.error,
  ]);

  const isLoading =
    serversQuery.isPending ||
    personalCredsQuery.isPending ||
    (canManageWorkspaceCredentials && workspaceCredsQuery.isPending);
  const isMutating =
    updateServerMutation.isPending ||
    updatePersonalApiKeyMutation.isPending ||
    updatePersonalCredsMutation.isPending ||
    updateWorkspaceApiKeyMutation.isPending ||
    updateWorkspaceCredsMutation.isPending ||
    initiatePersonalOAuthMutation.isPending ||
    initiateOrgOAuthMutation.isPending ||
    initiateWorkspaceOAuthMutation.isPending ||
    disconnectPersonalOAuthMutation.isPending ||
    disconnectOrgOAuthMutation.isPending ||
    disconnectWorkspaceOAuthMutation.isPending;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Credentials Management"
          description="Manage API keys, OAuth connections, and JSON credentials for MCP servers."
        />

        <ErrorAlert title="Failed to load credentials" errors={errors} />

        {discoveryFeedback && (
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
        )}

        {/* API Key Servers */}
        <DataTableCard
          title="API Key Servers"
          description="Manage API keys for servers requiring API key authentication."
          isLoading={isLoading}
          isEmpty={apiKeyServers.length === 0}
          emptyTitle="No API key servers"
          emptyDescription="No MCP servers are configured to use API key authentication."
        >
          <div className="space-y-2">
            <CredentialSectionHeader showWorkspaceColumn={canManageWorkspaceCredentials} />
            {apiKeyServers.map((server) => {
              const personalCred = getPersonalCred(server.id);
              const workspaceCred = getWorkspaceCred(server.id);
              const isHighlighted =
                highlightServerId === server.id && highlightSection === 'apikey';

              return (
                <CredentialServerRow
                  key={server.id}
                  ref={isHighlighted ? highlightRef : null}
                  serverId={server.id}
                  serverName={server.name}
                  isHighlighted={isHighlighted}
                  showWorkspaceSettings={canManageWorkspaceCredentials}
                  showOrgSettings={isOrgOwner}
                  personalStatus={
                    <span className="font-mono text-xs">
                      {personalCred?.personalApiKeyHint ||
                        (personalCred?.hasPersonalApiKey ? 'Key set' : 'None')}
                    </span>
                  }
                  workspaceStatus={
                    canManageWorkspaceCredentials ? (
                      <span className="font-mono text-xs">
                        {workspaceCred?.workspaceApiKeyHint ||
                          (workspaceCred?.hasWorkspaceApiKey ? 'Key set' : 'None')}
                      </span>
                    ) : undefined
                  }
                  orgStatus={
                    <span className="font-mono text-xs">
                      {server.apiKeyHint || (server.hasApiKey ? 'Key set' : 'None')}
                    </span>
                  }
                  personalActions={
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingApiKeyServer({ server, level: 'personal' });
                          form.reset({ apiKey: '' });
                        }}
                      >
                        {personalCred?.hasPersonalApiKey ? 'Update' : 'Add'} Personal
                      </Button>
                      {personalCred?.hasPersonalApiKey && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setClearApiKeyConfirm({ server, level: 'personal' })}
                          className="text-destructive hover:text-destructive"
                        >
                          Clear
                        </Button>
                      )}
                    </>
                  }
                  workspaceContent={
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {workspaceCred?.hasWorkspaceApiKey ? (
                          <>
                            Workspace API key:{' '}
                            <span className="font-mono">
                              {workspaceCred.workspaceApiKeyHint || '(configured)'}
                            </span>
                          </>
                        ) : (
                          'No workspace API key configured. Users will use personal or org keys.'
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingApiKeyServer({ server, level: 'workspace' });
                            form.reset({ apiKey: '' });
                          }}
                        >
                          {workspaceCred?.hasWorkspaceApiKey ? 'Update' : 'Add'} Workspace Key
                        </Button>
                        {workspaceCred?.hasWorkspaceApiKey && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setClearApiKeyConfirm({ server, level: 'workspace' })}
                            className="text-destructive hover:text-destructive"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  }
                  orgContent={
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {server.hasApiKey ? (
                          <>
                            Organization API key:{' '}
                            <span className="font-mono">{server.apiKeyHint || '(configured)'}</span>
                            <span className="ml-2">
                              Last updated: {formatDateTime(server.updatedAt)}
                            </span>
                          </>
                        ) : (
                          'No organization API key configured. Users must provide their own.'
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingApiKeyServer({ server, level: 'org' });
                            form.reset({ apiKey: '' });
                          }}
                        >
                          {server.hasApiKey ? 'Update' : 'Add'} Org Key
                        </Button>
                        {server.hasApiKey && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setClearApiKeyConfirm({ server, level: 'org' })}
                            className="text-destructive hover:text-destructive"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  }
                />
              );
            })}
          </div>
        </DataTableCard>

        {/* OAuth Servers */}
        <DataTableCard
          title="OAuth Servers"
          description="Connect OAuth accounts for MCP servers."
          isLoading={isLoading}
          isEmpty={oauthServers.length === 0}
          emptyTitle="No OAuth servers"
          emptyDescription="No MCP servers are configured to use OAuth authentication."
        >
          <div className="space-y-2">
            <CredentialSectionHeader showWorkspaceColumn={canManageWorkspaceCredentials} />
            {oauthServers.map((server) => {
              const personalCred = getPersonalCred(server.id);
              const workspaceCred = getWorkspaceCred(server.id);
              const hasPersonalOAuth = personalCred?.authenticatedAt != null;
              const hasWorkspaceOAuth = workspaceCred?.hasWorkspaceOAuth ?? false;
              const isHighlighted = highlightServerId === server.id && highlightSection === 'oauth';

              let personalStatus: string;
              if (hasPersonalOAuth) {
                personalStatus = server.hasOrgOAuth ? 'Overriding' : 'Connected';
              } else {
                personalStatus = server.hasOrgOAuth ? 'Using org' : 'None';
              }

              let workspaceStatusText = 'None';
              if (hasWorkspaceOAuth) {
                workspaceStatusText = 'Connected';
              }

              return (
                <CredentialServerRow
                  key={server.id}
                  ref={isHighlighted ? highlightRef : null}
                  serverId={server.id}
                  serverName={server.name}
                  isHighlighted={isHighlighted}
                  showWorkspaceSettings={canManageWorkspaceCredentials}
                  showOrgSettings={isOrgOwner}
                  personalStatus={<span className="text-xs">{personalStatus}</span>}
                  workspaceStatus={
                    canManageWorkspaceCredentials ? (
                      <span className="text-xs">{workspaceStatusText}</span>
                    ) : undefined
                  }
                  orgStatus={
                    <span className="text-xs">{server.hasOrgOAuth ? 'Connected' : 'None'}</span>
                  }
                  personalActions={
                    <>
                      {!hasPersonalOAuth && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            initiatePersonalOAuthMutation.mutate({
                              mcpServerId: server.id,
                              returnUrl: `${adminPrefix}/credentials`,
                            })
                          }
                          disabled={isMutating}
                        >
                          Connect Personal
                        </Button>
                      )}
                      {hasPersonalOAuth && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDisconnectOAuthConfirm({ server, level: 'personal' })}
                          className="text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10"
                        >
                          Disconnect
                        </Button>
                      )}
                    </>
                  }
                  workspaceContent={
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {hasWorkspaceOAuth ? (
                          <>
                            Connected by {workspaceCred?.workspaceOAuthConnectedByEmail} on{' '}
                            {formatDateTime(workspaceCred?.workspaceOAuthAuthenticatedAt)}.
                            Workspace users can use this connection.
                          </>
                        ) : (
                          'No workspace OAuth connection. Users will use personal or org connections.'
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            selectedWorkspaceId &&
                            initiateWorkspaceOAuthMutation.mutate({
                              workspaceId: selectedWorkspaceId,
                              mcpServerId: server.id,
                              returnUrl: `${adminPrefix}/credentials`,
                            })
                          }
                          disabled={isMutating || !selectedWorkspaceId}
                        >
                          {hasWorkspaceOAuth ? 'Reconnect' : 'Connect'} for Workspace
                        </Button>
                        {hasWorkspaceOAuth && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDisconnectOAuthConfirm({ server, level: 'workspace' })
                            }
                            className="text-destructive hover:text-destructive"
                          >
                            Disconnect
                          </Button>
                        )}
                      </div>
                    </div>
                  }
                  orgContent={
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {server.hasOrgOAuth ? (
                          <>
                            Connected by {server.orgOAuthConnectedByEmail} on{' '}
                            {formatDateTime(server.orgOAuthAuthenticatedAt)}. All users can use this
                            connection.
                          </>
                        ) : (
                          'No organization OAuth connection. Connect once to share with all users.'
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            initiateOrgOAuthMutation.mutate({
                              mcpServerId: server.id,
                              returnUrl: `${adminPrefix}/credentials`,
                            })
                          }
                          disabled={isMutating}
                        >
                          {server.hasOrgOAuth ? 'Reconnect' : 'Connect'} for Org
                        </Button>
                        {server.hasOrgOAuth && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDisconnectOAuthConfirm({ server, level: 'org' })}
                            className="text-destructive hover:text-destructive"
                          >
                            Disconnect Org
                          </Button>
                        )}
                      </div>
                    </div>
                  }
                />
              );
            })}
          </div>
        </DataTableCard>

        {/* JSON Credentials */}
        <DataTableCard
          title="Advanced JSON Credentials"
          description="Store complex credential JSON for MCP servers."
          isLoading={isLoading}
          isEmpty={!servers || servers.length === 0}
          emptyTitle="No MCP servers"
          emptyDescription="Configure MCP servers before adding credentials."
        >
          <div className="space-y-2">
            <CredentialSectionHeader showWorkspaceColumn={canManageWorkspaceCredentials} />
            {servers?.map((server) => {
              const personalCred = getPersonalCred(server.id);
              const workspaceCred = getWorkspaceCred(server.id);
              const isHighlighted = highlightServerId === server.id && highlightSection === 'creds';

              return (
                <CredentialServerRow
                  key={server.id}
                  ref={isHighlighted ? highlightRef : null}
                  serverId={server.id}
                  serverName={server.name}
                  isHighlighted={isHighlighted}
                  showWorkspaceSettings={canManageWorkspaceCredentials}
                  showOrgSettings={isOrgOwner}
                  personalStatus={
                    <span className="text-xs">
                      {personalCred?.hasPersonalCredentials ? 'JSON set' : 'None'}
                    </span>
                  }
                  workspaceStatus={
                    canManageWorkspaceCredentials ? (
                      <span className="text-xs">
                        {workspaceCred?.hasWorkspaceCredentials ? 'JSON set' : 'None'}
                      </span>
                    ) : undefined
                  }
                  orgStatus={
                    <span className="text-xs">{server.hasCredentials ? 'JSON set' : 'None'}</span>
                  }
                  personalActions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCredentialsEditor(server, 'personal')}
                    >
                      {personalCred?.hasPersonalCredentials ? 'Update' : 'Add'} Personal
                    </Button>
                  }
                  workspaceContent={
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {workspaceCred?.hasWorkspaceCredentials
                          ? 'Workspace JSON credentials configured.'
                          : 'No workspace JSON credentials configured.'}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCredentialsEditor(server, 'workspace')}
                      >
                        {workspaceCred?.hasWorkspaceCredentials ? 'Update' : 'Add'} Workspace JSON
                      </Button>
                    </div>
                  }
                  orgContent={
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {server.hasCredentials ? (
                          <>
                            Organization JSON credentials configured. Last updated:{' '}
                            {formatDateTime(server.updatedAt)}
                          </>
                        ) : (
                          'No organization JSON credentials configured.'
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCredentialsEditor(server, 'org')}
                      >
                        {server.hasCredentials ? 'Update' : 'Add'} Org JSON
                      </Button>
                    </div>
                  }
                />
              );
            })}
          </div>
        </DataTableCard>
      </div>

      {/* API Key Dialog */}
      <Dialog open={Boolean(editingApiKeyServer)} onOpenChange={() => setEditingApiKeyServer(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingApiKeyServer && getLevelLabel(editingApiKeyServer.level)} API Key
            </DialogTitle>
            <DialogDescription>
              Set the{' '}
              {editingApiKeyServer && getLevelLabel(editingApiKeyServer.level).toLowerCase()}
              -level API key for {editingApiKeyServer?.server.name}.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={submitApiKey}>
            <FormInput
              id="apiKey"
              label="API Key"
              type="password"
              placeholder="Enter API key"
              error={form.formState.errors.apiKey?.message}
              hint="This key will be encrypted and stored securely."
              register={form.register('apiKey')}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingApiKeyServer(null)}
                disabled={isMutating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? 'Saving...' : 'Save API Key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Clear API Key Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(clearApiKeyConfirm)}
        onOpenChange={(open) => !open && setClearApiKeyConfirm(null)}
        title={`Clear ${clearApiKeyConfirm && getLevelLabel(clearApiKeyConfirm.level).toLowerCase()} API key`}
        description={`Remove the ${clearApiKeyConfirm && getLevelLabel(clearApiKeyConfirm.level).toLowerCase()}-level API key for ${clearApiKeyConfirm?.server.name}?`}
        isLoading={isMutating}
        onConfirm={confirmClearApiKey}
        confirmText="Clear API key"
        loadingText="Clearing..."
        confirmVariant="destructive"
      />

      {/* Credentials Editor Dialog */}
      <Dialog open={Boolean(editingCredentialsServer)} onOpenChange={closeCredentialsEditor}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCredentialsServer && getLevelLabel(editingCredentialsServer.level)} JSON
              Credentials
            </DialogTitle>
            <DialogDescription>
              Set{' '}
              {editingCredentialsServer &&
                getLevelLabel(editingCredentialsServer.level).toLowerCase()}
              -level credentials for {editingCredentialsServer?.server.name}.
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
                      When enabled, credential fields are merged into every tool call.
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
                description="Optional HTTP headers sent with MCP requests."
                emptyLabel="No custom headers configured."
                addLabel="Add header"
              />
            </div>
          )}

          {editorError && (
            <Alert variant="destructive">
              <AlertTitle>Failed to save credentials</AlertTitle>
              <AlertDescription>{editorError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeCredentialsEditor}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearCredentials}
              disabled={isMutating}
              className="text-destructive hover:text-destructive"
            >
              Clear JSON
            </Button>
            <Button type="button" onClick={handleSaveCredentials} disabled={isMutating}>
              {isMutating ? 'Saving...' : 'Save credentials'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OAuth Disconnect Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(disconnectOAuthConfirm)}
        onOpenChange={(open) => !open && setDisconnectOAuthConfirm(null)}
        title={`Disconnect ${disconnectOAuthConfirm && getLevelLabel(disconnectOAuthConfirm.level).toLowerCase()} OAuth`}
        description={`Remove the ${disconnectOAuthConfirm && getLevelLabel(disconnectOAuthConfirm.level).toLowerCase()}-level OAuth connection for ${disconnectOAuthConfirm?.server.name}?`}
        isLoading={isMutating}
        onConfirm={confirmDisconnectOAuth}
        confirmText="Disconnect"
        loadingText="Disconnecting..."
        confirmVariant="destructive"
      />

      {/* Tool Discovery Modal */}
      <ToolDiscoveryModal
        state={discoveryState}
        onClose={() => setDiscoveryState({ status: 'idle' })}
      />
    </AdminLayout>
  );
}
