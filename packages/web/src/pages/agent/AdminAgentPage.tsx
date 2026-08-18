/**
 * Admin Agent Page
 * Full-screen agent interface for administrators
 * Shows unified conversation list (both SENTINEL_ADMIN and WORKSPACE_AGENT types)
 */

import * as React from 'react';

import { AgentPageView } from '../../components/agent-page';
import { chatPanelStore } from '../../components/agent/chatPanelStore';
import { useWorkspace } from '../../hooks/WorkspaceContext';

export default function AdminAgentPage() {
  const { selectedWorkspaceId, selectedWorkspaceSlug, isLoading } = useWorkspace();

  // On mount, disable pop-out mode to take over from any floating panel
  React.useEffect(() => {
    chatPanelStore.broadcastFullScreenOpened();
    chatPanelStore.setPopoutMode(false);
  }, []);

  // Show loading state while workspace context is loading
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Don't render if no workspace is selected
  if (!selectedWorkspaceId || !selectedWorkspaceSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Please select a workspace to use the Agent.
      </div>
    );
  }

  return (
    <AgentPageView
      workspaceId={selectedWorkspaceId}
      workspaceSlug={selectedWorkspaceSlug}
      isAdmin={true}
    />
  );
}
