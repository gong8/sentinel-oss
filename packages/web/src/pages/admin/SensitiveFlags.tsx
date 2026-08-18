import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import { z } from 'zod';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { ToolsPageLayout } from '../../components/layout/ToolsPageLayout';
import { toolPatternEntrySchema } from '../../components/policy/PolicyFormModal/types';
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
import { Checkbox } from '../../components/ui/checkbox';
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
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatShortDate } from '../../lib/format';
import { toolPatternFromUI } from '../../lib/policyUtils';
import { checkToolPattern } from '../../lib/toolPattern';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';

// Behavior options for sensitive flags
// Note: Enhanced audit is now always-on for all sensitive flags
const BEHAVIOR_OPTIONS = [
  {
    value: 'REQUIRE_APPROVAL',
    label: 'Require Approval',
    description: 'Block until approved by admin or session owner',
  },
  {
    value: 'RATE_LIMIT',
    label: 'Rate Limit',
    description: 'Limit invocations per session',
  },
  { value: 'ALERT', label: 'Alert', description: 'Send webhook notification' },
] as const;

// Zod enum for behaviors - provides type safety without casts
const behaviorSchema = z.enum(['REQUIRE_APPROVAL', 'RATE_LIMIT', 'ALERT']);
const approverSchema = z.enum(['session_owner', 'admin']);

type BehaviorValue = z.infer<typeof behaviorSchema>;

// Schema for flag creation - simplified to avoid TypeScript deep instantiation
const createFlagSchema = z.object({
  toolPatternEntry: toolPatternEntrySchema,
  behaviors: z.array(behaviorSchema).min(1, 'Select at least one behavior'),
  description: z.string().optional(),
  rateLimitMaxPerSession: z.number().min(1).optional(),
  rateLimitWindowMinutes: z.number().min(1).optional(),
  approvalAllowedApprovers: z.array(approverSchema).optional(),
  approvalTimeoutSeconds: z.number().min(1).optional(),
  alertWebhookEndpointIds: z.array(z.string()).optional(),
});

// MCP server interface for simpler type handling
interface McpServerData {
  id: string;
  name: string;
  url: string;
  tools?: { id: string; name: string }[];
}

// Helper to extract MCP servers with simpler type to avoid deep instantiation
function getMcpServers<
  T extends Array<{
    id: string;
    name: string;
    url: string;
    tools?: { id: string; name: string }[];
  }>,
>(data: T | undefined): McpServerData[] | undefined {
  return data;
}

// Helper to convert tool pattern to friendly name using MCP server names
function getToolFriendlyName(toolPattern: string, servers: McpServerData[] | undefined): string {
  if (!servers) return toolPattern;

  const parts = toolPattern.split('::');
  if (parts.length !== 2) return toolPattern;

  const [serverPart, toolPart] = parts;

  for (const server of servers) {
    try {
      const url = new URL(server.url);
      const domain = url.hostname;
      const port = url.port ? `:${url.port}` : '';
      const serverKey = `${domain}${port}`;
      if (serverPart === serverKey) {
        return `${server.name}::${toolPart}`;
      }
    } catch {
      continue;
    }
  }

  return toolPattern;
}

type CreateFlagValues = z.infer<typeof createFlagSchema>;

// Filter types with type guards using readonly arrays for proper .includes() typing
type StatusFilter = 'all' | 'enabled' | 'disabled';
const STATUS_FILTER_VALUES: readonly string[] = ['all', 'enabled', 'disabled'] as const;

function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTER_VALUES.includes(value);
}

type BehaviorFilter = 'all' | BehaviorValue;
const BEHAVIOR_FILTER_VALUES: readonly string[] = [
  'all',
  'REQUIRE_APPROVAL',
  'RATE_LIMIT',
  'ALERT',
] as const;

function isBehaviorFilter(value: string): value is BehaviorFilter {
  return BEHAVIOR_FILTER_VALUES.includes(value);
}

// Simplified interfaces to avoid deep type instantiation from RouterOutputs
interface SensitiveFlagItem {
  id: string;
  organizationId: string;
  toolPattern: string;
  behaviors: string[];
  description: string | null;
  enabled: boolean;
  rateLimitConfig: unknown;
  approvalConfig: unknown;
  alertConfig: unknown;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  creator: { email: string } | null;
  _count?: { agentOverrides: number };
}

interface AgentOverride {
  id: string;
  sensitiveToolFlagId: string;
  agentId: string;
  behaviors: string[];
  exempted: boolean;
  rateLimitConfig: unknown;
  approvalConfig: unknown;
  createdAt: string;
  updatedAt: string;
  agent: { id: string; name: string };
}

