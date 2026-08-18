import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { FeatureDiscoveryPanel } from '../../components/featureDiscovery';
import { PageHeader } from '../../components/layout/PageHeader';
import { UserLayout } from '../../components/layout/UserLayout';
import { AllowDenyBadge } from '../../components/ui/allow-deny-toggle';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { StatCard } from '../../components/ui/stat-card';
import { StatusBadge } from '../../components/ui/status-badge';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatCountdown, formatDateTime } from '../../lib/format';
import { createToolNameFormatter } from '../../lib/mcpUtils';
import { trpc } from '../../lib/trpc';
import { isAllowDenyValue } from '../../lib/typeGuards';

interface AuditEntryDisplay {
  id: string;
  toolName: string;
  decision: string;
  timestamp: string;
}

function getAuditEntries<
  T extends {
    entries?: Array<{
      id: string;
      toolName: string;
      decision: string;
      timestamp: string;
    }>;
  },
>(data: T | undefined): AuditEntryDisplay[] {
  return data?.entries ?? [];
}

interface PermissionRequestDisplay {
  id: string;
  status: string;
  createdAt: string;
  toolNames: string[];
  type: string;
}

function getPermissionRequests<
  T extends {
    id: string;
    status: string;
    createdAt: string;
    toolNames: string[];
    type: string;
  },
>(data: T[] | undefined): PermissionRequestDisplay[] {
  return data ?? [];
}

interface ApprovalRequestDisplay {
  id: string;
  toolName: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  canSelfApprove: boolean;
  agent?: { name: string } | null;
}

function getRequestTypeLabel(request: PermissionRequestDisplay): string {
  if (request.type === 'MCP_SERVER') return 'MCP Server Request';
  if (request.type === 'DENY_REMOVAL') return 'Restriction Removal';
  const count = request.toolNames.length;
  return `${count} tool${count !== 1 ? 's' : ''}`;
}

