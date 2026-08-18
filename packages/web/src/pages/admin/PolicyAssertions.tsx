import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { PolicyPageLayout } from '../../components/layout/PolicyPageLayout';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { DeleteConfirmDialog } from '../../components/policy';
import {
  ToolInvocationBuilder,
  type ToolInvocation,
} from '../../components/policy/ToolInvocationBuilder';
import { ActiveFilterBadges } from '../../components/ui/active-filter-badges';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { AllowDenyBadge } from '../../components/ui/allow-deny-toggle';
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
import { Switch } from '../../components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { toolPatternToUI } from '../../lib/policyUtils';
import { getServerKeyFromUrl } from '../../lib/toolPattern';
import { trpc } from '../../lib/trpc';

// Simplified type for policy assertion to avoid deep type instantiation
interface PolicyAssertion {
  id: string;
  name: string;
  description: string | null;
  toolPattern: string;
  contextType: string;
  userId: string | null;
  agentId: string | null;
  roleName: string | null;
  expectedDecision: string;
  source: string;
  sourceId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunPassed: boolean | null;
  lastRunDecision: string | null;
  lastRunJustification: string | null;
  lastRunPolicyIds: string[];
  lastRunSubResults: unknown;
  failureCount: number;
  createdAt: string;
  // Tool invocation details
  toolParameters?: Record<string, unknown> | null;
  contextOverrides?: Record<string, unknown> | null;
  extractedContext?: Record<string, unknown> | null;
  extractedMode?: string | null;
}

// Helper to convert assertions with simpler type
function getAssertions<
  T extends {
    assertions: Array<{
      id: string;
      name: string;
      description: string | null;
      toolPattern: string;
      contextType: unknown;
      userId: string | null;
      agentId: string | null;
      roleName: string | null;
      expectedDecision: string;
      source: unknown;
      sourceId: string | null;
      enabled: boolean;
      lastRunAt: unknown;
      lastRunPassed: boolean | null;
      lastRunDecision: string | null;
      lastRunJustification: string | null;
      lastRunPolicyIds: string[];
      lastRunSubResults: unknown;
      failureCount: number;
      createdAt: unknown;
    }>;
    total: number;
  },
>(data: T | undefined): { assertions: PolicyAssertion[]; total: number } | undefined {
  if (!data) return undefined;
  return {
    assertions: data.assertions.map((a) => ({
      ...a,
      contextType: String(a.contextType),
      source: String(a.source),
      lastRunAt: a.lastRunAt ? String(a.lastRunAt) : null,
      createdAt: String(a.createdAt),
    })),
    total: data.total,
  };
}

// Sub-result type for display
interface SubResult {
  context: string;
  decision: string;
  passed: boolean;
  justification: string | null;
}

function isSubResultArray(value: unknown): value is SubResult[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      'context' in item &&
      'decision' in item &&
      'passed' in item,
  );
}

const createAssertionSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100),
    description: z.string().max(500).optional(),
    server: z.string().min(1, 'Server is required'),
    tool: z.string().min(1, 'Tool is required'),
    contextType: z.enum(['USER', 'AGENT', 'ROLE', 'WILDCARD']),
    userId: z.string().optional(),
    agentId: z.string().optional(),
    roleName: z.string().optional(),
    expectedDecision: z.enum(['ALLOWED', 'DENIED']),
    enabled: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.contextType === 'USER' && !data.userId) return false;
      if (data.contextType === 'AGENT' && !data.agentId) return false;
      if (data.contextType === 'ROLE' && !data.roleName) return false;
      return true;
    },
    {
      message: 'Please provide the required context value',
      path: ['userId'],
    },
  );

type CreateAssertionValues = z.infer<typeof createAssertionSchema>;

type StatusFilter = 'all' | 'passed' | 'failed' | 'never-run';
type SourceFilter = 'all' | 'MANUAL' | 'PLAYGROUND' | 'AUDIT_LOG';
type ContextFilter = 'all' | 'USER' | 'AGENT' | 'ROLE' | 'WILDCARD';

// Type-safe filter value checkers using readonly arrays for proper .includes() typing
const STATUS_FILTER_VALUES: readonly string[] = ['all', 'passed', 'failed', 'never-run'] as const;
const SOURCE_FILTER_VALUES: readonly string[] = [
  'all',
  'MANUAL',
  'PLAYGROUND',
  'AUDIT_LOG',
] as const;

