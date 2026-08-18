import { Skeleton } from '../ui/skeleton';

interface TableSkeletonProps {
  rows?: number;
}

export function TableSkeleton({ rows = 6 }: TableSkeletonProps) {
  return (
    <div data-testid="table-skeleton" className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
