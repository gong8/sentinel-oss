/**
 * SchemaParameterTree Component
 * Tree node for displaying nested field schemas with value inputs
 * Adapted from SchemaTreeNode but for setting parameter values instead of selecting fields
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useState } from 'react';

import { trpc } from '../../../lib/trpc';
import { cn } from '../../../lib/utils';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import type { NestedFieldSchema } from '../ConditionBuilder';
import { getFieldTypeLabel, isLeafFieldType } from '../ConditionBuilder';
import {
  getFieldTypeBadgeVariant,
  getHorizontalLineStyle,
  getTreeIndentation,
  getVerticalLineStyle,
} from '../tree-utils';

interface SchemaParameterTreeNodeProps {
  field: NestedFieldSchema;
  depth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  values: Map<string, unknown>;
  onValueChange: (path: string, value: unknown) => void;
  toolName: string;
  disabled?: boolean;
}

export function SchemaParameterTreeNode({
  field,
  depth,
  expandedPaths,
  onToggleExpand,
  values,
  onValueChange,
  toolName,
  disabled = false,
}: SchemaParameterTreeNodeProps) {
  const isExpanded = expandedPaths.has(field.name);
  // Dynamic fields end with .* - we show an input for the key
  const isDynamicField = field.name.endsWith('.*');
  // Leaf fields are value-editable (string, number, boolean, unknown)
  const isLeaf = isLeafFieldType(field.type) || isDynamicField;
  const isExpandable =
    !isDynamicField &&
    ((field.type === 'object' && field.children && field.children.length > 0) ||
      (field.type === 'array' && field.items));

  // Get current value for this field
  const currentValue = values.get(field.name);
  const hasValue = currentValue !== undefined && currentValue !== '';

  const paddingLeft = getTreeIndentation(depth);

  const handleClick = () => {
    if (isExpandable) {
      onToggleExpand(field.name);
    }
  };

  return (
    <div>
      {/* Node row */}
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors min-w-0',
          isExpandable && 'cursor-pointer hover:bg-muted/50',
          hasValue && 'bg-primary/5 border border-primary/20',
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
        <span className="text-sm flex-shrink min-w-0 max-w-[120px] truncate" title={field.name}>
          {isDynamicField ? (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground italic">props</span>
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
            className="text-[10px] px-1 py-0 h-4 border-primary/50 text-primary flex-shrink-0"
          >
            dyn
          </Badge>
        )}

        {/* Type badge */}
        <Badge
          variant={getFieldTypeBadgeVariant(field.type)}
          className="text-[10px] px-1 py-0 h-4 flex-shrink-0"
        >
          {getFieldTypeLabel(field.type)}
        </Badge>

        {/* Value input for leaf fields */}
        {isLeaf && !isDynamicField && (
          <div
            className="ml-auto min-w-0 flex-1 max-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <ValueInputInline
              field={field}
              value={currentValue}
              onChange={(val) => onValueChange(field.name, val)}
              toolName={toolName}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {/* Description when value is set */}
      {field.description && hasValue && (
        <div
          className="text-xs text-muted-foreground pl-8 mt-0.5 mb-1"
          style={{ paddingLeft: paddingLeft + 20 }}
        >
          {field.description}
        </div>
      )}

      {/* Dynamic key editor */}
      {isDynamicField && (
        <div style={{ paddingLeft: paddingLeft + 20 }} className="py-2">
          <DynamicKeyValueEditor
            basePath={field.name.slice(0, -2)} // Remove the .*
            values={values}
            onValueChange={onValueChange}
            toolName={toolName}
            disabled={disabled}
          />
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
              <SchemaParameterTreeNode
                field={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                values={values}
                onValueChange={onValueChange}
                toolName={toolName}
                disabled={disabled}
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
            {/* For arrays, show a JSON textarea instead of drilling into items */}
            <div style={{ paddingLeft: paddingLeft + 24 }} className="py-2 pr-2">
              <ArrayValueEditor
                field={field}
                value={currentValue}
                onChange={(val) => onValueChange(field.name, val)}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline value input that adapts based on field type
 */
interface ValueInputInlineProps {
  field: NestedFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  toolName: string;
  disabled?: boolean;
}

function ValueInputInline({ field, value, onChange, toolName, disabled }: ValueInputInlineProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Track whether user is entering a custom value (not from suggestions)
  const [useCustomValue, setUseCustomValue] = useState(false);

  // Build param key for suggestions (strip params. prefix)
  const paramKey = field.name.startsWith('params.') ? field.name.slice(7) : field.name;

  // Fetch suggestions for string/number fields
  const suggestionsQuery = trpc.admin.conditions.getParamSuggestions.useQuery(
    { toolName, paramName: paramKey, limit: 10 },
    {
      enabled: toolName.length > 0 && (field.type === 'string' || field.type === 'unknown'),
    },
  );

  const suggestions = suggestionsQuery.data?.suggestions ?? [];

  // Boolean toggle
  if (field.type === 'boolean') {
    const checked = value === true || value === 'true';
    return (
      <div className="flex items-center gap-2 justify-end">
        <Switch checked={checked} onCheckedChange={(val) => onChange(val)} disabled={disabled} />
        <span className="text-xs text-muted-foreground w-8">{checked ? 'true' : 'false'}</span>
      </div>
    );
  }

  // Enum select
  if (field.enum && field.enum.length > 0) {
    return (
      <Select
        value={typeof value === 'string' ? value : undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full h-7 text-xs">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent className="max-w-[280px]">
          {field.enum.map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs truncate">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Number input
  if (field.type === 'number') {
    return (
      <Input
        type="number"
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === '' ? undefined : parseFloat(val));
        }}
        placeholder="Number"
        className="w-full h-7 text-xs"
        disabled={disabled}
      />
    );
  }

  // String/unknown input - show Select when suggestions exist, otherwise Input
  if (suggestions.length > 0 && !useCustomValue) {
    // Show Select dropdown with suggestions + Custom option
    return (
      <Select
        value={
          value !== undefined && value !== null && String(value) !== ''
            ? String(value)
            : '__placeholder__'
        }
        onValueChange={(v) => {
          if (v === '__custom__') {
            setUseCustomValue(true);
            onChange(undefined);
          } else if (v !== '__placeholder__') {
            onChange(v);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full h-7 text-xs">
          <SelectValue placeholder="Select..." className="truncate" />
        </SelectTrigger>
        <SelectContent className="max-w-[320px] max-h-[260px]">
          {suggestions.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">
              <div className="flex flex-col gap-0.5 py-0.5 max-w-[280px]">
                <span className="truncate">{s.label ?? s.value}</span>
                {s.label ? (
                  <span className="text-[10px] text-muted-foreground truncate font-mono">
                    {s.value}
                  </span>
                ) : s.sourceKey ? (
                  <span className="text-[10px] text-muted-foreground italic truncate">
                    from: {s.sourceKey}
                  </span>
                ) : null}
              </div>
            </SelectItem>
          ))}
          <SelectItem value="__custom__" className="text-xs border-t mt-1 pt-1">
            <span className="text-muted-foreground">Custom...</span>
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Input for custom value or when no suggestions
  return (
    <div className="flex flex-col gap-1 w-full">
      {useCustomValue && suggestions.length > 0 && (
        <button
          type="button"
          className="text-[10px] text-primary hover:underline self-end"
          onClick={() => {
            setUseCustomValue(false);
            onChange(undefined);
          }}
        >
          ← Suggestions
        </button>
      )}
      <div className="relative w-full">
        <Input
          type="text"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Value"
          className="w-full h-7 text-xs"
          disabled={disabled}
        />
        {/* Show inline suggestions when custom mode and user focuses */}
        {showSuggestions && suggestions.length > 0 && useCustomValue && (
          <div className="absolute top-full right-0 z-50 w-full min-w-[200px] max-w-[280px] mt-1 bg-popover border border-border rounded-md shadow-lg max-h-36 overflow-y-auto">
            {suggestions.slice(0, 5).map((s) => (
              <button
                key={s.value}
                type="button"
                className="w-full px-2 py-1.5 text-xs text-left hover:bg-muted/70 flex flex-col gap-0.5"
                onClick={() => {
                  onChange(s.value);
                  setShowSuggestions(false);
                }}
              >
                <span className="truncate">{s.label ?? s.value}</span>
                {s.label ? (
                  <span className="text-[10px] text-muted-foreground truncate">{s.value}</span>
                ) : s.sourceKey ? (
                  <span className="text-[10px] text-muted-foreground truncate">
                    from: {s.sourceKey}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Editor for array values - shows a JSON textarea
 */
interface ArrayValueEditorProps {
  field: NestedFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

function ArrayValueEditor({ field: _field, value, onChange, disabled }: ArrayValueEditorProps) {
  const [jsonText, setJsonText] = useState(() => {
    if (Array.isArray(value)) {
      return JSON.stringify(value, null, 2);
    }
    return '[]';
  });
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (text: string) => {
      setJsonText(text);
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          setError(null);
          onChange(parsed);
        } else {
          setError('Value must be an array');
        }
      } catch {
        setError('Invalid JSON');
      }
    },
    [onChange],
  );

  return (
    <div className="space-y-1 min-w-0">
      <span className="text-xs text-muted-foreground">Array (JSON):</span>
      <Textarea
        value={jsonText}
        onChange={(e) => handleChange(e.target.value)}
        placeholder='["val1", "val2"]'
        className={cn(
          'font-mono text-xs min-h-[48px] max-h-[120px] resize-y',
          error && 'border-destructive',
        )}
        disabled={disabled}
      />
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}

/**
 * Editor for dynamic key-value pairs (params.*.key = value)
 */
interface DynamicKeyValueEditorProps {
  basePath: string; // e.g., "params.data.properties"
  values: Map<string, unknown>;
  onValueChange: (path: string, value: unknown) => void;
  toolName: string;
  disabled?: boolean;
}

function DynamicKeyValueEditor({
  basePath,
  values,
  onValueChange,
  toolName,
  disabled,
}: DynamicKeyValueEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [showKeySuggestions, setShowKeySuggestions] = useState(false);

  // Get existing keys at this path
  const existingKeys: string[] = [];
  values.forEach((_, key) => {
    if (key.startsWith(basePath + '.') && key !== basePath + '.*') {
      const suffix = key.slice(basePath.length + 1);
      if (!suffix.includes('.')) {
        existingKeys.push(suffix);
      }
    }
  });

  // Fetch historical keys
  const historicalKeysQuery = trpc.admin.conditions.getParamKeys.useQuery(
    { toolName },
    { enabled: toolName.length > 0 },
  );

  // Filter to relevant keys
  const paramPrefix = basePath.replace(/^params\./, '');
  const suggestedKeys = (historicalKeysQuery.data?.keys ?? [])
    .filter((k) => k.startsWith(paramPrefix + '.'))
    .map((k) => k.slice(paramPrefix.length + 1))
    .filter((k) => !k.includes('.') && !existingKeys.includes(k));

  const handleAddKey = useCallback(() => {
    if (newKey.trim()) {
      onValueChange(`${basePath}.${newKey.trim()}`, '');
      setNewKey('');
    }
  }, [basePath, newKey, onValueChange]);

  const handleRemoveKey = useCallback(
    (key: string) => {
      onValueChange(`${basePath}.${key}`, undefined);
    },
    [basePath, onValueChange],
  );

  return (
    <div className="space-y-2 border rounded p-2 bg-muted/20">
      <span className="text-xs text-muted-foreground">Dynamic key-value pairs:</span>

      {/* Existing key-value pairs */}
      {existingKeys.map((key) => {
        const fullPath = `${basePath}.${key}`;
        const val = values.get(fullPath);
        return (
          <div key={key} className="flex items-center gap-2 min-w-0">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[80px] flex-shrink-0">
              {key}
            </code>
            <Input
              type="text"
              value={val !== undefined ? String(val) : ''}
              onChange={(e) => onValueChange(fullPath, e.target.value || undefined)}
              placeholder="value"
              className="flex-1 min-w-0 h-7 text-xs"
              disabled={disabled}
            />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive flex-shrink-0 w-5"
              onClick={() => handleRemoveKey(key)}
              disabled={disabled}
            >
              ×
            </button>
          </div>
        );
      })}

      {/* Add new key */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onFocus={() => setShowKeySuggestions(true)}
            onBlur={() => setTimeout(() => setShowKeySuggestions(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddKey();
              }
            }}
            placeholder="Add key..."
            className="h-7 text-xs w-full"
            disabled={disabled}
          />
          {showKeySuggestions && suggestedKeys.length > 0 && (
            <div className="absolute top-full left-0 z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-28 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] text-muted-foreground border-b">
                Previously used:
              </div>
              {suggestedKeys.slice(0, 4).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="w-full px-2 py-1 text-xs text-left hover:bg-muted/70 truncate"
                  onClick={() => {
                    setNewKey(k);
                    setShowKeySuggestions(false);
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 flex-shrink-0"
          onClick={handleAddKey}
          disabled={disabled || !newKey.trim()}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Container component for the schema parameter tree
 */
interface SchemaParameterTreeProps {
  fields: NestedFieldSchema[];
  values: Map<string, unknown>;
  onValueChange: (path: string, value: unknown) => void;
  toolName: string;
  disabled?: boolean;
}

export function SchemaParameterTree({
  fields,
  values,
  onValueChange,
  toolName,
  disabled = false,
}: SchemaParameterTreeProps) {
  // Track which nodes are expanded by their full path
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Auto-expand first level
    const initial = new Set<string>();
    for (const field of fields) {
      if (field.type === 'object' || field.type === 'array') {
        initial.add(field.name);
      }
    }
    return initial;
  });

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
        No parameter schema available for this tool.
      </div>
    );
  }

  return (
    <div className="space-y-0.5 min-w-0 overflow-x-hidden">
      {fields.map((field) => (
        <SchemaParameterTreeNode
          key={field.name}
          field={field}
          depth={0}
          expandedPaths={expandedPaths}
          onToggleExpand={toggleExpand}
          values={values}
          onValueChange={onValueChange}
          toolName={toolName}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
