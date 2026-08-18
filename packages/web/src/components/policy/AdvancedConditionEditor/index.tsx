/**
 * Advanced Condition Editor
 *
 * A code editor for SQL-like policy condition expressions.
 * Features syntax highlighting, error display, and autocomplete.
 */

import { keepPreviousData } from '@tanstack/react-query';
import { AlertCircle, BookOpen, CheckCircle2, Search } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../../../hooks/PreferencesContext';
import { trpc } from '../../../lib/trpc';
import { cn } from '../../../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { AutocompletePopup } from './AutocompletePopup';
import { ErrorList } from './ErrorList';
import { ExpressionInput } from './ExpressionInput';
import { FunctionHelp } from './FunctionHelp';
import { HoverTooltip } from './HoverTooltip';
import { SchemaReference } from './SchemaReference';
import { SignatureHelp } from './SignatureHelp';

// Known function names for Ctrl+Click detection
const FUNCTION_NAMES = new Set([
  'FLOOR',
  'CEIL',
  'ROUND',
  'ABS',
  'MAX',
  'MIN',
  'SUM',
  'AVG',
  'COUNT',
  'LEN',
  'LOWER',
  'UPPER',
  'TRIM',
  'SUBSTRING',
  'CONCAT',
  'REPLACE',
  'SPLIT',
  'INT',
  'FLOAT',
  'STRING',
  'BOOL',
  'EXISTS',
  'COALESCE',
  'IFNULL',
  'IF',
  'CONTAINS',
  'FIRST',
  'LAST',
]);

// Known namespace names for Ctrl+Click - when clicking on these, show the category, not the full path
const NAMESPACE_NAMES = new Set([
  'TIME',
  'NETWORK',
  'PARAMS',
  'CONTEXT',
  'EXTRACTED',
  // Global variable namespaces are handled dynamically
]);

export interface AdvancedConditionEditorProps {
  value: string;
  onChange: (value: string) => void;
  toolPatterns?: string[];
  disabled?: boolean;
  className?: string;
  /** Callback when validation state changes (true = has errors, false = valid) */
  onValidationChange?: (hasErrors: boolean) => void;
  /** Callback when validation is in progress (debouncing or API call pending) */
  onValidatingChange?: (isValidating: boolean) => void;
  /** Callback when autocomplete popup open state changes */
  onAutocompleteOpenChange?: (isOpen: boolean) => void;
}