interface AgentItem {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

// Helper functions to avoid deep type instantiation when extracting data from tRPC
function getFlags<T extends SensitiveFlagItem>(data: T[] | undefined): SensitiveFlagItem[] {
  return data ?? [];
}

function getOverrides<T extends AgentOverride>(data: T[] | undefined): AgentOverride[] {
  return data ?? [];
}

function getAgents<T extends AgentItem>(data: T[] | undefined): AgentItem[] {
  return data ?? [];
}

export default function AdminSensitiveFlags(): React.JSX.Element {
  const location = useLocation();
  const utils = trpc.useUtils();
  const { selectedWorkspaceSlug, selectedWorkspaceId, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  // Clear navigation state immediately after reading it
  useEffect(() => {
    if (location.state?.openCreateModal) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const flagsQuery = trpc.admin.sensitiveFlags.list.useQuery({
    includeDisabled: true,
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const mcpServersQuery = trpc.admin.mcpServers.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const webhooksQuery = trpc.admin.webhooks.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  const mcpServers = getMcpServers(mcpServersQuery.data);

  const getToolsForServer = (serverKey: string): { id: string; name: string }[] => {
    if (serverKey === '*' || !mcpServers) return [];
    const server = mcpServers.find((s) => {
      try {
        const url = new URL(s.url);
        const domain = url.hostname;
        const port = url.port ? `:${url.port}` : '';
        return `${domain}${port}` === serverKey;
      } catch {
        return false;
      }
    });
    return server?.tools || [];
  };

  const createMutation = trpc.admin.sensitiveFlags.create.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.list.invalidate();
      setCreateOpen(false);
      form.reset();
    },
  });

  const updateMutation = trpc.admin.sensitiveFlags.update.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.list.invalidate();
    },
  });

