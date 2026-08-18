import { useMemo, useState } from 'react';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { RequestsPageLayout } from '../../components/layout/RequestsPageLayout';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { ActiveFilterBadges } from '../../components/ui/active-filter-badges';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
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
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { getRequestStatusColor } from '../../lib/statusUtils';
import { trpc } from '../../lib/trpc';

const STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'MODIFIED', 'DENIED'] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

const ALL_VALUE = '__all__';

interface McpServerRequestData {
  name?: string;
  url?: string;
  authType?: string;
  apiKey?: string;
  alsoRequestTools?: boolean;
}

function getMcpServerData(data: unknown): McpServerRequestData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  // Safe narrowing - all properties are optional and typed as string | undefined
  const obj = data as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' ? obj.name : undefined,
    url: typeof obj.url === 'string' ? obj.url : undefined,
    authType: typeof obj.authType === 'string' ? obj.authType : undefined,
    apiKey: typeof obj.apiKey === 'string' ? obj.apiKey : undefined,
    alsoRequestTools: typeof obj.alsoRequestTools === 'boolean' ? obj.alsoRequestTools : undefined,
  };
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

function parseRequests(
  data:
    | Array<{
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
      }>
    | undefined,
): PermissionRequest[] | undefined {
  if (!data) return undefined;
  return data.map((r) => ({
    ...r,
    status: String(r.status),
    type: String(r.type),
    createdAt: String(r.createdAt),
    reviewedAt: r.reviewedAt ? String(r.reviewedAt) : null,
  }));
}

