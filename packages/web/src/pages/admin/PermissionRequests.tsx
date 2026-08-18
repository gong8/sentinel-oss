import { useMemo, useState } from 'react';

import { ErrorAlert } from '../../components/admin';
import { chatPanelStore } from '../../components/agent/chatPanelStore';
import { PageHeader } from '../../components/layout/PageHeader';
import { RequestsPageLayout } from '../../components/layout/RequestsPageLayout';
import { PolicyFormModal, type PolicyFormValues } from '../../components/policy';
import { type OperatorGroups } from '../../components/policy/ConditionBuilder';
import { ActiveFilterBadges } from '../../components/ui/active-filter-badges';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { FilterDialog, FilterSection } from '../../components/ui/filter-dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { SearchFilterBar } from '../../components/ui/search-filter-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { TableLoadingState } from '../../components/ui/table-loading-state';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { formatToolNameForDisplay, getDomainPrefix } from '../../lib/mcpUtils';
import { matcherFromUI, toolPatternFromUI } from '../../lib/policyUtils';
import { getRequestStatusColor } from '../../lib/statusUtils';
import { trpc } from '../../lib/trpc';

// Status filter options
const STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'MODIFIED', 'DENIED'] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];
const STATUS_OPTION_SET: ReadonlySet<string> = new Set(STATUS_OPTIONS);

function isStatusOption(value: string): value is StatusOption {
  return STATUS_OPTION_SET.has(value);
}

// Select placeholder values
const ALL_USERS_VALUE = '__all_users__';
const ALL_SERVERS_VALUE = '__all_servers__';
const ALL_TOOLS_VALUE = '__all_tools__';

// Types
interface McpServerSimple {
  id: string;
  name: string;
  url: string;
  tools?: Array<{ id: string; name: string }>;
}

interface PermissionRequest {
  id: string;
  userId: string;
  status: string;
  type: string;
  toolNames: string[];
  reason: string | null;
  data: unknown;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  user: { email: string };
}

// Type helpers to simplify complex types from tRPC
function getServers<
  T extends Array<{
    id: string;
    name: string;
    url: string;
    tools?: Array<{ id: string; name: string }>;
  }>,
>(data: T | undefined): McpServerSimple[] | undefined {
  return data;
}

function getRequests<
  T extends Array<{
    id: string;
    userId: string;
    status: unknown;
    type: unknown;
    toolNames: string[];
    reason: string | null;
    data: unknown;
    createdAt: unknown;
    reviewedAt: unknown;
    reviewedBy: string | null;
    reviewNote: string | null;
    user: { email: string };
  }>,
>(data: T | undefined): PermissionRequest[] | undefined {
  if (!data) return undefined;
  return data.map((r) => ({
    ...r,
    status: String(r.status),
    type: String(r.type),
    createdAt: String(r.createdAt),
    reviewedAt: r.reviewedAt ? String(r.reviewedAt) : null,
  }));
}

function getReviewDialogTitle(requestType: string, action: 'approve' | 'deny'): string {
  const isDenyRemoval = requestType === 'DENY_REMOVAL';
  const isApprove = action === 'approve';

  if (isDenyRemoval) {
    return isApprove ? 'Approve Restriction Removal' : 'Deny Restriction Removal';
  }
  return isApprove ? 'Approve request' : 'Deny request';
}

