import * as React from 'react';
import { useLocation } from 'react-router';

import type { RestrictedTab } from '../../hooks/useFilteredTabs';
import { useFilteredTabs } from '../../hooks/useFilteredTabs';

import { getViewTypeFromPath, getWorkspaceSlugFromPath } from './nav';
import { TabbedPageLayout } from './TabbedPageLayout';

interface ToolsPageLayoutProps {
  children: React.ReactNode;
}

export function ToolsPageLayout({ children }: ToolsPageLayoutProps): React.ReactElement {
  const location = useLocation();

  const allToolsTabs = React.useMemo((): RestrictedTab[] => {
    const viewType = getViewTypeFromPath(location.pathname);
    const workspaceSlug = getWorkspaceSlugFromPath(location.pathname);

    let prefix: string;
    if (viewType === 'global') {
      prefix = '/global/admin';
    } else if (viewType === 'workspace' && workspaceSlug) {
      prefix = `/admin/${workspaceSlug}`;
    } else {
      prefix = '/admin';
    }

    return [
      { to: `${prefix}/tools`, label: 'Tools', end: true },
      { to: `${prefix}/sensitive-flags`, label: 'Flags' },
    ];
  }, [location.pathname]);

  const filteredTabs = useFilteredTabs(allToolsTabs);

  return (
    <TabbedPageLayout tabs={filteredTabs} ariaLabel="Tool sections">
      {children}
    </TabbedPageLayout>
  );
}
