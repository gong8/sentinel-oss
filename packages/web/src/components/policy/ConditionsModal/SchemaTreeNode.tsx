/**
 * SchemaTreeNode Component
 * Individual tree node for displaying nested field schemas
 * Recursive component that handles objects and arrays
 */

import { ChevronDown, ChevronRight } from 'lucide-react';

import { cn } from '../../../lib/utils';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import type { NestedFieldSchema } from '../ConditionBuilder';
import { getFieldTypeLabel, isLeafFieldType } from '../ConditionBuilder';
import {
  getFieldTypeBadgeVariant,
  getHorizontalLineStyle,
  getTreeIndentation,
  getVerticalLineStyle,
} from '../tree-utils';

interface SchemaTreeNodeProps {
  field: NestedFieldSchema;
  depth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelect: (field: NestedFieldSchema) => void;
  selectedField: NestedFieldSchema | null;
}

export function SchemaTreeNode({
  field,
  depth,
  expandedPaths,
  onToggleExpand,
  onSelect,
  selectedField,
}: SchemaTreeNodeProps) {
  const isExpanded = expandedPaths.has(field.name);
  // Dynamic fields end with .* and should be selectable
  const isDynamicField = field.name.endsWith('.*');
  // Leaf fields or dynamic fields are selectable
  const isLeaf = isLeafFieldType(field.type) || isDynamicField;
  const isExpandable =
    !isDynamicField && // Dynamic fields are not expandable, they're selectable
    ((field.type === 'object' && field.children && field.children.length > 0) ||
      (field.type === 'array' && field.items));
  const isSelected = selectedField?.name === field.name;

  const paddingLeft = getTreeIndentation(depth);

  const handleClick = () => {
    if (isExpandable) {
      onToggleExpand(field.name);
    }
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLeaf) {
      onSelect(field);
    }
  };

  return (
    <div>
      {/* Node row */}
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors',
          isExpandable && 'cursor-pointer hover:bg-muted/50',
          isSelected && 'bg-primary/10 border border-primary/30',
        )}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {/* Expand/collapse icon */}
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {isExpandable ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
          )}
        </span>

        {/* Field label */}
        <span className="text-sm flex-1 truncate" title={field.name}>
          {isDynamicField ? (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground italic">properties</span>
              <span className="text-primary font-medium">.*</span>
            </span>
          ) : (
            field.label
          )}
        </span>

        {/* Dynamic field badge */}
        {isDynamicField && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 border-primary/50 text-primary"
          >
            dynamic
          </Badge>
        )}

        {/* Type badge */}
        <Badge
          variant={getFieldTypeBadgeVariant(field.type)}
          className="text-[10px] px-1.5 py-0 h-5"
        >
          {getFieldTypeLabel(field.type)}
        </Badge>

        {/* Select button for leaf fields */}
        {isLeaf && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleSelect}
          >
            Select
          </Button>
        )}
      </div>

      {/* Description tooltip - show on hover or when selected */}
      {field.description && isSelected && (
        <div
          className="text-xs text-muted-foreground pl-8 mt-0.5 mb-1"
          style={{ paddingLeft: paddingLeft + 20 }}
        >
          {field.description}
        </div>
      )}

      {/* Children for objects */}
      {isExpanded && field.type === 'object' && field.children && (
        <div className="relative">
          {/* Vertical connecting line */}
          <div
            className="absolute left-0 top-0 bottom-0 border-l border-border"
            style={getVerticalLineStyle(paddingLeft)}
          />
          {field.children.map((child) => (
            <div key={child.name} className="relative">
              {/* Horizontal connecting line */}
              <div
                className="absolute border-t border-border"
                style={getHorizontalLineStyle(paddingLeft)}
              />
              <SchemaTreeNode
                field={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                selectedField={selectedField}
              />
            </div>
          ))}
        </div>
      )}

      {/* Array items */}
      {isExpanded && field.type === 'array' && field.items && (
        <div className="relative">
          {/* Vertical connecting line */}
          <div
            className="absolute left-0 top-0 bottom-0 border-l border-border"
            style={getVerticalLineStyle(paddingLeft)}
          />
          <div className="relative">
            {/* Horizontal connecting line */}
            <div
              className="absolute border-t border-border"
              style={getHorizontalLineStyle(paddingLeft)}
            />
            <SchemaTreeNode
              field={field.items}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              selectedField={selectedField}
            />
          </div>
        </div>
      )}
    </div>
  );
}
