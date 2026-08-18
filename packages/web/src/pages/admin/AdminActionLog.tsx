import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { DataTableCard, DateRangeFilter, ErrorAlert } from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { ActiveFilters } from '../../components/ui/active-filter-badges';
import { FilterDialog } from '../../components/ui/filter-dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { PaginationControls } from '../../components/ui/pagination-controls';
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
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { downloadPdfFromBase64 } from '../../lib/download';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const actionTypeLabels = {
  USER_CREATE: 'Create User',
  USER_UPDATE: 'Update User',
  USER_DELETE: 'Delete User',
  USER_RESTORE: 'Restore User',
  USER_ROLES_UPDATE: 'Update User Roles',
  USER_TOKEN_REFRESH: 'Refresh User Token',
  USER_TOKEN_REVOKE: 'Revoke User Token',
  ROLE_CREATE: 'Create Role',
  ROLE_UPDATE: 'Update Role',
  ROLE_DELETE: 'Delete Role',
  ROLE_RESTORE: 'Restore Role',
  POLICY_CREATE: 'Create Policy',
  POLICY_UPDATE: 'Update Policy',
  POLICY_DELETE: 'Delete Policy',
  POLICY_RESTORE: 'Restore Policy',
  POLICY_ENABLE: 'Enable Policy',
  POLICY_DISABLE: 'Disable Policy',
  POLICY_CONFLICT_RESOLVE: 'Resolve Policy Conflict',
  MCP_SERVER_CREATE: 'Create MCP Server',
  MCP_SERVER_UPDATE: 'Update MCP Server',
  MCP_SERVER_DELETE: 'Delete MCP Server',
  MCP_SERVER_RESTORE: 'Restore MCP Server',
  MCP_SERVER_DISCOVER_TOOLS: 'Discover Tools',
  MCP_SERVER_ORG_API_KEY_ADD: 'Add Org API Key',
  MCP_SERVER_ORG_API_KEY_UPDATE: 'Update Org API Key',
  MCP_SERVER_ORG_API_KEY_REMOVE: 'Remove Org API Key',
  OAUTH_DISCOVER: 'OAuth Discover',
  OAUTH_CLIENT_REGISTER: 'Register OAuth Client',
  OAUTH_CLIENT_CONFIGURE: 'Configure OAuth Client',
  OAUTH_FLOW_INITIATE: 'Initiate OAuth Flow',
  OAUTH_FLOW_COMPLETE: 'Complete OAuth Flow',
  OAUTH_TOKEN_REFRESH: 'Refresh OAuth Token',
  OAUTH_TOKEN_REVOKE: 'Revoke OAuth Token',
  OAUTH_DISCONNECT: 'OAuth Disconnect',
  AGENT_CREATE: 'Create Agent',
  AGENT_DELETE: 'Delete Agent',
  AGENT_RESTORE: 'Restore Agent',
  PERMISSION_REQUEST_APPROVE: 'Approve Request',
  PERMISSION_REQUEST_DENY: 'Deny Request',
  ORGANIZATION_UPDATE: 'Update Organization',
} as const;
type ActionTypeKey = keyof typeof actionTypeLabels;
type ActionTypeFilter = ActionTypeKey | 'all';

function isActionTypeFilter(value: string): value is ActionTypeFilter {
  return value === 'all' || value in actionTypeLabels;
}

const resourceTypeLabels = {
  USER: 'User',
  ROLE: 'Role',
  POLICY: 'Policy',
  MCP_SERVER: 'MCP Server',
  OAUTH_CLIENT: 'OAuth Client',
  AGENT: 'Agent',
  PERMISSION_REQUEST: 'Permission Request',
  ORGANIZATION: 'Organization',
} as const;
type ResourceTypeKey = keyof typeof resourceTypeLabels;
type ResourceTypeFilter = ResourceTypeKey | 'all';

function isResourceTypeFilter(value: string): value is ResourceTypeFilter {
  return value === 'all' || value in resourceTypeLabels;
}

interface AdminActionLogEntry {
  id: string;
  actionType: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  reason: string | null;
  timestamp: string;
  adminUserId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  actionDetails: unknown;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  adminUser: {
    id: string;
    email: string;
  } | null;
}

function getLogEntries<
  T extends {
    entries: Array<{
      id: string;
      actionType: unknown;
      resourceType: unknown;
      resourceId: string | null;
      resourceName: string | null;
      reason: string | null;
      timestamp: unknown;
      adminUserId: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      actionDetails: unknown;
      beforeSnapshot: unknown;
      afterSnapshot: unknown;
      adminUser: {
        id: string;
        email: string;
      } | null;
    }>;
    total: number;
  },
