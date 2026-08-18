import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight, Globe } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';

import {
  DeleteConfirmDialog,
  PolicyFormModal,
  RequestExceptionButton,
  type PolicyFormValues,
} from '../../components/policy';
import {
  type CategoryOption,
  type OperatorGroups,
  type PolicyConditions,
} from '../../components/policy/ConditionBuilder';
import { TagFilterSelector } from '../../components/policy/TagFilterSelector';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import {
  hasValidMatchers,
  hasValidToolPatterns,
  matcherFromUI,
  normalizeConditions,
  safeMatcherToUI,
  safeToolPatternToUI,
  toolPatternFromUI,
  type MatcherEntry,
  type MatcherType,
  type ToolPatternEntry,
} from '../../lib/policyUtils';
import { cn } from '../../lib/utils';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { PolicyPageLayout } from '../../components/layout/PolicyPageLayout';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
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
import { Checkbox } from '../../components/ui/checkbox';
import { DeleteConfirmDialog as ConfirmDialog } from '../../components/ui/delete-confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InheritedBadge } from '../../components/ui/InheritedBadge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { formatShortDate } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const effectOptions = ['ALLOW', 'DENY'] as const;
type EffectFilter = 'all' | (typeof effectOptions)[number];
type StatusFilter = 'all' | 'enabled' | 'disabled';

// Type guards for filter values
const EFFECT_FILTER_SET: ReadonlySet<string> = new Set<EffectFilter>(['all', 'ALLOW', 'DENY']);
function isEffectFilter(value: string): value is EffectFilter {
  return EFFECT_FILTER_SET.has(value);
}

const STATUS_FILTER_SET: ReadonlySet<string> = new Set<StatusFilter>([
  'all',
  'enabled',
  'disabled',
]);
function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTER_SET.has(value);
}

const MATCHER_TYPE_SET: ReadonlySet<string> = new Set<MatcherType>([
  'all',
  'user',
  'role',
  'agent',
]);
function isMatcherType(value: string): value is MatcherType {
  return MATCHER_TYPE_SET.has(value);
}

// Prefill data from permission request navigation
interface PrefillRequestData {
  requestId: string;
  userEmail: string;
  toolNames: string[];
  reason: string | null;
  createdAt: string;
}

function isPrefillRequestData(value: unknown): value is PrefillRequestData {
  if (!value || typeof value !== 'object') return false;
  return (
    'requestId' in value &&
    typeof value.requestId === 'string' &&
    'userEmail' in value &&
    typeof value.userEmail === 'string' &&
    'toolNames' in value &&
    Array.isArray(value.toolNames)
  );
}

// Form schemas
const matcherEntrySchema = z.object({
  type: z.enum(['all', 'user', 'role', 'agent']),
  value: z.string(),
});

const toolPatternEntrySchema = z.object({
  server: z.string().min(1, 'Server is required'),
  tool: z.string().min(1, 'Tool is required'),
});

// Condition operators (must match ConditionOperator type)
const conditionOperators = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'matches',
  'lessThan',
  'greaterThan',
  'between',
  'in',
  'notIn',
  'containsAny',
  'containsNone',
  'exists',
  'notExists',
  'inCidr',
  'notInCidr',
] as const;

// Conditions schema for form - flat array of conditions
const conditionsSchema = z
  .array(
    z.object({
      field: z.string(),
      operator: z.enum(conditionOperators),
      value: z.unknown().optional(),
      valueRef: z.string().optional(), // Global variable reference "NAMESPACE.fieldName"
    }),
  )
  .nullable();

const policyFormSchema = z
  .object({
    matchers: z.array(matcherEntrySchema).min(1, 'At least one matcher is required'),
    toolPatterns: z.array(toolPatternEntrySchema).min(1, 'At least one tool pattern is required'),
    effect: z.enum(effectOptions),
    description: z.string().min(4, 'Add a short description.'),
    enabled: z.boolean(),
    conditions: conditionsSchema.optional(),
  })
  .refine((data) => data.matchers.every((m) => m.type === 'all' || m.value.length > 0), {
    message: 'Please select a user, role, or agent for each matcher.',
    path: ['matchers'],
  });

// Local type for old form (schema alignment)
type LocalPolicyFormValues = z.infer<typeof policyFormSchema>;

const DEFAULT_CREATE_VALUES: LocalPolicyFormValues = {
  matchers: [{ type: 'role', value: '' }],
  toolPatterns: [],
  effect: 'ALLOW',
  description: '',
  enabled: true,
  conditions: null,
};

const DEFAULT_UPDATE_VALUES: LocalPolicyFormValues = {
  matchers: [{ type: 'all', value: '' }],
  toolPatterns: [],
  effect: 'ALLOW',
  description: '',
  enabled: true,
  conditions: null,
};

