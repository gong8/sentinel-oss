/**
 * Chat Message Component
 * Renders individual chat messages with markdown support
 */

import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { formatToolNameForChat } from '../../lib/mcpUtils';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { BotAvatar } from './BotAvatar';

// Re-export types and helpers from shared for backwards compatibility
export {
  hasUserDecision,
  isToolResultAccepted,
  isToolResultError,
  isToolResultPendingConfirmation,
  isToolResultRejected,
} from './shared/messageGrouping';
export type { MessageRole, ToolCallGroup } from './shared/types';

// Import for local use
import type { MessageRole, ToolCallGroup } from './shared/types';

export interface ChatMessageProps {
  role: MessageRole;
  content: string;
  toolName?: string | null;
  toolInput?: unknown;
  toolResult?: unknown;
  timestamp?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** Whether this is an admin conversation (shows "Sentinel Admin Agent" vs "Sentinel Agent") */
  isAdmin?: boolean;
}

/** User avatar with initials */
function UserAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm">
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
    </div>
  );
}

/**
 * Escape patterns that markdown would incorrectly interpret
 * e.g., *::* is a common tool pattern but markdown sees it as italics
 */
function escapeMarkdownPatterns(text: string): string {
  // Escape *::* pattern (common in tool patterns like "*::*" for "all tools")
  return text.replace(/\*::\*/g, '\\*::\\*');
}

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

interface ToolCallChipProps {
  toolName: string;
  status: 'pending' | 'success' | 'error' | 'rejected';
}

/** Simple chip showing tool name and status - no expandable content */
function ToolCallChip({ toolName, status }: ToolCallChipProps) {
  const statusIcon =
    status === 'pending' ? (
      <svg className="h-3 w-3 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
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
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    ) : status === 'error' ? (
      <svg
        className="h-3 w-3 text-destructive"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ) : status === 'rejected' ? (
      // Rejected by user - show slash/ban icon in muted color
      <svg
        className="h-3 w-3 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
        />
      </svg>
    ) : (
      <svg
        className="h-3 w-3 text-green-600 dark:text-green-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/30 px-2 py-1 text-xs">
      {statusIcon}
      <span className="text-muted-foreground">{formatToolNameForChat(toolName)}</span>
    </div>
  );
}

/** Renders a group of tool calls as simple chips */
export interface ToolCallsDisplayProps {
  tools: ToolCallGroup[];
}

export function ToolCallsDisplay({ tools }: ToolCallsDisplayProps) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-2 ml-11">
      {tools.map((tool, idx) => {
        let status: 'pending' | 'success' | 'error' | 'rejected';
        if (!tool.hasResult) {
          status = 'pending';
        } else if (tool.isRejected) {
          // User explicitly rejected the confirmation
          status = 'rejected';
        } else if (tool.isError && !tool.isAccepted) {
          // Error from validation or other non-user-initiated failure
          status = 'error';
        } else if (tool.isPendingConfirmation) {
          // Tool returned a confirmation request - don't show as success
          // since the actual action hasn't been executed yet
          status = 'pending';
        } else if (tool.isAccepted) {
          // User accepted - show success (even if there was an execution error,
          // the user's decision was to accept)
          status = tool.isError ? 'error' : 'success';
        } else {
          status = 'success';
        }
        return (
          <ToolCallChip key={`${tool.toolName}-${idx}`} toolName={tool.toolName} status={status} />
        );
      })}
    </div>
  );
}

// Helper functions are now re-exported from ./shared/messageGrouping above

export function ChatMessage({
  role,
  content,
  toolName,
  timestamp,
  onRetry,
  isRetrying,
  isAdmin = true,
}: ChatMessageProps) {
  const isUser = role === 'USER';
  const isToolMessage = role === 'TOOL_USE' || role === 'TOOL_RESULT';

  // Tool messages are handled by ToolCallsDisplay in ChatPanel - skip rendering here
  if (isToolMessage && toolName) {
    return null;
  }

  return (
    <div className={cn('group flex gap-3 px-4 py-4', isUser ? 'bg-muted/20' : 'bg-transparent')}>
      {isUser ? <UserAvatar /> : <BotAvatar />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            {isUser ? 'You' : isAdmin ? 'Sentinel Admin Agent' : 'Sentinel Agent'}
          </span>
          {timestamp && (
            <span className="text-[10px] text-muted-foreground/70">
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {isUser && onRetry && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="ml-auto h-6 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100"
              title="Retry from this message"
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          )}
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {escapeMarkdownPatterns(content)}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
