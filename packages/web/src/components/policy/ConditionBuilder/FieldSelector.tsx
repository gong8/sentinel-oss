/**
 * FieldSelector Component
 * Categorized dropdown for selecting condition fields
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
import type { CategoryOption, FieldOption } from './types';

interface FieldSelectorProps {
  value: string;
  onChange: (value: string) => void;
  categories: CategoryOption[];
  disabled?: boolean;
  placeholder?: string;
}

export function FieldSelector({
  value,
  onChange,
  categories,
  disabled = false,
  placeholder = 'Select field',
}: FieldSelectorProps): JSX.Element {
  // Find the label for the current value
  const findFieldLabel = (fieldName: string): string => {
    for (const category of categories) {
      const field = category.fields.find((f) => f.name === fieldName);
      if (field) {
        return field.label;
      }
    }
    // Handle dynamic params.* fields
    if (fieldName.startsWith('params.')) {
      const paramName = fieldName.replace('params.', '');
      return `Parameter: ${paramName}`;
    }
    return fieldName;
  };

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder={placeholder}>
          {value ? findFieldLabel(value) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectGroup key={category.name}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {category.label}
            </SelectLabel>
            {category.fields.map((field) => (
              <FieldSelectItem key={field.name} field={field} />
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

interface FieldSelectItemProps {
  field: FieldOption;
}

function FieldSelectItem({ field }: FieldSelectItemProps): JSX.Element {
  return (
    <SelectItem value={field.name} className="pl-6">
      <div className="flex flex-col">
        <span>{field.label}</span>
        {field.description && (
          <span className="text-xs text-muted-foreground">{field.description}</span>
        )}
      </div>
    </SelectItem>
  );
}
