import type { JSX } from 'react';
import { Button } from './button';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
  /** When true, returns null if totalPages <= 1 (default: false) */
  hideOnSinglePage?: boolean;
}

/**
 * Simple pagination controls with previous/next buttons
 * Displays current page and handles disabled states
 */
export function PaginationControls({
  page,
  totalPages,
  onPrevious,
  onNext,
  className = '',
  hideOnSinglePage = false,
}: PaginationControlsProps): JSX.Element | null {
  if (hideOnSinglePage && totalPages <= 1) {
    return null;
  }

  const displayPage = page + 1;

  return (
    <div
      className={`mt-6 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 sm:flex-row ${className}`}
    >
      <span className="text-sm text-muted-foreground">
        Page {displayPage} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPrevious} disabled={page === 0}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages - 1}>
          Next
        </Button>
      </div>
    </div>
  );
}
