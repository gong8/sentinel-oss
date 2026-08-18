/**
 * ChipContextBar Component
 * Context-aware toolbar that changes based on selection:
 * - No selection: "Add Condition" button
 * - 1 leaf selected: Field/Operator/Value editor with Chain button
 * - 2+ selected: Group button (inherits scope operator)
 * - 1 group selected: Change operator, Chain, Ungroup buttons
 */

import { Link2, Plus, Trash2, Ungroup } from 'lucide-react';
import { useState, type JSX } from 'react';

import { Button } from '../../../ui/button';
import { FieldSelector } from '../FieldSelector';
import { OperatorSelector } from '../OperatorSelector';
import type { ConditionOperator, FieldOption } from '../types';
import { ValueInput } from '../ValueInput';
import { useChipBuilderContext } from './ChipBuilderContext';
import { isConditionGroup, isConditionLeaf } from './types';
import { findNodeById } from './utils';

type PendingAction = 'chain' | 'changeOperator' | null;

export function ChipContextBar(): JSX.Element {
  const {
    tree,
    selection,
    contextBarMode,
    addCondition,
    updateCondition,
    removeCondition,
    removeSelected,
    groupSelected,
    ungroupSelected,
    canUngroup,
    chainWithLogic,
    getScopeOperator,
    changeGroupOperator,
    setChainPreview,
    categories,
    operators,
    suggestions,
    disabled,
  } = useChipBuilderContext();

  // Derive a stable key from the context to detect when it changes
  // When context changes (different chip selected), pending action should reset
  const contextKey =
    contextBarMode.type === 'editing'
      ? `editing-${contextBarMode.nodeId}`
      : contextBarMode.type === 'groupSelected'
        ? `group-${contextBarMode.groupId}`
        : contextBarMode.type;

  // Store action with its context key - action is only valid if key matches current context
  const [actionState, setActionState] = useState<{ key: string; action: PendingAction }>({
    key: contextKey,
    action: null,
  });

  // If context changed, action is automatically null (stale key)
  const pendingAction = actionState.key === contextKey ? actionState.action : null;

  // Wrapper to set action with current context key
  const setPendingAction = (action: PendingAction): void => {
    setActionState({ key: contextKey, action });
    // Clear chain preview when clearing action
    if (action === null) {
      setChainPreview(null);
    }
  };

  // Find field definition
  const findField = (fieldName: string): FieldOption | undefined => {
    for (const category of categories) {
      const field = category.fields.find((f) => f.name === fieldName);
      if (field) return field;
    }
    if (fieldName.startsWith('params.')) {
      return {
        name: fieldName,
        label: `Parameter: ${fieldName.replace('params.', '')}`,
        type: 'dynamic',
      };
    }
    return undefined;
  };

  // Empty mode: show "Add Condition" button
  if (contextBarMode.type === 'empty') {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-dashed border-border">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCondition}
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Condition
        </Button>
        <span className="text-xs text-muted-foreground">
          Click to add a condition, or select existing chips to group them
        </span>
      </div>
    );
  }

  // Editing mode: show inline editor for the selected condition
  if (contextBarMode.type === 'editing') {
    const node = findNodeById(tree, contextBarMode.nodeId);
    if (!node || !isConditionLeaf(node)) {
      return <></>;
    }

    const condition = node;
    const currentField = findField(condition.field);
    const fieldSuggestions = condition.field ? (suggestions.get(condition.field) ?? []) : [];

    const handleFieldChange = (field: string): void => {
      updateCondition(condition.id, {
        field,
        operator: 'equals',
        value: undefined,
        valueRef: undefined,
      });
    };

    const handleOperatorChange = (operator: ConditionOperator): void => {
      const needsArrayValue = ['in', 'notIn', 'containsAny', 'containsNone', 'between'].includes(
        operator,
      );
      const currentIsArray = Array.isArray(condition.value);

      let newValue = condition.value;
      let newValueRef = condition.valueRef;

      if (needsArrayValue && !currentIsArray) {
        newValue = operator === 'between' ? [undefined, undefined] : [];
        newValueRef = undefined;
      } else if (!needsArrayValue && currentIsArray) {
        const values = condition.value as unknown[];
        newValue = values.length > 0 ? values[0] : undefined;
        newValueRef = undefined;
      }

      updateCondition(condition.id, {
        operator,
        value: newValue,
        valueRef: newValueRef,
      });
    };

    const handleValueChange = (value: unknown, valueRef: string | undefined): void => {
      updateCondition(condition.id, {
        value: valueRef ? undefined : value,
        valueRef: valueRef || undefined,
      });
    };

    const handleChain = (logic: 'AND' | 'OR'): void => {
      setChainPreview(null);
      chainWithLogic(condition.id, logic);
      setPendingAction(null);
    };

    // Get the scope logic to determine if brackets should show
    const scopeLogic = getScopeOperator();

    const handleChainPreview = (logic: 'AND' | 'OR'): void => {
      setChainPreview({
        sourceNodeId: condition.id,
        previewLogic: logic,
        scopeLogic,
      });
    };

    const clearChainPreview = (): void => {
      setChainPreview(null);
    };

    const handleDelete = (): void => {
      removeCondition(condition.id);
    };

    // Showing AND/OR selection for chain
    if (pendingAction === 'chain') {
      return (
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-primary/30">
          <span className="text-sm text-muted-foreground">Chain with:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChain('AND')}
            onMouseEnter={() => handleChainPreview('AND')}
            onMouseLeave={clearChainPreview}
            disabled={disabled}
            className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
          >
            + AND
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChain('OR')}
            onMouseEnter={() => handleChainPreview('OR')}
            onMouseLeave={clearChainPreview}
            disabled={disabled}
            className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950"
          >
            + OR
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearChainPreview();
              setPendingAction(null);
            }}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-start gap-2 p-3 bg-muted/30 rounded-lg border border-primary/30">
        <FieldSelector
          value={condition.field}
          onChange={handleFieldChange}
          categories={categories}
          disabled={disabled}
        />

        <OperatorSelector
          value={condition.operator}
          onChange={handleOperatorChange}
          operators={operators}
          fieldType={currentField?.type}
          disabled={disabled || !condition.field}
        />

        {condition.field && condition.operator && (
          <ValueInput
            value={condition.value}
            valueRef={condition.valueRef}
            onChange={handleValueChange}
            operator={condition.operator}
            field={currentField}
            suggestions={fieldSuggestions}
            disabled={disabled}
          />
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPendingAction('chain')}
            disabled={disabled || !condition.field}
            className="gap-1"
          >
            <Link2 className="h-3.5 w-3.5" />
            Chain
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={disabled}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Group selected mode: single group is selected
  if (contextBarMode.type === 'groupSelected') {
    const groupNode = findNodeById(tree, contextBarMode.groupId);
    if (!groupNode || !isConditionGroup(groupNode)) {
      return <></>;
    }

    const handleChangeOperator = (logic: 'AND' | 'OR'): void => {
      changeGroupOperator(contextBarMode.groupId, logic);
      setPendingAction(null);
    };

    const handleChain = (logic: 'AND' | 'OR'): void => {
      setChainPreview(null);
      chainWithLogic(contextBarMode.groupId, logic);
      setPendingAction(null);
    };

    // Get the scope logic to determine if brackets should show
    const scopeLogic = getScopeOperator();

    const handleGroupChainPreview = (logic: 'AND' | 'OR'): void => {
      setChainPreview({
        sourceNodeId: contextBarMode.groupId,
        previewLogic: logic,
        scopeLogic,
      });
    };

    const clearGroupChainPreview = (): void => {
      setChainPreview(null);
    };

    // Check if this is a nested group (can be ungrouped)
    const isNestedGroup = contextBarMode.groupId !== tree.id;

    // Showing AND/OR selection for changing operator
    if (pendingAction === 'changeOperator') {
      return (
        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-primary/30">
          <span className="text-sm text-muted-foreground">Change to:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChangeOperator('AND')}
            disabled={disabled || groupNode.logic === 'AND'}
            className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
          >
            AND
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChangeOperator('OR')}
            disabled={disabled || groupNode.logic === 'OR'}
            className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950"
          >
            OR
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPendingAction(null)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      );
    }

    // Showing AND/OR selection for chain
    if (pendingAction === 'chain') {
      return (
        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-primary/30">
          <span className="text-sm text-muted-foreground">Chain with:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChain('AND')}
            onMouseEnter={() => handleGroupChainPreview('AND')}
            onMouseLeave={clearGroupChainPreview}
            disabled={disabled}
            className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
          >
            + AND
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChain('OR')}
            onMouseEnter={() => handleGroupChainPreview('OR')}
            onMouseLeave={clearGroupChainPreview}
            disabled={disabled}
            className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950"
          >
            + OR
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearGroupChainPreview();
              setPendingAction(null);
            }}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-primary/30">
        <span className="text-sm font-medium">
          {groupNode.logic} group ({groupNode.children.length} items)
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPendingAction('changeOperator')}
          disabled={disabled}
        >
          Change Connector
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPendingAction('chain')}
          disabled={disabled}
          className="gap-1"
        >
          <Link2 className="h-3.5 w-3.5" />
          Chain
        </Button>
        {isNestedGroup && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={ungroupSelected}
            disabled={disabled}
            className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950"
          >
            <Ungroup className="h-4 w-4 mr-1" />
            Ungroup
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={removeSelected}
          disabled={disabled}
          className="text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Grouping mode: multiple items selected
  if (contextBarMode.type === 'grouping') {
    const count = contextBarMode.nodeIds.length;
    const scopeOperator = getScopeOperator();

    // Get the scope group ID from selection
    const { scopeGroupId } = selection;

    const handleChangeConnector = (logic: 'AND' | 'OR'): void => {
      if (scopeGroupId) {
        changeGroupOperator(scopeGroupId, logic);
      }
      setPendingAction(null);
    };

    // Showing AND/OR selection for changing connector
    if (pendingAction === 'changeOperator') {
      return (
        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-primary/30">
          <span className="text-sm text-muted-foreground">Change connector to:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChangeConnector('AND')}
            disabled={disabled || scopeOperator === 'AND'}
            className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
          >
            AND
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChangeConnector('OR')}
            disabled={disabled || scopeOperator === 'OR'}
            className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950"
          >
            OR
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPendingAction(null)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-primary/30">
        <span className="text-sm text-muted-foreground">{count} selected:</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPendingAction('changeOperator')}
          disabled={disabled}
        >
          Change Connector
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => groupSelected()}
          disabled={disabled}
          className={
            scopeOperator === 'AND'
              ? 'text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950'
              : 'text-purple-600 border-purple-200 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:hover:bg-purple-950'
          }
        >
          Group (as {scopeOperator})
        </Button>
        {canUngroup && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={ungroupSelected}
            disabled={disabled}
            className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950"
          >
            <Ungroup className="h-4 w-4 mr-1" />
            Ungroup
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={removeSelected}
          disabled={disabled}
          className="text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return <></>;
}