interface ParseError {
  message: string;
  code: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export function AdvancedConditionEditor({
  value,
  onChange,
  toolPatterns = [],
  disabled = false,
  className,
  onValidationChange,
  onValidatingChange,
  onAutocompleteOpenChange,
}: AdvancedConditionEditorProps) {
  const { preferences } = usePreferences();
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({ x: 0, y: 0 });
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [cursorOffset, setCursorOffset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState<'schema' | 'functions'>('schema');
  const [highlightedItem, setHighlightedItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoverOffset, setHoverOffset] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse mutation for validation
  const parseMutation = trpc.admin.advancedConditions.parse.useMutation();

  // Use refs for callbacks to avoid effect re-runs when callbacks change
  const callbacksRef = useRef<{
    onValidationChange?: (hasErrors: boolean) => void;
    onValidatingChange?: (isValidating: boolean) => void;
    mutate: typeof parseMutation.mutate;
  }>({
    onValidationChange: undefined,
    onValidatingChange: undefined,
    mutate: parseMutation.mutate,
  });

  // Update ref after render but before other effects
  useLayoutEffect(() => {
    callbacksRef.current = { onValidationChange, onValidatingChange, mutate: parseMutation.mutate };
  });

  // Autocomplete query
  const { data: autocompleteData } = trpc.admin.advancedConditions.autocomplete.useQuery(
    {
      expression: value,
      cursorOffset,
      toolPatterns,
    },
    {
      enabled: showAutocomplete && value.length > 0,
      placeholderData: keepPreviousData, // Keep showing suggestions while refetching
    },
  );

  // Signature help query - shows function parameters when inside parentheses
  const { data: signatureHelpData } = trpc.admin.advancedConditions.signatureHelp.useQuery(
    {
      expression: value,
      cursorOffset,
    },
    {
      enabled: !showAutocomplete && value.length > 0, // Don't show when autocomplete is open
    },
  );

  // Hover query - shows info about symbols when hovering
  const { data: hoverData } = trpc.admin.advancedConditions.hover.useQuery(
    {
      expression: value,
      cursorOffset: hoverOffset ?? 0,
      toolPatterns,
    },
    {
      enabled: hoverOffset !== null && !showAutocomplete && value.length > 0,
    },
  );

  // Notify parent when autocomplete open state changes
  useEffect(() => {
    onAutocompleteOpenChange?.(showAutocomplete);
  }, [showAutocomplete, onAutocompleteOpenChange]);

  // Derived display values - empty value shows no errors
  const isEmptyValue = !value.trim();
  const displayedErrors = isEmptyValue ? [] : errors;
  const displayedIsValid = isEmptyValue ? null : isValid;

  // Debounced validation - all setState calls are inside async callbacks
  useEffect(() => {
    const { onValidationChange, onValidatingChange, mutate } = callbacksRef.current;

    if (!value.trim()) {
      // For empty values, schedule the state clear asynchronously
      const timeoutId = setTimeout(() => {
        setErrors([]);
        setIsValid(null);
        onValidatingChange?.(false);
        onValidationChange?.(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    // Mark as validating immediately when value changes
    onValidatingChange?.(true);

    const timeoutId = setTimeout(() => {
      mutate(
        { expression: value, toolPatterns },
        {
          onSuccess: (result) => {
            setErrors(result.errors);
            setIsValid(result.success);
            callbacksRef.current.onValidatingChange?.(false);
            callbacksRef.current.onValidationChange?.(!result.success);
          },
          onError: () => {
            setIsValid(false);
            callbacksRef.current.onValidatingChange?.(false);
            callbacksRef.current.onValidationChange?.(true);
          },
        },
      );
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value, toolPatterns]);

  // Handle text change
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange],
  );

  // Calculate position from cursor offset
  const getPositionFromOffset = useCallback(
    (offset: number): { x: number; y: number } => {
      const lineHeight = 20;
      const charWidth = 8;
      const padding = 12; // p-3 = 12px
      const lines = value.slice(0, offset).split('\n');
      const currentLine = lines.length - 1;
      const currentColumn = lines[lines.length - 1].length;

      return {
        x: padding + currentColumn * charWidth,
        y: padding + currentLine * lineHeight,
      };
    },
    [value],
  );

  // Handle cursor position change for autocomplete
  const handleCursorChange = useCallback((offset: number) => {
    setCursorOffset(offset);
  }, []);

  // Handle autocomplete trigger
  const handleTriggerAutocomplete = useCallback(
    (x: number, y: number) => {
      if (disabled) return;
      setAutocompletePosition({ x, y });
      setShowAutocomplete(true);
      setAutocompleteIndex(0);
    },
    [disabled],
  );

  // Handle autocomplete close
  const handleCloseAutocomplete = useCallback(() => {
    setShowAutocomplete(false);
  }, []);

  // Handle autocomplete selection
  const handleSelectSuggestion = useCallback(
    (insertText: string) => {
      if (!textareaRef.current) return;

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Find the start of the current word (stop at dot for member access)
      let wordStart = start;
      while (wordStart > 0 && /[a-zA-Z0-9_]/.test(value[wordStart - 1])) {
        wordStart--;
      }

      // Handle $0 cursor placeholder (used for functions)
      const cursorPlaceholderIndex = insertText.indexOf('$0');
      const textToInsert = insertText.replace('$0', '');

      // Insert the suggestion
      const newValue = value.slice(0, wordStart) + textToInsert + value.slice(end);
      onChange(newValue);

      // Calculate new cursor position
      const newCursorOffset =
        cursorPlaceholderIndex >= 0 ? cursorPlaceholderIndex : textToInsert.length;
      const newPosition = wordStart + newCursorOffset;

      // Update cursor offset state to trigger signature help
      setCursorOffset(newPosition);

      // Move cursor to placeholder position or end of inserted text
      setTimeout(() => {
        textarea.setSelectionRange(newPosition, newPosition);
        textarea.focus();
      }, 0);

      setShowAutocomplete(false);
    },
    [value, onChange],
  );

  // Get current suggestions for keyboard handling - memoized to avoid dependency issues
  const suggestions = useMemo(
    () => autocompleteData?.suggestions ?? [],
    [autocompleteData?.suggestions],
  );

  // Handle autocomplete keyboard navigation (called from ExpressionInput)
  const handleAutocompleteKeyDown = useCallback(
    (key: string): boolean => {
      if (!showAutocomplete || suggestions.length === 0) return false;

      switch (key) {
        case 'ArrowDown':
          setAutocompleteIndex((i) => Math.min(i + 1, suggestions.length - 1));
          return true;
        case 'ArrowUp':
          setAutocompleteIndex((i) => Math.max(i - 1, 0));
          return true;
        case 'Enter':
        case 'Tab':
          if (suggestions[autocompleteIndex]) {
            handleSelectSuggestion(suggestions[autocompleteIndex].insertText);
          }
          return true;
        case 'Escape':
          setShowAutocomplete(false);
          return true;
        default:
          return false;
      }
    },
    [showAutocomplete, suggestions, autocompleteIndex, handleSelectSuggestion],
  );

  // Handle click outside to close autocomplete
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle hover with debounce - only show tooltip after hovering still for a while
  const handleHover = useCallback((offset: number, position: { x: number; y: number }) => {
    // Clear existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Clear current hover if mouse moved to different position
    setHoverOffset(null);
    setHoverPosition(null);

    // Only show tooltip after hovering still for 500ms
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverOffset(offset);
      setHoverPosition(position);
    }, 500);
  }, []);

  // Handle hover end
  const handleHoverEnd = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoverOffset(null);
    setHoverPosition(null);
  }, []);

  // Clean up hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Handle Ctrl+Click to show in reference
  const handleCtrlClick = useCallback((word: string, fullPath: string) => {
    const upperWord = word.toUpperCase();

    // Check if it's a function
    if (FUNCTION_NAMES.has(upperWord)) {
      setShowHelp(true);
      setHelpTab('functions');
      setHighlightedItem(upperWord);
      return;
    }

    // Check if it's a namespace (either known or appears to be one)
    // A word is treated as a namespace if:
    // 1. It's in the known namespace list, OR
    // 2. It's all uppercase (like COMPANY, LIMITS, GLOBALS) and is at the start of the path
    const isKnownNamespace = NAMESPACE_NAMES.has(upperWord);
    const isUppercaseNamespace = /^[A-Z][A-Z0-9_]*$/.test(word) && fullPath.startsWith(word + '.');
    const isAtPathStart = fullPath.toLowerCase().startsWith(word.toLowerCase() + '.');

    if (
      isKnownNamespace ||
      isUppercaseNamespace ||
      (isAtPathStart && word === word.toLowerCase())
    ) {
      // It's a namespace - show just the namespace (category header or variables section)
      setShowHelp(true);
      setHelpTab('schema');
      setHighlightedItem(word.toLowerCase());
    } else {
      // It's a field - show schema tab with full path
      setShowHelp(true);
      setHelpTab('schema');
      setHighlightedItem(fullPath.toLowerCase());
    }
  }, []);

  // Handle escape key at container level to prevent modal from closing
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && showAutocomplete) {
        e.preventDefault();
        e.stopPropagation();
        setShowAutocomplete(false);
      }
    },
    [showAutocomplete],
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Header with status and help */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {displayedIsValid === true && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Valid expression
            </span>
          )}
          {displayedIsValid === false && displayedErrors.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3 w-3" />
              {displayedErrors.length} error{displayedErrors.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <BookOpen className="h-3 w-3" />
          Reference
        </button>
      </div>

      {/* Help panel as popup dialog */}
      <Dialog
        open={showHelp}
        onOpenChange={(open) => {
          setShowHelp(open);
          if (!open) setSearchQuery('');
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Expression Reference</DialogTitle>
          </DialogHeader>
          {/* Search input */}
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search fields, variables, functions, syntax..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Tabs
            value={helpTab}
            onValueChange={(v) => setHelpTab(v as 'schema' | 'functions')}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="w-full grid grid-cols-2 shrink-0">
              <TabsTrigger value="schema" className="text-xs">
                Schema &amp; Variables
              </TabsTrigger>
              <TabsTrigger value="functions" className="text-xs">
                Functions &amp; Syntax
              </TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-y-auto mt-3">
              <TabsContent value="schema" className="m-0">
                <SchemaReference
                  toolPatterns={toolPatterns}
                  className="border-0 rounded-none"
                  highlightItem={helpTab === 'schema' ? highlightedItem : null}
                  onHighlightComplete={() => setHighlightedItem(null)}
                  searchQuery={searchQuery}
                />
              </TabsContent>
              <TabsContent value="functions" className="m-0">
                <FunctionHelp
                  className="border-0 rounded-none"
                  highlightItem={helpTab === 'functions' ? highlightedItem : null}
                  onHighlightComplete={() => setHighlightedItem(null)}
                  searchQuery={searchQuery}
                />
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Editor with autocomplete popup */}
      <div
        ref={editorContainerRef}
        className="relative overflow-visible"
        onKeyDown={handleContainerKeyDown}
      >
        <ExpressionInput
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onCursorChange={handleCursorChange}
          onTriggerAutocomplete={handleTriggerAutocomplete}
          onCloseAutocomplete={handleCloseAutocomplete}
          onAutocompleteKeyDown={handleAutocompleteKeyDown}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onCtrlClick={handleCtrlClick}
          errors={displayedErrors}
          disabled={disabled}
          bracketMatchingColors={preferences.bracketMatchingColors ?? true}
        />

        {/* Autocomplete popup - positioned relative to editor */}
        {showAutocomplete && suggestions.length > 0 && (
          <AutocompletePopup
            suggestions={suggestions}
            position={autocompletePosition}
            selectedIndex={autocompleteIndex}
            onSelect={handleSelectSuggestion}
            onHover={setAutocompleteIndex}
          />
        )}

        {/* Signature help - shows when inside a function call */}
        {!showAutocomplete &&
          signatureHelpData?.signatureHelp &&
          (() => {
            const cursorPos = getPositionFromOffset(cursorOffset);
            // Position above the current line
            return (
              <SignatureHelp
                functionName={signatureHelpData.signatureHelp.functionName}
                description={signatureHelpData.signatureHelp.description}
                parameters={signatureHelpData.signatureHelp.parameters}
                activeParameter={signatureHelpData.signatureHelp.activeParameter}
                returnType={signatureHelpData.signatureHelp.returnType}
                position={{ x: Math.max(12, cursorPos.x - 50), y: cursorPos.y + 24 }}
              />
            );
          })()}

        {/* Hover tooltip - shows when hovering over a symbol */}
        {!showAutocomplete &&
          !signatureHelpData?.signatureHelp &&
          hoverData?.hover &&
          hoverPosition && (
            <HoverTooltip
              label={hoverData.hover.label}
              description={hoverData.hover.description}
              type={hoverData.hover.type}
              kind={hoverData.hover.kind}
              position={hoverPosition}
              containerRef={editorContainerRef}
            />
          )}
      </div>

      {/* Error list */}
      {displayedErrors.length > 0 && <ErrorList errors={displayedErrors} className="mt-2" />}
    </div>
  );
}
