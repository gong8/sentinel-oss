/**
 * Agent Chat Area Component
 * Routes to Admin or Workspace chat based on conversation type
 */

import * as React from 'react';
import { useNavigate } from 'react-router';

import { useStreamingChat, type ToolDenialInfo } from '../../hooks/useStreamingChat';
import { getIsAdmin } from '../../lib/auth';
import { trpc } from '../../lib/trpc';
import { AgentThinking } from '../agent/AgentThinking';
import { ChatInput } from '../agent/ChatInput';
import { ChatMessage, ToolCallsDisplay } from '../agent/ChatMessage';
import { chatPanelStore } from '../agent/chatPanelStore';
import { ConfirmationList, type PendingConfirmation } from '../agent/ConfirmationCard';
import { PlanList } from '../agent/PlanReviewCard';
import { PolicyDeleteReviewModal } from '../agent/PolicyDeleteReviewModal';
import { PolicyReviewModal } from '../agent/PolicyReviewModal';
import { groupMessagesForDisplay, type Message } from '../agent/shared';
import { StreamingMessage } from '../agent/StreamingMessage';
import { ToolDenialCard } from '../agent/ToolDenialCard';
import { Button } from '../ui/button';
import { DeleteConfirmDialog } from '../ui/delete-confirm-dialog';

import type { ConversationType } from '../agent/shared/types';

interface AgentChatAreaProps {
  conversationId: string | null;
  conversationType: ConversationType | null;
  workspaceId: string;
  onConversationCreated: (id: string, type: ConversationType) => void;
  onNewChat: () => void;
  /** Whether pop-out is available (admin only) */
  canPopout?: boolean;
  onPopout?: () => void;
}

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

interface ErrorDisplayProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

