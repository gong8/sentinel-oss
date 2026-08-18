import * as React from 'react';
import { useLocation } from 'react-router';

import type { RestrictedTab } from '../../hooks/useFilteredTabs';
import { useFilteredTabs } from '../../hooks/useFilteredTabs';

import { getViewTypeFromPath, getWorkspaceSlugFromPath } from './nav';
import { SetPageTitle } from './PageTitleContext';
import { TabbedPageLayout } from './TabbedPageLayout';

function buildSettingsTabs(prefix: string): RestrictedTab[] {
  return [
    { to: `${prefix}/settings`, label: 'Appearance', end: true },
    { to: `${prefix}/settings/navigation`, label: 'Navigation' },
    { to: `${prefix}/settings/organization`, label: 'Organization' },
    { to: `${prefix}/settings/owners`, label: 'Org Owners', requiresOrgOwner: true },
    { to: `${prefix}/settings/system`, label: 'System' },
    { to: `${prefix}/settings/llm`, label: 'AI / LLM' },
    { to: `${prefix}/settings/tags`, label: 'Policy Tags' },
    { to: `${prefix}/settings/variables`, label: 'Variables' },
    { to: `${prefix}/settings/admin-mcp`, label: 'Admin MCP' },
    { to: `${prefix}/settings/advanced`, label: 'Advanced' },
  ];
}

interface SettingsPageLayoutProps {
  children: React.ReactNode;
}

export function SettingsPageLayout({ children }: SettingsPageLayoutProps): React.ReactElement {
  const location = useLocation();

  const prefix = React.useMemo(() => {
    const viewType = getViewTypeFromPath(location.pathname);
    const workspaceSlug = getWorkspaceSlugFromPath(location.pathname);

    if (viewType === 'global') {
      return '/global/admin';
    }
    if (viewType === 'workspace' && workspaceSlug) {
      return `/admin/${workspaceSlug}`;
    }
    return '/admin';
  }, [location.pathname]);

  const allSettingsTabs = React.useMemo(() => buildSettingsTabs(prefix), [prefix]);

  const filteredTabs = useFilteredTabs(allSettingsTabs);

  return (
    <TabbedPageLayout tabs={filteredTabs} ariaLabel="Settings sections">
      <SetPageTitle
        title="Settings"
        description="Configure application preferences and system settings."
      />
      {children}
    </TabbedPageLayout>
  );
}
