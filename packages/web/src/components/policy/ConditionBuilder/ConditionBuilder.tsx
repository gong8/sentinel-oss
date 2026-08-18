/**
 * ConditionBuilder Component
 * Main condition builder with visual (chip-based), JSON, and advanced expression modes
 */

import { AlertTriangle } from 'lucide-react';
import { type JSX, useCallback, useMemo, useState } from 'react';

import { trpc } from '../../../lib/trpc';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Label } from '../../ui/label';
import type { ModeOption } from '../../ui/mode-toggle';
import { ModeToggle } from '../../ui/mode-toggle';
import { AdvancedConditionEditor } from '../AdvancedConditionEditor';
import { ChipBuilder, flatToTree, treeToFlat } from './ChipBuilder';
import type { ConditionGroupNode } from './ChipBuilder/types';
import { JsonEditor } from './JsonEditor';
import type {
  CategoryOption,
  ConditionBuilderMode,
  OperatorGroups,
  ParamSuggestion,
  PolicyConditions,
} from './types';

/** Extended mode including advanced expression mode */
type ExtendedConditionMode = ConditionBuilderMode | 'advanced';

/** Condition mode for database storage */
type ConditionMode = 'SIMPLE' | 'ADVANCED';

interface ConditionBuilderProps {
  /** Current conditions value (flat array for SIMPLE mode, backward compatibility) */
  value: PolicyConditions | null;
  /** Called when conditions change (SIMPLE mode) */
  onChange: (value: PolicyConditions | null) => void;
  /** Current conditions tree (tree structure with AND/OR) */
  conditionsTree?: ConditionGroupNode | null;
  /** Called when conditions tree changes */
  onConditionsTreeChange?: (tree: ConditionGroupNode | null) => void;
  /** Current advanced expression (ADVANCED mode) */
  advancedExpression?: string;
  /** Called when advanced expression changes */
  onAdvancedExpressionChange?: (value: string) => void;
  /** Current condition mode (SIMPLE or ADVANCED) */
  conditionMode?: ConditionMode;
  /** Called when condition mode changes */
  onConditionModeChange?: (mode: ConditionMode) => void;
  /** Available field categories from API */
  categories: CategoryOption[];
  /** Available operators from API */
  operators: OperatorGroups;
  /** Tool patterns for context-aware validation */
  toolPatterns?: string[];
  /** Parameter suggestions for autocomplete */
  suggestions?: Map<string, ParamSuggestion[]>;
  /** Field label */
  label?: string;
  /** Description text */
  description?: string;
  /** Error message */
  error?: string;
  /** Disable editing */
  disabled?: boolean;
  /** Initial mode */
  initialMode?: ConditionBuilderMode;
  /** Callback when advanced expression has validation errors */
  onAdvancedValidationChange?: (hasErrors: boolean) => void;
}

