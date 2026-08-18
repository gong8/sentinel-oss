/**
 * ValueInput Component
 * Polymorphic value input that adapts based on field type and operator
 */

import { type JSX, useCallback, useMemo, useState } from 'react';

import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { GlobalVariableSelector } from './GlobalVariableSelector';
import { getCompatibleVariableTypes } from './typeMapping';
import type { ConditionOperator, FieldOption, ParamSuggestion, ValueMode } from './types';

interface ValueInputProps {
  value: unknown;
  valueRef: string | undefined;
  onChange: (value: unknown, valueRef: string | undefined) => void;
  operator: ConditionOperator;
  field?: FieldOption;
  suggestions?: ParamSuggestion[];
  disabled?: boolean;
}

// Operators that require array values
const ARRAY_OPERATORS: ConditionOperator[] = [
  'in',
  'notIn',
  'containsAny',
  'containsNone',
  'between',
];

// Operators that don't need a value
const NO_VALUE_OPERATORS: ConditionOperator[] = ['exists', 'notExists'];

export function ValueInput({
  value,
  valueRef,
  onChange,
  operator,
  field,
  suggestions = [],
  disabled = false,
}: ValueInputProps): JSX.Element {
  // Determine initial mode from whether valueRef is set
  const [mode, setMode] = useState<ValueMode>(valueRef ? 'variable' : 'static');

  // Get compatible variable types for the current field/operator
  const compatibleTypes = useMemo(
    () => getCompatibleVariableTypes(field?.type, operator),
    [field?.type, operator],
  );

  // Handle mode change
  const handleModeChange = (newMode: ValueMode): void => {
    setMode(newMode);
    if (newMode === 'static') {
      // Switching to static: clear valueRef
      onChange(undefined, undefined);
    } else {
      // Switching to variable: clear value
      onChange(undefined, undefined);
    }
  };

  // Handle static value change
  const handleStaticChange = (newValue: unknown): void => {
    onChange(newValue, undefined);
  };

  // Handle variable selection change
  const handleVariableChange = (newValueRef: string): void => {
    onChange(undefined, newValueRef || undefined);
  };

  // Don't show input for existence operators
  if (NO_VALUE_OPERATORS.includes(operator)) {
    return <span className="text-sm text-muted-foreground italic">No value needed</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Mode toggle */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant={mode === 'static' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => handleModeChange('static')}
          disabled={disabled}
        >
          Static
        </Button>
        <Button
          type="button"
          variant={mode === 'variable' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => handleModeChange('variable')}
          disabled={disabled}
        >
          Variable
        </Button>
      </div>

      {/* Value input based on mode */}
      {mode === 'variable' ? (
        <GlobalVariableSelector
          value={valueRef}
          onChange={handleVariableChange}
          compatibleTypes={compatibleTypes}
          disabled={disabled}
        />
      ) : (
        <StaticValueInput
          value={value}
          onChange={handleStaticChange}
          operator={operator}
          field={field}
          suggestions={suggestions}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/**
 * StaticValueInput - the original value input logic extracted as a separate component
 */
interface StaticValueInputProps {
  value: unknown;
  onChange: (value: unknown) => void;
  operator: ConditionOperator;
  field?: FieldOption;
  suggestions?: ParamSuggestion[];
  disabled?: boolean;
}

function StaticValueInput({
  value,
  onChange,
  operator,
  field,
  suggestions = [],
  disabled = false,
}: StaticValueInputProps): JSX.Element {
  // Handle array operators
  if (ARRAY_OPERATORS.includes(operator)) {
    return (
      <ArrayValueInput
        value={value}
        onChange={onChange}
        operator={operator}
        field={field}
        disabled={disabled}
      />
    );
  }

  // Handle boolean fields
  if (field?.type === 'boolean') {
    return <BooleanInput value={value} onChange={onChange} disabled={disabled} />;
  }

  // Handle enum fields
  if (field?.enum && field.enum.length > 0) {
    return <EnumInput value={value} onChange={onChange} options={field.enum} disabled={disabled} />;
  }

  // Handle CIDR operators
  if (operator === 'inCidr' || operator === 'notInCidr') {
    return <CidrInput value={value} onChange={onChange} disabled={disabled} />;
  }

  // Handle time fields
  if (field?.name === 'time.hourOfDay') {
    return <HourInput value={value} onChange={onChange} disabled={disabled} />;
  }

  if (field?.name === 'time.dayOfWeek') {
    return <DayOfWeekInput value={value} onChange={onChange} disabled={disabled} />;
  }

  // Default: text/number input with optional suggestions
  return (
    <TextInput
      value={value}
      onChange={onChange}
      type={field?.type === 'number' ? 'number' : 'text'}
      suggestions={suggestions}
      disabled={disabled}
    />
  );
}

// Boolean toggle input
interface BooleanInputProps {
  value: unknown;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function BooleanInput({ value, onChange, disabled }: BooleanInputProps): JSX.Element {
  const checked = value === true || value === 'true';
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span className="text-sm text-muted-foreground">{checked ? 'True' : 'False'}</span>
    </div>
  );
}

// Enum dropdown input
interface EnumInputProps {
  value: unknown;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}

function EnumInput({ value, onChange, options, disabled }: EnumInputProps): JSX.Element {
  return (
    <Select
      value={typeof value === 'string' ? value : undefined}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select value" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// CIDR input with validation
interface CidrInputProps {
  value: unknown;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function CidrInput({ value, onChange, disabled }: CidrInputProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange(val);

      // Validate CIDR format
      if (val && !isCidrValid(val)) {
        setError('Invalid CIDR format (e.g., 192.168.1.0/24)');
      } else {
        setError(null);
      }
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-1">
      <Input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={handleChange}
        placeholder="192.168.1.0/24"
        className={`w-[180px] ${error ? 'border-destructive' : ''}`}
        disabled={disabled}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

// Hour of day selector (0-23)
interface HourInputProps {
  value: unknown;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function HourInput({ value, onChange, disabled }: HourInputProps): JSX.Element {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Select
      value={typeof value === 'number' ? String(value) : undefined}
      onValueChange={(v) => onChange(parseInt(v, 10))}
      disabled={disabled}
    >
      <SelectTrigger className="w-[120px]">
        <SelectValue placeholder="Hour" />
      </SelectTrigger>
      <SelectContent>
        {hours.map((hour) => (
          <SelectItem key={hour} value={String(hour)}>
            {String(hour).padStart(2, '0')}:00
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Day of week selector (0-6)
interface DayOfWeekInputProps {
  value: unknown;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function DayOfWeekInput({ value, onChange, disabled }: DayOfWeekInputProps): JSX.Element {
  return (
    <Select
      value={typeof value === 'number' ? String(value) : undefined}
      onValueChange={(v) => onChange(parseInt(v, 10))}
      disabled={disabled}
    >
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Day" />
      </SelectTrigger>
      <SelectContent>
        {DAYS_OF_WEEK.map((day) => (
          <SelectItem key={day.value} value={String(day.value)}>
            {day.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Text/Number input with optional suggestions
interface TextInputProps {
  value: unknown;
  onChange: (value: string | number) => void;
  type: 'text' | 'number';
  suggestions?: ParamSuggestion[];
  disabled?: boolean;
}

function TextInput({
  value,
  onChange,
  type,
  suggestions = [],
  disabled,
}: TextInputProps): JSX.Element {
  // Track whether user is entering a custom value (not from suggestions)
  const [useCustomValue, setUseCustomValue] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = type === 'number' ? parseFloat(e.target.value) : e.target.value;
      onChange(isNaN(val as number) ? e.target.value : val);
    },
    [onChange, type],
  );

  const stringValue = value !== undefined && value !== null ? String(value) : '';

  // Show Select dropdown when suggestions exist (non-number type, not in custom mode)
  if (suggestions.length > 0 && type !== 'number' && !useCustomValue) {
    return (
      <div className="space-y-2">
        <Select
          value={stringValue || '__placeholder__'}
          onValueChange={(v) => {
            if (v === '__custom__') {
              setUseCustomValue(true);
              onChange('');
            } else if (v !== '__placeholder__') {
              onChange(v);
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select a value" />
          </SelectTrigger>
          <SelectContent>
            {suggestions.map((suggestion) => (
              <SelectItem key={suggestion.value} value={suggestion.value}>
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex flex-col items-start min-w-0">
                    {suggestion.label ? (
                      <>
                        <span className="truncate">{suggestion.label}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {suggestion.value}
                        </span>
                      </>
                    ) : (
                      <span className="truncate">{suggestion.value}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({suggestion.count})
                  </span>
                </div>
              </SelectItem>
            ))}
            <SelectItem value="__custom__" className="border-t mt-1 pt-1">
              <span className="text-muted-foreground">Custom value...</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Show Input for custom value or when no suggestions exist
  return (
    <div className="space-y-1">
      <Input
        type={type}
        value={stringValue}
        onChange={handleChange}
        placeholder="Enter value"
        className="w-[180px]"
        disabled={disabled}
      />
      {useCustomValue && suggestions.length > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline"
          onClick={() => {
            setUseCustomValue(false);
            onChange('');
          }}
        >
          Back to suggestions
        </button>
      )}
    </div>
  );
}

// Array value input for in/notIn/containsAny/containsNone/between operators
interface ArrayValueInputProps {
  value: unknown;
  onChange: (value: unknown[]) => void;
  operator: ConditionOperator;
  field?: FieldOption;
  disabled?: boolean;
}

function ArrayValueInput({
  value,
  onChange,
  operator,
  field,
  disabled,
}: ArrayValueInputProps): JSX.Element {
  // Memoize the values array to avoid dependency issues in callbacks
  const values = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const isBetween = operator === 'between';
  const maxItems = isBetween ? 2 : undefined;

  const handleAdd = useCallback(() => {
    if (maxItems && values.length >= maxItems) return;
    onChange([...values, '']);
  }, [values, onChange, maxItems]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(values.filter((_, i) => i !== index));
    },
    [values, onChange],
  );

  const handleChange = useCallback(
    (index: number, newValue: string | number) => {
      const updated = [...values];
      updated[index] = newValue;
      onChange(updated);
    },
    [values, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      {values.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {isBetween && (
            <span className="text-xs text-muted-foreground w-8">
              {index === 0 ? 'Min:' : 'Max:'}
            </span>
          )}
          <Input
            type={field?.type === 'number' ? 'number' : 'text'}
            value={item !== undefined && item !== null ? String(item) : ''}
            onChange={(e) => {
              const val = field?.type === 'number' ? parseFloat(e.target.value) : e.target.value;
              handleChange(index, isNaN(val as number) ? e.target.value : val);
            }}
            placeholder={isBetween ? (index === 0 ? 'Minimum' : 'Maximum') : 'Value'}
            className="w-[140px]"
            disabled={disabled}
          />
          {!isBetween && values.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(index)}
              disabled={disabled}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      {(!maxItems || values.length < maxItems) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={handleAdd}
          disabled={disabled}
        >
          Add value
        </Button>
      )}
    </div>
  );
}

// CIDR validation helper
function isCidrValid(cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;

  const [ip, prefix] = parts;
  if (!ip || !prefix) return false;

  // Validate prefix
  const prefixNum = parseInt(prefix, 10);
  if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) return false;

  // Validate IP
  const ipParts = ip.split('.');
  if (ipParts.length !== 4) return false;

  for (const part of ipParts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
  }

  return true;
}
