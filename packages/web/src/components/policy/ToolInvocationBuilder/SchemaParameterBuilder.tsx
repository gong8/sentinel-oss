/**
 * SchemaParameterBuilder Component
 * Schema-aware parameter editor that fetches and displays tool parameter schemas
 * Uses SchemaParameterTree for the hierarchical value input
 */

import { Loader2, Plus } from 'lucide-react';
import { type JSX, useCallback, useMemo, useState } from 'react';

import { trpc } from '../../../lib/trpc';
import { Button } from '../../ui/button';
import type { NestedFieldSchema } from '../ConditionBuilder';
import { ParameterBuilder } from './ParameterBuilder';
import { SchemaParameterTree } from './SchemaParameterTree';

interface SchemaParameterBuilderProps {
  toolName: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Converts a flat Map of path->value to a nested Record structure
 * e.g., Map{"a.b": 1, "a.c": 2} -> {a: {b: 1, c: 2}}
 */
function flatMapToNested(map: Map<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  map.forEach((value, path) => {
    if (value === undefined) return;

    // Remove params. prefix if present
    const cleanPath = path.startsWith('params.') ? path.slice(7) : path;
    const parts = cleanPath.split('.');

    let current: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  });

  return result;
}

/**
 * Converts a nested Record to a flat Map of path->value
 * e.g., {a: {b: 1, c: 2}} -> Map{"params.a.b": 1, "params.a.c": 2}
 */
function nestedToFlatMap(obj: Record<string, unknown>, prefix = 'params'): Map<string, unknown> {
  const map = new Map<string, unknown>();

  function traverse(current: unknown, path: string): void {
    if (current === null || current === undefined) return;

    if (Array.isArray(current)) {
      // Store arrays as-is at the current path
      map.set(path, current);
    } else if (typeof current === 'object') {
      const rec = current as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        traverse(rec[key], `${path}.${key}`);
      }
    } else {
      // Primitive value
      map.set(path, current);
    }
  }

  for (const key of Object.keys(obj)) {
    traverse(obj[key], `${prefix}.${key}`);
  }

  return map;
}

/**
 * Filter fields to only include params.* category
 */
function getParamFields(
  categories: Array<{ name: string; fields: NestedFieldSchema[] }>,
): NestedFieldSchema[] {
  const paramsCategory = categories.find((c) => c.name === 'parameters');
  return paramsCategory?.fields ?? [];
}

export function SchemaParameterBuilder({
  toolName,
  value,
  onChange,
  disabled = false,
}: SchemaParameterBuilderProps): JSX.Element {
  // Track if we're using schema mode or fallback mode
  const [useFallback, setUseFallback] = useState(false);

  // Compute valueMap directly from props - no need for separate state
  // This ensures the map is always in sync with the parent value
  const valueMap = useMemo(() => nestedToFlatMap(value), [value]);

  // Fetch nested categories (which includes schema)
  const schemaQuery = trpc.admin.conditions.getNestedCategories.useQuery(
    { toolPatterns: [toolName] },
    { enabled: toolName.length > 0 },
  );

  // Extract param fields from schema
  const paramFields = useMemo(() => {
    if (!schemaQuery.data?.categories) return [];
    return getParamFields(schemaQuery.data.categories);
  }, [schemaQuery.data]);

  // Determine if we have a schema to show
  const hasSchema = paramFields.length > 0;

  // Handle value change from tree
  const handleValueChange = useCallback(
    (path: string, newValue: unknown) => {
      const next = new Map(valueMap);
      if (newValue === undefined || newValue === '') {
        next.delete(path);
      } else {
        next.set(path, newValue);
      }

      // Convert to nested and call onChange
      const nested = flatMapToNested(next);
      onChange(nested);
    },
    [onChange, valueMap],
  );

  // Toggle between schema view and fallback
  const toggleMode = useCallback(() => {
    setUseFallback((prev) => !prev);
  }, []);

  // Loading state
  if (schemaQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading schema...
      </div>
    );
  }

  // No schema available - always use fallback
  if (!hasSchema) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground py-1">
          No parameter schema available for this tool. Add parameters manually.
        </p>
        <ParameterBuilder value={value} onChange={onChange} disabled={disabled} />
      </div>
    );
  }

  // User toggled to fallback mode
  if (useFallback) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Manual mode - add parameters as key-value pairs.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleMode}
            disabled={disabled}
            className="text-xs"
          >
            Switch to Schema View
          </Button>
        </div>
        <ParameterBuilder value={value} onChange={onChange} disabled={disabled} />
      </div>
    );
  }

  // Schema mode
  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">
          Set parameter values. Expand to see nested fields.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleMode}
          disabled={disabled}
          className="text-xs flex-shrink-0"
        >
          <Plus className="h-3 w-3 mr-1" />
          Manual
        </Button>
      </div>

      <div className="border rounded-lg p-2 bg-muted/20 max-h-[280px] overflow-y-auto overflow-x-hidden">
        <SchemaParameterTree
          fields={paramFields}
          values={valueMap}
          onValueChange={handleValueChange}
          toolName={toolName}
          disabled={disabled}
        />
      </div>

      {/* Show count of set values */}
      {valueMap.size > 0 && (
        <p className="text-xs text-muted-foreground">
          {valueMap.size} param{valueMap.size !== 1 ? 's' : ''} set
        </p>
      )}
    </div>
  );
}
