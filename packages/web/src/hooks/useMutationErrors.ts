import { useMemo } from 'react';

interface MutationLike {
  error: { message: string } | null;
}

interface MutationWithError {
  error: { message: string };
}

function hasError(source: MutationLike | null | undefined): source is MutationWithError {
  return source?.error != null;
}

/**
 * Collects all non-null errors from queries and mutations.
 *
 * @param sources - Array of query/mutation objects that have an error property
 * @returns Array of error objects (filtered to non-null)
 */
export function useMutationErrors(
  sources: Array<MutationLike | null | undefined>,
): Array<{ message: string }> {
  return useMemo(() => sources.filter(hasError).map((source) => source.error), [sources]);
}