export default function UserDashboard(): JSX.Element {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { selectedWorkspaceSlug, selectedWorkspaceId } = useWorkspace();

  // Build user prefix for routes
  const userPrefix = useMemo(() => {
    if (selectedWorkspaceSlug) return `/user/${selectedWorkspaceSlug}`;
    return '/user';
  }, [selectedWorkspaceSlug]);

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => 'Notification' in window && Notification.permission === 'granted',
  );
  const prevPendingCountRef = useRef(0);

  const toolsQuery = trpc.user.tools.list.useQuery();
  const serversQuery = trpc.user.mcpServers.list.useQuery();
  const requestsQuery = trpc.user.permissionRequests.list.useQuery();
  const auditQuery = trpc.user.auditLogEntries.list.useQuery({
    limit: 6,
    offset: 0,
  });
  const approvalsQuery = trpc.user.sensitiveFlags.listPendingApprovals.useQuery(undefined, {
    refetchInterval: 1000,
  });

  const selfApproveMutation = trpc.user.sensitiveFlags.selfApprove.useMutation({
    onSuccess: () => {
      utils.user.sensitiveFlags.listPendingApprovals.invalidate();
    },
  });

  const cancelMutation = trpc.user.sensitiveFlags.cancelRequest.useMutation({
    onSuccess: () => {
      utils.user.sensitiveFlags.listPendingApprovals.invalidate();
    },
  });

  const formatToolName = serversQuery.data
    ? createToolNameFormatter(serversQuery.data.map((s) => ({ name: s.name, url: s.url })))
    : (name: string) => name;

  async function enableNotifications(): Promise<void> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  }

  const pendingApprovals: ApprovalRequestDisplay[] = approvalsQuery.data ?? [];

  useEffect(() => {
    if (notificationsEnabled && pendingApprovals.length > prevPendingCountRef.current) {
      new Notification('New Approval Request', {
        body: `${pendingApprovals.length} pending approval${pendingApprovals.length !== 1 ? 's' : ''}`,
      });
    }
    prevPendingCountRef.current = pendingApprovals.length;
  }, [pendingApprovals.length, notificationsEnabled]);

  function handleSelfApprove(id: string): void {
    selfApproveMutation.mutate({ id });
  }

  function handleCancel(id: string): void {
    cancelMutation.mutate({ id });
  }

  const toolCounts = useMemo(() => {
    let total = 0;
    let allowed = 0;
    let denied = 0;
    if (toolsQuery.data) {
      for (const server of toolsQuery.data) {
        for (const tool of server.tools) {
          total++;
          if (tool.access === 'ALLOWED') {
            allowed++;
          } else {
            denied++;
          }
        }
      }
    }
    return { total, allowed, denied };
  }, [toolsQuery.data]);

  const serverCounts = useMemo(() => {
    const total = serversQuery.data?.length ?? 0;
    const connected = serversQuery.data?.filter((s) => s.authenticated).length ?? 0;
    const needsSetup = serversQuery.data?.filter((s) => !s.authenticated).length ?? 0;
    return { total, connected, needsSetup };
  }, [serversQuery.data]);

  const allRequests = getPermissionRequests(requestsQuery.data);
  const pendingRequests = allRequests.filter((r) => r.status === 'PENDING');
  const recentRequests = allRequests.slice(0, 5);
  const recentAuditEntries = getAuditEntries(auditQuery.data);

  return (
    <UserLayout>
      <div className="space-y-8">
        <PageHeader
          title="Dashboard"
          description="Overview of your access status and recent activity."
        />

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Tools Available"
            value={toolCounts.allowed}
            subtitle={`${toolCounts.denied} denied of ${toolCounts.total} total`}
            loading={toolsQuery.isPending}
            to={`${userPrefix}/tools`}
          />
          <StatCard
            title="MCP Servers"
            value={serverCounts.connected}
            subtitle={`${serverCounts.needsSetup} need${serverCounts.needsSetup === 1 ? 's' : ''} setup`}
            loading={serversQuery.isPending}
            to={`${userPrefix}/mcp-servers`}
          />
          <StatCard
            title="Pending Approvals"
            value={pendingApprovals.length}
            subtitle="Awaiting your action"
            loading={approvalsQuery.isPending}
            to={`${userPrefix}/approvals`}
          />
          <StatCard
            title="My Requests"
            value={pendingRequests.length}
            subtitle="Pending review"
            loading={requestsQuery.isPending}
            to={`${userPrefix}/requests`}
          />
        </div>

        {/* Alerts Section - Servers needing setup */}
        {serverCounts.needsSetup > 0 && (
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Setup Required</CardTitle>
                <Badge variant="secondary">{serverCounts.needsSetup}</Badge>
              </div>
              <CardDescription>
                {serverCounts.needsSetup} MCP server{serverCounts.needsSetup !== 1 ? 's' : ''} need
                {serverCounts.needsSetup === 1 ? 's' : ''} credentials to connect.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to={`${userPrefix}/credentials`}>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  Manage Credentials
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Live Approvals Section */}
        {pendingApprovals.length > 0 && (
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>Live Approvals</CardTitle>
                  <Badge variant="destructive">{pendingApprovals.length}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={enableNotifications}
                  title={notificationsEnabled ? 'Notifications enabled' : 'Enable notifications'}
                >
                  {notificationsEnabled ? 'Notifications on' : 'Enable notifications'}
                </Button>
              </div>
              <CardDescription>Tool invocations awaiting your approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingApprovals.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">
                      {formatToolName(request.toolName)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {request.agent?.name && <span>{request.agent.name}</span>}
                      {request.agent?.name && <span>-</span>}
                      <span>Expires {formatCountdown(request.expiresAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {request.canSelfApprove && (
                      <Button
                        size="sm"
                        onClick={() => handleSelfApprove(request.id)}
                        disabled={selfApproveMutation.isPending}
                      >
                        Approve
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(request.id)}
                      disabled={cancelMutation.isPending}
                      className="text-destructive"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate(`${userPrefix}/credentials`)}
              >
                Manage Credentials
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate(`${userPrefix}/requests`)}
              >
                Request Access
              </Button>
              <Link to={`${userPrefix}/tools`}>
                <Button variant="outline" className="w-full justify-start">
                  View Tools
                </Button>
              </Link>
              <Link to={`${userPrefix}/audit`}>
                <Button variant="outline" className="w-full justify-start">
                  View Activity
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription className="mt-1.5">Your recent tool invocations</CardDescription>
                </div>
                <Link to={`${userPrefix}/audit`}>
                  <Button variant="ghost" size="sm">
                    View all
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {auditQuery.isPending ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentAuditEntries.length > 0 ? (
                recentAuditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {formatToolName(entry.toolName)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDateTime(entry.timestamp)}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isAllowDenyValue(entry.decision) ? (
                        <AllowDenyBadge value={entry.decision} size="sm" />
                      ) : (
                        <span className="text-muted-foreground text-sm">{entry.decision}</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Activity will appear here as you use tools
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>My Requests</CardTitle>
                  <CardDescription className="mt-1.5">Your recent access requests</CardDescription>
                </div>
                <Link to={`${userPrefix}/requests`}>
                  <Button variant="ghost" size="sm">
                    View all
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {requestsQuery.isPending ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentRequests.length > 0 ? (
                recentRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {getRequestTypeLabel(request)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDateTime(request.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={request.status} type="request" />
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">No requests yet</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate(`${userPrefix}/requests`)}
                  >
                    Request Access
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Access Overview */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tool Access</CardTitle>
                  <CardDescription className="mt-1.5">Your current access status</CardDescription>
                </div>
                <Link to={`${userPrefix}/tools`}>
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {toolsQuery.isPending ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-24 w-full" />
                  ))}
                </div>
              ) : toolCounts.total > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Allowed</div>
                    <div className="text-3xl font-bold mb-1">{toolCounts.allowed}</div>
                    <div className="text-xs text-muted-foreground">Tools you can use</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Denied</div>
                    <div className="text-3xl font-bold mb-1">{toolCounts.denied}</div>
                    <div className="text-xs text-muted-foreground">Request access needed</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Total</div>
                    <div className="text-3xl font-bold mb-1">{toolCounts.total}</div>
                    <div className="text-xs text-muted-foreground">Available tools</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Access Rate
                    </div>
                    <div className="text-3xl font-bold mb-1">
                      {toolCounts.total > 0
                        ? Math.round((toolCounts.allowed / toolCounts.total) * 100)
                        : 0}
                      %
                    </div>
                    <div className="text-xs text-muted-foreground">Of all tools</div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">No tools available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect to MCP servers to discover tools
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>MCP Servers</CardTitle>
                  <CardDescription className="mt-1.5">Connection status</CardDescription>
                </div>
                <Link to={`${userPrefix}/credentials`}>
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {serversQuery.isPending ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-24 w-full" />
                  ))}
                </div>
              ) : serverCounts.total > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Connected</div>
                    <div className="text-3xl font-bold mb-1">{serverCounts.connected}</div>
                    <div className="text-xs text-muted-foreground">Ready to use</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Needs Setup
                    </div>
                    <div className="text-3xl font-bold mb-1">{serverCounts.needsSetup}</div>
                    <div className="text-xs text-muted-foreground">Add credentials</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Total</div>
                    <div className="text-3xl font-bold mb-1">{serverCounts.total}</div>
                    <div className="text-xs text-muted-foreground">Available servers</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Connection Rate
                    </div>
                    <div className="text-3xl font-bold mb-1">
                      {serverCounts.total > 0
                        ? Math.round((serverCounts.connected / serverCounts.total) * 100)
                        : 0}
                      %
                    </div>
                    <div className="text-xs text-muted-foreground">Of all servers</div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">No servers available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Contact your administrator to add servers
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <FeatureDiscoveryPanel workspaceId={selectedWorkspaceId} />
    </UserLayout>
  );
}
