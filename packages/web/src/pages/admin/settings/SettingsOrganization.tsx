import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import {
  SettingsCard,
  SettingsDivider,
  SettingsItem,
} from '../../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Skeleton } from '../../../components/ui/skeleton';
import { trpc } from '../../../lib/trpc';

const updateOrgSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100),
});

type UpdateOrgValues = z.infer<typeof updateOrgSchema>;

export default function SettingsOrganization() {
  const utils = trpc.useUtils();
  const orgQuery = trpc.admin.organizations.get.useQuery();
  const updateMutation = trpc.admin.organizations.update.useMutation({
    onSuccess: () => {
      utils.admin.organizations.get.invalidate();
      setIsEditing(false);
      setSuccessMessage('Organization updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const [isEditing, setIsEditing] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const form = useForm<UpdateOrgValues>({
    resolver: zodResolver(updateOrgSchema),
    defaultValues: { name: '' },
  });

  function syncForm(): void {
    if (orgQuery.data) {
      form.reset({ name: orgQuery.data.name });
    }
  }

  function handleEdit(): void {
    syncForm();
    setIsEditing(true);
    setSuccessMessage(null);
  }

  function handleCancel(): void {
    syncForm();
    setIsEditing(false);
  }

  function handleSubmit(values: UpdateOrgValues): void {
    updateMutation.mutate(values);
  }

  if (orgQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="space-y-6">
          <SettingsCard title="Organization Details" description="Your organization information.">
            <div className="space-y-4">
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          </SettingsCard>
        </div>
      </SettingsPageLayout>
    );
  }

  if (orgQuery.error) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>Failed to load organization</AlertTitle>
          <AlertDescription>{orgQuery.error.message}</AlertDescription>
        </Alert>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        {successMessage && (
          <Alert variant="success">
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <SettingsCard
            title="Organization Details"
            description="Manage your organization settings."
            actions={
              isEditing ? (
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={handleEdit}>
                  Edit
                </Button>
              )
            }
          >
            <SettingsItem
              label="Organization Name"
              description="The display name for your organization"
              vertical
            >
              {isEditing ? (
                <div className="space-y-1">
                  <Input
                    id="name"
                    placeholder="My Organization"
                    className="max-w-md"
                    {...form.register('name')}
                  />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm font-medium">{orgQuery.data?.name}</p>
              )}
            </SettingsItem>

            <SettingsDivider />

            <SettingsItem label="Organization ID" description="Unique identifier for API calls">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                {orgQuery.data?.id}
              </code>
            </SettingsItem>

            <SettingsDivider />

            <SettingsItem label="Created" description="When this organization was created">
              <span className="text-sm text-muted-foreground">
                {orgQuery.data?.createdAt &&
                  new Date(orgQuery.data.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
              </span>
            </SettingsItem>

            {updateMutation.error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Update Failed</AlertTitle>
                <AlertDescription>{updateMutation.error.message}</AlertDescription>
              </Alert>
            )}
          </SettingsCard>
        </form>
      </div>
    </SettingsPageLayout>
  );
}
