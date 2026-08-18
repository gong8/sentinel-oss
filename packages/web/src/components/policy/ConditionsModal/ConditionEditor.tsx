/**
 * ConditionEditor Component
 * Editor for setting operator and value for a selected field
 * Supports dynamic key fields with historical suggestions
 * Supports global variable references via valueRef
 */

import { useCallback, useMemo, useState } from 'react';

import { trpc } from '../../../lib/trpc';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import type {
  ConditionOperator,
  NestedFieldSchema,
  OperatorGroups,
  OperatorOption,
  PolicyCondition,
  ValueMode,
} from '../ConditionBuilder';
import { GlobalVariableSelector } from '../ConditionBuilder/GlobalVariableSelector';
import { getCompatibleVariableTypes } from '../ConditionBuilder/typeMapping';

interface ConditionEditorProps {
  field: NestedFieldSchema;
  operators: OperatorGroups;
  onAdd: (condition: PolicyCondition) => void;
  onCancel: () => void;
  /** Tool patterns for fetching historical suggestions */
  toolPatterns?: string[];
  /** Initial condition values for editing an existing condition */
  initialCondition?: {
    /** The original field path (may include array indices like params.pages[0].content) */
    field?: string;
    operator: ConditionOperator;
    value?: unknown;
    valueRef?: string;
  };
  /** Whether we're editing (changes button text) */
  isEditing?: boolean;
}

