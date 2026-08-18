import { useEnterConfirm } from '../../hooks/useEnterConfirm';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface DeletionBlocker {
  details: string;
  items?: Array<{ id: string; name: string }>;
}

interface DeletionWarning {
  message: string;
}

interface DeletionImpact {
  canDelete: boolean;
  blockers?: DeletionBlocker[];
  warnings?: DeletionWarning[];
}

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  itemName: string;
  description?: string;
  isLoadingImpact?: boolean;
  impact?: DeletionImpact | null;
  isDeleting: boolean;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  itemName,
  description = 'This will soft delete the item and it can be restored later.',
  isLoadingImpact,
  impact,
  isDeleting,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const blockers = impact?.blockers ?? [];
  const warnings = impact?.warnings ?? [];
  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0 && impact?.canDelete;
  const canDelete = impact === undefined || impact?.canDelete;
  const isDisabled = isDeleting || !canDelete;

  useEnterConfirm(open, isDisabled, onConfirm);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-medium">{itemName}</span>?{' '}
            {description}
          </DialogDescription>
        </DialogHeader>

        {isLoadingImpact && (
          <div className="text-sm text-muted-foreground">Analyzing impact...</div>
        )}

        {hasBlockers && (
          <Alert variant="destructive">
            <AlertTitle>Cannot Delete</AlertTitle>
            <AlertDescription>
              {blockers.map((blocker, i) => (
                <div key={i}>
                  <strong>{blocker.details}</strong>
                  {blocker.items && blocker.items.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {blocker.items.map((item) => (
                        <li key={item.id}>- {item.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {hasWarnings && (
          <Alert>
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1">
                {warnings.map((warning, i) => (
                  <li key={i}>- {warning.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDisabled}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
