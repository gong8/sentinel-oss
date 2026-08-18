import { MessageSquare } from 'lucide-react';
import { useState, type JSX } from 'react';

import { useWorkspace } from '../../hooks/WorkspaceContext';
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

export interface RequestExceptionButtonProps {
  /** The ID of the global DENY policy to request an exception for */
  policyId: string;
  /** The description of the policy for display */
  policyDescription: string;
  /** Callback when the request is successfully submitted */
  onSuccess?: () => void;
}

/**
 * Button that opens a dialog to request an exception to a global DENY policy.
 * Workspace admins can use this to request that a specific global DENY policy
 * not apply to their workspace.
 */
export function RequestExceptionButton({
  policyId,
  policyDescription,
  onSuccess,
}: RequestExceptionButtonProps): JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [justification, setJustification] = useState('');
  const { selectedWorkspaceId } = useWorkspace();

  const utils = trpc.useUtils();
  const createExceptionMutation = trpc.admin.policyExceptions.createException.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      setJustification('');
      utils.admin.policyExceptions.listForWorkspace.invalidate();
      onSuccess?.();
    },
  });

  const handleSubmit = () => {
    if (!selectedWorkspaceId || justification.trim().length < 10) return;

    createExceptionMutation.mutate({
      workspaceId: selectedWorkspaceId,
      policyId,
      justification: justification.trim(),
    });
  };

  const isSubmitDisabled =
    !selectedWorkspaceId || justification.trim().length < 10 || createExceptionMutation.isPending;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        disabled={!selectedWorkspaceId}
      >
        <MessageSquare className="h-4 w-4 mr-1" />
        Request Exception
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Policy Exception</DialogTitle>
            <DialogDescription>
              Request an exception to this global policy for your workspace. An organization owner
              will review your request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Policy</Label>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                {policyDescription}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="justification">Justification</Label>
              <p className="text-xs text-muted-foreground">
                Explain why your workspace needs an exception to this policy (minimum 10 characters)
              </p>
              <Textarea
                id="justification"
                placeholder="Describe the business reason for needing this exception..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="min-h-[120px]"
              />
            </div>

            {createExceptionMutation.error && (
              <p className="text-sm text-destructive">{createExceptionMutation.error.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createExceptionMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitDisabled}>
              {createExceptionMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
