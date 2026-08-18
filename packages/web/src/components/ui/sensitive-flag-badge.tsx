import * as React from 'react';

import { cn } from '../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type SensitiveFlagBehavior = 'REQUIRE_APPROVAL' | 'RATE_LIMIT' | 'ALERT';

function isSensitiveFlagBehavior(value: string): value is SensitiveFlagBehavior {
  return value === 'REQUIRE_APPROVAL' || value === 'RATE_LIMIT' || value === 'ALERT';
}

interface SensitiveFlagBadgeProps {
  behaviors: string[];
  description?: string | null;
  size?: 'sm' | 'default';
  showPopover?: boolean;
  className?: string;
}

const BEHAVIOR_INFO: Record<SensitiveFlagBehavior, { label: string; shortLabel: string }> = {
  REQUIRE_APPROVAL: {
    label: 'Requires Approval',
    shortLabel: 'Approval',
  },
  RATE_LIMIT: {
    label: 'Rate Limited',
    shortLabel: 'Rate Limit',
  },
  ALERT: {
    label: 'Sends Alerts',
    shortLabel: 'Alert',
  },
};

const BadgeContent = React.forwardRef<
  HTMLDivElement,
  SensitiveFlagBadgeProps & { onClick?: () => void }
>(({ behaviors, size = 'default', className, onClick, ...props }, ref) => {
  const isSmall = size === 'sm';
  const validBehaviors = behaviors.filter(isSensitiveFlagBehavior);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5',
        'border-amber-500/30 bg-amber-500/10 text-amber-700',
        'dark:text-amber-400 dark:bg-amber-500/15 dark:border-amber-500/40',
        'cursor-default select-none',
        isSmall ? 'text-[10px]' : 'text-[11px]',
        className,
      )}
      {...props}
    >
      <span className="font-medium tracking-wide">Flagged</span>
      {validBehaviors.length > 0 && (
        <div className="flex items-center gap-0.5 ml-0.5">
          {validBehaviors.map((behavior) => {
            const info = BEHAVIOR_INFO[behavior];
            return (
              <span
                key={behavior}
                className={cn(
                  'text-amber-600 dark:text-amber-500',
                  isSmall ? 'text-[9px]' : 'text-[10px]',
                )}
              >
                [{info.shortLabel}]
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});
BadgeContent.displayName = 'BadgeContent';

export function SensitiveFlagBadge({
  behaviors,
  description,
  size = 'default',
  showPopover = true,
  className,
}: SensitiveFlagBadgeProps) {
  if (!showPopover) {
    return <BadgeContent behaviors={behaviors} size={size} className={className} />;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <BadgeContent
          behaviors={behaviors}
          size={size}
          className={cn('cursor-pointer hover:bg-amber-500/20', className)}
        />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm">Sensitive Tool</h4>
          </div>

          {description && <p className="text-xs text-muted-foreground">{description}</p>}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Behaviors:</p>
            <ul className="space-y-1">
              {behaviors.filter(isSensitiveFlagBehavior).map((behavior) => {
                const info = BEHAVIOR_INFO[behavior];
                return (
                  <li key={behavior} className="flex items-center gap-2 text-xs">
                    <span>{info.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SensitiveFlagIcon({
  className,
  size = 'default',
}: {
  className?: string;
  size?: 'sm' | 'default';
}) {
  const isSmall = size === 'sm';
  return (
    <span
      className={cn('text-amber-500 font-medium', isSmall ? 'text-[10px]' : 'text-xs', className)}
      aria-label="Sensitive tool"
    >
      [Flagged]
    </span>
  );
}
