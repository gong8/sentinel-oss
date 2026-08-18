import * as React from 'react';

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

type MaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
  sm: 'sm:max-w-[425px]',
  md: 'sm:max-w-[500px]',
  lg: 'sm:max-w-[600px]',
  xl: 'sm:max-w-[800px]',
  '2xl': 'sm:max-w-[1000px]',
};

const MODE_LABELS = {
  create: { default: 'Create', loading: 'Creating...' },
  edit: { default: 'Save', loading: 'Saving...' },
} as const;

interface CrudDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  mode: 'create' | 'edit';
  isLoading?: boolean;
  onSubmit: () => void;
  submitLabel?: string;
  maxWidth?: MaxWidth;
  children: React.ReactNode;
}

export function CrudDialog({
  open,
  onOpenChange,
  title,
  description,
  mode,
  isLoading,
  onSubmit,
  submitLabel,
  maxWidth = 'md',
  children,
}: CrudDialogProps): React.ReactElement {
  const labels = MODE_LABELS[mode];
  const buttonLabel = isLoading ? labels.loading : (submitLabel ?? labels.default);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    onSubmit();
  }

  function handleCancel(): void {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[90vh] overflow-y-auto', MAX_WIDTH_CLASSES[maxWidth])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {children}
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {buttonLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
