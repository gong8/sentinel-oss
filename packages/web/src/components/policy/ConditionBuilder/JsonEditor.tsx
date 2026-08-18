/**
 * JsonEditor Component
 * Raw JSON editor for policy conditions with validation
 */

import { type JSX, useCallback, useState } from 'react';

import { Textarea } from '../../ui/textarea';
import type { PolicyConditions } from './types';

interface JsonEditorProps {
  value: PolicyConditions | null;
  onChange: (value: PolicyConditions | null) => void;
  onValidationChange?: (isValid: boolean) => void;
  disabled?: boolean;
}

export function JsonEditor({
  value,
  onChange,
  onValidationChange,
  disabled = false,
}: JsonEditorProps): JSX.Element {
  // Initialize text state from value prop
  const [text, setText] = useState(() => (value ? JSON.stringify(value, null, 2) : ''));
  const [parseError, setParseError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Compute the display text - show local text when focused, otherwise show synced value
  const displayText = isFocused ? text : value ? JSON.stringify(value, null, 2) : '';

  // Handle text changes
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      setText(newText);

      // Handle empty input
      if (!newText.trim()) {
        setParseError(null);
        onValidationChange?.(true);
        onChange(null);
        return;
      }

      // Try to parse JSON
      try {
        const parsed = JSON.parse(newText);
        setParseError(null);

        // Validate structure
        const validationError = validateConditions(parsed);
        if (validationError) {
          setParseError(validationError);
          onValidationChange?.(false);
        } else {
          onValidationChange?.(true);
          onChange(parsed);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Invalid JSON';
        setParseError(`JSON parse error: ${error}`);
        onValidationChange?.(false);
      }
    },
    [onChange, onValidationChange],
  );

  // Handle focus
  const handleFocus = useCallback(() => {
    // Sync text state with current value when focusing
    setText(value ? JSON.stringify(value, null, 2) : '');
    setIsFocused(true);
  }, [value]);

  // Handle blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <div className="space-y-2">
      <Textarea
        value={displayText}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={`[
  {
    "field": "time.hourOfDay",
    "operator": "between",
    "value": [9, 17]
  }
]`}
        className={`font-mono text-sm min-h-[200px] ${
          parseError ? 'border-destructive focus-visible:ring-destructive' : ''
        }`}
        disabled={disabled}
      />

      {/* Validation status */}
      <div className="flex items-center gap-2">
        {parseError ? (
          <span className="text-xs text-destructive">{parseError}</span>
        ) : displayText.trim() ? (
          <span className="text-xs text-green-500">Valid JSON</span>
        ) : (
          <span className="text-xs text-muted-foreground">Enter JSON to define conditions</span>
        )}
      </div>

      {/* Help text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Structure:</strong> {`[{ "field": "...", "operator": "...", "value": ... }]`}
        </p>
        <p>
          <strong>Fields:</strong> time.hourOfDay, time.dayOfWeek, network.sourceIp, params.*,
          extracted.sql.*, extracted.github.*, extracted.file.*
        </p>
        <p>
          <strong>Operators:</strong> equals, notEquals, contains, startsWith, endsWith, matches,
          lessThan, greaterThan, between, in, notIn, containsAny, containsNone, exists, notExists,
          inCidr, notInCidr
        </p>
      </div>
    </div>
  );
}

/**
 * Validate conditions array structure
 */
function validateConditions(data: unknown): string | null {
  if (!Array.isArray(data)) {
    return 'Must be an array of conditions';
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return `[${i}]: Must be an object`;
    }

    const condition = item as Record<string, unknown>;

    if (typeof condition.field !== 'string' || !condition.field) {
      return `[${i}].field: Must be a non-empty string`;
    }

    if (!condition.field.includes('.')) {
      return `[${i}].field: Must use dot notation (e.g., "params.query")`;
    }

    const validOperators = [
      'equals',
      'notEquals',
      'contains',
      'notContains',
      'startsWith',
      'endsWith',
      'matches',
      'lessThan',
      'greaterThan',
      'between',
      'in',
      'notIn',
      'containsAny',
      'containsNone',
      'exists',
      'notExists',
      'inCidr',
      'notInCidr',
    ];

    if (typeof condition.operator !== 'string' || !validOperators.includes(condition.operator)) {
      return `[${i}].operator: Must be one of: ${validOperators.join(', ')}`;
    }

    // Validate value based on operator
    const operator = condition.operator;

    if (['exists', 'notExists'].includes(operator)) {
      // No value needed
      continue;
    }

    if (['between', 'in', 'notIn', 'containsAny', 'containsNone'].includes(operator)) {
      if (!Array.isArray(condition.value)) {
        return `[${i}].value: Must be an array for "${operator}" operator`;
      }

      if (operator === 'between' && condition.value.length !== 2) {
        return `[${i}].value: Must have exactly 2 elements for "between" operator`;
      }
    }

    if (['inCidr', 'notInCidr'].includes(operator)) {
      if (typeof condition.value !== 'string' || !condition.value.includes('/')) {
        return `[${i}].value: Must be a CIDR notation string (e.g., "192.168.1.0/24")`;
      }
    }
  }

  return null;
}
