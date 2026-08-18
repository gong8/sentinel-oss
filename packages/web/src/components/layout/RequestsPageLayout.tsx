import * as React from 'react';
import { useLocation } from 'react-router';

import { getViewTypeFromPath, getWorkspaceSlugFromPath } from './nav';
import { TabbedPageLayout } from './TabbedPageLayout';

interface RequestsPageLayoutProps {
  children: React.ReactNode;
}

export function RequestsPageLayout({ children }: RequestsPageLayoutProps) {
  const location = useLocation();

  const tabs = React.useMemo(() => {
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
      { to: `${prefix}/requests`, label: 'Access Requests', end: true },
      { to: `${prefix}/mcp-requests`, label: 'Server Requests' },
    ];
  }, [location.pathname]);

  return (
    <TabbedPageLayout tabs={tabs} ariaLabel="Request sections">
      {children}
    </TabbedPageLayout>
  );
}
