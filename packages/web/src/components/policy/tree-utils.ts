/**
 * Shared utilities for schema tree components
 * Used by SchemaTreeNode and SchemaParameterTree
 */

import type { NestedFieldSchema } from './ConditionBuilder';

/**
 * Get the badge variant for a field type
 */
export function getFieldTypeBadgeVariant(
  type: NestedFieldSchema['type'],
): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'string':
      return 'default';
    case 'number':
    case 'object':
    case 'array':
      return 'secondary';
    case 'boolean':
    default:
      return 'outline';
  }
}

/**
 * Base indentation offset for tree nodes
 */
const TREE_BASE_INDENT = 8;

/**
 * Indentation per depth level
 */
const TREE_LEVEL_INDENT = 16;

/**
 * Calculate left padding for a tree node at a given depth
 */
export function getTreeIndentation(depth: number): number {
  return depth * TREE_LEVEL_INDENT + TREE_BASE_INDENT;
}

/**
 * Offset for tree connecting lines from the node's left padding
 */
export const TREE_LINE_OFFSET = 8;

/**
 * Width of horizontal connecting lines
 */
export const TREE_LINE_WIDTH = 8;

/**
 * Top position for horizontal connecting lines
 */
export const TREE_LINE_TOP = 16;

/**
 * Get style for vertical tree connecting line
 */
export function getVerticalLineStyle(paddingLeft: number): React.CSSProperties {
  return { left: paddingLeft + TREE_LINE_OFFSET };
}

/**
 * Get style for horizontal tree connecting line
 */
export function getHorizontalLineStyle(paddingLeft: number): React.CSSProperties {
  return {
    left: paddingLeft + TREE_LINE_OFFSET,
    width: TREE_LINE_WIDTH,
    top: TREE_LINE_TOP,
  };
}
