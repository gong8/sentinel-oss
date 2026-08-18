/**
 * Schema Reference Panel
 *
 * Shows available fields, global variables, and their types for reference
 * when writing advanced condition expressions.
 */

import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { trpc } from '../../../lib/trpc';
import { cn } from '../../../lib/utils';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

interface SchemaReferenceProps {
  toolPatterns: string[];
  className?: string;
  highlightItem?: string | null;
  onHighlightComplete?: () => void;
  searchQuery?: string;
}

interface NestedFieldSchema {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';
  description?: string;
  enum?: string[];
  children?: NestedFieldSchema[];
  items?: NestedFieldSchema;
}

interface CategoryOption {
  name: string;
  label: string;
  fields: NestedFieldSchema[];
}

interface GlobalVariableField {
  id: string;
  name: string;
  description: string | null;
  fieldType: string;
  fullPath: string;
  value: unknown;
}

interface GlobalVariableNamespace {
  id: string;
  name: string;
  description: string | null;
  fields: GlobalVariableField[];
}

// Field type to expression type mapping
function getExpressionType(type: string): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'any';
  }
}

// Get badge variant based on type
function getTypeBadgeVariant(type: string): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'string':
      return 'default';
    case 'number':
      return 'secondary';
    case 'boolean':
      return 'outline';
    default:
      return 'secondary';
  }
}

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, copyToClipboard] = useCopyToClipboard(1500);

  async function handleCopy(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    await copyToClipboard(text);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-0.5 rounded hover:bg-muted transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
      )}
    </button>
  );
}

// Helper to register field refs without triggering immutability lint
function registerFieldRef(
  refs: Record<string, HTMLDivElement | null>,
  path: string,
  el: HTMLDivElement | null,
) {
  refs[path] = el;
}

// Recursive field node component
function FieldNode({
  field,
  depth = 0,
  expandedPaths,
  onToggleExpand,
  highlightedField,
  fieldRefs,
}: {
  field: NestedFieldSchema;
  depth?: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  highlightedField?: string | null;
  fieldRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const isExpanded = expandedPaths.has(field.name);
  const hasChildren = (field.children && field.children.length > 0) || field.items;
  const paddingLeft = depth * 16 + 8;

  // Handle special cases for time/network - use lowercase to match params style
  const displayPath = field.name.startsWith('context.')
    ? field.name.replace('context.', field.name.includes('sourceIp') ? 'network.' : 'time.')
    : field.name;

  const isHighlighted = highlightedField === displayPath;

  return (
    <div ref={fieldRefs ? (el) => registerFieldRef(fieldRefs.current, displayPath, el) : undefined}>
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded-md text-xs transition-colors duration-300',
          hasChildren && 'cursor-pointer hover:bg-muted',
          isHighlighted && 'bg-yellow-100 dark:bg-yellow-900/50',
        )}
        style={{ paddingLeft }}
        onClick={() => hasChildren && onToggleExpand(field.name)}
      >
        {/* Expand/collapse icon */}
        <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )
          ) : (
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
          )}
        </span>

        {/* Field path */}
        <code className="font-mono text-foreground flex-1 truncate">{displayPath}</code>

        {/* Copy button */}
        <CopyButton text={displayPath} />

        {/* Type badge */}
        <Badge variant={getTypeBadgeVariant(field.type)} className="text-[9px] px-1 py-0 h-4">
          {getExpressionType(field.type)}
        </Badge>
      </div>

      {/* Description */}
      {field.description && (
        <div
          className="text-[10px] text-muted-foreground pl-6 pr-2 pb-1"
          style={{ paddingLeft: paddingLeft + 16 }}
        >
          {field.description}
          {field.enum && (
            <span className="ml-1 text-muted-foreground">
              ({field.enum.slice(0, 3).join(', ')}
              {field.enum.length > 3 && '...'})
            </span>
          )}
        </div>
      )}

      {/* Children for objects */}
      {isExpanded && field.children && (
        <div>
          {field.children.map((child) => (
            <FieldNode
              key={child.name}
              field={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              highlightedField={highlightedField}
              fieldRefs={fieldRefs}
            />
          ))}
        </div>
      )}

      {/* Array items */}
      {isExpanded && field.items && (
        <FieldNode
          field={field.items}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          onToggleExpand={onToggleExpand}
          highlightedField={highlightedField}
          fieldRefs={fieldRefs}
        />
      )}
    </div>
  );
}

