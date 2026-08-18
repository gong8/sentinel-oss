/**
 * LogicalOperatorChip Component
 * Displays AND/OR connectors between conditions
 * Clicking selects the parent group to allow changing the connector
 */

import { useCallback, type JSX, type MouseEvent } from 'react';

import { cn } from '../../../../lib/utils';
import { useChipBuilderContext } from './ChipBuilderContext';
import type { ConditionNodeId, LogicalOperator } from './types';

interface LogicalOperatorChipProps {
  logic: LogicalOperator;
  /** The ID of the parent group containing this operator */
  parentGroupId: ConditionNodeId;
  /** When true, suppress the hover effect (parent handles hover highlighting) */
  suppressHover?: boolean;
}

export function LogicalOperatorChip({
  logic,
  parentGroupId,
  suppressHover = false,
}: LogicalOperatorChipProps): JSX.Element {
  const { selection, toggleSelection, disabled } = useChipBuilderContext();

  // Check if the parent group is already selected
  const isGroupSelected = selection.selectedIds.has(parentGroupId);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;

      // Select or deselect the parent group
      toggleSelection(parentGroupId);
    },
    [parentGroupId, toggleSelection, disabled],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase',
        'transition-colors duration-150 cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // AND styling (with or without hover based on suppressHover)
        logic === 'AND' &&
          !suppressHover &&
          'text-blue-700 bg-blue-100 hover:bg-blue-200 dark:text-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50',
        logic === 'AND' &&
          suppressHover &&
          'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30',
        // OR styling (with or without hover based on suppressHover)
        logic === 'OR' &&
          !suppressHover &&
          'text-purple-700 bg-purple-100 hover:bg-purple-200 dark:text-purple-300 dark:bg-purple-900/30 dark:hover:bg-purple-900/50',
        logic === 'OR' &&
          suppressHover &&
          'text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30',
        // Selected state
        isGroupSelected && 'ring-2 ring-offset-1 ring-primary',
        // Disabled
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      title={`Click to select this ${logic} group`}
    >
      {logic}
    </button>
  );
}
