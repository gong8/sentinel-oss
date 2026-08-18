import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  ConfirmDialog,
  DataTableCard,
  DeleteConfirmDialog,
  ErrorAlert,
  FormDialog,
  FormInput,
  RoleCheckboxList,
  TokenDisplayDialog,
} from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/button';
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
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const createUserSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  roleIds: z.array(z.string()).min(1, 'Select at least one role.'),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const updateRolesSchema = z.object({
  roleIds: z.array(z.string()).min(1, 'Select at least one role.'),
});

type UpdateRolesValues = z.infer<typeof updateRolesSchema>;

interface UserRole {
  roleId: string;
}

function isUserRoleArray(value: unknown): value is UserRole[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      'roleId' in item &&
      typeof item.roleId === 'string',
  );
}

function getUserRoleIds(userRoles: unknown): string[] {
  return isUserRoleArray(userRoles) ? userRoles.map((ur) => ur.roleId) : [];
}

interface NavigationState {
  openCreateModal?: boolean;
}

export default function AdminUsers(): React.ReactElement {
  const navState = useNavigationState<NavigationState>();
  const utils = trpc.useUtils();

  // Queries
  const usersQuery = trpc.admin.users.list.useQuery();
  const rolesQuery = trpc.admin.roles.list.useQuery();
  const currentUserQuery = trpc.user.profile.get.useQuery();

  type User = NonNullable<typeof usersQuery.data>[number];

  // Confirmation dialogs
  const deleteConfirm = useConfirmAction<User>();
  const refreshConfirm = useConfirmAction<User>();
  const revokeConfirm = useConfirmAction<User>();

  // State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(() => Boolean(navState?.openCreateModal));
  const [tokenInfo, setTokenInfo] = useState<{ email: string; token: string } | null>(null);

  // Mutations
  const createMutation = trpc.admin.users.create.useMutation({
    onSuccess: (data) => {
      utils.admin.users.list.invalidate();
      if (data.accessToken) {
        setTokenInfo({ email: data.email, token: data.accessToken });
      }
    },
  });

  const updateMutation = trpc.admin.users.update.useMutation({
    onSuccess: () => utils.admin.users.list.invalidate(),
  });

  const deleteMutation = trpc.admin.users.delete.useMutation({
    onSuccess: () => {
      utils.admin.users.list.invalidate();
      deleteConfirm.closeConfirm();
    },
  });

  const deletionImpactQuery = trpc.admin.users.getDeletionImpact.useQuery(
    { id: deleteConfirm.target?.id || '' },
    { enabled: deleteConfirm.isOpen },
  );

  const refreshMutation = trpc.admin.users.refreshToken.useMutation({
    onSuccess: (data, variables) => {
      utils.admin.users.list.invalidate();
      const user = usersQuery.data?.find((u) => u.id === variables.id);
      if (user) {
        setTokenInfo({ email: user.email, token: data.accessToken });
      }
      refreshConfirm.closeConfirm();
    },
  });

  const revokeMutation = trpc.admin.users.revokeToken.useMutation({
    onSuccess: () => {
      utils.admin.users.list.invalidate();
      revokeConfirm.closeConfirm();
    },
  });

  // Get default role (first non-admin role, or first role if none)
  const defaultRoleId =
    rolesQuery.data?.find((r: { isAdmin: boolean; id: string }) => !r.isAdmin)?.id ||
    rolesQuery.data?.[0]?.id;

  // Forms
  const createForm = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', roleIds: defaultRoleId ? [defaultRoleId] : [] },
  });

  const updateForm = useForm<UpdateRolesValues>({
    resolver: zodResolver(updateRolesSchema),
    defaultValues: { roleIds: [] },
  });

  const createFormRoleIds = useWatch({ control: createForm.control, name: 'roleIds' });
  const updateFormRoleIds = useWatch({ control: updateForm.control, name: 'roleIds' });

  // Reset update form when editing user changes
  useEffect(() => {
    if (editingUser && rolesQuery.data && 'userRoles' in editingUser) {
      updateForm.reset({ roleIds: getUserRoleIds(editingUser.userRoles) });
    }
  }, [editingUser, updateForm, rolesQuery.data]);

  // Set default role in create form when loaded
  useEffect(() => {
    if (defaultRoleId && createForm.getValues('roleIds').length === 0) {
      createForm.reset({ email: '', roleIds: [defaultRoleId] });
    }
  }, [defaultRoleId, createForm]);

  // Error handling
  const errors = useMutationErrors([
    usersQuery,
    createMutation,
    updateMutation,
    deleteMutation,
    refreshMutation,
    revokeMutation,
  ]);

  // Helpers
  const currentUserId = currentUserQuery.data?.id;
  const isCurrentUser = (user: User): boolean => user.id === currentUserId;

  const roles =
    rolesQuery.data?.map((r: { id: string; name: string; isAdmin: boolean }) => ({
      id: r.id,
      name: r.name,
      isAdmin: r.isAdmin,
    })) ?? [];

  function getRoleNames(user: User): string {
    if (!('userRoles' in user) || !isUserRoleArray(user.userRoles)) {
      return '-';
    }
    const names = user.userRoles
      .map((ur) => {
        const role = rolesQuery.data?.find((r: { id: string; name: string }) => r.id === ur.roleId);
        return role?.name ?? null;
      })
      .filter(Boolean);
    return names.join(', ') || '-';
  }

  function getDisabledRoleIds(user: User | null): string[] {
    if (!user || !isCurrentUser(user)) return [];

    const hasAdminRole =
      'userRoles' in user &&
      isUserRoleArray(user.userRoles) &&
      user.userRoles.some((ur) => {
        const role = rolesQuery.data?.find(
          (r: { id: string; isAdmin: boolean }) => r.id === ur.roleId,
        );
        return role?.isAdmin;
      });

    if (!hasAdminRole) return [];

    // Prevent removing own admin role
    const adminRoleIds =
      rolesQuery.data
        ?.filter((r: { id: string; isAdmin: boolean }) => r.isAdmin)
        .map((r: { id: string }) => r.id) ?? [];
    const selectedRoleIds = getUserRoleIds(user.userRoles);
    return adminRoleIds.filter((id: string) => selectedRoleIds.includes(id));
  }

  // Form handlers
  const submitCreate = createForm.handleSubmit((values) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        createForm.reset({ email: '', roleIds: defaultRoleId ? [defaultRoleId] : [] });
        setCreateUserOpen(false);
      },
    });
  });

  const submitUpdate = updateForm.handleSubmit((values) => {
    if (!editingUser) return;
    updateMutation.mutate(
      { id: editingUser.id, roleIds: values.roleIds },
      { onSuccess: () => setEditingUser(null) },
    );
  });

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader title="Users" description="Manage organization members and access tokens." />

        <ErrorAlert title="Failed to load users" errors={errors} />

        <TokenDisplayDialog tokenInfo={tokenInfo} onClose={() => setTokenInfo(null)} />

        <DeleteConfirmDialog
          open={deleteConfirm.isOpen}
          onOpenChange={(open) => !open && deleteConfirm.closeConfirm()}
          title="Delete user"
          itemName={deleteConfirm.target?.email ?? ''}
          description="This will soft delete the user and they can be restored later."
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
          open={refreshConfirm.isOpen}
          onOpenChange={(open) => !open && refreshConfirm.closeConfirm()}
          title="Refresh access token"
          description={`Are you sure you want to refresh the access token for ${refreshConfirm.target?.email}? The current token will be invalidated immediately.`}
          isLoading={refreshMutation.isPending}
          onConfirm={() => {
            if (refreshConfirm.target) {
              refreshMutation.mutate({ id: refreshConfirm.target.id });
            }
          }}
          confirmText="Refresh token"
          loadingText="Refreshing..."
        />

        <ConfirmDialog
          open={revokeConfirm.isOpen}
          onOpenChange={(open) => !open && revokeConfirm.closeConfirm()}
          title="Revoke access token"
          description={`Are you sure you want to revoke the access token for ${revokeConfirm.target?.email}? The user will immediately lose API access and will need their token refreshed by an admin to regain access.`}
          alertText="This action invalidates the user's current token. Unlike deleting the user, their account remains active but they cannot authenticate until a new token is issued."
          isLoading={revokeMutation.isPending}
          onConfirm={() => {
            if (revokeConfirm.target) {
              revokeMutation.mutate({ id: revokeConfirm.target.id });
            }
          }}
          confirmText="Revoke token"
          loadingText="Revoking..."
          confirmVariant="destructive"
        />

        <div className="flex justify-end">
          <Button onClick={() => setCreateUserOpen(true)}>Create user</Button>
        </div>

        <DataTableCard
          title="Users"
          description="All users in this organization."
          isLoading={usersQuery.isPending}
          isEmpty={!usersQuery.data || usersQuery.data.length === 0}
          emptyTitle="No users yet"
          emptyDescription="Create the first user to start managing roles."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.data?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell className="text-muted-foreground">{getRoleNames(user)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.lastActivityAt ? formatDateTime(user.lastActivityAt) : 'Never'}
                  </TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>
                        Edit roles
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refreshConfirm.openConfirm(user)}
                        disabled={refreshMutation.isPending || isCurrentUser(user)}
                      >
                        Refresh token
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revokeConfirm.openConfirm(user)}
                        disabled={
                          revokeMutation.isPending || isCurrentUser(user) || user.isTokenRevoked
                        }
                      >
                        {user.isTokenRevoked ? 'Token Revoked' : 'Revoke Token'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteConfirm.openConfirm(user)}
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending || isCurrentUser(user)}
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
          open={createUserOpen}
          onOpenChange={setCreateUserOpen}
          title="Create user"
          description="Invite a new user and assign their initial roles."
          isSubmitting={createMutation.isPending}
          submitText="Create user"
          submittingText="Creating..."
          onSubmit={submitCreate}
        >
          <FormInput
            id="create-email"
            label="Email"
            type="email"
            placeholder="name@company.com"
            error={createForm.formState.errors.email?.message}
            register={createForm.register('email')}
          />
          <div className="space-y-3">
            <Label>Roles</Label>
            {rolesQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading roles...</p>
            ) : roles.length > 0 ? (
              <RoleCheckboxList
                roles={roles}
                selectedRoleIds={createFormRoleIds}
                onChange={(roleIds) => createForm.setValue('roleIds', roleIds)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No roles available. Create roles first.
              </p>
            )}
            {createForm.formState.errors.roleIds && (
              <p className="text-xs text-destructive">
                {createForm.formState.errors.roleIds.message}
              </p>
            )}
          </div>
        </FormDialog>

        <FormDialog
          open={Boolean(editingUser)}
          onOpenChange={() => setEditingUser(null)}
          title="Update roles"
          description="Adjust access for"
          highlightName={editingUser?.email}
          isSubmitting={updateMutation.isPending}
          submitText="Save roles"
          submittingText="Saving..."
          onSubmit={submitUpdate}
        >
          <div className="space-y-3">
            <Label>Roles</Label>
            {rolesQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading roles...</p>
            ) : roles.length > 0 ? (
              <RoleCheckboxList
                roles={roles}
                selectedRoleIds={updateFormRoleIds}
                onChange={(roleIds) => updateForm.setValue('roleIds', roleIds)}
                disabledRoleIds={getDisabledRoleIds(editingUser)}
                additionalWarning={
                  editingUser && isCurrentUser(editingUser)
                    ? 'You cannot remove your own admin role.'
                    : undefined
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">No roles available.</p>
            )}
            {updateForm.formState.errors.roleIds && (
              <p className="text-xs text-destructive">
                {updateForm.formState.errors.roleIds.message}
              </p>
            )}
          </div>
        </FormDialog>
      </div>
    </AdminLayout>
  );
}
