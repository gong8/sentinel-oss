/**
 * ConditionsChipList Component
 * Displays conditions as chips with selection and AND/OR grouping
 */

import { Pencil, Plus, Trash2, Ungroup } from 'lucide-react';
import { Fragment, useCallback, useMemo, useState } from 'react';

import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import type {
  ConditionGroupNode,
  ConditionLeafNode,
  ConditionNodeId,
  ConditionTreeNode,
  LogicalOperator,
} from '../ConditionBuilder/ChipBuilder/types';
import { isConditionGroup, isConditionLeaf } from '../ConditionBuilder/ChipBuilder/types';
import {
  cleanupTree,
  countConditions,
  findNodeById,
  formatConditionLabel,
  getParentGroupId,
  groupNodesAtAnchor,
  removeNode,
  ungroupNode,
} from '../ConditionBuilder/ChipBuilder/utils';

/**
 * Check if a group is an ancestor of the active scope group
 */
function isAncestorOfScope(
  tree: ConditionGroupNode,
  groupId: ConditionNodeId,
  scopeGroupId: ConditionNodeId | null,
): boolean {
  if (scopeGroupId === null) return false;
  if (groupId === scopeGroupId) return false; // Same node, not ancestor

  // Walk up from scopeGroupId to see if we hit groupId
  let currentId: ConditionNodeId | null = scopeGroupId;
  while (currentId !== null) {
    const parentId = getParentGroupId(tree, currentId);
    if (parentId === groupId) return true;
    currentId = parentId;
  }
  return false;
}

/** Pending chain request - stores target and logic for the next condition */
export interface PendingChainRequest {
  targetId: string;
  logic: LogicalOperator;
}

interface ConditionsChipListProps {
  tree: ConditionGroupNode;
  onTreeChange: (tree: ConditionGroupNode) => void;
  /** Called when user requests to chain a new condition. Pass null to clear pending chain. */
  onChainRequest?: (request: PendingChainRequest | null) => void;
  /** Currently pending chain request (for visual feedback) */
  pendingChain?: PendingChainRequest | null;
  /** Called when user requests to edit a single selected condition (null to close) */
  onEditRequest?: (nodeId: ConditionNodeId | null) => void;
  /** Currently editing node ID (for toggle behavior) */
  editingNodeId?: ConditionNodeId | null;
}

