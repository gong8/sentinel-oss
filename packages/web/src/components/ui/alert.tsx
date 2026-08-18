import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border border-border/70 bg-muted/30 p-4 text-sm [&>p]:leading-relaxed',
  {
    variants: {
      variant: {
        default: 'text-foreground',
        destructive:
          'border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive',
        success:
          'border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-200 [&>div]:text-green-700 dark:[&>div]:text-green-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 text-xs font-semibold uppercase tracking-[0.18em]', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
