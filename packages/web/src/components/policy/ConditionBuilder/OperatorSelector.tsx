/**
 * OperatorSelector Component
 * Dropdown for selecting condition operators, filtered by field type
 */

import type { JSX } from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { ConditionOperator, OperatorGroups, OperatorOption } from './types';

interface OperatorSelectorProps {
  value: ConditionOperator;
  onChange: (value: ConditionOperator) => void;
  operators: OperatorGroups;
  fieldType?: string;
  disabled?: boolean;
}

// Helper to get display label for an operator
function getOperatorLabel(operators: OperatorGroups, opName: ConditionOperator): string {
  for (const group of Object.values(operators)) {
    const found = group.find((op: OperatorOption) => op.name === opName);
    if (found) {
      return found.label;
    }
  }
  return opName;
}

// Filter operators based on field type
function filterOperatorsForType(operators: OperatorGroups, fieldType?: string): OperatorGroups {
  if (!fieldType || fieldType === 'dynamic') {
    return operators; // Return all operators for dynamic fields
  }

  const filter = (group: OperatorGroups[keyof OperatorGroups]) =>
    group.filter((op) => op.types.includes(fieldType) || op.types.includes('any'));

  return {
    comparison: filter(operators.comparison),
    string: filter(operators.string),
    collection: filter(operators.collection),
    existence: filter(operators.existence),
    network: filter(operators.network),
  };
}

export function OperatorSelector({
  value,
  onChange,
  operators,
  fieldType,
  disabled = false,
}: OperatorSelectorProps): JSX.Element {
  const filteredOperators = filterOperatorsForType(operators, fieldType);

  // Check if any group has operators
  const hasOperators = Object.values(filteredOperators).some((group) => group.length > 0);

  if (!hasOperators) {
    return (
      <Select value={value} onValueChange={(v) => onChange(v as ConditionOperator)} disabled>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="No operators">No operators</SelectValue>
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => onChange(v as ConditionOperator)}
      disabled={disabled}
    >
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder="Select operator">
          {value ? getOperatorLabel(operators, value) : 'Select operator'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {filteredOperators.comparison.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Comparison
            </SelectLabel>
            {filteredOperators.comparison.map((op) => (
              <SelectItem key={op.name} value={op.name} className="pl-6">
                {op.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {filteredOperators.string.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              String
            </SelectLabel>
            {filteredOperators.string.map((op) => (
              <SelectItem key={op.name} value={op.name} className="pl-6">
                {op.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {filteredOperators.collection.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Collection
            </SelectLabel>
            {filteredOperators.collection.map((op) => (
              <SelectItem key={op.name} value={op.name} className="pl-6">
                {op.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {filteredOperators.existence.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Existence
            </SelectLabel>
            {filteredOperators.existence.map((op) => (
              <SelectItem key={op.name} value={op.name} className="pl-6">
                {op.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {filteredOperators.network.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Network
            </SelectLabel>
            {filteredOperators.network.map((op) => (
              <SelectItem key={op.name} value={op.name} className="pl-6">
                {op.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
