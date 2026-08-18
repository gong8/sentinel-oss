/**
 * Chat Panel Component
 * Main chat interface with conversation list and message view
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';

import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { DeleteConfirmDialog } from '../ui/delete-confirm-dialog';
import { AgentThinking } from './AgentThinking';
import { ChatInput } from './ChatInput';
import { ChatMessage, ToolCallsDisplay } from './ChatMessage';
import { chatPanelStore } from './chatPanelStore';
import { ConfirmationList, type PendingConfirmation } from './ConfirmationCard';
import { PlanList } from './PlanReviewCard';
import { PolicyDeleteReviewModal } from './PolicyDeleteReviewModal';
import { PolicyReviewModal } from './PolicyReviewModal';
import { groupMessagesForDisplay, type Conversation, type Message } from './shared';

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
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 gap-1.5 text-xs">
              Retry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="h-7 text-xs text-muted-foreground"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// NOTE: DisplayItem, ToolCallGroup, and groupMessagesForDisplay are now imported from ./shared

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      {icon}
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}

interface ChatPanelProps {
  /** Workspace slug for navigation to full-screen view */
  workspaceSlug?: string;
  /** Workspace ID for scoping operations (undefined = global mode) */
  workspaceId?: string;
}

export function ChatPanel({ workspaceSlug, workspaceId }: ChatPanelProps) {
  // Use persistent store for state that should survive navigation
  const {
    isOpen,
    activeConversationId,
    showConversationList,
    pendingConversations,
    pendingNewConversation,
    isPopoutMode,
    popoutConversationId,
    currentModel,
  } = React.useSyncExternalStore(
    chatPanelStore.subscribe,
    chatPanelStore.getState,
    chatPanelStore.getState,
  );

  const setIsOpen = chatPanelStore.setIsOpen;
  const setActiveConversationId = chatPanelStore.setActiveConversationId;
  const setShowConversationList = chatPanelStore.setShowConversationList;

  // In pop-out mode, use the pop-out conversation ID
  const effectiveConversationId = isPopoutMode ? popoutConversationId : activeConversationId;

  // Pop-out mode: panel is visible when isPopoutMode is true
  // Regular mode: panel is visible when isOpen is true
  const isPanelVisible = isPopoutMode || isOpen;

  // Check if current conversation is pending (persists across tab switches)
  const isCurrentConversationPending = effectiveConversationId
    ? pendingConversations.has(effectiveConversationId)
    : pendingNewConversation;

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [conversationToDelete, setConversationToDelete] = React.useState<string | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = React.useState<PendingConfirmation[]>([]);
  const [confirmingId, setConfirmingId] = React.useState<string>();
  const [cancellingId, setCancellingId] = React.useState<string>();
  const [reviewingConfirmation, setReviewingConfirmation] =
    React.useState<PendingConfirmation | null>(null);
  const [lastAttemptedMessage, setLastAttemptedMessage] = React.useState<string | null>(null);
  const [retryDialogOpen, setRetryDialogOpen] = React.useState(false);
  const [messageToRetry, setMessageToRetry] = React.useState<{
    id: string;
    content: string;
  } | null>(null);
  const [confirmationError, setConfirmationError] = React.useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const lastMessageIdRef = React.useRef<string | null>(null);
  const userScrolledUpRef = React.useRef(false);
  const navigate = useNavigate();

  const utils = trpc.useUtils();

  // Fetch conversations
  const { data: conversations = [], isLoading: conversationsLoading } =
    trpc.agent.chat.listConversations.useQuery({ limit: 50 }, { enabled: isPanelVisible });

  // Fetch active conversation
  const { data: activeConversation, isLoading: conversationLoading } =
    trpc.agent.chat.getConversation.useQuery(
      { conversationId: effectiveConversationId ?? '' },
      { enabled: !!effectiveConversationId && isPanelVisible },
    );

  // Validate popout conversation exists - clear if it was deleted
  React.useEffect(() => {
    if (isPopoutMode && popoutConversationId && !conversationLoading && !activeConversation) {
      // Conversation no longer exists, clear the popout state
      chatPanelStore.setPopoutMode(false);
    }
  }, [isPopoutMode, popoutConversationId, conversationLoading, activeConversation]);

  // Track if we're creating a new conversation (to avoid clearing confirmations)
  const isNewConversationRef = React.useRef(false);

  // Send message mutation
  const sendMessage = trpc.agent.chat.sendMessage.useMutation({
    onMutate: () => {
      // Track if this is a new conversation before the mutation
      isNewConversationRef.current = !effectiveConversationId;
      // Mark conversation as pending in the store (persists across tab switches)
      chatPanelStore.setPending(effectiveConversationId);
    },
    onSuccess: (data) => {
      // Clear the tracked message on success
      setLastAttemptedMessage(null);

      // Update conversation ID if new
      if (!effectiveConversationId) {
        if (isPopoutMode) {
          chatPanelStore.setPopoutConversationId(data.conversationId);
        } else {
          setActiveConversationId(data.conversationId);
        }
      }

      // Handle plan creation response
      if (data.planCreated) {
        // Plan was created - invalidate and let the UI show the plan
        void utils.agent.chat.listConversations.invalidate();
        void utils.agent.chat.getConversation.invalidate({
          conversationId: data.conversationId,
        });
        void utils.agent.plan.listForConversation.invalidate({
          conversationId: data.conversationId,
        });
        return;
      }

      // Normal response handling
      // Capture pending confirmations BEFORE updating conversation ID
      // This must happen first to avoid the useEffect clearing them
      const newConfirmations = data.response.pendingConfirmations ?? [];

      // Set confirmations after the conversation ID update
      // For new conversations, delay to avoid race with the useEffect that clears confirmations
      if (newConfirmations.length > 0) {
        const addConfirmations = () =>
          setPendingConfirmations((prev) => [...prev, ...newConfirmations]);
        if (isNewConversationRef.current) {
          setTimeout(addConfirmations, 0);
        } else {
          addConfirmations();
        }
      }

      // Update current model if provided
      if (data.response.model) {
        chatPanelStore.setCurrentModel(data.response.model);
      }

      // Invalidate queries to refresh data
      void utils.agent.chat.listConversations.invalidate();
      void utils.agent.chat.getConversation.invalidate({
        conversationId: data.conversationId,
      });
    },
    onSettled: (_data, _error, variables) => {
      // Clear pending state (use the conversation ID from the mutation or the new one from response)
      chatPanelStore.clearPending(variables.conversationId ?? null);
    },
  });

  // Confirm action mutation
  const confirmAction = trpc.agent.confirmation.confirm.useMutation({
    onSuccess: (data, variables) => {
      // Remove from pending list
      setPendingConfirmations((prev) =>
        prev.filter((c) => c.confirmationId !== variables.confirmationId),
      );
      setConfirmingId(undefined);
      // Refresh conversation to show any new messages
      if (effectiveConversationId) {
        void utils.agent.chat.getConversation.invalidate({
          conversationId: effectiveConversationId,
        });
      }

      // Invalidate admin queries so pages refresh with updated data
      // This ensures changes made by the agent are reflected without manual refresh
      void utils.admin.policies.list.invalidate();
      void utils.admin.users.list.invalidate();
      void utils.admin.roles.list.invalidate();
      void utils.admin.mcpServers.list.invalidate();
      void utils.admin.webhooks.list.invalidate();
      void utils.admin.agents.list.invalidate();
      void utils.admin.permissionRequests.list.invalidate();

      // Handle redirect action if present in the result
      const result = data?.result as
        | { redirectAction?: { path: string; query?: Record<string, string> } }
        | undefined;
      if (result?.redirectAction) {
        const { path, query } = result.redirectAction;
        const searchParams = query ? new URLSearchParams(query).toString() : '';
        const fullPath = searchParams ? `${path}?${searchParams}` : path;
        // Close the chat panel and navigate
        setIsOpen(false);
        navigate(fullPath);
      }
    },
    onError: () => {
      setConfirmingId(undefined);
    },
  });

  // Cancel action mutation
  const cancelAction = trpc.agent.confirmation.cancel.useMutation({
    onSuccess: (_data, variables) => {
      // Remove from pending list
      setPendingConfirmations((prev) =>
        prev.filter((c) => c.confirmationId !== variables.confirmationId),
      );
      setCancellingId(undefined);

      // Refresh conversation to show updated tool result (cancelled)
      if (effectiveConversationId) {
        void utils.agent.chat.getConversation.invalidate({
          conversationId: effectiveConversationId,
        });
      }
    },
    onError: () => {
      setCancellingId(undefined);
    },
  });

  // Confirm with modified input mutation (for policy review modal)
  const confirmWithModifiedInput = trpc.agent.confirmation.confirmWithModifiedInput.useMutation({
    onSuccess: (data, variables) => {
      // Check if execution failed (API succeeded but execution returned an error)
      if (!data.success) {
        // Keep modal open and show error
        setConfirmationError(data.error ?? 'Failed to execute action');
        // Still refresh conversation to show the error in chat
        if (effectiveConversationId) {
          void utils.agent.chat.getConversation.invalidate({
            conversationId: effectiveConversationId,
          });
        }
        return;
      }

      // Clear any previous error
      setConfirmationError(null);

      // Remove from pending list
      setPendingConfirmations((prev) =>
        prev.filter((c) => c.confirmationId !== variables.confirmationId),
      );
      setReviewingConfirmation(null);
      // Refresh conversation to show any new messages
      if (effectiveConversationId) {
        void utils.agent.chat.getConversation.invalidate({
          conversationId: effectiveConversationId,
        });
      }

      // Invalidate admin queries so pages refresh with updated data
      void utils.admin.policies.list.invalidate();
      void utils.admin.users.list.invalidate();
      void utils.admin.roles.list.invalidate();
      void utils.admin.mcpServers.list.invalidate();
      void utils.admin.webhooks.list.invalidate();
      void utils.admin.agents.list.invalidate();
      void utils.admin.permissionRequests.list.invalidate();

      // Handle redirect action if present in the result
      const result = data?.result as
        | { redirectAction?: { path: string; query?: Record<string, string> } }
        | undefined;
      if (result?.redirectAction) {
        const { path, query } = result.redirectAction;
        const searchParams = query ? new URLSearchParams(query).toString() : '';
        const fullPath = searchParams ? `${path}?${searchParams}` : path;
        // Close the chat panel and navigate
        setIsOpen(false);
        navigate(fullPath);
      }
    },
    onError: (error) => {
      // Keep modal open on error so user can retry
      setConfirmationError(error.message ?? 'An error occurred');
    },
  });

  // Delete conversation mutation
  const deleteConversation = trpc.agent.chat.deleteConversation.useMutation({
    onSuccess: () => {
      setActiveConversationId(null);
      setShowConversationList(true);
      void utils.agent.chat.listConversations.invalidate();
    },
  });

  // Retry from message mutation
  const retryFromMessage = trpc.agent.chat.retryFromMessage.useMutation({
    onMutate: (variables) => {
      // Mark conversation as pending in the store (persists across tab switches)
      chatPanelStore.setPending(variables.conversationId);
    },
    onSuccess: (data) => {
      setMessageToRetry(null);

      // Handle plan creation response
      if (data.planCreated) {
        void utils.agent.chat.listConversations.invalidate();
        void utils.agent.chat.getConversation.invalidate({
          conversationId: data.conversationId,
        });
        void utils.agent.plan.listForConversation.invalidate({
          conversationId: data.conversationId,
        });
        return;
      }

      // Normal response handling
      // Capture pending confirmations from response
      if (data.response.pendingConfirmations?.length) {
        setPendingConfirmations((prev) => [...prev, ...data.response.pendingConfirmations]);
      }
      // Invalidate queries to refresh data
      void utils.agent.chat.listConversations.invalidate();
      void utils.agent.chat.getConversation.invalidate({
        conversationId: data.conversationId,
      });
    },
    onError: () => {
      setMessageToRetry(null);
    },
    onSettled: (_data, _error, variables) => {
      // Clear pending state
      chatPanelStore.clearPending(variables.conversationId);
    },
  });

  // Clear pending confirmations when conversation changes
  React.useEffect(() => {
    setPendingConfirmations([]);
    setLastAttemptedMessage(null);
  }, [effectiveConversationId]);

  // Derived loading state: either from mutation or persisted store
  const isLoading =
    sendMessage.isPending || retryFromMessage.isPending || isCurrentConversationPending;

  // Get the last message ID for scroll comparison
  const messages = activeConversation?.messages ?? [];
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : null;

  // Handle user scroll to detect when they've scrolled up
  const handleScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if user is near the bottom (within 100px)
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    userScrolledUpRef.current = !isNearBottom;
  }, []);

  // Scroll to bottom only when there are new messages and user hasn't scrolled up
  React.useEffect(() => {
    // Skip if user has scrolled up
    if (userScrolledUpRef.current) return;

    // Only scroll if there's a new message
    if (lastMessageId && lastMessageId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessageId;
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [lastMessageId]);

  // Scroll to bottom when confirmations appear
  React.useEffect(() => {
    if (pendingConfirmations.length > 0 && !userScrolledUpRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [pendingConfirmations.length]);

  // Scroll to bottom when loading starts (keeps chat scrolled while thinking)
  React.useEffect(() => {
    if (isLoading && !userScrolledUpRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLoading]);

  // Reset scroll tracking when conversation changes
  React.useEffect(() => {
    lastMessageIdRef.current = null;
    userScrolledUpRef.current = false;
  }, [effectiveConversationId]);

  const handleSendMessage = (message: string) => {
    setLastAttemptedMessage(message);
    sendMessage.mutate({
      conversationId: effectiveConversationId ?? undefined,
      message,
      workspaceId,
    });
  };

  const handleRetry = () => {
    if (lastAttemptedMessage) {
      sendMessage.reset();
      sendMessage.mutate({
        conversationId: effectiveConversationId ?? undefined,
        message: lastAttemptedMessage,
        workspaceId,
      });
    }
  };

  const handleDismissError = () => {
    sendMessage.reset();
    setLastAttemptedMessage(null);
  };

  const handleNewConversation = () => {
    sendMessage.reset();
    setActiveConversationId(null);
    setShowConversationList(false);
  };

  const handleSelectConversation = (id: string) => {
    sendMessage.reset();
    setActiveConversationId(id);
    setShowConversationList(false);
  };

  const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      deleteConversation.mutate({ conversationId: conversationToDelete });
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const handleBackToList = () => {
    sendMessage.reset();
    setShowConversationList(true);
  };

  const handleConfirmAction = (confirmationId: string) => {
    setConfirmingId(confirmationId);
    confirmAction.mutate({ confirmationId });
  };

  const handleCancelAction = (confirmationId: string) => {
    setCancellingId(confirmationId);
    cancelAction.mutate({ confirmationId });
  };

  const handleReviewAction = (confirmation: PendingConfirmation) => {
    setReviewingConfirmation(confirmation);
  };

  const handleReviewSubmit = (confirmationId: string, modifiedInput: unknown) => {
    confirmWithModifiedInput.mutate({ confirmationId, modifiedInput });
  };

  const handleRetryFromMessage = (messageId: string, content: string) => {
    setMessageToRetry({ id: messageId, content });
    setRetryDialogOpen(true);
  };

  const handleConfirmRetry = () => {
    if (messageToRetry && effectiveConversationId) {
      retryFromMessage.mutate({
        conversationId: effectiveConversationId,
        messageId: messageToRetry.id,
        workspaceId,
      });
    }
    setRetryDialogOpen(false);
  };

  const handleCancelRetry = () => {
    setRetryDialogOpen(false);
    setMessageToRetry(null);
  };

  // Keyboard shortcut to toggle chat
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘. or Ctrl+. to toggle chat/pop-out
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        const state = chatPanelStore.getState();
        if (state.isPopoutMode) {
          // In pop-out mode, toggle pop-out visibility
          chatPanelStore.setPopoutMode(!state.isPopoutMode, state.popoutConversationId);
        } else {
          // In regular mode, toggle the panel
          setIsOpen(!state.isOpen);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setIsOpen]);

  // Create optimistic user message to show immediately while waiting for response
  // Use isLoading to ensure message persists across tab switches
  const optimisticUserMessage: Message | null =
    lastAttemptedMessage && isLoading
      ? {
          id: 'optimistic-user-message',
          role: 'USER',
          content: lastAttemptedMessage,
          createdAt: new Date().toISOString(),
        }
      : null;

  // When retrying, filter out messages after the retry point to clear the old response immediately
  const messagesForDisplay: Message[] = React.useMemo(() => {
    const msgs = activeConversation?.messages ?? [];
    // Use isLoading to also handle persisted pending state (covers tab switches during retry)
    const isRetrying =
      retryFromMessage.isPending || (isCurrentConversationPending && messageToRetry);
    if (isRetrying && messageToRetry) {
      const retryIndex = msgs.findIndex((m) => m.id === messageToRetry.id);
      if (retryIndex !== -1) {
        // Keep only messages up to and including the retry point
        return msgs.slice(0, retryIndex + 1);
      }
    }
    return msgs;
  }, [
    activeConversation?.messages,
    retryFromMessage.isPending,
    messageToRetry,
    isCurrentConversationPending,
  ]);

  const displayMessages: Message[] = optimisticUserMessage
    ? [...messagesForDisplay, optimisticUserMessage]
    : messagesForDisplay;

  // Use portal to render at document body level for true fixed positioning
  return createPortal(
    <>
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Conversation"
        description="This action cannot be undone."
        onConfirm={handleConfirmDelete}
        isLoading={deleteConversation.isPending}
      />

      <DeleteConfirmDialog
        open={retryDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelRetry();
        }}
        title="Retry from this message?"
        description="This will clear all messages after this point and regenerate a new response."
        confirmLabel="Retry"
        loadingLabel="Retrying..."
        variant="default"
        onConfirm={handleConfirmRetry}
        isLoading={retryFromMessage.isPending}
      />

      {/* Policy Review Modals */}
      {reviewingConfirmation && reviewingConfirmation.toolName === 'delete_policy' && (
        <PolicyDeleteReviewModal
          open={true}
          onOpenChange={(open) => !open && setReviewingConfirmation(null)}
          confirmation={reviewingConfirmation}
          onSubmit={handleReviewSubmit}
          isSubmitting={confirmWithModifiedInput.isPending}
        />
      )}
      {reviewingConfirmation &&
        (reviewingConfirmation.toolName === 'create_policy' ||
          reviewingConfirmation.toolName === 'update_policy') && (
          <PolicyReviewModal
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                setReviewingConfirmation(null);
                setConfirmationError(null);
              }
            }}
            confirmation={reviewingConfirmation}
            onSubmit={handleReviewSubmit}
            isSubmitting={confirmWithModifiedInput.isPending}
            error={confirmationError}
          />
        )}

      {/* Chat panel */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl transition-all duration-300',
          'w-[420px] h-[600px] max-h-[calc(100vh-120px)]',
          isPanelVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            {!isPopoutMode && !showConversationList && (
              <button
                onClick={handleBackToList}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">Sentinel Admin Agent</div>
              {currentModel && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {currentModel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isPopoutMode && workspaceSlug && (
              <button
                onClick={() => {
                  // Capture conversation ID before clearing popout mode
                  const conversationIdToRestore = popoutConversationId;
                  chatPanelStore.setPopoutMode(false);
                  // Pass the conversation ID via navigation state so fullscreen can restore it
                  navigate(`/admin/${workspaceSlug}/agent`, {
                    state: { restoreConversationId: conversationIdToRestore },
                  });
                }}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Return to full screen"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                  />
                </svg>
                Full Screen
              </button>
            )}
            {isPopoutMode && (
              <button
                onClick={() => chatPanelStore.setPopoutMode(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Close pop-out"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
            {!isPopoutMode && (
              <button
                onClick={handleNewConversation}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="New conversation"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {!isPopoutMode && showConversationList ? (
          // Conversation list
          <div className="flex-1 overflow-y-auto">
            {conversationsLoading && conversations.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                  Loading conversations...
                </div>
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 shadow-lg">
                    <img src="/logo.png" alt="Sentinel" className="h-8 w-auto" />
                  </div>
                }
                title="No conversations yet"
                description="Start chatting to get help with policies, users, and more"
                action={
                  <Button onClick={handleNewConversation} size="sm" className="mt-2">
                    Start a conversation
                  </Button>
                }
              />
            ) : (
              <div className="p-2 space-y-1">
                {conversations.map((conv: Conversation) => (
                  <div
                    key={conv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectConversation(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectConversation(conv.id);
                      }
                    }}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                      <svg
                        className="h-4 w-4 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {conv.title ?? 'New conversation'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {conv.messageCount} messages ·{' '}
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      title="Delete conversation"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // Chat view
          <>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto"
            >
              {conversationLoading && !activeConversation ? (
                <div className="flex items-center justify-center p-8">
                  <div className="text-sm text-muted-foreground">Loading messages...</div>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {displayMessages.length === 0 && !isLoading ? (
                    <EmptyState
                      icon={
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 shadow-lg">
                          <img src="/logo.png" alt="Sentinel" className="h-10 w-auto" />
                        </div>
                      }
                      title="How can I help?"
                      description="Ask me about policies, users, audit logs, or anything else."
                    />
                  ) : (
                    groupMessagesForDisplay(displayMessages).map((item) =>
                      item.type === 'message' ? (
                        <ChatMessage
                          key={item.message.id}
                          role={item.message.role}
                          content={item.message.content}
                          toolName={item.message.toolName}
                          timestamp={item.message.createdAt}
                          onRetry={
                            item.message.role === 'USER' &&
                            item.message.id !== 'optimistic-user-message'
                              ? () => handleRetryFromMessage(item.message.id, item.message.content)
                              : undefined
                          }
                          isRetrying={
                            retryFromMessage.isPending && messageToRetry?.id === item.message.id
                          }
                        />
                      ) : (
                        <ToolCallsDisplay key={`tools-${item.afterMessageId}`} tools={item.tools} />
                      ),
                    )
                  )}
                  {isLoading && <AgentThinking />}
                  {/* Show plans for this conversation */}
                  {effectiveConversationId && <PlanList conversationId={effectiveConversationId} />}
                  {pendingConfirmations.length > 0 && (
                    <ConfirmationList
                      confirmations={pendingConfirmations}
                      onConfirm={handleConfirmAction}
                      onCancel={handleCancelAction}
                      onReview={handleReviewAction}
                      confirmingId={confirmingId}
                      cancellingId={cancellingId}
                    />
                  )}
                  {sendMessage.isError && (
                    <ErrorDisplay
                      message={sendMessage.error?.message ?? 'An unexpected error occurred'}
                      onRetry={handleRetry}
                      onDismiss={handleDismissError}
                    />
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
            <ChatInput onSend={handleSendMessage} isLoading={isLoading} disabled={isLoading} />
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
