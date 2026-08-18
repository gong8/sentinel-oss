import { useCallback, useState } from 'react';

/**
 * Hook for copying text to clipboard with feedback state.
 * @param timeout - How long to show "copied" state (default 2000ms)
 * @returns [copied, copyToClipboard] - State and copy function
 */
export function useCopyToClipboard(timeout = 2000): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(
    async (text: string): Promise<void> => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );

  return [copied, copyToClipboard];
}
