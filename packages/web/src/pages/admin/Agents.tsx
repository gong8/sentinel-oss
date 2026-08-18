import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DeleteConfirmDialog, ErrorAlert } from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useNavigationState } from '../../hooks/useNavigationState';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const agentSchema = z.object({
  name: z.string().min(2, 'Agent name is required.'),
  publicKeyUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
});

type AgentValues = z.infer<typeof agentSchema>;

const jwksUrlSchema = z.object({
  publicKeyUrl: z.string(),
});

type JwksUrlValues = z.infer<typeof jwksUrlSchema>;

interface NavigationState {
  openCreateModal?: boolean;
}

export default function AdminAgents(): React.ReactElement {
  const navState = useNavigationState<NavigationState>();
  const utils = trpc.useUtils();
  const { selectedWorkspaceId } = useWorkspace();

  // Queries
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  type Agent = NonNullable<typeof agentsQuery.data>[number];

  // Confirmation dialog
  const deleteConfirm = useConfirmAction<Agent>();

  // Mutations
  const createMutation = trpc.admin.agents.create.useMutation({
    onSuccess: () => utils.admin.agents.list.invalidate(),
  });

  const deleteMutation = trpc.admin.agents.delete.useMutation({
    onSuccess: () => {
      utils.admin.agents.list.invalidate();
      deleteConfirm.closeConfirm();
    },
  });

  const deletionImpactQuery = trpc.admin.agents.getDeletionImpact.useQuery(
    { id: deleteConfirm.target?.id || '' },
    { enabled: deleteConfirm.isOpen },
  );

  const verifyMutation = trpc.admin.attestation.verifyAgent.useMutation({
    onSuccess: () => utils.admin.agents.list.invalidate(),
  });

  const refreshVerificationMutation = trpc.admin.attestation.refreshVerification.useMutation({
    onSuccess: () => utils.admin.agents.list.invalidate(),
  });

  const updateJwksUrlMutation = trpc.admin.attestation.updateAgentJwksUrl.useMutation({
    onSuccess: () => {
      utils.admin.agents.list.invalidate();
      setEditJwksAgent(null);
    },
  });

  // State
  const [verifyingAgentId, setVerifyingAgentId] = useState<string | null>(null);
  const [refreshingAgentId, setRefreshingAgentId] = useState<string | null>(null);
  const [editJwksAgent, setEditJwksAgent] = useState<Agent | null>(null);
  const [createAgentOpen, setCreateAgentOpen] = useState(() => Boolean(navState?.openCreateModal));

  // Forms
  const form = useForm<AgentValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: { name: '', publicKeyUrl: '' },
  });

  const jwksForm = useForm<JwksUrlValues>({
    resolver: zodResolver(jwksUrlSchema),
    defaultValues: { publicKeyUrl: '' },
  });

  // Reset JWKS form when editing agent changes
  useEffect(() => {
    if (editJwksAgent) {
      jwksForm.reset({ publicKeyUrl: editJwksAgent.publicKeyUrl ?? '' });
    }
  }, [editJwksAgent, jwksForm]);

  // Error handling
  const errors = useMutationErrors([
    agentsQuery,
    createMutation,
    deleteMutation,
    verifyMutation,
    refreshVerificationMutation,
    updateJwksUrlMutation,
  ]);

  // Handlers
  function handleVerify(agent: Agent): void {
    setVerifyingAgentId(agent.id);
    verifyMutation.mutate(
      { agentId: agent.id },
      {
        onSettled: () => setVerifyingAgentId(null),
      },
    );
  }

  function handleRefresh(agent: Agent): void {
    setRefreshingAgentId(agent.id);
    refreshVerificationMutation.mutate(
      { agentId: agent.id },
      {
        onSettled: () => setRefreshingAgentId(null),
      },
    );
  }

  const submitCreate = form.handleSubmit((values) => {
    const trimmedUrl = values.publicKeyUrl?.trim();
    createMutation.mutate(
      {
        name: values.name,
        publicKeyUrl: trimmedUrl && trimmedUrl.length > 0 ? trimmedUrl : null,
      },
      {
        onSuccess: () => {
          form.reset({ name: '', publicKeyUrl: '' });
          setCreateAgentOpen(false);
        },
      },
    );
  });

  const submitJwksUrl = jwksForm.handleSubmit((values) => {
    if (!editJwksAgent) return;
    const trimmedUrl = values.publicKeyUrl.trim();
    updateJwksUrlMutation.mutate({
      agentId: editJwksAgent.id,
      publicKeyUrl: trimmedUrl === '' ? null : trimmedUrl,
    });
  });

  function getVerificationStatus(agent: Agent): React.ReactElement {
    if (!agent.publicKeyUrl) {
      return <span className="text-muted-foreground">Not configured</span>;
    }
    if (agent.signatureVerified) {
      return <span className="text-green-600 dark:text-green-500">Verified</span>;
    }
    return <span className="text-destructive">Unverified</span>;
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Agents"
          description="Register automated agents and track their activity."
        />

        <ErrorAlert title="Failed to load agents" errors={errors} />

        <div className="flex justify-end">
          <Button onClick={() => setCreateAgentOpen(true)}>Create agent</Button>
        </div>

        {/* Create Agent Dialog */}
        <Dialog open={createAgentOpen} onOpenChange={setCreateAgentOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create agent</DialogTitle>
              <DialogDescription>Give the agent a friendly name.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submitCreate}>
              <div className="space-y-2">
                <Label htmlFor="agent-name">Name</Label>
                <Input id="agent-name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-jwks-url">
                  JWKS URL <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="agent-jwks-url"
                  placeholder="https://example.com/.well-known/jwks.json"
                  {...form.register('publicKeyUrl')}
                />
                {form.formState.errors.publicKeyUrl && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.publicKeyUrl.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  The JWKS URL used to verify the agent&apos;s identity. Can be configured later.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateAgentOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create agent'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={deleteConfirm.isOpen}
          onOpenChange={(open) => !open && deleteConfirm.closeConfirm()}
          title="Delete agent"
          itemName={deleteConfirm.target?.name ?? ''}
          description="This will soft delete the agent and it can be restored later."
          isLoadingImpact={deletionImpactQuery.isPending}
          impact={deletionImpactQuery.data}
          isDeleting={deleteMutation.isPending}
          onConfirm={() => {
            if (deleteConfirm.target) {
              deleteMutation.mutate({ id: deleteConfirm.target.id });
            }
          }}
        />

        {/* Edit JWKS URL Dialog */}
        {editJwksAgent && (
          <Dialog open={Boolean(editJwksAgent)} onOpenChange={() => setEditJwksAgent(null)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Configure JWKS URL</DialogTitle>
                <DialogDescription>
                  Set the JWKS (JSON Web Key Set) URL for agent{' '}
                  <span className="font-medium">{editJwksAgent.name}</span>. This URL will be used
                  to verify the agent&apos;s identity.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={submitJwksUrl}>
                <div className="space-y-2">
                  <Label htmlFor="jwks-url">JWKS URL</Label>
                  <Input
                    id="jwks-url"
                    placeholder="https://example.com/.well-known/jwks.json"
                    {...jwksForm.register('publicKeyUrl')}
                  />
                  {jwksForm.formState.errors.publicKeyUrl && (
                    <p className="text-xs text-destructive">
                      {jwksForm.formState.errors.publicKeyUrl.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Leave empty to remove the JWKS URL configuration.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditJwksAgent(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateJwksUrlMutation.isPending}>
                    {updateJwksUrlMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Agents Table */}
        <Card>
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <CardDescription>Active agents in this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            {agentsQuery.isPending ? (
              <TableSkeleton />
            ) : agentsQuery.data && agentsQuery.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentsQuery.data.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell>{getVerificationStatus(agent)}</TableCell>
                      <TableCell>{formatDateTime(agent.createdAt)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditJwksAgent(agent)}
                          title="Configure JWKS URL"
                        >
                          Configure
                        </Button>
                        {agent.publicKeyUrl && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleVerify(agent)}
                              disabled={verifyingAgentId === agent.id}
                            >
                              {verifyingAgentId === agent.id ? 'Verifying...' : 'Verify'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRefresh(agent)}
                              disabled={refreshingAgentId === agent.id}
                              title="Clear cache and re-verify"
                            >
                              {refreshingAgentId === agent.id ? 'Refreshing...' : 'Refresh'}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteConfirm.openConfirm(agent)}
                          className="text-destructive hover:text-destructive"
                          disabled={deleteMutation.isPending}
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
                title="No agents yet"
                description="Create an agent to start recording activity."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
