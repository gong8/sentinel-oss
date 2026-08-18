import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import { FeatureDiscoveryPanel } from '../../components/featureDiscovery';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
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
import { useMcpServers } from '../../hooks/useMcpServers';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatCountdown, formatDateTime, formatToolName } from '../../lib/format';
import { trpc } from '../../lib/trpc';
import { isAllowDenyValue } from '../../lib/typeGuards';

// Helper to compute server counts without triggering deep type instantiation
function computeServerCounts<T extends { trusted: boolean; authType: string; tools?: unknown[] }>(
  servers: T[] | undefined,
) {
  if (!servers) {
    return { total: 0, trusted: 0, oauth: 0, apiKey: 0, noAuth: 0, tools: 0 };
  }
  return {
    total: servers.length,
    trusted: servers.filter((s) => s.trusted).length,
    oauth: servers.filter((s) => s.authType === 'OAUTH').length,
    apiKey: servers.filter((s) => s.authType === 'API_KEY').length,
    noAuth: servers.filter((s) => s.authType === 'NONE').length,
    tools: servers.reduce((total, s) => total + (s.tools?.length ?? 0), 0),
  };
}

// Helper to compute policy counts without triggering deep type instantiation
function computePolicyCounts<T extends { enabled: boolean; effect: string }>(
  policies: T[] | undefined,
) {
  if (!policies) {
    return { total: 0, enabled: 0, allow: 0, deny: 0 };
  }
  return {
    total: policies.length,
    enabled: policies.filter((p) => p.enabled).length,
    allow: policies.filter((p) => p.effect === 'ALLOW').length,
    deny: policies.filter((p) => p.effect === 'DENY').length,
  };
}

// Audit entry interface for display - avoids deep type instantiation
interface AuditEntryDisplay {
  id: string;
  toolName: string;
  decision: string;
  timestamp: string;
  user?: { email: string } | null;
  agent?: { name: string } | null;
}

// Helper to extract audit entries with simpler type
function getAuditEntries<
  T extends {
    entries?: Array<{
      id: string;
      toolName: string;
      decision: string;
      timestamp: string;
      user?: { email: string } | null;
      agent?: { name: string } | null;
    }>;
  },
>(data: T | undefined): AuditEntryDisplay[] {
  return data?.entries ?? [];
}

// Permission request interface for display
interface PermissionRequestDisplay {
  id: string;
  status: string;
  createdAt: string;
  toolNames: string[];
  type: 'TOOL_ACCESS' | 'DENY_REMOVAL' | 'MCP_SERVER';
  user: { email: string };
}

// Helper to extract permission requests with simpler type
function getPermissionRequests<
  T extends Array<{
    id: string;
    status: string;
    createdAt: string;
    toolNames: string[];
    type: 'TOOL_ACCESS' | 'DENY_REMOVAL' | 'MCP_SERVER';
    user: { email: string };
  }>,
>(data: T | undefined): PermissionRequestDisplay[] {
  return data ?? [];
}

// Approval request interface for display
interface ApprovalRequestDisplay {
  id: string;
  toolName: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  type: 'SENSITIVE_FLAG';
  user?: { email: string } | null;
  agent?: { name: string } | null;
}

// Helper to extract approval requests with simpler type
function getApprovalRequests<
  T extends {
    requests?: Array<{
      id: string;
      toolName: string;
      status: string;
      expiresAt: string;
      createdAt: string;
      type: 'SENSITIVE_FLAG';
      user?: { email: string } | null;
      agent?: { name: string } | null;
    }>;
  },
>(data: T | undefined): ApprovalRequestDisplay[] {
  return data?.requests ?? [];
}

// MCP Confirmation interface for display - avoids deep type instantiation
interface McpConfirmationDisplay {
  id: string;
  toolName: string;
  status: string;
  riskLevel: string;
  description: string;
  expiresAt: string;
  adminUser: { email: string } | null;
}

// Helper to extract MCP confirmations with simpler type
function getMcpConfirmations<
  T extends {
    confirmations?: Array<{
      id: string;
      toolName: string;
      status: string;
      riskLevel: string;
      description: string;
      expiresAt: Date | string;
      adminUser: { id: string; email: string } | null;
    }>;
  },
