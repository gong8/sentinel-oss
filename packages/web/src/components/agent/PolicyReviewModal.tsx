/**
 * Policy Review Modal
 * Displays the PolicyFormModal with pre-filled values from a pending confirmation.
 * Allows admins to review and edit policy changes before confirming.
 */

import { useMemo, useState } from 'react';

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
  type ToolPatternEntry,
} from '../../lib/policyUtils';
import { trpc } from '../../lib/trpc';
import type { CategoryOption, OperatorGroups, PolicyConditions } from '../policy/ConditionBuilder';
import { PolicyFormModal, type PolicyFormValues } from '../policy/PolicyFormModal/index';
import type { PendingConfirmation } from './ConfirmationCard';

interface PolicyReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmation: PendingConfirmation;
  onSubmit: (confirmationId: string, modifiedInput: unknown) => void;
  isSubmitting: boolean;
  error?: string | null;
}

// Type for policy input from the agent
interface PolicyToolInput {
  matchers?: string[];
  toolPatterns?: string[];
  effect?: 'ALLOW' | 'DENY';
  description?: string;
  enabled?: boolean;
  conditions?: unknown;
  id?: string; // For update_policy
  requestId?: string; // For linking to a permission request
  reviewNote?: string; // Comment for permission request approval
  workspaceId?: string | null; // For workspace-scoped policies (null = global)
}

/**
 * Convert API-format policy input to UI form values
 */
function convertToFormValues(input: PolicyToolInput): Partial<PolicyFormValues> {
  const matchersUI: MatcherEntry[] = [];
  if (hasValidMatchers(input.matchers)) {
    for (const m of input.matchers) {
      const result = safeMatcherToUI(m);
      if (result.success) {
        matchersUI.push(result.data);
      }
    }
  }

  const toolPatternsUI: ToolPatternEntry[] = [];
  if (hasValidToolPatterns(input.toolPatterns)) {
    for (const tp of input.toolPatterns) {
      const result = safeToolPatternToUI(tp);
      if (result.success) {
        toolPatternsUI.push(result.data);
      }
    }
  }

  return {
    // Default to "all" (everyone) if no valid matchers - this is a complete valid state
    // unlike "role with empty value" which requires user to select a role
    matchers: matchersUI.length > 0 ? matchersUI : [{ type: 'all', value: '' }],
    toolPatterns: toolPatternsUI.length > 0 ? toolPatternsUI : [{ server: '*', tool: '*' }],
    effect: input.effect ?? 'ALLOW',
    description: input.description ?? '',
    enabled: input.enabled ?? true,
    conditions: normalizeConditions(input.conditions) as PolicyConditions | null,
  };
}

/**
 * Convert UI form values back to API format
 */
function convertFromFormValues(values: PolicyFormValues): PolicyToolInput {
  const result: PolicyToolInput = {
    matchers: values.matchers.map((m) => matcherFromUI(m.type, m.value)),
    toolPatterns: values.toolPatterns.map((tp) => toolPatternFromUI(tp.server, tp.tool)),
    effect: values.effect,
    description: values.description,
    enabled: values.enabled,
    // Include workspaceId for scoping (null = global, undefined = not set)
    workspaceId: values.workspaceId,
  };

  // Only include conditions if it's a non-empty array
  // API schema uses .optional() which doesn't accept null
  if (values.conditions && values.conditions.length > 0) {
    result.conditions = values.conditions;
  }

  return result;
}

