import { useMemo, useState } from 'react';

import { DataTableCard, DateRangeFilter, ErrorAlert } from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { ActiveFilters } from '../../components/ui/active-filter-badges';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { FilterDialog } from '../../components/ui/filter-dialog';
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
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

type EntityType = 'all' | 'user' | 'role' | 'agent' | 'mcpServer' | 'policy';
type SortBy = 'deletedAt' | 'name';
type SortOrder = 'asc' | 'desc';

const ENTITY_TYPE_SET: ReadonlySet<string> = new Set<EntityType>([
  'all',
  'user',
  'role',
  'agent',
  'mcpServer',
  'policy',
]);
const SORT_BY_SET: ReadonlySet<string> = new Set<SortBy>(['deletedAt', 'name']);
const SORT_ORDER_SET: ReadonlySet<string> = new Set<SortOrder>(['asc', 'desc']);

function isEntityType(value: string): value is EntityType {
  return ENTITY_TYPE_SET.has(value);
}

function isSortBy(value: string): value is SortBy {
  return SORT_BY_SET.has(value);
}

function isSortOrder(value: string): value is SortOrder {
  return SORT_ORDER_SET.has(value);
}

const entityTypeLabels: Record<Exclude<EntityType, 'all'>, string> = {
  user: 'User',
  role: 'Role',
  agent: 'Agent',
  mcpServer: 'MCP Server',
  policy: 'Policy',
};