export default function AdminPermissionRequests(): React.ReactElement {
  const utils = trpc.useUtils();
  const { workspaces, isOrgOwner, selectedWorkspaceId } = useWorkspace();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusOption>('PENDING');
  const [userFilter, setUserFilter] = useState('');
  const [selectedFilterServer, setSelectedFilterServer] = useState('');
  const [selectedFilterTool, setSelectedFilterTool] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Review state
  const [reviewRequest, setReviewRequest] = useState<{
    request: PermissionRequest;
    action: 'approve' | 'deny';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');

  // Queries
  const requestsQuery = trpc.admin.permissionRequests.list.useQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const allRequests = getRequests(requestsQuery.data);

  const serversQuery = trpc.admin.mcpServers.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const servers = getServers(serversQuery.data);

  const policyDetailsQuery = trpc.admin.permissionRequests.getDenyPolicyDetails.useQuery(
    { requestId: reviewRequest?.request.id ?? '' },
    {
      enabled: !!reviewRequest?.request.id && reviewRequest?.request.type === 'DENY_REMOVAL',
    },
  );

  // Mutations
  const approveMutation = trpc.admin.permissionRequests.approve.useMutation({
    onSuccess: () => utils.admin.permissionRequests.list.invalidate(),
  });

  const denyMutation = trpc.admin.permissionRequests.deny.useMutation({
    onSuccess: () => utils.admin.permissionRequests.list.invalidate(),
  });

  // Policy form modal state for TOOL_ACCESS approval
  const [policyFormOpen, setPolicyFormOpen] = useState(false);
  const [policyFormDefaults, setPolicyFormDefaults] = useState<
    Partial<PolicyFormValues> | undefined
  >(undefined);

  // Users, roles, and agents queries for PolicyFormModal
  const usersQuery = trpc.admin.users.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const rolesQuery = trpc.admin.roles.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const agentsQuery = trpc.admin.agents.list.useQuery(
    { workspaceId: selectedWorkspaceId ?? undefined },
    {
      staleTime: 5 * 60 * 1000,
    },
  );
  const operatorsQuery = trpc.admin.conditions.getOperators.useQuery();

  // Use MCP servers hook for PolicyFormModal (workspace scoped)
  const {
    mcpServers,
    a2aAgents,
    getToolsForServer: getMcpToolsForServer,
    isToolFlagged,
    getToolFlagCountsForServer,
  } = useMcpServers({ workspaceId: selectedWorkspaceId });

  // Denial explanation state
  const [explainDenialOpen, setExplainDenialOpen] = useState(false);
  const [explainDenialRequest, setExplainDenialRequest] = useState<PermissionRequest | null>(null);

  // Error handling
  const errors = useMutationErrors([requestsQuery]);

  // Filter to TOOL_ACCESS and DENY_REMOVAL requests
  const requests = useMemo(() => {
    if (!allRequests) return undefined;
    return allRequests.filter((r) => r.type === 'TOOL_ACCESS' || r.type === 'DENY_REMOVAL');
  }, [allRequests]);

  // Extract unique users for dropdown
  const uniqueUsers = useMemo(() => {
    if (!requests) return [];
    const users = new Set<string>();
    requests.forEach((req) => users.add(req.user.email));
    return Array.from(users).sort();
  }, [requests]);

  // Available servers for filter dropdown
  const availableServers = useMemo(() => {
    if (!servers) return [];
    return servers.map((server) => ({
      id: server.id,
      name: server.name,
      url: server.url,
      tools: server.tools || [],
    }));
  }, [servers]);

  function getToolsForServer(serverName: string): Array<{ id: string; name: string }> {
    if (!serverName) return [];
    const server = availableServers.find((s) => s.name === serverName);
    return server?.tools || [];
  }

  // Apply filters
  const filteredRequests = useMemo(() => {
    if (!requests) return [];

    return requests.filter((request) => {
      // User filter
      if (userFilter && request.user.email !== userFilter) {
        return false;
      }

      // Server filter
      if (selectedFilterServer && servers) {
        const serverData = servers.find((s) => s.name === selectedFilterServer);
        if (serverData) {
          const domainPrefix = getDomainPrefix(serverData.url);
          const hasMatchingServer = request.toolNames.some((toolName) =>
            toolName.startsWith(`${domainPrefix}::`),
          );
          if (!hasMatchingServer) return false;
        }
      }

      // Tool filter
      if (selectedFilterTool && selectedFilterTool !== '*') {
        const hasMatchingTool = request.toolNames.some((toolName) =>
          toolName.endsWith(`::${selectedFilterTool}`),
        );
        if (!hasMatchingTool) return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const email = request.user.email.toLowerCase();
        const reason = (request.reason ?? '').toLowerCase();
        const toolNames = request.toolNames.join(' ').toLowerCase();
        if (!email.includes(query) && !reason.includes(query) && !toolNames.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [requests, searchQuery, userFilter, selectedFilterServer, selectedFilterTool, servers]);

  // Handlers
  function openReview(request: PermissionRequest, action: 'approve' | 'deny'): void {
    setReviewRequest({ request, action });
    setReviewNote('');
    setReviewError('');
    approveMutation.reset();
    denyMutation.reset();

    // For TOOL_ACCESS approval, open the PolicyFormModal
    if (action === 'approve' && request.type === 'TOOL_ACCESS') {
      // Check if this is a chained request from server approval
      const requestData = request.data as Record<string, unknown> | null;
      const isChainedFromServerRequest = Boolean(requestData?.chainedFromRequestId);

      let toolPatterns: Array<{ server: string; tool: string }>;
      let description: string;

      if (isChainedFromServerRequest) {
        // For chained requests, use server-level wildcard (all tools including future)
        const serversForDisplay = servers
          ? servers.map((s) => ({ id: s.id, name: s.name, url: s.url }))
          : [];

        if (request.toolNames.length > 0) {
          // Extract unique server keys from tool names
          const serverKeys = new Set<string>();
          for (const toolName of request.toolNames) {
            const parts = toolName.split('::');
            if (parts.length === 2 && parts[0]) {
              serverKeys.add(parts[0]);
            }
          }

          // Create server-level wildcard patterns for each server
          toolPatterns = Array.from(serverKeys).map((serverKey) => ({
            server: serverKey,
            tool: '*',
          }));

          // Generate description mentioning "all tools"
          const serverNames = Array.from(serverKeys).map((key) => {
            const server = serversForDisplay.find((s) => getDomainPrefix(s.url) === key);
            return server?.name ?? key;
          });
          const serverText =
            serverNames.length === 1 ? serverNames[0] : `${serverNames.length} servers`;
          description = `Allow ${request.user.email} to use all tools on ${serverText}`;
        } else {
          // Empty toolNames - look up server by mcpServerId
          const mcpServerId = requestData?.mcpServerId as string | undefined;
          const server = mcpServerId
            ? serversForDisplay.find((s) => s.id === mcpServerId)
            : undefined;

          if (server) {
            const serverKey = getDomainPrefix(server.url);
            toolPatterns = [{ server: serverKey, tool: '*' }];
            description = `Allow ${request.user.email} to use all tools on ${server.name}`;
          } else {
            // Fallback to wildcard all
            toolPatterns = [{ server: '*', tool: '*' }];
            description = `Allow ${request.user.email} to use all tools`;
          }
        }
      } else {
        // Regular tool access request - convert individual tool names
        toolPatterns = request.toolNames.map((toolName) => {
          const parts = toolName.split('::');
          if (parts.length === 2) {
            return { server: parts[0] || '*', tool: parts[1] || '*' };
          }
          return { server: '*', tool: toolName };
        });

        // Generate a basic description
        const serversForDisplay = servers ? servers.map((s) => ({ name: s.name, url: s.url })) : [];
        const toolNames = request.toolNames
          .map((t) => formatToolNameForDisplay(t, serversForDisplay))
          .map((t) => t.split('::')[1] || t); // Just the tool name part
        const toolsText = toolNames.length === 1 ? toolNames[0] : `${toolNames.length} tools`;
        description = `Allow ${request.user.email} to use ${toolsText}`;
      }

      setPolicyFormDefaults({
        matchers: [{ type: 'user', value: request.user.email }],
        toolPatterns: toolPatterns.length > 0 ? toolPatterns : [{ server: '*', tool: '*' }],
        effect: 'ALLOW',
        description,
        enabled: true,
        conditions: null,
        workspaceId: selectedWorkspaceId ?? null,
      });
      setPolicyFormOpen(true);
    }
  }

  function handleCloseReview(): void {
    setReviewRequest(null);
    setReviewNote('');
    setReviewError('');
    approveMutation.reset();
    denyMutation.reset();
  }

  function handleClosePolicyForm(): void {
    setPolicyFormOpen(false);
    setPolicyFormDefaults(undefined);
    handleCloseReview();
  }

  // Handle PolicyFormModal submission for TOOL_ACCESS approval
  function handlePolicyFormSubmit(values: PolicyFormValues): void {
    if (!reviewRequest) return;

    // Convert UI format to API format
    const matcherStrings = values.matchers.map((m) => matcherFromUI(m.type, m.value));
    const toolPatternStrings = values.toolPatterns.map((tp) =>
      toolPatternFromUI(tp.server, tp.tool),
    );

    approveMutation.mutate(
      {
        id: reviewRequest.request.id,
        reviewNote: reviewNote.trim() || undefined,
        customGrant: {
          matchers: matcherStrings,
          toolPatterns: toolPatternStrings,
          conditions: values.conditions,
          workspaceId: values.workspaceId,
        },
      },
      {
        onSuccess: () => handleClosePolicyForm(),
      },
    );
  }

  function handleApproveDenyRemoval(): void {
    if (!reviewRequest) return;

    // For DENY_REMOVAL, use simple approve
    approveMutation.mutate(
      {
        id: reviewRequest.request.id,
        reviewNote: reviewNote.trim() || undefined,
      },
      {
        onSuccess: () => handleCloseReview(),
      },
    );
  }

  function handleDenySubmit(): void {
    if (!reviewRequest) return;
    if (!reviewNote.trim()) {
      setReviewError('Review note is required for denial.');
      return;
    }
    denyMutation.mutate(
      {
        id: reviewRequest.request.id,
        reviewNote: reviewNote.trim(),
      },
      {
        onSuccess: () => handleCloseReview(),
      },
    );
  }

  function handleSwitchToDeny(): void {
    if (!reviewRequest) return;
    const request = reviewRequest.request;
    handleClosePolicyForm();
    // Small delay to allow modal to close before opening deny dialog
    setTimeout(() => openReview(request, 'deny'), 100);
  }

  function handleResolveInAgent(): void {
    if (!reviewRequest) return;

    const request = reviewRequest.request;
    const serversForDisplay = servers ? servers.map((s) => ({ name: s.name, url: s.url })) : [];
    const formattedTools = request.toolNames
      .map((tool) => formatToolNameForDisplay(tool, serversForDisplay))
      .join(', ');

    const prefillText = `Create a new policy to approve permission request from ${request.user.email} requesting access to: ${formattedTools}

Request ID: ${request.id}
Request reason: ${request.reason || 'No reason provided'}

Create this policy with these modifications:

`;

    // Start a new conversation with the prefilled text
    chatPanelStore.setActiveConversationId(null);
    chatPanelStore.setShowConversationList(false);
    chatPanelStore.setInputValue(prefillText);
    chatPanelStore.setIsOpen(true);
    handleClosePolicyForm();
  }

  // Open denial explanation dialog
  function openDenialExplanation(request: PermissionRequest): void {
    setExplainDenialRequest(request);
    setExplainDenialOpen(true);
  }

  function closeDenialExplanation(): void {
    setExplainDenialOpen(false);
    setExplainDenialRequest(null);
  }

  function clearFilters(): void {
    setSearchQuery('');
    setUserFilter('');
    setSelectedFilterServer('');
    setSelectedFilterTool('');
    setFiltersOpen(false);
  }

  function renderToolNames(request: PermissionRequest): React.ReactElement {
    const serversForDisplay = servers
      ? servers.map((s) => ({ id: s.id, name: s.name, url: s.url }))
      : [];
    const requestData = request.data as Record<string, unknown> | null;
    const isChainedFromServerRequest = Boolean(requestData?.chainedFromRequestId);

    // Handle chained request with empty toolNames
    if (isChainedFromServerRequest && request.toolNames.length === 0) {
      const mcpServerId = requestData?.mcpServerId as string | undefined;
      const server = mcpServerId ? serversForDisplay.find((s) => s.id === mcpServerId) : undefined;
      const serverName = server?.name ?? 'server';
      return <div className="text-sm font-medium">All tools on {serverName}</div>;
    }

    const formattedToolNames = request.toolNames.map((tool) =>
      formatToolNameForDisplay(tool, serversForDisplay),
    );
    return <div className="text-sm font-medium">{formattedToolNames.join(', ')}</div>;
  }

  const hasActiveFilters = searchQuery || userFilter || selectedFilterServer || selectedFilterTool;
  const activeFilterCount = [userFilter, selectedFilterServer, selectedFilterTool].filter(
    Boolean,
  ).length;

  return (
    <RequestsPageLayout>
      <div className="space-y-8">
        <PageHeader
          title="Permission Requests"
          description="Review and approve tool access requests."
        />

        <ErrorAlert title="Failed to load requests" errors={errors} />

        {/* Search and Filter Bar */}
        <SearchFilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by user, reason, or tool name..."
          onFilterClick={() => setFiltersOpen(true)}
          filterCount={activeFilterCount}
        >
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (isStatusOption(value)) {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger className="w-[160px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SearchFilterBar>

        {/* Active Filters Display */}
        <ActiveFilterBadges
          filters={[
            { key: 'user', label: 'User', value: userFilter, onClear: () => setUserFilter('') },
            {
              key: 'server',
              label: 'Server',
              value: selectedFilterServer,
              onClear: () => {
                setSelectedFilterServer('');
                setSelectedFilterTool('');
              },
            },
            {
              key: 'tool',
              label: 'Tool',
              value: selectedFilterTool === '*' ? '' : selectedFilterTool,
              onClear: () => setSelectedFilterTool(''),
            },
          ]}
          onClearAll={clearFilters}
          filteredCount={filteredRequests.length}
          totalCount={requests?.length ?? 0}
        />

        {/* Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle>Permission Requests</CardTitle>
            <CardDescription>{filteredRequests.length} requests found.</CardDescription>
          </CardHeader>
          <CardContent>
            <TableLoadingState
              isLoading={requestsQuery.isPending}
              isEmpty={filteredRequests.length === 0}
              hasActiveFilters={Boolean(hasActiveFilters)}
              emptyTitle="No permission requests"
              emptyDescription="Permission requests will show up here."
              filteredEmptyTitle="No permission requests"
              filteredEmptyDescription="No requests match your search."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Tools</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.user.email}</TableCell>
                      <TableCell className="text-sm">
                        {request.type === 'DENY_REMOVAL' ? 'Restriction Removal' : 'Tool Access'}
                      </TableCell>
                      <TableCell>{renderToolNames(request)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="truncate text-sm text-muted-foreground">
                          {request.reason}
                        </div>
                      </TableCell>
                      <TableCell
                        className={`text-xs font-bold ${getRequestStatusColor(request.status)}`}
                      >
                        {request.status}
                      </TableCell>
                      <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {request.status === 'PENDING' ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => openReview(request, 'approve')}>
                              Review
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReview(request, 'deny')}
                            >
                              Deny
                            </Button>
                          </div>
                        ) : request.status === 'DENIED' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs gap-1"
                            onClick={() => openDenialExplanation(request)}
                          >
                            Why denied?
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Reviewed</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableLoadingState>
          </CardContent>
        </Card>

        {/* TOOL_ACCESS Approval Modal - uses PolicyFormModal */}
        <PolicyFormModal
          open={policyFormOpen}
          onOpenChange={(open) => {
            if (!open) handleClosePolicyForm();
          }}
          mode="create"
          defaultValues={policyFormDefaults}
          onSubmit={handlePolicyFormSubmit}
          isSubmitting={approveMutation.isPending}
          error={approveMutation.error?.message}
          users={usersQuery.data}
          roles={rolesQuery.data}
          agents={agentsQuery.data}
          mcpServers={mcpServers}
          a2aAgents={a2aAgents}
          getToolsForServer={getMcpToolsForServer}
          isToolFlagged={isToolFlagged}
          getToolFlagCountsForServer={getToolFlagCountsForServer}
          operators={(operatorsQuery.data?.operators ?? {}) as OperatorGroups}
          workspaces={workspaces}
          isOrgOwner={isOrgOwner}
          prefillRequest={
            reviewRequest?.request.type === 'TOOL_ACCESS'
              ? {
                  requestId: reviewRequest.request.id,
                  userEmail: reviewRequest.request.user.email,
                  toolNames: reviewRequest.request.toolNames,
                  reason: reviewRequest.request.reason,
                  createdAt: reviewRequest.request.createdAt,
                }
              : undefined
          }
          reviewNote={reviewNote}
          onReviewNoteChange={setReviewNote}
          submitButtonText="Approve"
          submitButtonLoadingText="Approving..."
          extraFooterButtons={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleSwitchToDeny}
                disabled={approveMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                Deny
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResolveInAgent}
                disabled={approveMutation.isPending}
              >
                Resolve in Agent
              </Button>
            </>
          }
        />

        {/* DENY_REMOVAL and Deny Modal */}
        <Dialog
          open={
            Boolean(reviewRequest) &&
            (reviewRequest?.request.type === 'DENY_REMOVAL' || reviewRequest?.action === 'deny')
          }
          onOpenChange={(open) => !open && handleCloseReview()}
        >
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {reviewRequest
                  ? getReviewDialogTitle(reviewRequest.request.type, reviewRequest.action)
                  : 'Review request'}
              </DialogTitle>
              <DialogDescription>
                Review request from {reviewRequest?.request.user.email}
              </DialogDescription>
            </DialogHeader>

            {(approveMutation.error || denyMutation.error) && (
              <Alert variant="destructive">
                <AlertTitle>Validation Failed</AlertTitle>
                <AlertDescription>
                  {approveMutation.error?.message || denyMutation.error?.message}
                </AlertDescription>
              </Alert>
            )}

            {reviewRequest && (
              <div className="space-y-4 py-2">
                {reviewRequest.request.type === 'DENY_REMOVAL' ? (
                  <DenyRemovalContent
                    policyDetailsQuery={policyDetailsQuery}
                    toolNames={reviewRequest.request.toolNames}
                    servers={servers}
                  />
                ) : (
                  <ToolAccessContent
                    toolNames={reviewRequest.request.toolNames}
                    servers={servers}
                    requestData={reviewRequest.request.data as Record<string, unknown> | null}
                  />
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Reason provided</Label>
                  <p className="text-sm bg-muted/20 border rounded-md p-2.5">
                    {reviewRequest.request.reason}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reviewNote">
                    Comment {reviewRequest.action === 'deny' ? '(required)' : '(optional)'}
                  </Label>
                  <Input
                    id="reviewNote"
                    placeholder="Add a comment..."
                    value={reviewNote}
                    onChange={(event) => {
                      setReviewNote(event.target.value);
                      setReviewError('');
                    }}
                  />
                  {reviewError && <p className="text-xs text-destructive">{reviewError}</p>}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              {reviewRequest?.action === 'approve' &&
              reviewRequest.request.type === 'DENY_REMOVAL' ? (
                <>
                  <Button type="button" variant="outline" onClick={handleCloseReview}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleApproveDenyRemoval}
                    disabled={approveMutation.isPending || policyDetailsQuery.isPending}
                  >
                    {approveMutation.isPending ? 'Removing...' : 'Remove Restriction'}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={handleCloseReview}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDenySubmit}
                    disabled={denyMutation.isPending}
                  >
                    Deny
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Filters Modal */}
        <FilterDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          onClearAll={clearFilters}
          title="Filter Permission Requests"
        >
          {requestsQuery.isPending || serversQuery.isPending ? (
            <div className="py-8 text-center text-muted-foreground">Loading filter options...</div>
          ) : (
            <>
              <FilterSection label="User Email">
                <Select
                  value={userFilter || ALL_USERS_VALUE}
                  onValueChange={(value) => setUserFilter(value === ALL_USERS_VALUE ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_USERS_VALUE}>All users</SelectItem>
                    {uniqueUsers.map((email) => (
                      <SelectItem key={email} value={email}>
                        {email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterSection>

              <FilterSection label="Tool Name">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select
                      value={selectedFilterServer || ALL_SERVERS_VALUE}
                      onValueChange={(value) => {
                        setSelectedFilterServer(value === ALL_SERVERS_VALUE ? '' : value);
                        setSelectedFilterTool('');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="MCP Server" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_SERVERS_VALUE}>All servers</SelectItem>
                        {availableServers
                          .filter((server) => server?.id && server?.name)
                          .map((server) => (
                            <SelectItem key={server.id} value={server.name}>
                              {server.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-muted-foreground">::</span>
                  <div className="flex-1">
                    <Select
                      value={selectedFilterTool || ALL_TOOLS_VALUE}
                      onValueChange={(value) =>
                        setSelectedFilterTool(value === ALL_TOOLS_VALUE ? '' : value)
                      }
                      disabled={!selectedFilterServer}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tool" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_TOOLS_VALUE}>All tools</SelectItem>
                        {getToolsForServer(selectedFilterServer)
                          .filter((tool) => tool?.id && tool?.name)
                          .map((tool) => (
                            <SelectItem key={tool.id} value={tool.name}>
                              {tool.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select a server to filter by specific tools
                </p>
              </FilterSection>
            </>
          )}
        </FilterDialog>

        {/* Denial Explanation Dialog */}
        <Dialog open={explainDenialOpen} onOpenChange={closeDenialExplanation}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">Request Denied</DialogTitle>
              <DialogDescription>Details about why this request was denied.</DialogDescription>
            </DialogHeader>

            {explainDenialRequest && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">User:</span>{' '}
                    <span className="font-medium">{explainDenialRequest.user.email}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Tools:</span>{' '}
                    <span className="font-mono text-xs">
                      {explainDenialRequest.toolNames.slice(0, 3).join(', ')}
                      {explainDenialRequest.toolNames.length > 3 &&
                        ` +${explainDenialRequest.toolNames.length - 3} more`}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Denied at:</span>{' '}
                    {formatDateTime(
                      explainDenialRequest.reviewedAt || explainDenialRequest.createdAt,
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Comment</Label>
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm whitespace-pre-wrap">
                      {explainDenialRequest.reviewNote || 'No comment provided.'}
                    </p>
                  </div>
                </div>

                {explainDenialRequest.reason && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Original request reason</Label>
                    <p className="text-sm text-muted-foreground italic">
                      {explainDenialRequest.reason}
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDenialExplanation}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequestsPageLayout>
  );
}

// Helper components for review modal content
interface DenyRemovalContentProps {
  policyDetailsQuery: {
    isPending: boolean;
    data?: {
      status: string;
      policy: {
        slug: string;
        description: string | null;
        matchers: string[];
        toolPatterns: string[];
      } | null;
      warnings: string[];
    };
  };
  toolNames: string[];
  servers: McpServerSimple[] | undefined;
}

function DenyRemovalContent({
  policyDetailsQuery,
  toolNames,
  servers,
}: DenyRemovalContentProps): React.ReactElement {
  const serversForDisplay = servers ? servers.map((s) => ({ name: s.name, url: s.url })) : [];

  return (
    <>
      {policyDetailsQuery.isPending ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          Loading policy details...
        </div>
      ) : policyDetailsQuery.data?.status === 'POLICY_NOT_FOUND' ? (
        <Alert>
          <AlertTitle>Policy Not Found</AlertTitle>
          <AlertDescription>
            The restriction policy has been deleted. You can approve to mark this request as
            complete.
          </AlertDescription>
        </Alert>
      ) : policyDetailsQuery.data?.status === 'ALREADY_DELETED' ? (
        <Alert>
          <AlertTitle>Already Removed</AlertTitle>
          <AlertDescription>This restriction has already been removed.</AlertDescription>
        </Alert>
      ) : policyDetailsQuery.data?.policy ? (
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Policy</div>
              <div className="font-mono text-sm">{policyDetailsQuery.data.policy.slug}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Description</div>
              <div className="text-sm">{policyDetailsQuery.data.policy.description}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Affects</div>
              <div className="flex flex-wrap gap-1">
                {policyDetailsQuery.data.policy.matchers.map((m) => (
                  <Badge key={m} variant="outline" className="font-mono text-xs">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Blocks</div>
              <div className="flex flex-wrap gap-1">
                {policyDetailsQuery.data.policy.toolPatterns.map((tp) => (
                  <Badge key={tp} variant="secondary" className="font-mono text-xs">
                    {tp}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {policyDetailsQuery.data.warnings.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1">
                  {policyDetailsQuery.data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="text-sm font-medium mb-2">Requested for tools</div>
        <div className="flex flex-wrap gap-1.5">
          {toolNames.map((toolName) => (
            <Badge key={toolName} variant="secondary" className="font-mono text-xs">
              {formatToolNameForDisplay(toolName, serversForDisplay)}
            </Badge>
          ))}
        </div>
      </div>
    </>
  );
}

interface ToolAccessContentProps {
  toolNames: string[];
  servers: McpServerSimple[] | undefined;
  requestData?: Record<string, unknown> | null;
}

function ToolAccessContent({
  toolNames,
  servers,
  requestData,
}: ToolAccessContentProps): React.ReactElement {
  const serversForDisplay = servers
    ? servers.map((s) => ({ id: s.id, name: s.name, url: s.url }))
    : [];
  const isChainedFromServerRequest = Boolean(requestData?.chainedFromRequestId);

  // For chained requests with empty toolNames, look up server name
  if (isChainedFromServerRequest && toolNames.length === 0) {
    const mcpServerId = requestData?.mcpServerId as string | undefined;
    const server = mcpServerId ? serversForDisplay.find((s) => s.id === mcpServerId) : undefined;
    const serverName = server?.name ?? 'the server';

    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="text-sm font-medium mb-2">Access to all tools on {serverName}</div>
        <div className="text-xs text-muted-foreground">
          This includes all current and future tools on this server.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-sm font-medium mb-2">Access to {toolNames.length} tools</div>
      <div className="flex flex-wrap gap-1.5">
        {toolNames.map((toolName) => (
          <Badge key={toolName} variant="secondary" className="font-mono text-xs">
            {formatToolNameForDisplay(toolName, serversForDisplay)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
