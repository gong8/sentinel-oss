import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border font-medium transition-all',
  {
    variants: {
      variant: {
        allow:
          'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 dark:bg-green-500/15 dark:border-green-500/40',
        deny: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 dark:bg-red-500/15 dark:border-red-500/40',
      },
      size: {
        sm: 'h-6 px-2 text-xs w-[3.75rem]',
        default: 'h-7 px-2.5 text-sm w-[4rem]',
        lg: 'h-8 px-3 text-base w-[4.5rem]',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export interface AllowDenyBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  value: string;
  size?: 'sm' | 'default' | 'lg';
}

/**
 * AllowDenyBadge - A consistent badge component for displaying ALLOW/DENY states in tables
 *
 * @example
 * <AllowDenyBadge value="ALLOWED" size="sm" />
 */
const AllowDenyBadge = React.forwardRef<HTMLDivElement, AllowDenyBadgeProps>(
  ({ className, value, size = 'sm', ...props }, ref) => {
    // Normalize value: ALLOWED -> ALLOW, DENIED -> DENY
    const normalizedValue = value === 'ALLOWED' || value === 'ALLOW' ? 'ALLOW' : 'DENY';

    return (
      <div
        ref={ref}
        className={cn(
          badgeVariants({
            variant: normalizedValue === 'ALLOW' ? 'allow' : 'deny',
            size,
          }),
          className,
        )}
        {...props}
      >
        <span>{normalizedValue}</span>
      </div>
    );
  },
);

AllowDenyBadge.displayName = 'AllowDenyBadge';

export { AllowDenyBadge };
