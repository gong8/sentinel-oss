/**
 * Expression Input
 *
 * A styled textarea for entering condition expressions.
 * Shows inline error highlighting and handles keyboard shortcuts.
 */

import { forwardRef, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../../lib/utils';

interface ParseError {
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  onCursorChange: (offset: number) => void;
  onTriggerAutocomplete: (x: number, y: number) => void;
  onCloseAutocomplete: () => void;
  onAutocompleteKeyDown: (key: string) => boolean;
  onHover?: (offset: number, position: { x: number; y: number }) => void;
  onHoverEnd?: () => void;
  onCtrlClick?: (word: string, fullPath: string) => void;
  errors: ParseError[];
  disabled?: boolean;
  /** Enable colored bracket matching for nested brackets */
  bracketMatchingColors?: boolean;
}

// Known namespaces that support member access autocomplete
const KNOWN_NAMESPACES = ['PARAMS', 'CONTEXT', 'TIME', 'NETWORK', 'COMPANY', 'LIMITS', 'GLOBALS'];

/**
 * Check if cursor position is inside a string literal
 * Handles both single and double quotes, including escaped quotes
 */
function isInsideString(text: string, cursorPos: number): boolean {
  let inString: '"' | "'" | null = null;

  for (let i = 0; i < cursorPos; i++) {
    const char = text[i];

    // Check for escape sequences
    if (char === '\\' && i + 1 < cursorPos) {
      i++; // Skip the escaped character
      continue;
    }

    if (char === '"' || char === "'") {
      if (inString === null) {
        inString = char;
      } else if (inString === char) {
        inString = null;
      }
    }
  }

  return inString !== null;
}

/**
 * Get the word and full path at a given offset in text
 */
function getWordAtOffset(text: string, offset: number): { word: string; fullPath: string } | null {
  // Only get word if on a word character
  const charAtOffset = text[offset];
  if (!charAtOffset || !/[a-zA-Z0-9_]/.test(charAtOffset)) {
    return null;
  }

  // Find word boundaries
  let start = offset;
  let end = offset;

  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) {
    start--;
  }
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) {
    end++;
  }

  const word = text.slice(start, end);
  if (!word) return null;

  // Expand to get full path (namespace.field pattern)
  let pathStart = start;
  while (pathStart > 0) {
    const prev = text[pathStart - 1];
    if (prev === '.') {
      pathStart--;
      while (pathStart > 0 && /[a-zA-Z0-9_]/.test(text[pathStart - 1])) {
        pathStart--;
      }
    } else {
      break;
    }
  }

  let pathEnd = end;
  while (pathEnd < text.length) {
    const next = text[pathEnd];
    if (next === '.') {
      pathEnd++;
      while (pathEnd < text.length && /[a-zA-Z0-9_]/.test(text[pathEnd])) {
        pathEnd++;
      }
    } else {
      break;
    }
  }

  const fullPath = text.slice(pathStart, pathEnd);
  return { word, fullPath };
}