export function ConditionEditor({
  field,
  operators,
  onAdd,
  onCancel,
  toolPatterns = [],
  initialCondition,
  isEditing = false,
}: ConditionEditorProps) {
  // Helper to get initial value based on initialCondition and field type
  const getInitialValue = (): string => {
    if (!initialCondition?.value) return '';
    const v = initialCondition.value;
    if (Array.isArray(v)) {
      // For list operators, join with comma
      return v.join(', ');
    }
    if (typeof v === 'boolean') return '';
    return String(v);
  };

  const getInitialBoolValue = (): boolean => {
    if (!initialCondition?.value) return false;
    return initialCondition.value === true;
  };

  const getInitialBetweenValues = (): [string, string] => {
    if (!initialCondition?.value || !Array.isArray(initialCondition.value)) return ['', ''];
    const arr = initialCondition.value;
    return [arr[0] !== undefined ? String(arr[0]) : '', arr[1] !== undefined ? String(arr[1]) : ''];
  };

  // Extract array indices from the initial field path (e.g., "params.pages[0].content" -> {"0": "0"})
  const getInitialArrayIndices = (): Record<string, string> => {
    if (!initialCondition?.field) return {};
    const indices: Record<string, string> = {};
    // Find all [n] patterns in the initial field
    const indexRegex = /\[(\d+)\]/g;
    let match;
    let i = 0;
    while ((match = indexRegex.exec(initialCondition.field)) !== null) {
      indices[`${i}`] = match[1];
      i++;
    }
    return indices;
  };

  // Extract dynamic key from initial field path (e.g., "params.data.properties.myKey" with schema "params.data.properties.*" -> "myKey")
  const getInitialDynamicKey = (): string => {
    if (!initialCondition?.field) return '';
    // Check if schema field ends with .* (dynamic key field)
    if (!field.name.endsWith('.*')) return '';
    const baseFieldPath = field.name.slice(0, -2); // Remove .*
    if (initialCondition.field.startsWith(baseFieldPath + '.')) {
      // Extract the key after the base path
      const key = initialCondition.field.slice(baseFieldPath.length + 1);
      // Only return if it doesn't contain dots (single key segment)
      if (!key.includes('.')) {
        return key;
      }
    }
    return '';
  };

  const [betweenMinInit, betweenMaxInit] = getInitialBetweenValues();

  const [operator, setOperator] = useState<ConditionOperator>(
    initialCondition?.operator ?? 'equals',
  );
  const [value, setValue] = useState<string>(getInitialValue());
  const [betweenMin, setBetweenMin] = useState<string>(betweenMinInit);
  const [betweenMax, setBetweenMax] = useState<string>(betweenMaxInit);
  const [boolValue, setBoolValue] = useState<boolean>(getInitialBoolValue());
  const [dynamicKey, setDynamicKey] = useState<string>(getInitialDynamicKey());
  const [showValueSuggestions, setShowValueSuggestions] = useState(false);
  const [showKeySuggestions, setShowKeySuggestions] = useState(false);
  // Track whether user is entering a custom value (not from suggestions)
  const [useCustomValue, setUseCustomValue] = useState(false);
  // Track field name to reset state when field changes (React pattern for derived state)
  const [prevFieldName, setPrevFieldName] = useState(field.name);
  // Track array indices for paths containing [] (e.g., pages[].content needs an index for pages)
  const [arrayIndices, setArrayIndices] =
    useState<Record<string, string>>(getInitialArrayIndices());
  // Value mode: static value or global variable reference
  const [valueMode, setValueMode] = useState<ValueMode>(
    initialCondition?.valueRef ? 'variable' : 'static',
  );
  const [valueRef, setValueRef] = useState<string>(initialCondition?.valueRef ?? '');

  // Check if this is a dynamic key field (e.g., params.data.properties.*)
  const isDynamicKeyField = field.name.endsWith('.*');
  const baseFieldPath = isDynamicKeyField ? field.name.slice(0, -2) : field.name;

  // Check if the field path contains array brackets that need indices
  // e.g., "params.pages[].content" has one array bracket, "params.pages[].items[].id" has two
  const arrayBracketMatches = useMemo(() => {
    const matches: Array<{ position: number; arrayPath: string }> = [];
    const regex = /\[\]/g;
    let match;
    while ((match = regex.exec(field.name)) !== null) {
      // Extract the array path up to this bracket (e.g., "params.pages" from "params.pages[].content")
      const pathUpToBracket = field.name.slice(0, match.index);
      const arrayName = pathUpToBracket.split('.').pop() ?? pathUpToBracket;
      matches.push({
        position: match.index,
        arrayPath: arrayName,
      });
    }
    return matches;
  }, [field.name]);

  const hasArrayBrackets = arrayBracketMatches.length > 0;

  // Get the first tool pattern for API calls
  const primaryToolPattern = toolPatterns[0] ?? '';

  // Fetch historical parameter keys for dynamic fields
  const historicalKeysQuery = trpc.admin.conditions.getParamKeys.useQuery(
    { toolName: primaryToolPattern },
    {
      enabled: isDynamicKeyField && primaryToolPattern.length > 0,
    },
  );

  // Filter keys that match this dynamic field's base path
  const historicalKeys = historicalKeysQuery.data?.keys;
  const relevantHistoricalKeys = useMemo(() => {
    if (!historicalKeys) return [];
    // Convert base path from condition format to param format
    // e.g., "params.data.properties" -> "data.properties"
    const paramPrefix = baseFieldPath.replace(/^params\./, '');
    return historicalKeys
      .filter((k) => k.startsWith(paramPrefix + '.'))
      .map((k) => k.slice(paramPrefix.length + 1)) // Get just the key name
      .filter((k) => !k.includes('.')); // Only top-level keys under this path
  }, [historicalKeys, baseFieldPath]);

  // Build the full field path for the condition (replacing * with actual key, [] with indices)
  const finalFieldPath = useMemo(() => {
    let path = field.name;

    // Replace array brackets with indices
    if (hasArrayBrackets) {
      let offset = 0;
      for (let i = 0; i < arrayBracketMatches.length; i++) {
        const match = arrayBracketMatches[i];
        if (!match) continue;
        const index = arrayIndices[`${i}`] ?? '';
        if (index !== '') {
          const pos = match.position + offset;
          path = path.slice(0, pos + 1) + index + path.slice(pos + 1);
          offset += index.length;
        }
      }
    }

    // Replace dynamic key
    if (isDynamicKeyField && dynamicKey) {
      path = path.replace(/\.\*$/, '.' + dynamicKey);
    }

    return path;
  }, [
    field.name,
    isDynamicKeyField,
    dynamicKey,
    hasArrayBrackets,
    arrayBracketMatches,
    arrayIndices,
  ]);

  // Build the parameter key for fetching value suggestions
  const paramKeyForSuggestions = useMemo(() => {
    if (!finalFieldPath.startsWith('params.')) return '';
    return finalFieldPath.replace(/^params\./, '');
  }, [finalFieldPath]);

  // Fetch historical value suggestions
  const valueSuggestionsQuery = trpc.admin.conditions.getParamSuggestions.useQuery(
    {
      toolName: primaryToolPattern,
      paramName: paramKeyForSuggestions,
      limit: 20,
    },
    {
      enabled:
        primaryToolPattern.length > 0 &&
        paramKeyForSuggestions.length > 0 &&
        (!isDynamicKeyField || dynamicKey.length > 0),
    },
  );

  const valueSuggestions = valueSuggestionsQuery.data?.suggestions ?? [];

  // Reset dynamic key, value, custom mode, and array indices when field changes
  // React pattern for derived state: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (prevFieldName !== field.name) {
    setPrevFieldName(field.name);
    setDynamicKey('');
    setValue('');
    setUseCustomValue(false);
    setValueMode('static');
    setValueRef('');
    setArrayIndices({});
  }

  // Get compatible variable types for the current field/operator
  const compatibleVariableTypes = useMemo(
    () => getCompatibleVariableTypes(field.type, operator),
    [field.type, operator],
  );

  // Get available operators for this field type - strict allowlists per type
  const availableOperators = useMemo(() => {
    const allOperators: OperatorOption[] = [
      ...operators.comparison,
      ...operators.string,
      ...operators.collection,
      ...operators.existence,
      // Note: network operators (inCidr, notInCidr) excluded - too specific for IP fields only
    ];

    // Define strict allowlists for each field type
    const operatorsByType: Record<string, ConditionOperator[]> = {
      boolean: ['equals', 'exists', 'notExists'],
      string: [
        'equals',
        'notEquals',
        'contains',
        'notContains',
        'startsWith',
        'endsWith',
        'matches',
        'in',
        'notIn',
        'exists',
        'notExists',
      ],
      number: [
        'equals',
        'notEquals',
        'lessThan',
        'greaterThan',
        'between',
        'in',
        'notIn',
        'exists',
        'notExists',
      ],
      array: ['containsAny', 'containsNone', 'exists', 'notExists'],
      // unknown type: use string operators as fallback
      unknown: [
        'equals',
        'notEquals',
        'contains',
        'notContains',
        'startsWith',
        'endsWith',
        'in',
        'notIn',
        'exists',
        'notExists',
      ],
    };

    const allowedOperators = operatorsByType[field.type] ?? operatorsByType['unknown'];

    return allOperators.filter((op) => allowedOperators.includes(op.name));
  }, [operators, field.type]);

  // Check if current operator needs a value
  const needsValue = !['exists', 'notExists'].includes(operator);
  const isBetween = operator === 'between';
  const isList = ['in', 'notIn', 'containsAny', 'containsAll', 'containsNone'].includes(operator);

  // Build the condition value based on operator and field type
  const buildValue = useCallback(() => {
    if (!needsValue) return undefined;

    if (isBetween) {
      const min = field.type === 'number' ? parseFloat(betweenMin) : betweenMin;
      const max = field.type === 'number' ? parseFloat(betweenMax) : betweenMax;
      return [min, max];
    }

    if (isList) {
      // Parse comma-separated values
      const items = value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      if (field.type === 'number') {
        return items.map((v) => parseFloat(v));
      }
      return items;
    }

    if (field.type === 'boolean') {
      return boolValue;
    }

    if (field.type === 'number') {
      return parseFloat(value);
    }

    return value;
  }, [needsValue, isBetween, isList, field.type, value, betweenMin, betweenMax, boolValue]);

  // Handle add condition
  const handleAdd = useCallback(() => {
    const condition: PolicyCondition = {
      field: finalFieldPath,
      operator,
      // Use valueRef if in variable mode, otherwise use static value
      ...(valueMode === 'variable' && valueRef ? { valueRef } : { value: buildValue() }),
    };
    onAdd(condition);
  }, [finalFieldPath, operator, buildValue, onAdd, valueMode, valueRef]);

  // Validate if we can add
  const canAdd = useMemo(() => {
    // Dynamic key fields require a key name
    if (isDynamicKeyField && !dynamicKey) return false;

    // Array brackets require indices
    if (hasArrayBrackets) {
      const allIndicesFilled = arrayBracketMatches.every((_, i) => {
        const index = arrayIndices[`${i}`];
        return index !== undefined && index !== '' && /^\d+$/.test(index);
      });
      if (!allIndicesFilled) return false;
    }

    if (!needsValue) return true;

    // In variable mode, just need a valid valueRef
    if (valueMode === 'variable') {
      return valueRef !== '';
    }

    // Static mode validation
    if (isBetween) {
      return betweenMin !== '' && betweenMax !== '';
    }
    if (field.type === 'boolean') return true;
    return value !== '';
  }, [
    needsValue,
    isBetween,
    betweenMin,
    betweenMax,
    field.type,
    value,
    isDynamicKeyField,
    dynamicKey,
    valueMode,
    valueRef,
    hasArrayBrackets,
    arrayBracketMatches,
    arrayIndices,
  ]);

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/30 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <Label className="text-sm font-medium min-w-0 flex-1">
          <span className="block mb-1">Condition for:</span>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all block max-w-full">
            {finalFieldPath}
          </code>
          {isDynamicKeyField && (
            <Badge variant="outline" className="mt-1 text-[10px]">
              dynamic
            </Badge>
          )}
          {hasArrayBrackets && (
            <Badge variant="outline" className="mt-1 ml-1 text-[10px]">
              array
            </Badge>
          )}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-7 text-xs flex-shrink-0"
        >
          Cancel
        </Button>
      </div>

      {/* Array index inputs for paths containing [] */}
      {hasArrayBrackets && (
        <div className="space-y-2">
          <Label className="text-xs">Array Index{arrayBracketMatches.length > 1 ? 'es' : ''}</Label>
          <p className="text-xs text-muted-foreground">
            Specify which array element{arrayBracketMatches.length > 1 ? 's' : ''} to check (0-based
            index)
          </p>
          <div className="flex flex-wrap gap-2">
            {arrayBracketMatches.map((match, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-mono">{match.arrayPath}[</span>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={arrayIndices[`${i}`] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Only allow non-negative integers
                    if (val === '' || /^\d+$/.test(val)) {
                      setArrayIndices((prev) => ({ ...prev, [`${i}`]: val }));
                    }
                  }}
                  className="w-16 h-8 text-center px-2"
                />
                <span className="text-xs text-muted-foreground font-mono">]</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic key input for wildcard fields */}
      {isDynamicKeyField && (
        <div className="space-y-2">
          <Label className="text-xs">Property Key</Label>
          <p className="text-xs text-muted-foreground">
            Enter the key name for this dynamic property
          </p>
          <div className="relative">
            <Input
              type="text"
              placeholder="e.g., page_id, title, status..."
              value={dynamicKey}
              onChange={(e) => setDynamicKey(e.target.value)}
              onFocus={() => setShowKeySuggestions(true)}
              onBlur={() => setTimeout(() => setShowKeySuggestions(false), 200)}
            />
            {/* Historical key suggestions dropdown */}
            {showKeySuggestions && relevantHistoricalKeys.length > 0 && (
              <div className="absolute top-full left-0 z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b">
                  Previously used keys:
                </div>
                {relevantHistoricalKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/70"
                    onClick={() => {
                      setDynamicKey(key);
                      setShowKeySuggestions(false);
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            )}
          </div>
          {relevantHistoricalKeys.length > 0 && !showKeySuggestions && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-xs text-muted-foreground">Quick select:</span>
              {relevantHistoricalKeys.slice(0, 5).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="text-xs px-1.5 py-0.5 bg-muted rounded hover:bg-muted/70"
                  onClick={() => setDynamicKey(key)}
                >
                  {key}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 min-w-0">
        {/* Operator selector - compact width */}
        <div className="space-y-1.5 sm:w-[120px] sm:flex-shrink-0">
          <Label className="text-xs">Operator</Label>
          <Select value={operator} onValueChange={(v) => setOperator(v as ConditionOperator)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {availableOperators.map((op) => (
                <SelectItem key={op.name} value={op.name} className="text-sm">
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Value input - takes remaining space */}
        {needsValue && (
          <div className="space-y-1.5 sm:flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Value</Label>
              {/* Mode toggle: Static vs Variable */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={valueMode === 'static' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-5 px-2 text-[10px]"
                  onClick={() => {
                    setValueMode('static');
                    setValueRef('');
                  }}
                >
                  Static
                </Button>
                <Button
                  type="button"
                  variant={valueMode === 'variable' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-5 px-2 text-[10px]"
                  onClick={() => {
                    setValueMode('variable');
                    setValue('');
                    setBetweenMin('');
                    setBetweenMax('');
                  }}
                >
                  Variable
                </Button>
              </div>
            </div>
            {/* Global Variable Selector (when in variable mode) */}
            {valueMode === 'variable' ? (
              <GlobalVariableSelector
                value={valueRef || undefined}
                onChange={(ref) => setValueRef(ref)}
                compatibleTypes={compatibleVariableTypes}
              />
            ) : field.type === 'boolean' ? (
              <div className="flex items-center gap-3 h-10">
                <Switch checked={boolValue} onCheckedChange={setBoolValue} />
                <span className="text-sm">{boolValue ? 'True' : 'False'}</span>
              </div>
            ) : isBetween ? (
              <div className="flex items-center gap-2">
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder="Min"
                  value={betweenMin}
                  onChange={(e) => setBetweenMin(e.target.value)}
                  className="w-full"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder="Max"
                  value={betweenMax}
                  onChange={(e) => setBetweenMax(e.target.value)}
                  className="w-full"
                />
              </div>
            ) : field.enum && field.enum.length > 0 ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select value" />
                </SelectTrigger>
                <SelectContent>
                  {field.enum.map((enumVal) => (
                    <SelectItem key={enumVal} value={enumVal}>
                      {enumVal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : /* String/number field with suggestions or custom input */ valueSuggestions.length >
                0 &&
              !isList &&
              field.type !== 'number' &&
              !useCustomValue ? (
              /* Show Select dropdown when suggestions exist */
              <div className="space-y-1.5 min-w-0">
                <Select
                  value={value || '__placeholder__'}
                  onValueChange={(v) => {
                    if (v === '__custom__') {
                      setUseCustomValue(true);
                      setValue('');
                    } else if (v !== '__placeholder__') {
                      setValue(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a value" className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[360px] max-h-[260px]">
                    {valueSuggestions.map((suggestion) => (
                      <SelectItem
                        key={suggestion.value}
                        value={suggestion.value}
                        className="text-sm"
                      >
                        <div className="flex flex-col gap-0.5 py-0.5 max-w-[320px]">
                          <span className="truncate">{suggestion.label || suggestion.value}</span>
                          {suggestion.label ? (
                            <span className="text-xs text-muted-foreground truncate font-mono">
                              {suggestion.value}
                            </span>
                          ) : suggestion.sourceKey ? (
                            <span className="text-xs text-muted-foreground italic truncate">
                              from: {suggestion.sourceKey}
                            </span>
                          ) : null}
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__" className="border-t mt-1 pt-1">
                      <span className="text-muted-foreground">Custom...</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {valueSuggestionsQuery.isLoading && (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                )}
              </div>
            ) : (
              /* Show Input for custom value, number fields, or list operators */
              <div className="space-y-1.5 min-w-0">
                {useCustomValue && valueSuggestions.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      setUseCustomValue(false);
                      setValue('');
                    }}
                  >
                    ← Back to suggestions
                  </button>
                )}
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder={
                    isList ? 'Comma-separated values' : field.type === 'number' ? 'Number' : 'Value'
                  }
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onFocus={() => setShowValueSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowValueSuggestions(false), 200)}
                  className="h-9"
                />
                {/* Historical value suggestions dropdown for fallback when no Select shown */}
                {showValueSuggestions &&
                  valueSuggestions.length > 0 &&
                  !isList &&
                  field.type !== 'number' &&
                  useCustomValue && (
                    <div className="border rounded-md shadow-sm max-h-40 overflow-y-auto">
                      <div className="px-2 py-1 text-xs text-muted-foreground border-b bg-muted/30">
                        Suggestions:
                      </div>
                      {valueSuggestions.slice(0, 4).map((suggestion) => (
                        <button
                          key={suggestion.value}
                          type="button"
                          className="w-full px-2 py-1.5 text-sm text-left hover:bg-muted/70 flex flex-col gap-0.5"
                          onClick={() => {
                            setValue(suggestion.value);
                            setShowValueSuggestions(false);
                          }}
                        >
                          <span className="truncate">{suggestion.label || suggestion.value}</span>
                          {suggestion.label ? (
                            <span className="text-xs text-muted-foreground truncate">
                              {suggestion.value}
                            </span>
                          ) : suggestion.sourceKey ? (
                            <span className="text-xs text-muted-foreground truncate">
                              from: {suggestion.sourceKey}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            )}
            {isList && (
              <p className="text-xs text-muted-foreground">Enter values separated by commas</p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {isEditing && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" onClick={handleAdd} disabled={!canAdd}>
          {isEditing ? 'Save Changes' : 'Add Condition'}
        </Button>
      </div>
    </div>
  );
}
