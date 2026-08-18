/**
 * Unified Chat Input Component
 * Input field with send button for chat interfaces
 * Supports both local state and external store-based state management
 */

import { Send, Square } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * Store interface for persistent state management
 * Implement this interface to provide external state storage
 */
export interface ChatInputStore {
  /** Subscribe to store changes, returns unsubscribe function */
  subscribe: (listener: () => void) => () => void;
  /** Get current state containing inputValue */
  getState: () => { inputValue: string };
  /** Set the input value */
  setInputValue: (value: string) => void;
  /** Clear the input value */
  clearInputValue: () => void;
}

interface ChatInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  /**
   * Optional persistent store for state management
   * When provided, input value persists across navigation
   * When omitted, uses local useState
   */
  persistentStore?: ChatInputStore;
}

export function ChatInput({
  onSend,
  onCancel,
  disabled = false,
  isLoading = false,
  placeholder = 'Type a message...',
  persistentStore,
}: ChatInputProps) {
  // Local state for when no store is provided
  const [localValue, setLocalValue] = React.useState('');

  // Store-based state when a store is provided
  const storeState = React.useSyncExternalStore(
    persistentStore?.subscribe ?? (() => () => {}),
    persistentStore?.getState ?? (() => ({ inputValue: '' })),
    persistentStore?.getState ?? (() => ({ inputValue: '' })),
  );

  // Use store value if store is provided, otherwise use local state
  const value = persistentStore ? storeState.inputValue : localValue;

  const setValue = React.useCallback(
    (newValue: string) => {
      if (persistentStore) {
        persistentStore.setInputValue(newValue);
      } else {
        setLocalValue(newValue);
      }
    },
    [persistentStore],
  );

  const clearValue = React.useCallback(() => {
    if (persistentStore) {
      persistentStore.clearInputValue();
    } else {
      setLocalValue('');
    }
  }, [persistentStore]);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled && !isLoading) {
      onSend(value.trim());
      clearValue();
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea when value changes (including programmatic updates from store)
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Auto-resize textarea on input
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-border/30 bg-muted/20 p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-xl border border-border/50 bg-background px-4 py-3 text-[13px]',
            'placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'min-h-[46px] max-h-[200px]',
          )}
        />
        {isLoading && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            <Square className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim() || disabled || isLoading}
            className={cn(
              'flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl transition-all',
              value.trim() && !disabled && !isLoading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            <Send className="h-5 w-5" />
          </button>
        )}
      </div>
    </form>
  );
}
