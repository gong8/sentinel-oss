import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { DataTableCard } from '../../components/admin/DataTableCard';
import { DateRangeFilter } from '../../components/admin/DateRangeFilter';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { ActiveFilterBadges } from '../../components/ui/active-filter-badges';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { AllowDenyBadge } from '../../components/ui/allow-deny-toggle';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { FilterDialog, FilterSection } from '../../components/ui/filter-dialog';
import { Input } from '../../components/ui/input';
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
import { useMcpServers } from '../../hooks/useMcpServers';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { downloadPdfFromBase64 } from '../../lib/download';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';
import { getDecisionBadgeValue } from '../../lib/typeGuards';

// Simplified audit entry type to avoid deep type instantiation
interface AuditEntry {
  id: string;
  toolName: string;
  decision: string;
  justification: string | null;
  timestamp: string;
  userEmail: string | null;
  userId: string | null;
  userRoles: string[];
  agentName: string | null;
  agentId: string | null;
  policySnapshot: unknown;
  parameters: unknown;
  matchedPolicyIds: string[];
  policyIds: string[];
  user: { email: string } | null;
  agent: { name: string } | null;
  // Live approval tracking
  approvalRequired: boolean;
  approvalRequestId: string | null;
  approvalStatus: string | null;
  approvalDecidedBy: string | null;
  approvalDecidedByEmail: string | null;
  approvalDecidedAt: string | null;
}

// Helper to extract audit data with simpler type
function getAuditData<
  T extends {
    entries: Array<{
      id: string;
      toolName: string;
      decision: unknown; // Accept any enum type
      justification: string | null;
      timestamp: unknown; // Can be Date or string from serialization
      userEmail: string | null;
      userId: string | null;
      userRoles: string[];
      agentName: string | null;
      agentId: string | null;
      policySnapshot: unknown;
      parameters: unknown;
      matchedPolicyIds: string[];
      policyIds: string[];
      user: { email: string } | null;
      agent: { name: string } | null;
      // Live approval tracking
      approvalRequired: boolean;
      approvalRequestId: string | null;
      approvalStatus: string | null;
      approvalDecidedBy: string | null;
      approvalDecidedByEmail: string | null;
      approvalDecidedAt: unknown; // Can be Date or string
    }>;
    total: number;
  },
>(data: T | undefined): { entries: AuditEntry[]; total: number } | undefined {
  if (!data) return undefined;
  return {
    entries: data.entries.map((e) => ({
      ...e,
      decision: String(e.decision),
      timestamp: String(e.timestamp),
      approvalDecidedAt: e.approvalDecidedAt ? String(e.approvalDecidedAt) : null,
    })),
    total: data.total,
  };
}

const EMPTY_ENTRIES: AuditEntry[] = [];

// Decision filter type and guard
type DecisionFilter = 'all' | 'ALLOWED' | 'DENIED';
function isDecisionFilter(value: string): value is DecisionFilter {
  return value === 'all' || value === 'ALLOWED' || value === 'DENIED';
}

