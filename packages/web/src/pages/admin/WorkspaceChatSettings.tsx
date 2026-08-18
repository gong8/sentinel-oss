/**
 * Workspace Chat Settings Page
 * Admin page for managing workspace chat configuration
 */

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { SettingsPageLayout } from '../../components/layout/SettingsPageLayout';
import {
  SettingsCard,
  SettingsDivider,
  SettingsItem,
} from '../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { trpc } from '../../lib/trpc';

const llmProviderSchema = z.enum(['CLAUDE', 'OPENAI', 'GEMINI']);

const updateSettingsSchema = z.object({
  enabled: z.boolean(),
  adminChatVisibility: z.boolean(),
  systemPrompt: z.string().max(10000).optional().nullable(),
  monthlyMessageQuota: z.number().int().min(0).optional().nullable(),
  monthlyTokenQuota: z.number().int().min(0).optional().nullable(),
  defaultLlmProvider: llmProviderSchema.optional().nullable(),
  defaultLlmModel: z.string().max(100).optional().nullable(),
});

type UpdateSettingsValues = z.infer<typeof updateSettingsSchema>;

export default function WorkspaceChatSettings() {
  const { selectedWorkspaceId } = useWorkspace();
  const utils = trpc.useUtils();

  // Fetch available providers
  const providersQuery = trpc.user.llmConfig.getProviders.useQuery();

  const settingsQuery = trpc.workspace.chatSettings.get.useQuery(
    { workspaceId: selectedWorkspaceId ?? '' },
    { enabled: !!selectedWorkspaceId },
  );

  const usageQuery = trpc.workspace.chatSettings.getUsageStats.useQuery(
    { workspaceId: selectedWorkspaceId ?? '' },
    { enabled: !!selectedWorkspaceId },
  );

  const updateMutation = trpc.workspace.chatSettings.update.useMutation({
    onSuccess: () => {
      utils.workspace.chatSettings.get.invalidate({ workspaceId: selectedWorkspaceId! });
      setIsEditing(false);
      setSuccessMessage('Chat settings updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const [isEditing, setIsEditing] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const form = useForm<UpdateSettingsValues>({
    resolver: zodResolver(updateSettingsSchema),
    defaultValues: {
      enabled: true,
      adminChatVisibility: false,
      systemPrompt: null,
      monthlyMessageQuota: null,
      monthlyTokenQuota: null,
      defaultLlmProvider: null,
      defaultLlmModel: null,
    },
  });

  // Watch form values for controlled components
  const watchedEnabled = useWatch({ control: form.control, name: 'enabled' });
  const watchedAdminChatVisibility = useWatch({
    control: form.control,
    name: 'adminChatVisibility',
  });
  const watchedDefaultLlmProvider = useWatch({ control: form.control, name: 'defaultLlmProvider' });
  const watchedDefaultLlmModel = useWatch({ control: form.control, name: 'defaultLlmModel' });

  // Sync form when data loads
  React.useEffect(() => {
    if (settingsQuery.data && !isEditing) {
      form.reset({
        enabled: settingsQuery.data.enabled,
        adminChatVisibility: settingsQuery.data.adminChatVisibility,
        systemPrompt: settingsQuery.data.systemPrompt,
        monthlyMessageQuota: settingsQuery.data.monthlyMessageQuota,
        monthlyTokenQuota: settingsQuery.data.monthlyTokenQuota,
        defaultLlmProvider: settingsQuery.data.defaultLlmProvider,
        defaultLlmModel: settingsQuery.data.defaultLlmModel,
      });
    }
  }, [settingsQuery.data, isEditing, form]);

  function handleEdit(): void {
    setIsEditing(true);
    setSuccessMessage(null);
  }

  function handleCancel(): void {
    if (settingsQuery.data) {
      form.reset({
        enabled: settingsQuery.data.enabled,
        adminChatVisibility: settingsQuery.data.adminChatVisibility,
        systemPrompt: settingsQuery.data.systemPrompt,
        monthlyMessageQuota: settingsQuery.data.monthlyMessageQuota,
        monthlyTokenQuota: settingsQuery.data.monthlyTokenQuota,
        defaultLlmProvider: settingsQuery.data.defaultLlmProvider,
        defaultLlmModel: settingsQuery.data.defaultLlmModel,
      });
    }
    setIsEditing(false);
  }

  function handleSubmit(values: UpdateSettingsValues): void {
    if (!selectedWorkspaceId) return;

    updateMutation.mutate({
      workspaceId: selectedWorkspaceId,
      ...values,
    });
  }

  if (!selectedWorkspaceId) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>No workspace selected</AlertTitle>
          <AlertDescription>Please select a workspace to manage chat settings.</AlertDescription>
        </Alert>
      </SettingsPageLayout>
    );
  }

  if (settingsQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="space-y-6">
          <SettingsCard title="Chat Settings" description="Loading chat configuration...">
            <div className="space-y-4">
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          </SettingsCard>
        </div>
      </SettingsPageLayout>
    );
  }

  if (settingsQuery.error) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>Failed to load chat settings</AlertTitle>
          <AlertDescription>{settingsQuery.error.message}</AlertDescription>
        </Alert>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        {successMessage && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <AlertDescription className="text-green-800 dark:text-green-200">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Chat Configuration Card */}
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <SettingsCard
            title="Chat Configuration"
            description="Configure workspace agent chat settings."
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
              label="Enable Chat"
              description="Allow workspace members to use the AI chat agent"
            >
              <Switch
                checked={watchedEnabled}
                onCheckedChange={(checked) => form.setValue('enabled', checked)}
                disabled={!isEditing}
              />
            </SettingsItem>

            <SettingsDivider />

            <SettingsItem
              label="Admin Chat Visibility"
              description="Allow workspace admins to view all user conversations"
            >
              <Switch
                checked={watchedAdminChatVisibility}
                onCheckedChange={(checked) => form.setValue('adminChatVisibility', checked)}
                disabled={!isEditing}
              />
            </SettingsItem>

            <SettingsDivider />

            <SettingsItem
              label="System Prompt"
              description="Custom system prompt for the chat agent"
              vertical
            >
              {isEditing ? (
                <Textarea
                  placeholder="Enter a custom system prompt for the workspace agent..."
                  className="max-w-2xl min-h-[100px]"
                  {...form.register('systemPrompt')}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {settingsQuery.data?.systemPrompt ?? 'Using default system prompt'}
                </p>
              )}
            </SettingsItem>

            <SettingsDivider />

            <SettingsItem
              label="Default LLM Provider"
              description="The default LLM provider for workspace chats"
            >
              {isEditing ? (
                <Select
                  value={watchedDefaultLlmProvider ?? '_default'}
                  onValueChange={(value) => {
                    if (value === '_default') {
                      form.setValue('defaultLlmProvider', null);
                    } else {
                      const parsed = llmProviderSchema.safeParse(value);
                      if (parsed.success) {
                        form.setValue('defaultLlmProvider', parsed.data);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">Default (Claude)</SelectItem>
                    {providersQuery.data?.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id.toUpperCase()}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium">
                  {providersQuery.data?.find(
                    (p) => p.id.toUpperCase() === settingsQuery.data?.defaultLlmProvider,
                  )?.name ?? 'Default (Claude)'}
                </span>
              )}
            </SettingsItem>

            <SettingsDivider />

            <SettingsItem label="Default Model" description="The specific model to use">
              {isEditing ? (
                <Select
                  value={watchedDefaultLlmModel ?? '_default'}
                  onValueChange={(value) =>
                    form.setValue('defaultLlmModel', value === '_default' ? null : value)
                  }
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">Default</SelectItem>
                    {providersQuery.data
                      ?.find((p) => p.id.toUpperCase() === watchedDefaultLlmProvider)
                      ?.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium">
                  {settingsQuery.data?.defaultLlmModel ?? 'Default'}
                </span>
              )}
            </SettingsItem>

            {updateMutation.error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Update Failed</AlertTitle>
                <AlertDescription>{updateMutation.error.message}</AlertDescription>
              </Alert>
            )}
          </SettingsCard>
        </form>

        {/* Quota Configuration Card */}
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <SettingsCard
            title="Usage Quotas"
            description="Set monthly usage limits for workspace chat."
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
              label="Monthly Message Quota"
              description="Maximum messages per user per month (0 = unlimited)"
            >
              {isEditing ? (
                <Input
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  className="max-w-[150px]"
                  {...form.register('monthlyMessageQuota', { valueAsNumber: true })}
                />
              ) : (
                <span className="text-sm font-medium">
                  {settingsQuery.data?.monthlyMessageQuota ?? 'Unlimited'}
                </span>
              )}
            </SettingsItem>

            <SettingsDivider />

            <SettingsItem
              label="Monthly Token Quota"
              description="Maximum tokens per user per month (0 = unlimited)"
            >
              {isEditing ? (
                <Input
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  className="max-w-[150px]"
                  {...form.register('monthlyTokenQuota', { valueAsNumber: true })}
                />
              ) : (
                <span className="text-sm font-medium">
                  {settingsQuery.data?.monthlyTokenQuota?.toLocaleString() ?? 'Unlimited'}
                </span>
              )}
            </SettingsItem>
          </SettingsCard>
        </form>

        {/* Usage Statistics Card */}
        <SettingsCard
          title="Usage Statistics"
          description="Current month usage across all workspace members."
        >
          {usageQuery.isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-32" />
            </div>
          ) : usageQuery.error ? (
            <Alert variant="destructive">
              <AlertDescription>{usageQuery.error.message}</AlertDescription>
            </Alert>
          ) : (
            <>
              <SettingsItem label="Total Messages" description="Messages sent this month">
                <span className="text-sm font-medium">
                  {usageQuery.data?.totalMessages?.toLocaleString() ?? 0}
                  {settingsQuery.data?.monthlyMessageQuota && (
                    <span className="text-muted-foreground">
                      {' '}
                      / {settingsQuery.data.monthlyMessageQuota.toLocaleString()}
                    </span>
                  )}
                </span>
              </SettingsItem>

              <SettingsDivider />

              <SettingsItem label="Total Tokens" description="Tokens used this month">
                <span className="text-sm font-medium">
                  {(
                    (usageQuery.data?.totalInputTokens ?? 0) +
                    (usageQuery.data?.totalOutputTokens ?? 0)
                  ).toLocaleString()}
                  {settingsQuery.data?.monthlyTokenQuota && (
                    <span className="text-muted-foreground">
                      {' '}
                      / {settingsQuery.data.monthlyTokenQuota.toLocaleString()}
                    </span>
                  )}
                </span>
              </SettingsItem>

              <SettingsDivider />

              <SettingsItem label="Active Users" description="Users who sent messages this month">
                <span className="text-sm font-medium">{usageQuery.data?.byUser?.length ?? 0}</span>
              </SettingsItem>
            </>
          )}
        </SettingsCard>
      </div>
    </SettingsPageLayout>
  );
}
