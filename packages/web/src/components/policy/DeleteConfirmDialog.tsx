import { type JSX } from 'react';
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

export interface DeleteWarning {
  message: string;
}

export interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName?: string;
  onConfirm: () => void;
  isDeleting?: boolean;
  warnings?: DeleteWarning[];
  isLoadingWarnings?: boolean;
}

/**
 * Reusable delete confirmation dialog with optional impact warnings
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  isDeleting = false,
  warnings,
  isLoadingWarnings = false,
}: DeleteConfirmDialogProps): JSX.Element {
  const descriptionText = itemName ? `${description} ${itemName}?` : description;

  useEnterConfirm(open, isDeleting, onConfirm);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {itemName ? (
              <>
                Are you sure you want to delete <span className="font-medium">{itemName}</span>?
              </>
            ) : (
              descriptionText
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoadingWarnings && (
          <div className="text-sm text-muted-foreground">Analyzing impact...</div>
        )}

        {warnings && warnings.length > 0 && (
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
