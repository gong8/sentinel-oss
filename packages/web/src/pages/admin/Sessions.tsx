/**
 * Admin Sessions Page
 * Lists active sessions and provides session termination functionality
 */

import { ConfirmDialog, DataTableCard, ErrorAlert } from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

interface Session {
  id: string;
  externalSessionId: string;
  userId: string | null;
  agentId: string | null;
  createdAt: Date | string;
  lastActivityAt: Date | string;
  toolCallCount: number;
  user?: {
    id: string;
    email: string;
  } | null;
}

export default function AdminSessions(): React.ReactElement {
  const utils = trpc.useUtils();
  const { selectedWorkspaceId } = useWorkspace();

  // Queries - filter by workspace if selected
  const sessionsQuery = trpc.admin.sessions.list.useQuery({
    workspaceId: selectedWorkspaceId,
  });

  // Confirmation dialogs
  const terminateConfirm = useConfirmAction<Session>();
  const terminateAllConfirm = useConfirmAction<{ userId: string; email: string }>();

  // Mutations
  const terminateMutation = trpc.admin.sessions.terminate.useMutation({
    onSuccess: () => {
      utils.admin.sessions.list.invalidate();
      terminateConfirm.closeConfirm();
    },
  });

  const terminateUserSessionsMutation = trpc.admin.sessions.terminateUserSessions.useMutation({
    onSuccess: () => {
      utils.admin.sessions.list.invalidate();
      terminateAllConfirm.closeConfirm();
    },
  });

  // Error handling
  const errors = useMutationErrors([
    sessionsQuery,
    terminateMutation,
    terminateUserSessionsMutation,
  ]);

  // Group sessions by user for terminate all functionality
  const sessionsByUser = new Map<string, { email: string; count: number }>();
  sessionsQuery.data?.forEach((session) => {
    if (session.userId && session.user?.email) {
      const existing = sessionsByUser.get(session.userId);
      if (existing) {
        existing.count++;
      } else {
        sessionsByUser.set(session.userId, { email: session.user.email, count: 1 });
      }
    }
  });

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Active Sessions"
          description="Monitor and manage active MCP proxy sessions. Terminate sessions to immediately revoke agent access."
        />

        <ErrorAlert title="Failed to load sessions" errors={errors} />

        <ConfirmDialog
          open={terminateConfirm.isOpen}
          onOpenChange={(open) => !open && terminateConfirm.closeConfirm()}
          title="Terminate session"
          description={`Are you sure you want to terminate session ${terminateConfirm.target?.externalSessionId?.substring(0, 8)}...? The agent will immediately lose access and any pending tool calls will be rejected.`}
          alertText="This action cannot be undone. The session will be marked as terminated and the agent must start a new session to continue."
          isLoading={terminateMutation.isPending}
          onConfirm={() => {
            if (terminateConfirm.target) {
              terminateMutation.mutate({ sessionId: terminateConfirm.target.id });
            }
          }}
          confirmText="Terminate"
          loadingText="Terminating..."
          confirmVariant="destructive"
        />

        <ConfirmDialog
          open={terminateAllConfirm.isOpen}
          onOpenChange={(open) => !open && terminateAllConfirm.closeConfirm()}
          title="Terminate all sessions"
          description={`Are you sure you want to terminate all active sessions for ${terminateAllConfirm.target?.email}? This will immediately revoke all agent access for this user.`}
          alertText="This action cannot be undone. All sessions will be marked as terminated and any pending tool calls will be rejected."
          isLoading={terminateUserSessionsMutation.isPending}
          onConfirm={() => {
            if (terminateAllConfirm.target) {
              terminateUserSessionsMutation.mutate({ userId: terminateAllConfirm.target.userId });
            }
          }}
          confirmText="Terminate all"
          loadingText="Terminating..."
          confirmVariant="destructive"
        />

        {/* Summary stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Active Sessions</div>
            <div className="text-2xl font-bold">{sessionsQuery.data?.length ?? 0}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Unique Users</div>
            <div className="text-2xl font-bold">{sessionsByUser.size}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Total Tool Calls</div>
            <div className="text-2xl font-bold">
              {sessionsQuery.data?.reduce((sum, s) => sum + s.toolCallCount, 0) ?? 0}
            </div>
          </div>
        </div>

        <DataTableCard
          title="Sessions"
          description="All active MCP proxy sessions in this organization."
          isLoading={sessionsQuery.isPending}
          isEmpty={!sessionsQuery.data || sessionsQuery.data.length === 0}
          emptyTitle="No active sessions"
          emptyDescription="There are no active sessions at this time. Sessions appear when users connect through the MCP proxy."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Tool Calls</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionsQuery.data?.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-mono text-sm">
                    {session.externalSessionId.substring(0, 8)}...
                  </TableCell>
                  <TableCell>
                    {session.user?.email ? (
                      <div className="font-medium">{session.user.email}</div>
                    ) : (
                      <Badge variant="secondary">Anonymous</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(session.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(session.lastActivityAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{session.toolCallCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {session.userId &&
                        sessionsByUser.get(session.userId)?.count &&
                        sessionsByUser.get(session.userId)!.count > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              terminateAllConfirm.openConfirm({
                                userId: session.userId!,
                                email: session.user?.email ?? 'Unknown',
                              })
                            }
                            disabled={terminateUserSessionsMutation.isPending}
                          >
                            Terminate all ({sessionsByUser.get(session.userId!)?.count})
                          </Button>
                        )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => terminateConfirm.openConfirm(session)}
                        disabled={terminateMutation.isPending}
                      >
                        Terminate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableCard>
      </div>
    </AdminLayout>
  );
}
