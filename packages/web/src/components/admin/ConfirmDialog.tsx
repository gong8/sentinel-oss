import { useEnterConfirm } from '../../hooks/useEnterConfirm';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  alertText?: string;
  isLoading: boolean;
  onConfirm: () => void;
  confirmText: string;
  loadingText: string;
  confirmVariant?: ButtonVariant;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  alertText,
  isLoading,
  onConfirm,
  confirmText,
  loadingText,
  confirmVariant = 'default',
}: ConfirmDialogProps) {
  useEnterConfirm(open, isLoading, onConfirm);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {alertText && (
          <Alert>
            <AlertDescription className="text-xs">{alertText}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? loadingText : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
