import { useCallback, useState } from 'react';

interface UseConfirmActionResult<T> {
  /** The item currently being confirmed, or null if dialog is closed */
  target: T | null;
  /** Opens the confirmation dialog for the given item */
  openConfirm: (item: T) => void;
  /** Closes the confirmation dialog */
  closeConfirm: () => void;
  /** Whether the confirmation dialog is open */
  isOpen: boolean;
}

/**
 * Hook to manage confirmation dialogs for actions like delete, refresh, revoke, etc.
 *
 * @returns State and handlers for a confirmation dialog
 */
export function useConfirmAction<T>(): UseConfirmActionResult<T> {
  const [target, setTarget] = useState<T | null>(null);

  const openConfirm = useCallback((item: T) => {
    setTarget(item);
  }, []);

  const closeConfirm = useCallback(() => {
    setTarget(null);
  }, []);

  return {
    target,
    openConfirm,
    closeConfirm,
    isOpen: target !== null,
  };
}
