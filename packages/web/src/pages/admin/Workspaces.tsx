import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import {
  ConfirmDialog,
  DataTableCard,
  DeleteConfirmDialog,
  ErrorAlert,
  FormDialog,
  FormInput,
  FormTextarea,
} from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
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
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const workspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

type WorkspaceFormValues = z.infer<typeof workspaceSchema>;

export default function AdminWorkspaces(): React.ReactElement {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { selectedWorkspaceSlug, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  // Queries
  const workspacesQuery = trpc.admin.workspaces.list.useQuery({});

  type Workspace = NonNullable<typeof workspacesQuery.data>[number];

  // Confirmation dialogs
  const deleteConfirm = useConfirmAction<Workspace>();
  const restoreConfirm = useConfirmAction<Workspace>();

  // State
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  // Mutations
  const createMutation = trpc.admin.workspaces.create.useMutation({
    onSuccess: () => {
      utils.admin.workspaces.list.invalidate();
      setCreateOpen(false);
      createForm.reset();
    },
  });

  const updateMutation = trpc.admin.workspaces.update.useMutation({
    onSuccess: () => {
      utils.admin.workspaces.list.invalidate();
      setEditingWorkspace(null);
    },
  });

  const deleteMutation = trpc.admin.workspaces.delete.useMutation({
    onSuccess: () => {
      utils.admin.workspaces.list.invalidate();
      deleteConfirm.closeConfirm();
    },
  });

  const restoreMutation = trpc.admin.workspaces.restore.useMutation({
    onSuccess: () => {
      utils.admin.workspaces.list.invalidate();
      restoreConfirm.closeConfirm();
    },
  });

  const deletionImpactQuery = trpc.admin.workspaces.getDeletionImpact.useQuery(
    { id: deleteConfirm.target?.id || '' },
    { enabled: deleteConfirm.isOpen && deleteConfirm.target?.deletedAt === null },
  );

  // Forms
  const createForm = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: { name: '', description: '' },
  });

  const updateForm = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: { name: '', description: '' },
  });

  // Error handling
  const errors = useMutationErrors([
    workspacesQuery,
    createMutation,
    updateMutation,
    deleteMutation,
    restoreMutation,
  ]);

  // Form handlers
  const submitCreate = createForm.handleSubmit((values) => {
    createMutation.mutate({
      name: values.name,
      description: values.description || undefined,
    });
  });

  const submitUpdate = updateForm.handleSubmit((values) => {
    if (!editingWorkspace) return;
    updateMutation.mutate({
      id: editingWorkspace.id,
      name: values.name,
      description: values.description || null,
    });
  });

  const handleEdit = (workspace: Workspace) => {
    setEditingWorkspace(workspace);
    updateForm.reset({
      name: workspace.name,
      description: workspace.description || '',
    });
  };

  // Filter workspaces based on deleted status
  const activeWorkspaces = workspacesQuery.data?.filter((w) => w.deletedAt === null) ?? [];
  const deletedWorkspaces = workspacesQuery.data?.filter((w) => w.deletedAt !== null) ?? [];
  const displayedWorkspaces = showDeleted ? deletedWorkspaces : activeWorkspaces;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Workspaces"
          description="Manage workspaces to organize users, policies, and resources."
        />

        <ErrorAlert title="Failed to load workspaces" errors={errors} />

        <DeleteConfirmDialog
          open={deleteConfirm.isOpen}
          onOpenChange={(open) => !open && deleteConfirm.closeConfirm()}
          title="Delete workspace"
          itemName={deleteConfirm.target?.name ?? ''}
          description="This will soft delete the workspace. Members will be removed and resources will need to be reassigned."
          isLoadingImpact={deletionImpactQuery.isPending}
          impact={deletionImpactQuery.data}
          isDeleting={deleteMutation.isPending}
          onConfirm={() => {
            if (deleteConfirm.target) {
              deleteMutation.mutate({ id: deleteConfirm.target.id });
            }
          }}
        />

        <ConfirmDialog
          open={restoreConfirm.isOpen}
          onOpenChange={(open) => !open && restoreConfirm.closeConfirm()}
          title="Restore workspace"
          description={`Are you sure you want to restore the workspace "${restoreConfirm.target?.name}"? This will make it active again, but you will need to re-add members.`}
          isLoading={restoreMutation.isPending}
          onConfirm={() => {
            if (restoreConfirm.target) {
              restoreMutation.mutate({ id: restoreConfirm.target.id });
            }
          }}
          confirmText="Restore"
          loadingText="Restoring..."
        />

        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button
              variant={showDeleted ? 'outline' : 'default'}
              size="sm"
              onClick={() => setShowDeleted(false)}
            >
              Active ({activeWorkspaces.length})
            </Button>
            <Button
              variant={showDeleted ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowDeleted(true)}
            >
              Deleted ({deletedWorkspaces.length})
            </Button>
          </div>
          <Button onClick={() => setCreateOpen(true)}>Create workspace</Button>
        </div>

        <DataTableCard
          title={showDeleted ? 'Deleted Workspaces' : 'Workspaces'}
          description={
            showDeleted
              ? 'Workspaces that have been deleted. They can be restored.'
              : 'All active workspaces in this organization.'
          }
          isLoading={workspacesQuery.isPending}
          isEmpty={displayedWorkspaces.length === 0}
          emptyTitle={showDeleted ? 'No deleted workspaces' : 'No workspaces yet'}
          emptyDescription={
            showDeleted
              ? 'Deleted workspaces will appear here.'
              : 'Create your first workspace to start organizing resources.'
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Policies</TableHead>
                <TableHead>Servers</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedWorkspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell className="font-medium">
                    <button
                      className="hover:underline text-left"
                      onClick={() => navigate(`${adminPrefix}/workspaces/${workspace.id}`)}
                    >
                      {workspace.name}
                    </button>
                    {workspace.deletedAt ? (
                      <Badge variant="secondary" className="ml-2">
                        Deleted
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">
                    {workspace.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{workspace._count.members}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{workspace._count.policies}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{workspace._count.mcpServers}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(workspace.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {workspace.deletedAt ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreConfirm.openConfirm(workspace)}
                          disabled={restoreMutation.isPending}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`${adminPrefix}/workspaces/${workspace.id}`)}
                          >
                            Manage
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleEdit(workspace)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteConfirm.openConfirm(workspace)}
                            className="text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableCard>

        <FormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Create workspace"
          description="Create a new workspace to organize users and resources."
          isSubmitting={createMutation.isPending}
          submitText="Create workspace"
          submittingText="Creating..."
          onSubmit={submitCreate}
        >
          <FormInput
            id="create-name"
            label="Name"
            placeholder="Engineering"
            error={createForm.formState.errors.name?.message}
            register={createForm.register('name')}
          />
          <FormTextarea
            id="create-description"
            label="Description"
            placeholder="Optional description for this workspace"
            error={createForm.formState.errors.description?.message}
            register={createForm.register('description')}
          />
        </FormDialog>

        <FormDialog
          open={Boolean(editingWorkspace)}
          onOpenChange={() => setEditingWorkspace(null)}
          title="Edit workspace"
          description="Update workspace details for"
          highlightName={editingWorkspace?.name}
          isSubmitting={updateMutation.isPending}
          submitText="Save changes"
          submittingText="Saving..."
          onSubmit={submitUpdate}
        >
          <FormInput
            id="update-name"
            label="Name"
            placeholder="Engineering"
            error={updateForm.formState.errors.name?.message}
            register={updateForm.register('name')}
          />
          <FormTextarea
            id="update-description"
            label="Description"
            placeholder="Optional description for this workspace"
            error={updateForm.formState.errors.description?.message}
            register={updateForm.register('description')}
          />
        </FormDialog>
      </div>
    </AdminLayout>
  );
}
