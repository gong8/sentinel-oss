import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  DataTableCard,
  DeleteConfirmDialog,
  ErrorAlert,
  FormDialog,
  FormInput,
  FormTextarea,
} from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
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
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const roleSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(100, 'Name is too long.'),
  description: z.string().optional(),
});

type RoleFormValues = z.infer<typeof roleSchema>;

export default function AdminRoles(): React.ReactElement {
  const utils = trpc.useUtils();
  const rolesQuery = trpc.admin.roles.list.useQuery();
  type Role = NonNullable<typeof rolesQuery.data>[number];

  const deleteConfirm = useConfirmAction<Role>();
  const [creatingRole, setCreatingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const createForm = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', description: '' },
  });

  const updateForm = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', description: '' },
  });

  const createMutation = trpc.admin.roles.create.useMutation({
    onSuccess: () => {
      utils.admin.roles.list.invalidate();
      setCreatingRole(false);
      createForm.reset();
    },
  });

  const updateMutation = trpc.admin.roles.update.useMutation({
    onSuccess: () => {
      utils.admin.roles.list.invalidate();
      setEditingRole(null);
    },
  });

  const deleteMutation = trpc.admin.roles.delete.useMutation({
    onSuccess: () => {
      utils.admin.roles.list.invalidate();
      deleteConfirm.closeConfirm();
    },
  });

  const deletionImpactQuery = trpc.admin.roles.getDeletionImpact.useQuery(
    { id: deleteConfirm.target?.id || '' },
    { enabled: deleteConfirm.isOpen },
  );

  useEffect(() => {
    if (editingRole) {
      updateForm.reset({
        name: editingRole.name,
        description: editingRole.description || '',
      });
    }
  }, [editingRole, updateForm]);

  const errors = useMutationErrors([rolesQuery, createMutation, updateMutation, deleteMutation]);

  const submitCreate = createForm.handleSubmit((values) => {
    createMutation.mutate(values);
  });

  const submitUpdate = updateForm.handleSubmit((values) => {
    if (!editingRole) return;
    updateMutation.mutate({ id: editingRole.id, ...values });
  });

  function handleCloseCreate(): void {
    setCreatingRole(false);
    createForm.reset();
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Roles"
          description="Manage roles and permissions for your organization."
        />

        <ErrorAlert title="Failed to load roles" errors={errors} />

        <div className="flex justify-end">
          <Button onClick={() => setCreatingRole(true)}>Create role</Button>
        </div>

        <DataTableCard
          title="Roles"
          description="All roles in this organization."
          isLoading={rolesQuery.isPending}
          isEmpty={!rolesQuery.data || rolesQuery.data.length === 0}
          emptyTitle="No roles yet"
          emptyDescription="Create the first role to start managing permissions."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rolesQuery.data?.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="text-muted-foreground">{role.description || '-'}</TableCell>
                  <TableCell>{formatDateTime(role.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingRole(role)}
                        disabled={role.isAdmin}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteConfirm.openConfirm(role)}
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending || role.isAdmin}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableCard>

        <FormDialog
          open={creatingRole}
          onOpenChange={handleCloseCreate}
          title="Create role"
          description="Define a new role for your organization. Name a role Admin to make it an admin role."
          isSubmitting={createMutation.isPending}
          submitText="Create role"
          submittingText="Creating..."
          onSubmit={submitCreate}
        >
          <FormInput
            id="create-name"
            label="Name"
            placeholder="Developer"
            error={createForm.formState.errors.name?.message}
            register={createForm.register('name')}
          />
          <FormTextarea
            id="create-description"
            label="Description"
            placeholder="Role description"
            error={createForm.formState.errors.description?.message}
            hint="Tip: Name a role Admin to make it an admin role. Admin roles are exclusive - users with admin role cannot have other roles."
            register={createForm.register('description')}
          />
        </FormDialog>

        <FormDialog
          open={Boolean(editingRole)}
          onOpenChange={() => setEditingRole(null)}
          title="Update role"
          description="Edit role details for"
          highlightName={editingRole?.name}
          isSubmitting={updateMutation.isPending}
          submitText="Save changes"
          submittingText="Saving..."
          onSubmit={submitUpdate}
        >
          <FormInput
            id="edit-name"
            label="Name"
            error={updateForm.formState.errors.name?.message}
            register={updateForm.register('name')}
          />
          <FormTextarea
            id="edit-description"
            label="Description"
            error={updateForm.formState.errors.description?.message}
            register={updateForm.register('description')}
          />
        </FormDialog>

        <DeleteConfirmDialog
          open={deleteConfirm.isOpen}
          onOpenChange={(open) => !open && deleteConfirm.closeConfirm()}
          title="Delete role"
          itemName={deleteConfirm.target?.name ?? ''}
          description="This will soft delete the role and it can be restored later."
          isLoadingImpact={deletionImpactQuery.isPending}
          impact={deletionImpactQuery.data}
          isDeleting={deleteMutation.isPending}
          onConfirm={() => {
            if (deleteConfirm.target) {
              deleteMutation.mutate({ id: deleteConfirm.target.id });
            }
          }}
        />
      </div>
    </AdminLayout>
  );
}