export default function AdminDeletedItems(): React.ReactElement {
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<EntityType>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('deletedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [restoreConfirm, setRestoreConfirm] = useState<{
    type: Exclude<EntityType, 'all'>;
    id: string;
    name: string;
  } | null>(null);

  const { selectedWorkspaceId } = useWorkspace();

  const deletedItemsQuery = trpc.admin.deletedItems.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  const restoreUserMutation = trpc.admin.users.restore.useMutation({
    onSuccess: () => {
      utils.admin.deletedItems.list.invalidate();
      utils.admin.users.list.invalidate();
      setRestoreConfirm(null);
    },
  });
  const restoreRoleMutation = trpc.admin.roles.restore.useMutation({
    onSuccess: () => {
      utils.admin.deletedItems.list.invalidate();
      utils.admin.roles.list.invalidate();
      setRestoreConfirm(null);
    },
  });
  const restoreAgentMutation = trpc.admin.agents.restore.useMutation({
    onSuccess: () => {
      utils.admin.deletedItems.list.invalidate();
      utils.admin.agents.list.invalidate();
      setRestoreConfirm(null);
    },
  });
  const restoreMcpServerMutation = trpc.admin.mcpServers.restore.useMutation({
    onSuccess: () => {
      utils.admin.deletedItems.list.invalidate();
      utils.admin.mcpServers.list.invalidate();
      setRestoreConfirm(null);
    },
  });
  const restorePolicyMutation = trpc.admin.policies.restore.useMutation({
    onSuccess: () => {
      utils.admin.deletedItems.list.invalidate();
      utils.admin.policies.list.invalidate();
      setRestoreConfirm(null);
    },
  });

  const isRestoring =
    restoreUserMutation.isPending ||
    restoreRoleMutation.isPending ||
    restoreAgentMutation.isPending ||
    restoreMcpServerMutation.isPending ||
    restorePolicyMutation.isPending;

  function handleRestore(type: Exclude<EntityType, 'all'>, id: string): void {
    switch (type) {
      case 'user':
        restoreUserMutation.mutate({ id });
        break;
      case 'role':
        restoreRoleMutation.mutate({ id });
        break;
      case 'agent':
        restoreAgentMutation.mutate({ id });
        break;
      case 'mcpServer':
        restoreMcpServerMutation.mutate({ id });
        break;
      case 'policy':
        restorePolicyMutation.mutate({ id });
        break;
    }
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (startDate) count++;
    if (endDate) count++;
    if (sortBy !== 'deletedAt' || sortOrder !== 'desc') count++;
    return count;
  }, [typeFilter, startDate, endDate, sortBy, sortOrder]);

  function clearFilters(): void {
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setSortBy('deletedAt');
    setSortOrder('desc');
  }

  const hasActiveFilters =
    typeFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '' ||
    sortBy !== 'deletedAt' ||
    sortOrder !== 'desc';

  const filteredAndSortedItems = useMemo(() => {
    if (!deletedItemsQuery.data) return [];

    let items = [...deletedItemsQuery.data];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(query));
    }

    if (typeFilter !== 'all') {
      items = items.filter((item) => item.type === typeFilter);
    }

    if (startDate) {
      const start = new Date(startDate);
      items = items.filter((item) => new Date(item.deletedAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      items = items.filter((item) => new Date(item.deletedAt) <= end);
    }

    items.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'deletedAt') {
        comparison = new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime();
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [deletedItemsQuery.data, searchQuery, typeFilter, startDate, endDate, sortBy, sortOrder]);

  const errors = useMutationErrors([
    deletedItemsQuery,
    restoreUserMutation,
    restoreRoleMutation,
    restoreAgentMutation,
    restoreMcpServerMutation,
    restorePolicyMutation,
  ]);

  const activeFilters = useMemo(() => {
    const filters = [];
    if (typeFilter !== 'all') {
      filters.push({
        key: 'type',
        label: 'Type',
        value: entityTypeLabels[typeFilter],
        onRemove: () => setTypeFilter('all'),
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
    if (sortBy !== 'deletedAt' || sortOrder !== 'desc') {
      filters.push({
        key: 'sort',
        label: 'Sort',
        value: `${sortBy === 'name' ? 'Name' : 'Deleted At'} (${sortOrder === 'asc' ? 'A-Z' : 'Newest'})`,
        onRemove: () => {
          setSortBy('deletedAt');
          setSortOrder('desc');
        },
      });
    }
    return filters;
  }, [typeFilter, startDate, endDate, sortBy, sortOrder]);

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Deleted Items"
          description="View and restore deleted items from your organization."
        />

        <ErrorAlert title="Failed to load deleted items" errors={errors} />

        <SearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by name..."
          activeFilterCount={activeFilterCount}
          onFiltersClick={() => setFiltersOpen(true)}
        />

        <ActiveFilters
          filters={activeFilters}
          onClearAll={clearFilters}
          resultCount={{
            showing: filteredAndSortedItems.length,
            total: deletedItemsQuery.data?.length ?? 0,
            label: 'items',
          }}
        />

        <DataTableCard
          title="Deleted Items"
          description="Items that have been deleted and can be restored."
          isLoading={deletedItemsQuery.isPending}
          isEmpty={filteredAndSortedItems.length === 0}
          hasActiveFilters={hasActiveFilters || Boolean(searchQuery)}
          emptyTitle="No deleted items"
          emptyDescription="Items that are deleted will appear here for recovery."
          emptyFilteredTitle="No items match filters"
          emptyFilteredDescription="Try adjusting your search or filters."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Deleted By</TableHead>
                <TableHead>Deleted At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedItems.map((item) => (
                <TableRow key={`${item.type}-${item.id}`}>
                  <TableCell>{entityTypeLabels[item.type]}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.deletedByEmail || '-'}
                  </TableCell>
                  <TableCell>{formatDateTime(item.deletedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRestoreConfirm({
                          type: item.type,
                          id: item.id,
                          name: item.name,
                        })
                      }
                      disabled={isRestoring}
                    >
                      Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableCard>

        {restoreConfirm ? (
          <Dialog open={Boolean(restoreConfirm)} onOpenChange={() => setRestoreConfirm(null)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Restore {entityTypeLabels[restoreConfirm.type]}</DialogTitle>
                <DialogDescription>
                  Are you sure you want to restore{' '}
                  <span className="font-medium">{restoreConfirm.name}</span>? This will make the
                  item active again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestoreConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => handleRestore(restoreConfirm.type, restoreConfirm.id)}
                  disabled={isRestoring}
                >
                  {isRestoring ? 'Restoring...' : 'Restore'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        <FilterDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Filter Deleted Items"
          description="Apply filters to find specific deleted items"
          onClearFilters={clearFilters}
          onApply={() => setFiltersOpen(false)}
          maxWidth="max-w-md"
        >
          <div className="space-y-2">
            <Label>Item Type</Label>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                if (isEntityType(value)) {
                  setTypeFilter(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="role">Role</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="mcpServer">MCP Server</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            startLabel="Deleted After"
            endLabel="Deleted Before"
          />

          <div className="space-y-2">
            <Label>Sort By</Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  if (isSortBy(value)) {
                    setSortBy(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deletedAt">Deleted At</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortOrder}
                onValueChange={(value) => {
                  if (isSortOrder(value)) {
                    setSortOrder(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </FilterDialog>
      </div>
    </AdminLayout>
  );
}