function ErrorDisplay({ message, onRetry, onDismiss }: ErrorDisplayProps) {
  return (
    <div className="mx-4 my-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 font-bold text-destructive">!</span>
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

export function AgentChatArea({
  conversationId,
  conversationType,
  workspaceId,
  onConversationCreated,
  onNewChat,
  canPopout,
  onPopout,
}: AgentChatAreaProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

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
  const [currentModel, setCurrentModel] = React.useState<string | null>(null);
  const [toolDenial, setToolDenial] = React.useState<ToolDenialInfo | null>(null);

  // Check if current user is an admin
  const isAdmin = getIsAdmin();

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const lastMessageIdRef = React.useRef<string | null>(null);
  const userScrolledUpRef = React.useRef(false);
  const isNewConversationRef = React.useRef(false);
  const streamingConversationIdRef = React.useRef<string | null>(null);

  // Determine which API to use based on conversation type
  const isAdminConversation = conversationType === 'SENTINEL_ADMIN' || !conversationType;

  // Fetch active conversation - Admin
  const { data: adminConversation, isLoading: adminLoading } =
    trpc.agent.chat.getConversation.useQuery(
      { conversationId: conversationId ?? '' },
      { enabled: !!conversationId && isAdminConversation },
    );

  // Fetch active conversation - Workspace
  const { data: workspaceConversation, isLoading: workspaceLoading } =
    trpc.workspace.chat.getConversation.useQuery(
      { workspaceId, conversationId: conversationId ?? '' },
      { enabled: !!conversationId && !isAdminConversation },
    );

  const activeConversation = isAdminConversation ? adminConversation : workspaceConversation;
  const conversationLoading = isAdminConversation ? adminLoading : workspaceLoading;

  // Fetch LLM config - Admin
  const { data: adminLLMConfig } = trpc.agent.chat.getLLMConfig.useQuery(undefined, {
    enabled: isAdminConversation && !!conversationType,
  });

  // Fetch LLM config - Workspace
  const { data: workspaceLLMConfig } = trpc.workspace.chat.getLLMConfig.useQuery(
    { workspaceId },
    { enabled: !isAdminConversation && !!conversationType },
  );

  // Get the resolved model (from response or from config query)
  const resolvedModel = React.useMemo(() => {
    if (currentModel) return currentModel;
    if (isAdminConversation && adminLLMConfig?.model) return adminLLMConfig.model;
    if (!isAdminConversation && workspaceLLMConfig?.model) return workspaceLLMConfig.model;
    return null;
  }, [currentModel, isAdminConversation, adminLLMConfig?.model, workspaceLLMConfig?.model]);

  // Streaming chat hook for admin conversations
  const adminStreaming = useStreamingChat({
    onConversationCreated: (newConversationId) => {
      streamingConversationIdRef.current = newConversationId;
      onConversationCreated(newConversationId, 'SENTINEL_ADMIN');
      void utils.agent.chat.listConversations.invalidate();
      void utils.agent.chat.listAllConversations.invalidate();
    },
    onConfirmation: (confirmation) => {
      setPendingConfirmations((prev) => [
        ...prev,
        {
          confirmationId: confirmation.confirmationId,
          toolName: confirmation.toolName,
          description: confirmation.description,
          toolInput: {},
        },
      ]);
    },
    onPermissionDenied: (denial) => {
      setToolDenial(denial);
    },
    onModelReceived: (model) => {
      setCurrentModel(model);
      chatPanelStore.setCurrentModel(model);
      // Note: Don't invalidate here - tool messages aren't saved until after streaming completes
      // The .then() handler in handleSendMessage does the invalidation at the right time
    },
  });

  // Streaming chat hook for workspace conversations
  const workspaceStreaming = useStreamingChat({
    workspaceId,
    onConversationCreated: (newConversationId) => {
      streamingConversationIdRef.current = newConversationId;
      onConversationCreated(newConversationId, 'WORKSPACE_AGENT');
      void utils.workspace.chat.listConversations.invalidate({ workspaceId });
      void utils.agent.chat.listAllConversations.invalidate();
    },
    onConfirmation: (confirmation) => {
      setPendingConfirmations((prev) => [
        ...prev,
        {
          confirmationId: confirmation.confirmationId,
          toolName: confirmation.toolName,
          description: confirmation.description,
          toolInput: {},
        },
      ]);
    },
    onPermissionDenied: (denial) => {
      setToolDenial(denial);
    },
    onModelReceived: (model) => {
      setCurrentModel(model);
      chatPanelStore.setCurrentModel(model);
      // Note: Don't invalidate here - tool messages aren't saved until after streaming completes
      // The .then() handler in handleSendMessage does the invalidation at the right time
    },
  });

  // Select the appropriate streaming hook based on conversation type
  const streaming = isAdminConversation ? adminStreaming : workspaceStreaming;

  // Send message mutation - Admin
  const sendAdminMessage = trpc.agent.chat.sendMessage.useMutation({
    onMutate: () => {
      isNewConversationRef.current = !conversationId;
      chatPanelStore.setPending(conversationId);
    },
    onSuccess: (data) => {
      setLastAttemptedMessage(null);

      if (!conversationId) {
        onConversationCreated(data.conversationId, 'SENTINEL_ADMIN');
      }

      // Handle plan creation response
      if (data.planCreated) {
        // Plan was created - invalidate and let the UI show the plan
        void utils.agent.chat.listConversations.invalidate();
        void utils.agent.chat.listAllConversations.invalidate();
        void utils.agent.chat.getConversation.invalidate({ conversationId: data.conversationId });
        void utils.agent.plan.listForConversation.invalidate({
          conversationId: data.conversationId,
        });
        return;
      }

      // Normal response handling
      const newConfirmations = data.response.pendingConfirmations ?? [];

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
        setCurrentModel(data.response.model);
        chatPanelStore.setCurrentModel(data.response.model);
      }

      void utils.agent.chat.listConversations.invalidate();
      void utils.agent.chat.listAllConversations.invalidate();
      void utils.agent.chat.getConversation.invalidate({ conversationId: data.conversationId });
    },
    onSettled: (_data, _error, variables) => {
      chatPanelStore.clearPending(variables.conversationId ?? null);
    },
  });

  // Send message mutation - Workspace
  const sendWorkspaceMessage = trpc.workspace.chat.sendMessage.useMutation({
    onMutate: () => {
      isNewConversationRef.current = !conversationId;
      chatPanelStore.setPending(conversationId);
    },
    onSuccess: (data) => {
      setLastAttemptedMessage(null);

      if (!conversationId) {
        onConversationCreated(data.conversationId, 'WORKSPACE_AGENT');
      }

      // Check if plan was created - if so, skip other handling
      if ('planCreated' in data && data.planCreated) {
        // Plan created - no additional handling needed
        return;
      }

      // Update current model if provided
      if ('model' in data && data.model) {
        setCurrentModel(data.model);
        chatPanelStore.setCurrentModel(data.model);
      }

      // Handle permission denied response
      if ('permissionDenied' in data && data.permissionDenied) {
        setToolDenial(data.permissionDenied);
      }

      void utils.workspace.chat.listConversations.invalidate({ workspaceId });
      void utils.agent.chat.listAllConversations.invalidate();
      void utils.workspace.chat.getConversation.invalidate({
        workspaceId,
        conversationId: data.conversationId,
      });
    },
    onSettled: (_data, _error, variables) => {
      chatPanelStore.clearPending(variables.conversationId ?? null);
    },
  });

  // Confirm action mutation (admin only)
  const confirmAction = trpc.agent.confirmation.confirm.useMutation({
    onSuccess: (data, variables) => {
      setPendingConfirmations((prev) =>
        prev.filter((c) => c.confirmationId !== variables.confirmationId),
      );
      setConfirmingId(undefined);

      if (conversationId) {
        void utils.agent.chat.getConversation.invalidate({ conversationId });
      }

      // Invalidate admin queries
      void utils.admin.policies.list.invalidate();
      void utils.admin.users.list.invalidate();
      void utils.admin.roles.list.invalidate();
      void utils.admin.mcpServers.list.invalidate();
      void utils.admin.webhooks.list.invalidate();
      void utils.admin.agents.list.invalidate();
      void utils.admin.permissionRequests.list.invalidate();

      const result = data?.result as
        | { redirectAction?: { path: string; query?: Record<string, string> } }
        | undefined;
      if (result?.redirectAction) {
        const { path, query } = result.redirectAction;
        const searchParams = query ? new URLSearchParams(query).toString() : '';
        const fullPath = searchParams ? `${path}?${searchParams}` : path;
        navigate(fullPath);
      }
    },
    onError: () => {
      setConfirmingId(undefined);
    },
  });

  // Cancel action mutation (admin only)
  const cancelAction = trpc.agent.confirmation.cancel.useMutation({
    onSuccess: (_data, variables) => {
      setPendingConfirmations((prev) =>
        prev.filter((c) => c.confirmationId !== variables.confirmationId),
      );
      setCancellingId(undefined);

      if (conversationId) {
        void utils.agent.chat.getConversation.invalidate({ conversationId });
      }
    },
    onError: () => {
      setCancellingId(undefined);
    },
  });

  // Execute tool mutation (workspace)
  const executeWorkspaceTool = trpc.workspace.chat.executeTool.useMutation({
    onSuccess: (data, variables) => {
      setPendingConfirmations((prev) =>
        prev.filter((c) => c.confirmationId !== variables.toolUseId),
      );
      setConfirmingId(undefined);

      if (conversationId) {
        void utils.workspace.chat.getConversation.invalidate({
          workspaceId,
          conversationId,
        });
      }

      // Handle permission denied response
      if ('permissionDenied' in data && data.permissionDenied) {
        setToolDenial(data.permissionDenied);
      }
    },
    onError: () => {
      setConfirmingId(undefined);
    },
  });

  // Confirm with modified input mutation (admin only)
  const confirmWithModifiedInput = trpc.agent.confirmation.confirmWithModifiedInput.useMutation({
    onSuccess: (data, variables) => {
      if (!data.success) {
        setConfirmationError(data.error ?? 'Failed to execute action');
        if (conversationId) {
          void utils.agent.chat.getConversation.invalidate({ conversationId });
        }
        return;
      }

      setConfirmationError(null);
      setPendingConfirmations((prev) =>
        prev.filter((c) => c.confirmationId !== variables.confirmationId),
      );
      setReviewingConfirmation(null);

      if (conversationId) {
        void utils.agent.chat.getConversation.invalidate({ conversationId });
      }

      void utils.admin.policies.list.invalidate();
      void utils.admin.users.list.invalidate();
      void utils.admin.roles.list.invalidate();
      void utils.admin.mcpServers.list.invalidate();
      void utils.admin.webhooks.list.invalidate();
      void utils.admin.agents.list.invalidate();
      void utils.admin.permissionRequests.list.invalidate();

      const result = data?.result as
        | { redirectAction?: { path: string; query?: Record<string, string> } }
        | undefined;
      if (result?.redirectAction) {
        const { path, query } = result.redirectAction;
        const searchParams = query ? new URLSearchParams(query).toString() : '';
        const fullPath = searchParams ? `${path}?${searchParams}` : path;
        navigate(fullPath);
      }
    },
    onError: (error) => {
      setConfirmationError(error.message ?? 'An error occurred');
    },
  });

  // Retry from message mutation - Admin
  const retryAdminFromMessage = trpc.agent.chat.retryFromMessage.useMutation({
    onMutate: (variables) => {
      chatPanelStore.setPending(variables.conversationId);
    },
    onSuccess: (data) => {
      setMessageToRetry(null);

      // Handle plan creation response
      if (data.planCreated) {
        void utils.agent.chat.listConversations.invalidate();
        void utils.agent.chat.listAllConversations.invalidate();
        void utils.agent.chat.getConversation.invalidate({ conversationId: data.conversationId });
        void utils.agent.plan.listForConversation.invalidate({
          conversationId: data.conversationId,
        });
        return;
      }

      // Normal response handling
      if (data.response.pendingConfirmations?.length) {
        setPendingConfirmations((prev) => [...prev, ...data.response.pendingConfirmations]);
      }
      void utils.agent.chat.listConversations.invalidate();
      void utils.agent.chat.listAllConversations.invalidate();
      void utils.agent.chat.getConversation.invalidate({ conversationId: data.conversationId });
    },
    onError: () => {
      setMessageToRetry(null);
    },
    onSettled: (_data, _error, variables) => {
      chatPanelStore.clearPending(variables.conversationId);
    },
  });

  // Retry from message mutation - Workspace
  const retryWorkspaceFromMessage = trpc.workspace.chat.retryFromMessage.useMutation({
    onMutate: (variables) => {
      chatPanelStore.setPending(variables.conversationId);
    },
    onSuccess: (data) => {
      setMessageToRetry(null);

      // Check if plan was created - if so, skip other handling
      if ('planCreated' in data && data.planCreated) {
        return;
      }

      // Update current model if provided
      if ('model' in data && data.model) {
        setCurrentModel(data.model);
        chatPanelStore.setCurrentModel(data.model);
      }

      // Handle permission denied response
      if ('permissionDenied' in data && data.permissionDenied) {
        setToolDenial(data.permissionDenied);
      }

      void utils.workspace.chat.listConversations.invalidate({ workspaceId });
      void utils.agent.chat.listAllConversations.invalidate();
      void utils.workspace.chat.getConversation.invalidate({
        workspaceId,
        conversationId: data.conversationId,
      });
    },
    onError: () => {
      setMessageToRetry(null);
    },
    onSettled: (_data, _error, variables) => {
      chatPanelStore.clearPending(variables.conversationId);
    },
  });

  // Track previous conversation ID to distinguish between switching conversations vs creating new
  const prevConversationIdRef = React.useRef<string | null | undefined>(undefined);

  // Clear state when conversation changes
  React.useEffect(() => {
    const prevId = prevConversationIdRef.current;
    const isFirstRender = prevId === undefined;
    const isNewConversationCreation = prevId === null && conversationId !== null;

    // Always clear confirmations and last attempted message
    setPendingConfirmations([]);
    setLastAttemptedMessage(null);

    // Only clear model when switching between conversations (not on first render or new creation)
    // This preserves the model that was just set when a new conversation is created
    if (!isFirstRender && !isNewConversationCreation) {
      setCurrentModel(null);
    }

    prevConversationIdRef.current = conversationId;
  }, [conversationId]);

  // Reset mutation error states when starting a new chat (conversationId becomes null)
  // Use refs to avoid adding mutations/streaming to dependency array (they're unstable)
  const sendAdminMessageRef = React.useRef(sendAdminMessage);
  const sendWorkspaceMessageRef = React.useRef(sendWorkspaceMessage);
  const streamingResetRef = React.useRef(streaming.reset);
  React.useLayoutEffect(() => {
    sendAdminMessageRef.current = sendAdminMessage;
    sendWorkspaceMessageRef.current = sendWorkspaceMessage;
    streamingResetRef.current = streaming.reset;
  });

  React.useEffect(() => {
    if (conversationId === null) {
      sendAdminMessageRef.current.reset();
      sendWorkspaceMessageRef.current.reset();
      streamingResetRef.current();
    }
  }, [conversationId]);

  // Determine loading state
  const sendMessage = isAdminConversation ? sendAdminMessage : sendWorkspaceMessage;
  const retryFromMessage = isAdminConversation ? retryAdminFromMessage : retryWorkspaceFromMessage;
  const isLoading =
    sendMessage.isPending || retryFromMessage.isPending || streaming.state.isStreaming;

  // Get messages
  const messages = activeConversation?.messages ?? [];
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : null;

  // Handle user scroll
  const handleScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    userScrolledUpRef.current = !isNearBottom;
  }, []);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    if (userScrolledUpRef.current) return;
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

  // Scroll to bottom during streaming text updates
  React.useEffect(() => {
    if (streaming.state.isStreaming && !userScrolledUpRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streaming.state.streamingText, streaming.state.isStreaming]);

  // Reset scroll tracking when conversation changes
  React.useEffect(() => {
    lastMessageIdRef.current = null;
    userScrolledUpRef.current = false;
  }, [conversationId]);

  const handleSendMessage = (message: string) => {
    setLastAttemptedMessage(message);
    isNewConversationRef.current = !conversationId;
    chatPanelStore.setPending(conversationId);

    // Use streaming when supported (for both admin and workspace)
    if (streaming.supportsStreaming) {
      // Reset streaming conversation ID ref
      streamingConversationIdRef.current = conversationId;
      streaming
        .sendMessageStream({
          conversationId: conversationId ?? undefined,
          message,
          workspaceId: isAdminConversation ? undefined : workspaceId,
        })
        .then(() => {
          setLastAttemptedMessage(null);
          const convId = streamingConversationIdRef.current;
          chatPanelStore.clearPending(convId);
          // Invalidate to get the saved messages after streaming completes
          if (convId) {
            if (isAdminConversation) {
              void utils.agent.chat.getConversation.invalidate({ conversationId: convId });
            } else {
              void utils.workspace.chat.getConversation.invalidate({
                workspaceId,
                conversationId: convId,
              });
            }
          }
          streamingConversationIdRef.current = null;
        })
        .catch(() => {
          chatPanelStore.clearPending(streamingConversationIdRef.current);
          streamingConversationIdRef.current = null;
        });
    } else if (isAdminConversation) {
      // Fall back to non-streaming for admin
      sendAdminMessage.mutate({
        conversationId: conversationId ?? undefined,
        message,
        workspaceId,
      });
    } else {
      // Fall back to non-streaming for workspace
      sendWorkspaceMessage.mutate({
        workspaceId,
        conversationId: conversationId ?? undefined,
        message,
      });
    }
  };

  const handleRetry = () => {
    if (lastAttemptedMessage) {
      sendMessage.reset();
      handleSendMessage(lastAttemptedMessage);
    }
  };

  const handleDismissError = () => {
    sendMessage.reset();
    setLastAttemptedMessage(null);
  };

  const handleConfirmAction = (confirmationId: string) => {
    setConfirmingId(confirmationId);

    if (isAdminConversation) {
      confirmAction.mutate({ confirmationId });
    } else {
      // For workspace, use executeTool with the pending confirmation details
      const confirmation = pendingConfirmations.find((c) => c.confirmationId === confirmationId);
      if (confirmation && conversationId) {
        executeWorkspaceTool.mutate({
          workspaceId,
          conversationId,
          toolUseId: confirmationId,
          toolName: confirmation.toolName,
          toolInput: confirmation.toolInput,
        });
      }
    }
  };

  const handleCancelAction = (confirmationId: string) => {
    setCancellingId(confirmationId);

    if (isAdminConversation) {
      cancelAction.mutate({ confirmationId });
    } else {
      // For workspace, just remove from pending confirmations (no API call needed)
      setPendingConfirmations((prev) => prev.filter((c) => c.confirmationId !== confirmationId));
      setCancellingId(undefined);
      // Invalidate conversation to refresh
      if (conversationId) {
        void utils.workspace.chat.getConversation.invalidate({
          workspaceId,
          conversationId,
        });
      }
    }
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
    if (messageToRetry && conversationId) {
      // Use streaming retry when supported
      if (streaming.supportsStreaming) {
        chatPanelStore.setPending(conversationId);
        streaming
          .retryFromMessageStream({
            conversationId,
            messageId: messageToRetry.id,
            workspaceId: isAdminConversation ? undefined : workspaceId,
          })
          .then(() => {
            setMessageToRetry(null);
            chatPanelStore.clearPending(conversationId);
            // Invalidate to get the saved messages after streaming completes
            if (isAdminConversation) {
              void utils.agent.chat.getConversation.invalidate({ conversationId });
            } else {
              void utils.workspace.chat.getConversation.invalidate({
                workspaceId,
                conversationId,
              });
            }
          })
          .catch(() => {
            chatPanelStore.clearPending(conversationId);
            setMessageToRetry(null);
          });
      } else {
        // Fall back to non-streaming
        retryFromMessage.mutate({
          conversationId,
          messageId: messageToRetry.id,
          workspaceId,
        });
      }
    }
    setRetryDialogOpen(false);
  };

  const handleCancelRetry = () => {
    setRetryDialogOpen(false);
    setMessageToRetry(null);
  };

  // Create optimistic user message
  const optimisticUserMessage: Message | null =
    lastAttemptedMessage && isLoading
      ? {
          id: 'optimistic-user-message',
          role: 'USER',
          content: lastAttemptedMessage,
          createdAt: new Date().toISOString(),
        }
      : null;

  // Filter messages when retrying
  const messagesForDisplay: Message[] = React.useMemo(() => {
    const msgs = activeConversation?.messages ?? [];
    if (retryFromMessage.isPending && messageToRetry) {
      const retryIndex = msgs.findIndex((m) => m.id === messageToRetry.id);
      if (retryIndex !== -1) {
        return msgs.slice(0, retryIndex + 1);
      }
    }
    return msgs;
  }, [activeConversation?.messages, retryFromMessage.isPending, messageToRetry]);

  const displayMessages: Message[] = optimisticUserMessage
    ? [...messagesForDisplay, optimisticUserMessage]
    : messagesForDisplay;

  // Scroll to bottom when conversation loads or changes
  React.useEffect(() => {
    if (activeConversation?.messages?.length && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, [activeConversation?.messages?.length, conversationId]);

  // Show welcome screen when no conversation type is selected (initial state)
  if (!conversationType) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-zinc-900 shadow-2xl">
            <img src="/logo.png" alt="Sentinel" className="h-14 w-auto" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Sentinel Agent</h1>
            <p className="text-muted-foreground">
              Press <span className="font-medium text-foreground">New Chat</span> to start a
              conversation
            </p>
          </div>
          <Button onClick={onNewChat} size="lg" className="mt-4 gap-2">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Chat
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 bg-card/70 px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {conversationType === 'WORKSPACE_AGENT'
              ? 'Sentinel Agent'
              : conversationType === 'SENTINEL_ADMIN'
                ? 'Sentinel Admin Agent'
                : 'New Conversation'}
          </h1>
          {conversationType === 'SENTINEL_ADMIN' && (
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Admin
            </span>
          )}
          {resolvedModel && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {resolvedModel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canPopout && conversationType === 'SENTINEL_ADMIN' && conversationId && (
            <Button variant="ghost" size="sm" onClick={onPopout} className="gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Pop Out
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onNewChat}>
            New Chat
          </Button>
        </div>
      </div>

      {/* Chat Content */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
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
                description={
                  isAdminConversation
                    ? 'Ask me about policies, users, audit logs, or anything else.'
                    : 'Ask me to help with workspace tools and MCP servers.'
                }
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
                      item.message.role === 'USER' && item.message.id !== 'optimistic-user-message'
                        ? () => handleRetryFromMessage(item.message.id, item.message.content)
                        : undefined
                    }
                    isRetrying={
                      retryFromMessage.isPending && messageToRetry?.id === item.message.id
                    }
                    isAdmin={isAdminConversation}
                  />
                ) : (
                  <ToolCallsDisplay key={`tools-${item.afterMessageId}`} tools={item.tools} />
                ),
              )
            )}
            {/* Show streaming message when streaming is active */}
            {streaming.state.isStreaming && (
              <StreamingMessage
                text={streaming.state.streamingText}
                isStreaming={streaming.state.isStreaming}
                activeTools={streaming.state.activeTools}
                isAdmin={isAdminConversation}
              />
            )}
            {/* Show thinking indicator for non-streaming loading */}
            {isLoading && !streaming.state.isStreaming && (
              <AgentThinking isAdmin={isAdminConversation} />
            )}
            {/* Show plans for this conversation */}
            {conversationId && isAdminConversation && <PlanList conversationId={conversationId} />}
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
            {streaming.state.error && (
              <ErrorDisplay
                message={streaming.state.error}
                onRetry={handleRetry}
                onDismiss={() => streaming.reset()}
              />
            )}
            {/* Tool denial card - shown when a tool is denied by policy */}
            {(toolDenial ?? streaming.state.permissionDenied) && (
              <div className="mx-4 my-3">
                <ToolDenialCard
                  denial={(toolDenial ?? streaming.state.permissionDenied)!}
                  workspaceId={workspaceId}
                  isAdmin={isAdmin}
                  onClose={() => {
                    setToolDenial(null);
                    streaming.reset();
                  }}
                />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSendMessage} isLoading={isLoading} disabled={isLoading} />

      {/* Dialogs */}
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

      {/* Policy Review Modals (admin only) */}
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
    </div>
  );
}
