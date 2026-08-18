import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocation } from 'react-router';
import { z } from 'zod';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { PolicyPageLayout } from '../../components/layout/PolicyPageLayout';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { DeleteConfirmDialog } from '../../components/policy';
import {
  ToolInvocationBuilder,
  type ContextOverrides,
  type ExtractedContext,
  type ExtractedMode,
  type ToolInvocation,
} from '../../components/policy/ToolInvocationBuilder';
import { ActiveFilterBadges } from '../../components/ui/active-filter-badges';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
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
import { formatDateTime } from '../../lib/format';
import { getServerKeyFromUrl } from '../../lib/toolPattern';
import { trpc } from '../../lib/trpc';

// Context overrides schema
const contextOverridesSchema = z.object({
  hourOfDay: z.number().int().min(0).max(23).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  sourceIp: z.string().optional(),
  timestamp: z.string().optional(),
});

// Extracted context schemas
const sqlContextSchema = z.object({
  sqlOperation: z.string().optional(),
  sqlTables: z.array(z.string()).optional(),
  hasSqlComment: z.boolean().optional(),
});

const githubContextSchema = z.object({
  gitRepository: z.string().optional(),
  gitBranch: z.string().optional(),
  gitOwner: z.string().optional(),
  isProtectedBranch: z.boolean().optional(),
});

const fileContextSchema = z.object({
  filePath: z.string().optional(),
  fileExtension: z.string().optional(),
  isSensitivePath: z.boolean().optional(),
});

const extractedContextSchema = z.object({
  sql: sqlContextSchema.optional(),
  github: githubContextSchema.optional(),
  file: fileContextSchema.optional(),
});

const testPolicySchema = z
  .object({
    mcpServer: z.string().min(1, 'MCP Server is required'),
    tool: z.string().min(1, 'Tool is required'),
    contextType: z.enum(['user', 'agent']),
    userId: z.string().optional(),
    agentId: z.string().optional(),
    // Tool invocation details
    parameters: z.record(z.string(), z.unknown()).optional(),
    contextOverrides: contextOverridesSchema.optional(),
    extractedContext: extractedContextSchema.optional(),
    extractedMode: z.enum(['auto', 'manual']).optional(),
  })
  .refine(
    (data) => {
      if (data.contextType === 'user' && !data.userId) {
        return false;
      }
      if (data.contextType === 'agent' && !data.agentId) {
        return false;
      }
      return true;
    },
    {
      message: 'Please select a user or agent',
      path: ['userId'],
    },
  );

type TestPolicyValues = z.infer<typeof testPolicySchema>;

// Simplified policy test type to avoid deep type instantiation
interface PolicyTest {
  id: string;
  toolName: string;
  decision: string;
  justification: string | null;
  userEmail: string | null;
  userId: string | null;
  agentName: string | null;
  agentId: string | null;
  policySnapshot: unknown;
  matchedPolicyIds: string[];
  userRoles: string[];
  createdAt: string;
  // Tool invocation details
  toolParameters?: Record<string, unknown> | null;
  contextOverrides?: ContextOverrides | null;
  extractedContext?: ExtractedContext | null;
  extractedMode?: ExtractedMode | null;
}

// Helper to extract policy tests with simpler type
function getPolicyTests<
  T extends {
    tests: Array<{
      id: string;
      toolName: string;
      decision: unknown;
      justification: string | null;
      userEmail: string | null;
      userId: string | null;
      agentName: string | null;
      agentId: string | null;
      policySnapshot: unknown;
      matchedPolicyIds: string[];
      userRoles: string[];
      createdAt: unknown;
    }>;
    total: number;
  },
>(data: T | undefined): { tests: PolicyTest[]; total: number } | undefined {
  if (!data) return undefined;
  return {
    tests: data.tests.map((t) => ({
      ...t,
      decision: String(t.decision),
      createdAt: String(t.createdAt),
    })),
    total: data.total,
  };
}

// AllowDenyBadge value type
type AllowDenyValue = 'ALLOW' | 'DENY' | 'ALLOWED' | 'DENIED';

