import * as React from 'react';

import { Button } from './button';
import { Input } from './input';

interface ExportButtonConfig {
  label: string;
  loadingLabel: string;
  isLoading: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

interface SearchFilterBarProps {
  /** Search value - use either searchValue or searchQuery */
  searchValue?: string;
  /** @deprecated Use searchValue instead */
  searchQuery?: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter click handler - use either onFilterClick or onFiltersClick */
  onFilterClick?: () => void;
  /** @deprecated Use onFilterClick instead */
  onFiltersClick?: () => void;
  /** Filter count - use either filterCount or activeFilterCount */
  filterCount?: number;
  /** @deprecated Use filterCount instead */
  activeFilterCount?: number;
  onCreateClick?: () => void;
  createLabel?: string;
  exportButton?: ExportButtonConfig;
  children?: React.ReactNode;
}

export function SearchFilterBar({
  searchValue,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  onFilterClick,
  onFiltersClick,
  filterCount,
  activeFilterCount,
  onCreateClick,
  createLabel = 'Create',
  exportButton,
  children,
}: SearchFilterBarProps): React.ReactElement {
  const resolvedSearchValue = searchValue ?? searchQuery ?? '';
  const resolvedFilterClick = onFilterClick ?? onFiltersClick;
  const resolvedFilterCount = filterCount ?? activeFilterCount ?? 0;

  const filterLabel = resolvedFilterCount > 0 ? `Filters (${resolvedFilterCount})` : 'Filters';

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onSearchChange(e.target.value);
  }

  function handleFilterClick(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    resolvedFilterClick?.();
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative max-w-sm flex-1">
        <Input
          placeholder={searchPlaceholder}
          value={resolvedSearchValue}
          onChange={handleSearchChange}
        />
      </div>

      {resolvedFilterClick ? (
        <Button variant="outline" onClick={handleFilterClick}>
          {filterLabel}
        </Button>
      ) : null}

      {children}

      {exportButton ? (
        <Button
          type="button"
          variant="outline"
          onClick={exportButton.onClick}
          disabled={exportButton.isLoading || exportButton.isDisabled}
        >
          {exportButton.isLoading ? exportButton.loadingLabel : exportButton.label}
        </Button>
      ) : null}

      {onCreateClick ? <Button onClick={onCreateClick}>{createLabel}</Button> : null}
    </div>
  );
}