export const ExpressionInput = forwardRef<HTMLTextAreaElement, ExpressionInputProps>(
  function ExpressionInput(
    {
      value,
      onChange,
      onCursorChange,
      onTriggerAutocomplete,
      onCloseAutocomplete,
      onAutocompleteKeyDown,
      onHover,
      onHoverEnd,
      onCtrlClick,
      errors,
      disabled,
      bracketMatchingColors = true,
    },
    ref,
  ) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [ctrlHeld, setCtrlHeld] = useState(false);
    const [hoveredWord, setHoveredWord] = useState<string | null>(null);

    // Track Ctrl key for pointer cursor
    useEffect(() => {
      const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'Control') setCtrlHeld(true);
      };
      const handleKeyUp = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'Control') setCtrlHeld(false);
      };
      const handleBlur = () => setCtrlHeld(false);

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleBlur);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleBlur);
      };
    }, []);

    // Update cursor position
    const handleSelectionChange = useCallback(() => {
      const textarea = (ref as React.RefObject<HTMLTextAreaElement>)?.current;
      if (textarea) {
        onCursorChange(textarea.selectionStart);
      }
    }, [ref, onCursorChange]);

    // Calculate autocomplete popup position relative to container (not viewport)
    const getAutocompletePosition = useCallback(
      (textarea: HTMLTextAreaElement, cursorPos: number, text: string) => {
        const lineHeight = 20;
        const charWidth = 8;
        const padding = 12; // p-3 = 12px
        const lines = text.slice(0, cursorPos).split('\n');
        const currentLine = lines.length - 1;
        const currentColumn = lines[lines.length - 1].length;

        // Position relative to textarea (parent container has position: relative)
        return {
          x: padding + currentColumn * charWidth,
          y: padding + (currentLine + 1) * lineHeight,
        };
      },
      [],
    );

    // Handle change with auto-trigger for autocomplete
    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;
        onChange(newValue);
        onCursorChange(cursorPos);

        // Don't show autocomplete when inside a string literal
        if (isInsideString(newValue, cursorPos)) {
          onCloseAutocomplete();
          return;
        }

        const beforeCursor = newValue.slice(0, cursorPos);
        const lastChar = beforeCursor.slice(-1);

        // Check if user just typed '.' - trigger autocomplete for member access
        if (lastChar === '.') {
          const textBeforeDot = beforeCursor.slice(0, -1);

          // Check for array access pattern: params.pages[0].
          const arrayAccessMatch = textBeforeDot.match(
            /([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*(?:\[\d+])+)$/,
          );
          if (arrayAccessMatch) {
            // Check if it starts with a known namespace
            const rootNamespace = arrayAccessMatch[1].split(/[.[]/)[0].toUpperCase();
            if (
              KNOWN_NAMESPACES.includes(rootNamespace) ||
              /^[A-Z][A-Z0-9_]*$/.test(rootNamespace)
            ) {
              const pos = getAutocompletePosition(e.target, cursorPos, newValue);
              onTriggerAutocomplete(pos.x, pos.y);
              return;
            }
          }

          // Check for nested property access (no array): params.parent.
          const nestedPathMatch = textBeforeDot.match(
            /([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)$/,
          );
          if (nestedPathMatch) {
            const rootNamespace = nestedPathMatch[1].split('.')[0].toUpperCase();
            if (
              KNOWN_NAMESPACES.includes(rootNamespace) ||
              /^[A-Z][A-Z0-9_]*$/.test(nestedPathMatch[1].split('.')[0])
            ) {
              const pos = getAutocompletePosition(e.target, cursorPos, newValue);
              onTriggerAutocomplete(pos.x, pos.y);
              return;
            }
          }

          // Check for simple identifier: NAMESPACE.
          const identifierMatch = textBeforeDot.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
          if (identifierMatch) {
            const identifier = identifierMatch[0].toUpperCase();
            const isNamespace =
              KNOWN_NAMESPACES.includes(identifier) || /^[A-Z][A-Z0-9_]*$/.test(identifierMatch[0]);
            if (isNamespace) {
              const pos = getAutocompletePosition(e.target, cursorPos, newValue);
              onTriggerAutocomplete(pos.x, pos.y);
              return;
            }
          }
        }

        // Check if user is typing a word (for functions, keywords, namespaces)
        const wordMatch = beforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
        if (wordMatch && wordMatch[0].length >= 1) {
          const charBeforeWord = beforeCursor.slice(0, -wordMatch[0].length).slice(-1);
          if (charBeforeWord === '.') {
            // Typing after a dot - check various patterns
            const textBeforeDot = beforeCursor.slice(0, -wordMatch[0].length - 1);

            // Check for array access pattern: params.pages[0].partial
            const arrayAccessMatch = textBeforeDot.match(
              /([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*(?:\[\d+])+)$/,
            );
            if (arrayAccessMatch) {
              const rootNamespace = arrayAccessMatch[1].split(/[.[]/)[0].toUpperCase();
              if (
                KNOWN_NAMESPACES.includes(rootNamespace) ||
                /^[A-Z][A-Z0-9_]*$/.test(rootNamespace)
              ) {
                const pos = getAutocompletePosition(e.target, cursorPos, newValue);
                onTriggerAutocomplete(pos.x, pos.y);
                return;
              }
            }

            // Check for nested property access (no array): params.parent.partial
            const nestedPathMatch = textBeforeDot.match(
              /([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)$/,
            );
            if (nestedPathMatch) {
              const rootNamespace = nestedPathMatch[1].split('.')[0].toUpperCase();
              if (
                KNOWN_NAMESPACES.includes(rootNamespace) ||
                /^[A-Z][A-Z0-9_]*$/.test(nestedPathMatch[1].split('.')[0])
              ) {
                const pos = getAutocompletePosition(e.target, cursorPos, newValue);
                onTriggerAutocomplete(pos.x, pos.y);
                return;
              }
            }

            // Check for simple namespace member access (e.g., COMPANY.na)
            const namespaceMatch = textBeforeDot.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
            if (namespaceMatch) {
              const namespace = namespaceMatch[0].toUpperCase();
              const isNamespace =
                KNOWN_NAMESPACES.includes(namespace) || /^[A-Z][A-Z0-9_]*$/.test(namespaceMatch[0]);
              if (isNamespace) {
                const pos = getAutocompletePosition(e.target, cursorPos, newValue);
                onTriggerAutocomplete(pos.x, pos.y);
                return;
              }
            }
          } else {
            // Regular word typing (functions, keywords, namespaces)
            const pos = getAutocompletePosition(e.target, cursorPos, newValue);
            onTriggerAutocomplete(pos.x, pos.y);
            return;
          }
        }

        // Close autocomplete if no valid context
        onCloseAutocomplete();
      },
      [
        onChange,
        onCursorChange,
        onTriggerAutocomplete,
        onCloseAutocomplete,
        getAutocompletePosition,
      ],
    );

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Let autocomplete handle navigation keys first
        if (onAutocompleteKeyDown(e.key)) {
          e.preventDefault();
          e.stopPropagation(); // Prevent Escape from closing modal
          return;
        }

        // Ctrl+Space for autocomplete
        if (e.ctrlKey && e.key === ' ') {
          e.preventDefault();
          const pos = getAutocompletePosition(
            e.currentTarget,
            e.currentTarget.selectionStart,
            value,
          );
          onTriggerAutocomplete(pos.x, pos.y);
          return;
        }

        // Tab for indentation (only when autocomplete is not open)
        if (e.key === 'Tab') {
          e.preventDefault();
          const textarea = e.currentTarget;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;

          const newValue = value.slice(0, start) + '  ' + value.slice(end);
          onChange(newValue);

          // Move cursor after the tab
          setTimeout(() => {
            textarea.setSelectionRange(start + 2, start + 2);
          }, 0);
        }
      },
      [value, onChange, onTriggerAutocomplete, onAutocompleteKeyDown, getAutocompletePosition],
    );

    // Number of distinct bracket colors (cycles after this)
    const BRACKET_COLOR_COUNT = 4;

    // Generate syntax-highlighted overlay using tokenization
    // Tokenizes first, then escapes and colorizes each token to avoid regex interference
    const getHighlightedContent = useCallback(() => {
      if (!value) return '';

      const tokens = tokenize(value);
      return tokens
        .map((token) => {
          const escaped = escapeHtml(token.text);
          switch (token.type) {
            case 'keyword':
              return `<span style="color: var(--syntax-keyword); font-weight: 500;">${escaped}</span>`;
            case 'function':
              return `<span style="color: var(--syntax-function);">${escaped}</span>`;
            case 'number':
              return `<span style="color: var(--syntax-number);">${escaped}</span>`;
            case 'string':
              return `<span style="color: var(--syntax-string);">${escaped}</span>`;
            case 'namespace':
              return `<span style="color: var(--syntax-namespace);">${escaped}</span>`;
            case 'field':
              return `<span style="color: var(--syntax-field);">${escaped}</span>`;
            case 'operator':
              return `<span style="color: var(--syntax-operator);">${escaped}</span>`;
            case 'bracket':
              // First level (depth 0) stays default color, nested brackets get colors
              if (bracketMatchingColors && token.depth !== undefined && token.depth > 0) {
                const colorIndex = (token.depth - 1) % BRACKET_COLOR_COUNT;
                return `<span style="color: var(--syntax-bracket-${colorIndex}); font-weight: 600;">${escaped}</span>`;
              }
              return escaped;
            default:
              return escaped;
          }
        })
        .join('');
    }, [value, bracketMatchingColors]);

    // Sync scroll between textarea and overlay
    const handleScroll = useCallback(() => {
      const textarea = (ref as React.RefObject<HTMLTextAreaElement>)?.current;
      if (textarea && overlayRef.current) {
        overlayRef.current.scrollTop = textarea.scrollTop;
        overlayRef.current.scrollLeft = textarea.scrollLeft;
      }
    }, [ref]);

    // Initial scroll sync
    useEffect(() => {
      handleScroll();
    }, [value, handleScroll]);

    // Calculate cursor offset from mouse position
    const getOffsetFromMousePosition = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const container = containerRef.current;
        if (!container) return null;

        const rect = container.getBoundingClientRect();
        const padding = 12; // p-3 = 12px
        const lineHeight = 20;
        const charWidth = 8;

        // Get position relative to container (accounting for scroll)
        const textarea = (ref as React.RefObject<HTMLTextAreaElement>)?.current;
        const scrollTop = textarea?.scrollTop ?? 0;
        const scrollLeft = textarea?.scrollLeft ?? 0;

        const relativeX = e.clientX - rect.left - padding + scrollLeft;
        const relativeY = e.clientY - rect.top - padding + scrollTop;

        // Calculate line and column
        const line = Math.max(0, Math.floor(relativeY / lineHeight));
        const col = Math.max(0, Math.floor(relativeX / charWidth));

        // Convert to offset
        const lines = value.split('\n');
        let offset = 0;
        for (let i = 0; i < line && i < lines.length; i++) {
          offset += lines[i].length + 1; // +1 for newline
        }
        if (line < lines.length) {
          offset += Math.min(col, lines[line].length);
        }

        return {
          offset: Math.min(offset, value.length),
          position: {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          },
        };
      },
      [value, ref],
    );

    // Handle mouse move for hover tooltips and tracking hovered word
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const result = getOffsetFromMousePosition(e);
        if (result) {
          // Track what word is under the cursor for Ctrl+Click cursor styling
          const wordInfo = getWordAtOffset(value, result.offset);
          setHoveredWord(wordInfo ? wordInfo.word : null);

          if (onHover) {
            onHover(result.offset, result.position);
          }
        } else {
          setHoveredWord(null);
        }
      },
      [onHover, getOffsetFromMousePosition, value],
    );

    // Handle mouse leave
    const handleMouseLeave = useCallback(() => {
      setHoveredWord(null);
      onHoverEnd?.();
    }, [onHoverEnd]);

    // Handle Ctrl+Click to show in reference
    const handleCtrlClick = useCallback(
      (e: React.MouseEvent) => {
        if (!onCtrlClick || !e.ctrlKey) return;

        const result = getOffsetFromMousePosition(e as React.MouseEvent<HTMLDivElement>);
        if (!result) return;

        const wordInfo = getWordAtOffset(value, result.offset);
        if (wordInfo) {
          e.preventDefault();
          e.stopPropagation();
          onCtrlClick(wordInfo.word, wordInfo.fullPath);
        }
      },
      [onCtrlClick, getOffsetFromMousePosition, value],
    );

    // Combined click handler for textarea
    const handleTextareaClick = useCallback(
      (e: React.MouseEvent<HTMLTextAreaElement>) => {
        // Handle Ctrl+Click for go-to-reference
        if (e.ctrlKey && onCtrlClick) {
          handleCtrlClick(e);
          return;
        }
        // Normal click - update selection
        handleSelectionChange();
      },
      [handleCtrlClick, handleSelectionChange, onCtrlClick],
    );

    const hasErrors = errors.length > 0;

    return (
      <div
        ref={containerRef}
        className="relative expression-input-container"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* CSS variables for syntax highlighting colors in light/dark mode */}
        <style>{`
          .expression-input-container {
            --syntax-keyword: #9333ea;
            --syntax-function: #2563eb;
            --syntax-number: #d97706;
            --syntax-string: #16a34a;
            --syntax-namespace: #0891b2;
            --syntax-field: #0d9488;
            --syntax-operator: #dc2626;
            /* Bracket colors for nested matching (rainbow brackets) */
            --syntax-bracket-0: #e6b800;
            --syntax-bracket-1: #d946ef;
            --syntax-bracket-2: #0ea5e9;
            --syntax-bracket-3: #22c55e;
          }
          .dark .expression-input-container {
            --syntax-keyword: #c084fc;
            --syntax-function: #60a5fa;
            --syntax-number: #fbbf24;
            --syntax-string: #4ade80;
            --syntax-namespace: #22d3ee;
            --syntax-field: #2dd4bf;
            --syntax-operator: #f87171;
            /* Bracket colors for nested matching (rainbow brackets) */
            --syntax-bracket-0: #facc15;
            --syntax-bracket-1: #f0abfc;
            --syntax-bracket-2: #38bdf8;
            --syntax-bracket-3: #4ade80;
          }
        `}</style>
        {/* Syntax highlighting overlay - must be above textarea (z-10) but pointer-events-none so clicks pass through */}
        <div
          ref={overlayRef}
          className={cn(
            'pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre-wrap break-words p-3 font-mono text-sm',
            'border rounded-md bg-transparent',
            'text-foreground',
            hasErrors ? 'border-red-300 dark:border-red-700' : 'border-border',
          )}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: getHighlightedContent() }}
        />

        {/* Actual textarea */}
        <textarea
          ref={ref}
          value={value}
          onChange={handleInputChange}
          onSelect={handleSelectionChange}
          onKeyUp={handleSelectionChange}
          onClick={handleTextareaClick}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          disabled={disabled}
          spellCheck={false}
          className={cn(
            'relative w-full min-h-[300px] p-3 font-mono text-sm',
            'border rounded-md bg-background resize-y',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:bg-muted disabled:cursor-not-allowed',
            hasErrors
              ? 'border-red-300 bg-red-50/30 dark:border-red-700 dark:bg-red-950/30'
              : 'border-border',
            // Make text transparent so overlay shows, but caret is visible
            'caret-black dark:caret-white text-transparent',
            // Show pointer cursor when Ctrl is held AND hovering over a word
            ctrlHeld && hoveredWord && 'cursor-pointer',
          )}
          placeholder="Enter condition expression... (Ctrl+Space for autocomplete)"
        />
      </div>
    );
  },
);

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type TokenType =
  | 'keyword'
  | 'function'
  | 'number'
  | 'string'
  | 'namespace'
  | 'field'
  | 'operator'
  | 'bracket'
  | 'text';

