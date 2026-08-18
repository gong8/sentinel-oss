/**
 * ChipBuilder Component
 * Chip-based condition builder with AND/OR logic and full nesting support
 */

import { useCallback, type JSX, type KeyboardEvent } from 'react';

import { cn } from '../../../../lib/utils';
import type { CategoryOption, OperatorGroups, ParamSuggestion, PolicyConditions } from '../types';
import { ChipBuilderProvider } from './ChipBuilderContext';
import { ChipContextBar } from './ChipContextBar';
import { GroupWrapper } from './GroupWrapper';
import type { ConditionGroupNode, RenderContext } from './types';
import { useChipBuilder } from './useChipBuilder';
import { countConditions } from './utils';

interface ChipBuilderProps {
  /** Current flat conditions (for backward compatibility) */
  value: PolicyConditions | null;
  /** Called when conditions change (flat format for backward compatibility) */
  onChange: (value: PolicyConditions | null) => void;
  /** Current tree structure (new format) */
  conditionsTree: ConditionGroupNode | null;
  /** Called when tree changes */
  onTreeChange: (tree: ConditionGroupNode) => void;
  /** Available field categories */
  categories: CategoryOption[];
  /** Available operators */
  operators: OperatorGroups;
  /** Parameter suggestions for autocomplete */
  suggestions?: Map<string, ParamSuggestion[]>;
  /** Disable editing */
  disabled?: boolean;
}

export function ChipBuilder({
  value,
  onChange,
  conditionsTree,
  onTreeChange,
  categories,
  operators,
  suggestions = new Map(),
  disabled = false,
}: ChipBuilderProps): JSX.Element {
  const chipBuilder = useChipBuilder({
    value,
    conditionsTree,
    onChange,
    onTreeChange,
    categories,
    operators,
    suggestions,
    disabled,
  });

  const { tree, clearSelection, selectAll } = chipBuilder;

  // Handle global keyboard events
  const handleCanvasKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      // Handle Escape to clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
      }

      // Ctrl/Cmd + A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
    },
    [clearSelection, selectAll, disabled],
  );

  // Click outside chips to clear selection
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only clear if clicking the canvas itself, not a chip
      if (e.target === e.currentTarget) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  const conditionCount = countConditions(tree);
  const rootContext: RenderContext = {
    depth: 0,
    isFirstChild: true,
    isLastChild: true,
  };

  return (
    <ChipBuilderProvider value={chipBuilder}>
      <div className="space-y-3">
        {/* Context bar - changes based on selection */}
        <ChipContextBar />

        {/* Chip canvas */}
        <div
          role="listbox"
          aria-label="Conditions"
          aria-multiselectable="true"
          tabIndex={-1}
          onClick={handleCanvasClick}
          onKeyDown={handleCanvasKeyDown}
          className={cn(
            'min-h-[60px] p-3 rounded-lg border border-border bg-background',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            disabled && 'opacity-50 pointer-events-none',
          )}
        >
          {conditionCount === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No conditions defined. Click &quot;Add Condition&quot; above to get started.
            </div>
          ) : (
            <GroupWrapper node={tree} context={rootContext} />
          )}
        </div>

        {/* Keyboard hints */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Click</kbd> select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Backspace</kbd>{' '}
            delete
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl+A</kbd>{' '}
            select all
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Esc</kbd> clear
            selection
          </span>
        </div>
      </div>
    </ChipBuilderProvider>
  );
}

// Re-export types for convenience
export type {
  ConditionGroupNode,
  ConditionLeafNode,
  ConditionTreeNode,
  LogicalOperator,
} from './types';
export { flatToTree, isSimpleTree, treeToExpression, treeToFlat } from './utils';
