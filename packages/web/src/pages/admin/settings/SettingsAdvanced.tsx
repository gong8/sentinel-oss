import * as React from 'react';

import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import {
  SettingsCard,
  SettingsDivider,
  SettingsItem,
} from '../../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { trpc } from '../../../lib/trpc';

const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
];

export default function SettingsAdvanced() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.admin.orgSettings.get.useQuery();
  const updateMutation = trpc.admin.orgSettings.update.useMutation({
    onSuccess: () => {
      utils.admin.orgSettings.get.invalidate();
      setSuccessMessage('Settings updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [localRetention, setLocalRetention] = React.useState<string>('');
  const [localTimezone, setLocalTimezone] = React.useState<string>('');
  const [localConditionMode, setLocalConditionMode] = React.useState<'SIMPLE' | 'ADVANCED'>(
    'SIMPLE',
  );

  // Sync local state when data loads
  React.useEffect(() => {
    if (settingsQuery.data) {
      setLocalRetention(String(settingsQuery.data.paramHistoryRetentionDays));
      setLocalTimezone(settingsQuery.data.defaultTimezone);
      setLocalConditionMode(settingsQuery.data.defaultConditionMode);
    }
  }, [settingsQuery.data]);

  // Check if there are unsaved changes
  const hasChanges = React.useMemo(() => {
    if (!settingsQuery.data) return false;
    return (
      localConditionMode !== settingsQuery.data.defaultConditionMode ||
      localTimezone !== settingsQuery.data.defaultTimezone ||
      localRetention !== String(settingsQuery.data.paramHistoryRetentionDays)
    );
  }, [settingsQuery.data, localConditionMode, localTimezone, localRetention]);

  // Check if retention value is valid
  const isRetentionValid = React.useMemo(() => {
    const days = parseInt(localRetention, 10);
    return !isNaN(days) && days >= 1 && days <= 365;
  }, [localRetention]);

  function handleSave(): void {
    if (!isRetentionValid) return;

    const updates: {
      defaultConditionMode?: 'SIMPLE' | 'ADVANCED';
      defaultTimezone?: string;
      paramHistoryRetentionDays?: number;
    } = {};

    if (settingsQuery.data) {
      if (localConditionMode !== settingsQuery.data.defaultConditionMode) {
        updates.defaultConditionMode = localConditionMode;
      }
      if (localTimezone !== settingsQuery.data.defaultTimezone) {
        updates.defaultTimezone = localTimezone;
      }
      if (localRetention !== String(settingsQuery.data.paramHistoryRetentionDays)) {
        updates.paramHistoryRetentionDays = parseInt(localRetention, 10);
      }
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  }

  function handleCancel(): void {
    if (settingsQuery.data) {
      setLocalConditionMode(settingsQuery.data.defaultConditionMode);
      setLocalTimezone(settingsQuery.data.defaultTimezone);
      setLocalRetention(String(settingsQuery.data.paramHistoryRetentionDays));
    }
  }

  if (settingsQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="space-y-6">
          <SettingsCard title="Policy Conditions" description="Loading...">
            <Skeleton className="h-20 w-full" />
          </SettingsCard>
        </div>
      </SettingsPageLayout>
    );
  }

  if (settingsQuery.error) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>Failed to load settings</AlertTitle>
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

        {updateMutation.error && (
          <Alert variant="destructive">
            <AlertTitle>Update Failed</AlertTitle>
            <AlertDescription>{updateMutation.error.message}</AlertDescription>
          </Alert>
        )}

        {/* Policy Conditions Settings */}
        <SettingsCard
          title="Policy Conditions"
          description="Settings for deterministic policy condition evaluation."
          actions={
            hasChanges ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending || !isRetentionValid}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : undefined
          }
        >
          <SettingsItem
            label="Default Condition Mode"
            description="Default editor mode when creating new policy conditions"
          >
            <Select
              value={localConditionMode}
              onValueChange={(value) => setLocalConditionMode(value as 'SIMPLE' | 'ADVANCED')}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SIMPLE">Simple (Visual Builder)</SelectItem>
                <SelectItem value="ADVANCED">Advanced (Expression)</SelectItem>
              </SelectContent>
            </Select>
          </SettingsItem>

          <SettingsDivider />

          <SettingsItem
            label="Default Timezone"
            description="Timezone for time-based policy conditions"
          >
            <Select
              value={localTimezone}
              onValueChange={setLocalTimezone}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsItem>

          <SettingsDivider />

          <SettingsItem
            label="Parameter History Retention"
            description="Days to keep tool parameter history for suggestions (1-365)"
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={localRetention}
                onChange={(e) => setLocalRetention(e.target.value)}
                className="w-20"
                disabled={updateMutation.isPending}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            {!isRetentionValid && localRetention !== '' && (
              <p className="text-xs text-destructive mt-1">Must be between 1 and 365 days</p>
            )}
          </SettingsItem>
        </SettingsCard>
      </div>
    </SettingsPageLayout>
  );
}
