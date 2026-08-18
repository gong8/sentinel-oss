import * as React from 'react';

import { cn } from '../../lib/utils';

export type CardPriority = 'default' | 'urgent' | 'warning' | 'info' | 'success';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  priority?: CardPriority;
}

const priorityStyles: Record<CardPriority, string> = {
  default: '',
  urgent: 'border-l-4 border-l-destructive',
  warning: 'border-l-4 border-l-[hsl(var(--warning))]',
  info: 'border-l-4 border-l-primary',
  success: 'border-l-4 border-l-[hsl(var(--success))]',
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, priority = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'overflow-hidden rounded-lg border border-border/70 bg-card/90 text-card-foreground shadow-sm',
        priorityStyles[priority],
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-2 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-xs text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