function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTER_VALUES.includes(value);
}

function isSourceFilter(value: string): value is SourceFilter {
  return SOURCE_FILTER_VALUES.includes(value);
}

const EMPTY_ASSERTIONS: PolicyAssertion[] = [];

export default function PolicyAssertions() {
  const utils = trpc.useUtils();
  const assertionsQuery = trpc.admin.policyAssertions.list.useQuery({ limit: 100 });
  const summaryQuery = trpc.admin.policyAssertions.summary.useQuery();
  const assertionsData = getAssertions(assertionsQuery.data);
  const { getServerNameForDisplay } = useMcpServers();

  // Helper to format tool pattern for display with friendly names
  function formatToolPatternDisplay(toolPattern: string): string {
    const { server, tool } = toolPatternToUI(toolPattern);
    const serverName = getServerNameForDisplay(server);
    if (server === '*' && tool === '*') return 'All tools';
    if (server === '*') return `All servers :: ${tool}`;
    if (tool === '*') return `${serverName} :: All tools`;
    return `${serverName} :: ${tool}`;
  }

  const runAllMutation = trpc.admin.policyAssertions.runAll.useMutation({
    onSuccess: () => {
      utils.admin.policyAssertions.list.invalidate();
      utils.admin.policyAssertions.summary.invalidate();
    },
  });

  const deleteMutation = trpc.admin.policyAssertions.delete.useMutation({
    onSuccess: () => {
      utils.admin.policyAssertions.list.invalidate();
      utils.admin.policyAssertions.summary.invalidate();
      setDeleteConfirm(null);
    },
  });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedAssertion, setSelectedAssertion] = useState<PolicyAssertion | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const allAssertions = assertionsData?.assertions ?? EMPTY_ASSERTIONS;

  // Apply filters
  const filteredAssertions = useMemo(() => {
    return allAssertions.filter((assertion) => {
      // Text search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          assertion.name.toLowerCase().includes(query) ||
          assertion.toolPattern.toLowerCase().includes(query) ||
          assertion.description?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'passed' && assertion.lastRunPassed !== true) return false;
        if (statusFilter === 'failed' && assertion.lastRunPassed !== false) return false;
        if (statusFilter === 'never-run' && assertion.lastRunAt !== null) return false;
      }

      // Source filter
      if (sourceFilter !== 'all' && assertion.source !== sourceFilter) return false;

      // Context filter
      if (contextFilter !== 'all' && assertion.contextType !== contextFilter) return false;

      // Enabled filter
      if (enabledFilter === 'enabled' && !assertion.enabled) return false;
      if (enabledFilter === 'disabled' && assertion.enabled) return false;

      return true;
    });
  }, [allAssertions, searchQuery, statusFilter, sourceFilter, contextFilter, enabledFilter]);

  const hasActiveFilters =
    searchQuery ||
    statusFilter !== 'all' ||
    sourceFilter !== 'all' ||
    contextFilter !== 'all' ||
    enabledFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSourceFilter('all');
    setContextFilter('all');
    setEnabledFilter('all');
  };

  const getStatusText = (assertion: PolicyAssertion) => {
    if (assertion.lastRunAt === null) {
      return { text: 'Never run', className: 'text-muted-foreground' };
    }
    if (assertion.lastRunPassed === true) {
      return { text: 'Passed', className: 'text-green-600 dark:text-green-400' };
    }
    return { text: 'Failed', className: 'text-destructive' };
  };

  const handleRunAll = () => {
    runAllMutation.mutate();
  };

  return (
    <PolicyPageLayout>
      <div className="space-y-8">
        <PageHeader
          title="Policy Assertions"
          description="Define and validate expected policy behavior as persistent test cases."
        />

        {assertionsQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load assertions</AlertTitle>
            <AlertDescription>{assertionsQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-3xl">{summaryQuery.data?.total ?? '-'}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Passing</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {summaryQuery.data?.passed ?? '-'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failing</CardDescription>
              <CardTitle className="text-3xl text-destructive">
                {summaryQuery.data?.failed ?? '-'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Never Run</CardDescription>
              <CardTitle className="text-3xl text-muted-foreground">
                {summaryQuery.data?.neverRun ?? '-'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Search and Actions Bar */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search by name, tool pattern, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => isStatusFilter(v) && setStatusFilter(v)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="never-run">Never Run</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sourceFilter}
            onValueChange={(v) => isSourceFilter(v) && setSourceFilter(v)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="PLAYGROUND">Playground</SelectItem>
              <SelectItem value="AUDIT_LOG">Audit Log</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRunAll} disabled={runAllMutation.isPending}>
            {runAllMutation.isPending ? 'Running...' : 'Run All'}
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>New Assertion</Button>
        </div>

        <ActiveFilterBadges
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onClear: () => setStatusFilter('all'),
            },
            {
              key: 'source',
              label: 'Source',
              value: sourceFilter,
              onClear: () => setSourceFilter('all'),
            },
            {
              key: 'context',
              label: 'Context',
              value: contextFilter,
              onClear: () => setContextFilter('all'),
            },
            {
              key: 'enabled',
              label: 'Enabled',
              value:
                enabledFilter === 'enabled'
                  ? 'Enabled only'
                  : enabledFilter === 'disabled'
                    ? 'Disabled only'
                    : '',
              onClear: () => setEnabledFilter('all'),
            },
          ]}
          onClearAll={clearFilters}
          filteredCount={filteredAssertions.length}
          totalCount={allAssertions.length}
        />

        {/* Run All Results */}
        {runAllMutation.isSuccess ? (
          <Alert variant={runAllMutation.data.failed > 0 ? 'destructive' : 'default'}>
            <AlertTitle>
              {runAllMutation.data.failed > 0 ? 'Some Assertions Failed' : 'All Assertions Passed'}
            </AlertTitle>
            <AlertDescription>
              {runAllMutation.data.passed} passed, {runAllMutation.data.failed} failed out of{' '}
              {runAllMutation.data.total} total assertions.
            </AlertDescription>
          </Alert>
        ) : null}

        <DeleteConfirmDialog
          open={Boolean(deleteConfirm)}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Delete assertion"
          description="Are you sure you want to delete this assertion? This action cannot be undone."
          onConfirm={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm })}
          isDeleting={deleteMutation.isPending}
        />

        {/* Assertions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Assertions</CardTitle>
            <CardDescription>
              Policy assertions define expected behavior that should always hold true.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assertionsQuery.isPending ? (
              <TableSkeleton />
            ) : filteredAssertions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Tool Pattern</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssertions.map((assertion) => (
                    <TableRow
                      key={assertion.id}
                      className={!assertion.enabled ? 'opacity-50' : undefined}
                    >
                      <TableCell>
                        <div className="font-medium">{assertion.name}</div>
                        {assertion.description ? (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {assertion.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatToolPatternDisplay(assertion.toolPattern)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {assertion.contextType}
                      </TableCell>
                      <TableCell>
                        <AllowDenyBadge
                          value={assertion.expectedDecision as 'ALLOWED' | 'DENIED'}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell className={`font-medium ${getStatusText(assertion).className}`}>
                        {getStatusText(assertion).text}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedAssertion(assertion)}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(assertion.id)}
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
                title="No assertions match filters"
                description="Try adjusting your filters to see more results."
              />
            ) : (
              <EmptyState
                title="No assertions yet"
                description="Create your first policy assertion to define expected behavior."
              />
            )}
          </CardContent>
        </Card>

        <CreateAssertionDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={() => {
            setCreateDialogOpen(false);
            utils.admin.policyAssertions.list.invalidate();
            utils.admin.policyAssertions.summary.invalidate();
          }}
        />

        <ViewAssertionDialog
          assertion={selectedAssertion}
          onClose={() => setSelectedAssertion(null)}
          onRefresh={() => {
            utils.admin.policyAssertions.list.invalidate();
            utils.admin.policyAssertions.summary.invalidate();
          }}
          formatToolPattern={formatToolPatternDisplay}
        />
      </div>
    </PolicyPageLayout>
  );
}

function CreateAssertionDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { selectedWorkspaceId } = useWorkspace();
  const usersQuery = trpc.admin.users.list.useQuery();
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const rolesQuery = trpc.admin.roles.list.useQuery();
  const { mcpServers, getServerNameForDisplay, getToolsForServer } = useMcpServers({
    workspaceId: selectedWorkspaceId,
  });

  // State for tool invocation details
  const [toolInvocation, setToolInvocation] = useState<ToolInvocation>({});

  const createMutation = trpc.admin.policyAssertions.create.useMutation({
    onSuccess: () => {
      form.reset();
      setToolInvocation({});
      onSuccess();
    },
  });

  const form = useForm<CreateAssertionValues>({
    resolver: zodResolver(createAssertionSchema),
    defaultValues: {
      name: '',
      description: '',
      server: '*',
      tool: '*',
      contextType: 'WILDCARD',
      userId: '',
      agentId: '',
      roleName: '',
      expectedDecision: 'ALLOWED',
      enabled: true,
    },
  });

  const contextType = useWatch({ control: form.control, name: 'contextType' });
  const server = useWatch({ control: form.control, name: 'server' });
  const tool = useWatch({ control: form.control, name: 'tool' });
  const userId = useWatch({ control: form.control, name: 'userId' });
  const agentId = useWatch({ control: form.control, name: 'agentId' });
  const roleName = useWatch({ control: form.control, name: 'roleName' });
  const expectedDecision = useWatch({ control: form.control, name: 'expectedDecision' });

  // Compute full tool name for condition field lookup
  const fullToolName = useMemo(() => `${server}::${tool}`, [server, tool]);

  // Fetch condition fields used by policies for this tool
  const conditionFieldsQuery = trpc.admin.conditions.getConditionFieldsForTool.useQuery(
    { toolName: fullToolName },
    { enabled: !!fullToolName && fullToolName !== '*::*' },
  );

  // Handler for tool invocation changes
  const handleInvocationChange = useCallback((value: ToolInvocation) => {
    setToolInvocation(value);
  }, []);

  function generateAssertionName(): string {
    const serverName = server === '*' ? 'all servers' : getServerNameForDisplay(server);
    const toolName = tool === '*' ? 'all tools' : tool;
    const decision = expectedDecision === 'ALLOWED' ? 'can access' : 'cannot access';

    let contextName = 'Anyone';
    if (contextType === 'USER' && userId) {
      const user = usersQuery.data?.find((u) => u.id === userId);
      contextName = user?.email || 'User';
    } else if (contextType === 'AGENT' && agentId) {
      const agent = agentsQuery.data?.find((a) => a.id === agentId);
      contextName = agent?.name || 'Agent';
    } else if (contextType === 'ROLE' && roleName) {
      contextName = `${roleName} role`;
    }

    if (tool === '*') {
      return `${contextName} ${decision} ${serverName}`;
    }
    return `${contextName} ${decision} ${toolName}`;
  }

  function handleAutoGenerateName(): void {
    form.setValue('name', generateAssertionName());
  }

  const submitAssertion = form.handleSubmit(async (values) => {
    const toolPattern = `${values.server}::${values.tool}`;
    await createMutation.mutateAsync({
      name: values.name,
      description: values.description,
      toolPattern,
      contextType: values.contextType,
      userId: values.contextType === 'USER' ? values.userId : undefined,
      agentId: values.contextType === 'AGENT' ? values.agentId : undefined,
      roleName: values.contextType === 'ROLE' ? values.roleName : undefined,
      expectedDecision: values.expectedDecision,
      enabled: values.enabled,
      // Include tool invocation details
      toolParameters: toolInvocation.parameters,
      contextOverrides: toolInvocation.contextOverrides,
      extractedContext: toolInvocation.extractedContext,
      extractedMode: toolInvocation.extractedMode,
    });
  });

  const availableTools = getToolsForServer(server);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Policy Assertion</DialogTitle>
          <DialogDescription>
            Define an expected policy behavior that should always hold true.
          </DialogDescription>
        </DialogHeader>

        {createMutation.error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to create assertion</AlertTitle>
            <AlertDescription>{createMutation.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={submitAssertion}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="name">Name</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={handleAutoGenerateName}
              >
                Auto-generate
              </Button>
            </div>
            <Input
              id="name"
              placeholder="e.g., Admins can access GitHub"
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Why this assertion matters..."
              {...form.register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label>Tool Pattern</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Controller
                  control={form.control}
                  name="server"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Reset tool to '*' when server changes
                        form.setValue('tool', '*');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select server" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All servers</SelectItem>
                        {mcpServers?.map((s) => (
                          <SelectItem key={s.id} value={getServerKeyFromUrl(s.url)}>
                            {s.name}
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
                        <SelectValue placeholder="Select tool" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All tools</SelectItem>
                        {availableTools.map((t) => (
                          <SelectItem key={t.id} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Select the server and tool to test against.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Context Type</Label>
              <Controller
                control={form.control}
                name="contextType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WILDCARD">Wildcard (*)</SelectItem>
                      <SelectItem value="USER">Specific User</SelectItem>
                      <SelectItem value="AGENT">Specific Agent</SelectItem>
                      <SelectItem value="ROLE">All Users with Role</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {contextType === 'USER' ? (
              <div className="space-y-2">
                <Label>User</Label>
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
              </div>
            ) : null}

            {contextType === 'AGENT' ? (
              <div className="space-y-2">
                <Label>Agent</Label>
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
              </div>
            ) : null}

            {contextType === 'ROLE' ? (
              <div className="space-y-2">
                <Label>Role</Label>
                <Controller
                  control={form.control}
                  name="roleName"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {rolesQuery.data?.map((role) => (
                          <SelectItem key={role.id} value={role.name}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Expected Decision</Label>
            <Controller
              control={form.control}
              name="expectedDecision"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALLOWED">ALLOWED</SelectItem>
                    <SelectItem value="DENIED">DENIED</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              The decision you expect policies to produce for this scenario.
            </p>
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
                disabled={createMutation.isPending}
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} id="enabled" />
              )}
            />
            <Label htmlFor="enabled">Enabled</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Assertion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewAssertionDialog({
  assertion,
  onClose,
  onRefresh,
  formatToolPattern,
}: {
  assertion: PolicyAssertion | null;
  onClose: () => void;
  onRefresh: () => void;
  formatToolPattern: (toolPattern: string) => string;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const runMutation = trpc.admin.policyAssertions.run.useMutation({
    onSuccess: () => {
      onRefresh();
    },
  });

  if (!assertion) return null;

  const subResults = isSubResultArray(assertion.lastRunSubResults)
    ? assertion.lastRunSubResults
    : null;

  if (isEditing) {
    return (
      <EditAssertionDialog
        assertion={assertion}
        onClose={() => setIsEditing(false)}
        onSuccess={() => {
          setIsEditing(false);
          onRefresh();
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assertion.name}</DialogTitle>
          <DialogDescription>
            {assertion.description || 'No description provided.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Configuration */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium text-foreground">Tool Pattern</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {formatToolPattern(assertion.toolPattern)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium text-foreground">Context</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {assertion.contextType}
                {assertion.userId ? ` (User)` : null}
                {assertion.agentId ? ` (Agent)` : null}
                {assertion.roleName ? `: ${assertion.roleName}` : null}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium text-foreground">Expected Decision</div>
              <div className="mt-1">
                <AllowDenyBadge
                  value={assertion.expectedDecision as 'ALLOWED' | 'DENIED'}
                  size="sm"
                />
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium text-foreground">Source</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {assertion.source}
                {assertion.sourceId ? ` (${assertion.sourceId.slice(0, 8)}...)` : null}
              </div>
            </div>
          </div>

          {/* Tool Invocation Details */}
          {(assertion.toolParameters ||
            assertion.contextOverrides ||
            assertion.extractedContext) && (
            <div className="space-y-3 min-w-0">
              <h3 className="text-sm font-semibold">Tool Invocation Details</h3>
              <div className="rounded-md border border-border bg-muted p-3 space-y-3 min-w-0">
                {assertion.toolParameters && Object.keys(assertion.toolParameters).length > 0 && (
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">Parameters:</span>
                    <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs max-h-[200px] whitespace-pre-wrap break-all">
                      {JSON.stringify(assertion.toolParameters, null, 2)}
                    </pre>
                  </div>
                )}
                {assertion.contextOverrides &&
                  Object.keys(assertion.contextOverrides).length > 0 && (
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        Context Overrides:
                      </span>
                      <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs max-h-[120px] whitespace-pre-wrap break-all">
                        {JSON.stringify(assertion.contextOverrides, null, 2)}
                      </pre>
                    </div>
                  )}
                {assertion.extractedContext && (
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      Extracted Context ({assertion.extractedMode ?? 'auto'}):
                    </span>
                    <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs max-h-[150px] whitespace-pre-wrap break-all">
                      {JSON.stringify(assertion.extractedContext, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Last Run Results */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Last Run</h3>
            {assertion.lastRunAt ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {formatDateTime(assertion.lastRunAt)}
                  </div>
                  <div
                    className={`text-sm font-medium ${assertion.lastRunPassed ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
                  >
                    {assertion.lastRunPassed ? 'Passed' : 'Failed'}
                  </div>
                </div>

                {assertion.lastRunDecision ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Actual Decision:</span>
                    <AllowDenyBadge
                      value={assertion.lastRunDecision as 'ALLOWED' | 'DENIED'}
                      size="sm"
                    />
                  </div>
                ) : null}

                {assertion.lastRunJustification ? (
                  <Alert variant={assertion.lastRunPassed ? 'default' : 'destructive'}>
                    <AlertDescription>{assertion.lastRunJustification}</AlertDescription>
                  </Alert>
                ) : null}

                {/* Sub-results for multi-context assertions */}
                {subResults && subResults.length > 1 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Sub-Results</div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Context</TableHead>
                            <TableHead>Decision</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subResults.map((sub, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">{sub.context}</TableCell>
                              <TableCell>
                                <AllowDenyBadge
                                  value={sub.decision as 'ALLOWED' | 'DENIED'}
                                  size="sm"
                                />
                              </TableCell>
                              <TableCell
                                className={`font-medium ${sub.passed ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
                              >
                                {sub.passed ? 'Pass' : 'Fail'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {assertion.lastRunPolicyIds.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Matched {assertion.lastRunPolicyIds.length} policies
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                This assertion has never been run.
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div>Created: {formatDateTime(assertion.createdAt)}</div>
            <div>Failure count: {assertion.failureCount}</div>
            <div>{assertion.enabled ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
          <Button
            onClick={() => runMutation.mutate({ id: assertion.id })}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? 'Running...' : 'Run Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const editAssertionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  expectedDecision: z.enum(['ALLOWED', 'DENIED']),
  enabled: z.boolean(),
});

type EditAssertionValues = z.infer<typeof editAssertionSchema>;

function EditAssertionDialog({
  assertion,
  onClose,
  onSuccess,
  onCancel,
}: {
  assertion: PolicyAssertion;
  onClose: () => void;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const updateMutation = trpc.admin.policyAssertions.update.useMutation({
    onSuccess: () => {
      onSuccess();
    },
  });

  const form = useForm<EditAssertionValues>({
    resolver: zodResolver(editAssertionSchema),
    defaultValues: {
      name: assertion.name,
      description: assertion.description ?? '',
      expectedDecision: assertion.expectedDecision as 'ALLOWED' | 'DENIED',
      enabled: assertion.enabled,
    },
  });

  const submitUpdate = form.handleSubmit(async (values) => {
    await updateMutation.mutateAsync({
      id: assertion.id,
      name: values.name,
      description: values.description || null,
      expectedDecision: values.expectedDecision,
      enabled: values.enabled,
    });
  });

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Assertion</DialogTitle>
          <DialogDescription>
            Update the assertion name, description, expected decision, or enabled status.
          </DialogDescription>
        </DialogHeader>

        {updateMutation.error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to update assertion</AlertTitle>
            <AlertDescription>{updateMutation.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={submitUpdate}>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea id="edit-description" {...form.register('description')} />
          </div>

          <div className="rounded-md border border-border bg-muted p-3">
            <div className="text-sm font-medium text-foreground">Tool Pattern</div>
            <div className="mt-1 text-sm text-muted-foreground">{assertion.toolPattern}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Tool pattern cannot be changed. Create a new assertion if you need a different
              pattern.
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted p-3">
            <div className="text-sm font-medium text-foreground">Context</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {assertion.contextType}
              {assertion.userId ? ' (User)' : null}
              {assertion.agentId ? ' (Agent)' : null}
              {assertion.roleName ? `: ${assertion.roleName}` : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Context cannot be changed. Create a new assertion if you need a different context.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Expected Decision</Label>
            <Controller
              control={form.control}
              name="expectedDecision"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALLOWED">ALLOWED</SelectItem>
                    <SelectItem value="DENIED">DENIED</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} id="edit-enabled" />
              )}
            />
            <Label htmlFor="edit-enabled">Enabled</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
