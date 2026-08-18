/**
 * ConditionsModal Component
 * Modal for editing policy conditions with nested field tree view
 * and chip-based condition display with AND/OR grouping
 */

import { useCallback, useMemo, useState } from 'react';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { AdvancedConditionEditor } from '../AdvancedConditionEditor';
import type {
  NestedCategoryOption,
  NestedFieldSchema,
  OperatorGroups,
  PolicyCondition,
  PolicyConditions,
} from '../ConditionBuilder';
import { isLeafFieldType } from '../ConditionBuilder';
import { flatToTree, treeToExpression, treeToFlat } from '../ConditionBuilder/ChipBuilder';
import type {
  ConditionGroupNode,
  ConditionLeafNode,
  ConditionNodeId,
} from '../ConditionBuilder/ChipBuilder/types';
import { isConditionLeaf } from '../ConditionBuilder/ChipBuilder/types';
import {
  chainNode,
  cleanupTree,
  countConditions,
  findNodeById,
  generateNodeId,
  updateNode,
} from '../ConditionBuilder/ChipBuilder/utils';
import { ConditionEditor } from './ConditionEditor';
import { ConditionsChipList, type PendingChainRequest } from './ConditionsChipList';
import { SchemaTree } from './SchemaTree';

/** Condition mode for database storage */
type ConditionMode = 'SIMPLE' | 'ADVANCED';

/**
 * Normalize a field path by replacing array indices with empty brackets
 * e.g., "params.pages[0].content" -> "params.pages[].content"
 */
function normalizeFieldPath(fieldPath: string): string {
  return fieldPath.replace(/\[\d+\]/g, '[]');
}

/**
 * Find ancestor paths that need to be expanded to show a given field
 * e.g., for "params.pages[].content", returns ["params.pages"] so the array expands
 */
function findAncestorPaths(
  fields: NestedFieldSchema[],
  targetPath: string,
  currentPath: string[] = [],
): Set<string> | null {
  const normalizedTarget = normalizeFieldPath(targetPath);

  for (const field of fields) {
    // Check if this field matches the target
    if (field.name === normalizedTarget) {
      return new Set(currentPath);
    }
    // For dynamic fields
    if (field.name.endsWith('.*') && normalizedTarget.startsWith(field.name.slice(0, -1))) {
      return new Set(currentPath);
    }

    // Search in children (objects)
    if (field.children) {
      const result = findAncestorPaths(field.children, targetPath, [...currentPath, field.name]);
      if (result) return result;
    }

    // Search in items (arrays)
    if (field.items) {
      // Check items directly
      if (field.items.name === normalizedTarget) {
        return new Set([...currentPath, field.name]);
      }
      if (
        field.items.name.endsWith('.*') &&
        normalizedTarget.startsWith(field.items.name.slice(0, -1))
      ) {
        return new Set([...currentPath, field.name]);
      }
      // Search items' children
      if (field.items.children) {
        const result = findAncestorPaths(field.items.children, targetPath, [
          ...currentPath,
          field.name,
          field.items.name,
        ]);
        if (result) return result;
      }
    }
  }

  return null;
}

/** Recursive helper to find field in nested fields (pure function, extracted for reuse) */
function findFieldInFields(
  fields: NestedFieldSchema[],
  fieldPath: string,
): NestedFieldSchema | null {
  // Normalize the field path to match schema format (replace [0] with [])
  const normalizedPath = normalizeFieldPath(fieldPath);

  for (const field of fields) {
    if (field.name === normalizedPath) {
      return field;
    }
    // For dynamic fields (e.g., params.data.properties.*), check if field matches base path
    if (field.name.endsWith('.*') && normalizedPath.startsWith(field.name.slice(0, -1))) {
      return field;
    }
    // Search in child fields (for objects)
    if (field.children) {
      const found = findFieldInFields(field.children, fieldPath);
      if (found) return found;
    }
    // Search in items (for arrays)
    if (field.items) {
      // Check if the items schema itself matches
      if (field.items.name === normalizedPath) {
        return field.items;
      }
      // For dynamic fields within array items
      if (
        field.items.name.endsWith('.*') &&
        normalizedPath.startsWith(field.items.name.slice(0, -1))
      ) {
        return field.items;
      }
      // Search in items' children (array of objects)
      if (field.items.children) {
        const found = findFieldInFields(field.items.children, fieldPath);
        if (found) return found;
      }
    }
  }
  return null;
}

