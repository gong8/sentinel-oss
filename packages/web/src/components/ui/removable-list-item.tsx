import type { ReactNode } from 'react';

import { X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from './button';

interface RemovableListItemProps {
  children: ReactNode;
  onRemove: () => void;
  className?: string;
  removeLabel?: string;
  disabled?: boolean;
}

export function RemovableListItem({
  children,
  onRemove,
  className,
  removeLabel = 'Remove',
  disabled = false,
}: RemovableListItemProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border px-3 py-2',
        className,
      )}
    >
      <div className="flex-1 min-w-0">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onRemove}
        aria-label={removeLabel}
        disabled={disabled}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
