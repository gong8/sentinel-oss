import { Trash2 } from 'lucide-react';
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

export interface RequestRemovalButtonProps {
  /** The ID of the global policy to request removal for */
  policyId: string;
  /** The description of the policy for display */
  policyDescription: string;
  /** Callback when the request is successfully submitted */
  onSuccess?: () => void;
}

/**
 * Button that opens a dialog to request removal of a blocking global policy.
 * Workspace admins can use this to request that a global policy be removed
 * from the organization entirely.
 */
export function RequestRemovalButton({
  policyId,
  policyDescription,
  onSuccess,
}: RequestRemovalButtonProps): JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [justification, setJustification] = useState('');
  const { selectedWorkspaceId } = useWorkspace();

  const utils = trpc.useUtils();
  const createRemovalMutation = trpc.admin.policyExceptions.createRemovalRequest.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      setJustification('');
      utils.admin.policyExceptions.listForWorkspace.invalidate();
      onSuccess?.();
    },
  });

  const handleSubmit = () => {
    if (!selectedWorkspaceId || justification.trim().length < 10) return;

    createRemovalMutation.mutate({
      workspaceId: selectedWorkspaceId,
      policyId,
      justification: justification.trim(),
    });
  };

  const isSubmitDisabled =
    !selectedWorkspaceId || justification.trim().length < 10 || createRemovalMutation.isPending;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDialogOpen(true)}
        disabled={!selectedWorkspaceId}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Request Removal
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Policy Removal</DialogTitle>
            <DialogDescription>
              Request removal of this global policy from the organization. An organization owner
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
                Explain why this global policy should be removed (minimum 10 characters)
              </p>
              <Textarea
                id="justification"
                placeholder="Describe why this policy should be removed from the organization..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="min-h-[120px]"
              />
            </div>

            {createRemovalMutation.error && (
              <p className="text-sm text-destructive">{createRemovalMutation.error.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createRemovalMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitDisabled}>
              {createRemovalMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
