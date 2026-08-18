/**
 * useChipBuilder Hook
 * State management for the chip-based condition builder
 */

import { useCallback, useMemo, useState } from 'react';

import type { CategoryOption, OperatorGroups, ParamSuggestion, PolicyConditions } from '../types';
import type {
  ChainPreviewState,
  ChipSelection,
  ConditionGroupNode,
  ConditionLeafNode,
  ConditionNodeId,
  ContextBarMode,
  LogicalOperator,
} from './types';
import { isConditionGroup, isConditionLeaf } from './types';
import {
  addChildToGroup,
  cleanupTree,
  createEmptyCondition,
  createGroup,
  findNodeById,
  flatToTree,
  getAllLeafIds,
  getParentGroupId,
  groupNodes,
  groupNodesAtAnchor,
  removeNode,
  treeToFlat,
  ungroupNode,
  updateNode,
} from './utils';

interface UseChipBuilderOptions {
  value: PolicyConditions | null;
  conditionsTree: ConditionGroupNode | null;
  onChange: (value: PolicyConditions | null) => void;
  onTreeChange: (tree: ConditionGroupNode) => void;
  categories: CategoryOption[];
  operators: OperatorGroups;
  suggestions: Map<string, ParamSuggestion[]>;
  disabled: boolean;
}

interface UseChipBuilderReturn {
  tree: ConditionGroupNode;
  selection: ChipSelection;
  contextBarMode: ContextBarMode;
  focusedId: ConditionNodeId | null;
  setFocusedId: (id: ConditionNodeId | null) => void;
  addCondition: () => void;
  updateCondition: (id: ConditionNodeId, updates: Partial<ConditionLeafNode>) => void;
  removeCondition: (id: ConditionNodeId) => void;
  removeSelected: () => void;
  toggleSelection: (id: ConditionNodeId) => void;
  clearSelection: () => void;
  selectAll: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  canUngroup: boolean;
  chainWithLogic: (id: ConditionNodeId, logic: LogicalOperator) => void;
  getScopeOperator: () => LogicalOperator;
  changeGroupOperator: (groupId: ConditionNodeId, logic: LogicalOperator) => void;
  isNodeInScope: (nodeId: ConditionNodeId) => boolean;
  chainPreview: ChainPreviewState | null;
  setChainPreview: (preview: ChainPreviewState | null) => void;
  categories: CategoryOption[];
  operators: OperatorGroups;
  suggestions: Map<string, ParamSuggestion[]>;
  disabled: boolean;
}

