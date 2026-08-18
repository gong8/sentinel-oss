import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-foreground text-background',
        secondary: 'border-border/60 bg-secondary/70 text-secondary-foreground',
        outline: 'border-border/60 text-foreground',
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
        success: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
        warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { Badge, badgeVariants };