export function ConditionBuilder({
  value,
  onChange,
  conditionsTree,
  onConditionsTreeChange,
  advancedExpression = '',
  onAdvancedExpressionChange,
  conditionMode = 'SIMPLE',
  onConditionModeChange,
  categories,
  operators,
  toolPatterns = [],
  suggestions = new Map(),
  label = 'Conditions',
  description = 'Add conditions to restrict when this policy applies. Supports AND/OR grouping.',
  error,
  disabled = false,
  initialMode = 'visual',
  onAdvancedValidationChange: _onAdvancedValidationChange,
}: ConditionBuilderProps): JSX.Element {
  // Determine initial UI mode based on condition mode
  const getInitialUiMode = (): ExtendedConditionMode => {
    if (conditionMode === 'ADVANCED') return 'advanced';
    return initialMode;
  };

  const [mode, setMode] = useState<ExtendedConditionMode>(getInitialUiMode);
  const [jsonValid, setJsonValid] = useState(true);
  const [showConversionWarning, setShowConversionWarning] = useState(false);

  // Conversion mutation
  const convertMutation = trpc.admin.advancedConditions.convertToAdvanced.useMutation();

  // Memoize conditions array from the value to avoid dependency issues
  const conditions = useMemo(() => value ?? [], [value]);

  // Initialize tree from conditionsTree prop or convert from flat conditions
  const tree = useMemo((): ConditionGroupNode | null => {
    if (conditionsTree) {
      return conditionsTree;
    }
    return flatToTree(value);
  }, [conditionsTree, value]);

  // Check if there are any conditions (either in flat array or tree)
  const hasConditions = useMemo(() => {
    if (conditions.length > 0) return true;
    if (tree && tree.children.length > 0) return true;
    return false;
  }, [conditions.length, tree]);

  // Check if in advanced mode (cannot go back)
  const isAdvancedMode = conditionMode === 'ADVANCED';

  // Mode options for the toggle
  const modeOptions: ModeOption<ExtendedConditionMode>[] = useMemo(
    () => [
      {
        value: 'visual',
        label: 'Visual',
        disabled: isAdvancedMode,
        title: isAdvancedMode ? 'Cannot switch back from Advanced mode' : undefined,
      },
      {
        value: 'json',
        label: 'JSON',
        disabled: isAdvancedMode,
        title: isAdvancedMode ? 'Cannot switch back from Advanced mode' : undefined,
      },
      {
        value: 'advanced',
        label: 'Advanced',
      },
    ],
    [isAdvancedMode],
  );

  // Handle tree changes from ChipBuilder
  const handleTreeChange = useCallback(
    (newTree: ConditionGroupNode) => {
      // Update tree if callback provided
      if (onConditionsTreeChange) {
        onConditionsTreeChange(newTree);
      }

      // Also update flat conditions for backward compatibility
      const flat = treeToFlat(newTree);
      onChange(flat);
    },
    [onChange, onConditionsTreeChange],
  );

  // Handle mode switch
  const handleModeSwitch = useCallback(
    (newMode: ExtendedConditionMode) => {
      // Cannot go back from advanced mode
      if (isAdvancedMode && newMode !== 'advanced') {
        return;
      }

      // Don't switch if JSON is invalid
      if (mode === 'json' && !jsonValid) {
        return;
      }

      // When switching to advanced mode
      if (newMode === 'advanced' && !isAdvancedMode) {
        // Only show warning if there are existing conditions (irreversible conversion)
        if (hasConditions) {
          setShowConversionWarning(true);
          return;
        }
        // If no conditions, switch directly without warning
        if (onConditionModeChange && onAdvancedExpressionChange) {
          onAdvancedExpressionChange('');
          onConditionModeChange('ADVANCED');
          setMode('advanced');
        }
        return;
      }

      setMode(newMode);
    },
    [
      mode,
      jsonValid,
      isAdvancedMode,
      hasConditions,
      onConditionModeChange,
      onAdvancedExpressionChange,
    ],
  );

  // Handle conversion to advanced mode
  const handleConvertToAdvanced = useCallback(() => {
    if (!onConditionModeChange || !onAdvancedExpressionChange) {
      setShowConversionWarning(false);
      return;
    }

    // Get conditions from flat array or convert from tree
    const conditionsFromTree = tree ? treeToFlat(tree) : null;
    const conditionsToConvert = conditions.length > 0 ? conditions : (conditionsFromTree ?? []);

    // Convert simple conditions to expression
    if (conditionsToConvert.length > 0) {
      convertMutation.mutate(
        { conditions: conditionsToConvert },
        {
          onSuccess: (result) => {
            onAdvancedExpressionChange(result.expression);
            onConditionModeChange('ADVANCED');
            setMode('advanced');
            setShowConversionWarning(false);
          },
          onError: () => {
            // Fallback to empty expression
            onAdvancedExpressionChange('');
            onConditionModeChange('ADVANCED');
            setMode('advanced');
            setShowConversionWarning(false);
          },
        },
      );
    } else {
      onAdvancedExpressionChange('');
      onConditionModeChange('ADVANCED');
      setMode('advanced');
      setShowConversionWarning(false);
    }
  }, [conditions, tree, convertMutation, onConditionModeChange, onAdvancedExpressionChange]);

  return (
    <div className="space-y-3">
      {/* Header with label and mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>

        <ModeToggle
          value={mode}
          onChange={handleModeSwitch}
          options={modeOptions}
          disabled={disabled}
        />
      </div>

      {/* Content based on mode */}
      {mode === 'visual' && !isAdvancedMode && (
        <ChipBuilder
          value={value}
          onChange={onChange}
          conditionsTree={tree}
          onTreeChange={handleTreeChange}
          categories={categories}
          operators={operators}
          suggestions={suggestions}
          disabled={disabled}
        />
      )}

      {mode === 'json' && !isAdvancedMode && (
        <JsonEditor
          value={value}
          onChange={onChange}
          onValidationChange={setJsonValid}
          disabled={disabled}
        />
      )}

      {(mode === 'advanced' || isAdvancedMode) && (
        <AdvancedConditionEditor
          value={advancedExpression}
          onChange={onAdvancedExpressionChange ?? (() => {})}
          toolPatterns={toolPatterns}
          disabled={disabled}
        />
      )}

      {/* Error message */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Invalid JSON warning when trying to switch */}
      {mode === 'json' && !jsonValid && (
        <p className="text-xs text-yellow-600">Fix JSON errors before switching to visual mode</p>
      )}

      {/* Advanced mode indicator */}
      {isAdvancedMode && (
        <p className="text-xs text-blue-600">
          Using advanced expression mode. This cannot be converted back to simple conditions.
        </p>
      )}

      {/* Conversion warning dialog */}
      <Dialog open={showConversionWarning} onOpenChange={setShowConversionWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Switch to Advanced Mode?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>
                Advanced mode uses a SQL-like expression language for complex conditions. This is a{' '}
                <strong>one-way conversion</strong> - you cannot switch back to the visual builder
                once you switch to advanced mode.
              </p>
              {hasConditions && <p>Your existing conditions will be converted to an expression.</p>}
              <p className="text-sm text-muted-foreground">
                Advanced mode supports features like: nested logic, WHERE clauses, aggregate
                functions (SUM, MAX), and more.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConversionWarning(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertToAdvanced} disabled={convertMutation.isPending}>
              {convertMutation.isPending ? 'Converting...' : 'Switch to Advanced'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
