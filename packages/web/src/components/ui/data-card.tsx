import type { JSX, ReactNode } from 'react';

import { EmptyState } from '../layout/EmptyState';
import { TableSkeleton } from '../layout/TableSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

interface DataCardProps {
  title: string;
  description?: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

/**
 * A card component for displaying data with consistent loading and empty states.
 * Used for tables, lists, and other data displays.
 */
export function DataCard({
  title,
  description,
  isLoading,
  isEmpty,
  emptyTitle,
  emptyDescription,
  headerActions,
  children,
}: DataCardProps): JSX.Element {
  function renderContent(): ReactNode {
    if (isLoading) {
      return <TableSkeleton />;
    }
    if (isEmpty) {
      return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }
    return children;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription className="mt-1.5">{description}</CardDescription>}
          </div>
          {headerActions}
        </div>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
}
