/**
 * ChipBuilder Types
 * Tree-based condition structure supporting AND/OR logic with full nesting
 */

import type { ConditionOperator } from '../types';

/** Unique identifier for condition nodes */
export type ConditionNodeId = string;

/** Logical operators for grouping conditions */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Leaf node representing a single condition
 */
export interface ConditionLeafNode {
  type: 'condition';
  id: ConditionNodeId;
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  valueRef?: string;
}

/**
 * Group node containing multiple conditions or nested groups
 */
export interface ConditionGroupNode {
  type: 'group';
  id: ConditionNodeId;
  logic: LogicalOperator;
  children: ConditionTreeNode[];
}

/**
 * Union type for all tree node types
 */
export type ConditionTreeNode = ConditionLeafNode | ConditionGroupNode;

/**
 * Selection state for chips
 */
export interface ChipSelection {
  selectedIds: Set<ConditionNodeId>;
  /** ID of the first-selected chip (determines position for grouping) */
  anchorId: ConditionNodeId | null;
  /** ID of the group that constrains selection (null = root/no constraint) */
  scopeGroupId: ConditionNodeId | null;
}

/**
 * Context bar mode based on selection
 */
export type ContextBarMode =
  | { type: 'empty' } // No selection: show "Add Condition" button
  | { type: 'editing'; nodeId: ConditionNodeId } // Single condition selected: show editor
  | { type: 'grouping'; nodeIds: ConditionNodeId[] } // Multiple selected: show grouping buttons
  | { type: 'groupSelected'; groupId: ConditionNodeId }; // Single group selected

/**
 * Type guards for tree nodes
 */
export function isConditionLeaf(node: ConditionTreeNode): node is ConditionLeafNode {
  return node.type === 'condition';
}

export function isConditionGroup(node: ConditionTreeNode): node is ConditionGroupNode {
  return node.type === 'group';
}

/**
 * Chip state for rendering
 */
export interface ChipState {
  isSelected: boolean;
  isEditing: boolean;
  isFocused: boolean;
}

/**
 * Props for condition display in chips
 */
export interface ConditionDisplayProps {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  valueRef?: string;
}

/**
 * Render context passed through recursive rendering
 */
export interface RenderContext {
  depth: number;
  parentLogic?: LogicalOperator;
  isFirstChild: boolean;
  isLastChild: boolean;
}

/**
 * Chain preview state - shows what will happen when chaining
 */
export interface ChainPreviewState {
  /** The node being chained from */
  sourceNodeId: ConditionNodeId;
  /** The logic operator being previewed */
  previewLogic: LogicalOperator;
  /** The logic of the current scope (to determine if brackets needed) */
  scopeLogic: LogicalOperator;
}
