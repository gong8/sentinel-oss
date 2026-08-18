/**
 * User Agent Page
 * Full-screen agent interface for regular users
 * Shows only workspace conversations (no Sentinel Admin access)
 */

import { AgentPageView } from '../../components/agent-page';
import { useWorkspace } from '../../hooks/WorkspaceContext';

export default function UserAgentPage() {
  const { selectedWorkspaceId, selectedWorkspaceSlug, isLoading } = useWorkspace();

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
      isAdmin={false}
    />
  );
}
