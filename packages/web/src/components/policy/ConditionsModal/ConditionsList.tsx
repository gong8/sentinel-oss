/**
 * ConditionsList Component
 * Displays active conditions with remove buttons
 */

import { formatConditionValue } from '../../../lib/format';
import { RemovableListItem } from '../../ui/removable-list-item';
import type { PolicyCondition } from '../ConditionBuilder';

interface ConditionsListProps {
  conditions: PolicyCondition[];
  onRemove: (index: number) => void;
}

const operatorLabels: Record<string, string> = {
  equals: 'equals',
  notEquals: 'not equals',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  matches: 'matches regex',
  lessThan: 'less than',
  lessThanOrEquals: 'less than or equals',
  greaterThan: 'greater than',
  greaterThanOrEquals: 'greater than or equals',
  between: 'between',
  in: 'in',
  notIn: 'not in',
  containsAny: 'contains any of',
  containsAll: 'contains all of',
  containsNone: 'contains none of',
  exists: 'exists',
  notExists: 'does not exist',
  inCidr: 'in CIDR range',
  notInCidr: 'not in CIDR range',
};

function formatOperator(operator: string): string {
  return operatorLabels[operator] ?? operator;
}

export function ConditionsList({ conditions, onRemove }: ConditionsListProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Active Conditions ({conditions.length})</p>
      <div className="space-y-2">
        {conditions.map((condition, index) => (
          <RemovableListItem
            key={index}
            onRemove={() => onRemove(index)}
            removeLabel="Remove condition"
            className="p-3 rounded-lg bg-background"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                {condition.field}
              </code>
              <span className="text-sm text-muted-foreground">
                {formatOperator(condition.operator)}
              </span>
              {condition.valueRef ? (
                <span className="text-sm font-medium text-primary">
                  <span className="text-muted-foreground text-xs mr-1">var:</span>
                  {condition.valueRef}
                </span>
              ) : condition.value !== undefined ? (
                <span className="text-sm font-medium">{formatConditionValue(condition.value)}</span>
              ) : null}
            </div>
          </RemovableListItem>
        ))}
      </div>
    </div>
  );
}
