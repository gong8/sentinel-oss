import * as React from 'react';

import { useEnterConfirm } from '../../hooks/useEnterConfirm';
import { cn } from '../../lib/utils';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

type Severity = 'info' | 'warning' | 'destructive';

interface DeletionImpact {
  label: string;
  count: number;
  severity?: Severity;
}

const SEVERITY_CLASSES: Record<Severity, string> = {
  info: '',
  warning: 'text-yellow-600',
  destructive: 'text-destructive',
};

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  itemName?: string;
  description?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  impacts?: DeletionImpact[];
  impactsLoading?: boolean;
  canDelete?: boolean;
  children?: React.ReactNode;
  confirmLabel?: string;
  loadingLabel?: string;
  variant?: 'destructive' | 'default';
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  itemName,
  description = 'This action cannot be undone.',
  onConfirm,
  isLoading,
  impacts,
  impactsLoading,
  canDelete = true,
  children,
  confirmLabel = 'Delete',
  loadingLabel = 'Deleting...',
  variant = 'destructive',
}: DeleteConfirmDialogProps): React.ReactElement {
  const confirmationPrompt = itemName
    ? `Are you sure you want to delete "${itemName}"?`
    : 'Are you sure?';
  const buttonLabel = isLoading ? loadingLabel : confirmLabel;
  const isDisabled = isLoading || impactsLoading || !canDelete;
  const hasImpacts = impacts && impacts.length > 0;

  useEnterConfirm(open, isDisabled, onConfirm);

  function handleCancel(): void {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {confirmationPrompt} {description}
          </DialogDescription>
        </DialogHeader>

        {impactsLoading && (
          <div className="py-4 text-center text-muted-foreground">
            Calculating deletion impact...
          </div>
        )}

        {hasImpacts && (
          <div className="space-y-2 rounded-lg border p-4">
            <p className="text-sm font-medium">This will also affect:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {impacts.map((impact, i) => (
                <li key={i} className={cn(SEVERITY_CLASSES[impact.severity ?? 'info'])}>
                  {impact.count} {impact.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {children}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={isDisabled}>
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
