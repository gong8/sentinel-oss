import * as React from 'react';
import { useLocation } from 'react-router';

import type { RestrictedTab } from '../../hooks/useFilteredTabs';
import { useFilteredTabs } from '../../hooks/useFilteredTabs';

import { getViewTypeFromPath, getWorkspaceSlugFromPath } from './nav';
import { TabbedPageLayout } from './TabbedPageLayout';

interface PolicyPageLayoutProps {
  children: React.ReactNode;
}

export function PolicyPageLayout({ children }: PolicyPageLayoutProps): React.ReactElement {
  const location = useLocation();

  const allPolicyTabs = React.useMemo((): RestrictedTab[] => {
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
      { to: `${prefix}/policies`, label: 'Policies', end: true },
      { to: `${prefix}/policy-playground`, label: 'Test' },
      { to: `${prefix}/policy-conflicts`, label: 'Conflicts' },
      { to: `${prefix}/policy-assertions`, label: 'Assertions' },
    ];
  }, [location.pathname]);

  const filteredTabs = useFilteredTabs(allPolicyTabs);

  return (
    <TabbedPageLayout tabs={filteredTabs} ariaLabel="Policy sections">
      {children}
    </TabbedPageLayout>
  );
}
