import type { JSX, ReactNode } from 'react';

import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

interface FilterCardProps {
  title?: string;
  description?: string;
  onApply: () => void;
  onReset: () => void;
  children: ReactNode;
}

/**
 * A card component for filter controls with Apply/Reset buttons.
 * Used consistently across pages that need filtering functionality.
 */
export function FilterCard({
  title = 'Filters',
  description,
  onApply,
  onReset,
  children,
}: FilterCardProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {children}
          <div className="flex items-end gap-2">
            <Button type="button" onClick={onApply} className="flex-1 sm:flex-none">
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              className="flex-1 sm:flex-none"
            >
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface FilterFieldProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}

/**
 * A field wrapper for filter inputs with a label.
 */
export function FilterField({ label, htmlFor, children }: FilterFieldProps): JSX.Element {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