export function PolicyReviewModal({
  open,
  onOpenChange,
  confirmation,
  onSubmit,
  isSubmitting,
  error,
}: PolicyReviewModalProps) {
  const input = confirmation.toolInput as PolicyToolInput | undefined;
  const isUpdate = confirmation.toolName === 'update_policy';
  const policyId = isUpdate ? input?.id : undefined;
  const requestId = input?.requestId;

  // State for review note when approving a permission request
  const [reviewNote, setReviewNote] = useState('');

  // For update operations, fetch the existing policy to merge with the changes
  const existingPolicyQuery = trpc.admin.policies.get.useQuery(
    { id: policyId ?? '' },
    { enabled: open && isUpdate && Boolean(policyId) },
  );

  // For create operations with a linked request, fetch the request details
  const permissionRequestQuery = trpc.admin.permissionRequests.get.useQuery(
    { id: requestId ?? '' },
    { enabled: open && !isUpdate && Boolean(requestId) },
  );

  // Fetch required data for the form
  const usersQuery = trpc.admin.users.list.useQuery(undefined, { enabled: open });
  const rolesQuery = trpc.admin.roles.list.useQuery(undefined, { enabled: open });
  const agentsQuery = trpc.admin.agents.list.useQuery(undefined, { enabled: open });
  const categoriesQuery = trpc.admin.conditions.getCategories.useQuery(undefined, {
    enabled: open,
  });
  const operatorsQuery = trpc.admin.conditions.getOperators.useQuery(undefined, { enabled: open });

  const { mcpServers, a2aAgents, getToolsForServer, isToolFlagged, getToolFlagCountsForServer } =
    useMcpServers();

  // Get workspace context for scope selection
  const { workspaces, isOrgOwner } = useWorkspace();

  // Type assertion needed to avoid deep type instantiation from tRPC recursive inference
  const existingPolicy = existingPolicyQuery.data as PolicyToolInput | undefined;

  // Convert toolInput to form default values
  // For updates, merge existing policy with the requested changes
  const defaultValues = useMemo((): Partial<PolicyFormValues> | undefined => {
    if (!input) {
      return undefined;
    }

    // For updates, merge existing policy with requested changes
    if (isUpdate && existingPolicy) {
      const merged: PolicyToolInput = {
        matchers: input.matchers ?? existingPolicy.matchers,
        toolPatterns: input.toolPatterns ?? existingPolicy.toolPatterns,
        effect: input.effect ?? existingPolicy.effect,
        description: input.description ?? existingPolicy.description,
        enabled: input.enabled ?? existingPolicy.enabled,
        conditions: input.conditions ?? existingPolicy.conditions ?? undefined,
      };
      return convertToFormValues(merged);
    }

    // For creates, generate a user-friendly description instead of using the agent's
    const formValues = convertToFormValues(input);

    // Generate a user-friendly description from form values (inlined to satisfy React Compiler)
    const { matchers = [], toolPatterns = [], effect = 'ALLOW' } = formValues;
    const effectStr = effect === 'ALLOW' ? 'Allow' : 'Deny';
    const matcherStrs = matchers.map((m) => {
      if (m.type === 'all') return 'all users';
      if (m.type === 'role') return `role '${m.value || '...'}'`;
      if (m.type === 'user') return m.value || '...';
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
    const toolCount = toolPatterns.length;
    const toolDisplay =
      toolCount === 1
        ? (() => {
            const tp = toolPatterns[0];
            if (tp.server === '*' && tp.tool === '*') return 'all tools';
            if (tp.tool === '*') return `all tools on '${tp.server}'`;
            return tp.tool;
          })()
        : `${toolCount} tools`;
    formValues.description = `${effectStr} ${matcherDisplay} to use ${toolDisplay}`;

    return formValues;
  }, [input, isUpdate, existingPolicy, agentsQuery.data]);

  // Handle form submission
  const handleSubmit = (values: PolicyFormValues) => {
    const input = confirmation.toolInput as PolicyToolInput | undefined;
    const modifiedInput = {
      ...convertFromFormValues(values),
      // Preserve the policy ID for update operations
      ...(input?.id && { id: input.id }),
      // Preserve the request ID to link and approve the request
      ...(input?.requestId && { requestId: input.requestId }),
      // Include review note when approving a permission request
      ...(input?.requestId && reviewNote.trim() && { reviewNote: reviewNote.trim() }),
    };
    onSubmit(confirmation.confirmationId, modifiedInput);
  };

  // Generate description function
  const generateDescription = (values: PolicyFormValues): string => {
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

      if (tool === '*') return `all tools on '${server}'`;
      return `tool '${tool}' on '${server}'`;
    });

    const toolDisplay =
      toolStrs.length === 1
        ? toolStrs[0]
        : toolStrs.length === 2
          ? `${toolStrs[0]} and ${toolStrs[1]}`
          : `${toolStrs.slice(0, -1).join(', ')}, and ${toolStrs.slice(-1)}`;

    return `${effectStr} ${matcherDisplay} to use ${toolDisplay}`;
  };

  // Show loading state while fetching existing policy for updates or permission request
  const isLoadingPolicy = isUpdate && existingPolicyQuery.isPending;
  const isLoadingRequest = !isUpdate && Boolean(requestId) && permissionRequestQuery.isPending;

  // Build prefillRequest prop for the form if we have a linked permission request
  const prefillRequest = permissionRequestQuery.data
    ? {
        requestId: permissionRequestQuery.data.id,
        userEmail: permissionRequestQuery.data.user.email,
        toolNames: permissionRequestQuery.data.toolNames,
        reason: permissionRequestQuery.data.reason,
        createdAt: String(permissionRequestQuery.data.createdAt),
      }
    : undefined;

  // Reset review note when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReviewNote('');
    }
    onOpenChange(newOpen);
  };

  return (
    <PolicyFormModal
      open={open}
      onOpenChange={handleOpenChange}
      mode={isUpdate ? 'edit' : 'create'}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      isLoading={isLoadingPolicy || isLoadingRequest}
      error={error}
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
      categories={(categoriesQuery.data?.categories ?? []) as CategoryOption[]}
      operators={(operatorsQuery.data?.operators ?? {}) as OperatorGroups}
      onGenerateDescription={generateDescription}
      prefillRequest={prefillRequest}
      reviewNote={prefillRequest ? reviewNote : undefined}
      onReviewNoteChange={prefillRequest ? setReviewNote : undefined}
    />
  );
}
