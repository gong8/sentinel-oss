/**
 * ChipBuilder Utilities
 * Tree manipulation functions for condition building
 */

import type { PolicyConditions } from '../types';
import type {
  ConditionGroupNode,
  ConditionLeafNode,
  ConditionNodeId,
  ConditionTreeNode,
  LogicalOperator,
} from './types';
import { isConditionGroup, isConditionLeaf } from './types';

/**
 * Generate a unique node ID
 */
export function generateNodeId(): ConditionNodeId {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create an empty condition leaf node
 */
export function createEmptyCondition(): ConditionLeafNode {
  return {
    type: 'condition',
    id: generateNodeId(),
    field: '',
    operator: 'equals',
    value: undefined,
  };
}

/**
 * Create a group node with the given children and logic
 */
export function createGroup(
  children: ConditionTreeNode[],
  logic: LogicalOperator,
): ConditionGroupNode {
  return {
    type: 'group',
    id: generateNodeId(),
    logic,
    children,
  };
}

/**
 * Create an empty root group (default structure)
 */
export function createEmptyTree(): ConditionGroupNode {
  return createGroup([], 'AND');
}

/**
 * Convert flat PolicyConditions array to tree structure
 * All conditions are wrapped in an AND group
 */
export function flatToTree(conditions: PolicyConditions | null): ConditionGroupNode {
  if (!conditions || conditions.length === 0) {
    return createEmptyTree();
  }

  const children: ConditionLeafNode[] = conditions.map((c) => ({
    type: 'condition',
    id: generateNodeId(),
    field: c.field,
    operator: c.operator,
    value: c.value,
    valueRef: c.valueRef,
  }));

  return createGroup(children, 'AND');
}

/**
 * Convert tree structure back to flat PolicyConditions array
 * Only valid if tree is a simple AND group with only leaf children
 * Returns null if tree has nested groups or OR logic
 */
export function treeToFlat(tree: ConditionGroupNode): PolicyConditions | null {
  // Only convert if it's a simple AND group with no nested groups
  if (tree.logic !== 'AND') {
    return null;
  }

  for (const child of tree.children) {
    if (isConditionGroup(child)) {
      return null; // Has nested groups, cannot flatten
    }
  }

  // All children are leaves, safe to flatten
  return tree.children.filter(isConditionLeaf).map((leaf) => ({
    field: leaf.field,
    operator: leaf.operator,
    value: leaf.value,
    valueRef: leaf.valueRef,
  }));
}

/**
 * Check if tree structure is simple (can be represented as flat array)
 */
export function isSimpleTree(tree: ConditionGroupNode): boolean {
  return treeToFlat(tree) !== null;
}

/**
 * Find a node by ID in the tree
 */
export function findNodeById(
  tree: ConditionTreeNode,
  id: ConditionNodeId,
): ConditionTreeNode | null {
  if (tree.id === id) {
    return tree;
  }

  if (isConditionGroup(tree)) {
    for (const child of tree.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Find parent of a node by ID
 * Returns null if node is the root or not found
 */
export function findParentNode(
  tree: ConditionGroupNode,
  id: ConditionNodeId,
): ConditionGroupNode | null {
  for (const child of tree.children) {
    if (child.id === id) {
      return tree;
    }
    if (isConditionGroup(child)) {
      const found = findParentNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Update a node in the tree (immutably)
 */
export function updateNode(
  tree: ConditionTreeNode,
  id: ConditionNodeId,
  updates: Partial<ConditionLeafNode> | Partial<ConditionGroupNode>,
): ConditionTreeNode {
  if (tree.id === id) {
    return { ...tree, ...updates } as ConditionTreeNode;
  }

  if (isConditionGroup(tree)) {
    return {
      ...tree,
      children: tree.children.map((child) => updateNode(child, id, updates)),
    };
  }

  return tree;
}

/**
 * Remove a node from the tree (immutably)
 * Returns the new tree, or null if the root was removed
 */
export function removeNode(
  tree: ConditionGroupNode,
  id: ConditionNodeId,
): ConditionGroupNode | null {
  // Can't remove root
  if (tree.id === id) {
    return null;
  }

  const newChildren = tree.children
    .filter((child) => child.id !== id)
    .map((child) => {
      if (isConditionGroup(child)) {
        const updated = removeNode(child, id);
        return updated ?? child;
      }
      return child;
    });

  return {
    ...tree,
    children: newChildren,
  };
}

/**
 * Add a child to a group node
 */
export function addChildToGroup(
  tree: ConditionGroupNode,
  groupId: ConditionNodeId,
  child: ConditionTreeNode,
): ConditionGroupNode {
  if (tree.id === groupId) {
    return {
      ...tree,
      children: [...tree.children, child],
    };
  }

  return {
    ...tree,
    children: tree.children.map((c) => {
      if (isConditionGroup(c)) {
        return addChildToGroup(c, groupId, child);
      }
      return c;
    }),
  };
}

/**
 * Update children of a group node (internal helper)
 */
function updateGroupChildren(
  tree: ConditionGroupNode,
  groupId: ConditionNodeId,
  newChildren: ConditionTreeNode[],
): ConditionGroupNode {
  if (tree.id === groupId) {
    return { ...tree, children: newChildren };
  }

  return {
    ...tree,
    children: tree.children.map((c) => {
      if (isConditionGroup(c)) {
        return updateGroupChildren(c, groupId, newChildren);
      }
      return c;
    }),
  };
}

/**
 * Group selected nodes with a logical operator
 * Finds the common parent and wraps selected nodes in a new group
 * Preserves the position of the first selected node in the original order
 */
export function groupNodes(
  tree: ConditionGroupNode,
  nodeIds: ConditionNodeId[],
  logic: LogicalOperator,
): ConditionGroupNode {
  if (nodeIds.length < 2) {
    return tree;
  }

  const nodeIdSet = new Set(nodeIds);

  // Find the nodes to group in their original tree order
  const nodesToGroup: ConditionTreeNode[] = [];
  let firstNodeIndex = -1;

  // Traverse tree children to find nodes in order and track first position
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    if (nodeIdSet.has(child.id)) {
      const node = findNodeById(tree, child.id);
      if (node) {
        nodesToGroup.push(node);
        if (firstNodeIndex === -1) {
          firstNodeIndex = i;
        }
      }
    }
  }

  if (nodesToGroup.length < 2) {
    return tree;
  }

  // Create the new group with the nodes in their original order
  const newGroup = createGroup(nodesToGroup, logic);

  // Build new children array: keep non-selected nodes and insert group at first position
  const newChildren: ConditionTreeNode[] = [];
  let groupInserted = false;

  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    if (nodeIdSet.has(child.id)) {
      // This is a selected node - insert group at first occurrence, skip rest
      if (!groupInserted) {
        newChildren.push(newGroup);
        groupInserted = true;
      }
      // Skip this node (it's now in the group)
    } else {
      newChildren.push(child);
    }
  }

  return {
    ...tree,
    children: newChildren,
  };
}

/**
 * Group selected nodes at the anchor's position
 * The anchor determines where the new group is placed
 */
export function groupNodesAtAnchor(
  tree: ConditionGroupNode,
  nodeIds: ConditionNodeId[],
  anchorId: ConditionNodeId,
  logic: LogicalOperator,
): ConditionGroupNode {
  if (nodeIds.length < 2) {
    return tree;
  }

  const nodeIdSet = new Set(nodeIds);

  // Find anchor position
  let anchorIndex = -1;
  for (let i = 0; i < tree.children.length; i++) {
    if (tree.children[i].id === anchorId) {
      anchorIndex = i;
      break;
    }
  }

  // If anchor not found in children, fall back to groupNodes
  if (anchorIndex === -1) {
    return groupNodes(tree, nodeIds, logic);
  }

  // Collect nodes to group in their original tree order
  const nodesToGroup: ConditionTreeNode[] = [];
  for (const child of tree.children) {
    if (nodeIdSet.has(child.id)) {
      const node = findNodeById(tree, child.id);
      if (node) {
        nodesToGroup.push(node);
      }
    }
  }

  if (nodesToGroup.length < 2) {
    return tree;
  }

  // Create the new group
  const newGroup = createGroup(nodesToGroup, logic);

  // Build new children: insert group at anchor position, skip other selected nodes
  const newChildren: ConditionTreeNode[] = [];
  let groupInserted = false;

  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    if (nodeIdSet.has(child.id)) {
      // Insert group at anchor position
      if (child.id === anchorId && !groupInserted) {
        newChildren.push(newGroup);
        groupInserted = true;
      }
      // Skip this node (it's in the group now)
    } else {
      newChildren.push(child);
    }
  }

  return {
    ...tree,
    children: newChildren,
  };
}

/**
 * Ungroup a group node - move its children to the parent group
 * Returns the modified tree
 */
export function ungroupNode(
  tree: ConditionGroupNode,
  groupId: ConditionNodeId,
): ConditionGroupNode {
  // Cannot ungroup root
  if (tree.id === groupId) {
    // Flatten the root if it only has group children
    return tree;
  }

  // Find the parent of the group to ungroup
  const parent = findParentNode(tree, groupId);
  if (!parent) {
    return tree;
  }

  // Find the group to ungroup
  const groupIndex = parent.children.findIndex((c) => c.id === groupId);
  if (groupIndex === -1) {
    return tree;
  }

  const group = parent.children[groupIndex];
  if (!isConditionGroup(group)) {
    return tree;
  }

  // Build new children array: replace the group with its children
  const newChildren: ConditionTreeNode[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    if (i === groupIndex) {
      // Insert the group's children in place of the group
      newChildren.push(...group.children);
    } else {
      newChildren.push(parent.children[i]);
    }
  }

  // Update the parent's children
  return updateGroupChildren(tree, parent.id, newChildren);
}

/**
 * Unwrap nested groups that have only one child
 * Used after deletion to clean up the tree
 * - Nested groups with a single child are unwrapped (child promoted to parent)
 * - Root group is never unwrapped (it's the container)
 */
export function cleanupSingleChildGroups(tree: ConditionGroupNode): ConditionGroupNode {
  // First, recursively clean all child groups
  const recursivelyCleanedChildren = tree.children.map((child) => {
    if (isConditionGroup(child)) {
      return cleanupSingleChildGroups(child);
    }
    return child;
  });

  // Flatten any child groups that have only one element
  // (promote the grandchild to be a direct child)
  const flattenedChildren = recursivelyCleanedChildren.flatMap((child) => {
    if (isConditionGroup(child) && child.children.length === 1) {
      // Unwrap: return the single grandchild directly
      return child.children;
    }
    return [child];
  });

  return {
    ...tree,
    children: flattenedChildren,
  };
}

/**
 * Remove empty groups from the tree
 */
export function removeEmptyGroups(tree: ConditionGroupNode): ConditionGroupNode {
  const cleanedChildren = tree.children
    .filter((child) => {
      if (isConditionGroup(child)) {
        return child.children.length > 0;
      }
      return true;
    })
    .map((child) => {
      if (isConditionGroup(child)) {
        return removeEmptyGroups(child);
      }
      return child;
    });

  return {
    ...tree,
    children: cleanedChildren,
  };
}

/**
 * Full tree cleanup: remove empty groups and unwrap single-child groups
 */
export function cleanupTree(tree: ConditionGroupNode): ConditionGroupNode {
  return cleanupSingleChildGroups(removeEmptyGroups(tree));
}

/**
 * Get all leaf node IDs in the tree
 */
export function getAllLeafIds(tree: ConditionTreeNode): ConditionNodeId[] {
  if (isConditionLeaf(tree)) {
    return [tree.id];
  }

  return tree.children.flatMap(getAllLeafIds);
}

/**
 * Check if a node is a direct child of a specific group
 */
export function isDirectChildOf(
  tree: ConditionGroupNode,
  nodeId: ConditionNodeId,
  groupId: ConditionNodeId,
): boolean {
  const parent = findParentNode(tree, nodeId);
  return parent?.id === groupId;
}

/**
 * Get the group ID that contains a node as a direct child
 * Returns the root ID if node is at root level
 */
export function getParentGroupId(
  tree: ConditionGroupNode,
  nodeId: ConditionNodeId,
): ConditionNodeId | null {
  if (tree.id === nodeId) {
    return null; // Node is root
  }
  const parent = findParentNode(tree, nodeId);
  return parent?.id ?? null;
}

/**
 * Get all node IDs in the tree
 */
export function getAllNodeIds(tree: ConditionTreeNode): ConditionNodeId[] {
  if (isConditionLeaf(tree)) {
    return [tree.id];
  }

  return [tree.id, ...tree.children.flatMap(getAllNodeIds)];
}

/**
 * Count total conditions in the tree
 */
export function countConditions(tree: ConditionTreeNode): number {
  if (isConditionLeaf(tree)) {
    return 1;
  }

  return tree.children.reduce((sum, child) => sum + countConditions(child), 0);
}

/**
 * Check if a condition is complete (has field, operator, and value or valueRef)
 */
export function isConditionComplete(condition: ConditionLeafNode): boolean {
  if (!condition.field || !condition.operator) {
    return false;
  }

  // exists/notExists don't require values
  if (condition.operator === 'exists' || condition.operator === 'notExists') {
    return true;
  }

  return condition.value !== undefined || condition.valueRef !== undefined;
}

/**
 * Get adjacent node IDs (for selecting when clicking AND/OR chip)
 */
export function getAdjacentNodeIds(
  parent: ConditionGroupNode,
  index: number,
): [ConditionNodeId, ConditionNodeId] | null {
  if (index < 0 || index >= parent.children.length - 1) {
    return null;
  }

  const left = parent.children[index];
  const right = parent.children[index + 1];

  return [left.id, right.id];
}

/**
 * Chain a new node next to an existing node with a logical operator
 * If the parent already uses that logic, just add as sibling
 * Otherwise, wrap the target and new node in a new group
 */
export function chainNode(
  tree: ConditionGroupNode,
  targetId: ConditionNodeId,
  newNode: ConditionTreeNode,
  logic: LogicalOperator,
): ConditionGroupNode {
  const parent = findParentNode(tree, targetId);
  if (!parent) {
    // Target is at root level or not found, just add to root
    return addChildToGroup(tree, tree.id, newNode);
  }

  // Find the index of the target in its parent
  const targetIndex = parent.children.findIndex((c) => c.id === targetId);
  if (targetIndex === -1) {
    return addChildToGroup(tree, tree.id, newNode);
  }

  const targetNode = parent.children[targetIndex];

  // If parent uses the same logic, insert the new node right after the target
  if (parent.logic === logic) {
    const newChildren = [...parent.children];
    newChildren.splice(targetIndex + 1, 0, newNode);
    return updateGroupChildren(tree, parent.id, newChildren);
  }

  // Parent uses different logic - wrap target and new node in a new group
  const newGroup = createGroup([targetNode, newNode], logic);

  // Replace the target with the new group
  const newChildren = [...parent.children];
  newChildren[targetIndex] = newGroup;
  return updateGroupChildren(tree, parent.id, newChildren);
}

/**
 * Format a condition for display as a chip label
 */
export function formatConditionLabel(condition: ConditionLeafNode): string {
  if (!condition.field) {
    return 'New condition';
  }

  // Use the full field path for clarity
  const fieldLabel = condition.field;

  if (!condition.operator) {
    return fieldLabel;
  }

  const operatorLabels: Record<string, string> = {
    equals: '=',
    notEquals: '\u2260',
    contains: 'contains',
    notContains: '!contains',
    startsWith: 'starts',
    endsWith: 'ends',
    matches: '~',
    lessThan: '<',
    greaterThan: '>',
    between: 'between',
    in: 'in',
    notIn: 'not in',
    containsAny: 'has any',
    containsNone: 'has none',
    exists: 'exists',
    notExists: '!exists',
    inCidr: 'in CIDR',
    notInCidr: '!in CIDR',
  };

  const opLabel = operatorLabels[condition.operator] || condition.operator;

  // For exists/notExists, no value needed
  if (condition.operator === 'exists' || condition.operator === 'notExists') {
    return `${fieldLabel} ${opLabel}`;
  }

  // Format value
  let valueLabel = '';
  if (condition.valueRef) {
    valueLabel = `$${condition.valueRef}`;
  } else if (condition.value !== undefined) {
    if (Array.isArray(condition.value)) {
      valueLabel = `[${condition.value.length}]`;
    } else if (typeof condition.value === 'string') {
      valueLabel =
        condition.value.length > 15
          ? `"${condition.value.slice(0, 15)}..."`
          : `"${condition.value}"`;
    } else {
      valueLabel = String(condition.value);
    }
  } else {
    valueLabel = '?';
  }

  return `${fieldLabel} ${opLabel} ${valueLabel}`;
}

/**
 * Format a value for expression syntax
 */
function formatExpressionValue(value: unknown, operator: string): string {
  if (value === null || value === undefined) return 'null';

  // Handle arrays
  if (Array.isArray(value)) {
    const formatted = value.map((v) => {
      if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return String(v);
    });
    return `[${formatted.join(', ')}]`;
  }

  // Handle strings
  if (typeof value === 'string') {
    if (operator === 'contains') {
      return `'%${value.replace(/'/g, "\\'")}%'`;
    }
    if (operator === 'startsWith') {
      return `'${value.replace(/'/g, "\\'")}%'`;
    }
    if (operator === 'endsWith') {
      return `'%${value.replace(/'/g, "\\'")}'`;
    }
    return `'${value.replace(/'/g, "\\'")}'`;
  }

  // Handle booleans
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  // Handle numbers
  return String(value);
}

/**
 * Convert a leaf condition node to expression syntax
 */
function leafToExpression(leaf: ConditionLeafNode): string {
  const { field, operator, value, valueRef } = leaf;

  if (!field || !operator) return '';

  const rightSide = valueRef ? valueRef : formatExpressionValue(value, operator);

  switch (operator) {
    case 'equals':
      return `${field} = ${rightSide}`;
    case 'notEquals':
      return `${field} != ${rightSide}`;
    case 'lessThan':
      return `${field} < ${rightSide}`;
    case 'greaterThan':
      return `${field} > ${rightSide}`;
    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        const min = valueRef ? `${valueRef}[0]` : formatExpressionValue(value[0], operator);
        const max = valueRef ? `${valueRef}[1]` : formatExpressionValue(value[1], operator);
        return `(${field} >= ${min} AND ${field} <= ${max})`;
      }
      return `${field} = ${rightSide}`;
    case 'contains':
      return `${field} LIKE ${rightSide}`;
    case 'notContains':
      return `NOT (${field} LIKE ${rightSide})`;
    case 'startsWith':
      return `${field} LIKE ${rightSide}`;
    case 'endsWith':
      return `${field} LIKE ${rightSide}`;
    case 'matches':
      return `${field} MATCHES ${rightSide}`;
    case 'in':
      return `${field} IN ${rightSide}`;
    case 'notIn':
      return `${field} NOT IN ${rightSide}`;
    case 'containsAny':
      if (Array.isArray(value)) {
        const checks = value.map(
          (v) => `CONTAINS(${field}, ${formatExpressionValue(v, operator)})`,
        );
        if (checks.length === 1) return checks[0];
        return `(${checks.join(' OR ')})`;
      }
      return `CONTAINS(${field}, ${rightSide})`;
    case 'containsNone':
      if (Array.isArray(value)) {
        const checks = value.map(
          (v) => `NOT CONTAINS(${field}, ${formatExpressionValue(v, operator)})`,
        );
        if (checks.length === 1) return checks[0];
        return `(${checks.join(' AND ')})`;
      }
      return `NOT CONTAINS(${field}, ${rightSide})`;
    case 'exists':
      return `EXISTS(${field})`;
    case 'notExists':
      return `NOT EXISTS(${field})`;
    case 'inCidr':
      return `${field} IN_CIDR ${rightSide}`;
    case 'notInCidr':
      return `${field} NOT IN_CIDR ${rightSide}`;
    default:
      return `${field} = ${rightSide}`;
  }
}

/**
 * Convert a condition tree to an expression string
 * Handles AND/OR logic and nested groups
 */
export function treeToExpression(node: ConditionTreeNode): string {
  if (isConditionLeaf(node)) {
    return leafToExpression(node);
  }

  if (isConditionGroup(node)) {
    const children = node.children
      .map((child) => treeToExpression(child))
      .filter((expr) => expr.length > 0);

    if (children.length === 0) return '';
    if (children.length === 1) return children[0];

    const joined = children.join(` ${node.logic} `);
    // Wrap in parens if this is a nested group (will be part of a larger expression)
    return `(${joined})`;
  }

  return '';
}
