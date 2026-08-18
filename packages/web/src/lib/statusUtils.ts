/**
 * Status color utilities for request/approval status display
 */

/**
 * Get text color class for request status (permission requests, MCP server requests)
 */
export function getRequestStatusColor(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'text-green-600 dark:text-green-400';
    case 'MODIFIED':
      return 'text-violet-600 dark:text-violet-400';
    case 'DENIED':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

/**
 * Get text color class for MCP confirmation status
 */
export function getConfirmationStatusColor(status: string): string {
  switch (status) {
    case 'EXECUTED':
      return 'text-green-600 dark:text-green-400';
    case 'CONFIRMED':
      return 'text-violet-600 dark:text-violet-400';
    case 'PENDING':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'REJECTED':
    case 'FAILED':
      return 'text-red-600 dark:text-red-400';
    case 'EXPIRED':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}

/**
 * Get badge variant for risk level
 */
export function getRiskBadgeVariant(
  risk: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (risk) {
    case 'HIGH':
      return 'destructive';
    case 'MEDIUM':
      return 'secondary';
    case 'LOW':
      return 'outline';
    default:
      return 'outline';
  }
}
