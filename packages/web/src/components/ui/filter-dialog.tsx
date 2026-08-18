import * as React from 'react';

import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Label } from './label';

interface FilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** Clear filters callback. Use either onClearAll or onClearFilters (aliases). */
  onClearAll?: () => void;
  /** Clear filters callback. Use either onClearAll or onClearFilters (aliases). */
  onClearFilters?: () => void;
  /** Custom apply callback. If not provided, defaults to closing the dialog. */
  onApply?: () => void;
}

export function FilterDialog({
  open,
  onOpenChange,
  title = 'Filters',
  description,
  children,
  maxWidth = 'max-w-md',
  onClearAll,
  onClearFilters,
  onApply,
}: FilterDialogProps): React.ReactElement {
  const handleClear = onClearAll ?? onClearFilters;

  function handleApply(): void {
    if (onApply) {
      onApply();
    } else {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClear}>
            Clear all
          </Button>
          <Button type="button" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FilterSectionProps {
  label: string;
  children: React.ReactNode;
}

export function FilterSection({ label, children }: FilterSectionProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
