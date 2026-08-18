import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { ConfirmDialog, ErrorAlert } from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useNavigationState } from '../../hooks/useNavigationState';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

// Schemas
const registerUrlSchema = z.object({
  url: z.string().url('Enter a valid URL.'),
  nameOverride: z.string().max(255).optional(),
});

const credentialSchema = z.object({
  authType: z.enum(['API_KEY', 'OAUTH', 'OIDC']),
  apiKey: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

const editAgentSchema = z.object({
  agentCard: z.string().min(10, 'Agent card JSON is required.'),
});

type RegisterUrlValues = z.infer<typeof registerUrlSchema>;
type CredentialValues = z.infer<typeof credentialSchema>;
type EditAgentValues = z.infer<typeof editAgentSchema>;

// Preview result type
interface AgentPreview {
  success: true;
  card: unknown;
  suggestedName: string;
  endpointUrl: string;
  provider?: string;
  skills: Array<{ id: string; name: string }>;
}

// Type for agent list items
interface A2AAgentItem {
  id: string;
  name: string;
  endpointUrl: string | null;
  cardSource: string;
  provider?: string;
  skills: Array<{ id: string; name: string }>;
  skillCount: number;
  agentCardFetchedAt: string | null;
  signatureVerified: boolean | null;
  credentialConfigured: boolean;
  credentialAuthType: string | null;
  createdAt: string;
}

interface NavigationState {
  openCreateModal?: boolean;
}

export default function AdminA2AAgents(): React.ReactElement {
  const navState = useNavigationState<NavigationState>();
  const utils = trpc.useUtils();

  // Queries
  const agentsQuery = trpc.admin.a2a.listAgents.useQuery();
  const agents = agentsQuery.data;

  // Confirmation dialog
  const deleteConfirm = useConfirmAction<A2AAgentItem>();

  // Mutations
  const previewMutation = trpc.admin.a2a.previewAgent.useMutation();
  const registerMutation = trpc.admin.a2a.registerAgent.useMutation({
    onSuccess: () => utils.admin.a2a.listAgents.invalidate(),
  });
  const deleteMutation = trpc.admin.a2a.deleteAgent.useMutation({
    onSuccess: () => {
      utils.admin.a2a.listAgents.invalidate();
      deleteConfirm.closeConfirm();
    },
  });
  const refreshCardMutation = trpc.admin.a2a.refreshAgentCard.useMutation({
    onSuccess: () => utils.admin.a2a.listAgents.invalidate(),
  });
  const updateCardMutation = trpc.admin.a2a.updateAgentCard.useMutation({
    onSuccess: () => {
      utils.admin.a2a.listAgents.invalidate();
      setEditAgent(null);
    },
  });
  const setCredentialMutation = trpc.admin.a2a.setCredential.useMutation({
    onSuccess: () => setCredentialAgent(null),
  });
  const testConnectionMutation = trpc.admin.a2a.testConnection.useMutation();

  // State
  const [registerOpen, setRegisterOpen] = useState(() => Boolean(navState?.openCreateModal));
  const [agentPreview, setAgentPreview] = useState<AgentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [detailsAgent, setDetailsAgent] = useState<string | null>(null);
  const [editAgent, setEditAgent] = useState<A2AAgentItem | null>(null);
  const [credentialAgent, setCredentialAgent] = useState<A2AAgentItem | null>(null);
  const [testResult, setTestResult] = useState<{
    agentId: string;
    success: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [refreshingAgentId, setRefreshingAgentId] = useState<string | null>(null);
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);

  // Conditional queries
  const agentDetailsQuery = trpc.admin.a2a.getAgent.useQuery(
    { id: detailsAgent || '' },
    { enabled: Boolean(detailsAgent) },
  );

  const editAgentQuery = trpc.admin.a2a.getAgent.useQuery(
    { id: editAgent?.id || '' },
    { enabled: Boolean(editAgent) },
  );

  const credentialStatusQuery = trpc.admin.a2a.getCredentialStatus.useQuery(
    { agentId: credentialAgent?.id || '' },
    { enabled: Boolean(credentialAgent) },
  );

  // Forms
  const registerForm = useForm<RegisterUrlValues>({
    resolver: zodResolver(registerUrlSchema),
    defaultValues: { url: '', nameOverride: '' },
  });

  const credentialForm = useForm<CredentialValues>({
    resolver: zodResolver(credentialSchema),
    defaultValues: { authType: 'API_KEY', apiKey: '', accessToken: '', refreshToken: '' },
  });

  const editForm = useForm<EditAgentValues>({
    resolver: zodResolver(editAgentSchema),
    defaultValues: { agentCard: '' },
  });

  const watchedAuthType = useWatch({ control: credentialForm.control, name: 'authType' });

  // Populate edit form when agent data loads
  const editAgentCard = editAgentQuery.data?.agentCard;
  if (editAgent && editAgentCard && !editForm.getValues('agentCard')) {
    editForm.setValue('agentCard', JSON.stringify(editAgentCard, null, 2));
  }

  // Error handling
  const errors = useMutationErrors([
    agentsQuery,
    previewMutation,
    registerMutation,
    deleteMutation,
    refreshCardMutation,
    updateCardMutation,
    setCredentialMutation,
    testConnectionMutation,
  ]);

  // Handlers
  const handlePreview = registerForm.handleSubmit((values) => {
    setPreviewError(null);
    setAgentPreview(null);
    previewMutation.mutate(
      { url: values.url },
      {
        onSuccess: (result) => {
          if (result.success) {
            setAgentPreview(result);
            registerForm.setValue('nameOverride', result.suggestedName);
          } else {
            setPreviewError(result.error);
          }
        },
        onError: (error) => setPreviewError(error.message),
      },
    );
  });

  function handleRegister(): void {
    const values = registerForm.getValues();
    const nameOverride = values.nameOverride?.trim() || undefined;
    registerMutation.mutate(
      { url: values.url, nameOverride },
      {
        onSuccess: () => {
          registerForm.reset();
          setAgentPreview(null);
          setPreviewError(null);
          setRegisterOpen(false);
        },
      },
    );
  }

  function handleCloseRegister(): void {
    setRegisterOpen(false);
    setAgentPreview(null);
    setPreviewError(null);
    registerForm.reset();
  }

  const submitCredential = credentialForm.handleSubmit((values) => {
    if (!credentialAgent) return;

    if (values.authType === 'API_KEY') {
      if (!values.apiKey) return;
      setCredentialMutation.mutate({
        agentId: credentialAgent.id,
        authType: 'API_KEY',
        credentials: { apiKey: values.apiKey },
      });
    } else if (values.authType === 'OAUTH') {
      if (!values.accessToken) return;
      setCredentialMutation.mutate({
        agentId: credentialAgent.id,
        authType: 'OAUTH',
        credentials: {
          accessToken: values.accessToken,
          refreshToken: values.refreshToken || undefined,
        },
      });
    } else if (values.authType === 'OIDC') {
      if (!values.accessToken) return;
      setCredentialMutation.mutate({
        agentId: credentialAgent.id,
        authType: 'OIDC',
        credentials: {
          accessToken: values.accessToken,
          refreshToken: values.refreshToken || undefined,
        },
      });
    }
  });

  const submitEdit = editForm.handleSubmit((values) => {
    if (!editAgent) return;
    try {
      const agentCard = JSON.parse(values.agentCard);
      updateCardMutation.mutate({ id: editAgent.id, agentCard });
    } catch {
      editForm.setError('agentCard', { message: 'Invalid JSON' });
    }
  });

  function handleEdit(agent: A2AAgentItem): void {
    editForm.reset({ agentCard: '' });
    setEditAgent(agent);
  }

  function handleRefresh(agent: A2AAgentItem): void {
    setRefreshingAgentId(agent.id);
    refreshCardMutation.mutate(
      { id: agent.id },
      {
        onSettled: () => setRefreshingAgentId(null),
      },
    );
  }

  function handleTest(agent: A2AAgentItem): void {
    setTestingAgentId(agent.id);
    setTestResult(null);
    testConnectionMutation.mutate(
      { agentId: agent.id },
      {
        onSuccess: (result) => {
          setTestResult({
            agentId: agent.id,
            success: result.success,
            latencyMs: result.latencyMs,
            error: result.error,
          });
        },
        onSettled: () => setTestingAgentId(null),
      },
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="A2A Agents"
          description="Manage A2A (Agent-to-Agent) protocol agents and their credentials."
        />

        <ErrorAlert title="Error" errors={errors} />

        {testResult && (
          <Alert variant={testResult.success ? 'default' : 'destructive'}>
            <AlertTitle>Connection Test {testResult.success ? 'Passed' : 'Failed'}</AlertTitle>
            <AlertDescription>
              {testResult.success
                ? `Response time: ${testResult.latencyMs}ms`
                : testResult.error || 'Connection failed'}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={() => setRegisterOpen(true)}>Register A2A Agent</Button>
        </div>

        {/* Register Agent Dialog */}
        <Dialog open={registerOpen} onOpenChange={handleCloseRegister}>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader>
              <DialogTitle>Register A2A Agent</DialogTitle>
              <DialogDescription>
                Enter an agent URL to auto-discover and register an A2A agent.
              </DialogDescription>
            </DialogHeader>

            {!agentPreview ? (
              <form className="space-y-4" onSubmit={handlePreview}>
                <div className="space-y-2">
                  <Label htmlFor="agent-url">Agent URL</Label>
                  <Input
                    id="agent-url"
                    placeholder="https://agent.example.com"
                    {...registerForm.register('url')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Will fetch /.well-known/agent-card.json automatically
                  </p>
                  {registerForm.formState.errors.url && (
                    <p className="text-xs text-destructive">
                      {registerForm.formState.errors.url.message}
                    </p>
                  )}
                </div>

                {previewError && (
                  <Alert variant="destructive">
                    <AlertTitle>Failed to fetch agent card</AlertTitle>
                    <AlertDescription>{previewError}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseRegister}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={previewMutation.isPending}>
                    {previewMutation.isPending ? 'Fetching...' : 'Fetch Agent Card'}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertTitle>Agent Card Found</AlertTitle>
                  <AlertDescription>
                    Review the agent details below and confirm registration.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <div className="font-medium">{agentPreview.suggestedName}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Provider</Label>
                      <div>{agentPreview.provider || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Endpoint</Label>
                      <div className="font-mono text-sm">{agentPreview.endpointUrl}</div>
                    </div>
                  </div>

                  {agentPreview.skills.length > 0 && (
                    <div>
                      <Label className="text-muted-foreground">
                        Skills ({agentPreview.skills.length})
                      </Label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {agentPreview.skills.map((skill) => (
                          <Badge key={skill.id} variant="secondary">
                            {skill.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name-override">Display Name (optional)</Label>
                  <Input
                    id="name-override"
                    placeholder={agentPreview.suggestedName}
                    {...registerForm.register('nameOverride')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use the agent&apos;s name from the card
                  </p>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAgentPreview(null);
                      setPreviewError(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button onClick={handleRegister} disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? 'Registering...' : 'Register Agent'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirm.isOpen}
          onOpenChange={(open) => !open && deleteConfirm.closeConfirm()}
          title="Delete A2A Agent"
          description={`Are you sure you want to delete ${deleteConfirm.target?.name}? This action can be undone from the Deleted Items page.`}
          isLoading={deleteMutation.isPending}
          onConfirm={() => {
            if (deleteConfirm.target) {
              deleteMutation.mutate({ id: deleteConfirm.target.id });
            }
          }}
          confirmText="Delete"
          loadingText="Deleting..."
          confirmVariant="destructive"
        />

        {/* Agent Details Dialog */}
        {detailsAgent && (
          <Dialog open={Boolean(detailsAgent)} onOpenChange={() => setDetailsAgent(null)}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Agent Details</DialogTitle>
              </DialogHeader>
              {agentDetailsQuery.isPending ? (
                <div className="text-muted-foreground">Loading...</div>
              ) : agentDetailsQuery.data ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <div className="font-medium">{agentDetailsQuery.data.name}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Endpoint URL</Label>
                      <div className="font-mono text-sm">{agentDetailsQuery.data.endpointUrl}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Card Source</Label>
                      <Badge variant="outline">{agentDetailsQuery.data.cardSource}</Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Last Fetched</Label>
                      <div>
                        {agentDetailsQuery.data.agentCardFetchedAt
                          ? formatDateTime(agentDetailsQuery.data.agentCardFetchedAt)
                          : 'Never'}
                      </div>
                    </div>
                  </div>

                  {agentDetailsQuery.data.agentCard && (
                    <>
                      <div>
                        <Label className="text-muted-foreground">Description</Label>
                        <div>{agentDetailsQuery.data.agentCard.description}</div>
                      </div>

                      <div>
                        <Label className="text-muted-foreground">
                          Skills ({agentDetailsQuery.data.agentCard.skills?.length || 0})
                        </Label>
                        <div className="mt-2 space-y-2">
                          {agentDetailsQuery.data.agentCard.skills?.map(
                            (skill: { id: string; name: string; description: string }) => (
                              <Card key={skill.id}>
                                <CardContent className="py-3">
                                  <div className="font-medium">{skill.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {skill.description}
                                  </div>
                                </CardContent>
                              </Card>
                            ),
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailsAgent(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Agent Dialog */}
        {editAgent && (
          <Dialog open={Boolean(editAgent)} onOpenChange={() => setEditAgent(null)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Agent Card</DialogTitle>
                <DialogDescription>
                  Update the Agent Card JSON for{' '}
                  <span className="font-medium">{editAgent.name}</span>.
                </DialogDescription>
              </DialogHeader>
              {editAgentQuery.isPending ? (
                <div className="text-muted-foreground">Loading...</div>
              ) : (
                <form className="space-y-4" onSubmit={submitEdit}>
                  <div className="space-y-2">
                    <Label htmlFor="edit-card">Agent Card JSON</Label>
                    <Textarea
                      id="edit-card"
                      placeholder='{"protocolVersion": "1.0", "name": "...", ...}'
                      rows={15}
                      className="font-mono text-sm"
                      {...editForm.register('agentCard')}
                    />
                    {editForm.formState.errors.agentCard && (
                      <p className="text-xs text-destructive">
                        {editForm.formState.errors.agentCard.message}
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEditAgent(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateCardMutation.isPending}>
                      {updateCardMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}

        {/* Credential Management Dialog */}
        {credentialAgent && (
          <Dialog open={Boolean(credentialAgent)} onOpenChange={() => setCredentialAgent(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure Credentials</DialogTitle>
                <DialogDescription>
                  Set credentials for <span className="font-medium">{credentialAgent.name}</span>.
                </DialogDescription>
              </DialogHeader>
              {credentialStatusQuery.data?.configured && (
                <Alert>
                  <AlertTitle>Credentials Configured</AlertTitle>
                  <AlertDescription>
                    Auth type: {credentialStatusQuery.data.authType}. Last updated:{' '}
                    {formatDateTime(credentialStatusQuery.data.updatedAt)}
                  </AlertDescription>
                </Alert>
              )}
              <form className="space-y-4" onSubmit={submitCredential}>
                <div className="space-y-2">
                  <Label>Authentication Type</Label>
                  <Controller
                    name="authType"
                    control={credentialForm.control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="API_KEY">API Key</SelectItem>
                          <SelectItem value="OAUTH">OAuth</SelectItem>
                          <SelectItem value="OIDC">OpenID Connect</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {watchedAuthType === 'API_KEY' ? (
                  <div className="space-y-2">
                    <Label htmlFor="cred-apikey">API Key</Label>
                    <Input
                      id="cred-apikey"
                      type="password"
                      {...credentialForm.register('apiKey')}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="cred-accesstoken">Access Token</Label>
                      <Input
                        id="cred-accesstoken"
                        type="password"
                        {...credentialForm.register('accessToken')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cred-refreshtoken">Refresh Token (optional)</Label>
                      <Input
                        id="cred-refreshtoken"
                        type="password"
                        {...credentialForm.register('refreshToken')}
                      />
                    </div>
                  </>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCredentialAgent(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={setCredentialMutation.isPending}>
                    {setCredentialMutation.isPending ? 'Saving...' : 'Save Credentials'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Agents Table */}
        <Card>
          <CardHeader>
            <CardTitle>A2A Agents</CardTitle>
            <CardDescription>
              Registered A2A agents that can communicate via the A2A protocol.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {agentsQuery.isPending ? (
              <TableSkeleton />
            ) : agents && agents.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Skills</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">
                        <button
                          className="hover:underline text-left"
                          onClick={() => setDetailsAgent(agent.id)}
                        >
                          {agent.name}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {agent.endpointUrl || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{agent.cardSource}</Badge>
                      </TableCell>
                      <TableCell>{agent.skillCount}</TableCell>
                      <TableCell>{formatDateTime(agent.createdAt)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTest(agent)}
                          disabled={testingAgentId === agent.id}
                        >
                          {testingAgentId === agent.id ? 'Testing...' : 'Test'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(agent)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCredentialAgent(agent)}>
                          Credentials
                        </Button>
                        {agent.cardSource === 'URL' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRefresh(agent)}
                            disabled={refreshingAgentId === agent.id}
                          >
                            {refreshingAgentId === agent.id ? 'Refreshing...' : 'Refresh'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteConfirm.openConfirm(agent)}
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No A2A agents"
                description="Register an A2A agent to start communicating with external agents."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
