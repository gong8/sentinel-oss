import * as React from 'react';

import { useNav } from '../../hooks/useNav';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { ChatPanel } from '../agent/ChatPanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { AppShell, type NavGroup } from './AppShell';
import { NoWorkspaceMessage } from './NoWorkspaceMessage';

interface AdminLayoutProps {
  children: React.ReactNode;
}

// Dashboard-only nav groups when user has no workspaces (non-org-owners)
const dashboardOnlyNavGroups: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [{ to: '/admin', label: 'Dashboard', end: true }],
    standalone: true,
  },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const { navGroups } = useNav();
  const {
    workspaces,
    isLoading: workspacesLoading,
    isOrgOwner,
    selectedWorkspaceSlug,
    selectedWorkspaceId,
  } = useWorkspace();

  // Determine if user has access to workspaces
  const hasWorkspaces = workspaces && workspaces.length > 0;

  // Only show NoWorkspaceMessage for non-org-owners who have no workspace access
  // Org owners always see full nav - they can create workspaces
  const showNoWorkspaceMessage = !workspacesLoading && !hasWorkspaces && !isOrgOwner;

  // Org owners always get full nav, non-org-owners without workspaces get dashboard-only
  const effectiveNavGroups = showNoWorkspaceMessage ? dashboardOnlyNavGroups : navGroups;

  // Display role clearly - Org Owner vs Admin
  const title = isOrgOwner ? 'Org Owner' : 'Admin';

  return (
    <AppShell title={title} navGroups={effectiveNavGroups}>
      <ErrorBoundary>{showNoWorkspaceMessage ? <NoWorkspaceMessage /> : children}</ErrorBoundary>
      <ChatPanel
        workspaceSlug={selectedWorkspaceSlug ?? undefined}
        workspaceId={selectedWorkspaceId ?? undefined}
      />
    </AppShell>
  );
}
