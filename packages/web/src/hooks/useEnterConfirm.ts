import { useEffect } from 'react';

/**
 * Hook to trigger a callback when Enter is pressed while a dialog is open.
 * @param open - Whether the dialog is open
 * @param disabled - Whether the confirm action is disabled
 * @param onConfirm - Callback to execute on Enter press
 */
export function useEnterConfirm(open: boolean, disabled: boolean, onConfirm: () => void): void {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Enter' && !disabled) {
        e.preventDefault();
        onConfirm();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, disabled, onConfirm]);
}
