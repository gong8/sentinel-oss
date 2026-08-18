/**
 * Workspace Agent Page
 * Main chat interface for the workspace AI chatbot
 */

import { AdminLayout } from '../../components/layout/AdminLayout';
import { WorkspaceAgentView } from '../../components/workspace-agent/WorkspaceAgentView';
import { useWorkspace } from '../../hooks/WorkspaceContext';

export default function WorkspaceAgentPage() {
  const { selectedWorkspaceId, isLoading } = useWorkspace();

  // Show loading state while workspace context is loading
  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  // Don't render if no workspace is selected (shouldn't happen with proper routing)
  if (!selectedWorkspaceId) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Please select a workspace to use the Agent.
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <WorkspaceAgentView workspaceId={selectedWorkspaceId} />
    </AdminLayout>
  );
}
