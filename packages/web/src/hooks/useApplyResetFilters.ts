import { useCallback, useState } from 'react';

/**
 * Hook for managing filter state with apply/reset pattern
 * Commonly used across pages that have filter forms where users
 * can set filters and then apply them
 */
interface UseApplyResetFiltersOptions<T> {
  initialFilters: T;
  onApply?: () => void;
}

interface UseApplyResetFiltersResult<T> {
  filters: T;
  appliedFilters: T;
  setFilters: React.Dispatch<React.SetStateAction<T>>;
  updateFilter: <K extends keyof T>(key: K, value: T[K]) => void;
  apply: () => void;
  reset: () => void;
  hasUnappliedChanges: boolean;
}

export function useApplyResetFilters<T extends Record<string, unknown>>({
  initialFilters,
  onApply,
}: UseApplyResetFiltersOptions<T>): UseApplyResetFiltersResult<T> {
  const [filters, setFilters] = useState<T>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<T>(initialFilters);

  const apply = useCallback(() => {
    setAppliedFilters(filters);
    onApply?.();
  }, [filters, onApply]);

  const reset = useCallback(() => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    onApply?.();
  }, [initialFilters, onApply]);

  const updateFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const hasUnappliedChanges = JSON.stringify(filters) !== JSON.stringify(appliedFilters);

  return {
    filters,
    appliedFilters,
    setFilters,
    updateFilter,
    apply,
    reset,
    hasUnappliedChanges,
  };
}
