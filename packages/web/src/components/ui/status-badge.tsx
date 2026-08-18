import type { JSX } from 'react';
import { Badge } from './badge';

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface StatusConfig {
  label: string;
  variant: StatusVariant;
  className?: string;
}

const REQUEST_STATUS_CONFIG: Record<string, StatusConfig> = {
  PENDING: { label: 'Pending', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'default', className: 'bg-green-600' },
  DENIED: { label: 'Denied', variant: 'destructive' },
  MODIFIED: { label: 'Modified', variant: 'default', className: 'bg-violet-600' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'outline' },
  EXPIRED: { label: 'Expired', variant: 'outline' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
};

const APPROVAL_STATUS_CONFIG: Record<string, StatusConfig> = {
  PENDING: { label: 'Pending', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'default', className: 'bg-green-600' },
  DENIED: { label: 'Denied', variant: 'destructive' },
  EXPIRED: { label: 'Expired', variant: 'outline' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
};

interface StatusBadgeProps {
  status: string;
  type?: 'request' | 'approval';
  className?: string;
}

/**
 * Renders a status badge with appropriate styling
 * Uses predefined configurations for common status types
 */
export function StatusBadge({
  status,
  type = 'request',
  className = '',
}: StatusBadgeProps): JSX.Element {
  const config = type === 'request' ? REQUEST_STATUS_CONFIG : APPROVAL_STATUS_CONFIG;
  const statusConfig = config[status] ?? { label: status, variant: 'secondary' as const };

  return (
    <Badge
      variant={statusConfig.variant}
      className={`${statusConfig.className ?? ''} ${className}`.trim()}
    >
      {statusConfig.label}
    </Badge>
  );
}

/**
 * Returns the text color class for a request status
 * Used when displaying status as text rather than a badge
 */
export function getRequestStatusColor(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'text-green-600 dark:text-green-400';
    case 'MODIFIED':
      return 'text-violet-600 dark:text-violet-400';
    case 'DENIED':
      return 'text-red-600 dark:text-red-400';
    case 'WITHDRAWN':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-muted-foreground';
  }
}
