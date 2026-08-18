import * as React from 'react';

import { cn } from '../../lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-dashed border-border/70 bg-card/80 px-6 py-8 text-left',
        className,
      )}
    >
      <div className="text-base font-semibold text-foreground">{title}</div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
