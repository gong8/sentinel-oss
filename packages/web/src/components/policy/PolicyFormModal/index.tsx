import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { matcherFromUI, toolPatternFromUI } from '../../../lib/policyUtils';
import { trpc } from '../../../lib/trpc';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { ModeToggle } from '../../ui/mode-toggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Separator } from '../../ui/separator';
import { Switch } from '../../ui/switch';
import type { ConditionOperator, PolicyCondition } from '../ConditionBuilder';
import type { ConditionGroupNode } from '../ConditionBuilder/ChipBuilder/types';

import { ConditionsModal } from '../ConditionsModal';
import { MatcherSelector } from '../MatcherSelector';
import { PolicyTagSelector } from '../PolicyTagSelector';
import { ToolPatternSelector } from '../ToolPatternSelector';
import {
  DEFAULT_FORM_VALUES,
  policyFormSchema,
  type PolicyFormModalProps,
  type PolicyFormValues,
} from './types';

const effectOptions = ['ALLOW', 'DENY'] as const;

/**
 * Operator labels for preview display
 */
const operatorLabels: Record<string, string> = {
  equals: '=',
  notEquals: '≠',
  contains: 'contains',
  notContains: '!contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  matches: 'matches',
  lessThan: '<',
  greaterThan: '>',
  between: 'between',
  in: 'in',
  notIn: 'not in',
  containsAny: 'has any',
  containsNone: 'has none',
  exists: 'exists',
  notExists: '!exists',
  inCidr: 'in CIDR',
  notInCidr: '!in CIDR',
};

/**
 * Format condition value for preview display
 */
function formatConditionValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    if (value.length <= 2) {
      return value.map((v) => (typeof v === 'string' ? v : String(v))).join(', ');
    }
    return `${value.length} items`;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * Convert a simple condition value to expression syntax
 */
function formatValue(value: unknown, operator: ConditionOperator): string {
  if (value === null || value === undefined) return 'null';

  // Handle arrays for IN/NOT IN operators
  if (Array.isArray(value)) {
    const formatted = value.map((v) => {
      if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return String(v);
    });
    return `[${formatted.join(', ')}]`;
  }

  // Handle strings - need quoting for most operators
  if (typeof value === 'string') {
    // For LIKE operator, the pattern includes wildcards
    if (operator === 'contains') {
      return `'%${value.replace(/'/g, "\\'")}%'`;
    }
    if (operator === 'startsWith') {
      return `'${value.replace(/'/g, "\\'")}%'`;
    }
    if (operator === 'endsWith') {
      return `'%${value.replace(/'/g, "\\'")}'`;
    }
    // For MATCHES (regex), keep the pattern as-is
    if (operator === 'matches') {
      return `'${value.replace(/'/g, "\\'")}'`;
    }
    // Regular string comparison
    return `'${value.replace(/'/g, "\\'")}'`;
  }

  // Handle booleans
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  // Handle numbers
  return String(value);
}

/**
 * Convert a single simple condition to expression syntax
 */
function conditionToExpression(condition: PolicyCondition): string {
  const { field, operator, value, valueRef } = condition;

  // If using a variable reference, use the variable name directly
  const rightSide = valueRef ? valueRef : formatValue(value, operator);

  switch (operator) {
    case 'equals':
      return `${field} = ${rightSide}`;
    case 'notEquals':
      return `${field} != ${rightSide}`;
    case 'lessThan':
      return `${field} < ${rightSide}`;
    case 'greaterThan':
      return `${field} > ${rightSide}`;
    case 'between':
      // Between expects an array of [min, max]
      if (Array.isArray(value) && value.length === 2) {
        const min = valueRef ? `${valueRef}[0]` : formatValue(value[0], operator);
        const max = valueRef ? `${valueRef}[1]` : formatValue(value[1], operator);
        return `(${field} >= ${min}) AND (${field} <= ${max})`;
      }
      return `${field} = ${rightSide}`;
    case 'contains':
      return `${field} LIKE ${rightSide}`;
    case 'notContains':
      return `NOT (${field} LIKE ${rightSide})`;
    case 'startsWith':
      return `${field} LIKE ${rightSide}`;
    case 'endsWith':
      return `${field} LIKE ${rightSide}`;
    case 'matches':
      return `${field} MATCHES ${rightSide}`;
    case 'in':
      return `${field} IN ${rightSide}`;
    case 'notIn':
      return `${field} NOT IN ${rightSide}`;
    case 'containsAny':
      // Array contains any of the values
      if (Array.isArray(value)) {
        const checks = value.map((v) => `CONTAINS(${field}, ${formatValue(v, operator)})`);
        if (checks.length === 1) return checks[0];
        return `(${checks.join(' OR ')})`;
      }
      return `CONTAINS(${field}, ${rightSide})`;
    case 'containsNone':
      // Array contains none of the values
      if (Array.isArray(value)) {
        const checks = value.map((v) => `NOT CONTAINS(${field}, ${formatValue(v, operator)})`);
        if (checks.length === 1) return checks[0];
        return `(${checks.join(' AND ')})`;
      }
      return `NOT CONTAINS(${field}, ${rightSide})`;
    case 'exists':
      return `EXISTS(${field})`;
    case 'notExists':
      return `NOT EXISTS(${field})`;
    case 'inCidr':
      return `${field} IN_CIDR ${rightSide}`;
    case 'notInCidr':
      return `${field} NOT IN_CIDR ${rightSide}`;
    default:
      return `${field} = ${rightSide}`;
  }
}