export function ConditionsChipList({
  tree,
  onTreeChange,
  onChainRequest,
  pendingChain,
  onEditRequest,
  editingNodeId,
}: ConditionsChipListProps): React.ReactElement {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Scope restricts selection to nodes within a specific parent group
  const [scopeGroupId, setScopeGroupId] = useState<ConditionNodeId | null>(null);
  // Anchor - the first-selected chip (determines position for grouping)
  const [anchorId, setAnchorId] = useState<ConditionNodeId | null>(null);
  // Track which group is being directly hovered (not via child hover)
  const [hoveredGroupId, setHoveredGroupId] = useState<ConditionNodeId | null>(null);
  // Track previous pendingChain and condition count to detect chain completion vs cancellation
  const [prevPendingChain, setPrevPendingChain] = useState<PendingChainRequest | null | undefined>(
    pendingChain,
  );
  const conditionCount = countConditions(tree);
  const [prevConditionCount, setPrevConditionCount] = useState<number>(conditionCount);

  // Track pendingChain and tree changes
  // Clear selection only when chain is COMPLETED (new condition added), not when cancelled
  if (prevPendingChain !== pendingChain || prevConditionCount !== conditionCount) {
    const wasChainActive = prevPendingChain !== null && prevPendingChain !== undefined;
    const isChainNowInactive = pendingChain === null || pendingChain === undefined;
    const conditionAdded = conditionCount > prevConditionCount;

    setPrevPendingChain(pendingChain);
    setPrevConditionCount(conditionCount);

    // Clear selection when chain completes (pendingChain goes null AND new condition was added)
    if (wasChainActive && isChainNowInactive && conditionAdded) {
      setSelectedIds(new Set());
      setScopeGroupId(null);
      setAnchorId(null);
    }
  }

  // Get the logic operator of the current scope (or root if no scope)
  const getScopeOperator = useCallback((): LogicalOperator => {
    // Use root's operator when there's no scope or scope is root
    if (scopeGroupId === null || scopeGroupId === tree.id) {
      return tree.logic;
    }
    const scopeGroup = findNodeById(tree, scopeGroupId);
    if (scopeGroup && isConditionGroup(scopeGroup)) {
      return scopeGroup.logic;
    }
    return tree.logic;
  }, [tree, scopeGroupId]);

  // Get the single selected ID if exactly one is selected
  const singleSelectedId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;

  // Check if a group is selected (group ID itself is in selectedIds)
  const isGroupSelected = useMemo(() => {
    if (selectedIds.size !== 1) return false;
    const selectedId = Array.from(selectedIds)[0];
    const node = findNodeById(tree, selectedId);
    // A group is selected if its ID is in selectedIds and it's a group
    return node !== null && isConditionGroup(node);
  }, [selectedIds, tree]);

  // Check if the root group is selected
  const isRootSelected = useMemo(() => {
    if (selectedIds.size !== 1) return false;
    const selectedId = Array.from(selectedIds)[0];
    return selectedId === tree.id;
  }, [selectedIds, tree]);

  // Check if a node is within the current selection scope
  const isNodeInScope = useCallback(
    (nodeId: ConditionNodeId): boolean => {
      // When root is selected, nothing else is in scope (root has no siblings)
      if (isRootSelected) {
        return false;
      }
      if (scopeGroupId === null) {
        return true; // No scope restriction
      }
      const parentId = getParentGroupId(tree, nodeId);
      return parentId === scopeGroupId;
    },
    [tree, scopeGroupId, isRootSelected],
  );

  // Get the selected group's ID when isGroupSelected is true
  const selectedGroupId = useMemo(() => {
    if (!isGroupSelected) return null;
    return Array.from(selectedIds)[0];
  }, [isGroupSelected, selectedIds]);

  // Get the selected group's operator (when isGroupSelected is true)
  const selectedGroupOperator = useMemo(() => {
    if (!isGroupSelected || selectedGroupId === null) return null;
    const selectedGroup = findNodeById(tree, selectedGroupId);
    if (!selectedGroup || !isConditionGroup(selectedGroup)) return null;
    return selectedGroup.logic;
  }, [isGroupSelected, selectedGroupId, tree]);

  // Alias for backwards compatibility - can't ungroup root
  const canUngroup = isGroupSelected && !isRootSelected;

  // Check if grouping is possible (not all children of scope are selected - they'd already be grouped)
  const canGroup = useMemo(() => {
    if (selectedIds.size < 2) return false;
    // Get the current scope group (or root if no scope)
    const targetGroupId = scopeGroupId ?? tree.id;
    const targetGroup = findNodeById(tree, targetGroupId);
    if (!targetGroup || !isConditionGroup(targetGroup)) return false;
    // If all direct children are selected, they're already grouped
    const allChildrenSelected = targetGroup.children.every((child) => selectedIds.has(child.id));
    return !allChildrenSelected;
  }, [selectedIds, scopeGroupId, tree]);

  // Check if all children of a group are selected, returns promotion info if so
  const checkForPromotion = useCallback(
    (
      currentSelectedIds: Set<string>,
      currentScopeGroupId: ConditionNodeId | null,
    ): {
      shouldPromote: boolean;
      groupId: ConditionNodeId;
      parentId: ConditionNodeId | null;
    } | null => {
      if (currentScopeGroupId === null) return null;

      const scopeGroup = findNodeById(tree, currentScopeGroupId);
      if (!scopeGroup || !isConditionGroup(scopeGroup)) return null;

      // Don't promote to root if it only has one child (single condition isn't a "group")
      if (currentScopeGroupId === tree.id && scopeGroup.children.length === 1) {
        return null;
      }

      // Check if all direct children are selected
      const allChildrenSelected = scopeGroup.children.every((child) =>
        currentSelectedIds.has(child.id),
      );

      if (allChildrenSelected && scopeGroup.children.length > 0) {
        const parentOfScope = getParentGroupId(tree, currentScopeGroupId);
        return { shouldPromote: true, groupId: currentScopeGroupId, parentId: parentOfScope };
      }

      return null;
    },
    [tree],
  );

  // Toggle selection of a node with scope tracking
  const toggleSelection = useCallback(
    (id: string) => {
      // Get the parent group of the clicked node
      const clickedParentId = getParentGroupId(tree, id);

      // If there's a scope set and the node is outside it, clear selection and start fresh
      if (scopeGroupId !== null && clickedParentId !== scopeGroupId) {
        // Clear pending chain when switching scope
        if (pendingChain && onChainRequest) {
          onChainRequest(null);
        }
        // Close edit mode when switching to a different chip
        if (editingNodeId && onEditRequest) {
          onEditRequest(null);
        }
        setSelectedIds(new Set([id]));
        setScopeGroupId(clickedParentId);
        setAnchorId(id);
        return;
      }

      // Calculate the new selection state
      const currentSelected = selectedIds;
      const newSelectedIds = new Set(currentSelected);
      let newAnchorId: ConditionNodeId | null = anchorId;
      let newScopeGroupId: ConditionNodeId | null = scopeGroupId;

      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
        // If deselecting the pending chain target, clear the pending chain
        if (pendingChain?.targetId === id && onChainRequest) {
          onChainRequest(null);
        }
        // If deselecting the currently editing chip, close edit mode
        if (editingNodeId === id && onEditRequest) {
          onEditRequest(null);
        }
        // If selection is now empty, clear scope and anchor
        if (newSelectedIds.size === 0) {
          newScopeGroupId = null;
          newAnchorId = null;
        } else if (anchorId === id) {
          // Anchor was deselected, transfer to first remaining selected
          const remaining = Array.from(newSelectedIds);
          newAnchorId = remaining[0];
        }
      } else {
        newSelectedIds.add(id);
        // Close edit mode when selecting a different chip (going from 1 to 2 selections)
        if (editingNodeId && editingNodeId !== id && onEditRequest) {
          onEditRequest(null);
        }
        // Set scope and anchor on first selection
        if (currentSelected.size === 0) {
          newScopeGroupId = clickedParentId;
          newAnchorId = id;
        }
      }

      // Check if this selection completes a group (all children selected)
      const promotion = checkForPromotion(newSelectedIds, newScopeGroupId);
      if (promotion) {
        // Promote: select the group instead of individual children
        setSelectedIds(new Set([promotion.groupId]));
        setScopeGroupId(promotion.parentId);
        setAnchorId(promotion.groupId);
      } else {
        // Normal selection update
        setSelectedIds(newSelectedIds);
        setScopeGroupId(newScopeGroupId);
        setAnchorId(newAnchorId);
      }
    },
    [
      tree,
      scopeGroupId,
      anchorId,
      pendingChain,
      onChainRequest,
      checkForPromotion,
      selectedIds,
      editingNodeId,
      onEditRequest,
    ],
  );

  // Clear selection, scope, and anchor
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setScopeGroupId(null);
    setAnchorId(null);
  }, []);

  // Select a group as a whole (scope becomes the parent so siblings can be selected)
  const selectGroup = useCallback(
    (groupId: ConditionNodeId) => {
      const group = findNodeById(tree, groupId);
      if (!group || !isConditionGroup(group)) return;

      // Close edit mode when selecting a group (groups can't be edited)
      if (editingNodeId && onEditRequest) {
        onEditRequest(null);
      }

      // Root group selection - toggle selection
      // But don't allow selecting root when it only has 1 child (not a real group yet)
      if (groupId === tree.id) {
        if (tree.children.length < 2) {
          return; // Single item isn't a meaningful group
        }
        // Clear pending chain when interacting with root
        if (pendingChain && onChainRequest) {
          onChainRequest(null);
        }
        // Toggle: if already selected, deselect; otherwise select
        if (selectedIds.has(groupId)) {
          setSelectedIds(new Set());
          setScopeGroupId(null);
          setAnchorId(null);
        } else {
          setSelectedIds(new Set([groupId]));
          setScopeGroupId(null);
          setAnchorId(groupId);
        }
        return;
      }

      // Scope is the parent of this group, allowing sibling selection
      const parentId = getParentGroupId(tree, groupId);

      // If there's a scope set and the group is outside it, clear selection and start fresh
      if (scopeGroupId !== null && parentId !== scopeGroupId) {
        // Clear pending chain when switching scope
        if (pendingChain && onChainRequest) {
          onChainRequest(null);
        }
        setSelectedIds(new Set([groupId]));
        setScopeGroupId(parentId);
        setAnchorId(groupId);
        return;
      }

      // Calculate the new selection state
      const newSelectedIds = new Set(selectedIds);
      let newAnchorId: ConditionNodeId | null = anchorId;
      let newScopeGroupId: ConditionNodeId | null = scopeGroupId;

      if (newSelectedIds.has(groupId)) {
        newSelectedIds.delete(groupId);
        // If selection is now empty, clear scope and anchor
        if (newSelectedIds.size === 0) {
          newScopeGroupId = null;
          newAnchorId = null;
        } else if (anchorId === groupId) {
          // Anchor was deselected, transfer to first remaining selected
          const remaining = Array.from(newSelectedIds);
          newAnchorId = remaining[0];
        }
      } else {
        newSelectedIds.add(groupId);
        // Set scope and anchor on first selection
        if (selectedIds.size === 0) {
          newScopeGroupId = parentId;
          newAnchorId = groupId;
        }
      }

      // Check if this selection completes a group (all children selected)
      const promotion = checkForPromotion(newSelectedIds, newScopeGroupId);
      if (promotion) {
        // Promote: select the group instead of individual children
        setSelectedIds(new Set([promotion.groupId]));
        setScopeGroupId(promotion.parentId);
        setAnchorId(promotion.groupId);
      } else {
        // Normal selection update
        setSelectedIds(newSelectedIds);
        setScopeGroupId(newScopeGroupId);
        setAnchorId(newAnchorId);
      }
    },
    [
      tree,
      scopeGroupId,
      anchorId,
      pendingChain,
      onChainRequest,
      checkForPromotion,
      selectedIds,
      editingNodeId,
      onEditRequest,
    ],
  );

  // Remove a condition
  const handleRemove = useCallback(
    (id: string) => {
      const newTree = removeNode(tree, id);
      // If newTree is null, it means we tried to remove the root - do nothing
      if (newTree === null) return;
      const cleaned = cleanupTree(newTree);
      onTreeChange(cleaned);
      // Clear all selection state - the tree structure may have changed
      // (e.g., single-child groups get unwrapped, so scopeGroupId may be invalid)
      clearSelection();
    },
    [tree, onTreeChange, clearSelection],
  );

  // Group selected nodes - inherits operator from scope
  const handleGroup = useCallback(() => {
    if (selectedIds.size < 2 || anchorId === null) return;

    const ids = Array.from(selectedIds);
    const logic = getScopeOperator();

    // Group within the scoped group if scope is set (or root)
    const targetGroupId = scopeGroupId ?? tree.id;
    const targetGroup = findNodeById(tree, targetGroupId);

    if (targetGroup && isConditionGroup(targetGroup)) {
      const newScopedGroup = groupNodesAtAnchor(targetGroup, ids, anchorId, logic);

      // If grouping at root level, just replace tree children
      if (targetGroupId === tree.id) {
        const newTree = { ...tree, children: newScopedGroup.children };
        const cleaned = cleanupTree(newTree);
        onTreeChange(cleaned);
        clearSelection();
        return;
      }

      // Replace the scoped group's children in the tree
      const replaceGroupChildren = (
        node: ConditionGroupNode,
        targetId: ConditionNodeId,
        newChildren: ConditionTreeNode[],
      ): ConditionGroupNode => {
        if (node.id === targetId) {
          return { ...node, children: newChildren };
        }
        return {
          ...node,
          children: node.children.map((child) =>
            isConditionGroup(child) ? replaceGroupChildren(child, targetId, newChildren) : child,
          ),
        };
      };
      const newTree = replaceGroupChildren(tree, targetGroupId, newScopedGroup.children);
      const cleaned = cleanupTree(newTree);
      onTreeChange(cleaned);
      clearSelection();
    }
  }, [tree, selectedIds, anchorId, scopeGroupId, getScopeOperator, onTreeChange, clearSelection]);

  // Ungroup the selected group
  const handleUngroup = useCallback(() => {
    if (!canUngroup || selectedGroupId === null) return;

    const newTree = ungroupNode(tree, selectedGroupId);
    const cleaned = cleanupTree(newTree);
    onTreeChange(cleaned);
    clearSelection();
  }, [tree, selectedGroupId, canUngroup, onTreeChange, clearSelection]);

  // Clear all conditions (delete root group contents)
  const handleClearAll = useCallback(() => {
    const emptyTree: ConditionGroupNode = {
      ...tree,
      children: [],
    };
    onTreeChange(emptyTree);
    clearSelection();
  }, [tree, onTreeChange, clearSelection]);

  // Change the selected group's operator
  const handleChangeGroupOperator = useCallback(
    (newLogic: LogicalOperator) => {
      if (!isGroupSelected || selectedGroupId === null) return;

      // Helper to update a group's logic in the tree
      const updateGroupLogic = (
        node: ConditionGroupNode,
        targetId: ConditionNodeId,
        logic: LogicalOperator,
      ): ConditionGroupNode => {
        if (node.id === targetId) {
          return { ...node, logic };
        }
        return {
          ...node,
          children: node.children.map((child) =>
            isConditionGroup(child) ? updateGroupLogic(child, targetId, logic) : child,
          ),
        };
      };

      const newTree = updateGroupLogic(tree, selectedGroupId, newLogic);
      onTreeChange(newTree);
    },
    [tree, selectedGroupId, isGroupSelected, onTreeChange],
  );

  // Request to chain a new condition with the selected chip or group
  // Clicking the same logic again clears the pending chain (toggle)
  const handleChainRequest = useCallback(
    (logic: LogicalOperator) => {
      if (!onChainRequest) return;

      // Determine target: single selected chip OR selected group
      const targetId = singleSelectedId ?? (isGroupSelected ? selectedGroupId : null);
      if (!targetId) return;

      // Close editing when starting to chain
      if (onEditRequest) {
        onEditRequest(null);
      }

      // If already pending with the same logic, clear it (toggle off)
      // Keep the chip selected - just cancel the pending chain
      if (pendingChain?.targetId === targetId && pendingChain.logic === logic) {
        onChainRequest(null);
        return;
      }

      onChainRequest({ targetId, logic });
    },
    [
      singleSelectedId,
      isGroupSelected,
      selectedGroupId,
      onChainRequest,
      pendingChain,
      onEditRequest,
    ],
  );

  // Render a placeholder chip for pending chain
  const renderPlaceholderChip = (): React.ReactElement => {
    const isAnd = pendingChain?.logic === 'AND';
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium align-middle',
          'border-2 border-dashed mx-1 my-1.5',
          isAnd
            ? 'border-blue-400 text-blue-500 dark:border-blue-500 dark:text-blue-400'
            : 'border-purple-400 text-purple-500 dark:border-purple-500 dark:text-purple-400',
        )}
      >
        <Plus className="h-3 w-3" />
        <span>new condition</span>
      </div>
    );
  };

  // Render a condition chip
  const renderConditionChip = (node: ConditionLeafNode): React.ReactElement => {
    const isSelected = selectedIds.has(node.id);
    const isAnchor = anchorId === node.id;
    const isPendingChainTarget = pendingChain?.targetId === node.id;
    const label = formatConditionLabel(node);
    const inScope = isNodeInScope(node.id);
    const hasActiveScope = scopeGroupId !== null || isRootSelected;

    const chip = (
      <div
        key={node.id}
        role="option"
        data-chip="true"
        aria-selected={isSelected}
        tabIndex={hasActiveScope && !inScope ? -1 : 0}
        onClick={(e) => {
          e.stopPropagation();
          // Don't allow clicking out-of-scope chips
          if (hasActiveScope && !inScope) return;
          toggleSelection(node.id);
        }}
        onKeyDown={(e) => {
          // Don't allow keyboard interaction with out-of-scope chips
          if (hasActiveScope && !inScope) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSelection(node.id);
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            handleRemove(node.id);
          }
        }}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          'cursor-pointer transition-all align-middle',
          'border mx-1 my-1.5',
          // Anchor chip (first selected) - thicker ring
          isSelected &&
            isAnchor &&
            'bg-primary text-primary-foreground border-primary ring-4 ring-primary ring-offset-1',
          // Regular selected chip (not anchor) - lighter ring
          isSelected &&
            !isAnchor &&
            'bg-primary text-primary-foreground border-primary ring-2 ring-primary/50',
          // Not selected states
          !isSelected &&
            isPendingChainTarget &&
            pendingChain?.logic === 'AND' &&
            'bg-blue-100 text-blue-800 border-blue-400 ring-2 ring-blue-300 dark:bg-blue-900/50 dark:text-blue-200',
          !isSelected &&
            isPendingChainTarget &&
            pendingChain?.logic === 'OR' &&
            'bg-purple-100 text-purple-800 border-purple-400 ring-2 ring-purple-300 dark:bg-purple-900/50 dark:text-purple-200',
          !isSelected &&
            !isPendingChainTarget &&
            'bg-muted/50 text-foreground border-border hover:bg-muted',
          // Out of scope - dim and not clickable
          hasActiveScope && !inScope && 'opacity-50 pointer-events-none',
          // Grey out when chain is pending and this is not the target
          pendingChain && !isPendingChainTarget && 'opacity-50 pointer-events-none',
        )}
      >
        <span className="max-w-[200px] truncate">{label}</span>
      </div>
    );

    // If this chip is the pending chain target, show it with the logic badge and placeholder
    if (isPendingChainTarget && pendingChain) {
      // Check if brackets are needed:
      // 1. Chain logic differs from scope logic = new nested group will be created
      // 2. This is the only child at root = chaining creates the first visible group
      const scopeLogic = getScopeOperator();
      const needsNestedGroup = pendingChain.logic !== scopeLogic;
      const isOnlyChildAtRoot =
        getParentGroupId(tree, node.id) === tree.id && tree.children.length === 1;
      const showBrackets = needsNestedGroup || isOnlyChildAtRoot;

      return (
        <span key={node.id} className="inline">
          {/* Opening bracket when creating a new group */}
          {showBrackets && (
            <span
              className={cn(
                'font-mono text-lg inline-flex items-center py-0.5 align-middle',
                pendingChain.logic === 'AND'
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-purple-700 dark:text-purple-400',
              )}
            >
              (
            </span>
          )}
          {chip}
          {renderLogicBadge(pendingChain.logic, node.id, -1, false)}
          {renderPlaceholderChip()}
          {/* Closing bracket when creating a new group */}
          {showBrackets && (
            <span
              className={cn(
                'font-mono text-lg inline-flex items-center py-0.5 align-middle',
                pendingChain.logic === 'AND'
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-purple-700 dark:text-purple-400',
              )}
            >
              )
            </span>
          )}
        </span>
      );
    }

    return chip;
  };

  // Render a logical operator badge (clickable to select the group)
  const renderLogicBadge = (
    logic: LogicalOperator,
    groupId: string,
    index: number,
    isClickable: boolean = true,
  ): React.ReactElement => {
    const hasActiveScope = scopeGroupId !== null || isRootSelected;
    // A badge is selectable only if its group's parent is the active scope (sibling of selected items)
    // The scope group itself and ancestors should NOT be selectable via badge
    const isInScopeForSelection = isRootSelected
      ? false
      : scopeGroupId === null || getParentGroupId(tree, groupId) === scopeGroupId;
    // Check if this badge's group is selected
    const isBadgeGroupSelected = selectedIds.has(groupId);
    const canSelectGroup = isClickable && (!hasActiveScope || isInScopeForSelection);

    return (
      <button
        type="button"
        key={`${groupId}-logic-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          if (canSelectGroup) {
            selectGroup(groupId);
          } else {
            // Clicking on a non-selectable badge clears the selection
            clearSelection();
            if (pendingChain && onChainRequest) {
              onChainRequest(null);
            }
          }
        }}
        className={cn(
          'inline-flex items-center px-2 py-px rounded text-[10px] font-bold uppercase align-middle',
          'transition-all mx-1 my-0.5',
          canSelectGroup && !pendingChain && 'cursor-pointer',
          logic === 'AND'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
          // Grey out badges that can't be selected or are already selected (but not preview badges)
          (!canSelectGroup || isBadgeGroupSelected) && isClickable && 'opacity-50',
          // Grey out regular badges when chain is pending (but not the preview badge)
          pendingChain && isClickable && 'opacity-50 pointer-events-none',
        )}
      >
        {logic}
      </button>
    );
  };

  // Render any node (leaf or group)
  const renderNode = (
    node: ConditionTreeNode,
    parentLogic: LogicalOperator | null,
    isRoot: boolean,
  ): React.ReactElement => {
    if (isConditionLeaf(node)) {
      return renderConditionChip(node);
    }

    return renderGroup(node, parentLogic, isRoot);
  };

  // Render a group - always show brackets to indicate grouping
  const renderGroup = (
    node: ConditionGroupNode,
    _parentLogic: LogicalOperator | null,
    isRoot: boolean,
  ): React.ReactElement => {
    const isPendingChainTarget = pendingChain?.targetId === node.id;
    const isSelected = selectedIds.has(node.id);
    const hasActiveScope = scopeGroupId !== null || isRootSelected;
    // A group is in scope if:
    // 1. No active scope AND root is not selected
    // 2. This group IS the scope group (needs pointer events for its children to be clickable)
    // 3. Its parent is the active scope (sibling of active scope's children)
    // 4. It's an ancestor of the active scope (parent groups need pointer events for children)
    // When root is selected, nothing is in scope (root has no siblings)
    const inScope = isRootSelected
      ? false
      : scopeGroupId === null ||
        scopeGroupId === node.id ||
        getParentGroupId(tree, node.id) === scopeGroupId ||
        isAncestorOfScope(tree, node.id, scopeGroupId);

    // A group is selectable only if its parent is the active scope (sibling of selected items)
    // Ancestor groups need pointer-events for children but should NOT be selectable themselves
    const isInScopeForSelection =
      scopeGroupId === null || getParentGroupId(tree, node.id) === scopeGroupId;

    // Brackets should be dimmed for ancestor groups that are NOT selectable
    // (i.e., groups that only have pointer-events for their children but aren't themselves in the selection scope)
    const shouldDimBrackets =
      hasActiveScope && !isInScopeForSelection && scopeGroupId !== node.id && !isSelected;

    // Hide brackets for root when it has only one child (single condition shouldn't look grouped)
    // Show brackets if root is selected (to indicate it's selectable) or if chaining to it
    const shouldHideRootBrackets =
      isRoot && node.children.length === 1 && !isSelected && !isPendingChainTarget;

    // Determine if this group can be clicked to select/deselect
    // Root is only clickable when it has 2+ children (a single item isn't a meaningful group)
    // Non-root: only clickable if it's a sibling of the current selection (not an ancestor or the scope itself)
    const isClickable = isRoot
      ? node.children.length >= 2 && (!hasActiveScope || isSelected)
      : !hasActiveScope || isInScopeForSelection;

    const handleGroupClick = (e: React.MouseEvent): void => {
      // When root is selected, clicking anywhere inside deselects it
      if (isRoot && isSelected) {
        e.stopPropagation();
        selectGroup(node.id); // This will toggle (deselect) the root
        return;
      }
      // Only handle clicks directly on the group container or brackets, not on children
      if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bracket === 'true') {
        e.stopPropagation();
        if (isClickable) {
          selectGroup(node.id);
        } else {
          // Clicking on a non-selectable group (ancestor) clears the selection
          clearSelection();
          if (pendingChain && onChainRequest) {
            onChainRequest(null);
          }
        }
      }
    };

    // Check if an element or any of its ancestors (up to container) is a chip or nested group
    const isOverInteractiveChild = (target: HTMLElement, container: HTMLElement): boolean => {
      let el: HTMLElement | null = target;
      while (el && el !== container) {
        if (el.dataset.chip === 'true') return true;
        // Check for nested group (role="group" but not the container itself)
        if (el.getAttribute('role') === 'group' && el !== container) return true;
        el = el.parentElement;
      }
      return false;
    };

    const handleMouseOver = (e: React.MouseEvent): void => {
      if (
        isClickable &&
        !isOverInteractiveChild(e.target as HTMLElement, e.currentTarget as HTMLElement)
      ) {
        if (hoveredGroupId !== node.id) {
          setHoveredGroupId(node.id);
        }
        e.stopPropagation(); // Prevent parent groups from also handling hover
      }
    };

    const handleMouseLeave = (): void => {
      if (hoveredGroupId === node.id) {
        setHoveredGroupId(null);
      }
    };

    const handleMouseMove = (e: React.MouseEvent): void => {
      const overChild = isOverInteractiveChild(
        e.target as HTMLElement,
        e.currentTarget as HTMLElement,
      );
      if (!overChild && isClickable) {
        if (hoveredGroupId !== node.id) {
          setHoveredGroupId(node.id);
        }
        // Prevent parent groups from also handling hover (nested group case)
        e.stopPropagation();
      } else if (overChild && hoveredGroupId === node.id) {
        setHoveredGroupId(null);
      }
    };

    const isHovered = hoveredGroupId === node.id;

    const groupElement = (
      <span
        role="group"
        aria-label={`${node.logic} group`}
        onClick={handleGroupClick}
        onMouseOver={handleMouseOver}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        className={cn(
          'inline py-1 transition-all rounded-md',
          !isRoot && 'px-1',
          // Clickable cursor for clickable groups (including root when no scope)
          isClickable && 'cursor-pointer',
          // In-scope selectable state (light hint that group is selectable)
          !isRoot &&
            hasActiveScope &&
            inScope &&
            !isSelected &&
            !isHovered &&
            !isPendingChainTarget &&
            node.logic === 'AND' &&
            'bg-blue-50/50 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-800',
          !isRoot &&
            hasActiveScope &&
            inScope &&
            !isSelected &&
            !isHovered &&
            !isPendingChainTarget &&
            node.logic === 'OR' &&
            'bg-purple-50/50 ring-1 ring-purple-200 dark:bg-purple-950/30 dark:ring-purple-800',
          // Hover state - only when directly hovering the group container or brackets
          isHovered &&
            !isSelected &&
            !isPendingChainTarget &&
            node.logic === 'AND' &&
            'bg-blue-100 dark:bg-blue-900/60 ring-2 ring-blue-400 ring-offset-1',
          isHovered &&
            !isSelected &&
            !isPendingChainTarget &&
            node.logic === 'OR' &&
            'bg-purple-100 dark:bg-purple-900/60 ring-2 ring-purple-400 ring-offset-1',
          // Selected state (overrides hover) - color based on group's logic
          isSelected &&
            node.logic === 'AND' &&
            'bg-blue-200/80 dark:bg-blue-800/60 ring-2 ring-blue-400',
          isSelected &&
            node.logic === 'OR' &&
            'bg-purple-200/80 dark:bg-purple-800/60 ring-2 ring-purple-400',
          // Pending chain target
          !isSelected &&
            isPendingChainTarget &&
            pendingChain?.logic === 'AND' &&
            'bg-blue-50 dark:bg-blue-900/30',
          !isSelected &&
            isPendingChainTarget &&
            pendingChain?.logic === 'OR' &&
            'bg-purple-50 dark:bg-purple-900/30',
          // Default non-root background (only when no active scope)
          !isRoot && !hasActiveScope && !isSelected && !isPendingChainTarget && 'bg-muted/30',
          // Out of scope dimming (but not for the selected root itself)
          hasActiveScope && !inScope && !(isRoot && isSelected) && 'opacity-50 pointer-events-none',
        )}
      >
        {!shouldHideRootBrackets && (
          <span
            data-bracket="true"
            className={cn(
              'font-mono text-lg inline-flex items-center py-0.5 select-none align-middle',
              node.logic === 'AND'
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-purple-700 dark:text-purple-400',
              shouldDimBrackets && 'opacity-50',
            )}
          >
            (
          </span>
        )}
        {node.children.map((child, index) => (
          <Fragment key={child.id}>
            {renderNode(child, node.logic, false)}
            {index < node.children.length - 1 && renderLogicBadge(node.logic, node.id, index)}
          </Fragment>
        ))}
        {!shouldHideRootBrackets && (
          <span
            data-bracket="true"
            className={cn(
              'font-mono text-lg inline-flex items-center py-0.5 select-none align-middle',
              node.logic === 'AND'
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-purple-700 dark:text-purple-400',
              shouldDimBrackets && 'opacity-50',
            )}
          >
            )
          </span>
        )}
      </span>
    );

    // If this group is the pending chain target, show it with the logic badge and placeholder
    if (isPendingChainTarget && pendingChain) {
      // For root groups, always show outer brackets since chain will create a new wrapper
      // For non-root groups, only show brackets if chain logic differs from parent logic
      let needsBrackets: boolean;
      if (isRoot) {
        // Root always needs brackets - chaining creates ((root) AND/OR new)
        needsBrackets = true;
      } else {
        // Get parent's logic to determine if we need brackets
        const parentId = getParentGroupId(tree, node.id);
        const parentGroup = parentId ? findNodeById(tree, parentId) : tree;
        const parentLogic =
          parentGroup && isConditionGroup(parentGroup) ? parentGroup.logic : tree.logic;
        needsBrackets = pendingChain.logic !== parentLogic;
      }

      return (
        <span key={node.id} className="inline">
          {needsBrackets && (
            <span
              className={cn(
                'font-mono text-lg inline-flex items-center py-0.5 align-middle',
                pendingChain.logic === 'AND'
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-purple-700 dark:text-purple-400',
              )}
            >
              (
            </span>
          )}
          {groupElement}
          {renderLogicBadge(pendingChain.logic, node.id, -1, false)}
          {renderPlaceholderChip()}
          {needsBrackets && (
            <span
              className={cn(
                'font-mono text-lg inline-flex items-center py-0.5 align-middle',
                pendingChain.logic === 'AND'
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-purple-700 dark:text-purple-400',
              )}
            >
              )
            </span>
          )}
        </span>
      );
    }

    return groupElement;
  };

  return (
    <div className="space-y-3">
      {/* Action toolbar */}
      <div className="flex items-center justify-end gap-2">
        {/* Single chip selection: chain and delete buttons (not for groups) */}
        {singleSelectedId && !isGroupSelected && (
          <div className="flex items-center gap-2">
            {onChainRequest && (
              <>
                <span className="text-xs text-muted-foreground">Chain with:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChainRequest('AND')}
                  className={cn(
                    'h-7 text-xs gap-1',
                    pendingChain?.targetId === singleSelectedId && pendingChain.logic === 'AND'
                      ? 'bg-blue-100 text-blue-700 border-blue-400 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950',
                  )}
                >
                  <Plus className="h-3 w-3" />
                  AND
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChainRequest('OR')}
                  className={cn(
                    'h-7 text-xs gap-1',
                    pendingChain?.targetId === singleSelectedId && pendingChain.logic === 'OR'
                      ? 'bg-purple-100 text-purple-700 border-purple-400 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950',
                  )}
                >
                  <Plus className="h-3 w-3" />
                  OR
                </Button>
                <div className="w-px h-5 bg-border" />
              </>
            )}
            {onEditRequest && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // Toggle: if already editing this node, close; otherwise open
                  if (editingNodeId === singleSelectedId) {
                    onEditRequest(null);
                  } else {
                    // Cancel pending chain when opening edit mode
                    if (pendingChain && onChainRequest) {
                      onChainRequest(null);
                    }
                    onEditRequest(singleSelectedId);
                  }
                }}
                className={cn(
                  'h-7 text-xs gap-1',
                  editingNodeId === singleSelectedId && 'bg-accent',
                )}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleRemove(singleSelectedId)}
              className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        )}

        {/* Root group selected: operator toggle, chain, and delete all option */}
        {isRootSelected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group:</span>
            {/* Operator toggle */}
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => handleChangeGroupOperator('AND')}
                className={cn(
                  'px-2 py-1 text-xs font-medium transition-colors',
                  selectedGroupOperator === 'AND'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                AND
              </button>
              <button
                type="button"
                onClick={() => handleChangeGroupOperator('OR')}
                className={cn(
                  'px-2 py-1 text-xs font-medium transition-colors border-l border-border',
                  selectedGroupOperator === 'OR'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                OR
              </button>
            </div>
            <div className="w-px h-5 bg-border" />
            {/* Chain buttons for root group */}
            {onChainRequest && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChainRequest('AND')}
                  className={cn(
                    'h-7 text-xs gap-1',
                    pendingChain?.targetId === tree.id && pendingChain.logic === 'AND'
                      ? 'bg-blue-100 text-blue-700 border-blue-400 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950',
                  )}
                >
                  <Plus className="h-3 w-3" />
                  AND
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChainRequest('OR')}
                  className={cn(
                    'h-7 text-xs gap-1',
                    pendingChain?.targetId === tree.id && pendingChain.logic === 'OR'
                      ? 'bg-purple-100 text-purple-700 border-purple-400 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950',
                  )}
                >
                  <Plus className="h-3 w-3" />
                  OR
                </Button>
                <div className="w-px h-5 bg-border" />
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-7 text-xs"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Non-root group selected: operator toggle, chain, and ungroup */}
        {isGroupSelected && selectedGroupId && !isRootSelected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group:</span>
            {/* Operator toggle */}
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => handleChangeGroupOperator('AND')}
                className={cn(
                  'px-2 py-1 text-xs font-medium transition-colors',
                  selectedGroupOperator === 'AND'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                AND
              </button>
              <button
                type="button"
                onClick={() => handleChangeGroupOperator('OR')}
                className={cn(
                  'px-2 py-1 text-xs font-medium transition-colors border-l border-border',
                  selectedGroupOperator === 'OR'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                OR
              </button>
            </div>
            <div className="w-px h-5 bg-border" />
            {/* Chain group buttons */}
            {onChainRequest && (
              <>
                <span className="text-xs text-muted-foreground">Chain:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChainRequest('AND')}
                  className={cn(
                    'h-7 text-xs gap-1',
                    pendingChain?.targetId === selectedGroupId && pendingChain.logic === 'AND'
                      ? 'bg-blue-100 text-blue-700 border-blue-400 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950',
                  )}
                >
                  <Plus className="h-3 w-3" />
                  AND
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChainRequest('OR')}
                  className={cn(
                    'h-7 text-xs gap-1',
                    pendingChain?.targetId === selectedGroupId && pendingChain.logic === 'OR'
                      ? 'bg-purple-100 text-purple-700 border-purple-400 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950',
                  )}
                >
                  <Plus className="h-3 w-3" />
                  OR
                </Button>
                <div className="w-px h-5 bg-border" />
              </>
            )}
            {/* Ungroup button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUngroup}
              className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950"
            >
              <Ungroup className="h-3 w-3 mr-1" />
              Ungroup
            </Button>
            {/* Delete group button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleRemove(selectedGroupId)}
              className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-7 text-xs"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Multiple selection (not a full group): group button */}
        {selectedIds.size >= 2 && !isGroupSelected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected:</span>
            {canGroup && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGroup}
                className={cn(
                  'h-7 text-xs',
                  getScopeOperator() === 'AND'
                    ? 'text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950'
                    : 'text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950',
                )}
              >
                Group
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-7 text-xs"
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Chip display area */}
      <div
        role="listbox"
        aria-label="Conditions"
        aria-multiselectable="true"
        onClick={(e) => {
          // Clear selection when clicking empty space (not on a chip or group)
          if (e.target === e.currentTarget) {
            clearSelection();
            if (pendingChain && onChainRequest) {
              onChainRequest(null);
            }
          }
        }}
        className="p-4 rounded-lg border border-border bg-background min-h-[48px] leading-[2.5]"
      >
        {renderGroup(tree, null, true)}
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground">
        {pendingChain
          ? `Select a field above to add a condition chained with ${pendingChain.logic}.`
          : scopeGroupId !== null
            ? 'Selection is scoped to the current group. Click a chip outside to start a new selection.'
            : 'Click chips to select, or hover over a group to highlight and click to select it.'}
      </p>
    </div>
  );
}
