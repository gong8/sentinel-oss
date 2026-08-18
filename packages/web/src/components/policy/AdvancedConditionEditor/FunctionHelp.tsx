/**
 * Function Help
 *
 * Displays help information for available functions and syntax.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';

interface FunctionHelpProps {
  className?: string;
  highlightItem?: string | null;
  onHighlightComplete?: () => void;
  searchQuery?: string;
}

interface FunctionDoc {
  name: string;
  description: string;
  signature: string;
  category: string;
}

// Function documentation grouped by category
const FUNCTIONS: Record<string, FunctionDoc[]> = {
  'Number Functions': [
    {
      name: 'FLOOR',
      description: 'Round down to nearest integer',
      signature: 'FLOOR(value)',
      category: 'Number',
    },
    {
      name: 'CEIL',
      description: 'Round up to nearest integer',
      signature: 'CEIL(value)',
      category: 'Number',
    },
    {
      name: 'ROUND',
      description: 'Round to nearest integer or decimal places',
      signature: 'ROUND(value, decimals?)',
      category: 'Number',
    },
    { name: 'ABS', description: 'Absolute value', signature: 'ABS(value)', category: 'Number' },
  ],
  'Aggregate Functions': [
    {
      name: 'MAX',
      description: 'Maximum value',
      signature: 'MAX(values...)',
      category: 'Aggregate',
    },
    {
      name: 'MIN',
      description: 'Minimum value',
      signature: 'MIN(values...)',
      category: 'Aggregate',
    },
    {
      name: 'SUM',
      description: 'Sum of values',
      signature: 'SUM(values...)',
      category: 'Aggregate',
    },
    {
      name: 'AVG',
      description: 'Average of values',
      signature: 'AVG(values...)',
      category: 'Aggregate',
    },
    {
      name: 'COUNT',
      description: 'Count of array elements',
      signature: 'COUNT(array)',
      category: 'Aggregate',
    },
    {
      name: 'LEN',
      description: 'Length of string or array',
      signature: 'LEN(value)',
      category: 'Aggregate',
    },
  ],
  'String Functions': [
    {
      name: 'LOWER',
      description: 'Convert to lowercase',
      signature: 'LOWER(value)',
      category: 'String',
    },
    {
      name: 'UPPER',
      description: 'Convert to uppercase',
      signature: 'UPPER(value)',
      category: 'String',
    },
    {
      name: 'TRIM',
      description: 'Remove whitespace',
      signature: 'TRIM(value)',
      category: 'String',
    },
    {
      name: 'SUBSTRING',
      description: 'Extract substring (1-indexed)',
      signature: 'SUBSTRING(value, start, length?)',
      category: 'String',
    },
    {
      name: 'CONCAT',
      description: 'Concatenate strings',
      signature: 'CONCAT(values...)',
      category: 'String',
    },
    {
      name: 'REPLACE',
      description: 'Replace text',
      signature: 'REPLACE(value, search, replacement)',
      category: 'String',
    },
    {
      name: 'SPLIT',
      description: 'Split string into array',
      signature: 'SPLIT(value, delimiter)',
      category: 'String',
    },
  ],
  'Type Conversion': [
    {
      name: 'NUMBER',
      description: 'Convert string to number, with optional default',
      signature: 'NUMBER(value, default?)',
      category: 'Conversion',
    },
    {
      name: 'STRING',
      description: 'Convert to string',
      signature: 'STRING(value)',
      category: 'Conversion',
    },
    {
      name: 'BOOL',
      description: 'Convert to boolean',
      signature: 'BOOL(value)',
      category: 'Conversion',
    },
  ],
  'Existence/Null': [
    {
      name: 'EXISTS',
      description: 'Check if value exists',
      signature: 'EXISTS(value)',
      category: 'Existence',
    },
    {
      name: 'COALESCE',
      description: 'Return first non-null value',
      signature: 'COALESCE(values...)',
      category: 'Existence',
    },
    {
      name: 'IFNULL',
      description: 'Return default if null',
      signature: 'IFNULL(value, default)',
      category: 'Existence',
    },
  ],
  Conditional: [
    {
      name: 'IF',
      description: 'Conditional expression',
      signature: 'IF(condition, thenValue, elseValue)',
      category: 'Conditional',
    },
  ],
  'Array Functions': [
    {
      name: 'CONTAINS',
      description: 'Check if array contains value',
      signature: 'CONTAINS(array, value)',
      category: 'Array',
    },
    {
      name: 'FIRST',
      description: 'Get first element',
      signature: 'FIRST(array)',
      category: 'Array',
    },
    { name: 'LAST', description: 'Get last element', signature: 'LAST(array)', category: 'Array' },
  ],
};

// Syntax examples
const SYNTAX_EXAMPLES = [
  { label: 'Comparison', example: 'params.amount > 100' },
  { label: 'String match', example: "params.name LIKE '%john%'" },
  { label: 'Regex match', example: "params.email MATCHES '^[a-z]+@company\\.com$'" },
  { label: 'List check', example: "params.status IN ['active', 'pending']" },
  { label: 'Existence', example: 'EXISTS(params.email)' },
  { label: 'Logical AND', example: '(params.amount > 100) AND (params.approved = true)' },
  { label: 'Logical OR', example: '(params.role = "admin") OR (params.role = "manager")' },
  { label: 'Global variable', example: 'params.amount <= LIMITS.maxAmount' },
  { label: 'Time check', example: '(time.hourOfDay >= 9) AND (time.hourOfDay < 17)' },
  { label: 'Day of week', example: 'time.dayOfWeek IN [1, 2, 3, 4, 5]' },
  { label: 'Network check', example: "network.sourceIp LIKE '192.168.%'" },
  {
    label: 'WHERE clause',
    example: '(amount > threshold) WHERE threshold = params.basePrice * 1.5',
  },
  { label: 'Aggregate', example: 'SUM(params.items.price) <= MAX(100, LIMITS.maxTotal)' },
];

export function FunctionHelp({
  className,
  highlightItem,
  onHighlightComplete,
  searchQuery = '',
}: FunctionHelpProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [highlightedFn, setHighlightedFn] = useState<string | null>(null);
  const functionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [prevHighlightItem, setPrevHighlightItem] = useState<string | null>(null);
  const [prevSearchLower, setPrevSearchLower] = useState<string>('');

  const searchLower = searchQuery.toLowerCase().trim();

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Filter functions based on search query
  // If category name matches, show all functions in that category
  const filteredFunctions = useMemo(() => {
    if (!searchLower) return FUNCTIONS;
    const result: Record<string, FunctionDoc[]> = {};
    for (const [category, functions] of Object.entries(FUNCTIONS)) {
      const categoryMatches = category.toLowerCase().includes(searchLower);
      // If category matches, include all functions; otherwise filter
      if (categoryMatches) {
        result[category] = functions;
      } else {
        const filtered = functions.filter(
          (fn) =>
            fn.name.toLowerCase().includes(searchLower) ||
            fn.description.toLowerCase().includes(searchLower) ||
            fn.signature.toLowerCase().includes(searchLower),
        );
        if (filtered.length > 0) {
          result[category] = filtered;
        }
      }
    }
    return result;
  }, [searchLower]);

  // Filter syntax examples based on search query
  const filteredSyntaxExamples = useMemo(() => {
    if (!searchLower) return SYNTAX_EXAMPLES;
    return SYNTAX_EXAMPLES.filter(
      (ex) =>
        ex.label.toLowerCase().includes(searchLower) ||
        ex.example.toLowerCase().includes(searchLower),
    );
  }, [searchLower]);

  // Filter operators based on search query
  const filteredOperators = useMemo(() => {
    const operators = [
      { label: '=', desc: 'Equal' },
      { label: '!=', desc: 'Not equal' },
      { label: '<', desc: 'Less than' },
      { label: '<=', desc: 'Less or equal' },
      { label: '>', desc: 'Greater than' },
      { label: '>=', desc: 'Greater or equal' },
      { label: 'AND', desc: 'Logical AND' },
      { label: 'OR', desc: 'Logical OR' },
      { label: 'NOT', desc: 'Logical NOT' },
      { label: 'LIKE', desc: 'SQL pattern match (% = any, _ = one char)' },
      { label: 'MATCHES', desc: 'Regex match' },
      { label: 'IN', desc: 'List membership' },
    ];
    if (!searchLower) return operators;
    return operators.filter(
      (op) =>
        op.label.toLowerCase().includes(searchLower) || op.desc.toLowerCase().includes(searchLower),
    );
  }, [searchLower]);

  // Expand all categories when search query changes (derived state pattern)
  if (searchLower && searchLower !== prevSearchLower) {
    setPrevSearchLower(searchLower);
    setExpandedCategories(new Set(Object.keys(filteredFunctions)));
  } else if (!searchLower && prevSearchLower) {
    setPrevSearchLower('');
  }

  // Find the category containing the highlight item
  const highlightCategory = useMemo(() => {
    if (!highlightItem) return null;
    for (const [category, functions] of Object.entries(FUNCTIONS)) {
      if (functions.find((f) => f.name === highlightItem)) {
        return category;
      }
    }
    return null;
  }, [highlightItem]);

  // Derived state update when highlightItem changes (React pattern for getDerivedStateFromProps)
  if (highlightItem && highlightItem !== prevHighlightItem && highlightCategory) {
    setPrevHighlightItem(highlightItem);
    setExpandedCategories((prev) => new Set([...prev, highlightCategory]));
    setHighlightedFn(highlightItem);
  } else if (!highlightItem && prevHighlightItem) {
    setPrevHighlightItem(null);
  }

  // Handle scroll and clear highlight (async parts only)
  useEffect(() => {
    if (!highlightItem || !highlightCategory) {
      onHighlightComplete?.();
      return;
    }

    // Scroll to the function after delay for expansion and render
    const scrollTimeout = setTimeout(() => {
      const el = functionRefs.current[highlightItem];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after animation
      setTimeout(() => {
        setHighlightedFn(null);
        onHighlightComplete?.();
      }, 2000);
    }, 200);

    return () => clearTimeout(scrollTimeout);
  }, [highlightItem, highlightCategory, onHighlightComplete]);

  const hasFilteredContent =
    Object.keys(filteredFunctions).length > 0 ||
    filteredOperators.length > 0 ||
    filteredSyntaxExamples.length > 0;

  return (
    <div className={cn('bg-muted rounded-lg border border-border p-3 text-sm', className)}>
      {searchLower && !hasFilteredContent ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No results found for &ldquo;{searchQuery}&rdquo;
        </div>
      ) : (
        <>
          {/* Operators */}
          {filteredOperators.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-foreground mb-2">Operators</h4>
              <div className="flex flex-wrap gap-2">
                {filteredOperators.map((op) => (
                  <Operator key={op.label} label={op.label} desc={op.desc} />
                ))}
              </div>
            </div>
          )}

          {/* Functions by category */}
          {Object.keys(filteredFunctions).length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-foreground mb-2">Functions</h4>
              <div className="space-y-1">
                {Object.entries(filteredFunctions).map(([category, functions]) => (
                  <div key={category} className="border border-border rounded bg-card">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                    >
                      {expandedCategories.has(category) ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="font-medium text-xs text-foreground">{category}</span>
                      <span className="text-muted-foreground text-xs">({functions.length})</span>
                    </button>
                    {expandedCategories.has(category) && (
                      <div className="border-t border-border px-2 py-1 space-y-1">
                        {functions.map((fn) => (
                          <div
                            key={fn.name}
                            ref={(el) => {
                              functionRefs.current[fn.name] = el;
                            }}
                            className={cn(
                              'flex items-start gap-2 px-1 py-0.5 rounded transition-colors duration-300',
                              highlightedFn === fn.name && 'bg-yellow-100 dark:bg-yellow-900/50',
                            )}
                          >
                            <code className="font-mono text-xs text-blue-600 dark:text-blue-400 w-48 flex-shrink-0">
                              {fn.signature}
                            </code>
                            <span className="text-xs text-muted-foreground">{fn.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Syntax Examples - moved below functions */}
          {filteredSyntaxExamples.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-foreground mb-2">Syntax Examples</h4>
              <div className="grid gap-1">
                {filteredSyntaxExamples.map((ex) => (
                  <div key={ex.label} className="flex items-start gap-2">
                    <span className="text-muted-foreground w-24 flex-shrink-0 text-xs">
                      {ex.label}:
                    </span>
                    <code className="font-mono text-xs bg-card px-1 py-0.5 rounded border border-border text-foreground">
                      {ex.example}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Important note - only show when not searching */}
          {!searchLower && (
            <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> Mixing AND/OR without parentheses is not allowed. Use{' '}
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
                ((A AND B) OR C)
              </code>{' '}
              instead of{' '}
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">A AND B OR C</code>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Operator({ label, desc }: { label: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <code className="font-mono bg-card px-1 py-0.5 rounded border border-border text-foreground">
        {label}
      </code>
      <span className="text-muted-foreground">{desc}</span>
    </span>
  );
}
