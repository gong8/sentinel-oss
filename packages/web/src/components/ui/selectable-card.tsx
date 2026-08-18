import * as React from 'react';

import { cn } from '../../lib/utils';

interface SelectableCardProps {
  selected: boolean;
  onToggle: () => void;
  title: string;
  description?: string;
  className?: string;
  compact?: boolean;
}

export function SelectableCard({
  selected,
  onToggle,
  title,
  description,
  className,
  compact = false,
}: SelectableCardProps): React.ReactElement {
  return (
    <div
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      className={cn(
        'flex items-start gap-3 rounded-lg border cursor-pointer transition-all duration-150',
        compact ? 'gap-2 p-2' : 'p-3',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-muted-foreground/30 hover:bg-accent/50',
        className,
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/40',
        )}
      >
        {selected && (
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight">{title}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
        )}
      </div>
    </div>
  );
}

interface SelectableCardGroupProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  selected: T[];
  onToggle: (value: T) => void;
  compact?: boolean;
  className?: string;
}

export function SelectableCardGroup<T extends string>({
  options,
  selected,
  onToggle,
  compact = false,
  className,
}: SelectableCardGroupProps<T>): React.ReactElement {
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {options.map((option) => (
        <SelectableCard
          key={option.value}
          selected={selected.includes(option.value)}
          onToggle={() => onToggle(option.value)}
          title={option.label}
          description={option.description}
          compact={compact}
        />
      ))}
    </div>
  );
}
