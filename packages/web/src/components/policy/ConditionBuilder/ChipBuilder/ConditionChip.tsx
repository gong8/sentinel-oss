/**
 * ConditionChip Component
 * Displays a single condition as an interactive chip
 */

import { useCallback, type JSX, type KeyboardEvent, type MouseEvent } from 'react';

import { cn } from '../../../../lib/utils';
import { ChainPreview, chainPreviewNeedsBrackets } from './ChainPreview';
import { useChipBuilderContext } from './ChipBuilderContext';
import type { ConditionLeafNode } from './types';
import { formatConditionLabel, isConditionComplete } from './utils';

interface ConditionChipProps {
  node: ConditionLeafNode;
}

export function ConditionChip({ node }: ConditionChipProps): JSX.Element {
  const {
    selection,
    toggleSelection,
    removeCondition,
    focusedId,
    setFocusedId,
    disabled,
    isNodeInScope,
    chainPreview,
  } = useChipBuilderContext();

  const isSelected = selection.selectedIds.has(node.id);
  const isAnchor = selection.anchorId === node.id;
  const isFocused = focusedId === node.id;
  const isComplete = isConditionComplete(node);
  // Check if this chip is within the current selection scope
  const inScope = isNodeInScope(node.id);
  const hasActiveScope = selection.scopeGroupId !== null;

  // Check if this chip is the source of a chain preview
  const isChainSource = chainPreview?.sourceNodeId === node.id;
  const showChainPreview = isChainSource && chainPreview;
  const showOpeningBracket = showChainPreview && chainPreviewNeedsBrackets(chainPreview);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      // Don't allow clicking out-of-scope chips
      if (hasActiveScope && !inScope) return;
      toggleSelection(node.id);
    },
    [toggleSelection, node.id, disabled, hasActiveScope, inScope],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      // Don't allow keyboard interaction with out-of-scope chips
      if (hasActiveScope && !inScope) return;

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          toggleSelection(node.id);
          break;
        case 'Backspace':
        case 'Delete':
          if (isSelected) {
            e.preventDefault();
            removeCondition(node.id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setFocusedId(null);
          break;
      }
    },
    [
      toggleSelection,
      removeCondition,
      node.id,
      isSelected,
      setFocusedId,
      disabled,
      hasActiveScope,
      inScope,
    ],
  );

  const handleFocus = useCallback(() => {
    setFocusedId(node.id);
  }, [setFocusedId, node.id]);

  const handleBlur = useCallback(() => {
    // Don't clear focus here - let parent manage focus state
  }, []);

  const label = formatConditionLabel(node);

  const chipElement = (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      tabIndex={hasActiveScope && !inScope ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium',
        'transition-colors duration-150 cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        // Base state
        !isSelected && !isFocused && 'bg-muted text-foreground hover:bg-muted/80',
        // Anchor chip (first selected) - thicker ring
        isSelected &&
          isAnchor &&
          'bg-primary text-primary-foreground ring-4 ring-primary ring-offset-2',
        // Regular selected chip (not anchor) - lighter ring
        isSelected && !isAnchor && 'bg-primary text-primary-foreground ring-2 ring-primary/50',
        // Focused state (when navigating with keyboard)
        isFocused && !isSelected && 'ring-2 ring-ring',
        // Incomplete condition
        !isComplete && 'border border-dashed border-amber-500 bg-amber-500/10',
        // Out of scope (dimmed and not clickable when there's an active scope)
        hasActiveScope && !inScope && 'opacity-50 pointer-events-none',
        // Disabled
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span className="truncate max-w-[200px]">{label}</span>
    </button>
  );

  // If this chip has a chain preview, wrap with opening bracket and show preview
  if (showChainPreview && chainPreview) {
    return (
      <div className="inline-flex items-center gap-1.5">
        {/* Opening bracket when creating a new group */}
        {showOpeningBracket && (
          <span className="text-muted-foreground font-mono text-lg inline-flex items-center py-0.5">
            (
          </span>
        )}
        {chipElement}
        <ChainPreview preview={chainPreview} />
      </div>
    );
  }

  return chipElement;
}
