/**
 * ConditionRow Component
 * Individual row in the condition builder: field + operator + value
 */

import type { JSX } from 'react';

import { Button } from '../../ui/button';
import { FieldSelector } from './FieldSelector';
import { OperatorSelector } from './OperatorSelector';
import type {
  CategoryOption,
  ConditionOperator,
  FieldOption,
  OperatorGroups,
  ParamSuggestion,
  PolicyCondition,
} from './types';
import { ValueInput } from './ValueInput';

interface ConditionRowProps {
  condition: PolicyCondition;
  onChange: (condition: PolicyCondition) => void;
  onRemove: () => void;
  categories: CategoryOption[];
  operators: OperatorGroups;
  suggestions?: ParamSuggestion[];
  canRemove?: boolean;
  disabled?: boolean;
}

export function ConditionRow({
  condition,
  onChange,
  onRemove,
  categories,
  operators,
  suggestions = [],
  canRemove = true,
  disabled = false,
}: ConditionRowProps): JSX.Element {
  // Find the field definition for the current field
  const findField = (fieldName: string): FieldOption | undefined => {
    for (const category of categories) {
      const field = category.fields.find((f) => f.name === fieldName);
      if (field) return field;
    }
    // Handle dynamic params.* fields
    if (fieldName.startsWith('params.')) {
      return {
        name: fieldName,
        label: `Parameter: ${fieldName.replace('params.', '')}`,
        type: 'dynamic',
      };
    }
    return undefined;
  };

  const currentField = findField(condition.field);

  const handleFieldChange = (field: string): void => {
    // Reset operator, value, and valueRef when field changes
    onChange({
      ...condition,
      field,
      operator: 'equals',
      value: undefined,
      valueRef: undefined,
    });
  };

  const handleOperatorChange = (operator: ConditionOperator): void => {
    // Reset value and valueRef when operator changes (especially for array operators)
    const needsArrayValue = ['in', 'notIn', 'containsAny', 'containsNone', 'between'].includes(
      operator,
    );
    const currentIsArray = Array.isArray(condition.value);

    // If switching between array/non-array operators, reset value
    let newValue = condition.value;
    let newValueRef = condition.valueRef;

    if (needsArrayValue && !currentIsArray) {
      // Initialize with empty array for array operators
      newValue = operator === 'between' ? [undefined, undefined] : [];
      newValueRef = undefined;
    } else if (!needsArrayValue && currentIsArray) {
      // Convert first array item to single value
      const values = condition.value as unknown[];
      newValue = values.length > 0 ? values[0] : undefined;
      newValueRef = undefined;
    }

    onChange({
      ...condition,
      operator,
      value: newValue,
      valueRef: newValueRef,
    });
  };

  const handleValueChange = (value: unknown, valueRef: string | undefined): void => {
    onChange({
      ...condition,
      value: valueRef ? undefined : value,
      valueRef: valueRef || undefined,
    });
  };

  return (
    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg border border-border/50">
      <div className="flex-1 flex flex-wrap items-start gap-2">
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
            suggestions={suggestions}
            disabled={disabled}
          />
        )}
      </div>

      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove condition"
        >
          Remove
        </Button>
      )}
    </div>
  );
}