  const deleteMutation = trpc.admin.sensitiveFlags.delete.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.list.invalidate();
      setDeleteConfirm(null);
    },
  });

  // Agent and override queries/mutations
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const agents = useMemo(() => getAgents(agentsQuery.data), [agentsQuery.data]);

  const createOverrideMutation = trpc.admin.sensitiveFlags.createOverride.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.listOverrides.invalidate();
      utils.admin.sensitiveFlags.list.invalidate();
      setAddOverrideOpen(false);
      resetOverrideForm();
    },
  });

  const updateOverrideMutation = trpc.admin.sensitiveFlags.updateOverride.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.listOverrides.invalidate();
      setEditOverride(null);
      resetOverrideForm();
    },
  });

  const deleteOverrideMutation = trpc.admin.sensitiveFlags.deleteOverride.useMutation({
    onSuccess: () => {
      utils.admin.sensitiveFlags.listOverrides.invalidate();
      utils.admin.sensitiveFlags.list.invalidate();
      setDeleteOverrideConfirm(null);
    },
  });

  // Use nullish coalescing with proper typing - tRPC already validates the data
  const flagsData = useMemo(() => getFlags(flagsQuery.data), [flagsQuery.data]);

  // UI state
  const [createOpen, setCreateOpen] = useState(() => {
    return Boolean(location.state?.openCreateModal);
  });
  const [editFlag, setEditFlag] = useState<SensitiveFlagItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SensitiveFlagItem | null>(null);

  // Details/Override UI state
  const [viewFlag, setViewFlag] = useState<SensitiveFlagItem | null>(null);
  const [addOverrideOpen, setAddOverrideOpen] = useState(false);
  const [editOverride, setEditOverride] = useState<AgentOverride | null>(null);
  const [deleteOverrideConfirm, setDeleteOverrideConfirm] = useState<AgentOverride | null>(null);

  // Override form state
  const [overrideAgentId, setOverrideAgentId] = useState('');
  const [overrideExempted, setOverrideExempted] = useState(false);
  const [overrideBehaviors, setOverrideBehaviors] = useState<BehaviorValue[]>([]);

  const resetOverrideForm = () => {
    setOverrideAgentId('');
    setOverrideExempted(false);
    setOverrideBehaviors([]);
  };

  // Query overrides when viewing a flag
  const overridesQuery = trpc.admin.sensitiveFlags.listOverrides.useQuery(
    { flagId: viewFlag?.id ?? '' },
    { enabled: !!viewFlag },
  );
  const overrides = useMemo(() => getOverrides(overridesQuery.data), [overridesQuery.data]);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [behaviorFilter, setBehaviorFilter] = useState<BehaviorFilter>('all');

  const form = useForm<CreateFlagValues>({
    resolver: zodResolver(createFlagSchema),
    defaultValues: {
      toolPatternEntry: { server: '*', tool: '*' },
      behaviors: [],
      description: '',
      rateLimitMaxPerSession: undefined,
      rateLimitWindowMinutes: undefined,
      approvalAllowedApprovers: [],
      approvalTimeoutSeconds: 300,
      alertWebhookEndpointIds: [],
    },
  });

  const watchedToolPatternEntry = form.watch('toolPatternEntry') ?? { server: '*', tool: '*' };
  const availableTools = getToolsForServer(watchedToolPatternEntry.server);

  // Check if a tool is already covered by an existing flag
  const isToolAlreadyFlagged = useMemo(() => {
    const enabledFlags = flagsData.filter((f) => f.enabled);
    return (serverKey: string, toolName: string): boolean => {
      const qualifiedName = `${serverKey}::${toolName}`;
      return enabledFlags.some((flag) => checkToolPattern(flag.toolPattern, qualifiedName));
    };
  }, [flagsData]);

  const watchedBehaviors = form.watch('behaviors');
  const watchedApprovers = form.watch('approvalAllowedApprovers');
  const watchedWebhooks = form.watch('alertWebhookEndpointIds');
  const hasRateLimit = watchedBehaviors?.includes('RATE_LIMIT') ?? false;
  const hasApproval = watchedBehaviors?.includes('REQUIRE_APPROVAL') ?? false;
  const hasAlert = watchedBehaviors?.includes('ALERT') ?? false;

  // Edit form state (separate from create form to avoid conflicts)
  const [editBehaviors, setEditBehaviors] = useState<BehaviorValue[]>([]);
  const [editDescription, setEditDescription] = useState('');
  const [editRateLimitMax, setEditRateLimitMax] = useState<number | undefined>(undefined);
  const [editRateLimitWindow, setEditRateLimitWindow] = useState<number | undefined>(undefined);
  const [editApprovers, setEditApprovers] = useState<Array<'session_owner' | 'admin'>>([]);
  const [editApprovalTimeout, setEditApprovalTimeout] = useState<number | undefined>(300);
  const [editWebhooks, setEditWebhooks] = useState<string[]>([]);

  const editHasRateLimit = editBehaviors.includes('RATE_LIMIT');
  const editHasApproval = editBehaviors.includes('REQUIRE_APPROVAL');
  const editHasAlert = editBehaviors.includes('ALERT');

  const openEditFlag = (flag: SensitiveFlagItem) => {
    // Validate behaviors from database match expected enum values
    const validatedBehaviors = flag.behaviors.filter(
      (b: string): b is BehaviorValue => behaviorSchema.safeParse(b).success,
    );
    setEditBehaviors(validatedBehaviors);
    setEditDescription(flag.description ?? '');

    // Parse rate limit config
    const rateLimitConfig = flag.rateLimitConfig as {
      maxPerSession?: number;
      windowMinutes?: number;
    } | null;
    setEditRateLimitMax(rateLimitConfig?.maxPerSession);
    setEditRateLimitWindow(rateLimitConfig?.windowMinutes);

    // Parse approval config
    const approvalConfig = flag.approvalConfig as {
      allowedApprovers?: string[];
      timeoutSeconds?: number;
    } | null;
    const approvers = (approvalConfig?.allowedApprovers ?? []).filter(
      (a: string): a is 'session_owner' | 'admin' => approverSchema.safeParse(a).success,
    );
    setEditApprovers(approvers);
    setEditApprovalTimeout(approvalConfig?.timeoutSeconds ?? 300);

    // Parse alert config
    const alertConfig = flag.alertConfig as { webhookEndpointIds?: string[] } | null;
    setEditWebhooks(alertConfig?.webhookEndpointIds ?? []);

    setEditFlag(flag);
  };

  const handleEditSave = () => {
    if (!editFlag || editBehaviors.length === 0) return;
    updateMutation.mutate(
      {
        id: editFlag.id,
        behaviors: editBehaviors,
        description: editDescription || undefined,
        rateLimitConfig:
          editHasRateLimit && editRateLimitMax && editRateLimitWindow
            ? { maxPerSession: editRateLimitMax, windowMinutes: editRateLimitWindow }
            : undefined,
        approvalConfig:
          editHasApproval && editApprovers.length > 0
            ? { allowedApprovers: editApprovers, timeoutSeconds: editApprovalTimeout ?? 300 }
            : undefined,
        alertConfig:
          editHasAlert && editWebhooks.length > 0
            ? { webhookEndpointIds: editWebhooks }
            : undefined,
      },
      {
        onSuccess: () => {
          setEditFlag(null);
        },
      },
    );
  };

  const toggleEditBehavior = (behavior: BehaviorValue) => {
    setEditBehaviors((prev) =>
      prev.includes(behavior) ? prev.filter((v) => v !== behavior) : [...prev, behavior],
    );
  };

  // Filtering logic
  const filteredFlags = useMemo(() => {
    return flagsData.filter((flag: SensitiveFlagItem) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !flag.toolPattern.toLowerCase().includes(query) &&
          !(flag.description?.toLowerCase().includes(query) ?? false)
        ) {
          return false;
        }
      }
      // Status filter
      if (statusFilter === 'enabled' && !flag.enabled) return false;
      if (statusFilter === 'disabled' && flag.enabled) return false;
      // Behavior filter
      if (behaviorFilter !== 'all' && !flag.behaviors.includes(behaviorFilter)) return false;
      return true;
    });
  }, [flagsData, searchQuery, statusFilter, behaviorFilter]);

  // Active filter count
  const activeFilterCount = [statusFilter !== 'all', behaviorFilter !== 'all'].filter(
    Boolean,
  ).length;

  const hasActiveFilters = activeFilterCount > 0 || searchQuery.length > 0;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setBehaviorFilter('all');
  };

  const toggleBehavior = (behavior: BehaviorValue) => {
    const current = watchedBehaviors || [];
    const newValue = current.includes(behavior)
      ? current.filter((v) => v !== behavior)
      : [...current, behavior];
    form.setValue('behaviors', newValue);
  };

  const handleCreate = form.handleSubmit((values) => {
    const toolPattern = toolPatternFromUI(
      values.toolPatternEntry.server,
      values.toolPatternEntry.tool,
    );
    createMutation.mutate({
      toolPattern,
      behaviors: values.behaviors,
      description: values.description || undefined,
      rateLimitConfig:
        hasRateLimit && values.rateLimitMaxPerSession && values.rateLimitWindowMinutes
          ? {
              maxPerSession: values.rateLimitMaxPerSession,
              windowMinutes: values.rateLimitWindowMinutes,
            }
          : undefined,
      approvalConfig:
        hasApproval && values.approvalAllowedApprovers && values.approvalAllowedApprovers.length > 0
          ? {
              allowedApprovers: values.approvalAllowedApprovers,
              timeoutSeconds: values.approvalTimeoutSeconds || 300,
            }
          : undefined,
      alertConfig:
        hasAlert && values.alertWebhookEndpointIds && values.alertWebhookEndpointIds.length > 0
          ? {
              webhookEndpointIds: values.alertWebhookEndpointIds,
            }
          : undefined,
    });
  });

  const handleToggleEnabled = (flag: SensitiveFlagItem, enabled: boolean) => {
    updateMutation.mutate({ id: flag.id, enabled });
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    deleteMutation.mutate({ id: deleteConfirm.id });
  };

  const handleCreateOverride = () => {
    if (!viewFlag || !overrideAgentId) return;
    createOverrideMutation.mutate({
      flagId: viewFlag.id,
      agentId: overrideAgentId,
      exempted: overrideExempted,
      behaviors: overrideExempted ? undefined : overrideBehaviors,
    });
  };

  const handleUpdateOverride = () => {
    if (!editOverride) return;
    updateOverrideMutation.mutate({
      id: editOverride.id,
      exempted: overrideExempted,
      behaviors: overrideExempted ? undefined : overrideBehaviors,
    });
  };

  const handleDeleteOverride = () => {
    if (!deleteOverrideConfirm) return;
    deleteOverrideMutation.mutate({ id: deleteOverrideConfirm.id });
  };

  const openEditOverride = (override: AgentOverride) => {
    setOverrideExempted(override.exempted);
    // Validate behaviors from database match expected enum values
    const validatedBehaviors = override.behaviors.filter(
      (b: string): b is BehaviorValue => behaviorSchema.safeParse(b).success,
    );
    setOverrideBehaviors(validatedBehaviors);
    setEditOverride(override);
  };

  // Get agents that don't already have overrides for the current flag
  const availableAgentsForOverride = useMemo(() => {
    const existingAgentIds = new Set(overrides.map((o) => o.agentId));
    return agents.filter((a) => !existingAgentIds.has(a.id));
  }, [agents, overrides]);

  const errors = useMutationErrors([flagsQuery, createMutation, updateMutation, deleteMutation]);

  return (
    <ToolsPageLayout>
      <div className="space-y-8">
        <PageHeader
          title="Tool Flags"
          description="Flag sensitive tools for extra scrutiny after policy passes. Approvals are managed from the Dashboard."
        />

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load sensitive flags</AlertTitle>
            <AlertDescription>{errors[0]?.message}</AlertDescription>
          </Alert>
        )}

        {/* Search and Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1 w-full sm:w-auto">
            <Input
              placeholder="Search by tool pattern or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>
          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Create flag</Button>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {searchQuery && (
              <Badge variant="secondary" className="gap-1">
                Search: {searchQuery}
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-1 hover:text-foreground"
                  aria-label="Clear search"
                >
                  &times;
                </button>
              </Badge>
            )}
            {statusFilter !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                Status: {statusFilter}
                <button
                  onClick={() => setStatusFilter('all')}
                  className="ml-1 hover:text-foreground"
                  aria-label="Clear status filter"
                >
                  &times;
                </button>
              </Badge>
            )}
            {behaviorFilter !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                Behavior:{' '}
                {BEHAVIOR_OPTIONS.find((o) => o.value === behaviorFilter)?.label || behaviorFilter}
                <button
                  onClick={() => setBehaviorFilter('all')}
                  className="ml-1 hover:text-foreground"
                  aria-label="Clear behavior filter"
                >
                  &times;
                </button>
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              Showing {filteredFlags.length} of {flagsData.length}
            </span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Sensitive Tool Flags</CardTitle>
            <CardDescription>Tools flagged for additional security measures.</CardDescription>
          </CardHeader>
          <CardContent>
            {flagsQuery.isPending ? (
              <TableSkeleton />
            ) : filteredFlags.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool Pattern</TableHead>
                    <TableHead>Behaviors</TableHead>
                    <TableHead>Overrides</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFlags.map((flag) => (
                    <TableRow key={flag.id} className={cn(!flag.enabled && 'opacity-50')}>
                      <TableCell className="font-mono text-sm">
                        {getToolFriendlyName(flag.toolPattern, mcpServers)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {flag.behaviors
                            .map((b: string) => {
                              const option = BEHAVIOR_OPTIONS.find((o) => o.value === b);
                              return option?.label || b;
                            })
                            .join(', ') || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {flag._count?.agentOverrides ? (
                          <Badge variant="outline" className="text-xs">
                            {flag._count.agentOverrides} agent
                            {flag._count.agentOverrides !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {flag.description || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={flag.enabled}
                            onCheckedChange={(enabled) => handleToggleEnabled(flag, enabled)}
                            disabled={updateMutation.isPending}
                          />
                          <span className="text-sm text-muted-foreground">
                            {flag.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatShortDate(flag.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setViewFlag(flag)}>
                          View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEditFlag(flag)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(flag)}
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : hasActiveFilters ? (
              <EmptyState
                title="No flags match filters"
                description="Try adjusting your search or filter criteria."
              />
            ) : (
              <EmptyState
                title="No sensitive flags"
                description="Create a flag to add extra scrutiny to sensitive tools."
              />
            )}
          </CardContent>
        </Card>

        {/* Filters Dialog */}
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter Flags</DialogTitle>
              <DialogDescription>Narrow down the list of sensitive flags.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    if (isStatusFilter(value)) setStatusFilter(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Behavior</Label>
                <Select
                  value={behaviorFilter}
                  onValueChange={(value) => {
                    if (isBehaviorFilter(value)) setBehaviorFilter(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Behaviors</SelectItem>
                    {BEHAVIOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Sensitive Flag</DialogTitle>
              <DialogDescription>
                Flag a tool pattern for additional security measures. Flagged tools will require
                extra scrutiny even after passing policy checks.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-6" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label>Tool Pattern</Label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Select
                      value={watchedToolPatternEntry.server}
                      onValueChange={(server) => {
                        form.setValue(
                          'toolPatternEntry',
                          { server, tool: '*' },
                          { shouldValidate: true },
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select server" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All servers</SelectItem>
                        {mcpServers?.map((s) => {
                          const url = new URL(s.url);
                          const key = `${url.hostname}${url.port ? ':' + url.port : ''}`;
                          return (
                            <SelectItem key={s.id} value={key}>
                              {s.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <span className="text-muted-foreground">::</span>

                  <div className="flex-1">
                    <Select
                      value={watchedToolPatternEntry.tool}
                      onValueChange={(tool) => {
                        form.setValue(
                          'toolPatternEntry',
                          { ...watchedToolPatternEntry, tool },
                          { shouldValidate: true },
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select tool" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All tools</SelectItem>
                        {availableTools.map((t) => {
                          const alreadyFlagged =
                            watchedToolPatternEntry.server !== '*' &&
                            isToolAlreadyFlagged(watchedToolPatternEntry.server, t.name);
                          return (
                            <SelectItem key={t.id} value={t.name}>
                              <div className="flex items-center gap-2">
                                <span>{t.name}</span>
                                {alreadyFlagged && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  >
                                    Flagged
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select server and tool. Use &quot;All servers&quot; or &quot;All tools&quot; for
                  wildcards.
                </p>
                {form.formState.errors.toolPatternEntry && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.toolPatternEntry.server?.message ||
                      form.formState.errors.toolPatternEntry.tool?.message ||
                      'Invalid tool pattern'}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label>Behaviors</Label>
                <p className="text-sm text-muted-foreground">
                  Select the security measures to apply to matching tools.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {BEHAVIOR_OPTIONS.map((option) => {
                    const isSelected = watchedBehaviors?.includes(option.value) ?? false;
                    return (
                      <div
                        key={option.value}
                        onClick={() => toggleBehavior(option.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleBehavior(option.value);
                          }
                        }}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150',
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border hover:border-muted-foreground/30 hover:bg-accent/50',
                        )}
                      >
                        <div
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/40',
                          )}
                        >
                          {isSelected && (
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium leading-tight">{option.label}</div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {form.formState.errors.behaviors && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.behaviors.message}
                  </p>
                )}
              </div>

              {hasRateLimit && (
                <div className="space-y-3 rounded-lg border p-4">
                  <Label className="text-sm font-medium">Rate Limit Configuration</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="maxPerSession" className="text-xs text-muted-foreground">
                        Max per session
                      </Label>
                      <Input
                        id="maxPerSession"
                        type="number"
                        min="1"
                        placeholder="10"
                        {...form.register('rateLimitMaxPerSession', { valueAsNumber: true })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="windowMinutes" className="text-xs text-muted-foreground">
                        Window (minutes)
                      </Label>
                      <Input
                        id="windowMinutes"
                        type="number"
                        min="1"
                        placeholder="60"
                        {...form.register('rateLimitWindowMinutes', { valueAsNumber: true })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {hasApproval && (
                <div className="space-y-3 rounded-lg border p-4">
                  <Label className="text-sm font-medium">Approval Configuration</Label>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Allowed Approvers</Label>
                      <div className="flex gap-4">
                        <Label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={watchedApprovers?.includes('session_owner')}
                            onCheckedChange={(checked) => {
                              const current = watchedApprovers || [];
                              const SESSION_OWNER = 'session_owner' as const;
                              const newValue = checked
                                ? [...current, SESSION_OWNER]
                                : current.filter((v) => v !== SESSION_OWNER);
                              form.setValue('approvalAllowedApprovers', newValue);
                            }}
                          />
                          Session Owner
                        </Label>
                        <Label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={watchedApprovers?.includes('admin')}
                            onCheckedChange={(checked) => {
                              const current = watchedApprovers || [];
                              const ADMIN = 'admin' as const;
                              const newValue = checked
                                ? [...current, ADMIN]
                                : current.filter((v) => v !== ADMIN);
                              form.setValue('approvalAllowedApprovers', newValue);
                            }}
                          />
                          Admin
                        </Label>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="timeoutSeconds" className="text-xs text-muted-foreground">
                        Timeout (seconds)
                      </Label>
                      <Input
                        id="timeoutSeconds"
                        type="number"
                        min="1"
                        placeholder="300"
                        {...form.register('approvalTimeoutSeconds', { valueAsNumber: true })}
                      />
                      <p className="text-xs text-muted-foreground">
                        How long to wait for approval before denying automatically
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {hasAlert && (
                <div className="space-y-3 rounded-lg border p-4">
                  <Label className="text-sm font-medium">Alert Configuration</Label>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Webhook Endpoints</Label>
                    <p className="text-xs text-muted-foreground">
                      Select which webhooks should receive alerts when this tool is invoked.
                    </p>
                    {webhooksQuery.isPending ? (
                      <p className="text-sm text-muted-foreground">Loading webhooks...</p>
                    ) : webhooksQuery.data && webhooksQuery.data.length > 0 ? (
                      <div className="space-y-2">
                        {webhooksQuery.data.map((webhook) => (
                          <Label
                            key={webhook.id}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <Checkbox
                              checked={watchedWebhooks?.includes(webhook.id)}
                              onCheckedChange={(checked) => {
                                const current = watchedWebhooks || [];
                                const newValue = checked
                                  ? [...current, webhook.id]
                                  : current.filter((v) => v !== webhook.id);
                                form.setValue('alertWebhookEndpointIds', newValue);
                              }}
                            />
                            <span>{webhook.name}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {webhook.url}
                            </span>
                          </Label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No webhooks configured.{' '}
                        <Link to={`${adminPrefix}/webhooks`} className="text-primary underline">
                          Create one first
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Why is this tool flagged? What should approvers know?"
                  {...form.register('description')}
                />
              </div>

              {createMutation.error && (
                <Alert variant="destructive">
                  <AlertTitle>Failed to create flag</AlertTitle>
                  <AlertDescription>{createMutation.error.message}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create flag'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Delete Sensitive Flag</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the flag for{' '}
                <span className="font-mono">
                  {deleteConfirm ? getToolFriendlyName(deleteConfirm.toolPattern, mcpServers) : ''}
                </span>
                ? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Flag Dialog */}
        <Dialog open={!!editFlag} onOpenChange={() => setEditFlag(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Sensitive Flag</DialogTitle>
              <DialogDescription>
                Update the behaviors and configuration for{' '}
                <span className="font-mono">{editFlag?.toolPattern}</span>.
              </DialogDescription>
            </DialogHeader>

            {editFlag && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Behaviors</Label>
                  <p className="text-sm text-muted-foreground">
                    Select the security measures to apply to matching tools.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {BEHAVIOR_OPTIONS.map((option) => {
                      const isSelected = editBehaviors.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          onClick={() => toggleEditBehavior(option.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleEditBehavior(option.value);
                            }
                          }}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150',
                            isSelected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border hover:border-muted-foreground/30 hover:bg-accent/50',
                          )}
                        >
                          <div
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/40',
                            )}
                          >
                            {isSelected && (
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium leading-tight">{option.label}</div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                              {option.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {editBehaviors.length === 0 && (
                    <p className="text-xs text-destructive">Select at least one behavior</p>
                  )}
                </div>

                {editHasRateLimit && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <Label className="text-sm font-medium">Rate Limit Configuration</Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-maxPerSession"
                          className="text-xs text-muted-foreground"
                        >
                          Max per session
                        </Label>
                        <Input
                          id="edit-maxPerSession"
                          type="number"
                          min="1"
                          placeholder="10"
                          value={editRateLimitMax ?? ''}
                          onChange={(e) =>
                            setEditRateLimitMax(e.target.value ? Number(e.target.value) : undefined)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-windowMinutes"
                          className="text-xs text-muted-foreground"
                        >
                          Window (minutes)
                        </Label>
                        <Input
                          id="edit-windowMinutes"
                          type="number"
                          min="1"
                          placeholder="60"
                          value={editRateLimitWindow ?? ''}
                          onChange={(e) =>
                            setEditRateLimitWindow(
                              e.target.value ? Number(e.target.value) : undefined,
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editHasApproval && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <Label className="text-sm font-medium">Approval Configuration</Label>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Allowed Approvers</Label>
                        <div className="flex gap-4">
                          <Label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={editApprovers.includes('session_owner')}
                              onCheckedChange={(checked) => {
                                setEditApprovers((prev) =>
                                  checked
                                    ? [...prev, 'session_owner']
                                    : prev.filter((v) => v !== 'session_owner'),
                                );
                              }}
                            />
                            Session Owner
                          </Label>
                          <Label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={editApprovers.includes('admin')}
                              onCheckedChange={(checked) => {
                                setEditApprovers((prev) =>
                                  checked ? [...prev, 'admin'] : prev.filter((v) => v !== 'admin'),
                                );
                              }}
                            />
                            Admin
                          </Label>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-timeoutSeconds"
                          className="text-xs text-muted-foreground"
                        >
                          Timeout (seconds)
                        </Label>
                        <Input
                          id="edit-timeoutSeconds"
                          type="number"
                          min="1"
                          placeholder="300"
                          value={editApprovalTimeout ?? ''}
                          onChange={(e) =>
                            setEditApprovalTimeout(
                              e.target.value ? Number(e.target.value) : undefined,
                            )
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          How long to wait for approval before denying automatically
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {editHasAlert && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <Label className="text-sm font-medium">Alert Configuration</Label>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Webhook Endpoints</Label>
                      <p className="text-xs text-muted-foreground">
                        Select which webhooks should receive alerts when this tool is invoked.
                      </p>
                      {webhooksQuery.isPending ? (
                        <p className="text-sm text-muted-foreground">Loading webhooks...</p>
                      ) : webhooksQuery.data && webhooksQuery.data.length > 0 ? (
                        <div className="space-y-2">
                          {webhooksQuery.data.map((webhook) => (
                            <Label
                              key={webhook.id}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <Checkbox
                                checked={editWebhooks.includes(webhook.id)}
                                onCheckedChange={(checked) => {
                                  setEditWebhooks((prev) =>
                                    checked
                                      ? [...prev, webhook.id]
                                      : prev.filter((v) => v !== webhook.id),
                                  );
                                }}
                              />
                              <span>{webhook.name}</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {webhook.url}
                              </span>
                            </Label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No webhooks configured.{' '}
                          <Link to={`${adminPrefix}/webhooks`} className="text-primary underline">
                            Create one first
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description (optional)</Label>
                  <Textarea
                    id="edit-description"
                    placeholder="Why is this tool flagged? What should approvers know?"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>

                {updateMutation.error && (
                  <Alert variant="destructive">
                    <AlertTitle>Failed to update flag</AlertTitle>
                    <AlertDescription>{updateMutation.error.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFlag(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleEditSave}
                disabled={updateMutation.isPending || editBehaviors.length === 0}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Flag Details Dialog */}
        <Dialog open={!!viewFlag} onOpenChange={() => setViewFlag(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Flag Details</DialogTitle>
              <DialogDescription>
                View and manage agent overrides for this sensitive flag.
              </DialogDescription>
            </DialogHeader>

            {viewFlag && (
              <div className="space-y-6">
                {/* Flag Info */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tool Pattern</Label>
                    <p className="font-mono text-sm">
                      {getToolFriendlyName(viewFlag.toolPattern, mcpServers)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Behaviors</Label>
                    <p className="text-sm mt-1">
                      {viewFlag.behaviors
                        .map((b: string) => {
                          const option = BEHAVIOR_OPTIONS.find((o) => o.value === b);
                          return option?.label || b;
                        })
                        .join(', ') || '-'}
                    </p>
                  </div>
                  {viewFlag.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <p className="text-sm">{viewFlag.description}</p>
                    </div>
                  )}
                </div>

                {/* Agent Overrides Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Agent Overrides</Label>
                    <Button
                      size="sm"
                      onClick={() => {
                        resetOverrideForm();
                        setAddOverrideOpen(true);
                      }}
                      disabled={availableAgentsForOverride.length === 0}
                    >
                      Add Override
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Override default behaviors for specific agents. Exempted agents bypass this flag
                    entirely.
                  </p>

                  {overridesQuery.isPending ? (
                    <div className="text-sm text-muted-foreground">Loading overrides...</div>
                  ) : overrides.length > 0 ? (
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Agent</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Behaviors</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overrides.map((override) => (
                            <TableRow key={override.id}>
                              <TableCell className="font-medium">{override.agent.name}</TableCell>
                              <TableCell>
                                {override.exempted ? (
                                  <Badge variant="outline" className="text-green-600">
                                    Exempted
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Custom</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {override.exempted ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : override.behaviors.length > 0 ? (
                                  <span className="text-sm">
                                    {override.behaviors
                                      .map((b) => {
                                        const option = BEHAVIOR_OPTIONS.find((o) => o.value === b);
                                        return option?.label || b;
                                      })
                                      .join(', ')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    No behaviors
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditOverride(override)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteOverrideConfirm(override)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No agent overrides configured. All agents use the default behaviors.
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setViewFlag(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Override Dialog */}
        <Dialog open={addOverrideOpen} onOpenChange={setAddOverrideOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Agent Override</DialogTitle>
              <DialogDescription>
                Configure custom behavior for a specific agent on this flag.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select value={overrideAgentId} onValueChange={setOverrideAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgentsForOverride.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableAgentsForOverride.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    All agents already have overrides for this flag.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="exempted"
                    checked={overrideExempted}
                    onCheckedChange={(checked) => setOverrideExempted(checked === true)}
                  />
                  <Label htmlFor="exempted" className="cursor-pointer">
                    Exempt this agent
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exempted agents bypass this sensitive flag entirely.
                </p>
              </div>

              {!overrideExempted && (
                <div className="space-y-2">
                  <Label>Custom Behaviors</Label>
                  <p className="text-xs text-muted-foreground">
                    Select behaviors to apply instead of the default. Leave empty to remove all
                    behaviors.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {BEHAVIOR_OPTIONS.map((option) => {
                      const isSelected = overrideBehaviors.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          onClick={() => {
                            setOverrideBehaviors((prev) =>
                              isSelected
                                ? prev.filter((v) => v !== option.value)
                                : [...prev, option.value],
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setOverrideBehaviors((prev) =>
                                isSelected
                                  ? prev.filter((v) => v !== option.value)
                                  : [...prev, option.value],
                              );
                            }
                          }}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          className={cn(
                            'flex items-start gap-2 p-2 rounded border cursor-pointer text-sm',
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/30',
                          )}
                        >
                          <div
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/40',
                            )}
                          >
                            {isSelected && (
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span>{option.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {createOverrideMutation.error && (
                <Alert variant="destructive">
                  <AlertTitle>Failed to create override</AlertTitle>
                  <AlertDescription>{createOverrideMutation.error.message}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOverrideOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateOverride}
                disabled={!overrideAgentId || createOverrideMutation.isPending}
              >
                {createOverrideMutation.isPending ? 'Creating...' : 'Create Override'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Override Dialog */}
        <Dialog open={!!editOverride} onOpenChange={() => setEditOverride(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Override</DialogTitle>
              <DialogDescription>
                Update the override for {editOverride?.agent.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-exempted"
                    checked={overrideExempted}
                    onCheckedChange={(checked) => setOverrideExempted(checked === true)}
                  />
                  <Label htmlFor="edit-exempted" className="cursor-pointer">
                    Exempt this agent
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exempted agents bypass this sensitive flag entirely.
                </p>
              </div>

              {!overrideExempted && (
                <div className="space-y-2">
                  <Label>Custom Behaviors</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {BEHAVIOR_OPTIONS.map((option) => {
                      const isSelected = overrideBehaviors.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          onClick={() => {
                            setOverrideBehaviors((prev) =>
                              isSelected
                                ? prev.filter((v) => v !== option.value)
                                : [...prev, option.value],
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setOverrideBehaviors((prev) =>
                                isSelected
                                  ? prev.filter((v) => v !== option.value)
                                  : [...prev, option.value],
                              );
                            }
                          }}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          className={cn(
                            'flex items-start gap-2 p-2 rounded border cursor-pointer text-sm',
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/30',
                          )}
                        >
                          <div
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/40',
                            )}
                          >
                            {isSelected && (
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span>{option.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {updateOverrideMutation.error && (
                <Alert variant="destructive">
                  <AlertTitle>Failed to update override</AlertTitle>
                  <AlertDescription>{updateOverrideMutation.error.message}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOverride(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateOverride} disabled={updateOverrideMutation.isPending}>
                {updateOverrideMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Override Confirmation */}
        <Dialog open={!!deleteOverrideConfirm} onOpenChange={() => setDeleteOverrideConfirm(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Delete Override</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the override for{' '}
                <span className="font-medium">{deleteOverrideConfirm?.agent.name}</span>? The agent
                will use the default flag behaviors.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOverrideConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteOverride}
                disabled={deleteOverrideMutation.isPending}
              >
                {deleteOverrideMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ToolsPageLayout>
  );
}