>(data: T | undefined): McpConfirmationDisplay[] {
  if (!data?.confirmations) return [];
  return data.confirmations.map((c) => ({
    id: c.id,
    toolName: c.toolName,
    status: c.status,
    riskLevel: c.riskLevel,
    description: c.description,
    expiresAt: String(c.expiresAt),
    adminUser: c.adminUser ? { email: c.adminUser.email } : null,
  }));
}

export default function AdminDashboard() {
  const utils = trpc.useUtils();
  const { selectedWorkspaceSlug, selectedWorkspaceId, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  // Notification state - check if already granted on mount
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => 'Notification' in window && Notification.permission === 'granted',
  );
  const prevPendingCountRef = useRef(0);
  const prevMcpPendingCountRef = useRef(0);

  const usersQuery = trpc.admin.users.list.useQuery();
  const policiesQuery = trpc.admin.policies.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const serversQuery = trpc.admin.mcpServers.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const requestsQuery = trpc.admin.permissionRequests.list.useQuery({
    status: 'PENDING',
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const auditQuery = trpc.admin.auditLogEntries.list.useQuery({
    limit: 6,
    offset: 0,
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  // Check if any sensitive flag has REQUIRE_APPROVAL behavior
  const sensitiveFlagsQuery = trpc.admin.sensitiveFlags.list.useQuery({
    includeDisabled: true,
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const hasApprovalSources =
    sensitiveFlagsQuery.data?.some((flag) => flag.behaviors.includes('REQUIRE_APPROVAL')) ?? false;

  // Live approvals with 1-second polling (only if approval flags exist)
  const approvalsQuery = trpc.admin.sensitiveFlags.listApprovals.useQuery(
    {},
    {
      refetchInterval: 1000,
      enabled: hasApprovalSources,
    },
  );

  // Admin MCP settings to check if enabled
  const adminMcpSettingsQuery = trpc.admin.adminMcpSettings.get.useQuery();
  const hasAdminMcpEnabled = adminMcpSettingsQuery.data?.enabled ?? false;

  // Admin MCP confirmations with 1-second polling (only if enabled)
  const mcpConfirmationsQuery = trpc.admin.adminMcpConfirmation.list.useQuery(
    { status: 'PENDING' },
    {
      refetchInterval: 1000,
      enabled: hasAdminMcpEnabled,
    },
  );

  // Approval mutations
  const approveMutation = trpc.admin.sensitiveFlags.approveRequest.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.listApprovals.invalidate();
    },
  });

  const denyMutation = trpc.admin.sensitiveFlags.denyRequest.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.listApprovals.invalidate();
    },
  });

  // MCP Confirmation mutations
  const mcpConfirmMutation = trpc.admin.adminMcpConfirmation.confirm.useMutation({
    onSuccess: () => {
      utils.admin.adminMcpConfirmation.list.invalidate();
    },
  });

  const mcpRejectMutation = trpc.admin.adminMcpConfirmation.reject.useMutation({
    onSuccess: () => {
      utils.admin.adminMcpConfirmation.list.invalidate();
    },
  });

  // Toggle notification permission
  const toggleNotifications = async () => {
    if (notificationsEnabled) {
      // Turn off notifications
      setNotificationsEnabled(false);
    } else {
      // Request permission and enable
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationsEnabled(true);
          // Send test notification to verify it works
          new Notification('Notifications Enabled', {
            body: 'You will be notified when new approval requests arrive.',
          });
        }
      }
    }
  };

  // Check if an approval has expired based on expiresAt
  const isExpired = (expiresAt: string): boolean => {
    return new Date(expiresAt) <= new Date();
  };

  // Get pending approvals, filtering out expired ones client-side as well
  const pendingApprovals = getApprovalRequests(approvalsQuery.data).filter(
    (r) => r.status === 'PENDING' && !isExpired(r.expiresAt),
  );

  // Get pending MCP confirmations, filtering out expired ones
  const pendingMcpConfirmations = getMcpConfirmations(mcpConfirmationsQuery.data).filter(
    (c) => c.status === 'PENDING' && !isExpired(c.expiresAt),
  );

  // Show notification when new approval arrives
  useEffect(() => {
    console.log('[Notifications] Check:', {
      enabled: notificationsEnabled,
      current: pendingApprovals.length,
      previous: prevPendingCountRef.current,
    });
    if (notificationsEnabled && pendingApprovals.length > prevPendingCountRef.current) {
      console.log('[Notifications] Triggering notification');
      new Notification('New Approval Request', {
        body: `${pendingApprovals.length} pending approval${pendingApprovals.length !== 1 ? 's' : ''}`,
      });
    }
    prevPendingCountRef.current = pendingApprovals.length;
  }, [pendingApprovals.length, notificationsEnabled]);

  // Show notification when new MCP confirmation arrives
  useEffect(() => {
    if (notificationsEnabled && pendingMcpConfirmations.length > prevMcpPendingCountRef.current) {
      new Notification('New MCP Confirmation', {
        body: `${pendingMcpConfirmations.length} pending MCP confirmation${pendingMcpConfirmations.length !== 1 ? 's' : ''}`,
      });
    }
    prevMcpPendingCountRef.current = pendingMcpConfirmations.length;
  }, [pendingMcpConfirmations.length, notificationsEnabled]);

  const handleApprove = (id: string) => {
    approveMutation.mutate({ id });
  };

  const handleDeny = (id: string) => {
    denyMutation.mutate({ id, reason: 'Denied from dashboard' });
  };

  const handleMcpConfirm = (id: string) => {
    mcpConfirmMutation.mutate({ id });
  };

  const handleMcpReject = (id: string) => {
    mcpRejectMutation.mutate({ id, reason: 'Rejected from dashboard' });
  };

  const policies = policiesQuery.data;
  const policyCounts = computePolicyCounts(policies);

  const servers = serversQuery.data;
  const serverCounts = computeServerCounts(servers);

  const { formatToolNameFriendly } = useMcpServers({
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  const pendingRequests = getPermissionRequests(requestsQuery.data);
  const pendingAccessRequests = pendingRequests.filter(
    (r) => r.type === 'TOOL_ACCESS' || r.type === 'DENY_REMOVAL',
  );
  const pendingServerRequests = pendingRequests.filter((r) => r.type === 'MCP_SERVER');
  const recentAuditEntries = getAuditEntries(auditQuery.data);

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-start justify-end">
          <PageHeader
            title="Dashboard"
            description="Overview of your organization's security posture and activity."
          />
          <div className="flex gap-2">
            <Link to={`${adminPrefix}/analytics`}>
              <Button variant="outline" size="sm">
                Analytics
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Users"
            value={usersQuery.data?.length ?? 0}
            subtitle="Active users"
            loading={usersQuery.isPending}
            to={`${adminPrefix}/users`}
          />
          <StatCard
            title="Active Policies"
            value={policyCounts.enabled}
            subtitle={`${policyCounts.total} total configured`}
            loading={policiesQuery.isPending}
            to={`${adminPrefix}/policies`}
          />
          <StatCard
            title="MCP Servers"
            value={serverCounts.total}
            subtitle={`${serverCounts.tools} tools discovered`}
            loading={serversQuery.isPending}
            to={`${adminPrefix}/mcp-servers`}
          />
          <StatCard
            title="Agents"
            value={agentsQuery.data?.length ?? 0}
            subtitle="Registered agents"
            loading={agentsQuery.isPending}
            to={`${adminPrefix}/agents`}
          />
        </div>

        {/* Alerts Section */}
        {pendingRequests.length > 0 && (
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Pending Actions</CardTitle>
                <Badge variant="secondary">{pendingRequests.length}</Badge>
              </div>
              <CardDescription>
                You have {pendingRequests.length} permission request
                {pendingRequests.length !== 1 ? 's' : ''} awaiting review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to={`${adminPrefix}/${pendingServerRequests.length > 0 && pendingAccessRequests.length === 0 ? 'mcp-requests' : 'requests'}`}
              >
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  Review Requests
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Live Approvals Section - only show if approval flags exist */}
        {hasApprovalSources && (
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>Live Approvals</CardTitle>
                  {pendingApprovals.length > 0 && (
                    <Badge variant="destructive">{pendingApprovals.length}</Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleNotifications}
                  title={
                    notificationsEnabled ? 'Click to disable notifications' : 'Enable notifications'
                  }
                >
                  {notificationsEnabled ? 'Notifications on' : 'Enable notifications'}
                </Button>
              </div>
              <CardDescription>Sensitive flag decisions awaiting approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {approvalsQuery.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : pendingApprovals.length > 0 ? (
                pendingApprovals.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-sm">
                          {formatToolNameFriendly(request.toolName)}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Flag
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{request.user?.email || request.agent?.name || 'Unknown'}</span>
                        <span>-</span>
                        <span>Expires {formatCountdown(request.expiresAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(request.id)}
                        disabled={approveMutation.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeny(request.id)}
                        disabled={denyMutation.isPending}
                        className="text-destructive"
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No pending approvals
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Admin MCP Confirmations Section - only show if there are pending confirmations */}
        {hasAdminMcpEnabled && pendingMcpConfirmations.length > 0 && (
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>MCP Confirmations</CardTitle>
                  {pendingMcpConfirmations.length > 0 && (
                    <Badge variant="destructive">{pendingMcpConfirmations.length}</Badge>
                  )}
                </div>
                <Link to={`${adminPrefix}/mcp-confirmations`}>
                  <Button variant="ghost" size="sm">
                    View all
                  </Button>
                </Link>
              </div>
              <CardDescription>Admin MCP write operations awaiting confirmation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {mcpConfirmationsQuery.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                pendingMcpConfirmations.map((confirmation) => (
                  <div
                    key={confirmation.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-sm">
                          {formatToolName(confirmation.toolName)}
                        </span>
                        <Badge
                          variant={
                            confirmation.riskLevel === 'HIGH'
                              ? 'destructive'
                              : confirmation.riskLevel === 'MEDIUM'
                                ? 'secondary'
                                : 'outline'
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {confirmation.riskLevel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{confirmation.adminUser?.email || 'Unknown'}</span>
                        <span>-</span>
                        <span>Expires {formatCountdown(confirmation.expiresAt)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {confirmation.description}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleMcpConfirm(confirmation.id)}
                        disabled={mcpConfirmMutation.isPending}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMcpReject(confirmation.id)}
                        disabled={mcpRejectMutation.isPending}
                        className="text-destructive"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Audit Activity</CardTitle>
                  <CardDescription className="mt-1.5">
                    Latest tool invocations and policy decisions
                  </CardDescription>
                </div>
                <Link to={`${adminPrefix}/audit`}>
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
                        {formatToolNameFriendly(entry.toolName)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{entry.user?.email ?? entry.agent?.name ?? 'System'}</span>
                        <span>-</span>
                        <span>{formatDateTime(entry.timestamp)}</span>
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
                  <p className="text-sm text-muted-foreground">No audit activity yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Activity will appear here as tools are invoked
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Access Requests</CardTitle>
                  <CardDescription className="mt-1.5">
                    Pending access requests from users
                  </CardDescription>
                </div>
                <Link to={`${adminPrefix}/requests`}>
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
              ) : pendingRequests.length > 0 ? (
                pendingRequests.slice(0, 5).map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{request.user.email}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>
                          {request.type === 'MCP_SERVER'
                            ? 'Server request'
                            : request.toolNames.length > 0
                              ? `${request.toolNames.length} tool${request.toolNames.length !== 1 ? 's' : ''}`
                              : 'All server tools'}
                        </span>
                        <span>-</span>
                        <span>{formatDateTime(request.createdAt)}</span>
                      </div>
                    </div>
                    <Link
                      to={`${adminPrefix}/${request.type === 'MCP_SERVER' ? 'mcp-requests' : 'requests'}`}
                    >
                      <Button variant="outline" size="sm">
                        Review
                      </Button>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">All caught up!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No pending requests at the moment
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <FeatureDiscoveryPanel workspaceId={selectedWorkspaceId} />
    </AdminLayout>
  );
}