export default function AdminAudit(): React.ReactElement {
  const navigate = useNavigate();
  const { formatToolNameFriendly } = useMcpServers();
  const { selectedWorkspaceId, selectedWorkspaceSlug, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  // Users query is intentionally org-wide (users can belong to multiple workspaces)
  const usersQuery = trpc.admin.users.list.useQuery();
  const users = usersQuery.data;

  // Agents query is workspace-scoped
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const agents = agentsQuery.data;

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [agentIdFilter, setAgentIdFilter] = useState('');
  const [toolNameFilter, setToolNameFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 50;

  // Build query input
  const input = useMemo(
    () => ({
      toolName: toolNameFilter || undefined,
      decision: decisionFilter === 'all' ? undefined : decisionFilter,
      userId: userIdFilter || undefined,
      agentId: agentIdFilter || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate + 'T23:59:59') : undefined,
      limit,
      offset: page * limit,
      workspaceId: selectedWorkspaceId ?? undefined,
    }),
    [
      toolNameFilter,
      decisionFilter,
      userIdFilter,
      agentIdFilter,
      startDate,
      endDate,
      page,
      selectedWorkspaceId,
    ],
  );

  const auditQuery = trpc.admin.auditLogEntries.list.useQuery(input);
  const auditData = getAuditData(auditQuery.data);

  // PDF Export mutation
  const exportPdfMutation = trpc.admin.auditLogEntries.exportPdf.useMutation({
    onSuccess: (result) => {
      downloadPdfFromBase64(result.data, result.filename);
    },
  });

  function handleExportPdf(): void {
    exportPdfMutation.mutate({
      toolName: toolNameFilter || undefined,
      decision: decisionFilter === 'all' ? undefined : decisionFilter,
      userId: userIdFilter || undefined,
      agentId: agentIdFilter || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate + 'T23:59:59') : undefined,
      limit: 500,
      workspaceId: selectedWorkspaceId ?? undefined,
    });
  }

  const entries = auditData?.entries ?? EMPTY_ENTRIES;
  const total = auditData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Filter entries client-side for search (since API doesn't support full-text search yet)
  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter((entry) => {
      const toolName = formatToolNameFriendly(entry.toolName).toLowerCase();
      const userEmail = (entry.userEmail || entry.user?.email || '').toLowerCase();
      const agentName = (entry.agentName || entry.agent?.name || '').toLowerCase();
      const justification = (entry.justification || '').toLowerCase();
      return (
        toolName.includes(query) ||
        userEmail.includes(query) ||
        agentName.includes(query) ||
        justification.includes(query)
      );
    });
  }, [entries, searchQuery, formatToolNameFriendly]);

  const hasActiveFilters = Boolean(
    searchQuery ||
    decisionFilter !== 'all' ||
    userIdFilter ||
    agentIdFilter ||
    toolNameFilter ||
    startDate ||
    endDate,
  );

  const activeFilterCount = [
    decisionFilter !== 'all',
    userIdFilter,
    agentIdFilter,
    toolNameFilter,
    startDate,
    endDate,
  ].filter(Boolean).length;

  function clearFilters(): void {
    setSearchQuery('');
    setDecisionFilter('all');
    setUserIdFilter('');
    setAgentIdFilter('');
    setToolNameFilter('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  }

  // Build filter items for ActiveFilterBadges
  const filterItems = [
    {
      key: 'decision',
      label: 'Decision',
      value: decisionFilter !== 'all' ? decisionFilter : '',
      onClear: () => setDecisionFilter('all'),
    },
    {
      key: 'user',
      label: 'User',
      value: userIdFilter ? (users?.find((u) => u.id === userIdFilter)?.email ?? '') : '',
      onClear: () => setUserIdFilter(''),
    },
    {
      key: 'agent',
      label: 'Agent',
      value: agentIdFilter ? (agents?.find((a) => a.id === agentIdFilter)?.name ?? '') : '',
      onClear: () => setAgentIdFilter(''),
    },
    {
      key: 'tool',
      label: 'Tool',
      value: toolNameFilter,
      onClear: () => setToolNameFilter(''),
    },
    {
      key: 'startDate',
      label: 'After',
      value: startDate ? new Date(startDate).toLocaleDateString() : '',
      onClear: () => setStartDate(''),
    },
    {
      key: 'endDate',
      label: 'Before',
      value: endDate ? new Date(endDate).toLocaleDateString() : '',
      onClear: () => setEndDate(''),
    },
  ];

  function handlePreviousPage(): void {
    setPage((current) => Math.max(0, current - 1));
  }

  function handleNextPage(): void {
    setPage((current) => Math.min(totalPages - 1, current + 1));
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader title="Audit Log" description="Every tool invocation is recorded here." />

        {auditQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load audit log</AlertTitle>
            <AlertDescription>{auditQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <SearchFilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by tool name, user, agent, or justification..."
          onFilterClick={() => setFiltersOpen(true)}
          filterCount={activeFilterCount}
          exportButton={{
            label: 'Export PDF',
            loadingLabel: 'Exporting...',
            isLoading: exportPdfMutation.isPending,
            isDisabled: entries.length === 0,
            onClick: handleExportPdf,
          }}
        />

        {hasActiveFilters ? (
          <ActiveFilterBadges
            filters={filterItems}
            onClearAll={clearFilters}
            filteredCount={filteredEntries.length}
            totalCount={total}
          />
        ) : null}

        <DataTableCard
          title="Audit Entries"
          description="All tool invocation attempts are logged here."
          isLoading={auditQuery.isPending}
          isEmpty={filteredEntries.length === 0}
          emptyTitle="No audit entries"
          emptyDescription="Tool activity will appear here once available."
          hasActiveFilters={hasActiveFilters}
          emptyFilteredTitle="No entries match filters"
          emptyFilteredDescription="Try adjusting your filters to see more results."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>User/Agent</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium font-mono text-sm">
                    {formatToolNameFriendly(entry.toolName)}
                  </TableCell>
                  <TableCell>
                    {entry.userEmail || entry.user?.email ? (
                      <>
                        <div className="text-sm">{entry.userEmail || entry.user?.email}</div>
                        {entry.userRoles && entry.userRoles.length > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            {entry.userRoles.join(', ')}
                          </div>
                        ) : null}
                      </>
                    ) : entry.agentName || entry.agent?.name ? (
                      <>
                        <div className="text-sm">{entry.agentName || entry.agent?.name}</div>
                        <div className="text-xs text-muted-foreground">Agent</div>
                      </>
                    ) : (
                      <div className="text-sm">-</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <AllowDenyBadge value={getDecisionBadgeValue(entry.decision)} size="sm" />
                      {entry.approvalRequired ? (
                        <Badge
                          variant={
                            entry.approvalStatus === 'APPROVED'
                              ? 'outline'
                              : entry.approvalStatus === 'DENIED' ||
                                  entry.approvalStatus === 'EXPIRED' ||
                                  entry.approvalStatus === 'CANCELLED'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="text-xs"
                        >
                          {entry.approvalStatus || 'Approval'}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(entry.timestamp)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`${adminPrefix}/audit/${entry.id}`)}
                    >
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPrevious={handlePreviousPage}
            onNext={handleNextPage}
            hideOnSinglePage
          />
        </DataTableCard>

        <FilterDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Filter Audit Entries"
          description="Apply advanced filters to find specific audit entries"
          maxWidth="max-w-2xl"
          onClearAll={clearFilters}
        >
          <FilterSection label="Decision">
            <Select
              value={decisionFilter}
              onValueChange={(value) => {
                if (isDecisionFilter(value)) {
                  setDecisionFilter(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ALLOWED">ALLOWED</SelectItem>
                <SelectItem value="DENIED">DENIED</SelectItem>
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection label="User">
            <Select
              value={userIdFilter || undefined}
              onValueChange={(value) => setUserIdFilter(value === 'all' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users?.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection label="Agent">
            <Select
              value={agentIdFilter || undefined}
              onValueChange={(value) => setAgentIdFilter(value === 'all' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection label="Tool Name">
            <Input
              id="toolName"
              placeholder="notion.com::createPage"
              value={toolNameFilter}
              onChange={(e) => setToolNameFilter(e.target.value)}
            />
          </FilterSection>

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