export default function AdminPolicies() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedWorkspaceId, selectedWorkspace, workspaces, isOrgOwner, isGlobalView } =
    useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspace?.slug) return `/admin/${selectedWorkspace.slug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspace?.slug, isGlobalView]);

  // Prefill state from permission request navigation
  const prefillFromState = location.state?.prefillFromRequest;
  const initialPrefillData = isPrefillRequestData(prefillFromState) ? prefillFromState : undefined;
  const [prefillRequest, setPrefillRequest] = useState<PrefillRequestData | null>(
    initialPrefillData ?? null,
  );
  const prefillProcessedRef = useRef(false);

  // Clear navigation state immediately after reading it
  useEffect(() => {
    if (location.state?.openCreateModal) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const utils = trpc.useUtils();
  const policiesQuery = trpc.admin.policies.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const usersQuery = trpc.admin.users.list.useQuery();
  const rolesQuery = trpc.admin.roles.list.useQuery();
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  // Condition builder queries
  const categoriesQuery = trpc.admin.conditions.getCategories.useQuery();
  const operatorsQuery = trpc.admin.conditions.getOperators.useQuery();

  // Use shared MCP servers hook - pass workspace context
  const {
    mcpServers,
    a2aAgents,
    getServerNameForDisplay,
    getToolsForServer,
    isToolFlagged,
    getToolFlagCountsForServer,
    toolFlagData,
  } = useMcpServers({ workspaceId: selectedWorkspaceId });

  type Policy = NonNullable<typeof policiesQuery.data>[number];

  // Assertion warnings state
  interface AssertionWarning {
    assertionId: string;
    assertionName: string;
    expected: string;
    actual: string;
    justification?: string | null;
  }
  const [assertionWarnings, setAssertionWarnings] = useState<AssertionWarning[]>([]);

  // Pre-save assertion preview state
  interface PreviewFailure {
    assertionId: string;
    assertionName: string;
    expected: string;
    actual: string;
    justification: string | null;
  }
  interface PendingPolicyData {
    type: 'create' | 'update';
    matchers: string[];
    toolPatterns: string[];
    effect: 'ALLOW' | 'DENY';
    description: string;
    enabled: boolean;
    linkedRequestId?: string;
    policyId?: string;
    conditions?: PolicyConditions | null;
    conditionsTree?: unknown;
    conditionMode?: 'SIMPLE' | 'ADVANCED';
    conditionExpression?: string;
    workspaceId?: string | null;
    tagIds?: string[];
  }
  const [pendingPolicy, setPendingPolicy] = useState<PendingPolicyData | null>(null);
  const [previewFailures, setPreviewFailures] = useState<PreviewFailure[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const previewMutation = trpc.admin.policyAssertions.previewImpact.useMutation();

  const [deleteConfirm, setDeleteConfirm] = useState<Policy | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [effectFilter, setEffectFilter] = useState<EffectFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [matcherTypeFilter, setMatcherTypeFilter] = useState<MatcherType>('all');
  const [specificUserId, setSpecificUserId] = useState('');
  const [specificRoleId, setSpecificRoleId] = useState('');
  const [filterServer, setFilterServer] = useState('*');
  const [filterTool, setFilterTool] = useState('*');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const createMutation = trpc.admin.policies.create.useMutation({
    onSuccess: (result) => {
      utils.admin.policies.list.invalidate();
      utils.user.tools.list.invalidate();
      if (result.assertionWarnings && result.assertionWarnings.length > 0) {
        setAssertionWarnings(result.assertionWarnings);
      }
    },
  });

  const updateMutation = trpc.admin.policies.update.useMutation({
    onMutate: async (input) => {
      await utils.admin.policies.list.cancel();
      const previous = utils.admin.policies.list.getData();
      utils.admin.policies.list.setData(undefined, (current) => {
        if (!current) return current;
        return current.map((policy) => {
          if (policy.id !== input.id) return policy;
          // Extract and transform fields for optimistic update
          const { id: _id, conditions, ...rest } = input;
          return {
            ...policy,
            ...rest,
            // Handle conditions type compatibility - the API accepts Record<string, unknown>
            // but policy data stores it as JSON value
            ...(conditions !== undefined && { conditions: conditions as typeof policy.conditions }),
          };
        });
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.admin.policies.list.setData(undefined, context.previous);
      }
    },
    onSuccess: (result) => {
      if (result.assertionWarnings && result.assertionWarnings.length > 0) {
        setAssertionWarnings(result.assertionWarnings);
      }
    },
    onSettled: () => {
      utils.admin.policies.list.invalidate();
      utils.user.tools.list.invalidate();
    },
  });

  const deleteMutation = trpc.admin.policies.delete.useMutation({
    onSuccess: (result) => {
      utils.admin.policies.list.invalidate();
      utils.user.tools.list.invalidate();
      setDeleteConfirm(null);
      if (result.assertionWarnings && result.assertionWarnings.length > 0) {
        setAssertionWarnings(result.assertionWarnings);
      }
    },
  });

  const deletionImpactQuery = trpc.admin.policies.getDeletionImpact.useQuery(
    { id: deleteConfirm?.id || '' },
    { enabled: Boolean(deleteConfirm) },
  );

  const [createPolicyOpen, setCreatePolicyOpen] = useState(() => {
    return Boolean(location.state?.openCreateModal);
  });
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<Policy | null>(null);
  const [updatingPolicyIds, setUpdatingPolicyIds] = useState<Set<string>>(() => new Set());

  // Workspace grouping state (for "All Workspaces" view)
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    () => new Set(['global']),
  );

  // Global policies section expanded state (for workspace-specific view)
  const [globalPoliciesExpanded, setGlobalPoliciesExpanded] = useState(true);

  // Bulk selection state
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<Set<string>>(() => new Set());
  const [bulkAssignTagsOpen, setBulkAssignTagsOpen] = useState(false);
  const [selectedBulkTagId, setSelectedBulkTagId] = useState<string>('');
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkEnableConfirmOpen, setBulkEnableConfirmOpen] = useState(false);
  const [bulkDisableConfirmOpen, setBulkDisableConfirmOpen] = useState(false);

  // Policy tags queries
  const tagsQuery = trpc.admin.policyTags.list.useQuery();

  // Bulk action mutations
  const bulkEnableMutation = trpc.admin.policies.bulkEnable.useMutation({
    onSuccess: () => {
      utils.admin.policies.list.invalidate();
      setSelectedPolicyIds(new Set());
      setBulkEnableConfirmOpen(false);
    },
  });
  const bulkDisableMutation = trpc.admin.policies.bulkDisable.useMutation({
    onSuccess: () => {
      utils.admin.policies.list.invalidate();
      setSelectedPolicyIds(new Set());
      setBulkDisableConfirmOpen(false);
    },
  });
  const bulkDeleteMutation = trpc.admin.policies.bulkDelete.useMutation({
    onSuccess: () => {
      utils.admin.policies.list.invalidate();
      setSelectedPolicyIds(new Set());
      setBulkDeleteConfirmOpen(false);
    },
  });
  const bulkAssignTagsMutation = trpc.admin.policies.bulkAssignTags.useMutation({
    onSuccess: () => {
      utils.admin.policies.list.invalidate();
      setSelectedPolicyIds(new Set());
      setBulkAssignTagsOpen(false);
      setSelectedBulkTagId('');
    },
  });

  // Create tag mutation for inline tag creation in policy modal
  const createTagMutation = trpc.admin.policyTags.create.useMutation({
    onSuccess: () => {
      utils.admin.policyTags.list.invalidate();
    },
  });

  // Handler for inline tag creation - returns the created tag for immediate selection
  const handleCreateTag = async (tag: {
    name: string;
    description?: string;
    color: string;
    workspaceId?: string | null;
  }) => {
    const created = await createTagMutation.mutateAsync({
      name: tag.name,
      description: tag.description,
      color: tag.color,
      workspaceId: tag.workspaceId,
    });
    return created;
  };

  // Tag filter state
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const createForm = useForm<LocalPolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: DEFAULT_CREATE_VALUES,
  });

  const updateForm = useForm<LocalPolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: DEFAULT_UPDATE_VALUES,
  });

  // Get filter display values
  const selectedFilterServer = mcpServers?.find((s) => {
    if (filterServer === '*' || filterServer.startsWith('a2a:')) return false;
    const url = new URL(s.url);
    const domain = url.hostname;
    const port = url.port ? `:${url.port}` : '';
    return `${domain}${port}` === filterServer;
  });

  const selectedFilterA2AAgent = filterServer.startsWith('a2a:')
    ? a2aAgents?.find((a) => a.id === filterServer.slice(4))
    : null;

  const handleFilterServerChange = (value: string) => {
    setFilterServer(value);
    setFilterTool('*');
  };

  const availableFilterTools = getToolsForServer(filterServer);

  // Reset update form when editing policy changes
  useEffect(() => {
    if (editingPolicy) {
      // Safely convert matchers, using defaults for malformed entries
      const matchersUI: MatcherEntry[] = [];
      if (hasValidMatchers(editingPolicy.matchers)) {
        for (const m of editingPolicy.matchers) {
          const result = safeMatcherToUI(m);
          if (result.success) {
            matchersUI.push(result.data);
          } else {
            console.warn('Malformed matcher in policy:', m, result.error);
          }
        }
      }

      // Safely convert tool patterns, using defaults for malformed entries
      const toolPatternsUI: ToolPatternEntry[] = [];
      if (hasValidToolPatterns(editingPolicy.toolPatterns)) {
        for (const tp of editingPolicy.toolPatterns) {
          const result = safeToolPatternToUI(tp);
          if (result.success) {
            toolPatternsUI.push(result.data);
          } else {
            console.warn('Malformed toolPattern in policy:', tp, result.error);
          }
        }
      }

      updateForm.reset({
        matchers: matchersUI.length > 0 ? matchersUI : [{ type: 'all', value: '' }],
        toolPatterns: toolPatternsUI.length > 0 ? toolPatternsUI : [{ server: '*', tool: '*' }],
        effect: editingPolicy.effect,
        description: editingPolicy.description,
        enabled: editingPolicy.enabled,
        conditions: normalizeConditions(editingPolicy.conditions) as PolicyConditions | null,
      });
    }
  }, [editingPolicy, updateForm]);

  // Handle prefill from permission request navigation
  useEffect(() => {
    if (initialPrefillData && !prefillProcessedRef.current) {
      prefillProcessedRef.current = true;

      const toolPatternsUI: ToolPatternEntry[] = initialPrefillData.toolNames.map((toolName) => {
        const parts = toolName.split('::');
        if (parts.length === 2) {
          return { server: parts[0] || '*', tool: parts[1] || '*' };
        }
        return { server: '*', tool: toolName };
      });

      createForm.reset({
        matchers: [{ type: 'user', value: initialPrefillData.userEmail }],
        toolPatterns: toolPatternsUI.length > 0 ? toolPatternsUI : [{ server: '*', tool: '*' }],
        effect: 'ALLOW',
        description: '',
        enabled: true,
      });
    }
  }, [initialPrefillData, createForm]);

  // Execute mutations
  function executeCreate(data: PendingPolicyData): void {
    createMutation.mutate(
      {
        matchers: data.matchers,
        toolPatterns: data.toolPatterns,
        effect: data.effect,
        description: data.description,
        enabled: data.enabled,
        linkedRequestId: data.linkedRequestId,
        conditions: data.conditions ?? undefined,
        conditionsTree: data.conditionsTree,
        conditionMode: data.conditionMode,
        conditionExpression: data.conditionExpression,
        workspaceId: data.workspaceId ?? undefined,
        tagIds: data.tagIds,
      },
      {
        onSuccess: (result) => {
          createForm.reset(DEFAULT_CREATE_VALUES);
          setCreatePolicyOpen(false);
          setPendingPolicy(null);

          if (result.linkedRequestUpdated) {
            setPrefillRequest(null);
            navigate(`${adminPrefix}/permission-requests`);
          }
        },
      },
    );
  }

  function executeUpdate(data: PendingPolicyData): void {
    if (!data.policyId) return;
    updateMutation.mutate(
      {
        id: data.policyId,
        matchers: data.matchers,
        toolPatterns: data.toolPatterns,
        effect: data.effect,
        description: data.description,
        enabled: data.enabled,
        conditions: data.conditions,
        conditionsTree: data.conditionsTree,
        conditionMode: data.conditionMode,
        conditionExpression: data.conditionExpression,
        tagIds: data.tagIds,
      },
      {
        onSuccess: () => {
          setEditingPolicy(null);
          setPendingPolicy(null);
        },
      },
    );
  }

  function handleConfirmSave(): void {
    if (!pendingPolicy) return;
    setConfirmDialogOpen(false);
    if (pendingPolicy.type === 'create') {
      executeCreate(pendingPolicy);
    } else {
      executeUpdate(pendingPolicy);
    }
  }

  function handleCancelSave(): void {
    setConfirmDialogOpen(false);
    setPendingPolicy(null);
    setPreviewFailures([]);
  }

  function handleToggleEnabled(policy: Policy, next: boolean): void {
    setUpdatingPolicyIds((current) => {
      const nextSet = new Set(current);
      nextSet.add(policy.id);
      return nextSet;
    });
    updateMutation.mutate(
      { id: policy.id, enabled: next },
      {
        onSettled: () => {
          setUpdatingPolicyIds((current) => {
            const nextSet = new Set(current);
            nextSet.delete(policy.id);
            return nextSet;
          });
        },
      },
    );
  }

  function handleDelete(policy: Policy): void {
    setDeleteConfirm(policy);
  }

  function confirmDelete(): void {
    if (!deleteConfirm) return;
    deleteMutation.mutate({ id: deleteConfirm.id });
  }

  // Bulk selection handlers
  function togglePolicySelection(policyId: string): void {
    setSelectedPolicyIds((current) => {
      const next = new Set(current);
      if (next.has(policyId)) {
        next.delete(policyId);
      } else {
        next.add(policyId);
      }
      return next;
    });
  }

  function clearSelection(): void {
    setSelectedPolicyIds(new Set());
  }

  function handleBulkEnable(): void {
    if (selectedPolicyIds.size === 0) return;
    setBulkEnableConfirmOpen(true);
  }

  function confirmBulkEnable(): void {
    if (selectedPolicyIds.size === 0) return;
    bulkEnableMutation.mutate({ ids: Array.from(selectedPolicyIds) });
  }

  function handleBulkDisable(): void {
    if (selectedPolicyIds.size === 0) return;
    setBulkDisableConfirmOpen(true);
  }

  function confirmBulkDisable(): void {
    if (selectedPolicyIds.size === 0) return;
    bulkDisableMutation.mutate({ ids: Array.from(selectedPolicyIds) });
  }

  function handleBulkDelete(): void {
    if (selectedPolicyIds.size === 0) return;
    setBulkDeleteConfirmOpen(true);
  }

  function confirmBulkDelete(): void {
    if (selectedPolicyIds.size === 0) return;
    bulkDeleteMutation.mutate({ ids: Array.from(selectedPolicyIds) });
  }

  function handleBulkAssignTags(): void {
    if (selectedPolicyIds.size === 0 || !selectedBulkTagId) return;
    bulkAssignTagsMutation.mutate({
      policyIds: Array.from(selectedPolicyIds),
      tagIds: [selectedBulkTagId],
    });
  }

  const errors = useMemo(
    () =>
      [
        policiesQuery.error,
        createMutation.error,
        updateMutation.error,
        deleteMutation.error,
      ].filter(Boolean),
    [policiesQuery.error, createMutation.error, updateMutation.error, deleteMutation.error],
  );

  const filteredAndSortedPolicies = useMemo(() => {
    try {
      const items = policiesQuery.data ? [...policiesQuery.data] : [];

      const filtered = items.filter((policy) => {
        try {
          // Text search
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchersMatch = policy.matchers.some((m) => m.toLowerCase().includes(query));
            const toolPatternsMatch = policy.toolPatterns.some((tp) =>
              tp.toLowerCase().includes(query),
            );
            const matchesSearch =
              (policy.slug || '').toLowerCase().includes(query) ||
              (policy.description || '').toLowerCase().includes(query) ||
              matchersMatch ||
              toolPatternsMatch;
            if (!matchesSearch) return false;
          }

          // Effect filter
          if (effectFilter !== 'all' && policy.effect !== effectFilter) {
            return false;
          }

          // Status filter
          if (statusFilter === 'enabled' && !policy.enabled) return false;
          if (statusFilter === 'disabled' && policy.enabled) return false;

          // Matcher type filter
          if (matcherTypeFilter !== 'all') {
            const hasMatchingType = policy.matchers.some((m) => {
              if (matcherTypeFilter === 'role') return m.startsWith('role:');
              if (matcherTypeFilter === 'user') return m.startsWith('user:');
              if (matcherTypeFilter === 'agent') return m.startsWith('agent:');
              return false;
            });
            if (!hasMatchingType) return false;
          }

          // Specific user filter
          if (specificUserId && usersQuery.data) {
            const user = usersQuery.data.find((u) => u.id === specificUserId);
            if (user) {
              const userRoles =
                user.userRoles
                  ?.map((ur) => ur.role?.name)
                  .filter((roleName): roleName is string => Boolean(roleName)) || [];
              const matchesUser = policy.matchers.some(
                (m) =>
                  m === '*' ||
                  m === `user:${user.email}` ||
                  userRoles.some((role: string) => m === `role:${role}`),
              );
              if (!matchesUser) return false;
            }
          }

          // Specific role filter
          if (specificRoleId && rolesQuery.data) {
            const role = rolesQuery.data.find((r) => r.id === specificRoleId);
            if (role) {
              const matchesRole = policy.matchers.some(
                (m) => m === '*' || m === `role:${role.name}`,
              );
              if (!matchesRole) return false;
            }
          }

          // Tool pattern filter
          if (filterServer !== '*' || filterTool !== '*') {
            const matchesToolPattern = policy.toolPatterns.some((tp) => {
              const result = safeToolPatternToUI(tp);
              if (!result.success) {
                // Malformed tool patterns don't match any filter
                return false;
              }
              const policyToolPattern = result.data;
              const filterServerMatch =
                filterServer === '*' ||
                policyToolPattern.server === '*' ||
                policyToolPattern.server === filterServer;
              const filterToolMatch =
                filterTool === '*' ||
                policyToolPattern.tool === '*' ||
                policyToolPattern.tool === filterTool;
              return filterServerMatch && filterToolMatch;
            });
            if (!matchesToolPattern) return false;
          }

          // Date range filter
          if (startDate && policy.createdAt) {
            const policyDate = new Date(policy.createdAt);
            const filterStart = new Date(startDate);
            if (policyDate < filterStart) return false;
          }
          if (endDate && policy.createdAt) {
            const policyDate = new Date(policy.createdAt);
            const filterEnd = new Date(endDate);
            filterEnd.setHours(23, 59, 59, 999);
            if (policyDate > filterEnd) return false;
          }

          // Tag filter
          if (tagFilter.length > 0) {
            const policyTagIds = policy.tags?.map((t) => t.id) ?? [];
            const hasMatchingTag = tagFilter.some((tagId) => policyTagIds.includes(tagId));
            if (!hasMatchingTag) return false;
          }

          return true;
        } catch (error) {
          console.error('Error filtering policy:', error, policy);
          return true;
        }
      });

      return filtered.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return (a.slug || '').localeCompare(b.slug || '');
      });
    } catch (error) {
      console.error('Error in filteredAndSortedPolicies:', error);
      return policiesQuery.data || [];
    }
  }, [
    policiesQuery.data,
    searchQuery,
    effectFilter,
    statusFilter,
    matcherTypeFilter,
    specificUserId,
    specificRoleId,
    filterServer,
    filterTool,
    startDate,
    endDate,
    tagFilter,
    usersQuery.data,
    rolesQuery.data,
  ]);

  const hasActiveFilters =
    searchQuery ||
    effectFilter !== 'all' ||
    statusFilter !== 'all' ||
    matcherTypeFilter !== 'all' ||
    specificUserId ||
    specificRoleId ||
    filterServer !== '*' ||
    filterTool !== '*' ||
    startDate ||
    endDate ||
    tagFilter.length > 0;

  // Group policies by workspace when viewing "All Workspaces"
  const groupedPolicies = useMemo(() => {
    if (selectedWorkspaceId !== null) return null; // Not in "All Workspaces" view

    const groups: Map<string | null, Policy[]> = new Map();
    groups.set(null, []); // Global policies first

    for (const policy of filteredAndSortedPolicies) {
      const wsId = policy.workspaceId;
      if (!groups.has(wsId)) {
        groups.set(wsId, []);
      }
      groups.get(wsId)!.push(policy);
    }

    // Convert to array and sort: global first, then by workspace name
    const result: { workspaceId: string | null; workspaceName: string; policies: Policy[] }[] = [];

    // Add global group first (if it has policies)
    const globalPolicies = groups.get(null) || [];
    if (globalPolicies.length > 0) {
      result.push({ workspaceId: null, workspaceName: 'Global', policies: globalPolicies });
    }

    // Add workspace groups sorted by name
    const workspaceGroups: { workspaceId: string; workspaceName: string; policies: Policy[] }[] =
      [];
    for (const [wsId, policies] of groups.entries()) {
      if (wsId === null || policies.length === 0) continue;
      const workspace = workspaces?.find((w) => w.id === wsId);
      workspaceGroups.push({
        workspaceId: wsId,
        workspaceName: workspace?.name || 'Unknown Workspace',
        policies,
      });
    }
    workspaceGroups.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
    result.push(...workspaceGroups);

    return result;
  }, [selectedWorkspaceId, filteredAndSortedPolicies, workspaces]);

  // Split policies into global and workspace-specific when viewing a specific workspace
  const { globalPolicies, workspacePolicies } = useMemo(() => {
    if (selectedWorkspaceId === null) {
      return { globalPolicies: [], workspacePolicies: [] };
    }
    const global: Policy[] = [];
    const workspace: Policy[] = [];
    for (const policy of filteredAndSortedPolicies) {
      if (policy.workspaceId === null) {
        global.push(policy);
      } else {
        workspace.push(policy);
      }
    }
    return { globalPolicies: global, workspacePolicies: workspace };
  }, [selectedWorkspaceId, filteredAndSortedPolicies]);

  function toggleWorkspaceGroup(workspaceId: string | null): void {
    const key = workspaceId ?? 'global';
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function isWorkspaceExpanded(workspaceId: string | null): boolean {
    return expandedWorkspaces.has(workspaceId ?? 'global');
  }

  const activeFilterCount = [
    effectFilter !== 'all',
    statusFilter !== 'all',
    matcherTypeFilter !== 'all',
    specificUserId,
    specificRoleId,
    filterServer !== '*',
    filterTool !== '*',
    startDate,
    endDate,
    tagFilter.length > 0,
  ].filter(Boolean).length;

  function clearFilters(): void {
    setSearchQuery('');
    setEffectFilter('all');
    setStatusFilter('all');
    setMatcherTypeFilter('all');
    setSpecificUserId('');
    setSpecificRoleId('');
    setFilterServer('*');
    setFilterTool('*');
    setStartDate('');
    setEndDate('');
    setTagFilter([]);
  }

  // Generate description from form values (client-side, no API call)
  function generateDescription(values: PolicyFormValues): string {
    const { matchers, toolPatterns, effect } = values;

    const effectStr = effect === 'ALLOW' ? 'Allow' : 'Deny';

    const matcherStrs = matchers.map((m) => {
      if (m.type === 'all') return 'all users';
      if (m.type === 'role') return `role '${m.value || '...'}'`;
      if (m.type === 'user') return `user '${m.value || '...'}'`;
      if (m.type === 'agent') {
        const agent = agentsQuery.data?.find((a) => a.id === m.value);
        return `agent '${agent?.name || m.value || '...'}'`;
      }
      return 'unknown';
    });

    const matcherDisplay =
      matcherStrs.length === 1
        ? matcherStrs[0]
        : matcherStrs.length === 2
          ? `${matcherStrs[0]} and ${matcherStrs[1]}`
          : `${matcherStrs.slice(0, -1).join(', ')}, and ${matcherStrs.slice(-1)}`;

    const toolStrs = toolPatterns.map((tp) => {
      const { server, tool } = tp;
      if (server === '*' && tool === '*') return 'all tools';
      if (server === '*') return `tool '${tool}' on all servers`;

      if (server.startsWith('a2a:')) {
        const agentId = server.slice(4);
        const agent = a2aAgents?.find((a) => a.id === agentId);
        const agentName = agent?.name || agentId;
        if (tool === '*') return `all skills on A2A agent '${agentName}'`;
        return `skill '${tool}' on A2A agent '${agentName}'`;
      }

      const serverName = getServerNameForDisplay(server);
      if (tool === '*') return `all tools on '${serverName}'`;
      return `tool '${tool}' on '${serverName}'`;
    });

    const toolDisplay =
      toolStrs.length === 1
        ? toolStrs[0]
        : toolStrs.length === 2
          ? `${toolStrs[0]} and ${toolStrs[1]}`
          : `${toolStrs.slice(0, -1).join(', ')}, and ${toolStrs.slice(-1)}`;

    return `${effectStr} ${matcherDisplay} to use ${toolDisplay}`;
  }

  // Format policy display values
  function formatPolicyMatcher(policy: Policy): {
    display: string;
    hasError: boolean;
    error?: string;
  } {
    // Check for malformed matchers array
    if (!hasValidMatchers(policy.matchers)) {
      return {
        display: '⚠️ MALFORMED',
        hasError: true,
        error: `Invalid matchers: ${JSON.stringify(policy.matchers)}`,
      };
    }

    const firstMatcher = policy.matchers[0];
    const result = safeMatcherToUI(firstMatcher);

    if (!result.success) {
      return {
        display: '⚠️ MALFORMED',
        hasError: true,
        error: result.error,
      };
    }

    const matcherUI = result.data;
    let singleFormatted: string;

    switch (matcherUI.type) {
      case 'all':
        singleFormatted = 'Everyone';
        break;
      case 'role':
        singleFormatted = matcherUI.value === '*' ? 'All roles' : `Role: ${matcherUI.value}`;
        break;
      case 'user':
        singleFormatted = matcherUI.value === '*' ? 'All users' : `User: ${matcherUI.value}`;
        break;
      case 'agent':
        singleFormatted = matcherUI.value === '*' ? 'All agents' : `Agent: ${matcherUI.value}`;
        break;
    }

    const display =
      policy.matchers.length > 1
        ? `${singleFormatted} +${policy.matchers.length - 1} more`
        : singleFormatted;

    return { display, hasError: false };
  }

  function formatPolicyToolPattern(policy: Policy): {
    display: string;
    hasError: boolean;
    error?: string;
  } {
    // Check for malformed toolPatterns array
    if (!hasValidToolPatterns(policy.toolPatterns)) {
      return {
        display: '⚠️ MALFORMED',
        hasError: true,
        error: `Invalid toolPatterns: ${JSON.stringify(policy.toolPatterns)}`,
      };
    }

    const firstToolPattern = policy.toolPatterns[0];
    const result = safeToolPatternToUI(firstToolPattern);

    if (!result.success) {
      return {
        display: '⚠️ MALFORMED',
        hasError: true,
        error: result.error,
      };
    }

    const toolUI = result.data;
    const serverName = getServerNameForDisplay(toolUI.server);

    let singleFormatted: string;
    if (toolUI.server === '*' && toolUI.tool === '*') {
      singleFormatted = 'All tools';
    } else if (toolUI.server === '*') {
      singleFormatted = `All servers::${toolUI.tool}`;
    } else if (toolUI.tool === '*') {
      singleFormatted = `${serverName}::All tools`;
    } else {
      singleFormatted = `${serverName}::${toolUI.tool}`;
    }

    const display =
      policy.toolPatterns.length > 1
        ? `${singleFormatted} +${policy.toolPatterns.length - 1} more`
        : singleFormatted;

    return { display, hasError: false };
  }

  // Handler for PolicyFormModal create submission
  async function handleCreatePolicySubmit(values: PolicyFormValues) {
    const matchers = values.matchers.map((m) => matcherFromUI(m.type, m.value));
    const toolPatterns = values.toolPatterns.map((tp) => toolPatternFromUI(tp.server, tp.tool));

    const policyData: PendingPolicyData = {
      type: 'create',
      matchers,
      toolPatterns,
      effect: values.effect,
      description: values.description,
      enabled: values.enabled,
      linkedRequestId: prefillRequest?.requestId,
      conditions: values.conditions ?? null,
      conditionsTree: values.conditionsTree,
      conditionMode: values.conditionMode,
      conditionExpression: values.conditionExpression,
      workspaceId: values.workspaceId,
      tagIds: values.tagIds,
    };

    try {
      const preview = await previewMutation.mutateAsync({
        matchers,
        toolPatterns,
        effect: values.effect,
      });

      if (preview.wouldFail && preview.failures.length > 0) {
        setPendingPolicy(policyData);
        setPreviewFailures(preview.failures);
        setConfirmDialogOpen(true);
        return;
      }
    } catch {
      console.warn('Assertion preview failed, proceeding with save');
    }

    executeCreate(policyData);
  }

  // Handler for PolicyFormModal edit submission
  async function handleEditPolicySubmit(values: PolicyFormValues) {
    if (!editingPolicy) return;
    const matchers = values.matchers.map((m) => matcherFromUI(m.type, m.value));
    const toolPatterns = values.toolPatterns.map((tp) => toolPatternFromUI(tp.server, tp.tool));

    const policyData: PendingPolicyData = {
      type: 'update',
      matchers,
      toolPatterns,
      effect: values.effect,
      description: values.description,
      enabled: values.enabled,
      policyId: editingPolicy.id,
      conditions: values.conditions ?? null,
      conditionsTree: values.conditionsTree,
      conditionMode: values.conditionMode,
      conditionExpression: values.conditionExpression,
      tagIds: values.tagIds,
    };

    try {
      const preview = await previewMutation.mutateAsync({
        matchers,
        toolPatterns,
        effect: values.effect,
        excludePolicyId: editingPolicy.id,
      });

      if (preview.wouldFail && preview.failures.length > 0) {
        setPendingPolicy(policyData);
        setPreviewFailures(preview.failures);
        setConfirmDialogOpen(true);
        return;
      }
    } catch {
      console.warn('Assertion preview failed, proceeding with save');
    }

    executeUpdate(policyData);
  }

  // Get default values for editing or viewing a policy
  function getPolicyDefaults(policy: Policy | null): Partial<PolicyFormValues> | undefined {
    if (!policy) return undefined;

    // Safely convert matchers, using defaults for malformed entries
    const matchersUI: MatcherEntry[] = [];
    if (hasValidMatchers(policy.matchers)) {
      for (const m of policy.matchers) {
        const result = safeMatcherToUI(m);
        if (result.success) {
          matchersUI.push(result.data);
        }
      }
    }

    // Safely convert tool patterns, using defaults for malformed entries
    const toolPatternsUI: ToolPatternEntry[] = [];
    if (hasValidToolPatterns(policy.toolPatterns)) {
      for (const tp of policy.toolPatterns) {
        const result = safeToolPatternToUI(tp);
        if (result.success) {
          toolPatternsUI.push(result.data);
        }
      }
    }

    // Extract conditionExpression from stored JSON (if present)
    let conditionExpression: string | undefined;
    const storedExpression = policy.conditionExpression;
    if (
      storedExpression &&
      typeof storedExpression === 'object' &&
      'expression' in storedExpression
    ) {
      conditionExpression = String(storedExpression.expression);
    }

    return {
      matchers: matchersUI.length > 0 ? matchersUI : [{ type: 'all', value: '' }],
      toolPatterns: toolPatternsUI.length > 0 ? toolPatternsUI : [{ server: '*', tool: '*' }],
      effect: policy.effect,
      description: policy.description,
      enabled: policy.enabled,
      conditions: normalizeConditions(policy.conditions) as PolicyConditions | null,
      conditionsTree: policy.conditionsTree,
      conditionMode: policy.conditionMode,
      conditionExpression,
      workspaceId: policy.workspaceId,
      tagIds: policy.tags?.map((t) => t.id) ?? [],
    };
  }

  // Wrapper for backward compatibility
  function getEditingPolicyDefaults(): Partial<PolicyFormValues> | undefined {
    return getPolicyDefaults(editingPolicy);
  }

  // Get default values for creating policy (with prefill support)
  function getCreatePolicyDefaults(): Partial<PolicyFormValues> | undefined {
    // Always default workspaceId to selected workspace
    const baseDefaults: Partial<PolicyFormValues> = {
      workspaceId: selectedWorkspaceId,
    };

    if (!prefillRequest) return baseDefaults;

    const toolPatternsUI: ToolPatternEntry[] = prefillRequest.toolNames.map((toolName) => {
      const parts = toolName.split('::');
      if (parts.length === 2) {
        return { server: parts[0] || '*', tool: parts[1] || '*' };
      }
      return { server: '*', tool: toolName };
    });

    return {
      ...baseDefaults,
      matchers: [{ type: 'user', value: prefillRequest.userEmail }],
      toolPatterns: toolPatternsUI.length > 0 ? toolPatternsUI : [{ server: '*', tool: '*' }],
      effect: 'ALLOW',
      description: '',
      enabled: true,
    };
  }

  return (
    <PolicyPageLayout>
      <div className="space-y-8">
        <PageHeader title="Policies" description="Define who can access which tools." />

        {errors.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load policies</AlertTitle>
            <AlertDescription>{errors[0]?.message}</AlertDescription>
          </Alert>
        ) : null}

        {/* Assertion Warnings Alert */}
        {assertionWarnings.length > 0 ? (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTitle className="text-amber-600 dark:text-amber-400">
              Policy Assertions Failed
            </AlertTitle>
            <AlertDescription>
              <p className="mb-2 text-muted-foreground">
                This policy change caused the following assertions to fail:
              </p>
              <ul className="space-y-1 text-sm">
                {assertionWarnings.map((warning) => (
                  <li key={warning.assertionId} className="flex items-center gap-2">
                    <span className="font-medium">{warning.assertionName}:</span>
                    <span className="text-muted-foreground">
                      Expected <span className="font-mono">{warning.expected}</span>, got{' '}
                      <span className="font-mono">{warning.actual}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAssertionWarnings([])}>
                  Dismiss
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAssertionWarnings([]);
                    navigate(`${adminPrefix}/policy-assertions`);
                  }}
                >
                  View Assertions
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Search and Filter Bar */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search policies by description, matcher, or tool pattern..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFiltersOpen(true);
              }}
            >
              Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Button>
            <Button onClick={() => setCreatePolicyOpen(true)}>Create policy</Button>
          </div>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {effectFilter !== 'all' ? (
              <Badge variant="secondary" className="gap-1">
                Effect: {effectFilter}
                <button
                  onClick={() => setEffectFilter('all')}
                  className="ml-1 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ) : null}
            {statusFilter !== 'all' ? (
              <Badge variant="secondary" className="gap-1">
                Status: {statusFilter}
                <button
                  onClick={() => setStatusFilter('all')}
                  className="ml-1 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ) : null}
            {matcherTypeFilter !== 'all' ? (
              <Badge variant="secondary" className="gap-1">
                Type: {matcherTypeFilter}
                <button
                  onClick={() => setMatcherTypeFilter('all')}
                  className="ml-1 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ) : null}
            {specificUserId ? (
              <Badge variant="secondary" className="gap-1">
                User: {usersQuery.data?.find((u) => u.id === specificUserId)?.email}
                <button
                  onClick={() => setSpecificUserId('')}
                  className="ml-1 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ) : null}
            {specificRoleId ? (
              <Badge variant="secondary" className="gap-1">
                Role: {rolesQuery.data?.find((r) => r.id === specificRoleId)?.name}
                <button
                  onClick={() => setSpecificRoleId('')}
                  className="ml-1 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ) : null}
            {filterServer !== '*' || filterTool !== '*' ? (
              <Badge variant="secondary" className="gap-1">
                Tool:{' '}
                {filterServer === '*'
                  ? '*'
                  : (selectedFilterServer?.name ?? selectedFilterA2AAgent?.name ?? filterServer)}
                ::
                {filterTool === '*' ? '*' : filterTool}
                <button
                  onClick={() => {
                    setFilterServer('*');
                    setFilterTool('*');
                  }}
                  className="ml-1 rounded-sm hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Clear tool filter"
                >
                  x
                </button>
              </Badge>
            ) : null}
            {startDate ? (
              <Badge variant="secondary" className="gap-1">
                After: {new Date(startDate).toLocaleDateString()}
                <button
                  onClick={() => setStartDate('')}
                  className="ml-1 rounded-sm hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Clear start date filter"
                >
                  x
                </button>
              </Badge>
            ) : null}
            {endDate ? (
              <Badge variant="secondary" className="gap-1">
                Before: {new Date(endDate).toLocaleDateString()}
                <button
                  onClick={() => setEndDate('')}
                  className="ml-1 rounded-sm hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Clear end date filter"
                >
                  x
                </button>
              </Badge>
            ) : null}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              Showing {filteredAndSortedPolicies.length} of {policiesQuery.data?.length || 0}{' '}
              policies
            </span>
          </div>
        ) : null}

        {/* Bulk Action Bar */}
        {selectedPolicyIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
            <span className="text-sm font-medium">
              {selectedPolicyIds.size} {selectedPolicyIds.size === 1 ? 'policy' : 'policies'}{' '}
              selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkEnable}
                disabled={bulkEnableMutation.isPending}
              >
                Enable
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDisable}
                disabled={bulkDisableMutation.isPending}
              >
                Disable
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkAssignTagsOpen(true)}>
                Assign Tag
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Bulk Assign Tags Dialog */}
        <Dialog open={bulkAssignTagsOpen} onOpenChange={setBulkAssignTagsOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Tag to Policies</DialogTitle>
              <DialogDescription>
                Select a tag to assign to {selectedPolicyIds.size} selected{' '}
                {selectedPolicyIds.size === 1 ? 'policy' : 'policies'}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select value={selectedBulkTagId} onValueChange={setSelectedBulkTagId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tag..." />
                </SelectTrigger>
                <SelectContent>
                  {tagsQuery.data?.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkAssignTagsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkAssignTags}
                disabled={!selectedBulkTagId || bulkAssignTagsMutation.isPending}
              >
                {bulkAssignTagsMutation.isPending ? 'Assigning...' : 'Assign Tag'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={Boolean(deleteConfirm)}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Delete policy"
          description="Are you sure you want to delete"
          itemName={deleteConfirm?.description || 'this policy'}
          onConfirm={confirmDelete}
          isDeleting={deleteMutation.isPending}
          isLoadingWarnings={deletionImpactQuery.isPending}
          warnings={deletionImpactQuery.data?.warnings}
        />

        {/* Bulk Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          open={bulkDeleteConfirmOpen}
          onOpenChange={setBulkDeleteConfirmOpen}
          title="Delete policies"
          description={`Are you sure you want to delete ${selectedPolicyIds.size} ${selectedPolicyIds.size === 1 ? 'policy' : 'policies'}? This action cannot be undone.`}
          onConfirm={confirmBulkDelete}
          isDeleting={bulkDeleteMutation.isPending}
        />

        {/* Bulk Enable Confirmation Dialog */}
        <ConfirmDialog
          open={bulkEnableConfirmOpen}
          onOpenChange={setBulkEnableConfirmOpen}
          title="Enable policies"
          description={`Are you sure you want to enable ${selectedPolicyIds.size} ${selectedPolicyIds.size === 1 ? 'policy' : 'policies'}?`}
          onConfirm={confirmBulkEnable}
          isLoading={bulkEnableMutation.isPending}
          confirmLabel="Enable"
          loadingLabel="Enabling..."
          variant="default"
        />

        {/* Bulk Disable Confirmation Dialog */}
        <ConfirmDialog
          open={bulkDisableConfirmOpen}
          onOpenChange={setBulkDisableConfirmOpen}
          title="Disable policies"
          description={`Are you sure you want to disable ${selectedPolicyIds.size} ${selectedPolicyIds.size === 1 ? 'policy' : 'policies'}?`}
          onConfirm={confirmBulkDisable}
          isLoading={bulkDisableMutation.isPending}
          confirmLabel="Disable"
          loadingLabel="Disabling..."
          variant="default"
        />

        {/* Assertion Failures Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={(open) => !open && handleCancelSave()}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Policy Assertions Will Fail</DialogTitle>
              <DialogDescription>
                {pendingPolicy?.type === 'create' ? 'Creating' : 'Updating'} this policy will cause
                the following assertions to fail. Do you want to proceed anyway?
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-64 overflow-y-auto">
              <div className="space-y-3">
                {previewFailures.map((failure) => (
                  <div
                    key={failure.assertionId}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm">{failure.assertionName}</span>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Expected:</span>
                        <span
                          className={
                            failure.expected === 'ALLOWED' ? 'text-green-600' : 'text-red-600'
                          }
                        >
                          {failure.expected}
                        </span>
                        <span className="text-muted-foreground mx-1">-&gt;</span>
                        <span className="text-muted-foreground">Got:</span>
                        <span
                          className={
                            failure.actual === 'ALLOWED' ? 'text-green-600' : 'text-red-600'
                          }
                        >
                          {failure.actual}
                        </span>
                      </div>
                    </div>
                    {failure.justification && (
                      <p className="mt-1 text-xs text-muted-foreground">{failure.justification}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancelSave}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : pendingPolicy?.type === 'create'
                    ? 'Create Anyway'
                    : 'Save Anyway'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Policies Table */}
        {policiesQuery.isPending ? (
          <Card>
            <CardHeader>
              <CardTitle>Policies</CardTitle>
              <CardDescription>All policy rules currently active.</CardDescription>
            </CardHeader>
            <CardContent>
              <TableSkeleton />
            </CardContent>
          </Card>
        ) : filteredAndSortedPolicies.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Policies</CardTitle>
              <CardDescription>All policy rules currently active.</CardDescription>
            </CardHeader>
            <CardContent>
              {hasActiveFilters ? (
                <EmptyState
                  title="No policies match filters"
                  description="Try adjusting your filters to see more results."
                />
              ) : (
                <EmptyState
                  title="No policies yet"
                  description="Create a policy to start enforcing tool access."
                />
              )}
            </CardContent>
          </Card>
        ) : groupedPolicies ? (
          /* Grouped view for "All Workspaces" */
          <div className="space-y-4">
            {groupedPolicies.map((group) => (
              <Card key={group.workspaceId ?? 'global'}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => toggleWorkspaceGroup(group.workspaceId)}
                >
                  <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {isWorkspaceExpanded(group.workspaceId) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      {group.workspaceId === null ? (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      ) : null}
                      <CardTitle className="text-base">{group.workspaceName}</CardTitle>
                      <Badge variant="secondary" className="ml-2">
                        {group.policies.length}
                      </Badge>
                    </div>
                    <CardDescription className="ml-6">
                      {group.workspaceId === null
                        ? 'Policies that apply to all workspaces'
                        : `Policies scoped to ${group.workspaceName}`}
                    </CardDescription>
                  </CardHeader>
                </button>
                {isWorkspaceExpanded(group.workspaceId) && (
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                group.policies.every((p) => selectedPolicyIds.has(p.id)) &&
                                group.policies.length > 0
                              }
                              onCheckedChange={() => {
                                const allSelected = group.policies.every((p) =>
                                  selectedPolicyIds.has(p.id),
                                );
                                setSelectedPolicyIds((current) => {
                                  const next = new Set(current);
                                  group.policies.forEach((p) => {
                                    if (allSelected) {
                                      next.delete(p.id);
                                    } else {
                                      next.add(p.id);
                                    }
                                  });
                                  return next;
                                });
                              }}
                            />
                          </TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Applies to</TableHead>
                          <TableHead>Tool access</TableHead>
                          <TableHead>Effect</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.policies.map((policy) => (
                          <TableRow key={policy.id} className={cn(!policy.enabled && 'opacity-50')}>
                            <TableCell>
                              <Checkbox
                                checked={selectedPolicyIds.has(policy.id)}
                                onCheckedChange={() => togglePolicySelection(policy.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {policy.description || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {(() => {
                                const matcherResult = formatPolicyMatcher(policy);
                                if (matcherResult.hasError) {
                                  return (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-destructive font-medium cursor-help">
                                            {matcherResult.display}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-sm">
                                          <p className="text-xs">{matcherResult.error}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                }
                                return matcherResult.display;
                              })()}
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono text-sm">
                              {(() => {
                                const toolResult = formatPolicyToolPattern(policy);
                                if (toolResult.hasError) {
                                  return (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-destructive font-medium cursor-help">
                                            {toolResult.display}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-sm">
                                          <p className="text-xs">{toolResult.error}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                }
                                return toolResult.display;
                              })()}
                            </TableCell>
                            <TableCell>
                              <AllowDenyBadge value={policy.effect} size="sm" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={policy.enabled}
                                  onCheckedChange={(next) => handleToggleEnabled(policy, next)}
                                  disabled={
                                    updatingPolicyIds.has(policy.id) ||
                                    (policy.workspaceId === null && !isOrgOwner)
                                  }
                                />
                                <span className="text-sm text-muted-foreground">
                                  {policy.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{formatShortDate(policy.updatedAt)}</TableCell>
                            <TableCell className="text-right">
                              {/* Global policies are read-only for non-org owners */}
                              {policy.workspaceId === null && !isOrgOwner ? (
                                <span className="text-xs text-muted-foreground">Read-only</span>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingPolicy(policy)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(policy)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        ) : (
          /* Split view for specific workspace - Global policies collapsible at top, workspace policies below */
          <div className="space-y-4">
            {/* Inherited from Organization Section */}
            {globalPolicies.length > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setGlobalPoliciesExpanded(!globalPoliciesExpanded)}
                >
                  <CardHeader className="pb-3 cursor-pointer hover:bg-primary/10 transition-colors">
                    <div className="flex items-center gap-2">
                      {globalPoliciesExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Globe className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Inherited from Organization</CardTitle>
                      <Badge variant="secondary" className="ml-2">
                        {globalPolicies.length}
                      </Badge>
                    </div>
                    <CardDescription className="ml-6">
                      Global policies that apply to all workspaces (read-only)
                    </CardDescription>
                  </CardHeader>
                </button>
                {globalPoliciesExpanded && (
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                globalPolicies.every((p) => selectedPolicyIds.has(p.id)) &&
                                globalPolicies.length > 0
                              }
                              onCheckedChange={() => {
                                const allSelected = globalPolicies.every((p) =>
                                  selectedPolicyIds.has(p.id),
                                );
                                setSelectedPolicyIds((current) => {
                                  const next = new Set(current);
                                  globalPolicies.forEach((p) => {
                                    if (allSelected) {
                                      next.delete(p.id);
                                    } else {
                                      next.add(p.id);
                                    }
                                  });
                                  return next;
                                });
                              }}
                            />
                          </TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Applies to</TableHead>
                          <TableHead>Tool access</TableHead>
                          <TableHead>Effect</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {globalPolicies.map((policy) => (
                          <TableRow key={policy.id} className={cn(!policy.enabled && 'opacity-50')}>
                            <TableCell>
                              <Checkbox
                                checked={selectedPolicyIds.has(policy.id)}
                                onCheckedChange={() => togglePolicySelection(policy.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <InheritedBadge />
                                <span>{policy.description || '-'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatPolicyMatcher(policy).display}
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono text-sm">
                              {formatPolicyToolPattern(policy).display}
                            </TableCell>
                            <TableCell>
                              <AllowDenyBadge value={policy.effect} size="sm" />
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {policy.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </TableCell>
                            <TableCell>{formatShortDate(policy.updatedAt)}</TableCell>
                            <TableCell className="text-right">
                              {isOrgOwner ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingPolicy(policy)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(policy)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setViewingPolicy(policy)}
                                  >
                                    View
                                  </Button>
                                  {policy.effect === 'DENY' && (
                                    <RequestExceptionButton
                                      policyId={policy.id}
                                      policyDescription={policy.description || 'No description'}
                                    />
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Workspace Policies Section */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Workspace {selectedWorkspace?.name ? `"${selectedWorkspace.name}"` : 'Policies'}
                </CardTitle>
                <CardDescription>Policies specific to this workspace (editable).</CardDescription>
              </CardHeader>
              <CardContent>
                {workspacePolicies.length === 0 ? (
                  hasActiveFilters ? (
                    <EmptyState
                      title="No policies match filters"
                      description="Try adjusting your filters to see more results."
                    />
                  ) : (
                    <EmptyState
                      title="No workspace policies"
                      description="Create a policy specific to this workspace."
                    />
                  )
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              workspacePolicies.every((p) => selectedPolicyIds.has(p.id)) &&
                              workspacePolicies.length > 0
                            }
                            onCheckedChange={() => {
                              const allSelected = workspacePolicies.every((p) =>
                                selectedPolicyIds.has(p.id),
                              );
                              setSelectedPolicyIds((current) => {
                                const next = new Set(current);
                                workspacePolicies.forEach((p) => {
                                  if (allSelected) {
                                    next.delete(p.id);
                                  } else {
                                    next.add(p.id);
                                  }
                                });
                                return next;
                              });
                            }}
                          />
                        </TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Applies to</TableHead>
                        <TableHead>Tool access</TableHead>
                        <TableHead>Effect</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workspacePolicies.map((policy) => (
                        <TableRow key={policy.id} className={cn(!policy.enabled && 'opacity-50')}>
                          <TableCell>
                            <Checkbox
                              checked={selectedPolicyIds.has(policy.id)}
                              onCheckedChange={() => togglePolicySelection(policy.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{policy.description || '-'}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatPolicyMatcher(policy).display}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">
                            {formatPolicyToolPattern(policy).display}
                          </TableCell>
                          <TableCell>
                            <AllowDenyBadge value={policy.effect} size="sm" />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={policy.enabled}
                                onCheckedChange={(next) => handleToggleEnabled(policy, next)}
                                disabled={updatingPolicyIds.has(policy.id)}
                              />
                              <span className="text-sm text-muted-foreground">
                                {policy.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{formatShortDate(policy.updatedAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingPolicy(policy)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(policy)}
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
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Create Policy Modal */}
        <PolicyFormModal
          open={createPolicyOpen}
          onOpenChange={(open) => {
            setCreatePolicyOpen(open);
            if (!open) {
              setPrefillRequest(null);
              createMutation.reset();
              if (location.state) {
                navigate(location.pathname, { replace: true, state: {} });
              }
            }
          }}
          mode="create"
          defaultValues={getCreatePolicyDefaults()}
          onSubmit={handleCreatePolicySubmit}
          isSubmitting={previewMutation.isPending || createMutation.isPending}
          error={createMutation.error?.message ?? null}
          users={usersQuery.data}
          roles={rolesQuery.data}
          agents={agentsQuery.data}
          mcpServers={mcpServers}
          a2aAgents={a2aAgents}
          workspaces={workspaces}
          isOrgOwner={isOrgOwner}
          getToolsForServer={getToolsForServer}
          isToolFlagged={isToolFlagged}
          getToolFlagCountsForServer={getToolFlagCountsForServer}
          toolFlagData={toolFlagData}
          categories={(categoriesQuery.data?.categories ?? []) as CategoryOption[]}
          operators={(operatorsQuery.data?.operators ?? {}) as OperatorGroups}
          onGenerateDescription={generateDescription}
          prefillRequest={prefillRequest ?? undefined}
          tags={tagsQuery.data}
          onCreateTag={handleCreateTag}
          isCreatingTag={createTagMutation.isPending}
        />

        {/* Edit Policy Modal */}
        <PolicyFormModal
          open={Boolean(editingPolicy)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingPolicy(null);
              updateMutation.reset();
            }
          }}
          mode="edit"
          defaultValues={getEditingPolicyDefaults()}
          onSubmit={handleEditPolicySubmit}
          isSubmitting={previewMutation.isPending || updateMutation.isPending}
          error={updateMutation.error?.message ?? null}
          users={usersQuery.data}
          roles={rolesQuery.data}
          agents={agentsQuery.data}
          mcpServers={mcpServers}
          a2aAgents={a2aAgents}
          workspaces={workspaces}
          isOrgOwner={isOrgOwner}
          getToolsForServer={getToolsForServer}
          isToolFlagged={isToolFlagged}
          getToolFlagCountsForServer={getToolFlagCountsForServer}
          toolFlagData={toolFlagData}
          categories={(categoriesQuery.data?.categories ?? []) as CategoryOption[]}
          operators={(operatorsQuery.data?.operators ?? {}) as OperatorGroups}
          onGenerateDescription={generateDescription}
          tags={tagsQuery.data}
          onCreateTag={handleCreateTag}
          isCreatingTag={createTagMutation.isPending}
        />

        {/* View Policy Modal (read-only for global policies) */}
        <PolicyFormModal
          open={Boolean(viewingPolicy)}
          onOpenChange={(open) => {
            if (!open) setViewingPolicy(null);
          }}
          mode="view"
          readOnly
          defaultValues={getPolicyDefaults(viewingPolicy)}
          onSubmit={() => {}} // No-op since it's read-only
          users={usersQuery.data}
          roles={rolesQuery.data}
          agents={agentsQuery.data}
          mcpServers={mcpServers}
          a2aAgents={a2aAgents}
          workspaces={workspaces}
          isOrgOwner={isOrgOwner}
          getToolsForServer={getToolsForServer}
          isToolFlagged={isToolFlagged}
          getToolFlagCountsForServer={getToolFlagCountsForServer}
          toolFlagData={toolFlagData}
          categories={(categoriesQuery.data?.categories ?? []) as CategoryOption[]}
          operators={(operatorsQuery.data?.operators ?? {}) as OperatorGroups}
          tags={tagsQuery.data}
        />

        {/* Filters Modal */}
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter Policies</DialogTitle>
              <DialogDescription>
                Apply advanced filters to find specific policies
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Effect and Status */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Effect</Label>
                  <Select
                    value={effectFilter}
                    onValueChange={(value) => {
                      if (isEffectFilter(value)) {
                        setEffectFilter(value);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="ALLOW">ALLOW</SelectItem>
                      <SelectItem value="DENY">DENY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                      if (isStatusFilter(value)) {
                        setStatusFilter(value);
                      }
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
              </div>

              {/* Matcher Type */}
              <div className="space-y-2">
                <Label>Matcher Type</Label>
                <Select
                  value={matcherTypeFilter}
                  onValueChange={(value) => {
                    if (isMatcherType(value)) {
                      setMatcherTypeFilter(value);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="role">Role-based</SelectItem>
                    <SelectItem value="user">User-specific</SelectItem>
                    <SelectItem value="agent">Agent-specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filter by User */}
              <div className="space-y-2">
                <Label>Filter by User</Label>
                <p className="text-xs text-muted-foreground">
                  Show policies that would apply to this user (based on their roles)
                </p>
                <Select
                  value={specificUserId || undefined}
                  onValueChange={(value) => setSpecificUserId(value === 'all' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    {usersQuery.data?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filter by Role */}
              <div className="space-y-2">
                <Label>Filter by Role</Label>
                <p className="text-xs text-muted-foreground">
                  Show policies that apply to this role
                </p>
                <Select
                  value={specificRoleId || undefined}
                  onValueChange={(value) => setSpecificRoleId(value === 'all' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {rolesQuery.data?.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tool Pattern Filter */}
              <div className="space-y-2">
                <Label>Tool Pattern</Label>
                <p className="text-xs text-muted-foreground">
                  Filter policies by MCP server and tool
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select value={filterServer} onValueChange={handleFilterServerChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="MCP Server" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">All servers</SelectItem>
                        <SelectGroup>
                          <SelectLabel>MCP Servers</SelectLabel>
                          {mcpServers?.map((server) => {
                            const url = new URL(server.url);
                            const domain = url.hostname;
                            const port = url.port ? `:${url.port}` : '';
                            const serverKey = `${domain}${port}`;
                            return (
                              <SelectItem key={server.id} value={serverKey}>
                                {server.name}
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                        {a2aAgents && a2aAgents.length > 0 && (
                          <>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>A2A Agents</SelectLabel>
                              {a2aAgents.map((agent) => (
                                <SelectItem key={agent.id} value={`a2a:${agent.id}`}>
                                  {agent.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </>
                        )}
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
                    <Label className="text-xs text-muted-foreground">Created After</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Created Before</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Tags Filter */}
              <TagFilterSelector
                tags={tagsQuery.data ?? []}
                selectedTagIds={tagFilter}
                onChange={setTagFilter}
                label="Tags"
                description="Filter policies that have any of the selected tags"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear all filters
              </Button>
              <Button type="button" onClick={() => setFiltersOpen(false)}>
                Apply filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PolicyPageLayout>
  );
}
