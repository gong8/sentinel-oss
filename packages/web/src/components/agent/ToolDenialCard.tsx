/**
 * Tool Denial Card
 * Shows when a tool is denied with role-appropriate actions:
 * - Users: Request access options
 * - Admins: Add/remove policy options
 */

import { AlertTriangle, Lock, Plus, Server, Shield, Trash2 } from 'lucide-react';

import * as React from 'react';
import { toast } from 'sonner';
import {
  extractDomain,
  extractToolName,
  formatRawToolName,
  formatServerName,
} from '../../lib/mcpUtils';
import { matcherFromUI, toolPatternFromUI } from '../../lib/policyUtils';
import { trpc } from '../../lib/trpc';
import { PolicyFormModal } from '../policy/PolicyFormModal';
import type { PolicyFormValues } from '../policy/PolicyFormModal/types';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

export interface ToolDenialInfo {
  toolName: string;
  reason: string;
  serverDomain?: string;
  blockingPolicyId?: string;
}

interface ToolDenialCardProps {
  denial: ToolDenialInfo;
  workspaceId?: string;
  isAdmin: boolean;
  onClose?: () => void;
}

/**
 * Parses tool name into server and tool parts with friendly display names
 * Format: "domain::toolName" or just "toolName"
 */
function parseToolName(toolName: string): {
  server: string;
  tool: string;
  displayName: string;
  friendlyServerName: string;
} {
  const domain = extractDomain(toolName);
  const tool = extractToolName(toolName);

  if (domain) {
    return {
      server: domain,
      tool: tool,
      displayName: formatRawToolName(tool),
      friendlyServerName: formatServerName(domain),
    };
  }

  return {
    server: '*',
    tool: toolName,
    displayName: formatRawToolName(toolName),
    friendlyServerName: '',
  };
}

