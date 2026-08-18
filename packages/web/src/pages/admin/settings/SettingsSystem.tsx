import { useMemo } from 'react';
import { NavLink } from 'react-router';

import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import { SettingsCard, SettingsItem } from '../../../components/settings/SettingsCard';
import { Button } from '../../../components/ui/button';
import { usePreferences } from '../../../hooks/PreferencesContext';
import { useWorkspace } from '../../../hooks/WorkspaceContext';

export default function SettingsSystem() {
  const { resetPreferences } = usePreferences();
  const { selectedWorkspaceSlug, isGlobalView } = useWorkspace();

  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        <SettingsCard title="System Utilities" description="Manage system features and data.">
          <SettingsItem label="Deleted Items" description="View and restore soft-deleted items">
            <NavLink to={`${adminPrefix}/deleted-items`}>
              <Button variant="outline" size="sm">
                Manage
              </Button>
            </NavLink>
          </SettingsItem>
        </SettingsCard>

        <SettingsCard title="Reset" description="Reset application settings to defaults.">
          <SettingsItem
            label="Reset All Preferences"
            description="Clear all saved preferences and return to default settings"
          >
            <Button variant="destructive" size="sm" onClick={resetPreferences}>
              Reset All
            </Button>
          </SettingsItem>
        </SettingsCard>
      </div>
    </SettingsPageLayout>
  );
}
