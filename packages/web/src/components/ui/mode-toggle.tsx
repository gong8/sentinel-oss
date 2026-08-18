/**
 * ModeToggle Component
 * A reusable toggle for switching between different view modes (e.g., visual/JSON/advanced)
 */

import type { ReactElement, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Button } from './button';

export interface ModeOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface ModeToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ModeOption<T>[];
  className?: string;
  disabled?: boolean;
}

export function ModeToggle<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled = false,
}: ModeToggleProps<T>): ReactElement {
  return (
    <div className={cn('flex items-center gap-1 bg-muted/50 rounded-lg p-1', className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange(option.value)}
          disabled={disabled || option.disabled}
          title={option.title}
        >
          {option.icon}
          {option.label}
        </Button>
      ))}
    </div>
  );
}