// Category section component
function CategorySection({
  category,
  expandedPaths,
  onToggleExpand,
  forceOpen,
  highlightHeader,
  highlightedField,
  fieldRefs,
  categoryRef,
}: {
  category: CategoryOption;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  forceOpen?: boolean;
  highlightHeader?: boolean;
  highlightedField?: string | null;
  fieldRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  categoryRef?: (el: HTMLDivElement | null) => void;
}) {
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const [prevForceOpen, setPrevForceOpen] = useState(false);

  // Derived state: when forceOpen transitions from false to true, latch open
  if (forceOpen && !prevForceOpen) {
    setPrevForceOpen(true);
    setIsManuallyOpen(true);
  } else if (!forceOpen && prevForceOpen) {
    setPrevForceOpen(false);
  }

  const isOpen = forceOpen || isManuallyOpen;
  const setIsOpen = setIsManuallyOpen;

  return (
    <div ref={categoryRef} className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-300',
          highlightHeader ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'bg-muted hover:bg-muted',
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="font-medium text-xs text-foreground">{category.label}</span>
        <span className="text-[10px] text-muted-foreground">({category.fields.length})</span>
      </button>
      {isOpen && (
        <div className="p-1 bg-background">
          {category.fields.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2 px-3">
              No fields available
            </div>
          ) : (
            category.fields.map((field) => (
              <FieldNode
                key={field.name}
                field={field}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                highlightedField={highlightedField}
                fieldRefs={fieldRefs}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Namespace section component for global variables
function NamespaceSection({
  namespace,
  forceOpen,
  highlightHeader,
  highlightedField,
  fieldRefs,
  namespaceRef,
}: {
  namespace: GlobalVariableNamespace;
  forceOpen?: boolean;
  highlightHeader?: boolean;
  highlightedField?: string | null;
  fieldRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  namespaceRef?: (el: HTMLDivElement | null) => void;
}) {
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const [prevForceOpen, setPrevForceOpen] = useState(false);

  // Derived state: when forceOpen transitions from false to true, latch open
  if (forceOpen && !prevForceOpen) {
    setPrevForceOpen(true);
    setIsManuallyOpen(true);
  } else if (!forceOpen && prevForceOpen) {
    setPrevForceOpen(false);
  }

  const isOpen = forceOpen || isManuallyOpen;
  const setIsOpen = setIsManuallyOpen;

  return (
    <div ref={namespaceRef} className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-300',
          highlightHeader ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'bg-muted hover:bg-muted',
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="font-medium text-xs text-foreground">{namespace.name}</span>
        {namespace.description && (
          <span className="text-[10px] text-muted-foreground truncate flex-1">
            {namespace.description}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">({namespace.fields.length})</span>
      </button>
      {isOpen && (
        <div className="p-1 bg-background">
          {namespace.fields.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2 px-3">No fields defined</div>
          ) : (
            namespace.fields.map((field) => {
              const isHighlighted = highlightedField === field.fullPath.toLowerCase();
              return (
                <div
                  key={field.id}
                  ref={
                    fieldRefs
                      ? (el) =>
                          registerFieldRef(fieldRefs.current, field.fullPath.toLowerCase(), el)
                      : undefined
                  }
                  className={cn(
                    'flex items-center gap-2 py-1 px-2 text-xs rounded transition-colors duration-300',
                    isHighlighted && 'bg-yellow-100 dark:bg-yellow-900/50',
                  )}
                >
                  <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                  </span>
                  <code className="font-mono text-foreground flex-1 truncate">
                    {field.fullPath}
                  </code>
                  <CopyButton text={field.fullPath} />
                  <Badge
                    variant={getTypeBadgeVariant(mapGlobalVarType(field.fieldType))}
                    className="text-[9px] px-1 py-0 h-4"
                  >
                    {mapGlobalVarType(field.fieldType)}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Global variable field type mapping
function mapGlobalVarType(fieldType: string): string {
  switch (fieldType) {
    case 'STRING':
      return 'string';
    case 'NUMBER':
      return 'number';
    case 'BOOLEAN':
      return 'boolean';
    case 'DATE':
      return 'date';
    case 'STRING_ARRAY':
      return 'string[]';
    case 'NUMBER_ARRAY':
      return 'number[]';
    default:
      return 'any';
  }
}

// Helper to find a field in schema and return the path of nodes that need to be expanded
function findFieldInSchema(
  fields: NestedFieldSchema[],
  targetPath: string,
  pathSoFar: string[] = [],
): { found: boolean; pathToExpand: string[]; displayPath: string } {
  const targetLower = targetPath.toLowerCase();
  for (const field of fields) {
    // Check the display path (with time./network. transformation)
    const displayPath = field.name.startsWith('context.')
      ? field.name.replace('context.', field.name.includes('sourceIp') ? 'network.' : 'time.')
      : field.name;

    // Case-insensitive comparison since highlightItem is lowercased
    if (displayPath.toLowerCase() === targetLower) {
      return { found: true, pathToExpand: pathSoFar, displayPath };
    }

    // Check children - add current field to path if it has nested fields
    if (field.children && field.children.length > 0) {
      const result = findFieldInSchema(field.children, targetPath, [...pathSoFar, field.name]);
      if (result.found) return result;
    }
    if (field.items) {
      const result = findFieldInSchema([field.items], targetPath, [...pathSoFar, field.name]);
      if (result.found) return result;
    }
  }
  return { found: false, pathToExpand: [], displayPath: '' };
}

// Helper to filter fields recursively based on search query
function filterFields(fields: NestedFieldSchema[], searchLower: string): NestedFieldSchema[] {
  const result: NestedFieldSchema[] = [];
  for (const field of fields) {
    const displayPath = field.name.startsWith('context.')
      ? field.name.replace('context.', field.name.includes('sourceIp') ? 'network.' : 'time.')
      : field.name;
    const matchesSelf =
      displayPath.toLowerCase().includes(searchLower) ||
      field.label.toLowerCase().includes(searchLower) ||
      (field.description?.toLowerCase().includes(searchLower) ?? false);

    // Check children
    const filteredChildren = field.children ? filterFields(field.children, searchLower) : undefined;
    const filteredItems = field.items ? filterFields([field.items], searchLower)[0] : undefined;

    // Include if matches self or has matching children
    if (matchesSelf || (filteredChildren && filteredChildren.length > 0) || filteredItems) {
      result.push({
        ...field,
        children: filteredChildren,
        items: filteredItems,
      });
    }
  }
  return result;
}

export function SchemaReference({
  toolPatterns,
  className,
  highlightItem,
  onHighlightComplete,
  searchQuery = '',
}: SchemaReferenceProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('fields');
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [highlightedCategory, setHighlightedCategory] = useState<string | null>(null);
  const [highlightedNamespace, setHighlightedNamespace] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const namespaceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prevHighlightItem, setPrevHighlightItem] = useState<string | null>(null);

  const searchLower = searchQuery.toLowerCase().trim();

  // Clear state when highlightItem changes (derived state pattern)
  if (highlightItem !== prevHighlightItem) {
    setPrevHighlightItem(highlightItem ?? null);
    // Clear any previous highlight state
    setHighlightedField(null);
    setHighlightedCategory(null);
    setHighlightedNamespace(null);
    setExpandedCategory(null);
  }

  // Fetch nested categories
  const categoriesQuery = trpc.admin.conditions.getNestedCategories.useQuery(
    { toolPatterns },
    { staleTime: 30000 },
  );

  // Fetch global variables
  const globalVarsQuery = trpc.admin.globalVariables.listVariablesForConditionBuilder.useQuery(
    undefined,
    { staleTime: 30000 },
  );

  const categories = useMemo(() => {
    return (categoriesQuery.data?.categories ?? []) as CategoryOption[];
  }, [categoriesQuery.data]);

  const globalVariablesData = globalVarsQuery.data as GlobalVariableNamespace[] | undefined;
  const globalVariables = useMemo((): GlobalVariableNamespace[] => {
    return globalVariablesData ?? [];
  }, [globalVariablesData]);

  // Filter categories based on search query
  // If category name/label matches, show the whole category with all fields
  const filteredCategories = useMemo(() => {
    if (!searchLower) return categories;
    return categories
      .map((cat) => {
        const categoryMatches =
          cat.name.toLowerCase().includes(searchLower) ||
          cat.label.toLowerCase().includes(searchLower);
        // If category name matches, show all fields; otherwise filter fields
        return {
          ...cat,
          fields: categoryMatches ? cat.fields : filterFields(cat.fields, searchLower),
          _categoryMatches: categoryMatches, // Track if category itself matched
        };
      })
      .filter((cat) => cat.fields.length > 0 || cat._categoryMatches);
  }, [categories, searchLower]);

  // Filter global variables based on search query
  // If namespace name matches, show all fields in that namespace
  const filteredGlobalVariables = useMemo(() => {
    if (!searchLower) return globalVariables;
    return globalVariables
      .map((ns) => {
        const namespaceMatches =
          ns.name.toLowerCase().includes(searchLower) ||
          (ns.description?.toLowerCase().includes(searchLower) ?? false);
        return {
          ...ns,
          // If namespace matches, show all fields; otherwise filter fields
          fields: namespaceMatches
            ? ns.fields
            : ns.fields.filter(
                (field) =>
                  field.fullPath.toLowerCase().includes(searchLower) ||
                  field.name.toLowerCase().includes(searchLower) ||
                  (field.description?.toLowerCase().includes(searchLower) ?? false),
              ),
          _namespaceMatches: namespaceMatches,
        };
      })
      .filter((ns) => ns.fields.length > 0 || ns._namespaceMatches);
  }, [globalVariables, searchLower]);

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Handle highlight item changes
  useEffect(() => {
    if (!highlightItem) return;

    // Don't process if categories haven't loaded yet - effect will re-run when they load
    if (categories.length === 0) return;

    // Cancel any previous timeouts
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }

    // Defer state updates to next microtask to avoid cascading renders
    queueMicrotask(() => {
      // Check if component is still interested in this highlight
      if (!highlightItem) return;

      const highlightLower = highlightItem.toLowerCase();
      const namespace = highlightLower.split('.')[0];
      const hasDot = highlightItem.includes('.');

      // Check if it's a global variable (with or without dot)
      const globalNs = globalVariables.find((ns) => ns.name.toLowerCase() === namespace);
      if (globalNs) {
        setActiveTab('variables');
        if (hasDot) {
          // Specific field - highlight it
          setHighlightedField(highlightItem);
          highlightTimeoutRef.current = setTimeout(() => {
            const el = fieldRefs.current[highlightItem];
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            clearTimeoutRef.current = setTimeout(() => {
              setHighlightedField(null);
              onHighlightComplete?.();
            }, 2000);
          }, 200);
        } else {
          // Just namespace - highlight and scroll to the namespace section header
          setHighlightedNamespace(globalNs.name.toLowerCase());
          highlightTimeoutRef.current = setTimeout(() => {
            const el = namespaceRefs.current[globalNs.name.toLowerCase()];
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            clearTimeoutRef.current = setTimeout(() => {
              setHighlightedNamespace(null);
              onHighlightComplete?.();
            }, 2000);
          }, 200);
        }
        return;
      }

      // Map namespace prefixes to category names (must match actual category.name from API, not label)
      const namespaceToCategory: Record<string, string> = {
        params: 'parameters',
        time: 'time',
        network: 'network',
        extracted: 'extracted.sql',
      };

      // Helper to highlight a category
      const highlightCategoryByName = (categoryName: string) => {
        const cat = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
        if (cat) {
          setExpandedCategory(cat.name);
          setHighlightedCategory(cat.name);
          highlightTimeoutRef.current = setTimeout(() => {
            const el = categoryRefs.current[cat.name];
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            clearTimeoutRef.current = setTimeout(() => {
              setHighlightedCategory(null);
              setExpandedCategory(null);
              onHighlightComplete?.();
            }, 2000);
          }, 200);
          return true;
        }
        return false;
      };

      setActiveTab('fields');

      // If clicking on just a namespace name (no dot), highlight the category directly
      if (!hasDot) {
        const mappedCategoryName = namespaceToCategory[namespace];
        if (mappedCategoryName && highlightCategoryByName(mappedCategoryName)) {
          return;
        }
        // Fallback: find category by field prefix
        const matchingCategory = categories.find((cat) =>
          cat.fields.some((field) => {
            const displayPath = field.name.startsWith('context.')
              ? field.name.replace(
                  'context.',
                  field.name.includes('sourceIp') ? 'network.' : 'time.',
                )
              : field.name;
            return displayPath.toLowerCase().startsWith(namespace + '.');
          }),
        );
        if (matchingCategory && highlightCategoryByName(matchingCategory.name)) {
          return;
        }
      }

      // Has a dot - try to find the specific field
      if (!hasDot) {
        // No dot and no matching category found - nothing to highlight
        onHighlightComplete?.();
        return;
      }

      for (const category of categories) {
        const result = findFieldInSchema(category.fields, highlightItem);
        if (result.found) {
          setExpandedCategory(category.name);
          setHighlightedField(result.displayPath);

          // Expand all parent paths to make the field visible
          if (result.pathToExpand.length > 0) {
            setExpandedPaths((prev) => {
              const next = new Set(prev);
              for (const path of result.pathToExpand) {
                next.add(path);
              }
              return next;
            });
          }

          // Wait for category + nested expansions to render, then scroll
          highlightTimeoutRef.current = setTimeout(() => {
            const el = fieldRefs.current[result.displayPath];
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            clearTimeoutRef.current = setTimeout(() => {
              setHighlightedField(null);
              setExpandedCategory(null);
              onHighlightComplete?.();
            }, 2000);
          }, 350);
          return;
        }
      }

      // Field not found - try to highlight category based on namespace
      const mappedCategoryName = namespaceToCategory[namespace];
      if (mappedCategoryName && highlightCategoryByName(mappedCategoryName)) {
        return;
      }

      // Nothing found, complete
      onHighlightComplete?.();
    });
  }, [highlightItem, onHighlightComplete, globalVariables, categories]);

  const isLoading = categoriesQuery.isLoading || globalVarsQuery.isLoading;

  return (
    <div className={cn('bg-muted rounded-lg border border-border p-3', className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 h-8">
          <TabsTrigger value="fields" className="text-xs">
            Fields
          </TabsTrigger>
          <TabsTrigger value="variables" className="text-xs">
            Variables
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="mt-3 space-y-2">
          {isLoading ? (
            <div className="text-xs text-muted-foreground text-center py-4">Loading schema...</div>
          ) : categories.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              Select a tool to see available fields
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              No fields found for &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            filteredCategories.map((category) => (
              <CategorySection
                key={category.name}
                category={category}
                expandedPaths={expandedPaths}
                onToggleExpand={toggleExpand}
                forceOpen={expandedCategory === category.name || !!searchLower}
                highlightHeader={highlightedCategory === category.name}
                highlightedField={highlightedField}
                fieldRefs={fieldRefs}
                categoryRef={(el) => {
                  categoryRefs.current[category.name] = el;
                }}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="variables" className="mt-3">
          {isLoading ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              Loading variables...
            </div>
          ) : globalVariables.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              <p>No global variables defined.</p>
              <p className="mt-1 text-[10px]">
                Create variables in Settings &gt; Variables to use them in expressions.
              </p>
            </div>
          ) : filteredGlobalVariables.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              No variables found for &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGlobalVariables.map((ns) => (
                <NamespaceSection
                  key={ns.id}
                  namespace={ns}
                  forceOpen={highlightedNamespace === ns.name.toLowerCase() || !!searchLower}
                  highlightHeader={highlightedNamespace === ns.name.toLowerCase()}
                  highlightedField={highlightedField}
                  fieldRefs={fieldRefs}
                  namespaceRef={(el) => {
                    namespaceRefs.current[ns.name.toLowerCase()] = el;
                  }}
                />
              ))}

              {/* Usage hint - only show when not searching */}
              {!searchLower && (
                <div className="p-2 bg-muted rounded text-[10px] text-muted-foreground">
                  <div className="font-medium mb-1">Usage:</div>
                  <div>
                    Reference variables directly by their path:{' '}
                    <code className="text-blue-600 dark:text-blue-400">NAMESPACE.fieldName</code>
                  </div>
                  <div className="mt-1">
                    Example:{' '}
                    <code className="text-blue-600 dark:text-blue-400">
                      params.amount &lt;= LIMITS.maxAmount
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
