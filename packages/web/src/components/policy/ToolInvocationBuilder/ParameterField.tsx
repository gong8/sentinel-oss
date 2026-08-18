/**
 * ParameterField Component
 * A single key-value parameter input with type detection
 */

import { Trash2 } from 'lucide-react';
import type { JSX } from 'react';

import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

type ValueType = 'string' | 'number' | 'boolean' | 'json';

interface ParameterFieldProps {
  name: string;
  value: unknown;
  onNameChange: (name: string) => void;
  onValueChange: (value: unknown) => void;
  onRemove: () => void;
  disabled?: boolean;
  nameError?: string;
}

function detectValueType(value: unknown): ValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}

function parseValue(text: string, type: ValueType): unknown {
  switch (type) {
    case 'number': {
      const num = Number(text);
      return isNaN(num) ? 0 : num;
    }
    case 'boolean':
      return text === 'true';
    case 'json':
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    default:
      return text;
  }
}

function valueToString(value: unknown, type: ValueType): string {
  if (type === 'json') {
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
  }
  return String(value ?? '');
}

export function ParameterField({
  name,
  value,
  onNameChange,
  onValueChange,
  onRemove,
  disabled = false,
  nameError,
}: ParameterFieldProps): JSX.Element {
  const valueType = detectValueType(value);

  const handleTypeChange = (newType: ValueType) => {
    // Convert value to new type
    switch (newType) {
      case 'string':
        onValueChange(String(value ?? ''));
        break;
      case 'number':
        onValueChange(Number(value) || 0);
        break;
      case 'boolean':
        onValueChange(Boolean(value));
        break;
      case 'json':
        onValueChange(value);
        break;
    }
  };

  const handleValueChange = (text: string) => {
    onValueChange(parseValue(text, valueType));
  };

  return (
    <div className="flex items-start gap-2">
      {/* Parameter name */}
      <div className="flex-1 space-y-1">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="parameter name"
          className={`font-mono text-sm ${nameError ? 'border-destructive' : ''}`}
          disabled={disabled}
        />
        {nameError && <span className="text-xs text-destructive">{nameError}</span>}
      </div>

      {/* Type selector */}
      <Select value={valueType} onValueChange={handleTypeChange} disabled={disabled}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="string">String</SelectItem>
          <SelectItem value="number">Number</SelectItem>
          <SelectItem value="boolean">Boolean</SelectItem>
          <SelectItem value="json">JSON</SelectItem>
        </SelectContent>
      </Select>

      {/* Value input */}
      <div className="flex-1">
        {valueType === 'boolean' ? (
          <Select
            value={String(value)}
            onValueChange={(v) => onValueChange(v === 'true')}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        ) : valueType === 'json' ? (
          <textarea
            value={valueToString(value, valueType)}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="{}"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
          />
        ) : (
          <Input
            value={valueToString(value, valueType)}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={valueType === 'number' ? '0' : 'value'}
            type={valueType === 'number' ? 'number' : 'text'}
            className="font-mono text-sm"
            disabled={disabled}
          />
        )}
      </div>

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="text-muted-foreground hover:text-destructive"
        aria-label="Remove parameter"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
