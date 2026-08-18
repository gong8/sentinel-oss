/**
 * Streaming Message Component
 * Displays text as it streams in with a typing indicator
 * Supports full markdown rendering matching ChatMessage
 */

import * as React from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { formatToolNameForChat } from '../../lib/mcpUtils';
import { cn } from '../../lib/utils';
import { BotAvatar } from './BotAvatar';

/**
 * Markdown components matching ChatMessage exactly
 */
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          <code>{children}</code>
        </pre>
      );
    }
    return <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>;
  },
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline hover:no-underline"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

interface StreamingMessageProps {
  text: string;
  isStreaming: boolean;
  activeTools?: Map<string, { name: string; status: 'pending' | 'executing' | 'done' | 'error' }>;
  className?: string;
  /** Whether this is an admin conversation (shows "Sentinel Admin Agent" vs "Sentinel Agent") */
  isAdmin?: boolean;
}

/**
 * Escape patterns that markdown would incorrectly interpret
 * e.g., *::* is a common tool pattern but markdown sees it as italics
 */
function escapeMarkdownPatterns(text: string): string {
  // Escape *::* pattern (common in tool patterns like "*::*" for "all tools")
  // The regex matches *::* and replaces with escaped version
  return text.replace(/\*::\*/g, '\\*::\\*');
}

/**
 * Component to display streaming text with markdown support and cursor
 */
export function StreamingMessage({
  text,
  isStreaming,
  activeTools,
  className,
  isAdmin = true,
}: StreamingMessageProps) {
  const endRef = React.useRef<HTMLSpanElement>(null);

  // Auto-scroll to the end of the text as it streams
  React.useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [text, isStreaming]);

  // Check if we're in a "waiting for content" state (streaming but no text/tools yet)
  const hasActiveTools = activeTools && activeTools.size > 0;
  const isWaitingForContent = isStreaming && !text && !hasActiveTools;

  return (
    <div className={cn('flex gap-3 px-4 py-4', className)}>
      <BotAvatar />
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Header matching ChatMessage */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            {isAdmin ? 'Sentinel Admin Agent' : 'Sentinel Agent'}
          </span>
          {isWaitingForContent && (
            <span className="text-xs text-muted-foreground">is thinking...</span>
          )}
        </div>
        {/* Show thinking indicator when waiting for content */}
        {isWaitingForContent ? (
          <div className="flex items-center gap-1.5 h-4">
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        ) : (
          /* Streaming text with markdown support - matching ChatMessage prose styling */
          <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {escapeMarkdownPatterns(text)}
            </ReactMarkdown>
            {/* Blinking cursor at the end of content */}
            {isStreaming && (
              <span
                className="inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-primary streaming-cursor"
                aria-hidden="true"
              />
            )}
            <span ref={endRef} />
          </div>
        )}
        {/* Keyframes for cursor animation */}
        <style>{`
          @keyframes cursor-blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
          .streaming-cursor {
            animation: cursor-blink 1s steps(1) infinite;
          }
        `}</style>

        {/* Active tools indicator */}
        {activeTools && activeTools.size > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {Array.from(activeTools.entries()).map(([toolId, tool]) => (
              <ToolIndicator key={toolId} name={tool.name} status={tool.status} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolIndicatorProps {
  name: string;
  status: 'pending' | 'executing' | 'done' | 'error';
}

function ToolIndicator({ name, status }: ToolIndicatorProps) {
  const statusStyles = {
    pending: 'bg-muted text-muted-foreground',
    executing: 'bg-blue-500/20 text-blue-400 animate-pulse',
    done: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
  };

  const statusIcons = {
    pending: (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth="2" />
      </svg>
    ),
    executing: (
      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    ),
    done: (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        statusStyles[status],
      )}
    >
      {statusIcons[status]}
      <span>{formatToolNameForChat(name)}</span>
    </div>
  );
}
