import { Badge } from './badge';
import { Button } from './button';

interface FilterItem {
  key: string;
  label: string;
  value: string;
  /** Callback to clear this filter. Alias for onRemove. */
  onClear?: () => void;
  /** Callback to remove this filter. Alias for onClear. */
  onRemove?: () => void;
}

interface ActiveFilterBadgesProps {
  filters: FilterItem[];
  onClearAll: () => void;
  /** Number of filtered items shown. Used with totalCount. */
  filteredCount?: number;
  /** Total number of items. Used with filteredCount. */
  totalCount?: number;
  /** Result count object. Alternative to filteredCount/totalCount. */
  resultCount?: {
    showing: number;
    total: number;
    label?: string;
  };
}

export function ActiveFilterBadges({
  filters,
  onClearAll,
  filteredCount,
  totalCount,
  resultCount,
}: ActiveFilterBadgesProps): React.ReactElement | null {
  const activeFilters = filters.filter((f) => f.value && f.value !== 'all');

  if (activeFilters.length === 0) return null;

  const showingCount = resultCount?.showing ?? filteredCount;
  const totalItems = resultCount?.total ?? totalCount;
  const label = resultCount?.label ?? '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Active filters:</span>
      {activeFilters.map((filter) => {
        const handleRemove = filter.onClear ?? filter.onRemove;
        return (
          <Badge key={filter.key} variant="secondary" className="gap-1">
            {filter.label}: {filter.value}
            <button
              onClick={handleRemove}
              className="ml-1 hover:text-destructive"
              aria-label={`Clear ${filter.label} filter`}
            >
              x
            </button>
          </Badge>
        );
      })}
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
      {showingCount !== undefined && totalItems !== undefined ? (
        <span className="ml-auto text-sm text-muted-foreground">
          Showing {showingCount} of {totalItems}
          {label ? ` ${label}` : ''}
        </span>
      ) : null}
    </div>
  );
}

/** @deprecated Use ActiveFilterBadges from 'components/ui/active-filter-badges' instead */
export const ActiveFilters = ActiveFilterBadges;
