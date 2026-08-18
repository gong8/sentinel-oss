/**
 * Agent Message List Component
 * Renders grouped messages, tool calls, and loading states
 * Reusable between full-screen view and pop-out panel
 */

import { AgentThinking } from '../AgentThinking';
import { ChatMessage, ToolCallsDisplay } from '../ChatMessage';
import { ConfirmationList, type PendingConfirmation } from '../ConfirmationCard';
import { groupMessagesForDisplay } from './messageGrouping';
import type { Message } from './types';

interface AgentMessageListProps {
  messages: Message[];
  isLoading: boolean;
  pendingConfirmations: PendingConfirmation[];
  onRetryFromMessage?: (messageId: string, content: string) => void;
  isRetryingMessageId?: string | null;
  onConfirmAction?: (confirmationId: string) => void;
  onCancelAction?: (confirmationId: string) => void;
  onReviewAction?: (confirmation: PendingConfirmation) => void;
  confirmingId?: string;
  cancellingId?: string;
  /** Error to display at the bottom of the list */
  error?: { message: string; onRetry: () => void; onDismiss: () => void } | null;
}

interface ErrorDisplayProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

function ErrorDisplay({ message, onRetry, onDismiss }: ErrorDisplayProps) {
  return (
    <div className="mx-4 my-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-destructive font-bold">!</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-destructive">Failed to send message</div>
          <div className="mt-1 text-xs text-muted-foreground">{message}</div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              Retry
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentMessageList({
  messages,
  isLoading,
  pendingConfirmations,
  onRetryFromMessage,
  isRetryingMessageId,
  onConfirmAction,
  onCancelAction,
  onReviewAction,
  confirmingId,
  cancellingId,
  error,
}: AgentMessageListProps) {
  const groupedItems = groupMessagesForDisplay(messages);

  return (
    <div className="divide-y divide-border/30">
      {groupedItems.map((item) =>
        item.type === 'message' ? (
          <ChatMessage
            key={item.message.id}
            role={item.message.role}
            content={item.message.content}
            toolName={item.message.toolName}
            timestamp={item.message.createdAt}
            onRetry={
              item.message.role === 'USER' && item.message.id !== 'optimistic-user-message'
                ? () => onRetryFromMessage?.(item.message.id, item.message.content)
                : undefined
            }
            isRetrying={isRetryingMessageId === item.message.id}
          />
        ) : (
          <ToolCallsDisplay key={`tools-${item.afterMessageId}`} tools={item.tools} />
        ),
      )}
      {isLoading && <AgentThinking />}
      {pendingConfirmations.length > 0 && onConfirmAction && onCancelAction && (
        <ConfirmationList
          confirmations={pendingConfirmations}
          onConfirm={onConfirmAction}
          onCancel={onCancelAction}
          onReview={onReviewAction}
          confirmingId={confirmingId}
          cancellingId={cancellingId}
        />
      )}
      {error && <ErrorDisplay {...error} />}
    </div>
  );
}
