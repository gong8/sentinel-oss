/**
 * Autocomplete Popup
 *
 * Displays autocomplete suggestions for the expression editor.
 */

import { useEffect, useRef } from 'react';
import { cn } from '../../../lib/utils';

interface Suggestion {
  label: string;
  kind: 'field' | 'function' | 'keyword' | 'variable';
  detail?: string;
  insertText: string;
  documentation?: string;
}

interface AutocompletePopupProps {
  suggestions: Suggestion[];
  position: { x: number; y: number };
  selectedIndex: number;
  onSelect: (insertText: string) => void;
  onHover: (index: number) => void;
}

export function AutocompletePopup({
  suggestions,
  position,
  selectedIndex,
  onSelect,
  onHover,
}: AutocompletePopupProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Get icon for suggestion kind
  const getKindIcon = (kind: Suggestion['kind']) => {
    switch (kind) {
      case 'function':
        return <span className="text-blue-500">f</span>;
      case 'field':
        return <span className="text-cyan-500">F</span>;
      case 'keyword':
        return <span className="text-purple-500">K</span>;
      case 'variable':
        return <span className="text-amber-500">N</span>;
      default:
        return null;
    }
  };

  if (suggestions.length === 0) {
    return null;
  }

  // Use CSS max() to constrain horizontal position without JavaScript measurement
  // w-72 = 288px, add 8px padding
  return (
    <div
      className="absolute z-50 w-72 max-h-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
      style={{
        left: `min(${position.x}px, calc(100% - 296px))`,
        top: position.y,
      }}
    >
      <ul ref={listRef} className="max-h-48 overflow-y-auto py-1">
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.kind}-${suggestion.label}`}
            onClick={() => onSelect(suggestion.insertText)}
            onMouseEnter={() => onHover(index)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm',
              index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-muted',
            )}
          >
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-mono">
              {getKindIcon(suggestion.kind)}
            </span>
            <span className="flex-1 font-mono truncate">{suggestion.label}</span>
            {suggestion.detail && (
              <span className="flex-shrink-0 text-xs text-muted-foreground truncate max-w-24">
                {suggestion.detail}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Documentation for selected suggestion */}
      {suggestions[selectedIndex]?.documentation && (
        <div className="border-t border-border p-2 text-xs text-muted-foreground bg-muted">
          {suggestions[selectedIndex].documentation}
        </div>
      )}

      {/* Keyboard hints */}
      <div className="border-t border-border px-2 py-1 text-xs text-muted-foreground bg-muted flex gap-2">
        <span>
          <kbd className="px-1 rounded bg-muted">↵</kbd> select
        </span>
        <span>
          <kbd className="px-1 rounded bg-muted">Esc</kbd> close
        </span>
      </div>
    </div>
  );
}