interface ConditionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Simple conditions value (array for SIMPLE mode) */
  value: PolicyConditions | null;
  /** Called when simple conditions change */
  onChange: (value: PolicyConditions | null) => void;
  /** Current conditions tree (tree structure with AND/OR) */
  conditionsTree?: ConditionGroupNode | null;
  /** Called when conditions tree changes */
  onConditionsTreeChange?: (tree: ConditionGroupNode | null) => void;
  /** Current condition mode (SIMPLE or ADVANCED) */
  conditionMode?: ConditionMode;
  /** Called when condition mode changes */
  onConditionModeChange?: (mode: ConditionMode) => void;
  /** Advanced expression value (ADVANCED mode) */
  advancedExpression?: string;
  /** Called when advanced expression changes */
  onAdvancedExpressionChange?: (value: string) => void;
  toolPatterns: string[];
  operators: OperatorGroups;
  /** Whether to show tool-parameter conditions (only when single specific tool selected) */
  showToolParameters?: boolean;
}

export function ConditionsModal({
  open,
  onOpenChange,
  value,
  onChange,
  conditionsTree,
  onConditionsTreeChange,
  conditionMode = 'SIMPLE',
  onConditionModeChange,
  advancedExpression = '',
  onAdvancedExpressionChange,
  toolPatterns,
  operators,
  showToolParameters = false,
}: ConditionsModalProps) {
  // Local state for editing
  const [localConditions, setLocalConditions] = useState<PolicyConditions>([]);
  const [localTree, setLocalTree] = useState<ConditionGroupNode | null>(null);
  const [localExpression, setLocalExpression] = useState<string>('');
  const [localMode, setLocalMode] = useState<ConditionMode>('SIMPLE');
  const [selectedField, setSelectedField] = useState<NestedFieldSchema | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('time');
  const [expressionHasErrors, setExpressionHasErrors] = useState(false);
  const [expressionValidating, setExpressionValidating] = useState(false);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [pendingChain, setPendingChain] = useState<PendingChainRequest | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<ConditionNodeId | null>(null);
  // Expanded paths for the schema tree (set when editing to auto-expand to selected field)
  const [schemaExpandedPaths, setSchemaExpandedPaths] = useState<Set<string> | undefined>(
    undefined,
  );

  // Track previous open state for derived state pattern
  const [prevOpen, setPrevOpen] = useState(open);

  // Fetch nested categories from API
  const nestedCategoriesQuery = trpc.admin.conditions.getNestedCategories.useQuery(
    { toolPatterns },
    { enabled: open },
  );

  const categories = useMemo(() => {
    const apiCategories = (nestedCategoriesQuery.data?.categories ?? []) as NestedCategoryOption[];
    // Always include a parameters tab - show disabled message if not available
    const hasParametersCategory = apiCategories.some((c) => c.name === 'parameters');
    if (!hasParametersCategory && apiCategories.length > 0) {
      return [...apiCategories, { name: 'parameters', label: 'Tool Parameters', fields: [] }];
    }
    return apiCategories;
  }, [nestedCategoriesQuery.data]);

  // Initialize local state when modal opens (derived state pattern)
  // See: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (open && !prevOpen) {
    setPrevOpen(open);
    const initialConditions = value ?? [];
    setLocalConditions(initialConditions);
    // Use conditionsTree if provided, otherwise fall back to flat conditions
    setLocalTree(conditionsTree ?? flatToTree(initialConditions));
    setLocalExpression(advancedExpression);

    // Use the stored conditionMode directly - both SIMPLE and ADVANCED modes
    // now store expressions, so we can't infer mode from expression presence
    setLocalMode(conditionMode);

    setSelectedField(null);
    setExpressionHasErrors(false);
    setExpressionValidating(false);
    setPendingChain(null);
    setEditingNodeId(null);
    setSchemaExpandedPaths(undefined);
    const firstCategory = categories[0]?.name ?? 'time';
    setSelectedCategory(firstCategory);
  } else if (!open && prevOpen) {
    setPrevOpen(open);
  }

  // Check if in advanced mode (cannot go back)
  const isAdvancedMode = localMode === 'ADVANCED';

  // Handle dialog close (user interaction like escape or backdrop click)
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  // Handle field selection from tree
  const handleSelectField = useCallback((field: NestedFieldSchema) => {
    // Only allow selecting leaf fields
    if (isLeafFieldType(field.type)) {
      setSelectedField(field);
    }
  }, []);

  // Handle adding or updating a condition
  const handleAddCondition = useCallback(
    (condition: PolicyCondition) => {
      // If editing an existing condition, update it
      if (editingNodeId && localTree) {
        const updatedTree = updateNode(localTree, editingNodeId, {
          field: condition.field,
          operator: condition.operator,
          value: condition.value,
          valueRef: condition.valueRef,
        }) as ConditionGroupNode;
        const cleaned = cleanupTree(updatedTree);
        setLocalTree(cleaned);
        const flat = treeToFlat(cleaned);
        setLocalConditions(flat ?? []);
        setEditingNodeId(null);
        setSelectedField(null);
        return;
      }

      // Create the new leaf node
      const newLeaf: ConditionLeafNode = {
        type: 'condition',
        id: generateNodeId(),
        field: condition.field,
        operator: condition.operator,
        value: condition.value,
        valueRef: condition.valueRef,
      };

      if (pendingChain && localTree) {
        // Chain the new condition to the target
        const newTree = chainNode(localTree, pendingChain.targetId, newLeaf, pendingChain.logic);
        const cleaned = cleanupTree(newTree);
        setLocalTree(cleaned);
        // Note: For complex trees, treeToFlat may return null, so we keep the tree as source of truth
        const flat = treeToFlat(cleaned);
        setLocalConditions(flat ?? []);
        setPendingChain(null);
      } else {
        // Just append to root
        const newConditions = [...localConditions, condition];
        setLocalConditions(newConditions);
        setLocalTree(flatToTree(newConditions));
      }
      setSelectedField(null);
    },
    [localConditions, localTree, pendingChain, editingNodeId],
  );

  // Handle chain request from chip list (null clears the pending chain)
  const handleChainRequest = useCallback((request: PendingChainRequest | null) => {
    setPendingChain(request);
  }, []);

  // Find a field schema by field path (recursive search through categories)
  const findFieldByPath = useCallback(
    (fieldPath: string): { field: NestedFieldSchema; categoryName: string } | null => {
      for (const category of categories) {
        const found = findFieldInFields(category.fields, fieldPath);
        if (found) {
          return { field: found, categoryName: category.name };
        }
      }
      return null;
    },
    [categories],
  );

  // Handle edit request from chip list (null to close edit mode)
  const handleEditRequest = useCallback(
    (nodeId: ConditionNodeId | null) => {
      // Close edit mode
      if (nodeId === null) {
        setEditingNodeId(null);
        setSelectedField(null);
        setSchemaExpandedPaths(undefined);
        return;
      }

      if (!localTree) return;

      const node = findNodeById(localTree, nodeId);
      if (!node || !isConditionLeaf(node)) return;

      // Find the field schema for this condition
      const result = findFieldByPath(node.field);
      if (result) {
        setSelectedCategory(result.categoryName);
        setSelectedField(result.field);

        // Find ancestor paths to expand the tree to show the selected field
        const category = categories.find((c) => c.name === result.categoryName);
        if (category) {
          const ancestorPaths = findAncestorPaths(category.fields, node.field);
          if (ancestorPaths) {
            setSchemaExpandedPaths(ancestorPaths);
          }
        }
      }
      setEditingNodeId(nodeId);
    },
    [localTree, findFieldByPath, categories],
  );

  // Handle tree changes from chip list
  const handleTreeChange = useCallback(
    (newTree: ConditionGroupNode) => {
      setLocalTree(newTree);
      const flat = treeToFlat(newTree);
      setLocalConditions(flat ?? []);
      // Clear editing if the edited node was removed
      if (editingNodeId && !findNodeById(newTree, editingNodeId)) {
        setEditingNodeId(null);
        setSelectedField(null);
      }
    },
    [editingNodeId],
  );

  // Handle save
  // Both modes now store expressions, but we keep track of which mode was used
  // Also save the tree structure for SIMPLE mode so it can be restored on edit
  const handleSave = useCallback(() => {
    if (localMode === 'ADVANCED') {
      // User typed expression directly - clear tree and flat conditions since they're not relevant
      onConditionModeChange?.('ADVANCED');
      onAdvancedExpressionChange?.(localExpression);
      onConditionsTreeChange?.(null);
      onChange(null);
    } else {
      // Visual builder mode - convert tree to expression and save tree for restoration
      if (localTree && countConditions(localTree) > 0) {
        const expression = treeToExpression(localTree);
        onConditionModeChange?.('SIMPLE');
        onAdvancedExpressionChange?.(expression);
        onConditionsTreeChange?.(localTree);
        // Also save flat conditions for backward compatibility with policy evaluation
        // treeToFlat returns null for complex trees that can't be flattened
        const flat = treeToFlat(localTree);
        onChange(flat);
      } else {
        // No conditions - clear everything
        onConditionModeChange?.('SIMPLE');
        onAdvancedExpressionChange?.('');
        onConditionsTreeChange?.(null);
        onChange(null);
      }
    }
    onOpenChange(false);
  }, [
    localMode,
    localTree,
    localExpression,
    onChange,
    onConditionModeChange,
    onAdvancedExpressionChange,
    onConditionsTreeChange,
    onOpenChange,
  ]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Handle escape key - prevent closing when autocomplete is open
  const handleEscapeKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (autocompleteOpen) {
        e.preventDefault();
      }
    },
    [autocompleteOpen],
  );

  // Can save - either in simple mode, or in advanced mode with no errors and not validating
  const canSave = localMode === 'SIMPLE' || (!expressionHasErrors && !expressionValidating);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-5xl max-h-[90vh] flex flex-col"
          onEscapeKeyDown={handleEscapeKeyDown}
        >
          <DialogHeader>
            <DialogTitle>{isAdvancedMode ? 'Edit Expression' : 'Edit Conditions'}</DialogTitle>
            <DialogDescription>
              {isAdvancedMode
                ? 'Write an expression to define a complex condition.'
                : 'Add, edit, or group conditions to control when this policy applies.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
            {/* Simple Mode Content */}
            {localMode === 'SIMPLE' && (
              <>
                {/* Schema tree - only shown when:
                    1. No conditions yet (need to add first one)
                    2. Pending chain request (user clicked AND/OR)
                    3. User clicked "Add condition" button
                */}
                {(() => {
                  const hasConditions = localTree && localTree.children.length > 0;
                  const shouldShowSchema =
                    !hasConditions || pendingChain !== null || editingNodeId !== null;

                  if (!shouldShowSchema) {
                    // Show instructional text when schema is hidden
                    return (
                      <div className="flex justify-center py-4">
                        <p className="text-sm text-muted-foreground">
                          Click a statement or group to view options
                        </p>
                      </div>
                    );
                  }

                  return categories.length > 0 ? (
                    <Tabs
                      value={selectedCategory}
                      onValueChange={setSelectedCategory}
                      className="flex-1 flex flex-col min-h-0"
                    >
                      <TabsList
                        className="grid w-full"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(categories.length, 4)}, 1fr)`,
                        }}
                      >
                        {categories.map((category) => (
                          <TabsTrigger
                            key={category.name}
                            value={category.name}
                            className="text-xs"
                          >
                            {category.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {categories.map((category) => (
                        <TabsContent
                          key={category.name}
                          value={category.name}
                          className="flex-1 overflow-hidden flex flex-col gap-4 mt-4"
                        >
                          {/* Show disabled message for parameters when not available */}
                          {category.name === 'parameters' &&
                          (!showToolParameters || category.fields.length === 0) ? (
                            <div className="flex-1 flex items-center justify-center border rounded-lg p-6 min-h-[200px] bg-muted/30">
                              <div className="text-center space-y-2">
                                <p className="text-sm text-muted-foreground">
                                  Tool parameter conditions are not available when multiple tools
                                  are selected.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Select a single specific tool to add conditions on its parameters.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Schema tree */}
                              <div className="flex-1 overflow-y-auto border rounded-lg p-3 min-h-[200px] max-h-[300px]">
                                <p className="text-xs text-muted-foreground mb-2">
                                  {editingNodeId
                                    ? 'Select a different field or modify the values below:'
                                    : pendingChain
                                      ? `Select a field to chain with ${pendingChain.logic}:`
                                      : 'Click a field to select it for a condition:'}
                                </p>
                                <SchemaTree
                                  fields={category.fields}
                                  onSelect={handleSelectField}
                                  selectedField={selectedField}
                                  initialExpandedPaths={schemaExpandedPaths}
                                />
                              </div>

                              {/* Condition editor */}
                              {selectedField && (
                                <ConditionEditor
                                  field={selectedField}
                                  operators={operators}
                                  onAdd={handleAddCondition}
                                  onCancel={() => {
                                    setSelectedField(null);
                                    setEditingNodeId(null);
                                  }}
                                  toolPatterns={toolPatterns}
                                  initialCondition={
                                    editingNodeId && localTree
                                      ? (() => {
                                          const node = findNodeById(localTree, editingNodeId);
                                          if (node && isConditionLeaf(node)) {
                                            return {
                                              field: node.field,
                                              operator: node.operator,
                                              value: node.value,
                                              valueRef: node.valueRef,
                                            };
                                          }
                                          return undefined;
                                        })()
                                      : undefined
                                  }
                                  isEditing={editingNodeId !== null}
                                />
                              )}

                              {/* Cancel button when chaining or editing */}
                              {(pendingChain || editingNodeId) && !selectedField && (
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setPendingChain(null);
                                      setEditingNodeId(null);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      {nestedCategoriesQuery.isLoading
                        ? 'Loading schema...'
                        : 'No field schemas available. Select a tool to see available conditions.'}
                    </div>
                  );
                })()}

                {/* Active conditions - chip-based list with AND/OR grouping */}
                {localTree && localTree.children.length > 0 && (
                  <div className="border-t pt-4">
                    <ConditionsChipList
                      tree={localTree}
                      onTreeChange={handleTreeChange}
                      onChainRequest={handleChainRequest}
                      pendingChain={pendingChain}
                      onEditRequest={handleEditRequest}
                      editingNodeId={editingNodeId}
                    />
                  </div>
                )}
              </>
            )}

            {/* Advanced Mode Content */}
            {localMode === 'ADVANCED' && (
              <AdvancedConditionEditor
                value={localExpression}
                onChange={setLocalExpression}
                toolPatterns={toolPatterns}
                onValidationChange={setExpressionHasErrors}
                onValidatingChange={setExpressionValidating}
                onAutocompleteOpenChange={setAutocompleteOpen}
                className="flex-1"
              />
            )}
          </div>

          <DialogFooter className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-xs text-muted-foreground">
                {localMode === 'SIMPLE'
                  ? `${localConditions.length} condition${localConditions.length !== 1 ? 's' : ''}`
                  : localExpression.trim()
                    ? 'Expression defined'
                    : 'No expression'}
              </span>
            </div>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
