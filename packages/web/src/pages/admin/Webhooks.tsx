import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation } from 'react-router';
import { z } from 'zod';

import { ConfirmDialog, ErrorAlert } from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
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
import { Checkbox } from '../../components/ui/checkbox';
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
import { SecretDisplayDialog } from '../../components/ui/secret-display-dialog';
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
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatShortDate } from '../../lib/format';
import { RouterOutputs, trpc } from '../../lib/trpc';

// Webhook events grouped by category
const EVENT_GROUPS = [
  {
    label: 'Tool Invocations',
    events: [
      { value: 'TOOL_INVOCATION_ALLOWED', label: 'Tool Allowed' },
      { value: 'TOOL_INVOCATION_DENIED', label: 'Tool Denied' },
    ],
  },
  {
    label: 'Sensitive Flags',
    events: [
      { value: 'SENSITIVE_TOOL_INVOKED', label: 'Sensitive Tool Invoked' },
      { value: 'SENSITIVE_APPROVAL_NEEDED', label: 'Approval Needed' },
      { value: 'SENSITIVE_RATE_LIMITED', label: 'Rate Limited' },
    ],
  },
  {
    label: 'Policies',
    events: [
      { value: 'POLICY_CREATED', label: 'Policy Created' },
      { value: 'POLICY_UPDATED', label: 'Policy Updated' },
      { value: 'POLICY_DELETED', label: 'Policy Deleted' },
    ],
  },
  {
    label: 'Agents',
    events: [
      { value: 'AGENT_CREATED', label: 'Agent Created' },
      { value: 'AGENT_DELETED', label: 'Agent Deleted' },
    ],
  },
] as const;

// Flat list of all events for filter dropdown
const ALL_EVENTS: Array<{ value: string; label: string }> = EVENT_GROUPS.flatMap((g) =>
  g.events.map((e) => ({ value: e.value, label: e.label })),
);

// Webhook endpoint types
const WEBHOOK_TYPES = [
  {
    value: 'CUSTOM',
    label: 'Custom',
    description: 'Raw JSON payload to any URL',
  },
  {
    value: 'DISCORD',
    label: 'Discord',
    description: 'Formatted embeds to Discord',
  },
  {
    value: 'SLACK',
    label: 'Slack',
    description: 'Formatted blocks to Slack',
  },
  {
    value: 'EMAIL',
    label: 'Email',
    description: 'Send notifications via email',
  },
] as const;

type WebhookEndpointType = (typeof WEBHOOK_TYPES)[number]['value'];

// Zod schemas
const webhookEventSchema = z.enum([
  'TOOL_INVOCATION_ALLOWED',
  'TOOL_INVOCATION_DENIED',
  'SENSITIVE_TOOL_INVOKED',
  'SENSITIVE_APPROVAL_NEEDED',
  'SENSITIVE_RATE_LIMITED',
  'POLICY_CREATED',
  'POLICY_UPDATED',
  'POLICY_DELETED',
  'AGENT_CREATED',
  'AGENT_DELETED',
]);

const webhookEndpointTypeSchema = z.enum(['CUSTOM', 'DISCORD', 'SLACK', 'EMAIL']);

const createEndpointSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: webhookEndpointTypeSchema,
  url: z.string().optional(),
  recipients: z.string().optional(), // Comma-separated email addresses for EMAIL type
  events: z.array(webhookEventSchema).min(1, 'Select at least one event'),
  verbose: z.boolean(),
  maxRetries: z.number().min(0).max(10),
  retryDelayMs: z.number().min(1000).max(60000),
});

type CreateEndpointValues = z.infer<typeof createEndpointSchema>;

const updateEndpointSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  url: z.string().optional(),
  recipients: z.string().optional(), // Comma-separated email addresses for EMAIL type
  events: z.array(webhookEventSchema).min(1, 'Select at least one event'),
  verbose: z.boolean(),
  maxRetries: z.number().min(0).max(10),
  retryDelayMs: z.number().min(1000).max(60000),
});

type UpdateEndpointValues = z.infer<typeof updateEndpointSchema>;

// Filter types with type guard using readonly array for proper .includes() typing
type StatusFilter = 'all' | 'enabled' | 'disabled';
const STATUS_FILTER_VALUES: readonly string[] = ['all', 'enabled', 'disabled'] as const;

