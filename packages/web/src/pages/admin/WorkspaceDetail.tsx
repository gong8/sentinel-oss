import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';

import { z } from 'zod';
import { useWorkspace } from '../../hooks/WorkspaceContext';

import {
  ConfirmDialog,
  DataTableCard,
  ErrorAlert,
  FormDialog,
  FormInput,
  FormTextarea,
} from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
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
import { useConfirmAction } from '../../hooks/useConfirmAction';
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const workspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

type WorkspaceFormValues = z.infer<typeof workspaceSchema>;

const addMemberSchema = z.object({
  userId: z.string().min(1, 'Select a user'),
});

type AddMemberFormValues = z.infer<typeof addMemberSchema>;

export default function AdminWorkspaceDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
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
  const workspaceQuery = trpc.admin.workspaces.get.useQuery(
    { id: id || '' },
    { enabled: Boolean(id) },
  );
  const membersQuery = trpc.admin.workspaceMembers.list.useQuery(
    { workspaceId: id || '' },
    { enabled: Boolean(id) },
  );
  const usersQuery = trpc.admin.users.list.useQuery();

  type Member = NonNullable<typeof membersQuery.data>[number];

  // State
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const removeConfirm = useConfirmAction<Member>();

  // Mutations
  const updateMutation = trpc.admin.workspaces.update.useMutation({
    onSuccess: () => {
      utils.admin.workspaces.get.invalidate({ id });
      utils.admin.workspaces.list.invalidate();
      setEditOpen(false);
    },
  });

  const addMemberMutation = trpc.admin.workspaceMembers.add.useMutation({
    onSuccess: () => {
      utils.admin.workspaceMembers.list.invalidate({ workspaceId: id });
      utils.admin.workspaces.get.invalidate({ id });
      utils.admin.workspaces.list.invalidate();
      setAddMemberOpen(false);
      addMemberForm.reset({ userId: '' });
    },
  });

  const removeMemberMutation = trpc.admin.workspaceMembers.remove.useMutation({
    onSuccess: () => {
      utils.admin.workspaceMembers.list.invalidate({ workspaceId: id });
      utils.admin.workspaces.get.invalidate({ id });
      utils.admin.workspaces.list.invalidate();
      removeConfirm.closeConfirm();
    },
  });

  // Forms
  const editForm = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      name: workspaceQuery.data?.name || '',
      description: workspaceQuery.data?.description || '',
    },
  });

  const addMemberForm = useForm<AddMemberFormValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { userId: '' },
  });

  // Error handling
  const errors = useMutationErrors([
    workspaceQuery,
    membersQuery,
    updateMutation,
    addMemberMutation,
    removeMemberMutation,
  ]);

  // Get available users (not already members)
  const memberUserIds = new Set(membersQuery.data?.map((m) => m.userId) ?? []);
  const availableUsers =
    usersQuery.data?.filter((u) => !memberUserIds.has(u.id) && !u.deletedAt) ?? [];

  // Form handlers
  const submitEdit = editForm.handleSubmit((values) => {
    if (!id) return;
    updateMutation.mutate({
      id,
      name: values.name,
      description: values.description || null,
    });
  });

  const submitAddMember = addMemberForm.handleSubmit((values) => {
    if (!id) return;
    addMemberMutation.mutate({
      workspaceId: id,
      userId: values.userId,
    });
  });

  const handleEditOpen = () => {
    editForm.reset({
      name: workspaceQuery.data?.name || '',
      description: workspaceQuery.data?.description || '',
    });
    setEditOpen(true);
  };

  if (!id) {
    return (
      <AdminLayout>
        <Alert variant="destructive">
          <AlertDescription>Invalid workspace ID</AlertDescription>
        </Alert>
      </AdminLayout>
    );
  }

  if (workspaceQuery.isPending) {
    return (
      <AdminLayout>
        <div className="space-y-8">
          <PageHeader title="Loading..." description="Loading workspace details" />
        </div>
      </AdminLayout>
    );
  }

  if (!workspaceQuery.data) {
    return (
      <AdminLayout>
        <div className="space-y-8">
          <PageHeader title="Not Found" description="Workspace not found" />
          <Button variant="outline" onClick={() => navigate(`${adminPrefix}/workspaces`)}>
            Back to Workspaces
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const workspace = workspaceQuery.data;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <PageHeader
            title={workspace.name}
            description={workspace.description || 'No description'}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`${adminPrefix}/workspaces`)}>
              Back
            </Button>
            <Button variant="outline" onClick={handleEditOpen}>
              Edit Details
            </Button>
          </div>
        </div>

        <ErrorAlert title="Error" errors={errors} />

        {/* Workspace Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Members</CardDescription>
              <CardTitle className="text-2xl">{workspace._count.members}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Policies</CardDescription>
              <CardTitle className="text-2xl">{workspace._count.policies}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>MCP Servers</CardDescription>
              <CardTitle className="text-2xl">{workspace._count.mcpServers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Agents</CardDescription>
              <CardTitle className="text-2xl">{workspace._count.agents}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Members Section */}
        <ConfirmDialog
          open={removeConfirm.isOpen}
          onOpenChange={(open) => !open && removeConfirm.closeConfirm()}
          title="Remove member"
          description={`Are you sure you want to remove ${removeConfirm.target?.user.email} from this workspace?`}
          isLoading={removeMemberMutation.isPending}
          onConfirm={() => {
            if (removeConfirm.target && id) {
              removeMemberMutation.mutate({
                workspaceId: id,
                userId: removeConfirm.target.userId,
              });
            }
          }}
          confirmText="Remove"
          loadingText="Removing..."
          confirmVariant="destructive"
        />

        <div className="flex justify-end">
          <Button onClick={() => setAddMemberOpen(true)} disabled={availableUsers.length === 0}>
            Add Member
          </Button>
        </div>

        <DataTableCard
          title="Members"
          description="Users who have access to this workspace."
          isLoading={membersQuery.isPending}
          isEmpty={!membersQuery.data || membersQuery.data.length === 0}
          emptyTitle="No members yet"
          emptyDescription="Add members to give them access to this workspace."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.data?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.user.email}
                    {member.user.deletedAt ? (
                      <Badge variant="secondary" className="ml-2">
                        Deleted
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'ADMIN' ? 'default' : 'outline'}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(member.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeConfirm.openConfirm(member)}
                      className="text-destructive hover:text-destructive"
                      disabled={removeMemberMutation.isPending}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableCard>

        {/* Edit Workspace Dialog */}
        <FormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          title="Edit workspace"
          description="Update workspace details."
          isSubmitting={updateMutation.isPending}
          submitText="Save changes"
          submittingText="Saving..."
          onSubmit={submitEdit}
        >
          <FormInput
            id="edit-name"
            label="Name"
            placeholder="Engineering"
            error={editForm.formState.errors.name?.message}
            register={editForm.register('name')}
          />
          <FormTextarea
            id="edit-description"
            label="Description"
            placeholder="Optional description for this workspace"
            error={editForm.formState.errors.description?.message}
            register={editForm.register('description')}
          />
        </FormDialog>

        {/* Add Member Dialog */}
        <FormDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          title="Add member"
          description="Add a user to this workspace. Their role will be automatically determined by their org-level admin status."
          isSubmitting={addMemberMutation.isPending}
          submitText="Add member"
          submittingText="Adding..."
          onSubmit={submitAddMember}
        >
          <div className="space-y-2">
            <Label htmlFor="add-user">User</Label>
            <Select
              value={addMemberForm.watch('userId')}
              onValueChange={(value) => addMemberForm.setValue('userId', value)}
            >
              <SelectTrigger id="add-user">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {addMemberForm.formState.errors.userId && (
              <p className="text-xs text-destructive">
                {addMemberForm.formState.errors.userId.message}
              </p>
            )}
            {availableUsers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                All users are already members of this workspace.
              </p>
            )}
          </div>
        </FormDialog>
      </div>
    </AdminLayout>
  );
}
