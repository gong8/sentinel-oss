/**
 * Inline Permission Request
 * Shows options to request access when a tool is denied
 */

import { Lock, Server, Shield } from 'lucide-react';

import * as React from 'react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
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

interface InlinePermissionRequestProps {
  workspaceId: string;
  toolName: string;
  serverDomain?: string;
  onClose: () => void;
}

export function InlinePermissionRequest({
  workspaceId,
  toolName,
  serverDomain,
  onClose,
}: InlinePermissionRequestProps) {
  const [reason, setReason] = React.useState('');
  const [requestType, setRequestType] = React.useState<'tool' | 'server' | null>(null);

  const requestToolAccessMutation = trpc.workspace.chat.requestToolAccess.useMutation({
    onSuccess: () => {
      toast.success('Access request submitted', {
        description: 'An administrator will review your request.',
      });
      onClose();
    },
  });

  const requestServerAccessMutation = trpc.workspace.chat.requestServerAccess.useMutation({
    onSuccess: () => {
      toast.success('Access request submitted', {
        description: 'An administrator will review your request for server access.',
      });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!reason.trim()) return;

    if (requestType === 'tool') {
      requestToolAccessMutation.mutate({
        workspaceId,
        toolName,
        reason: reason.trim(),
      });
    } else if (requestType === 'server' && serverDomain) {
      requestServerAccessMutation.mutate({
        workspaceId,
        serverDomain,
        reason: reason.trim(),
      });
    }
  };

  const isLoading = requestToolAccessMutation.isPending || requestServerAccessMutation.isPending;

  // Extract tool short name from "domain::tool" format
  const [, shortToolName] = toolName.split('::');

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Lock className="h-5 w-5 text-destructive mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-sm">Access Denied</p>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to use{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{shortToolName}</code>
          </p>
        </div>
      </div>

      <div className="flex gap-2 pl-8">
        <Button variant="outline" size="sm" onClick={() => setRequestType('tool')}>
          <Shield className="h-4 w-4 mr-2" />
          Request Tool Access
        </Button>
        {serverDomain && (
          <Button variant="outline" size="sm" onClick={() => setRequestType('server')}>
            <Server className="h-4 w-4 mr-2" />
            Request Server Access
          </Button>
        )}
      </div>

      {/* Request Dialog */}
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
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{shortToolName}</code>
                </>
              ) : (
                <>
                  Request access to all tools from{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{serverDomain}</code>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reason for access</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why you need access to this tool or server..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestType(null)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!reason.trim() || isLoading}>
              {isLoading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