export default function McpServerRequests(): React.ReactElement {
  const utils = trpc.useUtils();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusOption>('PENDING');
  const [userFilter, setUserFilter] = useState('');
  const [serverFilter, setServerFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Review state
  const [reviewRequest, setReviewRequest] = useState<{
    request: PermissionRequest;
    action: 'approve' | 'deny';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewApiKey, setReviewApiKey] = useState('');

  const { selectedWorkspaceId } = useWorkspace();

  // Query
  const requestsQuery = trpc.admin.permissionRequests.list.useQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  // Mutations
  const approveMutation = trpc.admin.permissionRequests.approve.useMutation({
    onSuccess: () => utils.admin.permissionRequests.list.invalidate(),
  });
  const denyMutation = trpc.admin.permissionRequests.deny.useMutation({
    onSuccess: () => utils.admin.permissionRequests.list.invalidate(),
  });

  // Filter to MCP_SERVER requests only
  const requests = useMemo(() => {
    const parsed = parseRequests(requestsQuery.data);
    return parsed?.filter((r) => r.type === 'MCP_SERVER');
  }, [requestsQuery.data]);

  // Extract unique values for filter dropdowns
  const { uniqueUsers, uniqueServers } = useMemo(() => {
    if (!requests) return { uniqueUsers: [], uniqueServers: [] };

    const users = new Set<string>();
    const servers = new Set<string>();

    for (const req of requests) {
      users.add(req.user.email);
      const mcpData = getMcpServerData(req.data);
      if (mcpData?.name) servers.add(mcpData.name);
    }

    return {
      uniqueUsers: Array.from(users).sort(),
      uniqueServers: Array.from(servers).sort(),
    };
  }, [requests]);

  // Apply filters
  const filteredRequests = useMemo(() => {
    if (!requests) return [];

    return requests.filter((request) => {
      if (userFilter && request.user.email !== userFilter) return false;

      if (serverFilter) {
        const mcpData = getMcpServerData(request.data);
        if (mcpData?.name !== serverFilter) return false;
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const email = request.user.email.toLowerCase();
        const reason = (request.reason ?? '').toLowerCase();
        const mcpData = getMcpServerData(request.data);
        const mcpDetails = `${mcpData?.name || ''} ${mcpData?.url || ''}`.toLowerCase();

        if (!email.includes(query) && !reason.includes(query) && !mcpDetails.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [requests, searchQuery, userFilter, serverFilter]);

  // Review handlers
  const openReview = (request: PermissionRequest, action: 'approve' | 'deny') => {
    const mcpData = getMcpServerData(request.data);
    setReviewRequest({ request, action });
    setReviewNote('');
    setReviewError('');
    setReviewApiKey(mcpData?.authType === 'API_KEY' ? (mcpData?.apiKey ?? '') : '');
    approveMutation.reset();
    denyMutation.reset();
  };

  const closeReview = () => {
    setReviewRequest(null);
    setReviewNote('');
    setReviewError('');
    setReviewApiKey('');
  };

  const handleApprove = () => {
    if (!reviewRequest) return;

    const mcpData = getMcpServerData(reviewRequest.request.data);
    const payload: { id: string; reviewNote?: string; apiKey?: string } = {
      id: reviewRequest.request.id,
      reviewNote: reviewNote.trim() || undefined,
    };

    if (mcpData?.authType === 'API_KEY' && reviewApiKey.trim()) {
      payload.apiKey = reviewApiKey.trim();
    }

    approveMutation.mutate(payload, { onSuccess: closeReview });
  };

  const handleDeny = () => {
    if (!reviewRequest) return;
    if (!reviewNote.trim()) {
      setReviewError('Review note is required for denial.');
      return;
    }

    denyMutation.mutate(
      { id: reviewRequest.request.id, reviewNote: reviewNote.trim() },
      { onSuccess: closeReview },
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setUserFilter('');
    setServerFilter('');
    setFiltersOpen(false);
  };

  const activeFilterCount = [userFilter, serverFilter].filter(Boolean).length;

  return (
    <RequestsPageLayout>
      <div className="space-y-8">
        <PageHeader
          title="MCP Server Requests"
          description="Review and approve MCP server requests."
        />

        {requestsQuery.error && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load requests</AlertTitle>
            <AlertDescription>{requestsQuery.error.message}</AlertDescription>
          </Alert>
        )}

        <SearchFilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by user, reason, or server name..."
          onFilterClick={() => setFiltersOpen(true)}
          filterCount={activeFilterCount}
        >
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusOption)}>
            <SelectTrigger className="w-[160px]">
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

        <ActiveFilterBadges
          filters={[
            { key: 'user', label: 'User', value: userFilter, onClear: () => setUserFilter('') },
            {
              key: 'server',
              label: 'Server',
              value: serverFilter,
              onClear: () => setServerFilter(''),
            },
          ]}
          onClearAll={clearFilters}
          filteredCount={filteredRequests.length}
          totalCount={requests?.length ?? 0}
        />

        <Card>
          <CardHeader>
            <CardTitle>MCP Server Requests</CardTitle>
            <CardDescription>{filteredRequests.length} requests found.</CardDescription>
          </CardHeader>
          <CardContent>
            {requestsQuery.isPending ? (
              <TableSkeleton />
            ) : filteredRequests.length > 0 ? (
              <RequestsTable
                requests={filteredRequests}
                onApprove={(req) => openReview(req, 'approve')}
                onDeny={(req) => openReview(req, 'deny')}
              />
            ) : (
              <EmptyState
                title="No MCP server requests"
                description={
                  searchQuery
                    ? 'No requests match your search.'
                    : 'MCP server requests will show up here.'
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <ReviewDialog
          reviewRequest={reviewRequest}
          onClose={closeReview}
          reviewNote={reviewNote}
          setReviewNote={(v) => {
            setReviewNote(v);
            setReviewError('');
          }}
          reviewError={reviewError}
          reviewApiKey={reviewApiKey}
          setReviewApiKey={setReviewApiKey}
          onApprove={handleApprove}
          onDeny={handleDeny}
          isApproving={approveMutation.isPending}
          isDenying={denyMutation.isPending}
          mutationError={approveMutation.error?.message || denyMutation.error?.message}
        />

        {/* Filters Dialog */}
        <FilterDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          onClearAll={clearFilters}
          title="Filter MCP Server Requests"
        >
          <FilterSection label="User Email">
            <Select
              value={userFilter || ALL_VALUE}
              onValueChange={(v) => setUserFilter(v === ALL_VALUE ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All users</SelectItem>
                {uniqueUsers.map((email) => (
                  <SelectItem key={email} value={email}>
                    {email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection label="Server Name">
            <Select
              value={serverFilter || ALL_VALUE}
              onValueChange={(v) => setServerFilter(v === ALL_VALUE ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All servers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All servers</SelectItem>
                {uniqueServers.length > 0 ? (
                  uniqueServers.map((server) => (
                    <SelectItem key={server} value={server}>
                      {server}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__none__" disabled>
                    No servers available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </FilterSection>
        </FilterDialog>
      </div>
    </RequestsPageLayout>
  );
}

// Requests table component
interface RequestsTableProps {
  requests: PermissionRequest[];
  onApprove: (request: PermissionRequest) => void;
  onDeny: (request: PermissionRequest) => void;
}

function RequestsTable({ requests, onApprove, onDeny }: RequestsTableProps): React.ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Server Name</TableHead>
          <TableHead>URL</TableHead>
          <TableHead>Auth Type</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => {
          const mcpData = getMcpServerData(request.data);
          return (
            <TableRow key={request.id}>
              <TableCell className="font-medium">{request.user.email}</TableCell>
              <TableCell className="font-semibold">{mcpData?.name}</TableCell>
              <TableCell className="font-mono text-xs max-w-[200px] truncate">
                {mcpData?.url}
              </TableCell>
              <TableCell className="text-sm">{mcpData?.authType}</TableCell>
              <TableCell className="max-w-[200px]">
                <div className="truncate text-sm text-muted-foreground">{request.reason}</div>
              </TableCell>
              <TableCell className={`text-xs font-bold ${getRequestStatusColor(request.status)}`}>
                {request.status}
              </TableCell>
              <TableCell>{formatDateTime(request.createdAt)}</TableCell>
              <TableCell className="text-right">
                {request.status === 'PENDING' ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => onApprove(request)}>
                      Approve
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onDeny(request)}>
                      Deny
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Reviewed</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// Review dialog component
interface ReviewDialogProps {
  reviewRequest: { request: PermissionRequest; action: 'approve' | 'deny' } | null;
  onClose: () => void;
  reviewNote: string;
  setReviewNote: (value: string) => void;
  reviewError: string;
  reviewApiKey: string;
  setReviewApiKey: (value: string) => void;
  onApprove: () => void;
  onDeny: () => void;
  isApproving: boolean;
  isDenying: boolean;
  mutationError?: string;
}

function ReviewDialog({
  reviewRequest,
  onClose,
  reviewNote,
  setReviewNote,
  reviewError,
  reviewApiKey,
  setReviewApiKey,
  onApprove,
  onDeny,
  isApproving,
  isDenying,
  mutationError,
}: ReviewDialogProps): React.ReactElement | null {
  if (!reviewRequest) return null;

  const { request, action } = reviewRequest;
  const mcpData = getMcpServerData(request.data);
  const isApprove = action === 'approve';
  const isLoading = isApproving || isDenying;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isApprove ? 'Approve MCP Server' : 'Deny MCP Server'}</DialogTitle>
          <DialogDescription>Review request from {request.user.email}</DialogDescription>
        </DialogHeader>

        {mutationError && (
          <Alert variant="destructive">
            <AlertTitle>Validation Failed</AlertTitle>
            <AlertDescription>{mutationError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          {/* Request Summary */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-sm font-medium mb-2">
              Add MCP Server &quot;{mcpData?.name}&quot;
            </div>
            <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{mcpData?.name}</span>
              <span className="text-muted-foreground">URL:</span>
              <span className="font-mono text-xs truncate">{mcpData?.url}</span>
              <span className="text-muted-foreground">Auth:</span>
              <span>{mcpData?.authType}</span>
            </div>
          </div>

          {/* User Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reason provided</Label>
            <p className="text-sm bg-muted/20 border rounded-md p-2.5">{request.reason}</p>
          </div>

          {/* API Key for API_KEY auth */}
          {isApprove && mcpData?.authType === 'API_KEY' && (
            <div className="space-y-2">
              <Label htmlFor="review-apiKey">API Key (optional)</Label>
              <Input
                id="review-apiKey"
                type="password"
                placeholder="Provide API key if needed"
                value={reviewApiKey}
                onChange={(e) => setReviewApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to approve without a key.</p>
            </div>
          )}

          {/* Review Note */}
          <div className="space-y-2">
            <Label htmlFor="reviewNote">
              Review note {!isApprove ? '(required)' : '(optional)'}
            </Label>
            <Input
              id="reviewNote"
              placeholder="Add a comment..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
            {reviewError && <p className="text-xs text-destructive">{reviewError}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {isApprove ? (
            <Button onClick={onApprove} disabled={isLoading}>
              Approve
            </Button>
          ) : (
            <Button variant="destructive" onClick={onDeny} disabled={isLoading}>
              Deny
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
