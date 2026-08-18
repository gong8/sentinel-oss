/**
 * GroupWrapper Component
 * Renders a group of conditions with parentheses and logic operators
 */

import { GripVertical } from 'lucide-react';
import { useCallback, useState, type JSX, type MouseEvent } from 'react';

import { cn } from '../../../../lib/utils';
import { ChainPreview, chainPreviewNeedsBrackets } from './ChainPreview';
import { useChipBuilderContext } from './ChipBuilderContext';
import { ConditionChip } from './ConditionChip';
import { LogicalOperatorChip } from './LogicalOperatorChip';
import type { ConditionGroupNode, ConditionTreeNode, RenderContext } from './types';
import { isConditionGroup, isConditionLeaf } from './types';

/**
 * Check if a group is "simple" - only contains leaf conditions, no nested groups
 */
function isSimpleGroup(node: ConditionGroupNode): boolean {
  return node.children.every(isConditionLeaf);
}

interface GroupWrapperProps {
  node: ConditionGroupNode;
  context: RenderContext;
}

export function GroupWrapper({ node, context }: GroupWrapperProps): JSX.Element {
  const { depth } = context;
  const isNested = depth > 0;
  const { selection, toggleSelection, isNodeInScope, disabled, chainPreview } =
    useChipBuilderContext();
  const [isHovered, setIsHovered] = useState(false);

  // Check if this is a simple group (no nested groups) - applies to any depth
  const isSimple = isSimpleGroup(node);

  // Check if this group is the source of a chain preview
  const isChainSource = chainPreview?.sourceNodeId === node.id;
  const showChainPreview = isChainSource && chainPreview;
  const showOpeningBracket = showChainPreview && chainPreviewNeedsBrackets(chainPreview);

  // Check if this group is the active selection scope
  const isActiveScope = selection.scopeGroupId === node.id;

  // Check if this group is selected
  const isSelected = selection.selectedIds.has(node.id);
  const isAnchor = selection.anchorId === node.id;

  // Check if this group is within the current selection scope
  const inScope = isNodeInScope(node.id);
  const hasActiveScope = selection.scopeGroupId !== null;

  // Handle clicking the group (either handle or background area)
  const handleGroupClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      // Don't allow clicking out-of-scope groups
      if (hasActiveScope && !inScope) return;
      toggleSelection(node.id);
    },
    [toggleSelection, node.id, disabled, hasActiveScope, inScope],
  );

  // Handle clicking the group background area (between brackets)
  // Chips and operators already call stopPropagation(), so this only fires for background clicks
  const handleBackgroundClick = useCallback(
    (e: MouseEvent) => {
      handleGroupClick(e);
    },
    [handleGroupClick],
  );

  // Handle hover events for groups
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Render a single node (leaf or nested group)
  const renderNode = (child: ConditionTreeNode, index: number): JSX.Element => {
    const childContext: RenderContext = {
      depth: depth + 1,
      parentLogic: node.logic,
      isFirstChild: index === 0,
      isLastChild: index === node.children.length - 1,
    };

    if (isConditionLeaf(child)) {
      return <ConditionChip key={child.id} node={child} />;
    }

    if (isConditionGroup(child)) {
      return <GroupWrapper key={child.id} node={child} context={childContext} />;
    }

    return <></>;
  };

  // Empty group
  if (node.children.length === 0) {
    return <></>;
  }

  // Single leaf at root level - render just the chip, no group wrapper
  if (!isNested && node.children.length === 1 && isConditionLeaf(node.children[0])) {
    const singleChild = node.children[0];

    // If there's a chain preview on this group, show it alongside the chip
    if (showChainPreview && chainPreview) {
      return (
        <div className="inline-flex items-center gap-1.5">
          {showOpeningBracket && (
            <span className="text-muted-foreground font-mono text-lg inline-flex items-center py-0.5">
              (
            </span>
          )}
          <ConditionChip key={singleChild.id} node={singleChild} />
          <ChainPreview preview={chainPreview} />
        </div>
      );
    }

    return <ConditionChip key={singleChild.id} node={singleChild} />;
  }

  // Whether to show extra padding for prominent background (when active scope, selected, or hovered)
  const showProminentBackground = isActiveScope || isSelected || isHovered;

  // Determine background color based on state and logic operator
  const getBackgroundClass = (): string => {
    const isAnd = node.logic === 'AND';

    // Group is selected - most prominent
    if (isSelected) {
      return isAnd
        ? 'bg-blue-200 ring-2 ring-offset-1 ring-blue-400 dark:bg-blue-800/50 dark:ring-blue-500'
        : 'bg-purple-200 ring-2 ring-offset-1 ring-purple-400 dark:bg-purple-800/50 dark:ring-purple-500';
    }

    // Active scope - children are selected
    if (isActiveScope) {
      return isAnd ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-purple-100 dark:bg-purple-900/40';
    }

    // For simple root groups, show a more prominent box on hover
    if (isSimple) {
      if (isHovered) {
        return isAnd ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-purple-100 dark:bg-purple-900/40';
      }
      // Default: subtle background with visible border
      return isAnd ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'bg-purple-50/50 dark:bg-purple-950/20';
    }

    // Hover state for nested groups
    if (isHovered) {
      return isAnd ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-purple-50 dark:bg-purple-900/30';
    }

    // Default subtle background for all groups (visible clickable area)
    return isAnd ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-purple-50 dark:bg-purple-950/30';
  };

  const groupElement = (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleBackgroundClick}
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 transition-all rounded-md cursor-pointer',
        // Base padding for clickable area (slightly more bottom padding for visual centering)
        'px-1.5 pt-1 pb-1.5',
        // Extra padding when showing prominent background
        showProminentBackground && 'px-2 pt-1.5 pb-2',
        // Simple root groups get a visible border box
        isSimple && 'border border-border/50 px-2 pt-1.5 pb-2',
        isSimple && isHovered && 'border-border',
        // Apply the background color
        getBackgroundClass(),
        // Anchor (first selected) gets extra emphasis
        isSelected && isAnchor && 'ring-4',
        // Out of scope styling
        hasActiveScope && !inScope && 'opacity-50 pointer-events-none cursor-default',
      )}
      role="group"
      aria-label={`${node.logic} group with ${node.children.length} conditions${isActiveScope ? ' (active selection scope)' : ''}`}
    >
      {/* Opening bracket - clickable to select group */}
      <span
        onClick={handleGroupClick}
        className="text-muted-foreground font-mono text-lg inline-flex items-center py-0.5 cursor-pointer hover:text-foreground transition-colors"
      >
        (
      </span>

      {/* Clickable handle for nested groups */}
      {isNested && (
        <button
          type="button"
          onClick={handleGroupClick}
          disabled={disabled || (hasActiveScope && !inScope)}
          className={cn(
            'w-5 h-5 rounded-sm flex items-center justify-center',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            'transition-colors cursor-pointer',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            disabled && 'opacity-50 cursor-not-allowed',
            hasActiveScope && !inScope && 'pointer-events-none',
          )}
          title="Select this group"
          aria-label={`Select ${node.logic} group`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}

      {node.children.map((child, index) => (
        <div key={child.id} className="inline-flex items-center gap-1.5">
          {/* Render the node */}
          {renderNode(child, index)}

          {/* Render logic operator between children (not after last) */}
          {index < node.children.length - 1 && (
            <LogicalOperatorChip
              logic={node.logic}
              parentGroupId={node.id}
              suppressHover={isSimple}
            />
          )}
        </div>
      ))}

      {/* Closing bracket - clickable to select group */}
      <span
        onClick={handleGroupClick}
        className="text-muted-foreground font-mono text-lg inline-flex items-center py-0.5 cursor-pointer hover:text-foreground transition-colors"
      >
        )
      </span>
    </div>
  );

  // If this group has a chain preview, wrap with opening bracket and show preview
  if (showChainPreview && chainPreview) {
    return (
      <div className="inline-flex items-center gap-1.5">
        {/* Opening bracket when creating a new group */}
        {showOpeningBracket && (
          <span className="text-muted-foreground font-mono text-lg inline-flex items-center py-0.5">
            (
          </span>
        )}
        {groupElement}
        <ChainPreview preview={chainPreview} />
      </div>
    );
  }

  return groupElement;
}