/**
 * Convert an array of simple conditions to an advanced expression string.
 * Simple conditions use AND logic between all conditions.
 */
function conditionsToExpression(conditions: PolicyCondition[]): string {
  if (conditions.length === 0) return '';
  if (conditions.length === 1) return conditionToExpression(conditions[0]);

  // Wrap each condition in parens and join with AND
  const expressions = conditions.map((c) => `(${conditionToExpression(c)})`);
  return expressions.join(' AND ');
}

export function PolicyFormModal({
  open,
  onOpenChange,
  mode,
  defaultValues,
  onSubmit,
  isSubmitting = false,
  isLoading = false,
  error,
  users,
  roles,
  agents,
  mcpServers,
  a2aAgents,
  workspaces,
  isOrgOwner,
  tags,
  onCreateTag,
  isCreatingTag,
  getToolsForServer,
  isToolFlagged,
  getToolFlagCountsForServer,
  toolFlagData,
  categories: _categories,
  operators,
  onGenerateDescription,
  prefillRequest,
  submitButtonText,
  submitButtonLoadingText,
  extraFooterButtons,
  reviewNote,
  onReviewNoteChange,
  readOnly = false,
}: PolicyFormModalProps) {
  const [requestCardOpen, setRequestCardOpen] = useState(Boolean(prefillRequest));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conditionsModalOpen, setConditionsModalOpen] = useState(false);
  const [showSwitchToSimpleConfirm, setShowSwitchToSimpleConfirm] = useState(false);
  const [showSwitchToAdvancedConfirm, setShowSwitchToAdvancedConfirm] = useState(false);

  // Fetch org settings for default condition mode
  const orgSettingsQuery = trpc.admin.orgSettings.get.useQuery(undefined, {
    enabled: mode === 'create',
  });

  // Compute the effective default condition mode
  const effectiveDefaultConditionMode = useMemo(() => {
    // Use explicit default from props if provided
    if (defaultValues?.conditionMode) return defaultValues.conditionMode;
    // Use org settings default for create mode
    if (mode === 'create' && orgSettingsQuery.data) {
      return orgSettingsQuery.data.defaultConditionMode;
    }
    // Fallback to SIMPLE
    return 'SIMPLE';
  }, [defaultValues?.conditionMode, mode, orgSettingsQuery.data]);

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: {
      ...DEFAULT_FORM_VALUES,
      ...defaultValues,
      conditionMode: effectiveDefaultConditionMode,
    },
  });

  // Reset form when defaultValues change (e.g., when editing different policy)
  useEffect(() => {
    if (defaultValues) {
      form.reset({
        ...DEFAULT_FORM_VALUES,
        ...defaultValues,
        conditionMode: defaultValues.conditionMode ?? effectiveDefaultConditionMode,
      });
    }
  }, [defaultValues, effectiveDefaultConditionMode, form]);

  // Handle modal close and reset state
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form and UI state when closing
      form.reset({ ...DEFAULT_FORM_VALUES, conditionMode: effectiveDefaultConditionMode });
      setRequestCardOpen(Boolean(prefillRequest));
      setPreviewOpen(false);
    }
    onOpenChange(newOpen);
  };

  // Watch form values for validation indicators and preview
  const matchers = useWatch({ control: form.control, name: 'matchers' });
  const toolPatterns = useWatch({ control: form.control, name: 'toolPatterns' });
  const conditions = useWatch({ control: form.control, name: 'conditions' });
  const conditionsTree = useWatch({ control: form.control, name: 'conditionsTree' });
  const conditionMode = useWatch({ control: form.control, name: 'conditionMode' });
  const conditionExpression = useWatch({ control: form.control, name: 'conditionExpression' });
  const description = useWatch({ control: form.control, name: 'description' });
  const effect = useWatch({ control: form.control, name: 'effect' });
  const enabled = useWatch({ control: form.control, name: 'enabled' });
  const tagIds = useWatch({ control: form.control, name: 'tagIds' });
  const formWorkspaceId = useWatch({ control: form.control, name: 'workspaceId' });

  // Build fully-qualified tool pattern strings for dynamic categories query
  const qualifiedToolPatterns = useMemo(() => {
    return (toolPatterns ?? [])
      .filter((tp) => tp.server && tp.tool)
      .map((tp) => `${tp.server}::${tp.tool}`);
  }, [toolPatterns]);

  // Tool parameters are only available when exactly one specific tool is selected (no wildcards)
  const hasSpecificSingleTool = useMemo(() => {
    if (!toolPatterns || toolPatterns.length !== 1) return false;
    const pattern = toolPatterns[0];
    // Must have both server and tool, neither can be wildcard
    return Boolean(
      pattern.server && pattern.tool && pattern.server !== '*' && pattern.tool !== '*',
    );
  }, [toolPatterns]);

  // Check if there are any tool parameter conditions (params.* fields)
  const hasParamConditions = useMemo(() => {
    // Check conditions array for params.* fields
    if (conditions && conditions.some((c) => c.field.startsWith('params.'))) {
      return true;
    }
    // Check condition expression for params.* references
    if (conditionExpression && conditionExpression.includes('params.')) {
      return true;
    }
    return false;
  }, [conditions, conditionExpression]);

  // Compute form validation state
  const isFormValid =
    (description?.length ?? 0) >= 4 &&
    (matchers?.length ?? 0) > 0 &&
    matchers?.every((m) => m.type === 'all' || m.value.length > 0) === true &&
    (toolPatterns?.length ?? 0) > 0;

  const conditionCount = conditions?.length ?? 0;

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit(values);
  });

  const handleGenerateDescription = () => {
    if (!onGenerateDescription) return;

    const currentValues = form.getValues();
    const generated = onGenerateDescription(currentValues);
    form.setValue('description', generated, { shouldValidate: true });
  };

  // Handle switching to advanced mode - convert simple conditions to expression
  const handleSwitchToAdvanced = useCallback(() => {
    // Convert existing simple conditions to an expression
    if (conditions && conditions.length > 0) {
      const expression = conditionsToExpression(conditions);
      form.setValue('conditionExpression', expression, { shouldValidate: true });
      // Clear simple conditions since we're moving to advanced
      form.setValue('conditions', null, { shouldValidate: true });
    }
    form.setValue('conditionMode', 'ADVANCED', { shouldValidate: true });
  }, [conditions, form]);

  // Check if there are any existing conditions (either flat array or tree)
  const hasExistingConditions = useMemo(() => {
    if (conditions && conditions.length > 0) return true;
    const tree = conditionsTree as ConditionGroupNode | null;
    if (tree && tree.children && tree.children.length > 0) return true;
    return false;
  }, [conditions, conditionsTree]);

  // Handle condition mode toggle change
  const handleConditionModeChange = useCallback(
    (newMode: 'SIMPLE' | 'ADVANCED') => {
      if (newMode === 'SIMPLE') {
        if (conditionMode === 'ADVANCED' && conditionExpression) {
          // Warn before switching away from advanced with content
          setShowSwitchToSimpleConfirm(true);
        } else {
          form.setValue('conditionMode', 'SIMPLE', { shouldValidate: true });
        }
      } else {
        // Switching to advanced - warn if there are existing conditions
        if (hasExistingConditions) {
          setShowSwitchToAdvancedConfirm(true);
        } else {
          handleSwitchToAdvanced();
        }
      }
    },
    [conditionMode, conditionExpression, form, handleSwitchToAdvanced, hasExistingConditions],
  );

  // Mode toggle options for condition mode
  const conditionModeOptions = [
    { value: 'SIMPLE' as const, label: 'Simple' },
    { value: 'ADVANCED' as const, label: 'Advanced' },
  ];

  // Build preview JSON
  const previewPolicy = {
    matchers: (matchers ?? []).map((m) => matcherFromUI(m.type, m.value)).filter(Boolean),
    toolPatterns: (toolPatterns ?? []).map((tp) => toolPatternFromUI(tp.server, tp.tool)),
    effect,
    description,
    enabled,
    ...(conditions && { conditions }),
    ...(conditionMode && { conditionMode }),
    ...(conditionExpression && { conditionExpression }),
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? 'View policy' : mode === 'create' ? 'Create policy' : 'Edit policy'}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'This is a global policy. Only organization owners can edit global policies.'
              : 'Policies control tool access. DENY policies always take precedence.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mx-0 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-destructive font-bold">!</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-destructive">Failed to save policy</div>
                <div className="text-xs text-destructive/80 mt-1 break-words">{error}</div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-sm text-muted-foreground">Loading policy details...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto py-4 space-y-6 min-h-0">
              {/* Request Reference Card (when creating from permission request) */}
              {prefillRequest && mode === 'create' && (
                <Collapsible open={requestCardOpen} onOpenChange={setRequestCardOpen}>
                  <div className="rounded-lg border bg-muted/30">
                    <CollapsibleTrigger className="flex w-full items-center justify-between p-3 hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Resolving Request
                        </Badge>
                        <span className="text-sm text-muted-foreground font-mono">
                          {prefillRequest.requestId.slice(0, 8)}...
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {requestCardOpen ? 'Hide' : 'Show'}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t px-3 py-3 space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">
                            Request ID:
                          </span>
                          <span className="font-mono text-xs">{prefillRequest.requestId}</span>
                        </div>
                        {prefillRequest.reason && (
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground w-20 flex-shrink-0">
                              Reason:
                            </span>
                            <span className="text-muted-foreground italic">
                              {prefillRequest.reason}
                            </span>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-20 flex-shrink-0">
                            Requested:
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(prefillRequest.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              {/* Comment for request resolution */}
              {prefillRequest && onReviewNoteChange && (
                <div className="space-y-2">
                  <Label htmlFor="review-note">Comment (optional)</Label>
                  <Input
                    id="review-note"
                    placeholder="Add a comment for the requester..."
                    value={reviewNote ?? ''}
                    onChange={(e) => onReviewNoteChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be visible to the user who made the request.
                  </p>
                </div>
              )}

              {/* Description with Generate button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${mode}-description`}>
                    Description <span className="text-destructive">*</span>
                  </Label>
                  {onGenerateDescription && !readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateDescription}
                      disabled={(matchers?.length ?? 0) === 0}
                      className="h-7 text-xs"
                    >
                      Generate
                    </Button>
                  )}
                </div>
                <Input
                  id={`${mode}-description`}
                  placeholder="Allow admins to use all tools"
                  readOnly={readOnly}
                  {...form.register('description')}
                />
                {form.formState.errors.description ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.description.message}
                  </p>
                ) : null}
              </div>

              {/* Effect, Status, and Scope */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>
                    Effect <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    control={form.control}
                    name="effect"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={readOnly}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select effect" />
                        </SelectTrigger>
                        <SelectContent>
                          {effectOptions.map((effect) => (
                            <SelectItem key={effect} value={effect}>
                              {effect}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Controller
                    control={form.control}
                    name="workspaceId"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? 'global'}
                        onValueChange={(value) => field.onChange(value === 'global' ? null : value)}
                        disabled={readOnly || mode === 'create'}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select scope" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Show Global option if org owner OR if viewing a global policy (readOnly mode with null workspaceId) */}
                          {(isOrgOwner || (readOnly && field.value === null)) && (
                            <SelectItem value="global">Global (all workspaces)</SelectItem>
                          )}
                          {workspaces?.map((workspace) => (
                            <SelectItem key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-3 h-10">
                    <Controller
                      control={form.control}
                      name="enabled"
                      render={({ field }) => (
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={readOnly}
                        />
                      )}
                    />
                    <span className="text-sm text-muted-foreground">
                      {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags (optional) */}
              {tags && (
                <PolicyTagSelector
                  tags={tags}
                  selectedTagIds={tagIds ?? []}
                  onChange={(ids) => form.setValue('tagIds', ids, { shouldValidate: true })}
                  onCreateTag={onCreateTag}
                  disabled={readOnly}
                  readOnly={readOnly}
                  isCreating={isCreatingTag}
                  label="Tags"
                  description="Organize policies with tags for filtering and bulk operations."
                  workspaceId={formWorkspaceId}
                  isOrgOwner={isOrgOwner}
                  workspaces={workspaces}
                />
              )}

              {/* Applies To (Matcher Selector) - use component's built-in label */}
              <MatcherSelector
                matchers={matchers ?? []}
                onChange={(newMatchers) =>
                  form.setValue('matchers', newMatchers, { shouldValidate: true })
                }
                users={users}
                roles={roles}
                agents={agents}
                error={
                  typeof form.formState.errors.matchers?.message === 'string'
                    ? form.formState.errors.matchers.message
                    : undefined
                }
                readOnly={readOnly}
              />

              {/* Tools (Tool Pattern Selector) - use component's built-in label */}
              <ToolPatternSelector
                patterns={toolPatterns ?? []}
                onChange={(patterns) =>
                  form.setValue('toolPatterns', patterns, { shouldValidate: true })
                }
                mcpServers={mcpServers ?? []}
                a2aAgents={a2aAgents ?? []}
                getToolsForServer={getToolsForServer ?? (() => [])}
                isToolFlagged={isToolFlagged}
                getToolFlagCountsForServer={getToolFlagCountsForServer}
                toolFlagData={toolFlagData}
                error={
                  typeof form.formState.errors.toolPatterns?.message === 'string'
                    ? form.formState.errors.toolPatterns.message
                    : undefined
                }
                readOnly={readOnly}
                hasParamConditions={hasParamConditions}
              />

              {/* Conditions Section */}
              <div className="space-y-2">
                <Separator />
                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <Label>Conditions</Label>
                    {(conditionExpression || conditionCount > 0) && (
                      <Badge variant="secondary" className="text-xs">
                        {conditionExpression
                          ? conditionMode === 'ADVANCED'
                            ? 'Expression'
                            : 'Visual'
                          : `${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add conditions to restrict when this policy applies.
                  </p>

                  {/* Mode selector - hide in readOnly mode */}
                  {!readOnly && (
                    <ModeToggle
                      value={conditionMode ?? 'SIMPLE'}
                      onChange={handleConditionModeChange}
                      options={conditionModeOptions}
                      className="mt-2 self-start w-fit"
                    />
                  )}

                  {/* Display based on content - expression takes priority */}
                  {conditionExpression && conditionExpression.trim().length > 0 ? (
                    // Show expression preview (both SIMPLE and ADVANCED modes now use expressions)
                    <div className="mt-3 relative group">
                      <pre className="p-3 pr-10 text-sm font-mono bg-muted/50 border rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
                        {conditionExpression}
                      </pre>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-70 hover:opacity-100"
                          onClick={() => setConditionsModalOpen(true)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Edit conditions</span>
                        </Button>
                      )}
                    </div>
                  ) : conditionCount > 0 ? (
                    // Backward compatibility: show flat conditions if no expression (legacy data)
                    <div className="mt-3 relative group">
                      <div
                        className={`p-3 ${readOnly ? '' : 'pr-10'} text-sm bg-muted/50 border rounded-lg`}
                      >
                        <ul className="space-y-1">
                          {(conditions ?? []).slice(0, 3).map((c, i) => (
                            <li key={i} className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                                {c.field}
                              </code>
                              <span className="text-xs text-muted-foreground">
                                {operatorLabels[c.operator] ?? c.operator}
                              </span>
                              {c.valueRef ? (
                                <span className="text-xs font-medium text-primary">
                                  <span className="text-muted-foreground mr-1">$</span>
                                  {c.valueRef}
                                </span>
                              ) : c.value !== undefined ? (
                                <span className="text-xs font-medium">
                                  {formatConditionValue(c.value)}
                                </span>
                              ) : null}
                            </li>
                          ))}
                          {conditionCount > 3 && (
                            <li className="text-xs text-muted-foreground">
                              +{conditionCount - 3} more...
                            </li>
                          )}
                        </ul>
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-70 hover:opacity-100"
                          onClick={() => setConditionsModalOpen(true)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Edit conditions</span>
                        </Button>
                      )}
                    </div>
                  ) : !readOnly ? (
                    // Show add button when empty (only if not readOnly)
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => setConditionsModalOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {conditionMode === 'ADVANCED' ? 'Add Expression' : 'Add Conditions'}
                    </Button>
                  ) : (
                    // In readOnly mode with no conditions, show "No conditions"
                    <p className="mt-3 text-sm text-muted-foreground">No conditions defined.</p>
                  )}
                  <ConditionsModal
                    open={conditionsModalOpen}
                    onOpenChange={setConditionsModalOpen}
                    value={conditions ?? null}
                    onChange={(c) => form.setValue('conditions', c, { shouldValidate: true })}
                    conditionsTree={(conditionsTree as ConditionGroupNode) ?? null}
                    onConditionsTreeChange={(tree) =>
                      form.setValue('conditionsTree', tree, { shouldValidate: true })
                    }
                    conditionMode={conditionMode ?? 'SIMPLE'}
                    onConditionModeChange={(mode) =>
                      form.setValue('conditionMode', mode, { shouldValidate: true })
                    }
                    advancedExpression={conditionExpression ?? ''}
                    onAdvancedExpressionChange={(expr) =>
                      form.setValue('conditionExpression', expr, { shouldValidate: true })
                    }
                    toolPatterns={qualifiedToolPatterns}
                    showToolParameters={hasSpecificSingleTool}
                    operators={
                      operators ?? {
                        comparison: [],
                        string: [],
                        collection: [],
                        existence: [],
                        network: [],
                      }
                    }
                  />

                  {/* Confirmation modal for switching from Advanced to Simple */}
                  <Dialog
                    open={showSwitchToSimpleConfirm}
                    onOpenChange={setShowSwitchToSimpleConfirm}
                  >
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Switch to Simple Mode?</DialogTitle>
                        <DialogDescription>
                          Switching to Simple mode will clear your expression. This cannot be
                          undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowSwitchToSimpleConfirm(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => {
                            form.setValue('conditionMode', 'SIMPLE', { shouldValidate: true });
                            form.setValue('conditionExpression', '', { shouldValidate: true });
                            setShowSwitchToSimpleConfirm(false);
                          }}
                        >
                          Switch to Simple
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Confirmation modal for switching from Simple to Advanced */}
                  <Dialog
                    open={showSwitchToAdvancedConfirm}
                    onOpenChange={setShowSwitchToAdvancedConfirm}
                  >
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                          Switch to Advanced Mode?
                        </DialogTitle>
                        <DialogDescription className="space-y-2 pt-2">
                          <p>
                            Advanced mode uses a SQL-like expression language for complex
                            conditions. This is a <strong>one-way conversion</strong> - you cannot
                            switch back to the visual builder once you switch to advanced mode.
                          </p>
                          <p>Your existing conditions will be converted to an expression.</p>
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowSwitchToAdvancedConfirm(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            handleSwitchToAdvanced();
                            setShowSwitchToAdvancedConfirm(false);
                          }}
                        >
                          Switch to Advanced
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* JSON Preview */}
              <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
                <div className="rounded-lg border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between p-3 hover:bg-muted/50">
                    <span className="font-medium text-sm">JSON Preview</span>
                    <span className="text-xs text-muted-foreground">View raw JSON</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t">
                      <pre className="p-3 text-xs overflow-x-auto bg-muted/30 max-h-64 overflow-y-auto">
                        {JSON.stringify(previewPolicy, null, 2)}
                      </pre>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>

            <DialogFooter className="border-t pt-4">
              {!readOnly && (
                <div className="flex items-center gap-2 mr-auto">
                  {isFormValid ? (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Ready to save
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Fill required fields
                    </span>
                  )}
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly && extraFooterButtons}
              {!readOnly && (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? (submitButtonLoadingText ?? (mode === 'create' ? 'Creating...' : 'Saving...'))
                    : (submitButtonText ?? (mode === 'create' ? 'Create policy' : 'Save changes'))}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Re-export types for convenience
export { DEFAULT_FORM_VALUES, policyFormSchema } from './types';
export type { PolicyFormModalProps, PolicyFormValues } from './types';
