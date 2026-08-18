/**
 * ChipBuilder Context
 * Provides state management for the chip-based condition builder
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { CategoryOption, OperatorGroups, ParamSuggestion } from '../types';
import type {
  ChainPreviewState,
  ChipSelection,
  ConditionGroupNode,
  ConditionLeafNode,
  ConditionNodeId,
  ContextBarMode,
  LogicalOperator,
} from './types';

interface ChipBuilderContextValue {
  // Tree state
  tree: ConditionGroupNode;

  // Selection state
  selection: ChipSelection;
  contextBarMode: ContextBarMode;

  // Actions
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

  // Chain preview state
  chainPreview: ChainPreviewState | null;
  setChainPreview: (preview: ChainPreviewState | null) => void;

  // Focused node
  focusedId: ConditionNodeId | null;
  setFocusedId: (id: ConditionNodeId | null) => void;

  // Props passed down from parent
  categories: CategoryOption[];
  operators: OperatorGroups;
  suggestions: Map<string, ParamSuggestion[]>;
  disabled: boolean;
}

const ChipBuilderContext = createContext<ChipBuilderContextValue | null>(null);

export function useChipBuilderContext(): ChipBuilderContextValue {
  const context = useContext(ChipBuilderContext);
  if (!context) {
    throw new Error('useChipBuilderContext must be used within a ChipBuilderProvider');
  }
  return context;
}

interface ChipBuilderProviderProps {
  value: ChipBuilderContextValue;
  children: ReactNode;
}

export function ChipBuilderProvider({ value, children }: ChipBuilderProviderProps): ReactNode {
  return <ChipBuilderContext.Provider value={value}>{children}</ChipBuilderContext.Provider>;
}