function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTER_VALUES.includes(value);
}

// Explicit interfaces
interface WebhookDeliveryItem {
  id: string;
  event: string;
  deliveredAt: string | Date | null;
  failedAt: string | Date | null;
  nextRetryAt: string | Date | null;
  responseStatus: number | null;
  createdAt: string | Date;
}

// Use RouterOutputs to get proper type inference from tRPC
type WebhookEndpointItem = RouterOutputs['admin']['webhooks']['list'][number];

export default function AdminWebhooks() {
  const location = useLocation();
  const utils = trpc.useUtils();

  // Clear navigation state immediately after reading it
  useEffect(() => {
    if (location.state?.openCreateModal) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const { selectedWorkspaceId } = useWorkspace();

  const endpointsQuery = trpc.admin.webhooks.list.useQuery({
    includeDisabled: true,
    workspaceId: selectedWorkspaceId ?? undefined,
  });

  const createMutation = trpc.admin.webhooks.create.useMutation({
    onSuccess: (data) => {
      utils.admin.webhooks.list.invalidate();
      setCreateOpen(false);
      if (data.secret) {
        setNewEndpointSecret(data.secret);
        setShowSecretDialog(true);
      }
      createForm.reset();
    },
  });

  const updateMutation = trpc.admin.webhooks.update.useMutation({
    onSuccess: () => {
      utils.admin.webhooks.list.invalidate();
      setEditingEndpoint(null);
    },
  });

  const deleteMutation = trpc.admin.webhooks.delete.useMutation({
    onSuccess: () => {
      utils.admin.webhooks.list.invalidate();
      setDeleteConfirm(null);
    },
  });

  const testMutation = trpc.admin.webhooks.test.useMutation();

  const rotateSecretMutation = trpc.admin.webhooks.rotateSecret.useMutation({
    onSuccess: (data) => {
      setNewEndpointSecret(data.secret);
      setShowSecretDialog(true);
    },
  });

  const endpointsData = useMemo(() => endpointsQuery.data ?? [], [endpointsQuery.data]);

  // UI state
  const [createOpen, setCreateOpen] = useState(() => {
    return Boolean(location.state?.openCreateModal);
  });
  const [editingEndpoint, setEditingEndpoint] = useState<WebhookEndpointItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<WebhookEndpointItem | null>(null);
  const [viewingEndpoint, setViewingEndpoint] = useState<WebhookEndpointItem | null>(null);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const [newEndpointSecret, setNewEndpointSecret] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; error?: string }>
  >({});

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');

  const createForm = useForm<CreateEndpointValues>({
    resolver: zodResolver(createEndpointSchema),
    defaultValues: {
      name: '',
      type: 'CUSTOM',
      url: '',
      recipients: '',
      events: [],
      verbose: false,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
  });

  const updateForm = useForm<UpdateEndpointValues>({
    resolver: zodResolver(updateEndpointSchema),
    defaultValues: {
      name: '',
      url: '',
      recipients: '',
      events: [],
      verbose: false,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
  });

  // Watch type for conditional fields
  const watchedType = createForm.watch('type');

  // Populate edit form when editing endpoint changes
  useEffect(() => {
    if (editingEndpoint) {
      // Extract recipients from config for EMAIL type
      let recipients = '';
      if (editingEndpoint.type === 'EMAIL' && editingEndpoint.config) {
        const config = editingEndpoint.config as { recipients?: string[] };
        if (Array.isArray(config.recipients)) {
          recipients = config.recipients.join(', ');
        }
      }
      updateForm.reset({
        name: editingEndpoint.name,
        url: editingEndpoint.url || '',
        recipients,
        events: editingEndpoint.events.filter(
          (e: string): e is z.infer<typeof webhookEventSchema> =>
            ALL_EVENTS.some((ae) => ae.value === e),
        ),
        verbose: editingEndpoint.verbose,
        maxRetries: editingEndpoint.maxRetries,
        retryDelayMs: editingEndpoint.retryDelayMs,
      });
    }
  }, [editingEndpoint, updateForm]);

  // Filtering logic
  const filteredEndpoints = useMemo(() => {
    return endpointsData.filter((endpoint) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !endpoint.name.toLowerCase().includes(query) &&
          !(endpoint.url?.toLowerCase().includes(query) ?? false)
        ) {
          return false;
        }
      }
      if (statusFilter === 'enabled' && !endpoint.enabled) return false;
      if (statusFilter === 'disabled' && endpoint.enabled) return false;
      if (eventFilter !== 'all' && !endpoint.events.some((ev) => ev === eventFilter)) return false;
      return true;
    });
  }, [endpointsData, searchQuery, statusFilter, eventFilter]);

  const activeFilterCount = [statusFilter !== 'all', eventFilter !== 'all'].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || searchQuery.length > 0;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setEventFilter('all');
  };

  const handleCreate = createForm.handleSubmit((values) => {
    // EMAIL type uses recipients, other types use URL
    if (values.type === 'EMAIL') {
      if (!values.recipients?.trim()) {
        createForm.setError('recipients', { message: 'At least one email address is required' });
        return;
      }
      // Parse and validate email addresses
      const recipientList = values.recipients
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = recipientList.filter((e) => !emailRegex.test(e));
      if (invalidEmails.length > 0) {
        createForm.setError('recipients', {
          message: `Invalid email address: ${invalidEmails[0]}`,
        });
        return;
      }
      createMutation.mutate({
        name: values.name,
        type: values.type,
        // url is omitted for EMAIL type
        config: { recipients: recipientList },
        events: values.events,
        verbose: values.verbose,
        maxRetries: values.maxRetries,
        retryDelayMs: values.retryDelayMs,
      });
    } else {
      if (!values.url) {
        createForm.setError('url', { message: 'URL is required' });
        return;
      }
      try {
        new URL(values.url);
      } catch {
        createForm.setError('url', { message: 'Must be a valid URL' });
        return;
      }
      createMutation.mutate({
        name: values.name,
        type: values.type,
        url: values.url,
        events: values.events,
        verbose: values.verbose,
        maxRetries: values.maxRetries,
        retryDelayMs: values.retryDelayMs,
      });
    }
  });

  const handleUpdate = updateForm.handleSubmit((values) => {
    if (!editingEndpoint) return;

    // EMAIL type uses recipients, other types use URL
    if (editingEndpoint.type === 'EMAIL') {
      if (!values.recipients?.trim()) {
        updateForm.setError('recipients', { message: 'At least one email address is required' });
        return;
      }
      // Parse and validate email addresses
      const recipientList = values.recipients
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = recipientList.filter((e) => !emailRegex.test(e));
      if (invalidEmails.length > 0) {
        updateForm.setError('recipients', {
          message: `Invalid email address: ${invalidEmails[0]}`,
        });
        return;
      }
      updateMutation.mutate({
        id: editingEndpoint.id,
        name: values.name,
        config: { recipients: recipientList },
        events: values.events,
        verbose: values.verbose,
        maxRetries: values.maxRetries,
        retryDelayMs: values.retryDelayMs,
      });
    } else {
      if (!values.url) {
        updateForm.setError('url', { message: 'URL is required' });
        return;
      }
      try {
        new URL(values.url);
      } catch {
        updateForm.setError('url', { message: 'Must be a valid URL' });
        return;
      }
      updateMutation.mutate({
        id: editingEndpoint.id,
        name: values.name,
        url: values.url,
        events: values.events,
        verbose: values.verbose,
        maxRetries: values.maxRetries,
        retryDelayMs: values.retryDelayMs,
      });
    }
  });

  const handleToggleEnabled = (endpoint: WebhookEndpointItem, enabled: boolean) => {
    updateMutation.mutate({ id: endpoint.id, enabled });
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    deleteMutation.mutate({ id: deleteConfirm.id });
  };

  const handleTest = async (endpointId: string) => {
    try {
      const result = await testMutation.mutateAsync({ id: endpointId });
      setTestResults((prev) => ({
        ...prev,
        [endpointId]: { success: result.success, error: result.error },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [endpointId]: { success: false, error: 'Failed to send test' },
      }));
    }
  };

  const errors = useMutationErrors([
    endpointsQuery,
    createMutation,
    updateMutation,
    deleteMutation,
  ]);

  const formatEvents = (events: string[]) => {
    if (events.length <= 2) {
      return events.map((e) => ALL_EVENTS.find((ae) => ae.value === e)?.label || e).join(', ');
    }
    return `${events.length} events`;
  };

  const formatType = (type: WebhookEndpointType) => {
    switch (type) {
      case 'DISCORD':
        return 'Discord';
      case 'SLACK':
        return 'Slack';
      case 'EMAIL':
        return 'Email';
      case 'CUSTOM':
      default:
        return 'Custom';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Webhooks"
          description="Configure webhook endpoints to receive event notifications."
        />

        <ErrorAlert title="Failed to load webhooks" errors={errors} />

        <SearchFilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by name or URL..."
          onFilterClick={() => setFiltersOpen(true)}
          filterCount={activeFilterCount}
          onCreateClick={() => setCreateOpen(true)}
          createLabel="Create endpoint"
        />

        <ActiveFilterBadges
          filters={[
            {
              key: 'search',
              label: 'Search',
              value: searchQuery,
              onClear: () => setSearchQuery(''),
            },
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onClear: () => setStatusFilter('all'),
            },
            {
              key: 'event',
              label: 'Event',
              value:
                eventFilter === 'all'
                  ? ''
                  : ALL_EVENTS.find((e) => e.value === eventFilter)?.label || eventFilter,
              onClear: () => setEventFilter('all'),
            },
          ]}
          onClearAll={clearFilters}
          filteredCount={filteredEndpoints.length}
          totalCount={endpointsData.length}
        />

        {/* Endpoints Table */}
        <Card>
          <CardHeader>
            <CardTitle>Webhook Endpoints</CardTitle>
            <CardDescription>Endpoints that receive event notifications.</CardDescription>
          </CardHeader>
          <CardContent>
            {endpointsQuery.isPending ? (
              <TableSkeleton />
            ) : filteredEndpoints.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEndpoints.map((endpoint) => {
                    const testResult = testResults[endpoint.id];
                    return (
                      <TableRow key={endpoint.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{endpoint.name}</span>
                            {endpoint.verbose && (
                              <span className="ml-2 text-xs text-muted-foreground">(verbose)</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                            {endpoint.type === 'EMAIL'
                              ? (endpoint.config as { recipients?: string[] })?.recipients?.join(
                                  ', ',
                                ) || '—'
                              : endpoint.url || '—'}
                          </div>
                          {testResult?.error && (
                            <div className="text-xs text-destructive mt-1 max-w-xs">
                              {testResult.error}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatType(endpoint.type)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatEvents(endpoint.events)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={endpoint.enabled}
                              onCheckedChange={(enabled) => handleToggleEnabled(endpoint, enabled)}
                              disabled={updateMutation.isPending}
                            />
                            <span className="text-sm text-muted-foreground">
                              {endpoint.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant={testResult?.success === false ? 'destructive' : 'ghost'}
                              size="sm"
                              onClick={() => handleTest(endpoint.id)}
                              disabled={testMutation.isPending}
                              title={testResult?.error || undefined}
                            >
                              {testResult ? (testResult.success ? 'OK' : 'Failed') : 'Test'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingEndpoint(endpoint)}
                            >
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingEndpoint(endpoint)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(endpoint)}
                              className="text-destructive hover:text-destructive"
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : hasActiveFilters ? (
              <EmptyState
                title="No endpoints match filters"
                description="Try adjusting your search or filter criteria."
              />
            ) : (
              <EmptyState
                title="No webhook endpoints"
                description="Create an endpoint to start receiving notifications."
              />
            )}
          </CardContent>
        </Card>

        <FilterDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          onClearAll={clearFilters}
          title="Filter Endpoints"
        >
          <FilterSection label="Status">
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
          </FilterSection>
          <FilterSection label="Event Type">
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {EVENT_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </div>
                    {group.events.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>
        </FilterDialog>

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create endpoint</DialogTitle>
              <DialogDescription>
                Create a new webhook endpoint to receive event notifications.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label htmlFor="create-name">Name</Label>
                <Input id="create-name" placeholder="My Webhook" {...createForm.register('name')} />
                {createForm.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Controller
                  control={createForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEBHOOK_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {watchedType === 'EMAIL' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-recipients">Email Recipients</Label>
                    <Input
                      id="create-recipients"
                      type="text"
                      placeholder="user@example.com, admin@example.com"
                      {...createForm.register('recipients')}
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated list of email addresses
                    </p>
                    {createForm.formState.errors.recipients && (
                      <p className="text-xs text-destructive">
                        {createForm.formState.errors.recipients.message}
                      </p>
                    )}
                  </div>
                  <Alert>
                    <AlertTitle>Configuration Required</AlertTitle>
                    <AlertDescription>
                      Email delivery requires{' '}
                      <code className="text-xs bg-muted px-1 rounded">RESEND_API_KEY</code>{' '}
                      environment variable. Get an API key from{' '}
                      <a
                        href="https://resend.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        resend.com
                      </a>
                      .
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="create-url">
                    {watchedType === 'DISCORD'
                      ? 'Discord Webhook URL'
                      : watchedType === 'SLACK'
                        ? 'Slack Webhook URL'
                        : 'Webhook URL'}
                  </Label>
                  <Input
                    id="create-url"
                    type="url"
                    placeholder={
                      watchedType === 'DISCORD'
                        ? 'https://discord.com/api/webhooks/...'
                        : watchedType === 'SLACK'
                          ? 'https://hooks.slack.com/services/...'
                          : 'https://your-server.com/webhook'
                    }
                    {...createForm.register('url')}
                  />
                  {watchedType === 'DISCORD' && (
                    <p className="text-xs text-muted-foreground">
                      Server Settings → Integrations → Webhooks
                    </p>
                  )}
                  {watchedType === 'SLACK' && (
                    <p className="text-xs text-muted-foreground">
                      Apps → Incoming Webhooks → Add New Webhook
                    </p>
                  )}
                  {createForm.formState.errors.url && (
                    <p className="text-xs text-destructive">
                      {createForm.formState.errors.url.message}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Events</Label>
                <div className="space-y-4 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {EVENT_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {group.label}
                      </p>
                      <div className="space-y-2 pl-2">
                        {group.events.map((event) => (
                          <Controller
                            key={event.value}
                            control={createForm.control}
                            name="events"
                            render={({ field }) => (
                              <Label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={field.value.includes(event.value)}
                                  onCheckedChange={(checked) => {
                                    const newValue = checked
                                      ? [...field.value, event.value]
                                      : field.value.filter((v) => v !== event.value);
                                    field.onChange(newValue);
                                  }}
                                />
                                {event.label}
                              </Label>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {createForm.formState.errors.events && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.events.message}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-maxRetries">Max Retries</Label>
                  <Input
                    id="create-maxRetries"
                    type="number"
                    min="0"
                    max="10"
                    {...createForm.register('maxRetries', { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-retryDelayMs">Retry Delay (ms)</Label>
                  <Input
                    id="create-retryDelayMs"
                    type="number"
                    min="1000"
                    max="60000"
                    step="1000"
                    {...createForm.register('retryDelayMs', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Controller
                  name="verbose"
                  control={createForm.control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <Label className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Verbose payloads (include detailed context)
                </Label>
              </div>

              {watchedType === 'CUSTOM' && (
                <p className="text-sm text-muted-foreground">
                  Custom webhooks receive raw JSON payloads with HMAC-SHA256 signatures. You will
                  receive a secret key after creation.
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create endpoint'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingEndpoint} onOpenChange={() => setEditingEndpoint(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit endpoint</DialogTitle>
              <DialogDescription>
                Update the webhook endpoint configuration. Type cannot be changed.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleUpdate}>
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" placeholder="My Webhook" {...updateForm.register('name')} />
                {updateForm.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {updateForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Input value={formatType(editingEndpoint?.type || 'CUSTOM')} disabled />
                <p className="text-xs text-muted-foreground">
                  Type cannot be changed after creation.
                </p>
              </div>

              {editingEndpoint?.type === 'EMAIL' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-recipients">Email Recipients</Label>
                    <Input
                      id="edit-recipients"
                      type="text"
                      placeholder="user@example.com, admin@example.com"
                      {...updateForm.register('recipients')}
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated list of email addresses
                    </p>
                    {updateForm.formState.errors.recipients && (
                      <p className="text-xs text-destructive">
                        {updateForm.formState.errors.recipients.message}
                      </p>
                    )}
                  </div>
                  <Alert>
                    <AlertTitle>Configuration Required</AlertTitle>
                    <AlertDescription>
                      Email delivery requires{' '}
                      <code className="text-xs bg-muted px-1 rounded">RESEND_API_KEY</code>{' '}
                      environment variable. Get an API key from{' '}
                      <a
                        href="https://resend.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        resend.com
                      </a>
                      .
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="edit-url">Webhook URL</Label>
                  <Input
                    id="edit-url"
                    type="url"
                    placeholder="https://..."
                    {...updateForm.register('url')}
                  />
                  {updateForm.formState.errors.url && (
                    <p className="text-xs text-destructive">
                      {updateForm.formState.errors.url.message}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Events</Label>
                <div className="space-y-4 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {EVENT_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {group.label}
                      </p>
                      <div className="space-y-2 pl-2">
                        {group.events.map((event) => (
                          <Controller
                            key={event.value}
                            control={updateForm.control}
                            name="events"
                            render={({ field }) => (
                              <Label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={field.value.includes(event.value)}
                                  onCheckedChange={(checked) => {
                                    const newValue = checked
                                      ? [...field.value, event.value]
                                      : field.value.filter((v) => v !== event.value);
                                    field.onChange(newValue);
                                  }}
                                />
                                {event.label}
                              </Label>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {updateForm.formState.errors.events && (
                  <p className="text-xs text-destructive">
                    {updateForm.formState.errors.events.message}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-maxRetries">Max Retries</Label>
                  <Input
                    id="edit-maxRetries"
                    type="number"
                    min="0"
                    max="10"
                    {...updateForm.register('maxRetries', { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-retryDelayMs">Retry Delay (ms)</Label>
                  <Input
                    id="edit-retryDelayMs"
                    type="number"
                    min="1000"
                    max="60000"
                    step="1000"
                    {...updateForm.register('retryDelayMs', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Controller
                  name="verbose"
                  control={updateForm.control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <Label className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Verbose payloads
                </Label>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingEndpoint(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* View Details Dialog */}
        <EndpointDetailsDialog
          endpoint={viewingEndpoint}
          onClose={() => setViewingEndpoint(null)}
          onRotateSecret={async (id) => {
            await rotateSecretMutation.mutateAsync({ id });
          }}
          rotatingSecret={rotateSecretMutation.isPending}
        />

        <SecretDisplayDialog
          open={showSecretDialog}
          onOpenChange={setShowSecretDialog}
          title="Webhook Secret"
          description="Save this secret - you will not be able to see it again. Webhooks are signed with HMAC-SHA256. Verify the X-Webhook-Signature header."
          secret={newEndpointSecret}
          secretLabel="Secret"
        />

        <ConfirmDialog
          open={!!deleteConfirm}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Delete endpoint"
          description={`Are you sure you want to delete ${deleteConfirm?.name ?? 'this endpoint'}? This will also delete all delivery history.`}
          isLoading={deleteMutation.isPending}
          onConfirm={handleDelete}
          confirmText="Delete"
          loadingText="Deleting..."
          confirmVariant="destructive"
        />
      </div>
    </AdminLayout>
  );
}

// Endpoint details dialog with delivery history
function EndpointDetailsDialog({
  endpoint,
  onClose,
  onRotateSecret,
  rotatingSecret,
}: {
  endpoint: WebhookEndpointItem | null;
  onClose: () => void;
  onRotateSecret: (id: string) => Promise<void>;
  rotatingSecret: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'deliveries'>('details');
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [fetchingSecret, setFetchingSecret] = useState(false);

  const utils = trpc.useUtils();

  const endpointQuery = trpc.admin.webhooks.get.useQuery(
    { id: endpoint?.id || '' },
    { enabled: !!endpoint },
  );

  const deliveriesQuery = trpc.admin.webhooks.listDeliveries.useQuery(
    { endpointId: endpoint?.id || '', limit: 50 },
    { enabled: !!endpoint && activeTab === 'deliveries' },
  );

  const retryMutation = trpc.admin.webhooks.retryDelivery.useMutation({
    onSuccess: () => {
      deliveriesQuery.refetch();
    },
  });

  const handleRevealSecret = async () => {
    if (!endpoint) return;
    if (revealedSecret) {
      setRevealedSecret(null);
    } else {
      setFetchingSecret(true);
      try {
        const data = await utils.admin.webhooks.getSecret.fetch({ id: endpoint.id });
        setRevealedSecret(data.secret || null);
      } finally {
        setFetchingSecret(false);
      }
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!endpoint) {
      setRevealedSecret(null);
      setActiveTab('details');
    }
  }, [endpoint]);

  if (!endpoint) return null;

  const data = endpointQuery.data;
  const deliveries: WebhookDeliveryItem[] = deliveriesQuery.data?.deliveries ?? [];

  return (
    <Dialog open={!!endpoint} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{endpoint.name}</DialogTitle>
          <DialogDescription>Endpoint details and delivery history.</DialogDescription>
        </DialogHeader>

        {/* Tab buttons */}
        <div className="flex gap-2 border-b pb-2">
          <Button
            variant={activeTab === 'details' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('details')}
          >
            Details
          </Button>
          <Button
            variant={activeTab === 'deliveries' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('deliveries')}
          >
            Deliveries
          </Button>
        </div>

        {activeTab === 'details' && (
          <div className="space-y-4">
            {endpointQuery.isPending ? (
              <div className="py-8 text-center text-muted-foreground">Loading...</div>
            ) : data ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">Type</Label>
                    <p>
                      {data.type === 'DISCORD' && 'Discord'}
                      {data.type === 'SLACK' && 'Slack'}
                      {data.type === 'EMAIL' && 'Email'}
                      {data.type === 'CUSTOM' && 'Custom'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p>{data.enabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Verbose Payloads</Label>
                    <p>{data.verbose ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Total Deliveries</Label>
                    <p>{data.totalDeliveries}</p>
                  </div>
                  {data.url && (
                    <div className="sm:col-span-2">
                      <Label className="text-muted-foreground">URL</Label>
                      <p className="font-mono text-sm break-all">{data.url}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Max Retries</Label>
                    <p>{data.maxRetries}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Retry Delay</Label>
                    <p>{data.retryDelayMs}ms</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Created</Label>
                    <p>{formatShortDate(data.createdAt)}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground">Subscribed Events</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.events.map((event) => (
                      <span key={event} className="text-xs bg-muted px-2 py-1 rounded">
                        {ALL_EVENTS.find((e) => e.value === event)?.label || event}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Secret management for CUSTOM type */}
                {data.type === 'CUSTOM' && (
                  <div className="border-t pt-4 space-y-3">
                    <Label className="text-muted-foreground">Webhook Secret</Label>
                    {revealedSecret ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted px-2 py-1 rounded break-all">
                          {revealedSecret}
                        </code>
                        <Button variant="ghost" size="sm" onClick={handleRevealSecret}>
                          Hide
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRevealSecret}
                          disabled={fetchingSecret}
                        >
                          {fetchingSecret ? 'Loading...' : 'Reveal Secret'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRotateSecret(endpoint.id)}
                          disabled={rotatingSecret}
                        >
                          {rotatingSecret ? 'Rotating...' : 'Rotate Secret'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {activeTab === 'deliveries' && (
          <div>
            {deliveriesQuery.isPending ? (
              <TableSkeleton />
            ) : deliveries.length > 0 ? (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="text-sm">
                          {ALL_EVENTS.find((e) => e.value === delivery.event)?.label ||
                            delivery.event}
                        </TableCell>
                        <TableCell>
                          {delivery.deliveredAt ? (
                            <span className="text-green-600">{delivery.responseStatus}</span>
                          ) : delivery.failedAt ? (
                            <span className="text-destructive">Failed</span>
                          ) : delivery.nextRetryAt ? (
                            <span className="text-muted-foreground">Pending</span>
                          ) : (
                            <span className="text-muted-foreground">In Progress</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatShortDate(delivery.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {!delivery.deliveredAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => retryMutation.mutate({ id: delivery.id })}
                              disabled={retryMutation.isPending}
                            >
                              Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                title="No deliveries"
                description="Deliveries will appear here once events are triggered."
              />
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