// Type guard for AllowDenyBadge value
function isAllowDenyValue(value: string): value is AllowDenyValue {
  return value === 'ALLOW' || value === 'DENY' || value === 'ALLOWED' || value === 'DENIED';
}

type RetestData = {
  toolName: string;
  userId?: string | null;
  agentId?: string | null;
  // Tool invocation details for retest
  toolParameters?: Record<string, unknown> | null;
  contextOverrides?: ContextOverrides | null;
  extractedContext?: ExtractedContext | null;
  extractedMode?: ExtractedMode | null;
};

type ResimulateState = {
  resimulate?: {
    mcpServer: string;
    tool: string;
    userId?: string;
    agentId?: string;
  };
};

function isResimulateState(value: unknown): value is ResimulateState {
  if (!value || typeof value !== 'object') return false;
  // Check if resimulate property exists
  if (!('resimulate' in value)) return true;
  const resim = value.resimulate;
  if (typeof resim !== 'object' || resim === null) return false;
  // Check required properties on resimulate
  return (
    'mcpServer' in resim &&
    typeof resim.mcpServer === 'string' &&
    'tool' in resim &&
    typeof resim.tool === 'string'
  );
}

interface PolicySnapshotEntry {
  id: string;
  slug: string;
  matcher: string;
  toolPattern: string;
  effect: string;
  description: string;
  enabled: boolean;
}

type PolicyEffect = 'ALLOW' | 'DENY';
function getPolicyEffect(effect: string): PolicyEffect {
  return effect === 'DENY' ? 'DENY' : 'ALLOW';
}

// Type guard for individual policy snapshot entry
function isPolicySnapshotEntry(item: unknown): item is PolicySnapshotEntry {
  if (!item || typeof item !== 'object') return false;
  return (
    'id' in item &&
    typeof item.id === 'string' &&
    'slug' in item &&
    typeof item.slug === 'string' &&
    'effect' in item &&
    typeof item.effect === 'string'
  );
}

function isPolicySnapshotArray(value: unknown): value is PolicySnapshotEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every(isPolicySnapshotEntry);
}

const EMPTY_TESTS: PolicyTest[] = [];

type DecisionFilter = 'all' | 'ALLOWED' | 'DENIED';
const DECISION_FILTER_SET: ReadonlySet<string> = new Set<DecisionFilter>([
  'all',
  'ALLOWED',
  'DENIED',
]);
function isDecisionFilter(value: string): value is DecisionFilter {
  return DECISION_FILTER_SET.has(value);
}

