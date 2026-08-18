/**
 * ChainPreview Component
 * Shows an inline preview of what will happen when chaining a condition
 * Displays closing bracket when the chain logic differs from the scope logic
 * (the opening bracket is shown by the source chip)
 */

import { Plus } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '../../../../lib/utils';
import type { ChainPreviewState } from './types';

interface ChainPreviewProps {
  preview: ChainPreviewState;
}

export function ChainPreview({ preview }: ChainPreviewProps): JSX.Element {
  const { previewLogic, scopeLogic } = preview;
  const needsBrackets = previewLogic !== scopeLogic;

  return (
    <div className="inline-flex items-center gap-1.5">
      {/* Logic operator */}
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase',
          previewLogic === 'AND' &&
            'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30',
          previewLogic === 'OR' &&
            'text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30',
        )}
      >
        {previewLogic}
      </span>

      {/* New condition placeholder */}
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm',
          'border border-dashed',
          'text-muted-foreground italic',
          previewLogic === 'AND' &&
            'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/30',
          previewLogic === 'OR' &&
            'border-purple-300 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-950/30',
        )}
      >
        <Plus className="h-3 w-3" />
        new condition
      </span>

      {/* Closing bracket when creating a new group */}
      {needsBrackets && (
        <span className="text-muted-foreground font-mono text-lg inline-flex items-center py-0.5">
          )
        </span>
      )}
    </div>
  );
}

/**
 * Check if a chain preview creates a new group (logic differs from scope)
 */
export function chainPreviewNeedsBrackets(preview: ChainPreviewState | null): boolean {
  if (!preview) return false;
  return preview.previewLogic !== preview.scopeLogic;
}
