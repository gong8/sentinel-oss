import * as React from 'react';

import { EmptyState } from '../layout/EmptyState';
import { TableSkeleton } from '../layout/TableSkeleton';

interface TableLoadingStateProps {
  isLoading: boolean;
  isEmpty: boolean;
  hasActiveFilters: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  filteredEmptyTitle?: string;
  filteredEmptyDescription?: string;
  skeletonRows?: number;
  children: React.ReactNode;
}

export function TableLoadingState({
  isLoading,
  isEmpty,
  hasActiveFilters,
  emptyTitle = 'No items yet',
  emptyDescription = 'Create your first item to get started.',
  filteredEmptyTitle = 'No items match filters',
  filteredEmptyDescription = 'Try adjusting your filters.',
  skeletonRows = 5,
  children,
}: TableLoadingStateProps) {
  if (isLoading) {
    return <TableSkeleton rows={skeletonRows} />;
  }

  if (isEmpty && hasActiveFilters) {
    return <EmptyState title={filteredEmptyTitle} description={filteredEmptyDescription} />;
  }

  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return <>{children}</>;
}
