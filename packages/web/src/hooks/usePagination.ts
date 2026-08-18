import { useCallback, useMemo, useState } from 'react';

/**
 * Hook for managing pagination state
 * Commonly used across pages that display paginated lists
 */
interface UsePaginationOptions {
  limit?: number;
  initialPage?: number;
}

interface UsePaginationResult {
  page: number;
  limit: number;
  offset: number;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetPage: () => void;
  getTotalPages: (total: number) => number;
  getPageInfo: (total: number) => {
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
    displayPage: number;
  };
}

export function usePagination({
  limit = 20,
  initialPage = 0,
}: UsePaginationOptions = {}): UsePaginationResult {
  const [page, setPageState] = useState(initialPage);

  const offset = useMemo(() => page * limit, [page, limit]);

  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(0, newPage));
  }, []);

  const nextPage = useCallback(() => {
    setPageState((current) => current + 1);
  }, []);

  const prevPage = useCallback(() => {
    setPageState((current) => Math.max(0, current - 1));
  }, []);

  const resetPage = useCallback(() => {
    setPageState(initialPage);
  }, [initialPage]);

  const getTotalPages = useCallback(
    (total: number) => {
      return Math.max(1, Math.ceil(total / limit));
    },
    [limit],
  );

  const getPageInfo = useCallback(
    (total: number) => {
      const totalPages = getTotalPages(total);
      return {
        totalPages,
        hasPrevious: page > 0,
        hasNext: page < totalPages - 1,
        displayPage: page + 1,
      };
    },
    [page, getTotalPages],
  );

  return {
    page,
    limit,
    offset,
    setPage,
    nextPage,
    prevPage,
    resetPage,
    getTotalPages,
    getPageInfo,
  };
}