interface Token {
  type: TokenType;
  text: string;
  /** Nesting depth for brackets (0-based, used for coloring) */
  depth?: number;
}

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'WHERE',
  'LIKE',
  'MATCHES',
  'IN',
  'EXISTS',
  'TRUE',
  'FALSE',
  'NULL',
]);

const NAMESPACES = new Set([
  'PARAMS',
  'CONTEXT',
  'COMPANY',
  'LIMITS',
  'GLOBALS',
  'TIME',
  'NETWORK',
]);

// Opening and closing bracket pairs for tracking nesting
const OPENING_BRACKETS = '([{';
const CLOSING_BRACKETS = ')]}';

/**
 * Tokenize expression for syntax highlighting
 * Processes strings first to avoid highlighting content inside strings
 * Tracks bracket nesting depth for colorized bracket matching
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let bracketDepth = 0;

  while (i < input.length) {
    const char = input[i];

    // Strings (single or double quoted)
    if (char === '"' || char === "'") {
      const quote = char;
      let str = quote;
      i++;
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          str += input[i] + input[i + 1];
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      if (i < input.length) {
        str += input[i]; // closing quote
        i++;
      }
      tokens.push({ type: 'string', text: str });
      continue;
    }

    // Opening brackets - track depth
    if (OPENING_BRACKETS.includes(char)) {
      tokens.push({ type: 'bracket', text: char, depth: bracketDepth });
      bracketDepth++;
      i++;
      continue;
    }

    // Closing brackets - track depth
    if (CLOSING_BRACKETS.includes(char)) {
      bracketDepth = Math.max(0, bracketDepth - 1);
      tokens.push({ type: 'bracket', text: char, depth: bracketDepth });
      i++;
      continue;
    }

    // Numbers
    if (/\d/.test(char)) {
      let num = '';
      while (i < input.length && /[\d.eE+-]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'number', text: num });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      const upper = ident.toUpperCase();

      // Check if followed by ( for function call
      let j = i;
      while (j < input.length && /\s/.test(input[j])) j++;
      const isFunction = j < input.length && input[j] === '(';

      if (KEYWORDS.has(upper)) {
        tokens.push({ type: 'keyword', text: ident });
      } else if (NAMESPACES.has(upper)) {
        tokens.push({ type: 'namespace', text: ident });
      } else if (isFunction) {
        tokens.push({ type: 'function', text: ident });
      } else {
        // Check if previous non-whitespace token was a dot (this is a field access)
        const lastNonWhitespace = tokens.filter((t) => t.text.trim()).slice(-1)[0];
        if (lastNonWhitespace?.text === '.') {
          tokens.push({ type: 'field', text: ident });
        } else {
          tokens.push({ type: 'text', text: ident });
        }
      }
      continue;
    }

    // Operators (multi-char first)
    if (i + 1 < input.length) {
      const twoChar = input.slice(i, i + 2);
      if (['==', '!=', '<>', '<=', '>=', '**'].includes(twoChar)) {
        tokens.push({ type: 'operator', text: twoChar });
        i += 2;
        continue;
      }
    }

    // Single char operators
    if ('=!<>+-*/%'.includes(char)) {
      tokens.push({ type: 'operator', text: char });
      i++;
      continue;
    }

    // Everything else (whitespace, dots, etc.)
    tokens.push({ type: 'text', text: char });
    i++;
  }

  return tokens;
}
