/**
 * Filtered Tabs Hook
 *
 * Hides tabs the current user is not authorized to see.
 */

import * as React from 'react';

import type { Tab } from '../components/layout/AppShell';

import { useWorkspace } from './WorkspaceContext';

export interface RestrictedTab extends Tab {
  requiresOrgOwner?: boolean;
}

/**
 * Filters tabs by organization ownership.
 * While workspace context is loading, only shows unrestricted tabs.
 */
export function useFilteredTabs(allTabs: RestrictedTab[]): Tab[] {
  const { isOrgOwner, isLoading } = useWorkspace();

  return React.useMemo(() => {
    return allTabs.filter((tab) => {
      if (!tab.requiresOrgOwner) return true;
      return isLoading ? false : isOrgOwner;
    });
  }, [allTabs, isOrgOwner, isLoading]);
}
