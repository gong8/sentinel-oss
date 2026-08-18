/**
 * Agent Page View Component
 * Main full-screen view combining sidebar and chat area
 */

import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';

import { trpc } from '../../lib/trpc';
import { chatPanelStore } from '../agent/chatPanelStore';

import { AgentChatArea } from './AgentChatArea';
import { AgentConversationSidebar } from './AgentConversationSidebar';
import { AgentLayout } from './AgentLayout';
import { NewChatModal } from './NewChatModal';

import type { ConversationType } from '../agent/shared/types';

interface AgentPageViewProps {
  workspaceId: string;
  workspaceSlug: string;
  isAdmin: boolean;
}

export function AgentPageView({ workspaceId, workspaceSlug, isAdmin }: AgentPageViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();

  // Check for conversation ID passed from popout panel returning to fullscreen
  const restoreConversationId = (location.state as { restoreConversationId?: string } | null)
    ?.restoreConversationId;

  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(
    restoreConversationId ?? null,
  );
  const [activeConversationType, setActiveConversationType] =
    React.useState<ConversationType | null>(
      // If restoring from popout, it was a SENTINEL_ADMIN conversation
      restoreConversationId ? 'SENTINEL_ADMIN' : null,
    );
  const [newChatModalOpen, setNewChatModalOpen] = React.useState(false);

  // Clear the navigation state after reading it to prevent re-restoration on refresh
  React.useEffect(() => {
    if (restoreConversationId) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [restoreConversationId, navigate, location.pathname]);

  // Delete conversation mutations
  const deleteAdminConversation = trpc.agent.chat.deleteConversation.useMutation({
    onSuccess: () => {
      setActiveConversationId(null);
      setActiveConversationType(null);
      void utils.agent.chat.listConversations.invalidate();
      void utils.agent.chat.listAllConversations.invalidate();
    },
  });

  const deleteWorkspaceConversation = trpc.workspace.chat.deleteConversation.useMutation({
    onSuccess: () => {
      setActiveConversationId(null);
      setActiveConversationType(null);
      void utils.workspace.chat.listConversations.invalidate({ workspaceId });
      void utils.agent.chat.listAllConversations.invalidate();
    },
  });

  // Handle selecting a conversation
  const handleSelectConversation = (id: string, type: ConversationType) => {
    setActiveConversationId(id);
    setActiveConversationType(type);
  };

  // Handle new chat button
  const handleNewChat = () => {
    if (isAdmin) {
      // For admins, show the type selection modal
      setNewChatModalOpen(true);
    } else {
      // For users, directly start a workspace conversation
      setActiveConversationId(null);
      setActiveConversationType('WORKSPACE_AGENT');
    }
  };

  // Handle new chat type selection (admin only)
  const handleNewChatTypeSelect = (type: ConversationType) => {
    setActiveConversationId(null);
    setActiveConversationType(type);
  };

  // Handle conversation creation
  const handleConversationCreated = (id: string, type: ConversationType) => {
    setActiveConversationId(id);
    setActiveConversationType(type);
  };

  // Handle conversation deletion
  const handleDeleteConversation = (id: string, type: ConversationType) => {
    if (type === 'SENTINEL_ADMIN') {
      deleteAdminConversation.mutate({ conversationId: id });
    } else {
      deleteWorkspaceConversation.mutate({ workspaceId, conversationId: id });
    }
  };

  // Handle pop-out (admin only) - enables floating panel and navigates to dashboard
  const handlePopout = () => {
    if (activeConversationId && activeConversationType === 'SENTINEL_ADMIN') {
      chatPanelStore.setPopoutMode(true, activeConversationId);
      // Navigate to dashboard so user can multitask with floating panel
      navigate(`/admin/${workspaceSlug}`);
    }
  };

  return (
    <AgentLayout>
      <AgentConversationSidebar
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        isAdmin={isAdmin}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />
      <AgentChatArea
        conversationId={activeConversationId}
        conversationType={activeConversationType}
        workspaceId={workspaceId}
        onConversationCreated={handleConversationCreated}
        onNewChat={handleNewChat}
        canPopout={isAdmin}
        onPopout={handlePopout}
      />

      {/* New Chat Modal (admin only) */}
      {isAdmin && (
        <NewChatModal
          open={newChatModalOpen}
          onOpenChange={setNewChatModalOpen}
          onSelect={handleNewChatTypeSelect}
        />
      )}
    </AgentLayout>
  );
}