export default function PolicyPlayground() {
  const location = useLocation();
  const utils = trpc.useUtils();
  const { selectedWorkspaceId } = useWorkspace();
  const testsQuery = trpc.admin.policies.listTests.useQuery({ limit: 50 });
  const testsData = getPolicyTests(testsQuery.data);
  const usersQuery = trpc.admin.users.list.useQuery();
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const { mcpServers, formatToolNameFriendly, getToolsForServer, getServerNameForDisplay } =
    useMcpServers({ workspaceId: selectedWorkspaceId });

  const deleteTestMutation = trpc.admin.policies.deleteTest.useMutation({
    onSuccess: () => {
      utils.admin.policies.listTests.invalidate();
      setDeleteConfirm(null);
    },
  });

  const resimulateState = isResimulateState(location.state) ? location.state : null;
  const initialRetestData: RetestData | null = resimulateState?.resimulate
    ? {
        toolName: `${resimulateState.resimulate.mcpServer}::${resimulateState.resimulate.tool}`,
        userId: resimulateState.resimulate.userId ?? null,
        agentId: resimulateState.resimulate.agentId ?? null,
      }
    : null;

  const [createDialogOpen, setCreateDialogOpen] = useState(Boolean(initialRetestData));
  const [selectedTest, setSelectedTest] = useState<PolicyTest | null>(null);
  const [retestData, setRetestData] = useState<RetestData | null>(initialRetestData);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Clear navigation state after reading resimulate values
  useEffect(() => {
    if (resimulateState?.resimulate) {
      window.history.replaceState({}, document.title);
    }
  }, [resimulateState]);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [specificUserId, setSpecificUserId] = useState('');
  const [specificAgentId, setSpecificAgentId] = useState('');
  const [filterServer, setFilterServer] = useState('*');
  const [filterTool, setFilterTool] = useState('*');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const allTests = testsData?.tests ?? EMPTY_TESTS;

  // Get unique roles from all tests for filter dropdown
  const availableRoles = useMemo(() => {
    const rolesSet = new Set<string>();
    allTests.forEach((test) => {
      test.userRoles.forEach((role: string) => rolesSet.add(role));
    });
    return Array.from(rolesSet).sort();
  }, [allTests]);

  const availableFilterTools = getToolsForServer(filterServer);

  function handleFilterServerChange(value: string): void {
    setFilterServer(value);
    setFilterTool('*');
  }

  // Apply filters
  const filteredTests = useMemo(() => {
    try {
      return allTests.filter((test: PolicyTest) => {
        try {
          // Text search across tool name, user email, agent name
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesSearch =
              test.toolName.toLowerCase().includes(query) ||
              test.userEmail?.toLowerCase().includes(query) ||
              test.agentName?.toLowerCase().includes(query);
            if (!matchesSearch) return false;
          }

          // Decision filter
          if (decisionFilter !== 'all' && test.decision !== decisionFilter) {
            return false;
          }

          // Role filter
          if (roleFilter !== 'all' && !test.userRoles.includes(roleFilter)) {
            return false;
          }

          // Specific user filter
          if (specificUserId && test.userId && test.userId !== specificUserId) {
            return false;
          }

          // Specific agent filter
          if (specificAgentId && test.agentId && test.agentId !== specificAgentId) {
            return false;
          }

          // Tool pattern filter
          if (filterServer !== '*' || filterTool !== '*') {
            if (!test.toolName) return false;
            const parts = test.toolName.split('::');
            if (parts.length !== 2) return false;
            const [testServer, testTool] = parts;
            const serverMatch = filterServer === '*' || testServer === filterServer;
            const toolMatch = filterTool === '*' || testTool === filterTool;
            if (!serverMatch || !toolMatch) return false;
          }

          // Date range filter
          if (startDate) {
            const testDate = new Date(test.createdAt);
            const filterStart = new Date(startDate);
            if (testDate < filterStart) return false;
          }
          if (endDate) {
            const testDate = new Date(test.createdAt);
            const filterEnd = new Date(endDate);
            filterEnd.setHours(23, 59, 59, 999); // Include entire end date
            if (testDate > filterEnd) return false;
          }

          return true;
        } catch (error) {
          console.error('Error filtering test:', error, test);
          return true; // Include test if filtering fails
        }
      });
    } catch (error) {
      console.error('Error in filteredTests:', error);
      return allTests;
    }
  }, [
    allTests,
    searchQuery,
    decisionFilter,
    roleFilter,
    specificUserId,
    specificAgentId,
    filterServer,
    filterTool,
    startDate,
    endDate,
  ]);

  const hasActiveFilters =
    searchQuery ||
    decisionFilter !== 'all' ||
    roleFilter !== 'all' ||
    specificUserId ||
    specificAgentId ||
    filterServer !== '*' ||
    filterTool !== '*' ||
    startDate ||
    endDate;

  const activeFilterCount = [
    decisionFilter !== 'all',
    roleFilter !== 'all',
    specificUserId,
    specificAgentId,
    filterServer !== '*',
    filterTool !== '*',
    startDate,
    endDate,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery('');
    setDecisionFilter('all');
    setRoleFilter('all');
    setSpecificUserId('');
    setSpecificAgentId('');
    setFilterServer('*');
    setFilterTool('*');
    setStartDate('');
    setEndDate('');
  };

  function handleDeleteTest(testId: string): void {
    setDeleteConfirm(testId);
  }

  function handleRetest(test: PolicyTest): void {
    setRetestData({
      toolName: test.toolName,
      userId: test.userId,
      agentId: test.agentId,
      // Include tool invocation details for retest
      toolParameters: test.toolParameters,
      contextOverrides: test.contextOverrides,
      extractedContext: test.extractedContext,
      extractedMode: test.extractedMode,
    });
    setSelectedTest(null);
    setCreateDialogOpen(true);
  }

  return (
    <PolicyPageLayout>
      <div className="space-y-8">
        <PageHeader
          title="Policy Testing Playground"
          description="Test policies and view historical test results."
        />

        {testsQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load tests</AlertTitle>
            <AlertDescription>{testsQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}

        {/* Search and Filter Bar */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search by tool name, user email, or agent name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10"
            />
          </div>
          <Button variant="outline" onClick={() => setFiltersOpen(true)} className="gap-2">
            Filters
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>New Policy Test</Button>
        </div>

        <ActiveFilterBadges
          filters={[
            {
              key: 'decision',
              label: 'Decision',
              value: decisionFilter,
              onClear: () => setDecisionFilter('all'),
            },
            {
              key: 'role',
              label: 'Role',
              value: roleFilter,
              onClear: () => setRoleFilter('all'),
            },
            {
              key: 'user',
              label: 'User',
              value: specificUserId
                ? usersQuery.data?.find((u) => u.id === specificUserId)?.email || 'Unknown'
                : '',
              onClear: () => setSpecificUserId(''),
            },
            {
              key: 'agent',
              label: 'Agent',
              value: specificAgentId
                ? agentsQuery.data?.find((a) => a.id === specificAgentId)?.name || 'Unknown'
                : '',
              onClear: () => setSpecificAgentId(''),
            },
            {
              key: 'tool',
              label: 'Tool',
              value:
                filterServer !== '*' || filterTool !== '*'
                  ? `${getServerNameForDisplay(filterServer)}::${filterTool === '*' ? '*' : filterTool}`
                  : '',
              onClear: () => {
                setFilterServer('*');
                setFilterTool('*');
              },
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
          ]}
          onClearAll={clearFilters}
          filteredCount={filteredTests.length}
          totalCount={allTests.length}
        />

        <DeleteConfirmDialog
          open={Boolean(deleteConfirm)}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Delete test result"
          description="Are you sure you want to delete this test result? This action cannot be undone."
          onConfirm={() => deleteConfirm && deleteTestMutation.mutate({ id: deleteConfirm })}
          isDeleting={deleteTestMutation.isPending}
        />

        <Card>
          <CardHeader>
            <CardTitle>Test History</CardTitle>
            <CardDescription>
              Previous policy tests with results and policy snapshots.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {testsQuery.isPending ? (
              <TableSkeleton />
            ) : filteredTests.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>User/Agent</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Tested At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTests.map((test) => (
                    <TableRow key={test.id}>
                      <TableCell className="font-medium font-mono text-xs">
                        {formatToolNameFriendly(test.toolName)}
                      </TableCell>
                      <TableCell>
                        {test.userEmail ? (
                          <>
                            <div className="text-sm">{test.userEmail}</div>
                            {test.userRoles.length > 0 ? (
                              <div className="text-xs text-muted-foreground">
                                {test.userRoles.join(', ')}
                              </div>
                            ) : null}
                          </>
                        ) : test.agentName ? (
                          <>
                            <div className="text-sm">{test.agentName}</div>
                            <div className="text-xs text-muted-foreground">Agent</div>
                          </>
                        ) : (
                          <div className="text-sm">-</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isAllowDenyValue(test.decision) ? (
                          <AllowDenyBadge value={test.decision} size="sm" />
                        ) : (
                          <span className="text-muted-foreground">{test.decision}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDateTime(test.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedTest(test)}>
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTest(test.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : hasActiveFilters ? (
              <EmptyState
                title="No tests match filters"
                description="Try adjusting your filters to see more results."
              />
            ) : (
              <EmptyState
                title="No tests yet"
                description="Create a policy test to see results here."
              />
            )}
          </CardContent>
        </Card>

        <CreateTestDialog
          key={`${createDialogOpen}-${retestData?.toolName ?? 'new'}`}
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) setRetestData(null);
          }}
          onSuccess={() => {
            setCreateDialogOpen(false);
            setRetestData(null);
            testsQuery.refetch();
          }}
          retestData={retestData}
        />

        <ViewTestDialog
          test={selectedTest}
          onClose={() => setSelectedTest(null)}
          onRetest={handleRetest}
          formatToolNameForDisplay={formatToolNameFriendly}
        />

        {/* Filters Modal */}
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter Test Results</DialogTitle>
              <DialogDescription>
                Apply advanced filters to find specific test results
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Decision Filter */}
              <div className="space-y-2">
                <Label>Decision</Label>
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
                    <SelectItem value="all">All Decisions</SelectItem>
                    <SelectItem value="ALLOWED">ALLOWED</SelectItem>
                    <SelectItem value="DENIED">DENIED</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Role Filter */}
              <div className="space-y-2">
                <Label>User Role</Label>
                <p className="text-xs text-muted-foreground">
                  Filter tests by the role of the user being tested
                </p>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filter by Specific User */}
              <div className="space-y-2">
                <Label>Filter by User</Label>
                <p className="text-xs text-muted-foreground">Show tests for a specific user</p>
                <Select
                  value={specificUserId || undefined}
                  onValueChange={(value) => setSpecificUserId(value === 'all' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    {(usersQuery.data || []).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filter by Specific Agent */}
              <div className="space-y-2">
                <Label>Filter by Agent</Label>
                <p className="text-xs text-muted-foreground">Show tests for a specific agent</p>
                <Select
                  value={specificAgentId || undefined}
                  onValueChange={(value) => setSpecificAgentId(value === 'all' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All agents</SelectItem>
                    {(agentsQuery.data || []).map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tool Pattern Filter */}
              <div className="space-y-2">
                <Label>Tool Pattern</Label>
                <p className="text-xs text-muted-foreground">Filter tests by MCP server and tool</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select value={filterServer} onValueChange={handleFilterServerChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="MCP Server" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All servers</SelectItem>
                        {mcpServers?.map((server) => (
                          <SelectItem key={server.id} value={getServerKeyFromUrl(server.url)}>
                            {server.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-muted-foreground">::</span>
                  <div className="flex-1">
                    <Select value={filterTool} onValueChange={setFilterTool}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tool" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All tools</SelectItem>
                        {availableFilterTools.map((tool) => (
                          <SelectItem key={tool.id} value={tool.name}>
                            {tool.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Tested After</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Tested Before</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={clearFilters}>
                Clear all filters
              </Button>
              <Button onClick={() => setFiltersOpen(false)}>Apply filters</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PolicyPageLayout>
  );
}

function CreateTestDialog({
  open,
  onOpenChange,
  onSuccess,
  retestData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  retestData?: RetestData | null;
}) {
  const { selectedWorkspaceId } = useWorkspace();
  const usersQuery = trpc.admin.users.list.useQuery();
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const testMutation = trpc.admin.policies.test.useMutation();
  const { mcpServers, getToolsForServer } = useMcpServers({ workspaceId: selectedWorkspaceId });

  // State for tool invocation details
  // Initialize from retestData if provided
  const [toolInvocation, setToolInvocation] = useState<ToolInvocation>(() => {
    if (retestData) {
      return {
        parameters: retestData.toolParameters ?? undefined,
        contextOverrides: retestData.contextOverrides ?? undefined,
        extractedContext: retestData.extractedContext ?? undefined,
        extractedMode: retestData.extractedMode ?? undefined,
      };
    }
    return {};
  });

  const form = useForm<TestPolicyValues>({
    resolver: zodResolver(testPolicySchema),
    defaultValues: {
      mcpServer: '*',
      tool: '*',
      contextType: 'user',
      userId: '',
      agentId: '',
    },
  });

  const selectedMcpServerId = useWatch({
    control: form.control,
    name: 'mcpServer',
  });
  const selectedTool = useWatch({
    control: form.control,
    name: 'tool',
  });
  const contextType = useWatch({
    control: form.control,
    name: 'contextType',
  });

  // Compute the full tool name for condition field lookup
  const fullToolName = useMemo(() => {
    return `${selectedMcpServerId}::${selectedTool}`;
  }, [selectedMcpServerId, selectedTool]);

  // Fetch condition fields used by policies for this tool
  const conditionFieldsQuery = trpc.admin.conditions.getConditionFieldsForTool.useQuery(
    { toolName: fullToolName },
    { enabled: !!fullToolName && fullToolName !== '*::*' },
  );

  // Pre-fill form with retest data
  useEffect(() => {
    if (retestData && open) {
      const [mcpServer, tool] = retestData.toolName.split('::');
      form.reset({
        mcpServer: mcpServer || '*',
        tool: tool || '*',
        contextType: retestData.agentId ? 'agent' : 'user',
        userId: retestData.userId || '',
        agentId: retestData.agentId || '',
      });
    }
  }, [retestData, open, form]);

  const availableTools = getToolsForServer(selectedMcpServerId);

  // Handle tool invocation changes
  const handleInvocationChange = useCallback((value: ToolInvocation) => {
    setToolInvocation(value);
  }, []);

  const submitTest = form.handleSubmit(async (values) => {
    const toolName = `${values.mcpServer}::${values.tool}`;
    await testMutation.mutateAsync({
      toolName,
      userId: values.contextType === 'user' ? values.userId : undefined,
      agentId: values.contextType === 'agent' ? values.agentId : undefined,
      // Include tool invocation details
      parameters: toolInvocation.parameters,
      contextOverrides: toolInvocation.contextOverrides,
      extractedContext: toolInvocation.extractedContext,
      extractedMode: toolInvocation.extractedMode,
    });

    form.reset();
    setToolInvocation({});
    onSuccess();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Policy Test</DialogTitle>
          <DialogDescription>
            Test how policies would evaluate for a specific tool invocation.
          </DialogDescription>
        </DialogHeader>

        {testMutation.error ? (
          <Alert variant="destructive">
            <AlertTitle>Test failed</AlertTitle>
            <AlertDescription>{testMutation.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={submitTest}>
          <div className="space-y-2">
            <Label>Tool to Test</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Controller
                  control={form.control}
                  name="mcpServer"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== '*') {
                          form.setValue('tool', '*');
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="MCP Server" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All servers</SelectItem>
                        {mcpServers?.map((server) => (
                          <SelectItem key={server.id} value={getServerKeyFromUrl(server.url)}>
                            {server.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <span className="text-muted-foreground">::</span>
              <div className="flex-1">
                <Controller
                  control={form.control}
                  name="tool"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tool" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All tools</SelectItem>
                        {availableTools.map((tool) => (
                          <SelectItem key={tool.id} value={tool.name}>
                            {tool.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            {form.formState.errors.mcpServer || form.formState.errors.tool ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.mcpServer?.message || form.formState.errors.tool?.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Context</Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="contextType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {contextType === 'user' ? (
                <Controller
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {usersQuery.data?.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Controller
                  control={form.control}
                  name="agentId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agentsQuery.data?.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </div>
            {form.formState.errors.userId ? (
              <p className="text-xs text-destructive">{form.formState.errors.userId.message}</p>
            ) : null}
          </div>

          {/* Tool Invocation Details */}
          {fullToolName !== '*::*' && (
            <div className="space-y-2">
              <Label>Tool Invocation Details</Label>
              <p className="text-xs text-muted-foreground">
                Configure parameters, context overrides, and extracted context for testing
                conditions.
              </p>
              <ToolInvocationBuilder
                toolName={fullToolName}
                value={toolInvocation}
                onChange={handleInvocationChange}
                conditionFields={conditionFieldsQuery.data?.fields ?? []}
                disabled={testMutation.isPending}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={testMutation.isPending}>
              {testMutation.isPending ? 'Testing...' : 'Run Test'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewTestDialog({
  test,
  onClose,
  onRetest,
  formatToolNameForDisplay,
}: {
  test: PolicyTest | null;
  onClose: () => void;
  onRetest?: (test: PolicyTest) => void;
  formatToolNameForDisplay: (toolName: string) => string;
}) {
  const utils = trpc.useUtils();
  const [showPolicyContext, setShowPolicyContext] = useState(false);
  const [createAssertionOpen, setCreateAssertionOpen] = useState(false);
  const [assertionName, setAssertionName] = useState('');
  const [assertionDescription, setAssertionDescription] = useState('');
  const [expectedDecision, setExpectedDecision] = useState<'ALLOWED' | 'DENIED'>('ALLOWED');

  const createAssertionMutation = trpc.admin.policyAssertions.createFromPlaygroundTest.useMutation({
    onSuccess: () => {
      utils.admin.policyAssertions.list.invalidate();
      setCreateAssertionOpen(false);
      setAssertionName('');
      setAssertionDescription('');
    },
  });

  if (!test) return null;

  const policySnapshot = isPolicySnapshotArray(test.policySnapshot) ? test.policySnapshot : [];

  const matchedPolicies = policySnapshot.filter((p) => test.matchedPolicyIds.includes(p.id));

  // Explain policy precedence
  const getPrecedenceExplanation = () => {
    // Check if the denial was due to an untrusted server (overrides all policies)
    if (
      test.decision === 'DENIED' &&
      test.justification &&
      test.justification.includes('is untrusted')
    ) {
      return 'Denied due to untrusted server.';
    }

    if (matchedPolicies.length === 0) {
      return 'No policies matched this request, so it was DENIED by default (fail-closed).';
    }

    const denyPolicies = matchedPolicies.filter((p) => p.effect === 'DENY');
    const allowPolicies = matchedPolicies.filter((p) => p.effect === 'ALLOW');

    if (denyPolicies.length > 0) {
      return `DENY policies take precedence. ${denyPolicies.length} DENY ${
        denyPolicies.length === 1 ? 'policy' : 'policies'
      } matched, overriding ${allowPolicies.length} ALLOW ${
        allowPolicies.length === 1 ? 'policy' : 'policies'
      }.`;
    }

    return `${allowPolicies.length} ALLOW ${
      allowPolicies.length === 1 ? 'policy' : 'policies'
    } matched and no DENY policies, so the request was ALLOWED.`;
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test Result Details</DialogTitle>
          <DialogDescription>
            Policy evaluation for {test.userEmail}
            {test.agentName ? ` (${test.agentName})` : ''} at {formatDateTime(test.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Decision and Context */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">Decision:</div>
              <Badge
                variant={test.decision === 'DENIED' ? 'destructive' : 'default'}
                className="text-base"
              >
                {test.decision}
              </Badge>
            </div>

            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium text-foreground">Tool</div>
              <div className="mt-1 font-mono text-sm text-muted-foreground">
                {formatToolNameForDisplay(test.toolName)}
              </div>
            </div>

            {test.justification ? (
              <div className="rounded-md border border-border bg-muted p-3">
                <div className="text-sm font-medium text-foreground">Justification</div>
                <div className="mt-1 text-sm text-muted-foreground">{test.justification}</div>
              </div>
            ) : null}

            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium text-foreground">Context</div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">User:</span> {test.userEmail}
                </div>
                <div>
                  <span className="font-medium">Roles:</span>{' '}
                  {test.userRoles.length > 0 ? test.userRoles.join(', ') : 'None'}
                </div>
                {test.agentName ? (
                  <div>
                    <span className="font-medium">Agent:</span> {test.agentName}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Tool Invocation Details */}
            {(test.toolParameters || test.contextOverrides || test.extractedContext) && (
              <div className="rounded-md border border-border bg-muted p-3 min-w-0">
                <div className="text-sm font-medium text-foreground">Tool Invocation Details</div>
                <div className="mt-2 space-y-3 text-sm min-w-0">
                  {test.toolParameters && Object.keys(test.toolParameters).length > 0 && (
                    <div className="min-w-0">
                      <span className="font-medium text-muted-foreground">Parameters:</span>
                      <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs max-h-[200px] whitespace-pre-wrap break-all">
                        {JSON.stringify(test.toolParameters, null, 2)}
                      </pre>
                    </div>
                  )}
                  {test.contextOverrides && Object.keys(test.contextOverrides).length > 0 && (
                    <div className="min-w-0">
                      <span className="font-medium text-muted-foreground">Context Overrides:</span>
                      <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs max-h-[120px] whitespace-pre-wrap break-all">
                        {JSON.stringify(test.contextOverrides, null, 2)}
                      </pre>
                    </div>
                  )}
                  {test.extractedContext && (
                    <div className="min-w-0">
                      <span className="font-medium text-muted-foreground">
                        Extracted Context ({test.extractedMode ?? 'auto'}):
                      </span>
                      <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs max-h-[150px] whitespace-pre-wrap break-all">
                        {JSON.stringify(test.extractedContext, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Policy Precedence Explanation */}
          <Alert>
            <AlertTitle>Policy Precedence Logic</AlertTitle>
            <AlertDescription>{getPrecedenceExplanation()}</AlertDescription>
          </Alert>

          {/* Matched Policies */}
          {matchedPolicies.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Policies That Matched</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Matcher</TableHead>
                      <TableHead>Tool Pattern</TableHead>
                      <TableHead>Effect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchedPolicies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-medium">{policy.description || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{policy.matcher}</TableCell>
                        <TableCell className="font-mono text-xs">{policy.toolPattern}</TableCell>
                        <TableCell>
                          <AllowDenyBadge value={getPolicyEffect(policy.effect)} size="sm" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <Alert>
              <AlertTitle>No Policies Matched</AlertTitle>
              <AlertDescription>
                No policies matched this request. The system defaults to DENY (fail-closed).
              </AlertDescription>
            </Alert>
          )}

          {/* Policy Context - Collapsible */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Policy Context</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPolicyContext(!showPolicyContext)}
                className="text-xs"
              >
                {showPolicyContext ? 'Hide' : 'Show'} all enabled policies
              </Button>
            </div>

            {showPolicyContext ? (
              <>
                <p className="text-xs text-muted-foreground">
                  All policies that were enabled at test time. Matched policies are highlighted.
                </p>
                <div className="rounded-md border">
                  {policySnapshot.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Matcher</TableHead>
                          <TableHead>Tool Pattern</TableHead>
                          <TableHead>Effect</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {policySnapshot.map((policy) => (
                          <TableRow
                            key={policy.id}
                            className={
                              test.matchedPolicyIds.includes(policy.id)
                                ? 'bg-muted/50'
                                : 'opacity-50'
                            }
                          >
                            <TableCell className="font-medium">
                              {policy.description || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{policy.matcher}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {policy.toolPattern}
                            </TableCell>
                            <TableCell>
                              <Badge variant={policy.effect === 'DENY' ? 'destructive' : 'default'}>
                                {policy.effect}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">
                      No enabled policies at test time
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={() => setCreateAssertionOpen(true)}>
            Create Assertion
          </Button>
          {onRetest ? <Button onClick={() => onRetest(test)}>Retest</Button> : null}
        </DialogFooter>
      </DialogContent>

      {/* Create Assertion Dialog */}
      <Dialog open={createAssertionOpen} onOpenChange={setCreateAssertionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Policy Assertion</DialogTitle>
            <DialogDescription>
              Create a persistent assertion from this test to validate future policy changes.
            </DialogDescription>
          </DialogHeader>

          {createAssertionMutation.error ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to create assertion</AlertTitle>
              <AlertDescription>{createAssertionMutation.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="assertion-name">Name</Label>
              <Input
                id="assertion-name"
                placeholder="e.g., Admin can access GitHub"
                value={assertionName}
                onChange={(e) => setAssertionName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assertion-description">Description (optional)</Label>
              <Input
                id="assertion-description"
                placeholder="Describe what this assertion validates"
                value={assertionDescription}
                onChange={(e) => setAssertionDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Expected Decision</Label>
              <Select
                value={expectedDecision}
                onValueChange={(value) => setExpectedDecision(value as 'ALLOWED' | 'DENIED')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALLOWED">ALLOWED</SelectItem>
                  <SelectItem value="DENIED">DENIED</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Current test result: {test.decision}</p>
            </div>

            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium">Test Details</div>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                <div>Tool: {formatToolNameForDisplay(test.toolName)}</div>
                <div>
                  Context:{' '}
                  {test.agentName
                    ? `Agent: ${test.agentName}`
                    : test.userEmail
                      ? `User: ${test.userEmail}`
                      : 'Wildcard'}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateAssertionOpen(false)}
              disabled={createAssertionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                createAssertionMutation.mutate({
                  playgroundTestId: test.id,
                  name: assertionName,
                  description: assertionDescription || undefined,
                  expectedDecision,
                });
              }}
              disabled={createAssertionMutation.isPending || !assertionName.trim()}
            >
              {createAssertionMutation.isPending ? 'Creating...' : 'Create Assertion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