>(data: T | undefined): { entries: AdminActionLogEntry[]; total: number } | undefined {
  if (!data) return undefined;
  return {
    entries: data.entries.map((e) => ({
      ...e,
      actionType: String(e.actionType),
      resourceType: String(e.resourceType),
      timestamp: String(e.timestamp),
    })),
    total: data.total,
  };
}

function isActionTypeKey(value: string): value is ActionTypeKey {
  return value in actionTypeLabels;
}

function getActionTypeLabel(actionType: string): string {
  if (isActionTypeKey(actionType)) {
    return actionTypeLabels[actionType];
  }
  return actionType;
}

function isResourceTypeKey(value: string): value is ResourceTypeKey {
  return value in resourceTypeLabels;
}

function getResourceTypeLabel(resourceType: string): string {
  if (isResourceTypeKey(resourceType)) {
    return resourceTypeLabels[resourceType];
  }
  return resourceType;
}

const EMPTY_ACTION_LOG_ENTRIES: AdminActionLogEntry[] = [];
const LIMIT = 50;

export default function AdminActionLog(): React.ReactElement {
  const navigate = useNavigate();
  const { selectedWorkspaceId, selectedWorkspaceSlug, isGlobalView } = useWorkspace();
  const usersQuery = trpc.admin.users.list.useQuery();

  const [searchQuery, setSearchQuery] = useState('');
  const [adminUserIdFilter, setAdminUserIdFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<ResourceTypeFilter>('all');
  const [resourceIdFilter, setResourceIdFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  const handleRowClick = (entryId: string) => {
    navigate(`${adminPrefix}/action-log/${entryId}`);
  };

  const input = useMemo(
    () => ({
      workspaceId: selectedWorkspaceId ?? undefined,
      adminUserId: adminUserIdFilter || undefined,
      actionType: actionTypeFilter === 'all' ? undefined : actionTypeFilter,
      resourceType: resourceTypeFilter === 'all' ? undefined : resourceTypeFilter,
      resourceId: resourceIdFilter || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate + 'T23:59:59') : undefined,
      limit: LIMIT,
      offset: page * LIMIT,
    }),
    [
      selectedWorkspaceId,
      adminUserIdFilter,
      actionTypeFilter,
      resourceTypeFilter,
      resourceIdFilter,
      startDate,
      endDate,
      page,
    ],
  );

  const logsQuery = trpc.admin.adminActionLogs.list.useQuery(input);
  const logsData = getLogEntries(logsQuery.data);

  const exportPdfMutation = trpc.admin.adminActionLogs.exportPdf.useMutation({
    onSuccess: (result) => {
      downloadPdfFromBase64(result.data, result.filename);
    },
  });

  function handleExportPdf(): void {
    exportPdfMutation.mutate({
      adminUserId: adminUserIdFilter || undefined,
      actionType: actionTypeFilter === 'all' ? undefined : actionTypeFilter,
      resourceType: resourceTypeFilter === 'all' ? undefined : resourceTypeFilter,
      resourceId: resourceIdFilter || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate + 'T23:59:59') : undefined,
      limit: 500,
      workspaceId: selectedWorkspaceId ?? undefined,
    });
  }

  const entries = logsData?.entries ?? EMPTY_ACTION_LOG_ENTRIES;
  const total = logsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter((entry) => {
      const adminEmail = (entry.adminUser?.email || '').toLowerCase();
      const resourceName = (entry.resourceName || '').toLowerCase();
      const actionType = getActionTypeLabel(entry.actionType).toLowerCase();
      const reason = (entry.reason || '').toLowerCase();
      return (
        adminEmail.includes(query) ||
        resourceName.includes(query) ||
        actionType.includes(query) ||
        reason.includes(query)
      );
    });
  }, [entries, searchQuery]);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(adminUserIdFilter) ||
    actionTypeFilter !== 'all' ||
    resourceTypeFilter !== 'all' ||
    Boolean(resourceIdFilter) ||
    Boolean(startDate) ||
    Boolean(endDate);

  const activeFilterCount = [
    adminUserIdFilter,
    actionTypeFilter !== 'all',
    resourceTypeFilter !== 'all',
    resourceIdFilter,
    startDate,
    endDate,
  ].filter(Boolean).length;

  function clearFilters(): void {
    setSearchQuery('');
    setAdminUserIdFilter('');
    setActionTypeFilter('all');
    setResourceTypeFilter('all');
    setResourceIdFilter('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  }

  const errors = useMutationErrors([logsQuery]);

  const activeFilters = useMemo(() => {
    const filters = [];
    if (adminUserIdFilter) {
      const adminEmail =
        usersQuery.data?.find((u) => u.id === adminUserIdFilter)?.email ?? adminUserIdFilter;
      filters.push({
        key: 'admin',
        label: 'Admin',
        value: adminEmail,
        onRemove: () => setAdminUserIdFilter(''),
      });
    }
    if (actionTypeFilter !== 'all') {
      filters.push({
        key: 'action',
        label: 'Action',
        value: actionTypeLabels[actionTypeFilter] ?? actionTypeFilter,
        onRemove: () => setActionTypeFilter('all'),
      });
    }
    if (resourceTypeFilter !== 'all') {
      filters.push({
        key: 'resource',
        label: 'Resource',
        value: resourceTypeLabels[resourceTypeFilter] ?? resourceTypeFilter,
        onRemove: () => setResourceTypeFilter('all'),
      });
    }
    if (resourceIdFilter) {
      filters.push({
        key: 'resourceId',
        label: 'Resource ID',
        value: resourceIdFilter,
        onRemove: () => setResourceIdFilter(''),
      });
    }
    if (startDate) {
      filters.push({
        key: 'startDate',
        label: 'After',
        value: new Date(startDate).toLocaleDateString(),
        onRemove: () => setStartDate(''),
      });
    }
    if (endDate) {
      filters.push({
        key: 'endDate',
        label: 'Before',
        value: new Date(endDate).toLocaleDateString(),
        onRemove: () => setEndDate(''),
      });
    }
    return filters;
  }, [
    adminUserIdFilter,
    actionTypeFilter,
    resourceTypeFilter,
    resourceIdFilter,
    startDate,
    endDate,
    usersQuery.data,
  ]);

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Admin Action Log"
          description="Track all administrative actions for accountability and audit purposes."
        />

        <ErrorAlert title="Failed to load action log" errors={errors} />

        <SearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by admin, resource, action type, or reason..."
          activeFilterCount={activeFilterCount}
          onFiltersClick={() => setFiltersOpen(true)}
          exportButton={{
            label: 'Export PDF',
            loadingLabel: 'Exporting...',
            isLoading: exportPdfMutation.isPending,
            isDisabled: entries.length === 0,
            onClick: handleExportPdf,
          }}
        />

        <ActiveFilters
          filters={activeFilters}
          onClearAll={clearFilters}
          resultCount={{ showing: filteredEntries.length, total }}
        />

        <DataTableCard
          title="Admin Actions"
          description="Complete audit trail of all administrative actions."
          isLoading={logsQuery.isPending}
          isEmpty={filteredEntries.length === 0}
          hasActiveFilters={hasActiveFilters}
          emptyTitle="No admin actions yet"
          emptyDescription="Admin actions will appear here as they are performed."
          emptyFilteredTitle="No actions match filters"
          emptyFilteredDescription="Try adjusting your filters to see more results."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead className="w-[200px]">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(entry.id)}
                >
                  <TableCell className="text-sm">{formatDateTime(entry.timestamp)}</TableCell>
                  <TableCell>{entry.adminUser?.email || 'Unknown'}</TableCell>
                  <TableCell>{getActionTypeLabel(entry.actionType)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{getResourceTypeLabel(entry.resourceType)}</span>
                      {entry.resourceName ? (
                        <span className="text-xs text-muted-foreground">{entry.resourceName}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="w-[200px] max-w-[200px]">
                    {entry.reason ? (
                      <span className="text-sm text-muted-foreground line-clamp-2">
                        {entry.reason}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPrevious={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            hideOnSinglePage
          />
        </DataTableCard>

        <FilterDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Filter Admin Actions"
          description="Apply filters to find specific admin actions"
          onClearFilters={clearFilters}
          onApply={() => setFiltersOpen(false)}
        >
          <div className="space-y-2">
            <Label>Admin User</Label>
            <Select
              value={adminUserIdFilter || undefined}
              onValueChange={(value) => setAdminUserIdFilter(value === 'all' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All admins" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All admins</SelectItem>
                {usersQuery.data?.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select
              value={actionTypeFilter}
              onValueChange={(value) => {
                if (isActionTypeFilter(value)) {
                  setActionTypeFilter(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {Object.entries(actionTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Resource Type</Label>
            <Select
              value={resourceTypeFilter}
              onValueChange={(value) => {
                if (isResourceTypeFilter(value)) {
                  setResourceTypeFilter(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {Object.entries(resourceTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Resource ID</Label>
            <Input
              placeholder="Enter resource ID"
              value={resourceIdFilter}
              onChange={(e) => setResourceIdFilter(e.target.value)}
            />
          </div>

          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </FilterDialog>
      </div>
    </AdminLayout>
  );
}