export function ToolDenialCard({ denial, workspaceId, isAdmin, onClose }: ToolDenialCardProps) {
  const { toolName, reason, serverDomain, blockingPolicyId } = denial;
  const { server, tool, displayName, friendlyServerName } = parseToolName(toolName);
  const friendlyDomain = serverDomain ? formatServerName(serverDomain) : friendlyServerName;

  // User request state
  const [requestType, setRequestType] = React.useState<'tool' | 'server' | null>(null);
  const [requestReason, setRequestReason] = React.useState('');

  // Admin state
  const [showAddPolicyModal, setShowAddPolicyModal] = React.useState(false);
  const [showRemovePolicyDialog, setShowRemovePolicyDialog] = React.useState(false);

  // User request mutations
  const requestToolAccessMutation = trpc.workspace.chat.requestToolAccess.useMutation({
    onSuccess: () => {
      toast.success('Access request submitted', {
        description: 'An administrator will review your request.',
      });
      setRequestType(null);
      setRequestReason('');
      onClose?.();
    },
    onError: (error) => {
      toast.error('Failed to submit request', { description: error.message });
    },
  });

  const requestServerAccessMutation = trpc.workspace.chat.requestServerAccess.useMutation({
    onSuccess: () => {
      toast.success('Access request submitted', {
        description: 'An administrator will review your request for server access.',
      });
      setRequestType(null);
      setRequestReason('');
      onClose?.();
    },
    onError: (error) => {
      toast.error('Failed to submit request', { description: error.message });
    },
  });

  // Admin mutations
  const utils = trpc.useUtils();

  const createPolicyMutation = trpc.admin.policies.create.useMutation({
    onSuccess: () => {
      toast.success('Policy created', {
        description: 'The ALLOW policy has been created successfully.',
      });
      setShowAddPolicyModal(false);
      utils.admin.policies.list.invalidate();
      onClose?.();
    },
    onError: (error) => {
      toast.error('Failed to create policy', { description: error.message });
    },
  });

  const deletePolicyMutation = trpc.admin.policies.delete.useMutation({
    onSuccess: () => {
      toast.success('Policy removed', {
        description: 'The blocking policy has been removed.',
      });
      setShowRemovePolicyDialog(false);
      utils.admin.policies.list.invalidate();
      onClose?.();
    },
    onError: (error) => {
      toast.error('Failed to remove policy', { description: error.message });
    },
  });

  // Fetch blocking policy details if admin and policy exists
  const blockingPolicyQuery = trpc.admin.policies.get.useQuery(
    { id: blockingPolicyId ?? '' },
    { enabled: isAdmin && !!blockingPolicyId },
  );

  // Data for policy form
  const usersQuery = trpc.admin.users.list.useQuery(undefined, {
    enabled: isAdmin && showAddPolicyModal,
  });
  const rolesQuery = trpc.admin.roles.list.useQuery(undefined, {
    enabled: isAdmin && showAddPolicyModal,
  });
  const agentsQuery = trpc.admin.agents.list.useQuery(undefined, {
    enabled: isAdmin && showAddPolicyModal,
  });

  const handleUserRequestSubmit = () => {
    if (!requestReason.trim() || !workspaceId) return;

    if (requestType === 'tool') {
      requestToolAccessMutation.mutate({
        workspaceId,
        toolName,
        reason: requestReason.trim(),
      });
    } else if (requestType === 'server' && serverDomain) {
      requestServerAccessMutation.mutate({
        workspaceId,
        serverDomain,
        reason: requestReason.trim(),
      });
    }
  };

  const handleCreatePolicy = (values: PolicyFormValues) => {
    createPolicyMutation.mutate({
      matchers: values.matchers.map((m) => matcherFromUI(m.type, m.value)),
      toolPatterns: values.toolPatterns.map((tp) => toolPatternFromUI(tp.server, tp.tool)),
      effect: values.effect,
      description: values.description,
      enabled: values.enabled,
      conditions: values.conditions ?? undefined,
      conditionMode: values.conditionMode,
      conditionExpression: values.conditionExpression,
      workspaceId: values.workspaceId ?? undefined,
    });
  };

  const handleRemoveBlockingPolicy = () => {
    if (!blockingPolicyId) return;
    deletePolicyMutation.mutate({ id: blockingPolicyId });
  };

  const isUserLoading =
    requestToolAccessMutation.isPending || requestServerAccessMutation.isPending;
  const isAdminLoading = createPolicyMutation.isPending || deletePolicyMutation.isPending;

  // Default form values for creating a new ALLOW policy
  const defaultPolicyValues: Partial<PolicyFormValues> = {
    matchers: [{ type: 'all', value: '' }],
    toolPatterns: [{ server: server || '*', tool: tool || '*' }],
    effect: 'ALLOW',
    description: `Allow access to ${displayName}`,
    enabled: true,
    workspaceId: workspaceId ?? null,
  };

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Lock className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="space-y-1 min-w-0">
          <p className="font-medium text-sm">Access Denied</p>
          <p className="text-sm text-muted-foreground">
            Unable to execute{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{displayName}</code>
            {reason && `: ${reason}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pl-8">
        {isAdmin ? (
          <>
            {/* Admin: Add Allow Policy */}
            <Button variant="outline" size="sm" onClick={() => setShowAddPolicyModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Allow Policy
            </Button>

            {/* Admin: Remove Blocking Policy (only if DENY policy exists) */}
            {blockingPolicyId && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowRemovePolicyDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove Blocking Policy
              </Button>
            )}
          </>
        ) : (
          <>
            {/* User: Request Tool Access */}
            {workspaceId && (
              <Button variant="outline" size="sm" onClick={() => setRequestType('tool')}>
                <Shield className="h-4 w-4 mr-2" />
                Request Tool Access
              </Button>
            )}

            {/* User: Request Server Access */}
            {workspaceId && serverDomain && (
              <Button variant="outline" size="sm" onClick={() => setRequestType('server')}>
                <Server className="h-4 w-4 mr-2" />
                Request Server Access
              </Button>
            )}
          </>
        )}
      </div>

      {/* User Request Dialog */}
      <Dialog open={!!requestType} onOpenChange={(open) => !open && setRequestType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {requestType === 'tool' ? 'Request Tool Access' : 'Request Server Access'}
            </DialogTitle>
            <DialogDescription>
              {requestType === 'tool' ? (
                <>
                  Request access to use{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{displayName}</code>
                </>
              ) : (
                <>
                  Request access to all tools from{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{friendlyDomain}</code>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reason for access</Label>
              <Textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Explain why you need access to this tool or server..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestType(null)} disabled={isUserLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleUserRequestSubmit}
              disabled={!requestReason.trim() || isUserLoading}
            >
              {isUserLoading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin: Add Policy Modal */}
      {isAdmin && (
        <PolicyFormModal
          open={showAddPolicyModal}
          onOpenChange={setShowAddPolicyModal}
          mode="create"
          defaultValues={defaultPolicyValues}
          onSubmit={handleCreatePolicy}
          isSubmitting={createPolicyMutation.isPending}
          error={createPolicyMutation.error?.message}
          users={usersQuery.data}
          roles={rolesQuery.data}
          agents={agentsQuery.data}
          isOrgOwner={true}
        />
      )}

      {/* Admin: Remove Blocking Policy Dialog */}
      <Dialog open={showRemovePolicyDialog} onOpenChange={setShowRemovePolicyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove Blocking Policy
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this DENY policy? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {blockingPolicyQuery.data && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                  DENY
                </span>
                <span className="text-sm font-medium">{blockingPolicyQuery.data.description}</span>
              </div>
              {blockingPolicyQuery.data.toolPatterns && (
                <div className="text-xs text-muted-foreground">
                  Affects: {(blockingPolicyQuery.data.toolPatterns as string[]).join(', ')}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRemovePolicyDialog(false)}
              disabled={isAdminLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveBlockingPolicy}
              disabled={isAdminLoading}
            >
              {isAdminLoading ? 'Removing...' : 'Remove Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
