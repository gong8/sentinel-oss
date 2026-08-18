import type { JSX } from 'react';
import { Link } from 'react-router';

import { Card, CardContent } from './card';
import { Skeleton } from './skeleton';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  loading: boolean;
  to?: string;
}

/**
 * A card component for displaying a statistic with optional link.
 */
export function StatCard({ title, value, subtitle, loading, to }: StatCardProps): JSX.Element {
  const content = (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold tabular-nums">{value}</p>
            )}
            {subtitle &&
              (loading ? (
                <Skeleton className="h-3 w-24" />
              ) : (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (to) {
    return <Link to={to}>{content}</Link>;
  }

  return content;
}
