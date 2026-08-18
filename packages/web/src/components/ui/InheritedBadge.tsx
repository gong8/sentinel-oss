import { Globe } from 'lucide-react';
import type { JSX } from 'react';

import { Badge } from './badge';

export interface InheritedBadgeProps {
  /** Optional custom label, defaults to "Inherited" */
  label?: string;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Badge component indicating inherited resources (global policies, servers, etc.)
 * Displays a Globe icon with "Inherited" text using semantic primary colors
 */
export function InheritedBadge({
  label = 'Inherited',
  className,
}: InheritedBadgeProps): JSX.Element {
  return (
    <Badge
      variant="outline"
      className={`bg-primary/10 text-primary border-primary/30 ${className ?? ''}`}
    >
      <Globe className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}