export function useChipBuilder({
  value,
  conditionsTree,
  onChange,
  onTreeChange,
  categories,
  operators,
  suggestions,
  disabled,
}: UseChipBuilderOptions): UseChipBuilderReturn {
  // Initialize tree from conditionsTree or convert from flat value
  // Always clean the tree to ensure single-child groups are unwrapped
  const tree = useMemo(() => {
    if (conditionsTree) {
      return cleanupTree(conditionsTree);
    }
    return flatToTree(value);
  }, [conditionsTree, value]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<ConditionNodeId>>(new Set());
  const [focusedId, setFocusedId] = useState<ConditionNodeId | null>(null);
  // Anchor - the first-selected chip (determines position for grouping)
  const [anchorId, setAnchorId] = useState<ConditionNodeId | null>(null);
  // Selection scope - constrains selection to a specific group
  const [scopeGroupId, setScopeGroupId] = useState<ConditionNodeId | null>(null);
  // Chain preview state - shows what will happen when chaining
  const [chainPreview, setChainPreview] = useState<ChainPreviewState | null>(null);

  const selection: ChipSelection = useMemo(
    () => ({ selectedIds, anchorId, scopeGroupId }),
    [selectedIds, anchorId, scopeGroupId],
  );

  // Determine context bar mode based on selection
  const contextBarMode: ContextBarMode = useMemo(() => {
    const ids = Array.from(selectedIds);

    if (ids.length === 0) {
      return { type: 'empty' };
    }

    if (ids.length === 1) {
      const nodeId = ids[0];
      const node = findNodeById(tree, nodeId);
      // Show editing for leaf nodes
      if (node && isConditionLeaf(node)) {
        return { type: 'editing', nodeId };
      }
      // If it's a group, show group-selected mode
      if (node && isConditionGroup(node)) {
        return { type: 'groupSelected', groupId: nodeId };
      }
      return { type: 'grouping', nodeIds: ids };
    }

    return { type: 'grouping', nodeIds: ids };
  }, [selectedIds, tree]);

  // Propagate tree changes
  const updateTree = useCallback(
    (newTree: ConditionGroupNode) => {
      const cleaned = cleanupTree(newTree);
      onTreeChange(cleaned);

      // Also update flat conditions for backward compatibility
      const flat = treeToFlat(cleaned);
      onChange(flat);
    },
    [onChange, onTreeChange],
  );

  // Add a new condition to the tree
  const addCondition = useCallback(() => {
    if (disabled) return;

    const newCondition = createEmptyCondition();
    const newTree = addChildToGroup(tree, tree.id, newCondition);
    updateTree(newTree);

    // Select and focus the new condition
    setSelectedIds(new Set([newCondition.id]));
    setFocusedId(newCondition.id);
  }, [tree, updateTree, disabled]);

  // Update a condition
  const updateCondition = useCallback(
    (id: ConditionNodeId, updates: Partial<ConditionLeafNode>) => {
      if (disabled) return;

      const newTree = updateNode(tree, id, updates) as ConditionGroupNode;
      updateTree(newTree);
    },
    [tree, updateTree, disabled],
  );

  // Remove a condition
  const removeCondition = useCallback(
    (id: ConditionNodeId) => {
      if (disabled) return;

      const result = removeNode(tree, id);
      if (result) {
        updateTree(result);
      }

      // Clear selection if removed node was selected
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        // If selection is now empty, clear scope and anchor
        if (next.size === 0) {
          setScopeGroupId(null);
          setAnchorId(null);
        } else if (anchorId === id) {
          // Anchor was deleted, transfer to first remaining selected
          const remaining = Array.from(next);
          setAnchorId(remaining[0]);
        }
        return next;
      });

      if (focusedId === id) {
        setFocusedId(null);
      }
    },
    [tree, updateTree, focusedId, disabled, anchorId],
  );

  // Check if a node is within the current selection scope
  const isNodeInScope = useCallback(
    (nodeId: ConditionNodeId): boolean => {
      if (scopeGroupId === null) {
        return true; // No scope restriction
      }
      const parentId = getParentGroupId(tree, nodeId);
      return parentId === scopeGroupId;
    },
    [tree, scopeGroupId],
  );

  // Toggle selection of a node
  const toggleSelection = useCallback(
    (id: ConditionNodeId) => {
      if (disabled) return;

      // Prevent selecting the root group when it only has one leaf child
      // (single-leaf root shouldn't be treated as a "group" for selection purposes)
      if (id === tree.id && tree.children.length === 1 && isConditionLeaf(tree.children[0])) {
        return;
      }

      // Get the parent group of the clicked node
      const clickedParentId = getParentGroupId(tree, id);

      // If there's a scope set and the node is outside it, clear selection and start fresh
      if (scopeGroupId !== null && clickedParentId !== scopeGroupId) {
        setSelectedIds(new Set([id]));
        setAnchorId(id);
        setScopeGroupId(clickedParentId);
        return;
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          // If selection is now empty, clear scope and anchor
          if (next.size === 0) {
            setScopeGroupId(null);
            setAnchorId(null);
          } else if (anchorId === id) {
            // Anchor was deselected, transfer to first remaining selected
            const remaining = Array.from(next);
            setAnchorId(remaining[0]);
          }
        } else {
          next.add(id);
          // Set scope and anchor on first selection
          if (prev.size === 0) {
            setScopeGroupId(clickedParentId);
            setAnchorId(id);
          }
        }
        return next;
      });
    },
    [disabled, tree, scopeGroupId, anchorId],
  );

  // Clear all selections, anchor, and scope
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setFocusedId(null);
    setAnchorId(null);
    setScopeGroupId(null);
  }, []);

  // Select all leaf conditions
  const selectAll = useCallback(() => {
    if (disabled) return;
    const allLeafIds = getAllLeafIds(tree);
    setSelectedIds(new Set(allLeafIds));
  }, [tree, disabled]);

  // Get the logic operator of the current scope group
  const getScopeOperator = useCallback((): LogicalOperator => {
    if (scopeGroupId === null) {
      return tree.logic;
    }
    const scopeGroup = findNodeById(tree, scopeGroupId);
    if (scopeGroup && isConditionGroup(scopeGroup)) {
      return scopeGroup.logic;
    }
    return tree.logic;
  }, [tree, scopeGroupId]);

  // Change a group's internal operator
  const changeGroupOperator = useCallback(
    (groupId: ConditionNodeId, logic: LogicalOperator) => {
      if (disabled) return;
      const newTree = updateNode(tree, groupId, { logic }) as ConditionGroupNode;
      updateTree(newTree);
    },
    [tree, updateTree, disabled],
  );

  // Group selected nodes - inherits operator from scope
  const groupSelected = useCallback(() => {
    if (disabled) return;

    const ids = Array.from(selectedIds);
    if (ids.length < 2) return;

    // Inherit the logic operator from the scope
    const logic = getScopeOperator();

    // Group within the scoped group if scope is set
    if (scopeGroupId !== null && anchorId !== null) {
      const scopeGroup = findNodeById(tree, scopeGroupId);
      if (scopeGroup && isConditionGroup(scopeGroup)) {
        const newScopedGroup = groupNodesAtAnchor(scopeGroup, ids, anchorId, logic);
        // Replace the scoped group in the tree
        const newTree = updateNode(tree, scopeGroupId, {
          children: newScopedGroup.children,
        }) as ConditionGroupNode;
        updateTree(newTree);
        clearSelection();
        return;
      }
    }

    // Fall back to groupNodes at anchor if possible
    if (anchorId !== null) {
      const newTree = groupNodesAtAnchor(tree, ids, anchorId, logic);
      updateTree(newTree);
    } else {
      const newTree = groupNodes(tree, ids, logic);
      updateTree(newTree);
    }
    clearSelection();
  }, [
    tree,
    selectedIds,
    scopeGroupId,
    anchorId,
    getScopeOperator,
    updateTree,
    clearSelection,
    disabled,
  ]);

  // Check if ungroup is possible (a nested group is explicitly selected)
  const canUngroup = useMemo(() => {
    if (selectedIds.size === 0) return false;

    // Can only ungroup if a GROUP node is selected (not individual chips)
    // Check if any selected item is a non-root group
    for (const id of selectedIds) {
      const node = findNodeById(tree, id);
      if (node && isConditionGroup(node) && id !== tree.id) {
        return true;
      }
    }

    return false;
  }, [selectedIds, tree]);

  // Ungroup the selected group(s)
  const ungroupSelected = useCallback(() => {
    if (disabled || !canUngroup) return;

    // Find the first selected group that can be ungrouped (non-root groups)
    let groupToUngroup: ConditionNodeId | null = null;
    for (const id of selectedIds) {
      const node = findNodeById(tree, id);
      if (node && isConditionGroup(node) && id !== tree.id) {
        groupToUngroup = id;
        break;
      }
    }

    if (!groupToUngroup) return;

    const newTree = ungroupNode(tree, groupToUngroup);
    updateTree(newTree);
    clearSelection();
  }, [tree, selectedIds, canUngroup, updateTree, clearSelection, disabled]);

  // Remove all selected nodes
  const removeSelected = useCallback(() => {
    if (disabled) return;

    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    let newTree: ConditionGroupNode | null = tree;
    for (const id of ids) {
      if (newTree) {
        newTree = removeNode(newTree, id);
      }
    }

    if (newTree) {
      updateTree(newTree);
    }
    clearSelection();
  }, [tree, selectedIds, updateTree, clearSelection, disabled]);

  // Chain a condition with new condition using a logic operator
  const chainWithLogic = useCallback(
    (id: ConditionNodeId, logic: LogicalOperator) => {
      if (disabled) return;

      const node = findNodeById(tree, id);
      if (!node) return;

      // Create new empty condition
      const newCondition = createEmptyCondition();

      // Remove the original node
      let newTree = removeNode(tree, id);
      if (!newTree) return;

      // Create a group with both nodes
      const newGroup = createGroup([node, newCondition], logic);

      // Add the group to the tree
      newTree = addChildToGroup(newTree, newTree.id, newGroup);
      updateTree(newTree);

      // Select and focus the new condition for editing
      setSelectedIds(new Set([newCondition.id]));
      setFocusedId(newCondition.id);
    },
    [tree, updateTree, disabled],
  );

  return {
    tree,
    selection,
    contextBarMode,
    focusedId,
    setFocusedId,
    addCondition,
    updateCondition,
    removeCondition,
    removeSelected,
    toggleSelection,
    clearSelection,
    selectAll,
    groupSelected,
    ungroupSelected,
    canUngroup,
    chainWithLogic,
    getScopeOperator,
    changeGroupOperator,
    isNodeInScope,
    chainPreview,
    setChainPreview,
    categories,
    operators,
    suggestions,
    disabled,
  };
}
