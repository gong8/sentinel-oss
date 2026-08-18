import { EmptyState } from '../layout/EmptyState';
import { TableSkeleton } from '../layout/TableSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface DataTableCardProps {
  title: string;
  description: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  hasActiveFilters?: boolean;
  emptyFilteredTitle?: string;
  emptyFilteredDescription?: string;
  children: React.ReactNode;
}

export function DataTableCard({
  title,
  description,
  isLoading,
  isEmpty,
  emptyTitle,
  emptyDescription,
  hasActiveFilters = false,
  emptyFilteredTitle = 'No results match filters',
  emptyFilteredDescription = 'Try adjusting your filters to see more results.',
  children,
}: DataTableCardProps): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton />
        ) : isEmpty ? (
          <EmptyState
            title={hasActiveFilters ? emptyFilteredTitle : emptyTitle}
            description={hasActiveFilters ? emptyFilteredDescription : emptyDescription}
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
