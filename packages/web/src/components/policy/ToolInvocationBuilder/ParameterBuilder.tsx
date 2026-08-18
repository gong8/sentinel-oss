/**
 * ParameterBuilder Component
 * Manages a Record<string, unknown> of parameters with add/remove functionality
 */

import { Plus } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

import { Button } from '../../ui/button';
import { ParameterField } from './ParameterField';

interface ParameterBuilderProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
}

interface ParameterEntry {
  id: string;
  name: string;
  value: unknown;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function objectToEntries(obj: Record<string, unknown>): ParameterEntry[] {
  return Object.entries(obj).map(([name, value]) => ({
    id: generateId(),
    name,
    value,
  }));
}

function entriesToObject(entries: ParameterEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry.name.trim()) {
      result[entry.name.trim()] = entry.value;
    }
  }
  return result;
}

export function ParameterBuilder({
  value,
  onChange,
  disabled = false,
}: ParameterBuilderProps): JSX.Element {
  // Convert object to array of entries for easier manipulation
  const [entries, setEntries] = useState<ParameterEntry[]>(() => objectToEntries(value));

  // Track duplicate names
  const getDuplicateNames = useCallback((entries: ParameterEntry[]): Set<string> => {
    const seen = new Map<string, number>();
    for (const entry of entries) {
      const name = entry.name.trim();
      if (name) {
        seen.set(name, (seen.get(name) ?? 0) + 1);
      }
    }
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }, []);

  const duplicateNames = getDuplicateNames(entries);

  const updateAndSync = useCallback(
    (newEntries: ParameterEntry[]) => {
      setEntries(newEntries);
      onChange(entriesToObject(newEntries));
    },
    [onChange],
  );

  const addParameter = useCallback(() => {
    const newEntry: ParameterEntry = {
      id: generateId(),
      name: '',
      value: '',
    };
    updateAndSync([...entries, newEntry]);
  }, [entries, updateAndSync]);

  const removeParameter = useCallback(
    (id: string) => {
      updateAndSync(entries.filter((e) => e.id !== id));
    },
    [entries, updateAndSync],
  );

  const updateParameterName = useCallback(
    (id: string, name: string) => {
      updateAndSync(entries.map((e) => (e.id === id ? { ...e, name } : e)));
    },
    [entries, updateAndSync],
  );

  const updateParameterValue = useCallback(
    (id: string, value: unknown) => {
      updateAndSync(entries.map((e) => (e.id === id ? { ...e, value } : e)));
    },
    [entries, updateAndSync],
  );

  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No parameters defined. Add parameters to test condition fields that reference{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">params.*</code>
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <ParameterField
              key={entry.id}
              name={entry.name}
              value={entry.value}
              onNameChange={(name) => updateParameterName(entry.id, name)}
              onValueChange={(value) => updateParameterValue(entry.id, value)}
              onRemove={() => removeParameter(entry.id)}
              disabled={disabled}
              nameError={
                duplicateNames.has(entry.name.trim()) ? 'Duplicate parameter name' : undefined
              }
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addParameter}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Parameter
      </Button>
    </div>
  );
}
