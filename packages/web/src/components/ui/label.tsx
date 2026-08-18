import * as React from 'react';

import { cn } from '../../lib/utils';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('text-xs font-semibold tracking-[0.12em] text-muted-foreground', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
