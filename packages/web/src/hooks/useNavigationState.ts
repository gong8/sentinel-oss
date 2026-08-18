import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Hook to read navigation state and clear it immediately after reading.
 * This prevents the state from persisting across page refreshes.
 *
 * @returns The navigation state that was passed, or null if none
 */
export function useNavigationState<T>(): T | null {
  const location = useLocation();
  const state = location.state as T | null;

  useEffect(() => {
    if (state) {
      window.history.replaceState({}, document.title);
    }
  }, [state]);

  return state;
}
