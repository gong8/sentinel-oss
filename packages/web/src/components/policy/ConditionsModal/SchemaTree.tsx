/**
 * SchemaTree Component
 * Container for the collapsible tree view of nested field schemas
 */

import { useCallback, useState } from 'react';

import type { NestedFieldSchema } from '../ConditionBuilder';
import { SchemaTreeNode } from './SchemaTreeNode';

interface SchemaTreeProps {
  fields: NestedFieldSchema[];
  onSelect: (field: NestedFieldSchema) => void;
  selectedField: NestedFieldSchema | null;
  /** Optional set of paths to expand initially (e.g., when editing) */
  initialExpandedPaths?: Set<string>;
}

export function SchemaTree({
  fields,
  onSelect,
  selectedField,
  initialExpandedPaths,
}: SchemaTreeProps) {
  // Track which nodes are expanded by their full path
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    initialExpandedPaths ?? new Set(),
  );

  // Track previous initialExpandedPaths to detect changes
  const [prevInitialPaths, setPrevInitialPaths] = useState(initialExpandedPaths);

  // React pattern for derived state: sync expandedPaths when initialExpandedPaths changes
  if (initialExpandedPaths !== prevInitialPaths) {
    setPrevInitialPaths(initialExpandedPaths);
    if (initialExpandedPaths) {
      setExpandedPaths(initialExpandedPaths);
    }
  }

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        No fields available in this category.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {fields.map((field) => (
        <SchemaTreeNode
          key={field.name}
          field={field}
          depth={0}
          expandedPaths={expandedPaths}
          onToggleExpand={toggleExpand}
          onSelect={onSelect}
          selectedField={selectedField}
        />
      ))}
    </div>
  );
}
