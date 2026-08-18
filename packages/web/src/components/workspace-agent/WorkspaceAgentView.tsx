/**
 * Workspace Agent View
 * Full-page chat layout with conversation sidebar
 */

import { Bot } from 'lucide-react';
import * as React from 'react';
import { useLocation } from 'react-router';

import { useWorkspace } from '../../hooks/WorkspaceContext';
import { trpc } from '../../lib/trpc';
import { AdminChatBanner } from './AdminChatBanner';
import { ChatInput } from './ChatInput';
import { ChatMessages } from './ChatMessages';
import { ConversationSidebar } from './ConversationSidebar';
import { ToolConfirmationDialog } from './ToolConfirmationDialog';

interface WorkspaceAgentViewProps {
  workspaceId: string;
}

interface PendingToolCall {
  toolUseId: string;
  toolName: string;
  parameters?: unknown;
  classification: {
    name: string;
    type: 'read' | 'write';
    isSensitive: boolean;
    requiresConfirmation: boolean;
  };
}

export function WorkspaceAgentView({ workspaceId }: WorkspaceAgentViewProps) {
  const location = useLocation();
  const { selectedWorkspaceSlug } = useWorkspace();

  // Determine if we're in admin or user mode based on URL
  const routeType = location.pathname.startsWith('/admin/') ? 'admin' : 'user';
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [pendingToolCall, setPendingToolCall] = React.useState<PendingToolCall | null>(null);
  const [localMessages, setLocalMessages] = React.useState<
    Array<{ role: 'user' | 'assistant'; content: string; id: string }>
  >([]);
  const utils = trpc.useUtils();

  // Use safe workspaceId to prevent queries from running with null/undefined
  const safeWorkspaceId = workspaceId || '';

  // Fetch chat settings to check if admin visibility is enabled
  const { data: settings } = trpc.workspace.chatSettings.get.useQuery(
    { workspaceId: safeWorkspaceId },
    { enabled: Boolean(workspaceId) },
  );

  // Fetch conversations
  const { data: conversationsData, isLoading: isLoadingConversations } =
    trpc.workspace.chat.listConversations.useQuery(
      {
        workspaceId: safeWorkspaceId,
        limit: 50,
      },
      { enabled: Boolean(workspaceId) },
    );

  // Fetch active conversation messages
  const { data: activeConversation, isLoading: isLoadingMessages } =
    trpc.workspace.chat.getConversation.useQuery(
      { workspaceId: safeWorkspaceId, conversationId: activeConversationId ?? '' },
      { enabled: !!activeConversationId && Boolean(workspaceId) },
    );

  // Send message mutation
  const sendMessageMutation = trpc.workspace.chat.sendMessage.useMutation({
    onSuccess: (response) => {
      // Update active conversation if it was created
      if (!activeConversationId && response.conversationId) {
        setActiveConversationId(response.conversationId);
      }

      // Check if plan was created
      if ('planCreated' in response && response.planCreated) {
        // Plan created - add a message indicating this
        setLocalMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.text, id: response.planId },
        ]);
      } else {
        // Normal message response
        setLocalMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.text, id: response.conversationId },
        ]);
      }

      // Invalidate queries
      utils.workspace.chat.listConversations.invalidate({ workspaceId });
      if (activeConversationId) {
        utils.workspace.chat.getConversation.invalidate({
          workspaceId,
          conversationId: activeConversationId,
        });
      }
    },
  });

  // Execute tool mutation
  const executeToolMutation = trpc.workspace.chat.executeTool.useMutation({
    onSuccess: (response) => {
      setPendingToolCall(null);

      // Add assistant response (use conversationId as fallback for id)
      setLocalMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.text, id: response.conversationId },
      ]);

      // Invalidate
      if (activeConversationId) {
        utils.workspace.chat.getConversation.invalidate({
          workspaceId,
          conversationId: activeConversationId,
        });
      }
    },
  });

  // Delete conversation mutation
  const deleteConversationMutation = trpc.workspace.chat.deleteConversation.useMutation({
    onSuccess: () => {
      if (activeConversationId) {
        setActiveConversationId(null);
        setLocalMessages([]);
      }
      utils.workspace.chat.listConversations.invalidate({ workspaceId });
    },
  });

  const handleSendMessage = (message: string) => {
    // Add user message to local messages immediately
    setLocalMessages((prev) => [
      ...prev,
      { role: 'user', content: message, id: `temp-${Date.now()}` },
    ]);

    sendMessageMutation.mutate({
      workspaceId,
      conversationId: activeConversationId ?? undefined,
      message,
    });
  };

  const handleToolConfirm = (alwaysAllow: boolean) => {
    if (!pendingToolCall || !activeConversationId) return;

    executeToolMutation.mutate({
      workspaceId,
      conversationId: activeConversationId,
      toolUseId: pendingToolCall.toolUseId,
      toolName: pendingToolCall.toolName,
      toolInput: pendingToolCall.parameters,
      alwaysAllow,
    });
  };

  const handleToolCancel = () => {
    setPendingToolCall(null);
    // Add a cancelled message
    setLocalMessages((prev) => [
      ...prev,
      { role: 'assistant', content: 'Tool execution cancelled.', id: `cancelled-${Date.now()}` },
    ]);
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setLocalMessages([]);
    setPendingToolCall(null);
  };

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setLocalMessages([]);
    setPendingToolCall(null);
  };

  const handleDeleteConversation = (conversationId: string) => {
    deleteConversationMutation.mutate({ workspaceId, conversationId });
  };

  // Define message type for display
  type DisplayMessage = { role: 'user' | 'assistant'; content: string; id: string };

  // Extract messages from active conversation for stable reference
  const conversationMessages = activeConversation?.messages;

  // Combine server messages with local messages for display
  const displayMessages = React.useMemo((): DisplayMessage[] => {
    if (!conversationMessages) {
      return localMessages;
    }

    // Map server messages with explicit type
    const serverMessages: DisplayMessage[] = [];
    for (const m of conversationMessages) {
      if (m.role === 'USER' || m.role === 'ASSISTANT') {
        serverMessages.push({
          role: m.role === 'USER' ? 'user' : 'assistant',
          content: m.content,
          id: m.id,
        });
      }
    }

    // Find messages not yet on server
    const serverMessageIds = new Set(serverMessages.map((m) => m.id));
    const newLocalMessages = localMessages.filter((m) => !serverMessageIds.has(m.id));

    return [...serverMessages, ...newLocalMessages];
  }, [conversationMessages, localMessages]);

  const isLoading = sendMessageMutation.isPending || executeToolMutation.isPending;

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden">
      {/* Conversation Sidebar */}
      <ConversationSidebar
        conversations={conversationsData?.items ?? []}
        selectedId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        isLoading={isLoadingConversations}
        settingsPath={`/${routeType}/${selectedWorkspaceSlug}/agent/settings`}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Admin visibility banner */}
        {settings?.adminChatVisibility && <AdminChatBanner />}

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          {isLoadingMessages && activeConversationId ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Sentinel Agent</h2>
              <p className="text-muted-foreground max-w-md">
                Ask me anything about your workspace. I can help you manage MCP tools, search
                documentation, and more.
              </p>
            </div>
          ) : (
            <ChatMessages messages={displayMessages} isLoading={isLoading} />
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSendMessage}
          disabled={isLoading}
          isLoading={isLoading}
          placeholder="Ask about MCP tools, policies, or anything else..."
        />
      </div>

      {/* Tool Confirmation Dialog */}
      <ToolConfirmationDialog
        open={!!pendingToolCall}
        toolName={pendingToolCall?.toolName ?? ''}
        parameters={pendingToolCall?.parameters}
        onConfirm={handleToolConfirm}
        onCancel={handleToolCancel}
        isLoading={executeToolMutation.isPending}
      />
    </div>
  );
}
